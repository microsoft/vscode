/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { NotebookTextModel } from '../../../../notebook/common/model/notebookTextModel.js';
import { CellEditType, ICell, ICellDto2, ICellEditOperation, ICellReplaceEdit, NotebookCellsChangeType, NotebookCellsModelMoveEvent, NotebookCellTextModelSplice, NotebookTextModelChangedEvent } from '../../../../notebook/common/notebookCommon.js';
import { ICellDiffInfo, sortCellChanges } from './notebookCellChanges.js';


export function adjustCellDiffForKeepingADeletedCell(originalCellIndex: number,
	cellDiffInfo: ICellDiffInfo[],
	applyEdits: typeof NotebookTextModel.prototype.applyEdits,
): ICellDiffInfo[] {
	// Delete this cell from original as well.
	const edit: ICellReplaceEdit = { cells: [], count: 1, editType: CellEditType.Replace, index: originalCellIndex, };
	applyEdits([edit], true, undefined, () => undefined, undefined, true);
	const diffs = sortCellChanges(cellDiffInfo)
		.filter(d => !(d.type === 'delete' && d.originalCellIndex === originalCellIndex))
		.map(diff => {
			if (diff.type !== 'insert' && diff.originalCellIndex > originalCellIndex) {
				return {
					...diff,
					originalCellIndex: diff.originalCellIndex - 1,
				};
			}
			return diff;
		});
	return diffs;
}

export function adjustCellDiffForRevertingADeletedCell(originalCellIndex: number,
	cellDiffInfo: ICellDiffInfo[],
	cellToInsert: ICellDto2,
	applyEdits: typeof NotebookTextModel.prototype.applyEdits,
	createModifiedCellDiffInfo: (modifiedCellIndex: number, originalCellIndex: number) => ICellDiffInfo,
): ICellDiffInfo[] {
	cellDiffInfo = sortCellChanges(cellDiffInfo);
	const indexOfEntry = cellDiffInfo.findIndex(d => d.originalCellIndex === originalCellIndex);
	if (indexOfEntry === -1) {
		// Not possible.
		return cellDiffInfo;
	}

	let modifiedCellIndex = -1;
	for (let i = 0; i < cellDiffInfo.length; i++) {
		const diff = cellDiffInfo[i];
		if (i < indexOfEntry) {
			modifiedCellIndex = Math.max(modifiedCellIndex, diff.modifiedCellIndex ?? modifiedCellIndex);
			continue;
		}
		if (i === indexOfEntry) {
			const edit: ICellReplaceEdit = { cells: [cellToInsert], count: 0, editType: CellEditType.Replace, index: modifiedCellIndex + 1, };
			applyEdits([edit], true, undefined, () => undefined, undefined, true);
			cellDiffInfo[i] = createModifiedCellDiffInfo(modifiedCellIndex + 1, originalCellIndex);
			continue;
		} else {
			// Increase the original index for all entries after this.
			if (typeof diff.modifiedCellIndex === 'number') {
				diff.modifiedCellIndex++;
				cellDiffInfo[i] = { ...diff };
			}
		}
	}

	return cellDiffInfo;
}

export function adjustCellDiffForRevertingAnInsertedCell(modifiedCellIndex: number,
	cellDiffInfo: ICellDiffInfo[],
	applyEdits: typeof NotebookTextModel.prototype.applyEdits,
): ICellDiffInfo[] {
	if (modifiedCellIndex === -1) {
		// Not possible.
		return cellDiffInfo;
	}
	cellDiffInfo = sortCellChanges(cellDiffInfo)
		.filter(d => !(d.type === 'insert' && d.modifiedCellIndex === modifiedCellIndex))
		.map(d => {
			if (d.type === 'insert' && d.modifiedCellIndex === modifiedCellIndex) {
				return d;
			}
			if (d.type !== 'delete' && d.modifiedCellIndex > modifiedCellIndex) {
				return {
					...d,
					modifiedCellIndex: d.modifiedCellIndex - 1,
				};
			}
			return d;
		});
	const edit: ICellReplaceEdit = { cells: [], count: 1, editType: CellEditType.Replace, index: modifiedCellIndex, };
	applyEdits([edit], true, undefined, () => undefined, undefined, true);
	return cellDiffInfo;
}

export function adjustCellDiffForKeepingAnInsertedCell(modifiedCellIndex: number,
	cellDiffInfo: ICellDiffInfo[],
	cellToInsert: ICellDto2,
	applyEdits: typeof NotebookTextModel.prototype.applyEdits,
	createModifiedCellDiffInfo: (modifiedCellIndex: number, originalCellIndex: number) => ICellDiffInfo,
): ICellDiffInfo[] {
	cellDiffInfo = sortCellChanges(cellDiffInfo);
	if (modifiedCellIndex === -1) {
		// Not possible.
		return cellDiffInfo;
	}
	const indexOfEntry = cellDiffInfo.findIndex(d => d.modifiedCellIndex === modifiedCellIndex);
	if (indexOfEntry === -1) {
		// Not possible.
		return cellDiffInfo;
	}
	let originalCellIndex = -1;
	for (let i = 0; i < cellDiffInfo.length; i++) {
		const diff = cellDiffInfo[i];
		if (i < indexOfEntry) {
			originalCellIndex = Math.max(originalCellIndex, diff.originalCellIndex ?? originalCellIndex);
			continue;
		}
		if (i === indexOfEntry) {
			const edit: ICellReplaceEdit = { cells: [cellToInsert], count: 0, editType: CellEditType.Replace, index: originalCellIndex + 1 };
			applyEdits([edit], true, undefined, () => undefined, undefined, true);
			cellDiffInfo[i] = createModifiedCellDiffInfo(modifiedCellIndex, originalCellIndex + 1);
			continue;
		} else {
			// Increase the original index for all entries after this.
			if (typeof diff.originalCellIndex === 'number') {
				diff.originalCellIndex++;
				cellDiffInfo[i] = { ...diff };
			}
		}
	}
	return cellDiffInfo;
}

export function adjustCellDiffAndOriginalModelBasedOnCellAddDelete(change: NotebookCellTextModelSplice<ICell>,
	cellDiffInfo: ICellDiffInfo[],
	modifiedModelCellCount: number,
	originalModelCellCount: number,
	applyEdits: typeof NotebookTextModel.prototype.applyEdits,
	createModifiedCellDiffInfo: (modifiedCellIndex: number, originalCellIndex: number) => ICellDiffInfo,
): ICellDiffInfo[] {
	cellDiffInfo = sortCellChanges(cellDiffInfo);
	const numberOfCellsInserted = change[2].length;
	const numberOfCellsDeleted = change[1];
	const cells = change[2].map(cell => {
		return {
			cellKind: cell.cellKind,
			language: cell.language,
			metadata: cell.metadata,
			outputs: cell.outputs,
			source: cell.getValue(),
			mime: undefined,
			internalMetadata: cell.internalMetadata
		} satisfies ICellDto2;
	});
	let diffEntryIndex = -1;
	let indexToInsertInOriginalModel: number | undefined = undefined;
	if (cells.length) {
		for (let i = 0; i < cellDiffInfo.length; i++) {
			const diff = cellDiffInfo[i];
			if (typeof diff.modifiedCellIndex === 'number' && diff.modifiedCellIndex === change[0]) {
				diffEntryIndex = i;

				if (typeof diff.originalCellIndex === 'number') {
					indexToInsertInOriginalModel = diff.originalCellIndex;
				}
				break;
			}
			if (typeof diff.originalCellIndex === 'number') {
				indexToInsertInOriginalModel = diff.originalCellIndex + 1;
			}
		}

		const edit: ICellEditOperation = {
			editType: CellEditType.Replace,
			cells,
			index: indexToInsertInOriginalModel ?? 0,
			count: change[1]
		};
		applyEdits([edit], true, undefined, () => undefined, undefined, true);
	}
	// If cells were deleted we handled that with this.disposeDeletedCellEntries();
	if (numberOfCellsDeleted) {
		// Adjust the indexes.
		let numberOfOriginalCellsRemovedSoFar = 0;
		let numberOfModifiedCellsRemovedSoFar = 0;
		const modifiedIndexesToRemove = new Set<number>();
		for (let i = 0; i < numberOfCellsDeleted; i++) {
			modifiedIndexesToRemove.add(change[0] + i);
		}
		const itemsToRemove = new Set<ICellDiffInfo>();
		for (let i = 0; i < cellDiffInfo.length; i++) {
			const diff = cellDiffInfo[i];
			if (i < diffEntryIndex) {
				continue;
			}

			let changed = false;
			if (typeof diff.modifiedCellIndex === 'number' && modifiedIndexesToRemove.has(diff.modifiedCellIndex)) {
				// This will be removed.
				numberOfModifiedCellsRemovedSoFar++;
				if (typeof diff.originalCellIndex === 'number') {
					numberOfOriginalCellsRemovedSoFar++;
				}
				itemsToRemove.add(diff);
				continue;
			}
			if (typeof diff.modifiedCellIndex === 'number' && numberOfModifiedCellsRemovedSoFar) {
				diff.modifiedCellIndex -= numberOfModifiedCellsRemovedSoFar;
				changed = true;
			}
			if (typeof diff.originalCellIndex === 'number' && numberOfOriginalCellsRemovedSoFar) {
				diff.originalCellIndex -= numberOfOriginalCellsRemovedSoFar;
				changed = true;
			}
			if (changed) {
				cellDiffInfo[i] = { ...diff };
			}
		}
		if (itemsToRemove.size) {
			Array.from(itemsToRemove)
				.filter(diff => typeof diff.originalCellIndex === 'number')
				.forEach(diff => {
					const edit: ICellEditOperation = {
						editType: CellEditType.Replace,
						cells: [],
						index: diff.originalCellIndex,
						count: 1
					};
					applyEdits([edit], true, undefined, () => undefined, undefined, true);
				});
		}
		cellDiffInfo = cellDiffInfo.filter(d => !itemsToRemove.has(d));
	}

	if (numberOfCellsInserted && diffEntryIndex >= 0) {
		for (let i = 0; i < cellDiffInfo.length; i++) {
			const diff = cellDiffInfo[i];
			if (i < diffEntryIndex) {
				continue;
			}
			let changed = false;
			if (typeof diff.modifiedCellIndex === 'number') {
				diff.modifiedCellIndex += numberOfCellsInserted;
				changed = true;
			}
			if (typeof diff.originalCellIndex === 'number') {
				diff.originalCellIndex += numberOfCellsInserted;
				changed = true;
			}
			if (changed) {
				cellDiffInfo[i] = { ...diff };
			}
		}
	}

	// For inserted cells, we need to ensure that we create a corresponding CellEntry.
	// So that any edits to the inserted cell is handled and mirrored over to the corresponding cell in original model.
	cells.forEach((_, i) => {
		const originalCellIndex = i + (indexToInsertInOriginalModel ?? 0);
		const modifiedCellIndex = change[0] + i;
		const unchangedCell = createModifiedCellDiffInfo(modifiedCellIndex, originalCellIndex);
		cellDiffInfo.splice((diffEntryIndex === -1 ? cellDiffInfo.length : diffEntryIndex) + i, 0, unchangedCell);
	});
	return cellDiffInfo;
}

/**
 * Given the movements of cells in modified notebook, adjust the ICellDiffInfo[] array
 * and generate edits for the old notebook (if required).
 * TODO@DonJayamanne Handle bulk moves (movements of more than 1 cell).
 */
export function adjustCellDiffAndOriginalModelBasedOnCellMovements(event: NotebookCellsModelMoveEvent<ICell>, cellDiffInfo: ICellDiffInfo[]): [ICellDiffInfo[], ICellEditOperation[]] | undefined {
	const minimumIndex = Math.min(event.index, event.newIdx);
	const maximumIndex = Math.max(event.index, event.newIdx);
	const cellDiffs = cellDiffInfo.slice();
	const indexOfEntry = cellDiffs.findIndex(d => d.modifiedCellIndex === event.index);
	const indexOfEntryToPlaceBelow = cellDiffs.findIndex(d => d.modifiedCellIndex === event.newIdx);
	if (indexOfEntry === -1 || indexOfEntryToPlaceBelow === -1) {
		return undefined;
	}
	// Create a new object so that the observable value is triggered.
	// Besides we'll be updating the values of this object in place.
	const entryToBeMoved = { ...cellDiffs[indexOfEntry] };
	const moveDirection = event.newIdx > event.index ? 'down' : 'up';


	const startIndex = cellDiffs.findIndex(d => d.modifiedCellIndex === minimumIndex);
	const endIndex = cellDiffs.findIndex(d => d.modifiedCellIndex === maximumIndex);
	const movingExistingCell = typeof entryToBeMoved.originalCellIndex === 'number';
	let originalCellsWereEffected = false;
	for (let i = 0; i < cellDiffs.length; i++) {
		const diff = cellDiffs[i];
		let changed = false;
		if (moveDirection === 'down') {
			if (i > startIndex && i <= endIndex) {
				if (typeof diff.modifiedCellIndex === 'number') {
					changed = true;
					diff.modifiedCellIndex = diff.modifiedCellIndex - 1;
				}
				if (typeof diff.originalCellIndex === 'number' && movingExistingCell) {
					diff.originalCellIndex = diff.originalCellIndex - 1;
					originalCellsWereEffected = true;
					changed = true;
				}
			}
		} else {
			if (i >= startIndex && i < endIndex) {
				if (typeof diff.modifiedCellIndex === 'number') {
					changed = true;
					diff.modifiedCellIndex = diff.modifiedCellIndex + 1;
				}
				if (typeof diff.originalCellIndex === 'number' && movingExistingCell) {
					diff.originalCellIndex = diff.originalCellIndex + 1;
					originalCellsWereEffected = true;
					changed = true;
				}
			}
		}
		// Create a new object so that the observable value is triggered.
		// Do only if there's a change.
		if (changed) {
			cellDiffs[i] = { ...diff };
		}
	}
	entryToBeMoved.modifiedCellIndex = event.newIdx;
	const originalCellIndex = entryToBeMoved.originalCellIndex;
	if (moveDirection === 'down') {
		cellDiffs.splice(endIndex + 1, 0, entryToBeMoved);
		cellDiffs.splice(startIndex, 1);
		// If we're moving a new cell up/down, then we need just adjust just the modified indexes of the cells in between.
		// If we're moving an existing up/down, then we need to adjust the original indexes as well.
		if (typeof entryToBeMoved.originalCellIndex === 'number') {
			entryToBeMoved.originalCellIndex = cellDiffs.slice(0, endIndex).reduce((lastOriginalIndex, diff) => typeof diff.originalCellIndex === 'number' ? Math.max(lastOriginalIndex, diff.originalCellIndex) : lastOriginalIndex, -1) + 1;
		}
	} else {
		cellDiffs.splice(endIndex, 1);
		cellDiffs.splice(startIndex, 0, entryToBeMoved);
		// If we're moving a new cell up/down, then we need just adjust just the modified indexes of the cells in between.
		// If we're moving an existing up/down, then we need to adjust the original indexes as well.
		if (typeof entryToBeMoved.originalCellIndex === 'number') {
			entryToBeMoved.originalCellIndex = cellDiffs.slice(0, startIndex).reduce((lastOriginalIndex, diff) => typeof diff.originalCellIndex === 'number' ? Math.max(lastOriginalIndex, diff.originalCellIndex) : lastOriginalIndex, -1) + 1;
		}
	}

	// If this is a new cell that we're moving, and there are no existing cells in between, then we can just move the new cell.
	// I.e. no need to update the original notebook model.
	if (typeof entryToBeMoved.originalCellIndex === 'number' && originalCellsWereEffected && typeof originalCellIndex === 'number' && entryToBeMoved.originalCellIndex !== originalCellIndex) {
		const edit: ICellEditOperation = {
			editType: CellEditType.Move,
			index: originalCellIndex,
			length: event.length,
			newIdx: entryToBeMoved.originalCellIndex
		};

		return [cellDiffs, [edit]];
	}

	return [cellDiffs, []];
}

export function getCorrespondingOriginalCellIndex(modifiedCellIndex: number, cellDiffInfo: ICellDiffInfo[]): number | undefined {
	const entry = cellDiffInfo.find(d => d.modifiedCellIndex === modifiedCellIndex);
	return entry?.originalCellIndex;
}

/**
 *
 * This isn't great, but necessary.
 * ipynb extension updates metadata when new cells are inserted (to ensure the metadata is correct)
 * Details of why thats required is in ipynb extension, but its necessary.
 * However as a result of this, those edits appear here and are assumed to be user edits.
 * As a result `_allEditsAreFromUs` is set to false.
 */
export function isTransientIPyNbExtensionEvent(notebookKind: string, e: NotebookTextModelChangedEvent) {
	if (notebookKind !== 'jupyter-notebook') {
		return false;
	}
	if (e.rawEvents.every(event => {
		if (event.kind !== NotebookCellsChangeType.ChangeCellMetadata) {
			return false;
		}
		if (JSON.stringify(event.metadata || {}) === JSON.stringify({ execution_count: null, metadata: {} })) {
			return true;
		}
		return true;

	})) {
		return true;
	}

	return false;
}

export function calculateNotebookRewriteRatio(cellsDiff: ICellDiffInfo[], originalModel: NotebookTextModel, modifiedModel: NotebookTextModel): number {
	const totalNumberOfUpdatedLines = cellsDiff.reduce((totalUpdatedLines, value) => {
		const getUpadtedLineCount = () => {
			if (value.type === 'unchanged') {
				return 0;
			}
			if (value.type === 'delete') {
				return originalModel.cells[value.originalCellIndex].textModel?.getLineCount() ?? 0;
			}
			if (value.type === 'insert') {
				return modifiedModel.cells[value.modifiedCellIndex].textModel?.getLineCount() ?? 0;
			}
			return value.diff.get().changes.reduce((maxLineNumber, change) => {
				return Math.max(maxLineNumber, change.modified.endLineNumberExclusive);
			}, 0);
		};

		return totalUpdatedLines + getUpadtedLineCount();
	}, 0);

	const totalNumberOfLines = modifiedModel.cells.reduce((totalLines, cell) => totalLines + (cell.textModel?.getLineCount() ?? 0), 0);
	return totalNumberOfLines === 0 ? 0 : Math.min(1, totalNumberOfUpdatedLines / totalNumberOfLines);

}
