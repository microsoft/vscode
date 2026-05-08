/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Son of Anton — Code Graph MCP server (stdio JSON-RPC).
//
// Exposes the six graph tools the orchestrator's `gatherGraphContext` and the
// BaseAgent helpers expect (semantic_search, file_summary, symbol_lookup,
// dependency_traversal, impact_analysis, find_references).
//
// v1 returns a deterministic placeholder for every tool call — the
// orchestrator's call sites already handle errors gracefully, and a
// placeholder response means the MCP wiring round-trips cleanly during
// onboarding before the indexer has populated FalkorDB / Qdrant.
//
// Wire format: newline-delimited JSON-RPC 2.0 over stdio (matches
// `McpStdioTransport` in son-of-anton-core).

interface JsonRpcRequest {
	jsonrpc: '2.0';
	id: number | string;
	method: string;
	params?: unknown;
}

interface JsonRpcResponse {
	jsonrpc: '2.0';
	id: number | string;
	result?: unknown;
	error?: { code: number; message: string; data?: unknown };
}

interface ToolDescriptor {
	name: string;
	description: string;
	inputSchema: {
		type: 'object';
		properties: Record<string, { type: string; description: string }>;
		required?: string[];
	};
}

const PROTOCOL_VERSION = '2024-11-05';
const SERVER_INFO = { name: 'son-of-anton-code-graph', version: '0.1.0' };

const TOOLS: ToolDescriptor[] = [
	{
		name: 'semantic_search',
		description: 'Find code chunks semantically similar to a natural-language query.',
		inputSchema: {
			type: 'object',
			properties: {
				query: { type: 'string', description: 'Natural-language search query.' },
				limit: { type: 'number', description: 'Max results (default 5).' },
			},
			required: ['query'],
		},
	},
	{
		name: 'file_summary',
		description: 'Return a summary of a file: top-level symbols, imports, and outgoing calls.',
		inputSchema: {
			type: 'object',
			properties: {
				filePath: { type: 'string', description: 'Workspace-relative path.' },
			},
			required: ['filePath'],
		},
	},
	{
		name: 'symbol_lookup',
		description: 'Look up the definition site and metadata for a named symbol.',
		inputSchema: {
			type: 'object',
			properties: {
				symbolName: { type: 'string', description: 'Symbol name to look up.' },
			},
			required: ['symbolName'],
		},
	},
	{
		name: 'dependency_traversal',
		description: 'List the files a target file imports (or is imported by).',
		inputSchema: {
			type: 'object',
			properties: {
				filePath: { type: 'string', description: 'Workspace-relative path.' },
			},
			required: ['filePath'],
		},
	},
	{
		name: 'impact_analysis',
		description: 'Estimate which files / symbols are affected by a change to the target file.',
		inputSchema: {
			type: 'object',
			properties: {
				filePath: { type: 'string', description: 'Workspace-relative path.' },
			},
			required: ['filePath'],
		},
	},
	{
		name: 'find_references',
		description: 'Find references to a named symbol across the workspace.',
		inputSchema: {
			type: 'object',
			properties: {
				symbolName: { type: 'string', description: 'Symbol name to find references for.' },
			},
			required: ['symbolName'],
		},
	},
];

const PLACEHOLDER_TEXT = '(code graph available — index empty; run sota:graph:reindex to populate)';

function send(message: object): void {
	process.stdout.write(JSON.stringify(message) + '\n');
}

function reply(id: number | string, result: unknown): void {
	const response: JsonRpcResponse = { jsonrpc: '2.0', id, result };
	send(response);
}

function replyError(id: number | string, code: number, message: string): void {
	const response: JsonRpcResponse = { jsonrpc: '2.0', id, error: { code, message } };
	send(response);
}

function handleInitialize(id: number | string): void {
	reply(id, {
		protocolVersion: PROTOCOL_VERSION,
		capabilities: { tools: { listChanged: false } },
		serverInfo: SERVER_INFO,
	});
}

function handleToolsList(id: number | string): void {
	reply(id, { tools: TOOLS });
}

function handleToolsCall(id: number | string, params: unknown): void {
	const p = (params ?? {}) as { name?: string };
	const toolName = p.name;
	if (typeof toolName !== 'string' || !TOOLS.some(t => t.name === toolName)) {
		replyError(id, -32602, `Unknown tool: ${String(toolName)}`);
		return;
	}
	// v1: every tool returns the same placeholder. Future iterations switch
	// on toolName here and dispatch to FalkorDB (graph queries) or Qdrant
	// (vector search) using the `params.arguments` payload.
	reply(id, {
		content: [{ type: 'text', text: PLACEHOLDER_TEXT }],
		isError: false,
	});
}

function handle(message: JsonRpcRequest): void {
	const { id, method, params } = message;
	if (id === undefined) {
		// Notification — accept and ignore. We don't need to react to
		// `notifications/initialized` for v1.
		return;
	}
	switch (method) {
		case 'initialize':
			return handleInitialize(id);
		case 'tools/list':
			return handleToolsList(id);
		case 'tools/call':
			return handleToolsCall(id, params);
		case 'ping':
			return reply(id, {});
		default:
			return replyError(id, -32601, `Method not found: ${method}`);
	}
}

let buffer = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk: string) => {
	buffer += chunk;
	let idx = buffer.indexOf('\n');
	while (idx !== -1) {
		const line = buffer.slice(0, idx).trim();
		buffer = buffer.slice(idx + 1);
		if (line.length > 0) {
			try {
				const parsed = JSON.parse(line) as JsonRpcRequest;
				handle(parsed);
			} catch (err) {
				const msg = err instanceof Error ? err.message : String(err);
				process.stderr.write(`[code-graph-mcp] failed to parse line: ${msg}\n`);
			}
		}
		idx = buffer.indexOf('\n');
	}
});

process.stdin.on('end', () => {
	process.exit(0);
});

process.stderr.write('[code-graph-mcp] ready (v1 placeholder responses)\n');
