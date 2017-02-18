/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { IState, FontStyle, StandardTokenType, MetadataConsts, ColorId, LanguageId } from 'vs/editor/common/modes';
import { CharCode } from 'vs/base/common/charCode';
import { LineTokens } from 'vs/editor/common/core/lineTokens';
import { Position } from 'vs/editor/common/core/position';
import { Constants } from 'vs/editor/common/core/uint';

export interface ILineEdit {
	startColumn: number;
	endColumn: number;
	text: string;
	forceMoveMarkers: boolean;
}

export class LineMarker {
	_lineMarkerBrand: void;

	public readonly id: string;
	public readonly internalDecorationId: number;

	public stickToPreviousCharacter: boolean;
	public position: Position;

	constructor(id: string, internalDecorationId: number, position: Position, stickToPreviousCharacter: boolean) {
		this.id = id;
		this.internalDecorationId = internalDecorationId;
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

	private _changedDecorations: number[];
	private _changedDecorationsLen: number;

	constructor() {
		this._changedDecorations = [];
		this._changedDecorationsLen = 0;
	}

	public addChangedMarker(marker: LineMarker): void {
		let internalDecorationId = marker.internalDecorationId;
		if (internalDecorationId !== 0) {
			this._changedDecorations[this._changedDecorationsLen++] = internalDecorationId;
		}
	}

	public getDecorationIds(): number[] {
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
	private _lineTokens: ArrayBuffer;
	private _markers: LineMarker[];

	constructor(lineNumber: number, text: string, tabSize: number) {
		this._lineNumber = lineNumber | 0;
		this._metadata = 0;
		this._setText(text, tabSize);
		this._state = null;
		this._lineTokens = null;
		this._markers = null;
	}

	// --- BEGIN STATE

	public resetTokenizationState(): void {
		this._state = null;
		this._lineTokens = null;
	}

	public setState(state: IState): void {
		this._state = state;
	}

	public getState(): IState {
		return this._state || null;
	}

	// --- END STATE

	// --- BEGIN TOKENS

	private static _getDefaultMetadata(topLevelLanguageId: LanguageId): number {
		return (
			(topLevelLanguageId << MetadataConsts.LANGUAGEID_OFFSET)
			| (StandardTokenType.Other << MetadataConsts.TOKEN_TYPE_OFFSET)
			| (FontStyle.None << MetadataConsts.FONT_STYLE_OFFSET)
			| (ColorId.DefaultForeground << MetadataConsts.FOREGROUND_OFFSET)
			| (ColorId.DefaultBackground << MetadataConsts.BACKGROUND_OFFSET)
		) >>> 0;
	}

	public setTokens(topLevelLanguageId: LanguageId, tokens: Uint32Array): void {
		if (!tokens || tokens.length === 0) {
			this._lineTokens = null;
			return;
		}
		if (tokens.length === 2) {
			// there is one token
			if (tokens[0] === 0 && tokens[1] === ModelLine._getDefaultMetadata(topLevelLanguageId)) {
				this._lineTokens = null;
				return;
			}
		}
		this._lineTokens = tokens.buffer;
	}

	public getTokens(topLevelLanguageId: LanguageId): LineTokens {
		let rawLineTokens = this._lineTokens;
		if (rawLineTokens) {
			return new LineTokens(new Uint32Array(rawLineTokens), this._text);
		}

		let lineTokens = new Uint32Array(2);
		lineTokens[0] = 0;
		lineTokens[1] = ModelLine._getDefaultMetadata(topLevelLanguageId);
		return new LineTokens(lineTokens, this._text);
	}

	// --- END TOKENS

	private _createTokensAdjuster(): ITokensAdjuster {
		if (!this._lineTokens) {
			// This line does not have real tokens, so there is nothing to adjust
			return NO_OP_TOKENS_ADJUSTER;
		}

		let lineTokens = new Uint32Array(this._lineTokens);
		let tokensLength = (lineTokens.length >>> 1);
		let tokenIndex = 0;
		let tokenStartOffset = 0;
		let removeTokensCount = 0;

		let adjust = (toColumn: number, delta: number, minimumAllowedColumn: number) => {
			// console.log(`------------------------------------------------------------------`);
			// console.log(`before call: tokenIndex: ${tokenIndex}: ${lineTokens}`);
			// console.log(`adjustTokens: ${toColumn} with delta: ${delta} and [${minimumAllowedColumn}]`);
			// console.log(`tokenStartOffset: ${tokenStartOffset}`);
			let minimumAllowedIndex = minimumAllowedColumn - 1;

			while (tokenStartOffset < toColumn && tokenIndex < tokensLength) {

				if (tokenStartOffset > 0 && delta !== 0) {
					// adjust token's `startIndex` by `delta`
					let newTokenStartOffset = Math.max(minimumAllowedIndex, tokenStartOffset + delta);
					lineTokens[(tokenIndex << 1)] = newTokenStartOffset;

					// console.log(` * adjusted token start offset for token at ${tokenIndex}: ${newTokenStartOffset}`);

					if (delta < 0) {
						let tmpTokenIndex = tokenIndex;
						while (tmpTokenIndex > 0) {
							let prevTokenStartOffset = lineTokens[((tmpTokenIndex - 1) << 1)];
							if (prevTokenStartOffset >= newTokenStartOffset) {
								if (prevTokenStartOffset !== Constants.MAX_UINT_32) {
									// console.log(` * marking for deletion token at ${tmpTokenIndex - 1}`);
									lineTokens[((tmpTokenIndex - 1) << 1)] = Constants.MAX_UINT_32;
									removeTokensCount++;
								}
								tmpTokenIndex--;
							} else {
								break;
							}
						}
					}
				}

				tokenIndex++;
				if (tokenIndex < tokensLength) {
					tokenStartOffset = lineTokens[(tokenIndex << 1)];
				}
			}
			// console.log(`after call: tokenIndex: ${tokenIndex}: ${lineTokens}`);
		};

		let finish = (delta: number, lineTextLength: number) => {
			adjust(Constants.MAX_SAFE_SMALL_INTEGER, delta, 1);

			// Mark overflowing tokens for deletion & delete marked tokens
			this._deleteMarkedTokens(this._markOverflowingTokensForDeletion(removeTokensCount, lineTextLength));
		};

		return {
			adjust: adjust,
			finish: finish
		};
	}

	private _markOverflowingTokensForDeletion(removeTokensCount: number, lineTextLength: number): number {
		if (!this._lineTokens) {
			return removeTokensCount;
		}

		let lineTokens = new Uint32Array(this._lineTokens);
		let tokensLength = (lineTokens.length >>> 1);

		if (removeTokensCount + 1 === tokensLength) {
			// no more removing, cannot end up without any tokens for mode transition reasons
			return removeTokensCount;
		}

		for (let tokenIndex = tokensLength - 1; tokenIndex > 0; tokenIndex--) {
			let tokenStartOffset = lineTokens[(tokenIndex << 1)];
			if (tokenStartOffset < lineTextLength) {
				// valid token => stop iterating
				return removeTokensCount;
			}

			// this token now overflows the text => mark it for removal
			if (tokenStartOffset !== Constants.MAX_UINT_32) {
				// console.log(` * marking for deletion token at ${tokenIndex}`);
				lineTokens[(tokenIndex << 1)] = Constants.MAX_UINT_32;
				removeTokensCount++;

				if (removeTokensCount + 1 === tokensLength) {
					// no more removing, cannot end up without any tokens for mode transition reasons
					return removeTokensCount;
				}
			}
		}

		return removeTokensCount;
	}

	private _deleteMarkedTokens(removeTokensCount: number): void {
		if (removeTokensCount === 0) {
			return;
		}

		let lineTokens = new Uint32Array(this._lineTokens);
		let tokensLength = (lineTokens.length >>> 1);
		let newTokens = new Uint32Array(((tokensLength - removeTokensCount) << 1)), newTokenIdx = 0;
		for (let i = 0; i < tokensLength; i++) {
			let startOffset = lineTokens[(i << 1)];
			if (startOffset === Constants.MAX_UINT_32) {
				// marked for deletion
				continue;
			}
			let metadata = lineTokens[(i << 1) + 1];
			newTokens[newTokenIdx++] = startOffset;
			newTokens[newTokenIdx++] = metadata;
		}
		this._lineTokens = newTokens.buffer;
	}

	private _setText(text: string, tabSize: number): void {
		this._text = text;
		if (tabSize === 0) {
			// don't care mark
			this._metadata = this._metadata & 0x00000001;
		} else {
			this._setPlusOneIndentLevel(computePlusOneIndentLevel(text, tabSize));
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
			adjustDelta(Constants.MAX_SAFE_SMALL_INTEGER, delta, 1, MarkerMoveSemantics.MarkerDefined);

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

		// Mark overflowing tokens for deletion & delete marked tokens
		this._deleteMarkedTokens(this._markOverflowingTokensForDeletion(0, this._text.length));

		var otherLine = new ModelLine(this._lineNumber + 1, otherText, tabSize);
		if (otherMarkers) {
			otherLine.addMarkers(otherMarkers);
		}
		return otherLine;
	}

	public append(markersTracker: MarkersTracker, other: ModelLine, tabSize: number): void {
		// console.log('--> append: THIS :: ' + this._printMarkers());
		// console.log('--> append: OTHER :: ' + this._printMarkers());
		let thisTextLength = this._text.length;
		this._setText(this._text + other._text, tabSize);

		let otherRawTokens = other._lineTokens;
		if (otherRawTokens) {
			// Other has real tokens

			let otherTokens = new Uint32Array(otherRawTokens);

			// Adjust other tokens
			if (thisTextLength > 0) {
				for (let i = 0, len = (otherTokens.length >>> 1); i < len; i++) {
					otherTokens[(i << 1)] = otherTokens[(i << 1)] + thisTextLength;
				}
			}

			// Append other tokens
			let myRawTokens = this._lineTokens;
			if (myRawTokens) {
				// I have real tokens
				let myTokens = new Uint32Array(myRawTokens);
				let result = new Uint32Array(myTokens.length + otherTokens.length);
				result.set(myTokens, 0);
				result.set(otherTokens, myTokens.length);
				this._lineTokens = result.buffer;
			} else {
				// I don't have real tokens
				this._lineTokens = otherTokens.buffer;
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
			return null;
		}
		return this._markers;
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
		return undefined;
	}
}
