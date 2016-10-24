/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { IdGenerator } from 'vs/base/common/idGenerator';
import { Range } from 'vs/editor/common/core/range';
import * as editorCommon from 'vs/editor/common/editorCommon';
import { ILineMarker } from 'vs/editor/common/model/modelLine';
import { INewMarker, TextModelWithMarkers } from 'vs/editor/common/model/textModelWithMarkers';
import { Position } from 'vs/editor/common/core/position';

interface ITrackedRange {
	id: string;
	startMarkerId: string;
	endMarkerId: string;
}

interface ITrackedRangesMap {
	[key: string]: ITrackedRange;
}

interface IMarkerIdToRangeIdMap {
	[key: string]: string;
}

class TrackedRange implements ITrackedRange {
	id: string;
	startMarkerId: string;
	endMarkerId: string;

	constructor(id: string, startMarkedId: string, endMarkerId: string) {
		this.id = id;
		this.startMarkerId = startMarkedId;
		this.endMarkerId = endMarkerId;
	}
}

var _INSTANCE_COUNT = 0;

export class TextModelWithTrackedRanges extends TextModelWithMarkers implements editorCommon.ITextModelWithTrackedRanges {

	private _rangeIdGenerator: IdGenerator;
	private _ranges: ITrackedRangesMap;
	private _markerIdToRangeId: IMarkerIdToRangeIdMap;
	private _multiLineTrackedRanges: { [key: string]: boolean; };

	constructor(allowedEventTypes: string[], rawText: editorCommon.IRawText, languageId: string) {
		super(allowedEventTypes, rawText, languageId);
		this._rangeIdGenerator = new IdGenerator((++_INSTANCE_COUNT) + ';');
		this._ranges = {};
		this._markerIdToRangeId = {};
		this._multiLineTrackedRanges = {};
	}

	public dispose(): void {
		this._ranges = null;
		this._markerIdToRangeId = null;
		this._multiLineTrackedRanges = null;
		super.dispose();
	}

	protected _resetValue(newValue: editorCommon.IRawText): void {
		super._resetValue(newValue);

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

	private _shouldStartMarkerSticksToPreviousCharacter(stickiness: editorCommon.TrackedRangeStickiness): boolean {
		if (stickiness === editorCommon.TrackedRangeStickiness.AlwaysGrowsWhenTypingAtEdges || stickiness === editorCommon.TrackedRangeStickiness.GrowsOnlyWhenTypingBefore) {
			return true;
		}
		return false;
	}

	private _shouldEndMarkerSticksToPreviousCharacter(stickiness: editorCommon.TrackedRangeStickiness): boolean {
		if (stickiness === editorCommon.TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges || stickiness === editorCommon.TrackedRangeStickiness.GrowsOnlyWhenTypingBefore) {
			return true;
		}
		return false;
	}

	_getTrackedRangesCount(): number {
		return Object.keys(this._ranges).length;
	}

	public addTrackedRange(textRange: editorCommon.IRange, stickiness: editorCommon.TrackedRangeStickiness): string {
		textRange = this.validateRange(textRange);

		var startMarkerSticksToPreviousCharacter = this._shouldStartMarkerSticksToPreviousCharacter(stickiness);
		var endMarkerSticksToPreviousCharacter = this._shouldEndMarkerSticksToPreviousCharacter(stickiness);

		var startMarkerId = this._addMarker(textRange.startLineNumber, textRange.startColumn, startMarkerSticksToPreviousCharacter);
		var endMarkerId = this._addMarker(textRange.endLineNumber, textRange.endColumn, endMarkerSticksToPreviousCharacter);

		var range = new TrackedRange(this._rangeIdGenerator.nextId(), startMarkerId, endMarkerId);
		this._ranges[range.id] = range;
		this._markerIdToRangeId[startMarkerId] = range.id;
		this._markerIdToRangeId[endMarkerId] = range.id;

		this._setRangeIsMultiLine(range.id, (textRange.startLineNumber !== textRange.endLineNumber));

		return range.id;
	}

	protected _addTrackedRanges(textRanges: editorCommon.IRange[], stickinessArr: editorCommon.TrackedRangeStickiness[]): string[] {
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

		let result: string[] = [];
		for (let i = 0, len = textRanges.length; i < len; i++) {
			let textRange = textRanges[i];
			let startMarkerId = markerIds[2 * i];
			let endMarkerId = markerIds[2 * i + 1];

			let range = new TrackedRange(this._rangeIdGenerator.nextId(), startMarkerId, endMarkerId);
			this._ranges[range.id] = range;
			this._markerIdToRangeId[startMarkerId] = range.id;
			this._markerIdToRangeId[endMarkerId] = range.id;

			this._setRangeIsMultiLine(range.id, (textRange.startLineNumber !== textRange.endLineNumber));

			result.push(range.id);
		}

		return result;
	}

	public changeTrackedRange(rangeId: string, newTextRange: editorCommon.IRange): void {
		if (this._ranges.hasOwnProperty(rangeId)) {
			newTextRange = this.validateRange(newTextRange);

			var range = this._ranges[rangeId];
			this._changeMarker(range.startMarkerId, newTextRange.startLineNumber, newTextRange.startColumn);
			this._changeMarker(range.endMarkerId, newTextRange.endLineNumber, newTextRange.endColumn);

			this._setRangeIsMultiLine(range.id, (newTextRange.startLineNumber !== newTextRange.endLineNumber));
		}
	}

	public changeTrackedRangeStickiness(rangeId: string, newStickiness: editorCommon.TrackedRangeStickiness): void {
		if (this._ranges.hasOwnProperty(rangeId)) {
			var range = this._ranges[rangeId];
			this._changeMarkerStickiness(range.startMarkerId, this._shouldStartMarkerSticksToPreviousCharacter(newStickiness));
			this._changeMarkerStickiness(range.endMarkerId, this._shouldEndMarkerSticksToPreviousCharacter(newStickiness));
		}
	}

	public isValidTrackedRange(rangeId: string): boolean {
		if (this._isDisposed || !this._ranges) {
			return false;
		}
		return this._ranges.hasOwnProperty(rangeId);
	}

	public removeTrackedRange(rangeId: string): void {
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

	protected removeTrackedRanges(ids: string[]): void {
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

	private _newEditorRange(startPosition: Position, endPosition: Position): Range {
		if (endPosition.isBefore(startPosition)) {
			// This tracked range has turned in on itself (end marker before start marker)
			// This can happen in extreme editing conditions where lots of text is removed and lots is added

			// Treat it as a collapsed range
			return new Range(startPosition.lineNumber, startPosition.column, startPosition.lineNumber, startPosition.column);
		}
		return new Range(startPosition.lineNumber, startPosition.column, endPosition.lineNumber, endPosition.column);
	}

	public getTrackedRange(rangeId: string): Range {
		var range = this._ranges[rangeId];
		var startMarker = this._getMarker(range.startMarkerId);
		var endMarker = this._getMarker(range.endMarkerId);

		return this._newEditorRange(startMarker, endMarker);
	}

	/**
	 * Fetch only multi-line ranges that intersect with the given line number range
	 */
	private _getMultiLineTrackedRanges(filterStartLineNumber: number, filterEndLineNumber: number): editorCommon.IModelTrackedRange[] {
		let result: editorCommon.IModelTrackedRange[] = [];

		let keys = Object.keys(this._multiLineTrackedRanges);
		for (let i = 0, len = keys.length; i < len; i++) {
			let rangeId = keys[i];
			let range = this._ranges[rangeId];

			let startMarker = this._getMarker(range.startMarkerId);
			if (startMarker.lineNumber > filterEndLineNumber) {
				continue;
			}

			let endMarker = this._getMarker(range.endMarkerId);
			if (endMarker.lineNumber < filterStartLineNumber) {
				continue;
			}

			result.push({
				id: range.id,
				range: this._newEditorRange(startMarker, endMarker)
			});
		}

		return result;
	}

	public getLinesTrackedRanges(startLineNumber: number, endLineNumber: number): editorCommon.IModelTrackedRange[] {
		var result = this._getMultiLineTrackedRanges(startLineNumber, endLineNumber),
			resultMap: { [rangeId: string]: boolean; } = {},
			lineMarkers: editorCommon.IReadOnlyLineMarker[],
			lineMarker: editorCommon.IReadOnlyLineMarker,
			rangeId: string,
			i: number,
			len: number,
			lineNumber: number,
			startMarker: Position,
			endMarker: Position;

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

	protected _onChangedMarkers(changedMarkers: ILineMarker[]): editorCommon.IChangedTrackedRanges {
		let changedRanges: editorCommon.IChangedTrackedRanges = {};

		for (let i = 0, len = changedMarkers.length; i < len; i++) {
			let marker = changedMarkers[i];

			if (this._markerIdToRangeId.hasOwnProperty(marker.id)) {
				let rangeId = this._markerIdToRangeId[marker.id];
				let range = this._ranges[rangeId];

				let startLineNumber = 0;
				let startColumn = 0;
				let endLineNumber = 0;
				let endColumn = 0;

				if (changedRanges.hasOwnProperty(range.id)) {
					let changedRange = changedRanges[range.id];
					startLineNumber = changedRange.startLineNumber;
					startColumn = changedRange.startColumn;
					endLineNumber = changedRange.endLineNumber;
					endColumn = changedRange.endColumn;
				}

				if (marker.id === range.startMarkerId) {
					startLineNumber = marker.oldLineNumber;
					startColumn = marker.oldColumn;
				} else {
					endLineNumber = marker.oldLineNumber;
					endColumn = marker.oldColumn;
				}

				changedRanges[range.id] = {
					startLineNumber: startLineNumber,
					startColumn: startColumn,
					endLineNumber: endLineNumber,
					endColumn: endColumn
				};

				this._setRangeIsMultiLine(range.id, (this._getMarker(range.startMarkerId).lineNumber !== this._getMarker(range.endMarkerId).lineNumber));
			}
		}
		return changedRanges;
	}

}