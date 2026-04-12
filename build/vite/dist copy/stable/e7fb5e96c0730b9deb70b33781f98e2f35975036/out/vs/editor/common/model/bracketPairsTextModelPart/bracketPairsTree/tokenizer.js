/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { NotSupportedError } from '../../../../../base/common/errors.js';
import { TokenMetadata } from '../../../encodedTokenAttributes.js';
import { TextAstNode } from './ast.js';
import { lengthAdd, lengthDiff, lengthGetColumnCountIfZeroLineCount, lengthToObj, lengthZero, toLength } from './length.js';
import { SmallImmutableSet } from './smallImmutableSet.js';
export var TokenKind;
(function (TokenKind) {
    TokenKind[TokenKind["Text"] = 0] = "Text";
    TokenKind[TokenKind["OpeningBracket"] = 1] = "OpeningBracket";
    TokenKind[TokenKind["ClosingBracket"] = 2] = "ClosingBracket";
})(TokenKind || (TokenKind = {}));
export class Token {
    constructor(length, kind, 
    /**
     * If this token is an opening bracket, this is the id of the opening bracket.
     * If this token is a closing bracket, this is the id of the first opening bracket that is closed by this bracket.
     * Otherwise, it is -1.
     */
    bracketId, 
    /**
     * If this token is an opening bracket, this just contains `bracketId`.
     * If this token is a closing bracket, this lists all opening bracket ids, that it closes.
     * Otherwise, it is empty.
     */
    bracketIds, astNode) {
        this.length = length;
        this.kind = kind;
        this.bracketId = bracketId;
        this.bracketIds = bracketIds;
        this.astNode = astNode;
    }
}
export class TextBufferTokenizer {
    constructor(textModel, bracketTokens) {
        this.textModel = textModel;
        this.bracketTokens = bracketTokens;
        this.reader = new NonPeekableTextBufferTokenizer(this.textModel, this.bracketTokens);
        this._offset = lengthZero;
        this.didPeek = false;
        this.peeked = null;
        this.textBufferLineCount = textModel.getLineCount();
        this.textBufferLastLineLength = textModel.getLineLength(this.textBufferLineCount);
    }
    get offset() {
        return this._offset;
    }
    get length() {
        return toLength(this.textBufferLineCount - 1, this.textBufferLastLineLength);
    }
    getText() {
        return this.textModel.getValue();
    }
    skip(length) {
        this.didPeek = false;
        this._offset = lengthAdd(this._offset, length);
        const obj = lengthToObj(this._offset);
        this.reader.setPosition(obj.lineCount, obj.columnCount);
    }
    read() {
        let token;
        if (this.peeked) {
            this.didPeek = false;
            token = this.peeked;
        }
        else {
            token = this.reader.read();
        }
        if (token) {
            this._offset = lengthAdd(this._offset, token.length);
        }
        return token;
    }
    peek() {
        if (!this.didPeek) {
            this.peeked = this.reader.read();
            this.didPeek = true;
        }
        return this.peeked;
    }
}
/**
 * Does not support peek.
*/
class NonPeekableTextBufferTokenizer {
    constructor(textModel, bracketTokens) {
        this.textModel = textModel;
        this.bracketTokens = bracketTokens;
        this.lineIdx = 0;
        this.line = null;
        this.lineCharOffset = 0;
        this.lineTokens = null;
        this.lineTokenOffset = 0;
        /** Must be a zero line token. The end of the document cannot be peeked. */
        this.peekedToken = null;
        this.textBufferLineCount = textModel.getLineCount();
        this.textBufferLastLineLength = textModel.getLineLength(this.textBufferLineCount);
    }
    setPosition(lineIdx, column) {
        // We must not jump into a token!
        if (lineIdx === this.lineIdx) {
            this.lineCharOffset = column;
            if (this.line !== null) {
                this.lineTokenOffset = this.lineCharOffset === 0 ? 0 : this.lineTokens.findTokenIndexAtOffset(this.lineCharOffset);
            }
        }
        else {
            this.lineIdx = lineIdx;
            this.lineCharOffset = column;
            this.line = null;
        }
        this.peekedToken = null;
    }
    read() {
        if (this.peekedToken) {
            const token = this.peekedToken;
            this.peekedToken = null;
            this.lineCharOffset += lengthGetColumnCountIfZeroLineCount(token.length);
            return token;
        }
        if (this.lineIdx > this.textBufferLineCount - 1 || (this.lineIdx === this.textBufferLineCount - 1 && this.lineCharOffset >= this.textBufferLastLineLength)) {
            // We are after the end
            return null;
        }
        if (this.line === null) {
            this.lineTokens = this.textModel.tokenization.getLineTokens(this.lineIdx + 1);
            this.line = this.lineTokens.getLineContent();
            this.lineTokenOffset = this.lineCharOffset === 0 ? 0 : this.lineTokens.findTokenIndexAtOffset(this.lineCharOffset);
        }
        const startLineIdx = this.lineIdx;
        const startLineCharOffset = this.lineCharOffset;
        // limits the length of text tokens.
        // If text tokens get too long, incremental updates will be slow
        let lengthHeuristic = 0;
        while (true) {
            const lineTokens = this.lineTokens;
            const tokenCount = lineTokens.getCount();
            let peekedBracketToken = null;
            if (this.lineTokenOffset < tokenCount) {
                const tokenMetadata = lineTokens.getMetadata(this.lineTokenOffset);
                while (this.lineTokenOffset + 1 < tokenCount && tokenMetadata === lineTokens.getMetadata(this.lineTokenOffset + 1)) {
                    // Skip tokens that are identical.
                    // Sometimes, (bracket) identifiers are split up into multiple tokens.
                    this.lineTokenOffset++;
                }
                const isOther = TokenMetadata.getTokenType(tokenMetadata) === 0 /* StandardTokenType.Other */;
                const containsBracketType = TokenMetadata.containsBalancedBrackets(tokenMetadata);
                const endOffset = lineTokens.getEndOffset(this.lineTokenOffset);
                // Is there a bracket token next? Only consume text.
                if (containsBracketType && isOther && this.lineCharOffset < endOffset) {
                    const languageId = lineTokens.getLanguageId(this.lineTokenOffset);
                    const text = this.line.substring(this.lineCharOffset, endOffset);
                    const brackets = this.bracketTokens.getSingleLanguageBracketTokens(languageId);
                    const regexp = brackets.regExpGlobal;
                    if (regexp) {
                        regexp.lastIndex = 0;
                        const match = regexp.exec(text);
                        if (match) {
                            peekedBracketToken = brackets.getToken(match[0]);
                            if (peekedBracketToken) {
                                // Consume leading text of the token
                                this.lineCharOffset += match.index;
                            }
                        }
                    }
                }
                lengthHeuristic += endOffset - this.lineCharOffset;
                if (peekedBracketToken) {
                    // Don't skip the entire token, as a single token could contain multiple brackets.
                    if (startLineIdx !== this.lineIdx || startLineCharOffset !== this.lineCharOffset) {
                        // There is text before the bracket
                        this.peekedToken = peekedBracketToken;
                        break;
                    }
                    else {
                        // Consume the peeked token
                        this.lineCharOffset += lengthGetColumnCountIfZeroLineCount(peekedBracketToken.length);
                        return peekedBracketToken;
                    }
                }
                else {
                    // Skip the entire token, as the token contains no brackets at all.
                    this.lineTokenOffset++;
                    this.lineCharOffset = endOffset;
                }
            }
            else {
                if (this.lineIdx === this.textBufferLineCount - 1) {
                    break;
                }
                this.lineIdx++;
                this.lineTokens = this.textModel.tokenization.getLineTokens(this.lineIdx + 1);
                this.lineTokenOffset = 0;
                this.line = this.lineTokens.getLineContent();
                this.lineCharOffset = 0;
                lengthHeuristic += 33; // max 1000/33 = 30 lines
                // This limits the amount of work to recompute min-indentation
                if (lengthHeuristic > 1000) {
                    // only break (automatically) at the end of line.
                    break;
                }
            }
            if (lengthHeuristic > 1500) {
                // Eventually break regardless of the line length so that
                // very long lines do not cause bad performance.
                // This effective limits max indentation to 500, as
                // indentation is not computed across multiple text nodes.
                break;
            }
        }
        // If a token contains some proper indentation, it also contains \n{INDENTATION+}(?!{INDENTATION}),
        // unless the line is too long.
        // Thus, the min indentation of the document is the minimum min indentation of every text node.
        const length = lengthDiff(startLineIdx, startLineCharOffset, this.lineIdx, this.lineCharOffset);
        return new Token(length, 0 /* TokenKind.Text */, -1, SmallImmutableSet.getEmpty(), new TextAstNode(length));
    }
}
export class FastTokenizer {
    constructor(text, brackets) {
        this.text = text;
        this._offset = lengthZero;
        this.idx = 0;
        const regExpStr = brackets.getRegExpStr();
        const regexp = regExpStr ? new RegExp(regExpStr + '|\n', 'gi') : null;
        const tokens = [];
        let match;
        let curLineCount = 0;
        let lastLineBreakOffset = 0;
        let lastTokenEndOffset = 0;
        let lastTokenEndLine = 0;
        const smallTextTokens0Line = [];
        for (let i = 0; i < 60; i++) {
            smallTextTokens0Line.push(new Token(toLength(0, i), 0 /* TokenKind.Text */, -1, SmallImmutableSet.getEmpty(), new TextAstNode(toLength(0, i))));
        }
        const smallTextTokens1Line = [];
        for (let i = 0; i < 60; i++) {
            smallTextTokens1Line.push(new Token(toLength(1, i), 0 /* TokenKind.Text */, -1, SmallImmutableSet.getEmpty(), new TextAstNode(toLength(1, i))));
        }
        if (regexp) {
            regexp.lastIndex = 0;
            // If a token contains indentation, it also contains \n{INDENTATION+}(?!{INDENTATION})
            while ((match = regexp.exec(text)) !== null) {
                const curOffset = match.index;
                const value = match[0];
                if (value === '\n') {
                    curLineCount++;
                    lastLineBreakOffset = curOffset + 1;
                }
                else {
                    if (lastTokenEndOffset !== curOffset) {
                        let token;
                        if (lastTokenEndLine === curLineCount) {
                            const colCount = curOffset - lastTokenEndOffset;
                            if (colCount < smallTextTokens0Line.length) {
                                token = smallTextTokens0Line[colCount];
                            }
                            else {
                                const length = toLength(0, colCount);
                                token = new Token(length, 0 /* TokenKind.Text */, -1, SmallImmutableSet.getEmpty(), new TextAstNode(length));
                            }
                        }
                        else {
                            const lineCount = curLineCount - lastTokenEndLine;
                            const colCount = curOffset - lastLineBreakOffset;
                            if (lineCount === 1 && colCount < smallTextTokens1Line.length) {
                                token = smallTextTokens1Line[colCount];
                            }
                            else {
                                const length = toLength(lineCount, colCount);
                                token = new Token(length, 0 /* TokenKind.Text */, -1, SmallImmutableSet.getEmpty(), new TextAstNode(length));
                            }
                        }
                        tokens.push(token);
                    }
                    // value is matched by regexp, so the token must exist
                    tokens.push(brackets.getToken(value));
                    lastTokenEndOffset = curOffset + value.length;
                    lastTokenEndLine = curLineCount;
                }
            }
        }
        const offset = text.length;
        if (lastTokenEndOffset !== offset) {
            const length = (lastTokenEndLine === curLineCount)
                ? toLength(0, offset - lastTokenEndOffset)
                : toLength(curLineCount - lastTokenEndLine, offset - lastLineBreakOffset);
            tokens.push(new Token(length, 0 /* TokenKind.Text */, -1, SmallImmutableSet.getEmpty(), new TextAstNode(length)));
        }
        this.length = toLength(curLineCount, offset - lastLineBreakOffset);
        this.tokens = tokens;
    }
    get offset() {
        return this._offset;
    }
    read() {
        return this.tokens[this.idx++] || null;
    }
    peek() {
        return this.tokens[this.idx] || null;
    }
    skip(length) {
        throw new NotSupportedError();
    }
    getText() {
        return this.text;
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidG9rZW5pemVyLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvZWRpdG9yL2NvbW1vbi9tb2RlbC9icmFja2V0UGFpcnNUZXh0TW9kZWxQYXJ0L2JyYWNrZXRQYWlyc1RyZWUvdG9rZW5pemVyLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sRUFBRSxpQkFBaUIsRUFBRSxNQUFNLHNDQUFzQyxDQUFDO0FBQ3pFLE9BQU8sRUFBcUIsYUFBYSxFQUFFLE1BQU0sb0NBQW9DLENBQUM7QUFFdEYsT0FBTyxFQUFrQixXQUFXLEVBQUUsTUFBTSxVQUFVLENBQUM7QUFFdkQsT0FBTyxFQUFVLFNBQVMsRUFBRSxVQUFVLEVBQUUsbUNBQW1DLEVBQUUsV0FBVyxFQUFFLFVBQVUsRUFBRSxRQUFRLEVBQUUsTUFBTSxhQUFhLENBQUM7QUFDcEksT0FBTyxFQUFFLGlCQUFpQixFQUFFLE1BQU0sd0JBQXdCLENBQUM7QUFhM0QsTUFBTSxDQUFOLElBQWtCLFNBSWpCO0FBSkQsV0FBa0IsU0FBUztJQUMxQix5Q0FBUSxDQUFBO0lBQ1IsNkRBQWtCLENBQUE7SUFDbEIsNkRBQWtCLENBQUE7QUFDbkIsQ0FBQyxFQUppQixTQUFTLEtBQVQsU0FBUyxRQUkxQjtBQUlELE1BQU0sT0FBTyxLQUFLO0lBQ2pCLFlBQ1UsTUFBYyxFQUNkLElBQWU7SUFDeEI7Ozs7T0FJRztJQUNNLFNBQTJCO0lBQ3BDOzs7O09BSUc7SUFDTSxVQUErQyxFQUMvQyxPQUFpRDtRQWRqRCxXQUFNLEdBQU4sTUFBTSxDQUFRO1FBQ2QsU0FBSSxHQUFKLElBQUksQ0FBVztRQU1mLGNBQVMsR0FBVCxTQUFTLENBQWtCO1FBTTNCLGVBQVUsR0FBVixVQUFVLENBQXFDO1FBQy9DLFlBQU8sR0FBUCxPQUFPLENBQTBDO0lBQ3ZELENBQUM7Q0FDTDtBQVlELE1BQU0sT0FBTyxtQkFBbUI7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