/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as DOM from '../../../../../../base/browser/dom.js';
import { Codicon } from '../../../../../../base/common/codicons.js';
import { ThemeIcon } from '../../../../../../base/common/themables.js';
import { localize } from '../../../../../../nls.js';
import { FoldingController } from '../../controller/foldingController.js';
import { CellEditState, CellFoldingState, INotebookEditor } from '../../notebookBrowser.js';
import { CellContentPart } from '../cellPart.js';
import { MarkupCellViewModel } from '../../viewModel/markupCellViewModel.js';
import { ICellRange } from '../../../common/notebookRange.js';
import { executingStateIcon } from '../../notebookIcons.js';
import { INotebookExecutionStateService } from '../../../common/notebookExecutionStateService.js';
import { CellKind, NotebookCellExecutionState } from '../../../common/notebookCommon.js';
import { MutableDisposable } from '../../../../../../base/common/lifecycle.js';

export class FoldedCellHint extends CellContentPart {

	private readonly _runButtonListener = this._register(new MutableDisposable());
	private readonly _cellExecutionListener = this._register(new MutableDisposable());

	constructor(
		private readonly _notebookEditor: INotebookEditor,
		private readonly _container: HTMLElement,
		@INotebookExecutionStateService private readonly _notebookExecutionStateService: INotebookExecutionStateService
	) {
		super();
	}

	override didRenderCell(element: MarkupCellViewModel): void {
		this.update(element);
	}

	private update(element: MarkupCellViewModel) {
		if (!this._notebookEditor.hasModel()) {
			this._cellExecutionListener.clear();
			this._runButtonListener.clear();
			return;
		}

		if (element.isInputCollapsed || element.getEditState() === CellEditState.Editing) {
			this._cellExecutionListener.clear();
			this._runButtonListener.clear();
			DOM.hide(this._container);
		} else if (element.foldingState === CellFoldingState.Collapsed) {
			const idx = this._notebookEditor.getViewModel().getCellIndex(element);
			const length = this._notebookEditor.getViewModel().getFoldedLength(idx);

			const runSectionButton = this.getRunFoldedSectionButton({ start: idx, end: idx + length + 1 });
			if (!runSectionButton) {
				DOM.reset(this._container, this.getHiddenCellsLabel(length), this.getHiddenCellHintButton(element));
			} else {
				DOM.reset(this._container, runSectionButton, this.getHiddenCellsLabel(length), this.getHiddenCellHintButton(element));
			}

			DOM.show(this._container);

			const foldHintTop = element.layoutInfo.previewHeight;
			this._container.style.top = `${foldHintTop}px`;
		} else {
			this._cellExecutionListener.clear();
			this._runButtonListener.clear();
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

	private getRunFoldedSectionButton(range: ICellRange): HTMLElement | undefined {
		const runAllContainer = DOM.$('span.folded-cell-run-section-button');
		const cells = this._notebookEditor.getCellsInRange(range);

		// Check if any cells are code cells, if not, we won't show the run button
		const hasCodeCells = cells.some(cell => cell.cellKind === CellKind.Code);
		if (!hasCodeCells) {
			return undefined;
		}

		const isRunning = cells.some(cell => {
			const cellExecution = this._notebookExecutionStateService.getCellExecution(cell.uri);
			return cellExecution && cellExecution.state === NotebookCellExecutionState.Executing;
		});

		const runAllIcon = isRunning ?
			ThemeIcon.modify(executingStateIcon, 'spin') :
			Codicon.play;
		runAllContainer.classList.add(...ThemeIcon.asClassNameArray(runAllIcon));

		this._runButtonListener.value = DOM.addDisposableListener(runAllContainer, DOM.EventType.CLICK, () => {
			this._notebookEditor.executeNotebookCells(cells);
		});

		this._cellExecutionListener.value = this._notebookExecutionStateService.onDidChangeExecution(() => {
			const isRunning = cells.some(cell => {
				const cellExecution = this._notebookExecutionStateService.getCellExecution(cell.uri);
				return cellExecution && cellExecution.state === NotebookCellExecutionState.Executing;
			});

			const runAllIcon = isRunning ?
				ThemeIcon.modify(executingStateIcon, 'spin') :
				Codicon.play;
			runAllContainer.className = '';
			runAllContainer.classList.add('folded-cell-run-section-button', ...ThemeIcon.asClassNameArray(runAllIcon));
		});

		return runAllContainer;
	}

	override updateInternalLayoutNow(element: MarkupCellViewModel) {
		this.update(element);
	}
}
