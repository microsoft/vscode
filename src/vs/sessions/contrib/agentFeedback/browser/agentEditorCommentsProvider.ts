/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable, DisposableMap } from '../../../../base/common/lifecycle.js';
import { isEqual } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import { IRange } from '../../../../editor/common/core/range.js';
import { IWorkbenchContribution } from '../../../../workbench/common/contributions.js';
import { IAgentEditorComment, IAgentEditorCommentRevealEvent, IAgentEditorCommentsBridge, IAgentEditorCommentsProvider } from '../../../../workbench/services/agentEditorComments/common/agentEditorComments.js';
import { IAgentFeedbackService } from './agentFeedbackService.js';
import { getSessionEditorComments, fromSessionEditorCommentId, SessionEditorCommentSource } from './sessionEditorComments.js';
import { IPlanReviewFeedbackService } from '../../../../workbench/contrib/chat/browser/planReviewFeedback/planReviewFeedbackService.js';
import { AgentFeedbackState } from './agentFeedbackModel.js';

/**
 * Registers a provider with the workbench {@link IAgentEditorCommentsBridge}
 * that surfaces the active session's comments (the same store the code editor
 * renders from) to the extension host, so custom editors (e.g. the Markdown
 * editor) can render and contribute the same comments. Lives in the sessions
 * layer because the feedback service does.
 */
export class AgentEditorCommentsProviderContribution extends Disposable implements IWorkbenchContribution, IAgentEditorCommentsProvider {

	static readonly ID = 'workbench.contrib.agentEditorCommentsProvider';
	readonly priority = 100;

	readonly onDidChangeComments: Event<void>;
	private readonly _onDidRevealComment = this._register(new Emitter<IAgentEditorCommentRevealEvent>());
	readonly onDidRevealComment = this._onDidRevealComment.event;
	private readonly _planScopes = this._register(new DisposableMap<string>());
	private _pendingReveal: IAgentEditorCommentRevealEvent | undefined;

	constructor(
		@IAgentFeedbackService private readonly _agentFeedbackService: IAgentFeedbackService,
		@IPlanReviewFeedbackService planReviewFeedbackService: IPlanReviewFeedbackService,
		@IAgentEditorCommentsBridge bridge: IAgentEditorCommentsBridge,
	) {
		super();
		const onDidChangeComments = Event.any(this._agentFeedbackService.onDidChangeFeedback, this._agentFeedbackService.onDidChangeFeedbackVisibility, this._agentFeedbackService.onDidChangeFeedbackScope);
		this.onDidChangeComments = Event.signal(onDidChangeComments);
		this._register(bridge.registerProvider(this));
		this._register(this._agentFeedbackService.onDidRevealSessionComment(event => {
			this._pendingReveal = { resource: event.resourceUri, id: event.commentId };
			this._revealPendingComment();
		}));
		this._register(onDidChangeComments(() => this._revealPendingComment()));
		this._register(planReviewFeedbackService.onDidChangePlanReviewScope(({ planUri, sessionResource, active }) => {
			if (active) {
				this._planScopes.set(planUri.toString(), this._agentFeedbackService.registerFeedbackResourceScope(planUri, sessionResource));
			} else {
				this._planScopes.deleteAndDispose(planUri.toString());
			}
		}));
	}

	acceptsComments(resource: URI): boolean {
		return !!this._agentFeedbackService.getFeedbackSessionResource(resource);
	}

	getComments(resource: URI, includeRelated = false): readonly IAgentEditorComment[] {
		const sessionResource = this._getSessionResource(resource);
		if (!sessionResource) {
			return [];
		}
		const comments: IAgentEditorComment[] = [];
		const sessionComments = getSessionEditorComments(
			sessionResource,
			this._agentFeedbackService.getFeedback(sessionResource),
			undefined,
			this._agentFeedbackService.getVisibleResolvedFeedbackIds(sessionResource),
		);
		for (const comment of sessionComments) {
			if ((includeRelated && comment.source === SessionEditorCommentSource.AgentFeedback && comment.state === AgentFeedbackState.Accepted)
				|| (!includeRelated && isEqual(comment.resourceUri, resource))) {
				comments.push({ id: comment.id, resource: comment.resourceUri, range: comment.range, body: comment.text });
			}
		}
		return comments;
	}

	getCommentIds(resource: URI, includeRelated = false): readonly string[] {
		const sessionResource = this._getSessionResource(resource);
		if (!sessionResource) {
			return [];
		}
		return getSessionEditorComments(
			sessionResource,
			this._agentFeedbackService.getFeedback(sessionResource),
			undefined,
			this._agentFeedbackService.getVisibleResolvedFeedbackIds(sessionResource),
		)
			.filter(comment => includeRelated || isEqual(comment.resourceUri, resource))
			.map(comment => comment.id);
	}

	addComment(resource: URI, range: IRange, body: string): void {
		const sessionResource = this._getSessionResource(resource);
		if (!sessionResource) {
			return;
		}
		this._agentFeedbackService.addFeedback(sessionResource, resource, range, body);
	}

	deleteComment(resource: URI, id: string): void {
		const sessionResource = this._getSessionResource(resource);
		if (!sessionResource) {
			return;
		}
		// Only agent feedback comments are surfaced to (and thus deletable from)
		// custom editors; see `getComments`.
		const parsed = fromSessionEditorCommentId(id);
		if (parsed?.source !== SessionEditorCommentSource.AgentFeedback) {
			return;
		}
		const feedback = this._agentFeedbackService.getFeedback(sessionResource).find(item => item.id === parsed.sourceId);
		if (feedback?.state === AgentFeedbackState.Resolved) {
			this._agentFeedbackService.hideFeedbackInEditor(sessionResource, parsed.sourceId);
		} else {
			this._agentFeedbackService.removeFeedback(sessionResource, parsed.sourceId);
		}
	}

	private _revealPendingComment(): void {
		const pendingReveal = this._pendingReveal;
		if (!pendingReveal || !this.getComments(pendingReveal.resource).some(comment => comment.id === pendingReveal.id)) {
			return;
		}

		this._pendingReveal = undefined;
		this._onDidRevealComment.fire(pendingReveal);
	}

	private _getSessionResource(resource: URI): URI | undefined {
		return this._agentFeedbackService.getFeedbackSessionResource(resource);
	}
}
