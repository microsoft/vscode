/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { join } from 'node:path';
import { CanvasError, createCanvas, joinSession } from '@github/copilot-sdk/extension';

const data = process.env.VSCODE_CANVAS_DATA_DIR;
if (!data) {
	throw new Error('An approved canvas data directory is required.');
}
mkdirSync(data, { recursive: true });
const eventsFile = join(process.env.COPILOT_HOME, 'session-state', process.env.SESSION_ID, 'events.jsonl');
const events = readFileSync(eventsFile, 'utf8').trim().split('\n').map(line => JSON.parse(line));
const audit = (kind, value) => appendFileSync(join(data, 'audit.jsonl'), JSON.stringify({ kind, value }) + '\n');
audit('startup', {
	pid: process.pid, module: import.meta.url, data, sessionId: process.env.SESSION_ID,
	retained: events.some(event => event.type === 'session.retained'),
	turns: events.filter(event => event.type === 'user.message' || event.type === 'assistant.message').length,
});
const document = join(data, 'document.json');
const read = () => existsSync(document) ? JSON.parse(readFileSync(document, 'utf8')) : { value: 0 };
let session;
const server = createServer((request, response) => {
	response.setHeader('Content-Type', 'application/json');
	if (request.method === 'POST' && request.url === '/request-turn') {
		void session.sendAndWait({
			prompt: 'Canvas-originated test request: invoke increment on the open document instance.',
		}, 15_000).then(() => {
			response.end(JSON.stringify(read()));
		}, error => {
			response.writeHead(500);
			response.end(JSON.stringify({ error: error.message }));
		});
		return;
	}
	response.end(JSON.stringify({ ...read(), pid: process.pid }));
});
await new Promise((resolve, reject) => {
	server.once('error', reject);
	server.listen(0, '127.0.0.1', resolve);
});
const canvas = createCanvas({
	id: 'counter',
	displayName: 'Retained Counter',
	description: 'Offline live host contract fixture.',
	inputSchema: { type: 'object', properties: { failAfterWrite: { type: 'boolean' } }, additionalProperties: false },
	open: request => {
		writeFileSync(document, JSON.stringify(read()));
		audit('open', { instanceId: request.instanceId });
		if (request.input?.failAfterWrite) {
			throw new CanvasError('failed_after_write', 'The document was retained before this intentional failure.');
		}
		return { url: `http://127.0.0.1:${server.address().port}/`, title: 'Retained Counter', status: 'ready' };
	},
	actions: [{
		name: 'increment',
		inputSchema: { type: 'object', additionalProperties: false },
		handler: () => {
			const value = { value: read().value + 1 };
			writeFileSync(document, JSON.stringify(value));
			audit('action', value);
			return value;
		},
	}],
	onClose: request => audit('close', { instanceId: request.instanceId }),
});
const stop = () => {
	server.closeAllConnections();
	server.close(() => process.exit(0));
};
process.once('SIGTERM', stop);
process.once('SIGINT', stop);
process.stdin.once('end', stop);
session = await joinSession({ canvases: [canvas] });
