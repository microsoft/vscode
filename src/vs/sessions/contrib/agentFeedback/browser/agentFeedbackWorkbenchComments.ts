/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../base/common/cancellation.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { MarkdownString } from '../../../../base/common/htmlContent.js';
import { Disposable, DisposableMap, MutableDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { autorun, runOnChange } from '../../../../base/common/observable.js';
import { isEqual } from '../../../../base/common/resources.js';
import { URI, UriComponents } from '../../../../base/common/uri.js';
import { IRange, Range } from '../../../../editor/common/core/range.js';
import { Comment, CommentReaction, CommentThread, CommentThreadCollapsibleState, CommentThreadState } from '../../../../editor/common/languages.js';
import { IModelService } from '../../../../editor/common/services/model.js';
import { localize } from '../../../../nls.js';
import { AgentFeedbackAuthorValue, authorForFeedbackKind } from '../../../../platform/agentHost/common/meta/agentFeedbackAnnotations.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { observableConfigValue } from '../../../../platform/observable/common/platformObservableUtils.js';
import { IWorkbenchContribution } from '../../../../workbench/common/contributions.js';
import { ICommentController, ICommentInfo, ICommentService, INotebookCommentInfo } from '../../../../workbench/contrib/comments/browser/commentService.js';
import { AGENTS_WINDOW_EDITOR_COMMENTS_SETTING } from '../../../../workbench/contrib/comments/common/commentsConfiguration.js';
import { IAgentFeedbackService } from '../../../../workbench/contrib/sessions/browser/agentFeedback.js';
import { AgentFeedbackState } from '../../../../workbench/contrib/sessions/browser/agentFeedbackModel.js';
import { ICodeReviewService } from '../../../../workbench/contrib/sessions/browser/codeReviewService.js';
import { shouldIncludeRawPRReviewComments } from './agentFeedbackService.js';
import { getSessionEditorComments, ISessionEditorComment, SessionEditorCommentSource } from './sessionEditorComments.js';

const AGENT_FEEDBACK_COMMENT_CONTROLLER_ID = 'vscode.agentFeedback';

function getThreadKey(sessionResource: URI, commentId: string): string {
	return `${sessionResource.toString()}\n${commentId}`;
}

class AgentFeedbackCommentThread extends Disposable implements CommentThread<IRange> {

	readonly controllerHandle = 0;
	readonly resource: string;
	readonly canReply: boolean;
	readonly onDidChangeComments = Event.None;
	readonly onDidChangeInput = Event.None;
	readonly onDidChangeLabel = Event.None;
	readonly onDidChangeInitialCollapsibleState = Event.None;
	readonly onDidChangeState = Event.None;
	readonly onDidChangeCanReply = Event.None;

	private readonly _onDidChangeCollapsibleState = this._register(new Emitter<CommentThreadCollapsibleState | undefined>());
	readonly onDidChangeCollapsibleState = this._onDidChangeCollapsibleState.event;

	range: IRange;
	comments: readonly Comment[] = [];
	state = CommentThreadState.Unresolved;
	initialCollapsibleState: CommentThreadCollapsibleState | undefined;
	isDisposed = false;
	private _collapsibleState: CommentThreadCollapsibleState;

	private constructor(
		readonly commentThreadHandle: number,
		readonly threadId: string,
		readonly sessionResource: URI | undefined,
		readonly resourceUri: URI,
		range: IRange,
		readonly label: string,
		readonly contextValue: string,
		readonly isTemplate: boolean,
		collapsibleState: CommentThreadCollapsibleState,
	) {
		super();
		this.resource = resourceUri.toString();
		this.range = range;
		this.canReply = isTemplate;
		this.initialCollapsibleState = collapsibleState;
		this._collapsibleState = collapsibleState;
	}

	static forComment(handle: number, comment: ISessionEditorComment, collapsibleState: CommentThreadCollapsibleState): AgentFeedbackCommentThread {
		const thread = comment.source === SessionEditorCommentSource.PRReview
			? new AgentFeedbackCommentThread(handle, comment.id, comment.sessionResource, comment.resourceUri, comment.range, localize('agentFeedback.prReviewThreadLabel', "Pull Request Review"), 'prReviewComment', false, collapsibleState)
			: new AgentFeedbackCommentThread(handle, comment.id, comment.sessionResource, comment.resourceUri, comment.range, localize('agentFeedback.commentThreadLabel', "Agent Feedback"), 'agentFeedback', false, collapsibleState);
		thread.update(comment);
		return thread;
	}

	static forTemplate(handle: number, threadId: string, resource: URI, range: IRange): AgentFeedbackCommentThread {
		return new AgentFeedbackCommentThread(handle, threadId, undefined, resource, range, localize('agentFeedback.commentThreadLabel', "Agent Feedback"), 'agentFeedback', true, CommentThreadCollapsibleState.Expanded);
	}

	get collapsibleState(): CommentThreadCollapsibleState {
		return this._collapsibleState;
	}

	set collapsibleState(collapsibleState: CommentThreadCollapsibleState | undefined) {
		if (collapsibleState !== undefined && collapsibleState !== this._collapsibleState) {
			this._collapsibleState = collapsibleState;
			this._onDidChangeCollapsibleState.fire(collapsibleState);
		}
	}

	update(comment: ISessionEditorComment): void {
		this.range = comment.range;
		this.state = comment.state === AgentFeedbackState.Resolved ? CommentThreadState.Resolved : CommentThreadState.Unresolved;
		this.comments = [
			AgentFeedbackCommentThread._toComment(1, comment.text, comment.author ?? AgentFeedbackCommentThread._authorLabel(authorForFeedbackKind(comment.kind))),
			...(comment.replies ?? []).map((reply, index) => AgentFeedbackCommentThread._toComment(index + 2, reply.text, AgentFeedbackCommentThread._authorLabel(reply.author))),
		];
	}

	isDocumentCommentThread(): this is CommentThread<IRange> {
		return true;
	}

	override dispose(): void {
		this.isDisposed = true;
		super.dispose();
	}

	private static _toComment(uniqueIdInThread: number, body: string, userName: string): Comment {
		return {
			uniqueIdInThread,
			// Comments can be written by agents and pull request reviewers, so their Markdown is not trusted.
			body: new MarkdownString(body),
			userName,
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

	private readonly _commentThreads = this._register(new DisposableMap<string, AgentFeedbackCommentThread>());
	private readonly _templates = this._register(new DisposableMap<string, AgentFeedbackCommentThread>());
	private readonly _prReviewStateListeners = this._register(new DisposableMap<string>());
	private readonly _controllerRegistration = this._register(new MutableDisposable());
	private _nextThreadHandle = 1;
	private _nextTemplateId = 1;
	/** A revealed comment whose thread has not been created yet. */
	private _pendingRevealThreadKey: string | undefined;

	constructor(
		@ICommentService private readonly _commentService: ICommentService,
		@IAgentFeedbackService private readonly _agentFeedbackService: IAgentFeedbackService,
		@ICodeReviewService private readonly _codeReviewService: ICodeReviewService,
		@IModelService private readonly _modelService: IModelService,
		@IConfigurationService configurationService: IConfigurationService,
	) {
		super();

		const enabled = observableConfigValue(AGENTS_WINDOW_EDITOR_COMMENTS_SETTING, false, configurationService);
		this._register(autorun(reader => {
			if (enabled.read(reader)) {
				this._registerController();
			} else {
				this._controllerRegistration.clear();
			}
		}));
		this._register(this._commentService.onDidDeleteDataProvider(owner => {
			if (owner === undefined && this._controllerRegistration.value) {
				this._registerController();
			}
		}));
		this._register(this._agentFeedbackService.onDidChangeFeedback(({ sessionResource }) => {
			if (this._prReviewStateListeners.has(sessionResource.toString())) {
				this._pruneCommentThreads(sessionResource, this._getSessionComments(sessionResource));
			}
		}));
		this._register(this._agentFeedbackService.onDidRevealSessionComment(({ sessionResource, commentId }) => {
			if (this._controllerRegistration.value && commentId) {
				this._revealCommentThread(getThreadKey(sessionResource, commentId));
			}
		}));
		this._register(Event.any(
			this._agentFeedbackService.onDidChangeFeedback,
			this._agentFeedbackService.onDidChangeFeedbackVisibility,
			this._agentFeedbackService.onDidChangeFeedbackScope,
		)(() => {
			if (this._controllerRegistration.value) {
				this._commentService.updateCommentingRanges(AGENT_FEEDBACK_COMMENT_CONTROLLER_ID);
			}
		}));
	}

	getDocumentComments(resource: URI): Promise<ICommentInfo> {
		const sessionResource = this._agentFeedbackService.getFeedbackSessionResource(resource);
		const commentThreads = sessionResource ? this._getCommentThreads(sessionResource, resource) : [];
		const templateThreads = [...this._templates.values()].filter(thread => isEqual(thread.resourceUri, resource));
		const model = this._modelService.getModel(resource);

		return Promise.resolve({
			uniqueOwner: AGENT_FEEDBACK_COMMENT_CONTROLLER_ID,
			label: this.label,
			threads: [...commentThreads, ...templateThreads],
			commentingRanges: {
				resource,
				ranges: sessionResource && model ? [model.getFullModelRange()] : [],
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
		const thread = AgentFeedbackCommentThread.forTemplate(this._nextThreadHandle++, threadId, revivedResource, range);
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
		const thread = this._templates.deleteAndLeak(commentThreadId);
		if (!thread) {
			return;
		}
		this._commentService.updateComments(AGENT_FEEDBACK_COMMENT_CONTROLLER_ID, {
			added: [],
			removed: [thread],
			changed: [],
			pending: [],
		});
		thread.dispose();
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
		if (!this._controllerRegistration.value) {
			this._controllerRegistration.value = toDisposable(() => {
				if (this._commentService.getCommentController(AGENT_FEEDBACK_COMMENT_CONTROLLER_ID) === this) {
					this._commentService.unregisterCommentController(AGENT_FEEDBACK_COMMENT_CONTROLLER_ID);
				}
				this._prReviewStateListeners.clearAndDisposeAll();
				this._commentThreads.clearAndDisposeAll();
				this._templates.clearAndDisposeAll();
				this._pendingRevealThreadKey = undefined;
			});
		}
	}

	/** The comments the agent feedback widgets would show for a session, including pull request review comments. */
	private _getSessionComments(sessionResource: URI): readonly ISessionEditorComment[] {
		return getSessionEditorComments(
			sessionResource,
			this._agentFeedbackService.getFeedback(sessionResource),
			this._codeReviewService.getPRReviewState(sessionResource).get(),
			this._agentFeedbackService.getVisibleResolvedFeedbackIds(sessionResource),
			shouldIncludeRawPRReviewComments(this._agentFeedbackService, sessionResource),
		);
	}

	private _getCommentThreads(sessionResource: URI, resource: URI): AgentFeedbackCommentThread[] {
		const sessionKey = sessionResource.toString();
		if (!this._prReviewStateListeners.has(sessionKey)) {
			this._prReviewStateListeners.set(sessionKey, runOnChange(this._codeReviewService.getPRReviewState(sessionResource), () => {
				this._commentService.updateCommentingRanges(AGENT_FEEDBACK_COMMENT_CONTROLLER_ID);
			}));
		}

		const comments = this._getSessionComments(sessionResource);
		this._pruneCommentThreads(sessionResource, comments);
		return comments
			.filter(comment => isEqual(comment.resourceUri, resource))
			.map(comment => this._getCommentThread(getThreadKey(sessionResource, comment.id), comment));
	}

	private _getCommentThread(key: string, comment: ISessionEditorComment): AgentFeedbackCommentThread {
		let thread = this._commentThreads.get(key);
		if (thread) {
			thread.update(comment);
			return thread;
		}

		// Open comments are shown right away, like unresolved review comments in the editor.
		const isRevealed = key === this._pendingRevealThreadKey;
		if (isRevealed) {
			this._pendingRevealThreadKey = undefined;
		}
		const collapsibleState = isRevealed || comment.state !== AgentFeedbackState.Resolved ? CommentThreadCollapsibleState.Expanded : CommentThreadCollapsibleState.Collapsed;
		thread = AgentFeedbackCommentThread.forComment(this._nextThreadHandle++, comment, collapsibleState);
		this._commentThreads.set(key, thread);
		return thread;
	}

	/** Disposes the threads of a session whose comments are gone. */
	private _pruneCommentThreads(sessionResource: URI, comments: readonly ISessionEditorComment[]): void {
		const liveKeys = new Set(comments.map(comment => getThreadKey(sessionResource, comment.id)));
		for (const [key, thread] of [...this._commentThreads]) {
			if (isEqual(thread.sessionResource, sessionResource) && !liveKeys.has(key)) {
				this._commentThreads.deleteAndDispose(key);
			}
		}
	}

	private _revealCommentThread(key: string): void {
		const thread = this._commentThreads.get(key);
		if (thread) {
			this._pendingRevealThreadKey = undefined;
			thread.collapsibleState = CommentThreadCollapsibleState.Expanded;
		} else {
			// The editor is still opening; expand the thread when the comments of its file are requested.
			this._pendingRevealThreadKey = key;
		}
	}
}
