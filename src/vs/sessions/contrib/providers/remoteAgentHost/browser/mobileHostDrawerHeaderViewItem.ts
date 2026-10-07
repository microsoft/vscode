/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/hostDrawerHeader.css';
import * as dom from '../../../../../base/browser/dom.js';
import { StandardKeyboardEvent } from '../../../../../base/browser/keyboardEvent.js';
import { Gesture, EventType as TouchEventType } from '../../../../../base/browser/touch.js';
import { BaseActionViewItem } from '../../../../../base/browser/ui/actionbar/actionViewItems.js';
import { renderLabelWithIcons } from '../../../../../base/browser/ui/iconLabel/iconLabels.js';
import { IAction } from '../../../../../base/common/actions.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { KeyCode } from '../../../../../base/common/keyCodes.js';
import { localize } from '../../../../../nls.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { IAgentHostFilterEntry, IAgentHostFilterService } from '../../../../services/agentHostFilter/common/agentHostFilter.js';
import { isImplicitlyConnectedHost } from './mobileAgentHostFilterService.js';
import { describeComputerStatus, MobileHostPickerSheet } from './mobileHostPickerSheet.js';

const $ = dom.$;

/**
 * The row at the top of the phone sessions drawer that names the place the
 * list is scoped to — "Cloud · GitHub Sandboxes", or one of the user's
 * computers with its connection state — and opens the
 * {@link MobileHostPickerSheet} on tap. Living in the drawer makes switching
 * reachable from an open session, where the title bar belongs to the session.
 */
export class MobileHostDrawerHeaderViewItem extends BaseActionViewItem {

	private readonly _sheet: MobileHostPickerSheet;
	private _row: HTMLButtonElement | undefined;
	private _tile: HTMLElement | undefined;
	private _title: HTMLElement | undefined;
	private _subtitle: HTMLElement | undefined;

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
		this.element.classList.add('host-drawer-header');

		const button = this._row = dom.append(this.element, $('button.host-drawer-header-row', { type: 'button' })) as HTMLButtonElement;
		button.setAttribute('aria-haspopup', 'dialog');
		this._tile = dom.append(button, $('span.host-drawer-header-tile'));
		const text = dom.append(button, $('span.host-drawer-header-text'));
		this._title = dom.append(text, $('span.host-drawer-header-title'));
		this._subtitle = dom.append(text, $('span.host-drawer-header-subtitle'));
		dom.append(button, $('span.host-drawer-header-chevron')).append(...renderLabelWithIcons(`$(${Codicon.chevronDown.id})`));

		this._register(Gesture.addTarget(button));
		for (const eventType of [dom.EventType.CLICK, TouchEventType.Tap]) {
			this._register(dom.addDisposableListener(button, eventType, e => {
				dom.EventHelper.stop(e, true);
				this._sheet.show();
			}));
		}
		this._register(dom.addDisposableListener(button, dom.EventType.KEY_DOWN, e => {
			const event = new StandardKeyboardEvent(e);
			if (event.equals(KeyCode.Enter) || event.equals(KeyCode.Space)) {
				dom.EventHelper.stop(e, true);
				this._sheet.show();
			}
		}));

		this._update();
	}

	override focus(): void {
		this._row?.focus();
	}

	private _update(): void {
		if (!this._tile || !this._title || !this._subtitle || !this._row) {
			return;
		}
		const selected = this._filterService.selectedHost;
		const row = this._row;

		dom.clearNode(this._tile);
		dom.clearNode(this._subtitle);
		this._tile.classList.remove('place', 'computer');

		if (!selected) {
			this._tile.classList.add('computer');
			this._tile.append(...renderLabelWithIcons(`$(${Codicon.remote.id})`));
			this._title.textContent = localize('hostDrawer.noPlace', "Where sessions run");
			this._subtitle.textContent = this._filterService.isDiscovering
				? localize('hostDrawer.searching', "Searching…")
				: localize('hostDrawer.choose', "Choose a place");
			row.setAttribute('aria-label', localize('hostDrawer.noPlace.aria', "Where sessions run. Choose a place."));
			return;
		}

		if (isImplicitlyConnectedHost(selected)) {
			this._tile.classList.add('place');
			this._tile.append(...renderLabelWithIcons(`$(${selected.icon.id})`));
			this._title.textContent = selected.label;
			this._subtitle.textContent = selected.description ?? '';
			row.setAttribute('aria-label', localize('hostDrawer.place.aria', "Sessions run in {0}, {1}. Change where sessions run.", selected.label, selected.description ?? ''));
			return;
		}

		this._renderComputer(selected, row);
	}

	private _renderComputer(computer: IAgentHostFilterEntry, row: HTMLElement): void {
		this._tile!.classList.add('computer');
		this._tile!.append(...renderLabelWithIcons(`$(${Codicon.vm.id})`));
		this._title!.textContent = computer.label;
		const status = describeComputerStatus(computer.status);
		dom.append(this._subtitle!, $(`span.host-picker-status-dot.${computer.status}`));
		dom.append(this._subtitle!, $('span')).textContent = status;
		row.setAttribute('aria-label', localize('hostDrawer.computer.aria', "Sessions run on {0}, {1}. Change where sessions run.", computer.label, status));
	}
}
