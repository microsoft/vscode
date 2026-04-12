/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { sumBy } from '../../../../base/common/arrays.js';
import { BugIndicatingError } from '../../../../base/common/errors.js';
import { OffsetRange } from '../ranges/offsetRange.js';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export class BaseEdit {
    constructor(replacements) {
        this.replacements = replacements;
        let lastEndEx = -1;
        for (const replacement of replacements) {
            if (!(replacement.replaceRange.start >= lastEndEx)) {
                throw new BugIndicatingError(`Edits must be disjoint and sorted. Found ${replacement} after ${lastEndEx}`);
            }
            lastEndEx = replacement.replaceRange.endExclusive;
        }
    }
    /**
     * Returns true if and only if this edit and the given edit are structurally equal.
     * Note that this does not mean that the edits have the same effect on a given input!
     * See `.normalize()` or `.normalizeOnBase(base)` for that.
    */
    equals(other) {
        if (this.replacements.length !== other.replacements.length) {
            return false;
        }
        for (let i = 0; i < this.replacements.length; i++) {
            if (!this.replacements[i].equals(other.replacements[i])) {
                return false;
            }
        }
        return true;
    }
    toString() {
        const edits = this.replacements.map(e => e.toString()).join(', ');
        return `[${edits}]`;
    }
    /**
     * Normalizes the edit by removing empty replacements and joining touching replacements (if the replacements allow joining).
     * Two edits have an equal normalized edit if and only if they have the same effect on any input.
     *
     * ![](https://raw.githubusercontent.com/microsoft/vscode/refs/heads/main/src/vs/editor/common/core/edits/docs/BaseEdit_normalize.drawio.png)
     *
     * Invariant:
     * ```
     * (forall base: TEdit.apply(base).equals(other.apply(base))) <-> this.normalize().equals(other.normalize())
     * ```
     * and
     * ```
     * forall base: TEdit.apply(base).equals(this.normalize().apply(base))
     * ```
     *
     */
    normalize() {
        const newReplacements = [];
        let lastReplacement;
        for (const r of this.replacements) {
            if (r.getNewLength() === 0 && r.replaceRange.length === 0) {
                continue;
            }
            if (lastReplacement && lastReplacement.replaceRange.endExclusive === r.replaceRange.start) {
                const joined = lastReplacement.tryJoinTouching(r);
                if (joined) {
                    lastReplacement = joined;
                    continue;
                }
            }
            if (lastReplacement) {
                newReplacements.push(lastReplacement);
            }
            lastReplacement = r;
        }
        if (lastReplacement) {
            newReplacements.push(lastReplacement);
        }
        return this._createNew(newReplacements);
    }
    /**
     * Combines two edits into one with the same effect.
     *
     * ![](https://raw.githubusercontent.com/microsoft/vscode/refs/heads/main/src/vs/editor/common/core/edits/docs/BaseEdit_compose.drawio.png)
     *
     * Invariant:
     * ```
     * other.apply(this.apply(s0)) = this.compose(other).apply(s0)
     * ```
     */
    compose(other) {
        const edits1 = this.normalize();
        const edits2 = other.normalize();
        if (edits1.isEmpty()) {
            return edits2;
        }
        if (edits2.isEmpty()) {
            return edits1;
        }
        const edit1Queue = [...edits1.replacements];
        const result = [];
        let edit1ToEdit2 = 0;
        for (const r2 of edits2.replacements) {
            // Copy over edit1 unmodified until it touches edit2.
            while (true) {
                const r1 = edit1Queue[0];
                if (!r1 || r1.replaceRange.start + edit1ToEdit2 + r1.getNewLength() >= r2.replaceRange.start) {
                    break;
                }
                edit1Queue.shift();
                result.push(r1);
                edit1ToEdit2 += r1.getNewLength() - r1.replaceRange.length;
            }
            const firstEdit1ToEdit2 = edit1ToEdit2;
            let firstIntersecting; // or touching
            let lastIntersecting; // or touching
            while (true) {
                const r1 = edit1Queue[0];
                if (!r1 || r1.replaceRange.start + edit1ToEdit2 > r2.replaceRange.endExclusive) {
                    break;
                }
                // else we intersect, because the new end of edit1 is after or equal to our start
                if (!firstIntersecting) {
                    firstIntersecting = r1;
                }
                lastIntersecting = r1;
                edit1Queue.shift();
                edit1ToEdit2 += r1.getNewLength() - r1.replaceRange.length;
            }
            if (!firstIntersecting) {
                result.push(r2.delta(-edit1ToEdit2));
            }
            else {
                const newReplaceRangeStart = Math.min(firstIntersecting.replaceRange.start, r2.replaceRange.start - firstEdit1ToEdit2);
                const prefixLength = r2.replaceRange.start - (firstIntersecting.replaceRange.start + firstEdit1ToEdit2);
                if (prefixLength > 0) {
                    const prefix = firstIntersecting.slice(OffsetRange.emptyAt(newReplaceRangeStart), new OffsetRange(0, prefixLength));
                    result.push(prefix);
                }
                if (!lastIntersecting) {
                    throw new BugIndicatingError(`Invariant violation: lastIntersecting is undefined`);
                }
                const suffixLength = (lastIntersecting.replaceRange.endExclusive + edit1ToEdit2) - r2.replaceRange.endExclusive;
                if (suffixLength > 0) {
                    const e = lastIntersecting.slice(OffsetRange.ofStartAndLength(lastIntersecting.replaceRange.endExclusive, 0), new OffsetRange(lastIntersecting.getNewLength() - suffixLength, lastIntersecting.getNewLength()));
                    edit1Queue.unshift(e);
                    edit1ToEdit2 -= e.getNewLength() - e.replaceRange.length;
                }
                const newReplaceRange = new OffsetRange(newReplaceRangeStart, r2.replaceRange.endExclusive - edit1ToEdit2);
                const middle = r2.slice(newReplaceRange, new OffsetRange(0, r2.getNewLength()));
                result.push(middle);
            }
        }
        while (true) {
            const item = edit1Queue.shift();
            if (!item) {
                break;
            }
            result.push(item);
        }
        return this._createNew(result).normalize();
    }
    decomposeSplit(shouldBeInE1) {
        const e1 = [];
        const e2 = [];
        let e2delta = 0;
        for (const edit of this.replacements) {
            if (shouldBeInE1(edit)) {
                e1.push(edit);
                e2delta += edit.getNewLength() - edit.replaceRange.length;
            }
            else {
                e2.push(edit.slice(edit.replaceRange.delta(e2delta), new OffsetRange(0, edit.getNewLength())));
            }
        }
        return { e1: this._createNew(e1), e2: this._createNew(e2) };
    }
    /**
     * Returns the range of each replacement in the applied value.
    */
    getNewRanges() {
        const ranges = [];
        let offset = 0;
        for (const e of this.replacements) {
            ranges.push(OffsetRange.ofStartAndLength(e.replaceRange.start + offset, e.getNewLength()));
            offset += e.getLengthDelta();
        }
        return ranges;
    }
    getJoinedReplaceRange() {
        if (this.replacements.length === 0) {
            return undefined;
        }
        return this.replacements[0].replaceRange.join(this.replacements.at(-1).replaceRange);
    }
    isEmpty() {
        return this.replacements.length === 0;
    }
    getLengthDelta() {
        return sumBy(this.replacements, (replacement) => replacement.getLengthDelta());
    }
    getNewDataLength(dataLength) {
        return dataLength + this.getLengthDelta();
    }
    applyToOffset(originalOffset) {
        let accumulatedDelta = 0;
        for (const r of this.replacements) {
            if (r.replaceRange.start <= originalOffset) {
                if (originalOffset < r.replaceRange.endExclusive) {
                    // the offset is in the replaced range
                    return r.replaceRange.start + accumulatedDelta;
                }
                accumulatedDelta += r.getNewLength() - r.replaceRange.length;
            }
            else {
                break;
            }
        }
        return originalOffset + accumulatedDelta;
    }
    applyToOffsetRange(originalRange) {
        return new OffsetRange(this.applyToOffset(originalRange.start), this.applyToOffset(originalRange.endExclusive));
    }
    applyInverseToOffset(postEditsOffset) {
        let accumulatedDelta = 0;
        for (const edit of this.replacements) {
            const editLength = edit.getNewLength();
            if (edit.replaceRange.start <= postEditsOffset - accumulatedDelta) {
                if (postEditsOffset - accumulatedDelta < edit.replaceRange.start + editLength) {
                    // the offset is in the replaced range
                    return edit.replaceRange.start;
                }
                accumulatedDelta += editLength - edit.replaceRange.length;
            }
            else {
                break;
            }
        }
        return postEditsOffset - accumulatedDelta;
    }
    /**
     * Return undefined if the originalOffset is within an edit
     */
    applyToOffsetOrUndefined(originalOffset) {
        let accumulatedDelta = 0;
        for (const edit of this.replacements) {
            if (edit.replaceRange.start <= originalOffset) {
                if (originalOffset < edit.replaceRange.endExclusive) {
                    // the offset is in the replaced range
                    return undefined;
                }
                accumulatedDelta += edit.getNewLength() - edit.replaceRange.length;
            }
            else {
                break;
            }
        }
        return originalOffset + accumulatedDelta;
    }
    /**
     * Return undefined if the originalRange is within an edit
     */
    applyToOffsetRangeOrUndefined(originalRange) {
        const start = this.applyToOffsetOrUndefined(originalRange.start);
        if (start === undefined) {
            return undefined;
        }
        const end = this.applyToOffsetOrUndefined(originalRange.endExclusive);
        if (end === undefined) {
            return undefined;
        }
        return new OffsetRange(start, end);
    }
}
export class BaseReplacement {
    constructor(
    /**
     * The range to be replaced.
    */
    replaceRange) {
        this.replaceRange = replaceRange;
    }
    delta(offset) {
        return this.slice(this.replaceRange.delta(offset), new OffsetRange(0, this.getNewLength()));
    }
    getLengthDelta() {
        return this.getNewLength() - this.replaceRange.length;
    }
    toString() {
        return `{ ${this.replaceRange.toString()} -> ${this.getNewLength()} }`;
    }
    get isEmpty() {
        return this.getNewLength() === 0 && this.replaceRange.length === 0;
    }
    getRangeAfterReplace() {
        return new OffsetRange(this.replaceRange.start, this.replaceRange.start + this.getNewLength());
    }
}
export class Edit extends BaseEdit {
    /**
     * Represents a set of edits to a string.
     * All these edits are applied at once.
    */
    static { this.empty = new Edit([]); }
    static create(replacements) {
        return new Edit(replacements);
    }
    static single(replacement) {
        return new Edit([replacement]);
    }
    _createNew(replacements) {
        return new Edit(replacements);
    }
}
export class AnnotationReplacement extends BaseReplacement {
    constructor(range, newLength, annotation) {
        super(range);
        this.newLength = newLength;
        this.annotation = annotation;
    }
    equals(other) {
        return this.replaceRange.equals(other.replaceRange) && this.newLength === other.newLength && this.annotation === other.annotation;
    }
    getNewLength() { return this.newLength; }
    tryJoinTouching(other) {
        if (this.annotation !== other.annotation) {
            return undefined;
        }
        return new AnnotationReplacement(this.replaceRange.joinRightTouching(other.replaceRange), this.newLength + other.newLength, this.annotation);
    }
    slice(range, rangeInReplacement) {
        return new AnnotationReplacement(range, rangeInReplacement ? rangeInReplacement.length : this.newLength, this.annotation);
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZWRpdC5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL2VkaXRvci9jb21tb24vY29yZS9lZGl0cy9lZGl0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sRUFBRSxLQUFLLEVBQUUsTUFBTSxtQ0FBbUMsQ0FBQztBQUMxRCxPQUFPLEVBQUUsa0JBQWtCLEVBQUUsTUFBTSxtQ0FBbUMsQ0FBQztBQUN2RSxPQUFPLEVBQUUsV0FBVyxFQUFFLE1BQU0sMEJBQTBCLENBQUM7QUFFdkQsOERBQThEO0FBQzlELE1BQU0sT0FBZ0IsUUFBUTtJQUM3QixZQUNpQixZQUEwQjtRQUExQixpQkFBWSxHQUFaLFlBQVksQ0FBYztRQUUxQyxJQUFJLFNBQVMsR0FBRyxDQUFDLENBQUMsQ0FBQztRQUNuQixLQUFLLE1BQU0sV0FBVyxJQUFJLFlBQVksRUFBRSxDQUFDO1lBQ3hDLElBQUksQ0FBQyxDQUFDLFdBQVcsQ0FBQyxZQUFZLENBQUMsS0FBSyxJQUFJLFNBQVMsQ0FBQyxFQUFFLENBQUM7Z0JBQ3BELE1BQU0sSUFBSSxrQkFBa0IsQ0FBQyw0Q0FBNEMsV0FBVyxVQUFVLFNBQVMsRUFBRSxDQUFDLENBQUM7WUFDNUcsQ0FBQztZQUNELFNBQVMsR0FBRyxXQUFXLENBQUMsWUFBWSxDQUFDLFlBQVksQ0FBQztRQUNuRCxDQUFDO0lBQ0YsQ0FBQztJQUlEOzs7O01BSUU7SUFDSyxNQUFNLENBQUMsS0FBWTtRQUN6QixJQUFJLElBQUksQ0FBQyxZQUFZLENBQUMsTUFBTSxLQUFLLEtBQUssQ0FBQyxZQUFZLENBQUMsTUFBTSxFQUFFLENBQUM7WUFDNUQsT0FBTyxLQUFLLENBQUM7UUFDZCxDQUFDO1FBQ0QsS0FBSyxJQUFJLENBQUMsR0FBRyxDQUFDLEVBQUUsQ0FBQyxHQUFHLElBQUksQ0FBQyxZQUFZLENBQUMsTUFBTSxFQUFFLENBQUMsRUFBRSxF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