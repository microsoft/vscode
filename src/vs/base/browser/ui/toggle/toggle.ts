/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IKeyboardEvent } from 'vs/base/browser/keyboardEvent';
import { BaseActionViewItem, IActionViewItemOptions } from 'vs/base/browser/ui/actionbar/actionViewItems';
import { Widget } from 'vs/base/browser/ui/widget';
import { IAction } from 'vs/base/common/actions';
import { Codicon } from 'vs/base/common/codicons';
import { ThemeIcon } from 'vs/base/common/themables';
import { Emitter, Event } from 'vs/base/common/event';
import { KeyCode } from 'vs/base/common/keyCodes';
import 'vs/css!./toggle';
import { isActiveElement, $, addDisposableListener, EventType } from 'vs/base/browser/dom';
import { getDefaultHoverDelegate } from 'vs/base/browser/ui/hover/hoverDelegateFactory';
import { IHoverDelegate } from 'vs/base/browser/ui/hover/hoverDelegate';
import type { IUpdatableHover } from 'vs/base/browser/ui/hover/hover';
import { getBaseLayerHoverDelegate } from 'vs/base/browser/ui/hover/hoverDelegate2';

export interface IToggleOpts extends IToggleStyles {
	readonly actionClassName?: string;
	readonly icon?: ThemeIcon;
	readonly title: string;
	readonly isChecked: boolean;
	readonly notFocusable?: boolean;
	readonly hoverDelegate?: IHoverDelegate;
}

export interface IToggleStyles {
	readonly inputActiveOptionBorder: string | undefined;
	readonly inputActiveOptionForeground: string | undefined;
	readonly inputActiveOptionBackground: string | undefined;
}

export interface ICheckboxStyles {
	readonly checkboxBackground: string | undefined;
	readonly checkboxBorder: string | undefined;
	readonly checkboxForeground: string | undefined;
}

export const unthemedToggleStyles = {
	inputActiveOptionBorder: '#007ACC00',
	inputActiveOptionForeground: '#FFFFFF',
	inputActiveOptionBackground: '#0E639C50'
};

export class ToggleActionViewItem extends BaseActionViewItem {

	protected readonly toggle: Toggle;

	constructor(context: any, action: IAction, options: IActionViewItemOptions) {
		super(context, action, options);

		this.toggle = this._register(new Toggle({
			actionClassName: this._action.class,
			isChecked: !!this._action.checked,
			title: (<IActionViewItemOptions>this.options).keybinding ? `${this._action.label} (${(<IActionViewItemOptions>this.options).keybinding})` : this._action.label,
			notFocusable: true,
			inputActiveOptionBackground: options.toggleStyles?.inputActiveOptionBackground,
			inputActiveOptionBorder: options.toggleStyles?.inputActiveOptionBorder,
			inputActiveOptionForeground: options.toggleStyles?.inputActiveOptionForeground,
			hoverDelegate: options.hoverDelegate
		}));
		this._register(this.toggle.onChange(() => this._action.checked = !!this.toggle && this.toggle.checked));
	}

	override render(container: HTMLElement): void {
		this.element = container;
		this.element.appendChild(this.toggle.domNode);
	}

	protected override updateEnabled(): void {
		if (this.toggle) {
			if (this.isEnabled()) {
				this.toggle.enable();
			} else {
				this.toggle.disable();
			}
		}
	}

	protected override updateChecked(): void {
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
	private _icon: ThemeIcon | undefined;
	readonly domNode: HTMLElement;

	private _checked: boolean;
	private _hover: IUpdatableHover;

	constructor(opts: IToggleOpts) {
		super();

		this._opts = opts;
		this._checked = this._opts.isChecked;

		const classes = ['monaco-custom-toggle'];
		if (this._opts.icon) {
			this._icon = this._opts.icon;
			classes.push(...ThemeIcon.asClassNameArray(this._icon));
		}
		if (this._opts.actionClassName) {
			classes.push(...this._opts.actionClassName.split(' '));
		}
		if (this._checked) {
			classes.push('checked');
		}

		this.domNode = document.createElement('div');
		this._hover = this._register(getBaseLayerHoverDelegate().setupUpdatableHover(opts.hoverDelegate ?? getDefaultHoverDelegate('mouse'), this.domNode, this._opts.title));
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

	setIcon(icon: ThemeIcon | undefined): void {
		if (this._icon) {
			this.domNode.classList.remove(...ThemeIcon.asClassNameArray(this._icon));
		}
		this._icon = icon;
		if (this._icon) {
			this.domNode.classList.add(...ThemeIcon.asClassNameArray(this._icon));
		}
	}

	width(): number {
		return 2 /*margin left*/ + 2 /*border*/ + 2 /*padding*/ + 16 /* icon width */;
	}

	protected applyStyles(): void {
		if (this.domNode) {
			this.domNode.style.borderColor = (this._checked && this._opts.inputActiveOptionBorder) || '';
			this.domNode.style.color = (this._checked && this._opts.inputActiveOptionForeground) || 'inherit';
			this.domNode.style.backgroundColor = (this._checked && this._opts.inputActiveOptionBackground) || '';
		}
	}

	enable(): void {
		this.domNode.setAttribute('aria-disabled', String(false));
	}

	disable(): void {
		this.domNode.setAttribute('aria-disabled', String(true));
	}

	setTitle(newTitle: string): void {
		this._hover.update(newTitle);
		this.domNode.setAttribute('aria-label', newTitle);
	}

	set visible(visible: boolean) {
		this.domNode.style.display = visible ? '' : 'none';
	}

	get visible() {
		return this.domNode.style.display !== 'none';
	}
}

export class Checkbox extends Widget {

	private readonly _onChange = this._register(new Emitter<boolean>());
	readonly onChange: Event<boolean /* via keyboard */> = this._onChange.event;

	private checkbox: Toggle;
	private styles: ICheckboxStyles;

	readonly domNode: HTMLElement;

	constructor(private title: string, private isChecked: boolean, styles: ICheckboxStyles) {
		super();

		this.checkbox = this._register(new Toggle({ title: this.title, isChecked: this.isChecked, icon: Codicon.check, actionClassName: 'monaco-checkbox', ...unthemedToggleStyles }));

		this.domNode = this.checkbox.domNode;

		this.styles = styles;

		this.applyStyles();

		this._register(this.checkbox.onChange(keyboard => {
			this.applyStyles();
			this._onChange.fire(keyboard);
		}));
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
		return isActiveElement(this.domNode);
	}

	enable(): void {
		this.checkbox.enable();
	}

	disable(): void {
		this.checkbox.disable();
	}

	protected applyStyles(): void {
		this.domNode.style.color = this.styles.checkboxForeground || '';
		this.domNode.style.backgroundColor = this.styles.checkboxBackground || '';
		this.domNode.style.borderColor = this.styles.checkboxBorder || '';
	}
}

export interface ICheckboxActionViewItemOptions extends IActionViewItemOptions {
	checkboxStyles: ICheckboxStyles;
}

export class CheckboxActionViewItem extends BaseActionViewItem {

	protected readonly toggle: Checkbox;
	private cssClass?: string;

	constructor(context: any, action: IAction, options: ICheckboxActionViewItemOptions) {
		super(context, action, options);

		this.toggle = this._register(new Checkbox(this._action.label, !!this._action.checked, options.checkboxStyles));
		this._register(this.toggle.onChange(() => this.onChange()));
	}

	override render(container: HTMLElement): void {
		this.element = container;
		this.element.classList.add('checkbox-action-item');
		this.element.appendChild(this.toggle.domNode);
		if ((<IActionViewItemOptions>this.options).label && this._action.label) {
			const label = this.element.appendChild($('span.checkbox-label', undefined, this._action.label));
			this._register(addDisposableListener(label, EventType.CLICK, (e: MouseEvent) => {
				this.toggle.checked = !this.toggle.checked;
				e.stopPropagation();
				e.preventDefault();
				this.onChange();
			}));
		}

		this.updateEnabled();
		this.updateClass();
		this.updateChecked();
	}

	private onChange(): void {
		this._action.checked = !!this.toggle && this.toggle.checked;
		this.actionRunner.run(this._action, this._context);
	}

	protected override updateEnabled(): void {
		if (this.isEnabled()) {
			this.toggle.enable();
		} else {
			this.toggle.disable();
		}
		if (this.action.enabled) {
			this.element?.classList.remove('disabled');
		} else {
			this.element?.classList.add('disabled');
		}
	}

	protected override updateChecked(): void {
		this.toggle.checked = !!this._action.checked;
	}

	protected override updateClass(): void {
		if (this.cssClass) {
			this.toggle.domNode.classList.remove(...this.cssClass.split(' '));
		}
		this.cssClass = this.getClass();
		if (this.cssClass) {
			this.toggle.domNode.classList.add(...this.cssClass.split(' '));
		}
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
