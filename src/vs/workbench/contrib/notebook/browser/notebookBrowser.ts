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

export interface INotebookEditor {
	viewType: string | undefined;
	insertEmptyNotebookCell(index: number | undefined, cell: CellViewModel, type: 'markdown' | 'code', direction: 'above' | 'below'): Promise<void>;
	deleteNotebookCell(index: number | undefined, cell: CellViewModel): void;
	editNotebookCell(index: number | undefined, cell: CellViewModel): void;
	saveNotebookCell(index: number | undefined, cell: CellViewModel): void;
	focusNotebookCell(cell: CellViewModel, focusEditor: boolean): void;
	getActiveCell(): CellViewModel | undefined;
	layoutNotebookCell(cell: CellViewModel, height: number): void;
	createInset(cell: CellViewModel, index: number, shadowContent: string, offset: number): void;
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
