/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { TreeSitterOffsetRange } from '../../node/nodes';

export interface MarkerRange extends TreeSitterOffsetRange {
	/** If provided, will be put in the annotation */
	kind?: string;
}

interface InsertMarkersOptions {
	/** Include offsets */
	withOffsets: boolean;
	/** Include index within provided marker ranges */
	includeArrayIndex: boolean;
	/** Include occurrence # of a marker kind */
	includeKindIndex: boolean;
}

/**
 * Inserts range markers into a source string based on the provided ranges.
 *
 * @param source - The source string where markers will be inserted.
 * @param ranges - An array of MarkerRange objects, each representing a range to be marked.
 * @param opts - An optional "options" object to _override_ particular behavior, i.e., options are received by `{...defaultOptions, ...opts}`.
 *
 * @returns A new string with the range markers inserted.
 */
export function insertRangeMarkers(source: string, ranges: MarkerRange[], opts?: Partial<InsertMarkersOptions>) {

	opts = {
		...{ withOffsets: false, includeArrayIndex: false, includeKindIndex: true }, // default
		...opts,
	};

	const sortedRanges = ranges.sort(TreeSitterOffsetRange.compare);

	const unsortedMarkedOffsets = sortedRanges.flatMap((range, i) => {
		const rangeKind = range.kind;
		const indexInArray = i;
		const len = range.endIndex - range.startIndex;
		return [
			{ offset: range.startIndex, offsetKind: 'start', rangeKind, indexInArray, len, },
			{ offset: range.endIndex, offsetKind: 'end', rangeKind, indexInArray, len, }
		];
	});

	// @ulugbekna: representing a tree in a flat data structure
	const markedOffsets = unsortedMarkedOffsets.sort(({ offset, offsetKind, len, indexInArray }, { offset: otherOffset, offsetKind: otherOffsetKind, len: otherLen, indexInArray: otherIndexInArray }) => {
		// try to order by offset - from small to large
		const offsetDiff = offset - otherOffset;
		if (offsetDiff !== 0) {
			return offsetDiff;
		}

		if (offsetKind === otherOffsetKind) {
			// if both start offsets, larger node wins; if both end offsets, smaller wins
			const d = len - otherLen;
			return offsetKind === 'start' ? -d : d;
		} else {
			// we always want to close an open node before "opening" another node unless start & end offsets are for the same node
			return indexInArray === otherIndexInArray
				? offsetKind === 'start' ? -1 : 1 // if same node, start should come first
				: offsetKind === 'start' ? 1 : -1;
		}
	});

	const result: string[] = [];
	let cursor = 0;

	const includeArrayIndex = opts.includeArrayIndex && sortedRanges.length > 1;

	const kindIndexMap = new Map</* kind */string, number>();
	const arrayIndexToKindIndex = new Map<number, number>();

	for (const { offset, offsetKind, indexInArray, rangeKind } of markedOffsets) {

		result.push(source.substring(cursor, offset));

		let printedRangeKind = '';
		if (rangeKind !== undefined) {
			if (opts.includeKindIndex) {
				let k: number;
				if (offsetKind === 'start') {
					k = kindIndexMap.get(rangeKind) ?? 0;
					kindIndexMap.set(rangeKind, k + 1);
					arrayIndexToKindIndex.set(indexInArray, k);
				} else {
					k = arrayIndexToKindIndex.get(indexInArray)!;
				}
				printedRangeKind = k === 0 ? rangeKind : `${rangeKind}-${k}`;
			} else {
				printedRangeKind = rangeKind;
			}
		}

		const conditionalArrayIndex = includeArrayIndex ? indexInArray.toString() : '';
		const optionalOffset = opts.withOffsets ? `[${offset}]` : '';
		const printedMarker = [printedRangeKind, conditionalArrayIndex, optionalOffset].filter(s => s.length > 0).join('-');
		result.push(`<${offsetKind === 'end' ? '/' : ''}${printedMarker}>`);
		cursor = offset;
	}

	if (cursor < source.length) {
		result.push(source.substring(cursor));
	}

	return result.join('');
}
