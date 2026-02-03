/**
 * Backend Server for Template Editor UI
 *
 * Serves structure data and handles edit requests.
 * Also handles document upload and reconstruction pipeline.
 */

import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import multer from 'multer';
import { v4 as uuidv4 } from 'uuid';

// Import from main src
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const srcPath = path.join(__dirname, '../src');
const uploadsPath = path.join(__dirname, 'uploads');

// Dynamic imports for ES modules
const { renderDocumentStructure } = await import(
  path.join(srcPath, 'renderer/reconstruction-renderer.js')
);
const { runEditAgent } = await import(path.join(srcPath, 'editor/edit-agent.js'));
const { generatePreview } = await import(path.join(srcPath, 'editor/preview.js'));
const { convertToImages, extractDocumentStructure } = await import(
  path.join(srcPath, 'reconstruction-pipeline.js')
);
const { detectPageFields } = await import(path.join(srcPath, 'extractor/field-detector.js'));
const { injectFieldsIntoDocument } = await import(path.join(srcPath, 'injector/field-injector.js'));

const app = express();
app.use(cors());
app.use(express.json());

// Ensure uploads directory exists
if (!fs.existsSync(uploadsPath)) {
  fs.mkdirSync(uploadsPath, { recursive: true });
}

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const jobId = uuidv4();
    const jobDir = path.join(uploadsPath, jobId);
    fs.mkdirSync(jobDir, { recursive: true });
    req.jobId = jobId;
    req.jobDir = jobDir;
    cb(null, jobDir);
  },
  filename: (req, file, cb) => {
    cb(null, file.originalname);
  },
});
const upload = multer({ storage });

// In-memory job store
const jobs = new Map();

// Default structure file path
const DEFAULT_STRUCTURE_PATH = path.join(
  srcPath,
  'output/reconstruction-output-structure.json'
);

// Current working structure (in-memory)
let currentStructure = null;

/**
 * Load structure from file
 */
function loadStructureFromFile(filePath = DEFAULT_STRUCTURE_PATH) {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(content);
  } catch (err) {
    console.error('Failed to load structure:', err.message);
    return null;
  }
}

/**
 * GET /api/structure
 * Returns current structure and rendered HTML
 */
app.get('/api/structure', (req, res) => {
  try {
    // Load fresh or use cached
    if (!currentStructure) {
      currentStructure = loadStructureFromFile();
    }

    if (!currentStructure) {
      return res.status(500).json({ error: 'No structure loaded' });
    }

    const html = renderDocumentStructure(currentStructure);

    // Extract just the body content for preview
    const bodyMatch = html.match(/<body[^>]*>([\s\S]*)<\/body>/i);
    const bodyHtml = bodyMatch ? bodyMatch[1] : html;

    res.json({
      structure: currentStructure,
      html: bodyHtml,
    });
  } catch (err) {
    console.error('Error in /api/structure:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/edit
 * Execute an edit using the LLM agent
 *
 * Body: { structure, selection, prompt }
 */
app.post('/api/edit', async (req, res) => {
  try {
    const { structure, selection, prompt } = req.body;

    if (!structure || !selection || !prompt) {
      return res.status(400).json({
        error: 'Missing required fields: structure, selection, prompt',
      });
    }

    console.log(`[Server] Edit request: "${prompt}"`);
    console.log(`[Server] Selection:`, JSON.stringify(selection));

    // Run the edit agent
    const result = await runEditAgent(structure, selection, prompt, {
      verbose: true,
    });

    // Generate before/after preview
    const preview = generatePreview(structure, result.editedStructure);

    // Extract body HTML for preview
    const extractBody = (html) => {
      const match = html.match(/<body[^>]*>([\s\S]*)<\/body>/i);
      return match ? match[1] : html;
    };

    res.json({
      editedStructure: result.editedStructure,
      toolsUsed: result.toolsUsed,
      summary: result.summary,
      beforeHtml: extractBody(preview.before),
      afterHtml: extractBody(preview.after),
      changes: preview.changes,
    });
  } catch (err) {
    console.error('Error in /api/edit:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/structure
 * Update the current structure (after accepting edits)
 *
 * Body: { structure }
 */
app.post('/api/structure', (req, res) => {
  try {
    const { structure } = req.body;

    if (!structure) {
      return res.status(400).json({ error: 'Missing structure' });
    }

    currentStructure = structure;
    console.log('[Server] Structure updated');

    res.json({ success: true });
  } catch (err) {
    console.error('Error in POST /api/structure:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/reload
 * Reload structure from file
 */
app.post('/api/reload', (req, res) => {
  try {
    currentStructure = loadStructureFromFile();

    if (!currentStructure) {
      return res.status(500).json({ error: 'Failed to reload structure' });
    }

    const html = renderDocumentStructure(currentStructure);
    const bodyMatch = html.match(/<body[^>]*>([\s\S]*)<\/body>/i);
    const bodyHtml = bodyMatch ? bodyMatch[1] : html;

    res.json({
      structure: currentStructure,
      html: bodyHtml,
    });
  } catch (err) {
    console.error('Error in /api/reload:', err);
    res.status(500).json({ error: err.message });
  }
});

// =============================================================================
// UPLOAD & RECONSTRUCTION ENDPOINTS
// =============================================================================

/**
 * POST /api/convert
 * Upload a document and convert it to page images
 *
 * Returns: { jobId, images: [{ page, url }] }
 */
app.post('/api/convert', upload.single('file'), async (req, res) => {
  try {
    const { jobId, jobDir } = req;
    const filePath = req.file.path;
    const originalName = req.file.originalname;
    const fileType = originalName.toLowerCase().endsWith('.pdf') ? 'pdf' : 'docx';

    console.log(`[Server] Converting ${originalName} (job: ${jobId})`);

    // Create job entry
    const job = {
      id: jobId,
      status: 'converting',
      filePath,
      fileType,
      jobDir,
      images: [],
      progress: { message: 'Converting document to images...' },
    };
    jobs.set(jobId, job);

    // Convert document to images
    const { imagePaths, pdfPath } = await convertToImages(filePath, fileType);

    // Store image info
    job.images = imagePaths.map((imgPath, i) => ({
      page: i + 1,
      path: imgPath,
      filename: path.basename(imgPath),
    }));
    job.pdfPath = pdfPath;
    job.status = 'ready_for_selection';
    job.progress = { message: 'Ready for page selection' };

    console.log(`[Server] Converted ${imagePaths.length} pages (job: ${jobId})`);

    // Return image URLs for preview
    res.json({
      jobId,
      images: job.images.map((img) => ({
        page: img.page,
        url: `/api/image/${jobId}/${img.filename}`,
      })),
    });
  } catch (err) {
    console.error('[Server] Convert error:', err);

    // Update job status if it exists
    if (req.jobId && jobs.has(req.jobId)) {
      const job = jobs.get(req.jobId);
      job.status = 'error';
      job.error = err.message;
    }

    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/image/:jobId/:filename
 * Serve a page image for preview
 */
app.get('/api/image/:jobId/:filename', (req, res) => {
  const { jobId, filename } = req.params;

  const job = jobs.get(jobId);
  if (!job) {
    return res.status(404).json({ error: 'Job not found' });
  }

  const img = job.images.find((i) => i.filename === filename);
  if (!img) {
    return res.status(404).json({ error: 'Image not found' });
  }

  res.sendFile(img.path);
});

/**
 * POST /api/extract
 * Start structure extraction on selected pages
 *
 * Body: { jobId, selectedPages: [1, 2, 5], context?: "Optional context", model?: "gemini-2.5-pro" }
 */
app.post('/api/extract', async (req, res) => {
  const { jobId, selectedPages, context, model } = req.body;

  const job = jobs.get(jobId);
  if (!job) {
    return res.status(404).json({ error: 'Job not found' });
  }

  if (!selectedPages || selectedPages.length === 0) {
    return res.status(400).json({ error: 'No pages selected' });
  }

  // Update job status
  job.status = 'extracting';
  job.progress = {
    message: 'Starting extraction...',
    currentPage: 0,
    totalPages: selectedPages.length,
  };

  console.log(`[Server] Starting extraction for ${selectedPages.length} pages (job: ${jobId}, model: ${model || 'default'})`);

  // Start extraction in background
  extractSelectedPages(job, selectedPages, context, model);

  res.json({ jobId, status: 'extracting' });
});

/**
 * Background function to extract structure from selected pages
 */
async function extractSelectedPages(job, selectedPages, context, model) {
  try {
    // Get selected image paths
    const selectedImages = job.images
      .filter((img) => selectedPages.includes(img.page))
      .map((img) => img.path);

    // Run extraction with progress callback
    const { documentStructure } = await extractDocumentStructure(selectedImages, {
      context,
      model,
      verbose: true,
      onPageComplete: (pageNum, total) => {
        job.progress = {
          message: `Extracting page ${pageNum} of ${total}...`,
          currentPage: pageNum,
          totalPages: total,
        };
        console.log(`[Server] Job ${job.id}: page ${pageNum}/${total}`);
      },
    });

    // Render HTML
    const html = renderDocumentStructure(documentStructure);
    const bodyMatch = html.match(/<body[^>]*>([\s\S]*)<\/body>/i);
    const bodyHtml = bodyMatch ? bodyMatch[1] : html;

    // Update job with result
    job.status = 'complete';
    job.result = {
      structure: documentStructure,
      html: bodyHtml,
    };
    job.progress = { message: 'Extraction complete' };

    // Save structure to disk for debugging
    const structurePath = path.join(job.jobDir, 'extracted-structure.json');
    fs.writeFileSync(structurePath, JSON.stringify(documentStructure, null, 2));
    console.log(`[Server] Structure saved to: ${structurePath}`);

    console.log(`[Server] Extraction complete (job: ${job.id})`);
  } catch (err) {
    console.error(`[Server] Extraction error (job: ${job.id}):`, err);
    job.status = 'error';
    job.error = err.message;
  }
}

/**
 * GET /api/job/:id
 * Get job status and result
 */
app.get('/api/job/:id', (req, res) => {
  const job = jobs.get(req.params.id);

  if (!job) {
    return res.status(404).json({ error: 'Job not found' });
  }

  const response = {
    id: job.id,
    status: job.status,
    progress: job.progress,
  };

  if (job.status === 'complete') {
    response.result = job.result;
  }

  if (job.status === 'error') {
    response.error = job.error;
  }

  res.json(response);
});

// =============================================================================
// FIELD DETECTION ENDPOINTS
// =============================================================================

/**
 * POST /api/detect-fields
 * Detect form fields in a page and inject them into the structure
 *
 * Body: { jobId, pageNumber, structure }
 * - jobId: The upload job ID (to get page image)
 * - pageNumber: Which page to detect fields on (1-based)
 * - structure: Current document structure
 *
 * Returns: { fields, updatedStructure, html }
 */
app.post('/api/detect-fields', async (req, res) => {
  try {
    const { jobId, pageNumber, structure } = req.body;

    if (!jobId || !pageNumber || !structure) {
      return res.status(400).json({
        error: 'Missing required fields: jobId, pageNumber, structure',
      });
    }

    const job = jobs.get(jobId);
    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }

    // Find the page image
    const pageImage = job.images.find((img) => img.page === pageNumber);
    if (!pageImage) {
      return res.status(404).json({ error: `Page ${pageNumber} not found in job` });
    }

    // Get the page structure
    const pageStructure = structure.pages.find((p) => p.pageNumber === pageNumber);
    if (!pageStructure) {
      return res.status(404).json({ error: `Page ${pageNumber} not found in structure` });
    }

    console.log(`[Server] Detecting fields for page ${pageNumber} (job: ${jobId})`);

    // Run field detection
    const { fields, success } = await detectPageFields(pageImage.path, pageStructure, {
      verbose: true,
    });

    if (!success || fields.length === 0) {
      console.log(`[Server] No fields detected on page ${pageNumber}`);
      return res.json({
        fields: [],
        updatedStructure: structure,
        html: null,
        message: 'No fields detected on this page',
      });
    }

    console.log(`[Server] Detected ${fields.length} fields on page ${pageNumber}`);

    // Inject fields into structure
    const updatedStructure = injectFieldsIntoDocument(structure, pageNumber, fields);

    // Re-render HTML
    const html = renderDocumentStructure(updatedStructure);
    const bodyMatch = html.match(/<body[^>]*>([\s\S]*)<\/body>/i);
    const bodyHtml = bodyMatch ? bodyMatch[1] : html;

    res.json({
      fields,
      updatedStructure,
      html: bodyHtml,
    });
  } catch (err) {
    console.error('[Server] Field detection error:', err);
    res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 3001;

app.listen(PORT, () => {
  console.log(`[Server] Template Editor backend running on http://localhost:${PORT}`);
  console.log(`[Server] Loading structure from: ${DEFAULT_STRUCTURE_PATH}`);

  // Pre-load structure
  currentStructure = loadStructureFromFile();
  if (currentStructure) {
    console.log(
      `[Server] Loaded structure with ${currentStructure.pages?.[0]?.elements?.length || 0} elements`
    );
  } else {
    console.log('[Server] Warning: No structure loaded');
  }
});
