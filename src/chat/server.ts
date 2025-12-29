/**
 * Logos Chat Server
 * Multi-agent chat with ARIA integration and @-mention routing
 */

import express, { Request, Response } from 'express';
import cors from 'cors';
import { WebSocketServer, WebSocket } from 'ws';
import { createServer } from 'http';

const app = express();
const PORT = process.env.PORT || 8081;

// Middleware
app.use(cors());
app.use(express.json());

// Environment
const D3N_ENDPOINT = process.env.D3N_ENDPOINT || 'http://d3n-gateway:9090';
const ARIA_ENDPOINT = process.env.ARIA_ENDPOINT || 'http://aria-inference:80';

// In-memory storage (replace with Redis in production)
const conversations = new Map<string, any[]>();
const activeConnections = new Map<string, WebSocket>();

// Health check
app.get('/health', (_req: Request, res: Response) => {
  res.json({ status: 'healthy', service: 'logos-chat', timestamp: new Date().toISOString() });
});

// Ready check
app.get('/ready', (_req: Request, res: Response) => {
  res.json({ status: 'ready' });
});

// Get available agents
app.get('/api/agents', (_req: Request, res: Response) => {
  res.json({
    agents: [
      { id: 'conductor', name: 'Conductor', command: '@conductor', description: 'Multi-step coordination' },
      { id: 'swe', name: 'Software Engineer', command: '@swe', description: 'Code generation and debugging' },
      { id: 'da', name: 'Data Analyst', command: '@da', description: 'Data analysis and visualization' },
      { id: 'researcher', name: 'Researcher', command: '@researcher', description: 'Deep research via Athena' },
      { id: 'ca', name: 'Cognitive Architect', command: '@ca', description: 'Architecture and documentation' },
    ],
  });
});

// Get conversation
app.get('/api/conversations/:id', (req: Request, res: Response) => {
  const { id } = req.params;
  const messages = conversations.get(id) || [];
  res.json({ id, messages });
});

// Send message
app.post('/api/conversations/:id/messages', async (req: Request, res: Response) => {
  const { id } = req.params;
  const { content, agentId, context } = req.body;

  const messages = conversations.get(id) || [];

  // Add user message
  const userMessage = {
    id: `msg-${Date.now()}`,
    role: 'user',
    content,
    timestamp: new Date().toISOString(),
  };
  messages.push(userMessage);

  // Route to agent via ARIA
  try {
    const response = await fetch(`${ARIA_ENDPOINT}/api/invoke`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        agent: agentId || 'conductor',
        query: content,
        context,
      }),
    });

    const agentResponse = await response.json();

    const assistantMessage = {
      id: `msg-${Date.now() + 1}`,
      role: 'assistant',
      agentId: agentId || 'conductor',
      content: agentResponse.response || 'Processing your request...',
      tier: agentResponse.tier || 2,
      timestamp: new Date().toISOString(),
    };
    messages.push(assistantMessage);

    conversations.set(id, messages);

    // Notify WebSocket clients
    const ws = activeConnections.get(id);
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'message', message: assistantMessage }));
    }

    res.json(assistantMessage);
  } catch (error) {
    console.error('ARIA invocation failed:', error);

    // Fallback response
    const fallbackMessage = {
      id: `msg-${Date.now() + 1}`,
      role: 'assistant',
      agentId: 'system',
      content: 'I apologize, but I encountered an issue processing your request. Please try again.',
      timestamp: new Date().toISOString(),
    };
    messages.push(fallbackMessage);
    conversations.set(id, messages);

    res.json(fallbackMessage);
  }
});

// Create thread branch
app.post('/api/conversations/:id/branch', (req: Request, res: Response) => {
  const { id } = req.params;
  const { fromMessageId } = req.body;

  const messages = conversations.get(id) || [];
  const branchPoint = messages.findIndex((m) => m.id === fromMessageId);

  if (branchPoint === -1) {
    return res.status(404).json({ error: 'Message not found' });
  }

  const branchId = `${id}-branch-${Date.now()}`;
  const branchedMessages = messages.slice(0, branchPoint + 1);
  conversations.set(branchId, branchedMessages);

  res.json({ branchId, messages: branchedMessages });
});

// Create HTTP server
const server = createServer(app);

// WebSocket server for real-time updates
const wss = new WebSocketServer({ server, path: '/ws' });

wss.on('connection', (ws, req) => {
  const conversationId = new URL(req.url!, `http://${req.headers.host}`).searchParams.get('conversation');

  if (conversationId) {
    activeConnections.set(conversationId, ws);

    ws.on('close', () => {
      activeConnections.delete(conversationId);
    });
  }

  ws.on('message', (data) => {
    try {
      const message = JSON.parse(data.toString());
      console.log('Received WebSocket message:', message);
    } catch (e) {
      console.error('Invalid WebSocket message');
    }
  });
});

// Start server
server.listen(PORT, () => {
  console.log(`Logos Chat Server running on port ${PORT}`);
  console.log(`D3N Endpoint: ${D3N_ENDPOINT}`);
  console.log(`ARIA Endpoint: ${ARIA_ENDPOINT}`);
});

