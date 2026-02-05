import { useState, useEffect, useRef } from 'react';
import {
  AppShell,
  Group,
  Title,
  Button,
  Alert,
  Box,
  Menu,
  useMantineTheme,
} from '@mantine/core';
import { IconRefresh, IconAlertCircle, IconUpload, IconScan, IconDownload, IconCode, IconEdit } from '@tabler/icons-react';
import SelectablePreview from './components/SelectablePreview';
import CKEditorWrapper from './components/CKEditorWrapper';
import ChatPanel from './components/ChatPanel';
import DiffPreview from './components/DiffPreview';
import FileUpload from './components/FileUpload';
import PageSelection from './components/PageSelection';
import ProcessingStatus from './components/ProcessingStatus';
import './App.css';

// API base URL - use env var for local dev, empty for production (relative URLs)
const API_URL = import.meta.env.VITE_API_URL || '';

function App() {
  const theme = useMantineTheme();

  // App phase: 'upload' | 'pageSelect' | 'extracting' | 'editing'
  const [appPhase, setAppPhase] = useState('upload');

  // Upload/extraction state
  const [jobId, setJobId] = useState(null);
  const [pageImages, setPageImages] = useState([]);

  // Editor state
  const [structure, setStructure] = useState(null);
  const [html, setHtml] = useState('');
  const [selection, setSelection] = useState(null);
  const [isExecuting, setIsExecuting] = useState(false);
  const [editResult, setEditResult] = useState(null);
  const [editedStructure, setEditedStructure] = useState(null);
  const [beforeHtml, setBeforeHtml] = useState('');
  const [afterHtml, setAfterHtml] = useState('');
  const [error, setError] = useState(null);

  // Message history for chat UI
  const [messages, setMessages] = useState([]);

  // Field detection state
  const [isDetectingFields, setIsDetectingFields] = useState(false);

  // Editing mode: 'json' | 'ckeditor'
  const [editingMode, setEditingMode] = useState('json');
  const ckeditorRef = useRef(null);

  // Check if there's existing structure on load (for backward compatibility)
  useEffect(() => {
    checkExistingStructure();
  }, []);

  const checkExistingStructure = async () => {
    try {
      const res = await fetch(`${API_URL}/api/structure`);
      const data = await res.json();
      if (data.structure && data.html) {
        // There's existing structure, offer to load it or start fresh
        setStructure(data.structure);
        setHtml(data.html);
        // Stay on upload phase - user can choose to go to editor or upload new
      }
    } catch (err) {
      // No existing structure, that's fine
      console.log('No existing structure found');
    }
  };

  // Phase handlers
  const handleUploadComplete = (newJobId, images) => {
    setJobId(newJobId);
    setPageImages(images);
    setAppPhase('pageSelect');
  };

  const handleStartExtraction = async (selectedPages, context, model) => {
    try {
      const res = await fetch(`${API_URL}/api/extract`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobId, selectedPages, context, model }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to start extraction');
      }

      setAppPhase('extracting');
    } catch (err) {
      setError(err.message);
    }
  };

  const handleExtractionComplete = (result) => {
    setStructure(result.structure);
    setHtml(result.html);
    setError(null);
    setMessages([]);
    setAppPhase('editing');
  };

  const handleExtractionError = (errorMessage) => {
    setError(errorMessage);
  };

  const handleRetryExtraction = () => {
    setError(null);
    setAppPhase('pageSelect');
  };

  const handleBackToUpload = () => {
    setJobId(null);
    setPageImages([]);
    setError(null);
    setAppPhase('upload');
  };

  const handleNewUpload = () => {
    setJobId(null);
    setPageImages([]);
    setStructure(null);
    setHtml('');
    setSelection(null);
    setEditResult(null);
    setMessages([]);
    setError(null);
    setAppPhase('upload');
  };

  const handleGoToEditor = () => {
    if (structure && html) {
      setAppPhase('editing');
    }
  };

  // Field detection handler
  const handleDetectFields = async (pageNumber) => {
    if (!structure || !jobId) {
      setError('No document loaded for field detection');
      return;
    }

    setIsDetectingFields(true);
    setError(null);

    try {
      const res = await fetch(`${API_URL}/api/detect-fields`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jobId,
          pageNumber,
          structure,
        }),
      });

      const data = await res.json();

      if (data.error) {
        setError(data.error);
        return;
      }

      if (data.message) {
        // No fields detected
        setMessages((prev) => [
          ...prev,
          {
            id: Date.now(),
            type: 'summary',
            content: data.message,
          },
        ]);
        return;
      }

      // Update structure and HTML with detected fields
      setStructure(data.updatedStructure);
      setHtml(data.html);

      setMessages((prev) => [
        ...prev,
        {
          id: Date.now(),
          type: 'summary',
          content: `Detected ${data.fields.length} field(s) on page ${pageNumber}`,
        },
      ]);
    } catch (err) {
      setError('Field detection failed: ' + err.message);
    } finally {
      setIsDetectingFields(false);
    }
  };

  // Detect fields on all pages
  const handleDetectAllFields = async () => {
    if (!structure?.pages || structure.pages.length === 0) {
      setError('No pages to detect fields on');
      return;
    }

    for (const page of structure.pages) {
      await handleDetectFields(page.pageNumber);
    }
  };

  // Editor handlers
  const handleSelect = (newSelection) => {
    setSelection(newSelection);
    setEditResult(null);
    setEditedStructure(null);
  };

  const handleExecute = async (prompt) => {
    if (!selection || !structure) return;

    const userMessage = {
      id: Date.now(),
      type: 'user',
      content: prompt,
    };
    setMessages((prev) => [...prev, userMessage]);

    setIsExecuting(true);
    setError(null);

    const thinkingMessage = {
      id: Date.now() + 1,
      type: 'thinking',
      content: 'Processing your request...',
    };
    setMessages((prev) => [...prev, thinkingMessage]);

    try {
      const res = await fetch(`${API_URL}/api/edit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          structure,
          selection,
          prompt,
          jobId,
        }),
      });

      const data = await res.json();

      setMessages((prev) => prev.filter((m) => m.id !== thinkingMessage.id));

      if (data.error) {
        setError(data.error);
        setMessages((prev) => [
          ...prev,
          {
            id: Date.now(),
            type: 'error',
            content: data.error,
          },
        ]);
        return;
      }

      if (data.toolsUsed && data.toolsUsed.length > 0) {
        setMessages((prev) => [
          ...prev,
          {
            id: Date.now(),
            type: 'tools',
            tools: data.toolsUsed,
          },
        ]);
      }

      setMessages((prev) => [
        ...prev,
        {
          id: Date.now() + 1,
          type: 'summary',
          content: data.summary || 'Edit completed',
        },
      ]);

      setEditResult({
        summary: data.summary,
        toolsUsed: data.toolsUsed,
      });
      setEditedStructure(data.editedStructure);
      setBeforeHtml(data.beforeHtml);
      setAfterHtml(data.afterHtml);
    } catch (err) {
      setMessages((prev) => prev.filter((m) => m.id !== thinkingMessage.id));

      setError('Edit failed: ' + err.message);
      setMessages((prev) => [
        ...prev,
        {
          id: Date.now(),
          type: 'error',
          content: 'Edit failed: ' + err.message,
        },
      ]);
      console.error(err);
    } finally {
      setIsExecuting(false);
    }
  };

  const handleAccept = () => {
    setStructure(editedStructure);
    setHtml(afterHtml);
    setEditResult(null);
    setEditedStructure(null);
    setSelection(null);

    setMessages((prev) => [
      ...prev,
      {
        id: Date.now(),
        type: 'accepted',
        content: 'Changes applied',
      },
    ]);
  };

  const handleReject = () => {
    setEditResult(null);
    setEditedStructure(null);

    setMessages((prev) => [
      ...prev,
      {
        id: Date.now(),
        type: 'rejected',
        content: 'Changes discarded',
      },
    ]);
  };

  // Download HTML
  const handleDownloadHtml = () => {
    if (!html) return;
    const fullHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Extracted Document</title>
  <style>
    body { font-family: Arial, sans-serif; font-size: 11px; padding: 20px; }
    table { border-collapse: collapse; width: 100%; margin-bottom: 16px; }
    td { padding: 4px 8px; vertical-align: top; }
  </style>
</head>
<body>
${html}
</body>
</html>`;
    const blob = new Blob([fullHtml], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'extracted-document.html';
    a.click();
    URL.revokeObjectURL(url);
  };

  // Render upload phase (with optional shortcut to existing structure)
  if (appPhase === 'upload') {
    return (
      <AppShell header={{ height: 56 }} padding={0}>
        <AppShell.Header
          style={{
            backgroundColor: theme.colors.dark[8],
            borderBottom: `1px solid ${theme.colors.dark[5]}`,
          }}
        >
          <Group h="100%" px="md" justify="space-between">
            <Title order={4} c="white">
              Template Editor
            </Title>
            {structure && (
              <Button
                variant="subtle"
                color="gray"
                size="sm"
                onClick={handleGoToEditor}
              >
                Continue Editing
              </Button>
            )}
          </Group>
        </AppShell.Header>

        <AppShell.Main
          style={{
            backgroundColor: theme.colors.dark[7],
            height: 'calc(100vh - 56px)',
            overflow: 'auto',
          }}
        >
          <FileUpload onComplete={handleUploadComplete} />
        </AppShell.Main>
      </AppShell>
    );
  }

  // Render page selection phase
  if (appPhase === 'pageSelect') {
    return (
      <AppShell header={{ height: 56 }} padding={0}>
        <AppShell.Header
          style={{
            backgroundColor: theme.colors.dark[8],
            borderBottom: `1px solid ${theme.colors.dark[5]}`,
          }}
        >
          <Group h="100%" px="md" justify="space-between">
            <Title order={4} c="white">
              Template Editor
            </Title>
          </Group>
        </AppShell.Header>

        <AppShell.Main
          style={{
            backgroundColor: theme.colors.dark[7],
            height: 'calc(100vh - 56px)',
            overflow: 'hidden',
          }}
        >
          {error && (
            <Alert
              icon={<IconAlertCircle size={16} />}
              title="Error"
              color="red"
              variant="filled"
              m="md"
              withCloseButton
              onClose={() => setError(null)}
            >
              {error}
            </Alert>
          )}
          <PageSelection
            images={pageImages}
            onStartExtraction={handleStartExtraction}
            onBack={handleBackToUpload}
          />
        </AppShell.Main>
      </AppShell>
    );
  }

  // Render extraction phase
  if (appPhase === 'extracting') {
    return (
      <AppShell header={{ height: 56 }} padding={0}>
        <AppShell.Header
          style={{
            backgroundColor: theme.colors.dark[8],
            borderBottom: `1px solid ${theme.colors.dark[5]}`,
          }}
        >
          <Group h="100%" px="md" justify="space-between">
            <Title order={4} c="white">
              Template Editor
            </Title>
          </Group>
        </AppShell.Header>

        <AppShell.Main
          style={{
            backgroundColor: theme.colors.dark[7],
            height: 'calc(100vh - 56px)',
            overflow: 'auto',
          }}
        >
          <ProcessingStatus
            jobId={jobId}
            onComplete={handleExtractionComplete}
            onError={handleExtractionError}
            onRetry={handleRetryExtraction}
          />
        </AppShell.Main>
      </AppShell>
    );
  }

  // Render editing phase (existing editor UI)
  return (
    <AppShell
      header={{ height: 56 }}
      aside={editingMode === 'json' ? { width: 400, breakpoint: 'sm' } : undefined}
      padding={0}
    >
      <AppShell.Header
        style={{
          backgroundColor: theme.colors.dark[8],
          borderBottom: `1px solid ${theme.colors.dark[5]}`,
        }}
      >
        <Group h="100%" px="md" justify="space-between">
          <Title order={4} c="white">
            Template Editor
          </Title>
          <Group gap="sm">
            {/* Field detection dropdown */}
            {structure?.pages?.length > 0 && (
              <Menu>
                <Menu.Target>
                  <Button
                    variant="light"
                    color="blue"
                    size="sm"
                    leftSection={<IconScan size={16} />}
                    loading={isDetectingFields}
                    disabled={isDetectingFields || !jobId}
                  >
                    Detect Fields
                  </Button>
                </Menu.Target>
                <Menu.Dropdown>
                  <Menu.Item onClick={handleDetectAllFields}>
                    All Pages ({structure.pages.length})
                  </Menu.Item>
                  <Menu.Divider />
                  {structure.pages.map((page) => (
                    <Menu.Item
                      key={page.pageNumber}
                      onClick={() => handleDetectFields(page.pageNumber)}
                    >
                      Page {page.pageNumber}
                    </Menu.Item>
                  ))}
                </Menu.Dropdown>
              </Menu>
            )}
            {editingMode === 'json' ? (
              <Button
                variant="light"
                color="violet"
                size="sm"
                leftSection={<IconEdit size={16} />}
                onClick={() => setEditingMode('ckeditor')}
              >
                Edit in CKEditor
              </Button>
            ) : (
              <Button
                variant="light"
                color="violet"
                size="sm"
                leftSection={<IconCode size={16} />}
                onClick={() => setEditingMode('json')}
              >
                Back to JSON Mode
              </Button>
            )}
            <Button
              variant="subtle"
              color="gray"
              size="sm"
              leftSection={<IconUpload size={16} />}
              onClick={handleNewUpload}
            >
              New Document
            </Button>
            <Button
              variant="subtle"
              color="gray"
              size="sm"
              leftSection={<IconRefresh size={16} />}
              onClick={checkExistingStructure}
            >
              Reload
            </Button>
            <Button
              variant="subtle"
              color="blue"
              size="sm"
              leftSection={<IconDownload size={16} />}
              onClick={handleDownloadHtml}
              disabled={!html}
            >
              Download HTML
            </Button>
          </Group>
        </Group>
      </AppShell.Header>

      <AppShell.Main
        style={{
          backgroundColor: theme.colors.dark[7],
          height: 'calc(100vh - 56px)',
          overflow: 'auto',
        }}
      >
        {error && (
          <Alert
            icon={<IconAlertCircle size={16} />}
            title="Error"
            color="red"
            variant="filled"
            m="md"
            withCloseButton
            onClose={() => setError(null)}
          >
            {error}
          </Alert>
        )}

        <Box p="md" style={{ height: '100%' }}>
          {editResult ? (
            <DiffPreview beforeHtml={beforeHtml} afterHtml={afterHtml} />
          ) : editingMode === 'ckeditor' ? (
            <CKEditorWrapper
              key="ckeditor-instance"
              html={html}
              onHtmlChange={setHtml}
              editorRef={ckeditorRef}
            />
          ) : (
            <SelectablePreview
              html={html}
              selection={selection}
              onSelect={handleSelect}
            />
          )}
        </Box>
      </AppShell.Main>

      {editingMode === 'json' && (
        <AppShell.Aside
          style={{
            backgroundColor: theme.colors.dark[8],
            borderLeft: `1px solid ${theme.colors.dark[5]}`,
          }}
        >
          <ChatPanel
            selection={selection}
            messages={messages}
            onExecute={handleExecute}
            isExecuting={isExecuting}
            hasResult={!!editResult}
            onAccept={handleAccept}
            onReject={handleReject}
          />
        </AppShell.Aside>
      )}
    </AppShell>
  );
}

export default App;
