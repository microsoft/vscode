/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IMouseWheelEvent } from 'vs/base/browser/mouseEvent';
import { IListContextMenuEvent, IListEvent, IListMouseEvent } from 'vs/base/browser/ui/list/list';
import { IListOptions, IListStyles } from 'vs/base/browser/ui/list/listWidget';
import { ProgressBar } from 'vs/base/browser/ui/progressbar/progressbar';
import { ToolBar } from 'vs/base/browser/ui/toolbar/toolbar';
import { Event } from 'vs/base/common/event';
import { DisposableStore, IDisposable } from 'vs/base/common/lifecycle';
import { ScrollEvent } from 'vs/base/common/scrollable';
import { URI } from 'vs/base/common/uri';
import { ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { FontInfo } from 'vs/editor/common/config/fontInfo';
import { IPosition } from 'vs/editor/common/core/position';
import { Range } from 'vs/editor/common/core/range';
import { FindMatch, IModelDeltaDecoration, IReadonlyTextBuffer, ITextModel } from 'vs/editor/common/model';
import { ContextKeyExpr, RawContextKey, IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { OutputRenderer } from 'vs/workbench/contrib/notebook/browser/view/output/outputRenderer';
import { CellViewModel, IModelDecorationsChangeAccessor, NotebookViewModel } from 'vs/workbench/contrib/notebook/browser/viewModel/notebookViewModel';
import { NotebookCellTextModel } from 'vs/workbench/contrib/notebook/common/model/notebookCellTextModel';
import { CellKind, NotebookCellMetadata, IOrderedMimeType, INotebookRendererInfo, ICellOutput, IOutputItemDto, INotebookCellStatusBarItem, NotebookCellInternalMetadata, NotebookDocumentMetadata } from 'vs/workbench/contrib/notebook/common/notebookCommon';
import { ICellRange, cellRangesToIndexes, reduceRanges } from 'vs/workbench/contrib/notebook/common/notebookRange';
import { Webview } from 'vs/workbench/contrib/webview/browser/webview';
import { NotebookTextModel } from 'vs/workbench/contrib/notebook/common/model/notebookTextModel';
import { IMenu, MenuId } from 'vs/platform/actions/common/actions';
import { IEditorPane } from 'vs/workbench/common/editor';
import { ITextEditorOptions, ITextResourceEditorInput } from 'vs/platform/editor/common/editor';
import { IConstructorSignature1 } from 'vs/platform/instantiation/common/instantiation';
import { CellEditorStatusBar } from 'vs/workbench/contrib/notebook/browser/view/renderers/cellWidgets';
import { INotebookWebviewMessage } from 'vs/workbench/contrib/notebook/browser/view/renderers/backLayerWebView';
import { NotebookOptions } from 'vs/workbench/contrib/notebook/common/notebookOptions';
import { INotebookKernel } from 'vs/workbench/contrib/notebook/common/notebookKernelService';
import { isCompositeNotebookEditorInput } from 'vs/workbench/contrib/notebook/common/notebookEditorInput';
import { IEditorContributionDescription } from 'vs/editor/browser/editorExtensions';

export const NOTEBOOK_EDITOR_ID = 'workbench.editor.notebook';
export const NOTEBOOK_DIFF_EDITOR_ID = 'workbench.editor.notebookTextDiffEditor';

//#region Context Keys
export const HAS_OPENED_NOTEBOOK = new RawContextKey<boolean>('userHasOpenedNotebook', false);
export const KEYBINDING_CONTEXT_NOTEBOOK_FIND_WIDGET_FOCUSED = new RawContextKey<boolean>('notebookFindWidgetFocused', false);

// Is Notebook
export const NOTEBOOK_IS_ACTIVE_EDITOR = ContextKeyExpr.equals('activeEditor', NOTEBOOK_EDITOR_ID);

// Editor keys
export const NOTEBOOK_EDITOR_FOCUSED = new RawContextKey<boolean>('notebookEditorFocused', false);
export const NOTEBOOK_CELL_LIST_FOCUSED = new RawContextKey<boolean>('notebookCellListFocused', false);
export const NOTEBOOK_OUTPUT_FOCUSED = new RawContextKey<boolean>('notebookOutputFocused', false);
export const NOTEBOOK_EDITOR_EDITABLE = new RawContextKey<boolean>('notebookEditable', true);
export const NOTEBOOK_HAS_RUNNING_CELL = new RawContextKey<boolean>('notebookHasRunningCell', false);
export const NOTEBOOK_USE_CONSOLIDATED_OUTPUT_BUTTON = new RawContextKey<boolean>('notebookUseConsolidatedOutputButton', false);
export const NOTEBOOK_BREAKPOINT_MARGIN_ACTIVE = new RawContextKey<boolean>('notebookBreakpointMargin', false);

// Cell keys
export const NOTEBOOK_VIEW_TYPE = new RawContextKey<string>('notebookType', undefined);
export const NOTEBOOK_CELL_TYPE = new RawContextKey<'code' | 'markup'>('notebookCellType', undefined);
export const NOTEBOOK_CELL_EDITABLE = new RawContextKey<boolean>('notebookCellEditable', false);
export const NOTEBOOK_CELL_FOCUSED = new RawContextKey<boolean>('notebookCellFocused', false);
export const NOTEBOOK_CELL_EDITOR_FOCUSED = new RawContextKey<boolean>('notebookCellEditorFocused', false);
export const NOTEBOOK_CELL_MARKDOWN_EDIT_MODE = new RawContextKey<boolean>('notebookCellMarkdownEditMode', false);
export const NOTEBOOK_CELL_LINE_NUMBERS = new RawContextKey<'on' | 'off' | 'inherit'>('notebookCellLineNumbers', 'inherit');
export type NotebookCellExecutionStateContext = 'idle' | 'pending' | 'executing' | 'succeeded' | 'failed';
export const NOTEBOOK_CELL_EXECUTION_STATE = new RawContextKey<NotebookCellExecutionStateContext>('notebookCellExecutionState', undefined);
export const NOTEBOOK_CELL_EXECUTING = new RawContextKey<boolean>('notebookCellExecuting', false); // This only exists to simplify a context key expression, see #129625
export const NOTEBOOK_CELL_HAS_OUTPUTS = new RawContextKey<boolean>('notebookCellHasOutputs', false);
export const NOTEBOOK_CELL_INPUT_COLLAPSED = new RawContextKey<boolean>('notebookCellInputIsCollapsed', false);
export const NOTEBOOK_CELL_OUTPUT_COLLAPSED = new RawContextKey<boolean>('notebookCellOutputIsCollapsed', false);
// Kernels
export const NOTEBOOK_KERNEL_COUNT = new RawContextKey<number>('notebookKernelCount', 0);
export const NOTEBOOK_KERNEL_SELECTED = new RawContextKey<boolean>('notebookKernelSelected', false);
export const NOTEBOOK_INTERRUPTIBLE_KERNEL = new RawContextKey<boolean>('notebookInterruptibleKernel', false);
export const NOTEBOOK_MISSING_KERNEL_EXTENSION = new RawContextKey<boolean>('notebookMissingKernelExtension', false);
export const NOTEBOOK_HAS_OUTPUTS = new RawContextKey<boolean>('notebookHasOutputs', false);

//#endregion

//#region Shared commands
export const EXPAND_CELL_INPUT_COMMAND_ID = 'notebook.cell.expandCellInput';
export const EXECUTE_CELL_COMMAND_ID = 'notebook.cell.execute';
export const CHANGE_CELL_LANGUAGE = 'notebook.cell.changeLanguage';
export const QUIT_EDIT_CELL_COMMAND_ID = 'notebook.cell.quitEdit';
export const EXPAND_CELL_OUTPUT_COMMAND_ID = 'notebook.cell.expandCellOutput';


//#endregion

//#region Notebook extensions

// Hardcoding viewType/extension ID for now. TODO these should be replaced once we can
// look them up in the marketplace dynamically.
export const IPYNB_VIEW_TYPE = 'jupyter-notebook';
export const JUPYTER_EXTENSION_ID = 'ms-toolsai.jupyter';
export const KERNEL_EXTENSIONS = new Map<string, string>([
	[IPYNB_VIEW_TYPE, JUPYTER_EXTENSION_ID],
]);

//#endregion

//#region  Output related types
export const enum RenderOutputType {
	Mainframe,
	Html,
	Extension
}

export interface IRenderMainframeOutput {
	type: RenderOutputType.Mainframe;
	supportAppend?: boolean;
	initHeight?: number;
	disposable?: IDisposable;
}

export interface IRenderPlainHtmlOutput {
	type: RenderOutputType.Html;
	source: IDisplayOutputViewModel;
	htmlContent: string;
}

export interface IRenderOutputViaExtension {
	type: RenderOutputType.Extension;
	source: IDisplayOutputViewModel;
	mimeType: string;
	renderer: INotebookRendererInfo;
}

export type IInsetRenderOutput = IRenderPlainHtmlOutput | IRenderOutputViaExtension;
export type IRenderOutput = IRenderMainframeOutput | IInsetRenderOutput;

export interface ICellOutputViewModel extends IDisposable {
	cellViewModel: IGenericCellViewModel;
	/**
	 * When rendering an output, `model` should always be used as we convert legacy `text/error` output to `display_data` output under the hood.
	 */
	model: ICellOutput;
	resolveMimeTypes(textModel: NotebookTextModel, kernelProvides: readonly string[] | undefined): [readonly IOrderedMimeType[], number];
	pickedMimeType: IOrderedMimeType | undefined;
	supportAppend(): boolean;
	hasMultiMimeType(): boolean;
	toRawJSON(): any;
}

export interface IDisplayOutputViewModel extends ICellOutputViewModel {
	resolveMimeTypes(textModel: NotebookTextModel, kernelProvides: readonly string[] | undefined): [readonly IOrderedMimeType[], number];
}


//#endregion

//#region Shared types between the Notebook Editor and Notebook Diff Editor, they are mostly used for output rendering

export interface IGenericCellViewModel {
	id: string;
	handle: number;
	uri: URI;
	metadata: NotebookCellMetadata;
	outputIsHovered: boolean;
	outputIsFocused: boolean;
	outputsViewModels: ICellOutputViewModel[];
	getOutputOffset(index: number): number;
	updateOutputHeight(index: number, height: number, source?: string): void;
}

export interface IDisplayOutputLayoutUpdateRequest {
	readonly cell: IGenericCellViewModel;
	output: IDisplayOutputViewModel;
	cellTop: number;
	outputOffset: number;
	forceDisplay: boolean;
}

export interface ICommonCellInfo {
	cellId: string;
	cellHandle: number;
	cellUri: URI;
}

export interface INotebookCellOutputLayoutInfo {
	width: number;
	height: number;
	fontInfo: FontInfo;
}

export interface IFocusNotebookCellOptions {
	readonly skipReveal?: boolean;
}

export interface ICommonNotebookEditor {
	readonly creationOptions: INotebookEditorCreationOptions;
	getCellOutputLayoutInfo(cell: IGenericCellViewModel): INotebookCellOutputLayoutInfo;
	setScrollTop(scrollTop: number): void;
	triggerScroll(event: IMouseWheelEvent): void;
	getCellByInfo(cellInfo: ICommonCellInfo): IGenericCellViewModel;
	getCellById(cellId: string): IGenericCellViewModel | undefined;
	toggleNotebookCellSelection(cell: IGenericCellViewModel, selectFromPrevious: boolean): void;
	focusNotebookCell(cell: IGenericCellViewModel, focus: 'editor' | 'container' | 'output', options?: IFocusNotebookCellOptions): void;
	focusNextNotebookCell(cell: IGenericCellViewModel, focus: 'editor' | 'container' | 'output'): void;
	updateOutputHeight(cellInfo: ICommonCellInfo, output: IDisplayOutputViewModel, height: number, isInit: boolean, source?: string): void;
	scheduleOutputHeightAck(cellInfo: ICommonCellInfo, outputId: string, height: number): void;
	updateMarkupCellHeight(cellId: string, height: number, isInit: boolean): void;
	setMarkupCellEditState(cellId: string, editState: CellEditState): void;
	didStartDragMarkupCell(cellId: string, event: { dragOffsetY: number; }): void;
	didDragMarkupCell(cellId: string, event: { dragOffsetY: number; }): void;
	didDropMarkupCell(cellId: string, event: { dragOffsetY: number, ctrlKey: boolean, altKey: boolean; }): void;
	didEndDragMarkupCell(cellId: string): void;
}

//#endregion

export interface NotebookLayoutInfo {
	width: number;
	height: number;
	fontInfo: FontInfo;
}

export interface NotebookLayoutChangeEvent {
	width?: boolean;
	height?: boolean;
	fontInfo?: boolean;
}

export enum CellLayoutState {
	Uninitialized,
	Estimated,
	FromCache,
	Measured
}

export interface CodeCellLayoutInfo {
	readonly fontInfo: FontInfo | null;
	readonly editorHeight: number;
	readonly editorWidth: number;
	readonly totalHeight: number;
	readonly outputContainerOffset: number;
	readonly outputTotalHeight: number;
	readonly outputShowMoreContainerHeight: number;
	readonly outputShowMoreContainerOffset: number;
	readonly indicatorHeight: number;
	readonly bottomToolbarOffset: number;
	readonly layoutState: CellLayoutState;
}

export interface CodeCellLayoutChangeEvent {
	source?: string;
	editorHeight?: boolean;
	outputHeight?: boolean;
	outputShowMoreContainerHeight?: number;
	totalHeight?: boolean;
	outerWidth?: number;
	font?: FontInfo;
}

export interface MarkdownCellLayoutInfo {
	readonly fontInfo: FontInfo | null;
	readonly editorWidth: number;
	readonly editorHeight: number;
	readonly previewHeight: number;
	readonly bottomToolbarOffset: number;
	readonly totalHeight: number;
	readonly layoutState: CellLayoutState;
}

export interface MarkdownCellLayoutChangeEvent {
	font?: FontInfo;
	outerWidth?: number;
	editorHeight?: number;
	previewHeight?: number;
	totalHeight?: number;
}

export interface ICellViewModel extends IGenericCellViewModel {
	readonly model: NotebookCellTextModel;
	readonly id: string;
	readonly textBuffer: IReadonlyTextBuffer;
	readonly layoutInfo: { totalHeight: number; };
	readonly onDidChangeLayout: Event<{ totalHeight?: boolean | number; outerWidth?: number; }>;
	readonly onDidChangeCellStatusBarItems: Event<void>;
	readonly editStateSource: string;
	readonly editorAttached: boolean;
	dragging: boolean;
	handle: number;
	uri: URI;
	language: string;
	readonly mime: string;
	cellKind: CellKind;
	lineNumbers: 'on' | 'off' | 'inherit';
	focusMode: CellFocusMode;
	outputIsHovered: boolean;
	getText(): string;
	getTextLength(): number;
	getHeight(lineHeight: number): number;
	metadata: NotebookCellMetadata;
	internalMetadata: NotebookCellInternalMetadata;
	textModel: ITextModel | undefined;
	hasModel(): this is IEditableCellViewModel;
	resolveTextModel(): Promise<ITextModel>;
	getSelectionsStartPosition(): IPosition[] | undefined;
	getCellDecorations(): INotebookCellDecorationOptions[];
	getCellStatusBarItems(): INotebookCellStatusBarItem[];
	getEditState(): CellEditState;
	updateEditState(state: CellEditState, source: string): void;
	deltaModelDecorations(oldDecorations: string[], newDecorations: IModelDeltaDecoration[]): string[];
	getCellDecorationRange(id: string): Range | null;
}

export interface IEditableCellViewModel extends ICellViewModel {
	textModel: ITextModel;
}

export interface INotebookEditorMouseEvent {
	readonly event: MouseEvent;
	readonly target: CellViewModel;
}

export interface INotebookEditorContribution {
	/**
	 * Dispose this contribution.
	 */
	dispose(): void;
	/**
	 * Store view state.
	 */
	saveViewState?(): unknown;
	/**
	 * Restore view state.
	 */
	restoreViewState?(state: unknown): void;
}

export interface INotebookCellDecorationOptions {
	className?: string;
	gutterClassName?: string;
	outputClassName?: string;
	topClassName?: string;
}

export interface INotebookDeltaDecoration {
	handle: number;
	options: INotebookCellDecorationOptions;
}

export interface INotebookDeltaCellStatusBarItems {
	handle: number;
	items: INotebookCellStatusBarItem[];
}

export interface INotebookEditorOptions extends ITextEditorOptions {
	readonly cellOptions?: ITextResourceEditorInput;
	readonly cellSelections?: ICellRange[];
	readonly isReadOnly?: boolean;
}

export type INotebookEditorContributionCtor = IConstructorSignature1<INotebookEditor, INotebookEditorContribution>;

export interface INotebookEditorContributionDescription {
	id: string;
	ctor: INotebookEditorContributionCtor;
}

export interface INotebookEditorCreationOptions {
	readonly isEmbedded?: boolean;
	readonly isReadOnly?: boolean;
	readonly contributions?: INotebookEditorContributionDescription[];
	readonly cellEditorContributions?: IEditorContributionDescription[];
	readonly menuIds: {
		notebookToolbar: MenuId;
		cellTitleToolbar: MenuId;
		cellInsertToolbar: MenuId;
		cellTopInsertToolbar: MenuId;
		cellExecuteToolbar: MenuId;
	};
	readonly options?: NotebookOptions;
}

export interface IActiveNotebookEditor extends INotebookEditor {
	viewModel: NotebookViewModel;
	_getViewModel(): NotebookViewModel;
	textModel: NotebookTextModel;
	getFocus(): ICellRange;
	cellAt(index: number): ICellViewModel;
	getCellIndex(cell: ICellViewModel): number;
	getCellIndexByHandle(handle: number): number;
}

export enum NotebookViewEventType {
	LayoutChanged = 1,
	MetadataChanged = 2,
	CellStateChanged = 3
}

export class NotebookLayoutChangedEvent {
	public readonly type = NotebookViewEventType.LayoutChanged;

	constructor(readonly source: NotebookLayoutChangeEvent, readonly value: NotebookLayoutInfo) {

	}
}


export class NotebookMetadataChangedEvent {
	public readonly type = NotebookViewEventType.MetadataChanged;

	constructor(readonly source: NotebookDocumentMetadata) {

	}
}

export class NotebookCellStateChangedEvent {
	public readonly type = NotebookViewEventType.CellStateChanged;

	constructor(readonly source: CellViewModelStateChangeEvent, readonly cell: ICellViewModel) {

	}
}


export type NotebookViewEvent = NotebookLayoutChangedEvent | NotebookMetadataChangedEvent | NotebookCellStateChangedEvent;


export interface INotebookEditor extends ICommonNotebookEditor {
	//#region Eventing
	onDidChangeCellState: Event<NotebookCellStateChangedEvent>;
	//#endregion

	// from the old IEditor
	readonly onDidChangeVisibleRanges: Event<void>;
	readonly onDidChangeSelection: Event<void>;
	getSelections(): ICellRange[];
	setSelections(selections: ICellRange[]): void;
	getFocus(): ICellRange;
	setFocus(focus: ICellRange): void;
	visibleRanges: ICellRange[];
	textModel?: NotebookTextModel;
	getId(): string;
	hasEditorFocus(): boolean;
	readonly creationOptions: INotebookEditorCreationOptions;

	isEmbedded: boolean;

	cursorNavigationMode: boolean;

	/**
	 * Notebook view model attached to the current editor
	 */
	viewModel: NotebookViewModel | undefined;
	_getViewModel(): NotebookViewModel | undefined;
	hasModel(): this is IActiveNotebookEditor;

	/**
	 * An event emitted when the model of this editor has changed.
	 * @event
	 */
	readonly onDidChangeModel: Event<NotebookTextModel | undefined>;
	readonly onDidFocusEditorWidget: Event<void>;
	readonly onDidScroll: Event<void>;

	readonly onDidChangeActiveCell: Event<void>;
	readonly notebookOptions: NotebookOptions;
	isDisposed: boolean;
	dispose(): void;

	getId(): string;
	getDomNode(): HTMLElement;
	getOverflowContainerDomNode(): HTMLElement;
	getInnerWebview(): Webview | undefined;
	getSelectionViewModels(): ICellViewModel[];

	/**
	 * Focus the notebook editor cell list
	 */
	focus(): void;

	hasEditorFocus(): boolean;
	hasWebviewFocus(): boolean;

	hasOutputTextSelection(): boolean;
	setOptions(options: INotebookEditorOptions | undefined): Promise<void>;

	/**
	 * Select & focus cell
	 */
	focusElement(cell: ICellViewModel): void;

	/**
	 * Layout info for the notebook editor
	 */
	getLayoutInfo(): NotebookLayoutInfo;

	getVisibleRangesPlusViewportBelow(): ICellRange[];

	/**
	 * Fetch the output renderers for notebook outputs.
	 */
	getOutputRenderer(): OutputRenderer;

	/**
	 * Insert a new cell around `cell`
	 */
	insertNotebookCell(cell: ICellViewModel | undefined, type: CellKind, direction?: 'above' | 'below', initialText?: string, ui?: boolean): CellViewModel | null;

	/**
	 * Split a given cell into multiple cells of the same type using the selection start positions.
	 */
	splitNotebookCell(cell: ICellViewModel): Promise<CellViewModel[] | null>;

	/**
	 * Delete a cell from the notebook
	 */
	deleteNotebookCell(cell: ICellViewModel): Promise<boolean>;

	/**
	 * Move a cell up one spot
	 */
	moveCellUp(cell: ICellViewModel): Promise<ICellViewModel | null>;

	/**
	 * Move a cell down one spot
	 */
	moveCellDown(cell: ICellViewModel): Promise<ICellViewModel | null>;

	/**
	 * Move a cell to a specific position
	 */
	moveCellsToIdx(index: number, length: number, toIdx: number): Promise<ICellViewModel | null>;

	/**
	 * Focus the container of a cell (the monaco editor inside is not focused).
	 */
	focusNotebookCell(cell: ICellViewModel, focus: 'editor' | 'container' | 'output', options?: IFocusNotebookCellOptions): void;

	focusNextNotebookCell(cell: ICellViewModel, focus: 'editor' | 'container' | 'output'): void;

	readonly activeKernel: INotebookKernel | undefined;

	/**
	 * Execute the given notebook cells
	 */
	executeNotebookCells(cells?: Iterable<ICellViewModel>): Promise<void>;

	/**
	 * Cancel the given notebook cells
	 */
	cancelNotebookCells(cells?: Iterable<ICellViewModel>): Promise<void>;

	/**
	 * Get current active cell
	 */
	getActiveCell(): ICellViewModel | undefined;

	/**
	 * Layout the cell with a new height
	 */
	layoutNotebookCell(cell: ICellViewModel, height: number): Promise<void>;

	createMarkupPreview(cell: ICellViewModel): Promise<void>;
	unhideMarkupPreviews(cells: readonly ICellViewModel[]): Promise<void>;
	hideMarkupPreviews(cells: readonly ICellViewModel[]): Promise<void>;

	/**
	 * Render the output in webview layer
	 */
	createOutput(cell: ICellViewModel, output: IInsetRenderOutput, offset: number): Promise<void>;

	/**
	 * Remove the output from the webview layer
	 */
	removeInset(output: IDisplayOutputViewModel): void;

	/**
	 * Hide the inset in the webview layer without removing it
	 */
	hideInset(output: IDisplayOutputViewModel): void;


	onDidReceiveMessage: Event<INotebookWebviewMessage>;

	/**
	 * Send message to the webview for outputs.
	 */
	postMessage(message: any): void;

	/**
	 * Remove class name on the notebook editor root DOM node.
	 */
	addClassName(className: string): void;

	/**
	 * Remove class name on the notebook editor root DOM node.
	 */
	removeClassName(className: string): void;

	deltaCellOutputContainerClassNames(cellId: string, added: string[], removed: string[]): void;

	/**
	 * Trigger the editor to scroll from scroll event programmatically
	 */
	triggerScroll(event: IMouseWheelEvent): void;

	/**
	 * The range will be revealed with as little scrolling as possible.
	 */
	revealCellRangeInView(range: ICellRange): void;

	/**
	 * Reveal cell into viewport.
	 */
	revealInView(cell: ICellViewModel): void;

	/**
	 * Reveal cell into the top of viewport.
	 */
	revealInViewAtTop(cell: ICellViewModel): void;

	/**
	 * Reveal cell into viewport center.
	 */
	revealInCenter(cell: ICellViewModel): void;

	/**
	 * Reveal cell into viewport center if cell is currently out of the viewport.
	 */
	revealInCenterIfOutsideViewport(cell: ICellViewModel): void;

	/**
	 * Reveal a line in notebook cell into viewport with minimal scrolling.
	 */
	revealLineInViewAsync(cell: ICellViewModel, line: number): Promise<void>;

	/**
	 * Reveal a line in notebook cell into viewport center.
	 */
	revealLineInCenterAsync(cell: ICellViewModel, line: number): Promise<void>;

	/**
	 * Reveal a line in notebook cell into viewport center.
	 */
	revealLineInCenterIfOutsideViewportAsync(cell: ICellViewModel, line: number): Promise<void>;

	/**
	 * Reveal a range in notebook cell into viewport with minimal scrolling.
	 */
	revealRangeInViewAsync(cell: ICellViewModel, range: Range): Promise<void>;

	/**
	 * Reveal a range in notebook cell into viewport center.
	 */
	revealRangeInCenterAsync(cell: ICellViewModel, range: Range): Promise<void>;

	/**
	 * Reveal a range in notebook cell into viewport center.
	 */
	revealRangeInCenterIfOutsideViewportAsync(cell: ICellViewModel, range: Range): Promise<void>;

	/**
	 * Get the view index of a cell
	 */
	getViewIndex(cell: ICellViewModel): number;

	/**
	 * Get the view height of a cell (from the list view)
	 */
	getViewHeight(cell: ICellViewModel): number;

	/**
	 * @param startIndex Inclusive
	 * @param endIndex Exclusive
	 */
	getCellRangeFromViewRange(startIndex: number, endIndex: number): ICellRange | undefined;

	/**
	 * @param startIndex Inclusive
	 * @param endIndex Exclusive
	 */
	getCellsFromViewRange(startIndex: number, endIndex: number): ReadonlyArray<ICellViewModel>;

	/**
	 * Set hidden areas on cell text models.
	 */
	setHiddenAreas(_ranges: ICellRange[]): boolean;

	setCellEditorSelection(cell: ICellViewModel, selection: Range): void;

	deltaCellDecorations(oldDecorations: string[], newDecorations: INotebookDeltaDecoration[]): string[];

	/**
	 * Change the decorations on cells.
	 * The notebook is virtualized and this method should be called to create/delete editor decorations safely.
	 */
	changeModelDecorations<T>(callback: (changeAccessor: IModelDecorationsChangeAccessor) => T): T | null;

	setEditorDecorations(key: string, range: ICellRange): void;
	removeEditorDecorations(key: string): void;

	/**
	 * An event emitted on a "mouseup".
	 * @event
	 */
	onMouseUp(listener: (e: INotebookEditorMouseEvent) => void): IDisposable;

	/**
	 * An event emitted on a "mousedown".
	 * @event
	 */
	onMouseDown(listener: (e: INotebookEditorMouseEvent) => void): IDisposable;

	/**
	 * Get a contribution of this editor.
	 * @id Unique identifier of the contribution.
	 * @return The contribution or null if contribution not found.
	 */
	getContribution<T extends INotebookEditorContribution>(id: string): T;
	cellAt(index: number): ICellViewModel | undefined;
	getCellByInfo(cellInfo: ICommonCellInfo): ICellViewModel;
	getCellById(cellId: string): ICellViewModel | undefined;
	getCellByHandle(handle: number): ICellViewModel | undefined;
	getCellIndex(cell: ICellViewModel): number | undefined;
	getCellIndexByHandle(handle: number): number | undefined;
	updateOutputHeight(cellInfo: ICommonCellInfo, output: IDisplayOutputViewModel, height: number, isInit: boolean, source?: string): void;
}

export interface INotebookCellList {
	isDisposed: boolean;
	viewModel: NotebookViewModel | null;
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
	readonly onDidRemoveOutputs: Event<readonly ICellOutputViewModel[]>;
	readonly onDidHideOutputs: Event<readonly ICellOutputViewModel[]>;
	readonly onDidRemoveCellsFromView: Event<readonly ICellViewModel[]>;
	readonly onMouseUp: Event<IListMouseEvent<CellViewModel>>;
	readonly onMouseDown: Event<IListMouseEvent<CellViewModel>>;
	readonly onContextMenu: Event<IListContextMenuEvent<CellViewModel>>;
	detachViewModel(): void;
	attachViewModel(viewModel: NotebookViewModel): void;
	clear(): void;
	getViewIndex(cell: ICellViewModel): number | undefined;
	getViewIndex2(modelIndex: number): number | undefined;
	getModelIndex(cell: CellViewModel): number | undefined;
	getModelIndex2(viewIndex: number): number | undefined;
	getVisibleRangesPlusViewportBelow(): ICellRange[];
	focusElement(element: ICellViewModel): void;
	selectElements(elements: ICellViewModel[]): void;
	getFocusedElements(): ICellViewModel[];
	getSelectedElements(): ICellViewModel[];
	revealElementsInView(range: ICellRange): void;
	scrollToBottom(): void;
	revealElementInView(element: ICellViewModel): void;
	revealElementInViewAtTop(element: ICellViewModel): void;
	revealElementInCenterIfOutsideViewport(element: ICellViewModel): void;
	revealElementInCenter(element: ICellViewModel): void;
	revealElementInCenterIfOutsideViewportAsync(element: ICellViewModel): Promise<void>;
	revealElementLineInViewAsync(element: ICellViewModel, line: number): Promise<void>;
	revealElementLineInCenterAsync(element: ICellViewModel, line: number): Promise<void>;
	revealElementLineInCenterIfOutsideViewportAsync(element: ICellViewModel, line: number): Promise<void>;
	revealElementRangeInViewAsync(element: ICellViewModel, range: Range): Promise<void>;
	revealElementRangeInCenterAsync(element: ICellViewModel, range: Range): Promise<void>;
	revealElementRangeInCenterIfOutsideViewportAsync(element: ICellViewModel, range: Range): Promise<void>;
	setHiddenAreas(_ranges: ICellRange[], triggerViewUpdate: boolean): boolean;
	domElementOfElement(element: ICellViewModel): HTMLElement | null;
	focusView(): void;
	getAbsoluteTopOfElement(element: ICellViewModel): number;
	triggerScrollFromMouseWheelEvent(browserEvent: IMouseWheelEvent): void;
	updateElementHeight2(element: ICellViewModel, size: number): void;
	domFocus(): void;
	setCellSelection(element: ICellViewModel, range: Range): void;
	style(styles: IListStyles): void;
	getRenderHeight(): number;
	updateOptions(options: IListOptions<ICellViewModel>): void;
	layout(height?: number, width?: number): void;
	dispose(): void;
}

export interface BaseCellRenderTemplate {
	rootContainer: HTMLElement;
	editorPart: HTMLElement;
	cellInputCollapsedContainer: HTMLElement;
	contextKeyService: IContextKeyService;
	container: HTMLElement;
	cellContainer: HTMLElement;
	decorationContainer: HTMLElement;
	toolbar: ToolBar;
	deleteToolbar: ToolBar;
	betweenCellToolbar: ToolBar;
	focusIndicatorLeft: HTMLElement;
	focusIndicatorRight: HTMLElement;
	readonly disposables: DisposableStore;
	readonly elementDisposables: DisposableStore;
	bottomCellContainer: HTMLElement;
	currentRenderedCell?: ICellViewModel;
	statusBar: CellEditorStatusBar;
	titleMenu: IMenu;
	toJSON: () => object;
}

export interface MarkdownCellRenderTemplate extends BaseCellRenderTemplate {
	editorContainer: HTMLElement;
	foldingIndicator: HTMLElement;
	focusIndicatorBottom: HTMLElement;
	currentEditor?: ICodeEditor;
}

export interface CodeCellRenderTemplate extends BaseCellRenderTemplate {
	runToolbar: ToolBar;
	runButtonContainer: HTMLElement;
	executionOrderLabel: HTMLElement;
	outputContainer: HTMLElement;
	cellOutputCollapsedContainer: HTMLElement;
	outputShowMoreContainer: HTMLElement;
	focusSinkElement: HTMLElement;
	editor: ICodeEditor;
	progressBar: ProgressBar;
	collapsedProgressBar: ProgressBar;
	focusIndicatorRight: HTMLElement;
	focusIndicatorBottom: HTMLElement;
	dragHandle: HTMLElement;
}

export function isCodeCellRenderTemplate(templateData: BaseCellRenderTemplate): templateData is CodeCellRenderTemplate {
	return !!(templateData as CodeCellRenderTemplate).runToolbar;
}

export interface IOutputTransformContribution {
	getType(): RenderOutputType;
	getMimetypes(): string[];
	/**
	 * Dispose this contribution.
	 */
	dispose(): void;

	/**
	 * Returns contents to place in the webview inset, or the {@link IRenderNoOutput}.
	 * This call is allowed to have side effects, such as placing output
	 * directly into the container element.
	 */
	render(output: ICellOutputViewModel, item: IOutputItemDto, container: HTMLElement, notebookUri: URI): IRenderOutput;
}

export interface CellFindMatch {
	cell: CellViewModel;
	matches: FindMatch[];
}

export interface CellFindMatchWithIndex {
	cell: CellViewModel;
	index: number;
	matches: FindMatch[];
}

export enum CellRevealType {
	Line,
	Range
}

export enum CellRevealPosition {
	Top,
	Center,
	Bottom
}

export enum CellEditState {
	/**
	 * Default state.
	 * For markup cells, this is the renderer version of the markup.
	 * For code cell, the browser focus should be on the container instead of the editor
	 */
	Preview,

	/**
	 * Editing mode. Source for markup or code is rendered in editors and the state will be persistent.
	 */
	Editing
}

export enum CellFocusMode {
	Container,
	Editor
}

export enum CursorAtBoundary {
	None,
	Top,
	Bottom,
	Both
}

export interface CellViewModelStateChangeEvent {
	readonly metadataChanged?: boolean;
	readonly internalMetadataChanged?: boolean;
	readonly runStateChanged?: boolean;
	readonly selectionChanged?: boolean;
	readonly focusModeChanged?: boolean;
	readonly editStateChanged?: boolean;
	readonly languageChanged?: boolean;
	readonly foldingStateChanged?: boolean;
	readonly contentChanged?: boolean;
	readonly outputIsHoveredChanged?: boolean;
	readonly outputIsFocusedChanged?: boolean;
	readonly cellIsHoveredChanged?: boolean;
	readonly cellLineNumberChanged?: boolean;
}

export function cellRangesEqual(a: ICellRange[], b: ICellRange[]) {
	a = reduceCellRanges(a);
	b = reduceCellRanges(b);
	if (a.length !== b.length) {
		return false;
	}

	for (let i = 0; i < a.length; i++) {
		if (a[i].start !== b[i].start || a[i].end !== b[i].end) {
			return false;
		}
	}

	return true;
}


/**
 * @param _ranges
 */
export function reduceCellRanges(_ranges: ICellRange[]): ICellRange[] {
	if (!_ranges.length) {
		return [];
	}

	const ranges = _ranges.sort((a, b) => a.start - b.start);
	const result: ICellRange[] = [];
	let currentRangeStart = ranges[0].start;
	let currentRangeEnd = ranges[0].end + 1;

	for (let i = 0, len = ranges.length; i < len; i++) {
		const range = ranges[i];

		if (range.start > currentRangeEnd) {
			result.push({ start: currentRangeStart, end: currentRangeEnd - 1 });
			currentRangeStart = range.start;
			currentRangeEnd = range.end + 1;
		} else if (range.end + 1 > currentRangeEnd) {
			currentRangeEnd = range.end + 1;
		}
	}

	result.push({ start: currentRangeStart, end: currentRangeEnd - 1 });
	return result;
}

export function getVisibleCells(cells: CellViewModel[], hiddenRanges: ICellRange[]) {
	if (!hiddenRanges.length) {
		return cells;
	}

	let start = 0;
	let hiddenRangeIndex = 0;
	const result: CellViewModel[] = [];

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

export function getNotebookEditorFromEditorPane(editorPane?: IEditorPane): INotebookEditor | undefined {
	if (!editorPane) {
		return;
	}

	if (editorPane.getId() === NOTEBOOK_EDITOR_ID) {
		return editorPane.getControl() as INotebookEditor | undefined;
	}

	const input = editorPane.input;

	if (input && isCompositeNotebookEditorInput(input)) {
		return (editorPane.getControl() as { notebookEditor: INotebookEditor | undefined; }).notebookEditor;
	}

	return undefined;
}

/**
 * ranges: model selections
 * this will convert model selections to view indexes first, and then include the hidden ranges in the list view
 */
export function expandCellRangesWithHiddenCells(editor: INotebookEditor, viewModel: NotebookViewModel, ranges: ICellRange[]) {
	// assuming ranges are sorted and no overlap
	const indexes = cellRangesToIndexes(ranges);
	let modelRanges: ICellRange[] = [];
	indexes.forEach(index => {
		const viewCell = viewModel.viewCells[index];

		if (!viewCell) {
			return;
		}

		const viewIndex = editor.getViewIndex(viewCell);
		if (viewIndex < 0) {
			return;
		}

		const nextViewIndex = viewIndex + 1;
		const range = editor.getCellRangeFromViewRange(viewIndex, nextViewIndex);

		if (range) {
			modelRanges.push(range);
		}
	});

	return reduceRanges(modelRanges);
}

/**
 * Return a set of ranges for the cells matching the given predicate
 */
export function getRanges(cells: ICellViewModel[], included: (cell: ICellViewModel) => boolean): ICellRange[] {
	const ranges: ICellRange[] = [];
	let currentRange: ICellRange | undefined;

	cells.forEach((cell, idx) => {
		if (included(cell)) {
			if (!currentRange) {
				currentRange = { start: idx, end: idx + 1 };
				ranges.push(currentRange);
			} else {
				currentRange.end = idx + 1;
			}
		} else {
			currentRange = undefined;
		}
	});

	return ranges;
}

export function cellRangeToViewCells(viewModel: NotebookViewModel, ranges: ICellRange[]) {
	const cells: ICellViewModel[] = [];
	ranges.forEach(range => {
		cells.push(...viewModel.getCells(range));
	});

	return cells;
}
