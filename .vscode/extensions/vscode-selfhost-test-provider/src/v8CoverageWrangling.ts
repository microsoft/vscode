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
	public static initializeBlock(ranges: IV8CoverageRange[]) {
		let start = ranges[0].startOffset;
		const rt = new RangeCoverageTracker();
		if (!ranges[0].count) {
			rt.uncovered(start, ranges[0].endOffset);
			return rt;
		}

		for (let i = 1; i < ranges.length; i++) {
			const range = ranges[i];
			if (range.count) {
				continue;
			}

			rt.cover(start, range.startOffset);
			rt.uncovered(range.startOffset, range.endOffset);
			start = range.endOffset;
		}

		rt.cover(start, ranges[0].endOffset);
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

	public setCovered(start: number, end: number, covered: boolean) {
		const newRanges: ICoverageRange[] = [];
		let i = 0;
		for (; i < this.ranges.length && this.ranges[i].end <= start; i++) {
			newRanges.push(this.ranges[i]);
		}

		newRanges.push({ start, end, covered });
		for (; i < this.ranges.length; i++) {
			const range = this.ranges[i];
			const last = newRanges[newRanges.length - 1];

			if (range.start < last.start && range.end > last.end) {
				// range contains last:
				newRanges.pop();
				newRanges.push({ start: range.start, end: last.start, covered: range.covered });
				newRanges.push({ start: last.start, end: last.end, covered: range.covered || last.covered });
				newRanges.push({ start: last.end, end: range.end, covered: range.covered });
			} else if (range.start > last.start && range.end <= last.end) {
				// last contains range:
				newRanges.pop();
				newRanges.push({ start: last.start, end: range.start, covered: last.covered });
				newRanges.push({ start: range.start, end: range.end, covered: range.covered || last.covered });
				newRanges.push({ start: range.end, end: last.end, covered: last.covered });
			} else if (range.start < last.start && range.end <= last.end) {
				// range overlaps start of last:
				newRanges.pop();
				newRanges.push({ start: range.start, end: last.start, covered: range.covered });
				newRanges.push({ start: last.start, end: range.end, covered: range.covered || last.covered });
				newRanges.push({ start: range.end, end: last.end, covered: last.covered });
			} else if (range.start > last.start && range.end > last.end) {
				// range overlaps end of last:
				newRanges.pop();
				newRanges.push({ start: last.start, end: range.start, covered: last.covered });
				newRanges.push({ start: range.start, end: last.end, covered: range.covered || last.covered });
				newRanges.push({ start: last.end, end: range.end, covered: range.covered });
			} else {
				// ranges are equal:
				last.covered ||= range.covered;
			}
		}

		this.ranges = newRanges;
	}
}

export class OffsetToPosition {
	/** Line numbers to byte offsets. */
  public readonly lines: number[] = [];

  constructor(public readonly source: string) {
    this.lines.push(0);
    for (let i = source.indexOf('\n'); i !== -1; i = source.indexOf('\n', i + 1)) {
      this.lines.push(i + 1);
    }
  }

  /**
   * Converts from a file offset to a base 0 line/column .
   */
  public convert(offset: number): { line: number; column: number } {
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

		return { line: low - 1, column: offset - this.lines[low - 1] };
  }
}
