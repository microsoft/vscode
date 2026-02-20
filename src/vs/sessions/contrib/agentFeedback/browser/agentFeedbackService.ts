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
	) {
		super();
	}

	addFeedback(sessionResource: URI, resourceUri: URI, range: IRange, text: string): IAgentFeedback {
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
		this._feedbackBySession.delete(key);
		this._sessionUpdatedOrder.delete(key);
		this._navigationAnchorBySession.delete(key);
		this._onDidChangeNavigation.fire(sessionResource);
		this._onDidChangeFeedback.fire({ sessionResource, feedbackItems: [] });
	}
}
