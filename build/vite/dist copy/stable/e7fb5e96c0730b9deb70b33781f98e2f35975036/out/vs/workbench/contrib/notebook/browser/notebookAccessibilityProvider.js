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
import { Event, Emitter } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { observableFromEvent } from '../../../../base/common/observable.js';
import * as nls from '../../../../nls.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
import { CellKind, NotebookCellExecutionState } from '../common/notebookCommon.js';
import { INotebookExecutionStateService, NotebookExecutionType } from '../common/notebookExecutionStateService.js';
import { getAllOutputsText } from './viewModel/cellOutputTextHelper.js';
import { IAccessibilityService } from '../../../../platform/accessibility/common/accessibility.js';
import { alert } from '../../../../base/browser/ui/aria/aria.js';
let NotebookAccessibilityProvider = class NotebookAccessibilityProvider extends Disposable {
    constructor(viewModel, isReplHistory, notebookExecutionStateService, keybindingService, configurationService, accessibilityService) {
        super();
        this.viewModel = viewModel;
        this.isReplHistory = isReplHistory;
        this.notebookExecutionStateService = notebookExecutionStateService;
        this.keybindingService = keybindingService;
        this.configurationService = configurationService;
        this.accessibilityService = accessibilityService;
        this._onDidAriaLabelChange = this._register(new Emitter());
        this.onDidAriaLabelChange = this._onDidAriaLabelChange.event;
        this._register(Event.debounce(this.notebookExecutionStateService.onDidChangeExecution, (last, e) => this.mergeEvents(last, e), 100)((updates) => {
            if (!updates.length) {
                return;
            }
            const viewModel = this.viewModel();
            if (viewModel) {
                for (const update of updates) {
                    const cellModel = viewModel.getCellByHandle(update.cellHandle);
                    if (cellModel) {
                        this._onDidAriaLabelChange.fire(cellModel);
                    }
                }
                const lastUpdate = updates[updates.length - 1];
                if (this.shouldReadCellOutputs(lastUpdate.state)) {
                    const cell = viewModel.getCellByHandle(lastUpdate.cellHandle);
                    if (cell && cell.outputsViewModels.length) {
                        const text = getAllOutputsText(viewModel.notebookDocument, cell, true);
                        alert(text);
                    }
                }
            }
        }, this));
    }
    shouldReadCellOutputs(state) {
        return state === undefined // execution completed
            && this.isReplHistory
            && this.accessibilityService.isScreenReaderOptimized()
            && this.configurationService.getValue('accessibility.replEditor.readLastExecutionOutput');
    }
    get verbositySettingId() {
        return this.isReplHistory ?
            "accessibility.verbosity.replEditor" /* AccessibilityVerbositySettingId.ReplEditor */ :
            "accessibility.verbosity.notebook" /* AccessibilityVerbositySettingId.Notebook */;
    }
    getAriaLabel(element) {
        const event = Event.filter(this.onDidAriaLabelChange, e => e === element);
        return observableFromEvent(this, event, () => {
            const viewModel = this.viewModel();
            if (!viewModel) {
                return '';
            }
            const index = viewModel.getCellIndex(element);
            if (index >= 0) {
                return this.getLabel(element);
            }
            return '';
        });
    }
    createItemLabel(executionLabel, cellKind) {
        return this.isReplHistory ?
            `cell${executionLabel}` :
            `${cellKind === CellKind.Markup ? 'markdown' : 'code'} cell${executionLabel}`;
    }
    getLabel(element) {
        const executionState = this.notebookExecutionStateService.getCellExecution(element.uri)?.state;
        const executionLabel = executionState === NotebookCellExecutionState.Executing
            ? ', executing'
            : executionState === NotebookCellExecutionState.Pending
                ? ', pending'
                : '';
        return this.createItemLabel(executionLabel, element.cellKind);
    }
    get widgetAriaLabelName() {
        return this.isReplHistory ?
            nls.localize('replHistoryTreeAriaLabel', "REPL Editor History") :
            nls.localize('notebookTreeAriaLabel', "Notebook");
    }
    getWidgetAriaLabel() {
        const keybinding = this.keybindingService.lookupKeybinding("editor.action.accessibilityHelp" /* AccessibilityCommandId.OpenAccessibilityHelp */)?.getLabel();
        if (this.configurationService.getValue(this.verbositySettingId)) {
            return keybinding
                ? nls.localize('notebookTreeAriaLabelHelp', "{0}\nUse {1} for accessibility help", this.widgetAriaLabelName, keybinding)
                : nls.localize('notebookTreeAriaLabelHelpNoKb', "{0}\nRun the Open Accessibility Help command for more information", this.widgetAriaLabelName);
        }
        return this.widgetAriaLabelName;
    }
    mergeEvents(last, e) {
        const viewModel = this.viewModel();
        const result = last || [];
        if (viewModel && e.type === NotebookExecutionType.cell && e.affectsNotebook(viewModel.uri)) {
            const index = result.findIndex(update => update.cellHandle === e.cellHandle);
            if (index >= 0) {
                result.splice(index, 1);
            }
            result.push({ cellHandle: e.cellHandle, state: e.changed?.state });
        }
        return result;
    }
};
NotebookAccessibilityProvider = __decorate([
    __param(2, INotebookExecutionStateService),
    __param(3, IKeybindingService),
    __param(4, IConfigurationService),
    __param(5, IAccessibilityService)
], NotebookAccessibilityProvider);
export { NotebookAccessibilityProvider };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibm90ZWJvb2tBY2Nlc3NpYmlsaXR5UHJvdmlkZXIuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi9ub3RlYm9vay9icm93c2VyL25vdGVib29rQWNjZXNzaWJpbGl0eVByb3ZpZGVyLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7O0FBR2hHLE9BQU8sRUFBRSxLQUFLLEVBQUUsT0FBTyxFQUFFLE1BQU0sa0NBQWtDLENBQUM7QUFDbEUsT0FBTyxFQUFFLFVBQVUsRUFBRSxNQUFNLHNDQUFzQyxDQUFDO0FBQ2xFLE9BQU8sRUFBRSxtQkFBbUIsRUFBRSxNQUFNLHVDQUF1QyxDQUFDO0FBQzVFLE9BQU8sS0FBSyxHQUFHLE1BQU0sb0JBQW9CLENBQUM7QUFDMUMsT0FBTyxFQUFFLHFCQUFxQixFQUFFLE1BQU0sNERBQTRELENBQUM7QUFDbkcsT0FBTyxFQUFFLGtCQUFrQixFQUFFLE1BQU0sc0RBQXNELENBQUM7QUFJMUYsT0FBTyxFQUFFLFFBQVEsRUFBRSwwQkFBMEIsRUFBRSxNQUFNLDZCQUE2QixDQUFDO0FBQ25GLE9BQU8sRUFBZ0UsOEJBQThCLEVBQUUscUJBQXFCLEVBQUUsTUFBTSw0Q0FBNEMsQ0FBQztBQUNqTCxPQUFPLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSxxQ0FBcUMsQ0FBQztBQUN4RSxPQUFPLEVBQUUscUJBQXFCLEVBQUUsTUFBTSw0REFBNEQsQ0FBQztBQUNuRyxPQUFPLEVBQUUsS0FBSyxFQUFFLE1BQU0sMENBQTBDLENBQUM7QUFJMUQsSUFBTSw2QkFBNkIsR0FBbkMsTUFBTSw2QkFBOEIsU0FBUSxVQUFVO0lBSTVELFlBQ2tCLFNBQThDLEVBQzlDLGFBQXNCLEVBQ1AsNkJBQThFLEVBQzFGLGlCQUFzRCxFQUNuRCxvQkFBNEQsRUFDNUQsb0JBQTREO1FBRW5GLEtBQUssRUFBRSxD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