/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { compareBy, groupAdjacentBy, numberComparator } from '../../../../base/common/arrays.js';
import { assert, checkAdjacentItems } from '../../../../base/common/assert.js';
import { splitLines } from '../../../../base/common/strings.js';
import { LineRange } from '../ranges/lineRange.js';
import { StringEdit, StringReplacement } from './stringEdit.js';
import { Position } from '../position.js';
import { Range } from '../range.js';
import { TextReplacement, TextEdit } from './textEdit.js';
export class LineEdit {
    static { this.empty = new LineEdit([]); }
    static deserialize(data) {
        return new LineEdit(data.map(e => LineReplacement.deserialize(e)));
    }
    static fromStringEdit(edit, initialValue) {
        const textEdit = TextEdit.fromStringEdit(edit, initialValue);
        return LineEdit.fromTextEdit(textEdit, initialValue);
    }
    static fromTextEdit(edit, initialValue) {
        const edits = edit.replacements;
        const result = [];
        const currentEdits = [];
        for (let i = 0; i < edits.length; i++) {
            const edit = edits[i];
            const nextEditRange = i + 1 < edits.length ? edits[i + 1] : undefined;
            currentEdits.push(edit);
            if (nextEditRange && nextEditRange.range.startLineNumber === edit.range.endLineNumber) {
                continue;
            }
            const singleEdit = TextReplacement.joinReplacements(currentEdits, initialValue);
            currentEdits.length = 0;
            const singleLineEdit = LineReplacement.fromSingleTextEdit(singleEdit, initialValue);
            result.push(singleLineEdit);
        }
        return new LineEdit(result);
    }
    static createFromUnsorted(edits) {
        const result = edits.slice();
        result.sort(compareBy(i => i.lineRange.startLineNumber, numberComparator));
        return new LineEdit(result);
    }
    constructor(
    /**
     * Have to be sorted by start line number and non-intersecting.
    */
    replacements) {
        this.replacements = replacements;
        assert(checkAdjacentItems(replacements, (i1, i2) => i1.lineRange.endLineNumberExclusive <= i2.lineRange.startLineNumber));
    }
    isEmpty() {
        return this.replacements.length === 0;
    }
    toEdit(initialValue) {
        const edits = [];
        for (const edit of this.replacements) {
            const singleEdit = edit.toSingleEdit(initialValue);
            edits.push(singleEdit);
        }
        return new StringEdit(edits);
    }
    toString() {
        return this.replacements.map(e => e.toString()).join(',');
    }
    serialize() {
        return this.replacements.map(e => e.serialize());
    }
    getNewLineRanges() {
        const ranges = [];
        let offset = 0;
        for (const e of this.replacements) {
            ranges.push(LineRange.ofLength(e.lineRange.startLineNumber + offset, e.newLines.length));
            offset += e.newLines.length - e.lineRange.length;
        }
        return ranges;
    }
    mapLineNumber(lineNumber) {
        let lineDelta = 0;
        for (const e of this.replacements) {
            if (e.lineRange.endLineNumberExclusive > lineNumber) {
                break;
            }
            lineDelta += e.newLines.length - e.lineRange.length;
        }
        return lineNumber + lineDelta;
    }
    mapLineRange(lineRange) {
        return new LineRange(this.mapLineNumber(lineRange.startLineNumber), this.mapLineNumber(lineRange.endLineNumberExclusive));
    }
    /** TODO improve, dont require originalLines */
    mapBackLineRange(lineRange, originalLines) {
        const i = this.inverse(originalLines);
        return i.mapLineRange(lineRange);
    }
    touches(other) {
        return this.replacements.some(e1 => other.replacements.some(e2 => e1.lineRange.intersect(e2.lineRange)));
    }
    rebase(base) {
        return new LineEdit(this.replacements.map(e => new LineReplacement(base.mapLineRange(e.lineRange), e.newLines)));
    }
    humanReadablePatch(originalLines) {
        const result = [];
        function pushLine(originalLineNumber, modifiedLineNumber, kind, content) {
            const specialChar = (kind === 'unmodified' ? ' ' : (kind === 'deleted' ? '-' : '+'));
            if (content === undefined) {
                content = '[[[[[ WARNING: LINE DOES NOT EXIST ]]]]]';
            }
            const origLn = originalLineNumber === -1 ? '   ' : originalLineNumber.toString().padStart(3, ' ');
            const modLn = modifiedLineNumber === -1 ? '   ' : modifiedLineNumber.toString().padStart(3, ' ');
            result.push(`${specialChar} ${origLn} ${modLn} ${content}`);
        }
        function pushSeperator() {
            result.push('---');
        }
        let lineDelta = 0;
        let first = true;
        for (const edits of groupAdjacentBy(this.replacements, (e1, e2) => e1.lineRange.distanceToRange(e2.lineRange) <= 5)) {
            if (!first) {
                pushSeperator();
            }
            else {
                first = false;
            }
            let lastLineNumber = edits[0].lineRange.startLineNumber - 2;
            for (const edit of edits) {
                for (let i = Math.max(1, lastLineNumber); i < edit.lineRange.startLineNumber; i++) {
                    pushLine(i, i + lineDelta, 'unmodified', originalLines[i - 1]);
                }
                const range = edit.lineRange;
                const newLines = edit.newLines;
                for (const replaceLineNumber of range.mapToLineArray(n => n)) {
                    const line = originalLines[replaceLineNumber - 1];
                    pushLine(replaceLineNumber, -1, 'deleted', line);
                }
                for (let i = 0; i < newLines.length; i++) {
                    const line = newLines[i];
                    pushLine(-1, range.startLineNumber + lineDelta + i, 'added', line);
                }
                lastLineNumber = range.endLineNumberExclusive;
                lineDelta += edit.newLines.length - edit.lineRange.length;
            }
            for (let i = lastLineNumber; i <= Math.min(lastLineNumber + 2, originalLines.length); i++) {
                pushLine(i, i + lineDelta, 'unmodified', originalLines[i - 1]);
            }
        }
        return result.join('\n');
    }
    apply(lines) {
        const result = [];
        let currentLineIndex = 0;
        for (const edit of this.replacements) {
            while (currentLineIndex < edit.lineRange.startLineNumber - 1) {
                result.push(lines[currentLineIndex]);
                currentLineIndex++;
            }
            for (const newLine of edit.newLines) {
                result.push(newLine);
            }
            currentLineIndex = edit.lineRange.endLineNumberExclusive - 1;
        }
        while (currentLineIndex < lines.length) {
            result.push(lines[currentLineIndex]);
            currentLineIndex++;
        }
        return result;
    }
    inverse(originalLines) {
        const newRanges = this.getNewLineRanges();
        return new LineEdit(this.replacements.map((e, idx) => new LineReplacement(newRanges[idx], originalLines.slice(e.lineRange.startLineNumber - 1, e.lineRange.endLineNumberExclusive - 1))));
    }
}
export class LineReplacement {
    static deserialize(e) {
        return new LineReplacement(LineRange.ofLength(e[0], e[1] - e[0]), e[2]);
    }
    static fromSingleTextEdit(edit, initialValue) {
        // 1: ab[cde
        // 2: fghijk
        // 3: lmn]opq
        // replaced with
        // 1n: 123
        // 2n: 456
        // 3n: 789
        // simple solution: replace [1..4) with [1n..4n)
        const newLines = splitLines(edit.text);
        let startLineNumber = edit.range.startLineNumber;
        const survivingFirstLineText = initialValue.getValueOfRange(Range.fromPositions(new Position(edit.range.startLineNumber, 1), edit.range.getStartPosition()));
        newLines[0] = survivingFirstLineText + newLines[0];
        let endLineNumberEx = edit.range.endLineNumber + 1;
        const editEndLineNumberMaxColumn = initialValue.getTransformer().getLineLength(edit.range.endLineNumber) + 1;
        const survivingEndLineText = initialValue.getValueOfRange(Range.fromPositions(edit.range.getEndPosition(), new Position(edit.range.endLineNumber, editEndLineNumberMaxColumn)));
        newLines[newLines.length - 1] = newLines[newLines.length - 1] + survivingEndLineText;
        // Replacing [startLineNumber, endLineNumberEx) with newLines would be correct, however it might not be minimal.
        const startBeforeNewLine = edit.range.startColumn === initialValue.getTransformer().getLineLength(edit.range.startLineNumber) + 1;
        const endAfterNewLine = edit.range.endColumn === 1;
        if (startBeforeNewLine && newLines[0].length === survivingFirstLineText.length) {
            // the replacement would not delete any text on the first line
            startLineNumber++;
            newLines.shift();
        }
        if (newLines.length > 0 && startLineNumber < endLineNumberEx && endAfterNewLine && newLines[newLines.length - 1].length === survivingEndLineText.length) {
            // the replacement would not delete any text on the last line
            endLineNumberEx--;
            newLines.pop();
        }
        return new LineReplacement(new LineRange(startLineNumber, endLineNumberEx), newLines);
    }
    constructor(lineRange, newLines) {
        this.lineRange = lineRange;
        this.newLines = newLines;
    }
    toSingleTextEdit(initialValue) {
        if (this.newLines.length === 0) {
            // Deletion
            const textLen = initialValue.getTransformer().textLength;
            if (this.lineRange.endLineNumberExclusive === textLen.lineCount + 2) {
                let startPos;
                if (this.lineRange.startLineNumber > 1) {
                    const startLineNumber = this.lineRange.startLineNumber - 1;
                    const startColumn = initialValue.getTransformer().getLineLength(startLineNumber) + 1;
                    startPos = new Position(startLineNumber, startColumn);
                }
                else {
                    // Delete everything.
                    // In terms of lines, this would end up with 0 lines.
                    // However, a string has always 1 line (which can be empty).
                    startPos = new Position(1, 1);
                }
                const lastPosition = textLen.addToPosition(new Position(1, 1));
                return new TextReplacement(Range.fromPositions(startPos, lastPosition), '');
            }
            else {
                return new TextReplacement(new Range(this.lineRange.startLineNumber, 1, this.lineRange.endLineNumberExclusive, 1), '');
            }
        }
        else if (this.lineRange.isEmpty) {
            // Insertion
            let endLineNumber;
            let column;
            let text;
            const insertionLine = this.lineRange.startLineNumber;
            if (insertionLine === initialValue.getTransformer().textLength.lineCount + 2) {
                endLineNumber = insertionLine - 1;
                column = initialValue.getTransformer().getLineLength(endLineNumber) + 1;
                text = this.newLines.map(l => '\n' + l).join('');
            }
            else {
                endLineNumber = insertionLine;
                column = 1;
                text = this.newLines.map(l => l + '\n').join('');
            }
            return new TextReplacement(Range.fromPositions(new Position(endLineNumber, column)), text);
        }
        else {
            const endLineNumber = this.lineRange.endLineNumberExclusive - 1;
            const endLineNumberMaxColumn = initialValue.getTransformer().getLineLength(endLineNumber) + 1;
            const range = new Range(this.lineRange.startLineNumber, 1, endLineNumber, endLineNumberMaxColumn);
            // Don't add \n to the last line. This is because we subtract one from lineRange.endLineNumberExclusive for endLineNumber.
            const text = this.newLines.join('\n');
            return new TextReplacement(range, text);
        }
    }
    toSingleEdit(initialValue) {
        const textEdit = this.toSingleTextEdit(initialValue);
        const range = initialValue.getTransformer().getOffsetRange(textEdit.range);
        return new StringReplacement(range, textEdit.text);
    }
    toString() {
        return `${this.lineRange}->${JSON.stringify(this.newLines)}`;
    }
    serialize() {
        return [
            this.lineRange.startLineNumber,
            this.lineRange.endLineNumberExclusive,
            this.newLines,
        ];
    }
    removeCommonSuffixPrefixLines(initialValue) {
        let startLineNumber = this.lineRange.startLineNumber;
        let endLineNumberEx = this.lineRange.endLineNumberExclusive;
        let trimStartCount = 0;
        while (startLineNumber < endLineNumberEx && trimStartCount < this.newLines.length
            && this.newLines[trimStartCount] === initialValue.getLineAt(startLineNumber)) {
            startLineNumber++;
            trimStartCount++;
        }
        let trimEndCount = 0;
        while (startLineNumber < endLineNumberEx && trimEndCount + trimStartCount < this.newLines.length
            && this.newLines[this.newLines.length - 1 - trimEndCount] === initialValue.getLineAt(endLineNumberEx - 1)) {
            endLineNumberEx--;
            trimEndCount++;
        }
        if (trimStartCount === 0 && trimEndCount === 0) {
            return this;
        }
        return new LineReplacement(new LineRange(startLineNumber, endLineNumberEx), this.newLines.slice(trimStartCount, this.newLines.length - trimEndCount));
    }
    toLineEdit() {
        return new LineEdit([this]);
    }
}
export var SerializedLineReplacement;
(function (SerializedLineReplacement) {
    function is(thing) {
        return (Array.isArray(thing)
            && thing.length === 3
            && typeof thing[0] === 'number'
            && typeof thing[1] === 'number'
            && Array.isArray(thing[2])
            && thing[2].every((e) => typeof e === 'string'));
    }
    SerializedLineReplacement.is = is;
})(SerializedLineReplacement || (SerializedLineReplacement = {}));
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibGluZUVkaXQuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy9lZGl0b3IvY29tbW9uL2NvcmUvZWRpdHMvbGluZUVkaXQudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxFQUFFLFNBQVMsRUFBRSxlQUFlLEVBQUUsZ0JBQWdCLEVBQUUsTUFBTSxtQ0FBbUMsQ0FBQztBQUNqRyxPQUFPLEVBQUUsTUFBTSxFQUFFLGtCQUFrQixFQUFFLE1BQU0sbUNBQW1DLENBQUM7QUFDL0UsT0FBTyxFQUFFLFVBQVUsRUFBRSxNQUFNLG9DQUFvQyxDQUFDO0FBQ2hFLE9BQU8sRUFBRSxTQUFTLEVBQUUsTUFBTSx3QkFBd0IsQ0FBQztBQUNuRCxPQUFPLEVBQWtCLFVBQVUsRUFBRSxpQkFBaUIsRUFBRSxNQUFNLGlCQUFpQixDQUFDO0FBQ2hGLE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSxnQkFBZ0IsQ0FBQztBQUMxQyxPQUFPLEVBQUUsS0FBSyxFQUFFLE1BQU0sYUFBYSxDQUFDO0FBQ3BDLE9BQU8sRUFBRSxlQUFlLEVBQUUsUUFBUSxFQUFFLE1BQU0sZUFBZSxDQUFDO0FBRzFELE1BQU0sT0FBTyxRQUFRO2FBQ0csVUFBSyxHQUFHLElBQUksUUFBUSxDQUFDLEVBQUUsQ0FBQyxDQUFDO0lBRXpDLE1BQU0sQ0FBQyxXQUFXLENBQUMsSUFBd0I7UUFDakQsT0FBTyxJQUFJLFFBQVEsQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsZUFBZSxDQUFDLFdBQVcsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7SUFDcEUsQ0FBQztJQUVNLE1BQU0sQ0FBQyxjQUFjLENBQUMsSUFBb0IsRUFBRSxZQUEwQjtRQUM1RSxNQUFNLFFBQVEsR0FBRyxRQUFRLENBQUMsY0FBYyxDQUFDLElBQUksRUFBRSxZQUFZLENBQUMs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