/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createServer, type Server } from 'node:http';
import type { Socket } from 'node:net';
import { types } from 'node:util';
import { WebSocket, WebSocketServer } from 'ws';
import { maxBufferedBytes, maxMessageBytes, parseClientMessage, parseServerMessage, type ClientMessage, type ServerMessage } from './protocol';
import { relayApprovalPendingMessage, relayCapacityMessage, relayMaxBatchBytes, relayMaxBatchMessages, validateRelayBatch, type RemoteRelayTransport } from './relayProtocol';

export function getRelayAdmissionMessage(error: unknown): string | undefined {
	if (types.isNativeError(error)) {
		const message = error.message;
		if (message === relayApprovalPendingMessage || message === relayCapacityMessage) {
			return message;
		}
	}
	return undefined;
}

export interface LocalRelayConnectionOptions {
	transport: RemoteRelayTransport;
	onError(error: Error): void;
	onClose(): void;
	startTimeoutMs?: number;
	heartbeatMs?: number;
	openTimeoutMs?: number;
	readTimeoutMs?: number;
	writeTimeoutMs?: number;
	closeTimeoutMs?: number;
	socketCloseTimeoutMs?: number;
}

export interface LocalRelayOptions extends LocalRelayConnectionOptions {
	idleTimeoutMs?: number;
}

export class LocalRelayListener {
	private readonly server: Server;
	private readonly webSockets: WebSocketServer;
	private readonly sockets = new Set<Socket>();
	private readonly upgradedSockets = new Set<Socket>();
	private started = false;
	private closed = false;

	constructor(private readonly options: {
		canAccept(): boolean;
		accept(socket: WebSocket): void;
		onError(error: Error): void;
	}) {
		this.server = createServer((_request, response) => {
			response.writeHead(404, { 'Cache-Control': 'no-store' });
			response.end();
		});
		this.server.requestTimeout = 10_000;
		this.server.headersTimeout = 10_000;
		this.server.maxConnections = 16;
		this.webSockets = new WebSocketServer({ noServer: true, maxPayload: maxMessageBytes, perMessageDeflate: false });
		this.webSockets.on('error', error => this.options.onError(error));
		this.server.on('connection', socket => {
			this.sockets.add(socket);
			socket.setTimeout(10_000, () => socket.destroy());
			socket.on('error', () => socket.destroy());
			socket.once('close', () => {
				this.sockets.delete(socket);
				this.upgradedSockets.delete(socket);
			});
		});
		this.server.on('upgrade', (request, socket, head) => {
			if (request.headers.origin !== undefined || request.headers.authorization !== undefined) {
				socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');
				return;
			}
			if (request.url !== '/terminal') {
				socket.end('HTTP/1.1 404 Not Found\r\nConnection: close\r\n\r\n');
				return;
			}
			if (this.closed || !this.options.canAccept()) {
				socket.end('HTTP/1.1 409 Conflict\r\nConnection: close\r\n\r\n');
				return;
			}
			this.webSockets.handleUpgrade(request, socket, head, client => {
				this.upgradedSockets.add(request.socket);
				request.socket.setTimeout(0);
				this.options.accept(client);
			});
		});
	}

	async start(): Promise<{ url: string }> {
		if (this.closed || this.started) {
			throw new Error('This local terminal relay has already been started or closed.');
		}
		this.started = true;
		try {
			await new Promise<void>((resolve, reject) => {
				const cleanup = () => {
					this.server.removeListener('error', onError);
					this.server.removeListener('listening', onListening);
					this.server.removeListener('close', onClose);
				};
				const onError = (error: Error) => {
					cleanup();
					reject(error);
				};
				const onListening = () => {
					cleanup();
					resolve();
				};
				const onClose = () => {
					cleanup();
					reject(new Error('The local terminal relay was stopped while starting.'));
				};
				this.server.once('error', onError);
				this.server.once('listening', onListening);
				this.server.once('close', onClose);
				this.server.listen(0, '127.0.0.1');
			});
			this.server.on('error', error => this.options.onError(error));
			if (this.closed) {
				this.server.close();
				throw new Error('The local terminal relay was stopped while starting.');
			}
			const address = this.server.address();
			if (!address || typeof address === 'string') {
				throw new Error('The local terminal relay did not obtain a local port.');
			}
			return { url: `http://127.0.0.1:${address.port}/terminal` };
		} catch (error) {
			this.dispose();
			throw error;
		}
	}

	dispose(): void {
		if (this.closed) {
			return;
		}
		this.closed = true;
		this.server.close();
		this.webSockets.close();
		for (const socket of this.sockets) {
			if (!this.upgradedSockets.has(socket)) {
				socket.destroy();
			}
		}
	}
}

export class LocalRelay {
	private readonly listener: LocalRelayListener;
	private readonly connection: LocalRelayConnection;
	private timer: NodeJS.Timeout | undefined;
	private closed = false;
	private claimed = false;

	constructor(private readonly options: LocalRelayOptions) {
		this.listener = new LocalRelayListener({
			canAccept: () => !this.claimed,
			accept: socket => {
				this.claimed = true;
				clearTimeout(this.timer);
				this.connection.attach(socket);
			},
			onError: error => {
				options.onError(error);
				this.dispose();
			},
		});
		this.connection = new LocalRelayConnection({
			...options,
			onClose: () => this.dispose(),
		});
	}

	async start(): Promise<{ url: string }> {
		try {
			const endpoint = await this.listener.start();
			if (this.closed) {
				throw new Error('The local terminal relay was stopped while starting.');
			}
			this.timer = setTimeout(() => this.dispose(), this.options.idleTimeoutMs ?? 5 * 60_000);
			return endpoint;
		} catch (error) {
			this.dispose();
			throw error;
		}
	}

	dispose(): void {
		if (this.closed) {
			return;
		}
		this.closed = true;
		clearTimeout(this.timer);
		this.listener.dispose();
		this.connection.dispose();
		this.options.onClose();
	}
}

export class LocalRelayConnection {
	private readonly pendingWrites: { message: string; bytes: number }[] = [];
	private readonly cancellations = new Set<() => void>();
	private socket: WebSocket | undefined;
	private timer: NodeJS.Timeout | undefined;
	private heartbeat: NodeJS.Timeout | undefined;
	private closeTimer: NodeJS.Timeout | undefined;
	private pollTimer: NodeJS.Timeout | undefined;
	private finishPoll: (() => void) | undefined;
	private bufferedBytes = 0;
	private closed = false;
	private opened = false;
	private writing = false;
	private startRequested = false;
	private alive = true;

	constructor(private readonly options: LocalRelayConnectionOptions) { }

	attach(socket: WebSocket): void {
		if (this.closed || this.socket) {
			throw new Error('This local terminal connection has already been attached or closed.');
		}
		this.socket = socket;
		this.timer = setTimeout(() => this.fail(new Error('The client did not start a terminal in time.')), this.options.startTimeoutMs ?? 10_000);
		socket.on('error', error => this.fail(error));
		socket.once('close', () => {
			this.dispose();
			this.destroySockets();
		});
		socket.on('pong', () => { this.alive = true; });
		this.heartbeat = setInterval(() => {
			if (!this.alive) {
				this.fail(new Error('The terminal client stopped responding.'));
				return;
			}
			this.alive = false;
			socket.ping(undefined, undefined, error => {
				if (error) {
					this.fail(error);
				}
			});
		}, this.options.heartbeatMs ?? 15_000);
		socket.on('message', (data, isBinary) => {
			if (this.closed) {
				return;
			}
			try {
				if (isBinary) {
					throw new Error('Binary terminal control messages are not supported.');
				}
				const text = data.toString();
				const bytes = Buffer.byteLength(text);
				if (bytes > relayMaxBatchBytes || this.bufferedBytes + bytes > maxBufferedBytes) {
					throw new Error('The terminal connection exceeded its input buffer limit.');
				}
				let message: ClientMessage;
				try {
					message = parseClientMessage(text);
				} catch {
					throw new Error('Invalid terminal client message.');
				}
				if (message.type === 'start') {
					if (this.startRequested) {
						throw new Error('The terminal has already been started.');
					}
					this.startRequested = true;
					clearTimeout(this.timer);
				} else if (!this.startRequested) {
					throw new Error('The terminal has not been started.');
				}
				this.pendingWrites.push({ message: text, bytes });
				this.bufferedBytes += bytes;
				this.writePending();
			} catch (error) {
				this.fail(error);
			}
		});
		void this.openRemote().catch(error => this.fail(error));
	}

	private async openRemote(): Promise<void> {
		try {
			const opening = this.options.transport.open();
			// A command cannot be cancelled across extension hosts. Close again if
			// an in-flight open succeeds after this relay has already been stopped.
			void opening.then(() => {
				if (this.closed) {
					this.closeRemote();
				}
			}, () => { });
			await this.call('open', () => opening, this.options.openTimeoutMs ?? 15_000);
		} catch (error) {
			const message = getRelayAdmissionMessage(error);
			if (message && !this.closed) {
				await this.send(JSON.stringify({ type: 'error', message } satisfies ServerMessage));
			}
			throw error;
		}
		if (this.closed) {
			return;
		}
		this.opened = true;
		this.writePending();
		await this.readRemote();
	}

	private writePending(): void {
		if (this.closed || !this.opened || this.writing || this.pendingWrites.length === 0) {
			return;
		}
		this.writing = true;
		void this.flushWrites().catch(error => this.fail(error)).finally(() => {
			this.writing = false;
		});
	}

	private async flushWrites(): Promise<void> {
		while (!this.closed && this.pendingWrites.length > 0) {
			let bytes = 0;
			let count = 0;
			for (const pending of this.pendingWrites) {
				if (count === relayMaxBatchMessages || bytes + pending.bytes > relayMaxBatchBytes) {
					break;
				}
				bytes += pending.bytes;
				count++;
			}
			const messages = this.pendingWrites.splice(0, count).map(pending => pending.message);
			await this.call('write', () => this.options.transport.write(messages), this.options.writeTimeoutMs ?? 15_000);
			if (!this.closed) {
				this.bufferedBytes -= bytes;
			}
		}
	}

	private async readRemote(): Promise<void> {
		while (!this.closed) {
			const batch = await this.call('read', () => this.options.transport.read(), this.options.readTimeoutMs ?? 20_000);
			if (this.closed) {
				return;
			}
			validateRelayBatch(batch);
			for (const message of batch.messages) {
				try {
					parseServerMessage(message);
				} catch {
					throw new Error('Invalid terminal server message.');
				}
			}
			for (const message of batch.messages) {
				await this.send(message);
				if (this.closed) {
					return;
				}
			}
			if (batch.closeCode !== undefined) {
				this.shutdown(batch.closeCode === 1000 ? 1000 : batch.closeCode === 1001 ? 1001 : 1011);
				return;
			}
			if (batch.messages.length === 0) {
				await new Promise<void>(resolve => {
					this.finishPoll = resolve;
					this.pollTimer = setTimeout(resolve, 25);
				});
				this.finishPoll = undefined;
			}
		}
	}

	private async send(message: string): Promise<void> {
		const socket = this.socket;
		if (this.closed || socket?.readyState !== WebSocket.OPEN) {
			return;
		}
		if (socket.bufferedAmount + Buffer.byteLength(message) > maxBufferedBytes) {
			throw new Error('The terminal connection exceeded its output buffer limit.');
		}
		await this.call('delivery', () => new Promise<void>((resolve, reject) => {
			socket.send(message, error => error ? reject(error) : resolve());
		}), this.options.writeTimeoutMs ?? 15_000);
	}

	private call<T>(operation: string, callback: () => Promise<T>, timeoutMs: number): Promise<T> {
		if (this.closed) {
			return Promise.reject(new Error('The local terminal relay was stopped.'));
		}
		return new Promise<T>((resolve, reject) => {
			const cleanup = () => {
				clearTimeout(timer);
				this.cancellations.delete(cancel);
			};
			const cancel = () => {
				cleanup();
				reject(new Error('The local terminal relay was stopped.'));
			};
			const timer = setTimeout(() => {
				cleanup();
				reject(new Error(`The terminal relay ${operation} operation timed out.`));
			}, timeoutMs);
			this.cancellations.add(cancel);
			try {
				void callback().then(value => {
					cleanup();
					resolve(value);
				}, error => {
					cleanup();
					reject(error);
				});
			} catch (error) {
				cleanup();
				reject(error);
			}
		});
	}

	private fail(error: unknown): void {
		if (!this.closed) {
			this.options.onError(error instanceof Error ? error : new Error('The local terminal relay failed.'));
			this.shutdown(1011);
		}
	}

	private closeRemote(): void {
		let settled = false;
		const timer = setTimeout(() => {
			settled = true;
			this.options.onError(new Error('The terminal relay close operation timed out.'));
		}, this.options.closeTimeoutMs ?? 15_000);
		timer.unref();
		const failed = () => {
			clearTimeout(timer);
			if (!settled) {
				settled = true;
				this.options.onError(new Error('The remote terminal relay could not be closed.'));
			}
		};
		try {
			void this.options.transport.close().then(() => {
				settled = true;
				clearTimeout(timer);
			}, failed);
		} catch {
			failed();
		}
	}

	dispose(): void {
		this.shutdown(1001);
	}

	private shutdown(code: 1000 | 1001 | 1011): void {
		if (this.closed) {
			return;
		}
		this.closed = true;
		clearTimeout(this.timer);
		clearInterval(this.heartbeat);
		clearTimeout(this.pollTimer);
		this.finishPoll?.();
		for (const cancel of this.cancellations) {
			cancel();
		}
		this.pendingWrites.length = 0;
		this.bufferedBytes = 0;
		if (this.socket && this.socket.readyState !== WebSocket.CLOSED) {
			this.socket.close(code);
			this.closeTimer = setTimeout(() => this.destroySockets(), this.options.socketCloseTimeoutMs ?? 500);
		} else {
			this.destroySockets();
		}
		this.closeRemote();
		this.options.onClose();
	}

	private destroySockets(): void {
		clearTimeout(this.closeTimer);
		this.socket?.terminate();
	}
}
