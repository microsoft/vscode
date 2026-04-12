/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { Range } from '../../../../../editor/common/core/range.js';
import { LineRange } from '../../../../../editor/common/core/ranges/lineRange.js';
/**
 * TODO: Deprecate in favor of LineRange!
 */
export class MergeEditorLineRange extends LineRange {
    static fromLineNumbers(startLineNumber, endExclusiveLineNumber) {
        return MergeEditorLineRange.fromLength(startLineNumber, endExclusiveLineNumber - startLineNumber);
    }
    static fromLength(startLineNumber, length) {
        return new MergeEditorLineRange(startLineNumber, startLineNumber + length);
    }
    join(other) {
        return MergeEditorLineRange.fromLineNumbers(Math.min(this.startLineNumber, other.startLineNumber), Math.max(this.endLineNumberExclusive, other.endLineNumberExclusive));
    }
    isAfter(range) {
        return this.startLineNumber >= range.endLineNumberExclusive;
    }
    isBefore(range) {
        return range.startLineNumber >= this.endLineNumberExclusive;
    }
    delta(lineDelta) {
        return MergeEditorLineRange.fromLength(this.startLineNumber + lineDelta, this.length);
    }
    deltaEnd(delta) {
        return MergeEditorLineRange.fromLength(this.startLineNumber, this.length + delta);
    }
    deltaStart(lineDelta) {
        return MergeEditorLineRange.fromLength(this.startLineNumber + lineDelta, this.length - lineDelta);
    }
    getLines(model) {
        const result = new Array(this.length);
        for (let i = 0; i < this.length; i++) {
            result[i] = model.getLineContent(this.startLineNumber + i);
        }
        return result;
    }
    toInclusiveRangeOrEmpty() {
        if (this.isEmpty) {
            return new Range(this.startLineNumber, 1, this.startLineNumber, 1);
        }
        return new Range(this.startLineNumber, 1, this.endLineNumberExclusive - 1, 1073741824 /* Constants.MAX_SAFE_SMALL_INTEGER */);
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibGluZVJhbmdlLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvbWVyZ2VFZGl0b3IvYnJvd3Nlci9tb2RlbC9saW5lUmFuZ2UudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFHaEcsT0FBTyxFQUFFLEtBQUssRUFBRSxNQUFNLDRDQUE0QyxDQUFDO0FBQ25FLE9BQU8sRUFBRSxTQUFTLEVBQUUsTUFBTSx1REFBdUQsQ0FBQztBQUdsRjs7R0FFRztBQUNILE1BQU0sT0FBTyxvQkFBcUIsU0FBUSxTQUFTO0lBQ2xELE1BQU0sQ0FBQyxlQUFlLENBQUMsZUFBdUIsRUFBRSxzQkFBOEI7UUFDN0UsT0FBTyxvQkFBb0IsQ0FBQyxVQUFVLENBQUMsZUFBZSxFQUFFLHNCQUFzQixHQUFHLGVBQWUsQ0FBQyxDQUFDO0lBQ25HLENBQUM7SUFFRCxNQUFNLENBQUMsVUFBVSxDQUFDLGVBQXVCLEVBQUUsTUFBYztRQUN4RCxPQUFPLElBQUksb0JBQW9CLENBQUMsZUFBZSxFQUFFLGVBQWUsR0FBRyxNQUFNLENBQUMsQ0FBQztJQUM1RSxDQUFDO0lBRWUsSUFBSSxDQUFDLEtBQTJCO1FBQy9DLE9BQU8sb0JBQW9CLENBQUMsZUFBZSxDQUFDLElBQUksQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLGVBQWUsRUFBRSxLQUFLLENBQUMsZUFBZSxDQUFDLEVBQUUsSUFBSSxDQUFDLEdBQUcsQ0FBQyxJQUFJLENBQUMsc0JBQXNCLEVBQUUsS0FBSyxDQUFDLHNCQUFzQixDQUFDLENBQUMsQ0FBQztJQUN6SyxDQUFDO0lBRU0sT0FBTyxDQUFDLEtBQTJCO1FBQ3pDLE9BQU8sSUFBSSxDQUFDLGVBQWUsSUFBSSxLQUFLLENBQUMsc0JBQXNCLENBQUM7SUFDN0QsQ0FBQztJQUVNLFFBQVEsQ0FBQyxLQUEyQjtRQUMxQyxPQUFPLEtBQUssQ0FBQyxlQUFlLElBQUksSUFBSSxDQUFDLHNCQUFzQixDQUFDO0lBQzdELENBQUM7SUFFZSxLQUFLLENBQUMsU0FBaUI7UUFDdEMsT0FBTyxvQkFBb0IsQ0FBQyxVQUFVLENBQUMsSUFBSSxDQUFDLGVBQWUsR0FBRyxTQUFTLEVBQUUsSUFBSSxDQUFDLE1BQU0sQ0FBQyxDQUFDO0lBQ3ZGLENBQUM7SUFFTSxRQUFRLENBQUMsS0FBYTtRQUM1QixPQUFPLG9CQUFvQixDQUFDLFVBQVUsQ0FBQyxJQUFJLENBQUMsZUFBZSxFQUFFLElBQUksQ0FBQyxNQUFNLEdBQUcsS0FBSyxDQUFDLENBQUM7SUFDbkYsQ0FBQztJQUVNLFVBQVUsQ0FBQyxTQUFpQjtRQUNsQyxPQUFPLG9CQUFvQixDQUFDLFVBQVUsQ0FBQyxJQUFJLENBQUMsZUFBZSxHQUFHLFNBQVMsRUFBRSxJQUFJLENBQUMsTUFBTSxHQUFHLFNBQVMsQ0FBQyxDQUFDO0lBQ25HLENBQUM7SUFFTSxRQUFRLENBQUMsS0FBaUI7UUFDaEMsTUFBTSxNQUFNLEdBQUcsSUFBSSxLQUFLLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxDQUFDO1FBQ3RDLEtBQUssSUFBSSxDQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUMsR0FBRyxJQUFJLENBQUMsTUFBTSxFQUFFLENBQUMsRUFBRSxFQUFFLENBQUM7WUFDdEMsTUFBTSxDQUFDLENBQUMsQ0FBQyxHQUFHLEtBQUssQ0FBQyxjQUFjLENBQUMsSUFBSSxDQUFDLGVBQWUsR0FBRyxDQUFDLENBQUMsQ0FBQztRQUM1RCxDQUFDO1FBQ0QsT0FBTyxNQUFNLENBQUM7SUFDZixDQUFDO0lBRU0sdUJBQXVCO1FBQzdCLElBQUksSUFBSSxDQUFDLE9BQU8sRUFBRSxDQUFDO1lBQ2xCLE9BQU8sSUFBSSxLQUFLLENBQUMsSUFBSSxDQUFDLGVBQWUsRUFBRSxDQUFDLEVBQUUsSUFBSSxDQUFDLGVBQWUsRUFBRSxDQUFDLENBQUMsQ0FBQztRQUNwRSxDQUFDO1FBQ0QsT0FBTyxJQUFJLEtBQUssQ0FBQyxJQUFJLENBQUMsZUFBZSxFQUFFLENBQUMsRUFBRSxJQUFJLENBQUMsc0JBQXNCLEdBQUcsQ0FBQyxvREFBbUMsQ0FBQztJQUM5RyxDQUFDO0NBQ0QifQ==