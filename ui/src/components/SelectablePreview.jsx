import { useEffect, useRef, useState } from 'react';
import { Paper, useMantineTheme } from '@mantine/core';

/**
 * SelectablePreview Component
 *
 * Renders HTML and allows clicking to select elements/cells.
 * - Single click on cell = select cell
 * - Shift+click = range selection (from last selected cell to this one)
 * - Double-click on table = select whole table
 */
export default function SelectablePreview({ html, selection, onSelect }) {
  const theme = useMantineTheme();
  const containerRef = useRef(null);
  const [lastCellClick, setLastCellClick] = useState(null); // For shift+click range

  useEffect(() => {
    if (!containerRef.current) return;

    const container = containerRef.current;

    // Clear previous selections
    container.querySelectorAll('.selected').forEach((el) => {
      el.classList.remove('selected');
    });

    // Apply current selection highlighting
    if (selection) {
      if (selection.type === 'element') {
        const el = container.querySelector(`[data-element-index="${selection.elementIndex}"]`);
        if (el) el.classList.add('selected');
      } else if (selection.type === 'cell') {
        // Highlight all cells in range
        const table = container.querySelector(`[data-element-index="${selection.elementIndex}"]`);
        if (table) {
          for (let r = selection.startRow; r <= selection.endRow; r++) {
            for (let c = selection.startCol; c <= selection.endCol; c++) {
              const cell = table.querySelector(`[data-row="${r}"][data-col="${c}"]`);
              if (cell) cell.classList.add('selected');
            }
          }
        }
      }
    }
  }, [selection, html]);

  const handleClick = (e) => {
    const cell = e.target.closest('.selectable-cell');
    const element = e.target.closest('.selectable');

    if (cell && element) {
      const row = parseInt(cell.dataset.row, 10);
      const col = parseInt(cell.dataset.col, 10);
      const elementIndex = parseInt(element.dataset.elementIndex, 10);

      // Shift+click = range selection
      if (e.shiftKey && lastCellClick && lastCellClick.elementIndex === elementIndex) {
        const startRow = Math.min(lastCellClick.row, row);
        const endRow = Math.max(lastCellClick.row, row);
        const startCol = Math.min(lastCellClick.col, col);
        const endCol = Math.max(lastCellClick.col, col);

        onSelect({
          type: 'cell',
          elementIndex,
          startRow,
          endRow,
          startCol,
          endCol,
        });
      } else {
        // Single cell selection
        setLastCellClick({ elementIndex, row, col });
        onSelect({
          type: 'cell',
          elementIndex,
          startRow: row,
          endRow: row,
          startCol: col,
          endCol: col,
        });
      }
    } else if (element) {
      // Element click (header, table, paragraph)
      const elementIndex = parseInt(element.dataset.elementIndex, 10);
      const elementType = element.dataset.elementType;

      setLastCellClick(null);
      onSelect({
        type: 'element',
        elementIndex,
        elementType,
      });
    }
  };

  const handleDoubleClick = (e) => {
    // Double-click on table = select whole table (not cell)
    const element = e.target.closest('.selectable');
    if (element && element.dataset.elementType === 'table') {
      const elementIndex = parseInt(element.dataset.elementIndex, 10);

      setLastCellClick(null);
      onSelect({
        type: 'element',
        elementIndex,
        elementType: 'table',
      });

      e.preventDefault();
    }
  };

  return (
    <Paper
      radius="md"
      p="lg"
      style={{
        backgroundColor: '#ffffff',
        minHeight: '100%',
        overflow: 'auto',
      }}
    >
      <style>{`
        .preview-inner .selectable {
          transition: all 0.15s ease;
          cursor: pointer;
          border-radius: 4px;
        }
        .preview-inner .selectable:hover {
          outline: 2px solid ${theme.colors.blue[5]};
          outline-offset: 2px;
          box-shadow: 0 0 12px ${theme.colors.blue[5]}40;
        }
        .preview-inner .selectable.selected {
          outline: 2px solid ${theme.colors.blue[6]};
          outline-offset: 2px;
          box-shadow: 0 0 20px ${theme.colors.blue[6]}60;
          background-color: ${theme.colors.blue[0]}20;
        }
        .preview-inner .selectable-cell {
          transition: all 0.1s ease;
          cursor: pointer;
        }
        .preview-inner .selectable-cell:hover {
          background-color: ${theme.colors.blue[1]} !important;
        }
        .preview-inner .selectable-cell.selected {
          background-color: ${theme.colors.blue[2]} !important;
          box-shadow: inset 0 0 0 2px ${theme.colors.blue[5]};
        }
        .preview-inner table {
          font-size: 11px;
        }
        .preview-inner td {
          padding: 4px 8px;
        }
      `}</style>
      <div
        ref={containerRef}
        className="preview-inner"
        onClick={handleClick}
        onDoubleClick={handleDoubleClick}
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </Paper>
  );
}
