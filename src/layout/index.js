/**
 * Layout Extractor - Node.js wrapper for Python layout analysis
 *
 * Provides spatial text extraction with bounding boxes, row grouping,
 * and control detection for PDF documents.
 */

import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Extract combined layout and controls from a PDF page
 *
 * @param {string} pdfPath - Path to PDF file
 * @param {Object} options - Extraction options
 * @param {number} options.page - Page number (1-indexed), default 1
 * @param {boolean} options.debug - Save debug visualizations
 * @returns {Promise<Object>} Extracted layout data
 */
export async function extractLayout(pdfPath, options = {}) {
  const { page = 1, debug = false } = options;

  const scriptPath = path.join(__dirname, 'combined_extractor.py');

  const args = ['python3', scriptPath, pdfPath, '--page', String(page)];
  if (debug) {
    args.push('--debug');
  }

  return new Promise((resolve, reject) => {
    const proc = spawn(args[0], args.slice(1), {
      cwd: __dirname,
    });

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    proc.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    proc.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`Layout extraction failed (code ${code}): ${stderr}`));
        return;
      }

      try {
        const result = JSON.parse(stdout);
        resolve(result);
      } catch (e) {
        reject(new Error(`Failed to parse layout output: ${e.message}\nOutput: ${stdout}`));
      }
    });

    proc.on('error', (err) => {
      reject(new Error(`Failed to start Python: ${err.message}`));
    });
  });
}

/**
 * Extract layout from multiple pages
 *
 * @param {string} pdfPath - Path to PDF file
 * @param {Object} options - Extraction options
 * @param {number} options.startPage - First page to extract (1-indexed)
 * @param {number} options.endPage - Last page to extract (inclusive)
 * @param {boolean} options.debug - Save debug visualizations
 * @returns {Promise<Object[]>} Array of layout data per page
 */
export async function extractLayoutPages(pdfPath, options = {}) {
  const { startPage = 1, endPage = null, debug = false } = options;

  // First, get total page count
  const firstPage = await extractLayout(pdfPath, { page: startPage, debug });

  const results = [firstPage];

  // If endPage specified, extract remaining pages
  if (endPage && endPage > startPage) {
    for (let page = startPage + 1; page <= endPage; page++) {
      const pageResult = await extractLayout(pdfPath, { page, debug });
      results.push(pageResult);
    }
  }

  return results;
}

/**
 * Convert layout blocks to the format expected by the LLM extractor
 *
 * @param {Object} layoutData - Output from extractLayout
 * @returns {Object[]} Blocks in LLM-compatible format
 */
export function convertBlocksForLLM(layoutData) {
  const { text, controls } = layoutData;

  // Convert text blocks
  const blocks = text.blocks.map((block) => ({
    index: block.id,
    text: block.text,
    bbox: block.bbox,
    fontName: block.font_name,
    fontSize: block.font_size,
    isBold: block.is_bold,
  }));

  // Add row context
  const rowMap = new Map();
  text.rows.forEach((row, rowIndex) => {
    row.blocks.forEach((block) => {
      rowMap.set(block.id, {
        rowIndex,
        rowType: row.type,
        rowBlocks: row.blocks.map((b) => b.id),
      });
    });
  });

  // Enrich blocks with row context
  blocks.forEach((block) => {
    const rowInfo = rowMap.get(block.index);
    if (rowInfo) {
      block.rowIndex = rowInfo.rowIndex;
      block.rowType = rowInfo.rowType;
      block.rowBlocks = rowInfo.rowBlocks;
    }
  });

  return blocks;
}

/**
 * Build a spatial context string for LLM prompting (legacy)
 *
 * @param {Object} layoutData - Output from extractLayout
 * @returns {string} Human-readable spatial context
 */
export function buildSpatialContext(layoutData) {
  const { text, controls, summary } = layoutData;

  const lines = [
    `Page dimensions: ${layoutData.dimensions.width} x ${layoutData.dimensions.height} points`,
    `Text blocks: ${summary.total_blocks}`,
    `Rows: ${summary.total_rows}`,
    `Detected controls: ${summary.total_controls}`,
    '',
    'Row type distribution:',
  ];

  for (const [type, count] of Object.entries(summary.row_types)) {
    lines.push(`  ${type}: ${count}`);
  }

  lines.push('', 'Rows by position (top to bottom):');

  text.rows.slice(0, 20).forEach((row, i) => {
    const blockTexts = row.blocks.map((b) => b.text.substring(0, 25)).join(' | ');
    lines.push(`  ${i}: [${row.type}] ${blockTexts}`);
  });

  if (text.rows.length > 20) {
    lines.push(`  ... and ${text.rows.length - 20} more rows`);
  }

  return lines.join('\n');
}

/**
 * Build structured row context for LLM extraction
 *
 * Returns a semi-structured object that the LLM can reason over:
 * - page_type: "form" or "text"
 * - rows: Array with stable IDs, types, and block references
 * - row_groups: Groups of consecutive rows that form logical units
 * - controls: Mapped to nearby blocks
 * - blocks: Full block list for provenance lookups
 *
 * @param {Object} layoutData - Output from extractLayout
 * @returns {Object} Structured context for LLM
 */
export function buildRowContext(layoutData) {
  if (!layoutData) {
    return null;
  }

  const { text, controls, page_type, classification, visual_sections } = layoutData;

  // For text pages, return simpler structure (no rows)
  if (page_type === 'text' || !text.rows) {
    return {
      page_type: 'text',
      column_count: classification?.signals?.column_count || 1,
      is_multi_column: (classification?.signals?.column_count || 1) > 1,
      rows: null,
      row_groups: null,
      controls: [],
      blocks: text.blocks.map((b) => ({
        id: b.id,
        text: b.text.length > 100 ? b.text.substring(0, 100) + '...' : b.text,
        type: b.is_bold ? 'bold' : 'normal',
      })),
    };
  }

  // For form pages, build full row structure with stable IDs
  const rows = text.rows.map((row, index) => {
    const rowBlocks = row.blocks.map((b) => ({
      id: b.id,
      text: b.text.length > 60 ? b.text.substring(0, 60) + '...' : b.text,
    }));

    return {
      id: `r${index}`,
      type: row.type,
      y_range: [row.y_min, row.y_max],
      blocks: rowBlocks,
    };
  });

  // Build row groups (groups of consecutive rows that form logical units)
  const rowGroups = (text.row_groups || []).map((group) => {
    const result = {
      id: group.id,
      hint: group.hint,
      row_ids: group.row_indices.map((i) => `r${i}`),
      row_count: group.row_count,
    };

    // Include grid structure if available (from grid inference)
    if (group.grid) {
      result.grid = {
        columns: group.grid.columns,
        rows: group.grid.rows.map((row) => ({
          cells: row.cells.map((cell) =>
            cell ? { id: cell.id, text: cell.text } : null
          ),
        })),
      };
    }

    return result;
  });

  // Map controls to nearby blocks/rows
  const mappedControls = (controls?.items || []).map((ctrl, index) => {
    const result = {
      id: `c${index}`,
      type: ctrl.type || 'checkbox',
      bbox: ctrl.pdf_bbox,
    };

    // Add label association if available
    if (ctrl.label_block_id !== undefined) {
      result.near_block = ctrl.label_block_id;
      result.label_text = ctrl.label_text;
    }

    return result;
  });

  // Build block lookup (truncated for context size)
  const blocks = text.blocks.map((b) => ({
    id: b.id,
    text: b.text.length > 80 ? b.text.substring(0, 80) + '...' : b.text,
  }));

  // Build visual sections context (for LLM to understand table structure)
  let visualContext = null;
  if (visual_sections && visual_sections.tables) {
    visualContext = {
      table_count: visual_sections.total_tables,
      tables: visual_sections.tables.map((t) => ({
        region: t.region,
        num_rows: t.num_rows,
        row_boundaries: t.row_boundaries.slice(0, 10), // Limit for context size
        sections: t.sections.map((s) => ({
          type: s.type,
          side: s.side,
          rowspan: s.rowspan,
        })),
      })),
    };
  }

  return {
    page_type: 'form',
    row_count: rows.length,
    row_group_count: rowGroups.length,
    control_count: mappedControls.length,
    rows,
    row_groups: rowGroups,
    controls: mappedControls,
    blocks,
    visual_structure: visualContext,
  };
}
