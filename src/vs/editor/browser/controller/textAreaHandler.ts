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
import { ISimpleModel, ITypeData, TextAreaState, ITextAreaWrapper, IENarratorStrategy, NVDAPagedStrategy } from 'vs/editor/browser/controller/textAreaState';
import { Range } from 'vs/editor/common/core/range';
import * as browser from 'vs/base/browser/browser';
import * as dom from 'vs/base/browser/dom';
import { IKeyboardEvent } from "vs/base/browser/keyboardEvent";
import { FastDomNode } from "vs/base/browser/fastDomNode";

export interface ICompositionEvent {
	data: string;
}

export const CopyOptions = {
	forceCopyWithSyntaxHighlighting: false
};

export const enum TextAreaStrategy {
	IENarrator,
	NVDA
}

const enum ReadFromTextArea {
	Type,
	Paste
}

export interface IPasteData {
	text: string;
}

// See https://github.com/Microsoft/monaco-editor/issues/320
const isChromev55_v56 = (
	(navigator.userAgent.indexOf('Chrome/55.') >= 0 || navigator.userAgent.indexOf('Chrome/56.') >= 0)
	/* Edge likes to impersonate Chrome sometimes */
	&& navigator.userAgent.indexOf('Edge/') === -1
);

export interface ITextAreaHandlerHost {
	getPlainTextToCopy(): string;
	getHTMLToCopy(): string;
}

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

	private _onCompositionStart = this._register(new Emitter<void>());
	public onCompositionStart: Event<void> = this._onCompositionStart.event;

	private _onCompositionUpdate = this._register(new Emitter<ICompositionEvent>());
	public onCompositionUpdate: Event<ICompositionEvent> = this._onCompositionUpdate.event;

	private _onCompositionEnd = this._register(new Emitter<void>());
	public onCompositionEnd: Event<void> = this._onCompositionEnd.event;

	// ---

	private readonly _host: ITextAreaHandlerHost;
	private readonly _textArea: TextAreaWrapper;
	private readonly _model: ISimpleModel;

	private _textAreaStrategy: TextAreaStrategy;
	private _selection: Range;
	private _hasFocus: boolean;

	private readonly _asyncTriggerCut: RunOnceScheduler;

	private _textAreaState: TextAreaState;
	private _isDoingComposition: boolean;

	private _nextCommand: ReadFromTextArea;

	constructor(host: ITextAreaHandlerHost, strategy: TextAreaStrategy, textArea: FastDomNode<HTMLTextAreaElement>, model: ISimpleModel) {
		super();
		this._host = host;
		this._textArea = this._register(new TextAreaWrapper(textArea));
		this._model = model;

		this._textAreaStrategy = strategy;
		this._selection = new Range(1, 1, 1, 1);
		this._hasFocus = false;

		this._asyncTriggerCut = this._register(new RunOnceScheduler(() => this._onCut.fire(), 0));

		this._textAreaState = TextAreaState.EMPTY;
		this._isDoingComposition = false;

		this._nextCommand = ReadFromTextArea.Type;

		this._register(dom.addStandardDisposableListener(textArea.domNode, 'keydown', (e: IKeyboardEvent) => {
			if (this._isDoingComposition && e.equals(KeyCode.KEY_IN_COMPOSITION)) {
				// Stop propagation for keyDown events if the IME is processing key input
				e.stopPropagation();
			}

			if (e.equals(KeyCode.Escape)) {
				// Prevent default always for `Esc`, otherwise it will generate a keypress
				// See https://msdn.microsoft.com/en-us/library/ie/ms536939(v=vs.85).aspx
				e.preventDefault();
			}
			this._onKeyDown.fire(e);
		}));

		this._register(dom.addStandardDisposableListener(textArea.domNode, 'keyup', (e: IKeyboardEvent) => {
			this._onKeyUp.fire(e);
		}));

		this._register(dom.addDisposableListener(textArea.domNode, 'compositionstart', (e: CompositionEvent) => {
			if (this._isDoingComposition) {
				return;
			}
			this._isDoingComposition = true;

			// In IE we cannot set .value when handling 'compositionstart' because the entire composition will get canceled.
			if (!browser.isEdgeOrIE) {
				this._setAndWriteTextAreaState('compositionstart', TextAreaState.EMPTY);
			}

			this._onCompositionStart.fire();
		}));

		/**
		 * Deduce the typed input from a text area's value and the last observed state.
		 */
		const deduceInputFromTextAreaValue = (isDoingComposition: boolean): [TextAreaState, ITypeData] => {
			const oldState = this._textAreaState;
			const newState = this._textAreaState.readFromTextArea(this._textArea);
			return [newState, TextAreaState.deduceInput(oldState, newState, isDoingComposition)];
		};

		/**
		 * Deduce the composition input from a string.
		 */
		const deduceComposition = (text: string): [TextAreaState, ITypeData] => {
			const oldState = this._textAreaState;
			const newState = TextAreaState.selectedText(text);
			const typeInput: ITypeData = {
				text: newState.value,
				replaceCharCnt: oldState.selectionEnd - oldState.selectionStart
			};
			return [newState, typeInput];
		};

		this._register(dom.addDisposableListener(textArea.domNode, 'compositionupdate', (e: CompositionEvent) => {
			if (isChromev55_v56) {
				// See https://github.com/Microsoft/monaco-editor/issues/320
				// where compositionupdate .data is broken in Chrome v55 and v56
				// See https://bugs.chromium.org/p/chromium/issues/detail?id=677050#c9
				// The textArea doesn't get the composition update yet, the value of textarea is still obsolete
				// so we can't correct e at this moment.
				return;
			}

			if (browser.isEdgeOrIE && e.locale === 'ja') {
				// https://github.com/Microsoft/monaco-editor/issues/339
				// Multi-part Japanese compositions reset cursor in Edge/IE, Chinese and Korean IME don't have this issue.
				// The reason that we can't use this path for all CJK IME is IE and Edge behave differently when handling Korean IME,
				// which breaks this path of code.
				const [newState, typeInput] = deduceInputFromTextAreaValue(true);
				this._textAreaState = newState;
				this._onType.fire(typeInput);
				this._onCompositionUpdate.fire(e);
				return;
			}

			const [newState, typeInput] = deduceComposition(e.data);
			this._textAreaState = newState;
			this._onType.fire(typeInput);
			this._onCompositionUpdate.fire(e);
		}));

		this._register(dom.addDisposableListener(textArea.domNode, 'compositionend', (e: CompositionEvent) => {
			// console.log('onCompositionEnd: ' + e.data);
			if (browser.isEdgeOrIE && e.locale === 'ja') {
				// https://github.com/Microsoft/monaco-editor/issues/339
				const [newState, typeInput] = deduceInputFromTextAreaValue(true);
				this._textAreaState = newState;
				this._onType.fire(typeInput);
			}
			else {
				const [newState, typeInput] = deduceComposition(e.data);
				this._textAreaState = newState;
				this._onType.fire(typeInput);
			}

			// Due to isEdgeOrIE (where the textarea was not cleared initially) and isChrome (the textarea is not updated correctly when composition ends)
			// we cannot assume the text at the end consists only of the composited text
			if (browser.isEdgeOrIE || browser.isChrome) {
				this._textAreaState = this._textAreaState.readFromTextArea(this._textArea);
			}

			if (!this._isDoingComposition) {
				return;
			}
			this._isDoingComposition = false;

			this._onCompositionEnd.fire();
		}));

		this._register(dom.addDisposableListener(textArea.domNode, 'input', () => {
			// console.log('onInput: ' + this.textArea.getValue());
			if (this._isDoingComposition) {
				// See https://github.com/Microsoft/monaco-editor/issues/320
				if (isChromev55_v56) {
					const [newState, typeInput] = deduceComposition(this._textArea.getValue());
					this._textAreaState = newState;

					this._onType.fire(typeInput);
					let e: ICompositionEvent = {
						data: typeInput.text
					};
					this._onCompositionUpdate.fire(e);
				}
				// console.log('::ignoring input event because the textarea is shown at cursor: ' + this.textArea.getValue());
				return;
			}

			const [newState, typeInput] = deduceInputFromTextAreaValue(false);
			if (typeInput.replaceCharCnt === 0 && typeInput.text.length === 1 && strings.isHighSurrogate(typeInput.text.charCodeAt(0))) {
				// Ignore invalid input but keep it around for next time
				return;
			}

			this._textAreaState = newState;
			// console.log('==> DEDUCED INPUT: ' + JSON.stringify(typeInput));
			if (this._nextCommand === ReadFromTextArea.Type) {
				if (typeInput.text !== '') {
					this._onType.fire(typeInput);
				}
			} else {
				if (typeInput.text !== '') {
					this._onPaste.fire({
						text: typeInput.text
					});
				}
				this._nextCommand = ReadFromTextArea.Type;
			}
		}));

		// --- Clipboard operations

		this._register(dom.addDisposableListener(textArea.domNode, 'cut', (e: ClipboardEvent) => {
			this._ensureClipboardGetsEditorSelection(e);
			this._asyncTriggerCut.schedule();
		}));

		this._register(dom.addDisposableListener(textArea.domNode, 'copy', (e: ClipboardEvent) => {
			this._ensureClipboardGetsEditorSelection(e);
		}));

		this._register(dom.addDisposableListener(textArea.domNode, 'paste', (e: ClipboardEvent) => {
			if (ClipboardEventUtils.canUseTextData(e)) {
				const pastePlainText = ClipboardEventUtils.getTextData(e);
				if (pastePlainText !== '') {
					this._onPaste.fire({
						text: pastePlainText
					});
				}
			} else {
				if (this._textArea.getSelectionStart() !== this._textArea.getSelectionEnd()) {
					// Clean up the textarea, to get a clean paste
					this._setAndWriteTextAreaState('paste', TextAreaState.EMPTY);
				}
				this._nextCommand = ReadFromTextArea.Paste;
			}
		}));

		this._writeScreenReaderContent('ctor');
	}

	public dispose(): void {
		super.dispose();
	}

	public setStrategy(strategy: TextAreaStrategy): void {
		if (this._textAreaStrategy === strategy) {
			// no change
			return;
		}
		this._textAreaStrategy = strategy;
		this._writeScreenReaderContent('strategy changed');
	}

	public focusTextArea(): void {
		// Setting this._hasFocus and writing the screen reader content
		// will result in a set selection range in the textarea
		this._hasFocus = true;
		this._writeScreenReaderContent('focusTextArea');
	}

	public setHasFocus(isFocused: boolean): void {
		if (this._hasFocus === isFocused) {
			// no change
			return;
		}
		this._hasFocus = isFocused;
		if (this._hasFocus) {
			if (browser.isEdge) {
				// Edge has a bug where setting the selection range while the focus event
				// is dispatching doesn't work. To reproduce, "tab into" the editor.
				this._setAndWriteTextAreaState('focusgain', TextAreaState.EMPTY);
			} else {
				this._writeScreenReaderContent('focusgain');
			}
		}
	}

	public setCursorSelections(primary: Range, secondary: Range[]): void {
		this._selection = primary;
		this._writeScreenReaderContent('selection changed');
	}

	private _setAndWriteTextAreaState(reason: string, textAreaState: TextAreaState): void {
		if (!this._hasFocus) {
			textAreaState = textAreaState.collapseSelection();
		}

		textAreaState.writeToTextArea(reason, this._textArea, this._hasFocus);
		this._textAreaState = textAreaState;
	}

	private _writeScreenReaderContent(reason: string): void {
		if (this._isDoingComposition) {
			// Do not write to the text area when doing composition
			return;
		}

		if (browser.isIPad) {
			// Do not place anything in the textarea for the iPad
			this._setAndWriteTextAreaState(reason, TextAreaState.EMPTY);

		} else if (this._textAreaStrategy === TextAreaStrategy.IENarrator) {

			const newState = IENarratorStrategy.fromEditorSelection(this._textAreaState, this._model, this._selection);
			this._setAndWriteTextAreaState(reason, newState);

		} else {

			const newState = NVDAPagedStrategy.fromEditorSelection(this._textAreaState, this._model, this._selection);
			this._setAndWriteTextAreaState(reason, newState);

		}
	}

	private _ensureClipboardGetsEditorSelection(e: ClipboardEvent): void {
		const copyPlainText = this._host.getPlainTextToCopy();
		if (!ClipboardEventUtils.canUseTextData(e)) {
			// Looks like an old browser. The strategy is to place the text
			// we'd like to be copied to the clipboard in the textarea and select it.
			this._setAndWriteTextAreaState('copy or cut', TextAreaState.selectedText(copyPlainText));
			return;
		}

		let copyHTML: string = null;
		if (!browser.isEdgeOrIE && (copyPlainText.length < 65536 || CopyOptions.forceCopyWithSyntaxHighlighting)) {
			copyHTML = this._host.getHTMLToCopy();
		}
		ClipboardEventUtils.setTextData(e, copyPlainText, copyHTML);
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
		const textArea = this._actual.domNode;
		if (textArea.value === value) {
			// No change
			return;
		}
		// console.log('reason: ' + reason + ', current value: ' + textArea.value + ' => new value: ' + value);
		textArea.value = value;
	}

	public getSelectionStart(): number {
		return this._actual.domNode.selectionStart;
	}

	public getSelectionEnd(): number {
		return this._actual.domNode.selectionEnd;
	}

	public setSelectionRange(reason: string, selectionStart: number, selectionEnd: number): void {
		// console.log('reason: ' + reason + ', setSelectionRange: ' + selectionStart + ' -> ' + selectionEnd);
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
}
