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
import * as DOM from '../../../../../base/browser/dom.js';
import { DisposableStore, dispose } from '../../../../../base/common/lifecycle.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { KERNEL_EXTENSIONS } from '../notebookBrowser.js';
import { KERNEL_HAS_VARIABLE_PROVIDER, NOTEBOOK_CELL_TOOLBAR_LOCATION, NOTEBOOK_HAS_OUTPUTS, NOTEBOOK_HAS_RUNNING_CELL, NOTEBOOK_HAS_SOMETHING_RUNNING, NOTEBOOK_INTERRUPTIBLE_KERNEL, NOTEBOOK_KERNEL, NOTEBOOK_KERNEL_COUNT, NOTEBOOK_KERNEL_SELECTED, NOTEBOOK_KERNEL_SOURCE_COUNT, NOTEBOOK_LAST_CELL_FAILED, NOTEBOOK_MISSING_KERNEL_EXTENSION, NOTEBOOK_USE_CONSOLIDATED_OUTPUT_BUTTON, NOTEBOOK_VIEW_TYPE } from '../../common/notebookContextKeys.js';
import { INotebookExecutionStateService, NotebookExecutionType } from '../../common/notebookExecutionStateService.js';
import { INotebookKernelService } from '../../common/notebookKernelService.js';
import { IExtensionService } from '../../../../services/extensions/common/extensions.js';
let NotebookEditorContextKeys = class NotebookEditorContextKeys {
    constructor(_editor, _notebookKernelService, contextKeyService, _extensionService, _notebookExecutionStateService) {
        this._editor = _editor;
        this._notebookKernelService = _notebookKernelService;
        this._extensionService = _extensionService;
        this._notebookExecutionStateService = _notebookExecutionStateService;
        this._disposables = new DisposableStore();
        this._viewModelDisposables = new DisposableStore();
        this._cellOutputsListeners = [];
        this._selectedKernelDisposables = new DisposableStore();
        this._notebookKernel = NOTEBOOK_KERNEL.bindTo(contextKeyService);
        this._notebookKernelCount = NOTEBOOK_KERNEL_COUNT.bindTo(contextKeyService);
        this._notebookKernelSelected = NOTEBOOK_KERNEL_SELECTED.bindTo(contextKeyService);
        this._interruptibleKernel = NOTEBOOK_INTERRUPTIBLE_KERNEL.bindTo(contextKeyService);
        this._hasVariableProvider = KERNEL_HAS_VARIABLE_PROVIDER.bindTo(contextKeyService);
        this._someCellRunning = NOTEBOOK_HAS_RUNNING_CELL.bindTo(contextKeyService);
        this._kernelRunning = NOTEBOOK_HAS_SOMETHING_RUNNING.bindTo(contextKeyService);
        this._useConsolidatedOutputButton = NOTEBOOK_USE_CONSOLIDATED_OUTPUT_BUTTON.bindTo(contextKeyService);
        this._hasOutputs = NOTEBOOK_HAS_OUTPUTS.bindTo(contextKeyService);
        this._viewType = NOTEBOOK_VIEW_TYPE.bindTo(contextKeyService);
        this._missingKernelExtension = NOTEBOOK_MISSING_KERNEL_EXTENSION.bindTo(contextKeyService);
        this._notebookKernelSourceCount = NOTEBOOK_KERNEL_SOURCE_COUNT.bindTo(contextKeyService);
        this._cellToolbarLocation = NOTEBOOK_CELL_TOOLBAR_LOCATION.bindTo(contextKeyService);
        this._lastCellFailed = NOTEBOOK_LAST_CELL_FAILED.bindTo(contextKeyService);
        this._handleDidChangeModel();
        this._updateForNotebookOptions();
        this._disposables.add(_editor.onDidChangeModel(this._handleDidChangeModel, this));
        this._disposables.add(_notebookKernelService.onDidAddKernel(this._updateKernelContext, this));
        this._disposables.add(_notebookKernelService.onDidChangeSelectedNotebooks(this._updateKernelContext, this));
        this._disposables.add(_notebookKernelService.onDidChangeSourceActions(this._updateKernelContext, this));
        this._disposables.add(_editor.notebookOptions.onDidChangeOptions(this._updateForNotebookOptions, this));
        this._disposables.add(_extensionService.onDidChangeExtensions(this._updateForInstalledExtension, this));
        this._disposables.add(_notebookExecutionStateService.onDidChangeExecution(this._updateForExecution, this));
        this._disposables.add(_notebookExecutionStateService.onDidChangeLastRunFailState(this._updateForLastRunFailState, this));
    }
    dispose() {
        this._disposables.dispose();
        this._viewModelDisposables.dispose();
        this._selectedKernelDisposables.dispose();
        this._notebookKernelCount.reset();
        this._notebookKernelSourceCount.reset();
        this._interruptibleKernel.reset();
        this._hasVariableProvider.reset();
        this._someCellRunning.reset();
        this._kernelRunning.reset();
        this._viewType.reset();
        dispose(this._cellOutputsListeners);
        this._cellOutputsListeners.length = 0;
    }
    _handleDidChangeModel() {
        this._updateKernelContext();
        this._updateForNotebookOptions();
        this._viewModelDisposables.clear();
        dispose(this._cellOutputsListeners);
        this._cellOutputsListeners.length = 0;
        if (!this._editor.hasModel()) {
            return;
        }
        const recomputeOutputsExistence = () => {
            let hasOutputs = false;
            if (this._editor.hasModel()) {
                for (let i = 0; i < this._editor.getLength(); i++) {
                    if (this._editor.cellAt(i).outputsViewModels.length > 0) {
                        hasOutputs = true;
                        break;
                    }
                }
            }
            this._hasOutputs.set(hasOutputs);
        };
        const layoutDisposable = this._viewModelDisposables.add(new DisposableStore());
        const addCellOutputsListener = (c) => {
            return c.model.onDidChangeOutputs(() => {
                layoutDisposable.clear();
                layoutDisposable.add(DOM.scheduleAtNextAnimationFrame(DOM.getWindow(this._editor.getDomNode()), () => {
                    recomputeOutputsExistence();
                }));
            });
        };
        for (let i = 0; i < this._editor.getLength(); i++) {
            const cell = this._editor.cellAt(i);
            this._cellOutputsListeners.push(addCellOutputsListener(cell));
        }
        recomputeOutputsExistence();
        this._updateForInstalledExtension();
        this._viewModelDisposables.add(this._editor.onDidChangeViewCells(e => {
            [...e.splices].reverse().forEach(splice => {
                const [start, deleted, newCells] = splice;
                const deletedCellOutputStates = this._cellOutputsListeners.splice(start, deleted, ...newCells.map(addCellOutputsListener));
                dispose(deletedCellOutputStates);
            });
        }));
        this._viewType.set(this._editor.textModel.viewType);
    }
    _updateForExecution(e) {
        if (this._editor.textModel) {
            const notebookExe = this._notebookExecutionStateService.getExecution(this._editor.textModel.uri);
            const notebookCellExe = this._notebookExecutionStateService.getCellExecutionsForNotebook(this._editor.textModel.uri);
            this._kernelRunning.set(notebookCellExe.length > 0 || !!notebookExe);
            if (e.type === NotebookExecutionType.cell) {
                this._someCellRunning.set(notebookCellExe.length > 0);
            }
        }
        else {
            this._kernelRunning.set(false);
            if (e.type === NotebookExecutionType.cell) {
                this._someCellRunning.set(false);
            }
        }
    }
    _updateForLastRunFailState(e) {
        if (e.notebook === this._editor.textModel?.uri) {
            this._lastCellFailed.set(e.visible);
        }
    }
    async _updateForInstalledExtension() {
        if (!this._editor.hasModel()) {
            return;
        }
        const viewType = this._editor.textModel.viewType;
        const kernelExtensionId = KERNEL_EXTENSIONS.get(viewType);
        this._missingKernelExtension.set(!!kernelExtensionId && !(await this._extensionService.getExtension(kernelExtensionId)));
    }
    _updateKernelContext() {
        if (!this._editor.hasModel()) {
            this._notebookKernelCount.reset();
            this._notebookKernelSourceCount.reset();
            this._interruptibleKernel.reset();
            this._hasVariableProvider.reset();
            return;
        }
        const { selected, all } = this._notebookKernelService.getMatchingKernel(this._editor.textModel);
        const sourceActions = this._notebookKernelService.getSourceActions(this._editor.textModel, this._editor.scopedContextKeyService);
        this._notebookKernelCount.set(all.length);
        this._notebookKernelSourceCount.set(sourceActions.length);
        this._interruptibleKernel.set(selected?.implementsInterrupt ?? false);
        this._hasVariableProvider.set(selected?.hasVariableProvider ?? false);
        this._notebookKernelSelected.set(Boolean(selected));
        this._notebookKernel.set(selected?.id ?? '');
        this._selectedKernelDisposables.clear();
        if (selected) {
            this._selectedKernelDisposables.add(selected.onDidChange(() => {
                this._interruptibleKernel.set(selected?.implementsInterrupt ?? false);
            }));
        }
    }
    _updateForNotebookOptions() {
        const layout = this._editor.notebookOptions.getDisplayOptions();
        this._useConsolidatedOutputButton.set(layout.consolidatedOutputButton);
        this._cellToolbarLocation.set(this._editor.notebookOptions.computeCellToolbarLocation(this._editor.textModel?.viewType));
    }
};
NotebookEditorContextKeys = __decorate([
    __param(1, INotebookKernelService),
    __param(2, IContextKeyService),
    __param(3, IExtensionService),
    __param(4, INotebookExecutionStateService)
], NotebookEditorContextKeys);
export { NotebookEditorContextKeys };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibm90ZWJvb2tFZGl0b3JXaWRnZXRDb250ZXh0S2V5cy5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL25vdGVib29rL2Jyb3dzZXIvdmlld1BhcnRzL25vdGVib29rRWRpdG9yV2lkZ2V0Q29udGV4dEtleXMudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7QUFFaEcsT0FBTyxLQUFLLEdBQUcsTUFBTSxvQ0FBb0MsQ0FBQztBQUMxRCxPQUFPLEVBQUUsZUFBZSxFQUFFLE9BQU8sRUFBZSxNQUFNLHlDQUF5QyxDQUFDO0FBQ2hHLE9BQU8sRUFBZSxrQkFBa0IsRUFBRSxNQUFNLHlEQUF5RCxDQUFDO0FBQzFHLE9BQU8sRUFBMkMsaUJBQWlCLEVBQUUsTUFBTSx1QkFBdUIsQ0FBQztBQUNuRyxPQUFPLEVBQUUsNEJBQTRCLEVBQUUsOEJBQThCLEVBQUUsb0JBQW9CLEVBQUUseUJBQXlCLEVBQUUsOEJBQThCLEVBQUUsNkJBQTZCLEVBQUUsZUFBZSxFQUFFLHFCQUFxQixFQUFFLHdCQUF3QixFQUFFLDRCQUE0QixFQUFFLHlCQUF5QixFQUFFLGlDQUFpQyxFQUFFLHVDQUF1QyxFQUFFLGtCQUFrQixFQUFFLE1BQU0scUNBQXFDLENBQUM7QUFDOWIsT0FBTyxFQUFnRSw4QkFBOEIsRUFBa0MscUJBQXFCLEVBQUUsTUFBTSwrQ0FBK0MsQ0FBQztBQUNwTixPQUFPLEVBQUUsc0JBQXNCLEVBQUUsTUFBTSx1Q0FBdUMsQ0FBQztBQUMvRSxPQUFPLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSxzREFBc0QsQ0FBQztBQUVsRixJQUFNLHlCQUF5QixHQUEvQixNQUFNLHlCQUF5QjtJQXNCckMsWUFDa0IsT0FBZ0MsRUFDekIsc0JBQStELEVBQ25FLGlCQUFxQyxFQUN0QyxpQkFBcUQsRUFDeEMsOEJBQStFO1FBSjlGLFlB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