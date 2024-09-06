/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IDisposable } from '../../../../../base/common/lifecycle.js';
import { CellFocusMode, ICellViewModel } from '../notebookBrowser.js';
import { CodeCellViewModel } from '../viewModel/codeCellViewModel.js';
import { CellKind, NotebookCellExecutionState, NotebookSetting } from '../../common/notebookCommon.js';
import { INotebookExecutionStateService } from '../../common/notebookExecutionStateService.js';
import { Event } from '../../../../../base/common/event.js';
import { ScrollEvent } from '../../../../../base/common/scrollable.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IListView } from '../../../../../base/browser/ui/list/listView.js';
import { CellViewModel } from '../viewModel/notebookViewModelImpl.js';


export class NotebookCellAnchor implements IDisposable {

	private stopAnchoring = false;
	private executionWatcher: IDisposable | undefined;
	private scrollWatcher: IDisposable | undefined;

	constructor(
		private readonly notebookExecutionStateService: INotebookExecutionStateService,
		private readonly configurationService: IConfigurationService,
		private readonly scrollEvent: Event<ScrollEvent>) {
	}

	public shouldAnchor(cellListView: IListView<CellViewModel>, focusedIndex: number, heightDelta: number, executingCellUri: ICellViewModel) {
		if (cellListView.element(focusedIndex).focusMode === CellFocusMode.Editor) {
			return true;
		}
		if (this.stopAnchoring) {
			return false;
		}

		const newFocusBottom = cellListView.elementTop(focusedIndex) + cellListView.elementHeight(focusedIndex) + heightDelta;
		const viewBottom = cellListView.renderHeight + cellListView.getScrollTop();
		const focusStillVisible = viewBottom > newFocusBottom;
		const allowScrolling = this.configurationService.getValue(NotebookSetting.scrollToRevealCell) !== 'none';
		const growing = heightDelta > 0;
		const autoAnchor = allowScrolling && growing && !focusStillVisible;

		if (autoAnchor) {
			this.watchAchorDuringExecution(executingCellUri);
			return true;
		}

		return false;
	}

	public watchAchorDuringExecution(executingCell: ICellViewModel) {
		// anchor while the cell is executing unless the user scrolls up.
		if (!this.executionWatcher && executingCell.cellKind === CellKind.Code) {
			const executionState = this.notebookExecutionStateService.getCellExecution(executingCell.uri);
			if (executionState && executionState.state === NotebookCellExecutionState.Executing) {
				this.executionWatcher = (executingCell as CodeCellViewModel).onDidStopExecution(() => {
					this.executionWatcher?.dispose();
					this.executionWatcher = undefined;
					this.scrollWatcher?.dispose();
					this.stopAnchoring = false;
				});
				this.scrollWatcher = this.scrollEvent((scrollEvent) => {
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
