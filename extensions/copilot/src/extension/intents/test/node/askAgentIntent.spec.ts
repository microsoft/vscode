/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { describe, expect, it } from 'vitest';
import type { ChatRequest, LanguageModelToolInformation } from 'vscode';
import { LanguageModelToolMCPSource } from '../../../../vscodeTypes';
import { askAgentToolFilter } from '../../node/askAgentIntent';

function makeTool(name: string, tags: string[] = [], source?: LanguageModelToolMCPSource): LanguageModelToolInformation {
	return {
		name,
		description: `description for ${name}`,
		inputSchema: { type: 'object' },
		tags,
		source,
	};
}

function makeMcpTool(name: string, collectionId: string, definitionId: string, label = collectionId, serverName = label): LanguageModelToolInformation {
	return makeTool(name, ['mcp'], new LanguageModelToolMCPSource(label, serverName, undefined, collectionId, definitionId));
}

function makeRequest(toolReferences: { name: string }[]): ChatRequest {
	return {
		requestId: 'request-id',
		message: 'test',
		agentId: 'copilot-chat',
		prompt: 'test',
		references: [],
		model: undefined,
		toolReferences,
		tools: [],
		history: [],
	};
}

function serverKey(collectionId: string, definitionId: string): string {
	return `${collectionId}\u0000${definitionId}`;
}

describe('askAgentToolFilter', () => {
	it('includes tools with the codesearch tag', () => {
		const tool = makeTool('vscode_search', ['vscode_codesearch']);
		expect(askAgentToolFilter(tool, makeRequest([]))).toBe(true);
	});

	it('includes tools referenced in the request', () => {
		const tool = makeTool('vscode_read_file', []);
		const request = makeRequest([{ name: 'vscode_read_file' }]);
		expect(askAgentToolFilter(tool, request)).toBe(true);
	});

	it('excludes unreferenced non-MCP tools', () => {
		const tool = makeTool('vscode_edit_file', []);
		expect(askAgentToolFilter(tool, makeRequest([]))).toBe(false);
	});

	it('includes MCP tools of a referenced server, even if not in the request snapshot', () => {
		// The user referenced the firefox server (its take_snapshot tool is in
		// the snapshot); navigate_page belongs to the same server and was
		// registered after the snapshot was taken.
		const request = makeRequest([{ name: 'mcp_fire_take_snapshot' }]);
		const tool = makeMcpTool('mcp_fire_navigate_page', 'mcp.config.usrlocal', 'mcp.config.usrlocal.firefox-devtools');
		const referencedMcpServerKeys = new Set([serverKey('mcp.config.usrlocal', 'mcp.config.usrlocal.firefox-devtools')]);
		expect(askAgentToolFilter(tool, request, referencedMcpServerKeys)).toBe(true);
	});

	it('excludes MCP tools of a server that was NOT referenced', () => {
		// The user referenced firefox, but this tool belongs to ida-pro.
		const request = makeRequest([{ name: 'mcp_fire_take_snapshot' }]);
		const tool = makeMcpTool('mcp_ida_read_memory_bytes', 'mcp.config.usrlocal', 'mcp.config.usrlocal.ida-pro-mcp');
		const referencedMcpServerKeys = new Set([serverKey('mcp.config.usrlocal', 'mcp.config.usrlocal.firefox-devtools')]);
		expect(askAgentToolFilter(tool, request, referencedMcpServerKeys)).toBe(false);
	});

	it('excludes MCP tools of a distinct instance sharing the same label and name', () => {
		// Two separately configured servers can share the same editor label and
		// server name; only their collectionId + definitionId differ. Referencing
		// one instance must not expose the other instance's tools.
		const request = makeRequest([{ name: 'mcp_fire_take_snapshot' }]);
		const tool = makeMcpTool('mcp_fire_navigate_page', 'mcp.config.ws0', 'mcp.config.ws0.firefox-devtools', 'firefox-devtools', 'firefox-devtools');
		const referencedMcpServerKeys = new Set([serverKey('mcp.config.usrlocal', 'mcp.config.usrlocal.firefox-devtools')]);
		expect(askAgentToolFilter(tool, request, referencedMcpServerKeys)).toBe(false);
	});

	it('excludes MCP tools when no MCP server was referenced at all', () => {
		const tool = makeMcpTool('mcp_fire_navigate_page', 'mcp.config.usrlocal', 'mcp.config.usrlocal.firefox-devtools');
		const request = makeRequest([{ name: 'vscode_read_file' }]);
		expect(askAgentToolFilter(tool, request, new Set())).toBe(false);
	});

	it('excludes MCP tools when the request has no tool references at all', () => {
		const tool = makeMcpTool('mcp_fire_navigate_page', 'mcp.config.usrlocal', 'mcp.config.usrlocal.firefox-devtools');
		expect(askAgentToolFilter(tool, makeRequest([]), new Set())).toBe(false);
	});

	it('excludes MCP tools without a source when a server was referenced', () => {
		// Conservative fallback: a tool whose MCP server identity is unknown
		// must not be enabled by a reference to some other server.
		const tool = makeTool('mcp_fire_navigate_page', ['mcp'], undefined);
		const request = makeRequest([{ name: 'mcp_fire_take_snapshot' }]);
		const referencedMcpServerKeys = new Set(['firefox-devtools\u0000firefox-devtools']);
		expect(askAgentToolFilter(tool, request, referencedMcpServerKeys)).toBe(false);
	});
});
