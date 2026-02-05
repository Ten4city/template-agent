import { useState } from 'react';
import { Dropzone } from '@mantine/dropzone';
import { Stack, Text, Loader, Alert, Center } from '@mantine/core';
import { IconUpload, IconFile, IconX, IconAlertCircle } from '@tabler/icons-react';

// API base URL - use env var for local dev, empty for production (relative URLs)
const API_URL = import.meta.env.VITE_API_URL || '';

export default function FileUpload({ onComplete }) {
  const [isConverting, setIsConverting] = useState(false);
  const [error, setError] = useState(null);

  const handleDrop = async (files) => {
    const file = files[0];
    if (!file) return;

    setIsConverting(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append('file', file);

      const res = await fetch(`${API_URL}/api/convert`, {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Conversion failed');
      }

      const { jobId, images } = await res.json();
      onComplete(jobId, images);
    } catch (err) {
      setError(err.message);
      setIsConverting(false);
    }
  };

  const handleReject = (files) => {
    const file = files[0];
    if (file?.errors?.[0]?.message) {
      setError(file.errors[0].message);
    } else {
      setError('Invalid file type. Please upload a DOCX or PDF file.');
    }
  };

  if (isConverting) {
    return (
      <Center style={{ height: '100%', minHeight: 400 }}>
        <Stack align="center" gap="md">
          <Loader size="xl" />
          <Text size="lg">Converting document to images...</Text>
          <Text size="sm" c="dimmed">This may take a moment for large documents</Text>
        </Stack>
      </Center>
    );
  }

  return (
    <Stack gap="md" p="md" style={{ height: '100%' }}>
      {error && (
        <Alert
          icon={<IconAlertCircle size={16} />}
          title="Error"
          color="red"
          withCloseButton
          onClose={() => setError(null)}
        >
          {error}
        </Alert>
      )}

      <Dropzone
        onDrop={handleDrop}
        onReject={handleReject}
        accept={{
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
          'application/pdf': ['.pdf'],
        }}
        maxSize={50 * 1024 * 1024}
        multiple={false}
        style={{ height: 'calc(100% - 60px)', minHeight: 300 }}
      >
        <Center style={{ height: '100%', pointerEvents: 'none' }}>
          <Stack align="center" gap="lg">
            <Dropzone.Accept>
              <IconUpload size={60} stroke={1.5} color="var(--mantine-color-blue-6)" />
            </Dropzone.Accept>
            <Dropzone.Reject>
              <IconX size={60} stroke={1.5} color="var(--mantine-color-red-6)" />
            </Dropzone.Reject>
            <Dropzone.Idle>
              <IconFile size={60} stroke={1.5} color="var(--mantine-color-dimmed)" />
            </Dropzone.Idle>

            <Stack align="center" gap="xs">
              <Text size="xl" fw={500}>
                Drop DOCX or PDF here
              </Text>
              <Text size="sm" c="dimmed">
                or click to select a file
              </Text>
              <Text size="xs" c="dimmed">
                Maximum file size: 50MB
              </Text>
            </Stack>
          </Stack>
        </Center>
      </Dropzone>
    </Stack>
  );
}
