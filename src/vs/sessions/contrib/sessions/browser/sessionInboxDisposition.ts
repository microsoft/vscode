/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { toErrorMessage } from '../../../../base/common/errorMessage.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { autorun, IReader, observableSignalFromEvent } from '../../../../base/common/observable.js';
import { localize } from '../../../../nls.js';
import { INotificationService } from '../../../../platform/notification/common/notification.js';
import { IChatService } from '../../../../workbench/contrib/chat/common/chatService/chatService.js';
import { ChatQuestionCarouselData } from '../../../../workbench/contrib/chat/common/model/chatProgressTypes/chatQuestionCarouselData.js';
import { IWorkbenchContribution } from '../../../../workbench/common/contributions.js';
import { ISessionsListModelService, ISessionInboxDispositionState, SessionInboxDisposition } from '../../../services/sessions/browser/sessionsListModelService.js';
import { ISession } from '../../../services/sessions/common/session.js';
import { ISessionsManagementService } from '../../../services/sessions/common/sessionsManagement.js';
import { getSessionOwnedPullRequests } from '../../github/common/sessionGitHubReferences.js';
import { getPullRequestKey } from '../../github/common/utils.js';

export const enum ReadyToMergeTransition {
	None,
	MoveToInbox,
	MarkDone,
}

export interface IReadyToMergeLifecycleSnapshot {
	readonly isArchived: boolean;
	readonly hasPendingQuestion: boolean;
	readonly pullRequests: readonly {
		readonly key: string;
		readonly state: 'open' | 'closed' | 'merged' | undefined;
	}[] | undefined;
}

export function getReadyToMergeTransition(state: ISessionInboxDispositionState, snapshot: IReadyToMergeLifecycleSnapshot): ReadyToMergeTransition {
	if (snapshot.isArchived || snapshot.hasPendingQuestion) {
		return ReadyToMergeTransition.MoveToInbox;
	}
	const trackedKeys = state.pullRequestKeys;
	if (!snapshot.pullRequests?.length || !trackedKeys?.length) {
		return ReadyToMergeTransition.None;
	}
	const currentByKey = new Map(snapshot.pullRequests.map(pullRequest => [pullRequest.key, pullRequest.state]));
	if (trackedKeys.every(key => currentByKey.get(key) === 'merged')) {
		return ReadyToMergeTransition.MarkDone;
	}
	return ReadyToMergeTransition.None;
}

export function hasPendingSessionQuestion(session: ISession, chatService: IChatService, reader: IReader | undefined): boolean {
	const chats = [session.mainChat.read(reader), ...session.chats.read(reader)];
	const seen = new Set<string>();
	for (const chat of chats) {
		const key = chat.resource.toString();
		if (seen.has(key)) {
			continue;
		}
		seen.add(key);
		const model = chatService.getSession(chat.resource);
		for (const request of model?.getRequests() ?? []) {
			if (request.response?.response.value.some(part => part instanceof ChatQuestionCarouselData && !part.isUsed)) {
				return true;
			}
		}
	}
	return false;
}

export class SessionInboxDispositionContribution extends Disposable implements IWorkbenchContribution {
	static readonly ID = 'sessions.contrib.sessionInboxDisposition';

	private readonly archivingSessionIds = new Set<string>();

	constructor(
		@ISessionsListModelService private readonly sessionsListModelService: ISessionsListModelService,
		@ISessionsManagementService private readonly sessionsManagementService: ISessionsManagementService,
		@INotificationService private readonly notificationService: INotificationService,
		@IChatService private readonly chatService: IChatService,
	) {
		super();

		const sessionsChanged = observableSignalFromEvent(this, this.sessionsManagementService.onDidChangeSessions);
		const listModelChanged = observableSignalFromEvent(this, this.sessionsListModelService.onDidChange);
		this._register(autorun(reader => {
			sessionsChanged.read(reader);
			listModelChanged.read(reader);
			this.chatService.chatModels.read(reader);
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
				session.status.read(reader);
				const pullRequests = getSessionOwnedPullRequests(session, reader);
				const transition = getReadyToMergeTransition(state, {
					isArchived,
					hasPendingQuestion: hasPendingSessionQuestion(session, this.chatService, reader),
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
			this.notificationService.error(localize('readyToMergeArchiveFailed', "Failed to mark the merged session as done: {0}", toErrorMessage(error)));
		} finally {
			this.archivingSessionIds.delete(session.sessionId);
		}
	}
}
