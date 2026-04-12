/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
export var FoldSource;
(function (FoldSource) {
    FoldSource[FoldSource["provider"] = 0] = "provider";
    FoldSource[FoldSource["userDefined"] = 1] = "userDefined";
    FoldSource[FoldSource["recovered"] = 2] = "recovered";
})(FoldSource || (FoldSource = {}));
export const foldSourceAbbr = {
    [0 /* FoldSource.provider */]: ' ',
    [1 /* FoldSource.userDefined */]: 'u',
    [2 /* FoldSource.recovered */]: 'r',
};
export const MAX_FOLDING_REGIONS = 0xFFFF;
export const MAX_LINE_NUMBER = 0xFFFFFF;
const MASK_INDENT = 0xFF000000;
class BitField {
    constructor(size) {
        const numWords = Math.ceil(size / 32);
        this._states = new Uint32Array(numWords);
    }
    get(index) {
        const arrayIndex = (index / 32) | 0;
        const bit = index % 32;
        return (this._states[arrayIndex] & (1 << bit)) !== 0;
    }
    set(index, newState) {
        const arrayIndex = (index / 32) | 0;
        const bit = index % 32;
        const value = this._states[arrayIndex];
        if (newState) {
            this._states[arrayIndex] = value | (1 << bit);
        }
        else {
            this._states[arrayIndex] = value & ~(1 << bit);
        }
    }
}
export class FoldingRegions {
    constructor(startIndexes, endIndexes, types) {
        if (startIndexes.length !== endIndexes.length || startIndexes.length > MAX_FOLDING_REGIONS) {
            throw new Error('invalid startIndexes or endIndexes size');
        }
        this._startIndexes = startIndexes;
        this._endIndexes = endIndexes;
        this._collapseStates = new BitField(startIndexes.length);
        this._userDefinedStates = new BitField(startIndexes.length);
        this._recoveredStates = new BitField(startIndexes.length);
        this._types = types;
        this._parentsComputed = false;
    }
    ensureParentIndices() {
        if (!this._parentsComputed) {
            this._parentsComputed = true;
            const parentIndexes = [];
            const isInsideLast = (startLineNumber, endLineNumber) => {
                const index = parentIndexes[parentIndexes.length - 1];
                return this.getStartLineNumber(index) <= startLineNumber && this.getEndLineNumber(index) >= endLineNumber;
            };
            for (let i = 0, len = this._startIndexes.length; i < len; i++) {
                const startLineNumber = this._startIndexes[i];
                const endLineNumber = this._endIndexes[i];
                if (startLineNumber > MAX_LINE_NUMBER || endLineNumber > MAX_LINE_NUMBER) {
                    throw new Error('startLineNumber or endLineNumber must not exceed ' + MAX_LINE_NUMBER);
                }
                while (parentIndexes.length > 0 && !isInsideLast(startLineNumber, endLineNumber)) {
                    parentIndexes.pop();
                }
                const parentIndex = parentIndexes.length > 0 ? parentIndexes[parentIndexes.length - 1] : -1;
                parentIndexes.push(i);
                this._startIndexes[i] = startLineNumber + ((parentIndex & 0xFF) << 24);
                this._endIndexes[i] = endLineNumber + ((parentIndex & 0xFF00) << 16);
            }
        }
    }
    get length() {
        return this._startIndexes.length;
    }
    getStartLineNumber(index) {
        return this._startIndexes[index] & MAX_LINE_NUMBER;
    }
    getEndLineNumber(index) {
        return this._endIndexes[index] & MAX_LINE_NUMBER;
    }
    getType(index) {
        return this._types ? this._types[index] : undefined;
    }
    hasTypes() {
        return !!this._types;
    }
    isCollapsed(index) {
        return this._collapseStates.get(index);
    }
    setCollapsed(index, newState) {
        this._collapseStates.set(index, newState);
    }
    isUserDefined(index) {
        return this._userDefinedStates.get(index);
    }
    setUserDefined(index, newState) {
        return this._userDefinedStates.set(index, newState);
    }
    isRecovered(index) {
        return this._recoveredStates.get(index);
    }
    setRecovered(index, newState) {
        return this._recoveredStates.set(index, newState);
    }
    getSource(index) {
        if (this.isUserDefined(index)) {
            return 1 /* FoldSource.userDefined */;
        }
        else if (this.isRecovered(index)) {
            return 2 /* FoldSource.recovered */;
        }
        return 0 /* FoldSource.provider */;
    }
    setSource(index, source) {
        if (source === 1 /* FoldSource.userDefined */) {
            this.setUserDefined(index, true);
            this.setRecovered(index, false);
        }
        else if (source === 2 /* FoldSource.recovered */) {
            this.setUserDefined(index, false);
            this.setRecovered(index, true);
        }
        else {
            this.setUserDefined(index, false);
            this.setRecovered(index, false);
        }
    }
    setCollapsedAllOfType(type, newState) {
        let hasChanged = false;
        if (this._types) {
            for (let i = 0; i < this._types.length; i++) {
                if (this._types[i] === type) {
                    this.setCollapsed(i, newState);
                    hasChanged = true;
                }
            }
        }
        return hasChanged;
    }
    toRegion(index) {
        return new FoldingRegion(this, index);
    }
    getParentIndex(index) {
        this.ensureParentIndices();
        const parent = ((this._startIndexes[index] & MASK_INDENT) >>> 24) + ((this._endIndexes[index] & MASK_INDENT) >>> 16);
        if (parent === MAX_FOLDING_REGIONS) {
            return -1;
        }
        return parent;
    }
    contains(index, line) {
        return this.getStartLineNumber(index) <= line && this.getEndLineNumber(index) >= line;
    }
    findIndex(line) {
        let low = 0, high = this._startIndexes.length;
        if (high === 0) {
            return -1; // no children
        }
        while (low < high) {
            const mid = Math.floor((low + high) / 2);
            if (line < this.getStartLineNumber(mid)) {
                high = mid;
            }
            else {
                low = mid + 1;
            }
        }
        return low - 1;
    }
    findRange(line) {
        let index = this.findIndex(line);
        if (index >= 0) {
            const endLineNumber = this.getEndLineNumber(index);
            if (endLineNumber >= line) {
                return index;
            }
            index = this.getParentIndex(index);
            while (index !== -1) {
                if (this.contains(index, line)) {
                    return index;
                }
                index = this.getParentIndex(index);
            }
        }
        return -1;
    }
    toString() {
        const res = [];
        for (let i = 0; i < this.length; i++) {
            res[i] = `[${foldSourceAbbr[this.getSource(i)]}${this.isCollapsed(i) ? '+' : '-'}] ${this.getStartLineNumber(i)}/${this.getEndLineNumber(i)}`;
        }
        return res.join(', ');
    }
    toFoldRange(index) {
        return {
            startLineNumber: this._startIndexes[index] & MAX_LINE_NUMBER,
            endLineNumber: this._endIndexes[index] & MAX_LINE_NUMBER,
            type: this._types ? this._types[index] : undefined,
            isCollapsed: this.isCollapsed(index),
            source: this.getSource(index)
        };
    }
    static fromFoldRanges(ranges) {
        const rangesLength = ranges.length;
        const startIndexes = new Uint32Array(rangesLength);
        const endIndexes = new Uint32Array(rangesLength);
        let types = [];
        let gotTypes = false;
        for (let i = 0; i < rangesLength; i++) {
            const range = ranges[i];
            startIndexes[i] = range.startLineNumber;
            endIndexes[i] = range.endLineNumber;
            types.push(range.type);
            if (range.type) {
                gotTypes = true;
            }
        }
        if (!gotTypes) {
            types = undefined;
        }
        const regions = new FoldingRegions(startIndexes, endIndexes, types);
        for (let i = 0; i < rangesLength; i++) {
            if (ranges[i].isCollapsed) {
                regions.setCollapsed(i, true);
            }
            regions.setSource(i, ranges[i].source);
        }
        return regions;
    }
    /**
     * Two inputs, each a FoldingRegions or a FoldRange[], are merged.
     * Each input must be pre-sorted on startLineNumber.
     * The first list is assumed to always include all regions currently defined by range providers.
     * The second list only contains the previously collapsed and all manual ranges.
     * If the line position matches, the range of the new range is taken, and the range is no longer manual
     * When an entry in one list overlaps an entry in the other, the second list's entry "wins" and
     * overlapping entries in the first list are discarded.
     * Invalid entries are discarded. An entry is invalid if:
     * 		the start and end line numbers aren't a valid range of line numbers,
     * 		it is out of sequence or has the same start line as a preceding entry,
     * 		it overlaps a preceding entry and is not fully contained by that entry.
     */
    static sanitizeAndMerge(rangesA, rangesB, maxLineNumber, selection) {
        maxLineNumber = maxLineNumber ?? Number.MAX_VALUE;
        const getIndexedFunction = (r, limit) => {
            return Array.isArray(r)
                ? ((i) => { return (i < limit) ? r[i] : undefined; })
                : ((i) => { return (i < limit) ? r.toFoldRange(i) : undefined; });
        };
        const getA = getIndexedFunction(rangesA, rangesA.length);
        const getB = getIndexedFunction(rangesB, rangesB.length);
        let indexA = 0;
        let indexB = 0;
        let nextA = getA(0);
        let nextB = getB(0);
        const stackedRanges = [];
        let topStackedRange;
        let prevLineNumber = 0;
        const resultRanges = [];
        while (nextA || nextB) {
            let useRange = undefined;
            if (nextB && (!nextA || nextA.startLineNumber >= nextB.startLineNumber)) {
                if (nextA && nextA.startLineNumber === nextB.startLineNumber) {
                    if (nextB.source === 1 /* FoldSource.userDefined */) {
                        // a user defined range (possibly unfolded)
                        useRange = nextB;
                    }
                    else {
                        // a previously folded range or a (possibly unfolded) recovered range
                        useRange = nextA;
                        // stays collapsed if the range still has the same number of lines or the selection is not in the range or after it
                        useRange.isCollapsed = nextB.isCollapsed && (nextA.endLineNumber === nextB.endLineNumber || !selection?.startsInside(nextA.startLineNumber + 1, nextA.endLineNumber + 1));
                        useRange.source = 0 /* FoldSource.provider */;
                    }
                    nextA = getA(++indexA); // not necessary, just for speed
                }
                else {
                    useRange = nextB;
                    if (nextB.isCollapsed && nextB.source === 0 /* FoldSource.provider */) {
                        // a previously collapsed range
                        useRange.source = 2 /* FoldSource.recovered */;
                    }
                }
                nextB = getB(++indexB);
            }
            else {
                // nextA is next. The user folded B set takes precedence and we sometimes need to look
                // ahead in it to check for an upcoming conflict.
                let scanIndex = indexB;
                let prescanB = nextB;
                while (true) {
                    if (!prescanB || prescanB.startLineNumber > nextA.endLineNumber) {
                        useRange = nextA;
                        break; // no conflict, use this nextA
                    }
                    if (prescanB.source === 1 /* FoldSource.userDefined */ && prescanB.endLineNumber > nextA.endLineNumber) {
                        // we found a user folded range, it wins
                        break; // without setting nextResult, so this nextA gets skipped
                    }
                    prescanB = getB(++scanIndex);
                }
                nextA = getA(++indexA);
            }
            if (useRange) {
                while (topStackedRange
                    && topStackedRange.endLineNumber < useRange.startLineNumber) {
                    topStackedRange = stackedRanges.pop();
                }
                if (useRange.endLineNumber > useRange.startLineNumber
                    && useRange.startLineNumber > prevLineNumber
                    && useRange.endLineNumber <= maxLineNumber
                    && (!topStackedRange
                        || topStackedRange.endLineNumber >= useRange.endLineNumber)) {
                    resultRanges.push(useRange);
                    prevLineNumber = useRange.startLineNumber;
                    if (topStackedRange) {
                        stackedRanges.push(topStackedRange);
                    }
                    topStackedRange = useRange;
                }
            }
        }
        return resultRanges;
    }
}
export class FoldingRegion {
    constructor(ranges, index) {
        this.ranges = ranges;
        this.index = index;
    }
    get startLineNumber() {
        return this.ranges.getStartLineNumber(this.index);
    }
    get endLineNumber() {
        return this.ranges.getEndLineNumber(this.index);
    }
    get regionIndex() {
        return this.index;
    }
    get parentIndex() {
        return this.ranges.getParentIndex(this.index);
    }
    get isCollapsed() {
        return this.ranges.isCollapsed(this.index);
    }
    containedBy(range) {
        return range.startLineNumber <= this.startLineNumber && range.endLineNumber >= this.endLineNumber;
    }
    containsLine(lineNumber) {
        return this.startLineNumber <= lineNumber && lineNumber <= this.endLineNumber;
    }
    hidesLine(lineNumber) {
        return this.startLineNumber < lineNumber && lineNumber <= this.endLineNumber;
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZm9sZGluZ1Jhbmdlcy5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL2VkaXRvci9jb250cmliL2ZvbGRpbmcvYnJvd3Nlci9mb2xkaW5nUmFuZ2VzLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBU2hHLE1BQU0sQ0FBTixJQUFrQixVQUlqQjtBQUpELFdBQWtCLFVBQVU7SUFDM0IsbURBQVksQ0FBQTtJQUNaLHlEQUFlLENBQUE7SUFDZixxREFBYSxDQUFBO0FBQ2QsQ0FBQyxFQUppQixVQUFVLEtBQVYsVUFBVSxRQUkzQjtBQUVELE1BQU0sQ0FBQyxNQUFNLGNBQWMsR0FBRztJQUM3Qiw2QkFBcUIsRUFBRSxHQUFHO0lBQzFCLGdDQUF3QixFQUFFLEdBQUc7SUFDN0IsOEJBQXNCLEVBQUUsR0FBRztDQUMzQixDQUFDO0FBVUYsTUFBTSxDQUFDLE1BQU0sbUJBQW1CLEdBQUcsTUFBTSxDQUFDO0FBQzFDLE1BQU0sQ0FBQyxNQUFNLGVBQWUsR0FBRyxRQUFRLENBQUM7QUFFeEMsTUFBTSxXQUFXLEdBQUcsVUFBVSxDQUFDO0FBRS9CLE1BQU0sUUFBUTtJQUViLFlBQVksSUFBWTtRQUN2QixNQUFNLFFBQVEsR0FBRyxJQUFJLENBQUMsSUFBSSxDQUFDLElBQUksR0FBRyxFQUFFLENBQUMsQ0FBQztRQUN0QyxJQUFJLENBQUMsT0FBTyxHQUFHLElBQUksV0FBVyxDQUFDLFFBQVEsQ0FBQyxDQUFDO0lBQzFDLENBQUM7SUFFTSxHQUFHLENBQUMsS0FBYTtRQUN2QixNQUFNLFVBQVUsR0FBRyxDQUFDLEtBQUssR0FBRyxFQUFFLENBQUMsR0FBRyxDQUFDLENBQUM7UUFDcEMsTUFBTSxHQUFHLEdBQUcsS0FBSyxHQUFHLEVBQUUsQ0FBQztRQUN2QixPQUFPLENBQUMsSUFBSSxDQUFDLE9BQU8sQ0FBQyxVQUFVLENBQUMsR0FBRyxDQUFDLENBQUMsSUFBSSxHQUFHLENBQUMsQ0FBQyxLQUFLLENBQUMsQ0FBQztJQUN0RCxDQUFDO0lBRU0sR0FBRyxDQUFDLEtBQWEsRUFBRSxRQUFpQjtRQUMxQyxNQUFNLFVBQVUsR0FBRyxDQUFDLEtBQUssR0FBRyxFQUFFLENBQUMsR0FBRyxDQUFDLENBQUM7UUFDcEMsTUFBTSxHQUFHLEdBQUcsS0FBSyxHQUFHLEVBQUUsQ0FBQztRQUN2QixNQUFNLEtBQUssR0FBRyxJQUFJLENBQUMsT0FBTyxDQUFDLFVBQVUsQ0FBQyxDQUFDO1FBQ3ZDLElBQUksUUFBUSxFQUFFLENBQUM7WUFDZCxJQUFJLENBQUMsT0FBTyxDQUFDLFVBQVUsQ0FBQyxHQUFHLEtBQUssR0FBRyxDQUFDLENBQUMsSUFBSSxHQUFHLENBQUMsQ0FBQztRQUMvQyxDQUFDO2FBQU0sQ0FBQztZQUNQLElBQUksQ0FBQyxPQUFPLENBQUMsVUFBVSxDQUFDLEdBQUcsS0FBSyxHQUFHLENBQUMsQ0FBQyxDQUFDLElBQUksR0FBRyxDQUFDLENBQUM7UUFDaEQsQ0FBQztJQUNGLENBQUM7Q0FDRDtBQUVELE1BQU0sT0FBTyxjQUFjO0lBVTFCLFlBQVksWUFBeUIsRUFBRSxVQUF1QixFQUFFLEtBQWlDO1FBQ2hHLElBQUksWUFBWSxDQUFDLE1BQU0sS0FBSyxVQUFVLENBQUMsTUFBTSxJQUFJLFlBQVksQ0FBQyxNQUFNLEdBQUcsbUJBQW1CLEVBQUUsQ0FBQztZQUM1RixNQUFNLElBQUksS0FBSyxDQUFDLHlDQUF5QyxDQUFDLENBQUM7UUFDNUQsQ0FBQztRQUNELElBQUksQ0FBQyxhQUFhLEdBQUcsWUFBWSxDQUFDO1FBQ2xDLElBQUksQ0FBQyxXQUFXLEdBQUcsVUFBVSxDQUFDO1FBQzlCLElBQUksQ0FBQyxlQUFlLEdBQUcsSUFBSSxRQUFRLENBQUMsWUFBWSxDQUFDLE1BQU0sQ0FBQyxDQUFDO1FBQ3pELElBQUksQ0FBQyxrQkFBa0IsR0FBRyxJQUFJLFFBQVEsQ0FBQyxZQUFZLENBQUMsTUFBTSxDQUFDLENBQUM7UUFDNUQsSUFBSSxDQUFDLGdCQUFnQixHQUFHLElBQUksUUFBUSxDQUFDLFlBQVksQ0FBQyxNQUFNLENBQUMsQ0FBQztRQUMxRCxJQUFJLENBQUMsTUFBTSxHQUFHLEtBQUssQ0FBQztRQUNwQixJQUFJLENBQUMsZ0JBQWdCLEdBQUcsS0FBSyxDQUFDO0lBQy9CLENBQUM7SUFFTyxtQkFBbUI7UUFDMUIsSUFBSSxDQUFDLElBQUksQ0FBQyxnQkFBZ0IsRUFBRSxDQUFDO1lBQzVCLElBQUksQ0FBQyxnQkFBZ0IsR0FBRyxJQUFJLENBQUM7WUFDN0IsTUFBTSxhQUFhLEdBQWEsRUFBRSxDQUFDO1lBQ25DLE1BQU0sWUFBWSxHQUFHLENBQUMsZUFBdUIsRUFBRSxhQUFxQixFQUFFLEVBQUU7Z0JBQ3ZFLE1BQU0sS0FBSyxHQUFHLGFBQWEsQ0FBQyxhQUFhLENBQUMsTUFBTSxHQUFHLENBQUMsQ0FBQyxDQUFDO2dCQUN0RCxPQUFPLElBQUksQ0FBQyxrQkFBa0IsQ0FBQyxLQUFLLENBQUMsSUFBSSxlQUFlLElBQUksSUFBSSxDQUFDLGdCQUFnQixDQUFDLEtBQUssQ0FBQyxJQUFJLGFBQWEsQ0FBQztZQUMzRyxDQUFDLENBQUM7WUFDRixLQUFLLElBQUksQ0FBQyxHQUFHLENBQUMsRUFBRSxHQUFHLEdBQUcsSUFBSSxDQUFDLGFBQWEsQ0FBQyxNQUFNLEVBQUUsQ0FBQyxHQUFHLEdBQUcsRUFBRSxDQUFDLEVBQUUsRUFBRSxDQUFDO2dCQUMvRCxNQUFNLGVBQWUsR0FBRyxJQUFJLENBQUMsYUFBYSxDQUFDLENBQUMsQ0FBQyxDQUFDO2dCQUM5QyxNQUFNLGFBQWEsR0FBRyxJQUFJLENBQUMsV0FBVyxDQUFDLENBQUMsQ0FBQyxDQUFDO2dCQUMxQyxJQUFJLGVBQWUsR0FBRyxlQUFlLElBQUksYUFBYSxHQUFHLGVBQWUsRUFBRSxDQUFDO29CQUMxRSxNQUFNLElBQUksS0FBSyxDQUFDLG1EQUFtRCxHQUFHLGVBQWUsQ0FBQyxDQUFDO2dCQUN4RixDQUFDO2dCQUNELE9BQU8sYUFBYSxDQUFDLE1BQU0sR0FBRyxDQUFDLElBQUksQ0FBQyxZQUFZLENBQUMsZUFBZSxFQUFFLGFBQWEsQ0FBQyxFQUFFLENBQUM7b0JBQ2xGLGFBQWEsQ0FBQyxHQUFHLEVBQUUsQ0FBQztnQkFDckIsQ0FBQztnQkFDRCxNQUFNLFdBQVcsR0FBRyxhQUFhLENBQUMsTUFBTSxHQUFHLENBQUMsQ0FBQyxDQUFDLENBQUMsYUFBYSxDQUFDLGFBQWEsQ0FBQyxNQUFNLEdBQUcsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO2dCQUM1RixhQUFhLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDO2dCQUN0QixJQUFJLENBQUMsYUFBYSxDQUFDLENBQUMsQ0FBQyxHQUFHLGVBQWUsR0FBRyxDQUFDLENBQUMsV0FBVyxHQUFHLElBQUksQ0FBQyxJQUFJLEVBQUUsQ0FBQyxDQUFDO2dCQUN2RSxJQUFJLENBQUMsV0FBVyxDQUFDLENBQUMsQ0FBQyxHQUFHLGFBQWEsR0FBRyxDQUFDLENBQUMsV0FBVyxHQUFHLE1BQU0sQ0FBQyxJQUFJLEVBQUUsQ0FBQyxDQUFDO1lBQ3RFLENBQUM7UUFDRixDQUFDO0lBQ0YsQ0FBQztJQUVELElBQVcsTUFBTTtRQUNoQixPQUFPLElBQUksQ0FBQyxhQUFhLENBQUMsTUFBTSxDQUFDO0lBQ2xDLENBQUM7SUFFTSxrQkFBa0IsQ0FBQyxLQUFhO1FBQ3RDLE9BQU8sSUFBSSxDQUFDLGFBQWEsQ0FBQyxLQUFLLENBQUMsR0FBRyxlQUFlLENBQUM7SUFDcEQsQ0FBQztJQUVNLGdCQUFnQixDQUFDLEtBQWE7UUFDcEMsT0FBTyxJQUFJLENBQUMsV0FBVyxDQUFDLEtBQUssQ0FBQyxHQUFHLGVBQWUsQ0FBQztJQUNsRCxDQUFDO0lBRU0sT0FBTyxDQUFDLEtBQWE7UUFDM0IsT0FBTyxJQUFJLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQyxTQUFTLENBQUM7SUFDckQsQ0FBQztJQUVNLFFBQVE7UUFDZCxPQUFPLENBQUMsQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDO0lBQ3RCLENBQUM7SUFFTSxXQUFXLENBQUMsS0FBYTtRQUMvQixPQUFPLElBQUksQ0FBQyxlQUFlLENBQUMsR0FBRyxDQUFDLEtBQUssQ0FBQyxDQUFDO0lBQ3hDLENBQUM7SUFFTSxZQUFZLENBQUMsS0FBYSxFQUFFLFFBQWlCO1FBQ25ELElBQUksQ0FBQyxlQUFlLENBQUMsR0FBRyxDQUFDLEtBQUssRUFBRSxRQUFRLENBQUMsQ0FBQztJQUMzQyxDQUFDO0lBRU8sYUFBYSxDQUFDLEtBQWE7UUFDbEMsT0FBTyxJQUFJLENBQUMsa0JBQWtCLENBQUMsR0FBRyxDQUFDLEtBQUssQ0FBQyxDQUFDO0lBQzNDLENBQUM7SUFFTyxjQUFjLENBQUMsS0FBYSxFQUFFLFFBQWlCO1FBQ3RELE9BQU8sSUFBSSxDQUFDLGtCQUFrQixDQUFDLEdBQUcsQ0FBQyxLQUFLLEVBQUUsUUFBUSxDQUFDLENBQUM7SUFDckQsQ0FBQztJQUVPLFdBQVcsQ0FBQyxLQUFhO1FBQ2hDLE9BQU8sSUFBSSxDQUFDLGdCQUFnQixDQUFDLEdBQUcsQ0FBQyxLQUFLLENBQUMsQ0FBQztJQUN6QyxDQUFDO0lBRU8sWUFBWSxDQUFDLEtBQWEsRUFBRSxRQUFpQjtRQUNwRCxPQUFPLElBQUksQ0FBQyxnQkFBZ0IsQ0FBQyxHQUFHLENBQUMsS0FBSyxFQUFFLFFBQVEsQ0FBQyxDQUFDO0lBQ25ELENBQUM7SUFFTSxTQUFTLENBQUMsS0FBYTtRQUM3QixJQUFJLElBQUksQ0FBQyxhQUFhLENBQUMsS0FBSyxDQUFDLEVBQUUsQ0FBQztZQUMvQixzQ0FBOEI7UUFDL0IsQ0FBQzthQUFNLElBQUksSUFBSSxDQUFDLFdBQVcsQ0FBQyxLQUFLLENBQUMsRUFBRSxDQUFDO1lBQ3BDLG9DQUE0QjtRQUM3QixDQUFDO1FBQ0QsbUNBQTJCO0lBQzVCLENBQUM7SUFFTSxTQUFTLENBQUMsS0FBYSxFQUFFLE1BQWtCO1FBQ2pELElBQUksTUFBTSxtQ0FBMkIsRUFBRSxDQUFDO1lBQ3ZDLElBQUksQ0FBQyxjQUFjLENBQUMsS0FBSyxFQUFFLElBQUksQ0FBQyxDQUFDO1lBQ2pDLElBQUksQ0FBQyxZQUFZLENBQUMsS0FBSyxFQUFFLEtBQUssQ0FBQyxDQUFDO1FBQ2pDLENBQUM7YUFBTSxJQUFJLE1BQU0saUNBQXlCLEVBQUUsQ0FBQztZQUM1QyxJQUFJLENBQUMsY0FBYyxDQUFDLEtBQUssRUFBRSxLQUFLLENBQUMsQ0FBQztZQUNsQyxJQUFJLENBQUMsWUFBWSxDQUFDLEtBQUssRUFBRSxJQUFJLENBQUMsQ0FBQztRQUNoQyxDQUFDO2FBQU0sQ0FBQztZQUNQLElBQUksQ0FBQyxjQUFjLENBQUMsS0FBSyxFQUFFLEtBQUssQ0FBQyxDQUFDO1lBQ2xDLElBQUksQ0FBQyxZQUFZLENBQUMsS0FBSyxFQUFFLEtBQUssQ0FBQyxDQUFDO1FBQ2pDLENBQUM7SUFDRixDQUFDO0lBRU0scUJBQXFCLENBQUMsSUFBWSxFQUFFLFFBQWlCO1FBQzNELElBQUksVUFBVSxHQUFHLEtBQUssQ0FBQztRQUN2QixJQUFJLElBQUksQ0FBQyxNQUFNLEVBQUUsQ0FBQztZQUNqQixLQUFLLElBQUksQ0FBQyxHQUFHLENBQUMsRUFBRSxDQUFDLEdBQUcsSUFBSSxDQUFDLE1BQU0sQ0FBQyxNQUFNLEVBQUUsQ0FBQyxFQUFFLEVBQUUsQ0FBQztnQkFDN0MsSUFBSSxJQUFJLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxLQUFLLElBQUksRUFBRSxDQUFDO29CQUM3QixJQUFJLENBQUMsWUFBWSxDQUFDLENBQUMsRUFBRSxRQUFRLENBQUMsQ0FBQztvQkFDL0IsVUFBVSxHQUFHLElBQUksQ0FBQztnQkFDbkIsQ0FBQztZQUNGLENBQUM7UUFDRixDQUFDO1FBQ0QsT0FBTyxVQUFVLENBQUM7SUFDbkIsQ0FBQztJQUVNLFFBQVEsQ0FBQyxLQUFhO1FBQzVCLE9BQU8sSUFBSSxhQUFhLENBQUMsSUFBSSxFQUFFLEtBQUssQ0FBQyxDQUFDO0lBQ3ZDLENBQUM7SUFFTSxjQUFjLENBQUMsS0FBYTtRQUNsQyxJQUFJLENBQUMsbUJBQW1CLEVBQUUsQ0FBQztRQUMzQixNQUFNLE1BQU0sR0FBRyxDQUFDLENBQUMsSUFBSSxDQUFDLGFBQWEsQ0FBQyxLQUFLLENBQUMsR0FBRyxXQUFXLENBQUMsS0FBSyxFQUFFLENBQUMsR0FBRyxDQUFDLENBQUMsSUFBSSxDQUFDLFdBQVcsQ0FBQyxLQUFLLENBQUMsR0FBRyxXQUFXLENBQUMsS0FBSyxFQUFFLENBQUMsQ0FBQztRQUNySCxJQUFJLE1BQU0sS0FBSyxtQkFBbUIsRUFBRSxDQUFDO1lBQ3BDLE9BQU8sQ0FBQyxDQUFDLENBQUM7UUFDWCxDQUFDO1FBQ0QsT0FBTyxNQUFNLENBQUM7SUFDZixDQUFDO0lBRU0sUUFBUSxDQUFDLEtBQWEsRUFBRSxJQUFZO1FBQzFDLE9BQU8sSUFBSSxDQUFDLGtCQUFrQixDQUFDLEtBQUssQ0FBQyxJQUFJLElBQUksSUFBSSxJQUFJLENBQUMsZ0JBQWdCLENBQUMsS0FBSyxDQUFDLElBQUksSUFBSSxDQUFDO0lBQ3ZGLENBQUM7SUFFTyxTQUFTLENBQUMsSUFBWTtRQUM3QixJQUFJLEdBQUcsR0FBRyxDQUFDLEVBQUUsSUFBSSxHQUFHLElBQUksQ0FBQyxhQUFhLENBQUMsTUFBTSxDQUFDO1FBQzlDLElBQUksSUFBSSxLQUFLLENBQUMsRUFBRSxDQUFDO1lBQ2hCLE9BQU8sQ0FBQyxDQUFDLENBQUMsQ0FBQyxjQUFjO1FBQzFCLENBQUM7UUFDRCxPQUFPLEdBQUcsR0FBRyxJQUFJLEVBQUUsQ0FBQztZQUNuQixNQUFNLEdBQUcsR0FBRyxJQUFJLENBQUMsS0FBSyxDQUFDLENBQUMsR0FBRyxHQUFHLElBQUksQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDO1lBQ3pDLElBQUksSUFBSSxHQUFHLElBQUksQ0FBQyxrQkFBa0IsQ0FBQyxHQUFHLENBQUMsRUFBRSxDQUFDO2dCQUN6QyxJQUFJLEdBQUcsR0FBRyxDQUFDO1lBQ1osQ0FBQztpQkFBTSxDQUFDO2dCQUNQLEdBQUcsR0FBRyxHQUFHLEdBQUcsQ0FBQyxDQUFDO1lBQ2YsQ0FBQztRQUNGLENBQUM7UUFDRCxPQUFPLEdBQUcsR0FBRyxDQUFDLENBQUM7SUFDaEIsQ0FBQztJQUVNLFNBQVMsQ0FBQyxJQUFZO1FBQzVCLElBQUksS0FBSyxHQUFHLElBQUksQ0FBQyxTQUFTLENBQUMsSUFBSSxDQUFDLENBQUM7UUFDakMsSUFBSSxLQUFLLElBQUksQ0FBQyxFQUFFLENBQUM7WUFDaEIsTUFBTSxhQUFhLEdBQUcsSUFBSSxDQUFDLGdCQUFnQixDQUFDLEtBQUssQ0FBQyxDQUFDO1lBQ25ELElBQUksYUFBYSxJQUFJLElBQUksRUFBRSxDQUFDO2dCQUMzQixPQUFPLEtBQUssQ0FBQztZQUNkLENBQUM7WUFDRCxLQUFLLEdBQUcsSUFBSSxDQUFDLGNBQWMsQ0FBQyxLQUFLLENBQUMsQ0FBQztZQUNuQyxPQUFPLEtBQUssS0FBSyxDQUFDLENBQUMsRUFBRSxDQUFDO2dCQUNyQixJQUFJLElBQUksQ0FBQyxRQUFRLENBQUMsS0FBSyxFQUFFLElBQUksQ0FBQyxFQUFFLENBQUM7b0JBQ2hDLE9BQU8sS0FBSyxDQUFDO2dCQUNkLENBQUM7Z0JBQ0QsS0FBSyxHQUFHLElBQUksQ0FBQyxjQUFjLENBQUMsS0FBSyxDQUFDLENBQUM7WUFDcEMsQ0FBQztRQUNGLENBQUM7UUFDRCxPQUFPLENBQUMsQ0FBQyxDQUFDO0lBQ1gsQ0FBQztJQUdNLFFBQVE7UUFDZCxNQUFNLEdBQUcsR0FBYSxFQUFFLENBQUM7UUFDekIsS0FBSyxJQUFJLENBQUMsR0FBRyxDQUFDLEVBQUUsQ0FBQyxHQUFHLElBQUksQ0FBQyxNQUFNLEVBQUUsQ0FBQyxFQUFFLEVBQUUsQ0FBQztZQUN0QyxHQUFHLENBQUMsQ0FBQyxDQUFDLEdBQUcsSUFBSSxjQUFjLENBQUMsSUFBSSxDQUFDLFNBQVMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxHQUFHLElBQUksQ0FBQyxXQUFXLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsR0FBRyxLQUFLLElBQUksQ0FBQyxrQkFBa0IsQ0FBQyxDQUFDLENBQUMsSUFBSSxJQUFJLENBQUMsZ0JBQWdCLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQztRQUMvSSxDQUFDO1FBQ0QsT0FBTyxHQUFHLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxDQUFDO0lBQ3ZCLENBQUM7SUFFTSxXQUFXLENBQUMsS0FBYTtRQUMvQixPQUFPO1lBQ04sZUFBZSxFQUFFLElBQUksQ0FBQyxhQUFhLENBQUMsS0FBSyxDQUFDLEdBQUcsZUFBZTtZQUM1RCxhQUFhLEVBQUUsSUFBSSxDQUFDLFdBQVcsQ0FBQyxLQUFLLENBQUMsR0FBRyxlQUFlO1lBQ3hELElBQUksRUFBRSxJQUFJLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQyxTQUFTO1lBQ2xELFdBQVcsRUFBRSxJQUFJLENBQUMsV0FBVyxDQUFDLEtBQUssQ0FBQztZQUNwQyxNQUFNLEVBQUUsSUFBSSxDQUFDLFNBQVMsQ0FBQyxLQUFLLENBQUM7U0FDN0IsQ0FBQztJQUNILENBQUM7SUFFTSxNQUFNLENBQUMsY0FBYyxDQUFDLE1BQW1CO1FBQy9DLE1BQU0sWUFBWSxHQUFHLE1BQU0sQ0FBQyxNQUFNLENBQUM7UUFDbkMsTUFBTSxZQUFZLEdBQUcsSUFBSSxXQUFXLENBQUMsWUFBWSxDQUFDLENBQUM7UUFDbkQsTUFBTSxVQUFVLEdBQUcsSUFBSSxXQUFXLENBQUMsWUFBWSxDQUFDLENBQUM7UUFDakQsSUFBSSxLQUFLLEdBQTBDLEVBQUUsQ0FBQztRQUN0RCxJQUFJLFFBQVEsR0FBRyxLQUFLLENBQUM7UUFDckIsS0FBSyxJQUFJLENBQUMsR0FBRyxDQUFDLEVBQUUsQ0FBQyxHQUFHLFlBQVksRUFBRSxDQUFDLEVBQUUsRUFBRSxDQUFDO1lBQ3ZDLE1BQU0sS0FBSyxHQUFHLE1BQU0sQ0FBQyxDQUFDLENBQUMsQ0FBQztZQUN4QixZQUFZLENBQUMsQ0FBQyxDQUFDLEdBQUcsS0FBSyxDQUFDLGVBQWUsQ0FBQztZQUN4QyxVQUFVLENBQUMsQ0FBQyxDQUFDLEdBQUcsS0FBSyxDQUFDLGFBQWEsQ0FBQztZQUNwQyxLQUFLLENBQUMsSUFBSSxDQUFDLEtBQUssQ0FBQyxJQUFJLENBQUMsQ0FBQztZQUN2QixJQUFJLEtBQUssQ0FBQyxJQUFJLEVBQUUsQ0FBQztnQkFDaEIsUUFBUSxHQUFHLElBQUksQ0FBQztZQUNqQixDQUFDO1FBQ0YsQ0FBQztRQUNELElBQUksQ0FBQyxRQUFRLEVBQUUsQ0FBQztZQUNmLEtBQUssR0FBRyxTQUFTLENBQUM7UUFDbkIsQ0FBQztRQUNELE1BQU0sT0FBTyxHQUFHLElBQUksY0FBYyxDQUFDLFlBQVksRUFBRSxVQUFVLEVBQUUsS0FBSyxDQUFDLENBQUM7UUFDcEUsS0FBSyxJQUFJLENBQUMsR0FBRyxDQUFDLEVBQUUsQ0FBQyxHQUFHLFlBQVksRUFBRSxDQUFDLEVBQUUsRUFBRSxDQUFDO1lBQ3ZDLElBQUksTUFBTSxDQUFDLENBQUMsQ0FBQyxDQUFDLFdBQVcsRUFBRSxDQUFDO2dCQUMzQixPQUFPLENBQUMsWUFBWSxDQUFDLENBQUMsRUFBRSxJQUFJLENBQUMsQ0FBQztZQUMvQixDQUFDO1lBQ0QsT0FBTyxDQUFDLFNBQVMsQ0FBQyxDQUFDLEVBQUUsTUFBTSxDQUFDLENBQUMsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxDQUFDO1FBQ3hDLENBQUM7UUFDRCxPQUFPLE9BQU8sQ0FBQztJQUNoQixDQUFDO0lBRUQ7Ozs7Ozs7Ozs7OztPQVlHO0lBQ0ksTUFBTSxDQUFDLGdCQUFnQixDQUM3QixPQUFxQyxFQUNyQyxPQUFxQyxFQUNyQyxhQUFpQyxFQUNqQyxTQUF5QjtRQUd6QixhQUFhLEdBQUcsYUFBYSxJQUFJLE1BQU0sQ0FBQyxTQUFTLENBQUM7UUFFbEQsTUFBTSxrQkFBa0IsR0FBRyxDQUFDLENBQStCLEVBQUUsS0FBYSxFQUFFLEVBQUU7WUFDN0UsT0FBTyxLQUFLLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQztnQkFDdEIsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFTLEVBQUUsRUFBRSxHQUFHLE9BQU8sQ0FBQyxDQUFDLEdBQUcsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsU0FBUyxDQUFDLENBQUMsQ0FBQyxDQUFDO2dCQUM3RCxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQVMsRUFBRSxFQUFFLEdBQUcsT0FBTyxDQUFDLENBQUMsR0FBRyxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLFdBQVcsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsU0FBUyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFDNUUsQ0FBQyxDQUFDO1FBQ0YsTUFBTSxJQUFJLEdBQUcsa0JBQWtCLENBQUMsT0FBTyxFQUFFLE9BQU8sQ0FBQyxNQUFNLENBQUMsQ0FBQztRQUN6RCxNQUFNLElBQUksR0FBRyxrQkFBa0IsQ0FBQyxPQUFPLEVBQUUsT0FBTyxDQUFDLE1BQU0sQ0FBQyxDQUFDO1FBQ3pELElBQUksTUFBTSxHQUFHLENBQUMsQ0FBQztRQUNmLElBQUksTUFBTSxHQUFHLENBQUMsQ0FBQztRQUNmLElBQUksS0FBSyxHQUFHLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUNwQixJQUFJLEtBQUssR0FBRyxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFFcEIsTUFBTSxhQUFhLEdBQWdCLEVBQUUsQ0FBQztRQUN0QyxJQUFJLGVBQXNDLENBQUM7UUFDM0MsSUFBSSxjQUFjLEdBQUcsQ0FBQyxDQUFDO1FBQ3ZCLE1BQU0sWUFBWSxHQUFnQixFQUFFLENBQUM7UUFFckMsT0FBTyxLQUFLLElBQUksS0FBSyxFQUFFLENBQUM7WUFFdkIsSUFBSSxRQUFRLEdBQTBCLFNBQVMsQ0FBQztZQUNoRCxJQUFJLEtBQUssSUFBSSxDQUFDLENBQUMsS0FBSyxJQUFJLEtBQUssQ0FBQyxlQUFlLElBQUksS0FBSyxDQUFDLGVBQWUsQ0FBQyxFQUFFLENBQUM7Z0JBQ3pFLElBQUksS0FBSyxJQUFJLEtBQUssQ0FBQyxlQUFlLEtBQUssS0FBSyxDQUFDLGVBQWUsRUFBRSxDQUFDO29CQUM5RCxJQUFJLEtBQUssQ0FBQyxNQUFNLG1DQUEyQixFQUFFLENBQUM7d0JBQzdDLDJDQUEyQzt3QkFDM0MsUUFBUSxHQUFHLEtBQUssQ0FBQztvQkFDbEIsQ0FBQzt5QkFBTSxDQUFDO3dCQUNQLHFFQUFxRTt3QkFDckUsUUFBUSxHQUFHLEtBQUssQ0FBQzt3QkFDakIsbUhBQW1IO3dCQUNuSCxRQUFRLENBQUMsV0FBVyxHQUFHLEtBQUssQ0FBQyxXQUFXLElBQUksQ0FBQyxLQUFLLENBQUMsYUFBYSxLQUFLLEtBQUssQ0FBQyxhQUFhLElBQUksQ0FBQyxTQUFTLEVBQUUsWUFBWSxDQUFDLEtBQUssQ0FBQyxlQUFlLEdBQUcsQ0FBQyxFQUFFLEtBQUssQ0FBQyxhQUFhLEdBQUcsQ0FBQyxDQUFDLENBQUMsQ0FBQzt3QkFDMUssUUFBUSxDQUFDLE1BQU0sOEJBQXNCLENBQUM7b0JBQ3ZDLENBQUM7b0JBQ0QsS0FBSyxHQUFHLElBQUksQ0FBQyxFQUFFLE1BQU0sQ0FBQyxDQUFDLENBQUMsZ0NBQWdDO2dCQUN6RCxDQUFDO3FCQUFNLENBQUM7b0JBQ1AsUUFBUSxHQUFHLEtBQUssQ0FBQztvQkFDakIsSUFBSSxLQUFLLENBQUMsV0FBVyxJQUFJLEtBQUssQ0FBQyxNQUFNLGdDQUF3QixFQUFFLENBQUM7d0JBQy9ELCtCQUErQjt3QkFDL0IsUUFBUSxDQUFDLE1BQU0sK0JBQXVCLENBQUM7b0JBQ3hDLENBQUM7Z0JBQ0YsQ0FBQztnQkFDRCxLQUFLLEdBQUcsSUFBSSxDQUFDLEVBQUUsTUFBTSxDQUFDLENBQUM7WUFDeEIsQ0FBQztpQkFBTSxDQUFDO2dCQUNQLHNGQUFzRjtnQkFDdEYsaURBQWlEO2dCQUNqRCxJQUFJLFNBQVMsR0FBRyxNQUFNLENBQUM7Z0JBQ3ZCLElBQUksUUFBUSxHQUFHLEtBQUssQ0FBQztnQkFDckIsT0FBTyxJQUFJLEVBQUUsQ0FBQztvQkFDYixJQUFJLENBQUMsUUFBUSxJQUFJLFFBQVEsQ0FBQyxlQUFlLEdBQUcsS0FBTSxDQUFDLGFBQWEsRUFBRSxDQUFDO3dCQUNsRSxRQUFRLEdBQUcsS0FBSyxDQUFDO3dCQUNqQixNQUFNLENBQUMsOEJBQThCO29CQUN0QyxDQUFDO29CQUNELElBQUksUUFBUSxDQUFDLE1BQU0sbUNBQTJCLElBQUksUUFBUSxDQUFDLGFBQWEsR0FBRyxLQUFNLENBQUMsYUFBYSxFQUFFLENBQUM7d0JBQ2pHLHdDQUF3Qzt3QkFDeEMsTUFBTSxDQUFDLHlEQUF5RDtvQkFDakUsQ0FBQztvQkFDRCxRQUFRLEdBQUcsSUFBSSxDQUFDLEVBQUUsU0FBUyxDQUFDLENBQUM7Z0JBQzlCLENBQUM7Z0JBQ0QsS0FBSyxHQUFHLElBQUksQ0FBQyxFQUFFLE1BQU0sQ0FBQyxDQUFDO1lBQ3hCLENBQUM7WUFFRCxJQUFJLFFBQVEsRUFBRSxDQUFDO2dCQUNkLE9BQU8sZUFBZTt1QkFDbEIsZUFBZSxDQUFDLGFBQWEsR0FBRyxRQUFRLENBQUMsZUFBZSxFQUFFLENBQUM7b0JBQzlELGVBQWUsR0FBRyxhQUFhLENBQUMsR0FBRyxFQUFFLENBQUM7Z0JBQ3ZDLENBQUM7Z0JBQ0QsSUFBSSxRQUFRLENBQUMsYUFBYSxHQUFHLFFBQVEsQ0FBQyxlQUFlO3VCQUNqRCxRQUFRLENBQUMsZUFBZSxHQUFHLGNBQWM7dUJBQ3pDLFFBQVEsQ0FBQyxhQUFhLElBQUksYUFBYTt1QkFDdkMsQ0FBQyxDQUFDLGVBQWU7MkJBQ2hCLGVBQWUsQ0FBQyxhQUFhLElBQUksUUFBUSxDQUFDLGFBQWEsQ0FBQyxFQUFFLENBQUM7b0JBQy9ELFlBQVksQ0FBQyxJQUFJLENBQUMsUUFBUSxDQUFDLENBQUM7b0JBQzVCLGNBQWMsR0FBRyxRQUFRLENBQUMsZUFBZSxDQUFDO29CQUMxQyxJQUFJLGVBQWUsRUFBRSxDQUFDO3dCQUNyQixhQUFhLENBQUMsSUFBSSxDQUFDLGVBQWUsQ0FBQyxDQUFDO29CQUNyQyxDQUFDO29CQUNELGVBQWUsR0FBRyxRQUFRLENBQUM7Z0JBQzVCLENBQUM7WUFDRixDQUFDO1FBRUYsQ0FBQztRQUNELE9BQU8sWUFBWSxDQUFDO0lBQ3JCLENBQUM7Q0FFRDtBQUVELE1BQU0sT0FBTyxhQUFhO0lBRXpCLFlBQTZCLE1BQXNCLEVBQVUsS0FBYTtRQUE3QyxXQUFNLEdBQU4sTUFBTSxDQUFnQjtRQUFVLFVBQUssR0FBTCxLQUFLLENBQVE7SUFDMUUsQ0FBQztJQUVELElBQVcsZUFBZTtRQUN6QixPQUFPLElBQUksQ0FBQyxNQUFNLENBQUMsa0JBQWtCLENBQUMsSUFBSSxDQUFDLEtBQUssQ0FBQyxDQUFDO0lBQ25ELENBQUM7SUFFRCxJQUFXLGFBQWE7UUFDdkIsT0FBTyxJQUFJLENBQUMsTUFBTSxDQUFDLGdCQUFnQixDQUFDLElBQUksQ0FBQyxLQUFLLENBQUMsQ0FBQztJQUNqRCxDQUFDO0lBRUQsSUFBVyxXQUFXO1FBQ3JCLE9BQU8sSUFBSSxDQUFDLEtBQUssQ0FBQztJQUNuQixDQUFDO0lBRUQsSUFBVyxXQUFXO1FBQ3JCLE9BQU8sSUFBSSxDQUFDLE1BQU0sQ0FBQyxjQUFjLENBQUMsSUFBSSxDQUFDLEtBQUssQ0FBQyxDQUFDO0lBQy9DLENBQUM7SUFFRCxJQUFXLFdBQVc7UUFDckIsT0FBTyxJQUFJLENBQUMsTUFBTSxDQUFDLFdBQVcsQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDLENBQUM7SUFDNUMsQ0FBQztJQUVELFdBQVcsQ0FBQyxLQUFpQjtRQUM1QixPQUFPLEtBQUssQ0FBQyxlQUFlLElBQUksSUFBSSxDQUFDLGVBQWUsSUFBSSxLQUFLLENBQUMsYUFBYSxJQUFJLElBQUksQ0FBQyxhQUFhLENBQUM7SUFDbkcsQ0FBQztJQUNELFlBQVksQ0FBQyxVQUFrQjtRQUM5QixPQUFPLElBQUksQ0FBQyxlQUFlLElBQUksVUFBVSxJQUFJLFVBQVUsSUFBSSxJQUFJLENBQUMsYUFBYSxDQUFDO0lBQy9FLENBQUM7SUFDRCxTQUFTLENBQUMsVUFBa0I7UUFDM0IsT0FBTyxJQUFJLENBQUMsZUFBZSxHQUFHLFVBQVUsSUFBSSxVQUFVLElBQUksSUFBSSxDQUFDLGFBQWEsQ0FBQztJQUM5RSxDQUFDO0NBQ0QifQ==