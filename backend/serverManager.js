const { spawn } = require('child_process');

class ServerManager {
  constructor() {
    this.processes = new Map(); // serverID -> process info
  }

  startServer(serverId, command, workingDirectory = process.cwd()) {
    if (this.processes.has(serverId)) {
      const processInfo = this.processes.get(serverId);
      if (processInfo.process && !processInfo.process.killed) {
        throw new Error('Server is already running');
      }
    }

    // Parse command into executable and args
    const parts = command.split(' ');
    const executable = parts[0];
    const args = parts.slice(1);

    const serverProcess = spawn(executable, args, {
      cwd: workingDirectory,
      detached: true,
      stdio: ['ignore', 'pipe', 'pipe']
    });

    const processInfo = {
      process: serverProcess,
      startTime: new Date(),
      logs: [],
      maxLogs: 100
    };

    // Capture stdout
    serverProcess.stdout.on('data', (data) => {
      const log = { timestamp: new Date(), type: 'stdout', message: data.toString() };
      processInfo.logs.push(log);
      if (processInfo.logs.length > processInfo.maxLogs) {
        processInfo.logs.shift();
      }
    });

    // Capture stderr
    serverProcess.stderr.on('data', (data) => {
      const log = { timestamp: new Date(), type: 'stderr', message: data.toString() };
      processInfo.logs.push(log);
      if (processInfo.logs.length > processInfo.maxLogs) {
        processInfo.logs.shift();
      }
    });

    // Handle process exit
    serverProcess.on('exit', (code) => {
      console.log(`Server ${serverId} exited with code ${code}`);
      processInfo.exitCode = code;
      processInfo.exitTime = new Date();
    });

    serverProcess.on('error', (err) => {
      console.error(`Server ${serverId} error:`, err);
      processInfo.error = err.message;
    });

    this.processes.set(serverId, processInfo);
    
    return {
      pid: serverProcess.pid,
      startTime: processInfo.startTime
    };
  }

  stopServer(serverId) {
    const processInfo = this.processes.get(serverId);
    
    if (!processInfo || !processInfo.process) {
      throw new Error('Server is not running');
    }

    if (processInfo.process.killed) {
      throw new Error('Server is already stopped');
    }

    try {
      process.kill(-processInfo.process.pid, 'SIGTERM');
      
      // Force kill after 10 seconds if still running
      setTimeout(() => {
        if (!processInfo.process.killed) {
          try {
            process.kill(-processInfo.process.pid, 'SIGKILL');
          } catch (e) {
            // Process already dead
          }
        }
      }, 10000);

      return { success: true };
    } catch (err) {
      throw new Error(`Failed to stop server: ${err.message}`);
    }
  }

  restartServer(serverId, command, workingDirectory) {
    const processInfo = this.processes.get(serverId);
    
    // If server is running, stop it first
    if (processInfo && processInfo.process && !processInfo.process.killed) {
      try {
        this.stopServer(serverId);
      } catch (err) {
        // Continue anyway
      }
    }

    // Wait for process to stop before restarting
    return new Promise((resolve, reject) => {
      setTimeout(() => {
        try {
          const result = this.startServer(serverId, command, workingDirectory);
          resolve(result);
        } catch (err) {
          reject(err);
        }
      }, 3000); // Increased wait time to ensure process is stopped
    });
  }

  getServerStatus(serverId) {
    const processInfo = this.processes.get(serverId);
    
    if (!processInfo || !processInfo.process) {
      return { status: 'stopped', uptime: 0 };
    }

    if (processInfo.process.killed || processInfo.exitCode !== undefined) {
      return { 
        status: 'stopped', 
        uptime: 0,
        lastExitCode: processInfo.exitCode 
      };
    }

    const uptime = Date.now() - processInfo.startTime.getTime();
    
    return {
      status: 'running',
      pid: processInfo.process.pid,
      uptime: Math.floor(uptime / 1000), // in seconds
      startTime: processInfo.startTime
    };
  }

  getServerLogs(serverId, limit = 50) {
    const processInfo = this.processes.get(serverId);
    
    if (!processInfo) {
      return [];
    }

    return processInfo.logs.slice(-limit);
  }
}

module.exports = new ServerManager();
