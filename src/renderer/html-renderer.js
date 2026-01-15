/**
 * Deterministic HTML Renderer
 *
 * Converts Semantic IR to HTML following house rules.
 * No LLM involvement - pure data transformation.
 */

// =============================================================================
// CONFIGURATION (House Style)
// =============================================================================

const CONFIG = {
  // Table styling - dense, bureaucratic
  table: {
    borderCollapse: 'collapse',
    width: '100%',
    fontFamily: 'Arial, sans-serif',
    fontSize: '10.5px',
  },

  // Cell defaults - tight padding, strong borders
  cell: {
    border: '1px solid #000',
    padding: '3px 5px',
    verticalAlign: 'middle',
  },

  // Section header - lighter bg, strong text
  sectionHeader: {
    backgroundColor: '#f0f0f0',
    fontWeight: 'bold',
    fontSize: '11px',
    padding: '4px 6px',
  },

  // Field styling - minimal, form-like
  field: {
    border: '1px solid #000',
    borderRadius: '0',
    padding: '2px 4px',
    fontSize: '10.5px',
    width: '100%',
    boxSizing: 'border-box',
  },

  // Photo box - smaller, rigid
  photoBox: {
    width: '100px',
    height: '120px',
    border: '1px solid #000',
  },

  // Signature box
  signatureBox: {
    width: '180px',
    height: '50px',
    borderBottom: '1px solid #000',
  },

  // Spacing - minimal
  sectionGap: '6px',
};

// =============================================================================
// MAIN RENDERER
// =============================================================================

/**
 * Render a complete document IR to HTML
 * @param {Object} documentIR - DocumentIR object
 * @param {Array} layoutDataByPage - Array of layout data per page (from PyMuPDF)
 * @returns {string} - Complete HTML document
 */
export function renderDocument(documentIR, layoutDataByPage = []) {
  const pagesHtml = documentIR.pages
    .map((page, pageIndex) => {
      // Build text blocks map for this page from layout data
      const layoutData = layoutDataByPage[pageIndex];
      const textBlocks = {};
      if (layoutData?.text?.blocks) {
        layoutData.text.blocks.forEach((b) => {
          textBlocks[b.id] = b;
        });
      }
      return renderPage(page, textBlocks);
    })
    .join('\n\n');

  return wrapInDocument(pagesHtml, documentIR.title);
}

/**
 * Render a single page IR to HTML
 * @param {Object} pageIR - PageIR object
 * @param {Object} textBlocks - Map of block indices to content
 * @returns {string} - HTML for this page
 */
export function renderPage(pageIR, textBlocks = {}) {
  const sectionsHtml = pageIR.sections
    .map((section) => renderSection(section, textBlocks))
    .join(`\n<div style="height: ${CONFIG.sectionGap}"></div>\n`);

  return `<!-- Page ${pageIR.pageNumber} -->\n<div class="page" data-page="${pageIR.pageNumber}">\n${sectionsHtml}\n</div>`;
}

/**
 * Render a section to HTML
 * @param {Object} section - Section object
 * @param {Object} textBlocks - Map of block indices to content
 * @returns {string} - HTML for this section
 */
export function renderSection(section, textBlocks = {}) {
  const renderer = sectionRenderers[section.type];
  if (!renderer) {
    console.warn(`Unknown section type: ${section.type}`);
    return `<!-- Unknown section type: ${section.type} -->`;
  }
  return renderer(section, textBlocks);
}

// =============================================================================
// SECTION RENDERERS
// =============================================================================

const sectionRenderers = {
  /**
   * 1. Section Header
   */
  'section-header': (section, textBlocks) => {
    const title = resolveText(section.title, section.blockIndex, textBlocks);
    const note = section.note ? ` <span style="font-weight: normal; font-size: 11px;">(${section.note})</span>` : '';
    const shade = getShadeColor(section.shade);

    return `<table style="${tableStyle()}">
  <tr>
    <td style="${cellStyle({ backgroundColor: shade, ...CONFIG.sectionHeader })}">${escapeHtml(title)}${note}</td>
  </tr>
</table>`;
  },

  /**
   * 2. Input Grid
   */
  'input-grid': (section, textBlocks) => {
    const rows = section.rows.map((row) => {
      const cells = row.map((cell) => renderCell(cell, textBlocks)).join('\n      ');
      return `    <tr>\n      ${cells}\n    </tr>`;
    }).join('\n');

    return `<table style="${tableStyle()}">
${rows}
</table>`;
  },

  /**
   * 3. Photo Grid
   */
  'photo-grid': (section, textBlocks) => {
    const rows = section.rows.map((row) => {
      const cells = row.map((box) => {
        const label = resolveText(box.label, box.blockIndex, textBlocks, true);
        const width = box.width || CONFIG.photoBox.width;
        const height = box.height || CONFIG.photoBox.height;
        const border = box.boxType === 'signature' ? CONFIG.signatureBox.borderBottom : CONFIG.photoBox.border;

        return `<td style="${cellStyle({ textAlign: 'left', padding: '4px 6px' })}">
        <div style="width: ${width}; height: ${height}; border: ${border}; position: relative;">
          <span style="color: #888; font-size: 8px; position: absolute; bottom: 2px; left: 2px;">${escapeHtml(box.boxType || 'photo')}</span>
        </div>
        <div style="margin-top: 2px; font-size: 9px;">${escapeHtml(label)}</div>
      </td>`;
      }).join('\n      ');
      return `    <tr>\n      ${cells}\n    </tr>`;
    }).join('\n');

    return `<table style="${tableStyle()}">
${rows}
</table>`;
  },

  /**
   * 4. Bullet List
   */
  'bullet-list': (section, textBlocks) => {
    const marker = getBulletMarker(section.marker);
    const rows = section.items.map((item) => {
      const text = resolveText(item.text, item.blockIndex, textBlocks);
      const indent = (item.level || 0) * 20;

      return `    <tr>
      <td style="${cellStyle({ width: '20px', verticalAlign: 'top', border: 'none', paddingLeft: indent + 'px' })}">${marker}</td>
      <td style="${cellStyle({ border: 'none' })}">${escapeHtml(text)}</td>
    </tr>`;
    }).join('\n');

    return `<table style="${tableStyle({ border: 'none' })}">
${rows}
</table>`;
  },

  /**
   * 5. Numbered List
   */
  'numbered-list': (section, textBlocks) => {
    const rows = renderNumberedItems(section.items, textBlocks, section.startStyle || '1');
    return `<table style="${tableStyle({ border: 'none' })}">
${rows}
</table>`;
  },

  /**
   * 6. Data Table
   */
  'data-table': (section, textBlocks) => {
    // Header row
    let headerRow = '';
    if (section.headers && section.headers.length > 0) {
      const headers = section.headers.map((h) =>
        `<th style="${cellStyle({ backgroundColor: '#f5f5f5', fontWeight: 'bold', fontSize: '10px' })}">${escapeHtml(h)}</th>`
      ).join('\n      ');
      headerRow = `    <tr>\n      ${headers}\n    </tr>\n`;
    }

    let rows = '';

    // New schema: columns + repeatRows
    if (section.columns && section.repeatRows) {
      const repeatCount = section.repeatRows || 1;
      const dataRows = [];

      for (let r = 0; r < repeatCount; r++) {
        const cells = section.columns.map((col, colIdx) => {
          // Append row number to field name for uniqueness
          const fieldName = col.name ? `${col.name}_${r + 1}` : `field_${colIdx}_${r + 1}`;
          const field = renderField(col.fieldType || 'text', fieldName, col);
          return `<td style="${cellStyle()}">${field}</td>`;
        }).join('\n      ');
        dataRows.push(`    <tr>\n      ${cells}\n    </tr>`);
      }
      rows = dataRows.join('\n');
    }
    // Legacy schema: rows with cells
    else if (section.rows) {
      rows = section.rows.map((row) => {
        const cells = row.cells.map((cell) => {
          const text = resolveText(cell.text, cell.blockIndex, textBlocks);
          const colspan = cell.colspan ? ` colspan="${cell.colspan}"` : '';
          const rowspan = cell.rowspan ? ` rowspan="${cell.rowspan}"` : '';

          if (cell.editable) {
            const field = renderField(cell.fieldType || 'text', cell.name || '', cell);
            return `<td${colspan}${rowspan} style="${cellStyle()}">${field}</td>`;
          }

          return `<td${colspan}${rowspan} style="${cellStyle()}">${escapeHtml(text)}</td>`;
        }).join('\n      ');
        return `    <tr>\n      ${cells}\n    </tr>`;
      }).join('\n');
    }

    return `<table style="${tableStyle()}">
${headerRow}${rows}
</table>`;
  },

  /**
   * 7. Signature Block - dense, formal
   */
  'signature-block': (section, textBlocks) => {
    const cols = section.slots.length;
    const cells = section.slots.map((slot) => {
      const role = resolveText(slot.role, slot.blockIndex, textBlocks);
      let content = `<div style="font-weight: bold; font-size: 10px; margin-bottom: 4px;">${escapeHtml(role)}</div>`;

      if (slot.hasSignature) {
        content += `<div style="margin-bottom: 4px;">
          <div style="border-bottom: 1px solid #000; height: 30px; margin-bottom: 2px;"></div>
          <div style="font-size: 8px;">Signature</div>
        </div>`;
      }

      if (slot.hasName) {
        content += `<div style="margin-bottom: 3px;">
          <span style="font-size: 9px;">Name:</span>
          <input type="text" style="${fieldStyle({ width: '100%' })}" />
        </div>`;
      }

      if (slot.hasDate) {
        content += `<div style="margin-bottom: 3px;">
          <span style="font-size: 9px;">Date:</span>
          <input type="date" style="${fieldStyle({ width: '100%' })}" />
        </div>`;
      }

      if (slot.hasPlace) {
        content += `<div style="margin-bottom: 3px;">
          <span style="font-size: 9px;">Place:</span>
          <input type="text" style="${fieldStyle({ width: '100%' })}" />
        </div>`;
      }

      if (slot.hasDesignation) {
        content += `<div style="margin-bottom: 3px;">
          <span style="font-size: 9px;">Designation:</span>
          <input type="text" style="${fieldStyle({ width: '100%' })}" />
        </div>`;
      }

      return `<td style="${cellStyle({ verticalAlign: 'top', width: `${100 / cols}%` })}">${content}</td>`;
    }).join('\n    ');

    return `<table style="${tableStyle()}">
  <tr>
    ${cells}
  </tr>
</table>`;
  },

  /**
   * 8. Key-Value Stack
   */
  'key-value-stack': (section, textBlocks) => {
    const rows = section.pairs.map((pair) => {
      const label = resolveText(pair.label, pair.blockIndex, textBlocks);
      const field = renderField(pair.fieldType, pair.name, pair);

      return `    <tr>
      <td style="${cellStyle({ width: '30%', fontWeight: 'bold' })}">${escapeHtml(label)}</td>
      <td style="${cellStyle()}">${field}</td>
    </tr>`;
    }).join('\n');

    return `<table style="${tableStyle()}">
${rows}
</table>`;
  },

  /**
   * 9. Instruction Paragraph - dense
   */
  'instruction-paragraph': (section, textBlocks) => {
    const text = resolveText(section.text, section.blockIndex, textBlocks);
    const align = section.align || 'left';
    const fontWeight = section.bold ? 'bold' : 'normal';
    const fontStyle = section.italic ? 'italic' : 'normal';

    return `<p style="text-align: ${align}; font-weight: ${fontWeight}; font-style: ${fontStyle}; margin: 3px 0; line-height: 1.2; font-size: 10px;">${escapeHtml(text)}</p>`;
  },

  /**
   * 10. Cover Block - Table-based, formal
   */
  'cover-block': (section, textBlocks) => {
    const title = resolveText(section.title, section.titleBlockIndex, textBlocks);
    const subtitle = section.subtitle ? resolveText(section.subtitle, section.subtitleBlockIndex, textBlocks) : '';

    let rows = '';

    if (section.logo) {
      rows += `<tr><td style="text-align: center; padding: 10px; border: none;"><img src="${section.logo}" alt="Logo" style="max-height: 60px;" /></td></tr>`;
    }

    rows += `<tr><td style="text-align: center; padding: 8px; border: 1px solid #000; font-size: 14px; font-weight: bold;">${escapeHtml(title)}</td></tr>`;

    if (subtitle) {
      rows += `<tr><td style="text-align: center; padding: 4px; border: 1px solid #000; border-top: none; font-size: 11px;">${escapeHtml(subtitle)}</td></tr>`;
    }

    if (section.organization) {
      rows += `<tr><td style="text-align: center; padding: 4px; border: 1px solid #000; border-top: none; font-size: 10px;">${escapeHtml(section.organization)}</td></tr>`;
    }

    if (section.version) {
      rows += `<tr><td style="text-align: center; padding: 3px; border: 1px solid #000; border-top: none; font-size: 9px; color: #444;">${escapeHtml(section.version)}</td></tr>`;
    }

    return `<table style="${tableStyle()}">
${rows}
</table>`;
  },

  /**
   * 11. Page Break
   */
  'page-break': () => {
    return `<div style="page-break-after: always;"></div>`;
  },

  /**
   * 12. Separator - minimal spacing
   */
  'separator': (section) => {
    const size = { small: '4px', medium: '8px', large: '12px' }[section.size || 'medium'];

    if (section.style === 'line') {
      return `<hr style="margin: ${size} 0; border: none; border-top: 1px solid #000;" />`;
    } else if (section.style === 'dots') {
      return `<div style="text-align: center; margin: ${size} 0; color: #666; font-size: 8px;">• • •</div>`;
    } else {
      return `<div style="height: ${size};"></div>`;
    }
  },

  /**
   * 13. Checkbox Matrix
   */
  'checkbox-matrix': (section, textBlocks) => {
    // Header row
    const headerCells = ['', ...section.columnHeaders].map((h, i) =>
      `<th style="${cellStyle({ backgroundColor: '#f5f5f5', fontWeight: 'bold', fontSize: '10px', textAlign: i === 0 ? 'left' : 'center' })}">${escapeHtml(h)}</th>`
    ).join('\n      ');

    // Data rows
    const rows = section.rows.map((row) => {
      const label = resolveText(row.label, row.blockIndex, textBlocks);
      const labelCell = `<td style="${cellStyle()}">${escapeHtml(label)}</td>`;
      const checkboxCells = section.columnHeaders.map((_, i) =>
        `<td style="${cellStyle({ textAlign: 'center' })}"><input type="checkbox" name="${row.name}_${i}" /></td>`
      ).join('\n      ');

      return `    <tr>\n      ${labelCell}\n      ${checkboxCells}\n    </tr>`;
    }).join('\n');

    return `<table style="${tableStyle()}">
  <tr>
      ${headerCells}
  </tr>
${rows}
</table>`;
  },

  /**
   * 14. Stamp Block - left-aligned, rigid
   */
  'stamp-block': (section) => {
    const width = section.width || '100px';
    const height = section.height || '100px';
    const label = section.label || 'Stamp/Seal';

    return `<div style="padding: 4px;">
  <div style="width: ${width}; height: ${height}; border: 1px solid #000; position: relative;">
    <span style="color: #888; font-size: 8px; position: absolute; bottom: 2px; left: 2px;">${escapeHtml(label)}</span>
  </div>
</div>`;
  },

  /**
   * 15. Declaration Block - dense, formal
   */
  'declaration-block': (section, textBlocks) => {
    const text = resolveText(section.text, section.blockIndex, textBlocks);
    let html = `<div style="padding: 4px 6px; border: 1px solid #000;">`;
    html += `<p style="margin: 0 0 4px 0; line-height: 1.2; font-size: 10px;">${escapeHtml(text)}</p>`;

    if (section.responseType === 'checkbox' || section.responseType === 'both') {
      const checkboxLabel = section.checkboxLabel || 'I agree';
      html += `<div style="margin: 4px 0;">
        <label style="font-size: 10px;"><input type="checkbox" name="declaration_agree" /> ${escapeHtml(checkboxLabel)}</label>
      </div>`;
    }

    if (section.responseType === 'signature' || section.responseType === 'both') {
      html += `<div style="margin-top: 6px;">
        <div style="border-bottom: 1px solid #000; width: 150px; height: 25px;"></div>
        <div style="font-size: 8px; margin-top: 2px;">Signature</div>
      </div>`;
    }

    html += `</div>`;
    return html;
  },

  /**
   * 16. Repeating Group - compact
   */
  'repeating-group': (section, textBlocks) => {
    const groupLabel = resolveText(section.groupLabel, section.blockIndex, textBlocks);
    let html = '';

    for (let i = 0; i < section.repeatCount; i++) {
      html += `<div class="repeating-group-instance" data-instance="${i + 1}">
  <div style="background: #f5f5f5; padding: 3px 6px; font-weight: bold; font-size: 10px; border: 1px solid #000; border-bottom: none; margin-top: ${i > 0 ? '8px' : '0'};">
    ${escapeHtml(groupLabel)} ${i + 1}
  </div>
  ${section.template.map((s) => renderSection(s, textBlocks)).join('\n')}
</div>`;
    }

    return html;
  },

  /**
   * 17. Multilingual Block
   */
  'multilingual-block': (section, textBlocks) => {
    return section.languages.map((lang) => {
      const langHeader = `<div style="background: #e8e8e8; padding: 4px 8px; font-size: 11px; font-weight: bold;">${escapeHtml(lang.language)}</div>`;
      const content = lang.content.map((s) => renderSection(s, textBlocks)).join('\n');
      return `<div class="language-section" data-language="${lang.language}">
  ${langHeader}
  ${content}
</div>`;
    }).join('\n<hr style="margin: 20px 0; border: none; border-top: 1px dashed #ccc;" />\n');
  },
};

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Render numbered list items recursively
 */
function renderNumberedItems(items, textBlocks, startStyle, counters = [0, 0, 0]) {
  const styles = ['1', 'A', 'i']; // Level 0, 1, 2 numbering styles

  return items.map((item) => {
    // Use item.level from IR as source of truth (default to 0)
    const itemLevel = item.level ?? 0;
    const style = styles[itemLevel] || '1';

    counters[itemLevel] = (counters[itemLevel] || 0) + 1;
    // Reset deeper counters when moving to a new parent
    for (let i = itemLevel + 1; i < counters.length; i++) {
      counters[i] = 0;
    }

    const number = formatNumber(counters[itemLevel], style);
    const text = resolveText(item.text, item.blockIndex, textBlocks);
    const indent = itemLevel * 20;

    let row = `    <tr>
      <td style="${cellStyle({ width: '30px', verticalAlign: 'top', border: 'none', paddingLeft: indent + 'px', fontWeight: itemLevel === 0 ? 'bold' : 'normal' })}">${number}.</td>
      <td style="${cellStyle({ border: 'none' })}">${escapeHtml(text)}</td>
    </tr>`;

    // Render children if present (nested structure)
    if (item.children && item.children.length > 0) {
      row += '\n' + renderNumberedItems(item.children, textBlocks, startStyle, counters);
    }

    return row;
  }).join('\n');
}

/**
 * Format number based on style
 */
function formatNumber(n, style) {
  switch (style) {
    case 'A': return String.fromCharCode(64 + n); // A, B, C...
    case 'a': return String.fromCharCode(96 + n); // a, b, c...
    case 'I': return toRoman(n).toUpperCase();
    case 'i': return toRoman(n).toLowerCase();
    default: return String(n);
  }
}

/**
 * Convert number to Roman numeral
 */
function toRoman(num) {
  const romanNumerals = [
    ['x', 10], ['ix', 9], ['v', 5], ['iv', 4], ['i', 1]
  ];
  let result = '';
  for (const [numeral, value] of romanNumerals) {
    while (num >= value) {
      result += numeral;
      num -= value;
    }
  }
  return result;
}

/**
 * Render a single cell
 */
function renderCell(cell, textBlocks) {
  // Build rowspan/colspan attributes
  const rowspanAttr = cell.rowspan ? ` rowspan="${cell.rowspan}"` : '';
  const colspanAttr = cell.colspan ? ` colspan="${cell.colspan}"` : '';
  const spanAttrs = `${rowspanAttr}${colspanAttr}`;

  // Handle spacer cell (empty)
  if (cell.type === 'spacer') {
    return `<td${spanAttrs} style="${cellStyle({ border: 'none' })}">&nbsp;</td>`;
  }

  // Handle photo cell (image upload box)
  if (cell.type === 'photo') {
    const label = resolveText(cell.label || cell.text, cell.blockIndex, textBlocks, true);
    const width = cell.width || '80px';
    const height = cell.height || '100px';
    return `<td${spanAttrs} style="${cellStyle({ textAlign: 'center', verticalAlign: 'top', padding: '4px' })}">
        <div style="font-size: 9px; margin-bottom: 4px;">${escapeHtml(label)}</div>
        <div style="width: ${width}; height: ${height}; border: 1px dotted #999; display: inline-block;"></div>
      </td>`;
  }

  // Handle field cell
  if (cell.type === 'field') {
    return `<td${spanAttrs} style="${cellStyle()}">${renderField(cell.fieldType, cell.name, cell)}</td>`;
  }

  // Handle label/text cell
  const text = resolveText(cell.text, cell.blockIndex, textBlocks);
  const fontWeight = cell.bold ? 'bold' : 'normal';
  const fontStyle = cell.italic ? 'italic' : 'normal';

  return `<td${spanAttrs} style="${cellStyle({ fontWeight, fontStyle })}">${escapeHtml(text)}</td>`;
}

/**
 * Render a form field
 */
function renderField(fieldType, name, options = {}) {
  const style = fieldStyle();

  switch (fieldType) {
    case 'text':
    case 'email':
    case 'phone':
    case 'number':
    case 'date':
      return `<input type="${fieldType === 'phone' ? 'tel' : fieldType}" name="${escapeHtml(name)}" placeholder="${escapeHtml(options.placeholder || '')}" style="${style}" />`;

    case 'textarea':
      return `<textarea name="${escapeHtml(name)}" placeholder="${escapeHtml(options.placeholder || '')}" style="${style} min-height: 60px; resize: vertical;"></textarea>`;

    case 'checkbox':
      return `<input type="checkbox" name="${escapeHtml(name)}" />`;

    case 'radio':
      if (options.options && options.options.length > 0) {
        return options.options.map((opt, i) =>
          `<label style="margin-right: 15px;"><input type="radio" name="${escapeHtml(name)}" value="${escapeHtml(opt)}" /> ${escapeHtml(opt)}</label>`
        ).join(' ');
      }
      return `<input type="radio" name="${escapeHtml(name)}" />`;

    case 'dropdown':
      const opts = (options.options || []).map((opt) =>
        `<option value="${escapeHtml(opt)}">${escapeHtml(opt)}</option>`
      ).join('');
      return `<select name="${escapeHtml(name)}" style="${style}"><option value="">Select...</option>${opts}</select>`;

    case 'signature':
      return `<div style="border-bottom: 1px solid #000; height: 40px; min-width: 150px;"></div>`;

    case 'photo':
    case 'file':
      return `<input type="file" name="${escapeHtml(name)}" accept="${fieldType === 'photo' ? 'image/*' : '*'}" style="font-size: 11px;" />`;

    default:
      return `<input type="text" name="${escapeHtml(name)}" style="${style}" />`;
  }
}

/**
 * Resolve text content - either literal or from block index
 * Fails loudly on missing content to catch extraction bugs early
 */
function resolveText(literal, blockIndex, textBlocks, allowEmpty = false) {
  if (blockIndex !== undefined) {
    if (!textBlocks[blockIndex]) {
      console.warn(`[RENDER WARNING] Missing text block at index ${blockIndex}`);
      return literal || `[MISSING BLOCK ${blockIndex}]`;
    }
    return textBlocks[blockIndex].text || textBlocks[blockIndex];
  }
  if (!literal && !allowEmpty) {
    console.warn(`[RENDER WARNING] Missing literal text and no blockIndex provided`);
    return '[MISSING TEXT]';
  }
  return literal || '';
}

/**
 * Get background color for shade level - lighter grays
 */
function getShadeColor(shade) {
  switch (shade) {
    case 'dark': return '#d0d0d0';
    case 'medium': return '#e8e8e8';
    case 'light':
    default: return '#f2f2f2';
  }
}

/**
 * Get bullet marker character
 */
function getBulletMarker(marker) {
  switch (marker) {
    case 'circle': return '○';
    case 'square': return '■';
    case 'dash': return '–';
    case 'disc':
    default: return '•';
  }
}

/**
 * Generate table style string
 */
function tableStyle(overrides = {}) {
  const styles = { ...CONFIG.table, ...overrides };
  return Object.entries(styles)
    .map(([k, v]) => `${camelToKebab(k)}: ${v}`)
    .join('; ');
}

/**
 * Generate cell style string
 */
function cellStyle(overrides = {}) {
  const styles = { ...CONFIG.cell, ...overrides };
  return Object.entries(styles)
    .map(([k, v]) => `${camelToKebab(k)}: ${v}`)
    .join('; ');
}

/**
 * Generate field style string
 */
function fieldStyle(overrides = {}) {
  const styles = { ...CONFIG.field, ...overrides };
  return Object.entries(styles)
    .map(([k, v]) => `${camelToKebab(k)}: ${v}`)
    .join('; ');
}

/**
 * Convert camelCase to kebab-case
 */
function camelToKebab(str) {
  return str.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();
}

/**
 * Escape HTML special characters
 */
function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Wrap content in full HTML document
 */
function wrapInDocument(content, title = 'Document') {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)}</title>
  <style>
    * { box-sizing: border-box; }
    body {
      font-family: Arial, sans-serif;
      font-size: 10.5px;
      line-height: 1.2;
      max-width: 850px;
      margin: 10px auto;
      padding: 10px;
    }
    .page {
      margin-bottom: 20px;
      padding-bottom: 10px;
      border-bottom: 1px solid #000;
    }
    .page:last-child {
      border-bottom: none;
    }
    input, select, textarea {
      font-family: inherit;
      font-size: inherit;
    }
    input[type="text"], input[type="email"], input[type="tel"], input[type="number"], input[type="date"], select, textarea {
      border: 1px solid #000;
      border-radius: 0;
      padding: 2px 4px;
    }
    @media print {
      body { margin: 0; padding: 0; }
      .page {
        page-break-after: always;
        border-bottom: none;
        margin-bottom: 0;
      }
      .page:last-child {
        page-break-after: auto;
      }
    }
  </style>
</head>
<body>
${content}
</body>
</html>`;
}
