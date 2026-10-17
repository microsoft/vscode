/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import WebSocket from 'ws';

export const maxBufferedBytes = 8 * 1024 * 1024;
export const timeoutMs = 30_000;

export function record(value: unknown, context: string): Record<string, unknown> {
	if (!value || typeof value !== 'object' || Array.isArray(value)) {
		throw new Error(`Malformed ${context}: expected an object.`);
	}
	return value as Record<string, unknown>;
}

export function text(value: unknown, context: string): string {
	if (typeof value !== 'string') {
		throw new Error(`Malformed ${context}: expected text.`);
	}
	return value;
}

export async function deadline<T>(operation: Promise<T>, label: string, signal?: AbortSignal, milliseconds = timeoutMs): Promise<T> {
	let timer: NodeJS.Timeout | undefined;
	let onAbort: (() => void) | undefined;
	try {
		return await Promise.race([
			operation,
			new Promise<never>((_, reject) => {
				timer = setTimeout(() => reject(new Error(`${label} timed out.`)), milliseconds);
				onAbort = () => reject(new Error(`${label} cancelled.`));
				if (signal?.aborted) {
					onAbort();
				} else {
					signal?.addEventListener('abort', onAbort, { once: true });
				}
			}),
		]);
	} finally {
		clearTimeout(timer);
		if (onAbort) {
			signal?.removeEventListener('abort', onAbort);
		}
	}
}

/** Buffers frames immediately, including gateway messages sent alongside the WebSocket upgrade. */
export class MessageConnection {
	private readonly queue: { value: Record<string, unknown>; bytes: number }[] = [];
	private queuedBytes = 0;
	private waiter: { resolve(value: Record<string, unknown>): void; reject(error: Error): void } | undefined;
	private failure: Error | undefined;
	private pongReceived = true;
	private readonly heartbeat: NodeJS.Timeout;

	constructor(readonly socket: WebSocket) {
		socket.on('message', this.onMessage);
		socket.on('close', this.onClose);
		socket.on('error', this.onError);
		socket.on('pong', this.onPong);
		this.heartbeat = setInterval(() => {
			if (socket.readyState !== WebSocket.OPEN) {
				return;
			}
			if (!this.pongReceived) {
				this.fail(new Error('Connection heartbeat timed out. The remote shell may still be running.'));
				return;
			}
			this.pongReceived = false;
			socket.ping();
		}, timeoutMs);
	}

	private readonly onMessage = (data: WebSocket.RawData, binary: boolean): void => {
		try {
			if (binary) {
				throw new Error('Unexpected binary protocol frame.');
			}
			const buffer = Array.isArray(data) ? Buffer.concat(data) : Buffer.from(data);
			if (buffer.byteLength > maxBufferedBytes) {
				throw new Error('Protocol message exceeds the buffer limit.');
			}
			let parsed: unknown;
			try {
				parsed = JSON.parse(buffer.toString('utf8'));
			} catch {
				throw new Error('Malformed protocol JSON.');
			}
			const value = record(parsed, 'protocol message');
			if (this.waiter) {
				const waiter = this.waiter;
				this.waiter = undefined;
				waiter.resolve(value);
			} else {
				this.queuedBytes += buffer.byteLength;
				if (this.queuedBytes > maxBufferedBytes) {
					throw new Error('Incoming protocol buffer overflow.');
				}
				this.queue.push({ value, bytes: buffer.byteLength });
			}
		} catch (error) {
			this.fail(error instanceof Error ? error : new Error('Invalid protocol message.'));
		}
	};

	private readonly onClose = (): void => this.fail(new Error('Tunnel disconnected. The remote shell may still be running.'));
	private readonly onError = (): void => this.fail(new Error('Tunnel WebSocket failed.'));
	private readonly onPong = (): void => { this.pongReceived = true; };

	async read(): Promise<Record<string, unknown>> {
		if (this.failure) {
			throw this.failure;
		}
		const next = this.queue.shift();
		if (next) {
			this.queuedBytes -= next.bytes;
			return next.value;
		}
		if (this.waiter) {
			throw new Error('Concurrent protocol reads are not supported.');
		}
		return new Promise((resolve, reject) => { this.waiter = { resolve, reject }; });
	}

	send(value: object): void {
		if (this.failure) {
			throw this.failure;
		}
		const json = JSON.stringify(value);
		if (this.socket.readyState !== WebSocket.OPEN) {
			throw new Error('Tunnel is not connected.');
		}
		if (this.socket.bufferedAmount + Buffer.byteLength(json) > maxBufferedBytes) {
			throw new Error('Outgoing protocol buffer overflow.');
		}
		this.socket.send(json, error => {
			if (error) {
				this.fail(new Error('Unable to send a tunnel message.'));
			}
		});
	}

	private fail(error: Error): void {
		if (this.failure) {
			return;
		}
		this.failure = error;
		clearInterval(this.heartbeat);
		this.queue.length = 0;
		this.queuedBytes = 0;
		this.waiter?.reject(error);
		this.waiter = undefined;
		this.socket.off('message', this.onMessage);
		this.socket.off('pong', this.onPong);
		// Retain the error handler until close: terminate() can itself emit an error.
		if (this.socket.readyState === WebSocket.CLOSED) {
			this.socket.off('error', this.onError);
			this.socket.off('close', this.onClose);
		} else {
			this.socket.once('close', () => {
				this.socket.off('error', this.onError);
				this.socket.off('close', this.onClose);
			});
			this.socket.terminate();
		}
	}

	dispose(): void {
		this.fail(new Error('Connection closed.'));
	}
}

export class ProtocolClient {
	private nextId = 0;
	private clientSeq = 0;
	private readonly pending = new Map<number, { resolve(value: unknown): void; reject(error: Error): void }>();
	private readonly notifications = new Set<(method: string, params: Record<string, unknown>) => void>();
	private readonly failures = new Set<(error: Error) => void>();
	private failure: Error | undefined;
	private disposed = false;

	constructor(private readonly connection: MessageConnection) {
		void this.pump();
	}

	onNotification(listener: (method: string, params: Record<string, unknown>) => void): () => void {
		this.notifications.add(listener);
		return () => this.notifications.delete(listener);
	}

	onFailure(listener: (error: Error) => void): () => void {
		this.failures.add(listener);
		if (this.failure) {
			listener(this.failure);
		}
		return () => this.failures.delete(listener);
	}

	async request(method: string, params: object, milliseconds = timeoutMs): Promise<unknown> {
		if (this.failure || this.disposed) {
			throw this.failure ?? new Error('Protocol client closed.');
		}
		const id = ++this.nextId;
		try {
			return await deadline(new Promise((resolve, reject) => {
				this.pending.set(id, { resolve, reject });
				this.connection.send({ jsonrpc: '2.0', id, method, params });
			}), method, undefined, milliseconds);
		} finally {
			this.pending.delete(id);
		}
	}

	dispatch(channel: string, action: object): void {
		this.connection.send({
			jsonrpc: '2.0',
			method: 'dispatchAction',
			params: { channel, clientSeq: ++this.clientSeq, action },
		});
	}

	private async pump(): Promise<void> {
		try {
			while (!this.disposed) {
				const message = await this.connection.read();
				if (message.jsonrpc !== '2.0') {
					throw new Error('Expected a JSON-RPC 2.0 message.');
				}
				if (typeof message.method === 'string') {
					if ('id' in message) {
						// This terminal-only client does not execute reverse RPC, tools, or authentication requests.
						this.connection.send({ jsonrpc: '2.0', id: message.id, error: { code: -32601, message: 'Method not supported by terminal client.' } });
					} else {
						const params = record(message.params, 'notification');
						for (const listener of this.notifications) {
							listener(message.method, params);
						}
					}
				} else if (typeof message.id === 'number') {
					const pending = this.pending.get(message.id);
					if (!pending) {
						continue;
					}
					this.pending.delete(message.id);
					if ('error' in message) {
						const error = record(message.error, 'RPC error');
						pending.reject(new Error(`Agent host rejected the request (${error.code}): ${text(error.message, 'RPC error message')}`));
					} else if ('result' in message) {
						pending.resolve(message.result);
					} else {
						pending.reject(new Error('Malformed RPC response: missing result.'));
					}
				} else {
					throw new Error('Malformed JSON-RPC message.');
				}
			}
		} catch (error) {
			this.failure = error instanceof Error ? error : new Error('Protocol failed.');
			for (const pending of this.pending.values()) {
				pending.reject(this.failure);
			}
			this.pending.clear();
			if (!this.disposed) {
				for (const listener of this.failures) {
					listener(this.failure);
				}
			}
			this.connection.dispose();
		}
	}

	dispose(): void {
		this.disposed = true;
		this.connection.dispose();
		this.notifications.clear();
		this.failures.clear();
	}
}
