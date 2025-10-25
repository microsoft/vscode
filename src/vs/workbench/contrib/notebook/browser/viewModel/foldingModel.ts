/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { renderAsPlaintext } from '../../../../../base/browser/markdownRenderer.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { DisposableStore, IDisposable } from '../../../../../base/common/lifecycle.js';
import { marked } from '../../../../../base/common/marked/marked.js';
import { TrackedRangeStickiness } from '../../../../../editor/common/model.js';
import { FoldingLimitReporter } from '../../../../../editor/contrib/folding/browser/folding.js';
import { FoldingRegion, FoldingRegions } from '../../../../../editor/contrib/folding/browser/foldingRanges.js';
import { IFoldingRangeData, sanitizeRanges } from '../../../../../editor/contrib/folding/browser/syntaxRangeProvider.js';
import { INotebookViewModel } from '../notebookBrowser.js';
import { CellKind } from '../../common/notebookCommon.js';
import { cellRangesToIndexes, ICellRange } from '../../common/notebookRange.js';

type RegionFilter = (r: FoldingRegion) => boolean;
type RegionFilterWithLevel = (r: FoldingRegion, level: number) => boolean;

const foldingRangeLimit: FoldingLimitReporter = {
	limit: 5000,
	update: () => { }
};

export class FoldingModel implements IDisposable {
	private _viewModel: INotebookViewModel | null = null;
	private readonly _viewModelStore = new DisposableStore();
	private _regions: FoldingRegions;
	get regions() {
		return this._regions;
	}

	private readonly _onDidFoldingRegionChanges = new Emitter<void>();
	readonly onDidFoldingRegionChanged: Event<void> = this._onDidFoldingRegionChanges.event;

	private _foldingRangeDecorationIds: string[] = [];

	constructor() {
		this._regions = new FoldingRegions(new Uint32Array(0), new Uint32Array(0));
	}

	dispose() {
		this._onDidFoldingRegionChanges.dispose();
		this._viewModelStore.dispose();
	}

	detachViewModel() {
		this._viewModelStore.clear();
		this._viewModel = null;
	}

	attachViewModel(model: INotebookViewModel) {
		this._viewModel = model;

		this._viewModelStore.add(this._viewModel.onDidChangeViewCells(() => {
			this.recompute();
		}));

		this._viewModelStore.add(this._viewModel.onDidChangeSelection(() => {
			if (!this._viewModel) {
				return;
			}

			const indexes = cellRangesToIndexes(this._viewModel.getSelections());

			let changed = false;

			indexes.forEach(index => {
				let regionIndex = this.regions.findRange(index + 1);

				while (regionIndex !== -1) {
					if (this._regions.isCollapsed(regionIndex) && index > this._regions.getStartLineNumber(regionIndex) - 1) {
						this._regions.setCollapsed(regionIndex, false);
						changed = true;
					}
					regionIndex = this._regions.getParentIndex(regionIndex);
				}
			});

			if (changed) {
				this._onDidFoldingRegionChanges.fire();
			}

		}));

		this.recompute();
	}

	getRegionAtLine(lineNumber: number): FoldingRegion | null {
		if (this._regions) {
			const index = this._regions.findRange(lineNumber);
			if (index >= 0) {
				return this._regions.toRegion(index);
			}
		}
		return null;
	}

	getRegionsInside(region: FoldingRegion | null, filter?: RegionFilter | RegionFilterWithLevel): FoldingRegion[] {
		const result: FoldingRegion[] = [];
		const index = region ? region.regionIndex + 1 : 0;
		const endLineNumber = region ? region.endLineNumber : Number.MAX_VALUE;

		if (filter && filter.length === 2) {
			const levelStack: FoldingRegion[] = [];
			for (let i = index, len = this._regions.length; i < len; i++) {
				const current = this._regions.toRegion(i);
				if (this._regions.getStartLineNumber(i) < endLineNumber) {
					while (levelStack.length > 0 && !current.containedBy(levelStack[levelStack.length - 1])) {
						levelStack.pop();
					}
					levelStack.push(current);
					if (filter(current, levelStack.length)) {
						result.push(current);
					}
				} else {
					break;
				}
			}
		} else {
			for (let i = index, len = this._regions.length; i < len; i++) {
				const current = this._regions.toRegion(i);
				if (this._regions.getStartLineNumber(i) < endLineNumber) {
					if (!filter || (filter as RegionFilter)(current)) {
						result.push(current);
					}
				} else {
					break;
				}
			}
		}
		return result;
	}

	getAllRegionsAtLine(lineNumber: number, filter?: (r: FoldingRegion, level: number) => boolean): FoldingRegion[] {
		const result: FoldingRegion[] = [];
		if (this._regions) {
			let index = this._regions.findRange(lineNumber);
			let level = 1;
			while (index >= 0) {
				const current = this._regions.toRegion(index);
				if (!filter || filter(current, level)) {
					result.push(current);
				}
				level++;
				index = current.parentIndex;
			}
		}
		return result;
	}

	setCollapsed(index: number, newState: boolean) {
		this._regions.setCollapsed(index, newState);
	}

	recompute() {
		if (!this._viewModel) {
			return;
		}

		const viewModel = this._viewModel;
		const cells = viewModel.viewCells;
		const stack: { index: number; level: number; endIndex: number }[] = [];

		for (let i = 0; i < cells.length; i++) {
			const cell = cells[i];

			if (cell.cellKind !== CellKind.Markup || cell.language !== 'markdown') {
				continue;
			}

			const minDepth = Math.min(7, ...Array.from(getMarkdownHeadersInCell(cell.getText()), header => header.depth));
			if (minDepth < 7) {
				// header 1 to 6
				stack.push({ index: i, level: minDepth, endIndex: 0 });
			}
		}

		// calculate folding ranges
		const rawFoldingRanges: IFoldingRangeData[] = stack.map((entry, startIndex) => {
			let end: number | undefined = undefined;
			for (let i = startIndex + 1; i < stack.length; ++i) {
				if (stack[i].level <= entry.level) {
					end = stack[i].index - 1;
					break;
				}
			}

			const endIndex = end !== undefined ? end : cells.length - 1;

			// one based
			return {
				start: entry.index + 1,
				end: endIndex + 1,
				rank: 1
			};
		}).filter(range => range.start !== range.end);

		const newRegions = sanitizeRanges(rawFoldingRanges, foldingRangeLimit);

		// restore collased state
		let i = 0;
		const nextCollapsed = () => {
			while (i < this._regions.length) {
				const isCollapsed = this._regions.isCollapsed(i);
				i++;
				if (isCollapsed) {
					return i - 1;
				}
			}
			return -1;
		};

		let k = 0;
		let collapsedIndex = nextCollapsed();

		while (collapsedIndex !== -1 && k < newRegions.length) {
			// get the latest range
			const decRange = viewModel.getTrackedRange(this._foldingRangeDecorationIds[collapsedIndex]);
			if (decRange) {
				const collasedStartIndex = decRange.start;

				while (k < newRegions.length) {
					const startIndex = newRegions.getStartLineNumber(k) - 1;
					if (collasedStartIndex >= startIndex) {
						newRegions.setCollapsed(k, collasedStartIndex === startIndex);
						k++;
					} else {
						break;
					}
				}
			}
			collapsedIndex = nextCollapsed();
		}

		while (k < newRegions.length) {
			newRegions.setCollapsed(k, false);
			k++;
		}

		const cellRanges: ICellRange[] = [];
		for (let i = 0; i < newRegions.length; i++) {
			const region = newRegions.toRegion(i);
			cellRanges.push({ start: region.startLineNumber - 1, end: region.endLineNumber - 1 });
		}

		// remove old tracked ranges and add new ones
		// TODO@rebornix, implement delta
		this._foldingRangeDecorationIds.forEach(id => viewModel.setTrackedRange(id, null, TrackedRangeStickiness.GrowsOnlyWhenTypingAfter));
		this._foldingRangeDecorationIds = cellRanges.map(region => viewModel.setTrackedRange(null, region, TrackedRangeStickiness.GrowsOnlyWhenTypingAfter)).filter(str => str !== null) as string[];

		this._regions = newRegions;
		this._onDidFoldingRegionChanges.fire();
	}

	getMemento(): ICellRange[] {
		const collapsedRanges: ICellRange[] = [];
		let i = 0;
		while (i < this._regions.length) {
			const isCollapsed = this._regions.isCollapsed(i);

			if (isCollapsed) {
				const region = this._regions.toRegion(i);
				collapsedRanges.push({ start: region.startLineNumber - 1, end: region.endLineNumber - 1 });
			}

			i++;
		}

		return collapsedRanges;
	}

	public applyMemento(state: ICellRange[]): boolean {
		if (!this._viewModel) {
			return false;
		}

		let i = 0;
		let k = 0;

		while (k < state.length && i < this._regions.length) {
			// get the latest range
			const decRange = this._viewModel.getTrackedRange(this._foldingRangeDecorationIds[i]);
			if (decRange) {
				const collasedStartIndex = state[k].start;

				while (i < this._regions.length) {
					const startIndex = this._regions.getStartLineNumber(i) - 1;
					if (collasedStartIndex >= startIndex) {
						this._regions.setCollapsed(i, collasedStartIndex === startIndex);
						i++;
					} else {
						break;
					}
				}
			}
			k++;
		}

		while (i < this._regions.length) {
			this._regions.setCollapsed(i, false);
			i++;
		}

		return true;
	}
}

export function updateFoldingStateAtIndex(foldingModel: FoldingModel, index: number, collapsed: boolean) {
	const range = foldingModel.regions.findRange(index + 1);
	foldingModel.setCollapsed(range, collapsed);
}

export function* getMarkdownHeadersInCell(cellContent: string): Iterable<{ readonly depth: number; readonly text: string }> {
	for (const token of marked.lexer(cellContent, { gfm: true })) {
		if (token.type === 'heading') {
			yield {
				depth: token.depth,
				text: renderAsPlaintext({ value: token.raw }).trim()
			};
		}
	}
}
