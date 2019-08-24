/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as browser from 'vs/base/browser/browser';
import * as dom from 'vs/base/browser/dom';
import { FastDomNode } from 'vs/base/browser/fastDomNode';
import { IKeyboardEvent } from 'vs/base/browser/keyboardEvent';
import { RunOnceScheduler } from 'vs/base/common/async';
import { Emitter, Event } from 'vs/base/common/event';
import { KeyCode } from 'vs/base/common/keyCodes';
import { Disposable, IDisposable } from 'vs/base/common/lifecycle';
import * as platform from 'vs/base/common/platform';
import * as strings from 'vs/base/common/strings';
import { ITextAreaWrapper, ITypeData, TextAreaState } from 'vs/editor/browser/controller/textAreaState';
import { Position } from 'vs/editor/common/core/position';
import { Selection } from 'vs/editor/common/core/selection';

export interface ICompositionData {
	data: string;
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
}

export interface ITextAreaInputHost {
	getPlainTextToCopy(): string;
	getHTMLToCopy(): string | null;
	getScreenReaderContent(currentState: TextAreaState): TextAreaState;
	deduceModelPosition(viewAnchorPosition: Position, deltaOffset: number, lineFeedCnt: number): Position;
}

const enum TextAreaInputEventType {
	none,
	compositionstart,
	compositionupdate,
	compositionend,
	input,
	cut,
	copy,
	paste,
	focus,
	blur
}

/**
 * Writes screen reader content to the textarea and is able to analyze its input events to generate:
 *  - onCut
 *  - onPaste
 *  - onType
 *
 * Composition events are generated for presentation purposes (composition input is reflected in onType).
 */
export class TextAreaInput extends Disposable {

	private _onFocus = this._register(new Emitter<void>());
	public readonly onFocus: Event<void> = this._onFocus.event;

	private _onBlur = this._register(new Emitter<void>());
	public readonly onBlur: Event<void> = this._onBlur.event;

	private _onKeyDown = this._register(new Emitter<IKeyboardEvent>());
	public readonly onKeyDown: Event<IKeyboardEvent> = this._onKeyDown.event;

	private _onKeyUp = this._register(new Emitter<IKeyboardEvent>());
	public readonly onKeyUp: Event<IKeyboardEvent> = this._onKeyUp.event;

	private _onCut = this._register(new Emitter<void>());
	public readonly onCut: Event<void> = this._onCut.event;

	private _onPaste = this._register(new Emitter<IPasteData>());
	public readonly onPaste: Event<IPasteData> = this._onPaste.event;

	private _onType = this._register(new Emitter<ITypeData>());
	public readonly onType: Event<ITypeData> = this._onType.event;

	private _onCompositionStart = this._register(new Emitter<void>());
	public readonly onCompositionStart: Event<void> = this._onCompositionStart.event;

	private _onCompositionUpdate = this._register(new Emitter<ICompositionData>());
	public readonly onCompositionUpdate: Event<ICompositionData> = this._onCompositionUpdate.event;

	private _onCompositionEnd = this._register(new Emitter<void>());
	public readonly onCompositionEnd: Event<void> = this._onCompositionEnd.event;

	private _onSelectionChangeRequest = this._register(new Emitter<Selection>());
	public readonly onSelectionChangeRequest: Event<Selection> = this._onSelectionChangeRequest.event;

	// ---

	private readonly _host: ITextAreaInputHost;
	private readonly _textArea: TextAreaWrapper;
	private _lastTextAreaEvent: TextAreaInputEventType;
	private readonly _asyncTriggerCut: RunOnceScheduler;

	private _textAreaState: TextAreaState;
	private _selectionChangeListener: IDisposable | null;

	private _hasFocus: boolean;
	private _isDoingComposition: boolean;
	private _nextCommand: ReadFromTextArea;

	constructor(host: ITextAreaInputHost, textArea: FastDomNode<HTMLTextAreaElement>) {
		super();
		this._host = host;
		this._textArea = this._register(new TextAreaWrapper(textArea));
		this._lastTextAreaEvent = TextAreaInputEventType.none;
		this._asyncTriggerCut = this._register(new RunOnceScheduler(() => this._onCut.fire(), 0));

		this._textAreaState = TextAreaState.EMPTY;
		this._selectionChangeListener = null;
		this.writeScreenReaderContent('ctor');

		this._hasFocus = false;
		this._isDoingComposition = false;
		this._nextCommand = ReadFromTextArea.Type;

		this._register(dom.addStandardDisposableListener(textArea.domNode, 'keydown', (e: IKeyboardEvent) => {
			if (this._isDoingComposition &&
				(e.keyCode === KeyCode.KEY_IN_COMPOSITION || e.keyCode === KeyCode.Backspace)) {
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
			this._lastTextAreaEvent = TextAreaInputEventType.compositionstart;

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
		const deduceInputFromTextAreaValue = (couldBeEmojiInput: boolean, couldBeTypingAtOffset0: boolean): [TextAreaState, ITypeData] => {
			const oldState = this._textAreaState;
			const newState = TextAreaState.readFromTextArea(this._textArea);
			return [newState, TextAreaState.deduceInput(oldState, newState, couldBeEmojiInput, couldBeTypingAtOffset0)];
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

		const compositionDataInValid = (locale: string): boolean => {
			// https://github.com/Microsoft/monaco-editor/issues/339
			// Multi-part Japanese compositions reset cursor in Edge/IE, Chinese and Korean IME don't have this issue.
			// The reason that we can't use this path for all CJK IME is IE and Edge behave differently when handling Korean IME,
			// which breaks this path of code.
			if (browser.isEdgeOrIE && locale === 'ja') {
				return true;
			}

			// https://github.com/Microsoft/monaco-editor/issues/545
			// On IE11, we can't trust composition data when typing Chinese as IE11 doesn't emit correct
			// events when users type numbers in IME.
			// Chinese: zh-Hans-CN, zh-Hans-SG, zh-Hant-TW, zh-Hant-HK
			if (browser.isIE && locale.indexOf('zh-Han') === 0) {
				return true;
			}

			return false;
		};

		this._register(dom.addDisposableListener(textArea.domNode, 'compositionupdate', (e: CompositionEvent) => {
			this._lastTextAreaEvent = TextAreaInputEventType.compositionupdate;

			if (compositionDataInValid(e.locale)) {
				const [newState, typeInput] = deduceInputFromTextAreaValue(/*couldBeEmojiInput*/false, /*couldBeTypingAtOffset0*/false);
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
			this._lastTextAreaEvent = TextAreaInputEventType.compositionend;

			if (compositionDataInValid(e.locale)) {
				// https://github.com/Microsoft/monaco-editor/issues/339
				const [newState, typeInput] = deduceInputFromTextAreaValue(/*couldBeEmojiInput*/false, /*couldBeTypingAtOffset0*/false);
				this._textAreaState = newState;
				this._onType.fire(typeInput);
			} else {
				const [newState, typeInput] = deduceComposition(e.data);
				this._textAreaState = newState;
				this._onType.fire(typeInput);
			}

			// Due to isEdgeOrIE (where the textarea was not cleared initially) and isChrome (the textarea is not updated correctly when composition ends)
			// we cannot assume the text at the end consists only of the composited text
			if (browser.isEdgeOrIE || browser.isChrome) {
				this._textAreaState = TextAreaState.readFromTextArea(this._textArea);
			}

			if (!this._isDoingComposition) {
				return;
			}
			this._isDoingComposition = false;

			this._onCompositionEnd.fire();
		}));

		this._register(dom.addDisposableListener(textArea.domNode, 'input', () => {
			// We want to find out if this is the first `input` after a `focus`.
			const previousEventWasFocus = (this._lastTextAreaEvent === TextAreaInputEventType.focus);
			this._lastTextAreaEvent = TextAreaInputEventType.input;

			// Pretend here we touched the text area, as the `input` event will most likely
			// result in a `selectionchange` event which we want to ignore
			this._textArea.setIgnoreSelectionChangeTime('received input event');

			if (this._isDoingComposition) {
				return;
			}

			const [newState, typeInput] = deduceInputFromTextAreaValue(/*couldBeEmojiInput*/platform.isMacintosh, /*couldBeTypingAtOffset0*/previousEventWasFocus && platform.isMacintosh);
			if (typeInput.replaceCharCnt === 0 && typeInput.text.length === 1 && strings.isHighSurrogate(typeInput.text.charCodeAt(0))) {
				// Ignore invalid input but keep it around for next time
				return;
			}

			this._textAreaState = newState;
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
			this._lastTextAreaEvent = TextAreaInputEventType.cut;

			// Pretend here we touched the text area, as the `cut` event will most likely
			// result in a `selectionchange` event which we want to ignore
			this._textArea.setIgnoreSelectionChangeTime('received cut event');

			this._ensureClipboardGetsEditorSelection(e);
			this._asyncTriggerCut.schedule();
		}));

		this._register(dom.addDisposableListener(textArea.domNode, 'copy', (e: ClipboardEvent) => {
			this._lastTextAreaEvent = TextAreaInputEventType.copy;

			this._ensureClipboardGetsEditorSelection(e);
		}));

		this._register(dom.addDisposableListener(textArea.domNode, 'paste', (e: ClipboardEvent) => {
			this._lastTextAreaEvent = TextAreaInputEventType.paste;

			// Pretend here we touched the text area, as the `paste` event will most likely
			// result in a `selectionchange` event which we want to ignore
			this._textArea.setIgnoreSelectionChangeTime('received paste event');

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

		this._register(dom.addDisposableListener(textArea.domNode, 'focus', () => {
			this._lastTextAreaEvent = TextAreaInputEventType.focus;
			this._setHasFocus(true);
		}));
		this._register(dom.addDisposableListener(textArea.domNode, 'blur', () => {
			this._lastTextAreaEvent = TextAreaInputEventType.blur;
			this._setHasFocus(false);
		}));
	}

	private _installSelectionChangeListener(): IDisposable {
		// See https://github.com/Microsoft/vscode/issues/27216
		// When using a Braille display, it is possible for users to reposition the
		// system caret. This is reflected in Chrome as a `selectionchange` event.
		//
		// The `selectionchange` event appears to be emitted under numerous other circumstances,
		// so it is quite a challenge to distinguish a `selectionchange` coming in from a user
		// using a Braille display from all the other cases.
		//
		// The problems with the `selectionchange` event are:
		//  * the event is emitted when the textarea is focused programmatically -- textarea.focus()
		//  * the event is emitted when the selection is changed in the textarea programmatically -- textarea.setSelectionRange(...)
		//  * the event is emitted when the value of the textarea is changed programmatically -- textarea.value = '...'
		//  * the event is emitted when tabbing into the textarea
		//  * the event is emitted asynchronously (sometimes with a delay as high as a few tens of ms)
		//  * the event sometimes comes in bursts for a single logical textarea operation

		// `selectionchange` events often come multiple times for a single logical change
		// so throttle multiple `selectionchange` events that burst in a short period of time.
		let previousSelectionChangeEventTime = 0;
		return dom.addDisposableListener(document, 'selectionchange', (e) => {
			if (!this._hasFocus) {
				return;
			}
			if (this._isDoingComposition) {
				return;
			}
			if (!browser.isChrome || !platform.isWindows) {
				// Support only for Chrome on Windows until testing happens on other browsers + OS configurations
				return;
			}

			const now = Date.now();

			const delta1 = now - previousSelectionChangeEventTime;
			previousSelectionChangeEventTime = now;
			if (delta1 < 5) {
				// received another `selectionchange` event within 5ms of the previous `selectionchange` event
				// => ignore it
				return;
			}

			const delta2 = now - this._textArea.getIgnoreSelectionChangeTime();
			this._textArea.resetSelectionChangeTime();
			if (delta2 < 100) {
				// received a `selectionchange` event within 100ms since we touched the textarea
				// => ignore it, since we caused it
				return;
			}

			if (!this._textAreaState.selectionStartPosition || !this._textAreaState.selectionEndPosition) {
				// Cannot correlate a position in the textarea with a position in the editor...
				return;
			}

			const newValue = this._textArea.getValue();
			if (this._textAreaState.value !== newValue) {
				// Cannot correlate a position in the textarea with a position in the editor...
				return;
			}

			const newSelectionStart = this._textArea.getSelectionStart();
			const newSelectionEnd = this._textArea.getSelectionEnd();
			if (this._textAreaState.selectionStart === newSelectionStart && this._textAreaState.selectionEnd === newSelectionEnd) {
				// Nothing to do...
				return;
			}

			const _newSelectionStartPosition = this._textAreaState.deduceEditorPosition(newSelectionStart);
			const newSelectionStartPosition = this._host.deduceModelPosition(_newSelectionStartPosition[0]!, _newSelectionStartPosition[1], _newSelectionStartPosition[2]);

			const _newSelectionEndPosition = this._textAreaState.deduceEditorPosition(newSelectionEnd);
			const newSelectionEndPosition = this._host.deduceModelPosition(_newSelectionEndPosition[0]!, _newSelectionEndPosition[1], _newSelectionEndPosition[2]);

			const newSelection = new Selection(
				newSelectionStartPosition.lineNumber, newSelectionStartPosition.column,
				newSelectionEndPosition.lineNumber, newSelectionEndPosition.column
			);

			this._onSelectionChangeRequest.fire(newSelection);
		});
	}

	public dispose(): void {
		super.dispose();
		if (this._selectionChangeListener) {
			this._selectionChangeListener.dispose();
			this._selectionChangeListener = null;
		}
	}

	public focusTextArea(): void {
		// Setting this._hasFocus and writing the screen reader content
		// will result in a focus() and setSelectionRange() in the textarea
		this._setHasFocus(true);
	}

	public isFocused(): boolean {
		return this._hasFocus;
	}

	private _setHasFocus(newHasFocus: boolean): void {
		if (this._hasFocus === newHasFocus) {
			// no change
			return;
		}
		this._hasFocus = newHasFocus;

		if (this._selectionChangeListener) {
			this._selectionChangeListener.dispose();
			this._selectionChangeListener = null;
		}
		if (this._hasFocus) {
			this._selectionChangeListener = this._installSelectionChangeListener();
		}

		if (this._hasFocus) {
			if (browser.isEdge) {
				// Edge has a bug where setting the selection range while the focus event
				// is dispatching doesn't work. To reproduce, "tab into" the editor.
				this._setAndWriteTextAreaState('focusgain', TextAreaState.EMPTY);
			} else {
				this.writeScreenReaderContent('focusgain');
			}
		}

		if (this._hasFocus) {
			this._onFocus.fire();
		} else {
			this._onBlur.fire();
		}
	}

	private _setAndWriteTextAreaState(reason: string, textAreaState: TextAreaState): void {
		if (!this._hasFocus) {
			textAreaState = textAreaState.collapseSelection();
		}

		textAreaState.writeToTextArea(reason, this._textArea, this._hasFocus);
		this._textAreaState = textAreaState;
	}

	public writeScreenReaderContent(reason: string): void {
		if (this._isDoingComposition) {
			// Do not write to the text area when doing composition
			return;
		}

		this._setAndWriteTextAreaState(reason, this._host.getScreenReaderContent(this._textAreaState));
	}

	private _ensureClipboardGetsEditorSelection(e: ClipboardEvent): void {
		const copyPlainText = this._host.getPlainTextToCopy();
		if (!ClipboardEventUtils.canUseTextData(e)) {
			// Looks like an old browser. The strategy is to place the text
			// we'd like to be copied to the clipboard in the textarea and select it.
			this._setAndWriteTextAreaState('copy or cut', TextAreaState.selectedText(copyPlainText));
			return;
		}

		let copyHTML: string | null = null;
		if (browser.hasClipboardSupport() && (copyPlainText.length < 65536 || CopyOptions.forceCopyWithSyntaxHighlighting)) {
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

	public static setTextData(e: ClipboardEvent, text: string, richText: string | null): void {
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
	private _ignoreSelectionChangeTime: number;

	constructor(_textArea: FastDomNode<HTMLTextAreaElement>) {
		super();
		this._actual = _textArea;
		this._ignoreSelectionChangeTime = 0;
	}

	public setIgnoreSelectionChangeTime(reason: string): void {
		this._ignoreSelectionChangeTime = Date.now();
	}

	public getIgnoreSelectionChangeTime(): number {
		return this._ignoreSelectionChangeTime;
	}

	public resetSelectionChangeTime(): void {
		this._ignoreSelectionChangeTime = 0;
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
		this.setIgnoreSelectionChangeTime('setValue');
		textArea.value = value;
	}

	public getSelectionStart(): number {
		return this._actual.domNode.selectionStart;
	}

	public getSelectionEnd(): number {
		return this._actual.domNode.selectionEnd;
	}

	public setSelectionRange(reason: string, selectionStart: number, selectionEnd: number): void {
		const textArea = this._actual.domNode;

		const currentIsFocused = (document.activeElement === textArea);
		const currentSelectionStart = textArea.selectionStart;
		const currentSelectionEnd = textArea.selectionEnd;

		if (currentIsFocused && currentSelectionStart === selectionStart && currentSelectionEnd === selectionEnd) {
			// No change
			// Firefox iframe bug https://github.com/Microsoft/monaco-editor/issues/643#issuecomment-367871377
			if (browser.isFirefox && window.parent !== window) {
				textArea.focus();
			}
			return;
		}

		// console.log('reason: ' + reason + ', setSelectionRange: ' + selectionStart + ' -> ' + selectionEnd);

		if (currentIsFocused) {
			// No need to focus, only need to change the selection range
			this.setIgnoreSelectionChangeTime('setSelectionRange');
			textArea.setSelectionRange(selectionStart, selectionEnd);
			if (browser.isFirefox && window.parent !== window) {
				textArea.focus();
			}
			return;
		}

		// If the focus is outside the textarea, browsers will try really hard to reveal the textarea.
		// Here, we try to undo the browser's desperate reveal.
		try {
			const scrollState = dom.saveParentsScrollTop(textArea);
			this.setIgnoreSelectionChangeTime('setSelectionRange');
			textArea.focus();
			textArea.setSelectionRange(selectionStart, selectionEnd);
			dom.restoreParentsScrollTop(textArea, scrollState);
		} catch (e) {
			// Sometimes IE throws when setting selection (e.g. textarea is off-DOM)
		}
	}
}
