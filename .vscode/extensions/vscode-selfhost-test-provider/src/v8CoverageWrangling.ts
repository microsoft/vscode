/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export interface ICoverageRange {
	start: number;
	end: number;
	covered: boolean;
}

export interface IV8FunctionCoverage {
	functionName: string;
	isBlockCoverage: boolean;
	ranges: IV8CoverageRange[];
}

export interface IV8CoverageRange {
	startOffset: number;
	endOffset: number;
	count: number;
}

/** V8 Script coverage data */
export interface IScriptCoverage {
	scriptId: string;
	url: string;
	// Script source added by the runner the first time the script is emitted.
	source?: string;
	functions: IV8FunctionCoverage[];
}

export class RangeCoverageTracker implements Iterable<ICoverageRange> {
	/**
	 * A noncontiguous, non-overlapping, ordered set of ranges and whether
	 * that range has been covered.
	 */
	private ranges: readonly ICoverageRange[] = [];

	/**
	 * Adds a coverage tracker initialized for a function with {@link isBlockCoverage} set to true.
	 */
	public static initializeBlocks(fns: IV8FunctionCoverage[]) {
		const rt = new RangeCoverageTracker();

		let start = 0;
		const stack: IV8CoverageRange[] = [];

		// note: comes pre-sorted from V8
		for (const { ranges } of fns) {
			for (const range of ranges) {
				while (stack.length && stack[stack.length - 1].endOffset < range.startOffset) {
					const last = stack.pop()!;
					rt.setCovered(start, last.endOffset, last.count > 0);
					start = last.endOffset;
				}

				if (range.startOffset > start && stack.length) {
					rt.setCovered(start, range.startOffset, !!stack[stack.length - 1].count);
				}

				start = range.startOffset;
				stack.push(range);
			}
		}

		while (stack.length) {
			const last = stack.pop()!;
			rt.setCovered(start, last.endOffset, last.count > 0);
			start = last.endOffset;
		}

		return rt;
	}

	/** Makes a copy of the range tracker. */
	public clone() {
		const rt = new RangeCoverageTracker();
		rt.ranges = this.ranges.slice();
		return rt;
	}

	/** Marks a range covered */
	public cover(start: number, end: number) {
		this.setCovered(start, end, true);
	}

	/** Marks a range as uncovered */
	public uncovered(start: number, end: number) {
		this.setCovered(start, end, false);
	}

	/** Iterates over coverage ranges */
	[Symbol.iterator]() {
		return this.ranges[Symbol.iterator]();
	}

	/**
	 * Marks the given character range as being covered or uncovered.
	 *
	 * todo@connor4312: this is a hot path is could probably be optimized to
	 * avoid rebuilding the array. Maybe with a nice tree structure?
	 */
	public setCovered(start: number, end: number, covered: boolean) {
		const newRanges: ICoverageRange[] = [];
		let i = 0;
		for (; i < this.ranges.length && this.ranges[i].end <= start; i++) {
			newRanges.push(this.ranges[i]);
		}

		const push = (range: ICoverageRange) => {
			const last = newRanges.length && newRanges[newRanges.length - 1];
			if (last && last.end === range.start && last.covered === range.covered) {
				last.end = range.end;
			} else {
				newRanges.push(range);
			}
		};

		push({ start, end, covered });

		for (; i < this.ranges.length; i++) {
			const range = this.ranges[i];
			const last = newRanges[newRanges.length - 1];

			if (range.start === last.start && range.end === last.end) {
				// ranges are equal:
				last.covered ||= range.covered;
			} else if (range.end < last.start || range.start > last.end) {
				// ranges don't overlap
				push(range);
			} else if (range.start < last.start && range.end > last.end) {
				// range contains last:
				newRanges.pop();
				push({ start: range.start, end: last.start, covered: range.covered });
				push({ start: last.start, end: last.end, covered: range.covered || last.covered });
				push({ start: last.end, end: range.end, covered: range.covered });
			} else if (range.start >= last.start && range.end <= last.end) {
				// last contains range:
				newRanges.pop();
				push({ start: last.start, end: range.start, covered: last.covered });
				push({ start: range.start, end: range.end, covered: range.covered || last.covered });
				push({ start: range.end, end: last.end, covered: last.covered });
			} else if (range.start < last.start && range.end <= last.end) {
				// range overlaps start of last:
				newRanges.pop();
				push({ start: range.start, end: last.start, covered: range.covered });
				push({ start: last.start, end: range.end, covered: range.covered || last.covered });
				push({ start: range.end, end: last.end, covered: last.covered });
			} else if (range.start >= last.start && range.end > last.end) {
				// range overlaps end of last:
				newRanges.pop();
				push({ start: last.start, end: range.start, covered: last.covered });
				push({ start: range.start, end: last.end, covered: range.covered || last.covered });
				push({ start: last.end, end: range.end, covered: range.covered });
			} else {
				throw new Error('unreachable');
			}
		}

		this.ranges = newRanges;
	}
}

export class OffsetToPosition {
	/** Line numbers to byte offsets. */
	public readonly lines: number[] = [];

	public readonly totalLength: number;

	constructor(source: string) {
		this.lines.push(0);
		for (let i = source.indexOf('\n'); i !== -1; i = source.indexOf('\n', i + 1)) {
			this.lines.push(i + 1);
		}
		this.totalLength = source.length;
	}

	public getLineLength(lineNumber: number): number {
		return (
			(lineNumber < this.lines.length - 1 ? this.lines[lineNumber + 1] - 1 : this.totalLength) -
			this.lines[lineNumber]
		);
	}

	/**
	 * Gets the line the offset appears on.
	 */
	public getLineOfOffset(offset: number): number {
		let low = 0;
		let high = this.lines.length;
		while (low < high) {
			const mid = Math.floor((low + high) / 2);
			if (this.lines[mid] > offset) {
				high = mid;
			} else {
				low = mid + 1;
			}
		}

		return low - 1;
	}

	/**
	 * Converts from a file offset to a base 0 line/column .
	 */
	public toLineColumn(offset: number): { line: number; column: number } {
		const line = this.getLineOfOffset(offset);
		return { line: line, column: offset - this.lines[line] };
	}
}
