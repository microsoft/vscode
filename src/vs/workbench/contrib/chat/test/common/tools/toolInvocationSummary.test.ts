/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { revive } from '../../../../../../base/common/marshalling.js';
import { URI } from '../../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { IChatTerminalToolInvocationData, IChatToolInvocationSerialized } from '../../../common/chatService/chatService.js';
import { ChatToolInvocation } from '../../../common/model/chatProgressTypes/chatToolInvocation.js';
import { ToolDataSource } from '../../../common/tools/languageModelToolsService.js';
import { getToolInvocationSummary, getToolInvocationSummaryFromInput } from '../../../common/tools/toolInvocationSummary.js';

suite('Tool invocation summaries', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('recognizes built-in structured inputs without guessing tool names', () => {
		const file = URI.file('/workspace/file.ts');
		assert.deepStrictEqual({
			read: getToolInvocationSummaryFromInput('copilot_readFile', { filePath: file.path, startLine: 1, endLine: 100 }),
			view: getToolInvocationSummaryFromInput('view', { path: file.path, view_range: [10, 20] }),
			openEndedRead: getToolInvocationSummaryFromInput('read_file', { filePath: file.path, startLine: 1, endLine: -1 }),
			directoryView: getToolInvocationSummaryFromInput('view', { path: '/workspace' }),
			search: getToolInvocationSummaryFromInput('grep_search', { query: 'first|second' }),
			files: getToolInvocationSummaryFromInput('glob', { pattern: '**/*.ts' }),
			terminal: getToolInvocationSummaryFromInput('bash', { command: 'build && test' }),
			directory: getToolInvocationSummaryFromInput('list_dir', { path: '/workspace' }),
			diagnostics: getToolInvocationSummaryFromInput('get_errors', { filePaths: [file.path] }),
			edit: getToolInvocationSummaryFromInput('copilot_replaceString', { filePath: file.path }),
			patch: getToolInvocationSummaryFromInput('apply_patch', { patch: 'opaque patch content' }),
			customRead: getToolInvocationSummaryFromInput('custom_read_data', { path: file.path }),
			customMcp: getToolInvocationSummaryFromInput('mcp__host__read_file', { filePath: file.path }),
			relativePath: getToolInvocationSummaryFromInput('read_file', { filePath: 'file.ts' }),
		}, {
			read: { kind: 'read', resources: [{ uri: file }] },
			view: { kind: 'read', resources: [{ uri: file }] },
			openEndedRead: { kind: 'read', resources: [{ uri: file }] },
			directoryView: undefined,
			search: { kind: 'search', queries: ['first|second'], searchKind: 'text' },
			files: { kind: 'search', queries: ['**/*.ts'], searchKind: 'files' },
			terminal: { kind: 'command' },
			directory: { kind: 'list', resources: [{ uri: URI.file('/workspace') }] },
			diagnostics: { kind: 'diagnostics', resources: [{ uri: file }] },
			edit: { kind: 'edit', resources: [{ uri: file }] },
			patch: { kind: 'edit', resources: [] },
			customRead: undefined,
			customMcp: undefined,
			relativePath: { kind: 'read', resources: [] },
		});
	});

	test('does not mistake requested lines for actual read results', async () => {
		const file = URI.file('/workspace/file.ts');
		const tool = new ChatToolInvocation(
			{ invocationMessage: 'Read file' },
			{ id: 'copilot_readFile', displayName: 'Read file', modelDescription: 'Read file', source: ToolDataSource.Internal },
			'read', undefined, { filePath: file.path, startLine: 1, endLine: 100 },
		);
		await tool.didExecuteTool({ content: [] });
		assert.strictEqual(getToolInvocationSummary(tool), undefined);
	});

	test('does not infer activity from tool names and parameters in the shared model', async () => {
		const tools = ['read_file', 'bash', 'view', 'edit', 'grep'].map(id => new ChatToolInvocation(
			{ invocationMessage: id }, { id, displayName: id, modelDescription: id, source: ToolDataSource.Internal }, id, undefined,
			{ filePath: '/workspace/File.ts', path: '/workspace/File.ts', view_range: [1, 10], command: 'build', pattern: 'query' },
		));
		await Promise.all(tools.map(tool => tool.didExecuteTool({ content: [] })));
		assert.deepStrictEqual(tools.map(getToolInvocationSummary), [undefined, undefined, undefined, undefined, undefined]);
	});

	test('preserves host-mapped resources through serialization', async () => {
		const uri = URI.parse('remote-file:/host/workspace/File.ts');
		const tool = new ChatToolInvocation(
			{ invocationMessage: 'Read file' },
			{ id: 'view', displayName: 'Read file', modelDescription: 'Read file', source: ToolDataSource.Internal },
			'read', undefined, undefined,
		);
		tool.summary = { kind: 'read', resources: [{ uri }] };
		await tool.didExecuteTool({ content: [] });
		const restored: IChatToolInvocationSerialized = revive(JSON.parse(JSON.stringify(tool.toJSON())));
		const expected = { kind: 'read', resources: [{ uri }] };
		assert.deepStrictEqual({ live: getToolInvocationSummary(tool), restored: getToolInvocationSummary(restored) }, { live: expected, restored: expected });
	});

	test('does not reconstruct local resources when host facts are absent', async () => {
		const tool = new ChatToolInvocation(
			{ invocationMessage: 'Create file' },
			{ id: 'create_file', displayName: 'Create file', modelDescription: 'Create file', source: ToolDataSource.Internal },
			'create', undefined, { filePath: '/workspace/File.ts' },
		);
		await tool.didExecuteTool({ content: [] });
		assert.strictEqual(getToolInvocationSummary(tool), undefined);
	});

	test('preserves unfinished state when serializing tool summary facts', async () => {
		const file = URI.file('/workspace/file.ts');
		const tool = new ChatToolInvocation(
			{ invocationMessage: 'Read file' },
			{ id: 'read_file', displayName: 'Read file', modelDescription: 'Read file', source: ToolDataSource.Internal },
			'read', undefined, { filePath: file.path },
		);
		const restored: IChatToolInvocationSerialized = revive(JSON.parse(JSON.stringify(tool.toJSON())));
		tool.summary = { kind: 'read', resources: [{ uri: file }] };
		await tool.didExecuteTool({ content: [] });
		assert.deepStrictEqual({
			unfinished: getToolInvocationSummary(restored),
			completed: getToolInvocationSummary(tool.toJSON()),
		}, {
			unfinished: { kind: 'incomplete' },
			completed: { kind: 'read', resources: [{ uri: file }] },
		});
	});

	test('round-trips completed background commands without persisting transient process status', async () => {
		const terminal: IChatTerminalToolInvocationData = {
			kind: 'terminal', commandLine: { original: 'build' }, language: 'shellscript', isBackground: true,
		};
		const tool = new ChatToolInvocation(
			{ invocationMessage: 'Run build', toolSpecificData: terminal },
			{ id: 'bash', displayName: 'Shell', modelDescription: 'Shell', source: ToolDataSource.Internal },
			'build', undefined, undefined,
		);
		tool.summary = { kind: 'command' };
		await tool.didExecuteTool({ content: [] });
		const saved = JSON.stringify(tool.toJSON());
		const summaries = [undefined, 0, 1].map(exitCode => {
			const restored: IChatToolInvocationSerialized = revive(JSON.parse(saved));
			restored.toolSpecificData = { ...terminal, terminalCommandState: exitCode === undefined ? undefined : { exitCode } };
			return { stored: restored.summary, displayed: getToolInvocationSummary(restored) };
		});
		assert.deepStrictEqual(summaries, [undefined, 0, 1].map(() => ({
			stored: { kind: 'command' }, displayed: { kind: 'command' },
		})));
	});

	test('preserves an explicit incomplete fact when disposal settles an invocation', async () => {
		const tool = new ChatToolInvocation(
			{ invocationMessage: 'Run build' },
			{ id: 'bash', displayName: 'Shell', modelDescription: 'Shell', source: ToolDataSource.Internal },
			'build', undefined, undefined,
		);
		tool.summary = { kind: 'incomplete' };
		await tool.didExecuteTool(undefined);
		const restored: IChatToolInvocationSerialized = revive(JSON.parse(JSON.stringify(tool.toJSON())));
		assert.deepStrictEqual({ stored: restored.summary, displayed: getToolInvocationSummary(restored) }, {
			stored: { kind: 'incomplete' }, displayed: { kind: 'incomplete' },
		});
	});

	test('does not interpret display-only references as completed activity', async () => {
		const file = URI.file('/workspace/file.ts');
		const tool = new ChatToolInvocation(
			{ invocationMessage: 'Read file' },
			{ id: 'read_file', displayName: 'Read file', modelDescription: 'Read file', source: ToolDataSource.Internal },
			'read', undefined, { filePath: file.path },
		);
		await tool.didExecuteTool({
			content: [],
			toolResultDetails: [{ uri: file, range: { startLineNumber: 10, startColumn: 1, endLineNumber: 10, endColumn: 1 } }],
		});
		assert.strictEqual(getToolInvocationSummary(tool), undefined);
	});

	test('persists host search facts without persisting input parameters', async () => {
		const tool = new ChatToolInvocation(
			{ invocationMessage: 'Search files' },
			{ id: 'grep', displayName: 'Search', modelDescription: 'Search', source: ToolDataSource.Internal },
			'search', undefined, { pattern: 'query' },
		);
		tool.summary = getToolInvocationSummaryFromInput('grep', { pattern: 'query' });
		await tool.didExecuteTool({ content: [] });
		const restored: IChatToolInvocationSerialized = revive(JSON.parse(JSON.stringify(tool.toJSON())));
		assert.deepStrictEqual({
			live: getToolInvocationSummary(tool),
			restored: getToolInvocationSummary(restored),
		}, {
			live: { kind: 'search', queries: ['query'], searchKind: 'text' },
			restored: { kind: 'search', queries: ['query'], searchKind: 'text' },
		});
	});

	test('maps host resources and handles missing or malformed input conservatively', () => {
		const mapped = URI.parse('remote-file:/host/file.ts');
		assert.deepStrictEqual({
			mapped: getToolInvocationSummaryFromInput('read_file', { filePath: '/host/file.ts' }, () => mapped),
			missing: getToolInvocationSummaryFromInput('grep_search', undefined),
			array: getToolInvocationSummaryFromInput('grep_search', ['query']),
			empty: getToolInvocationSummaryFromInput('grep_search', { query: '' }),
			invalidRange: getToolInvocationSummaryFromInput('read_file', { filePath: '/file.ts', startLine: -1, endLine: Infinity }),
			windows: getToolInvocationSummaryFromInput('read_file', { filePath: 'C:\\workspace\\file.ts' }),
			openEndedView: getToolInvocationSummaryFromInput('view', { path: '/file.ts', view_range: [1, -1] }),
		}, {
			mapped: { kind: 'read', resources: [{ uri: mapped }] },
			missing: undefined,
			array: undefined,
			empty: undefined,
			invalidRange: { kind: 'read', resources: [{ uri: URI.file('/file.ts') }] },
			windows: { kind: 'read', resources: [{ uri: URI.file('C:/workspace/file.ts') }] },
			openEndedView: { kind: 'read', resources: [{ uri: URI.file('/file.ts') }] },
		});
	});
});
