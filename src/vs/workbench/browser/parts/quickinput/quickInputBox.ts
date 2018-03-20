/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import 'vs/css!./quickInput';
import * as dom from 'vs/base/browser/dom';
import { InputBox } from 'vs/base/browser/ui/inputbox/inputBox';
import * as nls from 'vs/nls';
import { inputBackground, inputForeground, inputBorder } from 'vs/platform/theme/common/colorRegistry';
import { ITheme } from 'vs/platform/theme/common/themeService';
import { IDisposable } from 'vs/base/common/lifecycle';

const $ = dom.$;

const DEFAULT_INPUT_ARIA_LABEL = nls.localize('quickInputBoxAriaLabel', "Type to narrow down results.");

export class QuickInputBox {

	public container: HTMLElement;
	private inputBox: InputBox;

	constructor(
		private parent: HTMLElement
	) {
		this.container = dom.append(this.parent, $('.quick-input-box'));
		this.inputBox = new InputBox(this.container, null, {
			ariaLabel: DEFAULT_INPUT_ARIA_LABEL
		});

		// ARIA
		const inputElement = this.inputBox.inputElement;
		inputElement.setAttribute('role', 'combobox');
		inputElement.setAttribute('aria-haspopup', 'false');
		inputElement.setAttribute('aria-autocomplete', 'list');
	}

	onInput(handler: (event: string) => void): IDisposable {
		return this.inputBox.onDidChange(handler);
	}

	setPlaceholder(placeholder: string) {
		this.inputBox.setPlaceHolder(placeholder);
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
			inputBorder: theme.getColor(inputBorder)
		});
	}
}
