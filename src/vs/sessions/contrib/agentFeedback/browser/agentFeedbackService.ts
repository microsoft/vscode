/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { ResourceMap } from '../../../../base/common/map.js';
import { URI } from '../../../../base/common/uri.js';
import { IRange } from '../../../../editor/common/core/range.js';
import { createDecorator, IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { isEqual, isEqualOrParent } from '../../../../base/common/resources.js';
import { Schemas } from '../../../../base/common/network.js';
import { IChatEditingService } from '../../../../workbench/contrib/chat/common/editing/chatEditingService.js';
import { isIChatSessionFileChange2 } from '../../../../workbench/contrib/chat/common/chatSessionsService.js';
import { ISessionsManagementService } from '../../../services/sessions/common/sessionsManagement.js';
import { ISessionsService } from '../../../services/sessions/browser/sessionsService.js';
import { editingEntriesContainResource } from '../../../../workbench/contrib/chat/browser/sessionResourceMatching.js';
import { changeMatchesResource, getActiveResourceCandidates, IAgentFeedbackContext } from './agentFeedbackEditorUtils.js';
import { IEditorService } from '../../../../workbench/services/editor/common/editorService.js';
import { IChatWidgetService } from '../../../../workbench/contrib/chat/browser/chat.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { ICodeReviewSuggestion } from '../../codeReview/browser/codeReviewService.js';
import { ISession, ISessionFileChange, SessionStatus } from '../../../services/sessions/common/session.js';
import { isAgentHostProviderId } from '../../../common/agentHostSessionsProvider.js';
import { AnnotationsAgentFeedbackItemsBackend, IAgentFeedbackItemsBackend, InMemoryAgentFeedbackItemsBackend } from './agentFeedbackItemsBackend.js';
import { ATTACHMENT_ID_PREFIX, createAgentFeedbackVariableEntry } from './agentFeedbackAttachmentEntry.js';
import { AgentFeedbackKind, AgentFeedbackState, type IAgentFeedback } from './agentFeedbackModel.js';

// --- Types --------------------------------------------------------------------

// The core feedback model (`IAgentFeedback` and the `AgentFeedbackKind` /
// `AgentFeedbackState` enums) lives in `agentFeedbackModel.ts` so the storage
// backends can depend on it without a dependency cycle back through this
// service. Re-exported here for consumers that import these types from the
// service.
export { AgentFeedbackKind, AgentFeedbackState, type IAgentFeedback };

export interface INavigableSessionComment {
	readonly id: string;
}

/** Options for {@link IAgentFeedbackService.acceptFeedback}. */
export interface IAcceptFeedbackOptions {
	/**
	 * Flag the accepted item as pending reveal to the agent so the
	 * `viewUnreviewedComments` server tool returns it (and only the items
	 * revealed in the same invocation).
	 */
	readonly revealToAgent?: boolean;
}

export interface IAgentFeedbackChangeEvent {
	readonly sessionResource: URI;
	readonly feedbackItems: readonly IAgentFeedback[];
}

export interface IAgentFeedbackNavigationBearing {
	readonly activeIdx: number;
	readonly totalCount: number;
}

/** Fired when a brand-new agent feedback item is added by the user. */
export interface IAgentFeedbackAddedEvent {
	readonly sessionResource: URI;
	readonly feedback: IAgentFeedback;
	readonly hasExistingFeedbackForFile: boolean;
}

/** Fired when an existing PR/code-review comment is converted into agent feedback. */
export interface IAgentFeedbackConvertedEvent {
	readonly sessionResource: URI;
	readonly feedback: IAgentFeedback;
	readonly kind: AgentFeedbackKind.AgentReview | AgentFeedbackKind.PRReview;
	readonly hasExistingFeedbackForFile: boolean;
}

/** Fired when a reply is appended to an existing feedback thread. */
export interface IAgentFeedbackReplyAddedEvent {
	readonly sessionResource: URI;
	readonly feedback: IAgentFeedback;
	readonly replyCount: number;
}

/** Fired when feedback items are submitted to the agent for action. */
export interface IAgentFeedbackSubmittedEvent {
	readonly sessionResource: URI;
	readonly totalCount: number;
	readonly userCount: number;
	readonly codeReviewCount: number;
	readonly prReviewCount: number;
	readonly replyCount: number;
}

// --- Service Interface --------------------------------------------------------

export const IAgentFeedbackService = createDecorator<IAgentFeedbackService>('agentFeedbackService');

export interface IAgentFeedbackService {
	readonly _serviceBrand: undefined;

	readonly onDidChangeFeedback: Event<IAgentFeedbackChangeEvent>;
	readonly onDidChangeNavigation: Event<URI>;

	/** Fired when a new user-authored feedback item is added. */
	readonly onDidAddFeedback: Event<IAgentFeedbackAddedEvent>;
	/** Fired when an external review comment is converted into agent feedback. */
	readonly onDidConvertFeedback: Event<IAgentFeedbackConvertedEvent>;
	/** Fired when a reply is appended to an existing feedback thread. */
	readonly onDidAddReply: Event<IAgentFeedbackReplyAddedEvent>;
	/** Fired when feedback items are submitted to the agent. */
	readonly onDidSubmitFeedback: Event<IAgentFeedbackSubmittedEvent>;

	/**
	 * Add a feedback item for the given session. {@link kind} (defaults to
	 * {@link AgentFeedbackKind.UserReview}) classifies the origin of the
	 * feedback. {@link state} (defaults
	 * to {@link AgentFeedbackState.Accepted}) sets the initial lifecycle state
	 * and selects which lifecycle event is fired.
	 */
	addFeedback(sessionResource: URI, resourceUri: URI, range: IRange, text: string, suggestion?: ICodeReviewSuggestion, context?: IAgentFeedbackContext, sourcePRReviewCommentId?: string, kind?: AgentFeedbackKind, state?: AgentFeedbackState): IAgentFeedback;

	/**
	 * Accept a feedback item that is currently in the
	 * {@link AgentFeedbackState.Created} state, transitioning it to
	 * {@link AgentFeedbackState.Accepted} so it becomes submittable and is
	 * attached to the chat input.
	 *
	 * When {@link IAcceptFeedbackOptions.revealToAgent} is set, the item is
	 * additionally flagged as pending reveal to the agent so the
	 * `viewUnreviewedComments` server tool returns exactly the comments the user
	 * chose to reveal for that invocation.
	 */
	acceptFeedback(sessionResource: URI, feedbackId: string, options?: IAcceptFeedbackOptions): void;

	/**
	 * Remove a single feedback item.
	 */
	removeFeedback(sessionResource: URI, feedbackId: string): void;

	/**
	 * Update the text of an existing feedback item.
	 */
	updateFeedback(sessionResource: URI, feedbackId: string, newText: string): void;

	/**
	 * Mark an existing feedback item as resolved. Resolving moves the item to
	 * {@link AgentFeedbackState.Resolved}; un-resolving returns it to
	 * {@link AgentFeedbackState.Submitted}.
	 */
	setFeedbackResolved(sessionResource: URI, feedbackId: string, resolved: boolean): void;

	/**
	 * Append a reply to an existing feedback item, making it part of the same
	 * comment thread.
	 */
	addReply(sessionResource: URI, feedbackId: string, replyText: string): void;

	/**
	 * Get all feedback items for a session.
	 */
	getFeedback(sessionResource: URI): readonly IAgentFeedback[];

	/**
	 * Whether {@link getFeedback} reflects the authoritative item set for the
	 * session. For agent-host sessions this is `false` until the session's
	 * annotations snapshot has been received; for other sessions it is always
	 * `true`. Callers that seed feedback from another source must wait for this
	 * to avoid acting on a transiently-empty list.
	 */
	hasLoadedFeedback(sessionResource: URI): boolean;

	/**
	 * Resolve the session that owns the given file resource. Returns the
	 * session that was active when the file's editor was first opened; if the
	 * file has never been tracked, falls back to the currently active session.
	 * Returns `undefined` when the file is not in scope for the session (e.g.
	 * the Output view or files outside the session's workspace folders).
	 */
	getSessionForFile(resourceUri: URI): ISession | undefined;

	/**
	 * Resolve the most recently updated session that has feedback for a given resource.
	 */
	getMostRecentSessionForResource(resourceUri: URI): URI | undefined;

	/**
	 * Set the navigation anchor to a specific feedback item, open its editor, and fire a navigation event.
	 */
	revealFeedback(sessionResource: URI, feedbackId: string): Promise<void>;

	/**
	 * Open an editor for the given session comment (feedback or code-review) at its range
	 * and set it as the navigation anchor.
	 */
	revealSessionComment(sessionResource: URI, commentId: string, resourceUri: URI, range: IRange): Promise<void>;

	/**
	 * Navigate to next/previous feedback item in a session.
	 */
	getNextFeedback(sessionResource: URI, next: boolean): IAgentFeedback | undefined;
	getNextNavigableItem<T extends INavigableSessionComment>(sessionResource: URI, items: readonly T[], next: boolean): T | undefined;
	setNavigationAnchor(sessionResource: URI, itemId: string | undefined): void;

	/**
	 * Get the current navigation bearings for a session.
	 */
	getNavigationBearing(sessionResource: URI, items?: readonly INavigableSessionComment[]): IAgentFeedbackNavigationBearing;

	/**
	 * Clear all feedback items for a session (e.g., after sending).
	 */
	clearFeedback(sessionResource: URI): void;

	/**
	 * Mark all accepted feedback items for the session as submitted, firing
	 * {@link onDidSubmitFeedback} with the per-kind counts of the items that
	 * were submitted. Agent-host sessions move the items to
	 * {@link AgentFeedbackState.Submitted} so they stay visible until the agent
	 * resolves them; other providers have no such agent loop, so the items move
	 * straight to {@link AgentFeedbackState.Resolved}. No-op when there are no
	 * accepted items.
	 */
	markFeedbackSubmitted(sessionResource: URI): void;

	/**
	 * Submit the currently accumulated accepted feedback for the session to the
	 * agent and mark those items as submitted. Returns whether the feedback was submitted.
	 */
	submitFeedback(sessionResource: URI): Promise<boolean>;

	/**
	 * Add a feedback item and then submit the feedback. Waits for the
	 * attachment to be updated in the chat widget before submitting.
	 */
	addFeedbackAndSubmit(sessionResource: URI, resourceUri: URI, range: IRange, text: string, suggestion?: ICodeReviewSuggestion, context?: IAgentFeedbackContext, sourcePRReviewCommentId?: string, kind?: AgentFeedbackKind): Promise<void>;
}

// --- Implementation -----------------------------------------------------------

export class AgentFeedbackService extends Disposable implements IAgentFeedbackService {

	declare readonly _serviceBrand: undefined;

	private readonly _onDidChangeFeedback = this._store.add(new Emitter<IAgentFeedbackChangeEvent>());
	readonly onDidChangeFeedback = this._onDidChangeFeedback.event;
	private readonly _onDidChangeNavigation = this._store.add(new Emitter<URI>());
	readonly onDidChangeNavigation = this._onDidChangeNavigation.event;
	private readonly _onDidAddFeedback = this._store.add(new Emitter<IAgentFeedbackAddedEvent>());
	readonly onDidAddFeedback = this._onDidAddFeedback.event;
	private readonly _onDidConvertFeedback = this._store.add(new Emitter<IAgentFeedbackConvertedEvent>());
	readonly onDidConvertFeedback = this._onDidConvertFeedback.event;
	private readonly _onDidAddReply = this._store.add(new Emitter<IAgentFeedbackReplyAddedEvent>());
	readonly onDidAddReply = this._onDidAddReply.event;
	private readonly _onDidSubmitFeedback = this._store.add(new Emitter<IAgentFeedbackSubmittedEvent>());
	readonly onDidSubmitFeedback = this._onDidSubmitFeedback.event;

	/** sessionResource → recency sequence (set on every feedback change) */
	private readonly _sessionUpdatedOrder = new Map<string, number>();
	private _sessionUpdatedSequence = 0;
	private readonly _navigationAnchorBySession = new Map<string, string>();

	/** fileResource → sessionResource active when the editor for that file was first seen */
	private readonly _fileToSession = new ResourceMap<URI>();

	/** In-memory store used for every non-agent-host provider. */
	private readonly _inMemoryBackend = this._register(new InMemoryAgentFeedbackItemsBackend());
	/** Annotations-channel-backed store for agent-host sessions; created lazily. */
	private _annotationsBackend: AnnotationsAgentFeedbackItemsBackend | undefined;

	constructor(
		@IChatEditingService private readonly _chatEditingService: IChatEditingService,
		@ISessionsManagementService private readonly _sessionsManagementService: ISessionsManagementService,
		@ISessionsService private readonly _sessionsService: ISessionsService,
		@IEditorService private readonly _editorService: IEditorService,
		@IChatWidgetService private readonly _chatWidgetService: IChatWidgetService,
		@ILogService private readonly _logService: ILogService,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
	) {
		super();

		this._register(this._inMemoryBackend.onDidChangeItems(resource => this._handleBackendChange(resource)));
		this._register(this._editorService.onDidVisibleEditorsChange(() => this._trackVisibleEditorResources()));
		this._trackVisibleEditorResources();
	}

	/** Resolves the storage backend that owns feedback for the given session. */
	private _backendForSession(sessionResource: URI): IAgentFeedbackItemsBackend {
		if (this._isAgentHostSession(sessionResource)) {
			return this._getAnnotationsBackend();
		}
		return this._inMemoryBackend;
	}

	private _getAnnotationsBackend(): AnnotationsAgentFeedbackItemsBackend {
		if (!this._annotationsBackend) {
			this._annotationsBackend = this._register(this._instantiationService.createInstance(AnnotationsAgentFeedbackItemsBackend));
			this._register(this._annotationsBackend.onDidChangeItems(resource => this._handleBackendChange(resource)));
		}
		return this._annotationsBackend;
	}

	private _backends(): readonly IAgentFeedbackItemsBackend[] {
		return this._annotationsBackend ? [this._inMemoryBackend, this._annotationsBackend] : [this._inMemoryBackend];
	}

	/**
	 * Centralized handler for backend item changes (local mutations and
	 * server-driven updates). Maintains recency ordering and re-broadcasts the
	 * generic feedback / navigation change events.
	 */
	private _handleBackendChange(sessionResource: URI): void {
		const key = sessionResource.toString();
		const feedbackItems = this._backendForSession(sessionResource).getItems(sessionResource);
		if (feedbackItems.length) {
			this._sessionUpdatedOrder.set(key, ++this._sessionUpdatedSequence);
		} else {
			this._sessionUpdatedOrder.delete(key);
		}
		this._onDidChangeFeedback.fire({ sessionResource, feedbackItems });
		this._onDidChangeNavigation.fire(sessionResource);
	}

	private _trackVisibleEditorResources(): void {
		const activeSession = this._sessionsService.activeSession.get();
		if (!activeSession) {
			return;
		}

		for (const pane of this._editorService.visibleEditorPanes) {
			for (const candidate of getActiveResourceCandidates(pane.input)) {
				this._fileToSession.set(candidate, activeSession.resource);
			}
		}
	}

	getSessionForFile(resourceUri: URI): ISession | undefined {
		const sessionResource = this._fileToSession.get(resourceUri) ?? this._sessionsService.activeSession.get()?.resource;
		if (!sessionResource) {
			return undefined;
		}
		const session = this._sessionsManagementService.getSession(sessionResource);
		if (!session || session.status.get() === SessionStatus.Untitled) {
			return undefined;
		}
		if (!this._isFileInSessionScope(session, resourceUri)) {
			return undefined;
		}
		return session;
	}

	/**
	 * Whether the given file belongs to the session and is therefore eligible
	 * for agent feedback. This keeps the feedback affordances scoped to the
	 * session's own files and excludes editors that merely happen to be open
	 * while the session is active (e.g. user settings opened from the user
	 * data directory, or the Output view which is not backed by a real file).
	 */
	private _isFileInSessionScope(session: ISession, resourceUri: URI): boolean {
		// The Output view renders into a code editor but is not a real file the
		// user can give feedback on, so always exclude it.
		if (resourceUri.scheme === Schemas.outputChannel) {
			return false;
		}

		// Files that are part of the session's changes are always in scope,
		// regardless of where they live on disk.
		if (session.changes.get().some(change => changeMatchesResource(change, resourceUri))) {
			return true;
		}

		// Otherwise the file must live within one of the session's workspace
		// folders. When the session has no workspace information we cannot make
		// that determination, so fall back to allowing the file.
		const workspace = session.workspace.get();
		if (!workspace) {
			return true;
		}
		return workspace.folders.some(folder =>
			isEqualOrParent(resourceUri, folder.root) || isEqualOrParent(resourceUri, folder.workingDirectory));
	}

	addFeedback(sessionResource: URI, resourceUri: URI, range: IRange, text: string, suggestion?: ICodeReviewSuggestion, context?: IAgentFeedbackContext, sourcePRReviewCommentId?: string, kind: AgentFeedbackKind = AgentFeedbackKind.UserReview, state: AgentFeedbackState = AgentFeedbackState.Accepted): IAgentFeedback {
		const backend = this._backendForSession(sessionResource);

		// A sourcePRReviewCommentId implies the feedback originated from a PR review.
		const effectiveKind: AgentFeedbackKind = sourcePRReviewCommentId ? AgentFeedbackKind.PRReview : kind;

		const feedback: IAgentFeedback = {
			id: generateUuid(),
			text,
			resourceUri,
			range,
			sessionResource,
			suggestion,
			codeSelection: context?.codeSelection,
			diffHunks: context?.diffHunks,
			kind: effectiveKind,
			sourcePRReviewCommentId,
			state,
		};

		// Compute file-existence (for telemetry) before the item is stored.
		const resourceStr = resourceUri.toString();
		const hasExistingForFile = backend.getItems(sessionResource).some(f => f.resourceUri.toString() === resourceStr);

		backend.upsert(feedback);

		// Created items are added by a system and are not yet user-accepted, so
		// they do not contribute add/convert telemetry until acceptance.
		if (state === AgentFeedbackState.Accepted) {
			if (effectiveKind === AgentFeedbackKind.UserReview) {
				this._onDidAddFeedback.fire({ sessionResource, feedback, hasExistingFeedbackForFile: hasExistingForFile });
			} else {
				this._onDidConvertFeedback.fire({ sessionResource, feedback, kind: effectiveKind, hasExistingFeedbackForFile: hasExistingForFile });
			}
		}

		return feedback;
	}

	acceptFeedback(sessionResource: URI, feedbackId: string, options?: IAcceptFeedbackOptions): void {
		const backend = this._backendForSession(sessionResource);
		const feedbackItems = backend.getItems(sessionResource);
		const existing = feedbackItems.find(f => f.id === feedbackId);
		if (!existing || existing.state !== AgentFeedbackState.Created) {
			return;
		}

		const accepted: IAgentFeedback = {
			...existing,
			state: AgentFeedbackState.Accepted,
			...(options?.revealToAgent ? { pendingAgentReveal: true } : {}),
		};
		backend.upsert(accepted);

		if (accepted.kind !== AgentFeedbackKind.UserReview) {
			const resourceStr = accepted.resourceUri.toString();
			const hasExistingFeedbackForFile = feedbackItems.some(f => f.id !== accepted.id && f.resourceUri.toString() === resourceStr);
			this._onDidConvertFeedback.fire({ sessionResource, feedback: accepted, kind: accepted.kind, hasExistingFeedbackForFile });
		}
	}

	removeFeedback(sessionResource: URI, feedbackId: string): void {
		const key = sessionResource.toString();
		if (this._navigationAnchorBySession.get(key) === feedbackId) {
			this._navigationAnchorBySession.delete(key);
		}
		this._backendForSession(sessionResource).remove(sessionResource, feedbackId);
	}

	updateFeedback(sessionResource: URI, feedbackId: string, newText: string): void {
		const backend = this._backendForSession(sessionResource);
		const existing = backend.getItems(sessionResource).find(f => f.id === feedbackId);
		if (!existing) {
			return;
		}
		backend.upsert({ ...existing, text: newText });
	}

	setFeedbackResolved(sessionResource: URI, feedbackId: string, resolved: boolean): void {
		const backend = this._backendForSession(sessionResource);
		// Un-resolving returns the item to the submitted state.
		const nextState = resolved ? AgentFeedbackState.Resolved : AgentFeedbackState.Submitted;
		const existing = backend.getItems(sessionResource).find(f => f.id === feedbackId);
		if (existing && existing.state !== nextState) {
			backend.upsert({ ...existing, state: nextState });
		}
	}

	addReply(sessionResource: URI, feedbackId: string, replyText: string): void {
		const backend = this._backendForSession(sessionResource);
		const existing = backend.getItems(sessionResource).find(f => f.id === feedbackId);
		if (!existing) {
			return;
		}

		const newReplies = [...(existing.replies ?? []), replyText];
		const updated: IAgentFeedback = { ...existing, replies: newReplies };
		backend.upsert(updated);
		this._onDidAddReply.fire({ sessionResource, feedback: updated, replyCount: newReplies.length });
	}

	getFeedback(sessionResource: URI): readonly IAgentFeedback[] {
		return this._backendForSession(sessionResource).getItems(sessionResource);
	}

	hasLoadedFeedback(sessionResource: URI): boolean {
		return this._backendForSession(sessionResource).hasLoaded(sessionResource);
	}

	getMostRecentSessionForResource(resourceUri: URI): URI | undefined {
		let bestSession: URI | undefined;
		let bestSequence = -1;

		for (const backend of this._backends()) {
			for (const candidate of backend.getSessionsWithItems()) {
				const feedbackItems = backend.getItems(candidate);
				if (!feedbackItems.length) {
					continue;
				}

				if (!this._sessionContainsResource(candidate, resourceUri, feedbackItems)) {
					continue;
				}

				const sequence = this._sessionUpdatedOrder.get(candidate.toString()) ?? 0;
				if (sequence > bestSequence) {
					bestSession = candidate;
					bestSequence = sequence;
				}
			}
		}

		return bestSession;
	}

	private _sessionContainsResource(sessionResource: URI, resourceUri: URI, feedbackItems: readonly IAgentFeedback[]): boolean {
		if (feedbackItems.some(item => isEqual(item.resourceUri, resourceUri))) {
			return true;
		}

		for (const editingSession of this._chatEditingService.editingSessionsObs.get()) {
			if (!isEqual(editingSession.chatSessionResource, sessionResource)) {
				continue;
			}

			if (editingEntriesContainResource(editingSession.entries.get(), resourceUri)) {
				return true;
			}
		}

		const session = this._sessionsManagementService.getSession(sessionResource);
		if (!session) {
			return false;
		}

		const changes = session.changes.get();
		if (changes.some(change => changeMatchesResource(change, resourceUri))) {
			return true;
		}

		return false;
	}

	async revealFeedback(sessionResource: URI, feedbackId: string): Promise<void> {
		const feedback = this.getFeedback(sessionResource).find(f => f.id === feedbackId);
		if (!feedback) {
			return;
		}
		await this.revealSessionComment(sessionResource, feedbackId, feedback.resourceUri, feedback.range);
	}

	async revealSessionComment(sessionResource: URI, commentId: string, resourceUri: URI, range: IRange): Promise<void> {
		const selection = { startLineNumber: range.startLineNumber, startColumn: range.startColumn };
		const sessionData = this._sessionsManagementService.getSession(sessionResource);
		const sessionChange = this._getSessionChange(resourceUri, sessionData?.changes.get());

		if (sessionChange?.isDeletion && sessionChange.originalUri) {
			await this._editorService.openEditor({
				resource: sessionChange.originalUri,
				options: {
					modal: {},
					preserveFocus: false,
					revealIfVisible: true,
					selection,
				}
			});
		} else if (sessionChange?.originalUri) {
			await this._editorService.openEditor({
				original: { resource: sessionChange.originalUri },
				modified: { resource: sessionChange.modifiedUri },
				options: {
					modal: {},
					preserveFocus: false,
					revealIfVisible: true,
					selection,
				}
			});
		} else {
			await this._editorService.openEditor({
				resource: sessionChange?.modifiedUri ?? resourceUri,
				options: {
					modal: {},
					preserveFocus: false,
					revealIfVisible: true,
					selection,
				}
			});
		}

		this.setNavigationAnchor(sessionResource, commentId);
	}

	private _getSessionChange(resourceUri: URI, changes: readonly ISessionFileChange[] | undefined): { originalUri?: URI; modifiedUri: URI; isDeletion: boolean } | undefined {
		if (!(changes instanceof Array)) {
			return undefined;
		}

		const matchingChange = changes.find(change => changeMatchesResource(change, resourceUri));
		if (!matchingChange) {
			return undefined;
		}

		if (isIChatSessionFileChange2(matchingChange)) {
			return {
				originalUri: matchingChange.originalUri,
				modifiedUri: matchingChange.modifiedUri ?? matchingChange.uri,
				isDeletion: matchingChange.modifiedUri === undefined,
			};
		}

		return {
			originalUri: matchingChange.originalUri,
			modifiedUri: matchingChange.modifiedUri,
			isDeletion: false,
		};
	}

	getNextFeedback(sessionResource: URI, next: boolean): IAgentFeedback | undefined {
		return this.getNextNavigableItem(sessionResource, this.getFeedback(sessionResource), next);
	}

	getNextNavigableItem<T extends INavigableSessionComment>(sessionResource: URI, items: readonly T[], next: boolean): T | undefined {
		const key = sessionResource.toString();
		if (!items.length) {
			this._navigationAnchorBySession.delete(key);
			return undefined;
		}

		const anchorId = this._navigationAnchorBySession.get(key);
		let anchorIndex = anchorId ? items.findIndex(item => item.id === anchorId) : -1;

		if (anchorIndex < 0 && !next) {
			anchorIndex = 0;
		}

		const nextIndex = next
			? (anchorIndex + 1) % items.length
			: (anchorIndex - 1 + items.length) % items.length;

		const item = items[nextIndex];
		this.setNavigationAnchor(sessionResource, item.id);
		return item;
	}

	setNavigationAnchor(sessionResource: URI, itemId: string | undefined): void {
		const key = sessionResource.toString();
		if (itemId) {
			this._navigationAnchorBySession.set(key, itemId);
		} else {
			this._navigationAnchorBySession.delete(key);
		}
		this._onDidChangeNavigation.fire(sessionResource);
	}

	getNavigationBearing(sessionResource: URI, items: readonly INavigableSessionComment[] = this.getFeedback(sessionResource)): IAgentFeedbackNavigationBearing {
		const key = sessionResource.toString();
		const anchorId = this._navigationAnchorBySession.get(key);
		const activeIdx = anchorId ? items.findIndex(item => item.id === anchorId) : -1;
		return { activeIdx, totalCount: items.length };
	}

	clearFeedback(sessionResource: URI): void {
		const key = sessionResource.toString();
		this._sessionUpdatedOrder.delete(key);
		this._navigationAnchorBySession.delete(key);
		this._backendForSession(sessionResource).clear(sessionResource);
	}

	async addFeedbackAndSubmit(sessionResource: URI, resourceUri: URI, range: IRange, text: string, suggestion?: ICodeReviewSuggestion, context?: IAgentFeedbackContext, sourcePRReviewCommentId?: string, kind?: AgentFeedbackKind): Promise<void> {
		this.addFeedback(sessionResource, resourceUri, range, text, suggestion, context, sourcePRReviewCommentId, kind);

		if (!this._isAgentHostSession(sessionResource)) {
			// Wait for the attachment contribution to update the chat widget's attachment model
			const widget = this._chatWidgetService.getWidgetBySessionResource(sessionResource);
			if (widget) {
				const attachmentId = 'agentFeedback:' + sessionResource.toString();
				const hasAttachment = () => widget.attachmentModel.attachments.some(a => a.id === attachmentId);

				if (!hasAttachment()) {
					await Event.toPromise(
						Event.filter(widget.attachmentModel.onDidChange, () => hasAttachment())
					);
				}
			} else {
				this._logService.error('[AgentFeedback] addFeedbackAndSubmit: no chat widget found for session, feedback may not be submitted correctly', sessionResource.toString());
				await new Promise(resolve => setTimeout(resolve, 100));
			}
		}

		await this.submitFeedback(sessionResource);
	}

	private _isAgentHostSession(sessionResource: URI): boolean {
		const session = this._sessionsManagementService.getSession(sessionResource);
		return session ? isAgentHostProviderId(session.providerId) : false;
	}

	async submitFeedback(sessionResource: URI): Promise<boolean> {
		const widget = this._chatWidgetService.getWidgetBySessionResource(sessionResource);
		if (!widget) {
			this._logService.error('[AgentFeedback] submitFeedback: no chat widget found for session', sessionResource.toString());
			return false;
		}

		// Agent-host sessions don't keep a reactive feedback attachment in the
		// chat input (their feedback lives in the annotations backend and is
		// submitted via the "Submit Feedback" button). Attach the accepted
		// items — which are about to become submitted — to this single request
		// so the agent receives the comments, then remove the transient
		// attachment again once the request has been sent.
		if (this._isAgentHostSession(sessionResource)) {
			const acceptedItems = this.getFeedback(sessionResource).filter(item => item.state === AgentFeedbackState.Accepted);
			const attachmentId = ATTACHMENT_ID_PREFIX + sessionResource.toString();
			if (acceptedItems.length) {
				const annotationsResource = this._getAnnotationsBackend().getAnnotationsChannelResource(sessionResource);
				widget.attachmentModel.delete(attachmentId);
				widget.attachmentModel.addContext(createAgentFeedbackVariableEntry(sessionResource, acceptedItems, annotationsResource));
			}

			try {
				await widget.acceptInput('/act-on-feedback');
			} catch (err) {
				this._logService.error('[AgentFeedback] Failed to submit feedback', err);
				return false;
			} finally {
				widget.attachmentModel.delete(attachmentId);
			}

			this.markFeedbackSubmitted(sessionResource);
			return true;
		}

		// Send first so the accepted feedback is still attached to the request,
		// then mark the items as submitted. For non-agent-host sessions the
		// attachment contribution also marks submission on send; marking here is
		// idempotent and covers sessions without that contribution.
		try {
			await widget.acceptInput('/act-on-feedback');
		} catch (err) {
			this._logService.error('[AgentFeedback] Failed to submit feedback', err);
			return false;
		}

		this.markFeedbackSubmitted(sessionResource);
		return true;
	}

	markFeedbackSubmitted(sessionResource: URI): void {
		const backend = this._backendForSession(sessionResource);
		const feedbackItems = backend.getItems(sessionResource);

		// Agent-host sessions hand the feedback to an agent that resolves each
		// comment (via the resolveComments tool) once it has acted on it, so the
		// items stay visible in the submitted state until then. Other providers
		// have no such agent loop, so submitting resolves the comments directly
		// to hide them from the UI.
		const submittedState = this._isAgentHostSession(sessionResource)
			? AgentFeedbackState.Submitted
			: AgentFeedbackState.Resolved;

		let userCount = 0;
		let codeReviewCount = 0;
		let prReviewCount = 0;
		let replyCount = 0;
		const submitted: IAgentFeedback[] = [];
		for (const item of feedbackItems) {
			if (item.state !== AgentFeedbackState.Accepted) {
				continue;
			}
			switch (item.kind) {
				case AgentFeedbackKind.UserReview: userCount++; break;
				case AgentFeedbackKind.AgentReview: codeReviewCount++; break;
				case AgentFeedbackKind.PRReview: prReviewCount++; break;
			}
			replyCount += item.replies?.length ?? 0;
			submitted.push({ ...item, state: submittedState });
		}

		if (!submitted.length) {
			return;
		}

		for (const item of submitted) {
			backend.upsert(item);
		}

		this._onDidSubmitFeedback.fire({
			sessionResource,
			totalCount: userCount + codeReviewCount + prReviewCount,
			userCount,
			codeReviewCount,
			prReviewCount,
			replyCount,
		});
	}
}
