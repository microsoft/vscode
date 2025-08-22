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
import { getServer as getAutomationServer } from './automation';
import { getApplication } from './application';
import { Application } from '../../automation';

interface McpServerConfig {
	name: string;
	port: number;
	getServerInstance: (app: Application) => Promise<any>;
}

const serverConfigs: McpServerConfig[] = [
	{
		name: 'Playwright',
		port: 33418,
		getServerInstance: getServer
	},
	{
		name: 'Automation',
		port: 33458,
		getServerInstance: getAutomationServer
	}
];

// Store all transports by server name
const allTransports: { [serverName: string]: { [sessionId: string]: StreamableHTTPServerTransport } } = {};

// Shared application instance
let sharedApplication: Application | undefined = undefined;

// Initialize shared application
async function getSharedApplication(): Promise<Application> {
	if (!sharedApplication) {
		sharedApplication = await getApplication();
	}
	return sharedApplication;
}

// Check if there are any active transports across all servers
function hasActiveTransports(): boolean {
	for (const serverName in allTransports) {
		if (Object.keys(allTransports[serverName]).length > 0) {
			return true;
		}
	}
	return false;
}

// Close shared application if no active transports remain
async function closeSharedApplicationIfUnused(): Promise<void> {
	if (sharedApplication && !hasActiveTransports()) {
		try {
			console.log('No active transports remaining, closing shared application...');
			await sharedApplication.stop();
			sharedApplication = undefined;
		} catch (error) {
			console.error('Error closing shared application:', error);
		}
	}
}

// Common CORS configuration
const corsConfig = cors({
	origin: '*', // Allow all origins
	exposedHeaders: ['Mcp-Session-Id']
});

// Factory function to create MCP handlers
function createMcpHandlers(serverName: string, getServerInstance: (app: Application) => Promise<any>) {
	// Initialize transport storage for this server
	allTransports[serverName] = {};
	const transports = allTransports[serverName];

	const postHandler = async (req: Request, res: Response) => {
		const sessionId = req.headers['mcp-session-id'] as string | undefined;
		if (sessionId) {
			console.log(`Received ${serverName} MCP request for session: ${sessionId}`);
		} else {
			console.log(`${serverName} request body:`, req.body);
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
						console.log(`${serverName} session initialized with ID: ${sessionId}`);
						transports[sessionId] = transport;
					}
				});

				// Set up onclose handler to clean up transport when closed
				transport.onclose = async () => {
					const sid = transport.sessionId;
					if (sid && transports[sid]) {
						console.log(`${serverName} transport closed for session ${sid}, removing from transports map`);
						delete transports[sid];
						// Close shared application if no more transports are active
						await closeSharedApplicationIfUnused();
					}
				};

				// Connect the transport to the MCP server
				const sharedApp = await getSharedApplication();
				const server = await getServerInstance(sharedApp);
				server.onclose = async () => {
					const sid = transport.sessionId;
					if (sid && transports[sid]) {
						console.log(`${serverName} transport closed for session ${sid}, removing from transports map`);
						delete transports[sid];
						// Close shared application if no more transports are active
						await closeSharedApplicationIfUnused();
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

			// Handle the request with existing transport
			await transport.handleRequest(req, res, req.body);
		} catch (error) {
			console.error(`Error handling ${serverName} MCP request:`, error);
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

	const getHandler = async (req: Request, res: Response) => {
		const sessionId = req.headers['mcp-session-id'] as string | undefined;
		if (!sessionId || !transports[sessionId]) {
			res.status(400).send('Invalid or missing session ID');
			return;
		}

		const lastEventId = req.headers['last-event-id'] as string | undefined;
		if (lastEventId) {
			console.log(`${serverName} client reconnecting with Last-Event-ID: ${lastEventId}`);
		} else {
			console.log(`Establishing new ${serverName} SSE stream for session ${sessionId}`);
		}

		const transport = transports[sessionId];
		await transport.handleRequest(req, res);
	};

	const deleteHandler = async (req: Request, res: Response) => {
		const sessionId = req.headers['mcp-session-id'] as string | undefined;
		if (!sessionId || !transports[sessionId]) {
			res.status(400).send('Invalid or missing session ID');
			return;
		}

		console.log(`Received ${serverName} session termination request for session ${sessionId}`);

		try {
			const transport = transports[sessionId];
			await transport.handleRequest(req, res);
		} catch (error) {
			console.error(`Error handling ${serverName} session termination:`, error);
			if (!res.headersSent) {
				res.status(500).send('Error processing session termination');
			}
		}
	};

	return { postHandler, getHandler, deleteHandler };
}

// Create and start all servers
const servers: { name: string; app: express.Application; port: number }[] = [];

for (const config of serverConfigs) {
	const app = express();
	app.use(express.json());
	app.use(corsConfig);

	const { postHandler, getHandler, deleteHandler } = createMcpHandlers(config.name, config.getServerInstance);

	app.post('/mcp', postHandler);
	app.get('/mcp', getHandler);
	app.delete('/mcp', deleteHandler);

	servers.push({ name: config.name, app, port: config.port });
}

// Start all servers
for (const server of servers) {
	server.app.listen(server.port, (error: any) => {
		if (error) {
			console.error(`Failed to start ${server.name} MCP server:`, error);
			process.exit(1);
		}
		console.log(`${server.name} MCP available at http://localhost:${server.port}/mcp`);
	});
}

// Handle server shutdown
process.on('SIGINT', async () => {
	console.log('Shutting down servers...');

	// Close all active transports for all servers
	for (const serverName in allTransports) {
		const transports = allTransports[serverName];
		for (const sessionId in transports) {
			try {
				console.log(`Closing ${serverName} transport for session ${sessionId}`);
				await transports[sessionId].close();
				delete transports[sessionId];
			} catch (error) {
				console.error(`Error closing ${serverName} transport for session ${sessionId}:`, error);
			}
		}
	}

	// Close the shared application if it exists
	if (sharedApplication) {
		try {
			console.log('Closing shared application...');
			await sharedApplication.stop();
			sharedApplication = undefined;
		} catch (error) {
			console.error('Error closing shared application:', error);
		}
	}

	console.log('Server shutdown complete');
	process.exit(0);
});
