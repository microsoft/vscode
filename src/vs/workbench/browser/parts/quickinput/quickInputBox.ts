/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import 'vs/css!./quickInput';
import * as dom from 'vs/base/browser/dom';
import { InputBox, IRange, MessageType } from 'vs/base/browser/ui/inputbox/inputBox';
import { localize } from 'vs/nls';
import { inputBackground, inputForeground, inputBorder, inputValidationInfoBackground, inputValidationInfoBorder, inputValidationWarningBackground, inputValidationWarningBorder, inputValidationErrorBackground, inputValidationErrorBorder } from 'vs/platform/theme/common/colorRegistry';
import { ITheme } from 'vs/platform/theme/common/themeService';
import { dispose, IDisposable } from 'vs/base/common/lifecycle';
import { StandardKeyboardEvent } from 'vs/base/browser/keyboardEvent';
import Severity from 'vs/base/common/severity';

const $ = dom.$;

const DEFAULT_INPUT_ARIA_LABEL = localize('quickInputBox.ariaLabel', "Type to narrow down results.");

export class QuickInputBox {

	private container: HTMLElement;
	private inputBox: InputBox;
	private disposables: IDisposable[] = [];

	constructor(
		private parent: HTMLElement
	) {
		this.container = dom.append(this.parent, $('.quick-input-box'));
		this.inputBox = new InputBox(this.container, null, {
			ariaLabel: DEFAULT_INPUT_ARIA_LABEL
		});
		this.disposables.push(this.inputBox);

		// ARIA
		const inputElement = this.inputBox.inputElement;
		inputElement.setAttribute('role', 'combobox');
		inputElement.setAttribute('aria-haspopup', 'false');
		inputElement.setAttribute('aria-autocomplete', 'list');
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

	select(range: IRange = null): void {
		this.inputBox.select(range);
	}

	setPlaceholder(placeholder: string) {
		this.inputBox.setPlaceHolder(placeholder);
	}

	setPassword(isPassword: boolean): void {
		this.inputBox.inputElement.type = isPassword ? 'password' : 'text';
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
			inputForeground: theme.getColor(inputForeground),
			inputBackground: theme.getColor(inputBackground),
			inputBorder: theme.getColor(inputBorder),
			inputValidationInfoBackground: theme.getColor(inputValidationInfoBackground),
			inputValidationInfoBorder: theme.getColor(inputValidationInfoBorder),
			inputValidationWarningBackground: theme.getColor(inputValidationWarningBackground),
			inputValidationWarningBorder: theme.getColor(inputValidationWarningBorder),
			inputValidationErrorBackground: theme.getColor(inputValidationErrorBackground),
			inputValidationErrorBorder: theme.getColor(inputValidationErrorBorder),
		});
	}

	dispose() {
		this.disposables = dispose(this.disposables);
	}
}
