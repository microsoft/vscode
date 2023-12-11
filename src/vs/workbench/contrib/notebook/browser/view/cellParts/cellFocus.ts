/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as DOM from 'vs/base/browser/dom';
import { INotebookEditor } from 'vs/workbench/contrib/notebook/browser/notebookBrowser';
import { CellContentPart } from 'vs/workbench/contrib/notebook/browser/view/cellPart';
import { CodeCellViewModel } from 'vs/workbench/contrib/notebook/browser/viewModel/codeCellViewModel';

export class CellFocusPart extends CellContentPart {
	constructor(
		containerElement: HTMLElement,
		focusSinkElement: HTMLElement | undefined,
		notebookEditor: INotebookEditor
	) {
		super();

		this._register(DOM.addDisposableListener(containerElement, DOM.EventType.FOCUS, () => {
			if (this.currentCell) {
				notebookEditor.focusElement(this.currentCell);
			}
		}, true));

		if (focusSinkElement) {
			this._register(DOM.addDisposableListener(focusSinkElement, DOM.EventType.FOCUS, () => {
				if (this.currentCell && (this.currentCell as CodeCellViewModel).outputsViewModels.length) {
					notebookEditor.focusNotebookCell(this.currentCell, 'output');
				}
			}));
		}
	}
}
