/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { onUnexpectedError } from '../../../base/common/errors.js';
import * as strings from '../../../base/common/strings.js';
import { CursorCollection } from './cursorCollection.js';
import { CursorState, EditOperationResult } from '../cursorCommon.js';
import { CursorContext } from './cursorContext.js';
import { DeleteOperations } from './cursorDeleteOperations.js';
import { CompositionOutcome, TypeOperations } from './cursorTypeOperations.js';
import { BaseTypeWithAutoClosingCommand } from './cursorTypeEditOperations.js';
import { Range } from '../core/range.js';
import { Selection } from '../core/selection.js';
import { ModelInjectedTextChangedEvent } from '../textModelEvents.js';
import { ViewCursorStateChangedEvent, ViewRevealRangeRequestEvent } from '../viewEvents.js';
import { dispose, Disposable } from '../../../base/common/lifecycle.js';
import { CursorStateChangedEvent } from '../viewModelEventDispatcher.js';
import { EditSources } from '../textModelEditSource.js';
export class CursorsController extends Disposable {
    constructor(model, viewModel, coordinatesConverter, cursorConfig) {
        super();
        this._model = model;
        this._knownModelVersionId = this._model.getVersionId();
        this._viewModel = viewModel;
        this._coordinatesConverter = coordinatesConverter;
        this.context = new CursorContext(this._model, this._viewModel, this._coordinatesConverter, cursorConfig);
        this._cursors = new CursorCollection(this.context);
        this._hasFocus = false;
        this._isHandling = false;
        this._compositionState = null;
        this._columnSelectData = null;
        this._autoClosedActions = [];
        this._prevEditOperationType = 0 /* EditOperationType.Other */;
    }
    dispose() {
        this._cursors.dispose();
        this._autoClosedActions = dispose(this._autoClosedActions);
        super.dispose();
    }
    updateConfiguration(cursorConfig) {
        this.context = new CursorContext(this._model, this._viewModel, this._coordinatesConverter, cursorConfig);
        this._cursors.updateContext(this.context);
    }
    onLineMappingChanged(eventsCollector) {
        if (this._knownModelVersionId !== this._model.getVersionId()) {
            // There are model change events that I didn't yet receive.
            //
            // This can happen when editing the model, and the view model receives the change events first,
            // and the view model emits line mapping changed events, all before the cursor gets a chance to
            // recover from markers.
            //
            // The model change listener above will be called soon and we'll ensure a valid cursor state there.
            return;
        }
        // Ensure valid state
        this.setStates(eventsCollector, 'viewModel', 0 /* CursorChangeReason.NotSet */, this.getCursorStates());
    }
    setHasFocus(hasFocus) {
        this._hasFocus = hasFocus;
    }
    _validateAutoClosedActions() {
        if (this._autoClosedActions.length > 0) {
            const selections = this._cursors.getSelections();
            for (let i = 0; i < this._autoClosedActions.length; i++) {
                const autoClosedAction = this._autoClosedActions[i];
                if (!autoClosedAction.isValid(selections)) {
                    autoClosedAction.dispose();
                    this._autoClosedActions.splice(i, 1);
                    i--;
                }
            }
        }
    }
    // ------ some getters/setters
    getPrimaryCursorState() {
        return this._cursors.getPrimaryCursor();
    }
    getLastAddedCursorIndex() {
        return this._cursors.getLastAddedCursorIndex();
    }
    getCursorStates() {
        return this._cursors.getAll();
    }
    setStates(eventsCollector, source, reason, states) {
        let reachedMaxCursorCount = false;
        const multiCursorLimit = this.context.cursorConfig.multiCursorLimit;
        if (states !== null && states.length > multiCursorLimit) {
            states = states.slice(0, multiCursorLimit);
            reachedMaxCursorCount = true;
        }
        const oldState = CursorModelState.from(this._model, this);
        this._cursors.setStates(states);
        this._cursors.normalize();
        this._columnSelectData = null;
        this._validateAutoClosedActions();
        return this._emitStateChangedIfNecessary(eventsCollector, source, reason, oldState, reachedMaxCursorCount);
    }
    setCursorColumnSelectData(columnSelectData) {
        this._columnSelectData = columnSelectData;
    }
    revealAll(eventsCollector, source, minimalReveal, verticalType, revealHorizontal, scrollType) {
        const viewPositions = this._cursors.getViewPositions();
        let revealViewRange = null;
        let revealViewSelections = null;
        if (viewPositions.length > 1) {
            revealViewSelections = this._cursors.getViewSelections();
        }
        else {
            revealViewRange = Range.fromPositions(viewPositions[0], viewPositions[0]);
        }
        eventsCollector.emitViewEvent(new ViewRevealRangeRequestEvent(source, minimalReveal, revealViewRange, revealViewSelections, verticalType, revealHorizontal, scrollType));
    }
    revealPrimary(eventsCollector, source, minimalReveal, verticalType, revealHorizontal, scrollType) {
        const primaryCursor = this._cursors.getPrimaryCursor();
        const revealViewSelections = [primaryCursor.viewState.selection];
        eventsCollector.emitViewEvent(new ViewRevealRangeRequestEvent(source, minimalReveal, null, revealViewSelections, verticalType, revealHorizontal, scrollType));
    }
    saveState() {
        const result = [];
        const selections = this._cursors.getSelections();
        for (let i = 0, len = selections.length; i < len; i++) {
            const selection = selections[i];
            result.push({
                inSelectionMode: !selection.isEmpty(),
                selectionStart: {
                    lineNumber: selection.selectionStartLineNumber,
                    column: selection.selectionStartColumn,
                },
                position: {
                    lineNumber: selection.positionLineNumber,
                    column: selection.positionColumn,
                }
            });
        }
        return result;
    }
    restoreState(eventsCollector, states) {
        const desiredSelections = [];
        for (let i = 0, len = states.length; i < len; i++) {
            const state = states[i];
            let positionLineNumber = 1;
            let positionColumn = 1;
            // Avoid missing properties on the literal
            if (state.position && state.position.lineNumber) {
                positionLineNumber = state.position.lineNumber;
            }
            if (state.position && state.position.column) {
                positionColumn = state.position.column;
            }
            let selectionStartLineNumber = positionLineNumber;
            let selectionStartColumn = positionColumn;
            // Avoid missing properties on the literal
            if (state.selectionStart && state.selectionStart.lineNumber) {
                selectionStartLineNumber = state.selectionStart.lineNumber;
            }
            if (state.selectionStart && state.selectionStart.column) {
                selectionStartColumn = state.selectionStart.column;
            }
            desiredSelections.push({
                selectionStartLineNumber: selectionStartLineNumber,
                selectionStartColumn: selectionStartColumn,
                positionLineNumber: positionLineNumber,
                positionColumn: positionColumn
            });
        }
        this.setStates(eventsCollector, 'restoreState', 0 /* CursorChangeReason.NotSet */, CursorState.fromModelSelections(desiredSelections));
        this.revealAll(eventsCollector, 'restoreState', false, 0 /* VerticalRevealType.Simple */, true, 1 /* editorCommon.ScrollType.Immediate */);
    }
    onModelContentChanged(eventsCollector, event) {
        if (event instanceof ModelInjectedTextChangedEvent) {
            // If injected texts change, the view positions of all cursors need to be updated.
            if (this._isHandling) {
                // The view positions will be updated when handling finishes
                return;
            }
            // setStates might remove markers, which could trigger a decoration change.
            // If there are injected text decorations for that line, `onModelContentChanged` is emitted again
            // and an endless recursion happens.
            // _isHandling prevents that.
            this._isHandling = true;
            try {
                this.setStates(eventsCollector, 'modelChange', 0 /* CursorChangeReason.NotSet */, this.getCursorStates());
            }
            finally {
                this._isHandling = false;
            }
        }
        else {
            const e = event.rawContentChangedEvent;
            this._knownModelVersionId = e.versionId;
            if (this._isHandling) {
                return;
            }
            const hadFlushEvent = e.containsEvent(1 /* RawContentChangedType.Flush */);
            this._prevEditOperationType = 0 /* EditOperationType.Other */;
            if (hadFlushEvent) {
                // a model.setValue() was called
                this._cursors.dispose();
                this._cursors = new CursorCollection(this.context);
                this._validateAutoClosedActions();
                this._emitStateChangedIfNecessary(eventsCollector, 'model', 1 /* CursorChangeReason.ContentFlush */, null, false);
            }
            else {
                if (this._hasFocus && e.resultingSelection && e.resultingSelection.length > 0) {
                    const cursorState = CursorState.fromModelSelections(e.resultingSelection);
                    if (this.setStates(eventsCollector, 'modelChange', e.isUndoing ? 5 /* CursorChangeReason.Undo */ : e.isRedoing ? 6 /* CursorChangeReason.Redo */ : 2 /* CursorChangeReason.RecoverFromMarkers */, cursorState)) {
                        this.revealAll(eventsCollector, 'modelChange', false, 0 /* VerticalRevealType.Simple */, true, 0 /* editorCommon.ScrollType.Smooth */);
                    }
                }
                else {
                    const selectionsFromMarkers = this._cursors.readSelectionFromMarkers();
                    this.setStates(eventsCollector, 'modelChange', 2 /* CursorChangeReason.RecoverFromMarkers */, CursorState.fromModelSelections(selectionsFromMarkers));
                }
            }
        }
    }
    getSelection() {
        return this._cursors.getPrimaryCursor().modelState.selection;
    }
    getTopMostViewPosition() {
        return this._cursors.getTopMostViewPosition();
    }
    getBottomMostViewPosition() {
        return this._cursors.getBottomMostViewPosition();
    }
    getCursorColumnSelectData() {
        if (this._columnSelectData) {
            return this._columnSelectData;
        }
        const primaryCursor = this._cursors.getPrimaryCursor();
        const viewSelectionStart = primaryCursor.viewState.selectionStart.getStartPosition();
        const viewPosition = primaryCursor.viewState.position;
        return {
            isReal: false,
            fromViewLineNumber: viewSelectionStart.lineNumber,
            fromViewVisualColumn: this.context.cursorConfig.visibleColumnFromColumn(this._viewModel, viewSelectionStart),
            toViewLineNumber: viewPosition.lineNumber,
            toViewVisualColumn: this.context.cursorConfig.visibleColumnFromColumn(this._viewModel, viewPosition),
        };
    }
    getSelections() {
        return this._cursors.getSelections();
    }
    getPosition() {
        return this._cursors.getPrimaryCursor().modelState.position;
    }
    setSelections(eventsCollector, source, selections, reason) {
        this.setStates(eventsCollector, source, reason, CursorState.fromModelSelections(selections));
    }
    getPrevEditOperationType() {
        return this._prevEditOperationType;
    }
    setPrevEditOperationType(type) {
        this._prevEditOperationType = type;
    }
    // ------ auxiliary handling logic
    _pushAutoClosedAction(autoClosedCharactersRanges, autoClosedEnclosingRanges) {
        const autoClosedCharactersDeltaDecorations = [];
        const autoClosedEnclosingDeltaDecorations = [];
        for (let i = 0, len = autoClosedCharactersRanges.length; i < len; i++) {
            autoClosedCharactersDeltaDecorations.push({
                range: autoClosedCharactersRanges[i],
                options: {
                    description: 'auto-closed-character',
                    inlineClassName: 'auto-closed-character',
                    stickiness: 1 /* TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges */
                }
            });
            autoClosedEnclosingDeltaDecorations.push({
                range: autoClosedEnclosingRanges[i],
                options: {
                    description: 'auto-closed-enclosing',
                    stickiness: 1 /* TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges */
                }
            });
        }
        const autoClosedCharactersDecorations = this._model.deltaDecorations([], autoClosedCharactersDeltaDecorations);
        const autoClosedEnclosingDecorations = this._model.deltaDecorations([], autoClosedEnclosingDeltaDecorations);
        this._autoClosedActions.push(new AutoClosedAction(this._model, autoClosedCharactersDecorations, autoClosedEnclosingDecorations));
    }
    _executeEditOperation(opResult, editReason) {
        if (!opResult) {
            // Nothing to execute
            return;
        }
        if (opResult.shouldPushStackElementBefore) {
            this._model.pushStackElement();
        }
        const result = CommandExecutor.executeCommands(this._model, this._cursors.getSelections(), opResult.commands, editReason);
        if (result) {
            // The commands were applied correctly
            this._interpretCommandResult(result);
            // Check for auto-closing closed characters
            const autoClosedCharactersRanges = [];
            const autoClosedEnclosingRanges = [];
            for (let i = 0; i < opResult.commands.length; i++) {
                const command = opResult.commands[i];
                if (command instanceof BaseTypeWithAutoClosingCommand && command.enclosingRange && command.closeCharacterRange) {
                    autoClosedCharactersRanges.push(command.closeCharacterRange);
                    autoClosedEnclosingRanges.push(command.enclosingRange);
                }
            }
            if (autoClosedCharactersRanges.length > 0) {
                this._pushAutoClosedAction(autoClosedCharactersRanges, autoClosedEnclosingRanges);
            }
            this._prevEditOperationType = opResult.type;
        }
        if (opResult.shouldPushStackElementAfter) {
            this._model.pushStackElement();
        }
    }
    _interpretCommandResult(cursorState) {
        if (!cursorState || cursorState.length === 0) {
            cursorState = this._cursors.readSelectionFromMarkers();
        }
        this._columnSelectData = null;
        this._cursors.setSelections(cursorState);
        this._cursors.normalize();
    }
    // -----------------------------------------------------------------------------------------------------------
    // ----- emitting events
    _emitStateChangedIfNecessary(eventsCollector, source, reason, oldState, reachedMaxCursorCount) {
        const newState = CursorModelState.from(this._model, this);
        if (newState.equals(oldState)) {
            return false;
        }
        const selections = this._cursors.getSelections();
        const viewSelections = this._cursors.getViewSelections();
        // Let the view get the event first.
        eventsCollector.emitViewEvent(new ViewCursorStateChangedEvent(viewSelections, selections, reason));
        // Only after the view has been notified, let the rest of the world know...
        if (!oldState
            || oldState.cursorState.length !== newState.cursorState.length
            || newState.cursorState.some((newCursorState, i) => !newCursorState.modelState.equals(oldState.cursorState[i].modelState))) {
            const oldSelections = oldState ? oldState.cursorState.map(s => s.modelState.selection) : null;
            const oldModelVersionId = oldState ? oldState.modelVersionId : 0;
            eventsCollector.emitOutgoingEvent(new CursorStateChangedEvent(oldSelections, selections, oldModelVersionId, newState.modelVersionId, source || 'keyboard', reason, reachedMaxCursorCount));
        }
        return true;
    }
    // -----------------------------------------------------------------------------------------------------------
    // ----- handlers beyond this point
    _findAutoClosingPairs(edits) {
        if (!edits.length) {
            return null;
        }
        const indices = [];
        for (let i = 0, len = edits.length; i < len; i++) {
            const edit = edits[i];
            if (!edit.text || edit.text.indexOf('\n') >= 0) {
                return null;
            }
            const m = edit.text.match(/([)\]}>'"`])([^)\]}>'"`]*)$/);
            if (!m) {
                return null;
            }
            const closeChar = m[1];
            const autoClosingPairsCandidates = this.context.cursorConfig.autoClosingPairs.autoClosingPairsCloseSingleChar.get(closeChar);
            if (!autoClosingPairsCandidates || autoClosingPairsCandidates.length !== 1) {
                return null;
            }
            const openChar = autoClosingPairsCandidates[0].open;
            const closeCharIndex = edit.text.length - m[2].length - 1;
            const openCharIndex = edit.text.lastIndexOf(openChar, closeCharIndex - 1);
            if (openCharIndex === -1) {
                return null;
            }
            indices.push([openCharIndex, closeCharIndex]);
        }
        return indices;
    }
    executeEdits(eventsCollector, source, edits, cursorStateComputer, reason) {
        let autoClosingIndices = null;
        if (source === 'snippet') {
            autoClosingIndices = this._findAutoClosingPairs(edits);
        }
        if (autoClosingIndices) {
            edits[0]._isTracked = true;
        }
        const autoClosedCharactersRanges = [];
        const autoClosedEnclosingRanges = [];
        const selections = this._model.pushEditOperations(this.getSelections(), edits, (undoEdits) => {
            if (autoClosingIndices) {
                for (let i = 0, len = autoClosingIndices.length; i < len; i++) {
                    const [openCharInnerIndex, closeCharInnerIndex] = autoClosingIndices[i];
                    const undoEdit = undoEdits[i];
                    const lineNumber = undoEdit.range.startLineNumber;
                    const openCharIndex = undoEdit.range.startColumn - 1 + openCharInnerIndex;
                    const closeCharIndex = undoEdit.range.startColumn - 1 + closeCharInnerIndex;
                    autoClosedCharactersRanges.push(new Range(lineNumber, closeCharIndex + 1, lineNumber, closeCharIndex + 2));
                    autoClosedEnclosingRanges.push(new Range(lineNumber, openCharIndex + 1, lineNumber, closeCharIndex + 2));
                }
            }
            const selections = cursorStateComputer(undoEdits);
            if (selections) {
                // Don't recover the selection from markers because
                // we know what it should be.
                this._isHandling = true;
            }
            return selections;
        }, undefined, reason);
        if (selections) {
            this._isHandling = false;
            this.setSelections(eventsCollector, source, selections, 0 /* CursorChangeReason.NotSet */);
        }
        if (autoClosedCharactersRanges.length > 0) {
            this._pushAutoClosedAction(autoClosedCharactersRanges, autoClosedEnclosingRanges);
        }
    }
    _executeEdit(callback, eventsCollector, source, cursorChangeReason = 0 /* CursorChangeReason.NotSet */) {
        if (this.context.cursorConfig.readOnly) {
            // we cannot edit when read only...
            return;
        }
        const oldState = CursorModelState.from(this._model, this);
        this._cursors.stopTrackingSelections();
        this._isHandling = true;
        try {
            this._cursors.ensureValidState();
            callback();
        }
        catch (err) {
            onUnexpectedError(err);
        }
        this._isHandling = false;
        this._cursors.startTrackingSelections();
        this._validateAutoClosedActions();
        if (this._emitStateChangedIfNecessary(eventsCollector, source, cursorChangeReason, oldState, false)) {
            this.revealAll(eventsCollector, source, false, 0 /* VerticalRevealType.Simple */, true, 0 /* editorCommon.ScrollType.Smooth */);
        }
    }
    getAutoClosedCharacters() {
        return AutoClosedAction.getAllAutoClosedCharacters(this._autoClosedActions);
    }
    startComposition(eventsCollector) {
        this._compositionState = new CompositionState(this._model, this.getSelections());
    }
    endComposition(eventsCollector, source) {
        const reason = EditSources.cursor({ kind: 'compositionEnd', detailedSource: source });
        const compositionOutcome = this._compositionState ? this._compositionState.deduceOutcome(this._model, this.getSelections()) : null;
        this._compositionState = null;
        this._executeEdit(() => {
            if (source === 'keyboard') {
                // composition finishes, let's check if we need to auto complete if necessary.
                this._executeEditOperation(TypeOperations.compositionEndWithInterceptors(this._prevEditOperationType, this.context.cursorConfig, this._model, compositionOutcome, this.getSelections(), this.getAutoClosedCharacters()), reason);
            }
        }, eventsCollector, source);
    }
    type(eventsCollector, text, source) {
        const reason = EditSources.cursor({ kind: 'type', detailedSource: source });
        this._executeEdit(() => {
            if (source === 'keyboard') {
                // If this event is coming straight from the keyboard, look for electric characters and enter
                const len = text.length;
                let offset = 0;
                while (offset < len) {
                    const charLength = strings.nextCharLength(text, offset);
                    const chr = text.substr(offset, charLength);
                    // Here we must interpret each typed character individually
                    this._executeEditOperation(TypeOperations.typeWithInterceptors(!!this._compositionState, this._prevEditOperationType, this.context.cursorConfig, this._model, this.getSelections(), this.getAutoClosedCharacters(), chr), reason);
                    offset += charLength;
                }
            }
            else {
                this._executeEditOperation(TypeOperations.typeWithoutInterceptors(this._prevEditOperationType, this.context.cursorConfig, this._model, this.getSelections(), text), reason);
            }
        }, eventsCollector, source);
    }
    compositionType(eventsCollector, text, replacePrevCharCnt, replaceNextCharCnt, positionDelta, source) {
        const reason = EditSources.cursor({ kind: 'compositionType', detailedSource: source });
        if (text.length === 0 && replacePrevCharCnt === 0 && replaceNextCharCnt === 0) {
            // this edit is a no-op
            if (positionDelta !== 0) {
                // but it still wants to move the cursor
                const newSelections = this.getSelections().map(selection => {
                    const position = selection.getPosition();
                    return new Selection(position.lineNumber, position.column + positionDelta, position.lineNumber, position.column + positionDelta);
                });
                this.setSelections(eventsCollector, source, newSelections, 0 /* CursorChangeReason.NotSet */);
            }
            return;
        }
        this._executeEdit(() => {
            this._executeEditOperation(TypeOperations.compositionType(this._prevEditOperationType, this.context.cursorConfig, this._model, this.getSelections(), text, replacePrevCharCnt, replaceNextCharCnt, positionDelta), reason);
        }, eventsCollector, source);
    }
    paste(eventsCollector, text, pasteOnNewLine, multicursorText, source) {
        const reason = EditSources.cursor({ kind: 'paste', detailedSource: source });
        this._executeEdit(() => {
            this._executeEditOperation(TypeOperations.paste(this.context.cursorConfig, this._model, this.getSelections(), text, pasteOnNewLine, multicursorText || []), reason);
        }, eventsCollector, source, 4 /* CursorChangeReason.Paste */);
    }
    cut(eventsCollector, source) {
        const reason = EditSources.cursor({ kind: 'cut', detailedSource: source });
        this._executeEdit(() => {
            this._executeEditOperation(DeleteOperations.cut(this.context.cursorConfig, this._model, this.getSelections()), reason);
        }, eventsCollector, source);
    }
    executeCommand(eventsCollector, command, source) {
        const reason = EditSources.cursor({ kind: 'executeCommand', detailedSource: source });
        this._executeEdit(() => {
            this._cursors.killSecondaryCursors();
            this._executeEditOperation(new EditOperationResult(0 /* EditOperationType.Other */, [command], {
                shouldPushStackElementBefore: false,
                shouldPushStackElementAfter: false
            }), reason);
        }, eventsCollector, source);
    }
    executeCommands(eventsCollector, commands, source) {
        const reason = EditSources.cursor({ kind: 'executeCommands', detailedSource: source });
        this._executeEdit(() => {
            this._executeEditOperation(new EditOperationResult(0 /* EditOperationType.Other */, commands, {
                shouldPushStackElementBefore: false,
                shouldPushStackElementAfter: false
            }), reason);
        }, eventsCollector, source);
    }
}
/**
 * A snapshot of the cursor and the model state
 */
class CursorModelState {
    static from(model, cursor) {
        return new CursorModelState(model.getVersionId(), cursor.getCursorStates());
    }
    constructor(modelVersionId, cursorState) {
        this.modelVersionId = modelVersionId;
        this.cursorState = cursorState;
    }
    equals(other) {
        if (!other) {
            return false;
        }
        if (this.modelVersionId !== other.modelVersionId) {
            return false;
        }
        if (this.cursorState.length !== other.cursorState.length) {
            return false;
        }
        for (let i = 0, len = this.cursorState.length; i < len; i++) {
            if (!this.cursorState[i].equals(other.cursorState[i])) {
                return false;
            }
        }
        return true;
    }
}
class AutoClosedAction {
    static getAllAutoClosedCharacters(autoClosedActions) {
        let autoClosedCharacters = [];
        for (const autoClosedAction of autoClosedActions) {
            autoClosedCharacters = autoClosedCharacters.concat(autoClosedAction.getAutoClosedCharactersRanges());
        }
        return autoClosedCharacters;
    }
    constructor(model, autoClosedCharactersDecorations, autoClosedEnclosingDecorations) {
        this._model = model;
        this._autoClosedCharactersDecorations = autoClosedCharactersDecorations;
        this._autoClosedEnclosingDecorations = autoClosedEnclosingDecorations;
    }
    dispose() {
        this._autoClosedCharactersDecorations = this._model.deltaDecorations(this._autoClosedCharactersDecorations, []);
        this._autoClosedEnclosingDecorations = this._model.deltaDecorations(this._autoClosedEnclosingDecorations, []);
    }
    getAutoClosedCharactersRanges() {
        const result = [];
        for (let i = 0; i < this._autoClosedCharactersDecorations.length; i++) {
            const decorationRange = this._model.getDecorationRange(this._autoClosedCharactersDecorations[i]);
            if (decorationRange) {
                result.push(decorationRange);
            }
        }
        return result;
    }
    isValid(selections) {
        const enclosingRanges = [];
        for (let i = 0; i < this._autoClosedEnclosingDecorations.length; i++) {
            const decorationRange = this._model.getDecorationRange(this._autoClosedEnclosingDecorations[i]);
            if (decorationRange) {
                enclosingRanges.push(decorationRange);
                if (decorationRange.startLineNumber !== decorationRange.endLineNumber) {
                    // Stop tracking if the range becomes multiline...
                    return false;
                }
            }
        }
        enclosingRanges.sort(Range.compareRangesUsingStarts);
        selections.sort(Range.compareRangesUsingStarts);
        for (let i = 0; i < selections.length; i++) {
            if (i >= enclosingRanges.length) {
                return false;
            }
            if (!enclosingRanges[i].strictContainsRange(selections[i])) {
                return false;
            }
        }
        return true;
    }
}
export class CommandExecutor {
    static executeCommands(model, selectionsBefore, commands, editReason = EditSources.unknown({ name: 'executeCommands' })) {
        const ctx = {
            model: model,
            selectionsBefore: selectionsBefore,
            trackedRanges: [],
            trackedRangesDirection: []
        };
        const result = this._innerExecuteCommands(ctx, commands, editReason);
        for (let i = 0, len = ctx.trackedRanges.length; i < len; i++) {
            ctx.model._setTrackedRange(ctx.trackedRanges[i], null, 0 /* TrackedRangeStickiness.AlwaysGrowsWhenTypingAtEdges */);
        }
        return result;
    }
    static _innerExecuteCommands(ctx, commands, editReason) {
        if (this._arrayIsEmpty(commands)) {
            return null;
        }
        const commandsData = this._getEditOperations(ctx, commands);
        if (commandsData.operations.length === 0) {
            return null;
        }
        const rawOperations = commandsData.operations;
        const loserCursorsMap = this._getLoserCursorMap(rawOperations);
        if (loserCursorsMap.hasOwnProperty('0')) {
            // These commands are very messed up
            console.warn('Ignoring commands');
            return null;
        }
        // Remove operations belonging to losing cursors
        const filteredOperations = [];
        for (let i = 0, len = rawOperations.length; i < len; i++) {
            if (!loserCursorsMap.hasOwnProperty(rawOperations[i].identifier.major.toString())) {
                filteredOperations.push(rawOperations[i]);
            }
        }
        // TODO@Alex: find a better way to do this.
        // give the hint that edit operations are tracked to the model
        if (commandsData.hadTrackedEditOperation && filteredOperations.length > 0) {
            filteredOperations[0]._isTracked = true;
        }
        let selectionsAfter = ctx.model.pushEditOperations(ctx.selectionsBefore, filteredOperations, (inverseEditOperations) => {
            const groupedInverseEditOperations = [];
            for (let i = 0; i < ctx.selectionsBefore.length; i++) {
                groupedInverseEditOperations[i] = [];
            }
            for (const op of inverseEditOperations) {
                if (!op.identifier) {
                    // perhaps auto whitespace trim edits
                    continue;
                }
                groupedInverseEditOperations[op.identifier.major].push(op);
            }
            const minorBasedSorter = (a, b) => {
                return a.identifier.minor - b.identifier.minor;
            };
            const cursorSelections = [];
            for (let i = 0; i < ctx.selectionsBefore.length; i++) {
                if (groupedInverseEditOperations[i].length > 0) {
                    groupedInverseEditOperations[i].sort(minorBasedSorter);
                    cursorSelections[i] = commands[i].computeCursorState(ctx.model, {
                        getInverseEditOperations: () => {
                            return groupedInverseEditOperations[i];
                        },
                        getTrackedSelection: (id) => {
                            const idx = parseInt(id, 10);
                            const range = ctx.model._getTrackedRange(ctx.trackedRanges[idx]);
                            if (ctx.trackedRangesDirection[idx] === 0 /* SelectionDirection.LTR */) {
                                return new Selection(range.startLineNumber, range.startColumn, range.endLineNumber, range.endColumn);
                            }
                            return new Selection(range.endLineNumber, range.endColumn, range.startLineNumber, range.startColumn);
                        }
                    });
                }
                else {
                    cursorSelections[i] = ctx.selectionsBefore[i];
                }
            }
            return cursorSelections;
        }, undefined, editReason);
        if (!selectionsAfter) {
            selectionsAfter = ctx.selectionsBefore;
        }
        // Extract losing cursors
        const losingCursors = [];
        for (const losingCursorIndex in loserCursorsMap) {
            if (loserCursorsMap.hasOwnProperty(losingCursorIndex)) {
                losingCursors.push(parseInt(losingCursorIndex, 10));
            }
        }
        // Sort losing cursors descending
        losingCursors.sort((a, b) => {
            return b - a;
        });
        // Remove losing cursors
        for (const losingCursor of losingCursors) {
            selectionsAfter.splice(losingCursor, 1);
        }
        return selectionsAfter;
    }
    static _arrayIsEmpty(commands) {
        for (let i = 0, len = commands.length; i < len; i++) {
            if (commands[i]) {
                return false;
            }
        }
        return true;
    }
    static _getEditOperations(ctx, commands) {
        let operations = [];
        let hadTrackedEditOperation = false;
        for (let i = 0, len = commands.length; i < len; i++) {
            const command = commands[i];
            if (command) {
                const r = this._getEditOperationsFromCommand(ctx, i, command);
                operations = operations.concat(r.operations);
                hadTrackedEditOperation = hadTrackedEditOperation || r.hadTrackedEditOperation;
            }
        }
        return {
            operations: operations,
            hadTrackedEditOperation: hadTrackedEditOperation
        };
    }
    static _getEditOperationsFromCommand(ctx, majorIdentifier, command) {
        // This method acts as a transaction, if the command fails
        // everything it has done is ignored
        const operations = [];
        let operationMinor = 0;
        const addEditOperation = (range, text, forceMoveMarkers = false) => {
            if (Range.isEmpty(range) && text === '') {
                // This command wants to add a no-op => no thank you
                return;
            }
            operations.push({
                identifier: {
                    major: majorIdentifier,
                    minor: operationMinor++
                },
                range: range,
                text: text,
                forceMoveMarkers: forceMoveMarkers,
                isAutoWhitespaceEdit: command.insertsAutoWhitespace
            });
        };
        let hadTrackedEditOperation = false;
        const addTrackedEditOperation = (selection, text, forceMoveMarkers) => {
            hadTrackedEditOperation = true;
            addEditOperation(selection, text, forceMoveMarkers);
        };
        const trackSelection = (_selection, trackPreviousOnEmpty) => {
            const selection = Selection.liftSelection(_selection);
            let stickiness;
            if (selection.isEmpty()) {
                if (typeof trackPreviousOnEmpty === 'boolean') {
                    if (trackPreviousOnEmpty) {
                        stickiness = 2 /* TrackedRangeStickiness.GrowsOnlyWhenTypingBefore */;
                    }
                    else {
                        stickiness = 3 /* TrackedRangeStickiness.GrowsOnlyWhenTypingAfter */;
                    }
                }
                else {
                    // Try to lock it with surrounding text
                    const maxLineColumn = ctx.model.getLineMaxColumn(selection.startLineNumber);
                    if (selection.startColumn === maxLineColumn) {
                        stickiness = 2 /* TrackedRangeStickiness.GrowsOnlyWhenTypingBefore */;
                    }
                    else {
                        stickiness = 3 /* TrackedRangeStickiness.GrowsOnlyWhenTypingAfter */;
                    }
                }
            }
            else {
                stickiness = 1 /* TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges */;
            }
            const l = ctx.trackedRanges.length;
            const id = ctx.model._setTrackedRange(null, selection, stickiness);
            ctx.trackedRanges[l] = id;
            ctx.trackedRangesDirection[l] = selection.getDirection();
            return l.toString();
        };
        const editOperationBuilder = {
            addEditOperation: addEditOperation,
            addTrackedEditOperation: addTrackedEditOperation,
            trackSelection: trackSelection
        };
        try {
            command.getEditOperations(ctx.model, editOperationBuilder);
        }
        catch (e) {
            // TODO@Alex use notification service if this should be user facing
            // e.friendlyMessage = nls.localize('corrupt.commands', "Unexpected exception while executing command.");
            onUnexpectedError(e);
            return {
                operations: [],
                hadTrackedEditOperation: false
            };
        }
        return {
            operations: operations,
            hadTrackedEditOperation: hadTrackedEditOperation
        };
    }
    static _getLoserCursorMap(operations) {
        // This is destructive on the array
        operations = operations.slice(0);
        // Sort operations with last one first
        operations.sort((a, b) => {
            // Note the minus!
            return -(Range.compareRangesUsingEnds(a.range, b.range));
        });
        // Operations can not overlap!
        const loserCursorsMap = {};
        for (let i = 1; i < operations.length; i++) {
            const previousOp = operations[i - 1];
            const currentOp = operations[i];
            if (Range.getStartPosition(previousOp.range).isBefore(Range.getEndPosition(currentOp.range))) {
                let loserMajor;
                if (previousOp.identifier.major > currentOp.identifier.major) {
                    // previousOp loses the battle
                    loserMajor = previousOp.identifier.major;
                }
                else {
                    loserMajor = currentOp.identifier.major;
                }
                loserCursorsMap[loserMajor.toString()] = true;
                for (let j = 0; j < operations.length; j++) {
                    if (operations[j].identifier.major === loserMajor) {
                        operations.splice(j, 1);
                        if (j < i) {
                            i--;
                        }
                        j--;
                    }
                }
                if (i > 0) {
                    i--;
                }
            }
        }
        return loserCursorsMap;
    }
}
class CompositionLineState {
    constructor(text, lineNumber, startSelectionOffset, endSelectionOffset) {
        this.text = text;
        this.lineNumber = lineNumber;
        this.startSelectionOffset = startSelectionOffset;
        this.endSelectionOffset = endSelectionOffset;
    }
}
class CompositionState {
    static _capture(textModel, selections) {
        const result = [];
        for (const selection of selections) {
            if (selection.startLineNumber !== selection.endLineNumber) {
                return null;
            }
            const lineNumber = selection.startLineNumber;
            result.push(new CompositionLineState(textModel.getLineContent(lineNumber), lineNumber, selection.startColumn - 1, selection.endColumn - 1));
        }
        return result;
    }
    constructor(textModel, selections) {
        this._original = CompositionState._capture(textModel, selections);
    }
    /**
     * Returns the inserted text during this composition.
     * If the composition resulted in existing text being changed (i.e. not a pure insertion) it returns null.
     */
    deduceOutcome(textModel, selections) {
        if (!this._original) {
            return null;
        }
        const current = CompositionState._capture(textModel, selections);
        if (!current) {
            return null;
        }
        if (this._original.length !== current.length) {
            return null;
        }
        const result = [];
        for (let i = 0, len = this._original.length; i < len; i++) {
            result.push(CompositionState._deduceOutcome(this._original[i], current[i]));
        }
        return result;
    }
    static _deduceOutcome(original, current) {
        const commonPrefix = Math.min(original.startSelectionOffset, current.startSelectionOffset, strings.commonPrefixLength(original.text, current.text));
        const commonSuffix = Math.min(original.text.length - original.endSelectionOffset, current.text.length - current.endSelectionOffset, strings.commonSuffixLength(original.text, current.text));
        const deletedText = original.text.substring(commonPrefix, original.text.length - commonSuffix);
        const insertedTextStartOffset = commonPrefix;
        const insertedTextEndOffset = current.text.length - commonSuffix;
        const insertedText = current.text.substring(insertedTextStartOffset, insertedTextEndOffset);
        const insertedTextRange = new Range(current.lineNumber, insertedTextStartOffset + 1, current.lineNumber, insertedTextEndOffset + 1);
        return new CompositionOutcome(deletedText, original.startSelectionOffset - commonPrefix, original.endSelectionOffset - commonPrefix, insertedText, current.startSelectionOffset - commonPrefix, current.endSelectionOffset - commonPrefix, insertedTextRange);
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY3Vyc29yLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvZWRpdG9yL2NvbW1vbi9jdXJzb3IvY3Vyc29yLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sRUFBRSxpQkFBaUIsRUFBRSxNQUFNLGdDQUFnQyxDQUFDO0FBQ25FLE9BQU8sS0FBSyxPQUFPLE1BQU0saUNBQWlDLENBQUM7QUFDM0QsT0FBTyxFQUFFLGdCQUFnQixFQUFFLE1BQU0sdUJBQXVCLENBQUM7QUFDekQsT0FBTyxFQUF1QixXQUFXLEVBQUUsbUJBQW1CLEVBQWdGLE1BQU0sb0JBQW9CLENBQUM7QUFDekssT0FBTyxFQUFFLGFBQWEsRUFBRSxNQUFNLG9CQUFvQixDQUFDO0FBQ25ELE9BQU8sRUFBRSxnQkFBZ0IsRUFBRSxNQUFNLDZCQUE2QixDQUFDO0FBRS9ELE9BQU8sRUFBRSxrQkFBa0IsRUFBRSxjQUFjLEVBQUUsTUFBTSwyQkFBMkIsQ0FBQztBQUMvRSxPQUFPLEVBQUUsOEJBQThCLEVBQUUsTUFBTSwrQkFBK0IsQ0FBQztBQUUvRSxPQUFPLEVBQUUsS0FBSyxFQUFVLE1BQU0sa0JBQWtCLENBQUM7QUFDakQsT0FBTyxFQUFjLFNBQVMsRUFBc0IsTUFBTSxzQkFBc0IsQ0FBQztBQUdqRixPQUFPLEVBQXlCLDZCQUE2QixFQUFtQyxNQUFNLHVCQUF1QixDQUFDO0FBQzlILE9BQU8sRUFBc0IsMkJBQTJCLEVBQUUsMkJBQTJCLEVBQUUsTUFBTSxrQkFBa0IsQ0FBQztBQUNoSCxPQUFPLEVBQUUsT0FBTyxFQUFFLFVBQVUsRUFBRSxNQUFNLG1DQUFtQyxDQUFDO0FBQ3hFLE9BQU8sRUFBRSx1QkFBdUIsRUFBNEIsTUFBTSxnQ0FBZ0MsQ0FBQztBQUNuRyxPQUFPLEVBQXVCLFdBQVcsRUFBRSxNQUFNLDJCQUEyQixDQUFDO0FBRzdFLE1BQU0sT0FBTyxpQkFB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