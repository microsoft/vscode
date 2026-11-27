/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/agenticModeButton.css';
import { $, append, EventHelper, EventLike } from '../../../../../base/browser/dom.js';
import { GestureEvent, EventType as TouchEventType } from '../../../../../base/browser/touch.js';
import { BaseActionViewItem, IBaseActionViewItemOptions } from '../../../../../base/browser/ui/actionbar/actionViewItems.js';
import { IAction } from '../../../../../base/common/actions.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { localize } from '../../../../../nls.js';
import { IKeybindingService } from '../../../../../platform/keybinding/common/keybinding.js';

/**
 * Renders the Agentic Mode toggle in the title bar as an "Agents" button: the agent icon
 * followed by a label. It is quiet at rest and shows the toggled look while the mode is on.
 */
export class AgenticModeButtonActionViewItem extends BaseActionViewItem {

	constructor(
		action: IAction,
		options: IBaseActionViewItemOptions,
		@IKeybindingService private readonly keybindingService: IKeybindingService,
	) {
		super(undefined, action, options);
	}

	override render(container: HTMLElement): void {
		super.render(container);
		container.classList.add('agentic-mode-titlebar-button');
		container.setAttribute('role', 'button');

		append(container, $(`span${ThemeIcon.asCSSSelector(Codicon.agent)}`)).setAttribute('aria-hidden', 'true');
		append(container, $('span.agentic-mode-titlebar-button-label')).textContent = localize('agenticMode.button.label', "Agents");

		this.updateAriaLabel();
		this.updateTooltip();
		this.updateChecked();
		this.updateEnabled();
	}

	override onClick(event: EventLike, preserveFocus?: boolean): void {
		// A double tap fires a second Tap gesture (tapCount 2) that would toggle the mode back
		if (event instanceof Event && event.type === TouchEventType.Tap && (event as GestureEvent).tapCount > 1) {
			EventHelper.stop(event, true);
			return;
		}
		super.onClick(event, preserveFocus);
	}

	protected override getTooltip(): string {
		const label = this.action.checked
			? localize('agenticMode.button.turnOff', "Turn Off Agentic Mode")
			: localize('agenticMode.button.turnOn', "Turn On Agentic Mode");
		return this.keybindingService.appendKeybinding(label, this.action.id);
	}

	protected override updateAriaLabel(): void {
		// The label names the action it performs, so it already conveys the state (no aria-pressed).
		// It starts with the visible text so that the accessible name contains it.
		this.element?.setAttribute('aria-label', localize('agenticMode.button.ariaLabel', "Agents: {0}", this.getTooltip()));
	}

	protected override updateChecked(): void {
		if (!this.element) {
			return;
		}
		this.element.classList.toggle('checked', !!this.action.checked);
		this.updateAriaLabel();
		this.updateTooltip();
	}

	protected override updateEnabled(): void {
		if (!this.element) {
			return;
		}
		this.element.classList.toggle('disabled', !this.action.enabled);
		this.element.setAttribute('aria-disabled', String(!this.action.enabled));
	}
}
