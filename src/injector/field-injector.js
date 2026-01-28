/**
 * Field Injector
 *
 * Takes detected fields and injects them into the structure.
 * Modifies table cells and paragraphs to include field objects.
 */

/**
 * Inject fields into a page structure
 *
 * @param {Object} pageStructure - The page structure to modify
 * @param {Array} fields - Array of detected fields
 * @returns {Object} Updated page structure with fields injected
 */
export function injectFields(pageStructure, fields) {
  if (!fields || fields.length === 0) {
    return pageStructure;
  }

  // Deep clone the structure to avoid mutation
  const structure = JSON.parse(JSON.stringify(pageStructure));

  // Group fields by elementIndex for efficient processing
  const fieldsByElement = {};
  for (const field of fields) {
    if (!fieldsByElement[field.elementIndex]) {
      fieldsByElement[field.elementIndex] = [];
    }
    fieldsByElement[field.elementIndex].push(field);
  }

  // Process each element that has fields
  for (const elementIndex of Object.keys(fieldsByElement)) {
    const idx = parseInt(elementIndex, 10);
    const element = structure.elements[idx];
    const elementFields = fieldsByElement[idx];

    if (!element) {
      console.warn(`[FieldInjector] Element ${idx} not found, skipping fields`);
      continue;
    }

    if (element.type === 'table') {
      injectTableFields(element, elementFields);
    } else if (element.type === 'paragraph') {
      injectParagraphFields(structure.elements, idx, elementFields);
    }
  }

  return structure;
}

/**
 * Inject fields into a table element
 */
function injectTableFields(element, fields) {
  for (const field of fields) {
    if (!field.location) {
      console.warn(`[FieldInjector] Table field missing location:`, field);
      continue;
    }

    const { row, col } = field.location;

    if (!element.rows[row]) {
      console.warn(`[FieldInjector] Row ${row} not found in table`);
      continue;
    }

    if (col >= element.rows[row].length) {
      console.warn(`[FieldInjector] Col ${col} not found in row ${row}`);
      continue;
    }

    // Get current cell value
    const currentCell = element.rows[row][col];

    // Build field object
    const fieldObj = buildFieldObject(field);

    // Replace cell with field object or merge with existing cell object
    if (currentCell === null) {
      // Cell covered by rowspan, skip
      console.warn(`[FieldInjector] Cell [${row}][${col}] is null (rowspan), skipping`);
      continue;
    }

    if (typeof currentCell === 'string') {
      // String cell - replace with object containing field
      element.rows[row][col] = {
        text: currentCell,
        field: fieldObj,
      };
    } else if (typeof currentCell === 'object' && currentCell !== null) {
      // Object cell - add field property
      currentCell.field = fieldObj;
    }
  }
}

/**
 * Inject fields into a paragraph element
 * For inline fields, split paragraph into content array
 */
function injectParagraphFields(elements, elementIndex, fields) {
  const element = elements[elementIndex];

  // For now, only handle the first inline field in a paragraph
  // Multiple inline fields would require more complex splitting
  const inlineField = fields.find((f) => f.splitParagraph);

  if (!inlineField) {
    // No inline fields, just add field to paragraph
    const fieldObj = buildFieldObject(fields[0]);
    element.field = fieldObj;
    return;
  }

  // Split paragraph into content array
  const { before, after } = inlineField.splitParagraph;
  const fieldObj = buildFieldObject(inlineField);

  // Transform paragraph from text to content array
  element.content = [];

  if (before && before.trim()) {
    element.content.push(before);
  }

  element.content.push({ field: fieldObj });

  if (after && after.trim()) {
    element.content.push(after);
  }

  // Remove text property since we now use content
  delete element.text;
  delete element.blockIndex;
}

/**
 * Build a field object with ID
 */
function buildFieldObject(field) {
  const fieldObj = {
    type: field.type,
    id: String(Date.now() + Math.floor(Math.random() * 1000)), // Unique ID
    name: field.name,
  };

  // Add options for checkbox/radio
  if (field.options && (field.type === 'checkbox' || field.type === 'radio')) {
    fieldObj.options = field.options;
  }

  return fieldObj;
}

/**
 * Inject fields into a complete document structure (all pages)
 *
 * @param {Object} documentStructure - Full document with pages array
 * @param {number} pageNumber - Which page to inject fields into (1-based)
 * @param {Array} fields - Detected fields for that page
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
