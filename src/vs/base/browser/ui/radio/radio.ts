/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Widget } from '../widget.js';
import { ThemeIcon } from '../../../common/themables.js';
import { Emitter } from '../../../common/event.js';
import './radio.css';
import { $ } from '../../dom.js';
import { IHoverDelegate } from '../hover/hoverDelegate.js';
import { Button } from '../button/button.js';
import { DisposableMap, DisposableStore } from '../../../common/lifecycle.js';
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
	readonly isActive?: boolean;
	readonly disabled?: boolean;
}

export interface IRadioOptions {
	readonly items: ReadonlyArray<IRadioOptionItem>;
	readonly activeIcon?: ThemeIcon;
	readonly hoverDelegate?: IHoverDelegate;
}

export class Radio extends Widget {

	private readonly _onDidSelect = this._register(new Emitter<number>());
	readonly onDidSelect = this._onDidSelect.event;

	readonly domNode: HTMLElement;

	private readonly hoverDelegate: IHoverDelegate;

	private items: ReadonlyArray<IRadioOptionItem> = [];
	private activeItem: IRadioOptionItem | undefined;

	private readonly buttons = this._register(new DisposableMap<Button, { item: IRadioOptionItem; dispose(): void }>());

	constructor(opts: IRadioOptions) {
		super();

		this.hoverDelegate = opts.hoverDelegate ?? this._register(createInstantHoverDelegate());

		this.domNode = $('.monaco-custom-radio');
		this.domNode.setAttribute('role', 'radio');

		this.setItems(opts.items);
	}

	setItems(items: ReadonlyArray<IRadioOptionItem>): void {
		this.buttons.clearAndDisposeAll();
		this.items = items;
		this.activeItem = this.items.find(item => item.isActive) ?? this.items[0];
		for (let index = 0; index < this.items.length; index++) {
			const item = this.items[index];
			const disposables = new DisposableStore();
			const button = disposables.add(new Button(this.domNode, {
				hoverDelegate: this.hoverDelegate,
				title: item.tooltip,
				supportIcons: true,
			}));
			button.enabled = !item.disabled;
			disposables.add(button.onDidClick(() => {
				if (this.activeItem !== item) {
					this.activeItem = item;
					this.updateButtons();
					this._onDidSelect.fire(index);
				}
			}));
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
	}

	private updateButtons(): void {
		let isActive = false;
		for (const [button, { item }] of this.buttons) {
			const isPreviousActive = isActive;
			isActive = item === this.activeItem;
			button.element.classList.toggle('active', isActive);
			button.element.classList.toggle('previous-active', isPreviousActive);
			button.label = item.text;
		}
	}

}
