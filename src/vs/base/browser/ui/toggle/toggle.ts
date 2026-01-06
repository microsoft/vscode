/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IAction } from '../../../common/actions.js';
import { Codicon } from '../../../common/codicons.js';
import { Emitter, Event } from '../../../common/event.js';
import { IMarkdownString, isMarkdownString } from '../../../common/htmlContent.js';
import { getCodiconAriaLabel, stripIcons } from '../../../common/iconLabels.js';
import { KeyCode } from '../../../common/keyCodes.js';
import { ThemeIcon } from '../../../common/themables.js';
import { $, addDisposableListener, EventType, isActiveElement, isHTMLElement } from '../../dom.js';
import { IKeyboardEvent } from '../../keyboardEvent.js';
import { BaseActionViewItem, IActionViewItemOptions } from '../actionbar/actionViewItems.js';
import { IActionViewItemProvider } from '../actionbar/actionbar.js';
import { HoverStyle, IHoverLifecycleOptions } from '../hover/hover.js';
import { getBaseLayerHoverDelegate } from '../hover/hoverDelegate2.js';
import { Widget } from '../widget.js';
import './toggle.css';

export interface IToggleOpts extends IToggleStyles {
	readonly actionClassName?: string;
	readonly icon?: ThemeIcon;
	readonly title: string | IMarkdownString | HTMLElement;
	readonly isChecked: boolean;
	readonly notFocusable?: boolean;
	readonly hoverLifecycleOptions?: IHoverLifecycleOptions;
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
	readonly checkboxDisabledBackground: string | undefined;
	readonly checkboxDisabledForeground: string | undefined;
	readonly size?: number;
	readonly hoverLifecycleOptions?: IHoverLifecycleOptions;
}

export const unthemedToggleStyles = {
	inputActiveOptionBorder: '#007ACC00',
	inputActiveOptionForeground: '#FFFFFF',
	inputActiveOptionBackground: '#0E639C50'
};

export class ToggleActionViewItem extends BaseActionViewItem {

	protected readonly toggle: Toggle;

	constructor(context: unknown, action: IAction, options: IActionViewItemOptions) {
		super(context, action, options);

		const title = (<IActionViewItemOptions>this.options).keybinding ?
			`${this._action.label} (${(<IActionViewItemOptions>this.options).keybinding})` : this._action.label;
		this.toggle = this._register(new Toggle({
			actionClassName: this._action.class,
			isChecked: !!this._action.checked,
			title,
			notFocusable: true,
			inputActiveOptionBackground: options.toggleStyles?.inputActiveOptionBackground,
			inputActiveOptionBorder: options.toggleStyles?.inputActiveOptionBorder,
			inputActiveOptionForeground: options.toggleStyles?.inputActiveOptionForeground,
		}));
		this._register(this.toggle.onChange(() => {
			this._action.checked = !!this.toggle && this.toggle.checked;
		}));
	}

	override render(container: HTMLElement): void {
		this.element = container;
		this.element.appendChild(this.toggle.domNode);

		this.updateChecked();
		this.updateEnabled();
	}

	protected override updateEnabled(): void {
		if (this.toggle) {
			if (this.isEnabled()) {
				this.toggle.enable();
				this.element?.classList.remove('disabled');
			} else {
				this.toggle.disable();
				this.element?.classList.add('disabled');
			}
		}
	}

	protected override updateChecked(): void {
		this.toggle.checked = !!this._action.checked;
	}

	protected override updateLabel(): void {
		const title = (<IActionViewItemOptions>this.options).keybinding ?
			`${this._action.label} (${(<IActionViewItemOptions>this.options).keybinding})` : this._action.label;
		this.toggle.setTitle(title);
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
	get onChange(): Event<boolean /* via keyboard */> { return this._onChange.event; }

	private readonly _onKeyDown = this._register(new Emitter<IKeyboardEvent>());
	get onKeyDown(): Event<IKeyboardEvent> { return this._onKeyDown.event; }

	private readonly _opts: IToggleOpts;
	private _title: string | IMarkdownString | HTMLElement;
	private _icon: ThemeIcon | undefined;
	readonly domNode: HTMLElement;

	private _checked: boolean;

	constructor(opts: IToggleOpts) {
		super();

		this._opts = opts;
		this._title = this._opts.title;
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
		this._register(getBaseLayerHoverDelegate().setupDelayedHover(this.domNode, () => ({
			content: !isMarkdownString(this._title) && !isHTMLElement(this._title) ? stripIcons(this._title) : this._title,
			style: HoverStyle.Pointer,
		}), this._opts.hoverLifecycleOptions));
		this.domNode.classList.add(...classes);
		if (!this._opts.notFocusable) {
			this.domNode.tabIndex = 0;
		}
		this.domNode.setAttribute('role', 'checkbox');
		this.domNode.setAttribute('aria-checked', String(this._checked));

		this.setTitle(this._opts.title);
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
			if (!this.enabled) {
				return;
			}

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
		this.domNode.classList.remove('disabled');
	}

	disable(): void {
		this.domNode.setAttribute('aria-disabled', String(true));
		this.domNode.classList.add('disabled');
	}

	setTitle(newTitle: string | IMarkdownString | HTMLElement): void {
		this._title = newTitle;

		const ariaLabel = typeof newTitle === 'string' ? newTitle : isMarkdownString(newTitle) ? newTitle.value : newTitle.textContent;

		this.domNode.setAttribute('aria-label', getCodiconAriaLabel(ariaLabel));
	}

	set visible(visible: boolean) {
		this.domNode.style.display = visible ? '' : 'none';
	}

	get visible() {
		return this.domNode.style.display !== 'none';
	}
}


abstract class BaseCheckbox extends Widget {
	static readonly CLASS_NAME = 'monaco-checkbox';

	protected readonly _onChange = this._register(new Emitter<boolean>());
	readonly onChange: Event<boolean /* via keyboard */> = this._onChange.event;

	constructor(
		protected readonly checkbox: Toggle,
		readonly domNode: HTMLElement,
		protected readonly styles: ICheckboxStyles
	) {
		super();

		this.applyStyles();
	}

	get enabled(): boolean {
		return this.checkbox.enabled;
	}

	focus(): void {
		this.domNode.focus();
	}

	hasFocus(): boolean {
		return isActiveElement(this.domNode);
	}

	enable(): void {
		this.checkbox.enable();
		this.applyStyles(true);
	}

	disable(): void {
		this.checkbox.disable();
		this.applyStyles(false);
	}

	setTitle(newTitle: string): void {
		this.checkbox.setTitle(newTitle);
	}

	protected applyStyles(enabled = this.enabled): void {
		this.domNode.style.color = (enabled ? this.styles.checkboxForeground : this.styles.checkboxDisabledForeground) || '';
		this.domNode.style.backgroundColor = (enabled ? this.styles.checkboxBackground : this.styles.checkboxDisabledBackground) || '';
		this.domNode.style.borderColor = (enabled ? this.styles.checkboxBorder : this.styles.checkboxDisabledBackground) || '';

		const size = this.styles.size || 18;
		this.domNode.style.width =
			this.domNode.style.height =
			this.domNode.style.fontSize = `${size}px`;
		this.domNode.style.fontSize = `${size - 2}px`;
	}
}

export class Checkbox extends BaseCheckbox {
	constructor(title: string, isChecked: boolean, styles: ICheckboxStyles) {
		const toggle = new Toggle({ title, isChecked, icon: Codicon.check, actionClassName: BaseCheckbox.CLASS_NAME, hoverLifecycleOptions: styles.hoverLifecycleOptions, ...unthemedToggleStyles });
		super(toggle, toggle.domNode, styles);

		this._register(toggle);
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

	protected override applyStyles(enabled?: boolean): void {
		if (this.checkbox.checked) {
			this.checkbox.setIcon(Codicon.check);
		} else {
			this.checkbox.setIcon(undefined);
		}
		super.applyStyles(enabled);
	}
}

export class TriStateCheckbox extends BaseCheckbox {
	constructor(
		title: string,
		private _state: boolean | 'mixed',
		styles: ICheckboxStyles
	) {
		let icon: ThemeIcon | undefined;
		switch (_state) {
			case true:
				icon = Codicon.check;
				break;
			case 'mixed':
				icon = Codicon.dash;
				break;
			case false:
				icon = undefined;
				break;
		}
		const checkbox = new Toggle({
			title,
			isChecked: _state === true,
			icon,
			actionClassName: Checkbox.CLASS_NAME,
			hoverLifecycleOptions: styles.hoverLifecycleOptions,
			...unthemedToggleStyles
		});
		super(
			checkbox,
			checkbox.domNode,
			styles
		);

		this._register(checkbox);
		this._register(this.checkbox.onChange(keyboard => {
			this._state = this.checkbox.checked;
			this.applyStyles();
			this._onChange.fire(keyboard);
		}));
	}

	get checked(): boolean | 'mixed' {
		return this._state;
	}

	set checked(newState: boolean | 'mixed') {
		if (this._state !== newState) {
			this._state = newState;
			this.checkbox.checked = newState === true;
			this.applyStyles();
		}
	}

	protected override applyStyles(enabled?: boolean): void {
		switch (this._state) {
			case true:
				this.checkbox.setIcon(Codicon.check);
				break;
			case 'mixed':
				this.checkbox.setIcon(Codicon.dash);
				break;
			case false:
				this.checkbox.setIcon(undefined);
				break;
		}
		super.applyStyles(enabled);
	}
}

export interface ICheckboxActionViewItemOptions extends IActionViewItemOptions {
	checkboxStyles: ICheckboxStyles;
}

export class CheckboxActionViewItem extends BaseActionViewItem {

	protected readonly toggle: Checkbox;
	private cssClass?: string;

	constructor(context: unknown, action: IAction, options: ICheckboxActionViewItemOptions) {
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

/**
 * Creates an action view item provider that renders toggles for actions with a checked state
 * and falls back to default button rendering for regular actions.
 *
 * @param toggleStyles - Optional styles to apply to toggle items
 * @returns An IActionViewItemProvider that can be used with ActionBar
 */
export function createToggleActionViewItemProvider(toggleStyles?: IToggleStyles): IActionViewItemProvider {
	return (action: IAction, options: IActionViewItemOptions) => {
		// Only render as a toggle if the action has a checked property
		if (action.checked !== undefined) {
			return new ToggleActionViewItem(null, action, { ...options, toggleStyles });
		}
		// Return undefined to fall back to default button rendering
		return undefined;
	};
}
