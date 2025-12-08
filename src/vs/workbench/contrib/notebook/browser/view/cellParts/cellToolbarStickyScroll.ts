/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IDisposable } from 'vs/base/common/lifecycle';
import { clamp } from 'vs/base/common/numbers';
import { ICellViewModel, INotebookEditor } from 'vs/workbench/contrib/notebook/browser/notebookBrowser';

export function registerCellToolbarStickyScroll(notebookEditor: INotebookEditor, cell: ICellViewModel, element: HTMLElement, opts?: { extraOffset?: number; min?: number }): IDisposable {
	const extraOffset = opts?.extraOffset ?? 0;
	const min = opts?.min ?? 0;

	const updateForScroll = () => {
		if (cell.isInputCollapsed) {
			element.style.top = '';
		} else {
			const stickyHeight = notebookEditor.getLayoutInfo().stickyHeight;
			const scrollTop = notebookEditor.scrollTop;
			const elementTop = notebookEditor.getAbsoluteTopOfElement(cell);
			const diff = scrollTop - elementTop + extraOffset + stickyHeight;
			const maxTop = cell.layoutInfo.editorHeight + cell.layoutInfo.statusBarHeight - 45; // subtract roughly the height of the execution order label plus padding
			const top = maxTop > 20 ? // Don't move the run button if it can only move a very short distance
				clamp(min, diff, maxTop) :
				min;
			element.style.top = `${top}px`;
		}
	};

	updateForScroll();
	return notebookEditor.onDidScroll(() => updateForScroll());
}
