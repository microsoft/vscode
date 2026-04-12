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
import * as nls from '../../../../nls.js';
import * as dom from '../../../../base/browser/dom.js';
import * as languages from '../../../../editor/common/languages.js';
import { ActionBar } from '../../../../base/browser/ui/actionbar/actionbar.js';
import { Action, Separator, ActionRunner } from '../../../../base/common/actions.js';
import { Disposable, DisposableStore, MutableDisposable } from '../../../../base/common/lifecycle.js';
import { URI } from '../../../../base/common/uri.js';
import { IMarkdownRendererService } from '../../../../platform/markdown/browser/markdownRenderer.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { ICommentService } from './commentService.js';
import { MIN_EDITOR_HEIGHT, SimpleCommentEditor, calculateEditorHeight } from './simpleCommentEditor.js';
import { Emitter } from '../../../../base/common/event.js';
import { INotificationService } from '../../../../platform/notification/common/notification.js';
import { ToolBar } from '../../../../base/browser/ui/toolbar/toolbar.js';
import { IContextMenuService } from '../../../../platform/contextview/browser/contextView.js';
import { ToggleReactionsAction, ReactionAction, ReactionActionViewItem } from './reactionsAction.js';
import { MenuItemAction, SubmenuItemAction, MenuId } from '../../../../platform/actions/common/actions.js';
import { MenuEntryActionViewItem, SubmenuEntryActionViewItem } from '../../../../platform/actions/browser/menuEntryActionViewItem.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { CommentFormActions } from './commentFormActions.js';
import { MOUSE_CURSOR_TEXT_CSS_CLASS_NAME } from '../../../../base/browser/ui/mouseCursor/mouseCursor.js';
import { ActionViewItem } from '../../../../base/browser/ui/actionbar/actionViewItems.js';
import { DropdownMenuActionViewItem } from '../../../../base/browser/ui/dropdown/dropdownActionViewItem.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { TimestampWidget } from './timestamp.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { Scrollable } from '../../../../base/common/scrollable.js';
import { SmoothScrollableElement } from '../../../../base/browser/ui/scrollbar/scrollableElement.js';
import { DomEmitter } from '../../../../base/browser/event.js';
import { CommentContextKeys } from '../common/commentContextKeys.js';
import { FileAccess, Schemas } from '../../../../base/common/network.js';
import { COMMENTS_SECTION } from '../common/commentsConfiguration.js';
import { StandardMouseEvent } from '../../../../base/browser/mouseEvent.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
import { IHoverService } from '../../../../platform/hover/browser/hover.js';
import { ITextModelService } from '../../../../editor/common/services/resolverService.js';
import { Position } from '../../../../editor/common/core/position.js';
class CommentsActionRunner extends ActionRunner {
    async runAction(action, context) {
        await action.run(...context);
    }
}
let CommentNode = class CommentNode extends Disposable {
    get domNode() {
        return this._domNode;
    }
    constructor(parentEditor, commentThread, comment, pendingEdit, owner, resource, parentThread, markdownRendererOptions, instantiationService, commentService, notificationService, contextMenuService, contextKeyService, configurationService, hoverService, keybindingService, textModelService, markdownRendererService) {
        super();
        this.parentEditor = parentEditor;
        this.commentThread = commentThread;
        this.comment = comment;
        this.pendingEdit = pendingEdit;
        this.owner = owner;
        this.resource = resource;
        this.parentThread = parentThread;
        this.markdownRendererOptions = markdownRendererOptions;
        this.instantiationService = instantiationService;
        this.commentService = commentService;
        this.notificationService = notificationService;
        this.contextMenuService = contextMenuService;
        this.configurationService = configurationService;
        this.hoverService = hoverService;
        this.keybindingService = keybindingService;
        this.textModelService = textModelService;
        this.markdownRendererService = markdownRendererService;
        this._md = this._register(new MutableDisposable());
        this._editAction = null;
        this._commentEditContainer = null;
        this._reactionsActionBar = this._register(new MutableDisposable());
        this._reactionActions = this._register(new DisposableStore());
        this._commentEditor = null;
        this._commentEditorModel = null;
        this._editorHeight = MIN_EDITOR_HEIGHT;
        this._actionRunner = this._register(new CommentsActionRunner());
        this.toolbar = this._register(new MutableDisposable());
        this._commentFormActions = null;
        this._commentEditorActions = null;
        this._onDidClick = this._register(new Emitter());
        this.isEditing = false;
        this._editModeDisposables = this._register(new DisposableStore());
        this._domNode = dom.$('div.review-comment');
        this._contextKeyService = this._register(contextKeyService.createScoped(this._domNode));
        this._commentContextValue = CommentContextKeys.commentContext.bindTo(this._contextKeyService);
        if (this.comment.contextValue) {
            this._commentContextValue.set(this.comment.contextValue);
        }
        this._commentMenus = this.commentService.getCommentMenus(this.owner);
        this._domNode.tabIndex = -1;
        this._avatar = dom.append(this._domNode, dom.$('div.avatar-container'));
        this.updateCommentUserIcon(this.comment.userIconPath);
        this._commentDetailsContainer = dom.append(this._domNode, dom.$('.review-comment-contents'));
        this.createHeader(this._commentDetailsContainer);
        this._body = document.createElement(`div`);
        this._body.classList.add('comment-body', MOUSE_CURSOR_TEXT_CSS_CLASS_NAME);
        if (configurationService.getValue(COMMENTS_SECTION)?.maxHeight !== false) {
            this._body.classList.add('comment-body-max-height');
        }
        this.createScroll(this._commentDetailsContainer, this._body);
        this.updateCommentBody(this.comment.body);
        this.createReactionsContainer(this._commentDetailsContainer);
        this._domNode.setAttribute('aria-label', `${comment.userName}, ${this.commentBodyValue}`);
        this._domNode.setAttribute('role', 'treeitem');
        this._clearTimeout = null;
        this._register(dom.addDisposableListener(this._domNode, dom.EventType.CLICK, () => this.isEditing || this._onDidClick.fire(this)));
        this._register(dom.addDisposableListener(this._domNode, dom.EventType.CONTEXT_MENU, e => {
            return this.onContextMenu(e);
        }));
        if (pendingEdit) {
            this.switchToEditMode();
        }
        this.activeCommentListeners();
    }
    activeCommentListeners() {
        this._register(dom.addDisposableListener(this._domNode, dom.EventType.FOCUS_IN, () => {
            this.commentService.setActiveCommentAndThread(this.owner, { thread: this.commentThread, comment: this.comment });
        }, true));
    }
    createScroll(container, body) {
        this._scrollable = this._register(new Scrollable({
            forceIntegerValues: true,
            smoothScrollDuration: 125,
            scheduleAtNextAnimationFrame: cb => dom.scheduleAtNextAnimationFrame(dom.getWindow(container), cb)
        }));
        this._scrollableElement = this._register(new SmoothScrollableElement(body, {
            horizontal: 3 /* ScrollbarVisibility.Visible */,
            vertical: 3 /* ScrollbarVisibility.Visible */
        }, this._scrollable));
        this._register(this._scrollableElement.onScroll(e => {
            if (e.scrollLeftChanged) {
                body.scrollLeft = e.scrollLeft;
            }
            if (e.scrollTopChanged) {
                body.scrollTop = e.scrollTop;
            }
        }));
        const onDidScrollViewContainer = this._register(new DomEmitter(body, 'scroll')).event;
        this._register(onDidScrollViewContainer(_ => {
            const position = this._scrollableElement.getScrollPosition();
            const scrollLeft = Math.abs(body.scrollLeft - position.scrollLeft) <= 1 ? undefined : body.scrollLeft;
            const scrollTop = Math.abs(body.scrollTop - position.scrollTop) <= 1 ? undefined : body.scrollTop;
            if (scrollLeft !== undefined || scrollTop !== undefined) {
                this._scrollableElement.setScrollPosition({ scrollLeft, scrollTop });
            }
        }));
        container.appendChild(this._scrollableElement.getDomNode());
    }
    updateCommentBody(body) {
        this._body.innerText = '';
        this._md.clear();
        this._plainText = undefined;
        if (typeof body === 'string') {
            this._plainText = dom.append(this._body, dom.$('.comment-body-plainstring'));
            this._plainText.innerText = body;
        }
        else {
            this._md.value = this.markdownRendererService.render(body, this.markdownRendererOptions);
            this._body.appendChild(this._md.value.element);
        }
    }
    updateCommentUserIcon(userIconPath) {
        this._avatar.textContent = '';
        if (userIconPath) {
            const img = dom.append(this._avatar, dom.$('img.avatar'));
            img.src = FileAccess.uriToBrowserUri(URI.revive(userIconPath)).toString(true);
            img.onerror = _ => img.remove();
        }
    }
    get onDidClick() {
        return this._onDidClick.event;
    }
    createTimestamp(container) {
        this._timestamp = dom.append(container, dom.$('span.timestamp-container'));
        this.updateTimestamp(this.comment.timestamp);
    }
    updateTimestamp(raw) {
        if (!this._timestamp) {
            return;
        }
        const timestamp = raw !== undefined ? new Date(raw) : undefined;
        if (!timestamp) {
            this._timestampWidget?.dispose();
        }
        else {
            if (!this._timestampWidget) {
                this._timestampWidget = new TimestampWidget(this.configurationService, this.hoverService, this._timestamp, timestamp);
                this._register(this._timestampWidget);
            }
            else {
                this._timestampWidget.setTimestamp(timestamp);
            }
        }
    }
    createHeader(commentDetailsContainer) {
        const header = dom.append(commentDetailsContainer, dom.$(`div.comment-title.${MOUSE_CURSOR_TEXT_CSS_CLASS_NAME}`));
        const infoContainer = dom.append(header, dom.$('comment-header-info'));
        const author = dom.append(infoContainer, dom.$('strong.author'));
        author.innerText = this.comment.userName;
        this.createTimestamp(infoContainer);
        this._isPendingLabel = dom.append(infoContainer, dom.$('span.isPending'));
        if (this.comment.label) {
            this._isPendingLabel.innerText = this.comment.label;
        }
        else {
            this._isPendingLabel.innerText = '';
        }
        this._actionsToolbarContainer = dom.append(header, dom.$('.comment-actions'));
        this.createActionsToolbar();
    }
    getToolbarActions(menu) {
        const contributedActions = menu.getActions({ shouldForwardArgs: true });
        const primary = [];
        const secondary = [];
        const result = { primary, secondary };
        fillInActions(contributedActions, result, false, g => /^inline/.test(g));
        return result;
    }
    get commentNodeContext() {
        return [{
                thread: this.commentThread,
                commentUniqueId: this.comment.uniqueIdInThread,
                $mid: 10 /* MarshalledId.CommentNode */
            },
            {
                commentControlHandle: this.commentThread.controllerHandle,
                commentThreadHandle: this.commentThread.commentThreadHandle,
                $mid: 7 /* MarshalledId.CommentThread */
            }];
    }
    createToolbar() {
        this.toolbar.value = new ToolBar(this._actionsToolbarContainer, this.contextMenuService, {
            actionViewItemProvider: (action, options) => {
                if (action.id === ToggleReactionsAction.ID) {
                    return new DropdownMenuActionViewItem(action, action.menuActions, this.contextMenuService, {
                        ...options,
                        actionViewItemProvider: (action, options) => this.actionViewItemProvider(action, options),
                        classNames: ['toolbar-toggle-pickReactions', ...ThemeIcon.asClassNameArray(Codicon.reactions)],
                        anchorAlignmentProvider: () => 1 /* AnchorAlignment.RIGHT */
                    });
                }
                return this.actionViewItemProvider(action, options);
            },
            orientation: 0 /* ActionsOrientation.HORIZONTAL */
        });
        this.toolbar.value.context = this.commentNodeContext;
        this.toolbar.value.actionRunner = this._actionRunner;
    }
    createActionsToolbar() {
        const actions = [];
        const menu = this._commentMenus.getCommentTitleActions(this.comment, this._contextKeyService);
        this._register(menu);
        this._register(menu.onDidChange(e => {
            const { primary, secondary } = this.getToolbarActions(menu);
            if (!this.toolbar && (primary.length || secondary.length)) {
                this.createToolbar();
            }
            this.toolbar.value.setActions(primary, secondary);
        }));
        const { primary, secondary } = this.getToolbarActions(menu);
        actions.push(...primary);
        if (actions.length || secondary.length) {
            this.createToolbar();
            this.toolbar.value.setActions(actions, secondary);
        }
    }
    actionViewItemProvider(action, options) {
        if (action.id === ToggleReactionsAction.ID) {
            options = { label: false, icon: true };
        }
        else {
            options = { label: false, icon: true };
        }
        if (action.id === ReactionAction.ID) {
            const item = new ReactionActionViewItem(action);
            return item;
        }
        else if (action instanceof MenuItemAction) {
            return this.instantiationService.createInstance(MenuEntryActionViewItem, action, { hoverDelegate: options.hoverDelegate });
        }
        else if (action instanceof SubmenuItemAction) {
            return this.instantiationService.createInstance(SubmenuEntryActionViewItem, action, options);
        }
        else {
            const item = new ActionViewItem({}, action, options);
            return item;
        }
    }
    async submitComment() {
        if (this._commentEditor && this._commentFormActions) {
            await this._commentFormActions.triggerDefaultAction();
            this.pendingEdit = undefined;
        }
    }
    createReactionPicker(reactionGroup) {
        const toggleReactionAction = this._reactionActions.add(new ToggleReactionsAction(() => {
            toggleReactionActionViewItem?.show();
        }, nls.localize('commentToggleReaction', "Toggle Reaction")));
        let reactionMenuActions = [];
        if (reactionGroup && reactionGroup.length) {
            reactionMenuActions = reactionGroup.map((reaction) => {
                return this._reactionActions.add(new Action(`reaction.command.${reaction.label}`, `${reaction.label}`, '', true, async () => {
                    try {
                        await this.commentService.toggleReaction(this.owner, this.resource, this.commentThread, this.comment, reaction);
                    }
                    catch (e) {
                        const error = e.message
                            ? nls.localize('commentToggleReactionError', "Toggling the comment reaction failed: {0}.", e.message)
                            : nls.localize('commentToggleReactionDefaultError', "Toggling the comment reaction failed");
                        this.notificationService.error(error);
                    }
                }));
            });
        }
        toggleReactionAction.menuActions = reactionMenuActions;
        const toggleReactionActionViewItem = this._reactionActions.add(new DropdownMenuActionViewItem(toggleReactionAction, toggleReactionAction.menuActions, this.contextMenuService, {
            actionViewItemProvider: (action, options) => {
                if (action.id === ToggleReactionsAction.ID) {
                    return toggleReactionActionViewItem;
                }
                return this.actionViewItemProvider(action, options);
            },
            classNames: 'toolbar-toggle-pickReactions',
            anchorAlignmentProvider: () => 1 /* AnchorAlignment.RIGHT */
        }));
        return toggleReactionAction;
    }
    createReactionsContainer(commentDetailsContainer) {
        this._reactionActionsContainer?.remove();
        this._reactionsActionBar.clear();
        this._reactionActions.clear();
        const hasReactionHandler = this.commentService.hasReactionHandler(this.owner);
        const reactions = this.comment.commentReactions?.filter(reaction => !!reaction.count) || [];
        // Only create the container if there are reactions to show or if there's a reaction handler
        if (reactions.length === 0 && !hasReactionHandler) {
            return;
        }
        this._reactionActionsContainer = dom.append(commentDetailsContainer, dom.$('div.comment-reactions'));
        this._reactionsActionBar.value = new ActionBar(this._reactionActionsContainer, {
            actionViewItemProvider: (action, options) => {
                if (action.id === ToggleReactionsAction.ID) {
                    return new DropdownMenuActionViewItem(action, action.menuActions, this.contextMenuService, {
                        actionViewItemProvider: (action, options) => this.actionViewItemProvider(action, options),
                        classNames: ['toolbar-toggle-pickReactions', ...ThemeIcon.asClassNameArray(Codicon.reactions)],
                        anchorAlignmentProvider: () => 1 /* AnchorAlignment.RIGHT */
                    });
                }
                return this.actionViewItemProvider(action, options);
            }
        });
        reactions.map(reaction => {
            const action = this._reactionActions.add(new ReactionAction(`reaction.${reaction.label}`, `${reaction.label}`, reaction.hasReacted && (reaction.canEdit || hasReactionHandler) ? 'active' : '', (reaction.canEdit || hasReactionHandler), async () => {
                try {
                    await this.commentService.toggleReaction(this.owner, this.resource, this.commentThread, this.comment, reaction);
                }
                catch (e) {
                    let error;
                    if (reaction.hasReacted) {
                        error = e.message
                            ? nls.localize('commentDeleteReactionError', "Deleting the comment reaction failed: {0}.", e.message)
                            : nls.localize('commentDeleteReactionDefaultError', "Deleting the comment reaction failed");
                    }
                    else {
                        error = e.message
                            ? nls.localize('commentAddReactionError', "Deleting the comment reaction failed: {0}.", e.message)
                            : nls.localize('commentAddReactionDefaultError', "Deleting the comment reaction failed");
                    }
                    this.notificationService.error(error);
                }
            }, reaction.reactors, reaction.iconPath, reaction.count));
            this._reactionsActionBar.value?.push(action, { label: true, icon: true });
        });
        if (hasReactionHandler) {
            const toggleReactionAction = this.createReactionPicker(this.comment.commentReactions || []);
            this._reactionsActionBar.value?.push(toggleReactionAction, { label: false, icon: true });
        }
    }
    get commentBodyValue() {
        return (typeof this.comment.body === 'string') ? this.comment.body : this.comment.body.value;
    }
    async createCommentEditor(editContainer) {
        this._editModeDisposables.clear();
        const container = dom.append(editContainer, dom.$('.edit-textarea'));
        this._commentEditor = this.instantiationService.createInstance(SimpleCommentEditor, container, SimpleCommentEditor.getEditorOptions(this.configurationService), this._contextKeyService, this.parentThread);
        this._editModeDisposables.add(this._commentEditor);
        const resource = URI.from({
            scheme: Schemas.commentsInput,
            path: `/commentinput-${this.comment.uniqueIdInThread}-${Date.now()}.md`
        });
        const modelRef = await this.textModelService.createModelReference(resource);
        this._commentEditorModel = modelRef;
        this._editModeDisposables.add(this._commentEditorModel);
        this._commentEditor.setModel(this._commentEditorModel.object.textEditorModel);
        this._commentEditor.setValue(this.pendingEdit?.body ?? this.commentBodyValue);
        if (this.pendingEdit) {
            this._commentEditor.setPosition(this.pendingEdit.cursor);
        }
        else {
            const lastLine = this._commentEditorModel.object.textEditorModel.getLineCount();
            const lastColumn = this._commentEditorModel.object.textEditorModel.getLineLength(lastLine) + 1;
            this._commentEditor.setPosition(new Position(lastLine, lastColumn));
        }
        this.pendingEdit = undefined;
        this._commentEditor.layout({ width: container.clientWidth - 14, height: this._editorHeight });
        this._commentEditor.focus();
        dom.scheduleAtNextAnimationFrame(dom.getWindow(editContainer), () => {
            this._commentEditor.layout({ width: container.clientWidth - 14, height: this._editorHeight });
            this._commentEditor.focus();
        });
        const commentThread = this.commentThread;
        commentThread.input = {
            uri: this._commentEditor.getModel().uri,
            value: this.commentBodyValue
        };
        this.commentService.setActiveEditingCommentThread(commentThread);
        this.commentService.setActiveCommentAndThread(this.owner, { thread: commentThread, comment: this.comment });
        this._editModeDisposables.add(this._commentEditor.onDidFocusEditorWidget(() => {
            commentThread.input = {
                uri: this._commentEditor.getModel().uri,
                value: this.commentBodyValue
            };
            this.commentService.setActiveEditingCommentThread(commentThread);
            this.commentService.setActiveCommentAndThread(this.owner, { thread: commentThread, comment: this.comment });
        }));
        this._editModeDisposables.add(this._commentEditor.onDidChangeModelContent(e => {
            if (commentThread.input && this._commentEditor && this._commentEditor.getModel().uri === commentThread.input.uri) {
                const newVal = this._commentEditor.getValue();
                if (newVal !== commentThread.input.value) {
                    const input = commentThread.input;
                    input.value = newVal;
                    commentThread.input = input;
                    this.commentService.setActiveEditingCommentThread(commentThread);
                    this.commentService.setActiveCommentAndThread(this.owner, { thread: commentThread, comment: this.comment });
                }
            }
        }));
        this.calculateEditorHeight();
        this._editModeDisposables.add((this._commentEditorModel.object.textEditorModel.onDidChangeContent(() => {
            if (this._commentEditor && this.calculateEditorHeight()) {
                this._commentEditor.layout({ height: this._editorHeight, width: this._commentEditor.getLayoutInfo().width });
                this._commentEditor.render(true);
            }
        })));
    }
    calculateEditorHeight() {
        if (this._commentEditor) {
            const newEditorHeight = calculateEditorHeight(this.parentEditor, this._commentEditor, this._editorHeight);
            if (newEditorHeight !== this._editorHeight) {
                this._editorHeight = newEditorHeight;
                return true;
            }
        }
        return false;
    }
    getPendingEdit() {
        const model = this._commentEditor?.getModel();
        if (this._commentEditor && model && model.getValueLength() > 0) {
            return { body: model.getValue(), cursor: this._commentEditor.getPosition() };
        }
        return undefined;
    }
    removeCommentEditor() {
        this.isEditing = false;
        if (this._editAction) {
            this._editAction.enabled = true;
        }
        this._body.classList.remove('hidden');
        this._editModeDisposables.clear();
        this._commentEditor = null;
        this._commentEditContainer.remove();
    }
    layout(widthInPixel) {
        const editorWidth = widthInPixel !== undefined ? widthInPixel - 72 /* - margin and scrollbar*/ : (this._commentEditor?.getLayoutInfo().width ?? 0);
        this._commentEditor?.layout({ width: editorWidth, height: this._editorHeight });
        const scrollWidth = this._body.scrollWidth;
        const width = dom.getContentWidth(this._body);
        const scrollHeight = this._body.scrollHeight;
        const height = dom.getContentHeight(this._body) + 4;
        this._scrollableElement.setScrollDimensions({ width, scrollWidth, height, scrollHeight });
    }
    async switchToEditMode() {
        if (this.isEditing) {
            return;
        }
        this.isEditing = true;
        this._body.classList.add('hidden');
        this._commentEditContainer = dom.append(this._commentDetailsContainer, dom.$('.edit-container'));
        await this.createCommentEditor(this._commentEditContainer);
        const formActions = dom.append(this._commentEditContainer, dom.$('.form-actions'));
        const otherActions = dom.append(formActions, dom.$('.other-actions'));
        this.createCommentWidgetFormActions(otherActions);
        const editorActions = dom.append(formActions, dom.$('.editor-actions'));
        this.createCommentWidgetEditorActions(editorActions);
    }
    createCommentWidgetFormActions(container) {
        const menus = this.commentService.getCommentMenus(this.owner);
        const menu = menus.getCommentActions(this.comment, this._contextKeyService);
        this._editModeDisposables.add(menu);
        this._editModeDisposables.add(menu.onDidChange(() => {
            this._commentFormActions?.setActions(menu);
        }));
        this._commentFormActions = new CommentFormActions(this.keybindingService, this._contextKeyService, this.contextMenuService, container, (action) => {
            const text = this._commentEditor.getValue();
            action.run({
                thread: this.commentThread,
                commentUniqueId: this.comment.uniqueIdInThread,
                text: text,
                $mid: 11 /* MarshalledId.CommentThreadNode */
            });
            this.removeCommentEditor();
        });
        this._editModeDisposables.add(this._commentFormActions);
        this._commentFormActions.setActions(menu);
    }
    createCommentWidgetEditorActions(container) {
        const menus = this.commentService.getCommentMenus(this.owner);
        const menu = menus.getCommentEditorActions(this._contextKeyService);
        this._editModeDisposables.add(menu);
        this._editModeDisposables.add(menu.onDidChange(() => {
            this._commentEditorActions?.setActions(menu, true);
        }));
        this._commentEditorActions = new CommentFormActions(this.keybindingService, this._contextKeyService, this.contextMenuService, container, (action) => {
            const text = this._commentEditor.getValue();
            action.run({
                thread: this.commentThread,
                commentUniqueId: this.comment.uniqueIdInThread,
                text: text,
                $mid: 11 /* MarshalledId.CommentThreadNode */
            });
            this._commentEditor?.focus();
        });
        this._editModeDisposables.add(this._commentEditorActions);
        this._commentEditorActions.setActions(menu, true);
    }
    setFocus(focused, visible = false) {
        if (focused) {
            this._domNode.focus();
            this._actionsToolbarContainer.classList.add('tabfocused');
            this._domNode.tabIndex = 0;
            if (this.comment.mode === languages.CommentMode.Editing) {
                this._commentEditor?.focus();
            }
        }
        else {
            if (this._actionsToolbarContainer.classList.contains('tabfocused') && !this._actionsToolbarContainer.classList.contains('mouseover')) {
                this._domNode.tabIndex = -1;
            }
            this._actionsToolbarContainer.classList.remove('tabfocused');
        }
    }
    async update(newComment) {
        if (newComment.body !== this.comment.body) {
            this.updateCommentBody(newComment.body);
        }
        if (this.comment.userIconPath && newComment.userIconPath && (URI.from(this.comment.userIconPath).toString() !== URI.from(newComment.userIconPath).toString())) {
            this.updateCommentUserIcon(newComment.userIconPath);
        }
        const isChangingMode = newComment.mode !== undefined && newComment.mode !== this.comment.mode;
        this.comment = newComment;
        if (isChangingMode) {
            if (newComment.mode === languages.CommentMode.Editing) {
                await this.switchToEditMode();
            }
            else {
                this.removeCommentEditor();
            }
        }
        if (newComment.label) {
            this._isPendingLabel.innerText = newComment.label;
        }
        else {
            this._isPendingLabel.innerText = '';
        }
        // update comment reactions
        this.createReactionsContainer(this._commentDetailsContainer);
        if (this.comment.contextValue) {
            this._commentContextValue.set(this.comment.contextValue);
        }
        else {
            this._commentContextValue.reset();
        }
        if (this.comment.timestamp) {
            this.updateTimestamp(this.comment.timestamp);
        }
    }
    onContextMenu(e) {
        const event = new StandardMouseEvent(dom.getWindow(this._domNode), e);
        this.contextMenuService.showContextMenu({
            getAnchor: () => event,
            menuId: MenuId.CommentThreadCommentContext,
            menuActionOptions: { shouldForwardArgs: true },
            contextKeyService: this._contextKeyService,
            actionRunner: this._actionRunner,
            getActionsContext: () => {
                return this.commentNodeContext;
            },
        });
    }
    focus() {
        this.domNode.focus();
        if (!this._clearTimeout) {
            this.domNode.classList.add('focus');
            this._clearTimeout = setTimeout(() => {
                this.domNode.classList.remove('focus');
            }, 3000);
        }
    }
    dispose() {
        super.dispose();
    }
};
CommentNode = __decorate([
    __param(8, IInstantiationService),
    __param(9, ICommentService),
    __param(10, INotificationService),
    __param(11, IContextMenuService),
    __param(12, IContextKeyService),
    __param(13, IConfigurationService),
    __param(14, IHoverService),
    __param(15, IKeybindingService),
    __param(16, ITextModelService),
    __param(17, IMarkdownRendererService)
], CommentNode);
export { CommentNode };
function fillInActions(groups, target, useAlternativeActions, isPrimaryGroup = group => group === 'navigation') {
    for (const tuple of groups) {
        let [group, actions] = tuple;
        if (useAlternativeActions) {
            actions = actions.map(a => (a instanceof MenuItemAction) && !!a.alt ? a.alt : a);
        }
        if (isPrimaryGroup(group)) {
            const to = Array.isArray(target) ? target : target.primary;
            to.unshift(...actions);
        }
        else {
            const to = Array.isArray(target) ? target : target.secondary;
            if (to.length > 0) {
                to.push(new Separator());
            }
            to.push(...actions);
        }
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY29tbWVudE5vZGUuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi9jb21tZW50cy9icm93c2VyL2NvbW1lbnROb2RlLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7O0FBRWhHLE9BQU8sS0FBSyxHQUFHLE1BQU0sb0JBQW9CLENBQUM7QUFDMUMsT0FBTyxLQUFLLEdBQUcsTUFBTSxpQ0FBaUMsQ0FBQztBQUN2RCxPQUFPLEtBQUssU0FBUyxNQUFNLHdDQUF3QyxDQUFDO0FBQ3BFLE9BQU8sRUFBc0IsU0FBUyxFQUFFLE1BQU0sb0RBQW9ELENBQUM7QUFDbkcsT0FBTyxFQUFFLE1BQU0sRUFBVyxTQUFTLEVBQUUsWUFBWSxFQUFFLE1BQU0sb0NBQW9DLENBQUM7QUFDOUYsT0FBTyxFQUFFLFVBQVUsRUFBRSxlQUFlLEVBQWMsaUJBQWlCLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUNsSCxPQUFPLEVBQUUsR0FBRyxFQUFpQixNQUFNLGdDQUFnQyxDQUFDO0FBQ3BFLE9BQU8sRUFBaUMsd0JBQXdCLEVBQUUsTUFBTSwyREFBMkQsQ0FBQztBQUVwSSxPQUFPLEVBQUUscUJBQXFCLEVBQUUsTUFBTSw0REFBNEQsQ0FBQztBQUNuRyxPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0scUJBQXFCLENBQUM7QUFDdEQsT0FBTyxFQUFvQixpQkFBaUIsRUFBRSxtQkFBbUIsRUFBRSxxQkFBcUIsRUFBRSxNQUFNLDBCQUEwQixDQUFDO0FBQzNILE9BQU8sRUFBRSxPQUFPLEVBQVMsTUFBTSxrQ0FBa0MsQ0FBQztBQUNsRSxPQUFPLEVBQUUsb0JBQW9CLEVBQUUsTUFBTSwwREFBMEQsQ0FBQztBQUNoRyxPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0sZ0RBQWdELENBQUM7QUFDekUsT0FBTyxFQUFFLG1CQUFtQixFQUFFLE1B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