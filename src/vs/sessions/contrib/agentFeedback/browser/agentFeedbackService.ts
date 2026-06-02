/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { ResourceMap } from '../../../../base/common/map.js';
import { URI } from '../../../../base/common/uri.js';
import { IRange } from '../../../../editor/common/core/range.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { isEqual } from '../../../../base/common/resources.js';
import { IChatEditingService } from '../../../../workbench/contrib/chat/common/editing/chatEditingService.js';
import { isIChatSessionFileChange2 } from '../../../../workbench/contrib/chat/common/chatSessionsService.js';
import { ISessionsManagementService } from '../../../services/sessions/common/sessionsManagement.js';
import { editingEntriesContainResource } from '../../../../workbench/contrib/chat/browser/sessionResourceMatching.js';
import { changeMatchesResource, getActiveResourceCandidates, IAgentFeedbackContext } from './agentFeedbackEditorUtils.js';
import { IEditorService } from '../../../../workbench/services/editor/common/editorService.js';
import { IChatWidgetService } from '../../../../workbench/contrib/chat/browser/chat.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { ICodeReviewSuggestion } from '../../codeReview/browser/codeReviewService.js';
import { ISession, ISessionFileChange, SessionStatus } from '../../../services/sessions/common/session.js';

// --- Types --------------------------------------------------------------------

/**
 * The origin of an agent feedback item. Used to classify how the feedback
 * entered the session so that telemetry can distinguish user-authored
 * feedback from feedback converted out of an existing review comment.
 */
export type AgentFeedbackKind = 'user' | 'codeReview' | 'prReview';

export interface IAgentFeedback {
	readonly id: string;
	readonly text: string;
	readonly resourceUri: URI;
	readonly range: IRange;
	readonly sessionResource: URI;
	readonly suggestion?: ICodeReviewSuggestion;
	readonly codeSelection?: string;
	readonly diffHunks?: string;
	/** Origin of this feedback item (user-authored, converted from code/PR review). */
	readonly kind: AgentFeedbackKind;
	/** When this feedback was converted from a PR review comment, the original thread ID. */
	readonly sourcePRReviewCommentId?: string;
	/**
	 * Additional comment messages that belong to the same thread as this feedback,
	 * talking about the same code region. The first {@link text} is the initial
	 * comment; replies are subsequent messages added to it.
	 */
	readonly replies?: readonly string[];
}

export interface INavigableSessionComment {
	readonly id: string;
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
	readonly kind: 'codeReview' | 'prReview';
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
	 * `'user'`) classifies the origin of the feedback and selects which
	 * lifecycle event is fired.
	 */
	addFeedback(sessionResource: URI, resourceUri: URI, range: IRange, text: string, suggestion?: ICodeReviewSuggestion, context?: IAgentFeedbackContext, sourcePRReviewCommentId?: string, kind?: AgentFeedbackKind): IAgentFeedback;

	/**
	 * Remove a single feedback item.
	 */
	removeFeedback(sessionResource: URI, feedbackId: string): void;

	/**
	 * Update the text of an existing feedback item.
	 */
	updateFeedback(sessionResource: URI, feedbackId: string, newText: string): void;

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
	 * Resolve the session that owns the given file resource. Returns the
	 * session that was active when the file's editor was first opened; if the
	 * file has never been tracked, falls back to the currently active session.
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
	 * Submit the currently accumulated feedback for the session to the agent.
	 * Captures the per-kind counts before submission and fires
	 * {@link onDidSubmitFeedback}.
	 */
	submitFeedback(sessionResource: URI): Promise<void>;

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

	/** sessionResource → feedback items */
	private readonly _feedbackBySession = new Map<string, IAgentFeedback[]>();
	private readonly _sessionUpdatedOrder = new Map<string, number>();
	private _sessionUpdatedSequence = 0;
	private readonly _navigationAnchorBySession = new Map<string, string>();

	/** fileResource → sessionResource active when the editor for that file was first seen */
	private readonly _fileToSession = new ResourceMap<URI>();

	constructor(
		@IChatEditingService private readonly _chatEditingService: IChatEditingService,
		@ISessionsManagementService private readonly _sessionsManagementService: ISessionsManagementService,
		@IEditorService private readonly _editorService: IEditorService,
		@IChatWidgetService private readonly _chatWidgetService: IChatWidgetService,
		@ILogService private readonly _logService: ILogService,
	) {
		super();

		this._register(this._editorService.onDidVisibleEditorsChange(() => this._trackVisibleEditorResources()));
		this._trackVisibleEditorResources();
	}

	private _trackVisibleEditorResources(): void {
		const activeSession = this._sessionsManagementService.activeSession.get();
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
		const sessionResource = this._fileToSession.get(resourceUri) ?? this._sessionsManagementService.activeSession.get()?.resource;
		if (!sessionResource) {
			return undefined;
		}
		const session = this._sessionsManagementService.getSession(sessionResource);
		if (!session || session.status.get() === SessionStatus.Untitled) {
			return undefined;
		}
		return session;
	}

	addFeedback(sessionResource: URI, resourceUri: URI, range: IRange, text: string, suggestion?: ICodeReviewSuggestion, context?: IAgentFeedbackContext, sourcePRReviewCommentId?: string, kind: AgentFeedbackKind = 'user'): IAgentFeedback {
		const key = sessionResource.toString();
		let feedbackItems = this._feedbackBySession.get(key);
		if (!feedbackItems) {
			feedbackItems = [];
			this._feedbackBySession.set(key, feedbackItems);
		}

		// A sourcePRReviewCommentId implies the feedback originated from a PR review.
		const effectiveKind: AgentFeedbackKind = sourcePRReviewCommentId ? 'prReview' : kind;

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
		};

		// Insert at the correct sorted position.
		// Files are grouped by recency: first feedback for a new file appears after
		// all existing files. Within a file, items are sorted by startLineNumber.
		const resourceStr = resourceUri.toString();
		const hasExistingForFile = feedbackItems.some(f => f.resourceUri.toString() === resourceStr);

		if (!hasExistingForFile) {
			// New file — append at the end
			feedbackItems.push(feedback);
		} else {
			// Find insertion point: after the last item for a different file that
			// precedes this file's block, then within this file's block by line number.
			let insertIdx = feedbackItems.length;
			for (let i = 0; i < feedbackItems.length; i++) {
				if (feedbackItems[i].resourceUri.toString() === resourceStr
					&& feedbackItems[i].range.startLineNumber > range.startLineNumber) {
					insertIdx = i;
					break;
				}
				// If we passed the last item for this file without finding a larger
				// line number, insert right after the file's block.
				if (feedbackItems[i].resourceUri.toString() === resourceStr) {
					insertIdx = i + 1;
				}
			}
			feedbackItems.splice(insertIdx, 0, feedback);
		}

		this._sessionUpdatedOrder.set(key, ++this._sessionUpdatedSequence);
		this._onDidChangeNavigation.fire(sessionResource);

		this._onDidChangeFeedback.fire({ sessionResource, feedbackItems });

		if (effectiveKind === 'user') {
			this._onDidAddFeedback.fire({ sessionResource, feedback, hasExistingFeedbackForFile: hasExistingForFile });
		} else {
			this._onDidConvertFeedback.fire({ sessionResource, feedback, kind: effectiveKind, hasExistingFeedbackForFile: hasExistingForFile });
		}

		return feedback;
	}

	removeFeedback(sessionResource: URI, feedbackId: string): void {
		const key = sessionResource.toString();
		const feedbackItems = this._feedbackBySession.get(key);
		if (!feedbackItems) {
			return;
		}

		const idx = feedbackItems.findIndex(f => f.id === feedbackId);
		if (idx >= 0) {
			feedbackItems.splice(idx, 1);
			if (this._navigationAnchorBySession.get(key) === feedbackId) {
				this._navigationAnchorBySession.delete(key);
				this._onDidChangeNavigation.fire(sessionResource);
			}
			if (feedbackItems.length > 0) {
				this._sessionUpdatedOrder.set(key, ++this._sessionUpdatedSequence);
			} else {
				this._sessionUpdatedOrder.delete(key);
			}

			this._onDidChangeFeedback.fire({ sessionResource, feedbackItems });
		}
	}

	updateFeedback(sessionResource: URI, feedbackId: string, newText: string): void {
		const key = sessionResource.toString();
		const feedbackItems = this._feedbackBySession.get(key);
		if (!feedbackItems) {
			return;
		}

		const idx = feedbackItems.findIndex(f => f.id === feedbackId);
		if (idx >= 0) {
			const existing = feedbackItems[idx];
			feedbackItems[idx] = {
				...existing,
				text: newText,
			};
			this._sessionUpdatedOrder.set(key, ++this._sessionUpdatedSequence);
			this._onDidChangeFeedback.fire({ sessionResource, feedbackItems });
		}
	}

	addReply(sessionResource: URI, feedbackId: string, replyText: string): void {
		const key = sessionResource.toString();
		const feedbackItems = this._feedbackBySession.get(key);
		if (!feedbackItems) {
			return;
		}

		const idx = feedbackItems.findIndex(f => f.id === feedbackId);
		if (idx < 0) {
			return;
		}

		const existing = feedbackItems[idx];
		const newReplies = [...(existing.replies ?? []), replyText];
		const updated: IAgentFeedback = {
			...existing,
			replies: newReplies,
		};
		feedbackItems[idx] = updated;
		this._sessionUpdatedOrder.set(key, ++this._sessionUpdatedSequence);
		this._onDidChangeFeedback.fire({ sessionResource, feedbackItems });
		this._onDidAddReply.fire({ sessionResource, feedback: updated, replyCount: newReplies.length });
	}

	getFeedback(sessionResource: URI): readonly IAgentFeedback[] {
		return this._feedbackBySession.get(sessionResource.toString()) ?? [];
	}

	getMostRecentSessionForResource(resourceUri: URI): URI | undefined {
		let bestSession: URI | undefined;
		let bestSequence = -1;

		for (const [, feedbackItems] of this._feedbackBySession) {
			if (!feedbackItems.length) {
				continue;
			}

			const candidate = feedbackItems[0].sessionResource;
			if (!this._sessionContainsResource(candidate, resourceUri, feedbackItems)) {
				continue;
			}

			const sequence = this._sessionUpdatedOrder.get(candidate.toString()) ?? 0;
			if (sequence > bestSequence) {
				bestSession = candidate;
				bestSequence = sequence;
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
		const key = sessionResource.toString();
		const feedbackItems = this._feedbackBySession.get(key);
		const feedback = feedbackItems?.find(f => f.id === feedbackId);
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

	getNavigationBearing(sessionResource: URI, items: readonly INavigableSessionComment[] = this._feedbackBySession.get(sessionResource.toString()) ?? []): IAgentFeedbackNavigationBearing {
		const key = sessionResource.toString();
		const anchorId = this._navigationAnchorBySession.get(key);
		const activeIdx = anchorId ? items.findIndex(item => item.id === anchorId) : -1;
		return { activeIdx, totalCount: items.length };
	}

	clearFeedback(sessionResource: URI): void {
		const key = sessionResource.toString();
		this._feedbackBySession.delete(key);
		this._sessionUpdatedOrder.delete(key);
		this._navigationAnchorBySession.delete(key);
		this._onDidChangeNavigation.fire(sessionResource);
		this._onDidChangeFeedback.fire({ sessionResource, feedbackItems: [] });
	}

	async addFeedbackAndSubmit(sessionResource: URI, resourceUri: URI, range: IRange, text: string, suggestion?: ICodeReviewSuggestion, context?: IAgentFeedbackContext, sourcePRReviewCommentId?: string, kind?: AgentFeedbackKind): Promise<void> {
		this.addFeedback(sessionResource, resourceUri, range, text, suggestion, context, sourcePRReviewCommentId, kind);

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

		await this.submitFeedback(sessionResource);
	}

	async submitFeedback(sessionResource: URI): Promise<void> {
		const widget = this._chatWidgetService.getWidgetBySessionResource(sessionResource);
		if (!widget) {
			this._logService.error('[AgentFeedback] submitFeedback: no chat widget found for session', sessionResource.toString());
			return;
		}

		const feedbackItems = this._feedbackBySession.get(sessionResource.toString()) ?? [];
		let userCount = 0;
		let codeReviewCount = 0;
		let prReviewCount = 0;
		let replyCount = 0;
		for (const item of feedbackItems) {
			switch (item.kind) {
				case 'user': userCount++; break;
				case 'codeReview': codeReviewCount++; break;
				case 'prReview': prReviewCount++; break;
			}
			replyCount += item.replies?.length ?? 0;
		}

		this._onDidSubmitFeedback.fire({
			sessionResource,
			totalCount: feedbackItems.length,
			userCount,
			codeReviewCount,
			prReviewCount,
			replyCount,
		});

		try {
			await widget.acceptInput('/act-on-feedback');
		} catch (err) {
			this._logService.error('[AgentFeedback] Failed to submit feedback', err);
		}
	}
}
