/**
 * Reconstruction Renderer
 *
 * Renders simplified structure to clean HTML tables.
 * No form inputs - just visual reconstruction.
 */

/**
 * Render a complete document structure to HTML
 */
export function renderDocumentStructure(documentStructure, textBlocksByPage = []) {
  const pagesHtml = documentStructure.pages
    .map((page, pageIndex) => {
      const textBlocks = textBlocksByPage[pageIndex] || [];
      const blockMap = {};
      textBlocks.forEach((b) => {
        blockMap[b.id] = b;
      });

      return renderPage(page, blockMap);
    })
    .join('\n\n');

  return wrapInDocument(pagesHtml);
}

/**
 * Render a single page
 */
function renderPage(page, blockMap) {
  const elementsHtml = page.elements
    .map((element) => renderElement(element, blockMap))
    .join('\n');

  return `<!-- Page ${page.pageNumber} -->
<div class="page" data-page="${page.pageNumber}">
${elementsHtml}
</div>`;
}

/**
 * Render a single element
 */
function renderElement(element, blockMap) {
  switch (element.type) {
    case 'header':
      return renderHeader(element);
    case 'table':
      return renderTable(element);
    case 'paragraph':
      return renderParagraph(element, blockMap);
    default:
      return `<!-- Unknown element type: ${element.type} -->`;
  }
}

/**
 * Render a header element
 */
function renderHeader(element) {
  const style = getHeaderStyle(element.style);
  const text = escapeHtml(element.text || '');

  return `<div class="section-header" style="${style}">${text}</div>`;
}

/**
 * Get CSS style for header based on style hint
 */
function getHeaderStyle(styleHint) {
  const baseStyle = 'padding: 8px 12px; font-weight: bold; font-size: 12px; margin: 8px 0 4px 0;';

  switch (styleHint) {
    case 'blue':
      return `${baseStyle} background-color: #1a5276; color: white;`;
    case 'gray':
    case 'grey':
      return `${baseStyle} background-color: #e0e0e0; color: black;`;
    case 'bold':
      return `${baseStyle} background-color: transparent; color: black; border-bottom: 1px solid #000;`;
    default:
      return `${baseStyle} background-color: #f0f0f0; color: black;`;
  }
}

/**
 * Count columns in a row, accounting for colspan
 */
function countRowColumns(row) {
  return row.reduce((sum, cell) => {
    if (cell === null) return sum + 1; // null counts as 1 (covered by rowspan)
    if (typeof cell === 'string') return sum + 1;
    if (typeof cell === 'object' && cell !== null) {
      return sum + (cell.colspan || 1);
    }
    return sum + 1;
  }, 0);
}

/**
 * Validate and auto-fix table column counts
 */
function validateAndFixTable(element) {
  if (!element.rows || element.rows.length === 0) {
    return element;
  }

  const declaredCols = element.columns;

  // If no columns declared, infer from first row
  if (!declaredCols) {
    const inferredCols = countRowColumns(element.rows[0]);
    console.warn(`Table missing 'columns' field, inferred: ${inferredCols}`);
    return { ...element, columns: inferredCols };
  }

  // Validate each row
  const fixedRows = element.rows.map((row, rowIndex) => {
    const actualCols = countRowColumns(row);

    if (actualCols === declaredCols) {
      return row; // Row is correct
    }

    if (actualCols < declaredCols) {
      // Row is short - pad with empty cells
      console.warn(`Table row ${rowIndex} has ${actualCols} cols, expected ${declaredCols}. Padding.`);
      const padding = Array(declaredCols - actualCols).fill('');
      return [...row, ...padding];
    }

    // Row is too long - just warn (hard to fix correctly)
    console.warn(`Table row ${rowIndex} has ${actualCols} cols, expected ${declaredCols}. Row too long.`);
    return row;
  });

  return { ...element, rows: fixedRows };
}

/**
 * Render a single cell
 */
function renderCell(cell) {
  // null = skip this cell (covered by rowspan from above)
  if (cell === null) {
    return '';
  }

  // String cell - simple content
  if (typeof cell === 'string') {
    const displayValue = escapeHtml(cell).replace(/\n/g, '<br>');
    const isEmpty = cell.trim() === '';
    const cellStyle = isEmpty
      ? 'border: 1px solid #000; padding: 4px 6px; min-width: 80px; background-color: #fafafa;'
      : 'border: 1px solid #000; padding: 4px 6px;';

    return `<td style="${cellStyle}">${displayValue}</td>`;
  }

  // Object cell - may have rowspan/colspan
  if (typeof cell === 'object' && cell !== null) {
    const text = cell.text || '';
    const displayValue = escapeHtml(text).replace(/\n/g, '<br>');
    const isEmpty = text.trim() === '';

    const attrs = [];
    if (cell.rowspan && cell.rowspan > 1) {
      attrs.push(`rowspan="${cell.rowspan}"`);
    }
    if (cell.colspan && cell.colspan > 1) {
      attrs.push(`colspan="${cell.colspan}"`);
    }

    const attrStr = attrs.length > 0 ? ' ' + attrs.join(' ') : '';
    const cellStyle = isEmpty
      ? 'border: 1px solid #000; padding: 4px 6px; min-width: 80px; background-color: #fafafa;'
      : 'border: 1px solid #000; padding: 4px 6px;';

    return `<td${attrStr} style="${cellStyle}">${displayValue}</td>`;
  }

  // Fallback for unexpected types
  return `<td style="border: 1px solid #000; padding: 4px 6px;">${escapeHtml(String(cell))}</td>`;
}

/**
 * Render a table element
 */
function renderTable(element) {
  if (!element.rows || element.rows.length === 0) {
    return '<!-- Empty table -->';
  }

  // Validate and fix column counts
  const fixedElement = validateAndFixTable(element);

  const rowsHtml = fixedElement.rows
    .map((row) => {
      const cellsHtml = row.map((cell) => renderCell(cell)).join('');
      return `<tr>${cellsHtml}</tr>`;
    })
    .join('\n');

  return `<table style="border-collapse: collapse; width: 100%; font-size: 11px; margin-bottom: 8px;">
${rowsHtml}
</table>`;
}

/**
 * Render a paragraph element
 */
function renderParagraph(element, blockMap) {
  let text = '';

  if (element.text) {
    text = element.text;
  } else if (element.blockIndex !== undefined && blockMap[element.blockIndex]) {
    text = blockMap[element.blockIndex].text;
  } else if (element.blockIndex !== undefined) {
    text = `[Missing block ${element.blockIndex}]`;
  }

  return `<div class="paragraph" style="padding: 8px 0; font-size: 11px; line-height: 1.4;">${escapeHtml(text).replace(/\n/g, '<br>')}</div>`;
}

/**
 * Wrap page content in HTML document
 */
function wrapInDocument(pagesHtml) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Reconstructed Document</title>
  <style>
    * { box-sizing: border-box; }
    body {
      font-family: Arial, sans-serif;
      font-size: 11px;
      line-height: 1.3;
      max-width: 850px;
      margin: 20px auto;
      padding: 20px;
      background: #fff;
    }
    .page {
      margin-bottom: 30px;
      padding-bottom: 20px;
      border-bottom: 2px solid #333;
    }
    .page:last-child {
      border-bottom: none;
    }
    .section-header {
      font-weight: bold;
    }
    table {
      border-collapse: collapse;
    }
    td {
      vertical-align: middle;
    }
    @media print {
      body { margin: 0; padding: 10px; }
      .page {
        page-break-after: always;
        border-bottom: none;
      }
      .page:last-child {
        page-break-after: auto;
      }
    }
  </style>
</head>
<body>
${pagesHtml}
</body>
</html>`;
}

/**
 * Escape HTML special characters
 */
function escapeHtml(text) {
  if (!text) return '';
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
