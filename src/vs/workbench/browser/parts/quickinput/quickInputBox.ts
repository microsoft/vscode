/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'vs/css!./quickInput';
import * as dom from 'vs/base/browser/dom';
import { InputBox, IRange, MessageType } from 'vs/base/browser/ui/inputbox/inputBox';
import { inputBackground, inputForeground, inputBorder, inputValidationInfoBackground, inputValidationInfoForeground, inputValidationInfoBorder, inputValidationWarningBackground, inputValidationWarningForeground, inputValidationWarningBorder, inputValidationErrorBackground, inputValidationErrorForeground, inputValidationErrorBorder } from 'vs/platform/theme/common/colorRegistry';
import { ITheme } from 'vs/platform/theme/common/themeService';
import { dispose, IDisposable } from 'vs/base/common/lifecycle';
import { StandardKeyboardEvent } from 'vs/base/browser/keyboardEvent';
import Severity from 'vs/base/common/severity';

const $ = dom.$;

export class QuickInputBox {

	private container: HTMLElement;
	private inputBox: InputBox;
	private disposables: IDisposable[] = [];

	constructor(
		private parent: HTMLElement
	) {
		this.container = dom.append(this.parent, $('.quick-input-box'));
		this.inputBox = new InputBox(this.container, undefined);
		this.disposables.push(this.inputBox);
	}

	onKeyDown = (handler: (event: StandardKeyboardEvent) => void): IDisposable => {
		return dom.addDisposableListener(this.inputBox.inputElement, dom.EventType.KEY_DOWN, (e: KeyboardEvent) => {
			handler(new StandardKeyboardEvent(e));
		});
	}

	onDidChange = (handler: (event: string) => void): IDisposable => {
		return this.inputBox.onDidChange(handler);
	}

	get value() {
		return this.inputBox.value;
	}

	set value(value: string) {
		this.inputBox.value = value;
	}

	select(range: IRange | null = null): void {
		this.inputBox.select(range);
	}

	setPlaceholder(placeholder: string) {
		this.inputBox.setPlaceHolder(placeholder);
	}

	get placeholder() {
		return this.inputBox.inputElement.getAttribute('placeholder') || '';
	}

	set placeholder(placeholder: string) {
		this.inputBox.setPlaceHolder(placeholder);
	}

	get password() {
		return this.inputBox.inputElement.type === 'password';
	}

	set password(password: boolean) {
		this.inputBox.inputElement.type = password ? 'password' : 'text';
	}

	set enabled(enabled: boolean) {
		this.inputBox.setEnabled(enabled);
	}

	setAttribute(name: string, value: string) {
		this.inputBox.inputElement.setAttribute(name, value);
	}

	removeAttribute(name: string) {
		this.inputBox.inputElement.removeAttribute(name);
	}

	showDecoration(decoration: Severity): void {
		if (decoration === Severity.Ignore) {
			this.inputBox.hideMessage();
		} else {
			this.inputBox.showMessage({ type: decoration === Severity.Info ? MessageType.INFO : decoration === Severity.Warning ? MessageType.WARNING : MessageType.ERROR, content: '' });
		}
	}

	setFocus(): void {
		this.inputBox.focus();
	}

	layout(): void {
		this.inputBox.layout();
	}

	style(theme: ITheme) {
		this.inputBox.style({
			inputForeground: theme.getColor(inputForeground) || undefined,
			inputBackground: theme.getColor(inputBackground) || undefined,
			inputBorder: theme.getColor(inputBorder) || undefined,
			inputValidationInfoBackground: theme.getColor(inputValidationInfoBackground) || undefined,
			inputValidationInfoForeground: theme.getColor(inputValidationInfoForeground) || undefined,
			inputValidationInfoBorder: theme.getColor(inputValidationInfoBorder) || undefined,
			inputValidationWarningBackground: theme.getColor(inputValidationWarningBackground) || undefined,
			inputValidationWarningForeground: theme.getColor(inputValidationWarningForeground) || undefined,
			inputValidationWarningBorder: theme.getColor(inputValidationWarningBorder) || undefined,
			inputValidationErrorBackground: theme.getColor(inputValidationErrorBackground) || undefined,
			inputValidationErrorForeground: theme.getColor(inputValidationErrorForeground) || undefined,
			inputValidationErrorBorder: theme.getColor(inputValidationErrorBorder) || undefined,
		});
	}

	dispose() {
		this.disposables = dispose(this.disposables);
	}
}
