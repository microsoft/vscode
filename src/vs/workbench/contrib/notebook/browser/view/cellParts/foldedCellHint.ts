/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as DOM from 'vs/base/browser/dom';
import { Codicon } from 'vs/base/common/codicons';
import { ThemeIcon } from 'vs/base/common/themables';
import { localize } from 'vs/nls';
import { FoldingController } from 'vs/workbench/contrib/notebook/browser/controller/foldingController';
import { CellEditState, CellFoldingState, INotebookEditor } from 'vs/workbench/contrib/notebook/browser/notebookBrowser';
import { CellContentPart } from 'vs/workbench/contrib/notebook/browser/view/cellPart';
import { MarkupCellViewModel } from 'vs/workbench/contrib/notebook/browser/viewModel/markupCellViewModel';

export class FoldedCellHint extends CellContentPart {

	constructor(
		private readonly _notebookEditor: INotebookEditor,
		private readonly _container: HTMLElement,
	) {
		super();
	}

	override didRenderCell(element: MarkupCellViewModel): void {
		this.update(element);
	}

	private update(element: MarkupCellViewModel) {
		if (!this._notebookEditor.hasModel()) {
			return;
		}

		if (element.isInputCollapsed || element.getEditState() === CellEditState.Editing) {
			DOM.hide(this._container);
		} else if (element.foldingState === CellFoldingState.Collapsed) {
			const idx = this._notebookEditor.getViewModel().getCellIndex(element);
			const length = this._notebookEditor.getViewModel().getFoldedLength(idx);
			DOM.reset(this._container, this.getRunFoldedSectionButton(element, idx, length), this.getHiddenCellsLabel(length), this.getHiddenCellHintButton(element));
			DOM.show(this._container);

			const foldHintTop = element.layoutInfo.previewHeight;
			this._container.style.top = `${foldHintTop}px`;
		} else {
			DOM.hide(this._container);
		}
	}

	private getHiddenCellsLabel(num: number): HTMLElement {
		const label = num === 1 ?
			localize('hiddenCellsLabel', "1 cell hidden") :
			localize('hiddenCellsLabelPlural', "{0} cells hidden", num);

		return DOM.$('span.notebook-folded-hint-label', undefined, label);
	}

	private getHiddenCellHintButton(element: MarkupCellViewModel): HTMLElement {
		const expandIcon = DOM.$('span.cell-expand-part-button');
		expandIcon.classList.add(...ThemeIcon.asClassNameArray(Codicon.more));
		this._register(DOM.addDisposableListener(expandIcon, DOM.EventType.CLICK, () => {
			const controller = this._notebookEditor.getContribution<FoldingController>(FoldingController.id);
			const idx = this._notebookEditor.getCellIndex(element);
			if (typeof idx === 'number') {
				controller.setFoldingStateDown(idx, CellFoldingState.Expanded, 1);
			}
		}));

		return expandIcon;
	}

	private getRunFoldedSectionButton(element: MarkupCellViewModel, idx: number, length: number): HTMLElement {
		const runAllIcon = DOM.$('span.folded-cell-run-all-button');
		runAllIcon.classList.add(...ThemeIcon.asClassNameArray(Codicon.playCircle));

		this._register(DOM.addDisposableListener(runAllIcon, DOM.EventType.CLICK, () => {
			const cellRange = this._notebookEditor.getCellRangeFromViewRange(idx, idx + length);
			const cells = this._notebookEditor.getCellsInRange(cellRange);
			this._notebookEditor.executeNotebookCells(cells);
		}));

		return runAllIcon;
	}

	override updateInternalLayoutNow(element: MarkupCellViewModel) {
		this.update(element);
	}
}
