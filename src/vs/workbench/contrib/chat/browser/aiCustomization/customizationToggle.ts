/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as DOM from '../../../../../base/browser/dom.js';
import { Switch } from '../../../../../base/browser/ui/toggle/switch.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';

export interface ICustomizationToggleOptions {
	readonly ariaLabel: string;
	readonly checked?: boolean | 'mixed';
	readonly disabled?: boolean;
}

export class CustomizationToggle extends Disposable {

	readonly domNode = DOM.$('span.customization-toggle');

	private readonly control: Switch;
	private readonly _onChange = this._register(new Emitter<boolean>());
	readonly onChange: Event<boolean> = this._onChange.event;

	private ariaLabel: string;
	private state: boolean | 'mixed';
	private isDisabled: boolean;
	private tabIndex = 0;

	constructor(options: ICustomizationToggleOptions) {
		super();
		this.ariaLabel = options.ariaLabel;
		this.state = options.checked ?? false;
		this.isDisabled = options.disabled ?? false;
		this.control = this._register(new Switch({ ariaLabel: this.ariaLabel, checked: this.state === true, disabled: this.isDisabled }));
		this.domNode.appendChild(this.control.domNode);
		this._register(this.control.onChange(checked => this.handleChange(checked)));
		this.applyState();
	}

	get checked(): boolean | 'mixed' {
		return this.state;
	}

	set checked(value: boolean | 'mixed') {
		this.state = value;
		this.applyState();
	}

	get disabled(): boolean {
		return this.isDisabled;
	}

	set disabled(value: boolean) {
		this.isDisabled = value;
		this.applyState();
	}

	setAriaLabel(ariaLabel: string, title = ariaLabel): void {
		this.ariaLabel = ariaLabel;
		this.control.setAriaLabel(ariaLabel, title);
	}

	setTabIndex(tabIndex: number): void {
		this.tabIndex = tabIndex;
		this.applyState();
	}

	private handleChange(checked: boolean): void {
		this.state = checked;
		this._onChange.fire(checked);
	}

	private applyState(): void {
		this.control.checked = this.state === true;
		this.control.disabled = this.isDisabled;
		this.control.domNode.classList.toggle('mixed', this.state === 'mixed');
		this.control.domNode.setAttribute('aria-checked', this.state === 'mixed' ? 'mixed' : String(this.state));
		this.control.domNode.tabIndex = this.isDisabled ? -1 : this.tabIndex;
	}
}
