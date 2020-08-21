/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { NotebookLayoutInfo } from 'vs/workbench/contrib/notebook/browser/notebookBrowser';
import { CellDiffViewModel } from 'vs/workbench/contrib/notebook/browser/diff/celllDiffViewModel';
import { Event } from 'vs/base/common/event';

export interface INotebookTextDiffEditor {
	onMouseUp: Event<{ readonly event: MouseEvent; readonly target: CellDiffViewModel; }>;
	getLayoutInfo(): NotebookLayoutInfo;
	layoutNotebookCell(cell: CellDiffViewModel, height: number): void;
}
