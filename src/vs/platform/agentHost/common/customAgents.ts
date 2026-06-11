/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { URI } from '../../../base/common/uri.js';
import { CustomizationType, type AgentCustomization, type Customization } from './state/protocol/state.js';

/**
 * Computes the effective set of selectable custom agents for a session.
 *
 * Custom agents live as {@link CustomizationType.Agent | `Agent`} entries
 * in each container customization's {@link Customization.children | `children`}
 * array. Only the agent host populates `children` (after parsing the
 * container). Disabled containers are skipped; containers with an absent
 * `children` field are treated as "unknown" (e.g. the host has not finished
 * parsing yet) and skipped, while an empty array means "no children
 * contributed" and is respected.
 *
 * The picker is keyed on the agent's stable {@link AgentCustomization.uri};
 * duplicates within the session's customization list are coalesced.
 */
export function getEffectiveAgents(
	sessionCustomizations: readonly Customization[] | undefined,
): readonly AgentCustomization[] {
	const seen = new Map<string, AgentCustomization>();
	if (sessionCustomizations) {
		for (const container of sessionCustomizations) {
			if (container.type === CustomizationType.McpServer) {
				continue;
			}
			if (container.enabled === false || !container.children) {
				continue;
			}
			for (const child of container.children) {
				if (child.type !== CustomizationType.Agent) {
					continue;
				}
				const key = child.uri.toString();
				if (!seen.has(key)) {
					seen.set(key, child);
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
	agents: readonly AgentCustomization[],
	sessionAgentUri: URI | string | undefined,
	storedAgentUri: string | undefined,
): AgentCustomization | undefined {
	if (sessionAgentUri !== undefined) {
		const sessionStr = typeof sessionAgentUri === 'string' ? sessionAgentUri : sessionAgentUri.toString();
		const match = agents.find(a => a.uri === sessionStr);
		if (match) {
			return match;
		}
	}
	return storedAgentUri ? agents.find(a => a.uri === storedAgentUri) : undefined;
}
