import dotenv from "dotenv";
dotenv.config();
const geminiApiKey = process.env.GEMINI_API_KEY;
const mapsApiKey = process.env.GOOGLE_MAPS_API_KEY;
import bcrypt from "bcryptjs";
import cors from "cors";
import express from "express";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import multer from "multer";
import { v4 as uuid } from "uuid";
import { z } from "zod";
import { DEMO_CONTRACTORS, getDb, initDb } from "./db.js";
import { analyzeComplaint, verifyResolution } from "./services/aiService.js";
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
void __dirname;
const app = express();
const PORT = Number(process.env.PORT ?? 3000);
const sessions = new Map();
const ALLOWED_STATUS = ["submitted", "assigned", "in_progress", "resolved", "rejected", "reopened"];
/* =====================================================
   BASIC MIDDLEWARE
===================================================== */
app.use(cors());
app.use(express.json());
/* =====================================================
   UPLOAD CONFIG
===================================================== */
const uploadsDir = path.resolve(process.cwd(), "uploads");
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
}
app.use("/uploads", express.static(uploadsDir));
const upload = multer({
    storage: multer.diskStorage({
        destination: (_req, _file, cb) => cb(null, uploadsDir),
        filename: (_req, file, cb) => {
            const uniqueName = `${Date.now()}-${Math.round(Math.random() * 1e9)}${path.extname(file.originalname)}`;
            cb(null, uniqueName);
        }
    }),
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
        if (!file.mimetype.startsWith("image/")) {
            cb(new Error("Only image files allowed"));
            return;
        }
        cb(null, true);
    }
});
function auth(req, res, next) {
    const token = req.headers.authorization?.replace("Bearer ", "");
    if (!token) {
        return res.status(401).json({ error: "Unauthorized" });
    }
    let sessionUser = sessions.get(token);
    if (!sessionUser) {
        const db = getDb();
        const row = db
            .prepare(`
        SELECT u.id, u.email, u.name, u.role
        FROM user_sessions s
        JOIN users u ON u.id = s.user_id
        WHERE s.token = ?
      `)
            .get(token);
        if (row) {
            sessionUser = row;
            sessions.set(token, row);
        }
    }
    if (!sessionUser) {
        return res.status(401).json({ error: "Unauthorized" });
    }
    req.user = sessionUser;
    next();
}
/* =====================================================
   HEALTH CHECK
===================================================== */
app.get("/api/health", (_req, res) => {
    res.json({ ok: true });
});
/* =====================================================
   AUTH ROUTES
===================================================== */
const authSchema = z.object({
    email: z.string().email(),
    password: z.string().min(6)
});
/* ---------- REGISTER ---------- */
app.post("/api/auth/register", (req, res) => {
    const schema = z.object({
        name: z.string().min(2),
        email: z.string().email(),
        password: z.string().min(6)
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
        return res.status(400).json({ error: "Invalid payload" });
    }
    const { name, email, password } = parsed.data;
    const db = getDb();
    const existing = db.prepare("SELECT id FROM users WHERE email = ?").get(email);
    if (existing) {
        return res.status(400).json({ error: "User already exists" });
    }
    const hashed = bcrypt.hashSync(password, 10);
    db.prepare("INSERT INTO users (name, email, password, role) VALUES (?, ?, ?, ?)").run(name, email, hashed, "citizen");
    res.json({ message: "Registered successfully" });
});
/* ---------- LOGIN ---------- */
app.post("/api/auth/login", (req, res) => {
    const parsed = authSchema.safeParse(req.body);
    if (!parsed.success) {
        return res.status(400).json({ error: "Invalid payload" });
    }
    const role = req.body.role ?? "citizen";
    const { email, password } = parsed.data;
    const db = getDb();
    const user = db.prepare("SELECT * FROM users WHERE email = ? AND role = ?").get(email, role);
    if (!user || !bcrypt.compareSync(password, user.password)) {
        return res.status(401).json({ error: "Invalid credentials" });
    }
    const token = uuid();
    const sessionUser = {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role
    };
    sessions.set(token, sessionUser);
    db.prepare("INSERT OR REPLACE INTO user_sessions (token, user_id) VALUES (?, ?)").run(token, user.id);
    res.json({ token, user: sessionUser });
});
/* =====================================================
   GRIEVANCE READ/UPDATE ROUTES
===================================================== */
app.get("/api/categories", (_req, res) => {
    const db = getDb();
    const rows = db.prepare("SELECT id, name FROM grievance_categories ORDER BY name").all();
    res.json(rows);
});
app.get("/api/contractors/demo", (_req, res) => {
    const db = getDb();
    const rows = db
        .prepare(`
        SELECT
          u.id,
          u.name,
          u.email,
          SUM(CASE WHEN g.complaint_status IN ('accepted', 'in_progress') THEN 1 ELSE 0 END) AS active_complaints,
          SUM(CASE WHEN g.status = 'resolved' THEN 1 ELSE 0 END) AS closed_complaints
        FROM users u
        LEFT JOIN grievances g ON g.contractor_id = u.id
        WHERE u.role = 'contractor'
        GROUP BY u.id, u.name, u.email
        ORDER BY u.id ASC
      `)
        .all();
    const passwordByEmail = new Map(DEMO_CONTRACTORS.map((item) => [item.email, item.password]));
    const payload = rows.map((item) => ({
        id: item.id,
        name: item.name,
        email: item.email,
        password: passwordByEmail.get(item.email) ?? "N/A",
        active_complaints: Number(item.active_complaints ?? 0),
        closed_complaints: Number(item.closed_complaints ?? 0)
    }));
    res.json(payload);
});
app.post("/api/authority/grievances/distribute-random", auth, (req, res) => {
    if (req.user?.role !== "authority") {
        return res.status(403).json({ error: "Forbidden" });
    }
    try {
        const db = getDb();
        const contractors = db
            .prepare("SELECT id FROM users WHERE role = 'contractor' ORDER BY id ASC")
            .all();
        if (contractors.length === 0) {
            return res.status(400).json({ error: "No contractors available" });
        }
        const complaints = db
            .prepare(`
          SELECT id, complaint_status, status
          FROM grievances
          WHERE complaint_status != 'closed'
            AND status != 'resolved'
          ORDER BY created_at DESC
        `)
            .all();
        let reassigned = 0;
        const byContractor = new Map();
        const updateStatement = db.prepare(`
        UPDATE grievances
        SET contractor_id = ?,
            complaint_status = ?,
            status = ?,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `);
        for (const complaint of complaints) {
            const randomContractor = contractors[Math.floor(Math.random() * contractors.length)];
            const nextComplaintStatus = complaint.complaint_status === "in_progress" || complaint.complaint_status === "accepted"
                ? complaint.complaint_status
                : "accepted";
            const nextStatus = complaint.status === "in_progress" ? "in_progress" : "assigned";
            updateStatement.run(randomContractor.id, nextComplaintStatus, nextStatus, complaint.id);
            reassigned += 1;
            byContractor.set(randomContractor.id, Number(byContractor.get(randomContractor.id) ?? 0) + 1);
        }
        return res.json({
            message: "Complaints distributed to contractors",
            total_reassigned: reassigned,
            distribution: Array.from(byContractor.entries()).map(([contractor_id, complaints_assigned]) => ({
                contractor_id,
                complaints_assigned
            }))
        });
    }
    catch (err) {
        console.error("Failed to distribute complaints:", err);
        return res.status(500).json({ error: "Failed to distribute complaints" });
    }
});
app.get("/api/grievances", auth, (req, res) => {
    const db = getDb();
    const sessionUser = req.user;
    if (!sessionUser) {
        return res.status(401).json({ error: "Unauthorized" });
    }
    if (sessionUser.role === "authority") {
        const rows = db
            .prepare(`
          SELECT
            g.*,
            c.name AS category_name,
            u.name AS citizen_name,
            u.email AS citizen_email,
            u.phone AS citizen_phone
          FROM grievances g
          JOIN grievance_categories c ON c.id = g.category_id
          JOIN users u ON u.id = g.citizen_id
          ORDER BY g.created_at DESC
        `)
            .all();
        return res.json(rows);
    }
    const rows = db
        .prepare(`
        SELECT
          g.*,
          c.name AS category_name
        FROM grievances g
        JOIN grievance_categories c ON c.id = g.category_id
        WHERE g.citizen_id = ?
        ORDER BY g.created_at DESC
      `)
        .all(sessionUser.id);
    return res.json(rows);
});
app.get("/api/grievances/my", auth, (req, res) => {
    if (req.user?.role !== "citizen") {
        return res.status(403).json({ error: "Forbidden" });
    }
    const db = getDb();
    const rows = db
        .prepare(`
        SELECT
          g.*,
          c.name AS category_name
        FROM grievances g
        JOIN grievance_categories c ON c.id = g.category_id
        WHERE g.citizen_id = ?
        ORDER BY g.created_at DESC
      `)
        .all(req.user.id);
    return res.json(rows);
});
app.get("/api/map/markers", auth, (req, res) => {
    const sessionUser = req.user;
    if (!sessionUser) {
        return res.status(401).json({ error: "Unauthorized" });
    }
    const db = getDb();
    if (sessionUser.role === "authority" || sessionUser.role === "contractor") {
        const rows = db
            .prepare(`
          SELECT
            g.*,
            c.name AS category_name,
            u.name AS citizen_name,
            u.email AS citizen_email,
            u.phone AS citizen_phone
          FROM grievances g
          JOIN grievance_categories c ON c.id = g.category_id
          JOIN users u ON u.id = g.citizen_id
          WHERE g.latitude IS NOT NULL
            AND g.longitude IS NOT NULL
          ORDER BY g.updated_at DESC, g.created_at DESC
        `)
            .all();
        return res.json(rows);
    }
    const rows = db
        .prepare(`
        SELECT
          g.*,
          c.name AS category_name
        FROM grievances g
        JOIN grievance_categories c ON c.id = g.category_id
        WHERE g.citizen_id = ?
          AND g.latitude IS NOT NULL
          AND g.longitude IS NOT NULL
        ORDER BY g.updated_at DESC, g.created_at DESC
      `)
        .all(sessionUser.id);
    return res.json(rows);
});
app.get("/api/grievances/track/:ticket", auth, (req, res) => {
    const sessionUser = req.user;
    if (!sessionUser) {
        return res.status(401).json({ error: "Unauthorized" });
    }
    const ticket = String(req.params.ticket ?? "").trim();
    if (!ticket) {
        return res.status(400).json({ error: "Complaint ID is required" });
    }
    const db = getDb();
    const row = db
        .prepare(`
        SELECT
          g.*,
          c.name AS category_name
        FROM grievances g
        JOIN grievance_categories c ON c.id = g.category_id
        WHERE g.ticket_number = ?
      `)
        .get(ticket);
    if (!row) {
        return res.status(404).json({ error: "Complaint not found" });
    }
    if (sessionUser.role === "citizen" && row.citizen_id !== sessionUser.id) {
        return res.status(403).json({ error: "You can track only your complaints" });
    }
    if (sessionUser.role === "contractor" && row.contractor_id && row.contractor_id !== sessionUser.id) {
        return res.status(403).json({ error: "You can track only your assigned complaints" });
    }
    const complaintStatus = String(row.complaint_status ?? "").toLowerCase();
    const workflowStatus = String(row.status ?? "").toLowerCase();
    let trackingStage = "submitted";
    if (complaintStatus === "closed" || workflowStatus === "resolved") {
        trackingStage = "closed";
    }
    else if (complaintStatus === "in_progress" || workflowStatus === "in_progress") {
        trackingStage = "in_progress";
    }
    else if (complaintStatus === "accepted" || workflowStatus === "assigned") {
        trackingStage = "accepted";
    }
    return res.json({
        ...row,
        tracking_stage: trackingStage
    });
});
app.get("/api/authority/grievances/:id", auth, (req, res) => {
    if (req.user?.role !== "authority" && req.user?.role !== "contractor") {
        return res.status(403).json({ error: "Forbidden" });
    }
    const db = getDb();
    const row = db
        .prepare(`
        SELECT
          g.*,
          c.name AS category_name,
          u.name AS citizen_name,
          u.email AS citizen_email,
          u.phone AS citizen_phone
        FROM grievances g
        JOIN grievance_categories c ON c.id = g.category_id
        JOIN users u ON u.id = g.citizen_id
        WHERE g.id = ?
      `)
        .get(Number(req.params.id));
    if (!row) {
        return res.status(404).json({ error: "Complaint not found" });
    }
    if (req.user.role === "contractor" && row.contractor_id && row.contractor_id !== req.user.id) {
        return res.status(403).json({ error: "You can view only your assigned complaints" });
    }
    return res.json(row);
});
app.get("/api/contractor/grievances", auth, (req, res) => {
    if (req.user?.role !== "authority" && req.user?.role !== "contractor") {
        return res.status(403).json({ error: "Forbidden" });
    }
    const db = getDb();
    const isContractor = req.user.role === "contractor";
    const rows = db
        .prepare(`
        SELECT
          g.*,
          c.name AS category_name,
          u.name AS citizen_name,
          u.email AS citizen_email,
          u.phone AS citizen_phone
        FROM grievances g
        JOIN grievance_categories c ON c.id = g.category_id
        JOIN users u ON u.id = g.citizen_id
        WHERE g.complaint_status IN ('accepted', 'in_progress')
          AND (? = 0 OR g.contractor_id = ?)
        ORDER BY g.updated_at DESC, g.created_at DESC
      `)
        .all(isContractor ? 1 : 0, req.user.id);
    return res.json(rows);
});
app.patch("/api/authority/grievances/:id/status", auth, (req, res) => {
    if (req.user?.role !== "authority" && req.user?.role !== "contractor") {
        return res.status(403).json({ error: "Forbidden" });
    }
    const parsed = z
        .object({
        status: z.enum(["accepted", "in_progress", "closed"])
    })
        .safeParse(req.body);
    if (!parsed.success) {
        return res.status(400).json({ error: "Invalid status" });
    }
    try {
        const complaintId = Number(req.params.id);
        const db = getDb();
        const existing = db
            .prepare("SELECT id, contractor_id FROM grievances WHERE id = ?")
            .get(complaintId);
        if (!existing) {
            return res.status(404).json({ error: "Complaint not found" });
        }
        if (req.user.role === "contractor" && existing.contractor_id && existing.contractor_id !== req.user.id) {
            return res.status(403).json({ error: "You can update only your assigned complaints" });
        }
        const statusMap = {
            accepted: "assigned",
            in_progress: "in_progress",
            closed: "resolved"
        };
        const contractorIdToSet = req.user.role === "contractor" ? req.user.id : existing.contractor_id;
        db.prepare("UPDATE grievances SET complaint_status = ?, status = ?, contractor_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(parsed.data.status, statusMap[parsed.data.status], contractorIdToSet ?? null, complaintId);
        const updated = db
            .prepare(`
          SELECT
            g.*,
            c.name AS category_name,
            u.name AS citizen_name,
            u.email AS citizen_email,
            u.phone AS citizen_phone
          FROM grievances g
          JOIN grievance_categories c ON c.id = g.category_id
          JOIN users u ON u.id = g.citizen_id
          WHERE g.id = ?
        `)
            .get(complaintId);
        return res.json(updated);
    }
    catch (err) {
        console.error("Failed to update grievance status:", err);
        return res.status(500).json({ error: "Failed to update grievance status" });
    }
});
app.post("/api/contractor/grievances/:id/close", auth, upload.single("resolutionImage"), async (req, res) => {
    if (req.user?.role !== "authority" && req.user?.role !== "contractor") {
        return res.status(403).json({ error: "Forbidden" });
    }
    try {
        const complaintId = Number(req.params.id);
        if (!Number.isFinite(complaintId)) {
            return res.status(400).json({ error: "Invalid complaint id" });
        }
        const file = req.file;
        if (!file) {
            return res.status(400).json({ error: "Resolution image is required" });
        }
        const db = getDb();
        const existing = db
            .prepare(`
          SELECT id, complaint_status, contractor_id, images_json
          FROM grievances
          WHERE id = ?
        `)
            .get(complaintId);
        if (!existing) {
            return res.status(404).json({ error: "Complaint not found" });
        }
        if (existing.complaint_status !== "accepted" && existing.complaint_status !== "in_progress") {
            return res.status(400).json({ error: "Only accepted or in-progress complaints can be closed" });
        }
        if (req.user.role === "contractor" && existing.contractor_id && existing.contractor_id !== req.user.id) {
            return res.status(403).json({ error: "You can close only your assigned complaints" });
        }
        const originalImagePath = getFirstUploadedImagePath(existing.images_json);
        const verification = originalImagePath
            ? await verifyResolution(originalImagePath, file.path)
            : { resolved: false, confidence: "low" };
        const resolutionImageUrl = `/uploads/${path.basename(file.path)}`;
        const contractorIdToSet = req.user.role === "contractor" ? req.user.id : existing.contractor_id;
        // Closing from this endpoint is an explicit human action, so persist closure
        // even if AI verification confidence is low.
        const nextStatus = "resolved";
        const nextComplaintStatus = "closed";
        db.prepare(`
        UPDATE grievances
        SET complaint_status = ?,
            status = ?,
            contractor_id = ?,
            resolution_image_url = ?,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(nextComplaintStatus, nextStatus, contractorIdToSet ?? null, resolutionImageUrl, complaintId);
        const updated = db
            .prepare(`
          SELECT
            g.*,
            c.name AS category_name,
            u.name AS citizen_name,
            u.email AS citizen_email,
            u.phone AS citizen_phone
          FROM grievances g
          JOIN grievance_categories c ON c.id = g.category_id
          JOIN users u ON u.id = g.citizen_id
          WHERE g.id = ?
        `)
            .get(complaintId);
        return res.json({
            complaint: updated,
            verification
        });
    }
    catch (err) {
        console.error("Failed to close grievance:", err);
        return res.status(500).json({ error: "Failed to process contractor resolution" });
    }
});
/* =====================================================
   COMPLAINT WITH GEMINI
===================================================== */
app.post("/api/complaints", auth, upload.array("photos", 6), async (req, res) => {
    if (req.user?.role !== "citizen") {
        return res.status(403).json({ error: "Forbidden" });
    }
    const schema = z.object({
        categoryId: z.coerce.number().int().positive().optional(),
        fullName: z.string().min(2),
        email: z.string().email(),
        mobile: z.string().regex(/^\d{10}$/),
        description: z.string().min(10),
        location: z.string().min(3),
        latitude: z.coerce.number().optional(),
        longitude: z.coerce.number().optional()
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
        return res.status(400).json({ error: "Invalid form data" });
    }
    const payload = parsed.data;
    const files = req.files ?? [];
    const firstImage = files[0];
    try {
        const aiResult = await analyzeComplaint(payload.description, payload.location, firstImage?.path);
        if (aiResult.is_spam) {
            return res.status(422).json({ error: "Complaint Rejected" });
        }
        const aiCategoryMap = {
            "Roads & Infrastructure": { dbCategory: "Roads & Potholes", department: "Public Works Department" },
            "Water & Drainage": { dbCategory: "Drainage", department: "Water & Drainage Department" },
            "Electricity & Street Lighting": { dbCategory: "Street Lights", department: "Electricity Department" },
            "Sanitation & Waste": { dbCategory: "Waste Management", department: "Sanitation Department" },
            "Public Health": { dbCategory: "Public Safety", department: "Public Health Department" },
            "Fire & Emergency": { dbCategory: "Public Safety", department: "Emergency Services Department" },
            "Property & Tax": { dbCategory: "Public Safety", department: "Revenue Department" },
            "Environment & Gardens": { dbCategory: "Waste Management", department: "Environment Department" },
            "Encroachment & Illegal Activity": { dbCategory: "Public Safety", department: "Enforcement Department" }
        };
        const defaultDepartmentByDbCategory = {
            "Roads & Potholes": "Public Works Department",
            "Waste Management": "Sanitation Department",
            "Street Lights": "Electricity Department",
            "Water Supply": "Water Supply Department",
            "Drainage": "Water & Drainage Department",
            "Public Safety": "Public Safety Department"
        };
        const db = getDb();
        const mapped = mapAiCategoryToAssignment(aiResult.category, aiCategoryMap);
        let categoryRow = mapped
            ? db.prepare("SELECT id, name FROM grievance_categories WHERE name = ?").get(mapped.dbCategory)
            : undefined;
        if (!categoryRow && payload.categoryId) {
            categoryRow = db
                .prepare("SELECT id, name FROM grievance_categories WHERE id = ?")
                .get(payload.categoryId);
        }
        if (!categoryRow) {
            categoryRow = db
                .prepare("SELECT id, name FROM grievance_categories ORDER BY id LIMIT 1")
                .get();
        }
        if (!categoryRow) {
            return res.status(500).json({ error: "No grievance categories configured" });
        }
        const department = mapped?.department ?? defaultDepartmentByDbCategory[categoryRow.name] ?? "General Administration Department";
        const contractorId = pickLeastLoadedContractorId(db);
        const complaintId = `CMP-${Date.now().toString(36).toUpperCase()}-${Math.floor(Math.random() * 900 + 100)}`;
        const imageUrls = files.map((file) => `/uploads/${path.basename(file.path)}`);
        db.prepare(`
        INSERT INTO grievances (
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
          priority,
          status,
          complaint_status,
          contractor_id
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'submitted', 'accepted', ?)
      `).run(complaintId, req.user.id, categoryRow.id, `Complaint by ${payload.fullName}`, payload.description, payload.fullName, payload.email, payload.mobile, department, payload.location, payload.latitude ?? null, payload.longitude ?? null, imageUrls.length ? JSON.stringify(imageUrls) : null, aiResult.priority, contractorId);
        return res.status(201).json({
            message: "Complaint Accepted",
            complaint: {
                ticket_number: complaintId,
                category_name: categoryRow.name,
                assigned_department: department
            }
        });
    }
    catch (err) {
        console.error("Failed to create complaint:", err);
        return res.status(500).json({ error: "Failed to create complaint" });
    }
});
function pickLeastLoadedContractorId(db) {
    const row = db
        .prepare(`
        SELECT
          u.id
        FROM users u
        LEFT JOIN grievances g
          ON g.contractor_id = u.id
         AND g.complaint_status IN ('accepted', 'in_progress')
        WHERE u.role = 'contractor'
        GROUP BY u.id
        ORDER BY COUNT(g.id) ASC, u.id ASC
        LIMIT 1
      `)
        .get();
    return row?.id ?? null;
}
function mapAiCategoryToAssignment(category, exactMap) {
    if (!category)
        return undefined;
    if (exactMap[category]) {
        return exactMap[category];
    }
    const normalized = category.trim().toLowerCase().replace(/\s+/g, " ");
    if (normalized.includes("road") || normalized.includes("pothole") || normalized.includes("infrastructure")) {
        return exactMap["Roads & Infrastructure"];
    }
    if (normalized.includes("water") ||
        normalized.includes("drain") ||
        normalized.includes("sewer") ||
        normalized.includes("flood")) {
        return exactMap["Water & Drainage"];
    }
    if (normalized.includes("electric") || normalized.includes("street light") || normalized.includes("lighting")) {
        return exactMap["Electricity & Street Lighting"];
    }
    if (normalized.includes("waste") || normalized.includes("garbage") || normalized.includes("sanitation") || normalized.includes("clean")) {
        return exactMap["Sanitation & Waste"];
    }
    if (normalized.includes("health") || normalized.includes("hospital") || normalized.includes("medical")) {
        return exactMap["Public Health"];
    }
    if (normalized.includes("fire") || normalized.includes("emergency") || normalized.includes("accident")) {
        return exactMap["Fire & Emergency"];
    }
    if (normalized.includes("tax") || normalized.includes("property") || normalized.includes("assessment")) {
        return exactMap["Property & Tax"];
    }
    if (normalized.includes("environment") || normalized.includes("garden") || normalized.includes("tree") || normalized.includes("park")) {
        return exactMap["Environment & Gardens"];
    }
    if (normalized.includes("encroach") || normalized.includes("illegal") || normalized.includes("unauthor")) {
        return exactMap["Encroachment & Illegal Activity"];
    }
    return undefined;
}
function getFirstUploadedImagePath(imagesJson) {
    if (!imagesJson)
        return null;
    try {
        const parsed = JSON.parse(imagesJson);
        if (!Array.isArray(parsed) || parsed.length === 0)
            return null;
        const first = parsed[0];
        if (typeof first !== "string" || !first.startsWith("/uploads/"))
            return null;
        return path.resolve(process.cwd(), first.replace("/uploads/", "uploads/"));
    }
    catch {
        return null;
    }
}
/* =====================================================
   START SERVER
===================================================== */
initDb();
app.listen(PORT, () => {
    console.log(`API running on http://localhost:${PORT}`);
});
