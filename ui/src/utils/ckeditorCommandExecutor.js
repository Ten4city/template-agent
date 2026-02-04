/**
 * CKEditor Command Executor
 *
 * Executes commands returned by the CKEditor agent against a CKEditor instance.
 * Each command maps to CKEditor API calls.
 */

export class CKEditorCommandExecutor {
  constructor(editor) {
    if (!editor) {
      throw new Error('CKEditor instance is required');
    }
    this.editor = editor;
  }

  /**
   * Execute a list of commands in order
   * @param {Array} commands - Array of {tool, args} objects
   * @returns {Array} Results for each command
   */
  async executeCommands(commands) {
    const results = [];

    for (const cmd of commands) {
      try {
        const result = await this.executeCommand(cmd);
        results.push({ ...cmd, success: true, result });
      } catch (error) {
        console.error(`[CommandExecutor] Error executing ${cmd.tool}:`, error);
        results.push({ ...cmd, success: false, error: error.message });
        // Continue with other commands even if one fails
      }
    }

    return results;
  }

  /**
   * Execute a single command
   * @param {Object} command - {tool, args}
   * @returns {Object} Result of the command
   */
  async executeCommand({ tool, args }) {
    switch (tool) {
      case 'replace_selection':
        return this.replaceSelection(args.html);

      case 'find_and_replace':
        return this.findAndReplace(args);

      case 'insert_html':
        return this.insertHtml(args.html, args.position);

      case 'apply_format':
        return this.applyFormat(args.format, args.remove);

      case 'set_font_style':
        return this.setFontStyle(args);

      case 'wrap_selection':
        return this.wrapSelection(args.tag, args.attributes);

      case 'insert_table':
        return this.insertTable(args);

      case 'table_operation':
        return this.tableOperation(args.action);

      case 'finish_edit':
        // No action needed - this is a control command
        return { acknowledged: true };

      default:
        throw new Error(`Unknown command: ${tool}`);
    }
  }

  /**
   * Replace current selection with HTML
   */
  replaceSelection(html) {
    this.editor.insertHtml(html);
    return { message: 'Selection replaced' };
  }

  /**
   * Find and replace text in the document
   */
  findAndReplace({ find, replace, replaceAll = true, caseSensitive = false }) {
    const body = this.editor.document.getBody();
    let html = body.getHtml();

    // Build regex
    const flags = (replaceAll ? 'g' : '') + (caseSensitive ? '' : 'i');
    const escapedFind = this.escapeRegex(find);
    const pattern = new RegExp(escapedFind, flags);

    // Count matches
    const matches = (html.match(pattern) || []).length;

    if (matches === 0) {
      return { message: 'No matches found', matchesFound: 0 };
    }

    // Perform replacement
    html = html.replace(pattern, replace);
    this.editor.setData(html);

    return {
      message: `Replaced ${replaceAll ? matches : 1} occurrence(s)`,
      matchesFound: matches,
      replaced: replaceAll ? matches : 1,
    };
  }

  /**
   * Insert HTML at a specific position
   */
  insertHtml(html, position) {
    switch (position) {
      case 'at_cursor':
      case 'before_selection':
      case 'after_selection':
        // All these effectively insert at cursor for CKEditor
        this.editor.insertHtml(html);
        break;

      case 'start_of_document': {
        const currentHtml = this.editor.getData();
        this.editor.setData(html + currentHtml);
        break;
      }

      case 'end_of_document': {
        const data = this.editor.getData();
        this.editor.setData(data + html);
        break;
      }

      default:
        throw new Error(`Unknown position: ${position}`);
    }

    return { message: `HTML inserted at ${position}` };
  }

  /**
   * Apply text formatting
   */
  applyFormat(format, remove = false) {
    const commandMap = {
      bold: 'bold',
      italic: 'italic',
      underline: 'underline',
      strikethrough: 'strike',
      subscript: 'subscript',
      superscript: 'superscript',
    };

    const cmd = commandMap[format];
    if (!cmd) {
      throw new Error(`Unknown format: ${format}`);
    }

    // CKEditor toggle commands - executing when already applied removes it
    this.editor.execCommand(cmd);

    return { message: `${remove ? 'Removed' : 'Applied'} ${format} formatting` };
  }

  /**
   * Set font style properties
   */
  setFontStyle({ fontSize, fontFamily, color, backgroundColor }) {
    const applied = [];

    if (fontSize) {
      // CKEditor font size command
      this.editor.execCommand('fontSize', fontSize);
      applied.push(`fontSize: ${fontSize}`);
    }

    if (fontFamily) {
      this.editor.execCommand('font', fontFamily);
      applied.push(`fontFamily: ${fontFamily}`);
    }

    if (color) {
      this.editor.execCommand('foreColor', color);
      applied.push(`color: ${color}`);
    }

    if (backgroundColor) {
      this.editor.execCommand('hiliteColor', backgroundColor);
      applied.push(`backgroundColor: ${backgroundColor}`);
    }

    return { message: `Set font style: ${applied.join(', ')}` };
  }

  /**
   * Wrap selection in an HTML element
   */
  wrapSelection(tag, attributes = {}) {
    const selectedHtml = this.getSelectedHtml();

    // Build opening tag with attributes
    let attrStr = Object.entries(attributes)
      .map(([k, v]) => `${k}="${this.escapeHtml(String(v))}"`)
      .join(' ');

    const openTag = attrStr ? `<${tag} ${attrStr}>` : `<${tag}>`;
    const closeTag = `</${tag}>`;

    const wrapped = `${openTag}${selectedHtml}${closeTag}`;
    this.editor.insertHtml(wrapped);

    return { message: `Wrapped selection in <${tag}>` };
  }

  /**
   * Insert a new table
   */
  insertTable({ rows, cols, headers = false, content = [] }) {
    let tableHtml = '<table border="1" cellpadding="5" cellspacing="0" style="border-collapse: collapse; width: 100%;">';

    for (let r = 0; r < rows; r++) {
      tableHtml += '<tr>';
      const cellTag = headers && r === 0 ? 'th' : 'td';

      for (let c = 0; c < cols; c++) {
        const cellContent = content?.[r]?.[c] || '&nbsp;';
        tableHtml += `<${cellTag} style="border: 1px solid #000; padding: 4px;">${cellContent}</${cellTag}>`;
      }

      tableHtml += '</tr>';
    }

    tableHtml += '</table><p>&nbsp;</p>';

    this.editor.insertHtml(tableHtml);

    return { message: `Inserted ${rows}x${cols} table` };
  }

  /**
   * Perform table operations
   */
  tableOperation(action) {
    const commandMap = {
      insert_row_above: 'rowInsertBefore',
      insert_row_below: 'rowInsertAfter',
      insert_col_left: 'columnInsertBefore',
      insert_col_right: 'columnInsertAfter',
      delete_row: 'rowDelete',
      delete_col: 'columnDelete',
      merge_cells: 'cellMerge',
      split_cell_horizontal: 'cellHorizontalSplit',
      split_cell_vertical: 'cellVerticalSplit',
    };

    const cmd = commandMap[action];
    if (!cmd) {
      throw new Error(`Unknown table action: ${action}`);
    }

    // Check if command is available (cursor must be in table)
    const commandState = this.editor.getCommand(cmd);
    if (commandState && commandState.state === window.CKEDITOR.TRISTATE_DISABLED) {
      throw new Error(`Cannot execute ${action}: cursor is not in a table cell`);
    }

    this.editor.execCommand(cmd);

    return { message: `Executed table operation: ${action}` };
  }

  /**
   * Get selected HTML content
   */
  getSelectedHtml() {
    const selection = this.editor.getSelection();
    if (!selection) return '';

    const ranges = selection.getRanges();
    if (!ranges || ranges.length === 0) return '';

    const range = ranges[0];
    const fragment = range.cloneContents();

    // Create temporary container to get HTML
    const container = window.CKEDITOR.dom.element.createFromHtml('<div></div>');
    fragment.appendTo(container);

    return container.getHtml();
  }

  /**
   * Escape special regex characters
   */
  escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  /**
   * Escape HTML special characters
   */
  escapeHtml(str) {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
}
