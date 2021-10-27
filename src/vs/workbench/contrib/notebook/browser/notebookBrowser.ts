/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from 'vs/base/common/event';
import { IDisposable } from 'vs/base/common/lifecycle';
import { URI } from 'vs/base/common/uri';
import { FontInfo } from 'vs/editor/common/config/fontInfo';
import { IPosition } from 'vs/editor/common/core/position';
import { Range } from 'vs/editor/common/core/range';
import { FindMatch, IModelDeltaDecoration, IReadonlyTextBuffer, ITextModel } from 'vs/editor/common/model';
import { ContextKeyExpr, RawContextKey } from 'vs/platform/contextkey/common/contextkey';
import { OutputRenderer } from 'vs/workbench/contrib/notebook/browser/view/output/outputRenderer';
import { CellViewModel, IModelDecorationsChangeAccessor, INotebookViewCellsUpdateEvent, NotebookViewModel } from 'vs/workbench/contrib/notebook/browser/viewModel/notebookViewModel';
import { NotebookCellTextModel } from 'vs/workbench/contrib/notebook/common/model/notebookCellTextModel';
import { CellKind, NotebookCellMetadata, IOrderedMimeType, INotebookRendererInfo, ICellOutput, INotebookCellStatusBarItem, NotebookCellInternalMetadata, NotebookDocumentMetadata } from 'vs/workbench/contrib/notebook/common/notebookCommon';
import { ICellRange, cellRangesToIndexes, reduceCellRanges } from 'vs/workbench/contrib/notebook/common/notebookRange';
import { Webview } from 'vs/workbench/contrib/webview/browser/webview';
import { NotebookTextModel } from 'vs/workbench/contrib/notebook/common/model/notebookTextModel';
import { MenuId } from 'vs/platform/actions/common/actions';
import { IEditorPane } from 'vs/workbench/common/editor';
import { ITextEditorOptions, ITextResourceEditorInput } from 'vs/platform/editor/common/editor';
import { IConstructorSignature1 } from 'vs/platform/instantiation/common/instantiation';
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
export const NOTEBOOK_CELL_TOOLBAR_LOCATION = new RawContextKey<'left' | 'right' | 'hidden'>('notebookCellToolbarLocation', 'left');

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
/** @deprecated use the notebookKernel<Type> "keyword" instead */
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
		cellExecutePrimary?: MenuId;
	};
	readonly options?: NotebookOptions;
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


export interface INotebookEditor {
	//#region Eventing
	readonly onDidChangeCellState: Event<NotebookCellStateChangedEvent>;
	readonly onDidChangeViewCells: Event<INotebookViewCellsUpdateEvent>;
	readonly onDidChangeVisibleRanges: Event<void>;
	readonly onDidChangeSelection: Event<void>;
	/**
	 * An event emitted when the model of this editor has changed.
	 */
	readonly onDidChangeModel: Event<NotebookTextModel | undefined>;
	readonly onDidFocusEditorWidget: Event<void>;
	readonly onDidScroll: Event<void>;
	readonly onDidChangeActiveCell: Event<void>;
	readonly onMouseUp: Event<INotebookEditorMouseEvent>;
	readonly onMouseDown: Event<INotebookEditorMouseEvent>;

	//#endregion

	//#region readonly properties
	readonly visibleRanges: ICellRange[];
	readonly textModel?: NotebookTextModel;
	readonly isReadOnly: boolean;
	readonly notebookOptions: NotebookOptions;
	readonly isDisposed: boolean;
	readonly activeKernel: INotebookKernel | undefined;
	//#endregion

	getLength(): number;
	getSelections(): ICellRange[];
	setSelections(selections: ICellRange[]): void;
	getFocus(): ICellRange;
	setFocus(focus: ICellRange): void;
	getId(): string;
	hasEditorFocus(): boolean;

	cursorNavigationMode: boolean;

	_getViewModel(): NotebookViewModel | undefined;
	hasModel(): this is IActiveNotebookEditor;
	dispose(): void;
	getDomNode(): HTMLElement;
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
	 * Focus the container of a cell (the monaco editor inside is not focused).
	 */
	focusNotebookCell(cell: ICellViewModel, focus: 'editor' | 'container' | 'output', options?: IFocusNotebookCellOptions): void;

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

	/**
	 * Render the output in webview layer
	 */
	createOutput(cell: ICellViewModel, output: IInsetRenderOutput, offset: number): Promise<void>;

	readonly onDidReceiveMessage: Event<INotebookWebviewMessage>;

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
	 * Convert the view range to model range
	 * @param startIndex Inclusive
	 * @param endIndex Exclusive
	 */
	getCellRangeFromViewRange(startIndex: number, endIndex: number): ICellRange | undefined;

	/**
	 * Set hidden areas on cell text models.
	 */
	setHiddenAreas(_ranges: ICellRange[]): boolean;

	/**
	 * Set selectiosn on the text editor attached to the cell
	 */

	setCellEditorSelection(cell: ICellViewModel, selection: Range): void;

	/**
	 *Change the decorations on the notebook cell list
	 */

	deltaCellDecorations(oldDecorations: string[], newDecorations: INotebookDeltaDecoration[]): string[];

	/**
	 * Change the decorations on cell editors.
	 * The notebook is virtualized and this method should be called to create/delete editor decorations safely.
	 */
	changeModelDecorations<T>(callback: (changeAccessor: IModelDecorationsChangeAccessor) => T): T | null;

	/**
	 * Set decoration key on cells in the range
	 */
	setEditorDecorations(key: string, range: ICellRange): void;

	/**
	 * Remove decoration key from the notebook editor
	 */
	removeEditorDecorations(key: string): void;

	/**
	 * Get a contribution of this editor.
	 * @id Unique identifier of the contribution.
	 * @return The contribution or null if contribution not found.
	 */
	getContribution<T extends INotebookEditorContribution>(id: string): T;

	/**
	 * Get the view index of a cell at model `index`
	 */
	getViewIndexByModelIndex(index: number): number;
	getCellsInRange(range?: ICellRange): ReadonlyArray<ICellViewModel>;
	cellAt(index: number): ICellViewModel | undefined;
	getCellByHandle(handle: number): ICellViewModel | undefined;
	getCellIndex(cell: ICellViewModel): number | undefined;
	getNextVisibleCellIndex(index: number): number | undefined;
}

export interface IActiveNotebookEditor extends INotebookEditor {
	_getViewModel(): NotebookViewModel;
	textModel: NotebookTextModel;
	getFocus(): ICellRange;
	cellAt(index: number): ICellViewModel;
	getCellIndex(cell: ICellViewModel): number;
	getNextVisibleCellIndex(index: number): number;
}

/**
 * A mix of public interface and internal one (used by internal rendering code, e.g., cellRenderer)
 */
export interface INotebookEditorDelegate extends INotebookEditor {
	hasModel(): this is IActiveNotebookEditorDelegate;

	readonly creationOptions: INotebookEditorCreationOptions;
	readonly onDidChangeOptions: Event<void>;
	createMarkupPreview(cell: ICellViewModel): Promise<void>;
	unhideMarkupPreviews(cells: readonly ICellViewModel[]): Promise<void>;
	hideMarkupPreviews(cells: readonly ICellViewModel[]): Promise<void>;

	/**
	 * Remove the output from the webview layer
	 */
	removeInset(output: IDisplayOutputViewModel): void;

	/**
	 * Hide the inset in the webview layer without removing it
	 */
	hideInset(output: IDisplayOutputViewModel): void;
	deltaCellOutputContainerClassNames(cellId: string, added: string[], removed: string[]): void;
}

export interface IActiveNotebookEditorDelegate extends INotebookEditorDelegate {
	_getViewModel(): NotebookViewModel;
	textModel: NotebookTextModel;
	getFocus(): ICellRange;
	cellAt(index: number): ICellViewModel;
	getCellIndex(cell: ICellViewModel): number;
	getNextVisibleCellIndex(index: number): number;
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
export function expandCellRangesWithHiddenCells(editor: INotebookEditor, ranges: ICellRange[]) {
	// assuming ranges are sorted and no overlap
	const indexes = cellRangesToIndexes(ranges);
	let modelRanges: ICellRange[] = [];
	indexes.forEach(index => {
		const viewCell = editor.cellAt(index);

		if (!viewCell) {
			return;
		}

		const viewIndex = editor.getViewIndexByModelIndex(index);
		if (viewIndex < 0) {
			return;
		}

		const nextViewIndex = viewIndex + 1;
		const range = editor.getCellRangeFromViewRange(viewIndex, nextViewIndex);

		if (range) {
			modelRanges.push(range);
		}
	});

	return reduceCellRanges(modelRanges);
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

export function cellRangeToViewCells(editor: IActiveNotebookEditor, ranges: ICellRange[]) {
	const cells: ICellViewModel[] = [];
	reduceCellRanges(ranges).forEach(range => {
		cells.push(...editor.getCellsInRange(range));
	});

	return cells;
}

export function formatCellDuration(duration: number): string {
	const minutes = Math.floor(duration / 1000 / 60);
	const seconds = Math.floor(duration / 1000) % 60;
	const tenths = String(duration - minutes * 60 * 1000 - seconds * 1000).charAt(0);

	if (minutes > 0) {
		return `${minutes}m ${seconds}.${tenths}s`;
	} else {
		return `${seconds}.${tenths}s`;
	}
}
