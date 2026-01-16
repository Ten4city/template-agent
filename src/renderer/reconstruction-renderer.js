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
    .map((element, elementIndex) => renderElement(element, blockMap, elementIndex))
    .join('\n');

  return `<!-- Page ${page.pageNumber} -->
<div class="page" data-page="${page.pageNumber}">
${elementsHtml}
</div>`;
}

/**
 * Render a single element
 */
function renderElement(element, blockMap, elementIndex) {
  switch (element.type) {
    case 'header':
      return renderHeader(element, elementIndex);
    case 'table':
      return renderTable(element, elementIndex);
    case 'paragraph':
      return renderParagraph(element, blockMap, elementIndex);
    default:
      return `<!-- Unknown element type: ${element.type} -->`;
  }
}

/**
 * Render a header element
 */
function renderHeader(element, elementIndex) {
  const style = getHeaderStyle(element);
  const text = escapeHtml(element.text || '');

  return `<div class="section-header selectable" data-element-index="${elementIndex}" data-element-type="header" style="${style}">${text}</div>`;
}

/**
 * Get CSS style for header based on style hint or custom style object
 */
function getHeaderStyle(element) {
  const styleHint = element.style;
  const customStyle = element.customStyle || {};

  // Base styles (can be overridden)
  let baseStyles = {
    padding: '8px 12px',
    fontWeight: 'bold',
    fontSize: '12px',
    marginTop: '8px',
    marginBottom: '4px',
  };

  // Apply preset style
  let presetStyles = {};
  switch (styleHint) {
    case 'blue':
      presetStyles = { backgroundColor: '#1a5276', color: 'white' };
      break;
    case 'gray':
    case 'grey':
      presetStyles = { backgroundColor: '#e0e0e0', color: 'black' };
      break;
    case 'bold':
      presetStyles = { backgroundColor: 'transparent', color: 'black', borderBottom: '1px solid #000' };
      break;
    default:
      presetStyles = { backgroundColor: '#f0f0f0', color: 'black' };
  }

  // Merge: base -> preset -> custom (custom wins)
  const finalStyles = { ...baseStyles, ...presetStyles, ...customStyle };

  return buildStyleString(finalStyles);
}

/**
 * Build CSS style string from style object
 */
function buildStyleString(styleObj) {
  if (!styleObj) return '';

  return Object.entries(styleObj)
    .filter(([_, value]) => value !== undefined && value !== null)
    .map(([key, value]) => `${camelToKebab(key)}: ${value}`)
    .join('; ');
}

/**
 * Convert camelCase to kebab-case
 */
function camelToKebab(str) {
  return str.replace(/([A-Z])/g, '-$1').toLowerCase();
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
 * @param {*} cell - Cell content (string, object, or null)
 * @param {boolean} bordered - Whether to render with borders
 * @param {number} elementIndex - Parent table's element index
 * @param {number} rowIndex - Row index
 * @param {number} colIndex - Column index
 */
function renderCell(cell, bordered = false, elementIndex = 0, rowIndex = 0, colIndex = 0) {
  // null = skip this cell (covered by rowspan from above)
  if (cell === null) {
    return '';
  }

  // Data attributes for selection
  const dataAttrs = `class="selectable-cell" data-row="${rowIndex}" data-col="${colIndex}"`;

  // String cell - simple content
  if (typeof cell === 'string') {
    const baseStyle = bordered
      ? { border: '1px solid #000', verticalAlign: 'top' }
      : { verticalAlign: 'top' };
    const displayValue = escapeHtml(cell).replace(/\n/g, '<br>');
    return `<td ${dataAttrs} style="${buildStyleString(baseStyle)}">${displayValue}</td>`;
  }

  // Object cell - may have rowspan/colspan and custom styles
  if (typeof cell === 'object' && cell !== null) {
    const text = cell.text || '';
    const displayValue = escapeHtml(text).replace(/\n/g, '<br>');

    const attrs = [dataAttrs];
    if (cell.rowspan && cell.rowspan > 1) {
      attrs.push(`rowspan="${cell.rowspan}"`);
    }
    if (cell.colspan && cell.colspan > 1) {
      attrs.push(`colspan="${cell.colspan}"`);
    }

    // Build cell style: base + borders (if table is bordered) + custom cell styles
    const baseStyle = { verticalAlign: 'top' };

    // Table-level borders
    if (bordered) {
      baseStyle.border = '1px solid #000';
    }

    // Cell-level custom styles
    const customStyle = {};
    if (cell.backgroundColor) {
      customStyle.backgroundColor = cell.backgroundColor;
    }
    if (cell.width) {
      customStyle.width = cell.width;
    }
    if (cell.textAlign) {
      customStyle.textAlign = cell.textAlign;
    }
    if (cell.verticalAlign) {
      customStyle.verticalAlign = cell.verticalAlign;
    }
    if (cell.padding) {
      customStyle.padding = cell.padding;
    }

    // Cell-level border overrides (per-side)
    if (cell.borderTop) customStyle.borderTop = cell.borderTop;
    if (cell.borderBottom) customStyle.borderBottom = cell.borderBottom;
    if (cell.borderLeft) customStyle.borderLeft = cell.borderLeft;
    if (cell.borderRight) customStyle.borderRight = cell.borderRight;
    // Full border override
    if (cell.border) customStyle.border = cell.border;

    // Text formatting
    if (cell.fontWeight) customStyle.fontWeight = cell.fontWeight;
    if (cell.fontStyle) customStyle.fontStyle = cell.fontStyle;
    if (cell.textDecoration) customStyle.textDecoration = cell.textDecoration;
    if (cell.fontSize) customStyle.fontSize = cell.fontSize;
    if (cell.fontFamily) customStyle.fontFamily = cell.fontFamily;
    if (cell.color) customStyle.color = cell.color;

    const finalStyle = { ...baseStyle, ...customStyle };
    const attrStr = attrs.join(' ');
    return `<td ${attrStr} style="${buildStyleString(finalStyle)}">${displayValue}</td>`;
  }

  // Fallback for unexpected types
  const baseStyle = bordered
    ? { border: '1px solid #000', verticalAlign: 'top' }
    : { verticalAlign: 'top' };
  return `<td ${dataAttrs} style="${buildStyleString(baseStyle)}">${escapeHtml(String(cell))}</td>`;
}

/**
 * Render a table element
 */
function renderTable(element, elementIndex) {
  if (!element.rows || element.rows.length === 0) {
    return '<!-- Empty table -->';
  }

  // Validate and fix column counts
  const fixedElement = validateAndFixTable(element);
  const bordered = element.bordered === true;

  const rowsHtml = fixedElement.rows
    .map((row, rowIndex) => {
      const cellsHtml = row
        .map((cell, colIndex) => renderCell(cell, bordered, elementIndex, rowIndex, colIndex))
        .join('');
      return `<tr data-row="${rowIndex}">${cellsHtml}</tr>`;
    })
    .join('\n');

  // Build table styles
  const tableStyle = {
    borderCollapse: 'collapse',
    width: '100%',
  };

  // Apply custom element styles (margins, width override)
  const customStyle = element.customStyle || {};
  if (customStyle.marginTop) tableStyle.marginTop = customStyle.marginTop;
  if (customStyle.marginBottom) tableStyle.marginBottom = customStyle.marginBottom;
  if (customStyle.marginLeft) tableStyle.marginLeft = customStyle.marginLeft;
  if (customStyle.marginRight) tableStyle.marginRight = customStyle.marginRight;
  if (customStyle.width) tableStyle.width = customStyle.width;

  const borderAttr = bordered ? 'border="1"' : 'border="0"';
  const cellPadding = element.cellPadding || '0';
  const cellSpacing = element.cellSpacing || '0';

  return `<table class="selectable" data-element-index="${elementIndex}" data-element-type="table" ${borderAttr} cellpadding="${cellPadding}" cellspacing="${cellSpacing}" style="${buildStyleString(tableStyle)}">
${rowsHtml}
</table>`;
}

/**
 * Render a paragraph element
 */
function renderParagraph(element, blockMap, elementIndex) {
  let text = '';

  if (element.text) {
    text = element.text;
  } else if (element.blockIndex !== undefined && blockMap[element.blockIndex]) {
    text = blockMap[element.blockIndex].text;
  } else if (element.blockIndex !== undefined) {
    text = `[Missing block ${element.blockIndex}]`;
  }

  // Build paragraph styles
  const baseStyle = {
    padding: '8px 0',
    lineHeight: '1',
  };

  // Apply custom element styles
  const customStyle = element.customStyle || {};
  const finalStyle = { ...baseStyle, ...customStyle };

  return `<div class="paragraph selectable" data-element-index="${elementIndex}" data-element-type="paragraph" style="${buildStyleString(finalStyle)}">${escapeHtml(text).replace(/\n/g, '<br>')}</div>`;
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
      font-size: 10px;
      line-height: 1;
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
      vertical-align: top;
    }
    /* Selection styles */
    .selectable:hover {
      outline: 2px solid #3b82f6;
      outline-offset: 1px;
      cursor: pointer;
    }
    .selectable.selected {
      outline: 2px solid #2563eb;
      outline-offset: 1px;
      background-color: rgba(59, 130, 246, 0.1);
    }
    .selectable-cell:hover {
      background-color: rgba(59, 130, 246, 0.15);
      cursor: pointer;
    }
    .selectable-cell.selected {
      background-color: rgba(59, 130, 246, 0.25);
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
