/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { combinedDisposable, IDisposable } from '../../../../../../base/common/lifecycle.js';
import { clamp } from '../../../../../../base/common/numbers.js';
import { ICellViewModel, INotebookEditor } from '../../notebookBrowser.js';

export function registerCellToolbarStickyScroll(notebookEditor: INotebookEditor, cell: ICellViewModel, element: HTMLElement, opts?: { extraOffset?: number; min?: number }): IDisposable {
	const extraOffset = opts?.extraOffset ?? 0;
	const min = opts?.min ?? 0;

	const updateForScroll = () => {
		// Re-resolve the captured cell against the editor's current view model. The
		// scroll listener can outlive the cell's membership (e.g. the cell was removed
		// or the pooled editor widget was reattached to a different notebook), in which
		// case `getAbsoluteTopOfElement` below would throw an "Invalid index -1" ListError.
		if (notebookEditor.getCellByHandle(cell.handle) !== cell) {
			return;
		}
		if (cell.isInputCollapsed) {
			element.style.top = '';
		} else {
			const scrollTop = notebookEditor.scrollTop;
			const elementTop = notebookEditor.getAbsoluteTopOfElement(cell);
			const diff = scrollTop - elementTop + extraOffset;
			const maxTop = cell.layoutInfo.editorHeight + cell.layoutInfo.statusBarHeight - 45; // subtract roughly the height of the execution order label plus padding
			const top = maxTop > 20 ? // Don't move the run button if it can only move a very short distance
				clamp(min, diff, maxTop) :
				min;
			element.style.top = `${top}px`;
		}
	};

	updateForScroll();
	const disposables: IDisposable[] = [];
	disposables.push(
		notebookEditor.onDidScroll(() => updateForScroll()),
		notebookEditor.onDidChangeLayout(() => updateForScroll())
	);

	return combinedDisposable(...disposables);
}
