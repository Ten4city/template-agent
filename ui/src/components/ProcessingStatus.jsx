import { useEffect, useState } from 'react';
import { Progress, Text, Stack, Loader, Center, Alert, Button } from '@mantine/core';
import { IconAlertCircle } from '@tabler/icons-react';

// API base URL - use env var for local dev, empty for production (relative URLs)
const API_URL = import.meta.env.VITE_API_URL || '';

export default function ProcessingStatus({ jobId, onComplete, onError, onRetry }) {
  const [status, setStatus] = useState({ status: 'extracting', progress: {} });
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;

    const poll = async () => {
      try {
        const res = await fetch(`${API_URL}/api/job/${jobId}`);
        if (!res.ok) {
          throw new Error('Failed to fetch job status');
        }

        const job = await res.json();
        if (cancelled) return;

        setStatus(job);

        if (job.status === 'complete') {
          onComplete(job.result);
        } else if (job.status === 'error') {
          setError(job.error);
          onError?.(job.error);
        } else {
          // Continue polling
          setTimeout(poll, 2000);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err.message);
          onError?.(err.message);
        }
      }
    };

    poll();

    return () => {
      cancelled = true;
    };
  }, [jobId, onComplete, onError]);

  const progressPercent =
    status.progress?.totalPages > 0
      ? (status.progress.currentPage / status.progress.totalPages) * 100
      : 0;

  if (error) {
    return (
      <Center style={{ height: '100%', minHeight: 400 }}>
        <Stack align="center" gap="lg" maw={400}>
          <Alert icon={<IconAlertCircle size={16} />} title="Extraction Failed" color="red">
            {error}
          </Alert>
          {onRetry && (
            <Button onClick={onRetry} variant="light">
              Try Again
            </Button>
          )}
        </Stack>
      </Center>
    );
  }

  return (
    <Center style={{ height: '100%', minHeight: 400 }}>
      <Stack align="center" gap="lg" maw={400} w="100%" p="md">
        <Loader size="xl" />
        <Text size="lg" fw={500}>
          {status.progress?.message || 'Extracting document structure...'}
        </Text>

        {status.progress?.totalPages > 0 && (
          <>
            <Progress value={progressPercent} size="xl" style={{ width: '100%' }} animated />
            <Text size="sm" c="dimmed">
              Page {status.progress.currentPage} of {status.progress.totalPages}
            </Text>
          </>
        )}

        <Text size="xs" c="dimmed" ta="center">
          The AI is analyzing each page to extract the document structure. This may take a minute per
          page.
        </Text>
      </Stack>
    </Center>
  );
}
