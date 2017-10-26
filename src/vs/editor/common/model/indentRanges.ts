/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { ITextModel } from 'vs/editor/common/editorCommon';
import { FoldingMarkers } from 'vs/editor/common/modes/languageConfiguration';
import { computeIndentLevel } from 'vs/editor/common/model/modelLine';

export const MAX_FOLDING_REGIONS = 0xFFFF;

const MAX_FOLDING_REGIONS_FOR_INDENT_LIMIT = 5000;
const MASK_LINE_NUMBER = 0xFFFFFF;
const MASK_INDENT = 0xFF000000;

export class IndentRanges {
	private _startIndexes: Uint32Array;
	private _endIndexes: Uint32Array;
	private _model: ITextModel;

	constructor(startIndexes: Uint32Array, endIndexes: Uint32Array, model: ITextModel) {
		if (startIndexes.length !== endIndexes.length || startIndexes.length > MAX_FOLDING_REGIONS) {
			throw new Error('invalid startIndexes or endIndexes size');
		}
		this._startIndexes = startIndexes;
		this._endIndexes = endIndexes;
		this._model = model;
		this._computeParentIndices();
	}

	private _computeParentIndices() {
		let parentIndexes = [];
		let isInsideLast = (startLineNumber: number, endLineNumber: number) => {
			let index = parentIndexes[parentIndexes.length - 1];
			return this.getStartLineNumber(index) <= startLineNumber && this.getEndLineNumber(index) >= endLineNumber;
		};
		for (let i = 0, len = this._startIndexes.length; i < len; i++) {
			let startLineNumber = this._startIndexes[i];
			let endLineNumber = this._endIndexes[i];
			if (startLineNumber > MASK_LINE_NUMBER || endLineNumber > MASK_LINE_NUMBER) {
				throw new Error('startLineNumber or endLineNumber must not exceed ' + MASK_LINE_NUMBER);
			}
			while (parentIndexes.length > 0 && !isInsideLast(startLineNumber, endLineNumber)) {
				parentIndexes.pop();
			}
			let parentIndex = parentIndexes.length > 0 ? parentIndexes[parentIndexes.length - 1] : -1;
			parentIndexes.push(i);
			this._startIndexes[i] = startLineNumber + ((parentIndex & 0xFF) << 24);
			this._endIndexes[i] = endLineNumber + ((parentIndex & 0xFF00) << 16);
		}
	}

	public get length(): number {
		return this._startIndexes.length;
	}

	public getStartLineNumber(index: number): number {
		return this._startIndexes[index] & MASK_LINE_NUMBER;
	}

	public getEndLineNumber(index: number): number {
		return this._endIndexes[index] & MASK_LINE_NUMBER;
	}

	public getParentIndex(index: number) {
		let parent = ((this._startIndexes[index] & MASK_INDENT) >>> 24) + ((this._endIndexes[index] & MASK_INDENT) >>> 16);
		if (parent === MAX_FOLDING_REGIONS) {
			return -1;
		}
		return parent;
	}

	public getIndent(index: number) {
		const lineNumber = this.getStartLineNumber(index);
		const tabSize = this._model.getOptions().tabSize;
		const lineContent = this._model.getLineContent(lineNumber);
		return computeIndentLevel(lineContent, tabSize);
	}

	public contains(index: number, line: number) {
		return this.getStartLineNumber(index) <= line && this.getEndLineNumber(index) >= line;
	}

	private findIndex(line: number) {
		let low = 0, high = this._startIndexes.length;
		if (high === 0) {
			return -1; // no children
		}
		while (low < high) {
			let mid = Math.floor((low + high) / 2);
			if (line < this.getStartLineNumber(mid)) {
				high = mid;
			} else {
				low = mid + 1;
			}
		}
		return low - 1;
	}


	public findRange(line: number): number {
		let index = this.findIndex(line);
		if (index >= 0) {
			let endLineNumber = this.getEndLineNumber(index);
			if (endLineNumber >= line) {
				return index;
			}
			index = this.getParentIndex(index);
			while (index !== -1) {
				if (this.contains(index, line)) {
					return index;
				}
				index = this.getParentIndex(index);
			}
		}
		return -1;
	}
}
// public only for testing
export class RangesCollector {
	private _startIndexes: number[];
	private _endIndexes: number[];
	private _indentOccurrences: number[];
	private _length: number;
	private _foldingRegionsLimit: number;

	constructor(foldingRegionsLimit: number) {
		this._startIndexes = [];
		this._endIndexes = [];
		this._indentOccurrences = [];
		this._length = 0;
		this._foldingRegionsLimit = foldingRegionsLimit;
	}

	public insertFirst(startLineNumber: number, endLineNumber: number, indent: number) {
		if (startLineNumber > MASK_LINE_NUMBER || endLineNumber > MASK_LINE_NUMBER) {
			return;
		}
		let index = this._length;
		this._startIndexes[index] = startLineNumber;
		this._endIndexes[index] = endLineNumber;
		this._length++;
		if (indent < 1000) {
			this._indentOccurrences[indent] = (this._indentOccurrences[indent] || 0) + 1;
		}
	}

	public toIndentRanges(model: ITextModel) {
		if (this._length <= this._foldingRegionsLimit) {
			// reverse and create arrays of the exact length
			let startIndexes = new Uint32Array(this._length);
			let endIndexes = new Uint32Array(this._length);
			for (let i = this._length - 1, k = 0; i >= 0; i-- , k++) {
				startIndexes[k] = this._startIndexes[i];
				endIndexes[k] = this._endIndexes[i];
			}
			return new IndentRanges(startIndexes, endIndexes, model);
		} else {
			let entries = 0;
			let maxIndent = this._indentOccurrences.length;
			for (let i = 0; i < this._indentOccurrences.length; i++) {
				let n = this._indentOccurrences[i];
				if (n) {
					if (n + entries > this._foldingRegionsLimit) {
						maxIndent = i;
						break;
					}
					entries += n;
				}
			}
			const tabSize = model.getOptions().tabSize;
			// reverse and create arrays of the exact length
			let startIndexes = new Uint32Array(entries);
			let endIndexes = new Uint32Array(entries);
			for (let i = this._length - 1, k = 0; i >= 0; i--) {
				let startIndex = this._startIndexes[i];
				let lineContent = model.getLineContent(startIndex);
				let indent = computeIndentLevel(lineContent, tabSize);
				if (indent < maxIndent) {
					startIndexes[k] = startIndex;
					endIndexes[k] = this._endIndexes[i];
					k++;
				}
			}
			return new IndentRanges(startIndexes, endIndexes, model);
		}

	}
}


interface PreviousRegion { indent: number; line: number; marker: boolean; };

export function computeRanges(model: ITextModel, offSide: boolean, markers?: FoldingMarkers, foldingRegionsLimit = MAX_FOLDING_REGIONS_FOR_INDENT_LIMIT): IndentRanges {
	const tabSize = model.getOptions().tabSize;
	let result = new RangesCollector(foldingRegionsLimit);

	let pattern = void 0;
	if (markers) {
		pattern = new RegExp(`(${markers.start.source})|(?:${markers.end.source})`);
	}

	let previousRegions: PreviousRegion[] = [];
	previousRegions.push({ indent: -1, line: model.getLineCount() + 1, marker: false }); // sentinel, to make sure there's at least one entry

	for (let line = model.getLineCount(); line > 0; line--) {
		let lineContent = model.getLineContent(line);
		let indent = computeIndentLevel(lineContent, tabSize);
		let previous = previousRegions[previousRegions.length - 1];
		if (indent === -1) {
			if (offSide && !previous.marker) {
				// for offSide languages, empty lines are associated to the next block
				previous.line = line;
			}
			continue; // only whitespace
		}
		let m;
		if (pattern && (m = lineContent.match(pattern))) {
			// folding pattern match
			if (m[1]) { // start pattern match
				// discard all regions until the folding pattern
				let i = previousRegions.length - 1;
				while (i > 0 && !previousRegions[i].marker) {
					i--;
				}
				if (i > 0) {
					previousRegions.length = i + 1;
					previous = previousRegions[i];

					// new folding range from pattern, includes the end line
					result.insertFirst(line, previous.line, indent);
					previous.marker = false;
					previous.indent = indent;
					previous.line = line;
					continue;
				} else {
					// no end marker found, treat line as a regular line
				}
			} else { // end pattern match
				previousRegions.push({ indent: -2, line, marker: true });
				continue;
			}
		}
		if (previous.indent > indent) {
			// discard all regions with larger indent
			do {
				previousRegions.pop();
				previous = previousRegions[previousRegions.length - 1];
			} while (previous.indent > indent);

			// new folding range
			let endLineNumber = previous.line - 1;
			if (endLineNumber - line >= 1) { // needs at east size 1
				result.insertFirst(line, endLineNumber, indent);
			}
		}
		if (previous.indent === indent) {
			previous.line = line;
		} else { // previous.indent < indent
			// new region with a bigger indent
			previousRegions.push({ indent, line, marker: false });
		}
	}
	return result.toIndentRanges(model);
}
