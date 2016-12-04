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

	protected _addMarkers(newMarkers: INewMarker[]): LineMarker[] {
		if (newMarkers.length === 0) {
			return [];
		}

		let markers: LineMarker[] = [];
		let sortIndices: number[] = [];
		for (let i = 0, len = newMarkers.length; i < len; i++) {
			let newMarker = newMarkers[i];

			let marker = new LineMarker(this._markerIdGenerator.nextId(), newMarker.decorationId, newMarker.column, newMarker.stickToPreviousCharacter);
			this._markerIdToMarker[marker.id] = marker;

			markers[i] = marker;
			sortIndices[i] = i;
		}

		sortIndices.sort((a, b) => {
			return newMarkers[a].lineNumber - newMarkers[b].lineNumber;
		});

		let currentLineNumber = 0;
		let currentMarkers: LineMarker[] = [], currentMarkersLen = 0;
		for (let i = 0, len = newMarkers.length; i < len; i++) {
			let sortIndex = sortIndices[i];

			let lineNumber = newMarkers[sortIndex].lineNumber;
			let marker = markers[sortIndex];

			if (lineNumber !== currentLineNumber) {
				if (currentLineNumber !== 0) {
					this._lines[currentLineNumber - 1].addMarkers(currentMarkers);
				}
				currentLineNumber = lineNumber;
				currentMarkers.length = 0;
				currentMarkersLen = 0;
			}

			currentMarkers[currentMarkersLen++] = marker;
		}
		this._lines[currentLineNumber - 1].addMarkers(currentMarkers);

		return markers;
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

	protected _removeMarkers(markers: LineMarker[]): void {
		markers.sort((a, b) => {
			return a.line.lineNumber - b.line.lineNumber;
		});

		let currentLineNumber = 0;
		let currentMarkers: { [markerId: string]: boolean; } = null;
		for (let i = 0, len = markers.length; i < len; i++) {
			let marker = markers[i];
			delete this._markerIdToMarker[marker.id];

			let lineNumber = marker.line.lineNumber;

			if (lineNumber !== currentLineNumber) {
				if (currentLineNumber !== 0) {
					this._lines[currentLineNumber - 1].removeMarkers(currentMarkers);
				}
				currentLineNumber = lineNumber;
				currentMarkers = Object.create(null);
			}

			currentMarkers[marker.id] = true;
		}
		this._lines[currentLineNumber - 1].removeMarkers(currentMarkers);
	}
}
