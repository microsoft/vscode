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
import { ILabelService } from '../../../../../../platform/label/common/label.js';
import { IWorkspaceContextService, WorkbenchState } from '../../../../../../platform/workspace/common/workspace.js';
import { IBrowserWorkbenchEnvironmentService } from '../../../../../services/environment/browser/environmentService.js';
import { IEditorGroupsService } from '../../../../../services/editor/common/editorGroupsService.js';
import { IEditorService } from '../../../../../services/editor/common/editorService.js';
import { Verbosity } from '../../../../../common/editor.js';
import { Schemas } from '../../../../../../base/common/network.js';
import { renderAsPlaintext } from '../../../../../../base/browser/markdownRenderer.js';
import { openSession } from '../agentSessionsOpener.js';
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
import { ChatConfiguration } from '../../../common/constants.js';
import { ChatEntitlement, IChatEntitlementService } from '../../../../../services/chat/common/chatEntitlementService.js';
import { IChatWidgetService } from '../../chat.js';

// Action IDs
const TOGGLE_CHAT_ACTION_ID = 'workbench.action.chat.toggle';
const CHAT_SETUP_ACTION_ID = 'workbench.action.chat.triggerSetup';
const OPEN_CHAT_QUOTA_EXCEEDED_DIALOG = 'workbench.action.chat.openQuotaExceededDialog';
const QUICK_OPEN_ACTION_ID = 'workbench.action.quickOpenWithModes';

// Storage key for filter state
const FILTER_STORAGE_KEY = 'agentSessions.filterExcludes.agentsessionsviewerfiltersubmenu';
// Storage key for saving user's filter state before we override it
const PREVIOUS_FILTER_STORAGE_KEY = 'agentSessions.filterExcludes.previousUserFilter';

const NLS_EXTENSION_HOST = localize('devExtensionWindowTitlePrefix', "[Extension Development Host]");
const TITLE_DIRTY = '\u25cf ';

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
	private _displayedSession: IAgentSession | undefined;

	/** Cached render state to avoid unnecessary DOM rebuilds */
	private _lastRenderState: string | undefined;

	/** Guard to prevent re-entrant rendering */
	private _isRendering = false;

	/** First focusable element for keyboard navigation */
	private _firstFocusableElement: HTMLElement | undefined;

	/** Tracks if this window applied a badge filter (unread/inProgress), so we only auto-clear our own filters */
	// TODO: This is imperfect. Targetted fix for vscode#290863. We should revisit storing filter state per-window to avoid this
	private _badgeFilterAppliedByThisWindow: 'unread' | 'inProgress' | null = null;

	/** Reusable menu for CommandCenterCenter items (e.g., debug toolbar) */
	private readonly _commandCenterMenu;

	/** Menu for ChatTitleBarMenu items (same as chat controls dropdown) */
	private readonly _chatTitleBarMenu;

	constructor(
		action: IAction,
		options: IBaseActionViewItemOptions | undefined,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IAgentTitleBarStatusService private readonly agentTitleBarStatusService: IAgentTitleBarStatusService,
		@IHoverService private readonly hoverService: IHoverService,
		@ICommandService private readonly commandService: ICommandService,
		@IKeybindingService private readonly keybindingService: IKeybindingService,
		@IAgentSessionsService private readonly agentSessionsService: IAgentSessionsService,
		@ILabelService private readonly labelService: ILabelService,
		@IWorkspaceContextService private readonly workspaceContextService: IWorkspaceContextService,
		@IBrowserWorkbenchEnvironmentService private readonly environmentService: IBrowserWorkbenchEnvironmentService,
		@IEditorGroupsService private readonly editorGroupsService: IEditorGroupsService,
		@IEditorService private readonly editorService: IEditorService,
		@IMenuService private readonly menuService: IMenuService,
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
		@IStorageService private readonly storageService: IStorageService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IChatEntitlementService private readonly chatEntitlementService: IChatEntitlementService,
		@IChatWidgetService private readonly chatWidgetService: IChatWidgetService,
	) {
		super(undefined, action, options);

		// Create menu for CommandCenterCenter to get items like debug toolbar
		this._commandCenterMenu = this._register(this.menuService.createMenu(MenuId.CommandCenterCenter, this.contextKeyService));

		// Create menu for ChatTitleBarMenu to show in sparkle section dropdown
		this._chatTitleBarMenu = this._register(this.menuService.createMenu(MenuId.ChatTitleBarMenu, this.contextKeyService));

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
			if (e.affectsConfiguration(ChatConfiguration.UnifiedAgentsBar) || e.affectsConfiguration(ChatConfiguration.AgentStatusEnabled) || e.affectsConfiguration(ChatConfiguration.ChatViewSessionsEnabled)) {
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
		// Focus the first focusable child instead
		this._firstFocusableElement?.focus();
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
			const { isFilteredToUnread, isFilteredToInProgress } = this._getCurrentFilterState();

			// Check which settings are enabled (these are independent settings)
			const unifiedAgentsBarEnabled = this.configurationService.getValue<boolean>(ChatConfiguration.UnifiedAgentsBar) === true;
			const agentStatusEnabled = this.configurationService.getValue<boolean>(ChatConfiguration.AgentStatusEnabled) === true;
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
				unifiedAgentsBarEnabled,
				agentStatusEnabled,
				viewSessionsEnabled,
			});

			// Skip re-render if state hasn't changed
			if (this._lastRenderState === stateKey) {
				return;
			}
			this._lastRenderState = stateKey;

			// Clear existing content
			reset(this._container);

			// Clear previous disposables and focusable element for dynamic content
			this._dynamicDisposables.clear();
			this._firstFocusableElement = undefined;

			if (this.agentTitleBarStatusService.mode === AgentStatusMode.Session) {
				// Agent Session Projection mode - show session title + close button
				this._renderSessionMode(this._dynamicDisposables);
			} else if (this.agentTitleBarStatusService.mode === AgentStatusMode.SessionReady) {
				// Session ready mode - show session title + enter projection button
				this._renderSessionReadyMode(this._dynamicDisposables);
			} else if (unifiedAgentsBarEnabled) {
				// Unified Agents Bar - show full pill with label + status badge
				this._renderChatInputMode(this._dynamicDisposables);
			} else if (agentStatusEnabled) {
				// Agent Status - show only the status badge (sparkle + unread/active counts)
				this._renderBadgeOnlyMode(this._dynamicDisposables);
			}
			// If neither setting is enabled, nothing is rendered (container is already cleared)
		} finally {
			this._isRendering = false;
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

		// Render command center items (like debug toolbar) FIRST - to the left
		this._renderCommandCenterToolbar(disposables);

		// Create pill
		const pill = $('div.agent-status-pill.chat-input-mode');
		if (hasAttentionNeeded) {
			pill.classList.add('needs-attention');
		}
		pill.setAttribute('role', 'button');
		pill.setAttribute('aria-label', localize('openQuickAccess', "Open Quick Access"));
		pill.tabIndex = 0;
		this._firstFocusableElement = pill;
		this._container.appendChild(pill);

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
		pill.appendChild(leftIcon);

		// Label (workspace name by default, placeholder on hover)
		// Show attention progress or default label
		const label = $('span.agent-status-label');
		const { session: attentionSession, progress: progressText } = this._getSessionNeedingAttention(attentionNeededSessions);
		this._displayedSession = attentionSession;

		const defaultLabel = progressText ?? this._getLabel();

		if (progressText) {
			label.classList.add('has-progress');
		}

		const hoverLabel = localize('askAnythingPlaceholder', "Ask anything or describe what to build next");

		label.textContent = defaultLabel;
		pill.appendChild(label);

		// Send icon (hidden by default, shown on hover - only when not showing attention message)
		const sendIcon = $('span.agent-status-send');
		reset(sendIcon, renderIcon(Codicon.send));
		sendIcon.classList.add('hidden');
		pill.appendChild(sendIcon);

		// Hover behavior - swap icon and label (only when showing default state).
		// When progressText is defined (e.g. sessions need attention), keep the attention/progress
		// message visible and do not replace it with the generic placeholder on hover.
		if (!progressText) {
			disposables.add(addDisposableListener(pill, EventType.MOUSE_ENTER, () => {
				reset(leftIcon, renderIcon(Codicon.searchSparkle));
				leftIcon.classList.remove('has-attention');
				label.textContent = hoverLabel;
				label.classList.remove('has-progress');
				sendIcon.classList.remove('hidden');
			}));

			disposables.add(addDisposableListener(pill, EventType.MOUSE_LEAVE, () => {
				reset(leftIcon, renderIcon(Codicon.searchSparkle));
				label.textContent = defaultLabel;
				sendIcon.classList.add('hidden');
			}));
		}

		// Setup hover tooltip
		const hoverDelegate = getDefaultHoverDelegate('mouse');
		disposables.add(this.hoverService.setupManagedHover(hoverDelegate, pill, () => {
			if (this._displayedSession) {
				return localize('openSessionTooltip', "Open session: {0}", this._displayedSession.label);
			}
			const kbForTooltip = this.keybindingService.lookupKeybinding(UNIFIED_QUICK_ACCESS_ACTION_ID)?.getLabel();
			return kbForTooltip
				? localize('askTooltip', "Open Quick Access ({0})", kbForTooltip)
				: localize('askTooltip2', "Open Quick Access");
		}));

		// Click handler - open displayed session if showing progress, otherwise open unified quick access
		disposables.add(addDisposableListener(pill, EventType.CLICK, (e) => {
			e.preventDefault();
			e.stopPropagation();
			this._handlePillClick();
		}));

		// Keyboard handler
		disposables.add(addDisposableListener(pill, EventType.KEY_DOWN, (e) => {
			if (e.key === 'Enter' || e.key === ' ') {
				e.preventDefault();
				e.stopPropagation();
				this._handlePillClick();
			}
		}));

		// Status badge (separate rectangle on right) - only when Agent Status is enabled
		if (this.configurationService.getValue<boolean>(ChatConfiguration.AgentStatusEnabled) === true) {
			this._renderStatusBadge(disposables, activeSessions, unreadSessions, attentionNeededSessions);
		}
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

		// Status badge (separate rectangle on right) - only when Agent Status is enabled
		if (this.configurationService.getValue<boolean>(ChatConfiguration.AgentStatusEnabled) === true) {
			this._renderStatusBadge(disposables, activeSessions, unreadSessions, attentionNeededSessions);
		}
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

		// Status badge (separate rectangle on right) - only when Agent Status is enabled
		if (this.configurationService.getValue<boolean>(ChatConfiguration.AgentStatusEnabled) === true) {
			this._renderStatusBadge(disposables, activeSessions, unreadSessions, attentionNeededSessions);
		}
	}

	/**
	 * Render badge-only mode - just the status badge without the full pill.
	 * Used when Agent Status is enabled but Enhanced Agent Status is not.
	 */
	private _renderBadgeOnlyMode(disposables: DisposableStore): void {
		if (!this._container) {
			return;
		}

		const { activeSessions, unreadSessions, attentionNeededSessions } = this._getSessionStats();

		// Status badge only - no pill, no command center toolbar
		this._renderStatusBadge(disposables, activeSessions, unreadSessions, attentionNeededSessions);
	}

	// #endregion

	// #region Reusable Components

	/**
	 * Render command center toolbar items (like debug toolbar) that are registered to CommandCenter
	 * Filters out the quick open action since we provide our own search UI.
	 * Adds a dot separator after the toolbar if content was rendered.
	 */
	private _renderCommandCenterToolbar(disposables: DisposableStore): void {
		if (!this._container) {
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
		this._container.appendChild(toolbarContainer);

		const toolbar = this.instantiationService.createInstance(WorkbenchToolBar, toolbarContainer, {
			hiddenItemStrategy: HiddenItemStrategy.NoHide,
			telemetrySource: 'agentStatusCommandCenter',
			actionViewItemProvider: (action, options) => {
				return createActionViewItem(this.instantiationService, action, { ...options, hoverDelegate });
			}
		});
		disposables.add(toolbar);

		toolbar.setActions(allActions);

		// Add dot separator after the toolbar (matching command center style)
		const separator = renderIcon(Codicon.circleSmallFilled);
		separator.classList.add('agent-status-separator');
		this._container.appendChild(separator);
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
		if (!this._firstFocusableElement) {
			this._firstFocusableElement = searchButton;
		}
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
	private _renderStatusBadge(disposables: DisposableStore, activeSessions: IAgentSession[], unreadSessions: IAgentSession[], attentionNeededSessions: IAgentSession[]): void {
		if (!this._container) {
			return;
		}

		const hasActiveSessions = activeSessions.length > 0;
		const hasUnreadSessions = unreadSessions.length > 0;
		const hasAttentionNeeded = attentionNeededSessions.length > 0;

		// Auto-clear filter if the filtered category becomes empty if this window applied it
		this._clearFilterIfCategoryEmpty(hasUnreadSessions, hasActiveSessions);

		const badge = $('div.agent-status-badge');
		this._container.appendChild(badge);

		// Sparkle dropdown button section (always visible on left) - proper button with dropdown menu
		const sparkleContainer = $('span.agent-status-badge-section.sparkle');
		sparkleContainer.tabIndex = 0;
		if (!this._firstFocusableElement) {
			this._firstFocusableElement = sparkleContainer;
		}
		badge.appendChild(sparkleContainer);

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

		if (chatSentiment.installed && !chatSentiment.disabled) {
			if (signedOut && !anonymous) {
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

		// Unread section (blue dot + count)
		if (viewSessionsEnabled && hasUnreadSessions && this.workspaceContextService.getWorkbenchState() !== WorkbenchState.EMPTY) {
			const { isFilteredToUnread } = this._getCurrentFilterState();
			const unreadSection = $('span.agent-status-badge-section.unread');
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
			badge.appendChild(unreadSection);

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

		// In-progress/Needs-input section - shows "needs input" state when any session needs attention,
		// otherwise shows "in progress" state. This is a single section that transforms based on state.
		if (viewSessionsEnabled && hasActiveSessions) {
			const { isFilteredToInProgress } = this._getCurrentFilterState();
			const activeSection = $('span.agent-status-badge-section.active');
			if (hasAttentionNeeded) {
				activeSection.classList.add('needs-input');
			}
			if (isFilteredToInProgress) {
				activeSection.classList.add('filtered');
			}
			activeSection.setAttribute('role', 'button');
			activeSection.tabIndex = 0;
			const statusIcon = $('span.agent-status-icon');
			// Show report icon when needs input, otherwise session-in-progress icon
			reset(statusIcon, renderIcon(hasAttentionNeeded ? Codicon.report : Codicon.sessionInProgress));
			activeSection.appendChild(statusIcon);
			const statusCount = $('span.agent-status-text');
			// Show needs-input count when attention needed, otherwise total active count
			statusCount.textContent = String(hasAttentionNeeded ? attentionNeededSessions.length : activeSessions.length);
			activeSection.appendChild(statusCount);
			badge.appendChild(activeSection);

			// Click handler - filter to in-progress sessions
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

			// Hover tooltip - different message based on state
			const activeTooltip = hasAttentionNeeded
				? (attentionNeededSessions.length === 1
					? localize('needsInputSessionsTooltip1', "{0} session needs input", attentionNeededSessions.length)
					: localize('needsInputSessionsTooltip', "{0} sessions need input", attentionNeededSessions.length))
				: (activeSessions.length === 1
					? localize('activeSessionsTooltip1', "{0} session in progress", activeSessions.length)
					: localize('activeSessionsTooltip', "{0} sessions in progress", activeSessions.length));
			disposables.add(this.hoverService.setupManagedHover(hoverDelegate, activeSection, activeTooltip));
		}

	}

	/**
	 * Clear the filter if the currently filtered category becomes empty.
	 * For example, if filtered to "unread" but no unread sessions exist, restore user's previous filter.
	 * Only auto-clears if THIS window applied the badge filter to avoid cross-window interference.
	 */
	private _clearFilterIfCategoryEmpty(hasUnreadSessions: boolean, hasActiveSessions: boolean): void {
		// Only auto-clear if this window applied the badge filter
		// This prevents Window B from clearing filters that Window A set
		if (this._badgeFilterAppliedByThisWindow === 'unread' && !hasUnreadSessions) {
			this._restoreUserFilter();
		} else if (this._badgeFilterAppliedByThisWindow === 'inProgress' && !hasActiveSessions) {
			this._restoreUserFilter();
		}
	}

	/**
	 * Get the current filter state from storage.
	 */
	private _getCurrentFilterState(): { isFilteredToUnread: boolean; isFilteredToInProgress: boolean } {
		const filter = this._getStoredFilter();
		if (!filter) {
			return { isFilteredToUnread: false, isFilteredToInProgress: false };
		}

		// Detect if filtered to unread (read=true excludes read sessions, leaving only unread)
		const isFilteredToUnread = filter.read === true && filter.states.length === 0;
		// Detect if filtered to in-progress (2 excluded states = Completed + Failed)
		const isFilteredToInProgress = filter.states?.length === 2 && filter.read === false;

		return { isFilteredToUnread, isFilteredToInProgress };
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
		const { isFilteredToUnread, isFilteredToInProgress } = this._getCurrentFilterState();

		// Don't overwrite the saved filter if we're already in a badge-filtered state
		// The previous user filter should already be saved
		if (isFilteredToUnread || isFilteredToInProgress) {
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
	 * @param filterType 'unread' to show only unread sessions, 'inProgress' to show only in-progress sessions
	 */
	private _openSessionsWithFilter(filterType: 'unread' | 'inProgress'): void {
		const { isFilteredToUnread, isFilteredToInProgress } = this._getCurrentFilterState();
		const currentFilter = this._getStoredFilter();
		// Preserve existing provider filters (session type filters like Local, Background, etc.)
		const preservedProviders = currentFilter?.providers ?? [];

		// Toggle filter based on current state
		if (filterType === 'unread') {
			if (isFilteredToUnread) {
				// Already filtered to unread - restore user's previous filter
				this._restoreUserFilter();
			} else {
				// Save current filter before applying our own
				this._saveUserFilter();
				// Exclude read sessions to show only unread, preserving provider filters
				this._storeFilter({
					providers: preservedProviders,
					states: [],
					archived: true,
					read: true
				});
				// Track that this window applied the badge filter
				this._badgeFilterAppliedByThisWindow = 'unread';
			}
		} else {
			if (isFilteredToInProgress) {
				// Already filtered to in-progress - restore user's previous filter
				this._restoreUserFilter();
			} else {
				// Save current filter before applying our own
				this._saveUserFilter();
				// Exclude Completed and Failed to show InProgress and NeedsInput, preserving provider filters
				this._storeFilter({
					providers: preservedProviders,
					states: [AgentSessionStatus.Completed, AgentSessionStatus.Failed],
					archived: true,
					read: false
				});
				// Track that this window applied the badge filter
				this._badgeFilterAppliedByThisWindow = 'inProgress';
			}
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
		if (!this._firstFocusableElement) {
			this._firstFocusableElement = enterButton;
		}
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

	// #region Click Handlers

	/**
	 * Handle pill click - opens the displayed session if showing progress, otherwise opens unified quick access
	 */
	private _handlePillClick(): void {
		if (this._displayedSession) {
			this.instantiationService.invokeFunction(openSession, this._displayedSession);
		} else {
			this.commandService.executeCommand(UNIFIED_QUICK_ACCESS_ACTION_ID);
		}
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
	 * Compute the label to display, matching the command center behavior.
	 * Includes prefix and suffix decorations (remote host, extension dev host, etc.)
	 */
	private _getLabel(): string {
		const { prefix, suffix } = this._getTitleDecorations();

		// Base label: workspace name or file name (when tabs are hidden)
		let label = this.labelService.getWorkspaceLabel(this.workspaceContextService.getWorkspace());
		if (this.editorGroupsService.partOptions.showTabs === 'none') {
			const activeEditor = this.editorService.activeEditor;
			if (activeEditor) {
				const dirty = activeEditor.isDirty() && !activeEditor.isSaving() ? TITLE_DIRTY : '';
				label = `${dirty}${activeEditor.getTitle(Verbosity.SHORT)}`;
			}
		}

		if (!label) {
			label = localize('agentStatusWidget.askAnything', "Ask anything...");
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

	/**
	 * Get prefix and suffix decorations for the title (matching WindowTitle behavior)
	 */
	private _getTitleDecorations(): { prefix: string | undefined; suffix: string | undefined } {
		let prefix: string | undefined;
		const suffix: string | undefined = undefined;

		// Add remote host label if connected to a remote
		if (this.environmentService.remoteAuthority) {
			prefix = this.labelService.getHostLabel(Schemas.vscodeRemote, this.environmentService.remoteAuthority);
		}

		// Add extension development host prefix
		if (this.environmentService.isExtensionDevelopment) {
			prefix = !prefix
				? NLS_EXTENSION_HOST
				: `${NLS_EXTENSION_HOST} - ${prefix}`;
		}

		return { prefix, suffix };
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
		@IConfigurationService configurationService: IConfigurationService
	) {
		super();

		this._register(actionViewItemService.register(MenuId.CommandCenter, MenuId.AgentsTitleBarControlMenu, (action, options) => {
			if (!(action instanceof SubmenuItemAction)) {
				return undefined;
			}
			return instantiationService.createInstance(AgentTitleBarStatusWidget, action, options);
		}, undefined));

		// Add/remove CSS classes on workbench based on settings
		// Force enable command center and disable chat controls when agent status or unified agents bar is enabled
		const updateClass = () => {
			const commandCenterEnabled = configurationService.getValue<boolean>(LayoutSettings.COMMAND_CENTER) === true;
			const enabled = configurationService.getValue<boolean>(ChatConfiguration.AgentStatusEnabled) === true && commandCenterEnabled;
			const enhanced = configurationService.getValue<boolean>(ChatConfiguration.UnifiedAgentsBar) === true && commandCenterEnabled;

			mainWindow.document.body.classList.toggle('agent-status-enabled', enabled);
			mainWindow.document.body.classList.toggle('unified-agents-bar', enhanced);
		};
		updateClass();
		this._register(configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration(ChatConfiguration.AgentStatusEnabled) || e.affectsConfiguration(ChatConfiguration.UnifiedAgentsBar) || e.affectsConfiguration(LayoutSettings.COMMAND_CENTER)) {
				updateClass();
			}
		}));
	}
}
