/**
 * Hytale Server Manager - Frontend Application
 * A static dashboard for controlling a Hytale server via GitHub as a message bus.
 */

// ============================================
// Configuration & State
// ============================================

const state = {
    connected: false,
    connecting: false,
    config: {
        repoOwner: '',
        repoName: '',
        githubToken: '',
        commandSecret: ''
    },
    serverStatus: null,
    lastRun: null,
    history: [],
    oauthPending: null
};

// GitHub API Configuration
const GITHUB_API = 'https://api.github.com';
const POLL_INTERVAL = 15000; // 15 seconds for status refresh
let pollTimer = null;

// ============================================
// Utility Functions
// ============================================

/**
 * Generate a UUID v4
 */
function generateUUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        const r = Math.random() * 16 | 0;
        const v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

/**
 * Generate a random nonce
 */
function generateNonce() {
    const array = new Uint8Array(16);
    crypto.getRandomValues(array);
    return Array.from(array, b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Create HMAC-SHA256 signature using WebCrypto
 */
async function createHmacSignature(message, secret) {
    const encoder = new TextEncoder();
    
    // Derive key from secret using PBKDF2
    const keyMaterial = await crypto.subtle.importKey(
        'raw',
        encoder.encode(secret),
        { name: 'PBKDF2' },
        false,
        ['deriveBits', 'deriveKey']
    );
    
    const key = await crypto.subtle.deriveKey(
        {
            name: 'PBKDF2',
            salt: encoder.encode('hytale-server-manager-salt'),
            iterations: 100000,
            hash: 'SHA-256'
        },
        keyMaterial,
        { name: 'HMAC', hash: 'SHA-256', length: 256 },
        false,
        ['sign']
    );
    
    // Sign the message
    const signature = await crypto.subtle.sign(
        'HMAC',
        key,
        encoder.encode(message)
    );
    
    // Convert to hex
    return Array.from(new Uint8Array(signature))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');
}

/**
 * Format relative time
 */
function formatRelativeTime(date) {
    const now = new Date();
    const diff = now - new Date(date);
    
    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    
    if (days > 0) return `${days}d ago`;
    if (hours > 0) return `${hours}h ago`;
    if (minutes > 0) return `${minutes}m ago`;
    return 'Just now';
}

/**
 * Format duration
 */
function formatDuration(seconds) {
    if (!seconds || seconds < 0) return '--';
    
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    
    if (hours > 0) {
        return `${hours}h ${minutes}m`;
    }
    if (minutes > 0) {
        return `${minutes}m ${secs}s`;
    }
    return `${secs}s`;
}

/**
 * Format bytes to human readable
 */
function formatBytes(bytes) {
    if (!bytes) return '--';
    
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let unitIndex = 0;
    let size = bytes;
    
    while (size >= 1024 && unitIndex < units.length - 1) {
        size /= 1024;
        unitIndex++;
    }
    
    return `${size.toFixed(1)} ${units[unitIndex]}`;
}

// ============================================
// Toast Notifications
// ============================================

function showToast(type, title, message, duration = 5000) {
    const container = document.getElementById('toastContainer');
    
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `
        <div class="toast-content">
            <div class="toast-title">${title}</div>
            ${message ? `<div class="toast-message">${message}</div>` : ''}
        </div>
        <button class="toast-close">&times;</button>
    `;
    
    container.appendChild(toast);
    
    const closeBtn = toast.querySelector('.toast-close');
    closeBtn.addEventListener('click', () => toast.remove());
    
    setTimeout(() => toast.remove(), duration);
}

// ============================================
// GitHub API Functions
// ============================================

async function githubRequest(endpoint, options = {}) {
    const { githubToken, repoOwner, repoName } = state.config;
    
    const url = endpoint.startsWith('http') 
        ? endpoint 
        : `${GITHUB_API}/repos/${repoOwner}/${repoName}${endpoint}`;
    
    const response = await fetch(url, {
        ...options,
        headers: {
            'Accept': 'application/vnd.github.v3+json',
            'Authorization': `Bearer ${githubToken}`,
            'Content-Type': 'application/json',
            ...options.headers
        }
    });
    
    if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.message || `GitHub API error: ${response.status}`);
    }
    
    return response.json();
}

/**
 * Get file content from repo
 */
async function getFileContent(path) {
    try {
        const response = await githubRequest(`/contents/${path}`);
        const content = atob(response.content);
        return { content, sha: response.sha };
    } catch (error) {
        if (error.message.includes('404')) {
            return null;
        }
        throw error;
    }
}

/**
 * Create or update file in repo
 */
async function putFileContent(path, content, message, sha = null) {
    const body = {
        message,
        content: btoa(content),
        branch: 'main'
    };
    
    if (sha) {
        body.sha = sha;
    }
    
    return githubRequest(`/contents/${path}`, {
        method: 'PUT',
        body: JSON.stringify(body)
    });
}

/**
 * Delete file from repo
 */
async function deleteFile(path, sha, message) {
    return githubRequest(`/contents/${path}`, {
        method: 'DELETE',
        body: JSON.stringify({
            message,
            sha,
            branch: 'main'
        })
    });
}

// ============================================
// Command Functions
// ============================================

async function sendCommand(action, params = {}) {
    if (!state.connected) {
        showToast('error', 'Not Connected', 'Please configure connection settings first.');
        return;
    }
    
    const { commandSecret } = state.config;
    
    if (!commandSecret) {
        showToast('error', 'Missing Secret', 'Command secret is required for signing.');
        return;
    }
    
    try {
        const id = generateUUID();
        const created_at = new Date().toISOString();
        const nonce = generateNonce();
        
        // Create message to sign
        const messageToSign = JSON.stringify({
            id,
            created_at,
            action,
            params,
            nonce
        });
        
        const signature = await createHmacSignature(messageToSign, commandSecret);
        
        const command = {
            id,
            created_at,
            action,
            params,
            nonce,
            signature
        };
        
        // Commit command to pending folder
        const path = `commands/pending/${id}.json`;
        await putFileContent(
            path,
            JSON.stringify(command, null, 2),
            `[Agent] Add command: ${action}`
        );
        
        showToast('success', 'Command Sent', `${action} command queued for execution.`);
        
        // Refresh status after a delay
        setTimeout(refreshAll, 3000);
        
    } catch (error) {
        console.error('Failed to send command:', error);
        showToast('error', 'Command Failed', error.message);
    }
}

// ============================================
// Status Functions
// ============================================

async function fetchServerStatus() {
    try {
        const result = await getFileContent('status/server.json');
        if (result) {
            state.serverStatus = JSON.parse(result.content);
            updateStatusUI();
        }
    } catch (error) {
        console.error('Failed to fetch server status:', error);
    }
}

async function fetchLastRun() {
    try {
        const result = await getFileContent('status/last_run.json');
        if (result) {
            state.lastRun = JSON.parse(result.content);
        }
    } catch (error) {
        console.error('Failed to fetch last run:', error);
    }
}

async function fetchHistory() {
    try {
        const result = await getFileContent('status/history.jsonl');
        if (result) {
            const lines = result.content.trim().split('\n').filter(l => l);
            state.history = lines.slice(-20).reverse().map(line => JSON.parse(line));
            updateHistoryUI();
        }
    } catch (error) {
        console.error('Failed to fetch history:', error);
    }
}

async function fetchLogs() {
    try {
        const result = await getFileContent('status/log_tail.txt');
        if (result) {
            document.getElementById('logViewer').textContent = result.content;
            
            if (document.getElementById('autoScrollLogs').checked) {
                const logViewer = document.getElementById('logViewer');
                logViewer.scrollTop = logViewer.scrollHeight;
            }
        }
    } catch (error) {
        console.error('Failed to fetch logs:', error);
    }
}

async function refreshAll() {
    if (!state.connected) return;
    
    await Promise.all([
        fetchServerStatus(),
        fetchLastRun(),
        fetchHistory(),
        fetchLogs()
    ]);
}

// ============================================
// UI Update Functions
// ============================================

function updateConnectionUI() {
    const bar = document.getElementById('connectionBar');
    const status = document.getElementById('connectionStatus');
    const connectBtn = document.getElementById('connectBtn');
    const buttons = document.querySelectorAll('.control-card button, .schedule-card button');
    
    if (state.connecting) {
        bar.className = 'connection-bar connecting';
        status.textContent = 'Connecting...';
        connectBtn.textContent = 'Cancel';
    } else if (state.connected) {
        bar.className = 'connection-bar connected';
        status.textContent = `Connected to ${state.config.repoOwner}/${state.config.repoName}`;
        connectBtn.textContent = 'Disconnect';
        buttons.forEach(btn => btn.disabled = false);
    } else {
        bar.className = 'connection-bar disconnected';
        status.textContent = 'Not Connected';
        connectBtn.textContent = 'Connect';
        buttons.forEach(btn => btn.disabled = true);
    }
}

function updateStatusUI() {
    const status = state.serverStatus;
    
    if (!status) return;
    
    // Server status indicator
    const indicator = document.getElementById('serverIndicator');
    const statusText = document.getElementById('serverStatus');
    
    if (status.running) {
        indicator.className = 'status-indicator running';
        statusText.textContent = 'Running';
    } else {
        indicator.className = 'status-indicator stopped';
        statusText.textContent = 'Stopped';
    }
    
    // Other status values
    document.getElementById('serverUptime').textContent = formatDuration(status.uptime);
    document.getElementById('serverPid').textContent = status.pid || '--';
    document.getElementById('diskFree').textContent = formatBytes(status.disk_free);
    document.getElementById('lastBackup').textContent = status.last_backup 
        ? formatRelativeTime(status.last_backup) 
        : 'Never';
    document.getElementById('agentStatus').textContent = status.agent_active 
        ? 'Active' 
        : 'Inactive';
    
    // Update current schedule
    if (status.backup_schedule) {
        document.getElementById('currentSchedule').textContent = status.backup_schedule;
    }
}

function updateHistoryUI() {
    const container = document.getElementById('historyList');
    
    if (state.history.length === 0) {
        container.innerHTML = '<div class="history-empty">No command history available</div>';
        return;
    }
    
    container.innerHTML = state.history.map(item => {
        const iconClass = item.success ? 'success' : 'error';
        const icon = item.success 
            ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>'
            : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';
        
        return `
            <div class="history-item">
                <div class="history-icon ${iconClass}">${icon}</div>
                <div class="history-details">
                    <div class="history-action">${item.action}</div>
                    <div class="history-time">${formatRelativeTime(item.completed_at)}</div>
                </div>
                <span class="history-status ${iconClass}">${item.success ? 'Success' : 'Failed'}</span>
            </div>
        `;
    }).join('');
}

// ============================================
// Connection Functions
// ============================================

async function connect() {
    const { repoOwner, repoName, githubToken } = state.config;
    
    if (!repoOwner || !repoName || !githubToken) {
        showToast('error', 'Missing Configuration', 'Please fill in all connection settings.');
        document.getElementById('settingsModal').classList.remove('hidden');
        return;
    }
    
    state.connecting = true;
    updateConnectionUI();
    
    try {
        // Test connection by fetching repo info
        await githubRequest('');
        
        state.connected = true;
        state.connecting = false;
        updateConnectionUI();
        
        showToast('success', 'Connected', 'Successfully connected to repository.');
        
        // Start polling
        refreshAll();
        pollTimer = setInterval(refreshAll, POLL_INTERVAL);
        
    } catch (error) {
        state.connecting = false;
        state.connected = false;
        updateConnectionUI();
        
        showToast('error', 'Connection Failed', error.message);
    }
}

function disconnect() {
    state.connected = false;
    state.serverStatus = null;
    state.lastRun = null;
    state.history = [];
    
    if (pollTimer) {
        clearInterval(pollTimer);
        pollTimer = null;
    }
    
    updateConnectionUI();
    showToast('info', 'Disconnected', 'Connection closed.');
}

// ============================================
// Settings Functions
// ============================================

function loadSettings() {
    const saved = localStorage.getItem('hytale-manager-config');
    if (saved) {
        try {
            const config = JSON.parse(saved);
            state.config.repoOwner = config.repoOwner || '';
            state.config.repoName = config.repoName || '';
            // Note: tokens are NOT persisted for security
            
            document.getElementById('repoOwner').value = state.config.repoOwner;
            document.getElementById('repoName').value = state.config.repoName;
        } catch (e) {
            console.error('Failed to load settings:', e);
        }
    }
}

function saveSettings() {
    state.config.repoOwner = document.getElementById('repoOwner').value.trim();
    state.config.repoName = document.getElementById('repoName').value.trim();
    state.config.githubToken = document.getElementById('githubToken').value.trim();
    state.config.commandSecret = document.getElementById('commandSecret').value.trim();
    
    // Only persist non-sensitive settings
    localStorage.setItem('hytale-manager-config', JSON.stringify({
        repoOwner: state.config.repoOwner,
        repoName: state.config.repoName
    }));
    
    document.getElementById('settingsModal').classList.add('hidden');
    showToast('success', 'Settings Saved', 'Configuration updated.');
}

function clearSettings() {
    localStorage.removeItem('hytale-manager-config');
    state.config = {
        repoOwner: '',
        repoName: '',
        githubToken: '',
        commandSecret: ''
    };
    
    document.getElementById('repoOwner').value = '';
    document.getElementById('repoName').value = '';
    document.getElementById('githubToken').value = '';
    document.getElementById('commandSecret').value = '';
    
    if (state.connected) {
        disconnect();
    }
    
    showToast('info', 'Settings Cleared', 'All configuration has been removed.');
}

// ============================================
// Confirmation Modal
// ============================================

function showConfirm(title, message, onConfirm) {
    const modal = document.getElementById('confirmModal');
    document.getElementById('confirmTitle').textContent = title;
    document.getElementById('confirmMessage').textContent = message;
    
    modal.classList.remove('hidden');
    
    const confirmBtn = document.getElementById('confirmOkBtn');
    const cancelBtn = document.getElementById('confirmCancelBtn');
    const closeBtn = document.getElementById('closeConfirmBtn');
    
    const cleanup = () => {
        modal.classList.add('hidden');
        confirmBtn.removeEventListener('click', handleConfirm);
        cancelBtn.removeEventListener('click', cleanup);
        closeBtn.removeEventListener('click', cleanup);
    };
    
    const handleConfirm = () => {
        cleanup();
        onConfirm();
    };
    
    confirmBtn.addEventListener('click', handleConfirm);
    cancelBtn.addEventListener('click', cleanup);
    closeBtn.addEventListener('click', cleanup);
}

// ============================================
// Schedule Functions
// ============================================

function updateScheduleForm() {
    const type = document.getElementById('scheduleType').value;
    
    document.getElementById('intervalGroup').classList.toggle('hidden', type !== 'interval');
    document.getElementById('dailyGroup').classList.toggle('hidden', type !== 'daily');
    document.getElementById('cronGroup').classList.toggle('hidden', type !== 'cron');
}

function getScheduleParams() {
    const type = document.getElementById('scheduleType').value;
    
    switch (type) {
        case 'disabled':
            return { enabled: false };
        case 'interval':
            return {
                enabled: true,
                type: 'interval',
                interval_minutes: parseInt(document.getElementById('intervalMinutes').value)
            };
        case 'daily':
            return {
                enabled: true,
                type: 'daily',
                time: document.getElementById('dailyTime').value
            };
        case 'cron':
            return {
                enabled: true,
                type: 'cron',
                expression: document.getElementById('cronExpression').value
            };
        default:
            return { enabled: false };
    }
}

// ============================================
// GitHub OAuth Device Flow (Optional)
// ============================================

async function startOAuthFlow() {
    // Note: This requires a GitHub OAuth App to be configured
    // The client_id would need to be provided
    showToast('info', 'OAuth Not Configured', 'OAuth requires a GitHub OAuth App. Use token authentication instead.');
}

// ============================================
// Event Listeners
// ============================================

function initEventListeners() {
    // Connection
    document.getElementById('connectBtn').addEventListener('click', () => {
        if (state.connected) {
            disconnect();
        } else if (state.connecting) {
            state.connecting = false;
            updateConnectionUI();
        } else {
            connect();
        }
    });
    
    // Settings Modal
    document.getElementById('settingsBtn').addEventListener('click', () => {
        document.getElementById('settingsModal').classList.remove('hidden');
    });
    
    document.getElementById('closeSettingsBtn').addEventListener('click', () => {
        document.getElementById('settingsModal').classList.add('hidden');
    });
    
    document.getElementById('saveSettingsBtn').addEventListener('click', () => {
        saveSettings();
        if (!state.connected) {
            connect();
        }
    });
    
    document.getElementById('clearSettingsBtn').addEventListener('click', () => {
        showConfirm('Clear Settings', 'Are you sure you want to clear all settings?', clearSettings);
    });
    
    // Auth method toggle
    document.querySelectorAll('input[name="authMethod"]').forEach(radio => {
        radio.addEventListener('change', (e) => {
            document.getElementById('oauthSection').classList.toggle('hidden', e.target.value !== 'oauth');
        });
    });
    
    document.getElementById('startOAuthBtn').addEventListener('click', startOAuthFlow);
    
    // Close modal on backdrop click
    document.querySelectorAll('.modal-backdrop').forEach(backdrop => {
        backdrop.addEventListener('click', () => {
            backdrop.closest('.modal').classList.add('hidden');
        });
    });
    
    // Control buttons
    document.getElementById('startBtn').addEventListener('click', () => {
        showConfirm('Start Server', 'Start the Hytale server?', () => sendCommand('start'));
    });
    
    document.getElementById('stopBtn').addEventListener('click', () => {
        showConfirm('Stop Server', 'Stop the Hytale server? This will disconnect all players.', () => sendCommand('stop'));
    });
    
    document.getElementById('restartBtn').addEventListener('click', () => {
        showConfirm('Restart Server', 'Restart the Hytale server? This will briefly disconnect all players.', () => sendCommand('restart'));
    });
    
    document.getElementById('backupBtn').addEventListener('click', () => {
        showConfirm('Backup Now', 'Create a backup of the world data?', () => sendCommand('backup_now'));
    });
    
    document.getElementById('updateBtn').addEventListener('click', () => {
        showConfirm('Update Server', 'Update the server files? The server will be stopped during the update.', () => sendCommand('update'));
    });
    
    document.getElementById('statusBtn').addEventListener('click', () => {
        sendCommand('status');
    });
    
    // Schedule
    document.getElementById('scheduleType').addEventListener('change', updateScheduleForm);
    
    document.getElementById('saveScheduleBtn').addEventListener('click', () => {
        const params = getScheduleParams();
        sendCommand('set_backup_schedule', params);
    });
    
    // Refresh buttons
    document.getElementById('refreshStatusBtn').addEventListener('click', () => {
        if (state.connected) {
            fetchServerStatus();
            fetchLastRun();
        }
    });
    
    document.getElementById('refreshHistoryBtn').addEventListener('click', () => {
        if (state.connected) {
            fetchHistory();
        }
    });
    
    document.getElementById('refreshLogsBtn').addEventListener('click', () => {
        if (state.connected) {
            fetchLogs();
        }
    });
}

// ============================================
// Initialization
// ============================================

document.addEventListener('DOMContentLoaded', () => {
    loadSettings();
    initEventListeners();
    updateConnectionUI();
    updateScheduleForm();
    
    // Auto-connect if settings are available
    if (state.config.repoOwner && state.config.repoName) {
        // Show settings modal for token entry
        document.getElementById('settingsModal').classList.remove('hidden');
    }
});
