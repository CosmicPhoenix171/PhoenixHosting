# PhoenixHosting

A secure, multi-user, multi-game hosting platform where users can log in through a web control panel, view servers they have access to, and remotely Start / Stop / Restart them.

## Features

✅ **Multi-User Authentication**
- Secure user registration and login
- JWT-based authentication
- Password hashing with bcrypt

✅ **Web Control Panel**
- Clean, modern web interface
- Real-time server status updates
- Easy-to-use dashboard

✅ **Server Management**
- Start, Stop, and Restart game servers
- View server status and uptime
- Multi-game support (Minecraft, CS:GO, any game server)

✅ **Access Control**
- Server ownership system
- Grant view or control access to other users
- Owner, control, and view permissions

✅ **Server Creation** (Stretch Goal)
- Create new servers through the web interface
- Configure server settings (name, game type, port, command)
- Delete servers (owner only)

## Quick Start

### Prerequisites
- Node.js (v14 or higher)
- npm

### Installation

1. Clone the repository:
```bash
git clone https://github.com/CosmicPhoenix171/PhoenixHosting.git
cd PhoenixHosting
```

2. Install dependencies:
```bash
npm install
```

3. Create environment configuration:
```bash
cp .env.example .env
```

4. Edit `.env` file and set your JWT secret:
```bash
JWT_SECRET=your_secure_random_secret_here
PORT=3000
```

### Running the Application

Start the server:
```bash
npm start
```

The application will be available at:
- Web Panel: http://localhost:3000
- API: http://localhost:3000/api

### Default Credentials

On first run, a default admin account is created:
- **Username**: admin
- **Password**: admin123

⚠️ **IMPORTANT**: Change the default password immediately after first login!

## Usage

### Login / Register
1. Navigate to http://localhost:3000
2. Login with your credentials or register a new account

### Managing Servers

#### Creating a Server
1. Click the "+ New Server" button
2. Fill in the server details:
   - **Name**: A friendly name for your server
   - **Game Type**: e.g., Minecraft, CS:GO, or Custom
   - **Host**: Server host (default: localhost)
   - **Port**: Port number for the server
   - **Start Command**: Command to start the server (e.g., `java -jar server.jar`)
   - **Working Directory**: Optional path where the server files are located
3. Click "Create Server"

#### Starting/Stopping Servers
- Click the **Start** button to start a stopped server
- Click the **Stop** button to stop a running server
- Click the **Restart** button to restart a running server

#### Deleting Servers
- Only server owners can delete servers
- Click the **Delete** button and confirm the action

### Access Control
- **Owner**: Full control over the server (start, stop, restart, delete, grant access)
- **Control**: Can start, stop, and restart the server
- **View**: Can only view server status

## API Documentation

### Authentication Endpoints

#### POST /api/auth/register
Register a new user account.

**Request Body:**
```json
{
  "username": "string",
  "password": "string",
  "email": "string"
}
```

#### POST /api/auth/login
Login to an existing account.

**Request Body:**
```json
{
  "username": "string",
  "password": "string"
}
```

**Response:**
```json
{
  "token": "jwt_token",
  "user": {
    "id": 1,
    "username": "string",
    "email": "string",
    "role": "string"
  }
}
```

#### GET /api/auth/me
Get current user information (requires authentication).

### Server Management Endpoints

All server endpoints require authentication via JWT token in the Authorization header:
```
Authorization: Bearer <token>
```

#### GET /api/servers
Get all servers the user has access to.

#### GET /api/servers/:id
Get details of a specific server.

#### POST /api/servers
Create a new server.

**Request Body:**
```json
{
  "name": "string",
  "game_type": "string",
  "host": "string",
  "port": number,
  "command": "string",
  "working_directory": "string" (optional)
}
```

#### POST /api/servers/:id/start
Start a server.

#### POST /api/servers/:id/stop
Stop a server.

#### POST /api/servers/:id/restart
Restart a server.

#### DELETE /api/servers/:id
Delete a server (owner only).

#### POST /api/servers/:id/access
Grant access to another user (owner only).

**Request Body:**
```json
{
  "userId": number,
  "permission": "view" | "control"
}
```

## Architecture

### Backend
- **Framework**: Express.js (Node.js)
- **Database**: SQLite3
- **Authentication**: JWT tokens with bcrypt password hashing
- **Server Management**: Node.js child_process for managing game servers

### Frontend
- **Technology**: Vanilla JavaScript (no framework dependencies)
- **UI**: Modern, responsive design with CSS Grid
- **Real-time Updates**: Auto-refresh every 5 seconds

### Database Schema

#### Users Table
- `id`: Primary key
- `username`: Unique username
- `password`: Hashed password
- `email`: Unique email
- `role`: User role (user/admin)
- `created_at`: Timestamp

#### Servers Table
- `id`: Primary key
- `name`: Server name
- `game_type`: Type of game server
- `host`: Server host
- `port`: Server port
- `status`: Current status (running/stopped)
- `command`: Start command
- `working_directory`: Working directory
- `owner_id`: Foreign key to users
- `created_at`: Timestamp

#### User-Server Access Table
- `id`: Primary key
- `user_id`: Foreign key to users
- `server_id`: Foreign key to servers
- `permission`: Access level (view/control)
- `granted_at`: Timestamp

## Security Features

- ✅ Password hashing with bcrypt
- ✅ JWT token-based authentication
- ✅ Input validation on all endpoints
- ✅ Access control checks for all server operations
- ✅ SQL injection protection (parameterized queries)
- ✅ CORS configuration
- ✅ Secure password requirements (minimum 6 characters)

## Development

To run in development mode with auto-reload, you can use nodemon:

```bash
npm install -g nodemon
nodemon backend/server.js
```

## License

ISC

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## Support

For issues and questions, please open an issue on the GitHub repository.
