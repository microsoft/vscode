/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import URI from 'vs/base/common/uri';
import Event, { Emitter } from 'vs/base/common/event';
import * as editorCommon from 'vs/editor/common/editorCommon';
import { TextModelWithDecorations } from 'vs/editor/common/model/textModelWithDecorations';
import { TextModel } from 'vs/editor/common/model/textModel';
import { LanguageIdentifier } from 'vs/editor/common/modes';
import { IRawTextSource, RawTextSource, ITextSource } from 'vs/editor/common/model/textSource';
import { EditStack } from 'vs/editor/common/model/editStack';
import { Range } from 'vs/editor/common/core/range';
import { Selection } from 'vs/editor/common/core/selection';
import { ModelRawContentChangedEvent } from 'vs/editor/common/model/textModelEvents';

// The hierarchy is:
// Model -> TextModelWithDecorations -> TextModelWithTokens -> TextModel

var MODEL_ID = 0;

export class Model extends TextModelWithDecorations implements editorCommon.IModel, editorCommon.IEditableTextModel {

	private readonly _onWillDispose: Emitter<void> = this._register(new Emitter<void>());
	public readonly onWillDispose: Event<void> = this._onWillDispose.event;

	public static createFromString(text: string, options: editorCommon.ITextModelCreationOptions = TextModel.DEFAULT_CREATION_OPTIONS, languageIdentifier: LanguageIdentifier = null, uri: URI = null): Model {
		return new Model(RawTextSource.fromString(text), options, languageIdentifier, uri);
	}

	public readonly id: string;

	private readonly _associatedResource: URI;
	private _attachedEditorCount: number;

	private _commandManager: EditStack;

	// for extra details about change events:
	private _isUndoing: boolean;
	private _isRedoing: boolean;

	private _trimAutoWhitespaceLines: number[];

	constructor(rawTextSource: IRawTextSource, creationOptions: editorCommon.ITextModelCreationOptions, languageIdentifier: LanguageIdentifier, associatedResource: URI = null) {
		super(rawTextSource, creationOptions, languageIdentifier);

		this._commandManager = new EditStack(this);

		this._isUndoing = false;
		this._isRedoing = false;

		this._trimAutoWhitespaceLines = null;

		// Generate a new unique model id
		MODEL_ID++;
		this.id = '$model' + MODEL_ID;

		if (typeof associatedResource === 'undefined' || associatedResource === null) {
			this._associatedResource = URI.parse('inmemory://model/' + MODEL_ID);
		} else {
			this._associatedResource = associatedResource;
		}

		this._attachedEditorCount = 0;
	}

	public dispose(): void {
		this._isDisposing = true;
		this._onWillDispose.fire();
		this._commandManager = null;
		super.dispose();
		this._isDisposing = false;
	}

	protected _resetValue(newValue: ITextSource): void {
		super._resetValue(newValue);

		// Destroy my edit history and settings
		this._commandManager = new EditStack(this);
		this._trimAutoWhitespaceLines = null;
	}

	public onBeforeAttached(): void {
		this._attachedEditorCount++;
		// Warm up tokens for the editor
		this._warmUpTokens();
	}

	public onBeforeDetached(): void {
		this._attachedEditorCount--;
	}

	protected _shouldAutoTokenize(): boolean {
		return this.isAttachedToEditor();
	}

	public isAttachedToEditor(): boolean {
		return this._attachedEditorCount > 0;
	}

	public get uri(): URI {
		return this._associatedResource;
	}

	//#region Editing

	public pushStackElement(): void {
		this._commandManager.pushStackElement();
	}


	public pushEditOperations(beforeCursorState: Selection[], editOperations: editorCommon.IIdentifiedSingleEditOperation[], cursorStateComputer: editorCommon.ICursorStateComputer): Selection[] {
		try {
			this._eventEmitter.beginDeferredEmit();
			this._onDidChangeDecorations.beginDeferredEmit();
			return this._pushEditOperations(beforeCursorState, editOperations, cursorStateComputer);
		} finally {
			this._onDidChangeDecorations.endDeferredEmit();
			this._eventEmitter.endDeferredEmit();
		}
	}

	private _pushEditOperations(beforeCursorState: Selection[], editOperations: editorCommon.IIdentifiedSingleEditOperation[], cursorStateComputer: editorCommon.ICursorStateComputer): Selection[] {
		if (this._options.trimAutoWhitespace && this._trimAutoWhitespaceLines) {
			// Go through each saved line number and insert a trim whitespace edit
			// if it is safe to do so (no conflicts with other edits).

			let incomingEdits = editOperations.map((op) => {
				return {
					range: this.validateRange(op.range),
					text: op.text
				};
			});

			// Sometimes, auto-formatters change ranges automatically which can cause undesired auto whitespace trimming near the cursor
			// We'll use the following heuristic: if the edits occur near the cursor, then it's ok to trim auto whitespace
			let editsAreNearCursors = true;
			for (let i = 0, len = beforeCursorState.length; i < len; i++) {
				let sel = beforeCursorState[i];
				let foundEditNearSel = false;
				for (let j = 0, lenJ = incomingEdits.length; j < lenJ; j++) {
					let editRange = incomingEdits[j].range;
					let selIsAbove = editRange.startLineNumber > sel.endLineNumber;
					let selIsBelow = sel.startLineNumber > editRange.endLineNumber;
					if (!selIsAbove && !selIsBelow) {
						foundEditNearSel = true;
						break;
					}
				}
				if (!foundEditNearSel) {
					editsAreNearCursors = false;
					break;
				}
			}

			if (editsAreNearCursors) {
				for (let i = 0, len = this._trimAutoWhitespaceLines.length; i < len; i++) {
					let trimLineNumber = this._trimAutoWhitespaceLines[i];
					let maxLineColumn = this.getLineMaxColumn(trimLineNumber);

					let allowTrimLine = true;
					for (let j = 0, lenJ = incomingEdits.length; j < lenJ; j++) {
						let editRange = incomingEdits[j].range;
						let editText = incomingEdits[j].text;

						if (trimLineNumber < editRange.startLineNumber || trimLineNumber > editRange.endLineNumber) {
							// `trimLine` is completely outside this edit
							continue;
						}

						// At this point:
						//   editRange.startLineNumber <= trimLine <= editRange.endLineNumber

						if (
							trimLineNumber === editRange.startLineNumber && editRange.startColumn === maxLineColumn
							&& editRange.isEmpty() && editText && editText.length > 0 && editText.charAt(0) === '\n'
						) {
							// This edit inserts a new line (and maybe other text) after `trimLine`
							continue;
						}

						// Looks like we can't trim this line as it would interfere with an incoming edit
						allowTrimLine = false;
						break;
					}

					if (allowTrimLine) {
						editOperations.push({
							identifier: null,
							range: new Range(trimLineNumber, 1, trimLineNumber, maxLineColumn),
							text: null,
							forceMoveMarkers: false,
							isAutoWhitespaceEdit: false
						});
					}

				}
			}

			this._trimAutoWhitespaceLines = null;
		}
		return this._commandManager.pushEditOperation(beforeCursorState, editOperations, cursorStateComputer);
	}

	public applyEdits(rawOperations: editorCommon.IIdentifiedSingleEditOperation[]): editorCommon.IIdentifiedSingleEditOperation[] {
		try {
			this._eventEmitter.beginDeferredEmit();
			this._onDidChangeDecorations.beginDeferredEmit();
			return this._applyEdits(rawOperations);
		} finally {
			this._onDidChangeDecorations.endDeferredEmit();
			this._eventEmitter.endDeferredEmit();
		}
	}

	private _applyEdits(rawOperations: editorCommon.IIdentifiedSingleEditOperation[]): editorCommon.IIdentifiedSingleEditOperation[] {
		for (let i = 0, len = rawOperations.length; i < len; i++) {
			rawOperations[i].range = this.validateRange(rawOperations[i].range);
		}
		const result = this._buffer.applyEdits(rawOperations, this._options.trimAutoWhitespace);
		const rawContentChanges = result.rawChanges;
		const contentChanges = result.changes;
		this._trimAutoWhitespaceLines = result.trimAutoWhitespaceLineNumbers;

		if (rawContentChanges.length !== 0 || contentChanges.length !== 0) {
			for (let i = 0, len = contentChanges.length; i < len; i++) {
				const contentChange = contentChanges[i];
				this._tokens.applyEdits(contentChange.range, contentChange.lines);
				this._adjustDecorationsForEdit(contentChange.rangeOffset, contentChange.rangeLength, contentChange.text.length, contentChange.forceMoveMarkers);
			}

			this._increaseVersionId();

			this._emitContentChangedEvent(
				new ModelRawContentChangedEvent(
					rawContentChanges,
					this.getVersionId(),
					this._isUndoing,
					this._isRedoing
				),
				{
					changes: contentChanges,
					eol: this._buffer.getEOL(),
					versionId: this.getVersionId(),
					isUndoing: this._isUndoing,
					isRedoing: this._isRedoing,
					isFlush: false
				}
			);
		}

		if (this._tokens.hasLinesToTokenize(this._buffer)) {
			this._beginBackgroundTokenization();
		}

		return result.reverseEdits;
	}

	private _undo(): Selection[] {
		this._isUndoing = true;
		let r = this._commandManager.undo();
		this._isUndoing = false;

		if (!r) {
			return null;
		}

		this._overwriteAlternativeVersionId(r.recordedVersionId);

		return r.selections;
	}

	public undo(): Selection[] {
		try {
			this._eventEmitter.beginDeferredEmit();
			this._onDidChangeDecorations.beginDeferredEmit();
			return this._undo();
		} finally {
			this._onDidChangeDecorations.endDeferredEmit();
			this._eventEmitter.endDeferredEmit();
		}
	}

	private _redo(): Selection[] {
		this._isRedoing = true;
		let r = this._commandManager.redo();
		this._isRedoing = false;

		if (!r) {
			return null;
		}

		this._overwriteAlternativeVersionId(r.recordedVersionId);

		return r.selections;
	}

	public redo(): Selection[] {
		try {
			this._eventEmitter.beginDeferredEmit();
			this._onDidChangeDecorations.beginDeferredEmit();
			return this._redo();
		} finally {
			this._onDidChangeDecorations.endDeferredEmit();
			this._eventEmitter.endDeferredEmit();
		}
	}

	//#endregion
}
