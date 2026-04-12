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
import './media/agenttitlebarstatuswidget.css';
import { $, addDisposableListener, EventType, getWindow, isHTMLElement, reset } from '../../../../../../base/browser/dom.js';
import { renderIcon } from '../../../../../../base/browser/ui/iconLabel/iconLabels.js';
import { Disposable, DisposableStore } from '../../../../../../base/common/lifecycle.js';
import { Codicon } from '../../../../../../base/common/codicons.js';
import { Event as EventUtils } from '../../../../../../base/common/event.js';
import { localize } from '../../../../../../nls.js';
import { IHoverService } from '../../../../../../platform/hover/browser/hover.js';
import { getDefaultHoverDelegate } from '../../../../../../base/browser/ui/hover/hoverDelegateFactory.js';
import { AgentStatusMode, IAgentTitleBarStatusService } from './agentTitleBarStatusService.js';
import { ICommandService } from '../../../../../../platform/commands/common/commands.js';
import { IKeybindingService } from '../../../../../../platform/keybinding/common/keybinding.js';
import { EnterAgentSessionProjectionAction, ExitAgentSessionProjectionAction } from './agentSessionProjectionActions.js';
import { UNIFIED_QUICK_ACCESS_ACTION_ID } from './unifiedQuickAccessActions.js';
import { IAgentSessionsService } from '../agentSessionsService.js';
import { isSessionInProgressStatus } from '../agentSessionsModel.js';
import { BaseActionViewItem } from '../../../../../../base/browser/ui/actionbar/actionViewItems.js';
import { Separator, SubmenuAction, toAction } from '../../../../../../base/common/actions.js';
import { IWorkspaceContextService } from '../../../../../../platform/workspace/common/workspace.js';
import { IEditorGroupsService } from '../../../../../services/editor/common/editorGroupsService.js';
import { IEditorService } from '../../../../../services/editor/common/editorService.js';
import { renderAsPlaintext } from '../../../../../../base/browser/markdownRenderer.js';
import { IInstantiationService } from '../../../../../../platform/instantiation/common/instantiation.js';
import { IMenuService, MenuId, MenuItemAction, SubmenuItemAction } from '../../../../../../platform/actions/common/actions.js';
import { IContextKeyService } from '../../../../../../platform/contextkey/common/contextkey.js';
import { WorkbenchToolBar } from '../../../../../../platform/actions/browser/toolbar.js';
import { DropdownWithPrimaryActionViewItem } from '../../../../../../platform/actions/browser/dropdownWithPrimaryActionViewItem.js';
import { createActionViewItem } from '../../../../../../platform/actions/browser/menuEntryActionViewItem.js';
import { IStorageService } from '../../../../../../platform/storage/common/storage.js';
import { FocusAgentSessionsAction } from '../agentSessionsActions.js';
import { IActionViewItemService } from '../../../../../../platform/actions/browser/actionViewItemService.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { mainWindow } from '../../../../../../base/browser/window.js';
import { WindowTitle } from '../../../../../browser/parts/titlebar/windowTitle.js';
import { ChatConfiguration } from '../../../common/constants.js';
import { ChatEntitlement, IChatEntitlementService } from '../../../../../services/chat/common/chatEntitlementService.js';
import { IChatWidgetService } from '../../chat.js';
import { ITelemetryService } from '../../../../../../platform/telemetry/common/telemetry.js';
// Action IDs
const TOGGLE_CHAT_ACTION_ID = 'workbench.action.chat.toggle';
const CHAT_SETUP_ACTION_ID = 'workbench.action.chat.triggerSetup';
const OPEN_CHAT_QUOTA_EXCEEDED_DIALOG = 'workbench.action.chat.openQuotaExceededDialog';
const QUICK_OPEN_ACTION_ID = 'workbench.action.quickOpenWithModes';
// Storage key for filter state
const FILTER_STORAGE_KEY = 'agentSessions.filterExcludes.agentsessionsviewerfiltersubmenu';
// Storage key for saving user's filter state before we override it
const PREVIOUS_FILTER_STORAGE_KEY = 'agentSessions.filterExcludes.previousUserFilter';
function shouldForceHiddenAgentStatus(configurationService) {
    const aiFeaturesDisabled = configurationService.getValue(ChatConfiguration.AIDisabled) === true;
    const aiCustomizationsDisabled = configurationService.getValue('disableAICustomizations') === true
        || configurationService.getValue('workbench.disableAICustomizations') === true
        || configurationService.getValue(ChatConfiguration.ChatCustomizationMenuEnabled) === false;
    return aiFeaturesDisabled && aiCustomizationsDisabled;
}
function getAgentStatusSettingMode(configurationService) {
    if (shouldForceHiddenAgentStatus(configurationService)) {
        return 'hidden';
    }
    const value = configurationService.getValue(ChatConfiguration.AgentStatusEnabled);
    if (value === false || value === 'hidden') {
        return 'hidden';
    }
    if (value === 'badge') {
        return 'badge';
    }
    // Backward compatibility: previous experiments stored this as a boolean.
    if (value === true || value === undefined || value === 'compact') {
        return 'compact';
    }
    return 'compact';
}
/**
 * Agent Status Widget - renders agent status in the command center.
 *
 * Shows two different states:
 * 1. Default state: Copilot icon pill (turns blue with in-progress count when agents are running)
 * 2. Agent Session Projection state: Session title + close button (when viewing a session)
 *
 * The command center search box and navigation controls remain visible alongside this control.
 */
let AgentTitleBarStatusWidget = class AgentTitleBarStatusWidget extends BaseActionViewItem {
    constructor(action, options, instantiationService, agentTitleBarStatusService, hoverService, commandService, keybindingService, agentSessionsService, workspaceContextService, editorGroupsService, editorService, menuService, contextKeyService, storageService, configurationService, chatEntitlementService, chatWidgetService, telemetryService) {
        super(undefined, action, options);
        this.instantiationService = instantiationService;
        this.agentTitleBarStatusService = agentTitleBarStatusService;
        this.hoverService = hoverService;
        this.commandService = commandService;
        this.keybindingService = keybindingService;
        this.agentSessionsService = agentSessionsService;
        this.workspaceContextService = workspaceContextService;
        this.editorGroupsService = editorGroupsService;
        this.editorService = editorService;
        this.menuService = menuService;
        this.contextKeyService = contextKeyService;
        this.storageService = storageService;
        this.configurationService = configurationService;
        this.chatEntitlementService = chatEntitlementService;
        this.chatWidgetService = chatWidgetService;
        this.telemetryService = telemetryService;
        this._dynamicDisposables = this._register(new DisposableStore());
        /** Guard to prevent re-entrant rendering */
        this._isRendering = false;
        /** Roving tabindex elements for keyboard navigation */
        this._rovingElements = [];
        this._rovingIndex = 0;
        /** Tracks if this window applied a badge filter (unread/inProgress), so we only auto-clear our own filters */
        // TODO: This is imperfect. Targetted fix for vscode#290863. We should revisit storing filter state per-window to avoid this
        this._badgeFilterAppliedByThisWindow = null;
        // Create menu for CommandCenterCenter to get items like debug toolbar
        this._commandCenterMenu = this._register(this.menuService.createMenu(MenuId.CommandCenterCenter, this.contextKeyService));
        // Create menu for ChatTitleBarMenu to show in sparkle section dropdown
        this._chatTitleBarMenu = this._register(this.menuService.createMenu(MenuId.ChatTitleBarMenu, this.contextKeyService));
        // Create WindowTitle to honor the user's window.title setting
        this._windowTitle = this._register(this.instantiationService.createInstance(WindowTitle, mainWindow));
        // Re-render when control mode or session info changes
        this._register(this.agentTitleBarStatusService.onDidChangeMode(() => {
            this._render();
        }));
        this._register(this.agentTitleBarStatusService.onDidChangeSessionInfo(() => {
            this._render();
        }));
        // Re-render when sessions change to update statistics
        this._register(this.agentSessionsService.model.onDidChangeSessions(() => {
            this._render();
        }));
        // Re-render when window title changes (honors user's window.title setting)
        this._register(this._windowTitle.onDidChange(() => {
            this._render();
        }));
        // Re-render when active editor changes (for file name display when tabs are hidden)
        this._register(this.editorService.onDidActiveEditorChange(() => {
            this._render();
        }));
        // Re-render when tabs visibility changes
        this._register(this.editorGroupsService.onDidChangeEditorPartOptions(({ newPartOptions, oldPartOptions }) => {
            if (newPartOptions.showTabs !== oldPartOptions.showTabs) {
                this._render();
            }
        }));
        // Re-render when command center menu changes (e.g., debug toolbar visibility)
        this._register(this._commandCenterMenu.onDidChange(() => {
            this._lastRenderState = undefined; // Force re-render
            this._render();
        }));
        // Re-render when storage changes (e.g., filter state changes from sessions view)
        this._register(this.storageService.onDidChangeValue(0 /* StorageScope.PROFILE */, 'agentSessions.filterExcludes.agentsessionsviewerfiltersubmenu', this._store)(() => {
            this._render();
        }));
        // Re-render when settings change
        this._register(this.configurationService.onDidChangeConfiguration(e => {
            if (e.affectsConfiguration(ChatConfiguration.AgentStatusEnabled)
                || e.affectsConfiguration(ChatConfiguration.UnifiedAgentsBar)
                || e.affectsConfiguration(ChatConfiguration.ChatViewSessionsEnabled)
                || e.affectsConfiguration(ChatConfiguration.AIDisabled)
                || e.affectsConfiguration(ChatConfiguration.ChatCustomizationMenuEnabled)
                || e.affectsConfiguration(ChatConfiguration.SignInTitleBarEnabled)
                || e.affectsConfiguration('disableAICustomizations')
                || e.affectsConfiguration('workbench.disableAICustomizations')) {
                this._lastRenderState = undefined; // Force re-render
                this._render();
            }
        }));
        // Re-render when chat entitlement or quota changes (for sign-in / quota exceeded states)
        this._register(EventUtils.any(this.chatEntitlementService.onDidChangeSentiment, this.chatEntitlementService.onDidChangeQuotaExceeded, this.chatEntitlementService.onDidChangeEntitlement, this.chatEntitlementService.onDidChangeAnonymous)(() => {
            this._lastRenderState = undefined; // Force re-render
            this._render();
        }));
        // Re-render when chat widgets are added or backgrounded to update active/unread session counts
        this._register(this.chatWidgetService.onDidAddWidget(() => {
            this._render();
        }));
        this._register(this.chatWidgetService.onDidBackgroundSession(() => {
            this._render();
        }));
    }
    render(container) {
        super.render(container);
        this._container = container;
        container.classList.add('agent-status-container');
        container.setAttribute('role', 'toolbar');
        container.setAttribute('aria-label', localize('agentStatusToolbarLabel', "Agent Status"));
        // Container should not be focusable - inner elements handle focus
        container.tabIndex = -1;
        // Initial render
        this._render();
    }
    // Override focus methods - the container itself shouldn't be focusable,
    // focus is handled by the inner interactive elements (badge sections)
    setFocusable(_focusable) {
        // Don't set focusable on the container
    }
    focus() {
        this._rovingElements[this._rovingIndex]?.focus();
    }
    blur() {
        if (!this._container) {
            return;
        }
        const activeElement = getWindow(this._container).document.activeElement;
        if (isHTMLElement(activeElement) && this._container.contains(activeElement)) {
            activeElement.blur();
        }
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
            // Compute current render state to avoid unnecessary DOM rebuilds
            const mode = this.agentTitleBarStatusService.mode;
            const sessionInfo = this.agentTitleBarStatusService.sessionInfo;
            const { activeSessions, unreadSessions, attentionNeededSessions } = this._getSessionStats();
            // Get attention session info for state computation
            const attentionSession = attentionNeededSessions.length > 0
                ? [...attentionNeededSessions].sort((a, b) => {
                    const timeA = a.timing.lastRequestStarted ?? a.timing.created;
                    const timeB = b.timing.lastRequestStarted ?? b.timing.created;
                    return timeB - timeA;
                })[0]
                : undefined;
            const attentionText = attentionSession?.description
                ? (typeof attentionSession.description === 'string'
                    ? attentionSession.description
                    : renderAsPlaintext(attentionSession.description))
                : attentionSession?.label;
            const label = this._getLabel();
            // Get current filter state for state key
            const { isFilteredToUnread, isFilteredToInProgress, isFilteredToNeedsInput } = this._getCurrentFilterState();
            const statusMode = getAgentStatusSettingMode(this.configurationService);
            const unifiedAgentsBarEnabled = this.configurationService.getValue(ChatConfiguration.UnifiedAgentsBar) === true;
            const viewSessionsEnabled = this.configurationService.getValue(ChatConfiguration.ChatViewSessionsEnabled) !== false;
            // Build state key for comparison
            const stateKey = JSON.stringify({
                mode,
                sessionTitle: sessionInfo?.title,
                activeCount: activeSessions.length,
                unreadCount: unreadSessions.length,
                attentionCount: attentionNeededSessions.length,
                attentionText,
                label,
                isFilteredToUnread,
                isFilteredToInProgress,
                isFilteredToNeedsInput,
                statusMode,
                unifiedAgentsBarEnabled,
                viewSessionsEnabled,
            });
            // Skip re-render if state hasn't changed
            if (this._lastRenderState === stateKey) {
                return;
            }
            this._lastRenderState = stateKey;
            // Clear existing content
            reset(this._container);
            // Clear previous disposables and roving elements for dynamic content
            this._dynamicDisposables.clear();
            this._rovingElements = [];
            if (this.agentTitleBarStatusService.mode === AgentStatusMode.Session) {
                // Agent Session Projection mode - show session title + close button
                this._renderSessionMode(this._dynamicDisposables);
            }
            else if (this.agentTitleBarStatusService.mode === AgentStatusMode.SessionReady) {
                // Session ready mode - show session title + enter projection button
                this._renderSessionReadyMode(this._dynamicDisposables);
            }
            else if (statusMode === 'compact') {
                // Compact mode - replace command center search with integrated control
                this._renderChatInputMode(this._dynamicDisposables);
            }
            else if (statusMode === 'badge') {
                // Badge mode - render status badge next to command center search
                this._renderStatusBadge(this._dynamicDisposables, activeSessions, unreadSessions, attentionNeededSessions);
            }
            // Hidden mode intentionally renders nothing.
            // Setup roving tabindex for keyboard navigation
            this._setupRovingTabIndex(this._dynamicDisposables);
        }
        finally {
            this._isRendering = false;
        }
    }
    /**
     * Setup roving tabindex for arrow key navigation between interactive elements.
     * Uses the elements registered in `this._rovingElements` in their existing order.
     */
    _setupRovingTabIndex(disposables) {
        if (!this._container || this._rovingElements.length === 0) {
            return;
        }
        if (this._rovingIndex >= this._rovingElements.length) {
            this._rovingIndex = 0;
        }
        for (let i = 0; i < this._rovingElements.length; i++) {
            this._rovingElements[i].tabIndex = i === this._rovingIndex ? 0 : -1;
        }
        disposables.add(addDisposableListener(this._container, EventType.KEY_DOWN, (e) => {
            const index = this._rovingElements.findIndex(el => el === e.target || el.contains(e.target));
            if (index === -1) {
                return;
            }
            const nextIndex = this._getNextRovingIndex(index, e.key);
            if (nextIndex !== undefined && nextIndex !== index) {
                e.preventDefault();
                e.stopPropagation();
                this._moveRovingFocus(index, nextIndex);
            }
        }));
    }
    /**
     * Moves roving focus from `currentIndex` to `nextIndex`, updating tabIndex and focusing the element.
     */
    _moveRovingFocus(currentIndex, nextIndex) {
        this._rovingElements[currentIndex].tabIndex = -1;
        this._rovingElements[nextIndex].tabIndex = 0;
        this._rovingElements[nextIndex].focus();
        this._rovingIndex = nextIndex;
    }
    /**
     * Returns the next roving index for the given key, or `undefined` if no navigation should occur.
     */
    _getNextRovingIndex(currentIndex, key) {
        const len = this._rovingElements.length;
        switch (key) {
            case 'ArrowRight': return (currentIndex + 1) % len;
            case 'ArrowLeft': return (currentIndex - 1 + len) % len;
            case 'Home': return 0;
            case 'End': return len - 1;
            default: return undefined;
        }
    }
    // #region Session Statistics
    /**
     * Get computed session statistics for rendering.
     * Respects the current provider (session type) filter when calculating counts.
     */
    _getSessionStats() {
        const sessions = this.agentSessionsService.model.sessions;
        // Get excluded providers from current filter to respect session type filters
        const currentFilter = this._getStoredFilter();
        const excludedProviders = currentFilter?.providers ?? [];
        // Filter sessions by provider type first (respects session type filters)
        const filteredSessions = excludedProviders.length > 0
            ? sessions.filter(s => !excludedProviders.includes(s.providerType))
            : sessions;
        // Active sessions include both InProgress and NeedsInput
        const activeSessions = filteredSessions.filter(s => isSessionInProgressStatus(s.status) && !s.isArchived());
        const unreadSessions = filteredSessions.filter(s => !s.isRead());
        // Sessions that need user input/attention (subset of active)
        const attentionNeededSessions = filteredSessions.filter(s => s.status === 3 /* AgentSessionStatus.NeedsInput */ && !this.chatWidgetService.getWidgetBySessionResource(s.resource));
        return {
            activeSessions,
            unreadSessions,
            attentionNeededSessions,
            hasActiveSessions: activeSessions.length > 0,
            hasUnreadSessions: unreadSessions.length > 0,
            hasAttentionNeeded: attentionNeededSessions.length > 0,
        };
    }
    // #endregion
    // #region Mode Renderers
    _renderChatInputMode(disposables) {
        if (!this._container) {
            return;
        }
        const { activeSessions, unreadSessions, attentionNeededSessions, hasAttentionNeeded } = this._getSessionStats();
        // Create pill
        const pill = $('div.agent-status-pill.chat-input-mode');
        if (hasAttentionNeeded) {
            pill.classList.add('needs-attention');
        }
        this._container.appendChild(pill);
        // Render command center items (like debug toolbar) inside the pill
        this._renderCommandCenterToolbar(disposables, pill);
        // Compact mode is always true when rendering chat input mode (caller already checked for compact)
        const isCompactMode = true;
        pill.classList.toggle('compact-mode', isCompactMode);
        // Left icon container (sparkle by default, report+count when attention needed, search on hover)
        const leftIcon = $('span.agent-status-left-icon');
        if (hasAttentionNeeded) {
            // Show report icon + count when sessions need attention
            const reportIcon = renderIcon(Codicon.report);
            const countSpan = $('span.agent-status-attention-count');
            countSpan.textContent = String(attentionNeededSessions.length);
            reset(leftIcon, reportIcon, countSpan);
            leftIcon.classList.add('has-attention');
        }
        else {
            reset(leftIcon, renderIcon(Codicon.searchSparkle));
        }
        if (!isCompactMode) {
            pill.appendChild(leftIcon);
        }
        // Input area wrapper - hover only activates here, not on badge sections
        const inputArea = $('div.agent-status-input-area');
        inputArea.setAttribute('role', 'button');
        inputArea.setAttribute('aria-label', localize('openQuickAccess', "Open Quick Access"));
        inputArea.tabIndex = 0;
        this._rovingElements.push(inputArea);
        pill.appendChild(inputArea);
        // Label - always shows workspace name in compact mode
        const label = $('span.agent-status-label');
        const { progress: progressText } = this._getSessionNeedingAttention(attentionNeededSessions);
        const defaultLabel = isCompactMode ? this._getLabel() : (progressText ?? this._getLabel());
        if (!isCompactMode && progressText) {
            label.classList.add('has-progress');
        }
        const hoverLabel = localize('askAnythingPlaceholder', "Ask anything or describe what to build");
        label.textContent = defaultLabel;
        inputArea.appendChild(label);
        if (isCompactMode) {
            // Compact mode: hover resets icon state but keeps workspace name
            disposables.add(addDisposableListener(inputArea, EventType.MOUSE_ENTER, () => {
                reset(leftIcon, renderIcon(Codicon.searchSparkle));
                leftIcon.classList.remove('has-attention');
                label.classList.remove('has-progress');
            }));
            disposables.add(addDisposableListener(inputArea, EventType.MOUSE_LEAVE, () => {
                reset(leftIcon, renderIcon(Codicon.searchSparkle));
            }));
        }
        else {
            // Send icon (hidden by default, shown on hover - only when not showing attention message)
            const sendIcon = $('span.agent-status-send');
            reset(sendIcon, renderIcon(Codicon.send));
            sendIcon.classList.add('hidden');
            inputArea.appendChild(sendIcon);
            // Hover behavior - swap icon and label (only when showing default state).
            if (!progressText) {
                disposables.add(addDisposableListener(inputArea, EventType.MOUSE_ENTER, () => {
                    reset(leftIcon, renderIcon(Codicon.searchSparkle));
                    leftIcon.classList.remove('has-attention');
                    label.textContent = hoverLabel;
                    label.classList.remove('has-progress');
                    sendIcon.classList.remove('hidden');
                }));
                disposables.add(addDisposableListener(inputArea, EventType.MOUSE_LEAVE, () => {
                    reset(leftIcon, renderIcon(Codicon.searchSparkle));
                    label.textContent = defaultLabel;
                    sendIcon.classList.add('hidden');
                }));
            }
        }
        // Setup hover tooltip on input area
        const hoverDelegate = getDefaultHoverDelegate('mouse');
        disposables.add(this.hoverService.setupManagedHover(hoverDelegate, inputArea, () => {
            const kbForTooltip = this.keybindingService.lookupKeybinding(UNIFIED_QUICK_ACCESS_ACTION_ID)?.getLabel();
            return kbForTooltip
                ? localize('askTooltip', "Open Quick Access ({0})", kbForTooltip)
                : localize('askTooltip2', "Open Quick Access");
        }));
        // Click handler - always open quick access in compact mode (attention sessions are handled by the badge)
        disposables.add(addDisposableListener(inputArea, EventType.CLICK, (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.telemetryService.publicLog2('agentStatusWidget.click', {
                source: 'pill',
                action: 'quickAccess',
            });
            const useUnifiedQuickAccess = this.configurationService.getValue(ChatConfiguration.UnifiedAgentsBar) === true;
            this.commandService.executeCommand(useUnifiedQuickAccess ? UNIFIED_QUICK_ACCESS_ACTION_ID : QUICK_OPEN_ACTION_ID);
        }));
        // Keyboard handler
        disposables.add(addDisposableListener(inputArea, EventType.KEY_DOWN, (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                e.stopPropagation();
                this.telemetryService.publicLog2('agentStatusWidget.click', {
                    source: 'pill',
                    action: 'quickAccess',
                });
                const useUnifiedQuickAccess = this.configurationService.getValue(ChatConfiguration.UnifiedAgentsBar) === true;
                this.commandService.executeCommand(useUnifiedQuickAccess ? UNIFIED_QUICK_ACCESS_ACTION_ID : QUICK_OPEN_ACTION_ID);
            }
        }));
        // In compact mode, render status badge inline within the pill
        this._renderStatusBadge(disposables, activeSessions, unreadSessions, attentionNeededSessions, pill);
    }
    _renderSessionMode(disposables) {
        if (!this._container) {
            return;
        }
        const { activeSessions, unreadSessions, attentionNeededSessions } = this._getSessionStats();
        // Render command center items (like debug toolbar) FIRST - to the left
        this._renderCommandCenterToolbar(disposables);
        const pill = $('div.agent-status-pill.session-mode');
        this._container.appendChild(pill);
        // Search button (left side, inside pill)
        this._renderSearchButton(disposables, pill);
        // Session title (center)
        const titleLabel = $('span.agent-status-title');
        const sessionInfo = this.agentTitleBarStatusService.sessionInfo;
        titleLabel.textContent = sessionInfo?.title ?? localize('agentSessionProjection', "Agent Session Projection");
        pill.appendChild(titleLabel);
        // Escape button (right side)
        this._renderEscapeButton(disposables, pill);
        // Setup pill hover
        const hoverDelegate = getDefaultHoverDelegate('mouse');
        disposables.add(this.hoverService.setupManagedHover(hoverDelegate, pill, () => {
            const sessionInfo = this.agentTitleBarStatusService.sessionInfo;
            return sessionInfo ? localize('agentSessionProjectionTooltip', "Agent Session Projection: {0}", sessionInfo.title) : localize('agentSessionProjection', "Agent Session Projection");
        }));
        // Click handler - clicking anywhere on container exits projection
        const exitHandler = (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.commandService.executeCommand(ExitAgentSessionProjectionAction.ID);
        };
        disposables.add(addDisposableListener(pill, EventType.CLICK, exitHandler));
        disposables.add(addDisposableListener(pill, EventType.MOUSE_DOWN, exitHandler));
        // Status badge (separate rectangle on right)
        this._renderStatusBadge(disposables, activeSessions, unreadSessions, attentionNeededSessions);
    }
    /**
     * Render session ready mode - shows session title + enter projection button.
     * Used when a projection-capable session is available but not yet entered.
     */
    _renderSessionReadyMode(disposables) {
        if (!this._container) {
            return;
        }
        const { activeSessions, unreadSessions, attentionNeededSessions } = this._getSessionStats();
        const pill = $('div.agent-status-pill.session-ready-mode');
        this._container.appendChild(pill);
        // Session title (left side)
        const titleLabel = $('span.agent-status-title');
        const sessionInfo = this.agentTitleBarStatusService.sessionInfo;
        titleLabel.textContent = sessionInfo?.title ?? localize('agentSessionReady', "Review Changes");
        pill.appendChild(titleLabel);
        // Enter button (right side)
        this._renderEnterButton(disposables, pill);
        // Setup pill hover
        const hoverDelegate = getDefaultHoverDelegate('mouse');
        disposables.add(this.hoverService.setupManagedHover(hoverDelegate, pill, () => {
            const sessionInfo = this.agentTitleBarStatusService.sessionInfo;
            return sessionInfo ? localize('agentSessionReadyTooltip', "Review changes from: {0}", sessionInfo.title) : localize('agentSessionReadyGeneric', "Review agent session changes");
        }));
        // Click handler - clicking anywhere on pill enters projection
        const enterHandler = (e) => {
            e.preventDefault();
            e.stopPropagation();
            const sessionInfo = this.agentTitleBarStatusService.sessionInfo;
            if (sessionInfo) {
                const session = this.agentSessionsService.getSession(sessionInfo.sessionResource);
                if (session) {
                    this.commandService.executeCommand(EnterAgentSessionProjectionAction.ID, session);
                }
            }
        };
        disposables.add(addDisposableListener(pill, EventType.CLICK, enterHandler));
        disposables.add(addDisposableListener(pill, EventType.MOUSE_DOWN, enterHandler));
        // Status badge (separate rectangle on right)
        this._renderStatusBadge(disposables, activeSessions, unreadSessions, attentionNeededSessions);
    }
    // #endregion
    // #region Reusable Components
    /**
     * Render command center toolbar items (like debug toolbar) that are registered to CommandCenter
     * Filters out the quick open action since we provide our own search UI.
     * Adds a dot separator after the toolbar if content was rendered.
     */
    _renderCommandCenterToolbar(disposables, parent) {
        const container = parent ?? this._container;
        if (!container) {
            return;
        }
        // Get menu actions from CommandCenterCenter (e.g., debug toolbar)
        const allActions = [];
        for (const [, actions] of this._commandCenterMenu.getActions({ shouldForwardArgs: true })) {
            for (const action of actions) {
                // Filter out the quick open action - we provide our own search UI
                if (action.id === QUICK_OPEN_ACTION_ID) {
                    continue;
                }
                // For submenus (like debug toolbar), add the submenu actions
                if (action instanceof SubmenuAction) {
                    allActions.push(...action.actions);
                }
                else {
                    allActions.push(action);
                }
            }
        }
        // Only render toolbar if there are actions
        if (allActions.length === 0) {
            return;
        }
        const hoverDelegate = getDefaultHoverDelegate('mouse');
        const toolbarContainer = $('div.agent-status-command-center-toolbar');
        container.appendChild(toolbarContainer);
        const toolbar = this.instantiationService.createInstance(WorkbenchToolBar, toolbarContainer, {
            hiddenItemStrategy: -1 /* HiddenItemStrategy.NoHide */,
            telemetrySource: 'agentStatusCommandCenter',
            actionViewItemProvider: (action, options) => {
                return createActionViewItem(this.instantiationService, action, { ...options, hoverDelegate });
            }
        });
        disposables.add(toolbar);
        toolbar.setActions(allActions);
        // Add separator after the toolbar
        if (parent) {
            // Inside pill (compact mode): use a vertical line separator
            const separator = $('span.agent-status-line-separator');
            container.appendChild(separator);
        }
        else {
            // Outside pill: use dot separator (matching command center style)
            const separator = renderIcon(Codicon.circleSmallFilled);
            separator.classList.add('agent-status-separator');
            container.appendChild(separator);
        }
    }
    /**
     * Render the search button. If parent is provided, appends to parent; otherwise appends to container.
     */
    _renderSearchButton(disposables, parent) {
        const container = parent ?? this._container;
        if (!container) {
            return;
        }
        const searchButton = $('span.agent-status-search');
        reset(searchButton, renderIcon(Codicon.searchSparkle));
        searchButton.setAttribute('role', 'button');
        searchButton.setAttribute('aria-label', localize('openQuickOpen', "Open Quick Open"));
        searchButton.tabIndex = 0;
        this._rovingElements.push(searchButton);
        container.appendChild(searchButton);
        // Setup hover
        const hoverDelegate = getDefaultHoverDelegate('mouse');
        const searchKb = this.keybindingService.lookupKeybinding(QUICK_OPEN_ACTION_ID)?.getLabel();
        const searchTooltip = searchKb
            ? localize('openQuickOpenTooltip', "Go to File ({0})", searchKb)
            : localize('openQuickOpenTooltip2', "Go to File");
        disposables.add(this.hoverService.setupManagedHover(hoverDelegate, searchButton, searchTooltip));
        // Click handler
        disposables.add(addDisposableListener(searchButton, EventType.CLICK, (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.commandService.executeCommand(QUICK_OPEN_ACTION_ID);
        }));
        // Keyboard handler
        disposables.add(addDisposableListener(searchButton, EventType.KEY_DOWN, (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                e.stopPropagation();
                this.commandService.executeCommand(QUICK_OPEN_ACTION_ID);
            }
        }));
    }
    /**
     * Render the status badge showing in-progress, needs-input, and/or unread session counts.
     * Shows split UI with sparkle icon on left, then unread, needs-input, and active indicators.
     * Always renders the sparkle icon section.
     */
    _renderStatusBadge(disposables, activeSessions, unreadSessions, attentionNeededSessions, inlineContainer) {
        if (!this._container) {
            return;
        }
        const hasActiveSessions = activeSessions.length > 0;
        const hasUnreadSessions = unreadSessions.length > 0;
        const hasAttentionNeeded = attentionNeededSessions.length > 0;
        // Auto-clear filter if the filtered category becomes empty if this window applied it
        this._clearFilterIfCategoryEmpty(hasUnreadSessions, hasActiveSessions, hasAttentionNeeded);
        // When inlineContainer is provided, render sections directly into it (compact mode)
        // Otherwise, create a separate badge container
        let badge;
        if (inlineContainer) {
            badge = inlineContainer;
        }
        else {
            badge = $('div.agent-status-badge');
            this._container.appendChild(badge);
        }
        // Sparkle dropdown button section (always visible on left) - proper button with dropdown menu
        const sparkleContainer = $('span.agent-status-badge-section.sparkle');
        sparkleContainer.tabIndex = 0;
        // Get menu actions for dropdown with proper group separators
        const menuActions = Separator.join(...this._chatTitleBarMenu.getActions({ shouldForwardArgs: true }).map(([, actions]) => actions));
        // Determine primary action based on entitlement state
        // Special case 1: User is signed out (needs to sign in)
        // Special case 2: User has exceeded quota (needs to upgrade)
        const chatSentiment = this.chatEntitlementService.sentiment;
        const chatQuotaExceeded = this.chatEntitlementService.quotas.chat?.percentRemaining === 0;
        const signedOut = this.chatEntitlementService.entitlement === ChatEntitlement.Unknown;
        const anonymous = this.chatEntitlementService.anonymous;
        const free = this.chatEntitlementService.entitlement === ChatEntitlement.Free;
        let primaryActionId = TOGGLE_CHAT_ACTION_ID;
        let primaryActionTitle = localize('toggleChat', "Toggle Chat");
        let primaryActionIcon = Codicon.chatSparkle;
        const signInTitleBarEnabled = this.configurationService.getValue(ChatConfiguration.SignInTitleBarEnabled);
        if (chatSentiment.completed && !chatSentiment.disabled) {
            if (signedOut && !anonymous && !signInTitleBarEnabled) {
                primaryActionId = CHAT_SETUP_ACTION_ID;
                primaryActionTitle = localize('signInToChatSetup', "Sign in to use AI features...");
                primaryActionIcon = Codicon.chatSparkleError;
            }
            else if (chatQuotaExceeded && free) {
                primaryActionId = OPEN_CHAT_QUOTA_EXCEEDED_DIALOG;
                primaryActionTitle = localize('chatQuotaExceededButton', "GitHub Copilot Free plan chat messages quota reached. Click for details.");
                primaryActionIcon = Codicon.chatSparkleWarning;
            }
        }
        // Create primary action
        const primaryAction = this.instantiationService.createInstance(MenuItemAction, {
            id: primaryActionId,
            title: primaryActionTitle,
            icon: primaryActionIcon,
        }, undefined, undefined, undefined, undefined);
        // Create dropdown action (empty label prevents default tooltip - we have our own hover)
        const dropdownAction = toAction({
            id: 'agentStatus.sparkle.dropdown',
            label: localize('agentStatus.sparkle.dropdown', "More Actions"),
            run() { }
        });
        // Create the dropdown with primary action button
        const sparkleDropdown = this.instantiationService.createInstance(DropdownWithPrimaryActionViewItem, primaryAction, dropdownAction, menuActions, 'agent-status-sparkle-dropdown', { skipTelemetry: true });
        sparkleDropdown.render(sparkleContainer);
        disposables.add(sparkleDropdown);
        // Capture-phase listener for ArrowLeft/ArrowRight/Home/End to prevent DropdownWithPrimaryActionViewItem
        // from consuming these keys internally. This ensures the outer roving tabindex handles navigation.
        disposables.add(addDisposableListener(sparkleContainer, EventType.KEY_DOWN, (e) => {
            if (e.key === 'ArrowLeft' || e.key === 'ArrowRight' || e.key === 'Home' || e.key === 'End') {
                const idx = this._rovingElements.indexOf(sparkleContainer);
                if (idx === -1) {
                    return;
                }
                const nextIndex = this._getNextRovingIndex(idx, e.key);
                if (nextIndex !== undefined && nextIndex !== idx) {
                    e.preventDefault();
                    e.stopImmediatePropagation();
                    this._moveRovingFocus(idx, nextIndex);
                }
            }
        }, true /* useCapture */));
        // Add keyboard handler for Enter/Space on the sparkle container
        disposables.add(addDisposableListener(sparkleContainer, EventType.KEY_DOWN, (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                e.stopPropagation();
                this.commandService.executeCommand(primaryActionId);
            }
            else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                // Open dropdown menu with arrow keys
                e.preventDefault();
                e.stopPropagation();
                sparkleDropdown.showDropdown();
            }
        }));
        // Hover delegate for status sections
        const hoverDelegate = getDefaultHoverDelegate('mouse');
        // Only show status indicators if chat.viewSessions.enabled is true
        const viewSessionsEnabled = this.configurationService.getValue(ChatConfiguration.ChatViewSessionsEnabled) !== false;
        // When compact mode is active, show status indicators before the sparkle button:
        // [needs-input, active, unread, sparkle] (populating inward)
        // Otherwise, keep original order: [sparkle, unread, active, needs-input]
        const reverseOrder = !!inlineContainer;
        if (!reverseOrder) {
            // Original order: sparkle first
            badge.appendChild(sparkleContainer);
        }
        // Build status sections but don't append yet - we need to control order
        let unreadSection;
        let activeSection;
        let needsInputSection;
        // Unread section (blue dot + count)
        if (viewSessionsEnabled && hasUnreadSessions && this.workspaceContextService.getWorkbenchState() !== 1 /* WorkbenchState.EMPTY */) {
            const { isFilteredToUnread } = this._getCurrentFilterState();
            unreadSection = $('span.agent-status-badge-section.unread');
            if (isFilteredToUnread) {
                unreadSection.classList.add('filtered');
            }
            unreadSection.setAttribute('role', 'button');
            unreadSection.tabIndex = 0;
            const unreadIcon = $('span.agent-status-icon');
            reset(unreadIcon, renderIcon(Codicon.circleFilled));
            unreadSection.appendChild(unreadIcon);
            const unreadCount = $('span.agent-status-text');
            unreadCount.textContent = String(unreadSessions.length);
            unreadSection.appendChild(unreadCount);
            // Click handler - filter to unread sessions
            disposables.add(addDisposableListener(unreadSection, EventType.CLICK, (e) => {
                e.preventDefault();
                e.stopPropagation();
                this._openSessionsWithFilter('unread');
            }));
            disposables.add(addDisposableListener(unreadSection, EventType.KEY_DOWN, (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    e.stopPropagation();
                    this._openSessionsWithFilter('unread');
                }
            }));
            // Hover tooltip for unread section
            const unreadTooltip = unreadSessions.length === 1
                ? localize('unreadSessionsTooltip1', "{0} unread session", unreadSessions.length)
                : localize('unreadSessionsTooltip', "{0} unread sessions", unreadSessions.length);
            disposables.add(this.hoverService.setupManagedHover(hoverDelegate, unreadSection, unreadTooltip));
        }
        // Needs-input section - shows sessions requiring user attention (approval/confirmation/input)
        if (viewSessionsEnabled && hasAttentionNeeded) {
            const { isFilteredToNeedsInput } = this._getCurrentFilterState();
            needsInputSection = $('span.agent-status-badge-section.active.needs-input');
            if (isFilteredToNeedsInput) {
                needsInputSection.classList.add('filtered');
            }
            needsInputSection.setAttribute('role', 'button');
            needsInputSection.tabIndex = 0;
            const needsInputIcon = $('span.agent-status-icon');
            reset(needsInputIcon, renderIcon(Codicon.report));
            needsInputSection.appendChild(needsInputIcon);
            const needsInputCount = $('span.agent-status-text');
            needsInputCount.textContent = String(attentionNeededSessions.length);
            needsInputSection.appendChild(needsInputCount);
            disposables.add(addDisposableListener(needsInputSection, EventType.CLICK, (e) => {
                e.preventDefault();
                e.stopPropagation();
                this._openSessionsWithFilter('needsInput');
            }));
            disposables.add(addDisposableListener(needsInputSection, EventType.KEY_DOWN, (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    e.stopPropagation();
                    this._openSessionsWithFilter('needsInput');
                }
            }));
            const needsInputTooltip = attentionNeededSessions.length === 1
                ? localize('needsInputSessionsTooltip1', "{0} session needs input", attentionNeededSessions.length)
                : localize('needsInputSessionsTooltip', "{0} sessions need input", attentionNeededSessions.length);
            disposables.add(this.hoverService.setupManagedHover(hoverDelegate, needsInputSection, needsInputTooltip));
        }
        // In-progress section - shows sessions that are actively running (excludes needs-input)
        const inProgressOnly = activeSessions.filter(s => s.status !== 3 /* AgentSessionStatus.NeedsInput */);
        if (viewSessionsEnabled && inProgressOnly.length > 0) {
            const { isFilteredToInProgress } = this._getCurrentFilterState();
            activeSection = $('span.agent-status-badge-section.active');
            if (isFilteredToInProgress) {
                activeSection.classList.add('filtered');
            }
            activeSection.setAttribute('role', 'button');
            activeSection.tabIndex = 0;
            const statusIcon = $('span.agent-status-icon');
            reset(statusIcon, renderIcon(Codicon.sessionInProgress));
            activeSection.appendChild(statusIcon);
            const statusCount = $('span.agent-status-text');
            statusCount.textContent = String(inProgressOnly.length);
            activeSection.appendChild(statusCount);
            disposables.add(addDisposableListener(activeSection, EventType.CLICK, (e) => {
                e.preventDefault();
                e.stopPropagation();
                this._openSessionsWithFilter('inProgress');
            }));
            disposables.add(addDisposableListener(activeSection, EventType.KEY_DOWN, (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    e.stopPropagation();
                    this._openSessionsWithFilter('inProgress');
                }
            }));
            const activeTooltip = inProgressOnly.length === 1
                ? localize('activeSessionsTooltip1', "{0} session in progress", inProgressOnly.length)
                : localize('activeSessionsTooltip', "{0} sessions in progress", inProgressOnly.length);
            disposables.add(this.hoverService.setupManagedHover(hoverDelegate, activeSection, activeTooltip));
        }
        // Append status sections in the correct order and register for roving tabindex
        if (reverseOrder) {
            // [needs-input, active, unread, sparkle] — populates inward
            if (needsInputSection) {
                badge.appendChild(needsInputSection);
                this._rovingElements.push(needsInputSection);
            }
            if (activeSection) {
                badge.appendChild(activeSection);
                this._rovingElements.push(activeSection);
            }
            if (unreadSection) {
                badge.appendChild(unreadSection);
                this._rovingElements.push(unreadSection);
            }
            badge.appendChild(sparkleContainer);
            this._rovingElements.push(sparkleContainer);
        }
        else {
            // Original: [sparkle (already appended), unread, active, needs-input]
            this._rovingElements.push(sparkleContainer);
            if (unreadSection) {
                badge.appendChild(unreadSection);
                this._rovingElements.push(unreadSection);
            }
            if (activeSection) {
                badge.appendChild(activeSection);
                this._rovingElements.push(activeSection);
            }
            if (needsInputSection) {
                badge.appendChild(needsInputSection);
                this._rovingElements.push(needsInputSection);
            }
        }
    }
    /**
     * Clear the filter if the currently filtered category becomes empty.
     * For example, if filtered to "unread" but no unread sessions exist, restore user's previous filter.
     * Only auto-clears if THIS window applied the badge filter to avoid cross-window interference.
     */
    _clearFilterIfCategoryEmpty(hasUnreadSessions, hasActiveSessions, hasAttentionNeeded) {
        // Only auto-clear if this window applied the badge filter
        // This prevents Window B from clearing filters that Window A set
        if (this._badgeFilterAppliedByThisWindow === 'unread' && !hasUnreadSessions) {
            this._restoreUserFilter();
        }
        else if (this._badgeFilterAppliedByThisWindow === 'inProgress' && !hasActiveSessions) {
            this._restoreUserFilter();
        }
        else if (this._badgeFilterAppliedByThisWindow === 'needsInput' && !hasAttentionNeeded) {
            this._restoreUserFilter();
        }
    }
    /**
     * Get the current filter state from storage.
     */
    _getCurrentFilterState() {
        const filter = this._getStoredFilter();
        if (!filter) {
            return { isFilteredToUnread: false, isFilteredToInProgress: false, isFilteredToNeedsInput: false };
        }
        // Detect if filtered to unread (read=true excludes read sessions, leaving only unread)
        const isFilteredToUnread = filter.read === true && filter.states.length === 0;
        // Detect if filtered to in-progress only (3 excluded states including NeedsInput)
        const isFilteredToInProgress = filter.states?.length === 3 && filter.states.includes(3 /* AgentSessionStatus.NeedsInput */) && filter.read === false;
        // Detect if filtered to needs-input only (3 excluded states including InProgress)
        const isFilteredToNeedsInput = filter.states?.length === 3 && filter.states.includes(2 /* AgentSessionStatus.InProgress */) && filter.read === false;
        return { isFilteredToUnread, isFilteredToInProgress, isFilteredToNeedsInput };
    }
    /**
     * Get the stored filter object from storage.
     */
    _getStoredFilter() {
        const filterStr = this.storageService.get(FILTER_STORAGE_KEY, 0 /* StorageScope.PROFILE */);
        if (!filterStr) {
            return undefined;
        }
        try {
            return JSON.parse(filterStr);
        }
        catch {
            return undefined;
        }
    }
    /**
     * Store a filter object to storage.
     */
    _storeFilter(filter) {
        this.storageService.store(FILTER_STORAGE_KEY, JSON.stringify(filter), 0 /* StorageScope.PROFILE */, 0 /* StorageTarget.USER */);
    }
    /**
     * Clear all filters (reset to default).
     */
    _clearFilter() {
        this._storeFilter({
            providers: [],
            states: [],
            archived: true,
            read: false
        });
    }
    /**
     * Save the current user filter before we override it with a badge filter.
     * Only saves if the current filter is NOT already a badge filter (unread or in-progress).
     * This preserves the original user filter when switching between badge filters.
     */
    _saveUserFilter() {
        const { isFilteredToUnread, isFilteredToInProgress, isFilteredToNeedsInput } = this._getCurrentFilterState();
        // Don't overwrite the saved filter if we're already in a badge-filtered state
        // The previous user filter should already be saved
        if (isFilteredToUnread || isFilteredToInProgress || isFilteredToNeedsInput) {
            return;
        }
        const currentFilter = this._getStoredFilter();
        if (currentFilter) {
            this.storageService.store(PREVIOUS_FILTER_STORAGE_KEY, JSON.stringify(currentFilter), 0 /* StorageScope.PROFILE */, 0 /* StorageTarget.USER */);
        }
    }
    /**
     * Restore the user's previous filter (saved before we applied a badge filter).
     */
    _restoreUserFilter() {
        const previousFilterStr = this.storageService.get(PREVIOUS_FILTER_STORAGE_KEY, 0 /* StorageScope.PROFILE */);
        if (previousFilterStr) {
            try {
                const previousFilter = JSON.parse(previousFilterStr);
                this._storeFilter(previousFilter);
            }
            catch {
                // Fall back to clearing if parse fails
                this._clearFilter();
            }
        }
        else {
            // No previous filter saved, clear to default
            this._clearFilter();
        }
        // Clear the saved filter after restoring
        this.storageService.remove(PREVIOUS_FILTER_STORAGE_KEY, 0 /* StorageScope.PROFILE */);
        // Clear the per-window badge filter tracking
        this._badgeFilterAppliedByThisWindow = null;
    }
    /**
     * Opens the agent sessions view with a specific filter applied, or restores previous filter if already applied.
     * Preserves session type (provider) filters while toggling only status filters.
     */
    _openSessionsWithFilter(filterType) {
        const { isFilteredToUnread, isFilteredToInProgress, isFilteredToNeedsInput } = this._getCurrentFilterState();
        const currentFilter = this._getStoredFilter();
        // Preserve existing provider filters (session type filters like Local, Background, etc.)
        const preservedProviders = currentFilter?.providers ?? [];
        // Log telemetry for filter button clicks
        const isToggleOff = (filterType === 'unread' && isFilteredToUnread)
            || (filterType === 'inProgress' && isFilteredToInProgress)
            || (filterType === 'needsInput' && isFilteredToNeedsInput);
        this.telemetryService.publicLog2('agentStatusWidget.click', {
            source: filterType,
            action: isToggleOff ? 'clearFilter' : 'applyFilter',
        });
        // Check if already filtered to this type — toggle off
        if (isToggleOff) {
            this._restoreUserFilter();
        }
        else {
            // Save current filter before applying our own
            this._saveUserFilter();
            if (filterType === 'unread') {
                this._storeFilter({
                    providers: preservedProviders,
                    states: [],
                    archived: true,
                    read: true
                });
            }
            else if (filterType === 'inProgress') {
                // Exclude Completed, Failed, and NeedsInput — show only InProgress
                this._storeFilter({
                    providers: preservedProviders,
                    states: [1 /* AgentSessionStatus.Completed */, 0 /* AgentSessionStatus.Failed */, 3 /* AgentSessionStatus.NeedsInput */],
                    archived: true,
                    read: false
                });
            }
            else {
                // Exclude Completed, Failed, and InProgress — show only NeedsInput
                this._storeFilter({
                    providers: preservedProviders,
                    states: [1 /* AgentSessionStatus.Completed */, 0 /* AgentSessionStatus.Failed */, 2 /* AgentSessionStatus.InProgress */],
                    archived: true,
                    read: false
                });
            }
            this._badgeFilterAppliedByThisWindow = filterType;
        }
        // Open the sessions view
        this.commandService.executeCommand(FocusAgentSessionsAction.id);
    }
    /**
     * Render the escape button for exiting session projection mode.
     */
    _renderEscapeButton(disposables, parent) {
        const escButton = $('span.agent-status-esc-button');
        escButton.textContent = 'Esc';
        escButton.setAttribute('role', 'button');
        escButton.setAttribute('aria-label', localize('exitAgentSessionProjection', "Exit Agent Session Projection"));
        escButton.tabIndex = 0;
        this._rovingElements.push(escButton);
        parent.appendChild(escButton);
        // Setup hover
        const hoverDelegate = getDefaultHoverDelegate('mouse');
        disposables.add(this.hoverService.setupManagedHover(hoverDelegate, escButton, localize('exitAgentSessionProjectionTooltip', "Exit Agent Session Projection (Escape)")));
        // Click handler
        disposables.add(addDisposableListener(escButton, EventType.MOUSE_DOWN, (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.commandService.executeCommand(ExitAgentSessionProjectionAction.ID);
        }));
        disposables.add(addDisposableListener(escButton, EventType.CLICK, (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.commandService.executeCommand(ExitAgentSessionProjectionAction.ID);
        }));
        // Keyboard handler
        disposables.add(addDisposableListener(escButton, EventType.KEY_DOWN, (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                e.stopPropagation();
                this.commandService.executeCommand(ExitAgentSessionProjectionAction.ID);
            }
        }));
    }
    /**
     * Render the enter button for entering session projection mode.
     */
    _renderEnterButton(disposables, parent) {
        const enterButton = $('span.agent-status-enter-button');
        // Get the keybinding for the enter action
        const keybinding = this.keybindingService.lookupKeybinding(EnterAgentSessionProjectionAction.ID);
        enterButton.textContent = keybinding?.getLabel() ?? localize('review', "Review");
        enterButton.setAttribute('role', 'button');
        enterButton.setAttribute('aria-label', localize('enterAgentSessionProjection', "Enter Agent Session Projection"));
        enterButton.tabIndex = 0;
        this._rovingElements.push(enterButton);
        parent.appendChild(enterButton);
        // Setup hover
        const hoverDelegate = getDefaultHoverDelegate('mouse');
        const hoverText = keybinding
            ? localize('enterAgentSessionProjectionTooltip', "Review Changes ({0})", keybinding.getLabel())
            : localize('enterAgentSessionProjectionTooltipNoKey', "Review Changes");
        disposables.add(this.hoverService.setupManagedHover(hoverDelegate, enterButton, hoverText));
        // Enter projection handler - same as clicking the pill
        const enterProjection = (e) => {
            e.preventDefault();
            e.stopPropagation();
            const sessionInfo = this.agentTitleBarStatusService.sessionInfo;
            if (sessionInfo) {
                const session = this.agentSessionsService.getSession(sessionInfo.sessionResource);
                if (session) {
                    this.commandService.executeCommand(EnterAgentSessionProjectionAction.ID, session);
                }
            }
        };
        // Click handler
        disposables.add(addDisposableListener(enterButton, EventType.MOUSE_DOWN, enterProjection));
        disposables.add(addDisposableListener(enterButton, EventType.CLICK, enterProjection));
        // Keyboard handler
        disposables.add(addDisposableListener(enterButton, EventType.KEY_DOWN, (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                enterProjection(e);
            }
        }));
    }
    // #endregion
    // #region Session Helpers
    /**
     * Get the session most urgently needing user attention (approval/confirmation/input).
     * Returns undefined if no sessions need attention.
     */
    _getSessionNeedingAttention(attentionNeededSessions) {
        if (attentionNeededSessions.length === 0) {
            return { session: undefined, progress: undefined };
        }
        // Sort by most recently started request
        const sorted = [...attentionNeededSessions].sort((a, b) => {
            const timeA = a.timing.lastRequestStarted ?? a.timing.created;
            const timeB = b.timing.lastRequestStarted ?? b.timing.created;
            return timeB - timeA;
        });
        const mostRecent = sorted[0];
        if (!mostRecent.description) {
            return { session: mostRecent, progress: mostRecent.label };
        }
        // Convert markdown to plain text if needed
        const progress = typeof mostRecent.description === 'string'
            ? mostRecent.description
            : renderAsPlaintext(mostRecent.description);
        return { session: mostRecent, progress };
    }
    // #endregion
    // #region Label Helpers
    /**
     * Compute the label to display in the command center.
     * Uses the workspace name (folder name) with prefix/suffix decorations.
     * Falls back to file name when tabs are hidden, or "Search" when empty.
     */
    _getLabel() {
        const { prefix, suffix } = this._windowTitle.getTitleDecorations();
        // Base label: custom title, workspace name, or file name when tabs are hidden
        let label = this._windowTitle.workspaceName;
        if (this._windowTitle.isCustomTitleFormat()) {
            label = this._windowTitle.getWindowTitle();
        }
        else if (!label && this.editorGroupsService.partOptions.showTabs === 'none') {
            label = this._windowTitle.fileName ?? '';
        }
        if (!label) {
            label = localize('agentStatusWidget.search', "Search");
        }
        // Apply prefix and suffix decorations
        if (prefix) {
            label = localize('label1', "{0} {1}", prefix, label);
        }
        if (suffix) {
            label = localize('label2', "{0} {1}", label, suffix);
        }
        return label.replaceAll(/\r\n|\r|\n/g, '\u23CE');
    }
};
AgentTitleBarStatusWidget = __decorate([
    __param(2, IInstantiationService),
    __param(3, IAgentTitleBarStatusService),
    __param(4, IHoverService),
    __param(5, ICommandService),
    __param(6, IKeybindingService),
    __param(7, IAgentSessionsService),
    __param(8, IWorkspaceContextService),
    __param(9, IEditorGroupsService),
    __param(10, IEditorService),
    __param(11, IMenuService),
    __param(12, IContextKeyService),
    __param(13, IStorageService),
    __param(14, IConfigurationService),
    __param(15, IChatEntitlementService),
    __param(16, IChatWidgetService),
    __param(17, ITelemetryService)
], AgentTitleBarStatusWidget);
export { AgentTitleBarStatusWidget };
/**
 * Provides custom rendering for the agent status in the command center.
 * Uses IActionViewItemService to render a custom AgentStatusWidget
 * for the AgentsControlMenu submenu.
 * Also adds CSS classes to the workbench based on settings.
 */
let AgentTitleBarStatusRendering = class AgentTitleBarStatusRendering extends Disposable {
    static { this.ID = 'workbench.contrib.agentStatus.rendering'; }
    constructor(actionViewItemService, instantiationService, configurationService, contextKeyService) {
        super();
        this._register(actionViewItemService.register(MenuId.CommandCenter, MenuId.AgentsTitleBarControlMenu, (action, options) => {
            if (!(action instanceof SubmenuItemAction)) {
                return undefined;
            }
            return instantiationService.createInstance(AgentTitleBarStatusWidget, action, options);
        }, undefined));
        // Add/remove CSS classes on workbench based on settings.
        // Only hide the default command center search box (via unified-agents-bar)
        // when chat is enabled, so the search box remains visible during remote
        // connection startup before the agent status widget is ready to render.
        const chatEnabledKey = contextKeyService.getContextKeyValue('chatIsEnabled');
        let chatEnabled = !!chatEnabledKey;
        const updateClass = () => {
            const commandCenterEnabled = configurationService.getValue("window.commandCenter" /* LayoutSettings.COMMAND_CENTER */) === true;
            const statusMode = getAgentStatusSettingMode(configurationService);
            const enabled = commandCenterEnabled && chatEnabled && statusMode !== 'hidden';
            const enhanced = enabled && statusMode === 'compact';
            mainWindow.document.body.classList.toggle('agent-status-enabled', enabled);
            mainWindow.document.body.classList.toggle('unified-agents-bar', enhanced);
        };
        updateClass();
        this._register(configurationService.onDidChangeConfiguration(e => {
            if (e.affectsConfiguration(ChatConfiguration.AgentStatusEnabled)
                || e.affectsConfiguration("window.commandCenter" /* LayoutSettings.COMMAND_CENTER */)
                || e.affectsConfiguration(ChatConfiguration.AIDisabled)
                || e.affectsConfiguration(ChatConfiguration.ChatCustomizationMenuEnabled)
                || e.affectsConfiguration('disableAICustomizations')
                || e.affectsConfiguration('workbench.disableAICustomizations')) {
                updateClass();
            }
        }));
        this._register(contextKeyService.onDidChangeContext(e => {
            if (e.affectsSome(new Set(['chatIsEnabled']))) {
                chatEnabled = !!contextKeyService.getContextKeyValue('chatIsEnabled');
                updateClass();
            }
        }));
    }
};
AgentTitleBarStatusRendering = __decorate([
    __param(0, IActionViewItemService),
    __param(1, IInstantiationService),
    __param(2, IConfigurationService),
    __param(3, IContextKeyService)
], AgentTitleBarStatusRendering);
export { AgentTitleBarStatusRendering };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYWdlbnRUaXRsZUJhclN0YXR1c1dpZGdldC5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvYnJvd3Nlci9hZ2VudFNlc3Npb25zL2V4cGVyaW1lbnRzL2FnZW50VGl0bGVCYXJTdGF0dXNXaWRnZXQudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7QUFFaEcsT0FBTyx1Q0FBdUMsQ0FBQztBQUMvQyxPQUFPLEVBQUUsQ0FBQyxFQUFFLHFCQUFxQixFQUFFLFNBQVMsRUFBRSxTQUFTLEVBQUUsYUFBYSxFQUFFLEtBQUssRUFBRSxNQUFNLHVDQUF1QyxDQUFDO0FBQzdILE9BQU8sRUFBRSxVQUFVLEVBQUUsTUFBTSwyREFBMkQsQ0FBQztBQUN2RixPQUFPLEVBQUUsVUFBVSxFQUFFLGVBQWUsRUFBRSxNQUFNLDRDQUE0QyxDQUFDO0FBQ3pGLE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSwyQ0FBMkMsQ0FBQztBQUNwRSxPQUFPLEVBQUUsS0FBSyxJQUFJLFVBQVUsRUFBRSxNQUFNLHdDQUF3QyxDQUFDO0FBQzdFLE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSwwQkFBMEIsQ0FBQztBQUNwRCxPQUFPLEVBQUUsYUFBYSxFQUFFLE1BQU0sbURBQW1ELENBQUM7QUFDbEYsT0FBTyxFQUFFLHVCQUF1QixFQUFFLE1BQU0saUVBQWlFLENBQUM7QUFDMUcsT0FBTyxFQUFFLGVBQWUsRUFBRSwyQkFBMkIsRUFBRSxNQUFNLGlDQUFpQyxDQUFDO0FBQy9GLE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSx3REFBd0QsQ0FBQztBQUN6RixPQUFPLEVBQUUsa0JBQWtCLEVBQUUsTUFBTSw0REFBNEQsQ0FBQztBQUNoRyxPQUFPLEVBQUUsaUNBQWlDLEVBQUUsZ0NBQWdDLEVBQUUsTUFBTSxvQ0FBb0MsQ0FBQztBQUN6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