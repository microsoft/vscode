/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { CoreNavigationCommands } from '../coreCommands.js';
import { Position } from '../../common/core/position.js';
import { Selection } from '../../common/core/selection.js';
import * as platform from '../../../base/common/platform.js';
import { containsRTL } from '../../../base/common/strings.js';
export class ViewController {
    constructor(configuration, viewModel, userInputEvents, commandDelegate) {
        this.configuration = configuration;
        this.viewModel = viewModel;
        this.userInputEvents = userInputEvents;
        this.commandDelegate = commandDelegate;
    }
    paste(text, pasteOnNewLine, multicursorText, mode) {
        this.commandDelegate.paste(text, pasteOnNewLine, multicursorText, mode);
    }
    type(text) {
        this.commandDelegate.type(text);
    }
    compositionType(text, replacePrevCharCnt, replaceNextCharCnt, positionDelta) {
        this.commandDelegate.compositionType(text, replacePrevCharCnt, replaceNextCharCnt, positionDelta);
    }
    compositionStart() {
        this.commandDelegate.startComposition();
    }
    compositionEnd() {
        this.commandDelegate.endComposition();
    }
    cut() {
        this.commandDelegate.cut();
    }
    setSelection(modelSelection) {
        CoreNavigationCommands.SetSelection.runCoreEditorCommand(this.viewModel, {
            source: 'keyboard',
            selection: modelSelection
        });
    }
    _validateViewColumn(viewPosition) {
        const minColumn = this.viewModel.getLineMinColumn(viewPosition.lineNumber);
        if (viewPosition.column < minColumn) {
            return new Position(viewPosition.lineNumber, minColumn);
        }
        return viewPosition;
    }
    _hasMulticursorModifier(data) {
        switch (this.configuration.options.get(86 /* EditorOption.multiCursorModifier */)) {
            case 'altKey':
                return data.altKey;
            case 'ctrlKey':
                return data.ctrlKey;
            case 'metaKey':
                return data.metaKey;
            default:
                return false;
        }
    }
    _hasNonMulticursorModifier(data) {
        switch (this.configuration.options.get(86 /* EditorOption.multiCursorModifier */)) {
            case 'altKey':
                return data.ctrlKey || data.metaKey;
            case 'ctrlKey':
                return data.altKey || data.metaKey;
            case 'metaKey':
                return data.ctrlKey || data.altKey;
            default:
                return false;
        }
    }
    /**
     * Selects content inside brackets if the position is right after an opening bracket or right before a closing bracket.
     * @param pos The position in the model.
     * @param model The text model.
     */
    static _trySelectBracketContent(model, pos) {
        // Try to find bracket match if we're right after an opening bracket.
        if (pos.column > 1) {
            const pair = model.bracketPairs.matchBracket(pos.with(undefined, pos.column - 1));
            if (pair && pair[0].getEndPosition().equals(pos)) {
                return Selection.fromPositions(pair[0].getEndPosition(), pair[1].getStartPosition());
            }
        }
        // Try to find bracket match if we're right before a closing bracket.
        if (pos.column <= model.getLineMaxColumn(pos.lineNumber)) {
            const pair = model.bracketPairs.matchBracket(pos);
            if (pair && pair[1].getStartPosition().equals(pos)) {
                return Selection.fromPositions(pair[0].getEndPosition(), pair[1].getStartPosition());
            }
        }
        return undefined;
    }
    /**
     * Selects content inside a string if the position is right after an opening quote or right before a closing quote.
     * @param pos The position in the model.
     * @param model The text model.
     */
    static _trySelectStringContent(model, pos) {
        const { lineNumber, column } = pos;
        const { tokenization: tokens } = model;
        // Ensure we have accurate tokens for the line.
        if (!tokens.hasAccurateTokensForLine(lineNumber)) {
            if (tokens.isCheapToTokenize(lineNumber)) {
                tokens.forceTokenization(lineNumber);
            }
            else {
                return undefined;
            }
        }
        // Expand to the contiguous run of string tokens (StandardTokenType.String) around the click position.
        const lineTokens = tokens.getLineTokens(lineNumber);
        let startIndex = lineTokens.findTokenIndexAtOffset(column - 1);
        let endIndex = startIndex;
        while (startIndex > 0 &&
            lineTokens.getStandardTokenType(startIndex - 1) === 2 /* StandardTokenType.String */) {
            startIndex--;
        }
        while (endIndex + 1 < lineTokens.getCount() &&
            lineTokens.getStandardTokenType(endIndex + 1) === 2 /* StandardTokenType.String */) {
            endIndex++;
        }
        // Verify the click is after starting or before closing quote.
        const tokenStart = lineTokens.getStartOffset(startIndex);
        const tokenEnd = lineTokens.getEndOffset(endIndex);
        if (column !== tokenStart + 2 && column !== tokenEnd) {
            return undefined;
        }
        // Verify the token looks like a complete quoted string (quote ... quote).
        const lineContent = model.getLineContent(lineNumber);
        const firstChar = lineContent.charAt(tokenStart);
        if (firstChar !== '"' && firstChar !== '\'' && firstChar !== '`') {
            return undefined;
        }
        if (lineContent.charAt(tokenEnd - 1) !== firstChar) {
            return undefined;
        }
        // Skip if string contains RTL characters.
        const content = lineContent.substring(tokenStart + 1, tokenEnd - 1);
        if (containsRTL(content)) {
            return undefined;
        }
        return new Selection(lineNumber, tokenStart + 2, lineNumber, tokenEnd);
    }
    dispatchMouse(data) {
        const options = this.configuration.options;
        const selectionClipboardIsOn = (platform.isLinux && options.get(121 /* EditorOption.selectionClipboard */));
        const columnSelection = options.get(28 /* EditorOption.columnSelection */);
        const scrollOnMiddleClick = options.get(171 /* EditorOption.scrollOnMiddleClick */);
        if (data.middleButton && !selectionClipboardIsOn) {
            if (scrollOnMiddleClick) {
                // nothing to do here, handled in the contribution
            }
            else {
                this._columnSelect(data.position, data.mouseColumn, data.inSelectionMode);
            }
        }
        else if (data.startedOnLineNumbers) {
            // If the dragging started on the gutter, then have operations work on the entire line
            if (this._hasMulticursorModifier(data)) {
                if (data.inSelectionMode) {
                    this._lastCursorLineSelect(data.position, data.revealType);
                }
                else {
                    this._createCursor(data.position, true);
                }
            }
            else {
                if (data.inSelectionMode) {
                    this._lineSelectDrag(data.position, data.revealType);
                }
                else {
                    this._lineSelect(data.position, data.revealType);
                }
            }
        }
        else if (data.mouseDownCount >= 4) {
            this._selectAll();
        }
        else if (data.mouseDownCount === 3) {
            if (this._hasMulticursorModifier(data)) {
                if (data.inSelectionMode) {
                    this._lastCursorLineSelectDrag(data.position, data.revealType);
                }
                else {
                    this._lastCursorLineSelect(data.position, data.revealType);
                }
            }
            else {
                if (data.inSelectionMode) {
                    this._lineSelectDrag(data.position, data.revealType);
                }
                else {
                    this._lineSelect(data.position, data.revealType);
                }
            }
        }
        else if (data.mouseDownCount === 2) {
            if (!data.onInjectedText) {
                if (this._hasMulticursorModifier(data)) {
                    this._lastCursorWordSelect(data.position, data.revealType);
                }
                else {
                    if (data.inSelectionMode) {
                        this._wordSelectDrag(data.position, data.revealType);
                    }
                    else {
                        let selection;
                        if (options.get(173 /* EditorOption.doubleClickSelectsBlock */)) {
                            const model = this.viewModel.model;
                            const modelPos = this._convertViewToModelPosition(data.position);
                            selection = ViewController._trySelectBracketContent(model, modelPos) || ViewController._trySelectStringContent(model, modelPos);
                        }
                        if (selection) {
                            this._select(selection);
                        }
                        else {
                            this._wordSelect(data.position, data.revealType);
                        }
                    }
                }
            }
        }
        else {
            if (this._hasMulticursorModifier(data)) {
                if (!this._hasNonMulticursorModifier(data)) {
                    if (data.shiftKey) {
                        this._columnSelect(data.position, data.mouseColumn, true);
                    }
                    else {
                        // Do multi-cursor operations only when purely alt is pressed
                        if (data.inSelectionMode) {
                            this._lastCursorMoveToSelect(data.position, data.revealType);
                        }
                        else {
                            this._createCursor(data.position, false);
                        }
                    }
                }
            }
            else {
                if (data.inSelectionMode) {
                    if (data.altKey) {
                        this._columnSelect(data.position, data.mouseColumn, true);
                    }
                    else {
                        if (columnSelection) {
                            this._columnSelect(data.position, data.mouseColumn, true);
                        }
                        else {
                            this._moveToSelect(data.position, data.revealType);
                        }
                    }
                }
                else {
                    this.moveTo(data.position, data.revealType);
                }
            }
        }
    }
    _usualArgs(viewPosition, revealType) {
        viewPosition = this._validateViewColumn(viewPosition);
        return {
            source: 'mouse',
            position: this._convertViewToModelPosition(viewPosition),
            viewPosition,
            revealType
        };
    }
    moveTo(viewPosition, revealType) {
        CoreNavigationCommands.MoveTo.runCoreEditorCommand(this.viewModel, this._usualArgs(viewPosition, revealType));
    }
    _moveToSelect(viewPosition, revealType) {
        CoreNavigationCommands.MoveToSelect.runCoreEditorCommand(this.viewModel, this._usualArgs(viewPosition, revealType));
    }
    _columnSelect(viewPosition, mouseColumn, doColumnSelect) {
        viewPosition = this._validateViewColumn(viewPosition);
        CoreNavigationCommands.ColumnSelect.runCoreEditorCommand(this.viewModel, {
            source: 'mouse',
            position: this._convertViewToModelPosition(viewPosition),
            viewPosition: viewPosition,
            mouseColumn: mouseColumn,
            doColumnSelect: doColumnSelect
        });
    }
    _createCursor(viewPosition, wholeLine) {
        viewPosition = this._validateViewColumn(viewPosition);
        CoreNavigationCommands.CreateCursor.runCoreEditorCommand(this.viewModel, {
            source: 'mouse',
            position: this._convertViewToModelPosition(viewPosition),
            viewPosition: viewPosition,
            wholeLine: wholeLine
        });
    }
    _lastCursorMoveToSelect(viewPosition, revealType) {
        CoreNavigationCommands.LastCursorMoveToSelect.runCoreEditorCommand(this.viewModel, this._usualArgs(viewPosition, revealType));
    }
    _wordSelect(viewPosition, revealType) {
        CoreNavigationCommands.WordSelect.runCoreEditorCommand(this.viewModel, this._usualArgs(viewPosition, revealType));
    }
    _wordSelectDrag(viewPosition, revealType) {
        CoreNavigationCommands.WordSelectDrag.runCoreEditorCommand(this.viewModel, this._usualArgs(viewPosition, revealType));
    }
    _lastCursorWordSelect(viewPosition, revealType) {
        CoreNavigationCommands.LastCursorWordSelect.runCoreEditorCommand(this.viewModel, this._usualArgs(viewPosition, revealType));
    }
    _lineSelect(viewPosition, revealType) {
        CoreNavigationCommands.LineSelect.runCoreEditorCommand(this.viewModel, this._usualArgs(viewPosition, revealType));
    }
    _lineSelectDrag(viewPosition, revealType) {
        CoreNavigationCommands.LineSelectDrag.runCoreEditorCommand(this.viewModel, this._usualArgs(viewPosition, revealType));
    }
    _lastCursorLineSelect(viewPosition, revealType) {
        CoreNavigationCommands.LastCursorLineSelect.runCoreEditorCommand(this.viewModel, this._usualArgs(viewPosition, revealType));
    }
    _lastCursorLineSelectDrag(viewPosition, revealType) {
        CoreNavigationCommands.LastCursorLineSelectDrag.runCoreEditorCommand(this.viewModel, this._usualArgs(viewPosition, revealType));
    }
    _select(selection) {
        CoreNavigationCommands.SetSelection.runCoreEditorCommand(this.viewModel, { source: 'mouse', selection });
    }
    _selectAll() {
        CoreNavigationCommands.SelectAll.runCoreEditorCommand(this.viewModel, { source: 'mouse' });
    }
    // ----------------------
    _convertViewToModelPosition(viewPosition) {
        return this.viewModel.coordinatesConverter.convertViewPositionToModelPosition(viewPosition);
    }
    emitKeyDown(e) {
        this.userInputEvents.emitKeyDown(e);
    }
    emitKeyUp(e) {
        this.userInputEvents.emitKeyUp(e);
    }
    emitContextMenu(e) {
        this.userInputEvents.emitContextMenu(e);
    }
    emitMouseMove(e) {
        this.userInputEvents.emitMouseMove(e);
    }
    emitMouseLeave(e) {
        this.userInputEvents.emitMouseLeave(e);
    }
    emitMouseUp(e) {
        this.userInputEvents.emitMouseUp(e);
    }
    emitMouseDown(e) {
        this.userInputEvents.emitMouseDown(e);
    }
    emitMouseDrag(e) {
        this.userInputEvents.emitMouseDrag(e);
    }
    emitMouseDrop(e) {
        this.userInputEvents.emitMouseDrop(e);
    }
    emitMouseDropCanceled() {
        this.userInputEvents.emitMouseDropCanceled();
    }
    emitMouseWheel(e) {
        this.userInputEvents.emitMouseWheel(e);
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidmlld0NvbnRyb2xsZXIuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy9lZGl0b3IvYnJvd3Nlci92aWV3L3ZpZXdDb250cm9sbGVyLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBR2hHLE9BQU8sRUFBRSxzQkFBc0IsRUFBK0IsTUFBTSxvQkFBb0IsQ0FBQztBQUd6RixPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sK0JBQStCLENBQUM7QUFDekQsT0FBTyxFQUFFLFNBQVMsRUFBRSxNQUFNLGdDQUFnQyxDQUFDO0FBSzNELE9BQU8sS0FBSyxRQUFRLE1BQU0sa0NBQWtDLENBQUM7QUFHN0QsT0FBTyxFQUFFLFdBQVcsRUFBRSxNQUFNLGlDQUFpQyxDQUFDO0FBZ0M5RCxNQUFNLE9BQU8sY0FBYztJQU8xQixZQUNDLGFBQW1DLEVBQ25DLFNBQXFCLEVBQ3JCLGVBQW9DLEVBQ3BDLGVBQWlDO1FBRWpDLElBQUksQ0FBQyxhQUFhLEdBQUcsYUFBYSxDQUFDO1FBQ25DLElBQUksQ0FBQyxTQUFTLEdBQUcsU0FBUyxDQUFDO1FBQzNCLElBQUksQ0FBQyxlQUFlLEdBQUcsZUFBZSxDQUFDO1FBQ3ZDLElBQUksQ0FBQyxlQUFlLEdBQUcsZUFBZSxDQUFDO0lBQ3hDLENBQUM7SUFFTSxLQUFLLENBQUMsSUFBWSxFQUFFLGNBQXVCLEVBQUUsZUFBZ0MsRUFBRSxJQUFtQjtRQUN4RyxJQUFJLENBQUMsZUFBZSxDQUFDLEtBQUssQ0FBQyxJQUFJLEVBQUUsY0FBYyxFQUFFLGVBQWUsRUFBRSxJQUFJLENBQUMsQ0FBQztJQUN6RSxDQUFDO0lBRU0sSUFBSSxDQUFDLElBQVk7UUFDdkIsSUFBSSxDQUFDLGVBQWUsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUM7SUFDakMsQ0FBQztJQUVNLGVBQWUsQ0FBQyxJQUFZLEVBQUUsa0JBQTBCLEVBQUUsa0JBQTBC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