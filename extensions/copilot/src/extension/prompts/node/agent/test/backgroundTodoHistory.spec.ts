/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { describe, expect, test } from 'vitest';
import { IToolCall, IToolCallRound } from '../../../../prompt/common/intents';
import { ToolName } from '../../../../tools/common/toolNames';
import { LanguageModelTextPart, LanguageModelToolResult } from '../../../../../vscodeTypes';
import {
	classifyTool,
	collectAllRounds,
	compressHistory,
	extractTarget,
	renderGroupedProgress,
	renderLatestRound,
	renderSubagentDigests,
	renderToolCallRound,
} from '../backgroundTodoProcessor';

function makeCall(name: string, args: Record<string, unknown> = {}): IToolCall {
	return { name, arguments: JSON.stringify(args), id: `tc-${name}-${Math.random().toString(36).slice(2, 6)}` };
}

function makeRound(id: string, calls: IToolCall[], response = ''): IToolCallRound {
	return { id, response, toolInputRetry: 0, toolCalls: calls };
}

// ── classifyTool ────────────────────────────────────────────────

describe('classifyTool', () => {
	test('read-only tools are context', () => {
		expect(classifyTool(ToolName.ReadFile)).toBe('context');
		expect(classifyTool(ToolName.FindFiles)).toBe('context');
		expect(classifyTool(ToolName.FindTextInFiles)).toBe('context');
		expect(classifyTool(ToolName.ListDirectory)).toBe('context');
		expect(classifyTool(ToolName.GetErrors)).toBe('context');
		expect(classifyTool(ToolName.CoreScreenshotPage)).toBe('context');
	});

	test('mutating tools are meaningful', () => {
		expect(classifyTool(ToolName.ReplaceString)).toBe('meaningful');
		expect(classifyTool(ToolName.CreateFile)).toBe('meaningful');
		expect(classifyTool(ToolName.CoreRunInTerminal)).toBe('meaningful');
		expect(classifyTool(ToolName.CoreRunTest)).toBe('meaningful');
		expect(classifyTool(ToolName.ApplyPatch)).toBe('meaningful');
	});

	test('infrastructure tools are excluded', () => {
		expect(classifyTool(ToolName.CoreManageTodoList)).toBe('excluded');
		expect(classifyTool(ToolName.ToolSearch)).toBe('excluded');
		expect(classifyTool(ToolName.CoreAskQuestions)).toBe('excluded');
		expect(classifyTool(ToolName.CoreConfirmationTool)).toBe('excluded');
	});

	test('unknown tools default to meaningful', () => {
		expect(classifyTool('some_new_tool')).toBe('meaningful');
		expect(classifyTool('mcp_custom_server_action')).toBe('meaningful');
	});

	test('subagent tools are meaningful', () => {
		expect(classifyTool(ToolName.CoreRunSubagent)).toBe('meaningful');
		expect(classifyTool(ToolName.ExecutionSubagent)).toBe('meaningful');
		expect(classifyTool(ToolName.SearchSubagent)).toBe('meaningful');
	});
});

// ── extractTarget ───────────────────────────────────────────────

describe('extractTarget', () => {
	test('extracts filePath from read_file arguments', () => {
		const call = makeCall(ToolName.ReadFile, { filePath: 'src/app.ts', startLine: 1, endLine: 10 });
		expect(extractTarget(call)).toBe('src/app.ts');
	});

	test('extracts filePath from replace_string arguments', () => {
		const call = makeCall(ToolName.ReplaceString, { filePath: 'src/utils.ts', oldString: 'a', newString: 'b' });
		expect(extractTarget(call)).toBe('src/utils.ts');
	});

	test('terminal tools return "terminal"', () => {
		expect(extractTarget(makeCall(ToolName.CoreRunInTerminal))).toBe('terminal');
		expect(extractTarget(makeCall(ToolName.CoreGetTerminalOutput))).toBe('terminal');
		expect(extractTarget(makeCall(ToolName.CoreSendToTerminal))).toBe('terminal');
	});

	test('test/task tools return "tests/tasks"', () => {
		expect(extractTarget(makeCall(ToolName.CoreRunTest))).toBe('tests/tasks');
		expect(extractTarget(makeCall(ToolName.CoreRunTask))).toBe('tests/tasks');
	});

	test('falls back to tool name for unknown tools', () => {
		expect(extractTarget(makeCall('mcp_custom_action', { data: 123 }))).toBe('mcp_custom_action');
	});

	test('handles unparseable arguments gracefully', () => {
		const call: IToolCall = { name: ToolName.ReadFile, arguments: 'not json', id: 'tc-1' };
		expect(extractTarget(call)).toBe(ToolName.ReadFile);
	});

	test('subagent tools return appropriate categories', () => {
		expect(extractTarget(makeCall(ToolName.SearchSubagent))).toBe('search subagent');
		expect(extractTarget(makeCall(ToolName.CoreRunSubagent))).toBe('subagent');
	});

	test('multi-edit with one replacement returns the file path', () => {
		const call = makeCall(ToolName.MultiReplaceString, {
			explanation: 'fix typo',
			replacements: [{ filePath: 'src/a.ts', oldString: 'a', newString: 'b' }],
		});
		expect(extractTarget(call)).toBe('src/a.ts');
	});

	test('multi-edit with few replacements joins file paths', () => {
		const call = makeCall(ToolName.MultiReplaceString, {
			replacements: [
				{ filePath: 'src/a.ts' },
				{ filePath: 'src/b.ts' },
				{ filePath: 'src/a.ts' }, // duplicate, should de-dupe
			],
		});
		expect(extractTarget(call)).toBe('src/a.ts, src/b.ts');
	});

	test('multi-edit with many replacements collapses to a count', () => {
		const call = makeCall(ToolName.MultiReplaceString, {
			replacements: [
				{ filePath: 'a.ts' }, { filePath: 'b.ts' }, { filePath: 'c.ts' }, { filePath: 'd.ts' },
			],
		});
		expect(extractTarget(call)).toBe('4 files');
	});
});

// ── collectAllRounds ────────────────────────────────────────────

describe('collectAllRounds', () => {
	test('combines history and current rounds in order', () => {
		const historyRound = makeRound('h1', [makeCall(ToolName.ReadFile)]);
		const currentRound = makeRound('c1', [makeCall(ToolName.CreateFile)]);
		const history = [{ rounds: [historyRound] }] as any;
		const result = collectAllRounds(history, [currentRound]);
		expect(result).toHaveLength(2);
		expect(result[0].id).toBe('h1');
		expect(result[1].id).toBe('c1');
	});

	test('handles empty history and current rounds', () => {
		expect(collectAllRounds([], [])).toHaveLength(0);
	});
});

// ── compressHistory ─────────────────────────────────────────────

describe('compressHistory', () => {
	test('returns empty history for no rounds', () => {
		const result = compressHistory([]);
		expect(result.groupedProgress).toHaveLength(0);
		expect(result.previousRounds).toHaveLength(0);
		expect(result.latestRound).toBeUndefined();
		expect(result.assistantContext).toHaveLength(0);
	});

	test('single round becomes latestRound with empty groups', () => {
		const round = makeRound('r1', [
			makeCall(ToolName.ReplaceString, { filePath: 'src/a.ts' }),
		], 'I updated the file');
		const result = compressHistory([round]);
		expect(result.groupedProgress).toHaveLength(0);
		expect(result.previousRounds).toHaveLength(0);
		expect(result.latestRound).toBeDefined();
		expect(result.latestRound!.toolSummaries).toHaveLength(1);
		expect(result.latestRound!.assistantResponse).toBe('I updated the file');
	});

	test('groups multiple rounds by file target', () => {
		const r1 = makeRound('r1', [
			makeCall(ToolName.ReadFile, { filePath: 'src/a.ts' }),
			makeCall(ToolName.ReplaceString, { filePath: 'src/a.ts' }),
		]);
		const r2 = makeRound('r2', [
			makeCall(ToolName.ReadFile, { filePath: 'src/b.ts' }),
		]);
		const r3 = makeRound('r3', [
			makeCall(ToolName.ReplaceString, { filePath: 'src/a.ts' }),
		], 'Latest response');

		const result = compressHistory([r1, r2, r3]);

		// r1 and r2 should be grouped; r3 is latestRound
		expect(result.groupedProgress).toHaveLength(2);
		expect(result.previousRounds).toEqual([
			{
				id: 'r1',
				toolSummaries: [
					{ name: ToolName.ReadFile, target: 'src/a.ts' },
					{ name: ToolName.ReplaceString, target: 'src/a.ts' },
				],
				assistantResponse: '',
			},
			{
				id: 'r2',
				toolSummaries: [
					{ name: ToolName.ReadFile, target: 'src/b.ts' },
				],
				assistantResponse: '',
			},
		]);
		// src/a.ts has 1 meaningful + 1 context, should sort first
		const aGroup = result.groupedProgress.find(g => g.target === 'src/a.ts');
		expect(aGroup).toBeDefined();
		expect(aGroup!.meaningfulCalls).toContain(ToolName.ReplaceString);
		expect(aGroup!.contextCallCount).toBe(1);
		// src/b.ts has only context
		const bGroup = result.groupedProgress.find(g => g.target === 'src/b.ts');
		expect(bGroup).toBeDefined();
		expect(bGroup!.contextCallCount).toBe(1);
		expect(bGroup!.meaningfulCalls).toHaveLength(0);

		expect(result.latestRound!.assistantResponse).toBe('Latest response');
	});

	test('sorts meaningful-heavy groups first', () => {
		const r1 = makeRound('r1', [
			makeCall(ToolName.ReadFile, { filePath: 'src/read-only.ts' }),
			makeCall(ToolName.ReadFile, { filePath: 'src/read-only.ts' }),
			makeCall(ToolName.ReplaceString, { filePath: 'src/edited.ts' }),
			makeCall(ToolName.CreateFile, { filePath: 'src/edited.ts' }),
		]);
		const r2 = makeRound('r2', [makeCall(ToolName.ReadFile, { filePath: 'src/latest.ts' })]);
		const result = compressHistory([r1, r2]);

		// src/edited.ts (2 meaningful) should come before src/read-only.ts (0 meaningful, 2 context)
		expect(result.groupedProgress[0].target).toBe('src/edited.ts');
	});

	test('excludes infrastructure tool calls from groups', () => {
		const r1 = makeRound('r1', [
			makeCall(ToolName.CoreManageTodoList),
			makeCall(ToolName.ToolSearch),
			makeCall(ToolName.ReplaceString, { filePath: 'src/a.ts' }),
		]);
		const r2 = makeRound('r2', [makeCall(ToolName.ReadFile, { filePath: 'src/a.ts' })]);
		const result = compressHistory([r1, r2]);

		// Only src/a.ts group, no manage_todo_list or tool_search groups
		expect(result.groupedProgress).toHaveLength(1);
		expect(result.groupedProgress[0].target).toBe('src/a.ts');
		expect(result.groupedProgress[0].totalCalls).toBe(1); // only the replace_string
	});

	test('excludes infrastructure tools from latestRound summaries', () => {
		const round = makeRound('r1', [
			makeCall(ToolName.CoreManageTodoList),
			makeCall(ToolName.ReplaceString, { filePath: 'src/a.ts' }),
		]);
		const result = compressHistory([round]);
		expect(result.latestRound!.toolSummaries).toHaveLength(1);
		expect(result.latestRound!.toolSummaries[0].name).toBe(ToolName.ReplaceString);
	});

	test('attaches explanation/description as a per-call note in latestRound', () => {
		const round = makeRound('r1', [
			makeCall(ToolName.MultiReplaceString, {
				explanation: 'Add debug logging to silent catches in convert-cursor.js',
				replacements: [{ filePath: 'src/a.ts' }],
			}),
			makeCall(ToolName.CoreRunSubagent, { description: 'Read converter and remaining files' }),
			makeCall(ToolName.ReadFile, { filePath: 'src/b.ts' }),
		]);
		const result = compressHistory([round]);
		const summaries = result.latestRound!.toolSummaries;
		expect(summaries).toHaveLength(3);
		expect(summaries[0].note).toBe('Add debug logging to silent catches in convert-cursor.js');
		expect(summaries[1].note).toBe('Read converter and remaining files');
		expect(summaries[2].note).toBeUndefined();
	});

	test('attaches explanation/description as a per-call note in previous rounds', () => {
		const r1 = makeRound('r1', [
			makeCall(ToolName.MultiReplaceString, {
				explanation: 'Update the processor to keep full tool round detail',
				replacements: [{ filePath: 'src/a.ts' }],
			}),
			makeCall(ToolName.CoreRunSubagent, { description: 'Inspect related prompt rendering' }),
		], 'Earlier progress');
		const r2 = makeRound('r2', [makeCall(ToolName.ReadFile, { filePath: 'src/b.ts' })]);
		const result = compressHistory([r1, r2]);

		expect(result.previousRounds).toEqual([
			{
				id: 'r1',
				toolSummaries: [
					{ name: ToolName.MultiReplaceString, target: 'src/a.ts', note: 'Update the processor to keep full tool round detail' },
					{ name: ToolName.CoreRunSubagent, target: 'subagent', note: 'Inspect related prompt rendering' },
				],
				assistantResponse: 'Earlier progress',
			},
		]);
	});

	test('does not truncate the latest round response (prompt-tsx handles pruning)', () => {
		const longResponse = 'x'.repeat(3000);
		const round = makeRound('r1', [makeCall(ToolName.ReadFile, { filePath: 'a.ts' })], longResponse);
		const result = compressHistory([round]);
		expect(result.latestRound!.assistantResponse.length).toBe(3000);
	});

	test('returns all assistant responses in chronological order', () => {
		const r1 = makeRound('r1', [makeCall(ToolName.ReadFile, { filePath: 'a.ts' })], 'First response');
		const r2 = makeRound('r2', [makeCall(ToolName.ReadFile, { filePath: 'b.ts' })], 'Middle response');
		const r3 = makeRound('r3', [makeCall(ToolName.ReadFile, { filePath: 'c.ts' })], 'Latest response');
		const result = compressHistory([r1, r2, r3]);
		expect(result.assistantContext).toEqual(['First response', 'Middle response', 'Latest response']);
	});

	test('skips empty assistant responses in context', () => {
		const r1 = makeRound('r1', [makeCall(ToolName.ReadFile, { filePath: 'a.ts' })], '');
		const r2 = makeRound('r2', [makeCall(ToolName.ReadFile, { filePath: 'b.ts' })], 'Only response');
		const result = compressHistory([r1, r2]);
		// Latest has response, first is empty → only 1 context entry
		expect(result.assistantContext).toHaveLength(1);
		expect(result.assistantContext[0]).toBe('Only response');
	});
});

// ── renderGroupedProgress ───────────────────────────────────────

describe('renderGroupedProgress', () => {
	test('renders empty string for no groups', () => {
		expect(renderGroupedProgress([])).toBe('');
	});

	test('renders meaningful calls and context count', () => {
		const groups = [{
			target: 'src/app.ts',
			meaningfulCalls: [ToolName.ReplaceString, ToolName.ReplaceString],
			contextCallCount: 3,
			totalCalls: 5,
		}];
		const text = renderGroupedProgress(groups);
		expect(text).toContain('[src/app.ts]');
		expect(text).toContain('Actions:');
		expect(text).toContain('(3 reads)');
	});

	test('deduplicates tool names within a group', () => {
		const groups = [{
			target: 'src/app.ts',
			meaningfulCalls: [ToolName.ReplaceString, ToolName.ReplaceString, ToolName.CreateFile],
			contextCallCount: 0,
			totalCalls: 3,
		}];
		const text = renderGroupedProgress(groups);
		// Should appear once each, not duplicated
		const matches = text.match(new RegExp(ToolName.ReplaceString, 'g'));
		expect(matches).toHaveLength(1);
	});
});

// ── renderToolCallRound ─────────────────────────────────────────

describe('renderToolCallRound', () => {
	test('renders historical tool rounds with targets and notes', () => {
		const text = renderToolCallRound({
			id: 'r1',
			toolSummaries: [
				{ name: ToolName.ReplaceString, target: 'src/app.ts', note: 'Patch the app entrypoint' },
				{ name: ToolName.CoreRunInTerminal, target: 'terminal' },
			],
			assistantResponse: 'I updated and validated the app',
		});

		expect(text).toContain('Round r1:');
		expect(text).toContain(`- ${ToolName.ReplaceString} → src/app.ts`);
		expect(text).toContain('Patch the app entrypoint');
		expect(text).toContain('Agent said: I updated and validated the app');
	});
});

// ── renderLatestRound ───────────────────────────────────────────

describe('renderLatestRound', () => {
	test('renders tool summaries with targets', () => {
		const detail = {
			toolSummaries: [
				{ name: ToolName.ReplaceString, target: 'src/app.ts' },
				{ name: ToolName.CoreRunInTerminal, target: 'terminal' },
			],
			assistantResponse: 'I fixed the issue',
		};
		const text = renderLatestRound(detail);
		expect(text).toContain(`- ${ToolName.ReplaceString} → src/app.ts`);
		expect(text).toContain(`- ${ToolName.CoreRunInTerminal} → terminal`);
		expect(text).toContain('Agent said: I fixed the issue');
	});

	test('renders without agent response when empty', () => {
		const detail = {
			toolSummaries: [{ name: ToolName.ReadFile, target: 'src/a.ts' }],
			assistantResponse: '',
		};
		const text = renderLatestRound(detail);
		expect(text).not.toContain('Agent said');
	});
});

// ── subagent digests ────────────────────────────────────────────

describe('subagent digests', () => {
	test('compressHistory extracts subagent outputs when toolCallResults provided', () => {
		const subagentCall: IToolCall = { name: ToolName.ExploreSubagent, arguments: JSON.stringify({ description: 'Find logging gaps' }), id: 'tc-sa-1' };
		const editCall = makeCall(ToolName.ReplaceString, { filePath: 'src/a.ts' });
		const r1 = makeRound('r1', [subagentCall]);
		const r2 = makeRound('r2', [editCall], 'done');
		const results: Record<string, LanguageModelToolResult> = {
			'tc-sa-1': new LanguageModelToolResult([new LanguageModelTextPart('Found logging gaps in modules A, B, C.')]),
		};

		const result = compressHistory([r1, r2], results);

		expect(result.subagentDigests).toHaveLength(1);
		expect(result.subagentDigests[0].target).toBe('search subagent: Find logging gaps');
		expect(result.subagentDigests[0].output).toContain('Found logging gaps');
	});

	test('compressHistory chunks large subagent outputs', () => {
		const subagentCall: IToolCall = { name: ToolName.ExploreSubagent, arguments: '{}', id: 'tc-sa-1' };
		const longOutput = 'x'.repeat(9000);
		const results: Record<string, LanguageModelToolResult> = {
			'tc-sa-1': new LanguageModelToolResult([new LanguageModelTextPart(longOutput)]),
		};

		const result = compressHistory([makeRound('r1', [subagentCall])], results);

		expect(result.subagentDigests.length).toBeGreaterThan(1);
		expect(result.subagentDigests.map(digest => digest.output).join('')).toBe(longOutput);
		expect(result.subagentDigests.every(digest => digest.output.length <= 4000)).toBe(true);
		expect(result.subagentDigests[0].target).toBe('search subagent (part 1/3)');
	});

	test('compressHistory returns empty subagentDigests when no toolCallResults', () => {
		const r1 = makeRound('r1', [{ name: ToolName.ExploreSubagent, arguments: '{}', id: 'tc-sa-1' }]);
		const result = compressHistory([r1]);
		expect(result.subagentDigests).toHaveLength(0);
	});

	test('renderSubagentDigests formats each digest with index and target', () => {
		const text = renderSubagentDigests([
			{ target: 'search subagent', output: 'finding one' },
			{ target: 'subagent', output: 'finding two' },
		]);
		expect(text).toContain('[1] search subagent');
		expect(text).toContain('finding one');
		expect(text).toContain('[2] subagent');
		expect(text).toContain('finding two');
	});

	test('renderSubagentDigests returns empty string for no digests', () => {
		expect(renderSubagentDigests([])).toBe('');
	});
});
