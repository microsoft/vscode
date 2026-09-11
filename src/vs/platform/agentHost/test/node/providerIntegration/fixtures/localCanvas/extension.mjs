/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { randomUUID } from 'node:crypto';
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CanvasError, createCanvas, joinSession } from '@github/copilot-sdk/extension';

const directory = dirname(fileURLToPath(import.meta.url));
const storageDirectory = process.env.VSCODE_CANVAS_DATA_DIR || directory;
const dataDirectory = join(storageDirectory, 'documents');
const generation = randomUUID();
mkdirSync(dataDirectory, { recursive: true });
const instances = new Map();
const subscribers = new Map();
let stopping = false;

function record(kind, data) {
	appendFileSync(join(storageDirectory, 'audit.jsonl'), `${JSON.stringify({ kind, data })}\n`);
}

function readDocument(documentId) {
	const path = join(dataDirectory, `${documentId}.json`);
	return existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : { documentId, value: 0, actions: 0, interactions: 0 };
}

function increment(documentId, amount, source) {
	if (!Number.isInteger(amount) || amount < 1 || amount > 10) {
		throw new CanvasError('invalid_amount', 'Amount must be an integer between 1 and 10');
	}
	const document = readDocument(documentId);
	document.value += amount;
	document[source]++;
	writeFileSync(join(dataDirectory, `${documentId}.json`), JSON.stringify(document));
	for (const [response, id] of subscribers) {
		if (instances.get(id)?.documentId === documentId) {
			response.write(`data: ${JSON.stringify(document)}\n\n`);
		}
	}
	return document;
}

function sendJson(response, status, value) {
	response.writeHead(status, { 'Content-Type': 'application/json' });
	response.end(JSON.stringify(value));
}

const server = createServer((request, response) => {
	void handleRequest(request, response).catch(error => {
		record('http.error', { message: error.message });
		sendJson(response, error instanceof CanvasError ? 400 : 500, { error: error.message });
	});
});

async function handleRequest(request, response) {
	const url = new URL(request.url, 'http://127.0.0.1');
	if (url.pathname === '/health') {
		sendJson(response, 200, {
			pid: process.pid,
			home: process.env.HOME,
			copilotHome: process.env.COPILOT_HOME,
			sdkPath: process.env.COPILOT_SDK_PATH,
			generation,
			instances: [...instances.keys()],
			subscribers: subscribers.size,
		});
		return;
	}
	if (request.method === 'GET' && url.pathname === '/client.js') {
		response.writeHead(200, { 'Content-Type': 'text/javascript' });
		response.end(readFileSync(join(directory, 'client.js')));
		return;
	}
	if (request.method === 'GET' && url.pathname === '/style.css') {
		response.writeHead(200, { 'Content-Type': 'text/css' });
		response.end(readFileSync(join(directory, 'style.css')));
		return;
	}

	const instanceId = url.searchParams.get('instance');
	const instance = instances.get(instanceId);
	if (!instance || url.searchParams.get('generation') !== generation) {
		sendJson(response, 404, { error: 'Unknown instance' });
		return;
	}
	if (request.method === 'GET' && url.pathname === '/') {
		response.writeHead(200, {
			'Content-Type': 'text/html; charset=utf-8',
			'Content-Security-Policy': "default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'",
		});
		response.end(readFileSync(join(directory, 'index.html')));
	} else if (request.method === 'GET' && url.pathname === '/document') {
		sendJson(response, 200, readDocument(instance.documentId));
	} else if (request.method === 'GET' && url.pathname === '/events') {
		response.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store' });
		subscribers.set(response, instanceId);
		response.on('close', () => subscribers.delete(response));
		response.write(`data: ${JSON.stringify(readDocument(instance.documentId))}\n\n`);
	} else if (request.method === 'POST' && url.pathname === '/increment') {
		let body = '';
		for await (const chunk of request) {
			body += chunk.toString();
			if (body.length > 1024) {
				sendJson(response, 413, { error: 'Request too large' });
				return;
			}
		}
		const input = JSON.parse(body);
		record('http.increment', { instanceId, input });
		sendJson(response, 200, increment(instance.documentId, input.amount, 'interactions'));
	} else {
		sendJson(response, 404, { error: 'Unknown route' });
	}
}

const canvas = createCanvas({
	id: 'counter',
	displayName: 'Local Counter',
	description: 'A deterministic document shared by local canvas instances.',
	inputSchema: {
		type: 'object',
		properties: {
			documentId: { type: 'string', pattern: '^[a-z][a-z0-9-]{0,63}$' },
			failOnClose: { type: 'boolean' },
		},
		required: ['documentId'],
		additionalProperties: false,
	},
	actions: [{
		name: 'increment',
		description: 'Increment the document once.',
		inputSchema: {
			type: 'object',
			properties: { amount: { type: 'integer', minimum: 1, maximum: 10 } },
			required: ['amount'],
			additionalProperties: false,
		},
		handler: request => {
			record('action', request);
			const instance = instances.get(request.instanceId);
			if (!instance) {
				throw new CanvasError('missing_instance', 'Instance is not open in this provider');
			}
			const result = increment(instance.documentId, request.input?.amount, 'actions');
			record('action.result', result);
			return result;
		},
	}],
	open: request => {
		record('open', request);
		if (typeof request.input?.documentId !== 'string' || !/^[a-z][a-z0-9-]{0,63}$/.test(request.input.documentId)) {
			throw new CanvasError('invalid_document', 'A stable document ID is required');
		}
		instances.set(request.instanceId, request.input);
		const address = server.address();
		if (!address || typeof address === 'string') {
			throw new CanvasError('not_listening', 'The fixture server is unavailable');
		}
		return {
			url: `http://127.0.0.1:${address.port}/?instance=${encodeURIComponent(request.instanceId)}&generation=${generation}`,
			title: `Counter: ${request.input.documentId}`,
			status: 'ready',
		};
	},
	onClose: request => {
		record('close', request);
		const instance = instances.get(request.instanceId);
		instances.delete(request.instanceId);
		for (const [response, instanceId] of subscribers) {
			if (instanceId === request.instanceId) {
				response.end();
				subscribers.delete(response);
			}
		}
		if (instance?.failOnClose) {
			record('close.failed', { instanceId: request.instanceId });
			throw new CanvasError('close_failed', 'Intentional fixture close failure');
		}
	},
});

async function shutdown() {
	if (stopping) {
		return;
	}
	stopping = true;
	for (const response of subscribers.keys()) {
		response.end();
	}
	subscribers.clear();
	server.closeAllConnections();
	await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
	// Only the owning client may destroy the shared session; a joining extension closes its transport.
	record('stopped', { pid: process.pid });
}

function stop() {
	void shutdown().then(() => process.exit(0), error => {
		record('stop.error', { message: error.message });
		process.exit(1);
	});
}

process.once('SIGTERM', stop);
process.once('SIGINT', stop);
process.stdin.once('end', stop);
record('started', { pid: process.pid });
await new Promise((resolve, reject) => {
	server.once('error', reject);
	server.listen(0, '127.0.0.1', resolve);
});
try {
	const session = await joinSession({ canvases: [canvas] });
	record('joined', { sessionId: session.sessionId });
} catch (error) {
	await shutdown();
	throw error;
}
