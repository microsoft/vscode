/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as DOM from 'vs/base/browser/dom';
import { Delayer } from 'vs/base/common/async';
import { Disposable, MutableDisposable } from 'vs/base/common/lifecycle';
import * as platform from 'vs/base/common/platform';
import { BaseCellRenderTemplate, expandCellRangesWithHiddenCells, ICellViewModel, INotebookCellList, INotebookEditor } from 'vs/workbench/contrib/notebook/browser/notebookBrowser';
import { cloneNotebookCellTextModel } from 'vs/workbench/contrib/notebook/common/model/notebookCellTextModel';
import { CellEditType, SelectionStateType } from 'vs/workbench/contrib/notebook/common/notebookCommon';
import { cellRangesToIndexes, ICellRange } from 'vs/workbench/contrib/notebook/common/notebookRange';

const $ = DOM.$;

export const DRAGGING_CLASS = 'cell-dragging';
export const GLOBAL_DRAG_CLASS = 'global-drag-active';

type DragImageProvider = () => HTMLElement;

interface CellDragEvent {
	browserEvent: DragEvent;
	draggedOverCell: ICellViewModel;
	cellTop: number;
	cellHeight: number;
	dragPosRatio: number;
}

export class CellDragAndDropController extends Disposable {
	// TODO@roblourens - should probably use dataTransfer here, but any dataTransfer set makes the editor think I am dropping a file, need
	// to figure out how to prevent that
	private currentDraggedCell: ICellViewModel | undefined;

	private listInsertionIndicator: HTMLElement;

	private list!: INotebookCellList;

	private isScrolling = false;
	private readonly scrollingDelayer: Delayer<void>;

	private readonly listOnWillScrollListener = this._register(new MutableDisposable());

	constructor(
		private readonly notebookEditor: INotebookEditor,
		insertionIndicatorContainer: HTMLElement
	) {
		super();

		this.listInsertionIndicator = DOM.append(insertionIndicatorContainer, $('.cell-list-insertion-indicator'));

		this._register(DOM.addDisposableListener(document.body, DOM.EventType.DRAG_START, this.onGlobalDragStart.bind(this), true));
		this._register(DOM.addDisposableListener(document.body, DOM.EventType.DRAG_END, this.onGlobalDragEnd.bind(this), true));

		const addCellDragListener = (eventType: string, handler: (e: CellDragEvent) => void) => {
			this._register(DOM.addDisposableListener(
				notebookEditor.getDomNode(),
				eventType,
				e => {
					const cellDragEvent = this.toCellDragEvent(e);
					if (cellDragEvent) {
						handler(cellDragEvent);
					}
				}));
		};

		addCellDragListener(DOM.EventType.DRAG_OVER, event => {
			event.browserEvent.preventDefault();
			this.onCellDragover(event);
		});
		addCellDragListener(DOM.EventType.DROP, event => {
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
		const targetTop = this.notebookEditor.getDomNode().getBoundingClientRect().top;
		const dragOffset = this.list.scrollTop + event.clientY - targetTop;
		const draggedOverCell = this.list.elementAt(dragOffset);
		if (!draggedOverCell) {
			return undefined;
		}

		const cellTop = this.list.getAbsoluteTopOfElement(draggedOverCell);
		const cellHeight = this.list.elementHeight(draggedOverCell);

		const dragPosInElement = dragOffset - cellTop;
		const dragPosRatio = dragPosInElement / cellHeight;

		return <CellDragEvent>{
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

	private _dropImpl(draggedCell: ICellViewModel, dropDirection: 'above' | 'below', ctx: { ctrlKey: boolean, altKey: boolean; }, draggedOverCell: ICellViewModel) {
		const cellTop = this.list.getAbsoluteTopOfElement(draggedOverCell);
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
			const draggedCellIndex = this.notebookEditor.getCellIndex(draggedCell);
			const range = this.getCellRangeAroundDragTarget(draggedCellIndex);
			let originalToIdx = this.notebookEditor.getCellIndex(draggedOverCell);
			if (dropDirection === 'below') {
				const relativeToIndex = this.notebookEditor.getCellIndex(draggedOverCell);
				const newIdx = this.notebookEditor.getNextVisibleCellIndex(relativeToIndex);
				originalToIdx = newIdx;
			}

			if (originalToIdx >= range.start && originalToIdx <= range.end) {
				return;
			}

			let finalSelection: ICellRange;
			let finalFocus: ICellRange;

			if (originalToIdx <= range.start) {
				finalSelection = { start: originalToIdx, end: originalToIdx + range.end - range.start };
				finalFocus = { start: originalToIdx + draggedCellIndex - range.start, end: originalToIdx + draggedCellIndex - range.start + 1 };
			} else {
				const delta = (originalToIdx - range.end);
				finalSelection = { start: range.start + delta, end: range.end + delta };
				finalFocus = { start: draggedCellIndex + delta, end: draggedCellIndex + delta + 1 };
			}

			textModel.applyEdits([
				{
					editType: CellEditType.Move,
					index: range.start,
					length: range.end - range.start,
					newIdx: originalToIdx <= range.start ? originalToIdx : (originalToIdx - (range.end - range.start))
				}
			], true, { kind: SelectionStateType.Index, focus: this.notebookEditor.getFocus(), selections: this.notebookEditor.getSelections() }, () => ({ kind: SelectionStateType.Index, focus: finalFocus, selections: [finalSelection] }), undefined, true);
			this.notebookEditor.revealCellRangeInView(finalSelection);
		}
	}

	private onCellDragLeave(event: CellDragEvent): void {
		if (!event.browserEvent.relatedTarget || !DOM.isAncestor(event.browserEvent.relatedTarget as HTMLElement, this.notebookEditor.getDomNode())) {
			this.setInsertIndicatorVisibility(false);
		}
	}

	private dragCleanup(): void {
		if (this.currentDraggedCell) {
			this.currentDraggedCell.dragging = false;
			this.currentDraggedCell = undefined;
		}

		this.setInsertIndicatorVisibility(false);
	}

	registerDragHandle(templateData: BaseCellRenderTemplate, cellRoot: HTMLElement, dragHandle: HTMLElement, dragImageProvider: DragImageProvider): void {
		const container = templateData.container;
		dragHandle.setAttribute('draggable', 'true');

		templateData.disposables.add(DOM.addDisposableListener(dragHandle, DOM.EventType.DRAG_END, () => {
			if (!this.notebookEditor.notebookOptions.getLayoutConfiguration().dragAndDropEnabled || !!this.notebookEditor.isReadOnly) {
				return;
			}

			// Note, templateData may have a different element rendered into it by now
			container.classList.remove(DRAGGING_CLASS);
			this.dragCleanup();
		}));

		templateData.disposables.add(DOM.addDisposableListener(dragHandle, DOM.EventType.DRAG_START, event => {
			if (!event.dataTransfer) {
				return;
			}

			if (!this.notebookEditor.notebookOptions.getLayoutConfiguration().dragAndDropEnabled || !!this.notebookEditor.isReadOnly) {
				return;
			}

			this.currentDraggedCell = templateData.currentRenderedCell!;
			this.currentDraggedCell.dragging = true;

			const dragImage = dragImageProvider();
			cellRoot.parentElement!.appendChild(dragImage);
			event.dataTransfer.setDragImage(dragImage, 0, 0);
			setTimeout(() => cellRoot.parentElement!.removeChild(dragImage!), 0); // Comment this out to debug drag image layout

			container.classList.add(DRAGGING_CLASS);
		}));
	}

	public startExplicitDrag(cell: ICellViewModel, _dragOffsetY: number) {
		if (!this.notebookEditor.notebookOptions.getLayoutConfiguration().dragAndDropEnabled || !!this.notebookEditor.isReadOnly) {
			return;
		}

		this.currentDraggedCell = cell;
		this.setInsertIndicatorVisibility(true);
	}

	public explicitDrag(cell: ICellViewModel, dragOffsetY: number) {
		if (!this.notebookEditor.notebookOptions.getLayoutConfiguration().dragAndDropEnabled || !!this.notebookEditor.isReadOnly) {
			return;
		}

		const target = this.list.elementAt(dragOffsetY);
		if (target && target !== cell) {
			const cellTop = this.list.getAbsoluteTopOfElement(target);
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

	public explicitDrop(cell: ICellViewModel, ctx: { dragOffsetY: number, ctrlKey: boolean, altKey: boolean; }) {
		this.currentDraggedCell = undefined;
		this.setInsertIndicatorVisibility(false);

		const target = this.list.elementAt(ctx.dragOffsetY);
		if (!target || target === cell) {
			return;
		}

		const cellTop = this.list.getAbsoluteTopOfElement(target);
		const cellHeight = this.list.elementHeight(target);
		const dropDirection = this.getExplicitDragDropDirection(ctx.dragOffsetY, cellTop, cellHeight);
		this._dropImpl(cell, dropDirection, ctx, target);
	}

	private getExplicitDragDropDirection(clientY: number, cellTop: number, cellHeight: number) {
		const dragPosInElement = clientY - cellTop;
		const dragPosRatio = dragPosInElement / cellHeight;

		return this.getDropInsertDirection(dragPosRatio);
	}
}
