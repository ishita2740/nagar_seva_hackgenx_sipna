const express = require('express');
const cors = require('cors');
const path = require('path');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const { initDb, getDb } = require('./db');
const multer = require('multer');


// Multer storage config
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/');
  },
  filename: (req, file, cb) => {
    const uniqueName =
      Date.now() + '-' + Math.round(Math.random() * 1e9);

    cb(null, uniqueName + path.extname(file.originalname));
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB per image
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only images allowed'), false);
    }
  }
});


const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Simple session store (in production use Redis or proper sessions)
const sessions = new Map();

const authMiddleware = (req, res, next) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token || !sessions.has(token)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  req.user = sessions.get(token);
  next();
};

// ============ AUTH ROUTES ============

// Citizen Login
app.post('/api/auth/citizen/login', (req, res) => {
  const db = getDb();
  const { email, password } = req.body;
  const user = db.prepare('SELECT * FROM users WHERE email = ? AND role = ?').get(email, 'citizen');
  if (!user || !bcrypt.compareSync(password, user.password)) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }
  const token = uuidv4();
  sessions.set(token, { id: user.id, email: user.email, role: 'citizen', name: user.name });
  res.json({ token, user: { id: user.id, name: user.name, email: user.email, role: 'citizen' } });
});

// Citizen Register
app.post('/api/auth/citizen/register', (req, res) => {
  const db = getDb();
  const { email, password, name, phone } = req.body;
  if (!email || !password || !name) {
    return res.status(400).json({ error: 'Email, password and name are required' });
  }
  const hash = bcrypt.hashSync(password, 10);
  try {
    const result = db.prepare('INSERT INTO users (email, password, name, phone, role) VALUES (?, ?, ?, ?, ?)')
      .run(email, hash, name, phone || null, 'citizen');
    const token = uuidv4();
    const user = { id: result.lastInsertRowid, email, name, role: 'citizen' };
    sessions.set(token, { id: user.id, email, role: 'citizen', name });
    res.status(201).json({ token, user });
  } catch (e) {
    if (e.message && e.message.includes('UNIQUE')) {
      return res.status(400).json({ error: 'Email already registered' });
    }
    throw e;
  }
});

// Authority Login
app.post('/api/auth/authority/login', (req, res) => {
  const db = getDb();
  const { email, password } = req.body;
  const user = db.prepare('SELECT * FROM users WHERE email = ? AND role = ?').get(email, 'authority');
  if (!user || !bcrypt.compareSync(password, user.password)) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }
  const token = uuidv4();
  sessions.set(token, { id: user.id, email: user.email, role: 'authority', name: user.name });
  res.json({ token, user: { id: user.id, name: user.name, email: user.email, role: 'authority' } });
});

// Logout
app.post('/api/auth/logout', (req, res) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (token) sessions.delete(token);
  res.json({ success: true });
});

// ============ CATEGORIES ============
app.get('/api/categories', (req, res) => {
  const db = getDb();
  const categories = db.prepare('SELECT * FROM grievance_categories ORDER BY name').all();
  res.json(categories);
});

// ============ CITIZEN GRIEVANCE ROUTES ============

// Auto-compute priority from category and description
function computePriority(categoryId, description) {
  const desc = (description || '').toLowerCase();
  const urgentWords = ['emergency', 'flood', 'flooding', 'blocked', 'critical', 'accident', 'danger', 'leak', 'sewage', 'burst', 'collapse', 'hazard'];
  const highWords = ['urgent', 'severe', 'broken', 'damaged', 'hazardous', 'overflow', 'blockage'];
  const lowWords = ['minor', 'slight', 'cosmetic', 'small'];
  if (urgentWords.some(w => desc.includes(w))) return 'urgent';
  if (highWords.some(w => desc.includes(w))) return 'high';
  if (lowWords.some(w => desc.includes(w))) return 'low';
  const category = getDb().prepare('SELECT name FROM grievance_categories WHERE id = ?').get(categoryId);
  const name = (category?.name || '').toLowerCase();
  if (name.includes('water') || name.includes('drainage') || name.includes('waste')) return 'high';
  if (name.includes('pothole') || name.includes('road') || name.includes('traffic')) return 'medium';
  if (name.includes('park') || name.includes('noise') || name.includes('other')) return 'low';
  return 'medium';
}

// Submit grievance
app.post('/api/grievances', authMiddleware, upload.array('images', 5),  async(req, res) => {
  const db = getDb();
  if (req.user.role !== 'citizen') return res.status(403).json({ error: 'Forbidden' });
  const { category_id, name, description, location, latitude, longitude } = req.body;

  const catId = parseInt(category_id, 10);
  if (!catId || catId < 1) return res.status(400).json({ error: 'Please select a category' });
  const desc = (description || '').trim();
  const submittedName = (name || '').trim();
  if (!desc) return res.status(400).json({ error: 'Description is required' });
  if (!submittedName) return res.status(400).json({ error: 'Name is required' });
  if (!(location || '').trim()) return res.status(400).json({ error: 'Location is required' });

  const title = desc.split(/\r?\n/)[0].slice(0, 100) || 'Grievance';
  const priority = computePriority(catId, desc);
  const ticketNumber = 'GRV-' + Date.now() + '-' + Math.random().toString(36).substr(2, 6).toUpperCase();
  try {
    db.prepare(`
      INSERT INTO grievances (ticket_number, citizen_id, category_id, title, description, location, latitude, longitude, priority, submitted_name)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(ticketNumber, req.user.id, catId, title, desc, (location || '').trim() || null, latitude || null, longitude || null, priority, submittedName);
    const grievance = db.prepare('SELECT g.*, c.name as category_name FROM grievances g JOIN grievance_categories c ON g.category_id = c.id WHERE g.ticket_number = ?').get(ticketNumber);
    if (!grievance) return res.status(500).json({ error: 'Failed to retrieve created grievance' });
    res.status(201).json(grievance);
  } catch (e) {
    console.error('Grievance submit error:', e);
    res.status(500).json({ error: e.message || 'Database error. Please try again.' });
  }
});

// Get citizen's grievances
app.get('/api/grievances/my', authMiddleware, (req, res) => {
  const db = getDb();
  if (req.user.role !== 'citizen') return res.status(403).json({ error: 'Forbidden' });
  const grievances = db.prepare(`
    SELECT g.*, c.name as category_name, c.department, u.name as account_name
    FROM grievances g 
    JOIN grievance_categories c ON g.category_id = c.id 
    JOIN users u ON g.citizen_id = u.id
    WHERE g.citizen_id = ? 
    ORDER BY g.created_at DESC
  `).all(req.user.id);
  res.json(grievances);
});

// Get single grievance (citizen - own only)
app.get('/api/grievances/:id', authMiddleware, (req, res) => {
  const db = getDb();
  const grievance = db.prepare(`
    SELECT g.*, c.name as category_name, c.department, u.name as citizen_name, u.email as citizen_email
    FROM grievances g 
    JOIN grievance_categories c ON g.category_id = c.id 
    JOIN users u ON g.citizen_id = u.id
    WHERE g.id = ?
  `).get(req.params.id);
  if (!grievance) return res.status(404).json({ error: 'Not found' });
  if (req.user.role === 'citizen' && grievance.citizen_id !== req.user.id) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  const comments = db.prepare(`
    SELECT gc.*, u.name as user_name 
    FROM grievance_comments gc 
    JOIN users u ON gc.user_id = u.id 
    WHERE gc.grievance_id = ? 
    ORDER BY gc.created_at ASC
  `).all(req.params.id);
  res.json({ ...grievance, comments });
});

// Add feedback/rating (citizen)
app.post('/api/grievances/:id/feedback', authMiddleware, (req, res) => {
  const db = getDb();
  if (req.user.role !== 'citizen') return res.status(403).json({ error: 'Forbidden' });
  const { rating, feedback } = req.body;
  const grievance = db.prepare('SELECT * FROM grievances WHERE id = ?').get(req.params.id);
  if (!grievance || grievance.citizen_id !== req.user.id) return res.status(404).json({ error: 'Not found' });
  if (grievance.status !== 'resolved') return res.status(400).json({ error: 'Can only rate resolved grievances' });
  db.prepare('UPDATE grievances SET citizen_rating = ?, citizen_feedback = ? WHERE id = ?').run(rating || null, feedback || null, req.params.id);
  res.json({ success: true });
});

// Reopen grievance (citizen)
app.post('/api/grievances/:id/reopen', authMiddleware, (req, res) => {
  const db = getDb();
  if (req.user.role !== 'citizen') return res.status(403).json({ error: 'Forbidden' });
  const grievance = db.prepare('SELECT * FROM grievances WHERE id = ?').get(req.params.id);
  if (!grievance || grievance.citizen_id !== req.user.id) return res.status(404).json({ error: 'Not found' });
  if (grievance.status !== 'resolved') return res.status(400).json({ error: 'Can only reopen resolved grievances' });
  db.prepare("UPDATE grievances SET status = 'reopened', updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(req.params.id);
  res.json({ success: true });
});

// ============ AUTHORITY ROUTES ============

// Get all grievances (authority)
app.get('/api/authority/grievances', authMiddleware, (req, res) => {
  const db = getDb();
  if (req.user.role !== 'authority') return res.status(403).json({ error: 'Forbidden' });
  const { status, department, page = 1, limit = 20 } = req.query;
  let sql = `
    SELECT g.*, c.name as category_name, c.department as cat_department, u.name as citizen_name, u.email as citizen_email
    FROM grievances g 
    JOIN grievance_categories c ON g.category_id = c.id 
    JOIN users u ON g.citizen_id = u.id
    WHERE 1=1
  `;
  const params = [];
  if (status) { sql += ' AND g.status = ?'; params.push(status); }
  if (department) { sql += ' AND (c.department = ? OR g.department = ?)'; params.push(department, department); }
  sql += ' ORDER BY g.created_at DESC LIMIT ? OFFSET ?';
  params.push(parseInt(limit), (parseInt(page) - 1) * parseInt(limit));
  const grievances = db.prepare(sql).all(...params);
  const countResult = db.prepare(`
    SELECT COUNT(*) as total FROM grievances g 
    JOIN grievance_categories c ON g.category_id = c.id 
    WHERE 1=1 ${status ? 'AND g.status = ?' : ''} ${department ? 'AND (c.department = ? OR g.department = ?)' : ''}
  `).get(...(status ? [status] : []).concat(department ? [department, department] : []));
  res.json({ grievances, total: countResult?.total || 0 });
});

// Update grievance status (authority)
app.patch('/api/authority/grievances/:id', authMiddleware, (req, res) => {
  const db = getDb();
  if (req.user.role !== 'authority') return res.status(403).json({ error: 'Forbidden' });
  const { status, department, resolution_notes, priority } = req.body;
  const updates = [];
  const params = [];
  if (status) { updates.push('status = ?'); params.push(status); }
  if (department) { updates.push('department = ?'); params.push(department); }
  if (resolution_notes !== undefined) { updates.push('resolution_notes = ?'); params.push(resolution_notes); }
  if (priority) { updates.push('priority = ?'); params.push(priority); }
  if (status === 'resolved') { updates.push('resolved_at = CURRENT_TIMESTAMP'); }
  if (updates.length === 0) return res.status(400).json({ error: 'No updates provided' });
  updates.push('updated_at = CURRENT_TIMESTAMP');
  params.push(req.params.id);
  db.prepare(`UPDATE grievances SET ${updates.join(', ')} WHERE id = ?`).run(...params);
  const grievance = db.prepare('SELECT g.*, c.name as category_name FROM grievances g JOIN grievance_categories c ON g.category_id = c.id WHERE g.id = ?').get(req.params.id);
  res.json(grievance);
});

// Add comment (authority or citizen)
app.post('/api/grievances/:id/comments', authMiddleware, (req, res) => {
  const db = getDb();
  const { comment } = req.body;
  const grievance = db.prepare('SELECT * FROM grievances WHERE id = ?').get(req.params.id);
  if (!grievance) return res.status(404).json({ error: 'Not found' });
  if (req.user.role === 'citizen' && grievance.citizen_id !== req.user.id) return res.status(403).json({ error: 'Forbidden' });
  const result = db.prepare('INSERT INTO grievance_comments (grievance_id, user_id, comment) VALUES (?, ?, ?)').run(req.params.id, req.user.id, comment);
  const newComment = db.prepare('SELECT gc.*, u.name as user_name FROM grievance_comments gc JOIN users u ON gc.user_id = u.id WHERE gc.id = ?').get(result.lastInsertRowid);
  res.status(201).json(newComment);
});

// Dashboard stats (authority)
app.get('/api/authority/dashboard', authMiddleware, (req, res) => {
  const db = getDb();
  if (req.user.role !== 'authority') return res.status(403).json({ error: 'Forbidden' });
  const stats = db.prepare(`
    SELECT status, COUNT(*) as count FROM grievances GROUP BY status
  `).all();
  const total = db.prepare('SELECT COUNT(*) as c FROM grievances').get().c;
  const resolved = db.prepare("SELECT COUNT(*) as c FROM grievances WHERE status = 'resolved'").get().c;
  const byCategory = db.prepare(`
    SELECT c.name, COUNT(g.id) as count FROM grievance_categories c 
    LEFT JOIN grievances g ON c.id = g.category_id 
    GROUP BY c.id
  `).all();
  res.json({ byStatus: stats, total, resolved, byCategory });
});

// Serve HTML pages
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.get('/citizen-login', (req, res) => res.sendFile(path.join(__dirname, 'public', 'citizen-login.html')));
app.get('/authority-login', (req, res) => res.sendFile(path.join(__dirname, 'public', 'authority-login.html')));
app.get('/citizen-dashboard', (req, res) => res.sendFile(path.join(__dirname, 'public', 'citizen-dashboard.html')));
app.get('/authority-dashboard', (req, res) => res.sendFile(path.join(__dirname, 'public', 'authority-dashboard.html')));
app.get('/submit-grievance', (req, res) => res.sendFile(path.join(__dirname, 'public', 'submit-grievance.html')));
app.get('/grievance/:id', (req, res) => res.sendFile(path.join(__dirname, 'public', 'grievance-detail.html')));

// Ensure data directory exists
const fs = require('fs');
const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

// Initialize DB and start server
try {
  initDb();
  app.listen(PORT, () => {
    console.log(`Smart Urban Grievance System running at http://localhost:${PORT}`);
  });
} catch (e) {
  console.error('Failed to start:', e.message);
  process.exit(1);
}


// language changer 
const i18next = require('i18next');
const Backend = require('i18next-fs-backend');
const middleware = require('i18next-http-middleware');

i18next
  .use(Backend)
  .use(middleware.LanguageDetector)
  .init({
    fallbackLng: 'en',
    backend: { loadPath: './locales/{{lng}}.json' }
  });

app.use(middleware.handle(i18next));