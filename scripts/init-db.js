// Database initialization - schema is now in db.js
// Run: node -e "require('./db').initDb(); console.log('DB ready')"
// Or just start the server - it auto-initializes

const { initDb } = require('../db');

try {
  initDb();
  console.log('Database initialized successfully.');
} catch (e) {
  console.error('DB init failed:', e.message);
  process.exit(1);
}