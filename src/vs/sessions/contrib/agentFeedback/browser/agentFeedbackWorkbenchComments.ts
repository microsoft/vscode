/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../base/common/cancellation.js';
import { Event } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { isEqual } from '../../../../base/common/resources.js';
import { URI, UriComponents } from '../../../../base/common/uri.js';
import { IRange } from '../../../../editor/common/core/range.js';
import { Comment, CommentReaction, CommentThread, CommentThreadCollapsibleState, CommentThreadState } from '../../../../editor/common/languages.js';
import { localize } from '../../../../nls.js';
import { AgentFeedbackAuthorValue, authorForFeedbackKind } from '../../../../platform/agentHost/common/meta/agentFeedbackAnnotations.js';
import { IWorkbenchContribution } from '../../../../workbench/common/contributions.js';
import { ICommentController, ICommentInfo, ICommentService, INotebookCommentInfo } from '../../../../workbench/contrib/comments/browser/commentService.js';
import { AgentFeedbackState, IAgentFeedback } from './agentFeedbackModel.js';
import { IAgentFeedbackService } from './agentFeedbackService.js';
import { AGENT_FEEDBACK_COMMENT_CONTROLLER_ID, IAgentFeedbackCommentsArbitrationService } from './agentFeedbackCommentsArbitration.js';

class AgentFeedbackCommentThread implements CommentThread<IRange> {

	readonly commentThreadHandle: number;
	readonly controllerHandle = 0;
	readonly resource: string;
	readonly range: IRange;
	readonly comments: readonly Comment[];
	readonly threadId: string;
	readonly label = localize('agentFeedback.commentThreadLabel', "Agent Feedback");
	readonly contextValue = 'agentFeedback';
	readonly canReply = false;
	readonly isDisposed = false;
	readonly isTemplate = false;
	readonly state: CommentThreadState;
	readonly collapsibleState = CommentThreadCollapsibleState.Collapsed;
	readonly onDidChangeComments = Event.None;
	readonly onDidChangeInput = Event.None;
	readonly onDidChangeLabel = Event.None;
	readonly onDidChangeCollapsibleState = Event.None;
	readonly onDidChangeInitialCollapsibleState = Event.None;
	readonly onDidChangeState = Event.None;
	readonly onDidChangeCanReply = Event.None;

	constructor(handle: number, feedback: IAgentFeedback) {
		this.commentThreadHandle = handle;
		this.threadId = feedback.id;
		this.resource = feedback.resourceUri.toString();
		this.range = feedback.range;
		this.state = feedback.state === AgentFeedbackState.Resolved ? CommentThreadState.Resolved : CommentThreadState.Unresolved;
		this.comments = [
			AgentFeedbackCommentThread._toComment(1, feedback.text, authorForFeedbackKind(feedback.kind)),
			...(feedback.replies ?? []).map((reply, index) => AgentFeedbackCommentThread._toComment(index + 2, reply.text, reply.author)),
		];
	}

	isDocumentCommentThread(): this is CommentThread<IRange> {
		return true;
	}

	private static _toComment(uniqueIdInThread: number, body: string, author: AgentFeedbackAuthorValue): Comment {
		return {
			uniqueIdInThread,
			body,
			userName: AgentFeedbackCommentThread._authorLabel(author),
		};
	}

	private static _authorLabel(author: AgentFeedbackAuthorValue): string {
		switch (author) {
			case 'agent':
				return localize('agentFeedback.commentAuthor.agent', "Agent");
			case 'prReviewer':
				return localize('agentFeedback.commentAuthor.prReviewer', "Pull Request Reviewer");
			case 'user':
				return localize('agentFeedback.commentAuthor.user', "You");
			default:
				return localize('agentFeedback.commentAuthor.unknown', "Unknown");
		}
	}
}

export class AgentFeedbackWorkbenchCommentsContribution extends Disposable implements IWorkbenchContribution, ICommentController {

	static readonly ID = 'workbench.contrib.agentFeedbackWorkbenchComments';

	readonly id = AGENT_FEEDBACK_COMMENT_CONTROLLER_ID;
	readonly label = localize('agentFeedback.commentControllerLabel', "Agent Feedback");
	readonly owner = AGENT_FEEDBACK_COMMENT_CONTROLLER_ID;
	readonly features = {};
	readonly activeComment = undefined;

	private readonly _threadHandles = new Map<string, number>();
	private _nextThreadHandle = 1;

	constructor(
		@ICommentService private readonly _commentService: ICommentService,
		@IAgentFeedbackService private readonly _agentFeedbackService: IAgentFeedbackService,
		@IAgentFeedbackCommentsArbitrationService private readonly _arbitrationService: IAgentFeedbackCommentsArbitrationService,
	) {
		super();

		this._commentService.registerCommentController(AGENT_FEEDBACK_COMMENT_CONTROLLER_ID, this);
		this._register({
			dispose: () => this._commentService.unregisterCommentController(AGENT_FEEDBACK_COMMENT_CONTROLLER_ID)
		});
		this._register(Event.any(
			this._agentFeedbackService.onDidChangeFeedback,
			this._agentFeedbackService.onDidChangeFeedbackVisibility,
			this._agentFeedbackService.onDidChangeFeedbackScope,
		)(() => this._commentService.updateCommentingRanges(AGENT_FEEDBACK_COMMENT_CONTROLLER_ID)));
	}

	getDocumentComments(resource: URI): Promise<ICommentInfo> {
		const usesWorkbenchComments = this._arbitrationService.usesWorkbenchComments(resource);
		const sessionResource = this._agentFeedbackService.getFeedbackSessionResource(resource);
		const visibleResolvedFeedbackIds = sessionResource ? this._agentFeedbackService.getVisibleResolvedFeedbackIds(sessionResource) : undefined;
		const threads = usesWorkbenchComments && sessionResource
			? this._agentFeedbackService.getFeedback(sessionResource)
				.filter(feedback => (feedback.state !== AgentFeedbackState.Resolved || visibleResolvedFeedbackIds?.has(feedback.id)) && isEqual(feedback.resourceUri, resource))
				.map(feedback => new AgentFeedbackCommentThread(this._getThreadHandle(feedback.id), feedback))
			: [];

		return Promise.resolve({
			uniqueOwner: AGENT_FEEDBACK_COMMENT_CONTROLLER_ID,
			label: this.label,
			threads,
			commentingRanges: {
				resource,
				ranges: [],
				fileComments: false,
			},
		});
	}

	async getNotebookComments(): Promise<INotebookCommentInfo> {
		return {
			uniqueOwner: AGENT_FEEDBACK_COMMENT_CONTROLLER_ID,
			label: this.label,
			threads: [],
		};
	}

	createCommentThreadTemplate(_resource: UriComponents, _range: IRange | undefined): Promise<void> {
		return Promise.resolve();
	}

	updateCommentThreadTemplate(_threadHandle: number, _range: IRange): Promise<void> {
		return Promise.resolve();
	}

	deleteCommentThreadMain(_commentThreadId: string): void { }

	toggleReaction(_uri: URI, _thread: CommentThread, _comment: Comment, _reaction: CommentReaction, _token: CancellationToken): Promise<void> {
		return Promise.resolve();
	}

	setActiveCommentAndThread(_commentInfo: { thread: CommentThread; comment?: Comment } | undefined): Promise<void> {
		return Promise.resolve();
	}

	private _getThreadHandle(feedbackId: string): number {
		let handle = this._threadHandles.get(feedbackId);
		if (handle === undefined) {
			handle = this._nextThreadHandle++;
			this._threadHandles.set(feedbackId, handle);
		}
		return handle;
	}
}
