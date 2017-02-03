/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import Event from 'vs/base/common/event';
import { commonPrefixLength, commonSuffixLength } from 'vs/base/common/strings';
import { Range } from 'vs/editor/common/core/range';
import { EndOfLinePreference } from 'vs/editor/common/editorCommon';
import { Position } from 'vs/editor/common/core/position';
import { Constants } from 'vs/editor/common/core/uint';

export interface IClipboardEvent {
	canUseTextData(): boolean;
	setTextData(text: string): void;
	getTextData(): string;
}

export interface ICompositionEvent {
	data: string;
	locale: string;
}

export interface IKeyboardEventWrapper {
	_actual: any;
	equals(keybinding: number): boolean;
	preventDefault(): void;
	isDefaultPrevented(): boolean;
}

export interface ITextAreaWrapper {
	onKeyDown: Event<IKeyboardEventWrapper>;
	onKeyUp: Event<IKeyboardEventWrapper>;
	onKeyPress: Event<IKeyboardEventWrapper>;
	onCompositionStart: Event<ICompositionEvent>;
	onCompositionUpdate: Event<ICompositionEvent>;
	onCompositionEnd: Event<ICompositionEvent>;
	onInput: Event<void>;
	onCut: Event<IClipboardEvent>;
	onCopy: Event<IClipboardEvent>;
	onPaste: Event<IClipboardEvent>;

	getValue(): string;
	setValue(reason: string, value: string): void;
	getSelectionStart(): number;
	getSelectionEnd(): number;

	setSelectionRange(selectionStart: number, selectionEnd: number): void;
	isInOverwriteMode(): boolean;
}

export interface ISimpleModel {
	getLineMaxColumn(lineNumber: number): number;
	getEOL(): string;
	getValueInRange(range: Range, eol: EndOfLinePreference): string;
	getModelLineContent(lineNumber: number): string;
	getLineCount(): number;
	convertViewPositionToModelPosition(viewLineNumber: number, viewColumn: number): Position;
}

export interface ITypeData {
	text: string;
	replaceCharCnt: number;
}

export enum TextAreaStrategy {
	IENarrator,
	NVDA
}

const USE_NVDA_FULL_TEXT = false;

export function createTextAreaState(strategy: TextAreaStrategy): TextAreaState {
	if (strategy === TextAreaStrategy.IENarrator) {
		return IENarratorTextAreaState.EMPTY;
	}
	if (USE_NVDA_FULL_TEXT) {
		return NVDAFullTextAreaState.EMPTY;
	}
	return NVDAPagedTextAreaState.EMPTY;
}

export abstract class TextAreaState {

	protected previousState: TextAreaState;
	protected value: string;
	protected selectionStart: number;
	protected selectionEnd: number;
	protected isInOverwriteMode: boolean;

	constructor(previousState: TextAreaState, value: string, selectionStart: number, selectionEnd: number, isInOverwriteMode: boolean) {
		this.previousState = previousState ? previousState.shallowClone() : null;
		this.value = value;
		this.selectionStart = selectionStart;
		this.selectionEnd = selectionEnd;
		this.isInOverwriteMode = isInOverwriteMode;
	}

	protected abstract shallowClone(): TextAreaState;

	public abstract toEmpty(): TextAreaState;

	public abstract toString(): string;

	public abstract toStrategy(strategy: TextAreaStrategy): TextAreaState;

	public abstract equals(other: TextAreaState): boolean;

	public abstract fromTextArea(textArea: ITextAreaWrapper): TextAreaState;

	public abstract fromEditorSelection(model: ISimpleModel, selection: Range);

	public abstract fromText(text: string): TextAreaState;

	public updateComposition(): ITypeData {
		if (!this.previousState) {
			// This is the EMPTY state
			return {
				text: '',
				replaceCharCnt: 0
			};
		}

		return {
			text: this.value,
			replaceCharCnt: this.previousState.selectionEnd - this.previousState.selectionStart
		};
	}

	public abstract resetSelection(): TextAreaState;

	public getSelectionStart(): number {
		return this.selectionStart;
	}

	public getValue(): string {
		return this.value;
	}

	public applyToTextArea(reason: string, textArea: ITextAreaWrapper, select: boolean): void {
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
			if (
				previousValue === currentValue
				&& previousSelectionStart === 0
				&& previousSelectionEnd === previousValue.length
				&& currentSelectionStart === currentValue.length
				&& currentValue.indexOf('\n') === -1
			) {
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
}

export class IENarratorTextAreaState extends TextAreaState {
	public static EMPTY = new IENarratorTextAreaState(null, '', 0, 0, false, 0);

	private selectionToken: number;

	constructor(previousState: TextAreaState, value: string, selectionStart: number, selectionEnd: number, isInOverwriteMode: boolean, selectionToken: number) {
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

	public toStrategy(strategy: TextAreaStrategy): TextAreaState {
		if (strategy === TextAreaStrategy.IENarrator) {
			return this;
		}
		if (USE_NVDA_FULL_TEXT) {
			return new NVDAFullTextAreaState(this.previousState, this.value, this.selectionStart, this.selectionEnd, this.isInOverwriteMode);
		}
		return new NVDAPagedTextAreaState(this.previousState, this.value, this.selectionStart, this.selectionEnd, this.isInOverwriteMode);
	}

	public equals(other: TextAreaState): boolean {
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

	public fromTextArea(textArea: ITextAreaWrapper): TextAreaState {
		return new IENarratorTextAreaState(this, textArea.getValue(), textArea.getSelectionStart(), textArea.getSelectionEnd(), textArea.isInOverwriteMode(), this.selectionToken);
	}

	public fromEditorSelection(model: ISimpleModel, selection: Range): TextAreaState {
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
			pretext = model.getValueInRange(new Range(startLineNumber, 1, selectionStartLineNumber, 1), EndOfLinePreference.LF);
		}
		pretext += model.getValueInRange(new Range(selectionStartLineNumber, 1, selectionStartLineNumber, selectionStartColumn), EndOfLinePreference.LF);
		if (pretext.length > LIMIT_CHARS) {
			pretext = pretext.substring(pretext.length - LIMIT_CHARS, pretext.length);
		}


		// `posttext` contains the text after the selection
		let posttext = '';
		let endLineNumber = Math.min(selectionEndLineNumber + PADDING_LINES_COUNT, model.getLineCount());
		posttext += model.getValueInRange(new Range(selectionEndLineNumber, selectionEndColumn, selectionEndLineNumber, selectionEndLineNumberMaxColumn), EndOfLinePreference.LF);
		if (endLineNumber > selectionEndLineNumber) {
			posttext = '\n' + model.getValueInRange(new Range(selectionEndLineNumber + 1, 1, endLineNumber, model.getLineMaxColumn(endLineNumber)), EndOfLinePreference.LF);
		}
		if (posttext.length > LIMIT_CHARS) {
			posttext = posttext.substring(0, LIMIT_CHARS);
		}


		// `text` contains the text of the selection
		let text = model.getValueInRange(new Range(selectionStartLineNumber, selectionStartColumn, selectionEndLineNumber, selectionEndColumn), EndOfLinePreference.LF);
		if (text.length > 2 * LIMIT_CHARS) {
			text = text.substring(0, LIMIT_CHARS) + String.fromCharCode(8230) + text.substring(text.length - LIMIT_CHARS, text.length);
		}

		return new IENarratorTextAreaState(this, pretext + text + posttext, pretext.length, pretext.length + text.length, false, selectionStartLineNumber);
	}

	public fromText(text: string): TextAreaState {
		return new IENarratorTextAreaState(this, text, 0, text.length, false, 0);
	}

	public resetSelection(): TextAreaState {
		return new IENarratorTextAreaState(this.previousState, this.value, this.value.length, this.value.length, this.isInOverwriteMode, this.selectionToken);
	}
}

export class NVDAPagedTextAreaState extends TextAreaState {
	public static EMPTY = new NVDAPagedTextAreaState(null, '', 0, 0, false);
	private static _LINES_PER_PAGE = 10;

	constructor(previousState: TextAreaState, value: string, selectionStart: number, selectionEnd: number, isInOverwriteMode: boolean) {
		super(previousState, value, selectionStart, selectionEnd, isInOverwriteMode);
	}

	protected shallowClone(): TextAreaState {
		return new NVDAPagedTextAreaState(null, this.value, this.selectionStart, this.selectionEnd, this.isInOverwriteMode);
	}

	public toEmpty(): TextAreaState {
		return NVDAPagedTextAreaState.EMPTY;
	}

	public toString(): string {
		return '[ <' + this.value + '>, selectionStart: ' + this.selectionStart + ', selectionEnd: ' + this.selectionEnd + ', isInOverwriteMode: ' + this.isInOverwriteMode + ']';
	}

	public toStrategy(strategy: TextAreaStrategy): TextAreaState {
		if (strategy === TextAreaStrategy.NVDA) {
			return this;
		}
		return new IENarratorTextAreaState(this.previousState, this.value, this.selectionStart, this.selectionEnd, this.isInOverwriteMode, 0);
	}

	public equals(other: TextAreaState): boolean {
		if (other instanceof NVDAPagedTextAreaState) {
			return (
				this.value === other.value
				&& this.selectionStart === other.selectionStart
				&& this.selectionEnd === other.selectionEnd
				&& this.isInOverwriteMode === other.isInOverwriteMode
			);
		}
		return false;
	}

	public fromTextArea(textArea: ITextAreaWrapper): TextAreaState {
		return new NVDAPagedTextAreaState(this, textArea.getValue(), textArea.getSelectionStart(), textArea.getSelectionEnd(), textArea.isInOverwriteMode());
	}

	private static _getPageOfLine(lineNumber: number): number {
		return Math.floor((lineNumber - 1) / NVDAPagedTextAreaState._LINES_PER_PAGE);
	}

	private static _getRangeForPage(page: number): Range {
		let offset = page * NVDAPagedTextAreaState._LINES_PER_PAGE;
		let startLineNumber = offset + 1;
		let endLineNumber = offset + NVDAPagedTextAreaState._LINES_PER_PAGE;
		return new Range(startLineNumber, 1, endLineNumber, Constants.MAX_SAFE_SMALL_INTEGER);
	}

	public fromEditorSelection(model: ISimpleModel, selection: Range): TextAreaState {

		let selectionStartPage = NVDAPagedTextAreaState._getPageOfLine(selection.startLineNumber);
		let selectionStartPageRange = NVDAPagedTextAreaState._getRangeForPage(selectionStartPage);

		let selectionEndPage = NVDAPagedTextAreaState._getPageOfLine(selection.endLineNumber);
		let selectionEndPageRange = NVDAPagedTextAreaState._getRangeForPage(selectionEndPage);

		let pretextRange = selectionStartPageRange.intersectRanges(new Range(1, 1, selection.startLineNumber, selection.startColumn));
		let pretext = model.getValueInRange(pretextRange, EndOfLinePreference.LF);

		let lastLine = model.getLineCount();
		let lastLineMaxColumn = model.getLineMaxColumn(lastLine);
		let posttextRange = selectionEndPageRange.intersectRanges(new Range(selection.endLineNumber, selection.endColumn, lastLine, lastLineMaxColumn));
		let posttext = model.getValueInRange(posttextRange, EndOfLinePreference.LF);

		let text: string = null;
		if (selectionStartPage === selectionEndPage || selectionStartPage + 1 === selectionEndPage) {
			// take full selection
			text = model.getValueInRange(selection, EndOfLinePreference.LF);
		} else {
			let selectionRange1 = selectionStartPageRange.intersectRanges(selection);
			let selectionRange2 = selectionEndPageRange.intersectRanges(selection);
			text = (
				model.getValueInRange(selectionRange1, EndOfLinePreference.LF)
				+ String.fromCharCode(8230)
				+ model.getValueInRange(selectionRange2, EndOfLinePreference.LF)
			);
		}

		// Chromium handles very poorly text even of a few thousand chars
		// Cut text to avoid stalling the entire UI
		const LIMIT_CHARS = 500;
		if (pretext.length > LIMIT_CHARS) {
			pretext = pretext.substring(pretext.length - LIMIT_CHARS, pretext.length);
		}
		if (posttext.length > LIMIT_CHARS) {
			posttext = posttext.substring(0, LIMIT_CHARS);
		}
		if (text.length > 2 * LIMIT_CHARS) {
			text = text.substring(0, LIMIT_CHARS) + String.fromCharCode(8230) + text.substring(text.length - LIMIT_CHARS, text.length);
		}

		return new NVDAPagedTextAreaState(this, pretext + text + posttext, pretext.length, pretext.length + text.length, false);
	}

	public fromText(text: string): TextAreaState {
		return new NVDAPagedTextAreaState(this, text, 0, text.length, false);
	}

	public resetSelection(): TextAreaState {
		return new NVDAPagedTextAreaState(this.previousState, this.value, this.value.length, this.value.length, this.isInOverwriteMode);
	}
}


export class NVDAFullTextAreaState extends TextAreaState {
	public static EMPTY = new NVDAFullTextAreaState(null, '', 0, 0, false);

	constructor(previousState: TextAreaState, value: string, selectionStart: number, selectionEnd: number, isInOverwriteMode: boolean) {
		super(previousState, value, selectionStart, selectionEnd, isInOverwriteMode);
	}

	protected shallowClone(): TextAreaState {
		return new NVDAFullTextAreaState(null, this.value, this.selectionStart, this.selectionEnd, this.isInOverwriteMode);
	}

	public toEmpty(): TextAreaState {
		return NVDAFullTextAreaState.EMPTY;
	}

	public toString(): string {
		return '[ <ENTIRE TEXT' + /*this.value +*/ '>, selectionStart: ' + this.selectionStart + ', selectionEnd: ' + this.selectionEnd + ', isInOverwriteMode: ' + this.isInOverwriteMode + ']';
	}

	public toStrategy(strategy: TextAreaStrategy): TextAreaState {
		if (strategy === TextAreaStrategy.NVDA) {
			return this;
		}
		return new IENarratorTextAreaState(this.previousState, this.value, this.selectionStart, this.selectionEnd, this.isInOverwriteMode, 0);
	}

	public equals(other: TextAreaState): boolean {
		if (other instanceof NVDAFullTextAreaState) {
			return (
				this.value === other.value
				&& this.selectionStart === other.selectionStart
				&& this.selectionEnd === other.selectionEnd
				&& this.isInOverwriteMode === other.isInOverwriteMode
			);
		}
		return false;
	}

	public fromTextArea(textArea: ITextAreaWrapper): TextAreaState {
		return new NVDAFullTextAreaState(this, textArea.getValue(), textArea.getSelectionStart(), textArea.getSelectionEnd(), textArea.isInOverwriteMode());
	}

	public fromEditorSelection(model: ISimpleModel, selection: Range): TextAreaState {
		let pretext = model.getValueInRange(new Range(1, 1, selection.startLineNumber, selection.startColumn), EndOfLinePreference.LF);
		let text = model.getValueInRange(selection, EndOfLinePreference.LF);
		let lastLine = model.getLineCount();
		let lastLineMaxColumn = model.getLineMaxColumn(lastLine);
		let posttext = model.getValueInRange(new Range(selection.endLineNumber, selection.endColumn, lastLine, lastLineMaxColumn), EndOfLinePreference.LF);

		return new NVDAFullTextAreaState(this, pretext + text + posttext, pretext.length, pretext.length + text.length, false);
	}

	public fromText(text: string): TextAreaState {
		return new NVDAFullTextAreaState(this, text, 0, text.length, false);
	}

	public resetSelection(): TextAreaState {
		return new NVDAFullTextAreaState(this.previousState, this.value, this.value.length, this.value.length, this.isInOverwriteMode);
	}
}
