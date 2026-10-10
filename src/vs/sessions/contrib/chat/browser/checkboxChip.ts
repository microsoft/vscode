/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../base/browser/dom.js';
import { Checkbox } from '../../../../base/browser/ui/toggle/toggle.js';
import { Gesture, EventType as TouchEventType } from '../../../../base/browser/touch.js';
import { Disposable, DisposableStore, IDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { defaultCheckboxStyles } from '../../../../platform/theme/browser/defaultStyles.js';
import './media/checkboxChip.css';

/** Static configuration for a {@link CheckboxChip}. */
export interface ICheckboxChipOptions {
	readonly label: string;
	readonly ariaLabel: string;
	readonly onToggle: (checked: boolean) => void;
	/** Extra class on the slot, for call-site-specific styling or test selectors. */
	readonly slotClassName?: string;
	readonly markTarget?: (element: HTMLElement) => IDisposable;
}

/** Per-update state for a {@link CheckboxChip}. */
export interface ICheckboxChipState {
	readonly checked: boolean;
	readonly state: 'enabled' | 'disabled' | 'hidden';
	/** Shown as a tooltip while `disabled`, explaining why the choice is unavailable. */
	readonly disabledReason?: string;
}

/**
 * A checkbox rendered as a chip in the new-session chip lane, matching the dropdown chips beside
 * it. For binary session choices that would otherwise be a two-item dropdown.
 *
 * The whole row is clickable, and a disabled chip stays focusable so keyboard users can reach
 * {@link ICheckboxChipState.disabledReason}.
 */
export class CheckboxChip extends Disposable {

	private readonly _renderDisposables = this._register(new DisposableStore());
	private _slot: HTMLElement | undefined;
	private _row: HTMLElement | undefined;
	private _checkbox: Checkbox | undefined;
	private _state: ICheckboxChipState = { checked: false, state: 'disabled' };

	constructor(private readonly _options: ICheckboxChipOptions) {
		super();
	}

	/** The rendered slot, or `undefined` before the first {@link render}. */
	get element(): HTMLElement | undefined {
		return this._slot;
	}

	render(container: HTMLElement): HTMLElement {
		this._renderDisposables.clear();

		const slot = dom.append(container, dom.$('.sessions-chat-picker-slot.sessions-chat-checkbox-chip'));
		if (this._options.slotClassName) {
			slot.classList.add(this._options.slotClassName);
		}
		this._slot = slot;
		this._renderDisposables.add(toDisposable(() => {
			slot.remove();
			if (this._slot === slot) {
				this._slot = undefined;
			}
		}));
		if (this._options.markTarget) {
			this._renderDisposables.add(this._options.markTarget(slot));
		}

		const row = dom.append(slot, dom.$('.action-label'));
		row.setAttribute('aria-label', this._options.ariaLabel);
		this._row = row;

		const checkbox = this._renderDisposables.add(new Checkbox(this._options.label, this._state.checked, { ...defaultCheckboxStyles, size: 14 }));
		this._checkbox = checkbox;
		dom.append(row, checkbox.domNode);
		const label = dom.append(row, dom.$('span.sessions-chat-dropdown-label'));
		label.textContent = this._options.label;

		this._renderDisposables.add(checkbox.onChange(() => this._options.onToggle(checkbox.checked)));
		this._renderDisposables.add(Gesture.addTarget(row));
		for (const eventType of [dom.EventType.CLICK, TouchEventType.Tap]) {
			this._renderDisposables.add(dom.addDisposableListener(row, eventType, e => {
				if (!checkbox.enabled) {
					return;
				}
				dom.EventHelper.stop(e, true);
				checkbox.checked = !checkbox.checked;
				this._options.onToggle(checkbox.checked);
			}));
		}

		this._apply();
		return slot;
	}

	update(state: ICheckboxChipState): void {
		this._state = state;
		this._apply();
	}

	private _apply(): void {
		const checkbox = this._checkbox;
		const slot = this._slot;
		if (!checkbox || !slot) {
			return;
		}
		const { checked, state, disabledReason } = this._state;
		checkbox.checked = checked;
		if (state === 'enabled') {
			checkbox.enable();
		} else {
			checkbox.disable();
			// Keep focusable so keyboard users can discover the disabled reason via its tooltip.
			checkbox.domNode.tabIndex = 0;
		}
		slot.classList.toggle('disabled', state === 'disabled');
		slot.classList.toggle('hidden', state === 'hidden');

		if (this._row) {
			if (state === 'disabled' && disabledReason) {
				this._row.title = disabledReason;
			} else {
				this._row.removeAttribute('title');
			}
		}
	}
}
