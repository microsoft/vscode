/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from 'vs/base/browser/dom';
import { IKeyboardEvent } from 'vs/base/browser/keyboardEvent';
import { IMouseEvent } from 'vs/base/browser/mouseEvent';
import { IToggleStyles, Toggle } from 'vs/base/browser/ui/toggle/toggle';
import { IContextViewProvider } from 'vs/base/browser/ui/contextview/contextview';
import { CaseSensitiveToggle, RegexToggle, WholeWordsToggle } from 'vs/base/browser/ui/findinput/findInputToggles';
import { HistoryInputBox, IInputBoxStyles, IInputValidator, IMessage as InputBoxMessage } from 'vs/base/browser/ui/inputbox/inputBox';
import { Widget } from 'vs/base/browser/ui/widget';
import { Color } from 'vs/base/common/color';
import { Emitter, Event } from 'vs/base/common/event';
import { KeyCode } from 'vs/base/common/keyCodes';
import 'vs/css!./findInput';
import * as nls from 'vs/nls';
import { DisposableStore } from 'vs/base/common/lifecycle';


export interface IFindInputOptions extends IFindInputStyles {
	readonly placeholder?: string;
	readonly width?: number;
	readonly validation?: IInputValidator;
	readonly label: string;
	readonly flexibleHeight?: boolean;
	readonly flexibleWidth?: boolean;
	readonly flexibleMaxHeight?: number;

	readonly showCommonFindToggles?: boolean;
	readonly appendCaseSensitiveLabel?: string;
	readonly appendWholeWordsLabel?: string;
	readonly appendRegexLabel?: string;
	readonly history?: string[];
	readonly additionalToggles?: Toggle[];
	readonly showHistoryHint?: () => boolean;
}

export interface IFindInputStyles extends IInputBoxStyles {
	inputActiveOptionBorder?: Color;
	inputActiveOptionForeground?: Color;
	inputActiveOptionBackground?: Color;
}

const NLS_DEFAULT_LABEL = nls.localize('defaultLabel', "input");

export class FindInput extends Widget {

	static readonly OPTION_CHANGE: string = 'optionChange';

	private placeholder: string;
	private validation?: IInputValidator;
	private label: string;
	private showCommonFindToggles: boolean;
	private fixFocusOnOptionClickEnabled = true;
	private imeSessionInProgress = false;
	private additionalTogglesDisposables: DisposableStore = new DisposableStore();

	protected inputActiveOptionBorder?: Color;
	protected inputActiveOptionForeground?: Color;
	protected inputActiveOptionBackground?: Color;
	protected inputBackground?: Color;
	protected inputForeground?: Color;
	protected inputBorder?: Color;

	protected inputValidationInfoBorder?: Color;
	protected inputValidationInfoBackground?: Color;
	protected inputValidationInfoForeground?: Color;
	protected inputValidationWarningBorder?: Color;
	protected inputValidationWarningBackground?: Color;
	protected inputValidationWarningForeground?: Color;
	protected inputValidationErrorBorder?: Color;
	protected inputValidationErrorBackground?: Color;
	protected inputValidationErrorForeground?: Color;

	protected controls: HTMLDivElement;
	protected regex: RegexToggle;
	protected wholeWords: WholeWordsToggle;
	protected caseSensitive: CaseSensitiveToggle;
	protected additionalToggles: Toggle[] = [];
	public domNode: HTMLElement;
	public inputBox: HistoryInputBox;

	private readonly _onDidOptionChange = this._register(new Emitter<boolean>());
	public readonly onDidOptionChange: Event<boolean /* via keyboard */> = this._onDidOptionChange.event;

	private readonly _onKeyDown = this._register(new Emitter<IKeyboardEvent>());
	public readonly onKeyDown: Event<IKeyboardEvent> = this._onKeyDown.event;

	private readonly _onMouseDown = this._register(new Emitter<IMouseEvent>());
	public readonly onMouseDown: Event<IMouseEvent> = this._onMouseDown.event;

	private readonly _onInput = this._register(new Emitter<void>());
	public readonly onInput: Event<void> = this._onInput.event;

	private readonly _onKeyUp = this._register(new Emitter<IKeyboardEvent>());
	public readonly onKeyUp: Event<IKeyboardEvent> = this._onKeyUp.event;

	private _onCaseSensitiveKeyDown = this._register(new Emitter<IKeyboardEvent>());
	public readonly onCaseSensitiveKeyDown: Event<IKeyboardEvent> = this._onCaseSensitiveKeyDown.event;

	private _onRegexKeyDown = this._register(new Emitter<IKeyboardEvent>());
	public readonly onRegexKeyDown: Event<IKeyboardEvent> = this._onRegexKeyDown.event;

	constructor(parent: HTMLElement | null, contextViewProvider: IContextViewProvider | undefined, options: IFindInputOptions) {
		super();
		this.placeholder = options.placeholder || '';
		this.validation = options.validation;
		this.label = options.label || NLS_DEFAULT_LABEL;
		this.showCommonFindToggles = !!options.showCommonFindToggles;

		this.inputActiveOptionBorder = options.inputActiveOptionBorder;
		this.inputActiveOptionForeground = options.inputActiveOptionForeground;
		this.inputActiveOptionBackground = options.inputActiveOptionBackground;
		this.inputBackground = options.inputBackground;
		this.inputForeground = options.inputForeground;
		this.inputBorder = options.inputBorder;

		this.inputValidationInfoBorder = options.inputValidationInfoBorder;
		this.inputValidationInfoBackground = options.inputValidationInfoBackground;
		this.inputValidationInfoForeground = options.inputValidationInfoForeground;
		this.inputValidationWarningBorder = options.inputValidationWarningBorder;
		this.inputValidationWarningBackground = options.inputValidationWarningBackground;
		this.inputValidationWarningForeground = options.inputValidationWarningForeground;
		this.inputValidationErrorBorder = options.inputValidationErrorBorder;
		this.inputValidationErrorBackground = options.inputValidationErrorBackground;
		this.inputValidationErrorForeground = options.inputValidationErrorForeground;

		const appendCaseSensitiveLabel = options.appendCaseSensitiveLabel || '';
		const appendWholeWordsLabel = options.appendWholeWordsLabel || '';
		const appendRegexLabel = options.appendRegexLabel || '';
		const history = options.history || [];
		const flexibleHeight = !!options.flexibleHeight;
		const flexibleWidth = !!options.flexibleWidth;
		const flexibleMaxHeight = options.flexibleMaxHeight;

		this.domNode = document.createElement('div');
		this.domNode.classList.add('monaco-findInput');

		this.inputBox = this._register(new HistoryInputBox(this.domNode, contextViewProvider, {
			placeholder: this.placeholder || '',
			ariaLabel: this.label || '',
			validationOptions: {
				validation: this.validation
			},
			inputBackground: this.inputBackground,
			inputForeground: this.inputForeground,
			inputBorder: this.inputBorder,
			inputValidationInfoBackground: this.inputValidationInfoBackground,
			inputValidationInfoForeground: this.inputValidationInfoForeground,
			inputValidationInfoBorder: this.inputValidationInfoBorder,
			inputValidationWarningBackground: this.inputValidationWarningBackground,
			inputValidationWarningForeground: this.inputValidationWarningForeground,
			inputValidationWarningBorder: this.inputValidationWarningBorder,
			inputValidationErrorBackground: this.inputValidationErrorBackground,
			inputValidationErrorForeground: this.inputValidationErrorForeground,
			inputValidationErrorBorder: this.inputValidationErrorBorder,
			history,
			showHistoryHint: options.showHistoryHint,
			flexibleHeight,
			flexibleWidth,
			flexibleMaxHeight
		}));

		this.regex = this._register(new RegexToggle({
			appendTitle: appendRegexLabel,
			isChecked: false,
			inputActiveOptionBorder: this.inputActiveOptionBorder,
			inputActiveOptionForeground: this.inputActiveOptionForeground,
			inputActiveOptionBackground: this.inputActiveOptionBackground
		}));
		this._register(this.regex.onChange(viaKeyboard => {
			this._onDidOptionChange.fire(viaKeyboard);
			if (!viaKeyboard && this.fixFocusOnOptionClickEnabled) {
				this.inputBox.focus();
			}
			this.validate();
		}));
		this._register(this.regex.onKeyDown(e => {
			this._onRegexKeyDown.fire(e);
		}));

		this.wholeWords = this._register(new WholeWordsToggle({
			appendTitle: appendWholeWordsLabel,
			isChecked: false,
			inputActiveOptionBorder: this.inputActiveOptionBorder,
			inputActiveOptionForeground: this.inputActiveOptionForeground,
			inputActiveOptionBackground: this.inputActiveOptionBackground
		}));
		this._register(this.wholeWords.onChange(viaKeyboard => {
			this._onDidOptionChange.fire(viaKeyboard);
			if (!viaKeyboard && this.fixFocusOnOptionClickEnabled) {
				this.inputBox.focus();
			}
			this.validate();
		}));

		this.caseSensitive = this._register(new CaseSensitiveToggle({
			appendTitle: appendCaseSensitiveLabel,
			isChecked: false,
			inputActiveOptionBorder: this.inputActiveOptionBorder,
			inputActiveOptionForeground: this.inputActiveOptionForeground,
			inputActiveOptionBackground: this.inputActiveOptionBackground
		}));
		this._register(this.caseSensitive.onChange(viaKeyboard => {
			this._onDidOptionChange.fire(viaKeyboard);
			if (!viaKeyboard && this.fixFocusOnOptionClickEnabled) {
				this.inputBox.focus();
			}
			this.validate();
		}));
		this._register(this.caseSensitive.onKeyDown(e => {
			this._onCaseSensitiveKeyDown.fire(e);
		}));

		// Arrow-Key support to navigate between options
		const indexes = [this.caseSensitive.domNode, this.wholeWords.domNode, this.regex.domNode];
		this.onkeydown(this.domNode, (event: IKeyboardEvent) => {
			if (event.equals(KeyCode.LeftArrow) || event.equals(KeyCode.RightArrow) || event.equals(KeyCode.Escape)) {
				const index = indexes.indexOf(<HTMLElement>document.activeElement);
				if (index >= 0) {
					let newIndex: number = -1;
					if (event.equals(KeyCode.RightArrow)) {
						newIndex = (index + 1) % indexes.length;
					} else if (event.equals(KeyCode.LeftArrow)) {
						if (index === 0) {
							newIndex = indexes.length - 1;
						} else {
							newIndex = index - 1;
						}
					}

					if (event.equals(KeyCode.Escape)) {
						indexes[index].blur();
						this.inputBox.focus();
					} else if (newIndex >= 0) {
						indexes[newIndex].focus();
					}

					dom.EventHelper.stop(event, true);
				}
			}
		});


		this.controls = document.createElement('div');
		this.controls.className = 'controls';
		this.controls.style.display = this.showCommonFindToggles ? 'block' : 'none';
		this.controls.appendChild(this.caseSensitive.domNode);
		this.controls.appendChild(this.wholeWords.domNode);
		this.controls.appendChild(this.regex.domNode);

		if (!this.showCommonFindToggles) {
			this.caseSensitive.domNode.style.display = 'none';
			this.wholeWords.domNode.style.display = 'none';
			this.regex.domNode.style.display = 'none';
		}

		this.setAdditionalToggles(options?.additionalToggles);

		this.domNode.appendChild(this.controls);

		parent?.appendChild(this.domNode);

		this._register(dom.addDisposableListener(this.inputBox.inputElement, 'compositionstart', (e: CompositionEvent) => {
			this.imeSessionInProgress = true;
		}));
		this._register(dom.addDisposableListener(this.inputBox.inputElement, 'compositionend', (e: CompositionEvent) => {
			this.imeSessionInProgress = false;
			this._onInput.fire();
		}));

		this.onkeydown(this.inputBox.inputElement, (e) => this._onKeyDown.fire(e));
		this.onkeyup(this.inputBox.inputElement, (e) => this._onKeyUp.fire(e));
		this.oninput(this.inputBox.inputElement, (e) => this._onInput.fire());
		this.onmousedown(this.inputBox.inputElement, (e) => this._onMouseDown.fire(e));
	}

	public get isImeSessionInProgress(): boolean {
		return this.imeSessionInProgress;
	}

	public get onDidChange(): Event<string> {
		return this.inputBox.onDidChange;
	}

	public enable(): void {
		this.domNode.classList.remove('disabled');
		this.inputBox.enable();
		this.regex.enable();
		this.wholeWords.enable();
		this.caseSensitive.enable();

		for (const toggle of this.additionalToggles) {
			toggle.enable();
		}
	}

	public disable(): void {
		this.domNode.classList.add('disabled');
		this.inputBox.disable();
		this.regex.disable();
		this.wholeWords.disable();
		this.caseSensitive.disable();

		for (const toggle of this.additionalToggles) {
			toggle.disable();
		}
	}

	public setFocusInputOnOptionClick(value: boolean): void {
		this.fixFocusOnOptionClickEnabled = value;
	}

	public setEnabled(enabled: boolean): void {
		if (enabled) {
			this.enable();
		} else {
			this.disable();
		}
	}

	public setAdditionalToggles(toggles: Toggle[] | undefined): void {
		for (const currentToggle of this.additionalToggles) {
			currentToggle.domNode.remove();
		}
		this.additionalToggles = [];
		this.additionalTogglesDisposables.dispose();
		this.additionalTogglesDisposables = new DisposableStore();

		for (const toggle of toggles ?? []) {
			this.additionalTogglesDisposables.add(toggle);
			this.controls.appendChild(toggle.domNode);

			this.additionalTogglesDisposables.add(toggle.onChange(viaKeyboard => {
				this._onDidOptionChange.fire(viaKeyboard);
				if (!viaKeyboard && this.fixFocusOnOptionClickEnabled) {
					this.inputBox.focus();
				}
			}));

			this.additionalToggles.push(toggle);
		}

		if (this.additionalToggles.length > 0) {
			this.controls.style.display = 'block';
		}

		this.inputBox.paddingRight =
			(this.showCommonFindToggles ? this.caseSensitive.width() + this.wholeWords.width() + this.regex.width() : 0)
			+ this.additionalToggles.reduce((r, t) => r + t.width(), 0);
	}

	public clear(): void {
		this.clearValidation();
		this.setValue('');
		this.focus();
	}

	public getValue(): string {
		return this.inputBox.value;
	}

	public setValue(value: string): void {
		if (this.inputBox.value !== value) {
			this.inputBox.value = value;
		}
	}

	public onSearchSubmit(): void {
		this.inputBox.addToHistory();
	}

	public style(styles: IFindInputStyles): void {
		this.inputActiveOptionBorder = styles.inputActiveOptionBorder;
		this.inputActiveOptionForeground = styles.inputActiveOptionForeground;
		this.inputActiveOptionBackground = styles.inputActiveOptionBackground;
		this.inputBackground = styles.inputBackground;
		this.inputForeground = styles.inputForeground;
		this.inputBorder = styles.inputBorder;

		this.inputValidationInfoBackground = styles.inputValidationInfoBackground;
		this.inputValidationInfoForeground = styles.inputValidationInfoForeground;
		this.inputValidationInfoBorder = styles.inputValidationInfoBorder;
		this.inputValidationWarningBackground = styles.inputValidationWarningBackground;
		this.inputValidationWarningForeground = styles.inputValidationWarningForeground;
		this.inputValidationWarningBorder = styles.inputValidationWarningBorder;
		this.inputValidationErrorBackground = styles.inputValidationErrorBackground;
		this.inputValidationErrorForeground = styles.inputValidationErrorForeground;
		this.inputValidationErrorBorder = styles.inputValidationErrorBorder;

		this.applyStyles();
	}

	protected applyStyles(): void {
		if (this.domNode) {
			const toggleStyles: IToggleStyles = {
				inputActiveOptionBorder: this.inputActiveOptionBorder,
				inputActiveOptionForeground: this.inputActiveOptionForeground,
				inputActiveOptionBackground: this.inputActiveOptionBackground,
			};
			this.regex.style(toggleStyles);
			this.wholeWords.style(toggleStyles);
			this.caseSensitive.style(toggleStyles);

			for (const toggle of this.additionalToggles) {
				toggle.style(toggleStyles);
			}

			const inputBoxStyles: IInputBoxStyles = {
				inputBackground: this.inputBackground,
				inputForeground: this.inputForeground,
				inputBorder: this.inputBorder,
				inputValidationInfoBackground: this.inputValidationInfoBackground,
				inputValidationInfoForeground: this.inputValidationInfoForeground,
				inputValidationInfoBorder: this.inputValidationInfoBorder,
				inputValidationWarningBackground: this.inputValidationWarningBackground,
				inputValidationWarningForeground: this.inputValidationWarningForeground,
				inputValidationWarningBorder: this.inputValidationWarningBorder,
				inputValidationErrorBackground: this.inputValidationErrorBackground,
				inputValidationErrorForeground: this.inputValidationErrorForeground,
				inputValidationErrorBorder: this.inputValidationErrorBorder
			};
			this.inputBox.style(inputBoxStyles);
		}
	}

	public select(): void {
		this.inputBox.select();
	}

	public focus(): void {
		this.inputBox.focus();
	}

	public getCaseSensitive(): boolean {
		return this.caseSensitive.checked;
	}

	public setCaseSensitive(value: boolean): void {
		this.caseSensitive.checked = value;
	}

	public getWholeWords(): boolean {
		return this.wholeWords.checked;
	}

	public setWholeWords(value: boolean): void {
		this.wholeWords.checked = value;
	}

	public getRegex(): boolean {
		return this.regex.checked;
	}

	public setRegex(value: boolean): void {
		this.regex.checked = value;
		this.validate();
	}

	public focusOnCaseSensitive(): void {
		this.caseSensitive.focus();
	}

	public focusOnRegex(): void {
		this.regex.focus();
	}

	private _lastHighlightFindOptions: number = 0;
	public highlightFindOptions(): void {
		this.domNode.classList.remove('highlight-' + (this._lastHighlightFindOptions));
		this._lastHighlightFindOptions = 1 - this._lastHighlightFindOptions;
		this.domNode.classList.add('highlight-' + (this._lastHighlightFindOptions));
	}

	public validate(): void {
		this.inputBox.validate();
	}

	public showMessage(message: InputBoxMessage): void {
		this.inputBox.showMessage(message);
	}

	public clearMessage(): void {
		this.inputBox.hideMessage();
	}

	private clearValidation(): void {
		this.inputBox.hideMessage();
	}
}
