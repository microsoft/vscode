/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { forEachAdjacent } from '../../../../../base/common/arrays.js';
import { BugIndicatingError } from '../../../../../base/common/errors.js';
import { OffsetRange } from '../../../core/ranges/offsetRange.js';
export class DiffAlgorithmResult {
    static trivial(seq1, seq2) {
        return new DiffAlgorithmResult([new SequenceDiff(OffsetRange.ofLength(seq1.length), OffsetRange.ofLength(seq2.length))], false);
    }
    static trivialTimedOut(seq1, seq2) {
        return new DiffAlgorithmResult([new SequenceDiff(OffsetRange.ofLength(seq1.length), OffsetRange.ofLength(seq2.length))], true);
    }
    constructor(diffs, 
    /**
     * Indicates if the time out was reached.
     * In that case, the diffs might be an approximation and the user should be asked to rerun the diff with more time.
     */
    hitTimeout) {
        this.diffs = diffs;
        this.hitTimeout = hitTimeout;
    }
}
export class SequenceDiff {
    static invert(sequenceDiffs, doc1Length) {
        const result = [];
        forEachAdjacent(sequenceDiffs, (a, b) => {
            result.push(SequenceDiff.fromOffsetPairs(a ? a.getEndExclusives() : OffsetPair.zero, b ? b.getStarts() : new OffsetPair(doc1Length, (a ? a.seq2Range.endExclusive - a.seq1Range.endExclusive : 0) + doc1Length)));
        });
        return result;
    }
    static fromOffsetPairs(start, endExclusive) {
        return new SequenceDiff(new OffsetRange(start.offset1, endExclusive.offset1), new OffsetRange(start.offset2, endExclusive.offset2));
    }
    static assertSorted(sequenceDiffs) {
        let last = undefined;
        for (const cur of sequenceDiffs) {
            if (last) {
                if (!(last.seq1Range.endExclusive <= cur.seq1Range.start && last.seq2Range.endExclusive <= cur.seq2Range.start)) {
                    throw new BugIndicatingError('Sequence diffs must be sorted');
                }
            }
            last = cur;
        }
    }
    constructor(seq1Range, seq2Range) {
        this.seq1Range = seq1Range;
        this.seq2Range = seq2Range;
    }
    swap() {
        return new SequenceDiff(this.seq2Range, this.seq1Range);
    }
    toString() {
        return `${this.seq1Range} <-> ${this.seq2Range}`;
    }
    join(other) {
        return new SequenceDiff(this.seq1Range.join(other.seq1Range), this.seq2Range.join(other.seq2Range));
    }
    delta(offset) {
        if (offset === 0) {
            return this;
        }
        return new SequenceDiff(this.seq1Range.delta(offset), this.seq2Range.delta(offset));
    }
    deltaStart(offset) {
        if (offset === 0) {
            return this;
        }
        return new SequenceDiff(this.seq1Range.deltaStart(offset), this.seq2Range.deltaStart(offset));
    }
    deltaEnd(offset) {
        if (offset === 0) {
            return this;
        }
        return new SequenceDiff(this.seq1Range.deltaEnd(offset), this.seq2Range.deltaEnd(offset));
    }
    intersectsOrTouches(other) {
        return this.seq1Range.intersectsOrTouches(other.seq1Range) || this.seq2Range.intersectsOrTouches(other.seq2Range);
    }
    intersect(other) {
        const i1 = this.seq1Range.intersect(other.seq1Range);
        const i2 = this.seq2Range.intersect(other.seq2Range);
        if (!i1 || !i2) {
            return undefined;
        }
        return new SequenceDiff(i1, i2);
    }
    getStarts() {
        return new OffsetPair(this.seq1Range.start, this.seq2Range.start);
    }
    getEndExclusives() {
        return new OffsetPair(this.seq1Range.endExclusive, this.seq2Range.endExclusive);
    }
}
export class OffsetPair {
    static { this.zero = new OffsetPair(0, 0); }
    static { this.max = new OffsetPair(Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER); }
    constructor(offset1, offset2) {
        this.offset1 = offset1;
        this.offset2 = offset2;
    }
    toString() {
        return `${this.offset1} <-> ${this.offset2}`;
    }
    delta(offset) {
        if (offset === 0) {
            return this;
        }
        return new OffsetPair(this.offset1 + offset, this.offset2 + offset);
    }
    equals(other) {
        return this.offset1 === other.offset1 && this.offset2 === other.offset2;
    }
}
export class InfiniteTimeout {
    static { this.instance = new InfiniteTimeout(); }
    isValid() {
        return true;
    }
}
export class DateTimeout {
    constructor(timeout) {
        this.timeout = timeout;
        this.startTime = Date.now();
        this.valid = true;
        if (timeout <= 0) {
            throw new BugIndicatingError('timeout must be positive');
        }
    }
    // Recommendation: Set a log-point `{this.disable()}` in the body
    isValid() {
        const valid = Date.now() - this.startTime < this.timeout;
        if (!valid && this.valid) {
            this.valid = false; // timeout reached
        }
        return this.valid;
    }
    disable() {
        this.timeout = Number.MAX_SAFE_INTEGER;
        this.isValid = () => true;
        this.valid = true;
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZGlmZkFsZ29yaXRobS5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL2VkaXRvci9jb21tb24vZGlmZi9kZWZhdWx0TGluZXNEaWZmQ29tcHV0ZXIvYWxnb3JpdGhtcy9kaWZmQWxnb3JpdGhtLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUN2RSxPQUFPLEVBQUUsa0JBQWtCLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUMxRSxPQUFPLEVBQUUsV0FBVyxFQUFFLE1BQU0scUNBQXFDLENBQUM7QUFTbEUsTUFBTSxPQUFPLG1CQUFtQjtJQUMvQixNQUFNLENBQUMsT0FBTyxDQUFDLElBQWUsRUFBRSxJQUFlO1FBQzlDLE9BQU8sSUFBSSxtQkFBbUIsQ0FBQyxDQUFDLElBQUksWUFBWSxDQUFDLFdBQVcsQ0FBQyxRQUFRLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxFQUFFLFdBQVcsQ0FBQyxRQUFRLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsRUFBRSxLQUFLLENBQUMsQ0FBQztJQUNqSSxDQUFDO0lBRUQsTUFBTSxDQUFDLGVBQWUsQ0FBQyxJQUFlLEVBQUUsSUFBZTtRQUN0RCxPQUFPLElBQUksbUJBQW1CLENBQUMsQ0FBQyxJQUFJLFlBQVksQ0FBQyxXQUFXLENBQUMsUUFBUSxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsRUFBRSxXQUFXLENBQUMsUUFBUSxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLEVBQUUsSUFBSSxDQUFDLENBQUM7SUFDaEksQ0FBQztJQUVELFlBQ2lCLEtBQXFCO0lBQ3JDOzs7T0FHRztJQUNhLFVBQW1CO1FBTG5CLFVBQUssR0FBTCxLQUFLLENBQWdCO1FBS3JCLGVBQVUsR0FBVixVQUFVLENBQVM7SUFD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