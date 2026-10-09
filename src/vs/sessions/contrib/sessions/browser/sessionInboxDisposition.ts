/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { toErrorMessage } from '../../../../base/common/errorMessage.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { autorun, observableSignalFromEvent } from '../../../../base/common/observable.js';
import { localize } from '../../../../nls.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { INotificationService } from '../../../../platform/notification/common/notification.js';
import { IWorkbenchContribution } from '../../../../workbench/common/contributions.js';
import { ISessionsListModelService, ISessionInboxDispositionState, SessionInboxDisposition } from '../../../services/sessions/browser/sessionsListModelService.js';
import { ISession, SessionStatus } from '../../../services/sessions/common/session.js';
import { ISessionsManagementService } from '../../../services/sessions/common/sessionsManagement.js';
import { BlockedSessions } from '../../blockedSessions/browser/blockedSessions.js';
import { getSessionOwnedPullRequests } from '../../github/common/sessionGitHubReferences.js';
import { getPullRequestKey } from '../../github/common/utils.js';

export const enum ReadyToMergeTransition {
	None,
	MoveToInbox,
	MarkDone,
}

export interface IReadyToMergeLifecycleSnapshot {
	readonly isArchived: boolean;
	readonly status: SessionStatus;
	readonly updatedAt: number;
	readonly hasFailingCI: boolean;
	readonly pullRequests: readonly {
		readonly key: string;
		readonly state: 'open' | 'closed' | 'merged' | undefined;
	}[] | undefined;
}

export function getReadyToMergeTransition(state: ISessionInboxDispositionState, snapshot: IReadyToMergeLifecycleSnapshot): ReadyToMergeTransition {
	if (
		snapshot.isArchived
		|| snapshot.status !== SessionStatus.Completed
		|| snapshot.hasFailingCI
	) {
		return ReadyToMergeTransition.MoveToInbox;
	}
	const trackedKeys = state.pullRequestKeys;
	if (!snapshot.pullRequests?.length || !trackedKeys?.length) {
		return ReadyToMergeTransition.MoveToInbox;
	}
	const currentKeys = snapshot.pullRequests.map(pullRequest => pullRequest.key).sort();
	if (currentKeys.length !== trackedKeys.length || currentKeys.some((key, index) => key !== trackedKeys[index])) {
		return ReadyToMergeTransition.MoveToInbox;
	}
	if (snapshot.pullRequests.some(pullRequest => pullRequest.state === 'closed')) {
		return ReadyToMergeTransition.MoveToInbox;
	}
	if (snapshot.pullRequests.every(pullRequest => pullRequest.state === 'merged')) {
		return ReadyToMergeTransition.MarkDone;
	}
	return snapshot.updatedAt > state.updatedAt ? ReadyToMergeTransition.MoveToInbox : ReadyToMergeTransition.None;
}

export class SessionInboxDispositionContribution extends Disposable implements IWorkbenchContribution {
	static readonly ID = 'sessions.contrib.sessionInboxDisposition';

	private readonly archivingSessionIds = new Set<string>();

	constructor(
		@ISessionsListModelService private readonly sessionsListModelService: ISessionsListModelService,
		@ISessionsManagementService private readonly sessionsManagementService: ISessionsManagementService,
		@INotificationService private readonly notificationService: INotificationService,
		@IInstantiationService instantiationService: IInstantiationService,
	) {
		super();

		const blockedSessions = this._register(instantiationService.createInstance(BlockedSessions));
		const sessionsChanged = observableSignalFromEvent(this, this.sessionsManagementService.onDidChangeSessions);
		const listModelChanged = observableSignalFromEvent(this, this.sessionsListModelService.onDidChange);
		this._register(autorun(reader => {
			sessionsChanged.read(reader);
			listModelChanged.read(reader);
			const failingCISessionIds = new Set(blockedSessions.failingCISessions.read(reader).map(session => session.sessionId));
			for (const session of this.sessionsManagementService.getSessions()) {
				const state = this.sessionsListModelService.getSessionInboxDispositionState(session);
				if (!state) {
					continue;
				}
				const isArchived = session.isArchived.read(reader);
				if (isArchived) {
					this.sessionsListModelService.clearSessionInboxDisposition(session);
					continue;
				}
				if (state.disposition !== SessionInboxDisposition.ReadyToMerge) {
					continue;
				}
				const pullRequests = getSessionOwnedPullRequests(session, reader);
				const transition = getReadyToMergeTransition(state, {
					isArchived,
					status: session.status.read(reader),
					updatedAt: session.updatedAt.read(reader).getTime(),
					hasFailingCI: failingCISessionIds.has(session.sessionId),
					pullRequests: pullRequests?.map(ref => ({
						key: getPullRequestKey(ref.owner, ref.repo, ref.number),
						state: ref.liveState ?? ref.state,
					})),
				});
				if (transition === ReadyToMergeTransition.MoveToInbox) {
					this.sessionsListModelService.clearSessionInboxDisposition(session);
				} else if (transition === ReadyToMergeTransition.MarkDone) {
					void this.archiveSession(session);
				}
			}
		}));
	}

	private async archiveSession(session: ISession): Promise<void> {
		if (this.archivingSessionIds.has(session.sessionId)) {
			return;
		}
		this.archivingSessionIds.add(session.sessionId);
		try {
			await this.sessionsManagementService.archiveSession(session);
			this.sessionsListModelService.clearSessionInboxDisposition(session);
		} catch (error) {
			this.sessionsListModelService.clearSessionInboxDisposition(session);
			this.notificationService.error(localize('readyToMergeArchiveFailed', "Failed to mark the merged session as done: {0}", toErrorMessage(error)));
		} finally {
			this.archivingSessionIds.delete(session.sessionId);
		}
	}
}
