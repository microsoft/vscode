/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { IState, FontStyle, StandardTokenType, MetadataConsts, ColorId, LanguageId } from 'vs/editor/common/modes';
import { CharCode } from 'vs/base/common/charCode';
import { LineTokens } from 'vs/editor/common/core/lineTokens';
import { ViewLineTokenFactory } from 'vs/editor/common/core/viewLineToken';
import * as arrays from 'vs/base/common/arrays';
import { Position } from 'vs/editor/common/core/position';
import { Range } from 'vs/editor/common/core/range';

export interface ILineEdit {
	startColumn: number;
	endColumn: number;
	text: string;
}

/**
 * Returns:
 *  - -1 => the line consists of whitespace
 *  - otherwise => the indent level is returned value
 */
export function computeIndentLevel(line: string, tabSize: number): number {
	let indent = 0;
	let i = 0;
	let len = line.length;

	while (i < len) {
		let chCode = line.charCodeAt(i);
		if (chCode === CharCode.Space) {
			indent++;
		} else if (chCode === CharCode.Tab) {
			indent = indent - indent % tabSize + tabSize;
		} else {
			break;
		}
		i++;
	}

	if (i === len) {
		return -1; // line only consists of whitespace
	}

	return indent;
}

export interface IModelLine {
	readonly text: string;

	// --- editing
	applyEdits(edits: ILineEdit[]): number;
	append(other: IModelLine): void;
	split(splitColumn: number): IModelLine;
}

export abstract class AbstractModelLine {

	constructor() {
	}

	///

	public abstract get text(): string;
	protected abstract _setText(text: string): void;
	protected abstract _createModelLine(text: string): IModelLine;

	///

	public applyEdits(edits: ILineEdit[]): number {
		let deltaColumn = 0;
		let resultText = this.text;

		for (let i = 0, len = edits.length; i < len; i++) {
			let edit = edits[i];

			// console.log();
			// console.log('=============================');
			// console.log('EDIT #' + i + ' [ ' + edit.startColumn + ' -> ' + edit.endColumn + ' ] : <<<' + edit.text + '>>>');
			// console.log('deltaColumn: ' + deltaColumn);

			let startColumn = deltaColumn + edit.startColumn;
			let endColumn = deltaColumn + edit.endColumn;
			let deletingCnt = endColumn - startColumn;
			let insertingCnt = edit.text.length;

			// Perform the edit & update `deltaColumn`
			resultText = resultText.substring(0, startColumn - 1) + edit.text + resultText.substring(endColumn - 1);
			deltaColumn += insertingCnt - deletingCnt;
		}

		// Save the resulting text
		this._setText(resultText);

		return deltaColumn;
	}

	public split(splitColumn: number): IModelLine {
		const myText = this.text.substring(0, splitColumn - 1);
		const otherText = this.text.substring(splitColumn - 1);

		this._setText(myText);
		return this._createModelLine(otherText);
	}

	public append(other: IModelLine): void {
		this._setText(this.text + other.text);
	}
}

export class ModelLine extends AbstractModelLine implements IModelLine {

	private _text: string;
	public get text(): string { return this._text; }

	constructor(text: string) {
		super();
		this._setText(text);
	}

	protected _createModelLine(text: string): IModelLine {
		return new ModelLine(text);
	}

	public split(splitColumn: number): IModelLine {
		return super.split(splitColumn);
	}

	public append(other: IModelLine): void {
		super.append(other);
	}

	protected _setText(text: string): void {
		this._text = text;
	}
}

/**
 * A model line that cannot store any tokenization state.
 * It has no fields except the text.
 */
export class MinimalModelLine extends AbstractModelLine implements IModelLine {

	private _text: string;
	public get text(): string { return this._text; }

	constructor(text: string) {
		super();
		this._setText(text);
	}

	protected _createModelLine(text: string): IModelLine {
		return new MinimalModelLine(text);
	}

	public split(splitColumn: number): IModelLine {
		return super.split(splitColumn);
	}

	public append(other: IModelLine): void {
		super.append(other);
	}

	protected _setText(text: string): void {
		this._text = text;
	}
}

function getDefaultMetadata(topLevelLanguageId: LanguageId): number {
	return (
		(topLevelLanguageId << MetadataConsts.LANGUAGEID_OFFSET)
		| (StandardTokenType.Other << MetadataConsts.TOKEN_TYPE_OFFSET)
		| (FontStyle.None << MetadataConsts.FONT_STYLE_OFFSET)
		| (ColorId.DefaultForeground << MetadataConsts.FOREGROUND_OFFSET)
		| (ColorId.DefaultBackground << MetadataConsts.BACKGROUND_OFFSET)
	) >>> 0;
}

const EMPTY_LINE_TOKENS = new Uint32Array(0);

class ModelLineTokens {
	_state: IState;
	_lineTokens: ArrayBuffer;
	_invalid: boolean;

	constructor(state: IState) {
		this._state = state;
		this._lineTokens = null;
		this._invalid = true;
	}

	public deleteBeginning(toChIndex: number): void {
		if (this._lineTokens === null || this._lineTokens === EMPTY_LINE_TOKENS) {
			return;
		}
		this.delete(0, toChIndex);
	}

	public deleteEnding(fromChIndex: number): void {
		if (this._lineTokens === null || this._lineTokens === EMPTY_LINE_TOKENS) {
			return;
		}

		const tokens = new Uint32Array(this._lineTokens);
		const lineTextLength = tokens[tokens.length - 2];
		this.delete(fromChIndex, lineTextLength);
	}

	public delete(fromChIndex: number, toChIndex: number): void {
		if (this._lineTokens === null || this._lineTokens === EMPTY_LINE_TOKENS || fromChIndex === toChIndex) {
			return;
		}

		const tokens = new Uint32Array(this._lineTokens);
		const tokensCount = (tokens.length >>> 1);

		// special case: deleting everything
		if (fromChIndex === 0 && tokens[tokens.length - 2] === toChIndex) {
			this._lineTokens = EMPTY_LINE_TOKENS;
			return;
		}

		const fromTokenIndex = ViewLineTokenFactory.findIndexInSegmentsArray(tokens, fromChIndex);
		const fromTokenStartOffset = (fromTokenIndex > 0 ? tokens[(fromTokenIndex - 1) << 1] : 0);
		const fromTokenEndOffset = tokens[fromTokenIndex << 1];

		if (toChIndex < fromTokenEndOffset) {
			// the delete range is inside a single token
			const delta = (toChIndex - fromChIndex);
			for (let i = fromTokenIndex; i < tokensCount; i++) {
				tokens[i << 1] -= delta;
			}
			return;
		}

		let dest: number;
		let lastEnd: number;
		if (fromTokenStartOffset !== fromChIndex) {
			tokens[fromTokenIndex << 1] = fromChIndex;
			dest = ((fromTokenIndex + 1) << 1);
			lastEnd = fromChIndex;
		} else {
			dest = (fromTokenIndex << 1);
			lastEnd = fromTokenStartOffset;
		}

		const delta = (toChIndex - fromChIndex);
		for (let tokenIndex = fromTokenIndex + 1; tokenIndex < tokensCount; tokenIndex++) {
			const tokenEndOffset = tokens[tokenIndex << 1] - delta;
			if (tokenEndOffset > lastEnd) {
				tokens[dest++] = tokenEndOffset;
				tokens[dest++] = tokens[(tokenIndex << 1) + 1];
				lastEnd = tokenEndOffset;
			}
		}

		if (dest === tokens.length) {
			// nothing to trim
			return;
		}

		let tmp = new Uint32Array(dest);
		tmp.set(tokens.subarray(0, dest), 0);
		this._lineTokens = tmp.buffer;
	}

	public append(_otherTokens: ArrayBuffer): void {
		if (_otherTokens === EMPTY_LINE_TOKENS) {
			return;
		}
		if (this._lineTokens === EMPTY_LINE_TOKENS) {
			this._lineTokens = _otherTokens;
			return;
		}
		if (this._lineTokens === null) {
			return;
		}
		if (_otherTokens === null) {
			// cannot determine combined line length...
			this._lineTokens = null;
			return;
		}
		const myTokens = new Uint32Array(this._lineTokens);
		const otherTokens = new Uint32Array(_otherTokens);
		const otherTokensCount = (otherTokens.length >>> 1);

		let result = new Uint32Array(myTokens.length + otherTokens.length);
		result.set(myTokens, 0);
		let dest = myTokens.length;
		const delta = myTokens[myTokens.length - 2];
		for (let i = 0; i < otherTokensCount; i++) {
			result[dest++] = otherTokens[(i << 1)] + delta;
			result[dest++] = otherTokens[(i << 1) + 1];
		}
		this._lineTokens = result.buffer;
	}

	public insert(chIndex: number, textLength: number): void {
		if (!this._lineTokens) {
			// nothing to do
			return;
		}

		const tokens = new Uint32Array(this._lineTokens);
		const tokensCount = (tokens.length >>> 1);

		let fromTokenIndex = ViewLineTokenFactory.findIndexInSegmentsArray(tokens, chIndex);
		if (fromTokenIndex > 0) {
			const fromTokenStartOffset = (fromTokenIndex > 0 ? tokens[(fromTokenIndex - 1) << 1] : 0);
			if (fromTokenStartOffset === chIndex) {
				fromTokenIndex--;
			}
		}
		for (let tokenIndex = fromTokenIndex; tokenIndex < tokensCount; tokenIndex++) {
			tokens[tokenIndex << 1] += textLength;
		}
	}
}

export class ModelLinesTokens {

	private _tokens: ModelLineTokens[];

	constructor() {
		this._tokens = [];
	}

	public setInitialState(initialState: IState): void {
		this._tokens[0] = new ModelLineTokens(initialState);
	}

	public getTokens(topLevelLanguageId: LanguageId, lineIndex: number, lineText: string): LineTokens {
		let rawLineTokens: ArrayBuffer = null;
		if (lineIndex < this._tokens.length) {
			rawLineTokens = this._tokens[lineIndex]._lineTokens;
		}

		if (rawLineTokens !== null && rawLineTokens !== EMPTY_LINE_TOKENS) {
			return new LineTokens(new Uint32Array(rawLineTokens), lineText);
		}

		let lineTokens = new Uint32Array(2);
		lineTokens[0] = lineText.length;
		lineTokens[1] = getDefaultMetadata(topLevelLanguageId);
		return new LineTokens(lineTokens, lineText);
	}

	public setIsInvalid(lineIndex: number, invalid: boolean): void {
		if (lineIndex < this._tokens.length) {
			this._tokens[lineIndex]._invalid = invalid;
		}
	}

	public isInvalid(lineIndex: number): boolean {
		if (lineIndex < this._tokens.length) {
			return this._tokens[lineIndex]._invalid;
		}
		return true;
	}

	public getState(lineIndex: number): IState {
		if (lineIndex < this._tokens.length) {
			return this._tokens[lineIndex]._state;
		}
		return null;
	}

	public setTokens(topLevelLanguageId: LanguageId, lineIndex: number, lineTextLength: number, tokens: Uint32Array): void {
		let target: ModelLineTokens;
		if (lineIndex < this._tokens.length) {
			target = this._tokens[lineIndex];
		} else {
			target = new ModelLineTokens(null);
			this._tokens[lineIndex] = target;
		}

		if (lineTextLength === 0) {
			target._lineTokens = EMPTY_LINE_TOKENS;
			return;
		}

		if (!tokens || tokens.length === 0) {
			tokens = new Uint32Array(2);
			tokens[0] = 0;
			tokens[1] = getDefaultMetadata(topLevelLanguageId);
		}

		LineTokens.convertToEndOffset(tokens, lineTextLength);

		target._lineTokens = tokens.buffer;
	}

	public setState(lineIndex: number, state: IState): void {
		if (lineIndex < this._tokens.length) {
			this._tokens[lineIndex]._state = state;
		} else {
			const tmp = new ModelLineTokens(state);
			this._tokens[lineIndex] = tmp;
		}
	}

	// --- editing

	public applyEdits2(range: Range, lines: string[]): void {
		this._acceptDeleteRange(range);
		this._acceptInsertText(new Position(range.startLineNumber, range.startColumn), lines);
	}

	private _acceptDeleteRange(range: Range): void {

		const firstLineIndex = range.startLineNumber - 1;
		if (firstLineIndex >= this._tokens.length) {
			return;
		}

		if (range.startLineNumber === range.endLineNumber) {
			if (range.startColumn === range.endColumn) {
				// Nothing to delete
				return;
			}

			this._tokens[firstLineIndex].delete(range.startColumn - 1, range.endColumn - 1);
			return;
		}

		const firstLine = this._tokens[firstLineIndex];
		firstLine.deleteEnding(range.startColumn - 1);

		const lastLineIndex = range.endLineNumber - 1;
		let lastLineTokens: ArrayBuffer = null;
		if (lastLineIndex < this._tokens.length) {
			const lastLine = this._tokens[lastLineIndex];
			lastLine.deleteBeginning(range.endColumn - 1);
			lastLineTokens = lastLine._lineTokens;
		}

		// Take remaining text on last line and append it to remaining text on first line
		firstLine.append(lastLineTokens);

		// Delete middle lines
		this._tokens.splice(range.startLineNumber, range.endLineNumber - range.startLineNumber);
	}

	private _acceptInsertText(position: Position, insertLines: string[]): void {

		if (!insertLines || insertLines.length === 0) {
			// Nothing to insert
			return;
		}

		const lineIndex = position.lineNumber - 1;
		if (lineIndex >= this._tokens.length) {
			return;
		}

		if (insertLines.length === 1) {
			// Inserting text on one line
			this._tokens[lineIndex].insert(position.column - 1, insertLines[0].length);
			return;
		}

		const line = this._tokens[lineIndex];
		line.deleteEnding(position.column - 1);
		line.insert(position.column - 1, insertLines[0].length);

		let insert: ModelLineTokens[] = new Array<ModelLineTokens>(insertLines.length - 1);
		for (let i = insertLines.length - 2; i >= 0; i--) {
			insert[i] = new ModelLineTokens(null);
		}
		this._tokens = arrays.arrayInsert(this._tokens, position.lineNumber, insert);
	}
}
