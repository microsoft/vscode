/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../base/common/cancellation.js';
import { onUnexpectedExternalError } from '../../../../base/common/errors.js';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { ITextModel } from '../../../common/model.js';
import { FoldingContext, FoldingRange, FoldingRangeKind, FoldingRangeProvider } from '../../../common/languages.js';
import { FoldingLimitReporter, RangeProvider } from './folding.js';
import { FoldingRegions, FoldSource, MAX_LINE_NUMBER } from './foldingRanges.js';
import { IndentRangeProvider } from './indentRangeProvider.js';

export interface IFoldingRangeData extends FoldingRange {
	rank: number;
}

const foldingContext: FoldingContext = {
};

const ID_SYNTAX_PROVIDER = 'syntax';

export class SyntaxRangeProvider implements RangeProvider {

	readonly id = ID_SYNTAX_PROVIDER;

	readonly disposables: DisposableStore;

	constructor(
		private readonly editorModel: ITextModel,
		private readonly providers: FoldingRangeProvider[],
		readonly handleFoldingRangesChange: () => void,
		private readonly foldingRangesLimit: FoldingLimitReporter,
		private readonly fallbackRangeProvider: IndentRangeProvider | undefined
	) {
		this.disposables = new DisposableStore();
		if (fallbackRangeProvider) {
			this.disposables.add(fallbackRangeProvider);
		}

		for (const provider of providers) {
			if (typeof provider.onDidChange === 'function') {
				this.disposables.add(provider.onDidChange(handleFoldingRangesChange));
			}
		}
	}

	async compute(cancellationToken: CancellationToken): Promise<FoldingRegions | null> {
		let ranges = await collectSyntaxRanges(this.providers, this.editorModel, cancellationToken);
		if (this.editorModel.isDisposed() || cancellationToken.isCancellationRequested) {
			return null;
		}
		if (!ranges) {
			return this.fallbackRangeProvider?.compute(cancellationToken) ?? null;
		}
		if (this.fallbackRangeProvider && this.providers.every(provider => provider.isSecondary === true)) {
			const maxLineNumber = this.editorModel.getLineCount();
			const priorityRanges = FoldingRegions.sanitizeAndMerge([], ranges.sort(compareRanges)
				.filter(range => Number.isInteger(range.start) && Number.isInteger(range.end) && range.end <= MAX_LINE_NUMBER)
				.map(range => ({
					startLineNumber: range.start,
					endLineNumber: range.end,
					type: range.kind?.value,
					isCollapsed: false,
					source: FoldSource.userDefined // Give explicit ranges precedence during the merge only.
				})), maxLineNumber);
			const indentationRanges = this.fallbackRangeProvider.computeRanges().map(range => ({
				startLineNumber: range.start,
				endLineNumber: range.end,
				type: range.kind?.value,
				isCollapsed: false,
				source: FoldSource.provider
			}));
			ranges = FoldingRegions.sanitizeAndMerge(indentationRanges, priorityRanges, maxLineNumber).map(range => ({
				start: range.startLineNumber,
				end: range.endLineNumber,
				kind: range.type ? FoldingRangeKind.fromValue(range.type) : undefined,
				rank: 0
			}));
		}
		return sanitizeRanges(ranges, this.foldingRangesLimit);
	}

	dispose() {
		this.disposables.dispose();
	}
}

function collectSyntaxRanges(providers: FoldingRangeProvider[], model: ITextModel, cancellationToken: CancellationToken): Promise<IFoldingRangeData[] | null> {
	let rangeData: IFoldingRangeData[] | null = null;
	const promises = providers.map(async (provider, i) => {
		try {
			const ranges = await provider.provideFoldingRanges(model, foldingContext, cancellationToken);
			if (cancellationToken.isCancellationRequested || model.isDisposed()) {
				return;
			}
			if (Array.isArray(ranges)) {
				if (!Array.isArray(rangeData)) {
					rangeData = [];
				}
				const nLines = model.getLineCount();
				for (const r of ranges) {
					if (r.start > 0 && r.end > r.start && r.end <= nLines) {
						rangeData.push({ start: r.start, end: r.end, rank: i, kind: r.kind });
					}
				}
			}
		} catch (error) {
			onUnexpectedExternalError(error);
		}
	});
	return Promise.all(promises).then(_ => {
		return rangeData;
	});
}

class RangesCollector {
	private readonly _startIndexes: number[];
	private readonly _endIndexes: number[];
	private readonly _nestingLevels: number[];
	private readonly _nestingLevelCounts: number[];
	private readonly _types: Array<string | undefined>;
	private _length: number;
	private readonly _foldingRangesLimit: FoldingLimitReporter;

	constructor(foldingRangesLimit: FoldingLimitReporter) {
		this._startIndexes = [];
		this._endIndexes = [];
		this._nestingLevels = [];
		this._nestingLevelCounts = [];
		this._types = [];
		this._length = 0;
		this._foldingRangesLimit = foldingRangesLimit;
	}

	public add(startLineNumber: number, endLineNumber: number, type: string | undefined, nestingLevel: number) {
		if (startLineNumber > MAX_LINE_NUMBER || endLineNumber > MAX_LINE_NUMBER) {
			return;
		}
		const index = this._length;
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
		const limit = this._foldingRangesLimit.limit;
		if (this._length <= limit) {
			this._foldingRangesLimit.update(this._length, false);

			const startIndexes = new Uint32Array(this._length);
			const endIndexes = new Uint32Array(this._length);
			for (let i = 0; i < this._length; i++) {
				startIndexes[i] = this._startIndexes[i];
				endIndexes[i] = this._endIndexes[i];
			}
			return new FoldingRegions(startIndexes, endIndexes, this._types);
		} else {
			this._foldingRangesLimit.update(this._length, limit);

			let entries = 0;
			let maxLevel = this._nestingLevelCounts.length;
			for (let i = 0; i < this._nestingLevelCounts.length; i++) {
				const n = this._nestingLevelCounts[i];
				if (n) {
					if (n + entries > limit) {
						maxLevel = i;
						break;
					}
					entries += n;
				}
			}

			const startIndexes = new Uint32Array(limit);
			const endIndexes = new Uint32Array(limit);
			const types: Array<string | undefined> = [];
			for (let i = 0, k = 0; i < this._length; i++) {
				const level = this._nestingLevels[i];
				if (level < maxLevel || (level === maxLevel && entries++ < limit)) {
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

function compareRanges(first: IFoldingRangeData, second: IFoldingRangeData): number {
	return first.start - second.start || first.rank - second.rank;
}

export function sanitizeRanges(rangeData: IFoldingRangeData[], foldingRangesLimit: FoldingLimitReporter): FoldingRegions {
	const sorted = rangeData.sort(compareRanges);
	const collector = new RangesCollector(foldingRangesLimit);

	let top: IFoldingRangeData | undefined = undefined;
	const previous: IFoldingRangeData[] = [];
	for (const entry of sorted) {
		if (!top) {
			top = entry;
			collector.add(entry.start, entry.end, entry.kind && entry.kind.value, previous.length);
		} else {
			if (entry.start > top.start) {
				if (entry.end <= top.end) {
					previous.push(top);
					top = entry;
					collector.add(entry.start, entry.end, entry.kind && entry.kind.value, previous.length);
				} else {
					if (entry.start > top.end) {
						do {
							top = previous.pop();
						} while (top && entry.start > top.end);
						if (top) {
							previous.push(top);
						}
						top = entry;
					}
					collector.add(entry.start, entry.end, entry.kind && entry.kind.value, previous.length);
				}
			}
		}
	}
	return collector.toIndentRanges();
}
