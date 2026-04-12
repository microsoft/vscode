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
var SessionsList_1;
import '../media/sessionsList.css';
import * as DOM from '../../../../../base/browser/dom.js';
import { ObjectTreeElementCollapseState } from '../../../../../base/browser/ui/tree/tree.js';
import { RenderIndentGuides, TreeFindMode } from '../../../../../base/browser/ui/tree/abstractTree.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { Emitter } from '../../../../../base/common/event.js';
import { HighlightedLabel } from '../../../../../base/browser/ui/highlightedlabel/highlightedLabel.js';
import { createMatches } from '../../../../../base/common/filters.js';
import { Disposable, DisposableStore, MutableDisposable, toDisposable } from '../../../../../base/common/lifecycle.js';
import { MarkdownString } from '../../../../../base/common/htmlContent.js';
import { autorun } from '../../../../../base/common/observable.js';
import { ThemeIcon, themeColorFromId } from '../../../../../base/common/themables.js';
import { fromNow } from '../../../../../base/common/date.js';
import { localize } from '../../../../../nls.js';
import { MenuId, IMenuService } from '../../../../../platform/actions/common/actions.js';
import { MenuWorkbenchToolBar } from '../../../../../platform/actions/browser/toolbar.js';
import { IContextKeyService, RawContextKey } from '../../../../../platform/contextkey/common/contextkey.js';
import { ChatSessionProviderIdContext } from '../../../../common/contextkeys.js';
import { IContextMenuService } from '../../../../../platform/contextview/browser/contextView.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { IKeybindingService } from '../../../../../platform/keybinding/common/keybinding.js';
import { ServiceCollection } from '../../../../../platform/instantiation/common/serviceCollection.js';
import { WorkbenchObjectTree } from '../../../../../platform/list/browser/listService.js';
import { defaultButtonStyles } from '../../../../../platform/theme/browser/defaultStyles.js';
import { asCssVariable } from '../../../../../platform/theme/common/colorUtils.js';
import { IStorageService } from '../../../../../platform/storage/common/storage.js';
import { GITHUB_REMOTE_FILE_SCHEME } from '../../common/sessionData.js';
import { ISessionsManagementService } from '../sessionsManagementService.js';
import { AgentSessionApprovalModel } from '../../../../../workbench/contrib/chat/browser/agentSessions/agentSessionApprovalModel.js';
import { Button } from '../../../../../base/browser/ui/button/button.js';
import { IMarkdownRendererService } from '../../../../../platform/markdown/browser/markdownRenderer.js';
import { Separator } from '../../../../../base/common/actions.js';
import { IHoverService } from '../../../../../platform/hover/browser/hover.js';
import { CopilotCLISessionType } from '../sessionTypes.js';
const $ = DOM.$;
export const SessionItemToolbarMenuId = new MenuId('SessionItemToolbar');
export const SessionItemContextMenuId = new MenuId('SessionItemContextMenu');
export const SessionSectionToolbarMenuId = new MenuId('SessionSectionToolbar');
export const IsSessionPinnedContext = new RawContextKey('sessionItem.isPinned', false);
export const IsSessionArchivedContext = new RawContextKey('sessionItem.isArchived', false);
export const IsSessionReadContext = new RawContextKey('sessionItem.isRead', true);
export const SessionSectionTypeContext = new RawContextKey('sessionSection.type', '');
//#region Types
export var SessionsGrouping;
(function (SessionsGrouping) {
    SessionsGrouping["Workspace"] = "workspace";
    SessionsGrouping["Date"] = "date";
})(SessionsGrouping || (SessionsGrouping = {}));
export var SessionsSorting;
(function (SessionsSorting) {
    SessionsSorting["Created"] = "created";
    SessionsSorting["Updated"] = "updated";
})(SessionsSorting || (SessionsSorting = {}));
function isSessionSection(item) {
    return 'sessions' in item && Array.isArray(item.sessions);
}
function isSessionShowMore(item) {
    return 'showMore' in item && item.showMore === true;
}
//#endregion
//#region Tree Delegate
class SessionsTreeDelegate {
    static { this.ITEM_HEIGHT = 54; }
    static { this.SECTION_HEIGHT = 26; }
    static { this.SHOW_MORE_HEIGHT = 26; }
    constructor(_approvalModel) {
        this._approvalModel = _approvalModel;
    }
    getHeight(element) {
        if (isSessionSection(element)) {
            return SessionsTreeDelegate.SECTION_HEIGHT;
        }
        if (isSessionShowMore(element)) {
            return SessionsTreeDelegate.SHOW_MORE_HEIGHT;
        }
        let height = SessionsTreeDelegate.ITEM_HEIGHT;
        if (this._approvalModel) {
            const approval = getFirstApprovalAcrossChats(this._approvalModel, element, undefined);
            if (approval) {
                height += SessionItemRenderer.getApprovalRowHeight(approval.label);
            }
        }
        return height;
    }
    hasDynamicHeight(element) {
        return !!this._approvalModel && !isSessionSection(element) && !isSessionShowMore(element);
    }
    getTemplateId(element) {
        if (isSessionSection(element)) {
            return SessionSectionRenderer.TEMPLATE_ID;
        }
        if (isSessionShowMore(element)) {
            return SessionShowMoreRenderer.TEMPLATE_ID;
        }
        return SessionItemRenderer.TEMPLATE_ID;
    }
}
class SessionItemRenderer {
    static { this.TEMPLATE_ID = 'session-item'; }
    static { this.APPROVAL_ROW_MAX_LINES = 3; }
    static { this._APPROVAL_ROW_LINE_HEIGHT = 18; }
    static { this._APPROVAL_ROW_OVERHEAD = 14; }
    static getApprovalRowHeight(label) {
        const lineCount = Math.min(label.split(/\r?\n/).length, SessionItemRenderer.APPROVAL_ROW_MAX_LINES);
        return lineCount * SessionItemRenderer._APPROVAL_ROW_LINE_HEIGHT + SessionItemRenderer._APPROVAL_ROW_OVERHEAD;
    }
    constructor(options, approvalModel, instantiationService, contextKeyService, markdownRendererService, hoverService) {
        this.options = options;
        this.approvalModel = approvalModel;
        this.instantiationService = instantiationService;
        this.contextKeyService = contextKeyService;
        this.markdownRendererService = markdownRendererService;
        this.hoverService = hoverService;
        this.templateId = SessionItemRenderer.TEMPLATE_ID;
        this._onDidChangeItemHeight = new Emitter();
        this.onDidChangeItemHeight = this._onDidChangeItemHeight.event;
    }
    renderTemplate(container) {
        const disposables = new DisposableStore();
        const elementDisposables = disposables.add(new DisposableStore());
        container.classList.add('session-item');
        const iconContainer = DOM.append(container, $('.session-icon'));
        const mainCol = DOM.append(container, $('.session-main'));
        const titleRow = DOM.append(mainCol, $('.session-title-row'));
        const title = disposables.add(new HighlightedLabel(DOM.append(titleRow, $('.session-title'))));
        const titleToolbarContainer = DOM.append(titleRow, $('.session-title-toolbar'));
        const detailsRow = DOM.append(mainCol, $('.session-details-row'));
        // Approval row
        const approvalRow = DOM.append(mainCol, $('.session-approval-row'));
        const approvalLabel = DOM.append(approvalRow, $('span.session-approval-label'));
        const approvalButtonContainer = DOM.append(approvalRow, $('.session-approval-button'));
        const contextKeyService = disposables.add(this.contextKeyService.createScoped(container));
        const scopedInstantiationService = disposables.add(this.instantiationService.createChild(new ServiceCollection([IContextKeyService, contextKeyService])));
        const titleToolbar = disposables.add(scopedInstantiationService.createInstance(MenuWorkbenchToolBar, titleToolbarContainer, SessionItemToolbarMenuId, {
            menuOptions: { shouldForwardArgs: true },
        }));
        return { container, iconContainer, title, titleToolbar, detailsRow, approvalRow, approvalLabel, approvalButtonContainer, contextKeyService, disposables, elementDisposables };
    }
    renderElement(node, _index, template) {
        const element = node.element;
        if (isSessionSection(element) || isSessionShowMore(element)) {
            return;
        }
        this.renderSession(element, template, createMatches(node.filterData));
    }
    renderSession(element, template, matches) {
        template.elementDisposables.clear();
        // Toolbar context
        template.titleToolbar.context = element;
        // Context keys
        const isPinned = this.options.isPinned(element);
        IsSessionPinnedContext.bindTo(template.contextKeyService).set(isPinned);
        IsSessionArchivedContext.bindTo(template.contextKeyService).set(element.isArchived.get());
        IsSessionReadContext.bindTo(template.contextKeyService).set(element.isRead.get());
        // Pinned & archived styling — reactive
        template.elementDisposables.add(autorun(reader => {
            const isArchived = element.isArchived.read(reader);
            template.container.classList.toggle('archived', isArchived);
            // Only apply pinned styling when not archived to avoid persistent toolbars on archived sessions
            template.container.classList.toggle('pinned', isPinned && !isArchived);
        }));
        // Icon — reactive based on status, read state, and PR
        template.elementDisposables.add(autorun(reader => {
            const sessionStatus = element.status.read(reader);
            const isRead = element.isRead.read(reader);
            const isArchived = element.isArchived.read(reader);
            const gitHubInfo = element.gitHubInfo.read(reader);
            DOM.clearNode(template.iconContainer);
            const icon = this.getStatusIcon(sessionStatus, isRead, isArchived, gitHubInfo?.pullRequest?.icon);
            const iconSpan = DOM.append(template.iconContainer, $(`span${ThemeIcon.asCSSSelector(icon)}`));
            iconSpan.style.color = icon.color ? asCssVariable(icon.color.id) : '';
            template.iconContainer.classList.toggle('session-icon-pulse', sessionStatus === 2 /* SessionStatus.NeedsInput */);
        }));
        // Title — reactive
        template.elementDisposables.add(autorun(reader => {
            const titleText = element.title.read(reader);
            template.title.set(titleText, matches);
        }));
        // Details row — reactive: badge · diff stats · time
        const timeDisposable = template.elementDisposables.add(new MutableDisposable());
        const descriptionDisposable = template.elementDisposables.add(new MutableDisposable());
        template.elementDisposables.add(autorun(reader => {
            const sessionStatus = element.status.read(reader);
            const changes = element.changes.read(reader);
            const workspace = element.workspace.read(reader);
            const description = element.description.read(reader);
            let timeDate;
            // When the session is InProgress or NeedsInput, hide workspace/diff/time details in this row
            const hideDetails = sessionStatus === 1 /* SessionStatus.InProgress */ || sessionStatus === 2 /* SessionStatus.NeedsInput */;
            if (!hideDetails) {
                timeDate = this.options.sorting() === SessionsSorting.Updated ? element.updatedAt.read(reader) : element.createdAt;
            }
            // Clear and rebuild details row
            DOM.clearNode(template.detailsRow);
            const parts = [];
            const isWorkspaceSession = workspace &&
                workspace.repositories.length > 0 &&
                workspace?.repositories[0].workingDirectory === undefined;
            // Session type icon in details row
            // Disabling background icon - hacky but couldn't figure out how to do it from the new provider
            if (element.sessionType !== CopilotCLISessionType.id) {
                const typeIconEl = DOM.append(template.detailsRow, $('span.session-details-icon'));
                DOM.append(typeIconEl, $(`span${ThemeIcon.asCSSSelector(element.icon)}`));
                parts.push(typeIconEl);
            }
            else if (element.sessionType === CopilotCLISessionType.id &&
                sessionStatus !== 1 /* SessionStatus.InProgress */ &&
                isWorkspaceSession) {
                const typeIconEl = DOM.append(template.detailsRow, $('span.session-details-icon'));
                DOM.append(typeIconEl, $(`span${ThemeIcon.asCSSSelector(Codicon.folder)}`));
                parts.push(typeIconEl);
            }
            // Workspace badge — show when not grouped by workspace,
            // or when the session is pinned/archived (their section headers
            // don't carry the workspace name)
            if (!hideDetails && workspace && (this.options.grouping() !== SessionsGrouping.Workspace ||
                this.options.isPinned(element) ||
                element.isArchived.read(reader))) {
                const badgeLabel = this.getWorkspaceBadgeLabel(workspace);
                if (badgeLabel) {
                    const badgeEl = DOM.append(template.detailsRow, $('span.session-badge'));
                    badgeEl.textContent = badgeLabel;
                    parts.push(badgeEl);
                }
            }
            // Diff stats
            if (!hideDetails && changes.length > 0) {
                let insertions = 0;
                let deletions = 0;
                for (const change of changes) {
                    insertions += change.insertions;
                    deletions += change.deletions;
                }
                if (insertions > 0 || deletions > 0) {
                    if (parts.length > 0) {
                        DOM.append(template.detailsRow, $('span.session-separator.has-separator'));
                    }
                    const diffEl = DOM.append(template.detailsRow, $('span.session-diff'));
                    DOM.append(diffEl, $('span.session-diff-added')).textContent = `+${insertions}`;
                    DOM.append(diffEl, $('span.session-diff-removed')).textContent = `-${deletions}`;
                    parts.push(diffEl);
                }
            }
            // Status description
            if (sessionStatus === 1 /* SessionStatus.InProgress */) {
                if (parts.length > 0) {
                    DOM.append(template.detailsRow, $('span.session-separator.has-separator'));
                }
                const statusEl = DOM.append(template.detailsRow, $('span.session-description'));
                if (description) {
                    descriptionDisposable.value = this.markdownRendererService.render(description, { sanitizerConfig: { replaceWithPlaintext: true } }, statusEl);
                }
                else {
                    descriptionDisposable.clear();
                    statusEl.textContent = localize('working', "Working...");
                }
                parts.push(statusEl);
            }
            else if (sessionStatus === 2 /* SessionStatus.NeedsInput */) {
                if (parts.length > 0) {
                    DOM.append(template.detailsRow, $('span.session-separator.has-separator'));
                }
                const statusEl = DOM.append(template.detailsRow, $('span.session-description'));
                if (description) {
                    descriptionDisposable.value = this.markdownRendererService.render(description, { sanitizerConfig: { replaceWithPlaintext: true } }, statusEl);
                }
                else {
                    descriptionDisposable.clear();
                    statusEl.textContent = localize('needsInput', "Input needed");
                }
                parts.push(statusEl);
            }
            else if (sessionStatus === 4 /* SessionStatus.Error */) {
                if (parts.length > 0) {
                    DOM.append(template.detailsRow, $('span.session-separator.has-separator'));
                }
                const statusEl = DOM.append(template.detailsRow, $('span.session-description'));
                if (description) {
                    descriptionDisposable.value = this.markdownRendererService.render(description, { sanitizerConfig: { replaceWithPlaintext: true } }, statusEl);
                }
                else {
                    descriptionDisposable.clear();
                    statusEl.textContent = localize('failed', "Failed");
                }
                parts.push(statusEl);
            }
            else {
                descriptionDisposable.clear();
            }
            // Timestamp — visible when not hiding details
            if (!hideDetails && timeDate) {
                if (parts.length > 0) {
                    DOM.append(template.detailsRow, $('span.session-separator.has-separator'));
                }
                const timeEl = DOM.append(template.detailsRow, $('span.session-time'));
                const definiteTimeDate = timeDate;
                const formatTime = () => {
                    const seconds = Math.round((Date.now() - definiteTimeDate.getTime()) / 1000);
                    return seconds < 60 ? localize('secondsDuration', "now") : fromNow(definiteTimeDate, true);
                };
                timeEl.textContent = formatTime();
                const targetWindow = DOM.getWindow(timeEl);
                const interval = targetWindow.setInterval(() => {
                    timeEl.textContent = formatTime();
                }, 60_000);
                timeDisposable.value = toDisposable(() => targetWindow.clearInterval(interval));
            }
            else {
                timeDisposable.clear();
            }
        }));
        // Approval row — reactive
        if (this.approvalModel) {
            this.renderApprovalRow(element, template);
        }
    }
    renderApprovalRow(element, template) {
        if (!this.approvalModel) {
            return;
        }
        const approvalModel = this.approvalModel;
        const initialInfo = getFirstApprovalAcrossChats(approvalModel, element, undefined);
        let wasVisible = !!initialInfo;
        template.approvalRow.classList.toggle('visible', wasVisible);
        const buttonStore = template.elementDisposables.add(new DisposableStore());
        template.elementDisposables.add(autorun(reader => {
            buttonStore.clear();
            const info = getFirstApprovalAcrossChats(approvalModel, element, reader);
            const visible = !!info;
            template.approvalRow.classList.toggle('visible', visible);
            if (info) {
                // Render up to 3 lines as separate code blocks
                const lines = info.label.split('\n');
                const maxLines = SessionItemRenderer.APPROVAL_ROW_MAX_LINES;
                const visibleLines = lines.slice(0, maxLines);
                if (lines.length > maxLines) {
                    visibleLines[maxLines - 1] = `${visibleLines[maxLines - 1]} \u2026`;
                }
                const langId = info.languageId ?? 'json';
                const labelContent = new MarkdownString();
                for (const line of visibleLines) {
                    labelContent.appendCodeblock(langId, line);
                }
                template.approvalLabel.textContent = '';
                buttonStore.add(this.markdownRendererService.render(labelContent, {}, template.approvalLabel));
                // Hover with full content as a code block
                const fullContent = new MarkdownString().appendCodeblock(info.languageId ?? 'json', info.label);
                buttonStore.add(this.hoverService.setupDelayedHover(template.approvalLabel, {
                    content: fullContent,
                    style: 1 /* HoverStyle.Pointer */,
                    position: { hoverPosition: 2 /* HoverPosition.BELOW */ },
                }));
                template.approvalButtonContainer.textContent = '';
                const button = buttonStore.add(new Button(template.approvalButtonContainer, {
                    title: localize('allowActionOnce', "Allow once"),
                    secondary: true,
                    ...defaultButtonStyles
                }));
                button.label = localize('allowAction', "Allow");
                buttonStore.add(button.onDidClick(() => info.confirm()));
            }
            if (wasVisible !== visible) {
                wasVisible = visible;
                this._onDidChangeItemHeight.fire(element);
            }
        }));
    }
    getStatusIcon(status, isRead, isArchived, pullRequestIcon) {
        switch (status) {
            case 1 /* SessionStatus.InProgress */: return { ...Codicon.sessionInProgress, color: themeColorFromId('textLink.foreground') };
            case 2 /* SessionStatus.NeedsInput */: return { ...Codicon.circleFilled, color: themeColorFromId('list.warningForeground') };
            case 4 /* SessionStatus.Error */: return { ...Codicon.error, color: themeColorFromId('errorForeground') };
            default:
                if (pullRequestIcon) {
                    return pullRequestIcon;
                }
                if (!isRead && !isArchived) {
                    return { ...Codicon.circleFilled, color: themeColorFromId('textLink.foreground') };
                }
                return { ...Codicon.circleSmallFilled, color: themeColorFromId('agentSessionReadIndicator.foreground') };
        }
    }
    getWorkspaceBadgeLabel(workspace) {
        // For GitHub remote sessions, extract owner/name from the repository URI path
        const repo = workspace.repositories[0];
        if (repo?.uri.scheme === GITHUB_REMOTE_FILE_SCHEME) {
            const parts = repo.uri.path.split('/').filter(Boolean);
            if (parts.length >= 2) {
                return `${parts[0]}/${parts[1]}`;
            }
        }
        return workspace.label;
    }
    disposeElement(node, _index, template) {
        template.elementDisposables.clear();
    }
    disposeTemplate(template) {
        template.disposables.dispose();
    }
}
class SessionSectionRenderer {
    static { this.TEMPLATE_ID = 'session-section'; }
    constructor(hideSectionCount, instantiationService, contextKeyService) {
        this.hideSectionCount = hideSectionCount;
        this.instantiationService = instantiationService;
        this.contextKeyService = contextKeyService;
        this.templateId = SessionSectionRenderer.TEMPLATE_ID;
    }
    renderTemplate(container) {
        const disposables = new DisposableStore();
        container.classList.add('session-section');
        const label = DOM.append(container, $('span.session-section-label'));
        const count = DOM.append(container, $('span.session-section-count'));
        const toolbarContainer = DOM.append(container, $('.session-section-toolbar'));
        const contextKeyService = disposables.add(this.contextKeyService.createScoped(container));
        const scopedInstantiationService = disposables.add(this.instantiationService.createChild(new ServiceCollection([IContextKeyService, contextKeyService])));
        const toolbar = disposables.add(scopedInstantiationService.createInstance(MenuWorkbenchToolBar, toolbarContainer, SessionSectionToolbarMenuId, {
            menuOptions: { shouldForwardArgs: true },
        }));
        return { container, label, count, toolbar, contextKeyService, disposables };
    }
    renderElement(node, _index, template) {
        const element = node.element;
        if (!isSessionSection(element)) {
            return;
        }
        template.label.textContent = element.label;
        if (this.hideSectionCount) {
            template.count.textContent = '';
            template.count.style.display = 'none';
        }
        else {
            template.count.textContent = String(element.sessions.length);
            template.count.style.display = '';
        }
        // Set context key for section type so toolbar actions can use when clauses
        const sectionType = element.id.startsWith('workspace:') ? 'workspace' : element.id;
        SessionSectionTypeContext.bindTo(template.contextKeyService).set(sectionType);
        template.toolbar.context = element;
    }
    disposeTemplate(template) {
        template.disposables.dispose();
    }
}
//#endregion
//#region Show More Renderer
class SessionShowMoreRenderer {
    constructor() {
        this.templateId = SessionShowMoreRenderer.TEMPLATE_ID;
    }
    static { this.TEMPLATE_ID = 'session-show-more'; }
    renderTemplate(container) {
        container.classList.add('session-show-more');
        return DOM.append(container, $('span.session-show-more-label'));
    }
    renderElement(node, _index, template) {
        const element = node.element;
        if (!isSessionShowMore(element)) {
            return;
        }
        template.textContent = localize('showMoreCompact', "+{0} more", element.remainingCount);
    }
    disposeTemplate(_template) { }
}
//#region Accessibility
class SessionsAccessibilityProvider {
    getWidgetAriaLabel() {
        return localize('sessionsList', "Sessions");
    }
    getAriaLabel(element) {
        if (isSessionSection(element)) {
            return `${element.label}, ${element.sessions.length}`;
        }
        if (isSessionShowMore(element)) {
            return localize('showMoreAria', "Show {0} more sessions", element.remainingCount);
        }
        return element.title.get();
    }
}
let SessionsList = class SessionsList extends Disposable {
    static { SessionsList_1 = this; }
    static { this.SECTION_COLLAPSE_STATE_KEY = 'sessionsListControl.sectionCollapseState'; }
    static { this.PINNED_SESSIONS_KEY = 'sessionsListControl.pinnedSessions'; }
    static { this.EXCLUDED_TYPES_KEY = 'sessionsListControl.excludedSessionTypes'; }
    static { this.EXCLUDED_STATUSES_KEY = 'sessionsListControl.excludedStatuses'; }
    static { this.EXCLUDE_ARCHIVED_KEY = 'sessionsListControl.excludeArchived'; }
    static { this.EXCLUDE_READ_KEY = 'sessionsListControl.excludeRead'; }
    static { this.WORKSPACE_GROUP_CAPPED_KEY = 'sessionsListControl.workspaceGroupCapped'; }
    static { this.WORKSPACE_GROUP_LIMIT = 5; }
    get element() { return this.listContainer; }
    constructor(container, options, _sessionsManagementService, instantiationService, contextKeyService, storageService, contextMenuService, menuService, keybindingService) {
        super();
        this.options = options;
        this._sessionsManagementService = _sessionsManagementService;
        this.contextKeyService = contextKeyService;
        this.storageService = storageService;
        this.contextMenuService = contextMenuService;
        this.menuService = menuService;
        this.keybindingService = keybindingService;
        this.sessions = [];
        this.visible = true;
        this.expandedWorkspaceGroups = new Set();
        this.findOpen = false;
        this._onDidUpdate = this._register(new Emitter());
        this.onDidUpdate = this._onDidUpdate.event;
        // Load pinned sessions from storage
        this._pinnedSessionIds = this.loadPinnedSessions();
        // Load excluded session types from storage
        this.excludedSessionTypes = this.loadExcludedSessionTypes();
        // Load excluded statuses from storage
        this.excludedStatuses = this.loadExcludedStatuses();
        // Load archived/read filter state
        this._excludeArchived = this.storageService.getBoolean(SessionsList_1.EXCLUDE_ARCHIVED_KEY, 0 /* StorageScope.PROFILE */, true);
        this._excludeRead = this.storageService.getBoolean(SessionsList_1.EXCLUDE_READ_KEY, 0 /* StorageScope.PROFILE */, false);
        this.workspaceGroupCapped = this.storageService.getBoolean(SessionsList_1.WORKSPACE_GROUP_CAPPED_KEY, 0 /* StorageScope.PROFILE */, true);
        this.listContainer = DOM.append(container, $('.sessions-list-control'));
        const approvalModel = this._register(instantiationService.createInstance(AgentSessionApprovalModel));
        const markdownRendererService = instantiationService.invokeFunction(accessor => accessor.get(IMarkdownRendererService));
        const hoverService = instantiationService.invokeFunction(accessor => accessor.get(IHoverService));
        const sessionRenderer = new SessionItemRenderer({ grouping: this.options.grouping, sorting: this.options.sorting, isPinned: s => this.isSessionPinned(s) }, approvalModel, instantiationService, contextKeyService, markdownRendererService, hoverService);
        const showMoreRenderer = new SessionShowMoreRenderer();
        const delegate = new SessionsTreeDelegate(approvalModel);
        this.tree = this._register(instantiationService.createInstance((WorkbenchObjectTree), 'SessionsListTree', this.listContainer, delegate, [
            sessionRenderer,
            new SessionSectionRenderer(true /* hideSectionCount */, instantiationService, contextKeyService),
            showMoreRenderer,
        ], {
            accessibilityProvider: new SessionsAccessibilityProvider(),
            identityProvider: {
                getId: (element) => {
                    if (isSessionSection(element)) {
                        return `section:${element.id}`;
                    }
                    if (isSessionShowMore(element)) {
                        return `show-more:${element.sectionLabel}`;
                    }
                    return element.resource.toString();
                }
            },
            horizontalScrolling: false,
            multipleSelectionSupport: true,
            indent: 0,
            findWidgetEnabled: true,
            defaultFindMode: TreeFindMode.Filter,
            keyboardNavigationLabelProvider: {
                getKeyboardNavigationLabel: (element) => {
                    if (isSessionSection(element)) {
                        return element.label;
                    }
                    if (isSessionShowMore(element)) {
                        return element.sectionLabel;
                    }
                    return element.title.get();
                }
            },
            overrideStyles: this.options.overrideStyles,
            renderIndentGuides: RenderIndentGuides.None,
            twistieAdditionalCssClass: () => 'force-no-twistie',
        }));
        this._register(this.tree.onDidOpen(e => {
            const element = e.element;
            if (!element) {
                return;
            }
            if (isSessionShowMore(element)) {
                this.expandedWorkspaceGroups.add(element.sectionLabel);
                this.update();
                return;
            }
            if (!isSessionSection(element)) {
                this.options.onSessionOpen(element.resource, e.editorOptions.preserveFocus ?? false);
            }
        }));
        this._register(sessionRenderer.onDidChangeItemHeight(session => {
            if (this.tree.hasElement(session)) {
                this.tree.updateElementHeight(session, delegate.getHeight(session));
            }
        }));
        this._register(this.tree.onContextMenu(e => this.onContextMenu(e)));
        this._register(this.tree.onDidChangeCollapseState(e => {
            const element = e.node.element;
            if (element && isSessionSection(element)) {
                this.saveSectionCollapseState(element.id, e.node.collapsed);
            }
        }));
        this._register(this.tree.onDidChangeFindOpenState(open => {
            this.findOpen = open;
            this.update();
        }));
        this._register(this._sessionsManagementService.onDidChangeSessions(() => {
            if (this.visible) {
                this.refresh();
            }
        }));
        // Re-update when the active session changes so that a filtered-out
        // session becomes visible while active and hides again when unselected
        this._register(autorun(reader => {
            this._sessionsManagementService.activeSession.read(reader);
            if (this.visible) {
                this.update();
            }
        }));
        this.refresh();
    }
    refresh() {
        this.sessions = this._sessionsManagementService.getSessions();
        this.update();
    }
    update(expandAll) {
        const activeSession = this._sessionsManagementService.activeSession.get();
        // Filter by session type and status
        let filtered = this.sessions;
        if (this.excludedSessionTypes.size > 0) {
            filtered = filtered.filter(s => !this.excludedSessionTypes.has(s.sessionType));
        }
        if (this.excludedStatuses.size > 0) {
            filtered = filtered.filter(s => !this.excludedStatuses.has(s.status.get()));
        }
        if (this._excludeArchived) {
            filtered = filtered.filter(s => !s.isArchived.get());
        }
        if (this._excludeRead) {
            filtered = filtered.filter(s => !s.isRead.get());
        }
        // Always include the active session even if it was filtered out,
        // so it remains visible while selected
        if (activeSession && !filtered.some(s => s.sessionId === activeSession.sessionId)) {
            const match = this.sessions.find(s => s.sessionId === activeSession.sessionId);
            if (match) {
                filtered = [...filtered, match];
            }
        }
        const sorted = this.sortSessions(filtered);
        // Separate pinned and archived sessions (archived always wins over pinned)
        const pinned = [];
        const archived = [];
        const regular = [];
        for (const session of sorted) {
            if (session.isArchived.get()) {
                archived.push(session);
            }
            else if (this.isSessionPinned(session)) {
                pinned.push(session);
            }
            else {
                regular.push(session);
            }
        }
        const grouping = this.options.grouping();
        const sections = [];
        // Group remaining non-archived sessions
        const grouped = grouping === SessionsGrouping.Workspace
            ? this.groupByWorkspace(regular)
            : this.groupByDate(regular);
        sections.push(...grouped);
        // Add archived section at the bottom
        if (archived.length > 0) {
            sections.push({ id: 'archived', label: localize('archived', "Done"), sessions: archived });
        }
        const hasTodaySessions = sections.some(s => s.id === 'today' && s.sessions.length > 0);
        // Pinned sessions appear flat at the top (no section header)
        const children = [
            ...pinned.map(session => ({ element: session })),
        ];
        children.push(...sections.map(section => {
            const isWorkspaceGroup = grouping === SessionsGrouping.Workspace
                && section.id !== 'archived';
            const isCapped = isWorkspaceGroup && this.workspaceGroupCapped
                && !this.findOpen
                && !this.expandedWorkspaceGroups.has(section.label)
                && section.sessions.length > SessionsList_1.WORKSPACE_GROUP_LIMIT;
            let sectionChildren;
            if (isCapped) {
                const visible = section.sessions.slice(0, SessionsList_1.WORKSPACE_GROUP_LIMIT);
                const remainingCount = section.sessions.length - SessionsList_1.WORKSPACE_GROUP_LIMIT;
                sectionChildren = [
                    ...visible.map(session => ({ element: session })),
                    { element: { showMore: true, sectionLabel: section.label, remainingCount } },
                ];
            }
            else {
                sectionChildren = section.sessions.map(session => ({ element: session }));
            }
            // Default collapse state for older time sections
            let defaultCollapsed = ObjectTreeElementCollapseState.PreserveOrExpanded;
            if (grouping === SessionsGrouping.Date && hasTodaySessions) {
                const olderSections = ['yesterday', 'thisWeek', 'older', 'archived'];
                if (olderSections.includes(section.id)) {
                    defaultCollapsed = ObjectTreeElementCollapseState.PreserveOrCollapsed;
                }
            }
            if (section.id === 'archived') {
                defaultCollapsed = ObjectTreeElementCollapseState.PreserveOrCollapsed;
            }
            return {
                element: section,
                collapsible: true,
                collapsed: this.getSavedCollapseState(section.id) ?? defaultCollapsed,
                children: sectionChildren,
            };
        }));
        this.tree.setChildren(null, children);
        this._onDidUpdate.fire();
    }
    reveal(sessionResource) {
        const resourceStr = sessionResource.toString();
        for (const session of this.sessions) {
            if (session.resource.toString() === resourceStr) {
                if (this.tree.hasElement(session)) {
                    if (this.tree.getRelativeTop(session) === null) {
                        this.tree.reveal(session, 0.5);
                    }
                    this.tree.setFocus([session]);
                    this.tree.setSelection([session]);
                    return true;
                }
            }
        }
        return false;
    }
    clearFocus() {
        this.tree.setFocus([]);
        this.tree.setSelection([]);
    }
    hasFocusOrSelection() {
        return this.tree.getFocus().length > 0 || this.tree.getSelection().length > 0;
    }
    setVisible(visible) {
        if (this.visible === visible) {
            return;
        }
        this.visible = visible;
        if (this.visible) {
            this.refresh();
        }
    }
    layout(height, width) {
        this.tree.layout(height, width);
    }
    focus() {
        this.tree.domFocus();
    }
    openFind() {
        this.tree.openFind();
    }
    // Context menu
    onContextMenu(e) {
        const element = e.element;
        if (!element || isSessionSection(element) || isSessionShowMore(element)) {
            return;
        }
        const selection = this.tree.getSelection().filter((s) => !!s && !isSessionSection(s) && !isSessionShowMore(s));
        const selectedSessions = selection.includes(element) ? [element, ...selection.filter(s => s !== element)] : [element];
        const contextOverlay = [
            [IsSessionPinnedContext.key, this.isSessionPinned(element)],
            [IsSessionArchivedContext.key, element.isArchived.get()],
            [IsSessionReadContext.key, element.isRead.get()],
            ['chatSessionType', element.sessionType],
            [ChatSessionProviderIdContext.key, element.providerId],
        ];
        const menu = this.menuService.createMenu(SessionItemContextMenuId, this.contextKeyService.createOverlay(contextOverlay));
        this.contextMenuService.showContextMenu({
            getActions: () => Separator.join(...menu.getActions({ arg: selectedSessions, shouldForwardArgs: true }).map(([, actions]) => actions)),
            getAnchor: () => e.anchor,
            getKeyBinding: (action) => this.keybindingService.lookupKeybinding(action.id) ?? undefined,
        });
        menu.dispose();
    }
    resetSectionCollapseState() {
        this.storageService.remove(SessionsList_1.SECTION_COLLAPSE_STATE_KEY, 0 /* StorageScope.PROFILE */);
    }
    // -- Pinning --
    pinSession(session) {
        this._pinnedSessionIds.add(session.sessionId);
        this.savePinnedSessions();
        this.update();
    }
    unpinSession(session) {
        this._pinnedSessionIds.delete(session.sessionId);
        this.savePinnedSessions();
        this.update();
    }
    isSessionPinned(session) {
        return this._pinnedSessionIds.has(session.sessionId);
    }
    loadPinnedSessions() {
        const raw = this.storageService.get(SessionsList_1.PINNED_SESSIONS_KEY, 0 /* StorageScope.PROFILE */);
        if (raw) {
            try {
                const arr = JSON.parse(raw);
                if (Array.isArray(arr)) {
                    return new Set(arr);
                }
            }
            catch {
                // ignore corrupt data
            }
        }
        return new Set();
    }
    savePinnedSessions() {
        if (this._pinnedSessionIds.size === 0) {
            this.storageService.remove(SessionsList_1.PINNED_SESSIONS_KEY, 0 /* StorageScope.PROFILE */);
        }
        else {
            this.storageService.store(SessionsList_1.PINNED_SESSIONS_KEY, JSON.stringify([...this._pinnedSessionIds]), 0 /* StorageScope.PROFILE */, 0 /* StorageTarget.USER */);
        }
    }
    // -- Session type filtering --
    setSessionTypeExcluded(sessionTypeId, excluded) {
        if (excluded) {
            this.excludedSessionTypes.add(sessionTypeId);
        }
        else {
            this.excludedSessionTypes.delete(sessionTypeId);
        }
        this.saveExcludedSessionTypes();
        this.update();
    }
    isSessionTypeExcluded(sessionTypeId) {
        return this.excludedSessionTypes.has(sessionTypeId);
    }
    loadExcludedSessionTypes() {
        const raw = this.storageService.get(SessionsList_1.EXCLUDED_TYPES_KEY, 0 /* StorageScope.PROFILE */);
        if (raw) {
            try {
                const arr = JSON.parse(raw);
                if (Array.isArray(arr)) {
                    return new Set(arr);
                }
            }
            catch {
                // ignore corrupt data
            }
        }
        return new Set();
    }
    saveExcludedSessionTypes() {
        if (this.excludedSessionTypes.size === 0) {
            this.storageService.remove(SessionsList_1.EXCLUDED_TYPES_KEY, 0 /* StorageScope.PROFILE */);
        }
        else {
            this.storageService.store(SessionsList_1.EXCLUDED_TYPES_KEY, JSON.stringify([...this.excludedSessionTypes]), 0 /* StorageScope.PROFILE */, 0 /* StorageTarget.USER */);
        }
    }
    // -- Status filtering --
    setStatusExcluded(status, excluded) {
        if (excluded) {
            this.excludedStatuses.add(status);
        }
        else {
            this.excludedStatuses.delete(status);
        }
        this.saveExcludedStatuses();
        this.update();
    }
    isStatusExcluded(status) {
        return this.excludedStatuses.has(status);
    }
    loadExcludedStatuses() {
        const raw = this.storageService.get(SessionsList_1.EXCLUDED_STATUSES_KEY, 0 /* StorageScope.PROFILE */);
        if (raw) {
            try {
                const arr = JSON.parse(raw);
                if (Array.isArray(arr)) {
                    return new Set(arr);
                }
            }
            catch {
                // ignore corrupt data
            }
        }
        return new Set();
    }
    saveExcludedStatuses() {
        if (this.excludedStatuses.size === 0) {
            this.storageService.remove(SessionsList_1.EXCLUDED_STATUSES_KEY, 0 /* StorageScope.PROFILE */);
        }
        else {
            this.storageService.store(SessionsList_1.EXCLUDED_STATUSES_KEY, JSON.stringify([...this.excludedStatuses]), 0 /* StorageScope.PROFILE */, 0 /* StorageTarget.USER */);
        }
    }
    // -- Archived / Read filtering --
    setExcludeArchived(exclude) {
        this._excludeArchived = exclude;
        this.storageService.store(SessionsList_1.EXCLUDE_ARCHIVED_KEY, exclude, 0 /* StorageScope.PROFILE */, 0 /* StorageTarget.USER */);
        this.update();
    }
    isExcludeArchived() {
        return this._excludeArchived;
    }
    setExcludeRead(exclude) {
        this._excludeRead = exclude;
        this.storageService.store(SessionsList_1.EXCLUDE_READ_KEY, exclude, 0 /* StorageScope.PROFILE */, 0 /* StorageTarget.USER */);
        this.update();
    }
    isExcludeRead() {
        return this._excludeRead;
    }
    resetFilters() {
        this.excludedSessionTypes.clear();
        this.saveExcludedSessionTypes();
        this.excludedStatuses.clear();
        this.saveExcludedStatuses();
        this._excludeArchived = true;
        this.storageService.store(SessionsList_1.EXCLUDE_ARCHIVED_KEY, true, 0 /* StorageScope.PROFILE */, 0 /* StorageTarget.USER */);
        this._excludeRead = false;
        this.storageService.store(SessionsList_1.EXCLUDE_READ_KEY, false, 0 /* StorageScope.PROFILE */, 0 /* StorageTarget.USER */);
        this.workspaceGroupCapped = true;
        this.storageService.store(SessionsList_1.WORKSPACE_GROUP_CAPPED_KEY, true, 0 /* StorageScope.PROFILE */, 0 /* StorageTarget.USER */);
        this.expandedWorkspaceGroups.clear();
        this.update();
    }
    // Workspace group capping
    setWorkspaceGroupCapped(capped) {
        this.workspaceGroupCapped = capped;
        this.storageService.store(SessionsList_1.WORKSPACE_GROUP_CAPPED_KEY, capped, 0 /* StorageScope.PROFILE */, 0 /* StorageTarget.USER */);
        if (capped) {
            this.expandedWorkspaceGroups.clear();
        }
        this.update();
    }
    isWorkspaceGroupCapped() {
        return this.workspaceGroupCapped;
    }
    // -- Section collapse persistence --
    getSavedCollapseState(sectionId) {
        const raw = this.storageService.get(SessionsList_1.SECTION_COLLAPSE_STATE_KEY, 0 /* StorageScope.PROFILE */);
        if (raw) {
            try {
                const state = JSON.parse(raw);
                if (typeof state[sectionId] === 'boolean') {
                    return state[sectionId];
                }
            }
            catch {
                // ignore corrupt data
            }
        }
        return undefined;
    }
    saveSectionCollapseState(sectionId, collapsed) {
        let state = {};
        const raw = this.storageService.get(SessionsList_1.SECTION_COLLAPSE_STATE_KEY, 0 /* StorageScope.PROFILE */);
        if (raw) {
            try {
                const parsed = JSON.parse(raw);
                if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
                    state = parsed;
                }
            }
            catch {
                // ignore corrupt data
            }
        }
        state[sectionId] = collapsed;
        this.storageService.store(SessionsList_1.SECTION_COLLAPSE_STATE_KEY, JSON.stringify(state), 0 /* StorageScope.PROFILE */, 0 /* StorageTarget.USER */);
    }
    // -- Sorting --
    sortSessions(sessions) {
        return sortSessions(sessions, this.options.sorting());
    }
    // -- Grouping --
    groupByWorkspace(sessions) {
        return groupByWorkspace(sessions);
    }
    groupByDate(sessions) {
        return groupByDate(sessions, this.options.sorting());
    }
};
SessionsList = SessionsList_1 = __decorate([
    __param(2, ISessionsManagementService),
    __param(3, IInstantiationService),
    __param(4, IContextKeyService),
    __param(5, IStorageService),
    __param(6, IContextMenuService),
    __param(7, IMenuService),
    __param(8, IKeybindingService)
], SessionsList);
export { SessionsList };
//#endregion
//#region Approval Helpers
function getFirstApprovalAcrossChats(approvalModel, session, reader) {
    let oldest;
    for (const chat of session.chats.read(reader)) {
        const approval = approvalModel.getApproval(chat.resource).read(reader);
        if (approval && (!oldest || approval.since.getTime() < oldest.since.getTime())) {
            oldest = approval;
        }
    }
    return oldest;
}
//#endregion
//#region Sorting & Grouping Helpers
export function sortSessions(sessions, sorting) {
    return [...sessions].sort((a, b) => {
        if (sorting === SessionsSorting.Updated) {
            return b.updatedAt.get().getTime() - a.updatedAt.get().getTime();
        }
        return b.createdAt.getTime() - a.createdAt.getTime();
    });
}
export function groupByWorkspace(sessions) {
    const groups = new Map();
    for (const session of sessions) {
        const workspace = session.workspace.get();
        const label = workspace?.label || localize('unknown', "Unknown");
        let group = groups.get(label);
        if (!group) {
            group = [];
            groups.set(label, group);
        }
        group.push(session);
    }
    const unknownWorkspaceLabel = localize('unknown', "Unknown");
    const order = [...groups.keys()]
        .filter(k => k !== unknownWorkspaceLabel)
        .sort((a, b) => a.localeCompare(b));
    const result = order.map(label => ({
        id: `workspace:${label}`,
        label,
        sessions: groups.get(label),
    }));
    // "Unknown Workspace" always at the bottom
    const unknownWorkspace = groups.get(unknownWorkspaceLabel);
    if (unknownWorkspace) {
        result.push({ id: `workspace:${unknownWorkspaceLabel}`, label: unknownWorkspaceLabel, sessions: unknownWorkspace });
    }
    return result;
}
export function groupByDate(sessions, sorting) {
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const startOfYesterday = startOfToday - 86_400_000;
    const startOfWeek = startOfToday - 7 * 86_400_000;
    const today = [];
    const yesterday = [];
    const week = [];
    const older = [];
    for (const session of sessions) {
        const time = sorting === SessionsSorting.Updated
            ? session.updatedAt.get().getTime()
            : session.createdAt.getTime();
        if (time >= startOfToday) {
            today.push(session);
        }
        else if (time >= startOfYesterday) {
            yesterday.push(session);
        }
        else if (time >= startOfWeek) {
            week.push(session);
        }
        else {
            older.push(session);
        }
    }
    const sections = [];
    const addGroup = (id, label, groupSessions) => {
        if (groupSessions.length > 0) {
            sections.push({ id, label, sessions: groupSessions });
        }
    };
    addGroup('today', localize('today', "Today"), today);
    addGroup('yesterday', localize('yesterday', "Yesterday"), yesterday);
    addGroup('thisWeek', localize('lastSevenDays', "Last 7 Days"), week);
    addGroup('older', localize('older', "Older"), older);
    return sections;
}
//#endregion
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2Vzc2lvbnNMaXN0LmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvc2Vzc2lvbnMvY29udHJpYi9zZXNzaW9ucy9icm93c2VyL3ZpZXdzL3Nlc3Npb25zTGlzdC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7Ozs7QUFFaEcsT0FBTywyQkFBMkIsQ0FBQztBQUNuQyxPQUFPLEtBQUssR0FBRyxNQUFNLG9DQUFvQyxDQUFDO0FBRzFELE9BQU8sRUFBdUUsOEJBQThCLEVBQUUsTUFBTSw2Q0FBNkMsQ0FBQztBQUNsSyxPQUFPLEVBQUUsa0JBQWtCLEVBQUUsWUFBWSxFQUFFLE1BQU0scURBQXFELENBQUM7QUFDdkcsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLHdDQUF3QyxDQUFDO0FBQ2pFLE9BQU8sRUFBRSxPQUFPLEVBQVMsTUFBTSxxQ0FBcUMsQ0FBQztBQUNyRSxPQUFPLEVBQUUsZ0JBQWdCLEVBQUUsTUFBTSxxRUFBcUUsQ0FBQztBQUN2RyxPQUFPLEVBQUUsYUFBYSxFQUFzQixNQUFNLHVDQUF1QyxDQUFDO0FBQzFGLE9BQU8sRUFBRSxVQUFVLEVBQUUsZUFBZSxFQUFFLGlCQUFpQixFQUFFLFlBQVksRUFBRSxNQUFNLHlDQUF5QyxDQUFDO0FBQ3ZILE9BQU8sRUFBRSxjQUFjLEVBQUUsTUFBTSwyQ0FBMkMsQ0FBQztBQUMzRSxPQUFPLEVBQVcsT0FBTyxFQUFFLE1BQU0sMENBQTBDLENBQUM7QUFDNUUsT0FBTyxFQUFFLFNBQVMsRUFBRSxnQkFBZ0IsRUFBRSxNQUFNLHlDQUF5QyxDQUFDO0FBRXRGLE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSxvQ0FBb0MsQ0FBQztBQUM3RCxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sdUJBQXVCLENBQUM7QUFDakQsT0FBTyxFQUFFLE1BQU0sRUFBRSxZQUFZLEVBQUUsTUFBTSxtREFBbUQs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