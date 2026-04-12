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
var NotebookContribution_1;
import { Schemas } from '../../../../base/common/network.js';
import { Disposable, DisposableStore, dispose } from '../../../../base/common/lifecycle.js';
import { parse } from '../../../../base/common/marshalling.js';
import { extname, isEqual } from '../../../../base/common/resources.js';
import { assertType } from '../../../../base/common/types.js';
import { URI } from '../../../../base/common/uri.js';
import { toFormattedString } from '../../../../base/common/jsonFormatter.js';
import { IModelService } from '../../../../editor/common/services/model.js';
import { ILanguageService } from '../../../../editor/common/languages/language.js';
import { ITextModelService } from '../../../../editor/common/services/resolverService.js';
import * as nls from '../../../../nls.js';
import { Extensions } from '../../../../platform/configuration/common/configurationRegistry.js';
import { SyncDescriptor } from '../../../../platform/instantiation/common/descriptors.js';
import { registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { EditorPaneDescriptor } from '../../../browser/editor.js';
import { Extensions as WorkbenchExtensions, registerWorkbenchContribution2 } from '../../../common/contributions.js';
import { EditorExtensions } from '../../../common/editor.js';
import { NotebookEditor } from './notebookEditor.js';
import { NotebookEditorInput } from '../common/notebookEditorInput.js';
import { INotebookService } from '../common/notebookService.js';
import { NotebookService } from './services/notebookServiceImpl.js';
import { CellKind, CellUri, NotebookWorkingCopyTypeIdentifier, NotebookSetting, NotebookCellsChangeType, NotebookMetadataUri } from '../common/notebookCommon.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { IUndoRedoService } from '../../../../platform/undoRedo/common/undoRedo.js';
import { INotebookEditorModelResolverService } from '../common/notebookEditorModelResolverService.js';
import { NotebookDiffEditorInput } from '../common/notebookDiffEditorInput.js';
import { NotebookTextDiffEditor } from './diff/notebookDiffEditor.js';
import { INotebookEditorWorkerService } from '../common/services/notebookWorkerService.js';
import { NotebookEditorWorkerServiceImpl } from './services/notebookWorkerServiceImpl.js';
import { INotebookCellStatusBarService } from '../common/notebookCellStatusBarService.js';
import { NotebookCellStatusBarService } from './services/notebookCellStatusBarServiceImpl.js';
import { INotebookEditorService } from './services/notebookEditorService.js';
import { NotebookEditorWidgetService } from './services/notebookEditorServiceImpl.js';
import { Extensions as JSONExtensions } from '../../../../platform/jsonschemas/common/jsonContributionRegistry.js';
import { Event } from '../../../../base/common/event.js';
import { getFormattedOutputJSON, getStreamOutputData } from './diff/diffElementViewModel.js';
import { NotebookModelResolverServiceImpl } from '../common/notebookEditorModelResolverServiceImpl.js';
import { INotebookKernelHistoryService, INotebookKernelService } from '../common/notebookKernelService.js';
import { NotebookKernelService } from './services/notebookKernelServiceImpl.js';
import { IExtensionService } from '../../../services/extensions/common/extensions.js';
import { IWorkingCopyEditorService } from '../../../services/workingCopy/common/workingCopyEditorService.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { ILabelService } from '../../../../platform/label/common/label.js';
import { IEditorGroupsService } from '../../../services/editor/common/editorGroupsService.js';
import { NotebookRendererMessagingService } from './services/notebookRendererMessagingServiceImpl.js';
import { INotebookRendererMessagingService } from '../common/notebookRendererMessagingService.js';
import { INotebookCellOutlineDataSourceFactory, NotebookCellOutlineDataSourceFactory } from './viewModel/notebookOutlineDataSourceFactory.js';
// Editor Controller
import './controller/coreActions.js';
import './controller/insertCellActions.js';
import './controller/executeActions.js';
import './controller/sectionActions.js';
import './controller/layoutActions.js';
import './controller/editActions.js';
import './controller/cellOutputActions.js';
import './controller/apiActions.js';
import './controller/foldingController.js';
import './controller/chat/notebook.chat.contribution.js';
import './controller/variablesActions.js';
// Editor Contribution
import './contrib/editorHint/emptyCellEditorHint.js';
import './contrib/clipboard/notebookClipboard.js';
import './contrib/find/notebookFind.js';
import './contrib/format/formatting.js';
import './contrib/saveParticipants/saveParticipants.js';
import './contrib/gettingStarted/notebookGettingStarted.js';
import './contrib/layout/layoutActions.js';
import './contrib/marker/markerProvider.js';
import './contrib/navigation/arrow.js';
import './contrib/outline/notebookOutline.js';
import './contrib/profile/notebookProfile.js';
import './contrib/cellStatusBar/statusBarProviders.js';
import './contrib/cellStatusBar/contributedStatusBarItemController.js';
import './contrib/cellStatusBar/executionStatusBarItemController.js';
import './contrib/editorStatusBar/editorStatusBar.js';
import './contrib/undoRedo/notebookUndoRedo.js';
import './contrib/cellCommands/cellCommands.js';
import './contrib/viewportWarmup/viewportWarmup.js';
import './contrib/troubleshoot/layout.js';
import './contrib/debug/notebookBreakpoints.js';
import './contrib/debug/notebookCellPausing.js';
import './contrib/debug/notebookDebugDecorations.js';
import './contrib/execute/executionEditorProgress.js';
import './contrib/kernelDetection/notebookKernelDetection.js';
import './contrib/cellDiagnostics/cellDiagnostics.js';
import './contrib/multicursor/notebookMulticursor.js';
import './contrib/multicursor/notebookSelectionHighlight.js';
import './contrib/notebookVariables/notebookInlineVariables.js';
// Diff Editor Contribution
import './diff/notebookDiffActions.js';
// Services
import { editorOptionsRegistry } from '../../../../editor/common/config/editorOptions.js';
import { NotebookExecutionStateService } from './services/notebookExecutionStateServiceImpl.js';
import { NotebookExecutionService } from './services/notebookExecutionServiceImpl.js';
import { INotebookExecutionService } from '../common/notebookExecutionService.js';
import { INotebookKeymapService } from '../common/notebookKeymapService.js';
import { NotebookKeymapService } from './services/notebookKeymapServiceImpl.js';
import { PLAINTEXT_LANGUAGE_ID } from '../../../../editor/common/languages/modesRegistry.js';
import { INotebookExecutionStateService } from '../common/notebookExecutionStateService.js';
import { ILanguageFeaturesService } from '../../../../editor/common/services/languageFeatures.js';
import { COMMENTEDITOR_DECORATION_KEY } from '../../comments/browser/commentReply.js';
import { ICodeEditorService } from '../../../../editor/browser/services/codeEditorService.js';
import { NotebookKernelHistoryService } from './services/notebookKernelHistoryServiceImpl.js';
import { INotebookLoggingService } from '../common/notebookLoggingService.js';
import { NotebookLoggingService } from './services/notebookLoggingServiceImpl.js';
import product from '../../../../platform/product/common/product.js';
import { NotebookVariables } from './contrib/notebookVariables/notebookVariables.js';
import { AccessibleViewRegistry } from '../../../../platform/accessibility/browser/accessibleViewRegistry.js';
import { NotebookAccessibilityHelp } from './notebookAccessibilityHelp.js';
import { NotebookAccessibleView } from './notebookAccessibleView.js';
import { DefaultFormatter } from '../../format/browser/formatActionsMultiple.js';
import { NotebookMultiTextDiffEditor } from './diff/notebookMultiDiffEditor.js';
import { NotebookMultiDiffEditorInput } from './diff/notebookMultiDiffEditorInput.js';
import { getFormattedMetadataJSON } from '../common/model/notebookCellTextModel.js';
import { INotebookOutlineEntryFactory, NotebookOutlineEntryFactory } from './viewModel/notebookOutlineEntryFactory.js';
import { getFormattedNotebookMetadataJSON } from '../common/model/notebookMetadataTextModel.js';
import { NotebookOutputEditor } from './outputEditor/notebookOutputEditor.js';
import { NotebookOutputEditorInput } from './outputEditor/notebookOutputEditorInput.js';
/*--------------------------------------------------------------------------------------------- */
Registry.as(EditorExtensions.EditorPane).registerEditorPane(EditorPaneDescriptor.create(NotebookEditor, NotebookEditor.ID, 'Notebook Editor'), [
    new SyncDescriptor(NotebookEditorInput)
]);
Registry.as(EditorExtensions.EditorPane).registerEditorPane(EditorPaneDescriptor.create(NotebookTextDiffEditor, NotebookTextDiffEditor.ID, 'Notebook Diff Editor'), [
    new SyncDescriptor(NotebookDiffEditorInput)
]);
Registry.as(EditorExtensions.EditorPane).registerEditorPane(EditorPaneDescriptor.create(NotebookOutputEditor, NotebookOutputEditor.ID, 'Notebook Output Editor'), [
    new SyncDescriptor(NotebookOutputEditorInput)
]);
Registry.as(EditorExtensions.EditorPane).registerEditorPane(EditorPaneDescriptor.create(NotebookMultiTextDiffEditor, NotebookMultiTextDiffEditor.ID, 'Notebook Diff Editor'), [
    new SyncDescriptor(NotebookMultiDiffEditorInput)
]);
let NotebookDiffEditorSerializer = class NotebookDiffEditorSerializer {
    constructor(_configurationService) {
        this._configurationService = _configurationService;
    }
    canSerialize() {
        return true;
    }
    serialize(input) {
        assertType(input instanceof NotebookDiffEditorInput);
        return JSON.stringify({
            resource: input.resource,
            originalResource: input.original.resource,
            name: input.getName(),
            originalName: input.original.getName(),
            textDiffName: input.getName(),
            viewType: input.viewType,
        });
    }
    deserialize(instantiationService, raw) {
        const data = parse(raw);
        if (!data) {
            return undefined;
        }
        const { resource, originalResource, name, viewType } = data;
        if (!data || !URI.isUri(resource) || !URI.isUri(originalResource) || typeof name !== 'string' || typeof viewType !== 'string') {
            return undefined;
        }
        if (this._configurationService.getValue('notebook.experimental.enableNewDiffEditor')) {
            return NotebookMultiDiffEditorInput.create(instantiationService, resource, name, undefined, originalResource, viewType);
        }
        else {
            return NotebookDiffEditorInput.create(instantiationService, resource, name, undefined, originalResource, viewType);
        }
    }
    static canResolveBackup(editorInput, backupResource) {
        return false;
    }
};
NotebookDiffEditorSerializer = __decorate([
    __param(0, IConfigurationService)
], NotebookDiffEditorSerializer);
class NotebookEditorSerializer {
    canSerialize(input) {
        return input.typeId === NotebookEditorInput.ID;
    }
    serialize(input) {
        assertType(input instanceof NotebookEditorInput);
        const data = {
            resource: input.resource,
            preferredResource: input.preferredResource,
            viewType: input.viewType,
            options: input.options
        };
        return JSON.stringify(data);
    }
    deserialize(instantiationService, raw) {
        const data = parse(raw);
        if (!data) {
            return undefined;
        }
        const { resource, preferredResource, viewType, options } = data;
        if (!data || !URI.isUri(resource) || typeof viewType !== 'string') {
            return undefined;
        }
        const input = NotebookEditorInput.getOrCreate(instantiationService, resource, preferredResource, viewType, options);
        return input;
    }
}
class NotebookOutputEditorSerializer {
    canSerialize(input) {
        return input.typeId === NotebookOutputEditorInput.ID;
    }
    serialize(input) {
        assertType(input instanceof NotebookOutputEditorInput);
        const data = input.getSerializedData(); // in case of cell movement etc get latest indices
        if (!data) {
            return undefined;
        }
        return JSON.stringify(data);
    }
    deserialize(instantiationService, raw) {
        const data = parse(raw);
        if (!data) {
            return undefined;
        }
        const input = instantiationService.createInstance(NotebookOutputEditorInput, data.notebookUri, data.cellIndex, undefined, data.outputIndex);
        return input;
    }
}
Registry.as(EditorExtensions.EditorFactory).registerEditorSerializer(NotebookEditorInput.ID, NotebookEditorSerializer);
Registry.as(EditorExtensions.EditorFactory).registerEditorSerializer(NotebookDiffEditorInput.ID, NotebookDiffEditorSerializer);
Registry.as(EditorExtensions.EditorFactory).registerEditorSerializer(NotebookOutputEditorInput.ID, NotebookOutputEditorSerializer);
let NotebookContribution = class NotebookContribution extends Disposable {
    static { NotebookContribution_1 = this; }
    static { this.ID = 'workbench.contrib.notebook'; }
    constructor(undoRedoService, configurationService, codeEditorService) {
        super();
        this.codeEditorService = codeEditorService;
        this.updateCellUndoRedoComparisonKey(configurationService, undoRedoService);
        // Watch for changes to undoRedoPerCell setting
        this._register(configurationService.onDidChangeConfiguration(e => {
            if (e.affectsConfiguration(NotebookSetting.undoRedoPerCell)) {
                this.updateCellUndoRedoComparisonKey(configurationService, undoRedoService);
            }
        }));
        // register comment decoration
        this._register(this.codeEditorService.registerDecorationType('comment-controller', COMMENTEDITOR_DECORATION_KEY, {}));
    }
    // Add or remove the cell undo redo comparison key based on the user setting
    updateCellUndoRedoComparisonKey(configurationService, undoRedoService) {
        const undoRedoPerCell = configurationService.getValue(NotebookSetting.undoRedoPerCell);
        if (!undoRedoPerCell) {
            // Add comparison key to map cell => main document
            if (!this._uriComparisonKeyComputer) {
                this._uriComparisonKeyComputer = undoRedoService.registerUriComparisonKeyComputer(CellUri.scheme, {
                    getComparisonKey: (uri) => {
                        if (undoRedoPerCell) {
                            return uri.toString();
                        }
                        return NotebookContribution_1._getCellUndoRedoComparisonKey(uri);
                    }
                });
            }
        }
        else {
            // Dispose comparison key
            this._uriComparisonKeyComputer?.dispose();
            this._uriComparisonKeyComputer = undefined;
        }
    }
    static _getCellUndoRedoComparisonKey(uri) {
        const data = CellUri.parse(uri);
        if (!data) {
            return uri.toString();
        }
        return data.notebook.toString();
    }
    dispose() {
        super.dispose();
        this._uriComparisonKeyComputer?.dispose();
    }
};
NotebookContribution = NotebookContribution_1 = __decorate([
    __param(0, IUndoRedoService),
    __param(1, IConfigurationService),
    __param(2, ICodeEditorService)
], NotebookContribution);
export { NotebookContribution };
let CellContentProvider = class CellContentProvider {
    static { this.ID = 'workbench.contrib.cellContentProvider'; }
    constructor(textModelService, _modelService, _languageService, _notebookModelResolverService) {
        this._modelService = _modelService;
        this._languageService = _languageService;
        this._notebookModelResolverService = _notebookModelResolverService;
        this._registration = textModelService.registerTextModelContentProvider(CellUri.scheme, this);
    }
    dispose() {
        this._registration.dispose();
    }
    async provideTextContent(resource) {
        const existing = this._modelService.getModel(resource);
        if (existing) {
            return existing;
        }
        const data = CellUri.parse(resource);
        // const data = parseCellUri(resource);
        if (!data) {
            return null;
        }
        const ref = await this._notebookModelResolverService.resolve(data.notebook);
        let result = null;
        if (!ref.object.isResolved()) {
            return null;
        }
        for (const cell of ref.object.notebook.cells) {
            if (cell.uri.toString() === resource.toString()) {
                const bufferFactory = {
                    create: (defaultEOL) => {
                        return { textBuffer: cell.textBuffer, disposable: Disposable.None };
                    },
                    getFirstLineText: (limit) => {
                        return cell.textBuffer.getLineContent(1).substring(0, limit);
                    }
                };
                const languageId = this._languageService.getLanguageIdByLanguageName(cell.language);
                const languageSelection = languageId ? this._languageService.createById(languageId) : (cell.cellKind === CellKind.Markup ? this._languageService.createById('markdown') : this._languageService.createByFilepathOrFirstLine(resource, cell.textBuffer.getLineContent(1)));
                result = this._modelService.createModel(bufferFactory, languageSelection, resource);
                break;
            }
        }
        if (!result) {
            ref.dispose();
            return null;
        }
        const once = Event.any(result.onWillDispose, ref.object.notebook.onWillDispose)(() => {
            once.dispose();
            ref.dispose();
        });
        return result;
    }
};
CellContentProvider = __decorate([
    __param(0, ITextModelService),
    __param(1, IModelService),
    __param(2, ILanguageService),
    __param(3, INotebookEditorModelResolverService)
], CellContentProvider);
let CellInfoContentProvider = class CellInfoContentProvider {
    static { this.ID = 'workbench.contrib.cellInfoContentProvider'; }
    constructor(textModelService, _modelService, _languageService, _labelService, _notebookModelResolverService) {
        this._modelService = _modelService;
        this._languageService = _languageService;
        this._labelService = _labelService;
        this._notebookModelResolverService = _notebookModelResolverService;
        this._disposables = [];
        this._disposables.push(textModelService.registerTextModelContentProvider(Schemas.vscodeNotebookCellMetadata, {
            provideTextContent: this.provideMetadataTextContent.bind(this)
        }));
        this._disposables.push(textModelService.registerTextModelContentProvider(Schemas.vscodeNotebookCellOutput, {
            provideTextContent: this.provideOutputTextContent.bind(this)
        }));
        this._disposables.push(this._labelService.registerFormatter({
            scheme: Schemas.vscodeNotebookCellMetadata,
            formatting: {
                label: '${path} (metadata)',
                separator: '/'
            }
        }));
        this._disposables.push(this._labelService.registerFormatter({
            scheme: Schemas.vscodeNotebookCellOutput,
            formatting: {
                label: '${path} (output)',
                separator: '/'
            }
        }));
    }
    dispose() {
        dispose(this._disposables);
    }
    async provideMetadataTextContent(resource) {
        const existing = this._modelService.getModel(resource);
        if (existing) {
            return existing;
        }
        const data = CellUri.parseCellPropertyUri(resource, Schemas.vscodeNotebookCellMetadata);
        if (!data) {
            return null;
        }
        const ref = await this._notebookModelResolverService.resolve(data.notebook);
        let result = null;
        const mode = this._languageService.createById('json');
        const disposables = new DisposableStore();
        for (const cell of ref.object.notebook.cells) {
            if (cell.handle === data.handle) {
                const cellIndex = ref.object.notebook.cells.indexOf(cell);
                const metadataSource = getFormattedMetadataJSON(ref.object.notebook.transientOptions.transientCellMetadata, cell.metadata, cell.language, true);
                result = this._modelService.createModel(metadataSource, mode, resource);
                this._disposables.push(disposables.add(ref.object.notebook.onDidChangeContent(e => {
                    if (result && e.rawEvents.some(event => (event.kind === NotebookCellsChangeType.ChangeCellMetadata || event.kind === NotebookCellsChangeType.ChangeCellLanguage) && event.index === cellIndex)) {
                        const value = getFormattedMetadataJSON(ref.object.notebook.transientOptions.transientCellMetadata, cell.metadata, cell.language, true);
                        if (result.getValue() !== value) {
                            result.setValue(value);
                        }
                    }
                })));
                break;
            }
        }
        if (!result) {
            ref.dispose();
            return null;
        }
        const once = result.onWillDispose(() => {
            disposables.dispose();
            once.dispose();
            ref.dispose();
        });
        return result;
    }
    parseStreamOutput(op) {
        if (!op) {
            return;
        }
        const streamOutputData = getStreamOutputData(op.outputs);
        if (streamOutputData) {
            return {
                content: streamOutputData,
                mode: this._languageService.createById(PLAINTEXT_LANGUAGE_ID)
            };
        }
        return;
    }
    _getResult(data, cell) {
        let result = undefined;
        const mode = this._languageService.createById('json');
        const op = cell.outputs.find(op => op.outputId === data.outputId || op.alternativeOutputId === data.outputId);
        const streamOutputData = this.parseStreamOutput(op);
        if (streamOutputData) {
            result = streamOutputData;
            return result;
        }
        const obj = cell.outputs.map(output => ({
            metadata: output.metadata,
            outputItems: output.outputs.map(opit => ({
                mimeType: opit.mime,
                data: opit.data.toString()
            }))
        }));
        const outputSource = toFormattedString(obj, {});
        result = {
            content: outputSource,
            mode
        };
        return result;
    }
    async provideOutputsTextContent(resource) {
        const existing = this._modelService.getModel(resource);
        if (existing) {
            return existing;
        }
        const data = CellUri.parseCellPropertyUri(resource, Schemas.vscodeNotebookCellOutput);
        if (!data) {
            return null;
        }
        const ref = await this._notebookModelResolverService.resolve(data.notebook);
        const cell = ref.object.notebook.cells.find(cell => cell.handle === data.handle);
        if (!cell) {
            ref.dispose();
            return null;
        }
        const mode = this._languageService.createById('json');
        const model = this._modelService.createModel(getFormattedOutputJSON(cell.outputs || []), mode, resource, true);
        const cellModelListener = Event.any(cell.onDidChangeOutputs ?? Event.None, cell.onDidChangeOutputItems ?? Event.None)(() => {
            model.setValue(getFormattedOutputJSON(cell.outputs || []));
        });
        const once = model.onWillDispose(() => {
            once.dispose();
            cellModelListener.dispose();
            ref.dispose();
        });
        return model;
    }
    async provideOutputTextContent(resource) {
        const existing = this._modelService.getModel(resource);
        if (existing) {
            return existing;
        }
        const data = CellUri.parseCellOutputUri(resource);
        if (!data) {
            return this.provideOutputsTextContent(resource);
        }
        const ref = await this._notebookModelResolverService.resolve(data.notebook);
        const cell = ref.object.notebook.cells.find(cell => !!cell.outputs.find(op => op.outputId === data.outputId || op.alternativeOutputId === data.outputId));
        if (!cell) {
            ref.dispose();
            return null;
        }
        const result = this._getResult(data, cell);
        if (!result) {
            ref.dispose();
            return null;
        }
        const model = this._modelService.createModel(result.content, result.mode, resource);
        const cellModelListener = Event.any(cell.onDidChangeOutputs ?? Event.None, cell.onDidChangeOutputItems ?? Event.None)(() => {
            const newResult = this._getResult(data, cell);
            if (!newResult) {
                return;
            }
            model.setValue(newResult.content);
            model.setLanguage(newResult.mode.languageId);
        });
        const once = model.onWillDispose(() => {
            once.dispose();
            cellModelListener.dispose();
            ref.dispose();
        });
        return model;
    }
};
CellInfoContentProvider = __decorate([
    __param(0, ITextModelService),
    __param(1, IModelService),
    __param(2, ILanguageService),
    __param(3, ILabelService),
    __param(4, INotebookEditorModelResolverService)
], CellInfoContentProvider);
let NotebookMetadataContentProvider = class NotebookMetadataContentProvider {
    static { this.ID = 'workbench.contrib.notebookMetadataContentProvider'; }
    constructor(textModelService, _modelService, _languageService, _labelService, _notebookModelResolverService) {
        this._modelService = _modelService;
        this._languageService = _languageService;
        this._labelService = _labelService;
        this._notebookModelResolverService = _notebookModelResolverService;
        this._disposables = [];
        this._disposables.push(textModelService.registerTextModelContentProvider(Schemas.vscodeNotebookMetadata, {
            provideTextContent: this.provideMetadataTextContent.bind(this)
        }));
        this._disposables.push(this._labelService.registerFormatter({
            scheme: Schemas.vscodeNotebookMetadata,
            formatting: {
                label: '${path} (metadata)',
                separator: '/'
            }
        }));
    }
    dispose() {
        dispose(this._disposables);
    }
    async provideMetadataTextContent(resource) {
        const existing = this._modelService.getModel(resource);
        if (existing) {
            return existing;
        }
        const data = NotebookMetadataUri.parse(resource);
        if (!data) {
            return null;
        }
        const ref = await this._notebookModelResolverService.resolve(data);
        let result = null;
        const mode = this._languageService.createById('json');
        const disposables = new DisposableStore();
        const metadataSource = getFormattedNotebookMetadataJSON(ref.object.notebook.transientOptions.transientDocumentMetadata, ref.object.notebook.metadata);
        result = this._modelService.createModel(metadataSource, mode, resource);
        if (!result) {
            ref.dispose();
            return null;
        }
        this._disposables.push(disposables.add(ref.object.notebook.onDidChangeContent(e => {
            if (result && e.rawEvents.some(event => (event.kind === NotebookCellsChangeType.ChangeCellContent || event.kind === NotebookCellsChangeType.ChangeDocumentMetadata || event.kind === NotebookCellsChangeType.ModelChange))) {
                const value = getFormattedNotebookMetadataJSON(ref.object.notebook.transientOptions.transientDocumentMetadata, ref.object.notebook.metadata);
                if (result.getValue() !== value) {
                    result.setValue(value);
                }
            }
        })));
        const once = result.onWillDispose(() => {
            disposables.dispose();
            once.dispose();
            ref.dispose();
        });
        return result;
    }
};
NotebookMetadataContentProvider = __decorate([
    __param(0, ITextModelService),
    __param(1, IModelService),
    __param(2, ILanguageService),
    __param(3, ILabelService),
    __param(4, INotebookEditorModelResolverService)
], NotebookMetadataContentProvider);
class RegisterSchemasContribution extends Disposable {
    static { this.ID = 'workbench.contrib.registerCellSchemas'; }
    constructor() {
        super();
        this.registerMetadataSchemas();
    }
    registerMetadataSchemas() {
        const jsonRegistry = Registry.as(JSONExtensions.JSONContribution);
        const metadataSchema = {
            properties: {
                ['language']: {
                    type: 'string',
                    description: 'The language for the cell'
                }
            },
            // patternProperties: allSettings.patternProperties,
            additionalProperties: true,
            allowTrailingCommas: true,
            allowComments: true
        };
        jsonRegistry.registerSchema('vscode://schemas/notebook/cellmetadata', metadataSchema);
    }
}
let NotebookEditorManager = class NotebookEditorManager {
    static { this.ID = 'workbench.contrib.notebookEditorManager'; }
    constructor(_editorService, _notebookEditorModelService, editorGroups) {
        this._editorService = _editorService;
        this._notebookEditorModelService = _notebookEditorModelService;
        this._disposables = new DisposableStore();
        this._disposables.add(Event.debounce(this._notebookEditorModelService.onDidChangeDirty, (last, current) => !last ? [current] : [...last, current], 100)(this._openMissingDirtyNotebookEditors, this));
        // CLOSE editors when we are about to open conflicting notebooks
        this._disposables.add(_notebookEditorModelService.onWillFailWithConflict(e => {
            for (const group of editorGroups.groups) {
                const conflictInputs = group.editors.filter(input => input instanceof NotebookEditorInput && input.viewType !== e.viewType && isEqual(input.resource, e.resource));
                const p = group.closeEditors(conflictInputs);
                e.waitUntil(p);
            }
        }));
    }
    dispose() {
        this._disposables.dispose();
    }
    _openMissingDirtyNotebookEditors(models) {
        const result = [];
        for (const model of models) {
            if (model.isDirty() && !this._editorService.isOpened({ resource: model.resource, typeId: NotebookEditorInput.ID, editorId: model.viewType }) && extname(model.resource) !== '.interactive') {
                result.push({
                    resource: model.resource,
                    options: { inactive: true, preserveFocus: true, pinned: true, override: model.viewType }
                });
            }
        }
        if (result.length > 0) {
            this._editorService.openEditors(result);
        }
    }
};
NotebookEditorManager = __decorate([
    __param(0, IEditorService),
    __param(1, INotebookEditorModelResolverService),
    __param(2, IEditorGroupsService)
], NotebookEditorManager);
let SimpleNotebookWorkingCopyEditorHandler = class SimpleNotebookWorkingCopyEditorHandler extends Disposable {
    static { this.ID = 'workbench.contrib.simpleNotebookWorkingCopyEditorHandler'; }
    constructor(_instantiationService, _workingCopyEditorService, _extensionService, _notebookService) {
        super();
        this._instantiationService = _instantiationService;
        this._workingCopyEditorService = _workingCopyEditorService;
        this._extensionService = _extensionService;
        this._notebookService = _notebookService;
        this._installHandler();
    }
    async handles(workingCopy) {
        const viewType = this.handlesSync(workingCopy);
        if (!viewType) {
            return false;
        }
        return this._notebookService.canResolve(viewType);
    }
    handlesSync(workingCopy) {
        const viewType = this._getViewType(workingCopy);
        if (!viewType || viewType === 'interactive') {
            return undefined;
        }
        return viewType;
    }
    isOpen(workingCopy, editor) {
        if (!this.handlesSync(workingCopy)) {
            return false;
        }
        return editor instanceof NotebookEditorInput && editor.viewType === this._getViewType(workingCopy) && isEqual(workingCopy.resource, editor.resource);
    }
    createEditor(workingCopy) {
        return NotebookEditorInput.getOrCreate(this._instantiationService, workingCopy.resource, undefined, this._getViewType(workingCopy));
    }
    async _installHandler() {
        await this._extensionService.whenInstalledExtensionsRegistered();
        this._register(this._workingCopyEditorService.registerHandler(this));
    }
    _getViewType(workingCopy) {
        const notebookType = NotebookWorkingCopyTypeIdentifier.parse(workingCopy.typeId);
        if (notebookType && notebookType.viewType === notebookType.notebookType) {
            return notebookType?.viewType;
        }
        return undefined;
    }
};
SimpleNotebookWorkingCopyEditorHandler = __decorate([
    __param(0, IInstantiationService),
    __param(1, IWorkingCopyEditorService),
    __param(2, IExtensionService),
    __param(3, INotebookService)
], SimpleNotebookWorkingCopyEditorHandler);
let NotebookLanguageSelectorScoreRefine = class NotebookLanguageSelectorScoreRefine {
    static { this.ID = 'workbench.contrib.notebookLanguageSelectorScoreRefine'; }
    constructor(_notebookService, languageFeaturesService) {
        this._notebookService = _notebookService;
        languageFeaturesService.setNotebookTypeResolver(this._getNotebookInfo.bind(this));
    }
    _getNotebookInfo(uri) {
        const cellUri = CellUri.parse(uri);
        if (!cellUri) {
            return undefined;
        }
        const notebook = this._notebookService.getNotebookTextModel(cellUri.notebook);
        if (!notebook) {
            return undefined;
        }
        return {
            uri: notebook.uri,
            type: notebook.viewType
        };
    }
};
NotebookLanguageSelectorScoreRefine = __decorate([
    __param(0, INotebookService),
    __param(1, ILanguageFeaturesService)
], NotebookLanguageSelectorScoreRefine);
const workbenchContributionsRegistry = Registry.as(WorkbenchExtensions.Workbench);
registerWorkbenchContribution2(NotebookContribution.ID, NotebookContribution, 1 /* WorkbenchPhase.BlockStartup */);
registerWorkbenchContribution2(CellContentProvider.ID, CellContentProvider, 1 /* WorkbenchPhase.BlockStartup */);
registerWorkbenchContribution2(CellInfoContentProvider.ID, CellInfoContentProvider, 1 /* WorkbenchPhase.BlockStartup */);
registerWorkbenchContribution2(NotebookMetadataContentProvider.ID, NotebookMetadataContentProvider, 1 /* WorkbenchPhase.BlockStartup */);
registerWorkbenchContribution2(RegisterSchemasContribution.ID, RegisterSchemasContribution, 1 /* WorkbenchPhase.BlockStartup */);
registerWorkbenchContribution2(NotebookEditorManager.ID, NotebookEditorManager, 2 /* WorkbenchPhase.BlockRestore */);
registerWorkbenchContribution2(NotebookLanguageSelectorScoreRefine.ID, NotebookLanguageSelectorScoreRefine, 2 /* WorkbenchPhase.BlockRestore */);
registerWorkbenchContribution2(SimpleNotebookWorkingCopyEditorHandler.ID, SimpleNotebookWorkingCopyEditorHandler, 2 /* WorkbenchPhase.BlockRestore */);
workbenchContributionsRegistry.registerWorkbenchContribution(NotebookVariables, 4 /* LifecyclePhase.Eventually */);
AccessibleViewRegistry.register(new NotebookAccessibleView());
AccessibleViewRegistry.register(new NotebookAccessibilityHelp());
registerSingleton(INotebookService, NotebookService, 1 /* InstantiationType.Delayed */);
registerSingleton(INotebookEditorWorkerService, NotebookEditorWorkerServiceImpl, 1 /* InstantiationType.Delayed */);
registerSingleton(INotebookEditorModelResolverService, NotebookModelResolverServiceImpl, 1 /* InstantiationType.Delayed */);
registerSingleton(INotebookCellStatusBarService, NotebookCellStatusBarService, 1 /* InstantiationType.Delayed */);
registerSingleton(INotebookEditorService, NotebookEditorWidgetService, 1 /* InstantiationType.Delayed */);
registerSingleton(INotebookKernelService, NotebookKernelService, 1 /* InstantiationType.Delayed */);
registerSingleton(INotebookKernelHistoryService, NotebookKernelHistoryService, 1 /* InstantiationType.Delayed */);
registerSingleton(INotebookExecutionService, NotebookExecutionService, 1 /* InstantiationType.Delayed */);
registerSingleton(INotebookExecutionStateService, NotebookExecutionStateService, 1 /* InstantiationType.Delayed */);
registerSingleton(INotebookRendererMessagingService, NotebookRendererMessagingService, 1 /* InstantiationType.Delayed */);
registerSingleton(INotebookKeymapService, NotebookKeymapService, 1 /* InstantiationType.Delayed */);
registerSingleton(INotebookLoggingService, NotebookLoggingService, 1 /* InstantiationType.Delayed */);
registerSingleton(INotebookCellOutlineDataSourceFactory, NotebookCellOutlineDataSourceFactory, 1 /* InstantiationType.Delayed */);
registerSingleton(INotebookOutlineEntryFactory, NotebookOutlineEntryFactory, 1 /* InstantiationType.Delayed */);
const schemas = {};
function isConfigurationPropertySchema(x) {
    return (typeof x.type !== 'undefined' || typeof x.anyOf !== 'undefined');
}
for (const editorOption of editorOptionsRegistry) {
    const schema = editorOption.schema;
    if (schema) {
        if (isConfigurationPropertySchema(schema)) {
            schemas[`editor.${editorOption.name}`] = schema;
        }
        else {
            for (const key in schema) {
                if (Object.hasOwnProperty.call(schema, key)) {
                    schemas[key] = schema[key];
                }
            }
        }
    }
}
const editorOptionsCustomizationSchema = {
    description: nls.localize('notebook.editorOptions.experimentalCustomization', 'Settings for code editors used in notebooks. This can be used to customize most editor.* settings.'),
    default: {},
    allOf: [
        {
            properties: schemas,
        }
        // , {
        // 	patternProperties: {
        // 		'^\\[.*\\]$': {
        // 			type: 'object',
        // 			default: {},
        // 			properties: schemas
        // 		}
        // 	}
        // }
    ],
    tags: ['notebookLayout']
};
const configurationRegistry = Registry.as(Extensions.Configuration);
configurationRegistry.registerConfiguration({
    id: 'notebook',
    order: 100,
    title: nls.localize('notebookConfigurationTitle', "Notebook"),
    type: 'object',
    properties: {
        [NotebookSetting.displayOrder]: {
            description: nls.localize('notebook.displayOrder.description', "Priority list for output mime types"),
            type: 'array',
            items: {
                type: 'string'
            },
            default: []
        },
        [NotebookSetting.cellToolbarLocation]: {
            description: nls.localize('notebook.cellToolbarLocation.description', "Where the cell toolbar should be shown, or whether it should be hidden."),
            type: 'object',
            additionalProperties: {
                markdownDescription: nls.localize('notebook.cellToolbarLocation.viewType', "Configure the cell toolbar position for for specific file types"),
                type: 'string',
                enum: ['left', 'right', 'hidden']
            },
            default: {
                'default': 'right'
            },
            tags: ['notebookLayout']
        },
        [NotebookSetting.showCellStatusBar]: {
            description: nls.localize('notebook.showCellStatusbar.description', "Whether the cell status bar should be shown."),
            type: 'string',
            enum: ['hidden', 'visible', 'visibleAfterExecute'],
            enumDescriptions: [
                nls.localize('notebook.showCellStatusbar.hidden.description', "The cell status bar is always hidden."),
                nls.localize('notebook.showCellStatusbar.visible.description', "The cell status bar is always visible."),
                nls.localize('notebook.showCellStatusbar.visibleAfterExecute.description', "The cell status bar is hidden until the cell has executed. Then it becomes visible to show the execution status.")
            ],
            default: 'visible',
            tags: ['notebookLayout']
        },
        [NotebookSetting.cellExecutionTimeVerbosity]: {
            description: nls.localize('notebook.cellExecutionTimeVerbosity.description', "Controls the verbosity of the cell execution time in the cell status bar."),
            type: 'string',
            enum: ['default', 'verbose'],
            enumDescriptions: [
                nls.localize('notebook.cellExecutionTimeVerbosity.default.description', "The cell execution duration is visible, with advanced information in the hover tooltip."),
                nls.localize('notebook.cellExecutionTimeVerbosity.verbose.description', "The cell last execution timestamp and duration are visible, with advanced information in the hover tooltip.")
            ],
            default: 'default',
            tags: ['notebookLayout']
        },
        [NotebookSetting.textDiffEditorPreview]: {
            description: nls.localize('notebook.diff.enablePreview.description', "Whether to use the enhanced text diff editor for notebook."),
            type: 'boolean',
            default: true,
            tags: ['notebookLayout']
        },
        [NotebookSetting.diffOverviewRuler]: {
            description: nls.localize('notebook.diff.enableOverviewRuler.description', "Whether to render the overview ruler in the diff editor for notebook."),
            type: 'boolean',
            default: false,
            tags: ['notebookLayout']
        },
        [NotebookSetting.cellToolbarVisibility]: {
            markdownDescription: nls.localize('notebook.cellToolbarVisibility.description', "Whether the cell toolbar should appear on hover or click."),
            type: 'string',
            enum: ['hover', 'click'],
            default: 'click',
            tags: ['notebookLayout']
        },
        [NotebookSetting.undoRedoPerCell]: {
            description: nls.localize('notebook.undoRedoPerCell.description', "Whether to use separate undo/redo stack for each cell."),
            type: 'boolean',
            default: true,
            tags: ['notebookLayout']
        },
        [NotebookSetting.compactView]: {
            description: nls.localize('notebook.compactView.description', "Control whether the notebook editor should be rendered in a compact form. For example, when turned on, it will decrease the left margin width."),
            type: 'boolean',
            default: true,
            tags: ['notebookLayout']
        },
        [NotebookSetting.focusIndicator]: {
            description: nls.localize('notebook.focusIndicator.description', "Controls where the focus indicator is rendered, either along the cell borders or on the left gutter."),
            type: 'string',
            enum: ['border', 'gutter'],
            default: 'gutter',
            tags: ['notebookLayout']
        },
        [NotebookSetting.insertToolbarLocation]: {
            description: nls.localize('notebook.insertToolbarPosition.description', "Control where the insert cell actions should appear."),
            type: 'string',
            enum: ['betweenCells', 'notebookToolbar', 'both', 'hidden'],
            enumDescriptions: [
                nls.localize('insertToolbarLocation.betweenCells', "A toolbar that appears on hover between cells."),
                nls.localize('insertToolbarLocation.notebookToolbar', "The toolbar at the top of the notebook editor."),
                nls.localize('insertToolbarLocation.both', "Both toolbars."),
                nls.localize('insertToolbarLocation.hidden', "The insert actions don't appear anywhere."),
            ],
            default: 'both',
            tags: ['notebookLayout']
        },
        [NotebookSetting.globalToolbar]: {
            description: nls.localize('notebook.globalToolbar.description', "Control whether to render a global toolbar inside the notebook editor."),
            type: 'boolean',
            default: true,
            tags: ['notebookLayout']
        },
        [NotebookSetting.stickyScrollEnabled]: {
            description: nls.localize('notebook.stickyScrollEnabled.description', "Experimental. Control whether to render notebook Sticky Scroll headers in the notebook editor."),
            type: 'boolean',
            default: false,
            tags: ['notebookLayout']
        },
        [NotebookSetting.stickyScrollMode]: {
            description: nls.localize('notebook.stickyScrollMode.description', "Control whether nested sticky lines appear to stack flat or indented."),
            type: 'string',
            enum: ['flat', 'indented'],
            enumDescriptions: [
                nls.localize('notebook.stickyScrollMode.flat', "Nested sticky lines appear flat."),
                nls.localize('notebook.stickyScrollMode.indented', "Nested sticky lines appear indented."),
            ],
            default: 'indented',
            tags: ['notebookLayout']
        },
        [NotebookSetting.consolidatedOutputButton]: {
            description: nls.localize('notebook.consolidatedOutputButton.description', "Control whether outputs action should be rendered in the output toolbar."),
            type: 'boolean',
            default: true,
            tags: ['notebookLayout']
        },
        // [NotebookSetting.openOutputInPreviewEditor]: {
        // 	description: nls.localize('notebook.output.openInPreviewEditor.description', "Controls whether or not the action to open a cell output in a preview editor is enabled. This action can be used via the cell output menu."),
        // 	type: 'boolean',
        // 	default: false,
        // 	tags: ['preview']
        // },
        [NotebookSetting.showFoldingControls]: {
            description: nls.localize('notebook.showFoldingControls.description', "Controls when the Markdown header folding arrow is shown."),
            type: 'string',
            enum: ['always', 'never', 'mouseover'],
            enumDescriptions: [
                nls.localize('showFoldingControls.always', "The folding controls are always visible."),
                nls.localize('showFoldingControls.never', "Never show the folding controls and reduce the gutter size."),
                nls.localize('showFoldingControls.mouseover', "The folding controls are visible only on mouseover."),
            ],
            default: 'mouseover',
            tags: ['notebookLayout']
        },
        [NotebookSetting.dragAndDropEnabled]: {
            description: nls.localize('notebook.dragAndDrop.description', "Control whether the notebook editor should allow moving cells through drag and drop."),
            type: 'boolean',
            default: true,
            tags: ['notebookLayout']
        },
        [NotebookSetting.consolidatedRunButton]: {
            description: nls.localize('notebook.consolidatedRunButton.description', "Control whether extra actions are shown in a dropdown next to the run button."),
            type: 'boolean',
            default: false,
            tags: ['notebookLayout']
        },
        [NotebookSetting.globalToolbarShowLabel]: {
            description: nls.localize('notebook.globalToolbarShowLabel', "Control whether the actions on the notebook toolbar should render label or not."),
            type: 'string',
            enum: ['always', 'never', 'dynamic'],
            default: 'always',
            tags: ['notebookLayout']
        },
        [NotebookSetting.textOutputLineLimit]: {
            markdownDescription: nls.localize('notebook.textOutputLineLimit', "Controls how many lines of text are displayed in a text output. If {0} is enabled, this setting is used to determine the scroll height of the output.", '`#notebook.output.scrolling#`'),
            type: 'number',
            default: 30,
            tags: ['notebookLayout', 'notebookOutputLayout'],
            minimum: 1,
        },
        [NotebookSetting.LinkifyOutputFilePaths]: {
            description: nls.localize('notebook.disableOutputFilePathLinks', "Control whether to disable filepath links in the output of notebook cells."),
            type: 'boolean',
            default: true,
            tags: ['notebookOutputLayout']
        },
        [NotebookSetting.minimalErrorRendering]: {
            description: nls.localize('notebook.minimalErrorRendering', "Control whether to render error output in a minimal style."),
            type: 'boolean',
            default: false,
            tags: ['notebookOutputLayout']
        },
        [NotebookSetting.markupFontSize]: {
            markdownDescription: nls.localize('notebook.markup.fontSize', "Controls the font size in pixels of rendered markup in notebooks. When set to {0}, 120% of {1} is used.", '`0`', '`#editor.fontSize#`'),
            type: 'number',
            default: 0,
            tags: ['notebookLayout']
        },
        [NotebookSetting.markdownLineHeight]: {
            markdownDescription: nls.localize('notebook.markdown.lineHeight', "Controls the line height in pixels of markdown cells in notebooks. When set to {0}, {1} will be used", '`0`', '`normal`'),
            type: 'number',
            default: 0,
            tags: ['notebookLayout']
        },
        [NotebookSetting.cellEditorOptionsCustomizations]: editorOptionsCustomizationSchema,
        [NotebookSetting.interactiveWindowCollapseCodeCells]: {
            markdownDescription: nls.localize('notebook.interactiveWindow.collapseCodeCells', "Controls whether code cells in the interactive window are collapsed by default."),
            type: 'string',
            enum: ['always', 'never', 'fromEditor'],
            default: 'fromEditor'
        },
        [NotebookSetting.outputLineHeight]: {
            markdownDescription: nls.localize('notebook.outputLineHeight', "Line height of the output text within notebook cells.\n - When set to 0, editor line height is used.\n - Values between 0 and 8 will be used as a multiplier with the font size.\n - Values greater than or equal to 8 will be used as effective values."),
            type: 'number',
            default: 0,
            tags: ['notebookLayout', 'notebookOutputLayout']
        },
        [NotebookSetting.outputFontSize]: {
            markdownDescription: nls.localize('notebook.outputFontSize', "Font size for the output text within notebook cells. When set to 0, {0} is used.", '`#editor.fontSize#`'),
            type: 'number',
            default: 0,
            tags: ['notebookLayout', 'notebookOutputLayout']
        },
        [NotebookSetting.outputFontFamily]: {
            markdownDescription: nls.localize('notebook.outputFontFamily', "The font family of the output text within notebook cells. When set to empty, the {0} is used.", '`#editor.fontFamily#`'),
            type: 'string',
            tags: ['notebookLayout', 'notebookOutputLayout']
        },
        [NotebookSetting.outputScrolling]: {
            markdownDescription: nls.localize('notebook.outputScrolling', "Initially render notebook outputs in a scrollable region when longer than the limit."),
            type: 'boolean',
            tags: ['notebookLayout', 'notebookOutputLayout'],
            default: typeof product.quality === 'string' && product.quality !== 'stable' // only enable as default in insiders
        },
        [NotebookSetting.outputWordWrap]: {
            markdownDescription: nls.localize('notebook.outputWordWrap', "Controls whether the lines in output should wrap."),
            type: 'boolean',
            tags: ['notebookLayout', 'notebookOutputLayout'],
            default: false
        },
        [NotebookSetting.defaultFormatter]: {
            description: nls.localize('notebookFormatter.default', "Defines a default notebook formatter which takes precedence over all other formatter settings. Must be the identifier of an extension contributing a formatter."),
            type: ['string', 'null'],
            default: null,
            enum: DefaultFormatter.extensionIds,
            enumItemLabels: DefaultFormatter.extensionItemLabels,
            markdownEnumDescriptions: DefaultFormatter.extensionDescriptions
        },
        [NotebookSetting.formatOnSave]: {
            markdownDescription: nls.localize('notebook.formatOnSave', "Format a notebook on save. A formatter must be available and the editor must not be shutting down. When {0} is set to `afterDelay`, the file will only be formatted when saved explicitly.", '`#files.autoSave#`'),
            type: 'boolean',
            tags: ['notebookLayout'],
            default: false
        },
        [NotebookSetting.insertFinalNewline]: {
            markdownDescription: nls.localize('notebook.insertFinalNewline', "When enabled, insert a final new line into the end of code cells when saving a notebook."),
            type: 'boolean',
            tags: ['notebookLayout'],
            default: false
        },
        [NotebookSetting.formatOnCellExecution]: {
            markdownDescription: nls.localize('notebook.formatOnCellExecution', "Format a notebook cell upon execution. A formatter must be available."),
            type: 'boolean',
            default: false
        },
        [NotebookSetting.confirmDeleteRunningCell]: {
            markdownDescription: nls.localize('notebook.confirmDeleteRunningCell', "Control whether a confirmation prompt is required to delete a running cell."),
            type: 'boolean',
            default: true
        },
        [NotebookSetting.findFilters]: {
            markdownDescription: nls.localize('notebook.findFilters', "Customize the Find Widget behavior for searching within notebook cells. When both markup source and markup preview are enabled, the Find Widget will search either the source code or preview based on the current state of the cell."),
            type: 'object',
            properties: {
                markupSource: {
                    type: 'boolean',
                    default: true
                },
                markupPreview: {
                    type: 'boolean',
                    default: true
                },
                codeSource: {
                    type: 'boolean',
                    default: true
                },
                codeOutput: {
                    type: 'boolean',
                    default: true
                }
            },
            default: {
                markupSource: true,
                markupPreview: true,
                codeSource: true,
                codeOutput: true
            },
            tags: ['notebookLayout']
        },
        [NotebookSetting.remoteSaving]: {
            markdownDescription: nls.localize('notebook.remoteSaving', "Enables the incremental saving of notebooks between processes and across Remote connections. When enabled, only the changes to the notebook are sent to the extension host, improving performance for large notebooks and slow network connections."),
            type: 'boolean',
            default: typeof product.quality === 'string' && product.quality !== 'stable', // only enable as default in insiders
            tags: ['experimental']
        },
        [NotebookSetting.scrollToRevealCell]: {
            markdownDescription: nls.localize('notebook.scrolling.revealNextCellOnExecute.description', "How far to scroll when revealing the next cell upon running {0}.", 'notebook.cell.executeAndSelectBelow'),
            type: 'string',
            enum: ['fullCell', 'firstLine', 'none'],
            markdownEnumDescriptions: [
                nls.localize('notebook.scrolling.revealNextCellOnExecute.fullCell.description', 'Scroll to fully reveal the next cell.'),
                nls.localize('notebook.scrolling.revealNextCellOnExecute.firstLine.description', 'Scroll to reveal the first line of the next cell.'),
                nls.localize('notebook.scrolling.revealNextCellOnExecute.none.description', 'Do not scroll.'),
            ],
            default: 'fullCell'
        },
        [NotebookSetting.cellGenerate]: {
            markdownDescription: nls.localize('notebook.cellGenerate', "Enable experimental generate action to create code cell with inline chat enabled."),
            type: 'boolean',
            default: true
        },
        [NotebookSetting.notebookVariablesView]: {
            markdownDescription: nls.localize('notebook.VariablesView.description', "Enable the experimental notebook variables view within the debug panel."),
            type: 'boolean',
            default: false
        },
        [NotebookSetting.notebookInlineValues]: {
            markdownDescription: nls.localize('notebook.inlineValues.description', "Control whether to show inline values within notebook code cells after cell execution. Values will remain until the cell is edited, re-executed, or explicitly cleared via the Clear All Outputs toolbar button or the `Notebook: Clear Inline Values` command."),
            type: 'string',
            enum: ['on', 'auto', 'off'],
            enumDescriptions: [
                nls.localize('notebook.inlineValues.on', "Always show inline values, with a regex fallback if no inline value provider is registered. Note: There may be a performance impact in larger cells if the fallback is used."),
                nls.localize('notebook.inlineValues.auto', "Show inline values only when an inline value provider is registered."),
                nls.localize('notebook.inlineValues.off', "Never show inline values."),
            ],
            default: 'off'
        },
        [NotebookSetting.cellFailureDiagnostics]: {
            markdownDescription: nls.localize('notebook.cellFailureDiagnostics', "Show available diagnostics for cell failures."),
            type: 'boolean',
            default: true
        },
        [NotebookSetting.outputBackupSizeLimit]: {
            markdownDescription: nls.localize('notebook.backup.sizeLimit', "The limit of notebook output size in kilobytes (KB) where notebook files will no longer be backed up for hot reload. Use 0 for unlimited."),
            type: 'number',
            default: 10000
        },
        [NotebookSetting.multiCursor]: {
            markdownDescription: nls.localize('notebook.multiCursor.enabled', "Experimental. Enables a limited set of multi cursor controls across multiple cells in the notebook editor. Currently supported are core editor actions (typing/cut/copy/paste/composition) and a limited subset of editor commands."),
            type: 'boolean',
            default: false
        },
        [NotebookSetting.markupFontFamily]: {
            markdownDescription: nls.localize('notebook.markup.fontFamily', "Controls the font family of rendered markup in notebooks. When left blank, this will fall back to the default workbench font family."),
            type: 'string',
            default: '',
            tags: ['notebookLayout']
        }
    }
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibm90ZWJvb2suY29udHJpYnV0aW9uLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvbm90ZWJvb2svYnJvd3Nlci9ub3RlYm9vay5jb250cmlidXRpb24udHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7O0FBRWhHLE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSxvQ0FBb0MsQ0FBQztBQUM3RCxPQUFPLEVBQWUsVUFBVSxFQUFFLGVBQWUsRUFBRSxPQUFPLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUN6RyxPQUFPLEVBQUUsS0FBSyxFQUFFLE1BQU0sd0NBQXdDLENBQUM7QUFDL0QsT0FBTyxFQUFFLE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUN4RSxPQUFPLEVBQUUsVUFBVSxFQUFFLE1BQU0sa0NBQWtDLENBQUM7QUFDOUQsT0FBTyxFQUFFLEdBQUcsRUFBRSxNQUFNLGdDQUFnQyxDQUFDO0FBQ3JELE9BQU8sRUFBRSxpQkFBaUIsRUFBRSxNQUFNLDBDQUEwQyxDQUFDO0FBRTdFLE9BQU8sRUFBRSxhQUFhLEVBQUUsTUFBTSw2Q0FBNkMsQ0FBQztBQUM1RSxPQUFPLEVBQXNCLGdCQUFnQixFQUFFLE1BQU0saURBQWlELENBQUM7QUFDdkcsT0FBTyxFQUE2QixpQkFBaUIsRUFBRSxNQUFNLHVEQUF1RCxDQUFDO0FBQ3JILE9BQU8sS0FBSyxHQUFHLE1BQU0sb0JBQW9CLENBQUM7QUFDMUMsT0FBTyxFQUFFLFVBQVUsRUFBd0QsTUFBTSxvRUFBb0UsQ0FBQztBQUN0SixPQUFPLEVBQUUsY0FBYyxFQUFFLE1BQU0sMERBQTBELENBQUM7QUFDMUYsT0FBTyxFQUFxQixpQkFBaUIsRUFBRSxNQUFNLHlEQUF5RCxDQUFDO0FBQy9HLE9BQU8sRUFBRSxxQkFBcUIsRUFBRSxNQUFNLDRE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