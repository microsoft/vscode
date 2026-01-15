/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/focusView.css';

import { $, addDisposableListener, EventType, reset } from '../../../../../base/browser/dom.js';
import { renderIcon } from '../../../../../base/browser/ui/iconLabel/iconLabels.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { localize } from '../../../../../nls.js';
import { IHoverService } from '../../../../../platform/hover/browser/hover.js';
import { getDefaultHoverDelegate } from '../../../../../base/browser/ui/hover/hoverDelegateFactory.js';
import { IFocusViewService } from './focusViewService.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { IKeybindingService } from '../../../../../platform/keybinding/common/keybinding.js';
import { ExitFocusViewAction } from './focusViewActions.js';
import { IAgentSessionsService } from './agentSessionsService.js';
import { isSessionInProgressStatus } from './agentSessionsModel.js';
import { BaseActionViewItem, IBaseActionViewItemOptions } from '../../../../../base/browser/ui/actionbar/actionViewItems.js';
import { IAction } from '../../../../../base/common/actions.js';
import { ILabelService } from '../../../../../platform/label/common/label.js';
import { IWorkspaceContextService } from '../../../../../platform/workspace/common/workspace.js';

const OPEN_CHAT_ACTION_ID = 'workbench.action.chat.open';
const QUICK_CHAT_ACTION_ID = 'workbench.action.quickchat.toggle';
const QUICK_OPEN_ACTION_ID = 'workbench.action.quickOpenWithModes';

/**
 * Agents Control View Item - renders agent status in the command center when agent session projection is enabled.
 *
 * Shows two different states:
 * 1. Default state: Copilot icon pill (turns blue with in-progress count when agents are running)
 * 2. Agent Session Projection state: Session title + close button (when viewing a session)
 *
 * The command center search box and navigation controls remain visible alongside this control.
 */
export class AgentsControlViewItem extends BaseActionViewItem {

	private _container: HTMLElement | undefined;
	private readonly _dynamicDisposables = this._register(new DisposableStore());

	constructor(
		action: IAction,
		options: IBaseActionViewItemOptions | undefined,
		@IFocusViewService private readonly focusViewService: IFocusViewService,
		@IHoverService private readonly hoverService: IHoverService,
		@ICommandService private readonly commandService: ICommandService,
		@IKeybindingService private readonly keybindingService: IKeybindingService,
		@IAgentSessionsService private readonly agentSessionsService: IAgentSessionsService,
		@ILabelService private readonly labelService: ILabelService,
		@IWorkspaceContextService private readonly workspaceContextService: IWorkspaceContextService,
	) {
		super(undefined, action, options);

		// Re-render when session changes
		this._register(this.focusViewService.onDidChangeActiveSession(() => {
			this._render();
		}));

		this._register(this.focusViewService.onDidChangeFocusViewMode(() => {
			this._render();
		}));

		// Re-render when sessions change to update statistics
		this._register(this.agentSessionsService.model.onDidChangeSessions(() => {
			this._render();
		}));
	}

	override render(container: HTMLElement): void {
		super.render(container);
		this._container = container;
		container.classList.add('agents-control-container');

		// Initial render
		this._render();
	}

	private _render(): void {
		if (!this._container) {
			return;
		}

		// Clear existing content
		reset(this._container);

		// Clear previous disposables for dynamic content
		this._dynamicDisposables.clear();

		if (this.focusViewService.isActive && this.focusViewService.activeSession) {
			// Agent Session Projection mode - show session title + close button
			this._renderSessionMode(this._dynamicDisposables);
		} else {
			// Default mode - show copilot pill with optional in-progress indicator
			this._renderChatInputMode(this._dynamicDisposables);
		}
	}

	private _renderChatInputMode(disposables: DisposableStore): void {
		if (!this._container) {
			return;
		}

		// Get agent session statistics
		const sessions = this.agentSessionsService.model.sessions;
		const activeSessions = sessions.filter(s => isSessionInProgressStatus(s.status));
		const unreadSessions = sessions.filter(s => !s.isRead());
		const hasActiveSessions = activeSessions.length > 0;
		const hasUnreadSessions = unreadSessions.length > 0;

		// Create pill - add 'has-active' class when sessions are in progress
		const pill = $('div.agents-control-pill.chat-input-mode');
		if (hasActiveSessions) {
			pill.classList.add('has-active');
		} else if (hasUnreadSessions) {
			pill.classList.add('has-unread');
		}
		pill.setAttribute('role', 'button');
		pill.setAttribute('aria-label', localize('openQuickChat', "Open Quick Chat"));
		pill.tabIndex = 0;
		this._container.appendChild(pill);

		// Left side indicator (status)
		const leftIndicator = $('span.agents-control-status');
		if (hasActiveSessions) {
			// Running indicator when there are active sessions
			const runningIcon = $('span.agents-control-status-icon');
			reset(runningIcon, renderIcon(Codicon.sessionInProgress));
			leftIndicator.appendChild(runningIcon);
			const runningCount = $('span.agents-control-status-text');
			runningCount.textContent = String(activeSessions.length);
			leftIndicator.appendChild(runningCount);
		} else if (hasUnreadSessions) {
			// Unread indicator when there are unread sessions
			const unreadIcon = $('span.agents-control-status-icon');
			reset(unreadIcon, renderIcon(Codicon.circleFilled));
			leftIndicator.appendChild(unreadIcon);
			const unreadCount = $('span.agents-control-status-text');
			unreadCount.textContent = String(unreadSessions.length);
			leftIndicator.appendChild(unreadCount);
		} else {
			// Keyboard shortcut when idle (show open chat keybinding)
			const kb = this.keybindingService.lookupKeybinding(OPEN_CHAT_ACTION_ID)?.getLabel();
			if (kb) {
				const kbLabel = $('span.agents-control-keybinding');
				kbLabel.textContent = kb;
				leftIndicator.appendChild(kbLabel);
			}
		}
		pill.appendChild(leftIndicator);

		// Show workspace name (centered)
		const label = $('span.agents-control-label');
		const workspaceName = this.labelService.getWorkspaceLabel(this.workspaceContextService.getWorkspace());
		label.textContent = workspaceName;
		pill.appendChild(label);

		// Send icon (right side)
		const sendIcon = $('span.agents-control-send');
		reset(sendIcon, renderIcon(Codicon.send));
		pill.appendChild(sendIcon);

		// Setup hover with keyboard shortcut
		const hoverDelegate = getDefaultHoverDelegate('mouse');
		const kbForTooltip = this.keybindingService.lookupKeybinding(QUICK_CHAT_ACTION_ID)?.getLabel();
		const tooltip = kbForTooltip
			? localize('askTooltip', "Open Quick Chat ({0})", kbForTooltip)
			: localize('askTooltip2', "Open Quick Chat");
		disposables.add(this.hoverService.setupManagedHover(hoverDelegate, pill, tooltip));

		// Click handler - open quick chat
		disposables.add(addDisposableListener(pill, EventType.CLICK, (e) => {
			e.preventDefault();
			e.stopPropagation();
			this.commandService.executeCommand(QUICK_CHAT_ACTION_ID);
		}));

		// Keyboard handler
		disposables.add(addDisposableListener(pill, EventType.KEY_DOWN, (e) => {
			if (e.key === 'Enter' || e.key === ' ') {
				e.preventDefault();
				e.stopPropagation();
				this.commandService.executeCommand(QUICK_CHAT_ACTION_ID);
			}
		}));

		// Search button (right of pill)
		this._renderSearchButton(disposables);
	}

	private _renderSessionMode(disposables: DisposableStore): void {
		if (!this._container) {
			return;
		}

		const pill = $('div.agents-control-pill.session-mode');
		this._container.appendChild(pill);

		// Session title (left/center)
		const titleLabel = $('span.agents-control-title');
		const session = this.focusViewService.activeSession;
		titleLabel.textContent = session?.label ?? localize('agentSessionProjection', "Agent Session Projection");
		pill.appendChild(titleLabel);

		// Close button (right side)
		const closeButton = $('span.agents-control-close');
		closeButton.classList.add('codicon', 'codicon-close');
		closeButton.setAttribute('role', 'button');
		closeButton.setAttribute('aria-label', localize('exitAgentSessionProjection', "Exit Agent Session Projection"));
		closeButton.tabIndex = 0;
		pill.appendChild(closeButton);

		// Setup hovers
		const hoverDelegate = getDefaultHoverDelegate('mouse');
		disposables.add(this.hoverService.setupManagedHover(hoverDelegate, closeButton, localize('exitAgentSessionProjectionTooltip', "Exit Agent Session Projection (Escape)")));
		disposables.add(this.hoverService.setupManagedHover(hoverDelegate, pill, () => {
			const activeSession = this.focusViewService.activeSession;
			return activeSession ? localize('agentSessionProjectionTooltip', "Agent Session Projection: {0}", activeSession.label) : localize('agentSessionProjection', "Agent Session Projection");
		}));

		// Close button click handler
		disposables.add(addDisposableListener(closeButton, EventType.MOUSE_DOWN, (e) => {
			e.preventDefault();
			e.stopPropagation();
			this.commandService.executeCommand(ExitFocusViewAction.ID);
		}));

		disposables.add(addDisposableListener(closeButton, EventType.CLICK, (e) => {
			e.preventDefault();
			e.stopPropagation();
			this.commandService.executeCommand(ExitFocusViewAction.ID);
		}));

		// Close button keyboard handler
		disposables.add(addDisposableListener(closeButton, EventType.KEY_DOWN, (e) => {
			if (e.key === 'Enter' || e.key === ' ') {
				e.preventDefault();
				e.stopPropagation();
				this.commandService.executeCommand(ExitFocusViewAction.ID);
			}
		}));

		// Search button (right of pill)
		this._renderSearchButton(disposables);
	}

	private _renderSearchButton(disposables: DisposableStore): void {
		if (!this._container) {
			return;
		}

		const searchButton = $('span.agents-control-search');
		reset(searchButton, renderIcon(Codicon.search));
		searchButton.setAttribute('role', 'button');
		searchButton.setAttribute('aria-label', localize('openQuickOpen', "Open Quick Open"));
		searchButton.tabIndex = 0;
		this._container.appendChild(searchButton);

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
}
