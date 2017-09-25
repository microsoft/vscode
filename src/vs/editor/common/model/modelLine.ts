/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { IState, FontStyle, StandardTokenType, MetadataConsts, ColorId, LanguageId } from 'vs/editor/common/modes';
import { CharCode } from 'vs/base/common/charCode';
import { LineTokens } from 'vs/editor/common/core/lineTokens';
import { Position } from 'vs/editor/common/core/position';
import { Range } from 'vs/editor/common/core/range';
import { Constants } from 'vs/editor/common/core/uint';
import { ViewLineTokenFactory } from 'vs/editor/common/core/viewLineToken';
import * as arrays from 'vs/base/common/arrays';

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

interface IMarkersAdjuster {
	adjustDelta(toColumn: number, delta: number, minimumAllowedColumn: number, moveSemantics: MarkerMoveSemantics): void;
	adjustSet(toColumn: number, newColumn: number, moveSemantics: MarkerMoveSemantics): void;
	finish(delta: number, lineTextLength: number): void;
}

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

export interface IModelLine {
	readonly text: string;

	// --- markers
	addMarker(marker: LineMarker): void;
	addMarkers(markers: LineMarker[]): void;
	removeMarker(marker: LineMarker): void;
	removeMarkers(deleteMarkers: { [markerId: string]: boolean; }): void;
	getMarkers(): LineMarker[];

	// --- indentation
	updateTabSize(tabSize: number): void;
	getIndentLevel(): number;

	// --- editing
	updateLineNumber(markersTracker: MarkersTracker, newLineNumber: number): void;
	applyEdits(markersTracker: MarkersTracker, edits: ILineEdit[], tabSize: number): number;
	append(markersTracker: MarkersTracker, myLineNumber: number, other: IModelLine, tabSize: number): void;
	split(markersTracker: MarkersTracker, splitColumn: number, forceMoveMarkers: boolean, tabSize: number): IModelLine;
}

export abstract class AbstractModelLine {

	private _markers: LineMarker[];

	constructor(initializeMarkers: boolean) {
		if (initializeMarkers) {
			this._markers = null;
		}
	}

	///

	public abstract get text(): string;
	protected abstract _setText(text: string, tabSize: number): void;
	protected abstract _createModelLine(text: string, tabSize: number): IModelLine;

	///

	// private _printMarkers(): string {
	// 	if (!this._markers) {
	// 		return '[]';
	// 	}
	// 	if (this._markers.length === 0) {
	// 		return '[]';
	// 	}

	// 	var markers = this._markers;

	// 	var printMarker = (m:LineMarker) => {
	// 		if (m.stickToPreviousCharacter) {
	// 			return '|' + m.position.column;
	// 		}
	// 		return m.position.column + '|';
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
		let resultText = this.text;

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
			markersAdjuster.adjustDelta(edit.startColumn, deltaColumn, 1, edit.forceMoveMarkers ? MarkerMoveSemantics.ForceMove : (deletingCnt > 0 ? MarkerMoveSemantics.ForceStay : MarkerMoveSemantics.MarkerDefined));

			// Adjust tokens & markers for the common part of this edit
			let commonLength = Math.min(deletingCnt, insertingCnt);
			if (commonLength > 0) {
				// console.log('Adjust tokens & markers for the common part of this edit');
				if (!edit.forceMoveMarkers) {
					markersAdjuster.adjustDelta(edit.startColumn + commonLength, deltaColumn, startColumn, edit.forceMoveMarkers ? MarkerMoveSemantics.ForceMove : (deletingCnt > insertingCnt ? MarkerMoveSemantics.ForceStay : MarkerMoveSemantics.MarkerDefined));
				}
			}

			// Perform the edit & update `deltaColumn`
			resultText = resultText.substring(0, startColumn - 1) + edit.text + resultText.substring(endColumn - 1);
			deltaColumn += insertingCnt - deletingCnt;

			// Adjust tokens & markers inside this edit
			// console.log('Adjust tokens & markers inside this edit');
			markersAdjuster.adjustSet(edit.endColumn, startColumn + insertingCnt, edit.forceMoveMarkers ? MarkerMoveSemantics.ForceMove : MarkerMoveSemantics.MarkerDefined);
		}

		// Wrap up tokens & markers; adjust remaining if needed
		markersAdjuster.finish(deltaColumn, resultText.length);

		// Save the resulting text
		this._setText(resultText, tabSize);

		return deltaColumn;
	}

	public split(markersTracker: MarkersTracker, splitColumn: number, forceMoveMarkers: boolean, tabSize: number): IModelLine {
		// console.log('--> split @ ' + splitColumn + '::: ' + this._printMarkers());
		var myText = this.text.substring(0, splitColumn - 1);
		var otherText = this.text.substring(splitColumn - 1);

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

		var otherLine = this._createModelLine(otherText, tabSize);
		if (otherMarkers) {
			otherLine.addMarkers(otherMarkers);
		}
		return otherLine;
	}

	public append(markersTracker: MarkersTracker, myLineNumber: number, other: IModelLine, tabSize: number): void {
		// console.log('--> append: THIS :: ' + this._printMarkers());
		// console.log('--> append: OTHER :: ' + this._printMarkers());
		let thisTextLength = this.text.length;
		this._setText(this.text + other.text, tabSize);

		if (other instanceof AbstractModelLine) {
			if (other._markers) {
				// Other has markers
				let otherMarkers = other._markers;

				// Adjust other markers
				for (let i = 0, len = otherMarkers.length; i < len; i++) {
					let marker = otherMarkers[i];

					marker.updatePosition(markersTracker, new Position(myLineNumber, marker.position.column + thisTextLength));
				}

				this.addMarkers(otherMarkers);
			}
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
		if (this._markers) {
			let markers = this._markers;
			for (let i = 0, len = markers.length; i < len; i++) {
				let marker = markers[i];
				marker.updateLineNumber(markersTracker, newLineNumber);
			}
		}
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

export class ModelLine extends AbstractModelLine implements IModelLine {

	private _text: string;
	public get text(): string { return this._text; }

	/**
	 * bits 31 - 1 => indentLevel
	 * bit 0 => isInvalid
	 */
	private _metadata: number;

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

	constructor(text: string, tabSize: number) {
		super(true);
		this._metadata = 0;
		this._setText(text, tabSize);
	}

	protected _createModelLine(text: string, tabSize: number): IModelLine {
		return new ModelLine(text, tabSize);
	}

	protected _setText(text: string, tabSize: number): void {
		this._text = text;
		if (tabSize === 0) {
			// don't care mark
			this._metadata = this._metadata & 0x00000001;
		} else {
			this._setPlusOneIndentLevel(computePlusOneIndentLevel(text, tabSize));
		}
	}
}

/**
 * A model line that cannot store any tokenization state, nor does it compute indentation levels.
 * It has no fields except the text.
 */
export class MinimalModelLine extends AbstractModelLine implements IModelLine {

	private _text: string;
	public get text(): string { return this._text; }

	public isInvalid(): boolean {
		return false;
	}

	public setIsInvalid(isInvalid: boolean): void {
	}

	/**
	 * Returns:
	 *  - -1 => the line consists of whitespace
	 *  - otherwise => the indent level is returned value
	 */
	public getIndentLevel(): number {
		return 0;
	}

	public updateTabSize(tabSize: number): void {
	}

	constructor(text: string, tabSize: number) {
		super(false);
		this._setText(text, tabSize);
	}

	protected _createModelLine(text: string, tabSize: number): IModelLine {
		return new MinimalModelLine(text, tabSize);
	}

	protected _setText(text: string, tabSize: number): void {
		this._text = text;
	}
}

function getDefaultMetadata(topLevelLanguageId: LanguageId): number {
	return (
		(topLevelLanguageId << MetadataConsts.LANGUAGEID_OFFSET)
		| (StandardTokenType.Other << MetadataConsts.TOKEN_TYPE_OFFSET)
		| (FontStyle.None << MetadataConsts.FONT_STYLE_OFFSET)
		| (ColorId.DefaultForeground << MetadataConsts.FOREGROUND_OFFSET)
		| (ColorId.DefaultBackground << MetadataConsts.BACKGROUND_OFFSET)
	) >>> 0;
}

const EMPTY_LINE_TOKENS = new Uint32Array(0);

class ModelLineTokens {
	_state: IState;
	_lineTokens: ArrayBuffer;
	_invalid: boolean;

	constructor(state: IState) {
		this._state = state;
		this._lineTokens = null;
		this._invalid = true;
	}

	public deleteBeginning(toChIndex: number): void {
		if (this._lineTokens === null || this._lineTokens === EMPTY_LINE_TOKENS) {
			return;
		}
		this.delete(0, toChIndex);
	}

	public deleteEnding(fromChIndex: number): void {
		if (this._lineTokens === null || this._lineTokens === EMPTY_LINE_TOKENS) {
			return;
		}

		const tokens = new Uint32Array(this._lineTokens);
		const lineTextLength = tokens[tokens.length - 2];
		this.delete(fromChIndex, lineTextLength);
	}

	public delete(fromChIndex: number, toChIndex: number): void {
		if (this._lineTokens === null || this._lineTokens === EMPTY_LINE_TOKENS || fromChIndex === toChIndex) {
			return;
		}

		const tokens = new Uint32Array(this._lineTokens);
		const tokensCount = (tokens.length >>> 1);

		// special case: deleting everything
		if (fromChIndex === 0 && tokens[tokens.length - 2] === toChIndex) {
			this._lineTokens = EMPTY_LINE_TOKENS;
			return;
		}

		const fromTokenIndex = ViewLineTokenFactory.findIndexInSegmentsArray(tokens, fromChIndex);
		const fromTokenStartOffset = (fromTokenIndex > 0 ? tokens[(fromTokenIndex - 1) << 1] : 0);
		const fromTokenEndOffset = tokens[fromTokenIndex << 1];

		if (toChIndex < fromTokenEndOffset) {
			// the delete range is inside a single token
			const delta = (toChIndex - fromChIndex);
			for (let i = fromTokenIndex; i < tokensCount; i++) {
				tokens[i << 1] -= delta;
			}
			return;
		}

		let dest: number;
		let lastEnd: number;
		if (fromTokenStartOffset !== fromChIndex) {
			tokens[fromTokenIndex << 1] = fromChIndex;
			dest = ((fromTokenIndex + 1) << 1);
			lastEnd = fromChIndex;
		} else {
			dest = (fromTokenIndex << 1);
			lastEnd = fromTokenStartOffset;
		}

		const delta = (toChIndex - fromChIndex);
		for (let tokenIndex = fromTokenIndex + 1; tokenIndex < tokensCount; tokenIndex++) {
			const tokenEndOffset = tokens[tokenIndex << 1] - delta;
			if (tokenEndOffset > lastEnd) {
				tokens[dest++] = tokenEndOffset;
				tokens[dest++] = tokens[(tokenIndex << 1) + 1];
				lastEnd = tokenEndOffset;
			}
		}

		if (dest === tokens.length) {
			// nothing to trim
			return;
		}

		let tmp = new Uint32Array(dest);
		tmp.set(tokens.subarray(0, dest), 0);
		this._lineTokens = tmp.buffer;
	}

	public append(_otherTokens: ArrayBuffer): void {
		if (_otherTokens === EMPTY_LINE_TOKENS) {
			return;
		}
		if (this._lineTokens === EMPTY_LINE_TOKENS) {
			this._lineTokens = _otherTokens;
			return;
		}
		if (this._lineTokens === null) {
			return;
		}
		if (_otherTokens === null) {
			// cannot determine combined line length...
			this._lineTokens = null;
			return;
		}
		const myTokens = new Uint32Array(this._lineTokens);
		const otherTokens = new Uint32Array(_otherTokens);
		const otherTokensCount = (otherTokens.length >>> 1);

		let result = new Uint32Array(myTokens.length + otherTokens.length);
		result.set(myTokens, 0);
		let dest = myTokens.length;
		const delta = myTokens[myTokens.length - 2];
		for (let i = 0; i < otherTokensCount; i++) {
			result[dest++] = otherTokens[(i << 1)] + delta;
			result[dest++] = otherTokens[(i << 1) + 1];
		}
		this._lineTokens = result.buffer;
	}

	public insert(chIndex: number, textLength: number): void {
		if (!this._lineTokens) {
			// nothing to do
			return;
		}

		const tokens = new Uint32Array(this._lineTokens);
		const tokensCount = (tokens.length >>> 1);

		let fromTokenIndex = ViewLineTokenFactory.findIndexInSegmentsArray(tokens, chIndex);
		if (fromTokenIndex > 0) {
			const fromTokenStartOffset = (fromTokenIndex > 0 ? tokens[(fromTokenIndex - 1) << 1] : 0);
			if (fromTokenStartOffset === chIndex) {
				fromTokenIndex--;
			}
		}
		for (let tokenIndex = fromTokenIndex; tokenIndex < tokensCount; tokenIndex++) {
			tokens[tokenIndex << 1] += textLength;
		}
	}
}

export class ModelLinesTokens {

	private _tokens: ModelLineTokens[];

	constructor() {
		this._tokens = [];
	}

	public setInitialState(initialState: IState): void {
		this._tokens[0] = new ModelLineTokens(initialState);
	}

	public getTokens(topLevelLanguageId: LanguageId, lineIndex: number, lineText: string): LineTokens {
		let rawLineTokens: ArrayBuffer = null;
		if (lineIndex < this._tokens.length) {
			rawLineTokens = this._tokens[lineIndex]._lineTokens;
		}

		if (rawLineTokens !== null && rawLineTokens !== EMPTY_LINE_TOKENS) {
			return new LineTokens(new Uint32Array(rawLineTokens), lineText);
		}

		let lineTokens = new Uint32Array(2);
		lineTokens[0] = lineText.length;
		lineTokens[1] = getDefaultMetadata(topLevelLanguageId);
		return new LineTokens(lineTokens, lineText);
	}

	public setIsInvalid(lineIndex: number, invalid: boolean): void {
		if (lineIndex < this._tokens.length) {
			this._tokens[lineIndex]._invalid = invalid;
		}
	}

	public isInvalid(lineIndex: number): boolean {
		if (lineIndex < this._tokens.length) {
			return this._tokens[lineIndex]._invalid;
		}
		return true;
	}

	public getState(lineIndex: number): IState {
		if (lineIndex < this._tokens.length) {
			return this._tokens[lineIndex]._state;
		}
		return null;
	}

	public setTokens(topLevelLanguageId: LanguageId, lineIndex: number, lineTextLength: number, tokens: Uint32Array): void {
		let target: ModelLineTokens;
		if (lineIndex < this._tokens.length) {
			target = this._tokens[lineIndex];
		} else {
			target = new ModelLineTokens(null);
			this._tokens[lineIndex] = target;
		}

		if (lineTextLength === 0) {
			target._lineTokens = EMPTY_LINE_TOKENS;
			return;
		}

		if (!tokens || tokens.length === 0) {
			tokens = new Uint32Array(2);
			tokens[0] = 0;
			tokens[1] = getDefaultMetadata(topLevelLanguageId);
		}

		LineTokens.convertToEndOffset(tokens, lineTextLength);

		target._lineTokens = tokens.buffer;
	}

	public setState(lineIndex: number, state: IState): void {
		if (lineIndex < this._tokens.length) {
			this._tokens[lineIndex]._state = state;
		} else {
			const tmp = new ModelLineTokens(state);
			this._tokens[lineIndex] = tmp;
		}
	}

	// --- editing

	public applyEdits2(range: Range, lines: string[]): void {
		this._acceptDeleteRange(range);
		this._acceptInsertText(new Position(range.startLineNumber, range.startColumn), lines);
	}

	private _acceptDeleteRange(range: Range): void {

		const firstLineIndex = range.startLineNumber - 1;
		if (firstLineIndex >= this._tokens.length) {
			return;
		}

		if (range.startLineNumber === range.endLineNumber) {
			if (range.startColumn === range.endColumn) {
				// Nothing to delete
				return;
			}

			this._tokens[firstLineIndex].delete(range.startColumn - 1, range.endColumn - 1);
			return;
		}

		const firstLine = this._tokens[firstLineIndex];
		firstLine.deleteEnding(range.startColumn - 1);

		const lastLineIndex = range.endLineNumber - 1;
		let lastLineTokens: ArrayBuffer = null;
		if (lastLineIndex < this._tokens.length) {
			const lastLine = this._tokens[lastLineIndex];
			lastLine.deleteBeginning(range.endColumn - 1);
			lastLineTokens = lastLine._lineTokens;
		}

		// Take remaining text on last line and append it to remaining text on first line
		firstLine.append(lastLineTokens);

		// Delete middle lines
		this._tokens.splice(range.startLineNumber, range.endLineNumber - range.startLineNumber);
	}

	private _acceptInsertText(position: Position, insertLines: string[]): void {

		if (!insertLines || insertLines.length === 0) {
			// Nothing to insert
			return;
		}

		const lineIndex = position.lineNumber - 1;
		if (lineIndex >= this._tokens.length) {
			return;
		}

		if (insertLines.length === 1) {
			// Inserting text on one line
			this._tokens[lineIndex].insert(position.column - 1, insertLines[0].length);
			return;
		}

		const line = this._tokens[lineIndex];
		line.deleteEnding(position.column - 1);
		line.insert(position.column - 1, insertLines[0].length);

		let insert: ModelLineTokens[] = new Array<ModelLineTokens>(insertLines.length - 1);
		for (let i = insertLines.length - 2; i >= 0; i--) {
			insert[i] = new ModelLineTokens(null);
		}
		this._tokens = arrays.arrayInsert(this._tokens, position.lineNumber, insert);
	}
}
