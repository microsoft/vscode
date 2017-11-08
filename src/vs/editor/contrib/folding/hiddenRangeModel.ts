/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import Event, { Emitter } from 'vs/base/common/event';
import { Range, IRange } from 'vs/editor/common/core/range';
import { FoldingRegion, FoldingModel, CollapseMemento } from 'vs/editor/contrib/folding/foldingModel';
import { IDisposable } from 'vs/base/common/lifecycle';
import { Selection } from 'vs/editor/common/core/selection';
import { findFirst } from 'vs/base/common/arrays';

export class HiddenRangeModel {
	private _foldingModel: FoldingModel;
	private _hiddenRanges: IRange[] = [];
	private _foldingModelListener: IDisposable;
	private _updateEventEmitter = new Emitter<IRange[]>();

	public get onDidChange(): Event<IRange[]> { return this._updateEventEmitter.event; }
	public get hiddenRanges() { return this._hiddenRanges; }

	public constructor(model: FoldingModel) {
		this._foldingModel = model;
		this._foldingModelListener = model.onDidChange(_ => this.updateHiddenRanges());
		if (model.regions.length) {
			this.updateHiddenRanges();
		}
	}

	private updateHiddenRanges(): void {
		let updateHiddenAreas = false;
		let newHiddenAreas: IRange[] = [];
		let i = 0; // index into hidden

		let lastCollapsed: FoldingRegion = null;

		let regions = this._foldingModel.regions;
		for (let region of regions) {
			if (!region.isCollapsed || lastCollapsed && lastCollapsed.contains(region)) {
				// ignore ranges contained in collapsed regions
				continue;
			}
			lastCollapsed = region;
			let range = region;

			if (!updateHiddenAreas && i < this._hiddenRanges.length && matchesHiddenRange(this._hiddenRanges[i], range)) {
				newHiddenAreas.push(this._hiddenRanges[i]);
				i++;
			} else {
				updateHiddenAreas = true;
				newHiddenAreas.push(new Range(range.startLineNumber + 1, 1, range.endLineNumber, 1));
			}
		}
		if (updateHiddenAreas || i < this._hiddenRanges.length) {
			this.applyHiddenRanges(newHiddenAreas);
		}
	}

	public applyMemento(state: CollapseMemento): boolean {
		if (!Array.isArray(state) || state.length === 0) {
			return false;
		}
		let hiddenRanges = [];
		for (let r of state) {
			if (!r.startLineNumber || !r.endLineNumber) {
				return false;
			}
			hiddenRanges.push(new Range(r.startLineNumber + 1, 1, r.endLineNumber, 1));
		}
		this.applyHiddenRanges(hiddenRanges);
		return true;
	}

	private applyHiddenRanges(newHiddenAreas: IRange[]) {
		this._hiddenRanges = newHiddenAreas;
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
		let editorModel = this._foldingModel.textModel;
		let lastRange = null;

		let adjustLine = (line: number) => {
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
			let adjustedStartLine = adjustLine(selection.startLineNumber);
			if (adjustedStartLine) {
				selection = selection.setStartPosition(adjustedStartLine, editorModel.getLineMaxColumn(adjustedStartLine));
				hasChanges = true;
			}
			let adjustedEndLine = adjustLine(selection.endLineNumber);
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

function matchesHiddenRange(hr: IRange, range: FoldingRegion) {
	return hr.startLineNumber === range.startLineNumber + 1 && hr.endLineNumber === range.endLineNumber;
}
function isInside(line: number, range: IRange) {
	return line >= range.startLineNumber && line <= range.endLineNumber;
}
function findRange(ranges: IRange[], line: number): IRange {
	let i = findFirst(ranges, r => line < r.startLineNumber) - 1;
	if (i >= 0 && ranges[i].endLineNumber >= line) {
		return ranges[i];
	}
	return null;
}