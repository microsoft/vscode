/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {RunOnceScheduler} from 'vs/base/common/async';
import Event, {Emitter} from 'vs/base/common/event';
import {CommonKeybindings} from 'vs/base/common/keyCodes';
import {Disposable} from 'vs/base/common/lifecycle';
import {IClipboardEvent, IKeyboardEventWrapper, ISimpleModel, ITextAreaWrapper, ITypeData, TextAreaState, TextAreaStrategy, createTextAreaState} from 'vs/editor/common/controller/textAreaState';
import {Position} from 'vs/editor/common/core/position';
import {Range} from 'vs/editor/common/core/range';
import {EndOfLinePreference, IEditorPosition, IEditorRange} from 'vs/editor/common/editorCommon';

enum ReadFromTextArea {
	Type,
	Paste
}

export interface IBrowser {
	isIPad: boolean;
	isChrome: boolean;
	isIE11orEarlier: boolean;
	isFirefox: boolean;
	enableEmptySelectionClipboard: boolean;
}

export interface IPasteData {
	text: string;
	pasteOnNewLine: boolean;
}

export interface ICompositionStartData {
	showAtLineNumber: number;
	showAtColumn: number;
}

export class TextAreaHandler extends Disposable {

	private _onKeyDown = this._register(new Emitter<IKeyboardEventWrapper>());
	public onKeyDown: Event<IKeyboardEventWrapper> = this._onKeyDown.event;

	private _onKeyUp = this._register(new Emitter<IKeyboardEventWrapper>());
	public onKeyUp: Event<IKeyboardEventWrapper> = this._onKeyUp.event;

	private _onCut = this._register(new Emitter<void>());
	public onCut: Event<void> = this._onCut.event;

	private _onPaste = this._register(new Emitter<IPasteData>());
	public onPaste: Event<IPasteData> = this._onPaste.event;

	private _onType = this._register(new Emitter<ITypeData>());
	public onType: Event<ITypeData> = this._onType.event;

	private _onCompositionStart = this._register(new Emitter<ICompositionStartData>());
	public onCompositionStart: Event<ICompositionStartData> = this._onCompositionStart.event;

	private _onCompositionEnd = this._register(new Emitter<void>());
	public onCompositionEnd: Event<void> = this._onCompositionEnd.event;

	private Browser:IBrowser;
	private textArea:ITextAreaWrapper;
	private model:ISimpleModel;
	private flushAnyAccumulatedEvents:()=>void;

	private selection:IEditorRange;
	private selections:IEditorRange[];
	private hasFocus:boolean;

	private asyncTriggerCut: RunOnceScheduler;

	private lastCompositionEndTime:number;
	private cursorPosition:IEditorPosition;

	private textAreaState:TextAreaState;
	private textareaIsShownAtCursor: boolean;

	private lastCopiedValue: string;
	private lastCopiedValueIsFromEmptySelection: boolean;

	private _nextCommand: ReadFromTextArea;

	constructor(Browser:IBrowser, strategy:TextAreaStrategy, textArea:ITextAreaWrapper, model:ISimpleModel, flushAnyAccumulatedEvents:()=>void) {
		super();
		this.Browser = Browser;
		this.textArea = textArea;
		this.model = model;
		this.flushAnyAccumulatedEvents = flushAnyAccumulatedEvents;
		this.selection = new Range(1, 1, 1, 1);
		this.selections = [new Range(1, 1, 1, 1)];
		this.cursorPosition = new Position(1, 1);
		this._nextCommand = ReadFromTextArea.Type;

		this.asyncTriggerCut = new RunOnceScheduler(() => this._onCut.fire(), 0);

		this.lastCopiedValue = null;
		this.lastCopiedValueIsFromEmptySelection = false;
		this.textAreaState = createTextAreaState(strategy);

		this.hasFocus = false;

		this.lastCompositionEndTime = 0;

		this._register(this.textArea.onKeyDown((e) => this._onKeyDownHandler(e)));
		this._register(this.textArea.onKeyUp((e) => this._onKeyUp.fire(e)));
		this._register(this.textArea.onKeyPress((e) => this._onKeyPressHandler(e)));

		this.textareaIsShownAtCursor = false;

		this._register(this.textArea.onCompositionStart(() => {
			let timeSinceLastCompositionEnd = (new Date().getTime()) - this.lastCompositionEndTime;
			if (this.textareaIsShownAtCursor) {
				return;
			}

			this.textareaIsShownAtCursor = true;

			// In IE we cannot set .value when handling 'compositionstart' because the entire composition will get canceled.
			let shouldEmptyTextArea = (timeSinceLastCompositionEnd >= 100);
			if (shouldEmptyTextArea) {
				if (!this.Browser.isIE11orEarlier) {
					this.setTextAreaState('compositionstart', this.textAreaState.toEmpty());
				}
			}

			let showAtLineNumber: number;
			let showAtColumn: number;

			// In IE we cannot set .value when handling 'compositionstart' because the entire composition will get canceled.
			if (this.Browser.isIE11orEarlier) {
				// Ensure selection start is in viewport
				showAtLineNumber = this.selection.startLineNumber;
				showAtColumn = (this.selection.startColumn - this.textAreaState.getSelectionStart());
			} else {
				showAtLineNumber = this.cursorPosition.lineNumber;
				showAtColumn = this.cursorPosition.column;
			}

			this._onCompositionStart.fire({
				showAtLineNumber: showAtLineNumber,
				showAtColumn: showAtColumn
			});
		}));

		let readFromTextArea = () => {
			this.textAreaState = this.textAreaState.fromTextArea(this.textArea);
			let typeInput = this.textAreaState.deduceInput();
			// console.log('==> DEDUCED INPUT: ' + JSON.stringify(typeInput));
			if (this._nextCommand === ReadFromTextArea.Type) {
				if (typeInput.text !== '') {
					this._onType.fire(typeInput);
				}
			} else {
				this.executePaste(typeInput.text);
				this._nextCommand = ReadFromTextArea.Type;
			}
		};

		this._register(this.textArea.onCompositionEnd(() => {
			// console.log('onCompositionEnd: ' + this.textArea.getValue());
			// readFromTextArea();

			this.lastCompositionEndTime = (new Date()).getTime();
			if (!this.textareaIsShownAtCursor) {
				return;
			}
			this.textareaIsShownAtCursor = false;

			this._onCompositionEnd.fire();
		}));

		this._register(this.textArea.onInput(() => {
			// console.log('onInput: ' + this.textArea.getValue());
			if (this.textareaIsShownAtCursor) {
				// console.log('::ignoring input event because the textarea is shown at cursor: ' + this.textArea.getValue());
				return;
			}

			readFromTextArea();
		}));

		// --- Clipboard operations

		this._register(this.textArea.onCut((e) => {
			// Ensure we have the latest selection => ask all pending events to be sent
			this.flushAnyAccumulatedEvents();
			this._ensureClipboardGetsEditorSelection(e);
			this.asyncTriggerCut.schedule();
		}));

		this._register(this.textArea.onCopy((e) => {
			// Ensure we have the latest selection => ask all pending events to be sent
			this.flushAnyAccumulatedEvents();
			this._ensureClipboardGetsEditorSelection(e);
		}));

		this._register(this.textArea.onPaste((e) => {
			if (e.canUseTextData()) {
				this.executePaste(e.getTextData());
			} else {
				if (this.textArea.getSelectionStart() !== this.textArea.getSelectionEnd()) {
					// Clean up the textarea, to get a clean paste
					this.setTextAreaState('paste', this.textAreaState.toEmpty());
				}
				this._nextCommand = ReadFromTextArea.Paste;
			}
		}));

		this._writePlaceholderAndSelectTextArea('ctor');
	}

	public dispose(): void {
		this.asyncTriggerCut.dispose();
		super.dispose();
	}

	// --- begin event handlers

	public setStrategy(strategy:TextAreaStrategy): void {
		this.textAreaState = this.textAreaState.toStrategy(strategy);
	}

	public setHasFocus(isFocused:boolean): void {
		if (this.hasFocus === isFocused) {
			// no change
			return;
		}
		this.hasFocus = isFocused;
		if (this.hasFocus) {
			this._writePlaceholderAndSelectTextArea('focusgain');
		}
	}

	public setCursorSelections(primary: IEditorRange, secondary: IEditorRange[]): void {
		this.selection = primary;
		this.selections = [primary].concat(secondary);
		this._writePlaceholderAndSelectTextArea('selection changed');
	}

	public setCursorPosition(primary: IEditorPosition): void {
		this.cursorPosition = primary;
	}

	// --- end event handlers

	private setTextAreaState(reason:string, textAreaState:TextAreaState): void {
		if (!this.hasFocus) {
			textAreaState = textAreaState.resetSelection();
		}

		textAreaState.applyToTextArea(reason, this.textArea, this.hasFocus);
		this.textAreaState = textAreaState;
	}

	private _onKeyDownHandler(e:IKeyboardEventWrapper): void {
		if (e.equals(CommonKeybindings.ESCAPE)) {
			// Prevent default always for `Esc`, otherwise it will generate a keypress
			// See http://msdn.microsoft.com/en-us/library/ie/ms536939(v=vs.85).aspx
			e.preventDefault();
		}
		this._onKeyDown.fire(e);
	}

	private _onKeyPressHandler(e:IKeyboardEventWrapper): void {
		if (!this.hasFocus) {
			// Sometimes, when doing Alt-Tab, in FF, a 'keypress' is sent before a 'focus'
			return;
		}
	}

	// ------------- Operations that are always executed asynchronously

	private executePaste(txt:string): void {
		if(txt === '') {
			return;
		}

		let pasteOnNewLine = false;
		if (this.Browser.enableEmptySelectionClipboard) {
			pasteOnNewLine = (txt === this.lastCopiedValue && this.lastCopiedValueIsFromEmptySelection);
		}
		this._onPaste.fire({
			text: txt,
			pasteOnNewLine: pasteOnNewLine
		});
	}

	public writePlaceholderAndSelectTextAreaSync(): void {
		this._writePlaceholderAndSelectTextArea('focusTextArea');
	}

	private _writePlaceholderAndSelectTextArea(reason:string): void {
		if (!this.textareaIsShownAtCursor) {
			// Do not write to the textarea if it is visible.
			if (this.Browser.isIPad) {
				// Do not place anything in the textarea for the iPad
				this.setTextAreaState(reason, this.textAreaState.toEmpty());
			} else {
				this.setTextAreaState(reason, this.textAreaState.fromEditorSelection(this.model, this.selection));
			}
		}
	}

	// ------------- Clipboard operations

	private _ensureClipboardGetsEditorSelection(e:IClipboardEvent): void {
		let whatToCopy = this._getPlainTextToCopy();
		if (e.canUseTextData()) {
			e.setTextData(whatToCopy);
		} else {
			this.setTextAreaState('copy or cut', this.textAreaState.fromText(whatToCopy));
		}

		if (this.Browser.enableEmptySelectionClipboard) {
			if (this.Browser.isFirefox) {
				// When writing "LINE\r\n" to the clipboard and then pasting,
				// Firefox pastes "LINE\n", so let's work around this quirk
				this.lastCopiedValue = whatToCopy.replace(/\r\n/g, '\n');
			} else {
				this.lastCopiedValue = whatToCopy;
			}

			let selections = this.selections;
			this.lastCopiedValueIsFromEmptySelection = (selections.length === 1 && selections[0].isEmpty());
		}
	}

	private _getPlainTextToCopy(): string {
		let newLineCharacter = this.model.getEOL();
		let selections = this.selections;

		if (selections.length === 1) {
			let range:IEditorRange = selections[0];
			if (range.isEmpty()) {
				if (this.Browser.enableEmptySelectionClipboard) {
					let modelLineNumber = this.model.convertViewPositionToModelPosition(range.startLineNumber, 1).lineNumber;
					return this.model.getModelLineContent(modelLineNumber) + newLineCharacter;
				} else {
					return '';
				}
			}

			return this.model.getValueInRange(range, EndOfLinePreference.TextDefined);
		} else {
			selections = selections.slice(0).sort(Range.compareRangesUsingStarts);
			let result: string[] = [];
			for (let i = 0; i < selections.length; i++) {
				result.push(this.model.getValueInRange(selections[i], EndOfLinePreference.TextDefined));
			}

			return result.join(newLineCharacter);
		}
	}
}
