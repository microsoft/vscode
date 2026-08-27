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
	readonly turnId?: string;
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
	/**
	 * Names this group's tools were previously advertised under, mapped to the
	 * name that replaced them. A renamed tool has to keep answering to its old
	 * name: restored history and prompts written against the old name would
	 * otherwise fail to route and lose their dedicated display. Legacy names are
	 * never advertised, and the host translates them before dispatching, so a
	 * group only ever sees its current names.
	 */
	readonly legacyToolNames?: ReadonlyMap<string, string>;
	/** Whether each session keeps the definitions first advertised to it instead of following later enablement changes. */
	readonly materializeDefinitions?: boolean;
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

	/** Every name the host answers to — current and legacy — and its owning group. */
	private readonly _groupByToolName = new Map<string, IServerToolGroup>();
	/** Legacy names mapped to the current name that replaced them. */
	private readonly _currentToolNames = new Map<string, string>();

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
		// Registered after every current name, so a legacy name can never shadow
		// a tool that is actually advertised under it.
		for (const group of this._groups) {
			for (const [legacyName, currentName] of group.legacyToolNames ?? []) {
				if (this._groupByToolName.has(legacyName)) {
					continue;
				}
				this._groupByToolName.set(legacyName, group);
				this._currentToolNames.set(legacyName, currentName);
			}
		}
	}

	/** The name a group knows a tool by, translating a legacy name if needed. */
	private _currentToolName(toolName: string): string {
		return this._currentToolNames.get(toolName) ?? toolName;
	}

	get definitions(): readonly IAgentServerToolDefinition[] {
		return this._groups.flatMap(group => group.definitions.filter(definition => group.isEnabled(definition.name)));
	}

	getDefinitionsForSession(sessionUri: URI): readonly IAgentServerToolDefinition[] {
		const materializedDefinitions = this._stateManager.getSessionState(sessionUri)?.serverTools;
		const isEphemeral = this._stateManager.isEphemeralSession(sessionUri);
		return this._groups.flatMap(group => {
			if (materializedDefinitions && group.materializeDefinitions) {
				// A session's tool membership is fixed at materialization time, but
				// each still-current tool's metadata (description, schema) is refreshed
				// from the group so restored sessions pick up wording changes instead
				// of pinning the descriptions they were first advertised with. Tools
				// with no current definition (e.g. the retired create_chat) keep their
				// stored metadata.
				const currentByName = new Map(group.definitions.map(definition => [definition.name, definition]));
				return materializedDefinitions
					.filter(definition => this._groupByToolName.get(definition.name) === group)
					.map(definition => currentByName.get(definition.name) ?? definition);
			}
			const definitions = group.definitions.filter(definition => group.isEnabled(definition.name));
			return isEphemeral ? definitions.filter(definition => definition.enabledForEphemeralSessions) : definitions;
		});
	}

	get toolNames(): readonly string[] {
		return [
			...this.definitions.map(definition => definition.name),
			...this._groups.flatMap(group => [...(group.legacyToolNames ?? [])]
				.filter(([, currentName]) => group.isEnabled(currentName))
				.map(([legacyName]) => legacyName)),
		];
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
		const name = this._currentToolName(toolName);
		return group?.isEnabled(name) === true && (group.canRequireConfirmation?.(name) ?? false);
	}

	requiresConfirmation(chatUri: URI, toolName: string): boolean {
		const group = this._groupByToolName.get(toolName);
		const name = this._currentToolName(toolName);
		if (group && !this._isEnabledForSession(group, chatUri, name, toolName)) {
			return false;
		}
		return group?.requiresConfirmation?.(this._stateManager, this._executionContext(chatUri), name)
			?? group?.canRequireConfirmation?.(name)
			?? false;
	}

	executeTool(chatUri: URI, toolName: string, rawArgs: unknown): string | Promise<string> {
		const group = this._groupByToolName.get(toolName);
		if (!group) {
			throw new Error(`Unknown server tool: ${toolName}`);
		}
		const name = this._currentToolName(toolName);
		if (!this._isEnabledForSession(group, chatUri, name, toolName)) {
			throw new Error(`Server tool "${toolName}" is disabled.`);
		}
		return group.execute(this._stateManager, this._executionContext(chatUri), name, rawArgs);
	}

	private _executionContext(chatUri: URI): IServerToolExecutionContext {
		return {
			sessionUri: parseRequiredSessionUriFromChatUri(chatUri),
			chatUri,
			turnId: this._stateManager.getActiveTurnId(chatUri),
		};
	}

	private _toProtocolDefinitions(definitions: readonly IAgentServerToolDefinition[]): ToolDefinition[] {
		return definitions.map(({ enabledForEphemeralSessions: _enabledForEphemeralSessions, ...definition }) => definition);
	}

	private _isEnabledForSession(group: IServerToolGroup, chatUri: URI, toolName: string, requestedToolName = toolName): boolean {
		const advertisedTools = this._stateManager.getSessionState(chatUri)?.serverTools;
		return advertisedTools
			? advertisedTools.some(tool => tool.name === toolName) || group.legacyToolNames?.has(requestedToolName) === true
			: group.isEnabled(toolName);
	}
}
