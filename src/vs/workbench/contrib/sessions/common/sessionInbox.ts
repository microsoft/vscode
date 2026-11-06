/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IReader } from '../../../../base/common/observable.js';
import { IInboxSessionAttention, InboxNotificationPriority, InboxTab } from './inboxNotificationsService.js';
import { ISession, SessionStatus } from '../../../services/sessions/common/session.js';

export type SessionInboxState =
	| { readonly kind: 'done' | 'untilActivity'; readonly activity: string; readonly notificationIds?: readonly string[] }
	| { readonly kind: 'hold' }
	| { readonly kind: 'snoozed'; readonly until: number };

export type SessionInboxAction = 'done' | 'hold' | 'untilActivity' | number | undefined;

export const enum SessionInboxSection {
	ReadyForYou = 'inbox:readyForYou',
	ReadyToMerge = 'inbox:readyToMerge',
	Working = 'inbox:working',
	OnHold = 'inbox:onHold',
	Done = 'inbox:done',
}

export const sessionInboxSections = [
	SessionInboxSection.ReadyForYou,
	SessionInboxSection.Working,
	SessionInboxSection.ReadyToMerge,
	SessionInboxSection.OnHold,
	SessionInboxSection.Done,
] as const;

export function getSessionInboxActivity(session: ISession, reader?: IReader): string {
	return `${session.status.read(reader)}:${session.updatedAt.read(reader).getTime()}:${session.lastTurnEnd.read(reader)?.getTime() ?? 0}`;
}

export function isSessionInboxStateCurrent(state: SessionInboxState, session: ISession | undefined, now: number, reader?: IReader, attention?: IInboxSessionAttention): boolean {
	if (state.kind === 'hold') {
		return true;
	}
	if (state.kind === 'snoozed') {
		return state.until > now;
	}
	const notificationIds = state.notificationIds;
	return !session || session.loading.read(reader) || state.activity === getSessionInboxActivity(session, reader)
		&& (!notificationIds || !attention || attention.notificationIds.every(id => notificationIds.includes(id)));
}

export function getSessionInboxPriority(session: ISession, attention?: IInboxSessionAttention): InboxNotificationPriority {
	return attention?.priority ?? (session.status.get() === SessionStatus.NeedsInput ? InboxNotificationPriority.Now : InboxNotificationPriority.Later);
}

export function getSessionInboxSection(session: ISession, state?: SessionInboxState, reader?: IReader, attention?: IInboxSessionAttention): SessionInboxSection {
	if (state?.kind === 'done') {
		return SessionInboxSection.Done;
	}
	if (state) {
		return SessionInboxSection.OnHold;
	}
	if (attention) {
		switch (attention.tab) {
			case InboxTab.ReadyForYou: return SessionInboxSection.ReadyForYou;
			case InboxTab.Working: return SessionInboxSection.Working;
			case InboxTab.ReadyToMerge: return SessionInboxSection.ReadyToMerge;
		}
	}
	const status = session.status.read(reader);
	if (status === SessionStatus.NeedsInput || status === SessionStatus.Error) {
		return SessionInboxSection.ReadyForYou;
	}
	if (status === SessionStatus.InProgress) {
		return SessionInboxSection.Working;
	}
	return SessionInboxSection.ReadyForYou;
}
