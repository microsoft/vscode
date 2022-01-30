/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as DOM from 'vs/base/browser/dom';
import { localize } from 'vs/nls';
import { CellEditState, CellFoldingState, ICellViewModel, INotebookEditor } from 'vs/workbench/contrib/notebook/browser/notebookBrowser';
import { CellViewModelStateChangeEvent } from 'vs/workbench/contrib/notebook/browser/notebookViewEvents';
import { CellPart } from 'vs/workbench/contrib/notebook/browser/view/cellParts/cellPart';
import { BaseCellRenderTemplate } from 'vs/workbench/contrib/notebook/browser/view/notebookRenderingCommon';
import { MarkupCellViewModel } from 'vs/workbench/contrib/notebook/browser/viewModel/markupCellViewModel';

export class FoldedCellHint extends CellPart {

	constructor(
		private readonly _notebookEditor: INotebookEditor,
		private readonly _container: HTMLElement,
	) {
		super();
	}

	renderCell(element: MarkupCellViewModel, templateData: BaseCellRenderTemplate): void {
		this.update(element);
	}

	private update(element: MarkupCellViewModel) {
		if (!this._notebookEditor.hasModel()) {
			return;
		}

		if (element.isInputCollapsed || element.getEditState() === CellEditState.Editing) {
			DOM.hide(this._container);
		} else if (element.foldingState === CellFoldingState.Collapsed) {
			const idx = this._notebookEditor._getViewModel().getCellIndex(element);
			const length = this._notebookEditor._getViewModel().getFoldedLength(idx);
			DOM.reset(this._container, this.getHiddenCellsLabel(length));
			DOM.show(this._container);

			const foldHintTop = element.layoutInfo.previewHeight;
			this._container.style.top = `${foldHintTop}px`;
		} else if (element.foldingState === CellFoldingState.Expanded) {
			DOM.hide(this._container);
		}
	}

	private getHiddenCellsLabel(num: number): string {
		if (num === 1) {
			return localize('hiddenCellsLabel', "1 cell hidden") + '…';
		} else {
			return localize('hiddenCellsLabelPlural', "{0} cells hidden", num) + '…';
		}
	}

	prepareLayout(): void {
		// nothing to read
	}

	updateInternalLayoutNow(element: MarkupCellViewModel) {
		this.update(element);
	}

	updateState(element: ICellViewModel, e: CellViewModelStateChangeEvent): void {
		// nothing to update
	}
}
