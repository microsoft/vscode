/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { IState } from 'vs/editor/common/modes';
import { TokensBinaryEncoding, DEFLATED_TOKENS_EMPTY_TEXT, DEFLATED_TOKENS_NON_EMPTY_TEXT, TokensBinaryEncodingValues, TokensInflatorMap } from 'vs/editor/common/model/tokensBinaryEncoding';
import { ModeTransition } from 'vs/editor/common/core/modeTransition';
import { Token } from 'vs/editor/common/core/token';
import { CharCode } from 'vs/base/common/charCode';
import { LineTokens } from 'vs/editor/common/core/lineTokens';
import { Position } from 'vs/editor/common/core/position';

export interface ILineEdit {
	startColumn: number;
	endColumn: number;
	text: string;
	forceMoveMarkers: boolean;
}

export class LineMarker {
	_lineMarkerBrand: void;

	public readonly id: string;
	public readonly decorationId: string;

	public stickToPreviousCharacter: boolean;
	public position: Position;

	constructor(id: string, decorationId: string, position: Position, stickToPreviousCharacter: boolean) {
		this.id = id;
		this.decorationId = decorationId;
		this.position = position;
		this.stickToPreviousCharacter = stickToPreviousCharacter;
	}

	public toString(): string {
		return '{\'' + this.id + '\';' + this.position.toString() + ',' + this.stickToPreviousCharacter + '}';
	}

	public updateLineNumber(markersTracker: MarkersTracker, lineNumber: number): void {
		if (this.position.lineNumber === lineNumber) {
			return;
		}
		markersTracker.addChangedMarker(this);
		this.position = new Position(lineNumber, this.position.column);
	}

	public updateColumn(markersTracker: MarkersTracker, column: number): void {
		if (this.position.column === column) {
			return;
		}
		markersTracker.addChangedMarker(this);
		this.position = new Position(this.position.lineNumber, column);
	}

	public updatePosition(markersTracker: MarkersTracker, position: Position): void {
		if (this.position.lineNumber === position.lineNumber && this.position.column === position.column) {
			return;
		}
		markersTracker.addChangedMarker(this);
		this.position = position;
	}

	public setPosition(position: Position) {
		this.position = position;
	}


	public static compareMarkers(a: LineMarker, b: LineMarker): number {
		if (a.position.column === b.position.column) {
			return (a.stickToPreviousCharacter ? 0 : 1) - (b.stickToPreviousCharacter ? 0 : 1);
		}
		return a.position.column - b.position.column;
	}
}

export class MarkersTracker {
	_changedDecorationsBrand: void;

	private _changedDecorations: string[];
	private _changedDecorationsLen: number;

	constructor() {
		this._changedDecorations = [];
		this._changedDecorationsLen = 0;
	}

	public addChangedMarker(marker: LineMarker): void {
		let decorationId = marker.decorationId;
		if (decorationId !== null) {
			this._changedDecorations[this._changedDecorationsLen++] = decorationId;
		}
	}

	public getDecorationIds(): string[] {
		return this._changedDecorations;
	}
}

export interface ITextWithMarkers {
	text: string;
	markers: LineMarker[];
}

interface ITokensAdjuster {
	adjust(toColumn: number, delta: number, minimumAllowedColumn: number): void;
	finish(delta: number, lineTextLength: number): void;
}

interface IMarkersAdjuster {
	adjustDelta(toColumn: number, delta: number, minimumAllowedColumn: number, moveSemantics: MarkerMoveSemantics): void;
	adjustSet(toColumn: number, newColumn: number, moveSemantics: MarkerMoveSemantics): void;
	finish(delta: number, lineTextLength: number): void;
}

var NO_OP_TOKENS_ADJUSTER: ITokensAdjuster = {
	adjust: () => { },
	finish: () => { }
};
var NO_OP_MARKERS_ADJUSTER: IMarkersAdjuster = {
	adjustDelta: () => { },
	adjustSet: () => { },
	finish: () => { }
};

const enum MarkerMoveSemantics {
	MarkerDefined = 0,
	ForceMove = 1,
	ForceStay = 2
}

/**
 * Returns:
 *  - 0 => the line consists of whitespace
 *  - otherwise => the indent level is returned value - 1
 */
function computePlusOneIndentLevel(line: string, tabSize: number): number {
	let indent = 0;
	let i = 0;
	let len = line.length;

	while (i < len) {
		let chCode = line.charCodeAt(i);
		if (chCode === CharCode.Space) {
			indent++;
		} else if (chCode === CharCode.Tab) {
			indent = indent - indent % tabSize + tabSize;
		} else {
			break;
		}
		i++;
	}

	if (i === len) {
		return 0; // line only consists of whitespace
	}

	return indent + 1;
}

export class ModelLine {
	private _lineNumber: number;
	public get lineNumber(): number { return this._lineNumber; }

	private _text: string;
	public get text(): string { return this._text; }

	/**
	 * bits 31 - 1 => indentLevel
	 * bit 0 => isInvalid
	 */
	private _metadata: number;

	public get isInvalid(): boolean {
		return (this._metadata & 0x00000001) ? true : false;
	}

	public set isInvalid(value: boolean) {
		this._metadata = (this._metadata & 0xfffffffe) | (value ? 1 : 0);
	}

	/**
	 * Returns:
	 *  - -1 => the line consists of whitespace
	 *  - otherwise => the indent level is returned value
	 */
	public getIndentLevel(): number {
		return ((this._metadata & 0xfffffffe) >> 1) - 1;
	}

	private _setPlusOneIndentLevel(value: number): void {
		this._metadata = (this._metadata & 0x00000001) | ((value & 0xefffffff) << 1);
	}

	public updateTabSize(tabSize: number): void {
		if (tabSize === 0) {
			// don't care mark
			this._metadata = this._metadata & 0x00000001;
		} else {
			this._setPlusOneIndentLevel(computePlusOneIndentLevel(this._text, tabSize));
		}
	}

	private _state: IState;
	private _modeTransitions: ModeTransition[];
	private _lineTokens: number[];
	private _markers: LineMarker[];

	constructor(lineNumber: number, text: string, tabSize: number) {
		this._lineNumber = lineNumber | 0;
		this._metadata = 0;
		this._setText(text, tabSize);
		this._state = null;
		this._modeTransitions = null;
		this._lineTokens = null;
		this._markers = null;
	}

	// --- BEGIN STATE

	public resetTokenizationState(): void {
		this._state = null;
		this._modeTransitions = null;
		this._lineTokens = null;
	}

	public setState(state: IState): void {
		this._state = state;
	}

	public getState(): IState {
		return this._state || null;
	}

	// --- END STATE

	// --- BEGIN MODE TRANSITIONS

	public getModeTransitions(topLevelModeId: string): ModeTransition[] {
		if (this._modeTransitions) {
			return this._modeTransitions;
		} else {
			return [new ModeTransition(0, topLevelModeId)];
		}
	}

	// --- END MODE TRANSITIONS

	// --- BEGIN TOKENS

	public setTokens(map: TokensInflatorMap, tokens: Token[], modeTransitions: ModeTransition[]): void {
		this._lineTokens = toLineTokensFromInflated(map, tokens, this._text.length);
		this._modeTransitions = toModeTransitions(map.topLevelModeId, modeTransitions);
	}

	private _setLineTokensFromDeflated(tokens: number[]): void {
		this._lineTokens = toLineTokensFromDeflated(tokens, this._text.length);
	}

	public getTokens(map: TokensInflatorMap): LineTokens {
		let lineTokens = this._lineTokens;
		if (!lineTokens) {
			if (this._text.length === 0) {
				lineTokens = DEFLATED_TOKENS_EMPTY_TEXT;
			} else {
				lineTokens = DEFLATED_TOKENS_NON_EMPTY_TEXT;
			}
		}

		return new LineTokens(map, lineTokens, this.getModeTransitions(map.topLevelModeId), this._text);
	}

	// --- END TOKENS

	private _createTokensAdjuster(): ITokensAdjuster {
		if (!this._lineTokens) {
			// This line does not have real tokens, so there is nothing to adjust
			return NO_OP_TOKENS_ADJUSTER;
		}

		let tokens = this._lineTokens;
		let tokensLength = tokens.length;
		let tokensIndex = 0;
		let currentTokenStartIndex = 0;

		let adjust = (toColumn: number, delta: number, minimumAllowedColumn: number) => {
			// console.log('before call: tokensIndex: ' + tokensIndex + ': ' + String(this.getTokens()));
			// console.log('adjustTokens: ' + toColumn + ' with delta: ' + delta + ' and [' + minimumAllowedColumn + ']');
			// console.log('currentTokenStartIndex: ' + currentTokenStartIndex);
			let minimumAllowedIndex = minimumAllowedColumn - 1;

			while (currentTokenStartIndex < toColumn && tokensIndex < tokensLength) {

				if (currentTokenStartIndex > 0 && delta !== 0) {
					// adjust token's `startIndex` by `delta`
					let deflatedType = (tokens[tokensIndex] / TokensBinaryEncodingValues.TYPE_OFFSET) & TokensBinaryEncodingValues.TYPE_MASK;
					let newStartIndex = Math.max(minimumAllowedIndex, currentTokenStartIndex + delta);
					let newToken = deflatedType * TokensBinaryEncodingValues.TYPE_OFFSET + newStartIndex * TokensBinaryEncodingValues.START_INDEX_OFFSET;

					if (delta < 0) {
						// pop all previous tokens that have become `collapsed`
						while (tokensIndex > 0) {
							let prevTokenStartIndex = (tokens[tokensIndex - 1] / TokensBinaryEncodingValues.START_INDEX_OFFSET) & TokensBinaryEncodingValues.START_INDEX_MASK;
							if (prevTokenStartIndex >= newStartIndex) {
								// Token at `tokensIndex` - 1 is now `collapsed` => pop it
								tokens.splice(tokensIndex - 1, 1);
								tokensLength--;
								tokensIndex--;
							} else {
								break;
							}
						}
					}
					tokens[tokensIndex] = newToken;
				}

				tokensIndex++;

				if (tokensIndex < tokensLength) {
					currentTokenStartIndex = (tokens[tokensIndex] / TokensBinaryEncodingValues.START_INDEX_OFFSET) & TokensBinaryEncodingValues.START_INDEX_MASK;
				}
			}
			// console.log('after call: tokensIndex: ' + tokensIndex + ': ' + String(this.getTokens()));
		};

		let finish = (delta: number, lineTextLength: number) => {
			adjust(Number.MAX_VALUE, delta, 1);
		};

		return {
			adjust: adjust,
			finish: finish
		};
	}

	private _setText(text: string, tabSize: number): void {
		this._text = text;
		if (tabSize === 0) {
			// don't care mark
			this._metadata = this._metadata & 0x00000001;
		} else {
			this._setPlusOneIndentLevel(computePlusOneIndentLevel(text, tabSize));
		}

		let tokens = this._lineTokens;
		if (tokens) {
			let lineTextLength = this._text.length;

			// Remove overflowing tokens
			while (tokens.length > 0) {
				let lastTokenStartIndex = (tokens[tokens.length - 1] / TokensBinaryEncodingValues.START_INDEX_OFFSET) & TokensBinaryEncodingValues.START_INDEX_MASK;
				if (lastTokenStartIndex < lineTextLength) {
					// Valid token
					break;
				}
				// This token now overflows the text => remove it
				tokens.pop();
			}

			this._setLineTokensFromDeflated(tokens);
		}
	}

	// private _printMarkers(): string {
	// 	if (!this._markers) {
	// 		return '[]';
	// 	}
	// 	if (this._markers.length === 0) {
	// 		return '[]';
	// 	}

	// 	var markers = this._markers;

	// 	var printMarker = (m:ILineMarker) => {
	// 		if (m.stickToPreviousCharacter) {
	// 			return '|' + m.column;
	// 		}
	// 		return m.column + '|';
	// 	};
	// 	return '[' + markers.map(printMarker).join(', ') + ']';
	// }

	private _createMarkersAdjuster(markersTracker: MarkersTracker): IMarkersAdjuster {
		if (!this._markers) {
			return NO_OP_MARKERS_ADJUSTER;
		}
		if (this._markers.length === 0) {
			return NO_OP_MARKERS_ADJUSTER;
		}

		this._markers.sort(LineMarker.compareMarkers);

		var markers = this._markers;
		var markersLength = markers.length;
		var markersIndex = 0;
		var marker = markers[markersIndex];

		// console.log('------------- INITIAL MARKERS: ' + this._printMarkers());

		let adjustMarkerBeforeColumn = (toColumn: number, moveSemantics: MarkerMoveSemantics) => {
			if (marker.position.column < toColumn) {
				return true;
			}
			if (marker.position.column > toColumn) {
				return false;
			}
			if (moveSemantics === MarkerMoveSemantics.ForceMove) {
				return false;
			}
			if (moveSemantics === MarkerMoveSemantics.ForceStay) {
				return true;
			}
			return marker.stickToPreviousCharacter;
		};

		let adjustDelta = (toColumn: number, delta: number, minimumAllowedColumn: number, moveSemantics: MarkerMoveSemantics) => {
			// console.log('------------------------------');
			// console.log('adjustDelta called: toColumn: ' + toColumn + ', delta: ' + delta + ', minimumAllowedColumn: ' + minimumAllowedColumn + ', moveSemantics: ' + MarkerMoveSemantics[moveSemantics]);
			// console.log('BEFORE::: markersIndex: ' + markersIndex + ' : ' + this._printMarkers());

			while (markersIndex < markersLength && adjustMarkerBeforeColumn(toColumn, moveSemantics)) {
				if (delta !== 0) {
					let newColumn = Math.max(minimumAllowedColumn, marker.position.column + delta);
					marker.updateColumn(markersTracker, newColumn);
				}

				markersIndex++;
				if (markersIndex < markersLength) {
					marker = markers[markersIndex];
				}
			}

			// console.log('AFTER::: markersIndex: ' + markersIndex + ' : ' + this._printMarkers());
		};

		let adjustSet = (toColumn: number, newColumn: number, moveSemantics: MarkerMoveSemantics) => {
			// console.log('------------------------------');
			// console.log('adjustSet called: toColumn: ' + toColumn + ', newColumn: ' + newColumn + ', moveSemantics: ' + MarkerMoveSemantics[moveSemantics]);
			// console.log('BEFORE::: markersIndex: ' + markersIndex + ' : ' + this._printMarkers());

			while (markersIndex < markersLength && adjustMarkerBeforeColumn(toColumn, moveSemantics)) {
				marker.updateColumn(markersTracker, newColumn);

				markersIndex++;
				if (markersIndex < markersLength) {
					marker = markers[markersIndex];
				}
			}

			// console.log('AFTER::: markersIndex: ' + markersIndex + ' : ' + this._printMarkers());
		};

		let finish = (delta: number, lineTextLength: number) => {
			adjustDelta(Number.MAX_VALUE, delta, 1, MarkerMoveSemantics.MarkerDefined);

			// console.log('------------- FINAL MARKERS: ' + this._printMarkers());
		};

		return {
			adjustDelta: adjustDelta,
			adjustSet: adjustSet,
			finish: finish
		};
	}

	public applyEdits(markersTracker: MarkersTracker, edits: ILineEdit[], tabSize: number): number {
		let deltaColumn = 0;
		let resultText = this._text;

		let tokensAdjuster = this._createTokensAdjuster();
		let markersAdjuster = this._createMarkersAdjuster(markersTracker);

		for (let i = 0, len = edits.length; i < len; i++) {
			let edit = edits[i];

			// console.log();
			// console.log('=============================');
			// console.log('EDIT #' + i + ' [ ' + edit.startColumn + ' -> ' + edit.endColumn + ' ] : <<<' + edit.text + '>>>, forceMoveMarkers: ' + edit.forceMoveMarkers);
			// console.log('deltaColumn: ' + deltaColumn);

			let startColumn = deltaColumn + edit.startColumn;
			let endColumn = deltaColumn + edit.endColumn;
			let deletingCnt = endColumn - startColumn;
			let insertingCnt = edit.text.length;

			// Adjust tokens & markers before this edit
			// console.log('Adjust tokens & markers before this edit');
			tokensAdjuster.adjust(edit.startColumn - 1, deltaColumn, 1);
			markersAdjuster.adjustDelta(edit.startColumn, deltaColumn, 1, edit.forceMoveMarkers ? MarkerMoveSemantics.ForceMove : (deletingCnt > 0 ? MarkerMoveSemantics.ForceStay : MarkerMoveSemantics.MarkerDefined));

			// Adjust tokens & markers for the common part of this edit
			let commonLength = Math.min(deletingCnt, insertingCnt);
			if (commonLength > 0) {
				// console.log('Adjust tokens & markers for the common part of this edit');
				tokensAdjuster.adjust(edit.startColumn - 1 + commonLength, deltaColumn, startColumn);

				if (!edit.forceMoveMarkers) {
					markersAdjuster.adjustDelta(edit.startColumn + commonLength, deltaColumn, startColumn, edit.forceMoveMarkers ? MarkerMoveSemantics.ForceMove : (deletingCnt > insertingCnt ? MarkerMoveSemantics.ForceStay : MarkerMoveSemantics.MarkerDefined));
				}
			}

			// Perform the edit & update `deltaColumn`
			resultText = resultText.substring(0, startColumn - 1) + edit.text + resultText.substring(endColumn - 1);
			deltaColumn += insertingCnt - deletingCnt;

			// Adjust tokens & markers inside this edit
			// console.log('Adjust tokens & markers inside this edit');
			tokensAdjuster.adjust(edit.endColumn, deltaColumn, startColumn);
			markersAdjuster.adjustSet(edit.endColumn, startColumn + insertingCnt, edit.forceMoveMarkers ? MarkerMoveSemantics.ForceMove : MarkerMoveSemantics.MarkerDefined);
		}

		// Wrap up tokens & markers; adjust remaining if needed
		tokensAdjuster.finish(deltaColumn, resultText.length);
		markersAdjuster.finish(deltaColumn, resultText.length);

		// Save the resulting text
		this._setText(resultText, tabSize);

		return deltaColumn;
	}

	public split(markersTracker: MarkersTracker, splitColumn: number, forceMoveMarkers: boolean, tabSize: number): ModelLine {
		// console.log('--> split @ ' + splitColumn + '::: ' + this._printMarkers());
		var myText = this._text.substring(0, splitColumn - 1);
		var otherText = this._text.substring(splitColumn - 1);

		var otherMarkers: LineMarker[] = null;

		if (this._markers) {
			this._markers.sort(LineMarker.compareMarkers);
			for (let i = 0, len = this._markers.length; i < len; i++) {
				let marker = this._markers[i];

				if (
					marker.position.column > splitColumn
					|| (
						marker.position.column === splitColumn
						&& (
							forceMoveMarkers
							|| !marker.stickToPreviousCharacter
						)
					)
				) {
					let myMarkers = this._markers.slice(0, i);
					otherMarkers = this._markers.slice(i);
					this._markers = myMarkers;
					break;
				}
			}

			if (otherMarkers) {
				for (let i = 0, len = otherMarkers.length; i < len; i++) {
					let marker = otherMarkers[i];

					marker.updateColumn(markersTracker, marker.position.column - (splitColumn - 1));
				}
			}
		}

		this._setText(myText, tabSize);

		var otherLine = new ModelLine(this._lineNumber + 1, otherText, tabSize);
		if (otherMarkers) {
			otherLine.addMarkers(otherMarkers);
		}
		return otherLine;
	}

	public append(markersTracker: MarkersTracker, other: ModelLine, tabSize: number): void {
		// console.log('--> append: THIS :: ' + this._printMarkers());
		// console.log('--> append: OTHER :: ' + this._printMarkers());
		var thisTextLength = this._text.length;
		this._setText(this._text + other._text, tabSize);

		let otherTokens = other._lineTokens;
		if (otherTokens) {
			// Other has real tokens

			// Adjust other tokens
			if (thisTextLength > 0) {
				for (let i = 0, len = otherTokens.length; i < len; i++) {
					let token = otherTokens[i];

					let deflatedStartIndex = (token / TokensBinaryEncodingValues.START_INDEX_OFFSET) & TokensBinaryEncodingValues.START_INDEX_MASK;
					let deflatedType = (token / TokensBinaryEncodingValues.TYPE_OFFSET) & TokensBinaryEncodingValues.TYPE_MASK;
					let newStartIndex = deflatedStartIndex + thisTextLength;
					let newToken = deflatedType * TokensBinaryEncodingValues.TYPE_OFFSET + newStartIndex * TokensBinaryEncodingValues.START_INDEX_OFFSET;

					otherTokens[i] = newToken;
				}
			}

			// Append other tokens
			let myLineTokens = this._lineTokens;
			if (myLineTokens) {
				// I have real tokens
				this._setLineTokensFromDeflated(myLineTokens.concat(otherTokens));
			} else {
				// I don't have real tokens
				this._setLineTokensFromDeflated(otherTokens);
			}
		}

		if (other._markers) {
			// Other has markers
			let otherMarkers = other._markers;

			// Adjust other markers
			for (let i = 0, len = otherMarkers.length; i < len; i++) {
				let marker = otherMarkers[i];

				marker.updatePosition(markersTracker, new Position(this._lineNumber, marker.position.column + thisTextLength));
			}

			this.addMarkers(otherMarkers);
		}
	}

	public addMarker(marker: LineMarker): void {
		if (!this._markers) {
			this._markers = [marker];
		} else {
			this._markers.push(marker);
		}
	}

	public addMarkers(markers: LineMarker[]): void {
		if (markers.length === 0) {
			return;
		}

		if (!this._markers) {
			this._markers = markers.slice(0);
		} else {
			this._markers = this._markers.concat(markers);
		}
	}

	public removeMarker(marker: LineMarker): void {
		if (!this._markers) {
			return;
		}

		let index = this._indexOfMarkerId(marker.id);
		if (index < 0) {
			return;
		}

		if (this._markers.length === 1) {
			// was last marker on line
			this._markers = null;
		} else {
			this._markers.splice(index, 1);
		}
	}

	public removeMarkers(deleteMarkers: { [markerId: string]: boolean; }): void {
		if (!this._markers) {
			return;
		}
		for (let i = 0, len = this._markers.length; i < len; i++) {
			let marker = this._markers[i];

			if (deleteMarkers[marker.id]) {
				this._markers.splice(i, 1);
				len--;
				i--;
			}
		}
		if (this._markers.length === 0) {
			this._markers = null;
		}
	}

	public getMarkers(): LineMarker[] {
		if (!this._markers) {
			return [];
		}
		return this._markers.slice(0);
	}

	public updateLineNumber(markersTracker: MarkersTracker, newLineNumber: number): void {
		if (this._lineNumber === newLineNumber) {
			return;
		}
		if (this._markers) {
			let markers = this._markers;
			for (let i = 0, len = markers.length; i < len; i++) {
				let marker = markers[i];
				marker.updateLineNumber(markersTracker, newLineNumber);
			}
		}

		this._lineNumber = newLineNumber;
	}

	public deleteLine(): LineMarker[] {
		if (!this._markers) {
			return [];
		}
		return this._markers;
	}

	private _indexOfMarkerId(markerId: string): number {
		let markers = this._markers;
		for (let i = 0, len = markers.length; i < len; i++) {
			if (markers[i].id === markerId) {
				return i;
			}
		}
	}
}

function toLineTokensFromInflated(map: TokensInflatorMap, tokens: Token[], textLength: number): number[] {
	if (textLength === 0) {
		return null;
	}
	if (!tokens || tokens.length === 0) {
		return null;
	}
	if (tokens.length === 1) {
		if (tokens[0].startIndex === 0 && tokens[0].type === '') {
			return null;
		}
	}

	return TokensBinaryEncoding.deflateArr(map, tokens);
}

function toLineTokensFromDeflated(tokens: number[], textLength: number): number[] {
	if (textLength === 0) {
		return null;
	}
	if (!tokens || tokens.length === 0) {
		return null;
	}
	if (tokens.length === 1) {
		if (tokens[0] === 0) {
			return null;
		}
	}
	return tokens;
}

function toModeTransitions(topLevelModeId: string, modeTransitions: ModeTransition[]): ModeTransition[] {

	if (!modeTransitions || modeTransitions.length === 0) {
		return null;
	} else if (modeTransitions.length === 1 && modeTransitions[0].startIndex === 0 && modeTransitions[0].modeId === topLevelModeId) {
		return null;
	}

	return modeTransitions;
}
