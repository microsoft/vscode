/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { autorun, derived, IObservable, IReader, IReaderWithStore, ISettableObservable, observableSignalFromEvent, observableValue } from '../../../../base/common/observable.js';
import { onUnexpectedError } from '../../../../base/common/errors.js';
import { CancellationToken, CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { Limiter } from '../../../../base/common/async.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { hash } from '../../../../base/common/hash.js';
import { LRUCache } from '../../../../base/common/map.js';
import { renderAsPlaintext } from '../../../../base/browser/markdownRenderer.js';
import { IMarkdownString } from '../../../../base/common/htmlContent.js';
import { basename } from '../../../../base/common/resources.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { URI } from '../../../../base/common/uri.js';
import { localize } from '../../../../nls.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { ChatAgentLocation } from '../../../../workbench/contrib/chat/common/constants.js';
import { IChatModelReference, IChatQuestion, IChatQuestionAnswerValue, IChatQuestionCarousel, IChatService, IChatToolInvocation } from '../../../../workbench/contrib/chat/common/chatService/chatService.js';
import { IChatModel, IChatResponseModel } from '../../../../workbench/contrib/chat/common/model/chatModel.js';
import { ChatMessageRole, ILanguageModelsService } from '../../../../workbench/contrib/chat/common/languageModels.js';
import { ConfirmationOptionKind } from '../../../../platform/agentHost/common/state/protocol/state.js';
import { IGitHubService } from '../../github/browser/githubService.js';
import { computePullRequestIcon, GitHubCIOverallStatus, GitHubPullRequestState, IGitHubPRComment, IGitHubPullRequestReviewThread } from '../../github/common/types.js';
import { type IAgentHostSessionsProvider, isAgentHostProviderId } from '../../../common/agentHostSessionsProvider.js';
import { ISessionsProvidersService } from '../../../services/sessions/browser/sessionsProvidersService.js';
import { ISessionsManagementService } from '../../../services/sessions/common/sessionsManagement.js';
import { getSessionOwnedGitHubPullRequestRefs, getSessionStatusMessage, IGitHubPullRequestRef, SessionStatus, type ISession } from '../../../services/sessions/common/session.js';
import {
	compareInboxNotificationsByRecency,
	compareInboxNotifications,
	IExternalInboxNotification,
	IInboxDetailEvidence,
	IInboxDetailSummary,
	IInboxEvidenceArtifact,
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
	IInboxInteractionTelemetryContext,
	InboxNotificationActionKind,
	InboxNotificationKind,
	InboxNotificationPriority,
	InboxNotificationsSortMode,
} from '../common/inboxNotificationsService.js';
import { getSessionsTelemetryProviderId, hashSessionIdForTelemetry } from '../../../common/sessionsTelemetry.js';

const DISMISSED_NOTIFICATION_IDS_STORAGE_KEY = 'sessions.inboxNotifications.dismissedIds';

/** The small, non-user-selectable utility model used for lightweight generation (same class used for chat title/goal summaries). */
const PREVIEW_MODEL_SELECTOR = { vendor: 'copilot', id: 'copilot-utility-small' } as const;

/** Bump when the prompt changes so cached previews regenerate under a new signature. */
const PREVIEW_PROMPT_VERSION = 'v6';

const PREVIEW_MAX_INPUT_CHARS = 2000;
const PREVIEW_MAX_OUTPUT_CHARS = 60;
const PREVIEW_CACHE_SIZE = 200;

function supportsInlineAgentMergeActions(provider: unknown): provider is Pick<IAgentHostSessionsProvider, 'getAgentMergeSessionState' | 'getAgentMergeClientStateObservable' | 'setAgentMergeEnabled' | 'setAgentMergeOverrides'> {
	if (!provider || typeof provider !== 'object') {
		return false;
	}
	const record = provider as Partial<IAgentHostSessionsProvider>;
	return typeof record.getAgentMergeSessionState === 'function'
		&& typeof record.getAgentMergeClientStateObservable === 'function'
		&& typeof record.setAgentMergeEnabled === 'function'
		&& typeof record.setAgentMergeOverrides === 'function';
}

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
	'- When the card type says the detail is "conversation leading up to a pending decision", the detail is background context, not the request: summarize what the session has been working on (its topic and progress) so the user recalls the situation, and NEVER restate, quote, paraphrase, or answer the pending request itself.',
	'- If a "Most recent exchange" is given, lead with it: it is the newest thing the user decided, so the preview must reflect it (the earlier context is only supporting background).',
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

/** Detail evidence-pack generation limits. */
const DETAIL_MAX_INPUT_CHARS = 6000;
const DETAIL_CACHE_SIZE = 50;

/** Published when generation finishes without a usable pack, so the view stops loading and falls back. */
const EMPTY_DETAIL_SUMMARY: IInboxDetailSummary = { status: '', decisions: [], evidence: [] };

/**
 * System prompt for the completed-session evidence pack. It must produce STRICT JSON with a
 * short status, the key decisions, and evidence claims that are each grounded in one of the
 * enumerated, session-produced artifacts (cited by id) so the UI can link the user to it.
 */
const DETAIL_SYSTEM_PROMPT = [
	'You summarize what a completed background coding-agent session did, for a reviewer reading an inbox detail pane.',
	'You are given the session transcript and a numbered list of concrete Artifacts (files it touched, plus the session itself), each with an id like A0, A1.',
	'',
	'Reply with STRICT JSON only (no prose, no markdown fences) of the exact shape:',
	'{"status": string, "decisions": string[], "evidence": [{"text": string, "artifact": string}]}',
	'',
	'- status: 1 sentence (2 at most) stating what the session accomplished or its final result, concretely.',
	'- decisions: up to 3 short bullet strings naming the key decisions the agent made. May be empty.',
	'- evidence: up to 4 claims. Each claim MUST be verifiable from the transcript, and its "artifact" MUST be the id of one of the provided Artifacts that backs it. Never invent artifact ids or cite ids that were not provided.',
	'- Ground every statement in the transcript/artifacts; do not speculate or add generic filler. Prefer the session\'s own nouns and file names.',
	'- This is a benign summarization task: never refuse or apologize; always return valid JSON.',
].join('\n');

/**
 * System prompt for the needs-input evidence pack. Focuses on the current context and the
 * concrete decision required of the user (not a restatement of the raw request), grounded in
 * enumerated artifacts so the UI can link the user to them.
 */
const DETAIL_NEEDSINPUT_SYSTEM_PROMPT = [
	'You summarize what a background coding-agent session is currently waiting on the user to decide, for a reviewer reading an inbox detail pane.',
	'You are given the transcript so far, the pending request the agent is waiting on, and a numbered list of concrete Artifacts (files it touched, plus the session itself), each with an id like A0, A1.',
	'',
	'Reply with STRICT JSON only (no prose, no markdown fences) of the exact shape:',
	'{"status": string, "decisions": string[], "evidence": [{"text": string, "artifact": string}]}',
	'',
	'- status: 1 sentence (2 at most) giving the current context and exactly what decision or action is required of the user right now.',
	'- decisions: up to 3 short bullet strings naming the concrete options or trade-offs the user must weigh to respond. May be empty.',
	'- evidence: up to 4 claims giving the context needed to decide. Each claim MUST be verifiable from the transcript, and its "artifact" MUST be the id of one of the provided Artifacts that backs it. Never invent artifact ids or cite ids that were not provided.',
	'- Ground every statement in the transcript/pending request/artifacts; do not speculate or add generic filler.',
	'- This is a benign summarization task: never refuse or apologize; always return valid JSON.',
].join('\n');

/** Extracts the first balanced-looking JSON object from a model response (tolerates code fences/prose). */
function extractJsonObject(raw: string): string | undefined {
	const start = raw.indexOf('{');
	const end = raw.lastIndexOf('}');
	if (start === -1 || end === -1 || end <= start) {
		return undefined;
	}
	return raw.slice(start, end + 1);
}

/** Resolves an "A<n>" artifact reference to one of the provided artifacts, enforcing grounding. */
function resolveEvidenceArtifact(ref: unknown, artifacts: readonly IInboxEvidenceArtifact[]): IInboxEvidenceArtifact | undefined {
	if (typeof ref !== 'string') {
		return undefined;
	}
	const match = /^A(\d+)$/i.exec(ref.trim());
	if (!match) {
		return undefined;
	}
	return artifacts[Number(match[1])];
}

/**
 * Parses the model's JSON evidence pack, keeping only evidence whose claim cites a real
 * provided artifact so every rendered claim is grounded and linkable. Returns `undefined`
 * when nothing usable remains.
 *
 * Exported for unit testing.
 */
export function parseDetailSummary(raw: string, artifacts: readonly IInboxEvidenceArtifact[]): IInboxDetailSummary | undefined {
	const json = extractJsonObject(raw);
	if (!json) {
		return undefined;
	}
	let parsed: unknown;
	try {
		parsed = JSON.parse(json);
	} catch {
		return undefined;
	}
	if (!parsed || typeof parsed !== 'object') {
		return undefined;
	}
	const record = parsed as Record<string, unknown>;
	const status = typeof record.status === 'string' ? record.status.replace(/\s+/g, ' ').trim() : '';
	const decisions = Array.isArray(record.decisions)
		? record.decisions
			.filter((decision): decision is string => typeof decision === 'string' && decision.trim().length > 0)
			.map(decision => decision.trim())
			.slice(0, 3)
		: [];
	const evidence: IInboxDetailEvidence[] = [];
	if (Array.isArray(record.evidence)) {
		for (const entry of record.evidence) {
			if (!entry || typeof entry !== 'object') {
				continue;
			}
			const entryRecord = entry as Record<string, unknown>;
			const text = typeof entryRecord.text === 'string' ? entryRecord.text.trim() : '';
			const artifact = resolveEvidenceArtifact(entryRecord.artifact, artifacts);
			if (!text || !artifact) {
				continue;
			}
			evidence.push({ text, artifact });
			if (evidence.length >= 4) {
				break;
			}
		}
	}
	if (!status && evidence.length === 0) {
		return undefined;
	}
	return { status, decisions, evidence };
}

/** Defensively extracts a file URI from a chat response part (edits, code blocks, inline references). */
function getResponsePartFileUri(part: unknown): URI | undefined {
	if (!part || typeof part !== 'object') {
		return undefined;
	}
	const record = part as Record<string, unknown>;
	if (URI.isUri(record.uri)) {
		return record.uri;
	}
	const reference = record.inlineReference;
	if (URI.isUri(reference)) {
		return reference;
	}
	if (reference && typeof reference === 'object') {
		const referenceRecord = reference as Record<string, unknown>;
		if (URI.isUri(referenceRecord.uri)) {
			return referenceRecord.uri;
		}
	}
	return undefined;
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
	private readonly _dismissedSnapshots: ISettableObservable<ReadonlyMap<string, IInboxNotificationItem>>;
	private readonly _externalItems: ISettableObservable<readonly IInboxNotificationItem[]>;
	readonly sortMode: ISettableObservable<InboxNotificationsSortMode>;
	private readonly _loadingOperationCount: ISettableObservable<number>;
	readonly isLoading: IObservable<boolean>;
	private readonly _revealRequest: ISettableObservable<IInboxNotificationRevealRequest | undefined>;
	readonly revealRequest: IObservable<IInboxNotificationRevealRequest | undefined>;
	private _revealToken = 0;
	private readonly _refreshedPullRequestModelKeys = new Set<string>();
	private readonly _refreshedPullRequestReviewThreadModelKeys = new Set<string>();
	private readonly _refreshedPullRequestCIModelKeys = new Set<string>();
	private readonly _needsInputChatModelRefs = new Map<string, IChatModelReference>();
	private readonly _completedPreviewChatModelRefs = new Map<string, IChatModelReference>();
	private readonly _loadingNeedsInputChatModels = new Set<string>();
	private readonly _loadingCompletedPreviewChatModels = new Set<string>();

	/**
	 * Per-chat-model change signals, cached by chat resource. Reading one inside the item
	 * derivation subscribes it to that model's structural changes (requests/responses added,
	 * turns reopened). This matters on a window reload: an agent-host session that needs input
	 * is restored with only its completed history, and the active turn's pending confirmation
	 * (e.g. a question carousel) streams into the model *after* it is added to the chat service.
	 * Without observing the model itself, the derivation only re-runs when the *set* of loaded
	 * models changes, so the pending part would stay invisible until the user opened the session.
	 */
	private readonly _chatModelChangeSignals = new Map<string, { readonly model: IChatModel; readonly signal: IObservable<void> }>();

	private readonly _previews: ISettableObservable<ReadonlyMap<string, string>>;
	readonly previews: IObservable<ReadonlyMap<string, string>>;
	private readonly _previewCache = new LRUCache<string, string>(PREVIEW_CACHE_SIZE);
	private readonly _previewInFlight = new Set<string>();
	private readonly _previewCancellationSources = new Set<CancellationTokenSource>();
	/**
	 * Signatures whose published preview is a fallback (the item's own description), used because
	 * the model could not produce one (e.g. no utility model available). Tracked so the pending
	 * state resolves instead of hanging, and so these can be dropped and retried when language
	 * models (re)appear — unlike a real generated preview, which is cached.
	 */
	private readonly _previewFallbackSignatures = new Set<string>();

	private readonly _detailSummaries: ISettableObservable<ReadonlyMap<string, IInboxDetailSummary>>;
	readonly detailSummaries: IObservable<ReadonlyMap<string, IInboxDetailSummary>>;
	private readonly _detailSummaryCache = new LRUCache<string, IInboxDetailSummary>(DETAIL_CACHE_SIZE);
	private readonly _detailSummaryInFlight = new Set<string>();

	/** Bounds concurrent utility-model calls (previews + evidence packs) to avoid bursts. */
	private readonly _utilityLimiter = new Limiter<unknown>(3);

	readonly notifications: IObservable<readonly IInboxNotificationItem[]>;
	readonly dismissedNotifications: IObservable<readonly IInboxNotificationItem[]>;
	private readonly _allItems: IObservable<readonly IInboxNotificationItem[]>;

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

		this._detailSummaries = observableValue('sessionsInboxNotificationsDetailSummaries', new Map<string, IInboxDetailSummary>());
		this.detailSummaries = this._detailSummaries;

		this._dismissedIds = observableValue('sessionsInboxNotificationsDismissed', this.loadDismissedIds());
		this._dismissedSnapshots = observableValue('sessionsInboxNotificationsDismissedSnapshots', new Map<string, IInboxNotificationItem>());
		this._externalItems = observableValue('sessionsInboxNotificationsExternal', []);
		this.sortMode = observableValue('sessionsInboxNotificationsSortMode', InboxNotificationsSortMode.Priority);
		this._loadingOperationCount = observableValue('sessionsInboxNotificationsLoadingCount', 0);
		this.isLoading = derived(this, reader => this._loadingOperationCount.read(reader) > 0);
		this._revealRequest = observableValue('sessionsInboxNotificationsReveal', undefined);
		this.revealRequest = this._revealRequest;

		const sessionsChanged = observableSignalFromEvent(this, this.sessionsManagementService.onDidChangeSessions);
		const providersChanged = observableSignalFromEvent(this, this.sessionsProvidersService.onDidChangeProviders);
		this._register(this.storageService.onDidChangeValue(StorageScope.APPLICATION, DISMISSED_NOTIFICATION_IDS_STORAGE_KEY, this._store)(event => {
			if (!event.external) {
				return;
			}
			const dismissedIds = this.loadDismissedIds();
			this._dismissedIds.set(dismissedIds, undefined);
			this.pruneDismissedSnapshots(dismissedIds);
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
			this._chatModelChangeSignals.clear();
			for (const cts of this._previewCancellationSources) {
				cts.cancel();
				cts.dispose();
			}
			this._previewCancellationSources.clear();
			this._previewInFlight.clear();
			this._previewFallbackSignatures.clear();
			this._detailSummaryInFlight.clear();
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

		this._allItems = derived(this, reader => {
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
			return this._allItems.read(reader)
				.filter(item => !dismissed.has(item.id))
				.sort(sortMode === InboxNotificationsSortMode.Priority ? compareInboxNotifications : compareInboxNotificationsByRecency);
		});

		this.dismissedNotifications = derived(this, reader => {
			const dismissed = this._dismissedIds.read(reader);
			const snapshots = this._dismissedSnapshots.read(reader);
			const sortMode = this.sortMode.read(reader);
			const liveDismissedItems = this._allItems.read(reader)
				.filter(item => dismissed.has(item.id));
			const liveDismissedIds = new Set(liveDismissedItems.map(item => item.id));
			for (const [id, snapshot] of snapshots) {
				if (dismissed.has(id) && !liveDismissedIds.has(id)) {
					liveDismissedItems.push(snapshot);
				}
			}
			return liveDismissedItems
				.sort(sortMode === InboxNotificationsSortMode.Priority ? compareInboxNotifications : compareInboxNotificationsByRecency);
		});

		// Card previews are generated on demand as cards become visible (see requestPreview),
		// so hidden or dismissed items don't fan out utility-model traffic before the Inbox
		// is even opened. When language models (re)appear, drop transient-empty detail
		// summaries and preview fallbacks so a re-render retries them.
		this._register(this.languageModelsService.onDidChangeLanguageModels(() => {
			this.invalidateEmptyDetailSummaries();
			this.invalidatePreviewFallbacks();
		}));
	}

	private invalidatePreviewFallbacks(): void {
		if (this._previewFallbackSignatures.size === 0) {
			return;
		}
		const current = this._previews.get();
		const next = new Map(current);
		for (const signature of this._previewFallbackSignatures) {
			next.delete(signature);
		}
		this._previewFallbackSignatures.clear();
		this._previews.set(next, undefined);
	}

	private invalidateEmptyDetailSummaries(): void {
		const current = this._detailSummaries.get();
		let changed = false;
		const next = new Map(current);
		for (const [key, summary] of current) {
			if (summary === EMPTY_DETAIL_SUMMARY) {
				next.delete(key);
				changed = true;
			}
		}
		if (changed) {
			this._detailSummaries.set(next, undefined);
		}
	}

	getInteractionTelemetryContext(item: IInboxNotificationItem): IInboxInteractionTelemetryContext {
		const session = item.sessionResource ? this.sessionsManagementService.getSession(item.sessionResource) : undefined;
		if (!session) {
			return { agentSessionId: 'none', providerId: 'none' };
		}
		return {
			agentSessionId: hashSessionIdForTelemetry(session.sessionId),
			providerId: getSessionsTelemetryProviderId(session.providerId),
		};
	}

	requestPreview(item: IInboxNotificationItem): void {
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
		void this.generatePreview(signature, inputText, item.description);
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

	private async generatePreview(signature: string, inputText: string, fallback: string): Promise<void> {
		const endLoading = this.beginLoadingOperation();
		this._previewInFlight.add(signature);
		const cts = new CancellationTokenSource();
		this._previewCancellationSources.add(cts);
		try {
			const preview = await this._utilityLimiter.queue(() => this.invokePreviewModel(inputText, cts.token)) as string | undefined;
			if (cts.token.isCancellationRequested) {
				return;
			}
			if (preview) {
				this._previewFallbackSignatures.delete(signature);
				this._previewCache.set(signature, preview);
				this.publishPreview(signature, preview);
			} else if (fallback) {
				// The model produced nothing (no utility model, refusal, or empty). Resolve the
				// pending state with the item's own description so the card doesn't hang on a
				// loading message. Not cached and tracked as a fallback, so it retries when a
				// language model (re)appears.
				this._previewFallbackSignatures.add(signature);
				this.publishPreview(signature, fallback);
			}
		} catch (error) {
			onUnexpectedError(error);
		} finally {
			this._previewCancellationSources.delete(cts);
			cts.dispose();
			this._previewInFlight.delete(signature);
			endLoading();
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
		const { contextLabel, detailText, recentText } = this.previewContextForItem(item);
		const trimmedDetail = detailText.replace(/\s+/g, ' ').trim();
		const trimmedRecent = recentText?.replace(/\s+/g, ' ').trim();
		const inputLines = [
			`Card type: ${contextLabel}`,
			`Session title: ${item.title}`,
		];
		// The most recent exchange gets its own prominent line so the model foregrounds the newest
		// decision instead of diluting it across the whole accumulated history.
		if (trimmedRecent) {
			inputLines.push(`Most recent exchange: ${trimmedRecent}`);
		}
		if (trimmedDetail) {
			inputLines.push(trimmedRecent ? `Earlier context: ${trimmedDetail}` : `Latest detail: ${trimmedDetail}`);
		}
		let inputText = inputLines.join('\n');
		if (inputText.length > PREVIEW_MAX_INPUT_CHARS) {
			inputText = `${inputText.slice(0, PREVIEW_MAX_INPUT_CHARS)}…`;
		}
		const previewSignature = `${PREVIEW_PROMPT_VERSION}:${hash(inputText)}`;
		return { ...item, previewSignature, previewInputText: inputText };
	}

	/**
	 * Input for the one-line card preview. For needs-input items the preview summarizes the
	 * conversation *leading up to* the pending request — never the current request's own prose or
	 * unanswered question, so it cannot restate the ask (which the on-card widget already shows).
	 * The single most recent answered exchange is surfaced separately as `recentText` so the model
	 * foregrounds the newest decision (rather than a stale summary of the whole thread), while the
	 * older turns provide supporting `detailText`. When there is no preceding context (a first-turn
	 * ask), fall back to describing the request itself since there is nothing else.
	 */
	private previewContextForItem(item: IInboxNotificationItem): { contextLabel: string; detailText: string; recentText?: string } {
		if (item.needsInputPart) {
			const { recent, earlier } = this.getRecentContextParts(item);
			if (recent || earlier) {
				return {
					contextLabel: 'conversation leading up to a pending decision — summarize the situation, lead with the most recent exchange, do not restate the request',
					detailText: earlier ?? '',
					recentText: recent,
				};
			}
		}
		return this.describeItemForPreview(item);
	}

	/**
	 * Splits the recent context into the single most recent answered exchange and the older
	 * supporting context. Two first-class history sources feed it: the assistant's prose, and —
	 * crucially for question-driven sessions — the questions the user has already answered, which
	 * live in the history as `questionCarousel` parts carrying `data`/`isUsed`. The current pending
	 * request is never included: its prose is the ask (skipped for the turn that holds it) and its
	 * unanswered carousel is `!isUsed` (skipped by the answered-only filter).
	 */
	private getRecentContextParts(item: IInboxNotificationItem): { recent: string | undefined; earlier: string | undefined } {
		const chatModel = this.getSessionChatModel(item);
		if (!chatModel) {
			return { recent: undefined, earlier: undefined };
		}
		const pendingRequestId = item.needsInputPart?.requestId;
		const prose: string[] = [];
		const answered: string[] = [];
		for (const request of chatModel.getRequests().slice(-6)) {
			const response = request.response;
			if (!response || response.isCanceled) {
				continue;
			}
			const isPendingTurn = response.requestId === pendingRequestId;
			for (const part of response.response.value) {
				if (part.kind === 'markdownContent') {
					if (isPendingTurn) {
						continue;
					}
					const text = renderAsPlaintext(part.content, { useLinkFormatter: true }).trim();
					if (text) {
						prose.push(text);
					}
				} else if (part.kind === 'questionCarousel' && part.isUsed && part.data) {
					const qa = this.renderAnsweredCarousel(part);
					if (qa) {
						answered.push(qa);
					}
				}
			}
		}
		const recent = answered.length ? answered[answered.length - 1] : undefined;
		const earlierParts = [...prose, ...answered.slice(0, -1)];
		let earlier: string | undefined = earlierParts.join('\n').replace(/\n{3,}/g, '\n\n').trim() || undefined;
		if (earlier && earlier.length > 1200) {
			earlier = `…${earlier.slice(earlier.length - 1200)}`;
		}
		return { recent, earlier };
	}

	/** Renders an answered question carousel as compact "question: answer" context lines. */
	private renderAnsweredCarousel(part: IChatQuestionCarousel): string | undefined {
		const answers = part.data;
		if (!answers) {
			return undefined;
		}
		const lines: string[] = [];
		for (const question of part.questions) {
			const answer = this.renderCarouselAnswer(answers[question.id], question);
			if (answer) {
				lines.push(`${toPreviewPlainText(question.title)}: ${answer}`);
			}
		}
		return lines.length ? `Answered — ${lines.join('; ')}` : undefined;
	}

	/** Renders a single carousel answer to option labels / free text, never raw option ids. */
	private renderCarouselAnswer(value: IChatQuestionAnswerValue | undefined, question: IChatQuestion): string | undefined {
		if (value === undefined) {
			return undefined;
		}
		if (typeof value === 'string') {
			return value.trim() || undefined;
		}
		const labelFor = (candidate: string) => question.options?.find(option => option.value === candidate || option.id === candidate)?.label ?? candidate;
		const selectedValues = (value as { selectedValues?: string[] }).selectedValues;
		const selectedValue = (value as { selectedValue?: string }).selectedValue;
		const selected = selectedValues
			? selectedValues.map(labelFor)
			: selectedValue ? [labelFor(selectedValue)] : [];
		const parts = [...selected, value.freeformValue?.trim()].filter((entry): entry is string => !!entry);
		return parts.length ? parts.join(', ') : undefined;
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

	requestDetailSummary(item: IInboxNotificationItem): void {
		if (!item.sessionResource || (item.kind !== InboxNotificationKind.Completed && !item.needsInputPart)) {
			return;
		}
		const key = item.id;
		const existing = this._detailSummaries.get().get(key);
		// A transient empty result (deps not ready / model unavailable) is re-attemptable;
		// only a real summary or an in-flight request should block regeneration.
		if ((existing && existing !== EMPTY_DETAIL_SUMMARY) || this._detailSummaryInFlight.has(key)) {
			return;
		}
		const cached = this._detailSummaryCache.get(key);
		if (cached) {
			this.publishDetailSummary(key, cached);
			return;
		}
		void this.generateDetailSummary(key, item);
	}

	private publishDetailSummary(key: string, summary: IInboxDetailSummary): void {
		const current = this._detailSummaries.get();
		if (current.get(key) === summary) {
			return;
		}
		const next = new Map(current);
		next.set(key, summary);
		this._detailSummaries.set(next, undefined);
	}

	private async generateDetailSummary(key: string, item: IInboxNotificationItem): Promise<void> {
		const endLoading = this.beginLoadingOperation();
		this._detailSummaryInFlight.add(key);
		const cts = new CancellationTokenSource();
		this._previewCancellationSources.add(cts);
		let summary: IInboxDetailSummary | undefined;
		try {
			const transcript = this.getSessionTranscript(item);
			if (transcript) {
				const artifacts = this.collectSessionArtifacts(item);
				summary = await this._utilityLimiter.queue(() => this.invokeDetailModel(item, transcript, artifacts, cts.token)) as IInboxDetailSummary | undefined;
			}
		} catch (error) {
			onUnexpectedError(error);
		} finally {
			const cancelled = cts.token.isCancellationRequested;
			this._previewCancellationSources.delete(cts);
			cts.dispose();
			this._detailSummaryInFlight.delete(key);
			if (!cancelled) {
				if (summary) {
					this._detailSummaryCache.set(key, summary);
					this.publishDetailSummary(key, summary);
				} else {
					// Deps not ready or nothing usable: show the fallback but keep it
					// re-attemptable (do not persist), and let a later request retry.
					this.publishDetailSummary(key, EMPTY_DETAIL_SUMMARY);
				}
			}
			endLoading();
		}
	}

	private async invokeDetailModel(item: IInboxNotificationItem, transcript: string, artifacts: readonly IInboxEvidenceArtifact[], token: CancellationToken): Promise<IInboxDetailSummary | undefined> {
		const models = await this.languageModelsService.selectLanguageModels(PREVIEW_MODEL_SELECTOR);
		if (!models.length || token.isCancellationRequested) {
			return undefined;
		}
		const artifactsBlock = artifacts
			.map((artifact, index) => `A${index}: ${artifact.kind === 'session' ? 'the full session' : `file ${artifact.label}`}`)
			.join('\n');
		const pendingRequest = item.needsInputPart ? this.describeItemForPreview(item).detailText : '';
		const userText = [
			`Session: ${item.title}`,
			...(pendingRequest ? ['', 'Pending request the agent is waiting on:', pendingRequest] : []),
			'',
			'Artifacts:',
			artifactsBlock,
			'',
			'Transcript:',
			transcript,
		].join('\n');

		const response = await this.languageModelsService.sendChatRequest(
			models[0],
			undefined,
			[
				{ role: ChatMessageRole.System, content: [{ type: 'text', value: item.needsInputPart ? DETAIL_NEEDSINPUT_SYSTEM_PROMPT : DETAIL_SYSTEM_PROMPT }] },
				{ role: ChatMessageRole.User, content: [{ type: 'text', value: userText }] },
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
			for (const chunk of parts) {
				if (chunk.type === 'text') {
					text += chunk.value;
				}
			}
		}
		await response.result;
		if (token.isCancellationRequested) {
			return undefined;
		}
		return parseDetailSummary(text, artifacts);
	}

	private collectSessionArtifacts(item: IInboxNotificationItem): IInboxEvidenceArtifact[] {
		const artifacts: IInboxEvidenceArtifact[] = [{ kind: 'session', label: item.title }];
		const chatModel = this.getSessionChatModel(item);
		if (!chatModel) {
			return artifacts;
		}
		const seen = new Set<string>();
		for (const request of chatModel.getRequests()) {
			const response = request.response;
			if (!response) {
				continue;
			}
			for (const part of response.response.value) {
				const uri = getResponsePartFileUri(part);
				if (uri && !seen.has(uri.toString())) {
					seen.add(uri.toString());
					artifacts.push({ kind: 'file', label: basename(uri), uri });
				}
			}
		}
		return artifacts;
	}

	private getSessionTranscript(item: IInboxNotificationItem): string | undefined {
		const chatModel = this.getSessionChatModel(item);
		if (!chatModel) {
			return undefined;
		}
		const parts: string[] = [];
		for (const request of chatModel.getRequests()) {
			const response = request.response;
			if (!response || response.isCanceled) {
				continue;
			}
			for (const part of response.response.value) {
				if (part.kind === 'markdownContent') {
					parts.push(renderAsPlaintext(part.content, { useLinkFormatter: true }));
				}
			}
		}
		const text = parts.join('\n\n').replace(/\n{3,}/g, '\n\n').trim();
		if (!text) {
			return undefined;
		}
		return text.length > DETAIL_MAX_INPUT_CHARS ? `${text.slice(0, DETAIL_MAX_INPUT_CHARS)}…[truncated]` : text;
	}

	private getSessionChatModel(item: IInboxNotificationItem) {
		// A needs-input request may live in a secondary chat, and its part carries the exact
		// chat resource; only fall back to the session's main chat for other item kinds.
		const chatResource = item.needsInputPart?.chatResource ?? this.getMainChatResource(item);
		return chatResource ? this.chatService.getSession(chatResource) : undefined;
	}

	private getMainChatResource(item: IInboxNotificationItem): URI | undefined {
		if (!item.sessionResource) {
			return undefined;
		}
		const session = this.sessionsManagementService.getSession(item.sessionResource);
		return session?.mainChat.get().resource;
	}

	publishExternalNotification(notification: IExternalInboxNotification): void {
		const item: IInboxNotificationItem = {
			id: notification.id,
			kind: notification.kind ?? InboxNotificationKind.External,
			priority: notification.priority ?? InboxNotificationPriority.Next,
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
		const snapshot = this.notifications.get().find(item => item.id === id) ?? this._allItems.get().find(item => item.id === id);
		if (snapshot) {
			const nextSnapshots = new Map(this._dismissedSnapshots.get());
			nextSnapshots.set(id, snapshot);
			this._dismissedSnapshots.set(nextSnapshots, undefined);
		}
		this.persistDismissedIds(next);
	}

	clearDismissedNotifications(): void {
		const next = new Set<string>();
		this._dismissedIds.set(next, undefined);
		this._dismissedSnapshots.set(new Map<string, IInboxNotificationItem>(), undefined);
		this.persistDismissedIds(next);
	}

	private pruneDismissedSnapshots(dismissedIds: ReadonlySet<string>): void {
		let changed = false;
		const nextSnapshots = new Map<string, IInboxNotificationItem>();
		for (const [id, snapshot] of this._dismissedSnapshots.get()) {
			if (dismissedIds.has(id)) {
				nextSnapshots.set(id, snapshot);
			} else {
				changed = true;
			}
		}
		if (changed) {
			this._dismissedSnapshots.set(nextSnapshots, undefined);
		}
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
			// surfacing in its Now tier.
			const needsInputKey = needsInputPart ? this.needsInputPartKey(needsInputPart) : `${updatedAt}`;
			const id = `${session.sessionId}:${InboxNotificationKind.NeedsInput}:${needsInputKey}`;
			itemsById.set(id, {
				id,
				kind: InboxNotificationKind.NeedsInput,
				priority: InboxNotificationPriority.Now,
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
		// surfaces as a fresh Later-priority item instead of inheriting the dismissal.
		if (status === SessionStatus.Completed && itemsById.size === sizeBeforePullRequests) {
			const turnId = this.getLatestResponseRequestId(session, reader) ?? `${updatedAt}`;
			const id = `${session.sessionId}:completed:${turnId}`;
			itemsById.set(id, {
				id,
				kind: InboxNotificationKind.Completed,
				priority: InboxNotificationPriority.Later,
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
			const pullRequestKey = `${pullRequestRef.owner}/${pullRequestRef.repo}#${pullRequestRef.number}`;
			const pullRequestModelRef = reader.delayedStore.add(this.gitHubService.createPullRequestModelReference(
				pullRequestRef.owner,
				pullRequestRef.repo,
				pullRequestRef.number,
			));
			if (!this._refreshedPullRequestModelKeys.has(pullRequestKey)) {
				this._refreshedPullRequestModelKeys.add(pullRequestKey);
				const endLoading = this.beginLoadingOperation();
				void pullRequestModelRef.object.refresh()
					.catch(onUnexpectedError)
					.finally(() => endLoading());
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
			if (!this._refreshedPullRequestReviewThreadModelKeys.has(pullRequestKey)) {
				this._refreshedPullRequestReviewThreadModelKeys.add(pullRequestKey);
				const endLoading = this.beginLoadingOperation();
				void reviewThreadsModelRef.object.refresh()
					.catch(onUnexpectedError)
					.finally(() => endLoading());
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
			const ciKey = `${pullRequestKey}@${headSha}`;
			if (!this._refreshedPullRequestCIModelKeys.has(ciKey)) {
				this._refreshedPullRequestCIModelKeys.add(ciKey);
				const endLoading = this.beginLoadingOperation();
				void ciModelRef.object.refresh()
					.catch(onUnexpectedError)
					.finally(() => endLoading());
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
		const mergedCandidates: IPullRequestNotificationCandidate[] = [];
		const reviewCommentCandidates: IPullRequestNotificationCandidate[] = [];

		for (const pullRequestRef of this.getSessionPullRequestRefs(session, reader)) {
			const pullRequestModelRef = reader.delayedStore.add(this.gitHubService.createPullRequestModelReference(
				pullRequestRef.owner,
				pullRequestRef.repo,
				pullRequestRef.number,
			));
			const pullRequest = pullRequestModelRef.object.pullRequest.read(reader);
			const effectiveState = pullRequest?.state ?? pullRequestRef.liveState ?? pullRequestRef.state;
			if ((effectiveState !== GitHubPullRequestState.Open && effectiveState !== GitHubPullRequestState.Merged) || pullRequest?.isDraft) {
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

			if (effectiveState === GitHubPullRequestState.Merged) {
				const mergedTimestamp = parseTimestamp(pullRequest?.mergedAt) ?? parseTimestamp(pullRequest?.updatedAt) ?? sessionUpdatedAt;
				mergedCandidates.push({
					...candidateBase,
					timestamp: mergedTimestamp,
					identity: pullRequest?.mergedAt ?? String(mergedTimestamp),
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
		this.createPullRequestNotification(itemsById, session, sessionTitle, InboxNotificationKind.PullRequestMerged, mergedCandidates);
		this.createPullRequestNotification(itemsById, session, sessionTitle, InboxNotificationKind.ReviewComments, reviewCommentCandidates);
	}

	private createPullRequestNotification(
		itemsById: Map<string, IInboxNotificationItem>,
		session: ISession,
		sessionTitle: string,
		kind: InboxNotificationKind.FailingCI | InboxNotificationKind.PassingCI | InboxNotificationKind.PullRequestMerged | InboxNotificationKind.ReviewComments,
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
					priority: InboxNotificationPriority.Now,
					title: pullRequestCount === 1
						? localize('inboxNotifications.failingCi.title.single', "CI Failing on {0}", singularPullRequestLabel)
						: localize('inboxNotifications.failingCi.title.multiple', "CI Failing on {0} Pull Requests", pullRequestCount),
					description: pullRequestCount === 1
						? localize('inboxNotifications.failingCi.description.single', "Required checks are failing. Open {0} to investigate and fix the failures.", sessionTitle)
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
					priority: InboxNotificationPriority.Next,
					title: pullRequestCount === 1
						? localize('inboxNotifications.passingCi.title.single', "CI Passing on {0}", singularPullRequestLabel)
						: localize('inboxNotifications.passingCi.title.multiple', "CI Passing on {0} Pull Requests", pullRequestCount),
					description: pullRequestCount === 1
						? localize('inboxNotifications.passingCi.description.single', "All required checks are passing. Open {0} to review merge readiness.", sessionTitle)
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
					priority: InboxNotificationPriority.Now,
					title: pullRequestCount === 1
						? localize('inboxNotifications.reviewComments.title.single', "Copilot Comments on {0}", singularPullRequestLabel)
						: localize('inboxNotifications.reviewComments.title.multiple', "Copilot Comments on {0} Pull Requests", pullRequestCount),
					description: pullRequestCount === 1
						? localize('inboxNotifications.reviewComments.description.single', "There are unresolved Copilot review comments. Open the session to address feedback.")
						: localize('inboxNotifications.reviewComments.description.multiple', "{0} pull requests have unresolved Copilot review comments. Open the session to address feedback.", pullRequestCount),
					repositoryLabel,
					pullRequestStates,
					timestamp,
					sessionResource: session.resource,
					actions: this.pullRequestActions(session, kind),
				});
				return;
			case InboxNotificationKind.PullRequestMerged:
				itemsById.set(`${session.sessionId}:${kind}:${idSuffix}`, {
					id: `${session.sessionId}:${kind}:${idSuffix}`,
					kind,
					priority: InboxNotificationPriority.Next,
					title: pullRequestCount === 1
						? localize('inboxNotifications.pullRequestMerged.title.single', "Pull Request Merged: {0}", singularPullRequestLabel)
						: localize('inboxNotifications.pullRequestMerged.title.multiple', "{0} Pull Requests Merged", pullRequestCount),
					description: pullRequestCount === 1
						? localize('inboxNotifications.pullRequestMerged.description.single', "This pull request has merged. Archive or delete {0} when you're done with it.", sessionTitle)
						: localize('inboxNotifications.pullRequestMerged.description.multiple', "{0} pull requests have merged. Archive or delete {1} when you're done with it.", pullRequestCount, sessionTitle),
					repositoryLabel,
					pullRequestStates,
					timestamp,
					sessionResource: session.resource,
					actions: this.pullRequestActions(session, kind),
				});
				return;
		}
	}

	private pullRequestActions(session: ISession, kind: InboxNotificationKind): readonly IInboxNotificationAction[] {
		const agentMergeAction = this.canSurfaceInlineAgentMergeAction(session)
			? this.agentMergeActionForNotificationKind(kind)
			: undefined;
		if (kind === InboxNotificationKind.PullRequestMerged) {
			return this.sessionActions(true, [
				{
					id: 'archive-session',
					label: localize('inboxNotifications.action.archiveSession', "Archive Session"),
					kind: InboxNotificationActionKind.ArchiveSession,
				},
				{
					id: 'delete-session',
					label: localize('inboxNotifications.action.deleteSession', "Delete Session"),
					kind: InboxNotificationActionKind.DeleteSession,
				},
			]);
		}
		return this.sessionActions(true, agentMergeAction ? [agentMergeAction] : undefined);
	}

	private canSurfaceInlineAgentMergeAction(session: ISession): boolean {
		const sessionProvider = this.sessionsProvidersService.getProvider(session.providerId);
		if (supportsInlineAgentMergeActions(sessionProvider) || isAgentHostProviderId(session.providerId)) {
			return true;
		}
		return this.sessionsProvidersService.getProviders().some(provider => supportsInlineAgentMergeActions(provider));
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

			// Re-derive when this model changes so a pending confirmation that streams in after
			// the model is loaded (notably the active turn restored after a window reload) is
			// picked up without requiring the user to open the session.
			this.chatModelChangeSignal(chat.resource, chatModel).read(reader);

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
	 * A cached change signal for a chat model, keyed by its chat resource. The signal only
	 * subscribes to the model's `onDidChange` event while the derivation observing it stays
	 * live, and is replaced whenever the underlying model instance changes.
	 */
	private chatModelChangeSignal(chatResource: URI, chatModel: IChatModel): IObservable<void> {
		const key = chatResource.toString();
		const existing = this._chatModelChangeSignals.get(key);
		if (existing?.model === chatModel) {
			return existing.signal;
		}
		const signal = observableSignalFromEvent(this, chatModel.onDidChange);
		this._chatModelChangeSignals.set(key, { model: chatModel, signal });
		return signal;
	}

	/**
	 * each distinct question/confirmation/tool request gets its own inbox id. This keeps
	 * repeated requests from the same session in their own cards (and their Now tier)
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

		const endLoading = this.beginLoadingOperation();
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
				endLoading();
			});
	}

	private beginLoadingOperation(): () => void {
		this._loadingOperationCount.set(this._loadingOperationCount.get() + 1, undefined);
		let ended = false;
		return () => {
			if (ended) {
				return;
			}
			ended = true;
			this._loadingOperationCount.set(Math.max(0, this._loadingOperationCount.get() - 1), undefined);
		};
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
