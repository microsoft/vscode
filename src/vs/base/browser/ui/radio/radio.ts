/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Widget } from '../widget.js';
import { ThemeIcon } from '../../../common/themables.js';
import { Emitter } from '../../../common/event.js';
import './radio.css';
import { $, addDisposableListener, EventHelper, EventType } from '../../dom.js';
import { StandardKeyboardEvent } from '../../keyboardEvent.js';
import { KeyCode } from '../../../common/keyCodes.js';
import { IHoverDelegate } from '../hover/hoverDelegate.js';
import { Button } from '../button/button.js';
import { Disposable, DisposableMap, DisposableStore, IDisposable, toDisposable } from '../../../common/lifecycle.js';
import { createInstantHoverDelegate } from '../hover/hoverDelegateFactory.js';

export interface IRadioStyles {
	readonly activeForeground?: string;
	readonly activeBackground?: string;
	readonly activeBorder?: string;
	readonly inactiveForeground?: string;
	readonly inactiveBackground?: string;
	readonly inactiveHoverBackground?: string;
	readonly inactiveBorder?: string;
}

export interface IRadioOptionItem {
	readonly text: string;
	readonly tooltip?: string;
	/** Accessible name. Defaults to {@link tooltip} ?? {@link text}. Set it when {@link text} is icon-only. */
	readonly ariaLabel?: string;
	readonly isActive?: boolean;
	readonly disabled?: boolean;
}

export interface IRadioOptions {
	readonly items: ReadonlyArray<IRadioOptionItem>;
	readonly activeIcon?: ThemeIcon;
	readonly hoverDelegate?: IHoverDelegate;
	/** Accessible name of the radio group. */
	readonly ariaLabel?: string;
	/** Extra class added to {@link Radio.domNode}, e.g. `segmented` for the pill appearance. */
	readonly className?: string;
	/**
	 * How arrow keys behave. `select` (default) moves focus and selects, matching the
	 * ARIA radiogroup pattern. `focus` only moves focus, and Enter or Space selects —
	 * use it when selecting has a side effect the user should be able to travel past.
	 */
	readonly arrowKeyBehavior?: 'select' | 'focus';
}

export class Radio extends Widget {

	private readonly _onDidSelect = this._register(new Emitter<number>());
	readonly onDidSelect = this._onDidSelect.event;

	private readonly _onDidActivate = this._register(new Emitter<number>());
	/** Fires on click, Enter, or Space, even when the item is already selected. */
	readonly onDidActivate = this._onDidActivate.event;

	readonly domNode: HTMLElement;

	private readonly hoverDelegate: IHoverDelegate;
	private readonly arrowKeyBehavior: 'select' | 'focus';

	private items: ReadonlyArray<IRadioOptionItem> = [];
	private activeItem: IRadioOptionItem | undefined;
	private orderedButtons: Button[] = [];

	private readonly buttons = this._register(new DisposableMap<Button, { item: IRadioOptionItem; dispose(): void }>());

	constructor(opts: IRadioOptions) {
		super();

		this.hoverDelegate = opts.hoverDelegate ?? this._register(createInstantHoverDelegate());
		this.arrowKeyBehavior = opts.arrowKeyBehavior ?? 'select';

		this.domNode = $('.monaco-custom-radio');
		if (opts.className) {
			this.domNode.classList.add(opts.className);
		}
		this.domNode.setAttribute('role', 'radiogroup');
		if (opts.ariaLabel) {
			this.domNode.setAttribute('aria-label', opts.ariaLabel);
		}

		this.setItems(opts.items);
	}

	/** The option buttons in item order, for callers that need to measure or decorate them. */
	get optionElements(): readonly HTMLElement[] {
		return this.orderedButtons.map(button => button.element);
	}
	/** Shows `text` on an option until the returned disposable puts the item's own label back. */
	overrideOptionLabel(index: number, text: string): IDisposable {
		const button = this.orderedButtons[index];
		const item = this.items[index];
		if (!button || !item) {
			return Disposable.None;
		}
		this.setButtonLabel(button, text);
		return toDisposable(() => this.setButtonLabel(button, item.text));
	}

	setItems(items: ReadonlyArray<IRadioOptionItem>): void {
		this.buttons.clearAndDisposeAll();
		this.orderedButtons = [];
		this.items = items;
		this.activeItem = this.items.find(item => item.isActive) ?? this.items[0];
		for (let index = 0; index < this.items.length; index++) {
			const item = this.items[index];
			const disposables = new DisposableStore();
			const button = disposables.add(new Button(this.domNode, {
				hoverDelegate: this.hoverDelegate,
				title: item.tooltip,
				ariaLabel: item.ariaLabel,
				supportIcons: true,
			}));
			button.element.setAttribute('role', 'radio');
			button.enabled = !item.disabled;
			disposables.add(button.onDidClick(() => {
				this.selectItem(index);
				this._onDidActivate.fire(index);
			}));
			disposables.add(addDisposableListener(button.element, EventType.KEY_DOWN, e => {
				const event = new StandardKeyboardEvent(e);
				const delta = event.equals(KeyCode.RightArrow) || event.equals(KeyCode.DownArrow) ? 1
					: event.equals(KeyCode.LeftArrow) || event.equals(KeyCode.UpArrow) ? -1 : 0;
				if (delta === 0) {
					return;
				}
				EventHelper.stop(e, true);
				this.navigate(index, delta);
			}));
			this.orderedButtons.push(button);
			this.buttons.set(button, { item, dispose: () => disposables.dispose() });
		}
		this.updateButtons();
	}

	setActiveItem(index: number): void {
		if (index < 0 || index >= this.items.length) {
			throw new Error('Invalid Index');
		}
		this.activeItem = this.items[index];
		this.updateButtons();
	}

	setEnabled(enabled: boolean): void {
		for (const [button] of this.buttons) {
			button.enabled = enabled;
		}
		this.updateButtons();
	}

	/** Moves focus to the active item, for callers that rebuild the row after a selection. */
	focusActiveItem(): void {
		const index = this.activeItem ? this.items.indexOf(this.activeItem) : -1;
		if (index !== -1) {
			this.focusItem(index);
		}
	}

	/** Moves focus to an item without selecting it. */
	focusItem(index: number): void {
		if (!this.orderedButtons[index]) {
			throw new Error('Invalid Index');
		}
		for (let candidate = 0; candidate < this.orderedButtons.length; candidate++) {
			this.orderedButtons[candidate].element.tabIndex = candidate === index ? 0 : -1;
		}
		this.orderedButtons[index].focus();
	}

	private selectItem(index: number): void {
		const item = this.items[index];
		if (!item || this.activeItem === item) {
			return;
		}
		this.activeItem = item;
		this.updateButtons();
		this._onDidSelect.fire(index);
	}

	/** Moves to the next enabled item in `delta` direction, wrapping around the ends. */
	private navigate(from: number, delta: number): void {
		const count = this.items.length;
		for (let offset = 1; offset <= count; offset++) {
			const index = (((from + delta * offset) % count) + count) % count;
			if (this.items[index].disabled) {
				continue;
			}
			if (this.arrowKeyBehavior === 'select') {
				this.selectItem(index);
			}
			this.focusItem(index);
			return;
		}
	}

	private setButtonLabel(button: Button, text: string): void {
		button.label = text;
		if (this.domNode.classList.contains('segmented')) {
			for (const element of button.element.children) {
				if (!element.classList.contains('codicon')) {
					element.setAttribute('data-label', element.textContent ?? '');
				}
			}
		}
	}

	private updateButtons(): void {
		let isActive = false;
		for (const [button, { item }] of this.buttons) {
			const isPreviousActive = isActive;
			isActive = item === this.activeItem;
			button.element.classList.toggle('active', isActive);
			button.element.classList.toggle('previous-active', isPreviousActive);
			button.element.setAttribute('aria-checked', String(isActive));
			button.element.tabIndex = isActive ? 0 : -1;
			this.setButtonLabel(button, item.text);
		}
	}

}
