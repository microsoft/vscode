/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { readToolCallPresentation } from '../../common/meta/agentToolCallMeta.js';
import { ToolCallContributorKind, ToolCallStatus, ToolCallConfirmationReason, type ToolCallCompletedState, type ToolCallPendingConfirmationState, type StringOrMarkdown } from '../../common/state/protocol/state.js';

function call(toolName: string, overrides?: Partial<ToolCallCompletedState>): ToolCallCompletedState {
	return {
		status: ToolCallStatus.Completed, toolCallId: 'tool', toolName, displayName: toolName,
		invocationMessage: `Running ${toolName}`, pastTenseMessage: 'Tool finished', confirmed: ToolCallConfirmationReason.NotNeeded,
		success: true, ...overrides,
	};
}

function text(value: StringOrMarkdown | undefined): string | undefined {
	return typeof value === 'string' ? value : value?.markdown;
}

suite('Copilot app tool presentation compatibility', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	const groups = [
		{ names: ['search', 'rg', 'grep', 'glob'], kind: 'search', completed: 'Searched' },
		{ names: ['view', 'read', 'read_file'], kind: 'read', completed: 'Read' },
		{ names: ['bash', 'powershell', 'local_shell'], kind: undefined, completed: 'Ran command' },
		{ names: ['edit', 'str_replace_editor', 'str_replace', 'insert'], kind: undefined, completed: 'Edited' },
		{ names: ['create', 'write', 'write_file'], kind: undefined, completed: 'Created file' },
		{ names: ['apply_patch'], kind: undefined, completed: 'Applied patch' },
		{ names: ['read_bash', 'read_powershell'], kind: undefined, completed: 'Read shell output' },
		{ names: ['write_bash', 'write_powershell'], kind: undefined, completed: 'Sent input to shell' },
		{ names: ['stop_bash', 'stop_powershell', 'bash_shutdown', 'powershell_shutdown'], kind: undefined, completed: 'Stopped shell' },
		{ names: ['list_bash', 'list_powershell'], kind: undefined, completed: 'Listed shell sessions' },
		{ names: ['task'], kind: undefined, completed: 'Delegated task' },
		{ names: ['read_agent'], kind: undefined, completed: 'Read agent activity' },
		{ names: ['write_agent'], kind: undefined, completed: 'Sent message to agent' },
		{ names: ['task_complete'], kind: undefined, completed: 'Task complete' },
		{ names: ['ask_user'], kind: undefined, completed: 'Asked a question' },
		{ names: ['exit_plan_mode'], kind: undefined, completed: 'Finished plan' },
		{ names: ['respond_to_session_plan'], kind: undefined, completed: 'Responded to plan' },
		{ names: ['skill'], kind: undefined, completed: 'Read skill' },
		{ names: ['show_file'], kind: undefined, completed: 'Showed file' },
		{ names: ['web_search'], kind: undefined, completed: 'Searched the web' },
		{ names: ['web_fetch'], kind: undefined, completed: 'Fetched webpage' },
		{ names: ['sql', 'session_store_sql'], kind: undefined, completed: 'Ran SQL' },
		{ names: ['tool_search_tool_regex'], kind: undefined, completed: 'Searched tools' },
		{ names: ['update_todo', 'todowrite'], kind: undefined, completed: 'Updated todo list' },
		{ names: ['update_profile'], kind: undefined, completed: 'Updated profile' },
		{ names: ['store_memory'], kind: undefined, completed: 'Saved memory' },
		{ names: ['create_pull_request'], kind: undefined, completed: 'Created pull request' },
		{ names: ['create_issue'], kind: undefined, completed: 'Created issue' },
		{ names: ['create_session', 'create_workspace'], kind: undefined, completed: 'Created session' },
		{ names: ['get_changes_overview', 'get_pr_overview'], kind: undefined, completed: 'Reviewed changes' },
		{ names: ['send_session_message', 'send_workspace_message', 'send_chat_message'], kind: undefined, completed: 'Sent session message' },
		{ names: ['annotate_diff_line', 'reply_to_comment'], kind: undefined, completed: 'Added review comment' },
		{ names: ['add_pr_review_comment'], kind: undefined, completed: 'Added PR review comment' },
		{ names: ['edit_pr_review_comment'], kind: undefined, completed: 'Edited PR review comment' },
		{ names: ['remove_pr_review_comment'], kind: undefined, completed: 'Removed PR review comment' },
		{ names: ['reply_and_resolve_review_thread'], kind: undefined, completed: 'Replied and resolved review thread' },
		{ names: ['navigate_to'], kind: undefined, completed: 'Navigated' },
		{ names: ['navigate_to_github_item'], kind: undefined, completed: 'Opened GitHub item' },
		{ names: ['open_pr_session', 'open_pr_workspace'], kind: undefined, completed: 'Opened PR session' },
		{ names: ['open_issue_session', 'open_issue_workspace'], kind: undefined, completed: 'Opened issue session' },
		{ names: ['list_agents'], kind: undefined, completed: 'Listed agents' },
		{ names: ['list_sessions_and_chats', 'list_workspaces_and_chats'], kind: undefined, completed: 'Listed sessions' },
		{ names: ['list_items'], kind: undefined, completed: 'Listed items' },
		{ names: ['list_projects'], kind: undefined, completed: 'Listed projects' },
		{ names: ['get_session', 'get_workspace'], kind: undefined, completed: 'Looked up session' },
		{ names: ['get_sessions_status'], kind: undefined, completed: 'Checked session status' },
		{ names: ['get_main_session_transcript'], kind: undefined, completed: 'Read session transcript' },
		{ names: ['rename_session', 'rename_workspace'], kind: undefined, completed: 'Renamed session' },
		{ names: ['rename_branch'], kind: undefined, completed: 'Renamed branch' },
		{ names: ['delete_item'], kind: undefined, completed: 'Deleted item' },
		{ names: ['archive_session'], kind: undefined, completed: 'Archived session' },
		{ names: ['suggest_items'], kind: undefined, completed: 'Suggested items' },
		{ names: ['get_session_automation'], kind: undefined, completed: 'Looked up schedule' },
		{ names: ['save_session_automation'], kind: undefined, completed: 'Saved schedule' },
		{ names: ['list_workflows'], kind: undefined, completed: 'Listed automations' },
		{ names: ['save_workflow'], kind: undefined, completed: 'Saved automation' },
		{ names: ['run_workflow'], kind: undefined, completed: 'Ran automation' },
		{ names: ['run_factory', 'run_dynamic_workflow'], kind: undefined, completed: 'Ran workflow' },
		{ names: ['factories_manage', 'dynamic_workflows_manage'], kind: undefined, completed: 'Managed workflows' },
		{ names: ['open_canvas'], kind: undefined, completed: 'Opened canvas' },
		{ names: ['send_canvas_command'], kind: undefined, completed: 'Sent canvas command' },
		{ names: ['clear_widget'], kind: undefined, completed: 'Cleared widget' },
		{ names: ['discover_widgets'], kind: undefined, completed: 'Discovered widgets' },
		{ names: ['render_widget'], kind: undefined, completed: 'Rendered widget' },
		{ names: ['render_widget_inbox'], kind: undefined, completed: 'Rendered inbox' },
		{ names: ['list_priorities'], kind: undefined, completed: 'Reviewed priorities' },
		{ names: ['get_priority'], kind: undefined, completed: 'Read priority' },
		{ names: ['save_priority'], kind: undefined, completed: 'Updated priority' },
		{ names: ['reorder_priorities'], kind: undefined, completed: 'Reordered priorities' },
		{ names: ['archive_priority'], kind: undefined, completed: 'Removed priority' },
		{ names: ['list_scheduled_tasks'], kind: undefined, completed: 'Reviewed scheduled tasks' },
		{ names: ['get_scheduled_task'], kind: undefined, completed: 'Read scheduled task' },
		{ names: ['save_scheduled_task'], kind: undefined, completed: 'Updated scheduled task' },
		{ names: ['delete_scheduled_task'], kind: undefined, completed: 'Deleted scheduled task' },
		{ names: ['run_scheduled_task'], kind: undefined, completed: 'Started scheduled task' },
	];
	for (const { names, kind, completed } of groups) {
		test(`recognizes ${names.join(', ')}`, () => {
			assert.deepStrictEqual(names.map(name => {
				const presentation = readToolCallPresentation(call(name));
				return { kind: presentation.toolKind, completed: text(presentation.pastTenseMessage) };
			}), names.map(() => ({ kind, completed })));
		});
	}

	test('partial and completed arguments supply escaped and bounded labels without changing protocol input', () => {
		const input = JSON.stringify({ pattern: '`[unsafe](command:run)`' });
		const completed = call('grep', { toolInput: input });
		const streaming = readToolCallPresentation({ toolCallId: 'tool', toolName: 'grep', displayName: 'Grep', status: ToolCallStatus.Streaming, partialInput: '{"pattern":"auth' });
		assert.deepStrictEqual({
			streaming: text(streaming.invocationMessage),
			completed: text(readToolCallPresentation(completed).pastTenseMessage),
			input: completed.toolInput,
			empty: text(readToolCallPresentation(call('grep', { toolInput: '{"pattern":""}' })).pastTenseMessage),
			invalid: text(readToolCallPresentation(call('grep', { toolInput: '{"pattern":42}' })).pastTenseMessage),
			bounded: text(readToolCallPresentation(call('grep', { toolInput: JSON.stringify({ pattern: 'x'.repeat(100) }) })).pastTenseMessage),
		}, {
			streaming: 'Searching `auth`', completed: 'Searched `` `[unsafe](command:run)` ``', input,
			empty: 'Searched', invalid: 'Searched', bounded: `Searched \`${'x'.repeat(80)}...\``,
		});
	});

	test('explicit VS Code metadata, permissions, contributors and MCP Apps never acquire a name fallback', () => {
		const external = [
			call('grep', { _meta: { toolKind: 'read' } }),
			call('grep', { _meta: { toolKind: null } }),
			call('grep', { _meta: { mcpServerName: 'server' } }),
			call('grep', { _meta: { progressMessage: 'Host progress' } }),
			call('grep', { contributor: { kind: ToolCallContributorKind.MCP, customizationId: 'server' } }),
			call('grep', { contributor: { kind: ToolCallContributorKind.Client, clientId: 'client' } }),
			call('grep', { _meta: { ui: { resourceUri: 'ui://app' } } }),
			call('github-mcp-server-grep'),
			call('unknown_tool'),
			call('constructor'),
		];
		assert.deepStrictEqual(external.map(value => readToolCallPresentation(value)), external.map((value, index) => ({
			toolKind: index === 0 ? 'read' : undefined, invocationMessage: value.invocationMessage, pastTenseMessage: value.pastTenseMessage,
		})));
	});

	test('specific host messages stay authoritative while generic labels use the known tool identity', () => {
		const custom = call('grep', { invocationMessage: { markdown: 'Search **auth**' }, pastTenseMessage: 'Found 7 matches' });
		assert.deepStrictEqual({
			custom: readToolCallPresentation(custom),
			unknown: readToolCallPresentation(call('future_search')),
			failed: readToolCallPresentation(call('grep', { success: false })),
			readCommand: readToolCallPresentation(call('str_replace_editor', { toolInput: '{"command":"view","path":"/file.ts"}' })).toolKind,
			shellInteraction: readToolCallPresentation(call('write_bash')).toolKind,
		}, {
			custom: { toolKind: undefined, invocationMessage: custom.invocationMessage, pastTenseMessage: custom.pastTenseMessage },
			unknown: { toolKind: undefined, invocationMessage: 'Running future_search', pastTenseMessage: 'Tool finished' },
			failed: { toolKind: 'search', invocationMessage: 'Search failed', pastTenseMessage: 'Search failed' },
			readCommand: 'read', shellInteraction: undefined,
		});
	});

	test('native GitHub code search requires the expected title and no MCP contributor', () => {
		assert.deepStrictEqual(['lexical_code_search', 'semantic_code_search'].flatMap(name => [
			readToolCallPresentation(call(name)).toolKind,
			readToolCallPresentation(call(name, { displayName: 'GitHub Code Search', toolInput: '{"query":"auth"}' })),
			readToolCallPresentation(call(name, { displayName: 'GitHub Code Search', contributor: { kind: ToolCallContributorKind.MCP, customizationId: 'server' } })).toolKind,
		]), ['lexical_code_search', 'semantic_code_search'].flatMap(() => [
			undefined, { toolKind: 'search', invocationMessage: { markdown: 'Searching `auth`' }, pastTenseMessage: { markdown: 'Searched `auth`' } }, undefined,
		]));
	});

	test('shell presentation requires a real command string, not malformed argument values', () => {
		assert.deepStrictEqual([undefined, null, false, 42, {}, '', 'echo output'].map(command =>
			readToolCallPresentation(call('bash', { toolInput: JSON.stringify({ command }) })).toolKind
		), [undefined, undefined, undefined, undefined, undefined, undefined, 'terminal']);
	});

	test('write permissions name their target without inferring an edit kind or changing protocol state', () => {
		const pending: ToolCallPendingConfirmationState = {
			status: ToolCallStatus.PendingConfirmation, toolCallId: 'write', toolName: 'future_edit', displayName: 'Edit',
			invocationMessage: 'Edit file', confirmationTitle: 'Edit file', toolInput: '/workspace/file.ts',
			_meta: { promptRequest: { kind: 'write', fileName: '/workspace/file.ts' } },
		};
		const message = { markdown: 'Edit [file.ts](file:///workspace/file.ts)' };
		assert.deepStrictEqual({
			pending: readToolCallPresentation(pending),
			specific: readToolCallPresentation({ ...pending, invocationMessage: 'Update configuration', confirmationTitle: 'Update settings?' }),
			invalid: readToolCallPresentation({ ...pending, _meta: { promptRequest: { kind: 'write', fileName: 42 } } }),
			absent: readToolCallPresentation({ ...pending, _meta: undefined }),
			vscode: readToolCallPresentation({ ...pending, _meta: { ...pending._meta, toolKind: 'read' } }),
			mcp: readToolCallPresentation({ ...pending, contributor: { kind: ToolCallContributorKind.MCP, customizationId: 'server' } }),
			running: readToolCallPresentation({ ...pending, status: ToolCallStatus.Running, confirmed: ToolCallConfirmationReason.UserAction }),
			source: { message: pending.invocationMessage, input: pending.toolInput },
		}, {
			pending: { toolKind: undefined, invocationMessage: message, pastTenseMessage: undefined, confirmationTitle: 'Edit file.ts' },
			specific: { toolKind: undefined, invocationMessage: 'Update configuration', pastTenseMessage: undefined },
			invalid: { toolKind: undefined, invocationMessage: 'Edit file', pastTenseMessage: undefined },
			absent: { toolKind: undefined, invocationMessage: 'Edit file', pastTenseMessage: undefined },
			vscode: { toolKind: 'read', invocationMessage: 'Edit file', pastTenseMessage: undefined },
			mcp: { toolKind: undefined, invocationMessage: 'Edit file', pastTenseMessage: undefined },
			running: { toolKind: undefined, invocationMessage: 'Edit file', pastTenseMessage: undefined },
			source: { message: 'Edit file', input: '/workspace/file.ts' },
		});
	});

	test('write permission filenames cannot break out of their file link', () => {
		const pending: ToolCallPendingConfirmationState = {
			status: ToolCallStatus.PendingConfirmation, toolCallId: 'write', toolName: 'edit', displayName: 'Edit',
			invocationMessage: 'Edit file', confirmationTitle: 'Custom confirmation',
			_meta: { permissionRequest: { kind: 'write', fileName: '/workspace/a](command:unsafe).ts' } },
		};
		assert.deepStrictEqual(readToolCallPresentation(pending), {
			toolKind: undefined, invocationMessage: { markdown: 'Edit [a\\](command:unsafe).ts](file:///workspace/a%5D%28command%3Aunsafe%29.ts)' }, pastTenseMessage: 'Edited',
		});
	});
});
