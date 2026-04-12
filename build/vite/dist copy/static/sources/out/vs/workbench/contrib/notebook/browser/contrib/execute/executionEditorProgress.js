/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
import { throttle } from '../../../../../../base/common/decorators.js';
import { Disposable, MutableDisposable } from '../../../../../../base/common/lifecycle.js';
import { registerNotebookContribution } from '../../notebookEditorExtensions.js';
import { NotebookCellExecutionState } from '../../../common/notebookCommon.js';
import { INotebookExecutionStateService } from '../../../common/notebookExecutionStateService.js';
import { IUserActivityService } from '../../../../../services/userActivity/common/userActivityService.js';
let ExecutionEditorProgressController = class ExecutionEditorProgressController extends Disposable {
    static { this.id = 'workbench.notebook.executionEditorProgress'; }
    constructor(_notebookEditor, _notebookExecutionStateService, _userActivity) {
        super();
        this._notebookEditor = _notebookEditor;
        this._notebookExecutionStateService = _notebookExecutionStateService;
        this._userActivity = _userActivity;
        this._activityMutex = this._register(new MutableDisposable());
        this._register(_notebookEditor.onDidScroll(() => this._update()));
        this._register(_notebookExecutionStateService.onDidChangeExecution(e => {
            if (e.notebook.toString() !== this._notebookEditor.textModel?.uri.toString()) {
                return;
            }
            this._update();
        }));
        this._register(_notebookEditor.onDidChangeModel(() => this._update()));
    }
    _update() {
        if (!this._notebookEditor.hasModel()) {
            return;
        }
        const cellExecutions = this._notebookExecutionStateService.getCellExecutionsForNotebook(this._notebookEditor.textModel?.uri)
            .filter(exe => exe.state === NotebookCellExecutionState.Executing);
        const notebookExecution = this._notebookExecutionStateService.getExecution(this._notebookEditor.textModel?.uri);
        const executionIsVisible = (exe) => {
            for (const range of this._notebookEditor.visibleRanges) {
                for (const cell of this._notebookEditor.getCellsInRange(range)) {
                    if (cell.handle === exe.cellHandle) {
                        const top = this._notebookEditor.getAbsoluteTopOfElement(cell);
                        if (this._notebookEditor.scrollTop < top + 5) {
                            return true;
                        }
                    }
                }
            }
            return false;
        };
        const hasAnyExecution = cellExecutions.length || notebookExecution;
        if (hasAnyExecution && !this._activityMutex.value) {
            this._activityMutex.value = this._userActivity.markActive();
        }
        else if (!hasAnyExecution && this._activityMutex.value) {
            this._activityMutex.clear();
        }
        const shouldShowEditorProgressbarForCellExecutions = cellExecutions.length && !cellExecutions.some(executionIsVisible) && !cellExecutions.some(e => e.isPaused);
        const showEditorProgressBar = !!notebookExecution || shouldShowEditorProgressbarForCellExecutions;
        if (showEditorProgressBar) {
            this._notebookEditor.showProgress();
        }
        else {
            this._notebookEditor.hideProgress();
        }
    }
};
__decorate([
    throttle(100)
], ExecutionEditorProgressController.prototype, "_update", null);
ExecutionEditorProgressController = __decorate([
    __param(1, INotebookExecutionStateService),
    __param(2, IUserActivityService)
], ExecutionEditorProgressController);
export { ExecutionEditorProgressController };
registerNotebookContribution(ExecutionEditorProgressController.id, ExecutionEditorProgressController);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZXhlY3V0aW9uRWRpdG9yUHJvZ3Jlc3MuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi9ub3RlYm9vay9icm93c2VyL2NvbnRyaWIvZXhlY3V0ZS9leGVjdXRpb25FZGl0b3JQcm9ncmVzcy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7OztBQUVoRyxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sNkNBQTZDLENBQUM7QUFDdkUsT0FBTyxFQUFFLFVBQVUsRUFBRSxpQkFBaUIsRUFBRSxNQUFNLDRDQUE0QyxDQUFDO0FBRTNGLE9BQU8sRUFBRSw0QkFBNEIsRUFBRSxNQUFNLG1DQUFtQyxDQUFDO0FBQ2pGLE9BQU8sRUFBRSwwQkFBMEIsRUFBRSxNQUFNLG1DQUFtQyxDQUFDO0FBQy9FLE9BQU8sRUFBMEIsOEJBQThCLEVBQUUsTUFBTSxrREFBa0QsQ0FBQztBQUMxSCxPQUFPLEVBQUUsb0JBQW9CLEVBQUUsTUFBTSxvRUFBb0UsQ0FBQztBQUVuRyxJQUFNLGlDQUFpQyxHQUF2QyxNQUFNLGlDQUFrQyxTQUFRLFVBQVU7YUFDekQsT0FBRSxHQUFXLDRDQUE0QyxBQUF2RCxDQUF3RDtJQUlqRSxZQUNrQixlQUFnQyxFQUNqQiw4QkFBK0UsRUFDekYsYUFBb0Q7UUFFMUUsS0FBSyxFQUFFLENBQUM7UUFKUyxvQkFBZSxHQUFmLGVBQWUsQ0FBaUI7UUFDQSxtQ0FBOEIsR0FBOUIsOEJBQThCLENBQWdDO1FBQ3hFLGtCQUFhLEdBQWIsYUFBYSxDQUFzQjtRQUwxRCxtQkFBYyxHQUFHLElBQUksQ0FBQyxTQUFTLENBQUMsSUFBSSxpQkFBaUIsRUFBRSxDQUFDLENBQUM7UUFTekUsSUFBSSxDQUFDLFNBQVMsQ0FBQyxlQUFlLENBQUMsV0FBVyxDQUFDLEdBQUcsRUFBRSxDQUFDLElBQUksQ0FBQyxPQUFPLEVBQUUs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