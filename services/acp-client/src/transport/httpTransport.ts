// Copyright (c) Son of Anton Contributors. All rights reserved.
// Licensed under the MIT License.

import http from 'http';
import { EventEmitter } from 'events';
import type { JsonRpcRequest, JsonRpcResponse, JsonRpcNotification } from '../types';

/**
 * HTTP transport for ACP communication.
 *
 * Sends JSON-RPC 2.0 requests over HTTP POST and receives streaming
 * notifications via Server-Sent Events (SSE).
 */
export class HttpTransport extends EventEmitter {
	private sseController: AbortController | null = null;
	private nextId = 1;
	private connected = false;

	constructor(
		private readonly baseUrl: string,
		private readonly requestTimeout = 30000,
	) {
		super();
	}

	/** Connect to the SSE event stream. */
	async start(): Promise<void> {
		this.connected = true;
		this.startEventStream();
	}

	/** Send a JSON-RPC request and wait for a response. */
	async request(method: string, params?: unknown): Promise<JsonRpcResponse> {
		if (!this.connected) {
			throw new Error('Transport is not connected');
		}

		const id = this.nextId++;
		const request: JsonRpcRequest = {
			jsonrpc: '2.0',
			id,
			method,
			params,
		};

		return new Promise<JsonRpcResponse>((resolve, reject) => {
			const url = new URL('/rpc', this.baseUrl);
			const body = JSON.stringify(request);

			const timer = setTimeout(() => {
				reject(new Error(`Request ${method} timed out after ${this.requestTimeout}ms`));
			}, this.requestTimeout);

			const httpReq = http.request(url, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					'Content-Length': Buffer.byteLength(body),
				},
			}, (res) => {
				let data = '';
				res.on('data', (chunk: Buffer) => { data += chunk.toString(); });
				res.on('end', () => {
					clearTimeout(timer);
					try {
						const response: JsonRpcResponse = JSON.parse(data);
						resolve(response);
					} catch {
						reject(new Error(`Invalid JSON response: ${data}`));
					}
				});
			});

			httpReq.on('error', (err) => {
				clearTimeout(timer);
				reject(err);
			});

			httpReq.write(body);
			httpReq.end();
		});
	}

	/** Send a JSON-RPC notification (no response expected). */
	notify(method: string, params?: unknown): void {
		if (!this.connected) {
			throw new Error('Transport is not connected');
		}

		const notification: JsonRpcNotification = {
			jsonrpc: '2.0',
			method,
			params,
		};

		const url = new URL('/rpc', this.baseUrl);
		const body = JSON.stringify(notification);

		const httpReq = http.request(url, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				'Content-Length': Buffer.byteLength(body),
			},
		});

		httpReq.on('error', (err) => {
			this.emit('error', err);
		});

		httpReq.write(body);
		httpReq.end();
	}

	/** Disconnect from the event stream and clean up. */
	async stop(): Promise<void> {
		this.connected = false;
		this.sseController?.abort();
		this.sseController = null;
	}

	get isConnected(): boolean {
		return this.connected;
	}

	private startEventStream(): void {
		this.sseController = new AbortController();
		const url = new URL('/events', this.baseUrl);

		const req = http.request(url, {
			method: 'GET',
			headers: { 'Accept': 'text/event-stream' },
		}, (res) => {
			let buffer = '';

			res.on('data', (chunk: Buffer) => {
				buffer += chunk.toString();
				const parts = buffer.split('\n\n');
				buffer = parts.pop() ?? '';

				for (const part of parts) {
					const dataLine = part.split('\n').find(l => l.startsWith('data: '));
					if (dataLine) {
						try {
							const notification: JsonRpcNotification = JSON.parse(dataLine.slice(6));
							this.emit('notification', notification);
						} catch {
							this.emit('log', `[acp-http] Failed to parse SSE data: ${dataLine}`);
						}
					}
				}
			});

			res.on('end', () => {
				if (this.connected) {
					// Reconnect after a brief delay
					setTimeout(() => this.startEventStream(), 1000);
				}
			});
		});

		req.on('error', (err) => {
			if (this.connected) {
				this.emit('error', err);
				// Retry after delay
				setTimeout(() => this.startEventStream(), 3000);
			}
		});

		req.end();
	}
}
