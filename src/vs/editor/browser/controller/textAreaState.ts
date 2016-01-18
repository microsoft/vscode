/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import EditorCommon = require('vs/editor/common/editorCommon');
import DomUtils = require('vs/base/browser/dom');
import Platform = require('vs/base/common/platform');
import Browser = require('vs/base/browser/browser');
import EditorBrowser = require('vs/editor/browser/editorBrowser');
import Schedulers = require('vs/base/common/async');
import * as Lifecycle from 'vs/base/common/lifecycle';
import Strings = require('vs/base/common/strings');
import {Range} from 'vs/editor/common/core/range';
import {Position} from 'vs/editor/common/core/position';
import {CommonKeybindings} from 'vs/base/common/keyCodes';
import Event, {Emitter} from 'vs/base/common/event';

export interface ITextAreaStyle {
	top: string;
	left: string;
	width: string;
	height: string;
}

export interface ITextAreaWrapper {
	onKeyDown: Event<DomUtils.IKeyboardEvent>;
	onKeyUp: Event<DomUtils.IKeyboardEvent>;
	onKeyPress: Event<DomUtils.IKeyboardEvent>;
	onCompositionStart: Event<void>;
	onCompositionEnd: Event<void>;
	onInput: Event<void>;
	onCut: Event<ClipboardEvent>;
	onCopy: Event<ClipboardEvent>;
	onPaste: Event<ClipboardEvent>;

	value: string;
	selectionStart: number;
	selectionEnd: number;

	setSelectionRange(selectionStart:number, selectionEnd:number): void;
	setStyle(style:ITextAreaStyle): void;
}

export interface ISimpleModel {
	getLineMaxColumn(lineNumber:number): number;
	getValueInRange(range:EditorCommon.IRange, eol:EditorCommon.EndOfLinePreference): string;
	getModelLineContent(lineNumber:number): string;
	getLineCount(): number;
	convertViewPositionToModelPosition(viewLineNumber:number, viewColumn:number): EditorCommon.IEditorPosition;
}

export class TextAreaState {
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

	public static fromTextArea(textArea:ITextAreaWrapper, selectionToken:number): TextAreaState {
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

	public applyToTextArea(textArea:ITextAreaWrapper, select:boolean): void {
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
