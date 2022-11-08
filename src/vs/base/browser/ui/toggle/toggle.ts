/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IKeyboardEvent } from 'vs/base/browser/keyboardEvent';
import { BaseActionViewItem, IActionViewItemOptions } from 'vs/base/browser/ui/actionbar/actionViewItems';
import { Widget } from 'vs/base/browser/ui/widget';
import { IAction } from 'vs/base/common/actions';
import { Codicon, CSSIcon } from 'vs/base/common/codicons';
import { Color } from 'vs/base/common/color';
import { Emitter, Event } from 'vs/base/common/event';
import { KeyCode } from 'vs/base/common/keyCodes';
import 'vs/css!./toggle';

export interface IToggleOpts extends IToggleStyles {
	readonly actionClassName?: string;
	readonly icon?: CSSIcon;
	readonly title: string;
	readonly isChecked: boolean;
	readonly notFocusable?: boolean;
}

export interface IToggleStyles {
	inputActiveOptionBorder?: Color;
	inputActiveOptionForeground?: Color;
	inputActiveOptionBackground?: Color;
}

export interface ICheckboxStyles {
	checkboxBackground?: Color;
	checkboxBorder?: Color;
	checkboxForeground?: Color;
}

const defaultOpts = {
	inputActiveOptionBorder: Color.fromHex('#007ACC00'),
	inputActiveOptionForeground: Color.fromHex('#FFFFFF'),
	inputActiveOptionBackground: Color.fromHex('#0E639C50')
};

export class ToggleActionViewItem extends BaseActionViewItem {

	protected readonly toggle: Toggle;

	constructor(context: any, action: IAction, options: IActionViewItemOptions | undefined) {
		super(context, action, options);
		this.toggle = this._register(new Toggle({
			actionClassName: this._action.class,
			isChecked: !!this._action.checked,
			title: (<IActionViewItemOptions>this.options).keybinding ? `${this._action.label} (${(<IActionViewItemOptions>this.options).keybinding})` : this._action.label,
			notFocusable: true
		}));
		this._register(this.toggle.onChange(() => this._action.checked = !!this.toggle && this.toggle.checked));
	}

	override render(container: HTMLElement): void {
		this.element = container;
		this.element.appendChild(this.toggle.domNode);
	}

	override updateEnabled(): void {
		if (this.toggle) {
			if (this.isEnabled()) {
				this.toggle.enable();
			} else {
				this.toggle.disable();
			}
		}
	}

	override updateChecked(): void {
		this.toggle.checked = !!this._action.checked;
	}

	override focus(): void {
		this.toggle.domNode.tabIndex = 0;
		this.toggle.focus();
	}

	override blur(): void {
		this.toggle.domNode.tabIndex = -1;
		this.toggle.domNode.blur();
	}

	override setFocusable(focusable: boolean): void {
		this.toggle.domNode.tabIndex = focusable ? 0 : -1;
	}

}

export class Toggle extends Widget {

	private readonly _onChange = this._register(new Emitter<boolean>());
	readonly onChange: Event<boolean /* via keyboard */> = this._onChange.event;

	private readonly _onKeyDown = this._register(new Emitter<IKeyboardEvent>());
	readonly onKeyDown: Event<IKeyboardEvent> = this._onKeyDown.event;

	private readonly _opts: IToggleOpts;
	private _icon: CSSIcon | undefined;
	readonly domNode: HTMLElement;

	private _checked: boolean;

	constructor(opts: IToggleOpts) {
		super();

		this._opts = { ...defaultOpts, ...opts };
		this._checked = this._opts.isChecked;

		const classes = ['monaco-custom-toggle'];
		if (this._opts.icon) {
			this._icon = this._opts.icon;
			classes.push(...CSSIcon.asClassNameArray(this._icon));
		}
		if (this._opts.actionClassName) {
			classes.push(...this._opts.actionClassName.split(' '));
		}
		if (this._checked) {
			classes.push('checked');
		}

		this.domNode = document.createElement('div');
		this.domNode.title = this._opts.title;
		this.domNode.classList.add(...classes);
		if (!this._opts.notFocusable) {
			this.domNode.tabIndex = 0;
		}
		this.domNode.setAttribute('role', 'checkbox');
		this.domNode.setAttribute('aria-checked', String(this._checked));
		this.domNode.setAttribute('aria-label', this._opts.title);

		this.applyStyles();

		this.onclick(this.domNode, (ev) => {
			if (this.enabled) {
				this.checked = !this._checked;
				this._onChange.fire(false);
				ev.preventDefault();
			}
		});

		this._register(this.ignoreGesture(this.domNode));

		this.onkeydown(this.domNode, (keyboardEvent) => {
			if (keyboardEvent.keyCode === KeyCode.Space || keyboardEvent.keyCode === KeyCode.Enter) {
				this.checked = !this._checked;
				this._onChange.fire(true);
				keyboardEvent.preventDefault();
				keyboardEvent.stopPropagation();
				return;
			}

			this._onKeyDown.fire(keyboardEvent);
		});
	}

	get enabled(): boolean {
		return this.domNode.getAttribute('aria-disabled') !== 'true';
	}

	focus(): void {
		this.domNode.focus();
	}

	get checked(): boolean {
		return this._checked;
	}

	set checked(newIsChecked: boolean) {
		this._checked = newIsChecked;

		this.domNode.setAttribute('aria-checked', String(this._checked));
		this.domNode.classList.toggle('checked', this._checked);

		this.applyStyles();
	}

	setIcon(icon: CSSIcon | undefined): void {
		if (this._icon) {
			this.domNode.classList.remove(...CSSIcon.asClassNameArray(this._icon));
		}
		this._icon = icon;
		if (this._icon) {
			this.domNode.classList.add(...CSSIcon.asClassNameArray(this._icon));
		}
	}

	width(): number {
		return 2 /*margin left*/ + 2 /*border*/ + 2 /*padding*/ + 16 /* icon width */;
	}

	style(styles: IToggleStyles): void {
		if (styles.inputActiveOptionBorder) {
			this._opts.inputActiveOptionBorder = styles.inputActiveOptionBorder;
		}
		if (styles.inputActiveOptionForeground) {
			this._opts.inputActiveOptionForeground = styles.inputActiveOptionForeground;
		}
		if (styles.inputActiveOptionBackground) {
			this._opts.inputActiveOptionBackground = styles.inputActiveOptionBackground;
		}
		this.applyStyles();
	}

	protected applyStyles(): void {
		if (this.domNode) {
			this.domNode.style.borderColor = this._checked && this._opts.inputActiveOptionBorder ? this._opts.inputActiveOptionBorder.toString() : '';
			this.domNode.style.color = this._checked && this._opts.inputActiveOptionForeground ? this._opts.inputActiveOptionForeground.toString() : 'inherit';
			this.domNode.style.backgroundColor = this._checked && this._opts.inputActiveOptionBackground ? this._opts.inputActiveOptionBackground.toString() : '';
		}
	}

	enable(): void {
		this.domNode.setAttribute('aria-disabled', String(false));
	}

	disable(): void {
		this.domNode.setAttribute('aria-disabled', String(true));
	}

	setTitle(newTitle: string): void {
		this.domNode.title = newTitle;
		this.domNode.setAttribute('aria-label', newTitle);
	}
}

export class Checkbox extends Widget {
	private checkbox: Toggle;
	private styles: ICheckboxStyles;

	readonly domNode: HTMLElement;

	constructor(private title: string, private isChecked: boolean) {
		super();

		this.checkbox = new Toggle({ title: this.title, isChecked: this.isChecked, icon: Codicon.check, actionClassName: 'monaco-checkbox' });

		this.domNode = this.checkbox.domNode;

		this.styles = {};

		this.checkbox.onChange(() => {
			this.applyStyles();
		});
	}

	get checked(): boolean {
		return this.checkbox.checked;
	}

	set checked(newIsChecked: boolean) {
		this.checkbox.checked = newIsChecked;

		this.applyStyles();
	}

	focus(): void {
		this.domNode.focus();
	}

	hasFocus(): boolean {
		return this.domNode === document.activeElement;
	}

	style(styles: ICheckboxStyles): void {
		this.styles = styles;

		this.applyStyles();
	}

	protected applyStyles(): void {
		this.domNode.style.color = this.styles.checkboxForeground ? this.styles.checkboxForeground.toString() : '';
		this.domNode.style.backgroundColor = this.styles.checkboxBackground ? this.styles.checkboxBackground.toString() : '';
		this.domNode.style.borderColor = this.styles.checkboxBorder ? this.styles.checkboxBorder.toString() : '';
	}
}
