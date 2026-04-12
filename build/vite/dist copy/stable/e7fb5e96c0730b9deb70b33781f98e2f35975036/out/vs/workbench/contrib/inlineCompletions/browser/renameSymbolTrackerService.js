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
import { Disposable } from '../../../../base/common/lifecycle.js';
import { autorun, derived, observableValue } from '../../../../base/common/observable.js';
import { observableCodeEditor } from '../../../../editor/browser/observableCodeEditor.js';
import { ICodeEditorService } from '../../../../editor/browser/services/codeEditorService.js';
import { IRenameSymbolTrackerService } from '../../../../editor/browser/services/renameSymbolTrackerService.js';
import { Range } from '../../../../editor/common/core/range.js';
import { IModelService } from '../../../../editor/common/services/model.js';
import { registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
/**
 * Checks if a model content change event was caused only by typing or pasting.
 * Returns false for AI edits, refactorings, undo/redo, etc.
 */
function isUserEdit(event) {
    if (event.isUndoing || event.isRedoing || event.isFlush) {
        return false;
    }
    for (const source of event.detailedReasons) {
        if (!isUserEditSource(source)) {
            return false;
        }
    }
    return event.detailedReasons.length > 0;
}
const userEditKinds = new Set(['type', 'paste', 'cut', 'executeCommands', 'executeCommand', 'compositionType', 'compositionEnd']);
function isUserEditSource(source) {
    const metadata = source.metadata;
    if (metadata.source !== 'cursor') {
        return false;
    }
    const kind = metadata.kind;
    return userEditKinds.has(kind);
}
/**
 * Tracks symbol edits for a single ITextModel.
 *
 * Receives cursor position updates from external sources (e.g., focused code editors).
 * Only tracks edits done by typing or paste. Resets when:
 * - A non-typing/paste edit occurs (AI, refactoring, undo/redo, etc.)
 */
class ModelSymbolRenameTracker extends Disposable {
    constructor(_model) {
        super();
        this._model = _model;
        this._trackedWord = observableValue(this, undefined);
        this.trackedWord = this._trackedWord;
        this._capturedWord = undefined;
        this._lastWordBeforeEdit = undefined;
        this._pendingContentChange = false;
        this._lastCursorPosition = undefined;
        // Listen to content changes - only reset on non-typing/paste edits
        this._register(this._model.onDidChangeContent(e => {
            if (!isUserEdit(e)) {
                // Non-user edit has occurred - reset rename tracking at
                // the current cursor position (if any)
                const position = this._lastCursorPosition;
                this.reset();
                if (position !== undefined) {
                    this.updateCursorPosition(position);
                }
                return;
            }
            // Valid typing/paste edit - mark that content changed, cursor update will handle tracking
            this._pendingContentChange = true;
        }));
    }
    /**
     * Called by the service when the cursor position changes in an editor showing this model.
     * Updates tracking based on the word under cursor and whether content has changed.
     */
    updateCursorPosition(position) {
        this._lastCursorPosition = position;
        const wordAtPosition = this._model.getWordAtPosition(position);
        if (!wordAtPosition) {
            // Not on a word - just clear lastWordBeforeEdit
            this._lastWordBeforeEdit = undefined;
            this._pendingContentChange = false;
            return;
        }
        // Check if the position is in a comment
        if (this._isPositionInComment(position)) {
            this._lastWordBeforeEdit = undefined;
            this._pendingContentChange = false;
            return;
        }
        const currentWord = {
            word: wordAtPosition.word,
            range: new Range(position.lineNumber, wordAtPosition.startColumn, position.lineNumber, wordAtPosition.endColumn),
            position
        };
        const contentChanged = this._pendingContentChange;
        this._pendingContentChange = false;
        if (!contentChanged) {
            // Just cursor movement - remember this word for later
            this._lastWordBeforeEdit = currentWord;
            return;
        }
        // Content changed - update tracking
        if (!this._capturedWord) {
            // First edit on a word - use the word from before the edit as original
            const originalWord = this._lastWordBeforeEdit ?? currentWord;
            this._capturedWord = { ...originalWord };
            this._trackedWord.set({
                model: this._model,
                originalWord: originalWord.word,
                originalPosition: originalWord.position,
                originalRange: originalWord.range,
                currentWord: currentWord.word,
                currentRange: currentWord.range,
            }, undefined);
            this._lastWordBeforeEdit = currentWord;
            return;
        }
        const capturedWord = this._capturedWord;
        // Check if we're still on the same word (by position overlap or adjacency)
        const isOnSameWord = this._rangesOverlap(capturedWord.range, currentWord.range) ||
            this._isAdjacent(capturedWord.range, currentWord.range);
        if (isOnSameWord) {
            // Word has been edited - update the tracked word
            this._trackedWord.set({
                model: this._model,
                originalWord: capturedWord.word,
                originalPosition: capturedWord.position,
                originalRange: capturedWord.range,
                currentWord: currentWord.word,
                currentRange: currentWord.range,
            }, undefined);
        }
        else {
            // User started typing in a different word - use the word from before the edit as original
            const originalWord = this._lastWordBeforeEdit ?? currentWord;
            this._capturedWord = { ...originalWord };
            this._trackedWord.set({
                model: this._model,
                originalWord: originalWord.word,
                originalPosition: originalWord.position,
                originalRange: originalWord.range,
                currentWord: currentWord.word,
                currentRange: currentWord.range,
            }, undefined);
        }
        // Update lastWordBeforeEdit for the next iteration
        this._lastWordBeforeEdit = currentWord;
    }
    reset() {
        this._trackedWord.set(undefined, undefined);
        this._capturedWord = undefined;
        this._lastWordBeforeEdit = undefined;
        this._pendingContentChange = false;
        this._lastCursorPosition = undefined;
    }
    _isPositionInComment(position) {
        this._model.tokenization.tokenizeIfCheap(position.lineNumber);
        const tokens = this._model.tokenization.getLineTokens(position.lineNumber);
        const tokenIndex = tokens.findTokenIndexAtOffset(position.column - 1);
        const tokenType = tokens.getStandardTokenType(tokenIndex);
        return tokenType === 1 /* StandardTokenType.Comment */;
    }
    _rangesOverlap(a, b) {
        if (a.startLineNumber !== b.startLineNumber) {
            return false;
        }
        return !(a.endColumn < b.startColumn || b.endColumn < a.startColumn);
    }
    _isAdjacent(a, b) {
        if (a.startLineNumber !== b.startLineNumber) {
            return false;
        }
        return a.endColumn === b.startColumn || b.endColumn === a.startColumn;
    }
}
let RenameSymbolTrackerService = class RenameSymbolTrackerService extends Disposable {
    constructor(_codeEditorService, _modelService) {
        super();
        this._codeEditorService = _codeEditorService;
        this._modelService = _modelService;
        this._modelTrackers = new Map();
        this._editorFocusTrackingDisposables = new Map();
        this._focusedModelTracker = observableValue(this, undefined);
        this.trackedWord = derived(this, reader => {
            const tracker = this._focusedModelTracker.read(reader);
            return tracker?.trackedWord.read(reader);
        });
        // Setup tracking for existing editors
        for (const editor of this._codeEditorService.listCodeEditors()) {
            this._setupEditorTracking(editor);
        }
        // Track editor additions
        this._register(this._codeEditorService.onCodeEditorAdd(editor => {
            this._setupEditorTracking(editor);
        }));
        // Clean up editor focus tracking when editors are removed
        this._register(this._codeEditorService.onCodeEditorRemove(editor => {
            const focusDisposable = this._editorFocusTrackingDisposables.get(editor);
            if (focusDisposable) {
                focusDisposable.dispose();
                this._editorFocusTrackingDisposables.delete(editor);
            }
        }));
        // Clean up model trackers when models are removed
        this._register(this._modelService.onModelRemoved(model => {
            const tracker = this._modelTrackers.get(model);
            if (tracker) {
                tracker.dispose();
                this._modelTrackers.delete(model);
            }
        }));
    }
    _setupEditorTracking(editor) {
        if (editor.isSimpleWidget) {
            return;
        }
        // Setup focus and cursor tracking
        if (!this._editorFocusTrackingDisposables.has(editor)) {
            const obsEditor = observableCodeEditor(editor);
            const focusDisposable = autorun(reader => {
                /** @description track focused editor and forward cursor to model tracker */
                const isFocused = obsEditor.isFocused.read(reader);
                const model = obsEditor.model.read(reader);
                const cursorPosition = obsEditor.cursorPosition.read(reader);
                if (!isFocused || !model) {
                    return;
                }
                // Ensure we have a tracker for this model
                let tracker = this._modelTrackers.get(model);
                if (!tracker) {
                    tracker = new ModelSymbolRenameTracker(model);
                    this._modelTrackers.set(model, tracker);
                }
                // Update the focused tracker
                if (this._focusedModelTracker.read(undefined) !== tracker) {
                    this._focusedModelTracker.set(tracker, undefined);
                }
                // Forward cursor position to the model tracker
                if (cursorPosition) {
                    tracker.updateCursorPosition(cursorPosition);
                }
            });
            this._editorFocusTrackingDisposables.set(editor, focusDisposable);
        }
    }
    dispose() {
        for (const tracker of this._modelTrackers.values()) {
            tracker.dispose();
        }
        this._modelTrackers.clear();
        for (const disposable of this._editorFocusTrackingDisposables.values()) {
            disposable.dispose();
        }
        this._editorFocusTrackingDisposables.clear();
        super.dispose();
    }
};
RenameSymbolTrackerService = __decorate([
    __param(0, ICodeEditorService),
    __param(1, IModelService)
], RenameSymbolTrackerService);
registerSingleton(IRenameSymbolTrackerService, RenameSymbolTrackerService, 1 /* InstantiationType.Delayed */);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicmVuYW1lU3ltYm9sVHJhY2tlclNlcnZpY2UuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi9pbmxpbmVDb21wbGV0aW9ucy9icm93c2VyL3JlbmFtZVN5bWJvbFRyYWNrZXJTZXJ2aWNlLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7O0FBRWhHLE9BQU8sRUFBRSxVQUFVLEVBQWUsTUFBTSxzQ0FBc0MsQ0FBQztBQUMvRSxPQUFPLEVBQUUsT0FBTyxFQUFFLE9BQU8sRUFBZSxlQUFlLEVBQUUsTUFBTSx1Q0FBdUMsQ0FBQztBQUV2RyxPQUFPLEVBQUUsb0JBQW9CLEVBQUUsTUFBTSxvREFBb0QsQ0FBQztBQUMxRixPQUFPLEVBQUUsa0JBQWtCLEVBQUUsTUFBTSwwREFBMEQsQ0FBQztBQUM5RixPQUFPLEVBQUUsMkJBQTJCLEVBQXFCLE1BQU0sbUVBQW1FLENBQUM7QUFFbkksT0FBTyxFQUFFLEtBQUssRUFBRSxNQUFNLHlDQUF5QyxDQUFDO0FBS2hFLE9BQU8sRUFBRSxhQUFhLEVBQUUsTUFBTSw2Q0FBNkMsQ0FBQztBQUM1RSxPQUFPLEVBQXFCLGlCQUFpQixFQUFFLE1BQU0seURBQXlELENBQUM7QUFFL0c7OztHQUdHO0FBQ0gsU0FBUyxVQUFVLENBQUMsS0FBZ0M7SUFDbkQsSUFBSSxLQUFLLENBQUMsU0FBUyxJQUFJLEtBQUssQ0FBQyxTQUFTLElBQUksS0FBSyxDQUFDLE9BQU8sRUFBRSxDQUFDO1FBQ3pELE9BQU8sS0FBSyxDQUFDO0lBQ2QsQ0FBQztJQUVELEtBQUssTUFBTSxNQUFNLElBQUksS0FBSyxDQUFDLGVBQWUsRUFBRSxDQUFDO1FBQzVDLElBQUksQ0FBQyxnQkFBZ0IsQ0FBQyxNQUFNLENBQUMsRUFBRSxDQUFDO1lBQy9CLE9BQU8sS0FBSyxDQUFDO1FBQ2QsQ0FBQztJQUNGLENB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