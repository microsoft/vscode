/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { SingleCursorState } from '../cursorCommon.js';
import { Position } from '../core/position.js';
import { Range } from '../core/range.js';
export class ColumnSelection {
    static columnSelect(config, model, fromLineNumber, fromVisibleColumn, toLineNumber, toVisibleColumn) {
        const lineCount = Math.abs(toLineNumber - fromLineNumber) + 1;
        const reversed = (fromLineNumber > toLineNumber);
        const isRTL = (fromVisibleColumn > toVisibleColumn);
        const isLTR = (fromVisibleColumn < toVisibleColumn);
        const result = [];
        // console.log(`fromVisibleColumn: ${fromVisibleColumn}, toVisibleColumn: ${toVisibleColumn}`);
        for (let i = 0; i < lineCount; i++) {
            const lineNumber = fromLineNumber + (reversed ? -i : i);
            const startColumn = config.columnFromVisibleColumn(model, lineNumber, fromVisibleColumn);
            const endColumn = config.columnFromVisibleColumn(model, lineNumber, toVisibleColumn);
            const visibleStartColumn = config.visibleColumnFromColumn(model, new Position(lineNumber, startColumn));
            const visibleEndColumn = config.visibleColumnFromColumn(model, new Position(lineNumber, endColumn));
            // console.log(`lineNumber: ${lineNumber}: visibleStartColumn: ${visibleStartColumn}, visibleEndColumn: ${visibleEndColumn}`);
            if (isLTR) {
                if (visibleStartColumn > toVisibleColumn) {
                    continue;
                }
                if (visibleEndColumn < fromVisibleColumn) {
                    continue;
                }
            }
            if (isRTL) {
                if (visibleEndColumn > fromVisibleColumn) {
                    continue;
                }
                if (visibleStartColumn < toVisibleColumn) {
                    continue;
                }
            }
            result.push(new SingleCursorState(new Range(lineNumber, startColumn, lineNumber, startColumn), 0 /* SelectionStartKind.Simple */, 0, new Position(lineNumber, endColumn), 0));
        }
        if (result.length === 0) {
            // We are after all the lines, so add cursor at the end of each line
            for (let i = 0; i < lineCount; i++) {
                const lineNumber = fromLineNumber + (reversed ? -i : i);
                const maxColumn = model.getLineMaxColumn(lineNumber);
                result.push(new SingleCursorState(new Range(lineNumber, maxColumn, lineNumber, maxColumn), 0 /* SelectionStartKind.Simple */, 0, new Position(lineNumber, maxColumn), 0));
            }
        }
        return {
            viewStates: result,
            reversed: reversed,
            fromLineNumber: fromLineNumber,
            fromVisualColumn: fromVisibleColumn,
            toLineNumber: toLineNumber,
            toVisualColumn: toVisibleColumn
        };
    }
    static columnSelectLeft(config, model, prevColumnSelectData) {
        let toViewVisualColumn = prevColumnSelectData.toViewVisualColumn;
        if (toViewVisualColumn > 0) {
            toViewVisualColumn--;
        }
        return ColumnSelection.columnSelect(config, model, prevColumnSelectData.fromViewLineNumber, prevColumnSelectData.fromViewVisualColumn, prevColumnSelectData.toViewLineNumber, toViewVisualColumn);
    }
    static columnSelectRight(config, model, prevColumnSelectData) {
        let maxVisualViewColumn = 0;
        const minViewLineNumber = Math.min(prevColumnSelectData.fromViewLineNumber, prevColumnSelectData.toViewLineNumber);
        const maxViewLineNumber = Math.max(prevColumnSelectData.fromViewLineNumber, prevColumnSelectData.toViewLineNumber);
        for (let lineNumber = minViewLineNumber; lineNumber <= maxViewLineNumber; lineNumber++) {
            const lineMaxViewColumn = model.getLineMaxColumn(lineNumber);
            const lineMaxVisualViewColumn = config.visibleColumnFromColumn(model, new Position(lineNumber, lineMaxViewColumn));
            maxVisualViewColumn = Math.max(maxVisualViewColumn, lineMaxVisualViewColumn);
        }
        let toViewVisualColumn = prevColumnSelectData.toViewVisualColumn;
        if (toViewVisualColumn < maxVisualViewColumn) {
            toViewVisualColumn++;
        }
        return this.columnSelect(config, model, prevColumnSelectData.fromViewLineNumber, prevColumnSelectData.fromViewVisualColumn, prevColumnSelectData.toViewLineNumber, toViewVisualColumn);
    }
    static columnSelectUp(config, model, prevColumnSelectData, isPaged) {
        const linesCount = isPaged ? config.pageSize : 1;
        const toViewLineNumber = Math.max(1, prevColumnSelectData.toViewLineNumber - linesCount);
        return this.columnSelect(config, model, prevColumnSelectData.fromViewLineNumber, prevColumnSelectData.fromViewVisualColumn, toViewLineNumber, prevColumnSelectData.toViewVisualColumn);
    }
    static columnSelectDown(config, model, prevColumnSelectData, isPaged) {
        const linesCount = isPaged ? config.pageSize : 1;
        const toViewLineNumber = Math.min(model.getLineCount(), prevColumnSelectData.toViewLineNumber + linesCount);
        return this.columnSelect(config, model, prevColumnSelectData.fromViewLineNumber, prevColumnSelectData.fromViewVisualColumn, toViewLineNumber, prevColumnSelectData.toViewVisualColumn);
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY3Vyc29yQ29sdW1uU2VsZWN0aW9uLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvZWRpdG9yL2NvbW1vbi9jdXJzb3IvY3Vyc29yQ29sdW1uU2VsZWN0aW9uLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sRUFBMkMsaUJBQWlCLEVBQXlDLE1BQU0sb0JBQW9CLENBQUM7QUFDdkksT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLHFCQUFxQixDQUFDO0FBQy9DLE9BQU8sRUFBRSxLQUFLLEVBQUUsTUFBTSxrQkFBa0IsQ0FBQztBQUV6QyxNQUFNLE9BQU8sZUFBZTtJQUVwQixNQUFNLENBQUMsWUFBWSxDQUFDLE1BQTJCLEVBQUUsS0FBeUIsRUFBRSxjQUFzQixFQUFFLGlCQUF5QixFQUFFLFlBQW9CLEVBQUUsZUFBdUI7UUFDbEwsTUFBTSxTQUFTLEdBQUcsSUFBSSxDQUFDLEdBQUcsQ0FBQyxZQUFZLEdBQUcsY0FBYyxDQUFDLEdBQUcsQ0FBQyxDQUFDO1FBQzlELE1BQU0sUUFBUSxHQUFHLENBQUMsY0FBYyxHQUFHLFlBQVksQ0FBQyxDQUFDO1FBQ2pELE1BQU0sS0FBSyxHQUFHLENBQUMsaUJBQWlCLEdBQUcsZUFBZSxDQUFDLENBQUM7UUFDcEQsTUFBTSxLQUFLLEdBQUcsQ0FBQyxpQkFBaUIsR0FBRyxlQUFlLENBQUMsQ0FBQztRQUVwRCxNQUFNLE1BQU0sR0FBd0IsRUFBRSxDQUFDO1FBRXZDLCtGQUErRjtRQUUvRixLQUFLLElBQUksQ0FBQyxHQUFHLENBQUMsRUFBRSxDQUFDLEdBQUcsU0FBUyxFQUFFLENBQUMsRUFBRSxFQUFFLENBQUM7WUFDcEMsTUFBTSxVQUFVLEdBQUcsY0FBYyxHQUFHLENBQUMsUUFBUSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7WUFFeEQs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