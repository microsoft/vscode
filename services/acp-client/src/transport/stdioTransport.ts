// Copyright (c) Son of Anton Contributors. All rights reserved.
// Licensed under the MIT License.

import { ChildProcess, spawn } from 'child_process';
import { EventEmitter } from 'events';
import type { JsonRpcRequest, JsonRpcResponse, JsonRpcNotification } from '../types';

/**
 * Stdio transport for ACP communication.
 *
 * Launches a child process and communicates via JSON-RPC 2.0 over stdin/stdout.
 * Each message is a single JSON line terminated by a newline character.
 */
export class StdioTransport extends EventEmitter {
	private process: ChildProcess | null = null;
	private buffer = '';
	private nextId = 1;
	private pendingRequests = new Map<number | string, {
		resolve: (value: JsonRpcResponse) => void;
		reject: (reason: Error) => void;
		timer: ReturnType<typeof setTimeout>;
	}>();

	constructor(
		private readonly command: string,
		private readonly args: string[] = [],
		private readonly env?: Record<string, string>,
		private readonly requestTimeout = 30000,
	) {
		super();
	}

	/** Start the child process and begin listening for messages. */
	async start(): Promise<void> {
		const mergedEnv = { ...process.env, ...this.env };
		this.process = spawn(this.command, this.args, {
			stdio: ['pipe', 'pipe', 'pipe'],
			env: mergedEnv,
		});

		this.process.stdout?.on('data', (chunk: Buffer) => {
			this.buffer += chunk.toString('utf-8');
			this.processBuffer();
		});

		this.process.stderr?.on('data', (chunk: Buffer) => {
			const text = chunk.toString('utf-8').trim();
			if (text) {
				this.emit('log', text);
			}
		});

		this.process.on('exit', (code, signal) => {
			this.emit('exit', { code, signal });
			this.rejectAllPending(new Error(`Agent process exited with code ${code}, signal ${signal}`));
		});

		this.process.on('error', (err) => {
			this.emit('error', err);
			this.rejectAllPending(err);
		});
	}

	/** Send a JSON-RPC request and wait for a response. */
	async request(method: string, params?: unknown): Promise<JsonRpcResponse> {
		if (!this.process?.stdin?.writable) {
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
			const timer = setTimeout(() => {
				this.pendingRequests.delete(id);
				reject(new Error(`Request ${method} timed out after ${this.requestTimeout}ms`));
			}, this.requestTimeout);

			this.pendingRequests.set(id, { resolve, reject, timer });
			this.process!.stdin!.write(JSON.stringify(request) + '\n');
		});
	}

	/** Send a JSON-RPC notification (no response expected). */
	notify(method: string, params?: unknown): void {
		if (!this.process?.stdin?.writable) {
			throw new Error('Transport is not connected');
		}

		const notification: JsonRpcNotification = {
			jsonrpc: '2.0',
			method,
			params,
		};

		this.process.stdin.write(JSON.stringify(notification) + '\n');
	}

	/** Stop the child process and clean up. */
	async stop(): Promise<void> {
		this.rejectAllPending(new Error('Transport is shutting down'));

		if (this.process) {
			this.process.kill('SIGTERM');

			// Give it 5 seconds to exit gracefully
			await new Promise<void>((resolve) => {
				const timer = setTimeout(() => {
					this.process?.kill('SIGKILL');
					resolve();
				}, 5000);

				this.process!.on('exit', () => {
					clearTimeout(timer);
					resolve();
				});
			});

			this.process = null;
		}
	}

	get isConnected(): boolean {
		return this.process !== null && !this.process.killed;
	}

	private processBuffer(): void {
		const lines = this.buffer.split('\n');
		// Keep the last incomplete line in the buffer
		this.buffer = lines.pop() ?? '';

		for (const line of lines) {
			const trimmed = line.trim();
			if (!trimmed) {
				continue;
			}

			try {
				const message = JSON.parse(trimmed);
				this.handleMessage(message);
			} catch {
				this.emit('log', `[acp-stdio] Failed to parse message: ${trimmed}`);
			}
		}
	}

	private handleMessage(message: JsonRpcResponse | JsonRpcNotification): void {
		// Response to a pending request
		if ('id' in message && message.id !== undefined) {
			const pending = this.pendingRequests.get(message.id);
			if (pending) {
				clearTimeout(pending.timer);
				this.pendingRequests.delete(message.id);
				pending.resolve(message as JsonRpcResponse);
			}
			return;
		}

		// Notification from the agent
		if ('method' in message) {
			this.emit('notification', message);
		}
	}

	private rejectAllPending(error: Error): void {
		for (const [id, pending] of this.pendingRequests) {
			clearTimeout(pending.timer);
			pending.reject(error);
			this.pendingRequests.delete(id);
		}
	}
}
