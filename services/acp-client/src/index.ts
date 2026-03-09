// Copyright (c) Son of Anton Contributors. All rights reserved.
// Licensed under the MIT License.

import http from 'http';
import path from 'path';
import { ACPClientImpl } from './client';
import { AgentRegistry } from './registry/agentRegistry';
import { ACPDispatcher } from './dispatcher';

const PORT = parseInt(process.env.ACP_PORT ?? '3300', 10);
const CONFIG_PATH = process.env.ACP_CONFIG_PATH
	?? path.join(process.env.PROJECT_PATH ?? '/workspace', '.son-of-anton', 'agents', 'acp-agents.json');

const registry = new AgentRegistry(CONFIG_PATH);
const client = new ACPClientImpl(registry);
const dispatcher = new ACPDispatcher(client);

const httpServer = http.createServer(async (req, res) => {
	const url = new URL(req.url ?? '/', `http://localhost:${PORT}`);

	// Health endpoint
	if (url.pathname === '/health') {
		const agents = await client.listAgents();
		const sessions = client.getActiveSessions();

		res.writeHead(200, { 'Content-Type': 'application/json' });
		res.end(JSON.stringify({
			status: 'ok',
			service: 'acp-client',
			registeredAgents: agents.length,
			activeSessions: sessions.length,
		}));
		return;
	}

	// List registered agents
	if (url.pathname === '/agents' && req.method === 'GET') {
		const agents = await client.listAgents();
		res.writeHead(200, { 'Content-Type': 'application/json' });
		res.end(JSON.stringify({ agents }));
		return;
	}

	// Get agent capabilities
	if (url.pathname.startsWith('/agents/') && url.pathname.endsWith('/capabilities') && req.method === 'GET') {
		const agentId = url.pathname.split('/')[2];
		try {
			const capabilities = await client.getAgentCapabilities(agentId);
			res.writeHead(200, { 'Content-Type': 'application/json' });
			res.end(JSON.stringify(capabilities));
		} catch (err) {
			res.writeHead(404, { 'Content-Type': 'application/json' });
			res.end(JSON.stringify({ error: (err as Error).message }));
		}
		return;
	}

	// Create session
	if (url.pathname === '/sessions' && req.method === 'POST') {
		const body = await readBody(req);
		try {
			const { agentId, ...config } = JSON.parse(body);
			const session = await client.createSession(agentId, config);
			res.writeHead(201, { 'Content-Type': 'application/json' });
			res.end(JSON.stringify(session));
		} catch (err) {
			res.writeHead(400, { 'Content-Type': 'application/json' });
			res.end(JSON.stringify({ error: (err as Error).message }));
		}
		return;
	}

	// Dispatch task (for meta-orchestrator integration)
	if (url.pathname === '/dispatch' && req.method === 'POST') {
		const body = await readBody(req);
		try {
			const assignment = JSON.parse(body);
			const result = await dispatcher.dispatchTask(assignment);
			res.writeHead(200, { 'Content-Type': 'application/json' });
			res.end(JSON.stringify(result));
		} catch (err) {
			res.writeHead(400, { 'Content-Type': 'application/json' });
			res.end(JSON.stringify({ error: (err as Error).message }));
		}
		return;
	}

	// List active sessions
	if (url.pathname === '/sessions' && req.method === 'GET') {
		const sessions = client.getActiveSessions();
		res.writeHead(200, { 'Content-Type': 'application/json' });
		res.end(JSON.stringify({ sessions }));
		return;
	}

	// Terminate session
	if (url.pathname.startsWith('/sessions/') && req.method === 'DELETE') {
		const sessionId = url.pathname.split('/')[2];
		try {
			await client.terminateSession(sessionId);
			res.writeHead(204);
			res.end();
		} catch (err) {
			res.writeHead(404, { 'Content-Type': 'application/json' });
			res.end(JSON.stringify({ error: (err as Error).message }));
		}
		return;
	}

	res.writeHead(404, { 'Content-Type': 'application/json' });
	res.end(JSON.stringify({ error: 'Not found' }));
});

function readBody(req: http.IncomingMessage): Promise<string> {
	return new Promise((resolve, reject) => {
		let data = '';
		req.on('data', (chunk: Buffer) => { data += chunk.toString(); });
		req.on('end', () => resolve(data));
		req.on('error', reject);
	});
}

async function start(): Promise<void> {
	await registry.load();
	console.log(`[acp-client] Loaded ${(await client.listAgents()).length} agents from registry`);

	// Watch config file for changes in the background
	registry.startWatching().catch(err => {
		console.warn('[acp-client] Config file watch failed:', err.message);
	});

	httpServer.listen(PORT, () => {
		console.log(`[acp-client] ACP client service listening on port ${PORT}`);
		console.log(`[acp-client] Health endpoint: http://localhost:${PORT}/health`);
		console.log(`[acp-client] Config path: ${CONFIG_PATH}`);
	});
}

start().catch(err => {
	console.error('[acp-client] Fatal startup error:', err);
	process.exit(1);
});

export { ACPClientImpl, AgentRegistry, ACPDispatcher };
