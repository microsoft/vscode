/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ProgressBar } from 'vs/base/browser/ui/progressbar/progressbar';
import { CellViewModelStateChangeEvent, ICellViewModel } from 'vs/workbench/contrib/notebook/browser/notebookBrowser';
import { CellPart } from 'vs/workbench/contrib/notebook/browser/view/cellParts/cellPart';
import { NotebookCellExecutionState } from 'vs/workbench/contrib/notebook/common/notebookCommon';
import { ICellExecutionStateChangedEvent, INotebookExecutionStateService } from 'vs/workbench/contrib/notebook/common/notebookExecutionStateService';

export class CellProgressBar extends CellPart {
	private readonly _progressBar: ProgressBar;
	private readonly _collapsedProgressBar: ProgressBar;

	constructor(
		editorContainer: HTMLElement,
		collapsedInputContainer: HTMLElement,
		@INotebookExecutionStateService private readonly _notebookExecutionStateService: INotebookExecutionStateService) {
		super();

		this._progressBar = this._register(new ProgressBar(editorContainer));
		this._progressBar.hide();

		this._collapsedProgressBar = this._register(new ProgressBar(collapsedInputContainer));
		this._collapsedProgressBar.hide();
	}

	renderCell(element: ICellViewModel): void {
		this._updateForExecutionState(element);
	}

	prepareLayout(): void {
		// nothing to read
	}

	updateInternalLayoutNow(element: ICellViewModel): void {
		// nothing to update
	}

	override updateForExecutionState(element: ICellViewModel, e: ICellExecutionStateChangedEvent): void {
		this._updateForExecutionState(element, e);
	}

	updateState(element: ICellViewModel, e: CellViewModelStateChangeEvent): void {
		if (e.metadataChanged || e.internalMetadataChanged) {
			this._updateForExecutionState(element);
		}

		if (e.inputCollapsedChanged) {
			const exeState = this._notebookExecutionStateService.getCellExecutionState(element.uri);
			if (element.isInputCollapsed) {
				this._progressBar.hide();
				if (exeState?.state === NotebookCellExecutionState.Executing) {
					showProgressBar(this._collapsedProgressBar);
				}
			} else {
				this._collapsedProgressBar.hide();
				if (exeState?.state === NotebookCellExecutionState.Executing) {
					showProgressBar(this._progressBar);
				}
			}
		}
	}

	private _updateForExecutionState(element: ICellViewModel, e?: ICellExecutionStateChangedEvent): void {
		const exeState = e?.changed ?? this._notebookExecutionStateService.getCellExecutionState(element.uri);
		const progressBar = element.isInputCollapsed ? this._collapsedProgressBar : this._progressBar;
		if (exeState?.state === NotebookCellExecutionState.Executing && !exeState.isPaused) {
			showProgressBar(progressBar);
		} else {
			progressBar.hide();
		}
	}
}

function showProgressBar(progressBar: ProgressBar): void {
	progressBar.infinite().show(500);
}
