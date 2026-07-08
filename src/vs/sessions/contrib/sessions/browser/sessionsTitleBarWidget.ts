/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/sessionsTitleBarWidget.css';
import { $, addDisposableGenericMouseDownListener, addDisposableListener, EventType, isAncestor, reset } from '../../../../base/browser/dom.js';
import { StandardKeyboardEvent } from '../../../../base/browser/keyboardEvent.js';
import { Disposable, DisposableStore, IDisposable, MutableDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { KeyCode } from '../../../../base/common/keyCodes.js';
import { localize } from '../../../../nls.js';
import { BaseActionViewItem, IBaseActionViewItemOptions } from '../../../../base/browser/ui/actionbar/actionViewItems.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IProductService } from '../../../../platform/product/common/productService.js';
import { MenuRegistry, SubmenuItemAction } from '../../../../platform/actions/common/actions.js';
import { ContextKeyExpr } from '../../../../platform/contextkey/common/contextkey.js';
import { CommandsRegistry, ICommandService } from '../../../../platform/commands/common/commands.js';
import { Menus } from '../../../browser/menus.js';
import { IWorkbenchContribution } from '../../../../workbench/common/contributions.js';
import { IActionViewItemService } from '../../../../platform/actions/browser/actionViewItemService.js';
import { autorun, derived, IObservable, IReader, observableValue } from '../../../../base/common/observable.js';
import { onUnexpectedError } from '../../../../base/common/errors.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { URI } from '../../../../base/common/uri.js';
import { AnchorAlignment, AnchorPosition } from '../../../../base/common/layout.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { IContextViewService, IOpenContextView } from '../../../../platform/contextview/browser/contextView.js';
import { IsAuxiliaryWindowContext } from '../../../../workbench/common/contextkeys.js';
import { IWorkbenchLayoutService } from '../../../../workbench/services/layout/browser/layoutService.js';
import { SessionsWelcomeVisibleContext } from '../../../common/contextkeys.js';
import { ISessionsProvidersService } from '../../../services/sessions/browser/sessionsProvidersService.js';
import { SHOW_SESSIONS_PICKER_COMMAND_ID } from './sessionsActions.js';
import { ISessionsManagementService } from '../../../services/sessions/common/sessionsManagement.js';
import { ISessionsService } from '../../../services/sessions/browser/sessionsService.js';
import { getUntitledSessionTitle } from '../../../services/sessions/common/session.js';
import { BlockedSessionReason, BlockedSessions, IBlockedSession } from '../../blockedSessions/browser/blockedSessions.js';
import { BlockedSessionsList } from './blockedSessionsList.js';
import { SessionActionFeedback } from './sessionActionFeedback.js';
import { AgentSessionApprovalKind, AgentSessionApprovalModel, agentSessionApprovalId } from '../../../../workbench/contrib/chat/browser/agentSessions/agentSessionApprovalModel.js';
import { getFirstApprovalAcrossChats, IApprovedSession } from './views/sessionsList.js';
import { openSessionToTheSide } from './views/sessionsView.js';

/**
 * Internal command behind the blocked-sessions dropdown header's "Show All
 * Sessions" action: it dismisses the dropdown (a transient context view) before
 * opening the full sessions picker so the popup doesn't linger behind it.
 */
const SHOW_ALL_SESSIONS_FROM_BLOCKED_LIST_COMMAND_ID = 'sessions.blockedSessions.showAllSessions';

/**
 * The specific reason a homogeneous set of blocked sessions needs attention,
 * used to render a more helpful requires-input message. `undefined` (a mix of
 * reasons, or an indeterminate one) falls back to the generic message.
 */
const enum RequiresInputKind {
	/** All sessions are waiting to run a terminal command. */
	TerminalApproval,
	/** All sessions are asking the user a question. */
	Question,
	/** All sessions have failing CI checks. */
	FailingCI,
	/** All sessions have unresolved pull request comments. */
	UnresolvedComments,
}

/**
 * Sessions Title Bar Widget - renders the active chat session
 * in the command center of the agent sessions workbench.
 *
 * Shows the current chat session as a clickable pill with:
 * - Kind icon at the beginning (provider type icon)
 * - Repository folder name and active branch/worktree name when available
 *
 * When at least one session is blocked (needs input, has failing CI checks, or
 * has unresolved pull request comments), the widget instead adopts an orange
 * "N sessions require input" state and, on click, reveals those sessions as a
 * flat list in a dropdown anchored below the command center box. A short blink
 * animation plays whenever a new session becomes blocked. In every other case it
 * behaves as the active-session pill and opens the sessions picker on click.
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

	/**
	 * Last observed blocked-session count, tracked on every render. Used to detect
	 * when a *new* blocked session pushes the count up so the attention blink only
	 * fires for genuinely new blocks.
	 */
	private _lastBlockedCount = 0;

	/**
	 * Blocked sessions that are NOT currently visible on screen. A session the
	 * user can already see doesn't need the titlebar indicator or a dropdown row,
	 * so it is excluded from both the "N sessions require input" count and the list.
	 */
	private readonly _blockedSessions: IObservable<readonly IBlockedSession[]>;

	/**
	 * The homogeneous reason the blocked sessions need attention (all terminal
	 * approvals, all failing CI, etc.), or `undefined` when they are a mix — which
	 * drives whether a specific or the generic requires-input message is shown.
	 */
	private readonly _requiresInputKind: IObservable<RequiresInputKind | undefined>;

	/** Tracks pending tool approvals per chat; distinguishes terminal vs question. */
	private readonly _approvalModel: AgentSessionApprovalModel;

	/** Computes the set of blocked sessions (needs input / failing CI / comments). */
	private readonly _blockedSessionsModel: BlockedSessions;

	/**
	 * Sessions whose current pending approval the user just allowed, keyed by
	 * `sessionId` → the approved approval's identity. Such a session is optimistically
	 * hidden from the blocked set until its approval resolves into a NEW distinct
	 * block (or it stops being blocked), so an approved row disappears immediately
	 * instead of lingering until the provider updates the session status.
	 */
	private readonly _dismissedApprovals = observableValue<ReadonlyMap<string, string>>('dismissedApprovals', new Map());

	/** The currently open blocked-sessions dropdown, if any. */
	private _openContextView: IOpenContextView | undefined;
	/** The blocked-sessions list rendered inside the open dropdown, if any. */
	private _blockedList: BlockedSessionsList | undefined;

	/** Drives the transient "Approved N sessions" confirmation. Owned by the widget. */
	private readonly _sessionActionFeedback: SessionActionFeedback;

	constructor(
		action: SubmenuItemAction,
		options: IBaseActionViewItemOptions | undefined,
		sessionActionFeedback: SessionActionFeedback | undefined,
		approvalModel: AgentSessionApprovalModel | undefined,
		blockedSessions: BlockedSessions | undefined,
		@ISessionsManagementService private readonly sessionsManagementService: ISessionsManagementService,
		@ISessionsService private readonly sessionsService: ISessionsService,
		@ISessionsProvidersService private readonly sessionsProvidersService: ISessionsProvidersService,
		@ICommandService private readonly commandService: ICommandService,
		@IContextViewService private readonly contextViewService: IContextViewService,
		@IWorkbenchLayoutService private readonly layoutService: IWorkbenchLayoutService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IProductService private readonly productService: IProductService,
	) {
		super(undefined, action, options);

		// The widget owns the approval-feedback state; the optional parameter is a
		// test seam so fixtures can supply a preset instance.
		this._sessionActionFeedback = sessionActionFeedback ?? this._register(new SessionActionFeedback());

		// Likewise the widget owns an approval model (shared with the dropdown list so
		// both agree on each session's pending action); the optional parameter is a
		// test seam.
		this._approvalModel = approvalModel ?? this._register(this.instantiationService.createInstance(AgentSessionApprovalModel));

		// The widget owns the blocked-sessions model; the optional parameter is a
		// test seam so fixtures can supply a preset instance.
		this._blockedSessionsModel = blockedSessions ?? this._register(this.instantiationService.createInstance(BlockedSessions));

		// A session that is currently visible on screen is not treated as blocked:
		// exclude visible sessions from the requires-input indicator and the dropdown.
		// The blocked-sessions feature is only enabled outside of stable builds.
		const blockedSessionsEnabled = this.productService.quality !== 'stable';
		this._blockedSessions = derived(this, reader => {
			if (!blockedSessionsEnabled) {
				return [];
			}
			const visibleSessionIds = new Set<string>();
			for (const session of this.sessionsService.visibleSessions.read(reader)) {
				if (session) {
					visibleSessionIds.add(session.sessionId);
				}
			}
			const dismissed = this._dismissedApprovals.read(reader);
			return this._blockedSessionsModel.blockedSessionsWithReasons.read(reader)
				.filter(blocked => !visibleSessionIds.has(blocked.session.sessionId) && !this._isApprovalDismissed(blocked, dismissed, reader));
		});

		// The homogeneous reason across all blocked sessions (or `undefined` for a
		// mix), refining `NeedsInput` into terminal-approval vs question via the
		// approval model. Drives the specific requires-input message.
		this._requiresInputKind = derived(this, reader => {
			const blocked = this._blockedSessions.read(reader);
			if (blocked.length === 0) {
				return undefined;
			}
			let common: RequiresInputKind | undefined;
			let hasCommon = false;
			for (const entry of blocked) {
				const kind = this._kindOf(entry, reader);
				if (kind === undefined) {
					return undefined;
				}
				if (!hasCommon) {
					common = kind;
					hasCommon = true;
				} else if (common !== kind) {
					return undefined;
				}
			}
			return common;
		});

		// Drop optimistic dismissals once the session is no longer blocked or its
		// pending approval has been superseded by a new, distinct one — so a stale
		// dismissal can't keep hiding a genuinely new block.
		this._register(autorun(reader => {
			const dismissed = this._dismissedApprovals.read(reader);
			if (dismissed.size === 0) {
				return;
			}
			const blockedById = new Map(this._blockedSessionsModel.blockedSessionsWithReasons.read(reader).map(blocked => [blocked.session.sessionId, blocked] as const));
			let next: Map<string, string> | undefined;
			for (const [sessionId, approvalId] of dismissed) {
				const blocked = blockedById.get(sessionId);
				let stale: boolean;
				if (!blocked || blocked.reason !== BlockedSessionReason.NeedsInput) {
					stale = true;
				} else {
					const approval = getFirstApprovalAcrossChats(this._approvalModel, blocked.session, reader);
					stale = approval !== undefined && agentSessionApprovalId(approval) !== approvalId;
				}
				if (stale) {
					next ??= new Map(dismissed);
					next.delete(sessionId);
				}
			}
			if (next) {
				this._dismissedApprovals.set(next, undefined);
			}
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
			const blocked = this._blockedSessions.read(reader);
			this._sessionActionFeedback.approvedCount.read(reader);
			this._requiresInputKind.read(reader);
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
			const blockedCount = this._blockedSessions.get().length;
			const requiresInput = blockedCount > 0;

			// The transient "Approved N sessions" confirmation takes precedence over the
			// requires-input state while it is showing.
			const showApproved = approvedCount > 0;
			const showRequiresInput = requiresInput && !showApproved;

			// The attention blink fires only when a *new* blocked session pushes the
			// count up while the requires-input state is shown — including the very first
			// one.
			const previousBlockedCount = this._lastBlockedCount;
			this._lastBlockedCount = blockedCount;
			const shouldBlink = showRequiresInput && blockedCount > previousBlockedCount;

			const requiresInputKind = this._requiresInputKind.get();

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
			// count. Other autoruns (e.g. onDidChangeSessions) invalidate the cached
			// render state and force a redundant rebuild of the identical pill; without
			// this guard that rebuild would strip the freshly-added blink class and cut
			// the animation short — which is why the first "1 session requires input"
			// never appeared to animate.
			if (!(showRequiresInput && blockedCount === previousBlockedCount)) {
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
	 * Whether a blocked session should stay hidden because the user just approved
	 * its pending action: hidden while that approval resolves (no current approval,
	 * status lagging) or is unchanged; a new, distinct approval re-surfaces it.
	 */
	private _isApprovalDismissed(blocked: IBlockedSession, dismissed: ReadonlyMap<string, string>, reader: IReader): boolean {
		const dismissedId = dismissed.get(blocked.session.sessionId);
		if (dismissedId === undefined || blocked.reason !== BlockedSessionReason.NeedsInput) {
			return false;
		}
		const approval = getFirstApprovalAcrossChats(this._approvalModel, blocked.session, reader);
		return approval === undefined || agentSessionApprovalId(approval) === dismissedId;
	}

	/**
	 * Remember that the user allowed this exact approval so the session drops out of
	 * the blocked set immediately (see {@link _isApprovalDismissed}).
	 */
	private _dismissApproval(approved: IApprovedSession): void {
		const next = new Map(this._dismissedApprovals.get());
		next.set(approved.session.sessionId, approved.approvalId);
		this._dismissedApprovals.set(next, undefined);
	}

	/**
	 * Classify a single blocked session into a specific requires-input kind, or
	 * `undefined` when it can't be classified (which forces the generic message).
	 */
	private _kindOf(blocked: IBlockedSession, reader: IReader): RequiresInputKind | undefined {
		switch (blocked.reason) {
			case BlockedSessionReason.FailingCI:
				return RequiresInputKind.FailingCI;
			case BlockedSessionReason.UnresolvedComments:
				return RequiresInputKind.UnresolvedComments;
			case BlockedSessionReason.NeedsInput: {
				const approval = getFirstApprovalAcrossChats(this._approvalModel, blocked.session, reader);
				switch (approval?.kind) {
					case AgentSessionApprovalKind.Terminal:
						return RequiresInputKind.TerminalApproval;
					case AgentSessionApprovalKind.Question:
						return RequiresInputKind.Question;
					default:
						return undefined;
				}
			}
			default:
				return undefined;
		}
	}

	/**
	 * Build the requires-input pill label. A homogeneous set of blocked sessions
	 * gets a specific, more actionable message; a mix (or an unclassified session)
	 * falls back to the generic "N sessions require input".
	 */
	private _getRequiresInputLabel(count: number, kind: RequiresInputKind | undefined): string {
		switch (kind) {
			case RequiresInputKind.TerminalApproval:
				return count === 1
					? localize('oneSessionTerminalApproval', "1 session requires terminal approval")
					: localize('nSessionsTerminalApproval', "{0} sessions require terminal approval", count);
			case RequiresInputKind.Question:
				return count === 1
					? localize('oneSessionQuestion', "1 session has a question")
					: localize('nSessionsQuestion', "{0} sessions have questions", count);
			case RequiresInputKind.FailingCI:
				return count === 1
					? localize('oneSessionFailingCI', "1 session is failing CI")
					: localize('nSessionsFailingCI', "{0} sessions are failing CI", count);
			case RequiresInputKind.UnresolvedComments:
				return count === 1
					? localize('oneSessionUnresolvedComments', "1 session has unresolved comments")
					: localize('nSessionsUnresolvedComments', "{0} sessions have unresolved comments", count);
			default:
				return count === 1
					? localize('oneSessionRequiresInput', "1 session requires input")
					: localize('nSessionsRequireInput', "{0} sessions require input", count);
		}
	}

	/**
	 * Render the requires-input pill. Clicking toggles a dropdown that lists the
	 * blocked sessions below the command center box.
	 */
	private _renderRequiresInput(count: number, kind: RequiresInputKind | undefined, shouldBlink: boolean): void {
		const container = this._container!;
		const label = this._getRequiresInputLabel(count, kind);
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
		const requiresInput = this._blockedSessions.get().length > 0;
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
		if (this._blockedSessions.get().length === 0) {
			return;
		}

		// Match the dropdown width to the command center box it hangs off.
		const width = container.getBoundingClientRect().width;

		const store = new DisposableStore();
		this._openContextView = this.contextViewService.showContextView({
			getAnchor: () => container,
			anchorAlignment: AnchorAlignment.LEFT,
			anchorPosition: AnchorPosition.BELOW,
			render: (viewContainer): IDisposable => {
				const list = store.add(this.instantiationService.createInstance(BlockedSessionsList, viewContainer, {
					width,
					approvalModel: this._approvalModel,
					onSessionOpen: (resource, preserveFocus, sideBySide) => {
						this.contextViewService.hideContextView();
						this._openBlockedSession(resource, preserveFocus, sideBySide);
					},
				}));
				list.setSessions(this._blockedSessions.get().map(entry => entry.session));
				store.add(list.onDidChangeContentHeight(() => this.contextViewService.layout()));
				store.add(list.onDidApproveSession(approved => {
					this._dismissApproval(approved);
					this._sessionActionFeedback.notifyApproved();
				}));

				// Keep the dropdown width matched to the command center box as the
				// window resizes (the command center reflows to a new width).
				store.add(this.layoutService.onDidLayoutActiveContainer(() => {
					list.setWidth(container.getBoundingClientRect().width);
					this.contextViewService.layout();
				}));

				this._blockedList = list;
				return store;
			},
			focus: () => this._blockedList?.focus(),
			onDOMEvent: (e: Event) => {
				// Dismiss on Escape, or on a click outside the dropdown. Clicks on the
				// anchor are ignored here because the anchor toggles the dropdown itself.
				if (e.type === EventType.KEY_DOWN) {
					if (new StandardKeyboardEvent(e as KeyboardEvent).equals(KeyCode.Escape)) {
						this.contextViewService.hideContextView();
					}
				} else if (e.type === EventType.CLICK) {
					const target = e.target as HTMLElement | null;
					if (target
						&& !isAncestor(target, this.contextViewService.getContextViewElement())
						&& !isAncestor(target, container)) {
						this.contextViewService.hideContextView();
					}
				}
			},
			onHide: () => {
				store.dispose();
				this._openContextView = undefined;
				this._blockedList = undefined;
			},
		});
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
		this._register(CommandsRegistry.registerCommand(SHOW_ALL_SESSIONS_FROM_BLOCKED_LIST_COMMAND_ID, accessor => {
			accessor.get(IContextViewService).hideContextView();
			return accessor.get(ICommandService).executeCommand(SHOW_SESSIONS_PICKER_COMMAND_ID);
		}));

		// Contribute the action to the blocked-sessions dropdown header toolbar.
		this._register(MenuRegistry.appendMenuItem(Menus.BlockedSessionsHeader, {
			command: {
				id: SHOW_ALL_SESSIONS_FROM_BLOCKED_LIST_COMMAND_ID,
				title: localize('showAllSessions', "Show All Sessions"),
				icon: Codicon.listSelection,
			},
			group: 'navigation',
			order: 1,
			when: IsAuxiliaryWindowContext.negate()
		}));

		this._register(actionViewItemService.register(Menus.CommandCenter, Menus.TitleBarSessionTitle, (action, options) => {
			if (!(action instanceof SubmenuItemAction)) {
				return undefined;
			}
			return instantiationService.createInstance(SessionsTitleBarWidget, action, options, undefined, undefined, undefined);
		}, undefined));
	}
}
