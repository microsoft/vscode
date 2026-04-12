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
var ReplEditorInput_1;
import { ITextModelService } from '../../../../editor/common/services/resolverService.js';
import { ITextResourceConfigurationService } from '../../../../editor/common/services/textResourceConfiguration.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IFileDialogService } from '../../../../platform/dialogs/common/dialogs.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { ILabelService } from '../../../../platform/label/common/label.js';
import { IInteractiveHistoryService } from '../../interactive/browser/interactiveHistoryService.js';
import { CellKind, NotebookSetting } from '../../notebook/common/notebookCommon.js';
import { NotebookEditorInput } from '../../notebook/common/notebookEditorInput.js';
import { INotebookEditorModelResolverService } from '../../notebook/common/notebookEditorModelResolverService.js';
import { INotebookService } from '../../notebook/common/notebookService.js';
import { ICustomEditorLabelService } from '../../../services/editor/common/customEditorLabelService.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { IExtensionService } from '../../../services/extensions/common/extensions.js';
import { IFilesConfigurationService } from '../../../services/filesConfiguration/common/filesConfigurationService.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { localize } from '../../../../nls.js';
import { registerIcon } from '../../../../platform/theme/common/iconRegistry.js';
import { IWorkbenchEnvironmentService } from '../../../services/environment/common/environmentService.js';
import { IPathService } from '../../../services/path/common/pathService.js';
const replTabIcon = registerIcon('repl-editor-label-icon', Codicon.debugLineByLine, localize('replEditorLabelIcon', 'Icon of the REPL editor label.'));
let ReplEditorInput = class ReplEditorInput extends NotebookEditorInput {
    static { ReplEditorInput_1 = this; }
    static { this.ID = 'workbench.editorinputs.replEditorInput'; }
    constructor(resource, label, _notebookService, _notebookModelResolverService, _fileDialogService, labelService, fileService, filesConfigurationService, extensionService, editorService, textResourceConfigurationService, customEditorLabelService, historyService, _textModelService, configurationService, environmentService, pathService) {
        super(resource, undefined, 'jupyter-notebook', {}, _notebookService, _notebookModelResolverService, _fileDialogService, labelService, fileService, filesConfigurationService, extensionService, editorService, textResourceConfigurationService, customEditorLabelService, environmentService, pathService);
        this.historyService = historyService;
        this._textModelService = _textModelService;
        this.isDisposing = false;
        this.isScratchpad = resource.scheme === 'untitled' && configurationService.getValue(NotebookSetting.InteractiveWindowPromptToSave) !== true;
        this.label = label ?? this.createEditorLabel(resource);
    }
    getIcon() {
        return replTabIcon;
    }
    createEditorLabel(resource) {
        if (!resource) {
            return 'REPL';
        }
        if (resource.scheme === 'untitled') {
            const match = new RegExp('Untitled-(\\d+)\.').exec(resource.path);
            if (match?.length === 2) {
                return `REPL - ${match[1]}`;
            }
        }
        const filename = resource.path.split('/').pop();
        return filename ? `REPL - ${filename}` : 'REPL';
    }
    get typeId() {
        return ReplEditorInput_1.ID;
    }
    get editorId() {
        return 'repl';
    }
    getName() {
        return this.label;
    }
    get editorInputs() {
        return [this];
    }
    get capabilities() {
        const capabilities = super.capabilities;
        const scratchPad = this.isScratchpad ? 512 /* EditorInputCapabilities.Scratchpad */ : 0;
        return capabilities
            | 2 /* EditorInputCapabilities.Readonly */
            | scratchPad;
    }
    async resolve() {
        const model = await super.resolve();
        if (model) {
            this.ensureInputBoxCell(model.notebook);
        }
        return model;
    }
    ensureInputBoxCell(notebook) {
        const lastCell = notebook.cells[notebook.cells.length - 1];
        if (!lastCell || lastCell.cellKind === CellKind.Markup || lastCell.outputs.length > 0 || lastCell.internalMetadata.executionOrder !== undefined) {
            notebook.applyEdits([
                {
                    editType: 1 /* CellEditType.Replace */,
                    index: notebook.cells.length,
                    count: 0,
                    cells: [
                        {
                            cellKind: CellKind.Code,
                            language: 'python',
                            mime: undefined,
                            outputs: [],
                            source: ''
                        }
                    ]
                }
            ], true, undefined, () => undefined, undefined, false);
        }
    }
    async resolveInput(notebook) {
        if (this.inputModelRef) {
            return this.inputModelRef.object.textEditorModel;
        }
        const lastCell = notebook.cells[notebook.cells.length - 1];
        if (!lastCell) {
            throw new Error('The REPL editor requires at least one cell for the input box.');
        }
        this.inputModelRef = await this._textModelService.createModelReference(lastCell.uri);
        return this.inputModelRef.object.textEditorModel;
    }
    dispose() {
        if (!this.isDisposing) {
            this.isDisposing = true;
            this.editorModelReference?.object.revert({ soft: true });
            this.inputModelRef?.dispose();
            super.dispose();
        }
    }
};
ReplEditorInput = ReplEditorInput_1 = __decorate([
    __param(2, INotebookService),
    __param(3, INotebookEditorModelResolverService),
    __param(4, IFileDialogService),
    __param(5, ILabelService),
    __param(6, IFileService),
    __param(7, IFilesConfigurationService),
    __param(8, IExtensionService),
    __param(9, IEditorService),
    __param(10, ITextResourceConfigurationService),
    __param(11, ICustomEditorLabelService),
    __param(12, IInteractiveHistoryService),
    __param(13, ITextModelService),
    __param(14, IConfigurationService),
    __param(15, IWorkbenchEnvironmentService),
    __param(16, IPathService)
], ReplEditorInput);
export { ReplEditorInput };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicmVwbEVkaXRvcklucHV0LmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvcmVwbE5vdGVib29rL2Jyb3dzZXIvcmVwbEVkaXRvcklucHV0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7OztBQUloRyxPQUFPLEVBQTRCLGlCQUFpQixFQUFFLE1BQU0sdURBQXVELENBQUM7QUFDcEgsT0FBTyxFQUFFLGlDQUFpQyxFQUFFLE1BQU0saUVBQWlFLENBQUM7QUFDcEgsT0FBTyxFQUFFLHFCQUFxQixFQUFFLE1BQU0sNERBQTRELENBQUM7QUFDbkcsT0FBTyxFQUFFLGtCQUFrQixFQUFFLE1BQU0sZ0RBQWdELENBQUM7QUFDcEYsT0FBTyxFQUFFLFlBQVksRUFBRSxNQUFNLDRDQUE0QyxDQUFDO0FBQzFFLE9BQU8sRUFBRSxhQUFhLEVBQUUsTUFBTSw0Q0FBNEMsQ0FBQztBQUUzRSxPQUFPLEVBQUUsMEJBQTBCLEVBQUUsTUFBTSx3REFBd0QsQ0FBQztBQUVwRyxPQUFPLEVBQWdCLFFBQVEsRUFBRSxlQUFlLEVBQUUsTUFBTSx5Q0FBeUMsQ0FBQztBQUNsRyxPQUFPLEVBQWlDLG1CQUFtQixFQUFFLE1BQU0sOENBQThDLENBQUM7QUFDbEgsT0FBTyxFQUFFLG1DQUFtQyxFQUFFLE1BQU0sNkRBQTZELENBQUM7QUFDbEgsT0FBTyxFQUFFLGdCQUFnQixFQUFFLE1BQU0sMENBQTBDLENBQUM7QUFDNUUsT0FBTyxFQUFFLHlCQUF5QixFQUFFLE1BQU0sNkRBQTZELENBQUM7QUFDeEcsT0FBTyxFQUFFLGNBQWMsRUFBRSxNQUFNLGtEQUFrRCxDQUFDO0FBQ2xGLE9BQU8sRUFBRSxpQkFBaUIsRUFBRSxNQUFNLG1EQUFtRCxDQUFDO0FBQ3RGLE9BQU8sRUFBRSwwQkFBMEIsRUFBRSxNQUFNLDBFQUEwRSxDQUFDO0FB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