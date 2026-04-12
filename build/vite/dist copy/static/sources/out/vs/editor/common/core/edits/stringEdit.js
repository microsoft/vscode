/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { commonPrefixLength, commonSuffixLength } from '../../../../base/common/strings.js';
import { OffsetRange } from '../ranges/offsetRange.js';
import { StringText } from '../text/abstractText.js';
import { BaseEdit, BaseReplacement } from './edit.js';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export class BaseStringEdit extends BaseEdit {
    get TReplacement() {
        throw new Error('TReplacement is not defined for BaseStringEdit');
    }
    static composeOrUndefined(edits) {
        if (edits.length === 0) {
            return undefined;
        }
        let result = edits[0];
        for (let i = 1; i < edits.length; i++) {
            // eslint-disable-next-line local/code-no-any-casts, @typescript-eslint/no-explicit-any
            result = result.compose(edits[i]);
        }
        return result;
    }
    /**
     * r := trySwap(e1, e2);
     * e1.compose(e2) === r.e1.compose(r.e2)
    */
    static trySwap(e1, e2) {
        // TODO make this more efficient
        const e1Inv = e1.inverseOnSlice((start, endEx) => ' '.repeat(endEx - start));
        const e1_ = e2.tryRebase(e1Inv);
        if (!e1_) {
            return undefined;
        }
        const e2_ = e1.tryRebase(e1_);
        if (!e2_) {
            return undefined;
        }
        return { e1: e1_, e2: e2_ };
    }
    apply(base) {
        const resultText = [];
        let pos = 0;
        for (const edit of this.replacements) {
            resultText.push(base.substring(pos, edit.replaceRange.start));
            resultText.push(edit.newText);
            pos = edit.replaceRange.endExclusive;
        }
        resultText.push(base.substring(pos));
        return resultText.join('');
    }
    /**
     * Creates an edit that reverts this edit.
     */
    inverseOnSlice(getOriginalSlice) {
        const edits = [];
        let offset = 0;
        for (const e of this.replacements) {
            edits.push(StringReplacement.replace(OffsetRange.ofStartAndLength(e.replaceRange.start + offset, e.newText.length), getOriginalSlice(e.replaceRange.start, e.replaceRange.endExclusive)));
            offset += e.newText.length - e.replaceRange.length;
        }
        return new StringEdit(edits);
    }
    /**
     * Creates an edit that reverts this edit.
     */
    inverse(original) {
        return this.inverseOnSlice((start, endEx) => original.substring(start, endEx));
    }
    rebaseSkipConflicting(base) {
        return this._tryRebase(base, false);
    }
    tryRebase(base) {
        return this._tryRebase(base, true);
    }
    _tryRebase(base, noOverlap) {
        const newEdits = [];
        let baseIdx = 0;
        let ourIdx = 0;
        let offset = 0;
        while (ourIdx < this.replacements.length || baseIdx < base.replacements.length) {
            // take the edit that starts first
            const baseEdit = base.replacements.at(baseIdx);
            const ourEdit = this.replacements.at(ourIdx);
            if (!ourEdit) {
                // We processed all our edits
                break;
            }
            else if (!baseEdit) {
                // no more edits from base
                const transformedRange = ourEdit.replaceRange.delta(offset);
                newEdits.push(new StringReplacement(transformedRange, ourEdit.newText));
                ourIdx++;
            }
            else if (ourEdit.replaceRange.intersects(baseEdit.replaceRange) ||
                areConcurrentInserts(ourEdit.replaceRange, baseEdit.replaceRange) ||
                isInsertStrictlyInsideRange(ourEdit.replaceRange, baseEdit.replaceRange) ||
                isInsertStrictlyInsideRange(baseEdit.replaceRange, ourEdit.replaceRange)) {
                ourIdx++; // Don't take our edit, as it is conflicting -> skip
                if (noOverlap) {
                    return undefined;
                }
            }
            else if (ourEdit.replaceRange.start < baseEdit.replaceRange.start ||
                (ourEdit.replaceRange.isEmpty && ourEdit.replaceRange.start === baseEdit.replaceRange.start)) {
                // Our edit starts first, or is an insert at the start of base's range
                const transformedRange = ourEdit.replaceRange.delta(offset);
                // Check if the transformed edit would violate the sorted/disjoint invariant
                newEdits.push(new StringReplacement(transformedRange, ourEdit.newText));
                ourIdx++;
            }
            else {
                baseIdx++;
                offset += baseEdit.newText.length - baseEdit.replaceRange.length;
            }
        }
        return new StringEdit(newEdits);
    }
    toJson() {
        return this.replacements.map(e => e.toJson());
    }
    isNeutralOn(text) {
        return this.replacements.every(e => e.isNeutralOn(text));
    }
    removeCommonSuffixPrefix(originalText) {
        const edits = [];
        for (const e of this.replacements) {
            const edit = e.removeCommonSuffixPrefix(originalText);
            if (!edit.isEmpty) {
                edits.push(edit);
            }
        }
        return new StringEdit(edits);
    }
    normalizeEOL(eol) {
        return new StringEdit(this.replacements.map(edit => edit.normalizeEOL(eol)));
    }
    /**
     * If `e1.apply(source) === e2.apply(source)`, then `e1.normalizeOnSource(source).equals(e2.normalizeOnSource(source))`.
    */
    normalizeOnSource(source) {
        const result = this.apply(source);
        const edit = StringReplacement.replace(OffsetRange.ofLength(source.length), result);
        const e = edit.removeCommonSuffixAndPrefix(source);
        if (e.isEmpty) {
            return StringEdit.empty;
        }
        return e.toEdit();
    }
    removeCommonSuffixAndPrefix(source) {
        return this._createNew(this.replacements.map(e => e.removeCommonSuffixAndPrefix(source))).normalize();
    }
    applyOnText(docContents) {
        return new StringText(this.apply(docContents.value));
    }
    mapData(f) {
        return new AnnotatedStringEdit(this.replacements.map(e => new AnnotatedStringReplacement(e.replaceRange, e.newText, f(e))));
    }
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export class BaseStringReplacement extends BaseReplacement {
    constructor(range, newText) {
        super(range);
        this.newText = newText;
    }
    getNewLength() { return this.newText.length; }
    toString() {
        return `${this.replaceRange} -> ${JSON.stringify(this.newText)}`;
    }
    replace(str) {
        return str.substring(0, this.replaceRange.start) + this.newText + str.substring(this.replaceRange.endExclusive);
    }
    /**
     * Checks if the edit would produce no changes when applied to the given text.
     */
    isNeutralOn(text) {
        return this.newText === text.substring(this.replaceRange.start, this.replaceRange.endExclusive);
    }
    removeCommonSuffixPrefix(originalText) {
        const oldText = originalText.substring(this.replaceRange.start, this.replaceRange.endExclusive);
        const prefixLen = commonPrefixLength(oldText, this.newText);
        const suffixLen = Math.min(oldText.length - prefixLen, this.newText.length - prefixLen, commonSuffixLength(oldText, this.newText));
        const replaceRange = new OffsetRange(this.replaceRange.start + prefixLen, this.replaceRange.endExclusive - suffixLen);
        const newText = this.newText.substring(prefixLen, this.newText.length - suffixLen);
        return new StringReplacement(replaceRange, newText);
    }
    normalizeEOL(eol) {
        const newText = this.newText.replace(/\r\n|\n/g, eol);
        return new StringReplacement(this.replaceRange, newText);
    }
    removeCommonSuffixAndPrefix(source) {
        return this.removeCommonSuffix(source).removeCommonPrefix(source);
    }
    removeCommonPrefix(source) {
        const oldText = this.replaceRange.substring(source);
        const prefixLen = commonPrefixLength(oldText, this.newText);
        if (prefixLen === 0) {
            return this;
        }
        return this.slice(this.replaceRange.deltaStart(prefixLen), new OffsetRange(prefixLen, this.newText.length));
    }
    removeCommonSuffix(source) {
        const oldText = this.replaceRange.substring(source);
        const suffixLen = commonSuffixLength(oldText, this.newText);
        if (suffixLen === 0) {
            return this;
        }
        return this.slice(this.replaceRange.deltaEnd(-suffixLen), new OffsetRange(0, this.newText.length - suffixLen));
    }
    toEdit() {
        return new StringEdit([this]);
    }
    toJson() {
        return ({
            txt: this.newText,
            pos: this.replaceRange.start,
            len: this.replaceRange.length,
        });
    }
}
/**
 * Represents a set of replacements to a string.
 * All these replacements are applied at once.
*/
export class StringEdit extends BaseStringEdit {
    /**
     * Parses an edit from its string representation.
     * E.g. [[2, 12) -> "fgh", [14, 20) -> "qrst", [22, 22) -> "de\n"]
    */
    static parse(toStringValue) {
        const replacements = [];
        const regex = /\[(\d+),\s*(\d+)\)\s*->\s*"([^"]*)"/g;
        let match;
        while ((match = regex.exec(toStringValue)) !== null) {
            const start = parseInt(match[1], 10);
            const endEx = parseInt(match[2], 10);
            const text = match[3].replace(/\\n/g, '\n').replace(/\\r/g, '\r').replace(/\\\\/g, '\\');
            replacements.push(new StringReplacement(new OffsetRange(start, endEx), text));
        }
        return new StringEdit(replacements);
    }
    static { this.empty = new StringEdit([]); }
    static create(replacements) {
        return new StringEdit(replacements);
    }
    static single(replacement) {
        return new StringEdit([replacement]);
    }
    static replace(range, replacement) {
        return new StringEdit([new StringReplacement(range, replacement)]);
    }
    static insert(offset, replacement) {
        return new StringEdit([new StringReplacement(OffsetRange.emptyAt(offset), replacement)]);
    }
    static delete(range) {
        return new StringEdit([new StringReplacement(range, '')]);
    }
    static fromJson(data) {
        return new StringEdit(data.map(StringReplacement.fromJson));
    }
    static compose(edits) {
        if (edits.length === 0) {
            return StringEdit.empty;
        }
        let result = edits[0];
        for (let i = 1; i < edits.length; i++) {
            result = result.compose(edits[i]);
        }
        return result;
    }
    /**
     * The replacements are applied in order!
     * Equals `StringEdit.compose(replacements.map(r => r.toEdit()))`, but is much more performant.
    */
    static composeSequentialReplacements(replacements) {
        let edit = StringEdit.empty;
        let curEditReplacements = []; // These are reverse sorted
        for (const r of replacements) {
            const last = curEditReplacements.at(-1);
            if (!last || r.replaceRange.isBefore(last.replaceRange)) {
                // Detect subsequences of reverse sorted replacements
                curEditReplacements.push(r);
            }
            else {
                // Once the subsequence is broken, compose the current replacements and look for a new subsequence.
                edit = edit.compose(StringEdit.create(curEditReplacements.reverse()));
                curEditReplacements = [r];
            }
        }
        edit = edit.compose(StringEdit.create(curEditReplacements.reverse()));
        return edit;
    }
    constructor(replacements) {
        super(replacements);
    }
    _createNew(replacements) {
        return new StringEdit(replacements);
    }
}
export class StringReplacement extends BaseStringReplacement {
    static insert(offset, text) {
        return new StringReplacement(OffsetRange.emptyAt(offset), text);
    }
    static replace(range, text) {
        return new StringReplacement(range, text);
    }
    static delete(range) {
        return new StringReplacement(range, '');
    }
    static fromJson(data) {
        return new StringReplacement(OffsetRange.ofStartAndLength(data.pos, data.len), data.txt);
    }
    equals(other) {
        return this.replaceRange.equals(other.replaceRange) && this.newText === other.newText;
    }
    tryJoinTouching(other) {
        return new StringReplacement(this.replaceRange.joinRightTouching(other.replaceRange), this.newText + other.newText);
    }
    slice(range, rangeInReplacement) {
        return new StringReplacement(range, rangeInReplacement ? rangeInReplacement.substring(this.newText) : this.newText);
    }
}
export function applyEditsToRanges(sortedRanges, edit) {
    sortedRanges = sortedRanges.slice();
    // treat edits as deletion of the replace range and then as insertion that extends the first range
    const result = [];
    let offset = 0;
    for (const e of edit.replacements) {
        while (true) {
            // ranges before the current edit
            const r = sortedRanges[0];
            if (!r || r.endExclusive >= e.replaceRange.start) {
                break;
            }
            sortedRanges.shift();
            result.push(r.delta(offset));
        }
        const intersecting = [];
        while (true) {
            const r = sortedRanges[0];
            if (!r || !r.intersectsOrTouches(e.replaceRange)) {
                break;
            }
            sortedRanges.shift();
            intersecting.push(r);
        }
        for (let i = intersecting.length - 1; i >= 0; i--) {
            let r = intersecting[i];
            const overlap = r.intersect(e.replaceRange).length;
            r = r.deltaEnd(-overlap + (i === 0 ? e.newText.length : 0));
            const rangeAheadOfReplaceRange = r.start - e.replaceRange.start;
            if (rangeAheadOfReplaceRange > 0) {
                r = r.delta(-rangeAheadOfReplaceRange);
            }
            if (i !== 0) {
                r = r.delta(e.newText.length);
            }
            // We already took our offset into account.
            // Because we add r back to the queue (which then adds offset again),
            // we have to remove it here.
            r = r.delta(-(e.newText.length - e.replaceRange.length));
            sortedRanges.unshift(r);
        }
        offset += e.newText.length - e.replaceRange.length;
    }
    while (true) {
        const r = sortedRanges[0];
        if (!r) {
            break;
        }
        sortedRanges.shift();
        result.push(r.delta(offset));
    }
    return result;
}
export class VoidEditData {
    join(other) {
        return this;
    }
}
/**
 * Represents a set of replacements to a string.
 * All these replacements are applied at once.
*/
export class AnnotatedStringEdit extends BaseStringEdit {
    static { this.empty = new AnnotatedStringEdit([]); }
    static create(replacements) {
        return new AnnotatedStringEdit(replacements);
    }
    static single(replacement) {
        return new AnnotatedStringEdit([replacement]);
    }
    static replace(range, replacement, data) {
        return new AnnotatedStringEdit([new AnnotatedStringReplacement(range, replacement, data)]);
    }
    static insert(offset, replacement, data) {
        return new AnnotatedStringEdit([new AnnotatedStringReplacement(OffsetRange.emptyAt(offset), replacement, data)]);
    }
    static delete(range, data) {
        return new AnnotatedStringEdit([new AnnotatedStringReplacement(range, '', data)]);
    }
    static compose(edits) {
        if (edits.length === 0) {
            return AnnotatedStringEdit.empty;
        }
        let result = edits[0];
        for (let i = 1; i < edits.length; i++) {
            result = result.compose(edits[i]);
        }
        return result;
    }
    constructor(replacements) {
        super(replacements);
    }
    _createNew(replacements) {
        return new AnnotatedStringEdit(replacements);
    }
    toStringEdit(filter) {
        const newReplacements = [];
        for (const r of this.replacements) {
            if (!filter || filter(r)) {
                newReplacements.push(new StringReplacement(r.replaceRange, r.newText));
            }
        }
        return new StringEdit(newReplacements);
    }
}
export class AnnotatedStringReplacement extends BaseStringReplacement {
    static insert(offset, text, data) {
        return new AnnotatedStringReplacement(OffsetRange.emptyAt(offset), text, data);
    }
    static replace(range, text, data) {
        return new AnnotatedStringReplacement(range, text, data);
    }
    static delete(range, data) {
        return new AnnotatedStringReplacement(range, '', data);
    }
    constructor(range, newText, data) {
        super(range, newText);
        this.data = data;
    }
    equals(other) {
        return this.replaceRange.equals(other.replaceRange) && this.newText === other.newText && this.data === other.data;
    }
    tryJoinTouching(other) {
        const joined = this.data.join(other.data);
        if (joined === undefined) {
            return undefined;
        }
        return new AnnotatedStringReplacement(this.replaceRange.joinRightTouching(other.replaceRange), this.newText + other.newText, joined);
    }
    slice(range, rangeInReplacement) {
        return new AnnotatedStringReplacement(range, rangeInReplacement ? rangeInReplacement.substring(this.newText) : this.newText, this.data);
    }
}
/**
 * Returns true if both ranges are empty (inserts) at the exact same position.
 * In this case, although they don't "intersect" in the traditional sense,
 * they conflict because the order of insertion matters.
 */
function areConcurrentInserts(r1, r2) {
    return r1.isEmpty && r2.isEmpty && r1.start === r2.start;
}
/**
 * Returns true if `insert` is an empty range (insert) strictly inside `range`.
 * For example, insert at position 5 is inside [3, 7) but not inside [5, 7) or [3, 5).
 */
function isInsertStrictlyInsideRange(insert, range) {
    return insert.isEmpty && range.start < insert.start && insert.start < range.endExclusive;
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic3RyaW5nRWRpdC5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL2VkaXRvci9jb21tb24vY29yZS9lZGl0cy9zdHJpbmdFZGl0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sRUFBRSxrQkFBa0IsRUFBRSxrQkFBa0IsRUFBRSxNQUFNLG9DQUFvQyxDQUFDO0FBQzVGLE9BQU8sRUFBRSxXQUFXLEVBQUUsTUFBTSwwQkFBMEIsQ0FBQztBQUN2RCxPQUFPLEVBQUUsVUFBVSxFQUFFLE1BQU0seUJBQXlCLENBQUM7QUFDckQsT0FBTyxFQUFFLFFBQVEsRUFBRSxlQUFlLEVBQUUsTUFBTSxXQUFXLENBQUM7QUFHdEQsOERBQThEO0FBQzlELE1BQU0sT0FBZ0IsY0FBbUosU0FBUSxRQUFrQjtJQUNsTSxJQUFJLFlBQVk7UUFDZixNQUFNLElBQUksS0FBSyxDQUFDLGdEQUFnRCxDQUFDLENBQUM7SUFDbkUsQ0FBQztJQUVNLE1BQU0sQ0FBQyxrQkFBa0IsQ0FBMkIsS0FBbUI7UUFDN0UsSUFBSSxLQUFLLENBQUMsTUFBTSxLQUFLLENBQUMsRUFBRSxDQUFDO1lBQ3hCLE9BQU8sU0FBUyxDQUFDO1FBQ2xCLENBQUM7UUFDRCxJQUFJLE1BQU0sR0FBRyxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFDdEIsS0FBSyxJQUFJLENBQUMsR0FBRyxDQUFDLEVBQUUsQ0FBQyxHQUFHLEtBQUssQ0FBQyxNQUFNLEVBQUUsQ0FBQyxFQUFFLEVBQUUsQ0FBQztZQUN2Qyx1RkFBdUY7WUFDdkYsTUFBTSxHQUFHLE1BQU0sQ0FBQyxPQUFPLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFRLENBQUM7UUFDMUMsQ0FBQztRQUNELE9BQU8sTUFBTSxDQUFDO0lBQ2YsQ0FBQztJQUVEOzs7TUFHRTtJQUNLLE1BQU0sQ0FBQyxPQUFPLENBQUMsRUFBa0Is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