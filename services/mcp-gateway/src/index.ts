// Copyright (c) Son of Anton Contributors. All rights reserved.
// Licensed under the MIT License.

import http from 'http';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { FalkorDBClient } from './clients/falkordb';
import { QdrantClient } from './clients/qdrant';
import { createMcpServer } from './server';

const PORT = parseInt(process.env.MCP_PORT ?? '3100', 10);

const db = new FalkorDBClient();
const qdrant = new QdrantClient();

const mcpServer = createMcpServer(db, qdrant);

// Track active SSE transports for cleanup
const activeTransports = new Map<string, SSEServerTransport>();

const httpServer = http.createServer(async (req, res) => {
	const url = new URL(req.url ?? '/', `http://localhost:${PORT}`);

	// Health endpoint
	if (url.pathname === '/health') {
		const [falkorHealthy, qdrantHealthy] = await Promise.all([
			db.isHealthy().catch(() => false),
			qdrant.isHealthy().catch(() => false),
		]);

		const status = falkorHealthy && qdrantHealthy ? 'ok' : 'degraded';
		const code = status === 'ok' ? 200 : 503;

		res.writeHead(code, { 'Content-Type': 'application/json' });
		res.end(JSON.stringify({
			status,
			service: 'mcp-gateway',
			backends: {
				falkordb: falkorHealthy ? 'connected' : 'disconnected',
				qdrant: qdrantHealthy ? 'connected' : 'disconnected',
			},
		}));
		return;
	}

	// SSE endpoint for MCP transport
	if (url.pathname === '/sse') {
		const transport = new SSEServerTransport('/messages', res);
		const sessionId = transport.sessionId;
		activeTransports.set(sessionId, transport);

		res.on('close', () => {
			activeTransports.delete(sessionId);
		});

		await mcpServer.connect(transport);
		return;
	}

	// Message endpoint for MCP transport
	if (url.pathname === '/messages' && req.method === 'POST') {
		const sessionId = url.searchParams.get('sessionId');
		if (!sessionId || !activeTransports.has(sessionId)) {
			res.writeHead(400, { 'Content-Type': 'application/json' });
			res.end(JSON.stringify({ error: 'Invalid or missing sessionId' }));
			return;
		}

		const transport = activeTransports.get(sessionId)!;
		await transport.handlePostMessage(req, res);
		return;
	}

	res.writeHead(404, { 'Content-Type': 'application/json' });
	res.end(JSON.stringify({ error: 'Not found' }));
});

async function start(): Promise<void> {
	try {
		await db.connect();
		console.log('[mcp-gateway] Connected to FalkorDB');
	} catch (err) {
		console.warn('[mcp-gateway] FalkorDB not available, will retry on requests:', (err as Error).message);
	}

	httpServer.listen(PORT, () => {
		console.log(`[mcp-gateway] MCP server listening on port ${PORT}`);
		console.log(`[mcp-gateway] SSE endpoint: http://localhost:${PORT}/sse`);
		console.log(`[mcp-gateway] Health endpoint: http://localhost:${PORT}/health`);
	});
}

start().catch(err => {
	console.error('[mcp-gateway] Fatal startup error:', err);
	process.exit(1);
});
