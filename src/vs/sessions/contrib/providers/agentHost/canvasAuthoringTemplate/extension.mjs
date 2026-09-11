/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Starter local canvas backend. Copy this folder as the seed for a new canvas
// package, then edit `canvas.id`/`displayName`/`description`, the `actions`
// array, and `handleAction` below. See README.md for the prepare/review/
// approve/restart lifecycle and for what to bundle alongside this file.

import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createServer } from 'node:http';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CanvasError, createCanvas, joinSession } from '@github/copilot-sdk/extension';

const directory = dirname(fileURLToPath(import.meta.url));

// Production installs always set VSCODE_CANVAS_DATA_DIR to a per-package,
// per-workspace-or-profile directory outside the fingerprinted snapshot. The
// fallback below only exists so this file can be run directly (e.g.
// `node extension.mjs`) while authoring, before it has been prepared and
// approved through the packages UI.
const dataDirectory = process.env.VSCODE_CANVAS_DATA_DIR || join(directory, '.local-data');
mkdirSync(dataDirectory, { recursive: true });

const documentPath = documentId => join(dataDirectory, `${documentId}.json`);

function readDocument(documentId) {
	const path = documentPath(documentId);
	return existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : { documentId, greetings: 0, lastGreeting: null };
}

function writeDocument(document) {
	writeFileSync(documentPath(document.documentId), JSON.stringify(document));
}

// One open canvas instance per `open()` call; `documentId` is the durable key
// shared by every instance that opens the same document.
const instances = new Map();
const streams = new Map();

function sendJson(response, status, value) {
	response.writeHead(status, { 'Content-Type': 'application/json' });
	response.end(JSON.stringify(value));
}

async function readJsonBody(request) {
	let body = '';
	for await (const chunk of request) {
		body += chunk.toString();
		if (body.length > 4096) {
			throw new CanvasError('request_too_large', 'Request body is too large');
		}
	}
	return body.length > 0 ? JSON.parse(body) : {};
}

/**
 * Runs the `greet` action against a document: append one greeting and persist
 * the result. Shared by the declared SDK action and the frontend's own HTTP
 * route below, so both paths keep the same, single source of truth.
 */
function greet(documentId, message) {
	if (typeof message !== 'string' || message.length === 0 || message.length > 200) {
		throw new CanvasError('invalid_message', 'message must be a non-empty string of at most 200 characters');
	}
	const document = readDocument(documentId);
	document.greetings += 1;
	document.lastGreeting = message;
	writeDocument(document);
	for (const [response, client] of streams) {
		if (client.documentId === documentId) {
			response.write(`data: ${JSON.stringify(document)}\n\n`);
		}
	}
	return document;
}

const server = createServer((request, response) => {
	void handleRequest(request, response).catch(error => {
		sendJson(response, error instanceof CanvasError ? 400 : 500, { error: error.message });
	});
});

async function handleRequest(request, response) {
	const url = new URL(request.url, 'http://127.0.0.1');
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
	if (!instance) {
		sendJson(response, 404, { error: 'Unknown instance' });
		return;
	}
	if (request.method === 'GET' && url.pathname === '/') {
		response.writeHead(200, {
			'Content-Type': 'text/html; charset=utf-8',
			// Keep this canvas's own served frontend as the only allowed
			// script/style/fetch origin; do not widen this policy.
			'Content-Security-Policy': 'default-src \'none\'; script-src \'self\'; style-src \'self\'; connect-src \'self\'',
		});
		response.end(readFileSync(join(directory, 'index.html')));
	} else if (request.method === 'GET' && url.pathname === '/document') {
		sendJson(response, 200, readDocument(instance.documentId));
	} else if (request.method === 'GET' && url.pathname === '/events') {
		response.writeHead(200, {
			'Content-Type': 'text/event-stream',
			'Cache-Control': 'no-cache',
		});
		streams.set(response, { instanceId, documentId: instance.documentId });
		request.on('close', () => streams.delete(response));
		response.write(`data: ${JSON.stringify(readDocument(instance.documentId))}\n\n`);
	} else if (request.method === 'POST' && url.pathname === '/greet') {
		const input = await readJsonBody(request);
		sendJson(response, 200, greet(instance.documentId, input.message));
	} else {
		sendJson(response, 404, { error: 'Unknown route' });
	}
}

const canvas = createCanvas({
	id: 'starter',
	displayName: 'Starter Canvas',
	description: 'Copy-and-edit starting point for an original local canvas package.',
	inputSchema: {
		type: 'object',
		properties: {
			documentId: { type: 'string', pattern: '^[a-z][a-z0-9-]{0,63}$' },
		},
		required: ['documentId'],
		additionalProperties: false,
	},
	// One declared action. Add more entries here as the package grows; each
	// handler should stay a thin wrapper over a plain function like `greet`
	// above so the frontend's own HTTP route and the SDK-declared action
	// cannot disagree about behavior.
	actions: [{
		name: 'greet',
		description: 'Record one greeting on the open document.',
		inputSchema: {
			type: 'object',
			properties: { message: { type: 'string', minLength: 1, maxLength: 200 } },
			required: ['message'],
			additionalProperties: false,
		},
		handler: request => {
			const instance = instances.get(request.instanceId);
			if (!instance) {
				throw new CanvasError('missing_instance', 'Instance is not open in this provider');
			}
			return greet(instance.documentId, request.input?.message);
		},
	}],
	open: request => {
		if (typeof request.input?.documentId !== 'string' || !/^[a-z][a-z0-9-]{0,63}$/.test(request.input.documentId)) {
			throw new CanvasError('invalid_document', 'A stable document ID is required');
		}
		instances.set(request.instanceId, request.input);
		const address = server.address();
		if (!address || typeof address === 'string') {
			throw new CanvasError('not_listening', 'The canvas server is unavailable');
		}
		return {
			url: `http://127.0.0.1:${address.port}/?instance=${encodeURIComponent(request.instanceId)}`,
			title: `Starter: ${request.input.documentId}`,
			status: 'ready',
		};
	},
	onClose: request => {
		instances.delete(request.instanceId);
		for (const [response, client] of streams) {
			if (client.instanceId === request.instanceId) {
				streams.delete(response);
				response.end();
			}
		}
	},
});

let stopping = false;
async function shutdown() {
	if (stopping) {
		return;
	}
	stopping = true;
	server.closeAllConnections();
	await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
	// A joining extension must not call `session.disconnect()`: that API
	// destroys the shared session, which belongs to the owning SDK client.
	// This starter only needs to stop its own HTTP server and let the
	// process exit; the SDK client cleans up the session on process exit.
}

function stop(exitCode) {
	void shutdown().then(() => process.exit(exitCode), () => process.exit(1));
}

process.once('SIGTERM', () => stop(0));
process.once('SIGINT', () => stop(0));
process.stdin.once('end', () => stop(0));

await new Promise((resolve, reject) => {
	server.once('error', reject);
	server.listen(0, '127.0.0.1', resolve);
});
try {
	await joinSession({ canvases: [canvas] });
} catch (error) {
	await shutdown();
	throw error;
}
