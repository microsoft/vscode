/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { isEqual } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import { IRange } from '../../../../editor/common/core/range.js';
import { IWorkbenchContribution } from '../../../../workbench/common/contributions.js';
import { IAgentEditorComment, IAgentEditorCommentRevealEvent, IAgentEditorCommentsBridge, IAgentEditorCommentsProvider } from '../../../../workbench/services/agentEditorComments/common/agentEditorComments.js';
import { IAgentFeedbackService } from './agentFeedbackService.js';
import { getSessionEditorComments, fromSessionEditorCommentId, SessionEditorCommentSource } from './sessionEditorComments.js';

/**
 * Registers a provider with the workbench {@link IAgentEditorCommentsBridge}
 * that surfaces the active session's comments (the same store the code editor
 * renders from) to the extension host, so custom editors (e.g. the Markdown
 * editor) can render and contribute the same comments. Lives in the sessions
 * layer because the feedback service does.
 */
export class AgentEditorCommentsProviderContribution extends Disposable implements IWorkbenchContribution, IAgentEditorCommentsProvider {

	static readonly ID = 'workbench.contrib.agentEditorCommentsProvider';

	readonly onDidChangeComments: Event<void>;
	readonly onDidRevealComment: Event<IAgentEditorCommentRevealEvent>;

	constructor(
		@IAgentFeedbackService private readonly _agentFeedbackService: IAgentFeedbackService,
		@IAgentEditorCommentsBridge bridge: IAgentEditorCommentsBridge,
	) {
		super();
		this.onDidChangeComments = Event.signal(Event.any(this._agentFeedbackService.onDidChangeFeedback, this._agentFeedbackService.onDidChangeFeedbackScope));
		this.onDidRevealComment = Event.map(this._agentFeedbackService.onDidRevealSessionComment, event => ({ resource: event.resourceUri, id: event.commentId }));
		this._register(bridge.registerProvider(this));
	}

	acceptsComments(resource: URI): boolean {
		return !!this._agentFeedbackService.getFeedbackSessionResource(resource);
	}

	getComments(resource: URI): readonly IAgentEditorComment[] {
		const sessionResource = this._agentFeedbackService.getFeedbackSessionResource(resource);
		if (!sessionResource) {
			return [];
		}
		const comments: IAgentEditorComment[] = [];
		const sessionComments = getSessionEditorComments(sessionResource, this._agentFeedbackService.getFeedback(sessionResource));
		for (const comment of sessionComments) {
			if (isEqual(comment.resourceUri, resource)) {
				comments.push({ id: comment.id, range: comment.range, body: comment.text });
			}
		}
		return comments;
	}

	addComment(resource: URI, range: IRange, body: string): void {
		const sessionResource = this._agentFeedbackService.getFeedbackSessionResource(resource);
		if (!sessionResource) {
			return;
		}
		this._agentFeedbackService.addFeedback(sessionResource, resource, range, body);
	}

	deleteComment(resource: URI, id: string): void {
		const sessionResource = this._agentFeedbackService.getFeedbackSessionResource(resource);
		if (!sessionResource) {
			return;
		}
		// Only agent feedback comments are surfaced to (and thus deletable from)
		// custom editors; see `getComments`.
		const parsed = fromSessionEditorCommentId(id);
		if (parsed?.source !== SessionEditorCommentSource.AgentFeedback) {
			return;
		}
		this._agentFeedbackService.removeFeedback(sessionResource, parsed.sourceId);
	}
}
