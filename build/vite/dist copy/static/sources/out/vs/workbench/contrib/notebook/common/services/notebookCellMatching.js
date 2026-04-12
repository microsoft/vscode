/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { computeLevenshteinDistance } from '../../../../../base/common/diff/diff.js';
/**
 * Given a set of modified cells and original cells, this function will attempt to match the modified cells with the original cells.
 * E.g. Assume you have (original on left and modified on right):
 * =================
 * Cell A  | Cell a
 * Cell B  | Cell b
 * Cell C  | Cell d
 * Cell D  | Cell e
 * =================
 * Here we know that `Cell C` has been removed and `Cell e` has been added.
 * The mapping from modified to original will be as follows:
 * Cell a => Cell A
 * Cell b => Cell B
 * Cell d => Cell D
 * Cell e => <Does not match anything in original, hence a new Cell>
 * Cell C in original was not matched, hence it was deleted.
 *
 * Thus the return value is as follows:
 * [
 * { modified: 0, original: 0 },
 * { modified: 1, original: 1 },
 * { modified: 2, original: 3 },
 * { modified: 3, original: -1 },
 * ]
 * @returns
 */
export function matchCellBasedOnSimilarties(modifiedCells, originalCells) {
    const cache = {
        modifiedToOriginal: new Map(),
        originalToModified: new Map(),
    };
    const results = [];
    const mappedOriginalCellToModifiedCell = new Map();
    const mappedModifiedIndexes = new Set();
    const originalIndexWithMostEdits = new Map();
    const canOriginalIndexBeMappedToModifiedIndex = (originalIndex, value) => {
        if (mappedOriginalCellToModifiedCell.has(originalIndex)) {
            return false;
        }
        const existingEdits = originalIndexWithMostEdits.get(originalIndex)?.dist ?? Number.MAX_SAFE_INTEGER;
        return value.editCount < existingEdits;
    };
    const trackMappedIndexes = (modifiedIndex, originalIndex) => {
        mappedOriginalCellToModifiedCell.set(originalIndex, modifiedIndex);
        mappedModifiedIndexes.add(modifiedIndex);
    };
    for (let i = 0; i < modifiedCells.length; i++) {
        const modifiedCell = modifiedCells[i];
        const { index, editCount: dist, percentage } = computeClosestCell({ cell: modifiedCell, index: i }, originalCells, true, cache, canOriginalIndexBeMappedToModifiedIndex);
        if (index >= 0 && dist === 0) {
            trackMappedIndexes(i, index);
            results.push({ modified: i, original: index, dist, percentage, possibleOriginal: index });
        }
        else {
            originalIndexWithMostEdits.set(index, { dist: dist, modifiedIndex: i });
            results.push({ modified: i, original: -1, dist: dist, percentage, possibleOriginal: index });
        }
    }
    results.forEach((result, i) => {
        if (result.original >= 0) {
            return;
        }
        /**
         * I.e. Assume you have the following
         * =================
         * A a (this has ben matched)
         * B b <not matched>
         * C c <not matched>
         * D d (these two have been matched)
         * e e
         * f f
         * =================
         * Just match A => a, B => b, C => c
         */
        // Find the next cell that has been matched.
        const previousMatchedCell = i > 0 ? results.slice(0, i).reverse().find(r => r.original >= 0) : undefined;
        const previousMatchedOriginalIndex = previousMatchedCell?.original ?? -1;
        const previousMatchedModifiedIndex = previousMatchedCell?.modified ?? -1;
        const matchedCell = results.slice(i + 1).find(r => r.original >= 0);
        const unavailableIndexes = new Set();
        const nextMatchedModifiedIndex = results.findIndex((item, idx) => idx > i && item.original >= 0);
        const nextMatchedOriginalIndex = nextMatchedModifiedIndex >= 0 ? results[nextMatchedModifiedIndex].original : -1;
        // Find the available indexes that we can match with.
        // We are only interested in b and c (anything after d is of no use).
        originalCells.forEach((_, i) => {
            if (mappedOriginalCellToModifiedCell.has(i)) {
                unavailableIndexes.add(i);
                return;
            }
            if (matchedCell && i >= matchedCell.original) {
                unavailableIndexes.add(i);
            }
            if (nextMatchedOriginalIndex >= 0 && i > nextMatchedOriginalIndex) {
                unavailableIndexes.add(i);
            }
        });
        const modifiedCell = modifiedCells[i];
        /**
         * I.e. Assume you have the following
         * =================
         * A a (this has ben matched)
         * B b <not matched because the % of change is too high, but we do have a probable match>
         * C c <not matched>
         * D d (these two have been matched)
         * e e
         * f f
         * =================
         * Given that we have a probable match for B => b, we can match it.
         */
        if (result.original === -1 && result.possibleOriginal >= 0 && !unavailableIndexes.has(result.possibleOriginal) && canOriginalIndexBeMappedToModifiedIndex(result.possibleOriginal, { editCount: result.dist })) {
            trackMappedIndexes(i, result.possibleOriginal);
            result.original = result.possibleOriginal;
            return;
        }
        /**
         * I.e. Assume you have the following
         * =================
         * A a (this has ben matched)
         * B b <not matched>
         * C c <not matched>
         * D d (these two have been matched)
         * =================
         * Its possible that B matches better with c and C matches better with b.
         * However given the fact that we have matched A => a and D => d.
         * & if the indexes are an exact match.
         * I.e. index of D in Modified === index of d in Original, and index of A in Modified === index of a in Original.
         * Then this means there are absolutely no modifications.
         * Hence we can just assign the indexes as is.
         *
         * NOTE: For this, we must ensure we have exactly the same number of items on either side.
         * I.e. we have B, C remaining in Modified, and b, c remaining in Original.
         * Thats 2 Modified items === 2 Original Items.
         * If its not the same, then this means something has been deleted/inserted, and we cannot blindly map the indexes.
        */
        if (previousMatchedOriginalIndex > 0 && previousMatchedModifiedIndex > 0 && previousMatchedOriginalIndex === previousMatchedModifiedIndex) {
            if ((nextMatchedModifiedIndex >= 0 ? nextMatchedModifiedIndex : modifiedCells.length - 1) === (nextMatchedOriginalIndex >= 0 ? nextMatchedOriginalIndex : originalCells.length - 1) && !unavailableIndexes.has(i) && i < originalCells.length) {
                const remainingModifiedItems = (nextMatchedModifiedIndex >= 0 ? nextMatchedModifiedIndex : modifiedCells.length) - previousMatchedModifiedIndex;
                const remainingOriginalItems = (nextMatchedOriginalIndex >= 0 ? nextMatchedOriginalIndex : originalCells.length) - previousMatchedOriginalIndex;
                if (remainingModifiedItems === remainingOriginalItems && modifiedCell.cellKind === originalCells[i].cellKind) {
                    trackMappedIndexes(i, i);
                    result.original = i;
                    return;
                }
            }
        }
        /**
         * I.e. Assume you have the following
         * =================
         * A a (this has ben matched)
         * B b <not matched>
         * C c <not matched>
         * D d (these two have been matched)
         * e e
         * f f
         * =================
         * We can now try to match B with b and c and figure out which is best.
         * RULE 1. Its possible that B will match best with c, howevber C matches better with c, meaning we should match B with b.
         * To do this, we need to see if c has a better match with something else.
        */
        // RULE 1
        // Try to find the next best match, but exclucde items that have a better match.
        const { index, percentage } = computeClosestCell({ cell: modifiedCell, index: i }, originalCells, false, cache, (originalIndex, originalValue) => {
            if (unavailableIndexes.has(originalIndex)) {
                return false;
            }
            if (nextMatchedModifiedIndex > 0 || previousMatchedOriginalIndex > 0) {
                // See if we have a beter match for this.
                const matchesForThisOriginalIndex = cache.originalToModified.get(originalIndex);
                if (matchesForThisOriginalIndex && previousMatchedOriginalIndex < originalIndex) {
                    const betterMatch = Array.from(matchesForThisOriginalIndex).find(([modifiedIndex, value]) => {
                        if (modifiedIndex === i) {
                            // This is the same modifeid entry.
                            return false;
                        }
                        if (modifiedIndex >= nextMatchedModifiedIndex) {
                            // We're only interested in matches that are before the next matched index.
                            return false;
                        }
                        if (mappedModifiedIndexes.has(i)) {
                            // This has already been matched.
                            return false;
                        }
                        return value.editCount < originalValue.editCount;
                    });
                    if (betterMatch) {
                        // We do have a better match for this, hence do not use this.
                        return false;
                    }
                }
            }
            return !unavailableIndexes.has(originalIndex);
        });
        /**
         * I.e. Assume you have the following
         * =================
         * A a (this has ben matched)
         * B bbbbbbbbbbbbbb <not matched>
         * C cccccccccccccc <not matched>
         * D d (these two have been matched)
         * e e
         * f f
         * =================
         * RULE 1 . Now when attempting to match `bbbbbbbbbbbb` with B, the number of edits is very high and the percentage is also very high.
         * Basically majority of the text needs to be changed.
         * However if the indexes line up perfectly well, and this is the best match, then use it.
        *
         * Similarly its possible we're trying to match b with `BBBBBBBBBBBB` and the number of edits is very high, but the indexes line up perfectly well.
        *
        * RULE 2. However it is also possible that there's a better match with another cell
        * Assume we have
         * =================
         * AAAA     a (this has been matched)
         * bbbbbbbb b <not matched>
         * bbbb     c <not matched>
         * dddd     d (these two have been matched)
         * =================
         * In this case if we use the algorithm of (1) above, we'll end up matching bbbb with b, and bbbbbbbb with c.
         * But we're not really sure if this is the best match.
         * In such cases try to match with the same cell index.
         *
        */
        // RULE 1 (got a match and the indexes line up perfectly well, use it regardless of the number of edits).
        if (index >= 0 && i > 0 && results[i - 1].original === index - 1) {
            trackMappedIndexes(i, index);
            results[i].original = index;
            return;
        }
        // RULE 2
        // Here we know that `AAAA => a`
        // Check if the previous cell has been matched.
        // And if the next modified and next original cells are a match.
        const nextOriginalCell = (i > 0 && originalCells.length > results[i - 1].original) ? results[i - 1].original + 1 : -1;
        const nextOriginalCellValue = i > 0 && nextOriginalCell >= 0 && nextOriginalCell < originalCells.length ? originalCells[nextOriginalCell].getValue() : undefined;
        if (index >= 0 && i > 0 && typeof nextOriginalCellValue === 'string' && !mappedOriginalCellToModifiedCell.has(nextOriginalCell)) {
            if (modifiedCell.getValue().includes(nextOriginalCellValue) || nextOriginalCellValue.includes(modifiedCell.getValue())) {
                trackMappedIndexes(i, nextOriginalCell);
                results[i].original = nextOriginalCell;
                return;
            }
        }
        if (percentage < 90 || (i === 0 && results.length === 1)) {
            trackMappedIndexes(i, index);
            results[i].original = index;
            return;
        }
    });
    return results;
}
function computeClosestCell({ cell, index: cellIndex }, arr, ignoreEmptyCells, cache, canOriginalIndexBeMappedToModifiedIndex) {
    let min_edits = Infinity;
    let min_index = -1;
    // Always give preference to internal Cell Id if found.
    const internalId = cell.internalMetadata?.internalId;
    if (internalId) {
        const internalIdIndex = arr.findIndex(cell => cell.internalMetadata?.internalId === internalId);
        if (internalIdIndex >= 0) {
            return { index: internalIdIndex, editCount: 0, percentage: Number.MAX_SAFE_INTEGER };
        }
    }
    for (let i = 0; i < arr.length; i++) {
        // Skip cells that are not of the same kind.
        if (arr[i].cellKind !== cell.cellKind) {
            continue;
        }
        const str = arr[i].getValue();
        const cacheEntry = cache.modifiedToOriginal.get(cellIndex) ?? new Map();
        const value = cacheEntry.get(i) ?? { editCount: computeNumberOfEdits(cell, arr[i]), };
        cacheEntry.set(i, value);
        cache.modifiedToOriginal.set(cellIndex, cacheEntry);
        const originalCacheEntry = cache.originalToModified.get(i) ?? new Map();
        originalCacheEntry.set(cellIndex, value);
        cache.originalToModified.set(i, originalCacheEntry);
        if (!canOriginalIndexBeMappedToModifiedIndex(i, value)) {
            continue;
        }
        if (str.length === 0 && ignoreEmptyCells) {
            continue;
        }
        if (str === cell.getValue() && cell.getValue().length > 0) {
            return { index: i, editCount: 0, percentage: 0 };
        }
        if (value.editCount < min_edits) {
            min_edits = value.editCount;
            min_index = i;
        }
    }
    if (min_index === -1) {
        return { index: -1, editCount: Number.MAX_SAFE_INTEGER, percentage: Number.MAX_SAFE_INTEGER };
    }
    const percentage = !cell.getValue().length && !arr[min_index].getValue().length ? 0 : (cell.getValue().length ? (min_edits * 100 / cell.getValue().length) : Number.MAX_SAFE_INTEGER);
    return { index: min_index, editCount: min_edits, percentage };
}
function computeNumberOfEdits(modified, original) {
    if (modified.getValue() === original.getValue()) {
        return 0;
    }
    return computeLevenshteinDistance(modified.getValue(), original.getValue());
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibm90ZWJvb2tDZWxsTWF0Y2hpbmcuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi9ub3RlYm9vay9jb21tb24vc2VydmljZXMvbm90ZWJvb2tDZWxsTWF0Y2hpbmcudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxFQUFFLDBCQUEwQixFQUFFLE1BQU0seUNBQXlDLENBQUM7QUFxQnJGOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0dBeUJHO0FBQ0gsTUFBTSxVQUFVLDJCQUEyQixDQUFDLGFBQXNCLEVBQUUsYUFBc0I7SUFDekYsTUFBTSxLQUFLLEdBQXVCO1FBQ2pDLGtCQUFrQixFQUFFLElBQUksR0FBRyxFQUErRDtRQUMxRixrQkFBa0IsRUFBRSxJQUFJLEdBQUcsRUFBK0Q7S0FDMUYsQ0FBQztJQUNGLE1BQU0sT0FBTyxHQUF5RyxFQUFFLENBQUM7SUFDekgsTUFBTSxnQ0FBZ0MsR0FBRyxJQUFJLEdBQUcsRUFBa0IsQ0FBQztJQUNuRSxNQUFNLHFCQUFxQixHQUFHLElBQUksR0FBRyxFQUFVLENBQUM7SUFDaEQsTUFBTSwwQkFBMEIsR0FBRyxJQUFJLEdBQUcsRUFBbUQsQ0FBQztJQUM5RixNQUFNLHVDQUF1QyxHQUFHLENBQUMsYUFBcUIsRUFBRSxLQUErQixFQUFFLEVBQUU7UUFDMUcsSUFBSSxnQ0FBZ0MsQ0FBQyxHQUFHLENBQUMsYUFBYSxDQUFDLEVBQUUsQ0FBQztZQUN6RCxPQUFPLEtBQUssQ0FBQztRQUNkLENBQUM7UUFDRCxNQUFNLGFBQWEsR0FBRywwQkFBMEIsQ0FBQyxHQUFHLENBQUMsYUFBYSxDQUFDLEVBQUUsSUFBSSxJQUFJLE1BQU0sQ0FBQyxnQkFBZ0IsQ0FBQztRQUNyRyxPQUFPLEtBQUssQ0FBQyxTQUFTLEdBQUcsYUFBYSxDQUFDO0lBQ3hDLENBQUMsQ0FBQztJQUNG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