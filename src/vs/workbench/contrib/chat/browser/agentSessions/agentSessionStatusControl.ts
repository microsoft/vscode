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
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { IAgentSessionsService } from './agentSessionsService.js';
import { isSessionInProgressStatus } from './agentSessionsModel.js';
import { BaseActionViewItem, IBaseActionViewItemOptions } from '../../../../../base/browser/ui/actionbar/actionViewItems.js';
import { IAction } from '../../../../../base/common/actions.js';
import { PickAgentSessionAction } from './agentSessionsActions.js';

/**
 * Session Status Control View Item - renders a compact running session indicator in the command center.
 *
 * Shows when there are running agent sessions but AgentSessionProjectionEnabled is disabled.
 * Displays the session-in-progress icon with a count of running sessions.
 */
export class AgentSessionStatusControlViewItem extends BaseActionViewItem {

	private _container: HTMLElement | undefined;
	private readonly _dynamicDisposables = this._register(new DisposableStore());

	constructor(
		action: IAction,
		options: IBaseActionViewItemOptions | undefined,
		@IHoverService private readonly hoverService: IHoverService,
		@ICommandService private readonly commandService: ICommandService,
		@IAgentSessionsService private readonly agentSessionsService: IAgentSessionsService,
	) {
		super(undefined, action, options);

		// Re-render when sessions change
		this._register(this.agentSessionsService.model.onDidChangeSessions(() => {
			this._render();
		}));
	}

	override render(container: HTMLElement): void {
		super.render(container);
		this._container = container;
		container.classList.add('agent-session-status-container');

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

		// Get agent session statistics
		const sessions = this.agentSessionsService.model.sessions;
		const activeSessions = sessions.filter(s => isSessionInProgressStatus(s.status));
		const activeCount = activeSessions.length;

		if (activeCount === 0) {
			// No active sessions - add hidden class
			this._container.classList.add('hidden');
			return;
		}

		this._container.classList.remove('hidden');

		// Create the indicator pill
		const pill = $('div.agent-session-status-pill');
		pill.setAttribute('role', 'button');
		pill.setAttribute('aria-label', activeCount === 1
			? localize('oneSessionRunningAction', "1 agent session running, click to view sessions")
			: localize('sessionsRunningAction', "{0} agent sessions running, click to view sessions", activeCount));
		pill.tabIndex = 0;
		this._container.appendChild(pill);

		// Session in progress icon
		const iconElement = $('span.agent-session-status-icon');
		reset(iconElement, renderIcon(Codicon.sessionInProgress));
		pill.appendChild(iconElement);

		// Count
		const countElement = $('span.agent-session-status-count');
		countElement.textContent = String(activeCount);
		pill.appendChild(countElement);

		// Setup hover
		const hoverDelegate = getDefaultHoverDelegate('mouse');
		const tooltip = activeCount === 1
			? localize('sessionRunningTooltip', "1 agent session running - click to view")
			: localize('sessionsRunningTooltip', "{0} agent sessions running - click to view", activeCount);
		this._dynamicDisposables.add(this.hoverService.setupManagedHover(hoverDelegate, pill, tooltip));

		// Click handler - open session picker
		this._dynamicDisposables.add(addDisposableListener(pill, EventType.CLICK, (e) => {
			e.preventDefault();
			e.stopPropagation();
			this.commandService.executeCommand(PickAgentSessionAction.ID);
		}));

		// Keyboard handler
		this._dynamicDisposables.add(addDisposableListener(pill, EventType.KEY_DOWN, (e) => {
			if (e.key === 'Enter' || e.key === ' ') {
				e.preventDefault();
				e.stopPropagation();
				this.commandService.executeCommand(PickAgentSessionAction.ID);
			}
		}));
	}
}
