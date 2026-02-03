import { useState, useRef, useEffect } from 'react';
import {
  Stack,
  Group,
  Text,
  TextInput,
  Button,
  Paper,
  ScrollArea,
  Badge,
  Code,
  Loader,
  ActionIcon,
  Box,
  Divider,
  useMantineTheme,
} from '@mantine/core';
import {
  IconSend,
  IconCheck,
  IconX,
  IconTool,
  IconUser,
  IconRobot,
  IconAlertTriangle,
  IconMapPin,
} from '@tabler/icons-react';

/**
 * ChatPanel - Chat-style interface for editing
 */
export default function ChatPanel({
  selection,
  messages,
  onExecute,
  isExecuting,
  hasResult,
  onAccept,
  onReject,
  editingMode = 'json',
}) {
  const theme = useMantineTheme();
  const [prompt, setPrompt] = useState('');
  const scrollRef = useRef(null);
  const inputRef = useRef(null);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
    }
  }, [messages]);

  // Focus input when selection changes
  useEffect(() => {
    if (selection && inputRef.current) {
      inputRef.current.focus();
    }
  }, [selection]);

  const handleSubmit = (e) => {
    e?.preventDefault();
    if (prompt.trim() && hasValidSelection() && !isExecuting) {
      onExecute(prompt.trim());
      setPrompt('');
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      handleSubmit();
    }
  };

  const getSelectionText = () => {
    if (!selection) return null;

    // CKEditor mode - text-based selection
    if (editingMode === 'ckeditor') {
      if (selection.hasSelection && selection.text) {
        const truncated = selection.text.length > 50
          ? selection.text.substring(0, 50) + '...'
          : selection.text;
        return `"${truncated}"`;
      }
      return 'Select text in editor';
    }

    // JSON mode - element/cell selection
    if (selection.type === 'element') {
      return `${selection.elementType} (element ${selection.elementIndex})`;
    }

    if (selection.type === 'cell') {
      return `Cell (${selection.startRow}, ${selection.startCol}) in table ${selection.elementIndex}`;
    }

    return 'Selection active';
  };

  // Determine if selection is valid for editing
  const hasValidSelection = () => {
    if (editingMode === 'ckeditor') {
      return selection?.hasSelection && selection?.text?.length > 0;
    }
    return !!selection;
  };

  const renderMessage = (msg) => {
    switch (msg.type) {
      case 'user':
        return (
          <Group key={msg.id} justify="flex-end" mb="xs">
            <Paper
              p="sm"
              radius="lg"
              style={{
                backgroundColor: theme.colors.blue[8],
                maxWidth: '85%',
              }}
            >
              <Text size="sm" c="white">{msg.content}</Text>
            </Paper>
          </Group>
        );

      case 'thinking':
        return (
          <Group key={msg.id} gap="xs" mb="xs">
            <Loader size="xs" color="dimmed" />
            <Text size="sm" c="dimmed" fs="italic">{msg.content}</Text>
          </Group>
        );

      case 'tools':
        return (
          <Paper
            key={msg.id}
            p="sm"
            radius="md"
            mb="xs"
            style={{
              backgroundColor: theme.colors.dark[6],
              borderLeft: `3px solid ${theme.colors.violet[6]}`,
            }}
          >
            <Group gap="xs" mb="xs">
              <IconTool size={14} color={theme.colors.violet[4]} />
              <Text size="xs" c="dimmed" fw={500}>Tools executed</Text>
            </Group>
            <Group gap="xs">
              {msg.tools.map((tool, i) => (
                <Badge
                  key={i}
                  variant="light"
                  color="violet"
                  size="sm"
                  style={{ fontFamily: 'monospace' }}
                >
                  {tool}
                </Badge>
              ))}
            </Group>
          </Paper>
        );

      case 'summary':
        return (
          <Paper
            key={msg.id}
            p="sm"
            radius="md"
            mb="xs"
            style={{
              backgroundColor: theme.colors.dark[6],
              borderLeft: `3px solid ${theme.colors.green[6]}`,
            }}
          >
            <Group gap="xs">
              <IconCheck size={16} color={theme.colors.green[4]} />
              <Text size="sm" c="white">{msg.content}</Text>
            </Group>
          </Paper>
        );

      case 'error':
        return (
          <Paper
            key={msg.id}
            p="sm"
            radius="md"
            mb="xs"
            style={{
              backgroundColor: theme.colors.dark[6],
              borderLeft: `3px solid ${theme.colors.red[6]}`,
            }}
          >
            <Group gap="xs">
              <IconAlertTriangle size={16} color={theme.colors.red[4]} />
              <Text size="sm" c="red.4">{msg.content}</Text>
            </Group>
          </Paper>
        );

      case 'accepted':
        return (
          <Group key={msg.id} gap="xs" mb="xs" justify="center">
            <Badge color="green" variant="light" leftSection={<IconCheck size={12} />}>
              {msg.content}
            </Badge>
          </Group>
        );

      case 'rejected':
        return (
          <Group key={msg.id} gap="xs" mb="xs" justify="center">
            <Badge color="gray" variant="light" leftSection={<IconX size={12} />}>
              {msg.content}
            </Badge>
          </Group>
        );

      default:
        return null;
    }
  };

  return (
    <Stack h="100%" gap={0}>
      {/* Selection context header */}
      <Box
        p="md"
        style={{
          borderBottom: `1px solid ${theme.colors.dark[5]}`,
          backgroundColor: theme.colors.dark[7],
        }}
      >
        <Group gap="xs">
          <IconMapPin size={16} color={hasValidSelection() ? theme.colors.blue[4] : theme.colors.dark[4]} />
          <Text size="sm" c={hasValidSelection() ? 'white' : 'dimmed'}>
            {hasValidSelection()
              ? getSelectionText()
              : editingMode === 'ckeditor'
                ? 'Select text in editor'
                : 'Click an element to select'}
          </Text>
        </Group>
      </Box>

      {/* Messages area */}
      <ScrollArea
        flex={1}
        p="md"
        viewportRef={scrollRef}
        style={{ backgroundColor: theme.colors.dark[8] }}
      >
        {messages.length === 0 ? (
          <Stack align="center" justify="center" h="100%" gap="xs">
            <IconRobot size={48} color={theme.colors.dark[4]} />
            <Text size="sm" c="dimmed" ta="center">
              Select an element and describe<br />what you want to change
            </Text>
          </Stack>
        ) : (
          messages.map(renderMessage)
        )}
      </ScrollArea>

      {/* Accept/Reject buttons when there's a result */}
      {hasResult && (
        <Box
          p="md"
          style={{
            borderTop: `1px solid ${theme.colors.dark[5]}`,
            backgroundColor: theme.colors.dark[7],
          }}
        >
          <Text size="xs" c="dimmed" mb="xs" ta="center">Review changes in preview</Text>
          <Group grow>
            <Button
              color="green"
              leftSection={<IconCheck size={16} />}
              onClick={onAccept}
            >
              Accept
            </Button>
            <Button
              variant="default"
              leftSection={<IconX size={16} />}
              onClick={onReject}
            >
              Reject
            </Button>
          </Group>
        </Box>
      )}

      {/* Input area */}
      <Box
        p="md"
        style={{
          borderTop: `1px solid ${theme.colors.dark[5]}`,
          backgroundColor: theme.colors.dark[7],
        }}
      >
        <form onSubmit={handleSubmit}>
          <TextInput
            ref={inputRef}
            placeholder={
              hasValidSelection()
                ? "Describe your edit..."
                : editingMode === 'ckeditor'
                  ? "Select text in editor first"
                  : "Select an element first"
            }
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={!hasValidSelection() || isExecuting || hasResult}
            rightSection={
              <ActionIcon
                variant="filled"
                color="blue"
                size="sm"
                onClick={handleSubmit}
                disabled={!hasValidSelection() || !prompt.trim() || isExecuting || hasResult}
              >
                {isExecuting ? <Loader size="xs" color="white" /> : <IconSend size={14} />}
              </ActionIcon>
            }
            styles={{
              input: {
                backgroundColor: theme.colors.dark[6],
                borderColor: theme.colors.dark[4],
                '&:focus': {
                  borderColor: theme.colors.blue[6],
                },
              },
            }}
          />
          <Text size="xs" c="dimmed" mt="xs" ta="center">
            Press <Code size="xs">Cmd+Enter</Code> to send
          </Text>
        </form>
      </Box>
    </Stack>
  );
}
