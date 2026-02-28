/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../base/browser/dom.js';
import { FindInput } from '../../../base/browser/ui/findinput/findInput.js';
import { IInputBoxStyles, IRange, MessageType } from '../../../base/browser/ui/inputbox/inputBox.js';
import { createToggleActionViewItemProvider, IToggleStyles, Toggle } from '../../../base/browser/ui/toggle/toggle.js';
import { IAction } from '../../../base/common/actions.js';
import { IActionViewItemProvider } from '../../../base/browser/ui/actionbar/actionbar.js';
import { Disposable, IDisposable } from '../../../base/common/lifecycle.js';
import Severity from '../../../base/common/severity.js';
import './media/quickInput.css';

const $ = dom.$;

export class QuickInputBox extends Disposable {

	private container: HTMLElement;
	private findInput: FindInput;
	private _listFocusMode: boolean = false;

	constructor(
		private parent: HTMLElement,
		inputBoxStyles: IInputBoxStyles,
		toggleStyles: IToggleStyles
	) {
		super();
		this.container = dom.append(this.parent, $('.quick-input-box'));
		this.findInput = this._register(new FindInput(
			this.container,
			undefined,
			{
				label: '',
				inputBoxStyles,
				toggleStyles,
				actionViewItemProvider: createToggleActionViewItemProvider(toggleStyles),
				hideHoverOnValueChange: true
			}));
		// Don't set role="textbox" - the input element already has that implicit role
		// Don't set aria-haspopup or aria-autocomplete by default - only add them when list is active
	}

	get onKeyDown() {
		return this.findInput.onKeyDown;
	}

	get onMouseDown() {
		return this.findInput.onMouseDown;
	}

	onDidChange = (handler: (event: string) => void): IDisposable => {
		return this.findInput.onDidChange(handler);
	};

	get value() {
		return this.findInput.getValue();
	}

	set value(value: string) {
		this.findInput.setValue(value);
	}

	select(range: IRange | null = null): void {
		this.findInput.inputBox.select(range);
	}

	getSelection(): IRange | null {
		return this.findInput.inputBox.getSelection();
	}

	isSelectionAtEnd(): boolean {
		return this.findInput.inputBox.isSelectionAtEnd();
	}

	setPlaceholder(placeholder: string): void {
		this.findInput.inputBox.setPlaceHolder(placeholder);
	}

	get placeholder() {
		return this.findInput.inputBox.inputElement.getAttribute('placeholder') || '';
	}

	set placeholder(placeholder: string) {
		this.findInput.inputBox.setPlaceHolder(placeholder);
	}

	get password() {
		return this.findInput.inputBox.inputElement.type === 'password';
	}

	set password(password: boolean) {
		this.findInput.inputBox.inputElement.type = password ? 'password' : 'text';
	}

	set enabled(enabled: boolean) {
		// We can't disable the input box because it is still used for
		// navigating the list. Instead, we disable the list and the OK
		// so that nothing can be selected.
		// TODO: should this be what we do for all find inputs? Or maybe some _other_ API
		// on findInput to change it to readonly?
		this.findInput.inputBox.inputElement.toggleAttribute('readonly', !enabled);
		// TODO: styles of the quick pick need to be moved to the CSS instead of being in line
		// so things like this can be done in CSS
		// this.findInput.inputBox.inputElement.classList.toggle('disabled', !enabled);
	}

	set toggles(toggles: Toggle[] | undefined) {
		this.findInput.setAdditionalToggles(toggles);
	}

	set actions(actions: ReadonlyArray<IAction> | undefined) {
		this.setActions(actions);
	}

	setActions(actions: ReadonlyArray<IAction> | undefined, actionViewItemProvider?: IActionViewItemProvider): void {
		this.findInput.setActions(actions, actionViewItemProvider);
	}

	get ariaLabel(): string {
		return this.findInput.inputBox.inputElement.getAttribute('aria-label') || '';
	}

	set ariaLabel(ariaLabel: string) {
		this.findInput.inputBox.inputElement.setAttribute('aria-label', ariaLabel);
	}

	hasFocus(): boolean {
		return this.findInput.inputBox.hasFocus();
	}

	setAttribute(name: string, value: string): void {
		this.findInput.inputBox.inputElement.setAttribute(name, value);
	}

	removeAttribute(name: string): void {
		this.findInput.inputBox.inputElement.removeAttribute(name);
	}

	/**
	 * Controls the ARIA popup mode for screen readers.
	 * When enabled (hasActiveDescendant=true), indicates a list popup is active.
	 * When disabled, removes ARIA attributes to allow normal text input behavior.
	 * Only updates attributes when the state actually changes to avoid
	 * unnecessary screen reader re-announcements.
	 */
	setListFocusMode(hasActiveDescendant: boolean): void {
		if (this._listFocusMode === hasActiveDescendant) {
			return; // No change, avoid triggering screen reader re-announcements
		}
		this._listFocusMode = hasActiveDescendant;
		const input = this.findInput.inputBox.inputElement;
		if (hasActiveDescendant) {
			// List item is focused - indicate combobox behavior
			input.setAttribute('aria-haspopup', 'listbox');
			input.setAttribute('aria-autocomplete', 'list');
		} else {
			// No list item focused - remove combobox attributes for normal text input
			input.removeAttribute('aria-haspopup');
			input.removeAttribute('aria-autocomplete');
		}
	}

	showDecoration(decoration: Severity): void {
		if (decoration === Severity.Ignore) {
			this.findInput.clearMessage();
		} else {
			this.findInput.showMessage({ type: decoration === Severity.Info ? MessageType.INFO : decoration === Severity.Warning ? MessageType.WARNING : MessageType.ERROR, content: '' });
		}
	}

	stylesForType(decoration: Severity) {
		return this.findInput.inputBox.stylesForType(decoration === Severity.Info ? MessageType.INFO : decoration === Severity.Warning ? MessageType.WARNING : MessageType.ERROR);
	}

	setFocus(): void {
		this.findInput.focus();
	}

	layout(): void {
		this.findInput.inputBox.layout();
	}
}
