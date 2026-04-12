/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
import { Emitter } from '../../../base/common/event.js';
import { Disposable, DisposableMap, DisposableStore, MutableDisposable } from '../../../base/common/lifecycle.js';
import { URI } from '../../../base/common/uri.js';
import { Range } from '../../../editor/common/core/range.js';
import * as languages from '../../../editor/common/languages.js';
import { Registry } from '../../../platform/registry/common/platform.js';
import { extHostNamedCustomer } from '../../services/extensions/common/extHostCustomers.js';
import { ICommentService } from '../../contrib/comments/browser/commentService.js';
import { CommentsPanel } from '../../contrib/comments/browser/commentsView.js';
import { ExtHostContext, MainContext } from '../common/extHost.protocol.js';
import { COMMENTS_VIEW_ID, COMMENTS_VIEW_STORAGE_ID, COMMENTS_VIEW_TITLE } from '../../contrib/comments/browser/commentsTreeViewer.js';
import { Extensions as ViewExtensions, IViewDescriptorService } from '../../common/views.js';
import { SyncDescriptor } from '../../../platform/instantiation/common/descriptors.js';
import { ViewPaneContainer } from '../../browser/parts/views/viewPaneContainer.js';
import { Codicon } from '../../../base/common/codicons.js';
import { registerIcon } from '../../../platform/theme/common/iconRegistry.js';
import { localize } from '../../../nls.js';
import { Schemas } from '../../../base/common/network.js';
import { IViewsService } from '../../services/views/common/viewsService.js';
import { revealCommentThread } from '../../contrib/comments/browser/commentsController.js';
import { IEditorService } from '../../services/editor/common/editorService.js';
import { IUriIdentityService } from '../../../platform/uriIdentity/common/uriIdentity.js';
export class MainThreadCommentThread {
    get input() {
        return this._input;
    }
    set input(value) {
        this._input = value;
        this._onDidChangeInput.fire(value);
    }
    get onDidChangeInput() { return this._onDidChangeInput.event; }
    get label() {
        return this._label;
    }
    set label(label) {
        this._label = label;
        this._onDidChangeLabel.fire(this._label);
    }
    get contextValue() {
        return this._contextValue;
    }
    set contextValue(context) {
        this._contextValue = context;
    }
    get comments() {
        return this._comments;
    }
    set comments(newComments) {
        this._comments = newComments;
        this._onDidChangeComments.fire(this._comments);
    }
    get onDidChangeComments() { return this._onDidChangeComments.event; }
    set range(range) {
        this._range = range;
    }
    get range() {
        return this._range;
    }
    get onDidChangeCanReply() { return this._onDidChangeCanReply.event; }
    set canReply(state) {
        this._canReply = state;
        this._onDidChangeCanReply.fire(!!this._canReply);
    }
    get canReply() {
        return this._canReply;
    }
    get collapsibleState() {
        return this._collapsibleState;
    }
    set collapsibleState(newState) {
        if (this.initialCollapsibleState === undefined) {
            this.initialCollapsibleState = newState;
        }
        if (newState !== this._collapsibleState) {
            this._collapsibleState = newState;
            this._onDidChangeCollapsibleState.fire(this._collapsibleState);
        }
    }
    get initialCollapsibleState() {
        return this._initialCollapsibleState;
    }
    set initialCollapsibleState(initialCollapsibleState) {
        this._initialCollapsibleState = initialCollapsibleState;
        this._onDidChangeInitialCollapsibleState.fire(initialCollapsibleState);
    }
    get isDisposed() {
        return this._isDisposed;
    }
    isDocumentCommentThread() {
        return this._range === undefined || Range.isIRange(this._range);
    }
    get state() {
        return this._state;
    }
    set state(newState) {
        this._state = newState;
        this._onDidChangeState.fire(this._state);
    }
    get applicability() {
        return this._applicability;
    }
    set applicability(value) {
        this._applicability = value;
        this._onDidChangeApplicability.fire(value);
    }
    get isTemplate() {
        return this._isTemplate;
    }
    constructor(commentThreadHandle, controllerHandle, extensionId, threadId, resource, _range, comments, _canReply, _isTemplate, editorId) {
        this.commentThreadHandle = commentThreadHandle;
        this.controllerHandle = controllerHandle;
        this.extensionId = extensionId;
        this.threadId = threadId;
        this.resource = resource;
        this._range = _range;
        this._canReply = _canReply;
        this._isTemplate = _isTemplate;
        this.editorId = editorId;
        this._onDidChangeInput = new Emitter();
        this._onDidChangeLabel = new Emitter();
        this.onDidChangeLabel = this._onDidChangeLabel.event;
        this._onDidChangeComments = new Emitter();
        this._onDidChangeCanReply = new Emitter();
        this._collapsibleState = languages.CommentThreadCollapsibleState.Collapsed;
        this._onDidChangeCollapsibleState = new Emitter();
        this.onDidChangeCollapsibleState = this._onDidChangeCollapsibleState.event;
        this._onDidChangeInitialCollapsibleState = new Emitter();
        this.onDidChangeInitialCollapsibleState = this._onDidChangeInitialCollapsibleState.event;
        this._onDidChangeApplicability = new Emitter();
        this.onDidChangeApplicability = this._onDidChangeApplicability.event;
        this._onDidChangeState = new Emitter();
        this.onDidChangeState = this._onDidChangeState.event;
        this._isDisposed = false;
        if (_isTemplate) {
            this.comments = [];
        }
        else if (comments) {
            this._comments = comments;
        }
    }
    batchUpdate(changes) {
        const modified = (value) => Object.prototype.hasOwnProperty.call(changes, value);
        if (modified('range')) {
            this._range = changes.range;
        }
        if (modified('label')) {
            this._label = changes.label;
        }
        if (modified('contextValue')) {
            this._contextValue = changes.contextValue === null ? undefined : changes.contextValue;
        }
        if (modified('comments')) {
            this.comments = changes.comments;
        }
        if (modified('collapseState')) {
            this.collapsibleState = changes.collapseState;
        }
        if (modified('canReply')) {
            this.canReply = changes.canReply;
        }
        if (modified('state')) {
            this.state = changes.state;
        }
        if (modified('applicability')) {
            this.applicability = changes.applicability;
        }
        if (modified('isTemplate')) {
            this._isTemplate = changes.isTemplate;
        }
    }
    hasComments() {
        return !!this.comments && this.comments.length > 0;
    }
    dispose() {
        this._isDisposed = true;
        this._onDidChangeCollapsibleState.dispose();
        this._onDidChangeInitialCollapsibleState.dispose();
        this._onDidChangeComments.dispose();
        this._onDidChangeInput.dispose();
        this._onDidChangeLabel.dispose();
        this._onDidChangeCanReply.dispose();
        this._onDidChangeState.dispose();
        this._onDidChangeApplicability.dispose();
    }
    toJSON() {
        return {
            $mid: 7 /* MarshalledId.CommentThread */,
            commentControlHandle: this.controllerHandle,
            commentThreadHandle: this.commentThreadHandle,
        };
    }
}
class CommentThreadWithDisposable {
    constructor(thread) {
        this.thread = thread;
        this.disposableStore = new DisposableStore();
    }
    dispose() {
        this.disposableStore.dispose();
    }
}
export class MainThreadCommentController extends Disposable {
    get handle() {
        return this._handle;
    }
    get id() {
        return this._id;
    }
    get contextValue() {
        return this._id;
    }
    get proxy() {
        return this._proxy;
    }
    get label() {
        return this._label;
    }
    get reactions() {
        return this._reactions;
    }
    set reactions(reactions) {
        this._reactions = reactions;
    }
    get options() {
        return this._features.options;
    }
    get features() {
        return this._features;
    }
    get owner() {
        return this._id;
    }
    constructor(_proxy, _commentService, _handle, _uniqueId, _id, _label, _features) {
        super();
        this._proxy = _proxy;
        this._commentService = _commentService;
        this._handle = _handle;
        this._uniqueId = _uniqueId;
        this._id = _id;
        this._label = _label;
        this._features = _features;
        this._threads = this._register(new DisposableMap());
    }
    get activeComment() {
        return this._activeComment;
    }
    async setActiveCommentAndThread(commentInfo) {
        this._activeComment = commentInfo;
        return this._proxy.$setActiveComment(this._handle, commentInfo ? { commentThreadHandle: commentInfo.thread.commentThreadHandle, uniqueIdInThread: commentInfo.comment?.uniqueIdInThread } : undefined);
    }
    updateFeatures(features) {
        this._features = features;
    }
    createCommentThread(extensionId, commentThreadHandle, threadId, resource, range, comments, isTemplate, editorId) {
        const thread = new MainThreadCommentThread(commentThreadHandle, this.handle, extensionId, threadId, URI.revive(resource).toString(), range, comments, true, isTemplate, editorId);
        const threadWithDisposable = new CommentThreadWithDisposable(thread);
        this._threads.set(commentThreadHandle, threadWithDisposable);
        threadWithDisposable.disposableStore.add(thread.onDidChangeCollapsibleState(() => {
            this.proxy.$updateCommentThread(this.handle, thread.commentThreadHandle, { collapseState: thread.collapsibleState });
        }));
        if (thread.isDocumentCommentThread()) {
            this._commentService.updateComments(this._uniqueId, {
                added: [thread],
                removed: [],
                changed: [],
                pending: []
            });
        }
        else {
            this._commentService.updateNotebookComments(this._uniqueId, {
                added: [thread],
                removed: [],
                changed: [],
                pending: []
            });
        }
        return thread;
    }
    updateCommentThread(commentThreadHandle, threadId, resource, changes) {
        const thread = this.getKnownThread(commentThreadHandle);
        thread.batchUpdate(changes);
        if (thread.isDocumentCommentThread()) {
            this._commentService.updateComments(this._uniqueId, {
                added: [],
                removed: [],
                changed: [thread],
                pending: []
            });
        }
        else {
            this._commentService.updateNotebookComments(this._uniqueId, {
                added: [],
                removed: [],
                changed: [thread],
                pending: []
            });
        }
    }
    deleteCommentThread(commentThreadHandle) {
        const thread = this.getKnownThread(commentThreadHandle);
        this._threads.deleteAndDispose(commentThreadHandle);
        thread.dispose();
        if (thread.isDocumentCommentThread()) {
            this._commentService.updateComments(this._uniqueId, {
                added: [],
                removed: [thread],
                changed: [],
                pending: []
            });
        }
        else {
            this._commentService.updateNotebookComments(this._uniqueId, {
                added: [],
                removed: [thread],
                changed: [],
                pending: []
            });
        }
    }
    deleteCommentThreadMain(commentThreadId) {
        for (const { thread } of this._threads.values()) {
            if (thread.threadId === commentThreadId) {
                this._proxy.$deleteCommentThread(this._handle, thread.commentThreadHandle);
            }
        }
    }
    updateInput(input) {
        const thread = this.activeEditingCommentThread;
        if (thread && thread.input) {
            const commentInput = thread.input;
            commentInput.value = input;
            thread.input = commentInput;
        }
    }
    updateCommentingRanges(resourceHints) {
        this._commentService.updateCommentingRanges(this._uniqueId, resourceHints);
    }
    getKnownThread(commentThreadHandle) {
        const thread = this._threads.get(commentThreadHandle);
        if (!thread) {
            throw new Error('unknown thread');
        }
        return thread.thread;
    }
    async getDocumentComments(resource, token) {
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
        const ret = [];
        for (const thread of [...this._threads.keys()]) {
            const commentThread = this._threads.get(thread);
            if (commentThread.thread.resource === resource.toString()) {
                if (commentThread.thread.isDocumentCommentThread()) {
                    ret.push(commentThread.thread);
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
    async getNotebookComments(resource, token) {
        if (resource.scheme !== Schemas.vscodeNotebookCell) {
            return {
                uniqueOwner: this._uniqueId,
                label: this.label,
                threads: []
            };
        }
        const ret = [];
        for (const thread of [...this._threads.keys()]) {
            const commentThread = this._threads.get(thread);
            if (commentThread.thread.resource === resource.toString()) {
                if (!commentThread.thread.isDocumentCommentThread()) {
                    ret.push(commentThread.thread);
                }
            }
        }
        return {
            uniqueOwner: this._uniqueId,
            label: this.label,
            threads: ret
        };
    }
    async toggleReaction(uri, thread, comment, reaction, token) {
        return this._proxy.$toggleReaction(this._handle, thread.commentThreadHandle, uri, comment, reaction);
    }
    getAllComments() {
        const ret = [];
        for (const thread of [...this._threads.keys()]) {
            ret.push(this._threads.get(thread).thread);
        }
        return ret;
    }
    createCommentThreadTemplate(resource, range, editorId) {
        return this._proxy.$createCommentThreadTemplate(this.handle, resource, range, editorId);
    }
    async updateCommentThreadTemplate(threadHandle, range) {
        await this._proxy.$updateCommentThreadTemplate(this.handle, threadHandle, range);
    }
    toJSON() {
        return {
            $mid: 6 /* MarshalledId.CommentController */,
            handle: this.handle
        };
    }
}
const commentsViewIcon = registerIcon('comments-view-icon', Codicon.commentDiscussion, localize('commentsViewIcon', 'View icon of the comments view.'));
let MainThreadComments = class MainThreadComments extends Disposable {
    constructor(extHostContext, _commentService, _viewsService, _viewDescriptorService, _uriIdentityService, _editorService) {
        super();
        this._commentService = _commentService;
        this._viewsService = _viewsService;
        this._viewDescriptorService = _viewDescriptorService;
        this._uriIdentityService = _uriIdentityService;
        this._editorService = _editorService;
        this._handlers = new Map();
        this._commentControllers = new Map();
        this._activeEditingCommentThreadDisposables = this._register(new DisposableStore());
        this._openViewListener = this._register(new MutableDisposable());
        this._onChangeContainerListener = this._register(new MutableDisposable());
        this._onChangeContainerLocationListener = this._register(new MutableDisposable());
        this._proxy = extHostContext.getProxy(ExtHostContext.ExtHostComments);
        this._commentService.unregisterCommentController();
        this._register(this._commentService.onDidChangeActiveEditingCommentThread(async (thread) => {
            const handle = thread.controllerHandle;
            const controller = this._commentControllers.get(handle);
            if (!controller) {
                return;
            }
            this._activeEditingCommentThreadDisposables.clear();
            this._activeEditingCommentThread = thread;
            controller.activeEditingCommentThread = this._activeEditingCommentThread;
        }));
    }
    $registerCommentController(handle, id, label, extensionId) {
        const providerId = `${id}-${extensionId}`;
        this._handlers.set(handle, providerId);
        const provider = new MainThreadCommentController(this._proxy, this._commentService, handle, providerId, id, label, {});
        this._commentService.registerCommentController(providerId, provider);
        this._commentControllers.set(handle, provider);
        this._register(this._commentService.onResourceHasCommentingRanges(e => {
            this.registerView();
        }));
        this._register(this._commentService.onDidUpdateCommentThreads(e => {
            this.registerView();
        }));
        this._commentService.setWorkspaceComments(String(handle), []);
    }
    $unregisterCommentController(handle) {
        const providerId = this._handlers.get(handle);
        this._handlers.delete(handle);
        this._commentControllers.get(handle)?.dispose();
        this._commentControllers.delete(handle);
        if (typeof providerId !== 'string') {
            return;
            // throw new Error('unknown handler');
        }
        else {
            this._commentService.unregisterCommentController(providerId);
        }
    }
    $updateCommentControllerFeatures(handle, features) {
        const provider = this._commentControllers.get(handle);
        if (!provider) {
            return undefined;
        }
        provider.updateFeatures(features);
    }
    $createCommentThread(handle, commentThreadHandle, threadId, resource, range, comments, extensionId, isTemplate, editorId) {
        const provider = this._commentControllers.get(handle);
        if (!provider) {
            return undefined;
        }
        return provider.createCommentThread(extensionId.value, commentThreadHandle, threadId, resource, range, comments, isTemplate, editorId);
    }
    $updateCommentThread(handle, commentThreadHandle, threadId, resource, changes) {
        const provider = this._commentControllers.get(handle);
        if (!provider) {
            return undefined;
        }
        return provider.updateCommentThread(commentThreadHandle, threadId, resource, changes);
    }
    $deleteCommentThread(handle, commentThreadHandle) {
        const provider = this._commentControllers.get(handle);
        if (!provider) {
            return;
        }
        return provider.deleteCommentThread(commentThreadHandle);
    }
    $updateCommentingRanges(handle, resourceHints) {
        const provider = this._commentControllers.get(handle);
        if (!provider) {
            return;
        }
        provider.updateCommentingRanges(resourceHints);
    }
    async $revealCommentThread(handle, commentThreadHandle, commentUniqueIdInThread, options) {
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
    async $hideCommentThread(handle, commentThreadHandle) {
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
    registerView() {
        const commentsPanelAlreadyConstructed = !!this._viewDescriptorService.getViewDescriptorById(COMMENTS_VIEW_ID);
        if (!commentsPanelAlreadyConstructed) {
            const VIEW_CONTAINER = Registry.as(ViewExtensions.ViewContainersRegistry).registerViewContainer({
                id: COMMENTS_VIEW_ID,
                title: COMMENTS_VIEW_TITLE,
                ctorDescriptor: new SyncDescriptor(ViewPaneContainer, [COMMENTS_VIEW_ID, { mergeViewWithContainerWhenSingleView: true }]),
                storageId: COMMENTS_VIEW_STORAGE_ID,
                hideIfEmpty: true,
                icon: commentsViewIcon,
                order: 10,
            }, 1 /* ViewContainerLocation.Panel */);
            Registry.as(ViewExtensions.ViewsRegistry).registerViews([{
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
        this.registerViewListeners(commentsPanelAlreadyConstructed);
    }
    setComments() {
        [...this._commentControllers.keys()].forEach(handle => {
            const threads = this._commentControllers.get(handle).getAllComments();
            if (threads.length) {
                const providerId = this.getHandler(handle);
                this._commentService.setWorkspaceComments(providerId, threads);
            }
        });
    }
    registerViewOpenedListener() {
        if (!this._openViewListener.value) {
            this._openViewListener.value = this._viewsService.onDidChangeViewVisibility(e => {
                if (e.id === COMMENTS_VIEW_ID && e.visible) {
                    this.setComments();
                    if (this._openViewListener) {
                        this._openViewListener.dispose();
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
    registerViewListeners(commentsPanelAlreadyConstructed) {
        if (!commentsPanelAlreadyConstructed) {
            this.registerViewOpenedListener();
        }
        if (!this._onChangeContainerListener.value) {
            this._onChangeContainerListener.value = this._viewDescriptorService.onDidChangeContainer(e => {
                if (e.views.find(view => view.id === COMMENTS_VIEW_ID)) {
                    this.setComments();
                    this.registerViewOpenedListener();
                }
            });
        }
        if (!this._onChangeContainerLocationListener.value) {
            this._onChangeContainerLocationListener.value = this._viewDescriptorService.onDidChangeContainerLocation(e => {
                const commentsContainer = this._viewDescriptorService.getViewContainerByViewId(COMMENTS_VIEW_ID);
                if (e.viewContainer.id === commentsContainer?.id) {
                    this.setComments();
                    this.registerViewOpenedListener();
                }
            });
        }
    }
    getHandler(handle) {
        if (!this._handlers.has(handle)) {
            throw new Error('Unknown handler');
        }
        return this._handlers.get(handle);
    }
};
MainThreadComments = __decorate([
    extHostNamedCustomer(MainContext.MainThreadComments),
    __param(1, ICommentService),
    __param(2, IViewsService),
    __param(3, IViewDescriptorService),
    __param(4, IUriIdentityService),
    __param(5, IEditorService)
], MainThreadComments);
export { MainThreadComments };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWFpblRocmVhZENvbW1lbnRzLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2FwaS9icm93c2VyL21haW5UaHJlYWRDb21tZW50cy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7OztBQUdoRyxPQUFPLEVBQUUsT0FBTyxFQUFTLE1BQU0sK0JBQStCLENBQUM7QUFDL0QsT0FBTyxFQUFFLFVBQVUsRUFBRSxhQUFhLEVBQUUsZUFBZSxFQUFlLGlCQUFpQixFQUFFLE1BQU0sbUNBQW1DLENBQUM7QUFDL0gsT0FBTyxFQUFFLEdBQUcsRUFBaUIsTUFBTSw2QkFBNkIsQ0FBQztBQUNqRSxPQUFPLEVBQVUsS0FBSyxFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFDckUsT0FBTyxLQUFLLFNBQVMsTUFBTSxxQ0FBcUMsQ0FBQztBQUVqRSxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sK0NBQStDLENBQUM7QUFDekUsT0FBTyxFQUFFLG9CQUFvQixFQUFtQixNQUFNLHNEQUFzRCxDQUFDO0FBQzdHLE9BQU8sRUFBc0IsZUFBZSxFQUFFLE1BQU0sa0RBQWtELENBQUM7QUFDdkcsT0FBTyxFQUFFLGFBQWEsRUFBRSxNQUFNLGdEQUFnRCxDQUFDO0FBQy9FLE9BQU8sRUFBaUQsY0FBYyxFQUFFLFdBQVcsRUFBaUQsTUFBTSwrQkFBK0IsQ0FBQztBQUMxSyxPQUFPLEVBQUUsZ0JBQWdCLEVBQUUsd0JBQXdCLEVBQUUsbUJBQW1CLEVBQUUsTUFBTSxzREFBc0QsQ0FBQztBQUN2SSxPQUFPLEVBQTBDLFVBQVUsSUFBSSxjQUFjLEVBQXlDLHNCQUFzQixFQUFFLE1BQU0sdUJBQXVCLENBQUM7QUFDNUssT0FBTyxFQUFFLGNBQWMsRUFBRSxNQUFNLHVEQUF1RCxDQUFDO0FBQ3ZGLE9BQU8sRUFBRSxpQkFBaUIsRUFBRSxNQUFNLGdEQUFnRCxDQUFDO0FBQ25GLE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSxrQ0FBa0MsQ0FBQztBQUMzRCxPQUFPLEVBQUUsWUFBWSxFQUFFLE1BQU0sZ0RBQWdELENBQUM7QUFDOUUsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLGlCQUFpQixDQUFDO0FBRzNDLE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSxpQ0FBaUMsQ0FBQztBQUMxRCxPQUFPLEVBQUUsYUFBYSxFQUFFLE1BQU0sNkNBQTZDLENBQUM7QUFFNUUsT0FBTyxFQUFFLG1CQUFtQixFQUFFLE1BQU0sc0RBQXNELENBQUM7QUFDM0YsT0FBTyxFQUFFLGNBQWMsRUFBRSxNQUFNLCtDQUErQyxDQUFDO0FBQy9FLE9BQU8sRUFBRSxtQkFBbUIsRUFBRSxNQUFNLHFEQUFxRCxDQUFDO0FBRTFGLE1BQU0sT0FBTyx1QkFBdUI7SUFFbkMsSUFBSSxLQUFLO1FBQ1IsT0FBTyxJQUFJLENBQUMsTUFBTSxDQUFDO0lBQ3BCLENBQUM7SUFFRCxJQUFJLEtBQUssQ0FBQyxLQUF5QztRQUNsRCxJQUFJLENBQUMsTUFBTSxHQUFHLEtBQUssQ0FBQztRQUNwQixJQUFJLENBQUMsaUJBQWlCLENBQUMsSUFBSSxDQUFDLEtBQUssQ0FBQyxDQUFDO0lBQ3BDLENBQUM7SUFHRCxJQUFJLGdCQUFnQixLQUFnRCxPQUFPLElBQUksQ0FBQyxpQkFBaUIsQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDO0lBSTFHLElBQUksS0FBSztRQUNSLE9BQU8sSUFBSSxDQUFDLE1BQU0sQ0FBQztJQUNwQixDQUFDO0lBRUQsSUFBSSxLQUFLLENBQUMsS0FBeUI7UUFDbEMsSUFBSSxDQUFDLE1BQU0sR0FBRyxLQUFLLENBQUM7UUFDcEIsSUFBSSxDQUFDLGlCQUFpQixDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLENBQUM7SUFDMUMsQ0FBQztJQUlELElBQUksWUFBWTtRQUNmLE9BQU8sSUFBSSxDQUFDLGFBQWEsQ0FBQztJQUMzQixDQUFDO0lBRUQsSUFBSSxZQUFZLENBQUMsT0FBMkI7UUFDM0MsSUFBSSxDQUFDLGFBQWEsR0FBRyxPQUFPLENBQUM7SUFDOUIsQ0FBQztJQU9ELElBQVcsUUFBUTtRQUNsQixPQUFPLElBQUksQ0FBQyxTQUFTLENBQUM7SUFDdkIsQ0FBQztJQUVELElBQVcsUUFBUSxDQUFDLFdBQXlEO1FBQzVFLElBQUksQ0FBQyxTQUFTLEdBQUcsV0FBVyxDQUFDO1FBQzdCLElBQUksQ0FBQyxvQkFBb0IsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLFNBQVMsQ0FBQyxDQUFDO0lBQ2hELENBQUM7SUFHRCxJQUFJLG1CQUFtQixLQUFzRCxPQUFPLElBQUksQ0FBQyxvQkFBb0IsQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDO0lBRXRILElBQUksS0FBSyxDQUFDLEtBQW9CO1FBQzdCLElBQUksQ0FBQyxNQUFNLEdBQUcsS0FBSyxDQUFDO0lBQ3JCLENBQUM7SUFFRCxJQUFJLEtBQUs7UUFDUixPQUFPLElBQUksQ0FBQyxNQUFNLENBQUM7SUFDcEIsQ0FBQztJQUdELElBQUksbUJBQW1CLEtBQXFCLE9BQU8sSUFBSSxDQUFDLG9CQUFvQixDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUM7SUFDckYsSUFBSSxRQUFRLENBQUMsS0FBbUQ7UUFDL0QsSUFBSSxDQUFDLFNBQVMsR0FBRyxLQUFLLENBQUM7UUFDdkIsSUFBSSxDQUFDLG9CQUFvQixDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLFNBQVMsQ0FBQyxDQUFDO0lBQ2xELENBQUM7SUFFRCxJQUFJLFFBQVE7UUFDWCxPQUFPLElBQUksQ0FBQyxTQUFTLENBQUM7SUFDdkIsQ0FBQztJQUdELElBQUksZ0JBQWdCO1FBQ25CLE9BQU8sSUFBSSxDQUFDLGlCQUFpQixDQUFDO0lBQy9CLENBQUM7SUFFRCxJQUFJLGdCQUFnQixDQUFDLFFBQTZEO1FBQ2pGLElBQUksSUFBSSxDQUFDLHVCQUF1QixLQUFLLFNBQVMsRUFBRSxDQUFDO1lBQ2hELElBQUksQ0FBQyx1QkFBdUIsR0FBRyxRQUFRLENBQUM7UUFDekMsQ0FBQztRQUVELElBQUksUUFBUSxLQUFLLElBQUksQ0FBQyxpQkFBaUIsRUFBRSxDQUFDO1lBQ3pDLElBQUksQ0FBQyxpQkFBaUIsR0FBRyxRQUFRLENBQUM7WUFDbEMsSUFBSSxDQUFDLDRCQUE0QixDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsaUJBQWlCLENBQUMsQ0FBQztRQUNoRSxDQUFDO0lBQ0YsQ0FBQztJQUdELElBQUksdUJBQXVCO1FBQzFCLE9BQU8sSUFBSSxDQUFDLHdCQUF3QixDQUFDO0lBQ3RDLENBQUM7SUFFRCxJQUFZLHVCQUF1QixDQUFDLHVCQUE0RTtRQUMvRyxJQUFJLENBQUMsd0JBQXdCLEdBQUcsdUJBQXVCLENBQUM7UUFDeEQsSUFBSSxDQUFDLG1DQUFtQyxDQUFDLElBQUksQ0FBQyx1QkFBdUIsQ0FBQyxDQUFDO0lBQ3hFLENBQUM7SUFTRCxJQUFJLFVBQVU7UUFDYixPQUFPLElBQUksQ0FBQyxXQUFXLENBQUM7SUFDekIsQ0FBQztJQUVELHVCQUF1QjtRQUN0QixPQUFPLElBQUksQ0FBQyxNQUFNLEtBQUssU0FBUyxJQUFJLEtBQUssQ0FBQyxRQUFRLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxDQUFDO0lBQ2pFLENBQUM7SUFHRCxJQUFJLEtBQUs7UUFDUixPQUFPLElBQUksQ0FBQyxNQUFNLENBQUM7SUFDcEIsQ0FBQztJQUVELElBQUksS0FBSyxDQUFDLFFBQWtEO1FBQzNELElBQUksQ0FBQyxNQUFNLEdBQUcsUUFBUSxDQUFDO1FBQ3ZCLElBQUksQ0FBQyxpQkFBaUIsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxDQUFDO0lBQzFDLENBQUM7SUFJRCxJQUFJLGFBQWE7UUFDaEIsT0FBTyxJQUFJLENBQUMsY0FBYyxDQUFDO0lBQzVCLENBQUM7SUFFRCxJQUFJLGFBQWEsQ0FBQyxLQUF1RDtRQUN4RSxJQUFJLENBQUMsY0FBYyxHQUFHLEtBQUssQ0FBQztRQUM1QixJQUFJLENBQUMseUJBQXlCLENBQUMsSUFBSSxDQUFDLEtBQUssQ0FBQyxDQUFDO0lBQzVDLENBQUM7SUFLRCxJQUFXLFVBQVU7UUFDcEIsT0FBTyxJQUFJLENBQUMsV0FBVyxDQUFDO0lBQ3pCLENBQUM7SUFLRCxZQUNRLG1CQUEyQixFQUMzQixnQkFBd0IsRUFDeEIsV0FBbUIsRUFDbkIsUUFBZ0IsRUFDaEIsUUFBZ0IsRUFDZixNQUFxQixFQUM3QixRQUF5QyxFQUNqQyxTQUF1RCxFQUN2RCxXQUFvQixFQUNyQixRQUFpQjtRQVRqQix3QkFBbUIsR0FBbkIsbUJBQW1CLENBQVE7UUFDM0IscUJBQWdCLEdBQWhCLGdCQUFnQixDQUFRO1FBQ3hCLGdCQUFXLEdBQVgsV0FBVyxDQUFRO1FBQ25CLGFBQVEsR0FBUixRQUFRLENBQVE7UUFDaEIsYUFBUSxHQUFSLFFBQVEsQ0FBUTtRQUNmLFdBQU0sR0FBTixNQUFNLENBQWU7UUFFckIsY0FBUyxHQUFULFNBQVMsQ0FBOEM7UUFDdkQsZ0JBQVcsR0FBWCxXQUFXLENBQVM7UUFDckIsYUFBUSxHQUFSLFFBQVEsQ0FBUztRQTlJUixzQkFBaUIsR0FBRyxJQUFJLE9BQU8sRUFBc0MsQ0FBQztRQXdCdEUsc0JBQWlCLEdBQUcsSUFBSSxPQUFPLEVBQXNCLENBQUM7UUFDOUQscUJBQWdCLEdBQThCLElBQUksQ0FBQyxpQkFBaUIsQ0FBQyxLQUFLLENBQUM7UUFhbkUseUJBQW9CLEdBQUcsSUFBSSxPQUFPLEVBQTRDLENBQUM7UUFXL0UseUJBQW9CLEdBQUcsSUFBSSxPQUFPLEVBQVcsQ0FBQztRQVd2RCxzQkFBaUIsR0FBd0QsU0FBUyxDQUFDLDZCQUE2QixDQUFDLFNBQVMsQ0FBQztRQTBCbEgsaUNBQTRCLEdBQUcsSUFBSSxPQUFPLEVBQXVELENBQUM7UUFDNUcsZ0NBQTJCLEdBQUcsSUFBSSxDQUFDLDRCQUE0QixDQUFDLEtBQUssQ0FBQztRQUM1RCx3Q0FBbUMsR0FBRyxJQUFJLE9BQU8sRUFBdUQsQ0FBQztRQUNuSCx1Q0FBa0MsR0FBRyxJQUFJLENBQUMsbUNBQW1DLENBQUMsS0FBSyxDQUFDO1FBaUMxRSw4QkFBeUIsR0FBRyxJQUFJLE9BQU8sRUFBb0QsQ0FBQztRQUNwRyw2QkFBd0IsR0FBNEQsSUFBSSxDQUFDLHlCQUF5QixDQUFDLEtBQUssQ0FBQztRQU1qSCxzQkFBaUIsR0FBRyxJQUFJLE9BQU8sRUFBNEMsQ0FBQztRQUN0RixxQkFBZ0IsR0FBRyxJQUFJLENBQUMsaUJBQWlCLENBQUMsS0FBSyxDQUFDO1FBY3RELElBQUksQ0FBQyxXQUFXLEdBQUcsS0FBSyxDQUFDO1FBQ3pCLElBQUksV0FBVyxFQUFFLENBQUM7WUFDakIsSUFBSSxDQUFDLFFBQVEsR0FBRyxFQUFFLENBQUM7UUFDcEIsQ0FBQzthQUFNLElBQUksUUFBUSxFQUFFLENBQUM7WUFDckIsSUFBSSxDQUFDLFNBQVMsR0FBRyxRQUFRLENBQUM7UUFDM0IsQ0FBQztJQUNGLENBQUM7SUFFRCxXQUFXLENBQUMsT0FBZ0M7UUFDM0MsTUFBTSxRQUFRLEdBQUcsQ0FBQyxLQUFpQyxFQUFXLEVBQUUsQ0FDL0QsTUFBTSxDQUFDLFNBQVMsQ0FBQyxjQUFjLENBQUMsSUFBSSxDQUFDLE9BQU8sRUFBRSxLQUFLLENBQUMsQ0FBQztRQUV0RCxJQUFJLFFBQVEsQ0FBQyxPQUFPLENBQUMsRUFBRSxDQUFDO1lBQUMsSUFBSSxDQUFDLE1BQU0sR0FBRyxPQUFPLENBQUMsS0FBTSxDQUFDO1FBQUMsQ0FBQztRQUN4RCxJQUFJLFFBQVEsQ0FBQyxPQUFPLENBQUMsRUFBRSxDQUFDO1lBQUMsSUFBSSxDQUFDLE1BQU0sR0FBRyxPQUFPLENBQUMsS0FBSyxDQUFDO1FBQUMsQ0FBQztRQUN2RCxJQUFJLFFBQVEsQ0FBQyxjQUFjLENBQUMsRUFBRSxDQUFDO1lBQUMsSUFBSSxDQUFDLGFBQWEsR0FBRyxPQUFPLENBQUMsWUFBWSxLQUFLLElBQUksQ0FBQyxDQUFDLENBQUMsU0FBUyxDQUFDLENBQUMsQ0FBQyxPQUFPLENBQUMsWUFBWSxDQUFDO1FBQUMsQ0FBQztRQUN4SCxJQUFJLFFBQVEsQ0FBQyxVQUFVLENBQUMsRUFBRSxDQUFDO1lBQUMsSUFBSSxDQUFDLFFBQVEsR0FBRyxPQUFPLENBQUMsUUFBUSxDQUFDO1FBQUMsQ0FBQztRQUMvRCxJQUFJLFFBQVEsQ0FBQyxlQUFlLENBQUMsRUFBRSxDQUFDO1lBQUMsSUFBSSxDQUFDLGdCQUFnQixHQUFHLE9BQU8sQ0FBQyxhQUFhLENBQUM7UUFBQyxDQUFDO1FBQ2pGLElBQUksUUFBUSxDQUFDLFVBQVUsQ0FBQyxFQUFFLENBQUM7WUFBQyxJQUFJLENBQUMsUUFBUSxHQUFHLE9BQU8sQ0FBQyxRQUFTLENBQUM7UUFBQyxDQUFDO1FBQ2hFLElBQUksUUFBUSxDQUFDLE9BQU8sQ0FBQyxFQUFFLENBQUM7WUFBQyxJQUFJLENBQUMsS0FBSyxHQUFHLE9BQU8sQ0FBQyxLQUFNLENBQUM7UUFBQyxDQUFDO1FBQ3ZELElBQUksUUFBUSxDQUFDLGVBQWUsQ0FBQyxFQUFFLENBQUM7WUFBQyxJQUFJLENBQUMsYUFBYSxHQUFHLE9BQU8sQ0FBQyxhQUFjLENBQUM7UUFBQyxDQUFDO1FBQy9FLElBQUksUUFBUSxDQUFDLFlBQVksQ0FBQyxFQUFFLENBQUM7WUFBQyxJQUFJLENBQUMsV0FBVyxHQUFHLE9BQU8sQ0FBQyxVQUFXLENBQUM7UUFBQyxDQUFDO0lBQ3hFLENBQUM7SUFFRCxXQUFXO1FBQ1YsT0FBTyxDQUFDLENBQUMsSUFBSSxDQUFDLFFBQVEsSUFBSSxJQUFJLENBQUMsUUFBUSxDQUFDLE1BQU0sR0FBRyxDQUFDLENBQUM7SUFDcEQsQ0FBQztJQUVELE9BQU87UUFDTixJQUFJLENBQUMsV0FBVyxHQUFHLElBQUksQ0FBQztRQUN4QixJQUFJLENBQUMsNEJBQTRCLENBQUMsT0FBTyxFQUFFLENBQUM7UUFDNUMsSUFBSSxDQUFDLG1DQUFtQyxDQUFDLE9BQU8sRUFBRSxDQUFDO1FBQ25ELElBQUksQ0FBQyxvQkFBb0IsQ0FBQyxPQUFPLEVBQUUsQ0FBQztRQUNwQyxJQUFJLENBQUMsaUJBQWlCLENBQUMsT0FBTyxFQUFFLENBQUM7UUFDakMsSUFBSSxDQUFDLGlCQUFpQixDQUFDLE9BQU8sRUFBRSxDQUFDO1FBQ2pDLElBQUksQ0FBQyxvQkFBb0IsQ0FBQyxPQUFPLEVBQUUsQ0FBQztRQUNwQyxJQUFJLENBQUMsaUJBQWlCLENBQUMsT0FBTyxFQUFFLENBQUM7UUFDakMsSUFBSSxDQUFDLHlCQUF5QixDQUFDLE9BQU8sRUFBRSxDQUFDO0lBQzFDLENBQUM7SUFFRCxNQUFNO1FBQ0wsT0FBTztZQUNOLElBQUksb0NBQTRCO1lBQ2hDLG9CQUFvQixFQUFFLElBQUksQ0FBQyxnQkFBZ0I7WUFDM0MsbUJBQW1CLEVBQUUsSUFBSSxDQUFDLG1CQUFtQjtTQUM3QyxDQUFDO0lBQ0gsQ0FBQztDQUNEO0FBRUQsTUFBTSwyQkFBMkI7SUFFaEMsWUFBNEIsTUFBb0Q7UUFBcEQsV0FBTSxHQUFOLE1BQU0sQ0FBOEM7UUFEaEUsb0JBQWUsR0FBb0IsSUFBSSxlQUFlLEVBQUUsQ0FBQztJQUNXLENBQUM7SUFDckYsT0FBTztRQUNOLElBQUksQ0FBQyxlQUFlLENBQUMsT0FBTyxFQUFFLENBQUM7SUFDaEMsQ0FBQztDQUNEO0FBRUQsTUFBTSxPQUFPLDJCQUE0QixTQUFRLFVBQVU7SUFDMUQsSUFBSSxNQUFNO1FBQ1QsT0FBTyxJQUFJLENBQUMsT0FBTyxDQUFDO0lBQ3JCLENBQUM7SUFFRCxJQUFJLEVBQUU7UUFDTCxPQUFPLElBQUksQ0FBQyxHQUFHLENBQUM7SUFDakIsQ0FBQztJQUVELElBQUksWUFBWTtRQUNmLE9BQU8sSUFBSSxDQUFDLEdBQUcsQ0FBQztJQUNqQixDQUFDO0lBRUQsSUFBSSxLQUFLO1FBQ1IsT0FBTyxJQUFJLENBQUMsTUFBTSxDQUFDO0lBQ3BCLENBQUM7SUFFRCxJQUFJLEtBQUs7UUFDUixPQUFPLElBQUksQ0FBQyxNQUFNLENBQUM7SUFDcEIsQ0FBQztJQUlELElBQUksU0FBUztRQUNaLE9BQU8sSUFBSSxDQUFDLFVBQVUsQ0FBQztJQUN4QixDQUFDO0lBRUQsSUFBSSxTQUFTLENBQUMsU0FBa0Q7UUFDL0QsSUFBSSxDQUFDLFVBQVUsR0FBRyxTQUFTLENBQUM7SUFDN0IsQ0FBQztJQUVELElBQUksT0FBTztRQUNWLE9BQU8sSUFBSSxDQUFDLFNBQVMsQ0FBQyxPQUFPLENBQUM7SUFDL0IsQ0FBQztJQUtELElBQUksUUFBUTtRQUNYLE9BQU8sSUFBSSxDQUFDLFNBQVMsQ0FBQztJQUN2QixDQUFDO0lBRUQsSUFBSSxLQUFLO1FBQ1IsT0FBTyxJQUFJLENBQUMsR0FBRyxDQUFDO0lBQ2pCLENBQUM7SUFFRCxZQUNrQixNQUE0QixFQUM1QixlQUFnQyxFQUNoQyxPQUFlLEVBQ2YsU0FBaUIsRUFDakIsR0FBVyxFQUNYLE1BQWMsRUFDdkIsU0FBa0M7UUFFMUMsS0FBSyxFQUFFLENBQUM7UUFSUyxXQUFNLEdBQU4sTUFBTSxDQUFzQjtRQUM1QixvQkFBZSxHQUFmLGVBQWUsQ0FBaUI7UUFDaEMsWUFBTyxHQUFQLE9BQU8sQ0FBUTtRQUNmLGNBQVMsR0FBVCxTQUFTLENBQVE7UUFDakIsUUFBRyxHQUFILEdBQUcsQ0FBUTtRQUNYLFdBQU0sR0FBTixNQUFNLENBQVE7UUFDdkIsY0FBUyxHQUFULFNBQVMsQ0FBeUI7UUFsQjFCLGFBQVEsR0FBdUQsSUFBSSxDQUFDLFNBQVMsQ0FBQyxJQUFJLGFBQWEsRUFBdUMsQ0FBQyxDQUFDO0lBcUJ6SixDQUFDO0lBRUQsSUFBSSxhQUFhO1FBQ2hCLE9BQU8sSUFBSSxDQUFDLGNBQWMsQ0FBQztJQUM1QixDQUFDO0lBR0QsS0FBSyxDQUFDLHlCQUF5QixDQUFDLFdBQXlGO1FBQ3hILElBQUksQ0FBQyxjQUFjLEdBQUcsV0FBVyxDQUFDO1FBQ2xDLE9BQU8sSUFBSSxDQUFDLE1BQU0sQ0FBQyxpQkFBaUIsQ0FBQyxJQUFJLENBQUMsT0FBTyxFQUFFLFdBQVcsQ0FBQyxDQUFDLENBQUMsRUFBRSxtQkFBbUIsRUFBRSxXQUFXLENBQUMsTUFBTSxDQUFDLG1CQUFtQixFQUFFLGdCQUFnQixFQUFFLFdBQVcsQ0FBQyxPQUFPLEVBQUUsZ0JBQWdCLEVBQUUsQ0FBQyxDQUFDLENBQUMsU0FBUyxDQUFDLENBQUM7SUFDeE0sQ0FBQztJQUVELGNBQWMsQ0FBQyxRQUFpQztRQUMvQyxJQUFJLENBQUMsU0FBUyxHQUFHLFFBQVEsQ0FBQztJQUMzQixDQUFDO0lBRUQsbUJBQW1CLENBQUMsV0FBbUIsRUFDdEMsbUJBQTJCLEVBQzNCLFFBQWdCLEVBQ2hCLFFBQXVCLEVBQ3ZCLEtBQXNDLEVBQ3RDLFFBQTZCLEVBQzdCLFVBQW1CLEVBQ25CLFFBQWlCO1FBRWpCLE1BQU0sTUFBTSxHQUFHLElBQUksdUJBQXVCLENBQ3pDLG1CQUFtQixFQUNuQixJQUFJLENBQUMsTUFBTSxFQUNYLFdBQVcsRUFDWCxRQUFRLEVBQ1IsR0FBRyxDQUFDLE1BQU0sQ0FBQyxRQUFRLENBQUMsQ0FBQyxRQUFRLEVBQUUsRUFDL0IsS0FBSyxFQUNMLFFBQVEsRUFDUixJQUFJLEVBQ0osVUFBVSxFQUNWLFFBQVEsQ0FDUixDQUFDO1FBRUYsTUFBTSxvQkFBb0IsR0FBRyxJQUFJLDJCQUEyQixDQUFDLE1BQU0sQ0FBQyxDQUFDO1FBQ3JFLElBQUksQ0FBQyxRQUFRLENBQUMsR0FBRyxDQUFDLG1CQUFtQixFQUFFLG9CQUFvQixDQUFDLENBQUM7UUFDN0Qsb0JBQW9CLENBQUMsZUFBZSxDQUFDLEdBQUcsQ0FBQyxNQUFNLENBQUMsMkJBQTJCLENBQUMsR0FBRyxFQUFFO1lBQ2hGLElBQUksQ0FBQyxLQUFLLENBQUMsb0JBQW9CLENBQUMsSUFBSSxDQUFDLE1BQU0sRUFBRSxNQUFNLENBQUMsbUJBQW1CLEVBQUUsRUFBRSxhQUFhLEVBQUUsTUFBTSxDQUFDLGdCQUFnQixFQUFFLENBQUMsQ0FBQztRQUN0SCxDQUFDLENBQUMsQ0FBQyxDQUFDO1FBR0osSUFBSSxNQUFNLENBQUMsdUJBQXVCLEVBQUUsRUFBRSxDQUFDO1lBQ3RDLElBQUksQ0FBQyxlQUFlLENBQUMsY0FBYyxDQUFDLElBQUksQ0FBQyxTQUFTLEVBQUU7Z0JBQ25ELEtBQUssRUFBRSxDQUFDLE1BQU0sQ0FBQztnQkFDZixPQUFPLEVBQUUsRUFBRTtnQkFDWCxPQUFPLEVBQUUsRUFBRTtnQkFDWCxPQUFPLEVBQUUsRUFBRTthQUNYLENBQUMsQ0FBQztRQUNKLENBQUM7YUFBTSxDQUFDO1lBQ1AsSUFBSSxDQUFDLGVBQWUsQ0FBQyxzQkFBc0IsQ0FBQyxJQUFJLENBQUMsU0FBUyxFQUFFO2dCQUMzRCxLQUFLLEVBQUUsQ0FBQyxNQUE2QyxDQUFDO2dCQUN0RCxPQUFPLEVBQUUsRUFBRTtnQkFDWCxPQUFPLEVBQUUsRUFBRTtnQkFDWCxPQUFPLEVBQUUsRUFBRTthQUNYLENBQUMsQ0FBQztRQUNKLENBQUM7UUFFRCxPQUFPLE1BQU0sQ0FBQztJQUNmLENBQUM7SUFFRCxtQkFBbUIsQ0FBQyxtQkFBMkIsRUFDOUMsUUFBZ0IsRUFDaEIsUUFBdUIsRUFDdkIsT0FBNkI7UUFDN0IsTUFBTSxNQUFNLEdBQUcsSUFBSSxDQUFDLGNBQWMsQ0FBQyxtQkFBbUIsQ0FBQyxDQUFDO1FBQ3hELE1BQU0sQ0FBQyxXQUFXLENBQUMsT0FBTyxDQUFDLENBQUM7UUFFNUIsSUFBSSxNQUFNLENBQUMsdUJBQXVCLEVBQUUsRUFBRSxDQUFDO1lBQ3RDLElBQUksQ0FBQyxlQUFlLENBQUMsY0FBYyxDQUFDLElBQUksQ0FBQyxTQUFTLEVBQUU7Z0JBQ25ELEtBQUssRUFBRSxFQUFFO2dCQUNULE9BQU8sRUFBRSxFQUFFO2dCQUNYLE9BQU8sRUFBRSxDQUFDLE1BQU0sQ0FBQztnQkFDakIsT0FBTyxFQUFFLEVBQUU7YUFDWCxDQUFDLENBQUM7UUFDSixDQUFDO2FBQU0sQ0FBQztZQUNQLElBQUksQ0FBQyxlQUFlLENBQUMsc0JBQXNCLENBQUMsSUFBSSxDQUFDLFNBQVMsRUFBRTtnQkFDM0QsS0FBSyxFQUFFLEVBQUU7Z0JBQ1QsT0FBTyxFQUFFLEVBQUU7Z0JBQ1gsT0FBTyxFQUFFLENBQUMsTUFBNkMsQ0FBQztnQkFDeEQsT0FBTyxFQUFFLEVBQUU7YUFDWCxDQUFDLENBQUM7UUFDSixDQUFDO0lBRUYsQ0FBQztJQUVELG1CQUFtQixDQUFDLG1CQUEyQjtRQUM5QyxNQUFNLE1BQU0sR0FBRyxJQUFJLENBQUMsY0FBYyxDQUFDLG1CQUFtQixDQUFDLENBQUM7UUFDeEQsSUFBSSxDQUFDLFFBQVEsQ0FBQyxnQkFBZ0IsQ0FBQyxtQkFBbUIsQ0FBQyxDQUFDO1FBQ3BELE1BQU0sQ0FBQyxPQUFPLEVBQUUsQ0FBQztRQUVqQixJQUFJLE1BQU0sQ0FBQyx1QkFBdUIsRUFBRSxFQUFFLENBQUM7WUFDdEMsSUFBSSxDQUFDLGVBQWUsQ0FBQyxjQUFjLENBQUMsSUFBSSxDQUFDLFNBQVMsRUFBRTtnQkFDbkQsS0FBSyxFQUFFLEVBQUU7Z0JBQ1QsT0FBTyxFQUFFLENBQUMsTUFBTSxDQUFDO2dCQUNqQixPQUFPLEVBQUUsRUFBRTtnQkFDWCxPQUFPLEVBQUUsRUFBRTthQUNYLENBQUMsQ0FBQztRQUNKLENBQUM7YUFBTSxDQUFDO1lBQ1AsSUFBSSxDQUFDLGVBQWUsQ0FBQyxzQkFBc0IsQ0FBQyxJQUFJLENBQUMsU0FBUyxFQUFFO2dCQUMzRCxLQUFLLEVBQUUsRUFBRTtnQkFDVCxPQUFPLEVBQUUsQ0FBQyxNQUE2QyxDQUFDO2dCQUN4RCxPQUFPLEVBQUUsRUFBRTtnQkFDWCxPQUFPLEVBQUUsRUFBRTthQUNYLENBQUMsQ0FBQztRQUNKLENBQUM7SUFDRixDQUFDO0lBRUQsdUJBQXVCLENBQUMsZUFBdUI7UUFDOUMsS0FBSyxNQUFNLEVBQUUsTUFBTSxFQUFFLElBQUksSUFBSSxDQUFDLFFBQVEsQ0FBQyxNQUFNLEVBQUUsRUFBRSxDQUFDO1lBQ2pELElBQUksTUFBTSxDQUFDLFFBQVEsS0FBSyxlQUFlLEVBQUUsQ0FBQztnQkFDekMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxvQkFBb0IsQ0FBQyxJQUFJLENBQUMsT0FBTyxFQUFFLE1BQU0sQ0FBQyxtQkFBbUIsQ0FBQyxDQUFDO1lBQzVFLENBQUM7UUFDRixDQUFDO0lBQ0YsQ0FBQztJQUVELFdBQVcsQ0FBQyxLQUFhO1FBQ3hCLE1BQU0sTUFBTSxHQUFHLElBQUksQ0FBQywwQkFBMEIsQ0FBQztRQUUvQyxJQUFJLE1BQU0sSUFBSSxNQUFNLENBQUMsS0FBSyxFQUFFLENBQUM7WUFDNUIsTUFBTSxZQUFZLEdBQUcsTUFBTSxDQUFDLEtBQUssQ0FBQztZQUNsQyxZQUFZLENBQUMsS0FBSyxHQUFHLEtBQUssQ0FBQztZQUMzQixNQUFNLENBQUMsS0FBSyxHQUFHLFlBQVksQ0FBQztRQUM3QixDQUFDO0lBQ0YsQ0FBQztJQUVELHNCQUFzQixDQUFDLGFBQXFEO1FBQzNFLElBQUksQ0FBQyxlQUFlLENBQUMsc0JBQXNCLENBQUMsSUFBSSxDQUFDLFNBQVMsRUFBRSxhQUFhLENBQUMsQ0FBQztJQUM1RSxDQUFDO0lBRU8sY0FBYyxDQUFDLG1CQUEyQjtRQUNqRCxNQUFNLE1BQU0sR0FBRyxJQUFJLENBQUMsUUFBUSxDQUFDLEdBQUcsQ0FBQyxtQkFBbUIsQ0FBQyxDQUFDO1FBQ3RELElBQUksQ0FBQyxNQUFNLEVBQUUsQ0FBQztZQUNiLE1BQU0sSUFBSSxLQUFLLENBQUMsZ0JBQWdCLENBQUMsQ0FBQztRQUNuQyxDQUFDO1FBQ0QsT0FBTyxNQUFNLENBQUMsTUFBTSxDQUFDO0lBQ3RCLENBQUM7SUFFRCxLQUFLLENBQUMsbUJBQW1CLENBQUMsUUFBYSxFQUFFLEtBQXdCO1FBQ2hFLElBQUksUUFBUSxDQUFDLE1BQU0sS0FBSyxPQUFPLENBQUMsa0JBQWtCLEVBQUUsQ0FBQztZQUNwRCxPQUFPO2dCQUNOLFdBQVcsRUFBRSxJQUFJLENBQUMsU0FBUztnQkFDM0IsS0FBSyxFQUFFLElBQUksQ0FBQyxLQUFLO2dCQUNqQixPQUFPLEVBQUUsRUFBRTtnQkFDWCxnQkFBZ0IsRUFBRTtvQkFDakIsUUFBUSxFQUFFLFFBQVE7b0JBQ2xCLE1BQU0sRUFBRSxFQUFFO29CQUNWLFlBQVksRUFBRSxLQUFLO2lCQUNuQjthQUNELENBQUM7UUFDSCxDQUFDO1FBRUQsTUFBTSxHQUFHLEdBQXNDLEVBQUUsQ0FBQztRQUNsRCxLQUFLLE1BQU0sTUFBTSxJQUFJLENBQUMsR0FBRyxJQUFJLENBQUMsUUFBUSxDQUFDLElBQUksRUFBRSxDQUFDLEVBQUUsQ0FBQztZQUNoRCxNQUFNLGFBQWEsR0FBRyxJQUFJLENBQUMsUUFBUSxDQUFDLEdBQUcsQ0FBQyxNQUFNLENBQUUsQ0FBQztZQUNqRCxJQUFJLGFBQWEsQ0FBQyxNQUFNLENBQUMsUUFBUSxLQUFLLFFBQVEsQ0FBQyxRQUFRLEVBQUUsRUFBRSxDQUFDO2dCQUMzRCxJQUFJLGFBQWEsQ0FBQyxNQUFNLENBQUMsdUJBQXVCLEVBQUUsRUFBRSxDQUFDO29CQUNwRCxHQUFHLENBQUMsSUFBSSxDQUFDLGFBQWEsQ0FBQyxNQUFNLENBQUMsQ0FBQztnQkFDaEMsQ0FBQztZQUNGLENBQUM7UUFDRixDQUFDO1FBRUQsTUFBTSxnQkFBZ0IsR0FBRyxNQUFNLElBQUksQ0FBQyxNQUFNLENBQUMsd0JBQXdCLENBQUMsSUFBSSxDQUFDLE1BQU0sRUFBRSxRQUFRLEVBQUUsS0FBSyxDQUFDLENBQUM7UUFFbEcsT0FBTztZQUNOLFdBQVcsRUFBRSxJQUFJLENBQUMsU0FBUztZQUMzQixLQUFLLEVBQUUsSUFBSSxDQUFDLEtBQUs7WUFDakIsT0FBTyxFQUFFLEdBQUc7WUFDWixnQkFBZ0IsRUFBRTtnQkFDakIsUUFBUSxFQUFFLFFBQVE7Z0JBQ2xCLE1BQU0sRUFBRSxnQkFBZ0IsRUFBRSxNQUFNLElBQUksRUFBRTtnQkFDdEMsWUFBWSxFQUFFLENBQUMsQ0FBQyxnQkFBZ0IsRUFBRSxZQUFZO2FBQzlDO1NBQ0QsQ0FBQztJQUNILENBQUM7SUFFRCxLQUFLLENBQUMsbUJBQW1CLENBQUMsUUFBYSxFQUFFLEtBQXdCO1FBQ2hFLElBQUksUUFBUSxDQUFDLE1BQU0sS0FBSyxPQUFPLENBQUMsa0JBQWtCLEVBQUUsQ0FBQztZQUNwRCxPQUFPO2dCQUNOLFdBQVcsRUFBRSxJQUFJLENBQUMsU0FBUztnQkFDM0IsS0FBSyxFQUFFLElBQUksQ0FBQyxLQUFLO2dCQUNqQixPQUFPLEVBQUUsRUFBRTthQUNYLENBQUM7UUFDSCxDQUFDO1FBRUQsTUFBTSxHQUFHLEdBQTBDLEVBQUUsQ0FBQztRQUN0RCxLQUFLLE1BQU0sTUFBTSxJQUFJLENBQUMsR0FBRyxJQUFJLENBQUMsUUFBUSxDQUFDLElBQUksRUFBRSxDQUFDLEVBQUUsQ0FBQztZQUNoRCxNQUFNLGFBQWEsR0FBRyxJQUFJLENBQUMsUUFBUSxDQUFDLEdBQUcsQ0FBQyxNQUFNLENBQUUsQ0FBQztZQUNqRCxJQUFJLGFBQWEsQ0FBQyxNQUFNLENBQUMsUUFBUSxLQUFLLFFBQVEsQ0FBQyxRQUFRLEVBQUUsRUFBRSxDQUFDO2dCQUMzRCxJQUFJLENBQUMsYUFBYSxDQUFDLE1BQU0sQ0FBQyx1QkFBdUIsRUFBRSxFQUFFLENBQUM7b0JBQ3JELEdBQUcsQ0FBQyxJQUFJLENBQUMsYUFBYSxDQUFDLE1BQTZDLENBQUMsQ0FBQztnQkFDdkUsQ0FBQztZQUNGLENBQUM7UUFDRixDQUFDO1FBRUQsT0FBTztZQUNOLFdBQVcsRUFBRSxJQUFJLENBQUMsU0FBUztZQUMzQixLQUFLLEVBQUUsSUFBSSxDQUFDLEtBQUs7WUFDakIsT0FBTyxFQUFFLEdBQUc7U0FDWixDQUFDO0lBQ0gsQ0FBQztJQUVELEtBQUssQ0FBQyxjQUFjLENBQUMsR0FBUSxFQUFFLE1BQStCLEVBQUUsT0FBMEIsRUFBRSxRQUFtQyxFQUFFLEtBQXdCO1FBQ3hKLE9BQU8sSUFBSSxDQUFDLE1BQU0sQ0FBQyxlQUFlLENBQUMsSUFBSSxDQUFDLE9BQU8sRUFBRSxNQUFNLENBQUMsbUJBQW1CLEVBQUUsR0FBRyxFQUFFLE9BQU8sRUFBRSxRQUFRLENBQUMsQ0FBQztJQUN0RyxDQUFDO0lBRUQsY0FBYztRQUNiLE1BQU0sR0FBRyxHQUFtRCxFQUFFLENBQUM7UUFDL0QsS0FBSyxNQUFNLE1BQU0sSUFBSSxDQUFDLEdBQUcsSUFBSSxDQUFDLFFBQVEsQ0FBQyxJQUFJLEVBQUUsQ0FBQyxFQUFFLENBQUM7WUFDaEQsR0FBRyxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsUUFBUSxDQUFDLEdBQUcsQ0FBQyxNQUFNLENBQUUsQ0FBQyxNQUFNLENBQUMsQ0FBQztRQUM3QyxDQUFDO1FBRUQsT0FBTyxHQUFHLENBQUM7SUFDWixDQUFDO0lBRUQsMkJBQTJCLENBQUMsUUFBdUIsRUFBRSxLQUF5QixFQUFFLFFBQWlCO1FBQ2hHLE9BQU8sSUFBSSxDQUFDLE1BQU0sQ0FBQyw0QkFBNEIsQ0FBQyxJQUFJLENBQUMsTUFBTSxFQUFFLFFBQVEsRUFBRSxLQUFLLEVBQUUsUUFBUSxDQUFDLENBQUM7SUFDekYsQ0FBQztJQUVELEtBQUssQ0FBQywyQkFBMkIsQ0FBQyxZQUFvQixFQUFFLEtBQWE7UUFDcEUsTUFBTSxJQUFJLENBQUMsTUFBTSxDQUFDLDRCQUE0QixDQUFDLElBQUksQ0FBQyxNQUFNLEVBQUUsWUFBWSxFQUFFLEtBQUssQ0FBQyxDQUFDO0lBQ2xGLENBQUM7SUFFRCxNQUFNO1FBQ0wsT0FBTztZQUNOLElBQUksd0NBQWdDO1lBQ3BDLE1BQU0sRUFBRSxJQUFJLENBQUMsTUFBTTtTQUNuQixDQUFDO0lBQ0gsQ0FBQztDQUNEO0FBR0QsTUFBTSxnQkFBZ0IsR0FBRyxZQUFZLENBQUMsb0JBQW9CLEVBQUUsT0FBTyxDQUFDLGlCQUFpQixFQUFFLFFBQVEsQ0FBQyxrQkFBa0IsRUFBRSxpQ0FBaUMsQ0FBQyxDQUFDLENBQUM7QUFHakosSUFBTSxrQkFBa0IsR0FBeEIsTUFBTSxrQkFBbUIsU0FBUSxVQUFVO0lBYWpELFlBQ0MsY0FBK0IsRUFDZCxlQUFpRCxFQUNuRCxhQUE2QyxFQUNwQyxzQkFBK0QsRUFDbEUsbUJBQXlELEVBQzlELGNBQStDO1FBRS9ELEtBQUssRUFBRSxDQUFDO1FBTjBCLG9CQUFlLEdBQWYsZUFBZSxDQUFpQjtRQUNsQyxrQkFBYSxHQUFiLGFBQWEsQ0FBZTtRQUNuQiwyQkFBc0IsR0FBdEIsc0JBQXNCLENBQXdCO1FBQ2pELHdCQUFtQixHQUFuQixtQkFBbUIsQ0FBcUI7UUFDN0MsbUJBQWMsR0FBZCxjQUFjLENBQWdCO1FBaEJ4RCxjQUFTLEdBQUcsSUFBSSxHQUFHLEVBQWtCLENBQUM7UUFDdEMsd0JBQW1CLEdBQUcsSUFBSSxHQUFHLEVBQXVDLENBQUM7UUFHNUQsMkNBQXNDLEdBQUcsSUFBSSxDQUFDLFNBQVMsQ0FBQyxJQUFJLGVBQWUsRUFBRSxDQUFDLENBQUM7UUFFL0Usc0JBQWlCLEdBQW1DLElBQUksQ0FBQyxTQUFTLENBQUMsSUFBSSxpQkFBaUIsRUFBRSxDQUFDLENBQUM7UUFDNUYsK0JBQTBCLEdBQW1DLElBQUksQ0FBQyxTQUFTLENBQUMsSUFBSSxpQkFBaUIsRUFBRSxDQUFDLENBQUM7UUFDckcsdUNBQWtDLEdBQW1DLElBQUksQ0FBQyxTQUFTLENBQUMsSUFBSSxpQkFBaUIsRUFBRSxDQUFDLENBQUM7UUFXN0gsSUFBSSxDQUFDLE1BQU0sR0FBRyxjQUFjLENBQUMsUUFBUSxDQUFDLGNBQWMsQ0FBQyxlQUFlLENBQUMsQ0FBQztRQUN0RSxJQUFJLENBQUMsZUFBZSxDQUFDLDJCQUEyQixFQUFFLENBQUM7UUFFbkQsSUFBSSxDQUFDLFNBQVMsQ0FBQyxJQUFJLENBQUMsZUFBZSxDQUFDLHFDQUFxQyxDQUFDLEtBQUssRUFBQyxNQUFNLEVBQUMsRUFBRTtZQUN4RixNQUFNLE1BQU0sR0FBSSxNQUF1RCxDQUFDLGdCQUFnQixDQUFDO1lBQ3pGLE1BQU0sVUFBVSxHQUFHLElBQUksQ0FBQyxtQkFBbUIsQ0FBQyxHQUFHLENBQUMsTUFBTSxDQUFDLENBQUM7WUFFeEQsSUFBSSxDQUFDLFVBQVUsRUFBRSxDQUFDO2dCQUNqQixPQUFPO1lBQ1IsQ0FBQztZQUVELElBQUksQ0FBQyxzQ0FBc0MsQ0FBQyxLQUFLLEVBQUUsQ0FBQztZQUNwRCxJQUFJLENBQUMsMkJBQTJCLEdBQUcsTUFBc0QsQ0FBQztZQUMxRixVQUFVLENBQUMsMEJBQTBCLEdBQUcsSUFBSSxDQUFDLDJCQUEyQixDQUFDO1FBQzFFLENBQUMsQ0FBQyxDQUFDLENBQUM7SUFDTCxDQUFDO0lBRUQsMEJBQTBCLENBQUMsTUFBYyxFQUFFLEVBQVUsRUFBRSxLQUFhLEVBQUUsV0FBbUI7UUFDeEYsTUFBTSxVQUFVLEdBQUcsR0FBRyxFQUFFLElBQUksV0FBVyxFQUFFLENBQUM7UUFDMUMsSUFBSSxDQUFDLFNBQVMsQ0FBQyxHQUFHLENBQUMsTUFBTSxFQUFFLFVBQVUsQ0FBQyxDQUFDO1FBRXZDLE1BQU0sUUFBUSxHQUFHLElBQUksMkJBQTJCLENBQUMsSUFBSSxDQUFDLE1BQU0sRUFBRSxJQUFJLENBQUMsZUFBZSxFQUFFLE1BQU0sRUFBRSxVQUFVLEVBQUUsRUFBRSxFQUFFLEtBQUssRUFBRSxFQUFFLENBQUMsQ0FBQztRQUN2SCxJQUFJLENBQUMsZUFBZSxDQUFDLHlCQUF5QixDQUFDLFVBQVUsRUFBRSxRQUFRLENBQUMsQ0FBQztRQUNyRSxJQUFJLENBQUMsbUJBQW1CLENBQUMsR0FBRyxDQUFDLE1BQU0sRUFBRSxRQUFRLENBQUMsQ0FBQztRQUUvQyxJQUFJLENBQUMsU0FBUyxDQUFDLElBQUksQ0FBQyxlQUFlLENBQUMsNkJBQTZCLENBQUMsQ0FBQyxDQUFDLEVBQUU7WUFDckUsSUFBSSxDQUFDLFlBQVksRUFBRSxDQUFDO1FBQ3JCLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFFSixJQUFJLENBQUMsU0FBUyxDQUFDLElBQUksQ0FBQyxlQUFlLENBQUMseUJBQXlCLENBQUMsQ0FBQyxDQUFDLEVBQUU7WUFDakUsSUFBSSxDQUFDLFlBQVksRUFBRSxDQUFDO1FBQ3JCLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFFSixJQUFJLENBQUMsZUFBZSxDQUFDLG9CQUFvQixDQUFDLE1BQU0sQ0FBQyxNQUFNLENBQUMsRUFBRSxFQUFFLENBQUMsQ0FBQztJQUMvRCxDQUFDO0lBRUQsNEJBQTRCLENBQUMsTUFBYztRQUMxQyxNQUFNLFVBQVUsR0FBRyxJQUFJLENBQUMsU0FBUyxDQUFDLEdBQUcsQ0FBQyxNQUFNLENBQUMsQ0FBQztRQUM5QyxJQUFJLENBQUMsU0FBUyxDQUFDLE1BQU0sQ0FBQyxNQUFNLENBQUMsQ0FBQztRQUM5QixJQUFJLENBQUMsbUJBQW1CLENBQUMsR0FBRyxDQUFDLE1BQU0sQ0FBQyxFQUFFLE9BQU8sRUFBRSxDQUFDO1FBQ2hELElBQUksQ0FBQyxtQkFBbUIsQ0FBQyxNQUFNLENBQUMsTUFBTSxDQUFDLENBQUM7UUFFeEMsSUFBSSxPQUFPLFVBQVUsS0FBSyxRQUFRLEVBQUUsQ0FBQztZQUNwQyxPQUFPO1lBQ1Asc0NBQXNDO1FBQ3ZDLENBQUM7YUFBTSxDQUFDO1lBQ1AsSUFBSSxDQUFDLGVBQWUsQ0FBQywyQkFBMkIsQ0FBQyxVQUFVLENBQUMsQ0FBQztRQUM5RCxDQUFDO0lBQ0YsQ0FBQztJQUVELGdDQUFnQyxDQUFDLE1BQWMsRUFBRSxRQUFpQztRQUNqRixNQUFNLFFBQVEsR0FBRyxJQUFJLENBQUMsbUJBQW1CLENBQUMsR0FBRyxDQUFDLE1BQU0sQ0FBQyxDQUFDO1FBRXRELElBQUksQ0FBQyxRQUFRLEVBQUUsQ0FBQztZQUNmLE9BQU8sU0FBUyxDQUFDO1FBQ2xCLENBQUM7UUFFRCxRQUFRLENBQUMsY0FBYyxDQUFDLFFBQVEsQ0FBQyxDQUFDO0lBQ25DLENBQUM7SUFFRCxvQkFBb0IsQ0FBQyxNQUFjLEVBQ2xDLG1CQUEyQixFQUMzQixRQUFnQixFQUNoQixRQUF1QixFQUN2QixLQUFzQyxFQUN0QyxRQUE2QixFQUM3QixXQUFnQyxFQUNoQyxVQUFtQixFQUNuQixRQUFpQjtRQUVqQixNQUFNLFFBQVEsR0FBRyxJQUFJLENBQUMsbUJBQW1CLENBQUMsR0FBRyxDQUFDLE1BQU0sQ0FBQyxDQUFDO1FBRXRELElBQUksQ0FBQyxRQUFRLEVBQUUsQ0FBQztZQUNmLE9BQU8sU0FBUyxDQUFDO1FBQ2xCLENBQUM7UUFFRCxPQUFPLFFBQVEsQ0FBQyxtQkFBbUIsQ0FBQyxXQUFXLENBQUMsS0FBSyxFQUFFLG1CQUFtQixFQUFFLFFBQVEsRUFBRSxRQUFRLEVBQUUsS0FBSyxFQUFFLFFBQVEsRUFBRSxVQUFVLEVBQUUsUUFBUSxDQUFDLENBQUM7SUFDeEksQ0FBQztJQUVELG9CQUFvQixDQUFDLE1BQWMsRUFDbEMsbUJBQTJCLEVBQzNCLFFBQWdCLEVBQ2hCLFFBQXVCLEVBQ3ZCLE9BQTZCO1FBQzdCLE1BQU0sUUFBUSxHQUFHLElBQUksQ0FBQyxtQkFBbUIsQ0FBQyxHQUFHLENBQUMsTUFBTSxDQUFDLENBQUM7UUFFdEQsSUFBSSxDQUFDLFFBQVEsRUFBRSxDQUFDO1lBQ2YsT0FBTyxTQUFTLENBQUM7UUFDbEIsQ0FBQztRQUVELE9BQU8sUUFBUSxDQUFDLG1CQUFtQixDQUFDLG1CQUFtQixFQUFFLFFBQVEsRUFBRSxRQUFRLEVBQUUsT0FBTyxDQUFDLENBQUM7SUFDdkYsQ0FBQztJQUVELG9CQUFvQixDQUFDLE1BQWMsRUFBRSxtQkFBMkI7UUFDL0QsTUFBTSxRQUFRLEdBQUcsSUFBSSxDQUFDLG1CQUFtQixDQUFDLEdBQUcsQ0FBQyxNQUFNLENBQUMsQ0FBQztRQUV0RCxJQUFJLENBQUMsUUFBUSxFQUFFLENBQUM7WUFDZixPQUFPO1FBQ1IsQ0FBQztRQUVELE9BQU8sUUFBUSxDQUFDLG1CQUFtQixDQUFDLG1CQUFtQixDQUFDLENBQUM7SUFDMUQsQ0FBQztJQUVELHVCQUF1QixDQUFDLE1BQWMsRUFBRSxhQUFxRDtRQUM1RixNQUFNLFFBQVEsR0FBRyxJQUFJLENBQUMsbUJBQW1CLENBQUMsR0FBRyxDQUFDLE1BQU0sQ0FBQyxDQUFDO1FBRXRELElBQUksQ0FBQyxRQUFRLEVBQUUsQ0FBQztZQUNmLE9BQU87UUFDUixDQUFDO1FBRUQsUUFBUSxDQUFDLHNCQUFzQixDQUFDLGFBQWEsQ0FBQyxDQUFDO0lBQ2hELENBQUM7SUFFRCxLQUFLLENBQUMsb0JBQW9CLENBQUMsTUFBYyxFQUFFLG1CQUEyQixFQUFFLHVCQUErQixFQUFFLE9BQTZDO1FBQ3JKLE1BQU0sUUFBUSxHQUFHLElBQUksQ0FBQyxtQkFBbUIsQ0FBQyxHQUFHLENBQUMsTUFBTSxDQUFDLENBQUM7UUFFdEQsSUFBSSxDQUFDLFFBQVEsRUFBRSxDQUFDO1lBQ2YsT0FBTyxPQUFPLENBQUMsT0FBTyxFQUFFLENBQUM7UUFDMUIsQ0FBQztRQUVELE1BQU0sTUFBTSxHQUFHLFFBQVEsQ0FBQyxjQUFjLEVBQUUsQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLEVBQUUsQ0FBQyxNQUFNLENBQUMsbUJBQW1CLEtBQUssbUJBQW1CLENBQUMsQ0FBQztRQUM1RyxJQUFJLENBQUMsTUFBTSxJQUFJLENBQUMsTUFBTSxDQUFDLHVCQUF1QixFQUFFLEVBQUUsQ0FBQztZQUNsRCxPQUFPLE9BQU8sQ0FBQyxPQUFPLEVBQUUsQ0FBQztRQUMxQixDQUFDO1FBRUQsTUFBTSxPQUFPLEdBQUcsTUFBTSxDQUFDLFFBQVEsRUFBRSxJQUFJLENBQUMsT0FBTyxDQUFDLEVBQUUsQ0FBQyxPQUFPLENBQUMsZ0JBQWdCLEtBQUssdUJBQXVCLENBQUMsQ0FBQztRQUV2RyxtQkFBbUIsQ0FBQyxJQUFJLENBQUMsZUFBZSxFQUFFLElBQUksQ0FBQyxjQUFjLEVBQUUsSUFBSSxDQUFDLG1CQUFtQixFQUFFLE1BQU0sRUFBRSxPQUFPLEVBQUUsT0FBTyxDQUFDLFVBQVUsRUFBRSxTQUFTLEVBQUUsT0FBTyxDQUFDLGFBQWEsQ0FBQyxDQUFDO0lBQ2pLLENBQUM7SUFFRCxLQUFLLENBQUMsa0JBQWtCLENBQUMsTUFBYyxFQUFFLG1CQUEyQjtRQUNuRSxNQUFNLFFBQVEsR0FBRyxJQUFJLENBQUMsbUJBQW1CLENBQUMsR0FBRyxDQUFDLE1BQU0sQ0FBQyxDQUFDO1FBRXRELElBQUksQ0FBQyxRQUFRLEVBQUUsQ0FBQztZQUNmLE9BQU8sT0FBTyxDQUFDLE9BQU8sRUFBRSxDQUFDO1FBQzFCLENBQUM7UUFFRCxNQUFNLE1BQU0sR0FBRyxRQUFRLENBQUMsY0FBYyxFQUFFLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxFQUFFLENBQUMsTUFBTSxDQUFDLG1CQUFtQixLQUFLLG1CQUFtQixDQUFDLENBQUM7UUFDNUcsSUFBSSxDQUFDLE1BQU0sSUFBSSxDQUFDLE1BQU0sQ0FBQyx1QkFBdUIsRUFBRSxFQUFFLENBQUM7WUFDbEQsT0FBTyxPQUFPLENBQUMsT0FBTyxFQUFFLENBQUM7UUFDMUIsQ0FBQztRQUVELE1BQU0sQ0FBQyxnQkFBZ0IsR0FBRyxTQUFTLENBQUMsNkJBQTZCLENBQUMsU0FBUyxDQUFDO0lBQzdFLENBQUM7SUFFTyxZQUFZO1FBQ25CLE1BQU0sK0JBQStCLEdBQUcsQ0FBQyxDQUFDLElBQUksQ0FBQyxzQkFBc0IsQ0FBQyxxQkFBcUIsQ0FBQyxnQkFBZ0IsQ0FBQyxDQUFDO1FBQzlHLElBQUksQ0FBQywrQkFBK0IsRUFBRSxDQUFDO1lBQ3RDLE1BQU0sY0FBYyxHQUFrQixRQUFRLENBQUMsRUFBRSxDQUEwQixjQUFjLENBQUMsc0JBQXNCLENBQUMsQ0FBQyxxQkFBcUIsQ0FBQztnQkFDdkksRUFBRSxFQUFFLGdCQUFnQjtnQkFDcEIsS0FBSyxFQUFFLG1CQUFtQjtnQkFDMUIsY0FBYyxFQUFFLElBQUksY0FBYyxDQUFDLGlCQUFpQixFQUFFLENBQUMsZ0JBQWdCLEVBQUUsRUFBRSxvQ0FBb0MsRUFBRSxJQUFJLEVBQUUsQ0FBQyxDQUFDO2dCQUN6SCxTQUFTLEVBQUUsd0JBQXdCO2dCQUNuQyxXQUFXLEVBQUUsSUFBSTtnQkFDakIsSUFBSSxFQUFFLGdCQUFnQjtnQkFDdEIsS0FBSyxFQUFFLEVBQUU7YUFDVCxzQ0FBOEIsQ0FBQztZQUVoQyxRQUFRLENBQUMsRUFBRSxDQUFpQixjQUFjLENBQUMsYUFBYSxDQUFDLENBQUMsYUFBYSxDQUFDLENBQUM7b0JBQ3hFLEVBQUUsRUFBRSxnQkFBZ0I7b0JBQ3BCLElBQUksRUFBRSxtQkFBbUI7b0JBQ3pCLG1CQUFtQixFQUFFLEtBQUs7b0JBQzFCLGNBQWMsRUFBRSxJQUFJLGNBQWMsQ0FBQyxhQUFhLENBQUM7b0JBQ2pELFdBQVcsRUFBRSxJQUFJO29CQUNqQixhQUFhLEVBQUUsZ0JBQWdCO29CQUMvQixZQUFZLEVBQUU7d0JBQ2IsRUFBRSxFQUFFLHFDQUFxQztxQkFDekM7aUJBQ0QsQ0FBQyxFQUFFLGNBQWMsQ0FBQyxDQUFDO1FBQ3JCLENBQUM7UUFDRCxJQUFJLENBQUMscUJBQXFCLENBQUMsK0JBQStCLENBQUMsQ0FBQztJQUM3RCxDQUFDO0lBRU8sV0FBVztRQUNsQixDQUFDLEdBQUcsSUFBSSxDQUFDLG1CQUFtQixDQUFDLElBQUksRUFBRSxDQUFDLENBQUMsT0FBTyxDQUFDLE1BQU0sQ0FBQyxFQUFFO1lBQ3JELE1BQU0sT0FBTyxHQUFHLElBQUksQ0FBQyxtQkFBbUIsQ0FBQyxHQUFHLENBQUMsTUFBTSxDQUFFLENBQUMsY0FBYyxFQUFFLENBQUM7WUFFdkUsSUFBSSxPQUFPLENBQUMsTUFBTSxFQUFFLENBQUM7Z0JBQ3BCLE1BQU0sVUFBVSxHQUFHLElBQUksQ0FBQyxVQUFVLENBQUMsTUFBTSxDQUFDLENBQUM7Z0JBQzNDLElBQUksQ0FBQyxlQUFlLENBQUMsb0JBQW9CLENBQUMsVUFBVSxFQUFFLE9BQU8sQ0FBQyxDQUFDO1lBQ2hFLENBQUM7UUFDRixDQUFDLENBQUMsQ0FBQztJQUNKLENBQUM7SUFFTywwQkFBMEI7UUFDakMsSUFBSSxDQUFDLElBQUksQ0FBQyxpQkFBaUIsQ0FBQyxLQUFLLEVBQUUsQ0FBQztZQUNuQyxJQUFJLENBQUMsaUJBQWlCLENBQUMsS0FBSyxHQUFHLElBQUksQ0FBQyxhQUFhLENBQUMseUJBQXlCLENBQUMsQ0FBQyxDQUFDLEVBQUU7Z0JBQy9FLElBQUksQ0FBQyxDQUFDLEVBQUUsS0FBSyxnQkFBZ0IsSUFBSSxDQUFDLENBQUMsT0FBTyxFQUFFLENBQUM7b0JBQzVDLElBQUksQ0FBQyxXQUFXLEVBQUUsQ0FBQztvQkFDbkIsSUFBSSxJQUFJLENBQUMsaUJBQWlCLEVBQUUsQ0FBQzt3QkFDNUIsSUFBSSxDQUFDLGlCQUFpQixDQUFDLE9BQU8sRUFBRSxDQUFDO29CQUNsQyxDQUFDO2dCQUNGLENBQUM7WUFDRixDQUFDLENBQUMsQ0FBQztRQUNKLENBQUM7SUFDRixDQUFDO0lBRUQ7Ozs7T0FJRztJQUNLLHFCQUFxQixDQUFDLCtCQUF3QztRQUNyRSxJQUFJLENBQUMsK0JBQStCLEVBQUUsQ0FBQztZQUN0QyxJQUFJLENBQUMsMEJBQTBCLEVBQUUsQ0FBQztRQUNuQyxDQUFDO1FBRUQsSUFBSSxDQUFDLElBQUksQ0FBQywwQkFBMEIsQ0FBQyxLQUFLLEVBQUUsQ0FBQztZQUM1QyxJQUFJLENBQUMsMEJBQTBCLENBQUMsS0FBSyxHQUFHLElBQUksQ0FBQyxzQkFBc0IsQ0FBQyxvQkFBb0IsQ0FBQyxDQUFDLENBQUMsRUFBRTtnQkFDNUYsSUFBSSxDQUFDLENBQUMsS0FBSyxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsRUFBRSxDQUFDLElBQUksQ0FBQyxFQUFFLEtBQUssZ0JBQWdCLENBQUMsRUFBRSxDQUFDO29CQUN4RCxJQUFJLENBQUMsV0FBVyxFQUFFLENBQUM7b0JBQ25CLElBQUksQ0FBQywwQkFBMEIsRUFBRSxDQUFDO2dCQUNuQyxDQUFDO1lBQ0YsQ0FBQyxDQUFDLENBQUM7UUFDSixDQUFDO1FBRUQsSUFBSSxDQUFDLElBQUksQ0FBQyxrQ0FBa0MsQ0FBQyxLQUFLLEVBQUUsQ0FBQztZQUNwRCxJQUFJLENBQUMsa0NBQWtDLENBQUMsS0FBSyxHQUFHLElBQUksQ0FBQyxzQkFBc0IsQ0FBQyw0QkFBNEIsQ0FBQyxDQUFDLENBQUMsRUFBRTtnQkFDNUcsTUFBTSxpQkFBaUIsR0FBRyxJQUFJLENBQUMsc0JBQXNCLENBQUMsd0JBQXdCLENBQUMsZ0JBQWdCLENBQUMsQ0FBQztnQkFDakcsSUFBSSxDQUFDLENBQUMsYUFBYSxDQUFDLEVBQUUsS0FBSyxpQkFBaUIsRUFBRSxFQUFFLEVBQUUsQ0FBQztvQkFDbEQsSUFBSSxDQUFDLFdBQVcsRUFBRSxDQUFDO29CQUNuQixJQUFJLENBQUMsMEJBQTBCLEVBQUUsQ0FBQztnQkFDbkMsQ0FBQztZQUNGLENBQUMsQ0FBQyxDQUFDO1FBQ0osQ0FBQztJQUNGLENBQUM7SUFFTyxVQUFVLENBQUMsTUFBYztRQUNoQyxJQUFJLENBQUMsSUFBSSxDQUFDLFNBQVMsQ0FBQyxHQUFHLENBQUMsTUFBTSxDQUFDLEVBQUUsQ0FBQztZQUNqQyxNQUFNLElBQUksS0FBSyxDQUFDLGlCQUFpQixDQUFDLENBQUM7UUFDcEMsQ0FBQztRQUNELE9BQU8sSUFBSSxDQUFDLFNBQVMsQ0FBQyxHQUFHLENBQUMsTUFBTSxDQUFFLENBQUM7SUFDcEMsQ0FBQztDQUNELENBQUE7QUEvUFksa0JBQWtCO0lBRDlCLG9CQUFvQixDQUFDLFdBQVcsQ0FBQyxrQkFBa0IsQ0FBQztJQWdCbEQsV0FBQSxlQUFlLENBQUE7SUFDZixXQUFBLGFBQWEsQ0FBQTtJQUNiLFdBQUEsc0JBQXNCLENBQUE7SUFDdEIsV0FBQSxtQkFBbUIsQ0FBQTtJQUNuQixXQUFBLGNBQWMsQ0FBQTtHQW5CSixrQkFBa0IsQ0ErUDlCIn0=