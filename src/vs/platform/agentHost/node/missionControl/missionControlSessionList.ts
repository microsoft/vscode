/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { isSessionStatusArchived, type SessionSummary } from '../../common/state/sessionState.js';

const maxArchivedSessions = 100;

export function toMissionControlSessionList(sessions: readonly SessionSummary[]): SessionSummary[] {
	const recentArchived = new Set(sessions
		.filter(session => isSessionStatusArchived(session.status))
		.sort((a, b) => Date.parse(b.modifiedAt) - Date.parse(a.modifiedAt))
		.slice(0, maxArchivedSessions));
	return sessions.filter(session => !isSessionStatusArchived(session.status) || recentArchived.has(session));
}
