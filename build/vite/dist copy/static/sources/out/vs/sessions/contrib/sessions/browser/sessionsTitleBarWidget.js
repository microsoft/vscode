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
import './media/sessionsTitleBarWidget.css';
import { $, addDisposableListener, append, EventType, getActiveWindow, reset } from '../../../../base/browser/dom.js';
import { Separator } from '../../../../base/common/actions.js';
import { Disposable, DisposableStore } from '../../../../base/common/lifecycle.js';
import { StandardMouseEvent } from '../../../../base/browser/mouseEvent.js';
import { localize } from '../../../../nls.js';
import { IHoverService } from '../../../../platform/hover/browser/hover.js';
import { getDefaultHoverDelegate } from '../../../../base/browser/ui/hover/hoverDelegateFactory.js';
import { ActionViewItem, BaseActionViewItem } from '../../../../base/browser/ui/actionbar/actionViewItems.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IMenuService, MenuRegistry, SubmenuItemAction } from '../../../../platform/actions/common/actions.js';
import { ContextKeyExpr, IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IContextMenuService } from '../../../../platform/contextview/browser/contextView.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { IWorkbenchLayoutService } from '../../../../workbench/services/layout/browser/layoutService.js';
import { Menus } from '../../../browser/menus.js';
import { IActionViewItemService } from '../../../../platform/actions/browser/actionViewItemService.js';
import { ISessionsManagementService } from './sessionsManagementService.js';
import { autorun, observableSignalFromEvent } from '../../../../base/common/observable.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { IsAuxiliaryWindowContext } from '../../../../workbench/common/contextkeys.js';
import { ChatSessionProviderIdContext, IsNewChatSessionContext, SessionsWelcomeVisibleContext } from '../../../common/contextkeys.js';
import { ISessionsProvidersService } from './sessionsProvidersService.js';
import { SHOW_SESSIONS_PICKER_COMMAND_ID } from './sessionsActions.js';
import { IsSessionArchivedContext, IsSessionPinnedContext, IsSessionReadContext, SessionItemContextMenuId } from './views/sessionsList.js';
import { SessionsViewId } from './views/sessionsView.js';
import { IViewsService } from '../../../../workbench/services/views/common/viewsService.js';
/**
 * Sessions Title Bar Widget - renders the active chat session title
 * in the command center of the agent sessions workbench.
 *
 * Shows the current chat session label as a clickable pill with:
 * - Kind icon at the beginning (provider type icon)
 * - Session title
 * - Repository folder name
 *
 * Session actions (changes, terminal, etc.) are rendered via the
 * SessionTitleActions menu toolbar next to the session title.
 *
 * On click, opens the sessions picker.
 */
let SessionsTitleBarWidget = class SessionsTitleBarWidget extends BaseActionViewItem {
    constructor(action, options, hoverService, sessionsManagementService, contextMenuService, menuService, contextKeyService, sessionsProvidersService, commandService, viewsService) {
        super(undefined, action, options);
        this.hoverService = hoverService;
        this.sessionsManagementService = sessionsManagementService;
        this.contextMenuService = contextMenuService;
        this.menuService = menuService;
        this.contextKeyService = contextKeyService;
        this.sessionsProvidersService = sessionsProvidersService;
        this.commandService = commandService;
        this.viewsService = viewsService;
        this._dynamicDisposables = this._register(new DisposableStore());
        /** Guard to prevent re-entrant rendering */
        this._isRendering = false;
        // Re-render when the active session, its data, or the active provider changes
        this._register(autorun(reader => {
            const sessionData = this.sessionsManagementService.activeSession.read(reader);
            if (sessionData) {
                sessionData.title.read(reader);
                sessionData.status.read(reader);
            }
            this.sessionsManagementService.activeProviderId.read(reader);
            this._lastRenderState = undefined;
            this._render();
        }));
        // Re-render when sessions data changes (e.g., changes info updated)
        this._register(this.sessionsManagementService.onDidChangeSessions(() => {
            this._lastRenderState = undefined;
            this._render();
        }));
        // Re-render when providers change (affects provider picker visibility)
        this._register(this.sessionsProvidersService.onDidChangeProviders(() => {
            this._lastRenderState = undefined;
            this._render();
        }));
    }
    render(container) {
        super.render(container);
        this._container = container;
        container.classList.add('agent-sessions-titlebar-container');
        // Initial render
        this._render();
    }
    setFocusable(_focusable) {
        // Don't set focusable on the container
    }
    // Override onClick to prevent the base class from running the underlying
    // submenu action when the widget handles clicks itself.
    onClick() {
        // No-op: click handling is done by the pill handler
    }
    _render() {
        if (!this._container) {
            return;
        }
        if (this._isRendering) {
            return;
        }
        this._isRendering = true;
        try {
            const label = this._getActiveSessionLabel();
            const icon = this._getActiveSessionIcon();
            const repoLabel = this._getRepositoryLabel();
            // Build a render-state key from all displayed data
            const renderState = `${icon?.id ?? ''}|${label}|${repoLabel ?? ''}`;
            // Skip re-render if state hasn't changed
            if (this._lastRenderState === renderState) {
                return;
            }
            this._lastRenderState = renderState;
            // Clear existing content
            reset(this._container);
            this._dynamicDisposables.clear();
            // Set up container as the button directly
            this._container.setAttribute('role', 'button');
            this._container.setAttribute('aria-label', localize('agentSessionsShowSessions', "Show Sessions"));
            this._container.tabIndex = 0;
            // Session pill: icon + label + folder together
            const sessionPill = $('span.agent-sessions-titlebar-pill');
            // Center group: icon + label + folder
            const centerGroup = $('span.agent-sessions-titlebar-center');
            // Kind icon at the beginning
            if (icon) {
                const iconEl = $('span.agent-sessions-titlebar-icon' + ThemeIcon.asCSSSelector(icon));
                centerGroup.appendChild(iconEl);
            }
            // Label
            const labelEl = $('span.agent-sessions-titlebar-label');
            labelEl.textContent = label;
            centerGroup.appendChild(labelEl);
            // Folder shown next to the title
            if (repoLabel) {
                const separator1 = $('span.agent-sessions-titlebar-separator');
                separator1.textContent = '\u00B7';
                centerGroup.appendChild(separator1);
                const repoEl = $('span.agent-sessions-titlebar-repo');
                repoEl.textContent = repoLabel;
                centerGroup.appendChild(repoEl);
            }
            sessionPill.appendChild(centerGroup);
            // Click handler on pill
            this._dynamicDisposables.add(addDisposableListener(sessionPill, EventType.MOUSE_DOWN, (e) => {
                e.preventDefault();
                e.stopPropagation();
            }));
            this._dynamicDisposables.add(addDisposableListener(sessionPill, EventType.CLICK, (e) => {
                e.preventDefault();
                e.stopPropagation();
                this._showSessionsPicker();
            }));
            this._dynamicDisposables.add(addDisposableListener(sessionPill, EventType.CONTEXT_MENU, (e) => {
                e.preventDefault();
                e.stopPropagation();
                this._showContextMenu(e);
            }));
            this._container.appendChild(sessionPill);
            // Hover
            this._dynamicDisposables.add(this.hoverService.setupManagedHover(getDefaultHoverDelegate('mouse'), sessionPill, label));
            // Keyboard handler
            this._dynamicDisposables.add(addDisposableListener(this._container, EventType.KEY_DOWN, (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    e.stopPropagation();
                    this._showSessionsPicker();
                }
            }));
        }
        finally {
            this._isRendering = false;
        }
    }
    /**
     * Get the label of the active chat session.
     */
    _getActiveSessionLabel() {
        const sessionData = this.sessionsManagementService.activeSession.get();
        if (sessionData) {
            return sessionData.title.get() || localize('agentSessions.newSession', "New Session");
        }
        return localize('agentSessions.newSession', "New Session");
    }
    /**
     * Get the icon for the active session's type.
     */
    _getActiveSessionIcon() {
        const sessionData = this.sessionsManagementService.activeSession.get();
        if (sessionData) {
            return sessionData.icon;
        }
        return undefined;
    }
    /**
     * Get the repository label for the active session.
     */
    _getRepositoryLabel() {
        const sessionData = this.sessionsManagementService.activeSession.get();
        if (sessionData) {
            const workspace = sessionData.workspace.get();
            if (workspace) {
                return workspace.label;
            }
        }
        return undefined;
    }
    _showContextMenu(e) {
        const sessionData = this.sessionsManagementService.activeSession.get();
        if (!sessionData) {
            return;
        }
        if (this.contextKeyService.getContextKeyValue(IsNewChatSessionContext.key)) {
            return;
        }
        const isPinned = this.viewsService.getViewWithId(SessionsViewId)?.sessionsControl?.isSessionPinned(sessionData) ?? false;
        const contextOverlay = [
            [IsSessionPinnedContext.key, isPinned],
            [IsSessionArchivedContext.key, sessionData.isArchived.get()],
            [IsSessionReadContext.key, sessionData.isRead.get()],
            ['chatSessionType', sessionData.sessionType],
            [ChatSessionProviderIdContext.key, sessionData.providerId],
        ];
        const menu = this.menuService.createMenu(SessionItemContextMenuId, this.contextKeyService.createOverlay(contextOverlay));
        this.contextMenuService.showContextMenu({
            getActions: () => Separator.join(...menu.getActions({ arg: sessionData, shouldForwardArgs: true }).map(([, actions]) => actions)),
            getAnchor: () => new StandardMouseEvent(getActiveWindow(), e),
        });
        menu.dispose();
    }
    _showSessionsPicker() {
        this.commandService.executeCommand(SHOW_SESSIONS_PICKER_COMMAND_ID);
    }
};
SessionsTitleBarWidget = __decorate([
    __param(2, IHoverService),
    __param(3, ISessionsManagementService),
    __param(4, IContextMenuService),
    __param(5, IMenuService),
    __param(6, IContextKeyService),
    __param(7, ISessionsProvidersService),
    __param(8, ICommandService),
    __param(9, IViewsService)
], SessionsTitleBarWidget);
export { SessionsTitleBarWidget };
/**
 * Custom action view item for the sidebar toggle button.
 * Renders the tasklist icon with an unread session count badge.
 */
let SidebarToggleActionViewItem = class SidebarToggleActionViewItem extends ActionViewItem {
    constructor(context, action, options, sessionsManagementService, layoutService) {
        super(context, action, { ...options, icon: true, label: false });
        this.sessionsManagementService = sessionsManagementService;
        this.layoutService = layoutService;
    }
    render(container) {
        super.render(container);
        container.classList.add('sidebar-toggle-action');
        // Add badge element for unread session count
        this._countBadge = append(container, $('span.sidebar-toggle-badge'));
        this._countBadge.setAttribute('aria-hidden', 'true');
        this._updateBadge();
        // Single autorun that tracks all badge-relevant state:
        // - session list changes (add/remove) via observableSignalFromEvent
        // - individual session observable state (status, isRead, isArchived)
        // - sidebar visibility changes
        const sessionsChanged = observableSignalFromEvent(this, this.sessionsManagementService.onDidChangeSessions);
        const sidebarVisibilityChanged = observableSignalFromEvent(this, handler => this.layoutService.onDidChangePartVisibility(e => {
            if (e.partId === "workbench.parts.sidebar" /* Parts.SIDEBAR_PART */) {
                handler(e);
            }
        }));
        this._register(autorun(reader => {
            sessionsChanged.read(reader);
            sidebarVisibilityChanged.read(reader);
            for (const session of this.sessionsManagementService.getSessions()) {
                session.isArchived.read(reader);
                session.status.read(reader);
                session.isRead.read(reader);
            }
            this.updateClass();
            this._updateBadge();
        }));
    }
    getClass() {
        return this.layoutService.isVisible("workbench.parts.sidebar" /* Parts.SIDEBAR_PART */)
            ? ThemeIcon.asClassName(Codicon.layoutSidebarLeft)
            : ThemeIcon.asClassName(Codicon.layoutSidebarLeftOff);
    }
    _updateBadge() {
        if (!this._countBadge) {
            return;
        }
        const unreadCount = this._countUnreadSessions();
        const sidebarVisible = this.layoutService.isVisible("workbench.parts.sidebar" /* Parts.SIDEBAR_PART */);
        if (unreadCount > 0 && !sidebarVisible) {
            this._countBadge.textContent = `${unreadCount}`;
            this._countBadge.style.display = '';
        }
        else {
            this._countBadge.style.display = 'none';
        }
        // Update accessible label to include unread count for screen readers
        if (this.label) {
            const baseLabel = this.action.label || localize('toggleSidebarA11y', "Toggle Primary Side Bar");
            if (unreadCount > 0 && !sidebarVisible) {
                this.label.setAttribute('aria-label', localize('toggleSidebarUnread', "{0}, {1} unread session(s)", baseLabel, unreadCount));
            }
            else {
                this.label.setAttribute('aria-label', baseLabel);
            }
        }
    }
    _countUnreadSessions() {
        let unread = 0;
        for (const session of this.sessionsManagementService.getSessions()) {
            if (!session.isArchived.get() && session.status.get() === 3 /* SessionStatus.Completed */ && !session.isRead.get()) {
                unread++;
            }
        }
        return unread;
    }
};
SidebarToggleActionViewItem = __decorate([
    __param(3, ISessionsManagementService),
    __param(4, IWorkbenchLayoutService)
], SidebarToggleActionViewItem);
/**
 * Provides custom rendering for the sessions title bar widget
 * in the command center. Uses IActionViewItemService to render a custom widget
 * for the TitleBarControlMenu submenu.
 */
let SessionsTitleBarContribution = class SessionsTitleBarContribution extends Disposable {
    static { this.ID = 'workbench.contrib.agentSessionsTitleBar'; }
    constructor(actionViewItemService, instantiationService) {
        super();
        // Register the submenu item in the Agent Sessions command center
        this._register(MenuRegistry.appendMenuItem(Menus.CommandCenter, {
            submenu: Menus.TitleBarSessionTitle,
            title: localize('agentSessionsControl', "Agent Sessions"),
            order: 101,
            when: ContextKeyExpr.and(IsAuxiliaryWindowContext.negate(), SessionsWelcomeVisibleContext.negate())
        }));
        // Register a placeholder action so the submenu appears
        this._register(MenuRegistry.appendMenuItem(Menus.TitleBarSessionTitle, {
            command: {
                id: SHOW_SESSIONS_PICKER_COMMAND_ID,
                title: localize('showSessions', "Show Sessions"),
            },
            group: 'a_sessions',
            order: 1,
            when: IsAuxiliaryWindowContext.negate()
        }));
        this._register(actionViewItemService.register(Menus.CommandCenter, Menus.TitleBarSessionTitle, (action, options) => {
            if (!(action instanceof SubmenuItemAction)) {
                return undefined;
            }
            return instantiationService.createInstance(SessionsTitleBarWidget, action, options);
        }, undefined));
        // Register custom view item for sidebar toggle with unread badge
        this._register(actionViewItemService.register(Menus.TitleBarLeftLayout, 'workbench.action.agentToggleSidebarVisibility', (action, options) => {
            return instantiationService.createInstance(SidebarToggleActionViewItem, undefined, action, options);
        }, undefined));
    }
};
SessionsTitleBarContribution = __decorate([
    __param(0, IActionViewItemService),
    __param(1, IInstantiationService)
], SessionsTitleBarContribution);
export { SessionsTitleBarContribution };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2Vzc2lvbnNUaXRsZUJhcldpZGdldC5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3Nlc3Npb25zL2NvbnRyaWIvc2Vzc2lvbnMvYnJvd3Nlci9zZXNzaW9uc1RpdGxlQmFyV2lkZ2V0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7O0FBRWhHLE9BQU8sb0NBQW9DLENBQUM7QUFDNUMsT0FBTyxFQUFFLENBQUMsRUFBRSxxQkFBcUIsRUFBRSxNQUFNLEVBQUUsU0FBUyxFQUFFLGVBQWUsRUFBRSxLQUFLLEVBQUUsTUFBTSxpQ0FBaUMsQ0FBQztBQUN0SCxPQUFPLEVBQVcsU0FBUyxFQUFFLE1BQU0sb0NBQW9DLENBQUM7QUFDeEUsT0FBTyxFQUFFLFVBQVUsRUFBRSxlQUFlLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUNuRixPQUFPLEVBQUUsa0JBQWtCLEVBQUUsTUFBTSx3Q0FBd0MsQ0FBQztBQUM1RSxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sb0JBQW9CLENBQUM7QUFDOUMsT0FBTyxFQUFFLGFBQWEsRUFBRSxNQUFNLDZDQUE2QyxDQUFDO0FBQzVFLE9BQU8sRUFBRSx1QkFBdUIsRUFBRSxNQUFNLDJEQUEyRCxDQUFDO0FBQ3BHLE9BQU8sRUFBRSxjQUFjLEVBQUUsa0JBQWtCLEVBQThCLE1BQU0sMERBQTBELENBQUM7QUFDMUksT0FBTyxFQUFFLHFCQUFxQixFQUFFLE1BQU0sNERBQTRELENBQUM7QUFDbkcsT0FBTyxFQUFFLFlBQVksRUFBRSxZQUFZLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSxnREFBZ0QsQ0FBQztBQUMvRyxPQUFPLEVBQUUsY0FBYyxFQUFFLGtCQUFrQixFQUFFLE1BQU0sc0RBQXNELENBQUM7QUFDMUcsT0FBTyxFQUFFLG1CQUFtQixFQUFFLE1BQU0seURBQXlELENBQUM7QUFDOUYsT0FBTyxFQUFFLGVB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