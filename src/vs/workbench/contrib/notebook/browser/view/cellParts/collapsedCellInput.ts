/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as DOM from 'vs/base/browser/dom';
import { ICellViewModel, INotebookEditor } from 'vs/workbench/contrib/notebook/browser/notebookBrowser';
import { CellViewModelStateChangeEvent } from 'vs/workbench/contrib/notebook/browser/notebookViewEvents';
import { CellPart } from 'vs/workbench/contrib/notebook/browser/view/cellParts/cellPart';
import { BaseCellRenderTemplate } from 'vs/workbench/contrib/notebook/browser/view/notebookRenderingCommon';

export class CollapsedCellInput extends CellPart {
	private currentCell: ICellViewModel | undefined;

	constructor(
		private readonly notebookEditor: INotebookEditor,
		cellInputCollapsedContainer: HTMLElement,
	) {
		super();

		this._register(DOM.addDisposableListener(cellInputCollapsedContainer, DOM.EventType.DBLCLICK, e => {
			if (!this.currentCell || !this.notebookEditor.hasModel()) {
				return;
			}

			if (this.currentCell.isInputCollapsed) {
				this.currentCell.isInputCollapsed = false;
			} else {
				this.currentCell.isOutputCollapsed = false;
			}
		}));

		this._register(DOM.addDisposableListener(cellInputCollapsedContainer, DOM.EventType.CLICK, e => {
			if (!this.currentCell || !this.notebookEditor.hasModel()) {
				return;
			}

			const element = e.target as HTMLElement;

			if (element && element.classList && element.classList.contains('expandInputIcon')) {
				// clicked on the expand icon
				this.currentCell.isInputCollapsed = false;
			}
		}));
	}

	renderCell(element: ICellViewModel, templateData: BaseCellRenderTemplate): void {
		this.currentCell = element;
	}

	prepareLayout(): void {
	}

	updateInternalLayoutNow(element: ICellViewModel): void {
	}

	updateState(element: ICellViewModel, e: CellViewModelStateChangeEvent): void {
	}
}

