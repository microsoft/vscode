/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { IdGenerator } from 'vs/base/common/idGenerator';
import { Range } from 'vs/editor/common/core/range';
import * as editorCommon from 'vs/editor/common/editorCommon';
import { LineMarker } from 'vs/editor/common/model/modelLine';
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

class TrackedRange implements ITrackedRange {
	public readonly id: string;
	public readonly startMarkerId: string;
	public readonly endMarkerId: string;

	constructor(id: string, startMarkedId: string, endMarkerId: string) {
		this.id = id;
		this.startMarkerId = startMarkedId;
		this.endMarkerId = endMarkerId;
	}
}

var _INSTANCE_COUNT = 0;

export class TextModelWithTrackedRanges extends TextModelWithMarkers {

	private _rangeIdGenerator: IdGenerator;
	private _ranges: ITrackedRangesMap;
	private _multiLineTrackedRanges: { [key: string]: boolean; };

	constructor(allowedEventTypes: string[], rawText: editorCommon.IRawText, languageId: string) {
		super(allowedEventTypes, rawText, languageId);
		this._rangeIdGenerator = new IdGenerator((++_INSTANCE_COUNT) + ';');
		this._ranges = {};
		this._multiLineTrackedRanges = {};
	}

	public dispose(): void {
		this._ranges = null;
		this._multiLineTrackedRanges = null;
		super.dispose();
	}

	protected _resetValue(newValue: editorCommon.IRawText): void {
		super._resetValue(newValue);

		// Destroy all my tracked ranges
		this._ranges = {};
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

	protected _addTrackedRange(_textRange: editorCommon.IRange, stickiness: editorCommon.TrackedRangeStickiness): string {
		let textRange = this.validateRange(_textRange);

		let startMarkerSticksToPreviousCharacter = this._shouldStartMarkerSticksToPreviousCharacter(stickiness);
		let endMarkerSticksToPreviousCharacter = this._shouldEndMarkerSticksToPreviousCharacter(stickiness);

		let rangeId = this._rangeIdGenerator.nextId();

		let startMarkerId = this._addMarker(rangeId, textRange.startLineNumber, textRange.startColumn, startMarkerSticksToPreviousCharacter);
		let endMarkerId = this._addMarker(rangeId, textRange.endLineNumber, textRange.endColumn, endMarkerSticksToPreviousCharacter);

		let range = new TrackedRange(rangeId, startMarkerId, endMarkerId);
		this._ranges[range.id] = range;

		this._setRangeIsMultiLine(range.id, (textRange.startLineNumber !== textRange.endLineNumber));

		return range.id;
	}

	protected _addTrackedRanges(textRanges: editorCommon.IRange[], stickinessArr: editorCommon.TrackedRangeStickiness[]): string[] {
		let addMarkers: INewMarker[] = [];
		let addRangeId: string[] = [];
		for (let i = 0, len = textRanges.length; i < len; i++) {
			let textRange = textRanges[i];
			let stickiness = stickinessArr[i];

			let rangeId = this._rangeIdGenerator.nextId();

			addMarkers.push({
				rangeId: rangeId,
				lineNumber: textRange.startLineNumber,
				column: textRange.startColumn,
				stickToPreviousCharacter: this._shouldStartMarkerSticksToPreviousCharacter(stickiness)
			});
			addMarkers.push({
				rangeId: rangeId,
				lineNumber: textRange.endLineNumber,
				column: textRange.endColumn,
				stickToPreviousCharacter: this._shouldEndMarkerSticksToPreviousCharacter(stickiness)
			});
			addRangeId.push(rangeId);
		}

		let markerIds = this._addMarkers(addMarkers);

		let result: string[] = [];
		for (let i = 0, len = textRanges.length; i < len; i++) {
			let textRange = textRanges[i];
			let startMarkerId = markerIds[2 * i];
			let endMarkerId = markerIds[2 * i + 1];

			let range = new TrackedRange(addRangeId[i], startMarkerId, endMarkerId);
			this._ranges[range.id] = range;

			this._setRangeIsMultiLine(range.id, (textRange.startLineNumber !== textRange.endLineNumber));

			result.push(range.id);
		}

		return result;
	}

	protected _changeTrackedRange(rangeId: string, newTextRange: editorCommon.IRange): void {
		if (this._ranges.hasOwnProperty(rangeId)) {
			newTextRange = this.validateRange(newTextRange);

			var range = this._ranges[rangeId];
			this._changeMarker(range.startMarkerId, newTextRange.startLineNumber, newTextRange.startColumn);
			this._changeMarker(range.endMarkerId, newTextRange.endLineNumber, newTextRange.endColumn);

			this._setRangeIsMultiLine(range.id, (newTextRange.startLineNumber !== newTextRange.endLineNumber));
		}
	}

	protected _changeTrackedRangeStickiness(rangeId: string, newStickiness: editorCommon.TrackedRangeStickiness): void {
		if (this._ranges.hasOwnProperty(rangeId)) {
			var range = this._ranges[rangeId];
			this._changeMarkerStickiness(range.startMarkerId, this._shouldStartMarkerSticksToPreviousCharacter(newStickiness));
			this._changeMarkerStickiness(range.endMarkerId, this._shouldEndMarkerSticksToPreviousCharacter(newStickiness));
		}
	}

	protected _removeTrackedRange(rangeId: string): void {
		if (this._ranges.hasOwnProperty(rangeId)) {
			var range = this._ranges[rangeId];

			this._removeMarker(range.startMarkerId);
			this._removeMarker(range.endMarkerId);

			this._setRangeIsMultiLine(range.id, false);
			delete this._ranges[range.id];
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

	protected _getTrackedRange(rangeId: string): Range {
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

	protected _getLinesTrackedRanges(startLineNumber: number, endLineNumber: number): editorCommon.IModelTrackedRange[] {
		let result = this._getMultiLineTrackedRanges(startLineNumber, endLineNumber);
		let resultMap: { [rangeId: string]: boolean; } = {};

		for (let i = 0, len = result.length; i < len; i++) {
			resultMap[result[i].id] = true;
		}

		for (let lineNumber = startLineNumber; lineNumber <= endLineNumber; lineNumber++) {
			let lineMarkers = this._getLineMarkers(lineNumber);
			for (let i = 0, len = lineMarkers.length; i < len; i++) {
				let lineMarker = lineMarkers[i];

				if (lineMarker.rangeId !== null) {
					let rangeId = lineMarker.rangeId;
					if (!resultMap.hasOwnProperty(rangeId)) {
						let startMarker = this._getMarker(this._ranges[rangeId].startMarkerId);
						let endMarker = this._getMarker(this._ranges[rangeId].endMarkerId);

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

	protected _onChangedMarkers(changedMarkers: LineMarker[]): string[] {
		// Collect changed ranges (might contain duplicates)
		let changedRanges: string[] = [], changedRangesLen = 0;
		for (let i = 0, len = changedMarkers.length; i < len; i++) {
			let marker = changedMarkers[i];

			if (marker.rangeId !== null) {
				let rangeId = marker.rangeId;

				changedRanges[changedRangesLen++] = rangeId;
			}
		}

		// Eliminate duplicates
		changedRanges.sort();

		let uniqueChangedRanges: string[] = [], uniqueChangedRangesLen = 0;
		let prevChangedRange: string = null;
		for (let i = 0, len = changedRanges.length; i < len; i++) {
			let changedRangeId = changedRanges[i];

			if (changedRangeId !== prevChangedRange) {
				uniqueChangedRanges[uniqueChangedRangesLen++] = changedRangeId;
			}

			prevChangedRange = changedRangeId;
		}

		// update multiline flags
		for (let i = 0, len = uniqueChangedRanges.length; i < len; i++) {
			let changedRangeId = uniqueChangedRanges[i];
			let range = this._ranges[changedRangeId];
			this._setRangeIsMultiLine(range.id, (this._getMarker(range.startMarkerId).lineNumber !== this._getMarker(range.endMarkerId).lineNumber));
		}

		return uniqueChangedRanges;
	}

}