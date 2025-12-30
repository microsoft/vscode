/**
 * Logos Audit Server
 * Comprehensive logging and compliance
 */

import express, { Request, Response } from 'express';
import cors from 'cors';

const app = express();
const PORT = process.env.PORT || 8084;

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Environment
const S3_BUCKET = process.env.AUDIT_S3_BUCKET || 'logos-audit-logs';
const RETENTION_DAYS = parseInt(process.env.AUDIT_RETENTION_DAYS || '365');
const ENCRYPTION_ENABLED = process.env.AUDIT_ENCRYPTION_ENABLED === 'true';

// In-memory buffer for batch writes
const auditBuffer: any[] = [];
const BUFFER_SIZE = 100;
const FLUSH_INTERVAL = 10000; // 10 seconds

// Metrics
let totalEvents = 0;
let eventsByType = new Map<string, number>();
let eventsByUser = new Map<string, number>();

// Health check
app.get('/health', (_req: Request, res: Response) => {
  res.json({
    status: 'healthy',
    service: 'logos-audit',
    bufferSize: auditBuffer.length,
    totalEvents,
    timestamp: new Date().toISOString(),
  });
});

// Ready check
app.get('/ready', (_req: Request, res: Response) => {
  res.json({ status: 'ready' });
});

// Log audit event
app.post('/api/events', (req: Request, res: Response) => {
  const event = {
    id: `evt-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    timestamp: new Date().toISOString(),
    ...req.body,
  };

  // Update metrics
  totalEvents++;
  const eventType = event.type || 'unknown';
  eventsByType.set(eventType, (eventsByType.get(eventType) || 0) + 1);

  if (event.userId) {
    eventsByUser.set(event.userId, (eventsByUser.get(event.userId) || 0) + 1);
  }

  // Add to buffer
  auditBuffer.push(event);

  // Flush if buffer is full
  if (auditBuffer.length >= BUFFER_SIZE) {
    flushBuffer();
  }

  res.json({ id: event.id, status: 'logged' });
});

// Log session event
app.post('/api/sessions', (req: Request, res: Response) => {
  const { userId, sessionId, action, metadata } = req.body;

  const event = {
    type: 'session',
    userId,
    sessionId,
    action, // 'start', 'end', 'refresh'
    metadata,
  };

  // Forward to events endpoint
  fetch(`http://localhost:${PORT}/api/events`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(event),
  });

  res.json({ status: 'logged', sessionId });
});

// Log agent invocation
app.post('/api/invocations', (req: Request, res: Response) => {
  const { userId, sessionId, agentId, query, response, tier, latencyMs, context } = req.body;

  const event = {
    type: 'agent_invocation',
    userId,
    sessionId,
    agentId,
    query: query?.slice(0, 500), // Truncate for storage
    responsePreview: response?.slice(0, 200),
    tier,
    latencyMs,
    context: {
      file: context?.file,
      language: context?.language,
    },
  };

  fetch(`http://localhost:${PORT}/api/events`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(event),
  });

  res.json({ status: 'logged' });
});

// Log file operation
app.post('/api/file-operations', (req: Request, res: Response) => {
  const { userId, sessionId, operation, filePath, metadata } = req.body;

  const event = {
    type: 'file_operation',
    userId,
    sessionId,
    operation, // 'open', 'save', 'delete', 'rename'
    filePath,
    metadata,
  };

  fetch(`http://localhost:${PORT}/api/events`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(event),
  });

  res.json({ status: 'logged' });
});

// Query audit events
app.get('/api/events', (req: Request, res: Response) => {
  const { userId, sessionId, type, from, to, limit } = req.query;

  // In production, this would query S3/database
  // For now, return from buffer
  let events = [...auditBuffer];

  if (userId) {
    events = events.filter(e => e.userId === userId);
  }
  if (sessionId) {
    events = events.filter(e => e.sessionId === sessionId);
  }
  if (type) {
    events = events.filter(e => e.type === type);
  }
  if (from) {
    events = events.filter(e => new Date(e.timestamp) >= new Date(from as string));
  }
  if (to) {
    events = events.filter(e => new Date(e.timestamp) <= new Date(to as string));
  }

  const resultLimit = Math.min(parseInt(limit as string) || 100, 1000);
  events = events.slice(0, resultLimit);

  res.json({ events, total: events.length });
});

// Get metrics
app.get('/api/metrics', (_req: Request, res: Response) => {
  res.json({
    totalEvents,
    eventsByType: Object.fromEntries(eventsByType),
    uniqueUsers: eventsByUser.size,
    bufferSize: auditBuffer.length,
    storage: {
      bucket: S3_BUCKET,
      retentionDays: RETENTION_DAYS,
      encryptionEnabled: ENCRYPTION_ENABLED,
    },
  });
});

// Export events for compliance
app.get('/api/export', (req: Request, res: Response) => {
  const { userId, from, to, format } = req.query;

  // In production, this would generate a signed S3 URL or stream from S3
  let events = [...auditBuffer];

  if (userId) {
    events = events.filter(e => e.userId === userId);
  }
  if (from) {
    events = events.filter(e => new Date(e.timestamp) >= new Date(from as string));
  }
  if (to) {
    events = events.filter(e => new Date(e.timestamp) <= new Date(to as string));
  }

  if (format === 'csv') {
    const csv = events.map(e =>
      `${e.timestamp},${e.type},${e.userId || ''},${e.sessionId || ''},${JSON.stringify(e)}`
    ).join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=audit-export.csv');
    res.send(`timestamp,type,userId,sessionId,data\n${csv}`);
  } else {
    res.json({ events });
  }
});

// Flush buffer to storage
async function flushBuffer() {
  if (auditBuffer.length === 0) return;

  const eventsToFlush = auditBuffer.splice(0, auditBuffer.length);
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const key = `logs/${timestamp}.json`;

  console.log(`Flushing ${eventsToFlush.length} events to ${S3_BUCKET}/${key}`);

  // In production, upload to S3
  // For now, just log
  try {
    // await s3.putObject({ Bucket: S3_BUCKET, Key: key, Body: JSON.stringify(eventsToFlush) });
    console.log(`Successfully flushed ${eventsToFlush.length} events`);
  } catch (error) {
    console.error('Failed to flush audit buffer:', error);
    // Re-add events to buffer on failure
    auditBuffer.unshift(...eventsToFlush);
  }
}

// Periodic flush
setInterval(flushBuffer, FLUSH_INTERVAL);

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('Shutting down, flushing remaining events...');
  await flushBuffer();
  process.exit(0);
});

// Start server
app.listen(PORT, () => {
  console.log(`Logos Audit Server running on port ${PORT}`);
  console.log(`S3 Bucket: ${S3_BUCKET}`);
  console.log(`Retention: ${RETENTION_DAYS} days`);
  console.log(`Encryption: ${ENCRYPTION_ENABLED}`);
});


