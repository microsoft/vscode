/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../base/common/cancellation.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { MarkdownString } from '../../../../base/common/htmlContent.js';
import { Disposable, DisposableMap, DisposableStore, IDisposable, MutableDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { autorun, runOnChange } from '../../../../base/common/observable.js';
import { isEqual } from '../../../../base/common/resources.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { URI, UriComponents } from '../../../../base/common/uri.js';
import { ICodeEditor } from '../../../../editor/browser/editorBrowser.js';
import { ICodeEditorService } from '../../../../editor/browser/services/codeEditorService.js';
import { IRange, Range } from '../../../../editor/common/core/range.js';
import { Comment, CommentMode, CommentReaction, CommentThread, CommentThreadCollapsibleState, CommentThreadState } from '../../../../editor/common/languages.js';
import { IModelService } from '../../../../editor/common/services/model.js';
import { localize, localize2 } from '../../../../nls.js';
import { ILocalizedString } from '../../../../platform/action/common/action.js';
import { Action2, MenuId, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { AgentFeedbackAuthorValue, authorForFeedbackKind } from '../../../../platform/agentHost/common/meta/agentFeedbackAnnotations.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { ContextKeyExpr, ContextKeyExpression } from '../../../../platform/contextkey/common/contextkey.js';
import { ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { observableConfigValue } from '../../../../platform/observable/common/platformObservableUtils.js';
import { IWorkbenchContribution } from '../../../../workbench/common/contributions.js';
import { ChatContextKeys } from '../../../../workbench/contrib/chat/common/actions/chatContextKeys.js';
import { ICommentController, ICommentInfo, ICommentService, INotebookCommentInfo } from '../../../../workbench/contrib/comments/browser/commentService.js';
import { CommentContextKeys } from '../../../../workbench/contrib/comments/common/commentContextKeys.js';
import { AGENTS_WINDOW_EDITOR_COMMENTS_SETTING } from '../../../../workbench/contrib/comments/common/commentsConfiguration.js';
import { ICellRange } from '../../../../workbench/contrib/notebook/common/notebookRange.js';
import { IAgentFeedbackService } from '../../../../workbench/contrib/sessions/browser/agentFeedback.js';
import { AgentFeedbackKind, AgentFeedbackState, IAgentFeedback } from '../../../../workbench/contrib/sessions/browser/agentFeedbackModel.js';
import { ICodeReviewService } from '../../../../workbench/contrib/sessions/browser/codeReviewService.js';
import { createAgentFeedbackContext } from './agentFeedbackEditorUtils.js';
import { acceptIcon, deleteIcon, editIcon, hideIcon } from './agentFeedbackEditorWidget.js';
import { shouldIncludeRawPRReviewComments } from './agentFeedbackService.js';
import { getSessionEditorComments, ISessionEditorComment, SessionEditorCommentSource, toSessionEditorCommentId } from './sessionEditorComments.js';

const AGENT_FEEDBACK_COMMENT_CONTROLLER_ID = 'vscode.agentFeedback';

function getThreadKey(sessionResource: URI, commentId: string): string {
	return `${sessionResource.toString()}\n${commentId}`;
}

/**
 * What can be done with an agent feedback comment, as listed in its context value for the `when` clauses of its actions.
 */
const enum CommentCapability {
	Share = 'share',
	Edit = 'edit',
	/** Edit is offered next to the comment, besides in its More Actions menu. */
	EditInline = 'editInline',
	/** Text can be added to the comment with the reply box of its thread. */
	Reply = 'reply',
	Delete = 'delete',
	ResolvePullRequestComment = 'resolvePR',
	Hide = 'hide',
}

/** The same actions as the agent feedback widget offers for the comment. */
function getCommentCapabilities(comment: ISessionEditorComment): readonly CommentCapability[] {
	if (comment.state === AgentFeedbackState.Submitted) {
		return [];
	}
	if (comment.state === AgentFeedbackState.Resolved) {
		return [CommentCapability.Hide];
	}
	const needsSharing = comment.canConvertToAgentFeedback || comment.state === AgentFeedbackState.Created;
	return [
		...(needsSharing ? [CommentCapability.Share] : comment.kind === AgentFeedbackKind.UserReview ? [CommentCapability.EditInline] : []),
		CommentCapability.Edit,
		CommentCapability.Reply,
		comment.source === SessionEditorCommentSource.PRReview ? CommentCapability.ResolvePullRequestComment : CommentCapability.Delete,
	];
}

class AgentFeedbackCommentThread extends Disposable implements CommentThread<IRange> {

	readonly controllerHandle = 0;
	readonly resource: string;
	readonly onDidChangeInput = Event.None;
	readonly onDidChangeLabel = Event.None;
	readonly onDidChangeInitialCollapsibleState = Event.None;
	readonly onDidChangeState = Event.None;

	private readonly _onDidChangeCollapsibleState = this._register(new Emitter<CommentThreadCollapsibleState | undefined>());
	readonly onDidChangeCollapsibleState = this._onDidChangeCollapsibleState.event;
	private readonly _onDidChangeComments = this._register(new Emitter<readonly Comment[] | undefined>());
	readonly onDidChangeComments = this._onDidChangeComments.event;
	private readonly _onDidChangeCanReply = this._register(new Emitter<boolean>());
	readonly onDidChangeCanReply = this._onDidChangeCanReply.event;

	range: IRange;
	comments: readonly Comment[] = [];
	state = CommentThreadState.Unresolved;
	canReply: boolean;
	initialCollapsibleState: CommentThreadCollapsibleState | undefined;
	isDisposed = false;
	/** The comment that the thread shows, or `undefined` for a new comment that is being written. */
	comment: ISessionEditorComment | undefined;
	/** The editor that a new comment is being written in, which reveals and focuses its widget. */
	editorId: string | undefined;
	capabilities: readonly CommentCapability[] = [];
	private _collapsibleState: CommentThreadCollapsibleState;
	private _isEditing = false;

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

	static forTemplate(handle: number, threadId: string, resource: URI, range: IRange, editorId: string | undefined): AgentFeedbackCommentThread {
		const thread = new AgentFeedbackCommentThread(handle, threadId, undefined, resource, range, localize('agentFeedback.commentThreadLabel', "Agent Feedback"), 'agentFeedback', true, CommentThreadCollapsibleState.Expanded);
		thread.editorId = editorId;
		return thread;
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
		this.comment = comment;
		this.capabilities = getCommentCapabilities(comment);
		this.range = comment.range;
		this.state = comment.state === AgentFeedbackState.Resolved ? CommentThreadState.Resolved : CommentThreadState.Unresolved;
		if (!this.capabilities.includes(CommentCapability.Edit)) {
			this._isEditing = false;
		}
		this._updateComments();
		const canReply = this.capabilities.includes(CommentCapability.Reply);
		if (canReply !== this.canReply) {
			this.canReply = canReply;
			this._onDidChangeCanReply.fire(canReply);
		}
	}

	/**
	 * Shows the comment in the comment widget's editor, or back as text. The widget closes the editor itself when one
	 * of its actions runs, and only opens or closes it when the mode of the comment changes.
	 */
	setEditing(isEditing: boolean): void {
		if (!this.comment || isEditing === this._isEditing || (isEditing && !this.capabilities.includes(CommentCapability.Edit))) {
			return;
		}
		this._isEditing = isEditing;
		this._updateComments();
		this._onDidChangeComments.fire(this.comments);
	}

	isDocumentCommentThread(): this is CommentThread<IRange> {
		return true;
	}

	override dispose(): void {
		this.isDisposed = true;
		super.dispose();
	}

	private _updateComments(): void {
		const comment = this.comment;
		if (!comment) {
			return;
		}
		this.comments = [
			{
				...AgentFeedbackCommentThread._toComment(1, comment.text, comment.author ?? AgentFeedbackCommentThread._authorLabel(authorForFeedbackKind(comment.kind))),
				contextValue: ['agentFeedbackComment', ...this.capabilities].join(' '),
				mode: this._isEditing ? CommentMode.Editing : CommentMode.Preview,
			},
			...(comment.replies ?? []).map((reply, index) => AgentFeedbackCommentThread._toComment(index + 2, reply.text, AgentFeedbackCommentThread._authorLabel(reply.author))),
		];
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
		@ICodeEditorService private readonly _codeEditorService: ICodeEditorService,
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

	createCommentThreadTemplate(resource: UriComponents, range: IRange | undefined, editorId?: string): Promise<void> {
		if (!range) {
			return Promise.resolve();
		}
		const revivedResource = URI.revive(resource);
		const threadId = `agentFeedback-template-${this._nextTemplateId++}`;
		const thread = AgentFeedbackCommentThread.forTemplate(this._nextThreadHandle++, threadId, revivedResource, range, editorId);
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

	getSubmitCommentThreadLabel(thread: CommentThread<IRange | ICellRange>): string {
		return thread.isTemplate
			? localize('agentFeedback.commentThread.submit', "Add Feedback")
			: localize('agentFeedback.commentThread.addToComment', "Add to Comment");
	}

	submitCommentThread(thread: CommentThread, body: string): Promise<void> {
		const text = body.trim();
		if (!text) {
			return Promise.resolve();
		}
		if (thread instanceof AgentFeedbackCommentThread && !thread.isTemplate && !thread.isDisposed && thread.comment && thread.canReply) {
			this._addReply(thread.comment, text);
			return Promise.resolve();
		}

		const template = this._templates.get(thread.threadId);
		if (!template || !template.resource || !Range.isIRange(template.range)) {
			return Promise.resolve();
		}

		const resource = URI.parse(template.resource);
		const sessionResource = this._agentFeedbackService.getFeedbackSessionResource(resource);
		if (!sessionResource) {
			return Promise.resolve();
		}

		// A comment added without a selection is about its whole line, like one added with the agent feedback input.
		const model = this._modelService.getModel(resource);
		const range = Range.isEmpty(template.range) && model
			? new Range(template.range.startLineNumber, 1, template.range.startLineNumber, model.getLineMaxColumn(template.range.startLineNumber))
			: template.range;
		const editor = this._getEditor(resource, template.editorId);
		this._agentFeedbackService.addFeedback(sessionResource, resource, range, text, undefined, editor ? createAgentFeedbackContext(editor, this._codeEditorService, resource, range) : undefined);
		this.deleteCommentThreadMain(template.threadId);
		return Promise.resolve();
	}

	/**
	 * Runs an action of the comment that a thread shows, from the toolbar of the comment in the comment widget.
	 */
	runCommentAction(thread: CommentThread, action: AgentFeedbackCommentAction): void | Promise<void> {
		if (!(thread instanceof AgentFeedbackCommentThread) || thread.isDisposed || !thread.comment) {
			return;
		}
		const comment = thread.comment;
		switch (action) {
			case AgentFeedbackCommentAction.Share:
				if (comment.canConvertToAgentFeedback) {
					this._convertToAgentFeedback(comment, comment.text);
				} else if (comment.source === SessionEditorCommentSource.AgentFeedback) {
					this._agentFeedbackService.acceptFeedback(comment.sessionResource, comment.sourceId);
					this._agentFeedbackService.setNavigationAnchor(comment.sessionResource, comment.id);
				}
				return;
			case AgentFeedbackCommentAction.Edit:
				thread.setEditing(true);
				return;
			case AgentFeedbackCommentAction.Remove:
				if (comment.source === SessionEditorCommentSource.PRReview) {
					return this._codeReviewService.resolvePRReviewThread(comment.sessionResource, comment.sourceId, comment.sourcePullRequest);
				}
				if (comment.kind === AgentFeedbackKind.PRReview && comment.sourcePRReviewCommentId) {
					this._codeReviewService.dismissPRReviewComment(comment.sessionResource, comment.sourcePRReviewCommentId);
				}
				this._agentFeedbackService.removeFeedback(comment.sessionResource, comment.sourceId);
				return;
			case AgentFeedbackCommentAction.Hide:
				this._agentFeedbackService.hideFeedbackInEditor(comment.sessionResource, comment.sourceId);
				return;
		}
	}

	/**
	 * Saves the text of a comment that is being edited in the comment widget, or discards it when `text` is `undefined`.
	 */
	finishEditing(thread: CommentThread, text: string | undefined): void {
		if (!(thread instanceof AgentFeedbackCommentThread) || !thread.comment) {
			return;
		}
		const comment = thread.comment;
		const canEdit = thread.capabilities.includes(CommentCapability.Edit);
		thread.setEditing(false);
		const newText = text?.trim();
		if (!newText || !canEdit || thread.isDisposed) {
			return;
		}
		if (comment.source === SessionEditorCommentSource.AgentFeedback) {
			this._agentFeedbackService.updateFeedback(comment.sessionResource, comment.sourceId, newText);
		} else {
			this._convertToAgentFeedback(comment, newText);
		}
	}

	/** Pull request review comments are converted to agent feedback first, so the reply is part of the same feedback. */
	private _addReply(comment: ISessionEditorComment, text: string): void {
		if (comment.source === SessionEditorCommentSource.AgentFeedback) {
			this._agentFeedbackService.addReply(comment.sessionResource, comment.sourceId, text);
			return;
		}
		const feedback = this._convertToAgentFeedback(comment, comment.text);
		if (feedback) {
			this._agentFeedbackService.addReply(comment.sessionResource, feedback.id, text);
		}
	}

	private _convertToAgentFeedback(comment: ISessionEditorComment, text: string): IAgentFeedback | undefined {
		if (!comment.canConvertToAgentFeedback) {
			return undefined;
		}
		const editor = this._getEditor(comment.resourceUri);
		const feedback = this._agentFeedbackService.addFeedback(
			comment.sessionResource,
			comment.resourceUri,
			comment.range,
			text,
			comment.suggestion,
			editor ? createAgentFeedbackContext(editor, this._codeEditorService, comment.resourceUri, comment.range) : undefined,
			comment.sourceId,
			AgentFeedbackKind.PRReview,
			undefined,
			comment.sourcePullRequest,
			comment.author,
		);
		this._agentFeedbackService.setNavigationAnchor(comment.sessionResource, toSessionEditorCommentId(SessionEditorCommentSource.AgentFeedback, feedback.id));
		this._codeReviewService.markPRReviewCommentConverted(comment.sessionResource, comment.sourceId);
		return feedback;
	}

	/**
	 * An editor that shows the file: the one with the given ID, which a new comment was written in, or else the focused
	 * one, which shows the comment widget that ran an action.
	 */
	private _getEditor(resource: URI, editorId?: string): ICodeEditor | undefined {
		const editors = this._codeEditorService.listCodeEditors().filter(editor => isEqual(editor.getModel()?.uri, resource));
		const focusedEditor = this._codeEditorService.getFocusedCodeEditor();
		return editors.find(editor => editor.getId() === editorId)
			?? editors.find(editor => editor === focusedEditor)
			?? editors[0];
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

const enum AgentFeedbackCommentAction {
	Share,
	Edit,
	Remove,
	Hide,
}

interface ICommentActionContext {
	readonly thread: CommentThread;
	readonly text?: string;
}

function isCommentActionContext(context: unknown): context is ICommentActionContext {
	return typeof context === 'object' && context !== null && 'thread' in context;
}

function getContribution(accessor: ServicesAccessor): AgentFeedbackWorkbenchCommentsContribution | undefined {
	const controller = accessor.get(ICommentService).getCommentController(AGENT_FEEDBACK_COMMENT_CONTROLLER_ID);
	return controller instanceof AgentFeedbackWorkbenchCommentsContribution ? controller : undefined;
}

function whenAgentFeedbackComment(capability: CommentCapability): ContextKeyExpression | undefined {
	return ContextKeyExpr.and(
		ChatContextKeys.enabled,
		CommentContextKeys.commentControllerContext.isEqualTo(AGENT_FEEDBACK_COMMENT_CONTROLLER_ID),
		ContextKeyExpr.regex(CommentContextKeys.commentContext.key, new RegExp(`(^| )${capability}( |$)`)),
	);
}

/**
 * The actions of agent feedback comments, laid out like in the agent feedback widget: the actions of the `inline` group
 * are shown next to the comment, and the others in its More Actions menu.
 */
const commentActions: readonly {
	readonly id: string;
	readonly title: ILocalizedString;
	readonly icon: ThemeIcon;
	readonly action: AgentFeedbackCommentAction;
	readonly menus: readonly { readonly capability: CommentCapability; readonly group: string; readonly order: number }[];
}[] = [
	{
		id: 'agentFeedback.comment.share',
		title: localize2('agentFeedback.comment.share', "Share Comment with Agent"),
		icon: acceptIcon,
		action: AgentFeedbackCommentAction.Share,
		menus: [
			{ capability: CommentCapability.Share, group: 'inline', order: 1 },
			{ capability: CommentCapability.Share, group: '2_share', order: 1 },
		],
	},
	{
		id: 'agentFeedback.comment.edit',
		title: localize2('agentFeedback.comment.edit', "Edit"),
		icon: editIcon,
		action: AgentFeedbackCommentAction.Edit,
		menus: [
			{ capability: CommentCapability.EditInline, group: 'inline', order: 2 },
			{ capability: CommentCapability.Edit, group: '1_modify', order: 1 },
		],
	},
	{
		id: 'agentFeedback.comment.hide',
		title: localize2('agentFeedback.comment.hide', "Hide"),
		icon: hideIcon,
		action: AgentFeedbackCommentAction.Hide,
		menus: [{ capability: CommentCapability.Hide, group: 'inline', order: 3 }],
	},
	{
		id: 'agentFeedback.comment.delete',
		title: localize2('agentFeedback.comment.delete', "Delete"),
		icon: deleteIcon,
		action: AgentFeedbackCommentAction.Remove,
		menus: [
			{ capability: CommentCapability.Delete, group: 'inline', order: 4 },
			{ capability: CommentCapability.Delete, group: '2_share', order: 2 },
		],
	},
	{
		id: 'agentFeedback.comment.resolvePullRequestComment',
		title: localize2('agentFeedback.comment.resolvePullRequestComment', "Resolve PR Comment"),
		icon: deleteIcon,
		action: AgentFeedbackCommentAction.Remove,
		menus: [
			{ capability: CommentCapability.ResolvePullRequestComment, group: 'inline', order: 4 },
			{ capability: CommentCapability.ResolvePullRequestComment, group: '2_share', order: 2 },
		],
	},
];

/**
 * Registers the actions of the agent feedback comments that the comment widget shows, and the Save and Cancel buttons
 * of a comment that is being edited.
 */
export function registerAgentFeedbackWorkbenchCommentActions(): IDisposable {
	const store = new DisposableStore();
	for (const { id, title, icon, action, menus } of commentActions) {
		store.add(registerAction2(class extends Action2 {
			constructor() {
				super({
					id,
					title,
					icon,
					menu: menus.map(({ capability, group, order }) => ({ id: MenuId.CommentTitle, group, order, when: whenAgentFeedbackComment(capability) })),
				});
			}

			run(accessor: ServicesAccessor, context: unknown): void | Promise<void> {
				if (isCommentActionContext(context)) {
					return getContribution(accessor)?.runCommentAction(context.thread, action);
				}
			}
		}));
	}
	for (const [id, title, order, save] of [
		['agentFeedback.comment.saveEdit', localize2('agentFeedback.comment.saveEdit', "Save"), 1, true],
		['agentFeedback.comment.cancelEdit', localize2('agentFeedback.comment.cancelEdit', "Cancel"), 2, false],
	] as const) {
		store.add(registerAction2(class extends Action2 {
			constructor() {
				super({
					id,
					title,
					menu: { id: MenuId.CommentActions, group: 'inline', order, when: whenAgentFeedbackComment(CommentCapability.Edit) },
				});
			}

			run(accessor: ServicesAccessor, context: unknown): void {
				if (isCommentActionContext(context)) {
					getContribution(accessor)?.finishEditing(context.thread, save ? context.text : undefined);
				}
			}
		}));
	}
	return store;
}
