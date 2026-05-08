/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Son of Anton Contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as net from 'net';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as crypto from 'crypto';
import type { CredentialBroker } from './CredentialBroker';
import type { BrokerRequest, BrokerResponse } from './types';

const TOKEN_FILENAME = 'son-of-anton-broker.token';

/**
 * Returns the platform-appropriate socket / named-pipe path for the broker.
 *
 * On Unix the path lives in $XDG_RUNTIME_DIR (or /tmp as fallback), keeping it
 * out of the world-readable /tmp when a proper runtime dir is available.
 * On Windows a named pipe scoped to the current user's name is used.
 */
export function getSocketPath(): string {
	if (process.platform === 'win32') {
		const user = process.env['USERNAME'] ?? 'default';
		return `\\\\.\\pipe\\son-of-anton-broker-${user}`;
	}
	const dir = process.env['XDG_RUNTIME_DIR'] ?? os.tmpdir();
	return path.join(dir, 'son-of-anton-broker.sock');
}

/** Per-connection mutable state used by BrokerServer.handleConnection(). */
interface ConnectionState {
	authenticated: boolean;
}

/**
 * Localhost-only newline-delimited JSON RPC server for the CredentialBroker.
 *
 * Protocol:
 *   1. Client connects.
 *   2. Client sends: { "auth": "<sessionToken>" }
 *   3. Server responds: { "ok": true }  — or closes on mismatch.
 *   4. Client sends BrokerRequest objects; server responds with BrokerResponse objects.
 *
 * Security model: the session token is written to a user-only-readable file
 * (mode 0600). Any process running as the same user can read it; processes
 * running as a different user cannot. This provides same-user isolation
 * equivalent to SO_PEERCRED without a native addon.
 */
export class BrokerServer {
	private server: net.Server | undefined;
	private sessionToken: string | undefined;
	private tokenFilePath: string | undefined;

	constructor(private readonly broker: CredentialBroker) {}

	/**
	 * Binds the socket and writes the session token file.
	 * Returns the socket path and token file path for the model-router to read.
	 */
	async start(): Promise<{ socketPath: string; tokenFilePath: string }> {
		this.sessionToken = crypto.randomBytes(32).toString('hex');

		const socketPath = getSocketPath();
		const tokenDir = process.platform === 'win32'
			? os.tmpdir()
			: (process.env['XDG_RUNTIME_DIR'] ?? os.tmpdir());

		const tokenFilePath = path.join(tokenDir, TOKEN_FILENAME);
		this.tokenFilePath = tokenFilePath;
		fs.writeFileSync(tokenFilePath, this.sessionToken, { mode: 0o600 });

		if (process.platform !== 'win32') {
			try { fs.unlinkSync(socketPath); } catch { /* stale socket */ }
		}

		await new Promise<void>((resolve, reject) => {
			this.server = net.createServer((socket: net.Socket) => this.handleConnection(socket));
			this.server.on('error', reject);
			this.server.listen(socketPath, () => resolve());
		});

		if (process.platform !== 'win32') {
			try { fs.chmodSync(socketPath, 0o600); } catch { /* best-effort */ }
		}

		return { socketPath, tokenFilePath };
	}

	stop(): void {
		this.server?.close();
		this.server = undefined;

		if (process.platform !== 'win32') {
			try { fs.unlinkSync(getSocketPath()); } catch { /* already gone */ }
		}
		if (this.tokenFilePath) {
			try { fs.unlinkSync(this.tokenFilePath); } catch { /* already gone */ }
			this.tokenFilePath = undefined;
		}
	}

	private handleConnection(socket: net.Socket): void {
		const state: ConnectionState = { authenticated: false };
		let buffer = '';
		const queue: Array<() => Promise<void>> = [];
		let processing = false;

		const drain = async (): Promise<void> => {
			if (processing) {
				return;
			}
			processing = true;
			while (queue.length > 0) {
				const next = queue.shift()!;
				try {
					await next();
				} catch {
					socket.destroy();
					return;
				}
			}
			processing = false;
		};

		socket.on('data', (chunk: Buffer) => {
			buffer += chunk.toString('utf-8');
			const lines = buffer.split('\n');
			buffer = lines.pop() ?? '';

			for (const line of lines) {
				if (!line.trim()) {
					continue;
				}
				const captured = line;
				queue.push(() => this.handleLine(socket, captured, state));
			}
			drain().catch(() => socket.destroy());
		});

		socket.on('error', () => socket.destroy());
	}

	private async handleLine(
		socket: net.Socket,
		line: string,
		state: ConnectionState,
	): Promise<void> {
		let msg: Record<string, unknown>;
		try {
			msg = JSON.parse(line);
		} catch {
			this.send(socket, { error: 'invalid JSON' } as unknown as BrokerResponse);
			return;
		}

		if (!state.authenticated) {
			if (msg['auth'] !== this.sessionToken) {
				this.send(socket, { error: 'unauthorized' } as unknown as BrokerResponse);
				socket.destroy();
				return;
			}
			state.authenticated = true;
			socket.write(JSON.stringify({ ok: true }) + '\n');
			return;
		}

		const response = await this.dispatch(msg as unknown as BrokerRequest);
		this.send(socket, response);
	}

	private send(socket: net.Socket, response: BrokerResponse | { error: string; ok?: never }): void {
		socket.write(JSON.stringify(response) + '\n');
	}

	private async dispatch(request: BrokerRequest): Promise<BrokerResponse> {
		const { requestId } = request;
		try {
			switch (request.method) {
				case 'getToken': {
					const result = await this.broker.getToken(request.providerId);
					return { requestId, result };
				}
				case 'invalidate': {
					await this.broker.invalidate(request.providerId);
					return { requestId, result: { ok: true } };
				}
				case 'refresh': {
					await this.broker.refresh(request.providerId);
					return { requestId, result: { ok: true } };
				}
				case 'status': {
					const providers = await this.broker.status();
					return { requestId, result: { providers } };
				}
				case 'connect': {
					await this.broker.connect(request.providerId);
					return { requestId, result: { ok: true } };
				}
				case 'disconnect': {
					await this.broker.disconnect(request.providerId);
					return { requestId, result: { ok: true } };
				}
			}
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			return { requestId, error: message };
		}
	}
}
