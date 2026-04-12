/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { CellFocusMode } from '../notebookBrowser.js';
import { CellKind, NotebookCellExecutionState, NotebookSetting } from '../../common/notebookCommon.js';
export class NotebookCellAnchor {
    constructor(notebookExecutionStateService, configurationService, scrollEvent) {
        this.notebookExecutionStateService = notebookExecutionStateService;
        this.configurationService = configurationService;
        this.scrollEvent = scrollEvent;
        this.stopAnchoring = false;
    }
    shouldAnchor(cellListView, focusedIndex, heightDelta, executingCellUri) {
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
    watchAchorDuringExecution(executingCell) {
        // anchor while the cell is executing unless the user scrolls up.
        if (!this.executionWatcher && executingCell.cellKind === CellKind.Code) {
            const executionState = this.notebookExecutionStateService.getCellExecution(executingCell.uri);
            if (executionState && executionState.state === NotebookCellExecutionState.Executing) {
                this.executionWatcher = executingCell.onDidStopExecution(() => {
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
    dispose() {
        this.executionWatcher?.dispose();
        this.scrollWatcher?.dispose();
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibm90ZWJvb2tDZWxsQW5jaG9yLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvbm90ZWJvb2svYnJvd3Nlci92aWV3L25vdGVib29rQ2VsbEFuY2hvci50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUdoRyxPQUFPLEVBQUUsYUFBYSxFQUFrQixNQUFNLHVCQUF1QixDQUFDO0FBRXRFLE9BQU8sRUFBRSxRQUFRLEVBQUUsMEJBQTBCLEVBQUUsZUFBZSxFQUFFLE1BQU0sZ0NBQWdDLENBQUM7QUFTdkcsTUFBTSxPQUFPLGtCQUFrQjtJQU05QixZQUNrQiw2QkFBNkQsRUFDN0Qsb0JBQTJDLEVBQzNDLFdBQStCO1FBRi9CLGtDQUE2QixHQUE3Qiw2QkFBNkIsQ0FBZ0M7UUFDN0QseUJBQW9CLEdBQXBCLG9CQUFvQixDQUF1QjtRQUMzQyxnQkFBVyxHQUFYLFdBQVcsQ0FBb0I7UUFQekMsa0JBQWEsR0FBRyxLQUFLLENBQUM7SUFROUIsQ0FBQztJQUVNLFlBQVksQ0FBQyxZQUFzQyxFQUFFLFlBQW9CLEVBQUUsV0FBbUIsRUFBRSxnQkFBZ0M7UUFDdEksSUFBSSxZQUFZLENBQUMsT0FBTyxDQUFDLFlBQVksQ0FBQyxDQUFDLFNBQVMsS0FBSyxhQUFhLENBQUMsTUFBTSxFQUFFLENBQUM7WUFDM0UsT0FBTyxJQUFJLENBQUM7UUFDYixDQUFDO1FBQ0QsSUFBSSxJQUFJLENBQUMsYUFBYSxFQUFFLENBQUM7WUFDeEIsT0FBTyxLQUFLLENBQUM7UUFDZCxDQUFDO1FBRUQsTUFBTSxjQUFjLEdBQUcsWUFBWSxDQUFDLFVBQVUsQ0FBQyxZQUFZLENBQUMsR0FBRyxZQUFZLENBQUMsYUFBYSxDQUFDLFlBQVksQ0FBQyxHQUFHLFdBQVcsQ0FBQztRQUN0SCxNQUFNLFVBQVUsR0FBRyxZQUFZLENBQUMsWUFBWSxHQUFHLFlBQVksQ0FBQyxZQUFZLEVBQUUsQ0FBQztRQUMzRSxNQUFNLGlCQUFpQixHQUFHLFVBQVUsR0FBRyxjQUFjLENBQUM7UUFDdEQsTUFBTSxjQUFjLEdBQUcsSUFBSSxDQUFDLG9CQUFvQixDQUFDLFFBQVEsQ0FBQyxlQUFlLENBQUMsa0JBQWtCLENBQUMsS0FBSyxNQUFNLENBQUM7UUFDekcsTUFBTSxPQUFPLEdBQUcsV0FBVyxHQUFHLENBQUMsQ0FBQztRQUNoQyxNQUFNLFVBQVUsR0FBRyxjQUFjLElBQUksT0FBTyxJQUFJLENBQUMsaUJBQWlCLENBQUM7UUFFbkUsSUFBSSxVQUFVLEVBQUUsQ0FBQztZQUNoQixJQUFJLENBQUMseUJBQXlCLENBQUMsZ0JBQWdCLENBQUMsQ0FBQztZQUNqRCxPQUFPLElBQUksQ0FBQztRQUNiLENBQUM7UUFFRCxPQUFPLEtBQUssQ0FBQztJQUNkLENBQUM7SUFFTSx5QkFBeUIsQ0FBQyxhQUE2QjtRQUM3RCxpRUFBaUU7UUFDakUsSUFBSSxDQUFDLElBQUksQ0FBQyxnQkFBZ0IsSUFBSSxhQUFhLENBQUMsUUFBUSxLQUFLLFFBQVEsQ0FBQyxJQUFJLEVBQUUsQ0FBQztZQUN4RSxNQUFNLGNBQWMsR0FBRyxJQUFJLENBQUMsNkJBQTZCLENBQUMsZ0JBQWdCLENBQUMsYUFBYSxDQUFDLEdBQUcsQ0FBQyxDQUFDO1lBQzlGLElBQUksY0FBYyxJQUFJLGNBQWMsQ0FBQyxLQUFLLEtBQUssMEJBQTBCLENBQUMsU0FBUyxFQUFFLENBQUM7Z0JBQ3JGLElBQUksQ0FBQyxnQkFBZ0IsR0FBSSxhQUFtQyxDQUFDLGtCQUFrQixDQUFDLEdBQUcsRUFBRTtvQkFDcEYsSUFBSSxDQUFDLGdCQUFnQixFQUFFLE9BQU8sRUFBRSxDQUFDO29CQUNqQyxJQUFJLENBQUMsZ0JBQWdCLEdBQUcsU0FBUyxDQUFDO29CQUNsQyxJQUFJLENBQUMsYUFBYSxFQUFFLE9BQU8sRUFBRSxDQUFDO29CQUM5QixJQUFJLENBQUMsYUFBYSxHQUFHLEtBQUssQ0FBQztnQkFDNUIsQ0FBQyxDQUFDLENBQUM7Z0JBQ0gsSUFBSSxDQUFDLGFBQWEsR0FBRyxJQUFJLENBQUMsV0FBVyxDQUFDLENBQUMsV0FBVyxFQUFFLEVBQUU7b0JBQ3JELElBQUksV0FBVyxDQUFDLFNBQVMsR0FBRyxXQUFXLENBQUMsWUFBWSxFQUFFLENBQUM7d0JBQ3RELElBQUksQ0FBQyxhQUFhLEdBQUcsSUFBSSxDQUFDO3dCQUMxQixJQUFJLENBQUMsYUFBYSxFQUFFLE9BQU8sRUFBRSxDQUFDO29CQUMvQixDQUFDO2dCQUNGLENBQUMsQ0FBQyxDQUFDO1lBQ0osQ0FBQztRQUNGLENBQUM7SUFDRixDQUFDO0lBRUQsT0FBTztRQUNOLElBQUksQ0FBQyxnQkFBZ0IsRUFBRSxPQUFPLEVBQUUsQ0FBQztRQUNqQyxJQUFJLENBQUMsYUFBYSxFQUFFLE9BQU8sRUFBRSxDQUFDO0lBQy9CLENBQUM7Q0FDRCJ9