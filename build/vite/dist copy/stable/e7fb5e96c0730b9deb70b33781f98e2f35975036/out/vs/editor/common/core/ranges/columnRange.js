/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { BugIndicatingError } from '../../../../base/common/errors.js';
import { OffsetRange } from './offsetRange.js';
import { Range } from '../range.js';
/**
 * Represents a 1-based range of columns.
 * Use {@lik OffsetRange} to represent a 0-based range.
*/
export class ColumnRange {
    static fromOffsetRange(offsetRange) {
        return new ColumnRange(offsetRange.start + 1, offsetRange.endExclusive + 1);
    }
    constructor(
    /** 1-based */
    startColumn, endColumnExclusive) {
        this.startColumn = startColumn;
        this.endColumnExclusive = endColumnExclusive;
        if (startColumn > endColumnExclusive) {
            throw new BugIndicatingError(`startColumn ${startColumn} cannot be after endColumnExclusive ${endColumnExclusive}`);
        }
    }
    toRange(lineNumber) {
        return new Range(lineNumber, this.startColumn, lineNumber, this.endColumnExclusive);
    }
    equals(other) {
        return this.startColumn === other.startColumn
            && this.endColumnExclusive === other.endColumnExclusive;
    }
    toZeroBasedOffsetRange() {
        return new OffsetRange(this.startColumn - 1, this.endColumnExclusive - 1);
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY29sdW1uUmFuZ2UuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy9lZGl0b3IvY29tbW9uL2NvcmUvcmFuZ2VzL2NvbHVtblJhbmdlLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sRUFBRSxrQkFBa0IsRUFBRSxNQUFNLG1DQUFtQyxDQUFDO0FBQ3ZFLE9BQU8sRUFBRSxXQUFXLEVBQUUsTUFBTSxrQkFBa0IsQ0FBQztBQUMvQyxPQUFPLEVBQUUsS0FBSyxFQUFFLE1BQU0sYUFBYSxDQUFDO0FBRXBDOzs7RUFHRTtBQUNGLE1BQU0sT0FBTyxXQUFXO0lBQ2hCLE1BQU0sQ0FBQyxlQUFlLENBQUMsV0FBd0I7UUFDckQsT0FBTyxJQUFJLFdBQVcsQ0FBQyxXQUFXLENBQUMsS0FBSyxHQUFHLENBQUMsRUFBRSxXQUFXLENBQUMsWUFBWSxHQUFHLENBQUMsQ0FBQyxDQUFDO0lBQzdFLENBQUM7SUFFRDtJQUNDLGNBQWM7SUFDRSxXQUFtQixFQUNuQixrQkFBMEI7UUFEMUIsZ0JBQVcsR0FBWCxXQUFXLENBQVE7UUFDbkIsdUJBQWtCLEdBQWxCLGtCQUFrQixDQUFRO1FBRTFDLElBQUksV0FBVyxHQUFHLGtCQUFrQixFQUFFLENBQUM7WUFDdEMsTUFBTSxJQUFJLGtCQUFrQixDQUFDLGVBQWUsV0FBVyx1Q0FBdUMsa0JBQWtCLEVBQUUsQ0FBQyxDQUFDO1FBQ3JILENBQUM7SUFDRixDQUFDO0lBRUQsT0FBTyxDQUFDLFVBQWtCO1FBQ3pCLE9BQU8sSUFBSSxLQUFLLENBQUMsVUFBVSxFQUFFLElBQUksQ0FBQyxXQUFXLEVBQUUsVUFBVSxFQUFFLElBQUksQ0FBQyxrQkFBa0IsQ0FBQyxDQUFDO0lBQ3JGLENBQUM7SUFFRCxNQUFNLENBQUMsS0FBa0I7UUFDeEIsT0FBTyxJQUFJLENBQUMsV0FBVyxLQUFLLEtBQUssQ0FBQyxXQUFXO2VBQ3pDLElBQUksQ0FBQyxrQkFBa0IsS0FBSyxLQUFLLENBQUMsa0JBQWtCLENBQUM7SUFDMUQsQ0FBQztJQUVELHNCQUFzQjtRQUNyQixPQUFPLElBQUksV0FBVyxDQUFDLElBQUksQ0FBQyxXQUFXLEdBQUcsQ0FBQyxFQUFFLElBQUksQ0FBQyxrQkFBa0IsR0FBRyxDQUFDLENBQUMsQ0FBQztJQUMzRSxDQUFDO0NBQ0QifQ==