/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/hostPlaceChip.css';
import * as dom from '../../../../../base/browser/dom.js';
import { StandardKeyboardEvent } from '../../../../../base/browser/keyboardEvent.js';
import { BaseActionViewItem } from '../../../../../base/browser/ui/actionbar/actionViewItems.js';
import { renderIcon } from '../../../../../base/browser/ui/iconLabel/iconLabels.js';
import { IAction } from '../../../../../base/common/actions.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { KeyCode } from '../../../../../base/common/keyCodes.js';
import { localize } from '../../../../../nls.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { IAgentHostFilterService } from '../../../../services/agentHostFilter/common/agentHostFilter.js';
import { isImplicitlyConnectedHost } from './mobileAgentHostFilterService.js';
import { describeComputerStatus, MobileHostPickerSheet } from './mobileHostPickerSheet.js';

const $ = dom.$;

/**
 * The chip on the phone's new-session screen that names where the session
 * will run, on its own row above the workspace and agent chips. It is built
 * like those chips (icon · label · chevron on an `a.action-label` inside a
 * picker slot) so the row's styles dress it, carries no connection state (the
 * sheet shows that), and opens the
 * {@link MobileHostPickerSheet} on tap — the same sheet the drawer header
 * opens, so choosing a place for a new session never leaves Home.
 */
export class MobileHostPlaceChipViewItem extends BaseActionViewItem {

	private readonly _sheet: MobileHostPickerSheet;
	private _trigger: HTMLAnchorElement | undefined;
	private _icon: HTMLElement | undefined;
	private _label: HTMLElement | undefined;

	constructor(
		action: IAction,
		@IAgentHostFilterService private readonly _filterService: IAgentHostFilterService,
		@IInstantiationService instantiationService: IInstantiationService,
	) {
		super(undefined, action);
		this._sheet = this._register(instantiationService.createInstance(MobileHostPickerSheet));
		this._register(this._filterService.onDidChange(() => this._update()));
		this._register(this._filterService.onDidChangeDiscovering(() => this._update()));
	}

	override render(container: HTMLElement): void {
		super.render(container);
		if (!this.element) {
			return;
		}
		this.element.classList.add('sessions-chat-picker-slot', 'sessions-workspace-category-picker-slot', 'sessions-new-session-place');

		const trigger = this._trigger = dom.append(this.element, $('a.action-label.sessions-new-session-place-trigger')) as HTMLAnchorElement;
		trigger.tabIndex = 0;
		trigger.role = 'button';
		trigger.setAttribute('aria-haspopup', 'dialog');
		this._icon = dom.append(trigger, $('span.sessions-new-session-place-icon'));
		this._label = dom.append(trigger, $('span.sessions-chat-dropdown-label'));
		const chevron = dom.append(trigger, renderIcon(Codicon.chevronDownCompact));
		chevron.classList.add('sessions-chat-dropdown-chevron');
		chevron.setAttribute('aria-hidden', 'true');

		this._register(dom.addDisposableListener(trigger, dom.EventType.KEY_DOWN, e => {
			const event = new StandardKeyboardEvent(e);
			if (event.equals(KeyCode.Enter) || event.equals(KeyCode.Space)) {
				dom.EventHelper.stop(e, true);
				this._sheet.show();
			}
		}));

		this._update();
	}

	/**
	 * The base view item routes every click and tap on the action item here.
	 * The item is the whole target — the pill and, on the phone, the invisible
	 * 44px area around it — so this is where the sheet opens.
	 */
	override onClick(event: dom.EventLike): void {
		dom.EventHelper.stop(event, true);
		this._sheet.show();
	}

	override focus(): void {
		this._trigger?.focus();
	}

	private _update(): void {
		if (!this._trigger || !this._icon || !this._label) {
			return;
		}
		const selected = this._filterService.selectedHost;
		dom.clearNode(this._icon);

		if (!selected) {
			this._icon.append(renderIcon(Codicon.remote));
			this._label.textContent = this._filterService.isDiscovering
				? localize('placeChip.searching', "Searching…")
				: localize('placeChip.none', "Where to run");
			this._trigger.setAttribute('aria-label', localize('placeChip.none.aria', "Choose where the new session runs"));
			return;
		}

		if (isImplicitlyConnectedHost(selected)) {
			this._icon.append(renderIcon(selected.icon));
			this._label.textContent = selected.label;
			this._trigger.setAttribute('aria-label', selected.description
				? localize('placeChip.place.aria', "New session runs in {0}, {1}. Change where it runs.", selected.label, selected.description)
				: localize('placeChip.place.short.aria', "New session runs in {0}. Change where it runs.", selected.label));
			return;
		}

		// A computer: its glyph and name. Connection state is the sheet's business.
		this._icon.append(renderIcon(Codicon.vm));
		this._label.textContent = selected.label;
		this._trigger.setAttribute('aria-label', localize('placeChip.computer.aria', "New session runs on {0}, {1}. Change where it runs.", selected.label, describeComputerStatus(selected.status)));
	}
}
