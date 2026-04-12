/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { EditOperation } from '../../../common/core/editOperation.js';
import { Position } from '../../../common/core/position.js';
import { Range } from '../../../common/core/range.js';
import { Selection } from '../../../common/core/selection.js';
export class BlockCommentCommand {
    constructor(selection, insertSpace, languageConfigurationService) {
        this.languageConfigurationService = languageConfigurationService;
        this._selection = selection;
        this._insertSpace = insertSpace;
        this._usedEndToken = null;
    }
    static _haystackHasNeedleAtOffset(haystack, needle, offset) {
        if (offset < 0) {
            return false;
        }
        const needleLength = needle.length;
        const haystackLength = haystack.length;
        if (offset + needleLength > haystackLength) {
            return false;
        }
        for (let i = 0; i < needleLength; i++) {
            const codeA = haystack.charCodeAt(offset + i);
            const codeB = needle.charCodeAt(i);
            if (codeA === codeB) {
                continue;
            }
            if (codeA >= 65 /* CharCode.A */ && codeA <= 90 /* CharCode.Z */ && codeA + 32 === codeB) {
                // codeA is upper-case variant of codeB
                continue;
            }
            if (codeB >= 65 /* CharCode.A */ && codeB <= 90 /* CharCode.Z */ && codeB + 32 === codeA) {
                // codeB is upper-case variant of codeA
                continue;
            }
            return false;
        }
        return true;
    }
    _createOperationsForBlockComment(selection, startToken, endToken, insertSpace, model, builder) {
        const startLineNumber = selection.startLineNumber;
        const startColumn = selection.startColumn;
        const endLineNumber = selection.endLineNumber;
        const endColumn = selection.endColumn;
        const startLineText = model.getLineContent(startLineNumber);
        const endLineText = model.getLineContent(endLineNumber);
        let startTokenIndex = startLineText.lastIndexOf(startToken, startColumn - 1 + startToken.length);
        let endTokenIndex = endLineText.indexOf(endToken, endColumn - 1 - endToken.length);
        if (startTokenIndex !== -1 && endTokenIndex !== -1) {
            if (startLineNumber === endLineNumber) {
                const lineBetweenTokens = startLineText.substring(startTokenIndex + startToken.length, endTokenIndex);
                if (lineBetweenTokens.indexOf(endToken) >= 0) {
                    // force to add a block comment
                    startTokenIndex = -1;
                    endTokenIndex = -1;
                }
            }
            else {
                const startLineAfterStartToken = startLineText.substring(startTokenIndex + startToken.length);
                const endLineBeforeEndToken = endLineText.substring(0, endTokenIndex);
                if (startLineAfterStartToken.indexOf(endToken) >= 0 || endLineBeforeEndToken.indexOf(endToken) >= 0) {
                    // force to add a block comment
                    startTokenIndex = -1;
                    endTokenIndex = -1;
                }
            }
        }
        let ops;
        if (startTokenIndex !== -1 && endTokenIndex !== -1) {
            // Consider spaces as part of the comment tokens
            if (insertSpace && startTokenIndex + startToken.length < startLineText.length && startLineText.charCodeAt(startTokenIndex + startToken.length) === 32 /* CharCode.Space */) {
                // Pretend the start token contains a trailing space
                startToken = startToken + ' ';
            }
            if (insertSpace && endTokenIndex > 0 && endLineText.charCodeAt(endTokenIndex - 1) === 32 /* CharCode.Space */) {
                // Pretend the end token contains a leading space
                endToken = ' ' + endToken;
                endTokenIndex -= 1;
            }
            ops = BlockCommentCommand._createRemoveBlockCommentOperations(new Range(startLineNumber, startTokenIndex + startToken.length + 1, endLineNumber, endTokenIndex + 1), startToken, endToken);
        }
        else {
            ops = BlockCommentCommand._createAddBlockCommentOperations(selection, startToken, endToken, this._insertSpace);
            this._usedEndToken = ops.length === 1 ? endToken : null;
        }
        for (const op of ops) {
            builder.addTrackedEditOperation(op.range, op.text);
        }
    }
    static _createRemoveBlockCommentOperations(r, startToken, endToken) {
        const res = [];
        if (!Range.isEmpty(r)) {
            // Remove block comment start
            res.push(EditOperation.delete(new Range(r.startLineNumber, r.startColumn - startToken.length, r.startLineNumber, r.startColumn)));
            // Remove block comment end
            res.push(EditOperation.delete(new Range(r.endLineNumber, r.endColumn, r.endLineNumber, r.endColumn + endToken.length)));
        }
        else {
            // Remove both continuously
            res.push(EditOperation.delete(new Range(r.startLineNumber, r.startColumn - startToken.length, r.endLineNumber, r.endColumn + endToken.length)));
        }
        return res;
    }
    static _createAddBlockCommentOperations(r, startToken, endToken, insertSpace) {
        const res = [];
        if (!Range.isEmpty(r)) {
            // Insert block comment start
            res.push(EditOperation.insert(new Position(r.startLineNumber, r.startColumn), startToken + (insertSpace ? ' ' : '')));
            // Insert block comment end
            res.push(EditOperation.insert(new Position(r.endLineNumber, r.endColumn), (insertSpace ? ' ' : '') + endToken));
        }
        else {
            // Insert both continuously
            res.push(EditOperation.replace(new Range(r.startLineNumber, r.startColumn, r.endLineNumber, r.endColumn), startToken + '  ' + endToken));
        }
        return res;
    }
    getEditOperations(model, builder) {
        const startLineNumber = this._selection.startLineNumber;
        const startColumn = this._selection.startColumn;
        model.tokenization.tokenizeIfCheap(startLineNumber);
        const languageId = model.getLanguageIdAtPosition(startLineNumber, startColumn);
        const config = this.languageConfigurationService.getLanguageConfiguration(languageId).comments;
        if (!config || !config.blockCommentStartToken || !config.blockCommentEndToken) {
            // Mode does not support block comments
            return;
        }
        this._createOperationsForBlockComment(this._selection, config.blockCommentStartToken, config.blockCommentEndToken, this._insertSpace, model, builder);
    }
    computeCursorState(model, helper) {
        const inverseEditOperations = helper.getInverseEditOperations();
        if (inverseEditOperations.length === 2) {
            const startTokenEditOperation = inverseEditOperations[0];
            const endTokenEditOperation = inverseEditOperations[1];
            return new Selection(startTokenEditOperation.range.endLineNumber, startTokenEditOperation.range.endColumn, endTokenEditOperation.range.startLineNumber, endTokenEditOperation.range.startColumn);
        }
        else {
            const srcRange = inverseEditOperations[0].range;
            const deltaColumn = this._usedEndToken ? -this._usedEndToken.length - 1 : 0; // minus 1 space before endToken
            return new Selection(srcRange.endLineNumber, srcRange.endColumn + deltaColumn, srcRange.endLineNumber, srcRange.endColumn + deltaColumn);
        }
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYmxvY2tDb21tZW50Q29tbWFuZC5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL2VkaXRvci9jb250cmliL2NvbW1lbnQvYnJvd3Nlci9ibG9ja0NvbW1lbnRDb21tYW5kLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBR2hHLE9BQU8sRUFBRSxhQUFhLEVBQXdCLE1BQU0sdUNBQXVDLENBQUM7QUFDNUYsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLGtDQUFrQyxDQUFDO0FBQzVELE9BQU8sRUFBRSxLQUFLLEVBQUUsTUFBTSwrQkFBK0IsQ0FBQztBQUN0RCxPQUFPLEVBQUUsU0FBUyxFQUFFLE1BQU0sbUNBQW1DLENBQUM7QUFLOUQsTUFBTSxPQUFPLG1CQUFtQjtJQU0vQixZQUNDLFNBQW9CLEVBQ3BCLFdBQW9CLEVBQ0gsNEJBQTJEO1FBQTNELGlDQUE0QixHQUE1Qiw0QkFBNEIsQ0FBK0I7UUFFNUUsSUFBSSxDQUFDLFVBQVUsR0FBRyxTQUFTLENBQUM7UUFDNUIsSUFBSSxDQUFDLFlBQVksR0FBRyxXQUFXLENBQUM7UUFDaEMsSUFBSSxDQUFDLGFBQWEsR0FBRyxJQUFJLENBQUM7SUFDM0IsQ0FBQztJQUVNLE1BQU0sQ0FBQywwQkFBMEIsQ0FBQyxRQUFnQixFQUFFLE1BQWMsRUFBRSxNQUFjO1FBQ3hGLElBQUksTUFBTSxHQUFHLENBQUMsRUFBRSxDQUFDO1lBQ2hCLE9BQU8sS0FBSyxDQUFDO1FBQ2QsQ0FBQztRQUNELE1BQU0sWUFBWSxHQUFHLE1BQU0sQ0FBQyxNQUFNLENBQUM7UUFDbkMsTUFBTSxjQUFjLEdBQUcsUUFBUSxDQUFDLE1BQU0sQ0FBQztRQUN2QyxJQUFJLE1BQU0sR0FBRyxZQUFZLEdBQUcsY0FBYyxFQUFFLENBQUM7WUFDNUMsT0FBTyxLQUFLLENBQUM7UUFDZCxDQUFDO1FBRUQsS0FBSyxJQUFJLENBQUMsR0FBRyxD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