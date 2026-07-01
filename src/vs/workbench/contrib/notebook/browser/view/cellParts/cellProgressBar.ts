/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ProgressBar } from '../../../../../../base/browser/ui/progressbar/progressbar.js';
import { defaultProgressBarStyles } from '../../../../../../platform/theme/browser/defaultStyles.js';
import { ICellViewModel } from '../../notebookBrowser.js';
import { CellViewModelStateChangeEvent } from '../../notebookViewEvents.js';
import { CellContentPart } from '../cellPart.js';
import { NotebookCellExecutionState, NotebookCellExecutionProgress } from '../../../common/notebookCommon.js';
import { ICellExecutionStateChangedEvent, INotebookExecutionStateService } from '../../../common/notebookExecutionStateService.js';

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
		setProgressBar(this._collapsedProgressBar, exeState?.progress);
		setProgressBar(this._progressBar, exeState?.progress);
		const progressBar = element.isInputCollapsed ? this._collapsedProgressBar : this._progressBar;
		if (exeState?.state === NotebookCellExecutionState.Executing && (!exeState.didPause || element.isInputCollapsed)) {
			showProgressBar(progressBar);
		} else if (progressBar.hasTotal()) {
			progressBar.done();
		}
		else {
			progressBar.hide();
		}
	}
}

function showProgressBar(progressBar: ProgressBar): void {
	if (progressBar.hasTotal()) {
		progressBar.show(500);
	}
	else {
		progressBar.infinite().show(500);
	}
}

function setProgressBar(progressBar: ProgressBar, progress: NotebookCellExecutionProgress | undefined): void {
	if (typeof progress?.total === 'number') {
		progressBar.total(progress.total);
	}

	if (!progressBar.hasTotal() && (typeof progress?.increment === 'number' || typeof progress?.progress === 'number')) {
		progressBar.total(100);
	}

	if (typeof progress?.progress === 'number') {
		progressBar.setWorked(progress?.progress);
	}
	if (typeof progress?.increment === 'number') {
		progressBar.worked(progress?.increment);
	}
}
