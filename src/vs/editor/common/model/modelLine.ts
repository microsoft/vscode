/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as strings from 'vs/base/common/strings';
import {ILineTokens, IReadOnlyLineMarker} from 'vs/editor/common/editorCommon';
import {IMode, IState} from 'vs/editor/common/modes';
import {TokensBinaryEncoding, TokensInflatorMap} from 'vs/editor/common/model/tokensBinaryEncoding';
import {ModeTransition} from 'vs/editor/common/core/modeTransition';
import {LineToken} from 'vs/editor/common/model/lineToken';
import {ViewLineToken} from 'vs/editor/common/core/viewLineToken';

const START_INDEX_MASK = TokensBinaryEncoding.START_INDEX_MASK;
const TYPE_MASK = TokensBinaryEncoding.TYPE_MASK;
const START_INDEX_OFFSET = TokensBinaryEncoding.START_INDEX_OFFSET;
const TYPE_OFFSET = TokensBinaryEncoding.TYPE_OFFSET;

export interface ILineEdit {
	startColumn: number;
	endColumn: number;
	text: string;
	forceMoveMarkers: boolean;
}

export interface ILineMarker extends IReadOnlyLineMarker {
	id:string;
	column:number;
	stickToPreviousCharacter:boolean;

	oldLineNumber:number;
	oldColumn:number;

	line:ModelLine;
}

export interface IChangedMarkers {
	[markerId:string]: boolean;
}

export interface ITextWithMarkers {
	text: string;
	markers: ILineMarker[];
}

interface ITokensAdjuster {
	adjust(toColumn:number, delta:number, minimumAllowedColumn:number): void;
	finish(delta:number, lineTextLength:number): void;
}

interface IMarkersAdjuster {
	adjustDelta(toColumn:number, delta:number, minimumAllowedColumn:number, moveSemantics:MarkerMoveSemantics): void;
	adjustSet(toColumn:number, newColumn:number, moveSemantics:MarkerMoveSemantics): void;
	finish(delta:number, lineTextLength:number): void;
}

var NO_OP_TOKENS_ADJUSTER: ITokensAdjuster = {
	adjust: () => {},
	finish: () => {}
};
var NO_OP_MARKERS_ADJUSTER: IMarkersAdjuster = {
	adjustDelta: () => {},
	adjustSet: () => {},
	finish: () => {}
};

enum MarkerMoveSemantics {
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
		if (chCode === 32 /*space*/) {
			indent++;
		} else if (chCode === 9 /*\t*/) {
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
	private _lineNumber:number;
	public get lineNumber():number { return this._lineNumber; }

	private _text:string;
	public get text():string { return this._text; }

	/**
	 * bits 31 - 1 => indentLevel
	 * bit 0 => isInvalid
	 */
	private _metadata:number;

	public get isInvalid(): boolean {
		return (this._metadata & 0x00000001) ? true : false;
	}

	public set isInvalid(value:boolean) {
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

	private _setPlusOneIndentLevel(value:number): void {
		this._metadata = (this._metadata & 0x00000001) | ((value & 0xefffffff) << 1);
	}

	public updateTabSize(tabSize:number): void {
		if (tabSize === 0) {
			// don't care mark
			this._metadata = this._metadata & 0x00000001;
		} else {
			this._setPlusOneIndentLevel(computePlusOneIndentLevel(this._text, tabSize));
		}
	}

	private _state:IState;
	private _modeTransitions: ModeTransition[];
	private _lineTokens: LineTokens;
	private _markers:ILineMarker[];

	constructor(lineNumber:number, text:string, tabSize:number) {
		this._lineNumber = lineNumber|0;
		this._metadata = 0;
		this._setText(text, tabSize);
		this._state = null;
		this._modeTransitions = null;
		this._lineTokens = null;
		this._markers = null;
	}

	// --- BEGIN STATE

	public setState(state: IState): void {
		this._state = state;
	}

	public getState(): IState {
		return this._state || null;
	}

	// --- END STATE

	// --- BEGIN MODE TRANSITIONS

	public getModeTransitions(topLevelMode:IMode): ModeTransition[] {
		if (this._modeTransitions) {
			return this._modeTransitions;
		} else {
			return [new ModeTransition(0, topLevelMode)];
		}
	}

	// --- END MODE TRANSITIONS

	// --- BEGIN TOKENS

	public setTokens(map: TokensInflatorMap, tokens: LineToken[], topLevelMode:IMode, modeTransitions:ModeTransition[]): void {
		this._lineTokens = toLineTokensFromInflated(map, tokens, this._text.length);
		this._modeTransitions = toModeTransitions(topLevelMode, modeTransitions);
	}

	private _setLineTokensFromDeflated(map:TokensInflatorMap, tokens:number[]): void {
		this._lineTokens = toLineTokensFromDeflated(map, tokens, this._text.length);
	}

	public getTokens(): ILineTokens {
		if (this._lineTokens) {
			return this._lineTokens;
		}
		if (this._text.length === 0) {
			return EmptyLineTokens.INSTANCE;
		}
		return DefaultLineTokens.INSTANCE;
	}

	// --- END TOKENS

	private _createTokensAdjuster(): ITokensAdjuster {
		if (!this._lineTokens) {
			// This line does not have real tokens, so there is nothing to adjust
			return NO_OP_TOKENS_ADJUSTER;
		}

		var lineTokens = this._lineTokens;

		let tokens = lineTokens.getBinaryEncodedTokens();
		let tokensLength = tokens.length;
		let tokensIndex = 0;
		let currentTokenStartIndex = 0;

		let adjust = (toColumn:number, delta:number, minimumAllowedColumn:number) => {
			// console.log('before call: tokensIndex: ' + tokensIndex + ': ' + String(this.getTokens()));
			// console.log('adjustTokens: ' + toColumn + ' with delta: ' + delta + ' and [' + minimumAllowedColumn + ']');
			// console.log('currentTokenStartIndex: ' + currentTokenStartIndex);
			let minimumAllowedIndex = minimumAllowedColumn - 1;

			while (currentTokenStartIndex < toColumn && tokensIndex < tokensLength) {

				if (currentTokenStartIndex > 0 && delta !== 0) {
					// adjust token's `startIndex` by `delta`
					let deflatedType = (tokens[tokensIndex] / TYPE_OFFSET) & TYPE_MASK;
					let newStartIndex = Math.max(minimumAllowedIndex, currentTokenStartIndex + delta);
					let newToken = deflatedType * TYPE_OFFSET + newStartIndex * START_INDEX_OFFSET;

					if (delta < 0) {
						// pop all previous tokens that have become `collapsed`
						while (tokensIndex > 0) {
							let prevTokenStartIndex = (tokens[tokensIndex - 1] / START_INDEX_OFFSET) & START_INDEX_MASK;
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
					currentTokenStartIndex = (tokens[tokensIndex] / START_INDEX_OFFSET) & START_INDEX_MASK;
				}
			}
			// console.log('after call: tokensIndex: ' + tokensIndex + ': ' + String(this.getTokens()));
		};

		let finish = (delta:number, lineTextLength:number) => {
			adjust(Number.MAX_VALUE, delta, 1);
		};

		return {
			adjust: adjust,
			finish: finish
		};
	}

	private _setText(text:string, tabSize:number): void {
		this._text = text;
		if (tabSize === 0) {
			// don't care mark
			this._metadata = this._metadata & 0x00000001;
		} else {
			this._setPlusOneIndentLevel(computePlusOneIndentLevel(text, tabSize));
		}

		if (this._lineTokens) {
			let map = this._lineTokens.getBinaryEncodedTokensMap(),
				tokens = this._lineTokens.getBinaryEncodedTokens(),
				lineTextLength = this._text.length;

			// Remove overflowing tokens
			while (tokens.length > 0) {
				let lastTokenStartIndex = (tokens[tokens.length - 1] / START_INDEX_OFFSET) & START_INDEX_MASK;
				if (lastTokenStartIndex < lineTextLength) {
					// Valid token
					break;
				}
				// This token now overflows the text => remove it
				tokens.pop();
			}

			this._setLineTokensFromDeflated(map, tokens);
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

	private _createMarkersAdjuster(changedMarkers:IChangedMarkers): IMarkersAdjuster {
		if (!this._markers) {
			return NO_OP_MARKERS_ADJUSTER;
		}
		if (this._markers.length === 0) {
			return NO_OP_MARKERS_ADJUSTER;
		}

		this._markers.sort(ModelLine._compareMarkers);

		var markers = this._markers;
		var markersLength = markers.length;
		var markersIndex = 0;
		var marker = markers[markersIndex];

		// console.log('------------- INITIAL MARKERS: ' + this._printMarkers());

		let adjustMarkerBeforeColumn = (toColumn:number, moveSemantics:MarkerMoveSemantics) => {
			if (marker.column < toColumn) {
				return true;
			}
			if (marker.column > toColumn) {
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

		let adjustDelta = (toColumn:number, delta:number, minimumAllowedColumn:number, moveSemantics:MarkerMoveSemantics) => {
			// console.log('------------------------------');
			// console.log('adjustDelta called: toColumn: ' + toColumn + ', delta: ' + delta + ', minimumAllowedColumn: ' + minimumAllowedColumn + ', moveSemantics: ' + MarkerMoveSemantics[moveSemantics]);
			// console.log('BEFORE::: markersIndex: ' + markersIndex + ' : ' + this._printMarkers());

			while (markersIndex < markersLength && adjustMarkerBeforeColumn(toColumn, moveSemantics)) {
				if (delta !== 0) {
					let newColumn = Math.max(minimumAllowedColumn, marker.column + delta);
					if (marker.column !== newColumn) {
						changedMarkers[marker.id] = true;
						marker.oldLineNumber = marker.oldLineNumber || this._lineNumber;
						marker.oldColumn = marker.oldColumn || marker.column;
						marker.column = newColumn;
					}
				}

				markersIndex++;
				if (markersIndex < markersLength) {
					marker = markers[markersIndex];
				}
			}

			// console.log('AFTER::: markersIndex: ' + markersIndex + ' : ' + this._printMarkers());
		};

		let adjustSet = (toColumn:number, newColumn:number, moveSemantics:MarkerMoveSemantics) => {
			// console.log('------------------------------');
			// console.log('adjustSet called: toColumn: ' + toColumn + ', newColumn: ' + newColumn + ', moveSemantics: ' + MarkerMoveSemantics[moveSemantics]);
			// console.log('BEFORE::: markersIndex: ' + markersIndex + ' : ' + this._printMarkers());

			while (markersIndex < markersLength && adjustMarkerBeforeColumn(toColumn, moveSemantics)) {
				if (marker.column !== newColumn) {
					changedMarkers[marker.id] = true;
					marker.oldLineNumber = marker.oldLineNumber || this._lineNumber;
					marker.oldColumn = marker.oldColumn || marker.column;
					marker.column = newColumn;
				}

				markersIndex++;
				if (markersIndex < markersLength) {
					marker = markers[markersIndex];
				}
			}

			// console.log('AFTER::: markersIndex: ' + markersIndex + ' : ' + this._printMarkers());
		};

		let finish = (delta:number, lineTextLength:number) => {
			adjustDelta(Number.MAX_VALUE, delta, 1, MarkerMoveSemantics.MarkerDefined);

			// console.log('------------- FINAL MARKERS: ' + this._printMarkers());
		};

		return {
			adjustDelta: adjustDelta,
			adjustSet: adjustSet,
			finish: finish
		};
	}

	public applyEdits(changedMarkers: IChangedMarkers, edits:ILineEdit[], tabSize:number): number {
		let deltaColumn = 0;
		let resultText = this._text;

		let tokensAdjuster = this._createTokensAdjuster();
		let markersAdjuster = this._createMarkersAdjuster(changedMarkers);

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

	public split(changedMarkers: IChangedMarkers, splitColumn:number, forceMoveMarkers:boolean, tabSize:number): ModelLine {
		// console.log('--> split @ ' + splitColumn + '::: ' + this._printMarkers());
		var myText = this._text.substring(0, splitColumn - 1);
		var otherText = this._text.substring(splitColumn - 1);

		var otherMarkers: ILineMarker[] = null;

		if (this._markers) {
			this._markers.sort(ModelLine._compareMarkers);
			for (let i = 0, len = this._markers.length; i < len; i++) {
				let marker = this._markers[i];

				if (
					marker.column > splitColumn
					|| (
						marker.column === splitColumn
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

					changedMarkers[marker.id] = true;
					marker.oldLineNumber = marker.oldLineNumber || this._lineNumber;
					marker.oldColumn = marker.oldColumn || marker.column;
					marker.column -= splitColumn - 1;
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

	public append(changedMarkers: IChangedMarkers, other:ModelLine, tabSize:number): void {
		// console.log('--> append: THIS :: ' + this._printMarkers());
		// console.log('--> append: OTHER :: ' + this._printMarkers());
		var thisTextLength = this._text.length;
		this._setText(this._text + other._text, tabSize);

		let otherLineTokens = other._lineTokens;
		if (otherLineTokens) {
			// Other has real tokens
			let otherTokens = otherLineTokens.getBinaryEncodedTokens();

			// Adjust other tokens
			if (thisTextLength > 0) {
				for (let i = 0, len = otherTokens.length; i < len; i++) {
					let token = otherTokens[i];

					let deflatedStartIndex = (token / START_INDEX_OFFSET) & START_INDEX_MASK;
					let deflatedType = (token / TYPE_OFFSET) & TYPE_MASK;
					let newStartIndex = deflatedStartIndex + thisTextLength;
					let newToken = deflatedType * TYPE_OFFSET + newStartIndex * START_INDEX_OFFSET;

					otherTokens[i] = newToken;
				}
			}

			// Append other tokens
			let myLineTokens = this._lineTokens;
			if (myLineTokens) {
				// I have real tokens
				this._setLineTokensFromDeflated(myLineTokens.getBinaryEncodedTokensMap(), myLineTokens.getBinaryEncodedTokens().concat(otherTokens));
			} else {
				// I don't have real tokens
				this._setLineTokensFromDeflated(otherLineTokens.getBinaryEncodedTokensMap(), otherTokens);
			}
		}

		if (other._markers) {
			// Other has markers
			let otherMarkers = other._markers;

			// Adjust other markers
			for (let i = 0, len = otherMarkers.length; i < len; i++) {
				let marker = otherMarkers[i];

				changedMarkers[marker.id] = true;
				marker.oldLineNumber = marker.oldLineNumber || other.lineNumber;
				marker.oldColumn = marker.oldColumn || marker.column;
				marker.column += thisTextLength;
			}

			this.addMarkers(otherMarkers);
		}
	}

	public addMarker(marker:ILineMarker): void {
		marker.line = this;
		if (!this._markers) {
			this._markers = [marker];
		} else {
			this._markers.push(marker);
		}
	}

	public addMarkers(markers:ILineMarker[]): void {
		if (markers.length === 0) {
			return;
		}

		var i:number,
			len:number;

		for (i = 0, len = markers.length; i < len; i++) {
			markers[i].line = this;
		}

		if (!this._markers) {
			this._markers = markers.slice(0);
		} else {
			this._markers = this._markers.concat(markers);
		}
	}

	private static _compareMarkers(a:ILineMarker, b:ILineMarker): number {
		if (a.column === b.column) {
			return (a.stickToPreviousCharacter ? 0 : 1) - (b.stickToPreviousCharacter ? 0 : 1);
		}
		return a.column - b.column;
	}

	public removeMarker(marker:ILineMarker): void {
		if (!this._markers) {
			return;
		}
		let index = this._indexOfMarkerId(marker.id);
		if (index >= 0) {
			marker.line = null;
			this._markers.splice(index, 1);
		}
		if (this._markers.length === 0) {
			this._markers = null;
		}
	}

	public removeMarkers(deleteMarkers: {[markerId:string]:boolean;}): void {
		if (!this._markers) {
			return;
		}
		for (let i = 0, len = this._markers.length; i < len; i++) {
			let marker = this._markers[i];

			if (deleteMarkers[marker.id]) {
				marker.line = null;
				this._markers.splice(i, 1);
				len--;
				i--;
			}
		}
		if (this._markers.length === 0) {
			this._markers = null;
		}
	}

	public getMarkers(): ILineMarker[] {
		if (!this._markers) {
			return [];
		}
		return this._markers.slice(0);
	}

	public updateLineNumber(changedMarkers: IChangedMarkers, newLineNumber: number): void {
		if (this._markers) {
			var markers = this._markers,
				i: number,
				len: number,
				marker: ILineMarker;

			for (i = 0, len = markers.length; i < len; i++) {
				marker = markers[i];

				changedMarkers[marker.id] = true;
				marker.oldLineNumber = marker.oldLineNumber || this._lineNumber;
			}
		}

		this._lineNumber = newLineNumber;
	}

	public deleteLine(changedMarkers: IChangedMarkers, setMarkersColumn:number, setMarkersOldLineNumber:number): ILineMarker[] {
		// console.log('--> deleteLine: ');
		if (this._markers) {
			var markers = this._markers,
				i: number,
				len: number,
				marker: ILineMarker;

			// Mark all these markers as changed
			for (i = 0, len = markers.length; i < len; i++) {
				marker = markers[i];

				changedMarkers[marker.id] = true;
				marker.oldColumn = marker.oldColumn || marker.column;
				marker.oldLineNumber = marker.oldLineNumber || setMarkersOldLineNumber;
				marker.column = setMarkersColumn;
			}

			return markers;
		}
		return [];
	}

	private _indexOfMarkerId(markerId:string): number {
		let markers = this._markers;
		for (let i = 0, len = markers.length; i < len; i++) {
			if (markers[i].id === markerId) {
				return i;
			}
		}
	}
}

function toLineTokensFromInflated(map:TokensInflatorMap, tokens:LineToken[], textLength:number): LineTokens {
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

	let deflated = TokensBinaryEncoding.deflateArr(map, tokens);
	return new LineTokens(map, deflated);
}

function toLineTokensFromDeflated(map:TokensInflatorMap, tokens:number[], textLength:number): LineTokens {
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
	return new LineTokens(map, tokens);
}

export class LineTokens implements ILineTokens {

	private map:TokensInflatorMap;
	private _tokens:number[];

	constructor(map:TokensInflatorMap, tokens:number[]) {
		this.map = map;
		this._tokens = tokens;
	}

	public getBinaryEncodedTokensMap(): TokensInflatorMap {
		return this.map;
	}

	public getBinaryEncodedTokens(): number[] {
		return this._tokens;
	}

	public getTokenCount(): number {
		return this._tokens.length;
	}

	public getTokenStartIndex(tokenIndex:number): number {
		return TokensBinaryEncoding.getStartIndex(this._tokens[tokenIndex]);
	}

	public getTokenType(tokenIndex:number): string {
		return TokensBinaryEncoding.getType(this.map, this._tokens[tokenIndex]);
	}

	public getTokenEndIndex(tokenIndex:number, textLength:number): number {
		if (tokenIndex + 1 < this._tokens.length) {
			return TokensBinaryEncoding.getStartIndex(this._tokens[tokenIndex + 1]);
		}
		return textLength;
	}

	public equals(other:ILineTokens): boolean {
		if (other instanceof LineTokens) {
			if (this.map !== other.map) {
				return false;
			}
			if (this._tokens.length !== other._tokens.length) {
				return false;
			}
			for (let i = 0, len = this._tokens.length; i < len; i++) {
				if (this._tokens[i] !== other._tokens[i]) {
					return false;
				}
			}
			return true;
		}
		if (!(other instanceof LineTokens)) {
			return false;
		}
	}

	public findIndexOfOffset(offset:number): number {
		return TokensBinaryEncoding.findIndexOfOffset(this._tokens, offset);
	}

	public inflate(): ViewLineToken[] {
		return TokensBinaryEncoding.inflateArr(this.map, this._tokens);
	}

	public sliceAndInflate(startOffset:number, endOffset:number, deltaStartIndex:number): ViewLineToken[] {
		return TokensBinaryEncoding.sliceAndInflate(this.map, this._tokens, startOffset, endOffset, deltaStartIndex);
	}

}

class EmptyLineTokens implements ILineTokens {

	public static INSTANCE = new EmptyLineTokens();

	public getTokenCount(): number {
		return 0;
	}

	public getTokenStartIndex(tokenIndex:number): number {
		return 0;
	}

	public getTokenType(tokenIndex:number): string {
		return strings.empty;
	}

	public getTokenEndIndex(tokenIndex:number, textLength:number): number {
		return 0;
	}

	public equals(other:ILineTokens): boolean {
		return other === this;
	}

	public findIndexOfOffset(offset:number): number {
		return 0;
	}

	public inflate(): ViewLineToken[] {
		return [];
	}

	public sliceAndInflate(startOffset:number, endOffset:number, deltaStartIndex:number): ViewLineToken[] {
		return [];
	}
}

export class DefaultLineTokens implements ILineTokens {

	public static INSTANCE = new DefaultLineTokens();

	public getTokenCount(): number {
		return 1;
	}

	public getTokenStartIndex(tokenIndex:number): number {
		return 0;
	}

	public getTokenType(tokenIndex:number): string {
		return strings.empty;
	}

	public getTokenEndIndex(tokenIndex:number, textLength:number): number {
		return textLength;
	}

	public equals(other:ILineTokens): boolean {
		return this === other;
	}

	public findIndexOfOffset(offset:number): number {
		return 0;
	}

	public inflate(): ViewLineToken[] {
		return [new ViewLineToken(0, '')];
	}

	public sliceAndInflate(startOffset:number, endOffset:number, deltaStartIndex:number): ViewLineToken[] {
		return [new ViewLineToken(0, '')];
	}

}

function toModeTransitions(topLevelMode:IMode, modeTransitions:ModeTransition[]): ModeTransition[] {

	if (!modeTransitions || modeTransitions.length === 0) {
		return null;
	} else if (modeTransitions.length === 1 && modeTransitions[0].startIndex === 0 && modeTransitions[0].mode === topLevelMode) {
		return null;
	}

	return modeTransitions;
}
