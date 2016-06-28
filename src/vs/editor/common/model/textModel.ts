/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {OrderGuaranteeEventEmitter} from 'vs/base/common/eventEmitter';
import * as strings from 'vs/base/common/strings';
import {Position} from 'vs/editor/common/core/position';
import {Range} from 'vs/editor/common/core/range';
import * as editorCommon from 'vs/editor/common/editorCommon';
import {ModelLine} from 'vs/editor/common/model/modelLine';
import {guessIndentation} from 'vs/editor/common/model/indentationGuesser';
import {DEFAULT_INDENTATION, DEFAULT_TRIM_AUTO_WHITESPACE} from 'vs/editor/common/config/defaultConfig';
import {PrefixSumComputer} from 'vs/editor/common/viewModel/prefixSumComputer';
import {IndentRange, computeRanges} from 'vs/editor/common/model/indentRanges';

const LIMIT_FIND_COUNT = 999;
export const LONG_LINE_BOUNDARY = 1000;

export interface IParsedSearchRequest {
	regex: RegExp;
	isMultiline: boolean;
}

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

	/*protected*/ _lines:ModelLine[];
	protected _EOL:string;
	protected _isDisposed:boolean;
	protected _isDisposing:boolean;
	protected _options: editorCommon.ITextModelResolvedOptions;
	protected _lineStarts: PrefixSumComputer;
	private _indentRanges: IndentRange[];

	private _versionId:number;
	/**
	 * Unlike, versionId, this can go down (via undo) or go to previous values (via redo)
	 */
	private _alternativeVersionId: number;
	private _BOM:string;

	private _shouldSimplifyMode: boolean;
	private _shouldDenyMode: boolean;

	constructor(allowedEventTypes:string[], rawText:editorCommon.IRawText) {
		allowedEventTypes.push(editorCommon.EventType.ModelRawContentChanged, editorCommon.EventType.ModelOptionsChanged);
		super(allowedEventTypes);

		this._shouldSimplifyMode = (rawText.length > TextModel.MODEL_SYNC_LIMIT);
		this._shouldDenyMode = (rawText.length > TextModel.MODEL_TOKENIZATION_LIMIT);

		this._options = rawText.options;
		this._constructLines(rawText);
		this._setVersionId(1);
		this._isDisposed = false;
		this._isDisposing = false;
	}

	public isTooLargeForHavingAMode(): boolean {
		return this._shouldDenyMode;
	}

	public isTooLargeForHavingARichMode(): boolean {
		return this._shouldSimplifyMode;
	}

	public getOptions(): editorCommon.ITextModelResolvedOptions {
		return this._options;
	}

	public updateOptions(newOpts:editorCommon.ITextModelUpdateOptions): void {
		let somethingChanged = false;
		let changed:editorCommon.IModelOptionsChangedEvent = {
			tabSize: false,
			insertSpaces: false,
			trimAutoWhitespace: false
		};

		if (typeof newOpts.insertSpaces !== 'undefined') {
			if (this._options.insertSpaces !== newOpts.insertSpaces) {
				somethingChanged = true;
				changed.insertSpaces = true;
				this._options.insertSpaces = newOpts.insertSpaces;
			}
		}
		if (typeof newOpts.tabSize !== 'undefined') {
			let newTabSize = newOpts.tabSize | 0;
			if (this._options.tabSize !== newTabSize) {
				somethingChanged = true;
				changed.tabSize = true;
				this._options.tabSize = newTabSize;

				for (let i = 0, len = this._lines.length; i < len; i++) {
					this._lines[i].updateTabSize(newTabSize);
				}
			}
		}
		if (typeof newOpts.trimAutoWhitespace !== 'undefined') {
			if (this._options.trimAutoWhitespace !== newOpts.trimAutoWhitespace) {
				somethingChanged = true;
				changed.trimAutoWhitespace = true;
				this._options.trimAutoWhitespace = newOpts.trimAutoWhitespace;
			}
		}

		if (somethingChanged) {
			this.emit(editorCommon.EventType.ModelOptionsChanged, changed);
		}
	}

	public detectIndentation(defaultInsertSpaces:boolean, defaultTabSize:number): void {
		let lines = this._lines.map(line => line.text);
		let guessedIndentation = guessIndentation(lines, defaultTabSize, defaultInsertSpaces);
		this.updateOptions({
			insertSpaces: guessedIndentation.insertSpaces,
			tabSize: guessedIndentation.tabSize
		});
	}

	private _normalizeIndentationFromWhitespace(str:string): string {
		let tabSize = this._options.tabSize;
		let insertSpaces = this._options.insertSpaces;

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

	public normalizeIndentation(str:string): string {
		let firstNonWhitespaceIndex = strings.firstNonWhitespaceIndex(str);
		if (firstNonWhitespaceIndex === -1) {
			firstNonWhitespaceIndex = str.length;
		}
		return this._normalizeIndentationFromWhitespace(str.substring(0, firstNonWhitespaceIndex)) + str.substring(firstNonWhitespaceIndex);
	}

	public getOneIndent(): string {
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
		return this._versionId;
	}

	public getAlternativeVersionId(): number {
		return this._alternativeVersionId;
	}

	private _ensureLineStarts(): void {
		if (!this._lineStarts) {
			const lineStartValues:number[] = [];
			const eolLength = this._EOL.length;
			for (let i = 0, len = this._lines.length; i < len; i++) {
				lineStartValues.push(this._lines[i].text.length + eolLength);
			}
			this._lineStarts = new PrefixSumComputer(lineStartValues);
		}
	}

	public getOffsetAt(rawPosition: editorCommon.IPosition): number {
		let position = this.validatePosition(rawPosition);
		this._ensureLineStarts();
		return this._lineStarts.getAccumulatedValue(position.lineNumber - 2) + position.column - 1;
	}

	public getPositionAt(offset: number): Position {
		offset = Math.floor(offset);
		offset = Math.max(0, offset);

		this._ensureLineStarts();
		let out = this._lineStarts.getIndexOf(offset);

		let lineLength = this._lines[out.index].text.length;

		// Ensure we return a valid position
		return new Position(out.index + 1, Math.min(out.remainder + 1, lineLength + 1));
	}

	_increaseVersionId(): void {
		this._setVersionId(this._versionId + 1);
	}

	_setVersionId(newVersionId:number): void {
		this._versionId = newVersionId;
		this._alternativeVersionId = this._versionId;
	}

	_overwriteAlternativeVersionId(newAlternativeVersionId:number): void {
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

	_createContentChangedFlushEvent(): editorCommon.IModelContentChangedFlushEvent {
		return {
			changeType: editorCommon.EventType.ModelRawContentChangedFlush,
			detail: null,
			// TODO@Alex -> remove these fields from here
			versionId: -1,
			isUndoing: false,
			isRedoing: false
		};
	}

	protected _emitContentChanged2(startLineNumber:number, startColumn:number, endLineNumber:number, endColumn:number, rangeLength:number, text:string, isUndoing:boolean, isRedoing:boolean): void {
		var e:editorCommon.IModelContentChangedEvent2 = {
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

	_resetValue(e:editorCommon.IModelContentChangedFlushEvent, newValue:editorCommon.IRawText): void {
		this._constructLines(newValue);

		this._increaseVersionId();

		e.detail = this.toRawText();
		e.versionId = this._versionId;
	}

	public toRawText(): editorCommon.IRawText {
		return {
			BOM: this._BOM,
			EOL: this._EOL,
			lines: this.getLinesContent(),
			length: this.getValueLength(),
			options: this._options
		};
	}

	public equals(other: editorCommon.IRawText): boolean {
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

	public setValue(value:string): void {
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

	public setValueFromRawText(newValue:editorCommon.IRawText): void {
		if (newValue === null) {
			// There's nothing to do
			return;
		}
		var oldFullModelRange = this.getFullModelRange();
		var oldModelValueLength = this.getValueLengthInRange(oldFullModelRange);
		var endLineNumber = this.getLineCount();
		var endColumn = this.getLineMaxColumn(endLineNumber);
		var e = this._createContentChangedFlushEvent();

		this._resetValue(e, newValue);
		this._emitModelContentChangedFlushEvent(e);
		this._emitContentChanged2(1, 1, endLineNumber, endColumn, oldModelValueLength, this.getValue(), false, false);
	}

	public getValue(eol?:editorCommon.EndOfLinePreference, preserveBOM:boolean=false): string {
		var fullModelRange = this.getFullModelRange();
		var fullModelValue = this.getValueInRange(fullModelRange, eol);

		if (preserveBOM) {
			return this._BOM + fullModelValue;
		}

		return fullModelValue;
	}

	public getValueLength(eol?: editorCommon.EndOfLinePreference, preserveBOM: boolean = false): number {
		var fullModelRange = this.getFullModelRange();
		var fullModelValue = this.getValueLengthInRange(fullModelRange, eol);

		if (preserveBOM) {
			return this._BOM.length + fullModelValue;
		}

		return fullModelValue;
	}

	public getEmptiedValueInRange(rawRange:editorCommon.IRange, fillCharacter: string = '', eol:editorCommon.EndOfLinePreference=editorCommon.EndOfLinePreference.TextDefined): string {
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
			resultLines:string[] = [];

		resultLines.push(this._repeatCharacter(fillCharacter, this._lines[startLineIndex].text.length - range.startColumn + 1));
		for (var i = startLineIndex + 1; i < endLineIndex; i++) {
			resultLines.push(this._repeatCharacter(fillCharacter, this._lines[i].text.length));
		}
		resultLines.push(this._repeatCharacter(fillCharacter, range.endColumn - 1));

		return resultLines.join(lineEnding);
	}

	private _repeatCharacter(fillCharacter:string, count:number): string {
		var r = '';
		for (var i = 0; i < count; i++) {
			r += fillCharacter;
		}
		return r;
	}

	public getValueInRange(rawRange:editorCommon.IRange, eol:editorCommon.EndOfLinePreference=editorCommon.EndOfLinePreference.TextDefined): string {
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
			resultLines:string[] = [];

		resultLines.push(this._lines[startLineIndex].text.substring(range.startColumn - 1));
		for (var i = startLineIndex + 1; i < endLineIndex; i++) {
			resultLines.push(this._lines[i].text);
		}
		resultLines.push(this._lines[endLineIndex].text.substring(0, range.endColumn - 1));

		return resultLines.join(lineEnding);
	}

	public getValueLengthInRange(rawRange:editorCommon.IRange, eol:editorCommon.EndOfLinePreference=editorCommon.EndOfLinePreference.TextDefined): number {
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
		return this._lines.length;
	}

	public getLineContent(lineNumber:number): string {
		if (lineNumber < 1 || lineNumber > this.getLineCount()) {
			throw new Error('Illegal value ' + lineNumber + ' for `lineNumber`');
		}

		return this._lines[lineNumber - 1].text;
	}

	public getIndentLevel(lineNumber:number): number {
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
		let indentRanges = this._getIndentRanges();
		return IndentRange.deepCloneArr(indentRanges);
	}

	public getLineIndentGuide(lineNumber:number): number {
		if (lineNumber < 1 || lineNumber > this.getLineCount()) {
			throw new Error('Illegal value ' + lineNumber + ' for `lineNumber`');
		}

		let indentRanges = this._getIndentRanges();

		for (let i = indentRanges.length - 1; i >= 0; i--) {
			let rng = indentRanges[i];

			if (rng.startLineNumber < lineNumber && lineNumber <= rng.endLineNumber) {
				return 1 + Math.floor(rng.indent / this._options.tabSize);
			}
		}

		return 0;
	}

	public getLinesContent(): string[] {
		var r: string[] = [];
		for (var i = 0, len = this._lines.length; i < len; i++) {
			r[i] = this._lines[i].text;
		}
		return r;
	}

	public getEOL(): string {
		return this._EOL;
	}

	public setEOL(eol: editorCommon.EndOfLineSequence): void {
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

		var e = this._createContentChangedFlushEvent();
		e.detail = this.toRawText();
		e.versionId = this._versionId;

		this._emitModelContentChangedFlushEvent(e);
		this._emitContentChanged2(1, 1, endLineNumber, endColumn, oldModelValueLength, this.getValue(), false, false);
	}

	public getLineMinColumn(lineNumber:number): number {
		return 1;
	}

	public getLineMaxColumn(lineNumber:number): number {
		if (lineNumber < 1 || lineNumber > this.getLineCount()) {
			throw new Error('Illegal value ' + lineNumber + ' for `lineNumber`');
		}

		return this._lines[lineNumber - 1].text.length + 1;
	}

	public getLineFirstNonWhitespaceColumn(lineNumber: number): number {
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
		if (lineNumber < 1 || lineNumber > this.getLineCount()) {
			throw new Error('Illegal value ' + lineNumber + ' for `lineNumber`');
		}

		var result = strings.lastNonWhitespaceIndex(this._lines[lineNumber - 1].text);
		if (result === -1) {
			return 0;
		}
		return result + 2;
	}

	public validateLineNumber(lineNumber:number): number {
		if (lineNumber < 1) {
			lineNumber = 1;
		}
		if (lineNumber > this._lines.length) {
			lineNumber = this._lines.length;
		}
		return lineNumber;
	}

	public validatePosition(position:editorCommon.IPosition): Position {
		var lineNumber = position.lineNumber ? position.lineNumber : 1;
		var column = position.column ? position.column : 1;

		if (lineNumber < 1) {
			lineNumber = 1;
			column = 1;
		}
		else if (lineNumber > this._lines.length) {
			lineNumber = this._lines.length;
			column = this.getLineMaxColumn(lineNumber);
		}
		else {
			var maxColumn = this.getLineMaxColumn(lineNumber);
			if (column < 1) {
				column = 1;
			}
			else if (column > maxColumn) {
				column = maxColumn;
			}
		}

		return new Position(lineNumber, column);
	}

	public validateRange(range:editorCommon.IRange): Range {
		var start = this.validatePosition(new Position(range.startLineNumber, range.startColumn));
		var end = this.validatePosition(new Position(range.endLineNumber, range.endColumn));
		return new Range(start.lineNumber, start.column, end.lineNumber, end.column);
	}

	public modifyPosition(rawPosition: editorCommon.IPosition, offset: number) : Position {
		return this.getPositionAt(this.getOffsetAt(rawPosition) + offset);
	}

	public getFullModelRange(): Range {
		var lineCount = this.getLineCount();
		return new Range(1, 1, lineCount, this.getLineMaxColumn(lineCount));
	}

	_emitModelContentChangedFlushEvent(e:editorCommon.IModelContentChangedFlushEvent): void {
		if (!this._isDisposing) {
			this.emit(editorCommon.EventType.ModelRawContentChanged, e);
		}
	}

	public static toRawText(rawText:string, opts:editorCommon.ITextModelCreationOptions): editorCommon.IRawText {
		// Count the number of lines that end with \r\n
		var carriageReturnCnt = 0,
			lastCarriageReturnIndex = -1;
		while ((lastCarriageReturnIndex = rawText.indexOf('\r', lastCarriageReturnIndex + 1)) !== -1) {
			carriageReturnCnt++;
		}

		// Split the text into lines
		var lines = rawText.split(/\r\n|\r|\n/);

		// Remove the BOM (if present)
		var BOM = '';
		if (strings.startsWithUTF8BOM(lines[0])) {
			BOM = strings.UTF8_BOM_CHARACTER;
			lines[0] = lines[0].substr(1);
		}

		var lineFeedCnt = lines.length - 1;
		var EOL = '';
		if (lineFeedCnt === 0) {
			// This is an empty file or a file with precisely one line
			EOL = (opts.defaultEOL === editorCommon.DefaultEndOfLine.LF ? '\n' : '\r\n');
		} else if (carriageReturnCnt > lineFeedCnt / 2) {
			// More than half of the file contains \r\n ending lines
			EOL = '\r\n';
		} else {
			// At least one line more ends in \n
			EOL = '\n';
		}

		let resolvedOpts: editorCommon.ITextModelResolvedOptions;
		if (opts.detectIndentation) {
			let guessedIndentation = guessIndentation(lines, opts.tabSize, opts.insertSpaces);
			resolvedOpts = {
				tabSize: guessedIndentation.tabSize,
				insertSpaces: guessedIndentation.insertSpaces,
				trimAutoWhitespace: opts.trimAutoWhitespace,
				defaultEOL: opts.defaultEOL
			};
		} else {
			resolvedOpts = {
				tabSize: opts.tabSize,
				insertSpaces: opts.insertSpaces,
				trimAutoWhitespace: opts.trimAutoWhitespace,
				defaultEOL: opts.defaultEOL
			};
		}

		return {
			BOM: BOM,
			EOL: EOL,
			lines: lines,
			length: rawText.length,
			options: resolvedOpts
		};
	}

	_constructLines(rawText:editorCommon.IRawText): void {
		const tabSize = rawText.options.tabSize;
		let rawLines = rawText.lines;
		let modelLines: ModelLine[] = [];

		for (let i = 0, len = rawLines.length; i < len; i++) {
			modelLines[i] = new ModelLine(i + 1, rawLines[i], tabSize);
		}
		this._BOM = rawText.BOM;
		this._EOL = rawText.EOL;
		this._lines = modelLines;
		this._lineStarts = null;
		this._resetIndentRanges();
	}

	private _getEndOfLine(eol:editorCommon.EndOfLinePreference): string {
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

	private static _isMultiline(searchString:string): boolean {
		const BACKSLASH_CHAR_CODE = '\\'.charCodeAt(0);
		const n_CHAR_CODE = 'n'.charCodeAt(0);
		const r_CHAR_CODE = 'r'.charCodeAt(0);

		if (!searchString || searchString.length === 0) {
			return false;
		}

		for (let i = 0, len = searchString.length; i < len; i++) {
			let chCode = searchString.charCodeAt(i);

			if (chCode === BACKSLASH_CHAR_CODE) {

				// move to next char
				i++;

				if (i >= len) {
					// string ends with a \
					break;
				}

				let nextChCode = searchString.charCodeAt(i);
				if (nextChCode === n_CHAR_CODE || nextChCode === r_CHAR_CODE) {
					return true;
				}
			}
		}

		return false;
	}

	public static parseSearchRequest(searchString:string, isRegex:boolean, matchCase:boolean, wholeWord:boolean): IParsedSearchRequest {
		if (searchString === '') {
			return null;
		}

		// Try to create a RegExp out of the params
		var regex:RegExp = null;
		try {
			regex = strings.createRegExp(searchString, isRegex, matchCase, wholeWord, true);
		} catch (err) {
			return null;
		}

		if (!regex) {
			return null;
		}

		return {
			regex: regex,
			isMultiline: isRegex && TextModel._isMultiline(searchString)
		};
	}

	public findMatches(searchString:string, rawSearchScope:any, isRegex:boolean, matchCase:boolean, wholeWord:boolean, limitResultCount:number = LIMIT_FIND_COUNT): Range[] {
		let r = TextModel.parseSearchRequest(searchString, isRegex, matchCase, wholeWord);
		if (!r) {
			return [];
		}

		let searchRange:Range;
		if (Range.isIRange(rawSearchScope)) {
			searchRange = rawSearchScope;
		} else {
			searchRange = this.getFullModelRange();
		}

		if (r.isMultiline) {
			return this._doFindMatchesMultiline(searchRange, r.regex, limitResultCount);
		}
		return this._doFindMatchesLineByLine(searchRange, r.regex, limitResultCount);
	}

	private _doFindMatchesMultiline(searchRange:Range, searchRegex:RegExp, limitResultCount:number): Range[] {
		let deltaOffset = this.getOffsetAt(searchRange.getStartPosition());
		let text = this.getValueInRange(searchRange);

		let result: Range[] = [];
		let prevStartOffset = 0;
		let prevEndOffset = 0;
		let counter = 0;

		let m:RegExpExecArray;
		while ((m = searchRegex.exec(text))) {
			let startOffset = deltaOffset + m.index;
			let endOffset = startOffset + m[0].length;

			if (prevStartOffset === startOffset && prevEndOffset === endOffset) {
				// Exit early if the regex matches the same range
				return result;
			}

			let startPosition = this.getPositionAt(startOffset);
			let endPosition = this.getPositionAt(endOffset);

			result[counter++] = new Range(startPosition.lineNumber, startPosition.column, endPosition.lineNumber, endPosition.column);
			if (counter >= limitResultCount) {
				return result;
			}

			prevStartOffset = startOffset;
			prevEndOffset = endOffset;
		}

		return result;
	}

	private _doFindMatchesLineByLine(searchRange:Range, searchRegex:RegExp, limitResultCount:number): Range[] {
		let result:Range[] = [];
		let text: string;
		let counter = 0;

		// Early case for a search range that starts & stops on the same line number
		if (searchRange.startLineNumber === searchRange.endLineNumber) {
			text = this._lines[searchRange.startLineNumber - 1].text.substring(searchRange.startColumn - 1, searchRange.endColumn - 1);
			counter = this._findMatchesInLine(searchRegex, text, searchRange.startLineNumber, searchRange.startColumn - 1, counter, result, limitResultCount);
			return result;
		}

		// Collect results from first line
		text = this._lines[searchRange.startLineNumber - 1].text.substring(searchRange.startColumn - 1);
		counter = this._findMatchesInLine(searchRegex, text, searchRange.startLineNumber, searchRange.startColumn - 1, counter, result, limitResultCount);

		// Collect results from middle lines
		for (let lineNumber = searchRange.startLineNumber + 1; lineNumber < searchRange.endLineNumber && counter < limitResultCount; lineNumber++) {
			counter = this._findMatchesInLine(searchRegex, this._lines[lineNumber - 1].text, lineNumber, 0, counter, result, limitResultCount);
		}

		// Collect results from last line
		if (counter < limitResultCount) {
			text = this._lines[searchRange.endLineNumber - 1].text.substring(0, searchRange.endColumn - 1);
			counter = this._findMatchesInLine(searchRegex, text, searchRange.endLineNumber, 0, counter, result, limitResultCount);
		}

		return result;
	}

	public findNextMatch(searchString:string, rawSearchStart:editorCommon.IPosition, isRegex:boolean, matchCase:boolean, wholeWord:boolean): Range {
		let r = TextModel.parseSearchRequest(searchString, isRegex, matchCase, wholeWord);
		if (!r) {
			return null;
		}

		let searchStart = this.validatePosition(rawSearchStart);
		if (r.isMultiline) {
			return this._doFindNextMatchMultiline(searchStart, r.regex);
		}
		return this._doFindNextMatchLineByLine(searchStart, r.regex);

	}

	private _doFindNextMatchMultiline(searchStart:Position, searchRegex:RegExp): Range {
		let deltaOffset = this.getOffsetAt(searchStart);
		let text = this.getValueInRange(new Range(searchStart.lineNumber, searchStart.column, this.getLineCount(), this.getLineMaxColumn(this.getLineCount())));

		let m = searchRegex.exec(text);
		if (m) {
			let startOffset = deltaOffset + m.index;
			let endOffset = startOffset + m[0].length;
			let startPosition = this.getPositionAt(startOffset);
			let endPosition = this.getPositionAt(endOffset);
			return new Range(startPosition.lineNumber, startPosition.column, endPosition.lineNumber, endPosition.column);
		}

		if (searchStart.lineNumber !== 1 || searchStart.column !== -1) {
			// Try again from the top
			return this._doFindNextMatchMultiline(new Position(1, 1), searchRegex);
		}

		return null;
	}

	private _doFindNextMatchLineByLine(searchStart:Position, searchRegex:RegExp): Range {
		let lineCount = this.getLineCount();
		let startLineNumber = searchStart.lineNumber;
		let text: string;
		let r: Range;

		// Look in first line
		text = this._lines[startLineNumber - 1].text.substring(searchStart.column - 1);
		r = this._findFirstMatchInLine(searchRegex, text, startLineNumber, searchStart.column - 1);
		if (r) {
			return r;
		}

		for (let i = 1; i <= lineCount; i++) {
			let lineIndex = (startLineNumber + i - 1) % lineCount;
			text = this._lines[lineIndex].text;
			r = this._findFirstMatchInLine(searchRegex, text, lineIndex + 1, 0);
			if (r) {
				return r;
			}
		}

		return null;
	}

	public findPreviousMatch(searchString:string, rawSearchStart:editorCommon.IPosition, isRegex:boolean, matchCase:boolean, wholeWord:boolean): Range {
		let r = TextModel.parseSearchRequest(searchString, isRegex, matchCase, wholeWord);
		if (!r) {
			return null;
		}

		let searchStart = this.validatePosition(rawSearchStart);
		if (r.isMultiline) {
			return this._doFindPreviousMatchMultiline(searchStart, r.regex);
		}
		return this._doFindPreviousMatchLineByLine(searchStart, r.regex);
	}

	private _doFindPreviousMatchMultiline(searchStart:Position, searchRegex:RegExp): Range {
		let matches = this._doFindMatchesMultiline(new Range(1, 1, searchStart.lineNumber, searchStart.column), searchRegex, 10 * LIMIT_FIND_COUNT);
		if (matches.length > 0) {
			return matches[matches.length - 1];
		}

		if (searchStart.lineNumber !== this.getLineCount() || searchStart.column !== this.getLineMaxColumn(this.getLineCount())) {
			// Try again with all content
			return this._doFindPreviousMatchMultiline(new Position(this.getLineCount(), this.getLineMaxColumn(this.getLineCount())), searchRegex);
		}

		return null;
	}

	private _doFindPreviousMatchLineByLine(searchStart:Position, searchRegex:RegExp): Range {
		let lineCount = this.getLineCount();
		let startLineNumber = searchStart.lineNumber;
		let text: string;
		let r: Range;

		// Look in first line
		text = this._lines[startLineNumber - 1].text.substring(0, searchStart.column - 1);
		r = this._findLastMatchInLine(searchRegex, text, startLineNumber);
		if (r) {
			return r;
		}

		for (var i = 1; i <= lineCount; i++) {
			var lineIndex = (lineCount + startLineNumber - i - 1) % lineCount;
			text = this._lines[lineIndex].text;
			r = this._findLastMatchInLine(searchRegex, text, lineIndex + 1);
			if (r) {
				return r;
			}
		}

		return null;
	}

	private _findFirstMatchInLine(searchRegex:RegExp, text:string, lineNumber:number, deltaOffset:number): Range {
		var m = searchRegex.exec(text);
		if (!m) {
			return null;
		}
		return new Range(lineNumber, m.index + 1 + deltaOffset, lineNumber, m.index + 1 + m[0].length + deltaOffset);
	}

	private _findLastMatchInLine(searchRegex:RegExp, text:string, lineNumber:number): Range {
		let bestResult: Range = null;
		let m:RegExpExecArray;
		while ((m = searchRegex.exec(text))) {
			let result = new Range(lineNumber, m.index + 1, lineNumber, m.index + 1 + m[0].length);
			if (result.equalsRange(bestResult)) {
				break;
			}
			bestResult = result;
		}
		return bestResult;
	}

	private _findMatchesInLine(searchRegex:RegExp, text:string, lineNumber:number, deltaOffset:number, counter:number, result:Range[], limitResultCount:number): number {
		var m:RegExpExecArray;
		// Reset regex to search from the beginning
		searchRegex.lastIndex = 0;
		do {
			m = searchRegex.exec(text);
			if (m) {
				var range = new Range(lineNumber, m.index + 1 + deltaOffset, lineNumber, m.index + 1 + m[0].length + deltaOffset);
				// Exit early if the regex matches the same range
				if (range.equalsRange(result[result.length - 1])) {
					return counter;
				}
				result.push(range);
				counter++;
				if (counter >= limitResultCount) {
					return counter;
				}
			}
		} while(m);
		return counter;
	}
}

export class RawText {

	public static fromString(rawText:string, opts:editorCommon.ITextModelCreationOptions): editorCommon.IRawText {
		return TextModel.toRawText(rawText, opts);
	}

	public static fromStringWithModelOptions(rawText:string, model:editorCommon.IModel): editorCommon.IRawText {
		let opts = model.getOptions();
		return TextModel.toRawText(rawText, {
			tabSize: opts.tabSize,
			insertSpaces: opts.insertSpaces,
			trimAutoWhitespace: opts.trimAutoWhitespace,
			detectIndentation: false,
			defaultEOL: opts.defaultEOL
		});
	}

}
