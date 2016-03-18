/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {TPromise} from 'vs/base/common/winjs.base';
import {IdGenerator} from 'vs/editor/common/core/idGenerator';
import {Range} from 'vs/editor/common/core/range';
import * as editorCommon from 'vs/editor/common/editorCommon';
import {ILineMarker} from 'vs/editor/common/model/modelLine';
import {INewMarker, TextModelWithMarkers} from 'vs/editor/common/model/textModelWithMarkers';
import {FullModelRetokenizer, IRetokenizeRequest} from 'vs/editor/common/model/textModelWithTokens';
import {IMode} from 'vs/editor/common/modes';

interface ITrackedRange {
	id:string;
	startMarkerId:string;
	endMarkerId:string;
}

interface ITrackedRangesMap {
	[key:string]:ITrackedRange;
}

interface IMarkerIdToRangeIdMap {
	[key:string]:string;
}

class TrackedRangeModelRetokenizer extends FullModelRetokenizer {

	private trackedRangeId: string;

	constructor(retokenizePromise:TPromise<void>, lineNumber:number, model:TextModelWithTrackedRanges) {
		super(retokenizePromise, model);
		this.trackedRangeId = model.addTrackedRange({
			startLineNumber: lineNumber,
			startColumn : 1,
			endLineNumber: lineNumber,
			endColumn: model.getLineMaxColumn(lineNumber)
		}, editorCommon.TrackedRangeStickiness.AlwaysGrowsWhenTypingAtEdges);
	}

	public getRange(): editorCommon.IRange {
		return (<TextModelWithTrackedRanges>this._model).getTrackedRange(this.trackedRangeId);
	}

	public dispose(): void {
		var model = (<TextModelWithTrackedRanges>this._model);
		// if this .dispose() is being called as part of the model.dispose(), then the tracked ranges might no longer be available (e.g. throw exceptions)
		if (model.isValidTrackedRange(this.trackedRangeId)) {
			model.removeTrackedRange(this.trackedRangeId);
		}
		super.dispose();
	}
}

class TrackedRange implements ITrackedRange {
	id:string;
	startMarkerId:string;
	endMarkerId:string;

	constructor(id:string, startMarkedId:string, endMarkerId:string) {
		this.id = id;
		this.startMarkerId = startMarkedId;
		this.endMarkerId = endMarkerId;
	}
}

var _INSTANCE_COUNT = 0;

export class TextModelWithTrackedRanges extends TextModelWithMarkers implements editorCommon.ITextModelWithTrackedRanges {

	private _rangeIdGenerator: IdGenerator;
	private _ranges:ITrackedRangesMap;
	private _markerIdToRangeId:IMarkerIdToRangeIdMap;
	private _multiLineTrackedRanges: { [key:string]: boolean; };

	constructor(allowedEventTypes:string[], rawText:editorCommon.IRawText, modeOrPromise:IMode|TPromise<IMode>) {
		super(allowedEventTypes, rawText, modeOrPromise);
		this._rangeIdGenerator = new IdGenerator((++_INSTANCE_COUNT) + ';');
		this._ranges = {};
		this._markerIdToRangeId = {};
		this._multiLineTrackedRanges = {};
	}

	_createRetokenizer(retokenizePromise:TPromise<void>, lineNumber:number): IRetokenizeRequest {
		return new TrackedRangeModelRetokenizer(retokenizePromise, lineNumber, this);
	}

	public dispose(): void {
		this._ranges = null;
		this._markerIdToRangeId = null;
		this._multiLineTrackedRanges = null;
		super.dispose();
	}

	_resetValue(e:editorCommon.IModelContentChangedFlushEvent, newValue:editorCommon.IRawText): void {
		super._resetValue(e, newValue);

		// Destroy all my tracked ranges
		this._ranges = {};
		this._markerIdToRangeId = {};
		this._multiLineTrackedRanges = {};
	}

	private _setRangeIsMultiLine(rangeId: string, rangeIsMultiLine: boolean): void {
		var rangeWasMultiLine = this._multiLineTrackedRanges.hasOwnProperty(rangeId);
		if (!rangeWasMultiLine && rangeIsMultiLine) {
			this._multiLineTrackedRanges[rangeId] = true;
		} else if (rangeWasMultiLine && !rangeIsMultiLine) {
			delete this._multiLineTrackedRanges[rangeId];
		}
	}

	private _shouldStartMarkerSticksToPreviousCharacter(stickiness:editorCommon.TrackedRangeStickiness): boolean {
		if (stickiness === editorCommon.TrackedRangeStickiness.AlwaysGrowsWhenTypingAtEdges || stickiness === editorCommon.TrackedRangeStickiness.GrowsOnlyWhenTypingBefore) {
			return true;
		}
		return false;
	}

	private _shouldEndMarkerSticksToPreviousCharacter(stickiness:editorCommon.TrackedRangeStickiness): boolean {
		if (stickiness === editorCommon.TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges || stickiness === editorCommon.TrackedRangeStickiness.GrowsOnlyWhenTypingBefore) {
			return true;
		}
		return false;
	}

	_getTrackedRangesCount(): number {
		return Object.keys(this._ranges).length;
	}

	public addTrackedRange(textRange:editorCommon.IRange, stickiness:editorCommon.TrackedRangeStickiness): string {
		if (this._isDisposed) {
			throw new Error('TextModelWithTrackedRanges.addTrackedRange: Model is disposed');
		}

		textRange = this.validateRange(textRange);

		var startMarkerSticksToPreviousCharacter = this._shouldStartMarkerSticksToPreviousCharacter(stickiness);
		var endMarkerSticksToPreviousCharacter = this._shouldEndMarkerSticksToPreviousCharacter(stickiness);

		var startMarkerId = this._addMarker(textRange.startLineNumber, textRange.startColumn, startMarkerSticksToPreviousCharacter);
		var endMarkerId = this._addMarker(textRange.endLineNumber, textRange.endColumn, endMarkerSticksToPreviousCharacter);

		var range = new TrackedRange(this._rangeIdGenerator.generate(), startMarkerId, endMarkerId);
		this._ranges[range.id] = range;
		this._markerIdToRangeId[startMarkerId] = range.id;
		this._markerIdToRangeId[endMarkerId] = range.id;

		this._setRangeIsMultiLine(range.id, (textRange.startLineNumber !== textRange.endLineNumber));

		return range.id;
	}

	protected _addTrackedRanges(textRanges:editorCommon.IRange[], stickinessArr:editorCommon.TrackedRangeStickiness[]): string[] {
		let addMarkers: INewMarker[] = [];
		for (let i = 0, len = textRanges.length; i < len; i++) {
			let textRange = textRanges[i];
			let stickiness = stickinessArr[i];

			addMarkers.push({
				lineNumber: textRange.startLineNumber,
				column: textRange.startColumn,
				stickToPreviousCharacter: this._shouldStartMarkerSticksToPreviousCharacter(stickiness)
			});
			addMarkers.push({
				lineNumber: textRange.endLineNumber,
				column: textRange.endColumn,
				stickToPreviousCharacter: this._shouldEndMarkerSticksToPreviousCharacter(stickiness)
			});
		}

		let markerIds = this._addMarkers(addMarkers);

		let result:string[] = [];
		for (let i = 0, len = textRanges.length; i < len; i++) {
			let textRange = textRanges[i];
			let startMarkerId = markerIds[2 * i];
			let endMarkerId = markerIds[2 * i + 1];

			let range = new TrackedRange(this._rangeIdGenerator.generate(), startMarkerId, endMarkerId);
			this._ranges[range.id] = range;
			this._markerIdToRangeId[startMarkerId] = range.id;
			this._markerIdToRangeId[endMarkerId] = range.id;

			this._setRangeIsMultiLine(range.id, (textRange.startLineNumber !== textRange.endLineNumber));

			result.push(range.id);
		}

		return result;
	}

	public changeTrackedRange(rangeId:string, newTextRange:editorCommon.IRange): void {
		if (this._isDisposed) {
			throw new Error('TextModelWithTrackedRanges.changeTrackedRange: Model is disposed');
		}

		if (this._ranges.hasOwnProperty(rangeId)) {
			newTextRange = this.validateRange(newTextRange);

			var range = this._ranges[rangeId];
			this._changeMarker(range.startMarkerId, newTextRange.startLineNumber, newTextRange.startColumn);
			this._changeMarker(range.endMarkerId, newTextRange.endLineNumber, newTextRange.endColumn);

			this._setRangeIsMultiLine(range.id, (newTextRange.startLineNumber !== newTextRange.endLineNumber));
		}
	}

	public changeTrackedRangeStickiness(rangeId:string, newStickiness:editorCommon.TrackedRangeStickiness): void {
		if (this._isDisposed) {
			throw new Error('TextModelWithTrackedRanges.changeTrackedRangeStickiness: Model is disposed');
		}

		if (this._ranges.hasOwnProperty(rangeId)) {
			var range = this._ranges[rangeId];
			this._changeMarkerStickiness(range.startMarkerId, this._shouldStartMarkerSticksToPreviousCharacter(newStickiness));
			this._changeMarkerStickiness(range.endMarkerId, this._shouldEndMarkerSticksToPreviousCharacter(newStickiness));
		}
	}

	public isValidTrackedRange(rangeId:string): boolean {
		if (this._isDisposed || !this._ranges) {
			return false;
		}
		return this._ranges.hasOwnProperty(rangeId);
	}

	public removeTrackedRange(rangeId:string): void {
		if (this._isDisposed) {
			throw new Error('TextModelWithTrackedRanges.removeTrackedRange: Model is disposed');
		}

		if (this._ranges.hasOwnProperty(rangeId)) {
			var range = this._ranges[rangeId];

			this._removeMarker(range.startMarkerId);
			this._removeMarker(range.endMarkerId);

			this._setRangeIsMultiLine(range.id, false);
			delete this._ranges[range.id];
			delete this._markerIdToRangeId[range.startMarkerId];
			delete this._markerIdToRangeId[range.endMarkerId];
		}
	}

	protected removeTrackedRanges(ids:string[]): void {
		let removeMarkers: string[] = [];

		for (let i = 0, len = ids.length; i < len; i++) {
			let rangeId = ids[i];

			if (!this._ranges.hasOwnProperty(rangeId)) {
				continue;
			}

			let range = this._ranges[rangeId];

			removeMarkers.push(range.startMarkerId);
			removeMarkers.push(range.endMarkerId);

			this._setRangeIsMultiLine(range.id, false);
			delete this._ranges[range.id];
			delete this._markerIdToRangeId[range.startMarkerId];
			delete this._markerIdToRangeId[range.endMarkerId];
		}

		if (removeMarkers.length > 0) {
			this._removeMarkers(removeMarkers);
		}
	}

	private _newEditorRange(startPosition: editorCommon.IEditorPosition, endPosition: editorCommon.IEditorPosition): editorCommon.IEditorRange {
		if (endPosition.isBefore(startPosition)) {
			// This tracked range has turned in on itself (end marker before start marker)
			// This can happen in extreme editing conditions where lots of text is removed and lots is added

			// Treat it as a collapsed range
			return new Range(startPosition.lineNumber, startPosition.column, startPosition.lineNumber, startPosition.column);
		}
		return new Range(startPosition.lineNumber, startPosition.column, endPosition.lineNumber, endPosition.column);
	}

	public getTrackedRange(rangeId:string): editorCommon.IEditorRange {
		if (this._isDisposed) {
			throw new Error('TextModelWithTrackedRanges.getTrackedRange: Model is disposed');
		}

		var range = this._ranges[rangeId];
		var startMarker = this._getMarker(range.startMarkerId);
		var endMarker = this._getMarker(range.endMarkerId);

		return this._newEditorRange(startMarker, endMarker);
	}

	/**
	 * Fetch only multi-line ranges that intersect with the given line number range
	 */
	private _getMultiLineTrackedRanges(filterStartLineNumber: number, filterEndLineNumber: number): editorCommon.IModelTrackedRange[] {
		var result: editorCommon.IModelTrackedRange[] = [],
			rangeId: string,
			range: ITrackedRange,
			startMarker: editorCommon.IEditorPosition,
			endMarker: editorCommon.IEditorPosition;

		for (rangeId in this._multiLineTrackedRanges) {
			if (this._multiLineTrackedRanges.hasOwnProperty(rangeId)) {
				range = this._ranges[rangeId];

				startMarker = this._getMarker(range.startMarkerId);
				if (startMarker.lineNumber > filterEndLineNumber) {
					continue;
				}

				endMarker = this._getMarker(range.endMarkerId);
				if (endMarker.lineNumber < filterStartLineNumber) {
					continue;
				}

				result.push({
					id: range.id,
					range: this._newEditorRange(startMarker, endMarker)
				});
			}
		}

		return result;
	}

	public getLinesTrackedRanges(startLineNumber:number, endLineNumber:number): editorCommon.IModelTrackedRange[] {
		if (this._isDisposed) {
			throw new Error('TextModelWithTrackedRanges.getLinesTrackedRanges: Model is disposed');
		}

		var result = this._getMultiLineTrackedRanges(startLineNumber, endLineNumber),
			resultMap: { [rangeId:string]: boolean; } = {},
			lineMarkers: editorCommon.IReadOnlyLineMarker[],
			lineMarker: editorCommon.IReadOnlyLineMarker,
			rangeId: string,
			i: number,
			len: number,
			lineNumber: number,
			startMarker: editorCommon.IEditorPosition,
			endMarker: editorCommon.IEditorPosition;

		for (i = 0, len = result.length; i < len; i++) {
			resultMap[result[i].id] = true;
		}

		for (lineNumber = startLineNumber; lineNumber <= endLineNumber; lineNumber++) {
			lineMarkers = this._getLineMarkers(lineNumber);
			for (i = 0, len = lineMarkers.length; i < len; i++) {
				lineMarker = lineMarkers[i];

				if (this._markerIdToRangeId.hasOwnProperty(lineMarker.id)) {
					rangeId = this._markerIdToRangeId[lineMarker.id];
					if (!resultMap.hasOwnProperty(rangeId)) {
						startMarker = this._getMarker(this._ranges[rangeId].startMarkerId);
						endMarker = this._getMarker(this._ranges[rangeId].endMarkerId);

						result.push({
							id: rangeId,
							range: this._newEditorRange(startMarker, endMarker)
						});
						resultMap[rangeId] = true;
					}
				}
			}
		}

		return result;
	}

	_onChangedMarkers(changedMarkers:ILineMarker[]): editorCommon.IChangedTrackedRanges {
		var changedRanges:editorCommon.IChangedTrackedRanges = {},
			changedRange:editorCommon.IRange,
			range:ITrackedRange,
			rangeId:string,
			marker:ILineMarker,
			i:number,
			len:number;

		for (i = 0, len = changedMarkers.length; i < len; i++) {
			marker = changedMarkers[i];

			if (this._markerIdToRangeId.hasOwnProperty(marker.id)) {
				rangeId = this._markerIdToRangeId[marker.id];

				range = this._ranges[rangeId];

				if (changedRanges.hasOwnProperty(range.id)) {
					changedRange = changedRanges[range.id];
				} else {
					changedRange = {
						startLineNumber: 0,
						startColumn: 0,
						endLineNumber: 0,
						endColumn: 0
					};
					changedRanges[range.id] = changedRange;
				}

				if (marker.id === range.startMarkerId) {
					changedRange.startLineNumber = marker.oldLineNumber;
					changedRange.startColumn = marker.oldColumn;
				} else {
					changedRange.endLineNumber = marker.oldLineNumber;
					changedRange.endColumn = marker.oldColumn;
				}

				this._setRangeIsMultiLine(range.id, (this._getMarker(range.startMarkerId).lineNumber !== this._getMarker(range.endMarkerId).lineNumber));
			}
		}
		return changedRanges;
	}

}