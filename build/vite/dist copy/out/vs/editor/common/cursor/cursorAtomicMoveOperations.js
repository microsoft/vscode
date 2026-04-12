/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { CursorColumns } from '../core/cursorColumns.js';
export var Direction;
(function (Direction) {
    Direction[Direction["Left"] = 0] = "Left";
    Direction[Direction["Right"] = 1] = "Right";
    Direction[Direction["Nearest"] = 2] = "Nearest";
})(Direction || (Direction = {}));
export class AtomicTabMoveOperations {
    /**
     * Get the visible column at the position. If we get to a non-whitespace character first
     * or past the end of string then return -1.
     *
     * **Note** `position` and the return value are 0-based.
     */
    static whitespaceVisibleColumn(lineContent, position, tabSize) {
        const lineLength = lineContent.length;
        let visibleColumn = 0;
        let prevTabStopPosition = -1;
        let prevTabStopVisibleColumn = -1;
        for (let i = 0; i < lineLength; i++) {
            if (i === position) {
                return [prevTabStopPosition, prevTabStopVisibleColumn, visibleColumn];
            }
            if (visibleColumn % tabSize === 0) {
                prevTabStopPosition = i;
                prevTabStopVisibleColumn = visibleColumn;
            }
            const chCode = lineContent.charCodeAt(i);
            switch (chCode) {
                case 32 /* CharCode.Space */:
                    visibleColumn += 1;
                    break;
                case 9 /* CharCode.Tab */:
                    // Skip to the next multiple of tabSize.
                    visibleColumn = CursorColumns.nextRenderTabStop(visibleColumn, tabSize);
                    break;
                default:
                    return [-1, -1, -1];
            }
        }
        if (position === lineLength) {
            return [prevTabStopPosition, prevTabStopVisibleColumn, visibleColumn];
        }
        return [-1, -1, -1];
    }
    /**
     * Return the position that should result from a move left, right or to the
     * nearest tab, if atomic tabs are enabled. Left and right are used for the
     * arrow key movements, nearest is used for mouse selection. It returns
     * -1 if atomic tabs are not relevant and you should fall back to normal
     * behaviour.
     *
     * **Note**: `position` and the return value are 0-based.
     */
    static atomicPosition(lineContent, position, tabSize, direction) {
        const lineLength = lineContent.length;
        // Get the 0-based visible column corresponding to the position, or return
        // -1 if it is not in the initial whitespace.
        const [prevTabStopPosition, prevTabStopVisibleColumn, visibleColumn] = AtomicTabMoveOperations.whitespaceVisibleColumn(lineContent, position, tabSize);
        if (visibleColumn === -1) {
            return -1;
        }
        // Is the output left or right of the current position. The case for nearest
        // where it is the same as the current position is handled in the switch.
        let left;
        switch (direction) {
            case 0 /* Direction.Left */:
                left = true;
                break;
            case 1 /* Direction.Right */:
                left = false;
                break;
            case 2 /* Direction.Nearest */:
                // The code below assumes the output position is either left or right
                // of the input position. If it is the same, return immediately.
                if (visibleColumn % tabSize === 0) {
                    return position;
                }
                // Go to the nearest indentation.
                left = visibleColumn % tabSize <= (tabSize / 2);
                break;
        }
        // If going left, we can just use the info about the last tab stop position and
        // last tab stop visible column that we computed in the first walk over the whitespace.
        if (left) {
            if (prevTabStopPosition === -1) {
                return -1;
            }
            // If the direction is left, we need to keep scanning right to ensure
            // that targetVisibleColumn + tabSize is before non-whitespace.
            // This is so that when we press left at the end of a partial
            // indentation it only goes one character. For example '      foo' with
            // tabSize 4, should jump from position 6 to position 5, not 4.
            let currentVisibleColumn = prevTabStopVisibleColumn;
            for (let i = prevTabStopPosition; i < lineLength; ++i) {
                if (currentVisibleColumn === prevTabStopVisibleColumn + tabSize) {
                    // It is a full indentation.
                    return prevTabStopPosition;
                }
                const chCode = lineContent.charCodeAt(i);
                switch (chCode) {
                    case 32 /* CharCode.Space */:
                        currentVisibleColumn += 1;
                        break;
                    case 9 /* CharCode.Tab */:
                        currentVisibleColumn = CursorColumns.nextRenderTabStop(currentVisibleColumn, tabSize);
                        break;
                    default:
                        return -1;
                }
            }
            if (currentVisibleColumn === prevTabStopVisibleColumn + tabSize) {
                return prevTabStopPosition;
            }
            // It must have been a partial indentation.
            return -1;
        }
        // We are going right.
        const targetVisibleColumn = CursorColumns.nextRenderTabStop(visibleColumn, tabSize);
        // We can just continue from where whitespaceVisibleColumn got to.
        let currentVisibleColumn = visibleColumn;
        for (let i = position; i < lineLength; i++) {
            if (currentVisibleColumn === targetVisibleColumn) {
                return i;
            }
            const chCode = lineContent.charCodeAt(i);
            switch (chCode) {
                case 32 /* CharCode.Space */:
                    currentVisibleColumn += 1;
                    break;
                case 9 /* CharCode.Tab */:
                    currentVisibleColumn = CursorColumns.nextRenderTabStop(currentVisibleColumn, tabSize);
                    break;
                default:
                    return -1;
            }
        }
        // This condition handles when the target column is at the end of the line.
        if (currentVisibleColumn === targetVisibleColumn) {
            return lineLength;
        }
        return -1;
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY3Vyc29yQXRvbWljTW92ZU9wZXJhdGlvbnMuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy9lZGl0b3IvY29tbW9uL2N1cnNvci9jdXJzb3JBdG9taWNNb3ZlT3BlcmF0aW9ucy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUdoRyxPQUFPLEVBQUUsYUFBYSxFQUFFLE1BQU0sMEJBQTBCLENBQUM7QUFFekQsTUFBTSxDQUFOLElBQWtCLFNBSWpCO0FBSkQsV0FBa0IsU0FBUztJQUMxQix5Q0FBSSxDQUFBO0lBQ0osMkNBQUssQ0FBQTtJQUNMLCtDQUFPLENBQUE7QUFDUixDQUFDLEVBSmlCLFNBQVMsS0FBVCxTQUFTLFFBSTFCO0FBRUQsTUFBTSxPQUFPLHVCQUF1QjtJQUNuQzs7Ozs7T0FLRztJQUNJLE1BQU0sQ0FBQyx1QkFBdUIsQ0FBQyxXQUFtQixFQUFFLFFBQWdCLEVBQUUsT0FBZTtRQUMzRixNQUFNLFVBQVUsR0FBRyxXQUFXLENBQUMsTUFBTSxDQUFDO1FBQ3RDLElBQUksYUFBYSxHQUFHLENBQUMsQ0FBQztRQUN0QixJQUFJLG1CQUFtQixHQUFHLENBQUMsQ0FBQyxDQUFDO1FBQzdCLElBQUksd0JBQXdCLEdBQUcsQ0FBQyxDQUFDLENBQUM7UUFDbEMsS0FBSyxJQUFJLENBQUMsR0FBRyxDQUFDLEVBQUUsQ0FBQyxHQUFHLFVBQVUsRUFBRSxDQUFDLEVBQUUsRUFBRSxDQUFDO1lBQ3JDLElBQUksQ0FBQyxLQUFLLFFBQVEsRUFBRSxDQUFDO2dCQUNwQixPQUFPLENBQUMsbUJBQW1CLEVBQUUsd0JBQXdCLEVBQUUsYUFBYSxDQUFDLENBQUM7WUFDdkUsQ0FBQztZQUNELElBQUksYUFBYSxHQUFHLE9BQU8sS0FBSyxDQUFDLEVBQUUsQ0FBQztnQkFDbkMsbUJBQW1CLEdBQUcsQ0FBQyxDQUFDO2dCQUN4Qix3QkFBd0IsR0FBRyxhQUFh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