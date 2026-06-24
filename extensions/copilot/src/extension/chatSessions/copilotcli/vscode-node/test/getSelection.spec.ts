/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TestLogService } from '../../../../../platform/testing/common/testLogService';
import { MockMcpServer, parseToolResult, createMockEditor } from './testHelpers';

const { mockActiveTextEditor } = vi.hoisted(() => ({
	mockActiveTextEditor: { value: null as unknown },
}));

vi.mock('vscode', () => ({
	window: {
		get activeTextEditor() { return mockActiveTextEditor.value; },
	},
}));

import { registerGetSelectionTool, SelectionState, getSelectionInfo } from '../tools/getSelection';

interface SelectionResult {
	text: string;
	filePath: string;
	fileUrl: string;
	current: boolean;
	selection: {
		start: { line: number; character: number };
		end: { line: number; character: number };
		isEmpty: boolean;
	};
}

describe('getSelectionInfo', () => {
	it('should return selection info for a text selection', () => {
		const editor = createMockEditor('/test/file.ts', 'Hello World', 0, 6, 0, 11);
		const info = getSelectionInfo(editor as unknown as import('vscode').TextEditor);

		expect(info.text).toBe('World');
		expect(info.filePath).toBe('/test/file.ts');
		expect(info.fileUrl).toBe('file:///test/file.ts');
		expect(info.selection.start.line).toBe(0);
		expect(info.selection.start.character).toBe(6);
		expect(info.selection.end.line).toBe(0);
		expect(info.selection.end.character).toBe(11);
		expect(info.selection.isEmpty).toBe(false);
	});

	it('should return empty text for cursor position', () => {
		const editor = createMockEditor('/test/file.ts', 'Hello World', 0, 5, 0, 5);
		const info = getSelectionInfo(editor as unknown as import('vscode').TextEditor);

		expect(info.text).toBe('');
		expect(info.selection.isEmpty).toBe(true);
	});

	it('should handle multi-line selection', () => {
		const editor = createMockEditor('/test/file.ts', 'Line one\nLine two\nLine three', 0, 5, 2, 4);
		const info = getSelectionInfo(editor as unknown as import('vscode').TextEditor);

		expect(info.text).toBe('one\nLine two\nLine');
		expect(info.selection.start.line).toBe(0);
		expect(info.selection.end.line).toBe(2);
	});
});

describe('SelectionState', () => {
	it('should start with no selection', () => {
		const state = new SelectionState();
		expect(state.latest).toBe(null);
	});

	it('should store and retrieve selection', () => {
		const state = new SelectionState();
		const selectionInfo = {
			text: 'Hello',
			filePath: '/test/file.ts',
			fileUrl: 'file:///test/file.ts',
			selection: {
				start: { line: 0, character: 0 },
				end: { line: 0, character: 5 },
				isEmpty: false,
			},
		};

		state.update(selectionInfo);
		expect(state.latest).toBe(selectionInfo);
	});

	it('should clear selection with null', () => {
		const state = new SelectionState();
		state.update({
			text: 'Hello',
			filePath: '/test/file.ts',
			fileUrl: 'file:///test/file.ts',
			selection: {
				start: { line: 0, character: 0 },
				end: { line: 0, character: 5 },
				isEmpty: false,
			},
		});
		state.update(null);
		expect(state.latest).toBe(null);
	});
});

describe('get_selection tool', () => {
	const logger = new TestLogService();
	let selectionState: SelectionState;
	let server: MockMcpServer;

	beforeEach(() => {
		selectionState = new SelectionState();
		server = new MockMcpServer();
		mockActiveTextEditor.value = null;
		registerGetSelectionTool(server as unknown as import('@modelcontextprotocol/sdk/server/mcp.js').McpServer, logger, selectionState);
	});

	it('should register the get_selection tool', () => {
		expect(server.hasToolRegistered('get_selection')).toBe(true);
	});

	it('should return null when no editor and no cached selection', async () => {
		const handler = server.getToolHandler('get_selection')!;
		const result = parseToolResult(await handler({}));
		expect(result).toBe(null);
	});

	it('should return cached selection with current=false when no active editor', async () => {
		selectionState.update({
			text: 'cached text',
			filePath: '/cached/file.ts',
			fileUrl: 'file:///cached/file.ts',
			selection: {
				start: { line: 0, character: 0 },
				end: { line: 0, character: 11 },
				isEmpty: false,
			},
		});

		const handler = server.getToolHandler('get_selection')!;
		const result = parseToolResult<SelectionResult>(await handler({}));

		expect(result.text).toBe('cached text');
		expect(result.current).toBe(false);
		expect(result.filePath).toBe('/cached/file.ts');
	});

	it('should return current selection with current=true when editor is active', async () => {
		mockActiveTextEditor.value = createMockEditor('/test/file.ts', 'Hello World', 0, 0, 0, 5);

		const handler = server.getToolHandler('get_selection')!;
		const result = parseToolResult<SelectionResult>(await handler({}));

		expect(result.text).toBe('Hello');
		expect(result.current).toBe(true);
	});

	it('should return empty text for cursor position with current=true', async () => {
		mockActiveTextEditor.value = createMockEditor('/test/file.ts', 'Hello World', 0, 5, 0, 5);

		const handler = server.getToolHandler('get_selection')!;
		const result = parseToolResult<SelectionResult>(await handler({}));

		expect(result.text).toBe('');
		expect(result.current).toBe(true);
		expect(result.selection.isEmpty).toBe(true);
	});
});
