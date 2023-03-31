/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { BugIndicatingError } from 'vs/base/common/errors';

/**
 * A range of lines (1-based).
 */
export class LineRange {
	/**
	 * The start line number.
	 */
	public readonly startLineNumber: number;

	/**
	 * The end line number (exclusive).
	 */
	public readonly endLineNumberExclusive: number;

	constructor(
		startLineNumber: number,
		endLineNumberExclusive: number,
	) {
		if (startLineNumber > endLineNumberExclusive) {
			throw new BugIndicatingError(`startLineNumber ${startLineNumber} cannot be after endLineNumberExclusive ${endLineNumberExclusive}`);
		}
		this.startLineNumber = startLineNumber;
		this.endLineNumberExclusive = endLineNumberExclusive;
	}

	/**
	 * Indicates if this line range contains the given line number.
	 */
	public contains(lineNumber: number): boolean {
		return this.startLineNumber <= lineNumber && lineNumber < this.endLineNumberExclusive;
	}

	/**
	 * Indicates if this line range is empty.
	 */
	get isEmpty(): boolean {
		return this.startLineNumber === this.endLineNumberExclusive;
	}

	/**
	 * Moves this line range by the given offset of line numbers.
	 */
	public delta(offset: number): LineRange {
		return new LineRange(this.startLineNumber + offset, this.endLineNumberExclusive + offset);
	}

	/**
	 * The number of lines this line range spans.
	 */
	public get length(): number {
		return this.endLineNumberExclusive - this.startLineNumber;
	}

	/**
	 * Creates a line range that combines this and the given line range.
	 */
	public join(other: LineRange): LineRange {
		return new LineRange(
			Math.min(this.startLineNumber, other.startLineNumber),
			Math.max(this.endLineNumberExclusive, other.endLineNumberExclusive)
		);
	}

	public toString(): string {
		return `[${this.startLineNumber},${this.endLineNumberExclusive})`;
	}

	/**
	 * The resulting range is empty if the ranges do not intersect, but touch.
	 * If the ranges don't even touch, the result is undefined.
	 */
	public intersect(other: LineRange): LineRange | undefined {
		const startLineNumber = Math.max(this.startLineNumber, other.startLineNumber);
		const endLineNumberExclusive = Math.min(this.endLineNumberExclusive, other.endLineNumberExclusive);
		if (startLineNumber <= endLineNumberExclusive) {
			return new LineRange(startLineNumber, endLineNumberExclusive);
		}
		return undefined;
	}

	public overlapOrTouch(other: LineRange): boolean {
		return this.startLineNumber <= other.endLineNumberExclusive && other.startLineNumber <= this.endLineNumberExclusive;
	}
}
