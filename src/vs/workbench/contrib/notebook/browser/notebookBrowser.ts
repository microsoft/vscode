/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as DOM from 'vs/base/browser/dom';
import { IMouseWheelEvent } from 'vs/base/browser/mouseEvent';
import { BareFontInfo } from 'vs/editor/common/config/fontInfo';
import { CodeEditorWidget } from 'vs/editor/browser/widget/codeEditorWidget';
import { CellViewModel } from 'vs/workbench/contrib/notebook/browser/renderers/cellViewModel';
import { OutputRenderer } from 'vs/workbench/contrib/notebook/browser/output/outputRenderer';
import { IOutput, CellKind, IRenderOutput } from 'vs/workbench/contrib/notebook/common/notebookCommon';
import { RawContextKey } from 'vs/platform/contextkey/common/contextkey';

export const KEYBINDING_CONTEXT_NOTEBOOK_FIND_WIDGET_FOCUSED = new RawContextKey<boolean>('notebookFindWidgetFocused', false);

export interface INotebookEditor {
	viewType: string | undefined;
	insertEmptyNotebookCell(cell: CellViewModel, type: CellKind, direction: 'above' | 'below'): Promise<void>;
	deleteNotebookCell(cell: CellViewModel): void;
	editNotebookCell(cell: CellViewModel): void;
	saveNotebookCell(cell: CellViewModel): void;
	focusNotebookCell(cell: CellViewModel, focusEditor: boolean): void;
	getActiveCell(): CellViewModel | undefined;
	layoutNotebookCell(cell: CellViewModel, height: number): void;
	createInset(cell: CellViewModel, output: IOutput, shadowContent: string, offset: number): void;
	removeInset(output: IOutput): void;
	triggerScroll(event: IMouseWheelEvent): void;
	getFontInfo(): BareFontInfo | undefined;
	getListDimension(): DOM.Dimension | null;
	getOutputRenderer(): OutputRenderer;
}

export interface CellRenderTemplate {
	container: HTMLElement;
	cellContainer: HTMLElement;
	menuContainer?: HTMLElement;
	editingContainer?: HTMLElement;
	outputContainer?: HTMLElement;
	editor?: CodeEditorWidget;
}

export interface IOutputTransformContribution {
	/**
	 * Dispose this contribution.
	 */
	dispose(): void;

	render(output: IOutput, container: HTMLElement, preferredMimeType: string | undefined): IRenderOutput;
}
