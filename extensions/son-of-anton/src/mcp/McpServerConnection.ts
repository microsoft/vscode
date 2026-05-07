/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import {
	JsonRpcId,
	JsonRpcMessage,
	JsonRpcRequest,
	JsonRpcResponse,
	McpStdioTransport,
} from './McpStdioTransport';

const INITIALIZE_TIMEOUT_MS = 10_000;
const TOOL_CALL_TIMEOUT_MS = 30_000;
const PROTOCOL_VERSION = '2024-11-05';

export interface McpToolDescriptor {
	name: string;
	description: string;
	inputSchema?: object;
}

export interface McpToolCallResult {
	content: string;
	isError: boolean;
}

export type McpServerState = 'idle' | 'connecting' | 'ready' | 'error' | 'closed';

interface PendingRequest {
	resolve: (value: unknown) => void;
	reject: (err: Error) => void;
	timer: NodeJS.Timeout;
}

interface McpToolsListResult {
	tools?: Array<{ name?: unknown; description?: unknown; inputSchema?: unknown }>;
}

interface McpToolCallContentPart {
	type?: string;
	text?: string;
}

interface McpToolCallRawResult {
	content?: McpToolCallContentPart[];
	isError?: boolean;
}

export interface McpServerConnectionOptions {
	name: string;
	transport: McpStdioTransport;
}

export class McpServerConnection {
	readonly name: string;
	private readonly transport: McpStdioTransport;
	private readonly pending = new Map<JsonRpcId, PendingRequest>();
	private nextId = 1;
	private currentState: McpServerState = 'idle';
	private currentError: Error | undefined;
	private cachedTools: McpToolDescriptor[] | undefined;

	constructor(options: McpServerConnectionOptions) {
		this.name = options.name;
		this.transport = options.transport;
	}

	get state(): McpServerState {
		return this.currentState;
	}

	get lastError(): Error | undefined {
		return this.currentError;
	}

	async connect(): Promise<void> {
		if (this.currentState === 'ready' || this.currentState === 'connecting') {
			return;
		}
		this.currentState = 'connecting';
		this.transport.onMessage(msg => this.handleMessage(msg));
		this.transport.onClose(code => this.handleClose(code));
		this.transport.onError(err => this.handleError(err));

		try {
			this.transport.start();
		} catch (err) {
			const wrapped = err instanceof Error ? err : new Error(String(err));
			this.currentState = 'error';
			this.currentError = wrapped;
			throw wrapped;
		}

		try {
			await this.request(
				'initialize',
				{
					protocolVersion: PROTOCOL_VERSION,
					capabilities: {},
					clientInfo: { name: 'son-of-anton', version: '0.1.0' },
				},
				INITIALIZE_TIMEOUT_MS,
			);
			this.transport.send({
				jsonrpc: '2.0',
				method: 'notifications/initialized',
			});
			this.currentState = 'ready';
		} catch (err) {
			const wrapped = err instanceof Error ? err : new Error(String(err));
			this.currentState = 'error';
			this.currentError = wrapped;
			this.failPending(wrapped);
			throw wrapped;
		}
	}

	async listTools(refresh = false): Promise<McpToolDescriptor[]> {
		if (this.cachedTools && !refresh) {
			return this.cachedTools;
		}
		this.ensureReady();
		const raw = await this.request('tools/list', {}, TOOL_CALL_TIMEOUT_MS);
		const result = (raw ?? {}) as McpToolsListResult;
		const tools = Array.isArray(result.tools) ? result.tools : [];
		const normalised: McpToolDescriptor[] = [];
		for (const t of tools) {
			if (typeof t?.name !== 'string') {
				continue;
			}
			normalised.push({
				name: t.name,
				description: typeof t.description === 'string' ? t.description : '',
				inputSchema: typeof t.inputSchema === 'object' && t.inputSchema !== null
					? t.inputSchema as object
					: undefined,
			});
		}
		this.cachedTools = normalised;
		return normalised;
	}

	async callTool(name: string, args: Record<string, unknown>): Promise<McpToolCallResult> {
		this.ensureReady();
		const raw = await this.request(
			'tools/call',
			{ name, arguments: args },
			TOOL_CALL_TIMEOUT_MS,
		);
		const result = (raw ?? {}) as McpToolCallRawResult;
		const parts = Array.isArray(result.content) ? result.content : [];
		const text = parts
			.filter(p => p?.type === 'text' && typeof p.text === 'string')
			.map(p => p.text as string)
			.join('');
		return {
			content: text,
			isError: result.isError === true,
		};
	}

	dispose(): void {
		if (this.currentState === 'closed') {
			return;
		}
		this.currentState = 'closed';
		this.failPending(new Error(`MCP server '${this.name}' connection disposed`));
		this.transport.dispose();
	}

	private ensureReady(): void {
		if (this.currentState !== 'ready') {
			throw new Error(`MCP server '${this.name}' is not connected (state=${this.currentState})`);
		}
	}

	private request(method: string, params: unknown, timeoutMs: number): Promise<unknown> {
		return new Promise<unknown>((resolve, reject) => {
			const id = this.nextId++;
			const message: JsonRpcRequest = { jsonrpc: '2.0', id, method, params };
			const timer = setTimeout(() => {
				this.pending.delete(id);
				reject(new Error(`MCP request '${method}' to '${this.name}' timed out after ${timeoutMs}ms`));
			}, timeoutMs);
			this.pending.set(id, { resolve, reject, timer });
			try {
				this.transport.send(message);
			} catch (err) {
				clearTimeout(timer);
				this.pending.delete(id);
				reject(err instanceof Error ? err : new Error(String(err)));
			}
		});
	}

	private handleMessage(msg: JsonRpcMessage): void {
		const id = (msg as { id?: JsonRpcId }).id;
		if (id === undefined || id === null) {
			return;
		}
		const pending = this.pending.get(id);
		if (!pending) {
			return;
		}
		this.pending.delete(id);
		clearTimeout(pending.timer);
		const response = msg as JsonRpcResponse;
		if (response.error) {
			pending.reject(new Error(`MCP error from '${this.name}': ${response.error.message}`));
			return;
		}
		pending.resolve(response.result);
	}

	private handleClose(code: number | null): void {
		if (this.currentState === 'closed') {
			return;
		}
		this.currentState = 'closed';
		const err = new Error(`MCP server '${this.name}' exited with code ${code ?? 'null'}`);
		this.currentError = err;
		this.failPending(err);
	}

	private handleError(err: Error): void {
		this.currentError = err;
		if (this.currentState === 'connecting' || this.currentState === 'ready') {
			this.currentState = 'error';
		}
		this.failPending(err);
	}

	private failPending(err: Error): void {
		for (const [, pending] of this.pending) {
			clearTimeout(pending.timer);
			pending.reject(err);
		}
		this.pending.clear();
	}
}
