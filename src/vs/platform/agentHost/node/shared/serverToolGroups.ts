/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { feedbackServerToolGroup } from './agentFeedbackServerTools.js';
import { createSessionServerToolGroup, type ISessionServerToolAccessor } from './sessionServerTools.js';
import type { IServerToolDisplay, IServerToolDisplayResult, IServerToolGroup } from './agentServerToolHost.js';

/**
 * Builds the server-tool groups contributed to every agent host session, in
 * priority order. This is the single source of truth wired into the
 * {@link AgentServerToolHost} at startup (see `agentService.ts`) and — via
 * {@link getServerToolDisplay} — consulted by each provider's display layer.
 *
 * Adding a group here makes its tools available to all providers (Copilot,
 * Claude, Codex, …) and — if the group implements
 * {@link IServerToolGroup.getDisplay} — gives them nice display everywhere for
 * free.
 *
 * `sessionAccessor` is the runtime dependency of the session-management group
 * (list/create/delete sessions); it is provided by the host at construction.
 * When omitted (the pure display path) the session group's `execute` is inert,
 * but its definitions and display remain available.
 */
export function buildServerToolGroups(sessionAccessor?: ISessionServerToolAccessor): readonly IServerToolGroup[] {
	return [feedbackServerToolGroup, createSessionServerToolGroup(sessionAccessor)];
}

/**
 * The groups used by the pure {@link getServerToolDisplay} path. Built without a
 * session accessor since display never invokes `execute`.
 */
const serverToolGroupsForDisplay: readonly IServerToolGroup[] = buildServerToolGroups();

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
 * Pure over the contributed groups (it does not need the constructed
 * {@link AgentServerToolHost}) so the providers' history-replay paths — which
 * build display from pure functions without a host instance — can call it too.
 *
 * @param toolName The tool name as seen on the call (bare or transport-prefixed).
 * @param args The parsed tool arguments.
 * @param result The tool result, once it has completed; absent while running.
 */
export function getServerToolDisplay(toolName: string, args: unknown, result?: IServerToolDisplayResult): IServerToolDisplay | undefined {
	for (const group of serverToolGroupsForDisplay) {
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
