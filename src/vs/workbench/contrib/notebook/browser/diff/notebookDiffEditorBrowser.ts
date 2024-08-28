/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CellLayoutState, ICellOutputViewModel, ICommonCellInfo, IGenericCellViewModel, IInsetRenderOutput } from 'vs/workbench/contrib/notebook/browser/notebookBrowser';
import { DiffElementCellViewModelBase, IDiffElementViewModelBase } from 'vs/workbench/contrib/notebook/browser/diff/diffElementViewModel';
import { Event } from 'vs/base/common/event';
import { BareFontInfo } from 'vs/editor/common/config/fontInfo';
import { DisposableStore, IDisposable } from 'vs/base/common/lifecycle';
import { NotebookTextModel } from 'vs/workbench/contrib/notebook/common/model/notebookTextModel';
import { CodeEditorWidget } from 'vs/editor/browser/widget/codeEditor/codeEditorWidget';
import { IMouseWheelEvent } from 'vs/base/browser/mouseEvent';
import { RawContextKey } from 'vs/platform/contextkey/common/contextkey';
import { NotebookOptions } from 'vs/workbench/contrib/notebook/browser/notebookOptions';
import { NotebookLayoutInfo } from 'vs/workbench/contrib/notebook/browser/notebookViewEvents';
import { WorkbenchToolBar } from 'vs/platform/actions/browser/toolbar';
import { DiffEditorWidget } from 'vs/editor/browser/widget/diffEditor/diffEditorWidget';
import { CancellationToken } from 'vs/base/common/cancellation';
import { localize } from 'vs/nls';

export enum DiffSide {
	Original = 0,
	Modified = 1
}

export interface IDiffCellInfo extends ICommonCellInfo {
	diffElement: DiffElementCellViewModelBase;
}

export interface INotebookTextDiffEditor {
	notebookOptions: NotebookOptions;
	readonly textModel?: NotebookTextModel;
	onMouseUp: Event<{ readonly event: MouseEvent; readonly target: IDiffElementViewModelBase }>;
	onDidScroll: Event<void>;
	onDidDynamicOutputRendered: Event<{ cell: IGenericCellViewModel; output: ICellOutputViewModel }>;
	getOverflowContainerDomNode(): HTMLElement;
	getLayoutInfo(): NotebookLayoutInfo;
	getScrollTop(): number;
	getScrollHeight(): number;
	layoutNotebookCell(cell: DiffElementCellViewModelBase, height: number): void;
	createOutput(cellDiffViewModel: DiffElementCellViewModelBase, cellViewModel: IDiffNestedCellViewModel, output: IInsetRenderOutput, getOffset: () => number, diffSide: DiffSide): void;
	showInset(cellDiffViewModel: DiffElementCellViewModelBase, cellViewModel: IDiffNestedCellViewModel, displayOutput: ICellOutputViewModel, diffSide: DiffSide): void;
	removeInset(cellDiffViewModel: DiffElementCellViewModelBase, cellViewModel: IDiffNestedCellViewModel, output: ICellOutputViewModel, diffSide: DiffSide): void;
	hideInset(cellDiffViewModel: DiffElementCellViewModelBase, cellViewModel: IDiffNestedCellViewModel, output: ICellOutputViewModel): void;
	/**
	 * Trigger the editor to scroll from scroll event programmatically
	 */
	triggerScroll(event: IMouseWheelEvent): void;
	delegateVerticalScrollbarPointerDown(browserEvent: PointerEvent): void;
	getCellByInfo(cellInfo: ICommonCellInfo): IGenericCellViewModel;
	focusNotebookCell(cell: IGenericCellViewModel, focus: 'editor' | 'container' | 'output'): Promise<void>;
	focusNextNotebookCell(cell: IGenericCellViewModel, focus: 'editor' | 'container' | 'output'): Promise<void>;
	updateOutputHeight(cellInfo: ICommonCellInfo, output: ICellOutputViewModel, height: number, isInit: boolean): void;
	deltaCellOutputContainerClassNames(diffSide: DiffSide, cellId: string, added: string[], removed: string[]): void;
	previousChange(): void;
	nextChange(): void;
}

export interface IDiffNestedCellViewModel {

}

export interface CellDiffCommonRenderTemplate {
	readonly leftBorder: HTMLElement;
	readonly rightBorder: HTMLElement;
	readonly topBorder: HTMLElement;
	readonly bottomBorder: HTMLElement;
}

export interface CellDiffPlaceholderRenderTemplate {
	readonly container: HTMLElement;
	readonly placeholder: HTMLElement;
	readonly body: HTMLElement;
	readonly marginOverlay: IDiffCellMarginOverlay;
	readonly elementDisposables: DisposableStore;
}

export interface CellDiffSingleSideRenderTemplate extends CellDiffCommonRenderTemplate {
	readonly container: HTMLElement;
	readonly body: HTMLElement;
	readonly diffEditorContainer: HTMLElement;
	readonly diagonalFill: HTMLElement;
	readonly elementDisposables: DisposableStore;
	readonly cellHeaderContainer: HTMLElement;
	readonly editorContainer: HTMLElement;
	readonly sourceEditor: CodeEditorWidget;
	readonly metadataHeaderContainer: HTMLElement;
	readonly metadataInfoContainer: HTMLElement;
	readonly outputHeaderContainer: HTMLElement;
	readonly outputInfoContainer: HTMLElement;
}

export interface IDiffCellMarginOverlay extends IDisposable {
	onAction: Event<void>;
	show(): void;
	hide(): void;
}

export interface CellDiffSideBySideRenderTemplate extends CellDiffCommonRenderTemplate {
	readonly container: HTMLElement;
	readonly body: HTMLElement;
	readonly diffEditorContainer: HTMLElement;
	readonly elementDisposables: DisposableStore;
	readonly cellHeaderContainer: HTMLElement;
	readonly sourceEditor: DiffEditorWidget;
	readonly editorContainer: HTMLElement;
	readonly inputToolbarContainer: HTMLElement;
	readonly toolbar: WorkbenchToolBar;
	readonly metadataHeaderContainer: HTMLElement;
	readonly metadataInfoContainer: HTMLElement;
	readonly outputHeaderContainer: HTMLElement;
	readonly outputInfoContainer: HTMLElement;
	readonly marginOverlay: IDiffCellMarginOverlay;
}

export interface IDiffElementLayoutInfo {
	totalHeight: number;
	width: number;
	editorHeight: number;
	editorMargin: number;
	metadataHeight: number;
	cellStatusHeight: number;
	metadataStatusHeight: number;
	rawOutputHeight: number;
	outputMetadataHeight: number;
	outputTotalHeight: number;
	outputStatusHeight: number;
	bodyMargin: number;
	layoutState: CellLayoutState;
}

type IDiffElementSelfLayoutChangeEvent = { [K in keyof IDiffElementLayoutInfo]?: boolean };

export interface CellDiffViewModelLayoutChangeEvent extends IDiffElementSelfLayoutChangeEvent {
	font?: BareFontInfo;
	outerWidth?: boolean;
	metadataEditor?: boolean;
	outputEditor?: boolean;
	outputView?: boolean;
}

export const DIFF_CELL_MARGIN = 16;
export const NOTEBOOK_DIFF_CELL_INPUT = new RawContextKey<boolean>('notebook.diffEditor.cell.inputChanged', false);
export const NOTEBOOK_DIFF_CELL_IGNORE_WHITESPACE_KEY = 'notebook.diffEditor.cell.ignoreWhitespace';
export const NOTEBOOK_DIFF_CELL_IGNORE_WHITESPACE = new RawContextKey<boolean>(NOTEBOOK_DIFF_CELL_IGNORE_WHITESPACE_KEY, false);
export const NOTEBOOK_DIFF_CELL_PROPERTY = new RawContextKey<boolean>('notebook.diffEditor.cell.property.changed', false);
export const NOTEBOOK_DIFF_CELL_PROPERTY_EXPANDED = new RawContextKey<boolean>('notebook.diffEditor.cell.property.expanded', false);
export const NOTEBOOK_DIFF_CELLS_COLLAPSED = new RawContextKey<boolean>('notebook.diffEditor.allCollapsed', undefined, localize('notebook.diffEditor.allCollapsed', "Whether all cells in notebook diff editor are collapsed"));
export const NOTEBOOK_DIFF_HAS_UNCHANGED_CELLS = new RawContextKey<boolean>('notebook.diffEditor.hasUnchangedCells', undefined, localize('notebook.diffEditor.hasUnchangedCells', "Whether there are unchanged cells in the notebook diff editor"));
export const NOTEBOOK_DIFF_UNCHANGED_CELLS_HIDDEN = new RawContextKey<boolean>('notebook.diffEditor.unchangedCellsAreHidden', undefined, localize('notebook.diffEditor.unchangedCellsAreHidden', "Whether the unchanged cells in the notebook diff editor are hidden"));
export const NOTEBOOK_DIFF_ITEM_KIND = new RawContextKey<boolean>('notebook.diffEditor.item.kind', undefined, localize('notebook.diffEditor.item.kind', "The kind of item in the notebook diff editor, Cell, Metadata or Output"));
export const NOTEBOOK_DIFF_ITEM_DIFF_STATE = new RawContextKey<boolean>('notebook.diffEditor.item.state', undefined, localize('notebook.diffEditor.item.state', "The diff state of item in the notebook diff editor, delete, insert, modified or unchanged"));

export interface INotebookDiffViewModelUpdateEvent {
	readonly start: number;
	readonly deleteCount: number;
	readonly elements: readonly IDiffElementViewModelBase[];
}

export interface INotebookDiffViewModel extends IDisposable {
	readonly items: readonly IDiffElementViewModelBase[];
	onDidChangeItems: Event<INotebookDiffViewModelUpdateEvent>;
	/**
	 * Computes the differences and generates the viewmodel.
	 * If view models are generated, then the onDidChangeItems is triggered and will have a return value.
	 * Else returns `undefined`
	 * @param token
	 */
	computeDiff(token: CancellationToken): Promise<{ firstChangeIndex: number } | undefined>;
}
