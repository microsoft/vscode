/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IModel, IModelDecorationOptions } from 'vs/editor/common/editorCommon';
import Event, { Emitter } from 'vs/base/common/event';

export interface IFoldingRange extends ILineRange {
	indent: number;
}

export interface ILineRange {
	startLineNumber: number;
	endLineNumber: number;
}

export function toString(range: IFoldingRange): string {
	return (range ? range.startLineNumber + '/' + range.endLineNumber : 'null') + ' - ' + range.indent;
}

export interface IFoldingRangeProvider {
	getFoldingRanges(textModel: IModel): Thenable<IFoldingRange[]>;
}

export interface IDecorationProvider {
	getDecorationOption(region: FoldingRegion): IModelDecorationOptions;
}

export interface FoldingModelChangeEvent {
	model: FoldingModel;
	collapseStateChanged?: FoldingRegion[];
}

export class FoldingModel {
	private _textModel: IModel;
	private _decorationProvider: IDecorationProvider;

	private _regions: FoldingRegion[] = [];
	private _updateEventEmitter = new Emitter<FoldingModelChangeEvent>();

	public get regions(): FoldingRegion[] { return this._regions; };
	public get onDidChange(): Event<FoldingModelChangeEvent> { return this._updateEventEmitter.event; };
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
				if (!processed[region.editorDecorationId]) {
					processed[region.editorDecorationId] = true;
					region.isCollapsed = !region.isCollapsed;
					accessor.changeDecorationOptions(region.editorDecorationId, this._decorationProvider.getDecorationOption(region));
				}
			}
		});
		this._updateEventEmitter.fire({ model: this, collapseStateChanged: regions });
	}

	public update(newRanges: IFoldingRange[]): void {
		let editorDecorationIds = [];
		let newEditorDecorations = [];

		// remember the latest start line numbers of the collapsed regions
		let collapsedStartLineNumbers: number[] = [];
		for (let region of this._regions) {
			if (region.isCollapsed) {
				let decRange = this._textModel.getDecorationRange(region.editorDecorationId);
				if (decRange) {
					collapsedStartLineNumbers.push(decRange.startLineNumber);
				}
			}
			if (region.editorDecorationId) {
				editorDecorationIds.push(region.editorDecorationId);
			}
		}

		let recycleBin = this._regions;
		let newRegions = [];

		let newRegion = (range: IFoldingRange, isCollapsed: boolean) => {
			let region = recycleBin.length ? recycleBin.pop() : new FoldingRegion();
			region.init(range, isCollapsed);
			newRegions.push(region);

			let startLineNumber = range.startLineNumber;
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
			while (k < newRanges.length && collapsedStartLineNumber > newRanges[k].startLineNumber) {
				newRegion(newRanges[k], false);
				k++;
			}
			if (k < newRanges.length) {
				let currRange = newRanges[k];
				if (collapsedStartLineNumber < currRange.startLineNumber) {
					i++;
				} else if (collapsedStartLineNumber === currRange.startLineNumber) {
					newRegion(newRanges[k], true);
					i++;
					k++;
				}
			}
		}
		while (k < newRanges.length) {
			newRegion(newRanges[k], false);
			k++;
		}

		let newEditorDecorationIds = this._textModel.deltaDecorations(editorDecorationIds, newEditorDecorations);
		for (let i = 0; i < newEditorDecorations.length; i++) {
			newRegions[i].editorDecorationId = newEditorDecorationIds[i];
		}

		this._regions = newRegions;
		this._updateEventEmitter.fire({ model: this });
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

	getAllRegionsAtLine(lineNumber: number, filter?: (r: FoldingRegion) => boolean): FoldingRegion[] {
		let result: FoldingRegion[] = [];
		for (let i = 0, len = this.regions.length; i < len; i++) {
			let current = this.regions[i];
			if (current.range.endLineNumber < lineNumber) {
				continue;
			}
			let startLineNumber = current.range.startLineNumber;
			if (startLineNumber <= lineNumber) {
				if (!filter || filter(current)) {
					result.push(current);
				}
			} else {
				break;
			}
		}
		return result;
	}


	getRegionAtLine(lineNumber: number): FoldingRegion {
		let result: FoldingRegion;
		for (let i = 0, len = this.regions.length; i < len; i++) {
			let current = this.regions[i];
			if (current.range.endLineNumber < lineNumber) {
				continue;
			}
			let startLineNumber = current.range.startLineNumber;
			if (startLineNumber <= lineNumber) {
				result = current;
			} else {
				break;
			}
		}
		return result;
	}

	getRegionsInside(range: ILineRange, filter?: (r: FoldingRegion, level?: number) => boolean): FoldingRegion[] {
		let result = [];
		let trackLevel = filter && filter.length === 2;
		let levelStack: ILineRange[] = trackLevel ? [range] : null;;

		for (let i = 0, len = this.regions.length; i < len; i++) {
			let current = this.regions[i];
			let endLineNumber = current.range.endLineNumber;
			if (endLineNumber <= range.startLineNumber) {
				continue;
			}
			let startLineNumber = current.range.startLineNumber;
			if (startLineNumber < range.endLineNumber) {
				if (endLineNumber <= range.endLineNumber && startLineNumber >= range.startLineNumber) {
					if (trackLevel) {
						while (!current.containedBy(levelStack[levelStack.length - 1])) {
							levelStack.pop();
						}
						levelStack.push(current.range);
						if (filter(current, levelStack.length - 1)) {
							result.push(current);
						}
					} else if (!filter || filter(current)) {
						result.push(current);
					}
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
	public range: IFoldingRange;

	constructor() {
	}

	public init(range: IFoldingRange, isCollapsed: boolean): void {
		this.range = range;
		this.isCollapsed = isCollapsed;
		this.editorDecorationId = void 0;
	}
	isAfterLine(lineNumber: number): boolean {
		return lineNumber < this.range.startLineNumber;
	}
	isBeforeLine(lineNumber: number): boolean {
		return lineNumber > this.range.endLineNumber;
	}
	contains(range: ILineRange): boolean {
		return this.range.startLineNumber <= range.startLineNumber && this.range.endLineNumber >= range.endLineNumber;
	}
	containedBy(range: ILineRange): boolean {
		return range.startLineNumber <= this.range.startLineNumber && range.endLineNumber >= this.range.endLineNumber;
	}
	containsLine(lineNumber: number) {
		return this.range.startLineNumber <= lineNumber && lineNumber <= this.range.endLineNumber;
	}
	hidesLine(lineNumber: number) {
		return this.range.startLineNumber < lineNumber && lineNumber <= this.range.endLineNumber;
	}
}

export function unfold(foldingModel: FoldingModel, levels: number, lineNumbers: number[]): void {
	let toToggle = [];
	for (let lineNumber of lineNumbers) {
		let regionsAtLine = getCollapsibleRegionsToUnfoldAtLine(foldingModel, lineNumber, levels);
		if (regionsAtLine.length > 0) {
			for (let region of regionsAtLine) {
				if (region.isCollapsed) {
					toToggle.push(region);
				}
			}
		}
	};
	foldingModel.toggleCollapseState(toToggle);
}

export function fold(foldingModel: FoldingModel, levels: number, up: boolean, lineNumbers: number[]): void {
	let toToggle = [];
	for (let lineNumber of lineNumbers) {
		let regionsAtLine = getCollapsibleRegionsToFoldAtLine(foldingModel, lineNumber, levels, up);
		for (let region of regionsAtLine) {
			if (region.isCollapsed) {
				toToggle.push(region);
			}
		}
	}
	foldingModel.toggleCollapseState(toToggle);
}

/**
 * Collapse or expand the regions at the given locations including all children.
 * @param doCollapse Wheter to collase or expand
 * @param lineNumbers the regions to fold, or if not set all regions in the model.
 */
export function setCollapseStateRecursivly(foldingModel: FoldingModel, doCollapse: boolean, lineNumbers?: number[]): void {
	let toToggle = [];
	if (!lineNumbers) {
		toToggle = foldingModel.regions.filter(region => region.isCollapsed !== doCollapse);
	} else {
		for (let lineNumber of lineNumbers) {
			let region = foldingModel.getRegionAtLine(lineNumber);
			if (region) {
				let regionsInside = foldingModel.getRegionsInside(region.range, r => r.isCollapsed !== doCollapse);
				toToggle.push(...regionsInside);
			}
		}
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
	let toToggle = foldingModel.getRegionsInside({ startLineNumber: 1, endLineNumber: Number.MAX_VALUE }, filter);
	foldingModel.toggleCollapseState(toToggle);
}



// old

export function getCollapsibleRegionsToFoldAtLine(model: FoldingModel, lineNumber: number, levels: number, up: boolean): FoldingRegion[] {
	let surroundingRegion: FoldingRegion = model.getRegionAtLine(lineNumber);
	if (!surroundingRegion) {
		return [];
	}
	if (levels === 1) {
		return [surroundingRegion];
	}
	let result = getCollapsibleRegionsFor(model, surroundingRegion, levels, up);
	return result.filter(collapsibleRegion => !collapsibleRegion.isCollapsed);
}

export function getCollapsibleRegionsToUnfoldAtLine(model: FoldingModel, lineNumber: number, levels: number): FoldingRegion[] {
	let surroundingRegion: FoldingRegion = model.getRegionAtLine(lineNumber);
	if (!surroundingRegion) {
		return [];
	}
	if (levels === 1) {
		let regionToUnfold = surroundingRegion.isCollapsed ? surroundingRegion : getFoldedCollapsibleRegionAfterLine(model, surroundingRegion, lineNumber);
		return regionToUnfold ? [regionToUnfold] : [];
	}
	let result = getCollapsibleRegionsFor(model, surroundingRegion, levels, false);
	return result.filter(collapsibleRegion => collapsibleRegion.isCollapsed);
}


function getFoldedCollapsibleRegionAfterLine(model: FoldingModel, surroundingRegion: FoldingRegion, lineNumber: number): FoldingRegion {
	let allRegions = model.regions;
	let index = allRegions.indexOf(surroundingRegion);
	for (let i = index + 1; i < allRegions.length; i++) {
		let region = allRegions[i];
		if (region.isAfterLine(lineNumber)) {
			if (!surroundingRegion.contains(region.range)) {
				return null;
			}
			if (region.isCollapsed) {
				return region;
			}
		}
	}
	return null;
}

function getCollapsibleRegionsFor(model: FoldingModel, surroundingRegion: FoldingRegion, levels: number, up: boolean): FoldingRegion[] {
	let collapsibleRegionsHierarchy: CollapsibleRegionsHierarchy = up ? new CollapsibleRegionsParentHierarchy(model, surroundingRegion) : new CollapsibleRegionsChildrenHierarchy(model, surroundingRegion);
	return collapsibleRegionsHierarchy.getRegionsTill(levels);
}

interface CollapsibleRegionsHierarchy {
	getRegionsTill(level: number): FoldingRegion[];
}

class CollapsibleRegionsChildrenHierarchy implements CollapsibleRegionsHierarchy {

	children: CollapsibleRegionsChildrenHierarchy[] = [];
	lastChildIndex: number;

	constructor(model: FoldingModel, private region: FoldingRegion) {
		let allRegions = model.regions;
		for (let index = allRegions.indexOf(region) + 1; index < allRegions.length; index++) {
			let curr = allRegions[index];
			if (curr.contains(region.range)) {
				index = this.processChildRegion(model, curr, index);
			}
			if (curr.isAfterLine(region.range.endLineNumber)) {
				break;
			}
		}
	}

	private processChildRegion(model: FoldingModel, dec: FoldingRegion, index: number): number {
		let childRegion = new CollapsibleRegionsChildrenHierarchy(model, dec);
		this.children.push(childRegion);
		this.lastChildIndex = index;
		return childRegion.children.length > 0 ? childRegion.lastChildIndex : index;
	}

	public getRegionsTill(level: number): FoldingRegion[] {
		let result = [this.region];
		if (level > 1) {
			this.children.forEach(region => result = result.concat(region.getRegionsTill(level - 1)));
		}
		return result;
	}
}
class CollapsibleRegionsParentHierarchy implements CollapsibleRegionsHierarchy {

	parent: CollapsibleRegionsParentHierarchy;
	lastChildIndex: number;

	constructor(model: FoldingModel, private region: FoldingRegion) {
		let allRegions = model.regions;
		for (let index = allRegions.indexOf(region) - 1; index >= 0; index--) {
			let curr = allRegions[index];
			if (curr.contains(region.range)) {
				this.parent = new CollapsibleRegionsParentHierarchy(model, curr);
				break;
			}
			if (curr.isBeforeLine(region.range.endLineNumber)) {
				break;
			}
		}
	}

	public getRegionsTill(level: number): FoldingRegion[] {
		let result = [this.region];
		if (this.parent && level > 1) {
			result = result.concat(this.parent.getRegionsTill(level - 1));
		}
		return result;
	}
}