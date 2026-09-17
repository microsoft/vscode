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
	getClaudeStreamingInvocationMessage,
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
			'Skill', 'TaskCreate', 'TaskUpdate', 'TaskList', 'TaskGet',
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
			['Skill', 'skill', 'Run skill'],
			['TaskCreate', 'custom-tool', 'Create task'],
			['TaskUpdate', 'custom-tool', 'Update task'],
			['TaskList', 'custom-tool', 'List tasks'],
			['TaskGet', 'custom-tool', 'Read task'],
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
				skill: getClaudeConfirmationTitle('Skill'),
				unknown: getClaudeConfirmationTitle('SomeNewTool'),
			},
			{
				shell: 'Run in terminal?',
				write: 'Edit file?',
				read: 'Read file?',
				url: 'Fetch URL?',
				mcpWithServer: 'Allow tool from github?',
				custom: 'Allow tool call?',
				skill: 'Run skill?',
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

	test('streams rich file and line-count messages for Claude edit tools', () => {
		assert.deepStrictEqual({
			write: getClaudeStreamingInvocationMessage('Write', {
				file_path: '/src/new.ts',
				content: 'one\r\ntwo\r\nthree',
			}),
			edit: getClaudeStreamingInvocationMessage('Edit', {
				file_path: '/src/foo.ts',
				old_string: 'one',
				new_string: 'one\ntwo',
			}),
			multiEdit: getClaudeStreamingInvocationMessage('MultiEdit', {
				file_path: '/src/foo.ts',
				edits: [
					{ old_string: 'one', new_string: 'one\ntwo' },
					{ old_string: 'three\nfour', new_string: 'updated' },
				],
			}),
			notebookEdit: getClaudeStreamingInvocationMessage('NotebookEdit', {
				notebook_path: '/src/notebook.ipynb',
				new_source: 'one\ntwo',
			}),
			read: getClaudeStreamingInvocationMessage('Read', { file_path: '/src/foo.ts' }),
		}, {
			write: { markdown: 'Creating [new.ts](file:///src/new.ts) (3 lines)' },
			edit: { markdown: 'Replacing 1 line with 2 lines in [foo.ts](file:///src/foo.ts)' },
			multiEdit: { markdown: 'Replacing 3 lines with 3 lines in [foo.ts](file:///src/foo.ts)' },
			notebookEdit: { markdown: 'Editing 2 lines in [notebook.ipynb](file:///src/notebook.ipynb)' },
			read: undefined,
		});
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
			Skill: { skill: 'deep-research', args: 'foo' },
			TaskCreate: { subject: 'Fix auth bug', description: '...' },
			TaskUpdate: { taskId: '1', status: 'completed' },
			TaskList: {},
			TaskGet: { taskId: '1' },
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
			['KillBash', 'terminal', { toolKind: 'terminal' }, 'Kill shell command', 'Kill shell command', '"Kill shell command" failed', '{\n  "bash_id": "b1"\n}'],
			['Read', 'read', { toolKind: 'read' }, { markdown: 'Read [foo.ts](file:///src/foo.ts)' }, { markdown: 'Read [foo.ts](file:///src/foo.ts)' }, '"Read file" failed', '{\n  "file_path": "/src/foo.ts"\n}'],
			['Glob', 'search', { toolKind: 'search' }, { markdown: 'Find files matching `**/*.ts`' }, { markdown: 'Find files matching `**/*.ts`' }, '"Find files" failed', '**/*.ts'],
			['Grep', 'search', { toolKind: 'search' }, { markdown: 'Search for `IClaudeAgentSession`' }, { markdown: 'Search for `IClaudeAgentSession`' }, '"Search files" failed', 'IClaudeAgentSession'],
			['LS', undefined, undefined, { markdown: 'List [src](file:///src)' }, { markdown: 'List [src](file:///src)' }, '"List directory" failed', '{\n  "path": "/src"\n}'],
			['NotebookRead', 'read', { toolKind: 'read' }, { markdown: 'Read [nb.ipynb](file:///nb.ipynb)' }, { markdown: 'Read [nb.ipynb](file:///nb.ipynb)' }, '"Read notebook" failed', '{\n  "notebook_path": "/nb.ipynb"\n}'],
			['Write', undefined, undefined, { markdown: 'Edit [foo.ts](file:///src/foo.ts)' }, { markdown: 'Edit [foo.ts](file:///src/foo.ts)' }, '"Write file" failed', '{\n  "file_path": "/src/foo.ts",\n  "content": "..."\n}'],
			['Edit', undefined, undefined, { markdown: 'Edit [foo.ts](file:///src/foo.ts)' }, { markdown: 'Edit [foo.ts](file:///src/foo.ts)' }, '"Edit file" failed', '{\n  "file_path": "/src/foo.ts",\n  "old_string": "a",\n  "new_string": "b"\n}'],
			['MultiEdit', undefined, undefined, { markdown: 'Edit [foo.ts](file:///src/foo.ts)' }, { markdown: 'Edit [foo.ts](file:///src/foo.ts)' }, '"Edit file" failed', '{\n  "file_path": "/src/foo.ts",\n  "edits": []\n}'],
			['NotebookEdit', undefined, undefined, { markdown: 'Edit [nb.ipynb](file:///nb.ipynb)' }, { markdown: 'Edit [nb.ipynb](file:///nb.ipynb)' }, '"Edit notebook" failed', '{\n  "notebook_path": "/nb.ipynb"\n}'],
			['TodoWrite', undefined, undefined, 'Update todo list', 'Update todo list', '"Update todo list" failed', '{\n  "todos": []\n}'],
			['WebFetch', undefined, undefined, { markdown: 'Fetching [https://example.com](https://example.com)' }, { markdown: 'Fetched [https://example.com](https://example.com)' }, '"Fetch URL" failed', '{\n  "url": "https://example.com"\n}'],
			['Task', 'subagent', { toolKind: 'subagent' }, 'find the bug', 'Ran subagent', '"Run subagent task" failed', '{\n  "description": "find the bug",\n  "subagent_type": "Explore"\n}'],
			['ExitPlanMode', undefined, undefined, 'Ready to code?', 'Ready to code?', '"Ready to code?" failed', '{\n  "plan": "..."\n}'],
			['AskUserQuestion', undefined, undefined, 'Ask user a question', 'Ask user a question', '"Ask user a question" failed', '{\n  "question": "why?"\n}'],
			['Skill', undefined, undefined, { markdown: 'Running skill `deep-research`' }, { markdown: 'Ran skill `deep-research`' }, '"Run skill" failed', '{\n  "skill": "deep-research",\n  "args": "foo"\n}'],
			['TaskCreate', undefined, undefined, 'Create task: Fix auth bug', 'Create task: Fix auth bug', '"Create task" failed', '{\n  "subject": "Fix auth bug",\n  "description": "..."\n}'],
			['TaskUpdate', undefined, undefined, 'Complete task', 'Complete task', '"Update task" failed', '{\n  "taskId": "1",\n  "status": "completed"\n}'],
			['TaskList', undefined, undefined, 'Read task list', 'Read task list', '"List tasks" failed', '{}'],
			['TaskGet', undefined, undefined, 'Read task', 'Read task', '"Read task" failed', '{\n  "taskId": "1"\n}'],
		]);
	});

	test('Phase 8.5 — TaskUpdate message varies by status', () => {
		const invoke = (status?: string) =>
			getClaudeInvocationMessage('TaskUpdate', 'Update task', status ? { taskId: '1', status } : { taskId: '1' });
		const past = (status?: string) =>
			getClaudePastTenseMessage('TaskUpdate', 'Update task', status ? { taskId: '1', status } : { taskId: '1' }, true);
		assert.deepStrictEqual(
			{
				startInvoke: invoke('in_progress'),
				startPast: past('in_progress'),
				completeInvoke: invoke('completed'),
				completePast: past('completed'),
				deleteInvoke: invoke('deleted'),
				deletePast: past('deleted'),
				noStatusInvoke: invoke(),
				noStatusPast: past(),
				unknownStatusInvoke: invoke('bogus'),
			},
			{
				startInvoke: 'Start task',
				startPast: 'Start task',
				completeInvoke: 'Complete task',
				completePast: 'Complete task',
				deleteInvoke: 'Delete task',
				deletePast: 'Delete task',
				noStatusInvoke: 'Update task',
				noStatusPast: 'Update task',
				unknownStatusInvoke: 'Update task',
			},
		);
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
				readMissingPath: 'Read file',
				grepMissingPattern: 'Search files',
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
