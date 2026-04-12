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
import { Disposable } from '../../../../../../base/common/lifecycle.js';
import { autorun } from '../../../../../../base/common/observable.js';
import { localize } from '../../../../../../nls.js';
import { IInstantiationService } from '../../../../../../platform/instantiation/common/instantiation.js';
import { IKeybindingService } from '../../../../../../platform/keybinding/common/keybinding.js';
import { OPEN_CELL_FAILURE_ACTIONS_COMMAND_ID } from './cellDiagnosticsActions.js';
import { NotebookStatusBarController } from '../cellStatusBar/executionStatusBarItemController.js';
import { registerNotebookContribution } from '../../notebookEditorExtensions.js';
import { CodeCellViewModel } from '../../viewModel/codeCellViewModel.js';
import { IChatAgentService } from '../../../../chat/common/participants/chatAgents.js';
import { ChatAgentLocation } from '../../../../chat/common/constants.js';
let DiagnosticCellStatusBarContrib = class DiagnosticCellStatusBarContrib extends Disposable {
    static { this.id = 'workbench.notebook.statusBar.diagtnostic'; }
    constructor(notebookEditor, instantiationService) {
        super();
        this._register(new NotebookStatusBarController(notebookEditor, (vm, cell) => cell instanceof CodeCellViewModel ?
            instantiationService.createInstance(DiagnosticCellStatusBarItem, vm, cell) :
            Disposable.None));
    }
};
DiagnosticCellStatusBarContrib = __decorate([
    __param(1, IInstantiationService)
], DiagnosticCellStatusBarContrib);
export { DiagnosticCellStatusBarContrib };
registerNotebookContribution(DiagnosticCellStatusBarContrib.id, DiagnosticCellStatusBarContrib);
let DiagnosticCellStatusBarItem = class DiagnosticCellStatusBarItem extends Disposable {
    constructor(_notebookViewModel, cell, keybindingService, chatAgentService) {
        super();
        this._notebookViewModel = _notebookViewModel;
        this.cell = cell;
        this.keybindingService = keybindingService;
        this.chatAgentService = chatAgentService;
        this._currentItemIds = [];
        this._register(autorun((reader) => this.updateSparkleItem(reader.readObservable(cell.executionErrorDiagnostic))));
    }
    hasNotebookAgent() {
        const agents = this.chatAgentService.getAgents();
        return !!agents.find(agent => agent.locations.includes(ChatAgentLocation.Notebook));
    }
    async updateSparkleItem(error) {
        let item;
        if (error?.location && this.hasNotebookAgent()) {
            const tooltip = this.keybindingService.appendKeybinding(localize('notebook.cell.status.diagnostic', "Quick Actions"), OPEN_CELL_FAILURE_ACTIONS_COMMAND_ID);
            item = {
                text: `$(sparkle)`,
                tooltip,
                alignment: 1 /* CellStatusbarAlignment.Left */,
                command: OPEN_CELL_FAILURE_ACTIONS_COMMAND_ID,
                priority: Number.MAX_SAFE_INTEGER - 1
            };
        }
        const items = item ? [item] : [];
        this._currentItemIds = this._notebookViewModel.deltaCellStatusBarItems(this._currentItemIds, [{ handle: this.cell.handle, items }]);
    }
    dispose() {
        super.dispose();
        this._notebookViewModel.deltaCellStatusBarItems(this._currentItemIds, [{ handle: this.cell.handle, items: [] }]);
    }
};
DiagnosticCellStatusBarItem = __decorate([
    __param(2, IKeybindingService),
    __param(3, IChatAgentService)
], DiagnosticCellStatusBarItem);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZGlhZ25vc3RpY0NlbGxTdGF0dXNCYXJDb250cmliLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvbm90ZWJvb2svYnJvd3Nlci9jb250cmliL2NlbGxEaWFnbm9zdGljcy9kaWFnbm9zdGljQ2VsbFN0YXR1c0JhckNvbnRyaWIudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7QUFFaEcsT0FBTyxFQUFFLFVBQVUsRUFBRSxNQUFNLDRDQUE0QyxDQUFDO0FBQ3hFLE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSw2Q0FBNkMsQ0FBQztBQUN0RSxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sMEJBQTBCLENBQUM7QUFDcEQsT0FBTyxFQUFFLHFCQUFxQixFQUFFLE1BQU0sa0VBQWtFLENBQUM7QUFDekcsT0FBTyxFQUFFLGtCQUFrQixFQUFFLE1BQU0sNERBQTRELENBQUM7QUFDaEcsT0FBTyxFQUFFLG9DQUFvQyxFQUFFLE1BQU0sNkJBQTZCLENBQUM7QUFDbkYsT0FBTyxFQUFFLDJCQUEyQixFQUFFLE1BQU0sc0RBQXNELENBQUM7QUFFbkcsT0FBTyxFQUFFLDRCQUE0QixFQUFFLE1BQU0sbUNBQW1DLENBQUM7QUFDakYsT0FBTyxFQUFFLGlCQUFpQixFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFHekUsT0FBTyxFQUFFLGlCQUFpQixFQUFFLE1BQU0sb0RBQW9ELENBQUM7QUFDdkYsT0FBTyxFQUFFLGlCQUFpQixFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFFbEUsSUFBTSw4QkFBOEIsR0FBcEMsTUFBTSw4QkFBK0IsU0FBUSxVQUFVO2FBQ3RELE9BQUUsR0FBVywwQ0FBMEMsQUFBckQsQ0FBc0Q7SUFFL0QsWUFDQyxjQUErQixFQUNSLG9CQUEyQztRQUVsRSxLQUFLLEVBQUUsQ0FBQztRQUNSLElBQUksQ0FB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