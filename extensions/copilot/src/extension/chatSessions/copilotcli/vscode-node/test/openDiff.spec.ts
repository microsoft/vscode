/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TestLogService } from '../../../../../platform/testing/common/testLogService';
import { MockMcpServer, parseToolResult } from './testHelpers';

vi.mock('fs/promises', () => ({
	readFile: vi.fn().mockResolvedValue('original content'),
}));

vi.mock('vscode', () => ({
	Uri: {
		file: (path: string) => ({ fsPath: path, scheme: 'file' }),
		from: (components: { scheme: string; path: string; query: string }) => ({
			fsPath: components.path,
			scheme: components.scheme,
			path: components.path,
			query: components.query,
			toString: () => `${components.scheme}:${components.path}?${components.query}`,
		}),
	},
	window: {
		tabGroups: {
			activeTabGroup: { activeTab: null },
			all: [],
			close: vi.fn(),
			onDidChangeTabGroups: () => ({ dispose: () => { } }),
			onDidChangeTabs: vi.fn(() => ({ dispose: () => { } })),
		},
	},
	commands: {
		executeCommand: vi.fn().mockResolvedValue(undefined),
	},
	TabInputTextDiff: class TabInputTextDiff {
		constructor(public original: unknown, public modified: unknown) { }
	},
}));

import * as fsPromises from 'fs/promises';
import * as vscode from 'vscode';
import { DiffStateManager } from '../diffState';
import { ReadonlyContentProvider } from '../readonlyContentProvider';
import { registerOpenDiffTool } from '../tools/openDiff';

interface OpenDiffResult {
	success: boolean;
	result: string;
	trigger: string;
	tab_name: string;
}

describe('openDiff tool', () => {
	const logger = new TestLogService();
	let diffState: DiffStateManager;
	let contentProvider: ReadonlyContentProvider;
	let server: MockMcpServer;

	beforeEach(() => {
		vi.clearAllMocks();
		diffState = new DiffStateManager(logger);
		contentProvider = new ReadonlyContentProvider();
		server = new MockMcpServer();
		vi.mocked(fsPromises.readFile).mockResolvedValue('original content');
		registerOpenDiffTool(server as unknown as import('@modelcontextprotocol/sdk/server/mcp.js').McpServer, logger, diffState, contentProvider, 'test-session');
	});

	/** Simulate accepting a diff after it's registered */
	function simulateAcceptOnRegister(tabName: string) {
		vi.mocked(vscode.commands.executeCommand).mockImplementation(async () => {
			setTimeout(() => {
				const diff = diffState.getByTabName(tabName);
				if (diff) {
					diff.cleanup();
					diff.resolve({ status: 'SAVED', trigger: 'accepted_via_button' });
				}
			}, 10);
		});
	}

	/** Simulate rejecting a diff after it's registered */
	function simulateRejectOnRegister(tabName: string) {
		vi.mocked(vscode.commands.executeCommand).mockImplementation(async () => {
			setTimeout(() => {
				const diff = diffState.getByTabName(tabName);
				if (diff) {
					diff.cleanup();
					diff.resolve({ status: 'REJECTED', trigger: 'rejected_via_button' });
				}
			}, 10);
		});
	}

	it('should register the open_diff tool', () => {
		expect(server.hasToolRegistered('open_diff')).toBe(true);
	});

	it('should open diff and resolve with SAVED on accept', async () => {
		simulateAcceptOnRegister('Test Diff');

		const handler = server.getToolHandler('open_diff')!;
		const result = parseToolResult<OpenDiffResult>(await handler({
			original_file_path: '/test/file.ts',
			new_file_contents: 'new content',
			tab_name: 'Test Diff',
		}));

		expect(result.success).toBe(true);
		expect(result.result).toBe('SAVED');
		expect(result.trigger).toBe('accepted_via_button');
		expect(result.tab_name).toBe('Test Diff');
	});

	it('should open diff and resolve with REJECTED on reject', async () => {
		simulateRejectOnRegister('Reject Diff');

		const handler = server.getToolHandler('open_diff')!;
		const result = parseToolResult<OpenDiffResult>(await handler({
			original_file_path: '/test/file.ts',
			new_file_contents: 'new content',
			tab_name: 'Reject Diff',
		}));

		expect(result.success).toBe(true);
		expect(result.result).toBe('REJECTED');
		expect(result.trigger).toBe('rejected_via_button');
	});

	it('should handle non-existent file (new file scenario)', async () => {
		const enoentError = new Error('ENOENT') as NodeJS.ErrnoException;
		enoentError.code = 'ENOENT';
		vi.mocked(fsPromises.readFile).mockRejectedValue(enoentError);
		simulateAcceptOnRegister('New File');

		const handler = server.getToolHandler('open_diff')!;
		const result = parseToolResult<OpenDiffResult>(await handler({
			original_file_path: '/new/file.ts',
			new_file_contents: 'brand new content',
			tab_name: 'New File',
		}));

		expect(result.success).toBe(true);
		expect(result.result).toBe('SAVED');
	});

	it('should return error for non-ENOENT file read errors', async () => {
		const permError = new Error('Permission denied') as NodeJS.ErrnoException;
		permError.code = 'EACCES';
		vi.mocked(fsPromises.readFile).mockRejectedValue(permError);

		const handler = server.getToolHandler('open_diff')!;
		const result = await handler({
			original_file_path: '/test/file.ts',
			new_file_contents: 'new content',
			tab_name: 'Error Diff',
		});
		const typed = result as { isError: boolean; content: [{ text: string }] };

		expect(typed.isError).toBe(true);
		expect(typed.content[0].text).toContain('Failed to open diff');
	});

	it('should set content on the readonly content provider', async () => {
		const setContentSpy = vi.spyOn(contentProvider, 'setContent');
		simulateAcceptOnRegister('Content Test');

		const handler = server.getToolHandler('open_diff')!;
		await handler({
			original_file_path: '/test/file.ts',
			new_file_contents: 'new content',
			tab_name: 'Content Test',
		});

		// setContent should be called twice: once for original, once for modified
		expect(setContentSpy).toHaveBeenCalledTimes(2);
	});

	it('should register diff in diff state', async () => {
		let diffRegistered = false;
		vi.mocked(vscode.commands.executeCommand).mockImplementation(async () => {
			setTimeout(() => {
				const diff = diffState.getByTabName('Register Test');
				diffRegistered = !!diff;
				if (diff) {
					diff.cleanup();
					diff.resolve({ status: 'SAVED', trigger: 'accepted_via_button' });
				}
			}, 10);
		});

		const handler = server.getToolHandler('open_diff')!;
		await handler({
			original_file_path: '/test/file.ts',
			new_file_contents: 'new content',
			tab_name: 'Register Test',
		});

		expect(diffRegistered).toBe(true);
	});
});
