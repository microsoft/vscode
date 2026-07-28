/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TestLogService } from '../../../../../platform/testing/common/testLogService';
import { MockMcpServer, parseToolResult } from './testHelpers';

vi.mock('vscode', () => ({
	Uri: {
		file: (path: string) => ({ fsPath: path, scheme: 'file' }),
	},
	window: {
		tabGroups: {
			activeTabGroup: {
				activeTab: null,
			},
			all: [],
			onDidChangeTabGroups: () => ({ dispose: () => { } }),
			onDidChangeTabs: () => ({ dispose: () => { } }),
		},
	},
	commands: {
		executeCommand: vi.fn().mockResolvedValue(undefined),
	},
	TabInputTextDiff: class TabInputTextDiff {
		constructor(public original: any, public modified: any) { }
	},
}));

interface CloseDiffResult {
	success: boolean;
	already_closed: boolean;
	tab_name: string;
	message: string;
}

import {
	DiffStateManager,
	type ActiveDiff,
} from '../diffState';
import { registerCloseDiffTool } from '../tools/closeDiff';

describe('closeDiff tool', () => {
	const logger = new TestLogService();
	let diffState: DiffStateManager;

	const createMockDiff = (tabName: string, diffIdSuffix?: string): ActiveDiff => ({
		diffId: `/tmp/modified-${diffIdSuffix ?? tabName}.ts`,
		tabName: tabName,
		originalUri: { fsPath: `/path/to/original-${tabName}.ts`, scheme: 'file' } as any,
		modifiedUri: { fsPath: `/tmp/modified-${diffIdSuffix ?? tabName}.ts`, scheme: 'file' } as any,
		newContents: `// new contents for ${tabName}`,
		cleanup: vi.fn(),
		resolve: vi.fn(),
	});

	beforeEach(() => {
		diffState = new DiffStateManager(logger);
	});

	it('should register the close_diff tool', () => {
		const mockServer = new MockMcpServer();
		registerCloseDiffTool(mockServer as any, logger, diffState);

		expect(mockServer.getToolHandler('close_diff')).toBeDefined();
	});

	it('should close an active diff by tab name', async () => {
		const mockServer = new MockMcpServer();
		registerCloseDiffTool(mockServer as any, logger, diffState);

		const diff = createMockDiff('My Test Diff');
		diffState.register(diff);

		const handler = mockServer.getToolHandler('close_diff')!;
		const result = await handler({ tab_name: 'My Test Diff' });
		const parsed = parseToolResult<CloseDiffResult>(result);

		expect(parsed.success).toBe(true);
		expect(parsed.already_closed).toBe(false);
		expect(parsed.tab_name).toBe('My Test Diff');
		expect(parsed.message).toContain('closed successfully');

		expect(diff.resolve).toHaveBeenCalledWith({
			status: 'REJECTED',
			trigger: 'closed_via_tool',
		});
	});

	it('should return success with already_closed=true for non-existent tab', async () => {
		const mockServer = new MockMcpServer();
		registerCloseDiffTool(mockServer as any, logger, diffState);

		const handler = mockServer.getToolHandler('close_diff')!;
		const result = await handler({ tab_name: 'Non-existent Tab' });
		const parsed = parseToolResult<CloseDiffResult>(result);

		expect(parsed.success).toBe(true);
		expect(parsed.already_closed).toBe(true);
		expect(parsed.tab_name).toBe('Non-existent Tab');
		expect(parsed.message).toContain('may already be closed');
	});

	it('should be idempotent - closing same tab twice returns success', async () => {
		const mockServer = new MockMcpServer();
		registerCloseDiffTool(mockServer as any, logger, diffState);

		const diff = createMockDiff('Idempotent Test');
		diffState.register(diff);

		const handler = mockServer.getToolHandler('close_diff')!;

		const result1 = await handler({ tab_name: 'Idempotent Test' });
		const parsed1 = parseToolResult<CloseDiffResult>(result1);
		expect(parsed1.success).toBe(true);
		expect(parsed1.already_closed).toBe(false);

		diffState.unregister(diff.diffId);

		const result2 = await handler({ tab_name: 'Idempotent Test' });
		const parsed2 = parseToolResult<CloseDiffResult>(result2);
		expect(parsed2.success).toBe(true);
		expect(parsed2.already_closed).toBe(true);
	});

	it('should close the correct diff when multiple diffs are open', async () => {
		const mockServer = new MockMcpServer();
		registerCloseDiffTool(mockServer as any, logger, diffState);

		const diff1 = createMockDiff('First Diff');
		const diff2 = createMockDiff('Second Diff');
		const diff3 = createMockDiff('Third Diff');
		diffState.register(diff1);
		diffState.register(diff2);
		diffState.register(diff3);

		const handler = mockServer.getToolHandler('close_diff')!;

		const result = await handler({ tab_name: 'Second Diff' });
		const parsed = parseToolResult<CloseDiffResult>(result);

		expect(parsed.success).toBe(true);
		expect(parsed.already_closed).toBe(false);

		expect(diff1.resolve).not.toHaveBeenCalled();
		expect(diff2.resolve).toHaveBeenCalledWith({
			status: 'REJECTED',
			trigger: 'closed_via_tool',
		});
		expect(diff3.resolve).not.toHaveBeenCalled();

		expect(diffState.getByTabName('First Diff')).toBe(diff1);
		expect(diffState.getByTabName('Third Diff')).toBe(diff3);
	});

	describe('edge cases', () => {
		it('should handle empty tab name', async () => {
			const mockServer = new MockMcpServer();
			registerCloseDiffTool(mockServer as any, logger, diffState);

			const handler = mockServer.getToolHandler('close_diff')!;
			const result = await handler({ tab_name: '' });
			const parsed = parseToolResult<CloseDiffResult>(result);

			expect(parsed.success).toBe(true);
			expect(parsed.already_closed).toBe(true);
		});

		it('should handle tab name with special characters', async () => {
			const mockServer = new MockMcpServer();
			registerCloseDiffTool(mockServer as any, logger, diffState);

			const diff = createMockDiff('Diff: src/file.ts → modified (2024-01-23)');
			diffState.register(diff);

			const handler = mockServer.getToolHandler('close_diff')!;
			const result = await handler({ tab_name: 'Diff: src/file.ts → modified (2024-01-23)' });
			const parsed = parseToolResult<CloseDiffResult>(result);

			expect(parsed.success).toBe(true);
			expect(parsed.already_closed).toBe(false);
			expect(diff.resolve).toHaveBeenCalled();
		});

		it('should handle closing tab that was never opened', async () => {
			const mockServer = new MockMcpServer();
			registerCloseDiffTool(mockServer as any, logger, diffState);

			const handler = mockServer.getToolHandler('close_diff')!;
			const result = await handler({ tab_name: 'Never Existed Tab' });
			const parsed = parseToolResult<CloseDiffResult>(result);

			expect(parsed.success).toBe(true);
			expect(parsed.already_closed).toBe(true);
			expect(parsed.message).toContain('may already be closed');
		});

		it('should handle multiple diffs with same tab name but different diffIds', async () => {
			const mockServer = new MockMcpServer();
			registerCloseDiffTool(mockServer as any, logger, diffState);

			const diff1 = createMockDiff('Duplicate Name', 'diff1');
			const diff2 = createMockDiff('Duplicate Name', 'diff2');
			diffState.register(diff1);
			diffState.register(diff2);

			const handler = mockServer.getToolHandler('close_diff')!;
			const result = await handler({ tab_name: 'Duplicate Name' });
			const parsed = parseToolResult<CloseDiffResult>(result);

			expect(parsed.success).toBe(true);
			expect(parsed.already_closed).toBe(false);

			expect(diff1.resolve).toHaveBeenCalled();
			expect(diff2.resolve).not.toHaveBeenCalled();

			diffState.unregister(diff1.diffId);

			expect(diffState.getByTabName('Duplicate Name')).toBe(diff2);
		});

		it('should handle rapid successive closes of different tabs', async () => {
			const mockServer = new MockMcpServer();
			registerCloseDiffTool(mockServer as any, logger, diffState);

			const diff1 = createMockDiff('Tab A');
			const diff2 = createMockDiff('Tab B');
			const diff3 = createMockDiff('Tab C');
			diffState.register(diff1);
			diffState.register(diff2);
			diffState.register(diff3);

			const handler = mockServer.getToolHandler('close_diff')!;

			const [result1, result2, result3] = await Promise.all([
				handler({ tab_name: 'Tab A' }),
				handler({ tab_name: 'Tab B' }),
				handler({ tab_name: 'Tab C' }),
			]);

			expect(parseToolResult<CloseDiffResult>(result1).success).toBe(true);
			expect(parseToolResult<CloseDiffResult>(result2).success).toBe(true);
			expect(parseToolResult<CloseDiffResult>(result3).success).toBe(true);

			expect(diff1.resolve).toHaveBeenCalled();
			expect(diff2.resolve).toHaveBeenCalled();
			expect(diff3.resolve).toHaveBeenCalled();
		});

		it('should handle tab name that is very long', async () => {
			const mockServer = new MockMcpServer();
			registerCloseDiffTool(mockServer as any, logger, diffState);

			const longTabName = 'A'.repeat(1000);
			const diff = createMockDiff(longTabName);
			diffState.register(diff);

			const handler = mockServer.getToolHandler('close_diff')!;
			const result = await handler({ tab_name: longTabName });
			const parsed = parseToolResult<CloseDiffResult>(result);

			expect(parsed.success).toBe(true);
			expect(parsed.already_closed).toBe(false);
			expect(diff.resolve).toHaveBeenCalled();
		});

		it('should handle whitespace-only tab name', async () => {
			const mockServer = new MockMcpServer();
			registerCloseDiffTool(mockServer as any, logger, diffState);

			const handler = mockServer.getToolHandler('close_diff')!;
			const result = await handler({ tab_name: '   ' });
			const parsed = parseToolResult<CloseDiffResult>(result);

			expect(parsed.success).toBe(true);
			expect(parsed.already_closed).toBe(true);
		});

		it('should handle tab name with unicode characters', async () => {
			const mockServer = new MockMcpServer();
			registerCloseDiffTool(mockServer as any, logger, diffState);

			const diff = createMockDiff('编辑文件 🔧 файл.ts');
			diffState.register(diff);

			const handler = mockServer.getToolHandler('close_diff')!;
			const result = await handler({ tab_name: '编辑文件 🔧 файл.ts' });
			const parsed = parseToolResult<CloseDiffResult>(result);

			expect(parsed.success).toBe(true);
			expect(parsed.already_closed).toBe(false);
			expect(diff.resolve).toHaveBeenCalled();
		});
	});
});
