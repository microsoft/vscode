/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { IAgentServerToolDefinition, IAgentServerToolHost } from '../../common/agentServerTools.js';
import { ActionType } from '../../common/state/protocol/common/actions.js';
import { parseRequiredSessionUriFromChatUri, type StringOrMarkdown, type ToolDefinition, type URI } from '../../common/state/sessionState.js';
import type { AgentHostStateManager } from '../agentHostStateManager.js';

/**
 * Result of a server tool, passed to {@link IServerToolGroup.getDisplay} so the
 * owning group can tailor its past-tense message to what the tool returned.
 * Absent while the tool is still running.
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
	/** Message shown while the tool runs (e.g. "List comments"). */
	readonly invocationMessage?: StringOrMarkdown;
	/** Past-tense message shown once the tool completes. When omitted, the provider reuses `invocationMessage`. */
	readonly pastTenseMessage?: StringOrMarkdown;
}

export interface IServerToolExecutionContext {
	readonly sessionUri: URI;
	readonly chatUri: URI;
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
	readonly definitions: readonly IAgentServerToolDefinition[];
	/** Whether a contributed tool is currently enabled for advertisement and execution. */
	isEnabled(toolName: string): boolean;
	/**
	 * Whether {@link toolName} (one of this group's {@link definitions}) can
	 * ever prompt for confirmation. Providers exclude such tools from their
	 * server-tool auto-approve lists so the call routes through a confirmation
	 * path. Absent or `false` means the tool is auto-approved like every other
	 * server tool.
	 */
	canRequireConfirmation?(toolName: string): boolean;
	/**
	 * Whether {@link toolName} needs to prompt for the invocation currently
	 * being made in {@link IServerToolExecutionContext.chatUri}. Implement this for
	 * state-dependent confirmation (e.g. nothing to confirm yet) while keeping
	 * {@link canRequireConfirmation} stable for provider allow-lists. Absent
	 * falls back to {@link canRequireConfirmation}.
	 */
	requiresConfirmation?(stateManager: AgentHostStateManager, context: IServerToolExecutionContext, toolName: string): boolean;
	/**
	 * Executes {@link toolName} (one of this group's {@link definitions})
	 * against the session's state, dispatching any resulting actions through
	 * the state manager (the single writer), and returns the textual tool
	 * result.
	 *
	 * @throws if {@link toolName} is not owned by this group or the arguments
	 * are invalid.
	 */
	execute(stateManager: AgentHostStateManager, context: IServerToolExecutionContext, toolName: string, rawArgs: unknown): string | Promise<string>;

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

	constructor(
		private readonly _stateManager: AgentHostStateManager,
		private readonly _groups: readonly IServerToolGroup[],
	) {
		for (const group of this._groups) {
			for (const def of group.definitions) {
				if (this._groupByToolName.has(def.name)) {
					throw new Error(`Duplicate server tool registered: ${def.name}`);
				}
				this._groupByToolName.set(def.name, group);
			}
		}
	}

	get definitions(): readonly IAgentServerToolDefinition[] {
		return this._groups.flatMap(group => group.definitions.filter(definition => group.isEnabled(definition.name)));
	}

	getDefinitionsForSession(sessionUri: URI): readonly IAgentServerToolDefinition[] {
		return this._stateManager.isEphemeralSession(sessionUri)
			? this.definitions.filter(definition => definition.enabledForEphemeralSessions)
			: this.definitions;
	}

	get toolNames(): readonly string[] {
		return this.definitions.map(definition => definition.name);
	}

	advertise(sessionUri: URI): void {
		// Provider materialization can precede restore; AgentService advertises again once the session is registered.
		if (!this._stateManager.getSessionState(sessionUri)) {
			return;
		}
		this._stateManager.dispatchServerAction(sessionUri, {
			type: ActionType.SessionServerToolsChanged,
			tools: this._toProtocolDefinitions(this.getDefinitionsForSession(sessionUri)),
		});
	}

	canRequireConfirmation(toolName: string): boolean {
		const group = this._groupByToolName.get(toolName);
		return group?.isEnabled(toolName) === true && (group.canRequireConfirmation?.(toolName) ?? false);
	}

	requiresConfirmation(chatUri: URI, toolName: string): boolean {
		const group = this._groupByToolName.get(toolName);
		if (group && !this._isEnabledForSession(group, chatUri, toolName)) {
			return false;
		}
		return group?.requiresConfirmation?.(this._stateManager, this._executionContext(chatUri), toolName)
			?? group?.canRequireConfirmation?.(toolName)
			?? false;
	}

	executeTool(chatUri: URI, toolName: string, rawArgs: unknown): string | Promise<string> {
		const group = this._groupByToolName.get(toolName);
		if (!group) {
			throw new Error(`Unknown server tool: ${toolName}`);
		}
		if (!this._isEnabledForSession(group, chatUri, toolName)) {
			throw new Error(`Server tool "${toolName}" is disabled.`);
		}
		return group.execute(this._stateManager, this._executionContext(chatUri), toolName, rawArgs);
	}

	private _executionContext(chatUri: URI): IServerToolExecutionContext {
		return {
			sessionUri: parseRequiredSessionUriFromChatUri(chatUri),
			chatUri,
		};
	}

	private _toProtocolDefinitions(definitions: readonly IAgentServerToolDefinition[]): ToolDefinition[] {
		return definitions.map(({ enabledForEphemeralSessions: _enabledForEphemeralSessions, ...definition }) => definition);
	}

	private _isEnabledForSession(group: IServerToolGroup, chatUri: URI, toolName: string): boolean {
		const advertisedTools = this._stateManager.getSessionState(chatUri)?.serverTools;
		return advertisedTools
			? advertisedTools.some(tool => tool.name === toolName)
			: group.isEnabled(toolName);
	}
}
