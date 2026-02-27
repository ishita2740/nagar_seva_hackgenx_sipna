const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');

const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
const dbPath = path.join(dataDir, 'grievance.db');

let _db = null;

function getDb() {
  if (_db) return _db;
  throw new Error('Database not initialized. Call initDb() first.');
}

function initDb() {
  if (_db) return _db;

  _db = new DatabaseSync(dbPath);
  _db.exec('PRAGMA journal_mode = WAL;');
  _db.exec('PRAGMA foreign_keys = ON;');

  runSchema(_db);
  return _db;
}

function runSchema(db) {
  function ensureColumn(table, column, definition) {
    const cols = db.prepare(`PRAGMA table_info(${table})`).all();
    const exists = cols.some((c) => c.name === column);
    if (!exists) {
      db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
    }
  }

  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      name TEXT NOT NULL,
      phone TEXT,
      role TEXT NOT NULL CHECK(role IN ('citizen', 'authority')),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS grievance_categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      description TEXT,
      department TEXT
    );

    CREATE TABLE IF NOT EXISTS grievances (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ticket_number TEXT UNIQUE NOT NULL,
      citizen_id INTEGER NOT NULL,
      category_id INTEGER NOT NULL,
      title TEXT,
      description TEXT NOT NULL,
      location TEXT,
      latitude REAL,
      longitude REAL,
      image TEXT,
      status TEXT DEFAULT 'submitted' CHECK(status IN ('submitted', 'assigned', 'in_progress', 'resolved', 'rejected', 'reopened')),
      priority TEXT DEFAULT 'medium' CHECK(priority IN ('low', 'medium', 'high', 'urgent')),
      assigned_to INTEGER,
      department TEXT,
      resolution_notes TEXT,
      resolution_image TEXT,
      citizen_rating INTEGER,
      citizen_feedback TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      resolved_at DATETIME,
      FOREIGN KEY (citizen_id) REFERENCES users(id),
      FOREIGN KEY (category_id) REFERENCES grievance_categories(id),
      FOREIGN KEY (assigned_to) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS grievance_comments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      grievance_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      comment TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(grievance_id, user_id, comment, created_at),
      FOREIGN KEY (grievance_id) REFERENCES grievances(id),
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE INDEX IF NOT EXISTS idx_grievances_citizen ON grievances(citizen_id);
    CREATE INDEX IF NOT EXISTS idx_grievances_status ON grievances(status);
    CREATE INDEX IF NOT EXISTS idx_grievances_assigned ON grievances(assigned_to);
    CREATE INDEX IF NOT EXISTS idx_grievances_created ON grievances(created_at);
    CREATE INDEX IF NOT EXISTS idx_comments_grievance ON grievance_comments(grievance_id);
  `);

  ensureColumn('grievances', 'submitted_name', 'TEXT');

  const categories = [
    ['Potholes & Roads', 'Road damage, potholes, pavement issues', 'Public Works'],
    ['Street Lights', 'Non-functional street lights, dark areas', 'Municipal Corporation'],
    ['Waste Management', 'Garbage collection, dumping, sanitation', 'Sanitation Department'],
    ['Water Supply', 'Water leakage, supply issues', 'Water Board'],
    ['Drainage', 'Blocked drains, flooding', 'Drainage Department'],
    ['Parks & Green Spaces', 'Maintenance of parks and gardens', 'Horticulture'],
    ['Traffic & Parking', 'Traffic signals, parking issues', 'Traffic Police'],
    ['Noise Pollution', 'Noise complaints', 'Pollution Control'],
    ['Other', 'Other civic issues', 'General']
  ];

  const insertCategory = db.prepare(`
    INSERT OR IGNORE INTO grievance_categories (name, description, department)
    VALUES (?, ?, ?)
  `);

  categories.forEach(([name, desc, dept]) => {
    try {
      insertCategory.run(name, desc, dept);
    } catch (_e) {
      // Category already exists or insert skipped.
    }
  });

  const adminHash = bcrypt.hashSync('admin123', 10);
  const insertAdmin = db.prepare(`
    INSERT OR IGNORE INTO users (email, password, name, role)
    VALUES (?, ?, ?, 'authority')
  `);

  try {
    insertAdmin.run('admin@government.gov', adminHash, 'System Administrator');
  } catch (_e) {
    // Admin already exists or insert skipped.
  }
}

module.exports = { initDb, getDb };