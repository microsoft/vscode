/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { NotebookLayoutInfo } from 'vs/workbench/contrib/notebook/browser/notebookBrowser';
import { CellDiffViewModel } from 'vs/workbench/contrib/notebook/browser/diff/celllDiffViewModel';
import { Event } from 'vs/base/common/event';
import { BareFontInfo } from 'vs/editor/common/config/fontInfo';
import { DisposableStore } from 'vs/base/common/lifecycle';

export interface INotebookTextDiffEditor {
	onMouseUp: Event<{ readonly event: MouseEvent; readonly target: CellDiffViewModel; }>;
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
