/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { OrderGuaranteeEventEmitter } from 'vs/base/common/eventEmitter';
import * as strings from 'vs/base/common/strings';
import { Position } from 'vs/editor/common/core/position';
import { Range } from 'vs/editor/common/core/range';
import * as editorCommon from 'vs/editor/common/editorCommon';
import { ModelLine } from 'vs/editor/common/model/modelLine';
import { guessIndentation } from 'vs/editor/common/model/indentationGuesser';
import { DEFAULT_INDENTATION, DEFAULT_TRIM_AUTO_WHITESPACE } from 'vs/editor/common/config/defaultConfig';
import { PrefixSumComputer } from 'vs/editor/common/viewModel/prefixSumComputer';
import { IndentRange, computeRanges } from 'vs/editor/common/model/indentRanges';
import { TextModelSearch, SearchParams } from 'vs/editor/common/model/textModelSearch';

const LIMIT_FIND_COUNT = 999;
export const LONG_LINE_BOUNDARY = 1000;

export class TextModel extends OrderGuaranteeEventEmitter implements editorCommon.ITextModel {
	private static MODEL_SYNC_LIMIT = 5 * 1024 * 1024; // 5 MB
	private static MODEL_TOKENIZATION_LIMIT = 20 * 1024 * 1024; // 20 MB

	public static DEFAULT_CREATION_OPTIONS: editorCommon.ITextModelCreationOptions = {
		tabSize: DEFAULT_INDENTATION.tabSize,
		insertSpaces: DEFAULT_INDENTATION.insertSpaces,
		detectIndentation: false,
		defaultEOL: editorCommon.DefaultEndOfLine.LF,
		trimAutoWhitespace: DEFAULT_TRIM_AUTO_WHITESPACE,
	};

	/*protected*/ _lines: ModelLine[];
	protected _EOL: string;
	protected _isDisposed: boolean;
	protected _isDisposing: boolean;
	protected _options: editorCommon.TextModelResolvedOptions;
	protected _lineStarts: PrefixSumComputer;
	private _indentRanges: IndentRange[];

	private _versionId: number;
	/**
	 * Unlike, versionId, this can go down (via undo) or go to previous values (via redo)
	 */
	private _alternativeVersionId: number;
	private _BOM: string;
	protected _mightContainRTL: boolean;
	protected _mightContainNonBasicASCII: boolean;

	private _shouldSimplifyMode: boolean;
	private _shouldDenyMode: boolean;

	constructor(allowedEventTypes: string[], rawText: editorCommon.IRawText) {
		allowedEventTypes.push(editorCommon.EventType.ModelRawContentChanged, editorCommon.EventType.ModelOptionsChanged, editorCommon.EventType.ModelContentChanged2);
		super(allowedEventTypes);

		this._shouldSimplifyMode = (rawText.length > TextModel.MODEL_SYNC_LIMIT);
		this._shouldDenyMode = (rawText.length > TextModel.MODEL_TOKENIZATION_LIMIT);

		this._options = new editorCommon.TextModelResolvedOptions(rawText.options);
		this._constructLines(rawText);
		this._setVersionId(1);
		this._isDisposed = false;
		this._isDisposing = false;
	}

	protected _assertNotDisposed(): void {
		if (this._isDisposed) {
			throw new Error('Model is disposed!');
		}
	}

	public isTooLargeForHavingAMode(): boolean {
		this._assertNotDisposed();
		return this._shouldDenyMode;
	}

	public isTooLargeForHavingARichMode(): boolean {
		this._assertNotDisposed();
		return this._shouldSimplifyMode;
	}

	public getOptions(): editorCommon.TextModelResolvedOptions {
		this._assertNotDisposed();
		return this._options;
	}

	public updateOptions(_newOpts: editorCommon.ITextModelUpdateOptions): void {
		this._assertNotDisposed();
		let tabSize = (typeof _newOpts.tabSize !== 'undefined') ? _newOpts.tabSize : this._options.tabSize;
		let insertSpaces = (typeof _newOpts.insertSpaces !== 'undefined') ? _newOpts.insertSpaces : this._options.insertSpaces;
		let trimAutoWhitespace = (typeof _newOpts.trimAutoWhitespace !== 'undefined') ? _newOpts.trimAutoWhitespace : this._options.trimAutoWhitespace;

		let newOpts = new editorCommon.TextModelResolvedOptions({
			tabSize: tabSize,
			insertSpaces: insertSpaces,
			defaultEOL: this._options.defaultEOL,
			trimAutoWhitespace: trimAutoWhitespace
		});

		if (this._options.equals(newOpts)) {
			return;
		}

		let e = this._options.createChangeEvent(newOpts);
		this._options = newOpts;

		if (e.tabSize) {
			let newTabSize = this._options.tabSize;
			for (let i = 0, len = this._lines.length; i < len; i++) {
				this._lines[i].updateTabSize(newTabSize);
			}
		}

		this.emit(editorCommon.EventType.ModelOptionsChanged, e);
	}

	public detectIndentation(defaultInsertSpaces: boolean, defaultTabSize: number): void {
		this._assertNotDisposed();
		let lines = this._lines.map(line => line.text);
		let guessedIndentation = guessIndentation(lines, defaultTabSize, defaultInsertSpaces);
		this.updateOptions({
			insertSpaces: guessedIndentation.insertSpaces,
			tabSize: guessedIndentation.tabSize
		});
	}

	private static _normalizeIndentationFromWhitespace(str: string, tabSize: number, insertSpaces: boolean): string {
		let spacesCnt = 0;
		for (let i = 0; i < str.length; i++) {
			if (str.charAt(i) === '\t') {
				spacesCnt += tabSize;
			} else {
				spacesCnt++;
			}
		}

		let result = '';
		if (!insertSpaces) {
			let tabsCnt = Math.floor(spacesCnt / tabSize);
			spacesCnt = spacesCnt % tabSize;
			for (let i = 0; i < tabsCnt; i++) {
				result += '\t';
			}
		}

		for (let i = 0; i < spacesCnt; i++) {
			result += ' ';
		}

		return result;
	}

	public static normalizeIndentation(str: string, tabSize: number, insertSpaces: boolean): string {
		let firstNonWhitespaceIndex = strings.firstNonWhitespaceIndex(str);
		if (firstNonWhitespaceIndex === -1) {
			firstNonWhitespaceIndex = str.length;
		}
		return TextModel._normalizeIndentationFromWhitespace(str.substring(0, firstNonWhitespaceIndex), tabSize, insertSpaces) + str.substring(firstNonWhitespaceIndex);
	}

	public normalizeIndentation(str: string): string {
		this._assertNotDisposed();
		return TextModel.normalizeIndentation(str, this._options.tabSize, this._options.insertSpaces);
	}

	public getOneIndent(): string {
		this._assertNotDisposed();
		let tabSize = this._options.tabSize;
		let insertSpaces = this._options.insertSpaces;

		if (insertSpaces) {
			let result = '';
			for (let i = 0; i < tabSize; i++) {
				result += ' ';
			}
			return result;
		} else {
			return '\t';
		}
	}

	public getVersionId(): number {
		this._assertNotDisposed();
		return this._versionId;
	}

	public mightContainRTL(): boolean {
		return this._mightContainRTL;
	}

	public mightContainNonBasicASCII(): boolean {
		return this._mightContainNonBasicASCII;
	}

	public getAlternativeVersionId(): number {
		this._assertNotDisposed();
		return this._alternativeVersionId;
	}

	private _ensureLineStarts(): void {
		if (!this._lineStarts) {
			const eolLength = this._EOL.length;
			const linesLength = this._lines.length;
			const lineStartValues = new Uint32Array(linesLength);
			for (let i = 0; i < linesLength; i++) {
				lineStartValues[i] = this._lines[i].text.length + eolLength;
			}
			this._lineStarts = new PrefixSumComputer(lineStartValues);
		}
	}

	public getOffsetAt(rawPosition: editorCommon.IPosition): number {
		this._assertNotDisposed();
		let position = this._validatePosition(rawPosition.lineNumber, rawPosition.column, false);
		this._ensureLineStarts();
		return this._lineStarts.getAccumulatedValue(position.lineNumber - 2) + position.column - 1;
	}

	public getPositionAt(offset: number): Position {
		this._assertNotDisposed();
		offset = Math.floor(offset);
		offset = Math.max(0, offset);

		this._ensureLineStarts();
		let out = this._lineStarts.getIndexOf(offset);

		let lineLength = this._lines[out.index].text.length;

		// Ensure we return a valid position
		return new Position(out.index + 1, Math.min(out.remainder + 1, lineLength + 1));
	}

	protected _increaseVersionId(): void {
		this._setVersionId(this._versionId + 1);
	}

	protected _setVersionId(newVersionId: number): void {
		this._versionId = newVersionId;
		this._alternativeVersionId = this._versionId;
	}

	protected _overwriteAlternativeVersionId(newAlternativeVersionId: number): void {
		this._alternativeVersionId = newAlternativeVersionId;
	}

	public isDisposed(): boolean {
		return this._isDisposed;
	}

	public dispose(): void {
		this._isDisposed = true;
		// Null out members, such that any use of a disposed model will throw exceptions sooner rather than later
		this._lines = null;
		this._EOL = null;
		this._BOM = null;

		super.dispose();
	}

	protected _createContentChangedFlushEvent(): editorCommon.IModelContentChangedFlushEvent {
		return {
			changeType: editorCommon.EventType.ModelRawContentChangedFlush,
			detail: this.toRawText(),
			versionId: this._versionId,
			// TODO@Alex -> remove these fields from here
			isUndoing: false,
			isRedoing: false
		};
	}

	protected _emitContentChanged2(startLineNumber: number, startColumn: number, endLineNumber: number, endColumn: number, rangeLength: number, text: string, isUndoing: boolean, isRedoing: boolean): void {
		var e: editorCommon.IModelContentChangedEvent2 = {
			range: new Range(startLineNumber, startColumn, endLineNumber, endColumn),
			rangeLength: rangeLength,
			text: text,
			eol: this._EOL,
			versionId: this.getVersionId(),
			isUndoing: isUndoing,
			isRedoing: isRedoing
		};
		if (!this._isDisposing) {
			this.emit(editorCommon.EventType.ModelContentChanged2, e);
		}
	}

	protected _resetValue(newValue: editorCommon.ITextSource): void {
		this._constructLines(newValue);
		this._increaseVersionId();
	}

	public toRawText(): editorCommon.IRawText {
		this._assertNotDisposed();
		return {
			BOM: this._BOM,
			EOL: this._EOL,
			lines: this.getLinesContent(),
			length: this.getValueLength(),
			containsRTL: this._mightContainRTL,
			isBasicASCII: !this._mightContainNonBasicASCII,
			options: this._options
		};
	}

	public equals(other: editorCommon.ITextSource): boolean {
		this._assertNotDisposed();
		if (this._BOM !== other.BOM) {
			return false;
		}
		if (this._EOL !== other.EOL) {
			return false;
		}
		if (this._lines.length !== other.lines.length) {
			return false;
		}
		for (let i = 0, len = this._lines.length; i < len; i++) {
			if (this._lines[i].text !== other.lines[i]) {
				return false;
			}
		}
		return true;
	}

	public setValue(value: string): void {
		this._assertNotDisposed();
		if (value === null) {
			// There's nothing to do
			return;
		}
		let rawText: editorCommon.IRawText = null;
		rawText = TextModel.toRawText(value, {
			tabSize: this._options.tabSize,
			insertSpaces: this._options.insertSpaces,
			trimAutoWhitespace: this._options.trimAutoWhitespace,
			detectIndentation: false,
			defaultEOL: this._options.defaultEOL
		});
		this.setValueFromRawText(rawText);
	}

	public setValueFromRawText(newValue: editorCommon.ITextSource): void {
		this._assertNotDisposed();
		if (newValue === null) {
			// There's nothing to do
			return;
		}
		var oldFullModelRange = this.getFullModelRange();
		var oldModelValueLength = this.getValueLengthInRange(oldFullModelRange);
		var endLineNumber = this.getLineCount();
		var endColumn = this.getLineMaxColumn(endLineNumber);

		this._resetValue(newValue);

		this._emitModelContentChangedFlushEvent(this._createContentChangedFlushEvent());

		this._emitContentChanged2(1, 1, endLineNumber, endColumn, oldModelValueLength, this.getValue(), false, false);
	}

	public getValue(eol?: editorCommon.EndOfLinePreference, preserveBOM: boolean = false): string {
		this._assertNotDisposed();
		var fullModelRange = this.getFullModelRange();
		var fullModelValue = this.getValueInRange(fullModelRange, eol);

		if (preserveBOM) {
			return this._BOM + fullModelValue;
		}

		return fullModelValue;
	}

	public getValueLength(eol?: editorCommon.EndOfLinePreference, preserveBOM: boolean = false): number {
		this._assertNotDisposed();
		var fullModelRange = this.getFullModelRange();
		var fullModelValue = this.getValueLengthInRange(fullModelRange, eol);

		if (preserveBOM) {
			return this._BOM.length + fullModelValue;
		}

		return fullModelValue;
	}

	public getEmptiedValueInRange(rawRange: editorCommon.IRange, fillCharacter: string = '', eol: editorCommon.EndOfLinePreference = editorCommon.EndOfLinePreference.TextDefined): string {
		this._assertNotDisposed();
		var range = this.validateRange(rawRange);

		if (range.isEmpty()) {
			return '';
		}

		if (range.startLineNumber === range.endLineNumber) {
			return this._repeatCharacter(fillCharacter, range.endColumn - range.startColumn);
		}

		var lineEnding = this._getEndOfLine(eol),
			startLineIndex = range.startLineNumber - 1,
			endLineIndex = range.endLineNumber - 1,
			resultLines: string[] = [];

		resultLines.push(this._repeatCharacter(fillCharacter, this._lines[startLineIndex].text.length - range.startColumn + 1));
		for (var i = startLineIndex + 1; i < endLineIndex; i++) {
			resultLines.push(this._repeatCharacter(fillCharacter, this._lines[i].text.length));
		}
		resultLines.push(this._repeatCharacter(fillCharacter, range.endColumn - 1));

		return resultLines.join(lineEnding);
	}

	private _repeatCharacter(fillCharacter: string, count: number): string {
		var r = '';
		for (var i = 0; i < count; i++) {
			r += fillCharacter;
		}
		return r;
	}

	public getValueInRange(rawRange: editorCommon.IRange, eol: editorCommon.EndOfLinePreference = editorCommon.EndOfLinePreference.TextDefined): string {
		this._assertNotDisposed();
		var range = this.validateRange(rawRange);

		if (range.isEmpty()) {
			return '';
		}

		if (range.startLineNumber === range.endLineNumber) {
			return this._lines[range.startLineNumber - 1].text.substring(range.startColumn - 1, range.endColumn - 1);
		}

		var lineEnding = this._getEndOfLine(eol),
			startLineIndex = range.startLineNumber - 1,
			endLineIndex = range.endLineNumber - 1,
			resultLines: string[] = [];

		resultLines.push(this._lines[startLineIndex].text.substring(range.startColumn - 1));
		for (var i = startLineIndex + 1; i < endLineIndex; i++) {
			resultLines.push(this._lines[i].text);
		}
		resultLines.push(this._lines[endLineIndex].text.substring(0, range.endColumn - 1));

		return resultLines.join(lineEnding);
	}

	public getValueLengthInRange(rawRange: editorCommon.IRange, eol: editorCommon.EndOfLinePreference = editorCommon.EndOfLinePreference.TextDefined): number {
		this._assertNotDisposed();
		var range = this.validateRange(rawRange);

		if (range.isEmpty()) {
			return 0;
		}

		if (range.startLineNumber === range.endLineNumber) {
			return (range.endColumn - range.startColumn);
		}

		let startOffset = this.getOffsetAt(new Position(range.startLineNumber, range.startColumn));
		let endOffset = this.getOffsetAt(new Position(range.endLineNumber, range.endColumn));
		return endOffset - startOffset;
	}

	public isDominatedByLongLines(): boolean {
		this._assertNotDisposed();
		var smallLineCharCount = 0,
			longLineCharCount = 0,
			i: number,
			len: number,
			lines = this._lines,
			lineLength: number;

		for (i = 0, len = this._lines.length; i < len; i++) {
			lineLength = lines[i].text.length;
			if (lineLength >= LONG_LINE_BOUNDARY) {
				longLineCharCount += lineLength;
			} else {
				smallLineCharCount += lineLength;
			}
		}

		return (longLineCharCount > smallLineCharCount);
	}

	public getLineCount(): number {
		this._assertNotDisposed();
		return this._lines.length;
	}

	public getLineContent(lineNumber: number): string {
		this._assertNotDisposed();
		if (lineNumber < 1 || lineNumber > this.getLineCount()) {
			throw new Error('Illegal value ' + lineNumber + ' for `lineNumber`');
		}

		return this._lines[lineNumber - 1].text;
	}

	public getIndentLevel(lineNumber: number): number {
		this._assertNotDisposed();
		if (lineNumber < 1 || lineNumber > this.getLineCount()) {
			throw new Error('Illegal value ' + lineNumber + ' for `lineNumber`');
		}

		return this._lines[lineNumber - 1].getIndentLevel();
	}

	protected _resetIndentRanges(): void {
		this._indentRanges = null;
	}

	private _getIndentRanges(): IndentRange[] {
		if (!this._indentRanges) {
			this._indentRanges = computeRanges(this);
		}
		return this._indentRanges;
	}

	public getIndentRanges(): IndentRange[] {
		this._assertNotDisposed();
		let indentRanges = this._getIndentRanges();
		return IndentRange.deepCloneArr(indentRanges);
	}

	private _toValidLineIndentGuide(lineNumber: number, indentGuide: number): number {
		let lineIndentLevel = this._lines[lineNumber - 1].getIndentLevel();
		if (lineIndentLevel === -1) {
			return indentGuide;
		}
		let maxIndentGuide = Math.ceil(lineIndentLevel / this._options.tabSize);
		return Math.min(maxIndentGuide, indentGuide);
	}

	public getLineIndentGuide(lineNumber: number): number {
		this._assertNotDisposed();
		if (lineNumber < 1 || lineNumber > this.getLineCount()) {
			throw new Error('Illegal value ' + lineNumber + ' for `lineNumber`');
		}

		let indentRanges = this._getIndentRanges();

		for (let i = indentRanges.length - 1; i >= 0; i--) {
			let rng = indentRanges[i];

			if (rng.startLineNumber === lineNumber) {
				return this._toValidLineIndentGuide(lineNumber, Math.ceil(rng.indent / this._options.tabSize));
			}
			if (rng.startLineNumber < lineNumber && lineNumber <= rng.endLineNumber) {
				return this._toValidLineIndentGuide(lineNumber, 1 + Math.floor(rng.indent / this._options.tabSize));
			}
			if (rng.endLineNumber + 1 === lineNumber) {
				let bestIndent = rng.indent;
				while (i > 0) {
					i--;
					rng = indentRanges[i];
					if (rng.endLineNumber + 1 === lineNumber) {
						bestIndent = rng.indent;
					}
				}
				return this._toValidLineIndentGuide(lineNumber, Math.ceil(bestIndent / this._options.tabSize));
			}
		}

		return 0;
	}

	public getLinesContent(): string[] {
		this._assertNotDisposed();
		var r: string[] = [];
		for (var i = 0, len = this._lines.length; i < len; i++) {
			r[i] = this._lines[i].text;
		}
		return r;
	}

	public getEOL(): string {
		this._assertNotDisposed();
		return this._EOL;
	}

	public setEOL(eol: editorCommon.EndOfLineSequence): void {
		this._assertNotDisposed();
		var newEOL = (eol === editorCommon.EndOfLineSequence.CRLF ? '\r\n' : '\n');
		if (this._EOL === newEOL) {
			// Nothing to do
			return;
		}

		var oldFullModelRange = this.getFullModelRange();
		var oldModelValueLength = this.getValueLengthInRange(oldFullModelRange);
		var endLineNumber = this.getLineCount();
		var endColumn = this.getLineMaxColumn(endLineNumber);

		this._EOL = newEOL;
		this._lineStarts = null;
		this._increaseVersionId();

		this._emitModelContentChangedFlushEvent(this._createContentChangedFlushEvent());

		this._emitContentChanged2(1, 1, endLineNumber, endColumn, oldModelValueLength, this.getValue(), false, false);
	}

	public getLineMinColumn(lineNumber: number): number {
		this._assertNotDisposed();
		return 1;
	}

	public getLineMaxColumn(lineNumber: number): number {
		this._assertNotDisposed();
		if (lineNumber < 1 || lineNumber > this.getLineCount()) {
			throw new Error('Illegal value ' + lineNumber + ' for `lineNumber`');
		}

		return this._lines[lineNumber - 1].text.length + 1;
	}

	public getLineFirstNonWhitespaceColumn(lineNumber: number): number {
		this._assertNotDisposed();
		if (lineNumber < 1 || lineNumber > this.getLineCount()) {
			throw new Error('Illegal value ' + lineNumber + ' for `lineNumber`');
		}

		var result = strings.firstNonWhitespaceIndex(this._lines[lineNumber - 1].text);
		if (result === -1) {
			return 0;
		}
		return result + 1;
	}

	public getLineLastNonWhitespaceColumn(lineNumber: number): number {
		this._assertNotDisposed();
		if (lineNumber < 1 || lineNumber > this.getLineCount()) {
			throw new Error('Illegal value ' + lineNumber + ' for `lineNumber`');
		}

		var result = strings.lastNonWhitespaceIndex(this._lines[lineNumber - 1].text);
		if (result === -1) {
			return 0;
		}
		return result + 2;
	}

	public validateLineNumber(lineNumber: number): number {
		this._assertNotDisposed();
		if (lineNumber < 1) {
			lineNumber = 1;
		}
		if (lineNumber > this._lines.length) {
			lineNumber = this._lines.length;
		}
		return lineNumber;
	}

	/**
	 * @param strict Do NOT allow a position inside a high-low surrogate pair
	 */
	private _validatePosition(_lineNumber: number, _column: number, strict: boolean): Position {
		const lineNumber = Math.floor(typeof _lineNumber === 'number' ? _lineNumber : 1);
		const column = Math.floor(typeof _column === 'number' ? _column : 1);

		if (lineNumber < 1) {
			return new Position(1, 1);
		}

		if (lineNumber > this._lines.length) {
			return new Position(this._lines.length, this.getLineMaxColumn(this._lines.length));
		}

		if (column <= 1) {
			return new Position(lineNumber, 1);
		}

		const maxColumn = this.getLineMaxColumn(lineNumber);
		if (column >= maxColumn) {
			return new Position(lineNumber, maxColumn);
		}

		if (strict) {
			// If the position would end up in the middle of a high-low surrogate pair,
			// we move it to before the pair
			// !!At this point, column > 1
			const charCodeBefore = this._lines[lineNumber - 1].text.charCodeAt(column - 2);
			if (strings.isHighSurrogate(charCodeBefore)) {
				return new Position(lineNumber, column - 1);
			}
		}

		return new Position(lineNumber, column);
	}

	public validatePosition(position: editorCommon.IPosition): Position {
		this._assertNotDisposed();
		return this._validatePosition(position.lineNumber, position.column, true);
	}

	public validateRange(_range: editorCommon.IRange): Range {
		this._assertNotDisposed();
		const start = this._validatePosition(_range.startLineNumber, _range.startColumn, false);
		const end = this._validatePosition(_range.endLineNumber, _range.endColumn, false);

		const startLineNumber = start.lineNumber;
		const startColumn = start.column;
		const endLineNumber = end.lineNumber;
		const endColumn = end.column;

		const startLineText = this._lines[startLineNumber - 1].text;
		const endLineText = this._lines[endLineNumber - 1].text;

		const charCodeBeforeStart = (startColumn > 1 ? startLineText.charCodeAt(startColumn - 2) : 0);
		const charCodeBeforeEnd = (endColumn > 1 && endColumn <= endLineText.length ? endLineText.charCodeAt(endColumn - 2) : 0);

		const startInsideSurrogatePair = strings.isHighSurrogate(charCodeBeforeStart);
		const endInsideSurrogatePair = strings.isHighSurrogate(charCodeBeforeEnd);

		if (!startInsideSurrogatePair && !endInsideSurrogatePair) {
			return new Range(startLineNumber, startColumn, endLineNumber, endColumn);
		}

		if (startLineNumber === endLineNumber && startColumn === endColumn) {
			// do not expand a collapsed range, simply move it to a valid location
			return new Range(startLineNumber, startColumn - 1, endLineNumber, endColumn - 1);
		}

		if (startInsideSurrogatePair && endInsideSurrogatePair) {
			// expand range at both ends
			return new Range(startLineNumber, startColumn - 1, endLineNumber, endColumn + 1);
		}

		if (startInsideSurrogatePair) {
			// only expand range at the start
			return new Range(startLineNumber, startColumn - 1, endLineNumber, endColumn);
		}

		// only expand range at the end
		return new Range(startLineNumber, startColumn, endLineNumber, endColumn + 1);
	}

	public modifyPosition(rawPosition: editorCommon.IPosition, offset: number): Position {
		this._assertNotDisposed();
		return this.getPositionAt(this.getOffsetAt(rawPosition) + offset);
	}

	public getFullModelRange(): Range {
		this._assertNotDisposed();
		var lineCount = this.getLineCount();
		return new Range(1, 1, lineCount, this.getLineMaxColumn(lineCount));
	}

	protected _emitModelContentChangedFlushEvent(e: editorCommon.IModelContentChangedFlushEvent): void {
		if (!this._isDisposing) {
			this.emit(editorCommon.EventType.ModelRawContentChanged, e);
		}
	}

	public static toTextSource(rawText: string): editorCommon.ITextSource2 {
		// Count the number of lines that end with \r\n
		let carriageReturnCnt = 0;
		let lastCarriageReturnIndex = -1;
		while ((lastCarriageReturnIndex = rawText.indexOf('\r', lastCarriageReturnIndex + 1)) !== -1) {
			carriageReturnCnt++;
		}

		const containsRTL = strings.containsRTL(rawText);
		const isBasicASCII = (containsRTL ? false : strings.isBasicASCII(rawText));

		// Split the text into lines
		const lines = rawText.split(/\r\n|\r|\n/);

		// Remove the BOM (if present)
		let BOM = '';
		if (strings.startsWithUTF8BOM(lines[0])) {
			BOM = strings.UTF8_BOM_CHARACTER;
			lines[0] = lines[0].substr(1);
		}

		return {
			BOM: BOM,
			lines: lines,
			length: rawText.length,
			containsRTL: containsRTL,
			isBasicASCII: isBasicASCII,
			totalCRCount: carriageReturnCnt
		};
	}

	/**
	 * if text source is empty or with precisely one line, returns null. No end of line is detected.
	 * if text source contains more lines ending with '\r\n', returns '\r\n'.
	 * Otherwise returns '\n'. More lines end with '\n'.
	 */
	public static getEndOfLine(textSource: editorCommon.ITextSource2): string {
		const lineFeedCnt = textSource.lines.length - 1;
		if (lineFeedCnt === 0) {
			// This is an empty file or a file with precisely one line
			return null;
		}
		if (textSource.totalCRCount > lineFeedCnt / 2) {
			// More than half of the file contains \r\n ending lines
			return '\r\n';
		}
		// At least one line more ends in \n
		return '\n';
	}

	public static toRawText(rawText: string, opts: editorCommon.ITextModelCreationOptions): editorCommon.IRawText {
		const textSource = TextModel.toTextSource(rawText);
		return TextModel.toRawTextFromTextSource(textSource, opts);
	}

	public static toRawTextFromTextSource(textSource: editorCommon.ITextSource2, opts: editorCommon.ITextModelCreationOptions): editorCommon.IRawText {
		let EOL = TextModel.getEndOfLine(textSource);
		if (!EOL) {
			// This is an empty file or a file with precisely one line
			EOL = (opts.defaultEOL === editorCommon.DefaultEndOfLine.LF ? '\n' : '\r\n');
		}

		let resolvedOpts: editorCommon.TextModelResolvedOptions;
		if (opts.detectIndentation) {
			let guessedIndentation = guessIndentation(textSource.lines, opts.tabSize, opts.insertSpaces);
			resolvedOpts = new editorCommon.TextModelResolvedOptions({
				tabSize: guessedIndentation.tabSize,
				insertSpaces: guessedIndentation.insertSpaces,
				trimAutoWhitespace: opts.trimAutoWhitespace,
				defaultEOL: opts.defaultEOL
			});
		} else {
			resolvedOpts = new editorCommon.TextModelResolvedOptions({
				tabSize: opts.tabSize,
				insertSpaces: opts.insertSpaces,
				trimAutoWhitespace: opts.trimAutoWhitespace,
				defaultEOL: opts.defaultEOL
			});
		}

		return {
			BOM: textSource.BOM,
			EOL: EOL,
			lines: textSource.lines,
			length: textSource.length,
			containsRTL: textSource.containsRTL,
			isBasicASCII: textSource.isBasicASCII,
			options: resolvedOpts
		};
	}

	private _constructLines(rawText: editorCommon.ITextSource): void {
		const tabSize = this._options.tabSize;
		let rawLines = rawText.lines;
		let modelLines: ModelLine[] = [];

		for (let i = 0, len = rawLines.length; i < len; i++) {
			modelLines[i] = new ModelLine(i + 1, rawLines[i], tabSize);
		}
		this._BOM = rawText.BOM;
		this._mightContainRTL = rawText.containsRTL;
		this._mightContainNonBasicASCII = !rawText.isBasicASCII;
		this._EOL = rawText.EOL;
		this._lines = modelLines;
		this._lineStarts = null;
		this._resetIndentRanges();
	}

	private _getEndOfLine(eol: editorCommon.EndOfLinePreference): string {
		switch (eol) {
			case editorCommon.EndOfLinePreference.LF:
				return '\n';
			case editorCommon.EndOfLinePreference.CRLF:
				return '\r\n';
			case editorCommon.EndOfLinePreference.TextDefined:
				return this.getEOL();
		}
		throw new Error('Unknown EOL preference');
	}

	public findMatches(searchString: string, rawSearchScope: any, isRegex: boolean, matchCase: boolean, wholeWord: boolean, captureMatches: boolean, limitResultCount: number = LIMIT_FIND_COUNT): editorCommon.FindMatch[] {
		this._assertNotDisposed();

		let searchRange: Range;
		if (Range.isIRange(rawSearchScope)) {
			searchRange = this.validateRange(rawSearchScope);
		} else {
			searchRange = this.getFullModelRange();
		}

		return TextModelSearch.findMatches(this, new SearchParams(searchString, isRegex, matchCase, wholeWord), searchRange, captureMatches, limitResultCount);
	}

	public findNextMatch(searchString: string, rawSearchStart: editorCommon.IPosition, isRegex: boolean, matchCase: boolean, wholeWord: boolean, captureMatches: boolean): editorCommon.FindMatch {
		this._assertNotDisposed();
		const searchStart = this.validatePosition(rawSearchStart);
		return TextModelSearch.findNextMatch(this, new SearchParams(searchString, isRegex, matchCase, wholeWord), searchStart, captureMatches);
	}

	public findPreviousMatch(searchString: string, rawSearchStart: editorCommon.IPosition, isRegex: boolean, matchCase: boolean, wholeWord: boolean, captureMatches: boolean): editorCommon.FindMatch {
		this._assertNotDisposed();
		const searchStart = this.validatePosition(rawSearchStart);
		return TextModelSearch.findPreviousMatch(this, new SearchParams(searchString, isRegex, matchCase, wholeWord), searchStart, captureMatches);
	}
}

export class RawText {

	public static toRawText(textSourceOrString: editorCommon.ITextSource2 | string, opts: editorCommon.ITextModelCreationOptions): editorCommon.IRawText {
		if (typeof textSourceOrString === 'string') {
			return RawText.fromString(textSourceOrString, opts);
		} else {
			return RawText.fromTextSource(textSourceOrString, opts);
		}
	}

	public static toRawTextWithModelOptions(textSourceOrString: editorCommon.ITextSource2 | string, model: editorCommon.IModel): editorCommon.IRawText {
		if (typeof textSourceOrString === 'string') {
			return RawText.fromStringWithModelOptions(textSourceOrString, model);
		} else {
			return RawText.fromTextSourceWithModelOptions(textSourceOrString, model);
		}
	}

	public static fromString(rawText: string, opts: editorCommon.ITextModelCreationOptions): editorCommon.IRawText {
		return TextModel.toRawText(rawText, opts);
	}

	public static fromTextSource(textSource: editorCommon.ITextSource2, opts: editorCommon.ITextModelCreationOptions): editorCommon.IRawText {
		return TextModel.toRawTextFromTextSource(textSource, opts);
	}

	public static fromStringWithModelOptions(rawText: string, model: editorCommon.IModel): editorCommon.IRawText {
		let opts = model.getOptions();
		return TextModel.toRawText(rawText, {
			tabSize: opts.tabSize,
			insertSpaces: opts.insertSpaces,
			trimAutoWhitespace: opts.trimAutoWhitespace,
			detectIndentation: false,
			defaultEOL: opts.defaultEOL
		});
	}

	public static fromTextSourceWithModelOptions(textSource: editorCommon.ITextSource2, model: editorCommon.IModel): editorCommon.IRawText {
		let opts = model.getOptions();
		return TextModel.toRawTextFromTextSource(textSource, {
			tabSize: opts.tabSize,
			insertSpaces: opts.insertSpaces,
			trimAutoWhitespace: opts.trimAutoWhitespace,
			detectIndentation: false,
			defaultEOL: opts.defaultEOL
		});
	}

}
