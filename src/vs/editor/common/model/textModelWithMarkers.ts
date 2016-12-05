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
	position: Position;
	stickToPreviousCharacter: boolean;
}

var _INSTANCE_COUNT = 0;

export class TextModelWithMarkers extends TextModelWithTokens implements ITextModelWithMarkers {

	private _markerIdGenerator: IdGenerator;
	protected _markerIdToMarker: IMarkerIdToMarkerMap;
	constructor(allowedEventTypes: string[], rawText: IRawText, languageId: string) {
		super(allowedEventTypes, rawText, languageId);
		this._markerIdGenerator = new IdGenerator((++_INSTANCE_COUNT) + ';');
		this._markerIdToMarker = Object.create(null);
	}

	public dispose(): void {
		this._markerIdToMarker = null;
		super.dispose();
	}

	protected _resetValue(newValue: IRawText): void {
		super._resetValue(newValue);

		// Destroy all my markers
		this._markerIdToMarker = Object.create(null);
	}

	_addMarker(decorationId: string, lineNumber: number, column: number, stickToPreviousCharacter: boolean): string {
		var pos = this.validatePosition(new Position(lineNumber, column));

		var marker = new LineMarker(this._markerIdGenerator.nextId(), decorationId, pos, stickToPreviousCharacter);
		this._markerIdToMarker[marker.id] = marker;

		this._lines[pos.lineNumber - 1].addMarker(marker);

		return marker.id;
	}

	protected _addMarkers(newMarkers: INewMarker[]): LineMarker[] {
		if (newMarkers.length === 0) {
			return [];
		}

		let markers: LineMarker[] = [];
		for (let i = 0, len = newMarkers.length; i < len; i++) {
			let newMarker = newMarkers[i];

			let marker = new LineMarker(this._markerIdGenerator.nextId(), newMarker.decorationId, newMarker.position, newMarker.stickToPreviousCharacter);
			this._markerIdToMarker[marker.id] = marker;

			markers[i] = marker;
		}

		let sortedMarkers = markers.slice(0);
		sortedMarkers.sort((a, b) => {
			return a.position.lineNumber - b.position.lineNumber;
		});

		let currentLineNumber = 0;
		let currentMarkers: LineMarker[] = [], currentMarkersLen = 0;
		for (let i = 0, len = sortedMarkers.length; i < len; i++) {
			let marker = sortedMarkers[i];

			if (marker.position.lineNumber !== currentLineNumber) {
				if (currentLineNumber !== 0) {
					this._lines[currentLineNumber - 1].addMarkers(currentMarkers);
				}
				currentLineNumber = marker.position.lineNumber;
				currentMarkers.length = 0;
				currentMarkersLen = 0;
			}

			currentMarkers[currentMarkersLen++] = marker;
		}
		this._lines[currentLineNumber - 1].addMarkers(currentMarkers);

		return markers;
	}

	_changeMarker(id: string, lineNumber: number, column: number): void {
		let marker = this._markerIdToMarker[id];
		if (!marker) {
			return;
		}

		let newPos = this.validatePosition(new Position(lineNumber, column));

		if (newPos.lineNumber !== marker.position.lineNumber) {
			// Move marker between lines
			this._lines[marker.position.lineNumber - 1].removeMarker(marker);
			this._lines[newPos.lineNumber - 1].addMarker(marker);
		}

		marker.setPosition(newPos);
	}

	_changeMarkerStickiness(id: string, newStickToPreviousCharacter: boolean): void {
		let marker = this._markerIdToMarker[id];
		if (!marker) {
			return;
		}

		marker.stickToPreviousCharacter = newStickToPreviousCharacter;
	}

	_getMarker(id: string): Position {
		let marker = this._markerIdToMarker[id];
		if (!marker) {
			return null;
		}

		return marker.position;
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
		let marker = this._markerIdToMarker[id];
		if (!marker) {
			return;
		}

		this._lines[marker.position.lineNumber - 1].removeMarker(marker);
		delete this._markerIdToMarker[id];
	}

	protected _removeMarkers(markers: LineMarker[]): void {
		markers.sort((a, b) => {
			return a.position.lineNumber - b.position.lineNumber;
		});

		let currentLineNumber = 0;
		let currentMarkers: { [markerId: string]: boolean; } = null;
		for (let i = 0, len = markers.length; i < len; i++) {
			let marker = markers[i];
			delete this._markerIdToMarker[marker.id];

			if (marker.position.lineNumber !== currentLineNumber) {
				if (currentLineNumber !== 0) {
					this._lines[currentLineNumber - 1].removeMarkers(currentMarkers);
				}
				currentLineNumber = marker.position.lineNumber;
				currentMarkers = Object.create(null);
			}

			currentMarkers[marker.id] = true;
		}
		this._lines[currentLineNumber - 1].removeMarkers(currentMarkers);
	}
}
