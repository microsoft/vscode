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
import { isSessionInProgressStatus } from './agentSessionsModel.js';
import { BaseActionViewItem, IBaseActionViewItemOptions } from '../../../../../base/browser/ui/actionbar/actionViewItems.js';
import { IAction } from '../../../../../base/common/actions.js';
import { ILabelService } from '../../../../../platform/label/common/label.js';
import { IWorkspaceContextService } from '../../../../../platform/workspace/common/workspace.js';
import { IBrowserWorkbenchEnvironmentService } from '../../../../services/environment/browser/environmentService.js';
import { IEditorGroupsService } from '../../../../services/editor/common/editorGroupsService.js';
import { IEditorService } from '../../../../services/editor/common/editorService.js';
import { Verbosity } from '../../../../common/editor.js';
import { Schemas } from '../../../../../base/common/network.js';

const OPEN_CHAT_ACTION_ID = 'workbench.action.chat.open';
const QUICK_CHAT_ACTION_ID = 'workbench.action.quickchat.toggle';
const QUICK_OPEN_ACTION_ID = 'workbench.action.quickOpenWithModes';

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

	private _container: HTMLElement | undefined;
	private readonly _dynamicDisposables = this._register(new DisposableStore());

	constructor(
		action: IAction,
		options: IBaseActionViewItemOptions | undefined,
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
	) {
		super(undefined, action, options);

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
		const pill = $('div.agent-status-pill.chat-input-mode');
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
		const leftIndicator = $('span.agent-status-indicator');
		if (hasActiveSessions) {
			// Running indicator when there are active sessions
			const runningIcon = $('span.agent-status-icon');
			reset(runningIcon, renderIcon(Codicon.sessionInProgress));
			leftIndicator.appendChild(runningIcon);
			const runningCount = $('span.agent-status-text');
			runningCount.textContent = String(activeSessions.length);
			leftIndicator.appendChild(runningCount);
		} else if (hasUnreadSessions) {
			// Unread indicator when there are unread sessions
			const unreadIcon = $('span.agent-status-icon');
			reset(unreadIcon, renderIcon(Codicon.circleFilled));
			leftIndicator.appendChild(unreadIcon);
			const unreadCount = $('span.agent-status-text');
			unreadCount.textContent = String(unreadSessions.length);
			leftIndicator.appendChild(unreadCount);
		} else {
			// Keyboard shortcut when idle (show open chat keybinding)
			const kb = this.keybindingService.lookupKeybinding(OPEN_CHAT_ACTION_ID)?.getLabel();
			if (kb) {
				const kbLabel = $('span.agent-status-keybinding');
				kbLabel.textContent = kb;
				leftIndicator.appendChild(kbLabel);
			}
		}
		pill.appendChild(leftIndicator);

		// Show label (matching command center behavior - includes prefix/suffix decorations)
		const label = $('span.agent-status-label');
		label.textContent = this._getLabel();
		pill.appendChild(label);

		// Send icon (right side)
		const sendIcon = $('span.agent-status-send');
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

		const pill = $('div.agent-status-pill.session-mode');
		this._container.appendChild(pill);

		// Session title (left/center)
		const titleLabel = $('span.agent-status-title');
		const sessionInfo = this.agentStatusService.sessionInfo;
		titleLabel.textContent = sessionInfo?.title ?? localize('agentSessionProjection', "Agent Session Projection");
		pill.appendChild(titleLabel);

		// Escape button (right side) - serves as both keybinding hint and close button
		const escButton = $('span.agent-status-esc-button');
		escButton.textContent = 'Esc';
		escButton.setAttribute('role', 'button');
		escButton.setAttribute('aria-label', localize('exitAgentSessionProjection', "Exit Agent Session Projection"));
		escButton.tabIndex = 0;
		pill.appendChild(escButton);

		// Setup hovers
		const hoverDelegate = getDefaultHoverDelegate('mouse');
		disposables.add(this.hoverService.setupManagedHover(hoverDelegate, escButton, localize('exitAgentSessionProjectionTooltip', "Exit Agent Session Projection (Escape)")));
		disposables.add(this.hoverService.setupManagedHover(hoverDelegate, pill, () => {
			const sessionInfo = this.agentStatusService.sessionInfo;
			return sessionInfo ? localize('agentSessionProjectionTooltip', "Agent Session Projection: {0}", sessionInfo.title) : localize('agentSessionProjection', "Agent Session Projection");
		}));

		// Esc button click handler
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

		// Esc button keyboard handler
		disposables.add(addDisposableListener(escButton, EventType.KEY_DOWN, (e) => {
			if (e.key === 'Enter' || e.key === ' ') {
				e.preventDefault();
				e.stopPropagation();
				this.commandService.executeCommand(ExitAgentSessionProjectionAction.ID);
			}
		}));

		// Search button (right of pill)
		this._renderSearchButton(disposables);
	}

	private _renderSearchButton(disposables: DisposableStore): void {
		if (!this._container) {
			return;
		}

		const searchButton = $('span.agent-status-search');
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
}
