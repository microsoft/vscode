/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { describe, expect, it } from 'vitest';
import type { ChatRequest, LanguageModelToolInformation } from 'vscode';
import { askAgentToolFilter } from '../../node/askAgentIntent';

function makeTool(name: string, tags: string[] = []): LanguageModelToolInformation {
	return {
		name,
		description: `description for ${name}`,
		inputSchema: { type: 'object' },
		tags,
		source: undefined,
	};
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

describe('askAgentToolFilter', () => {
	it('includes tools with the codesearch tag', () => {
		const tool = makeTool('vscode_search', ['vscode_codesearch']);
		const request = makeRequest([]);
		expect(askAgentToolFilter(tool, request)).toBe(true);
	});

	it('includes tools referenced in the request', () => {
		const tool = makeTool('vscode_read_file', []);
		const request = makeRequest([{ name: 'vscode_read_file' }]);
		expect(askAgentToolFilter(tool, request)).toBe(true);
	});

	it('excludes unreferenced non-MCP tools', () => {
		const tool = makeTool('vscode_edit_file', []);
		const request = makeRequest([]);
		expect(askAgentToolFilter(tool, request)).toBe(false);
	});

	it('includes MCP tools when the user referenced an MCP server tool', () => {
		// The request snapshot was taken while the MCP server was still
		// discovering tools, so it only contains one of the server's tools.
		const request = makeRequest([{ name: 'mcp_fire_take_snapshot' }]);
		// Tools registered *after* the snapshot are now available too.
		const tool = makeTool('mcp_fire_navigate_page', ['mcp']);
		expect(askAgentToolFilter(tool, request)).toBe(true);
	});

	it('excludes MCP tools when the user did not reference an MCP server', () => {
		const tool = makeTool('mcp_fire_navigate_page', ['mcp']);
		const request = makeRequest([{ name: 'vscode_read_file' }]);
		expect(askAgentToolFilter(tool, request)).toBe(false);
	});

	it('excludes MCP tools when the request has no tool references at all', () => {
		const tool = makeTool('mcp_fire_navigate_page', ['mcp']);
		const request = makeRequest([]);
		expect(askAgentToolFilter(tool, request)).toBe(false);
	});
});
