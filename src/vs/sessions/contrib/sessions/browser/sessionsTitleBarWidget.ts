/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/sessionsTitleBarWidget.css';
import { $, addDisposableGenericMouseDownListener, addDisposableListener, EventType, getDomNodePagePosition, getWindow, isAncestor, reset } from '../../../../base/browser/dom.js';
import { combinedDisposable, Disposable, DisposableStore, IDisposable, MutableDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { KeyCode } from '../../../../base/common/keyCodes.js';
import { localize } from '../../../../nls.js';
import { BaseActionViewItem, IBaseActionViewItemOptions } from '../../../../base/browser/ui/actionbar/actionViewItems.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { MenuRegistry, SubmenuItemAction } from '../../../../platform/actions/common/actions.js';
import { ContextKeyExpr, IContextKey, IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { KeybindingsRegistry, KeybindingWeight } from '../../../../platform/keybinding/common/keybindingsRegistry.js';
import { CommandsRegistry, ICommandService } from '../../../../platform/commands/common/commands.js';
import { Menus } from '../../../browser/menus.js';
import { IWorkbenchContribution } from '../../../../workbench/common/contributions.js';
import { IActionViewItemService } from '../../../../platform/actions/browser/actionViewItemService.js';
import { autorun } from '../../../../base/common/observable.js';
import { onUnexpectedError } from '../../../../base/common/errors.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { URI } from '../../../../base/common/uri.js';
import { AnchorAlignment, AnchorPosition, IAnchor } from '../../../../base/common/layout.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { IContextViewService, IOpenContextView } from '../../../../platform/contextview/browser/contextView.js';
import { IQuickInputService } from '../../../../platform/quickinput/common/quickInput.js';
import { IsAuxiliaryWindowContext } from '../../../../workbench/common/contextkeys.js';
import { IWorkbenchLayoutService } from '../../../../workbench/services/layout/browser/layoutService.js';
import { SessionsBlockedSessionsVisibleContext, SessionsWelcomeVisibleContext } from '../../../common/contextkeys.js';
import { ISessionsProvidersService } from '../../../services/sessions/browser/sessionsProvidersService.js';
import { SHOW_SESSIONS_PICKER_COMMAND_ID } from './sessionsActions.js';
import { ISessionsManagementService } from '../../../services/sessions/common/sessionsManagement.js';
import { ISessionsService } from '../../../services/sessions/browser/sessionsService.js';
import { getUntitledSessionTitle } from '../../../services/sessions/common/session.js';
import { BlockedSessions } from '../../blockedSessions/browser/blockedSessions.js';
import { BlockedSessionsList, IBlockedSessionsHeaderActionContext, registerBlockedSessionsItemActions } from './blockedSessionsList.js';
import { BlockedSessionsCIFixModel } from './blockedSessionsCIFixModel.js';
import { SessionActionFeedback } from './sessionActionFeedback.js';
import { AgentSessionApprovalModel } from '../../../../workbench/contrib/chat/browser/agentSessions/agentSessionApprovalModel.js';
import { BlockedSessionsIndicatorModel, RequiresInputKind } from './blockedSessionsIndicatorModel.js';
import { openSessionToTheSide } from './views/sessionsView.js';

/**
 * Internal command behind the blocked-sessions dropdown header's "Show All
 * Sessions" action: it dismisses the dropdown (a transient context view) before
 * opening the full sessions picker so the popup doesn't linger behind it.
 */
const SHOW_ALL_SESSIONS_FROM_BLOCKED_LIST_COMMAND_ID = 'sessions.blockedSessions.showAllSessions';

/** Internal command behind the blocked-sessions dropdown header's bulk-ignore action. */
const IGNORE_ALL_INPUT_NEEDED_COMMAND_ID = 'sessions.blockedSessions.ignoreAllInputNeeded';

/**
 * Internal command that dismisses the blocked-sessions dropdown. Bound to Escape
 * (scoped to {@link SessionsBlockedSessionsVisibleContext}) so the dropdown can
 * be closed from anywhere in the sessions window while it is open, not only when
 * focus happens to be inside it.
 */
const HIDE_BLOCKED_SESSIONS_COMMAND_ID = 'sessions.blockedSessions.hide';

/** Register the actions shown in the blocked-sessions dropdown header toolbar. */
export function registerBlockedSessionsHeaderActions(): IDisposable {
	return combinedDisposable(
		MenuRegistry.appendMenuItem(Menus.BlockedSessionsHeader, {
			command: {
				id: SHOW_ALL_SESSIONS_FROM_BLOCKED_LIST_COMMAND_ID,
				title: localize('showAllSessions', "Show All Sessions"),
				icon: Codicon.listSelection,
			},
			group: 'navigation',
			order: 1,
		}),
		MenuRegistry.appendMenuItem(Menus.BlockedSessionsHeader, {
			command: {
				id: IGNORE_ALL_INPUT_NEEDED_COMMAND_ID,
				title: localize('ignoreAllInputNeeded', "Ignore All Input Needed"),
				icon: Codicon.bellSlash,
			},
			group: 'navigation',
			order: 2,
		}),
		MenuRegistry.appendMenuItem(Menus.BlockedSessionsHeader, {
			command: {
				id: HIDE_BLOCKED_SESSIONS_COMMAND_ID,
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
		CommandsRegistry.registerCommand(SHOW_ALL_SESSIONS_FROM_BLOCKED_LIST_COMMAND_ID, (_accessor, context: IBlockedSessionsHeaderActionContext) => {
			context.showAllSessions();
		}),
		CommandsRegistry.registerCommand(IGNORE_ALL_INPUT_NEEDED_COMMAND_ID, (_accessor, context: IBlockedSessionsHeaderActionContext) => {
			context.ignoreAllSessions();
		}),
	);
}

/**
 * The currently-open blocked-sessions dropdown, shared with the Escape command so
 * it closes this specific context view.
 */
let openBlockedSessionsView: IOpenContextView | undefined;

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
 * Sessions Title Bar Widget - renders the active chat session
 * in the command center of the agent sessions workbench.
 *
 * Shows the current chat session as a clickable pill with:
 * - Kind icon at the beginning (provider type icon)
 * - Repository folder name and active branch/worktree name when available
 *
 * When at least one session is blocked (needs input or has failing CI checks),
 * the widget instead adopts an orange "N sessions require input" state and reveals those sessions as a
 * flat list in a dropdown anchored below the command center box. A short blink
 * animation plays whenever a new session becomes blocked. In every other case it
 * behaves as the active-session pill and opens the sessions picker on click.
 *
 * The requires-input logic (which blocked sessions to surface, the homogeneous
 * reason, labels and when to blink) is owned by {@link BlockedSessionsIndicatorModel};
 * this widget only renders it.
 *
 * Session actions (changes, terminal, etc.) are rendered via the
 * SessionTitleActions menu toolbar next to this widget.
 */
export class SessionsTitleBarWidget extends BaseActionViewItem {

	private _container: HTMLElement | undefined;
	private readonly _dynamicDisposables = this._register(new DisposableStore());

	/** Owns the blink animation's `animationend` listener, kept across re-renders. */
	private readonly _blinkListener = this._register(new MutableDisposable());

	/** Cached render state to avoid unnecessary DOM rebuilds */
	private _lastRenderState: string | undefined;

	/** Guard to prevent re-entrant rendering */
	private _isRendering = false;

	/** Model behind the "N sessions require input" indicator (blocked-session set, blink, labels). */
	private readonly _blockedIndicator: BlockedSessionsIndicatorModel;

	/** The currently open blocked-sessions dropdown, if any. */
	private _openContextView: IOpenContextView | undefined;
	/** The blocked-sessions list rendered inside the open dropdown, if any. */
	private _blockedList: BlockedSessionsList | undefined;

	/** Tracks whether the blocked-sessions dropdown is open (drives the Escape keybinding). */
	private readonly _blockedSessionsVisibleContext: IContextKey<boolean>;

	/** Drives the transient "Approved N sessions" confirmation. Owned by the widget. */
	private readonly _sessionActionFeedback: SessionActionFeedback;

	constructor(
		action: SubmenuItemAction,
		options: IBaseActionViewItemOptions | undefined,
		sessionActionFeedback: SessionActionFeedback | undefined,
		approvalModel: AgentSessionApprovalModel | undefined,
		blockedSessions: BlockedSessions | undefined,
		ciFixModel: BlockedSessionsCIFixModel | undefined,
		@ISessionsManagementService private readonly sessionsManagementService: ISessionsManagementService,
		@ISessionsService private readonly sessionsService: ISessionsService,
		@ISessionsProvidersService private readonly sessionsProvidersService: ISessionsProvidersService,
		@ICommandService private readonly commandService: ICommandService,
		@IContextViewService private readonly contextViewService: IContextViewService,
		@IWorkbenchLayoutService private readonly layoutService: IWorkbenchLayoutService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IQuickInputService private readonly quickInputService: IQuickInputService,
	) {
		super(undefined, action, options);

		this._blockedSessionsVisibleContext = SessionsBlockedSessionsVisibleContext.bindTo(contextKeyService);

		// The widget owns the approval-feedback state; the optional parameter is a
		// test seam so fixtures can supply a preset instance.
		this._sessionActionFeedback = sessionActionFeedback ?? this._register(new SessionActionFeedback());

		// The blocked-session indicator model owns the requires-input logic (the
		// visible-filtered blocked set, the requires-input kind, optimistic approval
		// dismissals, labels and blink detection). The optional `approvalModel`,
		// `blockedSessions` and `ciFixModel` are test seams forwarded to it so
		// fixtures can preset them.
		this._blockedIndicator = this._register(this.instantiationService.createInstance(BlockedSessionsIndicatorModel, approvalModel, blockedSessions, ciFixModel));

		// Replay the attention blink when the model reports a genuinely new, not-yet-
		// visible block. Invalidate the cached render state so the identical pill is
		// rebuilt with the blink class (see `_render`).
		this._register(this._blockedIndicator.onDidRequestBlink(() => {
			this._lastRenderState = undefined;
			this._render();
		}));

		// Re-render when the active session's title, workspace, or quick-chat kind changes
		this._register(autorun(reader => {
			const sessionData = this.sessionsService.activeSession.read(reader);
			if (sessionData) {
				sessionData.title.read(reader);
				sessionData.workspace.read(reader);
				sessionData.isQuickChat?.read(reader);
			}
			this._lastRenderState = undefined;
			this._render();
		}));

		// Re-render when the set of blocked sessions changes; it feeds the
		// "N sessions require input" state. Keep an open dropdown in sync.
		this._register(autorun(reader => {
			const blocked = this._blockedIndicator.blockedSessions.read(reader);
			this._sessionActionFeedback.approvedCount.read(reader);
			this._blockedIndicator.requiresInputKind.read(reader);
			if (this._openContextView && this._blockedList) {
				this._blockedList.setSessions(blocked.map(entry => entry.session));
				this.contextViewService.layout();
			}
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

		// Ensure any open dropdown is closed when the widget is disposed.
		this._register(toDisposable(() => this._openContextView?.close()));
	}

	override render(container: HTMLElement): void {
		super.render(container);

		this._container = container;
		container.classList.add('agent-sessions-titlebar-container');

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
			const requiresInput = blockedCount > 0;

			// The transient "Approved N sessions" confirmation takes precedence over the
			// requires-input state while it is showing.
			const showApproved = approvedCount > 0;
			const showRequiresInput = requiresInput && !showApproved;

			// The attention blink fires only when the indicator model reports a
			// *genuinely new* blocked session while the requires-input state is shown —
			// including the very first one. `consumePendingBlink` is short-circuited so
			// the pending blink is only consumed when it actually plays; navigating
			// between sessions (which changes the visible set, not the model) never blinks.
			const shouldBlink = showRequiresInput && this._blockedIndicator.consumePendingBlink();

			const requiresInputKind = this._blockedIndicator.requiresInputKind.get();

			let renderState: string;
			if (showApproved) {
				renderState = `approved|${approvedCount}`;
			} else if (showRequiresInput) {
				renderState = `blocked|${blockedCount}|${requiresInputKind ?? 'mixed'}`;
			} else {
				const icon = this._getActiveSessionIcon();
				const sessionTitle = this._getSessionTitle() ?? getUntitledSessionTitle(this.sessionsService.activeSession.get()?.isQuickChat?.get() ?? false);
				const workspaceLabel = this._getRepositoryLabel();
				renderState = `normal|${icon?.id ?? ''}|${sessionTitle ?? ''}|${workspaceLabel ?? ''}`;
			}

			// Skip re-render if state hasn't changed
			if (this._lastRenderState === renderState) {
				return;
			}
			this._lastRenderState = renderState;

			// Close the open blocked-sessions dropdown only when there are no blocked
			// sessions left to show. Note this keys off `requiresInput`, not
			// `showRequiresInput`: approving a session shows the transient green state
			// (suppressing `showRequiresInput`) but the dropdown must stay open while
			// other sessions remain blocked — it just drops the approved row.
			if (!requiresInput && this._openContextView) {
				this._openContextView.close();
			}

			// Clear existing content
			reset(this._container);
			this._dynamicDisposables.clear();

			// Set up container as the button directly
			this._container.removeAttribute('aria-hidden');
			this._container.setAttribute('role', 'button');
			this._container.tabIndex = 0;
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
				this._renderActiveSession();
			}
		} finally {
			this._isRendering = false;
		}
	}

	/**
	 * Render the active-session pill: icon + title + workspace. Clicking opens the
	 * sessions picker.
	 */
	private _renderActiveSession(): void {
		const container = this._container!;
		container.setAttribute('aria-label', localize('agentSessionsShowSessions', "Show Sessions"));

		const icon = this._getActiveSessionIcon();
		const sessionTitle = this._getSessionTitle() ?? getUntitledSessionTitle(this.sessionsService.activeSession.get()?.isQuickChat?.get() ?? false);
		const workspaceLabel = this._getRepositoryLabel();

		// Session pill: icon + title + workspace together
		const sessionPill = $('div.agent-sessions-titlebar-pill');

		// Center group: icon + title + workspace name
		const centerGroup = $('div.agent-sessions-titlebar-center');

		// Kind icon at the beginning
		if (icon) {
			const iconEl = $('div.agent-sessions-titlebar-icon' + ThemeIcon.asCSSSelector(icon));
			centerGroup.appendChild(iconEl);
		}

		// Session title shown next to the icon
		if (sessionTitle) {
			const titleEl = $('div.agent-sessions-titlebar-title');
			titleEl.textContent = sessionTitle;
			centerGroup.appendChild(titleEl);
		}

		// Workspace name shown after the session title
		if (workspaceLabel) {
			const separatorEl = $('div.agent-sessions-titlebar-separator');
			centerGroup.appendChild(separatorEl);

			const workspaceEl = $('div.agent-sessions-titlebar-workspace');
			workspaceEl.textContent = workspaceLabel;
			centerGroup.appendChild(workspaceEl);
		}

		sessionPill.appendChild(centerGroup);

		// Click handler on pill
		this._dynamicDisposables.add(addDisposableGenericMouseDownListener(sessionPill, (e) => {
			e.preventDefault();
			e.stopPropagation();
		}));
		this._dynamicDisposables.add(addDisposableListener(sessionPill, EventType.CLICK, (e) => {
			e.preventDefault();
			e.stopPropagation();
			this._showSessionsPicker();
		}));

		container.appendChild(sessionPill);

		// Keyboard handler
		this._dynamicDisposables.add(addDisposableListener(container, EventType.KEY_DOWN, (e: KeyboardEvent) => {
			if (e.key === 'Enter' || e.key === ' ') {
				e.preventDefault();
				e.stopPropagation();
				this._showSessionsPicker();
			}
		}));
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
			this._toggleBlockedSessions();
		}));

		container.appendChild(pill);

		this._dynamicDisposables.add(addDisposableListener(container, EventType.KEY_DOWN, (e: KeyboardEvent) => {
			if (e.key === 'Enter' || e.key === ' ') {
				e.preventDefault();
				e.stopPropagation();
				this._toggleBlockedSessions();
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
	 * Activate the widget as its non-approved state would: reveal the blocked
	 * sessions when the requires-input state applies, otherwise the sessions picker.
	 */
	private _activateDefaultAction(): void {
		const requiresInput = this._blockedIndicator.blockedSessions.get().length > 0;
		if (requiresInput) {
			this._toggleBlockedSessions();
		} else {
			this._showSessionsPicker();
		}
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
	 * Toggle the blocked-sessions dropdown open/closed.
	 */
	private _toggleBlockedSessions(): void {
		if (this._openContextView) {
			this._openContextView.close();
			return;
		}
		this._showBlockedSessions();
	}

	/**
	 * Show the blocked sessions as a flat list in a dropdown anchored below the
	 * command center box.
	 */
	private _showBlockedSessions(): void {
		const container = this._container;
		if (!container) {
			return;
		}
		if (this._blockedIndicator.blockedSessions.get().length === 0) {
			return;
		}

		// Match the dropdown width to the command center box it hangs off, but keep
		// it within a sensible min/max so it stays readable on wide layouts and
		// doesn't overflow on narrow ones.
		const width = this._computeBlockedDropdownWidth(container);

		const store = new DisposableStore();
		this._openContextView = this.contextViewService.showContextView({
			getAnchor: () => this._getBlockedDropdownAnchor(container),
			anchorAlignment: AnchorAlignment.LEFT,
			anchorPosition: AnchorPosition.BELOW,
			render: (viewContainer): IDisposable => {
				const list = store.add(this.instantiationService.createInstance(BlockedSessionsList, viewContainer, {
					width,
					approvalModel: this._blockedIndicator.approvalModel,
					ciFixModel: this._blockedIndicator.ciFixModel,
					onSessionOpen: (resource, preserveFocus, sideBySide) => {
						this._openContextView?.close();
						this._openBlockedSession(resource, preserveFocus, sideBySide);
					},
					onIgnoreSession: session => this._blockedIndicator.ignoreSession(session),
					onShowAllSessions: () => {
						this._openContextView?.close();
						this._showSessionsPicker();
					},
					onIgnoreAllSessions: () => this._blockedIndicator.ignoreAllSessions(),
					onClose: () => this._openContextView?.close(),
				}));
				list.setSessions(this._blockedIndicator.blockedSessions.get().map(entry => entry.session));
				store.add(list.onDidChangeContentHeight(() => this.contextViewService.layout()));
				store.add(list.onDidApproveSession(approved => {
					this._blockedIndicator.dismissApproval(approved);
					this._sessionActionFeedback.notifyApproved();
				}));

				// Keep the dropdown width matched to the command center box as the
				// window resizes (the command center reflows to a new width, and the
				// min/max clamp tracks the new window width).
				store.add(this.layoutService.onDidLayoutActiveContainer(() => {
					list.setWidth(this._computeBlockedDropdownWidth(container));
					this.contextViewService.layout();
				}));

				// Dismiss the dropdown when a quick pick opens on top of it (e.g. the
				// sessions picker), so it doesn't linger behind the quick input. Close
				// our specific context view rather than whatever happens to be open.
				store.add(this.quickInputService.onShow(() => this._openContextView?.close()));

				this._blockedList = list;
				return store;
			},
			focus: () => this._blockedList?.focus(),
			onDOMEvent: (e: Event) => {
				// Dismiss on a click outside the dropdown. Clicks on the anchor are
				// ignored here because the anchor toggles the dropdown itself. Escape
				// is handled by a dedicated high-weight keybinding (see
				// HIDE_BLOCKED_SESSIONS_COMMAND_ID) so it dismisses the dropdown even
				// when focus is outside of it.
				if (e.type === EventType.CLICK) {
					const target = e.target as HTMLElement | null;
					if (target
						&& !isAncestor(target, this.contextViewService.getContextViewElement())
						&& !isAncestor(target, container)) {
						this._openContextView?.close();
					}
				}
			},
			onHide: () => {
				this._blockedSessionsVisibleContext.set(false);
				store.dispose();
				this._openContextView = undefined;
				openBlockedSessionsView = undefined;
				this._blockedList = undefined;
			},
		});

		openBlockedSessionsView = this._openContextView;
		this._blockedSessionsVisibleContext.set(true);
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
	private _getBlockedDropdownAnchor(container: HTMLElement): IAnchor {
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
		if (sideBySide) {
			const session = this.sessionsManagementService.getSession(resource);
			if (session) {
				openSessionToTheSide(this.sessionsService, session, { preserveFocus }).catch(onUnexpectedError);
				return;
			}
		}
		this.sessionsService.openSession(resource, { preserveFocus }).catch(onUnexpectedError);
	}

	/**
	 * Get the icon for the active session's type.
	 */
	private _getActiveSessionIcon(): ThemeIcon | undefined {
		const sessionData = this.sessionsService.activeSession.get();
		if (sessionData) {
			return sessionData.icon;
		}
		return undefined;
	}

	/**
	 * Get the display title for the active session.
	 */
	private _getSessionTitle(): string | undefined {
		const sessionData = this.sessionsService.activeSession.get();
		return sessionData?.title.get()?.trim() || undefined;
	}

	/**
	 * Get the repository label for the active session.
	 */
	private _getRepositoryLabel(): string | undefined {
		const sessionData = this.sessionsService.activeSession.get();
		if (sessionData) {
			const workspace = sessionData.workspace.get();
			if (workspace) {
				return workspace.label;
			}
		}
		return undefined;
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
	) {
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

		// The blocked-sessions dropdown header's "Show All Sessions" action dismisses
		// the dropdown (a transient context view) before opening the full sessions
		// picker, so the popup doesn't linger behind it.
		this._register(registerBlockedSessionsHeaderCommands());
		this._register(registerBlockedSessionsHeaderActions());
		this._register(registerBlockedSessionsItemActions());

		this._register(actionViewItemService.register(Menus.CommandCenter, Menus.TitleBarSessionTitle, (action, options) => {
			if (!(action instanceof SubmenuItemAction)) {
				return undefined;
			}
			return instantiationService.createInstance(SessionsTitleBarWidget, action, options, undefined, undefined, undefined, undefined);
		}, undefined));
	}
}

// Escape closes the blocked-sessions dropdown while it is open. Registered as a
// high-weight keybinding scoped to `SessionsBlockedSessionsVisibleContext` (rather
// than relying on focus being inside the dropdown) so it reliably wins over other
// Escape handlers, mirroring how the quick pick scopes its dismiss keybinding to an
// "is visible" context key.
KeybindingsRegistry.registerCommandAndKeybindingRule({
	id: HIDE_BLOCKED_SESSIONS_COMMAND_ID,
	weight: KeybindingWeight.SessionsContrib + 100,
	when: SessionsBlockedSessionsVisibleContext,
	primary: KeyCode.Escape,
	handler: (_accessor, context?: IBlockedSessionsHeaderActionContext) => {
		if (context) {
			context.close();
		} else {
			openBlockedSessionsView?.close();
		}
	},
});
