/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../dom.js';
import { IKeyboardEvent } from '../../keyboardEvent.js';
import { IMouseEvent } from '../../mouseEvent.js';
import { IToggleStyles, Toggle } from '../toggle/toggle.js';
import { IContextViewProvider } from '../contextview/contextview.js';
// import { CaseSensitiveToggle, RegexToggle, WholeWordsToggle } from './findInputToggles.js';
import {
	// HistoryInputBox,
	InputBox,
	IInputBoxStyles,
	IInputValidator,
	IMessage as InputBoxMessage
} from '../inputbox/inputBox.js';
import { Widget } from '../widget.js';
import { Emitter, Event } from '../../../common/event.js';
import { KeyCode } from '../../../common/keyCodes.js';
import './nthMatchInput.css';
import * as nls from '../../../../nls.js';
import { DisposableStore, MutableDisposable } from '../../../common/lifecycle.js';
import { createInstantHoverDelegate } from '../hover/hoverDelegateFactory.js'; // TODO: Remove?
import { IRange } from '../../../common/range.js';
// import { IScrollEvent } from '../../../../editor/common/editorCommon.js';


export interface INthMatchInputOptions {
	readonly placeholder?: string;
	readonly width?: number;
	readonly validation?: IInputValidator;
	readonly label: string;
	readonly type: 'number';
	readonly min?: number;
	readonly max?: number;
	readonly lastMatchLocation?: number;
	readonly flexibleHeight?: boolean;
	readonly flexibleWidth?: boolean;
	readonly flexibleMaxHeight?: number;

	readonly showCommonFindToggles?: boolean;
	// readonly appendCaseSensitiveLabel?: string;
	// readonly appendWholeWordsLabel?: string;
	// readonly appendRegexLabel?: string;
	// readonly history?: string[];
	// readonly additionalToggles?: Toggle[];
	// readonly showHistoryHint?: () => boolean;
	readonly toggleStyles: IToggleStyles;
	readonly inputBoxStyles: IInputBoxStyles;
}

export interface IStepEvent {
	direction: 'up' | 'down';
}

export interface IJumpEvent {
	// `toMatchLocation` is emitted as a formality and for completion.
	// However, the consumer (codeEditor.ts --> findController.ts) doesn't need it.
	// findController.ts calls its own `toFindMatchIndex(value)` method
	// which handles indexing.
	toMatchLocation: number;
}

const NLS_DEFAULT_LABEL = nls.localize('defaultLabel', "input");

export class NthMatchInput extends Widget {

	// static readonly OPTION_CHANGE: string = 'optionChange';

	private placeholder: string;
	private validation?: IInputValidator;
	private label: string;
	private type: string;
	private readonly showCommonFindToggles: boolean;
	private fixFocusOnOptionClickEnabled = true;
	private imeSessionInProgress = false;
	private readonly additionalTogglesDisposables: MutableDisposable<DisposableStore> = this._register(new MutableDisposable());

	// protected readonly controls: HTMLDivElement;
	// protected readonly regex?: RegexToggle;
	// protected readonly wholeWords?: WholeWordsToggle;
	// protected readonly caseSensitive?: CaseSensitiveToggle;
	// protected additionalToggles: Toggle[] = [];
	public readonly domNode: HTMLElement;
	public readonly inputBox: InputBox;
	public lastMatchLocation: number;
	public min: number;
	public max: number;

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

	private readonly _onStep = this._register(new Emitter<IStepEvent>());
	public readonly onStep: Event<IStepEvent> = this._onStep.event;


	private readonly _onJump = this._register(new Emitter<IJumpEvent>());
	public readonly onJump: Event<IJumpEvent> = this._onJump.event;

	// private _onCaseSensitiveKeyDown = this._register(new Emitter<IKeyboardEvent>());
	// public readonly onCaseSensitiveKeyDown: Event<IKeyboardEvent> = this._onCaseSensitiveKeyDown.event;

	// private _onRegexKeyDown = this._register(new Emitter<IKeyboardEvent>());
	// public readonly onRegexKeyDown: Event<IKeyboardEvent> = this._onRegexKeyDown.event;

	constructor(parent: HTMLElement | null, contextViewProvider: IContextViewProvider | undefined, options: INthMatchInputOptions) {
		super();
		this.placeholder = options.placeholder || '';
		this.validation = options.validation;
		this.label = options.label || NLS_DEFAULT_LABEL;
		this.type = options.type || 'number';
		this.min = options.min || 0;
		this.max = options.max || 0;
		this.lastMatchLocation = options.lastMatchLocation || 0;
		this.showCommonFindToggles = !!options.showCommonFindToggles;

		// const appendCaseSensitiveLabel = options.appendCaseSensitiveLabel || '';
		// const appendWholeWordsLabel = options.appendWholeWordsLabel || '';
		// const appendRegexLabel = options.appendRegexLabel || '';
		// const history = options.history || [];
		const flexibleHeight = !!options.flexibleHeight;
		const flexibleWidth = !!options.flexibleWidth;
		const flexibleMaxHeight = options.flexibleMaxHeight;

		this.domNode = document.createElement('div');
		this.domNode.classList.add('monaco-findInput');

		this.inputBox = this._register(new InputBox(this.domNode, contextViewProvider, {
			placeholder: this.placeholder || '',
			ariaLabel: this.label || '',
			validationOptions: {
				validation: this.validation
			},
			// history,
			// showHistoryHint: options.showHistoryHint,
			flexibleHeight,
			flexibleWidth,
			flexibleMaxHeight,
			inputBoxStyles: options.inputBoxStyles,
			type: this.type
		}));

		const hoverDelegate = this._register(createInstantHoverDelegate());


		// TODO: Add scroll listener?
		//		 Let the user scroll the input value up or down on scroll?
		// this.onscroll(this.domNode, (event: IScrollEvent) => {

		// });

		this.onkeydown(this.domNode, (event: IKeyboardEvent) => {

			const currentValueAsInt = parseInt(this.inputBox.value);
			const isNumericKey = event.keyCode >= KeyCode.Digit0 && event.keyCode <= KeyCode.Digit9;


			// A numeric key was pressed
			if (isNumericKey) {
				// this.inputBox.value = currentValueAsInt > this.max ? `${this.max}` : currentValueAsInt < this.min ? `${this.min}` : `${currentValueAsInt}`;


				// if (currentValueAsInt > this.max) {
				// 	this.inputBox.value = `${this.max}`;
				// 	// this._onJump.fire({ toMatchLocation: this.max });
				// }
				// else if (currentValueAsInt < this.min) {
				// 	this.inputBox.value = `${this.min}`;
				// }
				// // this.inputBox.focus();
			}

			// Arrow-Key support to step the matched location up or down
			else if (event.equals(KeyCode.UpArrow)) {
				// const valueAfterChange = (!isNaN(currentValueAsInt) ? currentValueAsInt + 1 : 0);
				this._onStep.fire({ direction: 'down' });
				// this.lastMatchLocation = valueAfterChange;

				// const valueAfterChange = (!isNaN(currentValueAsInt) ? currentValueAsInt + 1 : 0);
				// if (valueAfterChange > this.max) { // Out of bounds. Not sure by how much so 'jump' inbounds from the right
				// 	this._onJump.fire({ toMatchLocation: this.min });
				// 	this.lastMatchLocation = this.min;
				// }
				// else {
				// 	this._onStep.fire({ direction: 'up' });
				// 	this.lastMatchLocation = valueAfterChange;
				// }
			}

			else if (event.equals(KeyCode.DownArrow)) {
				this._onStep.fire({ direction: 'up' });


				// const valueAfterChange = (!isNaN(currentValueAsInt) ? currentValueAsInt /* - 1 */ : 0);
				// if (valueAfterChange < this.min) { // Out of bounds. Not sure by how much so 'jump' inbounds from the left
				// 	this._onJump.fire({ toMatchLocation: this.min });
				// 	this.lastMatchLocation = this.min;
				// }
				// else {
				// 	this._onStep.fire({ direction: 'down' });
				// 	this.lastMatchLocation = valueAfterChange;
				// }
			}

			// Arrow-Key support to step the cursor left or right in the input box
			else if (event.equals(KeyCode.LeftArrow)) {
				const { start: cursorStart, end: cursorEnd }: IRange = (this.inputBox.getSelection() as IRange);

				if (cursorStart > 0) {
					this.inputBox.inputElement.selectionStart = (this.inputBox.inputElement.selectionStart || 1) - 1;
				}
			}

			else if (event.equals(KeyCode.RightArrow)) {
				const { start: cursorStart, end: cursorEnd }: IRange = (this.inputBox.getSelection() as IRange);

				if (cursorStart < (this.inputBox.inputElement.selectionEnd || this.inputBox.value.length - 1)) {
					this.inputBox.inputElement.selectionStart = (this.inputBox.inputElement.selectionStart || 0) + 1;
				}
			}

			else if (event.equals(KeyCode.Backspace)) {
				const charsArr = [...this.inputBox.value];
				charsArr.pop();
				this.inputBox.value = `${parseInt(charsArr?.join(''))}`;
			}

			else if (event.equals(KeyCode.Delete)) {
				if (!this.inputBox.isSelectionAtEnd()) {
					const charsArr = [...this.inputBox.value];
					charsArr.splice(this.inputBox.inputElement.selectionStart || 0, 1);
					this.inputBox.value = `${parseInt(charsArr?.join(''))}`;
					// this.inputBox.inputElement.selectionStart =
				}
			}

			else if (event.equals(KeyCode.Enter)) {
				// const destination = (
				// 	!isNaN(currentValueAsInt) ?
				// 		Math.max((Math.min(currentValueAsInt, this.max), this.min))
				// 		: 0
				// );
				// this._onJump.fire({ toMatchLocation: destination });

				this._onJump.fire({ toMatchLocation: currentValueAsInt });
				// this.inputBox.focus();
			}

			else if (
				event.equals(KeyCode.Escape) || event.equals(KeyCode.Tab) ||
				(event.shiftKey && event.keyCode === KeyCode.Tab)
			) {

				this.inputBox.blur();
				// document.dispatchEvent(new KeyboardEvent('Tab'));
			}

			// Select 1 character to the left
			else if (event.shiftKey && event.code === 'ArrowLeft'/* event.equals(KeyCode.LeftArrow) */) {
				const selectRange: IRange = {
					start: (this.inputBox.inputElement.selectionEnd || 1) - 1,
					end: this.inputBox.inputElement.selectionEnd || 1
				};
				this.inputBox.select(selectRange);
			}

			// Select 1 character to the right
			else if (event.shiftKey && event.code === 'ArrowRight'/* event.equals(KeyCode.RightArrow) */) {
				const selectRange: IRange = {
					start: (this.inputBox.inputElement.selectionStart || 1) + 1,
					end: this.inputBox.inputElement.selectionEnd || 1
				};
				this.inputBox.select(selectRange);
			}

			// Select 1 word/token to the left
			else if (event.shiftKey && event.ctrlKey && event.code === 'ArrowLeft' /* event.equals(KeyCode.LeftArrow) */) {

			}

			// Select 1 word/token to the right
			else if (event.shiftKey && event.ctrlKey && event.code === 'ArrowRight' /* event.equals(KeyCode.RightArrow) */) {

			}

			// Select all input text
			else if (event.ctrlKey && event.code === 'KeyA' /* event.equals(KeyCode.KeyA) */) {
				const selectRange: IRange = { start: 0, end: this.inputBox.value.length - 1 };
				this.inputBox.select(selectRange);
			}


			// Ctrl+Z (undo)


			// Ctrl+Shift+Z or Ctrl+Y(redo)








			if (!isNumericKey) {
				dom.EventHelper.stop(event, true);
			}
		});


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

	public layout(style: { collapsedFindWidget: boolean; narrowFindWidget: boolean; reducedFindWidget: boolean }) {
		this.inputBox.layout();
		this.updateInputBoxPadding(style.collapsedFindWidget);
	}

	public enable(): void {
		this.domNode.classList.remove('disabled');
		this.inputBox.enable();
	}

	public disable(): void {
		this.domNode.classList.add('disabled');
		this.inputBox.disable();
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

	private updateInputBoxPadding(controlsHidden = false) {
		if (controlsHidden) {
			this.inputBox.paddingRight = 0;
		} else {
			this.inputBox.paddingRight = 0;
		}
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

	public select(): void {
		this.inputBox.select();
	}

	public focus(): void {
		this.inputBox.focus();
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
