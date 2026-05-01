// Copyright (c) Son-Of-Anton. All rights reserved.
// Licensed under the MIT License.

import * as net from 'node:net';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

const DEFAULT_TOKEN_FILENAME = 'son-of-anton-broker.token';

export function defaultBrokerSocketPath(): string {
	if (process.platform === 'win32') {
		const user = process.env['USERNAME'] ?? 'default';
		return `\\\\.\\pipe\\son-of-anton-broker-${user}`;
	}
	const dir = process.env['XDG_RUNTIME_DIR'] ?? os.tmpdir();
	return path.join(dir, 'son-of-anton-broker.sock');
}

export function defaultBrokerTokenPath(): string {
	const dir = process.platform === 'win32'
		? os.tmpdir()
		: (process.env['XDG_RUNTIME_DIR'] ?? os.tmpdir());
	return path.join(dir, DEFAULT_TOKEN_FILENAME);
}

export interface BrokerTokenRecord {
	readonly token: string;
	readonly expiresAt: number;
	readonly headers?: Record<string, string>;
}

/**
 * Localhost RPC client for the IDE's CredentialBroker.
 *
 * Exposes only the surface the model-router actually needs: getToken /
 * invalidate. The IDE retains exclusive responsibility for OAuth flows.
 *
 * Each method opens a fresh connection. The session token is read from
 * disk on every call so that a broker restart (which rotates the session
 * token) doesn't strand long-lived adapter instances with a stale token.
 */
export class BrokerClient {
	constructor(
		private readonly socketPath: string = defaultBrokerSocketPath(),
		private readonly tokenPath: string = defaultBrokerTokenPath(),
	) {}

	async getToken(providerId: string): Promise<BrokerTokenRecord> {
		const response = await this.rpc({
			method: 'getToken',
			providerId,
			requestId: this.newRequestId(),
		});
		if ('error' in response) {
			throw new Error(`broker getToken failed: ${response.error}`);
		}
		return response.result as BrokerTokenRecord;
	}

	async invalidate(providerId: string): Promise<void> {
		const response = await this.rpc({
			method: 'invalidate',
			providerId,
			requestId: this.newRequestId(),
		});
		if ('error' in response) {
			throw new Error(`broker invalidate failed: ${response.error}`);
		}
	}

	private newRequestId(): string {
		return `mr-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
	}

	private readSessionToken(): string {
		try {
			return fs.readFileSync(this.tokenPath, 'utf-8').trim();
		} catch (err) {
			const cause = err instanceof Error ? err.message : String(err);
			throw new Error(`Cannot read broker session token at ${this.tokenPath}: ${cause}`);
		}
	}

	/**
	 * Single-shot RPC: connect, authenticate, send one request, await one
	 * response, close. Brokers framing as newline-delimited JSON.
	 */
	private rpc(request: object): Promise<{ result: unknown } | { error: string }> {
		const sessionToken = this.readSessionToken();

		return new Promise((resolve, reject) => {
			let buffer = '';
			let authDone = false;
			let settled = false;

			const settle = (value: { result: unknown } | { error: string }): void => {
				if (settled) {
					return;
				}
				settled = true;
				socket.end();
				resolve(value);
			};

			const fail = (err: Error): void => {
				if (settled) {
					return;
				}
				settled = true;
				socket.destroy();
				reject(err);
			};

			const socket = net.createConnection(this.socketPath, () => {
				socket.write(JSON.stringify({ auth: sessionToken }) + '\n');
			});

			socket.on('data', (chunk: Buffer) => {
				buffer += chunk.toString('utf-8');
				const lines = buffer.split('\n');
				buffer = lines.pop() ?? '';

				for (const line of lines) {
					if (!line.trim()) {
						continue;
					}
					let msg: Record<string, unknown>;
					try {
						msg = JSON.parse(line) as Record<string, unknown>;
					} catch {
						fail(new Error(`broker returned invalid JSON: ${line}`));
						return;
					}

					if (!authDone) {
						authDone = true;
						if (msg['ok']) {
							socket.write(JSON.stringify(request) + '\n');
						} else {
							fail(new Error(`broker auth rejected: ${JSON.stringify(msg)}`));
						}
						continue;
					}

					if ('error' in msg && typeof msg['error'] === 'string') {
						settle({ error: msg['error'] });
					} else if ('result' in msg) {
						settle({ result: msg['result'] });
					} else {
						fail(new Error(`broker returned malformed response: ${line}`));
					}
				}
			});

			socket.on('error', fail);
			socket.on('close', () => {
				if (!settled) {
					fail(new Error('broker connection closed before response'));
				}
			});
		});
	}
}
