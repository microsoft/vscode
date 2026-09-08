/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../base/common/cancellation.js';
import { Event } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { isEqual } from '../../../../base/common/resources.js';
import { URI, UriComponents } from '../../../../base/common/uri.js';
import { IRange, Range } from '../../../../editor/common/core/range.js';
import { Comment, CommentReaction, CommentThread, CommentThreadCollapsibleState, CommentThreadState } from '../../../../editor/common/languages.js';
import { IModelService } from '../../../../editor/common/services/model.js';
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
	range: IRange;
	readonly comments: readonly Comment[];
	readonly threadId: string;
	readonly label = localize('agentFeedback.commentThreadLabel', "Agent Feedback");
	readonly contextValue = 'agentFeedback';
	readonly canReply: boolean;
	readonly isDisposed = false;
	readonly isTemplate: boolean;
	readonly state: CommentThreadState;
	readonly collapsibleState: CommentThreadCollapsibleState;
	readonly onDidChangeComments = Event.None;
	readonly onDidChangeInput = Event.None;
	readonly onDidChangeLabel = Event.None;
	readonly onDidChangeCollapsibleState = Event.None;
	readonly onDidChangeInitialCollapsibleState = Event.None;
	readonly onDidChangeState = Event.None;
	readonly onDidChangeCanReply = Event.None;

	constructor(handle: number, feedback: IAgentFeedback);
	constructor(handle: number, threadId: string, resource: URI, range: IRange);
	constructor(handle: number, feedbackOrThreadId: IAgentFeedback | string, resource?: URI, range?: IRange) {
		this.commentThreadHandle = handle;
		if (typeof feedbackOrThreadId === 'string') {
			if (!resource || !range) {
				throw new Error('Agent feedback comment templates require a resource and range');
			}
			this.threadId = feedbackOrThreadId;
			this.resource = resource.toString();
			this.range = range;
			this.state = CommentThreadState.Unresolved;
			this.comments = [];
			this.canReply = true;
			this.isTemplate = true;
			this.collapsibleState = CommentThreadCollapsibleState.Expanded;
		} else {
			this.threadId = feedbackOrThreadId.id;
			this.resource = feedbackOrThreadId.resourceUri.toString();
			this.range = feedbackOrThreadId.range;
			this.state = feedbackOrThreadId.state === AgentFeedbackState.Resolved ? CommentThreadState.Resolved : CommentThreadState.Unresolved;
			this.comments = [
				AgentFeedbackCommentThread._toComment(1, feedbackOrThreadId.text, authorForFeedbackKind(feedbackOrThreadId.kind)),
				...(feedbackOrThreadId.replies ?? []).map((reply, index) => AgentFeedbackCommentThread._toComment(index + 2, reply.text, reply.author)),
			];
			this.canReply = false;
			this.isTemplate = false;
			this.collapsibleState = CommentThreadCollapsibleState.Collapsed;
		}
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
	readonly contextValue = AGENT_FEEDBACK_COMMENT_CONTROLLER_ID;
	readonly submitCommentThreadLabel = localize('agentFeedback.commentThread.submit', "Add Feedback");

	private readonly _threadHandles = new Map<string, number>();
	private readonly _templates = new Map<string, AgentFeedbackCommentThread>();
	private _nextThreadHandle = 1;
	private _nextTemplateId = 1;

	constructor(
		@ICommentService private readonly _commentService: ICommentService,
		@IAgentFeedbackService private readonly _agentFeedbackService: IAgentFeedbackService,
		@IAgentFeedbackCommentsArbitrationService private readonly _arbitrationService: IAgentFeedbackCommentsArbitrationService,
		@IModelService private readonly _modelService: IModelService,
	) {
		super();

		this._registerController();
		this._register({
			dispose: () => this._commentService.unregisterCommentController(AGENT_FEEDBACK_COMMENT_CONTROLLER_ID)
		});
		this._register(this._commentService.onDidDeleteDataProvider(owner => {
			if (owner === undefined) {
				this._registerController();
			}
		}));
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
		const feedbackThreads = usesWorkbenchComments && sessionResource
			? this._agentFeedbackService.getFeedback(sessionResource)
				.filter(feedback => (feedback.state !== AgentFeedbackState.Resolved || visibleResolvedFeedbackIds?.has(feedback.id)) && isEqual(feedback.resourceUri, resource))
				.map(feedback => new AgentFeedbackCommentThread(this._getThreadHandle(feedback.id), feedback))
			: [];
		const templateThreads = usesWorkbenchComments
			? [...this._templates.values()].filter(thread => isEqual(URI.parse(thread.resource), resource))
			: [];
		const model = this._modelService.getModel(resource);

		return Promise.resolve({
			uniqueOwner: AGENT_FEEDBACK_COMMENT_CONTROLLER_ID,
			label: this.label,
			threads: [...feedbackThreads, ...templateThreads],
			commentingRanges: {
				resource,
				ranges: usesWorkbenchComments && sessionResource && model ? [model.getFullModelRange()] : [],
				fileComments: false,
				showRangeBar: false,
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

	createCommentThreadTemplate(resource: UriComponents, range: IRange | undefined): Promise<void> {
		if (!range) {
			return Promise.resolve();
		}
		const revivedResource = URI.revive(resource);
		const threadId = `agentFeedback-template-${this._nextTemplateId++}`;
		const thread = new AgentFeedbackCommentThread(this._getThreadHandle(threadId), threadId, revivedResource, range);
		this._templates.set(threadId, thread);
		this._commentService.updateComments(AGENT_FEEDBACK_COMMENT_CONTROLLER_ID, {
			added: [thread],
			removed: [],
			changed: [],
			pending: [],
		});
		return Promise.resolve();
	}

	updateCommentThreadTemplate(threadHandle: number, range: IRange): Promise<void> {
		const thread = [...this._templates.values()].find(thread => thread.commentThreadHandle === threadHandle);
		if (thread) {
			thread.range = range;
			this._commentService.updateComments(AGENT_FEEDBACK_COMMENT_CONTROLLER_ID, {
				added: [],
				removed: [],
				changed: [thread],
				pending: [],
			});
		}
		return Promise.resolve();
	}

	deleteCommentThreadMain(commentThreadId: string): void {
		const thread = this._templates.get(commentThreadId);
		if (!thread) {
			return;
		}
		this._templates.delete(commentThreadId);
		this._commentService.updateComments(AGENT_FEEDBACK_COMMENT_CONTROLLER_ID, {
			added: [],
			removed: [thread],
			changed: [],
			pending: [],
		});
	}

	toggleReaction(_uri: URI, _thread: CommentThread, _comment: Comment, _reaction: CommentReaction, _token: CancellationToken): Promise<void> {
		return Promise.resolve();
	}

	setActiveCommentAndThread(_commentInfo: { thread: CommentThread; comment?: Comment } | undefined): Promise<void> {
		return Promise.resolve();
	}

	submitCommentThread(thread: CommentThread, body: string): Promise<void> {
		const template = this._templates.get(thread.threadId);
		const text = body.trim();
		if (!template || !text || !template.resource || !Range.isIRange(template.range)) {
			return Promise.resolve();
		}

		const resource = URI.parse(template.resource);
		const sessionResource = this._agentFeedbackService.getFeedbackSessionResource(resource);
		if (!sessionResource) {
			return Promise.resolve();
		}

		this._agentFeedbackService.addFeedback(sessionResource, resource, template.range, text);
		this.deleteCommentThreadMain(template.threadId);
		return Promise.resolve();
	}

	private _registerController(): void {
		if (this._commentService.getCommentController(AGENT_FEEDBACK_COMMENT_CONTROLLER_ID) !== this) {
			this._commentService.registerCommentController(AGENT_FEEDBACK_COMMENT_CONTROLLER_ID, this);
		}
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
