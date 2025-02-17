/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from '../../../../../base/common/event.js';
import { Disposable, IDisposable, IReference, MutableDisposable, dispose } from '../../../../../base/common/lifecycle.js';
import { Mimes } from '../../../../../base/common/mime.js';
import { ICodeEditor } from '../../../../../editor/browser/editorBrowser.js';
import { ICodeEditorService } from '../../../../../editor/browser/services/codeEditorService.js';
import { IEditorCommentsOptions } from '../../../../../editor/common/config/editorOptions.js';
import { IPosition } from '../../../../../editor/common/core/position.js';
import { IRange, Range } from '../../../../../editor/common/core/range.js';
import { Selection } from '../../../../../editor/common/core/selection.js';
import * as editorCommon from '../../../../../editor/common/editorCommon.js';
import * as model from '../../../../../editor/common/model.js';
import { SearchParams } from '../../../../../editor/common/model/textModelSearch.js';
import { IResolvedTextEditorModel, ITextModelService } from '../../../../../editor/common/services/resolverService.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IUndoRedoService } from '../../../../../platform/undoRedo/common/undoRedo.js';
import { IWordWrapTransientState, readTransientState, writeTransientState } from '../../../codeEditor/browser/toggleWordWrap.js';
import { CellEditState, CellFocusMode, CellLayoutChangeEvent, CursorAtBoundary, CursorAtLineBoundary, IEditableCellViewModel, INotebookCellDecorationOptions } from '../notebookBrowser.js';
import { NotebookOptionsChangeEvent } from '../notebookOptions.js';
import { CellViewModelStateChangeEvent } from '../notebookViewEvents.js';
import { ViewContext } from './viewContext.js';
import { NotebookCellTextModel } from '../../common/model/notebookCellTextModel.js';
import { CellKind, INotebookCellStatusBarItem, INotebookFindOptions } from '../../common/notebookCommon.js';
import { IInlineChatSessionService } from '../../../inlineChat/browser/inlineChatSessionService.js';

export abstract class BaseCellViewModel extends Disposable {

	protected readonly _onDidChangeEditorAttachState = this._register(new Emitter<void>());
	// Do not merge this event with `onDidChangeState` as we are using `Event.once(onDidChangeEditorAttachState)` elsewhere.
	readonly onDidChangeEditorAttachState = this._onDidChangeEditorAttachState.event;
	protected readonly _onDidChangeState = this._register(new Emitter<CellViewModelStateChangeEvent>());
	public readonly onDidChangeState: Event<CellViewModelStateChangeEvent> = this._onDidChangeState.event;

	get handle() {
		return this.model.handle;
	}
	get uri() {
		return this.model.uri;
	}
	get lineCount() {
		return this.model.textBuffer.getLineCount();
	}
	get metadata() {
		return this.model.metadata;
	}
	get internalMetadata() {
		return this.model.internalMetadata;
	}
	get language() {
		return this.model.language;
	}

	get mime(): string {
		if (typeof this.model.mime === 'string') {
			return this.model.mime;
		}

		switch (this.language) {
			case 'markdown':
				return Mimes.markdown;

			default:
				return Mimes.text;
		}
	}

	abstract cellKind: CellKind;

	private _editState: CellEditState = CellEditState.Preview;

	private _lineNumbers: 'on' | 'off' | 'inherit' = 'inherit';
	get lineNumbers(): 'on' | 'off' | 'inherit' {
		return this._lineNumbers;
	}

	set lineNumbers(lineNumbers: 'on' | 'off' | 'inherit') {
		if (lineNumbers === this._lineNumbers) {
			return;
		}

		this._lineNumbers = lineNumbers;
		this._onDidChangeState.fire({ cellLineNumberChanged: true });
	}

	private _commentOptions: IEditorCommentsOptions;
	public get commentOptions(): IEditorCommentsOptions {
		return this._commentOptions;
	}

	public set commentOptions(newOptions: IEditorCommentsOptions) {
		this._commentOptions = newOptions;
	}

	private _focusMode: CellFocusMode = CellFocusMode.Container;
	get focusMode() {
		return this._focusMode;
	}
	set focusMode(newMode: CellFocusMode) {
		if (this._focusMode !== newMode) {
			this._focusMode = newMode;
			this._onDidChangeState.fire({ focusModeChanged: true });
		}
	}

	protected _textEditor?: ICodeEditor;
	get editorAttached(): boolean {
		return !!this._textEditor;
	}
	private _editorListeners: IDisposable[] = [];
	private _editorViewStates: editorCommon.ICodeEditorViewState | null = null;
	private _editorTransientState: IWordWrapTransientState | null = null;
	private _resolvedCellDecorations = new Map<string, INotebookCellDecorationOptions>();
	private readonly _textModelRefChangeDisposable = this._register(new MutableDisposable());

	private readonly _cellDecorationsChanged = this._register(new Emitter<{ added: INotebookCellDecorationOptions[]; removed: INotebookCellDecorationOptions[] }>());
	onCellDecorationsChanged: Event<{ added: INotebookCellDecorationOptions[]; removed: INotebookCellDecorationOptions[] }> = this._cellDecorationsChanged.event;

	private _resolvedDecorations = new Map<string, {
		id?: string;
		options: model.IModelDeltaDecoration;
	}>();
	private _lastDecorationId: number = 0;

	private _cellStatusBarItems = new Map<string, INotebookCellStatusBarItem>();
	private readonly _onDidChangeCellStatusBarItems = this._register(new Emitter<void>());
	readonly onDidChangeCellStatusBarItems: Event<void> = this._onDidChangeCellStatusBarItems.event;
	private _lastStatusBarId: number = 0;

	get textModel(): model.ITextModel | undefined {
		return this.model.textModel;
	}

	hasModel(): this is IEditableCellViewModel {
		return !!this.textModel;
	}

	private _dragging: boolean = false;
	get dragging(): boolean {
		return this._dragging;
	}

	set dragging(v: boolean) {
		this._dragging = v;
		this._onDidChangeState.fire({ dragStateChanged: true });
	}

	protected _textModelRef: IReference<IResolvedTextEditorModel> | undefined;

	private _inputCollapsed: boolean = false;
	get isInputCollapsed(): boolean {
		return this._inputCollapsed;
	}
	set isInputCollapsed(v: boolean) {
		this._inputCollapsed = v;
		this._onDidChangeState.fire({ inputCollapsedChanged: true });
	}

	private _outputCollapsed: boolean = false;
	get isOutputCollapsed(): boolean {
		return this._outputCollapsed;
	}
	set isOutputCollapsed(v: boolean) {
		this._outputCollapsed = v;
		this._onDidChangeState.fire({ outputCollapsedChanged: true });
	}

	protected _commentHeight = 0;

	set commentHeight(height: number) {
		if (this._commentHeight === height) {
			return;
		}
		this._commentHeight = height;
		this.layoutChange({ commentHeight: true }, 'BaseCellViewModel#commentHeight');
	}

	private _isDisposed = false;
	private _isReadonly = false;

	constructor(
		readonly viewType: string,
		readonly model: NotebookCellTextModel,
		public id: string,
		private readonly _viewContext: ViewContext,
		private readonly _configurationService: IConfigurationService,
		private readonly _modelService: ITextModelService,
		private readonly _undoRedoService: IUndoRedoService,
		private readonly _codeEditorService: ICodeEditorService,
		private readonly _inlineChatSessionService: IInlineChatSessionService
		// private readonly _keymapService: INotebookKeymapService
	) {
		super();

		this._register(model.onDidChangeMetadata(() => {
			this._onDidChangeState.fire({ metadataChanged: true });
		}));

		this._register(model.onDidChangeInternalMetadata(e => {
			this._onDidChangeState.fire({ internalMetadataChanged: true });
			if (e.lastRunSuccessChanged) {
				// Statusbar visibility may change
				this.layoutChange({});
			}
		}));

		this._register(this._configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration('notebook.lineNumbers')) {
				this.lineNumbers = 'inherit';
			}
		}));

		if (this.model.collapseState?.inputCollapsed) {
			this._inputCollapsed = true;
		}

		if (this.model.collapseState?.outputCollapsed) {
			this._outputCollapsed = true;
		}

		this._commentOptions = this._configurationService.getValue<IEditorCommentsOptions>('editor.comments', { overrideIdentifier: this.language });
		this._register(this._configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration('editor.comments')) {
				this._commentOptions = this._configurationService.getValue<IEditorCommentsOptions>('editor.comments', { overrideIdentifier: this.language });
			}
		}));
	}


	updateOptions(e: NotebookOptionsChangeEvent): void {
		if (this._textEditor && typeof e.readonly === 'boolean') {
			this._textEditor.updateOptions({ readOnly: e.readonly });
		}
		if (typeof e.readonly === 'boolean') {
			this._isReadonly = e.readonly;
		}
	}
	abstract getHeight(lineHeight: number): number;
	abstract onDeselect(): void;
	abstract layoutChange(change: CellLayoutChangeEvent, source?: string): void;

	assertTextModelAttached(): boolean {
		if (this.textModel && this._textEditor && this._textEditor.getModel() === this.textModel) {
			return true;
		}

		return false;
	}

	// private handleKeyDown(e: IKeyboardEvent) {
	// 	if (this.viewType === IPYNB_VIEW_TYPE && isWindows && e.ctrlKey && e.keyCode === KeyCode.Enter) {
	// 		this._keymapService.promptKeymapRecommendation();
	// 	}
	// }

	attachTextEditor(editor: ICodeEditor, estimatedHasHorizontalScrolling?: boolean) {
		if (!editor.hasModel()) {
			throw new Error('Invalid editor: model is missing');
		}

		if (this._textEditor === editor) {
			if (this._editorListeners.length === 0) {
				this._editorListeners.push(this._textEditor.onDidChangeCursorSelection(() => { this._onDidChangeState.fire({ selectionChanged: true }); }));
				// this._editorListeners.push(this._textEditor.onKeyDown(e => this.handleKeyDown(e)));
				this._onDidChangeState.fire({ selectionChanged: true });
			}
			return;
		}

		this._textEditor = editor;
		if (this._isReadonly) {
			editor.updateOptions({ readOnly: this._isReadonly });
		}
		if (this._editorViewStates) {
			this._restoreViewState(this._editorViewStates);
		} else {
			// If no real editor view state was persisted, restore a default state.
			// This forces the editor to measure its content width immediately.
			if (estimatedHasHorizontalScrolling) {
				this._restoreViewState({
					contributionsState: {},
					cursorState: [],
					viewState: {
						scrollLeft: 0,
						firstPosition: { lineNumber: 1, column: 1 },
						firstPositionDeltaTop: this._viewContext.notebookOptions.getLayoutConfiguration().editorTopPadding
					}
				});
			}
		}

		if (this._editorTransientState) {
			writeTransientState(editor.getModel(), this._editorTransientState, this._codeEditorService);
		}

		if (this._isDisposed) {
			// Restore View State could adjust the editor layout and trigger a list view update. The list view update might then dispose this view model.
			return;
		}

		editor.changeDecorations((accessor) => {
			this._resolvedDecorations.forEach((value, key) => {
				if (key.startsWith('_lazy_')) {
					// lazy ones
					const ret = accessor.addDecoration(value.options.range, value.options.options);
					this._resolvedDecorations.get(key)!.id = ret;
				}
				else {
					const ret = accessor.addDecoration(value.options.range, value.options.options);
					this._resolvedDecorations.get(key)!.id = ret;
				}
			});
		});

		this._editorListeners.push(editor.onDidChangeCursorSelection(() => { this._onDidChangeState.fire({ selectionChanged: true }); }));
		this._editorListeners.push(this._inlineChatSessionService.onWillStartSession((e) => {
			if (e === this._textEditor && this.textBuffer.getLength() === 0) {
				this.enableAutoLanguageDetection();
			}
		}));

		this._onDidChangeState.fire({ selectionChanged: true });
		this._onDidChangeEditorAttachState.fire();
	}

	detachTextEditor() {
		this.saveViewState();
		this.saveTransientState();
		// decorations need to be cleared first as editors can be resued.
		this._textEditor?.changeDecorations((accessor) => {
			this._resolvedDecorations.forEach(value => {
				const resolvedid = value.id;

				if (resolvedid) {
					accessor.removeDecoration(resolvedid);
				}
			});
		});

		this._textEditor = undefined;
		dispose(this._editorListeners);
		this._editorListeners = [];
		this._onDidChangeEditorAttachState.fire();

		if (this._textModelRef) {
			this._textModelRef.dispose();
			this._textModelRef = undefined;
		}
		this._textModelRefChangeDisposable.clear();
	}

	getText(): string {
		return this.model.getValue();
	}

	getAlternativeId(): number {
		return this.model.alternativeId;
	}

	getTextLength(): number {
		return this.model.getTextLength();
	}

	enableAutoLanguageDetection() {
		this.model.enableAutoLanguageDetection();
	}

	private saveViewState(): void {
		if (!this._textEditor) {
			return;
		}

		this._editorViewStates = this._textEditor.saveViewState();
	}

	private saveTransientState() {
		if (!this._textEditor || !this._textEditor.hasModel()) {
			return;
		}

		this._editorTransientState = readTransientState(this._textEditor.getModel(), this._codeEditorService);
	}

	saveEditorViewState() {
		if (this._textEditor) {
			this._editorViewStates = this._textEditor.saveViewState();
		}

		return this._editorViewStates;
	}

	restoreEditorViewState(editorViewStates: editorCommon.ICodeEditorViewState | null, totalHeight?: number) {
		this._editorViewStates = editorViewStates;
	}

	private _restoreViewState(state: editorCommon.ICodeEditorViewState | null): void {
		if (state) {
			this._textEditor?.restoreViewState(state);
		}
	}

	addModelDecoration(decoration: model.IModelDeltaDecoration): string {
		if (!this._textEditor) {
			const id = ++this._lastDecorationId;
			const decorationId = `_lazy_${this.id};${id}`;
			this._resolvedDecorations.set(decorationId, { options: decoration });
			return decorationId;
		}

		let id: string;
		this._textEditor.changeDecorations((accessor) => {
			id = accessor.addDecoration(decoration.range, decoration.options);
			this._resolvedDecorations.set(id, { id, options: decoration });
		});
		return id!;
	}

	removeModelDecoration(decorationId: string) {
		const realDecorationId = this._resolvedDecorations.get(decorationId);

		if (this._textEditor && realDecorationId && realDecorationId.id !== undefined) {
			this._textEditor.changeDecorations((accessor) => {
				accessor.removeDecoration(realDecorationId.id!);
			});
		}

		// lastly, remove all the cache
		this._resolvedDecorations.delete(decorationId);
	}

	deltaModelDecorations(oldDecorations: readonly string[], newDecorations: readonly model.IModelDeltaDecoration[]): string[] {
		oldDecorations.forEach(id => {
			this.removeModelDecoration(id);
		});

		const ret = newDecorations.map(option => {
			return this.addModelDecoration(option);
		});

		return ret;
	}

	private _removeCellDecoration(decorationId: string) {
		const options = this._resolvedCellDecorations.get(decorationId);
		this._resolvedCellDecorations.delete(decorationId);

		if (options) {
			for (const existingOptions of this._resolvedCellDecorations.values()) {
				// don't remove decorations that are applied from other entries
				if (options.className === existingOptions.className) {
					options.className = undefined;
				}
				if (options.outputClassName === existingOptions.outputClassName) {
					options.outputClassName = undefined;
				}
				if (options.gutterClassName === existingOptions.gutterClassName) {
					options.gutterClassName = undefined;
				}
				if (options.topClassName === existingOptions.topClassName) {
					options.topClassName = undefined;
				}
			}

			this._cellDecorationsChanged.fire({ added: [], removed: [options] });
		}
	}

	private _addCellDecoration(options: INotebookCellDecorationOptions): string {
		const id = ++this._lastDecorationId;
		const decorationId = `_cell_${this.id};${id}`;
		this._resolvedCellDecorations.set(decorationId, options);
		this._cellDecorationsChanged.fire({ added: [options], removed: [] });
		return decorationId;
	}

	getCellDecorations() {
		return [...this._resolvedCellDecorations.values()];
	}

	getCellDecorationRange(decorationId: string): Range | null {
		if (this._textEditor) {
			// (this._textEditor as CodeEditorWidget).decora
			return this._textEditor.getModel()?.getDecorationRange(decorationId) ?? null;
		}

		return null;
	}

	deltaCellDecorations(oldDecorations: string[], newDecorations: INotebookCellDecorationOptions[]): string[] {
		oldDecorations.forEach(id => {
			this._removeCellDecoration(id);
		});

		const ret = newDecorations.map(option => {
			return this._addCellDecoration(option);
		});

		return ret;
	}

	deltaCellStatusBarItems(oldItems: readonly string[], newItems: readonly INotebookCellStatusBarItem[]): string[] {
		oldItems.forEach(id => {
			const item = this._cellStatusBarItems.get(id);
			if (item) {
				this._cellStatusBarItems.delete(id);
			}
		});

		const newIds = newItems.map(item => {
			const id = ++this._lastStatusBarId;
			const itemId = `_cell_${this.id};${id}`;
			this._cellStatusBarItems.set(itemId, item);
			return itemId;
		});

		this._onDidChangeCellStatusBarItems.fire();

		return newIds;
	}

	getCellStatusBarItems(): INotebookCellStatusBarItem[] {
		return Array.from(this._cellStatusBarItems.values());
	}

	revealRangeInCenter(range: Range) {
		this._textEditor?.revealRangeInCenter(range, editorCommon.ScrollType.Immediate);
	}

	setSelection(range: Range) {
		this._textEditor?.setSelection(range);
	}

	setSelections(selections: Selection[]) {
		if (selections.length) {
			if (this._textEditor) {
				this._textEditor?.setSelections(selections);
			} else if (this._editorViewStates) {
				this._editorViewStates.cursorState = selections.map(selection => {
					return {
						inSelectionMode: !selection.isEmpty(),
						selectionStart: selection.getStartPosition(),
						position: selection.getEndPosition(),
					};
				});
			}
		}
	}

	getSelections() {
		return this._textEditor?.getSelections()
			?? this._editorViewStates?.cursorState.map(state => new Selection(state.selectionStart.lineNumber, state.selectionStart.column, state.position.lineNumber, state.position.column))
			?? [];
	}

	getSelectionsStartPosition(): IPosition[] | undefined {
		if (this._textEditor) {
			const selections = this._textEditor.getSelections();
			return selections?.map(s => s.getStartPosition());
		} else {
			const selections = this._editorViewStates?.cursorState;
			return selections?.map(s => s.selectionStart);
		}
	}

	getLineScrollTopOffset(line: number): number {
		if (!this._textEditor) {
			return 0;
		}

		const editorPadding = this._viewContext.notebookOptions.computeEditorPadding(this.internalMetadata, this.uri);
		return this._textEditor.getTopForLineNumber(line) + editorPadding.top;
	}

	getPositionScrollTopOffset(range: Selection | Range): number {
		if (!this._textEditor) {
			return 0;
		}


		const position = range instanceof Selection ? range.getPosition() : range.getStartPosition();

		const editorPadding = this._viewContext.notebookOptions.computeEditorPadding(this.internalMetadata, this.uri);
		return this._textEditor.getTopForPosition(position.lineNumber, position.column) + editorPadding.top;
	}

	cursorAtLineBoundary(): CursorAtLineBoundary {
		if (!this._textEditor || !this.textModel || !this._textEditor.hasTextFocus()) {
			return CursorAtLineBoundary.None;
		}

		const selection = this._textEditor.getSelection();

		if (!selection || !selection.isEmpty()) {
			return CursorAtLineBoundary.None;
		}

		const currentLineLength = this.textModel.getLineLength(selection.startLineNumber);

		if (currentLineLength === 0) {
			return CursorAtLineBoundary.Both;
		}

		switch (selection.startColumn) {
			case 1:
				return CursorAtLineBoundary.Start;
			case currentLineLength + 1:
				return CursorAtLineBoundary.End;
			default:
				return CursorAtLineBoundary.None;
		}
	}

	cursorAtBoundary(): CursorAtBoundary {
		if (!this._textEditor) {
			return CursorAtBoundary.None;
		}

		if (!this.textModel) {
			return CursorAtBoundary.None;
		}

		// only validate primary cursor
		const selection = this._textEditor.getSelection();

		// only validate empty cursor
		if (!selection || !selection.isEmpty()) {
			return CursorAtBoundary.None;
		}

		const firstViewLineTop = this._textEditor.getTopForPosition(1, 1);
		const lastViewLineTop = this._textEditor.getTopForPosition(this.textModel.getLineCount(), this.textModel.getLineLength(this.textModel.getLineCount()));
		const selectionTop = this._textEditor.getTopForPosition(selection.startLineNumber, selection.startColumn);

		if (selectionTop === lastViewLineTop) {
			if (selectionTop === firstViewLineTop) {
				return CursorAtBoundary.Both;
			} else {
				return CursorAtBoundary.Bottom;
			}
		} else {
			if (selectionTop === firstViewLineTop) {
				return CursorAtBoundary.Top;
			} else {
				return CursorAtBoundary.None;
			}
		}
	}

	private _editStateSource: string = '';

	get editStateSource(): string {
		return this._editStateSource;
	}

	updateEditState(newState: CellEditState, source: string) {
		this._editStateSource = source;
		if (newState === this._editState) {
			return;
		}

		this._editState = newState;
		this._onDidChangeState.fire({ editStateChanged: true });
		if (this._editState === CellEditState.Preview) {
			this.focusMode = CellFocusMode.Container;
		}
	}

	getEditState() {
		return this._editState;
	}

	get textBuffer() {
		return this.model.textBuffer;
	}

	/**
	 * Text model is used for editing.
	 */
	async resolveTextModel(): Promise<model.ITextModel> {
		if (!this._textModelRef || !this.textModel) {
			this._textModelRef = await this._modelService.createModelReference(this.uri);
			if (this._isDisposed) {
				return this.textModel!;
			}

			if (!this._textModelRef) {
				throw new Error(`Cannot resolve text model for ${this.uri}`);
			}
			this._textModelRefChangeDisposable.value = this.textModel!.onDidChangeContent(() => this.onDidChangeTextModelContent());
		}

		return this.textModel!;
	}

	protected abstract onDidChangeTextModelContent(): void;

	protected cellStartFind(value: string, options: INotebookFindOptions): model.FindMatch[] | null {
		let cellMatches: model.FindMatch[] = [];

		const lineCount = this.textBuffer.getLineCount();
		const findRange: IRange[] = options.findScope?.selectedTextRanges ?? [new Range(1, 1, lineCount, this.textBuffer.getLineLength(lineCount) + 1)];

		if (this.assertTextModelAttached()) {
			cellMatches = this.textModel!.findMatches(
				value,
				findRange,
				options.regex || false,
				options.caseSensitive || false,
				options.wholeWord ? options.wordSeparators || null : null,
				options.regex || false);
		} else {
			const searchParams = new SearchParams(value, options.regex || false, options.caseSensitive || false, options.wholeWord ? options.wordSeparators || null : null,);
			const searchData = searchParams.parseSearchRequest();

			if (!searchData) {
				return null;
			}

			findRange.forEach(range => {
				cellMatches.push(...this.textBuffer.findMatchesLineByLine(new Range(range.startLineNumber, range.startColumn, range.endLineNumber, range.endColumn), searchData, options.regex || false, 1000));
			});
		}

		return cellMatches;
	}

	override dispose() {
		this._isDisposed = true;
		super.dispose();

		dispose(this._editorListeners);

		// Only remove the undo redo stack if we map this cell uri to itself
		// If we are not in perCell mode, it will map to the full NotebookDocument and
		// we don't want to remove that entire document undo / redo stack when a cell is deleted
		if (this._undoRedoService.getUriComparisonKey(this.uri) === this.uri.toString()) {
			this._undoRedoService.removeElements(this.uri);
		}

		this._textModelRef?.dispose();
	}

	toJSON(): object {
		return {
			handle: this.handle
		};
	}
}
