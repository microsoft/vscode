/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { findFirstIdxMonotonousOrArrLen } from '../../../../base/common/arraysFind.js';

import { Emitter, Event } from '../../../../base/common/event.js';
import { IDisposable } from '../../../../base/common/lifecycle.js';
import { IRange, Range } from '../../../common/core/range.js';
import { Selection } from '../../../common/core/selection.js';
import { IModelContentChangedEvent } from '../../../common/textModelEvents.js';
import { countEOL } from '../../../common/core/misc/eolCounter.js';
import { FoldingModel } from './foldingModel.js';

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
			if (lastCollapsedStart <= startLineNumber && endLineNumber <= lastCollapsedEnd) {
				// ignore ranges contained in collapsed regions
				continue;
			}

			if (!updateHiddenAreas && k < this._hiddenRanges.length && this._hiddenRanges[k].startLineNumber === startLineNumber && this._hiddenRanges[k].endLineNumber === endLineNumber) {
				// reuse the old ranges
				newHiddenAreas.push(this._hiddenRanges[k]);
				k++;
			} else {
				updateHiddenAreas = true;
				newHiddenAreas.push(new Range(startLineNumber, 1, endLineNumber, 1));
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

	public isHidden(line: number): boolean {
		return findRange(this._hiddenRanges, line) !== null;
	}

	public adjustSelections(selections: Selection[]): boolean {
		let hasChanges = false;
		const editorModel = this._foldingModel.textModel;
		let lastRange: IRange | null = null;

		const adjustLine = (line: number) => {
			if (!lastRange || !isInside(line, lastRange)) {
				lastRange = findRange(this._hiddenRanges, line);
			}
			if (lastRange) {
				return lastRange.startLineNumber - 1;
			}
			return null;
		};
		for (let i = 0, len = selections.length; i < len; i++) {
			let selection = selections[i];
			const adjustedStartLine = adjustLine(selection.startLineNumber);
			if (adjustedStartLine) {
				selection = selection.setStartPosition(adjustedStartLine, editorModel.getLineMaxColumn(adjustedStartLine));
				hasChanges = true;
			}
			const adjustedEndLine = adjustLine(selection.endLineNumber);
			if (adjustedEndLine) {
				selection = selection.setEndPosition(adjustedEndLine, editorModel.getLineMaxColumn(adjustedEndLine));
				hasChanges = true;
			}
			selections[i] = selection;
		}
		return hasChanges;
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

function isInside(line: number, range: IRange) {
	return line >= range.startLineNumber && line <= range.endLineNumber;
}
function findRange(ranges: IRange[], line: number): IRange | null {
	const i = findFirstIdxMonotonousOrArrLen(ranges, r => line < r.startLineNumber) - 1;
	if (i >= 0 && ranges[i].endLineNumber >= line) {
		return ranges[i];
	}
	return null;
}
