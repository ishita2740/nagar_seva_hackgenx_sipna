import bcrypt from "bcryptjs";
import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
export const DEMO_CONTRACTORS = [
    { name: "Contractor One", email: "contractor1@nagarseva.gov", password: "contractor123" },
    { name: "Contractor Two", email: "contractor2@nagarseva.gov", password: "contractor234" },
    { name: "Contractor Three", email: "contractor3@nagarseva.gov", password: "contractor345" }
];
const dataDir = path.join(process.cwd(), "data");
const dbPath = path.join(dataDir, "grievance.db");
let db = null;
export function initDb() {
    if (db)
        return db;
    if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
    }
    db = new DatabaseSync(dbPath);
    db.exec("PRAGMA journal_mode = WAL;");
    db.exec("PRAGMA foreign_keys = ON;");
    db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      name TEXT NOT NULL,
      phone TEXT,
      role TEXT NOT NULL CHECK(role IN ('citizen', 'authority', 'contractor')),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS grievance_categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE
    );

    CREATE TABLE IF NOT EXISTS grievances (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ticket_number TEXT UNIQUE NOT NULL,
      citizen_id INTEGER NOT NULL,
      category_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      reporter_name TEXT,
      reporter_email TEXT,
      reporter_mobile TEXT,
      assigned_department TEXT,
      location TEXT NOT NULL,
      latitude REAL,
      longitude REAL,
      images_json TEXT,
      priority TEXT DEFAULT 'medium' CHECK(priority IN ('low', 'medium', 'high')),
      status TEXT DEFAULT 'submitted' CHECK(status IN ('submitted', 'assigned', 'in_progress', 'resolved', 'rejected', 'reopened')),
      complaint_status TEXT DEFAULT 'pending',
      resolution_image_url TEXT,
      contractor_id INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (citizen_id) REFERENCES users(id),
      FOREIGN KEY (category_id) REFERENCES grievance_categories(id),
      FOREIGN KEY (contractor_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS user_sessions (
      token TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id)
    );
  `);
    ensureUsersRoleSupportsContractor(db);
    ensureGrievancesWorkflowSchema(db);
    ensureColumn(db, "users", "phone", "TEXT");
    ensureColumn(db, "grievances", "reporter_name", "TEXT");
    ensureColumn(db, "grievances", "reporter_email", "TEXT");
    ensureColumn(db, "grievances", "reporter_mobile", "TEXT");
    ensureColumn(db, "grievances", "assigned_department", "TEXT");
    ensureColumn(db, "grievances", "images_json", "TEXT");
    ensureColumn(db, "grievances", "complaint_status", "TEXT DEFAULT 'pending'");
    ensureColumn(db, "grievances", "resolution_image_url", "TEXT");
    ensureColumn(db, "grievances", "contractor_id", "INTEGER");
    seed(db);
    return db;
}
export function getDb() {
    if (!db)
        throw new Error("Database not initialized");
    return db;
}
function seed(database) {
    const categoryNames = [
        "Roads & Potholes",
        "Waste Management",
        "Street Lights",
        "Water Supply",
        "Drainage",
        "Public Safety"
    ];
    const insertCategory = database.prepare("INSERT OR IGNORE INTO grievance_categories (name) VALUES (?)");
    for (const name of categoryNames) {
        insertCategory.run(name);
    }
    const adminEmail = "admin@nagarseva.gov";
    const adminHash = bcrypt.hashSync("admin123", 10);
    database
        .prepare("INSERT OR IGNORE INTO users (email, password, name, role) VALUES (?, ?, ?, 'authority')")
        .run(adminEmail, adminHash, "Municipal Officer");
    const citizenEmail = "citizen@nagarseva.com";
    const citizenHash = bcrypt.hashSync("citizen123", 10);
    database
        .prepare("INSERT OR IGNORE INTO users (email, password, name, role) VALUES (?, ?, ?, 'citizen')")
        .run(citizenEmail, citizenHash, "Harsh");
    const insertContractor = database.prepare("INSERT OR IGNORE INTO users (email, password, name, role) VALUES (?, ?, ?, 'contractor')");
    for (const contractor of DEMO_CONTRACTORS) {
        insertContractor.run(contractor.email, bcrypt.hashSync(contractor.password, 10), contractor.name);
    }
    // Intentionally do not seed demo grievances.
}
function ensureColumn(database, table, column, definition) {
    const columns = database.prepare(`PRAGMA table_info(${table})`).all();
    const exists = columns.some((item) => item.name === column);
    if (!exists) {
        database.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
    }
}
function ensureUsersRoleSupportsContractor(database) {
    const row = database
        .prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'users'")
        .get();
    const tableSql = row?.sql ?? "";
    if (tableSql.includes("'contractor'")) {
        return;
    }
    database.exec("PRAGMA foreign_keys = OFF;");
    try {
        database.exec(`
      BEGIN TRANSACTION;
      CREATE TABLE users_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        name TEXT NOT NULL,
        phone TEXT,
        role TEXT NOT NULL CHECK(role IN ('citizen', 'authority', 'contractor')),
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
      INSERT INTO users_new (id, email, password, name, phone, role, created_at)
      SELECT id, email, password, name, phone, role, created_at
      FROM users;
      DROP TABLE users;
      ALTER TABLE users_new RENAME TO users;
      COMMIT;
    `);
    }
    catch (error) {
        database.exec("ROLLBACK;");
        throw error;
    }
    finally {
        database.exec("PRAGMA foreign_keys = ON;");
    }
}
function ensureGrievancesWorkflowSchema(database) {
    const row = database
        .prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'grievances'")
        .get();
    const tableSql = row?.sql ?? "";
    const expectedStatusConstraint = "status IN ('submitted', 'assigned', 'in_progress', 'resolved', 'rejected', 'reopened')";
    const expectedPriorityConstraint = "priority IN ('low', 'medium', 'high')";
    if (tableSql.includes(expectedStatusConstraint) && tableSql.includes(expectedPriorityConstraint)) {
        // Still normalize old values if any rows were written before migration.
        normalizeGrievanceWorkflowData(database);
        return;
    }
    database.exec("PRAGMA foreign_keys = OFF;");
    try {
        database.exec(`
      BEGIN TRANSACTION;
      CREATE TABLE grievances_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ticket_number TEXT UNIQUE NOT NULL,
        citizen_id INTEGER NOT NULL,
        category_id INTEGER NOT NULL,
        title TEXT NOT NULL,
        description TEXT NOT NULL,
        reporter_name TEXT,
        reporter_email TEXT,
        reporter_mobile TEXT,
        assigned_department TEXT,
        location TEXT NOT NULL,
        latitude REAL,
        longitude REAL,
        images_json TEXT,
        priority TEXT DEFAULT 'medium' CHECK(priority IN ('low', 'medium', 'high')),
        status TEXT DEFAULT 'submitted' CHECK(status IN ('submitted', 'assigned', 'in_progress', 'resolved', 'rejected', 'reopened')),
        complaint_status TEXT DEFAULT 'pending',
        resolution_image_url TEXT,
        contractor_id INTEGER,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (citizen_id) REFERENCES users(id),
        FOREIGN KEY (category_id) REFERENCES grievance_categories(id),
        FOREIGN KEY (contractor_id) REFERENCES users(id)
      );

      INSERT INTO grievances_new (
        id, ticket_number, citizen_id, category_id, title, description,
        reporter_name, reporter_email, reporter_mobile, assigned_department,
        location, latitude, longitude, images_json, priority, status,
        complaint_status, resolution_image_url, contractor_id, created_at, updated_at
      )
      SELECT
        id,
        ticket_number,
        citizen_id,
        category_id,
        title,
        description,
        reporter_name,
        reporter_email,
        reporter_mobile,
        assigned_department,
        location,
        latitude,
        longitude,
        images_json,
        CASE
          WHEN priority IN ('low', 'medium', 'high') THEN priority
          WHEN priority = 'urgent' THEN 'high'
          ELSE 'medium'
        END AS priority,
        CASE
          WHEN status = 'under_review' THEN 'assigned'
          WHEN status = 'awaiting_confirmation' THEN 'in_progress'
          WHEN status = 'closed' THEN 'resolved'
          WHEN status = 'escalated' THEN 'reopened'
          WHEN status IN ('submitted', 'assigned', 'in_progress', 'resolved', 'rejected', 'reopened') THEN status
          ELSE 'submitted'
        END AS status,
        CASE
          WHEN complaint_status IS NULL OR complaint_status = '' THEN 'pending'
          WHEN complaint_status IN ('pending', 'accepted', 'in_progress', 'closed', 'rejected', 'reopened') THEN complaint_status
          ELSE 'pending'
        END AS complaint_status,
        resolution_image_url,
        contractor_id,
        created_at,
        updated_at
      FROM grievances;

      DROP TABLE grievances;
      ALTER TABLE grievances_new RENAME TO grievances;
      COMMIT;
    `);
    }
    catch (error) {
        database.exec("ROLLBACK;");
        throw error;
    }
    finally {
        database.exec("PRAGMA foreign_keys = ON;");
    }
    normalizeGrievanceWorkflowData(database);
}
function normalizeGrievanceWorkflowData(database) {
    database.prepare(`
      UPDATE grievances
      SET status = CASE
        WHEN status = 'under_review' THEN 'assigned'
        WHEN status = 'awaiting_confirmation' THEN 'in_progress'
        WHEN status = 'closed' THEN 'resolved'
        WHEN status = 'escalated' THEN 'reopened'
        WHEN status IN ('submitted', 'assigned', 'in_progress', 'resolved', 'rejected', 'reopened') THEN status
        ELSE 'submitted'
      END,
      priority = CASE
        WHEN priority IN ('low', 'medium', 'high') THEN priority
        WHEN priority = 'urgent' THEN 'high'
        ELSE 'medium'
      END
    `).run();
}
