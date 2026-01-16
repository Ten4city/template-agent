/**
 * Preview System
 *
 * Generates before/after preview for edit changes.
 */

import { renderDocumentStructure } from '../renderer/reconstruction-renderer.js';

/**
 * Generate preview comparing original and edited structures
 *
 * @param {Object} originalStructure - Original document structure
 * @param {Object} editedStructure - Edited document structure
 * @returns {Object} {before, after, changes}
 */
export function generatePreview(originalStructure, editedStructure) {
  return {
    before: renderDocumentStructure(originalStructure),
    after: renderDocumentStructure(editedStructure),
    changes: computeChanges(originalStructure, editedStructure),
  };
}

/**
 * Compute list of changes between structures
 *
 * @param {Object} original - Original structure
 * @param {Object} edited - Edited structure
 * @returns {Array} List of change descriptions
 */
function computeChanges(original, edited) {
  const changes = [];

  const origElements = original.pages[0]?.elements || [];
  const editElements = edited.pages[0]?.elements || [];

  const maxLen = Math.max(origElements.length, editElements.length);

  for (let i = 0; i < maxLen; i++) {
    const origEl = origElements[i];
    const editEl = editElements[i];

    if (!origEl && editEl) {
      changes.push({
        elementIndex: i,
        type: 'added',
        elementType: editEl.type,
      });
      continue;
    }

    if (origEl && !editEl) {
      changes.push({
        elementIndex: i,
        type: 'deleted',
        elementType: origEl.type,
      });
      continue;
    }

    // Compare elements
    const origJson = JSON.stringify(origEl);
    const editJson = JSON.stringify(editEl);

    if (origJson !== editJson) {
      const details = detectChangeDetails(origEl, editEl);
      changes.push({
        elementIndex: i,
        type: 'modified',
        elementType: editEl.type,
        details,
      });
    }
  }

  return changes;
}

/**
 * Detect specific changes between two elements
 */
function detectChangeDetails(original, edited) {
  const details = [];

  // Check bordered change
  if (original.bordered !== edited.bordered) {
    details.push(`bordered: ${original.bordered} -> ${edited.bordered}`);
  }

  // Check row count change
  if (original.rows && edited.rows) {
    if (original.rows.length !== edited.rows.length) {
      details.push(`rows: ${original.rows.length} -> ${edited.rows.length}`);
    }

    // Check for cell changes
    const minRows = Math.min(original.rows.length, edited.rows.length);
    for (let r = 0; r < minRows; r++) {
      const origRow = original.rows[r];
      const editRow = edited.rows[r];

      if (JSON.stringify(origRow) !== JSON.stringify(editRow)) {
        // Find specific cell changes
        const minCols = Math.min(origRow.length, editRow.length);
        for (let c = 0; c < minCols; c++) {
          if (JSON.stringify(origRow[c]) !== JSON.stringify(editRow[c])) {
            const origText = getCellText(origRow[c]);
            const editText = getCellText(editRow[c]);

            // Check for merge (colspan/rowspan added)
            const origSpan = getCellSpan(origRow[c]);
            const editSpan = getCellSpan(editRow[c]);

            if (origSpan.colspan !== editSpan.colspan || origSpan.rowspan !== editSpan.rowspan) {
              details.push(`cell(${r},${c}): merged ${editSpan.rowspan}x${editSpan.colspan}`);
            } else if (origText !== editText) {
              details.push(`cell(${r},${c}): "${origText}" -> "${editText}"`);
            } else if (origRow[c] !== null && editRow[c] === null) {
              details.push(`cell(${r},${c}): covered by merge`);
            }
          }
        }
      }
    }
  }

  // Check text change for headers
  if (original.text !== edited.text) {
    details.push(`text: "${original.text}" -> "${edited.text}"`);
  }

  return details;
}

/**
 * Get text content from a cell
 */
function getCellText(cell) {
  if (cell === null) return '[null]';
  if (typeof cell === 'string') return cell;
  if (typeof cell === 'object') return cell.text || '';
  return String(cell);
}

/**
 * Get span info from a cell
 */
function getCellSpan(cell) {
  if (typeof cell === 'object' && cell !== null) {
    return {
      colspan: cell.colspan || 1,
      rowspan: cell.rowspan || 1,
    };
  }
  return { colspan: 1, rowspan: 1 };
}

/**
 * Format changes for display
 */
export function formatChanges(changes) {
  if (changes.length === 0) {
    return 'No changes detected';
  }

  return changes
    .map((c) => {
      let desc = `Element ${c.elementIndex} (${c.elementType}): ${c.type}`;
      if (c.details && c.details.length > 0) {
        desc += '\n  - ' + c.details.join('\n  - ');
      }
      return desc;
    })
    .join('\n');
}
