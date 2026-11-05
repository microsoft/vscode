/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Schemas } from '../../../../../../../base/common/network.js';
import { extUri, ExtUri } from '../../../../../../../base/common/resources.js';
import { URI } from '../../../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../../base/test/common/utils.js';
import { getToolGroupSummary } from '../../../../browser/widget/chatContentParts/chatToolGroupSummary.js';
import { IChatToolInvocationSerialized, ToolConfirmKind } from '../../../../common/chatService/chatService.js';
import { ChatToolInvocation } from '../../../../common/model/chatProgressTypes/chatToolInvocation.js';
import { ToolDataSource } from '../../../../common/tools/languageModelToolsService.js';
import { ChatToolInvocationSummary } from '../../../../common/tools/toolInvocationSummary.js';

suite('ChatToolGroupSummary', () => {
	ensureNoDisposablesAreLeakedInTestSuite();
	const tool = (id: string, summary?: ChatToolInvocationSummary): IChatToolInvocationSerialized => ({
		kind: 'toolInvocationSerialized', toolCallId: id, toolId: 'tool', summary,
		invocationMessage: 'Tool activity', pastTenseMessage: undefined, originMessage: undefined,
		isConfirmed: { type: ToolConfirmKind.ConfirmationNotNeeded }, isComplete: true,
		presentation: undefined, source: ToolDataSource.Internal,
	});
	const summarize = (tools: IChatToolInvocationSerialized[]) => getToolGroupSummary(tools, [], tools.length, extUri);

	test('counts distinct search phrases, file patterns, and command invocations', () => {
		assert.deepStrictEqual({
			phrases: summarize(['one', 'two', 'three', 'four', 'one'].map((query, index) => tool(String(index), { kind: 'search', queries: [query], searchKind: 'text' }))),
			patterns: summarize(['*.ts', '*.css'].map((query, index) => tool(String(index), { kind: 'search', queries: [query], searchKind: 'files' }))),
			commands: summarize(['one', 'two', 'three'].map(id => tool(id, { kind: 'command' }))),
			duplicateCall: summarize([tool('one', { kind: 'command' }), tool('one', { kind: 'command' })]),
		}, {
			phrases: 'Searched for 4 phrases',
			patterns: 'Searched for 2 file patterns',
			commands: 'Ran 3 commands',
			duplicateCall: 'Ran 1 command',
		});
	});

	test('deduplicates read resources without claiming unreported line counts', () => {
		const file = URI.file('/workspace/file.ts');
		assert.deepStrictEqual({
			singleFile: summarize([
				tool('one', { kind: 'read', resources: [{ uri: file }] }),
				tool('two', { kind: 'read', resources: [{ uri: URI.parse(file.toString()) }] }),
			]),
			files: summarize(Array.from({ length: 6 }, (_, index) => tool(String(index), { kind: 'read', resources: [{ uri: URI.file(`/workspace/file${index % 5}.ts`) }] }))),
		}, { singleFile: 'Read file.ts', files: 'Read 5 files' });
	});

	test('counts edit resources without counting a tool and its pills twice', () => {
		const file = URI.file('/workspace/file.ts');
		const edit = tool('edit', { kind: 'edit', resources: [file].map(uri => ({ uri })) });
		assert.deepStrictEqual({
			singleFile: getToolGroupSummary([edit], [[file]], 2, extUri),
			files: getToolGroupSummary([edit],
				Array.from({ length: 5 }, (_, index) => [index === 0 ? file : URI.file(`/workspace/file${index}.ts`)]), 6, extUri),
			missingFiles: summarize([tool('patch', { kind: 'edit', resources: [] })]),
			partialFiles: getToolGroupSummary([edit, tool('patch', { kind: 'edit', resources: [] })], [[file]], 3, extUri),
		}, {
			singleFile: 'Edited file.ts',
			files: 'Edited 5 files',
			missingFiles: undefined,
			partialFiles: 'Edited file.ts, 1 other step',
		});
	});

	test('counts all files in one markdown part independently of its statistics', () => {
		const resources = [URI.file('/workspace/First.ts'), URI.file('/workspace/Second.ts')];
		const command = tool('command', { kind: 'command' });
		assert.strictEqual(getToolGroupSummary([command], [resources], 2, extUri), 'Edited 2 files, ran 1 command');
	});

	test('uses provider-aware casing without changing the displayed filename', () => {
		const identity = new ExtUri(uri => uri.scheme === Schemas.file);
		const local = ['File.ts', 'file.ts'].map((name, index) => tool(String(index), {
			kind: 'read', resources: [{ uri: URI.file(`/workspace/${name}`) }],
		}));
		const remote = ['File.ts', 'file.ts'].map((name, index) => tool(String(index), {
			kind: 'read', resources: [{ uri: URI.from({ scheme: Schemas.vscodeRemote, authority: 'linux', path: `/workspace/${name}` }) }],
		}));
		assert.deepStrictEqual({
			local: getToolGroupSummary(local, [], 2, identity),
			remote: getToolGroupSummary(remote, [], 2, identity),
		}, { local: 'Read File.ts', remote: 'Read 2 files' });
	});

	test('keeps completed command facts independent of background process exit state', () => {
		const terminal = tool('terminal', { kind: 'command' });
		const results = [undefined, 1, 0].map(exitCode => summarize([{
			...terminal,
			toolSpecificData: {
				kind: 'terminal', commandLine: { original: 'build' }, language: 'shellscript',
				isBackground: true, terminalCommandState: exitCode === undefined ? undefined : { exitCode },
			},
		}]));
		assert.deepStrictEqual(results, ['Ran 1 command', 'Ran 1 command', 'Ran 1 command']);
	});

	test('does not hide empty summary metadata behind another known activity', () => {
		const command = tool('command', { kind: 'command' });
		const summaries: ChatToolInvocationSummary[] = [
			{ kind: 'read', resources: [] },
			{ kind: 'search', queries: [], searchKind: 'text' },
			{ kind: 'search', queries: [''], searchKind: 'files' },
			{ kind: 'list', resources: [] },
			{ kind: 'diagnostics', resources: [] },
		];
		assert.deepStrictEqual(summaries.map(summary => summarize([command, tool('empty', summary)])), [
			'Ran 1 command, 1 other step', 'Ran 1 command, 1 other step', 'Ran 1 command, 1 other step', 'Ran 1 command, 1 other step', 'Ran 1 command, 1 other step',
		]);
	});

	test('combines known activities and supports directories and diagnostics', () => {
		const file = URI.file('/workspace/file.ts');
		assert.deepStrictEqual({
			mixed: summarize([
				tool('read', { kind: 'read', resources: [{ uri: file }] }),
				tool('search', { kind: 'search', queries: ['query'], searchKind: 'text' }),
				tool('command', { kind: 'command' }),
			]),
			directories: summarize(['src', 'test', 'src'].map((name, index) => tool(String(index), { kind: 'list', resources: [{ uri: URI.file(`/workspace/${name}`) }] }))),
			diagnostics: summarize([tool('errors', { kind: 'diagnostics', resources: [{ uri: file }] })]),
			folderDiagnostics: summarize([tool('errors', { kind: 'diagnostics', resources: ['src', 'test'].map(name => ({ uri: URI.file(`/workspace/${name}`) })) })]),
		}, {
			mixed: 'Ran 1 command, read file.ts, searched for 1 phrase',
			directories: 'Listed 2 directories',
			diagnostics: 'Checked file.ts for problems',
			folderDiagnostics: 'Checked 2 paths for problems',
		});
	});

	test('joins activities with commas and only capitalizes the first activity', () => {
		assert.deepStrictEqual({
			filesAndSearches: summarize([
				tool('read', { kind: 'read', resources: ['one', 'two', 'three'].map(name => ({ uri: URI.file(`/workspace/${name}.ts`) })) }),
				tool('search', { kind: 'search', queries: ['*.ts', '*.js', '*.css'], searchKind: 'files' }),
			]),
			fileNameCase: summarize([
				tool('edit', { kind: 'edit', resources: [{ uri: URI.file('/workspace/EditedFile.ts') }] }),
				tool('read', { kind: 'read', resources: [{ uri: URI.file('/workspace/ReadFile.ts') }] }),
			]),
		}, {
			filesAndSearches: 'Read 3 files, searched for 3 file patterns',
			fileNameCase: 'Edited EditedFile.ts, read ReadFile.ts',
		});
	});

	test('caps all category combinations at three named groups, prioritizing edits and commands', () => {
		const file = URI.file('/workspace/File.ts');
		const categories: { summary: ChatToolInvocationSummary; label: string }[] = [
			{ summary: { kind: 'edit', resources: [{ uri: file }] }, label: 'Edited File.ts' },
			{ summary: { kind: 'command' }, label: 'Ran 1 command' },
			{ summary: { kind: 'read', resources: [{ uri: file }] }, label: 'Read File.ts' },
			{ summary: { kind: 'search', queries: ['phrase'], searchKind: 'text' }, label: 'Searched for 1 phrase' },
			{ summary: { kind: 'search', queries: ['*.ts'], searchKind: 'files' }, label: 'Searched for 1 file pattern' },
			{ summary: { kind: 'list', resources: [{ uri: file }] }, label: 'Listed 1 directory' },
			{ summary: { kind: 'diagnostics', resources: [{ uri: file }] }, label: 'Checked File.ts for problems' },
		];
		const actual: (string | undefined)[] = [];
		const expected: string[] = [];
		for (let mask = 1; mask < 1 << categories.length; mask++) {
			const selected = categories.filter((_, index) => mask & (1 << index));
			const tools = selected.map((category, index) => tool(String(index), category.summary));
			const labels = selected.slice(0, 3).map((category, index) => index === 0 ? category.label : category.label[0].toLowerCase() + category.label.slice(1));
			const omitted = selected.length - 3;
			if (omitted > 0) {
				labels.push(omitted === 1 ? '1 other step' : `${omitted} other steps`);
			}
			const title = labels.join(', ');
			actual.push(summarize(tools), summarize(tools.reverse()));
			expected.push(title, title);
		}
		assert.deepStrictEqual(actual, expected);
	});

	test('counts overflow invocations rather than categories, unique queries, or resources', () => {
		const file = URI.file('/workspace/File.ts');
		const primary = [
			tool('read', { kind: 'read', resources: [{ uri: file }] }),
			tool('command', { kind: 'command' }),
			tool('edit', { kind: 'edit', resources: [{ uri: file }] }),
		];
		const search = tool('search', { kind: 'search', queries: ['first', 'second', 'third'], searchKind: 'text' });
		assert.deepStrictEqual({
			threeGroups: summarize(primary),
			oneCall: summarize([...primary, search]),
			multipleCalls: summarize([
				...primary, search, search,
				tool('repeat-search', { kind: 'search', queries: ['first'], searchKind: 'text' }),
				tool('diagnostics', { kind: 'diagnostics', resources: ['one', 'two', 'three'].map(name => ({ uri: URI.file(`/workspace/${name}.ts`) })) }),
				tool('unknown'),
			]),
		}, {
			threeGroups: 'Edited File.ts, ran 1 command, read File.ts',
			oneCall: 'Edited File.ts, ran 1 command, read File.ts, 1 other step',
			multipleCalls: 'Edited File.ts, ran 1 command, read File.ts, 4 other steps',
		});
	});

	test('keeps errors explicit when outcomes are folded into overflow', () => {
		const file = URI.file('/workspace/File.ts');
		const tools: IChatToolInvocationSerialized[] = [
			tool('edit', { kind: 'edit', resources: [{ uri: file }] }),
			tool('command', { kind: 'command' }),
			tool('read', { kind: 'read', resources: [{ uri: file }] }),
			{ ...tool('failed-one'), resultError: true },
			{ ...tool('failed-two'), resultError: true },
			{ ...tool('skipped'), isConfirmed: { type: ToolConfirmKind.Skipped } },
			tool('denied', { kind: 'denied' }),
			tool('unfinished', { kind: 'incomplete' }),
			tool('unknown'),
		];
		assert.strictEqual(summarize(tools), 'Edited File.ts, ran 1 command, read File.ts, 6 other steps (2 failed, 1 skipped, 1 denied, 1 unfinished)');
	});

	test('keeps known activity and distinguishes failed, skipped, denied, and unfinished outcomes', () => {
		const command = tool('command', { kind: 'command' });
		const running = new ChatToolInvocation(
			{ invocationMessage: 'Running', toolSpecificData: { kind: 'terminal', commandLine: { original: 'build' }, language: 'shellscript' } },
			{ id: 'bash', displayName: 'Shell', modelDescription: 'Shell', source: ToolDataSource.Internal },
			'running', undefined, {},
		);
		assert.deepStrictEqual({
			unknown: summarize([command, tool('unknown')]),
			onlyUnknown: summarize([tool('unknown')]),
			failed: summarize([{ ...command, resultError: true }]),
			denied: summarize([{ ...command, isConfirmed: { type: ToolConfirmKind.Denied } }]),
			skipped: summarize([{ ...command, isConfirmed: { type: ToolConfirmKind.Skipped } }]),
			unfinished: getToolGroupSummary([running], [], 1, extUri),
			restoredUnfinished: summarize([running.toJSON()]),
			legacyUnfinished: summarize([{ ...command, isComplete: false }]),
			hooks: getToolGroupSummary([command], [], 2, extUri),
		}, {
			unknown: 'Ran 1 command, 1 other step',
			onlyUnknown: undefined,
			failed: '1 tool call failed',
			denied: '1 tool call denied',
			skipped: '1 tool call skipped',
			unfinished: '1 unfinished tool call',
			restoredUnfinished: '1 unfinished tool call',
			legacyUnfinished: '1 unfinished tool call',
			hooks: 'Ran 1 command, 1 other step',
		});
	});

	test('retains completed activity while another tool is still running', () => {
		let summaryReads = 0;
		const completed: IChatToolInvocationSerialized = {
			...tool('completed'),
			get summary(): ChatToolInvocationSummary {
				summaryReads++;
				return { kind: 'read', resources: [{ uri: URI.file('/workspace/File.ts') }] };
			},
		};
		const running = new ChatToolInvocation(
			{ invocationMessage: 'Searching' },
			{ id: 'grep_search', displayName: 'Search', modelDescription: 'Search', source: ToolDataSource.Internal },
			'running', undefined, { query: 'layout' },
		);
		const title = getToolGroupSummary([completed, running], [], 2, extUri);
		assert.deepStrictEqual({ title, summaryReads }, { title: 'Read File.ts, 1 unfinished tool call', summaryReads: 1 });
	});

	test('reports the three-command and five-step mixed-error scenarios', () => {
		const command = tool('command', { kind: 'command' });
		assert.deepStrictEqual({
			commands: summarize([command, { ...tool('git'), resultError: true }, { ...tool('node'), resultError: true }]),
			mixed: summarize([
				{ ...tool('rename-first'), resultError: true },
				{ ...tool('search'), resultError: true },
				tool('search-tools'),
				{ ...tool('find-files'), isConfirmed: { type: ToolConfirmKind.Skipped } },
				{ ...tool('rename-last'), resultError: true },
			]),
		}, {
			commands: 'Ran 1 command, 2 tool calls failed',
			mixed: '3 tool calls failed, 1 tool call skipped, 1 other step',
		});
	});
});
