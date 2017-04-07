/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import 'vs/css!./inputBox';

import nls = require('vs/nls');
import * as Bal from 'vs/base/browser/browser';
import * as dom from 'vs/base/browser/dom';
import { IHTMLContentElement } from 'vs/base/common/htmlContent';
import { renderHtml } from 'vs/base/browser/htmlContentRenderer';
import aria = require('vs/base/browser/ui/aria/aria');
import { IAction } from 'vs/base/common/actions';
import { ActionBar } from 'vs/base/browser/ui/actionbar/actionbar';
import { IContextViewProvider, AnchorAlignment } from 'vs/base/browser/ui/contextview/contextview';
import Event, { Emitter } from 'vs/base/common/event';
import { Widget } from 'vs/base/browser/ui/widget';
import { Color } from 'vs/base/common/color';

const $ = dom.$;

export interface IInputOptions extends IInputBoxStyles {
	placeholder?: string;
	ariaLabel?: string;
	type?: string;
	validationOptions?: IInputValidationOptions;
	flexibleHeight?: boolean;
	actions?: IAction[];
}

export interface IInputBoxStyles {
	inputBackground?: Color;
	inputForeground?: Color;
	inputBorder?: Color;
}

export interface IInputValidator {
	(value: string): IMessage;
}

export interface IMessage {
	content: string;
	formatContent?: boolean; // defaults to false
	type?: MessageType;
}

export interface IInputValidationOptions {
	validation: IInputValidator;
	showMessage?: boolean;
}

export enum MessageType {
	INFO = 1,
	WARNING = 2,
	ERROR = 3
}

export interface IRange {
	start: number;
	end: number;
}

export class InputBox extends Widget {
	private contextViewProvider: IContextViewProvider;
	private element: HTMLElement;
	private input: HTMLInputElement;
	private mirror: HTMLElement;
	private actionbar: ActionBar;
	private options: IInputOptions;
	private message: IMessage;
	private placeholder: string;
	private ariaLabel: string;
	private validation: IInputValidator;
	private showValidationMessage: boolean;
	private state = 'idle';
	private cachedHeight: number;

	private inputBackground: Color;
	private inputForeground: Color;
	private inputBorder: Color;

	private _onDidChange = this._register(new Emitter<string>());
	public onDidChange: Event<string> = this._onDidChange.event;

	private _onDidHeightChange = this._register(new Emitter<number>());
	public onDidHeightChange: Event<number> = this._onDidHeightChange.event;

	constructor(container: HTMLElement, contextViewProvider: IContextViewProvider, options?: IInputOptions) {
		super();

		this.contextViewProvider = contextViewProvider;
		this.options = options || Object.create(null);
		this.message = null;
		this.cachedHeight = null;
		this.placeholder = this.options.placeholder || '';
		this.ariaLabel = this.options.ariaLabel || '';
		this.inputBackground = this.options.inputBackground;
		this.inputForeground = this.options.inputForeground;
		this.inputBorder = this.options.inputBorder;

		if (this.options.validationOptions) {
			this.validation = this.options.validationOptions.validation;
			this.showValidationMessage = this.options.validationOptions.showMessage || false;
		}

		this.element = dom.append(container, $('.monaco-inputbox.idle'));

		let tagName = this.options.flexibleHeight ? 'textarea' : 'input';

		let wrapper = dom.append(this.element, $('.wrapper'));
		this.input = <HTMLInputElement>dom.append(wrapper, $(tagName + '.input'));
		this.input.setAttribute('autocorrect', 'off');
		this.input.setAttribute('autocapitalize', 'off');
		this.input.setAttribute('spellcheck', 'false');

		this.onfocus(this.input, () => dom.addClass(this.element, 'synthetic-focus'));
		this.onblur(this.input, () => dom.removeClass(this.element, 'synthetic-focus'));

		if (this.options.flexibleHeight) {
			this.mirror = dom.append(wrapper, $('div.mirror'));
		} else {
			this.input.type = this.options.type || 'text';
			this.input.setAttribute('wrap', 'off');
		}

		if (this.ariaLabel) {
			this.input.setAttribute('aria-label', this.ariaLabel);
		}

		if (this.placeholder) {
			this.input.setAttribute('placeholder', this.placeholder);
			this.input.title = this.placeholder;
		}

		this.oninput(this.input, () => this.onValueChange());
		this.onblur(this.input, () => this.onBlur());
		this.onfocus(this.input, () => this.onFocus());

		// Add placeholder shim for IE because IE decides to hide the placeholder on focus (we dont want that!)
		if (this.placeholder && Bal.isIE) {
			this.onclick(this.input, (e) => {
				dom.EventHelper.stop(e, true);
				this.input.focus();
			});
		}

		setTimeout(() => this.updateMirror(), 0);

		// Support actions
		if (this.options.actions) {
			this.actionbar = this._register(new ActionBar(this.element));
			this.actionbar.push(this.options.actions, { icon: true, label: false });
		}

		this._applyStyles();
	}

	private onBlur(): void {
		this._hideMessage();
	}

	private onFocus(): void {
		this._showMessage();
	}

	public setPlaceHolder(placeHolder: string): void {
		if (this.input) {
			this.input.setAttribute('placeholder', placeHolder);
		}
	}

	public setAriaLabel(label: string): void {
		this.ariaLabel = label;

		if (this.input) {
			if (label) {
				this.input.setAttribute('aria-label', this.ariaLabel);
			} else {
				this.input.removeAttribute('aria-label');
			}
		}
	}

	public setContextViewProvider(contextViewProvider: IContextViewProvider): void {
		this.contextViewProvider = contextViewProvider;
	}

	public get inputElement(): HTMLInputElement {
		return this.input;
	}

	public get value(): string {
		return this.input.value;
	}

	public set value(newValue: string) {
		if (this.input.value !== newValue) {
			this.input.value = newValue;
			this.onValueChange();
		}
	}

	public get height(): number {
		return this.cachedHeight === null ? dom.getTotalHeight(this.element) : this.cachedHeight;
	}

	public focus(): void {
		this.input.focus();
	}

	public blur(): void {
		this.input.blur();
	}

	public hasFocus(): boolean {
		return document.activeElement === this.input;
	}

	public select(range: IRange = null): void {
		this.input.select();

		if (range) {
			this.input.setSelectionRange(range.start, range.end);
		}
	}

	public enable(): void {
		this.input.removeAttribute('disabled');
	}

	public disable(): void {
		this.input.disabled = true;
		this._hideMessage();
	}

	public setEnabled(enabled: boolean): void {
		if (enabled) {
			this.enable();
		} else {
			this.disable();
		}
	}

	public get width(): number {
		return dom.getTotalWidth(this.input);
	}

	public set width(width: number) {
		this.input.style.width = width + 'px';
	}

	public showMessage(message: IMessage, force?: boolean): void {
		this.message = message;

		dom.removeClass(this.element, 'idle');
		dom.removeClass(this.element, 'info');
		dom.removeClass(this.element, 'warning');
		dom.removeClass(this.element, 'error');
		dom.addClass(this.element, this.classForType(message.type));

		// ARIA Support
		let alertText: string;
		if (message.type === MessageType.ERROR) {
			alertText = nls.localize('alertErrorMessage', "Error: {0}", message.content);
		} else if (message.type === MessageType.WARNING) {
			alertText = nls.localize('alertWarningMessage', "Warning: {0}", message.content);
		} else {
			alertText = nls.localize('alertInfoMessage', "Info: {0}", message.content);
		}

		aria.alert(alertText);

		if (this.hasFocus() || force) {
			this._showMessage();
		}
	}

	public hideMessage(): void {
		this.message = null;

		dom.removeClass(this.element, 'info');
		dom.removeClass(this.element, 'warning');
		dom.removeClass(this.element, 'error');
		dom.addClass(this.element, 'idle');

		this._hideMessage();
	}

	public isInputValid(): boolean {
		return !!this.validation && !this.validation(this.value);
	}

	public validate(): boolean {
		let result: IMessage = null;

		if (this.validation) {
			result = this.validation(this.value);

			if (!result) {
				this.inputElement.removeAttribute('aria-invalid');
				this.hideMessage();
			} else {
				this.inputElement.setAttribute('aria-invalid', 'true');
				this.showMessage(result);
			}
		}

		return !result;
	}

	private classForType(type: MessageType): string {
		switch (type) {
			case MessageType.INFO: return 'info';
			case MessageType.WARNING: return 'warning';
			default: return 'error';
		}
	}

	private _showMessage(): void {
		if (!this.contextViewProvider || !this.message) {
			return;
		}

		let div: HTMLElement;
		let layout = () => div.style.width = dom.getTotalWidth(this.element) + 'px';

		this.state = 'open';

		this.contextViewProvider.showContextView({
			getAnchor: () => this.element,
			anchorAlignment: AnchorAlignment.RIGHT,
			render: (container: HTMLElement) => {
				div = dom.append(container, $('.monaco-inputbox-container'));
				layout();

				let renderOptions: IHTMLContentElement = {
					tagName: 'span',
					className: 'monaco-inputbox-message',
				};

				if (this.message.formatContent) {
					renderOptions.formattedText = this.message.content;
				} else {
					renderOptions.text = this.message.content;
				}

				let spanElement: HTMLElement = <any>renderHtml(renderOptions);
				dom.addClass(spanElement, this.classForType(this.message.type));
				dom.append(div, spanElement);
				return null;
			},
			layout: layout
		});
	}

	private _hideMessage(): void {
		if (!this.contextViewProvider || this.state !== 'open') {
			return;
		}

		this.state = 'idle';

		this.contextViewProvider.hideContextView();
	}

	private onValueChange(): void {
		this._onDidChange.fire(this.value);

		this.validate();
		this.updateMirror();

		if (this.state === 'open') {
			this.contextViewProvider.layout();
		}
	}

	private updateMirror(): void {
		if (!this.mirror) {
			return;
		}

		const value = this.value || this.placeholder;
		let lastCharCode = value.charCodeAt(value.length - 1);
		let suffix = lastCharCode === 10 ? ' ' : '';
		this.mirror.textContent = value + suffix;
		this.layout();
	}

	public style(styles: IInputBoxStyles) {
		this.inputBackground = styles.inputBackground;
		this.inputForeground = styles.inputForeground;
		this.inputBorder = styles.inputBorder;

		this._applyStyles();
	}

	protected _applyStyles() {
		if (this.element) {
			const background = this.inputBackground ? this.inputBackground.toString() : null;
			const foreground = this.inputForeground ? this.inputForeground.toString() : null;
			const border = this.inputBorder ? this.inputBorder.toString() : null;

			this.element.style.backgroundColor = background;
			this.element.style.color = foreground;
			this.input.style.backgroundColor = background;
			this.input.style.color = foreground;

			this.element.style.borderWidth = border ? '1px' : null;
			this.element.style.borderStyle = border ? 'solid' : null;
			this.element.style.borderColor = border;
		}
	}

	public layout(): void {
		if (!this.mirror) {
			return;
		}

		const previousHeight = this.cachedHeight;
		this.cachedHeight = dom.getTotalHeight(this.mirror);

		if (previousHeight !== this.cachedHeight) {
			this.input.style.height = this.cachedHeight + 'px';
			this._onDidHeightChange.fire(this.cachedHeight);
		}
	}

	public dispose(): void {
		this._hideMessage();

		this.element = null;
		this.input = null;
		this.contextViewProvider = null;
		this.message = null;
		this.placeholder = null;
		this.ariaLabel = null;
		this.validation = null;
		this.showValidationMessage = null;
		this.state = null;
		this.actionbar = null;

		super.dispose();
	}
}