/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {IEditorRange, IEditorPosition, EndOfLinePreference} from 'vs/editor/common/editorCommon';
import {RunOnceScheduler} from 'vs/base/common/async';
import {Disposable} from 'vs/base/common/lifecycle';
import {Range} from 'vs/editor/common/core/range';
import {Position} from 'vs/editor/common/core/position';
import {CommonKeybindings} from 'vs/base/common/keyCodes';
import {IKeyboardEventWrapper, ITextAreaWrapper, IClipboardEvent, ISimpleModel, TextAreaState, IENarratorTextAreaState, NVDATextAreaState} from 'vs/editor/common/controller/textAreaState';
import Event, {Emitter} from 'vs/base/common/event';

enum ReadFromTextArea {
	Type,
	Paste
}

export interface IPlatform {
	isMacintosh: boolean;
	isWindows: boolean;
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

export interface ITypeData {
	text: string;
	replacePreviousCharacter: boolean;
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

	private Platform:IPlatform;
	private Browser:IBrowser;
	private textArea:ITextAreaWrapper;
	private model:ISimpleModel;

	private selection:IEditorRange;
	private selections:IEditorRange[];
	private hasFocus:boolean;

	private asyncReadFromTextArea: RunOnceScheduler;
	private asyncTriggerCut: RunOnceScheduler;

	private lastKeyPressTime:number;
	private lastCompositionEndTime:number;
	private lastValueWrittenToTheTextArea:string;
	private cursorPosition:IEditorPosition;

	private textAreaState:TextAreaState;
	private textareaIsShownAtCursor: boolean;

	private lastCopiedValue: string;
	private lastCopiedValueIsFromEmptySelection: boolean;

	constructor(Platform:IPlatform, Browser:IBrowser, textArea:ITextAreaWrapper, model:ISimpleModel) {
		super();
		this.Platform = Platform;
		this.Browser = Browser;
		this.textArea = textArea;
		this.model = model;
		this.selection = new Range(1, 1, 1, 1);
		this.selections = [new Range(1, 1, 1, 1)];
		this.cursorPosition = new Position(1, 1);

		this.asyncReadFromTextArea = new RunOnceScheduler(null, 0);
		this.asyncTriggerCut = new RunOnceScheduler(() => this._onCut.fire(), 0);

		this.lastCopiedValue = null;
		this.lastCopiedValueIsFromEmptySelection = false;
		this.textAreaState = IENarratorTextAreaState.EMPTY;
		// this.textAreaState = NVDATextAreaState.EMPTY;

		this.hasFocus = false;

		this.lastKeyPressTime = 0;
		this.lastCompositionEndTime = 0;
		this.lastValueWrittenToTheTextArea = '';

		this._register(this.textArea.onKeyDown((e) => this._onKeyDownHandler(e)));
		this._register(this.textArea.onKeyUp((e) => this._onKeyUp.fire(e)));
		this._register(this.textArea.onKeyPress((e) => this._onKeyPressHandler()));

		this.textareaIsShownAtCursor = false;

		this._register(this.textArea.onCompositionStart(() => {
			let timeSinceLastCompositionEnd = (new Date().getTime()) - this.lastCompositionEndTime;
			this.asyncReadFromTextArea.cancel();
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

		this._register(this.textArea.onCompositionEnd(() => {
			this.lastCompositionEndTime = (new Date()).getTime();
			this._scheduleReadFromTextArea(ReadFromTextArea.Type);
			if (!this.textareaIsShownAtCursor) {
				return;
			}
			this.textareaIsShownAtCursor = false;

			this._onCompositionEnd.fire();
		}));

		// on the iPad the text area is not fast enough to get the content of the keypress,
		// so we leverage the input event instead
		if (this.Browser.isIPad) {
			this._register(this.textArea.onInput(() => {
				let myTime = (new Date()).getTime();
				// A keypress will trigger an input event (very quickly)
				let keyPressDeltaTime = myTime - this.lastKeyPressTime;
				if (keyPressDeltaTime <= 500) {
					this._scheduleReadFromTextArea(ReadFromTextArea.Type);
					this.lastKeyPressTime = 0;
				}
			}));
		}

		// on the mac the character viewer input generates an input event (no keypress)
		// on windows, the Chinese IME, when set to insert wide punctuation generates an input event (no keypress)
		this._register(this.textArea.onInput(() => {
			// Ignore input event if we are in composition mode
			if (!this.textareaIsShownAtCursor) {
				this._scheduleReadFromTextArea(ReadFromTextArea.Type);
			}
		}));

		if (this.Platform.isMacintosh) {

			// keypress, cut, paste & composition end also trigger an input event
			// the popover input method on macs triggers only an input event
			// in this case we need to filter and only match the popoer input method

			let justHadACutOrPaste = false;
			this._register(this.textArea.onPaste((e) => {
				justHadACutOrPaste = true;
			}));
			this._register(this.textArea.onCut((e) => {
				justHadACutOrPaste = true;
			}));

			this._register(this.textArea.onInput(() => {

				// We are fishing for the input event that comes in the mac popover input method case

				// A paste will trigger an input event, but the event might happen very late
				// A cut will trigger an input event, but the event might happen very late
				if (justHadACutOrPaste) {
					justHadACutOrPaste = false;
					return;
				}

				let myTime = (new Date()).getTime();

				// A keypress will trigger an input event (very quickly)
				let keyPressDeltaTime = myTime - this.lastKeyPressTime;
				if (keyPressDeltaTime <= 500) {
					return;
				}

				// A composition end will trigger an input event (very quickly)
				let compositionEndDeltaTime = myTime - this.lastCompositionEndTime;
				if (compositionEndDeltaTime <= 500) {
					return;
				}

				// Ignore input if we are in the middle of a composition
				if (this.textareaIsShownAtCursor) {
					return;
				}

				// In Chrome, only the first character gets replaced, while in Safari the entire line gets replaced
				if (!this.Browser.isChrome) {
					// TODO: Also check this on Safari & FF before removing this
					return;
				}

				this.textAreaState = this.textAreaState.fromTextArea(this.textArea);
				let replacedChar = this.textAreaState.extractMacReplacedText();

				if (!replacedChar) {
					return;
				}

				this._onType.fire({
					text: replacedChar,
					replacePreviousCharacter: true
				});
			}));
		}

		// --- Clipboard operations

		this._register(this.textArea.onCut((e) => {
			this._ensureClipboardGetsEditorSelection(e);
			this.asyncTriggerCut.schedule();
		}));

		this._register(this.textArea.onCopy((e) => {
			this._ensureClipboardGetsEditorSelection(e);
		}));

		this._register(this.textArea.onPaste((e) => {
			if (e.canUseTextData()) {
				this.executePaste(e.getTextData());
			} else {
				if (this.textArea.selectionStart !== this.textArea.selectionEnd) {
					// Clean up the textarea, to get a clean paste
					this.setTextAreaState('paste', this.textAreaState.toEmpty());
				}
				this._scheduleReadFromTextArea(ReadFromTextArea.Paste);
			}
		}));

		this._writePlaceholderAndSelectTextArea('ctor');
	}

	public dispose(): void {
		this.asyncReadFromTextArea.dispose();
		this.asyncTriggerCut.dispose();
		super.dispose();
	}

	// --- begin event handlers

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

		this.lastValueWrittenToTheTextArea = textAreaState.getValue();
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
		// Work around for issue spotted in electron on the mac
		// TODO@alex: check if this issue exists after updating electron
		// Steps:
		//  * enter a line at an offset
		//  * go down to a line with [
		//  * go up, go left, go right
		//  => press ctrl+h => a keypress is generated even though the keydown is prevent defaulted
		// Another case would be if focus goes outside the app on keydown (spotted under windows)
		// Steps:
		//  * press Ctrl+K
		//  * press R
		//  => focus moves out while keydown is not finished
		setTimeout(() => {
			// cancel reading if previous keydown was canceled, but a keypress/input were still generated
			if (e.isDefaultPrevented()) {
				this.asyncReadFromTextArea.cancel();
			}
		}, 0);
	}

	private _onKeyPressHandler(): void {
		if (!this.hasFocus) {
			// Sometimes, when doing Alt-Tab, in FF, a 'keypress' is sent before a 'focus'
			return;
		}

		this.lastKeyPressTime = (new Date()).getTime();

		// on the iPad the text area is not fast enough to get the content of the keypress,
		// so we leverage the input event instead
		if (!this.Browser.isIPad) {
			this._scheduleReadFromTextArea(ReadFromTextArea.Type);
		}
	}

	// ------------- Operations that are always executed asynchronously

	private _scheduleReadFromTextArea(command:ReadFromTextArea): void {
		this.asyncReadFromTextArea.setRunner(() => this._readFromTextArea(command));
		this.asyncReadFromTextArea.schedule();
	}

	/**
	 * Read text from textArea and trigger `command` on the editor
	 */
	private _readFromTextArea(command:ReadFromTextArea): void {
		this.textAreaState = this.textAreaState.fromTextArea(this.textArea);
		let txt = this.textAreaState.extractNewText();

		if (command === ReadFromTextArea.Type) {
			if (txt !== '') {
				// console.log("deduced input:", txt);
				this._onType.fire({
					text: txt,
					replacePreviousCharacter: false
				});
			}
		} else {
			this.executePaste(txt);
		}
	}

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
		let newLineCharacter = (this.Platform.isWindows ? '\r\n' : '\n');
		let eolPref = (this.Platform.isWindows ? EndOfLinePreference.CRLF : EndOfLinePreference.LF);
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

			return this.model.getValueInRange(range, eolPref);
		} else {
			selections = selections.slice(0).sort(Range.compareRangesUsingStarts);
			let result: string[] = [];
			for (let i = 0; i < selections.length; i++) {
				result.push(this.model.getValueInRange(selections[i], eolPref));
			}

			return result.join(newLineCharacter);
		}
	}
}
