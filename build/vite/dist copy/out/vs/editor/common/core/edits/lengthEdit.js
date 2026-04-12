/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { OffsetRange } from '../ranges/offsetRange.js';
import { BaseEdit, BaseReplacement } from './edit.js';
/**
 * Like a normal edit, but only captures the length information.
*/
export class LengthEdit extends BaseEdit {
    static { this.empty = new LengthEdit([]); }
    static fromEdit(edit) {
        return new LengthEdit(edit.replacements.map(r => new LengthReplacement(r.replaceRange, r.getNewLength())));
    }
    static create(replacements) {
        return new LengthEdit(replacements);
    }
    static single(replacement) {
        return new LengthEdit([replacement]);
    }
    static replace(range, newLength) {
        return new LengthEdit([new LengthReplacement(range, newLength)]);
    }
    static insert(offset, newLength) {
        return new LengthEdit([new LengthReplacement(OffsetRange.emptyAt(offset), newLength)]);
    }
    static delete(range) {
        return new LengthEdit([new LengthReplacement(range, 0)]);
    }
    static compose(edits) {
        let e = LengthEdit.empty;
        for (const edit of edits) {
            e = e.compose(edit);
        }
        return e;
    }
    /**
     * Creates an edit that reverts this edit.
     */
    inverse() {
        const edits = [];
        let offset = 0;
        for (const e of this.replacements) {
            edits.push(new LengthReplacement(OffsetRange.ofStartAndLength(e.replaceRange.start + offset, e.newLength), e.replaceRange.length));
            offset += e.newLength - e.replaceRange.length;
        }
        return new LengthEdit(edits);
    }
    _createNew(replacements) {
        return new LengthEdit(replacements);
    }
    applyArray(arr, fillItem) {
        const newArr = new Array(this.getNewDataLength(arr.length));
        let srcPos = 0;
        let dstPos = 0;
        for (const replacement of this.replacements) {
            // Copy items before the current replacement
            for (let i = srcPos; i < replacement.replaceRange.start; i++) {
                newArr[dstPos++] = arr[i];
            }
            // Skip the replaced items in the source array
            srcPos = replacement.replaceRange.endExclusive;
            // Fill with the provided fillItem for insertions
            for (let i = 0; i < replacement.newLength; i++) {
                newArr[dstPos++] = fillItem;
            }
        }
        // Copy any remaining items from the original array
        while (srcPos < arr.length) {
            newArr[dstPos++] = arr[srcPos++];
        }
        return newArr;
    }
}
export class LengthReplacement extends BaseReplacement {
    static create(startOffset, endOffsetExclusive, newLength) {
        return new LengthReplacement(new OffsetRange(startOffset, endOffsetExclusive), newLength);
    }
    constructor(range, newLength) {
        super(range);
        this.newLength = newLength;
    }
    equals(other) {
        return this.replaceRange.equals(other.replaceRange) && this.newLength === other.newLength;
    }
    getNewLength() { return this.newLength; }
    tryJoinTouching(other) {
        return new LengthReplacement(this.replaceRange.joinRightTouching(other.replaceRange), this.newLength + other.newLength);
    }
    slice(range, rangeInReplacement) {
        return new LengthReplacement(range, rangeInReplacement.length);
    }
    toString() {
        return `[${this.replaceRange.start}, +${this.replaceRange.length}) -> +${this.newLength}}`;
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibGVuZ3RoRWRpdC5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL2VkaXRvci9jb21tb24vY29yZS9lZGl0cy9sZW5ndGhFZGl0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sRUFBRSxXQUFXLEVBQUUsTUFBTSwwQkFBMEIsQ0FBQztBQUN2RCxPQUFPLEVBQVcsUUFBUSxFQUFFLGVBQWUsRUFBRSxNQUFNLFdBQVcsQ0FBQztBQUUvRDs7RUFFRTtBQUNGLE1BQU0sT0FBTyxVQUFXLFNBQVEsUUFBdUM7YUFDL0MsVUFBSyxHQUFHLElBQUksVUFBVSxDQUFDLEVBQUUsQ0FBQyxDQUFDO0lBRTNDLE1BQU0sQ0FBQyxRQUFRLENBQUMsSUFBYTtRQUNuQyxPQUFPLElBQUksVUFBVSxDQUFDLElBQUksQ0FBQyxZQUFZLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsSUFBSSxpQkFBaUIsQ0FBQyxDQUFDLENBQUMsWUFBWSxFQUFFLENBQUMsQ0FBQyxZQUFZLEVBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQztJQUM1RyxDQUFDO0lBRU0sTUFBTSxDQUFDLE1BQU0sQ0FBQyxZQUEwQztRQUM5RCxPQUFPLElBQUksVUFBVSxDQUFDLFlBQVksQ0FBQyxDQUFDO0lBQ3JDLENBQUM7SUFFTSxNQUFNLENBQUMsTUFBTSxDQUFDLFdBQThCO1FBQ2xELE9BQU8sSUFBSSxVQUFVLENBQUMsQ0FBQyxXQUFXLENBQUMsQ0FBQyxDQUFDO0lBQ3RDLENBQUM7SUFFTSxNQUFNLENBQUMsT0FBTyxDQUFDLEtBQWtCLEVBQUUsU0FBaUI7UUFDMUQsT0FBTyxJQUFJLFVBQVUsQ0FBQyxDQUFDLElBQUksaUJBQWlCLENBQUMsS0FBSyxFQUFFLFNBQVMsQ0FBQyxDQUFDLENBQUMsQ0FBQztJQUNsRSxDQUFDO0lBRU0sTUFBTSxDQUFDLE1BQU0sQ0FBQyxN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