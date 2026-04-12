/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { Position } from './core/position.js';
import { Range } from './core/range.js';
import { Selection } from './core/selection.js';
import { createScopedLineTokens } from './languages/supports.js';
import { CursorColumns } from './core/cursorColumns.js';
import { normalizeIndentation } from './core/misc/indentation.js';
import { InputMode } from './inputMode.js';
/**
 * This is an operation type that will be recorded for undo/redo purposes.
 * The goal is to introduce an undo stop when the controller switches between different operation types.
 */
export var EditOperationType;
(function (EditOperationType) {
    EditOperationType[EditOperationType["Other"] = 0] = "Other";
    EditOperationType[EditOperationType["DeletingLeft"] = 2] = "DeletingLeft";
    EditOperationType[EditOperationType["DeletingRight"] = 3] = "DeletingRight";
    EditOperationType[EditOperationType["TypingOther"] = 4] = "TypingOther";
    EditOperationType[EditOperationType["TypingFirstSpace"] = 5] = "TypingFirstSpace";
    EditOperationType[EditOperationType["TypingConsecutiveSpace"] = 6] = "TypingConsecutiveSpace";
})(EditOperationType || (EditOperationType = {}));
const autoCloseAlways = () => true;
const autoCloseNever = () => false;
const autoCloseBeforeWhitespace = (chr) => (chr === ' ' || chr === '\t');
export class CursorConfiguration {
    static shouldRecreate(e) {
        return (e.hasChanged(165 /* EditorOption.layoutInfo */)
            || e.hasChanged(148 /* EditorOption.wordSeparators */)
            || e.hasChanged(45 /* EditorOption.emptySelectionClipboard */)
            || e.hasChanged(85 /* EditorOption.multiCursorMergeOverlapping */)
            || e.hasChanged(88 /* EditorOption.multiCursorPaste */)
            || e.hasChanged(89 /* EditorOption.multiCursorLimit */)
            || e.hasChanged(10 /* EditorOption.autoClosingBrackets */)
            || e.hasChanged(11 /* EditorOption.autoClosingComments */)
            || e.hasChanged(15 /* EditorOption.autoClosingQuotes */)
            || e.hasChanged(13 /* EditorOption.autoClosingDelete */)
            || e.hasChanged(14 /* EditorOption.autoClosingOvertype */)
            || e.hasChanged(20 /* EditorOption.autoSurround */)
            || e.hasChanged(145 /* EditorOption.useTabStops */)
            || e.hasChanged(141 /* EditorOption.trimWhitespaceOnDelete */)
            || e.hasChanged(59 /* EditorOption.fontInfo */)
            || e.hasChanged(104 /* EditorOption.readOnly */)
            || e.hasChanged(147 /* EditorOption.wordSegmenterLocales */)
            || e.hasChanged(93 /* EditorOption.overtypeOnPaste */));
    }
    constructor(languageId, modelOptions, configuration, languageConfigurationService) {
        this.languageConfigurationService = languageConfigurationService;
        this._cursorMoveConfigurationBrand = undefined;
        this._languageId = languageId;
        const options = configuration.options;
        const layoutInfo = options.get(165 /* EditorOption.layoutInfo */);
        const fontInfo = options.get(59 /* EditorOption.fontInfo */);
        this.readOnly = options.get(104 /* EditorOption.readOnly */);
        this.tabSize = modelOptions.tabSize;
        this.indentSize = modelOptions.indentSize;
        this.insertSpaces = modelOptions.insertSpaces;
        this.stickyTabStops = options.get(132 /* EditorOption.stickyTabStops */);
        this.lineHeight = fontInfo.lineHeight;
        this.typicalHalfwidthCharacterWidth = fontInfo.typicalHalfwidthCharacterWidth;
        this.pageSize = Math.max(1, Math.floor(layoutInfo.height / this.lineHeight) - 2);
        this.useTabStops = options.get(145 /* EditorOption.useTabStops */);
        this.trimWhitespaceOnDelete = options.get(141 /* EditorOption.trimWhitespaceOnDelete */);
        this.wordSeparators = options.get(148 /* EditorOption.wordSeparators */);
        this.emptySelectionClipboard = options.get(45 /* EditorOption.emptySelectionClipboard */);
        this.copyWithSyntaxHighlighting = options.get(31 /* EditorOption.copyWithSyntaxHighlighting */);
        this.multiCursorMergeOverlapping = options.get(85 /* EditorOption.multiCursorMergeOverlapping */);
        this.multiCursorPaste = options.get(88 /* EditorOption.multiCursorPaste */);
        this.multiCursorLimit = options.get(89 /* EditorOption.multiCursorLimit */);
        this.autoClosingBrackets = options.get(10 /* EditorOption.autoClosingBrackets */);
        this.autoClosingComments = options.get(11 /* EditorOption.autoClosingComments */);
        this.autoClosingQuotes = options.get(15 /* EditorOption.autoClosingQuotes */);
        this.autoClosingDelete = options.get(13 /* EditorOption.autoClosingDelete */);
        this.autoClosingOvertype = options.get(14 /* EditorOption.autoClosingOvertype */);
        this.autoSurround = options.get(20 /* EditorOption.autoSurround */);
        this.autoIndent = options.get(16 /* EditorOption.autoIndent */);
        this.wordSegmenterLocales = options.get(147 /* EditorOption.wordSegmenterLocales */);
        this.overtypeOnPaste = options.get(93 /* EditorOption.overtypeOnPaste */);
        this.surroundingPairs = {};
        this._electricChars = null;
        this.shouldAutoCloseBefore = {
            quote: this._getShouldAutoClose(languageId, this.autoClosingQuotes, true),
            comment: this._getShouldAutoClose(languageId, this.autoClosingComments, false),
            bracket: this._getShouldAutoClose(languageId, this.autoClosingBrackets, false),
        };
        this.autoClosingPairs = this.languageConfigurationService.getLanguageConfiguration(languageId).getAutoClosingPairs();
        const surroundingPairs = this.languageConfigurationService.getLanguageConfiguration(languageId).getSurroundingPairs();
        if (surroundingPairs) {
            for (const pair of surroundingPairs) {
                this.surroundingPairs[pair.open] = pair.close;
            }
        }
        const commentsConfiguration = this.languageConfigurationService.getLanguageConfiguration(languageId).comments;
        this.blockCommentStartToken = commentsConfiguration?.blockCommentStartToken ?? null;
    }
    get electricChars() {
        if (!this._electricChars) {
            this._electricChars = {};
            const electricChars = this.languageConfigurationService.getLanguageConfiguration(this._languageId).electricCharacter?.getElectricCharacters();
            if (electricChars) {
                for (const char of electricChars) {
                    this._electricChars[char] = true;
                }
            }
        }
        return this._electricChars;
    }
    get inputMode() {
        return InputMode.getInputMode();
    }
    /**
     * Should return opening bracket type to match indentation with
     */
    onElectricCharacter(character, context, column) {
        const scopedLineTokens = createScopedLineTokens(context, column - 1);
        const electricCharacterSupport = this.languageConfigurationService.getLanguageConfiguration(scopedLineTokens.languageId).electricCharacter;
        if (!electricCharacterSupport) {
            return null;
        }
        return electricCharacterSupport.onElectricCharacter(character, scopedLineTokens, column - scopedLineTokens.firstCharOffset);
    }
    normalizeIndentation(str) {
        return normalizeIndentation(str, this.indentSize, this.insertSpaces);
    }
    _getShouldAutoClose(languageId, autoCloseConfig, forQuotes) {
        switch (autoCloseConfig) {
            case 'beforeWhitespace':
                return autoCloseBeforeWhitespace;
            case 'languageDefined':
                return this._getLanguageDefinedShouldAutoClose(languageId, forQuotes);
            case 'always':
                return autoCloseAlways;
            case 'never':
                return autoCloseNever;
        }
    }
    _getLanguageDefinedShouldAutoClose(languageId, forQuotes) {
        const autoCloseBeforeSet = this.languageConfigurationService.getLanguageConfiguration(languageId).getAutoCloseBeforeSet(forQuotes);
        return c => autoCloseBeforeSet.indexOf(c) !== -1;
    }
    /**
     * Returns a visible column from a column.
     * @see {@link CursorColumns}
     */
    visibleColumnFromColumn(model, position) {
        return CursorColumns.visibleColumnFromColumn(model.getLineContent(position.lineNumber), position.column, this.tabSize);
    }
    /**
     * Returns a visible column from a column.
     * @see {@link CursorColumns}
     */
    columnFromVisibleColumn(model, lineNumber, visibleColumn) {
        const result = CursorColumns.columnFromVisibleColumn(model.getLineContent(lineNumber), visibleColumn, this.tabSize);
        const minColumn = model.getLineMinColumn(lineNumber);
        if (result < minColumn) {
            return minColumn;
        }
        const maxColumn = model.getLineMaxColumn(lineNumber);
        if (result > maxColumn) {
            return maxColumn;
        }
        return result;
    }
}
export class CursorState {
    static fromModelState(modelState) {
        return new PartialModelCursorState(modelState);
    }
    static fromViewState(viewState) {
        return new PartialViewCursorState(viewState);
    }
    static fromModelSelection(modelSelection) {
        const selection = Selection.liftSelection(modelSelection);
        const modelState = new SingleCursorState(Range.fromPositions(selection.getSelectionStart()), 0 /* SelectionStartKind.Simple */, 0, selection.getPosition(), 0);
        return CursorState.fromModelState(modelState);
    }
    static fromModelSelections(modelSelections) {
        const states = [];
        for (let i = 0, len = modelSelections.length; i < len; i++) {
            states[i] = this.fromModelSelection(modelSelections[i]);
        }
        return states;
    }
    constructor(modelState, viewState) {
        this._cursorStateBrand = undefined;
        this.modelState = modelState;
        this.viewState = viewState;
    }
    equals(other) {
        return (this.viewState.equals(other.viewState) && this.modelState.equals(other.modelState));
    }
}
export class PartialModelCursorState {
    constructor(modelState) {
        this.modelState = modelState;
        this.viewState = null;
    }
}
export class PartialViewCursorState {
    constructor(viewState) {
        this.modelState = null;
        this.viewState = viewState;
    }
}
export var SelectionStartKind;
(function (SelectionStartKind) {
    SelectionStartKind[SelectionStartKind["Simple"] = 0] = "Simple";
    SelectionStartKind[SelectionStartKind["Word"] = 1] = "Word";
    SelectionStartKind[SelectionStartKind["Line"] = 2] = "Line";
})(SelectionStartKind || (SelectionStartKind = {}));
/**
 * Represents the cursor state on either the model or on the view model.
 */
export class SingleCursorState {
    constructor(selectionStart, selectionStartKind, selectionStartLeftoverVisibleColumns, position, leftoverVisibleColumns) {
        this.selectionStart = selectionStart;
        this.selectionStartKind = selectionStartKind;
        this.selectionStartLeftoverVisibleColumns = selectionStartLeftoverVisibleColumns;
        this.position = position;
        this.leftoverVisibleColumns = leftoverVisibleColumns;
        this._singleCursorStateBrand = undefined;
        this.selection = SingleCursorState._computeSelection(this.selectionStart, this.position);
    }
    equals(other) {
        return (this.selectionStartLeftoverVisibleColumns === other.selectionStartLeftoverVisibleColumns
            && this.leftoverVisibleColumns === other.leftoverVisibleColumns
            && this.selectionStartKind === other.selectionStartKind
            && this.position.equals(other.position)
            && this.selectionStart.equalsRange(other.selectionStart));
    }
    hasSelection() {
        return (!this.selection.isEmpty() || !this.selectionStart.isEmpty());
    }
    move(inSelectionMode, lineNumber, column, leftoverVisibleColumns) {
        if (inSelectionMode) {
            // move just position
            return new SingleCursorState(this.selectionStart, this.selectionStartKind, this.selectionStartLeftoverVisibleColumns, new Position(lineNumber, column), leftoverVisibleColumns);
        }
        else {
            // move everything
            return new SingleCursorState(new Range(lineNumber, column, lineNumber, column), 0 /* SelectionStartKind.Simple */, leftoverVisibleColumns, new Position(lineNumber, column), leftoverVisibleColumns);
        }
    }
    static _computeSelection(selectionStart, position) {
        if (selectionStart.isEmpty() || !position.isBeforeOrEqual(selectionStart.getStartPosition())) {
            return Selection.fromPositions(selectionStart.getStartPosition(), position);
        }
        else {
            return Selection.fromPositions(selectionStart.getEndPosition(), position);
        }
    }
}
export class EditOperationResult {
    constructor(type, commands, opts) {
        this._editOperationResultBrand = undefined;
        this.type = type;
        this.commands = commands;
        this.shouldPushStackElementBefore = opts.shouldPushStackElementBefore;
        this.shouldPushStackElementAfter = opts.shouldPushStackElementAfter;
    }
}
export function isQuote(ch) {
    return (ch === '\'' || ch === '"' || ch === '`');
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY3Vyc29yQ29tbW9uLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvZWRpdG9yL2NvbW1vbi9jdXJzb3JDb21tb24udHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFJaEcsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLG9CQUFvQixDQUFDO0FBQzlDLE9BQU8sRUFBRSxLQUFLLEVBQUUsTUFBTSxpQkFBaUIsQ0FBQztBQUN4QyxPQUFPLEVBQWMsU0FBUyxFQUFFLE1BQU0scUJBQXFCLENBQUM7QUFNNUQsT0FBTyxFQUFFLHNCQUFzQixFQUFFLE1BQU0seUJBQXlCLENBQUM7QUFFakUsT0FBTyxFQUFFLGFBQWEsRUFBRSxNQUFNLHlCQUF5QixDQUFDO0FBQ3hELE9BQU8sRUFBRSxvQkFBb0IsRUFBRSxNQUFNLDRCQUE0QixDQUFDO0FBQ2xFLE9BQU8sRUFBRSxTQUFTLEVBQUUsTUFBTSxnQkFBZ0IsQ0FBQztBQVUzQzs7O0dBR0c7QUFDSCxNQUFNLENBQU4sSUFBa0IsaUJBT2pCO0FBUEQsV0FBa0IsaUJBQWlCO0lBQ2xDLDJEQUFTLENBQUE7SUFDVCx5RUFBZ0IsQ0FBQTtJQUNoQiwyRUFBaUIsQ0FBQTtJQUNqQix1RUFBZSxDQUFBO0lBQ2YsaUZBQW9CLENBQUE7SUFDcEIsNkZBQTBCLENBQUE7QUFDM0IsQ0FBQyxFQVBpQixpQkFBaUIsS0FBakIsaUJBQWlCLFFBT2xDO0FBTUQsTUFBTSxlQUFlLEdBQUcsR0FBRyxFQUFFLENBQUMsSUFBSSxDQUFDO0FBQ25DLE1BQU0sY0FBYyxHQUFHLEdBQUcsRUFBRSxDQUFDLEtBQUssQ0FBQztBQUNuQyxNQUFNLHlCQUF5QixHQUFHLENBQUMsR0FBVyxFQUFFLEVBQUUsQ0FBQyxDQUFDLEdBQUcsS0FBSyxHQUFHLElBQUksR0FBRyxLQUFLLElBQUksQ0FBQyxDQUFDO0FBRWpGLE1BQU0sT0FBTyxtQkFBbUI7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