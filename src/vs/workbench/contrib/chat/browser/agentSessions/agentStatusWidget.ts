/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/agentStatusWidget.css';

import { $, addDisposableListener, EventType, reset } from '../../../../../base/browser/dom.js';
import { renderIcon } from '../../../../../base/browser/ui/iconLabel/iconLabels.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { localize } from '../../../../../nls.js';
import { IHoverService } from '../../../../../platform/hover/browser/hover.js';
import { getDefaultHoverDelegate } from '../../../../../base/browser/ui/hover/hoverDelegateFactory.js';
import { AgentStatusMode, IAgentStatusService } from './agentStatusService.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { IKeybindingService } from '../../../../../platform/keybinding/common/keybinding.js';
import { ExitAgentSessionProjectionAction } from './agentSessionProjectionActions.js';
import { IAgentSessionsService } from './agentSessionsService.js';
import { AgentSessionStatus, IAgentSession, isSessionInProgressStatus } from './agentSessionsModel.js';
import { BaseActionViewItem, IBaseActionViewItemOptions } from '../../../../../base/browser/ui/actionbar/actionViewItems.js';
import { IAction, SubmenuAction } from '../../../../../base/common/actions.js';
import { ILabelService } from '../../../../../platform/label/common/label.js';
import { IWorkspaceContextService } from '../../../../../platform/workspace/common/workspace.js';
import { IBrowserWorkbenchEnvironmentService } from '../../../../services/environment/browser/environmentService.js';
import { IEditorGroupsService } from '../../../../services/editor/common/editorGroupsService.js';
import { IEditorService } from '../../../../services/editor/common/editorService.js';
import { Verbosity } from '../../../../common/editor.js';
import { Schemas } from '../../../../../base/common/network.js';
import { renderAsPlaintext } from '../../../../../base/browser/markdownRenderer.js';
import { openSession } from './agentSessionsOpener.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { IMenuService, MenuId } from '../../../../../platform/actions/common/actions.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { HiddenItemStrategy, WorkbenchToolBar } from '../../../../../platform/actions/browser/toolbar.js';
import { createActionViewItem } from '../../../../../platform/actions/browser/menuEntryActionViewItem.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../../platform/storage/common/storage.js';
import { FocusAgentSessionsAction } from './agentSessionsActions.js';

// Action triggered when clicking the main pill - change this to modify the primary action
const ACTION_ID = 'workbench.action.quickchat.toggle';
const SEARCH_BUTTON_ACITON_ID = 'workbench.action.quickOpenWithModes';

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
export class AgentStatusWidget extends BaseActionViewItem {

	private static readonly _quickOpenCommandId = 'workbench.action.quickOpenWithModes';

	private _container: HTMLElement | undefined;
	private readonly _dynamicDisposables = this._register(new DisposableStore());

	/** The currently displayed in-progress session (if any) - clicking pill opens this */
	private _displayedSession: IAgentSession | undefined;

	/** Cached render state to avoid unnecessary DOM rebuilds */
	private _lastRenderState: string | undefined;

	/** Reusable menu for CommandCenterCenter items (e.g., debug toolbar) */
	private readonly _commandCenterMenu;

	constructor(
		action: IAction,
		options: IBaseActionViewItemOptions | undefined,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IAgentStatusService private readonly agentStatusService: IAgentStatusService,
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
	) {
		super(undefined, action, options);

		// Create menu for CommandCenterCenter to get items like debug toolbar
		this._commandCenterMenu = this._register(this.menuService.createMenu(MenuId.CommandCenterCenter, this.contextKeyService));

		// Re-render when control mode or session info changes
		this._register(this.agentStatusService.onDidChangeMode(() => {
			this._render();
		}));

		this._register(this.agentStatusService.onDidChangeSessionInfo(() => {
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
	}

	override render(container: HTMLElement): void {
		super.render(container);
		this._container = container;
		container.classList.add('agent-status-container');

		// Initial render
		this._render();
	}

	private _render(): void {
		if (!this._container) {
			return;
		}

		// Compute current render state to avoid unnecessary DOM rebuilds
		const mode = this.agentStatusService.mode;
		const sessionInfo = this.agentStatusService.sessionInfo;
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

		// Build state key for comparison
		const stateKey = JSON.stringify({
			mode,
			sessionTitle: sessionInfo?.title,
			activeCount: activeSessions.length,
			unreadCount: unreadSessions.length,
			attentionCount: attentionNeededSessions.length,
			attentionText,
			label,
		});

		// Skip re-render if state hasn't changed
		if (this._lastRenderState === stateKey) {
			return;
		}
		this._lastRenderState = stateKey;

		// Clear existing content
		reset(this._container);

		// Clear previous disposables for dynamic content
		this._dynamicDisposables.clear();

		if (this.agentStatusService.mode === AgentStatusMode.Session) {
			// Agent Session Projection mode - show session title + close button
			this._renderSessionMode(this._dynamicDisposables);
		} else {
			// Default mode - show copilot pill with optional in-progress indicator
			this._renderChatInputMode(this._dynamicDisposables);
		}
	}

	// #region Session Statistics

	/**
	 * Get computed session statistics for rendering.
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
		const activeSessions = sessions.filter(s => isSessionInProgressStatus(s.status));
		const unreadSessions = sessions.filter(s => !s.isRead());
		// Sessions that need user attention (approval/confirmation/input)
		const attentionNeededSessions = sessions.filter(s => s.status === AgentSessionStatus.NeedsInput);

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
		pill.setAttribute('aria-label', localize('openQuickChat', "Open Quick Chat"));
		pill.tabIndex = 0;
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
			const kbForTooltip = this.keybindingService.lookupKeybinding(ACTION_ID)?.getLabel();
			return kbForTooltip
				? localize('askTooltip', "Open Quick Chat ({0})", kbForTooltip)
				: localize('askTooltip2', "Open Quick Chat");
		}));

		// Click handler - open displayed session if showing progress, otherwise open quick chat
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

		// Status badge (separate rectangle on right) - always rendered for smooth transitions
		this._renderStatusBadge(disposables, activeSessions, unreadSessions);
	}

	private _renderSessionMode(disposables: DisposableStore): void {
		if (!this._container) {
			return;
		}

		const { activeSessions, unreadSessions } = this._getSessionStats();

		// Render command center items (like debug toolbar) FIRST - to the left
		this._renderCommandCenterToolbar(disposables);

		const pill = $('div.agent-status-pill.session-mode');
		this._container.appendChild(pill);

		// Search button (left side, inside pill)
		this._renderSearchButton(disposables, pill);

		// Session title (center)
		const titleLabel = $('span.agent-status-title');
		const sessionInfo = this.agentStatusService.sessionInfo;
		titleLabel.textContent = sessionInfo?.title ?? localize('agentSessionProjection', "Agent Session Projection");
		pill.appendChild(titleLabel);

		// Escape button (right side)
		this._renderEscapeButton(disposables, pill);

		// Setup pill hover
		const hoverDelegate = getDefaultHoverDelegate('mouse');
		disposables.add(this.hoverService.setupManagedHover(hoverDelegate, pill, () => {
			const sessionInfo = this.agentStatusService.sessionInfo;
			return sessionInfo ? localize('agentSessionProjectionTooltip', "Agent Session Projection: {0}", sessionInfo.title) : localize('agentSessionProjection', "Agent Session Projection");
		}));

		// Status badge (separate rectangle on right) - always rendered for smooth transitions
		this._renderStatusBadge(disposables, activeSessions, unreadSessions);
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
				if (action.id === AgentStatusWidget._quickOpenCommandId) {
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
		container.appendChild(searchButton);

		// Setup hover
		const hoverDelegate = getDefaultHoverDelegate('mouse');
		const searchKb = this.keybindingService.lookupKeybinding(SEARCH_BUTTON_ACITON_ID)?.getLabel();
		const searchTooltip = searchKb
			? localize('openQuickOpenTooltip', "Go to File ({0})", searchKb)
			: localize('openQuickOpenTooltip2', "Go to File");
		disposables.add(this.hoverService.setupManagedHover(hoverDelegate, searchButton, searchTooltip));

		// Click handler
		disposables.add(addDisposableListener(searchButton, EventType.CLICK, (e) => {
			e.preventDefault();
			e.stopPropagation();
			this.commandService.executeCommand(SEARCH_BUTTON_ACITON_ID);
		}));

		// Keyboard handler
		disposables.add(addDisposableListener(searchButton, EventType.KEY_DOWN, (e) => {
			if (e.key === 'Enter' || e.key === ' ') {
				e.preventDefault();
				e.stopPropagation();
				this.commandService.executeCommand(SEARCH_BUTTON_ACITON_ID);
			}
		}));
	}

	/**
	 * Render the status badge showing in-progress and/or unread session counts.
	 * Shows split UI with both indicators when both types exist.
	 * When no notifications, shows a chat sparkle icon.
	 */
	private _renderStatusBadge(disposables: DisposableStore, activeSessions: IAgentSession[], unreadSessions: IAgentSession[]): void {
		if (!this._container) {
			return;
		}

		const hasActiveSessions = activeSessions.length > 0;
		const hasUnreadSessions = unreadSessions.length > 0;
		const hasContent = hasActiveSessions || hasUnreadSessions;

		// Auto-clear filter if the filtered category becomes empty
		this._clearFilterIfCategoryEmpty(hasUnreadSessions, hasActiveSessions);

		const badge = $('div.agent-status-badge');
		this._container.appendChild(badge);

		// When no notifications, hide the badge
		if (!hasContent) {
			badge.classList.add('empty');
			return;
		}

		// Unread section (blue dot + count)
		if (hasUnreadSessions) {
			const unreadSection = $('span.agent-status-badge-section.unread');
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
		}

		// In-progress section (session-in-progress icon + count)
		if (hasActiveSessions) {
			const activeSection = $('span.agent-status-badge-section.active');
			activeSection.setAttribute('role', 'button');
			activeSection.tabIndex = 0;
			const runningIcon = $('span.agent-status-icon');
			reset(runningIcon, renderIcon(Codicon.sessionInProgress));
			activeSection.appendChild(runningIcon);
			const runningCount = $('span.agent-status-text');
			runningCount.textContent = String(activeSessions.length);
			activeSection.appendChild(runningCount);
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
		}

		// Setup hover with combined tooltip
		const hoverDelegate = getDefaultHoverDelegate('mouse');
		disposables.add(this.hoverService.setupManagedHover(hoverDelegate, badge, () => {
			const parts: string[] = [];
			if (hasUnreadSessions) {
				parts.push(unreadSessions.length === 1
					? localize('unreadSessionsTooltip1', "{0} unread session", unreadSessions.length)
					: localize('unreadSessionsTooltip', "{0} unread sessions", unreadSessions.length));
			}
			if (hasActiveSessions) {
				parts.push(activeSessions.length === 1
					? localize('activeSessionsTooltip1', "{0} session in progress", activeSessions.length)
					: localize('activeSessionsTooltip', "{0} sessions in progress", activeSessions.length));
			}
			return parts.join(', ');
		}));
	}

	/**
	 * Clear the filter if the currently filtered category becomes empty.
	 * For example, if filtered to "unread" but no unread sessions exist, clear the filter.
	 */
	private _clearFilterIfCategoryEmpty(hasUnreadSessions: boolean, hasActiveSessions: boolean): void {
		const FILTER_STORAGE_KEY = 'agentSessions.filterExcludes.agentsessionsviewerfiltersubmenu';

		const currentFilterStr = this.storageService.get(FILTER_STORAGE_KEY, StorageScope.PROFILE);
		if (!currentFilterStr) {
			return;
		}

		let currentFilter: { providers: string[]; states: AgentSessionStatus[]; archived: boolean; read: boolean } | undefined;
		try {
			currentFilter = JSON.parse(currentFilterStr);
		} catch {
			return;
		}

		if (!currentFilter) {
			return;
		}

		// Detect if filtered to unread (read=true excludes read sessions, leaving only unread)
		const isFilteredToUnread = currentFilter.read === true && currentFilter.states.length === 0;
		// Detect if filtered to in-progress (2 excluded states = Completed + Failed)
		const isFilteredToInProgress = currentFilter.states?.length === 2 && currentFilter.read === false;

		// Clear filter if filtered category is now empty
		if ((isFilteredToUnread && !hasUnreadSessions) || (isFilteredToInProgress && !hasActiveSessions)) {
			const clearedFilter = {
				providers: [],
				states: [],
				archived: true,
				read: false
			};
			this.storageService.store(FILTER_STORAGE_KEY, JSON.stringify(clearedFilter), StorageScope.PROFILE, StorageTarget.USER);
		}
	}

	/**
	 * Opens the agent sessions view with a specific filter applied, or clears filter if already applied.
	 * @param filterType 'unread' to show only unread sessions, 'inProgress' to show only in-progress sessions
	 */
	private _openSessionsWithFilter(filterType: 'unread' | 'inProgress'): void {
		const FILTER_STORAGE_KEY = 'agentSessions.filterExcludes.agentsessionsviewerfiltersubmenu';

		// Check current filter to see if we should toggle off
		const currentFilterStr = this.storageService.get(FILTER_STORAGE_KEY, StorageScope.PROFILE);
		let currentFilter: { providers: string[]; states: AgentSessionStatus[]; archived: boolean; read: boolean } | undefined;
		if (currentFilterStr) {
			try {
				currentFilter = JSON.parse(currentFilterStr);
			} catch {
				// Ignore parse errors
			}
		}

		// Determine if the current filter matches what we're clicking
		const isCurrentlyFilteredToUnread = currentFilter?.read === true && currentFilter.states.length === 0;
		const isCurrentlyFilteredToInProgress = currentFilter?.states?.length === 2 && currentFilter.read === false;

		// Build filter excludes based on filter type
		let excludes: { providers: string[]; states: AgentSessionStatus[]; archived: boolean; read: boolean };

		if (filterType === 'unread') {
			if (isCurrentlyFilteredToUnread) {
				// Toggle off - clear all filters
				excludes = {
					providers: [],
					states: [],
					archived: true,
					read: false
				};
			} else {
				// Exclude read sessions to show only unread
				excludes = {
					providers: [],
					states: [],
					archived: true,
					read: true // exclude read sessions
				};
			}
		} else {
			if (isCurrentlyFilteredToInProgress) {
				// Toggle off - clear all filters
				excludes = {
					providers: [],
					states: [],
					archived: true,
					read: false
				};
			} else {
				// Exclude Completed and Failed to show InProgress and NeedsInput
				excludes = {
					providers: [],
					states: [AgentSessionStatus.Completed, AgentSessionStatus.Failed],
					archived: true,
					read: false
				};
			}
		}

		// Store the filter
		this.storageService.store(FILTER_STORAGE_KEY, JSON.stringify(excludes), StorageScope.PROFILE, StorageTarget.USER);

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

	// #endregion

	// #region Click Handlers

	/**
	 * Handle pill click - opens the displayed session if showing progress, otherwise executes default action
	 */
	private _handlePillClick(): void {
		if (this._displayedSession) {
			this.instantiationService.invokeFunction(openSession, this._displayedSession);
		} else {
			this.commandService.executeCommand(ACTION_ID);
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
