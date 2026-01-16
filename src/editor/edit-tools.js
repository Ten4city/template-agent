/**
 * Edit Tools
 *
 * Tool definitions for the structure editor agent.
 * Uses Anthropic tool format (compatible with Gemini via conversion).
 *
 * v3: 19 tools (17 editing + 2 control)
 * - Table structure: merge_cells, insert_row, insert_column, delete_row, delete_column, split_cell, set_table_properties
 * - Cell styling: set_cell_content, set_cell_background, set_cell_borders, set_cell_width, set_cell_properties
 * - Header/text: set_header_text, set_header_style
 * - Text formatting: set_text_format (bold, italic, underline, strikethrough, fontSize, fontFamily, color)
 * - Layout: set_element_margin
 * - Control: think, finish_edit
 */

export const EDIT_TOOLS = [
  // ==================== TABLE STRUCTURE TOOLS ====================
  {
    name: 'merge_cells',
    description:
      'Merge a rectangular range of cells into one. Content from all cells is combined. Use when user wants to combine multiple cells.',
    input_schema: {
      type: 'object',
      properties: {
        elementIndex: {
          type: 'number',
          description: 'Table index in elements array',
        },
        startRow: {
          type: 'number',
          description: 'Starting row (0-indexed)',
        },
        startCol: {
          type: 'number',
          description: 'Starting column (0-indexed)',
        },
        endRow: {
          type: 'number',
          description: 'Ending row (inclusive)',
        },
        endCol: {
          type: 'number',
          description: 'Ending column (inclusive)',
        },
      },
      required: ['elementIndex', 'startRow', 'startCol', 'endRow', 'endCol'],
    },
  },
  {
    name: 'insert_row',
    description:
      'Insert one or more rows into the table. New rows are inserted AFTER the specified row index.',
    input_schema: {
      type: 'object',
      properties: {
        elementIndex: {
          type: 'number',
          description: 'Table index in elements array',
        },
        afterRow: {
          type: 'number',
          description: 'Insert after this row index (-1 to insert at beginning)',
        },
        count: {
          type: 'number',
          description: 'Number of rows to insert (default 1)',
        },
      },
      required: ['elementIndex', 'afterRow'],
    },
  },
  {
    name: 'insert_column',
    description:
      'Insert one or more columns into the table. New columns are inserted AFTER the specified column index.',
    input_schema: {
      type: 'object',
      properties: {
        elementIndex: {
          type: 'number',
          description: 'Table index in elements array',
        },
        afterCol: {
          type: 'number',
          description: 'Insert after this column index (-1 to insert at beginning)',
        },
        count: {
          type: 'number',
          description: 'Number of columns to insert (default 1)',
        },
      },
      required: ['elementIndex', 'afterCol'],
    },
  },
  {
    name: 'delete_row',
    description: 'Delete a row from the table. Handles rowspan adjustments automatically.',
    input_schema: {
      type: 'object',
      properties: {
        elementIndex: {
          type: 'number',
          description: 'Table index in elements array',
        },
        rowIndex: {
          type: 'number',
          description: 'Row index to delete (0-indexed)',
        },
      },
      required: ['elementIndex', 'rowIndex'],
    },
  },
  {
    name: 'delete_column',
    description: 'Delete a column from the table. Handles colspan adjustments automatically.',
    input_schema: {
      type: 'object',
      properties: {
        elementIndex: {
          type: 'number',
          description: 'Table index in elements array',
        },
        colIndex: {
          type: 'number',
          description: 'Column index to delete (0-indexed)',
        },
      },
      required: ['elementIndex', 'colIndex'],
    },
  },
  {
    name: 'split_cell',
    description:
      'Split a merged cell. If cell has colspan, reduces it. If cell has rowspan, reduces it. Direction determines which dimension to split.',
    input_schema: {
      type: 'object',
      properties: {
        elementIndex: {
          type: 'number',
          description: 'Table index in elements array',
        },
        row: {
          type: 'number',
          description: 'Row index of the cell',
        },
        col: {
          type: 'number',
          description: 'Column index of the cell',
        },
        direction: {
          type: 'string',
          enum: ['horizontal', 'vertical'],
          description: 'horizontal = split columns (reduce colspan), vertical = split rows (reduce rowspan)',
        },
      },
      required: ['elementIndex', 'row', 'col', 'direction'],
    },
  },
  {
    name: 'set_table_bordered',
    description:
      'Toggle table border visibility. bordered=true shows grid lines, bordered=false hides them.',
    input_schema: {
      type: 'object',
      properties: {
        elementIndex: {
          type: 'number',
          description: 'Table index in elements array',
        },
        bordered: {
          type: 'boolean',
          description: 'true = visible borders, false = no borders',
        },
      },
      required: ['elementIndex', 'bordered'],
    },
  },
  {
    name: 'set_table_properties',
    description: 'Set table-level properties like width, cellPadding, cellSpacing.',
    input_schema: {
      type: 'object',
      properties: {
        elementIndex: {
          type: 'number',
          description: 'Table index in elements array',
        },
        width: {
          type: 'string',
          description: 'Table width (e.g., "100%", "500px")',
        },
        cellPadding: {
          type: 'string',
          description: 'Cell padding in pixels (e.g., "5")',
        },
        cellSpacing: {
          type: 'string',
          description: 'Cell spacing in pixels (e.g., "0")',
        },
        bordered: {
          type: 'boolean',
          description: 'Whether table has visible borders',
        },
      },
      required: ['elementIndex'],
    },
  },

  // ==================== CELL STYLING TOOLS ====================
  {
    name: 'set_cell_content',
    description: 'Update text content of a specific cell. Use when user wants to change cell text.',
    input_schema: {
      type: 'object',
      properties: {
        elementIndex: {
          type: 'number',
          description: 'Table index in elements array',
        },
        row: {
          type: 'number',
          description: 'Row index (0-indexed)',
        },
        col: {
          type: 'number',
          description: 'Column index (0-indexed)',
        },
        text: {
          type: 'string',
          description: 'New text content for the cell',
        },
      },
      required: ['elementIndex', 'row', 'col', 'text'],
    },
  },
  {
    name: 'set_cell_background',
    description: 'Set background color of a cell.',
    input_schema: {
      type: 'object',
      properties: {
        elementIndex: {
          type: 'number',
          description: 'Table index in elements array',
        },
        row: {
          type: 'number',
          description: 'Row index (0-indexed)',
        },
        col: {
          type: 'number',
          description: 'Column index (0-indexed)',
        },
        color: {
          type: 'string',
          description: 'Background color (e.g., "#ffff00", "yellow", "rgb(255,255,0)")',
        },
      },
      required: ['elementIndex', 'row', 'col', 'color'],
    },
  },
  {
    name: 'set_cell_borders',
    description:
      'Set borders on specific sides of a cell. Each border is specified as CSS border shorthand (e.g., "1px solid #000").',
    input_schema: {
      type: 'object',
      properties: {
        elementIndex: {
          type: 'number',
          description: 'Table index in elements array',
        },
        row: {
          type: 'number',
          description: 'Row index (0-indexed)',
        },
        col: {
          type: 'number',
          description: 'Column index (0-indexed)',
        },
        top: {
          type: 'string',
          description: 'Top border (e.g., "1px solid #000", "none")',
        },
        bottom: {
          type: 'string',
          description: 'Bottom border',
        },
        left: {
          type: 'string',
          description: 'Left border',
        },
        right: {
          type: 'string',
          description: 'Right border',
        },
        all: {
          type: 'string',
          description: 'Set all borders at once',
        },
      },
      required: ['elementIndex', 'row', 'col'],
    },
  },
  {
    name: 'set_cell_width',
    description: 'Set width of a cell (affects entire column visually).',
    input_schema: {
      type: 'object',
      properties: {
        elementIndex: {
          type: 'number',
          description: 'Table index in elements array',
        },
        row: {
          type: 'number',
          description: 'Row index (0-indexed)',
        },
        col: {
          type: 'number',
          description: 'Column index (0-indexed)',
        },
        width: {
          type: 'string',
          description: 'Width value (e.g., "100px", "25%")',
        },
      },
      required: ['elementIndex', 'row', 'col', 'width'],
    },
  },
  {
    name: 'set_cell_properties',
    description:
      'Set multiple cell properties at once. Use for bulk styling (alignment, colors, borders, padding).',
    input_schema: {
      type: 'object',
      properties: {
        elementIndex: {
          type: 'number',
          description: 'Table index in elements array',
        },
        row: {
          type: 'number',
          description: 'Row index (0-indexed)',
        },
        col: {
          type: 'number',
          description: 'Column index (0-indexed)',
        },
        backgroundColor: {
          type: 'string',
          description: 'Background color',
        },
        textAlign: {
          type: 'string',
          enum: ['left', 'center', 'right'],
          description: 'Horizontal text alignment',
        },
        verticalAlign: {
          type: 'string',
          enum: ['top', 'middle', 'bottom'],
          description: 'Vertical text alignment',
        },
        width: {
          type: 'string',
          description: 'Cell width',
        },
        padding: {
          type: 'string',
          description: 'Cell padding (e.g., "5px", "5px 10px")',
        },
        border: {
          type: 'string',
          description: 'All borders (e.g., "1px solid #000")',
        },
      },
      required: ['elementIndex', 'row', 'col'],
    },
  },

  // ==================== HEADER/TEXT TOOLS ====================
  {
    name: 'set_header_text',
    description: 'Change the text content of a header element.',
    input_schema: {
      type: 'object',
      properties: {
        elementIndex: {
          type: 'number',
          description: 'Header element index in elements array',
        },
        text: {
          type: 'string',
          description: 'New header text',
        },
      },
      required: ['elementIndex', 'text'],
    },
  },
  {
    name: 'set_header_style',
    description: 'Change header styling (background color, text color, margins).',
    input_schema: {
      type: 'object',
      properties: {
        elementIndex: {
          type: 'number',
          description: 'Header element index in elements array',
        },
        backgroundColor: {
          type: 'string',
          description: 'Background color (e.g., "#1a5276", "blue")',
        },
        color: {
          type: 'string',
          description: 'Text color',
        },
        fontSize: {
          type: 'string',
          description: 'Font size (e.g., "14px")',
        },
        padding: {
          type: 'string',
          description: 'Padding (e.g., "8px 12px")',
        },
      },
      required: ['elementIndex'],
    },
  },

  // ==================== TEXT FORMATTING TOOLS ====================
  {
    name: 'set_text_format',
    description:
      'Set text formatting on a cell: bold, italic, underline, strikethrough, font size, font family, text color. Use for making text stand out or changing typography.',
    input_schema: {
      type: 'object',
      properties: {
        elementIndex: {
          type: 'number',
          description: 'Table index in elements array',
        },
        row: {
          type: 'number',
          description: 'Row index (0-indexed)',
        },
        col: {
          type: 'number',
          description: 'Column index (0-indexed)',
        },
        bold: {
          type: 'boolean',
          description: 'Make text bold (true) or normal weight (false)',
        },
        italic: {
          type: 'boolean',
          description: 'Make text italic (true) or normal style (false)',
        },
        underline: {
          type: 'boolean',
          description: 'Add underline (true) or remove (false)',
        },
        strikethrough: {
          type: 'boolean',
          description: 'Add strikethrough (true) or remove (false)',
        },
        fontSize: {
          type: 'string',
          description: 'Font size (e.g., "10px", "12px", "14px", "16px")',
        },
        fontFamily: {
          type: 'string',
          description: 'Font family (e.g., "Arial", "Times New Roman", "Courier New")',
        },
        color: {
          type: 'string',
          description: 'Text color (e.g., "#ff0000", "red", "rgb(255,0,0)")',
        },
      },
      required: ['elementIndex', 'row', 'col'],
    },
  },

  // ==================== LAYOUT TOOLS ====================
  {
    name: 'set_element_margin',
    description:
      'Set margins on any element (table, header, paragraph). Use to control spacing between elements. Set margin to "0" to remove gaps between elements.',
    input_schema: {
      type: 'object',
      properties: {
        elementIndex: {
          type: 'number',
          description: 'Element index in elements array',
        },
        top: {
          type: 'string',
          description: 'Top margin (e.g., "0", "10px", "1em")',
        },
        bottom: {
          type: 'string',
          description: 'Bottom margin',
        },
        left: {
          type: 'string',
          description: 'Left margin',
        },
        right: {
          type: 'string',
          description: 'Right margin',
        },
      },
      required: ['elementIndex'],
    },
  },

  // ==================== CONTROL TOOLS ====================
  {
    name: 'think',
    description:
      'Reason about what to do before acting. Use when the instruction is ambiguous or requires planning multiple steps.',
    input_schema: {
      type: 'object',
      properties: {
        reasoning: {
          type: 'string',
          description: 'Your reasoning about how to approach this edit',
        },
      },
      required: ['reasoning'],
    },
  },
  {
    name: 'finish_edit',
    description: 'Signal that editing is complete. Call this when you have finished all requested changes.',
    input_schema: {
      type: 'object',
      properties: {
        summary: {
          type: 'string',
          description: 'Brief summary of changes made',
        },
      },
      required: ['summary'],
    },
  },
];

/**
 * Convert Anthropic tool format to Gemini function declarations
 */
export function convertToolsToGemini(tools) {
  return tools.map((tool) => ({
    name: tool.name,
    description: tool.description,
    parameters: tool.input_schema,
  }));
}
