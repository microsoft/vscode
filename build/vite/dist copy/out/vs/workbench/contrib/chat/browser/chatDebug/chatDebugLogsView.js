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
import * as DOM from '../../../../../base/browser/dom.js';
import { BreadcrumbsWidget } from '../../../../../base/browser/ui/breadcrumbs/breadcrumbsWidget.js';
import { Button } from '../../../../../base/browser/ui/button/button.js';
import { ProgressBar } from '../../../../../base/browser/ui/progressbar/progressbar.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { Emitter } from '../../../../../base/common/event.js';
import { combinedDisposable, Disposable, MutableDisposable } from '../../../../../base/common/lifecycle.js';
import { autorun } from '../../../../../base/common/observable.js';
import { RunOnceScheduler } from '../../../../../base/common/async.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { localize } from '../../../../../nls.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { ServiceCollection } from '../../../../../platform/instantiation/common/serviceCollection.js';
import { WorkbenchList, WorkbenchObjectTree } from '../../../../../platform/list/browser/listService.js';
import { defaultBreadcrumbsWidgetStyles, defaultButtonStyles, defaultProgressBarStyles } from '../../../../../platform/theme/browser/defaultStyles.js';
import { FilterWidget } from '../../../../browser/parts/views/viewFilter.js';
import { IChatDebugService } from '../../common/chatDebugService.js';
import { filterDebugEventsByText } from '../../common/chatDebugEvents.js';
import { IChatService } from '../../common/chatService/chatService.js';
import { LocalChatSessionUri } from '../../common/model/chatUri.js';
import { ChatDebugEventRenderer, ChatDebugEventDelegate, ChatDebugEventTreeRenderer, getEventCreatedText, getEventNameText, getEventDetailsText } from './chatDebugEventList.js';
import { setupBreadcrumbKeyboardNavigation, TextBreadcrumbItem } from './chatDebugTypes.js';
import { bindFilterContextKeys } from './chatDebugFilters.js';
import { ChatDebugDetailPanel } from './chatDebugDetailPanel.js';
import { IChatWidgetService } from '../chat.js';
import { createDebugEventsAttachment } from './chatDebugAttachment.js';
import { IClipboardService } from '../../../../../platform/clipboard/common/clipboardService.js';
import { IContextMenuService } from '../../../../../platform/contextview/browser/contextView.js';
import { Action, Separator } from '../../../../../base/common/actions.js';
import { StandardMouseEvent } from '../../../../../base/browser/mouseEvent.js';
const $ = DOM.$;
export var LogsNavigation;
(function (LogsNavigation) {
    LogsNavigation["Home"] = "home";
    LogsNavigation["Overview"] = "overview";
})(LogsNavigation || (LogsNavigation = {}));
let ChatDebugLogsView = class ChatDebugLogsView extends Disposable {
    constructor(parent, filterState, chatService, chatDebugService, instantiationService, contextKeyService, chatWidgetService, clipboardService, contextMenuService) {
        super();
        this.filterState = filterState;
        this.chatService = chatService;
        this.chatDebugService = chatDebugService;
        this.instantiationService = instantiationService;
        this.contextKeyService = contextKeyService;
        this.chatWidgetService = chatWidgetService;
        this.clipboardService = clipboardService;
        this.contextMenuService = contextMenuService;
        this._onNavigate = this._register(new Emitter());
        this.onNavigate = this._onNavigate.event;
        this.logsViewMode = "tree" /* LogsViewMode.Tree */;
        this.events = [];
        this.eventListener = this._register(new MutableDisposable());
        this.sessionStateDisposable = this._register(new MutableDisposable());
        this.refreshScheduler = this._register(new RunOnceScheduler(() => this.refreshList(), 50));
        this.container = DOM.append(parent, $('.chat-debug-logs'));
        DOM.hide(this.container);
        // Breadcrumb
        const breadcrumbContainer = DOM.append(this.container, $('.chat-debug-breadcrumb'));
        this.breadcrumbWidget = this._register(new BreadcrumbsWidget(breadcrumbContainer, 3, undefined, Codicon.chevronRight, defaultBreadcrumbsWidgetStyles));
        this._register(setupBreadcrumbKeyboardNavigation(breadcrumbContainer, this.breadcrumbWidget));
        this._register(this.breadcrumbWidget.onDidSelectItem(e => {
            if (e.type === 'select' && e.item instanceof TextBreadcrumbItem) {
                this.breadcrumbWidget.setSelection(undefined);
                const items = this.breadcrumbWidget.getItems();
                const idx = items.indexOf(e.item);
                if (idx === 0) {
                    this._onNavigate.fire("home" /* LogsNavigation.Home */);
                }
                else if (idx === 1) {
                    this._onNavigate.fire("overview" /* LogsNavigation.Overview */);
                }
            }
        }));
        // Header (filter)
        this.headerContainer = DOM.append(this.container, $('.chat-debug-editor-header'));
        // Scoped context key service for filter menu items
        const scopedContextKeyService = this._register(this.contextKeyService.createScoped(this.headerContainer));
        const syncContextKeys = bindFilterContextKeys(this.filterState, scopedContextKeyService);
        syncContextKeys();
        const childInstantiationService = this._register(this.instantiationService.createChild(new ServiceCollection([IContextKeyService, scopedContextKeyService])));
        this.filterWidget = this._register(childInstantiationService.createInstance(FilterWidget, {
            placeholder: localize('chatDebug.search', "Filter (e.g. text, !exclude, before:YYYY-MM-DDTHH:MM:SS)"),
            ariaLabel: localize('chatDebug.filterAriaLabel', "Filter debug events"),
        }));
        // View mode toggle
        this.viewModeToggle = this._register(new Button(this.headerContainer, { ...defaultButtonStyles, secondary: true, title: localize('chatDebug.toggleViewMode', "Toggle between list and tree view") }));
        this.viewModeToggle.element.classList.add('chat-debug-view-mode-toggle', 'monaco-text-button');
        this.updateViewModeToggle();
        this._register(this.viewModeToggle.onDidClick(() => {
            this.toggleViewMode();
        }));
        const filterContainer = DOM.append(this.headerContainer, $('.viewpane-filter-container'));
        filterContainer.appendChild(this.filterWidget.element);
        // Troubleshoot button
        const troubleshootButton = this._register(new Button(this.headerContainer, { ...defaultButtonStyles, secondary: true, title: localize('chatDebug.troubleshoot', "Add snapshot to Chat") }));
        troubleshootButton.element.classList.add('chat-debug-troubleshoot-button', 'monaco-text-button');
        DOM.append(troubleshootButton.element, $(`span${ThemeIcon.asCSSSelector(Codicon.chatSparkle)}`));
        this._register(troubleshootButton.onDidClick(async () => {
            if (!this.currentSessionResource) {
                return;
            }
            const widget = await this.chatWidgetService.openSession(this.currentSessionResource);
            if (widget) {
                const attachment = await createDebugEventsAttachment(this.currentSessionResource, this.chatDebugService);
                widget.attachmentModel.addContext(attachment);
                widget.focusInput();
            }
        }));
        this._register(this.filterWidget.onDidChangeFilterText(text => {
            this.filterState.setTextFilter(text);
        }));
        // React to shared filter state changes
        this._register(this.filterState.onDidChange(() => {
            syncContextKeys();
            this.updateMoreFiltersChecked();
            this.refreshList();
        }));
        // Content wrapper (flex row: main column + detail panel)
        const contentContainer = DOM.append(this.container, $('.chat-debug-logs-content'));
        // Main column (table header + list/tree body)
        const mainColumn = DOM.append(contentContainer, $('.chat-debug-logs-main'));
        // Table header
        this.tableHeader = DOM.append(mainColumn, $('.chat-debug-table-header'));
        DOM.append(this.tableHeader, $('span.chat-debug-col-created', undefined, localize('chatDebug.col.created', "Created")));
        DOM.append(this.tableHeader, $('span.chat-debug-col-name', undefined, localize('chatDebug.col.name', "Name")));
        DOM.append(this.tableHeader, $('span.chat-debug-col-details', undefined, localize('chatDebug.col.details', "Details")));
        // Progress bar (shown when session is in progress)
        this.progressBar = this._register(new ProgressBar(mainColumn, {
            ...defaultProgressBarStyles,
            ariaLabel: localize('chatDebug.progressAriaLabel', "Chat debug logs loading progress")
        }));
        // Body container
        this.bodyContainer = DOM.append(mainColumn, $('.chat-debug-logs-body'));
        // List container (initially hidden — tree view is default)
        this.listContainer = DOM.append(this.bodyContainer, $('.chat-debug-list-container'));
        DOM.hide(this.listContainer);
        const accessibilityProvider = {
            getAriaLabel: (e) => {
                switch (e.kind) {
                    case 'toolCall': return localize('chatDebug.aria.toolCall', "Tool call: {0}{1}", e.toolName, e.result ? ` (${e.result})` : '');
                    case 'modelTurn': return localize('chatDebug.aria.modelTurn', "Model turn: {0}{1}", e.model ?? localize('chatDebug.aria.model', "model"), e.totalTokens ? localize('chatDebug.aria.tokenCount', " {0} tokens", e.totalTokens) : '');
                    case 'generic': return `${e.category ? e.category + ': ' : ''}${e.name}: ${e.details ?? ''}`;
                    case 'subagentInvocation': return localize('chatDebug.aria.subagent', "Subagent: {0}{1}", e.agentName, e.description ? ` - ${e.description}` : '');
                    case 'userMessage': return localize('chatDebug.aria.userMessage', "User message: {0}", e.message);
                    case 'agentResponse': return localize('chatDebug.aria.agentResponse', "Agent response: {0}", e.message);
                }
            },
            getWidgetAriaLabel: () => localize('chatDebug.ariaLabel', "Chat Debug Events"),
        };
        let nextFallbackId = 0;
        const fallbackIds = new WeakMap();
        const identityProvider = {
            getId: (e) => {
                if (e.id) {
                    return e.id;
                }
                let fallback = fallbackIds.get(e);
                if (!fallback) {
                    fallback = `_fallback_${nextFallbackId++}`;
                    fallbackIds.set(e, fallback);
                }
                return fallback;
            }
        };
        this.list = this._register(this.instantiationService.createInstance((WorkbenchList), 'ChatDebugEvents', this.listContainer, new ChatDebugEventDelegate(), [new ChatDebugEventRenderer()], { identityProvider, accessibilityProvider }));
        // Tree container (default view)
        this.treeContainer = DOM.append(this.bodyContainer, $('.chat-debug-list-container'));
        this.tree = this._register(this.instantiationService.createInstance((WorkbenchObjectTree), 'ChatDebugEventsTree', this.treeContainer, new ChatDebugEventDelegate(), [new ChatDebugEventTreeRenderer()], { identityProvider, accessibilityProvider }));
        // Detail panel (sibling of main column so it aligns with table header)
        this.detailPanel = this._register(this.instantiationService.createInstance(ChatDebugDetailPanel, contentContainer));
        this._register(this.detailPanel.onDidChangeWidth(() => {
            if (this.currentDimension) {
                this.layout(this.currentDimension);
            }
        }));
        this._register(this.detailPanel.onDidHide(() => {
            if (this.list.getSelection().length > 0) {
                this.list.setSelection([]);
            }
            if (this.tree.getSelection().length > 0) {
                this.tree.setSelection([]);
            }
            if (this.currentDimension) {
                this.layout(this.currentDimension);
            }
        }));
        // Context menu
        this._register(this.list.onContextMenu(e => {
            if (e.element) {
                this.showEventContextMenu(e.element, e.browserEvent);
            }
        }));
        this._register(this.tree.onContextMenu(e => {
            if (e.element) {
                this.showEventContextMenu(e.element, e.browserEvent);
            }
        }));
        // Resolve event details on selection
        this._register(this.list.onDidChangeSelection(e => {
            const selected = e.elements[0];
            if (selected) {
                this.detailPanel.show(selected);
            }
            else {
                this.detailPanel.hide();
            }
        }));
        this._register(this.tree.onDidChangeSelection(e => {
            const selected = e.elements[0];
            if (selected) {
                this.detailPanel.show(selected);
            }
            else {
                this.detailPanel.hide();
            }
        }));
    }
    setSession(sessionResource) {
        this.currentSessionResource = sessionResource;
    }
    setFilterText(text) {
        this.filterWidget.setFilterText(text);
    }
    show() {
        DOM.show(this.container);
        this.loadEvents();
        this.refreshList();
    }
    hide() {
        DOM.hide(this.container);
    }
    focus() {
        if (this.logsViewMode === "tree" /* LogsViewMode.Tree */) {
            this.tree.domFocus();
        }
        else {
            this.list.domFocus();
        }
    }
    updateBreadcrumb() {
        if (!this.currentSessionResource) {
            return;
        }
        const sessionTitle = this.chatService.getSessionTitle(this.currentSessionResource) || LocalChatSessionUri.parseLocalSessionId(this.currentSessionResource) || this.currentSessionResource.toString();
        this.breadcrumbWidget.setItems([
            new TextBreadcrumbItem(localize('chatDebug.title', "Agent Debug Logs"), true),
            new TextBreadcrumbItem(sessionTitle, true),
            new TextBreadcrumbItem(localize('chatDebug.logs', "Logs")),
        ]);
    }
    layout(dimension) {
        this.currentDimension = dimension;
        const breadcrumbHeight = 22;
        const headerHeight = this.headerContainer.offsetHeight;
        const tableHeaderHeight = this.tableHeader.offsetHeight;
        const detailVisible = this.detailPanel.isVisible;
        const detailWidth = detailVisible ? this.detailPanel.width : 0;
        const listHeight = dimension.height - breadcrumbHeight - headerHeight - tableHeaderHeight;
        const listWidth = dimension.width - detailWidth;
        if (this.logsViewMode === "tree" /* LogsViewMode.Tree */) {
            this.tree.layout(listHeight, listWidth);
        }
        else {
            this.list.layout(listHeight, listWidth);
        }
        if (this.detailPanel.isVisible) {
            this.detailPanel.layout(listHeight);
        }
        this.detailPanel.layoutSash();
    }
    refreshList() {
        let filtered = this.events;
        // Filter by kind toggles (pass category for generic events so only
        // discovery-category events are affected by the Prompt Discovery toggle)
        filtered = filtered.filter(e => {
            const category = e.kind === 'generic' ? e.category : undefined;
            return this.filterState.isKindVisible(e.kind, category);
        });
        // Filter by text search and timestamp (before:/after: syntax is handled
        // inside filterDebugEventsByText)
        const filterText = this.filterState.textFilter;
        if (filterText) {
            filtered = filterDebugEventsByText(filtered, filterText);
        }
        if (this.logsViewMode === "list" /* LogsViewMode.List */) {
            this.list.splice(0, this.list.length, filtered);
        }
        else {
            this.refreshTree(filtered);
        }
    }
    addEvent(event) {
        // Binary-insert to maintain chronological order without a full sort.
        // Events almost always arrive in order, so the insertion point is
        // typically at the end (O(log n) comparison, O(1) splice).
        const time = event.created.getTime();
        let lo = 0;
        let hi = this.events.length;
        while (lo < hi) {
            const mid = (lo + hi) >>> 1;
            if (this.events[mid].created.getTime() <= time) {
                lo = mid + 1;
            }
            else {
                hi = mid;
            }
        }
        if (lo === this.events.length) {
            this.events.push(event);
        }
        else {
            this.events.splice(lo, 0, event);
        }
        this.scheduleRefresh();
    }
    scheduleRefresh() {
        if (!this.refreshScheduler.isScheduled()) {
            this.refreshScheduler.schedule();
        }
    }
    loadEvents() {
        this.events = [...this.chatDebugService.getEvents(this.currentSessionResource || undefined)];
        const addEventDisposable = this.chatDebugService.onDidAddEvent(e => {
            if (!this.currentSessionResource || e.sessionResource.toString() === this.currentSessionResource.toString()) {
                this.addEvent(e);
            }
        });
        // Reload events when provider events are cleared (before re-invoking providers)
        const clearEventsDisposable = this.chatDebugService.onDidClearProviderEvents(sessionResource => {
            if (!this.currentSessionResource || sessionResource.toString() === this.currentSessionResource.toString()) {
                this.events = [...this.chatDebugService.getEvents(this.currentSessionResource || undefined)];
                this.refreshList();
            }
        });
        this.eventListener.value = combinedDisposable(addEventDisposable, clearEventsDisposable);
        this.updateBreadcrumb();
        this.trackSessionState();
    }
    trackSessionState() {
        if (!this.currentSessionResource) {
            this.progressBar.stop();
            this.sessionStateDisposable.clear();
            return;
        }
        const model = this.chatService.getSession(this.currentSessionResource);
        if (!model) {
            this.progressBar.stop();
            this.sessionStateDisposable.clear();
            return;
        }
        this.sessionStateDisposable.value = autorun(reader => {
            const inProgress = model.requestInProgress.read(reader);
            if (inProgress) {
                this.progressBar.infinite();
            }
            else {
                this.progressBar.stop();
            }
        });
    }
    refreshTree(filtered) {
        const treeElements = this.buildTreeHierarchy(filtered);
        this.tree.setChildren(null, treeElements);
    }
    buildTreeHierarchy(events) {
        const idToEvent = new Map();
        const idToChildren = new Map();
        const roots = [];
        for (const event of events) {
            if (event.id) {
                idToEvent.set(event.id, event);
            }
        }
        for (const event of events) {
            if (event.parentEventId && idToEvent.has(event.parentEventId)) {
                let children = idToChildren.get(event.parentEventId);
                if (!children) {
                    children = [];
                    idToChildren.set(event.parentEventId, children);
                }
                children.push(event);
            }
            else {
                roots.push(event);
            }
        }
        const toTreeElement = (event) => {
            const children = event.id ? idToChildren.get(event.id) : undefined;
            return {
                element: event,
                children: children?.map(toTreeElement),
                collapsible: (children?.length ?? 0) > 0,
                collapsed: false,
            };
        };
        return roots.map(toTreeElement);
    }
    toggleViewMode() {
        if (this.logsViewMode === "list" /* LogsViewMode.List */) {
            this.logsViewMode = "tree" /* LogsViewMode.Tree */;
            DOM.hide(this.listContainer);
            DOM.show(this.treeContainer);
        }
        else {
            this.logsViewMode = "list" /* LogsViewMode.List */;
            DOM.show(this.listContainer);
            DOM.hide(this.treeContainer);
        }
        this.updateViewModeToggle();
        this.refreshList();
        if (this.currentDimension) {
            this.layout(this.currentDimension);
        }
    }
    updateViewModeToggle() {
        const el = this.viewModeToggle.element;
        DOM.clearNode(el);
        const isTree = this.logsViewMode === "tree" /* LogsViewMode.Tree */;
        DOM.append(el, $(`span${ThemeIcon.asCSSSelector(isTree ? Codicon.listTree : Codicon.listFlat)}`));
        const labelContainer = DOM.append(el, $('span.chat-debug-view-mode-labels'));
        const treeLabel = DOM.append(labelContainer, $('span.chat-debug-view-mode-label'));
        treeLabel.textContent = localize('chatDebug.treeView', "Tree View");
        const listLabel = DOM.append(labelContainer, $('span.chat-debug-view-mode-label'));
        listLabel.textContent = localize('chatDebug.listView', "List View");
        if (isTree) {
            listLabel.classList.add('hidden');
        }
        else {
            treeLabel.classList.add('hidden');
        }
        const activeLabel = isTree
            ? localize('chatDebug.switchToListView', "Switch to List View")
            : localize('chatDebug.switchToTreeView', "Switch to Tree View");
        el.setAttribute('aria-label', activeLabel);
        this.viewModeToggle.setTitle(activeLabel);
    }
    updateMoreFiltersChecked() {
        this.filterWidget.checkMoreFilters(!this.filterState.isAllFiltersDefault());
    }
    showEventContextMenu(event, browserEvent) {
        const d = event.created;
        const pad = (n) => String(n).padStart(2, '0');
        const timestamp = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
        const row = [getEventCreatedText(event), getEventNameText(event), getEventDetailsText(event)].filter(Boolean).join('\t');
        const name = getEventNameText(event);
        this.contextMenuService.showContextMenu({
            getAnchor: () => DOM.isMouseEvent(browserEvent)
                ? new StandardMouseEvent(DOM.getWindow(this.container), browserEvent)
                : this.container,
            getActions: () => [
                new Action('chatDebug.copyTimestamp', localize('chatDebug.copyTimestamp', "Copy Timestamp"), undefined, true, () => this.clipboardService.writeText(timestamp)),
                new Action('chatDebug.copyRow', localize('chatDebug.copyRow', "Copy Row"), undefined, true, () => this.clipboardService.writeText(row)),
                new Separator(),
                new Action('chatDebug.filterBefore', localize('chatDebug.filterBefore', "Filter Before Timestamp"), undefined, true, () => this.applyFilterToken(`before:${timestamp}`)),
                new Action('chatDebug.filterAfter', localize('chatDebug.filterAfter', "Filter After Timestamp"), undefined, true, () => this.applyFilterToken(`after:${timestamp}`)),
                new Action('chatDebug.filterName', localize('chatDebug.filterName', "Filter Name"), undefined, !!name, () => this.applyFilterToken(name)),
            ],
        });
    }
    applyFilterToken(token) {
        this.filterWidget.setFilterText(token);
    }
};
ChatDebugLogsView = __decorate([
    __param(2, IChatService),
    __param(3, IChatDebugService),
    __param(4, IInstantiationService),
    __param(5, IContextKeyService),
    __param(6, IChatWidgetService),
    __param(7, IClipboardService),
    __param(8, IContextMenuService)
], ChatDebugLogsView);
export { ChatDebugLogsView };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2hhdERlYnVnTG9nc1ZpZXcuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi9jaGF0L2Jyb3dzZXIvY2hhdERlYnVnL2NoYXREZWJ1Z0xvZ3NWaWV3LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7O0FBRWhHLE9BQU8sS0FBSyxHQUFHLE1BQU0sb0NBQW9DLENBQUM7QUFFMUQsT0FBTyxFQUFFLGlCQUFpQixFQUFFLE1BQU0saUVBQWlFLENBQUM7QUFDcEcsT0FBTyxFQUFFLE1BQU0sRUFBRSxNQUFNLGlEQUFpRCxDQUFDO0FBQ3pFLE9BQU8sRUFBRSxXQUFXLEVBQUUsTUFBTSwyREFBMkQsQ0FBQztBQUV4RixPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0sd0NBQXdDLENBQUM7QUFDakUsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLHFDQUFxQyxDQUFDO0FBQzlELE9BQU8sRUFBRSxrQkFBa0IsRUFBRSxVQUFVLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSx5Q0FBeUMsQ0FBQztBQUM1RyxPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0sMENBQTBDLENBQUM7QUFDbkUsT0FBTyxFQUFFLGdCQUFnQixFQUFFLE1BQU0scUNBQXFDLENBQUM7QUFDdkUsT0FBTyxFQUFFLFNBQVMsRUFBRSxNQUFNLHlDQUF5QyxDQUFDO0FBRXBFLE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSx1QkFBdUIsQ0FBQztBQUNqRCxPQUFPLEVBQUUsa0JBQWtCLEVBQUUsTUFBTSx5REFBeUQsQ0FBQztBQUM3RixPQUFPLEVBQUUscUJBQXFCLEVBQUUsTUFBTSwrREFBK0QsQ0FBQztBQUN0RyxPQUFPLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSxtRUFBbUUsQ0FBQztBQUN0RyxPQUFPLEVBQUUsYUFBYSxFQUFFLG1CQUFtQixFQUFFLE1BQU0scURB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