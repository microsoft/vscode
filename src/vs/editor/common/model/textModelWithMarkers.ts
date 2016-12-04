/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { IdGenerator } from 'vs/base/common/idGenerator';
import { Position } from 'vs/editor/common/core/position';
import { IRawText, ITextModelWithMarkers } from 'vs/editor/common/editorCommon';
import { LineMarker } from 'vs/editor/common/model/modelLine';
import { TextModelWithTokens } from 'vs/editor/common/model/textModelWithTokens';

export interface IMarkerIdToMarkerMap {
	[key: string]: LineMarker;
}

export interface INewMarker {
	decorationId: string;
	lineNumber: number;
	column: number;
	stickToPreviousCharacter: boolean;
}

var _INSTANCE_COUNT = 0;

export class TextModelWithMarkers extends TextModelWithTokens implements ITextModelWithMarkers {

	private _markerIdGenerator: IdGenerator;
	protected _markerIdToMarker: IMarkerIdToMarkerMap;
	constructor(allowedEventTypes: string[], rawText: IRawText, languageId: string) {
		super(allowedEventTypes, rawText, languageId);
		this._markerIdGenerator = new IdGenerator((++_INSTANCE_COUNT) + ';');
		this._markerIdToMarker = {};
	}

	public dispose(): void {
		this._markerIdToMarker = null;
		super.dispose();
	}

	protected _resetValue(newValue: IRawText): void {
		super._resetValue(newValue);

		// Destroy all my markers
		this._markerIdToMarker = {};
	}

	_addMarker(decorationId: string, lineNumber: number, column: number, stickToPreviousCharacter: boolean): string {
		var pos = this.validatePosition(new Position(lineNumber, column));

		var marker = new LineMarker(this._markerIdGenerator.nextId(), decorationId, pos.column, stickToPreviousCharacter);
		this._markerIdToMarker[marker.id] = marker;

		this._lines[pos.lineNumber - 1].addMarker(marker);

		return marker.id;
	}

	protected _addMarkers(newMarkers: INewMarker[]): string[] {
		let addMarkersPerLine: {
			[lineNumber: number]: LineMarker[];
		} = Object.create(null);

		let result: string[] = [];
		for (let i = 0, len = newMarkers.length; i < len; i++) {
			let newMarker = newMarkers[i];

			let marker = new LineMarker(this._markerIdGenerator.nextId(), newMarker.decorationId, newMarker.column, newMarker.stickToPreviousCharacter);
			this._markerIdToMarker[marker.id] = marker;

			if (!addMarkersPerLine[newMarker.lineNumber]) {
				addMarkersPerLine[newMarker.lineNumber] = [];
			}
			addMarkersPerLine[newMarker.lineNumber].push(marker);

			result.push(marker.id);
		}

		let lineNumbers = Object.keys(addMarkersPerLine);
		for (let i = 0, len = lineNumbers.length; i < len; i++) {
			let lineNumber = parseInt(lineNumbers[i], 10);
			this._lines[lineNumber - 1].addMarkers(addMarkersPerLine[lineNumbers[i]]);
		}

		return result;
	}

	_changeMarker(id: string, lineNumber: number, column: number): void {
		if (this._markerIdToMarker.hasOwnProperty(id)) {
			var marker = this._markerIdToMarker[id];
			var newPos = this.validatePosition(new Position(lineNumber, column));

			if (newPos.lineNumber !== marker.line.lineNumber) {
				// Move marker between lines
				marker.line.removeMarker(marker);
				this._lines[newPos.lineNumber - 1].addMarker(marker);
			}

			// Update marker column
			marker.column = newPos.column;
		}
	}

	_changeMarkerStickiness(id: string, newStickToPreviousCharacter: boolean): void {
		if (this._markerIdToMarker.hasOwnProperty(id)) {
			var marker = this._markerIdToMarker[id];

			if (marker.stickToPreviousCharacter !== newStickToPreviousCharacter) {
				marker.stickToPreviousCharacter = newStickToPreviousCharacter;
			}
		}
	}

	_getMarker(id: string): Position {
		if (this._markerIdToMarker.hasOwnProperty(id)) {
			var marker = this._markerIdToMarker[id];
			return marker.getPosition();
		}
		return null;
	}

	_getMarkersCount(): number {
		return Object.keys(this._markerIdToMarker).length;
	}

	protected _getLineMarkers(lineNumber: number): LineMarker[] {
		if (lineNumber < 1 || lineNumber > this.getLineCount()) {
			throw new Error('Illegal value ' + lineNumber + ' for `lineNumber`');
		}

		return this._lines[lineNumber - 1].getMarkers();
	}

	_removeMarker(id: string): void {
		if (this._markerIdToMarker.hasOwnProperty(id)) {
			var marker = this._markerIdToMarker[id];
			marker.line.removeMarker(marker);
			delete this._markerIdToMarker[id];
		}
	}

	protected _removeMarkers(ids: string[]): void {
		let removeMarkersPerLine: {
			[lineNumber: number]: {
				[markerId: string]: boolean;
			};
		} = Object.create(null);

		for (let i = 0, len = ids.length; i < len; i++) {
			let id = ids[i];

			if (!this._markerIdToMarker.hasOwnProperty(id)) {
				continue;
			}

			let marker = this._markerIdToMarker[id];

			let lineNumber = marker.line.lineNumber;
			if (!removeMarkersPerLine[lineNumber]) {
				removeMarkersPerLine[lineNumber] = Object.create(null);
			}
			removeMarkersPerLine[lineNumber][id] = true;

			delete this._markerIdToMarker[id];
		}

		let lineNumbers = Object.keys(removeMarkersPerLine);
		for (let i = 0, len = lineNumbers.length; i < len; i++) {
			let lineNumber = parseInt(lineNumbers[i], 10);
			this._lines[lineNumber - 1].removeMarkers(removeMarkersPerLine[lineNumbers[i]]);
		}
	}
}
