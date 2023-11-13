/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from 'vs/base/browser/dom';
import { IKeyboardEvent } from 'vs/base/browser/keyboardEvent';
import { Toggle } from 'vs/base/browser/ui/toggle/toggle';
import { IContextViewProvider } from 'vs/base/browser/ui/contextview/contextview';
import { HistoryInputBox, IInputBoxStyles } from 'vs/base/browser/ui/inputbox/inputBox';
import { Widget } from 'vs/base/browser/ui/widget';
import { Codicon } from 'vs/base/common/codicons';
import { Emitter, Event as CommonEvent } from 'vs/base/common/event';
import { KeyCode } from 'vs/base/common/keyCodes';
import * as nls from 'vs/nls';
import { ContextScopedHistoryInputBox } from 'vs/platform/history/browser/contextScopedHistoryWidget';
import { showHistoryKeybindingHint } from 'vs/platform/history/browser/historyWidgetKeybindingHint';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { defaultToggleStyles } from 'vs/platform/theme/browser/defaultStyles';

export interface IOptions {
	placeholder?: string;
	showPlaceholderOnFocus?: boolean;
	tooltip?: string;
	width?: number;
	ariaLabel?: string;
	history?: string[];
	inputBoxStyles: IInputBoxStyles;
}

export class PatternInputWidget extends Widget {

	static OPTION_CHANGE: string = 'optionChange';

	inputFocusTracker!: dom.IFocusTracker;

	private width: number;

	private domNode!: HTMLElement;
	protected inputBox!: HistoryInputBox;

	private _onSubmit = this._register(new Emitter<boolean>());
	onSubmit: CommonEvent<boolean /* triggeredOnType */> = this._onSubmit.event;

	private _onCancel = this._register(new Emitter<void>());
	onCancel: CommonEvent<void> = this._onCancel.event;

	constructor(parent: HTMLElement, private contextViewProvider: IContextViewProvider, options: IOptions,
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
		@IConfigurationService protected readonly configurationService: IConfigurationService,
		@IKeybindingService private readonly keybindingService: IKeybindingService,
	) {
		super();
		options = {
			...{
				ariaLabel: nls.localize('defaultLabel', "input")
			},
			...options,
		};
		this.width = options.width ?? 100;

		this.render(options);

		parent.appendChild(this.domNode);
	}

	override dispose(): void {
		super.dispose();
		this.inputFocusTracker?.dispose();
	}

	setWidth(newWidth: number): void {
		this.width = newWidth;
		this.contextViewProvider.layout();
		this.setInputWidth();
	}

	getValue(): string {
		return this.inputBox.value;
	}

	setValue(value: string): void {
		if (this.inputBox.value !== value) {
			this.inputBox.value = value;
		}
	}


	select(): void {
		this.inputBox.select();
	}

	focus(): void {
		this.inputBox.focus();
	}

	inputHasFocus(): boolean {
		return this.inputBox.hasFocus();
	}

	private setInputWidth(): void {
		this.inputBox.width = this.width - this.getSubcontrolsWidth() - 2; // 2 for input box border
	}

	protected getSubcontrolsWidth(): number {
		return 0;
	}

	getHistory(): string[] {
		return this.inputBox.getHistory();
	}

	clearHistory(): void {
		this.inputBox.clearHistory();
	}

	prependHistory(history: string[]): void {
		this.inputBox.prependHistory(history);
	}

	clear(): void {
		this.setValue('');
	}

	onSearchSubmit(): void {
		this.inputBox.addToHistory();
	}

	showNextTerm() {
		this.inputBox.showNextValue();
	}

	showPreviousTerm() {
		this.inputBox.showPreviousValue();
	}

	private render(options: IOptions): void {
		this.domNode = document.createElement('div');
		this.domNode.classList.add('monaco-findInput');

		this.inputBox = new ContextScopedHistoryInputBox(this.domNode, this.contextViewProvider, {
			placeholder: options.placeholder,
			showPlaceholderOnFocus: options.showPlaceholderOnFocus,
			tooltip: options.tooltip,
			ariaLabel: options.ariaLabel,
			validationOptions: {
				validation: undefined
			},
			history: options.history || [],
			showHistoryHint: () => showHistoryKeybindingHint(this.keybindingService),
			inputBoxStyles: options.inputBoxStyles
		}, this.contextKeyService);
		this._register(this.inputBox.onDidChange(() => this._onSubmit.fire(true)));

		this.inputFocusTracker = dom.trackFocus(this.inputBox.inputElement);
		this.onkeyup(this.inputBox.inputElement, (keyboardEvent) => this.onInputKeyUp(keyboardEvent));

		const controls = document.createElement('div');
		controls.className = 'controls';
		this.renderSubcontrols(controls);

		this.domNode.appendChild(controls);
		this.setInputWidth();
	}

	protected renderSubcontrols(_controlsDiv: HTMLDivElement): void {
	}

	private onInputKeyUp(keyboardEvent: IKeyboardEvent) {
		switch (keyboardEvent.keyCode) {
			case KeyCode.Enter:
				this.onSearchSubmit();
				this._onSubmit.fire(false);
				return;
			case KeyCode.Escape:
				this._onCancel.fire();
				return;
		}
	}
}

export class IncludePatternInputWidget extends PatternInputWidget {

	private _onChangeSearchInEditorsBoxEmitter = this._register(new Emitter<void>());
	onChangeSearchInEditorsBox = this._onChangeSearchInEditorsBoxEmitter.event;

	constructor(parent: HTMLElement, contextViewProvider: IContextViewProvider, options: IOptions,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IConfigurationService configurationService: IConfigurationService,
		@IKeybindingService keybindingService: IKeybindingService,
	) {
		super(parent, contextViewProvider, options, contextKeyService, configurationService, keybindingService);
	}

	private useSearchInEditorsBox!: Toggle;

	override dispose(): void {
		super.dispose();
		this.useSearchInEditorsBox.dispose();
	}

	onlySearchInOpenEditors(): boolean {
		return this.useSearchInEditorsBox.checked;
	}

	setOnlySearchInOpenEditors(value: boolean) {
		this.useSearchInEditorsBox.checked = value;
		this._onChangeSearchInEditorsBoxEmitter.fire();
	}

	protected override getSubcontrolsWidth(): number {
		return super.getSubcontrolsWidth() + this.useSearchInEditorsBox.width();
	}

	protected override renderSubcontrols(controlsDiv: HTMLDivElement): void {
		this.useSearchInEditorsBox = this._register(new Toggle({
			icon: Codicon.book,
			title: nls.localize('onlySearchInOpenEditors', "Search only in Open Editors"),
			isChecked: false,
			...defaultToggleStyles
		}));
		this._register(this.useSearchInEditorsBox.onChange(viaKeyboard => {
			this._onChangeSearchInEditorsBoxEmitter.fire();
			if (!viaKeyboard) {
				this.inputBox.focus();
			}
		}));
		controlsDiv.appendChild(this.useSearchInEditorsBox.domNode);
		super.renderSubcontrols(controlsDiv);
	}
}

export class ExcludePatternInputWidget extends PatternInputWidget {

	private _onChangeIgnoreBoxEmitter = this._register(new Emitter<void>());
	onChangeIgnoreBox = this._onChangeIgnoreBoxEmitter.event;

	constructor(parent: HTMLElement, contextViewProvider: IContextViewProvider, options: IOptions,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IConfigurationService configurationService: IConfigurationService,
		@IKeybindingService keybindingService: IKeybindingService,
	) {
		super(parent, contextViewProvider, options, contextKeyService, configurationService, keybindingService);
	}

	private useExcludesAndIgnoreFilesBox!: Toggle;

	override dispose(): void {
		super.dispose();
		this.useExcludesAndIgnoreFilesBox.dispose();
	}

	useExcludesAndIgnoreFiles(): boolean {
		return this.useExcludesAndIgnoreFilesBox.checked;
	}

	setUseExcludesAndIgnoreFiles(value: boolean) {
		this.useExcludesAndIgnoreFilesBox.checked = value;
		this._onChangeIgnoreBoxEmitter.fire();
	}

	protected override getSubcontrolsWidth(): number {
		return super.getSubcontrolsWidth() + this.useExcludesAndIgnoreFilesBox.width();
	}

	protected override renderSubcontrols(controlsDiv: HTMLDivElement): void {
		this.useExcludesAndIgnoreFilesBox = this._register(new Toggle({
			icon: Codicon.exclude,
			actionClassName: 'useExcludesAndIgnoreFiles',
			title: nls.localize('useExcludesAndIgnoreFilesDescription', "Use Exclude Settings and Ignore Files"),
			isChecked: true,
			...defaultToggleStyles
		}));
		this._register(this.useExcludesAndIgnoreFilesBox.onChange(viaKeyboard => {
			this._onChangeIgnoreBoxEmitter.fire();
			if (!viaKeyboard) {
				this.inputBox.focus();
			}
		}));

		controlsDiv.appendChild(this.useExcludesAndIgnoreFilesBox.domNode);
		super.renderSubcontrols(controlsDiv);
	}
}
