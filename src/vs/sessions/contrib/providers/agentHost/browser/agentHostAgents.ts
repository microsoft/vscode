/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { CustomizationAgentRef, CustomizationRef, SessionCustomization } from '../../../../../platform/agentHost/common/state/protocol/state.js';

/**
 * Computes the effective set of selectable custom agents for a session.
 *
 * The Agent Host publishes contributed agents on three layers:
 *
 * 1. Root / provider customizations — agents from settings-level Open Plugins.
 * 2. Active client customizations — agents from the workbench client's
 *    `setClientCustomizations` payload.
 * 3. Session customizations — the effective merged set the host computes for
 *    a specific session (host + active-client + session-discovered).
 *
 * The picker is keyed on the agent's stable {@link CustomizationAgentRef.uri};
 * duplicates across layers are coalesced. Session customizations win because
 * they are the actual set the runtime will see for this session.
 *
 * `agents === undefined` on a {@link CustomizationRef} means "unknown" (e.g.
 * an older host that does not derive `agents`) and is skipped; an empty array
 * means "no agents contributed" and is respected.
 */
export function getEffectiveAgents(
	rootCustomizations: readonly CustomizationRef[] | undefined,
	activeClientCustomizations: readonly CustomizationRef[] | undefined,
	sessionCustomizations: readonly SessionCustomization[] | undefined,
): readonly CustomizationAgentRef[] {
	const seen = new Map<string, CustomizationAgentRef>();

	const collectFromRefs = (refs: readonly CustomizationRef[] | undefined) => {
		if (!refs) {
			return;
		}
		for (const ref of refs) {
			if (!ref.agents) {
				continue;
			}
			for (const agent of ref.agents) {
				if (!seen.has(agent.uri)) {
					seen.set(agent.uri, agent);
				}
			}
		}
	};

	// Highest priority first so first-seen wins keeps the runtime-correct entry.
	if (sessionCustomizations) {
		collectFromRefs(sessionCustomizations.filter(s => s.enabled !== false).map(s => s.customization));
	}
	collectFromRefs(activeClientCustomizations);
	collectFromRefs(rootCustomizations);

	const result = [...seen.values()];
	result.sort((a, b) => a.name.localeCompare(b.name) || a.uri.localeCompare(b.uri));
	return result;
}
