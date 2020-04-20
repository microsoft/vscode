/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationTokenSource } from 'vs/base/common/cancellation';
import { Emitter, Event } from 'vs/base/common/event';
import { Disposable, IDisposable } from 'vs/base/common/lifecycle';
import { ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { Range } from 'vs/editor/common/core/range';
import * as editorCommon from 'vs/editor/common/editorCommon';
import * as model from 'vs/editor/common/model';
import { SearchParams } from 'vs/editor/common/model/textModelSearch';
import { EDITOR_TOOLBAR_HEIGHT, EDITOR_TOP_MARGIN } from 'vs/workbench/contrib/notebook/browser/constants';
import { CellEditState, CellFocusMode, CellRunState, CursorAtBoundary, ICellViewModel, CellViewModelStateChangeEvent } from 'vs/workbench/contrib/notebook/browser/notebookBrowser';
import { CellKind, NotebookCellMetadata, NotebookDocumentMetadata } from 'vs/workbench/contrib/notebook/common/notebookCommon';
import { NotebookCellTextModel } from 'vs/workbench/contrib/notebook/common/model/notebookCellTextModel';

export const NotebookCellMetadataDefaults = {
	editable: true,
	runnable: true
};

export abstract class BaseCellViewModel extends Disposable implements ICellViewModel {
	protected readonly _onDidChangeEditorAttachState = new Emitter<void>();
	// Do not merge this event with `onDidChangeState` as we are using `Event.once(onDidChangeEditorAttachState)` elsewhere.
	readonly onDidChangeEditorAttachState = this._onDidChangeEditorAttachState.event;
	protected readonly _onDidChangeState: Emitter<CellViewModelStateChangeEvent> = this._register(new Emitter<CellViewModelStateChangeEvent>());
	public readonly onDidChangeState: Event<CellViewModelStateChangeEvent> = this._onDidChangeState.event;

	get handle() {
		return this.model.handle;
	}
	get uri() {
		return this.model.uri;
	}
	get lineCount() {
		return this.model.source.length;
	}
	get metadata() {
		return this.model.metadata;
	}
	get language() {
		return this.model.language;
	}

	abstract cellKind: CellKind;

	private _editState: CellEditState = CellEditState.Preview;

	get editState(): CellEditState {
		return this._editState;
	}

	set editState(newState: CellEditState) {
		if (newState === this._editState) {
			return;
		}

		this._editState = newState;
		this._onDidChangeState.fire({ editStateChanged: true });
	}

	// TODO - move any "run"/"status" concept to Code-specific places
	private _currentTokenSource: CancellationTokenSource | undefined;
	public set currentTokenSource(v: CancellationTokenSource | undefined) {
		this._currentTokenSource = v;
		this._onDidChangeState.fire({ runStateChanged: true });
	}

	public get currentTokenSource(): CancellationTokenSource | undefined {
		return this._currentTokenSource;
	}

	get runState(): CellRunState {
		return this._currentTokenSource ? CellRunState.Running : CellRunState.Idle;
	}

	private _focusMode: CellFocusMode = CellFocusMode.Container;
	get focusMode() {
		return this._focusMode;
	}
	set focusMode(newMode: CellFocusMode) {
		this._focusMode = newMode;
		this._onDidChangeState.fire({ focusModeChanged: true });
	}

	protected _textEditor?: ICodeEditor;
	get editorAttached(): boolean {
		return !!this._textEditor;
	}
	private _cursorChangeListener: IDisposable | null = null;
	private _editorViewStates: editorCommon.ICodeEditorViewState | null = null;
	private _resolvedDecorations = new Map<string, {
		id?: string;
		options: model.IModelDeltaDecoration;
	}>();
	private _lastDecorationId: number = 0;
	protected _textModel?: model.ITextModel;

	constructor(readonly viewType: string, readonly notebookHandle: number, readonly model: NotebookCellTextModel, public id: string) {
		super();

		this._register(model.onDidChangeLanguage(() => {
			this._onDidChangeState.fire({ languageChanged: true });
		}));

		this._register(model.onDidChangeMetadata(() => {
			this._onDidChangeState.fire({ metadataChanged: true });
		}));
	}

	abstract hasDynamicHeight(): boolean;
	abstract getHeight(lineHeight: number): number;
	abstract onDeselect(): void;

	assertTextModelAttached(): boolean {
		if (this._textModel && this._textEditor && this._textEditor.getModel() === this._textModel) {
			return true;
		}

		return false;
	}

	attachTextEditor(editor: ICodeEditor) {
		if (!editor.hasModel()) {
			throw new Error('Invalid editor: model is missing');
		}

		if (this._textEditor === editor) {
			if (this._cursorChangeListener === null) {
				this._cursorChangeListener = this._textEditor.onDidChangeCursorSelection(() => { this._onDidChangeState.fire({ selectionChanged: true }); });
				this._onDidChangeState.fire({ selectionChanged: true });
			}
			return;
		}

		this._textEditor = editor;

		if (this._editorViewStates) {
			this.restoreViewState(this._editorViewStates);
		}

		this._resolvedDecorations.forEach((value, key) => {
			if (key.startsWith('_lazy_')) {
				// lazy ones
				const ret = this._textEditor!.deltaDecorations([], [value.options]);
				this._resolvedDecorations.get(key)!.id = ret[0];
			}
			else {
				const ret = this._textEditor!.deltaDecorations([], [value.options]);
				this._resolvedDecorations.get(key)!.id = ret[0];
			}
		});

		this._cursorChangeListener = this._textEditor.onDidChangeCursorSelection(() => { this._onDidChangeState.fire({ selectionChanged: true }); });
		this._onDidChangeState.fire({ selectionChanged: true });
		this._onDidChangeEditorAttachState.fire();
	}

	detachTextEditor() {
		this._editorViewStates = this.saveViewState();
		// decorations need to be cleared first as editors can be resued.
		this._resolvedDecorations.forEach(value => {
			let resolvedid = value.id;

			if (resolvedid) {
				this._textEditor?.deltaDecorations([resolvedid], []);
			}
		});

		this._textEditor = undefined;
		this._cursorChangeListener?.dispose();
		this._cursorChangeListener = null;
		this._onDidChangeEditorAttachState.fire();
	}

	getText(): string {
		if (this._textModel) {
			return this._textModel.getValue();
		}

		return this.model.source.join('\n');
	}

	private saveViewState(): editorCommon.ICodeEditorViewState | null {
		if (!this._textEditor) {
			return null;
		}

		return this._textEditor.saveViewState();
	}

	saveEditorViewState() {
		if (this._textEditor) {
			this._editorViewStates = this.saveViewState();
		}

		return this._editorViewStates;
	}

	restoreEditorViewState(editorViewStates: editorCommon.ICodeEditorViewState | null, totalHeight?: number) {
		this._editorViewStates = editorViewStates;
	}

	private restoreViewState(state: editorCommon.ICodeEditorViewState | null): void {
		if (state) {
			this._textEditor?.restoreViewState(state);
		}
	}

	addDecoration(decoration: model.IModelDeltaDecoration): string {
		if (!this._textEditor) {
			const id = ++this._lastDecorationId;
			const decorationId = `_lazy_${this.id};${id}`;
			this._resolvedDecorations.set(decorationId, { options: decoration });
			return decorationId;
		}

		const result = this._textEditor.deltaDecorations([], [decoration]);
		this._resolvedDecorations.set(result[0], { id: result[0], options: decoration });
		return result[0];
	}

	removeDecoration(decorationId: string) {
		const realDecorationId = this._resolvedDecorations.get(decorationId);

		if (this._textEditor && realDecorationId && realDecorationId.id !== undefined) {
			this._textEditor.deltaDecorations([realDecorationId.id!], []);
		}

		// lastly, remove all the cache
		this._resolvedDecorations.delete(decorationId);
	}

	deltaDecorations(oldDecorations: string[], newDecorations: model.IModelDeltaDecoration[]): string[] {
		oldDecorations.forEach(id => {
			this.removeDecoration(id);
		});

		const ret = newDecorations.map(option => {
			return this.addDecoration(option);
		});

		return ret;
	}

	revealRangeInCenter(range: Range) {
		this._textEditor?.revealRangeInCenter(range, editorCommon.ScrollType.Immediate);
	}

	setSelection(range: Range) {
		this._textEditor?.setSelection(range);
	}

	getLineScrollTopOffset(line: number): number {
		if (!this._textEditor) {
			return 0;
		}

		return this._textEditor.getTopForLineNumber(line) + EDITOR_TOP_MARGIN + EDITOR_TOOLBAR_HEIGHT;
	}

	cursorAtBoundary(): CursorAtBoundary {
		if (!this._textEditor) {
			return CursorAtBoundary.None;
		}

		// only validate primary cursor
		const selection = this._textEditor.getSelection();

		// only validate empty cursor
		if (!selection || !selection.isEmpty()) {
			return CursorAtBoundary.None;
		}

		// we don't allow attaching text editor without a model
		const lineCnt = this._textEditor.getModel()!.getLineCount();

		if (selection.startLineNumber === lineCnt) {
			// bottom
			if (selection.startLineNumber === 1) {
				return CursorAtBoundary.Both;
			}
			else {
				return CursorAtBoundary.Bottom;
			}
		}

		if (selection.startLineNumber === 1) {
			return CursorAtBoundary.Top;
		}

		return CursorAtBoundary.None;
	}

	protected _buffer: model.ITextBuffer | null = null;

	protected cellStartFind(value: string): model.FindMatch[] | null {
		let cellMatches: model.FindMatch[] = [];

		if (this.assertTextModelAttached()) {
			cellMatches = this._textModel!.findMatches(value, false, false, false, null, false);
		} else {
			if (!this._buffer) {
				this._buffer = this.model.resolveTextBufferFactory().create(model.DefaultEndOfLine.LF);
			}

			const lineCount = this._buffer.getLineCount();
			const fullRange = new Range(1, 1, lineCount, this._buffer.getLineLength(lineCount) + 1);
			const searchParams = new SearchParams(value, false, false, null);
			const searchData = searchParams.parseSearchRequest();

			if (!searchData) {
				return null;
			}

			cellMatches = this._buffer.findMatchesLineByLine(fullRange, searchData, false, 1000);
		}

		return cellMatches;
	}

	getEvaluatedMetadata(documentMetadata: NotebookDocumentMetadata | undefined): NotebookCellMetadata {
		const editable: boolean = this.metadata?.editable === undefined
			? (documentMetadata?.cellEditable === undefined ? NotebookCellMetadataDefaults.editable : documentMetadata?.cellEditable)
			: this.metadata?.editable;

		const runnable: boolean = this.metadata?.runnable === undefined
			? (documentMetadata?.cellRunnable === undefined ? NotebookCellMetadataDefaults.runnable : documentMetadata?.cellRunnable)
			: this.metadata?.runnable;

		return {
			editable,
			runnable,
			executionOrder: this.metadata?.executionOrder,
			runState: this.metadata?.runState,
			statusMessage: this.metadata?.statusMessage
		};
	}

	toJSON(): any {
		return {
			handle: this.handle
		};
	}
}
