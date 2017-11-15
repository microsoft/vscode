/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IModel, IModelDecorationOptions, IModelDeltaDecoration, IModelDecorationsChangeAccessor } from 'vs/editor/common/editorCommon';
import Event, { Emitter } from 'vs/base/common/event';
import { FoldingRanges, ILineRange } from './foldingRanges';

export interface IDecorationProvider {
	getDecorationOption(isCollapsed: boolean): IModelDecorationOptions;
	deltaDecorations(oldDecorations: string[], newDecorations: IModelDeltaDecoration[]): string[];
	changeDecorations<T>(callback: (changeAccessor: IModelDecorationsChangeAccessor) => T): T;
}

export interface FoldingModelChangeEvent {
	model: FoldingModel;
	collapseStateChanged?: FoldingRegion[];
}

export type CollapseMemento = ILineRange[];

export class FoldingModel {
	private _textModel: IModel;
	private _decorationProvider: IDecorationProvider;

	private _ranges: FoldingRanges;
	private _editorDecorationIds: string[];

	private _updateEventEmitter = new Emitter<FoldingModelChangeEvent>();

	public get ranges(): FoldingRanges { return this._ranges; }
	public get onDidChange(): Event<FoldingModelChangeEvent> { return this._updateEventEmitter.event; }
	public get textModel() { return this._textModel; }

	constructor(textModel: IModel, decorationProvider: IDecorationProvider) {
		this._textModel = textModel;
		this._decorationProvider = decorationProvider;
		this._ranges = new FoldingRanges(new Uint32Array(0), new Uint32Array(0));
		this._editorDecorationIds = [];
	}

	public toggleCollapseState(regions: FoldingRegion[]) {
		if (!regions.length) {
			return;
		}
		let processed = {};
		this._decorationProvider.changeDecorations(accessor => {
			for (let region of regions) {
				let index = region.regionIndex;
				let editorDecorationId = this._editorDecorationIds[index];
				if (editorDecorationId && !processed[editorDecorationId]) {
					processed[editorDecorationId] = true;
					let newCollapseState = !this._ranges.isCollapsed(index);
					this._ranges.setCollapsed(index, newCollapseState);
					accessor.changeDecorationOptions(editorDecorationId, this._decorationProvider.getDecorationOption(newCollapseState));
				}
			}
		});
		this._updateEventEmitter.fire({ model: this, collapseStateChanged: regions });
	}

	public update(newRanges: FoldingRanges): void {
		let newEditorDecorations = [];

		let initRange = (index: number, isCollapsed: boolean) => {
			newRanges.setCollapsed(index, isCollapsed);
			let startLineNumber = newRanges.getStartLineNumber(index);
			let maxColumn = this._textModel.getLineMaxColumn(startLineNumber);
			let decorationRange = {
				startLineNumber: startLineNumber,
				startColumn: maxColumn,
				endLineNumber: startLineNumber,
				endColumn: maxColumn
			};
			newEditorDecorations.push({ range: decorationRange, options: this._decorationProvider.getDecorationOption(isCollapsed) });
		};

		let i = 0;
		let nextCollapsed = () => {
			while (i < this._ranges.length) {
				let isCollapsed = this._ranges.isCollapsed(i);
				i++;
				if (isCollapsed) {
					return i - 1;
				}
			}
			return -1;
		};

		let k = 0;
		let collapsedIndex = nextCollapsed();
		while (collapsedIndex !== -1 && k < newRanges.length) {
			// get the latest range
			let decRange = this._textModel.getDecorationRange(this._editorDecorationIds[collapsedIndex]);
			if (decRange) {
				let collapsedStartLineNumber = decRange.startLineNumber;
				while (k < newRanges.length) {
					let startLineNumber = newRanges.getStartLineNumber(k);
					if (collapsedStartLineNumber >= startLineNumber) {
						initRange(k, collapsedStartLineNumber === startLineNumber);
						k++;
					} else {
						break;
					}
				}
			}
			collapsedIndex = nextCollapsed();
		}
		while (k < newRanges.length) {
			initRange(k, false);
			k++;
		}

		this._editorDecorationIds = this._decorationProvider.deltaDecorations(this._editorDecorationIds, newEditorDecorations);
		this._ranges = newRanges;
		this._updateEventEmitter.fire({ model: this });
	}

	/**
	 * Collapse state memento, for persistence only
	 */
	public getMemento(): CollapseMemento {
		let collapsedRanges: ILineRange[] = [];
		for (let i = 0; i < this._ranges.length; i++) {
			if (this._ranges.isCollapsed(i)) {
				let range = this._textModel.getDecorationRange(this._editorDecorationIds[i]);
				if (range) {
					let startLineNumber = range.startLineNumber;
					let endLineNumber = range.endLineNumber + this._ranges.getEndLineNumber(i) - this._ranges.getStartLineNumber(i);
					collapsedRanges.push({ startLineNumber, endLineNumber });
				}
			}
		}
		if (collapsedRanges.length > 0) {
			return collapsedRanges;
		}
		return null;
	}

	/**
	 * Apply persisted state, for persistence only
	 */
	public applyMemento(state: CollapseMemento) {
		if (!Array.isArray(state)) {
			return;
		}
		let toToogle: FoldingRegion[] = [];
		for (let range of state) {
			let region = this.getRegionAtLine(range.startLineNumber);
			if (region && !region.isCollapsed) {
				toToogle.push(region);
			}
		}
		this.toggleCollapseState(toToogle);
	}

	public dispose() {
		this._decorationProvider.deltaDecorations(this._editorDecorationIds, []);
	}

	getAllRegionsAtLine(lineNumber: number, filter?: (r: FoldingRegion, level: number) => boolean): FoldingRegion[] {
		let result: FoldingRegion[] = [];
		if (this._ranges) {
			let index = this._ranges.findRange(lineNumber);
			let level = 1;
			while (index >= 0) {
				let current = new FoldingRegion(this._ranges, index);
				if (!filter || filter(current, level)) {
					result.push(current);
				}
				level++;
				index = current.parentIndex;
			}
		}
		return result;
	}

	getRegionAtLine(lineNumber: number): FoldingRegion {
		if (this._ranges) {
			let index = this._ranges.findRange(lineNumber);
			if (index >= 0) {
				return new FoldingRegion(this._ranges, index);
			}
		}
		return null;
	}

	getRegionsInside(region: FoldingRegion, filter?: (r: FoldingRegion, level?: number) => boolean): FoldingRegion[] {
		let result = [];
		let trackLevel = filter && filter.length === 2;
		let levelStack: FoldingRegion[] = trackLevel ? [] : null;
		let index = region ? region.regionIndex + 1 : 0;
		let endLineNumber = region ? region.endLineNumber : Number.MAX_VALUE;
		for (let i = index, len = this._ranges.length; i < len; i++) {
			let current = new FoldingRegion(this._ranges, i);
			if (this._ranges.getStartLineNumber(i) < endLineNumber) {
				if (trackLevel) {
					while (levelStack.length > 0 && !current.containedBy(levelStack[levelStack.length - 1])) {
						levelStack.pop();
					}
					levelStack.push(current);
					if (filter(current, levelStack.length)) {
						result.push(current);
					}
				} else if (!filter || filter(current)) {
					result.push(current);
				}
			} else {
				break;
			}
		}
		return result;
	}

}

export class FoldingRegion {

	constructor(private ranges: FoldingRanges, private index: number) {
	}

	public get startLineNumber() {
		return this.ranges.getStartLineNumber(this.index);
	}

	public get endLineNumber() {
		return this.ranges.getEndLineNumber(this.index);
	}

	public get regionIndex() {
		return this.index;
	}

	public get parentIndex() {
		return this.ranges.getParentIndex(this.index);
	}

	public get isCollapsed() {
		return this.ranges.isCollapsed(this.index);
	}

	containedBy(range: ILineRange): boolean {
		return range.startLineNumber <= this.startLineNumber && range.endLineNumber >= this.endLineNumber;
	}
	containsLine(lineNumber: number) {
		return this.startLineNumber <= lineNumber && lineNumber <= this.endLineNumber;
	}
	hidesLine(lineNumber: number) {
		return this.startLineNumber < lineNumber && lineNumber <= this.endLineNumber;
	}
}

/**
 * Collapse or expand the regions at the given locations including all children.
 * @param doCollapse Wheter to collase or expand
 * @param levels The number of levels. Use 1 to only impact the regions at the location, use Number.MAX_VALUE for all levels.
 * @param lineNumbers the location of the regions to collapse or expand, or if not set, all regions in the model.
 */
export function setCollapseStateLevelsDown(foldingModel: FoldingModel, doCollapse: boolean, levels = Number.MAX_VALUE, lineNumbers?: number[]) {
	let toToggle = [];
	if (lineNumbers && lineNumbers.length > 0) {
		for (let lineNumber of lineNumbers) {
			let region = foldingModel.getRegionAtLine(lineNumber);
			if (region) {
				if (region.isCollapsed !== doCollapse) {
					toToggle.push(region);
				}
				if (levels > 1) {
					let regionsInside = foldingModel.getRegionsInside(region, (r, level) => r.isCollapsed !== doCollapse && level < levels);
					toToggle.push(...regionsInside);
				}
			}
		}
	} else {
		let regionsInside = foldingModel.getRegionsInside(null, (r, level) => r.isCollapsed !== doCollapse && level < levels);
		toToggle.push(...regionsInside);
	}
	foldingModel.toggleCollapseState(toToggle);
}

/**
 * Collapse or expand the regions at the given locations including all parents.
 * @param doCollapse Wheter to collase or expand
 * @param levels The number of levels. Use 1 to only impact the regions at the location, use Number.MAX_VALUE for all levels.
 * @param lineNumbers the location of the regions to collapse or expand, or if not set, all regions in the model.
 */
export function setCollapseStateLevelsUp(foldingModel: FoldingModel, doCollapse: boolean, levels: number, lineNumbers: number[]) {
	let toToggle = [];
	for (let lineNumber of lineNumbers) {
		let regions = foldingModel.getAllRegionsAtLine(lineNumber, (region, level) => region.isCollapsed !== doCollapse && level <= levels);
		toToggle.push(...regions);
	}
	foldingModel.toggleCollapseState(toToggle);
}

/**
 * Folds or unfolds all regions that have a given level, except if they contain one of the blocked lines.
 * @param foldLevel level. Level == 1 is the top level
 * @param doCollapse Wheter to collase or expand
* @param blockedLineNumbers
*/
export function setCollapseStateAtLevel(foldingModel: FoldingModel, foldLevel: number, doCollapse: boolean, blockedLineNumbers: number[]): void {
	let filter = (region: FoldingRegion, level: number) => level === foldLevel && region.isCollapsed !== doCollapse && !blockedLineNumbers.some(line => region.containsLine(line));
	let toToggle = foldingModel.getRegionsInside(null, filter);
	foldingModel.toggleCollapseState(toToggle);
}