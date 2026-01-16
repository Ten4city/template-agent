/**
 * Structure Editor
 *
 * Operates on document structure JSON (from reconstruction pipeline)
 * to make surgical edits. Each tool modifies the structure in place
 * with checkpoint/undo support.
 *
 * v2: 16 editing operations (see edit-tools.js)
 */

export class StructureEditor {
  constructor(structure) {
    // Deep clone to avoid mutating original
    this.structure = JSON.parse(JSON.stringify(structure));
    this.history = [];
  }

  /**
   * Save current state for undo
   */
  checkpoint() {
    this.history.push(JSON.parse(JSON.stringify(this.structure)));
  }

  // ==================== TABLE STRUCTURE TOOLS ====================

  /**
   * Merge a rectangular range of cells into one
   */
  merge_cells({ elementIndex, startRow, startCol, endRow, endCol }) {
    this.checkpoint();

    const table = this._getTable(elementIndex);
    if (!table) {
      return { success: false, error: `Element ${elementIndex} is not a table` };
    }

    // Validate range
    if (startRow > endRow || startCol > endCol) {
      return { success: false, error: 'Invalid range: start must be <= end' };
    }

    if (endRow >= table.rows.length) {
      return { success: false, error: `Row ${endRow} out of bounds (max ${table.rows.length - 1})` };
    }

    // Collect content from all cells in range
    const contents = [];
    for (let r = startRow; r <= endRow; r++) {
      for (let c = startCol; c <= endCol; c++) {
        const cell = table.rows[r][c];
        if (cell && cell !== null) {
          const text = typeof cell === 'string' ? cell : cell.text || '';
          if (text.trim()) contents.push(text.trim());
        }
      }
    }
    const mergedContent = contents.join(' ');

    // Calculate spans
    const rowSpan = endRow - startRow + 1;
    const colSpan = endCol - startCol + 1;

    // Set first cell with colspan/rowspan
    table.rows[startRow][startCol] = {
      text: mergedContent,
      ...(rowSpan > 1 && { rowspan: rowSpan }),
      ...(colSpan > 1 && { colspan: colSpan }),
    };

    // For colspan: remove extra cells from each row in the range
    // For rowspan: mark cells in lower rows as null (covered from above)
    for (let r = startRow; r <= endRow; r++) {
      if (r === startRow) {
        // First row: remove cells after startCol (colspan covers them)
        if (colSpan > 1) {
          table.rows[r].splice(startCol + 1, colSpan - 1);
        }
      } else {
        // Lower rows: mark cells as null (rowspan covers them) then remove colspan cells
        table.rows[r][startCol] = null;
        if (colSpan > 1) {
          table.rows[r].splice(startCol + 1, colSpan - 1);
        }
      }
    }

    // Update table column count
    if (table.columns) {
      table.columns = table.columns - (colSpan - 1);
    }

    return {
      success: true,
      message: `Merged ${rowSpan}x${colSpan} cells at (${startRow},${startCol})`,
    };
  }

  /**
   * Insert rows after a specified position
   */
  insert_row({ elementIndex, afterRow, count = 1 }) {
    this.checkpoint();

    const table = this._getTable(elementIndex);
    if (!table) {
      return { success: false, error: `Element ${elementIndex} is not a table` };
    }

    // Determine column count from first row or table.columns
    const colCount = table.columns || (table.rows[0] ? table.rows[0].length : 1);

    // Create new empty rows
    const newRows = Array(count)
      .fill(null)
      .map(() => Array(colCount).fill(''));

    // Insert after the specified row (-1 means at beginning)
    const insertAt = afterRow + 1;
    table.rows.splice(insertAt, 0, ...newRows);

    return {
      success: true,
      message: `Inserted ${count} row(s) after row ${afterRow}`,
    };
  }

  /**
   * Insert columns after a specified position
   */
  insert_column({ elementIndex, afterCol, count = 1 }) {
    this.checkpoint();

    const table = this._getTable(elementIndex);
    if (!table) {
      return { success: false, error: `Element ${elementIndex} is not a table` };
    }

    // Insert empty cells into each row
    const insertAt = afterCol + 1;
    for (const row of table.rows) {
      const newCells = Array(count).fill('');
      row.splice(insertAt, 0, ...newCells);
    }

    // Update column count
    if (table.columns) {
      table.columns += count;
    }

    return {
      success: true,
      message: `Inserted ${count} column(s) after column ${afterCol}`,
    };
  }

  /**
   * Delete a row from the table
   */
  delete_row({ elementIndex, rowIndex }) {
    this.checkpoint();

    const table = this._getTable(elementIndex);
    if (!table) {
      return { success: false, error: `Element ${elementIndex} is not a table` };
    }

    if (rowIndex >= table.rows.length) {
      return { success: false, error: `Row ${rowIndex} out of bounds` };
    }

    // Check if any cell in this row has a rowspan > 1
    // If so, we need to handle it carefully
    for (let c = 0; c < table.rows[rowIndex].length; c++) {
      const cell = table.rows[rowIndex][c];
      if (cell && typeof cell === 'object' && cell.rowspan && cell.rowspan > 1) {
        // Decrease rowspan or move content to next row
        const nextRowIdx = rowIndex + 1;
        if (nextRowIdx < table.rows.length) {
          const newCell = { ...cell, rowspan: cell.rowspan - 1 };
          if (newCell.rowspan === 1) delete newCell.rowspan;
          table.rows[nextRowIdx][c] = newCell;
        }
      }
    }

    // Also check if cells in previous rows span into this row
    for (let r = 0; r < rowIndex; r++) {
      for (let c = 0; c < table.rows[r].length; c++) {
        const cell = table.rows[r][c];
        if (cell && typeof cell === 'object' && cell.rowspan) {
          const spansIntoDeleted = r + cell.rowspan > rowIndex;
          if (spansIntoDeleted) {
            cell.rowspan = cell.rowspan - 1;
            if (cell.rowspan === 1) delete cell.rowspan;
          }
        }
      }
    }

    table.rows.splice(rowIndex, 1);

    return { success: true, message: `Deleted row ${rowIndex}` };
  }

  /**
   * Delete a column from the table
   */
  delete_column({ elementIndex, colIndex }) {
    this.checkpoint();

    const table = this._getTable(elementIndex);
    if (!table) {
      return { success: false, error: `Element ${elementIndex} is not a table` };
    }

    // Check bounds on first row
    if (table.rows.length > 0 && colIndex >= table.rows[0].length) {
      return { success: false, error: `Column ${colIndex} out of bounds` };
    }

    // Handle colspan in each row
    for (let r = 0; r < table.rows.length; r++) {
      const row = table.rows[r];

      // Check if this column is covered by a colspan from an earlier cell
      let actualCol = 0;
      for (let c = 0; c < row.length; c++) {
        const cell = row[c];
        const cellColspan = typeof cell === 'object' && cell?.colspan ? cell.colspan : 1;

        if (actualCol <= colIndex && actualCol + cellColspan > colIndex) {
          // This cell covers the target column
          if (cellColspan > 1) {
            // Reduce colspan
            if (typeof cell === 'object') {
              cell.colspan = cellColspan - 1;
              if (cell.colspan === 1) delete cell.colspan;
            }
          } else {
            // Remove the cell
            row.splice(c, 1);
          }
          break;
        }
        actualCol += cellColspan;
      }
    }

    // Update column count
    if (table.columns) {
      table.columns -= 1;
    }

    return { success: true, message: `Deleted column ${colIndex}` };
  }

  /**
   * Split a merged cell
   */
  split_cell({ elementIndex, row, col, direction }) {
    this.checkpoint();

    const table = this._getTable(elementIndex);
    if (!table) {
      return { success: false, error: `Element ${elementIndex} is not a table` };
    }

    const cell = table.rows[row]?.[col];
    if (!cell || cell === null) {
      return { success: false, error: `Cell (${row},${col}) not found or is covered` };
    }

    if (typeof cell !== 'object') {
      return { success: false, error: `Cell (${row},${col}) is not merged` };
    }

    const hasColspan = cell.colspan && cell.colspan > 1;
    const hasRowspan = cell.rowspan && cell.rowspan > 1;

    if (!hasColspan && !hasRowspan) {
      return { success: false, error: `Cell (${row},${col}) is not merged` };
    }

    if (direction === 'horizontal' && hasColspan) {
      // Split horizontally: reduce colspan by 1, add a new cell
      cell.colspan -= 1;
      if (cell.colspan === 1) delete cell.colspan;
      // Insert empty cell after this one
      table.rows[row].splice(col + 1, 0, '');
      if (table.columns) table.columns += 1;
      return { success: true, message: `Split cell horizontally at (${row},${col})` };
    }

    if (direction === 'vertical' && hasRowspan) {
      // Split vertically: reduce rowspan by 1, uncover the cell below
      cell.rowspan -= 1;
      if (cell.rowspan === 1) delete cell.rowspan;
      // The cell below was null (covered), make it an empty cell
      const belowRow = row + cell.rowspan + 1;
      if (belowRow < table.rows.length) {
        table.rows[belowRow][col] = '';
      }
      return { success: true, message: `Split cell vertically at (${row},${col})` };
    }

    return {
      success: false,
      error: `Cannot split ${direction}: cell has colspan=${cell.colspan || 1}, rowspan=${cell.rowspan || 1}`,
    };
  }

  /**
   * Set table-level properties
   */
  set_table_properties({ elementIndex, width, cellPadding, cellSpacing, bordered }) {
    this.checkpoint();

    const table = this._getTable(elementIndex);
    if (!table) {
      return { success: false, error: `Element ${elementIndex} is not a table` };
    }

    if (bordered !== undefined) table.bordered = bordered;
    if (cellPadding !== undefined) table.cellPadding = cellPadding;
    if (cellSpacing !== undefined) table.cellSpacing = cellSpacing;
    if (width !== undefined) {
      table.customStyle = table.customStyle || {};
      table.customStyle.width = width;
    }

    return {
      success: true,
      message: `Updated table ${elementIndex} properties`,
    };
  }

  /**
   * Toggle table border visibility (convenience method)
   */
  set_table_bordered({ elementIndex, bordered }) {
    return this.set_table_properties({ elementIndex, bordered });
  }

  // ==================== CELL STYLING TOOLS ====================

  /**
   * Update text content of a cell
   */
  set_cell_content({ elementIndex, row, col, text }) {
    this.checkpoint();

    const table = this._getTable(elementIndex);
    if (!table) {
      return { success: false, error: `Element ${elementIndex} is not a table` };
    }

    if (row >= table.rows.length) {
      return { success: false, error: `Row ${row} out of bounds` };
    }

    if (col >= table.rows[row].length) {
      return { success: false, error: `Column ${col} out of bounds` };
    }

    const cell = table.rows[row][col];

    // Handle different cell types
    if (cell === null) {
      // Cell is covered by a span - can't edit directly
      return { success: false, error: 'Cell is covered by a merged cell' };
    }

    if (typeof cell === 'string') {
      table.rows[row][col] = text;
    } else if (typeof cell === 'object') {
      table.rows[row][col] = { ...cell, text };
    } else {
      table.rows[row][col] = text;
    }

    return { success: true, message: `Updated cell (${row},${col})` };
  }

  /**
   * Set cell background color
   */
  set_cell_background({ elementIndex, row, col, color }) {
    this.checkpoint();

    const cell = this._ensureCellObject(elementIndex, row, col);
    if (cell.error) return cell;

    cell.cell.backgroundColor = color;
    return { success: true, message: `Set cell (${row},${col}) background to ${color}` };
  }

  /**
   * Set cell borders (per-side or all)
   */
  set_cell_borders({ elementIndex, row, col, top, bottom, left, right, all }) {
    this.checkpoint();

    const cell = this._ensureCellObject(elementIndex, row, col);
    if (cell.error) return cell;

    if (all !== undefined) {
      cell.cell.border = all;
    } else {
      if (top !== undefined) cell.cell.borderTop = top;
      if (bottom !== undefined) cell.cell.borderBottom = bottom;
      if (left !== undefined) cell.cell.borderLeft = left;
      if (right !== undefined) cell.cell.borderRight = right;
    }

    return { success: true, message: `Set cell (${row},${col}) borders` };
  }

  /**
   * Set cell width
   */
  set_cell_width({ elementIndex, row, col, width }) {
    this.checkpoint();

    const cell = this._ensureCellObject(elementIndex, row, col);
    if (cell.error) return cell;

    cell.cell.width = width;
    return { success: true, message: `Set cell (${row},${col}) width to ${width}` };
  }

  /**
   * Set multiple cell properties at once
   */
  set_cell_properties({ elementIndex, row, col, backgroundColor, textAlign, verticalAlign, width, padding, border }) {
    this.checkpoint();

    const cell = this._ensureCellObject(elementIndex, row, col);
    if (cell.error) return cell;

    if (backgroundColor !== undefined) cell.cell.backgroundColor = backgroundColor;
    if (textAlign !== undefined) cell.cell.textAlign = textAlign;
    if (verticalAlign !== undefined) cell.cell.verticalAlign = verticalAlign;
    if (width !== undefined) cell.cell.width = width;
    if (padding !== undefined) cell.cell.padding = padding;
    if (border !== undefined) cell.cell.border = border;

    return { success: true, message: `Set cell (${row},${col}) properties` };
  }

  // ==================== HEADER/TEXT TOOLS ====================

  /**
   * Set header text
   */
  set_header_text({ elementIndex, text }) {
    this.checkpoint();

    const element = this._getElement(elementIndex);
    if (!element) {
      return { success: false, error: `Element ${elementIndex} not found` };
    }

    if (element.type !== 'header') {
      return { success: false, error: `Element ${elementIndex} is not a header` };
    }

    element.text = text;
    return { success: true, message: `Set header ${elementIndex} text` };
  }

  /**
   * Set header styling
   */
  set_header_style({ elementIndex, backgroundColor, color, fontSize, padding }) {
    this.checkpoint();

    const element = this._getElement(elementIndex);
    if (!element) {
      return { success: false, error: `Element ${elementIndex} not found` };
    }

    if (element.type !== 'header') {
      return { success: false, error: `Element ${elementIndex} is not a header` };
    }

    element.customStyle = element.customStyle || {};
    if (backgroundColor !== undefined) element.customStyle.backgroundColor = backgroundColor;
    if (color !== undefined) element.customStyle.color = color;
    if (fontSize !== undefined) element.customStyle.fontSize = fontSize;
    if (padding !== undefined) element.customStyle.padding = padding;

    return { success: true, message: `Set header ${elementIndex} style` };
  }

  // ==================== TEXT FORMATTING TOOLS ====================

  /**
   * Set text formatting on a cell (bold, italic, underline, etc.)
   */
  set_text_format({ elementIndex, row, col, bold, italic, underline, strikethrough, fontSize, fontFamily, color }) {
    this.checkpoint();

    const result = this._ensureCellObject(elementIndex, row, col);
    if (result.error) return result;

    const cell = result.cell;

    // Font weight
    if (bold !== undefined) {
      cell.fontWeight = bold ? 'bold' : 'normal';
    }

    // Font style
    if (italic !== undefined) {
      cell.fontStyle = italic ? 'italic' : 'normal';
    }

    // Text decoration (underline and strikethrough)
    if (underline !== undefined || strikethrough !== undefined) {
      const decorations = [];

      // Check current or new underline state
      const hasUnderline = underline !== undefined ? underline :
        (cell.textDecoration && cell.textDecoration.includes('underline'));

      // Check current or new strikethrough state
      const hasStrikethrough = strikethrough !== undefined ? strikethrough :
        (cell.textDecoration && cell.textDecoration.includes('line-through'));

      if (hasUnderline) decorations.push('underline');
      if (hasStrikethrough) decorations.push('line-through');

      cell.textDecoration = decorations.length > 0 ? decorations.join(' ') : 'none';
    }

    // Font size
    if (fontSize !== undefined) {
      cell.fontSize = fontSize;
    }

    // Font family
    if (fontFamily !== undefined) {
      cell.fontFamily = fontFamily;
    }

    // Text color
    if (color !== undefined) {
      cell.color = color;
    }

    return { success: true, message: `Set text format on cell (${row},${col})` };
  }

  // ==================== LAYOUT TOOLS ====================

  /**
   * Set element margins
   */
  set_element_margin({ elementIndex, top, bottom, left, right }) {
    this.checkpoint();

    const element = this._getElement(elementIndex);
    if (!element) {
      return { success: false, error: `Element ${elementIndex} not found` };
    }

    element.customStyle = element.customStyle || {};
    if (top !== undefined) element.customStyle.marginTop = top;
    if (bottom !== undefined) element.customStyle.marginBottom = bottom;
    if (left !== undefined) element.customStyle.marginLeft = left;
    if (right !== undefined) element.customStyle.marginRight = right;

    return { success: true, message: `Set element ${elementIndex} margins` };
  }

  // ==================== HELPERS ====================

  /**
   * Validate structure consistency
   * Returns array of error messages (empty = valid)
   */
  validate() {
    const errors = [];

    for (const page of this.structure.pages) {
      for (let i = 0; i < page.elements.length; i++) {
        const el = page.elements[i];

        if (el.type === 'table' && el.rows) {
          const declaredCols = el.columns;

          for (let r = 0; r < el.rows.length; r++) {
            const rowCols = this._countRowCols(el.rows[r]);

            if (declaredCols && rowCols !== declaredCols) {
              errors.push(`Element ${i}, row ${r}: expected ${declaredCols} cols, got ${rowCols}`);
            }
          }
        }
      }
    }

    return errors;
  }

  /**
   * Count effective columns in a row (accounting for colspan)
   */
  _countRowCols(row) {
    return row.reduce((sum, cell) => {
      if (cell === null) return sum + 1;
      if (typeof cell === 'string') return sum + 1;
      if (typeof cell === 'object') return sum + (cell.colspan || 1);
      return sum + 1;
    }, 0);
  }

  /**
   * Get table element by index
   */
  _getTable(elementIndex) {
    const el = this.structure.pages[0]?.elements[elementIndex];
    if (!el || el.type !== 'table') return null;
    return el;
  }

  /**
   * Get any element by index
   */
  _getElement(elementIndex) {
    return this.structure.pages[0]?.elements[elementIndex] || null;
  }

  /**
   * Ensure a cell is an object (convert string to {text: string} if needed)
   * Returns { cell, table } or { error, success: false }
   */
  _ensureCellObject(elementIndex, row, col) {
    const table = this._getTable(elementIndex);
    if (!table) {
      return { success: false, error: `Element ${elementIndex} is not a table` };
    }

    if (row >= table.rows.length) {
      return { success: false, error: `Row ${row} out of bounds` };
    }

    if (col >= table.rows[row].length) {
      return { success: false, error: `Column ${col} out of bounds` };
    }

    let cell = table.rows[row][col];

    if (cell === null) {
      return { success: false, error: 'Cell is covered by a merged cell' };
    }

    // Convert string cell to object
    if (typeof cell === 'string') {
      cell = { text: cell };
      table.rows[row][col] = cell;
    } else if (typeof cell !== 'object') {
      cell = { text: String(cell) };
      table.rows[row][col] = cell;
    }

    return { cell, table };
  }

  /**
   * Undo last operation
   */
  undo() {
    if (this.history.length > 0) {
      this.structure = this.history.pop();
      return { success: true, message: 'Undone' };
    }
    return { success: false, message: 'Nothing to undo' };
  }

  /**
   * Get current structure
   */
  getStructure() {
    return this.structure;
  }

  /**
   * Get element by index (for inspection)
   */
  getElement(elementIndex) {
    return this.structure.pages[0]?.elements[elementIndex];
  }
}
