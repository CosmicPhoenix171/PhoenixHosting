/**
 * Phoenix Hosting - UI Module
 * 
 * Handles all UI-related functionality including:
 * - Screen transitions
 * - Server card rendering
 * - Modals and toasts
 * - User interactions
 */

import { getStatusDisplay, getGameDisplay, formatTimestamp } from './database.js';

// =============================================================================
// DOM Elements
// =============================================================================

const elements = {
    // Screens
    loadingScreen: document.getElementById('loading-screen'),
    loginScreen: document.getElementById('login-screen'),
    app: document.getElementById('app'),
    
    // Auth
    googleSigninBtn: document.getElementById('google-signin-btn'),
    logoutBtn: document.getElementById('logout-btn'),
    userAvatar: document.getElementById('user-avatar'),
    userName: document.getElementById('user-name'),
    
    // Dashboard
    serverGrid: document.getElementById('server-grid'),
    emptyState: document.getElementById('empty-state'),
    loadingState: document.getElementById('loading-state'),
    refreshBtn: document.getElementById('refresh-btn'),
    
    // Agent Status
    agentStatus: document.getElementById('agent-status'),
    
    // Modals
    confirmModal: document.getElementById('confirm-modal'),
    modalTitle: document.getElementById('modal-title'),
    modalMessage: document.getElementById('modal-message'),
    modalConfirm: document.getElementById('modal-confirm'),
    modalCancel: document.getElementById('modal-cancel'),
    modalClose: document.getElementById('modal-close'),
    
    // Details Modal
    detailsModal: document.getElementById('details-modal'),
    detailsTitle: document.getElementById('details-title'),
    detailsBody: document.getElementById('details-body'),
    detailsClose: document.getElementById('details-close'),
    detailsCloseBtn: document.getElementById('details-close-btn'),
    
    // Toast
    toastContainer: document.getElementById('toast-container')
};

// =============================================================================
// Screen Management
// =============================================================================

/**
 * Show the loading screen
 */
export function showLoadingScreen() {
    elements.loadingScreen.classList.remove('hidden');
    elements.loginScreen.classList.add('hidden');
    elements.app.classList.add('hidden');
}

/**
 * Show the login screen
 */
export function showLoginScreen() {
    elements.loadingScreen.classList.add('hidden');
    elements.loginScreen.classList.remove('hidden');
    elements.app.classList.add('hidden');
}

/**
 * Show the main application
 */
export function showApp() {
    elements.loadingScreen.classList.add('hidden');
    elements.loginScreen.classList.add('hidden');
    elements.app.classList.remove('hidden');
}

// =============================================================================
// User UI
// =============================================================================

/**
 * Update user info in the header
 * @param {Object} user - The user object
 */
export function updateUserInfo(user) {
    if (user) {
        elements.userAvatar.src = user.photoURL;
        elements.userAvatar.alt = user.displayName;
        elements.userName.textContent = user.firstName;
    } else {
        elements.userAvatar.src = '';
        elements.userName.textContent = '';
    }
}

/**
 * Update agent status display
 * @param {Object} status - The agent status object
 */
export function updateAgentStatus(status) {
    const dot = elements.agentStatus.querySelector('.status-dot');
    const text = elements.agentStatus.querySelector('.status-text');
    
    if (status.online) {
        dot.classList.remove('offline');
        dot.classList.add('online');
        text.textContent = 'Agent Online';
    } else {
        dot.classList.remove('online');
        dot.classList.add('offline');
        text.textContent = 'Agent Offline';
    }
}

// =============================================================================
// Server Grid
// =============================================================================

/**
 * Show loading state in server grid
 */
export function showServersLoading() {
    elements.serverGrid.classList.add('hidden');
    elements.emptyState.classList.add('hidden');
    elements.loadingState.classList.remove('hidden');
}

/**
 * Render servers in the grid
 * @param {Array} servers - Array of server objects
 * @param {Object} handlers - Event handlers for actions
 */
export function renderServers(servers, handlers) {
    elements.loadingState.classList.add('hidden');
    
    if (!servers || servers.length === 0) {
        elements.serverGrid.classList.add('hidden');
        elements.emptyState.classList.remove('hidden');
        return;
    }
    
    elements.emptyState.classList.add('hidden');
    elements.serverGrid.classList.remove('hidden');
    
    // Clear existing cards
    elements.serverGrid.innerHTML = '';
    
    // Render each server
    servers.forEach(server => {
        const card = createServerCard(server, handlers);
        elements.serverGrid.appendChild(card);
    });
}

/**
 * Create a server card element
 * @param {Object} server - The server object
 * @param {Object} handlers - Event handlers
 * @returns {HTMLElement} The server card element
 */
function createServerCard(server, handlers) {
    const status = server.status || { state: 'stopped' };
    const statusDisplay = getStatusDisplay(status.state);
    const gameDisplay = getGameDisplay(server.gameType);
    
    const isRunning = status.state === 'running';
    const isStopped = status.state === 'stopped' || status.state === 'error';
    const isTransitioning = status.state === 'starting' || status.state === 'stopping';
    
    const card = document.createElement('div');
    card.className = 'server-card';
    card.dataset.serverId = server.id;
    
    card.innerHTML = `
        <div class="server-card-header">
            <div class="server-info">
                <h3 class="server-name">
                    <span class="server-name-text">${escapeHtml(server.name)}</span>
                </h3>
                <span class="server-game">
                    <span class="server-game-icon">${gameDisplay.icon}</span>
                    ${gameDisplay.name}
                </span>
                ${server.description ? `<p class="server-description">${escapeHtml(server.description)}</p>` : ''}
            </div>
            <div class="server-status">
                <span class="status-badge ${statusDisplay.className}">
                    <span class="status-indicator"></span>
                    ${statusDisplay.label}
                </span>
            </div>
        </div>
        <div class="server-card-body">
            <div class="server-stats">
                <div class="stat-item">
                    <div class="stat-label">Last Updated</div>
                    <div class="stat-value">${formatTimestamp(status.lastUpdated)}</div>
                </div>
                <div class="stat-item">
                    <div class="stat-label">Server ID</div>
                    <div class="stat-value">${server.id.substring(0, 8)}...</div>
                </div>
            </div>
            <div class="server-actions">
                <button 
                    class="btn btn-start ${!isStopped ? 'hidden' : ''}" 
                    data-action="start"
                    data-server-id="${server.id}"
                    ${isTransitioning ? 'disabled' : ''}
                >
                    ▶ Start
                </button>
                <button 
                    class="btn btn-stop ${!isRunning ? 'hidden' : ''}" 
                    data-action="stop"
                    data-server-id="${server.id}"
                    ${isTransitioning ? 'disabled' : ''}
                >
                    ⏹ Stop
                </button>
                <button 
                    class="btn btn-restart ${!isRunning ? 'hidden' : ''}" 
                    data-action="restart"
                    data-server-id="${server.id}"
                    ${isTransitioning ? 'disabled' : ''}
                >
                    🔄 Restart
                </button>
                <button 
                    class="btn btn-secondary" 
                    data-action="details"
                    data-server-id="${server.id}"
                >
                    ℹ️ Details
                </button>
            </div>
        </div>
    `;
    
    // Attach event listeners
    const actionButtons = card.querySelectorAll('[data-action]');
    actionButtons.forEach(btn => {
        btn.addEventListener('click', (e) => {
            const action = e.target.dataset.action;
            const serverId = e.target.dataset.serverId;
            
            if (handlers[action]) {
                handlers[action](serverId, server);
            }
        });
    });
    
    return card;
}

/**
 * Update a specific server's status in the grid
 * @param {string} serverId - The server ID
 * @param {Object} status - The new status
 */
export function updateServerStatus(serverId, status) {
    const card = document.querySelector(`.server-card[data-server-id="${serverId}"]`);
    if (!card) return;
    
    const statusDisplay = getStatusDisplay(status.state);
    const badge = card.querySelector('.status-badge');
    
    if (badge) {
        badge.className = `status-badge ${statusDisplay.className}`;
        badge.innerHTML = `
            <span class="status-indicator"></span>
            ${statusDisplay.label}
        `;
    }
    
    // Update buttons based on state
    const isRunning = status.state === 'running';
    const isStopped = status.state === 'stopped' || status.state === 'error';
    const isTransitioning = status.state === 'starting' || status.state === 'stopping';
    
    const startBtn = card.querySelector('[data-action="start"]');
    const stopBtn = card.querySelector('[data-action="stop"]');
    const restartBtn = card.querySelector('[data-action="restart"]');
    
    if (startBtn) {
        startBtn.classList.toggle('hidden', !isStopped);
        startBtn.disabled = isTransitioning;
        startBtn.classList.remove('loading');
    }
    if (stopBtn) {
        stopBtn.classList.toggle('hidden', !isRunning);
        stopBtn.disabled = isTransitioning;
        stopBtn.classList.remove('loading');
    }
    if (restartBtn) {
        restartBtn.classList.toggle('hidden', !isRunning);
        restartBtn.disabled = isTransitioning;
        restartBtn.classList.remove('loading');
    }
    
    // Update last updated time
    const statValue = card.querySelector('.stat-item:first-child .stat-value');
    if (statValue) {
        statValue.textContent = formatTimestamp(status.lastUpdated);
    }
}

/**
 * Set loading state on an action button
 * @param {string} serverId - The server ID
 * @param {string} action - The action
 * @param {boolean} loading - Whether loading
 */
export function setActionLoading(serverId, action, loading) {
    const card = document.querySelector(`.server-card[data-server-id="${serverId}"]`);
    if (!card) return;
    
    const btn = card.querySelector(`[data-action="${action}"]`);
    if (btn) {
        btn.classList.toggle('loading', loading);
        btn.disabled = loading;
    }
}

// =============================================================================
// Modals
// =============================================================================

let confirmCallback = null;

/**
 * Show confirmation modal
 * @param {string} title - Modal title
 * @param {string} message - Modal message
 * @param {string} confirmText - Confirm button text
 * @param {string} confirmClass - Confirm button class
 * @returns {Promise<boolean>} Whether user confirmed
 */
export function showConfirmModal(title, message, confirmText = 'Confirm', confirmClass = 'btn-primary') {
    return new Promise((resolve) => {
        elements.modalTitle.textContent = title;
        elements.modalMessage.textContent = message;
        elements.modalConfirm.textContent = confirmText;
        elements.modalConfirm.className = `btn ${confirmClass}`;
        
        confirmCallback = resolve;
        elements.confirmModal.classList.remove('hidden');
    });
}

/**
 * Hide confirmation modal
 */
export function hideConfirmModal() {
    elements.confirmModal.classList.add('hidden');
    if (confirmCallback) {
        confirmCallback(false);
        confirmCallback = null;
    }
}

// Setup modal event listeners
if (elements.modalConfirm) {
    elements.modalConfirm.addEventListener('click', () => {
        elements.confirmModal.classList.add('hidden');
        if (confirmCallback) {
            confirmCallback(true);
            confirmCallback = null;
        }
    });
}

if (elements.modalCancel) {
    elements.modalCancel.addEventListener('click', hideConfirmModal);
}

if (elements.modalClose) {
    elements.modalClose.addEventListener('click', hideConfirmModal);
}

// Close on backdrop click
if (elements.confirmModal) {
    elements.confirmModal.querySelector('.modal-backdrop')?.addEventListener('click', hideConfirmModal);
}

/**
 * Show server details modal
 * @param {Object} server - The server object
 * @param {Array} commands - Recent commands
 */
export function showDetailsModal(server, commands = []) {
    const status = server.status || { state: 'stopped' };
    const statusDisplay = getStatusDisplay(status.state);
    const gameDisplay = getGameDisplay(server.gameType);
    
    elements.detailsTitle.textContent = server.name;
    
    let commandsHtml = '';
    if (commands.length > 0) {
        commandsHtml = `
            <div class="command-history">
                <h4>Recent Commands</h4>
                <div class="command-list">
                    ${commands.map(cmd => `
                        <div class="command-item">
                            <span class="command-action">${cmd.action}</span>
                            <span class="command-user">${cmd.requestedByEmail || 'Unknown'}</span>
                            <span class="command-time">${formatTimestamp(cmd.requestedAt)}</span>
                            <span class="command-status ${cmd.status}">${cmd.status}</span>
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
    }
    
    elements.detailsBody.innerHTML = `
        <div class="details-grid">
            <div class="detail-group">
                <div class="detail-label">Server ID</div>
                <div class="detail-value mono">${server.id}</div>
            </div>
            <div class="detail-group">
                <div class="detail-label">Game Type</div>
                <div class="detail-value">${gameDisplay.icon} ${gameDisplay.name}</div>
            </div>
            <div class="detail-group">
                <div class="detail-label">Status</div>
                <div class="detail-value">
                    <span class="status-badge ${statusDisplay.className}">
                        <span class="status-indicator"></span>
                        ${statusDisplay.label}
                    </span>
                </div>
            </div>
            <div class="detail-group">
                <div class="detail-label">Last Updated</div>
                <div class="detail-value">${formatTimestamp(status.lastUpdated)}</div>
            </div>
            ${status.message ? `
                <div class="detail-group">
                    <div class="detail-label">Status Message</div>
                    <div class="detail-value">${escapeHtml(status.message)}</div>
                </div>
            ` : ''}
            ${server.description ? `
                <div class="detail-group">
                    <div class="detail-label">Description</div>
                    <div class="detail-value">${escapeHtml(server.description)}</div>
                </div>
            ` : ''}
        </div>
        ${commandsHtml}
    `;
    
    elements.detailsModal.classList.remove('hidden');
}

/**
 * Hide details modal
 */
export function hideDetailsModal() {
    elements.detailsModal.classList.add('hidden');
}

// Setup details modal event listeners
if (elements.detailsClose) {
    elements.detailsClose.addEventListener('click', hideDetailsModal);
}
if (elements.detailsCloseBtn) {
    elements.detailsCloseBtn.addEventListener('click', hideDetailsModal);
}
if (elements.detailsModal) {
    elements.detailsModal.querySelector('.modal-backdrop')?.addEventListener('click', hideDetailsModal);
}

// =============================================================================
// Toasts
// =============================================================================

/**
 * Show a toast notification
 * @param {string} type - Toast type (success/error/warning/info)
 * @param {string} title - Toast title
 * @param {string} message - Toast message
 * @param {number} duration - Duration in ms (0 for persistent)
 */
export function showToast(type, title, message, duration = 5000) {
    const icons = {
        success: '✅',
        error: '❌',
        warning: '⚠️',
        info: 'ℹ️'
    };
    
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `
        <span class="toast-icon">${icons[type] || icons.info}</span>
        <div class="toast-content">
            <div class="toast-title">${escapeHtml(title)}</div>
            ${message ? `<div class="toast-message">${escapeHtml(message)}</div>` : ''}
        </div>
        <button class="toast-close">&times;</button>
    `;
    
    // Close button handler
    toast.querySelector('.toast-close').addEventListener('click', () => {
        removeToast(toast);
    });
    
    elements.toastContainer.appendChild(toast);
    
    // Auto-remove after duration
    if (duration > 0) {
        setTimeout(() => removeToast(toast), duration);
    }
    
    return toast;
}

/**
 * Remove a toast with animation
 * @param {HTMLElement} toast - The toast element
 */
function removeToast(toast) {
    toast.classList.add('removing');
    setTimeout(() => {
        if (toast.parentNode) {
            toast.parentNode.removeChild(toast);
        }
    }, 300);
}

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Escape HTML to prevent XSS
 * @param {string} text - Text to escape
 * @returns {string} Escaped text
 */
function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// =============================================================================
// Element Getters
// =============================================================================

export function getElements() {
    return elements;
}

// =============================================================================
// Exports
// =============================================================================

export default {
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
    hideConfirmModal,
    showDetailsModal,
    hideDetailsModal,
    showToast,
    getElements
};
