/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ProgressBar } from 'vs/base/browser/ui/progressbar/progressbar';
import { defaultProgressBarStyles } from 'vs/platform/theme/browser/defaultStyles';
import { ICellViewModel } from 'vs/workbench/contrib/notebook/browser/notebookBrowser';
import { CellViewModelStateChangeEvent } from 'vs/workbench/contrib/notebook/browser/notebookViewEvents';
import { CellContentPart } from 'vs/workbench/contrib/notebook/browser/view/cellPart';
import { NotebookCellExecutionState } from 'vs/workbench/contrib/notebook/common/notebookCommon';
import { ICellExecutionStateChangedEvent, INotebookExecutionStateService } from 'vs/workbench/contrib/notebook/common/notebookExecutionStateService';

export class CellProgressBar extends CellContentPart {
	private readonly _progressBar: ProgressBar;
	private readonly _collapsedProgressBar: ProgressBar;

	constructor(
		editorContainer: HTMLElement,
		collapsedInputContainer: HTMLElement,
		@INotebookExecutionStateService private readonly _notebookExecutionStateService: INotebookExecutionStateService) {
		super();

		this._progressBar = this._register(new ProgressBar(editorContainer, defaultProgressBarStyles));
		this._progressBar.hide();

		this._collapsedProgressBar = this._register(new ProgressBar(collapsedInputContainer, defaultProgressBarStyles));
		this._collapsedProgressBar.hide();
	}

	override didRenderCell(element: ICellViewModel): void {
		this._updateForExecutionState(element);
	}

	override updateForExecutionState(element: ICellViewModel, e: ICellExecutionStateChangedEvent): void {
		this._updateForExecutionState(element, e);
	}

	override updateState(element: ICellViewModel, e: CellViewModelStateChangeEvent): void {
		if (e.metadataChanged || e.internalMetadataChanged) {
			this._updateForExecutionState(element);
		}

		if (e.inputCollapsedChanged) {
			const exeState = this._notebookExecutionStateService.getCellExecution(element.uri);
			if (element.isInputCollapsed) {
				this._progressBar.hide();
				if (exeState?.state === NotebookCellExecutionState.Executing) {
					this._updateForExecutionState(element);
				}
			} else {
				this._collapsedProgressBar.hide();
				if (exeState?.state === NotebookCellExecutionState.Executing) {
					this._updateForExecutionState(element);
				}
			}
		}
	}

	private _updateForExecutionState(element: ICellViewModel, e?: ICellExecutionStateChangedEvent): void {
		const exeState = e?.changed ?? this._notebookExecutionStateService.getCellExecution(element.uri);
		const progressBar = element.isInputCollapsed ? this._collapsedProgressBar : this._progressBar;
		if (exeState?.state === NotebookCellExecutionState.Executing && (!exeState.didPause || element.isInputCollapsed)) {
			showProgressBar(progressBar);
		} else {
			progressBar.hide();
		}
	}
}

function showProgressBar(progressBar: ProgressBar): void {
	progressBar.infinite().show(500);
}
