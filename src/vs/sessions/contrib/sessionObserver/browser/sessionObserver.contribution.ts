/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../../workbench/common/contributions.js';
import { NO_FIDELITY, providerOf } from '../../../../workbench/contrib/chat/browser/sessionObserver/chatSessionObserverService.js';
import { IChatSessionObservedInfo, IChatSessionObserverService } from '../../../../workbench/contrib/chat/common/sessionObserver/chatSessionObserver.js';
import { ISessionsManagementService } from '../../../../workbench/contrib/sessions/common/sessionsManagement.js';
import { ISession, SessionStatus } from '../../../../workbench/services/sessions/common/session.js';

/** An Agents Window session, as its main chat, for the observed session list; undefined while untitled. */
export function observedInfoOf(s: ISession): IChatSessionObservedInfo | undefined {
	const status = s.status.get();
	if (status === SessionStatus.Untitled) {
		return undefined;
	}
	const resource = s.mainChat.get().resource;
	const { provider, harness } = providerOf(resource, s.providerId);
	const cloud = provider === 'cloud';
	const createdAt = s.createdAt.getTime();
	const branch = s.branch?.get();
	return {
		resource,
		provider,
		...(harness ? { harness } : {}),
		title: s.title.get(),
		status: status === SessionStatus.InProgress ? 'working' : status === SessionStatus.NeedsInput ? 'question' : status === SessionStatus.Error ? 'failed' : 'waiting',
		createdAt,
		lastActivityAt: Math.max(createdAt, s.updatedAt.get().getTime()),
		readState: { isRead: s.isRead.get() },
		archived: s.isArchived.get(),
		...(branch ? { repository: { remoteUrl: '', branch } } : {}),
		capabilities: { steering: !cloud, queueing: !cloud, inputSuggestions: true, questions: !cloud, planReview: !cloud },
		fidelity: NO_FIDELITY,
	};
}

/**
 * The Agents Window lists its sessions through the sessions management service, not the agent
 * sessions model the observer reads, so extensions there would otherwise see none of its older
 * sessions (their related-session context, for one).
 */
class SessionObserverListContribution extends Disposable implements IWorkbenchContribution {
	static readonly ID = 'workbench.contrib.sessionObserverList';

	constructor(
		@IChatSessionObserverService observer: IChatSessionObserverService,
		@ISessionsManagementService sessions: ISessionsManagementService,
	) {
		super();
		this._register(observer.registerSessionList({
			onDidChange: Event.map(sessions.onDidChangeSessions, () => undefined),
			getSessions: () => sessions.getSessions().map(observedInfoOf).filter((i): i is IChatSessionObservedInfo => !!i),
		}));
	}
}

registerWorkbenchContribution2(SessionObserverListContribution.ID, SessionObserverListContribution, WorkbenchPhase.AfterRestored);
