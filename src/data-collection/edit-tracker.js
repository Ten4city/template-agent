/**
 * Edit Tracker - Data Collection Module
 *
 * Captures all edits made to documents for future model refinement.
 * Stores: original extraction, each edit (before/after), user instructions.
 */

import fs from 'fs';
import path from 'path';

// In-memory store for active sessions
const sessions = new Map();

/**
 * Start a new tracking session for a document
 */
export function startSession(jobId, options = {}) {
  const session = {
    jobId,
    startedAt: new Date().toISOString(),
    documentInfo: {
      originalFile: options.originalFile || null,
      pageCount: options.pageCount || null,
      model: options.model || null,
    },
    originalExtraction: null,
    edits: [],
    finalOutput: null,
  };

  sessions.set(jobId, session);
  return session;
}

/**
 * Record the initial AI extraction
 */
export function recordExtraction(jobId, extraction) {
  const session = sessions.get(jobId);
  if (!session) {
    console.warn(`[EditTracker] No session found for job ${jobId}`);
    return;
  }

  session.originalExtraction = {
    timestamp: new Date().toISOString(),
    structure: extraction.structure || extraction,
    html: extraction.html || null,
  };
}

/**
 * Record an edit operation
 *
 * @param {string} jobId - Job identifier
 * @param {Object} edit - Edit details
 * @param {string} edit.type - 'json_agent' | 'ckeditor_agent' | 'ckeditor_manual' | 'field_injection'
 * @param {string} edit.instruction - User's instruction (if agent edit)
 * @param {Object} edit.selection - What was selected (element index, text, etc.)
 * @param {Object} edit.before - State before edit
 * @param {Object} edit.after - State after edit
 */
export function recordEdit(jobId, edit) {
  const session = sessions.get(jobId);
  if (!session) {
    console.warn(`[EditTracker] No session found for job ${jobId}`);
    return;
  }

  const editRecord = {
    id: `edit_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    timestamp: new Date().toISOString(),
    type: edit.type,
    instruction: edit.instruction || null,
    selection: edit.selection || null,
    before: edit.before,
    after: edit.after,
    metadata: edit.metadata || {},
  };

  session.edits.push(editRecord);
  console.log(`[EditTracker] Recorded edit ${editRecord.id} (${edit.type}) for job ${jobId}`);

  return editRecord;
}

/**
 * Record final output when user is done editing
 */
export function recordFinalOutput(jobId, output) {
  const session = sessions.get(jobId);
  if (!session) {
    console.warn(`[EditTracker] No session found for job ${jobId}`);
    return;
  }

  session.finalOutput = {
    timestamp: new Date().toISOString(),
    html: output.html || null,
    structure: output.structure || null,
  };
  session.completedAt = new Date().toISOString();
}

/**
 * Get session data
 */
export function getSession(jobId) {
  return sessions.get(jobId);
}

/**
 * Save session to disk
 */
export function saveSession(jobId, outputDir) {
  const session = sessions.get(jobId);
  if (!session) {
    console.warn(`[EditTracker] No session found for job ${jobId}`);
    return null;
  }

  // Create output directory if it doesn't exist
  const dataDir = path.join(outputDir, 'edit-data');
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  const filePath = path.join(dataDir, `${jobId}-edits.json`);
  fs.writeFileSync(filePath, JSON.stringify(session, null, 2));

  console.log(`[EditTracker] Saved session to ${filePath}`);
  return filePath;
}

/**
 * End and clean up a session
 */
export function endSession(jobId, outputDir) {
  const filePath = saveSession(jobId, outputDir);
  sessions.delete(jobId);
  return filePath;
}

/**
 * Get summary statistics for a session
 */
export function getSessionStats(jobId) {
  const session = sessions.get(jobId);
  if (!session) return null;

  const editsByType = {};
  for (const edit of session.edits) {
    editsByType[edit.type] = (editsByType[edit.type] || 0) + 1;
  }

  return {
    jobId,
    totalEdits: session.edits.length,
    editsByType,
    hasOriginalExtraction: !!session.originalExtraction,
    hasFinalOutput: !!session.finalOutput,
    duration: session.completedAt
      ? new Date(session.completedAt) - new Date(session.startedAt)
      : null,
  };
}

export default {
  startSession,
  recordExtraction,
  recordEdit,
  recordFinalOutput,
  getSession,
  saveSession,
  endSession,
  getSessionStats,
};
