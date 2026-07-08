/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createRenameSessionServerToolGroup, getRenameSessionToolDisplay, renameSessionServerToolDefinitions, type IRenameSessionHandler } from './agentRenameSessionServerTool.js';
import { feedbackServerToolGroup } from './agentFeedbackServerTools.js';
import type { IServerToolDisplay, IServerToolDisplayResult, IServerToolGroup } from './agentServerToolHost.js';

/**
 * Host-side implementations that the contributed server-tool groups delegate to.
 * Bound once at startup (see `agentService.ts`) so the groups themselves stay
 * free of state-manager and persistence concerns.
 */
export interface IServerToolHandlers {
	/** Applies an agent-requested session rename (the `rename_session` tool). */
	readonly renameSession: IRenameSessionHandler;
}

/**
 * Builds the server-tool groups contributed to every agent host session, in
 * priority order, binding each group's host-side handlers from {@link handlers}.
 * This is the single source of truth wired into the {@link AgentServerToolHost}
 * at startup (see `agentService.ts`) and consulted by each provider's display
 * layer via {@link getServerToolDisplay}.
 *
 * Adding a group here makes its tools available to all providers (Copilot,
 * Claude, Codex, …). Contribute a matching entry to {@link serverToolDisplays}
 * so history-replay (which has no host instance) can render it too.
 */
export function createServerToolGroups(handlers: IServerToolHandlers): readonly IServerToolGroup[] {
	return [
		feedbackServerToolGroup,
		createRenameSessionServerToolGroup(handlers.renameSession),
	];
}

/**
 * Handler-free display descriptors for every contributed server tool, mirroring
 * {@link createServerToolGroups}. Kept separate so {@link getServerToolDisplay}
 * can render tools without the constructed {@link AgentServerToolHost} — the
 * providers' history-replay paths build display from pure functions only.
 */
const serverToolDisplays: readonly Pick<IServerToolGroup, 'definitions' | 'getDisplay'>[] = [
	feedbackServerToolGroup,
	{ definitions: renameSessionServerToolDefinitions, getDisplay: getRenameSessionToolDisplay },
];

/**
 * Whether {@link toolName} (a tool name as seen on a tool call) refers to the
 * server tool {@link bareName}. Accepts both the bare name and a transport
 * prefix such as Claude's `mcp__<server>__<name>` (matched as a `__`-delimited
 * suffix), mirroring the convention in `agentFeedbackAnnotations.ts`.
 */
function matchesServerToolName(toolName: string, bareName: string): boolean {
	return toolName === bareName || toolName.endsWith(`__${bareName}`);
}

/**
 * Resolves the {@link IServerToolDisplay} for a server tool call, authored by
 * the group that owns the tool. Returns `undefined` when no contributed group
 * owns {@link toolName} or the owning group has no bespoke display, so each
 * provider's display layer can fall back to its generic behavior.
 *
 * Pure over {@link serverToolDisplays} (it does not need the constructed
 * {@link AgentServerToolHost}) so the providers' history-replay paths — which
 * build display from pure functions without a host instance — can call it too.
 *
 * @param toolName The tool name as seen on the call (bare or transport-prefixed).
 * @param args The parsed tool arguments.
 * @param result The tool result, once it has completed; absent while running.
 */
export function getServerToolDisplay(toolName: string, args: unknown, result?: IServerToolDisplayResult): IServerToolDisplay | undefined {
	for (const group of serverToolDisplays) {
		if (!group.getDisplay) {
			continue;
		}
		for (const def of group.definitions) {
			if (matchesServerToolName(toolName, def.name)) {
				return group.getDisplay(def.name, args, result);
			}
		}
	}
	return undefined;
}
