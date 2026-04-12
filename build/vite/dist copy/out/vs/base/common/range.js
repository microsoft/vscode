/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
export var Range;
(function (Range) {
    /**
     * Returns the intersection between two ranges as a range itself.
     * Returns `{ start: 0, end: 0 }` if the intersection is empty.
     */
    function intersect(one, other) {
        if (one.start >= other.end || other.start >= one.end) {
            return { start: 0, end: 0 };
        }
        const start = Math.max(one.start, other.start);
        const end = Math.min(one.end, other.end);
        if (end - start <= 0) {
            return { start: 0, end: 0 };
        }
        return { start, end };
    }
    Range.intersect = intersect;
    function isEmpty(range) {
        return range.end - range.start <= 0;
    }
    Range.isEmpty = isEmpty;
    function intersects(one, other) {
        return !isEmpty(intersect(one, other));
    }
    Range.intersects = intersects;
    function relativeComplement(one, other) {
        const result = [];
        const first = { start: one.start, end: Math.min(other.start, one.end) };
        const second = { start: Math.max(other.end, one.start), end: one.end };
        if (!isEmpty(first)) {
            result.push(first);
        }
        if (!isEmpty(second)) {
            result.push(second);
        }
        return result;
    }
    Range.relativeComplement = relativeComplement;
})(Range || (Range = {}));
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicmFuZ2UuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy9iYXNlL2NvbW1vbi9yYW5nZS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQVloRyxNQUFNLEtBQVcsS0FBSyxDQTRDckI7QUE1Q0QsV0FBaUIsS0FBSztJQUVyQjs7O09BR0c7SUFDSCxTQUFnQixTQUFTLENBQUMsR0FBVyxFQUFFLEtBQWE7UUFDbkQsSUFBSSxHQUFHLENBQUMsS0FBSyxJQUFJLEtBQUssQ0FBQyxHQUFHLElBQUksS0FBSyxDQUFDLEtBQUssSUFBSSxHQUFHLENBQUMsR0FBRyxFQUFFLENBQUM7WUFDdEQsT0FBTyxFQUFFLEtBQUssRUFBRSxDQUFDLEVBQUUsR0FBRyxFQUFFLENBQUMsRUFBRSxDQUFDO1FBQzdCLENBQUM7UUFFRCxNQUFNLEtBQUssR0FBRyxJQUFJLENBQUMsR0FBRyxDQUFDLEdBQUcsQ0FBQyxLQUFLLEVBQUUsS0FBSyxDQUFDLEtBQUssQ0FBQyxDQUFDO1FBQy9DLE1BQU0sR0FBRyxHQUFHLElBQUksQ0FBQyxHQUFHLENBQUMsR0FBRyxDQUFDLEdBQUcsRUFBRSxLQUFLLENBQUMsR0FBRyxDQUFDLENBQUM7UUFFekMsSUFBSSxHQUFHLEdBQUcsS0FBSyxJQUFJLENBQUMsRUFBRSxDQUFDO1lBQ3RCLE9BQU8sRUFBRSxLQUFLLEVBQUUsQ0FBQyxFQUFFLEdBQUcsRUFBRSxDQUFDLEVBQUUsQ0FBQztRQUM3QixDQUFDO1FBRUQsT0FBTyxFQUFFLEtBQUssRUFBRSxHQUFHLEVBQUUsQ0FBQztJQUN2QixDQUFDO0lBYmUsZUFBUyxZQWF4QixDQUFBO0lBRUQsU0FBZ0IsT0FBTyxDQUFDLEtBQWE7UUFDcEMsT0FBTyxLQUFLLENBQUMsR0FBRyxHQUFHLEtBQUssQ0FBQyxLQUFLLElBQUksQ0FBQyxDQUFDO0lBQ3JDLENBQUM7SUFGZSxhQUFPLFVBRXRCLENBQUE7SUFFRCxTQUFnQixVQUFVLENBQUMsR0FBVyxFQUFFLEtBQWE7UUFDcEQsT0FBTyxDQUFDLE9BQU8sQ0FBQyxTQUFTLENBQUMsR0FBRyxFQUFFLEtBQUssQ0FBQyxDQUFDLENBQUM7SUFDeEMsQ0FBQztJQUZlLGdCQUFVLGFBRXpCLENBQUE7SUFFRCxTQUFnQixrQkFBa0IsQ0FBQyxHQUFXLEVBQUUsS0FBYTtRQUM1RCxNQUFNLE1BQU0sR0FBYSxFQUFFLENBQUM7UUFDNUIsTUFBTSxLQUFLLEdBQUcsRUFBRSxLQUFLLEVBQUUsR0FBRyxDQUFDLEtBQUssRUFBRSxHQUFHLEVBQUUsSUFBSSxDQUFDLEdBQUcsQ0FBQyxLQUFLLENBQUMsS0FBSyxFQUFFLEdBQUcsQ0FBQyxHQUFHLENBQUMsRUFBRSxDQUFDO1FBQ3hFLE1BQU0sTUFBTSxHQUFHLEVBQUUsS0FBSyxFQUFFLElBQUksQ0FBQyxHQUFHLENBQUMsS0FBSyxDQUFDLEdBQUcsRUFBRSxHQUFHLENBQUMsS0FBSyxDQUFDLEVBQUUsR0FBRyxFQUFFLEdBQUcsQ0FBQyxHQUFHLEVBQUUsQ0FBQztRQUV2RSxJQUFJLENBQUMsT0FBTyxDQUFDLEtBQUssQ0FBQyxFQUFFLENBQUM7WUFDckIsTUFBTSxDQUFDLElBQUksQ0FBQyxLQUFLLENBQUMsQ0FBQztRQUNwQixDQUFDO1FBRUQsSUFBSSxDQUFDLE9BQU8sQ0FBQyxNQUFNLENBQUMsRUFBRSxDQUFDO1lBQ3RCLE1BQU0sQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLENBQUM7UUFDckIsQ0FBQztRQUVELE9BQU8sTUFBTSxDQUFDO0lBQ2YsQ0FBQztJQWRlLHdCQUFrQixxQkFjakMsQ0FBQTtBQUNGLENBQUMsRUE1Q2dCLEtBQUssS0FBTCxLQUFLLFFBNENyQiJ9