/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { findFirstInSorted } from 'vs/base/common/arrays';

import { Emitter, Event } from 'vs/base/common/event';
import { IDisposable } from 'vs/base/common/lifecycle';
import { IRange, Range } from 'vs/editor/common/core/range';
import { Selection } from 'vs/editor/common/core/selection';
import { IModelContentChangedEvent } from 'vs/editor/common/textModelEvents';
import { countEOL } from 'vs/editor/common/core/eolCounter';
import { FoldingModel } from 'vs/editor/contrib/folding/browser/foldingModel';

export class HiddenRangeModel {

	private readonly _foldingModel: FoldingModel;
	private _hiddenRanges: IRange[];
	private _foldingModelListener: IDisposable | null;
	private readonly _updateEventEmitter = new Emitter<IRange[]>();
	private _hasLineChanges: boolean = false;

	public get onDidChange(): Event<IRange[]> { return this._updateEventEmitter.event; }
	public get hiddenRanges() { return this._hiddenRanges; }

	public constructor(model: FoldingModel) {
		this._foldingModel = model;
		this._foldingModelListener = model.onDidChange(_ => this.updateHiddenRanges());
		this._hiddenRanges = [];
		if (model.regions.length) {
			this.updateHiddenRanges();
		}
	}

	public notifyChangeModelContent(e: IModelContentChangedEvent) {
		if (this._hiddenRanges.length && !this._hasLineChanges) {
			this._hasLineChanges = e.changes.some(change => {
				return change.range.endLineNumber !== change.range.startLineNumber || countEOL(change.text)[0] !== 0;
			});
		}
	}

	private updateHiddenRanges(): void {
		let updateHiddenAreas = false;
		const newHiddenAreas: IRange[] = [];
		let i = 0; // index into hidden
		let k = 0;

		let lastCollapsedStart = Number.MAX_VALUE;
		let lastCollapsedEnd = -1;

		const ranges = this._foldingModel.regions;
		for (; i < ranges.length; i++) {
			if (!ranges.isCollapsed(i)) {
				continue;
			}

			const startLineNumber = ranges.getStartLineNumber(i) + 1; // the first line is not hidden
			const endLineNumber = ranges.getEndLineNumber(i);
			const startColumn = ranges.getStartColumn(i);
			if (lastCollapsedStart <= startLineNumber && endLineNumber <= lastCollapsedEnd) {
				// ignore ranges contained in collapsed regions
				continue;
			}

			if (!updateHiddenAreas && k < this._hiddenRanges.length && this._hiddenRanges[k].startLineNumber === startLineNumber && this._hiddenRanges[k].endLineNumber === endLineNumber && this._hiddenRanges[k].startColumn === startColumn) {
				// reuse the old ranges
				newHiddenAreas.push(this._hiddenRanges[k]);
				k++;
			} else {
				updateHiddenAreas = true;
				newHiddenAreas.push(new Range(startLineNumber, startColumn ?? 1, endLineNumber, 1));
			}
			lastCollapsedStart = startLineNumber;
			lastCollapsedEnd = endLineNumber;
		}
		if (this._hasLineChanges || updateHiddenAreas || k < this._hiddenRanges.length) {
			this.applyHiddenRanges(newHiddenAreas);
		}
	}

	private applyHiddenRanges(newHiddenAreas: IRange[]) {
		this._hiddenRanges = newHiddenAreas;
		this._hasLineChanges = false;
		this._updateEventEmitter.fire(newHiddenAreas);
	}

	public hasRanges() {
		return this._hiddenRanges.length > 0;
	}

	public isHidden(line: number, column?: number): boolean {
		return this.findContainingHiddenRange(line, column) !== null;
	}

	public adjustSelections(selections: Selection[]): boolean {
		let hasChanges = false;
		for (let i = 0, len = selections.length; i < len; i++) {
			let selection = selections[i];
			let containingRange = this.findContainingHiddenRange(selection.startLineNumber, selection.startColumn);
			if (containingRange) {
				const adjustedStartLine = containingRange.startLineNumber - 1;
				selection = selection.setStartPosition(adjustedStartLine, containingRange.startColumn);
				hasChanges = true;
			}
			containingRange = this.findContainingHiddenRange(selection.endLineNumber, selection.endColumn);
			if (containingRange) {
				const adjustedEndLine = containingRange.startLineNumber - 1;
				selection = selection.setEndPosition(adjustedEndLine, containingRange.startColumn);
				hasChanges = true;
			}
			selections[i] = selection;
		}
		return hasChanges;
	}

	private findContainingHiddenRange(line: number, column?: number): IRange | null {
		const closestRange = findRange(this._hiddenRanges, line);
		return closestRange && isInside(line, column, closestRange) ? closestRange : null;
	}

	public dispose() {
		if (this.hiddenRanges.length > 0) {
			this._hiddenRanges = [];
			this._updateEventEmitter.fire(this._hiddenRanges);
		}
		if (this._foldingModelListener) {
			this._foldingModelListener.dispose();
			this._foldingModelListener = null;
		}
	}
}

function isInside(line: number, column: number | undefined, range: IRange) {
	if (column !== undefined) {
		if ((line === range.startLineNumber - 1) && column > range.startColumn) {
			return true;
		}
		if (line === range.endLineNumber && column < range.endColumn) {
			return true;
		}
	}
	return line >= range.startLineNumber && line <= range.endLineNumber;
}

function findRange(ranges: IRange[], line: number): IRange | null {
	//startLineNumber - 1 to include hidden ranges' starting line as well.
	const i = findFirstInSorted(ranges, r => line < r.startLineNumber - 1) - 1;
	if (i >= 0 && ranges[i].endLineNumber >= line) {
		return ranges[i];
	}
	return null;
}
