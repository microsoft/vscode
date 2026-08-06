/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { isActiveSessionStatus, ISession, SessionStatus } from '../../../services/sessions/common/session.js';

export interface ISessionsPickerGroups {
	readonly needsInput: readonly ISession[];
	readonly unread: readonly ISession[];
	readonly recent: readonly ISession[];
	readonly other: readonly ISession[];
}

/** Groups sessions by picker priority while preserving their existing order. */
export function groupSessionsForPicker(recentSessions: readonly ISession[], otherSessions: readonly ISession[]): ISessionsPickerGroups {
	const needsInput: ISession[] = [];
	const unread: ISession[] = [];
	const recent: ISession[] = [];
	const other: ISession[] = [];

	const groupSession = (session: ISession, remaining: ISession[]): void => {
		const status = session.status.get();
		if (session.isArchived.get()) {
			return;
		} else if (status === SessionStatus.NeedsInput) {
			needsInput.push(session);
		} else if (!isActiveSessionStatus(status) && !session.isRead.get()) {
			unread.push(session);
		} else {
			remaining.push(session);
		}
	};

	for (const session of recentSessions) {
		groupSession(session, recent);
	}
	for (const session of otherSessions) {
		groupSession(session, other);
	}

	return { needsInput, unread, recent, other };
}
