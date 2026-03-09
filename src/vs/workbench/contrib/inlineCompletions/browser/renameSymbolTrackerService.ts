/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, IDisposable } from '../../../../base/common/lifecycle.js';
import { autorun, derived, IObservable, observableValue } from '../../../../base/common/observable.js';
import { ICodeEditor } from '../../../../editor/browser/editorBrowser.js';
import { observableCodeEditor } from '../../../../editor/browser/observableCodeEditor.js';
import { ICodeEditorService } from '../../../../editor/browser/services/codeEditorService.js';
import { IRenameSymbolTrackerService, type ITrackedWord } from '../../../../editor/browser/services/renameSymbolTrackerService.js';
import { Position } from '../../../../editor/common/core/position.js';
import { Range } from '../../../../editor/common/core/range.js';
import { StandardTokenType } from '../../../../editor/common/encodedTokenAttributes.js';
import { ITextModel } from '../../../../editor/common/model.js';
import { IModelContentChangedEvent } from '../../../../editor/common/textModelEvents.js';
import { TextModelEditSource } from '../../../../editor/common/textModelEditSource.js';
import { IModelService } from '../../../../editor/common/services/model.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';

/**
 * Checks if a model content change event was caused only by typing or pasting.
 * Returns false for AI edits, refactorings, undo/redo, etc.
 */
function isUserEdit(event: IModelContentChangedEvent): boolean {
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
function isUserEditSource(source: TextModelEditSource): boolean {
	const metadata = source.metadata;
	if (metadata.source !== 'cursor') {
		return false;
	}
	const kind = metadata.kind;
	return userEditKinds.has(kind);
}

type WordState = {
	word: string;
	range: Range;
	position: Position;
};

/**
 * Tracks symbol edits for a single ITextModel.
 *
 * Receives cursor position updates from external sources (e.g., focused code editors).
 * Only tracks edits done by typing or paste. Resets when:
 * - A non-typing/paste edit occurs (AI, refactoring, undo/redo, etc.)
 */
class ModelSymbolRenameTracker extends Disposable {
	private readonly _trackedWord = observableValue<ITrackedWord | undefined>(this, undefined);
	public readonly trackedWord: IObservable<ITrackedWord | undefined> = this._trackedWord;

	private _capturedWord: WordState | undefined = undefined;
	private _lastWordBeforeEdit: WordState | undefined = undefined;
	private _pendingContentChange: boolean = false;
	private _lastCursorPosition: Position | undefined = undefined;

	constructor(
		private readonly _model: ITextModel
	) {
		super();

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
	public updateCursorPosition(position: Position): void {
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

		const currentWord: WordState = {
			word: wordAtPosition.word,
			range: new Range(
				position.lineNumber,
				wordAtPosition.startColumn,
				position.lineNumber,
				wordAtPosition.endColumn
			),
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
		} else {
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

	private reset(): void {
		this._trackedWord.set(undefined, undefined);
		this._capturedWord = undefined;
		this._lastWordBeforeEdit = undefined;
		this._pendingContentChange = false;
		this._lastCursorPosition = undefined;
	}

	private _isPositionInComment(position: Position): boolean {
		this._model.tokenization.tokenizeIfCheap(position.lineNumber);
		const tokens = this._model.tokenization.getLineTokens(position.lineNumber);
		const tokenIndex = tokens.findTokenIndexAtOffset(position.column - 1);
		const tokenType = tokens.getStandardTokenType(tokenIndex);
		return tokenType === StandardTokenType.Comment;
	}

	private _rangesOverlap(a: Range, b: Range): boolean {
		if (a.startLineNumber !== b.startLineNumber) {
			return false;
		}
		return !(a.endColumn < b.startColumn || b.endColumn < a.startColumn);
	}

	private _isAdjacent(a: Range, b: Range): boolean {
		if (a.startLineNumber !== b.startLineNumber) {
			return false;
		}
		return a.endColumn === b.startColumn || b.endColumn === a.startColumn;
	}
}

class RenameSymbolTrackerService extends Disposable implements IRenameSymbolTrackerService {
	public _serviceBrand: undefined;

	private readonly _modelTrackers = new Map<ITextModel, ModelSymbolRenameTracker>();
	private readonly _editorFocusTrackingDisposables = new Map<ICodeEditor, IDisposable>();

	private readonly _focusedModelTracker = observableValue<ModelSymbolRenameTracker | undefined>(this, undefined);

	public readonly trackedWord: IObservable<ITrackedWord | undefined> = derived(this, reader => {
		const tracker = this._focusedModelTracker.read(reader);
		return tracker?.trackedWord.read(reader);
	});

	constructor(
		@ICodeEditorService private readonly _codeEditorService: ICodeEditorService,
		@IModelService private readonly _modelService: IModelService
	) {
		super();

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

	private _setupEditorTracking(editor: ICodeEditor): void {
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

	override dispose(): void {
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
}

registerSingleton(IRenameSymbolTrackerService, RenameSymbolTrackerService, InstantiationType.Delayed);
