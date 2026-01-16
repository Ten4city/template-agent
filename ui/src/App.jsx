import { useState, useEffect } from 'react';
import {
  AppShell,
  Group,
  Title,
  Button,
  Alert,
  Box,
  useMantineTheme,
} from '@mantine/core';
import { IconRefresh, IconAlertCircle } from '@tabler/icons-react';
import SelectablePreview from './components/SelectablePreview';
import ChatPanel from './components/ChatPanel';
import DiffPreview from './components/DiffPreview';
import './App.css';

// API base URL - backend server
const API_URL = 'http://localhost:3001';

function App() {
  const theme = useMantineTheme();
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

  // Load initial structure
  useEffect(() => {
    loadStructure();
  }, []);

  const loadStructure = async () => {
    try {
      const res = await fetch(`${API_URL}/api/structure`);
      const data = await res.json();
      setStructure(data.structure);
      setHtml(data.html);
      setError(null);
      setMessages([]);
    } catch (err) {
      setError('Failed to load structure. Is the backend running?');
      console.error(err);
    }
  };

  const handleSelect = (newSelection) => {
    setSelection(newSelection);
    // Clear previous edit result when selecting new element
    setEditResult(null);
    setEditedStructure(null);
  };

  const handleExecute = async (prompt) => {
    if (!selection || !structure) return;

    // Add user message
    const userMessage = {
      id: Date.now(),
      type: 'user',
      content: prompt,
    };
    setMessages(prev => [...prev, userMessage]);

    setIsExecuting(true);
    setError(null);

    // Add thinking message
    const thinkingMessage = {
      id: Date.now() + 1,
      type: 'thinking',
      content: 'Processing your request...',
    };
    setMessages(prev => [...prev, thinkingMessage]);

    try {
      const res = await fetch(`${API_URL}/api/edit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          structure,
          selection,
          prompt,
        }),
      });

      const data = await res.json();

      // Remove thinking message
      setMessages(prev => prev.filter(m => m.id !== thinkingMessage.id));

      if (data.error) {
        setError(data.error);
        // Add error message
        setMessages(prev => [...prev, {
          id: Date.now(),
          type: 'error',
          content: data.error,
        }]);
        return;
      }

      // Add tool calls message
      if (data.toolsUsed && data.toolsUsed.length > 0) {
        setMessages(prev => [...prev, {
          id: Date.now(),
          type: 'tools',
          tools: data.toolsUsed,
        }]);
      }

      // Add summary message
      setMessages(prev => [...prev, {
        id: Date.now() + 1,
        type: 'summary',
        content: data.summary || 'Edit completed',
      }]);

      setEditResult({
        summary: data.summary,
        toolsUsed: data.toolsUsed,
      });
      setEditedStructure(data.editedStructure);
      setBeforeHtml(data.beforeHtml);
      setAfterHtml(data.afterHtml);
    } catch (err) {
      // Remove thinking message
      setMessages(prev => prev.filter(m => m.id !== thinkingMessage.id));

      setError('Edit failed: ' + err.message);
      setMessages(prev => [...prev, {
        id: Date.now(),
        type: 'error',
        content: 'Edit failed: ' + err.message,
      }]);
      console.error(err);
    } finally {
      setIsExecuting(false);
    }
  };

  const handleAccept = () => {
    // Apply the edited structure
    setStructure(editedStructure);
    setHtml(afterHtml);
    setEditResult(null);
    setEditedStructure(null);
    setSelection(null);

    // Add accepted message
    setMessages(prev => [...prev, {
      id: Date.now(),
      type: 'accepted',
      content: 'Changes applied',
    }]);
  };

  const handleReject = () => {
    // Discard changes
    setEditResult(null);
    setEditedStructure(null);

    // Add rejected message
    setMessages(prev => [...prev, {
      id: Date.now(),
      type: 'rejected',
      content: 'Changes discarded',
    }]);
  };

  return (
    <AppShell
      header={{ height: 56 }}
      aside={{ width: 400, breakpoint: 'sm' }}
      padding={0}
    >
      <AppShell.Header
        style={{
          backgroundColor: theme.colors.dark[8],
          borderBottom: `1px solid ${theme.colors.dark[5]}`,
        }}
      >
        <Group h="100%" px="md" justify="space-between">
          <Title order={4} c="white">Template Editor</Title>
          <Button
            variant="subtle"
            color="gray"
            size="sm"
            leftSection={<IconRefresh size={16} />}
            onClick={loadStructure}
          >
            Reload
          </Button>
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
          ) : (
            <SelectablePreview
              html={html}
              selection={selection}
              onSelect={handleSelect}
            />
          )}
        </Box>
      </AppShell.Main>

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
    </AppShell>
  );
}

export default App;
