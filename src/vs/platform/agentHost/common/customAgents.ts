/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { URI } from '../../../base/common/uri.js';
import type { CustomizationAgentRef, SessionCustomization } from './state/protocol/state.js';

/**
 * Computes the effective set of selectable custom agents for a session.
 *
 * Custom agents are contributed exclusively by
 * {@link SessionCustomization.agents} — only the agent host populates that
 * field after parsing each customization. Disabled session customizations
 * are skipped; customizations with an absent `agents` field are treated as
 * "unknown" (e.g. the host has not finished parsing yet) and skipped, while
 * an empty array means "no agents contributed" and is respected.
 *
 * The picker is keyed on the agent's stable {@link CustomizationAgentRef.uri};
 * duplicates within the session's customization list are coalesced.
 */
export function getEffectiveAgents(
	sessionCustomizations: readonly SessionCustomization[] | undefined,
): readonly CustomizationAgentRef[] {
	const seen = new Map<string, CustomizationAgentRef>();
	if (sessionCustomizations) {
		for (const customization of sessionCustomizations) {
			if (customization.enabled === false || !customization.agents) {
				continue;
			}
			for (const agent of customization.agents) {
				const key = agent.uri.toString();
				if (!seen.has(key)) {
					seen.set(key, agent);
				}
			}
		}
	}
	const result = [...seen.values()];
	result.sort((a, b) => a.name.localeCompare(b.name) || a.uri.toString().localeCompare(b.uri.toString()));
	return result;
}

/**
 * Storage key used by the custom-agent pickers to remember the user's last
 * selection per session-resource scheme. Shared between the Agents Window
 * picker and the workbench chat-editor picker so the two surfaces agree on
 * the default for new (untitled) sessions.
 */
export function agentHostAgentPickerStorageKey(resourceScheme: string): string {
	return `workbench.agentsession.agentHostAgentPicker.${resourceScheme}.selectedAgentUri`;
}

/**
 * Resolves the agent that should be shown for a session:
 * - If the session has a current selection and it exists in the effective list, use it.
 * - Else if a stored agent URI matches an entry in the list, use that entry.
 * - Else `undefined` (the default "Agent" placeholder row).
 *
 * `sessionAgentUri` accepts either a platform {@link URI} instance or a raw
 * URI string. The agent-host protocol
 * {@link import('./state/protocol/state.js').AgentSelection} URI field and the
 * sessions-layer `ISessionAgentRef` both provide URI strings.
 */
export function resolveAgentHostAgent(
	agents: readonly CustomizationAgentRef[],
	sessionAgentUri: URI | string | undefined,
	storedAgentUri: string | undefined,
): CustomizationAgentRef | undefined {
	if (sessionAgentUri !== undefined) {
		const sessionStr = typeof sessionAgentUri === 'string' ? sessionAgentUri : sessionAgentUri.toString();
		const match = agents.find(a => a.uri === sessionStr);
		if (match) {
			return match;
		}
	}
	return storedAgentUri ? agents.find(a => a.uri === storedAgentUri) : undefined;
}
