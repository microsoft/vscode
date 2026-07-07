/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import {
	getClaudeConfirmationTitle,
	getClaudeInvocationMessage,
	getClaudePastTenseMessage,
	getClaudePermissionKind,
	getClaudeToolDisplayName,
	getClaudeToolInputString,
	getClaudeToolKind,
	getClaudeToolPath,
	INTERACTIVE_CLAUDE_TOOLS,
	buildClaudeToolMeta,
	isClaudeFileEditTool,
} from '../../node/claude/claudeToolDisplay.js';

/**
 * Pure-data snapshot tests for [claudeToolDisplay.ts](../../node/claude/claudeToolDisplay.ts).
 * Phase 7 plan §4: every cell of the mapping table must be reachable
 * from one assertion. The snapshot lives here, not in a fixture file,
 * so future renames flow through compile-checks.
 */
suite('claudeToolDisplay — §4 mapping table', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('mapping snapshot covers every Phase 7 §4 row', () => {
		const TOOLS = [
			'Bash', 'BashOutput', 'KillBash',
			'Read', 'Glob', 'Grep', 'LS', 'NotebookRead',
			'Write', 'Edit', 'MultiEdit', 'NotebookEdit', 'TodoWrite',
			'WebFetch', 'Task',
			'ExitPlanMode', 'AskUserQuestion',
		] as const;

		const snapshot = TOOLS.map(t => [t, getClaudePermissionKind(t), getClaudeToolDisplayName(t)] as const);

		assert.deepStrictEqual(snapshot, [
			['Bash', 'shell', 'Run shell command'],
			['BashOutput', 'shell', 'Read shell output'],
			['KillBash', 'shell', 'Kill shell command'],
			['Read', 'read', 'Read file'],
			['Glob', 'read', 'Find files'],
			['Grep', 'read', 'Search files'],
			['LS', 'read', 'List directory'],
			['NotebookRead', 'read', 'Read notebook'],
			['Write', 'write', 'Write file'],
			['Edit', 'write', 'Edit file'],
			['MultiEdit', 'write', 'Edit file'],
			['NotebookEdit', 'write', 'Edit notebook'],
			['TodoWrite', 'write', 'Update todo list'],
			['WebFetch', 'url', 'Fetch URL'],
			['Task', 'custom-tool', 'Run subagent task'],
			['ExitPlanMode', 'custom-tool', 'Ready to code?'],
			['AskUserQuestion', 'custom-tool', 'Ask user a question'],
		]);
	});

	test('mcp__-prefixed tool maps to mcp / strips prefix in displayName', () => {
		assert.deepStrictEqual(
			[
				getClaudePermissionKind('mcp__github__listIssues'),
				getClaudeToolDisplayName('mcp__github__listIssues'),
			],
			['mcp', 'Run MCP tool github__listIssues'],
		);
	});

	test('unknown tool defaults to custom-tool / toolName', () => {
		assert.deepStrictEqual(
			[
				getClaudePermissionKind('SomeNewTool'),
				getClaudeToolDisplayName('SomeNewTool'),
			],
			['custom-tool', 'SomeNewTool'],
		);
	});

	test('getClaudeToolPath snapshot for path-bearing tools', () => {
		assert.deepStrictEqual(
			{
				read: getClaudeToolPath('Read', { file_path: '/tmp/a' }),
				write: getClaudeToolPath('Write', { file_path: '/tmp/b' }),
				edit: getClaudeToolPath('Edit', { file_path: '/tmp/c' }),
				multiEdit: getClaudeToolPath('MultiEdit', { file_path: '/tmp/d' }),
				notebookRead: getClaudeToolPath('NotebookRead', { notebook_path: '/tmp/e.ipynb' }),
				notebookEdit: getClaudeToolPath('NotebookEdit', { notebook_path: '/tmp/f.ipynb' }),
				glob: getClaudeToolPath('Glob', { path: '/tmp/g', pattern: '*' }),
				grep: getClaudeToolPath('Grep', { path: '/tmp/h', pattern: 'foo' }),
				ls: getClaudeToolPath('LS', { path: '/tmp/i' }),
				webFetch: getClaudeToolPath('WebFetch', { url: 'https://example.com' }),
				bash: getClaudeToolPath('Bash', { command: 'ls' }),
				todoWrite: getClaudeToolPath('TodoWrite', { todos: [] }),
				wrongTypeRead: getClaudeToolPath('Read', { file_path: 42 }),
				missingRead: getClaudeToolPath('Read', {}),
				nonObject: getClaudeToolPath('Write', null),
				unknownTool: getClaudeToolPath('SomeNewTool', { file_path: '/tmp/x' }),
			},
			{
				read: '/tmp/a',
				write: '/tmp/b',
				edit: '/tmp/c',
				multiEdit: '/tmp/d',
				notebookRead: '/tmp/e.ipynb',
				notebookEdit: '/tmp/f.ipynb',
				glob: '/tmp/g',
				grep: '/tmp/h',
				ls: '/tmp/i',
				webFetch: 'https://example.com',
				bash: undefined,
				todoWrite: undefined,
				wrongTypeRead: undefined,
				missingRead: undefined,
				nonObject: undefined,
				unknownTool: undefined,
			},
		);
	});

	test('INTERACTIVE_CLAUDE_TOOLS contains exactly the user-input round-trip tools', () => {
		assert.deepStrictEqual(
			[...INTERACTIVE_CLAUDE_TOOLS].sort(),
			['AskUserQuestion', 'ExitPlanMode'],
		);
	});

	test('getClaudeConfirmationTitle returns per-permissionKind localized title', () => {
		assert.deepStrictEqual(
			{
				shell: getClaudeConfirmationTitle('Bash'),
				write: getClaudeConfirmationTitle('Write'),
				read: getClaudeConfirmationTitle('Read'),
				url: getClaudeConfirmationTitle('WebFetch'),
				mcpWithServer: getClaudeConfirmationTitle('mcp__github__listIssues'),
				custom: getClaudeConfirmationTitle('Task'),
				unknown: getClaudeConfirmationTitle('SomeNewTool'),
			},
			{
				shell: 'Run in terminal?',
				write: 'Edit file?',
				read: 'Read file?',
				url: 'Fetch URL?',
				mcpWithServer: 'Allow tool from github?',
				custom: 'Allow tool call?',
				unknown: 'Allow tool call?',
			},
		);
	});

	test('Phase 8 — isClaudeFileEditTool covers Write/Edit/MultiEdit/NotebookEdit, excludes TodoWrite/Bash/others', () => {
		assert.deepStrictEqual(
			{
				Write: isClaudeFileEditTool('Write'),
				Edit: isClaudeFileEditTool('Edit'),
				MultiEdit: isClaudeFileEditTool('MultiEdit'),
				NotebookEdit: isClaudeFileEditTool('NotebookEdit'),
				TodoWrite: isClaudeFileEditTool('TodoWrite'),
				Read: isClaudeFileEditTool('Read'),
				Bash: isClaudeFileEditTool('Bash'),
				unknown: isClaudeFileEditTool('SomeNewTool'),
				mcp: isClaudeFileEditTool('mcp__server__edit'),
			},
			{
				Write: true,
				Edit: true,
				MultiEdit: true,
				NotebookEdit: true,
				TodoWrite: false,
				Read: false,
				Bash: false,
				unknown: false,
				mcp: false,
			},
		);
	});

	test('Phase 8.5 — rich rendering snapshot covers every tool row', () => {
		const SAMPLE_INPUT: Record<string, unknown> = {
			Bash: { command: 'git status' },
			BashOutput: { bash_id: 'b1' },
			KillBash: { bash_id: 'b1' },
			Read: { file_path: '/src/foo.ts' },
			Glob: { pattern: '**/*.ts' },
			Grep: { pattern: 'IClaudeAgentSession' },
			LS: { path: '/src' },
			NotebookRead: { notebook_path: '/nb.ipynb' },
			Write: { file_path: '/src/foo.ts', content: '...' },
			Edit: { file_path: '/src/foo.ts', old_string: 'a', new_string: 'b' },
			MultiEdit: { file_path: '/src/foo.ts', edits: [] },
			NotebookEdit: { notebook_path: '/nb.ipynb' },
			TodoWrite: { todos: [] },
			WebFetch: { url: 'https://example.com' },
			Task: { description: 'find the bug', subagent_type: 'Explore' },
			ExitPlanMode: { plan: '...' },
			AskUserQuestion: { question: 'why?' },
		};

		const TOOLS = Object.keys(SAMPLE_INPUT) as readonly (keyof typeof SAMPLE_INPUT)[];

		const snapshot = TOOLS.map(t => {
			const input = SAMPLE_INPUT[t];
			const displayName = getClaudeToolDisplayName(t);
			return [
				t,
				getClaudeToolKind(t),
				buildClaudeToolMeta(t),
				getClaudeInvocationMessage(t, displayName, input),
				getClaudePastTenseMessage(t, displayName, input, true),
				getClaudePastTenseMessage(t, displayName, input, false),
				getClaudeToolInputString(t, input),
			] as const;
		});

		assert.deepStrictEqual(snapshot, [
			['Bash', 'terminal', { toolKind: 'terminal' }, { markdown: 'Running `git status`' }, { markdown: 'Ran `git status`' }, '"Run shell command" failed', 'git status'],
			['BashOutput', 'terminal', { toolKind: 'terminal' }, 'Reading shell output', 'Read shell output', '"Read shell output" failed', '{\n  "bash_id": "b1"\n}'],
			['KillBash', 'terminal', { toolKind: 'terminal' }, 'Killing shell command', 'Killed shell command', '"Kill shell command" failed', '{\n  "bash_id": "b1"\n}'],
			['Read', undefined, undefined, { markdown: 'Reading [foo.ts](file:///src/foo.ts)' }, { markdown: 'Read [foo.ts](file:///src/foo.ts)' }, '"Read file" failed', '{\n  "file_path": "/src/foo.ts"\n}'],
			['Glob', 'search', { toolKind: 'search' }, { markdown: 'Finding files matching `**/*.ts`' }, { markdown: 'Found files matching `**/*.ts`' }, '"Find files" failed', '**/*.ts'],
			['Grep', 'search', { toolKind: 'search' }, { markdown: 'Searching for `IClaudeAgentSession`' }, { markdown: 'Searched for `IClaudeAgentSession`' }, '"Search files" failed', 'IClaudeAgentSession'],
			['LS', undefined, undefined, { markdown: 'Listing [src](file:///src)' }, { markdown: 'Listed [src](file:///src)' }, '"List directory" failed', '{\n  "path": "/src"\n}'],
			['NotebookRead', undefined, undefined, { markdown: 'Reading [nb.ipynb](file:///nb.ipynb)' }, { markdown: 'Read [nb.ipynb](file:///nb.ipynb)' }, '"Read notebook" failed', '{\n  "notebook_path": "/nb.ipynb"\n}'],
			['Write', undefined, undefined, { markdown: 'Editing [foo.ts](file:///src/foo.ts)' }, { markdown: 'Edited [foo.ts](file:///src/foo.ts)' }, '"Write file" failed', '{\n  "file_path": "/src/foo.ts",\n  "content": "..."\n}'],
			['Edit', undefined, undefined, { markdown: 'Editing [foo.ts](file:///src/foo.ts)' }, { markdown: 'Edited [foo.ts](file:///src/foo.ts)' }, '"Edit file" failed', '{\n  "file_path": "/src/foo.ts",\n  "old_string": "a",\n  "new_string": "b"\n}'],
			['MultiEdit', undefined, undefined, { markdown: 'Editing [foo.ts](file:///src/foo.ts)' }, { markdown: 'Edited [foo.ts](file:///src/foo.ts)' }, '"Edit file" failed', '{\n  "file_path": "/src/foo.ts",\n  "edits": []\n}'],
			['NotebookEdit', undefined, undefined, { markdown: 'Editing [nb.ipynb](file:///nb.ipynb)' }, { markdown: 'Edited [nb.ipynb](file:///nb.ipynb)' }, '"Edit notebook" failed', '{\n  "notebook_path": "/nb.ipynb"\n}'],
			['TodoWrite', undefined, undefined, 'Updating todo list', 'Updated todo list', '"Update todo list" failed', '{\n  "todos": []\n}'],
			['WebFetch', undefined, undefined, { markdown: 'Fetching [https://example.com](https://example.com)' }, { markdown: 'Fetched [https://example.com](https://example.com)' }, '"Fetch URL" failed', '{\n  "url": "https://example.com"\n}'],
			['Task', 'subagent', { toolKind: 'subagent' }, 'find the bug', 'Ran subagent', '"Run subagent task" failed', '{\n  "description": "find the bug",\n  "subagent_type": "Explore"\n}'],
			['ExitPlanMode', undefined, undefined, 'Ready to code?', 'Ready to code?', '"Ready to code?" failed', '{\n  "plan": "..."\n}'],
			['AskUserQuestion', undefined, undefined, 'Ask user a question', 'Ask user a question', '"Ask user a question" failed', '{\n  "question": "why?"\n}'],
		]);
	});

	test('Phase 8.5 — defensive input handling falls back to static display strings', () => {
		assert.deepStrictEqual(
			{
				bashNoCommand: getClaudeInvocationMessage('Bash', 'Run shell command', {}),
				bashWrongType: getClaudeInvocationMessage('Bash', 'Run shell command', { command: 42 }),
				readMissingPath: getClaudeInvocationMessage('Read', 'Read file', {}),
				grepMissingPattern: getClaudeInvocationMessage('Grep', 'Search files', {}),
				nonObjectInput: getClaudeInvocationMessage('Bash', 'Run shell command', null),
				undefinedInput: getClaudeInvocationMessage('Bash', 'Run shell command', undefined),
				taskNoDescription: getClaudeInvocationMessage('Task', 'Run subagent task', {}),
				bashFailed: getClaudePastTenseMessage('Bash', 'Run shell command', { command: 'x' }, false),
				inputStringUndefined: getClaudeToolInputString('Bash', undefined),
				inputStringBashNoCommand: getClaudeToolInputString('Bash', {}),
			},
			{
				bashNoCommand: 'Running shell command',
				bashWrongType: 'Running shell command',
				readMissingPath: 'Reading file',
				grepMissingPattern: 'Searching files',
				nonObjectInput: 'Running shell command',
				undefinedInput: 'Running shell command',
				taskNoDescription: 'Run subagent task',
				bashFailed: '"Run shell command" failed',
				inputStringUndefined: undefined,
				inputStringBashNoCommand: '{}',
			},
		);
	});

	test('Phase 8.5 — Agent row mirrors Task (subagent kind, same display name)', () => {
		assert.deepStrictEqual(
			[
				getClaudeToolKind('Agent'),
				buildClaudeToolMeta('Agent'),
				getClaudeToolDisplayName('Agent'),
				getClaudePermissionKind('Agent'),
				getClaudeInvocationMessage('Agent', getClaudeToolDisplayName('Agent'), { description: 'review this' }),
			],
			[
				'subagent',
				{ toolKind: 'subagent' },
				'Run subagent task',
				'custom-tool',
				'review this',
			],
		);
	});

	test('Phase 8.5 — MCP tools have no toolKind, JSON input fallback', () => {
		assert.deepStrictEqual(
			{
				kind: getClaudeToolKind('mcp__github__listIssues'),
				meta: buildClaudeToolMeta('mcp__github__listIssues'),
				inputString: getClaudeToolInputString('mcp__github__listIssues', { owner: 'microsoft', repo: 'vscode' }),
				invocation: getClaudeInvocationMessage('mcp__github__listIssues', 'Run MCP tool github__listIssues', { owner: 'microsoft' }),
			},
			{
				kind: undefined,
				meta: undefined,
				inputString: '{\n  "owner": "microsoft",\n  "repo": "vscode"\n}',
				invocation: 'Run MCP tool github__listIssues',
			},
		);
	});
});
