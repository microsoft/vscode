/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { CustomizationAgentRef, SessionCustomization } from '../../../../../platform/agentHost/common/state/protocol/state.js';

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
				if (!seen.has(agent.uri)) {
					seen.set(agent.uri, agent);
				}
			}
		}
	}

	const result = [...seen.values()];
	result.sort((a, b) => a.name.localeCompare(b.name) || a.uri.localeCompare(b.uri));
	return result;
}
