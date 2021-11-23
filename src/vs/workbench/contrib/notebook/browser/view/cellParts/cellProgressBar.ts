/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ProgressBar } from 'vs/base/browser/ui/progressbar/progressbar';
import { ICellViewModel, CellViewModelStateChangeEvent } from 'vs/workbench/contrib/notebook/browser/notebookBrowser';
import { CellPart } from 'vs/workbench/contrib/notebook/browser/view/cellParts/cellPart';
import { NotebookCellExecutionState, NotebookCellInternalMetadata } from 'vs/workbench/contrib/notebook/common/notebookCommon';

export class CellProgressBar extends CellPart {
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

	renderCell(element: ICellViewModel): void {
		this.updateForInternalMetadata(element, element.internalMetadata);
	}

	prepareLayout(): void {
		// nothing to read
	}

	updateLayoutNow(element: ICellViewModel): void {
		// nothing to update
	}

	updateState(element: ICellViewModel, e: CellViewModelStateChangeEvent): void {
		if (e.metadataChanged || e.internalMetadataChanged) {
			this.updateForInternalMetadata(element, element.internalMetadata);
		}

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

	updateForInternalMetadata(element: ICellViewModel, internalMetadata: NotebookCellInternalMetadata): void {
		const progressBar = element.isInputCollapsed ? this._collapsedProgressBar : this._progressBar;
		if (internalMetadata.runState === NotebookCellExecutionState.Executing && !internalMetadata.isPaused) {
			showProgressBar(progressBar);
		} else {
			progressBar.hide();
		}
	}
}

function showProgressBar(progressBar: ProgressBar): void {
	progressBar.infinite().show(500);
}
