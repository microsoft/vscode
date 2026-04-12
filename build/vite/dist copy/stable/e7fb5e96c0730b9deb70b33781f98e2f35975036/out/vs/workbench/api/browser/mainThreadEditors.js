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
var MainThreadTextEditors_1;
import { illegalArgument } from '../../../base/common/errors.js';
import { dispose, DisposableStore } from '../../../base/common/lifecycle.js';
import { equals as objectEquals } from '../../../base/common/objects.js';
import { URI } from '../../../base/common/uri.js';
import { ICodeEditorService } from '../../../editor/browser/services/codeEditorService.js';
import { CommandsRegistry } from '../../../platform/commands/common/commands.js';
import { EditorActivation, EditorResolution, isTextEditorDiffInformationEqual } from '../../../platform/editor/common/editor.js';
import { ExtHostContext } from '../common/extHost.protocol.js';
import { editorGroupToColumn, columnToEditorGroup } from '../../services/editor/common/editorGroupColumn.js';
import { IEditorService } from '../../services/editor/common/editorService.js';
import { IEditorGroupsService } from '../../services/editor/common/editorGroupsService.js';
import { IEnvironmentService } from '../../../platform/environment/common/environment.js';
import { IWorkingCopyService } from '../../services/workingCopy/common/workingCopyService.js';
import { getCodeEditor } from '../../../editor/browser/editorBrowser.js';
import { IConfigurationService } from '../../../platform/configuration/common/configuration.js';
import { IQuickDiffModelService } from '../../contrib/scm/browser/quickDiffModel.js';
import { autorun, constObservable, derived, derivedOpts, observableFromEvent } from '../../../base/common/observable.js';
import { IUriIdentityService } from '../../../platform/uriIdentity/common/uriIdentity.js';
import { isITextModel } from '../../../editor/common/model.js';
import { equals } from '../../../base/common/arrays.js';
import { Event } from '../../../base/common/event.js';
let MainThreadTextEditors = class MainThreadTextEditors {
    static { MainThreadTextEditors_1 = this; }
    static { this.INSTANCE_COUNT = 0; }
    constructor(_editorLocator, extHostContext, _codeEditorService, _editorService, _editorGroupService, _configurationService, _quickDiffModelService, _uriIdentityService) {
        this._editorLocator = _editorLocator;
        this._codeEditorService = _codeEditorService;
        this._editorService = _editorService;
        this._editorGroupService = _editorGroupService;
        this._configurationService = _configurationService;
        this._quickDiffModelService = _quickDiffModelService;
        this._uriIdentityService = _uriIdentityService;
        this._toDispose = new DisposableStore();
        this._instanceId = String(++MainThreadTextEditors_1.INSTANCE_COUNT);
        this._proxy = extHostContext.getProxy(ExtHostContext.ExtHostEditors);
        this._textEditorsListenersMap = Object.create(null);
        this._editorPositionData = null;
        this._toDispose.add(this._editorService.onDidVisibleEditorsChange(() => this._updateActiveAndVisibleTextEditors()));
        this._toDispose.add(this._editorGroupService.onDidRemoveGroup(() => this._updateActiveAndVisibleTextEditors()));
        this._toDispose.add(this._editorGroupService.onDidMoveGroup(() => this._updateActiveAndVisibleTextEditors()));
        this._registeredDecorationTypes = Object.create(null);
    }
    dispose() {
        Object.keys(this._textEditorsListenersMap).forEach((editorId) => {
            dispose(this._textEditorsListenersMap[editorId]);
        });
        this._textEditorsListenersMap = Object.create(null);
        this._toDispose.dispose();
        for (const decorationType in this._registeredDecorationTypes) {
            this._codeEditorService.removeDecorationType(decorationType);
        }
        this._registeredDecorationTypes = Object.create(null);
    }
    handleTextEditorAdded(textEditor) {
        const id = textEditor.getId();
        const toDispose = [];
        toDispose.push(textEditor.onPropertiesChanged((data) => {
            this._proxy.$acceptEditorPropertiesChanged(id, data);
        }));
        const diffInformationObs = this._getTextEditorDiffInformation(textEditor, toDispose);
        toDispose.push(autorun(reader => {
            const diffInformation = diffInformationObs.read(reader);
            this._proxy.$acceptEditorDiffInformation(id, diffInformation);
        }));
        this._textEditorsListenersMap[id] = toDispose;
    }
    handleTextEditorRemoved(id) {
        dispose(this._textEditorsListenersMap[id]);
        delete this._textEditorsListenersMap[id];
    }
    _updateActiveAndVisibleTextEditors() {
        // editor columns
        const editorPositionData = this._getTextEditorPositionData();
        if (!objectEquals(this._editorPositionData, editorPositionData)) {
            this._editorPositionData = editorPositionData;
            this._proxy.$acceptEditorPositionData(this._editorPositionData);
        }
    }
    _getTextEditorPositionData() {
        const result = Object.create(null);
        for (const editorPane of this._editorService.visibleEditorPanes) {
            const id = this._editorLocator.findTextEditorIdFor(editorPane);
            if (id) {
                result[id] = editorGroupToColumn(this._editorGroupService, editorPane.group);
            }
        }
        return result;
    }
    _getTextEditorDiffInformation(textEditor, toDispose) {
        const codeEditor = textEditor.getCodeEditor();
        if (!codeEditor) {
            return constObservable(undefined);
        }
        // Check if the TextModel belongs to a DiffEditor
        const [diffEditor] = this._codeEditorService.listDiffEditors()
            .filter(d => d.getOriginalEditor().getId() === codeEditor.getId() ||
            d.getModifiedEditor().getId() === codeEditor.getId());
        const editorModelObs = diffEditor
            ? observableFromEvent(this, diffEditor.onDidChangeModel, () => diffEditor.getModel())
            : observableFromEvent(this, codeEditor.onDidChangeModel, () => codeEditor.getModel());
        const editorChangesObs = derived(reader => {
            const editorModel = editorModelObs.read(reader);
            if (!editorModel) {
                return constObservable(undefined);
            }
            // TextEditor
            if (isITextModel(editorModel)) {
                const quickDiffModelRef = this._quickDiffModelService.createQuickDiffModelReference(editorModel.uri);
                if (!quickDiffModelRef) {
                    return constObservable(undefined);
                }
                toDispose.push(quickDiffModelRef);
                return observableFromEvent(this, quickDiffModelRef.object.onDidChange, () => {
                    return quickDiffModelRef.object.getQuickDiffResults()
                        .map(result => ({
                        original: result.original,
                        modified: result.modified,
                        changes: result.changes2
                    }));
                });
            }
            // DiffEditor - we create a quick diff model (using the diff algorithm used by the diff editor)
            // even for diff editor so that we can provide multiple "original resources" to diff with the original
            // and modified resources.
            const diffAlgorithm = this._configurationService.getValue('diffEditor.diffAlgorithm');
            const quickDiffModelRef = this._quickDiffModelService.createQuickDiffModelReference(editorModel.modified.uri, { algorithm: diffAlgorithm });
            if (!quickDiffModelRef) {
                return constObservable(undefined);
            }
            toDispose.push(quickDiffModelRef);
            return observableFromEvent(Event.any(quickDiffModelRef.object.onDidChange, diffEditor.onDidUpdateDiff), () => {
                const diffChanges = diffEditor.getDiffComputationResult()?.changes2 ?? [];
                const diffInformation = [{
                        original: editorModel.original.uri,
                        modified: editorModel.modified.uri,
                        changes: diffChanges.map(change => change)
                    }];
                // Add quick diff information from secondary/contributed providers
                const quickDiffInformation = quickDiffModelRef.object.getQuickDiffResults()
                    .filter(result => result.providerKind !== 'primary')
                    .map(result => ({
                    original: result.original,
                    modified: result.modified,
                    changes: result.changes2
                }));
                // Combine diff and quick diff information
                return diffInformation.concat(quickDiffInformation);
            });
        });
        return derivedOpts({
            owner: this,
            equalsFn: (diff1, diff2) => equals(diff1, diff2, (a, b) => isTextEditorDiffInformationEqual(this._uriIdentityService, a, b))
        }, reader => {
            const editorModel = editorModelObs.read(reader);
            const editorChanges = editorChangesObs.read(reader).read(reader);
            if (!editorModel || !editorChanges) {
                return undefined;
            }
            const documentVersion = isITextModel(editorModel)
                ? editorModel.getVersionId()
                : editorModel.modified.getVersionId();
            return editorChanges.map(change => {
                const changes = change.changes
                    .map(change => [
                    change.original.startLineNumber,
                    change.original.endLineNumberExclusive,
                    change.modified.startLineNumber,
                    change.modified.endLineNumberExclusive
                ]);
                return {
                    documentVersion,
                    original: change.original,
                    modified: change.modified,
                    changes
                };
            });
        });
    }
    // --- from extension host process
    async $tryShowTextDocument(resource, options) {
        const uri = URI.revive(resource);
        const editorOptions = {
            preserveFocus: options.preserveFocus,
            pinned: options.pinned,
            selection: options.selection,
            // preserve pre 1.38 behaviour to not make group active when preserveFocus: true
            // but make sure to restore the editor to fix https://github.com/microsoft/vscode/issues/79633
            activation: options.preserveFocus ? EditorActivation.RESTORE : undefined,
            override: EditorResolution.EXCLUSIVE_ONLY
        };
        const input = {
            resource: uri,
            options: editorOptions
        };
        const editor = await this._editorService.openEditor(input, columnToEditorGroup(this._editorGroupService, this._configurationService, options.position));
        if (!editor) {
            return undefined;
        }
        // Composite editors are made up of many editors so we return the active one at the time of opening
        const editorControl = editor.getControl();
        const codeEditor = getCodeEditor(editorControl);
        return codeEditor ? this._editorLocator.getIdOfCodeEditor(codeEditor) : undefined;
    }
    async $tryShowEditor(id, position) {
        const mainThreadEditor = this._editorLocator.getEditor(id);
        if (mainThreadEditor) {
            const model = mainThreadEditor.getModel();
            await this._editorService.openEditor({
                resource: model.uri,
                options: { preserveFocus: false }
            }, columnToEditorGroup(this._editorGroupService, this._configurationService, position));
            return;
        }
    }
    async $tryHideEditor(id) {
        const mainThreadEditor = this._editorLocator.getEditor(id);
        if (mainThreadEditor) {
            const editorPanes = this._editorService.visibleEditorPanes;
            for (const editorPane of editorPanes) {
                if (mainThreadEditor.matches(editorPane)) {
                    await editorPane.group.closeEditor(editorPane.input);
                    return;
                }
            }
        }
    }
    $trySetSelections(id, selections) {
        const editor = this._editorLocator.getEditor(id);
        if (!editor) {
            return Promise.reject(illegalArgument(`TextEditor(${id})`));
        }
        editor.setSelections(selections);
        return Promise.resolve(undefined);
    }
    $trySetDecorations(id, key, ranges) {
        key = `${this._instanceId}-${key}`;
        const editor = this._editorLocator.getEditor(id);
        if (!editor) {
            return Promise.reject(illegalArgument(`TextEditor(${id})`));
        }
        editor.setDecorations(key, ranges);
        return Promise.resolve(undefined);
    }
    $trySetDecorationsFast(id, key, ranges) {
        key = `${this._instanceId}-${key}`;
        const editor = this._editorLocator.getEditor(id);
        if (!editor) {
            return Promise.reject(illegalArgument(`TextEditor(${id})`));
        }
        editor.setDecorationsFast(key, ranges);
        return Promise.resolve(undefined);
    }
    $tryRevealRange(id, range, revealType) {
        const editor = this._editorLocator.getEditor(id);
        if (!editor) {
            return Promise.reject(illegalArgument(`TextEditor(${id})`));
        }
        editor.revealRange(range, revealType);
        return Promise.resolve();
    }
    $trySetOptions(id, options) {
        const editor = this._editorLocator.getEditor(id);
        if (!editor) {
            return Promise.reject(illegalArgument(`TextEditor(${id})`));
        }
        editor.setConfiguration(options);
        return Promise.resolve(undefined);
    }
    $tryApplyEdits(id, modelVersionId, edits, opts) {
        const editor = this._editorLocator.getEditor(id);
        if (!editor) {
            return Promise.reject(illegalArgument(`TextEditor(${id})`));
        }
        return Promise.resolve(editor.applyEdits(modelVersionId, edits, opts));
    }
    $tryInsertSnippet(id, modelVersionId, template, ranges, opts) {
        const editor = this._editorLocator.getEditor(id);
        if (!editor) {
            return Promise.reject(illegalArgument(`TextEditor(${id})`));
        }
        return Promise.resolve(editor.insertSnippet(modelVersionId, template, ranges, opts));
    }
    $registerTextEditorDecorationType(extensionId, key, options) {
        key = `${this._instanceId}-${key}`;
        this._registeredDecorationTypes[key] = true;
        this._codeEditorService.registerDecorationType(`exthost-api-${extensionId}`, key, options);
    }
    $removeTextEditorDecorationType(key) {
        key = `${this._instanceId}-${key}`;
        delete this._registeredDecorationTypes[key];
        this._codeEditorService.removeDecorationType(key);
    }
    $getDiffInformation(id) {
        const editor = this._editorLocator.getEditor(id);
        if (!editor) {
            return Promise.reject(new Error('No such TextEditor'));
        }
        const codeEditor = editor.getCodeEditor();
        if (!codeEditor) {
            return Promise.reject(new Error('No such CodeEditor'));
        }
        const codeEditorId = codeEditor.getId();
        const diffEditors = this._codeEditorService.listDiffEditors();
        const [diffEditor] = diffEditors.filter(d => d.getOriginalEditor().getId() === codeEditorId || d.getModifiedEditor().getId() === codeEditorId);
        if (diffEditor) {
            return Promise.resolve(diffEditor.getLineChanges() || []);
        }
        if (!codeEditor.hasModel()) {
            return Promise.resolve([]);
        }
        const quickDiffModelRef = this._quickDiffModelService.createQuickDiffModelReference(codeEditor.getModel().uri);
        if (!quickDiffModelRef) {
            return Promise.resolve([]);
        }
        try {
            const primaryQuickDiff = quickDiffModelRef.object.quickDiffs.find(quickDiff => quickDiff.kind === 'primary');
            const primaryQuickDiffChanges = quickDiffModelRef.object.changes.filter(change => change.providerId === primaryQuickDiff?.id);
            return Promise.resolve(primaryQuickDiffChanges.map(change => change.change) ?? []);
        }
        finally {
            quickDiffModelRef.dispose();
        }
    }
};
MainThreadTextEditors = MainThreadTextEditors_1 = __decorate([
    __param(2, ICodeEditorService),
    __param(3, IEditorService),
    __param(4, IEditorGroupsService),
    __param(5, IConfigurationService),
    __param(6, IQuickDiffModelService),
    __param(7, IUriIdentityService)
], MainThreadTextEditors);
export { MainThreadTextEditors };
// --- commands
CommandsRegistry.registerCommand('_workbench.revertAllDirty', async function (accessor) {
    const environmentService = accessor.get(IEnvironmentService);
    if (!environmentService.extensionTestsLocationURI) {
        throw new Error('Command is only available when running extension tests.');
    }
    const workingCopyService = accessor.get(IWorkingCopyService);
    for (const workingCopy of workingCopyService.dirtyWorkingCopies) {
        await workingCopy.revert({ soft: true });
    }
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWFpblRocmVhZEVkaXRvcnMuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvYXBpL2Jyb3dzZXIvbWFpblRocmVhZEVkaXRvcnMudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7O0FBRWhHLE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSxnQ0FBZ0MsQ0FBQztBQUNqRSxPQUFPLEVBQWUsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLG1DQUFtQyxDQUFDO0FBQzFGLE9BQU8sRUFBRSxNQUFNLElBQUksWUFBWSxFQUFFLE1BQU0saUNBQWlDLENBQUM7QUFDekUsT0FBTyxFQUFFLEdBQUcsRUFBaUIsTUFBTSw2QkFBNkIsQ0FBQztBQUNqRSxPQUFPLEVBQUUsa0JBQWtCLEVBQUUsTUFBTSx1REFBdUQsQ0FBQztBQUszRixPQUFPLEVBQUUsZ0JBQWdCLEVBQUUsTUFBTSwrQ0FBK0MsQ0FBQztBQUNqRixPQUFPLEVBQTRDLGdCQUFnQixFQUFFLGdCQUFnQixFQUE4QixnQ0FBZ0MsRUFBcUIsTUFBTSwyQ0FBMkMsQ0FBQztBQUcxTixPQUFPLEVBQUUsY0FBYyxFQUFrTSxNQUFNLCtCQUErQixDQUFDO0FBQy9QLE9BQU8sRUFBRSxtQkFBbUIsRUFBRSxtQkFBbUIsRUFBcUIsTUFBTSxtREFBbUQsQ0FBQztBQUNoSSxPQUFPLEVBQUUsY0FBYyxFQUFFLE1BQU0sK0NBQStDLENBQUM7QUFDL0UsT0FBTyxFQUFFLG9CQUFvQixFQUFFLE1BQU0scURBQXFELENBQUM7QUFDM0YsT0FBTyxFQUFFLG1CQUFtQixFQUFFLE1BQU0scURBQXFELENBQUM7QUFDMUYsT0FBTyxFQUFFLG1CQUFtQixFQUFFLE1BQU0seURBQXlELENBQUM7QUFLOUYsT0FBTyxFQUFFLGFBQWEsRUFBZSxNQUFNLDBDQUEwQyxDQUFDO0FBQ3RGLE9BQU8sRUFBRSxx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