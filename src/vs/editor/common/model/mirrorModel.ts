/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {dispose} from 'vs/base/common/lifecycle';
import URI from 'vs/base/common/uri';
import {TPromise} from 'vs/base/common/winjs.base';
import * as editorCommon from 'vs/editor/common/editorCommon';
import {ModelLine} from 'vs/editor/common/model/modelLine';
import {TextModel} from 'vs/editor/common/model/textModel';
import {TextModelWithTokens} from 'vs/editor/common/model/textModelWithTokens';
import {IMode} from 'vs/editor/common/modes';
import {IResourceService} from 'vs/editor/common/services/resourceService';
import {Range} from 'vs/editor/common/core/range';
import {Position} from 'vs/editor/common/core/position';

export interface IMirrorModelEvents {
	contentChanged: editorCommon.IModelContentChangedEvent[];
}

export class AbstractMirrorModel extends TextModelWithTokens implements editorCommon.IMirrorModel {

	_associatedResource:URI;

	constructor(allowedEventTypes:string[], versionId:number, value:editorCommon.IRawText, mode:IMode|TPromise<IMode>, associatedResource?:URI) {
		super(allowedEventTypes.concat([editorCommon.EventType.ModelDispose]), value, false, mode);

		this._setVersionId(versionId);
		this._associatedResource = associatedResource;
	}

	public getModeId(): string {
		return this.getMode().getId();
	}

	public getEmbeddedAtPosition(position:editorCommon.IPosition):editorCommon.IMirrorModel {
		return null;
	}

	public getAllEmbedded():editorCommon.IMirrorModel[] {
		return [];
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

export class MirrorModelEmbedded extends AbstractMirrorModel implements editorCommon.IMirrorModel {

	private _actualModel:MirrorModel;

	constructor(actualModel:MirrorModel, includeRanges:editorCommon.IRange[], mode:IMode, url:URI) {
		super(['changed'], actualModel.getVersionId(), MirrorModelEmbedded._getMirrorValueWithinRanges(actualModel, includeRanges), mode, url);
		this._actualModel = actualModel;
	}

	private static _getMirrorValueWithinRanges(actualModel:MirrorModel, includeRanges:editorCommon.IRange[]): editorCommon.IRawText {

		var	resultingText = '',
			prevLineAdded = 1,
			prevColumnAdded = 1,
			i:number;

		for (i = 0; i < includeRanges.length; i++) {
			var includeRange = includeRanges[i];

			resultingText += actualModel.getEmptiedValueInRange({
				startLineNumber: prevLineAdded,
				startColumn: prevColumnAdded,
				endLineNumber: includeRange.startLineNumber,
				endColumn: includeRange.startColumn
			}, ' ');

			resultingText += actualModel.getValueInRange(includeRange);

			prevLineAdded = includeRange.endLineNumber;
			prevColumnAdded = includeRange.endColumn;
		}

		var lastLineNumber = actualModel.getLineCount(),
			lastColumn = actualModel.getLineMaxColumn(lastLineNumber);

		resultingText += actualModel.getEmptiedValueInRange({
			startLineNumber: prevLineAdded,
			startColumn: prevColumnAdded,
			endLineNumber: lastLineNumber,
			endColumn: lastColumn
		}, ' ');

		let actualModelOptions = actualModel.getOptions();
		return TextModel.toRawText(resultingText, {
			tabSize: actualModelOptions.tabSize,
			insertSpaces: actualModelOptions.insertSpaces,
			detectIndentation: false,
			defaultEOL: actualModelOptions.defaultEOL,
			trimAutoWhitespace: actualModelOptions.trimAutoWhitespace
		});
	}

	public setIncludedRanges(newIncludedRanges:editorCommon.IRange[]): void {
		var prevVersionId = this.getVersionId();

		// Force recreating of line starts (when used)
		this._constructLines(MirrorModelEmbedded._getMirrorValueWithinRanges(this._actualModel, newIncludedRanges));
		this._resetTokenizationState();

		this._setVersionId(prevVersionId + 1);

		this.emit('changed', {});
	}

}

class EmbeddedModeRange {
	public mode: IMode;
	public ranges: editorCommon.IRange[];

	public constructor(mode: IMode) {
		this.mode = mode;
		this.ranges = [];
	}
}

export function createTestMirrorModelFromString(value:string, mode:IMode = null, associatedResource?:URI): MirrorModel {
	return new MirrorModel(null, 0, TextModel.toRawText(value, TextModel.DEFAULT_CREATION_OPTIONS), mode, associatedResource);
}

export class MirrorModel extends AbstractMirrorModel implements editorCommon.IMirrorModel {

	private _resourceService: IResourceService;
	private _embeddedModels: {[modeId:string]:MirrorModelEmbedded;};

	constructor(resourceService:IResourceService, versionId:number, value:editorCommon.IRawText, mode:IMode|TPromise<IMode>, associatedResource?:URI) {
		super(['changed'], versionId, value, mode, associatedResource);

		this._resourceService = resourceService;
		this._embeddedModels = {};
		this._updateEmbeddedModels();
	}

	public getEmbeddedAtPosition(position:editorCommon.IPosition):editorCommon.IMirrorModel {
		var modeAtPosition = this.getModeAtPosition(position.lineNumber, position.column);
		if (this._embeddedModels.hasOwnProperty(modeAtPosition.getId())) {
			return this._embeddedModels[modeAtPosition.getId()];
		}
		return null;
	}

	public getAllEmbedded():editorCommon.IMirrorModel[] {
		return Object.keys(this._embeddedModels).map((embeddedModeId) => this._embeddedModels[embeddedModeId]);
	}

	public dispose(): void {
		super.dispose();
		var embeddedModels = Object.keys(this._embeddedModels).map((modeId) => this._embeddedModels[modeId]);
		embeddedModels.forEach((embeddedModel) => this._resourceService.remove(embeddedModel.uri));
		dispose(embeddedModels);
		this._embeddedModels = {};
	}

	public setMode(newModeOrPromise:IMode|TPromise<IMode>): void {
		super.setMode(newModeOrPromise);
		this._updateEmbeddedModels();
	}

	private static _getModesRanges(model: editorCommon.IMirrorModel): {[modeId:string]:EmbeddedModeRange} {
		var encounteredModesRanges:{[modeId:string]:EmbeddedModeRange} = {};

		var getOrCreateEmbeddedModeRange = (modeId:string, mode:IMode) => {
			if (!encounteredModesRanges.hasOwnProperty(modeId)) {
				encounteredModesRanges[modeId] = new EmbeddedModeRange(mode);
			}
			return encounteredModesRanges[modeId];
		};

		var lineCount = model.getLineCount();
		var currentModeId = model.getMode().getId();
		var currentMode = model.getMode();
		var currentStartLineNumber = 1, currentStartColumn = 1;

		for (var lineNumber = 1; lineNumber <= lineCount; lineNumber++) {
			var modeTransitions = model._getLineModeTransitions(lineNumber);

			for (var i = 0; i < modeTransitions.length; i++) {
				var modeTransition = modeTransitions[i];
				if (modeTransition.mode.getId() !== currentModeId) {

					var modeRange = getOrCreateEmbeddedModeRange(currentModeId, currentMode);
					modeRange.ranges.push({
						startLineNumber: currentStartLineNumber,
						startColumn: currentStartColumn,
						endLineNumber: lineNumber,
						endColumn: modeTransition.startIndex + 1
					});

					currentModeId = modeTransition.mode.getId();
					currentMode = modeTransition.mode;
					currentStartLineNumber = lineNumber;
					currentStartColumn = modeTransition.startIndex + 1;
				}
			}
		}

		var lastLineNumber = lineCount;
		var lastColumn = model.getLineMaxColumn(lastLineNumber);

		if (currentStartLineNumber !== lastLineNumber || currentStartColumn !== lastColumn) {
			var modeRange = getOrCreateEmbeddedModeRange(currentModeId, currentMode);
			modeRange.ranges.push({
				startLineNumber: currentStartLineNumber,
				startColumn: currentStartColumn,
				endLineNumber: lastLineNumber,
				endColumn: lastColumn
			});
		}

		return encounteredModesRanges;
	}

	private _updateEmbeddedModels(): boolean {
		if (!this._resourceService || !this.getMode().tokenizationSupport || !this.getMode().tokenizationSupport.shouldGenerateEmbeddedModels) {
			return false;
		}

		var newModesRanges = MirrorModel._getModesRanges(this);

		// Empty out embedded models that have disappeared
		var oldNestedModesIds = Object.keys(this._embeddedModels);
		for (var i = 0; i < oldNestedModesIds.length; i++) {
			var oldNestedModeId = oldNestedModesIds[i];
			if (!newModesRanges.hasOwnProperty(oldNestedModeId)) {
				this._embeddedModels[oldNestedModeId].setIncludedRanges([{
					startLineNumber: 1,
					startColumn: 1,
					endLineNumber: 1,
					endColumn: 1
				}]);
			}
		}

		var newNestedModesIds = Object.keys(newModesRanges);
		for (var i = 0; i < newNestedModesIds.length; i++) {
			var newNestedModeId = newNestedModesIds[i];
			if (this._embeddedModels.hasOwnProperty(newNestedModeId)) {
				this._embeddedModels[newNestedModeId].setIncludedRanges(newModesRanges[newNestedModeId].ranges);
			} else {
				// TODO@Alex: implement derived resources (embedded mirror models) better
				var embeddedModelUrl = this.uri.with({ fragment: this.uri.fragment + 'URL_MARSHAL_REMOVE' + newNestedModeId });
				this._embeddedModels[newNestedModeId] = new MirrorModelEmbedded(this, newModesRanges[newNestedModeId].ranges, newModesRanges[newNestedModeId].mode, embeddedModelUrl);
				this._resourceService.insert(this._embeddedModels[newNestedModeId].uri, this._embeddedModels[newNestedModeId]);
			}
		}

		return false;
	}

	public onEvents(events:IMirrorModelEvents) : boolean {
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

		var shouldFlushMarkers = false;
		if (changed) {
			this.emit('changed', {});
			shouldFlushMarkers = this._updateEmbeddedModels();
		}
		return shouldFlushMarkers;
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
		}]);
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
			this._lines.splice(lineIndex, 0, new ModelLine(0, splitLines[i]));
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
