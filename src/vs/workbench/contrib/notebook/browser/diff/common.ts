/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { NotebookLayoutInfo } from 'vs/workbench/contrib/notebook/browser/notebookBrowser';
import { CellDiffViewModel } from 'vs/workbench/contrib/notebook/browser/diff/celllDiffViewModel';
import { Event } from 'vs/base/common/event';
import { BareFontInfo } from 'vs/editor/common/config/fontInfo';
import { DisposableStore } from 'vs/base/common/lifecycle';
import { NotebookTextModel } from 'vs/workbench/contrib/notebook/common/model/notebookTextModel';

export interface INotebookTextDiffEditor {
	readonly textModel?: NotebookTextModel;
	onMouseUp: Event<{ readonly event: MouseEvent; readonly target: CellDiffViewModel; }>;
	getOverflowContainerDomNode(): HTMLElement;
	getLayoutInfo(): NotebookLayoutInfo;
	layoutNotebookCell(cell: CellDiffViewModel, height: number): void;
}

export interface CellDiffRenderTemplate {
	readonly container: HTMLElement;
	readonly elementDisposables: DisposableStore;
}

export interface CellDiffViewModelLayoutChangeEvent {
	font?: BareFontInfo;
	outerWidth?: number;
}

export const DIFF_CELL_MARGIN = 16;
