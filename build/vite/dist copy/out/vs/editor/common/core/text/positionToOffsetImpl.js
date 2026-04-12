/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { findLastIdxMonotonous } from '../../../../base/common/arraysFind.js';
import { OffsetRange } from '../ranges/offsetRange.js';
import { Position } from '../position.js';
import { Range } from '../range.js';
export class PositionOffsetTransformerBase {
    getOffsetRange(range) {
        return new OffsetRange(this.getOffset(range.getStartPosition()), this.getOffset(range.getEndPosition()));
    }
    getRange(offsetRange) {
        return Range.fromPositions(this.getPosition(offsetRange.start), this.getPosition(offsetRange.endExclusive));
    }
    getStringEdit(edit) {
        const edits = edit.replacements.map(e => this.getStringReplacement(e));
        return new Deps.deps.StringEdit(edits);
    }
    getStringReplacement(edit) {
        return new Deps.deps.StringReplacement(this.getOffsetRange(edit.range), edit.text);
    }
    getTextReplacement(edit) {
        return new Deps.deps.TextReplacement(this.getRange(edit.replaceRange), edit.newText);
    }
    getTextEdit(edit) {
        const edits = edit.replacements.map(e => this.getTextReplacement(e));
        return new Deps.deps.TextEdit(edits);
    }
}
class Deps {
    static { this._deps = undefined; }
    static get deps() {
        if (!this._deps) {
            throw new Error('Dependencies not set. Call _setDependencies first.');
        }
        return this._deps;
    }
}
/** This is to break circular module dependencies. */
export function _setPositionOffsetTransformerDependencies(deps) {
    Deps._deps = deps;
}
export class PositionOffsetTransformer extends PositionOffsetTransformerBase {
    constructor(text) {
        super();
        this.text = text;
    }
    get lineStartOffsetByLineIdx() {
        if (!this._lineStartOffsetByLineIdx) {
            this._computeLineOffsets();
        }
        return this._lineStartOffsetByLineIdx;
    }
    get lineEndOffsetByLineIdx() {
        if (!this._lineEndOffsetByLineIdx) {
            this._computeLineOffsets();
        }
        return this._lineEndOffsetByLineIdx;
    }
    _computeLineOffsets() {
        this._lineStartOffsetByLineIdx = [];
        this._lineEndOffsetByLineIdx = [];
        this._lineStartOffsetByLineIdx.push(0);
        for (let i = 0; i < this.text.length; i++) {
            if (this.text.charAt(i) === '\n') {
                this._lineStartOffsetByLineIdx.push(i + 1);
                if (i > 0 && this.text.charAt(i - 1) === '\r') {
                    this._lineEndOffsetByLineIdx.push(i - 1);
                }
                else {
                    this._lineEndOffsetByLineIdx.push(i);
                }
            }
        }
        this._lineEndOffsetByLineIdx.push(this.text.length);
    }
    getOffset(position) {
        const valPos = this._validatePosition(position);
        return this.lineStartOffsetByLineIdx[valPos.lineNumber - 1] + valPos.column - 1;
    }
    _validatePosition(position) {
        if (position.lineNumber < 1) {
            return new Position(1, 1);
        }
        const lineCount = this.textLength.lineCount + 1;
        if (position.lineNumber > lineCount) {
            const lineLength = this.getLineLength(lineCount);
            return new Position(lineCount, lineLength + 1);
        }
        if (position.column < 1) {
            return new Position(position.lineNumber, 1);
        }
        const lineLength = this.getLineLength(position.lineNumber);
        if (position.column - 1 > lineLength) {
            return new Position(position.lineNumber, lineLength + 1);
        }
        return position;
    }
    getPosition(offset) {
        const idx = findLastIdxMonotonous(this.lineStartOffsetByLineIdx, i => i <= offset);
        const lineNumber = idx + 1;
        const column = offset - this.lineStartOffsetByLineIdx[idx] + 1;
        return new Position(lineNumber, column);
    }
    getTextLength(offsetRange) {
        return Deps.deps.TextLength.ofRange(this.getRange(offsetRange));
    }
    get textLength() {
        const lineIdx = this.lineStartOffsetByLineIdx.length - 1;
        return new Deps.deps.TextLength(lineIdx, this.text.length - this.lineStartOffsetByLineIdx[lineIdx]);
    }
    getLineLength(lineNumber) {
        return this.lineEndOffsetByLineIdx[lineNumber - 1] - this.lineStartOffsetByLineIdx[lineNumber - 1];
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicG9zaXRpb25Ub09mZnNldEltcGwuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy9lZGl0b3IvY29tbW9uL2NvcmUvdGV4dC9wb3NpdGlvblRvT2Zmc2V0SW1wbC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRyxPQUFPLEVBQUUscUJBQXFCLEVBQUUsTUFBTSx1Q0FBdUMsQ0FBQztBQUU5RSxPQUFPLEVBQUUsV0FBVyxFQUFFLE1BQU0sMEJBQTBCLENBQUM7QUFDdkQsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLGdCQUFnQixDQUFDO0FBQzFDLE9BQU8sRUFBRSxLQUFLLEVBQUUsTUFBTSxhQUFhLENBQUM7QUFJcEMsTUFBTSxPQUFnQiw2QkFBNkI7SUFHbEQsY0FBYyxDQUFDLEtBQVk7UUFDMUIsT0FBTyxJQUFJLFdBQVcsQ0FDckIsSUFBSSxDQUFDLFNBQVMsQ0FBQyxLQUFLLENBQUMsZ0JBQWdCLEVBQUUsQ0FBQyxFQUN4QyxJQUFJLENBQUMsU0FBUyxDQUFDLEtBQUssQ0FBQyxjQUFjLEVBQUUsQ0FBQyxDQUN0QyxDQUFDO0lBQ0gsQ0FBQztJQUlELFFBQVEsQ0FBQyxXQUF3QjtRQUNoQyxPQUFPLEtBQUssQ0FBQyxhQUFhLENBQ3pCLElBQUksQ0FBQyxXQUFXLENBQUMsV0FBVyxDQUFDLEtBQUssQ0FBQyxFQUNuQyxJQUFJLENBQUMsV0FBVyxDQUFDLFdBQVcsQ0FBQyxZQUFZLENBQUMsQ0FDMUMsQ0FBQztJQUNILENBQUM7SUFFRCxhQUFhLENBQUMsSUFBYztRQUMzQixNQUFNLEtBQUssR0FBRyxJQUFJLENBQUMsWUFBWSxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLElBQUksQ0FBQyxvQkFBb0IsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO1FBQ3ZFLE9BQU8sSUFBSSxJQUFJLENBQUMsSUFBSSxDQUFDLFVBQVUs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