/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, DisposableStore } from 'vs/base/common/lifecycle';
import { NotebookViewModel, CellViewModel } from 'vs/workbench/contrib/notebook/browser/viewModel/notebookViewModel';
import { FoldingRegions } from 'vs/editor/contrib/folding/foldingRanges';
import { IFoldingRangeData, sanitizeRanges } from 'vs/editor/contrib/folding/syntaxRangeProvider';
import { CellKind } from 'vs/workbench/contrib/notebook/common/notebookCommon';
import { Event } from 'vs/base/common/event';

export class FoldingModel extends Disposable {
	private _viewModel: NotebookViewModel | null = null;
	private _viewModelStore = new DisposableStore();
	private _regions: FoldingRegions;
	get regions() {
		return this._regions;
	}

	constructor(
		// private readonly _notebookEditor: INotebookEditor
	) {
		super();
		this._regions = new FoldingRegions(new Uint32Array(0), new Uint32Array(0));
	}

	detachViewModel() {
		this._viewModelStore.clear();
		this._viewModel = null;
	}

	attachViewModel(model: NotebookViewModel) {
		this._viewModel = model;

		this._viewModelStore.add(this._viewModel.onDidChangeViewCells(() => {
			this.recompute();
		}));

		this.recompute();
	}

	recompute() {
		const cells = this._viewModel!.viewCells;
		let stack: { index: number, level: number, endIndex: number }[] = [];

		for (let i = 0; i < cells.length; i++) {
			const cell = cells[i];

			if (cell.cellKind === CellKind.Code) {
				continue;
			}

			const content = cell.getText();

			const matches = content.match(/^[ \t]*(\#+)/gm);

			let min = 7;
			if (matches && matches.length) {
				for (let j = 0; j < matches.length; j++) {
					min = Math.min(min, matches[j].length);
				}
			}

			if (min < 7) {
				// header 1 to 6
				stack.push({ index: i, level: min, endIndex: 0 });
			}
		}

		// calcualte folding ranges
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
		});

		this._regions = sanitizeRanges(rawFoldingRanges, 5000);
	}
}

export enum CellFoldingState {
	None,
	Expanded,
	Collapsed
}

export interface FoldingRegionDelegate {
	onDidFoldingRegionChanged: Event<void>;
	getFoldingStartIndex(cell: CellViewModel): number;
	getFoldingState(cell: CellViewModel): CellFoldingState;
}
