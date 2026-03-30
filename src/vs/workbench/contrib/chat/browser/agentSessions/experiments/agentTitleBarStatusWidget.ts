/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

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
import { AgentSessionStatus, IAgentSession, isSessionInProgressStatus } from '../agentSessionsModel.js';
import { BaseActionViewItem, IBaseActionViewItemOptions } from '../../../../../../base/browser/ui/actionbar/actionViewItems.js';
import { IAction, Separator, SubmenuAction, toAction } from '../../../../../../base/common/actions.js';
import { IWorkspaceContextService, WorkbenchState } from '../../../../../../platform/workspace/common/workspace.js';
import { IEditorGroupsService } from '../../../../../services/editor/common/editorGroupsService.js';
import { IEditorService } from '../../../../../services/editor/common/editorService.js';
import { renderAsPlaintext } from '../../../../../../base/browser/markdownRenderer.js';
import { IInstantiationService } from '../../../../../../platform/instantiation/common/instantiation.js';
import { IMenuService, MenuId, MenuItemAction, SubmenuItemAction } from '../../../../../../platform/actions/common/actions.js';
import { IContextKeyService } from '../../../../../../platform/contextkey/common/contextkey.js';
import { HiddenItemStrategy, WorkbenchToolBar } from '../../../../../../platform/actions/browser/toolbar.js';
import { DropdownWithPrimaryActionViewItem } from '../../../../../../platform/actions/browser/dropdownWithPrimaryActionViewItem.js';
import { createActionViewItem } from '../../../../../../platform/actions/browser/menuEntryActionViewItem.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../../../platform/storage/common/storage.js';
import { FocusAgentSessionsAction } from '../agentSessionsActions.js';
import { IWorkbenchContribution } from '../../../../../common/contributions.js';
import { IActionViewItemService } from '../../../../../../platform/actions/browser/actionViewItemService.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { mainWindow } from '../../../../../../base/browser/window.js';
import { LayoutSettings } from '../../../../../services/layout/browser/layoutService.js';
import { WindowTitle } from '../../../../../browser/parts/titlebar/windowTitle.js';
import { ChatConfiguration } from '../../../common/constants.js';
import { ChatEntitlement, IChatEntitlementService } from '../../../../../services/chat/common/chatEntitlementService.js';
import { IChatWidgetService } from '../../chat.js';
import { ITelemetryService } from '../../../../../../platform/telemetry/common/telemetry.js';

// Telemetry types
type AgentStatusClickAction =
	| 'openSession'
	| 'quickAccess'
	| 'focusSessionsView'
	| 'toggleChat'
	| 'setupChat'
	| 'openQuotaExceededDialog'
	| 'applyFilter'
	| 'clearFilter'
	| 'enterProjection'
	| 'exitProjection';

type AgentStatusClickEvent = {
	source: 'pill' | 'sparkle' | 'unread' | 'inProgress' | 'needsInput';
	action: AgentStatusClickAction;
};

type AgentStatusClickClassification = {
	source: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Which part of the agent status widget was clicked.' };
	action: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The action taken in response to the click.' };
	owner: 'joshspicer';
	comment: 'Tracks interactions with the agent status command center control.';
};

// Action IDs
const TOGGLE_CHAT_ACTION_ID = 'workbench.action.chat.toggle';
const CHAT_SETUP_ACTION_ID = 'workbench.action.chat.triggerSetup';
const OPEN_CHAT_QUOTA_EXCEEDED_DIALOG = 'workbench.action.chat.openQuotaExceededDialog';
const QUICK_OPEN_ACTION_ID = 'workbench.action.quickOpenWithModes';

// Storage key for filter state
const FILTER_STORAGE_KEY = 'agentSessions.filterExcludes.agentsessionsviewerfiltersubmenu';
// Storage key for saving user's filter state before we override it
const PREVIOUS_FILTER_STORAGE_KEY = 'agentSessions.filterExcludes.previousUserFilter';

type AgentStatusSettingMode = 'hidden' | 'badge' | 'compact';

function shouldForceHiddenAgentStatus(configurationService: IConfigurationService): boolean {
	const aiFeaturesDisabled = configurationService.getValue<boolean>(ChatConfiguration.AIDisabled) === true;
	const aiCustomizationsDisabled = configurationService.getValue<boolean>('disableAICustomizations') === true
		|| configurationService.getValue<boolean>('workbench.disableAICustomizations') === true
		|| configurationService.getValue<boolean>(ChatConfiguration.ChatCustomizationMenuEnabled) === false;

	return aiFeaturesDisabled && aiCustomizationsDisabled;
}

function getAgentStatusSettingMode(configurationService: IConfigurationService): AgentStatusSettingMode {
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
export class AgentTitleBarStatusWidget extends BaseActionViewItem {

	private _container: HTMLElement | undefined;
	private readonly _dynamicDisposables = this._register(new DisposableStore());

	/** The currently displayed in-progress session (if any) - clicking pill opens this */

	/** Cached render state to avoid unnecessary DOM rebuilds */
	private _lastRenderState: string | undefined;

	/** Guard to prevent re-entrant rendering */
	private _isRendering = false;

	/** Roving tabindex elements for keyboard navigation */
	private _rovingElements: HTMLElement[] = [];
	private _rovingIndex: number = 0;

	/** Tracks if this window applied a badge filter (unread/inProgress), so we only auto-clear our own filters */
	// TODO: This is imperfect. Targetted fix for vscode#290863. We should revisit storing filter state per-window to avoid this
	private _badgeFilterAppliedByThisWindow: 'unread' | 'inProgress' | 'needsInput' | null = null;

	/** Reusable menu for CommandCenterCenter items (e.g., debug toolbar) */
	private readonly _commandCenterMenu;

	/** Menu for ChatTitleBarMenu items (same as chat controls dropdown) */
	private readonly _chatTitleBarMenu;

	/** WindowTitle instance for honoring the user's window.title setting */
	private readonly _windowTitle: WindowTitle;

	constructor(
		action: IAction,
		options: IBaseActionViewItemOptions | undefined,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IAgentTitleBarStatusService private readonly agentTitleBarStatusService: IAgentTitleBarStatusService,
		@IHoverService private readonly hoverService: IHoverService,
		@ICommandService private readonly commandService: ICommandService,
		@IKeybindingService private readonly keybindingService: IKeybindingService,
		@IAgentSessionsService private readonly agentSessionsService: IAgentSessionsService,
		@IWorkspaceContextService private readonly workspaceContextService: IWorkspaceContextService,
		@IEditorGroupsService private readonly editorGroupsService: IEditorGroupsService,
		@IEditorService private readonly editorService: IEditorService,
		@IMenuService private readonly menuService: IMenuService,
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
		@IStorageService private readonly storageService: IStorageService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IChatEntitlementService private readonly chatEntitlementService: IChatEntitlementService,
		@IChatWidgetService private readonly chatWidgetService: IChatWidgetService,
		@ITelemetryService private readonly telemetryService: ITelemetryService,
	) {
		super(undefined, action, options);

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
		this._register(this.storageService.onDidChangeValue(StorageScope.PROFILE, 'agentSessions.filterExcludes.agentsessionsviewerfiltersubmenu', this._store)(() => {
			this._render();
		}));

		// Re-render when settings change
		this._register(this.configurationService.onDidChangeConfiguration(e => {
			if (
				e.affectsConfiguration(ChatConfiguration.AgentStatusEnabled)
				|| e.affectsConfiguration(ChatConfiguration.UnifiedAgentsBar)
				|| e.affectsConfiguration(ChatConfiguration.ChatViewSessionsEnabled)
				|| e.affectsConfiguration(ChatConfiguration.AIDisabled)
				|| e.affectsConfiguration(ChatConfiguration.ChatCustomizationMenuEnabled)
				|| e.affectsConfiguration(ChatConfiguration.SignInTitleBarEnabled)
				|| e.affectsConfiguration('disableAICustomizations')
				|| e.affectsConfiguration('workbench.disableAICustomizations')
			) {
				this._lastRenderState = undefined; // Force re-render
				this._render();
			}
		}));

		// Re-render when chat entitlement or quota changes (for sign-in / quota exceeded states)
		this._register(EventUtils.any(
			this.chatEntitlementService.onDidChangeSentiment,
			this.chatEntitlementService.onDidChangeQuotaExceeded,
			this.chatEntitlementService.onDidChangeEntitlement,
			this.chatEntitlementService.onDidChangeAnonymous
		)(() => {
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

	override render(container: HTMLElement): void {
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
	override setFocusable(_focusable: boolean): void {
		// Don't set focusable on the container
	}

	override focus(): void {
		this._rovingElements[this._rovingIndex]?.focus();
	}

	override blur(): void {
		if (!this._container) {
			return;
		}
		const activeElement = getWindow(this._container).document.activeElement;
		if (isHTMLElement(activeElement) && this._container.contains(activeElement)) {
			activeElement.blur();
		}
	}

	private _render(): void {
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
			const unifiedAgentsBarEnabled = this.configurationService.getValue<boolean>(ChatConfiguration.UnifiedAgentsBar) === true;
			const viewSessionsEnabled = this.configurationService.getValue<boolean>(ChatConfiguration.ChatViewSessionsEnabled) !== false;

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
			} else if (this.agentTitleBarStatusService.mode === AgentStatusMode.SessionReady) {
				// Session ready mode - show session title + enter projection button
				this._renderSessionReadyMode(this._dynamicDisposables);
			} else if (statusMode === 'compact') {
				// Compact mode - replace command center search with integrated control
				this._renderChatInputMode(this._dynamicDisposables);
			} else if (statusMode === 'badge') {
				// Badge mode - render status badge next to command center search
				this._renderStatusBadge(this._dynamicDisposables, activeSessions, unreadSessions, attentionNeededSessions);
			}
			// Hidden mode intentionally renders nothing.

			// Setup roving tabindex for keyboard navigation
			this._setupRovingTabIndex(this._dynamicDisposables);
		} finally {
			this._isRendering = false;
		}
	}

	/**
	 * Setup roving tabindex for arrow key navigation between interactive elements.
	 * Uses the elements registered in `this._rovingElements` in their existing order.
	 */
	private _setupRovingTabIndex(disposables: DisposableStore): void {
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
			const index = this._rovingElements.findIndex(el => el === e.target || el.contains(e.target as Node));
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
	private _moveRovingFocus(currentIndex: number, nextIndex: number): void {
		this._rovingElements[currentIndex].tabIndex = -1;
		this._rovingElements[nextIndex].tabIndex = 0;
		this._rovingElements[nextIndex].focus();
		this._rovingIndex = nextIndex;
	}

	/**
	 * Returns the next roving index for the given key, or `undefined` if no navigation should occur.
	 */
	private _getNextRovingIndex(currentIndex: number, key: string): number | undefined {
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
	private _getSessionStats(): {
		activeSessions: IAgentSession[];
		unreadSessions: IAgentSession[];
		attentionNeededSessions: IAgentSession[];
		hasActiveSessions: boolean;
		hasUnreadSessions: boolean;
		hasAttentionNeeded: boolean;
	} {
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
		const attentionNeededSessions = filteredSessions.filter(s => s.status === AgentSessionStatus.NeedsInput && !this.chatWidgetService.getWidgetBySessionResource(s.resource));

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

	private _renderChatInputMode(disposables: DisposableStore): void {
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
		} else {
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
		} else {
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
			this.telemetryService.publicLog2<AgentStatusClickEvent, AgentStatusClickClassification>('agentStatusWidget.click', {
				source: 'pill',
				action: 'quickAccess',
			});
			const useUnifiedQuickAccess = this.configurationService.getValue<boolean>(ChatConfiguration.UnifiedAgentsBar) === true;
			this.commandService.executeCommand(useUnifiedQuickAccess ? UNIFIED_QUICK_ACCESS_ACTION_ID : QUICK_OPEN_ACTION_ID);
		}));

		// Keyboard handler
		disposables.add(addDisposableListener(inputArea, EventType.KEY_DOWN, (e) => {
			if (e.key === 'Enter' || e.key === ' ') {
				e.preventDefault();
				e.stopPropagation();
				this.telemetryService.publicLog2<AgentStatusClickEvent, AgentStatusClickClassification>('agentStatusWidget.click', {
					source: 'pill',
					action: 'quickAccess',
				});
				const useUnifiedQuickAccess = this.configurationService.getValue<boolean>(ChatConfiguration.UnifiedAgentsBar) === true;
				this.commandService.executeCommand(useUnifiedQuickAccess ? UNIFIED_QUICK_ACCESS_ACTION_ID : QUICK_OPEN_ACTION_ID);
			}
		}));

		// In compact mode, render status badge inline within the pill
		this._renderStatusBadge(disposables, activeSessions, unreadSessions, attentionNeededSessions, pill);
	}

	private _renderSessionMode(disposables: DisposableStore): void {
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
		const exitHandler = (e: Event) => {
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
	private _renderSessionReadyMode(disposables: DisposableStore): void {
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
		const enterHandler = (e: Event) => {
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
	private _renderCommandCenterToolbar(disposables: DisposableStore, parent?: HTMLElement): void {
		const container = parent ?? this._container;
		if (!container) {
			return;
		}

		// Get menu actions from CommandCenterCenter (e.g., debug toolbar)
		const allActions: IAction[] = [];
		for (const [, actions] of this._commandCenterMenu.getActions({ shouldForwardArgs: true })) {
			for (const action of actions) {
				// Filter out the quick open action - we provide our own search UI
				if (action.id === QUICK_OPEN_ACTION_ID) {
					continue;
				}
				// For submenus (like debug toolbar), add the submenu actions
				if (action instanceof SubmenuAction) {
					allActions.push(...action.actions);
				} else {
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
			hiddenItemStrategy: HiddenItemStrategy.NoHide,
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
		} else {
			// Outside pill: use dot separator (matching command center style)
			const separator = renderIcon(Codicon.circleSmallFilled);
			separator.classList.add('agent-status-separator');
			container.appendChild(separator);
		}
	}

	/**
	 * Render the search button. If parent is provided, appends to parent; otherwise appends to container.
	 */
	private _renderSearchButton(disposables: DisposableStore, parent?: HTMLElement): void {
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
	private _renderStatusBadge(disposables: DisposableStore, activeSessions: IAgentSession[], unreadSessions: IAgentSession[], attentionNeededSessions: IAgentSession[], inlineContainer?: HTMLElement): void {
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
		let badge: HTMLElement;
		if (inlineContainer) {
			badge = inlineContainer;
		} else {
			badge = $('div.agent-status-badge');
			this._container.appendChild(badge);
		}

		// Sparkle dropdown button section (always visible on left) - proper button with dropdown menu
		const sparkleContainer = $('span.agent-status-badge-section.sparkle');
		sparkleContainer.tabIndex = 0;

		// Get menu actions for dropdown with proper group separators
		const menuActions: IAction[] = Separator.join(...this._chatTitleBarMenu.getActions({ shouldForwardArgs: true }).map(([, actions]) => actions));

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

		const signInTitleBarEnabled = this.configurationService.getValue<boolean>(ChatConfiguration.SignInTitleBarEnabled);
		if (chatSentiment.installed && !chatSentiment.disabled) {
			if (signedOut && !anonymous && !signInTitleBarEnabled) {
				primaryActionId = CHAT_SETUP_ACTION_ID;
				primaryActionTitle = localize('signInToChatSetup', "Sign in to use AI features...");
				primaryActionIcon = Codicon.chatSparkleError;
			} else if (chatQuotaExceeded && free) {
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
		const sparkleDropdown = this.instantiationService.createInstance(
			DropdownWithPrimaryActionViewItem,
			primaryAction,
			dropdownAction,
			menuActions,
			'agent-status-sparkle-dropdown',
			{ skipTelemetry: true }
		);
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
			} else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
				// Open dropdown menu with arrow keys
				e.preventDefault();
				e.stopPropagation();
				sparkleDropdown.showDropdown();
			}
		}));

		// Hover delegate for status sections
		const hoverDelegate = getDefaultHoverDelegate('mouse');

		// Only show status indicators if chat.viewSessions.enabled is true
		const viewSessionsEnabled = this.configurationService.getValue<boolean>(ChatConfiguration.ChatViewSessionsEnabled) !== false;

		// When compact mode is active, show status indicators before the sparkle button:
		// [needs-input, active, unread, sparkle] (populating inward)
		// Otherwise, keep original order: [sparkle, unread, active, needs-input]
		const reverseOrder = !!inlineContainer;

		if (!reverseOrder) {
			// Original order: sparkle first
			badge.appendChild(sparkleContainer);
		}

		// Build status sections but don't append yet - we need to control order
		let unreadSection: HTMLElement | undefined;
		let activeSection: HTMLElement | undefined;
		let needsInputSection: HTMLElement | undefined;

		// Unread section (blue dot + count)
		if (viewSessionsEnabled && hasUnreadSessions && this.workspaceContextService.getWorkbenchState() !== WorkbenchState.EMPTY) {
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
		const inProgressOnly = activeSessions.filter(s => s.status !== AgentSessionStatus.NeedsInput);
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
			if (needsInputSection) { badge.appendChild(needsInputSection); this._rovingElements.push(needsInputSection); }
			if (activeSection) { badge.appendChild(activeSection); this._rovingElements.push(activeSection); }
			if (unreadSection) { badge.appendChild(unreadSection); this._rovingElements.push(unreadSection); }
			badge.appendChild(sparkleContainer);
			this._rovingElements.push(sparkleContainer);
		} else {
			// Original: [sparkle (already appended), unread, active, needs-input]
			this._rovingElements.push(sparkleContainer);
			if (unreadSection) { badge.appendChild(unreadSection); this._rovingElements.push(unreadSection); }
			if (activeSection) { badge.appendChild(activeSection); this._rovingElements.push(activeSection); }
			if (needsInputSection) { badge.appendChild(needsInputSection); this._rovingElements.push(needsInputSection); }
		}

	}

	/**
	 * Clear the filter if the currently filtered category becomes empty.
	 * For example, if filtered to "unread" but no unread sessions exist, restore user's previous filter.
	 * Only auto-clears if THIS window applied the badge filter to avoid cross-window interference.
	 */
	private _clearFilterIfCategoryEmpty(hasUnreadSessions: boolean, hasActiveSessions: boolean, hasAttentionNeeded: boolean): void {
		// Only auto-clear if this window applied the badge filter
		// This prevents Window B from clearing filters that Window A set
		if (this._badgeFilterAppliedByThisWindow === 'unread' && !hasUnreadSessions) {
			this._restoreUserFilter();
		} else if (this._badgeFilterAppliedByThisWindow === 'inProgress' && !hasActiveSessions) {
			this._restoreUserFilter();
		} else if (this._badgeFilterAppliedByThisWindow === 'needsInput' && !hasAttentionNeeded) {
			this._restoreUserFilter();
		}
	}

	/**
	 * Get the current filter state from storage.
	 */
	private _getCurrentFilterState(): { isFilteredToUnread: boolean; isFilteredToInProgress: boolean; isFilteredToNeedsInput: boolean } {
		const filter = this._getStoredFilter();
		if (!filter) {
			return { isFilteredToUnread: false, isFilteredToInProgress: false, isFilteredToNeedsInput: false };
		}

		// Detect if filtered to unread (read=true excludes read sessions, leaving only unread)
		const isFilteredToUnread = filter.read === true && filter.states.length === 0;
		// Detect if filtered to in-progress only (3 excluded states including NeedsInput)
		const isFilteredToInProgress = filter.states?.length === 3 && filter.states.includes(AgentSessionStatus.NeedsInput) && filter.read === false;
		// Detect if filtered to needs-input only (3 excluded states including InProgress)
		const isFilteredToNeedsInput = filter.states?.length === 3 && filter.states.includes(AgentSessionStatus.InProgress) && filter.read === false;

		return { isFilteredToUnread, isFilteredToInProgress, isFilteredToNeedsInput };
	}

	/**
	 * Get the stored filter object from storage.
	 */
	private _getStoredFilter(): { providers: string[]; states: AgentSessionStatus[]; archived: boolean; read: boolean } | undefined {
		const filterStr = this.storageService.get(FILTER_STORAGE_KEY, StorageScope.PROFILE);
		if (!filterStr) {
			return undefined;
		}
		try {
			return JSON.parse(filterStr);
		} catch {
			return undefined;
		}
	}

	/**
	 * Store a filter object to storage.
	 */
	private _storeFilter(filter: { providers: string[]; states: AgentSessionStatus[]; archived: boolean; read: boolean }): void {
		this.storageService.store(FILTER_STORAGE_KEY, JSON.stringify(filter), StorageScope.PROFILE, StorageTarget.USER);
	}

	/**
	 * Clear all filters (reset to default).
	 */
	private _clearFilter(): void {
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
	private _saveUserFilter(): void {
		const { isFilteredToUnread, isFilteredToInProgress, isFilteredToNeedsInput } = this._getCurrentFilterState();

		// Don't overwrite the saved filter if we're already in a badge-filtered state
		// The previous user filter should already be saved
		if (isFilteredToUnread || isFilteredToInProgress || isFilteredToNeedsInput) {
			return;
		}

		const currentFilter = this._getStoredFilter();
		if (currentFilter) {
			this.storageService.store(PREVIOUS_FILTER_STORAGE_KEY, JSON.stringify(currentFilter), StorageScope.PROFILE, StorageTarget.USER);
		}
	}

	/**
	 * Restore the user's previous filter (saved before we applied a badge filter).
	 */
	private _restoreUserFilter(): void {
		const previousFilterStr = this.storageService.get(PREVIOUS_FILTER_STORAGE_KEY, StorageScope.PROFILE);
		if (previousFilterStr) {
			try {
				const previousFilter = JSON.parse(previousFilterStr);
				this._storeFilter(previousFilter);
			} catch {
				// Fall back to clearing if parse fails
				this._clearFilter();
			}
		} else {
			// No previous filter saved, clear to default
			this._clearFilter();
		}
		// Clear the saved filter after restoring
		this.storageService.remove(PREVIOUS_FILTER_STORAGE_KEY, StorageScope.PROFILE);
		// Clear the per-window badge filter tracking
		this._badgeFilterAppliedByThisWindow = null;
	}

	/**
	 * Opens the agent sessions view with a specific filter applied, or restores previous filter if already applied.
	 * Preserves session type (provider) filters while toggling only status filters.
	 */
	private _openSessionsWithFilter(filterType: 'unread' | 'inProgress' | 'needsInput'): void {
		const { isFilteredToUnread, isFilteredToInProgress, isFilteredToNeedsInput } = this._getCurrentFilterState();
		const currentFilter = this._getStoredFilter();
		// Preserve existing provider filters (session type filters like Local, Background, etc.)
		const preservedProviders = currentFilter?.providers ?? [];

		// Log telemetry for filter button clicks
		const isToggleOff = (filterType === 'unread' && isFilteredToUnread)
			|| (filterType === 'inProgress' && isFilteredToInProgress)
			|| (filterType === 'needsInput' && isFilteredToNeedsInput);
		this.telemetryService.publicLog2<AgentStatusClickEvent, AgentStatusClickClassification>('agentStatusWidget.click', {
			source: filterType,
			action: isToggleOff ? 'clearFilter' : 'applyFilter',
		});

		// Check if already filtered to this type — toggle off
		if (isToggleOff) {
			this._restoreUserFilter();
		} else {
			// Save current filter before applying our own
			this._saveUserFilter();

			if (filterType === 'unread') {
				this._storeFilter({
					providers: preservedProviders,
					states: [],
					archived: true,
					read: true
				});
			} else if (filterType === 'inProgress') {
				// Exclude Completed, Failed, and NeedsInput — show only InProgress
				this._storeFilter({
					providers: preservedProviders,
					states: [AgentSessionStatus.Completed, AgentSessionStatus.Failed, AgentSessionStatus.NeedsInput],
					archived: true,
					read: false
				});
			} else {
				// Exclude Completed, Failed, and InProgress — show only NeedsInput
				this._storeFilter({
					providers: preservedProviders,
					states: [AgentSessionStatus.Completed, AgentSessionStatus.Failed, AgentSessionStatus.InProgress],
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
	private _renderEscapeButton(disposables: DisposableStore, parent: HTMLElement): void {
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
	private _renderEnterButton(disposables: DisposableStore, parent: HTMLElement): void {
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
		const enterProjection = (e: Event) => {
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
	private _getSessionNeedingAttention(attentionNeededSessions: IAgentSession[]): { session: IAgentSession | undefined; progress: string | undefined } {
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
	private _getLabel(): string {
		const { prefix, suffix } = this._windowTitle.getTitleDecorations();

		// Base label: custom title, workspace name, or file name when tabs are hidden
		let label = this._windowTitle.workspaceName;
		if (this._windowTitle.isCustomTitleFormat()) {
			label = this._windowTitle.getWindowTitle();
		} else if (!label && this.editorGroupsService.partOptions.showTabs === 'none') {
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

	// #endregion
}

/**
 * Provides custom rendering for the agent status in the command center.
 * Uses IActionViewItemService to render a custom AgentStatusWidget
 * for the AgentsControlMenu submenu.
 * Also adds CSS classes to the workbench based on settings.
 */
export class AgentTitleBarStatusRendering extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.agentStatus.rendering';

	constructor(
		@IActionViewItemService actionViewItemService: IActionViewItemService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IConfigurationService configurationService: IConfigurationService,
		@IContextKeyService contextKeyService: IContextKeyService
	) {
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
		const chatEnabledKey = contextKeyService.getContextKeyValue<boolean>('chatIsEnabled');
		let chatEnabled = !!chatEnabledKey;

		const updateClass = () => {
			const commandCenterEnabled = configurationService.getValue<boolean>(LayoutSettings.COMMAND_CENTER) === true;
			const statusMode = getAgentStatusSettingMode(configurationService);
			const enabled = commandCenterEnabled && chatEnabled && statusMode !== 'hidden';
			const enhanced = enabled && statusMode === 'compact';

			mainWindow.document.body.classList.toggle('agent-status-enabled', enabled);
			mainWindow.document.body.classList.toggle('unified-agents-bar', enhanced);
		};
		updateClass();
		this._register(configurationService.onDidChangeConfiguration(e => {
			if (
				e.affectsConfiguration(ChatConfiguration.AgentStatusEnabled)
				|| e.affectsConfiguration(LayoutSettings.COMMAND_CENTER)
				|| e.affectsConfiguration(ChatConfiguration.AIDisabled)
				|| e.affectsConfiguration(ChatConfiguration.ChatCustomizationMenuEnabled)
				|| e.affectsConfiguration('disableAICustomizations')
				|| e.affectsConfiguration('workbench.disableAICustomizations')
			) {
				updateClass();
			}
		}));
		this._register(contextKeyService.onDidChangeContext(e => {
			if (e.affectsSome(new Set(['chatIsEnabled']))) {
				chatEnabled = !!contextKeyService.getContextKeyValue<boolean>('chatIsEnabled');
				updateClass();
			}
		}));
	}
}
