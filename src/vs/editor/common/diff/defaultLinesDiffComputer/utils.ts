/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CharCode } from '../../../../base/common/charCode.js';
import { LineRange } from '../../core/ranges/lineRange.js';
import { DetailedLineRangeMapping } from '../rangeMapping.js';

export class Array2D<T> {
	private readonly array: T[] = [];

	constructor(public readonly width: number, public readonly height: number) {
		this.array = new Array<T>(width * height);
	}

	get(x: number, y: number): T {
		return this.array[x + y * this.width];
	}

	set(x: number, y: number, value: T): void {
		this.array[x + y * this.width] = value;
	}
}

export function isSpace(charCode: number): boolean {
	return charCode === CharCode.Space || charCode === CharCode.Tab;
}

export class LineRangeFragment {
	private static chrKeys = new Map<string, number>();

	private static getKey(chr: string): number {
		let key = this.chrKeys.get(chr);
		if (key === undefined) {
			key = this.chrKeys.size;
			this.chrKeys.set(chr, key);
		}
		return key;
	}

	private readonly totalCount: number;
	private readonly histogram: number[] = [];
	constructor(
		public readonly range: LineRange,
		public readonly lines: string[],
		public readonly source: DetailedLineRangeMapping,
	) {
		let counter = 0;
		for (let i = range.startLineNumber - 1; i < range.endLineNumberExclusive - 1; i++) {
			const line = lines[i];
			for (let j = 0; j < line.length; j++) {
				counter++;
				const chr = line[j];
				const key = LineRangeFragment.getKey(chr);
				this.histogram[key] = (this.histogram[key] || 0) + 1;
			}
			counter++;
			const key = LineRangeFragment.getKey('\n');
			this.histogram[key] = (this.histogram[key] || 0) + 1;
		}

		this.totalCount = counter;
	}

	public computeSimilarity(other: LineRangeFragment): number {
		let sumDifferences = 0;
		const maxLength = Math.max(this.histogram.length, other.histogram.length);
		for (let i = 0; i < maxLength; i++) {
			sumDifferences += Math.abs((this.histogram[i] ?? 0) - (other.histogram[i] ?? 0));
		}
		return 1 - (sumDifferences / (this.totalCount + other.totalCount));
	}
}
