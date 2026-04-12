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
var AgentSessionsControl_1;
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { ChatContextKeys } from '../../common/actions/chatContextKeys.js';
import { IContextMenuService } from '../../../../../platform/contextview/browser/contextView.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { WorkbenchCompressibleAsyncDataTree } from '../../../../../platform/list/browser/listService.js';
import { $, append, EventHelper, addDisposableListener, EventType, getWindow, hide, setVisibility } from '../../../../../base/browser/dom.js';
import { StandardKeyboardEvent } from '../../../../../base/browser/keyboardEvent.js';
import { localize } from '../../../../../nls.js';
import { isAgentSession, isAgentSessionSection, isAgentSessionShowLess, isAgentSessionShowMore } from './agentSessionsModel.js';
import { AgentSessionRenderer, AgentSessionsAccessibilityProvider, AgentSessionsCompressionDelegate, AgentSessionsDataSource, AgentSessionsDragAndDrop, AgentSessionsIdentityProvider, AgentSessionsKeyboardNavigationLabelProvider, AgentSessionsListDelegate, AgentSessionSectionRenderer, AgentSessionSectionLabels, AgentSessionShowLessRenderer, AgentSessionShowMoreRenderer, AgentSessionsSorter, getRepositoryName } from './agentSessionsViewer.js';
import { AgentSessionsGrouping, AgentSessionsSorting } from './agentSessionsFilter.js';
import { AgentSessionApprovalModel } from './agentSessionApprovalModel.js';
import { IMenuService, MenuId } from '../../../../../platform/actions/common/actions.js';
import { IChatSessionsService } from '../../common/chatSessionsService.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { ACTION_ID_NEW_CHAT } from '../actions/chatActions.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { Throttler } from '../../../../../base/common/async.js';
import { observableValue } from '../../../../../base/common/observable.js';
import { Separator } from '../../../../../base/common/actions.js';
import { RenderIndentGuides, TreeFindMode } from '../../../../../base/browser/ui/tree/abstractTree.js';
import { IAgentSessionsService } from './agentSessionsService.js';
import { ITelemetryService } from '../../../../../platform/telemetry/common/telemetry.js';
import { openSession } from './agentSessionsOpener.js';
import { IEditorService } from '../../../../services/editor/common/editorService.js';
import { ChatEditorInput } from '../widgetHosts/editor/chatEditorInput.js';
import { IStorageService } from '../../../../../platform/storage/common/storage.js';
import { IAccessibilityService } from '../../../../../platform/accessibility/common/accessibility.js';
let AgentSessionsControl = class AgentSessionsControl extends Disposable {
    static { AgentSessionsControl_1 = this; }
    get element() { return this.sessionsContainer; }
    static { this.RECENT_SESSIONS_FOR_EXPAND = 5; }
    constructor(container, options, contextMenuService, contextKeyService, instantiationService, chatSessionsService, commandService, menuService, agentSessionsService, telemetryService, editorService, storageService, accessibilityService) {
        super();
        this.container = container;
        this.options = options;
        this.contextMenuService = contextMenuService;
        this.contextKeyService = contextKeyService;
        this.instantiationService = instantiationService;
        this.chatSessionsService = chatSessionsService;
        this.commandService = commandService;
        this.menuService = menuService;
        this.agentSessionsService = agentSessionsService;
        this.telemetryService = telemetryService;
        this.editorService = editorService;
        this.storageService = storageService;
        this.accessibilityService = accessibilityService;
        this.sessionsListFindIsOpen = false;
        this._isProgrammaticCollapseChange = false;
        this._recentRepositoryLabels = new Set();
        this.updateSessionsListThrottler = this._register(new Throttler());
        this._onDidUpdate = this._register(new Emitter());
        this.onDidUpdate = this._onDidUpdate.event;
        this.visible = true;
        this.focusedAgentSessionArchivedContextKey = ChatContextKeys.isArchivedAgentSession.bindTo(this.contextKeyService);
        this.focusedAgentSessionPinnedContextKey = ChatContextKeys.isPinnedAgentSession.bindTo(this.contextKeyService);
        this.focusedAgentSessionReadContextKey = ChatContextKeys.isReadAgentSession.bindTo(this.contextKeyService);
        this.focusedAgentSessionTypeContextKey = ChatContextKeys.agentSessionType.bindTo(this.contextKeyService);
        this.hasMultipleAgentSessionsSelectedContextKey = ChatContextKeys.hasMultipleAgentSessionsSelected.bindTo(this.contextKeyService);
        this.create(this.container);
        this.registerListeners();
    }
    registerListeners() {
        this._register(this.editorService.onDidActiveEditorChange(() => this.revealAndFocusActiveEditorSession()));
    }
    revealAndFocusActiveEditorSession() {
        if (!this.options.trackActiveEditorSession() ||
            !this.visible) {
            return;
        }
        const input = this.editorService.activeEditor;
        const resource = (input instanceof ChatEditorInput) ? input.sessionResource : input?.resource;
        if (!resource) {
            return;
        }
        const matchingSession = this.agentSessionsService.model.getSession(resource);
        if (matchingSession && this.sessionsList?.hasNode(matchingSession)) {
            if (this.sessionsList.getRelativeTop(matchingSession) === null) {
                this.sessionsList.reveal(matchingSession, 0.5); // only reveal when not already visible
            }
            this.sessionsList.setFocus([matchingSession]);
            this.sessionsList.setSelection([matchingSession]);
        }
    }
    create(container) {
        this.sessionsContainer = append(container, $('.agent-sessions-viewer'));
        this.createEmptyFilterMessage(this.sessionsContainer);
        this.createList(this.sessionsContainer);
    }
    createEmptyFilterMessage(container) {
        this.emptyFilterMessage = append(container, $('.agent-sessions-empty-filter-message'));
        hide(this.emptyFilterMessage);
        const span = append(this.emptyFilterMessage, $('span'));
        span.textContent = `${localize('agentSessions.noFilterResults', "No matching sessions")} - `;
        const link = append(this.emptyFilterMessage, $('span.reset-filter-link'));
        link.textContent = localize('agentSessions.resetFilter', "Reset Filter");
        link.tabIndex = 0;
        link.setAttribute('role', 'button');
        this._register(addDisposableListener(link, EventType.CLICK, () => this.options.filter.reset()));
        this._register(addDisposableListener(link, EventType.KEY_DOWN, (e) => {
            const event = new StandardKeyboardEvent(e);
            if (event.keyCode === 3 /* KeyCode.Enter */ || event.keyCode === 10 /* KeyCode.Space */) {
                EventHelper.stop(e, true);
                this.options.filter.reset();
            }
        }));
    }
    static { this.SECTION_COLLAPSE_STATE_KEY = 'agentSessions.sectionCollapseState'; }
    getSavedCollapseState(section) {
        const raw = this.storageService.get(AgentSessionsControl_1.SECTION_COLLAPSE_STATE_KEY, 0 /* StorageScope.PROFILE */);
        if (raw) {
            try {
                const state = JSON.parse(raw);
                if (typeof state[section] === 'boolean') {
                    return state[section];
                }
            }
            catch {
                // ignore corrupt data
            }
        }
        return undefined;
    }
    saveSectionCollapseState(section, collapsed) {
        let state = {};
        const raw = this.storageService.get(AgentSessionsControl_1.SECTION_COLLAPSE_STATE_KEY, 0 /* StorageScope.PROFILE */);
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
        state[section] = collapsed;
        this.storageService.store(AgentSessionsControl_1.SECTION_COLLAPSE_STATE_KEY, JSON.stringify(state), 0 /* StorageScope.PROFILE */, 0 /* StorageTarget.USER */);
    }
    resetSectionCollapseState() {
        this.storageService.remove(AgentSessionsControl_1.SECTION_COLLAPSE_STATE_KEY, 0 /* StorageScope.PROFILE */);
    }
    createList(container) {
        const collapseByDefault = (element) => {
            if (isAgentSessionSection(element)) {
                // Check for persisted user preference first
                const saved = this.getSavedCollapseState(element.section);
                if (saved !== undefined) {
                    return saved;
                }
                if (element.section === "more" /* AgentSessionSection.More */ && !this.options.filter.getExcludes().read) {
                    return true; // More section is always collapsed unless only showing unread
                }
                if (element.section === "archived" /* AgentSessionSection.Archived */ && this.options.filter.getExcludes().archived) {
                    return true; // Archived section is collapsed when archived are excluded
                }
                if (this.options.collapseOlderSections?.()) {
                    const olderSections = ["week" /* AgentSessionSection.Week */, "older" /* AgentSessionSection.Older */, "archived" /* AgentSessionSection.Archived */];
                    if (olderSections.includes(element.section)) {
                        return true; // Collapse older time sections if option is enabled
                    }
                    if (element.section === "yesterday" /* AgentSessionSection.Yesterday */ && this.hasTodaySessions()) {
                        return true; // Also collapse Yesterday when there are sessions from Today
                    }
                    if (element.section === "repository" /* AgentSessionSection.Repository */ && !this._recentRepositoryLabels.has(element.label)) {
                        return true; // Collapse repository sections that don't contain recent sessions
                    }
                }
            }
            return false;
        };
        const sorter = new AgentSessionsSorter(() => this.options.filter.sortResults?.() ?? AgentSessionsSorting.Created);
        const approvalModel = this.options.enableApprovalRow ? this._register(this.instantiationService.createInstance(AgentSessionApprovalModel)) : undefined;
        const activeSessionResource = observableValue(this, undefined);
        const sessionRenderer = this._register(this.instantiationService.createInstance(AgentSessionRenderer, {
            ...this.options,
            isGroupedByRepository: () => this.options.filter.groupResults?.() === AgentSessionsGrouping.Repository,
            isSortedByUpdated: () => this.options.filter.sortResults?.() === AgentSessionsSorting.Updated,
        }, approvalModel, activeSessionResource));
        const compact = this.options.compactShowMore;
        const sessionDataSource = this.sessionsDataSource = this._register(new AgentSessionsDataSource(this.options.filter, sorter, this.options.repositoryGroupLimit));
        const list = this.sessionsList = this._register(this.instantiationService.createInstance(WorkbenchCompressibleAsyncDataTree, 'AgentSessionsView', container, new AgentSessionsListDelegate(approvalModel, this.options.compactShowMore), new AgentSessionsCompressionDelegate(), [
            sessionRenderer,
            this.instantiationService.createInstance(AgentSessionSectionRenderer, { hideSectionCount: this.options.hideSectionCount }),
            new AgentSessionShowMoreRenderer({ compactLabel: this.options.compactShowMore }),
            new AgentSessionShowLessRenderer(),
        ], sessionDataSource, {
            accessibilityProvider: new AgentSessionsAccessibilityProvider(),
            dnd: this.instantiationService.createInstance(AgentSessionsDragAndDrop),
            identityProvider: new AgentSessionsIdentityProvider(),
            horizontalScrolling: false,
            multipleSelectionSupport: true,
            findWidgetEnabled: true,
            defaultFindMode: TreeFindMode.Filter,
            keyboardNavigationLabelProvider: new AgentSessionsKeyboardNavigationLabelProvider(),
            overrideStyles: this.options.overrideStyles,
            twistieAdditionalCssClass: () => 'force-no-twistie',
            collapseByDefault: (element) => collapseByDefault(element),
            renderIndentGuides: RenderIndentGuides.None,
        }));
        ChatContextKeys.agentSessionsViewerFocused.bindTo(list.contextKeyService);
        this._register(sessionRenderer.onDidChangeItemHeight(session => {
            if (list.hasNode(session)) {
                list.updateElementHeight(session, undefined);
            }
        }));
        // In compact mode, expand show-more/show-less when hovering any item in the same group
        if (compact) {
            let expandedShowMoreElement;
            let expandedSectionLabel;
            let currentAnimatedHeight = AgentSessionShowMoreRenderer.COLLAPSED_HEIGHT;
            const sectionToShowMore = new Map();
            const rebuildSectionMap = () => {
                sectionToShowMore.clear();
                try {
                    const rootNode = list.getNode();
                    for (const sectionNode of rootNode.children) {
                        if (isAgentSessionSection(sectionNode.element)) {
                            const label = sectionNode.element.label;
                            for (const child of sectionNode.children) {
                                if (isAgentSessionShowMore(child.element) || isAgentSessionShowLess(child.element)) {
                                    sectionToShowMore.set(label, child.element);
                                }
                            }
                        }
                    }
                }
                catch {
                    // Tree may not be initialized yet
                }
            };
            let expandAnimationId;
            let collapseAnimationId;
            const targetWindow = getWindow(container);
            // Cancel pending animations on dispose to avoid calling into a disposed tree
            this._register({
                dispose: () => {
                    if (expandAnimationId) {
                        targetWindow.cancelAnimationFrame(expandAnimationId);
                    }
                    if (collapseAnimationId) {
                        targetWindow.cancelAnimationFrame(collapseAnimationId);
                    }
                }
            });
            const animateHeight = (element, from, to, onComplete) => {
                // Respect prefers-reduced-motion
                if (this.accessibilityService.isMotionReduced()) {
                    if (list.hasNode(element)) {
                        isUpdatingHeight = true;
                        try {
                            list.updateElementHeight(element, to);
                        }
                        finally {
                            isUpdatingHeight = false;
                        }
                        currentAnimatedHeight = to;
                    }
                    onComplete?.();
                    return undefined;
                }
                const duration = 150;
                const start = Date.now();
                const step = () => {
                    const elapsed = Date.now() - start;
                    const progress = Math.min(elapsed / duration, 1);
                    const eased = 1 - Math.pow(1 - progress, 2);
                    const height = Math.round(from + (to - from) * eased);
                    if (list.hasNode(element)) {
                        isUpdatingHeight = true;
                        try {
                            list.updateElementHeight(element, height);
                        }
                        finally {
                            isUpdatingHeight = false;
                        }
                        currentAnimatedHeight = height;
                    }
                    if (progress < 1) {
                        return targetWindow.requestAnimationFrame(step);
                    }
                    onComplete?.();
                    return undefined;
                };
                return targetWindow.requestAnimationFrame(step);
            };
            const collapseCurrentShowMore = () => {
                if (collapseAnimationId) {
                    targetWindow.cancelAnimationFrame(collapseAnimationId);
                    collapseAnimationId = undefined;
                }
                if (expandAnimationId) {
                    targetWindow.cancelAnimationFrame(expandAnimationId);
                    expandAnimationId = undefined;
                }
                if (expandedShowMoreElement && expandedSectionLabel) {
                    if (list.hasNode(expandedShowMoreElement)) {
                        collapseAnimationId = animateHeight(expandedShowMoreElement, currentAnimatedHeight, AgentSessionShowMoreRenderer.COLLAPSED_HEIGHT, () => { collapseAnimationId = undefined; });
                    }
                }
                expandedShowMoreElement = undefined;
                expandedSectionLabel = undefined;
            };
            const expandShowMore = (sectionLabel) => {
                if (expandedSectionLabel === sectionLabel) {
                    return;
                }
                collapseCurrentShowMore();
                const showMoreItem = sectionToShowMore.get(sectionLabel);
                if (!showMoreItem || !list.hasNode(showMoreItem)) {
                    return;
                }
                expandedShowMoreElement = showMoreItem;
                expandedSectionLabel = sectionLabel;
                currentAnimatedHeight = AgentSessionShowMoreRenderer.COLLAPSED_HEIGHT;
                expandAnimationId = animateHeight(showMoreItem, AgentSessionShowMoreRenderer.COLLAPSED_HEIGHT, AgentSessionShowMoreRenderer.HEIGHT, () => { expandAnimationId = undefined; });
            };
            // Listen to tree model changes — rebuild the section map.
            // Use a flag to avoid re-entrancy since updateElementHeight
            // triggers model changes.
            let isUpdatingHeight = false;
            this._register(list.onDidChangeModel(() => {
                if (isUpdatingHeight) {
                    return;
                }
                expandedShowMoreElement = undefined;
                expandedSectionLabel = undefined;
                currentAnimatedHeight = AgentSessionShowMoreRenderer.COLLAPSED_HEIGHT;
                rebuildSectionMap();
            }));
            // On mouseover, determine section from the hovered element
            this._register(addDisposableListener(container, 'mouseover', (e) => {
                const target = e.target;
                const row = target.closest('.monaco-list-row');
                if (!row) {
                    return;
                }
                let sectionLabel;
                // Section header — querySelector is needed to identify elements within virtualized list rows
                // eslint-disable-next-line no-restricted-syntax
                const sectionHeaderEl = row.querySelector('.agent-session-section-label');
                if (sectionHeaderEl) {
                    sectionLabel = sectionHeaderEl.textContent ?? undefined;
                }
                // Show-more element
                if (!sectionLabel) {
                    // eslint-disable-next-line no-restricted-syntax
                    const showMoreEl = row.querySelector('.agent-session-show-more');
                    if (showMoreEl) {
                        sectionLabel = showMoreEl.getAttribute('data-section-label') ?? undefined;
                    }
                }
                // Session item — use data-section-label attribute
                if (!sectionLabel) {
                    // eslint-disable-next-line no-restricted-syntax
                    const sessionItem = row.querySelector('.agent-session-item[data-section-label]');
                    if (sessionItem) {
                        sectionLabel = sessionItem.getAttribute('data-section-label') ?? undefined;
                    }
                }
                // If we couldn't determine the section but are still hovering
                // inside a row with a session item, keep the current state
                // (prevents collapse when hovering toolbar icons, diff stats, etc.)
                if (!sectionLabel) {
                    // eslint-disable-next-line no-restricted-syntax
                    if (row.querySelector('.agent-session-item')) {
                        return;
                    }
                    collapseCurrentShowMore();
                    return;
                }
                if (!sectionToShowMore.has(sectionLabel)) {
                    collapseCurrentShowMore();
                    return;
                }
                expandShowMore(sectionLabel);
            }));
            this._register(addDisposableListener(container, 'mouseleave', () => {
                collapseCurrentShowMore();
            }));
            rebuildSectionMap();
        }
        this._register(sessionDataSource.onDidGetChildren(count => {
            this.updateEmpty(count === 0);
        }));
        this._register(sessionDataSource.onDidExpandRepositoryGroup(() => {
            this.update();
        }));
        const model = this.agentSessionsService.model;
        this._register(this.options.filter.onDidChange(async () => {
            if (this.visible) {
                this.updateSectionCollapseStates();
                this.update();
            }
        }));
        this._register(model.onDidChangeSessions(() => {
            if (this.visible) {
                this.update();
            }
        }));
        this.computeRecentRepositoryLabels();
        list.setInput(model);
        this._register(list.onDidOpen(e => this.openAgentSession(e)));
        this._register(list.onContextMenu(e => this.showContextMenu(e)));
        this._register(list.onMouseDblClick(({ element }) => {
            if (element === null) {
                this.commandService.executeCommand(ACTION_ID_NEW_CHAT);
            }
        }));
        this._register(Event.any(list.onDidChangeFocus, list.onDidChangeSelection, model.onDidChangeSessions)(() => {
            const focused = list.getFocus().at(0);
            if (focused && isAgentSession(focused)) {
                this.focusedAgentSessionArchivedContextKey.set(focused.isArchived());
                this.focusedAgentSessionPinnedContextKey.set(focused.isPinned());
                this.focusedAgentSessionReadContextKey.set(focused.isRead());
                this.focusedAgentSessionTypeContextKey.set(focused.providerType);
                activeSessionResource.set(focused.resource, undefined);
            }
            else {
                this.focusedAgentSessionArchivedContextKey.reset();
                this.focusedAgentSessionPinnedContextKey.reset();
                this.focusedAgentSessionReadContextKey.reset();
                this.focusedAgentSessionTypeContextKey.reset();
                activeSessionResource.set(undefined, undefined);
            }
            const selection = list.getSelection().filter(isAgentSession);
            this.hasMultipleAgentSessionsSelectedContextKey.set(selection.length > 1);
        }));
        this._register(list.onDidChangeFindOpenState(open => {
            this.sessionsListFindIsOpen = open;
            this.updateSectionCollapseStates();
        }));
        this._register(list.onDidChangeCollapseState(e => {
            if (this._isProgrammaticCollapseChange) {
                return;
            }
            const element = e.node.element?.element;
            if (element && isAgentSessionSection(element)) {
                this.saveSectionCollapseState(element.section, e.node.collapsed);
            }
        }));
    }
    updateEmpty(isEmpty) {
        if (!this.emptyFilterMessage || !this.sessionsList) {
            return;
        }
        const model = this.agentSessionsService.model;
        const hasSessionsInModel = model.sessions.length > 0;
        const isFilterActive = !this.options.filter.isDefault();
        const showEmpty = hasSessionsInModel && isEmpty && isFilterActive;
        setVisibility(showEmpty, this.emptyFilterMessage);
        setVisibility(!showEmpty, this.sessionsList.getHTMLElement());
    }
    hasTodaySessions() {
        const startOfToday = new Date().setHours(0, 0, 0, 0);
        return this.agentSessionsService.model.sessions.some(session => !session.isArchived() &&
            session.timing.created >= startOfToday);
    }
    computeRecentRepositoryLabels() {
        this._recentRepositoryLabels.clear();
        const sessions = this.agentSessionsService.model.sessions
            .filter(s => !s.isArchived() && !s.isPinned())
            .sort((a, b) => b.timing.created - a.timing.created)
            .slice(0, AgentSessionsControl_1.RECENT_SESSIONS_FOR_EXPAND);
        for (const session of sessions) {
            const name = getRepositoryName(session);
            this._recentRepositoryLabels.add(name ?? AgentSessionSectionLabels["repository" /* AgentSessionSection.Repository */]);
        }
    }
    async openAgentSession(e) {
        const element = e.element;
        if (!element || isAgentSessionSection(element)) {
            return; // Section headers are not openable
        }
        if (isAgentSessionShowMore(element)) {
            this.sessionsDataSource?.expandRepositoryGroup(element.sectionLabel);
            return;
        }
        if (isAgentSessionShowLess(element)) {
            this.sessionsDataSource?.collapseRepositoryGroup(element.sectionLabel);
            return;
        }
        this.telemetryService.publicLog2('agentSessionOpened', {
            providerType: element.providerType,
            source: this.options.source
        });
        const options = this.options.overrideSessionOpenOptions?.(e) ?? e;
        if (this.options.overrideSessionOpen) {
            await this.options.overrideSessionOpen(element.resource, options);
        }
        else {
            const widget = await this.instantiationService.invokeFunction(openSession, element, options);
            if (widget) {
                this.options.notifySessionOpened?.(element.resource, widget);
            }
        }
    }
    async showContextMenu({ element, anchor, browserEvent }) {
        if (!element || isAgentSessionShowMore(element) || isAgentSessionShowLess(element)) {
            return;
        }
        EventHelper.stop(browserEvent, true);
        if (isAgentSessionSection(element)) {
            this.showAgentSessionSectionContextMenu(element, anchor);
        }
        else {
            this.showAgentSessionContextMenu(element, anchor);
        }
    }
    async showAgentSessionSectionContextMenu(section, anchor) {
        const contextOverlay = [];
        contextOverlay.push([ChatContextKeys.agentSessionSection.key, section.section]);
        const menu = this.menuService.createMenu(MenuId.AgentSessionSectionContext, this.contextKeyService.createOverlay(contextOverlay));
        this.contextMenuService.showContextMenu({
            getActions: () => Separator.join(...menu.getActions({ arg: section, shouldForwardArgs: true }).map(([, actions]) => actions)),
            getAnchor: () => anchor,
            getActionsContext: () => this,
        });
        menu.dispose();
    }
    async showAgentSessionContextMenu(session, anchor) {
        this.chatSessionsService.activateChatSessionItemProvider(session.providerType);
        const contextOverlay = [];
        contextOverlay.push([ChatContextKeys.isArchivedAgentSession.key, session.isArchived()]);
        contextOverlay.push([ChatContextKeys.isPinnedAgentSession.key, session.isPinned()]);
        contextOverlay.push([ChatContextKeys.isReadAgentSession.key, session.isRead()]);
        contextOverlay.push([ChatContextKeys.agentSessionType.key, session.providerType]);
        const menu = this.menuService.createMenu(MenuId.AgentSessionsContext, this.contextKeyService.createOverlay(contextOverlay));
        const selection = this.sessionsList?.getSelection().filter(isAgentSession) ?? [];
        const marshalledContext = {
            session,
            sessions: selection.length > 1 && selection.includes(session) ? selection : [session],
            $mid: 25 /* MarshalledId.AgentSessionContext */
        };
        this.contextMenuService.showContextMenu({
            getActions: () => Separator.join(...menu.getActions({ arg: marshalledContext, shouldForwardArgs: true }).map(([, actions]) => actions)),
            getAnchor: () => anchor,
            getActionsContext: () => marshalledContext,
        });
        menu.dispose();
    }
    openFind() {
        this.sessionsList?.openFind();
    }
    updateSectionCollapseStates() {
        if (!this.sessionsList) {
            return;
        }
        this._isProgrammaticCollapseChange = true;
        try {
            this._updateSectionCollapseStatesCore();
        }
        finally {
            this._isProgrammaticCollapseChange = false;
        }
    }
    _updateSectionCollapseStatesCore() {
        if (!this.sessionsList) {
            return;
        }
        const model = this.agentSessionsService.model;
        for (const child of this.sessionsList.getNode(model).children) {
            if (!isAgentSessionSection(child.element)) {
                continue;
            }
            switch (child.element.section) {
                case "archived" /* AgentSessionSection.Archived */: {
                    const shouldCollapseArchived = !this.sessionsListFindIsOpen && // always expand when find is open
                        this.options.filter.getExcludes().archived; // only collapse when archived are excluded from filter
                    if (shouldCollapseArchived && !child.collapsed) {
                        this.sessionsList.collapse(child.element);
                    }
                    else if (!shouldCollapseArchived && child.collapsed) {
                        this.sessionsList.expand(child.element);
                    }
                    break;
                }
                case "more" /* AgentSessionSection.More */: {
                    if (child.collapsed && this.sessionsListFindIsOpen) {
                        this.sessionsList.expand(child.element); // always expand when find is open
                    }
                    break;
                }
            }
        }
    }
    refresh() {
        return this.agentSessionsService.model.resolve(undefined);
    }
    collapseAllSections() {
        if (!this.sessionsList) {
            return;
        }
        const model = this.agentSessionsService.model;
        for (const child of this.sessionsList.getNode(model).children) {
            if (isAgentSessionSection(child.element) && !child.collapsed) {
                this.sessionsList.collapse(child.element);
            }
        }
    }
    async update() {
        return this.updateSessionsListThrottler.queue(async () => {
            this.computeRecentRepositoryLabels();
            await this.sessionsList?.updateChildren();
            this._onDidUpdate.fire();
        });
    }
    setVisible(visible) {
        if (this.visible === visible) {
            return;
        }
        this.visible = visible;
        if (this.visible) {
            this.update();
        }
    }
    layout(height, width) {
        this.sessionsList?.layout(height, width);
    }
    focus() {
        this.sessionsList?.domFocus();
    }
    clearFocus() {
        this.sessionsList?.setFocus([]);
        this.sessionsList?.setSelection([]);
    }
    hasFocusOrSelection() {
        return (this.sessionsList?.getFocus().length ?? 0) > 0 || (this.sessionsList?.getSelection().length ?? 0) > 0;
    }
    scrollToTop() {
        if (this.sessionsList) {
            this.sessionsList.scrollTop = 0;
        }
    }
    getFocus() {
        const focused = this.sessionsList?.getFocus() ?? [];
        return focused.filter(e => isAgentSession(e));
    }
    reveal(sessionResource) {
        if (!this.sessionsList) {
            return false;
        }
        const session = this.agentSessionsService.model.getSession(sessionResource);
        if (!session || !this.sessionsList.hasNode(session)) {
            return false;
        }
        if (this.sessionsList.getRelativeTop(session) === null) {
            this.sessionsList.reveal(session, 0.5); // only reveal when not already visible
        }
        this.sessionsList.setFocus([session]);
        this.sessionsList.setSelection([session]);
        return true;
    }
};
AgentSessionsControl = AgentSessionsControl_1 = __decorate([
    __param(2, IContextMenuService),
    __param(3, IContextKeyService),
    __param(4, IInstantiationService),
    __param(5, IChatSessionsService),
    __param(6, ICommandService),
    __param(7, IMenuService),
    __param(8, IAgentSessionsService),
    __param(9, ITelemetryService),
    __param(10, IEditorService),
    __param(11, IStorageService),
    __param(12, IAccessibilityService)
], AgentSessionsControl);
export { AgentSessionsControl };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYWdlbnRTZXNzaW9uc0NvbnRyb2wuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi9jaGF0L2Jyb3dzZXIvYWdlbnRTZXNzaW9ucy9hZ2VudFNlc3Npb25zQ29udHJvbC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7Ozs7QUFFaEcsT0FBTyxFQUFlLGtCQUFrQixFQUFFLE1BQU0seURBQXlELENBQUM7QUFDMUcsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLHlDQUF5QyxDQUFDO0FBQzFFLE9BQU8sRUFBRSxtQkFBbUIsRUFBRSxNQUFNLDREQUE0RCxDQUFDO0FBQ2pHLE9BQU8sRUFBRSxxQkFBcUIsRUFBRSxNQUFNLCtEQUErRCxDQUFDO0FBQ3RHLE9BQU8sRUFBYyxrQ0FBa0MsRUFBRSxNQUFNLHFEQUFxRCxDQUFDO0FBQ3JILE9BQU8sRUFBRSxDQUFDLEVBQUUsTUFBTSxFQUFFLFdBQVcsRUFBRSxxQkFBcUIsRUFBRSxTQUFTLEVBQUUsU0FBUyxFQUFFLElBQUksRUFBRSxhQUFhLEVBQUUsTUFBTSxvQ0FBb0MsQ0FBQztBQUM5SSxPQUFPLEVBQUUscUJBQXFCLEVBQUUsTUFBTSw4Q0FBOEMsQ0FBQztBQUVyRixPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sdUJBQXVCLENBQUM7QUFDakQsT0FBTyxFQUFpSCxjQUFjLEVBQUUscUJBQXFCLEVBQUUsc0JBQXNCLEVBQUUsc0JBQXNCLEVBQUUsTUFBTSx5QkFBeUIsQ0FBQztBQUMvTyxPQUFPLEVBQXdCLG9CQUFvQixFQUFFLGtDQUFrQyxFQUFFLGdDQUFnQyxFQUFFLHVCQUF1QixFQUFFLHdCQUF3QixFQUFFLDZCQUE2QixFQUFFLDRDQUE0QyxFQUFFLHlCQUF5QixFQUFFLDJCQUEyQixFQUFFLHlCQUF5QixFQUFFLDRCQUE0QixFQUFFLDRCQUE0QixFQUFF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