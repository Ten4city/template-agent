/**
 * Vision HTML Agent v2 - Tool Definitions
 *
 * Based on CKEditor 4.11.1 capabilities from Leegality's dashboard-frontend.
 *
 * Design principles:
 * 1. Granular tools mirror CKEditor - what a human can do
 * 2. Content by index - LLM references block indices, code fetches text
 * 3. Iterative - create, modify, fix incrementally
 * 4. Tables first-class - most complex, most important
 */

export const toolDefinitions = [
  // ===========================================
  // 1. TEXT RETRIEVAL TOOLS (Anti-Hallucination)
  // ===========================================
  {
    name: "search_block",
    description: "Search for a text block matching a hint. Returns block index to use with other tools. ALWAYS use this to find content - never write document text directly.",
    input_schema: {
      type: "object",
      properties: {
        hint: {
          type: "string",
          description: "Partial text to match (e.g., 'We thank you for choosing')"
        },
        search_type: {
          type: "string",
          enum: ["prefix", "contains", "fuzzy"],
          description: "Match type. Default: fuzzy"
        }
      },
      required: ["hint"]
    }
  },
  {
    name: "get_block",
    description: "Get full content of a text block by index. Use to verify content before placing.",
    input_schema: {
      type: "object",
      properties: {
        index: {
          type: "number",
          description: "Block index"
        },
        format: {
          type: "string",
          enum: ["text", "html"],
          description: "Return format. html preserves <strong>, <em>, <u> etc. Default: text"
        }
      },
      required: ["index"]
    }
  },
  {
    name: "list_blocks",
    description: "List available text blocks with previews. Use to understand document content.",
    input_schema: {
      type: "object",
      properties: {
        from_index: {
          type: "number",
          description: "Start from this index. Default: 0"
        },
        count: {
          type: "number",
          description: "Number of blocks to return. Default: 20"
        }
      },
      required: []
    }
  },

  // ===========================================
  // 2. TABLE TOOLS
  // ===========================================
  {
    name: "create_table",
    description: "Create a new table. Returns table_id for subsequent operations.",
    input_schema: {
      type: "object",
      properties: {
        rows: {
          type: "number",
          description: "Number of rows"
        },
        cols: {
          type: "number",
          description: "Number of columns"
        },
        width: {
          type: "string",
          description: "Table width (px or %). Default: '100%'"
        },
        height: {
          type: "string",
          description: "Table height (px). Optional"
        },
        cellPadding: {
          type: "number",
          description: "Cell padding in px. Default: 1"
        },
        cellSpacing: {
          type: "number",
          description: "Cell spacing in px. Default: 0"
        },
        border: {
          type: "number",
          description: "Border width in px. 0 for borderless. Default: 0"
        },
        align: {
          type: "string",
          enum: ["left", "center", "right"],
          description: "Table alignment"
        }
      },
      required: ["rows", "cols"]
    }
  },
  {
    name: "set_table_properties",
    description: "Modify existing table properties.",
    input_schema: {
      type: "object",
      properties: {
        table_id: {
          type: "string",
          description: "The table to modify"
        },
        width: { type: "string" },
        height: { type: "string" },
        border: { type: "number" },
        cellPadding: { type: "number" },
        cellSpacing: { type: "number" },
        align: {
          type: "string",
          enum: ["left", "center", "right"]
        }
      },
      required: ["table_id"]
    }
  },
  {
    name: "insert_row",
    description: "Insert a row into a table.",
    input_schema: {
      type: "object",
      properties: {
        table_id: {
          type: "string",
          description: "The table to modify"
        },
        position: {
          type: "string",
          enum: ["before", "after"],
          description: "Insert before or after reference_row"
        },
        reference_row: {
          type: "number",
          description: "Row index to insert relative to"
        },
        count: {
          type: "number",
          description: "Number of rows to insert. Default: 1"
        }
      },
      required: ["table_id", "position", "reference_row"]
    }
  },
  {
    name: "insert_column",
    description: "Insert a column into a table.",
    input_schema: {
      type: "object",
      properties: {
        table_id: {
          type: "string",
          description: "The table to modify"
        },
        position: {
          type: "string",
          enum: ["before", "after"],
          description: "Insert before or after reference_col"
        },
        reference_col: {
          type: "number",
          description: "Column index to insert relative to"
        },
        count: {
          type: "number",
          description: "Number of columns to insert. Default: 1"
        }
      },
      required: ["table_id", "position", "reference_col"]
    }
  },
  {
    name: "delete_row",
    description: "Delete rows from a table.",
    input_schema: {
      type: "object",
      properties: {
        table_id: {
          type: "string",
          description: "The table to modify"
        },
        row_indices: {
          type: "array",
          items: { type: "number" },
          description: "Row indices to delete"
        }
      },
      required: ["table_id", "row_indices"]
    }
  },
  {
    name: "delete_column",
    description: "Delete columns from a table.",
    input_schema: {
      type: "object",
      properties: {
        table_id: {
          type: "string",
          description: "The table to modify"
        },
        col_indices: {
          type: "array",
          items: { type: "number" },
          description: "Column indices to delete"
        }
      },
      required: ["table_id", "col_indices"]
    }
  },
  {
    name: "merge_cells",
    description: "Merge a rectangular range of cells into one.",
    input_schema: {
      type: "object",
      properties: {
        table_id: {
          type: "string",
          description: "The table containing the cells"
        },
        start_row: {
          type: "number",
          description: "Starting row index"
        },
        start_col: {
          type: "number",
          description: "Starting column index"
        },
        end_row: {
          type: "number",
          description: "Ending row index (inclusive)"
        },
        end_col: {
          type: "number",
          description: "Ending column index (inclusive)"
        }
      },
      required: ["table_id", "start_row", "start_col", "end_row", "end_col"]
    }
  },
  {
    name: "split_cell",
    description: "Split a merged cell back into multiple cells.",
    input_schema: {
      type: "object",
      properties: {
        table_id: {
          type: "string",
          description: "The table containing the cell"
        },
        row: {
          type: "number",
          description: "Row index of cell to split"
        },
        col: {
          type: "number",
          description: "Column index of cell to split"
        },
        direction: {
          type: "string",
          enum: ["horizontal", "vertical"],
          description: "Split direction"
        },
        count: {
          type: "number",
          description: "Number of parts to split into"
        }
      },
      required: ["table_id", "row", "col", "direction", "count"]
    }
  },

  // ===========================================
  // 3. CELL TOOLS
  // ===========================================
  {
    name: "set_rowspan",
    description: "Make a cell span multiple rows vertically. The cell expands downward.",
    input_schema: {
      type: "object",
      properties: {
        table_id: {
          type: "string",
          description: "The table containing the cell"
        },
        row: {
          type: "number",
          description: "Row index of the cell to expand"
        },
        col: {
          type: "number",
          description: "Column index of the cell to expand"
        },
        span: {
          type: "number",
          description: "Number of rows to span (e.g., 7 means this cell covers 7 rows)"
        }
      },
      required: ["table_id", "row", "col", "span"]
    }
  },
  {
    name: "set_colspan",
    description: "Make a cell span multiple columns horizontally. The cell expands rightward.",
    input_schema: {
      type: "object",
      properties: {
        table_id: {
          type: "string",
          description: "The table containing the cell"
        },
        row: {
          type: "number",
          description: "Row index of the cell to expand"
        },
        col: {
          type: "number",
          description: "Column index of the cell to expand"
        },
        span: {
          type: "number",
          description: "Number of columns to span (e.g., 2 means this cell covers 2 columns)"
        }
      },
      required: ["table_id", "row", "col", "span"]
    }
  },
  {
    name: "set_cell_background",
    description: "Set background color of a cell. Shortcut for common operation.",
    input_schema: {
      type: "object",
      properties: {
        table_id: {
          type: "string",
          description: "The table containing the cell"
        },
        row: {
          type: "number",
          description: "Row index"
        },
        col: {
          type: "number",
          description: "Column index"
        },
        color: {
          type: "string",
          description: "Background color (e.g., '#3366ff', 'rgb(51,102,255)')"
        }
      },
      required: ["table_id", "row", "col", "color"]
    }
  },
  {
    name: "set_cell_borders",
    description: "Set individual borders of a cell. Leegality supports per-side border control.",
    input_schema: {
      type: "object",
      properties: {
        table_id: {
          type: "string",
          description: "The table containing the cell"
        },
        row: {
          type: "number",
          description: "Row index"
        },
        col: {
          type: "number",
          description: "Column index"
        },
        top: {
          type: "boolean",
          description: "Show top border"
        },
        bottom: {
          type: "boolean",
          description: "Show bottom border"
        },
        left: {
          type: "boolean",
          description: "Show left border"
        },
        right: {
          type: "boolean",
          description: "Show right border"
        },
        color: {
          type: "string",
          description: "Border color (optional)"
        }
      },
      required: ["table_id", "row", "col"]
    }
  },
  {
    name: "set_cell_width",
    description: "Set width of a cell/column. Shortcut for common operation.",
    input_schema: {
      type: "object",
      properties: {
        table_id: {
          type: "string",
          description: "The table containing the cell"
        },
        row: {
          type: "number",
          description: "Row index"
        },
        col: {
          type: "number",
          description: "Column index"
        },
        width: {
          type: "string",
          description: "Width (e.g., '30%', '150px')"
        }
      },
      required: ["table_id", "row", "col", "width"]
    }
  },
  {
    name: "set_cell_properties",
    description: "Set multiple visual/structural properties for one or more cells at once.",
    input_schema: {
      type: "object",
      properties: {
        table_id: {
          type: "string",
          description: "The table containing the cells"
        },
        cells: {
          type: "array",
          items: {
            type: "object",
            properties: {
              row: { type: "number" },
              col: { type: "number" }
            },
            required: ["row", "col"]
          },
          description: "Array of cells to modify"
        },
        width: {
          type: "string",
          description: "Cell width (px or %)"
        },
        height: {
          type: "number",
          description: "Cell height in px"
        },
        cellType: {
          type: "string",
          enum: ["td", "th"],
          description: "Data or header cell"
        },
        rowSpan: {
          type: "number",
          description: "Number of rows to span"
        },
        colSpan: {
          type: "number",
          description: "Number of columns to span"
        },
        wordWrap: {
          type: "boolean",
          description: "Enable word wrap. false = nowrap"
        },
        hAlign: {
          type: "string",
          enum: ["left", "center", "right", "justify"],
          description: "Horizontal alignment"
        },
        vAlign: {
          type: "string",
          enum: ["top", "middle", "bottom", "baseline"],
          description: "Vertical alignment"
        },
        bgColor: {
          type: "string",
          description: "Background color (e.g., '#e6e6e6')"
        },
        borderColor: {
          type: "string",
          description: "Border color"
        },
        borders: {
          type: "object",
          properties: {
            top: { type: "boolean" },
            bottom: { type: "boolean" },
            left: { type: "boolean" },
            right: { type: "boolean" }
          },
          description: "Individual border control (Leegality custom)"
        }
      },
      required: ["table_id", "cells"]
    }
  },
  {
    name: "set_cell_content",
    description: "Set content of a cell. Use block_index for document text (preferred), text for labels, html for complex content, or field for form inputs.",
    input_schema: {
      type: "object",
      properties: {
        table_id: {
          type: "string",
          description: "The table containing the cell"
        },
        row: {
          type: "number",
          description: "Row index"
        },
        col: {
          type: "number",
          description: "Column index"
        },
        block_index: {
          type: "number",
          description: "Index of text block to use. PREFERRED for document content."
        },
        text: {
          type: "string",
          description: "Direct text. Use ONLY for labels like 'Name:', 'Date:', etc."
        },
        html: {
          type: "string",
          description: "Direct HTML. Use for styled content or form fields."
        },
        field: {
          type: "object",
          description: "Form field to insert. See Form Field tools for structure."
        },
        append: {
          type: "boolean",
          description: "Append to existing content instead of replacing. Default: false"
        }
      },
      required: ["table_id", "row", "col"]
    }
  },

  // ===========================================
  // 4. FORM FIELD TOOLS
  // ===========================================
  {
    name: "insert_textfield",
    description: "Insert a text input field. Returns HTML to use with set_cell_content.",
    input_schema: {
      type: "object",
      properties: {
        name: {
          type: "string",
          description: "Field name (required, unique)"
        },
        groupSelect: {
          type: "string",
          description: "Group for linked fields"
        },
        placeholder: {
          type: "string",
          description: "Hint text inside field"
        },
        maxLength: {
          type: "number",
          description: "Maximum character length"
        },
        type: {
          type: "string",
          enum: ["text", "number"],
          description: "Input type. Default: text"
        },
        required: {
          type: "boolean",
          description: "Is field mandatory"
        },
        boxed: {
          type: "boolean",
          description: "Use boxed style (leegality-field='boxed')"
        }
      },
      required: ["name"]
    }
  },
  {
    name: "insert_textarea",
    description: "Insert a large text input field.",
    input_schema: {
      type: "object",
      properties: {
        name: {
          type: "string",
          description: "Field name (required)"
        },
        groupSelect: {
          type: "string",
          description: "Group for linked fields"
        },
        placeholder: {
          type: "string",
          description: "Hint text"
        },
        cols: {
          type: "number",
          description: "Width in columns. Default: 40"
        },
        rows: {
          type: "number",
          description: "Height in rows. Default: 5"
        },
        required: {
          type: "boolean",
          description: "Is field mandatory"
        }
      },
      required: ["name"]
    }
  },
  {
    name: "insert_dropdown",
    description: "Insert a select/dropdown field.",
    input_schema: {
      type: "object",
      properties: {
        name: {
          type: "string",
          description: "Field name (required)"
        },
        options: {
          type: "array",
          items: {
            type: "object",
            properties: {
              text: { type: "string" },
              value: { type: "string" }
            },
            required: ["text", "value"]
          },
          description: "Dropdown options"
        },
        selectedValue: {
          type: "string",
          description: "Default selected value"
        },
        multiple: {
          type: "boolean",
          description: "Allow multiple selections"
        },
        required: {
          type: "boolean",
          description: "Is field mandatory"
        }
      },
      required: ["name", "options"]
    }
  },
  {
    name: "insert_checkbox",
    description: "Insert a checkbox field.",
    input_schema: {
      type: "object",
      properties: {
        name: {
          type: "string",
          description: "Checkbox group name (required)"
        },
        value: {
          type: "string",
          description: "Checkbox value (required)"
        },
        checked: {
          type: "boolean",
          description: "Default checked state"
        },
        required: {
          type: "boolean",
          description: "Is field mandatory"
        }
      },
      required: ["name", "value"]
    }
  },
  {
    name: "insert_radio",
    description: "Insert a radio button field.",
    input_schema: {
      type: "object",
      properties: {
        name: {
          type: "string",
          description: "Radio group name (required)"
        },
        value: {
          type: "string",
          description: "Radio value (required)"
        },
        checked: {
          type: "boolean",
          description: "Default checked state"
        },
        required: {
          type: "boolean",
          description: "Is field mandatory"
        }
      },
      required: ["name", "value"]
    }
  },
  {
    name: "insert_image_upload",
    description: "Insert an image upload button (Leegality custom).",
    input_schema: {
      type: "object",
      properties: {
        name: {
          type: "string",
          description: "Field name (required, unique)"
        },
        width: {
          type: "number",
          description: "Display width in px (required)"
        },
        height: {
          type: "string",
          description: "Display height (px or 'auto')"
        },
        alignment: {
          type: "string",
          enum: ["none", "left", "right", "centre"],
          description: "Image alignment"
        },
        maxFileSize: {
          type: "number",
          description: "Max file size in KB. Max 3072. Default: 512"
        },
        minWidth: {
          type: "number",
          description: "Minimum upload width in px"
        },
        maxWidth: {
          type: "number",
          description: "Maximum upload width in px"
        },
        required: {
          type: "boolean",
          description: "Is field mandatory"
        }
      },
      required: ["name", "width"]
    }
  },

  // ===========================================
  // 5. PARAGRAPH TOOLS
  // ===========================================
  {
    name: "insert_paragraph",
    description: "Insert a paragraph element.",
    input_schema: {
      type: "object",
      properties: {
        block_index: {
          type: "number",
          description: "Index of text block to use. PREFERRED."
        },
        text: {
          type: "string",
          description: "Direct text. Use only for static content."
        },
        html: {
          type: "string",
          description: "Direct HTML for complex content."
        },
        align: {
          type: "string",
          enum: ["left", "center", "right", "justify"],
          description: "Text alignment. Default: justify"
        },
        isHeader: {
          type: "boolean",
          description: "Wrap in <strong>"
        },
        isUnderlined: {
          type: "boolean",
          description: "Wrap in <u>"
        }
      },
      required: []
    }
  },
  {
    name: "insert_heading",
    description: "Insert a heading element (h1-h6).",
    input_schema: {
      type: "object",
      properties: {
        block_index: {
          type: "number",
          description: "Index of text block to use"
        },
        text: {
          type: "string",
          description: "Direct text"
        },
        level: {
          type: "string",
          enum: ["1", "2", "3", "4", "5", "6"],
          description: "Heading level (h1-h6)"
        },
        align: {
          type: "string",
          enum: ["left", "center", "right"],
          description: "Text alignment"
        }
      },
      required: ["level"]
    }
  },

  // ===========================================
  // 6. LIST TOOLS
  // ===========================================
  {
    name: "insert_list",
    description: "Insert a complete list (rendered as atomic tables per Leegality pattern).",
    input_schema: {
      type: "object",
      properties: {
        type: {
          type: "string",
          enum: ["bullet", "number"],
          description: "List type"
        },
        items: {
          type: "array",
          items: {
            type: "object",
            properties: {
              block_index: { type: "number" },
              text: { type: "string" },
              indent: { type: "number" }
            }
          },
          description: "List items with content and indent level"
        },
        startNumber: {
          type: "number",
          description: "Starting number for numbered lists. Default: 1"
        },
        markers: {
          type: "object",
          description: "Custom markers by indent level. e.g., {0: 'number', 1: 'alpha', 2: '-'}"
        }
      },
      required: ["type", "items"]
    }
  },
  {
    name: "insert_list_item",
    description: "Insert a single list item (atomic table).",
    input_schema: {
      type: "object",
      properties: {
        block_index: {
          type: "number",
          description: "Index of text block for content"
        },
        text: {
          type: "string",
          description: "Direct text content"
        },
        marker: {
          type: "string",
          description: "List marker (e.g., '1.', 'a)', 'i.', '*', '-', 'o')"
        },
        customMarker: {
          type: "string",
          description: "Custom marker text if marker is 'custom'"
        },
        indent: {
          type: "string",
          enum: ["0", "1", "2"],
          description: "Indentation level"
        },
        markerWidth: {
          type: "string",
          description: "Width of marker column. Default: '5%'"
        },
        spacerWidth: {
          type: "string",
          description: "Width of indent spacer per level. Default: '3%'"
        }
      },
      required: ["marker"]
    }
  },

  // ===========================================
  // 7. FORMATTING TOOLS
  // ===========================================
  {
    name: "insert_horizontal_line",
    description: "Insert a horizontal rule.",
    input_schema: {
      type: "object",
      properties: {
        width: {
          type: "string",
          description: "Line width. Default: '100%'"
        },
        height: {
          type: "number",
          description: "Line height in px. Default: 1"
        },
        color: {
          type: "string",
          description: "Line color. Default: '#000000'"
        }
      },
      required: []
    }
  },
  {
    name: "insert_spacing",
    description: "Insert vertical spacing (blank lines).",
    input_schema: {
      type: "object",
      properties: {
        lines: {
          type: "number",
          description: "Number of blank lines. Default: 1"
        }
      },
      required: []
    }
  },
  {
    name: "insert_special_char",
    description: "Insert a special character.",
    input_schema: {
      type: "object",
      properties: {
        char: {
          type: "string",
          enum: ["nbsp", "copy", "reg", "trade", "rupee", "custom"],
          description: "Character type"
        },
        custom: {
          type: "string",
          description: "Custom character if char is 'custom'"
        }
      },
      required: ["char"]
    }
  },

  // ===========================================
  // 8. IMAGE TOOLS
  // ===========================================
  {
    name: "insert_image_base64",
    description: "Insert an embedded image (base64).",
    input_schema: {
      type: "object",
      properties: {
        data: {
          type: "string",
          description: "Base64 encoded image data"
        },
        mimeType: {
          type: "string",
          description: "Image MIME type (e.g., 'image/png')"
        },
        width: {
          type: "number",
          description: "Display width in px"
        },
        height: {
          type: "string",
          description: "Display height (px or 'auto')"
        },
        alt: {
          type: "string",
          description: "Alt text"
        },
        align: {
          type: "string",
          enum: ["left", "center", "right"],
          description: "Image alignment"
        }
      },
      required: ["data", "mimeType", "width"]
    }
  },
  {
    name: "insert_image_placeholder",
    description: "Insert a placeholder for an image to be filled later.",
    input_schema: {
      type: "object",
      properties: {
        name: {
          type: "string",
          description: "Placeholder identifier"
        },
        width: {
          type: "number",
          description: "Display width in px"
        },
        height: {
          type: "number",
          description: "Display height in px"
        },
        alt: {
          type: "string",
          description: "Alt text"
        }
      },
      required: ["name", "width", "height"]
    }
  },

  // ===========================================
  // 9. NAVIGATION/CONTROL TOOLS
  // ===========================================
  {
    name: "think",
    description: "Express reasoning before taking action. Use to plan structure, analyze layout, decide approach. MANDATORY before complex operations.",
    input_schema: {
      type: "object",
      properties: {
        reasoning: {
          type: "string",
          description: "Your step-by-step reasoning about the current task"
        }
      },
      required: ["reasoning"]
    }
  },
  {
    name: "validate_output",
    description: "Validate current output against the source image. Use to check your work.",
    input_schema: {
      type: "object",
      properties: {
        check: {
          type: "string",
          enum: ["structure", "content", "both"],
          description: "What to validate"
        },
        section: {
          type: "string",
          description: "Specific section to validate (optional)"
        }
      },
      required: ["check"]
    }
  },
  {
    name: "finish_page",
    description: "Signal completion of current page. Report any continuing structures.",
    input_schema: {
      type: "object",
      properties: {
        continuing_structure: {
          type: "string",
          enum: ["none", "table", "list"],
          description: "Structure that continues to next page"
        },
        open_tags: {
          type: "array",
          items: { type: "string" },
          description: "Any unclosed HTML tags"
        },
        notes: {
          type: "string",
          description: "Notes about the page or issues encountered"
        }
      },
      required: ["continuing_structure"]
    }
  },

  // ===========================================
  // 10. INSPECTION TOOLS (New)
  // ===========================================
  {
    name: "get_table_state",
    description: "Get current state of a table - structure, content preview, spans. Use to verify your work or understand existing structure.",
    input_schema: {
      type: "object",
      properties: {
        table_id: {
          type: "string",
          description: "The table to inspect"
        }
      },
      required: ["table_id"]
    }
  },
  {
    name: "get_output_preview",
    description: "Get a preview of current HTML output. Use to see what you've built so far.",
    input_schema: {
      type: "object",
      properties: {
        last_n_chars: {
          type: "number",
          description: "Return last N characters. Default: 500"
        }
      },
      required: []
    }
  },

  // ===========================================
  // 11. HIGH-LEVEL COMPOSITE TOOLS
  // ===========================================
  {
    name: "create_form_row",
    description: "Create a complete form row (label + field) as a single-row borderless table. Convenience tool for common pattern.",
    input_schema: {
      type: "object",
      properties: {
        cells: {
          type: "array",
          items: {
            type: "object",
            properties: {
              type: {
                type: "string",
                enum: ["label", "field", "content"],
                description: "Cell type"
              },
              text: {
                type: "string",
                description: "Text content (for labels)"
              },
              block_index: {
                type: "number",
                description: "Block index (for content)"
              },
              field: {
                type: "object",
                description: "Field definition (for field type)"
              },
              width: {
                type: "string",
                description: "Cell width"
              },
              bold: {
                type: "boolean",
                description: "Make text bold"
              },
              borderBottom: {
                type: "boolean",
                description: "Add underline border"
              }
            },
            required: ["type", "width"]
          },
          description: "Array of cells in the row"
        },
        border: {
          type: "number",
          description: "Table border. Default: 0"
        },
        cellPadding: {
          type: "number",
          description: "Cell padding. Default: 0"
        }
      },
      required: ["cells"]
    }
  },
  {
    name: "create_data_table",
    description: "Create a complete data table with header and rows. Convenience tool for structured tables.",
    input_schema: {
      type: "object",
      properties: {
        header: {
          type: "object",
          properties: {
            cells: {
              type: "array",
              items: { type: "string" },
              description: "Header cell texts"
            },
            bgColor: {
              type: "string",
              description: "Header background color"
            },
            bold: {
              type: "boolean",
              description: "Bold header text"
            }
          },
          description: "Table header definition"
        },
        rows: {
          type: "array",
          items: {
            type: "object",
            properties: {
              cells: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    text: { type: "string" },
                    block_index: { type: "number" },
                    html: { type: "string" }
                  }
                }
              }
            }
          },
          description: "Table rows"
        },
        widths: {
          type: "array",
          items: { type: "string" },
          description: "Column widths"
        },
        border: {
          type: "number",
          description: "Table border. Default: 1"
        }
      },
      required: ["rows"]
    }
  },
  {
    name: "create_signature_block",
    description: "Create a signature area with multiple signers side by side.",
    input_schema: {
      type: "object",
      properties: {
        signers: {
          type: "array",
          items: {
            type: "object",
            properties: {
              label: {
                type: "string",
                description: "Signer label (e.g., 'Borrower Signature')"
              },
              width: {
                type: "string",
                description: "Column width"
              }
            },
            required: ["label"]
          },
          description: "Array of signers"
        },
        signatureHeight: {
          type: "number",
          description: "Height of signature area in px. Default: 80"
        },
        includeDate: {
          type: "boolean",
          description: "Include date field"
        },
        includeName: {
          type: "boolean",
          description: "Include name field"
        }
      },
      required: ["signers"]
    }
  }
];

// Tool summary by category
export const toolSummary = {
  textRetrieval: ["search_block", "get_block", "list_blocks"],
  table: ["create_table", "set_table_properties", "insert_row", "insert_column", "delete_row", "delete_column", "merge_cells", "split_cell"],
  cell: ["set_rowspan", "set_colspan", "set_cell_background", "set_cell_borders", "set_cell_width", "set_cell_properties", "set_cell_content"],
  formFields: ["insert_textfield", "insert_textarea", "insert_dropdown", "insert_checkbox", "insert_radio", "insert_image_upload"],
  paragraph: ["insert_paragraph", "insert_heading"],
  list: ["insert_list", "insert_list_item"],
  formatting: ["insert_horizontal_line", "insert_spacing", "insert_special_char"],
  image: ["insert_image_base64", "insert_image_placeholder"],
  navigation: ["think", "validate_output", "finish_page"],
  inspection: ["get_table_state", "get_output_preview"],
  composite: ["create_form_row", "create_data_table", "create_signature_block"],
  total: 41
};
