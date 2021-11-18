/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ProgressBar } from 'vs/base/browser/ui/progressbar/progressbar';
import { Disposable } from 'vs/base/common/lifecycle';
import { CellViewModelStateChangeEvent } from 'vs/workbench/contrib/notebook/browser/notebookBrowser';
import { CodeCellViewModel } from 'vs/workbench/contrib/notebook/browser/viewModel/codeCellViewModel';
import { NotebookCellExecutionState, NotebookCellInternalMetadata } from 'vs/workbench/contrib/notebook/common/notebookCommon';

export class CellProgressBar extends Disposable {
	private readonly _progressBar: ProgressBar;
	private readonly _collapsedProgressBar: ProgressBar;

	constructor(
		editorContainer: HTMLElement,
		collapsedInputContainer: HTMLElement) {
		super();

		this._progressBar = this._register(new ProgressBar(editorContainer));
		this._progressBar.hide();

		this._collapsedProgressBar = this._register(new ProgressBar(collapsedInputContainer));
		this._collapsedProgressBar.hide();
	}

	updateForInternalMetadata(element: CodeCellViewModel, internalMetadata: NotebookCellInternalMetadata): void {
		const progressBar = element.isInputCollapsed ? this._collapsedProgressBar : this._progressBar;
		if (internalMetadata.runState === NotebookCellExecutionState.Executing && !internalMetadata.isPaused) {
			showProgressBar(progressBar);
		} else {
			progressBar.hide();
		}
	}

	updateForCellState(e: CellViewModelStateChangeEvent, element: CodeCellViewModel): void {
		if (e.inputCollapsedChanged) {
			if (element.isInputCollapsed) {
				this._progressBar.hide();
				if (element.internalMetadata.runState === NotebookCellExecutionState.Executing) {
					showProgressBar(this._collapsedProgressBar);
				}
			} else {
				this._collapsedProgressBar.hide();
				if (element.internalMetadata.runState === NotebookCellExecutionState.Executing) {
					showProgressBar(this._progressBar);
				}
			}
		}
	}
}

function showProgressBar(progressBar: ProgressBar): void {
	progressBar.infinite().show(500);
}
