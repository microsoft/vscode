/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as DOM from '../../../../../../base/browser/dom.js';
import { Delayer } from '../../../../../../base/common/async.js';
import { Disposable, MutableDisposable } from '../../../../../../base/common/lifecycle.js';
import * as platform from '../../../../../../base/common/platform.js';
import { expandCellRangesWithHiddenCells } from '../../notebookBrowser.js';
import { CellContentPart } from '../cellPart.js';
import { cloneNotebookCellTextModel } from '../../../common/model/notebookCellTextModel.js';
import { SelectionStateType } from '../../../common/notebookCommon.js';
import { cellRangesToIndexes } from '../../../common/notebookRange.js';
const $ = DOM.$;
const DRAGGING_CLASS = 'cell-dragging';
const GLOBAL_DRAG_CLASS = 'global-drag-active';
export class CellDragAndDropPart extends CellContentPart {
    constructor(container) {
        super();
        this.container = container;
    }
    didRenderCell(element) {
        this.update(element);
    }
    updateState(element, e) {
        if (e.dragStateChanged) {
            this.update(element);
        }
    }
    update(element) {
        this.container.classList.toggle(DRAGGING_CLASS, element.dragging);
    }
}
export class CellDragAndDropController extends Disposable {
    constructor(notebookEditor, notebookListContainer) {
        super();
        this.notebookEditor = notebookEditor;
        this.notebookListContainer = notebookListContainer;
        this.draggedCells = [];
        this.isScrolling = false;
        this.listOnWillScrollListener = this._register(new MutableDisposable());
        this.listInsertionIndicator = DOM.append(notebookListContainer, $('.cell-list-insertion-indicator'));
        this._register(DOM.addDisposableListener(notebookListContainer.ownerDocument.body, DOM.EventType.DRAG_START, this.onGlobalDragStart.bind(this), true));
        this._register(DOM.addDisposableListener(notebookListContainer.ownerDocument.body, DOM.EventType.DRAG_END, this.onGlobalDragEnd.bind(this), true));
        const addCellDragListener = (eventType, handler, useCapture = false) => {
            this._register(DOM.addDisposableListener(notebookEditor.getDomNode(), eventType, e => {
                const cellDragEvent = this.toCellDragEvent(e);
                if (cellDragEvent) {
                    handler(cellDragEvent);
                }
            }, useCapture));
        };
        addCellDragListener(DOM.EventType.DRAG_OVER, event => {
            if (!this.currentDraggedCell) {
                return;
            }
            event.browserEvent.preventDefault();
            this.onCellDragover(event);
        }, true);
        addCellDragListener(DOM.EventType.DROP, event => {
            if (!this.currentDraggedCell) {
                return;
            }
            event.browserEvent.preventDefault();
            this.onCellDrop(event);
        });
        addCellDragListener(DOM.EventType.DRAG_LEAVE, event => {
            event.browserEvent.preventDefault();
            this.onCellDragLeave(event);
        });
        this.scrollingDelayer = this._register(new Delayer(200));
    }
    setList(value) {
        this.list = value;
        this.listOnWillScrollListener.value = this.list.onWillScroll(e => {
            if (!e.scrollTopChanged) {
                return;
            }
            this.setInsertIndicatorVisibility(false);
            this.isScrolling = true;
            this.scrollingDelayer.trigger(() => {
                this.isScrolling = false;
            });
        });
    }
    setInsertIndicatorVisibility(visible) {
        this.listInsertionIndicator.style.opacity = visible ? '1' : '0';
    }
    toCellDragEvent(event) {
        const targetTop = this.notebookListContainer.getBoundingClientRect().top;
        const dragOffset = this.list.scrollTop + event.clientY - targetTop;
        const draggedOverCell = this.list.elementAt(dragOffset);
        if (!draggedOverCell) {
            return undefined;
        }
        const cellTop = this.list.getCellViewScrollTop(draggedOverCell);
        const cellHeight = this.list.elementHeight(draggedOverCell);
        const dragPosInElement = dragOffset - cellTop;
        const dragPosRatio = dragPosInElement / cellHeight;
        return {
            browserEvent: event,
            draggedOverCell,
            cellTop,
            cellHeight,
            dragPosRatio
        };
    }
    clearGlobalDragState() {
        this.notebookEditor.getDomNode().classList.remove(GLOBAL_DRAG_CLASS);
    }
    onGlobalDragStart() {
        this.notebookEditor.getDomNode().classList.add(GLOBAL_DRAG_CLASS);
    }
    onGlobalDragEnd() {
        this.notebookEditor.getDomNode().classList.remove(GLOBAL_DRAG_CLASS);
    }
    onCellDragover(event) {
        if (!event.browserEvent.dataTransfer) {
            return;
        }
        if (!this.currentDraggedCell) {
            event.browserEvent.dataTransfer.dropEffect = 'none';
            return;
        }
        if (this.isScrolling || this.currentDraggedCell === event.draggedOverCell) {
            this.setInsertIndicatorVisibility(false);
            return;
        }
        const dropDirection = this.getDropInsertDirection(event.dragPosRatio);
        const insertionIndicatorAbsolutePos = dropDirection === 'above' ? event.cellTop : event.cellTop + event.cellHeight;
        this.updateInsertIndicator(dropDirection, insertionIndicatorAbsolutePos);
    }
    updateInsertIndicator(dropDirection, insertionIndicatorAbsolutePos) {
        const { bottomToolbarGap } = this.notebookEditor.notebookOptions.computeBottomToolbarDimensions(this.notebookEditor.textModel?.viewType);
        const insertionIndicatorTop = insertionIndicatorAbsolutePos - this.list.scrollTop + bottomToolbarGap / 2;
        if (insertionIndicatorTop >= 0) {
            this.listInsertionIndicator.style.top = `${insertionIndicatorTop}px`;
            this.setInsertIndicatorVisibility(true);
        }
        else {
            this.setInsertIndicatorVisibility(false);
        }
    }
    getDropInsertDirection(dragPosRatio) {
        return dragPosRatio < 0.5 ? 'above' : 'below';
    }
    onCellDrop(event) {
        const draggedCell = this.currentDraggedCell;
        if (this.isScrolling || this.currentDraggedCell === event.draggedOverCell) {
            return;
        }
        this.dragCleanup();
        const dropDirection = this.getDropInsertDirection(event.dragPosRatio);
        this._dropImpl(draggedCell, dropDirection, event.browserEvent, event.draggedOverCell);
    }
    getCellRangeAroundDragTarget(draggedCellIndex) {
        const selections = this.notebookEditor.getSelections();
        const modelRanges = expandCellRangesWithHiddenCells(this.notebookEditor, selections);
        const nearestRange = modelRanges.find(range => range.start <= draggedCellIndex && draggedCellIndex < range.end);
        if (nearestRange) {
            return nearestRange;
        }
        else {
            return { start: draggedCellIndex, end: draggedCellIndex + 1 };
        }
    }
    _dropImpl(draggedCell, dropDirection, ctx, draggedOverCell) {
        const cellTop = this.list.getCellViewScrollTop(draggedOverCell);
        const cellHeight = this.list.elementHeight(draggedOverCell);
        const insertionIndicatorAbsolutePos = dropDirection === 'above' ? cellTop : cellTop + cellHeight;
        const { bottomToolbarGap } = this.notebookEditor.notebookOptions.computeBottomToolbarDimensions(this.notebookEditor.textModel?.viewType);
        const insertionIndicatorTop = insertionIndicatorAbsolutePos - this.list.scrollTop + bottomToolbarGap / 2;
        const editorHeight = this.notebookEditor.getDomNode().getBoundingClientRect().height;
        if (insertionIndicatorTop < 0 || insertionIndicatorTop > editorHeight) {
            // Ignore drop, insertion point is off-screen
            return;
        }
        const isCopy = (ctx.ctrlKey && !platform.isMacintosh) || (ctx.altKey && platform.isMacintosh);
        if (!this.notebookEditor.hasModel()) {
            return;
        }
        const textModel = this.notebookEditor.textModel;
        if (isCopy) {
            const draggedCellIndex = this.notebookEditor.getCellIndex(draggedCell);
            const range = this.getCellRangeAroundDragTarget(draggedCellIndex);
            let originalToIdx = this.notebookEditor.getCellIndex(draggedOverCell);
            if (dropDirection === 'below') {
                const relativeToIndex = this.notebookEditor.getCellIndex(draggedOverCell);
                const newIdx = this.notebookEditor.getNextVisibleCellIndex(relativeToIndex);
                originalToIdx = newIdx;
            }
            let finalSelection;
            let finalFocus;
            if (originalToIdx <= range.start) {
                finalSelection = { start: originalToIdx, end: originalToIdx + range.end - range.start };
                finalFocus = { start: originalToIdx + draggedCellIndex - range.start, end: originalToIdx + draggedCellIndex - range.start + 1 };
            }
            else {
                const delta = (originalToIdx - range.start);
                finalSelection = { start: range.start + delta, end: range.end + delta };
                finalFocus = { start: draggedCellIndex + delta, end: draggedCellIndex + delta + 1 };
            }
            textModel.applyEdits([
                {
                    editType: 1 /* CellEditType.Replace */,
                    index: originalToIdx,
                    count: 0,
                    cells: cellRangesToIndexes([range]).map(index => cloneNotebookCellTextModel(this.notebookEditor.cellAt(index).model))
                }
            ], true, { kind: SelectionStateType.Index, focus: this.notebookEditor.getFocus(), selections: this.notebookEditor.getSelections() }, () => ({ kind: SelectionStateType.Index, focus: finalFocus, selections: [finalSelection] }), undefined, true);
            this.notebookEditor.revealCellRangeInView(finalSelection);
        }
        else {
            performCellDropEdits(this.notebookEditor, draggedCell, dropDirection, draggedOverCell);
        }
    }
    onCellDragLeave(event) {
        if (!event.browserEvent.relatedTarget || !DOM.isAncestor(event.browserEvent.relatedTarget, this.notebookEditor.getDomNode())) {
            this.setInsertIndicatorVisibility(false);
        }
    }
    dragCleanup() {
        if (this.currentDraggedCell) {
            this.draggedCells.forEach(cell => cell.dragging = false);
            this.currentDraggedCell = undefined;
            this.draggedCells = [];
        }
        this.setInsertIndicatorVisibility(false);
    }
    registerDragHandle(templateData, cellRoot, dragHandles, dragImageProvider) {
        const container = templateData.container;
        for (const dragHandle of dragHandles) {
            dragHandle.setAttribute('draggable', 'true');
        }
        const onDragEnd = () => {
            if (!this.notebookEditor.notebookOptions.getDisplayOptions().dragAndDropEnabled || !!this.notebookEditor.isReadOnly) {
                return;
            }
            // Note, templateData may have a different element rendered into it by now
            container.classList.remove(DRAGGING_CLASS);
            this.dragCleanup();
        };
        for (const dragHandle of dragHandles) {
            templateData.templateDisposables.add(DOM.addDisposableListener(dragHandle, DOM.EventType.DRAG_END, onDragEnd));
        }
        const onDragStart = (event) => {
            if (!event.dataTransfer) {
                return;
            }
            if (!this.notebookEditor.notebookOptions.getDisplayOptions().dragAndDropEnabled || !!this.notebookEditor.isReadOnly) {
                return;
            }
            this.currentDraggedCell = templateData.currentRenderedCell;
            this.draggedCells = this.notebookEditor.getSelections().map(range => this.notebookEditor.getCellsInRange(range)).flat();
            this.draggedCells.forEach(cell => cell.dragging = true);
            const dragImage = dragImageProvider();
            cellRoot.parentElement.appendChild(dragImage);
            event.dataTransfer.setDragImage(dragImage, 0, 0);
            setTimeout(() => dragImage.remove(), 0); // Comment this out to debug drag image layout
        };
        for (const dragHandle of dragHandles) {
            templateData.templateDisposables.add(DOM.addDisposableListener(dragHandle, DOM.EventType.DRAG_START, onDragStart));
        }
    }
    startExplicitDrag(cell, _dragOffsetY) {
        if (!this.notebookEditor.notebookOptions.getDisplayOptions().dragAndDropEnabled || !!this.notebookEditor.isReadOnly) {
            return;
        }
        this.currentDraggedCell = cell;
        this.setInsertIndicatorVisibility(true);
    }
    explicitDrag(cell, dragOffsetY) {
        if (!this.notebookEditor.notebookOptions.getDisplayOptions().dragAndDropEnabled || !!this.notebookEditor.isReadOnly) {
            return;
        }
        const target = this.list.elementAt(dragOffsetY);
        if (target && target !== cell) {
            const cellTop = this.list.getCellViewScrollTop(target);
            const cellHeight = this.list.elementHeight(target);
            const dropDirection = this.getExplicitDragDropDirection(dragOffsetY, cellTop, cellHeight);
            const insertionIndicatorAbsolutePos = dropDirection === 'above' ? cellTop : cellTop + cellHeight;
            this.updateInsertIndicator(dropDirection, insertionIndicatorAbsolutePos);
        }
        // Try scrolling list if needed
        if (this.currentDraggedCell !== cell) {
            return;
        }
        const notebookViewRect = this.notebookEditor.getDomNode().getBoundingClientRect();
        const eventPositionInView = dragOffsetY - this.list.scrollTop;
        // Percentage from the top/bottom of the screen where we start scrolling while dragging
        const notebookViewScrollMargins = 0.2;
        const maxScrollDeltaPerFrame = 20;
        const eventPositionRatio = eventPositionInView / notebookViewRect.height;
        if (eventPositionRatio < notebookViewScrollMargins) {
            this.list.scrollTop -= maxScrollDeltaPerFrame * (1 - eventPositionRatio / notebookViewScrollMargins);
        }
        else if (eventPositionRatio > 1 - notebookViewScrollMargins) {
            this.list.scrollTop += maxScrollDeltaPerFrame * (1 - ((1 - eventPositionRatio) / notebookViewScrollMargins));
        }
    }
    endExplicitDrag(_cell) {
        this.setInsertIndicatorVisibility(false);
    }
    explicitDrop(cell, ctx) {
        this.currentDraggedCell = undefined;
        this.setInsertIndicatorVisibility(false);
        const target = this.list.elementAt(ctx.dragOffsetY);
        if (!target || target === cell) {
            return;
        }
        const cellTop = this.list.getCellViewScrollTop(target);
        const cellHeight = this.list.elementHeight(target);
        const dropDirection = this.getExplicitDragDropDirection(ctx.dragOffsetY, cellTop, cellHeight);
        this._dropImpl(cell, dropDirection, ctx, target);
    }
    getExplicitDragDropDirection(clientY, cellTop, cellHeight) {
        const dragPosInElement = clientY - cellTop;
        const dragPosRatio = dragPosInElement / cellHeight;
        return this.getDropInsertDirection(dragPosRatio);
    }
    dispose() {
        this.notebookEditor = null;
        super.dispose();
    }
}
export function performCellDropEdits(editor, draggedCell, dropDirection, draggedOverCell) {
    const draggedCellIndex = editor.getCellIndex(draggedCell);
    let originalToIdx = editor.getCellIndex(draggedOverCell);
    if (typeof draggedCellIndex !== 'number' || typeof originalToIdx !== 'number') {
        return;
    }
    // If dropped on a folded markdown range, insert after the folding range
    if (dropDirection === 'below') {
        const newIdx = editor.getNextVisibleCellIndex(originalToIdx) ?? originalToIdx;
        originalToIdx = newIdx;
    }
    let selections = editor.getSelections();
    if (!selections.length) {
        selections = [editor.getFocus()];
    }
    let originalFocusIdx = editor.getFocus().start;
    // If the dragged cell is not focused/selected, ignore the current focus/selection and use the dragged idx
    if (!selections.some(s => s.start <= draggedCellIndex && s.end > draggedCellIndex)) {
        selections = [{ start: draggedCellIndex, end: draggedCellIndex + 1 }];
        originalFocusIdx = draggedCellIndex;
    }
    const droppedInSelection = selections.find(range => range.start <= originalToIdx && range.end > originalToIdx);
    if (droppedInSelection) {
        originalToIdx = droppedInSelection.start;
    }
    let numCells = 0;
    let focusNewIdx = originalToIdx;
    let newInsertionIdx = originalToIdx;
    // Compute a set of edits which will be applied in reverse order by the notebook text model.
    // `index`: the starting index of the range, after previous edits have been applied
    // `newIdx`: the destination index, after this edit's range has been removed
    selections.sort((a, b) => b.start - a.start);
    const edits = selections.map(range => {
        const length = range.end - range.start;
        // If this range is before the insertion point, subtract the cells in this range from the "to" index
        let toIndexDelta = 0;
        if (range.end <= newInsertionIdx) {
            toIndexDelta = -length;
        }
        const newIdx = newInsertionIdx + toIndexDelta;
        // If this range contains the focused cell, set the new focus index to the new index of the cell
        if (originalFocusIdx >= range.start && originalFocusIdx <= range.end) {
            const offset = originalFocusIdx - range.start;
            focusNewIdx = newIdx + offset;
        }
        // If below the insertion point, the original index will have been shifted down
        const fromIndexDelta = range.start >= originalToIdx ? numCells : 0;
        const edit = {
            editType: 6 /* CellEditType.Move */,
            index: range.start + fromIndexDelta,
            length,
            newIdx
        };
        numCells += length;
        // If a range was moved down, the insertion index needs to be adjusted
        if (range.end < newInsertionIdx) {
            newInsertionIdx -= length;
        }
        return edit;
    });
    const lastEdit = edits[edits.length - 1];
    const finalSelection = { start: lastEdit.newIdx, end: lastEdit.newIdx + numCells };
    const finalFocus = { start: focusNewIdx, end: focusNewIdx + 1 };
    editor.textModel.applyEdits(edits, true, { kind: SelectionStateType.Index, focus: editor.getFocus(), selections: editor.getSelections() }, () => ({ kind: SelectionStateType.Index, focus: finalFocus, selections: [finalSelection] }), undefined, true);
    editor.revealCellRangeInView(finalSelection);
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2VsbERuZC5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL25vdGVib29rL2Jyb3dzZXIvdmlldy9jZWxsUGFydHMvY2VsbERuZC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRyxPQUFPLEtBQUssR0FBRyxNQUFNLHVDQUF1QyxDQUFDO0FBQzdELE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSx3Q0FBd0MsQ0FBQztBQUNqRSxPQUFPLEVBQUUsVUFBVSxFQUFFLGlCQUFpQixFQUFFLE1BQU0sNENBQTRDLENBQUM7QUFDM0YsT0FBTyxLQUFLLFFBQVEsTUFBTSwyQ0FBMkMsQ0FBQztBQUN0RSxPQUFPLEVBQUUsK0JBQStCLEVBQTJDLE1BQU0sMEJBQTBCLENBQUM7QUFFcEgsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLGdCQUFnQixDQUFDO0FBRWpELE9BQU8sRUFBRSwwQkFBMEIsRUFBRSxNQUFNLGdEQUFnRCxDQUFDO0FBQzVGLE9BQU8sRUFBK0Isa0JBQWtCLEVBQUUsTUFBTSxtQ0FBbUMsQ0FBQztBQUNwRyxPQUFPLEVBQUUsbUJBQW1CLEVBQWMsTUFBTSxrQ0FBa0MsQ0FBQztBQUVuRixNQUFNLENBQUMsR0FBRyxHQUFHLENBQUMsQ0FBQyxDQUFDO0FBRWhCLE1BQU0sY0FBYyxHQUFHLGVBQWUsQ0FBQztBQUN2QyxNQUFNLGlCQUFpQixHQUFHLG9CQUFvQixDQUFDO0FBWS9DLE1BQU0sT0FBTyxtQkFBb0IsU0FBUSxlQUFlO0lBQ3ZELFlBQ2tCLFNBQXNCO1FBRXZDLEtBQUssRUFBRSxDQUFDO1FBRlMsY0FBUyxHQUFULFNBQVMsQ0FBYTtJQUd4QyxDQUFDO0lBRVEsYUFBYSxDQUFDLE9BQXVCO1FBQzdDLElBQUksQ0FBQyxNQUFNLENBQUMsT0FBTyxDQUFDLENBQUM7SUFDdEIsQ0FBQztJQUVRLFdBQVcs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