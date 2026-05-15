/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Process State Protocol publisher (build-side helper).
 *
 * Connects to the PSP hub advertised by the parent VS Code process via the env vars
 * `PROCESS_STATE_PROTOCOL_ENDPOINT` and `PROCESS_STATE_PROTOCOL_TOKEN`, and pushes a single
 * `{ status: string }` document. All operations are best-effort — failures are logged and the
 * publisher silently degrades into a no-op so the build always proceeds.
 */

import * as net from 'net';

const ENV_VAR_ENDPOINT = 'PROCESS_STATE_PROTOCOL_ENDPOINT';
const ENV_VAR_TOKEN = 'PROCESS_STATE_PROTOCOL_TOKEN';
const PROTOCOL_VERSION = 0;

export interface IPspPublisher {
	/** Replace the entire watch document. Must include at least a `status` field. */
	setDoc(doc: { status: string;[key: string]: unknown }): void;
	close(): void;
}

const NOOP_PUBLISHER: IPspPublisher = {
	setDoc() { /* noop */ },
	close() { /* noop */ },
};

/**
 * Tries to connect and initialize a PSP session. Returns a no-op publisher if the env vars
 * are missing or the connection / initialize handshake fails.
 */
export async function connectPspPublisher(clientName: string): Promise<IPspPublisher> {
	const endpoint = process.env[ENV_VAR_ENDPOINT];
	const token = process.env[ENV_VAR_TOKEN];
	if (!endpoint || !token) {
		return NOOP_PUBLISHER;
	}

	let socket: net.Socket;
	try {
		socket = await openSocket(endpoint);
	} catch (err) {
		console.log(`[psp] failed to connect to hub at ${endpoint}: ${(err as Error).message}`);
		return NOOP_PUBLISHER;
	}

	let nextRequestId = 1;
	const pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>();

	let buffer = '';
	socket.setEncoding('utf8');
	socket.on('data', (chunk: string) => {
		buffer += chunk;
		let nl = buffer.indexOf('\n');
		while (nl !== -1) {
			const line = buffer.slice(0, nl);
			buffer = buffer.slice(nl + 1);
			nl = buffer.indexOf('\n');
			if (!line) {
				continue;
			}
			let msg: { id?: number; result?: unknown; error?: { code: number; message: string } };
			try {
				msg = JSON.parse(line);
			} catch {
				continue;
			}
			if (typeof msg.id === 'number') {
				const handler = pending.get(msg.id);
				if (handler) {
					pending.delete(msg.id);
					if (msg.error) {
						handler.reject(new Error(`${msg.error.code}: ${msg.error.message}`));
					} else {
						handler.resolve(msg.result);
					}
				}
			}
		}
	});

	let closed = false;
	const onClose = () => {
		closed = true;
		for (const { reject } of pending.values()) {
			reject(new Error('Connection closed'));
		}
		pending.clear();
	};
	socket.on('close', onClose);
	socket.on('error', err => console.log(`[psp] socket error: ${err.message}`));

	const send = (payload: object) => {
		if (closed) {
			return;
		}
		try {
			socket.write(JSON.stringify(payload) + '\n');
		} catch (err) {
			console.log(`[psp] write failed: ${(err as Error).message}`);
		}
	};

	const request = (method: string, params: unknown): Promise<unknown> => {
		const id = nextRequestId++;
		return new Promise((resolve, reject) => {
			pending.set(id, { resolve, reject });
			send({ jsonrpc: '2.0', id, method, params });
		});
	};

	try {
		await request('initialize', {
			token,
			protocolVersion: PROTOCOL_VERSION,
			client: { name: clientName, version: '0.1.0' },
		});
	} catch (err) {
		console.log(`[psp] initialize failed: ${(err as Error).message}`);
		socket.destroy();
		return NOOP_PUBLISHER;
	}

	let lastSerialized: string | undefined;

	return {
		setDoc(doc) {
			if (closed) {
				return;
			}
			const serialized = JSON.stringify(doc);
			if (serialized === lastSerialized) {
				return;
			}
			lastSerialized = serialized;
			send({ jsonrpc: '2.0', method: 'session/update', params: { doc } });
		},
		close() {
			if (closed) {
				return;
			}
			send({ jsonrpc: '2.0', method: 'session/close', params: {} });
			socket.end();
		},
	};
}

function openSocket(endpoint: string): Promise<net.Socket> {
	return new Promise((resolve, reject) => {
		const socket = net.createConnection(endpoint);
		const onError = (err: Error) => {
			socket.removeListener('connect', onConnect);
			reject(err);
		};
		const onConnect = () => {
			socket.removeListener('error', onError);
			resolve(socket);
		};
		socket.once('error', onError);
		socket.once('connect', onConnect);
	});
}
