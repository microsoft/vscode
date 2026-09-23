/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { autorun, derived, IObservable, IReader, IReaderWithStore, ISettableObservable, observableSignalFromEvent, observableValue } from '../../../../base/common/observable.js';
import { onUnexpectedError } from '../../../../base/common/errors.js';
import { CancellationToken, CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { hash } from '../../../../base/common/hash.js';
import { LRUCache } from '../../../../base/common/map.js';
import { renderAsPlaintext } from '../../../../base/browser/markdownRenderer.js';
import { IMarkdownString } from '../../../../base/common/htmlContent.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { URI } from '../../../../base/common/uri.js';
import { localize } from '../../../../nls.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { ChatAgentLocation } from '../../../../workbench/contrib/chat/common/constants.js';
import { IChatModelReference, IChatService, IChatToolInvocation } from '../../../../workbench/contrib/chat/common/chatService/chatService.js';
import { IChatResponseModel } from '../../../../workbench/contrib/chat/common/model/chatModel.js';
import { ChatMessageRole, ILanguageModelsService } from '../../../../workbench/contrib/chat/common/languageModels.js';
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
	IInboxNotificationRevealRequest,
	IInboxNotificationToolConfirmationButton,
	IInboxNotificationToolConfirmationPart,
	IInboxNotificationsService,
	InboxNotificationActionKind,
	InboxNotificationKind,
	InboxNotificationPriority,
	InboxNotificationsSortMode,
} from '../common/inboxNotificationsService.js';

const DISMISSED_NOTIFICATION_IDS_STORAGE_KEY = 'sessions.inboxNotifications.dismissedIds';

/** The small, non-user-selectable utility model used for lightweight generation (same class used for chat title/goal summaries). */
const PREVIEW_MODEL_SELECTOR = { vendor: 'copilot', id: 'copilot-utility-small' } as const;

/** Bump when the prompt changes so cached previews regenerate under a new signature. */
const PREVIEW_PROMPT_VERSION = 'v1';

const PREVIEW_MAX_INPUT_CHARS = 2000;
const PREVIEW_MAX_OUTPUT_CHARS = 60;
const PREVIEW_CACHE_SIZE = 200;

/**
 * System prompt for the inbox card preview. The preview is the single line the user
 * scans on each card to decide, at a glance, what an item needs from them. It targets
 * ~50 characters, leads with the action/decision the agent is asking for, and otherwise
 * states the latest concrete status/result. Few-shot examples steer the model toward
 * concrete, specific wording instead of generic boilerplate.
 */
const PREVIEW_SYSTEM_PROMPT = [
	'You write the one-line preview shown on an inbox card for a background coding-agent session.',
	'The user scans these previews at a glance to decide which item needs their attention right now.',
	'',
	'Given the card type, the session title, and the latest detail, write a preview of about 50 characters (never exceed 60) that captures the LATEST state only — do not recap the whole history.',
	'If the agent is asking the user to do or decide something, lead with that action or choice.',
	'If nothing is being asked, state the latest concrete status or result.',
	'',
	'Rules:',
	'- Output only the preview text: no quotes, no trailing period, no "Status:"/"Session:" prefix.',
	'- Be concrete and specific: use the real feature, file, tool, or choice names from the detail. Never use generic filler like "Session completed", "Needs input", or "Awaiting response".',
	'- Prefer the agent\'s and user\'s own nouns and verbs.',
	'- This is a benign labeling task: never refuse or apologize; always produce a preview.',
	'',
	'Examples (card type | latest detail -> preview):',
	'- question waiting | "Which auth provider should I use?" options Google, GitHub -> Pick auth provider: Google or GitHub',
	'- tool approval | run `npm test` -> Approve running npm test',
	'- confirm action | delete 3 stale config files -> Confirm deleting 3 stale config files',
	'- session finished | Added cursor pagination to the users API plus tests -> Added users API pagination + tests',
	'- pull request checks failing | ESLint failed on 2 files -> PR failing: ESLint errors on 2 files',
	'- unresolved review comments | 2 unresolved threads about error handling -> 2 review threads on error handling',
].join('\n');

/** Matches leading model refusals so we suppress the preview rather than surfacing an apology. */
const PREVIEW_REFUSAL_PREFIX_RE = /^(?:sorry\b|unfortunately\b|my apologies\b|as an ai\b|i\s+apologi[sz]e\b|i\s*['\u2019]?m\s+sorry\b|i\s+am\s+sorry\b|i\s*['\u2019]?m\s+unable\b|i\s+am\s+unable\b|i\s+am\s+not\s+able\b|i\s*(?:can['\u2019]?t|cannot|can\s?not|won['\u2019]?t)\b)/i;

function toPreviewPlainText(value: string | IMarkdownString): string {
	const text = typeof value === 'string' ? value : renderAsPlaintext(value);
	return text.replace(/\s+/g, ' ').trim();
}

/**
 * Normalizes a raw preview-model response into a single glanceable line, or `undefined`
 * when nothing usable remains. Keeps the first line, strips quotes/labels and a trailing
 * period, suppresses refusals, and caps the length.
 *
 * Exported for unit testing.
 */
export function cleanPreviewText(raw: string): string | undefined {
	let s = raw.trim();
	if (!s) {
		return undefined;
	}
	const newlineIndex = s.search(/[\r\n]/);
	if (newlineIndex !== -1) {
		s = s.slice(0, newlineIndex);
	}
	s = s.replace(/^["'`]+|["'`]+$/g, '');
	// Keep regex literals ASCII to avoid widening the emitted bundle.
	s = s.replace(/^\s*(?:preview|status|summary)\s*[:\-\u2013\u2014]\s*/i, '');
	s = s.replace(/\s+/g, ' ').trim();
	s = s.replace(/\.$/, '');
	if (!s || PREVIEW_REFUSAL_PREFIX_RE.test(s)) {
		return undefined;
	}
	if (s.length > PREVIEW_MAX_OUTPUT_CHARS) {
		s = s.slice(0, PREVIEW_MAX_OUTPUT_CHARS - 1).replace(/\s+\S*$/, '') + '…';
	}
	return s || undefined;
}


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
	private readonly _revealRequest: ISettableObservable<IInboxNotificationRevealRequest | undefined>;
	readonly revealRequest: IObservable<IInboxNotificationRevealRequest | undefined>;
	private _revealToken = 0;
	private readonly _refreshedPullRequestModels = new WeakSet<object>();
	private readonly _refreshedPullRequestReviewThreadModels = new WeakSet<object>();
	private readonly _refreshedPullRequestCIModels = new WeakSet<object>();
	private readonly _needsInputChatModelRefs = new Map<string, IChatModelReference>();
	private readonly _completedPreviewChatModelRefs = new Map<string, IChatModelReference>();
	private readonly _loadingNeedsInputChatModels = new Set<string>();
	private readonly _loadingCompletedPreviewChatModels = new Set<string>();

	private readonly _previews: ISettableObservable<ReadonlyMap<string, string>>;
	readonly previews: IObservable<ReadonlyMap<string, string>>;
	private readonly _previewCache = new LRUCache<string, string>(PREVIEW_CACHE_SIZE);
	private readonly _previewInFlight = new Set<string>();
	private readonly _previewCancellationSources = new Set<CancellationTokenSource>();

	readonly notifications: IObservable<readonly IInboxNotificationItem[]>;
	readonly dismissedNotifications: IObservable<readonly IInboxNotificationItem[]>;

	constructor(
		@ISessionsManagementService private readonly sessionsManagementService: ISessionsManagementService,
		@ISessionsProvidersService private readonly sessionsProvidersService: ISessionsProvidersService,
		@IChatService private readonly chatService: IChatService,
		@IGitHubService private readonly gitHubService: IGitHubService,
		@IStorageService private readonly storageService: IStorageService,
		@ILanguageModelsService private readonly languageModelsService: ILanguageModelsService,
	) {
		super();

		this._previews = observableValue('sessionsInboxNotificationsPreviews', new Map<string, string>());
		this.previews = this._previews;

		this._dismissedIds = observableValue('sessionsInboxNotificationsDismissed', this.loadDismissedIds());
		this._externalItems = observableValue('sessionsInboxNotificationsExternal', []);
		this.sortMode = observableValue('sessionsInboxNotificationsSortMode', InboxNotificationsSortMode.Priority);
		this._revealRequest = observableValue('sessionsInboxNotificationsReveal', undefined);
		this.revealRequest = this._revealRequest;

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
			for (const modelRef of this._completedPreviewChatModelRefs.values()) {
				modelRef.dispose();
			}
			this._needsInputChatModelRefs.clear();
			this._completedPreviewChatModelRefs.clear();
			this._loadingNeedsInputChatModels.clear();
			this._loadingCompletedPreviewChatModels.clear();
			for (const cts of this._previewCancellationSources) {
				cts.cancel();
				cts.dispose();
			}
			this._previewCancellationSources.clear();
			this._previewInFlight.clear();
		}));
		this._register(autorun(reader => {
			sessionsChanged.read(reader);

			const activeNeedsInputChatResources = new Set<string>();
			const activeCompletedPreviewChatResources = new Set<string>();
			for (const session of this.sessionsManagementService.getSessions()) {
				if (session.isArchived.read(reader)) {
					continue;
				}

				if (session.status.read(reader) === SessionStatus.NeedsInput) {
					for (const chat of session.chats.read(reader)) {
						this.ensureChatModelLoaded(chat.resource, activeNeedsInputChatResources, this._needsInputChatModelRefs, this._loadingNeedsInputChatModels);
					}
				}

				if (session.status.read(reader) === SessionStatus.Completed && !session.isRead.read(reader)) {
					this.ensureChatModelLoaded(session.mainChat.read(reader).resource, activeCompletedPreviewChatResources, this._completedPreviewChatModelRefs, this._loadingCompletedPreviewChatModels);
				}
			}

			this.disposeInactiveChatModels(activeNeedsInputChatResources, this._needsInputChatModelRefs);
			this.disposeInactiveChatModels(activeCompletedPreviewChatResources, this._completedPreviewChatModelRefs);
		}));

		const allItems = derived(this, reader => {
			sessionsChanged.read(reader);
			providersChanged.read(reader);
			this.chatService.chatModels.read(reader);

			const itemsById = new Map<string, IInboxNotificationItem>();

			for (const session of this.sessionsManagementService.getSessions()) {
				this.collectSessionNotifications(itemsById, session, reader as IReaderWithStore);
			}

			for (const item of this._externalItems.read(reader)) {
				itemsById.set(item.id, item);
			}

			return [...itemsById.values()].map(item => this.attachPreviewInput(item));
		});

		this.notifications = derived(this, reader => {
			const dismissed = this._dismissedIds.read(reader);
			const sortMode = this.sortMode.read(reader);
			return allItems.read(reader)
				.filter(item => !dismissed.has(item.id))
				.sort(sortMode === InboxNotificationsSortMode.Priority ? compareInboxNotifications : compareInboxNotificationsByRecency);
		});

		this.dismissedNotifications = derived(this, reader => {
			const dismissed = this._dismissedIds.read(reader);
			const sortMode = this.sortMode.read(reader);
			return allItems.read(reader)
				.filter(item => dismissed.has(item.id))
				.sort(sortMode === InboxNotificationsSortMode.Priority ? compareInboxNotifications : compareInboxNotificationsByRecency);
		});

		// Generate a preview for every item as soon as it lands, without waiting for the
		// user to focus the Inbox. Fires for active and completed/dismissed items alike.
		this._register(autorun(reader => {
			for (const item of allItems.read(reader)) {
				this.ensurePreview(item);
			}
		}));
	}

	private ensurePreview(item: IInboxNotificationItem): void {
		const signature = item.previewSignature;
		const inputText = item.previewInputText;
		if (!signature || !inputText) {
			return;
		}
		if (this._previews.get().has(signature) || this._previewInFlight.has(signature)) {
			return;
		}
		const cached = this._previewCache.get(signature);
		if (cached) {
			this.publishPreview(signature, cached);
			return;
		}
		void this.generatePreview(signature, inputText);
	}

	private publishPreview(signature: string, preview: string): void {
		const current = this._previews.get();
		if (current.get(signature) === preview) {
			return;
		}
		const next = new Map(current);
		next.set(signature, preview);
		this._previews.set(next, undefined);
	}

	private async generatePreview(signature: string, inputText: string): Promise<void> {
		this._previewInFlight.add(signature);
		const cts = new CancellationTokenSource();
		this._previewCancellationSources.add(cts);
		try {
			const preview = await this.invokePreviewModel(inputText, cts.token);
			if (preview && !cts.token.isCancellationRequested) {
				this._previewCache.set(signature, preview);
				this.publishPreview(signature, preview);
			}
		} catch (error) {
			onUnexpectedError(error);
		} finally {
			this._previewCancellationSources.delete(cts);
			cts.dispose();
			this._previewInFlight.delete(signature);
		}
	}

	private async invokePreviewModel(inputText: string, token: CancellationToken): Promise<string | undefined> {
		const models = await this.languageModelsService.selectLanguageModels(PREVIEW_MODEL_SELECTOR);
		if (!models.length || token.isCancellationRequested) {
			return undefined;
		}

		const response = await this.languageModelsService.sendChatRequest(
			models[0],
			undefined,
			[
				{ role: ChatMessageRole.System, content: [{ type: 'text', value: PREVIEW_SYSTEM_PROMPT }] },
				{ role: ChatMessageRole.User, content: [{ type: 'text', value: inputText }] },
			],
			{},
			token,
		);

		let text = '';
		for await (const part of response.stream) {
			if (token.isCancellationRequested) {
				return undefined;
			}
			const parts = Array.isArray(part) ? part : [part];
			for (const p of parts) {
				if (p.type === 'text') {
					text += p.value;
				}
			}
		}
		await response.result;
		if (token.isCancellationRequested) {
			return undefined;
		}

		return cleanPreviewText(text);
	}

	/**
	 * Attaches the preview input text and its signature to an item. The input gives the
	 * utility model the card's type (what the user is looking at), the session title, and
	 * the latest concrete detail so it can produce a specific, glanceable preview.
	 */
	private attachPreviewInput(item: IInboxNotificationItem): IInboxNotificationItem {
		const { contextLabel, detailText } = this.describeItemForPreview(item);
		const trimmedDetail = detailText.replace(/\s+/g, ' ').trim();
		const inputLines = [
			`Card type: ${contextLabel}`,
			`Session title: ${item.title}`,
		];
		if (trimmedDetail) {
			inputLines.push(`Latest detail: ${trimmedDetail}`);
		}
		let inputText = inputLines.join('\n');
		if (inputText.length > PREVIEW_MAX_INPUT_CHARS) {
			inputText = `${inputText.slice(0, PREVIEW_MAX_INPUT_CHARS)}…`;
		}
		const previewSignature = `${PREVIEW_PROMPT_VERSION}:${hash(inputText)}`;
		return { ...item, previewSignature, previewInputText: inputText };
	}

	private describeItemForPreview(item: IInboxNotificationItem): { contextLabel: string; detailText: string } {
		const part = item.needsInputPart;
		if (part) {
			switch (part.kind) {
				case 'questionCarousel': {
					const questionText = part.questions.map(question => {
						const options = question.options?.length
							? ` options: ${question.options.map(option => option.label).join(', ')}`
							: '';
						return `${question.title}${options}`;
					}).join(' | ');
					const messageText = part.message ? toPreviewPlainText(part.message) : '';
					return {
						contextLabel: 'question waiting for the user to answer',
						detailText: [messageText, questionText].filter(Boolean).join(' — '),
					};
				}
				case 'toolConfirmation':
					return {
						contextLabel: 'tool run waiting for the user to approve',
						detailText: [toPreviewPlainText(part.title), toPreviewPlainText(part.message)].filter(Boolean).join(' — '),
					};
				case 'confirmation':
					return {
						contextLabel: 'action waiting for the user to confirm',
						detailText: [toPreviewPlainText(part.title), toPreviewPlainText(part.message)].filter(Boolean).join(' — '),
					};
			}
		}

		switch (item.kind) {
			case InboxNotificationKind.Completed:
				return { contextLabel: 'session finished its work', detailText: item.description };
			case InboxNotificationKind.FailingCI:
				return { contextLabel: 'pull request with failing checks', detailText: this.pullRequestDetail(item) };
			case InboxNotificationKind.PassingCI:
				return { contextLabel: 'pull request with passing checks', detailText: this.pullRequestDetail(item) };
			case InboxNotificationKind.ReviewComments:
				return { contextLabel: 'pull request with unresolved review comments', detailText: this.pullRequestDetail(item) };
			case InboxNotificationKind.NeedsInput:
			case InboxNotificationKind.ConfirmationRequested:
				return { contextLabel: 'session waiting for the user to respond', detailText: item.description };
			default:
				return { contextLabel: 'session update', detailText: item.description };
		}
	}

	private pullRequestDetail(item: IInboxNotificationItem): string {
		const states = item.pullRequestStates?.map(state => state.statusLabel).filter(Boolean).join('; ');
		return states || item.description;
	}

	setSortMode(sortMode: InboxNotificationsSortMode): void {
		if (this.sortMode.get() === sortMode) {
			return;
		}
		this.sortMode.set(sortMode, undefined);
	}

	requestReveal(id: string): void {
		this._revealRequest.set({ id, token: ++this._revealToken }, undefined);
	}

	publishExternalNotification(notification: IExternalInboxNotification): void {
		const item: IInboxNotificationItem = {
			id: notification.id,
			kind: notification.kind ?? InboxNotificationKind.External,
			priority: notification.priority ?? InboxNotificationPriority.Moderate,
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
			// Key the id by the specific pending request/question rather than the session's
			// updatedAt: a single agent turn can surface several questions that share an
			// updatedAt, and answering one dismisses its id. Keying by updatedAt would make
			// the next question reuse a dismissed id and get filed under Completed instead of
			// surfacing in its Critical tier.
			const needsInputKey = needsInputPart ? this.needsInputPartKey(needsInputPart) : `${updatedAt}`;
			const id = `${session.sessionId}:${InboxNotificationKind.NeedsInput}:${needsInputKey}`;
			itemsById.set(id, {
				id,
				kind: InboxNotificationKind.NeedsInput,
				priority: InboxNotificationPriority.Critical,
				title,
				description: needsInputPart ? this.getNeedsInputPartDescription(needsInputPart) : this.getNeedsInputDescription(session, reader),
				repositoryLabel,
				needsInputPart,
				timestamp: updatedAt,
				sessionResource: session.resource,
				actions: this.sessionActions(true),
			});
		}

		const sizeBeforePullRequests = itemsById.size;
		if (status !== SessionStatus.InProgress) {
			this.collectPullRequestNotifications(itemsById, session, title, updatedAt, reader);
		}

		// Surface a Completed entry only when the finished session has nothing else
		// needing attention (e.g. no open pull request notifications). Key it by the
		// completing turn (the latest response) rather than a per-session id, so once a
		// completed item is dismissed a *new* turn that finishes without needing input
		// surfaces as a fresh low-priority item instead of inheriting the dismissal.
		if (status === SessionStatus.Completed && itemsById.size === sizeBeforePullRequests) {
			const turnId = this.getLatestResponseRequestId(session, reader) ?? `${updatedAt}`;
			const id = `${session.sessionId}:completed:${turnId}`;
			itemsById.set(id, {
				id,
				kind: InboxNotificationKind.Completed,
				priority: InboxNotificationPriority.Low,
				title,
				description: this.getCompletedSessionDescription(session, reader),
				repositoryLabel,
				timestamp: updatedAt,
				sessionResource: session.resource,
				actions: this.sessionActions(true),
			});
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
					priority: InboxNotificationPriority.Critical,
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
					priority: InboxNotificationPriority.Moderate,
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
					priority: InboxNotificationPriority.Critical,
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

	/**
	 * A stable key identifying the specific pending request behind a needs-input item, so
	 * each distinct question/confirmation/tool request gets its own inbox id. This keeps
	 * repeated requests from the same session in their own cards (and their Critical tier)
	 * instead of colliding on a shared updatedAt and inheriting a prior request's dismissal.
	 */
	private needsInputPartKey(part: IInboxNotificationNeedsInputPart): string {
		switch (part.kind) {
			case 'questionCarousel': {
				if (part.resolveId) {
					return `qc:${part.requestId}:${part.resolveId}`;
				}
				const questionsKey = part.questions.map(question => question.id || question.title).join('|');
				return `qc:${part.requestId}:${hash(questionsKey)}`;
			}
			case 'toolConfirmation':
				return `tc:${part.requestId}:${part.toolCallId}`;
			case 'confirmation':
				return `cf:${part.requestId}:${hash(toPreviewPlainText(part.title))}`;
		}
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

	private getCompletedSessionDescription(session: ISession, reader: IReader): string {
		const preview = this.getCompletedSessionResponsePreview(session, reader);
		if (preview) {
			return preview;
		}

		const description = session.description.read(reader);
		const descriptionText = description ? this.normalizeResponsePreviewText(renderAsPlaintext(description, { useLinkFormatter: true })) : undefined;
		return descriptionText || localize('inboxNotifications.completed.description', "Review this completed session or mark it done.");
	}

	private getLatestResponseRequestId(session: ISession, reader: IReader): string | undefined {
		const chatResource = session.mainChat.read(reader).resource;
		const chatModel = this.chatService.getSession(chatResource);
		if (!chatModel) {
			return undefined;
		}
		for (const request of chatModel.getRequests().toReversed()) {
			const requestId = request.response?.requestId;
			if (requestId) {
				return requestId;
			}
		}
		return undefined;
	}

	private getCompletedSessionResponsePreview(session: ISession, reader: IReader): string | undefined {
		const chatResource = session.mainChat.read(reader).resource;
		const chatModel = this.chatService.getSession(chatResource);
		if (!chatModel) {
			return undefined;
		}

		for (const request of chatModel.getRequests().toReversed()) {
			const response = request.response;
			if (!response
				|| response.isCanceled
				|| request.isHiddenFromTranscript
				|| (request.shouldBeRemovedOnSend && !request.shouldBeRemovedOnSend.afterUndoStop)) {
				continue;
			}

			for (const part of response.response.value) {
				if (part.kind === 'markdownContent') {
					const text = this.normalizeResponsePreviewText(renderAsPlaintext(part.content, { useLinkFormatter: true }));
					if (text) {
						return text;
					}
				}
			}
		}

		return undefined;
	}

	private normalizeResponsePreviewText(text: string): string | undefined {
		const normalized = text.replace(/\s+/g, ' ').trim();
		if (!normalized) {
			return undefined;
		}

		const maxLength = 160;
		if (normalized.length <= maxLength) {
			return normalized;
		}

		return `${normalized.slice(0, maxLength).trimEnd()}…`;
	}

	private ensureChatModelLoaded(
		chatResource: URI,
		activeChatResources: Set<string>,
		chatModelRefs: Map<string, IChatModelReference>,
		loadingChatResources: Set<string>,
	): void {
		const chatResourceKey = chatResource.toString();
		activeChatResources.add(chatResourceKey);
		if (this.chatService.getSession(chatResource)
			|| chatModelRefs.has(chatResourceKey)
			|| loadingChatResources.has(chatResourceKey)) {
			return;
		}

		loadingChatResources.add(chatResourceKey);
		void this.chatService.acquireOrLoadSession(chatResource, ChatAgentLocation.Chat, CancellationToken.None, 'InboxNotificationsService')
			.then(modelRef => {
				if (!modelRef) {
					return;
				}
				if (!activeChatResources.has(chatResourceKey)) {
					modelRef.dispose();
					return;
				}
				chatModelRefs.set(chatResourceKey, modelRef);
			})
			.catch(onUnexpectedError)
			.finally(() => {
				loadingChatResources.delete(chatResourceKey);
			});
	}

	private disposeInactiveChatModels(
		activeChatResources: Set<string>,
		chatModelRefs: Map<string, IChatModelReference>,
	): void {
		for (const [chatResourceKey, modelRef] of chatModelRefs) {
			if (!activeChatResources.has(chatResourceKey)) {
				modelRef.dispose();
				chatModelRefs.delete(chatResourceKey);
			}
		}
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
