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
 * only matches tools the runtime registered as built-in.
 *
 * List only what the current runtime registers for a host-enabled feature.
 * A speculative name would turn on without review if a later runtime started
 * shipping it. `copilotBuiltinToolAllowlist.integrationTest.ts` fails when this
 * list and the runtime's registered built-ins disagree (see section 9 of
 * `AGENTS.md`).
 *
 * Adding a name here is an adoption decision for the tool budget owners, whom
 * `.github/CODENOTIFY` notifies. When that test reports a new runtime built-in, the
 * default fix is to add it to `KNOWN_LEFT_OFF` in the test, not to adopt it here.
 * A rename of a tool already listed here is the exception: replace the old name
 * with the new one so the capability stays on.
 */
export const COPILOT_ENABLED_BUILTIN_TOOL_NAMES: readonly string[] = [
	// Shell. The runtime registers one family per platform and shell.
	'bash', 'read_bash', 'stop_bash', 'list_bash',
	'powershell', 'read_powershell', 'stop_powershell', 'list_powershell',
	'local_shell',
	// Files and search. Most GPT models get `apply_patch` and `rg` instead of `create`, `edit` and `grep`.
	'view', 'create', 'edit', 'apply_patch', 'grep', 'rg', 'glob', 'web_fetch',
	// Search subagent, kept off by `excludedTools` unless its setting is on.
	'search_code_subagent',
	// Turn control: plan mode and autopilot (`task_complete`, `exit_plan_mode`), elicitation, image generation.
	'ask_user', 'task_complete', 'exit_plan_mode', 'image_generation',
	// Agents, skills and tool search
	'task', 'execution_subagent', 'list_agents', 'read_agent', 'write_agent', 'skill', RUNTIME_TOOL_SEARCH_TOOL_NAME, 'tool_search_tool_regex',
	// Stores and Copilot Memory
	'sql', 'session_store_sql', 'store_memory', 'vote_memory',
	// Canvases
	'list_canvas_capabilities', 'open_canvas', 'invoke_canvas_action',
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
