/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { vi } from 'vitest';
import type { ICopilotCLISessionTracker } from '../copilotCLISessionTracker';

type ToolHandler = (args: Record<string, unknown>) => Promise<unknown>;

interface MockToolEntry {
	handler: ToolHandler;
	schema?: unknown;
}

/**
* A mock MCP server that captures tool registrations for testing.
*/
export class MockMcpServer {
	private readonly _tools = new Map<string, MockToolEntry>();

	/**
	* Mimics the McpServer.tool() registration method.
	* Handles both overloads: (name, desc, handler) and (name, desc, schema, handler).
	*/
	tool(name: string, _description: string, ...rest: unknown[]): void {
		const handler = rest.length === 1
			? rest[0] as ToolHandler
			: rest[1] as ToolHandler;
		const schema = rest.length === 2 ? rest[0] : undefined;
		this._tools.set(name, { handler, schema });
	}

	/**
	* Mimics the McpServer.registerTool() registration method.
	* Signature: registerTool(name, config, callback)
	*/
	registerTool(name: string, config: { description?: string; inputSchema?: unknown }, handler: ToolHandler): void {
		this._tools.set(name, { handler, schema: config.inputSchema });
	}

	getToolHandler(name: string): ToolHandler | undefined {
		return this._tools.get(name)?.handler;
	}

	getToolSchema(name: string): unknown | undefined {
		return this._tools.get(name)?.schema;
	}

	hasToolRegistered(name: string): boolean {
		return this._tools.has(name);
	}
}

/**
* Parses the text content from an MCP tool result.
* Returns the parsed JSON value from the first text content block.
*/
export function parseToolResult<T = unknown>(result: unknown): T {
	const typed = result as { content: [{ type: string; text: string }] };
	return JSON.parse(typed.content[0].text) as T;
}

/**
* Creates a mock VS Code text editor for testing selection and text retrieval.
*/
export function createMockEditor(
	filePath: string,
	content: string,
	startLine: number,
	startChar: number,
	endLine: number,
	endChar: number,
) {
	const lines = content.split('\n');
	return {
		document: {
			uri: {
				fsPath: filePath,
				scheme: 'file',
				toString: () => `file://${filePath}`,
			},
			getText: (range?: { start: { line: number; character: number }; end: { line: number; character: number } }) => {
				if (!range) {
					return content;
				}
				const resultLines: string[] = [];
				for (let i = range.start.line; i <= range.end.line; i++) {
					const line = lines[i] || '';
					const start = i === range.start.line ? range.start.character : 0;
					const end = i === range.end.line ? range.end.character : line.length;
					resultLines.push(line.substring(start, end));
				}
				return resultLines.join('\n');
			},
		},
		selection: {
			start: { line: startLine, character: startChar },
			end: { line: endLine, character: endChar },
			isEmpty: startLine === endLine && startChar === endChar,
		},
	};
}

/**
* Creates a mock VS Code URI for testing.
*/
export function createMockUri(path: string) {
	return {
		toString: () => `file://${path}`,
		fsPath: path,
		scheme: 'file',
	};
}

/**
* Creates a mock VS Code text editor with a specific URI scheme for testing.
*/
export function createMockEditorWithScheme(
	filePath: string,
	content: string,
	startLine: number,
	startChar: number,
	endLine: number,
	endChar: number,
	scheme: string,
) {
	const editor = createMockEditor(filePath, content, startLine, startChar, endLine, endChar);
	return {
		...editor,
		document: {
			...editor.document,
			uri: {
				...editor.document.uri,
				scheme,
				toString: () => `${scheme}://${filePath}`,
			},
		},
	};
}

/**
* Creates a mock VS Code Diagnostic for testing.
*/
export function createMockDiagnostic(
	message: string,
	severity: number,
	startLine: number,
	startChar: number,
	endLine: number,
	endChar: number,
	source?: string,
	code?: string | number,
) {
	return {
		message,
		severity,
		range: {
			start: { line: startLine, character: startChar },
			end: { line: endLine, character: endChar },
		},
		source,
		code,
	};
}

/**
* A mock InProcHttpServer that tracks broadcast notifications.
*/
export class MockHttpServer {
	readonly broadcastedNotifications: Array<{ method: string; params: Record<string, unknown> }> = [];
	readonly sentNotifications: Array<{ sessionId: string; method: string; params: Record<string, unknown> }> = [];
	private _connectedSessionIds: readonly string[] = [];

	readonly broadcastNotification = vi.fn((method: string, params: Record<string, unknown>) => {
		this.broadcastedNotifications.push({ method, params });
	});

	readonly sendNotification = vi.fn((sessionId: string, method: string, params: Record<string, unknown>) => {
		this.sentNotifications.push({ sessionId, method, params });
	});

	readonly getConnectedSessionIds = vi.fn((): readonly string[] => {
		return this._connectedSessionIds;
	});

	setConnectedSessionIds(ids: readonly string[]): void {
		this._connectedSessionIds = ids;
	}

	getNotifications(method: string) {
		return this.broadcastedNotifications.filter(n => n.method === method);
	}

	clear() {
		this.broadcastedNotifications.length = 0;
		this.sentNotifications.length = 0;
		this.broadcastNotification.mockClear();
		this.sendNotification.mockClear();
		this.getConnectedSessionIds.mockClear();
	}
}

/**
* A mock session tracker for testing session picker logic.
*/
export class MockSessionTracker {
	declare _serviceBrand: undefined;
	private readonly _displayNames = new Map<string, string>();

	readonly registerSession = vi.fn().mockReturnValue({ dispose: () => { } });
	readonly getTerminal = vi.fn().mockResolvedValue(undefined);
	readonly setSessionTerminal = vi.fn();
	public readonly setSessionName = vi.fn((sessionId: string, name: string) => {
		this._displayNames.set(sessionId, name);
	});

	getSessionDisplayName(sessionId: string): string {
		return this._displayNames.get(sessionId) || sessionId;
	}

	getSessionIds(): readonly string[] {
		return Array.from(this._displayNames.keys());
	}

	asTracker(): ICopilotCLISessionTracker {
		return this as unknown as ICopilotCLISessionTracker;
	}
}
