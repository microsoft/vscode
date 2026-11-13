/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/sessionsTitleBarWidget.css';
import { $, addDisposableGenericMouseDownListener, addDisposableListener, append, EventType, getDomNodePagePosition, getWindow, isHTMLElement, reset, trackFocus } from '../../../../base/browser/dom.js';
import { StandardMouseEvent } from '../../../../base/browser/mouseEvent.js';
import { disposableTimeout, RunOnceScheduler } from '../../../../base/common/async.js';
import { combinedDisposable, Disposable, DisposableStore, IDisposable, MutableDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { Event as EventUtils } from '../../../../base/common/event.js';
import { KeyCode } from '../../../../base/common/keyCodes.js';
import { localize } from '../../../../nls.js';
import { BaseActionViewItem, IBaseActionViewItemOptions } from '../../../../base/browser/ui/actionbar/actionViewItems.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { MenuRegistry, SubmenuItemAction } from '../../../../platform/actions/common/actions.js';
import { ContextKeyExpr, IContextKey, IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { KeybindingsRegistry, KeybindingWeight } from '../../../../platform/keybinding/common/keybindingsRegistry.js';
import { CommandsRegistry, ICommandService } from '../../../../platform/commands/common/commands.js';
import { Menus } from '../../../../workbench/contrib/sessions/browser/menus.js';
import { AgentsWindowMenus } from '../../../browser/agentsWindowMenus.js';
import { IWorkbenchContribution } from '../../../../workbench/common/contributions.js';
import { IActionViewItemService } from '../../../../platform/actions/browser/actionViewItemService.js';
import { autorun, derived, IObservable, IReader, observableSignalFromEvent } from '../../../../base/common/observable.js';
import { onUnexpectedError } from '../../../../base/common/errors.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { URI } from '../../../../base/common/uri.js';
import { AnchorAlignment, AnchorPosition, IAnchor } from '../../../../base/common/layout.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { HoverStyle } from '../../../../base/browser/ui/hover/hover.js';
import { IContextMenuService, IContextViewService, IOpenContextView } from '../../../../platform/contextview/browser/contextView.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IQuickInputService } from '../../../../platform/quickinput/common/quickInput.js';
import { IsAuxiliaryWindowContext, LayoutModeContext } from '../../../../workbench/common/contextkeys.js';
import { IWorkbenchLayoutService } from '../../../../workbench/services/layout/browser/layoutService.js';
import { SessionsCommandCenterDropdownVisibleContext, SessionsWelcomeVisibleContext } from '../../../../workbench/contrib/sessions/common/contextkeys.js';
import { ISessionsProvidersService } from '../../../../workbench/contrib/sessions/browser/sessionsProvidersService.js';
import { getChatWindowOfHost, openPickedSessionInChatWindow, SHOW_SESSIONS_PICKER_COMMAND_ID } from './sessionsActions.js';
import { IChatWindowService } from '../../../../workbench/contrib/chatWindow/browser/chatWindow.js';
import { ISessionsManagementService } from '../../../../workbench/contrib/sessions/common/sessionsManagement.js';
import { ISessionsService } from '../../../../workbench/contrib/sessions/browser/sessionsService.js';
import { getWindowHost, ISessionHost, SessionHostKind } from '../../../../workbench/services/sessions/browser/sessionHost.js';
import { BlockedSessionsList, IBlockedSessionsHeaderActionContext, ICommandCenterSessionsHeaderActionContext, registerBlockedSessionsItemActions, SessionsCommandCenterList } from './blockedSessionsList.js';
import { SessionActionFeedback } from './sessionActionFeedback.js';
import { BlockedSessionsIndicatorModel, RequiresInputKind } from './blockedSessionsIndicatorModel.js';
import { getSessionWorkspaceDisplayInfo, ISessionWorkspaceDisplayInfo } from '../../../browser/sessionWorkspace.js';
import { IHoverService } from '../../../../platform/hover/browser/hover.js';
import { IBrowserWorkbenchEnvironmentService } from '../../../../workbench/services/environment/browser/environmentService.js';
import { isAgentHostProvider } from '../../../../workbench/contrib/sessions/common/agentHostSessionsProvider.js';
import { groupSessionsForPicker } from './sessionsPicker.js';
import { ISession } from '../../../../workbench/services/sessions/common/session.js';
import { IAccessibilityService } from '../../../../platform/accessibility/common/accessibility.js';
import { registerIcon } from '../../../../platform/theme/common/iconRegistry.js';
import { getDefaultHoverDelegate } from '../../../../base/browser/ui/hover/hoverDelegateFactory.js';

/**
 * Internal command behind the command-center dropdown header's "Show All
 * Sessions" action.
 */
const SHOW_ALL_SESSIONS_FROM_COMMAND_CENTER_COMMAND_ID = 'sessions.commandCenter.showAllSessions';

/** Internal command behind the blocked-sessions dropdown header's bulk-ignore action. */
const IGNORE_ALL_INPUT_NEEDED_COMMAND_ID = 'sessions.blockedSessions.ignoreAllInputNeeded';

/**
 * Internal command that dismisses the command-center sessions dropdown. Bound
 * to Escape so the dropdown can be closed even when focus is outside it.
 */
const HIDE_COMMAND_CENTER_SESSIONS_COMMAND_ID = 'sessions.commandCenter.hideSessions';

const COMMAND_CENTER_DROPDOWN_SHOW_DELAY = 50;
const COMMAND_CENTER_DROPDOWN_HIDE_DELAY = 200;
const COMMAND_CENTER_DROPDOWN_CLOSE_ANIMATION_DURATION = 100;
const COMMAND_CENTER_DROPDOWN_CLOSING_CLASS = 'agent-sessions-command-center-list-closing';
const COMMAND_CENTER_PREVIEW_MAX_SESSIONS = 8;
const sessionAttentionReminderIcon = registerIcon('sessions-session-attention-reminder', Codicon.reportQuestion, localize('sessionAttentionReminderIcon', "Icon reminding the user that another session still requires attention."));
type CommandCenterDropdownKind = 'sessions' | 'blocked';

/** Register the actions shown in the ordinary command-center sessions header. */
export function registerCommandCenterSessionsHeaderActions(): IDisposable {
	return combinedDisposable(
		MenuRegistry.appendMenuItem(Menus.CommandCenterSessionsHeader, {
			command: {
				id: SHOW_ALL_SESSIONS_FROM_COMMAND_CENTER_COMMAND_ID,
				title: localize('showAllSessions', "Show All Sessions"),
				icon: Codicon.listSelection,
			},
			group: 'navigation',
			order: 1,
		}),
		MenuRegistry.appendMenuItem(Menus.CommandCenterSessionsHeader, {
			command: {
				id: HIDE_COMMAND_CENTER_SESSIONS_COMMAND_ID,
				title: localize('closeCommandCenterSessions', "Close"),
				icon: Codicon.close,
			},
			group: 'z_close',
			order: 1,
		}),
	);
}

/** Register the actions shown in the blocked-sessions dropdown header toolbar. */
export function registerBlockedSessionsHeaderActions(): IDisposable {
	return combinedDisposable(
		MenuRegistry.appendMenuItem(Menus.BlockedSessionsHeader, {
			command: {
				id: SHOW_ALL_SESSIONS_FROM_COMMAND_CENTER_COMMAND_ID,
				title: localize('showAllSessions', "Show All Sessions"),
				icon: Codicon.listSelection,
			},
			group: 'navigation',
			order: 1,
		}),
		MenuRegistry.appendMenuItem(Menus.BlockedSessionsHeader, {
			command: {
				id: IGNORE_ALL_INPUT_NEEDED_COMMAND_ID,
				title: localize('ignoreAllInputNeeded', "Ignore All Needs Attention Alerts"),
				icon: Codicon.bellSlash,
			},
			group: 'navigation',
			order: 2,
		}),
		MenuRegistry.appendMenuItem(Menus.BlockedSessionsHeader, {
			command: {
				id: HIDE_COMMAND_CENTER_SESSIONS_COMMAND_ID,
				title: localize('closeBlockedSessions', "Close"),
				icon: Codicon.close,
			},
			group: 'z_close',
			order: 1,
		}),
	);
}

/** Register the commands invoked by the blocked-sessions header toolbar. */
export function registerBlockedSessionsHeaderCommands(): IDisposable {
	return combinedDisposable(
		CommandsRegistry.registerCommand(SHOW_ALL_SESSIONS_FROM_COMMAND_CENTER_COMMAND_ID, (_accessor, context: ICommandCenterSessionsHeaderActionContext) => {
			context.showAllSessions();
		}),
		CommandsRegistry.registerCommand(IGNORE_ALL_INPUT_NEEDED_COMMAND_ID, (_accessor, context: IBlockedSessionsHeaderActionContext) => {
			context.ignoreAllSessions();
		}),
	);
}

/**
 * The currently-open command-center sessions dropdown, shared with the Escape
 * command so it closes this specific context view.
 */
let closeOpenCommandCenterSessionsView: (() => void) | undefined;

/**
 * Minimum width of the blocked-sessions dropdown, in pixels. The dropdown is at
 * least as wide as the command center box it hangs off, but never narrower than
 * this so its rows have room to breathe.
 */
const BLOCKED_DROPDOWN_MIN_WIDTH = 550;

/**
 * Maximum width of the blocked-sessions dropdown as a fraction of the window
 * width, so it never spans (nearly) the entire window on narrow layouts.
 */
const BLOCKED_DROPDOWN_MAX_WIDTH_RATIO = 0.9;

/**
 * Sessions Title Bar Widget - renders the active chat's workspace context
 * in the command center of the agent sessions workbench.
 *
 * Shows a clickable pill with the workspace icon and folder name when available,
 * without the session or chat title.
 *
 * When at least one session is blocked (needs input or has failing CI checks),
 * the widget instead adopts an orange "N sessions require input" state and reveals those sessions as a
 * flat list in a dropdown anchored below the command center box. A short blink
 * animation plays whenever a new session becomes blocked. In every other case it
 * behaves as the active-session pill and previews recent sessions on hover. A
 * click pins the preview; its header opens the full searchable sessions picker.
 *
 * The requires-input logic (which blocked sessions to surface, the homogeneous
 * reason, labels and when to blink) is owned by {@link BlockedSessionsIndicatorModel};
 * this widget only renders it.
 *
 * Session actions (changes, terminal, etc.) are rendered via the
 * SessionTitleActions menu toolbar next to this widget.
 *
 * The widget is a command center action view item, so it is disposed and
 * re-created whenever the command center rebuilds (for example when the
 * new-session view opens and flips `isNewChatSession`). It therefore owns no
 * durable state: the indicator model and the approval feedback are supplied by
 * {@link SessionsTitleBarContribution}, which outlives those rebuilds.
 */
export class SessionsTitleBarWidget extends BaseActionViewItem {

	private _container: HTMLElement | undefined;
	private readonly _dynamicDisposables = this._register(new DisposableStore());
	private readonly _containerDisposables = this._register(new DisposableStore());

	/** Owns the blink animation's `animationend` listener, kept across re-renders. */
	private readonly _blinkListener = this._register(new MutableDisposable());

	/** Cached render state to avoid unnecessary DOM rebuilds */
	private _lastRenderState: string | undefined;

	/** Guard to prevent re-entrant rendering */
	private _isRendering = false;
	private _workspaceInfo: ISessionWorkspaceDisplayInfo | undefined;
	private _isQuickChat = false;
	private readonly _sessionTitle: string | undefined;

	/** The currently open command-center sessions dropdown, if any. */
	private _openContextView: IOpenContextView | undefined;
	private _commandCenterList: BlockedSessionsList | SessionsCommandCenterList | undefined;
	private readonly _commandCenterListDisposables = this._register(new MutableDisposable<DisposableStore>());
	private _openDropdownKind: CommandCenterDropdownKind | undefined;
	private _dropdownContainer: HTMLElement | undefined;
	private _focusToReturn: HTMLElement | undefined;
	private _dropdownPinned = false;
	private _pointerOverAnchor = false;
	private _pointerOverDropdown = false;
	private _pointerOverSessionHover = false;
	private _contextMenuVisible = false;
	private readonly _closeDropdownAnimation = this._register(new MutableDisposable());

	/** Tracks whether the command-center sessions dropdown is open (drives the Escape keybinding). */
	private readonly _commandCenterDropdownVisibleContext: IContextKey<boolean>;

	private readonly _showDropdownScheduler = this._register(new RunOnceScheduler(
		() => this._showCommandCenterDropdown(false),
		COMMAND_CENTER_DROPDOWN_SHOW_DELAY,
	));
	private readonly _hideDropdownScheduler = this._register(new RunOnceScheduler(
		() => this._hideDropdownPreview(),
		COMMAND_CENTER_DROPDOWN_HIDE_DELAY,
	));

	/** The host of the window whose title bar shows the widget. */
	private readonly _windowHost: ISessionHost;
	/** The session represented by the main window's active grid pane, or by this chat window. */
	private readonly _activeSession: IObservable<ISession | undefined>;
	/** Ordered sessions eligible for the ordinary command-center preview. */
	private readonly _commandCenterSessions: IObservable<readonly ISession[]>;

	constructor(
		action: SubmenuItemAction,
		options: IBaseActionViewItemOptions | undefined,
		/** Drives the transient "Approved N sessions" confirmation. */
		private readonly _sessionActionFeedback: SessionActionFeedback,
		/** Model behind the "N sessions require input" indicator (blocked-session set, blink, labels). */
		private readonly _blockedIndicator: BlockedSessionsIndicatorModel,
		@ISessionsManagementService private readonly sessionsManagementService: ISessionsManagementService,
		@ISessionsService private readonly sessionsService: ISessionsService,
		@ISessionHost sessionHost: ISessionHost,
		@ISessionsProvidersService private readonly sessionsProvidersService: ISessionsProvidersService,
		@ICommandService private readonly commandService: ICommandService,
		@IContextViewService private readonly contextViewService: IContextViewService,
		@IWorkbenchLayoutService private readonly layoutService: IWorkbenchLayoutService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IQuickInputService private readonly quickInputService: IQuickInputService,
		@IHoverService private readonly hoverService: IHoverService,
		@IBrowserWorkbenchEnvironmentService environmentService: IBrowserWorkbenchEnvironmentService,
		@IChatWindowService private readonly chatWindowService: IChatWindowService,
		@IAccessibilityService private readonly accessibilityService: IAccessibilityService,
		@IContextMenuService contextMenuService: IContextMenuService,
	) {
		super(undefined, action, options);
		this._windowHost = getWindowHost(sessionHost);
		this._activeSession = derived(this, reader => {
			if (this._windowHost.kind !== SessionHostKind.MainWindow) {
				return this._windowHost.session.read(reader);
			}
			const activePane = this.sessionsService.activePane.read(reader);
			return activePane ? activePane.session.read(reader) : this._windowHost.session.read(reader);
		});
		const sessionsChangedEvent = EventUtils.any(
			this.sessionsManagementService.onDidChangeSessions,
			this.sessionsManagementService.onDidChangeSessionTypes,
		);
		const sessionsChanged = observableSignalFromEvent(this, sessionsChangedEvent);
		this._commandCenterSessions = derived(this, reader => {
			sessionsChanged.read(reader);
			return this._getCommandCenterSessions(reader);
		});

		this._sessionTitle = environmentService.sessionTitle?.replace(/\s+/g, ' ').trim() || undefined;
		this._commandCenterDropdownVisibleContext = SessionsCommandCenterDropdownVisibleContext.bindTo(contextKeyService);
		this._register(contextMenuService.onDidShowContextMenu(() => {
			this._contextMenuVisible = true;
			this._showDropdownScheduler.cancel();
		}));
		this._register(contextMenuService.onDidHideContextMenu(() => this._contextMenuVisible = false));

		// Replay the attention blink when the model reports a genuinely new, not-yet-
		// visible block. Invalidate the cached render state so the identical pill is
		// rebuilt with the blink class (see `_render`).
		this._register(this._blockedIndicator.onDidRequestBlink(() => {
			this._lastRenderState = undefined;
			this._render();
		}));

		// Re-render when the active session's workspace or quick-chat kind changes
		this._register(autorun(reader => {
			const sessionData = this._windowHost.session.read(reader);
			this._workspaceInfo = getSessionWorkspaceDisplayInfo(sessionData, this._windowHost.chat.read(reader), reader);
			this._isQuickChat = sessionData?.isQuickChat?.read(reader) ?? false;
			this._lastRenderState = undefined;
			this._render();
		}));
		this._register(autorun(reader => {
			this._commandCenterSessions.read(reader);
			this._refreshOpenCommandCenterDropdown();
		}));

		// Re-render when the set of blocked sessions changes; it feeds the
		// "N sessions require input" state. Keep an open dropdown in sync.
		this._register(autorun(reader => {
			this._blockedIndicator.blockedSessions.read(reader);
			this._blockedIndicator.unacknowledgedBlockedSessions.read(reader);
			this._blockedIndicator.reminderSessions.read(reader);
			this._blockedIndicator.attentionSessionCount.read(reader);
			this._sessionActionFeedback.approvedCount.read(reader);
			this._blockedIndicator.requiresInputKind.read(reader);
			this._render();
			this._refreshOpenCommandCenterDropdown();
		}));

		this._register(sessionsChangedEvent(() => {
			this._lastRenderState = undefined;
			this._render();
		}));

		// Re-render when providers change (affects provider picker visibility)
		this._register(this.sessionsProvidersService.onDidChangeProviders(() => {
			this._lastRenderState = undefined;
			this._render();
		}));

		// Ensure any open dropdown is closed when the widget is disposed.
		this._register(toDisposable(() => this._openContextView?.close()));
	}

	override render(container: HTMLElement): void {
		super.render(container);

		this._container = container;
		container.classList.add('agent-sessions-titlebar-container');
		this._containerDisposables.clear();
		this._containerDisposables.add(addDisposableListener(container, EventType.MOUSE_ENTER, () => {
			this._pointerOverAnchor = true;
			this._hideDropdownScheduler.cancel();
			this._cancelDropdownCloseAnimation();
			if (!this._openContextView && !this._contextMenuVisible) {
				this._showDropdownScheduler.schedule();
			}
		}));
		this._containerDisposables.add(addDisposableListener(container, EventType.MOUSE_LEAVE, () => {
			this._pointerOverAnchor = false;
			this._showDropdownScheduler.cancel();
			this._scheduleDropdownPreviewHide();
		}));

		// Initial render
		this._render();
	}

	override setFocusable(_focusable: boolean): void {
		// Don't set focusable on the container
	}

	// Override onClick to prevent the base class from running the underlying
	// submenu action when the widget handles clicks itself.
	override onClick(): void {
		// No-op: click handling is done by the pill handler
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
			const approvedCount = this._sessionActionFeedback.approvedCount.get();
			const blockedCount = this._blockedIndicator.blockedSessions.get().length;
			const unacknowledgedBlockedCount = this._blockedIndicator.unacknowledgedBlockedSessions.get().length;
			const reminderCount = this._blockedIndicator.reminderSessions.get().length > 0
				? this._blockedIndicator.attentionSessionCount.get()
				: 0;
			// The transient "Approved N sessions" confirmation takes precedence over the
			// requires-input state while it is showing.
			const showApproved = approvedCount > 0;
			const showRequiresInput = unacknowledgedBlockedCount > 0 && !showApproved;

			// The attention blink fires only when the indicator model reports a
			// *genuinely new* blocked session while the requires-input state is shown —
			// including the very first one. `consumePendingBlink` is short-circuited so
			// the pending blink is only consumed when it actually plays; navigating
			// between sessions acknowledges an occurrence but never creates one.
			const shouldBlink = showRequiresInput && this._blockedIndicator.consumePendingBlink();

			const requiresInputKind = this._blockedIndicator.requiresInputKind.get();

			let renderState: string;
			if (showApproved) {
				renderState = `approved|${approvedCount}`;
			} else if (showRequiresInput) {
				renderState = `blocked|${blockedCount}|${requiresInputKind ?? 'mixed'}`;
			} else {
				renderState = `normal|${this._workspaceInfo?.icon.id ?? ''}|${this._getCommandCenterTitle() ?? ''}|${this._workspaceInfo?.branch ?? ''}|${this._isQuickChat}|${reminderCount}`;
			}

			// Skip re-render if state hasn't changed
			if (this._lastRenderState === renderState) {
				return;
			}
			this._lastRenderState = renderState;

			// Clear existing content
			reset(this._container);
			this._dynamicDisposables.clear();

			// Set up container as the button directly
			this._container.removeAttribute('aria-hidden');
			this._container.setAttribute('role', 'button');
			this._container.setAttribute('aria-haspopup', 'tree');
			this._container.tabIndex = 0;
			this._updateDropdownPresentation();
			// Preserve an in-progress blink when re-rendering the SAME requires-input
			// pill without a new blink. Other autoruns (e.g. onDidChangeSessions)
			// invalidate the cached render state and force a redundant rebuild of the
			// identical pill; without this guard that rebuild would strip the freshly-
			// added blink class and cut the animation short — which is why the first
			// "1 session requires input" never appeared to animate.
			if (!(showRequiresInput && !shouldBlink)) {
				this._container.classList.remove('agent-sessions-titlebar-blink');
			}
			this._container.classList.toggle('agent-sessions-titlebar-requires-input', showRequiresInput);
			this._container.classList.toggle('agent-sessions-titlebar-approved', showApproved);

			if (showApproved) {
				this._renderApproved(approvedCount);
			} else if (showRequiresInput) {
				this._renderRequiresInput(blockedCount, requiresInputKind, shouldBlink);
			} else {
				this._renderActiveSession(reminderCount);
			}
		} finally {
			this._isRendering = false;
		}
	}

	/**
	 * Render the active-session pill: workspace icon + folder. Clicking opens the
	 * sessions picker.
	 */
	private _renderActiveSession(reminderCount = 0): void {
		const container = this._container!;
		const contextTitle = this._getCommandCenterTitle();
		const workspaceInfo = this._workspaceInfo;
		const attentionReminderLabel = reminderCount === 1
			? localize('oneSessionAttentionReminder', "Another session still requires attention")
			: reminderCount > 1
				? localize('nSessionAttentionReminders', "{0} sessions still require attention", reminderCount)
				: undefined;
		const accessibleTitleWithBranch = contextTitle && workspaceInfo?.branch
			? localize('agentSessionsSessionWithBranchAccessible', "{0}, branch {1}", contextTitle, workspaceInfo.branch)
			: contextTitle;
		const accessibleTitle = accessibleTitleWithBranch
			? localize('agentSessionsShowSessionsWithTitle', "Show Sessions: {0}", accessibleTitleWithBranch)
			: localize('agentSessionsShowSessions', "Show Sessions");
		container.setAttribute('aria-label', attentionReminderLabel
			? localize('agentSessionsShowSessionsWithAttention', "{0}. {1}", accessibleTitle, attentionReminderLabel)
			: accessibleTitle);

		// Session pill: workspace icon + label
		const sessionPill = $('div.agent-sessions-titlebar-pill');

		// Center group: workspace icon and name
		const centerGroup = $('div.agent-sessions-titlebar-center');

		if (contextTitle) {
			const workspaceGroup = $('div.agent-sessions-titlebar-workspace-group');
			if (workspaceInfo) {
				const workspaceIconEl = $(`div.agent-sessions-titlebar-workspace-icon${ThemeIcon.asCSSSelector(workspaceInfo.icon)}`, { 'aria-hidden': 'true' });
				workspaceGroup.appendChild(workspaceIconEl);
			} else if (this._isQuickChat) {
				const workspaceIconEl = $(`div.agent-sessions-titlebar-workspace-icon${ThemeIcon.asCSSSelector(Codicon.commentDiscussion)}`, { 'aria-hidden': 'true' });
				workspaceGroup.appendChild(workspaceIconEl);
			}

			const workspaceEl = $('div.agent-sessions-titlebar-workspace');
			workspaceEl.textContent = contextTitle;
			workspaceGroup.appendChild(workspaceEl);
			centerGroup.appendChild(workspaceGroup);
			this._dynamicDisposables.add(this.hoverService.setupManagedHover(
				this.options.hoverDelegate ?? getDefaultHoverDelegate('element'),
				workspaceEl,
				() => workspaceEl.scrollWidth > workspaceEl.clientWidth ? contextTitle : undefined,
			));
		}

		if (workspaceInfo?.branch) {
			const separatorEl = $('span.agent-sessions-titlebar-separator', { 'aria-hidden': 'true' });
			separatorEl.textContent = '·';
			centerGroup.appendChild(separatorEl);

			const branchGroup = $('div.agent-sessions-titlebar-branch-group');
			const branchIconEl = $(`div.agent-sessions-titlebar-branch-icon${ThemeIcon.asCSSSelector(Codicon.gitBranchCompact)}`, { 'aria-hidden': 'true' });
			branchGroup.appendChild(branchIconEl);

			const branchEl = $('div.agent-sessions-titlebar-branch');
			branchEl.textContent = workspaceInfo.branch;
			branchGroup.appendChild(branchEl);
			centerGroup.appendChild(branchGroup);
			this._dynamicDisposables.add(this.hoverService.setupManagedHover(
				this.options.hoverDelegate ?? getDefaultHoverDelegate('element'),
				branchEl,
				() => branchEl.scrollWidth > branchEl.clientWidth ? workspaceInfo.branch : undefined,
			));
		}

		sessionPill.appendChild(centerGroup);
		if (attentionReminderLabel) {
			const attentionMarker = $('div.agent-sessions-titlebar-attention-reminder', { 'aria-hidden': 'true' });
			append(attentionMarker, $(`span.agent-sessions-titlebar-attention-reminder-icon${ThemeIcon.asCSSSelector(sessionAttentionReminderIcon)}`));
			if (reminderCount > 1) {
				const attentionCount = append(attentionMarker, $('span.agent-sessions-titlebar-attention-reminder-count'));
				attentionCount.textContent = String(reminderCount);
			}
			append(sessionPill, attentionMarker);
			this._dynamicDisposables.add(this.hoverService.setupDelayedHover(attentionMarker, { content: attentionReminderLabel, style: HoverStyle.Pointer }));
		}

		// Click handler on pill
		this._dynamicDisposables.add(addDisposableGenericMouseDownListener(sessionPill, (e) => {
			e.preventDefault();
			e.stopPropagation();
		}));
		this._dynamicDisposables.add(addDisposableListener(sessionPill, EventType.CLICK, (e) => {
			e.preventDefault();
			e.stopPropagation();
			this._toggleCommandCenterDropdown();
		}));

		container.appendChild(sessionPill);

		// Keyboard handler
		this._dynamicDisposables.add(addDisposableListener(container, EventType.KEY_DOWN, (e: KeyboardEvent) => {
			if (e.key === 'Enter' || e.key === ' ') {
				e.preventDefault();
				e.stopPropagation();
				this._toggleCommandCenterDropdown();
			}
		}));
	}

	private _getCommandCenterTitle(): string | undefined {
		const title = this._sessionTitle ?? this._workspaceInfo?.label;
		if (title || !this._isQuickChat) {
			return title;
		}

		const session = this._windowHost.session.get();
		const provider = session ? this.sessionsProvidersService.getProvider(session.providerId, session.sessionId) : undefined;
		return provider && isAgentHostProvider(provider) && provider.remoteAddress
			? localize('noWorkspaceOnRemoteHost', "No workspace [{0}]", provider.label)
			: localize('noWorkspace', "No workspace");
	}

	/**
	 * Render the requires-input pill. Clicking toggles a dropdown that lists the
	 * blocked sessions below the command center box.
	 */
	private _renderRequiresInput(count: number, kind: RequiresInputKind | undefined, shouldBlink: boolean): void {
		const container = this._container!;
		const label = this._blockedIndicator.getRequiresInputLabel(count, kind);
		container.setAttribute('aria-label', label);

		const pill = $('div.agent-sessions-titlebar-pill');
		const labelEl = $('div.agent-sessions-titlebar-requires-input-label');
		labelEl.textContent = label;
		pill.appendChild(labelEl);

		this._dynamicDisposables.add(addDisposableGenericMouseDownListener(pill, (e) => {
			e.preventDefault();
			e.stopPropagation();
		}));
		this._dynamicDisposables.add(addDisposableListener(pill, EventType.CLICK, (e) => {
			e.preventDefault();
			e.stopPropagation();
			this._toggleCommandCenterDropdown();
		}));

		container.appendChild(pill);

		this._dynamicDisposables.add(addDisposableListener(container, EventType.KEY_DOWN, (e: KeyboardEvent) => {
			if (e.key === 'Enter' || e.key === ' ') {
				e.preventDefault();
				e.stopPropagation();
				this._toggleCommandCenterDropdown();
			}
		}));

		if (shouldBlink) {
			this._triggerAttentionBlink();
		}
	}

	/**
	 * Render the transient green "Approved N sessions" confirmation shown briefly
	 * after the user approves one or more sessions' pending actions from the list.
	 */
	private _renderApproved(count: number): void {
		const container = this._container!;
		const label = count === 1
			? localize('oneSessionApproved', "Approved 1 session")
			: localize('nSessionsApproved', "Approved {0} sessions", count);
		container.setAttribute('aria-label', label);

		const pill = $('div.agent-sessions-titlebar-pill');
		const labelEl = $('div.agent-sessions-titlebar-approved-label');
		labelEl.textContent = label;
		pill.appendChild(labelEl);

		// The confirmation is transient but stays clickable: clicking does whatever
		// the widget's underlying (non-approved) state would do.
		this._dynamicDisposables.add(addDisposableGenericMouseDownListener(pill, (e) => {
			e.preventDefault();
			e.stopPropagation();
		}));
		this._dynamicDisposables.add(addDisposableListener(pill, EventType.CLICK, (e) => {
			e.preventDefault();
			e.stopPropagation();
			this._activateDefaultAction();
		}));

		container.appendChild(pill);

		this._dynamicDisposables.add(addDisposableListener(container, EventType.KEY_DOWN, (e: KeyboardEvent) => {
			if (e.key === 'Enter' || e.key === ' ') {
				e.preventDefault();
				e.stopPropagation();
				this._activateDefaultAction();
			}
		}));
	}

	/**
	 * Activate the widget as its non-approved state would by toggling the
	 * command-center sessions dropdown.
	 */
	private _activateDefaultAction(): void {
		this._toggleCommandCenterDropdown();
	}

	/**
	 * Restart the attention blink animation on the command center box. Re-adding
	 * the class after a forced reflow guarantees the CSS animation replays even
	 * when the container element persists across renders.
	 */
	private _triggerAttentionBlink(): void {
		const container = this._container;
		if (!container) {
			return;
		}
		container.classList.remove('agent-sessions-titlebar-blink');
		container.getBoundingClientRect(); // force reflow so the animation restarts
		container.classList.add('agent-sessions-titlebar-blink');
		// Own the listener outside `_dynamicDisposables` (cleared on every render) so a
		// redundant re-render can't drop it before the animation finishes.
		this._blinkListener.value = addDisposableListener(container, 'animationend', () => {
			container.classList.remove('agent-sessions-titlebar-blink');
			this._blinkListener.clear();
		});
	}

	/**
	 * Pin an open hover preview, open a pinned dropdown, or close an already
	 * pinned dropdown.
	 */
	private _toggleCommandCenterDropdown(): void {
		if (this._openContextView) {
			if (this._dropdownPinned) {
				this._closeCommandCenterDropdown();
			} else {
				this._cancelDropdownCloseAnimation();
				this._dropdownPinned = true;
				this._hideDropdownScheduler.cancel();
				this._commandCenterList?.focus();
			}
			return;
		}
		this._showCommandCenterDropdown(true);
	}

	/**
	 * Show sessions as a flat list in a dropdown anchored below the command center.
	 * Hover previews preserve focus; click and keyboard activation pin the dropdown
	 * and move focus into the list.
	 */
	private _showCommandCenterDropdown(pinned: boolean): void {
		const container = this._container;
		if (!container || this._openContextView || (!pinned && this._contextMenuVisible)) {
			return;
		}
		this._showDropdownScheduler.cancel();
		this._hideDropdownScheduler.cancel();

		const { kind, sessions } = this._getCommandCenterDropdownContent();
		if (sessions.length === 0) {
			if (pinned) {
				this._showSessionsPicker();
			}
			return;
		}

		const width = this._computeBlockedDropdownWidth(container);
		const targetWindow = getWindow(container);
		const windowContainer = this.layoutService.getContainer(targetWindow);
		const activeElement = targetWindow.document.activeElement;
		this._focusToReturn = isHTMLElement(activeElement) ? activeElement : undefined;
		this._dropdownPinned = pinned;
		this.hoverService.hideHover(true);

		const store = new DisposableStore();
		this._openContextView = this.contextViewService.showContextView({
			getAnchor: () => this._getCommandCenterDropdownAnchor(container),
			anchorAlignment: AnchorAlignment.LEFT,
			anchorPosition: AnchorPosition.BELOW,
			render: (viewContainer): IDisposable => {
				this._dropdownContainer = viewContainer;
				this._renderCommandCenterList(viewContainer, kind, sessions, width);

				store.add(EventUtils.filter(this.layoutService.onDidLayoutContainer, event => event.container === windowContainer)(() => {
					this._commandCenterList?.setWidth(this._computeBlockedDropdownWidth(container));
					this.contextViewService.layout();
				}));

				store.add(this.quickInputService.onShow(() => this._openContextView?.close()));
				store.add(addDisposableListener(viewContainer, EventType.MOUSE_ENTER, () => {
					this._pointerOverDropdown = true;
					this._hideDropdownScheduler.cancel();
					this._cancelDropdownCloseAnimation();
				}));
				store.add(addDisposableListener(viewContainer, EventType.MOUSE_LEAVE, () => {
					this._pointerOverDropdown = false;
					this._scheduleDropdownPreviewHide();
				}));
				const focusTracker = store.add(trackFocus(viewContainer));
				store.add(focusTracker.onDidFocus(() => this._hideDropdownScheduler.cancel()));
				store.add(focusTracker.onDidBlur(() => this._scheduleDropdownPreviewHide()));
				store.add(addDisposableListener(targetWindow, EventType.BLUR, () => this._openContextView?.close()));

				return store;
			},
			focus: pinned ? () => this._commandCenterList?.focus() : undefined,
			onDOMEvent: (event: Event | StandardMouseEvent) => {
				if (!(event instanceof StandardMouseEvent) || event.browserEvent.type !== EventType.CLICK) {
					return;
				}
				const path = event.browserEvent.composedPath();
				if (!path.includes(this._dropdownContainer!) && !path.includes(container)) {
					this._closeCommandCenterDropdown();
				}
			},
			onHide: () => {
				const restoreFocus = !!this._dropdownContainer?.contains(targetWindow.document.activeElement);
				this._commandCenterDropdownVisibleContext.set(false);
				this._closeDropdownAnimation.clear();
				this._commandCenterListDisposables.clear();
				store.dispose();
				this._openContextView = undefined;
				closeOpenCommandCenterSessionsView = undefined;
				this._commandCenterList = undefined;
				this._openDropdownKind = undefined;
				this._dropdownContainer = undefined;
				this._dropdownPinned = false;
				this._pointerOverDropdown = false;
				this._pointerOverSessionHover = false;
				this._updateDropdownPresentation();
				if (restoreFocus && this._focusToReturn?.isConnected && this._focusToReturn.ownerDocument === targetWindow.document) {
					this._focusToReturn.focus();
				}
				this._focusToReturn = undefined;
			},
		}, windowContainer);

		closeOpenCommandCenterSessionsView = () => this._closeCommandCenterDropdown();
		this._commandCenterDropdownVisibleContext.set(true);
		this._updateDropdownPresentation();
	}

	private _getCommandCenterDropdownContent(): { readonly kind: CommandCenterDropdownKind; readonly sessions: readonly ISession[] } {
		if (this._blockedIndicator.unacknowledgedBlockedSessions.get().length > 0) {
			return {
				kind: 'blocked',
				sessions: this._blockedIndicator.blockedSessions.get().map(entry => entry.session),
			};
		}
		return { kind: 'sessions', sessions: this._commandCenterSessions.get() };
	}

	private _refreshOpenCommandCenterDropdown(): void {
		const viewContainer = this._dropdownContainer;
		const anchor = this._container;
		if (!this._openContextView || !viewContainer || !anchor) {
			return;
		}
		const { kind, sessions } = this._getCommandCenterDropdownContent();
		if (sessions.length === 0) {
			this._openContextView.close();
			return;
		}
		if (kind !== this._openDropdownKind) {
			this._renderCommandCenterList(viewContainer, kind, sessions, this._computeBlockedDropdownWidth(anchor));
		} else {
			this._commandCenterList?.setSessions(sessions);
		}
		this.contextViewService.layout();
	}

	private _renderCommandCenterList(viewContainer: HTMLElement, kind: CommandCenterDropdownKind, sessions: readonly ISession[], width: number): void {
		const restoreFocus = !!this._commandCenterList && viewContainer.contains(viewContainer.ownerDocument.activeElement);
		this._commandCenterListDisposables.clear();
		reset(viewContainer);
		const store = new DisposableStore();
		this._commandCenterListDisposables.value = store;
		const commonOptions = {
			width,
			activeSession: this._activeSession,
			onSessionOpen: (resource: URI, preserveFocus: boolean, sideBySide: boolean) => {
				this._openContextView?.close();
				this._openBlockedSession(resource, preserveFocus, sideBySide);
			},
			onShowAllSessions: () => {
				this._openContextView?.close();
				this._showSessionsPicker();
			},
			onDidChangeSessionHoverVisibility: (visible: boolean) => {
				this._pointerOverSessionHover = visible;
				if (visible) {
					this._hideDropdownScheduler.cancel();
					this._cancelDropdownCloseAnimation();
				} else {
					this._scheduleDropdownPreviewHide();
				}
			},
			onClose: () => this._closeCommandCenterDropdown(),
		};
		const list = kind === 'blocked'
			? store.add(this.instantiationService.createInstance(BlockedSessionsList, viewContainer, {
				...commonOptions,
				approvalModel: this._blockedIndicator.approvalModel,
				ciFixModel: this._blockedIndicator.ciFixModel,
				onIgnoreSession: session => this._blockedIndicator.ignoreSession(session),
				onIgnoreAllSessions: () => this._blockedIndicator.ignoreAllSessions(),
			}))
			: store.add(this.instantiationService.createInstance(SessionsCommandCenterList, viewContainer, commonOptions));
		list.setSessions(sessions);
		store.add(list.onDidChangeContentHeight(() => this.contextViewService.layout()));
		store.add(list.onDidApproveSession(approved => {
			this._blockedIndicator.dismissApproval(approved);
			this._sessionActionFeedback.notifyApproved();
		}));
		this._commandCenterList = list;
		this._openDropdownKind = kind;
		if (restoreFocus) {
			list.focus();
		}
	}

	private _getCommandCenterSessions(reader: IReader): readonly ISession[] {
		const { recent, other } = this.sessionsService.getRecentlyOpenedSessions();
		const groups = groupSessionsForPicker(recent, other, reader);
		const ordered = [...groups.needsInput, ...groups.unread, ...groups.recent, ...groups.other];
		const preview = ordered.slice(0, COMMAND_CENTER_PREVIEW_MAX_SESSIONS);
		const activeSessionId = this._activeSession.read(reader)?.sessionId;
		const activeSession = activeSessionId ? ordered.find(session => session.sessionId === activeSessionId) : undefined;
		if (!activeSession || preview.some(session => session.sessionId === activeSessionId)) {
			return preview;
		}
		return [...preview.slice(0, -1), activeSession];
	}

	private _scheduleDropdownPreviewHide(): void {
		if (this._openContextView && !this._dropdownPinned && !this._pointerOverAnchor && !this._pointerOverDropdown && !this._pointerOverSessionHover && !this._dropdownContainer?.contains(this._dropdownContainer.ownerDocument.activeElement)) {
			this._hideDropdownScheduler.schedule();
		}
	}

	private _hideDropdownPreview(): void {
		if (this._openContextView && !this._dropdownPinned && !this._pointerOverAnchor && !this._pointerOverDropdown && !this._pointerOverSessionHover && !this._dropdownContainer?.contains(this._dropdownContainer.ownerDocument.activeElement)) {
			this._closeCommandCenterDropdown();
		}
	}

	private _closeCommandCenterDropdown(): void {
		const contextView = this._openContextView;
		if (!contextView || this._closeDropdownAnimation.value) {
			return;
		}

		const list = this._commandCenterList?.element;
		if (this.accessibilityService.isMotionReduced() || !list) {
			contextView.close();
			return;
		}

		list.classList.add(COMMAND_CENTER_DROPDOWN_CLOSING_CLASS);
		this._closeDropdownAnimation.value = disposableTimeout(() => {
			this._closeDropdownAnimation.clear();
			if (this._openContextView === contextView) {
				contextView.close();
			}
		}, COMMAND_CENTER_DROPDOWN_CLOSE_ANIMATION_DURATION);
	}

	private _cancelDropdownCloseAnimation(): void {
		this._closeDropdownAnimation.clear();
		this._commandCenterList?.element.classList.remove(COMMAND_CENTER_DROPDOWN_CLOSING_CLASS);
	}

	private _updateDropdownPresentation(): void {
		if (!this._container) {
			return;
		}
		const open = !!this._openContextView;
		this._container.setAttribute('aria-expanded', String(open));
		this._container.classList.toggle('agent-sessions-titlebar-dropdown-open', open);
	}

	/**
	 * Compute the width of the blocked-sessions dropdown: at least as wide as the
	 * command center box (the anchor) and {@link BLOCKED_DROPDOWN_MIN_WIDTH}, but
	 * never wider than {@link BLOCKED_DROPDOWN_MAX_WIDTH_RATIO} of the window so it
	 * stays within the viewport on narrow layouts.
	 */
	private _computeBlockedDropdownWidth(container: HTMLElement): number {
		const anchorWidth = getDomNodePagePosition(container).width;
		const windowWidth = getWindow(container).innerWidth;
		const minWidth = Math.max(anchorWidth, BLOCKED_DROPDOWN_MIN_WIDTH);
		const maxWidth = windowWidth * BLOCKED_DROPDOWN_MAX_WIDTH_RATIO;
		return Math.round(Math.min(minWidth, maxWidth));
	}

	/**
	 * Anchor the blocked-sessions dropdown so it is horizontally centered on the
	 * command center box. Because the dropdown can be wider than the box, we hand
	 * the context view a zero-width anchor positioned at the dropdown's target
	 * left edge (the box center minus half the dropdown width).
	 */
	private _getCommandCenterDropdownAnchor(container: HTMLElement): IAnchor {
		const position = getDomNodePagePosition(container);
		const width = this._computeBlockedDropdownWidth(container);
		const centerX = position.left + position.width / 2;
		return {
			x: Math.round(centerX - width / 2),
			y: position.top,
			width: 0,
			height: position.height,
		};
	}

	private _openBlockedSession(resource: URI, preserveFocus: boolean, sideBySide: boolean): void {
		// In a chat window, the session opens in that window, as one picked in its Sessions picker
		const chatWindow = getChatWindowOfHost(this._windowHost, this.chatWindowService);
		const session = chatWindow && this.sessionsManagementService.getSession(resource);
		if (chatWindow && session) {
			this.instantiationService.invokeFunction(accessor => openPickedSessionInChatWindow(accessor, session, chatWindow, { preserveFocus, toSide: sideBySide })).catch(onUnexpectedError);
			return;
		}
		if (sideBySide) {
			const session = this.sessionsManagementService.getSession(resource);
			if (session) {
				this.sessionsService.openSessionToSide(session, { preserveFocus, source: 'sessionsList', forceMainChat: true }).catch(onUnexpectedError);
				return;
			}
		}
		this.sessionsService.openSession(resource, { preserveFocus, source: 'sessionsList' }).catch(onUnexpectedError);
	}

	private _showSessionsPicker(): void {
		this.commandService.executeCommand(SHOW_SESSIONS_PICKER_COMMAND_ID);
	}
}

/**
 * Provides custom rendering for the sessions title bar widget
 * in the command center. Uses IActionViewItemService to render a custom widget
 * for the TitleBarControlMenu submenu.
 */
export class SessionsTitleBarContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.agentSessionsTitleBar';

	constructor(
		@IActionViewItemService actionViewItemService: IActionViewItemService,
		@IInstantiationService instantiationService: IInstantiationService,
		@ILogService logService: ILogService,
	) {
		super();

		// The command center rebuilds its action view items whenever its menu or
		// context keys change (e.g. opening the new-session view flips
		// `isNewChatSession`), which disposes and re-creates the widget. State that
		// must outlive those rebuilds — acknowledged blocked occurrences, the
		// requires-input models and the transient approval confirmation — is owned
		// here, not by the widget.
		const sessionActionFeedback = this._register(new SessionActionFeedback());
		const blockedIndicator = this._register(instantiationService.createInstance(BlockedSessionsIndicatorModel, undefined /* approvalModel */, undefined /* blockedSessions */, undefined /* ciFixModel */));

		this._register(registerSessionsTitleBarMenus());

		// The blocked-sessions dropdown header's "Show All Sessions" action dismisses
		// the dropdown (a transient context view) before opening the full sessions
		// picker, so the popup doesn't linger behind it.
		this._register(registerBlockedSessionsHeaderCommands());
		this._register(registerCommandCenterSessionsHeaderActions());
		this._register(registerBlockedSessionsHeaderActions());
		this._register(registerBlockedSessionsItemActions());

		this._register(actionViewItemService.register(AgentsWindowMenus.CommandCenter, AgentsWindowMenus.TitleBarSessionTitle, (action, options, scopedInstantiationService) => {
			if (!(action instanceof SubmenuItemAction)) {
				return undefined;
			}
			// Traced because each call means the command center threw the previous
			// widget away; the state above deliberately survives it.
			logService.trace('[SessionsTitleBar] creating the title bar widget');
			// Created in the title bar of its window, it shows the session of that window.
			return scopedInstantiationService.createInstance(SessionsTitleBarWidget, action, options, sessionActionFeedback, blockedIndicator);
		}, undefined));
	}
}

/**
 * The windows whose command center shows the session widget: the main window, and windows with layout modes, such as chat
 * windows, whose widget shows the session of their active chat.
 */
const sessionsTitleBarWindowContext = ContextKeyExpr.or(IsAuxiliaryWindowContext.negate(), LayoutModeContext)!;

export function registerSessionsTitleBarMenus(): IDisposable {
	return combinedDisposable(
		MenuRegistry.appendMenuItem(AgentsWindowMenus.CommandCenter, {
			submenu: AgentsWindowMenus.TitleBarSessionTitle,
			title: localize('agentSessionsControl', "Agent Sessions"),
			order: 101,
			when: ContextKeyExpr.and(sessionsTitleBarWindowContext, SessionsWelcomeVisibleContext.negate())
		}),
		MenuRegistry.appendMenuItem(AgentsWindowMenus.TitleBarSessionTitle, {
			command: {
				id: SHOW_SESSIONS_PICKER_COMMAND_ID,
				title: localize('showSessions', "Show Sessions"),
			},
			group: 'a_sessions',
			order: 1,
			when: sessionsTitleBarWindowContext
		})
	);
}

// Escape closes the command-center sessions dropdown while it is open. Registered
// as a high-weight keybinding scoped to its visible context rather than relying on
// focus being inside the dropdown.
KeybindingsRegistry.registerCommandAndKeybindingRule({
	id: HIDE_COMMAND_CENTER_SESSIONS_COMMAND_ID,
	weight: KeybindingWeight.SessionsContrib + 100,
	when: SessionsCommandCenterDropdownVisibleContext,
	primary: KeyCode.Escape,
	handler: (_accessor, context?: ICommandCenterSessionsHeaderActionContext) => {
		if (context) {
			context.close();
		} else {
			closeOpenCommandCenterSessionsView?.();
		}
	},
});
