import { Paper, Group, Text, Stack, Badge, useMantineTheme } from '@mantine/core';
import { IconArrowRight } from '@tabler/icons-react';

/**
 * DiffPreview Component
 *
 * Shows before/after HTML side by side with styled headers.
 */
export default function DiffPreview({ beforeHtml, afterHtml }) {
  const theme = useMantineTheme();

  return (
    <Group grow align="stretch" gap="md" style={{ height: '100%' }}>
      {/* Before pane */}
      <Paper
        radius="md"
        style={{
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          border: `1px solid ${theme.colors.red[9]}40`,
        }}
      >
        <Group
          p="sm"
          style={{
            backgroundColor: theme.colors.red[9] + '20',
            borderBottom: `1px solid ${theme.colors.red[9]}40`,
          }}
        >
          <Badge color="red" variant="light" size="sm">Before</Badge>
        </Group>
        <Paper
          p="md"
          style={{
            flex: 1,
            overflow: 'auto',
            backgroundColor: '#ffffff',
            borderRadius: 0,
          }}
        >
          <div
            style={{ fontSize: '11px' }}
            dangerouslySetInnerHTML={{ __html: beforeHtml }}
          />
        </Paper>
      </Paper>

      {/* After pane */}
      <Paper
        radius="md"
        style={{
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          border: `1px solid ${theme.colors.green[9]}40`,
        }}
      >
        <Group
          p="sm"
          style={{
            backgroundColor: theme.colors.green[9] + '20',
            borderBottom: `1px solid ${theme.colors.green[9]}40`,
          }}
        >
          <Badge color="green" variant="light" size="sm">After</Badge>
        </Group>
        <Paper
          p="md"
          style={{
            flex: 1,
            overflow: 'auto',
            backgroundColor: '#ffffff',
            borderRadius: 0,
          }}
        >
          <div
            style={{ fontSize: '11px' }}
            dangerouslySetInnerHTML={{ __html: afterHtml }}
          />
        </Paper>
      </Paper>
    </Group>
  );
}
