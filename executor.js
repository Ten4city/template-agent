/**
 * Tool Executor for Vision HTML Agent v2
 *
 * Implements all 41 tools defined in tools.js
 * Key principle: LLM passes indices, code fetches actual content
 */

import { searchBlocks } from "./extraction.js";

/**
 * Generate unique ID
 */
function generateId(prefix = "id") {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Escape HTML entities
 */
function escapeHtml(str) {
  if (!str) return "";
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/**
 * Tool Executor Class
 *
 * Maintains state for:
 * - Text blocks (extracted from document)
 * - Tables (in-memory structure for manipulation)
 * - HTML output (accumulated output)
 */
export class ToolExecutor {
  constructor(textBlocks = [], options = {}) {
    this.blocks = textBlocks;
    this.tables = new Map(); // table_id -> table structure
    this.htmlOutput = "";
    this.finished = false;
    this.fieldCounter = Date.now();

    // Context from previous page
    this.previousContext = options.previousContext || null;
  }

  /**
   * Main execution method
   */
  execute(toolName, input) {
    const method = this[toolName];
    if (!method) {
      return { error: `Unknown tool: ${toolName}` };
    }
    try {
      return method.call(this, input);
    } catch (err) {
      return { error: err.message };
    }
  }

  // ===========================================
  // 1. TEXT RETRIEVAL TOOLS
  // ===========================================

  search_block(input) {
    const { hint, search_type = "fuzzy" } = input;
    return searchBlocks(this.blocks, hint, search_type);
  }

  get_block(input) {
    const { index, format = "text" } = input;
    if (index < 0 || index >= this.blocks.length) {
      return { error: `Block index ${index} out of range (0-${this.blocks.length - 1})` };
    }
    const block = this.blocks[index];
    return {
      index,
      type: block.type,
      content: format === "html" ? block.html : block.text,
      tag: block.tag
    };
  }

  list_blocks(input) {
    const { from_index = 0, count = 20 } = input || {};
    const end = Math.min(from_index + count, this.blocks.length);
    const blocks = [];

    for (let i = from_index; i < end; i++) {
      const block = this.blocks[i];
      blocks.push({
        index: i,
        type: block.type,
        preview: block.text.substring(0, 80) + (block.text.length > 80 ? "..." : "")
      });
    }

    return {
      blocks,
      total: this.blocks.length,
      showing: `${from_index}-${end - 1}`
    };
  }

  // ===========================================
  // 2. TABLE TOOLS
  // ===========================================

  create_table(input) {
    const {
      rows,
      cols,
      width = "100%",
      height,
      cellPadding = 1,
      cellSpacing = 0,
      border = 0,
      align
    } = input;

    const tableId = generateId("table");

    // Create table structure
    const table = {
      id: tableId,
      rows: [],
      properties: { width, height, cellPadding, cellSpacing, border, align }
    };

    // Initialize cells
    for (let r = 0; r < rows; r++) {
      const row = [];
      for (let c = 0; c < cols; c++) {
        row.push({
          content: "",
          rowSpan: 1,
          colSpan: 1,
          properties: {}
        });
      }
      table.rows.push(row);
    }

    this.tables.set(tableId, table);

    return {
      success: true,
      table_id: tableId,
      rows,
      cols,
      message: `Created ${rows}x${cols} table`
    };
  }

  set_table_properties(input) {
    const { table_id, ...props } = input;
    const table = this.tables.get(table_id);
    if (!table) {
      return { error: `Table not found: ${table_id}` };
    }

    Object.assign(table.properties, props);
    return { success: true, table_id, updated: Object.keys(props) };
  }

  insert_row(input) {
    const { table_id, position, reference_row, count = 1 } = input;
    const table = this.tables.get(table_id);
    if (!table) {
      return { error: `Table not found: ${table_id}` };
    }

    const numCols = table.rows[0]?.length || 0;
    const insertIndex = position === "before" ? reference_row : reference_row + 1;

    for (let i = 0; i < count; i++) {
      const newRow = [];
      for (let c = 0; c < numCols; c++) {
        newRow.push({ content: "", rowSpan: 1, colSpan: 1, properties: {} });
      }
      table.rows.splice(insertIndex + i, 0, newRow);
    }

    return { success: true, table_id, rows_added: count, new_row_count: table.rows.length };
  }

  insert_column(input) {
    const { table_id, position, reference_col, count = 1 } = input;
    const table = this.tables.get(table_id);
    if (!table) {
      return { error: `Table not found: ${table_id}` };
    }

    const insertIndex = position === "before" ? reference_col : reference_col + 1;

    for (const row of table.rows) {
      for (let i = 0; i < count; i++) {
        row.splice(insertIndex + i, 0, { content: "", rowSpan: 1, colSpan: 1, properties: {} });
      }
    }

    return { success: true, table_id, cols_added: count, new_col_count: table.rows[0]?.length };
  }

  delete_row(input) {
    const { table_id, row_indices } = input;
    const table = this.tables.get(table_id);
    if (!table) {
      return { error: `Table not found: ${table_id}` };
    }

    // Delete from highest index first to avoid shifting issues
    const sorted = [...row_indices].sort((a, b) => b - a);
    for (const idx of sorted) {
      if (idx >= 0 && idx < table.rows.length) {
        table.rows.splice(idx, 1);
      }
    }

    return { success: true, table_id, rows_deleted: sorted.length, new_row_count: table.rows.length };
  }

  delete_column(input) {
    const { table_id, col_indices } = input;
    const table = this.tables.get(table_id);
    if (!table) {
      return { error: `Table not found: ${table_id}` };
    }

    const sorted = [...col_indices].sort((a, b) => b - a);
    for (const row of table.rows) {
      for (const idx of sorted) {
        if (idx >= 0 && idx < row.length) {
          row.splice(idx, 1);
        }
      }
    }

    return { success: true, table_id, cols_deleted: sorted.length, new_col_count: table.rows[0]?.length };
  }

  merge_cells(input) {
    const { table_id, start_row, start_col, end_row, end_col } = input;
    const table = this.tables.get(table_id);
    if (!table) {
      return { error: `Table not found: ${table_id}` };
    }

    const cell = table.rows[start_row]?.[start_col];
    if (!cell) {
      return { error: `Cell not found at (${start_row}, ${start_col})` };
    }

    cell.rowSpan = end_row - start_row + 1;
    cell.colSpan = end_col - start_col + 1;

    // Mark merged cells
    for (let r = start_row; r <= end_row; r++) {
      for (let c = start_col; c <= end_col; c++) {
        if (r !== start_row || c !== start_col) {
          table.rows[r][c].merged = true;
          table.rows[r][c].mergeParent = { row: start_row, col: start_col };
        }
      }
    }

    return {
      success: true,
      table_id,
      merged: { start_row, start_col, end_row, end_col },
      rowSpan: cell.rowSpan,
      colSpan: cell.colSpan
    };
  }

  split_cell(input) {
    const { table_id, row, col, direction, count } = input;
    const table = this.tables.get(table_id);
    if (!table) {
      return { error: `Table not found: ${table_id}` };
    }

    const cell = table.rows[row]?.[col];
    if (!cell) {
      return { error: `Cell not found at (${row}, ${col})` };
    }

    if (direction === "horizontal") {
      // Split into multiple rows
      cell.rowSpan = Math.ceil(cell.rowSpan / count);
    } else {
      // Split into multiple columns
      cell.colSpan = Math.ceil(cell.colSpan / count);
    }

    return { success: true, table_id, split: { row, col, direction, count } };
  }

  // ===========================================
  // 3. CELL TOOLS
  // ===========================================

  set_rowspan(input) {
    const { table_id, row, col, span } = input;
    const table = this.tables.get(table_id);
    if (!table) {
      return { error: `Table not found: ${table_id}` };
    }

    const cell = table.rows[row]?.[col];
    if (!cell) {
      return { error: `Cell not found at (${row}, ${col})` };
    }

    cell.rowSpan = span;

    // Mark cells below as merged
    for (let r = row + 1; r < row + span && r < table.rows.length; r++) {
      if (table.rows[r][col]) {
        table.rows[r][col].merged = true;
        table.rows[r][col].mergeParent = { row, col };
      }
    }

    return { success: true, table_id, row, col, rowSpan: span };
  }

  set_colspan(input) {
    const { table_id, row, col, span } = input;
    const table = this.tables.get(table_id);
    if (!table) {
      return { error: `Table not found: ${table_id}` };
    }

    const cell = table.rows[row]?.[col];
    if (!cell) {
      return { error: `Cell not found at (${row}, ${col})` };
    }

    cell.colSpan = span;

    // Mark cells to the right as merged
    for (let c = col + 1; c < col + span && c < table.rows[row].length; c++) {
      table.rows[row][c].merged = true;
      table.rows[row][c].mergeParent = { row, col };
    }

    return { success: true, table_id, row, col, colSpan: span };
  }

  set_cell_background(input) {
    const { table_id, row, col, color } = input;
    const table = this.tables.get(table_id);
    if (!table) {
      return { error: `Table not found: ${table_id}` };
    }

    const cell = table.rows[row]?.[col];
    if (!cell) {
      return { error: `Cell not found at (${row}, ${col})` };
    }

    cell.properties.bgColor = color;
    return { success: true, table_id, row, col, bgColor: color };
  }

  set_cell_borders(input) {
    const { table_id, row, col, top, bottom, left, right, color } = input;
    const table = this.tables.get(table_id);
    if (!table) {
      return { error: `Table not found: ${table_id}` };
    }

    const cell = table.rows[row]?.[col];
    if (!cell) {
      return { error: `Cell not found at (${row}, ${col})` };
    }

    cell.properties.borders = { top, bottom, left, right };
    if (color) cell.properties.borderColor = color;

    return { success: true, table_id, row, col, borders: cell.properties.borders };
  }

  set_cell_width(input) {
    const { table_id, row, col, width } = input;
    const table = this.tables.get(table_id);
    if (!table) {
      return { error: `Table not found: ${table_id}` };
    }

    const cell = table.rows[row]?.[col];
    if (!cell) {
      return { error: `Cell not found at (${row}, ${col})` };
    }

    cell.properties.width = width;
    return { success: true, table_id, row, col, width };
  }

  set_cell_properties(input) {
    const { table_id, cells, ...props } = input;
    const table = this.tables.get(table_id);
    if (!table) {
      return { error: `Table not found: ${table_id}` };
    }

    const updated = [];
    for (const { row, col } of cells) {
      const cell = table.rows[row]?.[col];
      if (cell) {
        Object.assign(cell.properties, props);
        if (props.rowSpan) cell.rowSpan = props.rowSpan;
        if (props.colSpan) cell.colSpan = props.colSpan;
        updated.push({ row, col });
      }
    }

    return { success: true, table_id, updated_cells: updated.length, properties: Object.keys(props) };
  }

  set_cell_content(input) {
    const { table_id, row, col, block_index, text, html, field, append = false } = input;
    const table = this.tables.get(table_id);
    if (!table) {
      return { error: `Table not found: ${table_id}` };
    }

    const cell = table.rows[row]?.[col];
    if (!cell) {
      return { error: `Cell not found at (${row}, ${col})` };
    }

    let content = "";

    // Priority: block_index > html > text > field
    if (block_index !== undefined) {
      const block = this.blocks[block_index];
      if (!block) {
        return { error: `Block index ${block_index} not found` };
      }
      content = block.html || block.text;
    } else if (html !== undefined) {
      content = html;
    } else if (text !== undefined) {
      content = escapeHtml(text);
    } else if (field) {
      content = this._generateFieldHtml(field);
    }

    if (append) {
      cell.content += content;
    } else {
      cell.content = content;
    }

    return {
      success: true,
      table_id,
      row,
      col,
      content_preview: cell.content.substring(0, 50) + (cell.content.length > 50 ? "..." : "")
    };
  }

  // ===========================================
  // 4. FORM FIELD TOOLS
  // ===========================================

  insert_textfield(input) {
    const { name, groupSelect, placeholder, maxLength, type = "text", required, boxed } = input;
    const id = this.fieldCounter++;

    let html = `<input type="${type}" class="leegality-textbox" id="${id}" name="${escapeHtml(name)}"`;
    if (groupSelect) html += ` data-group="${escapeHtml(groupSelect)}"`;
    if (placeholder) html += ` placeholder="${escapeHtml(placeholder)}"`;
    if (maxLength) html += ` maxlength="${maxLength}"`;
    if (required) html += ` required`;
    if (boxed) html += ` leegality-field="boxed"`;
    html += ` />`;

    return { success: true, html, field_id: id };
  }

  insert_textarea(input) {
    const { name, groupSelect, placeholder, cols = 40, rows = 5, required } = input;
    const id = this.fieldCounter++;

    let html = `<textarea class="leegality-textarea" id="${id}" name="${escapeHtml(name)}"`;
    if (groupSelect) html += ` data-group="${escapeHtml(groupSelect)}"`;
    if (placeholder) html += ` placeholder="${escapeHtml(placeholder)}"`;
    html += ` cols="${cols}" rows="${rows}"`;
    if (required) html += ` required`;
    html += `></textarea>`;

    return { success: true, html, field_id: id };
  }

  insert_dropdown(input) {
    const { name, options, selectedValue, multiple, required } = input;
    const id = this.fieldCounter++;

    let html = `<select class="leegality-dropdown" id="${id}" name="${escapeHtml(name)}"`;
    if (multiple) html += ` multiple`;
    if (required) html += ` required`;
    html += `>`;

    for (const opt of options) {
      const selected = opt.value === selectedValue ? " selected" : "";
      html += `<option value="${escapeHtml(opt.value)}"${selected}>${escapeHtml(opt.text)}</option>`;
    }
    html += `</select>`;

    return { success: true, html, field_id: id };
  }

  insert_checkbox(input) {
    const { name, value, checked, required } = input;
    const id = this.fieldCounter++;

    let html = `<input type="checkbox" class="leegality-checkbox" id="${id}" name="${escapeHtml(name)}" value="${escapeHtml(value)}"`;
    if (checked) html += ` checked`;
    if (required) html += ` required`;
    html += ` />`;

    return { success: true, html, field_id: id };
  }

  insert_radio(input) {
    const { name, value, checked, required } = input;
    const id = this.fieldCounter++;

    let html = `<input type="radio" class="leegality-radio" id="${id}" name="${escapeHtml(name)}" value="${escapeHtml(value)}"`;
    if (checked) html += ` checked`;
    if (required) html += ` required`;
    html += ` />`;

    return { success: true, html, field_id: id };
  }

  insert_image_upload(input) {
    const { name, width, height = "auto", alignment, maxFileSize = 512, minWidth, maxWidth, required } = input;
    const id = this.fieldCounter++;

    let style = `width:${width}px;`;
    if (height !== "auto") style += `height:${height}px;`;

    let html = `<input type="file" class="form-image-${id}" id="${id}" name="${escapeHtml(name)}"`;
    html += ` accept="image/jpeg,image/png,image/jpg"`;
    html += ` data-width="${width}" data-size="${maxFileSize}"`;
    if (height !== "auto") html += ` data-height="${height}"`;
    html += ` style="${style}border:1px dotted lightgray;display:inline-block;"`;
    if (required) html += ` required`;
    html += ` />`;

    return { success: true, html, field_id: id };
  }

  // ===========================================
  // 5. PARAGRAPH TOOLS
  // ===========================================

  insert_paragraph(input) {
    const { block_index, text, html: rawHtml, align = "justify", isHeader, isUnderlined } = input || {};

    let content = "";
    if (block_index !== undefined) {
      const block = this.blocks[block_index];
      if (!block) {
        return { error: `Block index ${block_index} not found` };
      }
      content = block.html || block.text;
    } else if (rawHtml) {
      content = rawHtml;
    } else if (text) {
      content = escapeHtml(text);
    }

    if (isHeader) content = `<strong>${content}</strong>`;
    if (isUnderlined) content = `<u>${content}</u>`;

    const html = `<p style="text-align:${align};">${content}</p>\n`;
    this.htmlOutput += html;

    return { success: true, html_added: html.length };
  }

  insert_heading(input) {
    const { block_index, text, align } = input;
    const level = parseInt(input.level) || 1;

    let content = "";
    if (block_index !== undefined) {
      const block = this.blocks[block_index];
      if (!block) {
        return { error: `Block index ${block_index} not found` };
      }
      content = block.html || block.text;
    } else if (text) {
      content = escapeHtml(text);
    }

    let style = "";
    if (align) style = ` style="text-align:${align};"`;

    const html = `<h${level}${style}>${content}</h${level}>\n`;
    this.htmlOutput += html;

    return { success: true, html_added: html.length };
  }

  // ===========================================
  // 6. LIST TOOLS
  // ===========================================

  insert_list(input) {
    const { type, items, startNumber = 1, markers = {} } = input;
    let html = "";
    let currentNumber = startNumber;

    for (const item of items) {
      const indent = item.indent || 0;
      let marker;

      if (markers[indent]) {
        marker = this._getMarker(markers[indent], currentNumber);
      } else if (type === "number") {
        marker = `${currentNumber}.`;
        currentNumber++;
      } else {
        marker = "•";
      }

      html += this._createListItemHtml(marker, item, indent);
    }

    this.htmlOutput += html;
    return { success: true, items_added: items.length, html_added: html.length };
  }

  insert_list_item(input) {
    const { block_index, text, marker, customMarker, markerWidth = "5%", spacerWidth = "3%" } = input;
    const indent = parseInt(input.indent) || 0;

    let content = "";
    if (block_index !== undefined) {
      const block = this.blocks[block_index];
      if (!block) {
        return { error: `Block index ${block_index} not found` };
      }
      content = block.html || block.text;
    } else if (text) {
      content = text; // Allow HTML in text for list items
    }

    const actualMarker = customMarker || marker;
    const html = this._createListItemHtml(actualMarker, { content }, indent, markerWidth, spacerWidth);
    this.htmlOutput += html;

    return { success: true, html_added: html.length, marker: actualMarker, indent };
  }

  _createListItemHtml(marker, item, indent = 0, markerWidth = "5%", spacerWidth = "3%") {
    let content = item.content;
    if (item.block_index !== undefined) {
      const block = this.blocks[item.block_index];
      if (block) {
        content = block.html || block.text;
      }
    }

    const totalSpacer = indent * parseInt(spacerWidth);
    let html = `<table border="0" cellpadding="0" cellspacing="0" style="width:100%;margin-bottom:0;">
  <tbody>
    <tr>`;

    if (indent > 0) {
      html += `
      <td style="width:${totalSpacer}%;"></td>`;
    }

    html += `
      <td style="vertical-align:top;width:${markerWidth};text-align:center;">${marker}</td>
      <td style="vertical-align:top;text-align:justify;">${content}</td>
    </tr>
  </tbody>
</table>
`;
    return html;
  }

  _getMarker(type, number) {
    switch (type) {
      case "number": return `${number}.`;
      case "alpha": return String.fromCharCode(96 + number) + ".";
      case "ALPHA": return String.fromCharCode(64 + number) + ".";
      case "roman": return this._toRoman(number).toLowerCase() + ".";
      case "ROMAN": return this._toRoman(number) + ".";
      default: return type; // Use as literal marker
    }
  }

  _toRoman(num) {
    const romans = [["M", 1000], ["CM", 900], ["D", 500], ["CD", 400], ["C", 100], ["XC", 90], ["L", 50], ["XL", 40], ["X", 10], ["IX", 9], ["V", 5], ["IV", 4], ["I", 1]];
    let result = "";
    for (const [letter, value] of romans) {
      while (num >= value) {
        result += letter;
        num -= value;
      }
    }
    return result;
  }

  // ===========================================
  // 7. FORMATTING TOOLS
  // ===========================================

  insert_horizontal_line(input) {
    const { width = "100%", height = 1, color = "#000000" } = input || {};
    const html = `<hr style="width:${width};height:${height}px;background-color:${color};border:none;" />\n`;
    this.htmlOutput += html;
    return { success: true, html_added: html.length };
  }

  insert_spacing(input) {
    const { lines = 1 } = input || {};
    const html = "<p>&nbsp;</p>\n".repeat(lines);
    this.htmlOutput += html;
    return { success: true, lines_added: lines };
  }

  insert_special_char(input) {
    const { char, custom } = input;
    const chars = {
      nbsp: "&nbsp;",
      copy: "&copy;",
      reg: "&reg;",
      trade: "&trade;",
      rupee: "₹"
    };
    const html = char === "custom" ? custom : (chars[char] || "");
    this.htmlOutput += html;
    return { success: true, char: html };
  }

  // ===========================================
  // 8. IMAGE TOOLS
  // ===========================================

  insert_image_base64(input) {
    const { data, mimeType, width, height = "auto", alt = "", align } = input;
    let style = `width:${width}px;`;
    if (height !== "auto") style += `height:${height}px;`;

    let html = `<img src="data:${mimeType};base64,${data}" alt="${escapeHtml(alt)}" style="${style}"`;
    if (align) html += ` align="${align}"`;
    html += ` />\n`;

    this.htmlOutput += html;
    return { success: true, html_added: html.length };
  }

  insert_image_placeholder(input) {
    const { name, width, height, alt = "" } = input;
    const html = `<div class="image-placeholder" data-name="${escapeHtml(name)}" style="width:${width}px;height:${height}px;border:1px dashed #ccc;display:flex;align-items:center;justify-content:center;background:#f9f9f9;">
  <span style="color:#999;">[${escapeHtml(alt || name)}]</span>
</div>\n`;
    this.htmlOutput += html;
    return { success: true, placeholder_name: name };
  }

  // ===========================================
  // 9. NAVIGATION/CONTROL TOOLS
  // ===========================================

  think(input) {
    const { reasoning } = input;
    // No-op - reasoning is recorded in conversation
    return { success: true, message: "Reasoning recorded", length: reasoning.length };
  }

  validate_output(input) {
    const { check, section } = input;
    // Returns current state for agent to compare against image
    return {
      check,
      section,
      html_length: this.htmlOutput.length,
      tables_count: this.tables.size,
      preview: this.htmlOutput.slice(-500)
    };
  }

  finish_page(input) {
    const { continuing_structure = "none", open_tags = [], notes } = input;

    // Render all tables to HTML output
    for (const [tableId, table] of this.tables) {
      const tableHtml = this._renderTable(table);
      this.htmlOutput += tableHtml;
    }

    this.finished = true;

    return {
      success: true,
      html_length: this.htmlOutput.length,
      continuing_structure,
      open_tags,
      notes
    };
  }

  // ===========================================
  // 10. INSPECTION TOOLS
  // ===========================================

  get_table_state(input) {
    const { table_id } = input;
    const table = this.tables.get(table_id);
    if (!table) {
      return { error: `Table not found: ${table_id}` };
    }

    const state = {
      id: table_id,
      rows: table.rows.length,
      cols: table.rows[0]?.length || 0,
      properties: table.properties,
      cells: []
    };

    for (let r = 0; r < table.rows.length; r++) {
      for (let c = 0; c < table.rows[r].length; c++) {
        const cell = table.rows[r][c];
        if (!cell.merged) {
          state.cells.push({
            row: r,
            col: c,
            rowSpan: cell.rowSpan,
            colSpan: cell.colSpan,
            content_preview: cell.content.substring(0, 30) + (cell.content.length > 30 ? "..." : ""),
            properties: cell.properties
          });
        }
      }
    }

    return state;
  }

  get_output_preview(input) {
    const { last_n_chars = 500 } = input || {};
    return {
      length: this.htmlOutput.length,
      preview: this.htmlOutput.slice(-last_n_chars)
    };
  }

  // ===========================================
  // 11. COMPOSITE TOOLS
  // ===========================================

  create_form_row(input) {
    const { cells, border = 0, cellPadding = 0 } = input;

    let rowHtml = "";
    for (const cell of cells) {
      let content = "";

      if (cell.block_index !== undefined) {
        const block = this.blocks[cell.block_index];
        if (block) content = block.html || block.text;
      } else if (cell.text) {
        content = escapeHtml(cell.text);
      } else if (cell.field) {
        content = this._generateFieldHtml(cell.field);
      }

      if (cell.bold) content = `<strong>${content}</strong>`;

      let style = `width:${cell.width};vertical-align:top;`;
      if (cell.borderBottom) style += "border-bottom:1px solid black;";

      rowHtml += `      <td style="${style}">${content}</td>\n`;
    }

    const html = `<table border="${border}" cellpadding="${cellPadding}" cellspacing="0" style="width:100%;margin-bottom:0;">
  <tbody>
    <tr>
${rowHtml}    </tr>
  </tbody>
</table>
`;

    this.htmlOutput += html;
    return { success: true, cells_count: cells.length, html_added: html.length };
  }

  create_data_table(input) {
    const { header, rows, widths = [], border = 1 } = input;

    let html = `<table border="${border}" cellpadding="4" cellspacing="0" style="width:100%;border-collapse:collapse;">
  <tbody>
`;

    // Header row
    if (header) {
      html += "    <tr>";
      for (let i = 0; i < header.cells.length; i++) {
        const width = widths[i] ? ` style="width:${widths[i]};background-color:${header.bgColor || "#cae0f5"};"` : ` style="background-color:${header.bgColor || "#cae0f5"};"`;
        const content = header.bold ? `<strong>${escapeHtml(header.cells[i])}</strong>` : escapeHtml(header.cells[i]);
        html += `<th${width}>${content}</th>`;
      }
      html += "</tr>\n";
    }

    // Data rows
    for (const row of rows) {
      html += "    <tr>";
      for (let i = 0; i < row.cells.length; i++) {
        const cell = row.cells[i];
        let content = "";
        if (cell.block_index !== undefined) {
          const block = this.blocks[cell.block_index];
          if (block) content = block.html || block.text;
        } else if (cell.html) {
          content = cell.html;
        } else if (cell.text) {
          content = escapeHtml(cell.text);
        }
        const width = widths[i] ? ` style="width:${widths[i]};"` : "";
        html += `<td${width}>${content}</td>`;
      }
      html += "</tr>\n";
    }

    html += `  </tbody>
</table>
`;

    this.htmlOutput += html;
    return { success: true, rows_count: rows.length, html_added: html.length };
  }

  create_signature_block(input) {
    const { signers, signatureHeight = 80, includeDate, includeName } = input;

    const colWidth = Math.floor(100 / signers.length) + "%";

    let html = `<table border="0" cellpadding="0" cellspacing="0" style="width:100%;">
  <tbody>
    <tr>
`;

    for (const signer of signers) {
      html += `      <td style="width:${signer.width || colWidth};vertical-align:top;">
        <p>&nbsp;</p>
        <p style="height:${signatureHeight}px;">&nbsp;</p>
        <p><strong>${escapeHtml(signer.label)}</strong></p>`;

      if (includeName) {
        const nameField = this.insert_textfield({ name: `${signer.label}_name`, placeholder: "Name" });
        html += `
        <p>Name: ${nameField.html}</p>`;
      }
      if (includeDate) {
        const dateField = this.insert_textfield({ name: `${signer.label}_date`, placeholder: "DD/MM/YYYY" });
        html += `
        <p>Date: ${dateField.html}</p>`;
      }

      html += `
      </td>
`;
    }

    html += `    </tr>
  </tbody>
</table>
`;

    this.htmlOutput += html;
    return { success: true, signers_count: signers.length, html_added: html.length };
  }

  // ===========================================
  // HELPER METHODS
  // ===========================================

  _generateFieldHtml(field) {
    const type = field.type || "text";
    switch (type) {
      case "textfield":
      case "text":
        return this.insert_textfield(field).html;
      case "textarea":
        return this.insert_textarea(field).html;
      case "dropdown":
      case "select":
        return this.insert_dropdown(field).html;
      case "checkbox":
        return this.insert_checkbox(field).html;
      case "radio":
        return this.insert_radio(field).html;
      case "image":
        return this.insert_image_upload(field).html;
      default:
        return this.insert_textfield(field).html;
    }
  }

  _renderTable(table) {
    const { width, height, cellPadding, cellSpacing, border, align } = table.properties;

    let style = `width:${width};`;
    if (height) style += `height:${height};`;
    style += "border-collapse:collapse;";

    let tableAttr = `border="${border}" cellpadding="${cellPadding}" cellspacing="${cellSpacing}" style="${style}"`;
    if (align) tableAttr += ` align="${align}"`;

    let html = `<table ${tableAttr}>
  <tbody>
`;

    for (let r = 0; r < table.rows.length; r++) {
      html += "    <tr>\n";
      for (let c = 0; c < table.rows[r].length; c++) {
        const cell = table.rows[r][c];

        // Skip merged cells
        if (cell.merged) continue;

        const tag = cell.properties.cellType === "th" ? "th" : "td";
        let cellAttr = [];
        let cellStyle = [];

        if (cell.rowSpan > 1) cellAttr.push(`rowspan="${cell.rowSpan}"`);
        if (cell.colSpan > 1) cellAttr.push(`colspan="${cell.colSpan}"`);

        if (cell.properties.width) cellStyle.push(`width:${cell.properties.width}`);
        if (cell.properties.height) cellStyle.push(`height:${cell.properties.height}px`);
        if (cell.properties.bgColor) cellStyle.push(`background-color:${cell.properties.bgColor}`);
        if (cell.properties.hAlign) cellStyle.push(`text-align:${cell.properties.hAlign}`);
        if (cell.properties.vAlign) cellStyle.push(`vertical-align:${cell.properties.vAlign}`);

        // Handle borders
        if (cell.properties.borders) {
          const b = cell.properties.borders;
          const color = cell.properties.borderColor || "#000";
          if (b.top) cellStyle.push(`border-top:1px solid ${color}`);
          if (b.bottom) cellStyle.push(`border-bottom:1px solid ${color}`);
          if (b.left) cellStyle.push(`border-left:1px solid ${color}`);
          if (b.right) cellStyle.push(`border-right:1px solid ${color}`);
        }

        if (cellStyle.length > 0) cellAttr.push(`style="${cellStyle.join(";")}"`);

        html += `      <${tag}${cellAttr.length ? " " + cellAttr.join(" ") : ""}>${cell.content}</${tag}>\n`;
      }
      html += "    </tr>\n";
    }

    html += `  </tbody>
</table>
`;
    return html;
  }

  // ===========================================
  // PUBLIC GETTERS
  // ===========================================

  getOutput() {
    return this.htmlOutput;
  }

  isFinished() {
    return this.finished;
  }

  getFullOutput() {
    // Render any pending tables
    let output = this.htmlOutput;
    for (const [, table] of this.tables) {
      // Only render if not already in htmlOutput (finish_page renders them)
      if (!this.finished) {
        output += this._renderTable(table);
      }
    }
    return output;
  }
}
