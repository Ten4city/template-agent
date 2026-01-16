/**
 * Backend Server for Template Editor UI
 *
 * Serves structure data and handles edit requests.
 */

import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Import from main src
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const srcPath = path.join(__dirname, '../src');

// Dynamic imports for ES modules
const { renderDocumentStructure } = await import(
  path.join(srcPath, 'renderer/reconstruction-renderer.js')
);
const { runEditAgent } = await import(path.join(srcPath, 'editor/edit-agent.js'));
const { generatePreview } = await import(path.join(srcPath, 'editor/preview.js'));

const app = express();
app.use(cors());
app.use(express.json());

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
