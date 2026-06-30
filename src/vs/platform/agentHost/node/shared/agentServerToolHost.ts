/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { IAgentServerToolHost } from '../../common/agentServerTools.js';
import { ActionType } from '../../common/state/protocol/common/actions.js';
import type { StringOrMarkdown, ToolDefinition, URI } from '../../common/state/sessionState.js';
import type { AgentHostStateManager } from '../agentHostStateManager.js';

/**
 * Result of a server tool, passed to {@link IServerToolGroup.getDisplay} so the
 * owning group can tailor its past-tense message to what the tool returned
 * (for example a count parsed from the textual result). Absent while the tool
 * is still running.
 */
export interface IServerToolDisplayResult {
	/** The textual tool result (the string the group's `execute` returned). */
	readonly text?: string;
	/** Whether the tool completed successfully. */
	readonly success: boolean;
}

/**
 * Display strings for a server tool, authored by the group that owns the tool
 * so every provider renders it identically (instead of each provider's display
 * layer re-deriving the strings from the tool name). Each field is optional: a
 * provider uses the returned value where present and falls back to its own
 * generic display otherwise.
 */
export interface IServerToolDisplay {
	/** Human-readable tool name (e.g. "List Comments"). */
	readonly displayName?: string;
	/** Present-tense message shown while the tool runs (e.g. "Checking comments"). */
	readonly invocationMessage?: StringOrMarkdown;
	/** Past-tense message shown once the tool completes (e.g. "Checked 3 comments"). */
	readonly pastTenseMessage?: StringOrMarkdown;
}

/**
 * A group of related server tools owned and executed by the agent host. Each
 * group bundles the {@link ToolDefinition}s it advertises with an executor
 * that runs one of its tools by name against the session's state.
 *
 * Groups are the unit of extension and are **contributed from outside** — they
 * are passed to {@link AgentServerToolHost} at construction (startup), so this
 * module stays provider- and feature-agnostic (it knows nothing about
 * feedback, annotations, etc.). The feedback group, for example, lives in
 * `agentFeedbackServerTools.ts` and is wired in by the agent host. Everything
 * downstream — advertising, the Claude in-process MCP server and allow-list,
 * and the Copilot SDK tools and auto-approval — derives from the host's
 * contributed groups, so no provider code changes are needed to add a group.
 */
export interface IServerToolGroup {
	/** Tool definitions this group advertises on the session's `serverTools`. */
	readonly definitions: readonly ToolDefinition[];
	/**
	 * Whether {@link toolName} (one of this group's {@link definitions}) must be
	 * confirmed by the user before it runs. Providers exclude such tools from
	 * their server-tool auto-approve lists so the call surfaces a confirmation.
	 * Absent or `false` means the tool is auto-approved like every other server
	 * tool.
	 */
	requiresConfirmation?(toolName: string): boolean;
	/**
	 * Executes {@link toolName} (one of this group's {@link definitions})
	 * against the session's state, dispatching any resulting actions through
	 * the state manager (the single writer), and returns the textual tool
	 * result.
	 *
	 * @throws if {@link toolName} is not owned by this group or the arguments
	 * are invalid.
	 */
	execute(stateManager: AgentHostStateManager, sessionUri: URI, toolName: string, rawArgs: unknown): string;

	/**
	 * Display strings for {@link toolName} (one of this group's
	 * {@link definitions}), authored here so every provider renders this tool
	 * identically rather than re-deriving the strings from the tool name. The
	 * caller passes the parsed tool arguments and, once the tool has completed,
	 * its {@link IServerToolDisplayResult result}. Returns `undefined` (or
	 * individually-absent fields) to let the provider fall back to its generic
	 * display. Optional: a group without bespoke display omits this.
	 *
	 * `toolName` is the bare tool name (the provider strips any transport
	 * prefix such as Claude's `mcp__<server>__` before calling).
	 */
	getDisplay?(toolName: string, args: unknown, result?: IServerToolDisplayResult): IServerToolDisplay | undefined;
}

/**
 * Bridges the agent host's server tools to the authoritative state tree.
 * Agents execute a server tool by name; the host routes it to the owning
 * {@link IServerToolGroup}, which reads the relevant session state, applies the
 * tool, dispatches any resulting actions through the state manager (the single
 * writer), and returns the textual tool result to the agent.
 *
 * The groups are contributed at construction; the host itself is generic and
 * has no knowledge of any specific tool group. It also advertises every server
 * tool on a session's {@link SessionState.serverTools} so clients see them as
 * server-provided.
 */
export class AgentServerToolHost implements IAgentServerToolHost {

	private readonly _groupByToolName = new Map<string, IServerToolGroup>();

	readonly definitions: readonly ToolDefinition[];
	readonly toolNames: readonly string[];

	constructor(
		private readonly _stateManager: AgentHostStateManager,
		groups: readonly IServerToolGroup[],
	) {
		for (const group of groups) {
			for (const def of group.definitions) {
				if (this._groupByToolName.has(def.name)) {
					throw new Error(`Duplicate server tool registered: ${def.name}`);
				}
				this._groupByToolName.set(def.name, group);
			}
		}
		this.definitions = groups.flatMap(group => group.definitions);
		this.toolNames = this.definitions.map(def => def.name);
	}

	advertise(sessionUri: URI): void {
		this._stateManager.dispatchServerAction(sessionUri, {
			type: ActionType.SessionServerToolsChanged,
			tools: [...this.definitions],
		});
	}

	requiresConfirmation(toolName: string): boolean {
		return this._groupByToolName.get(toolName)?.requiresConfirmation?.(toolName) ?? false;
	}

	executeTool(sessionUri: URI, toolName: string, rawArgs: unknown): string {
		const group = this._groupByToolName.get(toolName);
		if (!group) {
			throw new Error(`Unknown server tool: ${toolName}`);
		}
		return group.execute(this._stateManager, sessionUri, toolName, rawArgs);
	}
}
