/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { cancelOnDispose, CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { arrayEquals } from '../../../../base/common/equals.js';
import { onUnexpectedError } from '../../../../base/common/errors.js';
import { hash } from '../../../../base/common/hash.js';
import { Disposable, IDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { ResourceMap } from '../../../../base/common/map.js';
import { autorun, derived, derivedOpts, IObservable, IReader, IReaderWithStore, mapObservableArrayCached, observableSignal, observableSignalFromEvent, observableValue } from '../../../../base/common/observable.js';
import { getComparisonKey } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import { isCopilotReviewAuthor } from '../../../../platform/github/common/pullRequestFeedback.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { IChatModelReference, IChatService, IChatToolInvocation } from '../../chat/common/chatService/chatService.js';
import { IChatSessionsService } from '../../chat/common/chatSessionsService.js';
import { ChatAgentLocation } from '../../chat/common/constants.js';
import { IChatModel, IChatResponseModel } from '../../chat/common/model/chatModel.js';
import { getChatSessionType } from '../../chat/common/model/chatUri.js';
import { IGitHubService } from './github/githubService.js';
import { getSessionGitHubReferences } from '../common/github/sessionGitHubReferences.js';
import { GitHubCIOverallStatus, GitHubPullRequestState } from '../common/github/types.js';
import { getPullRequestKey } from '../common/github/utils.js';
import { IInboxSessionAttention, InboxNotificationPriority, InboxTab, ISessionAttentionService } from '../common/sessionAttentionService.js';
import { ISessionsManagementService } from '../common/sessionsManagement.js';
import { IChatEntitlementService } from '../../../services/chat/common/chatEntitlementService.js';
import { getGitHubPullRequestRefs, getSessionOwnedGitHubPullRequestRefs, IGitHubPullRequestRef, ISession, SessionStatus } from '../../../services/sessions/common/session.js';

const ATTENTION_START_TIME_STORAGE_KEY = 'sessions.inboxNotifications.attentionStartTime';

const enum AttentionKind {
	NeedsInput = 'needsInput',
	FailingCI = 'failingCi',
	PassingCI = 'passingCi',
	PullRequestMerged = 'pullRequestMerged',
	ReviewComments = 'reviewComments',
}

interface IAttentionNotification {
	readonly id: string;
	readonly kind: AttentionKind;
	readonly priority: InboxNotificationPriority;
	readonly provisionalId?: string;
	readonly timestamp?: number;
}

interface IPullRequestCandidate {
	readonly ref: IGitHubPullRequestRef;
	readonly identity: string;
	readonly timestamp?: number;
}

export class SessionAttentionService extends Disposable implements ISessionAttentionService {
	declare readonly _serviceBrand: undefined;

	readonly sessionAttention: IObservable<ReadonlyMap<string, IInboxSessionAttention>>;
	private readonly _attentionConsumers = observableValue(this, 0);
	private readonly _trackingEnabled: IObservable<boolean>;
	private readonly _attentionStartTime: IObservable<number>;
	private readonly _refreshedGitHubModels = new WeakSet<object>();
	private readonly _chatLoadToken = cancelOnDispose(this._store);
	private readonly _activeNeedsInputChatResources = new Set<string>();
	private readonly _needsInputChatModelRefs = new Map<string, IChatModelReference>();
	private readonly _loadingNeedsInputChatModels = new Map<string, CancellationTokenSource>();
	private readonly _unregisteredChatProviders = new Set<string>();
	private readonly _chatProvidersChanged = observableSignal(this);
	private readonly _chatModelChangeSignals = new WeakMap<IChatModel, IObservable<void>>();
	private readonly _responseChangeSignals = new WeakMap<IChatResponseModel, IObservable<void>>();

	constructor(
		@ISessionsManagementService private readonly sessionsManagementService: ISessionsManagementService,
		@IChatService private readonly chatService: IChatService,
		@IGitHubService private readonly gitHubService: IGitHubService,
		@IStorageService private readonly storageService: IStorageService,
		@IChatEntitlementService chatEntitlementService: IChatEntitlementService,
		@IChatSessionsService chatSessionsService: IChatSessionsService,
	) {
		super();
		this._trackingEnabled = derived(this, reader => this._attentionConsumers.read(reader) > 0 && !chatEntitlementService.sentimentObs.read(reader).hidden);
		this._attentionStartTime = this.trackAttentionStartTime();
		const sessionsChanged = observableSignalFromEvent(this, this.sessionsManagementService.onDidChangeSessions);
		this._register(chatSessionsService.onDidChangeContentProviderSchemes(({ added, removed }) => {
			for (const type of removed) {
				this._unregisteredChatProviders.add(type);
			}
			for (const [resource, cts] of this._loadingNeedsInputChatModels) {
				if (removed.includes(getChatSessionType(URI.parse(resource)))) {
					cts.cancel();
				}
			}
			for (const [resource, reference] of this._needsInputChatModelRefs) {
				if (removed.includes(getChatSessionType(URI.parse(resource)))) {
					this._needsInputChatModelRefs.delete(resource);
					reference.dispose();
				}
			}
			for (const type of added) {
				this._unregisteredChatProviders.delete(type);
			}
			this._chatProvidersChanged.trigger(undefined);
		}));
		this._register(autorun(reader => {
			if (!this._trackingEnabled.read(reader)) {
				return;
			}
			sessionsChanged.read(reader);
			for (const session of this.sessionsManagementService.getSessions()) {
				this.ensureGitHubModels(session, reader);
			}
		}));
		this._register(toDisposable(() => {
			for (const reference of this._needsInputChatModelRefs.values()) {
				reference.dispose();
			}
			this._needsInputChatModelRefs.clear();
			this._loadingNeedsInputChatModels.clear();
			this._activeNeedsInputChatResources.clear();
		}));
		this._register(autorun(reader => {
			this._activeNeedsInputChatResources.clear();
			if (this._trackingEnabled.read(reader)) {
				sessionsChanged.read(reader);
				this._chatProvidersChanged.read(reader);
				this.chatService.chatModels.read(reader);
				for (const session of this.sessionsManagementService.getSessions()) {
					if (!session.isArchived.read(reader) && session.status.read(reader) === SessionStatus.NeedsInput) {
						for (const chat of this.getNeedsInputChats(session, reader)) {
							this.ensureChatModelLoaded(chat.resource);
						}
					}
				}
			}
			for (const [resource, cts] of this._loadingNeedsInputChatModels) {
				if (!this._activeNeedsInputChatResources.has(resource)) {
					cts.cancel();
				}
			}
			for (const [resource, reference] of this._needsInputChatModelRefs) {
				if (!this._activeNeedsInputChatResources.has(resource)) {
					this._needsInputChatModelRefs.delete(resource);
					reference.dispose();
				}
			}
		}));

		const sessions = derived(this, reader => {
			if (!this._trackingEnabled.read(reader)) {
				return [];
			}
			sessionsChanged.read(reader);
			return this.sessionsManagementService.getSessions();
		});
		const pullRequestsBySession = derived(this, reader => {
			const assignments = new ResourceMap<string[]>(getComparisonKey);
			for (const [key, session] of this.getPullRequestNotificationSessions(sessions.read(reader), reader)) {
				const keys = assignments.get(session.resource);
				if (keys) {
					keys.push(key);
				} else {
					assignments.set(session.resource, [key]);
				}
			}
			return assignments;
		});
		const entries = mapObservableArrayCached(this, sessions, session => {
			const assignedPullRequests = derivedOpts<readonly string[]>({ owner: this, equalsFn: arrayEquals }, reader =>
				pullRequestsBySession.read(reader).get(session.resource) ?? []);
			const attention = derived(this, reader => this.getSessionAttention(
				session, new Map(assignedPullRequests.read(reader).map(key => [key, session])), reader));
			return { session, attention };
		});
		this.sessionAttention = derived(this, reader => {
			const result = new Map<string, IInboxSessionAttention>();
			for (const entry of entries.read(reader)) {
				const attention = entry.attention.read(reader);
				if (attention) {
					result.set(entry.session.sessionId, attention);
				}
			}
			return result;
		});
	}

	acquireSessionAttention(): IDisposable {
		this._attentionConsumers.set(this._attentionConsumers.get() + 1, undefined);
		return toDisposable(() => this._attentionConsumers.set(this._attentionConsumers.get() - 1, undefined));
	}

	getSessionAttentionAfterUnarchive(sessions: readonly ISession[]): ReadonlyMap<string, IInboxSessionAttention> {
		return derived(this, reader => {
			const result = new Map<string, IInboxSessionAttention>();
			if (!this._trackingEnabled.read(reader)) {
				return result;
			}
			const restoring = new Set(sessions.map(session => session.sessionId));
			const owners = this.getPullRequestNotificationSessions(this.sessionsManagementService.getSessions(), reader, restoring);
			for (const session of sessions) {
				const attention = this.getSessionAttention(session, owners, reader, true);
				if (attention) {
					result.set(session.sessionId, attention);
				}
			}
			return result;
		}).get();
	}

	private getSessionAttention(session: ISession, owners: ReadonlyMap<string, ISession>, reader: IReaderWithStore, includeArchived = false): IInboxSessionAttention | undefined {
		const status = session.status.read(reader);
		if (status === SessionStatus.Untitled) {
			return undefined;
		}
		this.chatService.chatModels.read(reader);
		const notifications = this.collectSessionNotifications(session, owners, reader, includeArchived).sort((a, b) => a.priority - b.priority);
		const pendingInput = notifications.find(item => item.kind === AttentionKind.NeedsInput);
		const timestamp = session.lastTurnEnd.read(reader)?.getTime() ?? session.updatedAt.read(reader).getTime();
		const attentionStartTime = this._attentionStartTime.read(reader);
		const needsAttention = notifications.some(item => item.kind !== AttentionKind.PassingCI);
		return {
			tab: needsAttention ? InboxTab.ReadyForYou : status === SessionStatus.InProgress ? InboxTab.Working
				: notifications.some(item => item.kind === AttentionKind.PassingCI) ? InboxTab.ReadyToMerge : InboxTab.ReadyForYou,
			priority: notifications[0]?.priority ?? InboxNotificationPriority.Later,
			notificationIds: notifications.map(item => item.id).sort(),
			...(pendingInput?.provisionalId ? { pendingInput: { notificationId: pendingInput.id, provisionalId: pendingInput.provisionalId } } : {}),
			isHistoricalCompletion: status === SessionStatus.Completed && Number.isFinite(attentionStartTime) && timestamp < attentionStartTime
				&& !notifications.some(item => item.kind !== AttentionKind.PullRequestMerged || item.timestamp !== undefined && item.timestamp >= attentionStartTime),
		};
	}

	private trackAttentionStartTime(): IObservable<number> {
		const startTime = observableValue(this, Number.POSITIVE_INFINITY);
		this._register(this.storageService.onDidChangeValue(StorageScope.PROFILE, ATTENTION_START_TIME_STORAGE_KEY, this._store)(event => {
			if (event.external) {
				startTime.set(this.storageService.getNumber(ATTENTION_START_TIME_STORAGE_KEY, StorageScope.PROFILE, Number.POSITIVE_INFINITY), undefined);
			}
		}));
		this._register(autorun(reader => {
			if (this._trackingEnabled.read(reader)) {
				// Persist first demand so late-arriving history cannot backfill the Inbox after reload.
				const value = this.storageService.getNumber(ATTENTION_START_TIME_STORAGE_KEY, StorageScope.PROFILE) ?? Date.now();
				this.storageService.store(ATTENTION_START_TIME_STORAGE_KEY, value, StorageScope.PROFILE, StorageTarget.MACHINE);
				startTime.set(value, undefined);
			}
		}));
		return startTime;
	}

	private getPullRequestNotificationSessions(sessions: readonly ISession[], reader: IReader, restoring?: ReadonlySet<string>): ReadonlyMap<string, ISession> {
		const candidates = new Map<string, { session: ISession; owned: boolean; updatedAt: number }>();
		for (const session of sessions) {
			if (session.isArchived.read(reader) && !restoring?.has(session.sessionId) || session.status.read(reader) === SessionStatus.InProgress) {
				continue;
			}
			const ownedRefs = new Set(getSessionAttentionPullRequestRefs(session, reader).map(ref => getPullRequestKey(ref.owner, ref.repo, ref.number).toLowerCase()));
			const updatedAt = session.updatedAt.read(reader).getTime();
			for (const ref of getSessionAttentionPullRequestRefs(session, reader, true)) {
				const key = getPullRequestKey(ref.owner, ref.repo, ref.number).toLowerCase();
				const owned = ownedRefs.has(key);
				const previous = candidates.get(key);
				if (!previous || (owned && !previous.owned) || (owned === previous.owned
					&& (updatedAt > previous.updatedAt || (updatedAt === previous.updatedAt && session.sessionId < previous.session.sessionId)))) {
					candidates.set(key, { session, owned, updatedAt });
				}
			}
		}
		return new Map([...candidates].map(([key, candidate]) => [key, candidate.session]));
	}

	private collectSessionNotifications(session: ISession, owners: ReadonlyMap<string, ISession>, reader: IReaderWithStore, includeArchived = false): IAttentionNotification[] {
		const notifications: IAttentionNotification[] = [];
		if (session.isArchived.read(reader) && !includeArchived) {
			return notifications;
		}
		const status = session.status.read(reader);
		const updatedAt = session.updatedAt.read(reader).getTime();
		if (status === SessionStatus.NeedsInput) {
			const key = this.getNeedsInputKey(session, reader) ?? `${updatedAt}`;
			notifications.push({
				id: `${session.sessionId}:needsInput:${key}`, kind: AttentionKind.NeedsInput, priority: InboxNotificationPriority.Now,
				provisionalId: `${session.sessionId}:needsInput:${updatedAt}`,
			});
		}
		if (status !== SessionStatus.InProgress) {
			this.collectPullRequestNotifications(notifications, session, owners, reader);
		}
		return notifications;
	}

	private ensureGitHubModels(session: ISession, reader: IReaderWithStore): void {
		if (session.isArchived.read(reader)) {
			return;
		}
		for (const ref of getSessionAttentionPullRequestRefs(session, reader, true)) {
			const model = reader.delayedStore.add(this.gitHubService.createPullRequestModelReference(ref.owner, ref.repo, ref.number)).object;
			if (!this._refreshedGitHubModels.has(model)) {
				this._refreshedGitHubModels.add(model);
				void model.refresh({ priority: 'background' }).catch(onUnexpectedError);
			}
			const pullRequest = model.pullRequest.read(reader);
			if ((pullRequest?.state ?? ref.liveState ?? ref.state) !== GitHubPullRequestState.Open) {
				continue;
			}
			reader.delayedStore.add(model.startPolling());
			const reviews = reader.delayedStore.add(this.gitHubService.createPullRequestReviewThreadsModelReference(ref.owner, ref.repo, ref.number)).object;
			if (!this._refreshedGitHubModels.has(reviews)) {
				this._refreshedGitHubModels.add(reviews);
				void reviews.refresh(false, { priority: 'background' }).catch(onUnexpectedError);
			}
			reader.delayedStore.add(reviews.startPolling());
			if (pullRequest?.headSha) {
				const ci = reader.delayedStore.add(this.gitHubService.createPullRequestCIModelReference(ref.owner, ref.repo, ref.number, pullRequest.headSha)).object;
				if (!this._refreshedGitHubModels.has(ci)) {
					this._refreshedGitHubModels.add(ci);
					void ci.refresh(false, { priority: 'background' }).catch(onUnexpectedError);
				}
				reader.delayedStore.add(ci.startPolling());
			}
		}
	}

	private collectPullRequestNotifications(notifications: IAttentionNotification[], session: ISession, owners: ReadonlyMap<string, ISession>, reader: IReaderWithStore): void {
		const failing: IPullRequestCandidate[] = [];
		const passing: IPullRequestCandidate[] = [];
		const merged: IPullRequestCandidate[] = [];
		const reviews: IPullRequestCandidate[] = [];
		const owned = new Set(getSessionAttentionPullRequestRefs(session, reader).map(ref => ref.uri.toString()));
		let openOwnedPullRequests = 0;
		const updatedAt = session.updatedAt.read(reader).getTime();
		for (const ref of getSessionAttentionPullRequestRefs(session, reader, true)) {
			const isOwned = owned.has(ref.uri.toString());
			const model = reader.delayedStore.add(this.gitHubService.createPullRequestModelReference(ref.owner, ref.repo, ref.number)).object;
			const pullRequest = model.pullRequest.read(reader);
			const state = pullRequest?.state ?? ref.liveState ?? ref.state;
			if (isOwned && state !== GitHubPullRequestState.Merged && state !== GitHubPullRequestState.Closed) {
				openOwnedPullRequests++;
			}
			if (state === GitHubPullRequestState.Merged) {
				if (isOwned) {
					// Modification time can identify a notification, but cannot establish when a merge happened.
					merged.push({
						ref,
						identity: pullRequest?.mergedAt ?? String(parseTimestamp(pullRequest?.updatedAt) ?? updatedAt),
						timestamp: parseTimestamp(pullRequest?.mergedAt),
					});
				}
				continue;
			}
			if (state !== GitHubPullRequestState.Open || owners.get(getPullRequestKey(ref.owner, ref.repo, ref.number).toLowerCase()) !== session) {
				continue;
			}
			const threadsModel = reader.delayedStore.add(this.gitHubService.createPullRequestReviewThreadsModelReference(ref.owner, ref.repo, ref.number)).object;
			const threads = threadsModel.reviewThreads.read(reader).filter(thread => !thread.isResolved && isCopilotReviewAuthor(thread.comments[0]?.author.login));
			if (pullRequest?.headSha) {
				const ci = reader.delayedStore.add(this.gitHubService.createPullRequestCIModelReference(ref.owner, ref.repo, ref.number, pullRequest.headSha)).object;
				const status = ci.overallStatus.read(reader);
				if (status === GitHubCIOverallStatus.Failure) {
					failing.push({ ref, identity: pullRequest.headSha });
				} else if (status === GitHubCIOverallStatus.Success && !pullRequest.isDraft && isOwned) {
					passing.push({ ref, identity: pullRequest.headSha });
				}
			}
			if (threads.length) {
				reviews.push({
					ref,
					identity: String(hash(threads.map(thread => [
						thread.id, ...thread.comments.map(comment => [comment.id, comment.updatedAt ?? comment.createdAt]),
					]).sort((a, b) => String(a[0]).localeCompare(String(b[0]))))),
				});
			}
		}
		this.addPullRequestNotification(notifications, session, AttentionKind.FailingCI, failing);
		if (passing.length === openOwnedPullRequests) {
			this.addPullRequestNotification(notifications, session, AttentionKind.PassingCI, passing);
		}
		this.addPullRequestNotification(notifications, session, AttentionKind.PullRequestMerged, merged);
		this.addPullRequestNotification(notifications, session, AttentionKind.ReviewComments, reviews);
	}

	private addPullRequestNotification(notifications: IAttentionNotification[], session: ISession, kind: AttentionKind, candidates: readonly IPullRequestCandidate[]): void {
		if (candidates.length) {
			const suffix = candidates.map(candidate => `${candidate.ref.owner}/${candidate.ref.repo}#${candidate.ref.number}:${candidate.identity}`).sort().join(',');
			const timestamps = candidates.map(candidate => candidate.timestamp).filter(timestamp => timestamp !== undefined);
			notifications.push({
				id: `${session.sessionId}:${kind}:${suffix}`,
				kind,
				priority: kind === AttentionKind.FailingCI || kind === AttentionKind.ReviewComments ? InboxNotificationPriority.Now : InboxNotificationPriority.Next,
				...(timestamps.length ? { timestamp: Math.max(...timestamps) } : {}),
			});
		}
	}

	private getNeedsInputChats(session: ISession, reader: IReader) {
		const chats = session.chats.read(reader);
		const waiting = chats.filter(chat => chat.status.read(reader) === SessionStatus.NeedsInput);
		return waiting.length ? waiting : chats;
	}

	private getNeedsInputKey(session: ISession, reader: IReaderWithStore): string | undefined {
		let candidate: { key: string; startedWaitingAt: number } | undefined;
		for (const chat of this.getNeedsInputChats(session, reader)) {
			const model = this.chatService.getSession(chat.resource);
			if (!model) {
				continue;
			}
			let signal = this._chatModelChangeSignals.get(model);
			if (!signal) {
				signal = observableSignalFromEvent(this, model.onDidChange);
				this._chatModelChangeSignals.set(model, signal);
			}
			signal.read(reader);
			for (const request of model.getRequests().toReversed()) {
				const response = request.response;
				if (!response || response.isCanceled || request.isHiddenFromTranscript
					|| (request.shouldBeRemovedOnSend && !request.shouldBeRemovedOnSend.afterUndoStop)) {
					continue;
				}
				let responseChanged = this._responseChangeSignals.get(response);
				if (!responseChanged) {
					responseChanged = observableSignalFromEvent(this, response.onDidChange);
					this._responseChangeSignals.set(response, responseChanged);
				}
				responseChanged.read(reader);
				const pending = response.isPendingConfirmation.read(reader);
				if (!pending) {
					continue;
				}
				const key = this.getResponseInputKey(response, reader);
				if (!key) {
					continue;
				}
				if (!candidate || pending.startedWaitingAt < candidate.startedWaitingAt) {
					candidate = { key, startedWaitingAt: pending.startedWaitingAt };
				}
				break;
			}
		}
		return candidate?.key;
	}

	private getResponseInputKey(response: IChatResponseModel, reader: IReader): string | undefined {
		for (const part of response.response.value) {
			if (part.kind === 'confirmation' && !part.isUsed) {
				return `cf:${response.requestId}:${hash(part.title.replace(/\s+/g, ' ').trim())}`;
			}
		}
		for (const [index, part] of response.response.value.entries()) {
			if (part.kind === 'questionCarousel' && !part.isUsed && part.questions.length) {
				return `qc:${response.requestId}:${part.resolveId || hash(part.questions.map(question => question.id || question.title).join('|'))}`;
			}
			if (part.kind === 'planReview' && !part.isUsed && !response.isComplete) {
				return `pr:${response.requestId}:${part.resolveId ?? index}`;
			}
			if (part.kind === 'toolInvocation') {
				const state = part.state.read(reader);
				if (state.type === IChatToolInvocation.StateKind.WaitingForConfirmation || state.type === IChatToolInvocation.StateKind.WaitingForPostApproval) {
					return `tc:${response.requestId}:${part.toolCallId}:${state.type === IChatToolInvocation.StateKind.WaitingForPostApproval ? 'result' : 'execution'}`;
				}
			}
		}
		return undefined;
	}

	private ensureChatModelLoaded(resource: URI): void {
		const key = resource.toString();
		this._activeNeedsInputChatResources.add(key);
		if (this._unregisteredChatProviders.has(getChatSessionType(resource)) || this.chatService.getSession(resource)
			|| this._needsInputChatModelRefs.has(key) || this._loadingNeedsInputChatModels.has(key)) {
			return;
		}
		const cts = new CancellationTokenSource(this._chatLoadToken);
		this._loadingNeedsInputChatModels.set(key, cts);
		void this.chatService.acquireOrLoadSession(resource, ChatAgentLocation.Chat, cts.token, 'SessionAttentionService')
			.then(reference => {
				if (!reference) {
					return;
				}
				if (cts.token.isCancellationRequested || this._store.isDisposed || !this._activeNeedsInputChatResources.has(key)) {
					reference.dispose();
					return;
				}
				this._needsInputChatModelRefs.set(key, reference);
			})
			.catch(error => {
				if (!cts.token.isCancellationRequested) {
					onUnexpectedError(error);
				}
			})
			.finally(() => {
				this._loadingNeedsInputChatModels.delete(key);
				const cancelled = cts.token.isCancellationRequested;
				cts.dispose();
				if (cancelled && !this._store.isDisposed) {
					this._chatProvidersChanged.trigger(undefined);
				}
			});
	}
}

function getSessionAttentionPullRequestRefs(session: ISession, reader: IReader, includeReferences = false): readonly IGitHubPullRequestRef[] {
	const references = [
		...getSessionGitHubReferences(session, reader).pullRequests.filter(ref => ref.createdByThisSession),
		...(session.workspace.read(reader)?.folders ?? []).flatMap(folder => {
			const gitHubInfo = folder.gitRepository?.gitHubInfo.read(reader);
			return includeReferences ? getGitHubPullRequestRefs(gitHubInfo) : getSessionOwnedGitHubPullRequestRefs(gitHubInfo);
		}),
	];
	const seen = new Set<string>();
	return references.filter(ref => {
		const key = `${ref.owner.toLowerCase()}/${ref.repo.toLowerCase()}#${ref.number}`;
		if (seen.has(key)) {
			return false;
		}
		seen.add(key);
		return true;
	});
}

function parseTimestamp(value: string | undefined): number | undefined {
	if (!value) {
		return undefined;
	}
	const parsed = Date.parse(value);
	return Number.isFinite(parsed) ? parsed : undefined;
}
