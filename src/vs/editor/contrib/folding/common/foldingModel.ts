/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as editorCommon from 'vs/editor/common/editorCommon';
import { Range } from 'vs/editor/common/core/range';

export interface IFoldingRange {
	startLineNumber: number;
	endLineNumber: number;
	indent: number;
	isCollapsed?: boolean;
}

export function toString(range: IFoldingRange): string {
	return (range ? range.startLineNumber + '/' + range.endLineNumber : 'null') + (range.isCollapsed ? ' (collapsed)' : '') + ' - ' + range.indent;
}

export class CollapsibleRegion {

	private decorationIds: string[];
	private _isCollapsed: boolean;
	private _indent: number;

	private _lastRange: IFoldingRange;

	public constructor(range: IFoldingRange, model: editorCommon.IModel, changeAccessor: editorCommon.IModelDecorationsChangeAccessor) {
		this.decorationIds = [];
		this.update(range, model, changeAccessor);
	}

	public get isCollapsed(): boolean {
		return this._isCollapsed;
	}

	public get isExpanded(): boolean {
		return !this._isCollapsed;
	}

	public get indent(): number {
		return this._indent;
	}

	public get foldingRange(): IFoldingRange {
		return this._lastRange;
	}

	public get startLineNumber(): number {
		return this._lastRange ? this._lastRange.startLineNumber : void 0;
	}

	public get endLineNumber(): number {
		return this._lastRange ? this._lastRange.endLineNumber : void 0;
	}

	public setCollapsed(isCollaped: boolean, changeAccessor: editorCommon.IModelDecorationsChangeAccessor): void {
		this._isCollapsed = isCollaped;
		if (this.decorationIds.length > 0) {
			changeAccessor.changeDecorationOptions(this.decorationIds[0], this.getVisualDecorationOptions());
		}
	}

	public getDecorationRange(model: editorCommon.IModel): Range {
		if (this.decorationIds.length > 0) {
			return model.getDecorationRange(this.decorationIds[1]);
		}
		return null;
	}

	private getVisualDecorationOptions(): editorCommon.IModelDecorationOptions {
		if (this._isCollapsed) {
			return {
				stickiness: editorCommon.TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges,
				afterContentClassName: 'inline-folded',
				linesDecorationsClassName: 'folding collapsed'
			};
		} else {
			return {
				stickiness: editorCommon.TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges,
				linesDecorationsClassName: 'folding'
			};
		}
	}

	private getRangeDecorationOptions(): editorCommon.IModelDecorationOptions {
		return {
			stickiness: editorCommon.TrackedRangeStickiness.GrowsOnlyWhenTypingBefore
		};
	}

	public update(newRange: IFoldingRange, model: editorCommon.IModel, changeAccessor: editorCommon.IModelDecorationsChangeAccessor): void {
		this._lastRange = newRange;
		this._isCollapsed = !!newRange.isCollapsed;
		this._indent = newRange.indent;

		let newDecorations: editorCommon.IModelDeltaDecoration[] = [];

		let maxColumn = model.getLineMaxColumn(newRange.startLineNumber);
		let visualRng = {
			startLineNumber: newRange.startLineNumber,
			startColumn: maxColumn - 1,
			endLineNumber: newRange.startLineNumber,
			endColumn: maxColumn
		};
		newDecorations.push({ range: visualRng, options: this.getVisualDecorationOptions() });

		let colRng = {
			startLineNumber: newRange.startLineNumber,
			startColumn: 1,
			endLineNumber: newRange.endLineNumber,
			endColumn: model.getLineMaxColumn(newRange.endLineNumber)
		};
		newDecorations.push({ range: colRng, options: this.getRangeDecorationOptions() });

		this.decorationIds = changeAccessor.deltaDecorations(this.decorationIds, newDecorations);
	}


	public dispose(changeAccessor: editorCommon.IModelDecorationsChangeAccessor): void {
		this._lastRange = null;
		this.decorationIds = changeAccessor.deltaDecorations(this.decorationIds, []);
	}

	public toString(): string {
		let str = this.isCollapsed ? 'collapsed ' : 'expanded ';
		if (this._lastRange) {
			str += (this._lastRange.startLineNumber + '/' + this._lastRange.endLineNumber);
		} else {
			str += 'no range';
		}

		return str;
	}
}

export function getCollapsibleRegionsToFoldAtLine(allRegions: CollapsibleRegion[], model: editorCommon.IModel, lineNumber: number, levels: number, up: boolean): CollapsibleRegion[] {
	let surroundingRegion: CollapsibleRegion = getCollapsibleRegionAtLine(allRegions, model, lineNumber);
	if (!surroundingRegion) {
		return [];
	}
	if (levels === 1) {
		return [surroundingRegion];
	}
	let result = getCollapsibleRegionsFor(surroundingRegion, allRegions, model, levels, up);
	return result.filter(collapsibleRegion => !collapsibleRegion.isCollapsed);
}

export function getCollapsibleRegionsToUnfoldAtLine(allRegions: CollapsibleRegion[], model: editorCommon.IModel, lineNumber: number, levels: number): CollapsibleRegion[] {
	let surroundingRegion: CollapsibleRegion = getCollapsibleRegionAtLine(allRegions, model, lineNumber);
	if (!surroundingRegion) {
		return [];
	}
	if (levels === 1) {
		let regionToUnfold = surroundingRegion.isCollapsed ? surroundingRegion : getFoldedCollapsibleRegionAfterLine(allRegions, model, surroundingRegion, lineNumber);
		return regionToUnfold ? [regionToUnfold] : [];
	}
	let result = getCollapsibleRegionsFor(surroundingRegion, allRegions, model, levels, false);
	return result.filter(collapsibleRegion => collapsibleRegion.isCollapsed);
}

function getCollapsibleRegionAtLine(allRegions: CollapsibleRegion[], model: editorCommon.IModel, lineNumber: number): CollapsibleRegion {
	let collapsibleRegion: CollapsibleRegion = null;
	for (let i = 0, len = allRegions.length; i < len; i++) {
		let dec = allRegions[i];
		let decRange = dec.getDecorationRange(model);
		if (decRange) {
			if (doesLineBelongsToCollapsibleRegion(decRange, lineNumber)) {
				collapsibleRegion = dec;
			}
			if (doesCollapsibleRegionIsAfterLine(decRange, lineNumber)) {
				break;
			}
		}
	}
	return collapsibleRegion;
}

function getFoldedCollapsibleRegionAfterLine(allRegions: CollapsibleRegion[], model: editorCommon.IModel, surroundingRegion: CollapsibleRegion, lineNumber: number): CollapsibleRegion {
	let index = allRegions.indexOf(surroundingRegion);
	for (let i = index + 1; i < allRegions.length; i++) {
		let dec = allRegions[i];
		let decRange = dec.getDecorationRange(model);
		if (decRange) {
			if (doesCollapsibleRegionIsAfterLine(decRange, lineNumber)) {
				if (!doesCollapsibleRegionContains(surroundingRegion.foldingRange, decRange)) {
					return null;
				}
				if (dec.isCollapsed) {
					return dec;
				}
			}
		}
	}
	return null;
}

export function doesLineBelongsToCollapsibleRegion(range: IFoldingRange | Range, lineNumber: number): boolean {
	return lineNumber >= range.startLineNumber && lineNumber <= range.endLineNumber;
}

function doesCollapsibleRegionIsAfterLine(range: IFoldingRange | Range, lineNumber: number): boolean {
	return lineNumber < range.startLineNumber;
}
function doesCollapsibleRegionIsBeforeLine(range: IFoldingRange | Range, lineNumber: number): boolean {
	return lineNumber > range.endLineNumber;
}

function doesCollapsibleRegionContains(range1: IFoldingRange | Range, range2: IFoldingRange | Range): boolean {
	if (range1 instanceof Range && range2 instanceof Range) {
		return range1.containsRange(range2);
	}
	return range1.startLineNumber <= range2.startLineNumber && range1.endLineNumber >= range2.endLineNumber;
}

function getCollapsibleRegionsFor(surroundingRegion: CollapsibleRegion, allRegions: CollapsibleRegion[], model: editorCommon.IModel, levels: number, up: boolean): CollapsibleRegion[] {
	let collapsibleRegionsHierarchy: CollapsibleRegionsHierarchy = up ? new CollapsibleRegionsParentHierarchy(surroundingRegion, allRegions, model) : new CollapsibleRegionsChildrenHierarchy(surroundingRegion, allRegions, model);
	return collapsibleRegionsHierarchy.getRegionsTill(levels);
}

interface CollapsibleRegionsHierarchy {
	getRegionsTill(level: number): CollapsibleRegion[];
}

class CollapsibleRegionsChildrenHierarchy implements CollapsibleRegionsHierarchy {

	children: CollapsibleRegionsChildrenHierarchy[] = [];
	lastChildIndex: number;

	constructor(private region: CollapsibleRegion, allRegions: CollapsibleRegion[], model: editorCommon.IModel) {
		for (let index = allRegions.indexOf(region) + 1; index < allRegions.length; index++) {
			let dec = allRegions[index];
			let decRange = dec.getDecorationRange(model);
			if (decRange) {
				if (doesCollapsibleRegionContains(region.foldingRange, decRange)) {
					index = this.processChildRegion(dec, allRegions, model, index);
				}
				if (doesCollapsibleRegionIsAfterLine(decRange, region.foldingRange.endLineNumber)) {
					break;
				}
			}
		}
	}

	private processChildRegion(dec: CollapsibleRegion, allRegions: CollapsibleRegion[], model: editorCommon.IModel, index: number): number {
		let childRegion = new CollapsibleRegionsChildrenHierarchy(dec, allRegions, model);
		this.children.push(childRegion);
		this.lastChildIndex = index;
		return childRegion.children.length > 0 ? childRegion.lastChildIndex : index;
	}

	public getRegionsTill(level: number): CollapsibleRegion[] {
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

	constructor(private region: CollapsibleRegion, allRegions: CollapsibleRegion[], model: editorCommon.IModel) {
		for (let index = allRegions.indexOf(region) - 1; index >= 0; index--) {
			let dec = allRegions[index];
			let decRange = dec.getDecorationRange(model);
			if (decRange) {
				if (doesCollapsibleRegionContains(decRange, region.foldingRange)) {
					this.parent = new CollapsibleRegionsParentHierarchy(dec, allRegions, model);
					break;
				}
				if (doesCollapsibleRegionIsBeforeLine(decRange, region.foldingRange.endLineNumber)) {
					break;
				}
			}
		}
	}

	public getRegionsTill(level: number): CollapsibleRegion[] {
		let result = [this.region];
		if (this.parent && level > 1) {
			result = result.concat(this.parent.getRegionsTill(level - 1));
		}
		return result;
	}
}