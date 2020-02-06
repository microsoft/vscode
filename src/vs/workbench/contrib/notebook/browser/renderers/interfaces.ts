/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as DOM from 'vs/base/browser/dom';
import { ViewCell } from 'vs/workbench/contrib/notebook/browser/renderers/cellRenderer';
import { IMouseWheelEvent } from 'vs/base/browser/mouseEvent';
import { BareFontInfo } from 'vs/editor/common/config/fontInfo';
import { CodeEditorWidget } from 'vs/editor/browser/widget/codeEditorWidget';
import { ITextModel } from 'vs/editor/common/model';

export const CELL_MARGIN = 24;

export interface NotebookHandler {
	viewType: string | undefined;
	insertEmptyNotebookCell(listIndex: number | undefined, cell: ViewCell, type: 'markdown' | 'code', direction: 'above' | 'below'): Promise<void>;
	deleteNotebookCell(listIndex: number | undefined, cell: ViewCell): void;
	editNotebookCell(listIndex: number | undefined, cell: ViewCell): void;
	saveNotebookCell(listIndex: number | undefined, cell: ViewCell): void;
	focusNotebookCell(cell: ViewCell, focusEditor: boolean): void;
	getActiveCell(): ViewCell | undefined;
	layoutElement(cell: ViewCell, height: number): void;
	createContentWidget(cell: ViewCell, index: number, shadowContent: string, offset: number): void;
	disposeViewCell(cell: ViewCell): void;
	triggerWheel(event: IMouseWheelEvent): void;
	getFontInfo(): BareFontInfo | undefined;
	getListDimension(): DOM.Dimension | null;
}

export interface CellRenderTemplate {
	container: HTMLElement;
	cellContainer: HTMLElement;
	menuContainer?: HTMLElement;
	editingContainer?: HTMLElement;
	outputContainer?: HTMLElement;
	editor?: CodeEditorWidget;
	model?: ITextModel;
	index: number;
}
