/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { OffsetRange } from '../ranges/offsetRange.js';
import { BaseEdit, BaseReplacement } from './edit.js';
/**
 * Represents a set of replacements to an array.
 * All these replacements are applied at once.
*/
export class ArrayEdit extends BaseEdit {
    static { this.empty = new ArrayEdit([]); }
    static create(replacements) {
        return new ArrayEdit(replacements);
    }
    static single(replacement) {
        return new ArrayEdit([replacement]);
    }
    static replace(range, replacement) {
        return new ArrayEdit([new ArrayReplacement(range, replacement)]);
    }
    static insert(offset, replacement) {
        return new ArrayEdit([new ArrayReplacement(OffsetRange.emptyAt(offset), replacement)]);
    }
    static delete(range) {
        return new ArrayEdit([new ArrayReplacement(range, [])]);
    }
    _createNew(replacements) {
        return new ArrayEdit(replacements);
    }
    apply(data) {
        const resultData = [];
        let pos = 0;
        for (const edit of this.replacements) {
            resultData.push(...data.slice(pos, edit.replaceRange.start));
            resultData.push(...edit.newValue);
            pos = edit.replaceRange.endExclusive;
        }
        resultData.push(...data.slice(pos));
        return resultData;
    }
    /**
     * Creates an edit that reverts this edit.
     */
    inverse(baseVal) {
        const edits = [];
        let offset = 0;
        for (const e of this.replacements) {
            edits.push(new ArrayReplacement(OffsetRange.ofStartAndLength(e.replaceRange.start + offset, e.newValue.length), baseVal.slice(e.replaceRange.start, e.replaceRange.endExclusive)));
            offset += e.newValue.length - e.replaceRange.length;
        }
        return new ArrayEdit(edits);
    }
}
export class ArrayReplacement extends BaseReplacement {
    constructor(range, newValue) {
        super(range);
        this.newValue = newValue;
    }
    equals(other) {
        return this.replaceRange.equals(other.replaceRange) && this.newValue.length === other.newValue.length && this.newValue.every((v, i) => v === other.newValue[i]);
    }
    getNewLength() { return this.newValue.length; }
    tryJoinTouching(other) {
        return new ArrayReplacement(this.replaceRange.joinRightTouching(other.replaceRange), this.newValue.concat(other.newValue));
    }
    slice(range, rangeInReplacement) {
        return new ArrayReplacement(range, rangeInReplacement.slice(this.newValue));
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYXJyYXlFZGl0LmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvZWRpdG9yL2NvbW1vbi9jb3JlL2VkaXRzL2FycmF5RWRpdC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRyxPQUFPLEVBQUUsV0FBVyxFQUFFLE1BQU0sMEJBQTBCLENBQUM7QUFDdkQsT0FBTyxFQUFFLFFBQVEsRUFBRSxlQUFlLEVBQUUsTUFBTSxXQUFXLENBQUM7QUFFdEQ7OztFQUdFO0FBQ0YsTUFBTSxPQUFPLFNBQWEsU0FBUSxRQUEyQzthQUNyRCxVQUFLLEdBQUcsSUFBSSxTQUFTLENBQVEsRUFBRSxDQUFDLENBQUM7SUFFakQsTUFBTSxDQUFDLE1BQU0sQ0FBSSxZQUE0QztRQUNuRSxPQUFPLElBQUksU0FBUyxDQUFDLFlBQVksQ0FBQyxDQUFDO0lBQ3BDLENBQUM7SUFFTSxNQUFNLENBQUMsTUFBTSxDQUFJLFdBQWdDO1FBQ3ZELE9BQU8sSUFBSSxTQUFTLENBQUMsQ0FBQyxXQUFXLENBQUMsQ0FBQyxDQUFDO0lBQ3JDLENBQUM7SUFFTSxNQUFNLENBQUMsT0FBTyxDQUFJLEtBQWtCLEVBQUUsV0FBeUI7UUFDckUsT0FBTyxJQUFJLFNBQVMsQ0FBQyxDQUFDLElBQUksZ0JBQWdCLENBQUMsS0FBSyxFQUFFLFdBQVcsQ0FBQyxDQUFDLENBQUMsQ0FBQztJQUNsRSxDQUFDO0lBRU0sTUFBTSxDQUFDLE1BQU0sQ0FBSSxNQUFjLEVBQUUsV0FBeUI7UUFDaEUsT0FBTyxJQUFJLFNBQVMsQ0FBQyxDQUFDLElBQUksZ0JBQWdCLENBQUMsV0FBVyxDQUFDLE9BQU8sQ0FBQyxNQUFNLENBQUMsRUFBRSxXQUFXLENBQUMsQ0FBQyxDQUFDLENBQUM7SUFDeEYsQ0FBQztJQUVNLE1BQU0sQ0FBQyxNQUFNLENBQUksS0FBa0I7UUFDekMsT0FBTyxJQUFJLFNBQVMsQ0FBQyxDQUFD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