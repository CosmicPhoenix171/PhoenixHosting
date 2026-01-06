const express = require('express');
const db = require('../database');
const serverManager = require('../serverManager');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

// Helper function to check if user has access to server
function checkServerAccess(userId, serverId, callback) {
  const query = `
    SELECT s.*, 
           CASE 
             WHEN s.owner_id = ? THEN 'owner'
             ELSE usa.permission
           END as user_permission
    FROM servers s
    LEFT JOIN user_server_access usa ON s.id = usa.server_id AND usa.user_id = ?
    WHERE s.id = ? AND (s.owner_id = ? OR usa.user_id = ?)
  `;
  
  db.get(query, [userId, userId, serverId, userId, userId], callback);
}

// Get all servers user has access to
router.get('/', authenticateToken, (req, res) => {
  const query = `
    SELECT DISTINCT s.*, 
           CASE 
             WHEN s.owner_id = ? THEN 'owner'
             ELSE usa.permission
           END as user_permission
    FROM servers s
    LEFT JOIN user_server_access usa ON s.id = usa.server_id
    WHERE s.owner_id = ? OR usa.user_id = ?
    ORDER BY s.name
  `;

  db.all(query, [req.user.id, req.user.id, req.user.id], (err, servers) => {
    if (err) {
      return res.status(500).json({ error: 'Database error' });
    }

    // Add real-time status to each server
    const serversWithStatus = servers.map(server => {
      const status = serverManager.getServerStatus(server.id);
      return { ...server, ...status };
    });

    res.json(serversWithStatus);
  });
});

// Get specific server
router.get('/:id', authenticateToken, (req, res) => {
  checkServerAccess(req.user.id, req.params.id, (err, server) => {
    if (err) {
      return res.status(500).json({ error: 'Database error' });
    }
    if (!server) {
      return res.status(404).json({ error: 'Server not found or access denied' });
    }

    const status = serverManager.getServerStatus(server.id);
    res.json({ ...server, ...status });
  });
});

// Create new server (stretch goal)
router.post('/', authenticateToken, (req, res) => {
  const { name, game_type, host, port, command, working_directory } = req.body;

  if (!name || !game_type || !port || !command) {
    return res.status(400).json({ 
      error: 'Name, game_type, port, and command are required' 
    });
  }

  db.run(
    `INSERT INTO servers (name, game_type, host, port, command, working_directory, owner_id) 
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [name, game_type, host || 'localhost', port, command, working_directory || null, req.user.id],
    function(err) {
      if (err) {
        return res.status(500).json({ error: 'Error creating server' });
      }

      res.status(201).json({
        message: 'Server created successfully',
        serverId: this.lastID
      });
    }
  );
});

// Start server
router.post('/:id/start', authenticateToken, (req, res) => {
  checkServerAccess(req.user.id, req.params.id, (err, server) => {
    if (err) {
      return res.status(500).json({ error: 'Database error' });
    }
    if (!server) {
      return res.status(404).json({ error: 'Server not found or access denied' });
    }
    if (server.user_permission === 'view') {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }

    try {
      const result = serverManager.startServer(
        server.id, 
        server.command, 
        server.working_directory
      );

      // Update status in database
      db.run('UPDATE servers SET status = ? WHERE id = ?', ['running', server.id]);

      res.json({ 
        message: 'Server started successfully',
        pid: result.pid,
        startTime: result.startTime
      });
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });
});

// Stop server
router.post('/:id/stop', authenticateToken, (req, res) => {
  checkServerAccess(req.user.id, req.params.id, (err, server) => {
    if (err) {
      return res.status(500).json({ error: 'Database error' });
    }
    if (!server) {
      return res.status(404).json({ error: 'Server not found or access denied' });
    }
    if (server.user_permission === 'view') {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }

    try {
      serverManager.stopServer(server.id);

      // Update status in database
      db.run('UPDATE servers SET status = ? WHERE id = ?', ['stopped', server.id]);

      res.json({ message: 'Server stopped successfully' });
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });
});

// Restart server
router.post('/:id/restart', authenticateToken, async (req, res) => {
  checkServerAccess(req.user.id, req.params.id, async (err, server) => {
    if (err) {
      return res.status(500).json({ error: 'Database error' });
    }
    if (!server) {
      return res.status(404).json({ error: 'Server not found or access denied' });
    }
    if (server.user_permission === 'view') {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }

    try {
      const result = await serverManager.restartServer(
        server.id, 
        server.command, 
        server.working_directory
      );

      // Update status in database
      db.run('UPDATE servers SET status = ? WHERE id = ?', ['running', server.id]);

      res.json({ 
        message: 'Server restarted successfully',
        pid: result.pid,
        startTime: result.startTime
      });
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });
});

// Get server logs
router.get('/:id/logs', authenticateToken, (req, res) => {
  checkServerAccess(req.user.id, req.params.id, (err, server) => {
    if (err) {
      return res.status(500).json({ error: 'Database error' });
    }
    if (!server) {
      return res.status(404).json({ error: 'Server not found or access denied' });
    }

    const limit = parseInt(req.query.limit) || 50;
    const logs = serverManager.getServerLogs(server.id, limit);
    res.json({ logs });
  });
});

// Delete server (owner only)
router.delete('/:id', authenticateToken, (req, res) => {
  checkServerAccess(req.user.id, req.params.id, (err, server) => {
    if (err) {
      return res.status(500).json({ error: 'Database error' });
    }
    if (!server) {
      return res.status(404).json({ error: 'Server not found or access denied' });
    }
    if (server.user_permission !== 'owner') {
      return res.status(403).json({ error: 'Only the owner can delete a server' });
    }

    // Stop server if running
    try {
      serverManager.stopServer(server.id);
    } catch (e) {
      // Server not running, continue
    }

    // Delete from database
    db.run('DELETE FROM servers WHERE id = ?', [server.id], (err) => {
      if (err) {
        return res.status(500).json({ error: 'Error deleting server' });
      }
      res.json({ message: 'Server deleted successfully' });
    });
  });
});

// Grant access to another user (owner only)
router.post('/:id/access', authenticateToken, (req, res) => {
  const { userId, permission } = req.body;

  if (!userId || !permission) {
    return res.status(400).json({ error: 'userId and permission are required' });
  }

  if (!['view', 'control'].includes(permission)) {
    return res.status(400).json({ error: 'Permission must be "view" or "control"' });
  }

  checkServerAccess(req.user.id, req.params.id, (err, server) => {
    if (err) {
      return res.status(500).json({ error: 'Database error' });
    }
    if (!server) {
      return res.status(404).json({ error: 'Server not found or access denied' });
    }
    if (server.user_permission !== 'owner') {
      return res.status(403).json({ error: 'Only the owner can grant access' });
    }

    db.run(
      `INSERT OR REPLACE INTO user_server_access (user_id, server_id, permission) 
       VALUES (?, ?, ?)`,
      [userId, server.id, permission],
      (err) => {
        if (err) {
          return res.status(500).json({ error: 'Error granting access' });
        }
        res.json({ message: 'Access granted successfully' });
      }
    );
  });
});

module.exports = router;
