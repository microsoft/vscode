/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { URI } from '../../../../base/common/uri.js';
import { IRange } from '../../../../editor/common/core/range.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { isEqual } from '../../../../base/common/resources.js';
import { IChatEditingService } from '../../../../workbench/contrib/chat/common/editing/chatEditingService.js';
import { IAgentSessionsService } from '../../../../workbench/contrib/chat/browser/agentSessions/agentSessionsService.js';
import { agentSessionContainsResource, editingEntriesContainResource } from '../../../../workbench/contrib/chat/browser/sessionResourceMatching.js';
import { IEditorService } from '../../../../workbench/services/editor/common/editorService.js';
import { IChatWidgetService } from '../../../../workbench/contrib/chat/browser/chat.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { ICodeReviewSuggestion } from '../../codeReview/browser/codeReviewService.js';

// --- Types --------------------------------------------------------------------

export interface IAgentFeedback {
	readonly id: string;
	readonly text: string;
	readonly resourceUri: URI;
	readonly range: IRange;
	readonly sessionResource: URI;
	readonly suggestion?: ICodeReviewSuggestion;
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

// --- Service Interface --------------------------------------------------------

export const IAgentFeedbackService = createDecorator<IAgentFeedbackService>('agentFeedbackService');

export interface IAgentFeedbackService {
	readonly _serviceBrand: undefined;

	readonly onDidChangeFeedback: Event<IAgentFeedbackChangeEvent>;
	readonly onDidChangeNavigation: Event<URI>;

	/**
	 * Add a feedback item for the given session.
	 */
	addFeedback(sessionResource: URI, resourceUri: URI, range: IRange, text: string, suggestion?: ICodeReviewSuggestion): IAgentFeedback;

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
	 * Set the navigation anchor to a specific feedback item, open its editor, and fire a navigation event.
	 */
	revealFeedback(sessionResource: URI, feedbackId: string): Promise<void>;

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
	 * Add a feedback item and then submit the feedback. Waits for the
	 * attachment to be updated in the chat widget before submitting.
	 */
	addFeedbackAndSubmit(sessionResource: URI, resourceUri: URI, range: IRange, text: string, suggestion?: ICodeReviewSuggestion): Promise<void>;
}

// --- Implementation -----------------------------------------------------------

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

	constructor(
		@IChatEditingService private readonly _chatEditingService: IChatEditingService,
		@IAgentSessionsService private readonly _agentSessionsService: IAgentSessionsService,
		@IEditorService private readonly _editorService: IEditorService,
		@IChatWidgetService private readonly _chatWidgetService: IChatWidgetService,
		@ICommandService private readonly _commandService: ICommandService,
		@ILogService private readonly _logService: ILogService,
	) {
		super();
	}

	addFeedback(sessionResource: URI, resourceUri: URI, range: IRange, text: string, suggestion?: ICodeReviewSuggestion): IAgentFeedback {
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
			suggestion,
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

	async revealFeedback(sessionResource: URI, feedbackId: string): Promise<void> {
		const key = sessionResource.toString();
		const feedbackItems = this._feedbackBySession.get(key);
		const feedback = feedbackItems?.find(f => f.id === feedbackId);
		if (!feedback) {
			return;
		}
		await this._editorService.openEditor({
			resource: feedback.resourceUri,
			options: {
				preserveFocus: false,
				revealIfVisible: true,
			}
		});
		setTimeout(() => {
			this.setNavigationAnchor(sessionResource, feedbackId);
		}, 50); // delay to ensure editor has revealed the correct position before firing navigation event
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

	async addFeedbackAndSubmit(sessionResource: URI, resourceUri: URI, range: IRange, text: string, suggestion?: ICodeReviewSuggestion): Promise<void> {
		this.addFeedback(sessionResource, resourceUri, range, text, suggestion);

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

		try {
			await this._commandService.executeCommand('agentFeedbackEditor.action.submit');
		} catch (err) {
			this._logService.error('[AgentFeedback] Failed to execute submit feedback command', err);
		}
	}
}
