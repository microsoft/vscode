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
import {DEFAULT_INDENTATION} from 'vs/editor/common/config/defaultConfig';

var LIMIT_FIND_COUNT = 999;

export class TextModel extends OrderGuaranteeEventEmitter implements editorCommon.ITextModel {

	public static DEFAULT_CREATION_OPTIONS: editorCommon.ITextModelCreationOptions = {
		tabSize: DEFAULT_INDENTATION.tabSize,
		insertSpaces: DEFAULT_INDENTATION.insertSpaces,
		detectIndentation: false,
		defaultEOL: editorCommon.DefaultEndOfLine.LF
	};

	_lines:ModelLine[];
	_EOL:string;
	_isDisposed:boolean;
	_isDisposing:boolean;
	protected _options: editorCommon.ITextModelResolvedOptions;

	private _versionId:number;
	/**
	 * Unlike, versionId, this can go down (via undo) or go to previous values (via redo)
	 */
	private _alternativeVersionId: number;
	private _BOM:string;

	constructor(allowedEventTypes:string[], rawText:editorCommon.IRawText) {
		allowedEventTypes.push(editorCommon.EventType.ModelContentChanged, editorCommon.EventType.ModelOptionsChanged);
		super(allowedEventTypes);

		this._options = rawText.options;
		this._constructLines(rawText);
		this._setVersionId(1);
		this._isDisposed = false;
		this._isDisposing = false;
	}

	public getOptions(): editorCommon.ITextModelResolvedOptions {
		if (this._isDisposed) {
			throw new Error('TextModel.getOptions: Model is disposed');
		}

		return this._options;
	}

	public updateOptions(newOpts:editorCommon.ITextModelUpdateOptions): void {
		let somethingChanged = false;
		let changed:editorCommon.IModelOptionsChangedEvent = {
			tabSize: false,
			insertSpaces: false
		};

		if (typeof newOpts.insertSpaces !== 'undefined') {
			if (this._options.insertSpaces !== newOpts.insertSpaces) {
				somethingChanged = true;
				changed.insertSpaces = true;
				this._options.insertSpaces = newOpts.insertSpaces;
			}
		}
		if (typeof newOpts.tabSize !== 'undefined') {
			if (this._options.tabSize !== newOpts.tabSize) {
				somethingChanged = true;
				changed.tabSize = true;
				this._options.tabSize = newOpts.tabSize;
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
		if (this._isDisposed) {
			throw new Error('TextModel.getVersionId: Model is disposed');
		}

		return this._versionId;
	}

	public getAlternativeVersionId(): number {
		if (this._isDisposed) {
			throw new Error('TextModel.getAlternativeVersionId: Model is disposed');
		}

		return this._alternativeVersionId;
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
		if (this._isDisposed) {
			throw new Error('TextModel.dispose: Model is disposed');
		}

		this._isDisposed = true;
		// Null out members, such that any use of a disposed model will throw exceptions sooner rather than later
		this._lines = null;
		this._EOL = null;
		this._BOM = null;

		super.dispose();
	}

	_createContentChangedFlushEvent(): editorCommon.IModelContentChangedFlushEvent {
		return {
			changeType: editorCommon.EventType.ModelContentChangedFlush,
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
		if (this._isDisposed) {
			throw new Error('TextModel.setValue: Model is disposed');
		}
		let rawText: editorCommon.IRawText = null;
		if (value !== null) {
			rawText = TextModel.toRawText(value, {
				tabSize: this._options.tabSize,
				insertSpaces: this._options.insertSpaces,
				detectIndentation: false,
				defaultEOL: this._options.defaultEOL
			});
		}
		this.setValueFromRawText(rawText);
	}

	public setValueFromRawText(newValue:editorCommon.IRawText): void {
		if (this._isDisposed) {
			throw new Error('TextModel.setValueFromRawText: Model is disposed');
		}

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
		if (this._isDisposed) {
			throw new Error('TextModel.getValue: Model is disposed');
		}

		var fullModelRange = this.getFullModelRange();
		var fullModelValue = this.getValueInRange(fullModelRange, eol);

		if (preserveBOM) {
			return this._BOM + fullModelValue;
		}

		return fullModelValue;
	}

	public getValueLength(eol?: editorCommon.EndOfLinePreference, preserveBOM: boolean = false): number {
		if (this._isDisposed) {
			throw new Error('TextModel.getValueLength: Model is disposed');
		}

		var fullModelRange = this.getFullModelRange();
		var fullModelValue = this.getValueLengthInRange(fullModelRange, eol);

		if (preserveBOM) {
			return this._BOM.length + fullModelValue;
		}

		return fullModelValue;
	}

	public getEmptiedValueInRange(rawRange:editorCommon.IRange, fillCharacter: string = '', eol:editorCommon.EndOfLinePreference=editorCommon.EndOfLinePreference.TextDefined): string {
		if (this._isDisposed) {
			throw new Error('TextModel.getEmptiedValueInRange: Model is disposed');
		}

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
		if (this._isDisposed) {
			throw new Error('TextModel.getValueInRange: Model is disposed');
		}

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
		if (this._isDisposed) {
			throw new Error('TextModel.getValueInRange: Model is disposed');
		}

		var range = this.validateRange(rawRange);

		if (range.isEmpty()) {
			return 0;
		}

		if (range.startLineNumber === range.endLineNumber) {
			return (range.endColumn - range.startColumn);
		}

		var lineEndingLength = this._getEndOfLine(eol).length,
			startLineIndex = range.startLineNumber - 1,
			endLineIndex = range.endLineNumber - 1,
			result = 0;

		result += (this._lines[startLineIndex].text.length - range.startColumn + 1);
		for (var i = startLineIndex + 1; i < endLineIndex; i++) {
			result += lineEndingLength + this._lines[i].text.length;
		}
		result += lineEndingLength + (range.endColumn - 1);

		return result;
	}

	public isDominatedByLongLines(longLineBoundary:number): boolean {
		if (this._isDisposed) {
			throw new Error('TextModel.isDominatedByLongLines: Model is disposed');
		}

		var smallLineCharCount = 0,
			longLineCharCount = 0,
			i: number,
			len: number,
			lines = this._lines,
			lineLength: number;

		for (i = 0, len = this._lines.length; i < len; i++) {
			lineLength = lines[i].text.length;
			if (lineLength >= longLineBoundary) {
				longLineCharCount += lineLength;
			} else {
				smallLineCharCount += lineLength;
			}
		}

		return (longLineCharCount > smallLineCharCount);
	}

	public getLineCount(): number {
		if (this._isDisposed) {
			throw new Error('TextModel.getLineCount: Model is disposed');
		}

		return this._lines.length;
	}

	public getLineContent(lineNumber:number): string {
		if (this._isDisposed) {
			throw new Error('TextModel.getLineContent: Model is disposed');
		}
		if (lineNumber < 1 || lineNumber > this.getLineCount()) {
			throw new Error('Illegal value ' + lineNumber + ' for `lineNumber`');
		}

		return this._lines[lineNumber - 1].text;
	}

	public getLinesContent(): string[] {
		if (this._isDisposed) {
			throw new Error('TextModel.getLineContent: Model is disposed');
		}

		var r: string[] = [];
		for (var i = 0, len = this._lines.length; i < len; i++) {
			r[i] = this._lines[i].text;
		}
		return r;
	}

	public getEOL(): string {
		if (this._isDisposed) {
			throw new Error('TextModel.getEOL: Model is disposed');
		}

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
		if (this._isDisposed) {
			throw new Error('TextModel.getLineMaxColumn: Model is disposed');
		}
		if (lineNumber < 1 || lineNumber > this.getLineCount()) {
			throw new Error('Illegal value ' + lineNumber + ' for `lineNumber`');
		}

		return this._lines[lineNumber - 1].text.length + 1;
	}

	public getLineFirstNonWhitespaceColumn(lineNumber: number): number {
		if (this._isDisposed) {
			throw new Error('TextModel.getLineFirstNonWhitespaceColumn: Model is disposed');
		}
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
		if (this._isDisposed) {
			throw new Error('TextModel.getLineLastNonWhitespaceColumn: Model is disposed');
		}
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
		if (this._isDisposed) {
			throw new Error('TextModel.validateLineNumber: Model is disposed');
		}

		if (lineNumber < 1) {
			lineNumber = 1;
		}
		if (lineNumber > this._lines.length) {
			lineNumber = this._lines.length;
		}
		return lineNumber;
	}

	public validatePosition(position:editorCommon.IPosition): editorCommon.IEditorPosition {
		if (this._isDisposed) {
			throw new Error('TextModel.validatePosition: Model is disposed');
		}

		var lineNumber = position.lineNumber ? position.lineNumber : 1;
		var column = position.column ? position.column : 1;

		if (lineNumber < 1) {
			lineNumber = 1;
		}
		if (lineNumber > this._lines.length) {
			lineNumber = this._lines.length;
		}

		if (column < 1) {
			column = 1;
		}
		var maxColumn = this.getLineMaxColumn(lineNumber);
		if (column > maxColumn) {
			column = maxColumn;
		}

		return new Position(lineNumber, column);
	}

	public validateRange(range:editorCommon.IRange): editorCommon.IEditorRange {
		if (this._isDisposed) {
			throw new Error('TextModel.validateRange: Model is disposed');
		}

		var start = this.validatePosition(new Position(range.startLineNumber, range.startColumn));
		var end = this.validatePosition(new Position(range.endLineNumber, range.endColumn));
		return new Range(start.lineNumber, start.column, end.lineNumber, end.column);
	}

	public modifyPosition(rawPosition: editorCommon.IPosition, offset: number) : editorCommon.IEditorPosition {
		if (this._isDisposed) {
			throw new Error('TextModel.modifyPosition: Model is disposed');
		}

		var position = this.validatePosition(rawPosition);

		// Handle positive offsets, one line at a time
		while (offset > 0) {
			var maxColumn = this.getLineMaxColumn(position.lineNumber);

			// Get to end of line
			if (position.column < maxColumn) {
				var subtract = Math.min(offset, maxColumn - position.column);
				offset -= subtract;
				position.column += subtract;
			}

			if (offset === 0) {
				break;
			}

			// Go to next line
			offset -= this._EOL.length;
			if (offset < 0) {
				throw new Error('TextModel.modifyPosition: Breaking line terminators');
			}

			++position.lineNumber;
			if (position.lineNumber > this._lines.length) {
				throw new Error('TextModel.modifyPosition: Offset goes beyond the end of the model');
			}

			position.column = 1;
		}

		// Handle negative offsets, one line at a time
		while (offset < 0) {

			// Get to the start of the line
			if (position.column > 1) {
				var add = Math.min(-offset, position.column - 1);
				offset += add;
				position.column -= add;
			}

			if (offset === 0) {
				break;
			}

			// Go to the previous line
			offset += this._EOL.length;
			if (offset > 0) {
				throw new Error('TextModel.modifyPosition: Breaking line terminators');
			}

			--position.lineNumber;
			if (position.lineNumber < 1) {
				throw new Error('TextModel.modifyPosition: Offset goes beyond the beginning of the model');
			}

			position.column = this.getLineMaxColumn(position.lineNumber);
		}

		return position;
	}

	public getFullModelRange(): editorCommon.IEditorRange {
		if (this._isDisposed) {
			throw new Error('TextModel.getFullModelRange: Model is disposed');
		}

		var lineCount = this.getLineCount();
		return new Range(1, 1, lineCount, this.getLineMaxColumn(lineCount));
	}

	_emitModelContentChangedFlushEvent(e:editorCommon.IModelContentChangedFlushEvent): void {
		if (!this._isDisposing) {
			this.emit(editorCommon.EventType.ModelContentChanged, e);
		}
	}

	public static toRawText(rawText:string, opts:editorCommon.ITextModelCreationOptions): editorCommon.IRawText {
		// Count the number of lines that end with \r\n
		var carriageReturnCnt = 0,
			lastCarriageReturnIndex = -1;
		while ((lastCarriageReturnIndex = rawText.indexOf('\r', lastCarriageReturnIndex + 1)) !== -1) {
			carriageReturnCnt++;
		}

		// Split the text into liens
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
				defaultEOL: opts.defaultEOL
			};
		} else {
			resolvedOpts = {
				tabSize: opts.tabSize,
				insertSpaces: opts.insertSpaces,
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
		var rawLines = rawText.lines,
			modelLines: ModelLine[] = [],
			i: number,
			len: number;

		for (i = 0, len = rawLines.length; i < len; i++) {
			modelLines.push(new ModelLine(i + 1, rawLines[i]));
		}
		this._BOM = rawText.BOM;
		this._EOL = rawText.EOL;
		this._lines = modelLines;
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

	public findMatches(searchString:string, rawSearchScope:any, isRegex:boolean, matchCase:boolean, wholeWord:boolean, limitResultCount:number = LIMIT_FIND_COUNT): editorCommon.IEditorRange[] {
		if (this._isDisposed) {
			throw new Error('Model.findMatches: Model is disposed');
		}

		var regex = strings.createSafeRegExp(searchString, isRegex, matchCase, wholeWord);
		if (!regex) {
			return [];
		}

		var searchRange:editorCommon.IEditorRange;
		if (Range.isIRange(rawSearchScope)) {
			searchRange = rawSearchScope;
		} else {
			searchRange = this.getFullModelRange();
		}

		return this._doFindMatches(searchRange, regex, limitResultCount);
	}

	public findNextMatch(searchString:string, rawSearchStart:editorCommon.IPosition, isRegex:boolean, matchCase:boolean, wholeWord:boolean): editorCommon.IEditorRange {
		if (this._isDisposed) {
			throw new Error('Model.findNextMatch: Model is disposed');
		}

		var regex = strings.createSafeRegExp(searchString, isRegex, matchCase, wholeWord);
		if (!regex) {
			return null;
		}

		var searchStart = this.validatePosition(rawSearchStart),
			lineCount = this.getLineCount(),
			startLineNumber = searchStart.lineNumber,
			text: string,
			r: editorCommon.IEditorRange;

		// Look in first line
		text = this._lines[startLineNumber - 1].text.substring(searchStart.column - 1);
		r = this._findMatchInLine(regex, text, startLineNumber, searchStart.column - 1);
		if (r) {
			return r;
		}

		for (var i = 1; i <= lineCount; i++) {
			var lineIndex = (startLineNumber + i - 1) % lineCount;
			text = this._lines[lineIndex].text;
			r = this._findMatchInLine(regex, text, lineIndex + 1, 0);
			if (r) {
				return r;
			}
		}

		return null;
	}

	public findPreviousMatch(searchString:string, rawSearchStart:editorCommon.IPosition, isRegex:boolean, matchCase:boolean, wholeWord:boolean): editorCommon.IEditorRange {
		if (this._isDisposed) {
			throw new Error('Model.findPreviousMatch: Model is disposed');
		}

		var regex = strings.createSafeRegExp(searchString, isRegex, matchCase, wholeWord);
		if (!regex) {
			return null;
		}

		var searchStart = this.validatePosition(rawSearchStart),
			lineCount = this.getLineCount(),
			startLineNumber = searchStart.lineNumber,
			text: string,
			r: editorCommon.IEditorRange;

		// Look in first line
		text = this._lines[startLineNumber - 1].text.substring(0, searchStart.column - 1);
		r = this._findLastMatchInLine(regex, text, startLineNumber);
		if (r) {
			return r;
		}

		for (var i = 1; i <= lineCount; i++) {
			var lineIndex = (lineCount + startLineNumber - i - 1) % lineCount;
			text = this._lines[lineIndex].text;
			r = this._findLastMatchInLine(regex, text, lineIndex + 1);
			if (r) {
				return r;
			}
		}

		return null;
	}

	private _doFindMatches(searchRange:editorCommon.IEditorRange, searchRegex:RegExp, limitResultCount:number): editorCommon.IEditorRange[] {
		var result:editorCommon.IEditorRange[] = [],
			text: string,
			counter = 0;

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
		for (var lineNumber = searchRange.startLineNumber + 1; lineNumber < searchRange.endLineNumber && counter < limitResultCount; lineNumber++) {
			counter = this._findMatchesInLine(searchRegex, this._lines[lineNumber - 1].text, lineNumber, 0, counter, result, limitResultCount);
		}

		// Collect results from last line
		if (counter < limitResultCount) {
			text = this._lines[searchRange.endLineNumber - 1].text.substring(0, searchRange.endColumn - 1);
			counter = this._findMatchesInLine(searchRegex, text, searchRange.endLineNumber, 0, counter, result, limitResultCount);
		}

		return result;
	}

	private _findMatchInLine(searchRegex:RegExp, text:string, lineNumber:number, deltaOffset:number): editorCommon.IEditorRange {
		var m = searchRegex.exec(text);
		if (!m) {
			return null;
		}
		return new Range(lineNumber, m.index + 1 + deltaOffset, lineNumber, m.index + 1 + m[0].length + deltaOffset);
	}

	private _findLastMatchInLine(searchRegex:RegExp, text:string, lineNumber:number): editorCommon.IEditorRange {
		let bestResult: editorCommon.IEditorRange = null;
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

	private _findMatchesInLine(searchRegex:RegExp, text:string, lineNumber:number, deltaOffset:number, counter:number, result:editorCommon.IEditorRange[], limitResultCount:number): number {
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
			detectIndentation: false,
			defaultEOL: opts.defaultEOL
		});
	}

}