/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as DOM from '../../../../../base/browser/dom.js';
import { Switch } from '../../../../../base/browser/ui/toggle/switch.js';
import { Checkbox, TriStateCheckbox } from '../../../../../base/browser/ui/toggle/toggle.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { Disposable, DisposableStore, MutableDisposable } from '../../../../../base/common/lifecycle.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { defaultCheckboxStyles } from '../../../../../platform/theme/browser/defaultStyles.js';
import { ChatConfiguration } from '../../common/constants.js';

export const enum CustomizationToggleStyle {
	Checkbox = 'checkbox',
	Switch = 'switch',
}

export interface ICustomizationToggleOptions {
	readonly ariaLabel: string;
	readonly checked?: boolean | 'mixed';
	readonly disabled?: boolean;
	readonly triState?: boolean;
}

export class CustomizationToggle extends Disposable {

	readonly domNode = DOM.$('span.customization-toggle');

	private readonly controlDisposables = this._register(new MutableDisposable<DisposableStore>());
	private control: Checkbox | TriStateCheckbox | Switch | undefined;
	private readonly _onChange = this._register(new Emitter<boolean>());
	readonly onChange: Event<boolean> = this._onChange.event;

	private ariaLabel: string;
	private state: boolean | 'mixed';
	private isDisabled: boolean;
	private tabIndex = 0;

	constructor(
		private readonly options: ICustomizationToggleOptions,
		@IConfigurationService private readonly configurationService: IConfigurationService,
	) {
		super();
		this.ariaLabel = options.ariaLabel;
		this.state = options.checked ?? false;
		this.isDisabled = options.disabled ?? false;
		this.render();
		this._register(this.configurationService.onDidChangeConfiguration(event => {
			if (event.affectsConfiguration(ChatConfiguration.ChatCustomizationsToggleStyle)) {
				this.render();
			}
		}));
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
		const control = this.control;
		if (control instanceof Switch) {
			control.setAriaLabel(ariaLabel, title);
		} else {
			control?.setTitle(title);
		}
	}

	setTabIndex(tabIndex: number): void {
		this.tabIndex = tabIndex;
		this.applyState();
	}

	private render(): void {
		this.controlDisposables.clear();
		const disposables = new DisposableStore();
		this.controlDisposables.value = disposables;
		DOM.clearNode(this.domNode);
		const style = this.configurationService.getValue<CustomizationToggleStyle>(ChatConfiguration.ChatCustomizationsToggleStyle) ?? CustomizationToggleStyle.Switch;
		this.domNode.classList.toggle('checkbox', style === CustomizationToggleStyle.Checkbox);
		this.domNode.classList.toggle('switch', style === CustomizationToggleStyle.Switch);
		if (style === CustomizationToggleStyle.Checkbox) {
			const checkbox = this.options.triState
				? new TriStateCheckbox(this.ariaLabel, this.state, defaultCheckboxStyles)
				: new Checkbox(this.ariaLabel, this.state === true, defaultCheckboxStyles);
			this.control = disposables.add(checkbox);
			this.domNode.appendChild(checkbox.domNode);
			disposables.add(checkbox.onChange(() => this.handleChange(checkbox.checked === true)));
		} else {
			const toggle = new Switch({ ariaLabel: this.ariaLabel, checked: this.state === true, disabled: this.isDisabled });
			this.control = disposables.add(toggle);
			this.domNode.appendChild(toggle.domNode);
			disposables.add(toggle.onChange(checked => this.handleChange(checked)));
		}
		this.applyState();
	}

	private handleChange(checked: boolean): void {
		this.state = checked;
		this._onChange.fire(checked);
	}

	private applyState(): void {
		const control = this.control;
		if (!control) {
			return;
		}
		if (control instanceof Switch) {
			control.checked = this.state === true;
			control.disabled = this.isDisabled;
			control.domNode.classList.toggle('mixed', this.state === 'mixed');
			control.domNode.setAttribute('aria-checked', this.state === 'mixed' ? 'mixed' : String(this.state));
			control.domNode.tabIndex = this.isDisabled ? -1 : this.tabIndex;
		} else {
			control.checked = this.options.triState ? this.state : this.state === true;
			if (this.isDisabled) {
				control.disable();
			} else {
				control.enable();
				control.domNode.tabIndex = this.tabIndex;
			}
		}
	}
}
