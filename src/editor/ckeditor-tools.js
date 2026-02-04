/**
 * CKEditor Tools - Tool definitions for CKEditor agentic editing
 *
 * These tools define what operations the AI can request.
 * The frontend executes these commands against the CKEditor instance.
 */

export const CKEDITOR_TOOLS = [
  // Content Tools
  {
    name: 'replace_selection',
    description:
      'Replace the currently selected content with new HTML. Use this when user wants to change, rewrite, or replace selected text.',
    input_schema: {
      type: 'object',
      properties: {
        html: {
          type: 'string',
          description: 'The HTML content to replace the selection with',
        },
      },
      required: ['html'],
    },
  },
  {
    name: 'find_and_replace',
    description:
      'Find text in the document and replace it. Use for bulk replacements or when user wants to change specific text throughout.',
    input_schema: {
      type: 'object',
      properties: {
        find: {
          type: 'string',
          description: 'The text or pattern to find',
        },
        replace: {
          type: 'string',
          description: 'The replacement text or HTML',
        },
        replaceAll: {
          type: 'boolean',
          description: 'Replace all occurrences (true) or just the first (false)',
        },
        caseSensitive: {
          type: 'boolean',
          description: 'Whether the search is case-sensitive',
        },
      },
      required: ['find', 'replace'],
    },
  },
  {
    name: 'insert_html',
    description:
      'Insert HTML at a specific position relative to the selection or document.',
    input_schema: {
      type: 'object',
      properties: {
        html: {
          type: 'string',
          description: 'The HTML content to insert',
        },
        position: {
          type: 'string',
          enum: ['at_cursor', 'before_selection', 'after_selection', 'start_of_document', 'end_of_document'],
          description: 'Where to insert the content',
        },
      },
      required: ['html', 'position'],
    },
  },

  // Formatting Tools
  {
    name: 'apply_format',
    description:
      'Apply or remove text formatting (bold, italic, underline, etc.) on the current selection.',
    input_schema: {
      type: 'object',
      properties: {
        format: {
          type: 'string',
          enum: ['bold', 'italic', 'underline', 'strikethrough', 'subscript', 'superscript'],
          description: 'The format to apply',
        },
        remove: {
          type: 'boolean',
          description: 'If true, removes the format instead of applying it',
        },
      },
      required: ['format'],
    },
  },
  {
    name: 'set_font_style',
    description: 'Set font properties (size, family, color) on the current selection.',
    input_schema: {
      type: 'object',
      properties: {
        fontSize: {
          type: 'string',
          description: 'Font size (e.g., "14px", "12pt", "large")',
        },
        fontFamily: {
          type: 'string',
          description: 'Font family name (e.g., "Arial", "Times New Roman")',
        },
        color: {
          type: 'string',
          description: 'Text color (hex like "#ff0000" or name like "red")',
        },
        backgroundColor: {
          type: 'string',
          description: 'Background/highlight color',
        },
      },
    },
  },
  {
    name: 'wrap_selection',
    description: 'Wrap the current selection in an HTML element with optional attributes.',
    input_schema: {
      type: 'object',
      properties: {
        tag: {
          type: 'string',
          description: 'HTML tag name (e.g., "div", "span", "a")',
        },
        attributes: {
          type: 'object',
          description: 'Attributes to add to the element (e.g., {"class": "highlight", "href": "..."})',
        },
      },
      required: ['tag'],
    },
  },

  // Table Tools
  {
    name: 'insert_table',
    description: 'Insert a new table at the cursor position.',
    input_schema: {
      type: 'object',
      properties: {
        rows: {
          type: 'number',
          description: 'Number of rows',
        },
        cols: {
          type: 'number',
          description: 'Number of columns',
        },
        headers: {
          type: 'boolean',
          description: 'Include a header row (th elements)',
        },
        content: {
          type: 'array',
          description: 'Optional 2D array of cell contents',
          items: {
            type: 'array',
            items: { type: 'string' },
          },
        },
      },
      required: ['rows', 'cols'],
    },
  },
  {
    name: 'table_operation',
    description:
      'Perform table operations. Cursor must be inside a table cell for these to work.',
    input_schema: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: [
            'insert_row_above',
            'insert_row_below',
            'insert_col_left',
            'insert_col_right',
            'delete_row',
            'delete_col',
            'merge_cells',
            'split_cell_horizontal',
            'split_cell_vertical',
          ],
          description: 'The table operation to perform',
        },
      },
      required: ['action'],
    },
  },

  // Control Tools
  {
    name: 'think',
    description:
      'Use this to reason about the task before acting. Plan your approach, especially for complex edits.',
    input_schema: {
      type: 'object',
      properties: {
        reasoning: {
          type: 'string',
          description: 'Your reasoning about the task',
        },
      },
      required: ['reasoning'],
    },
  },
  {
    name: 'finish_edit',
    description: 'Call this when you have completed all requested edits.',
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
export function toGeminiFunctionDeclarations(tools) {
  return tools.map((tool) => ({
    name: tool.name,
    description: tool.description,
    parameters: tool.input_schema,
  }));
}

/**
 * System prompt for CKEditor editing agent
 */
export const CKEDITOR_SYSTEM_PROMPT = `You are a document editing assistant working with a rich text editor (CKEditor).

You receive:
- The full HTML content of the document
- Information about what the user has selected
- The user's editing instruction

Your job is to perform the requested edits using the available tools. You can use multiple tools in sequence if needed.

## Important Guidelines

1. **Understand the selection**: The user has selected specific content. Most edits should target this selection.

2. **Use the right tool**:
   - To change selected text content: use \`replace_selection\`
   - To format selected text (bold, italic, etc.): use \`apply_format\`
   - To change font properties: use \`set_font_style\`
   - To find/replace across the document: use \`find_and_replace\`
   - For table operations when cursor is in a table: use \`table_operation\`

3. **Preserve structure**: When replacing content, maintain appropriate HTML structure. Don't break existing tags.

4. **Plan complex edits**: For multi-step operations, use \`think\` first to plan your approach.

5. **Always finish**: Call \`finish_edit\` when done with a summary of what you changed.

## Common Patterns

- "Make this bold" → \`apply_format({format: "bold"})\`
- "Change this to X" → \`replace_selection({html: "X"})\`
- "Add a row below" → \`table_operation({action: "insert_row_below"})\`
- "Replace all X with Y" → \`find_and_replace({find: "X", replace: "Y", replaceAll: true})\`
`;
