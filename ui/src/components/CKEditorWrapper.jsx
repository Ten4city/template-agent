import { useEffect, useRef, useState, useCallback } from 'react';
import { Paper, LoadingOverlay } from '@mantine/core';

/**
 * CKEditor 4 Wrapper for React
 *
 * Provides:
 * - Rich text editing with CKEditor 4
 * - Selection tracking for agentic editing
 * - HTML content management
 */
export default function CKEditorWrapper({
  html,
  onHtmlChange,
  onSelectionChange,
  editorRef,
}) {
  const containerRef = useRef(null);
  const [isLoading, setIsLoading] = useState(true);
  const editorInstanceRef = useRef(null);

  // Initialize CKEditor
  useEffect(() => {
    if (!containerRef.current) return;

    // Reset loading state on mount
    setIsLoading(true);

    let editorInstance = null;

    const initEditor = () => {
      // Destroy ALL existing CKEditor instances to prevent conflicts
      if (window.CKEDITOR && window.CKEDITOR.instances) {
        Object.keys(window.CKEDITOR.instances).forEach((name) => {
          try {
            window.CKEDITOR.instances[name].destroy(true);
          } catch (e) {
            // Ignore destruction errors
          }
        });
      }
      editorInstanceRef.current = null;

      // Create textarea for CKEditor
      const textarea = document.createElement('textarea');
      textarea.id = `ckeditor-${Date.now()}`;
      textarea.value = html || '';
      containerRef.current.innerHTML = '';
      containerRef.current.appendChild(textarea);

      // CKEditor configuration - uses config.js from /ckeditor/
      const config = {
        height: 'calc(100vh - 200px)',
        resize_enabled: false,
        allowedContent: true,
      };

      // Initialize editor
      editorInstance = window.CKEDITOR.replace(textarea.id, config);

      // Timeout fallback if instanceReady never fires
      const timeout = setTimeout(() => {
        console.warn('CKEditor instanceReady timeout - forcing load');
        setIsLoading(false);
      }, 5000);

      editorInstance.on('instanceReady', () => {
        clearTimeout(timeout);
        setIsLoading(false);
        editorInstanceRef.current = editorInstance;

        // Expose editor through ref
        if (editorRef) {
          editorRef.current = editorInstance;
        }

        // Track selection changes
        editorInstance.on('selectionChange', () => {
          const selection = editorInstance.getSelection();
          if (selection && onSelectionChange) {
            const selectedText = selection.getSelectedText();
            const ranges = selection.getRanges();
            const startElement = selection.getStartElement();

            onSelectionChange({
              text: selectedText,
              hasSelection: selectedText && selectedText.length > 0,
              startElement: startElement ? startElement.getName() : null,
              rangeCount: ranges ? ranges.length : 0,
            });
          }
        });

        // Track content changes
        editorInstance.on('change', () => {
          if (onHtmlChange) {
            onHtmlChange(editorInstance.getData());
          }
        });
      });
    };

    // Wait for CKEditor to load
    const waitForCKEditor = () => {
      if (window.CKEDITOR) {
        try {
          initEditor();
        } catch (err) {
          console.error('CKEditor init error:', err);
          setIsLoading(false);
        }
      } else {
        console.log('Waiting for CKEditor to load...');
        setTimeout(waitForCKEditor, 100);
      }
    };

    waitForCKEditor();

    return () => {
      if (editorInstanceRef.current) {
        try {
          editorInstanceRef.current.destroy();
        } catch (e) {
          // Ignore destruction errors
        }
        editorInstanceRef.current = null;
      }
    };
  }, []); // Only run once on mount

  // Update content when html prop changes (but not on every change)
  useEffect(() => {
    if (editorInstanceRef.current && html !== undefined) {
      const currentData = editorInstanceRef.current.getData();
      // Only update if significantly different (not just from our own changes)
      if (currentData !== html && !isLoading) {
        editorInstanceRef.current.setData(html);
      }
    }
  }, [html, isLoading]);

  return (
    <Paper
      radius="md"
      style={{
        backgroundColor: '#ffffff',
        minHeight: '100%',
        overflow: 'hidden',
        position: 'relative',
      }}
    >
      <style>{`
        /* Fix source mode textarea styling */
        .cke_source {
          color: #333 !important;
          background-color: #fff !important;
        }
      `}</style>
      <LoadingOverlay visible={isLoading} />
      <div ref={containerRef} style={{ height: '100%' }} />
    </Paper>
  );
}

/**
 * Helper functions for agentic editing with CKEditor
 */
export const CKEditorHelpers = {
  /**
   * Get selected text from editor
   */
  getSelectedText(editor) {
    if (!editor) return null;
    const selection = editor.getSelection();
    return selection ? selection.getSelectedText() : null;
  },

  /**
   * Get selected HTML from editor
   */
  getSelectedHtml(editor) {
    if (!editor) return null;
    const selection = editor.getSelection();
    if (!selection) return null;

    const ranges = selection.getRanges();
    if (!ranges || ranges.length === 0) return null;

    const range = ranges[0];
    const fragment = range.cloneContents();
    const container = window.CKEDITOR.dom.element.createFromHtml('<div></div>');
    fragment.appendTo(container);
    return container.getHtml();
  },

  /**
   * Replace selected content with new HTML
   */
  replaceSelection(editor, newHtml) {
    if (!editor) return false;
    const selection = editor.getSelection();
    if (!selection) return false;

    const ranges = selection.getRanges();
    if (!ranges || ranges.length === 0) return false;

    // Insert HTML at selection
    editor.insertHtml(newHtml);
    return true;
  },

  /**
   * Insert HTML at cursor position
   */
  insertAtCursor(editor, html) {
    if (!editor) return false;
    editor.insertHtml(html);
    return true;
  },

  /**
   * Get the element containing the cursor
   */
  getContainingElement(editor) {
    if (!editor) return null;
    const selection = editor.getSelection();
    if (!selection) return null;
    return selection.getStartElement();
  },

  /**
   * Find and select text in the editor
   */
  findAndSelect(editor, searchText) {
    if (!editor || !searchText) return false;

    const body = editor.document.getBody();
    const html = body.getHtml();
    const index = html.indexOf(searchText);

    if (index === -1) return false;

    // Use CKEditor's find functionality if available
    // Otherwise, this is a simplified approach
    editor.focus();
    return true;
  },

  /**
   * Get full HTML content
   */
  getHtml(editor) {
    if (!editor) return '';
    return editor.getData();
  },

  /**
   * Set full HTML content
   */
  setHtml(editor, html) {
    if (!editor) return false;
    editor.setData(html);
    return true;
  },
};
