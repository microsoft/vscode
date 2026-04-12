/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as strings from '../../../../base/common/strings.js';
import { EditOperation } from '../../../common/core/editOperation.js';
import { Position } from '../../../common/core/position.js';
import { Range } from '../../../common/core/range.js';
import { Selection } from '../../../common/core/selection.js';
import { BlockCommentCommand } from './blockCommentCommand.js';
export var Type;
(function (Type) {
    Type[Type["Toggle"] = 0] = "Toggle";
    Type[Type["ForceAdd"] = 1] = "ForceAdd";
    Type[Type["ForceRemove"] = 2] = "ForceRemove";
})(Type || (Type = {}));
export class LineCommentCommand {
    constructor(languageConfigurationService, selection, indentSize, type, insertSpace, ignoreEmptyLines, ignoreFirstLine) {
        this.languageConfigurationService = languageConfigurationService;
        this._selection = selection;
        this._indentSize = indentSize;
        this._type = type;
        this._insertSpace = insertSpace;
        this._selectionId = null;
        this._deltaColumn = 0;
        this._moveEndPositionDown = false;
        this._ignoreEmptyLines = ignoreEmptyLines;
        this._ignoreFirstLine = ignoreFirstLine || false;
    }
    /**
     * Do an initial pass over the lines and gather info about the line comment string.
     * Returns null if any of the lines doesn't support a line comment string.
     */
    static _gatherPreflightCommentStrings(model, startLineNumber, endLineNumber, languageConfigurationService) {
        model.tokenization.tokenizeIfCheap(startLineNumber);
        const languageId = model.getLanguageIdAtPosition(startLineNumber, 1);
        const config = languageConfigurationService.getLanguageConfiguration(languageId).comments;
        const commentStr = (config ? config.lineCommentToken : null);
        if (!commentStr) {
            // Mode does not support line comments
            return null;
        }
        const lines = [];
        for (let i = 0, lineCount = endLineNumber - startLineNumber + 1; i < lineCount; i++) {
            lines[i] = {
                ignore: false,
                commentStr: commentStr,
                commentStrOffset: 0,
                commentStrLength: commentStr.length
            };
        }
        return lines;
    }
    /**
     * Analyze lines and decide which lines are relevant and what the toggle should do.
     * Also, build up several offsets and lengths useful in the generation of editor operations.
     */
    static _analyzeLines(type, insertSpace, model, lines, startLineNumber, ignoreEmptyLines, ignoreFirstLine, languageConfigurationService, languageId) {
        let onlyWhitespaceLines = true;
        const config = languageConfigurationService.getLanguageConfiguration(languageId).comments;
        const lineCommentNoIndent = config?.lineCommentNoIndent ?? false;
        let shouldRemoveComments;
        if (type === 0 /* Type.Toggle */) {
            shouldRemoveComments = true;
        }
        else if (type === 1 /* Type.ForceAdd */) {
            shouldRemoveComments = false;
        }
        else {
            shouldRemoveComments = true;
        }
        for (let i = 0, lineCount = lines.length; i < lineCount; i++) {
            const lineData = lines[i];
            const lineNumber = startLineNumber + i;
            if (lineNumber === startLineNumber && ignoreFirstLine) {
                // first line ignored
                lineData.ignore = true;
                continue;
            }
            const lineContent = model.getLineContent(lineNumber);
            const lineContentStartOffset = strings.firstNonWhitespaceIndex(lineContent);
            if (lineContentStartOffset === -1) {
                // Empty or whitespace only line
                lineData.ignore = ignoreEmptyLines;
                lineData.commentStrOffset = lineCommentNoIndent ? 0 : lineContent.length;
                continue;
            }
            onlyWhitespaceLines = false;
            const offset = lineCommentNoIndent ? 0 : lineContentStartOffset;
            lineData.ignore = false;
            lineData.commentStrOffset = offset;
            if (shouldRemoveComments && !BlockCommentCommand._haystackHasNeedleAtOffset(lineContent, lineData.commentStr, offset)) {
                if (type === 0 /* Type.Toggle */) {
                    // Every line so far has been a line comment, but this one is not
                    shouldRemoveComments = false;
                }
                else if (type === 1 /* Type.ForceAdd */) {
                    // Will not happen
                }
                else {
                    lineData.ignore = true;
                }
            }
            if (shouldRemoveComments && insertSpace) {
                // Remove a following space if present
                const commentStrEndOffset = lineContentStartOffset + lineData.commentStrLength;
                if (commentStrEndOffset < lineContent.length && lineContent.charCodeAt(commentStrEndOffset) === 32 /* CharCode.Space */) {
                    lineData.commentStrLength += 1;
                }
            }
        }
        if (type === 0 /* Type.Toggle */ && onlyWhitespaceLines) {
            // For only whitespace lines, we insert comments
            shouldRemoveComments = false;
            // Also, no longer ignore them
            for (let i = 0, lineCount = lines.length; i < lineCount; i++) {
                lines[i].ignore = false;
            }
        }
        return {
            supported: true,
            shouldRemoveComments: shouldRemoveComments,
            lines: lines
        };
    }
    /**
     * Analyze all lines and decide exactly what to do => not supported | insert line comments | remove line comments
     */
    static _gatherPreflightData(type, insertSpace, model, startLineNumber, endLineNumber, ignoreEmptyLines, ignoreFirstLine, languageConfigurationService) {
        const lines = LineCommentCommand._gatherPreflightCommentStrings(model, startLineNumber, endLineNumber, languageConfigurationService);
        const languageId = model.getLanguageIdAtPosition(startLineNumber, 1);
        if (lines === null) {
            return {
                supported: false
            };
        }
        return LineCommentCommand._analyzeLines(type, insertSpace, model, lines, startLineNumber, ignoreEmptyLines, ignoreFirstLine, languageConfigurationService, languageId);
    }
    /**
     * Given a successful analysis, execute either insert line comments, either remove line comments
     */
    _executeLineComments(model, builder, data, s) {
        let ops;
        if (data.shouldRemoveComments) {
            ops = LineCommentCommand._createRemoveLineCommentsOperations(data.lines, s.startLineNumber);
        }
        else {
            LineCommentCommand._normalizeInsertionPoint(model, data.lines, s.startLineNumber, this._indentSize);
            ops = this._createAddLineCommentsOperations(data.lines, s.startLineNumber);
        }
        const cursorPosition = new Position(s.positionLineNumber, s.positionColumn);
        for (let i = 0, len = ops.length; i < len; i++) {
            builder.addEditOperation(ops[i].range, ops[i].text);
            if (Range.isEmpty(ops[i].range) && Range.getStartPosition(ops[i].range).equals(cursorPosition)) {
                const lineContent = model.getLineContent(cursorPosition.lineNumber);
                if (lineContent.length + 1 === cursorPosition.column) {
                    this._deltaColumn = (ops[i].text || '').length;
                }
            }
        }
        this._selectionId = builder.trackSelection(s);
    }
    _attemptRemoveBlockComment(model, s, startToken, endToken) {
        let startLineNumber = s.startLineNumber;
        let endLineNumber = s.endLineNumber;
        const startTokenAllowedBeforeColumn = endToken.length + Math.max(model.getLineFirstNonWhitespaceColumn(s.startLineNumber), s.startColumn);
        let startTokenIndex = model.getLineContent(startLineNumber).lastIndexOf(startToken, startTokenAllowedBeforeColumn - 1);
        let endTokenIndex = model.getLineContent(endLineNumber).indexOf(endToken, s.endColumn - 1 - startToken.length);
        if (startTokenIndex !== -1 && endTokenIndex === -1) {
            endTokenIndex = model.getLineContent(startLineNumber).indexOf(endToken, startTokenIndex + startToken.length);
            endLineNumber = startLineNumber;
        }
        if (startTokenIndex === -1 && endTokenIndex !== -1) {
            startTokenIndex = model.getLineContent(endLineNumber).lastIndexOf(startToken, endTokenIndex);
            startLineNumber = endLineNumber;
        }
        if (s.isEmpty() && (startTokenIndex === -1 || endTokenIndex === -1)) {
            startTokenIndex = model.getLineContent(startLineNumber).indexOf(startToken);
            if (startTokenIndex !== -1) {
                endTokenIndex = model.getLineContent(startLineNumber).indexOf(endToken, startTokenIndex + startToken.length);
            }
        }
        // We have to adjust to possible inner white space.
        // For Space after startToken, add Space to startToken - range math will work out.
        if (startTokenIndex !== -1 && model.getLineContent(startLineNumber).charCodeAt(startTokenIndex + startToken.length) === 32 /* CharCode.Space */) {
            startToken += ' ';
        }
        // For Space before endToken, add Space before endToken and shift index one left.
        if (endTokenIndex !== -1 && model.getLineContent(endLineNumber).charCodeAt(endTokenIndex - 1) === 32 /* CharCode.Space */) {
            endToken = ' ' + endToken;
            endTokenIndex -= 1;
        }
        if (startTokenIndex !== -1 && endTokenIndex !== -1) {
            return BlockCommentCommand._createRemoveBlockCommentOperations(new Range(startLineNumber, startTokenIndex + startToken.length + 1, endLineNumber, endTokenIndex + 1), startToken, endToken);
        }
        return null;
    }
    /**
     * Given an unsuccessful analysis, delegate to the block comment command
     */
    _executeBlockComment(model, builder, s) {
        model.tokenization.tokenizeIfCheap(s.startLineNumber);
        const languageId = model.getLanguageIdAtPosition(s.startLineNumber, 1);
        const config = this.languageConfigurationService.getLanguageConfiguration(languageId).comments;
        if (!config || !config.blockCommentStartToken || !config.blockCommentEndToken) {
            // Mode does not support block comments
            return;
        }
        const startToken = config.blockCommentStartToken;
        const endToken = config.blockCommentEndToken;
        let ops = this._attemptRemoveBlockComment(model, s, startToken, endToken);
        if (!ops) {
            if (s.isEmpty()) {
                const lineContent = model.getLineContent(s.startLineNumber);
                let firstNonWhitespaceIndex = strings.firstNonWhitespaceIndex(lineContent);
                if (firstNonWhitespaceIndex === -1) {
                    // Line is empty or contains only whitespace
                    firstNonWhitespaceIndex = lineContent.length;
                }
                ops = BlockCommentCommand._createAddBlockCommentOperations(new Range(s.startLineNumber, firstNonWhitespaceIndex + 1, s.startLineNumber, lineContent.length + 1), startToken, endToken, this._insertSpace);
            }
            else {
                ops = BlockCommentCommand._createAddBlockCommentOperations(new Range(s.startLineNumber, model.getLineFirstNonWhitespaceColumn(s.startLineNumber), s.endLineNumber, model.getLineMaxColumn(s.endLineNumber)), startToken, endToken, this._insertSpace);
            }
            if (ops.length === 1) {
                // Leave cursor after token and Space
                this._deltaColumn = startToken.length + 1;
            }
        }
        this._selectionId = builder.trackSelection(s);
        for (const op of ops) {
            builder.addEditOperation(op.range, op.text);
        }
    }
    getEditOperations(model, builder) {
        let s = this._selection;
        this._moveEndPositionDown = false;
        if (s.startLineNumber === s.endLineNumber && this._ignoreFirstLine) {
            builder.addEditOperation(new Range(s.startLineNumber, model.getLineMaxColumn(s.startLineNumber), s.startLineNumber + 1, 1), s.startLineNumber === model.getLineCount() ? '' : '\n');
            this._selectionId = builder.trackSelection(s);
            return;
        }
        if (s.startLineNumber < s.endLineNumber && s.endColumn === 1) {
            this._moveEndPositionDown = true;
            s = s.setEndPosition(s.endLineNumber - 1, model.getLineMaxColumn(s.endLineNumber - 1));
        }
        const data = LineCommentCommand._gatherPreflightData(this._type, this._insertSpace, model, s.startLineNumber, s.endLineNumber, this._ignoreEmptyLines, this._ignoreFirstLine, this.languageConfigurationService);
        if (data.supported) {
            return this._executeLineComments(model, builder, data, s);
        }
        return this._executeBlockComment(model, builder, s);
    }
    computeCursorState(model, helper) {
        let result = helper.getTrackedSelection(this._selectionId);
        if (this._moveEndPositionDown) {
            result = result.setEndPosition(result.endLineNumber + 1, 1);
        }
        return new Selection(result.selectionStartLineNumber, result.selectionStartColumn + this._deltaColumn, result.positionLineNumber, result.positionColumn + this._deltaColumn);
    }
    /**
     * Generate edit operations in the remove line comment case
     */
    static _createRemoveLineCommentsOperations(lines, startLineNumber) {
        const res = [];
        for (let i = 0, len = lines.length; i < len; i++) {
            const lineData = lines[i];
            if (lineData.ignore) {
                continue;
            }
            res.push(EditOperation.delete(new Range(startLineNumber + i, lineData.commentStrOffset + 1, startLineNumber + i, lineData.commentStrOffset + lineData.commentStrLength + 1)));
        }
        return res;
    }
    /**
     * Generate edit operations in the add line comment case
     */
    _createAddLineCommentsOperations(lines, startLineNumber) {
        const res = [];
        const afterCommentStr = this._insertSpace ? ' ' : '';
        for (let i = 0, len = lines.length; i < len; i++) {
            const lineData = lines[i];
            if (lineData.ignore) {
                continue;
            }
            res.push(EditOperation.insert(new Position(startLineNumber + i, lineData.commentStrOffset + 1), lineData.commentStr + afterCommentStr));
        }
        return res;
    }
    static nextVisibleColumn(currentVisibleColumn, indentSize, isTab, columnSize) {
        if (isTab) {
            return currentVisibleColumn + (indentSize - (currentVisibleColumn % indentSize));
        }
        return currentVisibleColumn + columnSize;
    }
    /**
     * Adjust insertion points to have them vertically aligned in the add line comment case
     */
    static _normalizeInsertionPoint(model, lines, startLineNumber, indentSize) {
        let minVisibleColumn = 1073741824 /* Constants.MAX_SAFE_SMALL_INTEGER */;
        let j;
        let lenJ;
        for (let i = 0, len = lines.length; i < len; i++) {
            if (lines[i].ignore) {
                continue;
            }
            const lineContent = model.getLineContent(startLineNumber + i);
            let currentVisibleColumn = 0;
            for (let j = 0, lenJ = lines[i].commentStrOffset; currentVisibleColumn < minVisibleColumn && j < lenJ; j++) {
                currentVisibleColumn = LineCommentCommand.nextVisibleColumn(currentVisibleColumn, indentSize, lineContent.charCodeAt(j) === 9 /* CharCode.Tab */, 1);
            }
            if (currentVisibleColumn < minVisibleColumn) {
                minVisibleColumn = currentVisibleColumn;
            }
        }
        minVisibleColumn = Math.floor(minVisibleColumn / indentSize) * indentSize;
        for (let i = 0, len = lines.length; i < len; i++) {
            if (lines[i].ignore) {
                continue;
            }
            const lineContent = model.getLineContent(startLineNumber + i);
            let currentVisibleColumn = 0;
            for (j = 0, lenJ = lines[i].commentStrOffset; currentVisibleColumn < minVisibleColumn && j < lenJ; j++) {
                currentVisibleColumn = LineCommentCommand.nextVisibleColumn(currentVisibleColumn, indentSize, lineContent.charCodeAt(j) === 9 /* CharCode.Tab */, 1);
            }
            if (currentVisibleColumn > minVisibleColumn) {
                lines[i].commentStrOffset = j - 1;
            }
            else {
                lines[i].commentStrOffset = j;
            }
        }
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibGluZUNvbW1lbnRDb21tYW5kLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvZWRpdG9yL2NvbnRyaWIvY29tbWVudC9icm93c2VyL2xpbmVDb21tZW50Q29tbWFuZC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUdoRyxPQUFPLEtBQUssT0FBTyxNQUFNLG9DQUFvQyxDQUFDO0FBRTlELE9BQU8sRUFBRSxhQUFhLEVBQXdCLE1BQU0sdUNBQXVDLENBQUM7QUFDNUYsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLGtDQUFrQyxDQUFDO0FBQzVELE9BQU8sRUFBRSxLQUFLLEVBQUUsTUFBTSwrQkFBK0IsQ0FBQztBQUN0RCxPQUFPLEVBQUUsU0FBUyxFQUFFLE1BQU0sbUNBQW1DLENBQUM7QUFJOUQsT0FBTyxFQUFFLG1CQUFtQixFQUFFLE1BQU0sMEJBQTBCLENBQUM7QUE0Qi9ELE1BQU0sQ0FBTixJQUFrQixJQUlqQjtBQUpELFdBQWtCLElBQUk7SUFDckIsbUNBQVUsQ0FBQTtJQUNWLHVDQUFZLENBQUE7SUFDWiw2Q0FBZSxDQUFBO0FBQ2hCLENBQUMsRUFKaUIsSUFBSSxLQUFKLElBQUksUUFJckI7QUFFRCxNQUFNLE9BQU8sa0JBQWtCO0lBWTlCLFlBQ2tCLDRCQUEyRCxFQUM1RSxTQUFvQixFQUNwQixVQUFrQixFQUNsQixJQUFVLEVBQ1YsV0FBb0IsRUFDcEIsZ0JBQXlCLEVBQ3pCLGVBQXlCO1FBTlIsaUNBQTRCLEdBQTVCLDRCQUE0QixDQUErQjtRQVE1RSxJQUFJLENBQUMsVUFBVSxHQUFHLFNBQVMsQ0FBQztRQUM1QixJQUFJLENBQUMsV0FBVyxHQUFHLFVBQVUsQ0FBQztRQUM5QixJQUFJLENBQUMsS0FBSyxHQUFHLElBQUksQ0FBQztRQUNsQixJQUFJLENBQUMsWUFBWSxHQUFHLFdBQVcsQ0FBQztRQUNoQyxJQUFJLENBQUMsWUFBWSxHQUFHLElBQUksQ0FBQztRQUN6QixJQUFJLENBQUMsWUFBWSxHQUFHLENBQUMsQ0FBQztRQUN0QixJQUFJLENBQUMsb0JBQW9CLEdBQUcsS0FBSyxDQUFDO1FBQ2xDLElBQUksQ0FBQyxpQkFBaUIsR0FBRyxnQkFBZ0IsQ0FBQztRQUMxQyxJQUFJLENBQUMsZ0JBQWdCLEdBQUcsZUFBZSxJQUFJLEtBQUssQ0FBQztJQUNsRCxDQUFDO0lBRUQ7OztPQUdHO0lBQ0ssTUFBTSxDQUFDLDhCQUE4QixDQUFDLEtBQWlCLEVBQUUsZUFBdUIsRUFBRSxhQUFxQixFQUFFLDRCQUEyRDtRQUUzSyxLQUFLLENBQUMsWUFBWSxDQUFDLGVBQWUsQ0FBQyxlQUFlLENBQUMsQ0FBQztRQUNwRCxNQUFNLFVBQVUsR0FBRyxLQUFLLENBQUMsdUJBQXVCLENBQUMsZUFBZSxFQUFFLENBQUMsQ0FBQyxDQUFDO1FBRXJFLE1BQU0sTUFBTSxHQUFHLDRCQUE0QixDQUFDLHdCQUF3QixDQUFDLFVBQVUsQ0FBQyxDQUFDLFFBQVEsQ0FBQztRQUMxRixNQUFNLFVBQVUsR0FBRyxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsTUFBTSxDQUFDLGdCQUFnQixDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsQ0FBQztRQUM3RCxJQUFJLENBQUMsVUFBVSxFQUFFLENBQUM7WUFDakIsc0NBQXNDO1lBQ3RDLE9BQU8sSUFBSSxDQUFDO1FBQ2IsQ0FBQztRQUVELE1BQU0sS0FBSyxHQUF5QixFQUFFLENBQUM7UUFDdkMsS0FBSyxJQUFJLENBQUMsR0FBRyxDQUFDLEVBQUUsU0FBUyxHQUFHLGFBQWEsR0FBRyxlQUFlLEdBQUcsQ0FBQyxFQUFFLENBQUMsR0FBRyxTQUFTLEVBQUUsQ0FBQyxFQUFFLEVBQUUsQ0FBQztZQUNyRixLQUFLLENBQUMsQ0FBQyxDQUFDLEdBQUc7Z0JBQ1YsTUFBTSxFQUFFLEtBQUs7Z0JBQ2IsVUFBVSxFQUFFLFVBQVU7Z0JBQ3RCLGdCQUFnQixFQUFFLENBQUM7Z0JBQ25CLGdCQUFnQixFQUFFLFVBQVUsQ0FBQyxNQUFNO2FBQ25DLENBQUM7UUFDSCxDQUFDO1FBRUQsT0FBTyxLQUFLLENBQUM7SUFDZCxDQUFDO0lBRUQ7OztPQUdHO0lBQ0ksTUFBTSxDQUFDLGFBQWEsQ0FBQyxJQUFVLEVBQUUsV0FBb0IsRUFBRSxLQUFtQixFQUFFLEtBQTJCLEVBQUUsZUFBdUIsRUFBRSxnQkFBeUIsRUFBRSxlQUF3QixFQUFFLDRCQUEyRCxFQUFFLFVBQWtCO1FBQzVRLElBQUksbUJBQW1CLEdBQUcsSUFBSSxDQUFDO1FBRS9CLE1BQU0sTUFBTSxHQUFHLDRCQUE0QixDQUFDLHdCQUF3QixDQUFDLFVBQVUsQ0FBQyxDQUFDLFFBQVEsQ0FBQztRQUMxRixNQUFNLG1CQUFtQixHQUFHLE1BQU0sRUFBRSxtQkFBbUIsSUFBSSxLQUFLLENBQUM7UUFFakUsSUFBSSxvQkFBNkIsQ0FBQztRQUNsQyxJQUFJLElBQUksd0JBQWdCLEVBQUUsQ0FBQztZQUMxQixvQkFBb0IsR0FBRyxJQUFJLENBQUM7UUFDN0IsQ0FBQzthQUFNLElBQUksSUFBSSwwQkFBa0IsRUFBRSxDQUFDO1lBQ25DLG9CQUFvQixHQUFHLEtBQUssQ0FBQztRQUM5QixDQUFDO2FBQU0sQ0FBQztZQUNQLG9CQUFvQixHQUFHLElBQUksQ0FBQztRQUM3QixDQUFDO1FBRUQsS0FBSyxJQUFJLENBQUMsR0FBRyxDQUFDLEVBQUUsU0FBUyxHQUFHLEtBQUssQ0FBQyxNQUFNLEVBQUUsQ0FBQyxHQUFHLFNBQVMsRUFBRSxDQUFDLEVBQUUsRUFBRSxDQUFDO1lBQzlELE1BQU0sUUFBUSxHQUFHLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQztZQUMxQixNQUFNLFVBQVUsR0FBRyxlQUFlLEdBQUcsQ0FBQyxDQUFDO1lBRXZDLElBQUksVUFBVSxLQUFLLGVBQWUsSUFBSSxlQUFlLEVBQUUsQ0FBQztnQkFDdkQscUJBQXFCO2dCQUNyQixRQUFRLENBQUMsTUFBTSxHQUFHLElBQUksQ0FBQztnQkFDdkIsU0FBUztZQUNWLENBQUM7WUFFRCxNQUFNLFdBQVcsR0FBRyxLQUFLLENBQUMsY0FBYyxDQUFDLFVBQVUsQ0FBQyxDQUFDO1lBQ3JELE1BQU0sc0JBQXNCLEdBQUcsT0FBTyxDQUFDLHVCQUF1QixDQUFDLFdBQVcsQ0FBQyxDQUFDO1lBRTVFLElBQUksc0JBQXNCLEtBQUssQ0FBQyxDQUFDLEVBQUUsQ0FBQztnQkFDbkMsZ0NBQWdDO2dCQUNoQyxRQUFRLENBQUMsTUFBTSxHQUFHLGdCQUFnQixDQUFDO2dCQUNuQyxRQUFRLENBQUMsZ0JBQWdCLEdBQUcsbUJBQW1CLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsV0FBVyxDQUFDLE1BQU0sQ0FBQztnQkFDekUsU0FBUztZQUNWLENBQUM7WUFFRCxtQkFBbUIsR0FBRyxLQUFLLENBQUM7WUFDNUIsTUFBTSxNQUFNLEdBQUcsbUJBQW1CLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsc0JBQXNCLENBQUM7WUFDaEUsUUFBUSxDQUFDLE1BQU0sR0FBRyxLQUFLLENBQUM7WUFDeEIsUUFBUSxDQUFDLGdCQUFnQixHQUFHLE1BQU0sQ0FBQztZQUVuQyxJQUFJLG9CQUFvQixJQUFJLENBQUMsbUJBQW1CLENBQUMsMEJBQTBCLENBQUMsV0FBVyxFQUFFLFFBQVEsQ0FBQyxVQUFVLEVBQUUsTUFBTSxDQUFDLEVBQUUsQ0FBQztnQkFDdkgsSUFBSSxJQUFJLHdCQUFnQixFQUFFLENBQUM7b0JBQzFCLGlFQUFpRTtvQkFDakUsb0JBQW9CLEdBQUcsS0FBSyxDQUFDO2dCQUM5QixDQUFDO3FCQUFNLElBQUksSUFBSSwwQkFBa0IsRUFBRSxDQUFDO29CQUNuQyxrQkFBa0I7Z0JBQ25CLENBQUM7cUJBQU0sQ0FBQztvQkFDUCxRQUFRLENBQUMsTUFBTSxHQUFHLElBQUksQ0FBQztnQkFDeEIsQ0FBQztZQUNGLENBQUM7WUFFRCxJQUFJLG9CQUFvQixJQUFJLFdBQVcsRUFBRSxDQUFDO2dCQUN6QyxzQ0FBc0M7Z0JBQ3RDLE1BQU0sbUJBQW1CLEdBQUcsc0JBQXNCLEdBQUcsUUFBUSxDQUFDLGdCQUFnQixDQUFDO2dCQUMvRSxJQUFJLG1CQUFtQixHQUFHLFdBQVcsQ0FBQyxNQUFNLElBQUksV0FBVyxDQUFDLFVBQVUsQ0FBQyxtQkFBbUIsQ0FBQyw0QkFBbUIsRUFBRSxDQUFDO29CQUNoSCxRQUFRLENBQUMsZ0JBQWdCLElBQUksQ0FBQyxDQUFDO2dCQUNoQyxDQUFDO1lBQ0YsQ0FBQztRQUNGLENBQUM7UUFFRCxJQUFJLElBQUksd0JBQWdCLElBQUksbUJBQW1CLEVBQUUsQ0FBQztZQUNqRCxnREFBZ0Q7WUFDaEQsb0JBQW9CLEdBQUcsS0FBSyxDQUFDO1lBRTdCLDhCQUE4QjtZQUM5QixLQUFLLElBQUksQ0FBQyxHQUFHLENBQUMsRUFBRSxTQUFTLEdBQUcsS0FBSyxDQUFDLE1BQU0sRUFBRSxDQUFDLEdBQUcsU0FBUyxFQUFFLENBQUMsRUFBRSxFQUFFLENBQUM7Z0JBQzlELEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQyxNQUFNLEdBQUcsS0FBSyxDQUFDO1lBQ3pCLENBQUM7UUFDRixDQUFDO1FBRUQsT0FBTztZQUNOLFNBQVMsRUFBRSxJQUFJO1lBQ2Ysb0JBQW9CLEVBQUUsb0JBQW9CO1lBQzFDLEtBQUssRUFBRSxLQUFLO1NBQ1osQ0FBQztJQUNILENBQUM7SUFFRDs7T0FFRztJQUNJLE1BQU0sQ0FBQyxvQkFBb0IsQ0FBQyxJQUFVLEVBQUUsV0FBb0IsRUFBRSxLQUFpQixFQUFFLGVBQXVCLEVBQUUsYUFBcUIsRUFBRSxnQkFBeUIsRUFBRSxlQUF3QixFQUFFLDRCQUEyRDtRQUN2UCxNQUFNLEtBQUssR0FBRyxrQkFBa0IsQ0FBQyw4QkFBOEIsQ0FBQyxLQUFLLEVBQUUsZUFBZSxFQUFFLGFBQWEsRUFBRSw0QkFBNEIsQ0FBQyxDQUFDO1FBQ3JJLE1BQU0sVUFBVSxHQUFHLEtBQUssQ0FBQyx1QkFBdUIsQ0FBQyxlQUFlLEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFDckUsSUFBSSxLQUFLLEtBQUssSUFBSSxFQUFFLENBQUM7WUFDcEIsT0FBTztnQkFDTixTQUFTLEVBQUUsS0FBSzthQUNoQixDQUFDO1FBQ0gsQ0FBQztRQUVELE9BQU8sa0JBQWtCLENBQUMsYUFBYSxDQUFDLElBQUksRUFBRSxXQUFXLEVBQUUsS0FBSyxFQUFFLEtBQUssRUFBRSxlQUFlLEVBQUUsZ0JBQWdCLEVBQUUsZUFBZSxFQUFFLDRCQUE0QixFQUFFLFVBQVUsQ0FBQyxDQUFDO0lBQ3hLLENBQUM7SUFFRDs7T0FFRztJQUNLLG9CQUFvQixDQUFDLEtBQW1CLEVBQUUsT0FBOEIsRUFBRSxJQUE2QixFQUFFLENBQVk7UUFFNUgsSUFBSSxHQUEyQixDQUFDO1FBRWhDLElBQUksSUFBSSxDQUFDLG9CQUFvQixFQUFFLENBQUM7WUFDL0IsR0FBRyxHQUFHLGtCQUFrQixDQUFDLG1DQUFtQyxDQUFDLElBQUksQ0FBQyxLQUFLLEVBQUUsQ0FBQyxDQUFDLGVBQWUsQ0FBQyxDQUFDO1FBQzdGLENBQUM7YUFBTSxDQUFDO1lBQ1Asa0JBQWtCLENBQUMsd0JBQXdCLENBQUMsS0FBSyxFQUFFLElBQUksQ0FBQyxLQUFLLEVBQUUsQ0FBQyxDQUFDLGVBQWUsRUFBRSxJQUFJLENBQUMsV0FBVyxDQUFDLENBQUM7WUFDcEcsR0FBRyxHQUFHLElBQUksQ0FBQyxnQ0FBZ0MsQ0FBQyxJQUFJLENBQUMsS0FBSyxFQUFFLENBQUMsQ0FBQyxlQUFlLENBQUMsQ0FBQztRQUM1RSxDQUFDO1FBRUQsTUFBTSxjQUFjLEdBQUcsSUFBSSxRQUFRLENBQUMsQ0FBQyxDQUFDLGtCQUFrQixFQUFFLENBQUMsQ0FBQyxjQUFjLENBQUMsQ0FBQztRQUU1RSxLQUFLLElBQUksQ0FBQyxHQUFHLENBQUMsRUFBRSxHQUFHLEdBQUcsR0FBRyxDQUFDLE1BQU0sRUFBRSxDQUFDLEdBQUcsR0FBRyxFQUFFLENBQUMsRUFBRSxFQUFFLENBQUM7WUFDaEQsT0FBTyxDQUFDLGdCQUFnQixDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsQ0FBQyxLQUFLLEVBQUUsR0FBRyxDQUFDLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxDQUFDO1lBQ3BELElBQUksS0FBSyxDQUFDLE9BQU8sQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLENBQUMsS0FBSyxDQUFDLElBQUksS0FBSyxDQUFDLGdCQUFnQixDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsQ0FBQyxLQUFLLENBQUMsQ0FBQyxNQUFNLENBQUMsY0FBYyxDQUFDLEVBQUUsQ0FBQztnQkFDaEcsTUFBTSxXQUFXLEdBQUcsS0FBSyxDQUFDLGNBQWMsQ0FBQyxjQUFjLENBQUMsVUFBVSxDQUFDLENBQUM7Z0JBQ3BFLElBQUksV0FBVyxDQUFDLE1BQU0sR0FBRyxDQUFDLEtBQUssY0FBYyxDQUFDLE1BQU0sRUFBRSxDQUFDO29CQUN0RCxJQUFJLENBQUMsWUFBWSxHQUFHLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxDQUFDLElBQUksSUFBSSxFQUFFLENBQUMsQ0FBQyxNQUFNLENBQUM7Z0JBQ2hELENBQUM7WUFDRixDQUFDO1FBQ0YsQ0FBQztRQUVELElBQUksQ0FBQyxZQUFZLEdBQUcsT0FBTyxDQUFDLGNBQWMsQ0FBQyxDQUFDLENBQUMsQ0FBQztJQUMvQyxDQUFDO0lBRU8sMEJBQTBCLENBQUMsS0FBaUIsRUFBRSxDQUFZLEVBQUUsVUFBa0IsRUFBRSxRQUFnQjtRQUN2RyxJQUFJLGVBQWUsR0FBRyxDQUFDLENBQUMsZUFBZSxDQUFDO1FBQ3hDLElBQUksYUFBYSxHQUFHLENBQUMsQ0FBQyxhQUFhLENBQUM7UUFFcEMsTUFBTSw2QkFBNkIsR0FBRyxRQUFRLENBQUMsTUFBTSxHQUFHLElBQUksQ0FBQyxHQUFHLENBQy9ELEtBQUssQ0FBQywrQkFBK0IsQ0FBQyxDQUFDLENBQUMsZUFBZSxDQUFDLEVBQ3hELENBQUMsQ0FBQyxXQUFXLENBQ2IsQ0FBQztRQUVGLElBQUksZUFBZSxHQUFHLEtBQUssQ0FBQyxjQUFjLENBQUMsZUFBZSxDQUFDLENBQUMsV0FBVyxDQUFDLFVBQVUsRUFBRSw2QkFBNkIsR0FBRyxDQUFDLENBQUMsQ0FBQztRQUN2SCxJQUFJLGFBQWEsR0FBRyxLQUFLLENBQUMsY0FBYyxDQUFDLGFBQWEsQ0FBQyxDQUFDLE9BQU8sQ0FBQyxRQUFRLEVBQUUsQ0FBQyxDQUFDLFNBQVMsR0FBRyxDQUFDLEdBQUcsVUFBVSxDQUFDLE1BQU0sQ0FBQyxDQUFDO1FBRS9HLElBQUksZUFBZSxLQUFLLENBQUMsQ0FBQyxJQUFJLGFBQWEsS0FBSyxDQUFDLENBQUMsRUFBRSxDQUFDO1lBQ3BELGFBQWEsR0FBRyxLQUFLLENBQUMsY0FBYyxDQUFDLGVBQWUsQ0FBQyxDQUFDLE9BQU8sQ0FBQyxRQUFRLEVBQUUsZUFBZSxHQUFHLFVBQVUsQ0FBQyxNQUFNLENBQUMsQ0FBQztZQUM3RyxhQUFhLEdBQUcsZUFBZSxDQUFDO1FBQ2pDLENBQUM7UUFFRCxJQUFJLGVBQWUsS0FBSyxDQUFDLENBQUMsSUFBSSxhQUFhLEtBQUssQ0FBQyxDQUFDLEVBQUUsQ0FBQztZQUNwRCxlQUFlLEdBQUcsS0FBSyxDQUFDLGNBQWMsQ0FBQyxhQUFhLENBQUMsQ0FBQyxXQUFXLENBQUMsVUFBVSxFQUFFLGFBQWEsQ0FBQyxDQUFDO1lBQzdGLGVBQWUsR0FBRyxhQUFhLENBQUM7UUFDakMsQ0FBQztRQUVELElBQUksQ0FBQyxDQUFDLE9BQU8sRUFBRSxJQUFJLENBQUMsZUFBZSxLQUFLLENBQUMsQ0FBQyxJQUFJLGFBQWEsS0FBSyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUM7WUFDckUsZUFBZSxHQUFHLEtBQUssQ0FBQyxjQUFjLENBQUMsZUFBZSxDQUFDLENBQUMsT0FBTyxDQUFDLFVBQVUsQ0FBQyxDQUFDO1lBQzVFLElBQUksZUFBZSxLQUFLLENBQUMsQ0FBQyxFQUFFLENBQUM7Z0JBQzVCLGFBQWEsR0FBRyxLQUFLLENBQUMsY0FBYyxDQUFDLGVBQWUsQ0FBQyxDQUFDLE9BQU8sQ0FBQyxRQUFRLEVBQUUsZUFBZSxHQUFHLFVBQVUsQ0FBQyxNQUFNLENBQUMsQ0FBQztZQUM5RyxDQUFDO1FBQ0YsQ0FBQztRQUVELG1EQUFtRDtRQUNuRCxrRkFBa0Y7UUFDbEYsSUFBSSxlQUFlLEtBQUssQ0FBQyxDQUFDLElBQUksS0FBSyxDQUFDLGNBQWMsQ0FBQyxlQUFlLENBQUMsQ0FBQyxVQUFVLENBQUMsZUFBZSxHQUFHLFVBQVUsQ0FBQyxNQUFNLENBQUMsNEJBQW1CLEVBQUUsQ0FBQztZQUN4SSxVQUFVLElBQUksR0FBRyxDQUFDO1FBQ25CLENBQUM7UUFFRCxpRkFBaUY7UUFDakYsSUFBSSxhQUFhLEtBQUssQ0FBQyxDQUFDLElBQUksS0FBSyxDQUFDLGNBQWMsQ0FBQyxhQUFhLENBQUMsQ0FBQyxVQUFVLENBQUMsYUFBYSxHQUFHLENBQUMsQ0FBQyw0QkFBbUIsRUFBRSxDQUFDO1lBQ2xILFFBQVEsR0FBRyxHQUFHLEdBQUcsUUFBUSxDQUFDO1lBQzFCLGFBQWEsSUFBSSxDQUFDLENBQUM7UUFDcEIsQ0FBQztRQUVELElBQUksZUFBZSxLQUFLLENBQUMsQ0FBQyxJQUFJLGFBQWEsS0FBSyxDQUFDLENBQUMsRUFBRSxDQUFDO1lBQ3BELE9BQU8sbUJBQW1CLENBQUMsbUNBQW1DLENBQzdELElBQUksS0FBSyxDQUFDLGVBQWUsRUFBRSxlQUFlLEdBQUcsVUFBVSxDQUFDLE1BQU0sR0FBRyxDQUFDLEVBQUUsYUFBYSxFQUFFLGFBQWEsR0FBRyxDQUFDLENBQUMsRUFBRSxVQUFVLEVBQUUsUUFBUSxDQUMzSCxDQUFDO1FBQ0gsQ0FBQztRQUVELE9BQU8sSUFBSSxDQUFDO0lBQ2IsQ0FBQztJQUVEOztPQUVHO0lBQ0ssb0JBQW9CLENBQUMsS0FBaUIsRUFBRSxPQUE4QixFQUFFLENBQVk7UUFDM0YsS0FBSyxDQUFDLFlBQVksQ0FBQyxlQUFlLENBQUMsQ0FBQyxDQUFDLGVBQWUsQ0FBQyxDQUFDO1FBQ3RELE1BQU0sVUFBVSxHQUFHLEtBQUssQ0FBQyx1QkFBdUIsQ0FBQyxDQUFDLENBQUMsZUFBZSxFQUFFLENBQUMsQ0FBQyxDQUFDO1FBQ3ZFLE1BQU0sTUFBTSxHQUFHLElBQUksQ0FBQyw0QkFBNEIsQ0FBQyx3QkFBd0IsQ0FBQyxVQUFVLENBQUMsQ0FBQyxRQUFRLENBQUM7UUFDL0YsSUFBSSxDQUFDLE1BQU0sSUFBSSxDQUFDLE1BQU0sQ0FBQyxzQkFBc0IsSUFBSSxDQUFDLE1BQU0sQ0FBQyxvQkFBb0IsRUFBRSxDQUFDO1lBQy9FLHVDQUF1QztZQUN2QyxPQUFPO1FBQ1IsQ0FBQztRQUVELE1BQU0sVUFBVSxHQUFHLE1BQU0sQ0FBQyxzQkFBc0IsQ0FBQztRQUNqRCxNQUFNLFFBQVEsR0FBRyxNQUFNLENBQUMsb0JBQW9CLENBQUM7UUFFN0MsSUFBSSxHQUFHLEdBQUcsSUFBSSxDQUFDLDBCQUEwQixDQUFDLEtBQUssRUFBRSxDQUFDLEVBQUUsVUFBVSxFQUFFLFFBQVEsQ0FBQyxDQUFDO1FBQzFFLElBQUksQ0FBQyxHQUFHLEVBQUUsQ0FBQztZQUNWLElBQUksQ0FBQyxDQUFDLE9BQU8sRUFBRSxFQUFFLENBQUM7Z0JBQ2pCLE1BQU0sV0FBVyxHQUFHLEtBQUssQ0FBQyxjQUFjLENBQUMsQ0FBQyxDQUFDLGVBQWUsQ0FBQyxDQUFDO2dCQUM1RCxJQUFJLHVCQUF1QixHQUFHLE9BQU8sQ0FBQyx1QkFBdUIsQ0FBQyxXQUFXLENBQUMsQ0FBQztnQkFDM0UsSUFBSSx1QkFBdUIsS0FBSyxDQUFDLENBQUMsRUFBRSxDQUFDO29CQUNwQyw0Q0FBNEM7b0JBQzVDLHVCQUF1QixHQUFHLFdBQVcsQ0FBQyxNQUFNLENBQUM7Z0JBQzlDLENBQUM7Z0JBQ0QsR0FBRyxHQUFHLG1CQUFtQixDQUFDLGdDQUFnQyxDQUN6RCxJQUFJLEtBQUssQ0FBQyxDQUFDLENBQUMsZUFBZSxFQUFFLHVCQUF1QixHQUFHLENBQUMsRUFBRSxDQUFDLENBQUMsZUFBZSxFQUFFLFdBQVcsQ0FBQyxNQUFNLEdBQUcsQ0FBQyxDQUFDLEVBQ3BHLFVBQVUsRUFDVixRQUFRLEVBQ1IsSUFBSSxDQUFDLFlBQVksQ0FDakIsQ0FBQztZQUNILENBQUM7aUJBQU0sQ0FBQztnQkFDUCxHQUFHLEdBQUcsbUJBQW1CLENBQUMsZ0NBQWdDLENBQ3pELElBQUksS0FBSyxDQUFDLENBQUMsQ0FBQyxlQUFlLEVBQUUsS0FBSyxDQUFDLCtCQUErQixDQUFDLENBQUMsQ0FBQyxlQUFlLENBQUMsRUFBRSxDQUFDLENBQUMsYUFBYSxFQUFFLEtBQUssQ0FBQyxnQkFBZ0IsQ0FBQyxDQUFDLENBQUMsYUFBYSxDQUFDLENBQUMsRUFDaEosVUFBVSxFQUNWLFFBQVEsRUFDUixJQUFJLENBQUMsWUFBWSxDQUNqQixDQUFDO1lBQ0gsQ0FBQztZQUVELElBQUksR0FBRyxDQUFDLE1BQU0sS0FBSyxDQUFDLEVBQUUsQ0FBQztnQkFDdEIscUNBQXFDO2dCQUNyQyxJQUFJLENBQUMsWUFBWSxHQUFHLFVBQVUsQ0FBQyxNQUFNLEdBQUcsQ0FBQyxDQUFDO1lBQzNDLENBQUM7UUFDRixDQUFDO1FBQ0QsSUFBSSxDQUFDLFlBQVksR0FBRyxPQUFPLENBQUMsY0FBYyxDQUFDLENBQUMsQ0FBQyxDQUFDO1FBQzlDLEtBQUssTUFBTSxFQUFFLElBQUksR0FBRyxFQUFFLENBQUM7WUFDdEIsT0FBTyxDQUFDLGdCQUFnQixDQUFDLEVBQUUsQ0FBQyxLQUFLLEVBQUUsRUFBRSxDQUFDLElBQUksQ0FBQyxDQUFDO1FBQzdDLENBQUM7SUFDRixDQUFDO0lBRU0saUJBQWlCLENBQUMsS0FBaUIsRUFBRSxPQUE4QjtRQUV6RSxJQUFJLENBQUMsR0FBRyxJQUFJLENBQUMsVUFBVSxDQUFDO1FBQ3hCLElBQUksQ0FBQyxvQkFBb0IsR0FBRyxLQUFLLENBQUM7UUFFbEMsSUFBSSxDQUFDLENBQUMsZUFBZSxLQUFLLENBQUMsQ0FBQyxhQUFhLElBQUksSUFBSSxDQUFDLGdCQUFnQixFQUFFLENBQUM7WUFDcEUsT0FBTyxDQUFDLGdCQUFnQixDQUFDLElBQUksS0FBSyxDQUFDLENBQUMsQ0FBQyxlQUFlLEVBQUUsS0FBSyxDQUFDLGdCQUFnQixDQUFDLENBQUMsQ0FBQyxlQUFlLENBQUMsRUFBRSxDQUFDLENBQUMsZUFBZSxHQUFHLENBQUMsRUFBRSxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsZUFBZSxLQUFLLEtBQUssQ0FBQyxZQUFZLEVBQUUsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsQ0FBQztZQUNwTCxJQUFJLENBQUMsWUFBWSxHQUFHLE9BQU8sQ0FBQyxjQUFjLENBQUMsQ0FBQyxDQUFDLENBQUM7WUFDOUMsT0FBTztRQUNSLENBQUM7UUFFRCxJQUFJLENBQUMsQ0FBQyxlQUFlLEdBQUcsQ0FBQyxDQUFDLGFBQWEsSUFBSSxDQUFDLENBQUMsU0FBUyxLQUFLLENBQUMsRUFBRSxDQUFDO1lBQzlELElBQUksQ0FBQyxvQkFBb0IsR0FBRyxJQUFJLENBQUM7WUFDakMsQ0FBQyxHQUFHLENBQUMsQ0FBQyxjQUFjLENBQUMsQ0FBQyxDQUFDLGFBQWEsR0FBRyxDQUFDLEVBQUUsS0FBSyxDQUFDLGdCQUFnQixDQUFDLENBQUMsQ0FBQyxhQUFhLEdBQUcsQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUN4RixDQUFDO1FBRUQsTUFBTSxJQUFJLEdBQUcsa0JBQWtCLENBQUMsb0JBQW9CLENBQ25ELElBQUksQ0FBQyxLQUFLLEVBQ1YsSUFBSSxDQUFDLFlBQVksRUFDakIsS0FBSyxFQUNMLENBQUMsQ0FBQyxlQUFlLEVBQ2pCLENBQUMsQ0FBQyxhQUFhLEVBQ2YsSUFBSSxDQUFDLGlCQUFpQixFQUN0QixJQUFJLENBQUMsZ0JBQWdCLEVBQ3JCLElBQUksQ0FBQyw0QkFBNEIsQ0FDakMsQ0FBQztRQUVGLElBQUksSUFBSSxDQUFDLFNBQVMsRUFBRSxDQUFDO1lBQ3BCLE9BQU8sSUFBSSxDQUFDLG9CQUFvQixDQUFDLEtBQUssRUFBRSxPQUFPLEVBQUUsSUFBSSxFQUFFLENBQUMsQ0FBQyxDQUFDO1FBQzNELENBQUM7UUFFRCxPQUFPLElBQUksQ0FBQyxvQkFBb0IsQ0FBQyxLQUFLLEVBQUUsT0FBTyxFQUFFLENBQUMsQ0FBQyxDQUFDO0lBQ3JELENBQUM7SUFFTSxrQkFBa0IsQ0FBQyxLQUFpQixFQUFFLE1BQWdDO1FBQzVFLElBQUksTUFBTSxHQUFHLE1BQU0sQ0FBQyxtQkFBbUIsQ0FBQyxJQUFJLENBQUMsWUFBYSxDQUFDLENBQUM7UUFFNUQsSUFBSSxJQUFJLENBQUMsb0JBQW9CLEVBQUUsQ0FBQztZQUMvQixNQUFNLEdBQUcsTUFBTSxDQUFDLGNBQWMsQ0FBQyxNQUFNLENBQUMsYUFBYSxHQUFHLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQztRQUM3RCxDQUFDO1FBRUQsT0FBTyxJQUFJLFNBQVMsQ0FDbkIsTUFBTSxDQUFDLHdCQUF3QixFQUMvQixNQUFNLENBQUMsb0JBQW9CLEdBQUcsSUFBSSxDQUFDLFlBQVksRUFDL0MsTUFBTSxDQUFDLGtCQUFrQixFQUN6QixNQUFNLENBQUMsY0FBYyxHQUFHLElBQUksQ0FBQyxZQUFZLENBQ3pDLENBQUM7SUFDSCxDQUFDO0lBRUQ7O09BRUc7SUFDSSxNQUFNLENBQUMsbUNBQW1DLENBQUMsS0FBMkIsRUFBRSxlQUF1QjtRQUNyRyxNQUFNLEdBQUcsR0FBMkIsRUFBRSxDQUFDO1FBRXZDLEtBQUssSUFBSSxDQUFDLEdBQUcsQ0FBQyxFQUFFLEdBQUcsR0FBRyxLQUFLLENBQUMsTUFBTSxFQUFFLENBQUMsR0FBRyxHQUFHLEVBQUUsQ0FBQyxFQUFFLEVBQUUsQ0FBQztZQUNsRCxNQUFNLFFBQVEsR0FBRyxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUM7WUFFMUIsSUFBSSxRQUFRLENBQUMsTUFBTSxFQUFFLENBQUM7Z0JBQ3JCLFNBQVM7WUFDVixDQUFDO1lBRUQsR0FBRyxDQUFDLElBQUksQ0FBQyxhQUFhLENBQUMsTUFBTSxDQUFDLElBQUksS0FBSyxDQUN0QyxlQUFlLEdBQUcsQ0FBQyxFQUFFLFFBQVEsQ0FBQyxnQkFBZ0IsR0FBRyxDQUFDLEVBQ2xELGVBQWUsR0FBRyxDQUFDLEVBQUUsUUFBUSxDQUFDLGdCQUFnQixHQUFHLFFBQVEsQ0FBQyxnQkFBZ0IsR0FBRyxDQUFDLENBQzlFLENBQUMsQ0FBQyxDQUFDO1FBQ0wsQ0FBQztRQUVELE9BQU8sR0FBRyxDQUFDO0lBQ1osQ0FBQztJQUVEOztPQUVHO0lBQ0ssZ0NBQWdDLENBQUMsS0FBMkIsRUFBRSxlQUF1QjtRQUM1RixNQUFNLEdBQUcsR0FBMkIsRUFBRSxDQUFDO1FBQ3ZDLE1BQU0sZUFBZSxHQUFHLElBQUksQ0FBQyxZQUFZLENBQUMsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDO1FBR3JELEtBQUssSUFBSSxDQUFDLEdBQUcsQ0FBQyxFQUFFLEdBQUcsR0FBRyxLQUFLLENBQUMsTUFBTSxFQUFFLENBQUMsR0FBRyxHQUFHLEVBQUUsQ0FBQyxFQUFFLEVBQUUsQ0FBQztZQUNsRCxNQUFNLFFBQVEsR0FBRyxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUM7WUFFMUIsSUFBSSxRQUFRLENBQUMsTUFBTSxFQUFFLENBQUM7Z0JBQ3JCLFNBQVM7WUFDVixDQUFDO1lBRUQsR0FBRyxDQUFDLElBQUksQ0FBQyxhQUFhLENBQUMsTUFBTSxDQUFDLElBQUksUUFBUSxDQUFDLGVBQWUsR0FBRyxDQUFDLEVBQUUsUUFBUSxDQUFDLGdCQUFnQixHQUFHLENBQUMsQ0FBQyxFQUFFLFFBQVEsQ0FBQyxVQUFVLEdBQUcsZUFBZSxDQUFDLENBQUMsQ0FBQztRQUN6SSxDQUFDO1FBRUQsT0FBTyxHQUFHLENBQUM7SUFDWixDQUFDO0lBRU8sTUFBTSxDQUFDLGlCQUFpQixDQUFDLG9CQUE0QixFQUFFLFVBQWtCLEVBQUUsS0FBYyxFQUFFLFVBQWtCO1FBQ3BILElBQUksS0FBSyxFQUFFLENBQUM7WUFDWCxPQUFPLG9CQUFvQixHQUFHLENBQUMsVUFBVSxHQUFHLENBQUMsb0JBQW9CLEdBQUcsVUFBVSxDQUFDLENBQUMsQ0FBQztRQUNsRixDQUFDO1FBQ0QsT0FBTyxvQkFBb0IsR0FBRyxVQUFVLENBQUM7SUFDMUMsQ0FBQztJQUVEOztPQUVHO0lBQ0ksTUFBTSxDQUFDLHdCQUF3QixDQUFDLEtBQW1CLEVBQUUsS0FBd0IsRUFBRSxlQUF1QixFQUFFLFVBQWtCO1FBQ2hJLElBQUksZ0JBQWdCLG9EQUFtQyxDQUFDO1FBQ3hELElBQUksQ0FBUyxDQUFDO1FBQ2QsSUFBSSxJQUFZLENBQUM7UUFFakIsS0FBSyxJQUFJLENBQUMsR0FBRyxDQUFDLEVBQUUsR0FBRyxHQUFHLEtBQUssQ0FBQyxNQUFNLEVBQUUsQ0FBQyxHQUFHLEdBQUcsRUFBRSxDQUFDLEVBQUUsRUFBRSxDQUFDO1lBQ2xELElBQUksS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDLE1BQU0sRUFBRSxDQUFDO2dCQUNyQixTQUFTO1lBQ1YsQ0FBQztZQUVELE1BQU0sV0FBVyxHQUFHLEtBQUssQ0FBQyxjQUFjLENBQUMsZUFBZSxHQUFHLENBQUMsQ0FBQyxDQUFDO1lBRTlELElBQUksb0JBQW9CLEdBQUcsQ0FBQyxDQUFDO1lBQzdCLEtBQUssSUFBSSxDQUFDLEdBQUcsQ0FBQyxFQUFFLElBQUksR0FBRyxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUMsZ0JBQWdCLEVBQUUsb0JBQW9CLEdBQUcsZ0JBQWdCLElBQUksQ0FBQyxHQUFHLElBQUksRUFBRSxDQUFDLEVBQUUsRUFBRSxDQUFDO2dCQUM1RyxvQkFBb0IsR0FBRyxrQkFBa0IsQ0FBQyxpQkFBaUIsQ0FBQyxvQkFBb0IsRUFBRSxVQUFVLEVBQUUsV0FBVyxDQUFDLFVBQVUsQ0FBQyxDQUFDLENBQUMseUJBQWlCLEVBQUUsQ0FBQyxDQUFDLENBQUM7WUFDOUksQ0FBQztZQUVELElBQUksb0JBQW9CLEdBQUcsZ0JBQWdCLEVBQUUsQ0FBQztnQkFDN0MsZ0JBQWdCLEdBQUcsb0JBQW9CLENBQUM7WUFDekMsQ0FBQztRQUNGLENBQUM7UUFFRCxnQkFBZ0IsR0FBRyxJQUFJLENBQUMsS0FBSyxDQUFDLGdCQUFnQixHQUFHLFVBQVUsQ0FBQyxHQUFHLFVBQVUsQ0FBQztRQUUxRSxLQUFLLElBQUksQ0FBQyxHQUFHLENBQUMsRUFBRSxHQUFHLEdBQUcsS0FBSyxDQUFDLE1BQU0sRUFBRSxDQUFDLEdBQUcsR0FBRyxFQUFFLENBQUMsRUFBRSxFQUFFLENBQUM7WUFDbEQsSUFBSSxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUMsTUFBTSxFQUFFLENBQUM7Z0JBQ3JCLFNBQVM7WUFDVixDQUFDO1lBRUQsTUFBTSxXQUFXLEdBQUcsS0FBSyxDQUFDLGNBQWMsQ0FBQyxlQUFlLEdBQUcsQ0FBQyxDQUFDLENBQUM7WUFFOUQsSUFBSSxvQkFBb0IsR0FBRyxDQUFDLENBQUM7WUFDN0IsS0FBSyxDQUFDLEdBQUcsQ0FBQyxFQUFFLElBQUksR0FBRyxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUMsZ0JBQWdCLEVBQUUsb0JBQW9CLEdBQUcsZ0JBQWdCLElBQUksQ0FBQyxHQUFHLElBQUksRUFBRSxDQUFDLEVBQUUsRUFBRSxDQUFDO2dCQUN4RyxvQkFBb0IsR0FBRyxrQkFBa0IsQ0FBQyxpQkFBaUIsQ0FBQyxvQkFBb0IsRUFBRSxVQUFVLEVBQUUsV0FBVyxDQUFDLFVBQVUsQ0FBQyxDQUFDLENBQUMseUJBQWlCLEVBQUUsQ0FBQyxDQUFDLENBQUM7WUFDOUksQ0FBQztZQUVELElBQUksb0JBQW9CLEdBQUcsZ0JBQWdCLEVBQUUsQ0FBQztnQkFDN0MsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDLGdCQUFnQixHQUFHLENBQUMsR0FBRyxDQUFDLENBQUM7WUFDbkMsQ0FBQztpQkFBTSxDQUFDO2dCQUNQLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQyxnQkFBZ0IsR0FBRyxDQUFDLENBQUM7WUFDL0IsQ0FBQztRQUNGLENBQUM7SUFDRixDQUFDO0NBQ0QifQ==