/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { findFirstIdxMonotonousOrArrLen } from '../../../../base/common/arraysFind.js';
import { RunOnceScheduler, TimeoutTimer } from '../../../../base/common/async.js';
import { DisposableStore, dispose } from '../../../../base/common/lifecycle.js';
import { ReplaceCommand, ReplaceCommandThatPreservesSelection } from '../../../common/commands/replaceCommand.js';
import { Position } from '../../../common/core/position.js';
import { Range } from '../../../common/core/range.js';
import { Selection } from '../../../common/core/selection.js';
import { SearchParams } from '../../../common/model/textModelSearch.js';
import { FindDecorations } from './findDecorations.js';
import { ReplaceAllCommand } from './replaceAllCommand.js';
import { parseReplaceString, ReplacePattern } from './replacePattern.js';
import { RawContextKey } from '../../../../platform/contextkey/common/contextkey.js';
export const CONTEXT_FIND_WIDGET_VISIBLE = new RawContextKey('findWidgetVisible', false);
export const CONTEXT_FIND_WIDGET_NOT_VISIBLE = CONTEXT_FIND_WIDGET_VISIBLE.toNegated();
// Keep ContextKey use of 'Focussed' to not break when clauses
export const CONTEXT_FIND_INPUT_FOCUSED = new RawContextKey('findInputFocussed', false);
export const CONTEXT_REPLACE_INPUT_FOCUSED = new RawContextKey('replaceInputFocussed', false);
/**
 * Context key that is true when any element within the Find widget has focus.
 * This includes the Find input, Replace input, checkboxes, buttons, etc.
 */
export const CONTEXT_FIND_WIDGET_FOCUSED = new RawContextKey('findWidgetFocused', false);
export const ToggleCaseSensitiveKeybinding = {
    primary: 512 /* KeyMod.Alt */ | 33 /* KeyCode.KeyC */,
    mac: { primary: 2048 /* KeyMod.CtrlCmd */ | 512 /* KeyMod.Alt */ | 33 /* KeyCode.KeyC */ }
};
export const ToggleWholeWordKeybinding = {
    primary: 512 /* KeyMod.Alt */ | 53 /* KeyCode.KeyW */,
    mac: { primary: 2048 /* KeyMod.CtrlCmd */ | 512 /* KeyMod.Alt */ | 53 /* KeyCode.KeyW */ }
};
export const ToggleRegexKeybinding = {
    primary: 512 /* KeyMod.Alt */ | 48 /* KeyCode.KeyR */,
    mac: { primary: 2048 /* KeyMod.CtrlCmd */ | 512 /* KeyMod.Alt */ | 48 /* KeyCode.KeyR */ }
};
export const ToggleSearchScopeKeybinding = {
    primary: 512 /* KeyMod.Alt */ | 42 /* KeyCode.KeyL */,
    mac: { primary: 2048 /* KeyMod.CtrlCmd */ | 512 /* KeyMod.Alt */ | 42 /* KeyCode.KeyL */ }
};
export const TogglePreserveCaseKeybinding = {
    primary: 512 /* KeyMod.Alt */ | 46 /* KeyCode.KeyP */,
    mac: { primary: 2048 /* KeyMod.CtrlCmd */ | 512 /* KeyMod.Alt */ | 46 /* KeyCode.KeyP */ }
};
export const FIND_IDS = {
    StartFindAction: 'actions.find',
    StartFindWithSelection: 'actions.findWithSelection',
    StartFindWithArgs: 'editor.actions.findWithArgs',
    NextMatchFindAction: 'editor.action.nextMatchFindAction',
    PreviousMatchFindAction: 'editor.action.previousMatchFindAction',
    GoToMatchFindAction: 'editor.action.goToMatchFindAction',
    NextSelectionMatchFindAction: 'editor.action.nextSelectionMatchFindAction',
    PreviousSelectionMatchFindAction: 'editor.action.previousSelectionMatchFindAction',
    StartFindReplaceAction: 'editor.action.startFindReplaceAction',
    CloseFindWidgetCommand: 'closeFindWidget',
    ToggleCaseSensitiveCommand: 'toggleFindCaseSensitive',
    ToggleWholeWordCommand: 'toggleFindWholeWord',
    ToggleRegexCommand: 'toggleFindRegex',
    ToggleSearchScopeCommand: 'toggleFindInSelection',
    TogglePreserveCaseCommand: 'togglePreserveCase',
    ReplaceOneAction: 'editor.action.replaceOne',
    ReplaceAllAction: 'editor.action.replaceAll',
    SelectAllMatchesAction: 'editor.action.selectAllMatches'
};
export const MATCHES_LIMIT = 19999;
const RESEARCH_DELAY = 240;
export class FindModelBoundToEditorModel {
    constructor(editor, state) {
        this._toDispose = new DisposableStore();
        this._editor = editor;
        this._state = state;
        this._isDisposed = false;
        this._startSearchingTimer = new TimeoutTimer();
        this._decorations = new FindDecorations(editor);
        this._toDispose.add(this._decorations);
        this._updateDecorationsScheduler = new RunOnceScheduler(() => {
            if (!this._editor.hasModel()) {
                return;
            }
            return this.research(false);
        }, 100);
        this._toDispose.add(this._updateDecorationsScheduler);
        this._toDispose.add(this._editor.onDidChangeCursorPosition((e) => {
            if (e.reason === 3 /* CursorChangeReason.Explicit */
                || e.reason === 5 /* CursorChangeReason.Undo */
                || e.reason === 6 /* CursorChangeReason.Redo */) {
                this._decorations.setStartPosition(this._editor.getPosition());
            }
        }));
        this._ignoreModelContentChanged = false;
        this._toDispose.add(this._editor.onDidChangeModelContent((e) => {
            if (this._ignoreModelContentChanged) {
                return;
            }
            if (e.isFlush) {
                // a model.setValue() was called
                this._decorations.reset();
            }
            this._decorations.setStartPosition(this._editor.getPosition());
            this._updateDecorationsScheduler.schedule();
        }));
        this._toDispose.add(this._state.onFindReplaceStateChange((e) => this._onStateChanged(e)));
        this.research(false, this._state.searchScope);
    }
    dispose() {
        this._isDisposed = true;
        dispose(this._startSearchingTimer);
        this._toDispose.dispose();
    }
    _onStateChanged(e) {
        if (this._isDisposed) {
            // The find model is disposed during a find state changed event
            return;
        }
        if (!this._editor.hasModel()) {
            // The find model will be disposed momentarily
            return;
        }
        if (e.searchString || e.isReplaceRevealed || e.isRegex || e.wholeWord || e.matchCase || e.searchScope) {
            const model = this._editor.getModel();
            if (model.isTooLargeForSyncing()) {
                this._startSearchingTimer.cancel();
                this._startSearchingTimer.setIfNotSet(() => {
                    if (e.searchScope) {
                        this.research(e.moveCursor, this._state.searchScope);
                    }
                    else {
                        this.research(e.moveCursor);
                    }
                }, RESEARCH_DELAY);
            }
            else {
                if (e.searchScope) {
                    this.research(e.moveCursor, this._state.searchScope);
                }
                else {
                    this.research(e.moveCursor);
                }
            }
        }
    }
    static _getSearchRange(model, findScope) {
        // If we have set now or before a find scope, use it for computing the search range
        if (findScope) {
            return findScope;
        }
        return model.getFullModelRange();
    }
    research(moveCursor, newFindScope) {
        let findScopes = null;
        if (typeof newFindScope !== 'undefined') {
            if (newFindScope !== null) {
                if (!Array.isArray(newFindScope)) {
                    findScopes = [newFindScope];
                }
                else {
                    findScopes = newFindScope;
                }
            }
        }
        else {
            findScopes = this._decorations.getFindScopes();
        }
        if (findScopes !== null) {
            findScopes = findScopes.map(findScope => {
                if (findScope.startLineNumber !== findScope.endLineNumber) {
                    let endLineNumber = findScope.endLineNumber;
                    if (findScope.endColumn === 1) {
                        endLineNumber = endLineNumber - 1;
                    }
                    return new Range(findScope.startLineNumber, 1, endLineNumber, this._editor.getModel().getLineMaxColumn(endLineNumber));
                }
                return findScope;
            });
        }
        const findMatches = this._findMatches(findScopes, false, MATCHES_LIMIT);
        this._decorations.set(findMatches, findScopes);
        const editorSelection = this._editor.getSelection();
        let currentMatchesPosition = this._decorations.getCurrentMatchesPosition(editorSelection);
        if (currentMatchesPosition === 0 && findMatches.length > 0) {
            // current selection is not on top of a match
            // try to find its nearest result from the top of the document
            const matchAfterSelection = findFirstIdxMonotonousOrArrLen(findMatches.map(match => match.range), range => Range.compareRangesUsingStarts(range, editorSelection) >= 0);
            currentMatchesPosition = matchAfterSelection > 0 ? matchAfterSelection - 1 + 1 /** match position is one based */ : currentMatchesPosition;
        }
        this._state.changeMatchInfo(currentMatchesPosition, this._decorations.getCount(), undefined);
        if (moveCursor && this._editor.getOption(50 /* EditorOption.find */).cursorMoveOnType) {
            this._moveToNextMatch(this._decorations.getStartPosition());
        }
    }
    _hasMatches() {
        return (this._state.matchesCount > 0);
    }
    _cannotFind() {
        if (!this._hasMatches()) {
            const findScope = this._decorations.getFindScope();
            if (findScope) {
                // Reveal the selection so user is reminded that 'selection find' is on.
                this._editor.revealRangeInCenterIfOutsideViewport(findScope, 0 /* ScrollType.Smooth */);
            }
            return true;
        }
        return false;
    }
    _setCurrentFindMatch(match) {
        const matchesPosition = this._decorations.setCurrentFindMatch(match);
        this._state.changeMatchInfo(matchesPosition, this._decorations.getCount(), match);
        this._editor.setSelection(match);
        this._editor.revealRangeInCenterIfOutsideViewport(match, 0 /* ScrollType.Smooth */);
    }
    _prevSearchPosition(before) {
        const isUsingLineStops = this._state.isRegex && (this._state.searchString.indexOf('^') >= 0
            || this._state.searchString.indexOf('$') >= 0);
        let { lineNumber, column } = before;
        const model = this._editor.getModel();
        if (isUsingLineStops || column === 1) {
            if (lineNumber === 1) {
                lineNumber = model.getLineCount();
            }
            else {
                lineNumber--;
            }
            column = model.getLineMaxColumn(lineNumber);
        }
        else {
            column--;
        }
        return new Position(lineNumber, column);
    }
    _moveToPrevMatch(before, isRecursed = false) {
        if (!this._state.canNavigateBack()) {
            // we are beyond the first matched find result
            // instead of doing nothing, we should refocus the first item
            const nextMatchRange = this._decorations.matchAfterPosition(before);
            if (nextMatchRange) {
                this._setCurrentFindMatch(nextMatchRange);
            }
            return;
        }
        if (this._decorations.getCount() < MATCHES_LIMIT) {
            let prevMatchRange = this._decorations.matchBeforePosition(before);
            if (prevMatchRange && prevMatchRange.isEmpty() && prevMatchRange.getStartPosition().equals(before)) {
                before = this._prevSearchPosition(before);
                prevMatchRange = this._decorations.matchBeforePosition(before);
            }
            if (prevMatchRange) {
                this._setCurrentFindMatch(prevMatchRange);
            }
            return;
        }
        if (this._cannotFind()) {
            return;
        }
        const findScope = this._decorations.getFindScope();
        const searchRange = FindModelBoundToEditorModel._getSearchRange(this._editor.getModel(), findScope);
        // ...(----)...|...
        if (searchRange.getEndPosition().isBefore(before)) {
            before = searchRange.getEndPosition();
        }
        // ...|...(----)...
        if (before.isBefore(searchRange.getStartPosition())) {
            before = searchRange.getEndPosition();
        }
        const { lineNumber, column } = before;
        const model = this._editor.getModel();
        let position = new Position(lineNumber, column);
        let prevMatch = model.findPreviousMatch(this._state.searchString, position, this._state.isRegex, this._state.matchCase, this._state.wholeWord ? this._editor.getOption(148 /* EditorOption.wordSeparators */) : null, false);
        if (prevMatch && prevMatch.range.isEmpty() && prevMatch.range.getStartPosition().equals(position)) {
            // Looks like we're stuck at this position, unacceptable!
            position = this._prevSearchPosition(position);
            prevMatch = model.findPreviousMatch(this._state.searchString, position, this._state.isRegex, this._state.matchCase, this._state.wholeWord ? this._editor.getOption(148 /* EditorOption.wordSeparators */) : null, false);
        }
        if (!prevMatch) {
            // there is precisely one match and selection is on top of it
            return;
        }
        if (!isRecursed && !searchRange.containsRange(prevMatch.range)) {
            return this._moveToPrevMatch(prevMatch.range.getStartPosition(), true);
        }
        this._setCurrentFindMatch(prevMatch.range);
    }
    moveToPrevMatch() {
        this._moveToPrevMatch(this._editor.getSelection().getStartPosition());
    }
    _nextSearchPosition(after) {
        const isUsingLineStops = this._state.isRegex && (this._state.searchString.indexOf('^') >= 0
            || this._state.searchString.indexOf('$') >= 0);
        let { lineNumber, column } = after;
        const model = this._editor.getModel();
        if (isUsingLineStops || column === model.getLineMaxColumn(lineNumber)) {
            if (lineNumber === model.getLineCount()) {
                lineNumber = 1;
            }
            else {
                lineNumber++;
            }
            column = 1;
        }
        else {
            column++;
        }
        return new Position(lineNumber, column);
    }
    _moveToNextMatch(after) {
        if (!this._state.canNavigateForward()) {
            // we are beyond the last matched find result
            // instead of doing nothing, we should refocus the last item
            const prevMatchRange = this._decorations.matchBeforePosition(after);
            if (prevMatchRange) {
                this._setCurrentFindMatch(prevMatchRange);
            }
            return;
        }
        if (this._decorations.getCount() < MATCHES_LIMIT) {
            let nextMatchRange = this._decorations.matchAfterPosition(after);
            if (nextMatchRange && nextMatchRange.isEmpty() && nextMatchRange.getStartPosition().equals(after)) {
                // Looks like we're stuck at this position, unacceptable!
                after = this._nextSearchPosition(after);
                nextMatchRange = this._decorations.matchAfterPosition(after);
            }
            if (nextMatchRange) {
                this._setCurrentFindMatch(nextMatchRange);
            }
            return;
        }
        const nextMatch = this._getNextMatch(after, false, true);
        if (nextMatch) {
            this._setCurrentFindMatch(nextMatch.range);
        }
    }
    _getNextMatch(after, captureMatches, forceMove, isRecursed = false) {
        if (this._cannotFind()) {
            return null;
        }
        const findScope = this._decorations.getFindScope();
        const searchRange = FindModelBoundToEditorModel._getSearchRange(this._editor.getModel(), findScope);
        // ...(----)...|...
        if (searchRange.getEndPosition().isBefore(after)) {
            after = searchRange.getStartPosition();
        }
        // ...|...(----)...
        if (after.isBefore(searchRange.getStartPosition())) {
            after = searchRange.getStartPosition();
        }
        const { lineNumber, column } = after;
        const model = this._editor.getModel();
        let position = new Position(lineNumber, column);
        let nextMatch = model.findNextMatch(this._state.searchString, position, this._state.isRegex, this._state.matchCase, this._state.wholeWord ? this._editor.getOption(148 /* EditorOption.wordSeparators */) : null, captureMatches);
        if (forceMove && nextMatch && nextMatch.range.isEmpty() && nextMatch.range.getStartPosition().equals(position)) {
            // Looks like we're stuck at this position, unacceptable!
            position = this._nextSearchPosition(position);
            nextMatch = model.findNextMatch(this._state.searchString, position, this._state.isRegex, this._state.matchCase, this._state.wholeWord ? this._editor.getOption(148 /* EditorOption.wordSeparators */) : null, captureMatches);
        }
        if (!nextMatch) {
            // there is precisely one match and selection is on top of it
            return null;
        }
        if (!isRecursed && !searchRange.containsRange(nextMatch.range)) {
            return this._getNextMatch(nextMatch.range.getEndPosition(), captureMatches, forceMove, true);
        }
        return nextMatch;
    }
    moveToNextMatch() {
        this._moveToNextMatch(this._editor.getSelection().getEndPosition());
    }
    _moveToMatch(index) {
        const decorationRange = this._decorations.getDecorationRangeAt(index);
        if (decorationRange) {
            this._setCurrentFindMatch(decorationRange);
        }
    }
    moveToMatch(index) {
        this._moveToMatch(index);
    }
    _getReplacePattern() {
        if (this._state.isRegex) {
            return parseReplaceString(this._state.replaceString);
        }
        return ReplacePattern.fromStaticValue(this._state.replaceString);
    }
    replace() {
        if (!this._hasMatches()) {
            return;
        }
        const replacePattern = this._getReplacePattern();
        const selection = this._editor.getSelection();
        const nextMatch = this._getNextMatch(selection.getStartPosition(), true, false);
        if (nextMatch) {
            if (selection.equalsRange(nextMatch.range)) {
                // selection sits on a find match => replace it!
                const replaceString = replacePattern.buildReplaceString(nextMatch.matches, this._state.preserveCase);
                const command = new ReplaceCommand(selection, replaceString);
                this._executeEditorCommand('replace', command);
                this._decorations.setStartPosition(new Position(selection.startLineNumber, selection.startColumn + replaceString.length));
                this.research(true);
            }
            else {
                this._decorations.setStartPosition(this._editor.getPosition());
                this._setCurrentFindMatch(nextMatch.range);
            }
        }
    }
    _findMatches(findScopes, captureMatches, limitResultCount) {
        const searchRanges = (findScopes || [null]).map((scope) => FindModelBoundToEditorModel._getSearchRange(this._editor.getModel(), scope));
        return this._editor.getModel().findMatches(this._state.searchString, searchRanges, this._state.isRegex, this._state.matchCase, this._state.wholeWord ? this._editor.getOption(148 /* EditorOption.wordSeparators */) : null, captureMatches, limitResultCount);
    }
    replaceAll() {
        if (!this._hasMatches()) {
            return;
        }
        const findScopes = this._decorations.getFindScopes();
        if (findScopes === null && this._state.matchesCount >= MATCHES_LIMIT) {
            // Doing a replace on the entire file that is over ${MATCHES_LIMIT} matches
            this._largeReplaceAll();
        }
        else {
            this._regularReplaceAll(findScopes);
        }
        this.research(false);
    }
    _largeReplaceAll() {
        const searchParams = new SearchParams(this._state.searchString, this._state.isRegex, this._state.matchCase, this._state.wholeWord ? this._editor.getOption(148 /* EditorOption.wordSeparators */) : null);
        const searchData = searchParams.parseSearchRequest();
        if (!searchData) {
            return;
        }
        let searchRegex = searchData.regex;
        if (!searchRegex.multiline) {
            let mod = 'mu';
            if (searchRegex.ignoreCase) {
                mod += 'i';
            }
            if (searchRegex.global) {
                mod += 'g';
            }
            searchRegex = new RegExp(searchRegex.source, mod);
        }
        const model = this._editor.getModel();
        const modelText = model.getValue(1 /* EndOfLinePreference.LF */);
        const fullModelRange = model.getFullModelRange();
        const replacePattern = this._getReplacePattern();
        let resultText;
        const preserveCase = this._state.preserveCase;
        if (replacePattern.hasReplacementPatterns || preserveCase) {
            resultText = modelText.replace(searchRegex, function () {
                // eslint-disable-next-line local/code-no-any-casts
                return replacePattern.buildReplaceString(arguments, preserveCase);
            });
        }
        else {
            resultText = modelText.replace(searchRegex, replacePattern.buildReplaceString(null, preserveCase));
        }
        const command = new ReplaceCommandThatPreservesSelection(fullModelRange, resultText, this._editor.getSelection());
        this._executeEditorCommand('replaceAll', command);
    }
    _regularReplaceAll(findScopes) {
        const replacePattern = this._getReplacePattern();
        // Get all the ranges (even more than the highlighted ones)
        const matches = this._findMatches(findScopes, replacePattern.hasReplacementPatterns || this._state.preserveCase, 1073741824 /* Constants.MAX_SAFE_SMALL_INTEGER */);
        const replaceStrings = [];
        for (let i = 0, len = matches.length; i < len; i++) {
            replaceStrings[i] = replacePattern.buildReplaceString(matches[i].matches, this._state.preserveCase);
        }
        const command = new ReplaceAllCommand(this._editor.getSelection(), matches.map(m => m.range), replaceStrings);
        this._executeEditorCommand('replaceAll', command);
    }
    selectAllMatches() {
        if (!this._hasMatches()) {
            return;
        }
        const findScopes = this._decorations.getFindScopes();
        // Get all the ranges (even more than the highlighted ones)
        const matches = this._findMatches(findScopes, false, 1073741824 /* Constants.MAX_SAFE_SMALL_INTEGER */);
        let selections = matches.map(m => new Selection(m.range.startLineNumber, m.range.startColumn, m.range.endLineNumber, m.range.endColumn));
        // If one of the ranges is the editor selection, then maintain it as primary
        const editorSelection = this._editor.getSelection();
        for (let i = 0, len = selections.length; i < len; i++) {
            const sel = selections[i];
            if (sel.equalsRange(editorSelection)) {
                selections = [editorSelection].concat(selections.slice(0, i)).concat(selections.slice(i + 1));
                break;
            }
        }
        this._editor.setSelections(selections);
    }
    _executeEditorCommand(source, command) {
        try {
            this._ignoreModelContentChanged = true;
            this._editor.pushUndoStop();
            this._editor.executeCommand(source, command);
            this._editor.pushUndoStop();
        }
        finally {
            this._ignoreModelContentChanged = false;
        }
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZmluZE1vZGVsLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvZWRpdG9yL2NvbnRyaWIvZmluZC9icm93c2VyL2ZpbmRNb2RlbC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRyxPQUFPLEVBQUUsOEJBQThCLEVBQUUsTUFBTSx1Q0FBdUMsQ0FBQztBQUN2RixPQUFPLEVBQUUsZ0JBQWdCLEVBQUUsWUFBWSxFQUFFLE1BQU0sa0NBQWtDLENBQUM7QUFFbEYsT0FBTyxFQUFFLGVBQWUsRUFBRSxPQUFPLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUdoRixPQUFPLEVBQUUsY0FBYyxFQUFFLG9DQUFvQyxFQUFFLE1BQU0sNENBQTRDLENBQUM7QUFHbEgsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLGtDQUFrQyxDQUFDO0FBQzVELE9BQU8sRUFBRSxLQUFLLEVBQUUsTUFBTSwrQkFBK0IsQ0FBQztBQUN0RCxPQUFPLEVBQUUsU0FBUyxFQUFFLE1BQU0sbUNBQW1DLENBQUM7QUFHOUQsT0FBTyxFQUFFLFlBQVksRUFBRSxNQUFNLDBDQUEwQyxDQUFDO0FBQ3hFLE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSxzQkFBc0IsQ0FBQztBQUV2RCxPQUFPLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSx3QkFBd0IsQ0FBQztBQUMzRCxPQUFPLEVBQUUsa0JBQWtCLEVBQUUsY0FBYyxFQUFFLE1BQU0scUJBQXFCLENBQUM7QUFDekUsT0FBTyxFQUFFLGFBQWEsRUFBRSxNQUFNLHNEQUFzRCxDQUFDO0FBR3JGLE1BQU0sQ0FBQyxNQUFNLDJCQUEyQixHQUFHLElBQUksYUFBYSxDQUFVLG1CQUFtQixFQUFFLEtBQUssQ0FBQyxDQUFDO0FBQ2xHLE1BQU0sQ0FBQyxNQUFNLCtCQUErQixHQUFHLDJCQUEyQixDQUFDLFNBQVMsRUFBRSxDQUFDO0FBQ3ZGLDhEQUE4RDtB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