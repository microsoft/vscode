/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { NotebookCellsChangeType } from '../../../../notebook/common/notebookCommon.js';
import { sortCellChanges } from './notebookCellChanges.js';
export function adjustCellDiffForKeepingADeletedCell(originalCellIndex, cellDiffInfo, applyEdits) {
    // Delete this cell from original as well.
    const edit = { cells: [], count: 1, editType: 1 /* CellEditType.Replace */, index: originalCellIndex, };
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
export function adjustCellDiffForRevertingADeletedCell(originalCellIndex, cellDiffInfo, cellToInsert, applyEdits, createModifiedCellDiffInfo) {
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
            const edit = { cells: [cellToInsert], count: 0, editType: 1 /* CellEditType.Replace */, index: modifiedCellIndex + 1, };
            applyEdits([edit], true, undefined, () => undefined, undefined, true);
            cellDiffInfo[i] = createModifiedCellDiffInfo(modifiedCellIndex + 1, originalCellIndex);
            continue;
        }
        else {
            // Increase the original index for all entries after this.
            if (typeof diff.modifiedCellIndex === 'number') {
                diff.modifiedCellIndex++;
                cellDiffInfo[i] = { ...diff };
            }
        }
    }
    return cellDiffInfo;
}
export function adjustCellDiffForRevertingAnInsertedCell(modifiedCellIndex, cellDiffInfo, applyEdits) {
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
    const edit = { cells: [], count: 1, editType: 1 /* CellEditType.Replace */, index: modifiedCellIndex, };
    applyEdits([edit], true, undefined, () => undefined, undefined, true);
    return cellDiffInfo;
}
export function adjustCellDiffForKeepingAnInsertedCell(modifiedCellIndex, cellDiffInfo, cellToInsert, applyEdits, createModifiedCellDiffInfo) {
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
            const edit = { cells: [cellToInsert], count: 0, editType: 1 /* CellEditType.Replace */, index: originalCellIndex + 1 };
            applyEdits([edit], true, undefined, () => undefined, undefined, true);
            cellDiffInfo[i] = createModifiedCellDiffInfo(modifiedCellIndex, originalCellIndex + 1);
            continue;
        }
        else {
            // Increase the original index for all entries after this.
            if (typeof diff.originalCellIndex === 'number') {
                diff.originalCellIndex++;
                cellDiffInfo[i] = { ...diff };
            }
        }
    }
    return cellDiffInfo;
}
export function adjustCellDiffAndOriginalModelBasedOnCellAddDelete(change, cellDiffInfo, modifiedModelCellCount, originalModelCellCount, applyEdits, createModifiedCellDiffInfo) {
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
        };
    });
    let diffEntryIndex = -1;
    let indexToInsertInOriginalModel = undefined;
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
        const edit = {
            editType: 1 /* CellEditType.Replace */,
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
        const modifiedIndexesToRemove = new Set();
        for (let i = 0; i < numberOfCellsDeleted; i++) {
            modifiedIndexesToRemove.add(change[0] + i);
        }
        const itemsToRemove = new Set();
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
                const edit = {
                    editType: 1 /* CellEditType.Replace */,
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
export function adjustCellDiffAndOriginalModelBasedOnCellMovements(event, cellDiffInfo) {
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
        }
        else {
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
    }
    else {
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
        const edit = {
            editType: 6 /* CellEditType.Move */,
            index: originalCellIndex,
            length: event.length,
            newIdx: entryToBeMoved.originalCellIndex
        };
        return [cellDiffs, [edit]];
    }
    return [cellDiffs, []];
}
export function getCorrespondingOriginalCellIndex(modifiedCellIndex, cellDiffInfo) {
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
export function isTransientIPyNbExtensionEvent(notebookKind, e) {
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
export function calculateNotebookRewriteRatio(cellsDiff, originalModel, modifiedModel) {
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaGVscGVycy5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvYnJvd3Nlci9jaGF0RWRpdGluZy9ub3RlYm9vay9oZWxwZXJzLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBR2hHLE9BQU8sRUFBd0UsdUJBQXVCLEVBQTJGLE1BQU0sK0NBQStDLENBQUM7QUFDdlAsT0FBTyxFQUFpQixlQUFlLEVBQUUsTUFBTSwwQkFBMEIsQ0FBQztBQUcxRSxNQUFNLFVBQVUsb0NBQW9DLENBQUMsaUJBQXlCLEVBQzdFLFlBQTZCLEVBQzdCLFVBQXlEO0lBRXpELDBDQUEwQztJQUMxQyxNQUFNLElBQUksR0FBcUIsRUFBRSxLQUFLLEVBQUUsRUFBRSxFQUFFLEtBQUssRUFBRSxDQUFDLEVBQUUsUUFBUSw4QkFBc0IsRUFBRSxLQUFLLEVBQUUsaUJBQWlCLEdBQUcsQ0FBQztJQUNsSCxVQUFVLENBQUMsQ0FBQyxJQUFJLENBQUMsRUFBRSxJQUFJLEVBQUUsU0FBUyxFQUFFLEdBQUcsRUFBRSxDQUFDLFNBQVMsRUFBRSxTQUFTLEVBQUUsSUFBSSxDQUFDLENBQUM7SUFDdEUsTUFBTSxLQUFLLEdBQUcsZUFBZSxDQUFDLFlBQVksQ0FBQztTQUN6QyxNQUFNLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLElBQUksS0FBSyxRQUFRLElBQUksQ0FBQyxDQUFDLGlCQUFpQixLQUFLLGlCQUFpQixDQUFDLENBQUM7U0FDaEYsR0FBRyxDQUFDLElBQUksQ0FBQyxFQUFFO1FBQ1gsSUFBSSxJQUFJLENBQUMsSUFBSSxLQUFLLFFBQVEsSUFBSSxJQUFJLENBQUMsaUJBQWlCLEdBQUcsaUJBQWlCLEVBQUUsQ0FBQztZQUMxRSxPQUFPO2dCQUNOLEdBQUcsSUFBSTtnQkFDUCxpQkFBaUIsRUFBRSxJQUFJ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