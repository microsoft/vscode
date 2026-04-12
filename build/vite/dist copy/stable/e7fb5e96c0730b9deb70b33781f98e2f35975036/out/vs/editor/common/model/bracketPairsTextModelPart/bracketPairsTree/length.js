/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { splitLines } from '../../../../../base/common/strings.js';
import { Position } from '../../../core/position.js';
import { Range } from '../../../core/range.js';
import { TextLength } from '../../../core/text/textLength.js';
/**
 * The end must be greater than or equal to the start.
*/
export function lengthDiff(startLineCount, startColumnCount, endLineCount, endColumnCount) {
    return (startLineCount !== endLineCount)
        ? toLength(endLineCount - startLineCount, endColumnCount)
        : toLength(0, endColumnCount - startColumnCount);
}
// eslint-disable-next-line local/code-no-any-casts, @typescript-eslint/no-explicit-any
export const lengthZero = 0;
export function lengthIsZero(length) {
    // eslint-disable-next-line local/code-no-any-casts, @typescript-eslint/no-explicit-any
    return length === 0;
}
/*
 * We have 52 bits available in a JS number.
 * We use the upper 26 bits to store the line and the lower 26 bits to store the column.
 */
///*
const factor = 2 ** 26;
/*/
const factor = 1000000;
// */
export function toLength(lineCount, columnCount) {
    // llllllllllllllllllllllllllcccccccccccccccccccccccccc (52 bits)
    //       line count (26 bits)    column count (26 bits)
    // If there is no overflow (all values/sums below 2^26 = 67108864),
    // we have `toLength(lns1, cols1) + toLength(lns2, cols2) = toLength(lns1 + lns2, cols1 + cols2)`.
    // eslint-disable-next-line local/code-no-any-casts, @typescript-eslint/no-explicit-any
    return (lineCount * factor + columnCount);
}
export function lengthToObj(length) {
    // eslint-disable-next-line local/code-no-any-casts, @typescript-eslint/no-explicit-any
    const l = length;
    const lineCount = Math.floor(l / factor);
    const columnCount = l - lineCount * factor;
    return new TextLength(lineCount, columnCount);
}
export function lengthGetLineCount(length) {
    // eslint-disable-next-line local/code-no-any-casts, @typescript-eslint/no-explicit-any
    return Math.floor(length / factor);
}
/**
 * Returns the amount of columns of the given length, assuming that it does not span any line.
*/
export function lengthGetColumnCountIfZeroLineCount(length) {
    // eslint-disable-next-line local/code-no-any-casts, @typescript-eslint/no-explicit-any
    return length;
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function lengthAdd(l1, l2) {
    let r = l1 + l2;
    if (l2 >= factor) {
        r = r - (l1 % factor);
    }
    return r;
}
export function sumLengths(items, lengthFn) {
    return items.reduce((a, b) => lengthAdd(a, lengthFn(b)), lengthZero);
}
export function lengthEquals(length1, length2) {
    return length1 === length2;
}
/**
 * Returns a non negative length `result` such that `lengthAdd(length1, result) = length2`, or zero if such length does not exist.
 */
export function lengthDiffNonNegative(length1, length2) {
    // eslint-disable-next-line local/code-no-any-casts, @typescript-eslint/no-explicit-any
    const l1 = length1;
    // eslint-disable-next-line local/code-no-any-casts, @typescript-eslint/no-explicit-any
    const l2 = length2;
    const diff = l2 - l1;
    if (diff <= 0) {
        // line-count of length1 is higher than line-count of length2
        // or they are equal and column-count of length1 is higher than column-count of length2
        return lengthZero;
    }
    const lineCount1 = Math.floor(l1 / factor);
    const lineCount2 = Math.floor(l2 / factor);
    const colCount2 = l2 - lineCount2 * factor;
    if (lineCount1 === lineCount2) {
        const colCount1 = l1 - lineCount1 * factor;
        return toLength(0, colCount2 - colCount1);
    }
    else {
        return toLength(lineCount2 - lineCount1, colCount2);
    }
}
export function lengthLessThan(length1, length2) {
    // First, compare line counts, then column counts.
    // eslint-disable-next-line local/code-no-any-casts, @typescript-eslint/no-explicit-any
    return length1 < length2;
}
export function lengthLessThanEqual(length1, length2) {
    // eslint-disable-next-line local/code-no-any-casts, @typescript-eslint/no-explicit-any
    return length1 <= length2;
}
export function lengthGreaterThanEqual(length1, length2) {
    // eslint-disable-next-line local/code-no-any-casts, @typescript-eslint/no-explicit-any
    return length1 >= length2;
}
export function lengthToPosition(length) {
    // eslint-disable-next-line local/code-no-any-casts, @typescript-eslint/no-explicit-any
    const l = length;
    const lineCount = Math.floor(l / factor);
    const colCount = l - lineCount * factor;
    return new Position(lineCount + 1, colCount + 1);
}
export function positionToLength(position) {
    return toLength(position.lineNumber - 1, position.column - 1);
}
export function lengthsToRange(lengthStart, lengthEnd) {
    // eslint-disable-next-line local/code-no-any-casts, @typescript-eslint/no-explicit-any
    const l = lengthStart;
    const lineCount = Math.floor(l / factor);
    const colCount = l - lineCount * factor;
    // eslint-disable-next-line local/code-no-any-casts, @typescript-eslint/no-explicit-any
    const l2 = lengthEnd;
    const lineCount2 = Math.floor(l2 / factor);
    const colCount2 = l2 - lineCount2 * factor;
    return new Range(lineCount + 1, colCount + 1, lineCount2 + 1, colCount2 + 1);
}
export function lengthOfRange(range) {
    if (range.startLineNumber === range.endLineNumber) {
        return new TextLength(0, range.endColumn - range.startColumn);
    }
    else {
        return new TextLength(range.endLineNumber - range.startLineNumber, range.endColumn - 1);
    }
}
export function lengthCompare(length1, length2) {
    // eslint-disable-next-line local/code-no-any-casts, @typescript-eslint/no-explicit-any
    const l1 = length1;
    // eslint-disable-next-line local/code-no-any-casts, @typescript-eslint/no-explicit-any
    const l2 = length2;
    return l1 - l2;
}
export function lengthOfString(str) {
    const lines = splitLines(str);
    return toLength(lines.length - 1, lines[lines.length - 1].length);
}
export function lengthOfStringObj(str) {
    const lines = splitLines(str);
    return new TextLength(lines.length - 1, lines[lines.length - 1].length);
}
/**
 * Computes a numeric hash of the given length.
*/
export function lengthHash(length) {
    // eslint-disable-next-line local/code-no-any-casts, @typescript-eslint/no-explicit-any
    return length;
}
export function lengthMax(length1, length2) {
    return length1 > length2 ? length1 : length2;
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibGVuZ3RoLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvZWRpdG9yL2NvbW1vbi9tb2RlbC9icmFja2V0UGFpcnNUZXh0TW9kZWxQYXJ0L2JyYWNrZXRQYWlyc1RyZWUvbGVuZ3RoLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sRUFBRSxVQUFVLEVBQUUsTUFBTSx1Q0FBdUMsQ0FBQztBQUNuRSxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sMkJBQTJCLENBQUM7QUFDckQsT0FBTyxFQUFFLEtBQUssRUFBRSxNQUFNLHdCQUF3QixDQUFDO0FBQy9DLE9BQU8sRUFBRSxVQUFVLEVBQUUsTUFBTSxrQ0FBa0MsQ0FBQztBQUU5RDs7RUFFRTtBQUNGLE1BQU0sVUFBVSxVQUFVLENBQUMsY0FBc0IsRUFBRSxnQkFBd0IsRUFBRSxZQUFvQixFQUFFLGNBQXNCO0lBQ3hILE9BQU8sQ0FBQyxjQUFjLEtBQUssWUFBWSxDQUFDO1FBQ3ZDLENBQUMsQ0FBQyxRQUFRLENBQUMsWUFBWSxHQUFHLGNBQWMsRUFBRSxjQUFjLENBQUM7UUFDekQsQ0FBQyxDQUFDLFFBQVEsQ0FBQyxDQUFDLEVBQUUsY0FBYyxHQUFHLGdCQUFnQixDQUFDLENBQUM7QUFDbkQsQ0FBQztBQVFELHVGQUF1RjtBQUN2RixNQUFNLENBQUMsTUFBTSxVQUFVLEdBQUcsQ0FBa0IsQ0FBQztBQUU3QyxNQUFNLFVBQVUsWUFBWSxDQUFDLE1BQWM7SUFDMUMsdUZBQXVGO0lBQ3ZGLE9BQU8sTUFBdUIsS0FBSyxDQUFDLENBQUM7QUFDdEMsQ0FBQztBQUVEOzs7R0FHRztBQUNILElBQUk7QUFDSixNQUFNLE1BQU0sR0FBRyxDQUFDLElBQUksRUFBRSxDQUFDO0FBQ3ZCOztLQUVLO0FBRUwsTUFBTSxVQUFVLFFBQVEsQ0FBQyxTQUFpQixFQUFFLFdBQW1CO0lBQzlELGlFQUFpRTtJQUNqRSx1REFBdUQ7SUFFdkQsbUVBQW1FO0lBQ25FLGtHQUFrRztJQUVsRyx1RkFBdUY7SUFDdkYsT0FBTyxDQUFDLFNBQVMsR0FBRyxNQUFNLEdBQUcsV0FBVyxDQUFrQixDQUFDO0FBQzVELENBQUM7QUFFRCxNQUFNLFVBQVUsV0FBVyxDQUFDLE1BQWM7SUFDekMsdUZBQXVGO0lBQ3ZGLE1BQU0sQ0FBQyxHQUFHLE1BQXVCLENBQUM7SUFDbEMsTUFBTSxTQUFTLEdBQUcsSUFBSSxDQUFDLEtBQUssQ0FBQyxDQUFDLEdBQUcsTUFBTSxDQUFDLENBQUM7SUFDekMsTUFBTSxXQUFXLEdBQUcsQ0FBQyxHQUFHLFNBQVMsR0FBRyxNQUFNLENBQUM7SUFDM0MsT0FBTyxJQUFJLFVBQVUsQ0FBQyxTQUFTLEVBQUUsV0FBVyxDQUFDLENBQUM7QUFDL0MsQ0FBQztBQUVELE1BQU0sVUFBVSxrQkFBa0IsQ0FBQyxNQUFjO0lBQ2hELHVGQUF1RjtJQUN2RixPQUFPLElBQUksQ0FBQyxLQUFLLENBQUMsTUFBdUIsR0FBRyxNQUFNLENBQUMsQ0FBQztBQUNyRCxDQUFDO0FBRUQ7O0VBRUU7QUFDRixNQUFNLFVBQVUsbUNBQW1DLENBQUMsTUFBYztJQUNqRSx1RkFBdUY7SUFDdkYsT0FBTyxNQUF1QixDQUFDO0FBQ2hDLENBQUM7QUFNRCw4REFBOEQ7QUFDOUQsTUFBTSxVQUFVLFNBQVMsQ0FBQyxFQUFPLEVBQUUsRUFBTztJQUN6QyxJQUFJLENBQUMsR0FBRyxFQUFFLEdBQUcsRUFBRSxDQUFDO0lBQ2hCLElBQUksRUFBRSxJQUFJLE1BQU0sRUFBRSxDQUFDO1FBQUMsQ0FBQyxHQUFHLENBQUMsR0FBRyxDQUFDLEVBQUUsR0FBRyxNQUFNLENBQUMsQ0FBQztJQUFDLENBQUM7SUFDNUMsT0FBTyxDQUFDLENBQUM7QUFDVixDQUFDO0FBRUQsTUFBTSxVQUFVLFVBQVUsQ0FBSSxLQUFtQixFQUFFLFFBQTZCO0lBQy9FLE9BQU8sS0FBSyxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLEVBQUUsRUFBRSxDQUFDLFNBQVMsQ0FBQyxDQUFDLEVBQUUsUUFBUSxDQUFDLENBQUMsQ0FBQyxDQUFDLEVBQUUsVUFBVSxDQUFDLENBQUM7QUFDdEUsQ0FBQztBQUVELE1BQU0sVUFBVSxZQUFZLENBQUMsT0FBZSxFQUFFLE9BQWU7SUFDNUQsT0FBTyxPQUFPLEtBQUssT0FBTyxDQUFDO0FBQzVCLENBQUM7QUFFRDs7R0FFRztBQUNILE1BQU0sVUFBVSxxQkFBcUIsQ0FBQyxPQUFlLEVBQUUsT0FBZTtJQUNyRSx1RkFBdUY7SUFDdkYsTUFBTSxFQUFFLEdBQUcsT0FBd0IsQ0FBQztJQUNwQyx1RkFBdUY7SUFDdkYsTUFBTSxFQUFFLEdBQUcsT0FBd0IsQ0FBQztJQUVwQyxNQUFNLElBQUksR0FBRyxFQUFFLEdBQUcsRUFBRSxDQUFDO0lBQ3JCLElBQUksSUFBSSxJQUFJLENBQUMsRUFBRSxDQUFDO1FBQ2YsNkRBQTZEO1FBQzdELHVGQUF1RjtRQUN2RixPQUFPLFVBQVUsQ0FBQztJQUNuQixDQUFDO0lBRUQsTUFBTSxVQUFVLEdBQUcsSUFBSSxDQUFDLEtBQUssQ0FBQyxFQUFFLEdBQUcsTUFBTSxDQUFDLENBQUM7SUFDM0MsTUFBTSxVQUFVLEdBQUcsSUFBSSxDQUFDLEtBQUssQ0FBQyxFQUFFLEdBQUcsTUFBTSxDQUFDLENBQUM7SUFFM0MsTUFBTSxTQUFTLEdBQUcsRUFBRSxHQUFHLFVBQVUsR0FBRyxNQUFNLENBQUM7SUFFM0MsSUFBSSxVQUFVLEtBQUssVUFBVSxFQUFFLENBQUM7UUFDL0IsTUFBTSxTQUFTLEdBQUcsRUFBRSxHQUFHLFVBQVUsR0FBRyxNQUFNLENBQUM7UUFDM0MsT0FBTyxRQUFRLENBQUMsQ0FBQyxFQUFFLFNBQVMsR0FBRyxTQUFTLENBQUMsQ0FBQztJQUMzQyxDQUFDO1NBQU0sQ0FBQztRQUNQLE9BQU8sUUFBUSxDQUFDLFVBQVUsR0FBRyxVQUFVLEVBQUUsU0FBUyxDQUFDLENBQUM7SUFDckQsQ0FBQztBQUNGLENBQUM7QUFFRCxNQUFNLFVBQVUsY0FBYyxDQUFDLE9BQWUsRUFBRSxPQUFlO0lBQzlELGtEQUFrRDtJQUNsRCx1RkFBdUY7SUFDdkYsT0FBUSxPQUF5QixHQUFJLE9BQXlCLENBQUM7QUFDaEUsQ0FBQztBQUVELE1BQU0sVUFBVSxtQkFBbUIsQ0FBQyxPQUFlLEVBQUUsT0FBZTtJQUNuRSx1RkFBdUY7SUFDdkYsT0FBUSxPQUF5QixJQUFLLE9BQXlCLENBQUM7QUFDakUsQ0FBQztBQUVELE1BQU0sVUFBVSxzQkFBc0IsQ0FBQyxPQUFlLEVBQUUsT0FBZTtJQUN0RSx1RkFBdUY7SUFDdkYsT0FBUSxPQUF5QixJQUFLLE9BQXlCLENBQUM7QUFDakUsQ0FBQztBQUVELE1BQU0sVUFBVSxnQkFBZ0IsQ0FBQyxNQUFjO0lBQzlDLHVGQUF1RjtJQUN2RixNQUFNLENBQUMsR0FBRyxNQUF1QixDQUFDO0lBQ2xDLE1BQU0sU0FBUyxHQUFHLElBQUksQ0FBQyxLQUFLLENBQUMsQ0FBQyxHQUFHLE1BQU0sQ0FBQyxDQUFDO0lBQ3pDLE1BQU0sUUFBUSxHQUFHLENBQUMsR0FBRyxTQUFTLEdBQUcsTUFBTSxDQUFDO0lBQ3hDLE9BQU8sSUFBSSxRQUFRLENBQUMsU0FBUyxHQUFHLENBQUMsRUFBRSxRQUFRLEdBQUcsQ0FBQyxDQUFDLENBQUM7QUFDbEQsQ0FBQztBQUVELE1BQU0sVUFBVSxnQkFBZ0IsQ0FBQyxRQUFrQjtJQUNsRCxPQUFPLFFBQVEsQ0FBQyxRQUFRLENBQUMsVUFBVSxHQUFHLENBQUMsRUFBRSxRQUFRLENBQUMsTUFBTSxHQUFHLENBQUMsQ0FBQyxDQUFDO0FBQy9ELENBQUM7QUFFRCxNQUFNLFVBQVUsY0FBYyxDQUFDLFdBQW1CLEVBQUUsU0FBaUI7SUFDcEUsdUZBQXVGO0lBQ3ZGLE1BQU0sQ0FBQyxHQUFHLFdBQTRCLENBQUM7SUFDdkMsTUFBTSxTQUFTLEdBQUcsSUFBSSxDQUFDLEtBQUssQ0FBQyxDQUFDLEdBQUcsTUFBTSxDQUFDLENBQUM7SUFDekMsTUFBTSxRQUFRLEdBQUcsQ0FBQyxHQUFHLFNBQVMsR0FBRyxNQUFNLENBQUM7SUFFeEMsdUZBQXVGO0lBQ3ZGLE1BQU0sRUFBRSxHQUFHLFNBQTBCLENBQUM7SUFDdEMsTUFBTSxVQUFVLEdBQUcsSUFBSSxDQUFDLEtBQUssQ0FBQyxFQUFFLEdBQUcsTUFBTSxDQUFDLENBQUM7SUFDM0MsTUFBTSxTQUFTLEdBQUcsRUFBRSxHQUFHLFVBQVUsR0FBRyxNQUFNLENBQUM7SUFFM0MsT0FBTyxJQUFJLEtBQUssQ0FBQyxTQUFTLEdBQUcsQ0FBQyxFQUFFLFFBQVEsR0FBRyxDQUFDLEVBQUUsVUFBVSxHQUFHLENBQUMsRUFBRSxTQUFTLEdBQUcsQ0FBQyxDQUFDLENBQUM7QUFDOUUsQ0FBQztBQUVELE1BQU0sVUFBVSxhQUFhLENBQUMsS0FBWTtJQUN6QyxJQUFJLEtBQUssQ0FBQyxlQUFlLEtBQUssS0FBSyxDQUFDLGFBQWEsRUFBRSxDQUFDO1FBQ25ELE9BQU8sSUFBSSxVQUFVLENBQUMsQ0FBQyxFQUFFLEtBQUssQ0FBQyxTQUFTLEdBQUcsS0FBSyxDQUFDLFdBQVcsQ0FBQyxDQUFDO0lBQy9ELENBQUM7U0FBTSxDQUFDO1FBQ1AsT0FBTyxJQUFJLFVBQVUsQ0FBQyxLQUFLLENBQUMsYUFBYSxHQUFHLEtBQUssQ0FBQyxlQUFlLEVBQUUsS0FBSyxDQUFDLFNBQVMsR0FBRyxDQUFDLENBQUMsQ0FBQztJQUN6RixDQUFDO0FBQ0YsQ0FBQztBQUVELE1BQU0sVUFBVSxhQUFhLENBQUMsT0FBZSxFQUFFLE9BQWU7SUFDN0QsdUZBQXVGO0lBQ3ZGLE1BQU0sRUFBRSxHQUFHLE9BQXdCLENBQUM7SUFDcEMsdUZBQXVGO0lBQ3ZGLE1BQU0sRUFBRSxHQUFHLE9BQXdCLENBQUM7SUFDcEMsT0FBTyxFQUFFLEdBQUcsRUFBRSxDQUFDO0FBQ2hCLENBQUM7QUFFRCxNQUFNLFVBQVUsY0FBYyxDQUFDLEdBQVc7SUFDekMsTUFBTSxLQUFLLEdBQUcsVUFBVSxDQUFDLEdBQUcsQ0FBQyxDQUFDO0lBQzlCLE9BQU8sUUFBUSxDQUFDLEtBQUssQ0FBQyxNQUFNLEdBQUcsQ0FBQyxFQUFFLEtBQUssQ0FBQyxLQUFLLENBQUMsTUFBTSxHQUFHLENBQUMsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxDQUFDO0FBQ25FLENBQUM7QUFFRCxNQUFNLFVBQVUsaUJBQWlCLENBQUMsR0FBVztJQUM1QyxNQUFNLEtBQUssR0FBRyxVQUFVLENBQUMsR0FBRyxDQUFDLENBQUM7SUFDOUIsT0FBTyxJQUFJLFVBQVUsQ0FBQyxLQUFLLENBQUMsTUFBTSxHQUFHLENBQUMsRUFBRSxLQUFLLENBQUMsS0FBSyxDQUFDLE1BQU0sR0FBRyxDQUFDLENBQUMsQ0FBQyxNQUFNLENBQUMsQ0FBQztBQUN6RSxDQUFDO0FBRUQ7O0VBRUU7QUFDRixNQUFNLFVBQVUsVUFBVSxDQUFDLE1BQWM7SUFDeEMsdUZBQXVGO0lBQ3ZGLE9BQU8sTUFBYSxDQUFDO0FBQ3RCLENBQUM7QUFFRCxNQUFNLFVBQVUsU0FBUyxDQUFDLE9BQWUsRUFBRSxPQUFlO0lBQ3pELE9BQU8sT0FBTyxHQUFHLE9BQU8sQ0FBQyxDQUFDLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQyxPQUFPLENBQUM7QUFDOUMsQ0FBQyJ9