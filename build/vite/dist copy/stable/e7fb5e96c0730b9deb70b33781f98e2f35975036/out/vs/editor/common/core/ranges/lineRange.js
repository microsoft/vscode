/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { BugIndicatingError } from '../../../../base/common/errors.js';
import { OffsetRange } from './offsetRange.js';
import { Range } from '../range.js';
import { findFirstIdxMonotonousOrArrLen, findLastIdxMonotonous, findLastMonotonous } from '../../../../base/common/arraysFind.js';
import { compareBy, numberComparator } from '../../../../base/common/arrays.js';
/**
 * A range of lines (1-based).
 */
export class LineRange {
    static ofLength(startLineNumber, length) {
        return new LineRange(startLineNumber, startLineNumber + length);
    }
    static fromRange(range) {
        return new LineRange(range.startLineNumber, range.endLineNumber);
    }
    static fromRangeInclusive(range) {
        return new LineRange(range.startLineNumber, range.endLineNumber + 1);
    }
    static { this.compareByStart = compareBy(l => l.startLineNumber, numberComparator); }
    static subtract(a, b) {
        if (!b) {
            return [a];
        }
        if (a.startLineNumber < b.startLineNumber && b.endLineNumberExclusive < a.endLineNumberExclusive) {
            return [
                new LineRange(a.startLineNumber, b.startLineNumber),
                new LineRange(b.endLineNumberExclusive, a.endLineNumberExclusive)
            ];
        }
        else if (b.startLineNumber <= a.startLineNumber && a.endLineNumberExclusive <= b.endLineNumberExclusive) {
            return [];
        }
        else if (b.endLineNumberExclusive < a.endLineNumberExclusive) {
            return [new LineRange(Math.max(b.endLineNumberExclusive, a.startLineNumber), a.endLineNumberExclusive)];
        }
        else {
            return [new LineRange(a.startLineNumber, Math.min(b.startLineNumber, a.endLineNumberExclusive))];
        }
    }
    /**
     * @param lineRanges An array of arrays of of sorted line ranges.
     */
    static joinMany(lineRanges) {
        if (lineRanges.length === 0) {
            return [];
        }
        let result = new LineRangeSet(lineRanges[0].slice());
        for (let i = 1; i < lineRanges.length; i++) {
            result = result.getUnion(new LineRangeSet(lineRanges[i].slice()));
        }
        return result.ranges;
    }
    static join(lineRanges) {
        if (lineRanges.length === 0) {
            throw new BugIndicatingError('lineRanges cannot be empty');
        }
        let startLineNumber = lineRanges[0].startLineNumber;
        let endLineNumberExclusive = lineRanges[0].endLineNumberExclusive;
        for (let i = 1; i < lineRanges.length; i++) {
            startLineNumber = Math.min(startLineNumber, lineRanges[i].startLineNumber);
            endLineNumberExclusive = Math.max(endLineNumberExclusive, lineRanges[i].endLineNumberExclusive);
        }
        return new LineRange(startLineNumber, endLineNumberExclusive);
    }
    /**
     * @internal
     */
    static deserialize(lineRange) {
        return new LineRange(lineRange[0], lineRange[1]);
    }
    constructor(startLineNumber, endLineNumberExclusive) {
        if (startLineNumber > endLineNumberExclusive) {
            throw new BugIndicatingError(`startLineNumber ${startLineNumber} cannot be after endLineNumberExclusive ${endLineNumberExclusive}`);
        }
        this.startLineNumber = startLineNumber;
        this.endLineNumberExclusive = endLineNumberExclusive;
    }
    /**
     * Indicates if this line range contains the given line number.
     */
    contains(lineNumber) {
        return this.startLineNumber <= lineNumber && lineNumber < this.endLineNumberExclusive;
    }
    containsRange(range) {
        return this.startLineNumber <= range.startLineNumber && range.endLineNumberExclusive <= this.endLineNumberExclusive;
    }
    /**
     * Indicates if this line range is empty.
     */
    get isEmpty() {
        return this.startLineNumber === this.endLineNumberExclusive;
    }
    /**
     * Moves this line range by the given offset of line numbers.
     */
    delta(offset) {
        return new LineRange(this.startLineNumber + offset, this.endLineNumberExclusive + offset);
    }
    deltaLength(offset) {
        return new LineRange(this.startLineNumber, this.endLineNumberExclusive + offset);
    }
    /**
     * The number of lines this line range spans.
     */
    get length() {
        return this.endLineNumberExclusive - this.startLineNumber;
    }
    /**
     * Creates a line range that combines this and the given line range.
     */
    join(other) {
        return new LineRange(Math.min(this.startLineNumber, other.startLineNumber), Math.max(this.endLineNumberExclusive, other.endLineNumberExclusive));
    }
    toString() {
        return `[${this.startLineNumber},${this.endLineNumberExclusive})`;
    }
    /**
     * The resulting range is empty if the ranges do not intersect, but touch.
     * If the ranges don't even touch, the result is undefined.
     */
    intersect(other) {
        const startLineNumber = Math.max(this.startLineNumber, other.startLineNumber);
        const endLineNumberExclusive = Math.min(this.endLineNumberExclusive, other.endLineNumberExclusive);
        if (startLineNumber <= endLineNumberExclusive) {
            return new LineRange(startLineNumber, endLineNumberExclusive);
        }
        return undefined;
    }
    intersectsStrict(other) {
        return this.startLineNumber < other.endLineNumberExclusive && other.startLineNumber < this.endLineNumberExclusive;
    }
    intersectsOrTouches(other) {
        return this.startLineNumber <= other.endLineNumberExclusive && other.startLineNumber <= this.endLineNumberExclusive;
    }
    equals(b) {
        return this.startLineNumber === b.startLineNumber && this.endLineNumberExclusive === b.endLineNumberExclusive;
    }
    toInclusiveRange() {
        if (this.isEmpty) {
            return null;
        }
        return new Range(this.startLineNumber, 1, this.endLineNumberExclusive - 1, Number.MAX_SAFE_INTEGER);
    }
    /**
     * @deprecated Using this function is discouraged because it might lead to bugs: The end position is not guaranteed to be a valid position!
    */
    toExclusiveRange() {
        return new Range(this.startLineNumber, 1, this.endLineNumberExclusive, 1);
    }
    mapToLineArray(f) {
        const result = [];
        for (let lineNumber = this.startLineNumber; lineNumber < this.endLineNumberExclusive; lineNumber++) {
            result.push(f(lineNumber));
        }
        return result;
    }
    forEach(f) {
        for (let lineNumber = this.startLineNumber; lineNumber < this.endLineNumberExclusive; lineNumber++) {
            f(lineNumber);
        }
    }
    /**
     * @internal
     */
    serialize() {
        return [this.startLineNumber, this.endLineNumberExclusive];
    }
    /**
     * Converts this 1-based line range to a 0-based offset range (subtracts 1!).
     * @internal
     */
    toOffsetRange() {
        return new OffsetRange(this.startLineNumber - 1, this.endLineNumberExclusive - 1);
    }
    distanceToRange(other) {
        if (this.endLineNumberExclusive <= other.startLineNumber) {
            return other.startLineNumber - this.endLineNumberExclusive;
        }
        if (other.endLineNumberExclusive <= this.startLineNumber) {
            return this.startLineNumber - other.endLineNumberExclusive;
        }
        return 0;
    }
    distanceToLine(lineNumber) {
        if (this.contains(lineNumber)) {
            return 0;
        }
        if (lineNumber < this.startLineNumber) {
            return this.startLineNumber - lineNumber;
        }
        return lineNumber - this.endLineNumberExclusive;
    }
    addMargin(marginTop, marginBottom) {
        return new LineRange(this.startLineNumber - marginTop, this.endLineNumberExclusive + marginBottom);
    }
}
export class LineRangeSet {
    constructor(
    /**
     * Sorted by start line number.
     * No two line ranges are touching or intersecting.
     */
    _normalizedRanges = []) {
        this._normalizedRanges = _normalizedRanges;
    }
    get ranges() {
        return this._normalizedRanges;
    }
    addRange(range) {
        if (range.length === 0) {
            return;
        }
        // Idea: Find joinRange such that:
        // replaceRange = _normalizedRanges.replaceRange(joinRange, range.joinAll(joinRange.map(idx => this._normalizedRanges[idx])))
        // idx of first element that touches range or that is after range
        const joinRangeStartIdx = findFirstIdxMonotonousOrArrLen(this._normalizedRanges, r => r.endLineNumberExclusive >= range.startLineNumber);
        // idx of element after { last element that touches range or that is before range }
        const joinRangeEndIdxExclusive = findLastIdxMonotonous(this._normalizedRanges, r => r.startLineNumber <= range.endLineNumberExclusive) + 1;
        if (joinRangeStartIdx === joinRangeEndIdxExclusive) {
            // If there is no element that touches range, then joinRangeStartIdx === joinRangeEndIdxExclusive and that value is the index of the element after range
            this._normalizedRanges.splice(joinRangeStartIdx, 0, range);
        }
        else if (joinRangeStartIdx === joinRangeEndIdxExclusive - 1) {
            // Else, there is an element that touches range and in this case it is both the first and last element. Thus we can replace it
            const joinRange = this._normalizedRanges[joinRangeStartIdx];
            this._normalizedRanges[joinRangeStartIdx] = joinRange.join(range);
        }
        else {
            // First and last element are different - we need to replace the entire range
            const joinRange = this._normalizedRanges[joinRangeStartIdx].join(this._normalizedRanges[joinRangeEndIdxExclusive - 1]).join(range);
            this._normalizedRanges.splice(joinRangeStartIdx, joinRangeEndIdxExclusive - joinRangeStartIdx, joinRange);
        }
    }
    contains(lineNumber) {
        const rangeThatStartsBeforeEnd = findLastMonotonous(this._normalizedRanges, r => r.startLineNumber <= lineNumber);
        return !!rangeThatStartsBeforeEnd && rangeThatStartsBeforeEnd.endLineNumberExclusive > lineNumber;
    }
    intersects(range) {
        const rangeThatStartsBeforeEnd = findLastMonotonous(this._normalizedRanges, r => r.startLineNumber < range.endLineNumberExclusive);
        return !!rangeThatStartsBeforeEnd && rangeThatStartsBeforeEnd.endLineNumberExclusive > range.startLineNumber;
    }
    getUnion(other) {
        if (this._normalizedRanges.length === 0) {
            return other;
        }
        if (other._normalizedRanges.length === 0) {
            return this;
        }
        const result = [];
        let i1 = 0;
        let i2 = 0;
        let current = null;
        while (i1 < this._normalizedRanges.length || i2 < other._normalizedRanges.length) {
            let next = null;
            if (i1 < this._normalizedRanges.length && i2 < other._normalizedRanges.length) {
                const lineRange1 = this._normalizedRanges[i1];
                const lineRange2 = other._normalizedRanges[i2];
                if (lineRange1.startLineNumber < lineRange2.startLineNumber) {
                    next = lineRange1;
                    i1++;
                }
                else {
                    next = lineRange2;
                    i2++;
                }
            }
            else if (i1 < this._normalizedRanges.length) {
                next = this._normalizedRanges[i1];
                i1++;
            }
            else {
                next = other._normalizedRanges[i2];
                i2++;
            }
            if (current === null) {
                current = next;
            }
            else {
                if (current.endLineNumberExclusive >= next.startLineNumber) {
                    // merge
                    current = new LineRange(current.startLineNumber, Math.max(current.endLineNumberExclusive, next.endLineNumberExclusive));
                }
                else {
                    // push
                    result.push(current);
                    current = next;
                }
            }
        }
        if (current !== null) {
            result.push(current);
        }
        return new LineRangeSet(result);
    }
    /**
     * Subtracts all ranges in this set from `range` and returns the result.
     */
    subtractFrom(range) {
        // idx of first element that touches range or that is after range
        const joinRangeStartIdx = findFirstIdxMonotonousOrArrLen(this._normalizedRanges, r => r.endLineNumberExclusive >= range.startLineNumber);
        // idx of element after { last element that touches range or that is before range }
        const joinRangeEndIdxExclusive = findLastIdxMonotonous(this._normalizedRanges, r => r.startLineNumber <= range.endLineNumberExclusive) + 1;
        if (joinRangeStartIdx === joinRangeEndIdxExclusive) {
            return new LineRangeSet([range]);
        }
        const result = [];
        let startLineNumber = range.startLineNumber;
        for (let i = joinRangeStartIdx; i < joinRangeEndIdxExclusive; i++) {
            const r = this._normalizedRanges[i];
            if (r.startLineNumber > startLineNumber) {
                result.push(new LineRange(startLineNumber, r.startLineNumber));
            }
            startLineNumber = r.endLineNumberExclusive;
        }
        if (startLineNumber < range.endLineNumberExclusive) {
            result.push(new LineRange(startLineNumber, range.endLineNumberExclusive));
        }
        return new LineRangeSet(result);
    }
    toString() {
        return this._normalizedRanges.map(r => r.toString()).join(', ');
    }
    getIntersection(other) {
        const result = [];
        let i1 = 0;
        let i2 = 0;
        while (i1 < this._normalizedRanges.length && i2 < other._normalizedRanges.length) {
            const r1 = this._normalizedRanges[i1];
            const r2 = other._normalizedRanges[i2];
            const i = r1.intersect(r2);
            if (i && !i.isEmpty) {
                result.push(i);
            }
            if (r1.endLineNumberExclusive < r2.endLineNumberExclusive) {
                i1++;
            }
            else {
                i2++;
            }
        }
        return new LineRangeSet(result);
    }
    getWithDelta(value) {
        return new LineRangeSet(this._normalizedRanges.map(r => r.delta(value)));
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibGluZVJhbmdlLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvZWRpdG9yL2NvbW1vbi9jb3JlL3Jhbmdlcy9saW5lUmFuZ2UudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxFQUFFLGtCQUFrQixFQUFFLE1BQU0sbUNBQW1DLENBQUM7QUFDdkUsT0FBTyxFQUFFLFdBQVcsRUFBRSxNQUFNLGtCQUFrQixDQUFDO0FBQy9DLE9BQU8sRUFBVSxLQUFLLEVBQUUsTUFBTSxhQUFhLENBQUM7QUFDNUMsT0FBTyxFQUFFLDhCQUE4QixFQUFFLHFCQUFxQixFQUFFLGtCQUFrQixFQUFFLE1BQU0sdUNBQXVDLENBQUM7QUFDbEksT0FBTyxFQUFjLFNBQVMsRUFBRSxnQkFBZ0IsRUFBRSxNQUFNLG1DQUFtQyxDQUFDO0FBRTVGOztHQUVHO0FBQ0gsTUFBTSxPQUFPLFNBQVM7SUFDZCxNQUFNLENBQUMsUUFBUSxDQUFDLGVBQXVCLEVBQUUsTUFBYztRQUM3RCxPQUFPLElBQUksU0FBUyxDQUFDLGVBQWUsRUFBRSxlQUFlLEdBQUcsTUFBTSxDQUFDLENBQUM7SUFDakUsQ0FBQztJQUVNLE1BQU0sQ0FBQyxTQUFTLENBQUMsS0FBYTtRQUNwQyxPQUFPLElBQUksU0FBUyxDQUFDLEtBQUssQ0FBQyxlQUFlLEVBQUUsS0FBSyxDQUFDLGFBQWEsQ0FBQyxDQUFDO0lBQ2xFLENBQUM7SUFFTSxNQUFNLENBQUMsa0JBQWtCLENBQUMsS0FBYTtRQUM3QyxPQUFPLElBQUksU0FBUyxDQUFDLEtBQUssQ0FBQyxlQUFlLEVBQUUsS0FBSyxDQUFDLGFBQWEsR0FBRyxDQUFDLENBQUMsQ0FBQztJQUN0RSxDQUFDO2FBRXNCLG1CQUFjLEdBQTBCLFNBQVMsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxlQUFlLEVBQUUsZ0JBQWdCLENBQUMsQ0FB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