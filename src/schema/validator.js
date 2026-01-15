/**
 * IR Validator
 *
 * Validates IR structure before rendering.
 * Fails loudly on malformed input.
 */

import { SECTION_TYPES, FIELD_TYPES } from './ir.js';

/**
 * Validation result
 * @typedef {Object} ValidationResult
 * @property {boolean} valid
 * @property {string[]} errors
 * @property {string[]} warnings
 */

/**
 * Validate a complete document IR
 * @param {Object} doc - DocumentIR object
 * @returns {ValidationResult}
 */
export function validateDocumentIR(doc) {
  const errors = [];
  const warnings = [];

  if (!doc || typeof doc !== 'object') {
    return { valid: false, errors: ['Document IR must be an object'], warnings };
  }

  if (!Array.isArray(doc.pages)) {
    errors.push('Document must have pages array');
  } else {
    doc.pages.forEach((page, i) => {
      const pageResult = validatePageIR(page, i + 1);
      errors.push(...pageResult.errors.map(e => `Page ${i + 1}: ${e}`));
      warnings.push(...pageResult.warnings.map(w => `Page ${i + 1}: ${w}`));
    });
  }

  return { valid: errors.length === 0, errors, warnings };
}

/**
 * Validate a single page IR
 * @param {Object} page - PageIR object
 * @param {number} expectedPageNum - Expected page number
 * @returns {ValidationResult}
 */
export function validatePageIR(page, expectedPageNum = null) {
  const errors = [];
  const warnings = [];

  if (!page || typeof page !== 'object') {
    return { valid: false, errors: ['Page IR must be an object'], warnings };
  }

  if (typeof page.pageNumber !== 'number') {
    errors.push('Page must have pageNumber (number)');
  } else if (expectedPageNum && page.pageNumber !== expectedPageNum) {
    warnings.push(`Page number mismatch: expected ${expectedPageNum}, got ${page.pageNumber}`);
  }

  if (!Array.isArray(page.sections)) {
    errors.push('Page must have sections array');
  } else {
    page.sections.forEach((section, i) => {
      const sectionResult = validateSection(section);
      errors.push(...sectionResult.errors.map(e => `Section ${i}: ${e}`));
      warnings.push(...sectionResult.warnings.map(w => `Section ${i}: ${w}`));
    });

    // Check for empty page
    if (page.sections.length === 0) {
      warnings.push('Page has no sections');
    }
  }

  return { valid: errors.length === 0, errors, warnings };
}

/**
 * Validate a section
 * @param {Object} section - Section object
 * @returns {ValidationResult}
 */
export function validateSection(section) {
  const errors = [];
  const warnings = [];

  if (!section || typeof section !== 'object') {
    return { valid: false, errors: ['Section must be an object'], warnings };
  }

  if (!section.type) {
    errors.push('Section must have type');
    return { valid: false, errors, warnings };
  }

  if (!SECTION_TYPES.includes(section.type)) {
    errors.push(`Unknown section type: ${section.type}`);
    return { valid: false, errors, warnings };
  }

  // Type-specific validation
  const validator = sectionValidators[section.type];
  if (validator) {
    const result = validator(section);
    errors.push(...result.errors);
    warnings.push(...result.warnings);
  }

  return { valid: errors.length === 0, errors, warnings };
}

// =============================================================================
// SECTION-SPECIFIC VALIDATORS
// =============================================================================

const sectionValidators = {
  'section-header': (section) => {
    const errors = [];
    const warnings = [];

    if (!section.title && section.blockIndex === undefined) {
      errors.push('section-header must have title or blockIndex');
    }

    if (section.title && typeof section.title !== 'string') {
      errors.push('section-header title must be string');
    }

    // Section headers MUST have blockIndex - HARD ERROR
    if (section.title && section.blockIndex === undefined) {
      const preview = section.title.substring(0, 40) + (section.title.length > 40 ? '...' : '');
      errors.push(`Section header without blockIndex: "${preview}" - titles MUST reference a block`);
    }

    return { errors, warnings };
  },

  'input-grid': (section) => {
    const errors = [];
    const warnings = [];

    if (typeof section.columns !== 'number' || section.columns < 1) {
      errors.push('input-grid must have columns (positive number)');
    }

    if (!Array.isArray(section.rows)) {
      errors.push('input-grid must have rows array');
    } else {
      section.rows.forEach((row, i) => {
        if (!Array.isArray(row)) {
          errors.push(`input-grid row ${i} must be array`);
        } else {
          row.forEach((cell, j) => {
            const cellResult = validateCell(cell);
            errors.push(...cellResult.errors.map(e => `Row ${i} Cell ${j}: ${e}`));
            warnings.push(...cellResult.warnings.map(w => `Row ${i} Cell ${j}: ${w}`));
          });

          // Check row length matches columns
          if (row.length > section.columns) {
            warnings.push(`Row ${i} has ${row.length} cells but grid has ${section.columns} columns`);
          }
        }
      });

      // Empty grid warning
      if (section.rows.length === 0) {
        warnings.push('input-grid has no rows');
      }
    }

    return { errors, warnings };
  },

  'photo-grid': (section) => {
    const errors = [];
    const warnings = [];

    if (typeof section.columns !== 'number' || section.columns < 1) {
      errors.push('photo-grid must have columns (positive number)');
    }

    if (!Array.isArray(section.rows)) {
      errors.push('photo-grid must have rows array');
    } else {
      section.rows.forEach((row, i) => {
        if (!Array.isArray(row)) {
          errors.push(`photo-grid row ${i} must be array`);
        } else {
          row.forEach((box, j) => {
            if (!box.boxType) {
              errors.push(`Row ${i} Box ${j}: must have boxType`);
            }
          });
        }
      });
    }

    return { errors, warnings };
  },

  'bullet-list': (section) => {
    const errors = [];
    const warnings = [];

    if (!Array.isArray(section.items)) {
      errors.push('bullet-list must have items array');
    } else {
      section.items.forEach((item, i) => {
        const itemResult = validateListItem(item);
        errors.push(...itemResult.errors.map(e => `Item ${i}: ${e}`));
        warnings.push(...itemResult.warnings.map(w => `Item ${i}: ${w}`));
      });

      if (section.items.length === 0) {
        warnings.push('bullet-list has no items');
      }
    }

    return { errors, warnings };
  },

  'numbered-list': (section) => {
    const errors = [];
    const warnings = [];

    if (!Array.isArray(section.items)) {
      errors.push('numbered-list must have items array');
    } else {
      section.items.forEach((item, i) => {
        const itemResult = validateNumberedItem(item);
        errors.push(...itemResult.errors.map(e => `Item ${i}: ${e}`));
        warnings.push(...itemResult.warnings.map(w => `Item ${i}: ${w}`));
      });

      if (section.items.length === 0) {
        warnings.push('numbered-list has no items');
      }
    }

    return { errors, warnings };
  },

  'data-table': (section) => {
    const errors = [];
    const warnings = [];

    // New schema: headers + columns + repeatRows
    if (section.columns) {
      if (!Array.isArray(section.columns)) {
        errors.push('data-table columns must be an array');
      } else if (section.columns.length === 0) {
        warnings.push('data-table has no columns');
      }

      if (!section.repeatRows || section.repeatRows < 1) {
        warnings.push('data-table should have repeatRows >= 1');
      }

      if (!section.headers || !Array.isArray(section.headers)) {
        warnings.push('data-table should have headers array');
      }
    }
    // Legacy schema: rows with cells
    else if (section.rows) {
      if (!Array.isArray(section.rows)) {
        errors.push('data-table must have rows array');
      } else {
        section.rows.forEach((row, i) => {
          if (!row.cells || !Array.isArray(row.cells)) {
            errors.push(`data-table row ${i} must have cells array`);
          }
        });

        if (section.rows.length === 0) {
          warnings.push('data-table has no rows');
        }
      }
    } else {
      errors.push('data-table must have either columns or rows');
    }

    return { errors, warnings };
  },

  'signature-block': (section) => {
    const errors = [];
    const warnings = [];

    if (!Array.isArray(section.slots)) {
      errors.push('signature-block must have slots array');
    } else {
      section.slots.forEach((slot, i) => {
        if (!slot.role) {
          errors.push(`Slot ${i}: must have role`);
        }
        // At least one field type should be true
        const hasField = slot.hasSignature || slot.hasName || slot.hasDate || slot.hasPlace;
        if (!hasField) {
          warnings.push(`Slot ${i}: no fields enabled (signature, name, date, place)`);
        }
      });

      if (section.slots.length === 0) {
        warnings.push('signature-block has no slots');
      }
    }

    return { errors, warnings };
  },

  'key-value-stack': (section) => {
    const errors = [];
    const warnings = [];

    if (!Array.isArray(section.pairs)) {
      errors.push('key-value-stack must have pairs array');
    } else {
      section.pairs.forEach((pair, i) => {
        if (!pair.label) {
          errors.push(`Pair ${i}: must have label`);
        }
        if (!pair.fieldType) {
          errors.push(`Pair ${i}: must have fieldType`);
        } else if (!FIELD_TYPES.includes(pair.fieldType)) {
          errors.push(`Pair ${i}: unknown fieldType ${pair.fieldType}`);
        }
        if (!pair.name) {
          errors.push(`Pair ${i}: must have name`);
        }
      });
    }

    return { errors, warnings };
  },

  'instruction-paragraph': (section) => {
    const errors = [];
    const warnings = [];

    if (!section.text && section.blockIndex === undefined) {
      errors.push('instruction-paragraph must have text or blockIndex');
    }

    // Long literal text - HARD ERROR (>5 words without blockIndex)
    if (section.text && section.text.split(' ').length > 5 && section.blockIndex === undefined) {
      const preview = section.text.substring(0, 50) + (section.text.length > 50 ? '...' : '');
      errors.push(`Long paragraph without blockIndex: "${preview}" - MUST reference a block`);
    }

    return { errors, warnings };
  },

  'cover-block': (section) => {
    const errors = [];
    const warnings = [];

    if (!section.title && section.titleBlockIndex === undefined) {
      errors.push('cover-block must have title or titleBlockIndex');
    }

    return { errors, warnings };
  },

  'page-break': () => ({ errors: [], warnings: [] }),

  'separator': () => ({ errors: [], warnings: [] }),

  'checkbox-matrix': (section) => {
    const errors = [];
    const warnings = [];

    if (!Array.isArray(section.columnHeaders) || section.columnHeaders.length === 0) {
      errors.push('checkbox-matrix must have columnHeaders array');
    }

    if (!Array.isArray(section.rows)) {
      errors.push('checkbox-matrix must have rows array');
    } else {
      section.rows.forEach((row, i) => {
        if (!row.label) {
          errors.push(`Row ${i}: must have label`);
        }
        if (!row.name) {
          errors.push(`Row ${i}: must have name`);
        }
      });
    }

    return { errors, warnings };
  },

  'stamp-block': () => ({ errors: [], warnings: [] }),

  'declaration-block': (section) => {
    const errors = [];
    const warnings = [];

    if (!section.text && section.blockIndex === undefined) {
      errors.push('declaration-block must have text or blockIndex');
    }

    if (!section.responseType) {
      errors.push('declaration-block must have responseType');
    } else if (!['checkbox', 'signature', 'both'].includes(section.responseType)) {
      errors.push(`declaration-block responseType must be checkbox, signature, or both`);
    }

    // Long text - HARD ERROR (>5 words without blockIndex)
    if (section.text && section.text.split(' ').length > 5 && section.blockIndex === undefined) {
      const preview = section.text.substring(0, 50) + (section.text.length > 50 ? '...' : '');
      errors.push(`Long declaration without blockIndex: "${preview}" - MUST reference a block`);
    }

    return { errors, warnings };
  },

  'repeating-group': (section) => {
    const errors = [];
    const warnings = [];

    if (!section.groupLabel) {
      errors.push('repeating-group must have groupLabel');
    }

    if (typeof section.repeatCount !== 'number' || section.repeatCount < 1) {
      errors.push('repeating-group must have repeatCount (positive number)');
    }

    if (!Array.isArray(section.template)) {
      errors.push('repeating-group must have template array');
    } else {
      section.template.forEach((s, i) => {
        const result = validateSection(s);
        errors.push(...result.errors.map(e => `Template ${i}: ${e}`));
        warnings.push(...result.warnings.map(w => `Template ${i}: ${w}`));
      });
    }

    return { errors, warnings };
  },

  'multilingual-block': (section) => {
    const errors = [];
    const warnings = [];

    if (!Array.isArray(section.languages)) {
      errors.push('multilingual-block must have languages array');
    } else {
      section.languages.forEach((lang, i) => {
        if (!lang.language) {
          errors.push(`Language ${i}: must have language`);
        }
        if (!Array.isArray(lang.content)) {
          errors.push(`Language ${i}: must have content array`);
        }
      });
    }

    return { errors, warnings };
  },
};

// =============================================================================
// CELL VALIDATORS
// =============================================================================

function validateCell(cell) {
  const errors = [];
  const warnings = [];

  if (!cell || typeof cell !== 'object') {
    return { errors: ['Cell must be an object'], warnings };
  }

  if (!cell.type) {
    errors.push('Cell must have type');
    return { errors, warnings };
  }

  if (!['label', 'field', 'text', 'photo', 'spacer'].includes(cell.type)) {
    errors.push(`Unknown cell type: ${cell.type}`);
    return { errors, warnings };
  }

  if (cell.type === 'field') {
    if (!cell.fieldType) {
      errors.push('Field cell must have fieldType');
    } else if (!FIELD_TYPES.includes(cell.fieldType)) {
      errors.push(`Unknown fieldType: ${cell.fieldType}`);
    }
    if (!cell.name) {
      errors.push('Field cell must have name');
    }
  }

  if (cell.type === 'label' || cell.type === 'text') {
    if (!cell.text && cell.blockIndex === undefined) {
      errors.push(`${cell.type} cell must have text or blockIndex`);
    }
    // Long literal text - HARD ERROR (>5 words without blockIndex)
    if (cell.text && cell.text.split(' ').length > 5 && cell.blockIndex === undefined) {
      const preview = cell.text.substring(0, 30) + (cell.text.length > 30 ? '...' : '');
      errors.push(`Long ${cell.type} without blockIndex: "${preview}" - MUST reference a block`);
    }
  }

  return { errors, warnings };
}

function validateListItem(item) {
  const errors = [];
  const warnings = [];

  if (!item.text && item.blockIndex === undefined) {
    errors.push('List item must have text or blockIndex');
  }

  // Long literal text - HARD ERROR (>5 words without blockIndex)
  if (item.text && item.text.split(' ').length > 5 && item.blockIndex === undefined) {
    const preview = item.text.substring(0, 40) + (item.text.length > 40 ? '...' : '');
    errors.push(`Long list item without blockIndex: "${preview}" - MUST reference a block`);
  }

  return { errors, warnings };
}

function validateNumberedItem(item) {
  const errors = [];
  const warnings = [];

  if (!item.text && item.blockIndex === undefined) {
    errors.push('Numbered item must have text or blockIndex');
  }

  if (typeof item.level !== 'number') {
    errors.push('Numbered item must have level');
  }

  // Long literal text - HARD ERROR (>5 words without blockIndex)
  if (item.text && item.text.split(' ').length > 5 && item.blockIndex === undefined) {
    const preview = item.text.substring(0, 40) + (item.text.length > 40 ? '...' : '');
    errors.push(`Long numbered item without blockIndex: "${preview}" - MUST reference a block`);
  }

  // Validate children recursively
  if (item.children && Array.isArray(item.children)) {
    item.children.forEach((child, i) => {
      const result = validateNumberedItem(child);
      errors.push(...result.errors.map(e => `Child ${i}: ${e}`));
      warnings.push(...result.warnings.map(w => `Child ${i}: ${w}`));
    });
  }

  return { errors, warnings };
}

// =============================================================================
// ANTI-HALLUCINATION CHECK
// =============================================================================

/**
 * Check for potential hallucination (long text without block references)
 * @param {Object} doc - DocumentIR
 * @returns {string[]} - List of warnings
 */
export function checkHallucinationRisk(doc) {
  const warnings = [];

  function checkText(text, blockIndex, path) {
    // Skip check if blockIndex is provided (including 0)
    if (blockIndex !== undefined) return;
    if (text && text.split(' ').length > 10) {
      warnings.push(`${path}: Long text without block reference - possible hallucination`);
    }
  }

  function walkSections(sections, pathPrefix) {
    sections.forEach((section, i) => {
      const path = `${pathPrefix}[${i}]`;

      // Check based on section type
      // cover-block uses titleBlockIndex, others use blockIndex
      const titleRef = section.titleBlockIndex !== undefined ? section.titleBlockIndex : section.blockIndex;
      if (section.title) checkText(section.title, titleRef, `${path}.title`);
      if (section.text) checkText(section.text, section.blockIndex, `${path}.text`);

      // Walk nested structures
      if (section.rows) {
        section.rows.forEach((row, ri) => {
          if (Array.isArray(row)) {
            row.forEach((cell, ci) => {
              if (cell.text) checkText(cell.text, cell.blockIndex, `${path}.rows[${ri}][${ci}].text`);
            });
          }
        });
      }

      if (section.items) {
        section.items.forEach((item, ii) => {
          checkText(item.text, item.blockIndex, `${path}.items[${ii}].text`);
        });
      }

      if (section.template) {
        walkSections(section.template, `${path}.template`);
      }
    });
  }

  if (doc.pages) {
    doc.pages.forEach((page, pi) => {
      if (page.sections) {
        walkSections(page.sections, `pages[${pi}].sections`);
      }
    });
  }

  return warnings;
}
