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
import * as dom from '../../../../base/browser/dom.js';
import * as nls from '../../../../nls.js';
import { renderMarkdown } from '../../../../base/browser/markdownRenderer.js';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { CommentNode, ResourceWithCommentThreads } from '../common/commentModel.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IListService, WorkbenchObjectTree } from '../../../../platform/list/browser/listService.js';
import { IThemeService } from '../../../../platform/theme/common/themeService.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { TimestampWidget } from './timestamp.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { commentViewThreadStateColorVar, getCommentThreadStateIconColor } from './commentColors.js';
import { CommentThreadApplicability, CommentThreadState, CommentState } from '../../../../editor/common/languages.js';
import { FilterOptions } from './commentsFilterOptions.js';
import { basename } from '../../../../base/common/resources.js';
import { CommentsModel } from './commentsModel.js';
import { getDefaultHoverDelegate } from '../../../../base/browser/ui/hover/hoverDelegateFactory.js';
import { ActionBar } from '../../../../base/browser/ui/actionbar/actionbar.js';
import { createActionViewItem, getContextMenuActions } from '../../../../platform/actions/browser/menuEntryActionViewItem.js';
import { IMenuService, MenuId } from '../../../../platform/actions/common/actions.js';
import { IContextMenuService } from '../../../../platform/contextview/browser/contextView.js';
import { ActionViewItem } from '../../../../base/browser/ui/actionbar/actionViewItems.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
import { IHoverService } from '../../../../platform/hover/browser/hover.js';
export const COMMENTS_VIEW_ID = 'workbench.panel.comments';
export const COMMENTS_VIEW_STORAGE_ID = 'Comments';
export const COMMENTS_VIEW_TITLE = nls.localize2('comments.view.title', "Comments");
class CommentsModelVirtualDelegate {
    static { this.RESOURCE_ID = 'resource-with-comments'; }
    static { this.COMMENT_ID = 'comment-node'; }
    getHeight(element) {
        if ((element instanceof CommentNode) && element.hasReply()) {
            return 44;
        }
        return 22;
    }
    getTemplateId(element) {
        if (element instanceof ResourceWithCommentThreads) {
            return CommentsModelVirtualDelegate.RESOURCE_ID;
        }
        if (element instanceof CommentNode) {
            return CommentsModelVirtualDelegate.COMMENT_ID;
        }
        return '';
    }
}
export class ResourceWithCommentsRenderer {
    constructor(labels) {
        this.labels = labels;
        this.templateId = 'resource-with-comments';
    }
    renderTemplate(container) {
        const labelContainer = dom.append(container, dom.$('.resource-container'));
        const resourceLabel = this.labels.create(labelContainer);
        const separator = dom.append(labelContainer, dom.$('.separator'));
        const owner = labelContainer.appendChild(dom.$('.owner'));
        return { resourceLabel, owner, separator };
    }
    renderElement(node, index, templateData) {
        templateData.resourceLabel.setFile(node.element.resource);
        templateData.separator.innerText = '\u00b7';
        if (node.element.ownerLabel) {
            templateData.owner.innerText = node.element.ownerLabel;
            templateData.separator.style.display = 'inline';
        }
        else {
            templateData.owner.innerText = '';
            templateData.separator.style.display = 'none';
        }
    }
    disposeTemplate(templateData) {
        templateData.resourceLabel.dispose();
    }
}
let CommentsMenus = class CommentsMenus {
    constructor(menuService) {
        this.menuService = menuService;
    }
    getResourceActions(element) {
        const actions = this.getActions(MenuId.CommentsViewThreadActions, element);
        return { actions: actions.primary };
    }
    getResourceContextActions(element) {
        return this.getActions(MenuId.CommentsViewThreadActions, element).secondary;
    }
    setContextKeyService(service) {
        this.contextKeyService = service;
    }
    getActions(menuId, element) {
        if (!this.contextKeyService) {
            return { primary: [], secondary: [] };
        }
        const overlay = [
            ['commentController', element.owner],
            ['resourceScheme', element.resource.scheme],
            ['commentThread', element.contextValue],
            ['canReply', element.thread.canReply]
        ];
        const contextKeyService = this.contextKeyService.createOverlay(overlay);
        const menu = this.menuService.getMenuActions(menuId, contextKeyService, { shouldForwardArgs: true });
        return getContextMenuActions(menu, 'inline');
    }
    dispose() {
        this.contextKeyService = undefined;
    }
};
CommentsMenus = __decorate([
    __param(0, IMenuService)
], CommentsMenus);
export { CommentsMenus };
let CommentNodeRenderer = class CommentNodeRenderer {
    constructor(actionViewItemProvider, menus, configurationService, hoverService, themeService) {
        this.actionViewItemProvider = actionViewItemProvider;
        this.menus = menus;
        this.configurationService = configurationService;
        this.hoverService = hoverService;
        this.themeService = themeService;
        this.templateId = 'comment-node';
    }
    renderTemplate(container) {
        const threadContainer = dom.append(container, dom.$('.comment-thread-container'));
        const metadataContainer = dom.append(threadContainer, dom.$('.comment-metadata-container'));
        const metadata = dom.append(metadataContainer, dom.$('.comment-metadata'));
        const icon = dom.append(metadata, dom.$('.icon'));
        const userNames = dom.append(metadata, dom.$('.user'));
        const timestamp = new TimestampWidget(this.configurationService, this.hoverService, dom.append(metadata, dom.$('.timestamp-container')));
        const relevance = dom.append(metadata, dom.$('.relevance'));
        const separator = dom.append(metadata, dom.$('.separator'));
        const commentPreview = dom.append(metadata, dom.$('.text'));
        const rangeContainer = dom.append(metadata, dom.$('.range'));
        const range = dom.$('p');
        rangeContainer.appendChild(range);
        const threadMetadata = {
            icon,
            userNames,
            timestamp,
            relevance,
            separator,
            commentPreview,
            range
        };
        threadMetadata.separator.innerText = '\u00b7';
        const actionsContainer = dom.append(metadataContainer, dom.$('.actions'));
        const actionBar = new ActionBar(actionsContainer, {
            actionViewItemProvider: this.actionViewItemProvider
        });
        const snippetContainer = dom.append(threadContainer, dom.$('.comment-snippet-container'));
        const repliesMetadata = {
            container: snippetContainer,
            icon: dom.append(snippetContainer, dom.$('.icon')),
            count: dom.append(snippetContainer, dom.$('.count')),
            lastReplyDetail: dom.append(snippetContainer, dom.$('.reply-detail')),
            separator: dom.append(snippetContainer, dom.$('.separator')),
            timestamp: new TimestampWidget(this.configurationService, this.hoverService, dom.append(snippetContainer, dom.$('.timestamp-container'))),
        };
        repliesMetadata.separator.innerText = '\u00b7';
        repliesMetadata.icon.classList.add(...ThemeIcon.asClassNameArray(Codicon.indent));
        const disposables = [threadMetadata.timestamp, repliesMetadata.timestamp];
        return { threadMetadata, repliesMetadata, actionBar, disposables, elementDisposables: new DisposableStore() };
    }
    getCountString(commentCount) {
        if (commentCount > 2) {
            return nls.localize('commentsCountReplies', "{0} replies", commentCount - 1);
        }
        else if (commentCount === 2) {
            return nls.localize('commentsCountReply', "1 reply");
        }
        else {
            return nls.localize('commentCount', "1 comment");
        }
    }
    getRenderedComment(commentBody) {
        const renderedComment = renderMarkdown(commentBody, {}, document.createElement('span'));
        // eslint-disable-next-line no-restricted-syntax
        const images = renderedComment.element.getElementsByTagName('img');
        for (let i = 0; i < images.length; i++) {
            const image = images[i];
            const textDescription = dom.$('');
            textDescription.textContent = image.alt ? nls.localize('imageWithLabel', "Image: {0}", image.alt) : nls.localize('image', "Image");
            image.replaceWith(textDescription);
        }
        // eslint-disable-next-line no-restricted-syntax
        const headings = [...renderedComment.element.getElementsByTagName('h1'), ...renderedComment.element.getElementsByTagName('h2'), ...renderedComment.element.getElementsByTagName('h3'), ...renderedComment.element.getElementsByTagName('h4'), ...renderedComment.element.getElementsByTagName('h5'), ...renderedComment.element.getElementsByTagName('h6')];
        for (const heading of headings) {
            const textNode = document.createTextNode(heading.textContent || '');
            heading.replaceWith(textNode);
        }
        while ((renderedComment.element.children.length > 1) && (renderedComment.element.firstElementChild?.tagName === 'HR')) {
            renderedComment.element.removeChild(renderedComment.element.firstElementChild);
        }
        return renderedComment;
    }
    getIcon(threadState, hasDraft) {
        // Priority: draft > unresolved > resolved
        if (hasDraft) {
            return Codicon.commentDraft;
        }
        else if (threadState === CommentThreadState.Unresolved) {
            return Codicon.commentUnresolved;
        }
        else {
            return Codicon.comment;
        }
    }
    renderElement(node, index, templateData) {
        templateData.actionBar.clear();
        const commentCount = node.element.replies.length + 1;
        if (node.element.threadRelevance === CommentThreadApplicability.Outdated) {
            templateData.threadMetadata.relevance.style.display = '';
            templateData.threadMetadata.relevance.innerText = nls.localize('outdated', "Outdated");
            templateData.threadMetadata.separator.style.display = 'none';
        }
        else {
            templateData.threadMetadata.relevance.innerText = '';
            templateData.threadMetadata.relevance.style.display = 'none';
            templateData.threadMetadata.separator.style.display = '';
        }
        templateData.threadMetadata.icon.classList.remove(...Array.from(templateData.threadMetadata.icon.classList.values())
            .filter(value => value.startsWith('codicon')));
        // Check if any comment in the thread has draft state
        const hasDraft = node.element.thread.comments?.some(comment => comment.state === CommentState.Draft);
        templateData.threadMetadata.icon.classList.add(...ThemeIcon.asClassNameArray(this.getIcon(node.element.threadState, hasDraft)));
        if (node.element.threadState !== undefined) {
            const color = this.getCommentThreadWidgetStateColor(node.element.threadState, this.themeService.getColorTheme());
            templateData.threadMetadata.icon.style.setProperty(commentViewThreadStateColorVar, `${color}`);
            templateData.threadMetadata.icon.style.color = `var(${commentViewThreadStateColorVar})`;
        }
        templateData.threadMetadata.userNames.textContent = node.element.comment.userName;
        templateData.threadMetadata.timestamp.setTimestamp(node.element.comment.timestamp ? new Date(node.element.comment.timestamp) : undefined);
        const originalComment = node.element;
        templateData.threadMetadata.commentPreview.innerText = '';
        templateData.threadMetadata.commentPreview.style.height = '22px';
        if (typeof originalComment.comment.body === 'string') {
            templateData.threadMetadata.commentPreview.innerText = originalComment.comment.body;
        }
        else {
            const renderedComment = this.getRenderedComment(originalComment.comment.body);
            templateData.elementDisposables.add(renderedComment);
            for (let i = renderedComment.element.children.length - 1; i >= 1; i--) {
                renderedComment.element.removeChild(renderedComment.element.children[i]);
            }
            templateData.threadMetadata.commentPreview.appendChild(renderedComment.element);
            templateData.elementDisposables.add(this.hoverService.setupManagedHover(getDefaultHoverDelegate('mouse'), templateData.threadMetadata.commentPreview, renderedComment.element.textContent ?? ''));
        }
        if (node.element.range) {
            if (node.element.range.startLineNumber === node.element.range.endLineNumber) {
                templateData.threadMetadata.range.textContent = nls.localize('commentLine', "[Ln {0}]", node.element.range.startLineNumber);
            }
            else {
                templateData.threadMetadata.range.textContent = nls.localize('commentRange', "[Ln {0}-{1}]", node.element.range.startLineNumber, node.element.range.endLineNumber);
            }
        }
        const menuActions = this.menus.getResourceActions(node.element);
        templateData.actionBar.push(menuActions.actions, { icon: true, label: false });
        templateData.actionBar.context = {
            commentControlHandle: node.element.controllerHandle,
            commentThreadHandle: node.element.threadHandle,
            $mid: 7 /* MarshalledId.CommentThread */
        };
        if (!node.element.hasReply()) {
            templateData.repliesMetadata.container.style.display = 'none';
            return;
        }
        templateData.repliesMetadata.container.style.display = '';
        templateData.repliesMetadata.count.textContent = this.getCountString(commentCount);
        const lastComment = node.element.replies[node.element.replies.length - 1].comment;
        templateData.repliesMetadata.lastReplyDetail.textContent = nls.localize('lastReplyFrom', "Last reply from {0}", lastComment.userName);
        templateData.repliesMetadata.timestamp.setTimestamp(lastComment.timestamp ? new Date(lastComment.timestamp) : undefined);
    }
    getCommentThreadWidgetStateColor(state, theme) {
        return (state !== undefined) ? getCommentThreadStateIconColor(state, theme) : undefined;
    }
    disposeElement(_node, _index, templateData) {
        templateData.elementDisposables.clear();
    }
    disposeTemplate(templateData) {
        templateData.disposables.forEach(disposeable => disposeable.dispose());
        templateData.elementDisposables.dispose();
        templateData.actionBar.dispose();
    }
};
CommentNodeRenderer = __decorate([
    __param(2, IConfigurationService),
    __param(3, IHoverService),
    __param(4, IThemeService)
], CommentNodeRenderer);
export { CommentNodeRenderer };
var FilterDataType;
(function (FilterDataType) {
    FilterDataType[FilterDataType["Resource"] = 0] = "Resource";
    FilterDataType[FilterDataType["Comment"] = 1] = "Comment";
})(FilterDataType || (FilterDataType = {}));
export class Filter {
    constructor(options) {
        this.options = options;
    }
    filter(element, parentVisibility) {
        if (this.options.filter === '' && this.options.showResolved && this.options.showUnresolved) {
            return 1 /* TreeVisibility.Visible */;
        }
        if (element instanceof ResourceWithCommentThreads) {
            return this.filterResourceMarkers(element);
        }
        else {
            return this.filterCommentNode(element, parentVisibility);
        }
    }
    filterResourceMarkers(resourceMarkers) {
        // Filter by text. Do not apply negated filters on resources instead use exclude patterns
        if (this.options.textFilter.text && !this.options.textFilter.negate) {
            const uriMatches = FilterOptions._filter(this.options.textFilter.text, basename(resourceMarkers.resource));
            if (uriMatches) {
                return { visibility: true, data: { type: 0 /* FilterDataType.Resource */, uriMatches: uriMatches || [] } };
            }
        }
        return 2 /* TreeVisibility.Recurse */;
    }
    filterCommentNode(comment, parentVisibility) {
        const matchesResolvedState = (comment.threadState === undefined) || (this.options.showResolved && CommentThreadState.Resolved === comment.threadState) ||
            (this.options.showUnresolved && CommentThreadState.Unresolved === comment.threadState);
        if (!matchesResolvedState) {
            return false;
        }
        if (!this.options.textFilter.text) {
            return true;
        }
        const textMatches = 
        // Check body of comment for value
        FilterOptions._messageFilter(this.options.textFilter.text, typeof comment.comment.body === 'string' ? comment.comment.body : comment.comment.body.value)
            // Check first user for value
            || FilterOptions._messageFilter(this.options.textFilter.text, comment.comment.userName)
            // Check all replies for value
            || comment.replies.map(reply => {
                // Check user for value
                return FilterOptions._messageFilter(this.options.textFilter.text, reply.comment.userName)
                    // Check body of reply for value
                    || FilterOptions._messageFilter(this.options.textFilter.text, typeof reply.comment.body === 'string' ? reply.comment.body : reply.comment.body.value);
            }).filter(value => !!value).flat();
        // Matched and not negated
        if (textMatches.length && !this.options.textFilter.negate) {
            return { visibility: true, data: { type: 1 /* FilterDataType.Comment */, textMatches } };
        }
        // Matched and negated - exclude it only if parent visibility is not set
        if (textMatches.length && this.options.textFilter.negate && parentVisibility === 2 /* TreeVisibility.Recurse */) {
            return false;
        }
        // Not matched and negated - include it only if parent visibility is not set
        if ((textMatches.length === 0) && this.options.textFilter.negate && parentVisibility === 2 /* TreeVisibility.Recurse */) {
            return true;
        }
        return parentVisibility;
    }
}
let CommentsList = class CommentsList extends WorkbenchObjectTree {
    constructor(labels, container, options, contextKeyService, listService, instantiationService, configurationService, contextMenuService, keybindingService) {
        const delegate = new CommentsModelVirtualDelegate();
        const actionViewItemProvider = createActionViewItem.bind(undefined, instantiationService);
        const menus = instantiationService.createInstance(CommentsMenus);
        menus.setContextKeyService(contextKeyService);
        const renderers = [
            instantiationService.createInstance(ResourceWithCommentsRenderer, labels),
            instantiationService.createInstance(CommentNodeRenderer, actionViewItemProvider, menus)
        ];
        super('CommentsTree', container, delegate, renderers, {
            accessibilityProvider: options.accessibilityProvider,
            identityProvider: {
                getId: (element) => {
                    if (element instanceof CommentsModel) {
                        return 'root';
                    }
                    if (element instanceof ResourceWithCommentThreads) {
                        return `${element.uniqueOwner}-${element.id}`;
                    }
                    if (element instanceof CommentNode) {
                        return `${element.uniqueOwner}-${element.resource.toString()}-${element.threadId}-${element.comment.uniqueIdInThread}` + (element.isRoot ? '-root' : '');
                    }
                    return '';
                }
            },
            expandOnlyOnTwistieClick: true,
            collapseByDefault: false,
            overrideStyles: options.overrideStyles,
            filter: options.filter,
            sorter: options.sorter,
            findWidgetEnabled: false,
            multipleSelectionSupport: false,
        }, instantiationService, contextKeyService, listService, configurationService);
        this.contextMenuService = contextMenuService;
        this.keybindingService = keybindingService;
        this.menus = menus;
        this.disposables.add(this.onContextMenu(e => this.commentsOnContextMenu(e)));
    }
    commentsOnContextMenu(treeEvent) {
        const node = treeEvent.element;
        if (!(node instanceof CommentNode)) {
            return;
        }
        const event = treeEvent.browserEvent;
        event.preventDefault();
        event.stopPropagation();
        this.setFocus([node]);
        const actions = this.menus.getResourceContextActions(node);
        if (!actions.length) {
            return;
        }
        this.contextMenuService.showContextMenu({
            getAnchor: () => treeEvent.anchor,
            getActions: () => actions,
            getActionViewItem: (action) => {
                const keybinding = this.keybindingService.lookupKeybinding(action.id);
                if (keybinding) {
                    return new ActionViewItem(action, action, { label: true, keybinding: keybinding.getLabel() });
                }
                return undefined;
            },
            onHide: (wasCancelled) => {
                if (wasCancelled) {
                    this.domFocus();
                }
            },
            getActionsContext: () => ({
                commentControlHandle: node.controllerHandle,
                commentThreadHandle: node.threadHandle,
                $mid: 7 /* MarshalledId.CommentThread */,
                thread: node.thread
            })
        });
    }
    filterComments() {
        this.refilter();
    }
    getVisibleItemCount() {
        let filtered = 0;
        const root = this.getNode();
        for (const resourceNode of root.children) {
            for (const commentNode of resourceNode.children) {
                if (commentNode.visible && resourceNode.visible) {
                    filtered++;
                }
            }
        }
        return filtered;
    }
};
CommentsList = __decorate([
    __param(3, IContextKeyService),
    __param(4, IListService),
    __param(5, IInstantiationService),
    __param(6, IConfigurationService),
    __param(7, IContextMenuService),
    __param(8, IKeybindingService)
], CommentsList);
export { CommentsList };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY29tbWVudHNUcmVlVmlld2VyLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvY29tbWVudHMvYnJvd3Nlci9jb21tZW50c1RyZWVWaWV3ZXIudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7QUFFaEcsT0FBTyxLQUFLLEdBQUcsTUFBTSxpQ0FBaUMsQ0FBQztBQUN2RCxPQUFPLEtBQUssR0FBRyxNQUFNLG9CQUFvQixDQUFDO0FBQzFDLE9BQU8sRUFBRSxjQUFjLEVBQUUsTUFBTSw4Q0FBOEMsQ0FBQztBQUM5RSxPQUFPLEVBQWUsZUFBZSxFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFFcEYsT0FBTyxFQUFFLFdBQVcsRUFBRSwwQkFBMEIsRUFBRSxNQUFNLDJCQUEyQixDQUFDO0FBR3BGLE9BQU8sRUFBRSxxQkFBcUIsRUFBRSxNQUFNLDREQUE0RCxDQUFDO0FBQ25HLE9BQU8sRUFBRSxrQkFBa0IsRUFBRSxNQUFNLHNEQUFzRCxDQUFDO0FBQzFGLE9BQU8sRUFBRSxZQUFZLEVBQWtDLG1CQUFtQixFQUFFLE1BQU0sa0RBQWtELENBQUM7QUFDckksT0FBTyxFQUFlLGFBQWEsRUFBRSxNQUFNLG1EQUFtRCxDQUFDO0FBQy9GLE9BQU8sRUFBRSxxQkFBcUIsRUFBRSxNQUFNLDREQUE0RCxDQUFDO0FBQ25HLE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSxnQkFBZ0IsQ0FBQztBQUNqRCxPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0scUNBQXFDLENBQUM7QUFDOUQsT0FBTyxFQUFFLFNBQVMsRUFBRSxNQUFNLHNDQUFzQyxDQUFDO0FBRWpFLE9BQU8sRUFBRSw4QkFBOEIsRUFBRSw4QkFBOEIsRUFBRSxNQUFNLG9CQUFvQixDQUFDO0FBQ3BHLE9BQU8sRUFBRSwwQkFBMEIsRUFBRSxrQkFBa0IsRUFBRSxZQUFZ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