/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { IAgentServerToolHost } from '../../common/agentServerTools.js';
import { ActionType } from '../../common/state/protocol/common/actions.js';
import type { ToolDefinition, URI } from '../../common/state/sessionState.js';
import type { AgentHostStateManager } from '../agentHostStateManager.js';

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
	 * Executes {@link toolName} (one of this group's {@link definitions})
	 * against the session's state, dispatching any resulting actions through
	 * the state manager (the single writer), and returns the textual tool
	 * result.
	 *
	 * @throws if {@link toolName} is not owned by this group or the arguments
	 * are invalid.
	 */
	execute(stateManager: AgentHostStateManager, sessionUri: URI, toolName: string, rawArgs: unknown): string;
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

	executeTool(sessionUri: URI, toolName: string, rawArgs: unknown): string {
		const group = this._groupByToolName.get(toolName);
		if (!group) {
			throw new Error(`Unknown server tool: ${toolName}`);
		}
		return group.execute(this._stateManager, sessionUri, toolName, rawArgs);
	}
}
