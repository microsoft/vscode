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
import * as nls from '../../../../../../nls.js';
import { Disposable, DisposableStore, MutableDisposable } from '../../../../../../base/common/lifecycle.js';
import { Schemas } from '../../../../../../base/common/network.js';
import { ILanguageFeaturesService } from '../../../../../../editor/common/services/languageFeatures.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { IInstantiationService } from '../../../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../../../platform/log/common/log.js';
import { registerWorkbenchContribution2 } from '../../../../../common/contributions.js';
import { CENTER_ACTIVE_CELL } from '../navigation/arrow.js';
import { SELECT_KERNEL_ID } from '../../controller/coreActions.js';
import { SELECT_NOTEBOOK_INDENTATION_ID } from '../../controller/editActions.js';
import { getNotebookEditorFromEditorPane } from '../../notebookBrowser.js';
import { NotebookCellsChangeType } from '../../../common/notebookCommon.js';
import { INotebookKernelService } from '../../../common/notebookKernelService.js';
import { IEditorService } from '../../../../../services/editor/common/editorService.js';
import { IStatusbarService } from '../../../../../services/statusbar/browser/statusbar.js';
import { IEditorGroupsService } from '../../../../../services/editor/common/editorGroupsService.js';
import { Event } from '../../../../../../base/common/event.js';
let ImplictKernelSelector = class ImplictKernelSelector {
    constructor(notebook, suggested, notebookKernelService, languageFeaturesService, logService) {
        const disposables = new DisposableStore();
        this.dispose = disposables.dispose.bind(disposables);
        const selectKernel = () => {
            disposables.clear();
            notebookKernelService.selectKernelForNotebook(suggested, notebook);
        };
        // IMPLICITLY select a suggested kernel when the notebook has been changed
        // e.g change cell source, move cells, etc
        disposables.add(notebook.onDidChangeContent(e => {
            for (const event of e.rawEvents) {
                switch (event.kind) {
                    case NotebookCellsChangeType.ChangeCellContent:
                    case NotebookCellsChangeType.ModelChange:
                    case NotebookCellsChangeType.Move:
                    case NotebookCellsChangeType.ChangeCellLanguage:
                        logService.trace('IMPLICIT kernel selection because of change event', event.kind);
                        selectKernel();
                        break;
                }
            }
        }));
        // IMPLICITLY select a suggested kernel when users start to hover. This should
        // be a strong enough hint that the user wants to interact with the notebook. Maybe
        // add more triggers like goto-providers or completion-providers
        disposables.add(languageFeaturesService.hoverProvider.register({ scheme: Schemas.vscodeNotebookCell, pattern: notebook.uri.path }, {
            provideHover() {
                logService.trace('IMPLICIT kernel selection because of hover');
                selectKernel();
                return undefined;
            }
        }));
    }
};
ImplictKernelSelector = __decorate([
    __param(2, INotebookKernelService),
    __param(3, ILanguageFeaturesService),
    __param(4, ILogService)
], ImplictKernelSelector);
let KernelStatus = class KernelStatus extends Disposable {
    constructor(_editorService, _statusbarService, _notebookKernelService, _instantiationService) {
        super();
        this._editorService = _editorService;
        this._statusbarService = _statusbarService;
        this._notebookKernelService = _notebookKernelService;
        this._instantiationService = _instantiationService;
        this._editorDisposables = this._register(new DisposableStore());
        this._kernelInfoElement = this._register(new DisposableStore());
        this._register(this._editorService.onDidActiveEditorChange(() => this._updateStatusbar()));
        this._updateStatusbar();
    }
    _updateStatusbar() {
        this._editorDisposables.clear();
        const activeEditor = getNotebookEditorFromEditorPane(this._editorService.activeEditorPane);
        if (!activeEditor) {
            // not a notebook -> clean-up, done
            this._kernelInfoElement.clear();
            return;
        }
        const updateStatus = () => {
            if (activeEditor.notebookOptions.getDisplayOptions().globalToolbar) {
                // kernel info rendered in the notebook toolbar already
                this._kernelInfoElement.clear();
                return;
            }
            const notebook = activeEditor.textModel;
            if (notebook) {
                this._showKernelStatus(notebook);
            }
            else {
                this._kernelInfoElement.clear();
            }
        };
        this._editorDisposables.add(this._notebookKernelService.onDidAddKernel(updateStatus));
        this._editorDisposables.add(this._notebookKernelService.onDidChangeSelectedNotebooks(updateStatus));
        this._editorDisposables.add(this._notebookKernelService.onDidChangeNotebookAffinity(updateStatus));
        this._editorDisposables.add(activeEditor.onDidChangeModel(updateStatus));
        this._editorDisposables.add(activeEditor.notebookOptions.onDidChangeOptions(updateStatus));
        updateStatus();
    }
    _showKernelStatus(notebook) {
        this._kernelInfoElement.clear();
        const { selected, suggestions, all } = this._notebookKernelService.getMatchingKernel(notebook);
        const suggested = (suggestions.length === 1 ? suggestions[0] : undefined)
            ?? (all.length === 1) ? all[0] : undefined;
        let isSuggested = false;
        if (all.length === 0) {
            // no kernel -> no status
            return;
        }
        else if (selected || suggested) {
            // selected or single kernel
            let kernel = selected;
            if (!kernel) {
                // proceed with suggested kernel - show UI and install handler that selects the kernel
                // when non trivial interactions with the notebook happen.
                kernel = suggested;
                isSuggested = true;
                this._kernelInfoElement.add(this._instantiationService.createInstance(ImplictKernelSelector, notebook, kernel));
            }
            const tooltip = kernel.description ?? kernel.detail ?? kernel.label;
            this._kernelInfoElement.add(this._statusbarService.addEntry({
                name: nls.localize('notebook.info', "Notebook Kernel Info"),
                text: `$(notebook-kernel-select) ${kernel.label}`,
                ariaLabel: kernel.label,
                tooltip: isSuggested ? nls.localize('tooltop', "{0} (suggestion)", tooltip) : tooltip,
                command: SELECT_KERNEL_ID,
            }, SELECT_KERNEL_ID, 1 /* StatusbarAlignment.RIGHT */, 10));
            this._kernelInfoElement.add(kernel.onDidChange(() => this._showKernelStatus(notebook)));
        }
        else {
            // multiple kernels -> show selection hint
            this._kernelInfoElement.add(this._statusbarService.addEntry({
                name: nls.localize('notebook.select', "Notebook Kernel Selection"),
                text: nls.localize('kernel.select.label', "Select Kernel"),
                ariaLabel: nls.localize('kernel.select.label', "Select Kernel"),
                command: SELECT_KERNEL_ID,
                kind: 'prominent'
            }, SELECT_KERNEL_ID, 1 /* StatusbarAlignment.RIGHT */, 10));
        }
    }
};
KernelStatus = __decorate([
    __param(0, IEditorService),
    __param(1, IStatusbarService),
    __param(2, INotebookKernelService),
    __param(3, IInstantiationService)
], KernelStatus);
let ActiveCellStatus = class ActiveCellStatus extends Disposable {
    constructor(_editorService, _statusbarService) {
        super();
        this._editorService = _editorService;
        this._statusbarService = _statusbarService;
        this._itemDisposables = this._register(new DisposableStore());
        this._accessor = this._register(new MutableDisposable());
        this._register(this._editorService.onDidActiveEditorChange(() => this._update()));
        this._update();
    }
    _update() {
        this._itemDisposables.clear();
        const activeEditor = getNotebookEditorFromEditorPane(this._editorService.activeEditorPane);
        if (activeEditor) {
            this._itemDisposables.add(activeEditor.onDidChangeSelection(() => this._show(activeEditor)));
            this._itemDisposables.add(activeEditor.onDidChangeActiveCell(() => this._show(activeEditor)));
            this._show(activeEditor);
        }
        else {
            this._accessor.clear();
        }
    }
    _show(editor) {
        if (!editor.hasModel()) {
            this._accessor.clear();
            return;
        }
        const newText = this._getSelectionsText(editor);
        if (!newText) {
            this._accessor.clear();
            return;
        }
        const entry = {
            name: nls.localize('notebook.activeCellStatusName', "Notebook Editor Selections"),
            text: newText,
            ariaLabel: newText,
            command: CENTER_ACTIVE_CELL
        };
        if (!this._accessor.value) {
            this._accessor.value = this._statusbarService.addEntry(entry, 'notebook.activeCellStatus', 1 /* StatusbarAlignment.RIGHT */, 100);
        }
        else {
            this._accessor.value.update(entry);
        }
    }
    _getSelectionsText(editor) {
        if (!editor.hasModel()) {
            return undefined;
        }
        const activeCell = editor.getActiveCell();
        if (!activeCell) {
            return undefined;
        }
        const idxFocused = editor.getCellIndex(activeCell) + 1;
        const numSelected = editor.getSelections().reduce((prev, range) => prev + (range.end - range.start), 0);
        const totalCells = editor.getLength();
        return numSelected > 1 ?
            nls.localize('notebook.multiActiveCellIndicator', "Cell {0} ({1} selected)", idxFocused, numSelected) :
            nls.localize('notebook.singleActiveCellIndicator', "Cell {0} of {1}", idxFocused, totalCells);
    }
};
ActiveCellStatus = __decorate([
    __param(0, IEditorService),
    __param(1, IStatusbarService)
], ActiveCellStatus);
let NotebookIndentationStatus = class NotebookIndentationStatus extends Disposable {
    static { this.ID = 'selectNotebookIndentation'; }
    constructor(_editorService, _statusbarService, _configurationService) {
        super();
        this._editorService = _editorService;
        this._statusbarService = _statusbarService;
        this._configurationService = _configurationService;
        this._itemDisposables = this._register(new DisposableStore());
        this._accessor = this._register(new MutableDisposable());
        this._register(this._editorService.onDidActiveEditorChange(() => this._update()));
        this._register(this._configurationService.onDidChangeConfiguration(e => {
            if (e.affectsConfiguration('editor') || e.affectsConfiguration('notebook')) {
                this._update();
            }
        }));
        this._update();
    }
    _update() {
        this._itemDisposables.clear();
        const activeEditor = getNotebookEditorFromEditorPane(this._editorService.activeEditorPane);
        if (activeEditor) {
            this._show(activeEditor);
            this._itemDisposables.add(activeEditor.onDidChangeSelection(() => {
                this._accessor.clear();
                this._show(activeEditor);
            }));
        }
        else {
            this._accessor.clear();
        }
    }
    _show(editor) {
        if (!editor.hasModel()) {
            this._accessor.clear();
            return;
        }
        const cellOptions = editor.getActiveCell()?.textModel?.getOptions();
        if (!cellOptions) {
            this._accessor.clear();
            return;
        }
        const cellEditorOverridesRaw = editor.notebookOptions.getDisplayOptions().editorOptionsCustomizations;
        const indentSize = cellEditorOverridesRaw?.['editor.indentSize'] ?? cellOptions?.indentSize;
        const insertSpaces = cellEditorOverridesRaw?.['editor.insertSpaces'] ?? cellOptions?.insertSpaces;
        const tabSize = cellEditorOverridesRaw?.['editor.tabSize'] ?? cellOptions?.tabSize;
        const width = typeof indentSize === 'number' ? indentSize : tabSize;
        const message = insertSpaces ? `Spaces: ${width}` : `Tab Size: ${width}`;
        const newText = message;
        if (!newText) {
            this._accessor.clear();
            return;
        }
        const entry = {
            name: nls.localize('notebook.indentation', "Notebook Indentation"),
            text: newText,
            ariaLabel: newText,
            tooltip: nls.localize('selectNotebookIndentation', "Select Indentation"),
            command: SELECT_NOTEBOOK_INDENTATION_ID
        };
        if (!this._accessor.value) {
            this._accessor.value = this._statusbarService.addEntry(entry, 'notebook.status.indentation', 1 /* StatusbarAlignment.RIGHT */, 100.4);
        }
        else {
            this._accessor.value.update(entry);
        }
    }
};
NotebookIndentationStatus = __decorate([
    __param(0, IEditorService),
    __param(1, IStatusbarService),
    __param(2, IConfigurationService)
], NotebookIndentationStatus);
let NotebookEditorStatusContribution = class NotebookEditorStatusContribution extends Disposable {
    static { this.ID = 'notebook.contrib.editorStatus'; }
    constructor(editorGroupService) {
        super();
        this.editorGroupService = editorGroupService;
        for (const part of editorGroupService.parts) {
            this.createNotebookStatus(part);
        }
        this._register(editorGroupService.onDidCreateAuxiliaryEditorPart(part => this.createNotebookStatus(part)));
    }
    createNotebookStatus(part) {
        const disposables = new DisposableStore();
        Event.once(part.onWillDispose)(() => disposables.dispose());
        const scopedInstantiationService = this.editorGroupService.getScopedInstantiationService(part);
        disposables.add(scopedInstantiationService.createInstance(KernelStatus));
        disposables.add(scopedInstantiationService.createInstance(ActiveCellStatus));
        disposables.add(scopedInstantiationService.createInstance(NotebookIndentationStatus));
    }
};
NotebookEditorStatusContribution = __decorate([
    __param(0, IEditorGroupsService)
], NotebookEditorStatusContribution);
registerWorkbenchContribution2(NotebookEditorStatusContribution.ID, NotebookEditorStatusContribution, 3 /* WorkbenchPhase.AfterRestored */);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZWRpdG9yU3RhdHVzQmFyLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvbm90ZWJvb2svYnJvd3Nlci9jb250cmliL2VkaXRvclN0YXR1c0Jhci9lZGl0b3JTdGF0dXNCYXIudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7QUFFaEcsT0FBTyxLQUFLLEdBQUcsTUFBTSwwQkFBMEIsQ0FBQztBQUNoRCxPQUFPLEVBQUUsVUFBVSxFQUFFLGVBQWUsRUFBZSxpQkFBaUIsRUFBRSxNQUFNLDRDQUE0QyxDQUFDO0FBQ3pILE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSwwQ0FBMEMsQ0FBQztBQUNuRSxPQUFPLEVBQUUsd0JBQXdCLEVBQUUsTUFBTSw4REFBOEQsQ0FBQztBQUN4RyxPQUFPLEVBQUUscUJBQXFCLEVBQUUsTUFBTSxrRUFBa0UsQ0FBQztBQUN6RyxPQUFPLEVBQUUscUJBQXFCLEVBQUUsTUFBTSxrRUFBa0UsQ0FBQztBQUN6RyxPQUFPLEVBQUUsV0FBVyxFQUFFLE1BQU0sOENBQThDLENBQUM7QUFDM0UsT0FBTyxFQUEwQyw4QkFBOEIsRUFBRSxNQUFNLHdDQUF3QyxDQUFDO0FBQ2hJLE9BQU8sRUFBRSxrQkFBa0IsRUFBRSxNQUFNLHdCQUF3QixDQUFDO0FBQzVELE9BQU8sRUFBRSxnQkFBZ0IsRUFBRSxNQUFNLGlDQUFpQyxDQUFDO0FBQ25FLE9BQU8sRUFBRSw4QkFBOEIsRUFBRSxNQUFNLGlDQUFpQyxDQUFDO0FBQ2pGLE9BQU8sRUFBbUIsK0JBQStCLEVBQUUsTUFBTSwwQkFBMEIsQ0FBQztBQUU1RixPQUFPLEVBQUUsdUJBQXVCLEVBQUUsTUFBTSxtQ0FBbUMsQ0FBQztBQUM1RSxPQUFPLEVBQW1CLHNCQUFzQixFQUFFLE1BQU0sMENBQTBDLENBQUM7QUFDbkcsT0FBTyxFQUFFLGNBQWMs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