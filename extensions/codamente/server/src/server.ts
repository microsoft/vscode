/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as http from 'node:http';
import { validateGitHubToken, pruneTokenCache } from './auth';
import { HostStore } from './hostStore';
import type { GitHubUser, RegisterHostBody } from './types';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const PORT = parseInt(process.env['PORT'] ?? '3000', 10);
const HOST = process.env['HOST'] ?? '0.0.0.0';

// ---------------------------------------------------------------------------
// Shared state
// ---------------------------------------------------------------------------

const hostStore = new HostStore();

// Periodically prune the token-validation cache
setInterval(pruneTokenCache, 60_000);

// ---------------------------------------------------------------------------
// HTTP Server
// ---------------------------------------------------------------------------

const server = http.createServer(async (req, res) => {
	// CORS — allow any origin so the VS Code web extension and future
	// mobile clients can reach the API.
	res.setHeader('Access-Control-Allow-Origin', '*');
	res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
	res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

	if (req.method === 'OPTIONS') {
		res.writeHead(204);
		res.end();
		return;
	}

	const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
	const method = req.method ?? 'GET';

	try {
		// Health check — unauthenticated
		if (url.pathname === '/api/health' && method === 'GET') {
			return sendJson(res, 200, { status: 'ok', hosts: hostStore.size });
		}

		// All /api/hosts routes require authentication
		if (url.pathname.startsWith('/api/hosts')) {
			const user = await authenticate(req, res);
			if (!user) {
				return; // response already sent
			}
			return await routeHosts(req, res, url, method, user);
		}

		sendJson(res, 404, { error: 'Not found' });
	} catch (err) {
		console.error('Unhandled error:', err);
		sendJson(res, 500, { error: 'Internal server error' });
	}
});

server.listen(PORT, HOST, () => {
	console.log(`Codamente server listening on http://${HOST}:${PORT}`);
});

// Graceful shutdown
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
	process.on(signal, () => {
		console.log(`Received ${signal}, shutting down...`);
		hostStore.dispose();
		server.close(() => process.exit(0));
	});
}

// ---------------------------------------------------------------------------
// Authentication helper
// ---------------------------------------------------------------------------

async function authenticate(req: http.IncomingMessage, res: http.ServerResponse): Promise<GitHubUser | undefined> {
	const authHeader = req.headers['authorization'];
	if (!authHeader || !authHeader.startsWith('Bearer ')) {
		sendJson(res, 401, { error: 'Missing or invalid Authorization header' });
		return undefined;
	}

	const token = authHeader.slice('Bearer '.length);
	const user = await validateGitHubToken(token);
	if (!user) {
		sendJson(res, 401, { error: 'Invalid GitHub token' });
		return undefined;
	}

	return user;
}

// ---------------------------------------------------------------------------
// Route: /api/hosts
// ---------------------------------------------------------------------------

async function routeHosts(
	req: http.IncomingMessage,
	res: http.ServerResponse,
	url: URL,
	method: string,
	user: GitHubUser,
): Promise<void> {
	// POST /api/hosts — register a new host
	if (url.pathname === '/api/hosts' && method === 'POST') {
		const body = await readJsonBody<RegisterHostBody>(req);
		if (!body || !body.tunnelUrl || !body.connectionToken || !body.hostName) {
			return sendJson(res, 400, { error: 'Missing required fields: tunnelUrl, connectionToken, hostName' });
		}

		const entry = hostStore.register(user.id, body.tunnelUrl, body.connectionToken, body.hostName);
		return sendJson(res, 201, { id: entry.id });
	}

	// GET /api/hosts — list the caller's hosts
	if (url.pathname === '/api/hosts' && method === 'GET') {
		const hosts = hostStore.listForUser(user.id);
		return sendJson(res, 200, hosts);
	}

	// Routes with a host ID: /api/hosts/:id/...
	const hostIdMatch = url.pathname.match(/^\/api\/hosts\/([^/]+)(?:\/(.+))?$/);
	if (!hostIdMatch) {
		return sendJson(res, 404, { error: 'Not found' });
	}

	const hostId = hostIdMatch[1];
	const subRoute = hostIdMatch[2]; // e.g. "heartbeat", "connect", or undefined

	// PUT /api/hosts/:id/heartbeat
	if (subRoute === 'heartbeat' && method === 'PUT') {
		const ok = hostStore.heartbeat(hostId, user.id);
		return ok
			? sendJson(res, 204, undefined)
			: sendJson(res, 404, { error: 'Host not found' });
	}

	// POST /api/hosts/:id/connect — get connection info (for mobile clients)
	if (subRoute === 'connect' && method === 'POST') {
		const info = hostStore.getConnectInfo(hostId, user.id);
		return info
			? sendJson(res, 200, info)
			: sendJson(res, 404, { error: 'Host not found' });
	}

	// DELETE /api/hosts/:id
	if (!subRoute && method === 'DELETE') {
		const ok = hostStore.remove(hostId, user.id);
		return ok
			? sendJson(res, 204, undefined)
			: sendJson(res, 404, { error: 'Host not found' });
	}

	sendJson(res, 404, { error: 'Not found' });
}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

function sendJson(res: http.ServerResponse, status: number, body: unknown): void {
	if (status === 204 || body === undefined) {
		res.writeHead(204);
		res.end();
		return;
	}
	const json = JSON.stringify(body);
	res.writeHead(status, { 'Content-Type': 'application/json' });
	res.end(json);
}

function readJsonBody<T>(req: http.IncomingMessage): Promise<T | undefined> {
	return new Promise((resolve) => {
		const chunks: Buffer[] = [];
		req.on('data', (chunk: Buffer) => chunks.push(chunk));
		req.on('end', () => {
			try {
				const raw = Buffer.concat(chunks).toString('utf-8');
				resolve(JSON.parse(raw) as T);
			} catch {
				resolve(undefined);
			}
		});
		req.on('error', () => resolve(undefined));
	});
}
