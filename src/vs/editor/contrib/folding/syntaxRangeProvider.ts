/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { FoldingProvider, IFoldingRange } from 'vs/editor/common/modes';
import { onUnexpectedExternalError } from 'vs/base/common/errors';
import { asWinJsPromise } from 'vs/base/common/async';
import { ITextModel } from 'vs/editor/common/model';
import { RangeProvider } from './folding';
import { TPromise } from 'vs/base/common/winjs.base';
import { MAX_LINE_NUMBER, FoldingRegions } from './foldingRanges';

const MAX_FOLDING_REGIONS_FOR_INDENT_LIMIT = 5000;

export interface IFoldingRangeData extends IFoldingRange {
	rank: number;
}

export class SyntaxRangeProvider implements RangeProvider {

	constructor(private providers: FoldingProvider[]) {
	}

	compute(model: ITextModel): TPromise<FoldingRegions> {
		return collectSyntaxRanges(this.providers, model).then(ranges => {
			return sanitizeRanges(ranges);
		});
	}

}

function collectSyntaxRanges(providers: FoldingProvider[], model: ITextModel): TPromise<IFoldingRangeData[]> {
	const rangeData: IFoldingRangeData[] = [];
	let promises = providers.map((provider, rank) => asWinJsPromise(token => provider.provideFoldingRanges(model, token)).then(list => {
		if (list && Array.isArray(list.ranges)) {
			for (let r of list.ranges) {
				rangeData.push({ startLineNumber: r.startLineNumber, endLineNumber: r.endLineNumber, rank, type: r.type });
			}
		}
	}, onUnexpectedExternalError));

	return TPromise.join(promises).then(() => {
		return rangeData;
	});
}

export class RangesCollector {
	private _startIndexes: number[];
	private _endIndexes: number[];
	private _nestingLevels: number[];
	private _nestingLevelCounts: number[];
	private _types: string[];
	private _length: number;
	private _foldingRangesLimit: number;

	constructor(foldingRangesLimit: number) {
		this._startIndexes = [];
		this._endIndexes = [];
		this._nestingLevels = [];
		this._nestingLevelCounts = [];
		this._types = [];
		this._length = 0;
		this._foldingRangesLimit = foldingRangesLimit;
	}

	public add(startLineNumber: number, endLineNumber: number, type: string, nestingLevel: number) {
		if (startLineNumber > MAX_LINE_NUMBER || endLineNumber > MAX_LINE_NUMBER) {
			return;
		}
		let index = this._length;
		this._startIndexes[index] = startLineNumber;
		this._endIndexes[index] = endLineNumber;
		this._nestingLevels[index] = nestingLevel;
		this._types[index] = type;
		this._length++;
		if (nestingLevel < 30) {
			this._nestingLevelCounts[nestingLevel] = (this._nestingLevelCounts[nestingLevel] || 0) + 1;
		}
	}

	public toIndentRanges() {
		if (this._length <= this._foldingRangesLimit) {
			let startIndexes = new Uint32Array(this._length);
			let endIndexes = new Uint32Array(this._length);
			for (let i = 0; i < this._length; i++) {
				startIndexes[i] = this._startIndexes[i];
				endIndexes[i] = this._endIndexes[i];
			}
			return new FoldingRegions(startIndexes, endIndexes, this._types);
		} else {
			let entries = 0;
			let maxLevel = this._nestingLevelCounts.length;
			for (let i = 0; i < this._nestingLevelCounts.length; i++) {
				let n = this._nestingLevelCounts[i];
				if (n) {
					if (n + entries > this._foldingRangesLimit) {
						maxLevel = i;
						break;
					}
					entries += n;
				}
			}
			let startIndexes = new Uint32Array(entries);
			let endIndexes = new Uint32Array(entries);
			let types = [];
			for (let i = 0, k = 0; i < this._length; i++) {
				let level = this._nestingLevels[i];
				if (level < maxLevel) {
					startIndexes[k] = this._startIndexes[i];
					endIndexes[k] = this._endIndexes[i];
					types[k] = this._types[i];
					k++;
				}
			}
			return new FoldingRegions(startIndexes, endIndexes, types);
		}

	}
}

export function sanitizeRanges(rangeData: IFoldingRangeData[]): FoldingRegions {

	let sorted = rangeData.sort((d1, d2) => {
		let diff = d1.startLineNumber - d2.startLineNumber;
		if (diff === 0) {
			diff = d1.rank - d2.rank;
		}
		return diff;
	});
	let collector = new RangesCollector(MAX_FOLDING_REGIONS_FOR_INDENT_LIMIT);

	let top: IFoldingRangeData = null;
	let previous = [];
	for (let entry of sorted) {
		if (!top) {
			top = entry;
			collector.add(entry.startLineNumber, entry.endLineNumber, entry.type, previous.length);
		} else {
			if (entry.startLineNumber > top.startLineNumber) {
				if (entry.endLineNumber <= top.endLineNumber) {
					previous.push(top);
					top = entry;
					collector.add(entry.startLineNumber, entry.endLineNumber, entry.type, previous.length);
				} else if (entry.startLineNumber > top.endLineNumber) {
					do {
						top = previous.pop();
					} while (top && entry.startLineNumber > top.endLineNumber);
					previous.push(top);
					top = entry;
					collector.add(entry.startLineNumber, entry.endLineNumber, entry.type, previous.length);
				}
			}
		}
	}
	return collector.toIndentRanges();
}