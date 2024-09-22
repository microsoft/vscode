/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../base/common/cancellation.js';
import { Emitter, Event } from '../../../base/common/event.js';
import { Disposable, DisposableStore, IDisposable } from '../../../base/common/lifecycle.js';
import { URI, UriComponents } from '../../../base/common/uri.js';
import { IRange, Range } from '../../../editor/common/core/range.js';
import * as languages from '../../../editor/common/languages.js';
import { ExtensionIdentifier } from '../../../platform/extensions/common/extensions.js';
import { Registry } from '../../../platform/registry/common/platform.js';
import { extHostNamedCustomer, IExtHostContext } from '../../services/extensions/common/extHostCustomers.js';
import { ICommentController, ICommentService } from '../../contrib/comments/browser/commentService.js';
import { CommentsPanel } from '../../contrib/comments/browser/commentsView.js';
import { CommentProviderFeatures, ExtHostCommentsShape, ExtHostContext, MainContext, MainThreadCommentsShape, CommentThreadChanges } from '../common/extHost.protocol.js';
import { COMMENTS_VIEW_ID, COMMENTS_VIEW_STORAGE_ID, COMMENTS_VIEW_TITLE } from '../../contrib/comments/browser/commentsTreeViewer.js';
import { ViewContainer, IViewContainersRegistry, Extensions as ViewExtensions, ViewContainerLocation, IViewsRegistry, IViewDescriptorService } from '../../common/views.js';
import { SyncDescriptor } from '../../../platform/instantiation/common/descriptors.js';
import { ViewPaneContainer } from '../../browser/parts/views/viewPaneContainer.js';
import { Codicon } from '../../../base/common/codicons.js';
import { registerIcon } from '../../../platform/theme/common/iconRegistry.js';
import { localize } from '../../../nls.js';
import { MarshalledId } from '../../../base/common/marshallingIds.js';
import { ICellRange } from '../../contrib/notebook/common/notebookRange.js';
import { Schemas } from '../../../base/common/network.js';
import { IViewsService } from '../../services/views/common/viewsService.js';
import { MarshalledCommentThread } from '../../common/comments.js';
import { revealCommentThread } from '../../contrib/comments/browser/commentsController.js';
import { IEditorService } from '../../services/editor/common/editorService.js';
import { IUriIdentityService } from '../../../platform/uriIdentity/common/uriIdentity.js';

export class MainThreadCommentThread<T> implements languages.CommentThread<T> {
	private _input?: languages.CommentInput;
	get input(): languages.CommentInput | undefined {
		return this._input;
	}

	set input(value: languages.CommentInput | undefined) {
		this._input = value;
		this._onDidChangeInput.fire(value);
	}

	private readonly _onDidChangeInput = new Emitter<languages.CommentInput | undefined>();
	get onDidChangeInput(): Event<languages.CommentInput | undefined> { return this._onDidChangeInput.event; }

	private _label: string | undefined;

	get label(): string | undefined {
		return this._label;
	}

	set label(label: string | undefined) {
		this._label = label;
		this._onDidChangeLabel.fire(this._label);
	}

	private _contextValue: string | undefined;

	get contextValue(): string | undefined {
		return this._contextValue;
	}

	set contextValue(context: string | undefined) {
		this._contextValue = context;
	}

	private readonly _onDidChangeLabel = new Emitter<string | undefined>();
	readonly onDidChangeLabel: Event<string | undefined> = this._onDidChangeLabel.event;

	private _comments: ReadonlyArray<languages.Comment> | undefined;

	public get comments(): ReadonlyArray<languages.Comment> | undefined {
		return this._comments;
	}

	public set comments(newComments: ReadonlyArray<languages.Comment> | undefined) {
		this._comments = newComments;
		this._onDidChangeComments.fire(this._comments);
	}

	private readonly _onDidChangeComments = new Emitter<readonly languages.Comment[] | undefined>();
	get onDidChangeComments(): Event<readonly languages.Comment[] | undefined> { return this._onDidChangeComments.event; }

	set range(range: T | undefined) {
		this._range = range;
	}

	get range(): T | undefined {
		return this._range;
	}

	private readonly _onDidChangeCanReply = new Emitter<boolean>();
	get onDidChangeCanReply(): Event<boolean> { return this._onDidChangeCanReply.event; }
	set canReply(state: boolean) {
		this._canReply = state;
		this._onDidChangeCanReply.fire(this._canReply);
	}

	get canReply() {
		return this._canReply;
	}

	private _collapsibleState: languages.CommentThreadCollapsibleState | undefined;
	get collapsibleState() {
		return this._collapsibleState;
	}

	set collapsibleState(newState: languages.CommentThreadCollapsibleState | undefined) {
		if (newState !== this._collapsibleState) {
			this._collapsibleState = newState;
			this._onDidChangeCollapsibleState.fire(this._collapsibleState);
		}
	}

	private _initialCollapsibleState: languages.CommentThreadCollapsibleState | undefined;
	get initialCollapsibleState() {
		return this._initialCollapsibleState;
	}

	private set initialCollapsibleState(initialCollapsibleState: languages.CommentThreadCollapsibleState | undefined) {
		this._initialCollapsibleState = initialCollapsibleState;
		if (this.collapsibleState === undefined) {
			this.collapsibleState = this.initialCollapsibleState;
		}
		this._onDidChangeInitialCollapsibleState.fire(initialCollapsibleState);
	}

	private readonly _onDidChangeCollapsibleState = new Emitter<languages.CommentThreadCollapsibleState | undefined>();
	public onDidChangeCollapsibleState = this._onDidChangeCollapsibleState.event;
	private readonly _onDidChangeInitialCollapsibleState = new Emitter<languages.CommentThreadCollapsibleState | undefined>();
	public onDidChangeInitialCollapsibleState = this._onDidChangeInitialCollapsibleState.event;

	private _isDisposed: boolean;

	get isDisposed(): boolean {
		return this._isDisposed;
	}

	isDocumentCommentThread(): this is languages.CommentThread<IRange> {
		return this._range === undefined || Range.isIRange(this._range);
	}

	private _state: languages.CommentThreadState | undefined;
	get state() {
		return this._state;
	}

	set state(newState: languages.CommentThreadState | undefined) {
		this._state = newState;
		this._onDidChangeState.fire(this._state);
	}

	private _applicability: languages.CommentThreadApplicability | undefined;

	get applicability(): languages.CommentThreadApplicability | undefined {
		return this._applicability;
	}

	set applicability(value: languages.CommentThreadApplicability | undefined) {
		this._applicability = value;
		this._onDidChangeApplicability.fire(value);
	}

	private readonly _onDidChangeApplicability = new Emitter<languages.CommentThreadApplicability | undefined>();
	readonly onDidChangeApplicability: Event<languages.CommentThreadApplicability | undefined> = this._onDidChangeApplicability.event;

	public get isTemplate(): boolean {
		return this._isTemplate;
	}

	private readonly _onDidChangeState = new Emitter<languages.CommentThreadState | undefined>();
	public onDidChangeState = this._onDidChangeState.event;

	constructor(
		public commentThreadHandle: number,
		public controllerHandle: number,
		public extensionId: string,
		public threadId: string,
		public resource: string,
		private _range: T | undefined,
		comments: languages.Comment[] | undefined,
		private _canReply: boolean,
		private _isTemplate: boolean,
		public editorId?: string
	) {
		this._isDisposed = false;
		if (_isTemplate) {
			this.comments = [];
		} else if (comments) {
			this._comments = comments;
		}
	}

	batchUpdate(changes: CommentThreadChanges<T>) {
		const modified = (value: keyof CommentThreadChanges): boolean =>
			Object.prototype.hasOwnProperty.call(changes, value);

		if (modified('range')) { this._range = changes.range!; }
		if (modified('label')) { this._label = changes.label; }
		if (modified('contextValue')) { this._contextValue = changes.contextValue === null ? undefined : changes.contextValue; }
		if (modified('comments')) { this.comments = changes.comments; }
		if (modified('collapseState')) { this.initialCollapsibleState = changes.collapseState; }
		if (modified('canReply')) { this.canReply = changes.canReply!; }
		if (modified('state')) { this.state = changes.state!; }
		if (modified('applicability')) { this.applicability = changes.applicability!; }
		if (modified('isTemplate')) { this._isTemplate = changes.isTemplate!; }
	}

	hasComments(): boolean {
		return !!this.comments && this.comments.length > 0;
	}

	dispose() {
		this._isDisposed = true;
		this._onDidChangeCollapsibleState.dispose();
		this._onDidChangeComments.dispose();
		this._onDidChangeInput.dispose();
		this._onDidChangeLabel.dispose();
		this._onDidChangeState.dispose();
	}

	toJSON(): MarshalledCommentThread {
		return {
			$mid: MarshalledId.CommentThread,
			commentControlHandle: this.controllerHandle,
			commentThreadHandle: this.commentThreadHandle,
		};
	}
}

export class MainThreadCommentController implements ICommentController {
	get handle(): number {
		return this._handle;
	}

	get id(): string {
		return this._id;
	}

	get contextValue(): string {
		return this._id;
	}

	get proxy(): ExtHostCommentsShape {
		return this._proxy;
	}

	get label(): string {
		return this._label;
	}

	private _reactions: languages.CommentReaction[] | undefined;

	get reactions() {
		return this._reactions;
	}

	set reactions(reactions: languages.CommentReaction[] | undefined) {
		this._reactions = reactions;
	}

	get options() {
		return this._features.options;
	}

	private readonly _threads: Map<number, MainThreadCommentThread<IRange | ICellRange>> = new Map<number, MainThreadCommentThread<IRange | ICellRange>>();
	public activeEditingCommentThread?: MainThreadCommentThread<IRange | ICellRange>;

	get features(): CommentProviderFeatures {
		return this._features;
	}

	get owner() {
		return this._id;
	}

	constructor(
		private readonly _proxy: ExtHostCommentsShape,
		private readonly _commentService: ICommentService,
		private readonly _handle: number,
		private readonly _uniqueId: string,
		private readonly _id: string,
		private readonly _label: string,
		private _features: CommentProviderFeatures
	) { }

	get activeComment() {
		return this._activeComment;
	}

	private _activeComment: { thread: languages.CommentThread; comment?: languages.Comment } | undefined;
	async setActiveCommentAndThread(commentInfo: { thread: languages.CommentThread; comment?: languages.Comment } | undefined) {
		this._activeComment = commentInfo;
		return this._proxy.$setActiveComment(this._handle, commentInfo ? { commentThreadHandle: commentInfo.thread.commentThreadHandle, uniqueIdInThread: commentInfo.comment?.uniqueIdInThread } : undefined);
	}

	updateFeatures(features: CommentProviderFeatures) {
		this._features = features;
	}

	createCommentThread(extensionId: string,
		commentThreadHandle: number,
		threadId: string,
		resource: UriComponents,
		range: IRange | ICellRange | undefined,
		comments: languages.Comment[],
		isTemplate: boolean,
		editorId?: string
	): languages.CommentThread<IRange | ICellRange> {
		const thread = new MainThreadCommentThread(
			commentThreadHandle,
			this.handle,
			extensionId,
			threadId,
			URI.revive(resource).toString(),
			range,
			comments,
			true,
			isTemplate,
			editorId
		);

		this._threads.set(commentThreadHandle, thread);

		if (thread.isDocumentCommentThread()) {
			this._commentService.updateComments(this._uniqueId, {
				added: [thread],
				removed: [],
				changed: [],
				pending: []
			});
		} else {
			this._commentService.updateNotebookComments(this._uniqueId, {
				added: [thread as MainThreadCommentThread<ICellRange>],
				removed: [],
				changed: [],
				pending: []
			});
		}

		return thread;
	}

	updateCommentThread(commentThreadHandle: number,
		threadId: string,
		resource: UriComponents,
		changes: CommentThreadChanges): void {
		const thread = this.getKnownThread(commentThreadHandle);
		thread.batchUpdate(changes);

		if (thread.isDocumentCommentThread()) {
			this._commentService.updateComments(this._uniqueId, {
				added: [],
				removed: [],
				changed: [thread],
				pending: []
			});
		} else {
			this._commentService.updateNotebookComments(this._uniqueId, {
				added: [],
				removed: [],
				changed: [thread as MainThreadCommentThread<ICellRange>],
				pending: []
			});
		}

	}

	deleteCommentThread(commentThreadHandle: number) {
		const thread = this.getKnownThread(commentThreadHandle);
		this._threads.delete(commentThreadHandle);
		thread.dispose();

		if (thread.isDocumentCommentThread()) {
			this._commentService.updateComments(this._uniqueId, {
				added: [],
				removed: [thread],
				changed: [],
				pending: []
			});
		} else {
			this._commentService.updateNotebookComments(this._uniqueId, {
				added: [],
				removed: [thread as MainThreadCommentThread<ICellRange>],
				changed: [],
				pending: []
			});
		}
	}

	deleteCommentThreadMain(commentThreadId: string) {
		this._threads.forEach(thread => {
			if (thread.threadId === commentThreadId) {
				this._proxy.$deleteCommentThread(this._handle, thread.commentThreadHandle);
			}
		});
	}

	updateInput(input: string) {
		const thread = this.activeEditingCommentThread;

		if (thread && thread.input) {
			const commentInput = thread.input;
			commentInput.value = input;
			thread.input = commentInput;
		}
	}

	updateCommentingRanges(resourceHints?: languages.CommentingRangeResourceHint) {
		this._commentService.updateCommentingRanges(this._uniqueId, resourceHints);
	}

	private getKnownThread(commentThreadHandle: number): MainThreadCommentThread<IRange | ICellRange> {
		const thread = this._threads.get(commentThreadHandle);
		if (!thread) {
			throw new Error('unknown thread');
		}
		return thread;
	}

	async getDocumentComments(resource: URI, token: CancellationToken) {
		if (resource.scheme === Schemas.vscodeNotebookCell) {
			return {
				uniqueOwner: this._uniqueId,
				label: this.label,
				threads: [],
				commentingRanges: {
					resource: resource,
					ranges: [],
					fileComments: false
				}
			};
		}

		const ret: languages.CommentThread<IRange>[] = [];
		for (const thread of [...this._threads.keys()]) {
			const commentThread = this._threads.get(thread)!;
			if (commentThread.resource === resource.toString()) {
				if (commentThread.isDocumentCommentThread()) {
					ret.push(commentThread);
				}
			}
		}

		const commentingRanges = await this._proxy.$provideCommentingRanges(this.handle, resource, token);

		return {
			uniqueOwner: this._uniqueId,
			label: this.label,
			threads: ret,
			commentingRanges: {
				resource: resource,
				ranges: commentingRanges?.ranges || [],
				fileComments: !!commentingRanges?.fileComments
			}
		};
	}

	async getNotebookComments(resource: URI, token: CancellationToken) {
		if (resource.scheme !== Schemas.vscodeNotebookCell) {
			return {
				uniqueOwner: this._uniqueId,
				label: this.label,
				threads: []
			};
		}

		const ret: languages.CommentThread<ICellRange>[] = [];
		for (const thread of [...this._threads.keys()]) {
			const commentThread = this._threads.get(thread)!;
			if (commentThread.resource === resource.toString()) {
				if (!commentThread.isDocumentCommentThread()) {
					ret.push(commentThread as languages.CommentThread<ICellRange>);
				}
			}
		}

		return {
			uniqueOwner: this._uniqueId,
			label: this.label,
			threads: ret
		};
	}

	async toggleReaction(uri: URI, thread: languages.CommentThread, comment: languages.Comment, reaction: languages.CommentReaction, token: CancellationToken): Promise<void> {
		return this._proxy.$toggleReaction(this._handle, thread.commentThreadHandle, uri, comment, reaction);
	}

	getAllComments(): MainThreadCommentThread<IRange | ICellRange>[] {
		const ret: MainThreadCommentThread<IRange | ICellRange>[] = [];
		for (const thread of [...this._threads.keys()]) {
			ret.push(this._threads.get(thread)!);
		}

		return ret;
	}

	createCommentThreadTemplate(resource: UriComponents, range: IRange | undefined, editorId?: string): Promise<void> {
		return this._proxy.$createCommentThreadTemplate(this.handle, resource, range, editorId);
	}

	async updateCommentThreadTemplate(threadHandle: number, range: IRange) {
		await this._proxy.$updateCommentThreadTemplate(this.handle, threadHandle, range);
	}

	toJSON(): any {
		return {
			$mid: MarshalledId.CommentController,
			handle: this.handle
		};
	}
}


const commentsViewIcon = registerIcon('comments-view-icon', Codicon.commentDiscussion, localize('commentsViewIcon', 'View icon of the comments view.'));

@extHostNamedCustomer(MainContext.MainThreadComments)
export class MainThreadComments extends Disposable implements MainThreadCommentsShape {
	private readonly _proxy: ExtHostCommentsShape;

	private _handlers = new Map<number, string>();
	private _commentControllers = new Map<number, MainThreadCommentController>();

	private _activeEditingCommentThread?: MainThreadCommentThread<IRange | ICellRange>;
	private readonly _activeEditingCommentThreadDisposables = this._register(new DisposableStore());

	private _openViewListener: IDisposable | null = null;


	constructor(
		extHostContext: IExtHostContext,
		@ICommentService private readonly _commentService: ICommentService,
		@IViewsService private readonly _viewsService: IViewsService,
		@IViewDescriptorService private readonly _viewDescriptorService: IViewDescriptorService,
		@IUriIdentityService private readonly _uriIdentityService: IUriIdentityService,
		@IEditorService private readonly _editorService: IEditorService
	) {
		super();
		this._proxy = extHostContext.getProxy(ExtHostContext.ExtHostComments);
		this._commentService.unregisterCommentController();

		this._register(this._commentService.onDidChangeActiveEditingCommentThread(async thread => {
			const handle = (thread as MainThreadCommentThread<IRange | ICellRange>).controllerHandle;
			const controller = this._commentControllers.get(handle);

			if (!controller) {
				return;
			}

			this._activeEditingCommentThreadDisposables.clear();
			this._activeEditingCommentThread = thread as MainThreadCommentThread<IRange | ICellRange>;
			controller.activeEditingCommentThread = this._activeEditingCommentThread;
		}));
	}

	$registerCommentController(handle: number, id: string, label: string, extensionId: string): void {
		const providerId = `${id}-${extensionId}`;
		this._handlers.set(handle, providerId);

		const provider = new MainThreadCommentController(this._proxy, this._commentService, handle, providerId, id, label, {});
		this._commentService.registerCommentController(providerId, provider);
		this._commentControllers.set(handle, provider);

		const commentsPanelAlreadyConstructed = !!this._viewDescriptorService.getViewDescriptorById(COMMENTS_VIEW_ID);
		if (!commentsPanelAlreadyConstructed) {
			this.registerView(commentsPanelAlreadyConstructed);
		}
		this.registerViewListeners(commentsPanelAlreadyConstructed);
		this._commentService.setWorkspaceComments(String(handle), []);
	}

	$unregisterCommentController(handle: number): void {
		const providerId = this._handlers.get(handle);
		this._handlers.delete(handle);
		this._commentControllers.delete(handle);

		if (typeof providerId !== 'string') {
			return;
			// throw new Error('unknown handler');
		} else {
			this._commentService.unregisterCommentController(providerId);
		}
	}

	$updateCommentControllerFeatures(handle: number, features: CommentProviderFeatures): void {
		const provider = this._commentControllers.get(handle);

		if (!provider) {
			return undefined;
		}

		provider.updateFeatures(features);
	}

	$createCommentThread(handle: number,
		commentThreadHandle: number,
		threadId: string,
		resource: UriComponents,
		range: IRange | ICellRange | undefined,
		comments: languages.Comment[],
		extensionId: ExtensionIdentifier,
		isTemplate: boolean,
		editorId?: string
	): languages.CommentThread<IRange | ICellRange> | undefined {
		const provider = this._commentControllers.get(handle);

		if (!provider) {
			return undefined;
		}

		return provider.createCommentThread(extensionId.value, commentThreadHandle, threadId, resource, range, comments, isTemplate, editorId);
	}

	$updateCommentThread(handle: number,
		commentThreadHandle: number,
		threadId: string,
		resource: UriComponents,
		changes: CommentThreadChanges): void {
		const provider = this._commentControllers.get(handle);

		if (!provider) {
			return undefined;
		}

		return provider.updateCommentThread(commentThreadHandle, threadId, resource, changes);
	}

	$deleteCommentThread(handle: number, commentThreadHandle: number) {
		const provider = this._commentControllers.get(handle);

		if (!provider) {
			return;
		}

		return provider.deleteCommentThread(commentThreadHandle);
	}

	$updateCommentingRanges(handle: number, resourceHints?: languages.CommentingRangeResourceHint) {
		const provider = this._commentControllers.get(handle);

		if (!provider) {
			return;
		}

		provider.updateCommentingRanges(resourceHints);
	}

	async $revealCommentThread(handle: number, commentThreadHandle: number, commentUniqueIdInThread: number, options: languages.CommentThreadRevealOptions): Promise<void> {
		const provider = this._commentControllers.get(handle);

		if (!provider) {
			return Promise.resolve();
		}

		const thread = provider.getAllComments().find(thread => thread.commentThreadHandle === commentThreadHandle);
		if (!thread || !thread.isDocumentCommentThread()) {
			return Promise.resolve();
		}

		const comment = thread.comments?.find(comment => comment.uniqueIdInThread === commentUniqueIdInThread);

		revealCommentThread(this._commentService, this._editorService, this._uriIdentityService, thread, comment, options.focusReply, undefined, options.preserveFocus);
	}

	async $hideCommentThread(handle: number, commentThreadHandle: number): Promise<void> {
		const provider = this._commentControllers.get(handle);

		if (!provider) {
			return Promise.resolve();
		}

		const thread = provider.getAllComments().find(thread => thread.commentThreadHandle === commentThreadHandle);
		if (!thread || !thread.isDocumentCommentThread()) {
			return Promise.resolve();
		}

		thread.collapsibleState = languages.CommentThreadCollapsibleState.Collapsed;
	}

	private registerView(commentsViewAlreadyRegistered: boolean) {
		if (!commentsViewAlreadyRegistered) {
			const VIEW_CONTAINER: ViewContainer = Registry.as<IViewContainersRegistry>(ViewExtensions.ViewContainersRegistry).registerViewContainer({
				id: COMMENTS_VIEW_ID,
				title: COMMENTS_VIEW_TITLE,
				ctorDescriptor: new SyncDescriptor(ViewPaneContainer, [COMMENTS_VIEW_ID, { mergeViewWithContainerWhenSingleView: true }]),
				storageId: COMMENTS_VIEW_STORAGE_ID,
				hideIfEmpty: true,
				icon: commentsViewIcon,
				order: 10,
			}, ViewContainerLocation.Panel);

			Registry.as<IViewsRegistry>(ViewExtensions.ViewsRegistry).registerViews([{
				id: COMMENTS_VIEW_ID,
				name: COMMENTS_VIEW_TITLE,
				canToggleVisibility: false,
				ctorDescriptor: new SyncDescriptor(CommentsPanel),
				canMoveView: true,
				containerIcon: commentsViewIcon,
				focusCommand: {
					id: 'workbench.action.focusCommentsPanel'
				}
			}], VIEW_CONTAINER);
		}
	}

	private setComments() {
		[...this._commentControllers.keys()].forEach(handle => {
			const threads = this._commentControllers.get(handle)!.getAllComments();

			if (threads.length) {
				const providerId = this.getHandler(handle);
				this._commentService.setWorkspaceComments(providerId, threads);
			}
		});
	}

	private registerViewOpenedListener() {
		if (!this._openViewListener) {
			this._openViewListener = this._viewsService.onDidChangeViewVisibility(e => {
				if (e.id === COMMENTS_VIEW_ID && e.visible) {
					this.setComments();
					if (this._openViewListener) {
						this._openViewListener.dispose();
						this._openViewListener = null;
					}
				}
			});
		}
	}

	/**
	 * If the comments view has never been opened, the constructor for it has not yet run so it has
	 * no listeners for comment threads being set or updated. Listen for the view opening for the
	 * first time and send it comments then.
	 */
	private registerViewListeners(commentsPanelAlreadyConstructed: boolean) {
		if (!commentsPanelAlreadyConstructed) {
			this.registerViewOpenedListener();
		}

		this._register(this._viewDescriptorService.onDidChangeContainer(e => {
			if (e.views.find(view => view.id === COMMENTS_VIEW_ID)) {
				this.setComments();
				this.registerViewOpenedListener();
			}
		}));
		this._register(this._viewDescriptorService.onDidChangeContainerLocation(e => {
			const commentsContainer = this._viewDescriptorService.getViewContainerByViewId(COMMENTS_VIEW_ID);
			if (e.viewContainer.id === commentsContainer?.id) {
				this.setComments();
				this.registerViewOpenedListener();
			}
		}));
	}

	private getHandler(handle: number) {
		if (!this._handlers.has(handle)) {
			throw new Error('Unknown handler');
		}
		return this._handlers.get(handle)!;
	}
}
