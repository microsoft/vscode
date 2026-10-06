/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { isEqual } from '../../../../base/common/resources.js';
import { ISessionComparison, SessionComparisonParticipantRole } from '../../../services/sessions/common/sessionComparison.js';
import { IActiveSession } from '../../../services/sessions/common/sessionsManagement.js';

export const OPEN_SESSION_COMPARISON_COMMAND_ID = 'sessions.openComparison';
export const HIDE_INACTIVE_COMPARISON_INPUTS_SETTING = 'sessions.chat.compareAgents.hideInactiveInputs';

export function getComparisonForVisibleSessions(visibleSessions: readonly (IActiveSession | undefined)[], comparisons: readonly ISessionComparison[]): ISessionComparison | undefined {
	if (visibleSessions.length <= 1 || visibleSessions.some(session => !session)) {
		return undefined;
	}
	const firstSession = visibleSessions[0]!;
	const comparison = comparisons.find(candidate => candidate.archivedAt === undefined
		&& candidate.participants.some(participant => participant.sessionResource && isEqual(participant.sessionResource, firstSession.resource)));
	return comparison && visibleSessions.every(session => comparison.participants.some(participant =>
		participant.sessionResource && isEqual(participant.sessionResource, session!.resource)))
		? comparison
		: undefined;
}

export function shouldHideInactiveComparisonInputs(visibleSessions: readonly (IActiveSession | undefined)[], comparison: ISessionComparison | undefined, hideInactiveInputs: boolean, screenReaderOptimized: boolean): boolean {
	return hideInactiveInputs && !screenReaderOptimized && visibleSessions.length > 2 && !!comparison
		&& visibleSessions.every(session => !!session && comparison.participants.some(participant =>
			participant.role === SessionComparisonParticipantRole.Attempt
			&& participant.sessionResource && isEqual(participant.sessionResource, session.resource)));
}
