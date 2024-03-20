/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { FastDomNode } from 'vs/base/browser/fastDomNode';
import { IMouseWheelEvent } from 'vs/base/browser/mouseEvent';
import { IListContextMenuEvent, IListEvent, IListMouseEvent } from 'vs/base/browser/ui/list/list';
import { IListStyles } from 'vs/base/browser/ui/list/listWidget';
import { Event } from 'vs/base/common/event';
import { DisposableStore } from 'vs/base/common/lifecycle';
import { ScrollEvent } from 'vs/base/common/scrollable';
import { ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { Range } from 'vs/editor/common/core/range';
import { Selection } from 'vs/editor/common/core/selection';
import { IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IWorkbenchListOptionsUpdate } from 'vs/platform/list/browser/listService';
import { CellRevealRangeType, CellRevealType, ICellOutputViewModel, ICellViewModel, INotebookViewZoneChangeAccessor } from 'vs/workbench/contrib/notebook/browser/notebookBrowser';
import { CellPartsCollection } from 'vs/workbench/contrib/notebook/browser/view/cellPart';
import { CellViewModel, NotebookViewModel } from 'vs/workbench/contrib/notebook/browser/viewModel/notebookViewModelImpl';
import { ICellRange } from 'vs/workbench/contrib/notebook/common/notebookRange';


export interface INotebookCellList extends ICoordinatesConverter {
	isDisposed: boolean;
	inRenderingTransaction: boolean;
	viewModel: NotebookViewModel | null;
	webviewElement: FastDomNode<HTMLElement> | null;
	readonly contextKeyService: IContextKeyService;
	element(index: number): ICellViewModel | undefined;
	elementAt(position: number): ICellViewModel | undefined;
	elementHeight(element: ICellViewModel): number;
	onWillScroll: Event<ScrollEvent>;
	onDidScroll: Event<ScrollEvent>;
	onDidChangeFocus: Event<IListEvent<ICellViewModel>>;
	onDidChangeContentHeight: Event<number>;
	onDidChangeVisibleRanges: Event<void>;
	visibleRanges: ICellRange[];
	scrollTop: number;
	scrollHeight: number;
	scrollLeft: number;
	length: number;
	rowsContainer: HTMLElement;
	scrollableElement: HTMLElement;
	ariaLabel: string;
	readonly onDidRemoveOutputs: Event<readonly ICellOutputViewModel[]>;
	readonly onDidHideOutputs: Event<readonly ICellOutputViewModel[]>;
	readonly onDidRemoveCellsFromView: Event<readonly ICellViewModel[]>;
	readonly onMouseUp: Event<IListMouseEvent<CellViewModel>>;
	readonly onMouseDown: Event<IListMouseEvent<CellViewModel>>;
	readonly onContextMenu: Event<IListContextMenuEvent<CellViewModel>>;
	detachViewModel(): void;
	attachViewModel(viewModel: NotebookViewModel): void;
	attachWebview(element: HTMLElement): void;
	clear(): void;
	focusElement(element: ICellViewModel): void;
	selectElements(elements: ICellViewModel[]): void;
	getFocusedElements(): ICellViewModel[];
	getSelectedElements(): ICellViewModel[];
	scrollToBottom(): void;
	revealCell(cell: ICellViewModel, revealType: CellRevealType): Promise<void>;
	revealCells(range: ICellRange): void;
	revealRangeInCell(cell: ICellViewModel, range: Selection | Range, revealType: CellRevealRangeType): Promise<void>;
	revealCellOffsetInCenter(element: ICellViewModel, offset: number): void;
	revealOffsetInCenterIfOutsideViewport(offset: number): void;
	setHiddenAreas(_ranges: ICellRange[], triggerViewUpdate: boolean): boolean;
	changeViewZones(callback: (accessor: INotebookViewZoneChangeAccessor) => void): void;
	domElementOfElement(element: ICellViewModel): HTMLElement | null;
	focusView(): void;
	triggerScrollFromMouseWheelEvent(browserEvent: IMouseWheelEvent): void;
	updateElementHeight2(element: ICellViewModel, size: number, anchorElementIndex?: number | null): void;
	domFocus(): void;
	focusContainer(clearSelection: boolean): void;
	setCellEditorSelection(element: ICellViewModel, range: Range): void;
	style(styles: IListStyles): void;
	getRenderHeight(): number;
	getScrollHeight(): number;
	updateOptions(options: IWorkbenchListOptionsUpdate): void;
	layout(height?: number, width?: number): void;
	dispose(): void;
}

export interface BaseCellRenderTemplate {
	readonly rootContainer: HTMLElement;
	readonly editorPart: HTMLElement;
	readonly cellInputCollapsedContainer: HTMLElement;
	readonly instantiationService: IInstantiationService;
	readonly container: HTMLElement;
	readonly cellContainer: HTMLElement;
	readonly templateDisposables: DisposableStore;
	readonly elementDisposables: DisposableStore;
	currentRenderedCell?: ICellViewModel;
	cellParts: CellPartsCollection;
	toJSON: () => object;
}

export interface MarkdownCellRenderTemplate extends BaseCellRenderTemplate {
	readonly editorContainer: HTMLElement;
	readonly foldingIndicator: HTMLElement;
	currentEditor?: ICodeEditor;
}

export interface CodeCellRenderTemplate extends BaseCellRenderTemplate {
	outputContainer: FastDomNode<HTMLElement>;
	cellOutputCollapsedContainer: HTMLElement;
	outputShowMoreContainer: FastDomNode<HTMLElement>;
	focusSinkElement: HTMLElement;
	editor: ICodeEditor;
}

export interface ICoordinatesConverter {
	getCellViewScrollTop(cell: ICellViewModel): number;
	getCellViewScrollBottom(cell: ICellViewModel): number;
	getViewIndex(cell: ICellViewModel): number | undefined;
	getViewIndex2(modelIndex: number): number | undefined;
	getModelIndex(cell: CellViewModel): number | undefined;
	getModelIndex2(viewIndex: number): number | undefined;
	getVisibleRangesPlusViewportAboveAndBelow(): ICellRange[];
	modelIndexIsVisible(modelIndex: number): boolean;
	convertModelIndexToViewIndex(modelIndex: number): number;
}
