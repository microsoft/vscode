/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import type { PermissionRequest } from '@github/copilot-sdk';
import { URI } from '../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { getEditFilePath, getEditFilePaths, getInvocationMessage, getPastTenseMessage, getPermissionDisplay, getShellIntention, getShellLanguage, getStreamingInvocationMessage, getTaskCompleteMarkdown, getToolDisplayName, getToolInputString, getToolKind, getToolMarkdownContent, isEditTool, isHiddenTool, isMarkdownRenderedTool, synthesizeSkillToolCall } from '../../node/copilot/copilotToolDisplay.js';

type CopilotShellPermissionRequest = Extract<PermissionRequest, { kind: 'shell' }>;
type CopilotCustomToolPermissionRequest = Extract<PermissionRequest, { kind: 'custom-tool' }>;

function shellPermissionRequest(fullCommandText: string, requestSandboxBypass?: boolean): CopilotShellPermissionRequest {
	return {
		kind: 'shell',
		canOfferSessionApproval: false,
		commands: [],
		fullCommandText,
		hasWriteFileRedirection: false,
		intention: '',
		possiblePaths: [],
		possibleUrls: [],
		requestSandboxBypass,
	};
}

function customToolPermissionRequest(toolName: string, args: CopilotCustomToolPermissionRequest['args']): CopilotCustomToolPermissionRequest {
	return {
		kind: 'custom-tool',
		toolName,
		toolDescription: '',
		args,
	};
}

suite('copilotToolDisplay — friendly tool names', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('mirrors internal Copilot CLI friendly labels for representative tools', () => {
		const cases: Array<[toolName: string, displayName: string]> = [
			['bash', 'Run Shell Command'],
			['powershell', 'Run Shell Command'],
			['read_bash', 'Read Terminal'],
			['read_powershell', 'Read Terminal'],
			['write_bash', 'Write to Bash'],
			['write_powershell', 'Write to PowerShell'],
			['stop_bash', 'Stop Terminal Session'],
			['stop_powershell', 'Stop Terminal Session'],
			['bash_shutdown', 'Stop Terminal Session'],
			['powershell_shutdown', 'Stop Terminal Session'],
			['list_bash', 'List Shell Sessions'],
			['list_powershell', 'List Shell Sessions'],
			['view', 'Read'],
			['edit', 'Edit File'],
			['str_replace_editor', 'Edit File'],
			['str_replace', 'Edit File'],
			['insert', 'Edit File'],
			['create', 'Create File'],
			['grep', 'Search'],
			['rg', 'Search'],
			['glob', 'Search'],
			['search_code_subagent', 'Search Code'],
			['reply_to_comment', 'Reply to Comment'],
			['code_review', 'Code Review'],
			['think', 'Thinking'],
			['report_intent', 'Report Intent'],
			['report_progress', 'Progress update'],
			['web_fetch', 'Fetch Web Content'],
			['web_search', 'Web Search'],
			['update_todo', 'Update Todo'],
			['show_file', 'Show File'],
			['fetch_copilot_cli_documentation', 'Fetch Documentation'],
			['propose_work', 'Propose Work'],
			['task_complete', 'Task Complete'],
			['ask_user', 'Ask User'],
			['skill', 'Invoke Skill'],
			['task', 'Delegate Task'],
			['list_agents', 'List Agents'],
			['read_agent', 'Read Agent'],
			['exit_plan_mode', 'Exit Plan Mode'],
			['sql', 'Execute SQL'],
			['lsp', 'Language Server'],
			['create_pull_request', 'Create Pull Request'],
			['gh-advisory-database', 'Check Dependencies'],
			['store_memory', 'Store Memory'],
			['apply_patch', 'Apply Patch'],
			['write_agent', 'Write to Agent'],
			['mcp_reload', 'Reload MCP Config'],
			['mcp_validate', 'Validate MCP Config'],
			['tool_search_tool_regex', 'Search Tools'],
			['parallel_validation', 'Validate Changes'],
			['codeql_checker', 'CodeQL Security Scan'],
			['addComment', 'Add Comment'],
			['listComments', 'List Comments'],
			['replyToComment', 'Reply to Comment'],
			['deleteComments', 'Delete Comments'],
			['resolveComments', 'Resolve Comments'],
			['viewUnreviewedComments', 'View Comments'],
		];

		for (const [toolName, displayName] of cases) {
			assert.strictEqual(getToolDisplayName(toolName), displayName, toolName);
		}
	});

	test('falls back to the raw tool name for unknown tools', () => {
		assert.strictEqual(getToolDisplayName('some_new_tool'), 'some_new_tool');
	});
});

suite('copilotToolDisplay — edit tool classification', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('classifies direct file edit tools', () => {
		for (const toolName of ['edit', 'str_replace', 'insert', 'create', 'apply_patch', 'git_apply_patch']) {
			assert.strictEqual(isEditTool(toolName), true, toolName);
		}
	});

	test('classifies str_replace_editor by command', () => {
		for (const command of ['edit', 'str_replace', 'insert', 'create']) {
			assert.strictEqual(isEditTool('str_replace_editor', command), true, command);
		}
		assert.strictEqual(isEditTool('str_replace_editor', 'view'), false);
		assert.strictEqual(isEditTool('str_replace_editor', 'unknown'), false);
		assert.strictEqual(isEditTool('str_replace_editor'), false);
	});
});

suite('copilotToolDisplay — markdown-rendered tools', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('task_complete renders as markdown, other tools do not', () => {
		assert.strictEqual(isMarkdownRenderedTool('task_complete'), true);
		assert.strictEqual(isMarkdownRenderedTool('bash'), false);
		assert.strictEqual(isMarkdownRenderedTool('report_intent'), false);
	});

	test('getToolMarkdownContent returns the task_complete summary when present', () => {
		assert.strictEqual(getToolMarkdownContent('task_complete', { summary: 'All tests pass.' }), '\n\n**Task completed:** All tests pass.');
	});

	test('getTaskCompleteMarkdown prefers the input summary over truncated tool output', () => {
		const truncatedOutput = 'Output too large to read at once (11.3 KB). Saved to: /tmp/task-complete.txt';
		assert.deepStrictEqual({
			withSummary: getTaskCompleteMarkdown({ summary: 'Completed the requested work.' }, truncatedOutput),
			withoutSummary: getTaskCompleteMarkdown({}, 'Fallback summary.'),
		}, {
			withSummary: '\n\n**Task completed:** Completed the requested work.',
			withoutSummary: '\n\n**Task completed:** Fallback summary.',
		});
	});

	test('getToolMarkdownContent returns undefined for empty, missing, or non-string summaries', () => {
		assert.strictEqual(getToolMarkdownContent('task_complete', { summary: '' }), undefined);
		assert.strictEqual(getToolMarkdownContent('task_complete', {}), undefined);
		assert.strictEqual(getToolMarkdownContent('task_complete', undefined), undefined);
		assert.strictEqual(getToolMarkdownContent('task_complete', { summary: 42 }), undefined);
	});

	test('getToolMarkdownContent returns undefined for non-markdown tools', () => {
		assert.strictEqual(getToolMarkdownContent('bash', { summary: 'ignored' }), undefined);
	});
});

suite('getPermissionDisplay — read confirmation title', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	const wd = URI.file('/repo/project');

	function readRequest(path: string, requestSandboxBypass?: boolean): PermissionRequest {
		return { kind: 'read', intention: `Read file: ${path}`, path, ...(requestSandboxBypass ? { requestSandboxBypass } : {}) } as PermissionRequest;
	}

	/**
	 * The runtime's unauthorized-path gate reuses the access kind and carries
	 * `paths` rather than the per-kind `path`.
	 */
	function unauthorizedPathGateRequest(...paths: string[]): PermissionRequest {
		return { kind: 'read', intention: 'Read files', paths } as unknown as PermissionRequest;
	}

	test('claims "outside of workspace" only when the path really is outside', () => {
		assert.deepStrictEqual({
			inside: getPermissionDisplay(readRequest('/repo/project/src/app.ts'), wd).confirmationTitle,
			insideDirectory: getPermissionDisplay(readRequest('/repo/project/src'), wd).confirmationTitle,
			outside: getPermissionDisplay(readRequest('/etc/hosts'), wd).confirmationTitle,
			secondRoot: getPermissionDisplay(readRequest('/repo/other/lib.ts'), wd, undefined, [URI.file('/repo/other')]).confirmationTitle,
			outsideEveryRoot: getPermissionDisplay(readRequest('/etc/hosts'), wd, undefined, [URI.file('/repo/other')]).confirmationTitle,
			pathGate: getPermissionDisplay(unauthorizedPathGateRequest('/etc/hosts'), wd).confirmationTitle,
			relative: getPermissionDisplay(readRequest('README.md'), wd).confirmationTitle,
			unknownWorkspace: getPermissionDisplay(readRequest('/repo/project/src/app.ts'), undefined).confirmationTitle,
			sandboxBypass: getPermissionDisplay(readRequest('/repo/project/src/app.ts', true), wd).confirmationTitle,
		}, {
			inside: 'Allow reading file?',
			insideDirectory: 'Allow reading file?',
			outside: 'Allow reading file outside of workspace?',
			secondRoot: 'Allow reading file?',
			outsideEveryRoot: 'Allow reading file outside of workspace?',
			pathGate: 'Allow reading file outside of workspace?',
			relative: 'Allow reading file?',
			unknownWorkspace: 'Allow reading file?',
			sandboxBypass: 'Read file outside the sandbox?',
		});
	});
});

suite('getPermissionDisplay — cd-prefix stripping', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	const wd = URI.file('/repo/project');

	test('strips redundant cd from shell permission request fullCommandText', () => {
		const request = shellPermissionRequest('cd /repo/project && npm test');
		const display = getPermissionDisplay(request, wd);
		assert.strictEqual(display.toolInput, 'npm test');
		assert.strictEqual(display.permissionKind, 'shell');
	});

	test('leaves shell command alone when cd target differs from working directory', () => {
		const request = shellPermissionRequest('cd /tmp && ls');
		const display = getPermissionDisplay(request, wd);
		assert.strictEqual(display.toolInput, 'cd /tmp && ls');
	});

	test('leaves shell command alone when no working directory provided', () => {
		const request = shellPermissionRequest('cd /repo/project && npm test');
		const display = getPermissionDisplay(request, undefined);
		assert.strictEqual(display.toolInput, 'cd /repo/project && npm test');
	});

	test('strips redundant cd from custom-tool shell permission request', () => {
		const request = customToolPermissionRequest('bash', { command: 'cd /repo/project && echo hi' });
		const display = getPermissionDisplay(request, wd);
		assert.strictEqual(display.toolInput, 'echo hi');
		assert.strictEqual(display.permissionKind, 'shell');
	});

	test('does not affect non-shell custom-tool requests', () => {
		const request = customToolPermissionRequest('some_other_tool', { command: 'cd /repo/project && echo hi' });
		const display = getPermissionDisplay(request, wd);
		// Falls through to the generic branch — toolInput is the JSON-stringified args.
		assert.ok(display.toolInput?.includes('cd /repo/project'), `expected unrewritten args, got: ${display.toolInput}`);
		assert.strictEqual(display.permissionKind, 'custom-tool');
	});

	test('handles powershell custom-tool with semicolon separator', () => {
		const request = customToolPermissionRequest('powershell', { command: 'cd /repo/project; dir' });
		const display = getPermissionDisplay(request, wd);
		assert.strictEqual(display.toolInput, 'dir');
	});

	test('confirmation title reflects sandbox bypass for shell requests', () => {
		const sandboxed = getPermissionDisplay(shellPermissionRequest('npm test'), wd);
		const bypass = getPermissionDisplay(shellPermissionRequest('npm test', true), wd);

		assert.notStrictEqual(bypass.confirmationTitle, sandboxed.confirmationTitle);
		assert.ok(/sandbox/i.test(bypass.confirmationTitle), `expected title to mention the sandbox, got: ${bypass.confirmationTitle}`);
	});

});

suite('getPermissionDisplay — read permission display', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('uses the view-tool invocation message for read permissions', () => {
		const display = getPermissionDisplay({
			kind: 'read',
			path: '/Users/connor/Downloads/context7-copilot-debug-main.json',
			intention: 'Read file: /Users/connor/Downloads/context7-copilot-debug-main.json',
		}, URI.file('/repo/project'));

		assert.deepStrictEqual({
			invocationMessage: display.invocationMessage,
			toolInput: display.toolInput,
			permissionKind: display.permissionKind,
			permissionPath: display.permissionPath,
		}, {
			invocationMessage: { markdown: 'Read [context7-copilot-debug-main.json](file:///Users/connor/Downloads/context7-copilot-debug-main.json)' },
			toolInput: undefined,
			permissionKind: 'read',
			permissionPath: '/Users/connor/Downloads/context7-copilot-debug-main.json',
		});
	});
});

suite('getPermissionDisplay — write permission display', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('distinguishes creating a file from editing one', () => {
		const request = {
			kind: 'write',
			canOfferSessionApproval: false,
			diff: '',
			fileName: '/repo/project/package.json',
			intention: '',
		} satisfies PermissionRequest;

		assert.deepStrictEqual({
			create: getPermissionDisplay(request, URI.file('/repo/project'), true),
			edit: getPermissionDisplay(request, URI.file('/repo/project'), false),
		}, {
			create: {
				confirmationTitle: 'Create file?',
				invocationMessage: { markdown: 'Create [package.json](file:///repo/project/package.json)' },
				toolInput: '{"path":"/repo/project/package.json"}',
				permissionKind: 'write',
				permissionPath: '/repo/project/package.json',
			},
			edit: {
				confirmationTitle: 'Write file?',
				invocationMessage: { markdown: 'Edit [package.json](file:///repo/project/package.json)' },
				toolInput: '{"path":"/repo/project/package.json"}',
				permissionKind: 'write',
				permissionPath: '/repo/project/package.json',
			},
		});
	});
});

suite('view tool — view_range display', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	function invocation(parameters: Record<string, unknown> | undefined): string {
		const result = getInvocationMessage('view', 'View File', parameters);
		return typeof result === 'string' ? result : result.markdown;
	}

	function pastTense(parameters: Record<string, unknown> | undefined): string {
		const result = getPastTenseMessage('view', 'View File', parameters, true);
		return typeof result === 'string' ? result : result.markdown;
	}

	test('renders path-only when view_range is absent', () => {
		assert.ok(invocation({ path: '/repo/file.ts' }).startsWith('Read ['));
		assert.ok(pastTense({ path: '/repo/file.ts' }).startsWith('Read ['));
	});

	test('renders Copilot SDK tool-output reads without exposing the temp path', () => {
		const paths = [
			'/tmp/1786468439523-copilot-tool-output-d115e2.txt',
			'/tmp/1786499016779-copilot-tool-output-44600-1a0a63b8-4548-4fb8-a507-da72473e0556.txt',
			'C:\\Temp\\copilot-tool-output-1786468439523-d115e2.txt',
			'C:\\Temp\\copilot-tool-output-1786499172415-297.txt',
		];
		assert.deepStrictEqual(
			paths.map(path => ({
				invocation: invocation({ path, view_range: [107, 119] }),
				pastTense: pastTense({ path, view_range: [107, 119] }),
			})),
			[
				{ invocation: 'Read tool output', pastTense: 'Read tool output' },
				{ invocation: 'Read tool output', pastTense: 'Read tool output' },
				{ invocation: 'Read tool output', pastTense: 'Read tool output' },
				{ invocation: 'Read tool output', pastTense: 'Read tool output' },
			],
		);
	});

	test('renders "lines X to Y" for a valid two-element range', () => {
		assert.ok(invocation({ path: '/repo/file.ts', view_range: [10, 20] }).endsWith(', lines 10 to 20'));
		assert.ok(pastTense({ path: '/repo/file.ts', view_range: [10, 20] }).endsWith(', lines 10 to 20'));
	});

	test('renders "line X" when start === end', () => {
		assert.ok(invocation({ path: '/repo/file.ts', view_range: [10, 10] }).endsWith(', line 10'));
		assert.ok(pastTense({ path: '/repo/file.ts', view_range: [10, 10] }).endsWith(', line 10'));
	});

	test('renders "line X to the end" for the -1 EOF sentinel', () => {
		assert.ok(invocation({ path: '/repo/file.ts', view_range: [10, -1] }).endsWith(', line 10 to the end'));
		assert.ok(pastTense({ path: '/repo/file.ts', view_range: [10, -1] }).endsWith(', line 10 to the end'));
	});

	test('falls back to path-only for invalid ranges', () => {
		// end < start (and not -1)
		assert.ok(!invocation({ path: '/repo/file.ts', view_range: [20, 10] }).includes(','));
		// negative start
		assert.ok(!invocation({ path: '/repo/file.ts', view_range: [-5, 10] }).includes(','));
		// non-integer
		assert.ok(!invocation({ path: '/repo/file.ts', view_range: [1.5, 10] }).includes(','));
		// wrong arity
		assert.ok(!invocation({ path: '/repo/file.ts', view_range: [10] }).includes(','));
		assert.ok(!invocation({ path: '/repo/file.ts', view_range: [10, 20, 30] }).includes(','));
		// non-array
		assert.ok(!invocation({ path: '/repo/file.ts', view_range: 'whatever' }).includes(','));
	});
});

suite('copilotToolDisplay — built-in tool invocation/past-tense messages', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	function invocation(toolName: string, parameters: Record<string, unknown> | undefined): string {
		const result = getInvocationMessage(toolName, getToolDisplayName(toolName), parameters);
		return typeof result === 'string' ? result : result.markdown;
	}

	function pastTense(toolName: string, parameters: Record<string, unknown> | undefined): string {
		const result = getPastTenseMessage(toolName, getToolDisplayName(toolName), parameters, true);
		return typeof result === 'string' ? result : result.markdown;
	}

	test('agent-coordination tools use a single message for both invocation and completion', () => {
		assert.strictEqual(invocation('read_agent', { agent_id: 'math-helper' }), 'Read agent `math-helper`');
		assert.strictEqual(pastTense('read_agent', { agent_id: 'math-helper' }), 'Read agent `math-helper`');
		assert.strictEqual(invocation('write_agent', { agent_id: 'math-helper', message: 'hi' }), 'Write to agent `math-helper`');
		assert.strictEqual(pastTense('write_agent', { agent_id: 'math-helper', message: 'hi' }), 'Write to agent `math-helper`');
	});

	test('agent tools fall back to a generic phrase without an agent id', () => {
		assert.strictEqual(invocation('read_agent', {}), 'Read agent');
		assert.strictEqual(pastTense('write_agent', undefined), 'Write to agent');
	});

	test('agent tools ignore a malformed (non-string) agent id instead of throwing', () => {
		// agent_id comes from untrusted JSON, so a non-string must not reach the
		// markdown inline-code formatter (which would throw).
		assert.strictEqual(invocation('read_agent', { agent_id: 123 }), 'Read agent');
		assert.strictEqual(pastTense('write_agent', { agent_id: '' }), 'Write to agent');
	});

	test('list_agents shares one message; task keeps distinct present/past phrases', () => {
		// list_agents is a fast agent-coordination tool: one message.
		assert.strictEqual(invocation('list_agents', {}), 'List agents');
		assert.strictEqual(pastTense('list_agents', {}), 'List agents');
		// task delegates to a (possibly slow) subagent, so it keeps a present-tense invocation.
		assert.strictEqual(invocation('task', {}), 'Delegating task');
		assert.strictEqual(pastTense('task', {}), 'Delegated task');
	});

	test('unhandled tools fall back to just the display name', () => {
		// Known tool with no tailored message: uses its friendly display name.
		assert.strictEqual(invocation('store_memory', {}), 'Store Memory');
		assert.strictEqual(pastTense('store_memory', {}), 'Store Memory');
		// Unknown tool: display name is the raw tool name.
		assert.strictEqual(invocation('some_new_tool', {}), 'some_new_tool');
		assert.strictEqual(pastTense('some_new_tool', {}), 'some_new_tool');
	});
});

suite('copilotToolDisplay — streaming edit messages', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	function streaming(toolName: string, parameters: unknown, resolvePath?: (path: string) => string): string {
		const result = getStreamingInvocationMessage(toolName, getToolDisplayName(toolName), parameters, resolvePath);
		return typeof result === 'string' ? result : result.markdown;
	}

	function invocation(toolName: string, parameters: Record<string, unknown>): string {
		const result = getInvocationMessage(toolName, getToolDisplayName(toolName), parameters);
		return typeof result === 'string' ? result : result.markdown;
	}

	function completed(toolName: string, parameters: Record<string, unknown>): string {
		const result = getPastTenseMessage(toolName, getToolDisplayName(toolName), parameters, true);
		return typeof result === 'string' ? result : result.markdown;
	}

	test('streams replacement line counts and the target file', () => {
		assert.deepStrictEqual([
			streaming('edit', { path: '/repo/file.ts' }),
			streaming('edit', { path: '/repo/file.ts', old_str: 'one\ntwo' }),
			streaming('edit', { path: '/repo/file.ts', old_str: 'one\ntwo', new_str: 'one\nupdated\nthree' }),
		], [
			'Editing [file.ts](file:///repo/file.ts)',
			'Replacing 2 lines in [file.ts](file:///repo/file.ts)',
			'Replacing 2 lines with 3 lines in [file.ts](file:///repo/file.ts)',
		]);
	});

	test('streams create and insert line counts', () => {
		assert.deepStrictEqual([
			streaming('create', { path: '/repo/new.ts', file_text: 'one\r\ntwo\r\nthree' }),
			streaming('insert', { path: '/repo/file.ts', new_str: 'one\rtwo' }),
		], [
			'Creating [new.ts](file:///repo/new.ts) (3 lines)',
			'Inserting 2 lines in [file.ts](file:///repo/file.ts)',
		]);
	});

	test('uses the str_replace_editor command shape', () => {
		assert.deepStrictEqual([
			streaming('str_replace_editor', { command: 'create', path: '/repo/new.ts', file_text: 'one\ntwo' }),
			streaming('str_replace_editor', { command: 'str_replace', path: '/repo/file.ts', old_str: 'old', new_str: 'new\nvalue' }),
			streaming('str_replace_editor', { command: 'view', path: '/repo/file.ts' }),
		], [
			'Creating [new.ts](file:///repo/new.ts) (2 lines)',
			'Replacing 1 line with 2 lines in [file.ts](file:///repo/file.ts)',
			'Read [file.ts](file:///repo/file.ts)',
		]);
	});

	test('preserves file context after streaming aliases become ready and complete', () => {
		const cases: Array<[toolName: string, parameters: Record<string, unknown>, ready: string, complete: string]> = [
			['str_replace', { path: '/repo/file.ts' }, 'Edit [file.ts](file:///repo/file.ts)', 'Edit [file.ts](file:///repo/file.ts)'],
			['insert', { path: '/repo/file.ts' }, 'Insert text in [file.ts](file:///repo/file.ts)', 'Insert text in [file.ts](file:///repo/file.ts)'],
			['str_replace_editor', { command: 'create', path: '/repo/new.ts' }, 'Create [new.ts](file:///repo/new.ts)', 'Create [new.ts](file:///repo/new.ts)'],
			['str_replace_editor', { command: 'str_replace', path: '/repo/file.ts' }, 'Edit [file.ts](file:///repo/file.ts)', 'Edit [file.ts](file:///repo/file.ts)'],
		];
		assert.deepStrictEqual(cases.map(([toolName, parameters]) => ({
			ready: invocation(toolName, parameters),
			complete: completed(toolName, parameters),
		})), cases.map(([, , ready, complete]) => ({ ready, complete })));
	});

	test('streams raw patch line counts and resolves discovered file paths', () => {
		const patch = [
			'*** Begin Patch',
			'*** Update File: src/file.ts',
			'@@',
			'-old',
			'+new',
			'*** End Patch',
		].join('\n');
		assert.strictEqual(
			streaming('apply_patch', patch, path => `/workspace/${path}`),
			'Generating patch (6 lines) in [file.ts](file:///workspace/src/file.ts)',
		);
	});

	test('ignores malformed partial paths', () => {
		assert.strictEqual(
			streaming('edit', { path: 42, old_str: 'one' }),
			'Replacing 1 line',
		);
	});

	test('falls back to the normal invocation formatter for non-edit tools', () => {
		assert.strictEqual(
			streaming('bash', { command: 'npm test' }),
			'Running `npm test`',
		);
	});
});

// ---- write_/read_ shell tool display ---------------------------------------
//
// Coverage for the secondary shell helpers (write_bash, read_bash, and their
// powershell siblings). These never appear in a permission dialog (they're
// registered with `skipPermission: true` — see copilotShellTools.ts), but they
// still flow through the tool-execution display pipeline.

suite('copilotToolDisplay — write_/read_ shell tools', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	suite('getToolKind', () => {

		test('returns terminal for bash', () => {
			assert.strictEqual(getToolKind('bash'), 'terminal');
		});

		test('returns terminal for powershell', () => {
			assert.strictEqual(getToolKind('powershell'), 'terminal');
		});

		test('returns undefined for write_bash (sending input to a running program, not launching a terminal)', () => {
			assert.strictEqual(getToolKind('write_bash'), undefined);
		});

		test('returns undefined for write_powershell', () => {
			assert.strictEqual(getToolKind('write_powershell'), undefined);
		});

		test('returns undefined for read_bash (reading output, not launching a terminal)', () => {
			assert.strictEqual(getToolKind('read_bash'), undefined);
		});

		test('returns undefined for read_powershell', () => {
			assert.strictEqual(getToolKind('read_powershell'), undefined);
		});

		test('returns subagent for task', () => {
			assert.strictEqual(getToolKind('task'), 'subagent');
		});

		test('returns read for file reads', () => {
			assert.deepStrictEqual([
				getToolKind('view'),
				getToolKind('str_replace_editor', { command: 'view' }),
				getToolKind('str_replace_editor', { command: 'str_replace' }),
			], [
				'read',
				'read',
				undefined,
			]);
		});

		test('returns search for glob', () => {
			assert.strictEqual(getToolKind('glob'), 'search');
		});
	});

	suite('getShellLanguage', () => {

		test('bash returns shellscript', () => {
			assert.strictEqual(getShellLanguage('bash'), 'shellscript');
		});

		test('powershell returns powershell', () => {
			assert.strictEqual(getShellLanguage('powershell'), 'powershell');
		});

		test('write_bash returns shellscript', () => {
			assert.strictEqual(getShellLanguage('write_bash'), 'shellscript');
		});

		test('write_powershell returns powershell', () => {
			assert.strictEqual(getShellLanguage('write_powershell'), 'powershell');
		});

		test('read_bash returns shellscript', () => {
			assert.strictEqual(getShellLanguage('read_bash'), 'shellscript');
		});

		test('read_powershell returns powershell', () => {
			assert.strictEqual(getShellLanguage('read_powershell'), 'powershell');
		});
	});

	suite('getInvocationMessage', () => {

		function getText(msg: ReturnType<typeof getInvocationMessage>): string {
			return typeof msg === 'string' ? msg : msg.markdown;
		}

		test('write_bash with command includes the command text', () => {
			const msg = getInvocationMessage('write_bash', 'Write Shell Input', { command: 'echo hello' });
			assert.ok(getText(msg).includes('echo hello'), `expected 'echo hello' in: ${getText(msg)}`);
		});

		test('write_bash without command returns a non-empty fallback message', () => {
			const msg = getInvocationMessage('write_bash', 'Write Shell Input', undefined);
			assert.ok(getText(msg).length > 0);
			assert.ok(!getText(msg).includes('undefined'));
		});

		test('write_powershell with command includes the command text', () => {
			const msg = getInvocationMessage('write_powershell', 'Write Shell Input', { command: 'Get-Date' });
			assert.ok(getText(msg).includes('Get-Date'), `expected 'Get-Date' in: ${getText(msg)}`);
		});

		test('read_bash returns a non-empty message', () => {
			const msg = getInvocationMessage('read_bash', 'Read Shell Output', undefined);
			assert.strictEqual(getText(msg), 'Reading Terminal');
		});

		test('read_powershell returns a non-empty message', () => {
			const msg = getInvocationMessage('read_powershell', 'Read Shell Output', undefined);
			assert.strictEqual(getText(msg), 'Reading Terminal');
		});

		test('write_bash message differs from bash message (distinct wording)', () => {
			const writeBashMsg = getText(getInvocationMessage('write_bash', 'Write Shell Input', { command: 'echo hi' }));
			const bashMsg = getText(getInvocationMessage('bash', 'Bash', { command: 'echo hi' }));
			// Both include the command, but the surrounding text should differ
			assert.notStrictEqual(writeBashMsg, bashMsg);
		});
	});

	suite('getPastTenseMessage', () => {

		function getText(msg: ReturnType<typeof getPastTenseMessage>): string {
			return typeof msg === 'string' ? msg : msg.markdown;
		}

		test('write_bash with command includes the command text', () => {
			const msg = getPastTenseMessage('write_bash', 'Write Shell Input', { command: 'echo hello' }, true);
			assert.ok(getText(msg).includes('echo hello'), `expected 'echo hello' in: ${getText(msg)}`);
		});

		test('write_bash without command returns a non-empty fallback message', () => {
			const msg = getPastTenseMessage('write_bash', 'Write Shell Input', undefined, true);
			assert.ok(getText(msg).length > 0);
		});

		test('write_powershell with command includes the command text', () => {
			const msg = getPastTenseMessage('write_powershell', 'Write Shell Input', { command: 'Get-Date' }, true);
			assert.ok(getText(msg).includes('Get-Date'), `expected 'Get-Date' in: ${getText(msg)}`);
		});

		test('read_bash success returns a non-empty message', () => {
			const msg = getPastTenseMessage('read_bash', 'Read Shell Output', undefined, true);
			assert.strictEqual(getText(msg), 'Read Terminal');
		});

		test('write_bash failure returns a non-empty error message', () => {
			const msg = getPastTenseMessage('write_bash', 'Write Shell Input', { command: 'echo hello' }, false);
			assert.ok(getText(msg).length > 0);
		});
	});

	suite('feedback comment tools (delegated to the shared server-tool group)', () => {

		function text(msg: ReturnType<typeof getInvocationMessage> | ReturnType<typeof getPastTenseMessage>): string {
			return typeof msg === 'string' ? msg : msg.markdown;
		}

		// Exhaustive per-tool/count coverage lives in serverToolGroups.test.ts.
		// These smoke checks only assert that the Copilot display functions
		// delegate to the shared group instead of falling through to the
		// generic `Using/Used "<tool>"` fallback.
		test('Copilot display delegates to the shared group', () => {
			const listResult = JSON.stringify({ comments: [{ id: 'a' }, { id: 'b' }] });
			assert.deepStrictEqual({
				displayName: getToolDisplayName('listComments'),
				invoke: text(getInvocationMessage('listComments', 'List Comments', undefined)),
				past: text(getPastTenseMessage('listComments', 'List Comments', undefined, true, listResult)),
			}, {
				displayName: 'List Comments',
				invoke: 'List comments',
				past: 'List comments',
			});
		});

		test('failed feedback tool still uses the generic failure message', () => {
			assert.strictEqual(text(getPastTenseMessage('listComments', 'List Comments', undefined, false)), '"List Comments" failed');
		});
	});

	suite('getToolInputString', () => {

		test('write_bash extracts command field', () => {
			assert.strictEqual(getToolInputString('write_bash', { command: 'echo hello' }, undefined), 'echo hello');
		});

		test('write_powershell extracts command field', () => {
			assert.strictEqual(getToolInputString('write_powershell', { command: 'Get-Date' }, undefined), 'Get-Date');
		});

		test('write_bash falls back to rawArguments when no command field', () => {
			assert.strictEqual(getToolInputString('write_bash', {}, '{"command":"echo hello"}'), '{"command":"echo hello"}');
		});

		test('write_bash returns undefined when both parameters and rawArguments are absent', () => {
			assert.strictEqual(getToolInputString('write_bash', undefined, undefined), undefined);
		});

		test('read_bash with no parameters returns undefined', () => {
			assert.strictEqual(getToolInputString('read_bash', undefined, undefined), undefined);
		});
	});
});

suite('skill events', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('hides the raw `skill` tool call and synthesizes a tool-start/complete pair from `skill.invoked`', () => {
		const withPath = synthesizeSkillToolCall(
			{ name: 'plan', path: '/abs/repo/skills/plan/SKILL.md', content: '' },
			'evt-123',
		);
		const withoutEventId = synthesizeSkillToolCall(
			{ name: 'plan', path: '/abs/repo/skills/plan/SKILL.md', content: '' },
			undefined,
		);

		assert.deepStrictEqual({
			skillIsHidden: isHiddenTool('skill'),
			withPathToolCallId: withPath.toolCallId,
			withPathToolName: withPath.toolName,
			withPathDisplayName: withPath.displayName,
			withPathInvocation: withPath.invocationMessage,
			withPathPastTense: withPath.pastTenseMessage,
			withoutEventIdToolCallId: withoutEventId.toolCallId,
			withoutEventIdInvocation: withoutEventId.invocationMessage,
			withoutEventIdPastTense: withoutEventId.pastTenseMessage,
		}, {
			skillIsHidden: true,
			withPathToolCallId: 'synth-skill-evt-123',
			withPathToolName: 'skill',
			withPathDisplayName: 'Read Skill',
			withPathInvocation: { markdown: 'Read skill [plan](file:///abs/repo/skills/plan/SKILL.md)' },
			withPathPastTense: { markdown: 'Read skill [plan](file:///abs/repo/skills/plan/SKILL.md)' },
			withoutEventIdToolCallId: 'synth-skill--15753539',
			withoutEventIdInvocation: { markdown: 'Read skill [plan](file:///abs/repo/skills/plan/SKILL.md)' },
			withoutEventIdPastTense: { markdown: 'Read skill [plan](file:///abs/repo/skills/plan/SKILL.md)' },
		});
	});
});

suite('rg / grep search tool display', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	function text(msg: ReturnType<typeof getInvocationMessage>): string {
		return typeof msg === 'string' ? msg : msg.markdown;
	}

	test('rg uses one stable search message', () => {
		const inv = text(getInvocationMessage('rg', 'Search', { pattern: 'foo' }));
		const past = text(getPastTenseMessage('rg', 'Search', { pattern: 'foo' }, true));
		assert.deepStrictEqual({ inv, past }, {
			inv: 'Search for `foo`',
			past: 'Search for `foo`',
		});
	});

	test('rg without a pattern falls back to a generic search message (not the raw tool name)', () => {
		const inv = text(getInvocationMessage('rg', 'Search', undefined));
		assert.strictEqual(inv, 'Search files');
	});

	test('grep uses one stable search message', () => {
		const inv = text(getInvocationMessage('grep', 'Search', { pattern: 'bar' }));
		const past = text(getPastTenseMessage('grep', 'Search', { pattern: 'bar' }, true));
		assert.deepStrictEqual({ inv, past }, {
			inv: 'Search for `bar`',
			past: 'Search for `bar`',
		});
	});

	test('getToolInputString returns pattern for both grep and rg', () => {
		assert.strictEqual(getToolInputString('grep', { pattern: 'abc' }, undefined), 'abc');
		assert.strictEqual(getToolInputString('rg', { pattern: 'abc' }, undefined), 'abc');
	});
});

suite('web_fetch tool display', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	function text(msg: ReturnType<typeof getInvocationMessage> | ReturnType<typeof getPastTenseMessage>): string {
		return typeof msg === 'string' ? msg : msg.markdown;
	}

	test('uses the fetched URL for invocation and completion messages', () => {
		const parameters = { url: 'https://example.com/docs' };
		assert.deepStrictEqual({
			invocation: text(getInvocationMessage('web_fetch', 'Fetch Web Content', parameters)),
			pastTense: text(getPastTenseMessage('web_fetch', 'Fetch Web Content', parameters, true)),
			input: getToolInputString('web_fetch', parameters, undefined),
		}, {
			invocation: 'Fetching [https://example.com/docs](https://example.com/docs)',
			pastTense: 'Fetched [https://example.com/docs](https://example.com/docs)',
			input: 'https://example.com/docs',
		});
	});

	test('falls back to generic URL wording when the URL is absent', () => {
		assert.deepStrictEqual({
			invocation: text(getInvocationMessage('web_fetch', 'Fetch Web Content', undefined)),
			pastTense: text(getPastTenseMessage('web_fetch', 'Fetch Web Content', undefined, true)),
			failure: text(getPastTenseMessage('web_fetch', 'Fetch Web Content', { url: 'https://example.com/docs' }, false)),
		}, {
			invocation: 'Fetching URL',
			pastTense: 'Fetched URL',
			failure: '"Fetch Web Content" failed',
		});
	});
});

suite('search tool display', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	function text(msg: ReturnType<typeof getInvocationMessage> | ReturnType<typeof getPastTenseMessage>): string {
		return typeof msg === 'string' ? msg : msg.markdown;
	}

	test('web search has progress wording while code search stays stable', () => {
		assert.deepStrictEqual({
			webInvocation: text(getInvocationMessage('web_search', 'Web Search', { query: 'VS Code tests' })),
			webComplete: text(getPastTenseMessage('web_search', 'Web Search', { query: 'VS Code tests' }, true)),
			codeInvocation: text(getInvocationMessage('search_code_subagent', 'Search Code', { query: 'tool display mapping' })),
			codeComplete: text(getPastTenseMessage('search_code_subagent', 'Search Code', { query: 'tool display mapping' }, true)),
		}, {
			webInvocation: 'Searching the web for `VS Code tests`',
			webComplete: 'Searched the web for `VS Code tests`',
			codeInvocation: 'Search code for `tool display mapping`',
			codeComplete: 'Search code for `tool display mapping`',
		});
	});
});

suite('sql tool display', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	function text(msg: ReturnType<typeof getInvocationMessage> | ReturnType<typeof getPastTenseMessage>): string {
		return typeof msg === 'string' ? msg : msg.markdown;
	}

	test('uses the SQL description for invocation and completion messages', () => {
		const parameters = { description: 'Insert agent host study todos', query: 'INSERT INTO todos (title) VALUES (\'Read terminal activation docs\')' };
		assert.strictEqual(text(getInvocationMessage('sql', 'Execute SQL', parameters)), 'Insert agent host study todos');
		assert.strictEqual(text(getPastTenseMessage('sql', 'Execute SQL', parameters, true)), 'Insert agent host study todos');
	});

	test('falls back to generic SQL wording when description is absent', () => {
		assert.strictEqual(text(getInvocationMessage('sql', 'Execute SQL', { query: 'SELECT 1' })), 'Execute SQL query');
		assert.strictEqual(text(getPastTenseMessage('sql', 'Execute SQL', { query: 'SELECT 1' }, true)), 'Execute SQL query');
	});
});

suite('apply_patch tool display', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	function text(msg: ReturnType<typeof getInvocationMessage>): string {
		return typeof msg === 'string' ? msg : msg.markdown;
	}

	const singleFilePatch = [
		'*** Begin Patch',
		'*** Update File: /repo/src/foo.ts',
		'@@',
		'-old',
		'+new',
		'*** End Patch',
	].join('\n');

	const multiFilePatch = [
		'*** Begin Patch',
		'*** Update File: /repo/src/foo.ts',
		'@@',
		'-old',
		'+new',
		'*** Add File: /repo/src/bar.ts',
		'+hello',
		'*** Delete File: /repo/src/baz.ts',
		'*** End Patch',
	].join('\n');

	test('renders a clickable file link for a single-file patch', () => {
		const inv = text(getInvocationMessage('apply_patch', 'Patch', { input: singleFilePatch }));
		const past = text(getPastTenseMessage('apply_patch', 'Patch', { input: singleFilePatch }, true));
		assert.deepStrictEqual({ inv, past }, {
			inv: 'Edit [foo.ts](file:///repo/src/foo.ts)',
			past: 'Edit [foo.ts](file:///repo/src/foo.ts)',
		});
	});

	test('lists every affected file for a multi-file patch', () => {
		const inv = text(getInvocationMessage('apply_patch', 'Patch', { input: multiFilePatch }));
		const past = text(getPastTenseMessage('apply_patch', 'Patch', { input: multiFilePatch }, true));
		assert.deepStrictEqual({ inv, past }, {
			inv: 'Edit [foo.ts](file:///repo/src/foo.ts), [bar.ts](file:///repo/src/bar.ts), [baz.ts](file:///repo/src/baz.ts)',
			past: 'Edit [foo.ts](file:///repo/src/foo.ts), [bar.ts](file:///repo/src/bar.ts), [baz.ts](file:///repo/src/baz.ts)',
		});
	});

	test('falls back to a generic message when the patch body is missing or unparseable', () => {
		assert.strictEqual(getInvocationMessage('apply_patch', 'Patch', undefined), 'Edit files');
		assert.strictEqual(getInvocationMessage('apply_patch', 'Patch', { input: 'not a patch' }), 'Edit files');
		assert.strictEqual(getPastTenseMessage('apply_patch', 'Patch', undefined, true), 'Edit files');
	});

	test('also accepts the patch text under the `patch` parameter (CLI shape)', () => {
		const inv = text(getInvocationMessage('apply_patch', 'Patch', { patch: singleFilePatch }));
		assert.strictEqual(inv, 'Edit [foo.ts](file:///repo/src/foo.ts)');
	});

	test('git_apply_patch shares the same display path', () => {
		const inv = text(getInvocationMessage('git_apply_patch', 'Patch', { input: singleFilePatch }));
		const past = text(getPastTenseMessage('git_apply_patch', 'Patch', { input: singleFilePatch }, true));
		assert.deepStrictEqual({ inv, past }, {
			inv: 'Edit [foo.ts](file:///repo/src/foo.ts)',
			past: 'Edit [foo.ts](file:///repo/src/foo.ts)',
		});
	});

	test('failure still routes through the generic failed message', () => {
		assert.strictEqual(getPastTenseMessage('apply_patch', 'Patch', { input: singleFilePatch }, false), '"Patch" failed');
	});

	test('getEditFilePath returns the first affected file from a patch body', () => {
		assert.strictEqual(getEditFilePath({ input: singleFilePatch }), '/repo/src/foo.ts');
		assert.strictEqual(getEditFilePath({ input: multiFilePatch }), '/repo/src/foo.ts');
		assert.strictEqual(getEditFilePath({ patch: singleFilePatch }), '/repo/src/foo.ts');
		assert.strictEqual(getEditFilePath(JSON.stringify({ input: singleFilePatch })), '/repo/src/foo.ts');
		assert.strictEqual(getEditFilePath({ input: 'not a patch' }), undefined);
	});

	test('getEditFilePaths returns every affected file from a patch body', () => {
		assert.deepStrictEqual(getEditFilePaths({ input: singleFilePatch }), ['/repo/src/foo.ts']);
		assert.deepStrictEqual(getEditFilePaths({ input: multiFilePatch }), ['/repo/src/foo.ts', '/repo/src/bar.ts', '/repo/src/baz.ts']);
		assert.deepStrictEqual(getEditFilePaths({ patch: multiFilePatch }), ['/repo/src/foo.ts', '/repo/src/bar.ts', '/repo/src/baz.ts']);
		assert.deepStrictEqual(getEditFilePaths(JSON.stringify({ input: multiFilePatch })), ['/repo/src/foo.ts', '/repo/src/bar.ts', '/repo/src/baz.ts']);
		assert.deepStrictEqual(getEditFilePaths({ path: '/repo/src/edit.ts' }), ['/repo/src/edit.ts']);
		assert.deepStrictEqual(getEditFilePaths({ input: 'not a patch' }), []);
		assert.deepStrictEqual(getEditFilePaths(undefined), []);
		// SDK custom-tool format: arguments arrive as a raw V4A patch string,
		// not as a JSON object — exercise the string fallback path.
		assert.deepStrictEqual(getEditFilePaths(multiFilePatch), ['/repo/src/foo.ts', '/repo/src/bar.ts', '/repo/src/baz.ts']);
		assert.deepStrictEqual(getEditFilePaths(singleFilePatch), ['/repo/src/foo.ts']);
	});
});

suite('getShellIntention', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('reads the description argument of shell tools, and ignores non-shell tools', () => {
		assert.deepStrictEqual({
			bash: getShellIntention('bash', { command: 'ls', description: 'List files' }),
			powershell: getShellIntention('powershell', { command: 'Get-ChildItem', description: 'List files' }),
			shellNoDescription: getShellIntention('bash', { command: 'ls' }),
			shellEmptyDescription: getShellIntention('bash', { command: 'ls', description: '' }),
			// The `task` (subagent) tool also has a `description` argument, but it is
			// the subagent task description, not a shell intention — must be ignored.
			taskTool: getShellIntention('task', { description: 'Explore the codebase' }),
			viewTool: getShellIntention('view', { path: '/repo/file.ts', description: 'why' }),
			noArgs: getShellIntention('bash', undefined),
		}, {
			bash: 'List files',
			powershell: 'List files',
			shellNoDescription: undefined,
			shellEmptyDescription: undefined,
			taskTool: undefined,
			viewTool: undefined,
			noArgs: undefined,
		});
	});
});
