/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { equals } from '../../../../../base/common/arrays.js';
import { splitLines } from '../../../../../base/common/strings.js';
import { Position } from '../../../../common/core/position.js';
import { Range } from '../../../../common/core/range.js';
import { TextReplacement, TextEdit } from '../../../../common/core/edits/textEdit.js';
import { LineDecoration } from '../../../../common/viewLayout/lineDecorations.js';
import { assertFn, checkAdjacentItems } from '../../../../../base/common/assert.js';
export class GhostText {
    constructor(lineNumber, parts) {
        this.lineNumber = lineNumber;
        this.parts = parts;
        assertFn(() => checkAdjacentItems(parts, (p1, p2) => p1.column <= p2.column));
    }
    equals(other) {
        return this.lineNumber === other.lineNumber &&
            this.parts.length === other.parts.length &&
            this.parts.every((part, index) => part.equals(other.parts[index]));
    }
    /**
     * Only used for testing/debugging.
    */
    render(documentText, debug = false) {
        return new TextEdit([
            ...this.parts.map(p => new TextReplacement(Range.fromPositions(new Position(this.lineNumber, p.column)), debug ? `[${p.lines.map(line => line.line).join('\n')}]` : p.lines.map(line => line.line).join('\n'))),
        ]).applyToString(documentText);
    }
    renderForScreenReader(lineText) {
        if (this.parts.length === 0) {
            return '';
        }
        const lastPart = this.parts[this.parts.length - 1];
        const cappedLineText = lineText.substr(0, lastPart.column - 1);
        const text = new TextEdit([
            ...this.parts.map(p => new TextReplacement(Range.fromPositions(new Position(1, p.column)), p.lines.map(line => line.line).join('\n'))),
        ]).applyToString(cappedLineText);
        return text.substring(this.parts[0].column - 1);
    }
    isEmpty() {
        return this.parts.every(p => p.lines.length === 0);
    }
    get lineCount() {
        return 1 + this.parts.reduce((r, p) => r + p.lines.length - 1, 0);
    }
}
export class GhostTextPart {
    constructor(column, text, 
    /**
     * Indicates if this part is a preview of an inline suggestion when a suggestion is previewed.
    */
    preview, _inlineDecorations = []) {
        this.column = column;
        this.text = text;
        this.preview = preview;
        this._inlineDecorations = _inlineDecorations;
        this.lines = splitLines(this.text).map((line, i) => ({
            line,
            lineDecorations: LineDecoration.filter(this._inlineDecorations, i + 1, 1, line.length + 1)
        }));
    }
    equals(other) {
        return this.column === other.column &&
            this.lines.length === other.lines.length &&
            this.lines.every((line, index) => line.line === other.lines[index].line &&
                LineDecoration.equalsArr(line.lineDecorations, other.lines[index].lineDecorations));
    }
}
export class GhostTextReplacement {
    constructor(lineNumber, columnRange, text, additionalReservedLineCount = 0) {
        this.lineNumber = lineNumber;
        this.columnRange = columnRange;
        this.text = text;
        this.additionalReservedLineCount = additionalReservedLineCount;
        this.parts = [
            new GhostTextPart(this.columnRange.endColumnExclusive, this.text, false),
        ];
        this.newLines = splitLines(this.text);
    }
    renderForScreenReader(_lineText) {
        return this.newLines.join('\n');
    }
    render(documentText, debug = false) {
        const replaceRange = this.columnRange.toRange(this.lineNumber);
        if (debug) {
            return new TextEdit([
                new TextReplacement(Range.fromPositions(replaceRange.getStartPosition()), '('),
                new TextReplacement(Range.fromPositions(replaceRange.getEndPosition()), `)[${this.newLines.join('\n')}]`),
            ]).applyToString(documentText);
        }
        else {
            return new TextEdit([
                new TextReplacement(replaceRange, this.newLines.join('\n')),
            ]).applyToString(documentText);
        }
    }
    get lineCount() {
        return this.newLines.length;
    }
    isEmpty() {
        return this.parts.every(p => p.lines.length === 0);
    }
    equals(other) {
        return this.lineNumber === other.lineNumber &&
            this.columnRange.equals(other.columnRange) &&
            this.newLines.length === other.newLines.length &&
            this.newLines.every((line, index) => line === other.newLines[index]) &&
            this.additionalReservedLineCount === other.additionalReservedLineCount;
    }
}
export function ghostTextsOrReplacementsEqual(a, b) {
    return equals(a, b, ghostTextOrReplacementEquals);
}
export function ghostTextOrReplacementEquals(a, b) {
    if (a === b) {
        return true;
    }
    if (!a || !b) {
        return false;
    }
    if (a instanceof GhostText && b instanceof GhostText) {
        return a.equals(b);
    }
    if (a instanceof GhostTextReplacement && b instanceof GhostTextReplacement) {
        return a.equals(b);
    }
    return false;
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZ2hvc3RUZXh0LmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvZWRpdG9yL2NvbnRyaWIvaW5saW5lQ29tcGxldGlvbnMvYnJvd3Nlci9tb2RlbC9naG9zdFRleHQudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxFQUFFLE1BQU0sRUFBRSxNQUFNLHNDQUFzQyxDQUFDO0FBQzlELE9BQU8sRUFBRSxVQUFVLEVBQUUsTUFBTSx1Q0FBdUMsQ0FBQztBQUNuRSxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0scUNBQXFDLENBQUM7QUFDL0QsT0FBTyxFQUFFLEtBQUssRUFBRSxNQUFNLGtDQUFrQyxDQUFDO0FBQ3pELE9BQU8sRUFBRSxlQUFlLEVBQUUsUUFBUSxFQUFFLE1BQU0sMkNBQTJDLENBQUM7QUFDdEYsT0FBTyxFQUFFLGNBQWMsRUFBRSxNQUFNLGtEQUFrRCxDQUFDO0FBRWxGLE9BQU8sRUFBRSxRQUFRLEVBQUUsa0JBQWtCLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUdwRixNQUFNLE9BQU8sU0FBUztJQUNyQixZQUNpQixVQUFrQixFQUNsQixLQUFzQjtRQUR0QixlQUFVLEdBQVYsVUFBVSxDQUFRO1FBQ2xCLFVBQUssR0FBTCxLQUFLLENBQWlCO1FBRXRDLFFBQVEsQ0FBQyxHQUFHLEVBQUUsQ0FBQyxrQkFBa0IsQ0FBQyxLQUFLLEVBQUUsQ0FBQyxFQUFFLEVBQUUsRUFBRSxFQUFFLEVBQUUsQ0FBQyxFQUFFLENBQUMsTUFBTSxJQUFJLEVBQUUsQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDO0lBQy9FLENBQUM7SUFFRCxNQUFNLENBQUMsS0FBZ0I7UUFDdEIsT0FBTyxJQUFJLENBQUMsVUFBVSxLQUFLLEtBQUssQ0FBQyxVQUFVO1lBQzFDLElBQUksQ0FBQyxLQUFLLENBQUMsTUFBTSxLQUFLLEtBQUssQ0FBQyxLQUFLLENB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