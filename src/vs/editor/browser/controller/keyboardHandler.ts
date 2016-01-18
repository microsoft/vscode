/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import EditorCommon = require('vs/editor/common/editorCommon');
import keyboardController = require('vs/base/browser/keyboardController');
import DomUtils = require('vs/base/browser/dom');
import Platform = require('vs/base/common/platform');
import Browser = require('vs/base/browser/browser');
import EditorBrowser = require('vs/editor/browser/editorBrowser');
import EventEmitter = require('vs/base/common/eventEmitter');
import {ViewEventHandler} from 'vs/editor/common/viewModel/viewEventHandler';
import Schedulers = require('vs/base/common/async');
import * as Lifecycle from 'vs/base/common/lifecycle';
import Strings = require('vs/base/common/strings');
import {Range} from 'vs/editor/common/core/range';
import {Position} from 'vs/editor/common/core/position';
import {CommonKeybindings} from 'vs/base/common/keyCodes';
import Event, {Emitter} from 'vs/base/common/event';

enum ReadFromTextArea {
	Type,
	Paste
}

class TextAreaState {
	private value:string;
	private selectionStart:number;
	private selectionEnd:number;
	private selectionToken:number;

	constructor(value:string, selectionStart:number, selectionEnd:number, selectionToken:number) {
		this.value = value;
		this.selectionStart = selectionStart;
		this.selectionEnd = selectionEnd;
		this.selectionToken = selectionToken;
	}

	public toString(): string {
		return '[ <' + this.value + '>, selectionStart: ' + this.selectionStart + ', selectionEnd: ' + this.selectionEnd + ']';
	}

	public static fromTextArea(textArea:TextAreaWrapper, selectionToken:number): TextAreaState {
		return new TextAreaState(textArea.value, textArea.selectionStart, textArea.selectionEnd, selectionToken);
	}

	public static fromEditorSelectionAndPreviousState(model:ISimpleModel, selection:EditorCommon.IEditorRange, previousSelectionToken:number): TextAreaState {
		if (Browser.isIPad) {
			// Do not place anything in the textarea for the iPad
			return new TextAreaState('', 0, 0, selectionStartLineNumber);
		}

		var LIMIT_CHARS = 100;
		var PADDING_LINES_COUNT = 0;

		var selectionStartLineNumber = selection.startLineNumber,
			selectionStartColumn = selection.startColumn,
			selectionEndLineNumber = selection.endLineNumber,
			selectionEndColumn = selection.endColumn,
			selectionEndLineNumberMaxColumn = model.getLineMaxColumn(selectionEndLineNumber);

		// If the selection is empty and we have switched line numbers, expand selection to full line (helps Narrator trigger a full line read)
		if (selection.isEmpty() && previousSelectionToken !== selectionStartLineNumber) {
			selectionStartColumn = 1;
			selectionEndColumn = selectionEndLineNumberMaxColumn;
		}

		// `pretext` contains the text before the selection
		var pretext = '';
		var startLineNumber = Math.max(1, selectionStartLineNumber - PADDING_LINES_COUNT);
		if (startLineNumber < selectionStartLineNumber) {
			pretext = model.getValueInRange(new Range(startLineNumber, 1, selectionStartLineNumber, 1), EditorCommon.EndOfLinePreference.LF);
		}
		pretext += model.getValueInRange(new Range(selectionStartLineNumber, 1, selectionStartLineNumber, selectionStartColumn), EditorCommon.EndOfLinePreference.LF);
		if (pretext.length > LIMIT_CHARS) {
			pretext = pretext.substring(pretext.length - LIMIT_CHARS, pretext.length);
		}


		// `posttext` contains the text after the selection
		var posttext = '';
		var endLineNumber = Math.min(selectionEndLineNumber + PADDING_LINES_COUNT, model.getLineCount());
		posttext += model.getValueInRange(new Range(selectionEndLineNumber, selectionEndColumn, selectionEndLineNumber, selectionEndLineNumberMaxColumn), EditorCommon.EndOfLinePreference.LF);
		if (endLineNumber > selectionEndLineNumber) {
			posttext = '\n' + model.getValueInRange(new Range(selectionEndLineNumber + 1, 1, endLineNumber, model.getLineMaxColumn(endLineNumber)), EditorCommon.EndOfLinePreference.LF);
		}
		if (posttext.length > LIMIT_CHARS) {
			posttext = posttext.substring(0, LIMIT_CHARS);
		}


		// `text` contains the text of the selection
		var text = model.getValueInRange(new Range(selectionStartLineNumber, selectionStartColumn, selectionEndLineNumber, selectionEndColumn), EditorCommon.EndOfLinePreference.LF);
		if (text.length > 2 * LIMIT_CHARS) {
			text = text.substring(0, LIMIT_CHARS) + String.fromCharCode(8230) + text.substring(text.length - LIMIT_CHARS, text.length);
		}

		return new TextAreaState(pretext + text + posttext, pretext.length, pretext.length + text.length, selectionStartLineNumber);
	}

	public getSelectionStart(): number {
		return this.selectionStart;
	}

	public resetSelection(): void {
		this.selectionStart = this.value.length;
		this.selectionEnd = this.value.length;
	}

	public getValue(): string {
		return this.value;
	}

	public getSelectionToken(): number {
		return this.selectionToken;
	}

	public applyToTextArea(textArea:TextAreaWrapper, select:boolean): void {
		// console.log('applyToTextArea: ' + this.toString());
		if (textArea.value !== this.value) {
			textArea.value = this.value;
		}
		if (select) {
			textArea.setSelectionRange(this.selectionStart, this.selectionEnd);
		}
	}

	public extractNewText(previousState:TextAreaState): string {
		if (this.selectionStart !== this.selectionEnd) {
			// There is a selection in the textarea => ignore input
			return '';
		}
		if (!previousState) {
			return this.value;
		}
		var previousPrefix = previousState.value.substring(0, previousState.selectionStart);
		var previousSuffix = previousState.value.substring(previousState.selectionEnd, previousState.value.length);

		// In IE, pressing Insert will bring the typing into overwrite mode
		if (Browser.isIE11orEarlier && document.queryCommandValue('OverWrite')) {
			previousSuffix = previousSuffix.substr(1);
		}

		var value = this.value;
		if (value.substring(0, previousPrefix.length) === previousPrefix) {
			value = value.substring(previousPrefix.length);
		}
		if (value.substring(value.length - previousSuffix.length, value.length) === previousSuffix) {
			value = value.substring(0, value.length - previousSuffix.length);
		}
		return value;
	}
}

interface ITextAreaStyle {
	top: string;
	left: string;
	width: string;
	height: string;
}

class TextAreaWrapper extends Lifecycle.Disposable {

	private _textArea: HTMLTextAreaElement;

	private _onKeyDown = this._register(new Emitter<DomUtils.IKeyboardEvent>());
	public onKeyDown: Event<DomUtils.IKeyboardEvent> = this._onKeyDown.event;

	private _onKeyUp = this._register(new Emitter<DomUtils.IKeyboardEvent>());
	public onKeyUp: Event<DomUtils.IKeyboardEvent> = this._onKeyUp.event;

	private _onKeyPress = this._register(new Emitter<DomUtils.IKeyboardEvent>());
	public onKeyPress: Event<DomUtils.IKeyboardEvent> = this._onKeyPress.event;

	private _onCompositionStart = this._register(new Emitter<void>());
	public onCompositionStart: Event<void> = this._onCompositionStart.event;

	private _onCompositionEnd = this._register(new Emitter<void>());
	public onCompositionEnd: Event<void> = this._onCompositionEnd.event;

	private _onInput = this._register(new Emitter<void>());
	public onInput: Event<void> = this._onInput.event;

	private _onCut = this._register(new Emitter<ClipboardEvent>());
	public onCut: Event<ClipboardEvent> = this._onCut.event;

	private _onCopy = this._register(new Emitter<ClipboardEvent>());
	public onCopy: Event<ClipboardEvent> = this._onCopy.event;

	private _onPaste = this._register(new Emitter<ClipboardEvent>());
	public onPaste: Event<ClipboardEvent> = this._onPaste.event;

	constructor(textArea: HTMLTextAreaElement) {
		super();
		this._textArea = textArea;

		let kbController = this._register(new keyboardController.KeyboardController(this._textArea));
		this._register(kbController.addListener2('keydown', (e) => this._onKeyDown.fire(e)));
		this._register(kbController.addListener2('keyup', (e) => this._onKeyUp.fire(e)));
		this._register(kbController.addListener2('keypress', (e) => this._onKeyPress.fire(e)));

		this._register(DomUtils.addDisposableListener(this._textArea, 'compositionstart', (e) => this._onCompositionStart.fire()));
		this._register(DomUtils.addDisposableListener(this._textArea, 'compositionend', (e) => this._onCompositionEnd.fire()));
		this._register(DomUtils.addDisposableListener(this._textArea, 'input', (e) => this._onInput.fire()));
		this._register(DomUtils.addDisposableListener(this._textArea, 'cut', (e) => this._onCut.fire(e)));
		this._register(DomUtils.addDisposableListener(this._textArea, 'copy', (e) => this._onCopy.fire(e)));
		this._register(DomUtils.addDisposableListener(this._textArea, 'paste', (e) => this._onPaste.fire(e)));
	}

	public get value(): string {
		return this._textArea.value;
	}

	public set value(value:string) {
		this._textArea.value = value;
	}

	public get selectionStart(): number {
		return this._textArea.selectionStart;
	}

	public get selectionEnd(): number {
		return this._textArea.selectionEnd;
	}

	public setSelectionRange(selectionStart:number, selectionEnd:number): void {
		try {
			var scrollState = DomUtils.saveParentsScrollTop(this._textArea);
			this._textArea.focus();
			this._textArea.setSelectionRange(this.selectionStart, this.selectionEnd);
			DomUtils.restoreParentsScrollTop(this._textArea, scrollState);
		} catch(e) {
			// Sometimes IE throws when setting selection (e.g. textarea is off-DOM)
		}
	}

	public setStyle(style:ITextAreaStyle): void {
		if (typeof style.top !== 'undefined') {
			this._textArea.style.top = style.top;
		}
		if (typeof style.left !== 'undefined') {
			this._textArea.style.left = style.left;
		}
		if (typeof style.width !== 'undefined') {
			this._textArea.style.width = style.width;
		}
		if (typeof style.height !== 'undefined') {
			this._textArea.style.height = style.height;
		}
	}
}

interface ITextEditor {
	getModel(): ISimpleModel;

	emitKeyDown(e:DomUtils.IKeyboardEvent): void;
	emitKeyUp(e:DomUtils.IKeyboardEvent): void;
	paste(source:string, txt:string, pasteOnNewLine:boolean): void;
	type(source:string, txt:string): void;
	replacePreviousChar(source:string, txt:string): void;
	cut(source:string): void;

	visibleRangeForPositionRelativeToEditor(lineNumber:number, column1:number, column2:number): { column1: EditorBrowser.VisibleRange; column2: EditorBrowser.VisibleRange; };
	startIME(): void;
	stopIME(): void;
}

interface ISimpleModel {
	getLineMaxColumn(lineNumber:number): number;
	getValueInRange(range:EditorCommon.IRange, eol:EditorCommon.EndOfLinePreference): string;
	getModelLineContent(lineNumber:number): string;
	getLineCount(): number;
	convertViewPositionToModelPosition(viewLineNumber:number, viewColumn:number): EditorCommon.IEditorPosition;
}

class TextAreaHandler extends ViewEventHandler implements Lifecycle.IDisposable {

	private textArea:TextAreaWrapper;
	private editor:ITextEditor;
	private configuration:EditorCommon.IConfiguration;

	private selection:EditorCommon.IEditorRange;
	private selections:EditorCommon.IEditorRange[];
	private hasFocus:boolean;
	private listenersToRemove:EventEmitter.ListenerUnbind[];
	private _toDispose:Lifecycle.IDisposable[];

	private asyncReadFromTextArea: Schedulers.RunOnceScheduler;
	private asyncSetSelectionToTextArea: Schedulers.RunOnceScheduler;
	private asyncTriggerCut: Schedulers.RunOnceScheduler;

	// keypress, paste & composition end also trigger an input event
	// the popover input method on macs triggers only an input event
	// in this case the expectInputTime would be too much in the past
	private justHadAPaste:boolean;
	private justHadACut:boolean;
	private lastKeyPressTime:number;
	private lastCompositionEndTime:number;
	private lastValueWrittenToTheTextArea:string;
	private cursorPosition:EditorCommon.IEditorPosition;
	private contentLeft:number;
	private contentWidth:number;
	private scrollLeft:number;

	private previousSetTextAreaState:TextAreaState;
	private textareaIsShownAtCursor: boolean;

	private lastCopiedValue: string;
	private lastCopiedValueIsFromEmptySelection: boolean;

	constructor(textArea:TextAreaWrapper, editor:ITextEditor, configuration:EditorCommon.IConfiguration) {
		super();

		this.textArea = textArea;
		this.editor = editor;
		this.configuration = configuration;
		this.selection = new Range(1, 1, 1, 1);
		this.selections = [new Range(1, 1, 1, 1)];
		this.cursorPosition = new Position(1, 1);
		this.contentLeft = 0;
		this.contentWidth = 0;
		this.scrollLeft = 0;

		this.asyncReadFromTextArea = new Schedulers.RunOnceScheduler(null, 0);
		this.asyncSetSelectionToTextArea = new Schedulers.RunOnceScheduler(() => this._writePlaceholderAndSelectTextArea(), 0);
		this.asyncTriggerCut = new Schedulers.RunOnceScheduler(() => this._triggerCut(), 0);

		this.lastCopiedValue = null;
		this.lastCopiedValueIsFromEmptySelection = false;
		this.previousSetTextAreaState = null;

		this.hasFocus = false;

		this.justHadAPaste = false;
		this.justHadACut = false;
		this.lastKeyPressTime = 0;
		this.lastCompositionEndTime = 0;
		this.lastValueWrittenToTheTextArea = '';

		this.listenersToRemove = [];
		this._toDispose = [];

		this._toDispose.push(this.textArea.onKeyDown((e) => this._onKeyDown(e)));
		this._toDispose.push(this.textArea.onKeyUp((e) => this._onKeyUp(e)));
		this._toDispose.push(this.textArea.onKeyPress((e) => this._onKeyPress(e)));

		this.textareaIsShownAtCursor = false;

		this._toDispose.push(this.textArea.onCompositionStart(() => {
			var timeSinceLastCompositionEnd = (new Date().getTime()) - this.lastCompositionEndTime;
			if (!this.textareaIsShownAtCursor) {
				this.textareaIsShownAtCursor = true;
				this.showTextAreaAtCursor(timeSinceLastCompositionEnd >= 100);
			}
			this.asyncReadFromTextArea.cancel();
		}));

		this._toDispose.push(this.textArea.onCompositionEnd(() => {
			if (this.textareaIsShownAtCursor) {
				this.textareaIsShownAtCursor = false;
				this.hideTextArea();
			}
			this.lastCompositionEndTime = (new Date()).getTime();
			this._scheduleReadFromTextArea(ReadFromTextArea.Type);
		}));

		// on the iPad the text area is not fast enough to get the content of the keypress,
		// so we leverage the input event instead
		if (Browser.isIPad) {
			this._toDispose.push(this.textArea.onInput(() => {
				var myTime = (new Date()).getTime();
				// A keypress will trigger an input event (very quickly)
				var keyPressDeltaTime = myTime - this.lastKeyPressTime;
				if (keyPressDeltaTime <= 500) {
					this._scheduleReadFromTextArea(ReadFromTextArea.Type);
					this.lastKeyPressTime = 0;
				}
			}));
		}

		// on the mac the character viewer input generates an input event (no keypress)
		// on windows, the Chinese IME, when set to insert wide punctuation generates an input event (no keypress)
		this._toDispose.push(this.textArea.onInput(() => {
			// Ignore input event if we are in composition mode
			if (!this.textareaIsShownAtCursor) {
				this._scheduleReadFromTextArea(ReadFromTextArea.Type);
			}
		}));

		if (Platform.isMacintosh) {

			this._toDispose.push(this.textArea.onInput(() => {

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

				var myTime = (new Date()).getTime();

				// A keypress will trigger an input event (very quickly)
				var keyPressDeltaTime = myTime - this.lastKeyPressTime;
				if (keyPressDeltaTime <= 500) {
					return;
				}

				// A composition end will trigger an input event (very quickly)
				var compositionEndDeltaTime = myTime - this.lastCompositionEndTime;
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
				var typedText:string;
				var textAreaValue = this.textArea.value;

				if (!Browser.isChrome) {
					// TODO: Also check this on Safari & FF before removing this
					return;
				}

				if (this.lastValueWrittenToTheTextArea.length !== textAreaValue.length) {
					return;
				}

				var prefixLength = Strings.commonPrefixLength(this.lastValueWrittenToTheTextArea, textAreaValue);
				var suffixLength = Strings.commonSuffixLength(this.lastValueWrittenToTheTextArea, textAreaValue);

				if (prefixLength + suffixLength + 1 !== textAreaValue.length) {
					return;
				}

				typedText = textAreaValue.charAt(prefixLength);

				this.executeReplacePreviousChar(typedText);

				this.previousSetTextAreaState = TextAreaState.fromTextArea(this.textArea, 0);
				this.asyncSetSelectionToTextArea.schedule();
			}));
		}




		this._toDispose.push(this.textArea.onCut((e) => this._onCut(e)));
		this._toDispose.push(this.textArea.onCopy((e) => this._onCopy(e)));
		this._toDispose.push(this.textArea.onPaste((e) => this._onPaste(e)));

		this._writePlaceholderAndSelectTextArea();

	}

	public dispose(): void {

		this.listenersToRemove.forEach((element) => {
			element();
		});
		this.listenersToRemove = [];
		this._toDispose = Lifecycle.disposeAll(this._toDispose);
		this.asyncReadFromTextArea.dispose();
		this.asyncSetSelectionToTextArea.dispose();
		this.asyncTriggerCut.dispose();
	}

	private showTextAreaAtCursor(emptyIt:boolean): void {

		var interestingLineNumber:number,
			interestingColumn1:number,
			interestingColumn2:number;

		// In IE we cannot set .value when handling 'compositionstart' because the entire composition will get canceled.
		if (Browser.isIE11orEarlier) {
			// Ensure selection start is in viewport
			interestingLineNumber = this.selection.startLineNumber;
			interestingColumn1 = this.selection.startColumn;
			interestingColumn2 = this.previousSetTextAreaState.getSelectionStart() + 1;
		} else {
			// Ensure primary cursor is in viewport
			interestingLineNumber = this.cursorPosition.lineNumber;
			interestingColumn1 = this.cursorPosition.column;
			interestingColumn2 = interestingColumn1;
		}

		let visibleRanges = this.editor.visibleRangeForPositionRelativeToEditor(interestingLineNumber, interestingColumn1, interestingColumn2);
		var visibleRange1 = visibleRanges.column1;
		var visibleRange2 = visibleRanges.column2;

		let style: ITextAreaStyle = {
			top: undefined,
			left: undefined,
			width: undefined,
			height: undefined
		};
		if (Browser.isIE11orEarlier) {
			// Position textarea at the beginning of the line
			if (visibleRange1 && visibleRange2) {
				style.top = visibleRange1.top + 'px';
				style.left = this.contentLeft + visibleRange1.left - visibleRange2.left - this.scrollLeft + 'px';
				style.width = this.contentWidth + 'px';
			}
		} else {
			// Position textarea at cursor location
			if (visibleRange1) {
				style.left = this.contentLeft + visibleRange1.left - this.scrollLeft + 'px';
				style.top = visibleRange1.top + 'px';
			}

			// Empty the textarea
			if (emptyIt) {
				this.setTextAreaState(new TextAreaState('', 0, 0, 0), false);
			}
		}

		// Show the textarea
		style.height = this.configuration.editor.lineHeight + 'px';
		this.textArea.setStyle(style);
		this.editor.startIME();
	}

	private hideTextArea(): void {
		this.textArea.setStyle({
			height: '',
			width: '',
			left: '0px',
			top: '0px'
		});
		this.editor.stopIME();
	}

	// --- begin event handlers

	public onScrollChanged(e:EditorCommon.IScrollEvent): boolean {
		this.scrollLeft = e.scrollLeft;
		return false;
	}

	public onViewFocusChanged(isFocused:boolean): boolean {
		this.hasFocus = isFocused;
		if (this.hasFocus) {
			this.asyncSetSelectionToTextArea.schedule();
		}
		return false;
	}

	public onCursorSelectionChanged(e:EditorCommon.IViewCursorSelectionChangedEvent): boolean {
		this.selection = e.selection;
		this.selections = [e.selection].concat(e.secondarySelections);
		this.asyncSetSelectionToTextArea.schedule();
		return false;
	}

	public onCursorPositionChanged(e:EditorCommon.IViewCursorPositionChangedEvent): boolean {
		this.cursorPosition = e.position;
		return false;
	}

	public onLayoutChanged(layoutInfo:EditorCommon.IEditorLayoutInfo): boolean {
		this.contentLeft = layoutInfo.contentLeft;
		this.contentWidth = layoutInfo.contentWidth;
		return false;
	}

	// --- end event handlers

	private setTextAreaState(textAreaState:TextAreaState, select:boolean): void {
		// IE doesn't like calling select on a hidden textarea and the textarea is hidden during the tests
		var shouldSetSelection = select && this.hasFocus;

		if (!shouldSetSelection) {
			textAreaState.resetSelection();
		}

		this.lastValueWrittenToTheTextArea = textAreaState.getValue();
		textAreaState.applyToTextArea(this.textArea, shouldSetSelection);

		this.previousSetTextAreaState = textAreaState;
	}

	private _onKeyDown(e:DomUtils.IKeyboardEvent): void {
		if (e.equals(CommonKeybindings.ESCAPE)) {
			// Prevent default always for `Esc`, otherwise it will generate a keypress
			// See http://msdn.microsoft.com/en-us/library/ie/ms536939(v=vs.85).aspx
			e.preventDefault();
		}
		this.editor.emitKeyDown(e);
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
			if (e.browserEvent && e.browserEvent.defaultPrevented) {
				// this._scheduleReadFromTextArea
				this.asyncReadFromTextArea.cancel();
				this.asyncSetSelectionToTextArea.schedule();
			}
		}, 0);
	}

	private _onKeyUp(e:DomUtils.IKeyboardEvent): void {
		this.editor.emitKeyUp(e);
	}

	private _onKeyPress(e:DomUtils.IKeyboardEvent): void {
		if (!this.hasFocus) {
			// Sometimes, when doing Alt-Tab, in FF, a 'keypress' is sent before a 'focus'
			return;
		}

		this.lastKeyPressTime = (new Date()).getTime();

		// on the iPad the text area is not fast enough to get the content of the keypress,
		// so we leverage the input event instead
		if (!Browser.isIPad) {
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
		var previousSelectionToken = this.previousSetTextAreaState ? this.previousSetTextAreaState.getSelectionToken() : 0;
		var observedState = TextAreaState.fromTextArea(this.textArea, previousSelectionToken);
		var txt = observedState.extractNewText(this.previousSetTextAreaState);

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

		var pasteOnNewLine = false;
		if (Browser.enableEmptySelectionClipboard) {
			pasteOnNewLine = (txt === this.lastCopiedValue && this.lastCopiedValueIsFromEmptySelection);
		}
		this.editor.paste('keyboard', txt, pasteOnNewLine);
	}

	private executeType(txt:string): void {
		if(txt === '') {
			return;
		}

		this.editor.type('keyboard', txt);
	}

	private executeReplacePreviousChar(txt: string): void {
		this.editor.replacePreviousChar('keyboard', txt);
	}

	private _writePlaceholderAndSelectTextArea(): void {
		if (!this.textareaIsShownAtCursor) {
			// Do not write to the textarea if it is visible.
			var previousSelectionToken = this.previousSetTextAreaState ? this.previousSetTextAreaState.getSelectionToken() : 0;
			var newState = TextAreaState.fromEditorSelectionAndPreviousState(this.editor.getModel(), this.selection, previousSelectionToken);
			this.setTextAreaState(newState, true);
		}
	}

	// ------------- Clipboard operations

	private _onPaste(e:ClipboardEvent): void {
		if (e && (<any>e).clipboardData) {
			e.preventDefault();
			this.executePaste((<any>e).clipboardData.getData('text/plain'));
		} else if (e && (<any>window).clipboardData) {
			e.preventDefault();
			this.executePaste((<any>window).clipboardData.getData('Text'));
		} else {
			if (this.textArea.selectionStart !== this.textArea.selectionEnd) {
				// Clean up the textarea, to get a clean paste
				this.setTextAreaState(new TextAreaState('', 0, 0, 0), false);
			}
			this._scheduleReadFromTextArea(ReadFromTextArea.Paste);
		}
		this.justHadAPaste = true;
	}

	private _onCopy(e:ClipboardEvent): void {
		this._ensureClipboardGetsEditorSelection(e);
	}

	private _triggerCut(): void {
		this.editor.cut('keyboard');
	}

	private _onCut(e:ClipboardEvent): void {
		this._ensureClipboardGetsEditorSelection(e);
		this.asyncTriggerCut.schedule();
		this.justHadACut = true;
	}

	private _ensureClipboardGetsEditorSelection(e:ClipboardEvent): void {
		var whatToCopy = this._getPlainTextToCopy();
		if (e && (<any>e).clipboardData) {
			(<any>e).clipboardData.setData('text/plain', whatToCopy);
//			(<any>e).clipboardData.setData('text/html', this._getHTMLToCopy());
			e.preventDefault();
		} else if (e && (<any>window).clipboardData) {
			(<any>window).clipboardData.setData('Text', whatToCopy);
			e.preventDefault();
		} else {
			this.setTextAreaState(new TextAreaState(whatToCopy, 0, whatToCopy.length, 0), true);
		}

		if (Browser.enableEmptySelectionClipboard) {
			if (Browser.isFirefox) {
				// When writing "LINE\r\n" to the clipboard and then pasting,
				// Firefox pastes "LINE\n", so let's work around this quirk
				this.lastCopiedValue = whatToCopy.replace(/\r\n/g, '\n');
			} else {
				this.lastCopiedValue = whatToCopy;
			}

			var selections = this.selections;
			this.lastCopiedValueIsFromEmptySelection = (selections.length === 1 && selections[0].isEmpty());
		}
	}

	private _getPlainTextToCopy(): string {
		var newLineCharacter = (Platform.isWindows ? '\r\n' : '\n');
		var eolPref = (Platform.isWindows ? EditorCommon.EndOfLinePreference.CRLF : EditorCommon.EndOfLinePreference.LF);
		var selections = this.selections;
		let model = this.editor.getModel();

		if (selections.length === 1) {
			var range:EditorCommon.IEditorRange = selections[0];
			if (range.isEmpty()) {
				if (Browser.enableEmptySelectionClipboard) {
					var modelLineNumber = model.convertViewPositionToModelPosition(range.startLineNumber, 1).lineNumber;
					return model.getModelLineContent(modelLineNumber) + newLineCharacter;
				} else {
					return '';
				}
			}

			return model.getValueInRange(range, eolPref);
		} else {
			selections = selections.slice(0).sort(Range.compareRangesUsingStarts);
			var result: string[] = [];
			for (var i = 0; i < selections.length; i++) {
				result.push(model.getValueInRange(selections[i], eolPref));
			}

			return result.join(newLineCharacter);
		}
	}
}

export class KeyboardHandler extends ViewEventHandler implements Lifecycle.IDisposable {

	private context:EditorBrowser.IViewContext;
	private viewController:EditorBrowser.IViewController;
	private viewHelper:EditorBrowser.IKeyboardHandlerHelper;
	private textArea:TextAreaWrapper;
	private textAreaHandler:TextAreaHandler;

	constructor(context:EditorBrowser.IViewContext, viewController:EditorBrowser.IViewController, viewHelper:EditorBrowser.IKeyboardHandlerHelper) {
		super();

		this.context = context;
		this.viewController = viewController;
		this.textArea = new TextAreaWrapper(viewHelper.textArea);
		this.viewHelper = viewHelper;

		this.textAreaHandler = new TextAreaHandler(this.textArea, {
			getModel: (): ISimpleModel => this.context.model,
			emitKeyDown: (e:DomUtils.IKeyboardEvent): void => this.viewController.emitKeyDown(e),
			emitKeyUp: (e:DomUtils.IKeyboardEvent): void => this.viewController.emitKeyUp(e),
			paste: (source:string, txt:string, pasteOnNewLine:boolean): void => this.viewController.paste(source, txt, pasteOnNewLine),
			type: (source:string, txt:string): void => this.viewController.type(source, txt),
			replacePreviousChar: (source:string, txt:string): void => this.viewController.replacePreviousChar(source, txt),
			cut: (source:string): void => this.viewController.cut(source),
			visibleRangeForPositionRelativeToEditor: (lineNumber:number, column1:number, column2:number): { column1: EditorBrowser.VisibleRange; column2: EditorBrowser.VisibleRange; } => {
				var revealInterestingColumn1Event:EditorCommon.IViewRevealRangeEvent = {
					range: new Range(lineNumber, column1, lineNumber, column1),
					verticalType: EditorCommon.VerticalRevealType.Simple,
					revealHorizontal: true
				};
				this.context.privateViewEventBus.emit(EditorCommon.ViewEventNames.RevealRangeEvent, revealInterestingColumn1Event);

				// Find range pixel position
				var visibleRange1 = this.viewHelper.visibleRangeForPositionRelativeToEditor(lineNumber, column1);
				var visibleRange2 = this.viewHelper.visibleRangeForPositionRelativeToEditor(lineNumber, column2);

				return {
					column1: visibleRange1,
					column2: visibleRange2
				}
			},
			startIME: (): void => {
				DomUtils.addClass(this.viewHelper.viewDomNode, 'ime-input');
			},
			stopIME: (): void => {
				DomUtils.removeClass(this.viewHelper.viewDomNode, 'ime-input');
			}
		}, this.context.configuration);

		this.context.addEventHandler(this);
	}

	public dispose(): void {
		this.context.removeEventHandler(this);
		this.textAreaHandler.dispose();
		this.textArea.dispose();
	}

	public onScrollChanged(e:EditorCommon.IScrollEvent): boolean {
		this.textAreaHandler.onScrollChanged(e);
		return false;
	}

	public onViewFocusChanged(isFocused:boolean): boolean {
		this.textAreaHandler.onViewFocusChanged(isFocused);
		return false;
	}

	public onCursorSelectionChanged(e:EditorCommon.IViewCursorSelectionChangedEvent): boolean {
		this.textAreaHandler.onCursorSelectionChanged(e);
		return false;
	}

	public onCursorPositionChanged(e:EditorCommon.IViewCursorPositionChangedEvent): boolean {
		this.textAreaHandler.onCursorPositionChanged(e);
		return false;
	}

	public onLayoutChanged(layoutInfo:EditorCommon.IEditorLayoutInfo): boolean {
		this.textAreaHandler.onLayoutChanged(layoutInfo);
		return false;
	}

}