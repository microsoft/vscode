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
import * as DOM from '../../../../../base/browser/dom.js';
import * as domStylesheetsJs from '../../../../../base/browser/domStylesheets.js';
import { ListError } from '../../../../../base/browser/ui/list/list.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { Disposable, DisposableStore, MutableDisposable } from '../../../../../base/common/lifecycle.js';
import { isMacintosh } from '../../../../../base/common/platform.js';
import { PrefixSumComputer } from '../../../../../editor/common/model/prefixSumComputer.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IListService, WorkbenchList } from '../../../../../platform/list/browser/listService.js';
import { CursorAtBoundary, CellEditState, CellRevealRangeType, CursorAtLineBoundary } from '../notebookBrowser.js';
import { diff, NOTEBOOK_EDITOR_CURSOR_BOUNDARY, CellKind, SelectionStateType, NOTEBOOK_EDITOR_CURSOR_LINE_BOUNDARY } from '../../common/notebookCommon.js';
import { cellRangesToIndexes, reduceCellRanges, cellRangesEqual } from '../../common/notebookRange.js';
import { NOTEBOOK_CELL_LIST_FOCUSED } from '../../common/notebookContextKeys.js';
import { clamp } from '../../../../../base/common/numbers.js';
import { FastDomNode } from '../../../../../base/browser/fastDomNode.js';
import { MarkupCellViewModel } from '../viewModel/markupCellViewModel.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { NotebookCellListView } from './notebookCellListView.js';
import { INotebookExecutionStateService } from '../../common/notebookExecutionStateService.js';
import { NotebookCellAnchor } from './notebookCellAnchor.js';
import { NotebookViewZones } from '../viewParts/notebookViewZones.js';
import { NotebookCellOverlays } from '../viewParts/notebookCellOverlays.js';
var CellRevealPosition;
(function (CellRevealPosition) {
    CellRevealPosition[CellRevealPosition["Top"] = 0] = "Top";
    CellRevealPosition[CellRevealPosition["Center"] = 1] = "Center";
    CellRevealPosition[CellRevealPosition["Bottom"] = 2] = "Bottom";
    CellRevealPosition[CellRevealPosition["NearTop"] = 3] = "NearTop";
})(CellRevealPosition || (CellRevealPosition = {}));
function getVisibleCells(cells, hiddenRanges) {
    if (!hiddenRanges.length) {
        return cells;
    }
    let start = 0;
    let hiddenRangeIndex = 0;
    const result = [];
    while (start < cells.length && hiddenRangeIndex < hiddenRanges.length) {
        if (start < hiddenRanges[hiddenRangeIndex].start) {
            result.push(...cells.slice(start, hiddenRanges[hiddenRangeIndex].start));
        }
        start = hiddenRanges[hiddenRangeIndex].end + 1;
        hiddenRangeIndex++;
    }
    if (start < cells.length) {
        result.push(...cells.slice(start));
    }
    return result;
}
export const NOTEBOOK_WEBVIEW_BOUNDARY = 5000;
function validateWebviewBoundary(element) {
    const webviewTop = 0 - (parseInt(element.style.top, 10) || 0);
    return webviewTop >= 0 && webviewTop <= NOTEBOOK_WEBVIEW_BOUNDARY * 2;
}
let NotebookCellList = class NotebookCellList extends WorkbenchList {
    get onWillScroll() { return this.view.onWillScroll; }
    get rowsContainer() {
        return this.view.containerDomNode;
    }
    get scrollableElement() {
        return this.view.scrollableElementDomNode;
    }
    get viewModel() {
        return this._viewModel;
    }
    get visibleRanges() {
        return this._visibleRanges;
    }
    set visibleRanges(ranges) {
        if (cellRangesEqual(this._visibleRanges, ranges)) {
            return;
        }
        this._visibleRanges = ranges;
        this._onDidChangeVisibleRanges.fire();
    }
    get isDisposed() {
        return this._isDisposed;
    }
    get webviewElement() {
        return this._webviewElement;
    }
    get inRenderingTransaction() {
        return this.view.inRenderingTransaction;
    }
    constructor(listUser, container, notebookOptions, delegate, renderers, contextKeyService, options, listService, configurationService, instantiationService, notebookExecutionStateService) {
        super(listUser, container, delegate, renderers, options, contextKeyService, listService, configurationService, instantiationService);
        this.listUser = listUser;
        this.notebookOptions = notebookOptions;
        this._previousFocusedElements = [];
        this._localDisposableStore = new DisposableStore();
        this._viewModelStore = new DisposableStore();
        this._onDidRemoveOutputs = this._localDisposableStore.add(new Emitter());
        this.onDidRemoveOutputs = this._onDidRemoveOutputs.event;
        this._onDidHideOutputs = this._localDisposableStore.add(new Emitter());
        this.onDidHideOutputs = this._onDidHideOutputs.event;
        this._onDidRemoveCellsFromView = this._localDisposableStore.add(new Emitter());
        this.onDidRemoveCellsFromView = this._onDidRemoveCellsFromView.event;
        this._viewModel = null;
        this._hiddenRangeIds = [];
        this.hiddenRangesPrefixSum = null;
        this._onDidChangeVisibleRanges = this._localDisposableStore.add(new Emitter());
        this.onDidChangeVisibleRanges = this._onDidChangeVisibleRanges.event;
        this._visibleRanges = [];
        this._isDisposed = false;
        this._isInLayout = false;
        this._webviewElement = null;
        NOTEBOOK_CELL_LIST_FOCUSED.bindTo(this.contextKeyService).set(true);
        this._previousFocusedElements = this.getFocusedElements();
        this._localDisposableStore.add(this.onDidChangeFocus((e) => {
            this._previousFocusedElements.forEach(element => {
                if (e.elements.indexOf(element) < 0) {
                    element.onDeselect();
                }
            });
            this._previousFocusedElements = e.elements;
        }));
        const notebookEditorCursorAtBoundaryContext = NOTEBOOK_EDITOR_CURSOR_BOUNDARY.bindTo(contextKeyService);
        notebookEditorCursorAtBoundaryContext.set('none');
        const notebookEditorCursorAtLineBoundaryContext = NOTEBOOK_EDITOR_CURSOR_LINE_BOUNDARY.bindTo(contextKeyService);
        notebookEditorCursorAtLineBoundaryContext.set('none');
        const cursorSelectionListener = this._localDisposableStore.add(new MutableDisposable());
        const textEditorAttachListener = this._localDisposableStore.add(new MutableDisposable());
        this._notebookCellAnchor = new NotebookCellAnchor(notebookExecutionStateService, configurationService, this.onDidScroll);
        const recomputeContext = (element) => {
            switch (element.cursorAtBoundary()) {
                case CursorAtBoundary.Both:
                    notebookEditorCursorAtBoundaryContext.set('both');
                    break;
                case CursorAtBoundary.Top:
                    notebookEditorCursorAtBoundaryContext.set('top');
                    break;
                case CursorAtBoundary.Bottom:
                    notebookEditorCursorAtBoundaryContext.set('bottom');
                    break;
                default:
                    notebookEditorCursorAtBoundaryContext.set('none');
                    break;
            }
            switch (element.cursorAtLineBoundary()) {
                case CursorAtLineBoundary.Both:
                    notebookEditorCursorAtLineBoundaryContext.set('both');
                    break;
                case CursorAtLineBoundary.Start:
                    notebookEditorCursorAtLineBoundaryContext.set('start');
                    break;
                case CursorAtLineBoundary.End:
                    notebookEditorCursorAtLineBoundaryContext.set('end');
                    break;
                default:
                    notebookEditorCursorAtLineBoundaryContext.set('none');
                    break;
            }
            return;
        };
        // Cursor Boundary context
        this._localDisposableStore.add(this.onDidChangeFocus((e) => {
            if (e.elements.length) {
                // we only validate the first focused element
                const focusedElement = e.elements[0];
                cursorSelectionListener.value = focusedElement.onDidChangeState((e) => {
                    if (e.selectionChanged) {
                        recomputeContext(focusedElement);
                    }
                });
                textEditorAttachListener.value = focusedElement.onDidChangeEditorAttachState(() => {
                    if (focusedElement.editorAttached) {
                        recomputeContext(focusedElement);
                    }
                });
                recomputeContext(focusedElement);
                return;
            }
            // reset context
            notebookEditorCursorAtBoundaryContext.set('none');
        }));
        // update visibleRanges
        const updateVisibleRanges = () => {
            if (!this.view.length) {
                return;
            }
            const top = this.getViewScrollTop();
            const bottom = this.getViewScrollBottom();
            if (top >= bottom) {
                return;
            }
            const topViewIndex = clamp(this.view.indexAt(top), 0, this.view.length - 1);
            const topElement = this.view.element(topViewIndex);
            const topModelIndex = this._viewModel.getCellIndex(topElement);
            const bottomViewIndex = clamp(this.view.indexAt(bottom), 0, this.view.length - 1);
            const bottomElement = this.view.element(bottomViewIndex);
            const bottomModelIndex = this._viewModel.getCellIndex(bottomElement);
            if (bottomModelIndex - topModelIndex === bottomViewIndex - topViewIndex) {
                this.visibleRanges = [{ start: topModelIndex, end: bottomModelIndex + 1 }];
            }
            else {
                this.visibleRanges = this._getVisibleRangesFromIndex(topViewIndex, topModelIndex, bottomViewIndex, bottomModelIndex);
            }
        };
        this._localDisposableStore.add(this.view.onDidChangeContentHeight(() => {
            if (this._isInLayout) {
                DOM.scheduleAtNextAnimationFrame(DOM.getWindow(container), () => {
                    updateVisibleRanges();
                });
            }
            updateVisibleRanges();
        }));
        this._localDisposableStore.add(this.view.onDidScroll(() => {
            if (this._isInLayout) {
                DOM.scheduleAtNextAnimationFrame(DOM.getWindow(container), () => {
                    updateVisibleRanges();
                });
            }
            updateVisibleRanges();
        }));
    }
    createListView(container, virtualDelegate, renderers, viewOptions) {
        const listView = new NotebookCellListView(container, virtualDelegate, renderers, viewOptions);
        this.viewZones = new NotebookViewZones(listView, this);
        this.cellOverlays = new NotebookCellOverlays(listView);
        return listView;
    }
    /**
     * Test Only
     */
    _getView() {
        return this.view;
    }
    attachWebview(element) {
        element.style.top = `-${NOTEBOOK_WEBVIEW_BOUNDARY}px`;
        this.rowsContainer.insertAdjacentElement('afterbegin', element);
        this._webviewElement = new FastDomNode(element);
    }
    elementAt(position) {
        if (!this.view.length) {
            return undefined;
        }
        const idx = this.view.indexAt(position);
        const clamped = clamp(idx, 0, this.view.length - 1);
        return this.element(clamped);
    }
    elementHeight(element) {
        const index = this._getViewIndexUpperBound(element);
        if (index === undefined || index < 0 || index >= this.length) {
            this._getViewIndexUpperBound(element);
            throw new ListError(this.listUser, `Invalid index ${index}`);
        }
        return this.view.elementHeight(index);
    }
    detachViewModel() {
        this._viewModelStore.clear();
        this._viewModel = null;
        this.hiddenRangesPrefixSum = null;
    }
    attachViewModel(model) {
        this._viewModel = model;
        this._viewModelStore.add(model.onDidChangeViewCells((e) => {
            if (this._isDisposed) {
                return;
            }
            // update whitespaces which are anchored to the model indexes
            this.viewZones.onCellsChanged(e);
            this.cellOverlays.onCellsChanged(e);
            const currentRanges = this._hiddenRangeIds.map(id => this._viewModel.getTrackedRange(id)).filter(range => range !== null);
            const newVisibleViewCells = getVisibleCells(this._viewModel.viewCells, currentRanges);
            const oldVisibleViewCells = [];
            const oldViewCellMapping = new Set();
            for (let i = 0; i < this.length; i++) {
                oldVisibleViewCells.push(this.element(i));
                oldViewCellMapping.add(this.element(i).uri.toString());
            }
            const viewDiffs = diff(oldVisibleViewCells, newVisibleViewCells, a => {
                return oldViewCellMapping.has(a.uri.toString());
            });
            if (e.synchronous) {
                this._updateElementsInWebview(viewDiffs);
            }
            else {
                this._viewModelStore.add(DOM.scheduleAtNextAnimationFrame(DOM.getWindow(this.rowsContainer), () => {
                    if (this._isDisposed) {
                        return;
                    }
                    this._updateElementsInWebview(viewDiffs);
                }));
            }
        }));
        this._viewModelStore.add(model.onDidChangeSelection((e) => {
            if (e === 'view') {
                return;
            }
            // convert model selections to view selections
            const viewSelections = cellRangesToIndexes(model.getSelections()).map(index => model.cellAt(index)).filter(cell => !!cell).map(cell => this._getViewIndexUpperBound(cell));
            this.setSelection(viewSelections, undefined, true);
            const primary = cellRangesToIndexes([model.getFocus()]).map(index => model.cellAt(index)).filter(cell => !!cell).map(cell => this._getViewIndexUpperBound(cell));
            if (primary.length) {
                this.setFocus(primary, undefined, true);
            }
        }));
        const hiddenRanges = model.getHiddenRanges();
        this.setHiddenAreas(hiddenRanges, false);
        const newRanges = reduceCellRanges(hiddenRanges);
        const viewCells = model.viewCells.slice(0);
        newRanges.reverse().forEach(range => {
            const removedCells = viewCells.splice(range.start, range.end - range.start + 1);
            this._onDidRemoveCellsFromView.fire(removedCells);
        });
        this.splice2(0, 0, viewCells);
    }
    _updateElementsInWebview(viewDiffs) {
        viewDiffs.reverse().forEach((diff) => {
            const hiddenOutputs = [];
            const deletedOutputs = [];
            const removedMarkdownCells = [];
            for (let i = diff.start; i < diff.start + diff.deleteCount; i++) {
                const cell = this.element(i);
                if (cell.cellKind === CellKind.Code) {
                    if (this._viewModel.hasCell(cell)) {
                        hiddenOutputs.push(...cell?.outputsViewModels);
                    }
                    else {
                        deletedOutputs.push(...cell?.outputsViewModels);
                    }
                }
                else {
                    removedMarkdownCells.push(cell);
                }
            }
            this.splice2(diff.start, diff.deleteCount, diff.toInsert);
            this._onDidHideOutputs.fire(hiddenOutputs);
            this._onDidRemoveOutputs.fire(deletedOutputs);
            this._onDidRemoveCellsFromView.fire(removedMarkdownCells);
        });
    }
    clear() {
        super.splice(0, this.length);
    }
    setHiddenAreas(_ranges, triggerViewUpdate) {
        if (!this._viewModel) {
            return false;
        }
        const newRanges = reduceCellRanges(_ranges);
        // delete old tracking ranges
        const oldRanges = this._hiddenRangeIds.map(id => this._viewModel.getTrackedRange(id)).filter(range => range !== null);
        if (newRanges.length === oldRanges.length) {
            let hasDifference = false;
            for (let i = 0; i < newRanges.length; i++) {
                if (!(newRanges[i].start === oldRanges[i].start && newRanges[i].end === oldRanges[i].end)) {
                    hasDifference = true;
                    break;
                }
            }
            if (!hasDifference) {
                // they call 'setHiddenAreas' for a reason, even if the ranges are still the same, it's possible that the hiddenRangeSum is not update to date
                this._updateHiddenRangePrefixSum(newRanges);
                this.viewZones.onHiddenRangesChange();
                this.viewZones.layout();
                this.cellOverlays.onHiddenRangesChange();
                this.cellOverlays.layout();
                return false;
            }
        }
        this._hiddenRangeIds.forEach(id => this._viewModel.setTrackedRange(id, null, 3 /* TrackedRangeStickiness.GrowsOnlyWhenTypingAfter */));
        const hiddenAreaIds = newRanges.map(range => this._viewModel.setTrackedRange(null, range, 3 /* TrackedRangeStickiness.GrowsOnlyWhenTypingAfter */)).filter(id => id !== null);
        this._hiddenRangeIds = hiddenAreaIds;
        // set hidden ranges prefix sum
        this._updateHiddenRangePrefixSum(newRanges);
        // Update view zone positions after hidden ranges change
        this.viewZones.onHiddenRangesChange();
        this.cellOverlays.onHiddenRangesChange();
        if (triggerViewUpdate) {
            this.updateHiddenAreasInView(oldRanges, newRanges);
        }
        this.viewZones.layout();
        this.cellOverlays.layout();
        return true;
    }
    _updateHiddenRangePrefixSum(newRanges) {
        let start = 0;
        let index = 0;
        const ret = [];
        while (index < newRanges.length) {
            for (let j = start; j < newRanges[index].start - 1; j++) {
                ret.push(1);
            }
            ret.push(newRanges[index].end - newRanges[index].start + 1 + 1);
            start = newRanges[index].end + 1;
            index++;
        }
        for (let i = start; i < this._viewModel.length; i++) {
            ret.push(1);
        }
        const values = new Uint32Array(ret.length);
        for (let i = 0; i < ret.length; i++) {
            values[i] = ret[i];
        }
        this.hiddenRangesPrefixSum = new PrefixSumComputer(values);
    }
    /**
     * oldRanges and newRanges are all reduced and sorted.
     */
    updateHiddenAreasInView(oldRanges, newRanges) {
        const oldViewCellEntries = getVisibleCells(this._viewModel.viewCells, oldRanges);
        const oldViewCellMapping = new Set();
        oldViewCellEntries.forEach(cell => {
            oldViewCellMapping.add(cell.uri.toString());
        });
        const newViewCellEntries = getVisibleCells(this._viewModel.viewCells, newRanges);
        const viewDiffs = diff(oldViewCellEntries, newViewCellEntries, a => {
            return oldViewCellMapping.has(a.uri.toString());
        });
        this._updateElementsInWebview(viewDiffs);
    }
    splice2(start, deleteCount, elements = []) {
        // we need to convert start and delete count based on hidden ranges
        if (start < 0 || start > this.view.length) {
            return;
        }
        const focusInside = DOM.isAncestorOfActiveElement(this.rowsContainer);
        super.splice(start, deleteCount, elements);
        if (focusInside) {
            this.domFocus();
        }
        const selectionsLeft = [];
        this.getSelectedElements().forEach(el => {
            if (this._viewModel.hasCell(el)) {
                selectionsLeft.push(el.handle);
            }
        });
        if (!selectionsLeft.length && this._viewModel.viewCells.length) {
            // after splice, the selected cells are deleted
            this._viewModel.updateSelectionsState({ kind: SelectionStateType.Index, focus: { start: 0, end: 1 }, selections: [{ start: 0, end: 1 }] });
        }
        this.viewZones.layout();
        this.cellOverlays.layout();
    }
    getModelIndex(cell) {
        const viewIndex = this.indexOf(cell);
        return this.getModelIndex2(viewIndex);
    }
    getModelIndex2(viewIndex) {
        if (!this.hiddenRangesPrefixSum) {
            return viewIndex;
        }
        const modelIndex = this.hiddenRangesPrefixSum.getPrefixSum(viewIndex - 1);
        return modelIndex;
    }
    getViewIndex(cell) {
        const modelIndex = this._viewModel.getCellIndex(cell);
        return this.getViewIndex2(modelIndex);
    }
    getViewIndex2(modelIndex) {
        if (!this.hiddenRangesPrefixSum) {
            return modelIndex;
        }
        const viewIndexInfo = this.hiddenRangesPrefixSum.getIndexOf(modelIndex);
        if (viewIndexInfo.remainder !== 0) {
            if (modelIndex >= this.hiddenRangesPrefixSum.getTotalSum()) {
                // it's already after the last hidden range
                return modelIndex - (this.hiddenRangesPrefixSum.getTotalSum() - this.hiddenRangesPrefixSum.getCount());
            }
            return undefined;
        }
        else {
            return viewIndexInfo.index;
        }
    }
    convertModelIndexToViewIndex(modelIndex) {
        if (!this.hiddenRangesPrefixSum) {
            return modelIndex;
        }
        if (modelIndex >= this.hiddenRangesPrefixSum.getTotalSum()) {
            // it's already after the last hidden range
            return Math.min(this.length, this.hiddenRangesPrefixSum.getTotalSum());
        }
        return this.hiddenRangesPrefixSum.getIndexOf(modelIndex).index;
    }
    modelIndexIsVisible(modelIndex) {
        if (!this.hiddenRangesPrefixSum) {
            return true;
        }
        const viewIndexInfo = this.hiddenRangesPrefixSum.getIndexOf(modelIndex);
        if (viewIndexInfo.remainder !== 0) {
            if (modelIndex >= this.hiddenRangesPrefixSum.getTotalSum()) {
                // it's already after the last hidden range
                return true;
            }
            return false;
        }
        else {
            return true;
        }
    }
    _getVisibleRangesFromIndex(topViewIndex, topModelIndex, bottomViewIndex, bottomModelIndex) {
        const stack = [];
        const ranges = [];
        // there are hidden ranges
        let index = topViewIndex;
        let modelIndex = topModelIndex;
        while (index <= bottomViewIndex) {
            const accu = this.hiddenRangesPrefixSum.getPrefixSum(index);
            if (accu === modelIndex + 1) {
                // no hidden area after it
                if (stack.length) {
                    if (stack[stack.length - 1] === modelIndex - 1) {
                        ranges.push({ start: stack[stack.length - 1], end: modelIndex + 1 });
                    }
                    else {
                        ranges.push({ start: stack[stack.length - 1], end: stack[stack.length - 1] + 1 });
                    }
                }
                stack.push(modelIndex);
                index++;
                modelIndex++;
            }
            else {
                // there are hidden ranges after it
                if (stack.length) {
                    if (stack[stack.length - 1] === modelIndex - 1) {
                        ranges.push({ start: stack[stack.length - 1], end: modelIndex + 1 });
                    }
                    else {
                        ranges.push({ start: stack[stack.length - 1], end: stack[stack.length - 1] + 1 });
                    }
                }
                stack.push(modelIndex);
                index++;
                modelIndex = accu;
            }
        }
        if (stack.length) {
            ranges.push({ start: stack[stack.length - 1], end: stack[stack.length - 1] + 1 });
        }
        return reduceCellRanges(ranges);
    }
    getVisibleRangesPlusViewportAboveAndBelow() {
        if (this.view.length <= 0) {
            return [];
        }
        const top = Math.max(this.getViewScrollTop() - this.renderHeight, 0);
        const topViewIndex = this.view.indexAt(top);
        const topElement = this.view.element(topViewIndex);
        const topModelIndex = this._viewModel.getCellIndex(topElement);
        const bottom = clamp(this.getViewScrollBottom() + this.renderHeight, 0, this.scrollHeight);
        const bottomViewIndex = clamp(this.view.indexAt(bottom), 0, this.view.length - 1);
        const bottomElement = this.view.element(bottomViewIndex);
        const bottomModelIndex = this._viewModel.getCellIndex(bottomElement);
        if (bottomModelIndex - topModelIndex === bottomViewIndex - topViewIndex) {
            return [{ start: topModelIndex, end: bottomModelIndex }];
        }
        else {
            return this._getVisibleRangesFromIndex(topViewIndex, topModelIndex, bottomViewIndex, bottomModelIndex);
        }
    }
    _getViewIndexUpperBound(cell) {
        if (!this._viewModel) {
            return -1;
        }
        const modelIndex = this._viewModel.getCellIndex(cell);
        if (modelIndex === -1) {
            return -1;
        }
        if (!this.hiddenRangesPrefixSum) {
            return modelIndex;
        }
        const viewIndexInfo = this.hiddenRangesPrefixSum.getIndexOf(modelIndex);
        if (viewIndexInfo.remainder !== 0) {
            if (modelIndex >= this.hiddenRangesPrefixSum.getTotalSum()) {
                return modelIndex - (this.hiddenRangesPrefixSum.getTotalSum() - this.hiddenRangesPrefixSum.getCount());
            }
        }
        return viewIndexInfo.index;
    }
    _getViewIndexUpperBound2(modelIndex) {
        if (!this.hiddenRangesPrefixSum) {
            return modelIndex;
        }
        const viewIndexInfo = this.hiddenRangesPrefixSum.getIndexOf(modelIndex);
        if (viewIndexInfo.remainder !== 0) {
            if (modelIndex >= this.hiddenRangesPrefixSum.getTotalSum()) {
                return modelIndex - (this.hiddenRangesPrefixSum.getTotalSum() - this.hiddenRangesPrefixSum.getCount());
            }
        }
        return viewIndexInfo.index;
    }
    focusElement(cell) {
        const index = this._getViewIndexUpperBound(cell);
        if (index >= 0 && this._viewModel) {
            // update view model first, which will update both `focus` and `selection` in a single transaction
            const focusedElementHandle = this.element(index).handle;
            this._viewModel.updateSelectionsState({
                kind: SelectionStateType.Handle,
                primary: focusedElementHandle,
                selections: [focusedElementHandle]
            }, 'view');
            // update the view as previous model update will not trigger event
            this.setFocus([index], undefined, false);
        }
    }
    selectElements(elements) {
        const indices = elements.map(cell => this._getViewIndexUpperBound(cell)).filter(index => index >= 0);
        this.setSelection(indices);
    }
    getCellViewScrollTop(cell) {
        const index = this._getViewIndexUpperBound(cell);
        if (index === undefined || index < 0 || index >= this.length) {
            throw new ListError(this.listUser, `Invalid index ${index}`);
        }
        return this.view.elementTop(index);
    }
    getCellViewScrollBottom(cell) {
        const index = this._getViewIndexUpperBound(cell);
        if (index === undefined || index < 0 || index >= this.length) {
            throw new ListError(this.listUser, `Invalid index ${index}`);
        }
        const top = this.view.elementTop(index);
        const height = this.view.elementHeight(index);
        return top + height;
    }
    setFocus(indexes, browserEvent, ignoreTextModelUpdate) {
        if (ignoreTextModelUpdate) {
            super.setFocus(indexes, browserEvent);
            return;
        }
        if (!indexes.length) {
            if (this._viewModel) {
                if (this.length) {
                    // Don't allow clearing focus, #121129
                    return;
                }
                this._viewModel.updateSelectionsState({
                    kind: SelectionStateType.Handle,
                    primary: null,
                    selections: []
                }, 'view');
            }
        }
        else {
            if (this._viewModel) {
                const focusedElementHandle = this.element(indexes[0]).handle;
                this._viewModel.updateSelectionsState({
                    kind: SelectionStateType.Handle,
                    primary: focusedElementHandle,
                    selections: this.getSelection().map(selection => this.element(selection).handle)
                }, 'view');
            }
        }
        super.setFocus(indexes, browserEvent);
    }
    setSelection(indexes, browserEvent, ignoreTextModelUpdate) {
        if (ignoreTextModelUpdate) {
            super.setSelection(indexes, browserEvent);
            return;
        }
        if (!indexes.length) {
            if (this._viewModel) {
                this._viewModel.updateSelectionsState({
                    kind: SelectionStateType.Handle,
                    primary: this.getFocusedElements()[0]?.handle ?? null,
                    selections: []
                }, 'view');
            }
        }
        else {
            if (this._viewModel) {
                this._viewModel.updateSelectionsState({
                    kind: SelectionStateType.Handle,
                    primary: this.getFocusedElements()[0]?.handle ?? null,
                    selections: indexes.map(index => this.element(index)).map(cell => cell.handle)
                }, 'view');
            }
        }
        super.setSelection(indexes, browserEvent);
    }
    /**
     * The range will be revealed with as little scrolling as possible.
     */
    revealCells(range) {
        const startIndex = this._getViewIndexUpperBound2(range.start);
        if (startIndex < 0) {
            return;
        }
        const endIndex = this._getViewIndexUpperBound2(range.end - 1);
        const scrollTop = this.getViewScrollTop();
        const wrapperBottom = this.getViewScrollBottom();
        const elementTop = this.view.elementTop(startIndex);
        if (elementTop >= scrollTop
            && elementTop < wrapperBottom) {
            // start element is visible
            // check end
            const endElementTop = this.view.elementTop(endIndex);
            const endElementHeight = this.view.elementHeight(endIndex);
            if (endElementTop + endElementHeight <= wrapperBottom) {
                // fully visible
                return;
            }
            if (endElementTop >= wrapperBottom) {
                return this._revealInternal(endIndex, false, 2 /* CellRevealPosition.Bottom */);
            }
            if (endElementTop < wrapperBottom) {
                // end element partially visible
                if (endElementTop + endElementHeight - wrapperBottom < elementTop - scrollTop) {
                    // there is enough space to just scroll up a little bit to make the end element visible
                    return this.view.setScrollTop(scrollTop + endElementTop + endElementHeight - wrapperBottom);
                }
                else {
                    // don't even try it
                    return this._revealInternal(startIndex, false, 0 /* CellRevealPosition.Top */);
                }
            }
        }
        this._revealInViewWithMinimalScrolling(startIndex);
    }
    _revealInViewWithMinimalScrolling(viewIndex, firstLine) {
        const firstIndex = this.view.firstMostlyVisibleIndex;
        const elementHeight = this.view.elementHeight(viewIndex);
        if (viewIndex <= firstIndex || (!firstLine && elementHeight >= this.view.renderHeight)) {
            this._revealInternal(viewIndex, true, 0 /* CellRevealPosition.Top */);
        }
        else {
            this._revealInternal(viewIndex, true, 2 /* CellRevealPosition.Bottom */, firstLine);
        }
    }
    scrollToBottom() {
        const scrollHeight = this.view.scrollHeight;
        const scrollTop = this.getViewScrollTop();
        const wrapperBottom = this.getViewScrollBottom();
        this.view.setScrollTop(scrollHeight - (wrapperBottom - scrollTop));
    }
    /**
     * Reveals the given cell in the notebook cell list. The cell will come into view syncronously
     * but the cell's editor will be attached asyncronously if it was previously out of view.
     * @returns The promise to await for the cell editor to be attached
     */
    async revealCell(cell, revealType) {
        const index = this._getViewIndexUpperBound(cell);
        if (index < 0) {
            return;
        }
        switch (revealType) {
            case 2 /* CellRevealType.Top */:
                this._revealInternal(index, false, 0 /* CellRevealPosition.Top */);
                break;
            case 3 /* CellRevealType.Center */:
                this._revealInternal(index, false, 1 /* CellRevealPosition.Center */);
                break;
            case 4 /* CellRevealType.CenterIfOutsideViewport */:
                this._revealInternal(index, true, 1 /* CellRevealPosition.Center */);
                break;
            case 5 /* CellRevealType.NearTopIfOutsideViewport */:
                this._revealInternal(index, true, 3 /* CellRevealPosition.NearTop */);
                break;
            case 6 /* CellRevealType.FirstLineIfOutsideViewport */:
                this._revealInViewWithMinimalScrolling(index, true);
                break;
            case 1 /* CellRevealType.Default */:
                this._revealInViewWithMinimalScrolling(index);
                break;
        }
        if ((
        // wait for the editor to be created if the cell is in editing mode
        cell.getEditState() === CellEditState.Editing
            // wait for the editor to be created if we are revealing the first line of the cell
            || (revealType === 6 /* CellRevealType.FirstLineIfOutsideViewport */ && cell.cellKind === CellKind.Code)) && !cell.editorAttached) {
            return getEditorAttachedPromise(cell);
        }
        return;
    }
    _revealInternal(viewIndex, ignoreIfInsideViewport, revealPosition, firstLine) {
        if (viewIndex >= this.view.length) {
            return;
        }
        const scrollTop = this.getViewScrollTop();
        const wrapperBottom = this.getViewScrollBottom();
        const elementTop = this.view.elementTop(viewIndex);
        const elementBottom = this.view.elementHeight(viewIndex) + elementTop;
        if (ignoreIfInsideViewport) {
            if (elementTop >= scrollTop && elementBottom < wrapperBottom) {
                // element is already fully visible
                return;
            }
        }
        switch (revealPosition) {
            case 0 /* CellRevealPosition.Top */:
                this.view.setScrollTop(elementTop);
                this.view.setScrollTop(this.view.elementTop(viewIndex));
                break;
            case 1 /* CellRevealPosition.Center */:
            case 3 /* CellRevealPosition.NearTop */:
                {
                    // reveal the cell top in the viewport center initially
                    this.view.setScrollTop(elementTop - this.view.renderHeight / 2);
                    // cell rendered already, we now have a more accurate cell height
                    const newElementTop = this.view.elementTop(viewIndex);
                    const newElementHeight = this.view.elementHeight(viewIndex);
                    const renderHeight = this.getViewScrollBottom() - this.getViewScrollTop();
                    if (newElementHeight >= renderHeight) {
                        // cell is larger than viewport, reveal top
                        this.view.setScrollTop(newElementTop);
                    }
                    else if (revealPosition === 1 /* CellRevealPosition.Center */) {
                        this.view.setScrollTop(newElementTop + (newElementHeight / 2) - (renderHeight / 2));
                    }
                    else if (revealPosition === 3 /* CellRevealPosition.NearTop */) {
                        this.view.setScrollTop(newElementTop - (renderHeight / 5));
                    }
                }
                break;
            case 2 /* CellRevealPosition.Bottom */:
                if (firstLine) {
                    const lineHeight = this.viewModel?.layoutInfo?.fontInfo.lineHeight ?? 15;
                    const padding = this.notebookOptions.getLayoutConfiguration().cellTopMargin + this.notebookOptions.getLayoutConfiguration().editorTopPadding;
                    const firstLineLocation = elementTop + lineHeight + padding;
                    if (firstLineLocation < wrapperBottom) {
                        // first line is already visible
                        return;
                    }
                    this.view.setScrollTop(this.scrollTop + (firstLineLocation - wrapperBottom));
                    break;
                }
                this.view.setScrollTop(this.scrollTop + (elementBottom - wrapperBottom));
                this.view.setScrollTop(this.scrollTop + (this.view.elementTop(viewIndex) + this.view.elementHeight(viewIndex) - this.getViewScrollBottom()));
                break;
            default:
                break;
        }
    }
    //#region Reveal Cell Editor Range asynchronously
    async revealRangeInCell(cell, range, revealType) {
        const index = this._getViewIndexUpperBound(cell);
        if (index < 0) {
            return;
        }
        switch (revealType) {
            case CellRevealRangeType.Default:
                return this._revealRangeInternalAsync(index, range);
            case CellRevealRangeType.Center:
                return this._revealRangeInCenterInternalAsync(index, range);
            case CellRevealRangeType.CenterIfOutsideViewport:
                return this._revealRangeInCenterIfOutsideViewportInternalAsync(index, range);
        }
    }
    // List items have real dynamic heights, which means after we set `scrollTop` based on the `elementTop(index)`, the element at `index` might still be removed from the view once all relayouting tasks are done.
    // For example, we scroll item 10 into the view upwards, in the first round, items 7, 8, 9, 10 are all in the viewport. Then item 7 and 8 resize themselves to be larger and finally item 10 is removed from the view.
    // To ensure that item 10 is always there, we need to scroll item 10 to the top edge of the viewport.
    async _revealRangeInternalAsync(viewIndex, range) {
        const scrollTop = this.getViewScrollTop();
        const wrapperBottom = this.getViewScrollBottom();
        const elementTop = this.view.elementTop(viewIndex);
        const element = this.view.element(viewIndex);
        if (element.editorAttached) {
            this._revealRangeCommon(viewIndex, range);
        }
        else {
            const elementHeight = this.view.elementHeight(viewIndex);
            let alignHint = undefined;
            if (elementTop + elementHeight <= scrollTop) {
                // scroll up
                this.view.setScrollTop(elementTop);
                alignHint = 'top';
            }
            else if (elementTop >= wrapperBottom) {
                // scroll down
                this.view.setScrollTop(elementTop - this.view.renderHeight / 2);
                alignHint = 'bottom';
            }
            const editorAttachedPromise = new Promise((resolve, reject) => {
                Event.once(element.onDidChangeEditorAttachState)(() => {
                    element.editorAttached ? resolve() : reject();
                });
            });
            return editorAttachedPromise.then(() => {
                this._revealRangeCommon(viewIndex, range, alignHint);
            });
        }
    }
    async _revealRangeInCenterInternalAsync(viewIndex, range) {
        const reveal = (viewIndex, range) => {
            const element = this.view.element(viewIndex);
            const positionOffset = element.getPositionScrollTopOffset(range);
            const positionOffsetInView = this.view.elementTop(viewIndex) + positionOffset;
            this.view.setScrollTop(positionOffsetInView - this.view.renderHeight / 2);
            element.revealRangeInCenter(range);
        };
        const elementTop = this.view.elementTop(viewIndex);
        const viewItemOffset = elementTop;
        this.view.setScrollTop(viewItemOffset - this.view.renderHeight / 2);
        const element = this.view.element(viewIndex);
        if (!element.editorAttached) {
            return getEditorAttachedPromise(element).then(() => reveal(viewIndex, range));
        }
        else {
            reveal(viewIndex, range);
        }
    }
    async _revealRangeInCenterIfOutsideViewportInternalAsync(viewIndex, range) {
        const reveal = (viewIndex, range) => {
            const element = this.view.element(viewIndex);
            const positionOffset = element.getPositionScrollTopOffset(range);
            const positionOffsetInView = this.view.elementTop(viewIndex) + positionOffset;
            this.view.setScrollTop(positionOffsetInView - this.view.renderHeight / 2);
            element.revealRangeInCenter(range);
        };
        const scrollTop = this.getViewScrollTop();
        const wrapperBottom = this.getViewScrollBottom();
        const elementTop = this.view.elementTop(viewIndex);
        const viewItemOffset = elementTop;
        const element = this.view.element(viewIndex);
        const positionOffset = viewItemOffset + element.getPositionScrollTopOffset(range);
        if (positionOffset < scrollTop || positionOffset > wrapperBottom) {
            // let it render
            this.view.setScrollTop(positionOffset - this.view.renderHeight / 2);
            // after rendering, it might be pushed down due to markdown cell dynamic height
            const newPositionOffset = this.view.elementTop(viewIndex) + element.getPositionScrollTopOffset(range);
            this.view.setScrollTop(newPositionOffset - this.view.renderHeight / 2);
            // reveal editor
            if (!element.editorAttached) {
                return getEditorAttachedPromise(element).then(() => reveal(viewIndex, range));
            }
            else {
                // for example markdown
            }
        }
        else {
            if (element.editorAttached) {
                element.revealRangeInCenter(range);
            }
            else {
                // for example, markdown cell in preview mode
                return getEditorAttachedPromise(element).then(() => reveal(viewIndex, range));
            }
        }
    }
    _revealRangeCommon(viewIndex, range, alignHint) {
        const element = this.view.element(viewIndex);
        const scrollTop = this.getViewScrollTop();
        const wrapperBottom = this.getViewScrollBottom();
        const positionOffset = element.getPositionScrollTopOffset(range);
        const elementOriginalHeight = this.view.elementHeight(viewIndex);
        if (positionOffset >= elementOriginalHeight) {
            // we are revealing a range that is beyond current element height
            // if we don't update the element height now, and directly `setTop` to reveal the range
            // the element might be scrolled out of view
            // next frame, when we update the element height, the element will never be scrolled back into view
            const newTotalHeight = element.layoutInfo.totalHeight;
            this.updateElementHeight(viewIndex, newTotalHeight);
        }
        const elementTop = this.view.elementTop(viewIndex);
        const positionTop = elementTop + positionOffset;
        // TODO@rebornix 30 ---> line height * 1.5
        if (positionTop < scrollTop) {
            this.view.setScrollTop(positionTop - 30);
        }
        else if (positionTop > wrapperBottom) {
            this.view.setScrollTop(scrollTop + positionTop - wrapperBottom + 30);
        }
        else if (alignHint === 'bottom') {
            // Scrolled into view from below
            this.view.setScrollTop(scrollTop + positionTop - wrapperBottom + 30);
        }
        else if (alignHint === 'top') {
            // Scrolled into view from above
            this.view.setScrollTop(positionTop - 30);
        }
    }
    //#endregion
    /**
     * Reveals the specified offset of the given cell in the center of the viewport.
     * This enables revealing locations in the output as well as the input.
     */
    revealCellOffsetInCenter(cell, offset) {
        const viewIndex = this._getViewIndexUpperBound(cell);
        if (viewIndex >= 0) {
            const element = this.view.element(viewIndex);
            const elementTop = this.view.elementTop(viewIndex);
            if (element instanceof MarkupCellViewModel) {
                return this._revealInCenterIfOutsideViewport(viewIndex);
            }
            else {
                const rangeOffset = element.layoutInfo.outputContainerOffset + Math.min(offset, element.layoutInfo.outputTotalHeight);
                this.view.setScrollTop(elementTop - this.view.renderHeight / 2);
                this.view.setScrollTop(elementTop + rangeOffset - this.view.renderHeight / 2);
            }
        }
    }
    revealOffsetInCenterIfOutsideViewport(offset) {
        const scrollTop = this.getViewScrollTop();
        const wrapperBottom = this.getViewScrollBottom();
        if (offset < scrollTop || offset > wrapperBottom) {
            const newTop = Math.max(0, offset - this.view.renderHeight / 2);
            this.view.setScrollTop(newTop);
        }
    }
    _revealInCenterIfOutsideViewport(viewIndex) {
        this._revealInternal(viewIndex, true, 1 /* CellRevealPosition.Center */);
    }
    domElementOfElement(element) {
        const index = this._getViewIndexUpperBound(element);
        if (index >= 0 && index < this.length) {
            return this.view.domElement(index);
        }
        return null;
    }
    focusView() {
        this.view.domNode.focus();
    }
    triggerScrollFromMouseWheelEvent(browserEvent) {
        this.view.delegateScrollFromMouseWheelEvent(browserEvent);
    }
    delegateVerticalScrollbarPointerDown(browserEvent) {
        this.view.delegateVerticalScrollbarPointerDown(browserEvent);
    }
    isElementAboveViewport(index) {
        const elementTop = this.view.elementTop(index);
        const elementBottom = elementTop + this.view.elementHeight(index);
        return elementBottom < this.scrollTop;
    }
    updateElementHeight2(element, size, anchorElementIndex = null) {
        const index = this._getViewIndexUpperBound(element);
        if (index === undefined || index < 0 || index >= this.length) {
            return;
        }
        if (this.isElementAboveViewport(index)) {
            // update element above viewport
            const oldHeight = this.elementHeight(element);
            const delta = oldHeight - size;
            if (this._webviewElement) {
                Event.once(this.view.onWillScroll)(() => {
                    const webviewTop = parseInt(this._webviewElement.domNode.style.top, 10);
                    if (validateWebviewBoundary(this._webviewElement.domNode)) {
                        this._webviewElement.setTop(webviewTop - delta);
                    }
                    else {
                        // When the webview top boundary is below the list view scrollable element top boundary, then we can't insert a markdown cell at the top
                        // or when its bottom boundary is above the list view bottom boundary, then we can't insert a markdown cell at the end
                        // thus we have to revert the webview element position to initial state `-NOTEBOOK_WEBVIEW_BOUNDARY`.
                        // this will trigger one visual flicker (as we need to update element offsets in the webview)
                        // but as long as NOTEBOOK_WEBVIEW_BOUNDARY is large enough, it will happen less often
                        this._webviewElement.setTop(-NOTEBOOK_WEBVIEW_BOUNDARY);
                    }
                });
            }
            this.view.updateElementHeight(index, size, anchorElementIndex);
            this.viewZones.layout();
            this.cellOverlays.layout();
            return;
        }
        if (anchorElementIndex !== null) {
            this.view.updateElementHeight(index, size, anchorElementIndex);
            this.viewZones.layout();
            this.cellOverlays.layout();
            return;
        }
        const focused = this.getFocus();
        const focus = focused.length ? focused[0] : null;
        if (focus) {
            // If the cell is growing, we should favor anchoring to the focused cell
            const heightDelta = size - this.view.elementHeight(index);
            if (this._notebookCellAnchor.shouldAnchor(this.view, focus, heightDelta, this.element(index))) {
                this.view.updateElementHeight(index, size, focus);
                this.viewZones.layout();
                this.cellOverlays.layout();
                return;
            }
        }
        this.view.updateElementHeight(index, size, null);
        this.viewZones.layout();
        this.cellOverlays.layout();
        return;
    }
    changeViewZones(callback) {
        if (this.viewZones.changeViewZones(callback)) {
            this.viewZones.layout();
        }
    }
    changeCellOverlays(callback) {
        if (this.cellOverlays.changeCellOverlays(callback)) {
            this.cellOverlays.layout();
        }
    }
    getViewZoneLayoutInfo(viewZoneId) {
        return this.viewZones.getViewZoneLayoutInfo(viewZoneId);
    }
    // override
    domFocus() {
        const focused = this.getFocusedElements()[0];
        const focusedDomElement = focused && this.domElementOfElement(focused);
        if (this.view.domNode.ownerDocument.activeElement && focusedDomElement && focusedDomElement.contains(this.view.domNode.ownerDocument.activeElement)) {
            // for example, when focus goes into monaco editor, if we refocus the list view, the editor will lose focus.
            return;
        }
        if (!isMacintosh && this.view.domNode.ownerDocument.activeElement && !!DOM.findParentWithClass(this.view.domNode.ownerDocument.activeElement, 'context-view')) {
            return;
        }
        super.domFocus();
    }
    focusContainer(clearSelection) {
        if (clearSelection) {
            // allow focus to be between cells
            this._viewModel?.updateSelectionsState({
                kind: SelectionStateType.Handle,
                primary: null,
                selections: []
            }, 'view');
            this.setFocus([], undefined, true);
            this.setSelection([], undefined, true);
        }
        super.domFocus();
    }
    getViewScrollTop() {
        return this.view.getScrollTop();
    }
    getViewScrollBottom() {
        return this.getViewScrollTop() + this.view.renderHeight;
    }
    setCellEditorSelection(cell, range) {
        const element = cell;
        if (element.editorAttached) {
            element.setSelection(range);
        }
        else {
            getEditorAttachedPromise(element).then(() => { element.setSelection(range); });
        }
    }
    style(styles) {
        const selectorSuffix = this.view.domId;
        if (!this.styleElement) {
            this.styleElement = domStylesheetsJs.createStyleSheet(this.view.domNode);
        }
        const suffix = selectorSuffix && `.${selectorSuffix}`;
        const content = [];
        if (styles.listBackground) {
            content.push(`.monaco-list${suffix} > div.monaco-scrollable-element > .monaco-list-rows { background: ${styles.listBackground}; }`);
        }
        if (styles.listFocusBackground) {
            content.push(`.monaco-list${suffix}:focus > div.monaco-scrollable-element > .monaco-list-rows > .monaco-list-row.focused { background-color: ${styles.listFocusBackground}; }`);
            content.push(`.monaco-list${suffix}:focus > div.monaco-scrollable-element > .monaco-list-rows > .monaco-list-row.focused:hover { background-color: ${styles.listFocusBackground}; }`); // overwrite :hover style in this case!
        }
        if (styles.listFocusForeground) {
            content.push(`.monaco-list${suffix}:focus > div.monaco-scrollable-element > .monaco-list-rows > .monaco-list-row.focused { color: ${styles.listFocusForeground}; }`);
        }
        if (styles.listActiveSelectionBackground) {
            content.push(`.monaco-list${suffix}:focus > div.monaco-scrollable-element > .monaco-list-rows > .monaco-list-row.selected { background-color: ${styles.listActiveSelectionBackground}; }`);
            content.push(`.monaco-list${suffix}:focus > div.monaco-scrollable-element > .monaco-list-rows > .monaco-list-row.selected:hover { background-color: ${styles.listActiveSelectionBackground}; }`); // overwrite :hover style in this case!
        }
        if (styles.listActiveSelectionForeground) {
            content.push(`.monaco-list${suffix}:focus > div.monaco-scrollable-element > .monaco-list-rows > .monaco-list-row.selected { color: ${styles.listActiveSelectionForeground}; }`);
        }
        if (styles.listFocusAndSelectionBackground) {
            content.push(`
				.monaco-drag-image${suffix},
				.monaco-list${suffix}:focus > div.monaco-scrollable-element > .monaco-list-rows > .monaco-list-row.selected.focused { background-color: ${styles.listFocusAndSelectionBackground}; }
			`);
        }
        if (styles.listFocusAndSelectionForeground) {
            content.push(`
				.monaco-drag-image${suffix},
				.monaco-list${suffix}:focus > div.monaco-scrollable-element > .monaco-list-rows > .monaco-list-row.selected.focused { color: ${styles.listFocusAndSelectionForeground}; }
			`);
        }
        if (styles.listInactiveFocusBackground) {
            content.push(`.monaco-list${suffix} > div.monaco-scrollable-element > .monaco-list-rows > .monaco-list-row.focused { background-color:  ${styles.listInactiveFocusBackground}; }`);
            content.push(`.monaco-list${suffix} > div.monaco-scrollable-element > .monaco-list-rows > .monaco-list-row.focused:hover { background-color:  ${styles.listInactiveFocusBackground}; }`); // overwrite :hover style in this case!
        }
        if (styles.listInactiveSelectionBackground) {
            content.push(`.monaco-list${suffix} > div.monaco-scrollable-element > .monaco-list-rows > .monaco-list-row.selected { background-color:  ${styles.listInactiveSelectionBackground}; }`);
            content.push(`.monaco-list${suffix} > div.monaco-scrollable-element > .monaco-list-rows > .monaco-list-row.selected:hover { background-color:  ${styles.listInactiveSelectionBackground}; }`); // overwrite :hover style in this case!
        }
        if (styles.listInactiveSelectionForeground) {
            content.push(`.monaco-list${suffix} > div.monaco-scrollable-element > .monaco-list-rows > .monaco-list-row.selected { color: ${styles.listInactiveSelectionForeground}; }`);
        }
        if (styles.listHoverBackground) {
            content.push(`.monaco-list${suffix}:not(.drop-target) > div.monaco-scrollable-element > .monaco-list-rows > .monaco-list-row:hover:not(.selected):not(.focused) { background-color:  ${styles.listHoverBackground}; }`);
        }
        if (styles.listHoverForeground) {
            content.push(`.monaco-list${suffix} > div.monaco-scrollable-element > .monaco-list-rows > .monaco-list-row:hover:not(.selected):not(.focused) { color:  ${styles.listHoverForeground}; }`);
        }
        if (styles.listSelectionOutline) {
            content.push(`.monaco-list${suffix} > div.monaco-scrollable-element > .monaco-list-rows > .monaco-list-row.selected { outline: 1px dotted ${styles.listSelectionOutline}; outline-offset: -1px; }`);
        }
        if (styles.listFocusOutline) {
            content.push(`
				.monaco-drag-image${suffix},
				.monaco-list${suffix}:focus > div.monaco-scrollable-element > .monaco-list-rows > .monaco-list-row.focused { outline: 1px solid ${styles.listFocusOutline}; outline-offset: -1px; }
			`);
        }
        if (styles.listInactiveFocusOutline) {
            content.push(`.monaco-list${suffix} > div.monaco-scrollable-element > .monaco-list-rows > .monaco-list-row.focused { outline: 1px dotted ${styles.listInactiveFocusOutline}; outline-offset: -1px; }`);
        }
        if (styles.listHoverOutline) {
            content.push(`.monaco-list${suffix} > div.monaco-scrollable-element > .monaco-list-rows > .monaco-list-row:hover { outline: 1px dashed ${styles.listHoverOutline}; outline-offset: -1px; }`);
        }
        if (styles.listDropOverBackground) {
            content.push(`
				.monaco-list${suffix}.drop-target,
				.monaco-list${suffix} > div.monaco-scrollable-element > .monaco-list-rows.drop-target,
				.monaco-list${suffix} > div.monaco-scrollable-element > .monaco-list-row.drop-target { background-color: ${styles.listDropOverBackground} !important; color: inherit !important; }
			`);
        }
        const newStyles = content.join('\n');
        if (newStyles !== this.styleElement.textContent) {
            this.styleElement.textContent = newStyles;
        }
    }
    getRenderHeight() {
        return this.view.renderHeight;
    }
    getScrollHeight() {
        return this.view.scrollHeight;
    }
    layout(height, width) {
        this._isInLayout = true;
        super.layout(height, width);
        if (this.renderHeight === 0) {
            this.view.domNode.style.visibility = 'hidden';
        }
        else {
            this.view.domNode.style.visibility = 'initial';
        }
        this._isInLayout = false;
    }
    dispose() {
        this._isDisposed = true;
        this._viewModelStore.dispose();
        this._localDisposableStore.dispose();
        this._notebookCellAnchor.dispose();
        this.viewZones.dispose();
        this.cellOverlays.dispose();
        super.dispose();
        // un-ref
        this._previousFocusedElements = [];
        this._viewModel = null;
        this._hiddenRangeIds = [];
        this.hiddenRangesPrefixSum = null;
        this._visibleRanges = [];
    }
};
NotebookCellList = __decorate([
    __param(7, IListService),
    __param(8, IConfigurationService),
    __param(9, IInstantiationService),
    __param(10, INotebookExecutionStateService)
], NotebookCellList);
export { NotebookCellList };
export class ListViewInfoAccessor extends Disposable {
    constructor(list) {
        super();
        this.list = list;
    }
    getViewIndex(cell) {
        return this.list.getViewIndex(cell) ?? -1;
    }
    getViewHeight(cell) {
        if (!this.list.viewModel) {
            return -1;
        }
        return this.list.elementHeight(cell);
    }
    getCellRangeFromViewRange(startIndex, endIndex) {
        if (!this.list.viewModel) {
            return undefined;
        }
        const modelIndex = this.list.getModelIndex2(startIndex);
        if (modelIndex === undefined) {
            throw new Error(`startIndex ${startIndex} out of boundary`);
        }
        if (endIndex >= this.list.length) {
            // it's the end
            const endModelIndex = this.list.viewModel.length;
            return { start: modelIndex, end: endModelIndex };
        }
        else {
            const endModelIndex = this.list.getModelIndex2(endIndex);
            if (endModelIndex === undefined) {
                throw new Error(`endIndex ${endIndex} out of boundary`);
            }
            return { start: modelIndex, end: endModelIndex };
        }
    }
    getCellsFromViewRange(startIndex, endIndex) {
        if (!this.list.viewModel) {
            return [];
        }
        const range = this.getCellRangeFromViewRange(startIndex, endIndex);
        if (!range) {
            return [];
        }
        return this.list.viewModel.getCellsInRange(range);
    }
    getCellsInRange(range) {
        return this.list.viewModel?.getCellsInRange(range) ?? [];
    }
    getVisibleRangesPlusViewportAboveAndBelow() {
        return this.list?.getVisibleRangesPlusViewportAboveAndBelow() ?? [];
    }
}
function getEditorAttachedPromise(element) {
    return new Promise((resolve, reject) => {
        Event.once(element.onDidChangeEditorAttachState)(() => element.editorAttached ? resolve() : reject());
    });
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibm90ZWJvb2tDZWxsTGlzdC5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL25vdGVib29rL2Jyb3dzZXIvdmlldy9ub3RlYm9va0NlbGxMaXN0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7O0FBRWhHLE9BQU8sS0FBSyxHQUFHLE1BQU0sb0NBQW9DLENBQUM7QUFDMUQsT0FBTyxLQUFLLGdCQUFnQixNQUFNLCtDQUErQyxDQUFDO0FBRWxGLE9BQU8sRUFBdUMsU0FBUyxFQUFFLE1BQU0sNkNBQTZDLENBQUM7QUFFN0csT0FBTyxFQUFFLE9BQU8sRUFBRSxLQUFLLEVBQUUsTUFBTSxxQ0FBcUMsQ0FBQztBQUNyRSxPQUFPLEVBQUUsVUFBVSxFQUFFLGVBQWUsRUFBZSxpQkFBaUIsRUFBRSxNQUFNLHlDQUF5QyxDQUFDO0FBQ3RILE9BQU8sRUFBRSxXQUFXLEVBQUUsTUFBTSx3Q0FBd0MsQ0FBQztBQUtyRSxPQUFPLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSx5REFBeUQsQ0FBQztBQUM1RixPQUFPLEVBQUUscUJBQXFCLEVBQUUsTUFBTSwrREFBK0QsQ0FBQztBQUV0RyxPQUFPLEVBQUUsWUFBWSxFQUF5QixhQUFhLEVBQUUsTUFBTSxxREFBcUQsQ0FBQztBQUN6SCxPQUFPLEVBQUUsZ0JBQWdCLEVBQWtCLGFBQWEsRUFBd0MsbUJBQW1CLEVBQUUsb0JBQW9CLEVBQXVFLE1BQU0sdUJBQXVCLENBQUM7QUFFOU8sT0FBTyxFQUFFLElBQUksRUFBRSwrQkFBK0IsRUFBRSxRQUFRLEVBQUUsa0JBQWtCLEVBQUUsb0NBQW9DLEVBQUUsTUFBTSxnQ0FBZ0MsQ0FBQztBQUMzSixPQUFPLEVBQWMsbUJBQW1CLEVBQUUsZ0JBQWdCLEVBQUUsZUFBZSxFQUFFLE1BQU0sK0JBQStCLENBQUM7QUFDbkgsT0FBTyxFQUFF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