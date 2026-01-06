/**
 * Phoenix Hosting - Main Application
 * 
 * This is the main entry point for the Phoenix Panel application.
 * It orchestrates all modules and handles the application lifecycle.
 */

import { isConfigValid } from './firebase-config.js';
import { 
    initAuthListener, 
    onAuthChange, 
    signInWithGoogle, 
    signOut,
    getCurrentUser 
} from './auth.js';
import { 
    subscribeToServers, 
    subscribeToAgentStatus,
    sendCommand,
    getServerCommands,
    cleanupListeners 
} from './database.js';
import {
    showLoadingScreen,
    showLoginScreen,
    showApp,
    updateUserInfo,
    updateAgentStatus,
    showServersLoading,
    renderServers,
    updateServerStatus,
    setActionLoading,
    showConfirmModal,
    showDetailsModal,
    showToast,
    getElements
} from './ui.js';

// =============================================================================
// Application State
// =============================================================================

let currentServers = [];
let unsubscribeServers = null;
let unsubscribeAgent = null;

// =============================================================================
// Initialization
// =============================================================================

/**
 * Initialize the application
 */
async function init() {
    console.log('🔥 Phoenix Hosting Panel starting...');
    
    // Show loading screen
    showLoadingScreen();
    
    // Check if Firebase is configured
    if (!isConfigValid) {
        showLoginScreen();
        showToast('error', 'Configuration Required', 
            'Please configure Firebase in firebase-config.js. See docs/SETUP.md for instructions.', 
            0
        );
        return;
    }
    
    // Initialize auth listener
    initAuthListener();
    
    // Register auth state callback
    onAuthChange(handleAuthStateChange);
    
    // Setup event listeners
    setupEventListeners();
    
    console.log('✅ Phoenix Panel initialized');
}

/**
 * Handle authentication state changes
 * @param {Object|null} user - The current user or null
 */
function handleAuthStateChange(user) {
    // Clean up existing listeners
    cleanupSubscriptions();
    
    if (user) {
        // User is signed in
        updateUserInfo(user);
        showApp();
        initializeDashboard();
    } else {
        // User is signed out
        showLoginScreen();
        currentServers = [];
    }
}

/**
 * Initialize the dashboard
 */
async function initializeDashboard() {
    showServersLoading();
    
    // Subscribe to agent status
    unsubscribeAgent = subscribeToAgentStatus((status) => {
        updateAgentStatus(status);
    });
    
    // Subscribe to servers
    unsubscribeServers = subscribeToServers((servers) => {
        currentServers = servers;
        renderServers(servers, {
            start: handleStartServer,
            stop: handleStopServer,
            restart: handleRestartServer,
            details: handleShowDetails
        });
    });
}

/**
 * Clean up database subscriptions
 */
function cleanupSubscriptions() {
    if (unsubscribeServers) {
        unsubscribeServers();
        unsubscribeServers = null;
    }
    if (unsubscribeAgent) {
        unsubscribeAgent();
        unsubscribeAgent = null;
    }
}

// =============================================================================
// Event Handlers
// =============================================================================

/**
 * Setup global event listeners
 */
function setupEventListeners() {
    const elements = getElements();
    
    // Google Sign In
    elements.googleSigninBtn?.addEventListener('click', handleGoogleSignIn);
    
    // Logout
    elements.logoutBtn?.addEventListener('click', handleLogout);
    
    // Refresh
    elements.refreshBtn?.addEventListener('click', handleRefresh);
    
    // Keyboard shortcuts
    document.addEventListener('keydown', handleKeydown);
}

/**
 * Handle Google Sign In button click
 */
async function handleGoogleSignIn() {
    const elements = getElements();
    const btn = elements.googleSigninBtn;
    
    try {
        btn.disabled = true;
        btn.textContent = 'Signing in...';
        
        await signInWithGoogle();
        
        showToast('success', 'Welcome!', 'You have signed in successfully.');
    } catch (error) {
        showToast('error', 'Sign In Failed', error.message);
    } finally {
        btn.disabled = false;
        btn.innerHTML = `
            <svg class="google-icon" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
            Sign in with Google
        `;
    }
}

/**
 * Handle logout button click
 */
async function handleLogout() {
    const confirmed = await showConfirmModal(
        'Sign Out',
        'Are you sure you want to sign out?',
        'Sign Out',
        'btn-secondary'
    );
    
    if (confirmed) {
        try {
            cleanupSubscriptions();
            await signOut();
            showToast('info', 'Signed Out', 'You have been signed out.');
        } catch (error) {
            showToast('error', 'Sign Out Failed', error.message);
        }
    }
}

/**
 * Handle refresh button click
 */
function handleRefresh() {
    const elements = getElements();
    const btn = elements.refreshBtn;
    
    // Spin the refresh icon
    btn.classList.add('spinning');
    setTimeout(() => btn.classList.remove('spinning'), 1000);
    
    // Re-render servers
    if (currentServers.length > 0) {
        renderServers(currentServers, {
            start: handleStartServer,
            stop: handleStopServer,
            restart: handleRestartServer,
            details: handleShowDetails
        });
    }
    
    showToast('info', 'Refreshed', 'Server list updated.');
}

/**
 * Handle keyboard shortcuts
 * @param {KeyboardEvent} event
 */
function handleKeydown(event) {
    // Escape closes modals
    if (event.key === 'Escape') {
        const confirmModal = document.getElementById('confirm-modal');
        const detailsModal = document.getElementById('details-modal');
        
        if (!confirmModal.classList.contains('hidden')) {
            confirmModal.classList.add('hidden');
        }
        if (!detailsModal.classList.contains('hidden')) {
            detailsModal.classList.add('hidden');
        }
    }
}

// =============================================================================
// Server Action Handlers
// =============================================================================

/**
 * Handle start server action
 * @param {string} serverId - The server ID
 * @param {Object} server - The server object
 */
async function handleStartServer(serverId, server) {
    const confirmed = await showConfirmModal(
        'Start Server',
        `Are you sure you want to start "${server.name}"?`,
        'Start',
        'btn-success'
    );
    
    if (confirmed) {
        await executeCommand(serverId, 'start');
    }
}

/**
 * Handle stop server action
 * @param {string} serverId - The server ID
 * @param {Object} server - The server object
 */
async function handleStopServer(serverId, server) {
    const confirmed = await showConfirmModal(
        'Stop Server',
        `Are you sure you want to stop "${server.name}"? This will disconnect all players.`,
        'Stop',
        'btn-danger'
    );
    
    if (confirmed) {
        await executeCommand(serverId, 'stop');
    }
}

/**
 * Handle restart server action
 * @param {string} serverId - The server ID
 * @param {Object} server - The server object
 */
async function handleRestartServer(serverId, server) {
    const confirmed = await showConfirmModal(
        'Restart Server',
        `Are you sure you want to restart "${server.name}"? This will briefly disconnect all players.`,
        'Restart',
        'btn-warning'
    );
    
    if (confirmed) {
        await executeCommand(serverId, 'restart');
    }
}

/**
 * Execute a command on a server
 * @param {string} serverId - The server ID
 * @param {string} action - The action to perform
 */
async function executeCommand(serverId, action) {
    setActionLoading(serverId, action, true);
    
    try {
        const commandId = await sendCommand(serverId, action);
        
        showToast('success', 'Command Sent', 
            `${action.charAt(0).toUpperCase() + action.slice(1)} command sent successfully.`
        );
        
        console.log(`✅ Command ${commandId} sent: ${action} on ${serverId}`);
    } catch (error) {
        showToast('error', 'Command Failed', error.message);
        setActionLoading(serverId, action, false);
    }
}

/**
 * Handle show details action
 * @param {string} serverId - The server ID
 * @param {Object} server - The server object
 */
async function handleShowDetails(serverId, server) {
    try {
        const commands = await getServerCommands(serverId, 5);
        showDetailsModal(server, commands);
    } catch (error) {
        showDetailsModal(server, []);
    }
}

// =============================================================================
// Start Application
// =============================================================================

// Initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}

// Cleanup on page unload
window.addEventListener('beforeunload', () => {
    cleanupSubscriptions();
    cleanupListeners();
});

// =============================================================================
// Exports (for debugging)
// =============================================================================

window.PhoenixPanel = {
    getCurrentUser,
    currentServers: () => currentServers,
    sendCommand,
    showToast
};
