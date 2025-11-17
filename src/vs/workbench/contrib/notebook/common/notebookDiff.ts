/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IDiffChange } from '../../../../base/common/diff/diff.js';
import { CellKind, INotebookDiffResult } from './notebookCommon.js';

export type CellDiffInfo = {
	originalCellIndex: number;
	modifiedCellIndex: number;
	type: 'unchanged' | 'modified';
} |
{
	originalCellIndex: number;
	type: 'delete';
} |
{
	modifiedCellIndex: number;
	type: 'insert';
};

interface ICell {
	cellKind: CellKind;
	getHashValue(): number;
	equal(cell: ICell): boolean;
}
// interface INotebookDiffResult {
// 	cellsDiff: IDiffResult;
// 	metadataChanged: boolean;
// }

export function computeDiff(originalModel: { readonly cells: readonly ICell[] }, modifiedModel: { readonly cells: readonly ICell[] }, diffResult: INotebookDiffResult) {
	const cellChanges = diffResult.cellsDiff.changes;
	const cellDiffInfo: CellDiffInfo[] = [];
	let originalCellIndex = 0;
	let modifiedCellIndex = 0;

	let firstChangeIndex = -1;

	for (let i = 0; i < cellChanges.length; i++) {
		const change = cellChanges[i];
		// common cells

		for (let j = 0; j < change.originalStart - originalCellIndex; j++) {
			const originalCell = originalModel.cells[originalCellIndex + j];
			const modifiedCell = modifiedModel.cells[modifiedCellIndex + j];
			if (originalCell.getHashValue() === modifiedCell.getHashValue()) {
				cellDiffInfo.push({
					originalCellIndex: originalCellIndex + j,
					modifiedCellIndex: modifiedCellIndex + j,
					type: 'unchanged'
				});
			} else {
				if (firstChangeIndex === -1) {
					firstChangeIndex = cellDiffInfo.length;
				}
				cellDiffInfo.push({
					originalCellIndex: originalCellIndex + j,
					modifiedCellIndex: modifiedCellIndex + j,
					type: 'modified'
				});
			}
		}

		const modifiedLCS = computeModifiedLCS(change, originalModel, modifiedModel);
		if (modifiedLCS.length && firstChangeIndex === -1) {
			firstChangeIndex = cellDiffInfo.length;
		}

		cellDiffInfo.push(...modifiedLCS);
		originalCellIndex = change.originalStart + change.originalLength;
		modifiedCellIndex = change.modifiedStart + change.modifiedLength;
	}

	for (let i = originalCellIndex; i < originalModel.cells.length; i++) {
		cellDiffInfo.push({
			originalCellIndex: i,
			modifiedCellIndex: i - originalCellIndex + modifiedCellIndex,
			type: 'unchanged'
		});
	}

	return {
		cellDiffInfo,
		firstChangeIndex
	};
}

function computeModifiedLCS(change: IDiffChange, originalModel: { readonly cells: readonly ICell[] }, modifiedModel: { readonly cells: readonly ICell[] }) {
	const result: CellDiffInfo[] = [];
	// modified cells
	const modifiedLen = Math.min(change.originalLength, change.modifiedLength);

	for (let j = 0; j < modifiedLen; j++) {
		const originalCell = originalModel.cells[change.originalStart + j];
		const modifiedCell = modifiedModel.cells[change.modifiedStart + j];
		if (originalCell.cellKind !== modifiedCell.cellKind) {
			result.push({
				originalCellIndex: change.originalStart + j,
				type: 'delete'
			});
			result.push({
				modifiedCellIndex: change.modifiedStart + j,
				type: 'insert'
			});
		} else {
			const isTheSame = originalCell.equal(modifiedCell);
			result.push({
				originalCellIndex: change.originalStart + j,
				modifiedCellIndex: change.modifiedStart + j,
				type: isTheSame ? 'unchanged' : 'modified'
			});
		}
	}

	for (let j = modifiedLen; j < change.originalLength; j++) {
		// deletion
		result.push({
			originalCellIndex: change.originalStart + j,
			type: 'delete'
		});
	}

	for (let j = modifiedLen; j < change.modifiedLength; j++) {
		result.push({
			modifiedCellIndex: change.modifiedStart + j,
			type: 'insert'
		});
	}

	return result;
}
