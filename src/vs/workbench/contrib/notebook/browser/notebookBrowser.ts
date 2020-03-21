/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from 'vs/base/common/event';
import { IMouseWheelEvent } from 'vs/base/browser/mouseEvent';
import { BareFontInfo } from 'vs/editor/common/config/fontInfo';
import { CodeEditorWidget } from 'vs/editor/browser/widget/codeEditorWidget';
import { OutputRenderer } from 'vs/workbench/contrib/notebook/browser/view/output/outputRenderer';
import { IOutput, CellKind, IRenderOutput } from 'vs/workbench/contrib/notebook/common/notebookCommon';
import { RawContextKey } from 'vs/platform/contextkey/common/contextkey';
import { NotebookViewModel, IModelDecorationsChangeAccessor, CellViewModel } from 'vs/workbench/contrib/notebook/browser/viewModel/notebookViewModel';
import { FindMatch } from 'vs/editor/common/model';
import { Range } from 'vs/editor/common/core/range';
import { ToolBar } from 'vs/base/browser/ui/toolbar/toolbar';
import { DisposableStore } from 'vs/base/common/lifecycle';
import { URI } from 'vs/base/common/uri';
import { ProgressBar } from 'vs/base/browser/ui/progressbar/progressbar';

export const KEYBINDING_CONTEXT_NOTEBOOK_FIND_WIDGET_FOCUSED = new RawContextKey<boolean>('notebookFindWidgetFocused', false);

export const NOTEBOOK_EDITOR_FOCUSED = new RawContextKey<boolean>('notebookEditorFocused', false);

export interface NotebookLayoutInfo {
	width: number;
	height: number;
	fontInfo: BareFontInfo;
}

export interface NotebookLayoutChangeEvent {
	width?: boolean;
	height?: boolean;
	fontInfo?: boolean;
}

export interface NotebookViewLayoutAccessor {
	layoutInfo: NotebookLayoutInfo | null;
	onDidChangeLayout: Event<NotebookLayoutChangeEvent>;
}

export interface CodeCellLayoutInfo {
	readonly fontInfo: BareFontInfo | null;
	readonly editorHeight: number;
	readonly editorWidth: number;
	readonly totalHeight: number;
	readonly outputTotalHeight: number;
	readonly indicatorHeight: number;
}

export interface CodeCellLayoutChangeEvent {
	editorHeight?: boolean;
	outputHeight?: boolean;
	totalHeight?: boolean;
	outerWidth?: boolean;
}

export interface MarkdownCellLayoutInfo {
	readonly fontInfo: BareFontInfo | null;
	readonly editorWidth: number;
}

export interface MarkdownCellLayoutChangeEvent {
	outerWidth?: boolean;
}

export interface ICellViewModel {
	readonly id: string;
	handle: number;
	uri: URI;
	cellKind: CellKind;
	state: CellState;
	focusMode: CellFocusMode;
	getText(): string;
}

export interface INotebookEditor {

	/**
	 * Notebook view model attached to the current editor
	 */
	viewModel: NotebookViewModel | undefined;

	isNotebookEditor: boolean;

	/**
	 * Focus the notebook editor cell list
	 */
	focus(): void;

	/**
	 * Select & focus cell
	 */
	selectElement(cell: ICellViewModel): void;

	/**
	 * Layout info for the notebook editor
	 */
	getLayoutInfo(): NotebookLayoutInfo;
	/**
	 * Fetch the output renderers for notebook outputs.
	 */
	getOutputRenderer(): OutputRenderer;

	/**
	 * Insert a new cell around `cell`
	 */
	insertNotebookCell(cell: ICellViewModel, type: CellKind, direction: 'above' | 'below', initialText?: string): Promise<void>;

	/**
	 * Delete a cell from the notebook
	 */
	deleteNotebookCell(cell: ICellViewModel): void;

	/**
	 * Move a cell up one spot
	 */
	moveCellUp(cell: ICellViewModel): void;

	/**
	 * Move a cell down one spot
	 */
	moveCellDown(cell: ICellViewModel): void;

	/**
	 * Switch the cell into editing mode.
	 *
	 * For code cell, the monaco editor will be focused.
	 * For markdown cell, it will switch from preview mode to editing mode, which focuses the monaco editor.
	 */
	editNotebookCell(cell: ICellViewModel): void;

	/**
	 * Quit cell editing mode.
	 */
	saveNotebookCell(cell: ICellViewModel): void;

	/**
	 * Focus the container of a cell (the monaco editor inside is not focused).
	 */
	focusNotebookCell(cell: ICellViewModel, focusEditor: boolean): void;

	/**
	 * Get current active cell
	 */
	getActiveCell(): ICellViewModel | undefined;

	/**
	 * Layout the cell with a new height
	 */
	layoutNotebookCell(cell: ICellViewModel, height: number): void;

	/**
	 * Render the output in webview layer
	 */
	createInset(cell: ICellViewModel, output: IOutput, shadowContent: string, offset: number): void;

	/**
	 * Remove the output from the webview layer
	 */
	removeInset(output: IOutput): void;

	/**
	 * Send message to the webview for outputs.
	 */
	postMessage(message: any): void;

	/**
	 * Trigger the editor to scroll from scroll event programmatically
	 */
	triggerScroll(event: IMouseWheelEvent): void;

	/**
	 * Reveal cell into viewport.
	 */
	revealInView(cell: ICellViewModel): void;

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
	revealLineInView(cell: ICellViewModel, line: number): void;

	/**
	 * Reveal a line in notebook cell into viewport center.
	 */
	revealLineInCenter(cell: ICellViewModel, line: number): void;

	/**
	 * Reveal a line in notebook cell into viewport center.
	 */
	revealLineInCenterIfOutsideViewport(cell: ICellViewModel, line: number): void;

	/**
	 * Reveal a range in notebook cell into viewport with minimal scrolling.
	 */
	revealRangeInView(cell: ICellViewModel, range: Range): void;

	/**
	 * Reveal a range in notebook cell into viewport center.
	 */
	revealRangeInCenter(cell: ICellViewModel, range: Range): void;

	/**
	 * Reveal a range in notebook cell into viewport center.
	 */
	revealRangeInCenterIfOutsideViewport(cell: ICellViewModel, range: Range): void;

	setCellSelection(cell: ICellViewModel, selection: Range): void;

	/**
	 * Change the decorations on cells.
	 * The notebook is virtualized and this method should be called to create/delete editor decorations safely.
	 */
	changeDecorations(callback: (changeAccessor: IModelDecorationsChangeAccessor) => any): any;

	/**
	 * Show Find Widget.
	 *
	 * Currently Find is still part of the NotebookEditor core
	 */
	showFind(): void;

	/**
	 * Hide Find Widget
	 */
	hideFind(): void;
}

export interface CellRenderTemplate {
	container: HTMLElement;
	cellContainer: HTMLElement;
	editorContainer?: HTMLElement;
	toolbar: ToolBar;
	focusIndicator?: HTMLElement;
	runToolbar?: ToolBar;
	editingContainer?: HTMLElement;
	outputContainer?: HTMLElement;
	editor?: CodeEditorWidget;
	progressBar?: ProgressBar;
	disposables: DisposableStore;
}

export interface IOutputTransformContribution {
	/**
	 * Dispose this contribution.
	 */
	dispose(): void;

	render(output: IOutput, container: HTMLElement, preferredMimeType: string | undefined): IRenderOutput;
}

export interface CellFindMatch {
	cell: CellViewModel;
	matches: FindMatch[];
}

export enum CellRevealType {
	Line,
	Range
}

export enum CellRevealPosition {
	Top,
	Center
}

export enum CellState {
	/**
	 * Default state.
	 * For markdown cell, it's Markdown preview.
	 * For code cell, the browser focus should be on the container instead of the editor
	 */
	Preview,


	/**
	 * Eding mode. Source for markdown or code is rendered in editors and the state will be persistent.
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
