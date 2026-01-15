/**
 * Semantic Intermediate Representation (IR) Schema
 *
 * The LLM outputs this structure. The renderer consumes it.
 * LLM classifies and structures. Code renders deterministically.
 */

// =============================================================================
// FIELD TYPES (used within sections)
// =============================================================================

/**
 * @typedef {'text' | 'date' | 'number' | 'email' | 'phone' | 'textarea' | 'checkbox' | 'radio' | 'dropdown' | 'signature' | 'photo' | 'file'} FieldType
 */

/**
 * @typedef {Object} Field
 * @property {FieldType} fieldType - Type of input field
 * @property {string} name - Field identifier/label for form submission
 * @property {string} [placeholder] - Placeholder text
 * @property {boolean} [required] - Whether field is required
 * @property {string[]} [options] - Options for dropdown/radio fields
 * @property {number} [width] - Relative width (1-12 grid units)
 */

/**
 * @typedef {Object} Label
 * @property {'label'} type
 * @property {string} text - Label text (literal or block_hint for lookup)
 * @property {number} [blockIndex] - Reference to extracted text block
 * @property {boolean} [bold] - Whether label is bold
 */

/**
 * @typedef {Object} FieldCell
 * @property {'field'} type
 * @property {FieldType} fieldType
 * @property {string} name
 * @property {string} [placeholder]
 * @property {string[]} [options]
 */

/**
 * @typedef {Object} TextCell
 * @property {'text'} type
 * @property {string} text - Literal text or block_hint
 * @property {number} [blockIndex] - Reference to extracted text block
 * @property {boolean} [bold]
 * @property {boolean} [italic]
 */

/**
 * @typedef {Label | FieldCell | TextCell} Cell
 */

// =============================================================================
// SECTION TYPES (17 defined patterns)
// =============================================================================

/**
 * 1. Section Header
 * Full-width shaded header row, optionally with notes
 *
 * @typedef {Object} SectionHeader
 * @property {'section-header'} type
 * @property {string} title - Header text (block_hint or literal)
 * @property {number} [blockIndex] - Reference to text block
 * @property {string} [note] - Parenthetical note
 * @property {'light' | 'medium' | 'dark'} [shade] - Background shade level
 */

/**
 * 2. Input Grid
 * Label + field pairs in rows, variable column counts
 *
 * @typedef {Object} InputGrid
 * @property {'input-grid'} type
 * @property {number} columns - Total columns (typically 2, 4, or 6)
 * @property {Cell[][]} rows - Each row is array of cells
 */

/**
 * 3. Photo Grid
 * Fixed-size boxes for photos, signatures, stamps
 *
 * @typedef {Object} PhotoGrid
 * @property {'photo-grid'} type
 * @property {number} columns - Number of photo boxes per row
 * @property {PhotoBox[][]} rows - Grid of photo boxes
 */

/**
 * @typedef {Object} PhotoBox
 * @property {string} label - Label below/above box (e.g., "Applicant Photo")
 * @property {number} [blockIndex]
 * @property {'photo' | 'signature' | 'stamp' | 'seal'} boxType
 * @property {string} [width] - CSS width (e.g., "150px")
 * @property {string} [height] - CSS height (e.g., "180px")
 */

/**
 * 4. Bullet List
 * Instructions or terms rendered as bullet rows
 *
 * @typedef {Object} BulletList
 * @property {'bullet-list'} type
 * @property {'disc' | 'circle' | 'square' | 'dash'} [marker]
 * @property {ListItem[]} items
 */

/**
 * @typedef {Object} ListItem
 * @property {string} text - Item text (block_hint or literal)
 * @property {number} [blockIndex]
 * @property {number} [level] - Nesting level (0 = top level)
 */

/**
 * 5. Numbered List
 * Nested 1/A/i style lists rendered as multi-column tables
 *
 * @typedef {Object} NumberedList
 * @property {'numbered-list'} type
 * @property {'1' | 'A' | 'a' | 'I' | 'i'} [startStyle] - Numbering style for level 0
 * @property {NumberedItem[]} items
 */

/**
 * @typedef {Object} NumberedItem
 * @property {string} text - Item text (block_hint or literal)
 * @property {number} [blockIndex]
 * @property {number} level - Nesting level (0, 1, 2)
 * @property {NumberedItem[]} [children] - Nested items
 */

/**
 * 6. Data Table
 * Pre-filled or partially editable information table
 *
 * @typedef {Object} DataTable
 * @property {'data-table'} type
 * @property {string[]} [headers] - Column headers (optional)
 * @property {DataRow[]} rows
 * @property {boolean} [hasHeaderRow] - First row is header
 */

/**
 * @typedef {Object} DataRow
 * @property {DataCell[]} cells
 */

/**
 * @typedef {Object} DataCell
 * @property {string} [text] - Static text content
 * @property {number} [blockIndex]
 * @property {boolean} [editable] - Whether cell is editable (becomes input)
 * @property {FieldType} [fieldType] - If editable, what type
 * @property {number} [colspan] - Column span
 * @property {number} [rowspan] - Row span
 */

/**
 * 7. Signature Block
 * Signature, name, date, witness areas
 *
 * @typedef {Object} SignatureBlock
 * @property {'signature-block'} type
 * @property {SignatureSlot[]} slots - Array of signature slots (e.g., applicant, witness)
 */

/**
 * @typedef {Object} SignatureSlot
 * @property {string} role - Role label (e.g., "Applicant", "Witness", "Authorized Signatory")
 * @property {number} [blockIndex]
 * @property {boolean} [hasSignature] - Include signature field
 * @property {boolean} [hasName] - Include name field
 * @property {boolean} [hasDate] - Include date field
 * @property {boolean} [hasPlace] - Include place field
 * @property {boolean} [hasDesignation] - Include designation field
 */

/**
 * 8. Key-Value Stack
 * Vertical label + field pairs (not horizontal grid)
 *
 * @typedef {Object} KeyValueStack
 * @property {'key-value-stack'} type
 * @property {KeyValuePair[]} pairs
 */

/**
 * @typedef {Object} KeyValuePair
 * @property {string} label - Label text
 * @property {number} [blockIndex]
 * @property {FieldType} fieldType - Type of input
 * @property {string} name - Field name
 * @property {string[]} [options] - For dropdown/radio
 */

/**
 * 9. Instruction Paragraph
 * Full-width text block (not a list, not inputs)
 *
 * @typedef {Object} InstructionParagraph
 * @property {'instruction-paragraph'} type
 * @property {string} text - Paragraph text (block_hint or literal)
 * @property {number} [blockIndex]
 * @property {boolean} [bold]
 * @property {boolean} [italic]
 * @property {'left' | 'center' | 'right' | 'justify'} [align]
 */

/**
 * 10. Cover/Title Block
 * Centered title page with logos, version info
 *
 * @typedef {Object} CoverBlock
 * @property {'cover-block'} type
 * @property {string} [logo] - Logo identifier or URL
 * @property {string} title - Main title
 * @property {number} [titleBlockIndex]
 * @property {string} [subtitle] - Subtitle text
 * @property {number} [subtitleBlockIndex]
 * @property {string} [version] - Version/date info
 * @property {string} [organization] - Organization name
 */

/**
 * 11. Page Break
 * Logical new page marker
 *
 * @typedef {Object} PageBreak
 * @property {'page-break'} type
 */

/**
 * 12. Separator
 * Visual divider / spacing block
 *
 * @typedef {Object} Separator
 * @property {'separator'} type
 * @property {'line' | 'space' | 'dots'} [style]
 * @property {'small' | 'medium' | 'large'} [size]
 */

/**
 * 13. Checkbox Matrix
 * Grid where rows are items and columns are options
 *
 * @typedef {Object} CheckboxMatrix
 * @property {'checkbox-matrix'} type
 * @property {string[]} columnHeaders - Option headers (e.g., ["Yes", "No", "N/A"])
 * @property {MatrixRow[]} rows
 */

/**
 * @typedef {Object} MatrixRow
 * @property {string} label - Row label
 * @property {number} [blockIndex]
 * @property {string} name - Field name prefix for this row
 */

/**
 * 14. Stamp Block
 * Reserved area for physical/digital stamping
 *
 * @typedef {Object} StampBlock
 * @property {'stamp-block'} type
 * @property {string} [label] - Label for stamp area (e.g., "Official Seal")
 * @property {string} [width]
 * @property {string} [height]
 */

/**
 * 15. Declaration Block
 * Paragraph followed by Yes/No or signature
 * Compositional: instruction-paragraph + (checkbox | signature)
 *
 * @typedef {Object} DeclarationBlock
 * @property {'declaration-block'} type
 * @property {string} text - Declaration text
 * @property {number} [blockIndex]
 * @property {'checkbox' | 'signature' | 'both'} responseType
 * @property {string} [checkboxLabel] - Label for checkbox (e.g., "I agree")
 */

/**
 * 16. Repeating Group
 * Set of sections that repeat N times (Nominees, Co-borrowers)
 *
 * @typedef {Object} RepeatingGroup
 * @property {'repeating-group'} type
 * @property {string} groupLabel - Label for the group (e.g., "Nominee Details")
 * @property {number} [blockIndex]
 * @property {number} repeatCount - How many times to repeat (or min count)
 * @property {Section[]} template - Sections to repeat
 */

/**
 * 17. Multilingual Block
 * Same content repeated in another language
 *
 * @typedef {Object} MultilingualBlock
 * @property {'multilingual-block'} type
 * @property {LanguageSection[]} languages
 */

/**
 * @typedef {Object} LanguageSection
 * @property {string} language - Language code or name (e.g., "en", "hi", "English")
 * @property {Section[]} content - Sections in this language
 */

// =============================================================================
// COMPOSITE TYPES
// =============================================================================

/**
 * @typedef {SectionHeader | InputGrid | PhotoGrid | BulletList | NumberedList | DataTable | SignatureBlock | KeyValueStack | InstructionParagraph | CoverBlock | PageBreak | Separator | CheckboxMatrix | StampBlock | DeclarationBlock | RepeatingGroup | MultilingualBlock} Section
 */

/**
 * Page IR - represents one page of the document
 *
 * @typedef {Object} PageIR
 * @property {number} pageNumber - 1-indexed page number
 * @property {Section[]} sections - Ordered list of sections on this page
 * @property {Object} [metadata]
 * @property {string} [metadata.pageType] - e.g., "cover", "form", "terms"
 */

/**
 * Document IR - represents the entire document
 *
 * @typedef {Object} DocumentIR
 * @property {string} [title] - Document title
 * @property {PageIR[]} pages - All pages
 * @property {Object} [metadata]
 * @property {string} [metadata.documentType] - e.g., "loan-application", "kyc-form"
 * @property {string} [metadata.version]
 */

// =============================================================================
// SECTION TYPE ENUM (for validation)
// =============================================================================

export const SECTION_TYPES = [
  'section-header',
  'input-grid',
  'photo-grid',
  'bullet-list',
  'numbered-list',
  'data-table',
  'signature-block',
  'key-value-stack',
  'instruction-paragraph',
  'cover-block',
  'page-break',
  'separator',
  'checkbox-matrix',
  'stamp-block',
  'declaration-block',
  'repeating-group',
  'multilingual-block',
];

export const FIELD_TYPES = [
  'text',
  'date',
  'number',
  'email',
  'phone',
  'textarea',
  'checkbox',
  'radio',
  'dropdown',
  'signature',
  'photo',
  'file',
];

// =============================================================================
// FACTORY FUNCTIONS (for creating IR nodes)
// =============================================================================

export function createSectionHeader(title, options = {}) {
  return {
    type: 'section-header',
    title,
    ...options,
  };
}

export function createInputGrid(columns, rows) {
  return {
    type: 'input-grid',
    columns,
    rows,
  };
}

export function createLabel(text, options = {}) {
  return {
    type: 'label',
    text,
    ...options,
  };
}

export function createField(fieldType, name, options = {}) {
  return {
    type: 'field',
    fieldType,
    name,
    ...options,
  };
}

export function createText(text, options = {}) {
  return {
    type: 'text',
    text,
    ...options,
  };
}

export function createBulletList(items, marker = 'disc') {
  return {
    type: 'bullet-list',
    marker,
    items,
  };
}

export function createNumberedList(items, startStyle = '1') {
  return {
    type: 'numbered-list',
    startStyle,
    items,
  };
}

export function createSignatureBlock(slots) {
  return {
    type: 'signature-block',
    slots,
  };
}

export function createPageBreak() {
  return { type: 'page-break' };
}

export function createSeparator(style = 'line', size = 'medium') {
  return {
    type: 'separator',
    style,
    size,
  };
}

export function createDeclarationBlock(text, responseType, options = {}) {
  return {
    type: 'declaration-block',
    text,
    responseType,
    ...options,
  };
}

export function createPageIR(pageNumber, sections = [], metadata = {}) {
  return {
    pageNumber,
    sections,
    metadata,
  };
}

export function createDocumentIR(pages = [], metadata = {}) {
  return {
    pages,
    metadata,
  };
}
