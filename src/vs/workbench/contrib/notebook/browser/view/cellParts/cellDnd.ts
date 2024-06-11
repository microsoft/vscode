/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as DOM from 'vs/base/browser/dom';
import { Delayer } from 'vs/base/common/async';
import { Disposable, MutableDisposable } from 'vs/base/common/lifecycle';
import * as platform from 'vs/base/common/platform';
import { expandCellRangesWithHiddenCells, ICellViewModel, INotebookEditorDelegate } from 'vs/workbench/contrib/notebook/browser/notebookBrowser';
import { CellViewModelStateChangeEvent } from 'vs/workbench/contrib/notebook/browser/notebookViewEvents';
import { CellContentPart } from 'vs/workbench/contrib/notebook/browser/view/cellPart';
import { BaseCellRenderTemplate, INotebookCellList } from 'vs/workbench/contrib/notebook/browser/view/notebookRenderingCommon';
import { cloneNotebookCellTextModel } from 'vs/workbench/contrib/notebook/common/model/notebookCellTextModel';
import { CellEditType, ICellMoveEdit, SelectionStateType } from 'vs/workbench/contrib/notebook/common/notebookCommon';
import { cellRangesToIndexes, ICellRange } from 'vs/workbench/contrib/notebook/common/notebookRange';

const $ = DOM.$;

const DRAGGING_CLASS = 'cell-dragging';
const GLOBAL_DRAG_CLASS = 'global-drag-active';

type DragImageProvider = () => HTMLElement;

interface CellDragEvent {
	browserEvent: DragEvent;
	draggedOverCell: ICellViewModel;
	cellTop: number;
	cellHeight: number;
	dragPosRatio: number;
}

export class CellDragAndDropPart extends CellContentPart {
	constructor(
		private readonly container: HTMLElement
	) {
		super();
	}

	override didRenderCell(element: ICellViewModel): void {
		this.update(element);
	}

	override updateState(element: ICellViewModel, e: CellViewModelStateChangeEvent): void {
		if (e.dragStateChanged) {
			this.update(element);
		}
	}

	private update(element: ICellViewModel) {
		this.container.classList.toggle(DRAGGING_CLASS, element.dragging);
	}
}

export class CellDragAndDropController extends Disposable {
	// TODO@roblourens - should probably use dataTransfer here, but any dataTransfer set makes the editor think I am dropping a file, need
	// to figure out how to prevent that
	private currentDraggedCell: ICellViewModel | undefined;
	private draggedCells: ICellViewModel[] = [];

	private listInsertionIndicator: HTMLElement;

	private list!: INotebookCellList;

	private isScrolling = false;
	private readonly scrollingDelayer: Delayer<void>;

	private readonly listOnWillScrollListener = this._register(new MutableDisposable());

	constructor(
		private notebookEditor: INotebookEditorDelegate,
		private readonly notebookListContainer: HTMLElement
	) {
		super();

		this.listInsertionIndicator = DOM.append(notebookListContainer, $('.cell-list-insertion-indicator'));

		this._register(DOM.addDisposableListener(notebookListContainer.ownerDocument.body, DOM.EventType.DRAG_START, this.onGlobalDragStart.bind(this), true));
		this._register(DOM.addDisposableListener(notebookListContainer.ownerDocument.body, DOM.EventType.DRAG_END, this.onGlobalDragEnd.bind(this), true));

		const addCellDragListener = (eventType: string, handler: (e: CellDragEvent) => void, useCapture = false) => {
			this._register(DOM.addDisposableListener(
				notebookEditor.getDomNode(),
				eventType,
				e => {
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

	setList(value: INotebookCellList) {
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

	private setInsertIndicatorVisibility(visible: boolean) {
		this.listInsertionIndicator.style.opacity = visible ? '1' : '0';
	}

	private toCellDragEvent(event: DragEvent): CellDragEvent | undefined {
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

	private onGlobalDragStart() {
		this.notebookEditor.getDomNode().classList.add(GLOBAL_DRAG_CLASS);
	}

	private onGlobalDragEnd() {
		this.notebookEditor.getDomNode().classList.remove(GLOBAL_DRAG_CLASS);
	}

	private onCellDragover(event: CellDragEvent): void {
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

	private updateInsertIndicator(dropDirection: string, insertionIndicatorAbsolutePos: number) {
		const { bottomToolbarGap } = this.notebookEditor.notebookOptions.computeBottomToolbarDimensions(this.notebookEditor.textModel?.viewType);
		const insertionIndicatorTop = insertionIndicatorAbsolutePos - this.list.scrollTop + bottomToolbarGap / 2;
		if (insertionIndicatorTop >= 0) {
			this.listInsertionIndicator.style.top = `${insertionIndicatorTop}px`;
			this.setInsertIndicatorVisibility(true);
		} else {
			this.setInsertIndicatorVisibility(false);
		}
	}

	private getDropInsertDirection(dragPosRatio: number): 'above' | 'below' {
		return dragPosRatio < 0.5 ? 'above' : 'below';
	}

	private onCellDrop(event: CellDragEvent): void {
		const draggedCell = this.currentDraggedCell!;

		if (this.isScrolling || this.currentDraggedCell === event.draggedOverCell) {
			return;
		}

		this.dragCleanup();

		const dropDirection = this.getDropInsertDirection(event.dragPosRatio);
		this._dropImpl(draggedCell, dropDirection, event.browserEvent, event.draggedOverCell);
	}

	private getCellRangeAroundDragTarget(draggedCellIndex: number) {
		const selections = this.notebookEditor.getSelections();
		const modelRanges = expandCellRangesWithHiddenCells(this.notebookEditor, selections);
		const nearestRange = modelRanges.find(range => range.start <= draggedCellIndex && draggedCellIndex < range.end);

		if (nearestRange) {
			return nearestRange;
		} else {
			return { start: draggedCellIndex, end: draggedCellIndex + 1 };
		}
	}

	private _dropImpl(draggedCell: ICellViewModel, dropDirection: 'above' | 'below', ctx: { ctrlKey: boolean; altKey: boolean }, draggedOverCell: ICellViewModel) {
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

			let finalSelection: ICellRange;
			let finalFocus: ICellRange;

			if (originalToIdx <= range.start) {
				finalSelection = { start: originalToIdx, end: originalToIdx + range.end - range.start };
				finalFocus = { start: originalToIdx + draggedCellIndex - range.start, end: originalToIdx + draggedCellIndex - range.start + 1 };
			} else {
				const delta = (originalToIdx - range.start);
				finalSelection = { start: range.start + delta, end: range.end + delta };
				finalFocus = { start: draggedCellIndex + delta, end: draggedCellIndex + delta + 1 };
			}

			textModel.applyEdits([
				{
					editType: CellEditType.Replace,
					index: originalToIdx,
					count: 0,
					cells: cellRangesToIndexes([range]).map(index => cloneNotebookCellTextModel(this.notebookEditor.cellAt(index)!.model))
				}
			], true, { kind: SelectionStateType.Index, focus: this.notebookEditor.getFocus(), selections: this.notebookEditor.getSelections() }, () => ({ kind: SelectionStateType.Index, focus: finalFocus, selections: [finalSelection] }), undefined, true);
			this.notebookEditor.revealCellRangeInView(finalSelection);
		} else {
			performCellDropEdits(this.notebookEditor, draggedCell, dropDirection, draggedOverCell);
		}
	}

	private onCellDragLeave(event: CellDragEvent): void {
		if (!event.browserEvent.relatedTarget || !DOM.isAncestor(event.browserEvent.relatedTarget as HTMLElement, this.notebookEditor.getDomNode())) {
			this.setInsertIndicatorVisibility(false);
		}
	}

	private dragCleanup(): void {
		if (this.currentDraggedCell) {
			this.draggedCells.forEach(cell => cell.dragging = false);
			this.currentDraggedCell = undefined;
			this.draggedCells = [];
		}

		this.setInsertIndicatorVisibility(false);
	}

	registerDragHandle(templateData: BaseCellRenderTemplate, cellRoot: HTMLElement, dragHandles: HTMLElement[], dragImageProvider: DragImageProvider): void {
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

		const onDragStart = (event: DragEvent) => {
			if (!event.dataTransfer) {
				return;
			}

			if (!this.notebookEditor.notebookOptions.getDisplayOptions().dragAndDropEnabled || !!this.notebookEditor.isReadOnly) {
				return;
			}

			this.currentDraggedCell = templateData.currentRenderedCell!;
			this.draggedCells = this.notebookEditor.getSelections().map(range => this.notebookEditor.getCellsInRange(range)).flat();
			this.draggedCells.forEach(cell => cell.dragging = true);

			const dragImage = dragImageProvider();
			cellRoot.parentElement!.appendChild(dragImage);
			event.dataTransfer.setDragImage(dragImage, 0, 0);
			setTimeout(() => dragImage.remove(), 0); // Comment this out to debug drag image layout
		};
		for (const dragHandle of dragHandles) {
			templateData.templateDisposables.add(DOM.addDisposableListener(dragHandle, DOM.EventType.DRAG_START, onDragStart));
		}
	}

	public startExplicitDrag(cell: ICellViewModel, _dragOffsetY: number) {
		if (!this.notebookEditor.notebookOptions.getDisplayOptions().dragAndDropEnabled || !!this.notebookEditor.isReadOnly) {
			return;
		}

		this.currentDraggedCell = cell;
		this.setInsertIndicatorVisibility(true);
	}

	public explicitDrag(cell: ICellViewModel, dragOffsetY: number) {
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
		} else if (eventPositionRatio > 1 - notebookViewScrollMargins) {
			this.list.scrollTop += maxScrollDeltaPerFrame * (1 - ((1 - eventPositionRatio) / notebookViewScrollMargins));
		}
	}

	public endExplicitDrag(_cell: ICellViewModel) {
		this.setInsertIndicatorVisibility(false);
	}

	public explicitDrop(cell: ICellViewModel, ctx: { dragOffsetY: number; ctrlKey: boolean; altKey: boolean }) {
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

	private getExplicitDragDropDirection(clientY: number, cellTop: number, cellHeight: number) {
		const dragPosInElement = clientY - cellTop;
		const dragPosRatio = dragPosInElement / cellHeight;

		return this.getDropInsertDirection(dragPosRatio);
	}

	override dispose() {
		this.notebookEditor = null!;
		super.dispose();
	}
}

export function performCellDropEdits(editor: INotebookEditorDelegate, draggedCell: ICellViewModel, dropDirection: 'above' | 'below', draggedOverCell: ICellViewModel): void {
	const draggedCellIndex = editor.getCellIndex(draggedCell)!;
	let originalToIdx = editor.getCellIndex(draggedOverCell)!;

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

		const edit: ICellMoveEdit = {
			editType: CellEditType.Move,
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

	editor.textModel!.applyEdits(
		edits,
		true,
		{ kind: SelectionStateType.Index, focus: editor.getFocus(), selections: editor.getSelections() },
		() => ({ kind: SelectionStateType.Index, focus: finalFocus, selections: [finalSelection] }),
		undefined, true);
	editor.revealCellRangeInView(finalSelection);
}
