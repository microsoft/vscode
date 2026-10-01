/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { readSessionIsPromoted, SESSION_IS_PROMOTED_METADATA_KEY, withSessionIsPromoted } from '../../common/meta/agentSessionPromotionMeta.js';
import { AgentHostStateManager } from '../agentHostStateManager.js';

/** Shares durable promotion and publication between user messages and explicit requests. */
export async function promoteSession(
	stateManager: AgentHostStateManager,
	session: string,
	persist: (values: Readonly<Record<string, string>>) => Promise<void>,
): Promise<void> {
	const current = stateManager.getSessionState(session) ?? stateManager.getSurfacedSessionSummary(session);
	if (readSessionIsPromoted(current)) {
		return;
	}
	if (!stateManager.isAutomationSession(session)) {
		throw new Error('Only automation sessions can be promoted.');
	}
	await persist({ [SESSION_IS_PROMOTED_METADATA_KEY]: 'true' });
	const state = stateManager.getSessionState(session);
	if (state && !readSessionIsPromoted(state)) {
		stateManager.setSessionMeta(session, withSessionIsPromoted(state._meta));
	} else if (!state) {
		const summary = stateManager.getSurfacedSessionSummary(session);
		if (summary) {
			stateManager.updateSurfacedSessionMetadata(session, { ...summary, _meta: withSessionIsPromoted(summary._meta) });
		}
	}
}
