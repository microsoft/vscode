/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { RunOnceScheduler } from 'vs/base/common/async';
import * as strings from 'vs/base/common/strings';
import Event, { Emitter } from 'vs/base/common/event';
import { KeyCode } from 'vs/base/common/keyCodes';
import { Disposable } from 'vs/base/common/lifecycle';
import { IClipboardEvent, ICompositionEvent, IKeyboardEventWrapper, ISimpleModel, ITextAreaWrapper, ITypeData, TextAreaState, TextAreaStrategy, createTextAreaState } from 'vs/editor/common/controller/textAreaState';
import { Range } from 'vs/editor/common/core/range';

export const CopyOptions = {
	forceCopyWithSyntaxHighlighting: false
};

const enum ReadFromTextArea {
	Type,
	Paste
}

export interface IBrowser {
	isIPad: boolean;
	isChrome: boolean;
	isEdgeOrIE: boolean;
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

// See https://github.com/Microsoft/monaco-editor/issues/320
const isChromev55 = (
	navigator.userAgent.indexOf('Chrome/55.') >= 0
	/* Edge likes to impersonate Chrome sometimes */
	&& navigator.userAgent.indexOf('Edge/') === -1
);

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

	private _onCompositionUpdate = this._register(new Emitter<ICompositionEvent>());
	public onCompositionUpdate: Event<ICompositionEvent> = this._onCompositionUpdate.event;

	private _onCompositionEnd = this._register(new Emitter<ICompositionEvent>());
	public onCompositionEnd: Event<ICompositionEvent> = this._onCompositionEnd.event;

	private Browser: IBrowser;
	private textArea: ITextAreaWrapper;
	private model: ISimpleModel;
	private flushAnyAccumulatedEvents: () => void;

	private selection: Range;
	private selections: Range[];
	private hasFocus: boolean;

	private asyncTriggerCut: RunOnceScheduler;

	private lastCompositionEndTime: number;

	private textAreaState: TextAreaState;
	private textareaIsShownAtCursor: boolean;

	private lastCopiedValue: string;
	private lastCopiedValueIsFromEmptySelection: boolean;

	private _nextCommand: ReadFromTextArea;

	constructor(Browser: IBrowser, strategy: TextAreaStrategy, textArea: ITextAreaWrapper, model: ISimpleModel, flushAnyAccumulatedEvents: () => void) {
		super();
		this.Browser = Browser;
		this.textArea = textArea;
		this.model = model;
		this.flushAnyAccumulatedEvents = flushAnyAccumulatedEvents;
		this.selection = new Range(1, 1, 1, 1);
		this.selections = [new Range(1, 1, 1, 1)];
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

		this._register(this.textArea.onCompositionStart((e) => {

			if (this.textareaIsShownAtCursor) {
				return;
			}

			this.textareaIsShownAtCursor = true;

			// In IE we cannot set .value when handling 'compositionstart' because the entire composition will get canceled.
			if (!this.Browser.isEdgeOrIE) {
				this.setTextAreaState('compositionstart', this.textAreaState.toEmpty(), false);
			}

			this._onCompositionStart.fire({
				showAtLineNumber: this.selection.startLineNumber,
				showAtColumn: this.selection.startColumn
			});
		}));

		this._register(this.textArea.onCompositionUpdate((e) => {
			if (isChromev55) {
				// See https://github.com/Microsoft/monaco-editor/issues/320
				// where compositionupdate .data is broken in Chrome v55
				// See https://bugs.chromium.org/p/chromium/issues/detail?id=677050#c9
				e = {
					locale: e.locale,
					data: this.textArea.getValue()
				};
			}
			this.textAreaState = this.textAreaState.fromText(e.data);
			let typeInput = this.textAreaState.updateComposition();
			this._onType.fire(typeInput);
			this._onCompositionUpdate.fire(e);
		}));

		let readFromTextArea = () => {
			let tempTextAreaState = this.textAreaState.fromTextArea(this.textArea);
			let typeInput = tempTextAreaState.deduceInput();
			if (typeInput.replaceCharCnt === 0 && typeInput.text.length === 1 && strings.isHighSurrogate(typeInput.text.charCodeAt(0))) {
				// Ignore invalid input but keep it around for next time
				return;
			}

			this.textAreaState = tempTextAreaState;
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

		this._register(this.textArea.onCompositionEnd((e) => {
			// console.log('onCompositionEnd: ' + e.data);
			this.textAreaState = this.textAreaState.fromText(e.data);
			let typeInput = this.textAreaState.updateComposition();
			this._onType.fire(typeInput);

			// Due to isEdgeOrIE (where the textarea was not cleared initially) and isChrome (the textarea is not updated correctly when composition ends)
			// we cannot assume the text at the end consists only of the composited text
			if (Browser.isEdgeOrIE || Browser.isChrome) {
				this.textAreaState = this.textAreaState.fromTextArea(this.textArea);
			}

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
					this.setTextAreaState('paste', this.textAreaState.toEmpty(), false);
				}
				this._nextCommand = ReadFromTextArea.Paste;
			}
		}));

		this._writePlaceholderAndSelectTextArea('ctor', false);
	}

	public dispose(): void {
		this.asyncTriggerCut.dispose();
		super.dispose();
	}

	// --- begin event handlers

	public setStrategy(strategy: TextAreaStrategy): void {
		this.textAreaState = this.textAreaState.toStrategy(strategy);
	}

	public setHasFocus(isFocused: boolean): void {
		if (this.hasFocus === isFocused) {
			// no change
			return;
		}
		this.hasFocus = isFocused;
		if (this.hasFocus) {
			this._writePlaceholderAndSelectTextArea('focusgain', false);
		}
	}

	public setCursorSelections(primary: Range, secondary: Range[]): void {
		this.selection = primary;
		this.selections = [primary].concat(secondary);
		this._writePlaceholderAndSelectTextArea('selection changed', false);
	}

	// --- end event handlers

	private setTextAreaState(reason: string, textAreaState: TextAreaState, forceFocus: boolean): void {
		if (!this.hasFocus) {
			textAreaState = textAreaState.resetSelection();
		}

		textAreaState.applyToTextArea(reason, this.textArea, this.hasFocus || forceFocus);
		this.textAreaState = textAreaState;
	}

	private _onKeyDownHandler(e: IKeyboardEventWrapper): void {
		if (e.equals(KeyCode.Escape)) {
			// Prevent default always for `Esc`, otherwise it will generate a keypress
			// See https://msdn.microsoft.com/en-us/library/ie/ms536939(v=vs.85).aspx
			e.preventDefault();
		}
		this._onKeyDown.fire(e);
	}

	private _onKeyPressHandler(e: IKeyboardEventWrapper): void {
		if (!this.hasFocus) {
			// Sometimes, when doing Alt-Tab, in FF, a 'keypress' is sent before a 'focus'
			return;
		}
	}

	// ------------- Operations that are always executed asynchronously

	private executePaste(txt: string): void {
		if (txt === '') {
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

	public focusTextArea(): void {
		this._writePlaceholderAndSelectTextArea('focusTextArea', true);
	}

	private _writePlaceholderAndSelectTextArea(reason: string, forceFocus: boolean): void {
		if (!this.textareaIsShownAtCursor) {
			// Do not write to the textarea if it is visible.
			if (this.Browser.isIPad) {
				// Do not place anything in the textarea for the iPad
				this.setTextAreaState(reason, this.textAreaState.toEmpty(), forceFocus);
			} else {
				this.setTextAreaState(reason, this.textAreaState.fromEditorSelection(this.model, this.selection), forceFocus);
			}
		}
	}

	// ------------- Clipboard operations

	private _ensureClipboardGetsEditorSelection(e: IClipboardEvent): void {
		let whatToCopy = this.model.getPlainTextToCopy(this.selections, this.Browser.enableEmptySelectionClipboard);
		if (e.canUseTextData()) {
			let whatHTMLToCopy: string = null;
			if (!this.Browser.isEdgeOrIE && (whatToCopy.length < 65536 || CopyOptions.forceCopyWithSyntaxHighlighting)) {
				whatHTMLToCopy = this.model.getHTMLToCopy(this.selections, this.Browser.enableEmptySelectionClipboard);
			}
			e.setTextData(whatToCopy, whatHTMLToCopy);
		} else {
			this.setTextAreaState('copy or cut', this.textAreaState.fromText(whatToCopy), false);
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
}