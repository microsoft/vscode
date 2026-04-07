/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CellViewModel } from 'vs/workbench/contrib/notebook/browser/viewModel/notebookViewModelImpl';
import { ICellRange } from 'vs/workbench/contrib/notebook/common/notebookRange';

const enum CellEditorRevealType {
	Line,
	Range
}

const enum CellRevealPosition {
	Top,
	Center,
	Bottom,
	NearTop
}

function getVisibleCells(cells: CellViewModel[], hiddenRanges: ICellRange[]) {
	if (!hiddenRanges.length) {
		return cells;
	}

	let start = 0;
	let hiddenRangeIndex = 0;
	const result: CellViewModel[] = [];

	while (start < cells.length && hiddenRangeIndex < hiddenRanges.length) {
		if (start < hiddenRanges[hiddenRangeIndex].start) {
			result.push(...cells.slice(start, hiddenRanges[hiddenRangeIndex].start));
		}

		start = hiddenRanges[hiddenRangeIndex].end + 1;
		hiddenRangeIndex++;
	}

	if (start < cells.length) {
		result.push(...cells.slice(start));
	}

	return result;
}

export const NOTEBOOK_WEBVIEW_BOUNDARY = 5000;

__SELECTION_HERE__
