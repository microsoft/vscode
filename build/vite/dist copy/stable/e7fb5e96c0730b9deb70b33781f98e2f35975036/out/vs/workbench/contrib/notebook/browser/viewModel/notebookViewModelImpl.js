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
import { groupBy } from '../../../../../base/common/collections.js';
import { onUnexpectedError } from '../../../../../base/common/errors.js';
import { Emitter } from '../../../../../base/common/event.js';
import { Disposable, DisposableStore } from '../../../../../base/common/lifecycle.js';
import { clamp } from '../../../../../base/common/numbers.js';
import * as strings from '../../../../../base/common/strings.js';
import { IBulkEditService, ResourceTextEdit } from '../../../../../editor/browser/services/bulkEditService.js';
import { Range } from '../../../../../editor/common/core/range.js';
import { MultiModelEditStackElement, SingleModelEditStackElement } from '../../../../../editor/common/model/editStack.js';
import { IntervalNode, IntervalTree } from '../../../../../editor/common/model/intervalTree.js';
import { ModelDecorationOptions } from '../../../../../editor/common/model/textModel.js';
import { ITextModelService } from '../../../../../editor/common/services/resolverService.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { IUndoRedoService } from '../../../../../platform/undoRedo/common/undoRedo.js';
import { CellFindMatchModel } from '../contrib/find/findModel.js';
import { CellEditState, isNotebookCellDecoration } from '../notebookBrowser.js';
import { NotebookMetadataChangedEvent } from '../notebookViewEvents.js';
import { NotebookCellSelectionCollection } from './cellSelectionCollection.js';
import { CodeCellViewModel } from './codeCellViewModel.js';
import { MarkupCellViewModel } from './markupCellViewModel.js';
import { CellKind, NotebookCellsChangeType, NotebookFindScopeType, SelectionStateType } from '../../common/notebookCommon.js';
import { INotebookExecutionStateService, NotebookExecutionType } from '../../common/notebookExecutionStateService.js';
import { cellIndexesToRanges, cellRangesToIndexes, reduceCellRanges } from '../../common/notebookRange.js';
const invalidFunc = () => { throw new Error(`Invalid change accessor`); };
class DecorationsTree {
    constructor() {
        this._decorationsTree = new IntervalTree();
    }
    intervalSearch(start, end, filterOwnerId, filterOutValidation, filterFontDecorations, cachedVersionId, onlyMarginDecorations = false) {
        const r1 = this._decorationsTree.intervalSearch(start, end, filterOwnerId, filterOutValidation, filterFontDecorations, cachedVersionId, onlyMarginDecorations);
        return r1;
    }
    search(filterOwnerId, filterOutValidation, filterFontDecorations, overviewRulerOnly, cachedVersionId, onlyMarginDecorations) {
        return this._decorationsTree.search(filterOwnerId, filterOutValidation, filterFontDecorations, cachedVersionId, onlyMarginDecorations);
    }
    collectNodesFromOwner(ownerId) {
        const r1 = this._decorationsTree.collectNodesFromOwner(ownerId);
        return r1;
    }
    collectNodesPostOrder() {
        const r1 = this._decorationsTree.collectNodesPostOrder();
        return r1;
    }
    insert(node) {
        this._decorationsTree.insert(node);
    }
    delete(node) {
        this._decorationsTree.delete(node);
    }
    resolveNode(node, cachedVersionId) {
        this._decorationsTree.resolveNode(node, cachedVersionId);
    }
    acceptReplace(offset, length, textLength, forceMoveMarkers) {
        this._decorationsTree.acceptReplace(offset, length, textLength, forceMoveMarkers);
    }
}
const TRACKED_RANGE_OPTIONS = [
    ModelDecorationOptions.register({ description: 'notebook-view-model-tracked-range-always-grows-when-typing-at-edges', stickiness: 0 /* TrackedRangeStickiness.AlwaysGrowsWhenTypingAtEdges */ }),
    ModelDecorationOptions.register({ description: 'notebook-view-model-tracked-range-never-grows-when-typing-at-edges', stickiness: 1 /* TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges */ }),
    ModelDecorationOptions.register({ description: 'notebook-view-model-tracked-range-grows-only-when-typing-before', stickiness: 2 /* TrackedRangeStickiness.GrowsOnlyWhenTypingBefore */ }),
    ModelDecorationOptions.register({ description: 'notebook-view-model-tracked-range-grows-only-when-typing-after', stickiness: 3 /* TrackedRangeStickiness.GrowsOnlyWhenTypingAfter */ }),
];
function _normalizeOptions(options) {
    if (options instanceof ModelDecorationOptions) {
        return options;
    }
    return ModelDecorationOptions.createDynamic(options);
}
let MODEL_ID = 0;
let NotebookViewModel = class NotebookViewModel extends Disposable {
    get options() { return this._options; }
    get onDidChangeOptions() { return this._onDidChangeOptions.event; }
    get viewCells() {
        return this._viewCells;
    }
    get length() {
        return this._viewCells.length;
    }
    get notebookDocument() {
        return this._notebook;
    }
    get uri() {
        return this._notebook.uri;
    }
    get metadata() {
        return this._notebook.metadata;
    }
    get isRepl() {
        return this.viewType === 'repl';
    }
    get onDidChangeViewCells() { return this._onDidChangeViewCells.event; }
    get lastNotebookEditResource() {
        if (this._lastNotebookEditResource.length) {
            return this._lastNotebookEditResource[this._lastNotebookEditResource.length - 1];
        }
        return null;
    }
    get layoutInfo() {
        return this._layoutInfo;
    }
    get onDidChangeSelection() { return this._onDidChangeSelection.event; }
    get selectionHandles() {
        const handlesSet = new Set();
        const handles = [];
        cellRangesToIndexes(this._selectionCollection.selections).map(index => index < this.length ? this.cellAt(index) : undefined).forEach(cell => {
            if (cell && !handlesSet.has(cell.handle)) {
                handlesSet.add(cell.handle);
                handles.push(cell.handle);
            }
        });
        return handles;
    }
    set selectionHandles(selectionHandles) {
        const indexes = selectionHandles.map(handle => this._viewCells.findIndex(cell => cell.handle === handle));
        this._selectionCollection.setSelections(cellIndexesToRanges(indexes), true, 'model');
    }
    get focused() {
        return this._focused;
    }
    constructor(viewType, _notebook, _viewContext, _layoutInfo, _options, _instantiationService, _bulkEditService, _undoService, _textModelService, notebookExecutionStateService) {
        super();
        this.viewType = viewType;
        this._notebook = _notebook;
        this._viewContext = _viewContext;
        this._layoutInfo = _layoutInfo;
        this._options = _options;
        this._instantiationService = _instantiationService;
        this._bulkEditService = _bulkEditService;
        this._undoService = _undoService;
        this._textModelService = _textModelService;
        this.notebookExecutionStateService = notebookExecutionStateService;
        this._localStore = this._register(new DisposableStore());
        this._handleToViewCellMapping = new Map();
        this._onDidChangeOptions = this._register(new Emitter());
        this._viewCells = [];
        this._onDidChangeViewCells = this._register(new Emitter());
        this._lastNotebookEditResource = [];
        this._onDidChangeSelection = this._register(new Emitter());
        this._selectionCollection = this._register(new NotebookCellSelectionCollection());
        this._decorationsTree = new DecorationsTree();
        this._decorations = Object.create(null);
        this._lastDecorationId = 0;
        this._foldingRanges = null;
        this._onDidFoldingStateChanged = this._register(new Emitter());
        this.onDidFoldingStateChanged = this._onDidFoldingStateChanged.event;
        this._hiddenRanges = [];
        this._focused = true;
        this._decorationIdToCellMap = new Map();
        this._statusBarItemIdToCellMap = new Map();
        this._lastOverviewRulerDecorationId = 0;
        this._overviewRulerDecorations = new Map();
        MODEL_ID++;
        this.id = '$notebookViewModel' + MODEL_ID;
        this._instanceId = strings.singleLetterHash(MODEL_ID);
        const compute = (changes, synchronous) => {
            const diffs = changes.map(splice => {
                return [splice[0], splice[1], splice[2].map(cell => {
                        return createCellViewModel(this._instantiationService, this, cell, this._viewContext);
                    })];
            });
            diffs.reverse().forEach(diff => {
                const deletedCells = this._viewCells.splice(diff[0], diff[1], ...diff[2]);
                this._decorationsTree.acceptReplace(diff[0], diff[1], diff[2].length, true);
                deletedCells.forEach(cell => {
                    this._handleToViewCellMapping.delete(cell.handle);
                    // dispose the cell to release ref to the cell text document
                    cell.dispose();
                });
                diff[2].forEach(cell => {
                    this._handleToViewCellMapping.set(cell.handle, cell);
                    this._localStore.add(cell);
                });
            });
            const selectionHandles = this.selectionHandles;
            this._onDidChangeViewCells.fire({
                synchronous: synchronous,
                splices: diffs
            });
            let endSelectionHandles = [];
            if (selectionHandles.length) {
                const primaryHandle = selectionHandles[0];
                const primarySelectionIndex = this._viewCells.indexOf(this.getCellByHandle(primaryHandle));
                endSelectionHandles = [primaryHandle];
                let delta = 0;
                for (let i = 0; i < diffs.length; i++) {
                    const diff = diffs[0];
                    if (diff[0] + diff[1] <= primarySelectionIndex) {
                        delta += diff[2].length - diff[1];
                        continue;
                    }
                    if (diff[0] > primarySelectionIndex) {
                        endSelectionHandles = [primaryHandle];
                        break;
                    }
                    if (diff[0] + diff[1] > primarySelectionIndex) {
                        endSelectionHandles = [this._viewCells[diff[0] + delta].handle];
                        break;
                    }
                }
            }
            // TODO@rebornix
            const selectionIndexes = endSelectionHandles.map(handle => this._viewCells.findIndex(cell => cell.handle === handle));
            this._selectionCollection.setState(cellIndexesToRanges([selectionIndexes[0]])[0], cellIndexesToRanges(selectionIndexes), true, 'model');
        };
        this._register(this._notebook.onDidChangeContent(e => {
            for (let i = 0; i < e.rawEvents.length; i++) {
                const change = e.rawEvents[i];
                let changes = [];
                const synchronous = e.synchronous ?? true;
                if (change.kind === NotebookCellsChangeType.ModelChange || change.kind === NotebookCellsChangeType.Initialize) {
                    changes = change.changes;
                    compute(changes, synchronous);
                    continue;
                }
                else if (change.kind === NotebookCellsChangeType.Move) {
                    compute([[change.index, change.length, []]], synchronous);
                    compute([[change.newIdx, 0, change.cells]], synchronous);
                }
                else {
                    continue;
                }
            }
        }));
        this._register(this._notebook.onDidChangeContent(contentChanges => {
            contentChanges.rawEvents.forEach(e => {
                if (e.kind === NotebookCellsChangeType.ChangeDocumentMetadata) {
                    this._viewContext.eventDispatcher.emit([new NotebookMetadataChangedEvent(this._notebook.metadata)]);
                }
            });
            if (contentChanges.endSelectionState) {
                this.updateSelectionsState(contentChanges.endSelectionState);
            }
        }));
        this._register(this._viewContext.eventDispatcher.onDidChangeLayout((e) => {
            this._layoutInfo = e.value;
            this._viewCells.forEach(cell => {
                if (cell.cellKind === CellKind.Markup) {
                    if (e.source.width || e.source.fontInfo) {
                        cell.layoutChange({ outerWidth: e.value.width, font: e.value.fontInfo });
                    }
                }
                else {
                    if (e.source.width !== undefined) {
                        cell.layoutChange({ outerWidth: e.value.width, font: e.value.fontInfo });
                    }
                }
            });
        }));
        this._register(this._viewContext.notebookOptions.onDidChangeOptions(e => {
            for (let i = 0; i < this.length; i++) {
                const cell = this._viewCells[i];
                cell.updateOptions(e);
            }
        }));
        this._register(notebookExecutionStateService.onDidChangeExecution(e => {
            if (e.type !== NotebookExecutionType.cell) {
                return;
            }
            const cell = this.getCellByHandle(e.cellHandle);
            if (cell instanceof CodeCellViewModel) {
                cell.updateExecutionState(e);
            }
        }));
        this._register(this._selectionCollection.onDidChangeSelection(e => {
            this._onDidChangeSelection.fire(e);
        }));
        const viewCellCount = this.isRepl ? this._notebook.cells.length - 1 : this._notebook.cells.length;
        for (let i = 0; i < viewCellCount; i++) {
            this._viewCells.push(createCellViewModel(this._instantiationService, this, this._notebook.cells[i], this._viewContext));
        }
        this._viewCells.forEach(cell => {
            this._handleToViewCellMapping.set(cell.handle, cell);
        });
    }
    updateOptions(newOptions) {
        this._options = { ...this._options, ...newOptions };
        this._viewCells.forEach(cell => cell.updateOptions({ readonly: this._options.isReadOnly }));
        this._onDidChangeOptions.fire();
    }
    getFocus() {
        return this._selectionCollection.focus;
    }
    getSelections() {
        return this._selectionCollection.selections;
    }
    getMostRecentlyExecutedCell() {
        const handle = this.notebookExecutionStateService.getLastCompletedCellForNotebook(this._notebook.uri);
        return handle !== undefined ? this.getCellByHandle(handle) : undefined;
    }
    setEditorFocus(focused) {
        this._focused = focused;
    }
    validateRange(cellRange) {
        if (!cellRange) {
            return null;
        }
        const start = clamp(cellRange.start, 0, this.length);
        const end = clamp(cellRange.end, 0, this.length);
        if (start <= end) {
            return { start, end };
        }
        else {
            return { start: end, end: start };
        }
    }
    // selection change from list view's `setFocus` and `setSelection` should always use `source: view` to prevent events breaking the list view focus/selection change transaction
    updateSelectionsState(state, source = 'model') {
        if (this._focused || source === 'model') {
            if (state.kind === SelectionStateType.Handle) {
                const primaryIndex = state.primary !== null ? this.getCellIndexByHandle(state.primary) : null;
                const primarySelection = primaryIndex !== null ? this.validateRange({ start: primaryIndex, end: primaryIndex + 1 }) : null;
                const selections = cellIndexesToRanges(state.selections.map(sel => this.getCellIndexByHandle(sel)))
                    .map(range => this.validateRange(range))
                    .filter(range => range !== null);
                this._selectionCollection.setState(primarySelection, reduceCellRanges(selections), true, source);
            }
            else {
                const primarySelection = this.validateRange(state.focus);
                const selections = state.selections
                    .map(range => this.validateRange(range))
                    .filter(range => range !== null);
                this._selectionCollection.setState(primarySelection, reduceCellRanges(selections), true, source);
            }
        }
    }
    getFoldingStartIndex(index) {
        if (!this._foldingRanges) {
            return -1;
        }
        const range = this._foldingRanges.findRange(index + 1);
        const startIndex = this._foldingRanges.getStartLineNumber(range) - 1;
        return startIndex;
    }
    getFoldingState(index) {
        if (!this._foldingRanges) {
            return 0 /* CellFoldingState.None */;
        }
        const range = this._foldingRanges.findRange(index + 1);
        const startIndex = this._foldingRanges.getStartLineNumber(range) - 1;
        if (startIndex !== index) {
            return 0 /* CellFoldingState.None */;
        }
        return this._foldingRanges.isCollapsed(range) ? 2 /* CellFoldingState.Collapsed */ : 1 /* CellFoldingState.Expanded */;
    }
    getFoldedLength(index) {
        if (!this._foldingRanges) {
            return 0;
        }
        const range = this._foldingRanges.findRange(index + 1);
        const startIndex = this._foldingRanges.getStartLineNumber(range) - 1;
        const endIndex = this._foldingRanges.getEndLineNumber(range) - 1;
        return endIndex - startIndex;
    }
    updateFoldingRanges(ranges) {
        this._foldingRanges = ranges;
        let updateHiddenAreas = false;
        const newHiddenAreas = [];
        let i = 0; // index into hidden
        let k = 0;
        let lastCollapsedStart = Number.MAX_VALUE;
        let lastCollapsedEnd = -1;
        for (; i < ranges.length; i++) {
            if (!ranges.isCollapsed(i)) {
                continue;
            }
            const startLineNumber = ranges.getStartLineNumber(i) + 1; // the first line is not hidden
            const endLineNumber = ranges.getEndLineNumber(i);
            if (lastCollapsedStart <= startLineNumber && endLineNumber <= lastCollapsedEnd) {
                // ignore ranges contained in collapsed regions
                continue;
            }
            if (!updateHiddenAreas && k < this._hiddenRanges.length && this._hiddenRanges[k].start + 1 === startLineNumber && (this._hiddenRanges[k].end + 1) === endLineNumber) {
                // reuse the old ranges
                newHiddenAreas.push(this._hiddenRanges[k]);
                k++;
            }
            else {
                updateHiddenAreas = true;
                newHiddenAreas.push({ start: startLineNumber - 1, end: endLineNumber - 1 });
            }
            lastCollapsedStart = startLineNumber;
            lastCollapsedEnd = endLineNumber;
        }
        if (updateHiddenAreas || k < this._hiddenRanges.length) {
            this._hiddenRanges = newHiddenAreas;
            this._onDidFoldingStateChanged.fire();
        }
        this._viewCells.forEach(cell => {
            if (cell.cellKind === CellKind.Markup) {
                cell.triggerFoldingStateChange();
            }
        });
    }
    getHiddenRanges() {
        return this._hiddenRanges;
    }
    getOverviewRulerDecorations() {
        return Array.from(this._overviewRulerDecorations.values());
    }
    getCellByHandle(handle) {
        return this._handleToViewCellMapping.get(handle);
    }
    getCellIndexByHandle(handle) {
        return this._viewCells.findIndex(cell => cell.handle === handle);
    }
    getCellIndex(cell) {
        return this._viewCells.indexOf(cell);
    }
    cellAt(index) {
        // if (index < 0 || index >= this.length) {
        // 	throw new Error(`Invalid index ${index}`);
        // }
        return this._viewCells[index];
    }
    getCellsInRange(range) {
        if (!range) {
            return this._viewCells.slice(0);
        }
        const validatedRange = this.validateRange(range);
        if (validatedRange) {
            const result = [];
            for (let i = validatedRange.start; i < validatedRange.end; i++) {
                result.push(this._viewCells[i]);
            }
            return result;
        }
        return [];
    }
    /**
     * If this._viewCells[index] is visible then return index
     */
    getNearestVisibleCellIndexUpwards(index) {
        for (let i = this._hiddenRanges.length - 1; i >= 0; i--) {
            const cellRange = this._hiddenRanges[i];
            const foldStart = cellRange.start - 1;
            const foldEnd = cellRange.end;
            if (foldStart > index) {
                continue;
            }
            if (foldStart <= index && foldEnd >= index) {
                return index;
            }
            // foldStart <= index, foldEnd < index
            break;
        }
        return index;
    }
    getNextVisibleCellIndex(index) {
        for (let i = 0; i < this._hiddenRanges.length; i++) {
            const cellRange = this._hiddenRanges[i];
            const foldStart = cellRange.start - 1;
            const foldEnd = cellRange.end;
            if (foldEnd < index) {
                continue;
            }
            // foldEnd >= index
            if (foldStart <= index) {
                return foldEnd + 1;
            }
            break;
        }
        return index + 1;
    }
    getPreviousVisibleCellIndex(index) {
        for (let i = this._hiddenRanges.length - 1; i >= 0; i--) {
            const cellRange = this._hiddenRanges[i];
            const foldStart = cellRange.start - 1;
            const foldEnd = cellRange.end;
            if (foldEnd < index) {
                return index;
            }
            if (foldStart <= index) {
                return foldStart;
            }
        }
        return index;
    }
    hasCell(cell) {
        return this._handleToViewCellMapping.has(cell.handle);
    }
    getVersionId() {
        return this._notebook.versionId;
    }
    getAlternativeId() {
        return this._notebook.alternativeVersionId;
    }
    getTrackedRange(id) {
        return this._getDecorationRange(id);
    }
    _getDecorationRange(decorationId) {
        const node = this._decorations[decorationId];
        if (!node) {
            return null;
        }
        const versionId = this.getVersionId();
        if (node.cachedVersionId !== versionId) {
            this._decorationsTree.resolveNode(node, versionId);
        }
        if (node.range === null) {
            return { start: node.cachedAbsoluteStart - 1, end: node.cachedAbsoluteEnd - 1 };
        }
        return { start: node.range.startLineNumber - 1, end: node.range.endLineNumber - 1 };
    }
    setTrackedRange(id, newRange, newStickiness) {
        const node = (id ? this._decorations[id] : null);
        if (!node) {
            if (!newRange) {
                return null;
            }
            return this._deltaCellDecorationsImpl(0, [], [{ range: new Range(newRange.start + 1, 1, newRange.end + 1, 1), options: TRACKED_RANGE_OPTIONS[newStickiness] }])[0];
        }
        if (!newRange) {
            // node exists, the request is to delete => delete node
            this._decorationsTree.delete(node);
            delete this._decorations[node.id];
            return null;
        }
        this._decorationsTree.delete(node);
        node.reset(this.getVersionId(), newRange.start, newRange.end + 1, new Range(newRange.start + 1, 1, newRange.end + 1, 1));
        node.setOptions(TRACKED_RANGE_OPTIONS[newStickiness]);
        this._decorationsTree.insert(node);
        return node.id;
    }
    _deltaCellDecorationsImpl(ownerId, oldDecorationsIds, newDecorations) {
        const versionId = this.getVersionId();
        const oldDecorationsLen = oldDecorationsIds.length;
        let oldDecorationIndex = 0;
        const newDecorationsLen = newDecorations.length;
        let newDecorationIndex = 0;
        const result = new Array(newDecorationsLen);
        while (oldDecorationIndex < oldDecorationsLen || newDecorationIndex < newDecorationsLen) {
            let node = null;
            if (oldDecorationIndex < oldDecorationsLen) {
                // (1) get ourselves an old node
                do {
                    node = this._decorations[oldDecorationsIds[oldDecorationIndex++]];
                } while (!node && oldDecorationIndex < oldDecorationsLen);
                // (2) remove the node from the tree (if it exists)
                if (node) {
                    this._decorationsTree.delete(node);
                }
            }
            if (newDecorationIndex < newDecorationsLen) {
                // (3) create a new node if necessary
                if (!node) {
                    const internalDecorationId = (++this._lastDecorationId);
                    const decorationId = `${this._instanceId};${internalDecorationId}`;
                    node = new IntervalNode(decorationId, 0, 0);
                    this._decorations[decorationId] = node;
                }
                // (4) initialize node
                const newDecoration = newDecorations[newDecorationIndex];
                const range = newDecoration.range;
                const options = _normalizeOptions(newDecoration.options);
                node.ownerId = ownerId;
                node.reset(versionId, range.startLineNumber, range.endLineNumber, Range.lift(range));
                node.setOptions(options);
                this._decorationsTree.insert(node);
                result[newDecorationIndex] = node.id;
                newDecorationIndex++;
            }
            else {
                if (node) {
                    delete this._decorations[node.id];
                }
            }
        }
        return result;
    }
    deltaCellDecorations(oldDecorations, newDecorations) {
        oldDecorations.forEach(id => {
            const handle = this._decorationIdToCellMap.get(id);
            if (handle !== undefined) {
                const cell = this.getCellByHandle(handle);
                cell?.deltaCellDecorations([id], []);
                this._decorationIdToCellMap.delete(id);
            }
            this._overviewRulerDecorations.delete(id);
        });
        const result = [];
        newDecorations.forEach(decoration => {
            if (isNotebookCellDecoration(decoration)) {
                const cell = this.getCellByHandle(decoration.handle);
                const ret = cell?.deltaCellDecorations([], [decoration.options]) || [];
                ret.forEach(id => {
                    this._decorationIdToCellMap.set(id, decoration.handle);
                });
                result.push(...ret);
            }
            else {
                const id = ++this._lastOverviewRulerDecorationId;
                const decorationId = `_overview_${this.id};${id}`;
                this._overviewRulerDecorations.set(decorationId, decoration);
                result.push(decorationId);
            }
        });
        return result;
    }
    deltaCellStatusBarItems(oldItems, newItems) {
        const deletesByHandle = groupBy(oldItems, id => this._statusBarItemIdToCellMap.get(id) ?? -1);
        const result = [];
        newItems.forEach(itemDelta => {
            const cell = this.getCellByHandle(itemDelta.handle);
            const deleted = deletesByHandle[itemDelta.handle] ?? [];
            delete deletesByHandle[itemDelta.handle];
            deleted.forEach(id => this._statusBarItemIdToCellMap.delete(id));
            const ret = cell?.deltaCellStatusBarItems(deleted, itemDelta.items) || [];
            ret.forEach(id => {
                this._statusBarItemIdToCellMap.set(id, itemDelta.handle);
            });
            result.push(...ret);
        });
        for (const _handle in deletesByHandle) {
            const handle = parseInt(_handle);
            const ids = deletesByHandle[handle];
            const cell = this.getCellByHandle(handle);
            cell?.deltaCellStatusBarItems(ids, []);
            ids.forEach(id => this._statusBarItemIdToCellMap.delete(id));
        }
        return result;
    }
    nearestCodeCellIndex(index /* exclusive */) {
        const nearest = this.viewCells.slice(0, index).reverse().findIndex(cell => cell.cellKind === CellKind.Code);
        if (nearest > -1) {
            return index - nearest - 1;
        }
        else {
            const nearestCellTheOtherDirection = this.viewCells.slice(index + 1).findIndex(cell => cell.cellKind === CellKind.Code);
            if (nearestCellTheOtherDirection > -1) {
                return index + 1 + nearestCellTheOtherDirection;
            }
            return -1;
        }
    }
    getEditorViewState() {
        const editingCells = {};
        const collapsedInputCells = {};
        const collapsedOutputCells = {};
        const cellLineNumberStates = {};
        this._viewCells.forEach((cell, i) => {
            if (cell.getEditState() === CellEditState.Editing) {
                editingCells[i] = true;
            }
            if (cell.isInputCollapsed) {
                collapsedInputCells[i] = true;
            }
            if (cell instanceof CodeCellViewModel && cell.isOutputCollapsed) {
                collapsedOutputCells[i] = true;
            }
            if (cell.lineNumbers !== 'inherit') {
                cellLineNumberStates[i] = cell.lineNumbers;
            }
        });
        const editorViewStates = {};
        this._viewCells.map(cell => ({ handle: cell.model.handle, state: cell.saveEditorViewState() })).forEach((viewState, i) => {
            if (viewState.state) {
                editorViewStates[i] = viewState.state;
            }
        });
        return {
            editingCells,
            editorViewStates,
            cellLineNumberStates,
            collapsedInputCells,
            collapsedOutputCells
        };
    }
    restoreEditorViewState(viewState) {
        if (!viewState) {
            return;
        }
        this._viewCells.forEach((cell, index) => {
            const isEditing = viewState.editingCells && viewState.editingCells[index];
            const editorViewState = viewState.editorViewStates && viewState.editorViewStates[index];
            cell.updateEditState(isEditing ? CellEditState.Editing : CellEditState.Preview, 'viewState');
            const cellHeight = viewState.cellTotalHeights ? viewState.cellTotalHeights[index] : undefined;
            cell.restoreEditorViewState(editorViewState, cellHeight);
            if (viewState.collapsedInputCells && viewState.collapsedInputCells[index]) {
                cell.isInputCollapsed = true;
            }
            if (viewState.collapsedOutputCells && viewState.collapsedOutputCells[index] && cell instanceof CodeCellViewModel) {
                cell.isOutputCollapsed = true;
            }
            if (viewState.cellLineNumberStates && viewState.cellLineNumberStates[index]) {
                cell.lineNumbers = viewState.cellLineNumberStates[index];
            }
        });
    }
    /**
     * Editor decorations across cells. For example, find decorations for multiple code cells
     * The reason that we can't completely delegate this to CodeEditorWidget is most of the time, the editors for cells are not created yet but we already have decorations for them.
     */
    changeModelDecorations(callback) {
        const changeAccessor = {
            deltaDecorations: (oldDecorations, newDecorations) => {
                return this._deltaModelDecorationsImpl(oldDecorations, newDecorations);
            }
        };
        let result = null;
        try {
            result = callback(changeAccessor);
        }
        catch (e) {
            onUnexpectedError(e);
        }
        changeAccessor.deltaDecorations = invalidFunc;
        return result;
    }
    _deltaModelDecorationsImpl(oldDecorations, newDecorations) {
        const mapping = new Map();
        oldDecorations.forEach(oldDecoration => {
            const ownerId = oldDecoration.ownerId;
            if (!mapping.has(ownerId)) {
                const cell = this._viewCells.find(cell => cell.handle === ownerId);
                if (cell) {
                    mapping.set(ownerId, { cell: cell, oldDecorations: [], newDecorations: [] });
                }
            }
            const data = mapping.get(ownerId);
            if (data) {
                data.oldDecorations = oldDecoration.decorations;
            }
        });
        newDecorations.forEach(newDecoration => {
            const ownerId = newDecoration.ownerId;
            if (!mapping.has(ownerId)) {
                const cell = this._viewCells.find(cell => cell.handle === ownerId);
                if (cell) {
                    mapping.set(ownerId, { cell: cell, oldDecorations: [], newDecorations: [] });
                }
            }
            const data = mapping.get(ownerId);
            if (data) {
                data.newDecorations = newDecoration.decorations;
            }
        });
        const ret = [];
        mapping.forEach((value, ownerId) => {
            const cellRet = value.cell.deltaModelDecorations(value.oldDecorations, value.newDecorations);
            ret.push({
                ownerId: ownerId,
                decorations: cellRet
            });
        });
        return ret;
    }
    //#region Find
    find(value, options) {
        const matches = [];
        let findCells = [];
        if (options.findScope && (options.findScope.findScopeType === NotebookFindScopeType.Cells || options.findScope.findScopeType === NotebookFindScopeType.Text)) {
            const selectedRanges = options.findScope.selectedCellRanges?.map(range => this.validateRange(range)).filter(range => !!range) ?? [];
            const selectedIndexes = cellRangesToIndexes(selectedRanges);
            findCells = selectedIndexes.map(index => this._viewCells[index]);
        }
        else {
            findCells = this._viewCells;
        }
        findCells.forEach((cell, index) => {
            const cellMatches = cell.startFind(value, options);
            if (cellMatches) {
                matches.push(new CellFindMatchModel(cellMatches.cell, index, cellMatches.contentMatches, []));
            }
        });
        // filter based on options and editing state
        return matches.filter(match => {
            if (match.cell.cellKind === CellKind.Code) {
                // code cell, we only include its match if include input is enabled
                return options.includeCodeInput;
            }
            // markup cell, it depends on the editing state
            if (match.cell.getEditState() === CellEditState.Editing) {
                // editing, even if we includeMarkupPreview
                return options.includeMarkupInput;
            }
            else {
                // cell in preview mode, we should only include it if includeMarkupPreview is false but includeMarkupInput is true
                // if includeMarkupPreview is true, then we should include the webview match result other than this
                return !options.includeMarkupPreview && options.includeMarkupInput;
            }
        });
    }
    replaceOne(cell, range, text) {
        const viewCell = cell;
        this._lastNotebookEditResource.push(viewCell.uri);
        return viewCell.resolveTextModel().then(() => {
            this._bulkEditService.apply([new ResourceTextEdit(cell.uri, { range, text })], { quotableLabel: 'Notebook Replace' });
        });
    }
    async replaceAll(matches, texts) {
        if (!matches.length) {
            return;
        }
        const textEdits = [];
        this._lastNotebookEditResource.push(matches[0].cell.uri);
        matches.forEach(match => {
            match.contentMatches.forEach((singleMatch, index) => {
                textEdits.push({
                    versionId: undefined,
                    textEdit: { range: singleMatch.range, text: texts[index] },
                    resource: match.cell.uri
                });
            });
        });
        return Promise.all(matches.map(match => {
            return match.cell.resolveTextModel();
        })).then(async () => {
            this._bulkEditService.apply({ edits: textEdits }, { quotableLabel: 'Notebook Replace All' });
            return;
        });
    }
    //#endregion
    //#region Undo/Redo
    async _withElement(element, callback) {
        const viewCells = this._viewCells.filter(cell => element.matchesResource(cell.uri));
        const refs = await Promise.all(viewCells.map(cell => this._textModelService.createModelReference(cell.uri)));
        await callback();
        refs.forEach(ref => ref.dispose());
    }
    async undo() {
        const editStack = this._undoService.getElements(this.uri);
        const element = editStack.past.length ? editStack.past[editStack.past.length - 1] : undefined;
        if (element && element instanceof SingleModelEditStackElement || element instanceof MultiModelEditStackElement) {
            await this._withElement(element, async () => {
                await this._undoService.undo(this.uri);
            });
            return (element instanceof SingleModelEditStackElement) ? [element.resource] : element.resources;
        }
        await this._undoService.undo(this.uri);
        return [];
    }
    async redo() {
        const editStack = this._undoService.getElements(this.uri);
        const element = editStack.future[0];
        if (element && element instanceof SingleModelEditStackElement || element instanceof MultiModelEditStackElement) {
            await this._withElement(element, async () => {
                await this._undoService.redo(this.uri);
            });
            return (element instanceof SingleModelEditStackElement) ? [element.resource] : element.resources;
        }
        await this._undoService.redo(this.uri);
        return [];
    }
    //#endregion
    equal(notebook) {
        return this._notebook === notebook;
    }
    dispose() {
        this._localStore.clear();
        this._viewCells.forEach(cell => {
            cell.dispose();
        });
        super.dispose();
    }
};
NotebookViewModel = __decorate([
    __param(5, IInstantiationService),
    __param(6, IBulkEditService),
    __param(7, IUndoRedoService),
    __param(8, ITextModelService),
    __param(9, INotebookExecutionStateService)
], NotebookViewModel);
export { NotebookViewModel };
export function createCellViewModel(instantiationService, notebookViewModel, cell, viewContext) {
    if (cell.cellKind === CellKind.Code) {
        return instantiationService.createInstance(CodeCellViewModel, notebookViewModel.viewType, cell, notebookViewModel.layoutInfo, viewContext);
    }
    else {
        return instantiationService.createInstance(MarkupCellViewModel, notebookViewModel.viewType, cell, notebookViewModel.layoutInfo, notebookViewModel, viewContext);
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibm90ZWJvb2tWaWV3TW9kZWxJbXBsLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvbm90ZWJvb2svYnJvd3Nlci92aWV3TW9kZWwvbm90ZWJvb2tWaWV3TW9kZWxJbXBsLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7O0FBRWhHLE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSwyQ0FBMkMsQ0FBQztBQUNwRSxPQUFPLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUN6RSxPQUFPLEVBQUUsT0FBTyxFQUFTLE1BQU0scUNBQXFDLENBQUM7QUFDckUsT0FBTyxFQUFFLFVBQVUsRUFBRSxlQUFlLEVBQUUsTUFBTSx5Q0FBeUMsQ0FBQztBQUN0RixPQUFPLEVBQUUsS0FBSyxFQUFFLE1BQU0sdUNBQXVDLENBQUM7QUFDOUQsT0FBTyxLQUFLLE9BQU8sTUFBTSx1Q0FBdUMsQ0FBQztBQUVqRSxPQUFPLEVBQUUsZ0JBQWdCLEVBQUUsZ0JBQWdCLEVBQUUsTUFBTSwyREFBMkQsQ0FBQztBQUMvRyxPQUFPLEVBQUUsS0FBSyxFQUFFLE1BQU0sNENBQTRDLENBQUM7QUFJbkUsT0FBTyxFQUFFLDBCQUEwQixFQUFFLDJCQUEyQixFQUFFLE1BQU0saURBQWlELENBQUM7QUFDMUgsT0FBTyxFQUFFLFlBQVksRUFBRSxZQUFZLEVBQUUsTUFBTSxvREFBb0QsQ0FBQztBQUNoRyxPQUFPLEVBQUUsc0JBQXNCLEVBQUUsTUFBTSxpREFBaUQsQ0FBQztBQUN6RixPQUFPLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSwwREFBMEQsQ0FBQztBQUU3RixPQUFPLEVBQUUscUJBQXFCLEVBQUUsTUFBTSwrREFBK0QsQ0FBQztBQUN0RyxPQUFPLEVBQUUsZ0JBQWdCLEVBQUUsTUFBTSxxREFBcUQsQ0FBQztBQUN2RixPQUFP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