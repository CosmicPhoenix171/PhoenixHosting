const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const bcrypt = require('bcryptjs');

const dbPath = process.env.DATABASE_PATH || path.join(__dirname, '..', 'database.sqlite');

const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Error opening database:', err);
  } else {
    console.log('Connected to SQLite database');
    initializeDatabase();
  }
});

function initializeDatabase() {
  db.serialize(() => {
    // Users table
    db.run(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        email TEXT UNIQUE NOT NULL,
        role TEXT DEFAULT 'user',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Servers table
    db.run(`
      CREATE TABLE IF NOT EXISTS servers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        game_type TEXT NOT NULL,
        host TEXT DEFAULT 'localhost',
        port INTEGER NOT NULL,
        status TEXT DEFAULT 'stopped',
        command TEXT NOT NULL,
        working_directory TEXT,
        owner_id INTEGER NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (owner_id) REFERENCES users(id)
      )
    `);

    // User-Server Access table (for multi-user access)
    db.run(`
      CREATE TABLE IF NOT EXISTS user_server_access (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        server_id INTEGER NOT NULL,
        permission TEXT DEFAULT 'view',
        granted_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id),
        FOREIGN KEY (server_id) REFERENCES servers(id),
        UNIQUE(user_id, server_id)
      )
    `);

    // Create default admin user if no users exist
    db.get('SELECT COUNT(*) as count FROM users', (err, row) => {
      if (!err && row.count === 0) {
        const defaultPassword = 'admin123';
        bcrypt.hash(defaultPassword, 10, (err, hash) => {
          if (!err) {
            db.run(
              'INSERT INTO users (username, password, email, role) VALUES (?, ?, ?, ?)',
              ['admin', hash, 'admin@phoenixhosting.local', 'admin'],
              (err) => {
                if (!err) {
                  console.log('Default admin user created (username: admin, password: admin123)');
                  console.log('⚠️  PLEASE CHANGE THE DEFAULT PASSWORD!');
                }
              }
            );
          }
        });
      }
    });
  });
}

module.exports = db;
