/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { Position } from '../core/position.js';
import { Range } from '../core/range.js';
import { countEOL } from '../core/misc/eolCounter.js';
import { RateLimiter } from './common.js';
/**
 * Represents sparse tokens over a contiguous range of lines.
 */
export class SparseMultilineTokens {
    static create(startLineNumber, tokens) {
        return new SparseMultilineTokens(startLineNumber, new SparseMultilineTokensStorage(tokens));
    }
    /**
     * (Inclusive) start line number for these tokens.
     */
    get startLineNumber() {
        return this._startLineNumber;
    }
    /**
     * (Inclusive) end line number for these tokens.
     */
    get endLineNumber() {
        return this._endLineNumber;
    }
    constructor(startLineNumber, tokens) {
        this._startLineNumber = startLineNumber;
        this._tokens = tokens;
        this._endLineNumber = this._startLineNumber + this._tokens.getMaxDeltaLine();
    }
    toString() {
        return this._tokens.toString(this._startLineNumber);
    }
    _updateEndLineNumber() {
        this._endLineNumber = this._startLineNumber + this._tokens.getMaxDeltaLine();
    }
    isEmpty() {
        return this._tokens.isEmpty();
    }
    getLineTokens(lineNumber) {
        if (this._startLineNumber <= lineNumber && lineNumber <= this._endLineNumber) {
            return this._tokens.getLineTokens(lineNumber - this._startLineNumber);
        }
        return null;
    }
    getRange() {
        const deltaRange = this._tokens.getRange();
        if (!deltaRange) {
            return deltaRange;
        }
        return new Range(this._startLineNumber + deltaRange.startLineNumber, deltaRange.startColumn, this._startLineNumber + deltaRange.endLineNumber, deltaRange.endColumn);
    }
    removeTokens(range) {
        const startLineIndex = range.startLineNumber - this._startLineNumber;
        const endLineIndex = range.endLineNumber - this._startLineNumber;
        this._startLineNumber += this._tokens.removeTokens(startLineIndex, range.startColumn - 1, endLineIndex, range.endColumn - 1);
        this._updateEndLineNumber();
    }
    split(range) {
        // split tokens to two:
        // a) all the tokens before `range`
        // b) all the tokens after `range`
        const startLineIndex = range.startLineNumber - this._startLineNumber;
        const endLineIndex = range.endLineNumber - this._startLineNumber;
        const [a, b, bDeltaLine] = this._tokens.split(startLineIndex, range.startColumn - 1, endLineIndex, range.endColumn - 1);
        return [new SparseMultilineTokens(this._startLineNumber, a), new SparseMultilineTokens(this._startLineNumber + bDeltaLine, b)];
    }
    applyEdit(range, text) {
        const [eolCount, firstLineLength, lastLineLength] = countEOL(text);
        this.acceptEdit(range, eolCount, firstLineLength, lastLineLength, text.length > 0 ? text.charCodeAt(0) : 0 /* CharCode.Null */);
    }
    acceptEdit(range, eolCount, firstLineLength, lastLineLength, firstCharCode) {
        this._acceptDeleteRange(range);
        this._acceptInsertText(new Position(range.startLineNumber, range.startColumn), eolCount, firstLineLength, lastLineLength, firstCharCode);
        this._updateEndLineNumber();
    }
    _acceptDeleteRange(range) {
        if (range.startLineNumber === range.endLineNumber && range.startColumn === range.endColumn) {
            // Nothing to delete
            return;
        }
        const firstLineIndex = range.startLineNumber - this._startLineNumber;
        const lastLineIndex = range.endLineNumber - this._startLineNumber;
        if (lastLineIndex < 0) {
            // this deletion occurs entirely before this block, so we only need to adjust line numbers
            const deletedLinesCount = lastLineIndex - firstLineIndex;
            this._startLineNumber -= deletedLinesCount;
            return;
        }
        const tokenMaxDeltaLine = this._tokens.getMaxDeltaLine();
        if (firstLineIndex >= tokenMaxDeltaLine + 1) {
            // this deletion occurs entirely after this block, so there is nothing to do
            return;
        }
        if (firstLineIndex < 0 && lastLineIndex >= tokenMaxDeltaLine + 1) {
            // this deletion completely encompasses this block
            this._startLineNumber = 0;
            this._tokens.clear();
            return;
        }
        if (firstLineIndex < 0) {
            const deletedBefore = -firstLineIndex;
            this._startLineNumber -= deletedBefore;
            this._tokens.acceptDeleteRange(range.startColumn - 1, 0, 0, lastLineIndex, range.endColumn - 1);
        }
        else {
            this._tokens.acceptDeleteRange(0, firstLineIndex, range.startColumn - 1, lastLineIndex, range.endColumn - 1);
        }
    }
    _acceptInsertText(position, eolCount, firstLineLength, lastLineLength, firstCharCode) {
        if (eolCount === 0 && firstLineLength === 0) {
            // Nothing to insert
            return;
        }
        const lineIndex = position.lineNumber - this._startLineNumber;
        if (lineIndex < 0) {
            // this insertion occurs before this block, so we only need to adjust line numbers
            this._startLineNumber += eolCount;
            return;
        }
        const tokenMaxDeltaLine = this._tokens.getMaxDeltaLine();
        if (lineIndex >= tokenMaxDeltaLine + 1) {
            // this insertion occurs after this block, so there is nothing to do
            return;
        }
        this._tokens.acceptInsertText(lineIndex, position.column - 1, eolCount, firstLineLength, lastLineLength, firstCharCode);
    }
    reportIfInvalid(model) {
        this._tokens.reportIfInvalid(model, this._startLineNumber);
    }
}
class SparseMultilineTokensStorage {
    constructor(tokens) {
        this._tokens = tokens;
        this._tokenCount = tokens.length / 4;
    }
    toString(startLineNumber) {
        const pieces = [];
        for (let i = 0; i < this._tokenCount; i++) {
            pieces.push(`(${this._getDeltaLine(i) + startLineNumber},${this._getStartCharacter(i)}-${this._getEndCharacter(i)})`);
        }
        return `[${pieces.join(',')}]`;
    }
    getMaxDeltaLine() {
        const tokenCount = this._getTokenCount();
        if (tokenCount === 0) {
            return -1;
        }
        return this._getDeltaLine(tokenCount - 1);
    }
    getRange() {
        const tokenCount = this._getTokenCount();
        if (tokenCount === 0) {
            return null;
        }
        const startChar = this._getStartCharacter(0);
        const maxDeltaLine = this._getDeltaLine(tokenCount - 1);
        const endChar = this._getEndCharacter(tokenCount - 1);
        return new Range(0, startChar + 1, maxDeltaLine, endChar + 1);
    }
    _getTokenCount() {
        return this._tokenCount;
    }
    _getDeltaLine(tokenIndex) {
        return this._tokens[4 * tokenIndex];
    }
    _getStartCharacter(tokenIndex) {
        return this._tokens[4 * tokenIndex + 1];
    }
    _getEndCharacter(tokenIndex) {
        return this._tokens[4 * tokenIndex + 2];
    }
    isEmpty() {
        return (this._getTokenCount() === 0);
    }
    getLineTokens(deltaLine) {
        let low = 0;
        let high = this._getTokenCount() - 1;
        while (low < high) {
            const mid = low + Math.floor((high - low) / 2);
            const midDeltaLine = this._getDeltaLine(mid);
            if (midDeltaLine < deltaLine) {
                low = mid + 1;
            }
            else if (midDeltaLine > deltaLine) {
                high = mid - 1;
            }
            else {
                let min = mid;
                while (min > low && this._getDeltaLine(min - 1) === deltaLine) {
                    min--;
                }
                let max = mid;
                while (max < high && this._getDeltaLine(max + 1) === deltaLine) {
                    max++;
                }
                return new SparseLineTokens(this._tokens.subarray(4 * min, 4 * max + 4));
            }
        }
        if (this._getDeltaLine(low) === deltaLine) {
            return new SparseLineTokens(this._tokens.subarray(4 * low, 4 * low + 4));
        }
        return null;
    }
    clear() {
        this._tokenCount = 0;
    }
    removeTokens(startDeltaLine, startChar, endDeltaLine, endChar) {
        const tokens = this._tokens;
        const tokenCount = this._tokenCount;
        let newTokenCount = 0;
        let hasDeletedTokens = false;
        let firstDeltaLine = 0;
        for (let i = 0; i < tokenCount; i++) {
            const srcOffset = 4 * i;
            const tokenDeltaLine = tokens[srcOffset];
            const tokenStartCharacter = tokens[srcOffset + 1];
            const tokenEndCharacter = tokens[srcOffset + 2];
            const tokenMetadata = tokens[srcOffset + 3];
            if ((tokenDeltaLine > startDeltaLine || (tokenDeltaLine === startDeltaLine && tokenEndCharacter >= startChar))
                && (tokenDeltaLine < endDeltaLine || (tokenDeltaLine === endDeltaLine && tokenStartCharacter <= endChar))) {
                hasDeletedTokens = true;
            }
            else {
                if (newTokenCount === 0) {
                    firstDeltaLine = tokenDeltaLine;
                }
                if (hasDeletedTokens) {
                    // must move the token to the left
                    const destOffset = 4 * newTokenCount;
                    tokens[destOffset] = tokenDeltaLine - firstDeltaLine;
                    tokens[destOffset + 1] = tokenStartCharacter;
                    tokens[destOffset + 2] = tokenEndCharacter;
                    tokens[destOffset + 3] = tokenMetadata;
                }
                else if (firstDeltaLine !== 0) {
                    // must adjust the delta line in place
                    tokens[srcOffset] = tokenDeltaLine - firstDeltaLine;
                }
                newTokenCount++;
            }
        }
        this._tokenCount = newTokenCount;
        return firstDeltaLine;
    }
    split(startDeltaLine, startChar, endDeltaLine, endChar) {
        const tokens = this._tokens;
        const tokenCount = this._tokenCount;
        const aTokens = [];
        const bTokens = [];
        let destTokens = aTokens;
        let destOffset = 0;
        let destFirstDeltaLine = 0;
        for (let i = 0; i < tokenCount; i++) {
            const srcOffset = 4 * i;
            const tokenDeltaLine = tokens[srcOffset];
            const tokenStartCharacter = tokens[srcOffset + 1];
            const tokenEndCharacter = tokens[srcOffset + 2];
            const tokenMetadata = tokens[srcOffset + 3];
            if ((tokenDeltaLine > startDeltaLine || (tokenDeltaLine === startDeltaLine && tokenEndCharacter >= startChar))) {
                if ((tokenDeltaLine < endDeltaLine || (tokenDeltaLine === endDeltaLine && tokenStartCharacter <= endChar))) {
                    // this token is touching the range
                    continue;
                }
                else {
                    // this token is after the range
                    if (destTokens !== bTokens) {
                        // this token is the first token after the range
                        destTokens = bTokens;
                        destOffset = 0;
                        destFirstDeltaLine = tokenDeltaLine;
                    }
                }
            }
            destTokens[destOffset++] = tokenDeltaLine - destFirstDeltaLine;
            destTokens[destOffset++] = tokenStartCharacter;
            destTokens[destOffset++] = tokenEndCharacter;
            destTokens[destOffset++] = tokenMetadata;
        }
        return [new SparseMultilineTokensStorage(new Uint32Array(aTokens)), new SparseMultilineTokensStorage(new Uint32Array(bTokens)), destFirstDeltaLine];
    }
    acceptDeleteRange(horizontalShiftForFirstLineTokens, startDeltaLine, startCharacter, endDeltaLine, endCharacter) {
        // This is a bit complex, here are the cases I used to think about this:
        //
        // 1. The token starts before the deletion range
        // 1a. The token is completely before the deletion range
        //               -----------
        //                          xxxxxxxxxxx
        // 1b. The token starts before, the deletion range ends after the token
        //               -----------
        //                      xxxxxxxxxxx
        // 1c. The token starts before, the deletion range ends precisely with the token
        //               ---------------
        //                      xxxxxxxx
        // 1d. The token starts before, the deletion range is inside the token
        //               ---------------
        //                    xxxxx
        //
        // 2. The token starts at the same position with the deletion range
        // 2a. The token starts at the same position, and ends inside the deletion range
        //               -------
        //               xxxxxxxxxxx
        // 2b. The token starts at the same position, and ends at the same position as the deletion range
        //               ----------
        //               xxxxxxxxxx
        // 2c. The token starts at the same position, and ends after the deletion range
        //               -------------
        //               xxxxxxx
        //
        // 3. The token starts inside the deletion range
        // 3a. The token is inside the deletion range
        //                -------
        //             xxxxxxxxxxxxx
        // 3b. The token starts inside the deletion range, and ends at the same position as the deletion range
        //                ----------
        //             xxxxxxxxxxxxx
        // 3c. The token starts inside the deletion range, and ends after the deletion range
        //                ------------
        //             xxxxxxxxxxx
        //
        // 4. The token starts after the deletion range
        //                  -----------
        //          xxxxxxxx
        //
        const tokens = this._tokens;
        const tokenCount = this._tokenCount;
        const deletedLineCount = (endDeltaLine - startDeltaLine);
        let newTokenCount = 0;
        let hasDeletedTokens = false;
        for (let i = 0; i < tokenCount; i++) {
            const srcOffset = 4 * i;
            let tokenDeltaLine = tokens[srcOffset];
            let tokenStartCharacter = tokens[srcOffset + 1];
            let tokenEndCharacter = tokens[srcOffset + 2];
            const tokenMetadata = tokens[srcOffset + 3];
            if (tokenDeltaLine < startDeltaLine || (tokenDeltaLine === startDeltaLine && tokenEndCharacter <= startCharacter)) {
                // 1a. The token is completely before the deletion range
                // => nothing to do
                newTokenCount++;
                continue;
            }
            else if (tokenDeltaLine === startDeltaLine && tokenStartCharacter < startCharacter) {
                // 1b, 1c, 1d
                // => the token survives, but it needs to shrink
                if (tokenDeltaLine === endDeltaLine && tokenEndCharacter > endCharacter) {
                    // 1d. The token starts before, the deletion range is inside the token
                    // => the token shrinks by the deletion character count
                    tokenEndCharacter -= (endCharacter - startCharacter);
                }
                else {
                    // 1b. The token starts before, the deletion range ends after the token
                    // 1c. The token starts before, the deletion range ends precisely with the token
                    // => the token shrinks its ending to the deletion start
                    tokenEndCharacter = startCharacter;
                }
            }
            else if (tokenDeltaLine === startDeltaLine && tokenStartCharacter === startCharacter) {
                // 2a, 2b, 2c
                if (tokenDeltaLine === endDeltaLine && tokenEndCharacter > endCharacter) {
                    // 2c. The token starts at the same position, and ends after the deletion range
                    // => the token shrinks by the deletion character count
                    tokenEndCharacter -= (endCharacter - startCharacter);
                }
                else {
                    // 2a. The token starts at the same position, and ends inside the deletion range
                    // 2b. The token starts at the same position, and ends at the same position as the deletion range
                    // => the token is deleted
                    hasDeletedTokens = true;
                    continue;
                }
            }
            else if (tokenDeltaLine < endDeltaLine || (tokenDeltaLine === endDeltaLine && tokenStartCharacter < endCharacter)) {
                // 3a, 3b, 3c
                if (tokenDeltaLine === endDeltaLine && tokenEndCharacter > endCharacter) {
                    // 3c. The token starts inside the deletion range, and ends after the deletion range
                    // => the token moves to continue right after the deletion
                    tokenDeltaLine = startDeltaLine;
                    tokenStartCharacter = startCharacter;
                    tokenEndCharacter = tokenStartCharacter + (tokenEndCharacter - endCharacter);
                }
                else {
                    // 3a. The token is inside the deletion range
                    // 3b. The token starts inside the deletion range, and ends at the same position as the deletion range
                    // => the token is deleted
                    hasDeletedTokens = true;
                    continue;
                }
            }
            else if (tokenDeltaLine > endDeltaLine) {
                // 4. (partial) The token starts after the deletion range, on a line below...
                if (deletedLineCount === 0 && !hasDeletedTokens) {
                    // early stop, there is no need to walk all the tokens and do nothing...
                    newTokenCount = tokenCount;
                    break;
                }
                tokenDeltaLine -= deletedLineCount;
            }
            else if (tokenDeltaLine === endDeltaLine && tokenStartCharacter >= endCharacter) {
                // 4. (continued) The token starts after the deletion range, on the last line where a deletion occurs
                if (horizontalShiftForFirstLineTokens && tokenDeltaLine === 0) {
                    tokenStartCharacter += horizontalShiftForFirstLineTokens;
                    tokenEndCharacter += horizontalShiftForFirstLineTokens;
                }
                tokenDeltaLine -= deletedLineCount;
                tokenStartCharacter -= (endCharacter - startCharacter);
                tokenEndCharacter -= (endCharacter - startCharacter);
            }
            else {
                throw new Error(`Not possible!`);
            }
            const destOffset = 4 * newTokenCount;
            tokens[destOffset] = tokenDeltaLine;
            tokens[destOffset + 1] = tokenStartCharacter;
            tokens[destOffset + 2] = tokenEndCharacter;
            tokens[destOffset + 3] = tokenMetadata;
            newTokenCount++;
        }
        this._tokenCount = newTokenCount;
    }
    acceptInsertText(deltaLine, character, eolCount, firstLineLength, lastLineLength, firstCharCode) {
        // Here are the cases I used to think about this:
        //
        // 1. The token is completely before the insertion point
        //            -----------   |
        // 2. The token ends precisely at the insertion point
        //            -----------|
        // 3. The token contains the insertion point
        //            -----|------
        // 4. The token starts precisely at the insertion point
        //            |-----------
        // 5. The token is completely after the insertion point
        //            |   -----------
        //
        const isInsertingPreciselyOneWordCharacter = (eolCount === 0
            && firstLineLength === 1
            && ((firstCharCode >= 48 /* CharCode.Digit0 */ && firstCharCode <= 57 /* CharCode.Digit9 */)
                || (firstCharCode >= 65 /* CharCode.A */ && firstCharCode <= 90 /* CharCode.Z */)
                || (firstCharCode >= 97 /* CharCode.a */ && firstCharCode <= 122 /* CharCode.z */)));
        const tokens = this._tokens;
        const tokenCount = this._tokenCount;
        for (let i = 0; i < tokenCount; i++) {
            const offset = 4 * i;
            let tokenDeltaLine = tokens[offset];
            let tokenStartCharacter = tokens[offset + 1];
            let tokenEndCharacter = tokens[offset + 2];
            if (tokenDeltaLine < deltaLine || (tokenDeltaLine === deltaLine && tokenEndCharacter < character)) {
                // 1. The token is completely before the insertion point
                // => nothing to do
                continue;
            }
            else if (tokenDeltaLine === deltaLine && tokenEndCharacter === character) {
                // 2. The token ends precisely at the insertion point
                // => expand the end character only if inserting precisely one character that is a word character
                if (isInsertingPreciselyOneWordCharacter) {
                    tokenEndCharacter += 1;
                }
                else {
                    continue;
                }
            }
            else if (tokenDeltaLine === deltaLine && tokenStartCharacter < character && character < tokenEndCharacter) {
                // 3. The token contains the insertion point
                if (eolCount === 0) {
                    // => just expand the end character
                    tokenEndCharacter += firstLineLength;
                }
                else {
                    // => cut off the token
                    tokenEndCharacter = character;
                }
            }
            else {
                // 4. or 5.
                if (tokenDeltaLine === deltaLine && tokenStartCharacter === character) {
                    // 4. The token starts precisely at the insertion point
                    // => grow the token (by keeping its start constant) only if inserting precisely one character that is a word character
                    // => otherwise behave as in case 5.
                    if (isInsertingPreciselyOneWordCharacter) {
                        continue;
                    }
                }
                // => the token must move and keep its size constant
                if (tokenDeltaLine === deltaLine) {
                    tokenDeltaLine += eolCount;
                    // this token is on the line where the insertion is taking place
                    if (eolCount === 0) {
                        tokenStartCharacter += firstLineLength;
                        tokenEndCharacter += firstLineLength;
                    }
                    else {
                        const tokenLength = tokenEndCharacter - tokenStartCharacter;
                        tokenStartCharacter = lastLineLength + (tokenStartCharacter - character);
                        tokenEndCharacter = tokenStartCharacter + tokenLength;
                    }
                }
                else {
                    tokenDeltaLine += eolCount;
                }
            }
            tokens[offset] = tokenDeltaLine;
            tokens[offset + 1] = tokenStartCharacter;
            tokens[offset + 2] = tokenEndCharacter;
        }
    }
    static { this._rateLimiter = new RateLimiter(10 / 60); } // limit to 10 times per minute
    reportIfInvalid(model, startLineNumber) {
        for (let i = 0; i < this._tokenCount; i++) {
            const lineNumber = this._getDeltaLine(i) + startLineNumber;
            if (lineNumber < 1) {
                SparseMultilineTokensStorage._rateLimiter.runIfNotLimited(() => {
                    console.error('Invalid Semantic Tokens Data From Extension: lineNumber < 1');
                });
            }
            else if (lineNumber > model.getLineCount()) {
                SparseMultilineTokensStorage._rateLimiter.runIfNotLimited(() => {
                    console.error('Invalid Semantic Tokens Data From Extension: lineNumber > model.getLineCount()');
                });
            }
            else if (this._getEndCharacter(i) > model.getLineLength(lineNumber)) {
                SparseMultilineTokensStorage._rateLimiter.runIfNotLimited(() => {
                    console.error('Invalid Semantic Tokens Data From Extension: end character > model.getLineLength(lineNumber)');
                });
            }
        }
    }
}
export class SparseLineTokens {
    constructor(tokens) {
        this._tokens = tokens;
    }
    getCount() {
        return this._tokens.length / 4;
    }
    getStartCharacter(tokenIndex) {
        return this._tokens[4 * tokenIndex + 1];
    }
    getEndCharacter(tokenIndex) {
        return this._tokens[4 * tokenIndex + 2];
    }
    getMetadata(tokenIndex) {
        return this._tokens[4 * tokenIndex + 3];
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic3BhcnNlTXVsdGlsaW5lVG9rZW5zLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvZWRpdG9yL2NvbW1vbi90b2tlbnMvc3BhcnNlTXVsdGlsaW5lVG9rZW5zLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBR2hHLE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSxxQkFBcUIsQ0FBQztBQUMvQyxPQUFPLEVBQVUsS0FBSyxFQUFFLE1BQU0sa0JBQWtCLENBQUM7QUFDakQsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLDRCQUE0QixDQUFDO0FBRXRELE9BQU8sRUFBRSxXQUFXLEVBQUUsTUFBTSxhQUFhLENBQUM7QUFFMUM7O0dBRUc7QUFDSCxNQUFNLE9BQU8scUJBQXFCO0lBRTFCLE1BQU0sQ0FBQyxNQUFNLENBQUMsZUFBdUIsRUFBRSxNQUFtQjtRQUNoRSxPQUFPLElBQUkscUJBQXFCLENBQUMsZUFBZSxFQUFFLElBQUksNEJBQTRCLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQztJQUM3RixDQUFDO0lBTUQ7O09BRUc7SUFDSCxJQUFXLGVBQWU7UUFDekIsT0FBTyxJQUFJLENBQUMsZ0JBQWdCLENBQUM7SUFDOUIsQ0FBQztJQUVEOztPQUVHO0lBQ0gsSUFBVyxhQUFhO1FBQ3ZCLE9BQU8sSUFBSSxDQUFDLGNBQWMsQ0FBQztJQUM1QixDQUFDO0lBRUQsWUFBb0IsZUFBdUIsRUFBRSxNQUFvQztRQUNoRixJQUFJLENBQUMsZ0JBQWdCLEdBQUcsZUFBZSxDQUFDO1FBQ3hDLElBQUksQ0FBQyxPQUFPLEdBQUcsTUFBTSxDQUFDO1FBQ3RCLElBQUksQ0FBQyxjQUFjLEdBQUcsSUFBSSxDQUFDLGdCQUFnQixHQUFHLElBQUksQ0FBQyxPQUFPLENBQUMsZUFBZSxFQUFFLENBQUM7SUFDOUUsQ0FBQztJQUVNLFFBQVE7UUFDZCxPQUFPLElBQUksQ0FBQyxPQUFPLENBQUMsUUFBUSxDQUFDLElBQUksQ0FBQyxnQkFBZ0IsQ0FBQyxDQUFDO0lBQ3JELENBQUM7SUFFTyxvQkFBb0I7UUFDM0IsSUFBSSxDQUFDLGNBQWMsR0FBRyxJQUFJLENBQUMsZ0JBQWdCLEdBQUcsSUFBSSxDQUFDLE9BQU8sQ0FBQyxlQUFlLEVBQUUsQ0FBQztJQUM5RSxDQUFDO0lBRU0sT0FBTztRQUNiLE9BQU8sSUFBSSxDQUFDLE9BQU8sQ0FBQyxPQUFPLEVBQUUsQ0FBQztJQUMvQixDQUFDO0lBRU0sYUFBYSxDQUFDLFVBQWtCO1FBQ3RDLElBQUksSUFBSSxDQUFDLGdCQUFnQixJQUFJLFVBQVUsSUFBSSxVQUFVLElBQUksSUFBSSxDQUFDLGNBQWMsRUFBRSxDQUFDO1lBQzlFLE9BQU8sSUFBSSxDQUFDLE9BQU8sQ0FBQyxhQUFhLENBQUMsVUFBVSxHQUFHLElBQUksQ0FBQyxnQkFBZ0IsQ0FBQyxDQUFDO1FBQ3ZFLENBQUM7UUFDRCxPQUFPLElBQUksQ0FBQztJQUNiLENBQUM7SUFFTSxRQUFRO1FBQ2QsTUFBTSxVQUFVLEdBQUcsSUFBSSxDQUFDLE9BQU8sQ0FBQyxRQUFRLEVBQUUsQ0FBQztRQUMzQyxJQUFJLENBQUMsVUFBVSxFQUFFLENBQUM7WUFDakIsT0FBTyxVQUFVLENBQUM7UUFDbkIsQ0FBQztRQUNELE9BQU8sSUFBSSxLQUFLLENBQUMsSUFBSSxDQUFDLGdCQUFnQixHQUFHLFVBQVUsQ0FBQyxlQUFlLEVBQUUsVUFBVSxDQUFDLFdBQVcsRUFBRSxJQUFJLENBQUMsZ0JBQWdCLEdBQUcsVUFBVSxDQUFDLGFBQWEsRUFBRSxVQUFVLENBQUMsU0FBUyxDQUFDLENBQUM7SUFDdEssQ0FBQztJQUVNLFlBQVksQ0FBQyxLQUFZO1FBQy9CLE1BQU0sY0FBYyxHQUFHLEtBQUssQ0FBQyxlQUFlLEdBQUcsSUFBSSxDQUFDLGdCQUFnQixDQUFDO1FBQ3JFLE1BQU0sWUFBWSxHQUFHLEtBQUssQ0FBQyxhQUFhLEdBQUcsSUFBSSxDQUFDLGdCQUFnQixDQUFDO1FBRWpFLElBQUksQ0FBQyxnQkFBZ0IsSUFBSSxJQUFJLENBQUMsT0FBTyxDQUFDLFlBQVksQ0FBQyxjQUFjLEVBQUUsS0FBSyxDQUFDLFdBQVcsR0FBRyxDQUFDLEVBQUUsWUFBWSxFQUFFLEtBQUssQ0FBQyxTQUFTLEdBQUcsQ0FBQyxDQUFDLENBQUM7UUFDN0gsSUFBSSxDQUFDLG9CQUFvQixFQUFFLENBQUM7SUFDN0IsQ0FBQztJQUVNLEtBQUssQ0FBQyxLQUFZO1FBQ3hCLHVCQUF1QjtRQUN2QixtQ0FBbUM7UUFDbkMsa0NBQWtDO1FBQ2xDLE1BQU0sY0FBYyxHQUFHLEtBQUssQ0FBQyxlQUFlLEdBQUcsSUFBSSxDQUFDLGdCQUFnQixDQUFDO1FBQ3JFLE1BQU0sWUFBWSxHQUFHLEtBQUssQ0FBQyxhQUFhLEdBQUcsSUFBSSxDQUFDLGdCQUFnQixDQUFDO1FBRWpFLE1BQU0sQ0FBQyxDQUFDLEVBQUUsQ0FBQyxFQUFFLFVBQVUsQ0FBQyxHQUFHLElBQUksQ0FBQyxPQUFPLENBQUMsS0FBSyxDQUFDLGNBQWMsRUFBRSxLQUFLLENBQUMsV0FBVyxHQUFHLENBQUMsRUFBRSxZQUFZLEVBQUUsS0FBSyxDQUFDLFNBQVMsR0FBRyxDQUFDLENBQUMsQ0FBQztRQUN4SCxPQUFPLENBQUMsSUFBSSxxQkFBcUIsQ0FBQyxJQUFJLENBQUMsZ0JBQWdCLEVBQUUsQ0FBQyxDQUFDLEVBQUUsSUFBSSxxQkFBcUIsQ0FBQyxJQUFJLENBQUMsZ0JBQWdCLEdBQUcsVUFBVSxFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUM7SUFDaEksQ0FBQztJQUVNLFNBQVMsQ0FBQyxLQUFhLEVBQUUsSUFBWTtRQUMzQyxNQUFNLENBQUMsUUFBUSxFQUFFLGVBQWUsRUFBRSxjQUFjLENBQUMsR0FBRyxRQUFRLENBQUMsSUFBSSxDQUFDLENBQUM7UUFDbkUsSUFBSSxDQUFDLFVBQVUsQ0FBQyxLQUFLLEVBQUUsUUFBUSxFQUFFLGVBQWUsRUFBRSxjQUFjLEVBQUUsSUFBSSxDQUFDLE1BQU0sR0FBRyxDQUFDLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxVQUFVLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxzQkFBYyxDQUFDLENBQUM7SUFDekgsQ0FBQztJQUVNLFVBQVUsQ0FBQyxLQUFhLEVBQUUsUUFBZ0IsRUFBRSxlQUF1QixFQUFFLGNBQXNCLEVBQUUsYUFBcUI7UUFDeEgsSUFBSSxDQUFDLGtCQUFrQixDQUFDLEtBQUssQ0FBQyxDQUFDO1FBQy9CLElBQUksQ0FBQyxpQkFBaUIsQ0FBQyxJQUFJLFFBQVEsQ0FBQyxLQUFLLENBQUMsZUFBZSxFQUFFLEtBQUssQ0FBQyxXQUFXLENBQUMsRUFBRSxRQUFRLEVBQUUsZUFBZSxFQUFFLGNBQWMsRUFBRSxhQUFhLENBQUMsQ0FBQztRQUN6SSxJQUFJLENBQUMsb0JBQW9CLEVBQUUsQ0FBQztJQUM3QixDQUFDO0lBRU8sa0JBQWtCLENBQUMsS0FBYTtRQUN2QyxJQUFJLEtBQUssQ0FBQyxlQUFlLEtBQUssS0FBSyxDQUFDLGFBQWEsSUFBSSxLQUFLLENBQUMsV0FBVyxLQUFLLEtBQUssQ0FBQyxTQUFTLEVBQUUsQ0FBQztZQUM1RixvQkFBb0I7WUFDcEIsT0FBTztRQUNSLENBQUM7UUFFRCxNQUFNLGNBQWMsR0FBRyxLQUFLLENBQUMsZUFBZSxHQUFHLElBQUksQ0FBQyxnQkFBZ0IsQ0FBQztRQUNyRSxNQUFNLGFBQWEsR0FBRyxLQUFLLENBQUMsYUFBYSxHQUFHLElBQUksQ0FBQyxnQkFBZ0IsQ0FBQztRQUVsRSxJQUFJLGFBQWEsR0FBRyxDQUFDLEVBQUUsQ0FBQztZQUN2QiwwRkFBMEY7WUFDMUYsTUFBTSxpQkFBaUIsR0FBRyxhQUFhLEdBQUcsY0FBYyxDQUFDO1lBQ3pELElBQUksQ0FBQyxnQkFBZ0IsSUFBSSxpQkFBaUIsQ0FBQztZQUMzQyxPQUFPO1FBQ1IsQ0FBQztRQUVELE1BQU0saUJBQWlCLEdBQUcsSUFBSSxDQUFDLE9BQU8sQ0FBQyxlQUFlLEVBQUUsQ0FBQztRQUV6RCxJQUFJLGNBQWMsSUFBSSxpQkFBaUIsR0FBRyxDQUFDLEVBQUUsQ0FBQztZQUM3Qyw0RUFBNEU7WUFDNUUsT0FBTztRQUNSLENBQUM7UUFFRCxJQUFJLGNBQWMsR0FBRyxDQUFDLElBQUksYUFBYSxJQUFJLGlCQUFpQixHQUFHLENBQUMsRUFBRSxDQUFDO1lBQ2xFLGtEQUFrRDtZQUNsRCxJQUFJLENBQUMsZ0JBQWdCLEdBQUcsQ0FBQyxDQUFDO1lBQzFCLElBQUksQ0FBQyxPQUFPLENBQUMsS0FBSyxFQUFFLENBQUM7WUFDckIsT0FBTztRQUNSLENBQUM7UUFFRCxJQUFJLGNBQWMsR0FBRyxDQUFDLEVBQUUsQ0FBQztZQUN4QixNQUFNLGFBQWEsR0FBRyxDQUFDLGNBQWMsQ0FBQztZQUN0QyxJQUFJLENBQUMsZ0JBQWdCLElBQUksYUFBYSxDQUFDO1lBRXZDLElBQUksQ0FBQyxPQUFPLENBQUMsaUJBQWlCLENBQUMsS0FBSyxDQUFDLFdBQVcsR0FBRyxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxhQUFhLEVBQUUsS0FBSyxDQUFDLFNBQVMsR0FBRyxDQUFDLENBQUMsQ0FBQztRQUNqRyxDQUFDO2FBQU0sQ0FBQztZQUNQLElBQUksQ0FBQyxPQUFPLENBQUMsaUJBQWlCLENBQUMsQ0FBQyxFQUFFLGNBQWMsRUFBRSxLQUFLLENBQUMsV0FBVyxHQUFHLENBQUMsRUFBRSxhQUFhLEVBQUUsS0FBSyxDQUFDLFNBQVMsR0FBRyxDQUFDLENBQUMsQ0FBQztRQUM5RyxDQUFDO0lBQ0YsQ0FBQztJQUVPLGlCQUFpQixDQUFDLFFBQWtCLEVBQUUsUUFBZ0IsRUFBRSxlQUF1QixFQUFFLGNBQXNCLEVBQUUsYUFBcUI7UUFFckksSUFBSSxRQUFRLEtBQUssQ0FBQyxJQUFJLGVBQWUsS0FBSyxDQUFDLEVBQUUsQ0FBQztZQUM3QyxvQkFBb0I7WUFDcEIsT0FBTztRQUNSLENBQUM7UUFFRCxNQUFNLFNBQVMsR0FBRyxRQUFRLENBQUMsVUFBVSxHQUFHLElBQUksQ0FBQyxnQkFBZ0IsQ0FBQztRQUU5RCxJQUFJLFNBQVMsR0FBRyxDQUFDLEVBQUUsQ0FBQztZQUNuQixrRkFBa0Y7WUFDbEYsSUFBSSxDQUFDLGdCQUFnQixJQUFJLFFBQVEsQ0FBQztZQUNsQyxPQUFPO1FBQ1IsQ0FBQztRQUVELE1BQU0saUJBQWlCLEdBQUcsSUFBSSxDQUFDLE9BQU8sQ0FBQyxlQUFlLEVBQUUsQ0FBQztRQUV6RCxJQUFJLFNBQVMsSUFBSSxpQkFBaUIsR0FBRyxDQUFDLEVBQUUsQ0FBQztZQUN4QyxvRUFBb0U7WUFDcEUsT0FBTztRQUNSLENBQUM7UUFFRCxJQUFJLENBQUMsT0FBTyxDQUFDLGdCQUFnQixDQUFDLFNBQVMsRUFBRSxRQUFRLENBQUMsTUFBTSxHQUFHLENBQUMsRUFBRSxRQUFRLEVBQUUsZUFBZSxFQUFFLGNBQWMsRUFBRSxhQUFhLENBQUMsQ0FBQztJQUN6SCxDQUFDO0lBRU0sZUFBZSxDQUFDLEtBQWlCO1FBQ3ZDLElBQUksQ0FBQyxPQUFPLENBQUMsZUFBZSxDQUFDLEtBQUssRUFBRSxJQUFJLENBQUMsZ0JBQWdCLENBQUMsQ0FBQztJQUM1RCxDQUFDO0NBQ0Q7QUFFRCxNQUFNLDRCQUE0QjtJQVdqQyxZQUFZLE1BQW1CO1FBQzlCLElBQUksQ0FBQyxPQUFPLEdBQUcsTUFBTSxDQUFDO1FBQ3RCLElBQUksQ0FBQyxXQUFXLEdBQUcsTUFBTSxDQUFDLE1BQU0sR0FBRyxDQUFDLENBQUM7SUFDdEMsQ0FBQztJQUVNLFFBQVEsQ0FBQyxlQUF1QjtRQUN0QyxNQUFNLE1BQU0sR0FBYSxFQUFFLENBQUM7UUFDNUIsS0FBSyxJQUFJLENBQUMsR0FBRyxDQUFDLEVBQUUsQ0FBQyxHQUFHLElBQUksQ0FBQyxXQUFXLEVBQUUsQ0FBQyxFQUFFLEVBQUUsQ0FBQztZQUMzQyxNQUFNLENBQUMsSUFBSSxDQUFDLElBQUksSUFBSSxDQUFDLGFBQWEsQ0FBQyxDQUFDLENBQUMsR0FBRyxlQUFlLElBQUksSUFBSSxDQUFDLGtCQUFrQixDQUFDLENBQUMsQ0FBQyxJQUFJLElBQUksQ0FBQyxnQkFBZ0IsQ0FBQyxDQUFDLENBQUMsR0FBRyxDQUFDLENBQUM7UUFDdkgsQ0FBQztRQUNELE9BQU8sSUFBSSxNQUFNLENBQUMsSUFBSSxDQUFDLEdBQUcsQ0FBQyxHQUFHLENBQUM7SUFDaEMsQ0FBQztJQUVNLGVBQWU7UUFDckIsTUFBTSxVQUFVLEdBQUcsSUFBSSxDQUFDLGNBQWMsRUFBRSxDQUFDO1FBQ3pDLElBQUksVUFBVSxLQUFLLENBQUMsRUFBRSxDQUFDO1lBQ3RCLE9BQU8sQ0FBQyxDQUFDLENBQUM7UUFDWCxDQUFDO1FBQ0QsT0FBTyxJQUFJLENBQUMsYUFBYSxDQUFDLFVBQVUsR0FBRyxDQUFDLENBQUMsQ0FBQztJQUMzQyxDQUFDO0lBRU0sUUFBUTtRQUNkLE1BQU0sVUFBVSxHQUFHLElBQUksQ0FBQyxjQUFjLEVBQUUsQ0FBQztRQUN6QyxJQUFJLFVBQVUsS0FBSyxDQUFDLEVBQUUsQ0FBQztZQUN0QixPQUFPLElBQUksQ0FBQztRQUNiLENBQUM7UUFDRCxNQUFNLFNBQVMsR0FBRyxJQUFJLENBQUMsa0JBQWtCLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFDN0MsTUFBTSxZQUFZLEdBQUcsSUFBSSxDQUFDLGFBQWEsQ0FBQyxVQUFVLEdBQUcsQ0FBQyxDQUFDLENBQUM7UUFDeEQsTUFBTSxPQUFPLEdBQUcsSUFBSSxDQUFDLGdCQUFnQixDQUFDLFVBQVUsR0FBRyxDQUFDLENBQUMsQ0FBQztRQUN0RCxPQUFPLElBQUksS0FBSyxDQUFDLENBQUMsRUFBRSxTQUFTLEdBQUcsQ0FBQyxFQUFFLFlBQVksRUFBRSxPQUFPLEdBQUcsQ0FBQyxDQUFDLENBQUM7SUFDL0QsQ0FBQztJQUVPLGNBQWM7UUFDckIsT0FBTyxJQUFJLENBQUMsV0FBVyxDQUFDO0lBQ3pCLENBQUM7SUFFTyxhQUFhLENBQUMsVUFBa0I7UUFDdkMsT0FBTyxJQUFJLENBQUMsT0FBTyxDQUFDLENBQUMsR0FBRyxVQUFVLENBQUMsQ0FBQztJQUNyQyxDQUFDO0lBRU8sa0JBQWtCLENBQUMsVUFBa0I7UUFDNUMsT0FBTyxJQUFJLENBQUMsT0FBTyxDQUFDLENBQUMsR0FBRyxVQUFVLEdBQUcsQ0FBQyxDQUFDLENBQUM7SUFDekMsQ0FBQztJQUVPLGdCQUFnQixDQUFDLFVBQWtCO1FBQzFDLE9BQU8sSUFBSSxDQUFDLE9BQU8sQ0FBQyxDQUFDLEdBQUcsVUFBVSxHQUFHLENBQUMsQ0FBQyxDQUFDO0lBQ3pDLENBQUM7SUFFTSxPQUFPO1FBQ2IsT0FBTyxDQUFDLElBQUksQ0FBQyxjQUFjLEVBQUUsS0FBSyxDQUFDLENBQUMsQ0FBQztJQUN0QyxDQUFDO0lBRU0sYUFBYSxDQUFDLFNBQWlCO1FBQ3JDLElBQUksR0FBRyxHQUFHLENBQUMsQ0FBQztRQUNaLElBQUksSUFBSSxHQUFHLElBQUksQ0FBQyxjQUFjLEVBQUUsR0FBRyxDQUFDLENBQUM7UUFFckMsT0FBTyxHQUFHLEdBQUcsSUFBSSxFQUFFLENBQUM7WUFDbkIsTUFBTSxHQUFHLEdBQUcsR0FBRyxHQUFHLElBQUksQ0FBQyxLQUFLLENBQUMsQ0FBQyxJQUFJLEdBQUcsR0FBRyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUM7WUFDL0MsTUFBTSxZQUFZLEdBQUcsSUFBSSxDQUFDLGFBQWEsQ0FBQyxHQUFHLENBQUMsQ0FBQztZQUU3QyxJQUFJLFlBQVksR0FBRyxTQUFTLEVBQUUsQ0FBQztnQkFDOUIsR0FBRyxHQUFHLEdBQUcsR0FBRyxDQUFDLENBQUM7WUFDZixDQUFDO2lCQUFNLElBQUksWUFBWSxHQUFHLFNBQVMsRUFBRSxDQUFDO2dCQUNyQyxJQUFJLEdBQUcsR0FBRyxHQUFHLENBQUMsQ0FBQztZQUNoQixDQUFDO2lCQUFNLENBQUM7Z0JBQ1AsSUFBSSxHQUFHLEdBQUcsR0FBRyxDQUFDO2dCQUNkLE9BQU8sR0FBRyxHQUFHLEdBQUcsSUFBSSxJQUFJLENBQUMsYUFBYSxDQUFDLEdBQUcsR0FBRyxDQUFDLENBQUMsS0FBSyxTQUFTLEVBQUUsQ0FBQztvQkFDL0QsR0FBRyxFQUFFLENBQUM7Z0JBQ1AsQ0FBQztnQkFDRCxJQUFJLEdBQUcsR0FBRyxHQUFHLENBQUM7Z0JBQ2QsT0FBTyxHQUFHLEdBQUcsSUFBSSxJQUFJLElBQUksQ0FBQyxhQUFhLENBQUMsR0FBRyxHQUFHLENBQUMsQ0FBQyxLQUFLLFNBQVMsRUFBRSxDQUFDO29CQUNoRSxHQUFHLEVBQUUsQ0FBQztnQkFDUCxDQUFDO2dCQUNELE9BQU8sSUFBSSxnQkFBZ0IsQ0FBQyxJQUFJLENBQUMsT0FBTyxDQUFDLFFBQVEsQ0FBQyxDQUFDLEdBQUcsR0FBRyxFQUFFLENBQUMsR0FBRyxHQUFHLEdBQUcsQ0FBQyxDQUFDLENBQUMsQ0FBQztZQUMxRSxDQUFDO1FBQ0YsQ0FBQztRQUVELElBQUksSUFBSSxDQUFDLGFBQWEsQ0FBQyxHQUFHLENBQUMsS0FBSyxTQUFTLEVBQUUsQ0FBQztZQUMzQyxPQUFPLElBQUksZ0JBQWdCLENBQUMsSUFBSSxDQUFDLE9BQU8sQ0FBQyxRQUFRLENBQUMsQ0FBQyxHQUFHLEdBQUcsRUFBRSxDQUFDLEdBQUcsR0FBRyxHQUFHLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFDMUUsQ0FBQztRQUVELE9BQU8sSUFBSSxDQUFDO0lBQ2IsQ0FBQztJQUVNLEtBQUs7UUFDWCxJQUFJLENBQUMsV0FBVyxHQUFHLENBQUMsQ0FBQztJQUN0QixDQUFDO0lBRU0sWUFBWSxDQUFDLGNBQXNCLEVBQUUsU0FBaUIsRUFBRSxZQUFvQixFQUFFLE9BQWU7UUFDbkcsTUFBTSxNQUFNLEdBQUcsSUFBSSxDQUFDLE9BQU8sQ0FBQztRQUM1QixNQUFNLFVBQVUsR0FBRyxJQUFJLENBQUMsV0FBVyxDQUFDO1FBQ3BDLElBQUksYUFBYSxHQUFHLENBQUMsQ0FBQztRQUN0QixJQUFJLGdCQUFnQixHQUFHLEtBQUssQ0FBQztRQUM3QixJQUFJLGNBQWMsR0FBRyxDQUFDLENBQUM7UUFDdkIsS0FBSyxJQUFJLENBQUMsR0FBRyxDQUFDLEVBQUUsQ0FBQyxHQUFHLFVBQVUsRUFBRSxDQUFDLEVBQUUsRUFBRSxDQUFDO1lBQ3JDLE1BQU0sU0FBUyxHQUFHLENBQUMsR0FBRyxDQUFDLENBQUM7WUFDeEIsTUFBTSxjQUFjLEdBQUcsTUFBTSxDQUFDLFNBQVMsQ0FBQyxDQUFDO1lBQ3pDLE1BQU0sbUJBQW1CLEdBQUcsTUFBTSxDQUFDLFNBQVMsR0FBRyxDQUFDLENBQUMsQ0FBQztZQUNsRCxNQUFNLGlCQUFpQixHQUFHLE1BQU0sQ0FBQyxTQUFTLEdBQUcsQ0FBQyxDQUFDLENBQUM7WUFDaEQsTUFBTSxhQUFhLEdBQUcsTUFBTSxDQUFDLFNBQVMsR0FBRyxDQUFDLENBQUMsQ0FBQztZQUU1QyxJQUNDLENBQUMsY0FBYyxHQUFHLGNBQWMsSUFBSSxDQUFDLGNBQWMsS0FBSyxjQUFjLElBQUksaUJBQWlCLElBQUksU0FBUyxDQUFDLENBQUM7bUJBQ3ZHLENBQUMsY0FBYyxHQUFHLFlBQVksSUFBSSxDQUFDLGNBQWMsS0FBSyxZQUFZLElBQUksbUJBQW1CLElBQUksT0FBTyxDQUFDLENBQUMsRUFDeEcsQ0FBQztnQkFDRixnQkFBZ0IsR0FBRyxJQUFJLENBQUM7WUFDekIsQ0FBQztpQkFBTSxDQUFDO2dCQUNQLElBQUksYUFBYSxLQUFLLENBQUMsRUFBRSxDQUFDO29CQUN6QixjQUFjLEdBQUcsY0FBYyxDQUFDO2dCQUNqQyxDQUFDO2dCQUNELElBQUksZ0JBQWdCLEVBQUUsQ0FBQztvQkFDdEIsa0NBQWtDO29CQUNsQyxNQUFNLFVBQVUsR0FBRyxDQUFDLEdBQUcsYUFBYSxDQUFDO29CQUNyQyxNQUFNLENBQUMsVUFBVSxDQUFDLEdBQUcsY0FBYyxHQUFHLGNBQWMsQ0FBQztvQkFDckQsTUFBTSxDQUFDLFVBQVUsR0FBRyxDQUFDLENBQUMsR0FBRyxtQkFBbUIsQ0FBQztvQkFDN0MsTUFBTSxDQUFDLFVBQVUsR0FBRyxDQUFDLENBQUMsR0FBRyxpQkFBaUIsQ0FBQztvQkFDM0MsTUFBTSxDQUFDLFVBQVUsR0FBRyxDQUFDLENBQUMsR0FBRyxhQUFhLENBQUM7Z0JBQ3hDLENBQUM7cUJBQU0sSUFBSSxjQUFjLEtBQUssQ0FBQyxFQUFFLENBQUM7b0JBQ2pDLHNDQUFzQztvQkFDdEMsTUFBTSxDQUFDLFNBQVMsQ0FBQyxHQUFHLGNBQWMsR0FBRyxjQUFjLENBQUM7Z0JBQ3JELENBQUM7Z0JBQ0QsYUFBYSxFQUFFLENBQUM7WUFDakIsQ0FBQztRQUNGLENBQUM7UUFFRCxJQUFJLENBQUMsV0FBVyxHQUFHLGFBQWEsQ0FBQztRQUVqQyxPQUFPLGNBQWMsQ0FBQztJQUN2QixDQUFDO0lBRU0sS0FBSyxDQUFDLGNBQXNCLEVBQUUsU0FBaUIsRUFBRSxZQUFvQixFQUFFLE9BQWU7UUFDNUYsTUFBTSxNQUFNLEdBQUcsSUFBSSxDQUFDLE9BQU8sQ0FBQztRQUM1QixNQUFNLFVBQVUsR0FBRyxJQUFJLENBQUMsV0FBVyxDQUFDO1FBQ3BDLE1BQU0sT0FBTyxHQUFhLEVBQUUsQ0FBQztRQUM3QixNQUFNLE9BQU8sR0FBYSxFQUFFLENBQUM7UUFDN0IsSUFBSSxVQUFVLEdBQWEsT0FBTyxDQUFDO1FBQ25DLElBQUksVUFBVSxHQUFHLENBQUMsQ0FBQztRQUNuQixJQUFJLGtCQUFrQixHQUFXLENBQUMsQ0FBQztRQUNuQyxLQUFLLElBQUksQ0FBQyxHQUFHLENBQUMsRUFBRSxDQUFDLEdBQUcsVUFBVSxFQUFFLENBQUMsRUFBRSxFQUFFLENBQUM7WUFDckMsTUFBTSxTQUFTLEdBQUcsQ0FBQyxHQUFHLENBQUMsQ0FBQztZQUN4QixNQUFNLGNBQWMsR0FBRyxNQUFNLENBQUMsU0FBUyxDQUFDLENBQUM7WUFDekMsTUFBTSxtQkFBbUIsR0FBRyxNQUFNLENBQUMsU0FBUyxHQUFHLENBQUMsQ0FBQyxDQUFDO1lBQ2xELE1BQU0saUJBQWlCLEdBQUcsTUFBTSxDQUFDLFNBQVMsR0FBRyxDQUFDLENBQUMsQ0FBQztZQUNoRCxNQUFNLGFBQWEsR0FBRyxNQUFNLENBQUMsU0FBUyxHQUFHLENBQUMsQ0FBQyxDQUFDO1lBRTVDLElBQUksQ0FBQyxjQUFjLEdBQUcsY0FBYyxJQUFJLENBQUMsY0FBYyxLQUFLLGNBQWMsSUFBSSxpQkFBaUIsSUFBSSxTQUFTLENBQUMsQ0FBQyxFQUFFLENBQUM7Z0JBQ2hILElBQUksQ0FBQyxjQUFjLEdBQUcsWUFBWSxJQUFJLENBQUMsY0FBYyxLQUFLLFlBQVksSUFBSSxtQkFBbUIsSUFBSSxPQUFPLENBQUMsQ0FBQyxFQUFFLENBQUM7b0JBQzVHLG1DQUFtQztvQkFDbkMsU0FBUztnQkFDVixDQUFDO3FCQUFNLENBQUM7b0JBQ1AsZ0NBQWdDO29CQUNoQyxJQUFJLFVBQVUsS0FBSyxPQUFPLEVBQUUsQ0FBQzt3QkFDNUIsZ0RBQWdEO3dCQUNoRCxVQUFVLEdBQUcsT0FBTyxDQUFDO3dCQUNyQixVQUFVLEdBQUcsQ0FBQyxDQUFDO3dCQUNmLGtCQUFrQixHQUFHLGNBQWMsQ0FBQztvQkFDckMsQ0FBQztnQkFDRixDQUFDO1lBQ0YsQ0FBQztZQUVELFVBQVUsQ0FBQyxVQUFVLEVBQUUsQ0FBQyxHQUFHLGNBQWMsR0FBRyxrQkFBa0IsQ0FBQztZQUMvRCxVQUFVLENBQUMsVUFBVSxFQUFFLENBQUMsR0FBRyxtQkFBbUIsQ0FBQztZQUMvQyxVQUFVLENBQUMsVUFBVSxFQUFFLENBQUMsR0FBRyxpQkFBaUIsQ0FBQztZQUM3QyxVQUFVLENBQUMsVUFBVSxFQUFFLENBQUMsR0FBRyxhQUFhLENBQUM7UUFDMUMsQ0FBQztRQUVELE9BQU8sQ0FBQyxJQUFJLDRCQUE0QixDQUFDLElBQUksV0FBVyxDQUFDLE9BQU8sQ0FBQyxDQUFDLEVBQUUsSUFBSSw0QkFBNEIsQ0FBQyxJQUFJLFdBQVcsQ0FBQyxPQUFPLENBQUMsQ0FBQyxFQUFFLGtCQUFrQixDQUFDLENBQUM7SUFDckosQ0FBQztJQUVNLGlCQUFpQixDQUFDLGlDQUF5QyxFQUFFLGNBQXNCLEVBQUUsY0FBc0IsRUFBRSxZQUFvQixFQUFFLFlBQW9CO1FBQzdKLHdFQUF3RTtRQUN4RSxFQUFFO1FBQ0YsZ0RBQWdEO1FBQ2hELHdEQUF3RDtRQUN4RCw0QkFBNEI7UUFDNUIsdUNBQXVDO1FBQ3ZDLHVFQUF1RTtRQUN2RSw0QkFBNEI7UUFDNUIsbUNBQW1DO1FBQ25DLGdGQUFnRjtRQUNoRixnQ0FBZ0M7UUFDaEMsZ0NBQWdDO1FBQ2hDLHNFQUFzRTtRQUN0RSxnQ0FBZ0M7UUFDaEMsMkJBQTJCO1FBQzNCLEVBQUU7UUFDRixtRUFBbUU7UUFDbkUsZ0ZBQWdGO1FBQ2hGLHdCQUF3QjtRQUN4Qiw0QkFBNEI7UUFDNUIsaUdBQWlHO1FBQ2pHLDJCQUEyQjtRQUMzQiwyQkFBMkI7UUFDM0IsK0VBQStFO1FBQy9FLDhCQUE4QjtRQUM5Qix3QkFBd0I7UUFDeEIsRUFBRTtRQUNGLGdEQUFnRDtRQUNoRCw2Q0FBNkM7UUFDN0MseUJBQXlCO1FBQ3pCLDRCQUE0QjtRQUM1QixzR0FBc0c7UUFDdEcsNEJBQTRCO1FBQzVCLDRCQUE0QjtRQUM1QixvRkFBb0Y7UUFDcEYsOEJBQThCO1FBQzlCLDBCQUEwQjtRQUMxQixFQUFFO1FBQ0YsK0NBQStDO1FBQy9DLCtCQUErQjtRQUMvQixvQkFBb0I7UUFDcEIsRUFBRTtRQUNGLE1BQU0sTUFBTSxHQUFHLElBQUksQ0FBQyxPQUFPLENBQUM7UUFDNUIsTUFBTSxVQUFVLEdBQUcsSUFBSSxDQUFDLFdBQVcsQ0FBQztRQUNwQyxNQUFNLGdCQUFnQixHQUFHLENBQUMsWUFBWSxHQUFHLGNBQWMsQ0FBQyxDQUFDO1FBQ3pELElBQUksYUFBYSxHQUFHLENBQUMsQ0FBQztRQUN0QixJQUFJLGdCQUFnQixHQUFHLEtBQUssQ0FBQztRQUM3QixLQUFLLElBQUksQ0FBQyxHQUFHLENBQUMsRUFBRSxDQUFDLEdBQUcsVUFBVSxFQUFFLENBQUMsRUFBRSxFQUFFLENBQUM7WUFDckMsTUFBTSxTQUFTLEdBQUcsQ0FBQyxHQUFHLENBQUMsQ0FBQztZQUN4QixJQUFJLGNBQWMsR0FBRyxNQUFNLENBQUMsU0FBUyxDQUFDLENBQUM7WUFDdkMsSUFBSSxtQkFBbUIsR0FBRyxNQUFNLENBQUMsU0FBUyxHQUFHLENBQUMsQ0FBQyxDQUFDO1lBQ2hELElBQUksaUJBQWlCLEdBQUcsTUFBTSxDQUFDLFNBQVMsR0FBRyxDQUFDLENBQUMsQ0FBQztZQUM5QyxNQUFNLGFBQWEsR0FBRyxNQUFNLENBQUMsU0FBUyxHQUFHLENBQUMsQ0FBQyxDQUFDO1lBRTVDLElBQUksY0FBYyxHQUFHLGNBQWMsSUFBSSxDQUFDLGNBQWMsS0FBSyxjQUFjLElBQUksaUJBQWlCLElBQUksY0FBYyxDQUFDLEVBQUUsQ0FBQztnQkFDbkgsd0RBQXdEO2dCQUN4RCxtQkFBbUI7Z0JBQ25CLGFBQWEsRUFBRSxDQUFDO2dCQUNoQixTQUFTO1lBQ1YsQ0FBQztpQkFBTSxJQUFJLGNBQWMsS0FBSyxjQUFjLElBQUksbUJBQW1CLEdBQUcsY0FBYyxFQUFFLENBQUM7Z0JBQ3RGLGFBQWE7Z0JBQ2IsZ0RBQWdEO2dCQUNoRCxJQUFJLGNBQWMsS0FBSyxZQUFZLElBQUksaUJBQWlCLEdBQUcsWUFBWSxFQUFFLENBQUM7b0JBQ3pFLHNFQUFzRTtvQkFDdEUsdURBQXVEO29CQUN2RCxpQkFBaUIsSUFBSSxDQUFDLFlBQVksR0FBRyxjQUFjLENBQUMsQ0FBQztnQkFDdEQsQ0FBQztxQkFBTSxDQUFDO29CQUNQLHVFQUF1RTtvQkFDdkUsZ0ZBQWdGO29CQUNoRix3REFBd0Q7b0JBQ3hELGlCQUFpQixHQUFHLGNBQWMsQ0FBQztnQkFDcEMsQ0FBQztZQUNGLENBQUM7aUJBQU0sSUFBSSxjQUFjLEtBQUssY0FBYyxJQUFJLG1CQUFtQixLQUFLLGNBQWMsRUFBRSxDQUFDO2dCQUN4RixhQUFhO2dCQUNiLElBQUksY0FBYyxLQUFLLFlBQVksSUFBSSxpQkFBaUIsR0FBRyxZQUFZLEVBQUUsQ0FBQztvQkFDekUsK0VBQStFO29CQUMvRSx1REFBdUQ7b0JBQ3ZELGlCQUFpQixJQUFJLENBQUMsWUFBWSxHQUFHLGNBQWMsQ0FBQyxDQUFDO2dCQUN0RCxDQUFDO3FCQUFNLENBQUM7b0JBQ1AsZ0ZBQWdGO29CQUNoRixpR0FBaUc7b0JBQ2pHLDBCQUEwQjtvQkFDMUIsZ0JBQWdCLEdBQUcsSUFBSSxDQUFDO29CQUN4QixTQUFTO2dCQUNWLENBQUM7WUFDRixDQUFDO2lCQUFNLElBQUksY0FBYyxHQUFHLFlBQVksSUFBSSxDQUFDLGNBQWMsS0FBSyxZQUFZLElBQUksbUJBQW1CLEdBQUcsWUFBWSxDQUFDLEVBQUUsQ0FBQztnQkFDckgsYUFBYTtnQkFDYixJQUFJLGNBQWMsS0FBSyxZQUFZLElBQUksaUJBQWlCLEdBQUcsWUFBWSxFQUFFLENBQUM7b0JBQ3pFLG9GQUFvRjtvQkFDcEYsMERBQTBEO29CQUMxRCxjQUFjLEdBQUcsY0FBYyxDQUFDO29CQUNoQyxtQkFBbUIsR0FBRyxjQUFjLENBQUM7b0JBQ3JDLGlCQUFpQixHQUFHLG1CQUFtQixHQUFHLENBQUMsaUJBQWlCLEdBQUcsWUFBWSxDQUFDLENBQUM7Z0JBQzlFLENBQUM7cUJBQU0sQ0FBQztvQkFDUCw2Q0FBNkM7b0JBQzdDLHNHQUFzRztvQkFDdEcsMEJBQTBCO29CQUMxQixnQkFBZ0IsR0FBRyxJQUFJLENBQUM7b0JBQ3hCLFNBQVM7Z0JBQ1YsQ0FBQztZQUNGLENBQUM7aUJBQU0sSUFBSSxjQUFjLEdBQUcsWUFBWSxFQUFFLENBQUM7Z0JBQzFDLDZFQUE2RTtnQkFDN0UsSUFBSSxnQkFBZ0IsS0FBSyxDQUFDLElBQUksQ0FBQyxnQkFBZ0IsRUFBRSxDQUFDO29CQUNqRCx3RUFBd0U7b0JBQ3hFLGFBQWEsR0FBRyxVQUFVLENBQUM7b0JBQzNCLE1BQU07Z0JBQ1AsQ0FBQztnQkFDRCxjQUFjLElBQUksZ0JBQWdCLENBQUM7WUFDcEMsQ0FBQztpQkFBTSxJQUFJLGNBQWMsS0FBSyxZQUFZLElBQUksbUJBQW1CLElBQUksWUFBWSxFQUFFLENBQUM7Z0JBQ25GLHFHQUFxRztnQkFDckcsSUFBSSxpQ0FBaUMsSUFBSSxjQUFjLEtBQUssQ0FBQyxFQUFFLENBQUM7b0JBQy9ELG1CQUFtQixJQUFJLGlDQUFpQyxDQUFDO29CQUN6RCxpQkFBaUIsSUFBSSxpQ0FBaUMsQ0FBQztnQkFDeEQsQ0FBQztnQkFDRCxjQUFjLElBQUksZ0JBQWdCLENBQUM7Z0JBQ25DLG1CQUFtQixJQUFJLENBQUMsWUFBWSxHQUFHLGNBQWMsQ0FBQyxDQUFDO2dCQUN2RCxpQkFBaUIsSUFBSSxDQUFDLFlBQVksR0FBRyxjQUFjLENBQUMsQ0FBQztZQUN0RCxDQUFDO2lCQUFNLENBQUM7Z0JBQ1AsTUFBTSxJQUFJLEtBQUssQ0FBQyxlQUFlLENBQUMsQ0FBQztZQUNsQyxDQUFDO1lBRUQsTUFBTSxVQUFVLEdBQUcsQ0FBQyxHQUFHLGFBQWEsQ0FBQztZQUNyQyxNQUFNLENBQUMsVUFBVSxDQUFDLEdBQUcsY0FBYyxDQUFDO1lBQ3BDLE1BQU0sQ0FBQyxVQUFVLEdBQUcsQ0FBQyxDQUFDLEdBQUcsbUJBQW1CLENBQUM7WUFDN0MsTUFBTSxDQUFDLFVBQVUsR0FBRyxDQUFDLENBQUMsR0FBRyxpQkFBaUIsQ0FBQztZQUMzQyxNQUFNLENBQUMsVUFBVSxHQUFHLENBQUMsQ0FBQyxHQUFHLGFBQWEsQ0FBQztZQUN2QyxhQUFhLEVBQUUsQ0FBQztRQUNqQixDQUFDO1FBRUQsSUFBSSxDQUFDLFdBQVcsR0FBRyxhQUFhLENBQUM7SUFDbEMsQ0FBQztJQUVNLGdCQUFnQixDQUFDLFNBQWlCLEVBQUUsU0FBaUIsRUFBRSxRQUFnQixFQUFFLGVBQXVCLEVBQUUsY0FBc0IsRUFBRSxhQUFxQjtRQUNySixpREFBaUQ7UUFDakQsRUFBRTtRQUNGLHdEQUF3RDtRQUN4RCw2QkFBNkI7UUFDN0IscURBQXFEO1FBQ3JELDBCQUEwQjtRQUMxQiw0Q0FBNEM7UUFDNUMsMEJBQTBCO1FBQzFCLHVEQUF1RDtRQUN2RCwwQkFBMEI7UUFDMUIsdURBQXVEO1FBQ3ZELDZCQUE2QjtRQUM3QixFQUFFO1FBQ0YsTUFBTSxvQ0FBb0MsR0FBRyxDQUM1QyxRQUFRLEtBQUssQ0FBQztlQUNYLGVBQWUsS0FBSyxDQUFDO2VBQ3JCLENBQ0YsQ0FBQyxhQUFhLDRCQUFtQixJQUFJLGFBQWEsNEJBQW1CLENBQUM7bUJBQ25FLENBQUMsYUFBYSx1QkFBYyxJQUFJLGFBQWEsdUJBQWMsQ0FBQzttQkFDNUQsQ0FBQyxhQUFhLHVCQUFjLElBQUksYUFBYSx3QkFBYyxDQUFDLENBQy9ELENBQ0QsQ0FBQztRQUNGLE1BQU0sTUFBTSxHQUFHLElBQUksQ0FBQyxPQUFPLENBQUM7UUFDNUIsTUFBTSxVQUFVLEdBQUcsSUFBSSxDQUFDLFdBQVcsQ0FBQztRQUNwQyxLQUFLLElBQUksQ0FBQyxHQUFHLENBQUMsRUFBRSxDQUFDLEdBQUcsVUFBVSxFQUFFLENBQUMsRUFBRSxFQUFFLENBQUM7WUFDckMsTUFBTSxNQUFNLEdBQUcsQ0FBQyxHQUFHLENBQUMsQ0FBQztZQUNyQixJQUFJLGNBQWMsR0FBRyxNQUFNLENBQUMsTUFBTSxDQUFDLENBQUM7WUFDcEMsSUFBSSxtQkFBbUIsR0FBRyxNQUFNLENBQUMsTUFBTSxHQUFHLENBQUMsQ0FBQyxDQUFDO1lBQzdDLElBQUksaUJBQWlCLEdBQUcsTUFBTSxDQUFDLE1BQU0sR0FBRyxDQUFDLENBQUMsQ0FBQztZQUUzQyxJQUFJLGNBQWMsR0FBRyxTQUFTLElBQUksQ0FBQyxjQUFjLEtBQUssU0FBUyxJQUFJLGlCQUFpQixHQUFHLFNBQVMsQ0FBQyxFQUFFLENBQUM7Z0JBQ25HLHdEQUF3RDtnQkFDeEQsbUJBQW1CO2dCQUNuQixTQUFTO1lBQ1YsQ0FBQztpQkFBTSxJQUFJLGNBQWMsS0FBSyxTQUFTLElBQUksaUJBQWlCLEtBQUssU0FBUyxFQUFFLENBQUM7Z0JBQzVFLHFEQUFxRDtnQkFDckQsaUdBQWlHO2dCQUNqRyxJQUFJLG9DQUFvQyxFQUFFLENBQUM7b0JBQzFDLGlCQUFpQixJQUFJLENBQUMsQ0FBQztnQkFDeEIsQ0FBQztxQkFBTSxDQUFDO29CQUNQLFNBQVM7Z0JBQ1YsQ0FBQztZQUNGLENBQUM7aUJBQU0sSUFBSSxjQUFjLEtBQUssU0FBUyxJQUFJLG1CQUFtQixHQUFHLFNBQVMsSUFBSSxTQUFTLEdBQUcsaUJBQWlCLEVBQUUsQ0FBQztnQkFDN0csNENBQTRDO2dCQUM1QyxJQUFJLFFBQVEsS0FBSyxDQUFDLEVBQUUsQ0FBQztvQkFDcEIsbUNBQW1DO29CQUNuQyxpQkFBaUIsSUFBSSxlQUFlLENBQUM7Z0JBQ3RDLENBQUM7cUJBQU0sQ0FBQztvQkFDUCx1QkFBdUI7b0JBQ3ZCLGlCQUFpQixHQUFHLFNBQVMsQ0FBQztnQkFDL0IsQ0FBQztZQUNGLENBQUM7aUJBQU0sQ0FBQztnQkFDUCxXQUFXO2dCQUNYLElBQUksY0FBYyxLQUFLLFNBQVMsSUFBSSxtQkFBbUIsS0FBSyxTQUFTLEVBQUUsQ0FBQztvQkFDdkUsdURBQXVEO29CQUN2RCx1SEFBdUg7b0JBQ3ZILG9DQUFvQztvQkFDcEMsSUFBSSxvQ0FBb0MsRUFBRSxDQUFDO3dCQUMxQyxTQUFTO29CQUNWLENBQUM7Z0JBQ0YsQ0FBQztnQkFDRCxvREFBb0Q7Z0JBQ3BELElBQUksY0FBYyxLQUFLLFNBQVMsRUFBRSxDQUFDO29CQUNsQyxjQUFjLElBQUksUUFBUSxDQUFDO29CQUMzQixnRUFBZ0U7b0JBQ2hFLElBQUksUUFBUSxLQUFLLENBQUMsRUFBRSxDQUFDO3dCQUNwQixtQkFBbUIsSUFBSSxlQUFlLENBQUM7d0JBQ3ZDLGlCQUFpQixJQUFJLGVBQWUsQ0FBQztvQkFDdEMsQ0FBQzt5QkFBTSxDQUFDO3dCQUNQLE1BQU0sV0FBVyxHQUFHLGlCQUFpQixHQUFHLG1CQUFtQixDQUFDO3dCQUM1RCxtQkFBbUIsR0FBRyxjQUFjLEdBQUcsQ0FBQyxtQkFBbUIsR0FBRyxTQUFTLENBQUMsQ0FBQzt3QkFDekUsaUJBQWlCLEdBQUcsbUJBQW1CLEdBQUcsV0FBVyxDQUFDO29CQUN2RCxDQUFDO2dCQUNGLENBQUM7cUJBQU0sQ0FBQztvQkFDUCxjQUFjLElBQUksUUFBUSxDQUFDO2dCQUM1QixDQUFDO1lBQ0YsQ0FBQztZQUVELE1BQU0sQ0FBQyxNQUFNLENBQUMsR0FBRyxjQUFjLENBQUM7WUFDaEMsTUFBTSxDQUFDLE1BQU0sR0FBRyxDQUFDLENBQUMsR0FBRyxtQkFBbUIsQ0FBQztZQUN6QyxNQUFNLENBQUMsTUFBTSxHQUFHLENBQUMsQ0FBQyxHQUFHLGlCQUFpQixDQUFDO1FBQ3hDLENBQUM7SUFDRixDQUFDO2FBRWMsaUJBQVksR0FBRyxJQUFJLFdBQVcsQ0FBQyxFQUFFLEdBQUcsRUFBRSxDQUFDLENBQUMsR0FBQywrQkFBK0I7SUFFaEYsZUFBZSxDQUFDLEtBQWlCLEVBQUUsZUFBdUI7UUFDaEUsS0FBSyxJQUFJLENBQUMsR0FBRyxDQUFDLEVBQUUsQ0FBQyxHQUFHLElBQUksQ0FBQyxXQUFXLEVBQUUsQ0FBQyxFQUFFLEVBQUUsQ0FBQztZQUMzQyxNQUFNLFVBQVUsR0FBRyxJQUFJLENBQUMsYUFBYSxDQUFDLENBQUMsQ0FBQyxHQUFHLGVBQWUsQ0FBQztZQUUzRCxJQUFJLFVBQVUsR0FBRyxDQUFDLEVBQUUsQ0FBQztnQkFDcEIsNEJBQTRCLENBQUMsWUFBWSxDQUFDLGVBQWUsQ0FBQyxHQUFHLEVBQUU7b0JBQzlELE9BQU8sQ0FBQyxLQUFLLENBQUMsNkRBQTZELENBQUMsQ0FBQztnQkFDOUUsQ0FBQyxDQUFDLENBQUM7WUFDSixDQUFDO2lCQUFNLElBQUksVUFBVSxHQUFHLEtBQUssQ0FBQyxZQUFZLEVBQUUsRUFBRSxDQUFDO2dCQUM5Qyw0QkFBNEIsQ0FBQyxZQUFZLENBQUMsZUFBZSxDQUFDLEdBQUcsRUFBRTtvQkFDOUQsT0FBTyxDQUFDLEtBQUssQ0FBQyxnRkFBZ0YsQ0FBQyxDQUFDO2dCQUNqRyxDQUFDLENBQUMsQ0FBQztZQUNKLENBQUM7aUJBQU0sSUFBSSxJQUFJLENBQUMsZ0JBQWdCLENBQUMsQ0FBQyxDQUFDLEdBQUcsS0FBSyxDQUFDLGFBQWEsQ0FBQyxVQUFVLENBQUMsRUFBRSxDQUFDO2dCQUN2RSw0QkFBNEIsQ0FBQyxZQUFZLENBQUMsZUFBZSxDQUFDLEdBQUcsRUFBRTtvQkFDOUQsT0FBTyxDQUFDLEtBQUssQ0FBQyw4RkFBOEYsQ0FBQyxDQUFDO2dCQUMvRyxDQUFDLENBQUMsQ0FBQztZQUNKLENBQUM7UUFDRixDQUFDO0lBQ0YsQ0FBQzs7QUFHRixNQUFNLE9BQU8sZ0JBQWdCO0lBSTVCLFlBQVksTUFBbUI7UUFDOUIsSUFBSSxDQUFDLE9BQU8sR0FBRyxNQUFNLENBQUM7SUFDdkIsQ0FBQztJQUVNLFFBQVE7UUFDZCxPQUFPLElBQUksQ0FBQyxPQUFPLENBQUMsTUFBTSxHQUFHLENBQUMsQ0FBQztJQUNoQyxDQUFDO0lBRU0saUJBQWlCLENBQUMsVUFBa0I7UUFDMUMsT0FBTyxJQUFJLENBQUMsT0FBTyxDQUFDLENBQUMsR0FBRyxVQUFVLEdBQUcsQ0FBQyxDQUFDLENBQUM7SUFDekMsQ0FBQztJQUVNLGVBQWUsQ0FBQyxVQUFrQjtRQUN4QyxPQUFPLElBQUksQ0FBQyxPQUFPLENBQUMsQ0FBQyxHQUFHLFVBQVUsR0FBRyxDQUFDLENBQUMsQ0FBQztJQUN6QyxDQUFDO0lBRU0sV0FBVyxDQUFDLFVBQWtCO1FBQ3BDLE9BQU8sSUFBSSxDQUFDLE9BQU8sQ0FBQyxDQUFDLEdBQUcsVUFBVSxHQUFHLENBQUMsQ0FBQyxDQUFDO0lBQ3pDLENBQUM7Q0FDRCJ9