/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { IDiffChange, ISequence, LcsDiff } from 'vs/base/common/diff/diff';
import * as strings from 'vs/base/common/strings';
import { ICharChange, ILineChange } from 'vs/editor/common/editorCommon';

const MAXIMUM_RUN_TIME = 5000; // 5 seconds
const MINIMUM_MATCHING_CHARACTER_LENGTH = 3;

interface IMarker {
	lineNumber: number;
	column: number;
	offset: number;
}

function computeDiff(originalSequence: ISequence, modifiedSequence: ISequence, continueProcessingPredicate: () => boolean, pretty: boolean): IDiffChange[] {
	const diffAlgo = new LcsDiff(originalSequence, modifiedSequence, continueProcessingPredicate);
	return diffAlgo.ComputeDiff(pretty);
}

class MarkerSequence implements ISequence {

	public buffer: string;
	public startMarkers: IMarker[];
	public endMarkers: IMarker[];

	constructor(buffer: string, startMarkers: IMarker[], endMarkers: IMarker[]) {
		this.buffer = buffer;
		this.startMarkers = startMarkers;
		this.endMarkers = endMarkers;
	}

	public equals(other: any): boolean {
		if (!(other instanceof MarkerSequence)) {
			return false;
		}
		const otherMarkerSequence = <MarkerSequence>other;
		if (this.getLength() !== otherMarkerSequence.getLength()) {
			return false;
		}
		for (let i = 0, len = this.getLength(); i < len; i++) {
			const myElement = this.getElementHash(i);
			const otherElement = otherMarkerSequence.getElementHash(i);
			if (myElement !== otherElement) {
				return false;
			}
		}
		return true;
	}

	public getLength(): number {
		return this.startMarkers.length;
	}

	public getElementHash(i: number): string {
		return this.buffer.substring(this.startMarkers[i].offset, this.endMarkers[i].offset);
	}

	public getStartLineNumber(i: number): number {
		if (i === this.startMarkers.length) {
			// This is the special case where a change happened after the last marker
			return this.startMarkers[i - 1].lineNumber + 1;
		}
		return this.startMarkers[i].lineNumber;
	}

	public getStartColumn(i: number): number {
		return this.startMarkers[i].column;
	}

	public getEndLineNumber(i: number): number {
		return this.endMarkers[i].lineNumber;
	}

	public getEndColumn(i: number): number {
		return this.endMarkers[i].column;
	}

}

class LineMarkerSequence extends MarkerSequence {

	constructor(lines: string[], shouldIgnoreTrimWhitespace: boolean) {
		let buffer = '';
		let startMarkers: IMarker[] = [];
		let endMarkers: IMarker[] = [];

		for (let pos = 0, i = 0, length = lines.length; i < length; i++) {
			buffer += lines[i];
			let startColumn = 1;
			let endColumn = lines[i].length + 1;

			if (shouldIgnoreTrimWhitespace) {
				startColumn = LineMarkerSequence._getFirstNonBlankColumn(lines[i], 1);
				endColumn = LineMarkerSequence._getLastNonBlankColumn(lines[i], 1);
			}

			startMarkers.push({
				offset: pos + startColumn - 1,
				lineNumber: i + 1,
				column: startColumn
			});

			endMarkers.push({
				offset: pos + endColumn - 1,
				lineNumber: i + 1,
				column: endColumn
			});

			pos += lines[i].length;
		}

		super(buffer, startMarkers, endMarkers);
	}

	private static _getFirstNonBlankColumn(txt: string, defaultValue: number): number {
		const r = strings.firstNonWhitespaceIndex(txt);
		if (r === -1) {
			return defaultValue;
		}
		return r + 1;
	}

	private static _getLastNonBlankColumn(txt: string, defaultValue: number): number {
		const r = strings.lastNonWhitespaceIndex(txt);
		if (r === -1) {
			return defaultValue;
		}
		return r + 2;
	}

	public getCharSequence(startIndex: number, endIndex: number): MarkerSequence {
		let startMarkers: IMarker[] = [];
		let endMarkers: IMarker[] = [];
		for (let index = startIndex; index <= endIndex; index++) {
			const startMarker = this.startMarkers[index];
			const endMarker = this.endMarkers[index];
			for (let i = startMarker.offset; i < endMarker.offset; i++) {
				startMarkers.push({
					offset: i,
					lineNumber: startMarker.lineNumber,
					column: startMarker.column + (i - startMarker.offset)
				});
				endMarkers.push({
					offset: i + 1,
					lineNumber: startMarker.lineNumber,
					column: startMarker.column + (i - startMarker.offset) + 1
				});
			}
		}
		return new MarkerSequence(this.buffer, startMarkers, endMarkers);
	}
}

class CharChange implements ICharChange {

	public originalStartLineNumber: number;
	public originalStartColumn: number;
	public originalEndLineNumber: number;
	public originalEndColumn: number;

	public modifiedStartLineNumber: number;
	public modifiedStartColumn: number;
	public modifiedEndLineNumber: number;
	public modifiedEndColumn: number;

	constructor(diffChange: IDiffChange, originalCharSequence: MarkerSequence, modifiedCharSequence: MarkerSequence) {
		if (diffChange.originalLength === 0) {
			this.originalStartLineNumber = 0;
			this.originalStartColumn = 0;
			this.originalEndLineNumber = 0;
			this.originalEndColumn = 0;
		} else {
			this.originalStartLineNumber = originalCharSequence.getStartLineNumber(diffChange.originalStart);
			this.originalStartColumn = originalCharSequence.getStartColumn(diffChange.originalStart);
			this.originalEndLineNumber = originalCharSequence.getEndLineNumber(diffChange.originalStart + diffChange.originalLength - 1);
			this.originalEndColumn = originalCharSequence.getEndColumn(diffChange.originalStart + diffChange.originalLength - 1);
		}

		if (diffChange.modifiedLength === 0) {
			this.modifiedStartLineNumber = 0;
			this.modifiedStartColumn = 0;
			this.modifiedEndLineNumber = 0;
			this.modifiedEndColumn = 0;
		} else {
			this.modifiedStartLineNumber = modifiedCharSequence.getStartLineNumber(diffChange.modifiedStart);
			this.modifiedStartColumn = modifiedCharSequence.getStartColumn(diffChange.modifiedStart);
			this.modifiedEndLineNumber = modifiedCharSequence.getEndLineNumber(diffChange.modifiedStart + diffChange.modifiedLength - 1);
			this.modifiedEndColumn = modifiedCharSequence.getEndColumn(diffChange.modifiedStart + diffChange.modifiedLength - 1);
		}
	}

}

function postProcessCharChanges(rawChanges: IDiffChange[]): IDiffChange[] {
	if (rawChanges.length <= 1) {
		return rawChanges;
	}

	let result = [rawChanges[0]];
	let prevChange = result[0];

	for (let i = 1, len = rawChanges.length; i < len; i++) {
		const currChange = rawChanges[i];

		const originalMatchingLength = currChange.originalStart - (prevChange.originalStart + prevChange.originalLength);
		const modifiedMatchingLength = currChange.modifiedStart - (prevChange.modifiedStart + prevChange.modifiedLength);
		// Both of the above should be equal, but the continueProcessingPredicate may prevent this from being true
		const matchingLength = Math.min(originalMatchingLength, modifiedMatchingLength);

		if (matchingLength < MINIMUM_MATCHING_CHARACTER_LENGTH) {
			// Merge the current change into the previous one
			prevChange.originalLength = (currChange.originalStart + currChange.originalLength) - prevChange.originalStart;
			prevChange.modifiedLength = (currChange.modifiedStart + currChange.modifiedLength) - prevChange.modifiedStart;
		} else {
			// Add the current change
			result.push(currChange);
			prevChange = currChange;
		}
	}

	return result;
}

class LineChange implements ILineChange {
	public originalStartLineNumber: number;
	public originalEndLineNumber: number;
	public modifiedStartLineNumber: number;
	public modifiedEndLineNumber: number;
	public charChanges: CharChange[];

	constructor(diffChange: IDiffChange, originalLineSequence: LineMarkerSequence, modifiedLineSequence: LineMarkerSequence, continueProcessingPredicate: () => boolean, shouldPostProcessCharChanges: boolean) {
		if (diffChange.originalLength === 0) {
			this.originalStartLineNumber = originalLineSequence.getStartLineNumber(diffChange.originalStart) - 1;
			this.originalEndLineNumber = 0;
		} else {
			this.originalStartLineNumber = originalLineSequence.getStartLineNumber(diffChange.originalStart);
			this.originalEndLineNumber = originalLineSequence.getEndLineNumber(diffChange.originalStart + diffChange.originalLength - 1);
		}

		if (diffChange.modifiedLength === 0) {
			this.modifiedStartLineNumber = modifiedLineSequence.getStartLineNumber(diffChange.modifiedStart) - 1;
			this.modifiedEndLineNumber = 0;
		} else {
			this.modifiedStartLineNumber = modifiedLineSequence.getStartLineNumber(diffChange.modifiedStart);
			this.modifiedEndLineNumber = modifiedLineSequence.getEndLineNumber(diffChange.modifiedStart + diffChange.modifiedLength - 1);
		}

		if (diffChange.originalLength !== 0 && diffChange.modifiedLength !== 0 && continueProcessingPredicate()) {
			const originalCharSequence = originalLineSequence.getCharSequence(diffChange.originalStart, diffChange.originalStart + diffChange.originalLength - 1);
			const modifiedCharSequence = modifiedLineSequence.getCharSequence(diffChange.modifiedStart, diffChange.modifiedStart + diffChange.modifiedLength - 1);

			let rawChanges = computeDiff(originalCharSequence, modifiedCharSequence, continueProcessingPredicate, false);

			if (shouldPostProcessCharChanges) {
				rawChanges = postProcessCharChanges(rawChanges);
			}

			this.charChanges = [];
			for (let i = 0, length = rawChanges.length; i < length; i++) {
				this.charChanges.push(new CharChange(rawChanges[i], originalCharSequence, modifiedCharSequence));
			}
		}
	}

}

export interface IDiffComputerOpts {
	shouldPostProcessCharChanges: boolean;
	shouldIgnoreTrimWhitespace: boolean;
	shouldConsiderTrimWhitespaceInEmptyCase: boolean;
	shouldMakePrettyDiff: boolean;
}

export class DiffComputer {

	private shouldPostProcessCharChanges: boolean;
	private shouldIgnoreTrimWhitespace: boolean;
	private shouldMakePrettyDiff: boolean;
	private maximumRunTimeMs: number;
	private original: LineMarkerSequence;
	private modified: LineMarkerSequence;

	private computationStartTime: number;

	constructor(originalLines: string[], modifiedLines: string[], opts: IDiffComputerOpts) {
		this.shouldPostProcessCharChanges = opts.shouldPostProcessCharChanges;
		this.shouldIgnoreTrimWhitespace = opts.shouldIgnoreTrimWhitespace;
		this.shouldMakePrettyDiff = opts.shouldMakePrettyDiff;
		this.maximumRunTimeMs = MAXIMUM_RUN_TIME;
		this.original = new LineMarkerSequence(originalLines, this.shouldIgnoreTrimWhitespace);
		this.modified = new LineMarkerSequence(modifiedLines, this.shouldIgnoreTrimWhitespace);
		if (opts.shouldConsiderTrimWhitespaceInEmptyCase && this.shouldIgnoreTrimWhitespace && this.original.equals(this.modified)) {
			// Diff would be empty with `shouldIgnoreTrimWhitespace`
			this.shouldIgnoreTrimWhitespace = false;
			this.original = new LineMarkerSequence(originalLines, this.shouldIgnoreTrimWhitespace);
			this.modified = new LineMarkerSequence(modifiedLines, this.shouldIgnoreTrimWhitespace);
		}
	}

	public computeDiff(): ILineChange[] {

		if (this.original.getLength() === 1 && this.original.getElementHash(0).length === 0) {
			// empty original => fast path
			return [{
				originalStartLineNumber: 1,
				originalEndLineNumber: 1,
				modifiedStartLineNumber: 1,
				modifiedEndLineNumber: this.modified.getLength(),
				charChanges: [{
					modifiedEndColumn: 0,
					modifiedEndLineNumber: 0,
					modifiedStartColumn: 0,
					modifiedStartLineNumber: 0,
					originalEndColumn: 0,
					originalEndLineNumber: 0,
					originalStartColumn: 0,
					originalStartLineNumber: 0
				}]
			}];
		}

		if (this.modified.getLength() === 1 && this.modified.getElementHash(0).length === 0) {
			// empty modified => fast path
			return [{
				originalStartLineNumber: 1,
				originalEndLineNumber: this.original.getLength(),
				modifiedStartLineNumber: 1,
				modifiedEndLineNumber: 1,
				charChanges: [{
					modifiedEndColumn: 0,
					modifiedEndLineNumber: 0,
					modifiedStartColumn: 0,
					modifiedStartLineNumber: 0,
					originalEndColumn: 0,
					originalEndLineNumber: 0,
					originalStartColumn: 0,
					originalStartLineNumber: 0
				}]
			}];
		}

		this.computationStartTime = (new Date()).getTime();

		const rawChanges = computeDiff(this.original, this.modified, this._continueProcessingPredicate.bind(this), this.shouldMakePrettyDiff);

		let lineChanges: ILineChange[] = [];
		for (let i = 0, length = rawChanges.length; i < length; i++) {
			lineChanges.push(new LineChange(rawChanges[i], this.original, this.modified, this._continueProcessingPredicate.bind(this), this.shouldPostProcessCharChanges));
		}
		return lineChanges;
	}

	private _continueProcessingPredicate(): boolean {
		if (this.maximumRunTimeMs === 0) {
			return true;
		}
		const now = (new Date()).getTime();
		return now - this.computationStartTime < this.maximumRunTimeMs;
	}

}
