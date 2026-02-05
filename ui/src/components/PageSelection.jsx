import { useState } from 'react';
import {
  Image,
  Checkbox,
  Paper,
  Stack,
  TextInput,
  Textarea,
  Button,
  Text,
  ScrollArea,
  Group,
  Box,
  Select,
} from '@mantine/core';
import { IconArrowLeft } from '@tabler/icons-react';

// API base URL - use env var for local dev, empty for production (relative URLs)
const API_URL = import.meta.env.VITE_API_URL || '';

export default function PageSelection({ images, onStartExtraction, onBack }) {
  const [selectedPages, setSelectedPages] = useState(images.map((i) => i.page));
  const [previewPage, setPreviewPage] = useState(images[0]?.page || 1);
  const [docType, setDocType] = useState('');
  const [extraContext, setExtraContext] = useState('');
  const [selectedModel, setSelectedModel] = useState('gemini-2.5-pro');

  const togglePage = (page) => {
    setSelectedPages((prev) =>
      prev.includes(page) ? prev.filter((p) => p !== page) : [...prev, page].sort((a, b) => a - b)
    );
  };

  const handleSelectAll = () => {
    setSelectedPages(images.map((i) => i.page));
  };

  const handleClear = () => {
    setSelectedPages([]);
  };

  const handleProcess = () => {
    const context = [docType, extraContext].filter(Boolean).join('. ');
    onStartExtraction(selectedPages, context || undefined, selectedModel);
  };

  const previewImage = images.find((i) => i.page === previewPage);

  return (
    <Box style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <Group p="md" justify="space-between" style={{ borderBottom: '1px solid var(--mantine-color-dark-4)' }}>
        <Group gap="sm">
          <Button variant="subtle" size="sm" leftSection={<IconArrowLeft size={16} />} onClick={onBack}>
            Back
          </Button>
          <Text fw={500}>Select Pages to Process</Text>
        </Group>
        <Text size="sm" c="dimmed">
          {selectedPages.length} of {images.length} pages selected
        </Text>
      </Group>

      {/* Main content - use calc for explicit height */}
      <div style={{ display: 'flex', height: 'calc(100vh - 56px - 60px)', overflow: 'hidden' }}>
        {/* Column 1: Thumbnails */}
        <div
          style={{
            width: '200px',
            flexShrink: 0,
            borderRight: '1px solid var(--mantine-color-dark-4)',
            display: 'flex',
            flexDirection: 'column',
            height: '100%',
          }}
        >
          <ScrollArea style={{ flex: 1 }} p="sm">
            <Stack gap="xs">
              {images.map((img) => (
                <Paper
                  key={img.page}
                  p="xs"
                  withBorder
                  style={{
                    cursor: 'pointer',
                    borderColor:
                      previewPage === img.page
                        ? 'var(--mantine-color-blue-5)'
                        : 'var(--mantine-color-dark-4)',
                    borderWidth: previewPage === img.page ? 2 : 1,
                  }}
                  onClick={() => setPreviewPage(img.page)}
                >
                  <Group gap="xs" mb="xs">
                    <Checkbox
                      checked={selectedPages.includes(img.page)}
                      onChange={() => togglePage(img.page)}
                      onClick={(e) => e.stopPropagation()}
                      size="sm"
                    />
                    <Text size="xs" fw={500}>
                      Page {img.page}
                    </Text>
                  </Group>
                  <Image
                    src={`${API_URL}${img.url}`}
                    alt={`Page ${img.page}`}
                    h={120}
                    fit="contain"
                    style={{
                      opacity: selectedPages.includes(img.page) ? 1 : 0.4,
                      transition: 'opacity 0.2s',
                    }}
                  />
                </Paper>
              ))}
            </Stack>
          </ScrollArea>

          <Stack gap="xs" p="sm" style={{ borderTop: '1px solid var(--mantine-color-dark-4)' }}>
            <Button variant="light" size="xs" onClick={handleSelectAll} fullWidth>
              Select All
            </Button>
            <Button variant="light" size="xs" onClick={handleClear} fullWidth>
              Clear All
            </Button>
          </Stack>
        </div>

        {/* Column 2: Full Preview */}
        <div style={{ flex: 1, padding: '16px', height: '100%', overflow: 'hidden' }}>
          {previewImage && (
            <Paper
              withBorder
              p="md"
              style={{
                height: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: 'var(--mantine-color-dark-6)',
                overflow: 'hidden',
              }}
            >
              <img
                src={`${API_URL}${previewImage.url}`}
                alt={`Page ${previewPage}`}
                style={{
                  maxWidth: '100%',
                  maxHeight: '100%',
                  objectFit: 'contain',
                }}
              />
            </Paper>
          )}
        </div>

        {/* Column 3: Context & Actions */}
        <div
          style={{
            width: '300px',
            flexShrink: 0,
            borderLeft: '1px solid var(--mantine-color-dark-4)',
            display: 'flex',
            flexDirection: 'column',
            height: '100%',
          }}
        >
          <Stack gap="md" p="md" style={{ flex: 1 }}>
            <Text size="sm" fw={500}>
              Optional Context
            </Text>
            <TextInput
              label="Document type"
              placeholder="e.g., Bank loan agreement, Medical form"
              value={docType}
              onChange={(e) => setDocType(e.target.value)}
            />
            <Textarea
              label="Extra instructions"
              placeholder="e.g., Pay attention to signature blocks, Focus on the table in the middle"
              rows={4}
              value={extraContext}
              onChange={(e) => setExtraContext(e.target.value)}
            />

            <Text size="xs" c="dimmed">
              This context will be provided to the AI to help it better understand your document.
            </Text>

            <Select
              label="AI Model"
              value={selectedModel}
              onChange={setSelectedModel}
              data={[
                { value: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro (Stable)' },
                { value: 'gemini-3-pro-preview', label: 'Gemini 3.0 Preview (Experimental)' },
              ]}
            />
          </Stack>

          <Box p="md" style={{ borderTop: '1px solid var(--mantine-color-dark-4)' }}>
            <Button size="lg" onClick={handleProcess} disabled={selectedPages.length === 0} fullWidth>
              Process {selectedPages.length} page{selectedPages.length !== 1 ? 's' : ''}
            </Button>
          </Box>
        </div>
      </div>
    </Box>
  );
}
