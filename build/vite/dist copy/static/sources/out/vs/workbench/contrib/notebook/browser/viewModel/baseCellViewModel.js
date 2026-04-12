/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { Emitter } from '../../../../../base/common/event.js';
import { Disposable, MutableDisposable, dispose } from '../../../../../base/common/lifecycle.js';
import { Mimes } from '../../../../../base/common/mime.js';
import { Range } from '../../../../../editor/common/core/range.js';
import { Selection } from '../../../../../editor/common/core/selection.js';
import { SearchParams } from '../../../../../editor/common/model/textModelSearch.js';
import { readTransientState, writeTransientState } from '../../../codeEditor/browser/toggleWordWrap.js';
import { CellEditState, CellFocusMode, CursorAtBoundary, CursorAtLineBoundary } from '../notebookBrowser.js';
export class BaseCellViewModel extends Disposable {
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
    get mime() {
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
    get lineNumbers() {
        return this._lineNumbers;
    }
    set lineNumbers(lineNumbers) {
        if (lineNumbers === this._lineNumbers) {
            return;
        }
        this._lineNumbers = lineNumbers;
        this._onDidChangeState.fire({ cellLineNumberChanged: true });
    }
    get commentOptions() {
        return this._commentOptions;
    }
    set commentOptions(newOptions) {
        this._commentOptions = newOptions;
    }
    get focusMode() {
        return this._focusMode;
    }
    set focusMode(newMode) {
        if (this._focusMode !== newMode) {
            this._focusMode = newMode;
            this._onDidChangeState.fire({ focusModeChanged: true });
        }
    }
    get editorAttached() {
        return !!this._textEditor;
    }
    get textModel() {
        return this.model.textModel;
    }
    hasModel() {
        return !!this.textModel;
    }
    get dragging() {
        return this._dragging;
    }
    set dragging(v) {
        this._dragging = v;
        this._onDidChangeState.fire({ dragStateChanged: true });
    }
    get isInputCollapsed() {
        return this._inputCollapsed;
    }
    set isInputCollapsed(v) {
        this._inputCollapsed = v;
        this._onDidChangeState.fire({ inputCollapsedChanged: true });
    }
    get isOutputCollapsed() {
        return this._outputCollapsed;
    }
    set isOutputCollapsed(v) {
        this._outputCollapsed = v;
        this._onDidChangeState.fire({ outputCollapsedChanged: true });
    }
    set commentHeight(height) {
        if (this._commentHeight === height) {
            return;
        }
        this._commentHeight = height;
        this.layoutChange({ commentHeight: true }, 'BaseCellViewModel#commentHeight');
    }
    constructor(viewType, model, id, _viewContext, _configurationService, _modelService, _undoRedoService, _codeEditorService, _inlineChatSessionService
    // private readonly _keymapService: INotebookKeymapService
    ) {
        super();
        this.viewType = viewType;
        this.model = model;
        this.id = id;
        this._viewContext = _viewContext;
        this._configurationService = _configurationService;
        this._modelService = _modelService;
        this._undoRedoService = _undoRedoService;
        this._codeEditorService = _codeEditorService;
        this._inlineChatSessionService = _inlineChatSessionService;
        this._onDidChangeEditorAttachState = this._register(new Emitter());
        // Do not merge this event with `onDidChangeState` as we are using `Event.once(onDidChangeEditorAttachState)` elsewhere.
        this.onDidChangeEditorAttachState = this._onDidChangeEditorAttachState.event;
        this._onDidChangeState = this._register(new Emitter());
        this.onDidChangeState = this._onDidChangeState.event;
        this._editState = CellEditState.Preview;
        this._lineNumbers = 'inherit';
        this._focusMode = CellFocusMode.Container;
        this._editorListeners = [];
        this._editorViewStates = null;
        this._editorTransientState = null;
        this._resolvedCellDecorations = new Map();
        this._textModelRefChangeDisposable = this._register(new MutableDisposable());
        this._cellDecorationsChanged = this._register(new Emitter());
        this.onCellDecorationsChanged = this._cellDecorationsChanged.event;
        this._resolvedDecorations = new Map();
        this._lastDecorationId = 0;
        this._cellStatusBarItems = new Map();
        this._onDidChangeCellStatusBarItems = this._register(new Emitter());
        this.onDidChangeCellStatusBarItems = this._onDidChangeCellStatusBarItems.event;
        this._lastStatusBarId = 0;
        this._dragging = false;
        this._inputCollapsed = false;
        this._outputCollapsed = false;
        this._commentHeight = 0;
        this._isDisposed = false;
        this._isReadonly = false;
        this._editStateSource = '';
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
        this._commentOptions = this._configurationService.getValue('editor.comments', { overrideIdentifier: this.language });
        this._register(this._configurationService.onDidChangeConfiguration(e => {
            if (e.affectsConfiguration('editor.comments')) {
                this._commentOptions = this._configurationService.getValue('editor.comments', { overrideIdentifier: this.language });
            }
        }));
    }
    updateOptions(e) {
        if (this._textEditor && typeof e.readonly === 'boolean') {
            this._textEditor.updateOptions({ readOnly: e.readonly });
        }
        if (typeof e.readonly === 'boolean') {
            this._isReadonly = e.readonly;
        }
    }
    assertTextModelAttached() {
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
    attachTextEditor(editor, estimatedHasHorizontalScrolling) {
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
        }
        else {
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
                    this._resolvedDecorations.get(key).id = ret;
                }
                else {
                    const ret = accessor.addDecoration(value.options.range, value.options.options);
                    this._resolvedDecorations.get(key).id = ret;
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
    getText() {
        return this.model.getValue();
    }
    getAlternativeId() {
        return this.model.alternativeId;
    }
    getTextLength() {
        return this.model.getTextLength();
    }
    enableAutoLanguageDetection() {
        this.model.enableAutoLanguageDetection();
    }
    saveViewState() {
        if (!this._textEditor) {
            return;
        }
        this._editorViewStates = this._textEditor.saveViewState();
    }
    saveTransientState() {
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
    restoreEditorViewState(editorViewStates, totalHeight) {
        this._editorViewStates = editorViewStates;
    }
    _restoreViewState(state) {
        if (state) {
            this._textEditor?.restoreViewState(state);
        }
    }
    addModelDecoration(decoration) {
        if (!this._textEditor) {
            const id = ++this._lastDecorationId;
            const decorationId = `_lazy_${this.id};${id}`;
            this._resolvedDecorations.set(decorationId, { options: decoration });
            return decorationId;
        }
        let id;
        this._textEditor.changeDecorations((accessor) => {
            id = accessor.addDecoration(decoration.range, decoration.options);
            this._resolvedDecorations.set(id, { id, options: decoration });
        });
        return id;
    }
    removeModelDecoration(decorationId) {
        const realDecorationId = this._resolvedDecorations.get(decorationId);
        if (this._textEditor && realDecorationId && realDecorationId.id !== undefined) {
            this._textEditor.changeDecorations((accessor) => {
                accessor.removeDecoration(realDecorationId.id);
            });
        }
        // lastly, remove all the cache
        this._resolvedDecorations.delete(decorationId);
    }
    deltaModelDecorations(oldDecorations, newDecorations) {
        oldDecorations.forEach(id => {
            this.removeModelDecoration(id);
        });
        const ret = newDecorations.map(option => {
            return this.addModelDecoration(option);
        });
        return ret;
    }
    _removeCellDecoration(decorationId) {
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
    _addCellDecoration(options) {
        const id = ++this._lastDecorationId;
        const decorationId = `_cell_${this.id};${id}`;
        this._resolvedCellDecorations.set(decorationId, options);
        this._cellDecorationsChanged.fire({ added: [options], removed: [] });
        return decorationId;
    }
    getCellDecorations() {
        return [...this._resolvedCellDecorations.values()];
    }
    getCellDecorationRange(decorationId) {
        if (this._textEditor) {
            // (this._textEditor as CodeEditorWidget).decora
            return this._textEditor.getModel()?.getDecorationRange(decorationId) ?? null;
        }
        return null;
    }
    deltaCellDecorations(oldDecorations, newDecorations) {
        oldDecorations.forEach(id => {
            this._removeCellDecoration(id);
        });
        const ret = newDecorations.map(option => {
            return this._addCellDecoration(option);
        });
        return ret;
    }
    deltaCellStatusBarItems(oldItems, newItems) {
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
    getCellStatusBarItems() {
        return Array.from(this._cellStatusBarItems.values());
    }
    revealRangeInCenter(range) {
        this._textEditor?.revealRangeInCenter(range, 1 /* editorCommon.ScrollType.Immediate */);
    }
    setSelection(range) {
        this._textEditor?.setSelection(range);
    }
    setSelections(selections) {
        if (selections.length) {
            if (this._textEditor) {
                this._textEditor?.setSelections(selections);
            }
            else if (this._editorViewStates) {
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
    getSelectionsStartPosition() {
        if (this._textEditor) {
            const selections = this._textEditor.getSelections();
            return selections?.map(s => s.getStartPosition());
        }
        else {
            const selections = this._editorViewStates?.cursorState;
            return selections?.map(s => s.selectionStart);
        }
    }
    getLineScrollTopOffset(line) {
        if (!this._textEditor) {
            return 0;
        }
        const editorPadding = this._viewContext.notebookOptions.computeEditorPadding(this.internalMetadata, this.uri);
        return this._textEditor.getTopForLineNumber(line) + editorPadding.top;
    }
    getPositionScrollTopOffset(range) {
        if (!this._textEditor) {
            return 0;
        }
        const position = range instanceof Selection ? range.getPosition() : range.getStartPosition();
        const editorPadding = this._viewContext.notebookOptions.computeEditorPadding(this.internalMetadata, this.uri);
        return this._textEditor.getTopForPosition(position.lineNumber, position.column) + editorPadding.top;
    }
    cursorAtLineBoundary() {
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
    cursorAtBoundary() {
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
            }
            else {
                return CursorAtBoundary.Bottom;
            }
        }
        else {
            if (selectionTop === firstViewLineTop) {
                return CursorAtBoundary.Top;
            }
            else {
                return CursorAtBoundary.None;
            }
        }
    }
    get editStateSource() {
        return this._editStateSource;
    }
    updateEditState(newState, source) {
        if (newState === this._editState) {
            return;
        }
        this._editStateSource = source;
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
    async resolveTextModel() {
        if (!this._textModelRef || !this.textModel) {
            this._textModelRef = await this._modelService.createModelReference(this.uri);
            if (this._isDisposed) {
                return this.textModel;
            }
            if (!this._textModelRef) {
                throw new Error(`Cannot resolve text model for ${this.uri}`);
            }
            this._textModelRefChangeDisposable.value = this.textModel.onDidChangeContent(() => this.onDidChangeTextModelContent());
        }
        return this.textModel;
    }
    cellStartFind(value, options) {
        let cellMatches = [];
        const lineCount = this.textBuffer.getLineCount();
        const findRange = options.findScope?.selectedTextRanges ?? [new Range(1, 1, lineCount, this.textBuffer.getLineLength(lineCount) + 1)];
        if (this.assertTextModelAttached()) {
            cellMatches = this.textModel.findMatches(value, findRange, options.regex || false, options.caseSensitive || false, options.wholeWord ? options.wordSeparators || null : null, options.regex || false);
        }
        else {
            const searchParams = new SearchParams(value, options.regex || false, options.caseSensitive || false, options.wholeWord ? options.wordSeparators || null : null);
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
    dispose() {
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
    toJSON() {
        return {
            handle: this.handle
        };
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYmFzZUNlbGxWaWV3TW9kZWwuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi9ub3RlYm9vay9icm93c2VyL3ZpZXdNb2RlbC9iYXNlQ2VsbFZpZXdNb2RlbC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRyxPQUFPLEVBQUUsT0FBTyxFQUFTLE1BQU0scUNBQXFDLENBQUM7QUFDckUsT0FBTyxFQUFFLFVBQVUsRUFBMkIsaUJBQWlCLEVBQUUsT0FBTyxFQUFFLE1BQU0seUNBQXlDLENBQUM7QUFDMUgsT0FBTyxFQUFFLEtBQUssRUFBRSxNQUFNLG9DQUFvQyxDQUFDO0FBSzNELE9BQU8sRUFBVSxLQUFLLEVBQUUsTUFBTSw0Q0FBNEMsQ0FBQztBQUMzRSxPQUFPLEVBQUUsU0FBUyxFQUFFLE1BQU0sZ0RBQWdELENBQUM7QUFHM0UsT0FBTyxFQUFFLFlBQVksRUFBRSxNQUFNLHVEQUF1RCxDQUFDO0FBSXJGLE9BQU8sRUFBMkIsa0JBQWtCLEVBQUUsbUJBQW1CLEVBQUUsTUFBTSwrQ0FBK0MsQ0FBQztBQUNqSSxPQUFPLEVBQUUsYUFBYSxFQUFFLGFBQWEsRUFBeUIsZ0JBQWdCLEVBQUUsb0JBQW9CLEVBQTBELE1BQU0sdUJBQXVCLENBQUM7QUFRNUwsTUFBTSxPQUFnQixpQkFBa0IsU0FBUSxVQUFVO0lBUXpELElBQUksTUFBTTtRQUNULE9BQU8sSUFBSSxDQUFDLEtBQUssQ0FBQyxNQUFNLENBQUM7SUFDMUIsQ0FBQztJQUNELElBQUksR0FBRztRQUNOLE9BQU8sSUFBSSxDQUFDLEtBQUssQ0FBQyxHQUFHLENBQUM7SUFDdkIsQ0FBQztJQUNELElBQUksU0FBUztRQUNaLE9BQU8sSUFBSSxDQUFDLEtBQUssQ0FBQyxVQUFVLENBQUMsWUFBWSxFQUFFLENBQUM7SUFDN0MsQ0FBQztJQUNELElBQUksUUFBUTtR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