// API Configuration
const API_BASE_URL = window.location.origin + '/api';

// State management
const state = {
    user: null,
    token: localStorage.getItem('token'),
    servers: [],
    currentView: 'login'
};

// API calls
async function apiCall(endpoint, options = {}) {
    const headers = {
        'Content-Type': 'application/json',
        ...options.headers
    };

    if (state.token) {
        headers['Authorization'] = `Bearer ${state.token}`;
    }

    try {
        const response = await fetch(`${API_BASE_URL}${endpoint}`, {
            ...options,
            headers
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || 'Request failed');
        }

        return data;
    } catch (error) {
        console.error('API Error:', error);
        throw error;
    }
}

// Auth functions
async function login(username, password) {
    const data = await apiCall('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ username, password })
    });

    state.token = data.token;
    state.user = data.user;
    localStorage.setItem('token', data.token);

    return data;
}

async function register(username, password, email) {
    const data = await apiCall('/auth/register', {
        method: 'POST',
        body: JSON.stringify({ username, password, email })
    });

    return data;
}

async function logout() {
    state.token = null;
    state.user = null;
    localStorage.removeItem('token');
    state.currentView = 'login';
    render();
}

async function getCurrentUser() {
    const data = await apiCall('/auth/me');
    state.user = data;
    return data;
}

// Server functions
async function getServers() {
    const data = await apiCall('/servers');
    state.servers = data;
    return data;
}

async function startServer(serverId) {
    return await apiCall(`/servers/${serverId}/start`, { method: 'POST' });
}

async function stopServer(serverId) {
    return await apiCall(`/servers/${serverId}/stop`, { method: 'POST' });
}

async function restartServer(serverId) {
    return await apiCall(`/servers/${serverId}/restart`, { method: 'POST' });
}

async function createServer(serverData) {
    return await apiCall('/servers', {
        method: 'POST',
        body: JSON.stringify(serverData)
    });
}

async function deleteServer(serverId) {
    return await apiCall(`/servers/${serverId}`, { method: 'DELETE' });
}

// UI rendering functions
function showError(message) {
    return `<div class="error">${message}</div>`;
}

function showSuccess(message) {
    return `<div class="success">${message}</div>`;
}

function formatUptime(seconds) {
    if (!seconds) return 'N/A';
    
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;

    if (hours > 0) {
        return `${hours}h ${minutes}m ${secs}s`;
    } else if (minutes > 0) {
        return `${minutes}m ${secs}s`;
    } else {
        return `${secs}s`;
    }
}

function renderLoginForm() {
    return `
        <div class="auth-container">
            <h2>PhoenixHosting Login</h2>
            <div id="auth-message"></div>
            <form id="login-form">
                <div class="form-group">
                    <label for="username">Username</label>
                    <input type="text" id="username" name="username" required>
                </div>
                <div class="form-group">
                    <label for="password">Password</label>
                    <input type="password" id="password" name="password" required>
                </div>
                <button type="submit" class="btn btn-primary" style="width: 100%;">Login</button>
            </form>
            <div class="auth-toggle">
                Don't have an account? <a id="show-register">Register</a>
            </div>
        </div>
    `;
}

function renderRegisterForm() {
    return `
        <div class="auth-container">
            <h2>Create Account</h2>
            <div id="auth-message"></div>
            <form id="register-form">
                <div class="form-group">
                    <label for="username">Username</label>
                    <input type="text" id="username" name="username" required>
                </div>
                <div class="form-group">
                    <label for="email">Email</label>
                    <input type="email" id="email" name="email" required>
                </div>
                <div class="form-group">
                    <label for="password">Password</label>
                    <input type="password" id="password" name="password" required minlength="6">
                </div>
                <button type="submit" class="btn btn-primary" style="width: 100%;">Register</button>
            </form>
            <div class="auth-toggle">
                Already have an account? <a id="show-login">Login</a>
            </div>
        </div>
    `;
}

function renderServerCard(server) {
    const statusClass = server.status === 'running' ? 'status-running' : 'status-stopped';
    const canControl = server.user_permission !== 'view';

    return `
        <div class="server-card" data-server-id="${server.id}">
            <div class="server-header">
                <div class="server-name">${server.name}</div>
                <div class="server-status ${statusClass}">${server.status.toUpperCase()}</div>
            </div>
            <div class="server-info">
                <div><strong>Type:</strong> ${server.game_type}</div>
                <div><strong>Host:</strong> ${server.host}:${server.port}</div>
                <div><strong>Permission:</strong> ${server.user_permission}</div>
                ${server.status === 'running' ? `<div class="uptime"><strong>Uptime:</strong> ${formatUptime(server.uptime)}</div>` : ''}
            </div>
            <div class="server-actions">
                ${canControl ? `
                    <button class="btn btn-success" onclick="handleStartServer(${server.id})" ${server.status === 'running' ? 'disabled' : ''}>
                        Start
                    </button>
                    <button class="btn btn-danger" onclick="handleStopServer(${server.id})" ${server.status === 'stopped' ? 'disabled' : ''}>
                        Stop
                    </button>
                    <button class="btn btn-warning" onclick="handleRestartServer(${server.id})" ${server.status === 'stopped' ? 'disabled' : ''}>
                        Restart
                    </button>
                ` : '<div style="color: #6b7280; font-size: 12px;">View-only access</div>'}
                ${server.user_permission === 'owner' ? `
                    <button class="btn btn-danger" onclick="handleDeleteServer(${server.id})" style="margin-top: 5px; width: 100%;">
                        Delete
                    </button>
                ` : ''}
            </div>
        </div>
    `;
}

function renderDashboard() {
    return `
        <div class="container">
            <header>
                <div class="logo">🔥 PhoenixHosting</div>
                <div class="user-info">
                    <span>Welcome, ${state.user.username}</span>
                    <button class="btn btn-primary" onclick="showCreateServerModal()">+ New Server</button>
                    <button class="btn btn-primary" onclick="logout()">Logout</button>
                </div>
            </header>

            <div id="message-area"></div>

            ${state.servers.length === 0 ? `
                <div class="empty-state">
                    <h3>No servers yet</h3>
                    <p>Create your first server to get started!</p>
                    <button class="btn btn-primary" onclick="showCreateServerModal()">Create Server</button>
                </div>
            ` : `
                <div class="servers-grid">
                    ${state.servers.map(server => renderServerCard(server)).join('')}
                </div>
            `}
        </div>

        <div id="create-server-modal" class="modal">
            <div class="modal-content">
                <div class="modal-header">
                    <h3>Create New Server</h3>
                    <button class="close-btn" onclick="closeModal()">&times;</button>
                </div>
                <div id="modal-message"></div>
                <form id="create-server-form">
                    <div class="form-group">
                        <label for="server-name">Server Name</label>
                        <input type="text" id="server-name" name="name" required>
                    </div>
                    <div class="form-group">
                        <label for="game-type">Game Type</label>
                        <input type="text" id="game-type" name="game_type" required placeholder="e.g., Minecraft, CS:GO, Custom">
                    </div>
                    <div class="form-group">
                        <label for="host">Host</label>
                        <input type="text" id="host" name="host" value="localhost">
                    </div>
                    <div class="form-group">
                        <label for="port">Port</label>
                        <input type="number" id="port" name="port" required>
                    </div>
                    <div class="form-group">
                        <label for="command">Start Command</label>
                        <input type="text" id="command" name="command" required placeholder="e.g., java -jar server.jar">
                    </div>
                    <div class="form-group">
                        <label for="working-directory">Working Directory (optional)</label>
                        <input type="text" id="working-directory" name="working_directory" placeholder="/path/to/server">
                    </div>
                    <button type="submit" class="btn btn-primary" style="width: 100%;">Create Server</button>
                </form>
            </div>
        </div>
    `;
}

function render() {
    const app = document.getElementById('app');

    if (!state.token) {
        if (state.currentView === 'register') {
            app.innerHTML = renderRegisterForm();
            attachRegisterHandlers();
        } else {
            app.innerHTML = renderLoginForm();
            attachLoginHandlers();
        }
    } else {
        app.innerHTML = renderDashboard();
        attachDashboardHandlers();
    }
}

// Event handlers
function attachLoginHandlers() {
    const form = document.getElementById('login-form');
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const username = document.getElementById('username').value;
        const password = document.getElementById('password').value;
        const messageArea = document.getElementById('auth-message');

        try {
            await login(username, password);
            await loadDashboard();
        } catch (error) {
            messageArea.innerHTML = showError(error.message);
        }
    });

    document.getElementById('show-register').addEventListener('click', () => {
        state.currentView = 'register';
        render();
    });
}

function attachRegisterHandlers() {
    const form = document.getElementById('register-form');
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const username = document.getElementById('username').value;
        const email = document.getElementById('email').value;
        const password = document.getElementById('password').value;
        const messageArea = document.getElementById('auth-message');

        try {
            await register(username, password, email);
            messageArea.innerHTML = showSuccess('Account created! Please login.');
            setTimeout(() => {
                state.currentView = 'login';
                render();
            }, 2000);
        } catch (error) {
            messageArea.innerHTML = showError(error.message);
        }
    });

    document.getElementById('show-login').addEventListener('click', () => {
        state.currentView = 'login';
        render();
    });
}

function attachDashboardHandlers() {
    const createForm = document.getElementById('create-server-form');
    if (createForm) {
        createForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const formData = new FormData(e.target);
            const serverData = Object.fromEntries(formData);
            const messageArea = document.getElementById('modal-message');

            try {
                await createServer(serverData);
                closeModal();
                messageArea.innerHTML = '';
                showMessage('Server created successfully!', 'success');
                await refreshServers();
            } catch (error) {
                messageArea.innerHTML = showError(error.message);
            }
        });
    }

    // Auto-refresh servers every 5 seconds
    setInterval(async () => {
        if (state.token) {
            await refreshServers();
        }
    }, 5000);
}

// Server action handlers
async function handleStartServer(serverId) {
    try {
        await startServer(serverId);
        showMessage('Server starting...', 'success');
        setTimeout(() => refreshServers(), 1000);
    } catch (error) {
        showMessage(error.message, 'error');
    }
}

async function handleStopServer(serverId) {
    try {
        await stopServer(serverId);
        showMessage('Server stopping...', 'success');
        setTimeout(() => refreshServers(), 1000);
    } catch (error) {
        showMessage(error.message, 'error');
    }
}

async function handleRestartServer(serverId) {
    try {
        await restartServer(serverId);
        showMessage('Server restarting...', 'success');
        setTimeout(() => refreshServers(), 2000);
    } catch (error) {
        showMessage(error.message, 'error');
    }
}

async function handleDeleteServer(serverId) {
    if (!confirm('Are you sure you want to delete this server? This action cannot be undone.')) {
        return;
    }

    try {
        await deleteServer(serverId);
        showMessage('Server deleted successfully!', 'success');
        await refreshServers();
    } catch (error) {
        showMessage(error.message, 'error');
    }
}

function showMessage(message, type) {
    const messageArea = document.getElementById('message-area');
    if (messageArea) {
        messageArea.innerHTML = type === 'success' ? showSuccess(message) : showError(message);
        setTimeout(() => {
            messageArea.innerHTML = '';
        }, 5000);
    }
}

function showCreateServerModal() {
    document.getElementById('create-server-modal').classList.add('active');
}

function closeModal() {
    document.getElementById('create-server-modal').classList.remove('active');
    document.getElementById('modal-message').innerHTML = '';
    document.getElementById('create-server-form').reset();
}

async function refreshServers() {
    try {
        await getServers();
        // Update only the server cards without full re-render
        const serverCards = document.querySelectorAll('.server-card');
        state.servers.forEach(server => {
            const card = document.querySelector(`[data-server-id="${server.id}"]`);
            if (card) {
                const newCard = document.createElement('div');
                newCard.innerHTML = renderServerCard(server);
                card.replaceWith(newCard.firstElementChild);
            }
        });
    } catch (error) {
        console.error('Error refreshing servers:', error);
    }
}

async function loadDashboard() {
    try {
        await getCurrentUser();
        await getServers();
        render();
    } catch (error) {
        console.error('Error loading dashboard:', error);
        await logout();
    }
}

// Initialize app
async function init() {
    if (state.token) {
        try {
            await loadDashboard();
        } catch (error) {
            await logout();
        }
    } else {
        render();
    }
}

// Start the app
init();
