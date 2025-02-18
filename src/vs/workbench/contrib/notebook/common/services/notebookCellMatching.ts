/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { CellKind } from '../notebookCommon.js';
import { distance } from './levenshtein.js';


type Distance = number;
type OriginalIndex = number;
type ModifiedIndex = number;
type CellDistanceCache = {
	modifiedToOriginal: Map<ModifiedIndex, Map<OriginalIndex, { distance: Distance }>>;
	originalToModified: Map<OriginalIndex, Map<ModifiedIndex, { distance: Distance }>>;
};

type ICell = {
	getValue(): string;
	cellKind: CellKind;
};

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
export function matchCellBasedOnSimilarties(modifiedCells: ICell[], originalCells: ICell[]): { modified: number; original: number }[] {
	const cache: CellDistanceCache = {
		modifiedToOriginal: new Map<ModifiedIndex, Map<OriginalIndex, { distance: Distance }>>(),
		originalToModified: new Map<OriginalIndex, Map<ModifiedIndex, { distance: Distance }>>(),
	};
	const results: { modified: number; original: number; dist: number; percentage: number; possibleOriginal: number }[] = [];
	const mappedOriginalCellToModifiedCell = new Map<number, number>();
	const mappedModifiedIndexes = new Set<number>();
	const originalIndexWithLongestDistance = new Map<number, { dist: number; modifiedIndex: number }>();
	const canOriginalIndexBeMappedToModifiedIndex = (originalIndex: number, value: { distance: Distance }) => {
		if (mappedOriginalCellToModifiedCell.has(originalIndex)) {
			return false;
		}
		const existingDistance = originalIndexWithLongestDistance.get(originalIndex)?.dist ?? Number.MAX_SAFE_INTEGER;
		return value.distance < existingDistance;
	};
	const trackMappedIndexes = (modifiedIndex: number, originalIndex: number) => {
		mappedOriginalCellToModifiedCell.set(originalIndex, modifiedIndex);
		mappedModifiedIndexes.add(modifiedIndex);
	};

	for (let i = 0; i < modifiedCells.length; i++) {
		const modifiedCell = modifiedCells[i];
		const { index, dist, percentage } = computeClosestCell({ cell: modifiedCell, index: i }, originalCells, true, cache, canOriginalIndexBeMappedToModifiedIndex);
		if (index >= 0 && dist === 0) {
			trackMappedIndexes(i, index);
			results.push({ modified: i, original: index, dist, percentage, possibleOriginal: index });
		} else {
			originalIndexWithLongestDistance.set(index, { dist: dist, modifiedIndex: i });
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
		const unavailableIndexes = new Set<number>();
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
		if (result.original === -1 && result.possibleOriginal >= 0 && !unavailableIndexes.has(result.possibleOriginal) && canOriginalIndexBeMappedToModifiedIndex(result.possibleOriginal, { distance: result.dist })) {
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
		const { index, percentage } = computeClosestCell({ cell: modifiedCell, index: i }, originalCells, false, cache, (originalIndex: number, originalValue: { distance: Distance }) => {
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
						return value.distance < originalValue.distance;
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
		 * RULE 1 . Now when attempting to match `bbbbbbbbbbbb` with B, the distance is very high and the percentage is also very high.
		 * Basically majority of the text needs to be changed.
		 * However if the indexes line up perfectly well, and this is the best match, then use it.
		*
		 * Similarly its possible we're trying to match b with `BBBBBBBBBBBB` and the distance is very high, but the indexes line up perfectly well.
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
		// RULE 1 (got a match and the indexes line up perfectly well, use it regardless of the distance).
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


function computeClosestCell({ cell, index: cellIndex }: { cell: ICell; index: number }, arr: readonly ICell[], ignoreEmptyCells: boolean, cache: CellDistanceCache, canOriginalIndexBeMappedToModifiedIndex: (originalIndex: number, value: { distance: Distance }) => boolean): { index: number; dist: number; percentage: number } {
	let min_distance = Infinity;
	let min_index = -1;
	for (let i = 0; i < arr.length; i++) {
		// Skip cells that are not of the same kind.
		if (arr[i].cellKind !== cell.cellKind) {
			continue;
		}
		const str = arr[i].getValue();
		const cacheEntry = cache.modifiedToOriginal.get(cellIndex) ?? new Map<OriginalIndex, { distance: Distance }>();
		const value = cacheEntry.get(i) ?? { distance: distance(cell.getValue(), str), };
		cacheEntry.set(i, value);
		cache.modifiedToOriginal.set(cellIndex, cacheEntry);

		const originalCacheEntry = cache.originalToModified.get(i) ?? new Map<ModifiedIndex, { distance: Distance }>();
		originalCacheEntry.set(cellIndex, value);
		cache.originalToModified.set(i, originalCacheEntry);

		if (!canOriginalIndexBeMappedToModifiedIndex(i, value)) {
			continue;
		}
		if (str.length === 0 && ignoreEmptyCells) {
			continue;
		}
		if (str === cell.getValue() && cell.getValue().length > 0) {
			return { index: i, dist: 0, percentage: 0 };
		}

		if (value.distance < min_distance) {
			min_distance = value.distance;
			min_index = i;
		}
	}

	if (min_index === -1) {
		return { index: -1, dist: Number.MAX_SAFE_INTEGER, percentage: Number.MAX_SAFE_INTEGER };
	}
	const percentage = !cell.getValue().length && !arr[min_index].getValue().length ? 0 : (cell.getValue().length ? (min_distance * 100 / cell.getValue().length) : Number.MAX_SAFE_INTEGER);
	return { index: min_index, dist: min_distance, percentage };
}

