/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as express from 'express';
import { Request, Response } from 'express';
import * as cors from 'cors';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';
import { randomUUID } from 'node:crypto';
import { InMemoryEventStore } from './inMemoryEventStore';
import { getServer } from './playwright';

const MCP_PORT = 33418;

const app = express();
app.use(express.json());

// Allow CORS all domains, expose the Mcp-Session-Id header
app.use(cors({
	origin: '*', // Allow all origins
	exposedHeaders: ['Mcp-Session-Id']
}));

// Map to store transports by session ID
const transports: { [sessionId: string]: StreamableHTTPServerTransport } = {};

// MCP POST endpoint with optional auth
const mcpPostHandler = async (req: Request, res: Response) => {
	const sessionId = req.headers['mcp-session-id'] as string | undefined;
	if (sessionId) {
		console.log(`Received MCP request for session: ${sessionId}`);
	} else {
		console.log('Request body:', req.body);
	}

	try {
		let transport: StreamableHTTPServerTransport;
		if (sessionId && transports[sessionId]) {
			// Reuse existing transport
			transport = transports[sessionId];
		} else if (!sessionId && isInitializeRequest(req.body)) {
			// New initialization request
			const eventStore = new InMemoryEventStore();
			transport = new StreamableHTTPServerTransport({
				sessionIdGenerator: () => randomUUID(),
				eventStore, // Enable resumability
				onsessioninitialized: (sessionId: any) => {
					// Store the transport by session ID when session is initialized
					// This avoids race conditions where requests might come in before the session is stored
					console.log(`Session initialized with ID: ${sessionId}`);
					transports[sessionId] = transport;
				}
			});

			// Set up onclose handler to clean up transport when closed
			transport.onclose = () => {
				const sid = transport.sessionId;
				if (sid && transports[sid]) {
					console.log(`Transport closed for session ${sid}, removing from transports map`);
					delete transports[sid];
				}
			};

			const server = await getServer();
			server.onclose = () => {
				const sid = transport.sessionId;
				if (sid && transports[sid]) {
					console.log(`Transport closed for session ${sid}, removing from transports map`);
					delete transports[sid];
				}
			};
			await server.connect(transport);

			await transport.handleRequest(req, res, req.body);
			return; // Already handled
		} else {
			// Invalid request - no session ID or not initialization request
			res.status(400).json({
				jsonrpc: '2.0',
				error: {
					code: -32000,
					message: 'Bad Request: No valid session ID provided',
				},
				id: null,
			});
			return;
		}

		// Handle the request with existing transport - no need to reconnect
		// The existing transport is already connected to the server
		await transport.handleRequest(req, res, req.body);
	} catch (error) {
		console.error('Error handling MCP request:', error);
		if (!res.headersSent) {
			res.status(500).json({
				jsonrpc: '2.0',
				error: {
					code: -32603,
					message: 'Internal server error',
				},
				id: null,
			});
		}
	}
};

// Set up routes with conditional auth middleware
app.post('/mcp', mcpPostHandler);

// Handle GET requests for SSE streams (using built-in support from StreamableHTTP)
const mcpGetHandler = async (req: Request, res: Response) => {
	const sessionId = req.headers['mcp-session-id'] as string | undefined;
	if (!sessionId || !transports[sessionId]) {
		res.status(400).send('Invalid or missing session ID');
		return;
	}

	// Check for Last-Event-ID header for resumability
	const lastEventId = req.headers['last-event-id'] as string | undefined;
	if (lastEventId) {
		console.log(`Client reconnecting with Last-Event-ID: ${lastEventId}`);
	} else {
		console.log(`Establishing new SSE stream for session ${sessionId}`);
	}

	const transport = transports[sessionId];
	await transport.handleRequest(req, res);
};

// Set up GET route with conditional auth middleware
app.get('/mcp', mcpGetHandler);

// Handle DELETE requests for session termination (according to MCP spec)
const mcpDeleteHandler = async (req: Request, res: Response) => {
	const sessionId = req.headers['mcp-session-id'] as string | undefined;
	if (!sessionId || !transports[sessionId]) {
		res.status(400).send('Invalid or missing session ID');
		return;
	}

	console.log(`Received session termination request for session ${sessionId}`);

	try {
		const transport = transports[sessionId];
		await transport.handleRequest(req, res);
	} catch (error) {
		console.error('Error handling session termination:', error);
		if (!res.headersSent) {
			res.status(500).send('Error processing session termination');
		}
	}
};

app.delete('/mcp', mcpDeleteHandler);

app.listen(MCP_PORT, (error: any) => {
	if (error) {
		console.error('Failed to start server:', error);
		process.exit(1);
	}
	console.log(`MCP available at http://localhost:${MCP_PORT}/mcp`);
});

// Handle server shutdown
process.on('SIGINT', async () => {
	console.log('Shutting down server...');

	// Close all active transports to properly clean up resources
	for (const sessionId in transports) {
		try {
			console.log(`Closing transport for session ${sessionId}`);
			await transports[sessionId].close();
			delete transports[sessionId];
		} catch (error) {
			console.error(`Error closing transport for session ${sessionId}:`, error);
		}
	}
	console.log('Server shutdown complete');
	process.exit(0);
});
