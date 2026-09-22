/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { autorun, derived, IObservable, IReader, IReaderWithStore, ISettableObservable, observableSignalFromEvent, observableValue } from '../../../../base/common/observable.js';
import { onUnexpectedError } from '../../../../base/common/errors.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { renderAsPlaintext } from '../../../../base/browser/markdownRenderer.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { URI } from '../../../../base/common/uri.js';
import { localize } from '../../../../nls.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { ChatAgentLocation } from '../../../../workbench/contrib/chat/common/constants.js';
import { IChatModelReference, IChatService, IChatToolInvocation } from '../../../../workbench/contrib/chat/common/chatService/chatService.js';
import { IChatResponseModel } from '../../../../workbench/contrib/chat/common/model/chatModel.js';
import { ConfirmationOptionKind } from '../../../../platform/agentHost/common/state/protocol/state.js';
import { IGitHubService } from '../../github/browser/githubService.js';
import { computePullRequestIcon, GitHubCIOverallStatus, GitHubPullRequestState, IGitHubPRComment, IGitHubPullRequestReviewThread } from '../../github/common/types.js';
import { ISessionsProvidersService } from '../../../services/sessions/browser/sessionsProvidersService.js';
import { ISessionsManagementService } from '../../../services/sessions/common/sessionsManagement.js';
import { getSessionOwnedGitHubPullRequestRefs, getSessionStatusMessage, IGitHubPullRequestRef, SessionStatus, type ISession } from '../../../services/sessions/common/session.js';
import {
	compareInboxNotificationsByRecency,
	compareInboxNotifications,
	IExternalInboxNotification,
	IInboxNotificationAction,
	IInboxNotificationConfirmationPart,
	IInboxNotificationItem,
	IInboxNotificationNeedsInputPart,
	IInboxNotificationPullRequestState,
	IInboxNotificationQuestionCarouselPart,
	IInboxNotificationToolConfirmationButton,
	IInboxNotificationToolConfirmationPart,
	IInboxNotificationsService,
	InboxNotificationActionKind,
	InboxNotificationKind,
	InboxNotificationPriority,
	InboxNotificationsSortMode,
} from '../common/inboxNotificationsService.js';

const DISMISSED_NOTIFICATION_IDS_STORAGE_KEY = 'sessions.inboxNotifications.dismissedIds';

interface IPullRequestNotificationCandidate {
	readonly ref: IGitHubPullRequestRef;
	readonly timestamp: number;
	readonly identity: string;
	readonly icon: ThemeIcon;
	readonly statusLabel: string;
}

interface INeedsInputPartCandidate {
	readonly startedWaitingAt: number;
	readonly part: IInboxNotificationNeedsInputPart;
}

export class InboxNotificationsService extends Disposable implements IInboxNotificationsService {

	declare readonly _serviceBrand: undefined;

	private readonly _dismissedIds: ISettableObservable<ReadonlySet<string>>;
	private readonly _externalItems: ISettableObservable<readonly IInboxNotificationItem[]>;
	readonly sortMode: ISettableObservable<InboxNotificationsSortMode>;
	private readonly _refreshedPullRequestModels = new WeakSet<object>();
	private readonly _refreshedPullRequestReviewThreadModels = new WeakSet<object>();
	private readonly _refreshedPullRequestCIModels = new WeakSet<object>();
	private readonly _needsInputChatModelRefs = new Map<string, IChatModelReference>();
	private readonly _loadingNeedsInputChatModels = new Set<string>();

	readonly notifications: IObservable<readonly IInboxNotificationItem[]>;

	constructor(
		@ISessionsManagementService private readonly sessionsManagementService: ISessionsManagementService,
		@ISessionsProvidersService private readonly sessionsProvidersService: ISessionsProvidersService,
		@IChatService private readonly chatService: IChatService,
		@IGitHubService private readonly gitHubService: IGitHubService,
		@IStorageService private readonly storageService: IStorageService,
	) {
		super();

		this._dismissedIds = observableValue('sessionsInboxNotificationsDismissed', this.loadDismissedIds());
		this._externalItems = observableValue('sessionsInboxNotificationsExternal', []);
		this.sortMode = observableValue('sessionsInboxNotificationsSortMode', InboxNotificationsSortMode.Priority);

		const sessionsChanged = observableSignalFromEvent(this, this.sessionsManagementService.onDidChangeSessions);
		const providersChanged = observableSignalFromEvent(this, this.sessionsProvidersService.onDidChangeProviders);
		this._register(this.storageService.onDidChangeValue(StorageScope.APPLICATION, DISMISSED_NOTIFICATION_IDS_STORAGE_KEY, this._store)(event => {
			if (!event.external) {
				return;
			}
			this._dismissedIds.set(this.loadDismissedIds(), undefined);
		}));

		this._register(autorun(reader => {
			sessionsChanged.read(reader);
			for (const session of this.sessionsManagementService.getSessions()) {
				this.ensureGitHubModels(session, reader as IReaderWithStore);
			}
		}));
		this._register(toDisposable(() => {
			for (const modelRef of this._needsInputChatModelRefs.values()) {
				modelRef.dispose();
			}
			this._needsInputChatModelRefs.clear();
			this._loadingNeedsInputChatModels.clear();
		}));
		this._register(autorun(reader => {
			sessionsChanged.read(reader);

			const activeNeedsInputChatResources = new Set<string>();
			for (const session of this.sessionsManagementService.getSessions()) {
				if (session.isArchived.read(reader) || session.status.read(reader) !== SessionStatus.NeedsInput) {
					continue;
				}

				for (const chat of session.chats.read(reader)) {
					const chatResourceKey = chat.resource.toString();
					activeNeedsInputChatResources.add(chatResourceKey);
					if (this.chatService.getSession(chat.resource)
						|| this._needsInputChatModelRefs.has(chatResourceKey)
						|| this._loadingNeedsInputChatModels.has(chatResourceKey)) {
						continue;
					}

					this._loadingNeedsInputChatModels.add(chatResourceKey);
					void this.chatService.acquireOrLoadSession(chat.resource, ChatAgentLocation.Chat, CancellationToken.None, 'InboxNotificationsService')
						.then(modelRef => {
							if (!modelRef) {
								return;
							}
							if (!activeNeedsInputChatResources.has(chatResourceKey)) {
								modelRef.dispose();
								return;
							}
							this._needsInputChatModelRefs.set(chatResourceKey, modelRef);
						})
						.catch(onUnexpectedError)
						.finally(() => {
							this._loadingNeedsInputChatModels.delete(chatResourceKey);
						});
				}
			}

			for (const [chatResourceKey, modelRef] of this._needsInputChatModelRefs) {
				if (!activeNeedsInputChatResources.has(chatResourceKey)) {
					modelRef.dispose();
					this._needsInputChatModelRefs.delete(chatResourceKey);
				}
			}
		}));

		this.notifications = derived(this, reader => {
			sessionsChanged.read(reader);
			providersChanged.read(reader);
			this.chatService.chatModels.read(reader);

			const dismissed = this._dismissedIds.read(reader);
			const sortMode = this.sortMode.read(reader);
			const itemsById = new Map<string, IInboxNotificationItem>();

			for (const session of this.sessionsManagementService.getSessions()) {
				this.collectSessionNotifications(itemsById, session, reader as IReaderWithStore);
			}

			for (const item of this._externalItems.read(reader)) {
				itemsById.set(item.id, item);
			}

			return [...itemsById.values()]
				.filter(item => !dismissed.has(item.id))
				.sort(sortMode === InboxNotificationsSortMode.Priority ? compareInboxNotifications : compareInboxNotificationsByRecency);
		});
	}

	setSortMode(sortMode: InboxNotificationsSortMode): void {
		if (this.sortMode.get() === sortMode) {
			return;
		}
		this.sortMode.set(sortMode, undefined);
	}

	publishExternalNotification(notification: IExternalInboxNotification): void {
		const item: IInboxNotificationItem = {
			id: notification.id,
			kind: notification.kind ?? InboxNotificationKind.External,
			priority: notification.priority ?? InboxNotificationPriority.Normal,
			title: notification.title,
			description: notification.description,
			repositoryLabel: notification.repositoryLabel,
			timestamp: notification.timestamp ?? Date.now(),
			sessionResource: notification.sessionResource,
			actions: notification.actions ?? this.dismissActionOnly(),
		};

		const existing = this._externalItems.get();
		const idx = existing.findIndex(candidate => candidate.id === item.id);
		if (idx === -1) {
			this._externalItems.set([...existing, item], undefined);
			return;
		}
		const updated = existing.slice();
		updated[idx] = item;
		this._externalItems.set(updated, undefined);
	}

	removeExternalNotification(id: string): void {
		const existing = this._externalItems.get();
		const filtered = existing.filter(candidate => candidate.id !== id);
		if (filtered.length !== existing.length) {
			this._externalItems.set(filtered, undefined);
		}
	}

	dismissNotification(id: string): void {
		if (this._dismissedIds.get().has(id)) {
			return;
		}
		const next = new Set(this._dismissedIds.get());
		next.add(id);
		this._dismissedIds.set(next, undefined);
		this.persistDismissedIds(next);
	}

	clearDismissedNotifications(): void {
		const next = new Set<string>();
		this._dismissedIds.set(next, undefined);
		this.persistDismissedIds(next);
	}

	private collectSessionNotifications(itemsById: Map<string, IInboxNotificationItem>, session: ISession, reader: IReaderWithStore): void {
		if (session.isArchived.read(reader)) {
			return;
		}

		const status = session.status.read(reader);
		const title = session.title.read(reader);
		const updatedAt = session.updatedAt.read(reader).getTime();
		const repositoryLabel = this.getSessionRepositoryLabel(session, reader);

		if (status === SessionStatus.NeedsInput) {
			const needsInputPart = this.getNeedsInputPart(session, reader);
			const id = `${session.sessionId}:${InboxNotificationKind.NeedsInput}:${updatedAt}`;
			itemsById.set(id, {
				id,
				kind: InboxNotificationKind.NeedsInput,
				priority: InboxNotificationPriority.High,
				title,
				description: needsInputPart ? this.getNeedsInputPartDescription(needsInputPart) : this.getNeedsInputDescription(session, reader),
				repositoryLabel,
				needsInputPart,
				timestamp: updatedAt,
				sessionResource: session.resource,
				actions: this.sessionActions(true),
			});
		}

		if (status === SessionStatus.Completed && !session.isRead.read(reader)) {
			const id = `${session.sessionId}:completed:${updatedAt}`;
			itemsById.set(id, {
				id,
				kind: InboxNotificationKind.Completed,
				priority: InboxNotificationPriority.Low,
				title: localize('inboxNotifications.completed.title', "Completed: {0}", title),
				description: localize('inboxNotifications.completed.description', "Review this completed session or mark it done."),
				repositoryLabel,
				timestamp: updatedAt,
				sessionResource: session.resource,
				actions: this.sessionActions(true),
			});
		}

		if (status !== SessionStatus.InProgress) {
			this.collectPullRequestNotifications(itemsById, session, title, updatedAt, reader);
		}
	}

	private ensureGitHubModels(session: ISession, reader: IReaderWithStore): void {
		if (session.isArchived.read(reader)) {
			return;
		}

		for (const pullRequestRef of this.getSessionPullRequestRefs(session, reader)) {
			const pullRequestModelRef = reader.delayedStore.add(this.gitHubService.createPullRequestModelReference(
				pullRequestRef.owner,
				pullRequestRef.repo,
				pullRequestRef.number,
			));
			if (!this._refreshedPullRequestModels.has(pullRequestModelRef.object)) {
				this._refreshedPullRequestModels.add(pullRequestModelRef.object);
				void pullRequestModelRef.object.refresh();
			}
			reader.delayedStore.add(pullRequestModelRef.object.startPolling());

			const pullRequest = pullRequestModelRef.object.pullRequest.read(reader);
			const effectiveState = pullRequest?.state ?? pullRequestRef.liveState ?? pullRequestRef.state;
			if (effectiveState !== GitHubPullRequestState.Open || pullRequest?.isDraft) {
				continue;
			}

			const reviewThreadsModelRef = reader.delayedStore.add(this.gitHubService.createPullRequestReviewThreadsModelReference(
				pullRequestRef.owner,
				pullRequestRef.repo,
				pullRequestRef.number,
			));
			if (!this._refreshedPullRequestReviewThreadModels.has(reviewThreadsModelRef.object)) {
				this._refreshedPullRequestReviewThreadModels.add(reviewThreadsModelRef.object);
				void reviewThreadsModelRef.object.refresh();
			}
			reader.delayedStore.add(reviewThreadsModelRef.object.startPolling());

			const headSha = pullRequest?.headSha;
			if (!headSha) {
				continue;
			}

			const ciModelRef = reader.delayedStore.add(this.gitHubService.createPullRequestCIModelReference(
				pullRequestRef.owner,
				pullRequestRef.repo,
				pullRequestRef.number,
				headSha,
			));
			if (!this._refreshedPullRequestCIModels.has(ciModelRef.object)) {
				this._refreshedPullRequestCIModels.add(ciModelRef.object);
				void ciModelRef.object.refresh();
			}
			reader.delayedStore.add(ciModelRef.object.startPolling());
		}
	}

	private collectPullRequestNotifications(
		itemsById: Map<string, IInboxNotificationItem>,
		session: ISession,
		sessionTitle: string,
		sessionUpdatedAt: number,
		reader: IReaderWithStore,
	): void {
		const failingCandidates: IPullRequestNotificationCandidate[] = [];
		const passingCandidates: IPullRequestNotificationCandidate[] = [];
		const reviewCommentCandidates: IPullRequestNotificationCandidate[] = [];

		for (const pullRequestRef of this.getSessionPullRequestRefs(session, reader)) {
			const pullRequestModelRef = reader.delayedStore.add(this.gitHubService.createPullRequestModelReference(
				pullRequestRef.owner,
				pullRequestRef.repo,
				pullRequestRef.number,
			));
			const pullRequest = pullRequestModelRef.object.pullRequest.read(reader);
			const effectiveState = pullRequest?.state ?? pullRequestRef.liveState ?? pullRequestRef.state;
			if (effectiveState !== GitHubPullRequestState.Open || pullRequest?.isDraft) {
				continue;
			}

			const reviewThreadsModelRef = reader.delayedStore.add(this.gitHubService.createPullRequestReviewThreadsModelReference(
				pullRequestRef.owner,
				pullRequestRef.repo,
				pullRequestRef.number,
			));
			const reviewThreads = reviewThreadsModelRef.object.reviewThreads.read(reader);
			const unresolvedReviewThreads = reviewThreads.filter(thread => !thread.isResolved);
			const unresolvedCopilotThreads = unresolvedReviewThreads.filter(thread => hasCopilotReviewComment(thread.comments));

			let ciStatus: GitHubCIOverallStatus | undefined;
			let ciTimestamp = sessionUpdatedAt;
			const headSha = pullRequest?.headSha;
			if (headSha) {
				const ciModelRef = reader.delayedStore.add(this.gitHubService.createPullRequestCIModelReference(
					pullRequestRef.owner,
					pullRequestRef.repo,
					pullRequestRef.number,
					headSha,
				));
				ciStatus = ciModelRef.object.overallStatus.read(reader);
				ciTimestamp = latestCITimestamp(ciModelRef.object.checks.read(reader), sessionUpdatedAt);
			}

			const pullRequestIcon = computePullRequestIcon(
				pullRequest?.isDraft ? 'draft' : effectiveState,
				{
					hasFailingChecks: ciStatus === GitHubCIOverallStatus.Failure,
					hasUnresolvedComments: unresolvedReviewThreads.length > 0,
				},
			);
			const candidateBase = {
				ref: pullRequestRef,
				icon: pullRequestIcon,
				statusLabel: getPullRequestStatusLabel(pullRequestIcon),
			};

			if (ciStatus === GitHubCIOverallStatus.Failure) {
				failingCandidates.push({
					...candidateBase,
					timestamp: ciTimestamp,
					identity: headSha ?? String(ciTimestamp),
				});
			} else if (ciStatus === GitHubCIOverallStatus.Success) {
				passingCandidates.push({
					...candidateBase,
					timestamp: ciTimestamp,
					identity: headSha ?? String(ciTimestamp),
				});
			}

			if (unresolvedCopilotThreads.length > 0) {
				const reviewCommentsTimestamp = latestReviewCommentsTimestamp(unresolvedCopilotThreads, sessionUpdatedAt);
				reviewCommentCandidates.push({
					...candidateBase,
					timestamp: reviewCommentsTimestamp,
					identity: String(reviewCommentsTimestamp),
				});
			}
		}

		this.createPullRequestNotification(itemsById, session, sessionTitle, InboxNotificationKind.FailingCI, failingCandidates);
		this.createPullRequestNotification(itemsById, session, sessionTitle, InboxNotificationKind.PassingCI, passingCandidates);
		this.createPullRequestNotification(itemsById, session, sessionTitle, InboxNotificationKind.ReviewComments, reviewCommentCandidates);
	}

	private createPullRequestNotification(
		itemsById: Map<string, IInboxNotificationItem>,
		session: ISession,
		sessionTitle: string,
		kind: InboxNotificationKind.FailingCI | InboxNotificationKind.PassingCI | InboxNotificationKind.ReviewComments,
		candidates: readonly IPullRequestNotificationCandidate[],
	): void {
		if (candidates.length === 0) {
			return;
		}

		const repositoryLabels = [...new Set(candidates.map(candidate => `${candidate.ref.owner}/${candidate.ref.repo}`))];
		const repositoryLabel = repositoryLabels.length === 1
			? repositoryLabels[0]
			: localize('inboxNotifications.repository.multiple', "{0} +{1}", repositoryLabels[0], repositoryLabels.length - 1);
		const pullRequestStates = toPullRequestStates(candidates);
		const pullRequestCount = pullRequestStates.length;
		const singularPullRequestLabel = pullRequestStates[0]?.label ?? localize('inboxNotifications.pullRequestLabel.default', "pull request");
		const idSuffix = candidates
			.map(candidate => `${candidate.ref.owner}/${candidate.ref.repo}#${candidate.ref.number}:${candidate.identity}`)
			.sort()
			.join(',');
		const timestamp = Math.max(...candidates.map(candidate => candidate.timestamp));

		switch (kind) {
			case InboxNotificationKind.FailingCI:
				itemsById.set(`${session.sessionId}:${kind}:${idSuffix}`, {
					id: `${session.sessionId}:${kind}:${idSuffix}`,
					kind,
					priority: InboxNotificationPriority.High,
					title: pullRequestCount === 1
						? localize('inboxNotifications.failingCi.title.single', "CI Failing on {0}", singularPullRequestLabel)
						: localize('inboxNotifications.failingCi.title.multiple', "CI Failing on {0} Pull Requests", pullRequestCount),
					description: pullRequestCount === 1
						? localize('inboxNotifications.failingCi.description.single', "Required checks are failing for {0}. Open {1} to investigate and fix the failures.", singularPullRequestLabel, sessionTitle)
						: localize('inboxNotifications.failingCi.description.multiple', "Required checks are failing for {0} pull requests. Open {1} to investigate and fix the failures.", pullRequestCount, sessionTitle),
					repositoryLabel,
					pullRequestStates,
					timestamp,
					sessionResource: session.resource,
					actions: this.pullRequestActions(session, kind),
				});
				return;
			case InboxNotificationKind.PassingCI:
				itemsById.set(`${session.sessionId}:${kind}:${idSuffix}`, {
					id: `${session.sessionId}:${kind}:${idSuffix}`,
					kind,
					priority: InboxNotificationPriority.Normal,
					title: pullRequestCount === 1
						? localize('inboxNotifications.passingCi.title.single', "CI Passing on {0}", singularPullRequestLabel)
						: localize('inboxNotifications.passingCi.title.multiple', "CI Passing on {0} Pull Requests", pullRequestCount),
					description: pullRequestCount === 1
						? localize('inboxNotifications.passingCi.description.single', "All required checks are passing for {0}. Open {1} to review merge readiness.", singularPullRequestLabel, sessionTitle)
						: localize('inboxNotifications.passingCi.description.multiple', "All required checks are passing for {0} pull requests. Open {1} to review merge readiness.", pullRequestCount, sessionTitle),
					repositoryLabel,
					pullRequestStates,
					timestamp,
					sessionResource: session.resource,
					actions: this.pullRequestActions(session, kind),
				});
				return;
			case InboxNotificationKind.ReviewComments:
				itemsById.set(`${session.sessionId}:${kind}:${idSuffix}`, {
					id: `${session.sessionId}:${kind}:${idSuffix}`,
					kind,
					priority: InboxNotificationPriority.High,
					title: pullRequestCount === 1
						? localize('inboxNotifications.reviewComments.title.single', "Copilot Comments on {0}", singularPullRequestLabel)
						: localize('inboxNotifications.reviewComments.title.multiple', "Copilot Comments on {0} Pull Requests", pullRequestCount),
					description: pullRequestCount === 1
						? localize('inboxNotifications.reviewComments.description.single', "{0} has unresolved Copilot review comments. Open the session to address feedback.", singularPullRequestLabel)
						: localize('inboxNotifications.reviewComments.description.multiple', "{0} pull requests have unresolved Copilot review comments. Open the session to address feedback.", pullRequestCount),
					repositoryLabel,
					pullRequestStates,
					timestamp,
					sessionResource: session.resource,
					actions: this.pullRequestActions(session, kind),
				});
				return;
		}
	}

	private pullRequestActions(_session: ISession, kind: InboxNotificationKind): readonly IInboxNotificationAction[] {
		const agentMergeAction = this.agentMergeActionForNotificationKind(kind);
		return this.sessionActions(true, agentMergeAction ? [agentMergeAction] : undefined);
	}

	private agentMergeActionForNotificationKind(kind: InboxNotificationKind): IInboxNotificationAction | undefined {
		switch (kind) {
			case InboxNotificationKind.FailingCI:
				return {
					id: 'agent-merge-fix-ci',
					label: localize('inboxNotifications.action.agentMergeFixCI', "Fix CI Failures"),
					kind: InboxNotificationActionKind.AgentMergeFixCI,
				};
			case InboxNotificationKind.ReviewComments:
				return {
					id: 'agent-merge-address-reviews',
					label: localize('inboxNotifications.action.agentMergeAddressReviews', "Address Reviews"),
					kind: InboxNotificationActionKind.AgentMergeAddressReviews,
				};
			case InboxNotificationKind.PassingCI:
				return {
					id: 'agent-merge-merge-pull-request',
					label: localize('inboxNotifications.action.agentMergeMergePullRequest', "Merge Pull Request"),
					kind: InboxNotificationActionKind.AgentMergeMergePullRequest,
				};
			default:
				return undefined;
		}
	}

	private getSessionPullRequestRefs(session: ISession, reader: IReader): readonly IGitHubPullRequestRef[] {
		const workspace = session.workspace.read(reader);
		if (!workspace) {
			return [];
		}

		const pullRequestRefs: IGitHubPullRequestRef[] = [];
		const seen = new Set<string>();
		for (const folder of workspace.folders) {
			for (const pullRequest of getSessionOwnedGitHubPullRequestRefs(folder.gitRepository?.gitHubInfo.read(reader))) {
				const key = `${pullRequest.owner}/${pullRequest.repo}#${pullRequest.number}`;
				if (seen.has(key)) {
					continue;
				}
				seen.add(key);
				pullRequestRefs.push(pullRequest);
			}
		}

		return pullRequestRefs;
	}

	private sessionActions(includeOpen: boolean, additionalActions?: readonly IInboxNotificationAction[]): readonly IInboxNotificationAction[] {
		const actions: IInboxNotificationAction[] = [];
		if (includeOpen) {
			actions.push({
				id: 'open-session',
				label: localize('inboxNotifications.action.open', "Open Session"),
				kind: InboxNotificationActionKind.OpenSession,
				primary: true,
			});
		}
		if (additionalActions?.length) {
			actions.push(...additionalActions);
		}
		actions.push({
			id: 'mark-done',
			label: '$(check)',
			ariaLabel: localize('inboxNotifications.action.markDone', "Done"),
			kind: InboxNotificationActionKind.MarkDone,
		});
		return actions;
	}

	private dismissActionOnly(): readonly IInboxNotificationAction[] {
		return [{
			id: 'mark-done',
			label: '$(check)',
			ariaLabel: localize('inboxNotifications.action.markDone', "Done"),
			kind: InboxNotificationActionKind.MarkDone,
		}];
	}

	private getNeedsInputPart(session: ISession, reader: IReaderWithStore): IInboxNotificationNeedsInputPart | undefined {
		let bestCandidate: INeedsInputPartCandidate | undefined;
		for (const chat of session.chats.read(reader)) {
			const chatModel = this.chatService.getSession(chat.resource);
			if (!chatModel) {
				continue;
			}

			for (const request of chatModel.getRequests().toReversed()) {
				const response = request.response;
				if (!response
					|| response.isCanceled
					|| request.isHiddenFromTranscript
					|| (request.shouldBeRemovedOnSend && !request.shouldBeRemovedOnSend.afterUndoStop)) {
					continue;
				}

				const pendingConfirmation = response.isPendingConfirmation.read(reader);
				if (!pendingConfirmation) {
					continue;
				}

				const needsInputPart = this.getNeedsInputPartFromResponse(response, chat.resource);
				if (!needsInputPart) {
					continue;
				}

				const candidate: INeedsInputPartCandidate = {
					startedWaitingAt: pendingConfirmation.startedWaitingAt,
					part: needsInputPart,
				};
				if (!bestCandidate || candidate.startedWaitingAt < bestCandidate.startedWaitingAt) {
					bestCandidate = candidate;
				}
				break;
			}
		}

		return bestCandidate?.part;
	}

	private getNeedsInputPartFromResponse(response: IChatResponseModel, chatResource: URI): IInboxNotificationNeedsInputPart | undefined {
		for (const part of response.response.value) {
			if (part.kind === 'confirmation' && !part.isUsed) {
				const confirmationPart: IInboxNotificationConfirmationPart = {
					kind: 'confirmation',
					chatResource,
					requestId: response.requestId,
					title: part.title,
					message: part.message,
					buttons: part.buttons,
					data: part.data,
				};
				return confirmationPart;
			}
		}

		for (const part of response.response.value) {
			if (part.kind === 'questionCarousel' && !part.isUsed) {
				if (!part.questions.length) {
					continue;
				}
				const questionPart: IInboxNotificationQuestionCarouselPart = {
					kind: 'questionCarousel',
					chatResource,
					requestId: response.requestId,
					resolveId: part.resolveId,
					allowSkip: part.allowSkip,
					message: part.message,
					questions: part.questions,
				};
				return questionPart;
			}

			if (part.kind !== 'toolInvocation') {
				continue;
			}
			const state = part.state.get();
			if (state.type !== IChatToolInvocation.StateKind.WaitingForConfirmation
				&& state.type !== IChatToolInvocation.StateKind.WaitingForPostApproval) {
				continue;
			}

			const title = state.type === IChatToolInvocation.StateKind.WaitingForConfirmation
				? state.confirmationMessages?.title ?? localize('inboxNotifications.toolConfirmation.title.default', "Approve Tool Run")
				: localize('inboxNotifications.toolConfirmation.title.postApproval', "Review Tool Results");
			const message = state.type === IChatToolInvocation.StateKind.WaitingForConfirmation
				? state.confirmationMessages?.message ?? localize('inboxNotifications.toolConfirmation.message.default', "Review this tool request before continuing.")
				: localize('inboxNotifications.toolConfirmation.message.postApproval', "Review the tool output and decide whether to continue.");
			const toolConfirmationPart: IInboxNotificationToolConfirmationPart = {
				kind: 'toolConfirmation',
				chatResource,
				requestId: response.requestId,
				toolCallId: part.toolCallId,
				title,
				message,
				buttons: this.getToolConfirmationButtons(state),
			};
			return toolConfirmationPart;
		}

		return undefined;
	}

	private getToolConfirmationButtons(
		state: IChatToolInvocation.State
	): readonly IInboxNotificationToolConfirmationButton[] {
		const customOptions = state.type === IChatToolInvocation.StateKind.WaitingForConfirmation
			? state.confirmationMessages?.customOptions
			: undefined;
		if (customOptions?.length) {
			return customOptions.map(option => ({
				label: option.label,
				id: option.id,
				kind: option.kind === ConfirmationOptionKind.Deny ? 'deny' : 'approve',
				useUserActionReason: true,
			}));
		}

		const primaryLabel = state.type === IChatToolInvocation.StateKind.WaitingForConfirmation && state.confirmationMessages?.confirmResults
			? localize('inboxNotifications.toolConfirmation.allowReview', "Allow and Review Once")
			: localize('inboxNotifications.toolConfirmation.allow', "Allow Once");
		return [
			{ label: primaryLabel, kind: 'approve', useUserActionReason: true },
			{ label: localize('inboxNotifications.toolConfirmation.skip', "Skip"), kind: 'deny', useUserActionReason: false },
		];
	}

	private getNeedsInputPartDescription(part: IInboxNotificationNeedsInputPart): string {
		if (part.kind === 'questionCarousel') {
			return localize('inboxNotifications.needsInput.description.questionCarousel', "Answer the pending questions below.");
		}
		if (part.kind === 'toolConfirmation') {
			return localize('inboxNotifications.needsInput.description.toolConfirmation', "Review and approve the pending tool request below.");
		}
		return localize('inboxNotifications.needsInput.description.confirmation', "Review the confirmation request below.");
	}

	private getNeedsInputDescription(session: ISession, reader: IReader): string {
		const message = getSessionStatusMessage(SessionStatus.NeedsInput, session.description.read(reader));
		if (typeof message === 'string') {
			return message;
		}
		const text = message ? renderAsPlaintext(message).trim() : '';
		return text || localize('inboxNotifications.needsInput.descriptionFallback', "Input needed.");
	}

	private getSessionRepositoryLabel(session: ISession, reader: IReader): string | undefined {
		const labels = new Set<string>();
		for (const pullRequestRef of this.getSessionPullRequestRefs(session, reader)) {
			labels.add(`${pullRequestRef.owner}/${pullRequestRef.repo}`);
		}

		const workspace = session.workspace.read(reader);
		if (labels.size === 0 && workspace) {
			for (const folder of workspace.folders) {
				const gitHubInfo = folder.gitRepository?.gitHubInfo.read(reader);
				if (gitHubInfo?.owner && gitHubInfo.repo) {
					labels.add(`${gitHubInfo.owner}/${gitHubInfo.repo}`);
				}
			}
		}

		if (labels.size === 0) {
			return undefined;
		}
		const allLabels = [...labels];
		if (allLabels.length === 1) {
			return allLabels[0];
		}
		return localize('inboxNotifications.repository.multiple', "{0} +{1}", allLabels[0], allLabels.length - 1);
	}

	private loadDismissedIds(): ReadonlySet<string> {
		try {
			const raw = this.storageService.get(DISMISSED_NOTIFICATION_IDS_STORAGE_KEY, StorageScope.APPLICATION);
			const parsed = raw ? JSON.parse(raw) : [];
			return new Set(Array.isArray(parsed) ? parsed.filter((entry): entry is string => typeof entry === 'string') : []);
		} catch (error) {
			onUnexpectedError(error);
			return new Set();
		}
	}

	private persistDismissedIds(ids: ReadonlySet<string>): void {
		this.storageService.store(
			DISMISSED_NOTIFICATION_IDS_STORAGE_KEY,
			JSON.stringify([...ids]),
			StorageScope.APPLICATION,
			StorageTarget.USER,
		);
	}
}

function toPullRequestStates(candidates: readonly IPullRequestNotificationCandidate[]): readonly IInboxNotificationPullRequestState[] {
	const singleRepository = new Set(candidates.map(candidate => `${candidate.ref.owner}/${candidate.ref.repo}`)).size === 1;
	return [...candidates]
		.sort((a, b) => {
			const repoA = `${a.ref.owner}/${a.ref.repo}`;
			const repoB = `${b.ref.owner}/${b.ref.repo}`;
			return repoA.localeCompare(repoB) || a.ref.number - b.ref.number;
		})
		.map(candidate => {
			const repositoryLabel = `${candidate.ref.owner}/${candidate.ref.repo}`;
			return {
				repositoryLabel,
				label: singleRepository ? `#${candidate.ref.number}` : `${repositoryLabel}#${candidate.ref.number}`,
				pullRequestUri: candidate.ref.uri,
				icon: candidate.icon,
				statusLabel: candidate.statusLabel,
			};
		});
}

function getPullRequestStatusLabel(icon: ThemeIcon): string {
	switch (icon.id) {
		case Codicon.gitPullRequestError.id:
			return localize('inboxNotifications.pullRequestStatus.checksFailed', "Checks failed");
		case Codicon.gitPullRequestComment.id:
			return localize('inboxNotifications.pullRequestStatus.unresolvedComments', "Unresolved comments");
		case Codicon.gitPullRequestDraft.id:
			return localize('inboxNotifications.pullRequestStatus.draft', "Draft");
		case Codicon.gitPullRequestDone.id:
			return localize('inboxNotifications.pullRequestStatus.merged', "Merged");
		case Codicon.gitPullRequestClosed.id:
			return localize('inboxNotifications.pullRequestStatus.closed', "Closed");
		case Codicon.gitPullRequest.id:
		default:
			return localize('inboxNotifications.pullRequestStatus.open', "Open");
	}
}

function latestCITimestamp(checks: readonly { readonly startedAt?: string; readonly completedAt?: string }[], fallbackTimestamp: number): number {
	let latest = fallbackTimestamp;
	for (const check of checks) {
		latest = Math.max(latest, parseTimestamp(check.completedAt) ?? parseTimestamp(check.startedAt) ?? fallbackTimestamp);
	}
	return latest;
}

function latestReviewCommentsTimestamp(threads: readonly IGitHubPullRequestReviewThread[], fallbackTimestamp: number): number {
	let latest = fallbackTimestamp;
	for (const thread of threads) {
		for (const comment of thread.comments) {
			latest = Math.max(latest, parseTimestamp(comment.updatedAt) ?? parseTimestamp(comment.createdAt) ?? fallbackTimestamp);
		}
	}
	return latest;
}

function hasCopilotReviewComment(comments: readonly IGitHubPRComment[]): boolean {
	return comments.some(comment => isCopilotAuthor(comment.author.login));
}

function isCopilotAuthor(author: string | undefined): boolean {
	return !!author && author.toLowerCase().includes('copilot');
}

function parseTimestamp(value: string | undefined): number | undefined {
	if (!value) {
		return undefined;
	}
	const parsed = Date.parse(value);
	return Number.isFinite(parsed) ? parsed : undefined;
}
