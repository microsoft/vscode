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
import { ICommandCenterControl } from '../../../../browser/parts/titlebar/commandCenterControlRegistry.js';
import { MenuWorkbenchToolBar, HiddenItemStrategy } from '../../../../../platform/actions/browser/toolbar.js';
import { MenuId, SubmenuItemAction } from '../../../../../platform/actions/common/actions.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { IActionViewItem } from '../../../../../base/browser/ui/actionbar/actionbar.js';
import { IAction, ActionRunner } from '../../../../../base/common/actions.js';
import { IAgentSessionsService } from './agentSessionsService.js';
import { isSessionInProgressStatus } from './agentSessionsModel.js';

const TOGGLE_CHAT_ACTION_ID = 'workbench.action.chat.toggle';

/**
 * Empty action view item that renders nothing - used to hide the command center submenu
 */
class EmptyActionViewItem implements IActionViewItem {
	readonly element = document.createElement('span');
	readonly actionRunner = new ActionRunner();

	constructor(readonly action: IAction) {
		this.element.style.display = 'none';
	}
	render(): void { }
	isEnabled(): boolean { return false; }
	focus(): void { }
	blur(): void { }
	dispose(): void { }
	setActionContext(_context: unknown): void { }
}

/**
 * Agents Control - replaces the command center search button when agent session projection is enabled.
 *
 * Shows two different states:
 * 1. Default state: "Ask me anything" pill that opens chat (when no session is active)
 * 2. Agent Session Projection state: Session title + close button (when viewing a session)
 *
 * Also includes navigation controls (back/forward arrows) from MenuId.CommandCenter to maintain
 * the standard command center navigation UI.
 */
export class AgentsControl implements ICommandCenterControl {

	private readonly _disposables = new DisposableStore();

	readonly element: HTMLElement;
	private readonly _pillContainer: HTMLElement;

	constructor(
		@IFocusViewService private readonly focusViewService: IFocusViewService,
		@IHoverService private readonly hoverService: IHoverService,
		@ICommandService private readonly commandService: ICommandService,
		@IKeybindingService private readonly keybindingService: IKeybindingService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IAgentSessionsService private readonly agentSessionsService: IAgentSessionsService,
	) {
		// Create main container with command-center class for proper styling
		this.element = $('div.command-center');

		// Create navigation toolbar for back/forward arrows and other command center items
		// This ensures we don't lose the navigation controls when replacing the command center
		const navToolbar = this.instantiationService.createInstance(MenuWorkbenchToolBar, this.element, MenuId.CommandCenter, {
			hiddenItemStrategy: HiddenItemStrategy.NoHide,
			toolbarOptions: {
				primaryGroup: () => true,
			},
			telemetrySource: 'agentsControl',
			actionViewItemProvider: (action) => {
				// Skip the CommandCenterCenter submenu - that's what we're replacing with our pill
				if (action instanceof SubmenuItemAction && action.item.submenu === MenuId.CommandCenterCenter) {
					return new EmptyActionViewItem(action);
				}
				return undefined; // Let default rendering handle other items
			}
		});
		this._disposables.add(navToolbar);

		// Create container for our custom pill - will be positioned by CSS
		this._pillContainer = $('div.action-item.agents-control-container');

		// Append the pill container directly - it will be positioned by CSS
		this.element.appendChild(this._pillContainer);

		// Initial render
		this._render();

		// Re-render when session changes
		this._disposables.add(this.focusViewService.onDidChangeActiveSession(() => {
			this._render();
		}));

		this._disposables.add(this.focusViewService.onDidChangeFocusViewMode(() => {
			this._render();
		}));

		// Re-render when sessions change to update statistics
		this._disposables.add(this.agentSessionsService.model.onDidChangeSessions(() => {
			this._render();
		}));
	}

	private _render(): void {
		// Clear existing content
		reset(this._pillContainer);

		// Clear previous disposables for dynamic content
		const dynamicDisposables = new DisposableStore();
		this._disposables.add(dynamicDisposables);

		if (this.focusViewService.isActive && this.focusViewService.activeSession) {
			// Agent Session Projection mode - show session title + close button
			this._renderSessionMode(dynamicDisposables);
		} else {
			// Default mode - show chat input
			this._renderChatInputMode(dynamicDisposables);
		}
	}

	private _renderChatInputMode(disposables: DisposableStore): void {
		const pill = $('div.agents-control-pill.chat-input-mode');
		pill.setAttribute('role', 'button');
		pill.tabIndex = 0;
		this._pillContainer.appendChild(pill);

		// Get agent session statistics
		const sessions = this.agentSessionsService.model.sessions;
		const activeSessions = sessions.filter(s => isSessionInProgressStatus(s.status));
		const unreadSessions = sessions.filter(s => !s.isRead() && !s.isArchived());
		const totalSessions = sessions.filter(s => !s.isArchived()).length;

		// Copilot icon
		const icon = $('span.agents-control-icon');
		reset(icon, renderIcon(Codicon.copilot));
		pill.appendChild(icon);

		// Display statistics
		const statsContainer = $('span.agents-control-stats');

		if (activeSessions.length > 0) {
			// Show running agents count
			const activeCount = $('span.agents-control-stat.active');
			activeCount.textContent = localize('activeAgents', "{0} running", activeSessions.length);
			statsContainer.appendChild(activeCount);
		}

		if (unreadSessions.length > 0) {
			// Show unread count as a badge
			const unreadBadge = $('span.agents-control-badge.unread');
			unreadBadge.textContent = String(unreadSessions.length);
			statsContainer.appendChild(unreadBadge);
		}

		if (activeSessions.length === 0 && unreadSessions.length === 0) {
			// Show total sessions count if no active or unread
			const totalCount = $('span.agents-control-stat');
			if (totalSessions === 0) {
				totalCount.textContent = localize('noSessions', "No agent sessions");
			} else if (totalSessions === 1) {
				totalCount.textContent = localize('oneSession', "1 agent session");
			} else {
				totalCount.textContent = localize('totalSessions', "{0} agent sessions", totalSessions);
			}
			statsContainer.appendChild(totalCount);
		}

		pill.appendChild(statsContainer);

		// Setup hover with keyboard shortcut
		const hoverDelegate = getDefaultHoverDelegate('mouse');
		const kb = this.keybindingService.lookupKeybinding(TOGGLE_CHAT_ACTION_ID)?.getLabel();
		const tooltip = kb
			? localize('askTooltip', "Open Chat ({0})", kb)
			: localize('askTooltip2', "Open Chat");
		disposables.add(this.hoverService.setupManagedHover(hoverDelegate, pill, tooltip));

		// Click handler - open chat
		disposables.add(addDisposableListener(pill, EventType.CLICK, (e) => {
			e.preventDefault();
			e.stopPropagation();
			this.commandService.executeCommand(TOGGLE_CHAT_ACTION_ID);
		}));

		// Keyboard handler
		disposables.add(addDisposableListener(pill, EventType.KEY_DOWN, (e) => {
			if (e.key === 'Enter' || e.key === ' ') {
				e.preventDefault();
				e.stopPropagation();
				this.commandService.executeCommand(TOGGLE_CHAT_ACTION_ID);
			}
		}));
	}

	private _renderSessionMode(disposables: DisposableStore): void {
		const pill = $('div.agents-control-pill.session-mode');
		this._pillContainer.appendChild(pill);

		// Copilot icon
		const iconContainer = $('span.agents-control-icon');
		reset(iconContainer, renderIcon(Codicon.copilot));
		pill.appendChild(iconContainer);

		// Session title
		const titleLabel = $('span.agents-control-title');
		const session = this.focusViewService.activeSession;
		titleLabel.textContent = session?.label ?? localize('agentSessionProjection', "Agent Session Projection");
		pill.appendChild(titleLabel);

		// Close button
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
	}

	dispose(): void {
		this._disposables.dispose();
	}
}
