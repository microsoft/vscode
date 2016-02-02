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

function shift({ start, end }: IRange, much: number): IRange {
	return { start: start + much, end: end + much };
}

function concat(...groups: IRangedGroup[][]): IRangedGroup[] {
	return groups.reduce((r, g) => r.concat(g), [] as IRangedGroup[]);
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

		this.groups = concat(before, middle, after);
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

	// indexAt(position: number): number {
	// 	let index = 0;
	// 	let size = 0;

	// 	for (const range of this._ranges) {
	// 		const newSize = size + (range.count * range.size);

	// 		if (position < newSize) {
	// 			return index + Math.floor((position - size) / range.size);
	// 		}

	// 		index += range.size;
	// 		size = newSize;
	// 	}

	// 	return -1;
	// }

	// positionAt(index: number): number {
	// 	let position = 0;
	// 	let count = 0;

	// 	for (const range of this._ranges) {
	// 		const newCount = count + range.count;

	// 		if (index < newCount) {
	// 			return position + ((index - count) * range.size);
	// 		}

	// 		position += range.count * range.size;
	// 		count = newCount;
	// 	}

	// 	return -1;
	// }

	dispose() {
		this.groups = null;
	}
}