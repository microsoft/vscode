/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import URI from 'vs/base/common/uri';
import {TPromise} from 'vs/base/common/winjs.base';
import * as editorCommon from 'vs/editor/common/editorCommon';
import {ModelLine} from 'vs/editor/common/model/modelLine';
import {TextModel} from 'vs/editor/common/model/textModel';
import {TextModelWithTokens} from 'vs/editor/common/model/textModelWithTokens';
import {IMode} from 'vs/editor/common/modes';
import {Range} from 'vs/editor/common/core/range';
import {Position} from 'vs/editor/common/core/position';

export interface IMirrorModelEvents {
	contentChanged: editorCommon.IModelContentChangedEvent[];
}

const NO_TAB_SIZE = 0;

export class AbstractMirrorModel extends TextModelWithTokens implements editorCommon.IMirrorModel {

	_associatedResource:URI;

	constructor(allowedEventTypes:string[], versionId:number, value:editorCommon.IRawText, mode:IMode|TPromise<IMode>, associatedResource?:URI) {
		super(allowedEventTypes.concat([editorCommon.EventType.ModelDispose]), value, mode);

		this._setVersionId(versionId);
		this._associatedResource = associatedResource;
	}

	public getModeId(): string {
		return this.getMode().getId();
	}

	public _constructLines(rawText:editorCommon.IRawText):void {
		super._constructLines(rawText);
		// Force EOL to be \n
		this._EOL = '\n';
	}

	public destroy(): void {
		this.dispose();
	}

	public dispose(): void {
		this.emit(editorCommon.EventType.ModelDispose);
		super.dispose();
	}

	public get uri(): URI {
		return this._associatedResource;
	}

	public getRangeFromOffsetAndLength(offset:number, length:number): Range {
		let startPosition = this.getPositionAt(offset);
		let endPosition = this.getPositionAt(offset + length);
		return new Range(
			startPosition.lineNumber,
			startPosition.column,
			endPosition.lineNumber,
			endPosition.column
		);
	}

	public getOffsetAndLengthFromRange(range:editorCommon.IRange):{offset:number; length:number;} {
		let startOffset = this.getOffsetAt(new Position(range.startLineNumber, range.startColumn));
		let endOffset = this.getOffsetAt(new Position(range.endLineNumber, range.endColumn));
		return {
			offset: startOffset,
			length: endOffset - startOffset
		};
	}

	public getPositionFromOffset(offset:number): Position {
		return this.getPositionAt(offset);
	}

	public getOffsetFromPosition(position:editorCommon.IPosition): number {
		return this.getOffsetAt(position);
	}

	public getLineStart(lineNumber:number): number {
		if (lineNumber < 1) {
			lineNumber = 1;
		}
		if (lineNumber > this.getLineCount()) {
			lineNumber = this.getLineCount();
		}
		return this.getOffsetAt(new Position(lineNumber, 1));
	}

	public getAllWordsWithRange(): editorCommon.IRangeWithText[] {
		if (this._lines.length > 10000) {
			// This is a very heavy method, unavailable for very heavy models
			return [];
		}

		var result:editorCommon.IRangeWithText[] = [],
			i:number;

		var toTextRange = function (info: editorCommon.IWordRange) {
			var s = line.text.substring(info.start, info.end);
			var r = { startLineNumber: i + 1, startColumn: info.start + 1, endLineNumber: i + 1, endColumn: info.end + 1 };
			result.push({ text: s, range: r});
		};

		for(i = 0; i < this._lines.length; i++) {
			var line = this._lines[i];
			this.wordenize(line.text).forEach(toTextRange);
		}

		return result;
	}

	public getAllWords(): string[] {
		var result:string[] = [];
		this._lines.forEach((line) => {
			this.wordenize(line.text).forEach((info) => {
				result.push(line.text.substring(info.start, info.end));
			});
		});
		return result;
	}

	public getAllUniqueWords(skipWordOnce?:string) : string[] {
		var foundSkipWord = false;
		var uniqueWords = {};
		return this.getAllWords().filter((word) => {
			if (skipWordOnce && !foundSkipWord && skipWordOnce === word) {
				foundSkipWord = true;
				return false;
			} else if (uniqueWords[word]) {
				return false;
			} else {
				uniqueWords[word] = true;
				return true;
			}
		});
	}

//	// TODO@Joh, TODO@Alex - remove these and make sure the super-things work
	private wordenize(content:string): editorCommon.IWordRange[] {
		var result:editorCommon.IWordRange[] = [];
		var match:RegExpExecArray;
		var wordsRegexp = this._getWordDefinition();
		while (match = wordsRegexp.exec(content)) {
			result.push({ start: match.index, end: match.index + match[0].length });
		}
		return result;
	}
}

export function createTestMirrorModelFromString(value:string, mode:IMode = null, associatedResource?:URI): MirrorModel {
	return new MirrorModel(0, TextModel.toRawText(value, TextModel.DEFAULT_CREATION_OPTIONS), mode, associatedResource);
}

export class MirrorModel extends AbstractMirrorModel implements editorCommon.IMirrorModel {

	constructor(versionId:number, value:editorCommon.IRawText, mode:IMode|TPromise<IMode>, associatedResource?:URI) {
		super(['changed'], versionId, value, mode, associatedResource);
	}

	public onEvents(events:IMirrorModelEvents) : void {
		let changed = false;
		for (let i = 0, len = events.contentChanged.length; i < len; i++) {
			let contentChangedEvent = events.contentChanged[i];

			this._setVersionId(contentChangedEvent.versionId);
			switch (contentChangedEvent.changeType) {
				case editorCommon.EventType.ModelRawContentChangedFlush:
					this._onLinesFlushed(<editorCommon.IModelContentChangedFlushEvent>contentChangedEvent);
					changed = true;
					break;

				case editorCommon.EventType.ModelRawContentChangedLinesDeleted:
					this._onLinesDeleted(<editorCommon.IModelContentChangedLinesDeletedEvent>contentChangedEvent);
					changed = true;
					break;

				case editorCommon.EventType.ModelRawContentChangedLinesInserted:
					this._onLinesInserted(<editorCommon.IModelContentChangedLinesInsertedEvent>contentChangedEvent);
					changed = true;
					break;

				case editorCommon.EventType.ModelRawContentChangedLineChanged:
					this._onLineChanged(<editorCommon.IModelContentChangedLineChangedEvent>contentChangedEvent);
					changed = true;
					break;
			}
		}

		if (changed) {
			this.emit('changed', {});
		}
	}

	private _onLinesFlushed(e:editorCommon.IModelContentChangedFlushEvent): void {
		// Flush my lines
		this._constructLines(e.detail);
		this._resetTokenizationState();
	}

	private _onLineChanged(e:editorCommon.IModelContentChangedLineChangedEvent) : void {
		this._lines[e.lineNumber - 1].applyEdits({}, [{
			startColumn: 1,
			endColumn: Number.MAX_VALUE,
			text: e.detail,
			forceMoveMarkers: false
		}], NO_TAB_SIZE);
		if (this._lineStarts) {
			// update prefix sum
			this._lineStarts.changeValue(e.lineNumber - 1, this._lines[e.lineNumber - 1].text.length + this._EOL.length);
		}

		this._invalidateLine(e.lineNumber - 1);
	}

	private _onLinesDeleted(e:editorCommon.IModelContentChangedLinesDeletedEvent) : void {
		var fromLineIndex = e.fromLineNumber - 1,
			toLineIndex = e.toLineNumber - 1;

		// Save first line's state
		var firstLineState = this._lines[fromLineIndex].getState();

		this._lines.splice(fromLineIndex, toLineIndex - fromLineIndex + 1);
		if (this._lineStarts) {
			// update prefix sum
			this._lineStarts.removeValues(fromLineIndex, toLineIndex - fromLineIndex + 1);
		}

		if (fromLineIndex < this._lines.length) {
			// This check is always true in real world, but the tests forced this

			// Restore first line's state
			this._lines[fromLineIndex].setState(firstLineState);

			// Invalidate line
			this._invalidateLine(fromLineIndex);
		}
	}

	private _onLinesInserted(e:editorCommon.IModelContentChangedLinesInsertedEvent) : void {
		var lineIndex:number,
			i:number,
			splitLines = e.detail.split('\n');

		let newLengths:number[] = [];
		for (lineIndex = e.fromLineNumber - 1, i = 0; lineIndex < e.toLineNumber; lineIndex++, i++) {
			this._lines.splice(lineIndex, 0, new ModelLine(0, splitLines[i], NO_TAB_SIZE));
			newLengths.push(splitLines[i].length + this._EOL.length);
		}
		if (this._lineStarts) {
			// update prefix sum
			this._lineStarts.insertValues(e.fromLineNumber - 1, newLengths);
		}

		if (e.fromLineNumber >= 2) {
			// This check is always true in real world, but the tests forced this
			this._invalidateLine(e.fromLineNumber - 2);
		}
	}
}
