/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {OrderGuaranteeEventEmitter} from 'vs/base/common/eventEmitter';
import * as platform from 'vs/base/common/platform';
import * as strings from 'vs/base/common/strings';
import {Position} from 'vs/editor/common/core/position';
import {Range} from 'vs/editor/common/core/range';
import * as editorCommon from 'vs/editor/common/editorCommon';
import {ModelLine} from 'vs/editor/common/model/modelLine';

var __space = ' '.charCodeAt(0);
var __tab = '\t'.charCodeAt(0);
var LIMIT_FIND_COUNT = 999;
var DEFAULT_PLATFORM_EOL = (platform.isLinux || platform.isMacintosh) ? '\n' : '\r\n';

export interface IIndentationFactors {
	/**
	 * The number of lines that are indented with tabs
	 */
	linesIndentedWithTabs:number;
	/**
	 * relativeSpaceCounts[i] contains the number of times (i spaces) have been encountered in a relative indentation
	 */
	relativeSpaceCounts:number[];
	/**
	 * absoluteSpaceCounts[i] contains the number of times (i spaces) have been encounted in an indentation
	 */
	absoluteSpaceCounts:number[];
}

export class TextModel extends OrderGuaranteeEventEmitter implements editorCommon.ITextModel {

	_lines:ModelLine[];
	_EOL:string;
	_isDisposed:boolean;
	_isDisposing:boolean;

	private _versionId:number;
	/**
	 * Unlike, versionId, this can go down (via undo) or go to previous values (via redo)
	 */
	private _alternativeVersionId: number;
	private _BOM:string;

	constructor(allowedEventTypes:string[], rawText:editorCommon.IRawText) {
		allowedEventTypes.push(editorCommon.EventType.ModelContentChanged);
		super(allowedEventTypes);

		this._constructLines(rawText);
		this._setVersionId(1);
		this._isDisposed = false;
		this._isDisposing = false;
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

	_resetValue(e:editorCommon.IModelContentChangedFlushEvent, newValue:string): void {
		this._constructLines(TextModel.toRawText(newValue));
		this._increaseVersionId();

		e.detail = this.toRawText();
		e.versionId = this._versionId;
	}

	public toRawText(): editorCommon.IRawText {
		return {
			BOM: this._BOM,
			EOL: this._EOL,
			lines: this.getLinesContent(),
			length: this.getValueLength()
		};
	}

	public setValue(newValue:string): void {
		if (this._isDisposed) {
			throw new Error('TextModel.setValue: Model is disposed');
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

	_extractIndentationFactors(): IIndentationFactors {

		var i:number,
			len:number,
			j:number,
			lenJ:number,
			charCode:number,
			prevLineCharCode:number,
			lines = this._lines,
			/**
			 * text on current line
			 */
			currentLineText: string,
			/**
			 * the content of the previous line that had non whitespace characters
			 */
			previousLineTextWithContent = '',
			/**
			 * the char index at which `previousLineTextWithContent` has a non whitespace character
			 */
			previousLineIndentation = 0,
			/**
			 * does `currentLineText` have non whitespace characters?
			 */
			currentLineHasContent:boolean,
			/**
			 * the char index at which `currentLineText` has a non whitespace character
			 */
			currentLineIndentation:number,
			/**
			 * relativeSpaceCounts[i] contains the number of times (i spaces) have been encountered in a relative indentation
			 */
			relativeSpaceCounts:number[] = [],
			/**
			 * The total number of tabs that appear in indentations
			 */
			linesIndentedWithTabs:number = 0,
			/**
			 * absoluteSpaceCounts[i] contains the number of times (i spaces) have been encounted in an indentation
			 */
			absoluteSpaceCounts:number[] = [],
			tmpTabCounts: number,
			tmpSpaceCounts: number;

		for (i = 0, len = lines.length; i < len; i++) {
			currentLineText = lines[i].text;

			currentLineHasContent = false;
			currentLineIndentation = 0;
			tmpSpaceCounts = 0;
			tmpTabCounts = 0;
			for (j = 0, lenJ = currentLineText.length; j < lenJ; j++) {
				charCode = currentLineText.charCodeAt(j);

				if (charCode === __tab) {
					tmpTabCounts++;
				} else if (charCode === __space) {
					tmpSpaceCounts++;
				} else {
					// Hit non whitespace character on this line
					currentLineHasContent = true;
					currentLineIndentation = j;
					break;
				}
			}

			// Ignore `space` if it occurs exactly once in the indentation
			if (tmpSpaceCounts === 1) {
				tmpSpaceCounts = 0;
			}

			if (currentLineHasContent && (tmpTabCounts > 0 || tmpSpaceCounts > 0)) {
				if (tmpTabCounts > 0) {
					linesIndentedWithTabs++;
				}
				if (tmpSpaceCounts > 0) {
					absoluteSpaceCounts[tmpSpaceCounts] = (absoluteSpaceCounts[tmpSpaceCounts] || 0) + 1;
				}
			}

			if (currentLineHasContent) {
				// Only considering lines with content, look at the relative indentation between previous line's indentation and current line's indentation

				// This can go both ways (e.g.):
				//  - previousLineIndentation: "\t\t"
				//  - currentLineIndentation: "\t    "
				//  => This should count 1 tab and 4 spaces
				tmpSpaceCounts = 0;

				var stillMatchingIndentation = true;
				for (j = 0; j < previousLineIndentation && j < currentLineIndentation; j++) {
					prevLineCharCode = previousLineTextWithContent.charCodeAt(j);
					charCode = currentLineText.charCodeAt(j);

					if (stillMatchingIndentation && prevLineCharCode !== charCode) {
						stillMatchingIndentation = false;
					}

					if (!stillMatchingIndentation) {
						if (prevLineCharCode === __space) {
							tmpSpaceCounts++;
						}
						if (charCode === __space) {
							tmpSpaceCounts++;
						}
					}
				}

				for (;j < previousLineIndentation; j++) {
					prevLineCharCode = previousLineTextWithContent.charCodeAt(j);
					if (prevLineCharCode === __space) {
						tmpSpaceCounts++;
					}
				}

				for (;j < currentLineIndentation; j++) {
					charCode = currentLineText.charCodeAt(j);
					if (charCode === __space) {
						tmpSpaceCounts++;
					}
				}

				// Ignore `space` if it occurs exactly once in the indentation
				if (tmpSpaceCounts === 1) {
					tmpSpaceCounts = 0;
				}

				if (tmpSpaceCounts > 0) {
					relativeSpaceCounts[tmpSpaceCounts] = (relativeSpaceCounts[tmpSpaceCounts] || 0) + 1;
				}

				previousLineIndentation = currentLineIndentation;
				previousLineTextWithContent = currentLineText;
			}
		}

		return {
			linesIndentedWithTabs: linesIndentedWithTabs,
			relativeSpaceCounts: relativeSpaceCounts,
			absoluteSpaceCounts: absoluteSpaceCounts
		};
	}

	public guessIndentation(defaultTabSize:number): editorCommon.IGuessedIndentation {
		if (this._isDisposed) {
			throw new Error('TextModel.guessIndentation: Model is disposed');
		}

		let i:number,
			len:number,
			factors = this._extractIndentationFactors(),
			linesIndentedWithTabs = factors.linesIndentedWithTabs,
			absoluteSpaceCounts = factors.absoluteSpaceCounts,
			relativeSpaceCounts = factors.relativeSpaceCounts;

		// Count the absolute number of times tabs or spaces have been used as indentation
		let linesIndentedWithSpaces = 0;
		for (i = 1, len = absoluteSpaceCounts.length; i < len; i++) {
			linesIndentedWithSpaces += (absoluteSpaceCounts[i] || 0);
		}

		let candidate:number,
			candidateScore:number,
			penalization:number,
			m:number,
			scores:number[] = [];

		for (candidate = 2, len = absoluteSpaceCounts.length; candidate < len; candidate++) {
			if (!absoluteSpaceCounts[candidate]) {
				continue;
			}

			// Try to compute a score that `candidate` is the `tabSize`
			candidateScore = 0;
			penalization = 0;
			for (m = candidate; m < len; m += candidate) {
				if (absoluteSpaceCounts[m]) {
					candidateScore += absoluteSpaceCounts[m];
				} else {
					// Penalize this candidate, but penalize less with every mutliple..
					penalization += candidate / m;
				}
			}
			scores[candidate] = candidateScore / (1 + penalization);
		}

		// console.log('----------');
		// console.log('linesIndentedWithTabs: ', linesIndentedWithTabs);
		// console.log('absoluteSpaceCounts: ', absoluteSpaceCounts);
		// console.log('relativeSpaceCounts: ', relativeSpaceCounts);
		// console.log('=> linesIndentedWithSpaces: ', linesIndentedWithSpaces);
		// console.log('=> scores: ', scores);

		let bestCandidate = defaultTabSize,
			bestCandidateScore = 0;

		let allowedGuesses = [2, 4, 6, 8];

		for (i = 0; i < allowedGuesses.length; i++) {
			candidate = allowedGuesses[i];
			candidateScore = (scores[candidate] || 0) + (relativeSpaceCounts[candidate] || 0);
			if (candidateScore > bestCandidateScore) {
				bestCandidate = candidate;
				bestCandidateScore = candidateScore;
			}
		}

		let insertSpaces = true;
		if (linesIndentedWithTabs > linesIndentedWithSpaces) {
			// More lines indented with tabs
			insertSpaces = false;
		}

		return {
			insertSpaces: insertSpaces,
			tabSize: bestCandidate
		};
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

	public static toRawText(rawText:string): editorCommon.IRawText {
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
			EOL = DEFAULT_PLATFORM_EOL;
		} else if (carriageReturnCnt > lineFeedCnt / 2) {
			// More than half of the file contains \r\n ending lines
			EOL = '\r\n';
		} else {
			// At least one line more ends in \n
			EOL = '\n';
		}

		return {
			BOM: BOM,
			EOL: EOL,
			lines: lines,
			length: rawText.length
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
