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
import './media/panel.css';
import * as nls from '../../../../nls.js';
import * as dom from '../../../../base/browser/dom.js';
import { basename } from '../../../../base/common/resources.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IThemeService } from '../../../../platform/theme/common/themeService.js';
import { CommentNode, ResourceWithCommentThreads } from '../common/commentModel.js';
import { ICommentService } from './commentService.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { ResourceLabels } from '../../../browser/labels.js';
import { CommentsList, COMMENTS_VIEW_TITLE, Filter } from './commentsTreeViewer.js';
import { FilterViewPane } from '../../../browser/parts/views/viewPane.js';
import { IViewDescriptorService } from '../../../common/views.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IContextKeyService, RawContextKey } from '../../../../platform/contextkey/common/contextkey.js';
import { IContextMenuService } from '../../../../platform/contextview/browser/contextView.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
import { IOpenerService } from '../../../../platform/opener/common/opener.js';
import { IUriIdentityService } from '../../../../platform/uriIdentity/common/uriIdentity.js';
import { CommentsViewFilterFocusContextKey } from './comments.js';
import { CommentsFilters } from './commentsViewActions.js';
import { Memento } from '../../../common/memento.js';
import { IStorageService } from '../../../../platform/storage/common/storage.js';
import { FilterOptions } from './commentsFilterOptions.js';
import { CommentThreadApplicability, CommentThreadState } from '../../../../editor/common/languages.js';
import { revealCommentThread } from './commentsController.js';
import { registerNavigableContainer } from '../../../browser/actions/widgetNavigationCommands.js';
import { CommentsModel, threadHasMeaningfulComments } from './commentsModel.js';
import { IHoverService } from '../../../../platform/hover/browser/hover.js';
import { AccessibleViewAction } from '../../accessibility/browser/accessibleViewActions.js';
import { IPathService } from '../../../services/path/common/pathService.js';
import { isCodeEditor } from '../../../../editor/browser/editorBrowser.js';
export const CONTEXT_KEY_HAS_COMMENTS = new RawContextKey('commentsView.hasComments', false);
export const CONTEXT_KEY_SOME_COMMENTS_EXPANDED = new RawContextKey('commentsView.someCommentsExpanded', false);
export const CONTEXT_KEY_COMMENT_FOCUSED = new RawContextKey('commentsView.commentFocused', false);
const VIEW_STORAGE_ID = 'commentsViewState';
function createResourceCommentsIterator(model) {
    const result = [];
    for (const m of model.resourceCommentThreads) {
        const children = [];
        for (const r of m.commentThreads) {
            if (threadHasMeaningfulComments(r.thread)) {
                children.push({ element: r });
            }
        }
        if (children.length > 0) {
            result.push({ element: m, children });
        }
    }
    return result;
}
let CommentsPanel = class CommentsPanel extends FilterViewPane {
    get focusedCommentNode() {
        const focused = this.tree?.getFocus();
        if (focused?.length === 1 && focused[0] instanceof CommentNode) {
            return focused[0];
        }
        return undefined;
    }
    get focusedCommentInfo() {
        if (!this.focusedCommentNode) {
            return;
        }
        return this.getScreenReaderInfoForNode(this.focusedCommentNode);
    }
    focusNextNode() {
        if (!this.tree) {
            return;
        }
        const focused = this.tree.getFocus()?.[0];
        if (!focused) {
            return;
        }
        let next = this.tree.navigate(focused).next();
        while (next && !(next instanceof CommentNode)) {
            next = this.tree.navigate(next).next();
        }
        if (!next) {
            return;
        }
        this.tree.setFocus([next]);
    }
    focusPreviousNode() {
        if (!this.tree) {
            return;
        }
        const focused = this.tree.getFocus()?.[0];
        if (!focused) {
            return;
        }
        let previous = this.tree.navigate(focused).previous();
        while (previous && !(previous instanceof CommentNode)) {
            previous = this.tree.navigate(previous).previous();
        }
        if (!previous) {
            return;
        }
        this.tree.setFocus([previous]);
    }
    constructor(options, instantiationService, viewDescriptorService, editorService, configurationService, contextKeyService, contextMenuService, keybindingService, openerService, themeService, commentService, hoverService, uriIdentityService, storageService, pathService) {
        const stateMemento = new Memento(VIEW_STORAGE_ID, storageService);
        const viewState = stateMemento.getMemento(1 /* StorageScope.WORKSPACE */, 1 /* StorageTarget.MACHINE */);
        super({
            ...options,
            filterOptions: {
                placeholder: nls.localize('comments.filter.placeholder', "Filter (e.g. text, author)"),
                ariaLabel: nls.localize('comments.filter.ariaLabel', "Filter comments"),
                history: viewState.filterHistory || [],
                text: viewState.filter || '',
                focusContextKey: CommentsViewFilterFocusContextKey.key
            }
        }, keybindingService, contextMenuService, configurationService, contextKeyService, viewDescriptorService, instantiationService, openerService, themeService, hoverService);
        this.editorService = editorService;
        this.commentService = commentService;
        this.uriIdentityService = uriIdentityService;
        this.pathService = pathService;
        this.totalComments = 0;
        this.currentHeight = 0;
        this.currentWidth = 0;
        this.cachedFilterStats = undefined;
        this.onDidChangeVisibility = this.onDidChangeBodyVisibility;
        this.hasCommentsContextKey = CONTEXT_KEY_HAS_COMMENTS.bindTo(contextKeyService);
        this.someCommentsExpandedContextKey = CONTEXT_KEY_SOME_COMMENTS_EXPANDED.bindTo(contextKeyService);
        this.commentsFocusedContextKey = CONTEXT_KEY_COMMENT_FOCUSED.bindTo(contextKeyService);
        this.stateMemento = stateMemento;
        this.viewState = viewState;
        this.filters = this._register(new CommentsFilters({
            showResolved: this.viewState.showResolved !== false,
            showUnresolved: this.viewState.showUnresolved !== false,
            sortBy: this.viewState.sortBy ?? "resourceAscending" /* CommentsSortOrder.ResourceAscending */,
        }, this.contextKeyService));
        this.filter = new Filter(new FilterOptions(this.filterWidget.getFilterText(), this.filters.showResolved, this.filters.showUnresolved));
        this._register(this.filters.onDidChange((event) => {
            if (event.showResolved || event.showUnresolved) {
                this.updateFilter();
            }
            if (event.sortBy) {
                this.refresh();
            }
        }));
        this._register(this.filterWidget.onDidChangeFilterText(() => this.updateFilter()));
    }
    saveState() {
        this.viewState.filter = this.filterWidget.getFilterText();
        this.viewState.filterHistory = this.filterWidget.getHistory();
        this.viewState.showResolved = this.filters.showResolved;
        this.viewState.showUnresolved = this.filters.showUnresolved;
        this.viewState.sortBy = this.filters.sortBy;
        this.stateMemento.saveMemento();
        super.saveState();
    }
    render() {
        super.render();
        this._register(registerNavigableContainer({
            name: 'commentsView',
            focusNotifiers: [this, this.filterWidget],
            focusNextWidget: () => {
                if (this.filterWidget.hasFocus()) {
                    this.focus();
                }
            },
            focusPreviousWidget: () => {
                if (!this.filterWidget.hasFocus()) {
                    this.focusFilter();
                }
            }
        }));
    }
    focusFilter() {
        this.filterWidget.focus();
    }
    clearFilterText() {
        this.filterWidget.setFilterText('');
    }
    getFilterStats() {
        if (!this.cachedFilterStats) {
            this.cachedFilterStats = {
                total: this.totalComments,
                filtered: this.tree?.getVisibleItemCount() ?? 0
            };
        }
        return this.cachedFilterStats;
    }
    updateFilter() {
        this.filter.options = new FilterOptions(this.filterWidget.getFilterText(), this.filters.showResolved, this.filters.showUnresolved);
        this.tree?.filterComments();
        this.cachedFilterStats = undefined;
        const { total, filtered } = this.getFilterStats();
        this.filterWidget.updateBadge(total === filtered || total === 0 ? undefined : nls.localize('showing filtered results', "Showing {0} of {1}", filtered, total));
        this.filterWidget.checkMoreFilters(!this.filters.showResolved || !this.filters.showUnresolved);
    }
    renderBody(container) {
        super.renderBody(container);
        container.classList.add('comments-panel');
        const domContainer = dom.append(container, dom.$('.comments-panel-container'));
        this.treeContainer = dom.append(domContainer, dom.$('.tree-container'));
        this.treeContainer.classList.add('file-icon-themable-tree', 'show-file-icons');
        this.cachedFilterStats = undefined;
        this.createTree();
        this.createMessageBox(domContainer);
        this._register(this.commentService.onDidSetAllCommentThreads(this.onAllCommentsChanged, this));
        this._register(this.commentService.onDidUpdateCommentThreads(this.onCommentsUpdated, this));
        this._register(this.commentService.onDidDeleteDataProvider(this.onDataProviderDeleted, this));
        this._register(this.onDidChangeBodyVisibility(visible => {
            if (visible) {
                this.refresh();
            }
        }));
        this.renderComments();
    }
    focus() {
        super.focus();
        const element = this.tree?.getHTMLElement();
        if (element && dom.isActiveElement(element)) {
            return;
        }
        if (!this.commentService.commentsModel.hasCommentThreads() && this.messageBoxContainer) {
            this.messageBoxContainer.focus();
        }
        else if (this.tree) {
            this.tree.domFocus();
        }
    }
    renderComments() {
        this.treeContainer.classList.toggle('hidden', !this.commentService.commentsModel.hasCommentThreads());
        this.renderMessage();
        this.tree?.setChildren(null, createResourceCommentsIterator(this.commentService.commentsModel));
    }
    collapseAll() {
        if (this.tree) {
            this.tree.collapseAll();
            this.tree.setSelection([]);
            this.tree.setFocus([]);
            this.tree.domFocus();
            this.tree.focusFirst();
        }
    }
    expandAll() {
        if (this.tree) {
            this.tree.expandAll();
            this.tree.setSelection([]);
            this.tree.setFocus([]);
            this.tree.domFocus();
            this.tree.focusFirst();
        }
    }
    get hasRendered() {
        return !!this.tree;
    }
    layoutBodyContent(height = this.currentHeight, width = this.currentWidth) {
        if (this.messageBoxContainer) {
            this.messageBoxContainer.style.height = `${height}px`;
        }
        this.tree?.layout(height, width);
        this.currentHeight = height;
        this.currentWidth = width;
    }
    createMessageBox(parent) {
        this.messageBoxContainer = dom.append(parent, dom.$('.message-box-container'));
        this.messageBoxContainer.setAttribute('tabIndex', '0');
    }
    renderMessage() {
        this.messageBoxContainer.textContent = this.commentService.commentsModel.getMessage();
        this.messageBoxContainer.classList.toggle('hidden', this.commentService.commentsModel.hasCommentThreads());
    }
    makeCommentLocationLabel(file, range) {
        const fileLabel = basename(file);
        if (!range) {
            return nls.localize('fileCommentLabel', "in {0}", fileLabel);
        }
        if (range.startLineNumber === range.endLineNumber) {
            return nls.localize('oneLineCommentLabel', "at line {0} column {1} in {2}", range.startLineNumber, range.startColumn, fileLabel);
        }
        else {
            return nls.localize('multiLineCommentLabel', "from line {0} to line {1} in {2}", range.startLineNumber, range.endLineNumber, fileLabel);
        }
    }
    makeScreenReaderLabelInfo(element, forAriaLabel) {
        const userName = element.comment.userName;
        const locationLabel = this.makeCommentLocationLabel(element.resource, element.range);
        const replyCountLabel = this.getReplyCountAsString(element, forAriaLabel);
        const bodyLabel = (typeof element.comment.body === 'string') ? element.comment.body : element.comment.body.value;
        return { userName, locationLabel, replyCountLabel, bodyLabel };
    }
    getScreenReaderInfoForNode(element, forAriaLabel) {
        let accessibleViewHint = '';
        if (forAriaLabel && this.configurationService.getValue("accessibility.verbosity.comments" /* AccessibilityVerbositySettingId.Comments */)) {
            const kbLabel = this.keybindingService.lookupKeybinding(AccessibleViewAction.id)?.getAriaLabel();
            accessibleViewHint = kbLabel ? nls.localize('accessibleViewHint', "\nInspect this in the accessible view ({0}).", kbLabel) : nls.localize('acessibleViewHintNoKbOpen', "\nInspect this in the accessible view via the command Open Accessible View which is currently not triggerable via keybinding.");
        }
        const replies = this.getRepliesAsString(element, forAriaLabel);
        const editor = this.editorService.findEditors(element.resource);
        const codeEditor = this.editorService.activeEditorPane?.getControl();
        let relevantLines;
        if (element.range && editor?.length && isCodeEditor(codeEditor)) {
            relevantLines = codeEditor.getModel()?.getValueInRange(element.range);
            if (relevantLines) {
                relevantLines = '\nCorresponding code: \n' + relevantLines;
            }
        }
        if (!relevantLines) {
            relevantLines = '';
        }
        const labelInfo = this.makeScreenReaderLabelInfo(element, forAriaLabel);
        if (element.threadRelevance === CommentThreadApplicability.Outdated) {
            return nls.localize('resourceWithCommentLabelOutdated', "Outdated from {0}: {1}\n{2}\n{3}\n{4}", labelInfo.userName, labelInfo.bodyLabel, labelInfo.locationLabel, labelInfo.replyCountLabel, relevantLines) + replies + accessibleViewHint;
        }
        else {
            return nls.localize('resourceWithCommentLabel', "{0}: {1}\n{2}\n{3}\n{4}", labelInfo.userName, labelInfo.bodyLabel, labelInfo.locationLabel, labelInfo.replyCountLabel, relevantLines) + replies + accessibleViewHint;
        }
    }
    getRepliesAsString(node, forAriaLabel) {
        if (!node.replies.length || forAriaLabel) {
            return '';
        }
        return '\n' + node.replies.map(reply => nls.localize('resourceWithRepliesLabel', "{0} {1}", reply.comment.userName, (typeof reply.comment.body === 'string') ? reply.comment.body : reply.comment.body.value)).join('\n');
    }
    getReplyCountAsString(node, forAriaLabel) {
        return node.replies.length && !forAriaLabel ? nls.localize('replyCount', " {0} replies,", node.replies.length) : '';
    }
    createTree() {
        this.treeLabels = this._register(this.instantiationService.createInstance(ResourceLabels, this));
        this.tree = this._register(this.instantiationService.createInstance(CommentsList, this.treeLabels, this.treeContainer, {
            overrideStyles: this.getLocationBasedColors().listOverrideStyles,
            selectionNavigation: true,
            filter: this.filter,
            sorter: {
                compare: (a, b) => {
                    if (a instanceof CommentsModel || b instanceof CommentsModel) {
                        return 0;
                    }
                    if (this.filters.sortBy === "updatedAtDescending" /* CommentsSortOrder.UpdatedAtDescending */) {
                        return a.lastUpdatedAt > b.lastUpdatedAt ? -1 : 1;
                    }
                    else if (this.filters.sortBy === "resourceAscending" /* CommentsSortOrder.ResourceAscending */) {
                        if (a instanceof ResourceWithCommentThreads && b instanceof ResourceWithCommentThreads) {
                            const workspaceScheme = this.pathService.defaultUriScheme;
                            if ((a.resource.scheme !== b.resource.scheme) && (a.resource.scheme === workspaceScheme || b.resource.scheme === workspaceScheme)) {
                                // Workspace scheme should always come first
                                return b.resource.scheme === workspaceScheme ? 1 : -1;
                            }
                            return a.resource.toString() > b.resource.toString() ? 1 : -1;
                        }
                        else if (a instanceof CommentNode && b instanceof CommentNode && a.thread.range && b.thread.range) {
                            return a.thread.range?.startLineNumber > b.thread.range?.startLineNumber ? 1 : -1;
                        }
                    }
                    return 0;
                },
            },
            keyboardNavigationLabelProvider: {
                getKeyboardNavigationLabel: (item) => {
                    return undefined;
                }
            },
            accessibilityProvider: {
                getAriaLabel: (element) => {
                    if (element instanceof CommentsModel) {
                        return nls.localize('rootCommentsLabel', "Comments for current workspace");
                    }
                    if (element instanceof ResourceWithCommentThreads) {
                        return nls.localize('resourceWithCommentThreadsLabel', "Comments in {0}, full path {1}", basename(element.resource), element.resource.fsPath);
                    }
                    if (element instanceof CommentNode) {
                        return this.getScreenReaderInfoForNode(element, true);
                    }
                    return '';
                },
                getWidgetAriaLabel() {
                    return COMMENTS_VIEW_TITLE.value;
                }
            }
        }));
        this._register(this.tree.onDidOpen(e => {
            this.openFile(e.element, e.editorOptions.pinned, e.editorOptions.preserveFocus, e.sideBySide);
        }));
        this._register(this.tree.onDidChangeModel(() => {
            this.updateSomeCommentsExpanded();
        }));
        this._register(this.tree.onDidChangeCollapseState(() => {
            this.updateSomeCommentsExpanded();
        }));
        this._register(this.tree.onDidFocus(() => this.commentsFocusedContextKey.set(true)));
        this._register(this.tree.onDidBlur(() => this.commentsFocusedContextKey.set(false)));
    }
    openFile(element, pinned, preserveFocus, sideBySide) {
        if (!element) {
            return;
        }
        if (!(element instanceof ResourceWithCommentThreads || element instanceof CommentNode)) {
            return;
        }
        const threadToReveal = element instanceof ResourceWithCommentThreads ? element.commentThreads[0].thread : element.thread;
        const commentToReveal = element instanceof ResourceWithCommentThreads ? element.commentThreads[0].comment : undefined;
        return revealCommentThread(this.commentService, this.editorService, this.uriIdentityService, threadToReveal, commentToReveal, false, pinned, preserveFocus, sideBySide);
    }
    async refresh() {
        if (!this.tree) {
            return;
        }
        if (this.isVisible()) {
            this.hasCommentsContextKey.set(this.commentService.commentsModel.hasCommentThreads());
            this.cachedFilterStats = undefined;
            this.renderComments();
            if (this.tree.getSelection().length === 0 && this.commentService.commentsModel.hasCommentThreads()) {
                const firstComment = this.commentService.commentsModel.resourceCommentThreads[0].commentThreads[0];
                if (firstComment) {
                    this.tree.setFocus([firstComment]);
                    this.tree.setSelection([firstComment]);
                }
            }
        }
    }
    onAllCommentsChanged(e) {
        this.cachedFilterStats = undefined;
        this.totalComments += e.commentThreads.length;
        let unresolved = 0;
        for (const thread of e.commentThreads) {
            if (thread.state === CommentThreadState.Unresolved) {
                unresolved++;
            }
        }
        this.refresh();
    }
    onCommentsUpdated(e) {
        this.cachedFilterStats = undefined;
        this.totalComments += e.added.length;
        this.totalComments -= e.removed.length;
        let unresolved = 0;
        for (const resource of this.commentService.commentsModel.resourceCommentThreads) {
            for (const thread of resource.commentThreads) {
                if (thread.threadState === CommentThreadState.Unresolved) {
                    unresolved++;
                }
            }
        }
        this.refresh();
    }
    onDataProviderDeleted(owner) {
        this.cachedFilterStats = undefined;
        this.totalComments = 0;
        this.refresh();
    }
    updateSomeCommentsExpanded() {
        this.someCommentsExpandedContextKey.set(this.isSomeCommentsExpanded());
    }
    areAllCommentsExpanded() {
        if (!this.tree) {
            return false;
        }
        const navigator = this.tree.navigate();
        while (navigator.next()) {
            if (this.tree.isCollapsed(navigator.current())) {
                return false;
            }
        }
        return true;
    }
    isSomeCommentsExpanded() {
        if (!this.tree) {
            return false;
        }
        const navigator = this.tree.navigate();
        while (navigator.next()) {
            if (!this.tree.isCollapsed(navigator.current())) {
                return true;
            }
        }
        return false;
    }
};
CommentsPanel = __decorate([
    __param(1, IInstantiationService),
    __param(2, IViewDescriptorService),
    __param(3, IEditorService),
    __param(4, IConfigurationService),
    __param(5, IContextKeyService),
    __param(6, IContextMenuService),
    __param(7, IKeybindingService),
    __param(8, IOpenerService),
    __param(9, IThemeService),
    __param(10, ICommentService),
    __param(11, IHoverService),
    __param(12, IUriIdentityService),
    __param(13, IStorageService),
    __param(14, IPathService)
], CommentsPanel);
export { CommentsPanel };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY29tbWVudHNWaWV3LmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvY29tbWVudHMvYnJvd3Nlci9jb21tZW50c1ZpZXcudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7QUFFaEcsT0FBTyxtQkFBbUIsQ0FBQztBQUMzQixPQUFPLEtBQUssR0FBRyxNQUFNLG9CQUFvQixDQUFDO0FBQzFDLE9BQU8sS0FBSyxHQUFHLE1BQU0saUNBQWlDLENBQUM7QUFDdkQsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLHNDQUFzQyxDQUFDO0FBQ2hFLE9BQU8sRUFBRSxxQkFBcUIsRUFBRSxNQUFNLDREQUE0RCxDQUFDO0FBQ25HLE9BQU8sRUFBRSxhQUFhLEVBQUUsTUFBTSxtREFBbUQsQ0FBQztBQUNsRixPQUFPLEVBQUUsV0FBVyxFQUE4QiwwQkFBMEIsRUFBRSxNQUFNLDJCQUEyQixDQUFDO0FBQ2hILE9BQU8sRUFBRSxlQUFlLEVBQWlDLE1BQU0scUJBQXFCLENBQUM7QUFDckYsT0FBTyxFQUFFLGNBQWMsRUFBRSxNQUFNLGtEQUFrRCxDQUFDO0FBQ2xGLE9BQU8sRUFBRSxjQUFjLEVBQUUsTUFBTSw0QkFBNEIsQ0FBQztBQUM1RCxPQUFPLEVBQUUsWUFBWSxFQUFFLG1CQUFtQixFQUFFLE1BQU0sRUFBRSxNQUFNLHlCQUF5QixDQUFDO0FBQ3BGLE9BQU8sRUFBb0IsY0FBYyxFQUFFLE1BQU0sMENBQTBDLENBQUM7QUFDNUYsT0FBTyxFQUFFLHNCQUFzQixFQUFFLE1BQU0sMEJBQTBCLENBQUM7QUFDbEUsT0FBTyxFQUFFLHFCQUFxQixFQUFFLE1BQU0sNERBQTRELENBQUM7QUFDbkcsT0FBTyxFQUFlLGtCQUFrQixFQUFFLGFBQWEsRUFBRSxNQUFNLHNEQUFzRCxDQUFDO0FBQ3RILE9BQU8sRUFBRSxtQkFBbUIs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