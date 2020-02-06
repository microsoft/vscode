/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as DOM from 'vs/base/browser/dom';
import { IMouseWheelEvent } from 'vs/base/browser/mouseEvent';
import { BareFontInfo } from 'vs/editor/common/config/fontInfo';
import { CodeEditorWidget } from 'vs/editor/browser/widget/codeEditorWidget';
import { ITextModel } from 'vs/editor/common/model';
import { CellViewModel } from 'vs/workbench/contrib/notebook/browser/renderers/cellViewModel';

export const CELL_MARGIN = 24;

export interface NotebookHandler {
	viewType: string | undefined;
	insertEmptyNotebookCell(listIndex: number | undefined, cell: CellViewModel, type: 'markdown' | 'code', direction: 'above' | 'below'): Promise<void>;
	deleteNotebookCell(listIndex: number | undefined, cell: CellViewModel): void;
	editNotebookCell(listIndex: number | undefined, cell: CellViewModel): void;
	saveNotebookCell(listIndex: number | undefined, cell: CellViewModel): void;
	focusNotebookCell(cell: CellViewModel, focusEditor: boolean): void;
	getActiveCell(): CellViewModel | undefined;
	layoutElement(cell: CellViewModel, height: number): void;
	createContentWidget(cell: CellViewModel, index: number, shadowContent: string, offset: number): void;
	disposeViewCell(cell: CellViewModel): void;
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
