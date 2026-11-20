/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from '../../../../base/common/event.js';
import { DeferredPromise } from '../../../../base/common/async.js';
import { createSingleCallFunction } from '../../../../base/common/functional.js';
import { Disposable, IDisposable } from '../../../../base/common/lifecycle.js';
import { ResourceMap } from '../../../../base/common/map.js';
import { derived, IObservable, runOnChange } from '../../../../base/common/observable.js';
import { URI } from '../../../../base/common/uri.js';
import { IRange } from '../../../../editor/common/core/range.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { isEqual } from '../../../../base/common/resources.js';
import { Schemas } from '../../../../base/common/network.js';
import { IChatEditingService } from '../../../../workbench/contrib/chat/common/editing/chatEditingService.js';
import { ISessionsManagementService } from '../../../../workbench/contrib/sessions/common/sessionsManagement.js';
import { ISessionsService } from '../../../../workbench/contrib/sessions/browser/sessionsService.js';
import { IFocusedSessionHostService } from '../../../../workbench/services/sessions/browser/sessionHost.js';
import { ISessionsProvidersService } from '../../../../workbench/contrib/sessions/browser/sessionsProvidersService.js';
import { editingEntriesContainResource } from '../../../../workbench/contrib/chat/browser/sessionResourceMatching.js';
import { changeMatchesResource, getActiveResourceCandidates } from './agentFeedbackEditorUtils.js';
import { IAgentFeedbackContext, AGENT_FEEDBACK_NEW_SESSION_RESOURCE, INavigableSessionComment, IAcceptFeedbackOptions, IAgentFeedbackChangeEvent, IAgentFeedbackNavigationBearing, IAgentFeedbackNavigationChangeEvent, IAgentFeedbackCommentRevealEvent, IAgentFeedbackAddedEvent, IAgentFeedbackConvertedEvent, IAgentFeedbackReplyAddedEvent, IAgentFeedbackSubmittedEvent, ISubmitFeedbackOptions, IAgentFeedbackService } from '../../../../workbench/contrib/sessions/browser/agentFeedback.js';
import { IEditorService } from '../../../../workbench/services/editor/common/editorService.js';
import { IChatWidget, IChatWidgetService } from '../../../../workbench/contrib/chat/browser/chat.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IFeedbackPullRequest } from '../../../../platform/agentHost/common/meta/agentFeedbackAnnotations.js';
import { ICodeReviewSuggestion } from '../../../../workbench/contrib/sessions/browser/codeReviewService.js';
import { ISession, ISessionFileChange, ISessionWorkspace, isSessionCreated, SessionStatus } from '../../../../workbench/services/sessions/common/session.js';
import { isAgentHostProviderId } from '../../../../workbench/contrib/sessions/common/agentHostSessionsProvider.js';
import { AnnotationsAgentFeedbackItemsBackend, IAgentFeedbackItemsBackend, InMemoryAgentFeedbackItemsBackend } from './agentFeedbackItemsBackend.js';
import { ATTACHMENT_ID_PREFIX, createAgentFeedbackVariableEntry } from '../../../../workbench/contrib/sessions/browser/agentFeedbackAttachmentEntry.js';
import { AgentFeedbackKind, AgentFeedbackState, type IAgentFeedback } from '../../../../workbench/contrib/sessions/browser/agentFeedbackModel.js';
import { SessionEditorCommentSource, toSessionEditorCommentId } from './sessionEditorComments.js';
import { whenChatWidgetForSession } from '../../../../workbench/contrib/sessions/browser/chat/chatWidgetUtils.js';
import { isIChatSessionFileChange2 } from '../../../../workbench/common/chatSessionFileChange.js';

export function shouldIncludeRawPRReviewComments(agentFeedbackService: IAgentFeedbackService, sessionResource: URI): boolean {
	return !agentFeedbackService.isAgentHostSession(sessionResource) || !agentFeedbackService.hasLoadedFeedback(sessionResource);
}

// --- Implementation -----------------------------------------------------------

/** Stable identity of a session's workspace, or `undefined` when it has none (yet). */
function workspaceFoldersKey(workspace: ISessionWorkspace | undefined): string | undefined {
	return workspace?.folders.map(folder => folder.root.toString()).join(',');
}

export class AgentFeedbackService extends Disposable implements IAgentFeedbackService {

	declare readonly _serviceBrand: undefined;

	private readonly _onDidChangeFeedback = this._store.add(new Emitter<IAgentFeedbackChangeEvent>());
	readonly onDidChangeFeedback = this._onDidChangeFeedback.event;
	private readonly _onDidChangeFeedbackVisibility = this._store.add(new Emitter<URI>());
	readonly onDidChangeFeedbackVisibility = this._onDidChangeFeedbackVisibility.event;
	private readonly _onDidChangeNavigation = this._store.add(new Emitter<IAgentFeedbackNavigationChangeEvent>());
	readonly onDidChangeNavigation = this._onDidChangeNavigation.event;
	private readonly _onDidRevealSessionComment = this._store.add(new Emitter<IAgentFeedbackCommentRevealEvent>());
	readonly onDidRevealSessionComment = this._onDidRevealSessionComment.event;
	private readonly _onDidChangeFeedbackScope = this._store.add(new Emitter<void>());
	readonly onDidChangeFeedbackScope = this._onDidChangeFeedbackScope.event;
	private readonly _onDidAddFeedback = this._store.add(new Emitter<IAgentFeedbackAddedEvent>());
	readonly onDidAddFeedback = this._onDidAddFeedback.event;
	private readonly _onDidConvertFeedback = this._store.add(new Emitter<IAgentFeedbackConvertedEvent>());
	readonly onDidConvertFeedback = this._onDidConvertFeedback.event;
	private readonly _onDidAddReply = this._store.add(new Emitter<IAgentFeedbackReplyAddedEvent>());
	readonly onDidAddReply = this._onDidAddReply.event;
	private readonly _onDidSubmitFeedback = this._store.add(new Emitter<IAgentFeedbackSubmittedEvent>());
	readonly onDidSubmitFeedback = this._onDidSubmitFeedback.event;

	readonly activeFeedbackSessionResource: IObservable<URI>;

	/** sessionResource → recency sequence (set on every feedback change) */
	private readonly _sessionUpdatedOrder = new Map<string, number>();
	private _sessionUpdatedSequence = 0;
	/** sessionResource → navigation anchor, and whether editors may reveal and focus it */
	private readonly _navigationAnchorBySession = new Map<string, { readonly itemId: string; readonly reveal: boolean }>();
	private readonly _visibleResolvedFeedbackIds = new ResourceMap<Set<string>>();

	/** fileResource → sessionResource active when the editor for that file was first seen */
	private readonly _fileToSession = new ResourceMap<URI>();
	private readonly _explicitResourceScopes = new ResourceMap<URI>();

	/**
	 * The last {@link _resolveSession} lookup, hit or miss. Feedback resolution
	 * runs once per resource of the active editor, so a Changes multi-diff asks
	 * for the same session thousands of times in a row. A single entry is enough
	 * to collapse that run; it is dropped whenever the session catalog changes.
	 */
	private _lastResolvedSession: { readonly sessionResource: URI; readonly session: ISession | undefined } | undefined;

	/** Workspace the shared new-session comments are bound to; `undefined` when there are none. */
	private _boundNewSessionWorkspaceKey: string | undefined;

	/** Workspace of the draft the new-session scope currently targets. */
	private readonly _newSessionWorkspaceKey: IObservable<string | undefined>;

	/** In-memory store used for every non-agent-host provider. */
	private readonly _inMemoryBackend = this._register(new InMemoryAgentFeedbackItemsBackend());
	/** Annotations-channel-backed store for agent-host sessions; created lazily. */
	private _annotationsBackend: AnnotationsAgentFeedbackItemsBackend | undefined;

	constructor(
		@IChatEditingService private readonly _chatEditingService: IChatEditingService,
		@ISessionsManagementService private readonly _sessionsManagementService: ISessionsManagementService,
		@ISessionsService private readonly _sessionsService: ISessionsService,
		@IFocusedSessionHostService private readonly _focusedSessionHostService: IFocusedSessionHostService,
		@ISessionsProvidersService private readonly _sessionsProvidersService: ISessionsProvidersService,
		@IEditorService private readonly _editorService: IEditorService,
		@IChatWidgetService private readonly _chatWidgetService: IChatWidgetService,
		@ILogService private readonly _logService: ILogService,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
	) {
		super();

		this._register(this._inMemoryBackend.onDidChangeItems(resource => this._handleBackendChange(resource)));
		this._register(this._editorService.onDidVisibleEditorsChange(() => this._trackVisibleEditorResources()));
		this._trackVisibleEditorResources();

		this.activeFeedbackSessionResource = derived(this, reader => {
			const activeSession = this._focusedSessionHostService.focusedHost.read(reader).session.read(reader);
			return !activeSession || !isSessionCreated(activeSession, reader)
				? AGENT_FEEDBACK_NEW_SESSION_RESOURCE
				: activeSession.resource;
		});

		// Deliberately keyed on the scope and its workspace folders only: the
		// session's changes also feed `getFeedbackSessionResource`, but they churn
		// constantly while an agent edits and re-broadcasting that would rebuild
		// every comment widget on each tick.
		const feedbackScopeKey = derived(this, reader => {
			const scope = this.activeFeedbackSessionResource.read(reader).toString();
			const workspace = this._focusedSessionHostService.focusedHost.read(reader).session.read(reader)?.workspace.read(reader);
			return `${scope}|${workspaceFoldersKey(workspace) ?? ''}`;
		});
		this._register(runOnChange(feedbackScopeKey, () => this._onDidChangeFeedbackScope.fire()));

		// `undefined` means the new-session scope is dormant (a created session is
		// active) or the draft's workspace has not resolved yet. Neither is a
		// workspace change, so the comments stay bound to the last known one and a
		// draft swap (which briefly drops the workspace) does not discard them.
		this._newSessionWorkspaceKey = derived(this, reader => {
			const activeSession = this._focusedSessionHostService.focusedHost.read(reader).session.read(reader);
			if (!activeSession || isSessionCreated(activeSession, reader)) {
				return undefined;
			}
			return workspaceFoldersKey(activeSession.workspace.read(reader));
		});
		this._register(runOnChange(this._newSessionWorkspaceKey, key => {
			if (key === undefined) {
				return;
			}
			if (this._boundNewSessionWorkspaceKey !== undefined && this._boundNewSessionWorkspaceKey !== key) {
				this.clearFeedback(AGENT_FEEDBACK_NEW_SESSION_RESOURCE);
			}
			// Comments written before any workspace was picked adopt this selection.
			this._rebindNewSessionWorkspace();
		}));

		this._register(this._sessionsManagementService.onDidDeleteSession(session => this._forgetSession(session.resource)));
		// Both the sessions of a provider and the set of providers itself decide
		// what `getSession` resolves to, and a provider registration does not
		// surface as a session change.
		this._register(this._sessionsManagementService.onDidChangeSessions(() => this._lastResolvedSession = undefined));
		this._register(this._sessionsProvidersService.onDidChangeProviders(() => this._lastResolvedSession = undefined));
	}

	/**
	 * Drops this service's per-session bookkeeping for a deleted session. The
	 * backend is left alone: its channel is already released with the session,
	 * and clearing it would write to a store that no longer exists.
	 */
	private _forgetSession(sessionResource: URI): void {
		const key = sessionResource.toString();
		if (this._lastResolvedSession && isEqual(this._lastResolvedSession.sessionResource, sessionResource)) {
			this._lastResolvedSession = undefined;
		}
		this._sessionUpdatedOrder.delete(key);
		this._navigationAnchorBySession.delete(key);
		this._visibleResolvedFeedbackIds.delete(sessionResource);
		for (const [fileResource, mapped] of [...this._fileToSession]) {
			if (isEqual(mapped, sessionResource)) {
				this._fileToSession.delete(fileResource);
			}
		}
		for (const [fileResource, mapped] of [...this._explicitResourceScopes]) {
			if (isEqual(mapped, sessionResource)) {
				this._explicitResourceScopes.delete(fileResource);
			}
		}
	}

	/**
	 * The shared new-session comments belong to the workspace of the draft they
	 * were written for. An empty set releases the binding so the next draft can
	 * adopt its own workspace instead of being measured against a stale one.
	 */
	private _rebindNewSessionWorkspace(): void {
		if (!this.getFeedback(AGENT_FEEDBACK_NEW_SESSION_RESOURCE).length) {
			this._boundNewSessionWorkspaceKey = undefined;
			return;
		}
		const key = this._newSessionWorkspaceKey.get();
		if (key !== undefined) {
			this._boundNewSessionWorkspaceKey = key;
		}
	}

	/** Resolves the storage backend that owns feedback for the given session. */
	private _backendForSession(sessionResource: URI): IAgentFeedbackItemsBackend {
		if (this.isAgentHostSession(sessionResource)) {
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
		const visibleResolvedFeedbackIds = this._visibleResolvedFeedbackIds.get(sessionResource);
		if (visibleResolvedFeedbackIds) {
			const resolvedFeedbackIds = new Set(feedbackItems.filter(item => item.state === AgentFeedbackState.Resolved).map(item => item.id));
			for (const feedbackId of visibleResolvedFeedbackIds) {
				if (!resolvedFeedbackIds.has(feedbackId)) {
					visibleResolvedFeedbackIds.delete(feedbackId);
				}
			}
			if (visibleResolvedFeedbackIds.size === 0) {
				this._visibleResolvedFeedbackIds.delete(sessionResource);
			}
		}
		if (feedbackItems.length) {
			this._sessionUpdatedOrder.set(key, ++this._sessionUpdatedSequence);
		} else {
			this._sessionUpdatedOrder.delete(key);
		}
		this._onDidChangeFeedback.fire({ sessionResource, feedbackItems });
		this._onDidChangeNavigation.fire({ sessionResource, reveal: this._navigationAnchorBySession.get(key)?.reveal ?? true });
		if (isEqual(sessionResource, AGENT_FEEDBACK_NEW_SESSION_RESOURCE)) {
			this._rebindNewSessionWorkspace();
		}
	}

	private _trackVisibleEditorResources(): void {
		const activeSession = this._focusedSessionHostService.focusedHost.get().session.get();
		if (!activeSession) {
			return;
		}

		for (const pane of this._editorService.visibleEditorPanes) {
			for (const candidate of getActiveResourceCandidates(pane.input)) {
				this._fileToSession.set(candidate, activeSession.resource);
			}
		}
	}

	/**
	 * Resolves a session by resource, answering from the active session facade
	 * whenever it is the one asked for and otherwise from the last lookup.
	 * `ISessionsManagementService.getSession` rebuilds every provider's session
	 * catalog and then scans it linearly, which is far too expensive for the
	 * per-resource lookups this service performs while a Changes editor with
	 * thousands of resources is open.
	 */
	private _resolveSession(sessionResource: URI): ISession | undefined {
		const activeSession = this._focusedSessionHostService.focusedHost.get().session.get();
		if (activeSession && isEqual(activeSession.resource, sessionResource)) {
			return activeSession;
		}
		if (this._lastResolvedSession && isEqual(this._lastResolvedSession.sessionResource, sessionResource)) {
			return this._lastResolvedSession.session;
		}
		const session = this._sessionsManagementService.getSession(sessionResource);
		this._lastResolvedSession = { sessionResource, session };
		return session;
	}

	getSessionForFile(resourceUri: URI, hostSession?: ISession): ISession | undefined {
		if (!this._isFileEligibleForFeedback(resourceUri)) {
			return undefined;
		}
		const sessionResource = hostSession?.resource ?? this._fileToSession.get(resourceUri) ?? this._focusedSessionHostService.focusedHost.get().session.get()?.resource;
		if (!sessionResource) {
			return undefined;
		}
		const session = hostSession ?? this._resolveSession(sessionResource);
		if (!session || session.status.get() === SessionStatus.Untitled) {
			return undefined;
		}
		return session;
	}

	getChatChanges(sessionResource: URI): readonly ISessionFileChange[] {
		const activeSession = this._focusedSessionHostService.focusedHost.get().session.get();
		if (activeSession && isEqual(activeSession.resource, sessionResource)) {
			return this._focusedSessionHostService.focusedHost.get().chat.get()?.changes.get() ?? [];
		}
		return this._resolveSession(sessionResource)?.mainChat.get().changes.get() ?? [];
	}

	getFeedbackSessionResource(resourceUri: URI, hostSession?: ISession): URI | undefined {
		const explicitScope = this._explicitResourceScopes.get(resourceUri);
		if (explicitScope) {
			return explicitScope;
		}
		if (!this._isFileEligibleForFeedback(resourceUri)) {
			return undefined;
		}

		if (!hostSession) {
			const activeSession = this._focusedSessionHostService.focusedHost.get().session.get();
			if (!activeSession || !isSessionCreated(activeSession)) {
				return AGENT_FEEDBACK_NEW_SESSION_RESOURCE;
			}
		}

		return this.getSessionForFile(resourceUri, hostSession)?.resource;
	}

	registerFeedbackResourceScope(resourceUri: URI, sessionResource: URI): IDisposable {
		this._explicitResourceScopes.set(resourceUri, sessionResource);
		this._onDidChangeFeedbackScope.fire();
		return {
			dispose: () => {
				if (isEqual(this._explicitResourceScopes.get(resourceUri), sessionResource)) {
					this._explicitResourceScopes.delete(resourceUri);
					this._onDidChangeFeedbackScope.fire();
				}
			},
		};
	}

	/**
	 * Whether the given file is eligible for agent feedback. The Output view
	 * renders into a code editor but is not a real file the user can give
	 * feedback on, and a terminal shown as an editor has no document at all,
	 * so neither is in the scope of a session (nor shows its comments).
	 */
	private _isFileEligibleForFeedback(resourceUri: URI): boolean {
		return resourceUri.scheme !== Schemas.outputChannel && resourceUri.scheme !== Schemas.vscodeTerminal;
	}

	addFeedback(sessionResource: URI, resourceUri: URI, range: IRange, text: string, suggestion?: ICodeReviewSuggestion, context?: IAgentFeedbackContext, sourcePRReviewCommentId?: string, kind: AgentFeedbackKind = AgentFeedbackKind.UserReview, state: AgentFeedbackState = AgentFeedbackState.Accepted, sourcePullRequest?: IFeedbackPullRequest, sourcePRReviewCommentAuthor?: string): IAgentFeedback {
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
			sourcePRReviewCommentAuthor,
			sourcePullRequest,
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
		if (this._navigationAnchorBySession.get(key)?.itemId === feedbackId) {
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

	updateFeedbackSourcePullRequest(sessionResource: URI, feedbackId: string, sourcePullRequest: IFeedbackPullRequest, sourcePRReviewCommentAuthor?: string): void {
		const backend = this._backendForSession(sessionResource);
		const existing = backend.getItems(sessionResource).find(item => item.id === feedbackId);
		if (!existing || (existing.sourcePullRequest && (existing.sourcePRReviewCommentAuthor || !sourcePRReviewCommentAuthor))) {
			return;
		}
		backend.upsert({
			...existing,
			sourcePullRequest: existing.sourcePullRequest ?? sourcePullRequest,
			sourcePRReviewCommentAuthor: existing.sourcePRReviewCommentAuthor || sourcePRReviewCommentAuthor,
		});
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

		const newReplies = [...(existing.replies ?? []), { text: replyText, author: 'user' as const }];
		const updated: IAgentFeedback = { ...existing, replies: newReplies };
		backend.upsert(updated);
		this._onDidAddReply.fire({ sessionResource, feedback: updated, replyCount: newReplies.length });
	}

	getFeedback(sessionResource: URI): readonly IAgentFeedback[] {
		return this._backendForSession(sessionResource).getItems(sessionResource);
	}

	showFeedbackInEditor(sessionResource: URI, feedbackIds: readonly string[]): void {
		const resolvedFeedbackIds = new Set(
			this.getFeedback(sessionResource)
				.filter(item => item.state === AgentFeedbackState.Resolved)
				.map(item => item.id)
		);
		const visibleFeedbackIds = this._visibleResolvedFeedbackIds.get(sessionResource) ?? new Set<string>();
		const previousSize = visibleFeedbackIds.size;
		for (const feedbackId of feedbackIds) {
			if (resolvedFeedbackIds.has(feedbackId)) {
				visibleFeedbackIds.add(feedbackId);
			}
		}
		if (visibleFeedbackIds.size !== previousSize) {
			this._visibleResolvedFeedbackIds.set(sessionResource, visibleFeedbackIds);
			this._onDidChangeFeedbackVisibility.fire(sessionResource);
		}
	}

	hideFeedbackInEditor(sessionResource: URI, feedbackId: string): void {
		const visibleFeedbackIds = this._visibleResolvedFeedbackIds.get(sessionResource);
		if (!visibleFeedbackIds?.delete(feedbackId)) {
			return;
		}
		if (visibleFeedbackIds.size === 0) {
			this._visibleResolvedFeedbackIds.delete(sessionResource);
		}
		this._onDidChangeFeedbackVisibility.fire(sessionResource);
	}

	getVisibleResolvedFeedbackIds(sessionResource: URI): ReadonlySet<string> {
		return this._visibleResolvedFeedbackIds.get(sessionResource) ?? new Set();
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

		const session = this._resolveSession(sessionResource);
		if (!session) {
			return false;
		}

		const changes = this.getChatChanges(sessionResource);
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
		this.showFeedbackInEditor(sessionResource, [feedbackId]);
		// Anchor using the session-editor-comment id (not the raw feedback id) so the editor widget contribution matches the active item and expands its widget.
		await this.revealSessionComment(sessionResource, toSessionEditorCommentId(SessionEditorCommentSource.AgentFeedback, feedbackId), feedback.resourceUri, feedback.range);
	}

	async revealSessionComment(sessionResource: URI, commentId: string, resourceUri: URI, range: IRange): Promise<void> {
		const selection = { startLineNumber: range.startLineNumber, startColumn: range.startColumn };
		const sessionChange = this._getSessionChange(resourceUri, this.getChatChanges(sessionResource));

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
		this._onDidRevealSessionComment.fire({ sessionResource, commentId, resourceUri });
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

		const anchorId = this._navigationAnchorBySession.get(key)?.itemId;
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

	setNavigationAnchor(sessionResource: URI, itemId: string | undefined, options?: { readonly reveal?: boolean }): void {
		const key = sessionResource.toString();
		const reveal = options?.reveal ?? true;
		if (itemId) {
			this._navigationAnchorBySession.set(key, { itemId, reveal });
		} else {
			this._navigationAnchorBySession.delete(key);
		}
		this._onDidChangeNavigation.fire({ sessionResource, reveal });
	}

	getNavigationBearing(sessionResource: URI, items: readonly INavigableSessionComment[] = this.getFeedback(sessionResource)): IAgentFeedbackNavigationBearing {
		const key = sessionResource.toString();
		const anchor = this._navigationAnchorBySession.get(key);
		const activeIdx = anchor ? items.findIndex(item => item.id === anchor.itemId) : -1;
		return { activeIdx, totalCount: items.length, reveal: anchor?.reveal ?? true };
	}

	clearFeedback(sessionResource: URI): void {
		const key = sessionResource.toString();
		this._sessionUpdatedOrder.delete(key);
		this._navigationAnchorBySession.delete(key);
		this._visibleResolvedFeedbackIds.delete(sessionResource);
		this._backendForSession(sessionResource).clear(sessionResource);
	}

	async addFeedbackAndSubmit(sessionResource: URI, resourceUri: URI, range: IRange, text: string, suggestion?: ICodeReviewSuggestion, context?: IAgentFeedbackContext, sourcePRReviewCommentId?: string, kind?: AgentFeedbackKind): Promise<void> {
		this.addFeedback(sessionResource, resourceUri, range, text, suggestion, context, sourcePRReviewCommentId, kind);
		if (isEqual(sessionResource, AGENT_FEEDBACK_NEW_SESSION_RESOURCE)) {
			await this.submitFeedback(sessionResource);
			return;
		}

		if (!this.isAgentHostSession(sessionResource)) {
			// Wait for the attachment contribution to update the chat widget's attachment model
			const widget = await whenChatWidgetForSession(this._chatWidgetService, sessionResource);
			if (widget) {
				const attachmentId = ATTACHMENT_ID_PREFIX + sessionResource.toString();
				const hasAttachment = () => widget.attachmentModel.attachments.some(a => a.id === attachmentId);

				if (!hasAttachment()) {
					await Event.toPromise(
						Event.filter(widget.attachmentModel.onDidChange, () => hasAttachment())
					);
				}
			} else {
				this._logService.error('[AgentFeedback] addFeedbackAndSubmit: no chat widget found for session, feedback may not be submitted correctly', sessionResource.toString());
			}
		}

		await this.submitFeedback(sessionResource);
	}

	isAgentHostSession(sessionResource: URI): boolean {
		const session = this._resolveSession(sessionResource);
		return session ? isAgentHostProviderId(session.providerId) : false;
	}

	async submitFeedback(sessionResource: URI, options?: ISubmitFeedbackOptions): Promise<boolean> {
		if (isEqual(sessionResource, AGENT_FEEDBACK_NEW_SESSION_RESOURCE)) {
			if (!this.getFeedback(sessionResource).some(item => item.state === AgentFeedbackState.Accepted)) {
				return false;
			}
			return this._sessionsService.submitNewSessionInput();
		}

		if (options?.backgroundSubmit) {
			if (!this.isAgentHostSession(sessionResource)) {
				this._logService.error('[AgentFeedback] Background submission requires an Agent Host session');
				return false;
			}
			const feedbackIds = options.feedbackIds ? new Set(options.feedbackIds) : undefined;
			const acceptedItems = this.getFeedback(sessionResource).filter(item =>
				item.state === AgentFeedbackState.Accepted && (!feedbackIds || feedbackIds.has(item.id)));
			if (!acceptedItems.length) {
				this._logService.error('[AgentFeedback] No accepted feedback for background submission');
				return false;
			}
			const annotationsResource = this._getAnnotationsBackend().getAnnotationsChannelResource(sessionResource);
			const submitted = await options.backgroundSubmit(options.query ?? '/act-on-feedback',
				createAgentFeedbackVariableEntry(sessionResource, acceptedItems, annotationsResource));
			if (submitted) {
				this.markFeedbackSubmitted(sessionResource, options.feedbackIds);
				options.onRequestAccepted?.();
			}
			return submitted;
		}

		const widget = await whenChatWidgetForSession(this._chatWidgetService, options?.targetChat ?? sessionResource);
		if (!widget) {
			this._logService.error('[AgentFeedback] submitFeedback: no chat widget found for session', (options?.targetChat ?? sessionResource).toString());
			return false;
		}

		// Agent-host sessions don't keep a reactive feedback attachment in the
		// chat input (their feedback lives in the annotations backend and is
		// submitted via the "Submit Feedback" button). Attach the accepted
		// items — which are about to become submitted — to this single request
		// so the agent receives the comments, then remove the transient
		// attachment again once the request has been accepted.
		if (this.isAgentHostSession(sessionResource)) {
			const feedbackIds = options?.feedbackIds ? new Set(options.feedbackIds) : undefined;
			const acceptedItems = this.getFeedback(sessionResource).filter(item =>
				item.state === AgentFeedbackState.Accepted && (!feedbackIds || feedbackIds.has(item.id)));
			const attachmentId = ATTACHMENT_ID_PREFIX + sessionResource.toString();
			if (acceptedItems.length) {
				const annotationsResource = this._getAnnotationsBackend().getAnnotationsChannelResource(sessionResource);
				widget.attachmentModel.delete(attachmentId);
				widget.attachmentModel.addContext(createAgentFeedbackVariableEntry(sessionResource, acceptedItems, annotationsResource));
			}

			return this._sendActOnFeedbackRequest(widget, sessionResource, options, () => widget.attachmentModel.delete(attachmentId));
		}

		// For non-agent-host sessions the reactive attachment contribution also
		// marks submission on send; marking from the helper is idempotent and
		// covers sessions without that contribution.
		const nonAgentHostOptions = options?.feedbackIds ? { ...options, feedbackIds: undefined } : options;
		return this._sendActOnFeedbackRequest(widget, sessionResource, nonAgentHostOptions);
	}

	/**
	 * Sends the `/act-on-feedback` request and marks the accepted feedback as
	 * submitted as soon as the request has been accepted by the chat widget.
	 * The request is queued when the agent is still working on another request,
	 * in which case awaiting {@link IChatWidget.acceptInput} would only resolve
	 * once that queued request eventually runs — the feedback items must move to
	 * the submitted state right away.
	 */
	private _sendActOnFeedbackRequest(widget: IChatWidget, sessionResource: URI, options?: ISubmitFeedbackOptions, cleanup?: () => void): Promise<boolean> {
		const submitted = new DeferredPromise<boolean>();
		const cleanupOnce = cleanup && createSingleCallFunction(cleanup);

		widget.acceptInput(options?.query ?? '/act-on-feedback', {
			onRequestAccepted: () => {
				cleanupOnce?.();
				this.markFeedbackSubmitted(sessionResource, options?.feedbackIds);
				options?.onRequestAccepted?.();
				submitted.complete(true);
			}
		}).then(() => {
			cleanupOnce?.();
			submitted.complete(false);
		}, err => {
			this._logService.error('[AgentFeedback] Failed to submit feedback', err);
			cleanupOnce?.();
			submitted.complete(false);
		});

		return submitted.p;
	}

	markFeedbackSubmitted(sessionResource: URI, feedbackIds?: readonly string[]): void {
		const backend = this._backendForSession(sessionResource);
		const feedbackItems = backend.getItems(sessionResource);
		const selectedFeedbackIds = feedbackIds ? new Set(feedbackIds) : undefined;

		// Agent-host sessions hand the feedback to an agent that resolves each
		// comment (via the resolveComments tool) once it has acted on it, so the
		// items stay visible in the submitted state until then. Other providers
		// have no such agent loop, so submitting resolves the comments directly
		// to hide them from the UI.
		const submittedState = this.isAgentHostSession(sessionResource)
			? AgentFeedbackState.Submitted
			: AgentFeedbackState.Resolved;

		let userCount = 0;
		let codeReviewCount = 0;
		let prReviewCount = 0;
		let replyCount = 0;
		const submitted: IAgentFeedback[] = [];
		for (const item of feedbackItems) {
			if (item.state !== AgentFeedbackState.Accepted || selectedFeedbackIds && !selectedFeedbackIds.has(item.id)) {
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
