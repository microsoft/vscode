/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as EditorCommon from 'vs/editor/common/editorCommon';
import {Range} from 'vs/editor/common/core/range';
import Event from 'vs/base/common/event';

export interface ITextAreaStyle {
	top: string;
	left: string;
	width: string;
	height: string;
}

export interface IClipboardEvent {
	canUseTextData(): boolean;
	setTextData(text:string): void;
	getTextData(): string;
}

export interface IKeyboardEventWrapper {
	actual: any;
}

export interface ITextAreaWrapper {
	onKeyDown: Event<IKeyboardEventWrapper>;
	onKeyUp: Event<IKeyboardEventWrapper>;
	onKeyPress: Event<IKeyboardEventWrapper>;
	onCompositionStart: Event<void>;
	onCompositionEnd: Event<void>;
	onInput: Event<void>;
	onCut: Event<IClipboardEvent>;
	onCopy: Event<IClipboardEvent>;
	onPaste: Event<IClipboardEvent>;

	value: string;
	selectionStart: number;
	selectionEnd: number;

	setSelectionRange(selectionStart:number, selectionEnd:number): void;
	setStyle(style:ITextAreaStyle): void;
	isInOverwriteMode(): boolean;
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
	private isInOverwriteMode:boolean;
	private selectionToken:number;

	constructor(value:string, selectionStart:number, selectionEnd:number, isInOverwriteMode:boolean, selectionToken:number) {
		this.value = value;
		this.selectionStart = selectionStart;
		this.selectionEnd = selectionEnd;
		this.isInOverwriteMode = isInOverwriteMode;
		this.selectionToken = selectionToken;
	}

	public toString(): string {
		return '[ <' + this.value + '>, selectionStart: ' + this.selectionStart + ', selectionEnd: ' + this.selectionEnd + ']';
	}

	public static fromTextArea(textArea:ITextAreaWrapper, selectionToken:number): TextAreaState {
		return new TextAreaState(textArea.value, textArea.selectionStart, textArea.selectionEnd, textArea.isInOverwriteMode(), selectionToken);
	}

	public static fromEditorSelectionAndPreviousState(model:ISimpleModel, selection:EditorCommon.IEditorRange, previousSelectionToken:number): TextAreaState {
		let LIMIT_CHARS = 100;
		let PADDING_LINES_COUNT = 0;

		let selectionStartLineNumber = selection.startLineNumber,
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
		let pretext = '';
		let startLineNumber = Math.max(1, selectionStartLineNumber - PADDING_LINES_COUNT);
		if (startLineNumber < selectionStartLineNumber) {
			pretext = model.getValueInRange(new Range(startLineNumber, 1, selectionStartLineNumber, 1), EditorCommon.EndOfLinePreference.LF);
		}
		pretext += model.getValueInRange(new Range(selectionStartLineNumber, 1, selectionStartLineNumber, selectionStartColumn), EditorCommon.EndOfLinePreference.LF);
		if (pretext.length > LIMIT_CHARS) {
			pretext = pretext.substring(pretext.length - LIMIT_CHARS, pretext.length);
		}


		// `posttext` contains the text after the selection
		let posttext = '';
		let endLineNumber = Math.min(selectionEndLineNumber + PADDING_LINES_COUNT, model.getLineCount());
		posttext += model.getValueInRange(new Range(selectionEndLineNumber, selectionEndColumn, selectionEndLineNumber, selectionEndLineNumberMaxColumn), EditorCommon.EndOfLinePreference.LF);
		if (endLineNumber > selectionEndLineNumber) {
			posttext = '\n' + model.getValueInRange(new Range(selectionEndLineNumber + 1, 1, endLineNumber, model.getLineMaxColumn(endLineNumber)), EditorCommon.EndOfLinePreference.LF);
		}
		if (posttext.length > LIMIT_CHARS) {
			posttext = posttext.substring(0, LIMIT_CHARS);
		}


		// `text` contains the text of the selection
		let text = model.getValueInRange(new Range(selectionStartLineNumber, selectionStartColumn, selectionEndLineNumber, selectionEndColumn), EditorCommon.EndOfLinePreference.LF);
		if (text.length > 2 * LIMIT_CHARS) {
			text = text.substring(0, LIMIT_CHARS) + String.fromCharCode(8230) + text.substring(text.length - LIMIT_CHARS, text.length);
		}

		return new TextAreaState(pretext + text + posttext, pretext.length, pretext.length + text.length, false, selectionStartLineNumber);
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
		let previousPrefix = previousState.value.substring(0, previousState.selectionStart);
		let previousSuffix = previousState.value.substring(previousState.selectionEnd, previousState.value.length);

		if (this.isInOverwriteMode) {
			previousSuffix = previousSuffix.substr(1);
		}

		let value = this.value;
		if (value.substring(0, previousPrefix.length) === previousPrefix) {
			value = value.substring(previousPrefix.length);
		}
		if (value.substring(value.length - previousSuffix.length, value.length) === previousSuffix) {
			value = value.substring(0, value.length - previousSuffix.length);
		}
		return value;
	}
}
