/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { RUNTIME_TOOL_SEARCH_TOOL_NAME } from '../../common/toolSearchConstants.js';

/**
 * Runtime built-in tools the Agent Host lets the Copilot SDK register. Every
 * tool the runtime registers is sent to the model on every request unless the
 * runtime defers it, so a built-in that an SDK bump introduces stays off until
 * a change adds it here on purpose. `excludedTools` in `CopilotSessionLauncher`
 * still wins for the entries it disables conditionally. A `builtin:` pattern
 * only matches tools the runtime registered as built-in, so names that a
 * runtime version does not ship are inert.
 */
export const COPILOT_ENABLED_BUILTIN_TOOL_NAMES: readonly string[] = [
	// Shell
	'bash', 'read_bash', 'write_bash', 'stop_bash', 'bash_shutdown', 'list_bash', 'local_shell',
	'powershell', 'read_powershell', 'write_powershell', 'stop_powershell', 'powershell_shutdown', 'list_powershell',
	// Files and search
	'view', 'read', 'read_file', 'show_file', 'create', 'write', 'write_file', 'edit', 'str_replace_editor', 'str_replace', 'insert',
	'apply_patch', 'git_apply_patch', 'grep', 'rg', 'glob', 'lsp', 'search_code_subagent', 'semantic_code_search',
	// Web and GitHub
	'web_search', 'web_fetch', 'fetch_copilot_cli_documentation', 'create_pull_request', 'create_issue', 'code_review',
	'reply_to_comment', 'annotate_diff_line', 'get_pr_overview', 'get_changes_overview', 'gh-advisory-database', 'codeql_checker',
	// Turn control and planning
	'ask_user', 'report_intent', 'think', 'report_progress', 'update_todo', 'todowrite', 'propose_work', 'task_complete',
	'exit_plan_mode', 'parallel_validation', 'image_generation',
	// Agents, skills and tool discovery
	'task', 'execution_subagent', 'list_agents', 'read_agent', 'write_agent', 'skill', RUNTIME_TOOL_SEARCH_TOOL_NAME, 'tool_search_tool_regex',
	// Stores
	'sql', 'session_store_sql', 'store_memory',
	// MCP maintenance
	'mcp_reload', 'mcp_validate',
	// Runtime session management (the host registers its own session tools; these keep parity with runtimes that ship them)
	'create_session', 'create_workspace', 'get_session', 'get_workspace', 'rename_session', 'rename_workspace', 'rename_branch',
	'list_sessions_and_chats', 'list_workspaces_and_chats', 'send_session_message', 'send_workspace_message', 'send_chat_message',
	'open_pr_session', 'open_pr_workspace', 'open_issue_session', 'open_issue_workspace',
	// Canvases and extensions
	'list_canvas_capabilities', 'open_canvas', 'invoke_canvas_action', 'send_canvas_command',
	// Workflows and scheduling
	'save_workflow', 'save_priority', 'save_scheduled_task', 'run_dynamic_workflow', 'run_factory', 'dynamic_workflows_manage', 'factories_manage',
];

/**
 * The default `availableTools` filter: the enabled built-ins plus every host,
 * client, extension and MCP tool. A per-model `availableTools` capability
 * override replaces this list.
 */
export const COPILOT_DEFAULT_AVAILABLE_TOOLS: readonly string[] = [
	...COPILOT_ENABLED_BUILTIN_TOOL_NAMES.map(name => `builtin:${name}`),
	'custom:*',
	'mcp:*',
];
