/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import 'vs/css!./inputBox';
import Bal = require('vs/base/browser/browser');
import dom = require('vs/base/browser/dom');
import browser = require('vs/base/browser/browserService');
import htmlcontent = require('vs/base/common/htmlContent');
import renderer = require('vs/base/browser/htmlContentRenderer');
import ee = require('vs/base/common/eventEmitter');
import actions = require('vs/base/common/actions');
import actionBar = require('vs/base/browser/ui/actionbar/actionbar');
import lifecycle = require('vs/base/common/lifecycle');
import contextview = require('vs/base/browser/ui/contextview/contextview');

var $ = dom.emmet;

export interface IInputOptions {
	placeholder?:string;
	ariaLabel?:string;
	type?:string;
	validationOptions?:IInputValidationOptions;
	flexibleHeight?: boolean;
	actions?:actions.IAction[];
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

export class InputBox extends ee.EventEmitter {

	private contextViewProvider: contextview.IContextViewProvider;

	private element: HTMLElement;
	private input: HTMLInputElement;
	private mirror: HTMLElement;
	private actionbar: actionBar.ActionBar;
	private options: IInputOptions;
	private message: IMessage;
	private placeholder: string;
	private ariaLabel: string;
	private validation: IInputValidator;
	private showValidationMessage: boolean;
	private state = 'idle';
	private cachedHeight: number;
	private toDispose: lifecycle.IDisposable[];

	constructor(container:HTMLElement, contextViewProvider: contextview.IContextViewProvider, options?: IInputOptions) {
		super();

		this.contextViewProvider = contextViewProvider;
		this.options = options || Object.create(null);
		this.toDispose = [];
		this.message = null;
		this.cachedHeight = null;
		this.placeholder = this.options.placeholder || '';
		this.ariaLabel = this.options.ariaLabel || '';

		if (this.options.validationOptions) {
			this.validation = this.options.validationOptions.validation;
			this.showValidationMessage = this.options.validationOptions.showMessage || false;
		}

		this.element = dom.append(container, $('.monaco-inputbox.idle'));

		var tagName = this.options.flexibleHeight ? 'textarea' : 'input';

		var wrapper = dom.append(this.element, $('.wrapper'));
		this.input = <HTMLInputElement> dom.append(wrapper, $(tagName + '.input'));
		this.input.setAttribute('autocorrect', 'off');
		this.input.setAttribute('autocapitalize', 'off');
		this.input.setAttribute('spellcheck', 'false');

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
		}

		this.toDispose.push(
			dom.addDisposableListener(this.input, dom.EventType.INPUT, () => this.onValueChange()),
			dom.addDisposableListener(this.input, dom.EventType.BLUR, () => this.onBlur()),
			dom.addDisposableListener(this.input, dom.EventType.FOCUS, () => this.onFocus())
		);

		// Add placeholder shim for IE because IE decides to hide the placeholder on focus (we dont want that!)
		if (this.placeholder && Bal.isIE11orEarlier) {

			this.toDispose.push(dom.addDisposableListener(this.input, dom.EventType.CLICK, (e) => {
				dom.EventHelper.stop(e, true);
				this.input.focus();
			}));

			if (Bal.isIE9) {
				this.toDispose.push(dom.addDisposableListener(this.input, 'keyup', () => this.onValueChange()));
			}
		}

		setTimeout(() =>this.layout(), 0);

		// Support actions
		if (this.options.actions) {
			this.actionbar = new actionBar.ActionBar(this.element);
			this.actionbar.push(this.options.actions, { icon: true, label: false });
		}
	}

	private onBlur(): void {
		this._hideMessage();
	}

	private onFocus(): void {
		this._showMessage();
	}

	public setPlaceHolder(placeHolder:string): void {
		if (this.input) {
			this.input.setAttribute('placeholder', placeHolder);
		}
	}

	public setContextViewProvider(contextViewProvider: contextview.IContextViewProvider): void {
		this.contextViewProvider = contextViewProvider;
	}

	public get inputElement(): HTMLInputElement {
		return this.input;
	}

	public get value():string {
		return this.input.value;
	}

	public set value(newValue:string) {
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
		return browser.getService().document.activeElement === this.input;
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

	public get width():number {
		return dom.getTotalWidth(this.input);
	}

	public set width(width:number) {
		this.input.style.width = width + 'px';
	}

	public showMessage(message: IMessage, force?:boolean): void {
		this.message = message;

		dom.removeClass(this.element, 'idle');
		dom.removeClass(this.element, 'info');
		dom.removeClass(this.element, 'warning');
		dom.removeClass(this.element, 'error');
		dom.addClass(this.element, this.classForType(message.type));

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
		var result: IMessage = null;

		if (this.validation) {
			result = this.validation(this.value);

			if (!result) {
				this.hideMessage();
			} else {
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

		var div: HTMLElement;
		var layout = () => div.style.width = dom.getTotalWidth(this.element) + 'px';

		this.state = 'open';

		this.contextViewProvider.showContextView({
			getAnchor: () => this.element,
			anchorAlignment: contextview.AnchorAlignment.RIGHT,
			render: (container: HTMLElement) => {
				div = dom.append(container, $('.monaco-inputbox-container'));
				layout();

				var renderOptions: htmlcontent.IHTMLContentElement = {
					tagName: 'span',
					className: 'monaco-inputbox-message',
				};

				if (this.message.formatContent) {
					renderOptions.formattedText = this.message.content;
				} else {
					renderOptions.text = this.message.content;
				}

				var spanElement:HTMLElement = <any>renderer.renderHtml(renderOptions);
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
		this.emit('change', this.value);

		this.validate();

		if (this.mirror) {
			var lastCharCode = this.value.charCodeAt(this.value.length - 1);
			var suffix = lastCharCode === 10 ? ' ' : '';
			this.mirror.textContent = this.value + suffix;
			this.layout();
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
			this.emit('heightchange', this.cachedHeight);
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

		if (this.actionbar) {
			this.actionbar.dispose();
			this.actionbar = null;
		}

		super.dispose();
	}
}
