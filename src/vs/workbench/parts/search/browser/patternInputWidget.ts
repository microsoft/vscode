/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from 'vs/nls';
import * as dom from 'vs/base/browser/dom';
import { Widget } from 'vs/base/browser/ui/widget';
import { Checkbox } from 'vs/base/browser/ui/checkbox/checkbox';
import { IContextViewProvider } from 'vs/base/browser/ui/contextview/contextview';
import { IInputValidator, HistoryInputBox } from 'vs/base/browser/ui/inputbox/inputBox';
import { IKeyboardEvent } from 'vs/base/browser/keyboardEvent';
import { KeyCode } from 'vs/base/common/keyCodes';
import { Event as CommonEvent, Emitter } from 'vs/base/common/event';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { attachInputBoxStyler, attachCheckboxStyler } from 'vs/platform/theme/common/styler';
import { ContextScopedHistoryInputBox } from 'vs/platform/widget/browser/contextScopedHistoryWidget';
import { IContextKeyService } from 'vs/platform/contextkey/common/contextkey';

export interface IOptions {
	placeholder?: string;
	width?: number;
	validation?: IInputValidator;
	ariaLabel?: string;
	history?: string[];
}

export class PatternInputWidget extends Widget {

	static OPTION_CHANGE: string = 'optionChange';

	public inputFocusTracker: dom.IFocusTracker;

	private width: number;
	private placeholder: string;
	private ariaLabel: string;

	private domNode: HTMLElement;
	protected inputBox: HistoryInputBox;

	private _onSubmit = this._register(new Emitter<boolean>());
	public onSubmit: CommonEvent<boolean> = this._onSubmit.event;

	private _onCancel = this._register(new Emitter<boolean>());
	public onCancel: CommonEvent<boolean> = this._onCancel.event;

	constructor(parent: HTMLElement, private contextViewProvider: IContextViewProvider, options: IOptions = Object.create(null),
		@IThemeService protected themeService: IThemeService,
		@IContextKeyService private contextKeyService: IContextKeyService
	) {
		super();
		this.width = options.width || 100;
		this.placeholder = options.placeholder || '';
		this.ariaLabel = options.ariaLabel || nls.localize('defaultLabel', "input");

		this.domNode = null;
		this.inputBox = null;

		this.render(options);

		parent.appendChild(this.domNode);
	}

	public dispose(): void {
		super.dispose();
		if (this.inputFocusTracker) {
			this.inputFocusTracker.dispose();
		}
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
		return this.inputBox.getHistory();
	}

	public clearHistory(): void {
		this.inputBox.clearHistory();
	}

	public onSearchSubmit(): void {
		this.inputBox.addToHistory();
	}

	public showNextTerm() {
		this.inputBox.showNextValue();
	}

	public showPreviousTerm() {
		this.inputBox.showPreviousValue();
	}

	private render(options: IOptions): void {
		this.domNode = document.createElement('div');
		this.domNode.style.width = this.width + 'px';
		dom.addClass(this.domNode, 'monaco-findInput');

		this.inputBox = new ContextScopedHistoryInputBox(this.domNode, this.contextViewProvider, {
			placeholder: this.placeholder || '',
			ariaLabel: this.ariaLabel || '',
			validationOptions: {
				validation: null
			},
			history: options.history || []
		}, this.contextKeyService);
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

	constructor(parent: HTMLElement, contextViewProvider: IContextViewProvider, options: IOptions = Object.create(null),
		@IThemeService themeService: IThemeService,
		@IContextKeyService contextKeyService: IContextKeyService
	) {
		super(parent, contextViewProvider, options, themeService, contextKeyService);
	}

	private useExcludesAndIgnoreFilesBox: Checkbox;

	public dispose(): void {
		super.dispose();
		this.useExcludesAndIgnoreFilesBox.dispose();
	}

	public useExcludesAndIgnoreFiles(): boolean {
		return this.useExcludesAndIgnoreFilesBox.checked;
	}

	public setUseExcludesAndIgnoreFiles(value: boolean) {
		this.useExcludesAndIgnoreFilesBox.checked = value;
	}

	protected getSubcontrolsWidth(): number {
		return super.getSubcontrolsWidth() + this.useExcludesAndIgnoreFilesBox.width();
	}

	protected renderSubcontrols(controlsDiv: HTMLDivElement): void {
		this.useExcludesAndIgnoreFilesBox = this._register(new Checkbox({
			actionClassName: 'useExcludesAndIgnoreFiles',
			title: nls.localize('useExcludesAndIgnoreFilesDescription', "Use Exclude Settings and Ignore Files"),
			isChecked: true,
		}));
		this._register(this.useExcludesAndIgnoreFilesBox.onChange(viaKeyboard => {
			if (!viaKeyboard) {
				this.inputBox.focus();
			}
		}));
		this._register(attachCheckboxStyler(this.useExcludesAndIgnoreFilesBox, this.themeService));

		controlsDiv.appendChild(this.useExcludesAndIgnoreFilesBox.domNode);
		super.renderSubcontrols(controlsDiv);
	}
}