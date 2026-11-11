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
	const pendingInput = attention?.pendingInput;
	return !session || session.loading.read(reader) || state.activity === getSessionInboxActivity(session, reader)
		&& (!notificationIds || !attention || attention.notificationIds.every(id => notificationIds.includes(id)
			|| !!pendingInput && (id === pendingInput.provisionalId
				|| id === pendingInput.notificationId && notificationIds.includes(pendingInput.provisionalId))));
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
	const chats = session.chats.read(reader).filter(chat =>
		!chat.isArchived.read(reader)
		&& chat.origin?.kind !== ChatOriginKind.Tool
		&& chat.interactivity.read(reader) !== ChatInteractivity.Hidden);
	if (chats.length > 1 && chats.some(chat => {
		const status = chat.status.read(reader);
		return status === SessionStatus.Completed || status === SessionStatus.NeedsInput || status === SessionStatus.Error;
	}) && (attention?.tab === InboxTab.Working || !attention && session.status.read(reader) === SessionStatus.InProgress)) {
		return SessionInboxSection.ReadyForYou;
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

export function getSessionInboxDescription(state: SessionInboxState | undefined): string | undefined {
	switch (state?.kind) {
		case 'snoozed': return localize('inboxSnoozedUntil', "Snoozed until {0}", new Date(state.until).toLocaleString());
		case 'untilActivity': return localize('inboxSnoozedUntilActivity', "Snoozed until new activity");
		case 'hold': return localize('inboxHeldUntilResumed', "On hold until you return it to Inbox");
		case 'done': return localize('inboxClearedNotArchived', "Cleared from Inbox, not archived");
		default: return undefined;
	}
}

/** Returns the unambiguous, provider-advertised PR merge operation; never a local branch merge. */
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
				|| !operation.scopes.includes(SessionChangesetOperationScope.Changeset)
				|| operation.status === SessionChangesetOperationStatus.Disabled
				|| operation.status === SessionChangesetOperationStatus.Running) {
				continue;
			}
			if (candidate) {
				return undefined;
			}
			candidate = { changeset, operation };
		}
	}
	return candidate;
}
