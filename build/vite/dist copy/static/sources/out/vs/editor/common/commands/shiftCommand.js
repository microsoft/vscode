/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
var ShiftCommand_1;
import * as strings from '../../../base/common/strings.js';
import { CursorColumns } from '../core/cursorColumns.js';
import { Range } from '../core/range.js';
import { Selection } from '../core/selection.js';
import { getEnterAction } from '../languages/enterAction.js';
import { ILanguageConfigurationService } from '../languages/languageConfigurationRegistry.js';
const repeatCache = Object.create(null);
function cachedStringRepeat(str, count) {
    if (count <= 0) {
        return '';
    }
    if (!repeatCache[str]) {
        repeatCache[str] = ['', str];
    }
    const cache = repeatCache[str];
    for (let i = cache.length; i <= count; i++) {
        cache[i] = cache[i - 1] + str;
    }
    return cache[count];
}
let ShiftCommand = ShiftCommand_1 = class ShiftCommand {
    static unshiftIndent(line, column, tabSize, indentSize, insertSpaces) {
        // Determine the visible column where the content starts
        const contentStartVisibleColumn = CursorColumns.visibleColumnFromColumn(line, column, tabSize);
        if (insertSpaces) {
            const indent = cachedStringRepeat(' ', indentSize);
            const desiredTabStop = CursorColumns.prevIndentTabStop(contentStartVisibleColumn, indentSize);
            const indentCount = desiredTabStop / indentSize; // will be an integer
            return cachedStringRepeat(indent, indentCount);
        }
        else {
            const indent = '\t';
            const desiredTabStop = CursorColumns.prevRenderTabStop(contentStartVisibleColumn, tabSize);
            const indentCount = desiredTabStop / tabSize; // will be an integer
            return cachedStringRepeat(indent, indentCount);
        }
    }
    static shiftIndent(line, column, tabSize, indentSize, insertSpaces) {
        // Determine the visible column where the content starts
        const contentStartVisibleColumn = CursorColumns.visibleColumnFromColumn(line, column, tabSize);
        if (insertSpaces) {
            const indent = cachedStringRepeat(' ', indentSize);
            const desiredTabStop = CursorColumns.nextIndentTabStop(contentStartVisibleColumn, indentSize);
            const indentCount = desiredTabStop / indentSize; // will be an integer
            return cachedStringRepeat(indent, indentCount);
        }
        else {
            const indent = '\t';
            const desiredTabStop = CursorColumns.nextRenderTabStop(contentStartVisibleColumn, tabSize);
            const indentCount = desiredTabStop / tabSize; // will be an integer
            return cachedStringRepeat(indent, indentCount);
        }
    }
    constructor(range, opts, _languageConfigurationService) {
        this._languageConfigurationService = _languageConfigurationService;
        this._opts = opts;
        this._selection = range;
        this._selectionId = null;
        this._useLastEditRangeForCursorEndPosition = false;
        this._selectionStartColumnStaysPut = false;
    }
    _addEditOperation(builder, range, text) {
        if (this._useLastEditRangeForCursorEndPosition) {
            builder.addTrackedEditOperation(range, text);
        }
        else {
            builder.addEditOperation(range, text);
        }
    }
    getEditOperations(model, builder) {
        const startLine = this._selection.startLineNumber;
        let endLine = this._selection.endLineNumber;
        if (this._selection.endColumn === 1 && startLine !== endLine) {
            endLine = endLine - 1;
        }
        const { tabSize, indentSize, insertSpaces } = this._opts;
        const shouldIndentEmptyLines = (startLine === endLine);
        if (this._opts.useTabStops) {
            // if indenting or outdenting on a whitespace only line
            if (this._selection.isEmpty()) {
                if (/^\s*$/.test(model.getLineContent(startLine))) {
                    this._useLastEditRangeForCursorEndPosition = true;
                }
            }
            // keep track of previous line's "miss-alignment"
            let previousLineExtraSpaces = 0, extraSpaces = 0;
            for (let lineNumber = startLine; lineNumber <= endLine; lineNumber++, previousLineExtraSpaces = extraSpaces) {
                extraSpaces = 0;
                const lineText = model.getLineContent(lineNumber);
                let indentationEndIndex = strings.firstNonWhitespaceIndex(lineText);
                if (this._opts.isUnshift && (lineText.length === 0 || indentationEndIndex === 0)) {
                    // empty line or line with no leading whitespace => nothing to do
                    continue;
                }
                if (!shouldIndentEmptyLines && !this._opts.isUnshift && lineText.length === 0) {
                    // do not indent empty lines => nothing to do
                    continue;
                }
                if (indentationEndIndex === -1) {
                    // the entire line is whitespace
                    indentationEndIndex = lineText.length;
                }
                if (lineNumber > 1) {
                    const contentStartVisibleColumn = CursorColumns.visibleColumnFromColumn(lineText, indentationEndIndex + 1, tabSize);
                    if (contentStartVisibleColumn % indentSize !== 0) {
                        // The current line is "miss-aligned", so let's see if this is expected...
                        // This can only happen when it has trailing commas in the indent
                        if (model.tokenization.isCheapToTokenize(lineNumber - 1)) {
                            const enterAction = getEnterAction(this._opts.autoIndent, model, new Range(lineNumber - 1, model.getLineMaxColumn(lineNumber - 1), lineNumber - 1, model.getLineMaxColumn(lineNumber - 1)), this._languageConfigurationService);
                            if (enterAction) {
                                extraSpaces = previousLineExtraSpaces;
                                if (enterAction.appendText) {
                                    for (let j = 0, lenJ = enterAction.appendText.length; j < lenJ && extraSpaces < indentSize; j++) {
                                        if (enterAction.appendText.charCodeAt(j) === 32 /* CharCode.Space */) {
                                            extraSpaces++;
                                        }
                                        else {
                                            break;
                                        }
                                    }
                                }
                                if (enterAction.removeText) {
                                    extraSpaces = Math.max(0, extraSpaces - enterAction.removeText);
                                }
                                // Act as if `prefixSpaces` is not part of the indentation
                                for (let j = 0; j < extraSpaces; j++) {
                                    if (indentationEndIndex === 0 || lineText.charCodeAt(indentationEndIndex - 1) !== 32 /* CharCode.Space */) {
                                        break;
                                    }
                                    indentationEndIndex--;
                                }
                            }
                        }
                    }
                }
                if (this._opts.isUnshift && indentationEndIndex === 0) {
                    // line with no leading whitespace => nothing to do
                    continue;
                }
                let desiredIndent;
                if (this._opts.isUnshift) {
                    desiredIndent = ShiftCommand_1.unshiftIndent(lineText, indentationEndIndex + 1, tabSize, indentSize, insertSpaces);
                }
                else {
                    desiredIndent = ShiftCommand_1.shiftIndent(lineText, indentationEndIndex + 1, tabSize, indentSize, insertSpaces);
                }
                this._addEditOperation(builder, new Range(lineNumber, 1, lineNumber, indentationEndIndex + 1), desiredIndent);
                if (lineNumber === startLine && !this._selection.isEmpty()) {
                    // Force the startColumn to stay put because we're inserting after it
                    this._selectionStartColumnStaysPut = (this._selection.startColumn <= indentationEndIndex + 1);
                }
            }
        }
        else {
            // if indenting or outdenting on a whitespace only line
            if (!this._opts.isUnshift && this._selection.isEmpty() && model.getLineLength(startLine) === 0) {
                this._useLastEditRangeForCursorEndPosition = true;
            }
            const oneIndent = (insertSpaces ? cachedStringRepeat(' ', indentSize) : '\t');
            for (let lineNumber = startLine; lineNumber <= endLine; lineNumber++) {
                const lineText = model.getLineContent(lineNumber);
                let indentationEndIndex = strings.firstNonWhitespaceIndex(lineText);
                if (this._opts.isUnshift && (lineText.length === 0 || indentationEndIndex === 0)) {
                    // empty line or line with no leading whitespace => nothing to do
                    continue;
                }
                if (!shouldIndentEmptyLines && !this._opts.isUnshift && lineText.length === 0) {
                    // do not indent empty lines => nothing to do
                    continue;
                }
                if (indentationEndIndex === -1) {
                    // the entire line is whitespace
                    indentationEndIndex = lineText.length;
                }
                if (this._opts.isUnshift && indentationEndIndex === 0) {
                    // line with no leading whitespace => nothing to do
                    continue;
                }
                if (this._opts.isUnshift) {
                    indentationEndIndex = Math.min(indentationEndIndex, indentSize);
                    for (let i = 0; i < indentationEndIndex; i++) {
                        const chr = lineText.charCodeAt(i);
                        if (chr === 9 /* CharCode.Tab */) {
                            indentationEndIndex = i + 1;
                            break;
                        }
                    }
                    this._addEditOperation(builder, new Range(lineNumber, 1, lineNumber, indentationEndIndex + 1), '');
                }
                else {
                    this._addEditOperation(builder, new Range(lineNumber, 1, lineNumber, 1), oneIndent);
                    if (lineNumber === startLine && !this._selection.isEmpty()) {
                        // Force the startColumn to stay put because we're inserting after it
                        this._selectionStartColumnStaysPut = (this._selection.startColumn === 1);
                    }
                }
            }
        }
        this._selectionId = builder.trackSelection(this._selection);
    }
    computeCursorState(model, helper) {
        if (this._useLastEditRangeForCursorEndPosition) {
            const lastOp = helper.getInverseEditOperations()[0];
            return new Selection(lastOp.range.endLineNumber, lastOp.range.endColumn, lastOp.range.endLineNumber, lastOp.range.endColumn);
        }
        const result = helper.getTrackedSelection(this._selectionId);
        if (this._selectionStartColumnStaysPut) {
            // The selection start should not move
            const initialStartColumn = this._selection.startColumn;
            const resultStartColumn = result.startColumn;
            if (resultStartColumn <= initialStartColumn) {
                return result;
            }
            if (result.getDirection() === 0 /* SelectionDirection.LTR */) {
                return new Selection(result.startLineNumber, initialStartColumn, result.endLineNumber, result.endColumn);
            }
            return new Selection(result.endLineNumber, result.endColumn, result.startLineNumber, initialStartColumn);
        }
        return result;
    }
};
ShiftCommand = ShiftCommand_1 = __decorate([
    __param(2, ILanguageConfigurationService)
], ShiftCommand);
export { ShiftCommand };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2hpZnRDb21tYW5kLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvZWRpdG9yL2NvbW1vbi9jb21tYW5kcy9zaGlmdENvbW1hbmQudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7O0FBR2hHLE9BQU8sS0FBSyxPQUFPLE1BQU0saUNBQWlDLENBQUM7QUFDM0QsT0FBTyxFQUFFLGFBQWEsRUFBRSxNQUFNLDBCQUEwQixDQUFDO0FBQ3pELE9BQU8sRUFBRSxLQUFLLEVBQUUsTUFBTSxrQkFBa0IsQ0FBQztBQUN6QyxPQUFPLEVBQUUsU0FBUyxFQUFzQixNQUFNLHNCQUFzQixDQUFDO0FBSXJFLE9BQU8sRUFBRSxjQUFjLEVBQUUsTUFBTSw2QkFBNkIsQ0FBQztBQUM3RCxPQUFPLEVBQUUsNkJBQTZCLEVBQUUsTUFBTSwrQ0FBK0MsQ0FBQztBQVc5RixNQUFNLFdBQVcsR0FBZ0MsTUFBTSxDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMsQ0FBQztBQUNyRSxTQUFTLGtCQUFrQixDQUFDLEdBQVcsRUFBRSxLQUFhO0lBQ3JELElBQUksS0FBSyxJQUFJLENBQUMsRUFBRSxDQUFDO1FBQ2hCLE9BQU8sRUFBRSxDQUFDO0lBQ1gsQ0FBQztJQUNELElBQUksQ0FBQyxXQUFXLENBQUMsR0FBRyxDQUFDLEVBQUUsQ0FBQztRQUN2QixXQUFXLENBQUMsR0FBRyxDQUFDLEdBQUcsQ0FBQyxFQUFFLEVBQUUsR0FBRyxDQUFDLENBQUM7SUFDOUIsQ0FBQztJQUNELE1BQU0sS0FBSyxHQUFHLFdBQVcsQ0FBQyxHQUFHLENBQUMsQ0FBQztJQUMvQixLQUFLLElBQUksQ0FBQyxHQUFHLEtBQUssQ0FBQyxNQUFNLEVBQUUsQ0FBQyxJQUFJLEtBQUssRUFBRSxDQUFDLEVBQUUsRUFBRSxDQUFDO1FBQzVDLEtBQUssQ0FBQyxDQUFDLENBQUMsR0FBRyxLQUFLLENBQUMsQ0FBQyxHQUFHLENBQUMsQ0FBQyxHQUFHLEdBQUcsQ0FBQztJQUMvQixDQUFDO0lBQ0QsT0FBTyxLQUFLLENBQUMsS0FBSyxDQUFDLENBQUM7QUFDckIsQ0FBQztBQUVNLElBQU0sWUFBWSxvQkFBbEIsTUFBTSxZQUFZO0lBRWpCLE1BQU0sQ0FBQyxhQUFhLENBQUMsSUFBWSxFQUFFLE1BQWMsRUFBRSxPQUFlLEVBQUUsVUFBa0IsRUFBRSxZQUFxQjtRQUNuSCx3REFBd0Q7UUFDeEQsTUFBTSx5QkFBeUIsR0FBRyxhQUFhLENBQUMsdUJBQXVCLENBQUMsSUFBSSxFQUFFLE1BQU0sRUFBRSxPQUFPLENBQUMsQ0FBQztRQUUvRixJQUFJLFlBQVksRUFBRSxDQUFDO1lBQ2xCLE1BQU0sTUFBTSxHQUFHLGtCQUFrQixDQUFDLEdBQUcsRUFBRSxVQUFVLENBQUMsQ0FBQztZQUNuRCxNQUFNLGNBQWMsR0FBRyxhQUFhLENBQUMsaUJBQWlCLENBQUMseUJBQXlCLEVBQUUsVUFBVSxDQUFDLENBQUM7WUFDOUYsTUFBTSxXQUFXLEdBQUcsY0FBYyxHQUFHLFVBQVUsQ0FBQyxDQUFDLHFCQUFxQjtZQUN0RSxPQUFPLGtCQUFrQixDQUFDLE1BQU0sRUFBRSxXQUFXLENBQUMsQ0FBQztRQUNoRCxDQUFDO2FBQU0sQ0FBQztZQUNQLE1BQU0sTUFBTSxHQUFHLElBQUksQ0FBQztZQUNwQixNQUFNLGNBQWMsR0FBRyxhQUFhLENBQUMsaUJBQWlCLENBQUMseUJBQXlCLEVBQUUsT0FBTyxDQUFDLENBQUM7WUFDM0YsTUFBTSxXQUFXLEdBQUcsY0FBYyxHQUFHLE9BQU8sQ0FBQyxDQUFDLHFCQUFxQjtZQUNuRSxPQUFPLGtCQUFrQixDQUFDLE1BQU0sRUFBRSxXQUFXLENBQUMsQ0FBQztRQUNoRCxDQUFDO0lBQ0YsQ0FBQztJQUVNLE1BQU0sQ0FBQyxXQUFXLENBQUMsSUFBWSxFQUFFLE1BQWMsRUFBRSxPQUFlLEVBQUUsVUFBa0IsRUFBRSxZQUFxQjtRQUNqSCx3REFBd0Q7UUFDeEQsTUFBTSx5QkFBeUIsR0FBRyxhQUFhLENBQUMsdUJBQXVCLENBQUMsSUFBSSxFQUFFLE1BQU0sRUFBRSxPQUFPLENBQUMsQ0FBQztRQUUvRixJQUFJLFlBQVksRUFBRSxDQUFDO1lBQ2xCLE1BQU0sTUFBTSxHQUFHLGtCQUFrQixDQUFDLEdBQUcsRUFBRSxVQUFVLENBQUMsQ0FBQztZQUNuRCxNQUFNLGNBQWMsR0FBRyxhQUFhLENBQUMsaUJBQWlCLENBQUMseUJBQXlCLEVBQUUsVUFBVSxDQUFDLENBQUM7WUFDOUYsTUFBTSxXQUFXLEdBQUcsY0FBYyxHQUFHLFVBQVUsQ0FBQyxDQUFDLHFCQUFxQjtZQUN0RSxPQUFPLGtCQUFrQixDQUFDLE1BQU0sRUFBRSxXQUFXLENBQUMsQ0FBQztRQUNoRCxDQUFDO2FBQU0sQ0FBQztZQUNQLE1BQU0sTUFBTSxHQUFHLElBQUksQ0FBQztZQUNwQixNQUFNLGNBQWMsR0FBRyxhQUFhLENBQUMsaUJBQWlCLENBQUMseUJBQXlCLEVBQUUsT0FBTyxDQUFDLENBQUM7WUFDM0YsTUFBTSxXQUFXLEdBQUcsY0FBYyxHQUFHLE9BQU8sQ0FBQyxDQUFDLHFCQUFxQjtZQUNuRSxPQUFPLGtCQUFrQixDQUFDLE1BQU0sRUFBRSxXQUFXLENBQUMsQ0FBQztRQUNoRCxDQUFDO0lBQ0YsQ0FBQztJQVFELFlBQ0MsS0FBZ0IsRUFDaEIsSUFBdUIsRUFDeUIsNkJBQTREO1FBQTVELGtDQUE2QixHQUE3Qiw2QkFBNkIsQ0FBK0I7UUFFNUcsSUFBSSxDQUFDLEtBQUssR0FBRyxJQUFJLENBQUM7UUFDbEIsSUFBSSxDQUFDLFVBQVUsR0FBRyxLQUFLLENBQUM7UUFDeEIsSUFBSSxDQUFDLFlBQVksR0FBRyxJQUFJLENBQUM7UUFDekIsSUFBSSxDQUFDLHFDQUFxQyxHQUFHLEtBQUssQ0FBQztRQUNuRCxJQUFJLENBQUMsNkJBQTZCLEdBQUcsS0FBSyxDQUFDO0lBQzVDLENBQUM7SUFFTyxpQkFBaUIsQ0FBQyxPQUE4QixFQUFFLEtBQVksRUFBRSxJQUFZO1FBQ25GLElBQUksSUFBSSxDQUFDLHFDQUFxQyxFQUFFLENBQUM7WUFDaEQsT0FBTyxDQUFDLHVCQUF1QixDQUFDLEtBQUssRUFBRSxJQUFJLENBQUMsQ0FBQztRQUM5QyxDQUFDO2FBQU0sQ0FBQztZQUNQLE9BQU8sQ0FBQyxnQkFBZ0IsQ0FBQyxLQUFLLEVBQUUsSUFBSSxDQUFDLENBQUM7UUFDdkMsQ0FBQztJQUNGLENBQUM7SUFFTSxpQkFBaUIsQ0FBQyxLQUFpQixFQUFFLE9BQThCO1FBQ3pFLE1BQU0sU0FBUyxHQUFHLElBQUksQ0FBQyxVQUFVLENBQUMsZUFBZSxDQUFDO1FBRWxELElBQUksT0FBTyxHQUFHLElBQUksQ0FBQyxVQUFVLENBQUMsYUFBYSxDQUFDO1FBQzVDLElBQUksSUFBSSxDQUFDLFVBQVUsQ0FBQyxTQUFTLEtBQUssQ0FBQyxJQUFJLFNBQVMsS0FBSyxPQUFPLEVBQUUsQ0FBQztZQUM5RCxPQUFPLEdBQUcsT0FBTyxHQUFHLENBQUMsQ0FBQztRQUN2QixDQUFDO1FBRUQsTUFBTSxFQUFFLE9BQU8sRUFBRSxVQUFVLEVBQUUsWUFBWSxFQUFFLEdBQUcsSUFBSSxDQUFDLEtBQUssQ0FBQztRQUN6RCxNQUFNLHNCQUFzQixHQUFHLENBQUMsU0FBUyxLQUFLLE9BQU8sQ0FBQyxDQUFDO1FBRXZELElBQUksSUFBSSxDQUFDLEtBQUssQ0FBQyxXQUFXLEVBQUUsQ0FBQztZQUM1Qix1REFBdUQ7WUFDdkQsSUFBSSxJQUFJLENBQUMsVUFBVSxDQUFDLE9BQU8sRUFBRSxFQUFFLENBQUM7Z0JBQy9CLElBQUksT0FBTyxDQUFDLElBQUksQ0FBQyxLQUFLLENBQUMsY0FBYyxDQUFDLFNBQVMsQ0FBQyxDQUFDLEVBQUUsQ0FBQztvQkFDbkQsSUFBSSxDQUFDLHFDQUFxQyxHQUFHLElBQUksQ0FBQztnQkFDbkQsQ0FBQztZQUNGLENBQUM7WUFFRCxpREFBaUQ7WUFDakQsSUFBSSx1QkFBdUIsR0FBRyxDQUFDLEVBQUUsV0FBVyxHQUFHLENBQUMsQ0FBQztZQUNqRCxLQUFLLElBQUksVUFBVSxHQUFHLFNBQVMsRUFBRSxVQUFVLElBQUksT0FBTyxFQUFFLFVBQVUsRUFBRSxFQUFFLHVCQUF1QixHQUFHLFdBQVcsRUFBRSxDQUFDO2dCQUM3RyxXQUFXLEdBQUcsQ0FBQyxDQUFDO2dCQUNoQixNQUFNLFFBQVEsR0FBRyxLQUFLLENBQUMsY0FBYyxDQUFDLFVBQVUsQ0FBQyxDQUFDO2dCQUNsRCxJQUFJLG1CQUFtQixHQUFHLE9BQU8sQ0FBQyx1QkFBdUIsQ0FBQyxRQUFRLENBQUMsQ0FBQztnQkFFcEUsSUFBSSxJQUFJLENBQUMsS0FBSyxDQUFDLFNBQVMsSUFBSSxDQUFDLFFBQVEsQ0FBQyxNQUFNLEtBQUssQ0FBQyxJQUFJLG1CQUFtQixLQUFLLENBQUMsQ0FBQyxFQUFFLENBQUM7b0JBQ2xGLGlFQUFpRTtvQkFDakUsU0FBUztnQkFDVixDQUFDO2dCQUVELElBQUksQ0FBQyxzQkFBc0IsSUFBSSxDQUFDLElBQUksQ0FBQyxLQUFLLENBQUMsU0FBUyxJQUFJLFFBQVEsQ0FBQyxNQUFNLEtBQUssQ0FBQyxFQUFFLENBQUM7b0JBQy9FLDZDQUE2QztvQkFDN0MsU0FBUztnQkFDVixDQUFDO2dCQUVELElBQUksbUJBQW1CLEtBQUssQ0FBQyxDQUFDLEVBQUUsQ0FBQztvQkFDaEMsZ0NBQWdDO29CQUNoQyxtQkFBbUIsR0FBRyxRQUFRLENBQUMsTUFBTSxDQUFDO2dCQUN2QyxDQUFDO2dCQUVELElBQUksVUFBVSxHQUFHLENBQUMsRUFBRSxDQUFDO29CQUNwQixNQUFNLHlCQUF5QixHQUFHLGFBQWEsQ0FBQyx1QkFBdUIsQ0FBQyxRQUFRLEVBQUUsbUJBQW1CLEdBQUcsQ0FBQyxFQUFFLE9BQU8sQ0FBQyxDQUFDO29CQUNwSCxJQUFJLHlCQUF5QixHQUFHLFVBQVUsS0FBSyxDQUFDLEVBQUUsQ0FBQzt3QkFDbEQsMEVBQTBFO3dCQUMxRSxpRUFBaUU7d0JBQ2pFLElBQUksS0FBSyxDQUFDLFlBQVksQ0FBQyxpQkFBaUIsQ0FBQyxVQUFVLEdBQUcsQ0FBQyxDQUFDLEVBQUUsQ0FBQzs0QkFDMUQsTUFBTSxXQUFXLEdBQUcsY0FBYyxDQUFDLElBQUksQ0FBQyxLQUFLLENBQUMsVUFBVSxFQUFFLEtBQUssRUFBRSxJQUFJLEtBQUssQ0FBQyxVQUFVLEdBQUcsQ0FBQyxFQUFFLEtBQUssQ0FBQyxnQkFBZ0IsQ0FBQyxVQUFVLEdBQUcsQ0FBQyxDQUFDLEVBQUUsVUFBVSxHQUFHLENBQUMsRUFBRSxLQUFLLENBQUMsZ0JBQWdCLENBQUMsVUFBVSxHQUFHLENBQUMsQ0FBQyxDQUFDLEVBQUUsSUFBSSxDQUFDLDZCQUE2QixDQUFDLENBQUM7NEJBQ2hPLElBQUksV0FBVyxFQUFFLENBQUM7Z0NBQ2pCLFdBQVcsR0FBRyx1QkFBdUIsQ0FBQztnQ0FDdEMsSUFBSSxXQUFXLENBQUMsVUFBVSxFQUFFLENBQUM7b0NBQzVCLEtBQUssSUFBSSxDQUFDLEdBQUcsQ0FBQyxFQUFFLElBQUksR0FBRyxXQUFXLENBQUMsVUFBVSxDQUFDLE1BQU0sRUFBRSxDQUFDLEdBQUcsSUFBSSxJQUFJLFdBQVcsR0FBRyxVQUFVLEVBQUUsQ0FBQyxFQUFFLEVBQUUsQ0FBQzt3Q0FDakcsSUFBSSxXQUFXLENBQUMsVUFBVSxDQUFDLFVBQVUsQ0FBQyxDQUFDLENBQUMsNEJBQW1CLEVBQUUsQ0FBQzs0Q0FDN0QsV0FBVyxFQUFFLENBQUM7d0NBQ2YsQ0FBQzs2Q0FBTSxDQUFDOzRDQUNQLE1BQU07d0NBQ1AsQ0FBQztvQ0FDRixDQUFDO2dDQUNGLENBQUM7Z0NBQ0QsSUFBSSxXQUFXLENBQUMsVUFBVSxFQUFFLENBQUM7b0NBQzVCLFdBQVcsR0FBRyxJQUFJLENBQUMsR0FBRyxDQUFDLENBQUMsRUFBRSxXQUFXLEdBQUcsV0FBVyxDQUFDLFVBQVUsQ0FBQyxDQUFDO2dDQUNqRSxDQUFDO2dDQUVELDBEQUEwRDtnQ0FDMUQsS0FBSyxJQUFJLENBQUMsR0FBRyxDQUFDLEVBQUUsQ0FBQyxHQUFHLFdBQVcsRUFBRSxDQUFDLEVBQUUsRUFBRSxDQUFDO29DQUN0QyxJQUFJLG1CQUFtQixLQUFLLENBQUMsSUFBSSxRQUFRLENBQUMsVUFBVSxDQUFDLG1CQUFtQixHQUFHLENBQUMsQ0FBQyw0QkFBbUIsRUFBRSxDQUFDO3dDQUNsRyxNQUFNO29DQUNQLENBQUM7b0NBQ0QsbUJBQW1CLEVBQUUsQ0FBQztnQ0FDdkIsQ0FBQzs0QkFDRixDQUFDO3dCQUNGLENBQUM7b0JBQ0YsQ0FBQztnQkFDRixDQUFDO2dCQUdELElBQUksSUFBSSxDQUFDLEtBQUssQ0FBQyxTQUFTLElBQUksbUJBQW1CLEtBQUssQ0FBQyxFQUFFLENBQUM7b0JBQ3ZELG1EQUFtRDtvQkFDbkQsU0FBUztnQkFDVixDQUFDO2dCQUVELElBQUksYUFBcUIsQ0FBQztnQkFDMUIsSUFBSSxJQUFJLENBQUMsS0FBSyxDQUFDLFNBQVMsRUFBRSxDQUFDO29CQUMxQixhQUFhLEdBQUcsY0FBWSxDQUFDLGFBQWEsQ0FBQyxRQUFRLEVBQUUsbUJBQW1CLEdBQUcsQ0FBQyxFQUFFLE9BQU8sRUFBRSxVQUFVLEVBQUUsWUFBWSxDQUFDLENBQUM7Z0JBQ2xILENBQUM7cUJBQU0sQ0FBQztvQkFDUCxhQUFhLEdBQUcsY0FBWSxDQUFDLFdBQVcsQ0FBQyxRQUFRLEVBQUUsbUJBQW1CLEdBQUcsQ0FBQyxFQUFFLE9BQU8sRUFBRSxVQUFVLEVBQUUsWUFBWSxDQUFDLENBQUM7Z0JBQ2hILENBQUM7Z0JBRUQsSUFBSSxDQUFDLGlCQUFpQixDQUFDLE9BQU8sRUFBRSxJQUFJLEtBQUssQ0FBQyxVQUFVLEVBQUUsQ0FBQyxFQUFFLFVBQVUsRUFBRSxtQkFBbUIsR0FBRyxDQUFDLENBQUMsRUFBRSxhQUFhLENBQUMsQ0FBQztnQkFDOUcsSUFBSSxVQUFVLEtBQUssU0FBUyxJQUFJLENBQUMsSUFBSSxDQUFDLFVBQVUsQ0FBQyxPQUFPLEVBQUUsRUFBRSxDQUFDO29CQUM1RCxxRUFBcUU7b0JBQ3JFLElBQUksQ0FBQyw2QkFBNkIsR0FBRyxDQUFDLElBQUksQ0FBQyxVQUFVLENBQUMsV0FBVyxJQUFJLG1CQUFtQixHQUFHLENBQUMsQ0FBQyxDQUFDO2dCQUMvRixDQUFDO1lBQ0YsQ0FBQztRQUNGLENBQUM7YUFBTSxDQUFDO1lBRVAsdURBQXVEO1lBQ3ZELElBQUksQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDLFNBQVMsSUFBSSxJQUFJLENBQUMsVUFBVSxDQUFDLE9BQU8sRUFBRSxJQUFJLEtBQUssQ0FBQyxhQUFhLENBQUMsU0FBUyxDQUFDLEtBQUssQ0FBQyxFQUFFLENBQUM7Z0JBQ2hHLElBQUksQ0FBQyxxQ0FBcUMsR0FBRyxJQUFJLENBQUM7WUFDbkQsQ0FBQztZQUVELE1BQU0sU0FBUyxHQUFHLENBQUMsWUFBWSxDQUFDLENBQUMsQ0FBQyxrQkFBa0IsQ0FBQyxHQUFHLEVBQUUsVUFBVSxDQUFDLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxDQUFDO1lBRTlFLEtBQUssSUFBSSxVQUFVLEdBQUcsU0FBUyxFQUFFLFVBQVUsSUFBSSxPQUFPLEVBQUUsVUFBVSxFQUFFLEVBQUUsQ0FBQztnQkFDdEUsTUFBTSxRQUFRLEdBQUcsS0FBSyxDQUFDLGNBQWMsQ0FBQyxVQUFVLENBQUMsQ0FBQztnQkFDbEQsSUFBSSxtQkFBbUIsR0FBRyxPQUFPLENBQUMsdUJBQXVCLENBQUMsUUFBUSxDQUFDLENBQUM7Z0JBRXBFLElBQUksSUFBSSxDQUFDLEtBQUssQ0FBQyxTQUFTLElBQUksQ0FBQyxRQUFRLENBQUMsTUFBTSxLQUFLLENBQUMsSUFBSSxtQkFBbUIsS0FBSyxDQUFDLENBQUMsRUFBRSxDQUFDO29CQUNsRixpRUFBaUU7b0JBQ2pFLFNBQVM7Z0JBQ1YsQ0FBQztnQkFFRCxJQUFJLENBQUMsc0JBQXNCLElBQUksQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDLFNBQVMsSUFBSSxRQUFRLENBQUMsTUFBTSxLQUFLLENBQUMsRUFBRSxDQUFDO29CQUMvRSw2Q0FBNkM7b0JBQzdDLFNBQVM7Z0JBQ1YsQ0FBQztnQkFFRCxJQUFJLG1CQUFtQixLQUFLLENBQUMsQ0FBQyxFQUFFLENBQUM7b0JBQ2hDLGdDQUFnQztvQkFDaEMsbUJBQW1CLEdBQUcsUUFBUSxDQUFDLE1BQU0sQ0FBQztnQkFDdkMsQ0FBQztnQkFFRCxJQUFJLElBQUksQ0FBQyxLQUFLLENBQUMsU0FBUyxJQUFJLG1CQUFtQixLQUFLLENBQUMsRUFBRSxDQUFDO29CQUN2RCxtREFBbUQ7b0JBQ25ELFNBQVM7Z0JBQ1YsQ0FBQztnQkFFRCxJQUFJLElBQUksQ0FBQyxLQUFLLENBQUMsU0FBUyxFQUFFLENBQUM7b0JBRTFCLG1CQUFtQixHQUFHLElBQUksQ0FBQyxHQUFHLENBQUMsbUJBQW1CLEVBQUUsVUFBVSxDQUFDLENBQUM7b0JBQ2hFLEtBQUssSUFBSSxDQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUMsR0FBRyxtQkFBbUIsRUFBRSxDQUFDLEVBQUUsRUFBRSxDQUFDO3dCQUM5QyxNQUFNLEdBQUcsR0FBRyxRQUFRLENBQUMsVUFBVSxDQUFDLENBQUMsQ0FBQyxDQUFDO3dCQUNuQyxJQUFJLEdBQUcseUJBQWlCLEVBQUUsQ0FBQzs0QkFDMUIsbUJBQW1CLEdBQUcsQ0FBQyxHQUFHLENBQUMsQ0FBQzs0QkFDNUIsTUFBTTt3QkFDUCxDQUFDO29CQUNGLENBQUM7b0JBRUQsSUFBSSxDQUFDLGlCQUFpQixDQUFDLE9BQU8sRUFBRSxJQUFJLEtBQUssQ0FBQyxVQUFVLEVBQUUsQ0FBQyxFQUFFLFVBQVUsRUFBRSxtQkFBbUIsR0FBRyxDQUFDLENBQUMsRUFBRSxFQUFFLENBQUMsQ0FBQztnQkFDcEcsQ0FBQztxQkFBTSxDQUFDO29CQUNQLElBQUksQ0FBQyxpQkFBaUIsQ0FBQyxPQUFPLEVBQUUsSUFBSSxLQUFLLENBQUMsVUFBVSxFQUFFLENBQUMsRUFBRSxVQUFVLEVBQUUsQ0FBQyxDQUFDLEVBQUUsU0FBUyxDQUFDLENBQUM7b0JBQ3BGLElBQUksVUFBVSxLQUFLLFNBQVMsSUFBSSxDQUFDLElBQUksQ0FBQyxVQUFVLENBQUMsT0FBTyxFQUFFLEVBQUUsQ0FBQzt3QkFDNUQscUVBQXFFO3dCQUNyRSxJQUFJLENBQUMsNkJBQTZCLEdBQUcsQ0FBQyxJQUFJLENBQUMsVUFBVSxDQUFDLFdBQVcsS0FBSyxDQUFDLENBQUMsQ0FBQztvQkFDMUUsQ0FBQztnQkFDRixDQUFDO1lBQ0YsQ0FBQztRQUNGLENBQUM7UUFFRCxJQUFJLENBQUMsWUFBWSxHQUFHLE9BQU8sQ0FBQyxjQUFjLENBQUMsSUFBSSxDQUFDLFVBQVUsQ0FBQyxDQUFDO0lBQzdELENBQUM7SUFFTSxrQkFBa0IsQ0FBQyxLQUFpQixFQUFFLE1BQWdDO1FBQzVFLElBQUksSUFBSSxDQUFDLHFDQUFxQyxFQUFFLENBQUM7WUFDaEQsTUFBTSxNQUFNLEdBQUcsTUFBTSxDQUFDLHdCQUF3QixFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUM7WUFDcEQsT0FBTyxJQUFJLFNBQVMsQ0FBQyxNQUFNLENBQUMsS0FBSyxDQUFDLGFBQWEsRUFBRSxNQUFNLENBQUMsS0FBSyxDQUFDLFNBQVMsRUFBRSxNQUFNLENBQUMsS0FBSyxDQUFDLGFBQWEsRUFBRSxNQUFNLENBQUMsS0FBSyxDQUFDLFNBQVMsQ0FBQyxDQUFDO1FBQzlILENBQUM7UUFDRCxNQUFNLE1BQU0sR0FBRyxNQUFNLENBQUMsbUJBQW1CLENBQUMsSUFBSSxDQUFDLFlBQWEsQ0FBQyxDQUFDO1FBRTlELElBQUksSUFBSSxDQUFDLDZCQUE2QixFQUFFLENBQUM7WUFDeEMsc0NBQXNDO1lBQ3RDLE1BQU0sa0JBQWtCLEdBQUcsSUFBSSxDQUFDLFVBQVUsQ0FBQyxXQUFXLENBQUM7WUFDdkQsTUFBTSxpQkFBaUIsR0FBRyxNQUFNLENBQUMsV0FBVyxDQUFDO1lBQzdDLElBQUksaUJBQWlCLElBQUksa0JBQWtCLEVBQUUsQ0FBQztnQkFDN0MsT0FBTyxNQUFNLENBQUM7WUFDZixDQUFDO1lBRUQsSUFBSSxNQUFNLENBQUMsWUFBWSxFQUFFLG1DQUEyQixFQUFFLENBQUM7Z0JBQ3RELE9BQU8sSUFBSSxTQUFTLENBQUMsTUFBTSxDQUFDLGVBQWUsRUFBRSxrQkFBa0IsRUFBRSxNQUFNLENBQUMsYUFBYSxFQUFFLE1BQU0sQ0FBQyxTQUFTLENBQUMsQ0FBQztZQUMxRyxDQUFDO1lBQ0QsT0FBTyxJQUFJLFNBQVMsQ0FBQyxNQUFNLENBQUMsYUFBYSxFQUFFLE1BQU0sQ0FBQyxTQUFTLEVBQUUsTUFBTSxDQUFDLGVBQWUsRUFBRSxrQkFBa0IsQ0FBQyxDQUFDO1FBQzFHLENBQUM7UUFFRCxPQUFPLE1BQU0sQ0FBQztJQUNmLENBQUM7Q0FDRCxDQUFBO0FBN09ZLFlBQVk7SUE2Q3RCLFdBQUEsNkJBQTZCLENBQUE7R0E3Q25CLFlBQVksQ0E2T3hCIn0=