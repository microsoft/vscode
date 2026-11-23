/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IReader } from '../../../../base/common/observable.js';
import { localize } from '../../../../nls.js';
import { AgentHostPullRequestOperationId } from '../../../../platform/agentHost/common/agentHostChangesetOperationService.js';
import { IInboxSessionAttention, InboxNotificationPriority, InboxTab } from './sessionAttentionService.js';
import { ChatInteractivity, ChatOriginKind, getGitHubPullRequestRefs, ISession, ISessionChangeset, ISessionChangesetOperation, SessionChangesetOperationScope, SessionChangesetOperationStatus, SessionStatus } from '../../../services/sessions/common/session.js';
import { getSessionGitHubReferences } from './github/sessionGitHubReferences.js';

export type SessionInboxState =
	| { readonly kind: 'done' | 'untilActivity'; readonly activity: string; readonly notificationIds?: readonly string[]; readonly isHistoricalCompletion?: true }
	| { readonly kind: 'hold' }
	| { readonly kind: 'snoozed'; readonly until: number };

export type SessionInboxAction = 'done' | 'hold' | 'untilActivity' | number | undefined;

export const enum SessionInboxSection {
	ReadyForYou = 'inbox:readyForYou',
	Working = 'inbox:working',
	OnHold = 'inbox:onHold',
	Acknowledged = 'inbox:acknowledged',
	Done = 'inbox:done',
}

export const sessionInboxSections = [
	SessionInboxSection.ReadyForYou,
	SessionInboxSection.Working,
	SessionInboxSection.OnHold,
	SessionInboxSection.Acknowledged,
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
	// Keep the decision until the session has loaded enough to compare its activity.
	if (!session || session.loading.read(reader)) {
		return true;
	}
	const [previousStatus, previousUpdatedAt, previousLastTurnEnd] = state.activity.split(':');
	const [status, updatedAt, lastTurnEnd] = getSessionInboxActivity(session, reader).split(':');
	// Loading last-turn timing does not add activity newer than the catalog's modified time.
	if (previousStatus !== status || previousUpdatedAt !== updatedAt
		|| Math.max(Number(previousUpdatedAt), Number(previousLastTurnEnd)) !== Math.max(Number(updatedAt), Number(lastTurnEnd))) {
		return false;
	}
	const acknowledged = state.notificationIds;
	if (!acknowledged || !attention) {
		return true;
	}
	return attention.notificationIds.every(id => isNotificationAcknowledged(id, acknowledged, attention.pendingInput));
}

/**
 * Whether a live notification was already acknowledged by a triage decision. A pending input
 * first appears under a provisional identity; once its chat hydrates, the real identity counts
 * as acknowledged when the provisional one was.
 */
function isNotificationAcknowledged(id: string, acknowledged: readonly string[], pendingInput: IInboxSessionAttention['pendingInput']): boolean {
	if (acknowledged.includes(id)) {
		return true;
	}
	if (!pendingInput) {
		return false;
	}
	return id === pendingInput.provisionalId
		|| id === pendingInput.notificationId && acknowledged.includes(pendingInput.provisionalId);
}

export function getSessionInboxPriority(session: ISession, attention?: IInboxSessionAttention, reader?: IReader): InboxNotificationPriority {
	return attention?.priority ?? (session.status.read(reader) === SessionStatus.NeedsInput ? InboxNotificationPriority.Now : InboxNotificationPriority.Later);
}

export function getSessionInboxSection(session: ISession, state?: SessionInboxState, reader?: IReader, attention?: IInboxSessionAttention): SessionInboxSection {
	if (state?.kind === 'done') {
		return state.isHistoricalCompletion ? SessionInboxSection.Done : SessionInboxSection.Acknowledged;
	}
	if (state) {
		return SessionInboxSection.OnHold;
	}
	const chats = session.chats.read(reader).filter(chat =>
		!chat.isArchived.read(reader)
		&& chat.origin?.kind !== ChatOriginKind.Tool
		&& chat.interactivity.read(reader) !== ChatInteractivity.Hidden);
	if (session.status.read(reader) === SessionStatus.InProgress || chats.some(chat => chat.status.read(reader) === SessionStatus.InProgress)) {
		return SessionInboxSection.Working;
	}
	if (attention) {
		switch (attention.tab) {
			case InboxTab.ReadyForYou:
			case InboxTab.ReadyToMerge: return SessionInboxSection.ReadyForYou;
			case InboxTab.Working: return SessionInboxSection.Working;
		}
	}
	return SessionInboxSection.ReadyForYou;
}

export function getSessionInboxDescription(state: SessionInboxState | undefined): string | undefined {
	switch (state?.kind) {
		case 'snoozed': return localize('inboxSnoozedUntil', "Snoozed until {0}", new Date(state.until).toLocaleString());
		case 'untilActivity': return localize('inboxSnoozedUntilActivity', "Snoozed until new activity");
		default: return undefined;
	}
}

/** Returns an available, provider-advertised PR merge operation for a single PR; never a local branch merge. */
export function getInboxPullRequestMergeOperation(session: ISession, reader?: IReader): { readonly changeset: ISessionChangeset; readonly operation: ISessionChangesetOperation } | undefined {
	const pullRequests = new Set(getSessionGitHubReferences(session, reader).pullRequests.map(ref => ref.uri.toString()));
	for (const folder of session.workspace.read(reader)?.folders ?? []) {
		for (const ref of getGitHubPullRequestRefs(folder.gitRepository?.gitHubInfo.read(reader))) {
			pullRequests.add(ref.uri.toString());
		}
	}
	if (pullRequests.size !== 1) {
		return undefined;
	}
	let candidate: { readonly changeset: ISessionChangeset; readonly operation: ISessionChangesetOperation } | undefined;
	for (const changeset of session.mainChat.read(reader).changesets.read(reader) ?? []) {
		if (!changeset.isEnabled.read(reader)) {
			continue;
		}
		for (const operation of changeset.operations.read(reader)) {
			if (operation.id !== AgentHostPullRequestOperationId.Merge
				|| !operation.scopes.includes(SessionChangesetOperationScope.Changeset)) {
				continue;
			}
			if (operation.status === SessionChangesetOperationStatus.Running) {
				return undefined;
			}
			if (!candidate && operation.status !== SessionChangesetOperationStatus.Disabled) {
				candidate = { changeset, operation };
			}
		}
	}
	return candidate;
}
