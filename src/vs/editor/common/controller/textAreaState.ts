/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as EditorCommon from 'vs/editor/common/editorCommon';
import {Range} from 'vs/editor/common/core/range';
import Event from 'vs/base/common/event';
import {commonPrefixLength, commonSuffixLength} from 'vs/base/common/strings';

export interface IClipboardEvent {
	canUseTextData(): boolean;
	setTextData(text:string): void;
	getTextData(): string;
}

export interface IKeyboardEventWrapper {
	_actual: any;
	equals(keybinding:number): boolean;
	preventDefault(): void;
	isDefaultPrevented(): boolean;
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

	getValue(): string;
	setValue(reason:string, value:string): void;
	getSelectionStart(): number;
	getSelectionEnd(): number;

	setSelectionRange(selectionStart:number, selectionEnd:number): void;
	isInOverwriteMode(): boolean;
}

export interface ISimpleModel {
	getLineMaxColumn(lineNumber:number): number;
	getValueInRange(range:EditorCommon.IRange, eol:EditorCommon.EndOfLinePreference): string;
	getModelLineContent(lineNumber:number): string;
	getLineCount(): number;
	convertViewPositionToModelPosition(viewLineNumber:number, viewColumn:number): EditorCommon.IEditorPosition;
}

export interface ITypeData {
	text: string;
	replaceCharCnt: number;
}

export abstract class TextAreaState {

	protected previousState:TextAreaState;
	protected value:string;
	protected selectionStart:number;
	protected selectionEnd:number;
	protected isInOverwriteMode:boolean;

	constructor(previousState:TextAreaState, value:string, selectionStart:number, selectionEnd:number, isInOverwriteMode:boolean) {
		this.previousState = previousState ? previousState.shallowClone() : null;
		this.value = value;
		this.selectionStart = selectionStart;
		this.selectionEnd = selectionEnd;
		this.isInOverwriteMode = isInOverwriteMode;
	}

	protected abstract shallowClone(): TextAreaState;

	public abstract toEmpty(): TextAreaState;

	public abstract toString(): string;

	public abstract equals(other:TextAreaState): boolean;

	public abstract fromTextArea(textArea:ITextAreaWrapper): TextAreaState;

	public abstract fromEditorSelection(model:ISimpleModel, selection:EditorCommon.IEditorRange);

	public abstract fromText(text:string): TextAreaState;

	public abstract resetSelection(): TextAreaState;

	public getSelectionStart(): number {
		return this.selectionStart;
	}

	public getValue(): string {
		return this.value;
	}

	public applyToTextArea(reason:string, textArea:ITextAreaWrapper, select:boolean): void {
		// console.log(Date.now() + ': applyToTextArea ' + reason + ': ' + this.toString());
		if (textArea.getValue() !== this.value) {
			textArea.setValue(reason, this.value);
		}
		if (select) {
			textArea.setSelectionRange(this.selectionStart, this.selectionEnd);
		}
	}

	public deduceInput(): ITypeData {
		if (!this.previousState) {
			// This is the EMPTY state
			return {
				text: '',
				replaceCharCnt: 0
			};
		}

		// console.log('------------------------deduceInput');
		// console.log('CURRENT STATE: ' + this.toString());
		// console.log('PREVIOUS STATE: ' + this.previousState.toString());

		let previousValue = this.previousState.value;
		let previousSelectionStart = this.previousState.selectionStart;
		let previousSelectionEnd = this.previousState.selectionEnd;
		let currentValue = this.value;
		let currentSelectionStart = this.selectionStart;
		let currentSelectionEnd = this.selectionEnd;

		// Strip the previous suffix from the value (without interfering with the current selection)
		let previousSuffix = previousValue.substring(previousSelectionEnd);
		let currentSuffix = currentValue.substring(currentSelectionEnd);
		let suffixLength = commonSuffixLength(previousSuffix, currentSuffix);
		currentValue = currentValue.substring(0, currentValue.length - suffixLength);
		previousValue = previousValue.substring(0, previousValue.length - suffixLength);

		let previousPrefix = previousValue.substring(0, previousSelectionStart);
		let currentPrefix = currentValue.substring(0, currentSelectionStart);
		let prefixLength = commonPrefixLength(previousPrefix, currentPrefix);
		currentValue = currentValue.substring(prefixLength);
		previousValue = previousValue.substring(prefixLength);
		currentSelectionStart -= prefixLength;
		previousSelectionStart -= prefixLength;
		currentSelectionEnd -= prefixLength;
		previousSelectionEnd -= prefixLength;

		// console.log('AFTER DIFFING CURRENT STATE: <' + currentValue + '>, selectionStart: ' + currentSelectionStart + ', selectionEnd: ' + currentSelectionEnd);
		// console.log('AFTER DIFFING PREVIOUS STATE: <' + previousValue + '>, selectionStart: ' + previousSelectionStart + ', selectionEnd: ' + previousSelectionEnd);

		if (currentSelectionStart === currentSelectionEnd) {
			// composition accept case
			// [blahblah] => blahblah|
			if (previousValue === currentValue && previousSelectionStart === 0 && previousSelectionEnd === previousValue.length && currentSelectionStart === currentValue.length) {
				return {
					text: '',
					replaceCharCnt: 0
				};
			}

			// no current selection
			let replacePreviousCharacters = (previousPrefix.length - prefixLength);
			// console.log('REMOVE PREVIOUS: ' + (previousPrefix.length - prefixLength) + ' chars');

			return {
				text: currentValue,
				replaceCharCnt: replacePreviousCharacters
			};
		}

		// there is a current selection => composition case
		let replacePreviousCharacters = previousSelectionEnd - previousSelectionStart;
		return {
			text: currentValue,
			replaceCharCnt: replacePreviousCharacters
		};
	}

	public extractNewText(): string {
		// console.log('-----------')
		// console.log('prev:' + String(previousState));
		// console.log('curr:' + String(this));
		if (this.selectionStart !== this.selectionEnd) {
			// There is a selection in the textarea => ignore input
			return '';
		}
		if (!this.previousState) {
			return this.value;
		}
		let previousPrefix = this.previousState.value.substring(0, this.previousState.selectionStart);
		let previousSuffix = this.previousState.value.substring(this.previousState.selectionEnd, this.previousState.value.length);

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

	public extractMacReplacedText(): string {
		// Ignore if the textarea has selection
		if (this.selectionStart !== this.selectionEnd) {
			return '';
		}
		if (!this.previousState) {
			return '';
		}
		if (this.previousState.value.length !== this.value.length) {
			return '';
		}

		let prefixLength = commonPrefixLength(this.previousState.value, this.value);
		let suffixLength = commonSuffixLength(this.previousState.value, this.value);

		if (prefixLength + suffixLength + 1 !== this.value.length) {
			return '';
		}

		return this.value.charAt(prefixLength);
	}
}

export class IENarratorTextAreaState extends TextAreaState {
	public static EMPTY = new IENarratorTextAreaState(null, '', 0, 0, false, 0);

	private selectionToken:number;

	constructor(previousState:TextAreaState, value:string, selectionStart:number, selectionEnd:number, isInOverwriteMode:boolean, selectionToken:number) {
		super(previousState, value, selectionStart, selectionEnd, isInOverwriteMode);
		this.selectionToken = selectionToken;
	}

	protected shallowClone(): TextAreaState {
		return new IENarratorTextAreaState(null, this.value, this.selectionStart, this.selectionEnd, this.isInOverwriteMode, this.selectionToken);
	}

	public toEmpty(): TextAreaState {
		return IENarratorTextAreaState.EMPTY;
	}

	public toString(): string {
		return '[ <' + this.value + '>, selectionStart: ' + this.selectionStart + ', selectionEnd: ' + this.selectionEnd + ', isInOverwriteMode: ' + this.isInOverwriteMode + ', selectionToken: ' + this.selectionToken + ']';
	}

	public equals(other:TextAreaState): boolean {
		if (other instanceof IENarratorTextAreaState) {
			return (
				this.value === other.value
				&& this.selectionStart === other.selectionStart
				&& this.selectionEnd === other.selectionEnd
				&& this.isInOverwriteMode === other.isInOverwriteMode
				&& this.selectionToken === other.selectionToken
			);
		}
		return false;
	}

	public fromTextArea(textArea:ITextAreaWrapper): TextAreaState {
		return new IENarratorTextAreaState(this, textArea.getValue(), textArea.getSelectionStart(), textArea.getSelectionEnd(), textArea.isInOverwriteMode(), this.selectionToken);
	}

	public fromEditorSelection(model:ISimpleModel, selection:EditorCommon.IEditorRange): TextAreaState {
		let LIMIT_CHARS = 100;
		let PADDING_LINES_COUNT = 0;

		let selectionStartLineNumber = selection.startLineNumber,
			selectionStartColumn = selection.startColumn,
			selectionEndLineNumber = selection.endLineNumber,
			selectionEndColumn = selection.endColumn,
			selectionEndLineNumberMaxColumn = model.getLineMaxColumn(selectionEndLineNumber);

		// If the selection is empty and we have switched line numbers, expand selection to full line (helps Narrator trigger a full line read)
		if (selection.isEmpty() && this.selectionToken !== selectionStartLineNumber) {
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

		return new IENarratorTextAreaState(this, pretext + text + posttext, pretext.length, pretext.length + text.length, false, selectionStartLineNumber);
	}

	public fromText(text:string): TextAreaState {
		return new IENarratorTextAreaState(this, text, 0, text.length, false, 0)
	}

	public resetSelection(): TextAreaState {
		return new IENarratorTextAreaState(this.previousState, this.value, this.value.length, this.value.length, this.isInOverwriteMode, this.selectionToken);
	}
}

export class NVDATextAreaState extends TextAreaState {
	public static EMPTY = new NVDATextAreaState(null, '', 0, 0, false);

	constructor(previousState:TextAreaState, value:string, selectionStart:number, selectionEnd:number, isInOverwriteMode:boolean) {
		super(previousState, value, selectionStart, selectionEnd, isInOverwriteMode);
	}

	protected shallowClone(): TextAreaState {
		return new NVDATextAreaState(null, this.value, this.selectionStart, this.selectionEnd, this.isInOverwriteMode);
	}

	public toEmpty(): TextAreaState {
		return NVDATextAreaState.EMPTY;
	}

	public toString(): string {
		return '[ <ENTIRE TEXT' + /*this.value +*/ '>, selectionStart: ' + this.selectionStart + ', selectionEnd: ' + this.selectionEnd + ', isInOverwriteMode: ' + this.isInOverwriteMode + ']';
	}

	public equals(other:TextAreaState): boolean {
		if (other instanceof NVDATextAreaState) {
			return (
				this.value === other.value
				&& this.selectionStart === other.selectionStart
				&& this.selectionEnd === other.selectionEnd
				&& this.isInOverwriteMode === other.isInOverwriteMode
			);
		}
		return false;
	}

	public fromTextArea(textArea:ITextAreaWrapper): TextAreaState {
		return new NVDATextAreaState(this, textArea.getValue(), textArea.getSelectionStart(), textArea.getSelectionEnd(), textArea.isInOverwriteMode());
	}

	public fromEditorSelection(model:ISimpleModel, selection:EditorCommon.IEditorRange): TextAreaState {
		let pretext = model.getValueInRange(new Range(1, 1, selection.startLineNumber, selection.startColumn), EditorCommon.EndOfLinePreference.LF);
		let text = model.getValueInRange(selection, EditorCommon.EndOfLinePreference.LF);
		let lastLine = model.getLineCount();
		let lastLineMaxColumn = model.getLineMaxColumn(lastLine);
		let posttext = model.getValueInRange(new Range(selection.endLineNumber, selection.endColumn, lastLine, lastLineMaxColumn), EditorCommon.EndOfLinePreference.LF);

		return new NVDATextAreaState(this, pretext + text + posttext, pretext.length, pretext.length + text.length, false);
	}

	public fromText(text:string): TextAreaState {
		return new NVDATextAreaState(this, text, 0, text.length, false)
	}

	public resetSelection(): TextAreaState {
		return new NVDATextAreaState(this.previousState, this.value, this.value.length, this.value.length, this.isInOverwriteMode);
	}
}
