/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2025 EthicalCoder. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as DOM from '../../../../../../base/browser/dom.js';
import { INotebookEditor } from '../../notebookBrowser.js';
import { CellContentPart } from '../cellPart.js';

export class CollapsedCellInput extends CellContentPart {
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
}

