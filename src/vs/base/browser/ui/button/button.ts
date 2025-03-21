/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IContextMenuProvider } from '../../contextmenu.js';
import { addDisposableListener, EventHelper, EventType, IFocusTracker, isActiveElement, reset, trackFocus, $ } from '../../dom.js';
import dompurify from '../../dompurify/dompurify.js';
import { StandardKeyboardEvent } from '../../keyboardEvent.js';
import { renderMarkdown, renderStringAsPlaintext } from '../../markdownRenderer.js';
import { Gesture, EventType as TouchEventType } from '../../touch.js';
import { createInstantHoverDelegate, getDefaultHoverDelegate } from '../hover/hoverDelegateFactory.js';
import { IHoverDelegate } from '../hover/hoverDelegate.js';
import { renderLabelWithIcons } from '../iconLabel/iconLabels.js';
import { Action, IAction, IActionRunner } from '../../../common/actions.js';
import { Codicon } from '../../../common/codicons.js';
import { Color } from '../../../common/color.js';
import { Event as BaseEvent, Emitter } from '../../../common/event.js';
import { IMarkdownString, isMarkdownString, markdownStringEqual } from '../../../common/htmlContent.js';
import { KeyCode } from '../../../common/keyCodes.js';
import { Disposable, DisposableStore, IDisposable } from '../../../common/lifecycle.js';
import { ThemeIcon } from '../../../common/themables.js';
import './button.css';
import { localize } from '../../../../nls.js';
import type { IManagedHover } from '../hover/hover.js';
import { getBaseLayerHoverDelegate } from '../hover/hoverDelegate2.js';
import { IActionProvider } from '../dropdown/dropdown.js';

export interface IButtonOptions extends Partial<IButtonStyles> {
	readonly title?: boolean | string;
	/**
	 * Will fallback to `title` if not set.
	 */
	readonly ariaLabel?: string;
	readonly supportIcons?: boolean;
	readonly supportShortLabel?: boolean;
	readonly secondary?: boolean;
	readonly hoverDelegate?: IHoverDelegate;
}

export interface IButtonStyles {
	readonly buttonBackground: string | undefined;
	readonly buttonHoverBackground: string | undefined;
	readonly buttonForeground: string | undefined;
	readonly buttonSeparator: string | undefined;
	readonly buttonSecondaryBackground: string | undefined;
	readonly buttonSecondaryHoverBackground: string | undefined;
	readonly buttonSecondaryForeground: string | undefined;
	readonly buttonBorder: string | undefined;
}

export const unthemedButtonStyles: IButtonStyles = {
	buttonBackground: '#0E639C',
	buttonHoverBackground: '#006BB3',
	buttonSeparator: Color.white.toString(),
	buttonForeground: Color.white.toString(),
	buttonBorder: undefined,
	buttonSecondaryBackground: undefined,
	buttonSecondaryForeground: undefined,
	buttonSecondaryHoverBackground: undefined
};

export interface IButton extends IDisposable {
	readonly element: HTMLElement;
	readonly onDidClick: BaseEvent<Event | undefined>;

	set label(value: string | IMarkdownString);
	set icon(value: ThemeIcon);
	set enabled(value: boolean);
	set checked(value: boolean);

	focus(): void;
	hasFocus(): boolean;
}

export interface IButtonWithDescription extends IButton {
	description: string;
}

export class Button extends Disposable implements IButton {

	protected options: IButtonOptions;
	protected _element: HTMLElement;
	protected _label: string | IMarkdownString = '';
	protected _labelElement: HTMLElement | undefined;
	protected _labelShortElement: HTMLElement | undefined;
	private _hover: IManagedHover | undefined;

	private _onDidClick = this._register(new Emitter<Event>());
	get onDidClick(): BaseEvent<Event> { return this._onDidClick.event; }

	private _onDidEscape = this._register(new Emitter<Event>());
	get onDidEscape(): BaseEvent<Event> { return this._onDidEscape.event; }

	private focusTracker: IFocusTracker;

	constructor(container: HTMLElement, options: IButtonOptions) {
		super();

		this.options = options;

		this._element = document.createElement('a');
		this._element.classList.add('monaco-button');
		this._element.tabIndex = 0;
		this._element.setAttribute('role', 'button');

		this._element.classList.toggle('secondary', !!options.secondary);
		const background = options.secondary ? options.buttonSecondaryBackground : options.buttonBackground;
		const foreground = options.secondary ? options.buttonSecondaryForeground : options.buttonForeground;

		this._element.style.color = foreground || '';
		this._element.style.backgroundColor = background || '';

		if (options.supportShortLabel) {
			this._labelShortElement = document.createElement('div');
			this._labelShortElement.classList.add('monaco-button-label-short');
			this._element.appendChild(this._labelShortElement);

			this._labelElement = document.createElement('div');
			this._labelElement.classList.add('monaco-button-label');
			this._element.appendChild(this._labelElement);

			this._element.classList.add('monaco-text-button-with-short-label');
		}

		if (typeof options.title === 'string') {
			this.setTitle(options.title);
		}

		if (typeof options.ariaLabel === 'string') {
			this._element.setAttribute('aria-label', options.ariaLabel);
		}
		container.appendChild(this._element);

		this._register(Gesture.addTarget(this._element));

		[EventType.CLICK, TouchEventType.Tap].forEach(eventType => {
			this._register(addDisposableListener(this._element, eventType, e => {
				if (!this.enabled) {
					EventHelper.stop(e);
					return;
				}

				this._onDidClick.fire(e);
			}));
		});

		this._register(addDisposableListener(this._element, EventType.KEY_DOWN, e => {
			const event = new StandardKeyboardEvent(e);
			let eventHandled = false;
			if (this.enabled && (event.equals(KeyCode.Enter) || event.equals(KeyCode.Space))) {
				this._onDidClick.fire(e);
				eventHandled = true;
			} else if (event.equals(KeyCode.Escape)) {
				this._onDidEscape.fire(e);
				this._element.blur();
				eventHandled = true;
			}

			if (eventHandled) {
				EventHelper.stop(event, true);
			}
		}));

		this._register(addDisposableListener(this._element, EventType.MOUSE_OVER, e => {
			if (!this._element.classList.contains('disabled')) {
				this.updateBackground(true);
			}
		}));

		this._register(addDisposableListener(this._element, EventType.MOUSE_OUT, e => {
			this.updateBackground(false); // restore standard styles
		}));

		// Also set hover background when button is focused for feedback
		this.focusTracker = this._register(trackFocus(this._element));
		this._register(this.focusTracker.onDidFocus(() => { if (this.enabled) { this.updateBackground(true); } }));
		this._register(this.focusTracker.onDidBlur(() => { if (this.enabled) { this.updateBackground(false); } }));
	}

	public override dispose(): void {
		super.dispose();
		this._element.remove();
	}

	protected getContentElements(content: string): HTMLElement[] {
		const elements: HTMLSpanElement[] = [];
		for (let segment of renderLabelWithIcons(content)) {
			if (typeof (segment) === 'string') {
				segment = segment.trim();

				// Ignore empty segment
				if (segment === '') {
					continue;
				}

				// Convert string segments to <span> nodes
				const node = document.createElement('span');
				node.textContent = segment;
				elements.push(node);
			} else {
				elements.push(segment);
			}
		}

		return elements;
	}

	private updateBackground(hover: boolean): void {
		let background;
		if (this.options.secondary) {
			background = hover ? this.options.buttonSecondaryHoverBackground : this.options.buttonSecondaryBackground;
		} else {
			background = hover ? this.options.buttonHoverBackground : this.options.buttonBackground;
		}
		if (background) {
			this._element.style.backgroundColor = background;
		}
	}

	get element(): HTMLElement {
		return this._element;
	}

	set label(value: string | IMarkdownString) {
		if (this._label === value) {
			return;
		}

		if (isMarkdownString(this._label) && isMarkdownString(value) && markdownStringEqual(this._label, value)) {
			return;
		}

		this._element.classList.add('monaco-text-button');
		const labelElement = this.options.supportShortLabel ? this._labelElement! : this._element;

		if (isMarkdownString(value)) {
			const rendered = renderMarkdown(value, { inline: true });
			rendered.dispose();

			// Don't include outer `<p>`
			const root = rendered.element.querySelector('p')?.innerHTML;
			if (root) {
				// Only allow a very limited set of inline html tags
				const sanitized = dompurify.sanitize(root, { ADD_TAGS: ['b', 'i', 'u', 'code', 'span'], ALLOWED_ATTR: ['class'], RETURN_TRUSTED_TYPE: true });
				labelElement.innerHTML = sanitized as unknown as string;
			} else {
				reset(labelElement);
			}
		} else {
			if (this.options.supportIcons) {
				reset(labelElement, ...this.getContentElements(value));
			} else {
				labelElement.textContent = value;
			}
		}

		let title: string = '';
		if (typeof this.options.title === 'string') {
			title = this.options.title;
		} else if (this.options.title) {
			title = renderStringAsPlaintext(value);
		}

		this.setTitle(title);

		this._setAriaLabel();

		this._label = value;
	}

	get label(): string | IMarkdownString {
		return this._label;
	}

	set labelShort(value: string) {
		if (!this.options.supportShortLabel || !this._labelShortElement) {
			return;
		}

		if (this.options.supportIcons) {
			reset(this._labelShortElement, ...this.getContentElements(value));
		} else {
			this._labelShortElement.textContent = value;
		}
	}

	protected _setAriaLabel(): void {
		if (typeof this.options.ariaLabel === 'string') {
			this._element.setAttribute('aria-label', this.options.ariaLabel);
		} else if (typeof this.options.title === 'string') {
			this._element.setAttribute('aria-label', this.options.title);
		}
	}

	set icon(icon: ThemeIcon) {
		this._setAriaLabel();

		const oldIcons = Array.from(this._element.classList).filter(item => item.startsWith('codicon-'));
		this._element.classList.remove(...oldIcons);
		this._element.classList.add(...ThemeIcon.asClassNameArray(icon));
	}

	set enabled(value: boolean) {
		if (value) {
			this._element.classList.remove('disabled');
			this._element.setAttribute('aria-disabled', String(false));
			this._element.tabIndex = 0;
		} else {
			this._element.classList.add('disabled');
			this._element.setAttribute('aria-disabled', String(true));
		}
	}

	get enabled() {
		return !this._element.classList.contains('disabled');
	}

	set checked(value: boolean) {
		if (value) {
			this._element.classList.add('checked');
			this._element.setAttribute('aria-checked', 'true');
		} else {
			this._element.classList.remove('checked');
			this._element.setAttribute('aria-checked', 'false');
		}
	}

	get checked() {
		return this._element.classList.contains('checked');
	}

	setTitle(title: string) {
		if (!this._hover && title !== '') {
			this._hover = this._register(getBaseLayerHoverDelegate().setupManagedHover(this.options.hoverDelegate ?? getDefaultHoverDelegate('element'), this._element, title));
		} else if (this._hover) {
			this._hover.update(title);
		}
	}

	focus(): void {
		this._element.focus();
	}

	hasFocus(): boolean {
		return isActiveElement(this._element);
	}
}

export interface IButtonWithDropdownOptions extends IButtonOptions {
	readonly contextMenuProvider: IContextMenuProvider;
	readonly actions: readonly IAction[] | IActionProvider;
	readonly actionRunner?: IActionRunner;
	readonly addPrimaryActionToDropdown?: boolean;
	/**
	 * dropdown menus with higher layers are rendered higher in z-index order
	 */
	readonly dropdownLayer?: number;
}

export class ButtonWithDropdown extends Disposable implements IButton {

	readonly primaryButton: Button;
	private readonly action: Action;
	readonly dropdownButton: Button;
	private readonly separatorContainer: HTMLDivElement;
	private readonly separator: HTMLDivElement;

	readonly element: HTMLElement;
	private readonly _onDidClick = this._register(new Emitter<Event | undefined>());
	readonly onDidClick = this._onDidClick.event;

	constructor(container: HTMLElement, options: IButtonWithDropdownOptions) {
		super();

		this.element = document.createElement('div');
		this.element.classList.add('monaco-button-dropdown');
		container.appendChild(this.element);

		if (!options.hoverDelegate) {
			options = { ...options, hoverDelegate: this._register(createInstantHoverDelegate()) };
		}

		this.primaryButton = this._register(new Button(this.element, options));
		this._register(this.primaryButton.onDidClick(e => this._onDidClick.fire(e)));
		this.action = this._register(new Action('primaryAction', renderStringAsPlaintext(this.primaryButton.label), undefined, true, async () => this._onDidClick.fire(undefined)));

		this.separatorContainer = document.createElement('div');
		this.separatorContainer.classList.add('monaco-button-dropdown-separator');

		this.separator = document.createElement('div');
		this.separatorContainer.appendChild(this.separator);
		this.element.appendChild(this.separatorContainer);

		// Separator styles
		const border = options.buttonBorder;
		if (border) {
			this.separatorContainer.style.borderTop = '1px solid ' + border;
			this.separatorContainer.style.borderBottom = '1px solid ' + border;
		}

		const buttonBackground = options.secondary ? options.buttonSecondaryBackground : options.buttonBackground;
		this.separatorContainer.style.backgroundColor = buttonBackground ?? '';
		this.separator.style.backgroundColor = options.buttonSeparator ?? '';

		this.dropdownButton = this._register(new Button(this.element, { ...options, title: localize("button dropdown more actions", 'More Actions...'), supportIcons: true }));
		this.dropdownButton.element.setAttribute('aria-haspopup', 'true');
		this.dropdownButton.element.setAttribute('aria-expanded', 'false');
		this.dropdownButton.element.classList.add('monaco-dropdown-button');
		this.dropdownButton.icon = Codicon.dropDownButton;
		this._register(this.dropdownButton.onDidClick(e => {
			const actions = Array.isArray(options.actions) ? options.actions : (options.actions as IActionProvider).getActions();
			options.contextMenuProvider.showContextMenu({
				getAnchor: () => this.dropdownButton.element,
				getActions: () => options.addPrimaryActionToDropdown === false ? [...actions] : [this.action, ...actions],
				actionRunner: options.actionRunner,
				onHide: () => this.dropdownButton.element.setAttribute('aria-expanded', 'false'),
				layer: options.dropdownLayer
			});
			this.dropdownButton.element.setAttribute('aria-expanded', 'true');
		}));
	}

	override dispose() {
		super.dispose();
		this.element.remove();
	}

	set label(value: string) {
		this.primaryButton.label = value;
		this.action.label = value;
	}

	set icon(icon: ThemeIcon) {
		this.primaryButton.icon = icon;
	}

	set enabled(enabled: boolean) {
		this.primaryButton.enabled = enabled;
		this.dropdownButton.enabled = enabled;

		this.element.classList.toggle('disabled', !enabled);
	}

	get enabled(): boolean {
		return this.primaryButton.enabled;
	}

	set checked(value: boolean) {
		this.primaryButton.checked = value;
	}

	get checked() {
		return this.primaryButton.checked;
	}

	focus(): void {
		this.primaryButton.focus();
	}

	hasFocus(): boolean {
		return this.primaryButton.hasFocus() || this.dropdownButton.hasFocus();
	}
}

export class ButtonWithDescription implements IButtonWithDescription {
	private _button: Button;
	private _element: HTMLElement;
	private _descriptionElement: HTMLElement;

	constructor(container: HTMLElement, private readonly options: IButtonOptions) {
		this._element = document.createElement('div');
		this._element.classList.add('monaco-description-button');
		this._button = new Button(this._element, options);

		this._descriptionElement = document.createElement('div');
		this._descriptionElement.classList.add('monaco-button-description');
		this._element.appendChild(this._descriptionElement);

		container.appendChild(this._element);
	}

	get onDidClick(): BaseEvent<Event | undefined> {
		return this._button.onDidClick;
	}

	get element(): HTMLElement {
		return this._element;
	}

	set label(value: string) {
		this._button.label = value;
	}

	set icon(icon: ThemeIcon) {
		this._button.icon = icon;
	}

	get enabled(): boolean {
		return this._button.enabled;
	}

	set enabled(enabled: boolean) {
		this._button.enabled = enabled;
	}

	set checked(value: boolean) {
		this._button.checked = value;
	}

	get checked(): boolean {
		return this._button.checked;
	}

	focus(): void {
		this._button.focus();
	}
	hasFocus(): boolean {
		return this._button.hasFocus();
	}
	dispose(): void {
		this._button.dispose();
	}

	set description(value: string) {
		if (this.options.supportIcons) {
			reset(this._descriptionElement, ...renderLabelWithIcons(value));
		} else {
			this._descriptionElement.textContent = value;
		}
	}
}

export class ButtonBar {

	private readonly _buttons: IButton[] = [];
	private readonly _buttonStore = new DisposableStore();

	constructor(private readonly container: HTMLElement) {

	}

	dispose(): void {
		this._buttonStore.dispose();
	}

	get buttons(): IButton[] {
		return this._buttons;
	}

	clear(): void {
		this._buttonStore.clear();
		this._buttons.length = 0;
	}

	addButton(options: IButtonOptions): IButton {
		const button = this._buttonStore.add(new Button(this.container, options));
		this.pushButton(button);
		return button;
	}

	addButtonWithDescription(options: IButtonOptions): IButtonWithDescription {
		const button = this._buttonStore.add(new ButtonWithDescription(this.container, options));
		this.pushButton(button);
		return button;
	}

	addButtonWithDropdown(options: IButtonWithDropdownOptions): IButton {
		const button = this._buttonStore.add(new ButtonWithDropdown(this.container, options));
		this.pushButton(button);
		return button;
	}

	private pushButton(button: IButton): void {
		this._buttons.push(button);

		const index = this._buttons.length - 1;
		this._buttonStore.add(addDisposableListener(button.element, EventType.KEY_DOWN, e => {
			const event = new StandardKeyboardEvent(e);
			let eventHandled = true;

			// Next / Previous Button
			let buttonIndexToFocus: number | undefined;
			if (event.equals(KeyCode.LeftArrow)) {
				buttonIndexToFocus = index > 0 ? index - 1 : this._buttons.length - 1;
			} else if (event.equals(KeyCode.RightArrow)) {
				buttonIndexToFocus = index === this._buttons.length - 1 ? 0 : index + 1;
			} else {
				eventHandled = false;
			}

			if (eventHandled && typeof buttonIndexToFocus === 'number') {
				this._buttons[buttonIndexToFocus].focus();
				EventHelper.stop(e, true);
			}

		}));
	}
}

/**
 * This is a Button that supports an icon to the left, and markdown to the right, with proper separation and wrapping the markdown label, which Button doesn't do.
 */
export class ButtonWithIcon extends Button {
	private _iconElement: HTMLElement;
	private _mdlabelElement: HTMLElement;

	constructor(container: HTMLElement, options: IButtonOptions) {
		super(container, options);

		if (options.supportShortLabel) {
			throw new Error('ButtonWithIcon does not support short labels');
		}

		this._element.classList.add('monaco-icon-button');
		this._iconElement = $('');
		this._mdlabelElement = $('.monaco-button-mdlabel');
		this._element.append(this._iconElement, this._mdlabelElement);
	}

	override set label(value: IMarkdownString | string) {
		if (this._label === value) {
			return;
		}

		if (isMarkdownString(this._label) && isMarkdownString(value) && markdownStringEqual(this._label, value)) {
			return;
		}

		this._element.classList.add('monaco-text-button');
		if (isMarkdownString(value)) {
			const rendered = renderMarkdown(value, { inline: true });
			rendered.dispose();

			const root = rendered.element.querySelector('p')?.innerHTML;
			if (root) {
				// Only allow a very limited set of inline html tags
				const sanitized = dompurify.sanitize(root, { ADD_TAGS: ['b', 'i', 'u', 'code', 'span'], ALLOWED_ATTR: ['class'], RETURN_TRUSTED_TYPE: true });
				this._mdlabelElement.innerHTML = sanitized as unknown as string;
			} else {
				reset(this._mdlabelElement);
			}
		} else {
			if (this.options.supportIcons) {
				reset(this._mdlabelElement, ...this.getContentElements(value));
			} else {
				this._mdlabelElement.textContent = value;
			}
		}

		let title: string = '';
		if (typeof this.options.title === 'string') {
			title = this.options.title;
		} else if (this.options.title) {
			title = renderStringAsPlaintext(value);
		}

		this.setTitle(title);
		this._setAriaLabel();
		this._label = value;
	}

	override set icon(icon: ThemeIcon) {
		this._iconElement.classList.value = '';
		this._iconElement.classList.add(...ThemeIcon.asClassNameArray(icon));
		this._setAriaLabel();
	}
}
