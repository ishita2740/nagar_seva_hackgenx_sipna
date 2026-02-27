import crypto from "node:crypto";
import fs from "node:fs";
export const ALLOWED_WORKFLOW_STATUS = [
    "submitted",
    "assigned",
    "in_progress",
    "resolved",
    "rejected",
    "reopened"
];
/**
 * Offline complaint analysis for hackathon reliability.
 * Fallback logic always returns valid JSON and never depends on external AI APIs.
 */
export async function analyzeComplaint(description, location, _imagePath) {
    try {
        return analyzeComplaintFallback(description, location);
    }
    catch (error) {
        console.error("analyzeComplaint fallback failed:", error);
        return {
            is_spam: false,
            category: "Other",
            priority: "medium"
        };
    }
}
/**
 * Compare two images to estimate if work was completed.
 *
 * originalImagePath: citizen photo captured when issue was reported (before work).
 * proofImagePath: contractor photo uploaded after work (after action taken).
 */
export async function verifyResolutionFallback(originalImagePath, proofImagePath) {
    try {
        if (!proofImagePath || !fs.existsSync(proofImagePath)) {
            return { resolved: false, confidence: "low" };
        }
        if (!originalImagePath || !fs.existsSync(originalImagePath)) {
            return { resolved: true, confidence: "medium" };
        }
        const originalStats = fs.statSync(originalImagePath);
        const proofStats = fs.statSync(proofImagePath);
        const originalHash = sha256File(originalImagePath);
        const proofHash = sha256File(proofImagePath);
        // Resolution decision fallback:
        // 1) Same hash means identical file -> likely no work done.
        // 2) Different hash + large file size change -> resolved with high confidence.
        // 3) Different hash + smaller size change -> resolved with medium confidence.
        if (originalHash === proofHash) {
            return { resolved: false, confidence: "low" };
        }
        const bigger = Math.max(originalStats.size, proofStats.size);
        const smaller = Math.min(originalStats.size, proofStats.size);
        const sizeChangeRatio = bigger === 0 ? 0 : (bigger - smaller) / bigger;
        if (sizeChangeRatio >= 0.2) {
            return { resolved: true, confidence: "high" };
        }
        return { resolved: true, confidence: "medium" };
    }
    catch (error) {
        console.error("verifyResolutionFallback failed:", error);
        return { resolved: false, confidence: "low" };
    }
}
/**
 * Backward compatible export used by existing server routes.
 */
export const verifyResolution = verifyResolutionFallback;
/**
 * SQLite-safe workflow state mapping:
 * - resolved=true  -> status='resolved'
 * - resolved=false -> status='in_progress'
 * Priority is returned separately for independent storage in the priority column.
 */
export function getSQLiteSafeWorkflowUpdate(resolution, priority) {
    const status = resolution.resolved ? "resolved" : "in_progress";
    return { status, priority: normalizePriority(priority) };
}
/**
 * Fallback complaint analysis logic:
 * - Spam: short/irrelevant/random text
 * - Category: keyword map
 * - Priority: emergency > service outage > minor issues
 */
function analyzeComplaintFallback(description, location) {
    const safeDescription = (description ?? "").trim();
    const safeLocation = (location ?? "").trim();
    const descriptionText = safeDescription.toLowerCase().replace(/\s+/g, " ").trim();
    const text = `${safeDescription} ${safeLocation}`.toLowerCase().replace(/\s+/g, " ").trim();
    const isSpam = detectSpam(safeDescription, descriptionText);
    const category = detectCategory(text);
    const priority = detectPriority(text);
    return {
        is_spam: isSpam,
        category,
        priority
    };
}
function detectSpam(description, descriptionText) {
    if (description.trim().length < 10) {
        return true;
    }
    const spamTokens = [
        "test",
        "testing",
        "dummy",
        "random",
        "asdf",
        "qwerty",
        "lorem ipsum",
        "irrelevant",
        "nothing",
        "hello world"
    ];
    if (hasAny(descriptionText, spamTokens)) {
        return true;
    }
    const words = descriptionText.split(/\s+/).filter(Boolean);
    const noCivicSignal = detectCategory(descriptionText) === "Other";
    const shortAndVague = words.length < 4 && noCivicSignal;
    // Random-word/gibberish signal:
    // many tokens without vowels or long repeated characters.
    const gibberishTokens = words.filter((word) => !/[aeiou]/.test(word) || /(.)\1{3,}/.test(word) || /\d{4,}/.test(word));
    const gibberishRatio = words.length > 0 ? gibberishTokens.length / words.length : 0;
    const uniqueRatio = words.length > 0 ? new Set(words).size / words.length : 1;
    const repeatedWordSpam = words.length >= 4 && uniqueRatio <= 0.35;
    const veryLowSignal = words.length < 6 && noCivicSignal;
    return shortAndVague || veryLowSignal || gibberishRatio >= 0.5 || repeatedWordSpam;
}
function detectCategory(text) {
    if (hasAny(text, ["road", "pothole"])) {
        return "Roads & Infrastructure";
    }
    if (hasAny(text, ["water", "drain"])) {
        return "Water & Drainage";
    }
    if (hasAny(text, ["electric", "streetlight"])) {
        return "Electricity & Street Lighting";
    }
    if (hasAny(text, ["garbage", "waste"])) {
        return "Sanitation & Waste";
    }
    if (hasAny(text, ["fire", "accident"])) {
        return "Fire & Emergency";
    }
    if (hasAny(text, ["tax", "property"])) {
        return "Property & Tax";
    }
    if (hasAny(text, ["garden", "environment"])) {
        return "Environment & Gardens";
    }
    if (hasAny(text, ["illegal", "encroachment"])) {
        return "Encroachment & Illegal Activity";
    }
    return "Other";
}
function detectPriority(text) {
    if (hasAny(text, ["fire", "flood", "accident"])) {
        return "high";
    }
    if (hasAny(text, ["electric", "water", "drainage", "drain", "garbage"])) {
        return "medium";
    }
    if (hasAny(text, ["garden", "cleaning", "minor"])) {
        return "low";
    }
    return "low";
}
function sha256File(filePath) {
    const content = fs.readFileSync(filePath);
    return crypto.createHash("sha256").update(content).digest("hex");
}
function hasAny(input, needles) {
    return needles.some((needle) => input.includes(needle));
}
function normalizePriority(value) {
    const normalized = value.toLowerCase();
    if (normalized === "high")
        return "high";
    if (normalized === "low")
        return "low";
    return "medium";
}
