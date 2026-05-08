/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { ChildProcessWithoutNullStreams, spawn } from 'node:child_process';

export type JsonRpcId = number | string;

export interface JsonRpcRequest {
	jsonrpc: '2.0';
	id: JsonRpcId;
	method: string;
	params?: unknown;
}

export interface JsonRpcResponse {
	jsonrpc: '2.0';
	id: JsonRpcId;
	result?: unknown;
	error?: { code: number; message: string; data?: unknown };
}

export interface JsonRpcNotification {
	jsonrpc: '2.0';
	method: string;
	params?: unknown;
}

export type JsonRpcMessage = JsonRpcRequest | JsonRpcResponse | JsonRpcNotification;

export interface McpStdioTransportOptions {
	command: string;
	args: string[];
	env?: Record<string, string>;
	cwd?: string;
}

type MessageHandler = (msg: JsonRpcMessage) => void;
type CloseHandler = (code: number | null) => void;
type ErrorHandler = (err: Error) => void;

export class McpStdioTransport {
	private readonly options: McpStdioTransportOptions;
	private child: ChildProcessWithoutNullStreams | undefined;
	private buffer = '';
	private messageHandler: MessageHandler | undefined;
	private closeHandler: CloseHandler | undefined;
	private errorHandler: ErrorHandler | undefined;
	private disposed = false;

	constructor(options: McpStdioTransportOptions) {
		this.options = options;
	}

	start(): void {
		if (this.child) {
			return;
		}
		const env: NodeJS.ProcessEnv = { ...process.env, ...(this.options.env ?? {}) };
		const child = spawn(this.options.command, this.options.args, {
			env,
			cwd: this.options.cwd,
			stdio: ['pipe', 'pipe', 'pipe'],
		}) as ChildProcessWithoutNullStreams;
		this.child = child;

		child.stdout.setEncoding('utf8');
		child.stdout.on('data', (chunk: string) => this.handleStdoutChunk(chunk));

		child.stderr.setEncoding('utf8');
		child.stderr.on('data', (chunk: string) => {
			const text = chunk.endsWith('\n') ? chunk.slice(0, -1) : chunk;
			if (text.length > 0) {
				console.warn(`[mcp:${this.options.command}] ${text}`);
			}
		});

		child.on('error', (err: Error) => {
			this.errorHandler?.(err);
		});

		child.on('close', (code: number | null) => {
			this.closeHandler?.(code);
		});
	}

	send(message: object): void {
		if (!this.child || this.disposed) {
			throw new Error('McpStdioTransport: cannot send — transport not started or disposed');
		}
		this.child.stdin.write(JSON.stringify(message) + '\n');
	}

	onMessage(handler: MessageHandler): void {
		this.messageHandler = handler;
	}

	onClose(handler: CloseHandler): void {
		this.closeHandler = handler;
	}

	onError(handler: ErrorHandler): void {
		this.errorHandler = handler;
	}

	dispose(): void {
		if (this.disposed) {
			return;
		}
		this.disposed = true;
		this.messageHandler = undefined;
		this.closeHandler = undefined;
		this.errorHandler = undefined;
		const child = this.child;
		this.child = undefined;
		if (child && !child.killed) {
			try {
				child.kill();
			} catch {
				// child already exited; nothing to do.
			}
		}
	}

	private handleStdoutChunk(chunk: string): void {
		this.buffer += chunk;
		// Newline-delimited JSON: split on '\n' and keep any trailing partial
		// line in the buffer until its terminator arrives.
		let newlineIdx = this.buffer.indexOf('\n');
		while (newlineIdx !== -1) {
			const line = this.buffer.slice(0, newlineIdx).trim();
			this.buffer = this.buffer.slice(newlineIdx + 1);
			if (line.length > 0) {
				this.deliverLine(line);
			}
			newlineIdx = this.buffer.indexOf('\n');
		}
	}

	private deliverLine(line: string): void {
		let parsed: JsonRpcMessage;
		try {
			parsed = JSON.parse(line) as JsonRpcMessage;
		} catch (err) {
			const reason = err instanceof Error ? err.message : String(err);
			console.warn(`[mcp:${this.options.command}] failed to parse line: ${reason}`);
			return;
		}
		this.messageHandler?.(parsed);
	}
}
