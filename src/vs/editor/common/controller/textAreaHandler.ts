/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {VisibleRange, IConfiguration, IEditorRange, IEditorPosition, EndOfLinePreference} from 'vs/editor/common/editorCommon';
import {RunOnceScheduler} from 'vs/base/common/async';
import {Disposable} from 'vs/base/common/lifecycle';
import {commonPrefixLength, commonSuffixLength} from 'vs/base/common/strings';
import {Range} from 'vs/editor/common/core/range';
import {Position} from 'vs/editor/common/core/position';
import {CommonKeybindings} from 'vs/base/common/keyCodes';
import {IKeyboardEventWrapper, ITextAreaWrapper, IClipboardEvent, ITextAreaStyle, ISimpleModel, TextAreaState} from 'vs/editor/common/controller/textAreaState';
import Event, {Emitter} from 'vs/base/common/event';

enum ReadFromTextArea {
	Type,
	Paste
}

export interface ITextEditor {
	getModel(): ISimpleModel;
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
	private editor:ITextEditor;
	private configuration:IConfiguration;

	private selection:IEditorRange;
	private selections:IEditorRange[];
	private hasFocus:boolean;

	private asyncReadFromTextArea: RunOnceScheduler;
	private asyncSetSelectionToTextArea: RunOnceScheduler;
	private asyncTriggerCut: RunOnceScheduler;

	// keypress, paste & composition end also trigger an input event
	// the popover input method on macs triggers only an input event
	// in this case the expectInputTime would be too much in the past
	private justHadAPaste:boolean;
	private justHadACut:boolean;
	private lastKeyPressTime:number;
	private lastCompositionEndTime:number;
	private lastValueWrittenToTheTextArea:string;
	private cursorPosition:IEditorPosition;

	private previousSetTextAreaState:TextAreaState;
	private textareaIsShownAtCursor: boolean;

	private lastCopiedValue: string;
	private lastCopiedValueIsFromEmptySelection: boolean;

	constructor(Platform:IPlatform, Browser:IBrowser, textArea:ITextAreaWrapper, editor:ITextEditor, configuration:IConfiguration) {
		super();
		this.Platform = Platform;
		this.Browser = Browser;
		this.textArea = textArea;
		this.editor = editor;
		this.configuration = configuration;
		this.selection = new Range(1, 1, 1, 1);
		this.selections = [new Range(1, 1, 1, 1)];
		this.cursorPosition = new Position(1, 1);

		this.asyncReadFromTextArea = new RunOnceScheduler(null, 0);
		this.asyncSetSelectionToTextArea = new RunOnceScheduler(() => this._writePlaceholderAndSelectTextArea(), 0);
		this.asyncTriggerCut = new RunOnceScheduler(() => this._triggerCut(), 0);

		this.lastCopiedValue = null;
		this.lastCopiedValueIsFromEmptySelection = false;
		this.previousSetTextAreaState = null;

		this.hasFocus = false;

		this.justHadAPaste = false;
		this.justHadACut = false;
		this.lastKeyPressTime = 0;
		this.lastCompositionEndTime = 0;
		this.lastValueWrittenToTheTextArea = '';

		this._register(this.textArea.onKeyDown((e) => this._onKeyDownHandler(e)));
		this._register(this.textArea.onKeyUp((e) => this._onKeyUpHandler(e)));
		this._register(this.textArea.onKeyPress((e) => this._onKeyPressHandler()));

		this.textareaIsShownAtCursor = false;

		this._register(this.textArea.onCompositionStart(() => {
			let timeSinceLastCompositionEnd = (new Date().getTime()) - this.lastCompositionEndTime;
			if (!this.textareaIsShownAtCursor) {
				this.textareaIsShownAtCursor = true;

				// In IE we cannot set .value when handling 'compositionstart' because the entire composition will get canceled.
				let shouldEmptyTextArea = (timeSinceLastCompositionEnd >= 100);
				if (shouldEmptyTextArea) {
					if (!this.Browser.isIE11orEarlier) {
						this.setTextAreaState(new TextAreaState('', 0, 0, false, 0), false);
					}
				}

				this.showTextAreaAtCursor();
			}
			this.asyncReadFromTextArea.cancel();
		}));

		this._register(this.textArea.onCompositionEnd(() => {
			if (this.textareaIsShownAtCursor) {
				this.textareaIsShownAtCursor = false;
				this.hideTextArea();
			}
			this.lastCompositionEndTime = (new Date()).getTime();
			this._scheduleReadFromTextArea(ReadFromTextArea.Type);
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

			this._register(this.textArea.onInput(() => {

				// We are fishing for the input event that comes in the mac popover input method case


				// A paste will trigger an input event, but the event might happen very late
				if (this.justHadAPaste) {
					this.justHadAPaste = false;
					return;
				}

				// A cut will trigger an input event, but the event might happen very late
				if (this.justHadACut) {
					this.justHadACut = false;
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

				// Ignore if the textarea has selection
				if (this.textArea.selectionStart !== this.textArea.selectionEnd) {
					return;
				}

				// In Chrome, only the first character gets replaced, while in Safari the entire line gets replaced
				let typedText:string;
				let textAreaValue = this.textArea.value;

				if (!this.Browser.isChrome) {
					// TODO: Also check this on Safari & FF before removing this
					return;
				}

				if (this.lastValueWrittenToTheTextArea.length !== textAreaValue.length) {
					return;
				}

				let prefixLength = commonPrefixLength(this.lastValueWrittenToTheTextArea, textAreaValue);
				let suffixLength = commonSuffixLength(this.lastValueWrittenToTheTextArea, textAreaValue);

				if (prefixLength + suffixLength + 1 !== textAreaValue.length) {
					return;
				}

				typedText = textAreaValue.charAt(prefixLength);

				this.executeReplacePreviousChar(typedText);

				this.previousSetTextAreaState = TextAreaState.fromTextArea(this.textArea, 0);
				this.asyncSetSelectionToTextArea.schedule();
			}));
		}

		this._register(this.textArea.onCut((e) => this._onCutHandler(e)));
		this._register(this.textArea.onCopy((e) => this._onCopyHandler(e)));
		this._register(this.textArea.onPaste((e) => this._onPasteHandler(e)));

		this._writePlaceholderAndSelectTextArea();

	}

	public dispose(): void {
		this.asyncReadFromTextArea.dispose();
		this.asyncSetSelectionToTextArea.dispose();
		this.asyncTriggerCut.dispose();
		super.dispose();
	}

	private showTextAreaAtCursor(): void {

		let showAtLineNumber: number;
		let showAtColumn: number;

		// In IE we cannot set .value when handling 'compositionstart' because the entire composition will get canceled.
		if (this.Browser.isIE11orEarlier) {
			// Ensure selection start is in viewport
			showAtLineNumber = this.selection.startLineNumber;
			showAtColumn = (this.selection.startColumn - this.previousSetTextAreaState.getSelectionStart());
		} else {
			showAtLineNumber = this.cursorPosition.lineNumber;
			showAtColumn = this.cursorPosition.column;
		}

		this._onCompositionStart.fire({
			showAtLineNumber: showAtLineNumber,
			showAtColumn: showAtColumn
		});
	}

	private hideTextArea(): void {
		this._onCompositionEnd.fire();
	}

	// --- begin event handlers

	public setHasFocus(isFocused:boolean): void {
		this.hasFocus = isFocused;
		if (this.hasFocus) {
			this.asyncSetSelectionToTextArea.schedule();
		}
	}

	public setCursorSelections(primary: IEditorRange, secondary: IEditorRange[]): void {
		this.selection = primary;
		this.selections = [primary].concat(secondary);
		this.asyncSetSelectionToTextArea.schedule();
	}

	public setCursorPosition(primary: IEditorPosition): void {
		this.cursorPosition = primary;
	}

	// --- end event handlers

	private setTextAreaState(textAreaState:TextAreaState, select:boolean): void {
		// IE doesn't like calling select on a hidden textarea and the textarea is hidden during the tests
		let shouldSetSelection = select && this.hasFocus;

		if (!shouldSetSelection) {
			textAreaState.resetSelection();
		}

		this.lastValueWrittenToTheTextArea = textAreaState.getValue();
		textAreaState.applyToTextArea(this.textArea, shouldSetSelection);

		this.previousSetTextAreaState = textAreaState;
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
				// this._scheduleReadFromTextArea
				this.asyncReadFromTextArea.cancel();
				this.asyncSetSelectionToTextArea.schedule();
			}
		}, 0);
	}

	private _onKeyUpHandler(e:IKeyboardEventWrapper): void {
		this._onKeyUp.fire(e);
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
		this.asyncSetSelectionToTextArea.cancel();
		this.asyncReadFromTextArea.setRunner(() => this._readFromTextArea(command));
		this.asyncReadFromTextArea.schedule();
	}

	/**
	 * Read text from textArea and trigger `command` on the editor
	 */
	private _readFromTextArea(command:ReadFromTextArea): void {
		let previousSelectionToken = this.previousSetTextAreaState ? this.previousSetTextAreaState.getSelectionToken() : 0;
		let observedState = TextAreaState.fromTextArea(this.textArea, previousSelectionToken);
		let txt = observedState.extractNewText(this.previousSetTextAreaState);

		if (txt !== '') {
			if (command === ReadFromTextArea.Type) {
//				console.log("deduced input:", txt);
				this.executeType(txt);
			} else {
				this.executePaste(txt);
			}
		}

		this.previousSetTextAreaState = observedState;
		this.asyncSetSelectionToTextArea.schedule();
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

	private executeType(txt:string): void {
		if(txt === '') {
			return;
		}

		this._onType.fire({
			text: txt,
			replacePreviousCharacter: false
		});
	}

	private executeReplacePreviousChar(txt: string): void {
		this._onType.fire({
			text: txt,
			replacePreviousCharacter: true
		});
	}

	private _writePlaceholderAndSelectTextArea(): void {
		if (!this.textareaIsShownAtCursor) {
			// Do not write to the textarea if it is visible.
			let previousSelectionToken = this.previousSetTextAreaState ? this.previousSetTextAreaState.getSelectionToken() : 0;
			let newState: TextAreaState;
			if (this.Browser.isIPad) {
				// Do not place anything in the textarea for the iPad
				newState = new TextAreaState('', 0, 0, false, 0);
			} else {
				newState = TextAreaState.fromEditorSelectionAndPreviousState(this.editor.getModel(), this.selection, previousSelectionToken);
			}
			this.setTextAreaState(newState, true);
		}
	}

	// ------------- Clipboard operations

	private _onPasteHandler(e:IClipboardEvent): void {
		if (e.canUseTextData()) {
			this.executePaste(e.getTextData());
		} else {
			if (this.textArea.selectionStart !== this.textArea.selectionEnd) {
				// Clean up the textarea, to get a clean paste
				this.setTextAreaState(new TextAreaState('', 0, 0, false, 0), false);
			}
			this._scheduleReadFromTextArea(ReadFromTextArea.Paste);
		}
		this.justHadAPaste = true;
	}

	private _onCopyHandler(e:IClipboardEvent): void {
		this._ensureClipboardGetsEditorSelection(e);
	}

	private _triggerCut(): void {
		this._onCut.fire();
	}

	private _onCutHandler(e:IClipboardEvent): void {
		this._ensureClipboardGetsEditorSelection(e);
		this.asyncTriggerCut.schedule();
		this.justHadACut = true;
	}

	private _ensureClipboardGetsEditorSelection(e:IClipboardEvent): void {
		let whatToCopy = this._getPlainTextToCopy();
		if (e.canUseTextData()) {
			e.setTextData(whatToCopy);
		} else {
			this.setTextAreaState(new TextAreaState(whatToCopy, 0, whatToCopy.length, false, 0), true);
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
		let model = this.editor.getModel();

		if (selections.length === 1) {
			let range:IEditorRange = selections[0];
			if (range.isEmpty()) {
				if (this.Browser.enableEmptySelectionClipboard) {
					let modelLineNumber = model.convertViewPositionToModelPosition(range.startLineNumber, 1).lineNumber;
					return model.getModelLineContent(modelLineNumber) + newLineCharacter;
				} else {
					return '';
				}
			}

			return model.getValueInRange(range, eolPref);
		} else {
			selections = selections.slice(0).sort(Range.compareRangesUsingStarts);
			let result: string[] = [];
			for (let i = 0; i < selections.length; i++) {
				result.push(model.getValueInRange(selections[i], eolPref));
			}

			return result.join(newLineCharacter);
		}
	}
}
