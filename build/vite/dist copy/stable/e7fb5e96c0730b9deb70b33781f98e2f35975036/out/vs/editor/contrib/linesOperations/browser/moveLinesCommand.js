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
import * as strings from '../../../../base/common/strings.js';
import { ShiftCommand } from '../../../common/commands/shiftCommand.js';
import { Range } from '../../../common/core/range.js';
import { Selection } from '../../../common/core/selection.js';
import { IndentAction } from '../../../common/languages/languageConfiguration.js';
import { ILanguageConfigurationService } from '../../../common/languages/languageConfigurationRegistry.js';
import * as indentUtils from '../../indentation/common/indentUtils.js';
import { getGoodIndentForLine, getIndentMetadata } from '../../../common/languages/autoIndent.js';
import { getEnterAction } from '../../../common/languages/enterAction.js';
let MoveLinesCommand = class MoveLinesCommand {
    constructor(selection, isMovingDown, autoIndent, _languageConfigurationService) {
        this._languageConfigurationService = _languageConfigurationService;
        this._selection = selection;
        this._isMovingDown = isMovingDown;
        this._autoIndent = autoIndent;
        this._selectionId = null;
        this._moveEndLineSelectionShrink = false;
    }
    createVirtualModel(model, lineNumberMapper, contentOverride) {
        return {
            tokenization: {
                getLineTokens: (lineNumber) => model.tokenization.getLineTokens(lineNumberMapper(lineNumber)),
                getLanguageId: () => model.getLanguageId(),
                getLanguageIdAtPosition: (lineNumber, column) => model.getLanguageIdAtPosition(lineNumber, column)
            },
            getLineContent: (lineNumber) => {
                const customContent = contentOverride?.(lineNumber);
                if (customContent !== undefined) {
                    return customContent;
                }
                return model.getLineContent(lineNumberMapper(lineNumber));
            }
        };
    }
    getEditOperations(model, builder) {
        const modelLineCount = model.getLineCount();
        if (this._isMovingDown && this._selection.endLineNumber === modelLineCount) {
            this._selectionId = builder.trackSelection(this._selection);
            return;
        }
        if (!this._isMovingDown && this._selection.startLineNumber === 1) {
            this._selectionId = builder.trackSelection(this._selection);
            return;
        }
        this._moveEndPositionDown = false;
        let s = this._selection;
        if (s.startLineNumber < s.endLineNumber && s.endColumn === 1) {
            this._moveEndPositionDown = true;
            s = s.setEndPosition(s.endLineNumber - 1, model.getLineMaxColumn(s.endLineNumber - 1));
        }
        const { tabSize, indentSize, insertSpaces } = model.getOptions();
        const indentConverter = this.buildIndentConverter(tabSize, indentSize, insertSpaces);
        if (s.startLineNumber === s.endLineNumber && model.getLineMaxColumn(s.startLineNumber) === 1) {
            // Current line is empty
            const lineNumber = s.startLineNumber;
            const otherLineNumber = (this._isMovingDown ? lineNumber + 1 : lineNumber - 1);
            if (model.getLineMaxColumn(otherLineNumber) === 1) {
                // Other line number is empty too, so no editing is needed
                // Add a no-op to force running by the model
                builder.addEditOperation(new Range(1, 1, 1, 1), null);
            }
            else {
                // Type content from other line number on line number
                builder.addEditOperation(new Range(lineNumber, 1, lineNumber, 1), model.getLineContent(otherLineNumber));
                // Remove content from other line number
                builder.addEditOperation(new Range(otherLineNumber, 1, otherLineNumber, model.getLineMaxColumn(otherLineNumber)), null);
            }
            // Track selection at the other line number
            s = new Selection(otherLineNumber, 1, otherLineNumber, 1);
        }
        else {
            let movingLineNumber;
            let movingLineText;
            if (this._isMovingDown) {
                movingLineNumber = s.endLineNumber + 1;
                movingLineText = model.getLineContent(movingLineNumber);
                // Delete line that needs to be moved
                builder.addEditOperation(new Range(movingLineNumber - 1, model.getLineMaxColumn(movingLineNumber - 1), movingLineNumber, model.getLineMaxColumn(movingLineNumber)), null);
                let insertingText = movingLineText;
                if (this.shouldAutoIndent(model, s)) {
                    const movingLineMatchResult = this.matchEnterRule(model, indentConverter, tabSize, movingLineNumber, s.startLineNumber - 1);
                    // if s.startLineNumber - 1 matches onEnter rule, we still honor that.
                    if (movingLineMatchResult !== null) {
                        const oldIndentation = strings.getLeadingWhitespace(model.getLineContent(movingLineNumber));
                        const newSpaceCnt = movingLineMatchResult + indentUtils.getSpaceCnt(oldIndentation, tabSize);
                        const newIndentation = indentUtils.generateIndent(newSpaceCnt, tabSize, insertSpaces);
                        insertingText = newIndentation + this.trimStart(movingLineText);
                    }
                    else {
                        // no enter rule matches, let's check indentatin rules then.
                        const virtualModel = this.createVirtualModel(model, (lineNumber) => lineNumber === s.startLineNumber ? movingLineNumber : lineNumber);
                        const indentOfMovingLine = getGoodIndentForLine(this._autoIndent, virtualModel, model.getLanguageIdAtPosition(movingLineNumber, 1), s.startLineNumber, indentConverter, this._languageConfigurationService);
                        if (indentOfMovingLine !== null) {
                            const oldIndentation = strings.getLeadingWhitespace(model.getLineContent(movingLineNumber));
                            const newSpaceCnt = indentUtils.getSpaceCnt(indentOfMovingLine, tabSize);
                            const oldSpaceCnt = indentUtils.getSpaceCnt(oldIndentation, tabSize);
                            if (newSpaceCnt !== oldSpaceCnt) {
                                const newIndentation = indentUtils.generateIndent(newSpaceCnt, tabSize, insertSpaces);
                                insertingText = newIndentation + this.trimStart(movingLineText);
                            }
                        }
                    }
                    // add edit operations for moving line first to make sure it's executed after we make indentation change
                    // to s.startLineNumber
                    builder.addEditOperation(new Range(s.startLineNumber, 1, s.startLineNumber, 1), insertingText + '\n');
                    const ret = this.matchEnterRuleMovingDown(model, indentConverter, tabSize, s.startLineNumber, movingLineNumber, insertingText);
                    // check if the line being moved before matches onEnter rules, if so let's adjust the indentation by onEnter rules.
                    if (ret !== null) {
                        if (ret !== 0) {
                            this.getIndentEditsOfMovingBlock(model, builder, s, tabSize, insertSpaces, ret);
                        }
                    }
                    else {
                        // it doesn't match onEnter rules, let's check indentation rules then.
                        const virtualModel = this.createVirtualModel(model, (lineNumber) => {
                            if (lineNumber === s.startLineNumber) {
                                // TODO@aiday-mar: the tokens here don't correspond exactly to the corresponding content (after indentation adjustment), have to fix this.
                                return movingLineNumber;
                            }
                            else if (lineNumber >= s.startLineNumber + 1 && lineNumber <= s.endLineNumber + 1) {
                                return lineNumber - 1;
                            }
                            else {
                                return lineNumber;
                            }
                        }, (lineNumber) => lineNumber === s.startLineNumber ? insertingText : undefined);
                        const newIndentatOfMovingBlock = getGoodIndentForLine(this._autoIndent, virtualModel, model.getLanguageIdAtPosition(movingLineNumber, 1), s.startLineNumber + 1, indentConverter, this._languageConfigurationService);
                        if (newIndentatOfMovingBlock !== null) {
                            const oldIndentation = strings.getLeadingWhitespace(model.getLineContent(s.startLineNumber));
                            const newSpaceCnt = indentUtils.getSpaceCnt(newIndentatOfMovingBlock, tabSize);
                            const oldSpaceCnt = indentUtils.getSpaceCnt(oldIndentation, tabSize);
                            if (newSpaceCnt !== oldSpaceCnt) {
                                const spaceCntOffset = newSpaceCnt - oldSpaceCnt;
                                this.getIndentEditsOfMovingBlock(model, builder, s, tabSize, insertSpaces, spaceCntOffset);
                            }
                        }
                    }
                }
                else {
                    // Insert line that needs to be moved before
                    builder.addEditOperation(new Range(s.startLineNumber, 1, s.startLineNumber, 1), insertingText + '\n');
                }
            }
            else {
                movingLineNumber = s.startLineNumber - 1;
                movingLineText = model.getLineContent(movingLineNumber);
                // Delete line that needs to be moved
                builder.addEditOperation(new Range(movingLineNumber, 1, movingLineNumber + 1, 1), null);
                // Insert line that needs to be moved after
                builder.addEditOperation(new Range(s.endLineNumber, model.getLineMaxColumn(s.endLineNumber), s.endLineNumber, model.getLineMaxColumn(s.endLineNumber)), '\n' + movingLineText);
                if (this.shouldAutoIndent(model, s)) {
                    const virtualModel = this.createVirtualModel(model, (lineNumber) => lineNumber === movingLineNumber ? s.startLineNumber : lineNumber);
                    const ret = this.matchEnterRule(model, indentConverter, tabSize, s.startLineNumber, s.startLineNumber - 2);
                    // check if s.startLineNumber - 2 matches onEnter rules, if so adjust the moving block by onEnter rules.
                    if (ret !== null) {
                        if (ret !== 0) {
                            this.getIndentEditsOfMovingBlock(model, builder, s, tabSize, insertSpaces, ret);
                        }
                    }
                    else {
                        // it doesn't match any onEnter rule, let's check indentation rules then.
                        const indentOfFirstLine = getGoodIndentForLine(this._autoIndent, virtualModel, model.getLanguageIdAtPosition(s.startLineNumber, 1), movingLineNumber, indentConverter, this._languageConfigurationService);
                        if (indentOfFirstLine !== null) {
                            // adjust the indentation of the moving block
                            const oldIndent = strings.getLeadingWhitespace(model.getLineContent(s.startLineNumber));
                            const newSpaceCnt = indentUtils.getSpaceCnt(indentOfFirstLine, tabSize);
                            const oldSpaceCnt = indentUtils.getSpaceCnt(oldIndent, tabSize);
                            if (newSpaceCnt !== oldSpaceCnt) {
                                const spaceCntOffset = newSpaceCnt - oldSpaceCnt;
                                this.getIndentEditsOfMovingBlock(model, builder, s, tabSize, insertSpaces, spaceCntOffset);
                            }
                        }
                    }
                }
            }
        }
        this._selectionId = builder.trackSelection(s);
    }
    buildIndentConverter(tabSize, indentSize, insertSpaces) {
        return {
            shiftIndent: (indentation) => {
                return ShiftCommand.shiftIndent(indentation, indentation.length + 1, tabSize, indentSize, insertSpaces);
            },
            unshiftIndent: (indentation) => {
                return ShiftCommand.unshiftIndent(indentation, indentation.length + 1, tabSize, indentSize, insertSpaces);
            }
        };
    }
    parseEnterResult(model, indentConverter, tabSize, line, enter) {
        if (enter) {
            let enterPrefix = enter.indentation;
            if (enter.indentAction === IndentAction.None) {
                enterPrefix = enter.indentation + enter.appendText;
            }
            else if (enter.indentAction === IndentAction.Indent) {
                enterPrefix = enter.indentation + enter.appendText;
            }
            else if (enter.indentAction === IndentAction.IndentOutdent) {
                enterPrefix = enter.indentation;
            }
            else if (enter.indentAction === IndentAction.Outdent) {
                enterPrefix = indentConverter.unshiftIndent(enter.indentation) + enter.appendText;
            }
            const movingLineText = model.getLineContent(line);
            if (this.trimStart(movingLineText).indexOf(this.trimStart(enterPrefix)) >= 0) {
                const oldIndentation = strings.getLeadingWhitespace(model.getLineContent(line));
                let newIndentation = strings.getLeadingWhitespace(enterPrefix);
                const indentMetadataOfMovelingLine = getIndentMetadata(model, line, this._languageConfigurationService);
                if (indentMetadataOfMovelingLine !== null && indentMetadataOfMovelingLine & 2 /* IndentConsts.DECREASE_MASK */) {
                    newIndentation = indentConverter.unshiftIndent(newIndentation);
                }
                const newSpaceCnt = indentUtils.getSpaceCnt(newIndentation, tabSize);
                const oldSpaceCnt = indentUtils.getSpaceCnt(oldIndentation, tabSize);
                return newSpaceCnt - oldSpaceCnt;
            }
        }
        return null;
    }
    /**
     *
     * @param model
     * @param indentConverter
     * @param tabSize
     * @param line the line moving down
     * @param futureAboveLineNumber the line which will be at the `line` position
     * @param futureAboveLineText
     */
    matchEnterRuleMovingDown(model, indentConverter, tabSize, line, futureAboveLineNumber, futureAboveLineText) {
        if (strings.lastNonWhitespaceIndex(futureAboveLineText) >= 0) {
            // break
            const maxColumn = model.getLineMaxColumn(futureAboveLineNumber);
            const enter = getEnterAction(this._autoIndent, model, new Range(futureAboveLineNumber, maxColumn, futureAboveLineNumber, maxColumn), this._languageConfigurationService);
            return this.parseEnterResult(model, indentConverter, tabSize, line, enter);
        }
        else {
            // go upwards, starting from `line - 1`
            let validPrecedingLine = line - 1;
            while (validPrecedingLine >= 1) {
                const lineContent = model.getLineContent(validPrecedingLine);
                const nonWhitespaceIdx = strings.lastNonWhitespaceIndex(lineContent);
                if (nonWhitespaceIdx >= 0) {
                    break;
                }
                validPrecedingLine--;
            }
            if (validPrecedingLine < 1 || line > model.getLineCount()) {
                return null;
            }
            const maxColumn = model.getLineMaxColumn(validPrecedingLine);
            const enter = getEnterAction(this._autoIndent, model, new Range(validPrecedingLine, maxColumn, validPrecedingLine, maxColumn), this._languageConfigurationService);
            return this.parseEnterResult(model, indentConverter, tabSize, line, enter);
        }
    }
    matchEnterRule(model, indentConverter, tabSize, line, oneLineAbove, previousLineText) {
        let validPrecedingLine = oneLineAbove;
        while (validPrecedingLine >= 1) {
            // ship empty lines as empty lines just inherit indentation
            let lineContent;
            if (validPrecedingLine === oneLineAbove && previousLineText !== undefined) {
                lineContent = previousLineText;
            }
            else {
                lineContent = model.getLineContent(validPrecedingLine);
            }
            const nonWhitespaceIdx = strings.lastNonWhitespaceIndex(lineContent);
            if (nonWhitespaceIdx >= 0) {
                break;
            }
            validPrecedingLine--;
        }
        if (validPrecedingLine < 1 || line > model.getLineCount()) {
            return null;
        }
        const maxColumn = model.getLineMaxColumn(validPrecedingLine);
        const enter = getEnterAction(this._autoIndent, model, new Range(validPrecedingLine, maxColumn, validPrecedingLine, maxColumn), this._languageConfigurationService);
        return this.parseEnterResult(model, indentConverter, tabSize, line, enter);
    }
    trimStart(str) {
        return str.replace(/^\s+/, '');
    }
    shouldAutoIndent(model, selection) {
        if (this._autoIndent < 4 /* EditorAutoIndentStrategy.Full */) {
            return false;
        }
        // if it's not easy to tokenize, we stop auto indent.
        if (!model.tokenization.isCheapToTokenize(selection.startLineNumber)) {
            return false;
        }
        const languageAtSelectionStart = model.getLanguageIdAtPosition(selection.startLineNumber, 1);
        const languageAtSelectionEnd = model.getLanguageIdAtPosition(selection.endLineNumber, 1);
        if (languageAtSelectionStart !== languageAtSelectionEnd) {
            return false;
        }
        if (this._languageConfigurationService.getLanguageConfiguration(languageAtSelectionStart).indentRulesSupport === null) {
            return false;
        }
        return true;
    }
    getIndentEditsOfMovingBlock(model, builder, s, tabSize, insertSpaces, offset) {
        for (let i = s.startLineNumber; i <= s.endLineNumber; i++) {
            const lineContent = model.getLineContent(i);
            const originalIndent = strings.getLeadingWhitespace(lineContent);
            const originalSpacesCnt = indentUtils.getSpaceCnt(originalIndent, tabSize);
            const newSpacesCnt = originalSpacesCnt + offset;
            const newIndent = indentUtils.generateIndent(newSpacesCnt, tabSize, insertSpaces);
            if (newIndent !== originalIndent) {
                builder.addEditOperation(new Range(i, 1, i, originalIndent.length + 1), newIndent);
                if (i === s.endLineNumber && s.endColumn <= originalIndent.length + 1 && newIndent === '') {
                    // as users select part of the original indent white spaces
                    // when we adjust the indentation of endLine, we should adjust the cursor position as well.
                    this._moveEndLineSelectionShrink = true;
                }
            }
        }
    }
    computeCursorState(model, helper) {
        let result = helper.getTrackedSelection(this._selectionId);
        if (this._moveEndPositionDown) {
            result = result.setEndPosition(result.endLineNumber + 1, 1);
        }
        if (this._moveEndLineSelectionShrink && result.startLineNumber < result.endLineNumber) {
            result = result.setEndPosition(result.endLineNumber, 2);
        }
        return result;
    }
};
MoveLinesCommand = __decorate([
    __param(3, ILanguageConfigurationService)
], MoveLinesCommand);
export { MoveLinesCommand };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibW92ZUxpbmVzQ29tbWFuZC5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL2VkaXRvci9jb250cmliL2xpbmVzT3BlcmF0aW9ucy9icm93c2VyL21vdmVMaW5lc0NvbW1hbmQudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7QUFFaEcsT0FBTyxLQUFLLE9BQU8sTUFBTSxvQ0FBb0MsQ0FBQztBQUM5RCxPQUFPLEVBQUUsWUFBWSxFQUFFLE1BQU0sMENBQTBDLENBQUM7QUFFeEUsT0FBTyxFQUFFLEtBQUssRUFBRSxNQUFNLCtCQUErQixDQUFDO0FBQ3RELE9BQU8sRUFBRSxTQUFTLEVBQUUsTUFBTSxtQ0FBbUMsQ0FBQztBQUc5RCxPQUFPLEVBQXVCLFlBQVksRUFBRSxNQUFNLG9EQUFvRCxDQUFDO0FBQ3ZHLE9BQU8sRUFBRSw2QkFBNkIsRUFBRSxNQUFNLDREQUE0RCxDQUFDO0FBRTNHLE9BQU8sS0FBSyxXQUFXLE1BQU0seUNBQXlDLENBQUM7QUFDdkUsT0FBTyxFQUFFLG9CQUFvQixFQUFFLGlCQUFpQixFQUFtQyxNQUFNLHlDQUF5QyxDQUFDO0FBQ25JLE9BQU8sRUFBRSxjQUFjLEVBQUUsTUFBTSwwQ0FBMEMsQ0FBQztBQUVuRSxJQUFNLGdCQUFnQixHQUF0QixNQUFNLGdCQUFnQjtJQVU1QixZQUNDLFNBQW9CLEVBQ3BCLFlBQXFCLEVBQ3JCLFVBQW9DLEVBQ1ksNkJBQTREO1FBQTVELGtDQUE2QixHQUE3Qiw2QkFBNkIsQ0FBK0I7UUFFNUcsSUFBSSxDQUFDLFVBQVUsR0FBRyxTQUFTLENBQUM7UUFDNUIsSUFBSSxDQUFDLGFBQWEsR0FBRyxZQUFZLENBQUM7UUFDbEMsSUFBSSxDQUFDLFdBQVcsR0FBRyxVQUFVLENBQUM7UUFDOUIsSUFBSSxDQUFDLFlBQVksR0FBRyxJQUFJLENBQUM7UUFDekIsSUFBSSxDQUFDLDJCQUEy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