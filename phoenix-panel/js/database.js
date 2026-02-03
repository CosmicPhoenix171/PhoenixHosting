/**
 * Phoenix Hosting - Database Module
 * 
 * Handles all database operations including:
 * - Fetching servers for the current user
 * - Sending commands (start/stop/restart)
 * - Real-time listeners for status updates
 * - Agent status monitoring
 */

import { 
    ref, 
    query, 
    orderByChild,
    equalTo,
    onValue, 
    off,
    push,
    set,
    get,
    serverTimestamp 
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js';
import { database, isConfigValid } from './firebase-config.js';
import { getCurrentUser } from './auth.js';

// =============================================================================
// Constants
// =============================================================================

const VALID_ACTIONS = ['start', 'stop', 'restart'];
const COMMAND_EXPIRY_MS = 5 * 60 * 1000; // 5 minutes

// =============================================================================
// Active Listeners
// =============================================================================

const activeListeners = new Map();

/**
 * Clean up all active database listeners
 */
export function cleanupListeners() {
    for (const [path, refObj] of activeListeners) {
        off(refObj);
        console.log('🔕 Removed listener:', path);
    }
    activeListeners.clear();
}

// =============================================================================
// Server Operations
// =============================================================================

/**
 * Fetch all servers the current user has access to
 * @returns {Promise<Array>} Array of server objects
 */
export async function fetchUserServers() {
    if (!isConfigValid || !database) {
        console.warn('Database not available');
        return [];
    }
    
    const user = getCurrentUser();
    if (!user) {
        console.warn('No authenticated user');
        return [];
    }
    
    try {
        const serversRef = ref(database, 'servers');
        const snapshot = await get(serversRef);
        
        if (!snapshot.exists()) {
            return [];
        }
        
        const servers = [];
        snapshot.forEach((childSnapshot) => {
            const server = childSnapshot.val();
            server.id = childSnapshot.key;
            
            // Check if user has access to this server
            if (server.allowedUsers && server.allowedUsers[user.uid]) {
                servers.push(server);
            }
        });
        
        console.log(`📦 Fetched ${servers.length} servers for user`);
        return servers;
    } catch (error) {
        console.error('❌ Error fetching servers:', error);
        throw new Error('Failed to fetch servers. Please try again.');
    }
}

/**
 * Subscribe to real-time server updates
 * @param {Function} callback - Function to call when servers update
 * @returns {Function} Unsubscribe function
 */
export function subscribeToServers(callback) {
    if (!isConfigValid || !database) {
        console.warn('Database not available');
        return () => {};
    }
    
    const user = getCurrentUser();
    if (!user) {
        console.warn('No authenticated user');
        return () => {};
    }
    
    const serversRef = ref(database, 'servers');
    
    const handleUpdate = (snapshot) => {
        const servers = [];
        
        if (snapshot.exists()) {
            snapshot.forEach((childSnapshot) => {
                const server = childSnapshot.val();
                server.id = childSnapshot.key;
                
                // Check if user has access
                if (server.allowedUsers && server.allowedUsers[user.uid]) {
                    servers.push(server);
                }
            });
        }
        
        callback(servers);
    };
    
    onValue(serversRef, handleUpdate, (error) => {
        console.error('❌ Server listener error:', error);
    });
    
    activeListeners.set('servers', serversRef);
    console.log('👂 Listening to server updates');
    
    // Return unsubscribe function
    return () => {
        off(serversRef);
        activeListeners.delete('servers');
        console.log('🔕 Stopped listening to server updates');
    };
}

/**
 * Subscribe to a specific server's status
 * @param {string} serverId - The server ID
 * @param {Function} callback - Function to call when status updates
 * @returns {Function} Unsubscribe function
 */
export function subscribeToServerStatus(serverId, callback) {
    if (!isConfigValid || !database) {
        return () => {};
    }
    
    const statusRef = ref(database, `servers/${serverId}/status`);
    
    onValue(statusRef, (snapshot) => {
        const status = snapshot.val();
        callback(serverId, status);
    });
    
    activeListeners.set(`server-status-${serverId}`, statusRef);
    
    return () => {
        off(statusRef);
        activeListeners.delete(`server-status-${serverId}`);
    };
}

// =============================================================================
// Command Operations
// =============================================================================

/**
 * Send a command to a server
 * @param {string} serverId - The target server ID
 * @param {string} action - The action (start/stop/restart)
 * @returns {Promise<string>} The command ID
 */
export async function sendCommand(serverId, action) {
    if (!isConfigValid || !database) {
        throw new Error('Database not available');
    }
    
    const user = getCurrentUser();
    if (!user) {
        throw new Error('You must be signed in to send commands');
    }
    
    // Validate action
    if (!VALID_ACTIONS.includes(action)) {
        throw new Error(`Invalid action: ${action}. Must be one of: ${VALID_ACTIONS.join(', ')}`);
    }
    
    // Validate server access
    const hasAccess = await checkServerAccess(serverId);
    if (!hasAccess) {
        throw new Error('You do not have access to this server');
    }
    
    try {
        const commandsRef = ref(database, 'commands');
        const newCommandRef = push(commandsRef);
        const commandId = newCommandRef.key;
        
        const command = {
            id: commandId,
            serverId: serverId,
            action: action,
            requestedBy: user.uid,
            requestedByEmail: user.email,
            requestedAt: Date.now(),
            status: 'pending'
        };
        
        await set(newCommandRef, command);
        
        console.log(`📤 Command sent: ${action} on ${serverId} (${commandId})`);
        return commandId;
    } catch (error) {
        console.error('❌ Error sending command:', error);
        throw new Error('Failed to send command. Please try again.');
    }
}

/**
 * Check if the current user has access to a server
 * @param {string} serverId - The server ID to check
 * @returns {Promise<boolean>} True if user has access
 */
export async function checkServerAccess(serverId) {
    if (!database) return false;
    
    const user = getCurrentUser();
    if (!user) return false;
    
    try {
        const accessRef = ref(database, `servers/${serverId}/allowedUsers/${user.uid}`);
        const snapshot = await get(accessRef);
        return snapshot.exists() && snapshot.val() === true;
    } catch (error) {
        console.error('Error checking server access:', error);
        return false;
    }
}

/**
 * Subscribe to command status updates
 * @param {string} commandId - The command ID to watch
 * @param {Function} callback - Function to call when status updates
 * @returns {Function} Unsubscribe function
 */
export function subscribeToCommand(commandId, callback) {
    if (!isConfigValid || !database) {
        return () => {};
    }
    
    const commandRef = ref(database, `commands/${commandId}`);
    
    onValue(commandRef, (snapshot) => {
        const command = snapshot.val();
        if (command) {
            callback(command);
        }
    });
    
    activeListeners.set(`command-${commandId}`, commandRef);
    
    return () => {
        off(commandRef);
        activeListeners.delete(`command-${commandId}`);
    };
}

/**
 * Get recent commands for a server
 * @param {string} serverId - The server ID
 * @param {number} limit - Maximum number of commands to fetch
 * @returns {Promise<Array>} Array of command objects
 */
export async function getServerCommands(serverId, limit = 10) {
    if (!isConfigValid || !database) {
        return [];
    }
    
    try {
        const commandsRef = ref(database, 'commands');
        const snapshot = await get(commandsRef);
        
        if (!snapshot.exists()) {
            return [];
        }
        
        const commands = [];
        snapshot.forEach((childSnapshot) => {
            const command = childSnapshot.val();
            if (command.serverId === serverId) {
                commands.push(command);
            }
        });
        
        // Sort by timestamp descending and limit
        return commands
            .sort((a, b) => b.requestedAt - a.requestedAt)
            .slice(0, limit);
    } catch (error) {
        console.error('Error fetching commands:', error);
        return [];
    }
}

// =============================================================================
// Agent Status
// =============================================================================

/**
 * Subscribe to agent status updates
 * @param {Function} callback - Function to call when status updates
 * @returns {Function} Unsubscribe function
 */
export function subscribeToAgentStatus(callback) {
    if (!isConfigValid || !database) {
        callback({ online: false, message: 'Database not connected' });
        return () => {};
    }
    
    const agentRef = ref(database, 'agent/status');
    
    onValue(agentRef, (snapshot) => {
        if (!snapshot.exists()) {
            callback({ online: false, message: 'Agent not registered' });
            return;
        }
        
        const status = snapshot.val();
        const now = Date.now();
        const lastHeartbeat = status.lastHeartbeat || 0;
        const isOnline = status.online && (now - lastHeartbeat) < 90000; // 90 second threshold
        
        callback({
            online: isOnline,
            lastHeartbeat: lastHeartbeat,
            version: status.version || 'Unknown',
            hostname: status.hostname || 'Unknown',
            message: isOnline ? 'Agent online' : 'Agent offline'
        });
    }, (error) => {
        console.error('Agent status error:', error);
        callback({ online: false, message: 'Connection error' });
    });
    
    activeListeners.set('agent-status', agentRef);
    console.log('👂 Listening to agent status');
    
    return () => {
        off(agentRef);
        activeListeners.delete('agent-status');
    };
}

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Format a timestamp for display
 * @param {number} timestamp - Unix timestamp in milliseconds
 * @returns {string} Formatted date string
 */
export function formatTimestamp(timestamp) {
    if (!timestamp) return 'Never';
    
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now - date;
    const diffSecs = Math.floor(diffMs / 1000);
    const diffMins = Math.floor(diffSecs / 60);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);
    
    if (diffSecs < 60) {
        return 'Just now';
    } else if (diffMins < 60) {
        return `${diffMins}m ago`;
    } else if (diffHours < 24) {
        return `${diffHours}h ago`;
    } else if (diffDays < 7) {
        return `${diffDays}d ago`;
    } else {
        return date.toLocaleDateString();
    }
}

/**
 * Get status display properties
 * @param {string} state - The server state
 * @returns {Object} Display properties
 */
export function getStatusDisplay(state) {
    const displays = {
        running: { label: 'Running', className: 'running', icon: '🟢' },
        stopped: { label: 'Stopped', className: 'stopped', icon: '⚫' },
        starting: { label: 'Starting', className: 'starting', icon: '🔵' },
        stopping: { label: 'Stopping', className: 'stopping', icon: '🟡' },
        error: { label: 'Error', className: 'error', icon: '🔴' }
    };
    
    return displays[state] || displays.stopped;
}

/**
 * Get game type display properties
 * @param {string} gameType - The game type
 * @returns {Object} Display properties
 */
export function getGameDisplay(gameType) {
    const games = {
        minecraft: { icon: '⛏️', name: 'Minecraft' },
        valheim: { icon: '⚔️', name: 'Valheim' },
        terraria: { icon: '🌳', name: 'Terraria' },
        rust: { icon: '🔧', name: 'Rust' },
        ark: { icon: '🦖', name: 'ARK' },
        csgo: { icon: '🔫', name: 'CS:GO' },
        factorio: { icon: '🏭', name: 'Factorio' },
        satisfactory: { icon: '🏗️', name: 'Satisfactory' },
        palworld: { icon: '🐾', name: 'Palworld' },
        enshrouded: { icon: '🌫️', name: 'Enshrouded' },
        default: { icon: '🎮', name: 'Game Server' }
    };
    
    const key = gameType?.toLowerCase() || 'default';
    return games[key] || games.default;
}

// =============================================================================
// Agent Pairing
// =============================================================================

/**
 * Pair with an agent using a pairing code
 * @param {string} pairingCode - The 6-character pairing code
 * @returns {Promise<Object>} The paired agent info
 */
export async function pairAgent(pairingCode) {
    if (!isConfigValid || !database) {
        throw new Error('Database not available');
    }
    
    const user = getCurrentUser();
    if (!user) {
        throw new Error('You must be signed in to pair agents');
    }
    
    // Normalize code (uppercase, no spaces)
    const code = pairingCode.trim().toUpperCase();
    
    if (code.length !== 6) {
        throw new Error('Pairing code must be 6 characters');
    }
    
    try {
        // Check if pairing request exists
        const pairingRef = ref(database, `pairing_requests/${code}`);
        const snapshot = await get(pairingRef);
        
        if (!snapshot.exists()) {
            throw new Error('Invalid pairing code. Make sure the agent is running and showing this code.');
        }
        
        const pairingData = snapshot.val();
        
        if (pairingData.status === 'paired') {
            throw new Error('This code has already been used. Restart the agent for a new code.');
        }
        
        // Update pairing request with user info
        await set(pairingRef, {
            ...pairingData,
            status: 'paired',
            user_id: user.uid,
            user_email: user.email,
            paired_at: Date.now()
        });
        
        console.log('✅ Agent paired successfully:', pairingData.agent_id);
        
        return {
            agentId: pairingData.agent_id,
            hostname: pairingData.hostname
        };
        
    } catch (error) {
        console.error('❌ Pairing error:', error);
        throw error;
    }
}

/**
 * Get all agents for the current user
 * @returns {Promise<Array>} Array of agent objects
 */
export async function getUserAgents() {
    if (!isConfigValid || !database) {
        return [];
    }
    
    const user = getCurrentUser();
    if (!user) {
        return [];
    }
    
    try {
        const agentsRef = ref(database, 'agents');
        const snapshot = await get(agentsRef);
        
        if (!snapshot.exists()) {
            return [];
        }
        
        const agents = [];
        snapshot.forEach((childSnapshot) => {
            const agent = childSnapshot.val();
            if (agent.user_id === user.uid) {
                agent.id = childSnapshot.key;
                agents.push(agent);
            }
        });
        
        return agents;
    } catch (error) {
        console.error('❌ Error fetching agents:', error);
        return [];
    }
}

/**
 * Subscribe to user's agents
 * @param {Function} callback - Function to call when agents update
 * @returns {Function} Unsubscribe function
 */
export function subscribeToUserAgents(callback) {
    if (!isConfigValid || !database) {
        return () => {};
    }
    
    const user = getCurrentUser();
    if (!user) {
        return () => {};
    }
    
    const agentsRef = ref(database, 'agents');
    
    const handleUpdate = (snapshot) => {
        const agents = [];
        
        if (snapshot.exists()) {
            snapshot.forEach((childSnapshot) => {
                const agent = childSnapshot.val();
                if (agent.user_id === user.uid) {
                    agent.id = childSnapshot.key;
                    agents.push(agent);
                }
            });
        }
        
        callback(agents);
    };
    
    onValue(agentsRef, handleUpdate);
    activeListeners.set('user-agents', agentsRef);
    
    return () => {
        off(agentsRef);
        activeListeners.delete('user-agents');
    };
}

/**
 * Subscribe to servers from user's agents
 * @param {Function} callback - Function to call with servers array
 * @returns {Function} Unsubscribe function
 */
export function subscribeToAgentServers(callback) {
    if (!isConfigValid || !database) {
        callback([]);
        return () => {};
    }
    
    const user = getCurrentUser();
    if (!user) {
        callback([]);
        return () => {};
    }
    
    const agentsRef = ref(database, 'agents');
    
    const handleUpdate = (snapshot) => {
        const servers = [];
        
        if (snapshot.exists()) {
            snapshot.forEach((agentSnapshot) => {
                const agent = agentSnapshot.val();
                const agentId = agentSnapshot.key;
                
                // Only show servers from user's agents
                if (agent.user_id === user.uid && agent.servers) {
                    Object.entries(agent.servers).forEach(([serverId, serverData]) => {
                        servers.push({
                            id: `${agentId}/${serverId}`,
                            agentId: agentId,
                            serverId: serverId,
                            name: serverData.name || serverId,
                            gameType: serverData.gameType || 'unknown',
                            status: serverData.status || 'unknown',
                            agentOnline: agent.online || false,
                            agentHostname: agent.hostname || 'Unknown',
                            lastSeen: agent.last_seen,
                            ...serverData
                        });
                    });
                }
            });
        }
        
        callback(servers);
    };
    
    onValue(agentsRef, handleUpdate);
    activeListeners.set('agent-servers', agentsRef);
    
    return () => {
        off(agentsRef);
        activeListeners.delete('agent-servers');
    };
}

/**
 * Send a command to an agent's server
 * @param {string} agentId - The agent ID
 * @param {string} serverId - The server ID on that agent
 * @param {string} action - The action (start/stop/restart)
 * @returns {Promise<string>} The command ID
 */
export async function sendAgentCommand(agentId, serverId, action) {
    if (!isConfigValid || !database) {
        throw new Error('Database not available');
    }
    
    const user = getCurrentUser();
    if (!user) {
        throw new Error('You must be signed in');
    }
    
    const VALID_ACTIONS = ['start', 'stop', 'restart'];
    if (!VALID_ACTIONS.includes(action)) {
        throw new Error(`Invalid action: ${action}`);
    }
    
    try {
        const commandsRef = ref(database, `agents/${agentId}/commands`);
        const newCommandRef = push(commandsRef);
        
        const command = {
            serverId: serverId,
            action: action,
            status: 'pending',
            requestedBy: user.uid,
            requestedAt: Date.now()
        };
        
        await set(newCommandRef, command);
        console.log(`✅ Command sent to agent ${agentId}: ${action} ${serverId}`);
        
        return newCommandRef.key;
    } catch (error) {
        console.error('❌ Error sending command:', error);
        throw new Error('Failed to send command');
    }
}

// =============================================================================
// Exports
// =============================================================================

export default {
    fetchUserServers,
    subscribeToServers,
    subscribeToServerStatus,
    subscribeToAgentServers,
    sendCommand,
    sendAgentCommand,
    checkServerAccess,
    subscribeToCommand,
    getServerCommands,
    subscribeToAgentStatus,
    subscribeToUserAgents,
    pairAgent,
    getUserAgents,
    cleanupListeners,
    formatTimestamp,
    getStatusDisplay,
    getGameDisplay
};
