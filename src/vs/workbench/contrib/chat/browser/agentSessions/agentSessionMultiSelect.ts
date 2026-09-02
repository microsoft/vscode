/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { isEqual } from '../../../../../base/common/resources.js';
import { IAgentSession, isAgentHostAgentSessionItem, isLocalAgentSessionItem } from './agentSessionsModel.js';

/**
 * Sessions for a context-menu action: use the full selection when the
 * right-clicked session is in that selection (matched by resource URI, not
 * object identity), otherwise only the clicked session.
 */
export function resolveContextMenuSessions(
	clicked: IAgentSession,
	selection: readonly IAgentSession[],
): IAgentSession[] {
	const sessionInSelection = selection.some(selected => isEqual(selected.resource, clicked.resource));
	return selection.length > 1 && sessionInSelection ? [...selection] : [clicked];
}

/**
 * Prefer list selection when present; otherwise a single focused session.
 */
export function resolveSessionsFromViewFallback(
	selected: readonly IAgentSession[],
	focused: readonly IAgentSession[],
): IAgentSession[] {
	if (selected.length > 0) {
		return [...selected];
	}
	const firstFocused = focused.at(0);
	return firstFocused ? [firstFocused] : [];
}

export function isDeletableAgentSession(session: IAgentSession): boolean {
	return isLocalAgentSessionItem(session) || isAgentHostAgentSessionItem(session);
}

export function filterDeletableAgentSessions(sessions: readonly IAgentSession[]): IAgentSession[] {
	return sessions.filter(isDeletableAgentSession);
}
