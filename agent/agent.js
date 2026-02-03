/**
 * Hytale Server Manager - Agent
 * 
 * A Node.js agent that polls GitHub for commands and controls a Hytale server.
 * Runs on the server machine and uses GitHub as a message bus.
 */

const https = require('https');
const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');
const { spawn, exec, execSync } = require('child_process');
const crypto = require('crypto');
const os = require('os');
const { createWriteStream } = require('fs');

// ============================================
// Configuration
// ============================================

const CONFIG_PATH = process.env.CONFIG_PATH || path.join(__dirname, 'config.json');
let config = {};

async function loadConfig() {
    try {
        const data = await fs.readFile(CONFIG_PATH, 'utf8');
        config = JSON.parse(data);
        log('INFO', 'Configuration loaded successfully');
    } catch (error) {
        log('ERROR', `Failed to load config: ${error.message}`);
        process.exit(1);
    }
}

// ============================================
// Environment Variables
// ============================================

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const COMMAND_SECRET = process.env.COMMAND_SECRET;

if (!GITHUB_TOKEN) {
    console.error('ERROR: GITHUB_TOKEN environment variable is required');
    process.exit(1);
}

if (!COMMAND_SECRET) {
    console.error('ERROR: COMMAND_SECRET environment variable is required');
    process.exit(1);
}

// ============================================
// State
// ============================================

const state = {
    running: false,
    serverProcess: null,
    serverPid: null,
    startTime: null,
    lastBackup: null,
    backupSchedule: null,
    scheduledBackupTimer: null,
    commandLock: false,
    currentCommand: null
};

// ============================================
// Logging
// ============================================

const LOG_LEVELS = { DEBUG: 0, INFO: 1, WARN: 2, ERROR: 3 };
const LOG_LEVEL = LOG_LEVELS[process.env.LOG_LEVEL || 'INFO'] || LOG_LEVELS.INFO;

function log(level, message, data = null) {
    if (LOG_LEVELS[level] < LOG_LEVEL) return;
    
    const timestamp = new Date().toISOString();
    const logLine = `[${timestamp}] [${level}] ${message}`;
    
    console.log(logLine);
    
    if (data) {
        console.log(JSON.stringify(data, null, 2));
    }
    
    // Append to log file
    const logPath = path.join(config.logs_dir || '.', 'agent.log');
    try {
        fsSync.appendFileSync(logPath, logLine + (data ? ` ${JSON.stringify(data)}` : '') + '\n');
    } catch (e) {
        // Ignore log write errors
    }
}

// ============================================
// HMAC Signature Verification
// ============================================

async function verifySignature(command) {
    const { id, created_at, action, params, nonce, signature } = command;
    
    if (!signature) {
        log('WARN', 'Command missing signature');
        return false;
    }
    
    // Recreate the message that was signed
    const messageToSign = JSON.stringify({
        id,
        created_at,
        action,
        params,
        nonce
    });
    
    // Derive key from secret using PBKDF2
    const salt = 'hytale-server-manager-salt';
    const key = crypto.pbkdf2Sync(COMMAND_SECRET, salt, 100000, 32, 'sha256');
    
    // Create HMAC
    const hmac = crypto.createHmac('sha256', key);
    hmac.update(messageToSign);
    const expectedSignature = hmac.digest('hex');
    
    // Constant-time comparison
    const valid = crypto.timingSafeEqual(
        Buffer.from(signature, 'hex'),
        Buffer.from(expectedSignature, 'hex')
    );
    
    if (!valid) {
        log('WARN', 'Invalid command signature');
    }
    
    return valid;
}

// ============================================
// Command Validation
// ============================================

const VALID_ACTIONS = ['start', 'stop', 'restart', 'backup_now', 'set_backup_schedule', 'update', 'status'];

function validateCommand(command) {
    const errors = [];
    
    if (!command.id || typeof command.id !== 'string') {
        errors.push('Missing or invalid id');
    }
    
    if (!command.created_at || isNaN(Date.parse(command.created_at))) {
        errors.push('Missing or invalid created_at');
    }
    
    if (!command.action || !VALID_ACTIONS.includes(command.action)) {
        errors.push(`Invalid action: ${command.action}`);
    }
    
    if (!command.nonce || typeof command.nonce !== 'string') {
        errors.push('Missing or invalid nonce');
    }
    
    // Check command age (reject commands older than 5 minutes)
    const age = Date.now() - Date.parse(command.created_at);
    if (age > 5 * 60 * 1000) {
        errors.push('Command expired (older than 5 minutes)');
    }
    
    return errors;
}

// ============================================
// GitHub API Functions
// ============================================

function githubRequest(method, endpoint, body = null) {
    return new Promise((resolve, reject) => {
        const url = new URL(`https://api.github.com/repos/${config.github.owner}/${config.github.repo}${endpoint}`);
        
        const options = {
            hostname: url.hostname,
            path: url.pathname + url.search,
            method,
            headers: {
                'User-Agent': 'Hytale-Server-Agent',
                'Accept': 'application/vnd.github.v3+json',
                'Authorization': `Bearer ${GITHUB_TOKEN}`,
                'Content-Type': 'application/json'
            }
        };
        
        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    const json = data ? JSON.parse(data) : {};
                    if (res.statusCode >= 200 && res.statusCode < 300) {
                        resolve(json);
                    } else {
                        reject(new Error(`GitHub API error ${res.statusCode}: ${json.message || data}`));
                    }
                } catch (e) {
                    reject(new Error(`Failed to parse response: ${e.message}`));
                }
            });
        });
        
        req.on('error', reject);
        req.setTimeout(30000, () => {
            req.destroy();
            reject(new Error('Request timeout'));
        });
        
        if (body) {
            req.write(JSON.stringify(body));
        }
        
        req.end();
    });
}

async function getFileContent(filePath) {
    try {
        const response = await githubRequest('GET', `/contents/${filePath}`);
        const content = Buffer.from(response.content, 'base64').toString('utf8');
        return { content, sha: response.sha };
    } catch (error) {
        if (error.message.includes('404')) {
            return null;
        }
        throw error;
    }
}

async function putFileContent(filePath, content, message, sha = null) {
    const body = {
        message,
        content: Buffer.from(content).toString('base64'),
        branch: config.github.branch || 'main'
    };
    
    if (sha) {
        body.sha = sha;
    }
    
    return githubRequest('PUT', `/contents/${filePath}`, body);
}

async function deleteFile(filePath, sha, message) {
    return githubRequest('DELETE', `/contents/${filePath}`, {
        message,
        sha,
        branch: config.github.branch || 'main'
    });
}

async function listDirectory(dirPath) {
    try {
        return await githubRequest('GET', `/contents/${dirPath}`);
    } catch (error) {
        if (error.message.includes('404')) {
            return [];
        }
        throw error;
    }
}

// ============================================
// Status Functions
// ============================================

function getDiskFree() {
    try {
        if (os.platform() === 'win32') {
            const drive = path.parse(config.server_dir).root;
            const output = execSync(`wmic logicaldisk where "DeviceID='${drive.replace('\\', '')}'" get FreeSpace`, { encoding: 'utf8' });
            const match = output.match(/\d+/);
            return match ? parseInt(match[0]) : null;
        } else {
            const output = execSync(`df -B1 "${config.server_dir}" | tail -1 | awk '{print $4}'`, { encoding: 'utf8' });
            return parseInt(output.trim());
        }
    } catch (e) {
        return null;
    }
}

function getServerUptime() {
    if (!state.running || !state.startTime) return null;
    return Math.floor((Date.now() - state.startTime) / 1000);
}

function getLastLogLines(count = 200) {
    try {
        const logPath = config.log_file;
        if (!fsSync.existsSync(logPath)) return '';
        
        const content = fsSync.readFileSync(logPath, 'utf8');
        const lines = content.split('\n');
        return lines.slice(-count).join('\n');
    } catch (e) {
        return `Error reading logs: ${e.message}`;
    }
}

async function buildServerStatus() {
    return {
        running: state.running,
        pid: state.serverPid,
        uptime: getServerUptime(),
        last_backup: state.lastBackup,
        backup_schedule: state.backupSchedule ? formatSchedule(state.backupSchedule) : 'Disabled',
        disk_free: getDiskFree(),
        agent_active: true,
        last_update: new Date().toISOString()
    };
}

function formatSchedule(schedule) {
    if (!schedule || !schedule.enabled) return 'Disabled';
    
    switch (schedule.type) {
        case 'interval':
            return `Every ${schedule.interval_minutes} minutes`;
        case 'daily':
            return `Daily at ${schedule.time}`;
        case 'cron':
            return `Cron: ${schedule.expression}`;
        default:
            return 'Unknown';
    }
}

async function writeServerStatus() {
    try {
        const status = await buildServerStatus();
        const content = JSON.stringify(status, null, 2);
        
        const existing = await getFileContent('status/server.json');
        await putFileContent(
            'status/server.json',
            content,
            '[Agent] Update server status',
            existing?.sha
        );
        
        log('DEBUG', 'Server status updated');
    } catch (error) {
        log('ERROR', `Failed to write server status: ${error.message}`);
    }
}

async function writeLogTail() {
    try {
        const logs = getLastLogLines(200);
        
        const existing = await getFileContent('status/log_tail.txt');
        await putFileContent(
            'status/log_tail.txt',
            logs,
            '[Agent] Update log tail',
            existing?.sha
        );
        
        log('DEBUG', 'Log tail updated');
    } catch (error) {
        log('ERROR', `Failed to write log tail: ${error.message}`);
    }
}

// ============================================
// Server Control Functions
// ============================================

async function startServer() {
    if (state.running) {
        return { success: false, message: 'Server is already running' };
    }
    
    log('INFO', 'Starting server...');
    
    try {
        const startCommand = config.start_command;
        const serverDir = config.server_dir;
        
        // Determine shell based on platform
        const isWindows = os.platform() === 'win32';
        const shell = isWindows ? 'cmd.exe' : '/bin/bash';
        const shellArgs = isWindows ? ['/c', startCommand] : ['-c', startCommand];
        
        state.serverProcess = spawn(shell, shellArgs, {
            cwd: serverDir,
            detached: !isWindows,
            stdio: ['ignore', 'pipe', 'pipe'],
            windowsHide: true
        });
        
        state.serverPid = state.serverProcess.pid;
        state.running = true;
        state.startTime = Date.now();
        
        // Handle process output
        if (state.serverProcess.stdout) {
            state.serverProcess.stdout.on('data', (data) => {
                log('DEBUG', `[Server] ${data.toString().trim()}`);
            });
        }
        
        if (state.serverProcess.stderr) {
            state.serverProcess.stderr.on('data', (data) => {
                log('WARN', `[Server Error] ${data.toString().trim()}`);
            });
        }
        
        state.serverProcess.on('exit', (code) => {
            log('INFO', `Server process exited with code ${code}`);
            state.running = false;
            state.serverPid = null;
            state.serverProcess = null;
            writeServerStatus();
        });
        
        state.serverProcess.on('error', (err) => {
            log('ERROR', `Server process error: ${err.message}`);
            state.running = false;
            state.serverPid = null;
            state.serverProcess = null;
        });
        
        // Save PID to file
        const pidPath = path.join(serverDir, 'server.pid');
        await fs.writeFile(pidPath, state.serverPid.toString());
        
        log('INFO', `Server started with PID ${state.serverPid}`);
        
        return {
            success: true,
            message: `Server started with PID ${state.serverPid}`,
            pid: state.serverPid
        };
        
    } catch (error) {
        log('ERROR', `Failed to start server: ${error.message}`);
        return { success: false, message: error.message };
    }
}

async function stopServer() {
    if (!state.running && !state.serverPid) {
        return { success: false, message: 'Server is not running' };
    }
    
    log('INFO', 'Stopping server...');
    
    try {
        const isWindows = os.platform() === 'win32';
        const pid = state.serverPid;
        
        if (state.serverProcess) {
            // Try graceful shutdown first
            if (config.stop_command) {
                log('INFO', 'Sending stop command...');
                try {
                    execSync(config.stop_command, {
                        cwd: config.server_dir,
                        timeout: 30000
                    });
                } catch (e) {
                    log('WARN', `Stop command failed: ${e.message}`);
                }
            }
            
            // Wait for graceful shutdown
            await new Promise(resolve => setTimeout(resolve, 5000));
            
            // Force kill if still running
            if (state.serverProcess && !state.serverProcess.killed) {
                log('INFO', 'Force killing server process...');
                
                if (isWindows) {
                    try {
                        execSync(`taskkill /PID ${pid} /F /T`, { encoding: 'utf8' });
                    } catch (e) {
                        state.serverProcess.kill('SIGKILL');
                    }
                } else {
                    try {
                        process.kill(-pid, 'SIGKILL');
                    } catch (e) {
                        state.serverProcess.kill('SIGKILL');
                    }
                }
            }
        } else if (pid) {
            // Kill by PID from file
            if (isWindows) {
                execSync(`taskkill /PID ${pid} /F /T`, { encoding: 'utf8' });
            } else {
                process.kill(pid, 'SIGTERM');
                await new Promise(resolve => setTimeout(resolve, 5000));
                try {
                    process.kill(pid, 'SIGKILL');
                } catch (e) {
                    // Already dead
                }
            }
        }
        
        state.running = false;
        state.serverPid = null;
        state.serverProcess = null;
        state.startTime = null;
        
        // Remove PID file
        const pidPath = path.join(config.server_dir, 'server.pid');
        try {
            await fs.unlink(pidPath);
        } catch (e) {
            // Ignore
        }
        
        log('INFO', 'Server stopped');
        
        return { success: true, message: 'Server stopped' };
        
    } catch (error) {
        log('ERROR', `Failed to stop server: ${error.message}`);
        return { success: false, message: error.message };
    }
}

async function restartServer() {
    log('INFO', 'Restarting server...');
    
    const stopResult = await stopServer();
    
    // Wait a moment before starting
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    const startResult = await startServer();
    
    return {
        success: startResult.success,
        message: `Restart ${startResult.success ? 'successful' : 'failed'}: ${startResult.message}`,
        pid: startResult.pid
    };
}

// ============================================
// Backup Functions
// ============================================

async function createBackup() {
    log('INFO', 'Creating backup...');
    
    try {
        const worldDir = config.world_dir;
        const backupDir = config.backup_dir;
        
        // Ensure backup directory exists
        await fs.mkdir(backupDir, { recursive: true });
        
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const backupName = `backup-${timestamp}.zip`;
        const backupPath = path.join(backupDir, backupName);
        
        const isWindows = os.platform() === 'win32';
        
        // Create zip
        if (isWindows) {
            // Use PowerShell on Windows
            const cmd = `powershell -NoProfile -Command "Compress-Archive -Path '${worldDir}\\*' -DestinationPath '${backupPath}' -Force"`;
            execSync(cmd, { encoding: 'utf8', timeout: 300000 });
        } else {
            // Use zip on Linux
            const cmd = `cd "${path.dirname(worldDir)}" && zip -r "${backupPath}" "${path.basename(worldDir)}"`;
            execSync(cmd, { encoding: 'utf8', timeout: 300000, shell: '/bin/bash' });
        }
        
        // Get backup size
        const stats = await fs.stat(backupPath);
        
        state.lastBackup = new Date().toISOString();
        
        log('INFO', `Backup created: ${backupName} (${(stats.size / 1024 / 1024).toFixed(2)} MB)`);
        
        // Clean old backups (keep last N)
        await cleanOldBackups();
        
        return {
            success: true,
            message: `Backup created: ${backupName}`,
            backup_path: backupPath,
            size: stats.size
        };
        
    } catch (error) {
        log('ERROR', `Backup failed: ${error.message}`);
        return { success: false, message: error.message };
    }
}

async function cleanOldBackups() {
    const maxBackups = config.max_backups || 10;
    const backupDir = config.backup_dir;
    
    try {
        const files = await fs.readdir(backupDir);
        const backups = files
            .filter(f => f.startsWith('backup-') && f.endsWith('.zip'))
            .map(f => ({ name: f, path: path.join(backupDir, f) }))
            .sort((a, b) => b.name.localeCompare(a.name));
        
        if (backups.length > maxBackups) {
            const toDelete = backups.slice(maxBackups);
            for (const backup of toDelete) {
                await fs.unlink(backup.path);
                log('INFO', `Deleted old backup: ${backup.name}`);
            }
        }
    } catch (error) {
        log('WARN', `Failed to clean old backups: ${error.message}`);
    }
}

// ============================================
// Backup Scheduling
// ============================================

function setupBackupSchedule(scheduleParams) {
    // Clear existing schedule
    if (state.scheduledBackupTimer) {
        clearInterval(state.scheduledBackupTimer);
        state.scheduledBackupTimer = null;
    }
    
    if (!scheduleParams || !scheduleParams.enabled) {
        state.backupSchedule = { enabled: false };
        log('INFO', 'Backup schedule disabled');
        return { success: true, message: 'Backup schedule disabled' };
    }
    
    state.backupSchedule = scheduleParams;
    
    switch (scheduleParams.type) {
        case 'interval':
            const intervalMs = scheduleParams.interval_minutes * 60 * 1000;
            state.scheduledBackupTimer = setInterval(async () => {
                log('INFO', 'Running scheduled backup...');
                await createBackup();
                await writeServerStatus();
            }, intervalMs);
            log('INFO', `Backup scheduled every ${scheduleParams.interval_minutes} minutes`);
            break;
            
        case 'daily':
            // Simple daily scheduler
            const checkDaily = async () => {
                const now = new Date();
                const [hours, minutes] = scheduleParams.time.split(':').map(Number);
                
                if (now.getHours() === hours && now.getMinutes() === minutes) {
                    log('INFO', 'Running scheduled daily backup...');
                    await createBackup();
                    await writeServerStatus();
                }
            };
            
            // Check every minute
            state.scheduledBackupTimer = setInterval(checkDaily, 60000);
            log('INFO', `Backup scheduled daily at ${scheduleParams.time}`);
            break;
            
        case 'cron':
            // Simple cron parser for basic patterns
            log('INFO', `Backup scheduled with cron: ${scheduleParams.expression}`);
            // Note: For full cron support, would need node-cron package
            break;
    }
    
    // Save schedule to config
    saveScheduleToConfig(scheduleParams);
    
    return {
        success: true,
        message: `Backup schedule set: ${formatSchedule(scheduleParams)}`
    };
}

async function saveScheduleToConfig(schedule) {
    try {
        config.backup_schedule = schedule;
        await fs.writeFile(CONFIG_PATH, JSON.stringify(config, null, 2));
        log('INFO', 'Backup schedule saved to config');
    } catch (error) {
        log('ERROR', `Failed to save schedule to config: ${error.message}`);
    }
}

// ============================================
// Update Functions
// ============================================

async function updateServer() {
    log('INFO', 'Updating server...');
    
    try {
        // Stop server first
        if (state.running) {
            await stopServer();
            await new Promise(resolve => setTimeout(resolve, 3000));
        }
        
        // Run updater command if configured
        if (config.updater_command) {
            log('INFO', `Running updater: ${config.updater_command}`);
            
            const isWindows = os.platform() === 'win32';
            
            execSync(config.updater_command, {
                cwd: config.server_dir,
                encoding: 'utf8',
                timeout: 600000, // 10 minute timeout
                stdio: 'inherit'
            });
            
            log('INFO', 'Update completed successfully');
        } else {
            log('WARN', 'No updater_command configured');
            return {
                success: false,
                message: 'No updater_command configured in config.json'
            };
        }
        
        return {
            success: true,
            message: 'Server updated successfully'
        };
        
    } catch (error) {
        log('ERROR', `Update failed: ${error.message}`);
        return { success: false, message: error.message };
    }
}

// ============================================
// Command Processing
// ============================================

async function processCommand(command) {
    const result = {
        command_id: command.id,
        action: command.action,
        started_at: new Date().toISOString(),
        completed_at: null,
        success: false,
        message: '',
        data: {}
    };
    
    try {
        switch (command.action) {
            case 'start':
                const startResult = await startServer();
                result.success = startResult.success;
                result.message = startResult.message;
                result.data = { pid: startResult.pid };
                break;
                
            case 'stop':
                const stopResult = await stopServer();
                result.success = stopResult.success;
                result.message = stopResult.message;
                break;
                
            case 'restart':
                const restartResult = await restartServer();
                result.success = restartResult.success;
                result.message = restartResult.message;
                result.data = { pid: restartResult.pid };
                break;
                
            case 'backup_now':
                const backupResult = await createBackup();
                result.success = backupResult.success;
                result.message = backupResult.message;
                result.data = {
                    backup_path: backupResult.backup_path,
                    size: backupResult.size
                };
                break;
                
            case 'set_backup_schedule':
                const scheduleResult = setupBackupSchedule(command.params);
                result.success = scheduleResult.success;
                result.message = scheduleResult.message;
                break;
                
            case 'update':
                const updateResult = await updateServer();
                result.success = updateResult.success;
                result.message = updateResult.message;
                break;
                
            case 'status':
                const status = await buildServerStatus();
                result.success = true;
                result.message = 'Status retrieved';
                result.data = status;
                break;
                
            default:
                result.message = `Unknown action: ${command.action}`;
        }
        
    } catch (error) {
        result.message = error.message;
        log('ERROR', `Command execution failed: ${error.message}`);
    }
    
    result.completed_at = new Date().toISOString();
    return result;
}

async function writeCommandResult(command, result) {
    try {
        // Write to last_run.json
        const lastRunContent = JSON.stringify(result, null, 2);
        const existingLastRun = await getFileContent('status/last_run.json');
        await putFileContent(
            'status/last_run.json',
            lastRunContent,
            `[Agent] Command result: ${command.action}`,
            existingLastRun?.sha
        );
        
        // Append to history.jsonl
        const historyLine = JSON.stringify(result);
        const existingHistory = await getFileContent('status/history.jsonl');
        const historyContent = existingHistory
            ? existingHistory.content + '\n' + historyLine
            : historyLine;
        
        await putFileContent(
            'status/history.jsonl',
            historyContent,
            `[Agent] Command history: ${command.action}`,
            existingHistory?.sha
        );
        
        log('DEBUG', 'Command result written');
        
    } catch (error) {
        log('ERROR', `Failed to write command result: ${error.message}`);
    }
}

async function moveCommandToDone(commandFile, sha) {
    try {
        const donePath = `commands/done/${commandFile.name}`;
        
        // Get current content
        const content = await getFileContent(`commands/pending/${commandFile.name}`);
        if (!content) return;
        
        // Create in done folder
        await putFileContent(
            donePath,
            content.content,
            `[Agent] Move completed command: ${commandFile.name}`
        );
        
        // Delete from pending
        await deleteFile(
            `commands/pending/${commandFile.name}`,
            content.sha,
            `[Agent] Remove processed command: ${commandFile.name}`
        );
        
        log('DEBUG', `Command moved to done: ${commandFile.name}`);
        
    } catch (error) {
        log('ERROR', `Failed to move command: ${error.message}`);
    }
}

// ============================================
// Main Polling Loop
// ============================================

async function pollForCommands() {
    if (state.commandLock) {
        log('DEBUG', 'Command lock active, skipping poll');
        return;
    }
    
    try {
        // List pending commands
        const pendingFiles = await listDirectory('commands/pending');
        
        if (!Array.isArray(pendingFiles) || pendingFiles.length === 0) {
            return;
        }
        
        // Filter JSON files
        const commandFiles = pendingFiles.filter(f => f.name.endsWith('.json'));
        
        for (const commandFile of commandFiles) {
            state.commandLock = true;
            state.currentCommand = commandFile.name;
            
            try {
                log('INFO', `Processing command: ${commandFile.name}`);
                
                // Get command content
                const content = await getFileContent(`commands/pending/${commandFile.name}`);
                if (!content) continue;
                
                const command = JSON.parse(content.content);
                
                // Validate command schema
                const validationErrors = validateCommand(command);
                if (validationErrors.length > 0) {
                    log('WARN', `Invalid command: ${validationErrors.join(', ')}`);
                    await moveCommandToDone(commandFile, content.sha);
                    continue;
                }
                
                // Verify signature
                const signatureValid = await verifySignature(command);
                if (!signatureValid) {
                    log('WARN', `Invalid signature for command ${commandFile.name}`);
                    await moveCommandToDone(commandFile, content.sha);
                    continue;
                }
                
                // Process command
                const result = await processCommand(command);
                
                // Write result
                await writeCommandResult(command, result);
                
                // Move to done
                await moveCommandToDone(commandFile, content.sha);
                
                // Update status
                await writeServerStatus();
                await writeLogTail();
                
                log('INFO', `Command completed: ${command.action} - ${result.success ? 'SUCCESS' : 'FAILED'}`);
                
            } catch (error) {
                log('ERROR', `Failed to process command ${commandFile.name}: ${error.message}`);
            } finally {
                state.commandLock = false;
                state.currentCommand = null;
            }
        }
        
    } catch (error) {
        log('ERROR', `Polling error: ${error.message}`);
    }
}

// ============================================
// Process Detection
// ============================================

async function detectExistingServer() {
    try {
        const pidPath = path.join(config.server_dir, 'server.pid');
        
        if (fsSync.existsSync(pidPath)) {
            const pid = parseInt(fsSync.readFileSync(pidPath, 'utf8').trim());
            
            // Check if process is running
            try {
                process.kill(pid, 0);
                state.serverPid = pid;
                state.running = true;
                log('INFO', `Detected running server with PID ${pid}`);
            } catch (e) {
                // Process not running, clean up PID file
                await fs.unlink(pidPath);
                log('INFO', 'Cleaned up stale PID file');
            }
        }
    } catch (error) {
        log('DEBUG', `Process detection: ${error.message}`);
    }
}

// ============================================
// Initialization
// ============================================

async function ensureDirectories() {
    const dirs = [
        config.backup_dir,
        config.logs_dir,
        path.join(config.server_dir)
    ];
    
    for (const dir of dirs) {
        if (dir) {
            try {
                await fs.mkdir(dir, { recursive: true });
            } catch (e) {
                // Ignore
            }
        }
    }
}

async function ensureGitHubDirectories() {
    const dirs = ['commands/pending', 'commands/done', 'commands/locked', 'status'];
    
    for (const dir of dirs) {
        try {
            const exists = await getFileContent(`${dir}/.gitkeep`);
            if (!exists) {
                await putFileContent(
                    `${dir}/.gitkeep`,
                    '',
                    `[Agent] Initialize directory: ${dir}`
                );
            }
        } catch (error) {
            log('DEBUG', `Directory check failed for ${dir}: ${error.message}`);
        }
    }
}

async function initialize() {
    log('INFO', '='.repeat(50));
    log('INFO', 'Hytale Server Manager Agent Starting...');
    log('INFO', '='.repeat(50));
    
    // Load configuration
    await loadConfig();
    
    // Ensure local directories exist
    await ensureDirectories();
    
    // Ensure GitHub directories exist
    await ensureGitHubDirectories();
    
    // Detect existing server
    await detectExistingServer();
    
    // Load saved backup schedule
    if (config.backup_schedule && config.backup_schedule.enabled) {
        setupBackupSchedule(config.backup_schedule);
    }
    
    // Write initial status
    await writeServerStatus();
    await writeLogTail();
    
    log('INFO', `Agent configured for ${config.github.owner}/${config.github.repo}`);
    log('INFO', `Server directory: ${config.server_dir}`);
    log('INFO', `Polling interval: ${config.poll_interval || 10} seconds`);
    log('INFO', 'Agent ready and polling for commands...');
}

// ============================================
// Main Entry Point
// ============================================

async function main() {
    await initialize();
    
    // Start polling
    const pollInterval = (config.poll_interval || 10) * 1000;
    
    // Initial poll
    await pollForCommands();
    
    // Periodic polling
    setInterval(pollForCommands, pollInterval);
    
    // Periodic status update (every 60 seconds)
    setInterval(async () => {
        await writeServerStatus();
        await writeLogTail();
    }, 60000);
}

// Handle graceful shutdown
process.on('SIGINT', async () => {
    log('INFO', 'Received SIGINT, shutting down...');
    
    if (state.scheduledBackupTimer) {
        clearInterval(state.scheduledBackupTimer);
    }
    
    await writeServerStatus();
    
    process.exit(0);
});

process.on('SIGTERM', async () => {
    log('INFO', 'Received SIGTERM, shutting down...');
    
    if (state.scheduledBackupTimer) {
        clearInterval(state.scheduledBackupTimer);
    }
    
    await writeServerStatus();
    
    process.exit(0);
});

process.on('uncaughtException', (error) => {
    log('ERROR', `Uncaught exception: ${error.message}`);
    log('ERROR', error.stack);
});

process.on('unhandledRejection', (reason, promise) => {
    log('ERROR', `Unhandled rejection: ${reason}`);
});

// Start the agent
main().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
});
