/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { FastDomNode } from '../../../../../base/browser/fastDomNode.js';
import { IMouseWheelEvent } from '../../../../../base/browser/mouseEvent.js';
import { IListContextMenuEvent, IListEvent, IListMouseEvent } from '../../../../../base/browser/ui/list/list.js';
import { IListStyles } from '../../../../../base/browser/ui/list/listWidget.js';
import { Event } from '../../../../../base/common/event.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { ScrollEvent } from '../../../../../base/common/scrollable.js';
import { ICodeEditor } from '../../../../../editor/browser/editorBrowser.js';
import { Range } from '../../../../../editor/common/core/range.js';
import { Selection } from '../../../../../editor/common/core/selection.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { IWorkbenchListOptionsUpdate } from '../../../../../platform/list/browser/listService.js';
import { CellRevealRangeType, CellRevealType, ICellOutputViewModel, ICellViewModel, INotebookCellOverlayChangeAccessor, INotebookViewZoneChangeAccessor } from '../notebookBrowser.js';
import { CellPartsCollection } from './cellPart.js';
import { CellViewModel, NotebookViewModel } from '../viewModel/notebookViewModelImpl.js';
import { ICellRange } from '../../common/notebookRange.js';
import { createTrustedTypesPolicy } from '../../../../../base/browser/trustedTypes.js';


export interface INotebookCellList extends ICoordinatesConverter {
	isDisposed: boolean;
	inRenderingTransaction: boolean;
	viewModel: NotebookViewModel | null;
	webviewElement: FastDomNode<HTMLElement> | null;
	readonly contextKeyService: IContextKeyService;
	element(index: number): ICellViewModel | undefined;
	elementAt(position: number): ICellViewModel | undefined;
	elementHeight(element: ICellViewModel): number;
	readonly onWillScroll: Event<ScrollEvent>;
	readonly onDidScroll: Event<ScrollEvent>;
	readonly onDidChangeFocus: Event<IListEvent<ICellViewModel>>;
	readonly onDidChangeContentHeight: Event<number>;
	readonly onDidChangeVisibleRanges: Event<void>;
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
	changeCellOverlays(callback: (accessor: INotebookCellOverlayChangeAccessor) => void): void;
	getViewZoneLayoutInfo(viewZoneId: string): { height: number; top: number } | null;
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

export const collapsedCellTTPolicy = createTrustedTypesPolicy('collapsedCellPreview', { createHTML: value => value });
