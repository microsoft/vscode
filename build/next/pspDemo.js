/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// @ts-check

// Standalone PSP demo. Run with `node build/next/pspDemo.js` inside an integrated terminal of a
// dev Code-OSS build. Cycles through a few fake statuses so you can watch the psp:/ document live.
//
// Optional CLI args: list of statuses to cycle through (default: idle, working, finalizing).
// Optional env var: PSP_DEMO_INTERVAL_MS (default 1500).

import net from 'node:net';

const ENV_ENDPOINT = 'PROCESS_STATE_PROTOCOL_ENDPOINT';
const ENV_TOKEN = 'PROCESS_STATE_PROTOCOL_TOKEN';

const endpoint = process.env[ENV_ENDPOINT];
const token = process.env[ENV_TOKEN];
if (!endpoint || !token) {
	console.error(`[psp-demo] missing ${ENV_ENDPOINT} / ${ENV_TOKEN} — run me from a dev Code-OSS terminal.`);
	process.exit(1);
}

const statuses = process.argv.slice(2);
if (statuses.length === 0) {
	statuses.push('idle', 'working', 'finalizing');
}
const intervalMs = Number(process.env.PSP_DEMO_INTERVAL_MS) || 1500;

const socket = net.createConnection(endpoint);
socket.setEncoding('utf8');

let nextId = 1;
const pending = new Map();
let buffer = '';

socket.on('data', chunk => {
	buffer += chunk;
	let nl = buffer.indexOf('\n');
	while (nl !== -1) {
		const line = buffer.slice(0, nl);
		buffer = buffer.slice(nl + 1);
		nl = buffer.indexOf('\n');
		if (!line) { continue; }
		let msg;
		try { msg = JSON.parse(line); } catch { continue; }
		if (typeof msg.id === 'number' && pending.has(msg.id)) {
			const { resolve, reject } = pending.get(msg.id);
			pending.delete(msg.id);
			msg.error ? reject(new Error(`${msg.error.code}: ${msg.error.message}`)) : resolve(msg.result);
		}
	}
});
socket.on('error', err => console.error(`[psp-demo] socket error: ${err.message}`));
socket.on('close', () => process.exit(0));

function send(payload) {
	socket.write(JSON.stringify(payload) + '\n');
}

function request(method, params) {
	const id = nextId++;
	return new Promise((resolve, reject) => {
		pending.set(id, { resolve, reject });
		send({ jsonrpc: '2.0', id, method, params });
	});
}

let cycling = false;

async function main() {
	await new Promise((resolve, reject) => {
		socket.once('connect', resolve);
		socket.once('error', reject);
	});
	await request('initialize', {
		token,
		protocolVersion: 0,
		client: { name: 'psp-demo', version: '0.1.0' },
	});
	console.log(`[psp-demo] connected; cycling statuses [${statuses.join(', ')}] every ${intervalMs}ms. Ctrl+C to stop.`);

	cycling = true;
	let i = 0;
	while (cycling) {
		const status = statuses[i % statuses.length];
		console.log(`[psp-demo] -> ${status}`);
		send({ jsonrpc: '2.0', method: 'session/update', params: { doc: { status } } });
		i++;
		await new Promise(r => setTimeout(r, intervalMs));
	}
}

function shutdown() {
	cycling = false;
	try {
		send({ jsonrpc: '2.0', method: 'session/close', params: {} });
		socket.end();
	} catch { /* ignore */ }
	setTimeout(() => process.exit(0), 200).unref();
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

main().catch(err => {
	console.error(`[psp-demo] failed: ${err.message}`);
	process.exit(1);
});
