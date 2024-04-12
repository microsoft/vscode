/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as DOM from 'vs/base/browser/dom';
import { disposableTimeout } from 'vs/base/common/async';
import { DisposableStore } from 'vs/base/common/lifecycle';
import { ICellViewModel, INotebookEditorDelegate } from 'vs/workbench/contrib/notebook/browser/notebookBrowser';
import { CellViewModelStateChangeEvent } from 'vs/workbench/contrib/notebook/browser/notebookViewEvents';
import { CellContentPart } from 'vs/workbench/contrib/notebook/browser/view/cellPart';
import { NotebookCellInternalMetadata } from 'vs/workbench/contrib/notebook/common/notebookCommon';
import { INotebookExecutionStateService } from 'vs/workbench/contrib/notebook/common/notebookExecutionStateService';

const UPDATE_EXECUTION_ORDER_GRACE_PERIOD = 200;

export class CellExecutionPart extends CellContentPart {
	private readonly kernelDisposables = this._register(new DisposableStore());

	constructor(
		private readonly _notebookEditor: INotebookEditorDelegate,
		private readonly _executionOrderLabel: HTMLElement,
		@INotebookExecutionStateService private readonly _notebookExecutionStateService: INotebookExecutionStateService
	) {
		super();

		this._register(this._notebookEditor.onDidChangeActiveKernel(() => {
			if (this.currentCell) {
				this.kernelDisposables.clear();

				if (this._notebookEditor.activeKernel) {
					this.kernelDisposables.add(this._notebookEditor.activeKernel.onDidChange(() => {
						if (this.currentCell) {
							this.updateExecutionOrder(this.currentCell.internalMetadata);
						}
					}));
				}

				this.updateExecutionOrder(this.currentCell.internalMetadata);
			}
		}));
	}

	override didRenderCell(element: ICellViewModel): void {
		this.updateExecutionOrder(element.internalMetadata, true);
	}

	private updateExecutionOrder(internalMetadata: NotebookCellInternalMetadata, forceClear = false): void {
		if (this._notebookEditor.activeKernel?.implementsExecutionOrder || (!this._notebookEditor.activeKernel && typeof internalMetadata.executionOrder === 'number')) {
			// If the executionOrder was just cleared, and the cell is executing, wait just a bit before clearing the view to avoid flashing
			if (typeof internalMetadata.executionOrder !== 'number' && !forceClear && !!this._notebookExecutionStateService.getCellExecution(this.currentCell!.uri)) {
				const renderingCell = this.currentCell;
				disposableTimeout(() => {
					if (this.currentCell === renderingCell) {
						this.updateExecutionOrder(this.currentCell!.internalMetadata, true);
					}
				}, UPDATE_EXECUTION_ORDER_GRACE_PERIOD, this.cellDisposables);
				return;
			}

			const executionOrderLabel = typeof internalMetadata.executionOrder === 'number' ?
				`[${internalMetadata.executionOrder}]` :
				'[ ]';
			this._executionOrderLabel.innerText = executionOrderLabel;
		} else {
			this._executionOrderLabel.innerText = '';
		}
	}

	override updateState(element: ICellViewModel, e: CellViewModelStateChangeEvent): void {
		if (e.internalMetadataChanged) {
			this.updateExecutionOrder(element.internalMetadata);
		}
	}

	override updateInternalLayoutNow(element: ICellViewModel): void {
		if (element.isInputCollapsed) {
			DOM.hide(this._executionOrderLabel);
		} else {
			DOM.show(this._executionOrderLabel);
			const top = element.layoutInfo.editorHeight - 22 + element.layoutInfo.statusBarHeight;
			this._executionOrderLabel.style.top = `${top}px`;
		}
	}
}
