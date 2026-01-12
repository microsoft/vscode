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
import { ExitFocusViewAction } from './focusViewActions.js';

export class FocusViewCommandCenterControl {

	private readonly _disposables = new DisposableStore();

	readonly element: HTMLElement;

	constructor(
		@IFocusViewService private readonly focusViewService: IFocusViewService,
		@IHoverService private readonly hoverService: IHoverService,
		@ICommandService private readonly commandService: ICommandService,
	) {
		// Create main container
		this.element = $('div.focus-view-command-center');

		// Create pill container
		const pill = $('div.focus-view-pill');
		this.element.appendChild(pill);

		// Copilot icon
		const iconContainer = $('span.focus-view-icon');
		reset(iconContainer, renderIcon(Codicon.copilot));
		pill.appendChild(iconContainer);

		// Session title
		const titleLabel = $('span.focus-view-title');
		const session = this.focusViewService.activeSession;
		titleLabel.textContent = session?.label ?? localize('astralProjection', "Astral Projection");
		pill.appendChild(titleLabel);

		// Close button
		const closeButton = $('span.focus-view-close');
		closeButton.classList.add('codicon', 'codicon-close');
		closeButton.setAttribute('role', 'button');
		closeButton.setAttribute('aria-label', localize('exitAstralProjection', "Exit Astral Projection"));
		closeButton.tabIndex = 0;
		pill.appendChild(closeButton);

		// Setup hover
		const hoverDelegate = getDefaultHoverDelegate('mouse');
		this._disposables.add(this.hoverService.setupManagedHover(hoverDelegate, closeButton, localize('exitAstralProjectionTooltip', "Exit Astral Projection (Escape)")));
		this._disposables.add(this.hoverService.setupManagedHover(hoverDelegate, pill, () => {
			const activeSession = this.focusViewService.activeSession;
			return activeSession ? localize('astralProjectionTooltip', "Astral Projection: {0}", activeSession.label) : localize('astralProjection', "Astral Projection");
		}));

		// Close button click handler - use command service to ensure proper execution
		// Using MOUSE_DOWN instead of CLICK works better in titlebar regions
		this._disposables.add(addDisposableListener(closeButton, EventType.MOUSE_DOWN, (e) => {
			e.preventDefault();
			e.stopPropagation();
			this.commandService.executeCommand(ExitFocusViewAction.ID);
		}));

		// Also handle CLICK for accessibility
		this._disposables.add(addDisposableListener(closeButton, EventType.CLICK, (e) => {
			e.preventDefault();
			e.stopPropagation();
			this.commandService.executeCommand(ExitFocusViewAction.ID);
		}));

		// Close button keyboard handler
		this._disposables.add(addDisposableListener(closeButton, EventType.KEY_DOWN, (e) => {
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
