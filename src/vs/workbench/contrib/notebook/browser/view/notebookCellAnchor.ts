/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IDisposable } from 'vs/base/common/lifecycle';
import { CellFocusMode, ICellViewModel } from 'vs/workbench/contrib/notebook/browser/notebookBrowser';
import { CodeCellViewModel } from 'vs/workbench/contrib/notebook/browser/viewModel/codeCellViewModel';
import { CellKind, NotebookCellExecutionState, NotebookSetting } from 'vs/workbench/contrib/notebook/common/notebookCommon';
import { INotebookExecutionStateService } from 'vs/workbench/contrib/notebook/common/notebookExecutionStateService';
import { Event } from 'vs/base/common/event';
import { ScrollEvent } from 'vs/base/common/scrollable';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';


export class NotebookCellAnchor implements IDisposable {

	private stopAnchoring = false;
	private executionWatcher: IDisposable | undefined;
	private scrollWatcher: IDisposable | undefined;

	constructor(
		private readonly notebookExecutionStateService: INotebookExecutionStateService,
		private readonly configurationService: IConfigurationService) {
	}

	public shouldAnchor(focusMode: CellFocusMode, growing: boolean) {
		if (this.stopAnchoring) {
			return false;
		}
		const cellEditorIsFocused = focusMode === CellFocusMode.Editor;
		const anchorFocusedSetting = this.configurationService.getValue(NotebookSetting.anchorToFocusedCell);
		const allowScrolling = this.configurationService.getValue(NotebookSetting.scrollToRevealCell) !== 'none';
		const autoAnchor = allowScrolling && growing && anchorFocusedSetting !== 'off';

		return (cellEditorIsFocused || autoAnchor || anchorFocusedSetting === 'on');
	}

	public watchAchorDuringExecution(viewCell: ICellViewModel, scrollEvent: Event<ScrollEvent>) {
		// anchor while the cell is executing unless the user scrolls up.
		if (!this.executionWatcher && viewCell && viewCell.cellKind === CellKind.Code) {
			const executionState = this.notebookExecutionStateService.getCellExecution(viewCell.uri);

			if (executionState && executionState.state === NotebookCellExecutionState.Executing) {
				this.executionWatcher = (viewCell as CodeCellViewModel).onDidStopExecution(() => {
					this.executionWatcher?.dispose();
					this.executionWatcher = undefined;
					this.scrollWatcher?.dispose();
					this.stopAnchoring = false;
				});
				this.scrollWatcher = scrollEvent((scrollEvent) => {
					if (scrollEvent.scrollTop < scrollEvent.oldScrollTop) {
						this.stopAnchoring = true;
						this.scrollWatcher?.dispose();
					}
				});
			}
		}
	}

	dispose(): void {
		this.executionWatcher?.dispose();
		this.scrollWatcher?.dispose();
	}
}
