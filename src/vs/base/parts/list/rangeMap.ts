/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export interface IGroup {
	count: number;
	size: number;
}

export interface IRange {
	start: number;
	end: number;
}

export interface IRangedGroup {
	range: IRange;
	size: number;
}

/**
 * Returns the intersection between two ranges as a range itself.
 * Returns `null` if the intersection is empty.
 */
export function intersect(one: IRange, other: IRange): IRange {
	if (one.start >= other.end || other.start >= one.end) {
		return null;
	}

	const start = Math.max(one.start, other.start);
	const end = Math.min(one.end, other.end);

	if (end - start <= 0) {
		return null;
	}

	return { start, end };
}

/**
 * Returns the intersection between a ranged group and a range.
 * Returns `[]` if the intersection is empty.
 */
export function groupIntersect(range: IRange, groups: IRangedGroup[]): IRangedGroup[] {
	const result: IRangedGroup[] = [];

	for (const r of groups) {
		if (range.start >= r.range.end) {
			continue;
		}

		if (range.end < r.range.start) {
			break;
		}

		const intersection = intersect(range, r.range);

		if (!intersection) {
			continue;
		}

		result.push({
			range: intersection,
			size: r.size
		});
	}

	return result;
}

/**
 * Shifts a range by that `much`.
 */
function shift({ start, end }: IRange, much: number): IRange {
	return { start: start + much, end: end + much };
}

/**
 * Concatenates several collections of ranged groups into a single
 * collection.
 */
function concat(...groups: IRangedGroup[][]): IRangedGroup[] {
	return groups.reduce((r, g) => r.concat(g), [] as IRangedGroup[]);
}

/**
 * Consolidates a collection of ranged groups.
 *
 * Consolidation is the process of merging consecutive ranged groups
 * that share the same `size`.
 */
export function consolidate(groups: IRangedGroup[]): IRangedGroup[] {
	const result: IRangedGroup[] = [];
	let previousGroup: IRangedGroup = null;

	for (const group of groups) {
		const start = group.range.start;
		const end = group.range.end;
		const size = group.size;

		if (previousGroup && size === previousGroup.size) {
			previousGroup.range.end = end;
			continue;
		}

		previousGroup = { range: { start, end }, size };
		result.push(previousGroup);
	}

	return result;
}

export class RangeMap {

	private groups: IRangedGroup[] = [];

	splice(index: number, deleteCount: number, ...groups: IGroup[]): void {
		const insertCount = groups.reduce((t, r) => t + r.count, 0);
		const diff = insertCount - deleteCount;

		const before = groupIntersect({ start: 0, end: index }, this.groups);
		const after = groupIntersect({ start: index + deleteCount, end: Number.POSITIVE_INFINITY }, this.groups)
			.map<IRangedGroup>(g => ({ range: shift(g.range, diff), size: g.size }));

		const middle = groups
			.filter(g => g.count > 0 && g.size > 0)
			.map<IRangedGroup>(g => {
				const end = index + g.count;
				const result = {
					range: { start: index, end },
					size: g.size
				};

				index = end;
				return result;
			});

		this.groups = consolidate(concat(before, middle, after));
	}

	get count(): number {
		const len = this.groups.length;

		if (!len) {
			return 0;
		}

		return this.groups[len - 1].range.end;
	}

	get size(): number {
		return this.groups.reduce((t, g) => t + (g.size * (g.range.end - g.range.start)), 0);
	}

	indexAt(position: number): number {
		let index = 0;
		let size = 0;

		for (const group of this.groups) {
			const newSize = size + ((group.range.end - group.range.start) * group.size);

			if (position < newSize) {
				return index + Math.floor((position - size) / group.size);
			}

			index += group.size;
			size = newSize;
		}

		return -1;
	}

	positionAt(index: number): number {
		let position = 0;
		let count = 0;

		for (const group of this.groups) {
			const groupCount = group.range.end - group.range.start;
			const newCount = count + groupCount;

			if (index < newCount) {
				return position + ((index - count) * group.size);
			}

			position += groupCount * group.size;
			count = newCount;
		}

		return -1;
	}

	dispose() {
		this.groups = null;
	}
}