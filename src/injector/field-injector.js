/**
 * Field Injector
 *
 * Takes detected fields with injection instructions and modifies the structure.
 * Replaces target text with fields instead of appending alongside.
 */

/**
 * Track injected fields for chaining (fieldName -> generated ID)
 */
let injectedFieldIds = new Map();

/**
 * Generate unique field ID
 */
function generateFieldId() {
  return String(Date.now() + Math.floor(Math.random() * 1000));
}

/**
 * Build a field object with generated ID
 */
function buildFieldObject(field) {
  const id = generateFieldId();

  const fieldObj = {
    type: field.fieldType,
    id,
    name: field.fieldName,
  };

  // Add options for checkbox/radio
  if (field.options && (field.fieldType === 'checkbox' || field.fieldType === 'radio')) {
    fieldObj.options = field.options;
  }

  // Track for chaining
  injectedFieldIds.set(field.fieldName, id);

  return fieldObj;
}

/**
 * Inject fields into a page structure
 *
 * @param {Object} pageStructure - The page structure to modify
 * @param {Array} fields - Array of detected fields (new format with injectionPoint)
 * @returns {Object} Updated page structure with fields injected
 */
export function injectFields(pageStructure, fields) {
  if (!fields || fields.length === 0) {
    return pageStructure;
  }

  // Reset tracking for new injection session
  injectedFieldIds = new Map();

  // Deep clone the structure to avoid mutation
  const structure = JSON.parse(JSON.stringify(pageStructure));

  // Process fields in order (important for chaining)
  for (const field of fields) {
    if (!field.injectionPoint) {
      console.warn(`[FieldInjector] Field missing injectionPoint:`, field.fieldName);
      continue;
    }

    const { injectionPoint } = field;
    const { position, method, target, targetElementId } = injectionPoint;

    if (!position || position.elementIndex === undefined) {
      console.warn(`[FieldInjector] Field missing position:`, field.fieldName);
      continue;
    }

    const elementIndex = position.elementIndex;
    const element = structure.elements[elementIndex];

    if (!element) {
      console.warn(`[FieldInjector] Element ${elementIndex} not found, skipping field: ${field.fieldName}`);
      continue;
    }

    // Build field object with generated ID
    const fieldObj = buildFieldObject(field);

    // Dispatch based on element type and method
    if (element.type === 'table') {
      injectTableField(element, field, fieldObj, method, target, position, targetElementId);
    } else if (element.type === 'paragraph') {
      injectParagraphField(element, field, fieldObj, method, target, targetElementId);
    } else {
      console.warn(`[FieldInjector] Unsupported element type: ${element.type}`);
    }
  }

  return structure;
}

/**
 * Inject a field into a table cell
 */
function injectTableField(element, field, fieldObj, method, target, position, targetElementId) {
  const { row, col } = position;

  if (row === undefined || col === undefined) {
    console.warn(`[FieldInjector] Table field missing row/col:`, field.fieldName);
    return;
  }

  if (!element.rows[row]) {
    console.warn(`[FieldInjector] Row ${row} not found in table`);
    return;
  }

  if (col >= element.rows[row].length) {
    console.warn(`[FieldInjector] Col ${col} not found in row ${row}`);
    return;
  }

  const currentCell = element.rows[row][col];

  if (currentCell === null) {
    console.warn(`[FieldInjector] Cell [${row}][${col}] is null (rowspan), skipping`);
    return;
  }

  // Get current text content
  let cellText = '';
  if (typeof currentCell === 'string') {
    cellText = currentCell;
  } else if (typeof currentCell === 'object' && currentCell !== null) {
    cellText = currentCell.text || '';
  }

  if (method === 'replace') {
    // Replace target text with empty, add field
    let newText = cellText;
    if (target && target.trim()) {
      newText = cellText.replace(target, '').trim();
    } else {
      // If target is empty/whitespace, clear the cell
      newText = '';
    }

    if (typeof currentCell === 'string') {
      element.rows[row][col] = {
        text: newText,
        field: fieldObj,
      };
    } else {
      currentCell.text = newText;
      currentCell.field = fieldObj;
    }
  } else if (method === 'insertAfter') {
    // Keep text, add field after
    // If chaining (targetElementId), this is a subsequent field in a group
    if (typeof currentCell === 'string') {
      element.rows[row][col] = {
        text: cellText,
        field: fieldObj,
      };
    } else {
      // If there's already a field, we need to handle multiple fields
      // For now, convert to content array or add to existing fields array
      if (currentCell.field) {
        // Multiple fields in same cell - convert field to fields array
        if (!currentCell.fields) {
          currentCell.fields = [currentCell.field];
          delete currentCell.field;
        }
        currentCell.fields.push(fieldObj);
      } else {
        currentCell.field = fieldObj;
      }
    }
  } else if (method === 'insertBefore') {
    // Similar to insertAfter but field comes before content
    if (typeof currentCell === 'string') {
      element.rows[row][col] = {
        text: cellText,
        field: fieldObj,
        fieldPosition: 'before',
      };
    } else {
      currentCell.field = fieldObj;
      currentCell.fieldPosition = 'before';
    }
  }
}

/**
 * Inject a field into a paragraph
 */
function injectParagraphField(element, field, fieldObj, method, target, targetElementId) {
  const text = element.text || '';

  if (method === 'replace') {
    if (target && target.trim()) {
      // Find and replace target with field
      const targetIndex = text.indexOf(target);

      if (targetIndex !== -1) {
        const before = text.substring(0, targetIndex).trim();
        const after = text.substring(targetIndex + target.length).trim();

        // Convert to content array
        element.content = [];
        if (before) {
          element.content.push(before);
        }
        element.content.push({ field: fieldObj });
        if (after) {
          element.content.push(after);
        }

        // Remove original text property
        delete element.text;
      } else {
        // Target not found, add field at end
        console.warn(`[FieldInjector] Target "${target}" not found in paragraph, adding field at end`);
        element.field = fieldObj;
      }
    } else {
      // No target, replace entire text with field
      element.content = [{ field: fieldObj }];
      delete element.text;
    }
  } else if (method === 'insertAfter') {
    const { anchorText } = field.injectionPoint;

    if (anchorText && text.includes(anchorText)) {
      // Find anchor and insert field after it
      const anchorIndex = text.indexOf(anchorText);
      const before = text.substring(0, anchorIndex + anchorText.length);
      const after = text.substring(anchorIndex + anchorText.length).trim();

      element.content = [];
      if (before) {
        element.content.push(before);
      }
      element.content.push({ field: fieldObj });
      if (after) {
        element.content.push(after);
      }

      delete element.text;
    } else if (targetElementId) {
      // Chaining - add field after previous field
      // This requires the previous field to be in the same element
      if (element.content && Array.isArray(element.content)) {
        // Find the previous field and insert after it
        const prevFieldIndex = element.content.findIndex(
          (item) => typeof item === 'object' && item.field &&
                   injectedFieldIds.get(targetElementId) === item.field.id
        );

        if (prevFieldIndex !== -1) {
          element.content.splice(prevFieldIndex + 1, 0, { field: fieldObj });
        } else {
          // Previous field not found in this element, add at end
          element.content.push({ field: fieldObj });
        }
      } else {
        // No content array yet, add field
        element.field = fieldObj;
      }
    } else {
      // No anchor text and no chaining, add field at end
      element.field = fieldObj;
    }
  } else if (method === 'insertBefore') {
    const { anchorText } = field.injectionPoint;

    if (anchorText && text.includes(anchorText)) {
      const anchorIndex = text.indexOf(anchorText);
      const before = text.substring(0, anchorIndex).trim();
      const after = text.substring(anchorIndex);

      element.content = [];
      if (before) {
        element.content.push(before);
      }
      element.content.push({ field: fieldObj });
      if (after) {
        element.content.push(after);
      }

      delete element.text;
    } else {
      // No anchor, add field at beginning
      element.content = [{ field: fieldObj }];
      if (text) {
        element.content.push(text);
      }
      delete element.text;
    }
  }
}

/**
 * Inject fields into a complete document structure (all pages)
 *
 * @param {Object} documentStructure - Full document with pages array
 * @param {number} pageNumber - Which page to inject fields into (1-based)
 * @param {Array} fields - Detected fields for that page (new format)
 * @returns {Object} Updated document structure
 */
export function injectFieldsIntoDocument(documentStructure, pageNumber, fields) {
  // Deep clone
  const structure = JSON.parse(JSON.stringify(documentStructure));

  // Find the page (pageNumber is 1-based, array is 0-based)
  const pageIndex = structure.pages.findIndex((p) => p.pageNumber === pageNumber);

  if (pageIndex === -1) {
    console.warn(`[FieldInjector] Page ${pageNumber} not found in document`);
    return structure;
  }

  // Inject fields into the page
  structure.pages[pageIndex] = injectFields(structure.pages[pageIndex], fields);

  return structure;
}
