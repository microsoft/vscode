/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, DisposableStore, IDisposable, MutableDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { autorun, derived, IObservable, observableValue } from '../../../../base/common/observable.js';
import { ICodeEditor } from '../../../../editor/browser/editorBrowser.js';
import { observableCodeEditor } from '../../../../editor/browser/observableCodeEditor.js';
import { ICodeEditorService } from '../../../../editor/browser/services/codeEditorService.js';
import { IRenameSymbolTrackerService, ITrackedWord } from '../../../../editor/browser/services/renameSymbolTrackerService.js';
import { Position } from '../../../../editor/common/core/position.js';
import { Range } from '../../../../editor/common/core/range.js';
import { StandardTokenType } from '../../../../editor/common/encodedTokenAttributes.js';
import { ITextModel } from '../../../../editor/common/model.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';


export class RenameSymbolTrackerService extends Disposable implements IRenameSymbolTrackerService {
	public _serviceBrand: undefined;

	private readonly _trackedWord = observableValue<ITrackedWord | undefined>(this, undefined);
	public readonly trackedWord: IObservable<ITrackedWord | undefined> = this._trackedWord;

	private readonly _activeEditorTracking = this._register(new MutableDisposable<DisposableStore>());
	private readonly _editorFocusTrackingDisposables = new Map<ICodeEditor, IDisposable>();
	private _currentTrackedEditor: ICodeEditor | null = null;

	constructor(
		@ICodeEditorService private readonly _codeEditorService: ICodeEditorService
	) {
		super();

		// Start tracking on currently focused editor
		const focusedEditor = this._codeEditorService.getFocusedCodeEditor();
		if (focusedEditor) {
			this._startTrackingEditor(focusedEditor);
		}

		// Track editor additions to detect focus changes
		this._register(this._codeEditorService.onCodeEditorAdd(editor => {
			this._setupEditorFocusTracking(editor);
		}));

		// Clean up when editors are removed
		this._register(this._codeEditorService.onCodeEditorRemove(editor => {
			const disposable = this._editorFocusTrackingDisposables.get(editor);
			if (disposable) {
				disposable.dispose();
				this._editorFocusTrackingDisposables.delete(editor);
			}
		}));

		// Setup tracking for existing editors
		for (const editor of this._codeEditorService.listCodeEditors()) {
			this._setupEditorFocusTracking(editor);
		}
	}

	private _setupEditorFocusTracking(editor: ICodeEditor): void {
		// Don't set up twice for the same editor
		if (this._editorFocusTrackingDisposables.has(editor)) {
			return;
		}

		const obsEditor = observableCodeEditor(editor);

		const disposable = autorun(reader => {
			/** @description track the current focused editor */
			const isFocused = obsEditor.isFocused.read(reader);
			if (isFocused && this._currentTrackedEditor !== editor) {
				// New editor gained focus - discard old state and start fresh
				this._startTrackingEditor(editor);
			}
		});

		this._editorFocusTrackingDisposables.set(editor, disposable);
	}

	private _startTrackingEditor(editor: ICodeEditor): void {
		// Discard previous tracking state
		this._activeEditorTracking.clear();
		this._trackedWord.set(undefined, undefined);
		this._currentTrackedEditor = editor;

		const store = new DisposableStore();
		this._activeEditorTracking.value = store;

		const obsEditor = observableCodeEditor(editor);

		// Derive the word under cursor reactively
		const wordUnderCursor = derived(this, reader => {
			const model = obsEditor.model.read(reader);
			const position = obsEditor.cursorPosition.read(reader);
			// Read versionId to react to content changes
			obsEditor.versionId.read(reader);

			if (!model || !position) {
				return null;
			}

			const wordAtPosition = model.getWordAtPosition(position);
			if (!wordAtPosition) {
				return null;
			}

			// Check if the position is in a comment
			if (this._isPositionInComment(model, position)) {
				return null;
			}

			return {
				model,
				word: wordAtPosition.word,
				range: new Range(
					position.lineNumber,
					wordAtPosition.startColumn,
					position.lineNumber,
					wordAtPosition.endColumn
				),
				position
			};
		});

		// Track the captured word state
		let capturedWord: { model: ITextModel; word: string; range: Range; position: Position } | null = null;

		store.add(autorun(reader => {
			const currentWord = wordUnderCursor.read(reader);

			if (!currentWord) {
				// Cursor moved away from any word - reset tracking
				capturedWord = null;
				this._trackedWord.set(undefined, undefined);
				return;
			}

			if (!capturedWord) {
				// First time on a word - capture it
				capturedWord = currentWord;
				this._trackedWord.set({
					model: currentWord.model,
					originalWord: currentWord.word,
					originalPosition: currentWord.position,
					originalRange: currentWord.range,
					currentWord: currentWord.word,
					currentRange: currentWord.range,
				}, undefined);
				return;
			}

			// Check if we're still on the same word (by position overlap or adjacency)
			const isOnSameWord = capturedWord.model === currentWord.model &&
				(this._rangesOverlap(capturedWord.range, currentWord.range) ||
					this._isAdjacent(capturedWord.range, currentWord.range));

			if (isOnSameWord) {
				// Word has been edited - update the tracked word
				this._trackedWord.set({
					model: currentWord.model,
					originalWord: capturedWord.word,
					originalPosition: capturedWord.position,
					originalRange: capturedWord.range,
					currentWord: currentWord.word,
					currentRange: currentWord.range,
				}, undefined);
			} else {
				// Cursor moved to a different word - capture the new word
				capturedWord = currentWord;
				this._trackedWord.set({
					model: currentWord.model,
					originalWord: currentWord.word,
					originalPosition: currentWord.position,
					originalRange: currentWord.range,
					currentWord: currentWord.word,
					currentRange: currentWord.range,
				}, undefined);
			}
		}));

		store.add(toDisposable(() => {
			this._trackedWord.set(undefined, undefined);
			this._currentTrackedEditor = null;
		}));
	}

	private _isPositionInComment(model: ITextModel, position: Position): boolean {
		model.tokenization.tokenizeIfCheap(position.lineNumber);
		const tokens = model.tokenization.getLineTokens(position.lineNumber);
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

	override dispose(): void {
		for (const disposable of this._editorFocusTrackingDisposables.values()) {
			disposable.dispose();
		}
		this._editorFocusTrackingDisposables.clear();
		super.dispose();
	}
}

registerSingleton(IRenameSymbolTrackerService, RenameSymbolTrackerService, InstantiationType.Delayed);
