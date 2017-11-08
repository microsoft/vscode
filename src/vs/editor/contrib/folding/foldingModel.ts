/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IModel, IModelDecorationOptions } from 'vs/editor/common/editorCommon';
import Event, { Emitter } from 'vs/base/common/event';
import { FoldingRanges, ILineRange } from './foldingRanges';

export interface IDecorationProvider {
	getDecorationOption(region: FoldingRegion): IModelDecorationOptions;
}

export interface FoldingModelChangeEvent {
	model: FoldingModel;
	collapseStateChanged?: FoldingRegion[];
}

export type CollapseMemento = ILineRange[];

export class FoldingModel {
	private _textModel: IModel;
	private _decorationProvider: IDecorationProvider;

	private _regions: FoldingRegion[] = [];
	private _ranges: FoldingRanges;

	private _updateEventEmitter = new Emitter<FoldingModelChangeEvent>();

	public get regions(): FoldingRegion[] { return this._regions; }
	public get onDidChange(): Event<FoldingModelChangeEvent> { return this._updateEventEmitter.event; }
	public get textModel() { return this._textModel; }

	constructor(textModel: IModel, decorationProvider: IDecorationProvider) {
		this._textModel = textModel;
		this._decorationProvider = decorationProvider;
	}

	public toggleCollapseState(regions: FoldingRegion[]) {
		if (!regions.length) {
			return;
		}
		let processed = {};
		this._textModel.changeDecorations(accessor => {
			for (let region of regions) {
				if (region.editorDecorationId && !processed[region.editorDecorationId]) {
					processed[region.editorDecorationId] = true;
					region.isCollapsed = !region.isCollapsed;
					accessor.changeDecorationOptions(region.editorDecorationId, this._decorationProvider.getDecorationOption(region));
				}
			}
		});
		this._updateEventEmitter.fire({ model: this, collapseStateChanged: regions });
	}

	public update(newRanges: FoldingRanges): void {
		let editorDecorationIds = [];
		let newEditorDecorations = [];

		// remember the latest start line numbers of the collapsed regions
		let collapsedStartLineNumbers: number[] = [];
		for (let region of this._regions) {
			if (region.editorDecorationId) {
				if (region.isCollapsed) {
					let decRange = this._textModel.getDecorationRange(region.editorDecorationId);
					if (decRange) {
						collapsedStartLineNumbers.push(decRange.startLineNumber);
					}
				}
				editorDecorationIds.push(region.editorDecorationId);
			}
		}

		let recycleBin = this._regions;
		let newRegions = [];

		let newRegion = (ranges: FoldingRanges, index: number, isCollapsed: boolean) => {
			let region = recycleBin.length ? recycleBin.pop() : new FoldingRegion();
			region.init(ranges, index, isCollapsed);
			newRegions.push(region);

			let startLineNumber = region.startLineNumber;
			let maxColumn = this._textModel.getLineMaxColumn(startLineNumber);
			let decorationRange = {
				startLineNumber: startLineNumber,
				startColumn: maxColumn,
				endLineNumber: startLineNumber,
				endColumn: maxColumn
			};
			newEditorDecorations.push({ range: decorationRange, options: this._decorationProvider.getDecorationOption(region) });
		};

		let k = 0, i = 0;
		while (i < collapsedStartLineNumbers.length && k < newRanges.length) {
			let collapsedStartLineNumber = collapsedStartLineNumbers[i];
			while (k < newRanges.length && collapsedStartLineNumber > newRanges.getStartLineNumber(k)) {
				newRegion(newRanges, k, false);
				k++;
			}
			if (k < newRanges.length) {
				let currStartLineNumber = newRanges.getStartLineNumber(k);
				if (collapsedStartLineNumber < currStartLineNumber) {
					i++;
				} else if (collapsedStartLineNumber === currStartLineNumber) {
					newRegion(newRanges, k, true);
					i++;
					k++;
				}
			}
		}
		while (k < newRanges.length) {
			newRegion(newRanges, k, false);
			k++;
		}

		let newEditorDecorationIds = this._textModel.deltaDecorations(editorDecorationIds, newEditorDecorations);
		for (let i = 0; i < newEditorDecorations.length; i++) {
			newRegions[i].editorDecorationId = newEditorDecorationIds[i];
		}

		this._regions = newRegions;
		this._ranges = newRanges;
		this._updateEventEmitter.fire({ model: this });
	}

	/**
	 * Collapse state memento, for persistence only
	 */
	public getMemento(): CollapseMemento {
		let collapsedRanges: ILineRange[] = [];
		for (let region of this._regions) {
			if (region.isCollapsed && region.editorDecorationId) {
				let range = this._textModel.getDecorationRange(region.editorDecorationId);
				if (range) {
					let startLineNumber = range.startLineNumber;
					let endLineNumber = range.endLineNumber + region.endLineNumber - region.startLineNumber;
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
		let editorDecorationIds = [];
		for (let region of this._regions) {
			if (region.editorDecorationId) {
				editorDecorationIds.push(region.editorDecorationId);
			}
		}
		this._textModel.deltaDecorations(editorDecorationIds, []);
	}

	getAllRegionsAtLine(lineNumber: number, filter?: (r: FoldingRegion, level: number) => boolean): FoldingRegion[] {
		let result: FoldingRegion[] = [];
		if (this._ranges) {
			let index = this._ranges.findRange(lineNumber);
			let level = 1;
			while (index >= 0) {
				let current = this._regions[index];
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
				return this._regions[index];
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
			let current = this.regions[i];
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

	public editorDecorationId: string;
	public isCollapsed: boolean;
	private index: number;
	private indentRanges: FoldingRanges;

	constructor() {
	}

	public init(indentRanges: FoldingRanges, index: number, isCollapsed: boolean): void {
		this.indentRanges = indentRanges;
		this.index = index;
		this.isCollapsed = isCollapsed;
		this.editorDecorationId = void 0;
	}

	public get startLineNumber() {
		return this.indentRanges.getStartLineNumber(this.index);
	}

	public get endLineNumber() {
		return this.indentRanges.getEndLineNumber(this.index);
	}

	public get regionIndex() {
		return this.index;
	}

	public get parentIndex() {
		return this.indentRanges.getParentIndex(this.index);
	}

	isAfterLine(lineNumber: number): boolean {
		return lineNumber < this.startLineNumber;
	}
	isBeforeLine(lineNumber: number): boolean {
		return lineNumber > this.endLineNumber;
	}
	contains(range: ILineRange): boolean {
		return this.startLineNumber <= range.startLineNumber && this.endLineNumber >= range.endLineNumber;
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
	let filter = (region, level) => level === foldLevel && region.isCollapsed !== doCollapse && !blockedLineNumbers.some(line => region.containsLine(line));
	let toToggle = foldingModel.getRegionsInside(null, filter);
	foldingModel.toggleCollapseState(toToggle);
}