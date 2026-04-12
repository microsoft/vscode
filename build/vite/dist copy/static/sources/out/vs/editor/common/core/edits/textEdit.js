/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { compareBy, equals } from '../../../../base/common/arrays.js';
import { assertFn, checkAdjacentItems } from '../../../../base/common/assert.js';
import { BugIndicatingError } from '../../../../base/common/errors.js';
import { commonPrefixLength, commonSuffixLength } from '../../../../base/common/strings.js';
import { Position } from '../position.js';
import { Range } from '../range.js';
import { TextLength } from '../text/textLength.js';
import { StringText } from '../text/abstractText.js';
export class TextEdit {
    static fromStringEdit(edit, initialState) {
        const edits = edit.replacements.map(e => TextReplacement.fromStringReplacement(e, initialState));
        return new TextEdit(edits);
    }
    static replace(originalRange, newText) {
        return new TextEdit([new TextReplacement(originalRange, newText)]);
    }
    static delete(range) {
        return new TextEdit([new TextReplacement(range, '')]);
    }
    static insert(position, newText) {
        return new TextEdit([new TextReplacement(Range.fromPositions(position, position), newText)]);
    }
    static fromParallelReplacementsUnsorted(replacements) {
        const r = replacements.slice().sort(compareBy(i => i.range, Range.compareRangesUsingStarts));
        return new TextEdit(r);
    }
    constructor(replacements) {
        this.replacements = replacements;
        assertFn(() => checkAdjacentItems(replacements, (a, b) => a.range.getEndPosition().isBeforeOrEqual(b.range.getStartPosition())));
    }
    /**
     * Joins touching edits and removes empty edits.
     */
    normalize() {
        const replacements = [];
        for (const r of this.replacements) {
            if (replacements.length > 0 && replacements[replacements.length - 1].range.getEndPosition().equals(r.range.getStartPosition())) {
                const last = replacements[replacements.length - 1];
                replacements[replacements.length - 1] = new TextReplacement(last.range.plusRange(r.range), last.text + r.text);
            }
            else if (!r.isEmpty) {
                replacements.push(r);
            }
        }
        return new TextEdit(replacements);
    }
    mapPosition(position) {
        let lineDelta = 0;
        let curLine = 0;
        let columnDeltaInCurLine = 0;
        for (const replacement of this.replacements) {
            const start = replacement.range.getStartPosition();
            if (position.isBeforeOrEqual(start)) {
                break;
            }
            const end = replacement.range.getEndPosition();
            const len = TextLength.ofText(replacement.text);
            if (position.isBefore(end)) {
                const startPos = new Position(start.lineNumber + lineDelta, start.column + (start.lineNumber + lineDelta === curLine ? columnDeltaInCurLine : 0));
                const endPos = len.addToPosition(startPos);
                return rangeFromPositions(startPos, endPos);
            }
            if (start.lineNumber + lineDelta !== curLine) {
                columnDeltaInCurLine = 0;
            }
            lineDelta += len.lineCount - (replacement.range.endLineNumber - replacement.range.startLineNumber);
            if (len.lineCount === 0) {
                if (end.lineNumber !== start.lineNumber) {
                    columnDeltaInCurLine += len.columnCount - (end.column - 1);
                }
                else {
                    columnDeltaInCurLine += len.columnCount - (end.column - start.column);
                }
            }
            else {
                columnDeltaInCurLine = len.columnCount;
            }
            curLine = end.lineNumber + lineDelta;
        }
        return new Position(position.lineNumber + lineDelta, position.column + (position.lineNumber + lineDelta === curLine ? columnDeltaInCurLine : 0));
    }
    mapRange(range) {
        function getStart(p) {
            return p instanceof Position ? p : p.getStartPosition();
        }
        function getEnd(p) {
            return p instanceof Position ? p : p.getEndPosition();
        }
        const start = getStart(this.mapPosition(range.getStartPosition()));
        const end = getEnd(this.mapPosition(range.getEndPosition()));
        return rangeFromPositions(start, end);
    }
    // TODO: `doc` is not needed for this!
    inverseMapPosition(positionAfterEdit, doc) {
        const reversed = this.inverse(doc);
        return reversed.mapPosition(positionAfterEdit);
    }
    inverseMapRange(range, doc) {
        const reversed = this.inverse(doc);
        return reversed.mapRange(range);
    }
    apply(text) {
        let result = '';
        let lastEditEnd = new Position(1, 1);
        for (const replacement of this.replacements) {
            const editRange = replacement.range;
            const editStart = editRange.getStartPosition();
            const editEnd = editRange.getEndPosition();
            const r = rangeFromPositions(lastEditEnd, editStart);
            if (!r.isEmpty()) {
                result += text.getValueOfRange(r);
            }
            result += replacement.text;
            lastEditEnd = editEnd;
        }
        const r = rangeFromPositions(lastEditEnd, text.endPositionExclusive);
        if (!r.isEmpty()) {
            result += text.getValueOfRange(r);
        }
        return result;
    }
    applyToString(str) {
        const strText = new StringText(str);
        return this.apply(strText);
    }
    inverse(doc) {
        const ranges = this.getNewRanges();
        return new TextEdit(this.replacements.map((e, idx) => new TextReplacement(ranges[idx], doc.getValueOfRange(e.range))));
    }
    getNewRanges() {
        const newRanges = [];
        let previousEditEndLineNumber = 0;
        let lineOffset = 0;
        let columnOffset = 0;
        for (const replacement of this.replacements) {
            const textLength = TextLength.ofText(replacement.text);
            const newRangeStart = Position.lift({
                lineNumber: replacement.range.startLineNumber + lineOffset,
                column: replacement.range.startColumn + (replacement.range.startLineNumber === previousEditEndLineNumber ? columnOffset : 0)
            });
            const newRange = textLength.createRange(newRangeStart);
            newRanges.push(newRange);
            lineOffset = newRange.endLineNumber - replacement.range.endLineNumber;
            columnOffset = newRange.endColumn - replacement.range.endColumn;
            previousEditEndLineNumber = replacement.range.endLineNumber;
        }
        return newRanges;
    }
    toReplacement(text) {
        if (this.replacements.length === 0) {
            throw new BugIndicatingError();
        }
        if (this.replacements.length === 1) {
            return this.replacements[0];
        }
        const startPos = this.replacements[0].range.getStartPosition();
        const endPos = this.replacements[this.replacements.length - 1].range.getEndPosition();
        let newText = '';
        for (let i = 0; i < this.replacements.length; i++) {
            const curEdit = this.replacements[i];
            newText += curEdit.text;
            if (i < this.replacements.length - 1) {
                const nextEdit = this.replacements[i + 1];
                const gapRange = Range.fromPositions(curEdit.range.getEndPosition(), nextEdit.range.getStartPosition());
                const gapText = text.getValueOfRange(gapRange);
                newText += gapText;
            }
        }
        return new TextReplacement(Range.fromPositions(startPos, endPos), newText);
    }
    equals(other) {
        return equals(this.replacements, other.replacements, (a, b) => a.equals(b));
    }
    /**
     * Combines two edits into one with the same effect.
     * WARNING: This is written by AI, but well tested. I do not understand the implementation myself.
     *
     * Invariant:
     * ```
     * other.applyToString(this.applyToString(s0)) = this.compose(other).applyToString(s0)
     * ```
     */
    compose(other) {
        const edits1 = this.normalize();
        const edits2 = other.normalize();
        if (edits1.replacements.length === 0) {
            return edits2;
        }
        if (edits2.replacements.length === 0) {
            return edits1;
        }
        const resultReplacements = [];
        let edit1Idx = 0;
        let lastEdit1EndS0Line = 1;
        let lastEdit1EndS0Col = 1;
        let headSrcRangeStartLine = 0;
        let headSrcRangeStartCol = 0;
        let headSrcRangeEndLine = 0;
        let headSrcRangeEndCol = 0;
        let headText = null;
        let headLengthLine = 0;
        let headLengthCol = 0;
        let headHasValue = false;
        let headIsInfinite = false;
        let currentPosInS1Line = 1;
        let currentPosInS1Col = 1;
        function ensureHead() {
            if (headHasValue) {
                return;
            }
            if (edit1Idx < edits1.replacements.length) {
                const nextEdit = edits1.replacements[edit1Idx];
                const nextEditStart = nextEdit.range.getStartPosition();
                const gapIsEmpty = (lastEdit1EndS0Line === nextEditStart.lineNumber) && (lastEdit1EndS0Col === nextEditStart.column);
                if (!gapIsEmpty) {
                    headSrcRangeStartLine = lastEdit1EndS0Line;
                    headSrcRangeStartCol = lastEdit1EndS0Col;
                    headSrcRangeEndLine = nextEditStart.lineNumber;
                    headSrcRangeEndCol = nextEditStart.column;
                    headText = null;
                    if (lastEdit1EndS0Line === nextEditStart.lineNumber) {
                        headLengthLine = 0;
                        headLengthCol = nextEditStart.column - lastEdit1EndS0Col;
                    }
                    else {
                        headLengthLine = nextEditStart.lineNumber - lastEdit1EndS0Line;
                        headLengthCol = nextEditStart.column - 1;
                    }
                    headHasValue = true;
                    lastEdit1EndS0Line = nextEditStart.lineNumber;
                    lastEdit1EndS0Col = nextEditStart.column;
                }
                else {
                    const nextEditEnd = nextEdit.range.getEndPosition();
                    headSrcRangeStartLine = nextEditStart.lineNumber;
                    headSrcRangeStartCol = nextEditStart.column;
                    headSrcRangeEndLine = nextEditEnd.lineNumber;
                    headSrcRangeEndCol = nextEditEnd.column;
                    headText = nextEdit.text;
                    let line = 0;
                    let column = 0;
                    const text = nextEdit.text;
                    for (let i = 0; i < text.length; i++) {
                        if (text.charCodeAt(i) === 10) {
                            line++;
                            column = 0;
                        }
                        else {
                            column++;
                        }
                    }
                    headLengthLine = line;
                    headLengthCol = column;
                    headHasValue = true;
                    lastEdit1EndS0Line = nextEditEnd.lineNumber;
                    lastEdit1EndS0Col = nextEditEnd.column;
                    edit1Idx++;
                }
            }
            else {
                headIsInfinite = true;
                headSrcRangeStartLine = lastEdit1EndS0Line;
                headSrcRangeStartCol = lastEdit1EndS0Col;
                headHasValue = true;
            }
        }
        function splitText(text, lenLine, lenCol) {
            if (lenLine === 0 && lenCol === 0) {
                return ['', text];
            }
            let line = 0;
            let offset = 0;
            while (line < lenLine) {
                const idx = text.indexOf('\n', offset);
                if (idx === -1) {
                    throw new BugIndicatingError('Text length mismatch');
                }
                offset = idx + 1;
                line++;
            }
            offset += lenCol;
            return [text.substring(0, offset), text.substring(offset)];
        }
        for (const r2 of edits2.replacements) {
            const r2Start = r2.range.getStartPosition();
            const r2End = r2.range.getEndPosition();
            while (true) {
                if (currentPosInS1Line === r2Start.lineNumber && currentPosInS1Col === r2Start.column) {
                    break;
                }
                ensureHead();
                if (headIsInfinite) {
                    let distLine, distCol;
                    if (currentPosInS1Line === r2Start.lineNumber) {
                        distLine = 0;
                        distCol = r2Start.column - currentPosInS1Col;
                    }
                    else {
                        distLine = r2Start.lineNumber - currentPosInS1Line;
                        distCol = r2Start.column - 1;
                    }
                    currentPosInS1Line = r2Start.lineNumber;
                    currentPosInS1Col = r2Start.column;
                    if (distLine === 0) {
                        headSrcRangeStartCol += distCol;
                    }
                    else {
                        headSrcRangeStartLine += distLine;
                        headSrcRangeStartCol = distCol + 1;
                    }
                    break;
                }
                let headEndInS1Line, headEndInS1Col;
                if (headLengthLine === 0) {
                    headEndInS1Line = currentPosInS1Line;
                    headEndInS1Col = currentPosInS1Col + headLengthCol;
                }
                else {
                    headEndInS1Line = currentPosInS1Line + headLengthLine;
                    headEndInS1Col = headLengthCol + 1;
                }
                let r2StartIsBeforeHeadEnd = false;
                if (r2Start.lineNumber < headEndInS1Line) {
                    r2StartIsBeforeHeadEnd = true;
                }
                else if (r2Start.lineNumber === headEndInS1Line) {
                    r2StartIsBeforeHeadEnd = r2Start.column < headEndInS1Col;
                }
                if (r2StartIsBeforeHeadEnd) {
                    let splitLenLine, splitLenCol;
                    if (currentPosInS1Line === r2Start.lineNumber) {
                        splitLenLine = 0;
                        splitLenCol = r2Start.column - currentPosInS1Col;
                    }
                    else {
                        splitLenLine = r2Start.lineNumber - currentPosInS1Line;
                        splitLenCol = r2Start.column - 1;
                    }
                    let remainingLenLine, remainingLenCol;
                    if (splitLenLine === headLengthLine) {
                        remainingLenLine = 0;
                        remainingLenCol = headLengthCol - splitLenCol;
                    }
                    else {
                        remainingLenLine = headLengthLine - splitLenLine;
                        remainingLenCol = headLengthCol;
                    }
                    if (headText !== null) {
                        const [t1, t2] = splitText(headText, splitLenLine, splitLenCol);
                        resultReplacements.push(new TextReplacement(new Range(headSrcRangeStartLine, headSrcRangeStartCol, headSrcRangeEndLine, headSrcRangeEndCol), t1));
                        headText = t2;
                        headLengthLine = remainingLenLine;
                        headLengthCol = remainingLenCol;
                        headSrcRangeStartLine = headSrcRangeEndLine;
                        headSrcRangeStartCol = headSrcRangeEndCol;
                    }
                    else {
                        let splitPosLine, splitPosCol;
                        if (splitLenLine === 0) {
                            splitPosLine = headSrcRangeStartLine;
                            splitPosCol = headSrcRangeStartCol + splitLenCol;
                        }
                        else {
                            splitPosLine = headSrcRangeStartLine + splitLenLine;
                            splitPosCol = splitLenCol + 1;
                        }
                        headSrcRangeStartLine = splitPosLine;
                        headSrcRangeStartCol = splitPosCol;
                        headLengthLine = remainingLenLine;
                        headLengthCol = remainingLenCol;
                    }
                    currentPosInS1Line = r2Start.lineNumber;
                    currentPosInS1Col = r2Start.column;
                    break;
                }
                if (headText !== null) {
                    resultReplacements.push(new TextReplacement(new Range(headSrcRangeStartLine, headSrcRangeStartCol, headSrcRangeEndLine, headSrcRangeEndCol), headText));
                }
                currentPosInS1Line = headEndInS1Line;
                currentPosInS1Col = headEndInS1Col;
                headHasValue = false;
            }
            let consumedStartS0Line = null;
            let consumedStartS0Col = null;
            let consumedEndS0Line = null;
            let consumedEndS0Col = null;
            while (true) {
                if (currentPosInS1Line === r2End.lineNumber && currentPosInS1Col === r2End.column) {
                    break;
                }
                ensureHead();
                if (headIsInfinite) {
                    let distLine, distCol;
                    if (currentPosInS1Line === r2End.lineNumber) {
                        distLine = 0;
                        distCol = r2End.column - currentPosInS1Col;
                    }
                    else {
                        distLine = r2End.lineNumber - currentPosInS1Line;
                        distCol = r2End.column - 1;
                    }
                    let rangeInS0EndLine, rangeInS0EndCol;
                    if (distLine === 0) {
                        rangeInS0EndLine = headSrcRangeStartLine;
                        rangeInS0EndCol = headSrcRangeStartCol + distCol;
                    }
                    else {
                        rangeInS0EndLine = headSrcRangeStartLine + distLine;
                        rangeInS0EndCol = distCol + 1;
                    }
                    if (consumedStartS0Line === null) {
                        consumedStartS0Line = headSrcRangeStartLine;
                        consumedStartS0Col = headSrcRangeStartCol;
                    }
                    consumedEndS0Line = rangeInS0EndLine;
                    consumedEndS0Col = rangeInS0EndCol;
                    currentPosInS1Line = r2End.lineNumber;
                    currentPosInS1Col = r2End.column;
                    headSrcRangeStartLine = rangeInS0EndLine;
                    headSrcRangeStartCol = rangeInS0EndCol;
                    break;
                }
                let headEndInS1Line, headEndInS1Col;
                if (headLengthLine === 0) {
                    headEndInS1Line = currentPosInS1Line;
                    headEndInS1Col = currentPosInS1Col + headLengthCol;
                }
                else {
                    headEndInS1Line = currentPosInS1Line + headLengthLine;
                    headEndInS1Col = headLengthCol + 1;
                }
                let r2EndIsBeforeHeadEnd = false;
                if (r2End.lineNumber < headEndInS1Line) {
                    r2EndIsBeforeHeadEnd = true;
                }
                else if (r2End.lineNumber === headEndInS1Line) {
                    r2EndIsBeforeHeadEnd = r2End.column < headEndInS1Col;
                }
                if (r2EndIsBeforeHeadEnd) {
                    let splitLenLine, splitLenCol;
                    if (currentPosInS1Line === r2End.lineNumber) {
                        splitLenLine = 0;
                        splitLenCol = r2End.column - currentPosInS1Col;
                    }
                    else {
                        splitLenLine = r2End.lineNumber - currentPosInS1Line;
                        splitLenCol = r2End.column - 1;
                    }
                    let remainingLenLine, remainingLenCol;
                    if (splitLenLine === headLengthLine) {
                        remainingLenLine = 0;
                        remainingLenCol = headLengthCol - splitLenCol;
                    }
                    else {
                        remainingLenLine = headLengthLine - splitLenLine;
                        remainingLenCol = headLengthCol;
                    }
                    if (headText !== null) {
                        if (consumedStartS0Line === null) {
                            consumedStartS0Line = headSrcRangeStartLine;
                            consumedStartS0Col = headSrcRangeStartCol;
                        }
                        consumedEndS0Line = headSrcRangeEndLine;
                        consumedEndS0Col = headSrcRangeEndCol;
                        const [, t2] = splitText(headText, splitLenLine, splitLenCol);
                        headText = t2;
                        headLengthLine = remainingLenLine;
                        headLengthCol = remainingLenCol;
                        headSrcRangeStartLine = headSrcRangeEndLine;
                        headSrcRangeStartCol = headSrcRangeEndCol;
                    }
                    else {
                        let splitPosLine, splitPosCol;
                        if (splitLenLine === 0) {
                            splitPosLine = headSrcRangeStartLine;
                            splitPosCol = headSrcRangeStartCol + splitLenCol;
                        }
                        else {
                            splitPosLine = headSrcRangeStartLine + splitLenLine;
                            splitPosCol = splitLenCol + 1;
                        }
                        if (consumedStartS0Line === null) {
                            consumedStartS0Line = headSrcRangeStartLine;
                            consumedStartS0Col = headSrcRangeStartCol;
                        }
                        consumedEndS0Line = splitPosLine;
                        consumedEndS0Col = splitPosCol;
                        headSrcRangeStartLine = splitPosLine;
                        headSrcRangeStartCol = splitPosCol;
                        headLengthLine = remainingLenLine;
                        headLengthCol = remainingLenCol;
                    }
                    currentPosInS1Line = r2End.lineNumber;
                    currentPosInS1Col = r2End.column;
                    break;
                }
                if (consumedStartS0Line === null) {
                    consumedStartS0Line = headSrcRangeStartLine;
                    consumedStartS0Col = headSrcRangeStartCol;
                }
                consumedEndS0Line = headSrcRangeEndLine;
                consumedEndS0Col = headSrcRangeEndCol;
                currentPosInS1Line = headEndInS1Line;
                currentPosInS1Col = headEndInS1Col;
                headHasValue = false;
            }
            if (consumedStartS0Line !== null) {
                resultReplacements.push(new TextReplacement(new Range(consumedStartS0Line, consumedStartS0Col, consumedEndS0Line, consumedEndS0Col), r2.text));
            }
            else {
                ensureHead();
                const insertPosS0Line = headSrcRangeStartLine;
                const insertPosS0Col = headSrcRangeStartCol;
                resultReplacements.push(new TextReplacement(new Range(insertPosS0Line, insertPosS0Col, insertPosS0Line, insertPosS0Col), r2.text));
            }
        }
        while (true) {
            ensureHead();
            if (headIsInfinite) {
                break;
            }
            if (headText !== null) {
                resultReplacements.push(new TextReplacement(new Range(headSrcRangeStartLine, headSrcRangeStartCol, headSrcRangeEndLine, headSrcRangeEndCol), headText));
            }
            headHasValue = false;
        }
        return new TextEdit(resultReplacements).normalize();
    }
    toString(text) {
        if (text === undefined) {
            return this.replacements.map(edit => edit.toString()).join('\n');
        }
        if (typeof text === 'string') {
            return this.toString(new StringText(text));
        }
        if (this.replacements.length === 0) {
            return '';
        }
        return this.replacements.map(r => {
            const maxLength = 10;
            const originalText = text.getValueOfRange(r.range);
            // Get text before the edit
            const beforeRange = Range.fromPositions(new Position(Math.max(1, r.range.startLineNumber - 1), 1), r.range.getStartPosition());
            let beforeText = text.getValueOfRange(beforeRange);
            if (beforeText.length > maxLength) {
                beforeText = '...' + beforeText.substring(beforeText.length - maxLength);
            }
            // Get text after the edit
            const afterRange = Range.fromPositions(r.range.getEndPosition(), new Position(r.range.endLineNumber + 1, 1));
            let afterText = text.getValueOfRange(afterRange);
            if (afterText.length > maxLength) {
                afterText = afterText.substring(0, maxLength) + '...';
            }
            // Format the replaced text
            let replacedText = originalText;
            if (replacedText.length > maxLength) {
                const halfMax = Math.floor(maxLength / 2);
                replacedText = replacedText.substring(0, halfMax) + '...' +
                    replacedText.substring(replacedText.length - halfMax);
            }
            // Format the new text
            let newText = r.text;
            if (newText.length > maxLength) {
                const halfMax = Math.floor(maxLength / 2);
                newText = newText.substring(0, halfMax) + '...' +
                    newText.substring(newText.length - halfMax);
            }
            if (replacedText.length === 0) {
                // allow-any-unicode-next-line
                return `${beforeText}❰${newText}❱${afterText}`;
            }
            // allow-any-unicode-next-line
            return `${beforeText}❰${replacedText}↦${newText}❱${afterText}`;
        }).join('\n');
    }
}
export class TextReplacement {
    static joinReplacements(replacements, initialValue) {
        if (replacements.length === 0) {
            throw new BugIndicatingError();
        }
        if (replacements.length === 1) {
            return replacements[0];
        }
        const startPos = replacements[0].range.getStartPosition();
        const endPos = replacements[replacements.length - 1].range.getEndPosition();
        let newText = '';
        for (let i = 0; i < replacements.length; i++) {
            const curEdit = replacements[i];
            newText += curEdit.text;
            if (i < replacements.length - 1) {
                const nextEdit = replacements[i + 1];
                const gapRange = Range.fromPositions(curEdit.range.getEndPosition(), nextEdit.range.getStartPosition());
                const gapText = initialValue.getValueOfRange(gapRange);
                newText += gapText;
            }
        }
        return new TextReplacement(Range.fromPositions(startPos, endPos), newText);
    }
    static fromStringReplacement(replacement, initialState) {
        return new TextReplacement(initialState.getTransformer().getRange(replacement.replaceRange), replacement.newText);
    }
    static delete(range) {
        return new TextReplacement(range, '');
    }
    constructor(range, text) {
        this.range = range;
        this.text = text;
    }
    get isEmpty() {
        return this.range.isEmpty() && this.text.length === 0;
    }
    static equals(first, second) {
        return first.range.equalsRange(second.range) && first.text === second.text;
    }
    toSingleEditOperation() {
        return {
            range: this.range,
            text: this.text,
        };
    }
    toEdit() {
        return new TextEdit([this]);
    }
    equals(other) {
        return TextReplacement.equals(this, other);
    }
    extendToCoverRange(range, initialValue) {
        if (this.range.containsRange(range)) {
            return this;
        }
        const newRange = this.range.plusRange(range);
        const textBefore = initialValue.getValueOfRange(Range.fromPositions(newRange.getStartPosition(), this.range.getStartPosition()));
        const textAfter = initialValue.getValueOfRange(Range.fromPositions(this.range.getEndPosition(), newRange.getEndPosition()));
        const newText = textBefore + this.text + textAfter;
        return new TextReplacement(newRange, newText);
    }
    extendToFullLine(initialValue) {
        const newRange = new Range(this.range.startLineNumber, 1, this.range.endLineNumber, initialValue.getTransformer().getLineLength(this.range.endLineNumber) + 1);
        return this.extendToCoverRange(newRange, initialValue);
    }
    removeCommonPrefixAndSuffix(text) {
        const prefix = this.removeCommonPrefix(text);
        const suffix = prefix.removeCommonSuffix(text);
        return suffix;
    }
    removeCommonPrefix(text) {
        const normalizedOriginalText = text.getValueOfRange(this.range).replaceAll('\r\n', '\n');
        const normalizedModifiedText = this.text.replaceAll('\r\n', '\n');
        const commonPrefixLen = commonPrefixLength(normalizedOriginalText, normalizedModifiedText);
        const start = TextLength.ofText(normalizedOriginalText.substring(0, commonPrefixLen))
            .addToPosition(this.range.getStartPosition());
        const newText = normalizedModifiedText.substring(commonPrefixLen);
        const range = Range.fromPositions(start, this.range.getEndPosition());
        return new TextReplacement(range, newText);
    }
    removeCommonSuffix(text) {
        const normalizedOriginalText = text.getValueOfRange(this.range).replaceAll('\r\n', '\n');
        const normalizedModifiedText = this.text.replaceAll('\r\n', '\n');
        const commonSuffixLen = commonSuffixLength(normalizedOriginalText, normalizedModifiedText);
        const end = TextLength.ofText(normalizedOriginalText.substring(0, normalizedOriginalText.length - commonSuffixLen))
            .addToPosition(this.range.getStartPosition());
        const newText = normalizedModifiedText.substring(0, normalizedModifiedText.length - commonSuffixLen);
        const range = Range.fromPositions(this.range.getStartPosition(), end);
        return new TextReplacement(range, newText);
    }
    isEffectiveDeletion(text) {
        let newText = this.text.replaceAll('\r\n', '\n');
        let existingText = text.getValueOfRange(this.range).replaceAll('\r\n', '\n');
        const l = commonPrefixLength(newText, existingText);
        newText = newText.substring(l);
        existingText = existingText.substring(l);
        const r = commonSuffixLength(newText, existingText);
        newText = newText.substring(0, newText.length - r);
        existingText = existingText.substring(0, existingText.length - r);
        return newText === '';
    }
    toString() {
        const start = this.range.getStartPosition();
        const end = this.range.getEndPosition();
        return `(${start.lineNumber},${start.column} -> ${end.lineNumber},${end.column}): "${this.text}"`;
    }
}
function rangeFromPositions(start, end) {
    if (start.lineNumber === end.lineNumber && start.column === Number.MAX_SAFE_INTEGER) {
        return Range.fromPositions(end, end);
    }
    else if (!start.isBeforeOrEqual(end)) {
        throw new BugIndicatingError('start must be before end');
    }
    return new Range(start.lineNumber, start.column, end.lineNumber, end.column);
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidGV4dEVkaXQuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy9lZGl0b3IvY29tbW9uL2NvcmUvZWRpdHMvdGV4dEVkaXQudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxFQUFFLFNBQVMsRUFBRSxNQUFNLEVBQUUsTUFBTSxtQ0FBbUMsQ0FBQztBQUN0RSxPQUFPLEVBQUUsUUFBUSxFQUFFLGtCQUFrQixFQUFFLE1BQU0sbUNBQW1DLENBQUM7QUFDakYsT0FBTyxFQUFFLGtCQUFrQixFQUFFLE1BQU0sbUNBQW1DLENBQUM7QUFDdkUsT0FBTyxFQUFFLGtCQUFrQixFQUFFLGtCQUFrQixFQUFFLE1BQU0sb0NBQW9DLENBQUM7QUFHNUYsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLGdCQUFnQixDQUFDO0FBQzFDLE9BQU8sRUFBRSxLQUFLLEVBQUUsTUFBTSxhQUFhLENBQUM7QUFDcEMsT0FBTyxFQUFFLFVBQVUsRUFBRSxNQUFNLHVCQUF1QixDQUFDO0FBQ25ELE9BQU8sRUFBZ0IsVUFBVSxFQUFFLE1BQU0seUJBQXlCLENBQUM7QUFHbkUsTUFBTSxPQUFPLFFBQVE7SUFDYixNQUFNLENBQUMsY0FBYyxDQUFDLElBQW9CLEVBQUUsWUFBMEI7UUFDNUUsTUFBTSxLQUFLLEdBQUcsSUFBSSxDQUFDLFlBQVksQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxlQUFlLENBQUMscUJBQXFCLENBQUMsQ0FBQyxFQUFFLFlBQVksQ0FBQyxDQUFDLENBQUM7UUFDakcsT0FBTyxJQUFJLFFBQVEsQ0FBQyxLQUFLLENBQUMsQ0FBQztJQUM1QixDQUFDO0lBRU0sTUFBTSxDQUFDLE9BQU8sQ0FBQyxhQUFvQixFQUFFLE9BQWU7UUFDMUQsT0FBTyxJQUFJLFFBQVEsQ0FBQyxDQUFDLElBQUksZUFBZSxDQUFDLGFBQWEsRUFBRSxPQUFP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