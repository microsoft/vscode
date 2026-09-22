/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { autorun, derived, IObservable, IReader, IReaderWithStore, ISettableObservable, observableSignalFromEvent, observableValue } from '../../../../base/common/observable.js';
import { onUnexpectedError } from '../../../../base/common/errors.js';
import { localize } from '../../../../nls.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { IGitHubService } from '../../github/browser/githubService.js';
import { GitHubCIOverallStatus, GitHubPullRequestState, IGitHubPRComment, IGitHubPullRequestReviewThread } from '../../github/common/types.js';
import { ISessionsProvidersService } from '../../../services/sessions/browser/sessionsProvidersService.js';
import { ISessionsManagementService } from '../../../services/sessions/common/sessionsManagement.js';
import { getSessionOwnedGitHubPullRequestRefs, IGitHubPullRequestRef, SessionStatus, type ISession } from '../../../services/sessions/common/session.js';
import {
	compareInboxNotifications,
	IExternalInboxNotification,
	IInboxNotificationAction,
	IInboxNotificationItem,
	IInboxNotificationsService,
	InboxNotificationActionKind,
	InboxNotificationKind,
	InboxNotificationPriority,
} from '../common/inboxNotificationsService.js';

const DISMISSED_NOTIFICATION_IDS_STORAGE_KEY = 'sessions.inboxNotifications.dismissedIds';

export class InboxNotificationsService extends Disposable implements IInboxNotificationsService {

	declare readonly _serviceBrand: undefined;

	private readonly _dismissedIds: ISettableObservable<ReadonlySet<string>>;
	private readonly _externalItems: ISettableObservable<readonly IInboxNotificationItem[]>;
	private readonly _refreshedPullRequestModels = new WeakSet<object>();
	private readonly _refreshedPullRequestReviewThreadModels = new WeakSet<object>();
	private readonly _refreshedPullRequestCIModels = new WeakSet<object>();

	readonly notifications: IObservable<readonly IInboxNotificationItem[]>;

	constructor(
		@ISessionsManagementService private readonly sessionsManagementService: ISessionsManagementService,
		@ISessionsProvidersService private readonly sessionsProvidersService: ISessionsProvidersService,
		@IGitHubService private readonly gitHubService: IGitHubService,
		@IStorageService private readonly storageService: IStorageService,
	) {
		super();

		this._dismissedIds = observableValue('sessionsInboxNotificationsDismissed', this.loadDismissedIds());
		this._externalItems = observableValue('sessionsInboxNotificationsExternal', []);

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

		this.notifications = derived(this, reader => {
			sessionsChanged.read(reader);
			providersChanged.read(reader);

			const dismissed = this._dismissedIds.read(reader);
			const itemsById = new Map<string, IInboxNotificationItem>();

			for (const session of this.sessionsManagementService.getSessions()) {
				this.collectSessionNotifications(itemsById, session, reader as IReaderWithStore);
			}

			for (const item of this._externalItems.read(reader)) {
				itemsById.set(item.id, item);
			}

			return [...itemsById.values()]
				.filter(item => !dismissed.has(item.id))
				.sort(compareInboxNotifications);
		});
	}

	publishExternalNotification(notification: IExternalInboxNotification): void {
		const item: IInboxNotificationItem = {
			id: notification.id,
			kind: notification.kind ?? InboxNotificationKind.External,
			priority: notification.priority ?? InboxNotificationPriority.Normal,
			title: notification.title,
			description: notification.description,
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

		if (status === SessionStatus.NeedsInput) {
			const id = `${session.sessionId}:${InboxNotificationKind.NeedsInput}:${updatedAt}`;
			itemsById.set(id, {
				id,
				kind: InboxNotificationKind.NeedsInput,
				priority: InboxNotificationPriority.High,
				title: localize('inboxNotifications.needsInput.title', "Input Needed for {0}", title),
				description: localize('inboxNotifications.needsInput.description', "Open this session to answer the pending question and continue."),
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

			const pullRequestLabel = `#${pullRequestRef.number}`;
			const headSha = pullRequest?.headSha;
			if (headSha) {
				const ciModelRef = reader.delayedStore.add(this.gitHubService.createPullRequestCIModelReference(
					pullRequestRef.owner,
					pullRequestRef.repo,
					pullRequestRef.number,
					headSha,
				));
				const ciStatus = ciModelRef.object.overallStatus.read(reader);
				const ciTimestamp = latestCITimestamp(ciModelRef.object.checks.read(reader), sessionUpdatedAt);
				if (ciStatus === GitHubCIOverallStatus.Failure) {
					const id = `${session.sessionId}:${InboxNotificationKind.FailingCI}:${pullRequestRef.owner}/${pullRequestRef.repo}#${pullRequestRef.number}:${headSha}`;
					itemsById.set(id, {
						id,
						kind: InboxNotificationKind.FailingCI,
						priority: InboxNotificationPriority.High,
						title: localize('inboxNotifications.failingCi.title', "CI Failing on {0}", pullRequestLabel),
						description: localize('inboxNotifications.failingCi.description', "Required checks are failing for {0}. Open {1} to investigate and fix the failures.", pullRequestLabel, sessionTitle),
						timestamp: ciTimestamp,
						sessionResource: session.resource,
						actions: this.pullRequestActions(session, InboxNotificationKind.FailingCI),
					});
				} else if (ciStatus === GitHubCIOverallStatus.Success) {
					const id = `${session.sessionId}:${InboxNotificationKind.PassingCI}:${pullRequestRef.owner}/${pullRequestRef.repo}#${pullRequestRef.number}:${headSha}`;
					itemsById.set(id, {
						id,
						kind: InboxNotificationKind.PassingCI,
						priority: InboxNotificationPriority.Normal,
						title: localize('inboxNotifications.passingCi.title', "CI Passing on {0}", pullRequestLabel),
						description: localize('inboxNotifications.passingCi.description', "All required checks are passing for {0}. Open {1} to review merge readiness.", pullRequestLabel, sessionTitle),
						timestamp: ciTimestamp,
						sessionResource: session.resource,
						actions: this.pullRequestActions(session, InboxNotificationKind.PassingCI),
					});
				}
			}

			const reviewThreadsModelRef = reader.delayedStore.add(this.gitHubService.createPullRequestReviewThreadsModelReference(
				pullRequestRef.owner,
				pullRequestRef.repo,
				pullRequestRef.number,
			));
			const unresolvedCopilotThreads = reviewThreadsModelRef.object.reviewThreads.read(reader)
				.filter(thread => !thread.isResolved && hasCopilotReviewComment(thread.comments));
			if (unresolvedCopilotThreads.length === 0) {
				continue;
			}

			const reviewCommentsTimestamp = latestReviewCommentsTimestamp(unresolvedCopilotThreads, sessionUpdatedAt);
			const id = `${session.sessionId}:${InboxNotificationKind.ReviewComments}:${pullRequestRef.owner}/${pullRequestRef.repo}#${pullRequestRef.number}:${reviewCommentsTimestamp}`;
			itemsById.set(id, {
				id,
				kind: InboxNotificationKind.ReviewComments,
				priority: InboxNotificationPriority.High,
				title: localize('inboxNotifications.reviewComments.title', "Copilot Comments on {0}", pullRequestLabel),
				description: localize('inboxNotifications.reviewComments.description', "{0} has unresolved Copilot review comments. Open the session to address feedback.", pullRequestLabel),
				timestamp: reviewCommentsTimestamp,
				sessionResource: session.resource,
				actions: this.pullRequestActions(session, InboxNotificationKind.ReviewComments),
			});
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
