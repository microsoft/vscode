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
import { ISimpleModel, ITypeData, TextAreaState, TextAreaStrategy, createTextAreaState, ITextAreaWrapper } from 'vs/editor/browser/controller/textAreaState';
import { Range } from 'vs/editor/common/core/range';
import * as browser from 'vs/base/browser/browser';
import * as dom from 'vs/base/browser/dom';
import { IKeyboardEvent } from "vs/base/browser/keyboardEvent";
import { FastDomNode } from "vs/base/browser/fastDomNode";

export interface ICompositionEvent {
	data: string;
	locale: string;
}

export const CopyOptions = {
	forceCopyWithSyntaxHighlighting: false
};

const enum ReadFromTextArea {
	Type,
	Paste
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
const isChromev55_v56 = (
	(navigator.userAgent.indexOf('Chrome/55.') >= 0 || navigator.userAgent.indexOf('Chrome/56.') >= 0)
	/* Edge likes to impersonate Chrome sometimes */
	&& navigator.userAgent.indexOf('Edge/') === -1
);

export class TextAreaHandler extends Disposable {

	private _onKeyDown = this._register(new Emitter<IKeyboardEvent>());
	public onKeyDown: Event<IKeyboardEvent> = this._onKeyDown.event;

	private _onKeyUp = this._register(new Emitter<IKeyboardEvent>());
	public onKeyUp: Event<IKeyboardEvent> = this._onKeyUp.event;

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

	private textArea: TextAreaWrapper;
	private model: ISimpleModel;

	private selection: Range;
	private selections: Range[];
	private hasFocus: boolean;

	private asyncTriggerCut: RunOnceScheduler;

	private textAreaState: TextAreaState;
	private textareaIsShownAtCursor: boolean;

	private lastCopiedValue: string;
	private lastCopiedValueIsFromEmptySelection: boolean;

	private _nextCommand: ReadFromTextArea;

	constructor(strategy: TextAreaStrategy, textArea: FastDomNode<HTMLTextAreaElement>, model: ISimpleModel) {
		super();
		this.textArea = this._register(new TextAreaWrapper(textArea));
		this.model = model;
		this.selection = new Range(1, 1, 1, 1);
		this.selections = [new Range(1, 1, 1, 1)];
		this._nextCommand = ReadFromTextArea.Type;

		this.asyncTriggerCut = this._register(new RunOnceScheduler(() => this._onCut.fire(), 0));

		this.lastCopiedValue = null;
		this.lastCopiedValueIsFromEmptySelection = false;
		this.textAreaState = createTextAreaState(strategy);

		this.hasFocus = false;

		this._register(dom.addStandardDisposableListener(textArea.domNode, 'keydown', (e: IKeyboardEvent) => this._onKeyDownHandler(e)));
		this._register(dom.addStandardDisposableListener(textArea.domNode, 'keyup', (e: IKeyboardEvent) => this._onKeyUp.fire(e)));
		this._register(dom.addStandardDisposableListener(textArea.domNode, 'keypress', (e: IKeyboardEvent) => this._onKeyPressHandler(e)));

		this.textareaIsShownAtCursor = false;
		let compositionLocale = null;

		this._register(dom.addDisposableListener(textArea.domNode, 'compositionstart', (e: CompositionEvent) => {

			if (this.textareaIsShownAtCursor) {
				return;
			}

			this.textareaIsShownAtCursor = true;

			// In IE we cannot set .value when handling 'compositionstart' because the entire composition will get canceled.
			if (!browser.isEdgeOrIE) {
				this.setTextAreaState('compositionstart', this.textAreaState.toEmpty(), false);
			}

			this._onCompositionStart.fire({
				showAtLineNumber: this.selection.startLineNumber,
				showAtColumn: this.selection.startColumn
			});
		}));

		this._register(dom.addDisposableListener(textArea.domNode, 'compositionupdate', (e: CompositionEvent) => {
			if (isChromev55_v56) {
				// See https://github.com/Microsoft/monaco-editor/issues/320
				// where compositionupdate .data is broken in Chrome v55 and v56
				// See https://bugs.chromium.org/p/chromium/issues/detail?id=677050#c9
				compositionLocale = e.locale;
				// The textArea doesn't get the composition update yet, the value of textarea is still obsolete
				// so we can't correct e at this moment.
				return;
			}

			if (browser.isEdgeOrIE && e.locale === 'ja') {
				// https://github.com/Microsoft/monaco-editor/issues/339
				// Multi-part Japanese compositions reset cursor in Edge/IE, Chinese and Korean IME don't have this issue.
				// The reason that we can't use this path for all CJK IME is IE and Edge behave differently when handling Korean IME,
				// which breaks this path of code.
				this.textAreaState = this.textAreaState.fromTextArea(this.textArea);
				let typeInput = this.textAreaState.deduceInput();
				this._onType.fire(typeInput);
				this._onCompositionUpdate.fire(e);
				return;
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

		this._register(dom.addDisposableListener(textArea.domNode, 'compositionend', (e: CompositionEvent) => {
			// console.log('onCompositionEnd: ' + e.data);
			if (browser.isEdgeOrIE && e.locale === 'ja') {
				// https://github.com/Microsoft/monaco-editor/issues/339
				this.textAreaState = this.textAreaState.fromTextArea(this.textArea);
				let typeInput = this.textAreaState.deduceInput();
				this._onType.fire(typeInput);
			}
			else {
				this.textAreaState = this.textAreaState.fromText(e.data);
				let typeInput = this.textAreaState.updateComposition();
				this._onType.fire(typeInput);
			}

			// Due to isEdgeOrIE (where the textarea was not cleared initially) and isChrome (the textarea is not updated correctly when composition ends)
			// we cannot assume the text at the end consists only of the composited text
			if (browser.isEdgeOrIE || browser.isChrome) {
				this.textAreaState = this.textAreaState.fromTextArea(this.textArea);
			}

			if (!this.textareaIsShownAtCursor) {
				return;
			}
			this.textareaIsShownAtCursor = false;

			this._onCompositionEnd.fire();
		}));

		this._register(dom.addDisposableListener(textArea.domNode, 'input', () => {
			// console.log('onInput: ' + this.textArea.getValue());
			if (this.textareaIsShownAtCursor) {
				// See https://github.com/Microsoft/monaco-editor/issues/320
				if (isChromev55_v56) {
					let text = this.textArea.getValue();
					this.textAreaState = this.textAreaState.fromText(text);
					let typeInput = this.textAreaState.updateComposition();
					this._onType.fire(typeInput);
					let e = {
						locale: compositionLocale,
						data: text
					};
					this._onCompositionUpdate.fire(e);
				}
				// console.log('::ignoring input event because the textarea is shown at cursor: ' + this.textArea.getValue());
				return;
			}

			readFromTextArea();
		}));

		// --- Clipboard operations

		this._register(dom.addDisposableListener(textArea.domNode, 'cut', (e: ClipboardEvent) => {
			this._ensureClipboardGetsEditorSelection(e);
			this.asyncTriggerCut.schedule();
		}));

		this._register(dom.addDisposableListener(textArea.domNode, 'copy', (e: ClipboardEvent) => {
			this._ensureClipboardGetsEditorSelection(e);
		}));

		this._register(dom.addDisposableListener(textArea.domNode, 'paste', (e: ClipboardEvent) => {
			if (ClipboardEventUtils.canUseTextData(e)) {
				this.executePaste(ClipboardEventUtils.getTextData(e));
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

	private _onKeyDownHandler(e: IKeyboardEvent): void {
		if (this.textareaIsShownAtCursor && e.equals(KeyCode.KEY_IN_COMPOSITION)) {
			// Stop propagation for keyDown events if the IME is processing key input
			e.stopPropagation();
		}

		if (e.equals(KeyCode.Escape)) {
			// Prevent default always for `Esc`, otherwise it will generate a keypress
			// See https://msdn.microsoft.com/en-us/library/ie/ms536939(v=vs.85).aspx
			e.preventDefault();
		}
		this._onKeyDown.fire(e);
	}

	private _onKeyPressHandler(e: IKeyboardEvent): void {
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
		if (browser.enableEmptySelectionClipboard) {
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
			if (browser.isIPad) {
				// Do not place anything in the textarea for the iPad
				this.setTextAreaState(reason, this.textAreaState.toEmpty(), forceFocus);
			} else {
				this.setTextAreaState(reason, this.textAreaState.fromEditorSelection(this.model, this.selection), forceFocus);
			}
		}
	}

	// ------------- Clipboard operations

	private _ensureClipboardGetsEditorSelection(e: ClipboardEvent): void {
		let whatToCopy = this.model.getPlainTextToCopy(this.selections, browser.enableEmptySelectionClipboard);
		if (ClipboardEventUtils.canUseTextData(e)) {
			let whatHTMLToCopy: string = null;
			if (!browser.isEdgeOrIE && (whatToCopy.length < 65536 || CopyOptions.forceCopyWithSyntaxHighlighting)) {
				whatHTMLToCopy = this.model.getHTMLToCopy(this.selections, browser.enableEmptySelectionClipboard);
			}
			ClipboardEventUtils.setTextData(e, whatToCopy, whatHTMLToCopy);
		} else {
			this.setTextAreaState('copy or cut', this.textAreaState.fromText(whatToCopy), false);
		}

		if (browser.enableEmptySelectionClipboard) {
			if (browser.isFirefox) {
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

class ClipboardEventUtils {

	public static canUseTextData(e: ClipboardEvent): boolean {
		if (e.clipboardData) {
			return true;
		}
		if ((<any>window).clipboardData) {
			return true;
		}
		return false;
	}

	public static getTextData(e: ClipboardEvent): string {
		if (e.clipboardData) {
			e.preventDefault();
			return e.clipboardData.getData('text/plain');
		}

		if ((<any>window).clipboardData) {
			e.preventDefault();
			return (<any>window).clipboardData.getData('Text');
		}

		throw new Error('ClipboardEventUtils.getTextData: Cannot use text data!');
	}

	public static setTextData(e: ClipboardEvent, text: string, richText: string): void {
		if (e.clipboardData) {
			e.clipboardData.setData('text/plain', text);
			if (richText !== null) {
				e.clipboardData.setData('text/html', richText);
			}
			e.preventDefault();
			return;
		}

		if ((<any>window).clipboardData) {
			(<any>window).clipboardData.setData('Text', text);
			e.preventDefault();
			return;
		}

		throw new Error('ClipboardEventUtils.setTextData: Cannot use text data!');
	}
}

class TextAreaWrapper extends Disposable implements ITextAreaWrapper {

	private readonly _actual: FastDomNode<HTMLTextAreaElement>;

	constructor(_textArea: FastDomNode<HTMLTextAreaElement>) {
		super();
		this._actual = _textArea;
	}

	public getValue(): string {
		// console.log('current value: ' + this._textArea.value);
		return this._actual.domNode.value;
	}

	public setValue(reason: string, value: string): void {
		// console.log('reason: ' + reason + ', current value: ' + this._textArea.value + ' => new value: ' + value);
		this._actual.domNode.value = value;
	}

	public getSelectionStart(): number {
		return this._actual.domNode.selectionStart;
	}

	public getSelectionEnd(): number {
		return this._actual.domNode.selectionEnd;
	}

	public setSelectionRange(selectionStart: number, selectionEnd: number): void {
		const textArea = this._actual.domNode;
		if (document.activeElement === textArea) {
			textArea.setSelectionRange(selectionStart, selectionEnd);
		} else {
			// If the focus is outside the textarea, browsers will try really hard to reveal the textarea.
			// Here, we try to undo the browser's desperate reveal.
			try {
				const scrollState = dom.saveParentsScrollTop(textArea);
				textArea.focus();
				textArea.setSelectionRange(selectionStart, selectionEnd);
				dom.restoreParentsScrollTop(textArea, scrollState);
			} catch (e) {
				// Sometimes IE throws when setting selection (e.g. textarea is off-DOM)
			}
		}
	}

	public isInOverwriteMode(): boolean {
		// In IE, pressing Insert will bring the typing into overwrite mode
		if (browser.isIE && document.queryCommandValue('OverWrite')) {
			return true;
		}
		return false;
	}
}
