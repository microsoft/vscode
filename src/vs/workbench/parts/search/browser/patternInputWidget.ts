/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import nls = require('vs/nls');
import * as dom from 'vs/base/browser/dom';
import { $ } from 'vs/base/browser/builder';
import { Widget } from 'vs/base/browser/ui/widget';
import { Checkbox } from 'vs/base/browser/ui/checkbox/checkbox';
import { IContextViewProvider } from 'vs/base/browser/ui/contextview/contextview';
import { InputBox, IInputValidator } from 'vs/base/browser/ui/inputbox/inputBox';
import { IKeyboardEvent } from 'vs/base/browser/keyboardEvent';
import { KeyCode } from 'vs/base/common/keyCodes';
import CommonEvent, { Emitter } from 'vs/base/common/event';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { attachInputBoxStyler, attachCheckboxStyler } from 'vs/platform/theme/common/styler';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { HistoryNavigator } from 'vs/base/common/history';

export interface IOptions {
	placeholder?: string;
	width?: number;
	validation?: IInputValidator;
	ariaLabel?: string;
}

export class PatternInputWidget extends Widget {

	static OPTION_CHANGE: string = 'optionChange';

	public inputFocusTracker: dom.IFocusTracker;

	protected onOptionChange: (event: Event) => void;
	private width: number;
	private placeholder: string;
	private ariaLabel: string;

	private domNode: HTMLElement;
	private inputNode: HTMLInputElement;
	protected inputBox: InputBox;

	private history: HistoryNavigator<string>;

	private _onSubmit = this._register(new Emitter<boolean>());
	public onSubmit: CommonEvent<boolean> = this._onSubmit.event;

	private _onCancel = this._register(new Emitter<boolean>());
	public onCancel: CommonEvent<boolean> = this._onCancel.event;

	constructor(parent: HTMLElement, private contextViewProvider: IContextViewProvider, protected themeService: IThemeService, options: IOptions = Object.create(null)) {
		super();
		this.history = new HistoryNavigator<string>();
		this.onOptionChange = null;
		this.width = options.width || 100;
		this.placeholder = options.placeholder || '';
		this.ariaLabel = options.ariaLabel || nls.localize('defaultLabel', "input");

		this.domNode = null;
		this.inputNode = null;
		this.inputBox = null;

		this.render();

		parent.appendChild(this.domNode);
	}

	public dispose(): void {
		super.dispose();
		if (this.inputFocusTracker) {
			this.inputFocusTracker.dispose();
		}
	}

	public on(eventType: string, handler: (event: Event) => void): PatternInputWidget {
		switch (eventType) {
			case 'keydown':
			case 'keyup':
				$(this.inputBox.inputElement).on(eventType, handler);
				break;
			case PatternInputWidget.OPTION_CHANGE:
				this.onOptionChange = handler;
				break;
		}
		return this;
	}

	public setWidth(newWidth: number): void {
		this.width = newWidth;
		this.domNode.style.width = this.width + 'px';
		this.contextViewProvider.layout();
		this.setInputWidth();
	}

	public getValue(): string {
		return this.inputBox.value;
	}

	public setValue(value: string): void {
		if (this.inputBox.value !== value) {
			this.inputBox.value = value;
		}
	}


	public select(): void {
		this.inputBox.select();
	}

	public focus(): void {
		this.inputBox.focus();
	}

	public inputHasFocus(): boolean {
		return this.inputBox.hasFocus();
	}

	private setInputWidth(): void {
		this.inputBox.width = this.width - this.getSubcontrolsWidth() - 2; // 2 for input box border
	}

	protected getSubcontrolsWidth(): number {
		return 0;
	}

	public getHistory(): string[] {
		return this.history.getHistory();
	}

	public setHistory(history: string[]) {
		this.history = new HistoryNavigator<string>(history);
	}

	public onSearchSubmit(): void {
		const value = this.getValue();
		if (value) {
			this.history.addIfNotPresent(value);
		}
	}

	public showNextTerm() {
		let next = this.history.next();
		if (next) {
			this.setValue(next);
		}
	}

	public showPreviousTerm() {
		let previous;
		if (this.getValue().length === 0) {
			previous = this.history.current();
		} else {
			this.history.addIfNotPresent(this.getValue());
			previous = this.history.previous();
		}
		if (previous) {
			this.setValue(previous);
		}
	}

	private render(): void {
		this.domNode = document.createElement('div');
		this.domNode.style.width = this.width + 'px';
		$(this.domNode).addClass('monaco-findInput');

		this.inputBox = new InputBox(this.domNode, this.contextViewProvider, {
			placeholder: this.placeholder || '',
			ariaLabel: this.ariaLabel || '',
			validationOptions: {
				validation: null,
				showMessage: true
			}
		});
		this._register(attachInputBoxStyler(this.inputBox, this.themeService));
		this.inputFocusTracker = dom.trackFocus(this.inputBox.inputElement);
		this.onkeyup(this.inputBox.inputElement, (keyboardEvent) => this.onInputKeyUp(keyboardEvent));

		let controls = document.createElement('div');
		controls.className = 'controls';
		this.renderSubcontrols(controls);

		this.domNode.appendChild(controls);
		this.setInputWidth();
	}

	protected renderSubcontrols(controlsDiv: HTMLDivElement): void {
	}

	private onInputKeyUp(keyboardEvent: IKeyboardEvent) {
		switch (keyboardEvent.keyCode) {
			case KeyCode.Enter:
				this._onSubmit.fire();
				return;
			case KeyCode.Escape:
				this._onCancel.fire();
				return;
			default:
				return;
		}
	}
}

export class ExcludePatternInputWidget extends PatternInputWidget {

	constructor(parent: HTMLElement, contextViewProvider: IContextViewProvider, themeService: IThemeService, private telemetryService: ITelemetryService, options: IOptions = Object.create(null)) {
		super(parent, contextViewProvider, themeService, options);
	}

	private useIgnoreFilesBox: Checkbox;
	private useExcludeSettingsBox: Checkbox;

	public dispose(): void {
		super.dispose();
		this.useIgnoreFilesBox.dispose();
		this.useExcludeSettingsBox.dispose();
	}

	public useExcludeSettings(): boolean {
		return this.useExcludeSettingsBox.checked;
	}

	public setUseExcludeSettings(value: boolean) {
		this.useExcludeSettingsBox.checked = value;
	}

	public useIgnoreFiles(): boolean {
		return this.useIgnoreFilesBox.checked;
	}

	public setUseIgnoreFiles(value: boolean): void {
		this.useIgnoreFilesBox.checked = value;
	}

	protected getSubcontrolsWidth(): number {
		return super.getSubcontrolsWidth() + this.useIgnoreFilesBox.width() + this.useExcludeSettingsBox.width();
	}

	protected renderSubcontrols(controlsDiv: HTMLDivElement): void {
		this.useIgnoreFilesBox = new Checkbox({
			actionClassName: 'useIgnoreFiles',
			title: nls.localize('useIgnoreFilesDescription', "Use Ignore Files"),
			isChecked: false,
			onChange: (viaKeyboard) => {
				this.telemetryService.publicLog('search.useIgnoreFiles.toggled');
				this.onOptionChange(null);
				if (!viaKeyboard) {
					this.inputBox.focus();
				}
			}
		});
		this._register(attachCheckboxStyler(this.useIgnoreFilesBox, this.themeService));

		this.useExcludeSettingsBox = new Checkbox({
			actionClassName: 'useExcludeSettings',
			title: nls.localize('useExcludeSettingsDescription', "Use Exclude Settings"),
			isChecked: false,
			onChange: (viaKeyboard) => {
				this.telemetryService.publicLog('search.useExcludeSettings.toggled');
				this.onOptionChange(null);
				if (!viaKeyboard) {
					this.inputBox.focus();
				}
			}
		});
		this._register(attachCheckboxStyler(this.useExcludeSettingsBox, this.themeService));

		controlsDiv.appendChild(this.useIgnoreFilesBox.domNode);
		controlsDiv.appendChild(this.useExcludeSettingsBox.domNode);
		super.renderSubcontrols(controlsDiv);
	}
}