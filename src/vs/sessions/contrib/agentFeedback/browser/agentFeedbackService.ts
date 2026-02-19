/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { URI } from '../../../../base/common/uri.js';
import { IRange } from '../../../../editor/common/core/range.js';
import { Comment, CommentThread, CommentThreadCollapsibleState, CommentThreadState, CommentInput } from '../../../../editor/common/languages.js';
import { createDecorator, ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { ICommentController, ICommentInfo, ICommentService, INotebookCommentInfo } from '../../../../workbench/contrib/comments/browser/commentService.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { registerAction2, Action2, MenuId } from '../../../../platform/actions/common/actions.js';
import { ContextKeyExpr } from '../../../../platform/contextkey/common/contextkey.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { localize } from '../../../../nls.js';
import { isEqual } from '../../../../base/common/resources.js';
import { IChatEditingService } from '../../../../workbench/contrib/chat/common/editing/chatEditingService.js';
import { IAgentSessionsService } from '../../../../workbench/contrib/chat/browser/agentSessions/agentSessionsService.js';
import { agentSessionContainsResource, editingEntriesContainResource } from '../../../../workbench/contrib/chat/browser/sessionResourceMatching.js';
import { IChatWidget, IChatWidgetService } from '../../../../workbench/contrib/chat/browser/chat.js';

// --- Types --------------------------------------------------------------------

export interface IAgentFeedback {
	readonly id: string;
	readonly text: string;
	readonly resourceUri: URI;
	readonly range: IRange;
	readonly sessionResource: URI;
}

export interface IAgentFeedbackChangeEvent {
	readonly sessionResource: URI;
	readonly feedbackItems: readonly IAgentFeedback[];
}

export interface IAgentFeedbackNavigationBearing {
	readonly activeIdx: number;
	readonly totalCount: number;
}

// --- Service Interface --------------------------------------------------------

export const IAgentFeedbackService = createDecorator<IAgentFeedbackService>('agentFeedbackService');

export interface IAgentFeedbackService {
	readonly _serviceBrand: undefined;

	readonly onDidChangeFeedback: Event<IAgentFeedbackChangeEvent>;
	readonly onDidChangeNavigation: Event<URI>;

	/**
	 * Add a feedback item for the given session.
	 */
	addFeedback(sessionResource: URI, resourceUri: URI, range: IRange, text: string): IAgentFeedback;

	/**
	 * Remove a single feedback item.
	 */
	removeFeedback(sessionResource: URI, feedbackId: string): void;

	/**
	 * Get all feedback items for a session.
	 */
	getFeedback(sessionResource: URI): readonly IAgentFeedback[];

	/**
	 * Resolve the most recently updated session that has feedback for a given resource.
	 */
	getMostRecentSessionForResource(resourceUri: URI): URI | undefined;

	/**
	 * Navigate to next/previous feedback item in a session.
	 */
	getNextFeedback(sessionResource: URI, next: boolean): IAgentFeedback | undefined;

	/**
	 * Get the current navigation bearings for a session.
	 */
	getNavigationBearing(sessionResource: URI): IAgentFeedbackNavigationBearing;

	/**
	 * Clear all feedback items for a session (e.g., after sending).
	 */
	clearFeedback(sessionResource: URI): void;
}

// --- Implementation -----------------------------------------------------------

const AGENT_FEEDBACK_OWNER = 'agentFeedbackController';
const AGENT_FEEDBACK_CONTEXT_VALUE = 'agentFeedback';
const AGENT_FEEDBACK_ATTACHMENT_ID_PREFIX = 'agentFeedback:';

export class AgentFeedbackService extends Disposable implements IAgentFeedbackService {

	declare readonly _serviceBrand: undefined;

	private readonly _onDidChangeFeedback = this._store.add(new Emitter<IAgentFeedbackChangeEvent>());
	readonly onDidChangeFeedback = this._onDidChangeFeedback.event;
	private readonly _onDidChangeNavigation = this._store.add(new Emitter<URI>());
	readonly onDidChangeNavigation = this._onDidChangeNavigation.event;

	/** sessionResource → feedback items */
	private readonly _feedbackBySession = new Map<string, IAgentFeedback[]>();
	private readonly _sessionUpdatedOrder = new Map<string, number>();
	private _sessionUpdatedSequence = 0;
	private readonly _navigationAnchorBySession = new Map<string, string>();

	private _controllerRegistered = false;
	private _nextThreadHandle = 1;

	constructor(
		@ICommentService private readonly _commentService: ICommentService,
		@IChatEditingService private readonly _chatEditingService: IChatEditingService,
		@IAgentSessionsService private readonly _agentSessionsService: IAgentSessionsService,
		@IChatWidgetService private readonly _chatWidgetService: IChatWidgetService,
	) {
		super();

		this._registerChatWidgetListeners();
	}

	private _registerChatWidgetListeners(): void {
		for (const widget of this._chatWidgetService.getAllWidgets()) {
			this._registerWidgetListeners(widget);
		}

		this._store.add(this._chatWidgetService.onDidAddWidget(widget => {
			this._registerWidgetListeners(widget);
		}));
	}

	private _registerWidgetListeners(widget: IChatWidget): void {
		this._store.add(widget.attachmentModel.onDidChange(e => {
			for (const deletedId of e.deleted) {
				if (!deletedId.startsWith(AGENT_FEEDBACK_ATTACHMENT_ID_PREFIX)) {
					continue;
				}

				const sessionResourceString = deletedId.slice(AGENT_FEEDBACK_ATTACHMENT_ID_PREFIX.length);
				if (!sessionResourceString) {
					continue;
				}

				const sessionResource = URI.parse(sessionResourceString);
				if (this.getFeedback(sessionResource).length > 0) {
					this.clearFeedback(sessionResource);
				}
			}
		}));
	}

	private _ensureController(): void {
		if (this._controllerRegistered) {
			return;
		}
		this._controllerRegistered = true;

		const self = this;

		const controller: ICommentController = {
			id: AGENT_FEEDBACK_OWNER,
			label: 'Agent Feedback',
			features: {},
			contextValue: AGENT_FEEDBACK_CONTEXT_VALUE,
			owner: AGENT_FEEDBACK_OWNER,
			activeComment: undefined,
			createCommentThreadTemplate: async () => { },
			updateCommentThreadTemplate: async () => { },
			deleteCommentThreadMain: () => { },
			toggleReaction: async () => { },
			getDocumentComments: async (resource: URI, _token: CancellationToken): Promise<ICommentInfo<IRange>> => {
				// Return threads for this resource from all sessions
				const threads: CommentThread<IRange>[] = [];
				for (const [, sessionFeedback] of self._feedbackBySession) {
					for (const f of sessionFeedback) {
						if (f.resourceUri.toString() === resource.toString()) {
							threads.push(self._createThread(f));
						}
					}
				}
				return {
					threads,
					commentingRanges: { ranges: [], resource, fileComments: false },
					uniqueOwner: AGENT_FEEDBACK_OWNER,
				};
			},
			getNotebookComments: async (_resource: URI, _token: CancellationToken): Promise<INotebookCommentInfo> => {
				return { threads: [], uniqueOwner: AGENT_FEEDBACK_OWNER };
			},
			setActiveCommentAndThread: async () => { },
		};

		this._commentService.registerCommentController(AGENT_FEEDBACK_OWNER, controller);
		this._store.add({ dispose: () => this._commentService.unregisterCommentController(AGENT_FEEDBACK_OWNER) });

		// Register delete action for our feedback threads
		this._store.add(registerAction2(class extends Action2 {
			constructor() {
				super({
					id: 'agentFeedback.deleteThread',
					title: localize('agentFeedback.delete', "Delete Feedback"),
					icon: Codicon.trash,
					menu: {
						id: MenuId.CommentThreadTitle,
						when: ContextKeyExpr.equals('commentController', AGENT_FEEDBACK_CONTEXT_VALUE),
						group: 'navigation',
					}
				});
			}
			run(accessor: ServicesAccessor, ...args: unknown[]): void {
				const agentFeedbackService = accessor.get(IAgentFeedbackService);
				const arg = args[0] as { thread?: { threadId?: string }; threadId?: string } | undefined;
				const thread = arg?.thread ?? arg;
				if (thread?.threadId) {
					const sessionResource = self._findSessionForFeedback(thread.threadId);
					if (sessionResource) {
						agentFeedbackService.removeFeedback(sessionResource, thread.threadId);
					}
				}
			}
		}));
	}

	addFeedback(sessionResource: URI, resourceUri: URI, range: IRange, text: string): IAgentFeedback {
		this._ensureController();

		const key = sessionResource.toString();
		let feedbackItems = this._feedbackBySession.get(key);
		if (!feedbackItems) {
			feedbackItems = [];
			this._feedbackBySession.set(key, feedbackItems);
		}

		const feedback: IAgentFeedback = {
			id: generateUuid(),
			text,
			resourceUri,
			range,
			sessionResource,
		};
		feedbackItems.push(feedback);
		this._sessionUpdatedOrder.set(key, ++this._sessionUpdatedSequence);
		this._onDidChangeNavigation.fire(sessionResource);

		this._syncThreads(sessionResource);
		this._onDidChangeFeedback.fire({ sessionResource, feedbackItems });

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
			const removed = feedbackItems[idx];
			feedbackItems.splice(idx, 1);
			this._activeThreadIds.delete(feedbackId);
			if (this._navigationAnchorBySession.get(key) === feedbackId) {
				this._navigationAnchorBySession.delete(key);
				this._onDidChangeNavigation.fire(sessionResource);
			}
			if (feedbackItems.length > 0) {
				this._sessionUpdatedOrder.set(key, ++this._sessionUpdatedSequence);
			} else {
				this._sessionUpdatedOrder.delete(key);
			}

			// Fire updateComments with the thread in removed[] so the editor
			// controller's onDidUpdateCommentThreads handler removes the zone widget
			const thread = this._createThread(removed);
			thread.isDisposed = true;
			this._commentService.updateComments(AGENT_FEEDBACK_OWNER, {
				added: [],
				removed: [thread],
				changed: [],
				pending: [],
			});

			this._onDidChangeFeedback.fire({ sessionResource, feedbackItems });
		}
	}

	/**
	 * Find which session a feedback item belongs to by its ID.
	 */
	_findSessionForFeedback(feedbackId: string): URI | undefined {
		for (const [, feedbackItems] of this._feedbackBySession) {
			const item = feedbackItems.find(f => f.id === feedbackId);
			if (item) {
				return item.sessionResource;
			}
		}
		return undefined;
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

		for (const session of this._agentSessionsService.model.sessions) {
			if (!isEqual(session.resource, sessionResource)) {
				continue;
			}

			if (agentSessionContainsResource(session, resourceUri)) {
				return true;
			}
		}

		return false;
	}

	getNextFeedback(sessionResource: URI, next: boolean): IAgentFeedback | undefined {
		const key = sessionResource.toString();
		const feedbackItems = this._feedbackBySession.get(key);
		if (!feedbackItems?.length) {
			this._navigationAnchorBySession.delete(key);
			return undefined;
		}

		const anchorId = this._navigationAnchorBySession.get(key);
		let anchorIndex = anchorId ? feedbackItems.findIndex(item => item.id === anchorId) : -1;

		if (anchorIndex < 0 && !next) {
			anchorIndex = 0;
		}

		const nextIndex = next
			? (anchorIndex + 1) % feedbackItems.length
			: (anchorIndex - 1 + feedbackItems.length) % feedbackItems.length;

		const feedback = feedbackItems[nextIndex];
		this._navigationAnchorBySession.set(key, feedback.id);
		this._onDidChangeNavigation.fire(sessionResource);
		return feedback;
	}

	getNavigationBearing(sessionResource: URI): IAgentFeedbackNavigationBearing {
		const key = sessionResource.toString();
		const feedbackItems = this._feedbackBySession.get(key) ?? [];
		const anchorId = this._navigationAnchorBySession.get(key);
		const activeIdx = anchorId ? feedbackItems.findIndex(item => item.id === anchorId) : -1;
		return { activeIdx, totalCount: feedbackItems.length };
	}

	clearFeedback(sessionResource: URI): void {
		const key = sessionResource.toString();
		const feedbackItems = this._feedbackBySession.get(key);
		if (feedbackItems && feedbackItems.length > 0) {
			const removedThreads = feedbackItems.map(f => {
				this._activeThreadIds.delete(f.id);
				const thread = this._createThread(f);
				thread.isDisposed = true;
				return thread;
			});

			this._commentService.updateComments(AGENT_FEEDBACK_OWNER, {
				added: [],
				removed: removedThreads,
				changed: [],
				pending: [],
			});
		}
		this._feedbackBySession.delete(key);
		this._sessionUpdatedOrder.delete(key);
		this._navigationAnchorBySession.delete(key);
		this._onDidChangeNavigation.fire(sessionResource);
		this._onDidChangeFeedback.fire({ sessionResource, feedbackItems: [] });
	}

	/** Threads currently known to the comment service, keyed by feedback id */
	private readonly _activeThreadIds = new Set<string>();

	/**
	 * Sync feedback threads to the ICommentService using updateComments for
	 * incremental add/remove, which the editor controller listens to.
	 */
	private _syncThreads(_sessionResource: URI): void {
		// Collect all current feedback IDs
		const currentIds = new Set<string>();
		const allFeedback: IAgentFeedback[] = [];
		for (const [, sessionFeedback] of this._feedbackBySession) {
			for (const f of sessionFeedback) {
				currentIds.add(f.id);
				allFeedback.push(f);
			}
		}

		// Determine added and removed
		const added: CommentThread<IRange>[] = [];
		const removed: CommentThread<IRange>[] = [];

		for (const f of allFeedback) {
			if (!this._activeThreadIds.has(f.id)) {
				added.push(this._createThread(f));
			}
		}

		for (const id of this._activeThreadIds) {
			if (!currentIds.has(id)) {
				// Create a minimal thread just for removal (needs threadId and resource)
				removed.push(this._createRemovedThread(id));
			}
		}

		// Update tracking
		this._activeThreadIds.clear();
		for (const id of currentIds) {
			this._activeThreadIds.add(id);
		}

		if (added.length || removed.length) {
			this._commentService.updateComments(AGENT_FEEDBACK_OWNER, {
				added,
				removed,
				changed: [],
				pending: [],
			});
		}
	}

	private _createRemovedThread(feedbackId: string): CommentThread<IRange> {
		const noopEvent = Event.None;
		return {
			isDocumentCommentThread(): this is CommentThread<IRange> { return true; },
			commentThreadHandle: -1,
			controllerHandle: 0,
			threadId: feedbackId,
			resource: null,
			range: undefined,
			label: undefined,
			contextValue: undefined,
			comments: undefined,
			onDidChangeComments: noopEvent,
			collapsibleState: CommentThreadCollapsibleState.Collapsed,
			initialCollapsibleState: CommentThreadCollapsibleState.Collapsed,
			onDidChangeInitialCollapsibleState: noopEvent,
			state: undefined,
			applicability: undefined,
			canReply: false,
			input: undefined,
			onDidChangeInput: noopEvent,
			onDidChangeLabel: noopEvent,
			onDidChangeCollapsibleState: noopEvent,
			onDidChangeState: noopEvent,
			onDidChangeCanReply: noopEvent,
			isDisposed: true,
			isTemplate: false,
		};
	}

	private _createThread(feedback: IAgentFeedback): CommentThread<IRange> {
		const handle = this._nextThreadHandle++;

		const threadComment: Comment = {
			uniqueIdInThread: 1,
			body: feedback.text,
			userName: 'You',
		};

		return new AgentFeedbackThread(handle, feedback.id, feedback.resourceUri.toString(), feedback.range, [threadComment]);
	}
}

/**
 * A CommentThread implementation with proper emitters so the editor
 * comment controller can react to state changes (collapse/expand).
 */
class AgentFeedbackThread implements CommentThread<IRange> {

	private readonly _onDidChangeComments = new Emitter<readonly Comment[] | undefined>();
	readonly onDidChangeComments = this._onDidChangeComments.event;

	private readonly _onDidChangeCollapsibleState = new Emitter<CommentThreadCollapsibleState | undefined>();
	readonly onDidChangeCollapsibleState = this._onDidChangeCollapsibleState.event;

	private readonly _onDidChangeInitialCollapsibleState = new Emitter<CommentThreadCollapsibleState | undefined>();
	readonly onDidChangeInitialCollapsibleState = this._onDidChangeInitialCollapsibleState.event;

	private readonly _onDidChangeInput = new Emitter<CommentInput | undefined>();
	readonly onDidChangeInput = this._onDidChangeInput.event;

	private readonly _onDidChangeLabel = new Emitter<string | undefined>();
	readonly onDidChangeLabel = this._onDidChangeLabel.event;

	private readonly _onDidChangeState = new Emitter<CommentThreadState | undefined>();
	readonly onDidChangeState = this._onDidChangeState.event;

	private readonly _onDidChangeCanReply = new Emitter<boolean>();
	readonly onDidChangeCanReply = this._onDidChangeCanReply.event;

	readonly controllerHandle = 0;
	readonly label = undefined;
	readonly contextValue = undefined;
	readonly applicability = undefined;
	readonly input = undefined;
	readonly isTemplate = false;

	private _collapsibleState = CommentThreadCollapsibleState.Collapsed;
	get collapsibleState(): CommentThreadCollapsibleState { return this._collapsibleState; }
	set collapsibleState(value: CommentThreadCollapsibleState) {
		this._collapsibleState = value;
		this._onDidChangeCollapsibleState.fire(value);
	}

	readonly initialCollapsibleState = CommentThreadCollapsibleState.Collapsed;
	readonly state = CommentThreadState.Unresolved;
	readonly canReply = false;
	isDisposed = false;

	constructor(
		readonly commentThreadHandle: number,
		readonly threadId: string,
		readonly resource: string,
		readonly range: IRange,
		readonly comments: readonly Comment[],
	) { }

	isDocumentCommentThread(): this is CommentThread<IRange> {
		return true;
	}
}
