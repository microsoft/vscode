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
import { Iterable } from '../../../../base/common/iterator.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { parse } from '../../../../base/common/marshalling.js';
import { Schemas } from '../../../../base/common/network.js';
import { extname, isEqual } from '../../../../base/common/resources.js';
import { isFalsyOrWhitespace } from '../../../../base/common/strings.js';
import { URI } from '../../../../base/common/uri.js';
import { IBulkEditService } from '../../../../editor/browser/services/bulkEditService.js';
import { EditOperation } from '../../../../editor/common/core/editOperation.js';
import { PLAINTEXT_LANGUAGE_ID } from '../../../../editor/common/languages/modesRegistry.js';
import { IModelService } from '../../../../editor/common/services/model.js';
import { ITextModelService } from '../../../../editor/common/services/resolverService.js';
import { peekViewBorder } from '../../../../editor/contrib/peekView/browser/peekView.js';
import { Context as SuggestContext } from '../../../../editor/contrib/suggest/browser/suggest.js';
import { localize, localize2 } from '../../../../nls.js';
import { Action2, MenuId, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { Extensions as ConfigurationExtensions } from '../../../../platform/configuration/common/configurationRegistry.js';
import { ContextKeyExpr } from '../../../../platform/contextkey/common/contextkey.js';
import { EditorActivation } from '../../../../platform/editor/common/editor.js';
import { SyncDescriptor } from '../../../../platform/instantiation/common/descriptors.js';
import { registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { contrastBorder, ifDefinedThenElse, listInactiveSelectionBackground, registerColor } from '../../../../platform/theme/common/colorRegistry.js';
import { EditorPaneDescriptor } from '../../../browser/editor.js';
import { registerWorkbenchContribution2 } from '../../../common/contributions.js';
import { EditorExtensions } from '../../../common/editor.js';
import { PANEL_BORDER } from '../../../common/theme.js';
import { ResourceNotebookCellEdit } from '../../bulkEdit/browser/bulkCellEdits.js';
import { ReplEditorSettings, INTERACTIVE_INPUT_CURSOR_BOUNDARY } from './interactiveCommon.js';
import { IInteractiveDocumentService, InteractiveDocumentService } from './interactiveDocumentService.js';
import { InteractiveEditor } from './interactiveEditor.js';
import { InteractiveEditorInput } from './interactiveEditorInput.js';
import { IInteractiveHistoryService, InteractiveHistoryService } from './interactiveHistoryService.js';
import { NOTEBOOK_EDITOR_WIDGET_ACTION_WEIGHT } from '../../notebook/browser/controller/coreActions.js';
import * as icons from '../../notebook/browser/notebookIcons.js';
import { INotebookEditorService } from '../../notebook/browser/services/notebookEditorService.js';
import { CellKind, CellUri, INTERACTIVE_WINDOW_EDITOR_ID, NotebookSetting, NotebookWorkingCopyTypeIdentifier } from '../../notebook/common/notebookCommon.js';
import { InteractiveWindowOpen, IS_COMPOSITE_NOTEBOOK, NOTEBOOK_EDITOR_FOCUSED } from '../../notebook/common/notebookContextKeys.js';
import { INotebookKernelService } from '../../notebook/common/notebookKernelService.js';
import { INotebookService } from '../../notebook/common/notebookService.js';
import { columnToEditorGroup } from '../../../services/editor/common/editorGroupColumn.js';
import { IEditorGroupsService } from '../../../services/editor/common/editorGroupsService.js';
import { IEditorResolverService, RegisteredEditorPriority } from '../../../services/editor/common/editorResolverService.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { IExtensionService } from '../../../services/extensions/common/extensions.js';
import { IWorkingCopyEditorService } from '../../../services/workingCopy/common/workingCopyEditorService.js';
import { isReplEditorControl } from '../../replNotebook/browser/replEditor.js';
import { InlineChatController } from '../../inlineChat/browser/inlineChatController.js';
import { IsLinuxContext, IsWindowsContext } from '../../../../platform/contextkey/common/contextkeys.js';
const interactiveWindowCategory = localize2('interactiveWindow', "Interactive Window");
Registry.as(EditorExtensions.EditorPane).registerEditorPane(EditorPaneDescriptor.create(InteractiveEditor, INTERACTIVE_WINDOW_EDITOR_ID, 'Interactive Window'), [
    new SyncDescriptor(InteractiveEditorInput)
]);
let InteractiveDocumentContribution = class InteractiveDocumentContribution extends Disposable {
    static { this.ID = 'workbench.contrib.interactiveDocument'; }
    constructor(notebookService, editorResolverService, editorService, instantiationService) {
        super();
        this.instantiationService = instantiationService;
        const info = notebookService.getContributedNotebookType('interactive');
        // We need to contribute a notebook type for the Interactive Window to provide notebook models.
        if (!info) {
            this._register(notebookService.registerContributedNotebookType('interactive', {
                providerDisplayName: 'Interactive Notebook',
                displayName: 'Interactive',
                filenamePattern: ['*.interactive'],
                priority: RegisteredEditorPriority.builtin
            }));
        }
        editorResolverService.registerEditor(`${Schemas.vscodeInteractiveInput}:/**`, {
            id: 'vscode-interactive-input',
            label: 'Interactive Editor',
            priority: RegisteredEditorPriority.exclusive
        }, {
            canSupportResource: uri => uri.scheme === Schemas.vscodeInteractiveInput,
            singlePerResource: true
        }, {
            createEditorInput: ({ resource }) => {
                const editorInput = editorService.findEditors({
                    resource,
                    editorId: 'interactive',
                    typeId: InteractiveEditorInput.ID
                }, { order: 1 /* EditorsOrder.SEQUENTIAL */ }).at(0);
                return editorInput;
            }
        });
        editorResolverService.registerEditor(`*.interactive`, {
            id: 'interactive',
            label: 'Interactive Editor',
            priority: RegisteredEditorPriority.exclusive
        }, {
            canSupportResource: uri => (uri.scheme === Schemas.untitled && extname(uri) === '.interactive') ||
                (uri.scheme === Schemas.vscodeNotebookCell && extname(uri) === '.interactive'),
            singlePerResource: true
        }, {
            createEditorInput: ({ resource, options }) => {
                const data = CellUri.parse(resource);
                let cellOptions;
                let iwResource = resource;
                if (data) {
                    cellOptions = { resource, options };
                    iwResource = data.notebook;
                }
                const notebookOptions = {
                    ...options,
                    cellOptions,
                    cellRevealType: undefined,
                    cellSelections: undefined,
                    isReadOnly: undefined,
                    viewState: undefined,
                    indexedCellOptions: undefined
                };
                const editorInput = createEditor(iwResource, this.instantiationService);
                return {
                    editor: editorInput,
                    options: notebookOptions
                };
            },
            createUntitledEditorInput: ({ resource, options }) => {
                if (!resource) {
                    throw new Error('Interactive window editors must have a resource name');
                }
                const data = CellUri.parse(resource);
                let cellOptions;
                if (data) {
                    cellOptions = { resource, options };
                }
                const notebookOptions = {
                    ...options,
                    cellOptions,
                    cellRevealType: undefined,
                    cellSelections: undefined,
                    isReadOnly: undefined,
                    viewState: undefined,
                    indexedCellOptions: undefined
                };
                const editorInput = createEditor(resource, this.instantiationService);
                return {
                    editor: editorInput,
                    options: notebookOptions
                };
            }
        });
    }
};
InteractiveDocumentContribution = __decorate([
    __param(0, INotebookService),
    __param(1, IEditorResolverService),
    __param(2, IEditorService),
    __param(3, IInstantiationService)
], InteractiveDocumentContribution);
export { InteractiveDocumentContribution };
let InteractiveInputContentProvider = class InteractiveInputContentProvider {
    static { this.ID = 'workbench.contrib.interactiveInputContentProvider'; }
    constructor(textModelService, _modelService) {
        this._modelService = _modelService;
        this._registration = textModelService.registerTextModelContentProvider(Schemas.vscodeInteractiveInput, this);
    }
    dispose() {
        this._registration.dispose();
    }
    async provideTextContent(resource) {
        const existing = this._modelService.getModel(resource);
        if (existing) {
            return existing;
        }
        const result = this._modelService.createModel('', null, resource, false);
        return result;
    }
};
InteractiveInputContentProvider = __decorate([
    __param(0, ITextModelService),
    __param(1, IModelService)
], InteractiveInputContentProvider);
function createEditor(resource, instantiationService) {
    const counter = /\/Interactive-(\d+)/.exec(resource.path);
    const inputBoxPath = counter && counter[1] ? `/InteractiveInput-${counter[1]}` : 'InteractiveInput';
    const inputUri = URI.from({ scheme: Schemas.vscodeInteractiveInput, path: inputBoxPath });
    const editorInput = InteractiveEditorInput.create(instantiationService, resource, inputUri);
    return editorInput;
}
let InteractiveWindowWorkingCopyEditorHandler = class InteractiveWindowWorkingCopyEditorHandler extends Disposable {
    static { this.ID = 'workbench.contrib.interactiveWindowWorkingCopyEditorHandler'; }
    constructor(_instantiationService, _workingCopyEditorService, _extensionService) {
        super();
        this._instantiationService = _instantiationService;
        this._workingCopyEditorService = _workingCopyEditorService;
        this._extensionService = _extensionService;
        this._installHandler();
    }
    handles(workingCopy) {
        const viewType = this._getViewType(workingCopy);
        return !!viewType && viewType === 'interactive';
    }
    isOpen(workingCopy, editor) {
        if (!this.handles(workingCopy)) {
            return false;
        }
        return editor instanceof InteractiveEditorInput && isEqual(workingCopy.resource, editor.resource);
    }
    createEditor(workingCopy) {
        return createEditor(workingCopy.resource, this._instantiationService);
    }
    async _installHandler() {
        await this._extensionService.whenInstalledExtensionsRegistered();
        this._register(this._workingCopyEditorService.registerHandler(this));
    }
    _getViewType(workingCopy) {
        return NotebookWorkingCopyTypeIdentifier.parse(workingCopy.typeId)?.viewType;
    }
};
InteractiveWindowWorkingCopyEditorHandler = __decorate([
    __param(0, IInstantiationService),
    __param(1, IWorkingCopyEditorService),
    __param(2, IExtensionService)
], InteractiveWindowWorkingCopyEditorHandler);
registerWorkbenchContribution2(InteractiveDocumentContribution.ID, InteractiveDocumentContribution, 2 /* WorkbenchPhase.BlockRestore */);
registerWorkbenchContribution2(InteractiveInputContentProvider.ID, InteractiveInputContentProvider, {
    editorTypeId: INTERACTIVE_WINDOW_EDITOR_ID
});
registerWorkbenchContribution2(InteractiveWindowWorkingCopyEditorHandler.ID, InteractiveWindowWorkingCopyEditorHandler, {
    editorTypeId: INTERACTIVE_WINDOW_EDITOR_ID
});
export class InteractiveEditorSerializer {
    static { this.ID = InteractiveEditorInput.ID; }
    canSerialize(editor) {
        if (!(editor instanceof InteractiveEditorInput)) {
            return false;
        }
        return URI.isUri(editor.primary.resource) && URI.isUri(editor.inputResource);
    }
    serialize(input) {
        if (!this.canSerialize(input)) {
            return undefined;
        }
        return JSON.stringify({
            resource: input.primary.resource,
            inputResource: input.inputResource,
            name: input.getName(),
            language: input.language
        });
    }
    deserialize(instantiationService, raw) {
        const data = parse(raw);
        if (!data) {
            return undefined;
        }
        const { resource, inputResource, name, language } = data;
        if (!URI.isUri(resource) || !URI.isUri(inputResource)) {
            return undefined;
        }
        const input = InteractiveEditorInput.create(instantiationService, resource, inputResource, name, language);
        return input;
    }
}
Registry.as(EditorExtensions.EditorFactory)
    .registerEditorSerializer(InteractiveEditorSerializer.ID, InteractiveEditorSerializer);
registerSingleton(IInteractiveHistoryService, InteractiveHistoryService, 1 /* InstantiationType.Delayed */);
registerSingleton(IInteractiveDocumentService, InteractiveDocumentService, 1 /* InstantiationType.Delayed */);
registerAction2(class extends Action2 {
    constructor() {
        super({
            id: '_interactive.open',
            title: localize2('interactive.open', 'Open Interactive Window'),
            f1: false,
            category: interactiveWindowCategory,
            metadata: {
                description: localize('interactive.open', 'Open Interactive Window'),
                args: [
                    {
                        name: 'showOptions',
                        description: 'Show Options',
                        schema: {
                            type: 'object',
                            properties: {
                                'viewColumn': {
                                    type: 'number',
                                    default: -1
                                },
                                'preserveFocus': {
                                    type: 'boolean',
                                    default: true
                                }
                            },
                        }
                    },
                    {
                        name: 'resource',
                        description: 'Interactive resource Uri',
                        isOptional: true
                    },
                    {
                        name: 'controllerId',
                        description: 'Notebook controller Id',
                        isOptional: true
                    },
                    {
                        name: 'title',
                        description: 'Notebook editor title',
                        isOptional: true
                    }
                ]
            }
        });
    }
    async run(accessor, showOptions, resource, id, title) {
        const editorService = accessor.get(IEditorService);
        const editorGroupService = accessor.get(IEditorGroupsService);
        const historyService = accessor.get(IInteractiveHistoryService);
        const kernelService = accessor.get(INotebookKernelService);
        const logService = accessor.get(ILogService);
        const configurationService = accessor.get(IConfigurationService);
        const group = columnToEditorGroup(editorGroupService, configurationService, typeof showOptions === 'number' ? showOptions : showOptions?.viewColumn);
        const editorOptions = {
            activation: EditorActivation.PRESERVE,
            preserveFocus: typeof showOptions !== 'number' ? (showOptions?.preserveFocus ?? false) : false
        };
        if (resource && extname(resource) === '.interactive') {
            logService.debug('Open interactive window from resource:', resource.toString());
            const resourceUri = URI.revive(resource);
            const editors = editorService.findEditors(resourceUri).filter(id => id.editor instanceof InteractiveEditorInput && id.editor.resource?.toString() === resourceUri.toString());
            if (editors.length) {
                logService.debug('Find existing interactive window:', resource.toString());
                const editorInput = editors[0].editor;
                const currentGroup = editors[0].groupId;
                const editor = await editorService.openEditor(editorInput, editorOptions, currentGroup);
                const editorControl = editor?.getControl();
                return {
                    notebookUri: editorInput.resource,
                    inputUri: editorInput.inputResource,
                    notebookEditorId: editorControl?.notebookEditor?.getId()
                };
            }
        }
        const existingNotebookDocument = new Set();
        editorService.getEditors(1 /* EditorsOrder.SEQUENTIAL */).forEach(editor => {
            if (editor.editor.resource) {
                existingNotebookDocument.add(editor.editor.resource.toString());
            }
        });
        let notebookUri = undefined;
        let inputUri = undefined;
        let counter = 1;
        do {
            notebookUri = URI.from({ scheme: Schemas.untitled, path: `/Interactive-${counter}.interactive` });
            inputUri = URI.from({ scheme: Schemas.vscodeInteractiveInput, path: `/InteractiveInput-${counter}` });
            counter++;
        } while (existingNotebookDocument.has(notebookUri.toString()));
        InteractiveEditorInput.setName(notebookUri, title);
        logService.debug('Open new interactive window:', notebookUri.toString(), inputUri.toString());
        if (id) {
            const allKernels = kernelService.getMatchingKernel({ uri: notebookUri, notebookType: 'interactive' }).all;
            const preferredKernel = allKernels.find(kernel => kernel.id === id);
            if (preferredKernel) {
                kernelService.preselectKernelForNotebook(preferredKernel, { uri: notebookUri, notebookType: 'interactive' });
            }
        }
        historyService.clearHistory(notebookUri);
        const editorInput = { resource: notebookUri, options: editorOptions };
        const editorPane = await editorService.openEditor(editorInput, group);
        const editorControl = editorPane?.getControl();
        // Extensions must retain references to these URIs to manipulate the interactive editor
        logService.debug('New interactive window opened. Notebook editor id', editorControl?.notebookEditor?.getId());
        return { notebookUri, inputUri, notebookEditorId: editorControl?.notebookEditor?.getId() };
    }
});
registerAction2(class extends Action2 {
    constructor() {
        super({
            id: 'interactive.execute',
            title: localize2('interactive.execute', 'Execute Code'),
            category: interactiveWindowCategory,
            keybinding: [{
                    // when: NOTEBOOK_CELL_LIST_FOCUSED,
                    when: ContextKeyExpr.and(IS_COMPOSITE_NOTEBOOK, ContextKeyExpr.equals('activeEditor', 'workbench.editor.interactive')),
                    primary: 2048 /* KeyMod.CtrlCmd */ | 3 /* KeyCode.Enter */,
                    weight: NOTEBOOK_EDITOR_WIDGET_ACTION_WEIGHT
                }, {
                    when: ContextKeyExpr.and(IS_COMPOSITE_NOTEBOOK, ContextKeyExpr.equals('activeEditor', 'workbench.editor.interactive'), ContextKeyExpr.equals('config.interactiveWindow.executeWithShiftEnter', true)),
                    primary: 1024 /* KeyMod.Shift */ | 3 /* KeyCode.Enter */,
                    weight: NOTEBOOK_EDITOR_WIDGET_ACTION_WEIGHT
                }, {
                    when: ContextKeyExpr.and(IS_COMPOSITE_NOTEBOOK, ContextKeyExpr.equals('activeEditor', 'workbench.editor.interactive'), ContextKeyExpr.equals('config.interactiveWindow.executeWithShiftEnter', false)),
                    primary: 3 /* KeyCode.Enter */,
                    weight: NOTEBOOK_EDITOR_WIDGET_ACTION_WEIGHT
                }],
            menu: [
                {
                    id: MenuId.InteractiveInputExecute
                },
            ],
            icon: icons.executeIcon,
            f1: false,
            metadata: {
                description: 'Execute the Contents of the Input Box',
                args: [
                    {
                        name: 'resource',
                        description: 'Interactive resource Uri',
                        isOptional: true
                    }
                ]
            }
        });
    }
    async run(accessor, context) {
        const editorService = accessor.get(IEditorService);
        const bulkEditService = accessor.get(IBulkEditService);
        const historyService = accessor.get(IInteractiveHistoryService);
        const notebookEditorService = accessor.get(INotebookEditorService);
        let editorControl;
        if (context) {
            const resourceUri = URI.revive(context);
            const editors = editorService.findEditors(resourceUri);
            for (const found of editors) {
                if (found.editor.typeId === InteractiveEditorInput.ID) {
                    const editor = await editorService.openEditor(found.editor, found.groupId);
                    editorControl = editor?.getControl();
                    break;
                }
            }
        }
        else {
            editorControl = editorService.activeEditorPane?.getControl();
        }
        if (editorControl && isReplEditorControl(editorControl) && editorControl.notebookEditor) {
            const notebookDocument = editorControl.notebookEditor.textModel;
            const textModel = editorControl.activeCodeEditor?.getModel();
            const activeKernel = editorControl.notebookEditor.activeKernel;
            const language = activeKernel?.supportedLanguages[0] ?? PLAINTEXT_LANGUAGE_ID;
            if (notebookDocument && textModel && editorControl.activeCodeEditor) {
                const index = notebookDocument.length;
                const value = textModel.getValue();
                if (isFalsyOrWhitespace(value)) {
                    return;
                }
                const ctrl = InlineChatController.get(editorControl.activeCodeEditor);
                if (ctrl) {
                    ctrl.acceptSession();
                }
                historyService.replaceLast(notebookDocument.uri, value);
                historyService.addToHistory(notebookDocument.uri, '');
                textModel.setValue('');
                const collapseState = editorControl.notebookEditor.notebookOptions.getDisplayOptions().interactiveWindowCollapseCodeCells === 'fromEditor' ?
                    {
                        inputCollapsed: false,
                        outputCollapsed: false
                    } :
                    undefined;
                await bulkEditService.apply([
                    new ResourceNotebookCellEdit(notebookDocument.uri, {
                        editType: 1 /* CellEditType.Replace */,
                        index: index,
                        count: 0,
                        cells: [{
                                cellKind: CellKind.Code,
                                mime: undefined,
                                language,
                                source: value,
                                outputs: [],
                                metadata: {},
                                collapseState
                            }]
                    })
                ]);
                // reveal the cell into view first
                const range = { start: index, end: index + 1 };
                editorControl.notebookEditor.revealCellRangeInView(range);
                await editorControl.notebookEditor.executeNotebookCells(editorControl.notebookEditor.getCellsInRange({ start: index, end: index + 1 }));
                // update the selection and focus in the extension host model
                const editor = notebookEditorService.getNotebookEditor(editorControl.notebookEditor.getId());
                if (editor) {
                    editor.setSelections([range]);
                    editor.setFocus(range);
                }
            }
        }
    }
});
registerAction2(class extends Action2 {
    constructor() {
        super({
            id: 'interactive.input.clear',
            title: localize2('interactive.input.clear', 'Clear the interactive window input editor contents'),
            category: interactiveWindowCategory,
            f1: false
        });
    }
    async run(accessor) {
        const editorService = accessor.get(IEditorService);
        const editorControl = editorService.activeEditorPane?.getControl();
        if (editorControl && isReplEditorControl(editorControl) && editorControl.notebookEditor) {
            const notebookDocument = editorControl.notebookEditor.textModel;
            const editor = editorControl.activeCodeEditor;
            const range = editor?.getModel()?.getFullModelRange();
            if (notebookDocument && editor && range) {
                editor.executeEdits('', [EditOperation.replace(range, null)]);
            }
        }
    }
});
registerAction2(class extends Action2 {
    constructor() {
        super({
            id: 'interactive.history.previous',
            title: localize2('interactive.history.previous', 'Previous value in history'),
            category: interactiveWindowCategory,
            f1: false,
            keybinding: {
                when: ContextKeyExpr.and(INTERACTIVE_INPUT_CURSOR_BOUNDARY.notEqualsTo('bottom'), INTERACTIVE_INPUT_CURSOR_BOUNDARY.notEqualsTo('none'), SuggestContext.Visible.toNegated()),
                primary: 16 /* KeyCode.UpArrow */,
                weight: 200 /* KeybindingWeight.WorkbenchContrib */
            },
            precondition: ContextKeyExpr.and(IS_COMPOSITE_NOTEBOOK, NOTEBOOK_EDITOR_FOCUSED.negate())
        });
    }
    async run(accessor) {
        const editorService = accessor.get(IEditorService);
        const historyService = accessor.get(IInteractiveHistoryService);
        const editorControl = editorService.activeEditorPane?.getControl();
        if (editorControl && isReplEditorControl(editorControl) && editorControl.notebookEditor) {
            const notebookDocument = editorControl.notebookEditor.textModel;
            const textModel = editorControl.activeCodeEditor?.getModel();
            if (notebookDocument && textModel) {
                const previousValue = historyService.getPreviousValue(notebookDocument.uri);
                if (previousValue) {
                    textModel.setValue(previousValue);
                }
            }
        }
    }
});
registerAction2(class extends Action2 {
    constructor() {
        super({
            id: 'interactive.history.next',
            title: localize2('interactive.history.next', 'Next value in history'),
            category: interactiveWindowCategory,
            f1: false,
            keybinding: {
                when: ContextKeyExpr.and(INTERACTIVE_INPUT_CURSOR_BOUNDARY.notEqualsTo('top'), INTERACTIVE_INPUT_CURSOR_BOUNDARY.notEqualsTo('none'), SuggestContext.Visible.toNegated()),
                primary: 18 /* KeyCode.DownArrow */,
                weight: 200 /* KeybindingWeight.WorkbenchContrib */
            },
            precondition: ContextKeyExpr.and(IS_COMPOSITE_NOTEBOOK, NOTEBOOK_EDITOR_FOCUSED.negate())
        });
    }
    async run(accessor) {
        const editorService = accessor.get(IEditorService);
        const historyService = accessor.get(IInteractiveHistoryService);
        const editorControl = editorService.activeEditorPane?.getControl();
        if (editorControl && isReplEditorControl(editorControl) && editorControl.notebookEditor) {
            const notebookDocument = editorControl.notebookEditor.textModel;
            const textModel = editorControl.activeCodeEditor?.getModel();
            if (notebookDocument && textModel) {
                const nextValue = historyService.getNextValue(notebookDocument.uri);
                if (nextValue !== null) {
                    textModel.setValue(nextValue);
                }
            }
        }
    }
});
registerAction2(class extends Action2 {
    constructor() {
        super({
            id: 'interactive.scrollToTop',
            title: localize('interactiveScrollToTop', 'Scroll to Top'),
            keybinding: {
                when: ContextKeyExpr.equals('activeEditor', 'workbench.editor.interactive'),
                primary: 2048 /* KeyMod.CtrlCmd */ | 14 /* KeyCode.Home */,
                mac: { primary: 2048 /* KeyMod.CtrlCmd */ | 16 /* KeyCode.UpArrow */ },
                weight: 200 /* KeybindingWeight.WorkbenchContrib */
            },
            category: interactiveWindowCategory,
        });
    }
    async run(accessor) {
        const editorService = accessor.get(IEditorService);
        const editorControl = editorService.activeEditorPane?.getControl();
        if (editorControl && isReplEditorControl(editorControl) && editorControl.notebookEditor) {
            if (editorControl.notebookEditor.getLength() === 0) {
                return;
            }
            editorControl.notebookEditor.revealCellRangeInView({ start: 0, end: 1 });
        }
    }
});
registerAction2(class extends Action2 {
    constructor() {
        super({
            id: 'interactive.scrollToBottom',
            title: localize('interactiveScrollToBottom', 'Scroll to Bottom'),
            keybinding: {
                when: ContextKeyExpr.equals('activeEditor', 'workbench.editor.interactive'),
                primary: 2048 /* KeyMod.CtrlCmd */ | 13 /* KeyCode.End */,
                mac: { primary: 2048 /* KeyMod.CtrlCmd */ | 18 /* KeyCode.DownArrow */ },
                weight: 200 /* KeybindingWeight.WorkbenchContrib */
            },
            category: interactiveWindowCategory,
        });
    }
    async run(accessor) {
        const editorService = accessor.get(IEditorService);
        const editorControl = editorService.activeEditorPane?.getControl();
        if (editorControl && isReplEditorControl(editorControl) && editorControl.notebookEditor) {
            if (editorControl.notebookEditor.getLength() === 0) {
                return;
            }
            const len = editorControl.notebookEditor.getLength();
            editorControl.notebookEditor.revealCellRangeInView({ start: len - 1, end: len });
        }
    }
});
registerAction2(class extends Action2 {
    constructor() {
        super({
            id: 'interactive.input.focus',
            title: localize2('interactive.input.focus', 'Focus Input Editor'),
            category: interactiveWindowCategory,
            menu: {
                id: MenuId.CommandPalette,
                when: InteractiveWindowOpen
            },
        });
    }
    async run(accessor) {
        const editorService = accessor.get(IEditorService);
        const editorControl = editorService.activeEditorPane?.getControl();
        if (editorControl && isReplEditorControl(editorControl) && editorControl.notebookEditor) {
            editorService.activeEditorPane?.focus();
        }
        else {
            // find and open the most recent interactive window
            const openEditors = editorService.getEditors(0 /* EditorsOrder.MOST_RECENTLY_ACTIVE */);
            const interactiveWindow = Iterable.find(openEditors, identifier => { return identifier.editor.typeId === InteractiveEditorInput.ID; });
            if (interactiveWindow) {
                const editorInput = interactiveWindow.editor;
                const currentGroup = interactiveWindow.groupId;
                const editor = await editorService.openEditor(editorInput, currentGroup);
                const editorControl = editor?.getControl();
                if (editorControl && isReplEditorControl(editorControl) && editorControl.notebookEditor) {
                    editorService.activeEditorPane?.focus();
                }
            }
        }
    }
});
registerAction2(class extends Action2 {
    constructor() {
        super({
            id: 'interactive.history.focus',
            title: localize2('interactive.history.focus', 'Focus History'),
            category: interactiveWindowCategory,
            menu: {
                id: MenuId.CommandPalette,
                when: ContextKeyExpr.equals('activeEditor', 'workbench.editor.interactive'),
            },
            keybinding: [{
                    // On mac, require that the cursor is at the top of the input, to avoid stealing cmd+up to move the cursor to the top
                    when: ContextKeyExpr.and(INTERACTIVE_INPUT_CURSOR_BOUNDARY.notEqualsTo('bottom'), INTERACTIVE_INPUT_CURSOR_BOUNDARY.notEqualsTo('none')),
                    weight: 200 /* KeybindingWeight.WorkbenchContrib */ + 5,
                    primary: 2048 /* KeyMod.CtrlCmd */ | 16 /* KeyCode.UpArrow */
                },
                {
                    when: ContextKeyExpr.or(IsWindowsContext, IsLinuxContext),
                    weight: 200 /* KeybindingWeight.WorkbenchContrib */,
                    primary: 2048 /* KeyMod.CtrlCmd */ | 16 /* KeyCode.UpArrow */,
                }],
            precondition: ContextKeyExpr.and(IS_COMPOSITE_NOTEBOOK, NOTEBOOK_EDITOR_FOCUSED.negate())
        });
    }
    async run(accessor) {
        const editorService = accessor.get(IEditorService);
        const editorControl = editorService.activeEditorPane?.getControl();
        if (editorControl && isReplEditorControl(editorControl) && editorControl.notebookEditor) {
            editorControl.notebookEditor.focus();
        }
    }
});
registerColor('interactive.activeCodeBorder', {
    dark: ifDefinedThenElse(peekViewBorder, peekViewBorder, '#007acc'),
    light: ifDefinedThenElse(peekViewBorder, peekViewBorder, '#007acc'),
    hcDark: contrastBorder,
    hcLight: contrastBorder
}, localize('interactive.activeCodeBorder', 'The border color for the current interactive code cell when the editor has focus.'));
registerColor('interactive.inactiveCodeBorder', {
    //dark: theme.getColor(listInactiveSelectionBackground) ?? transparent(listInactiveSelectionBackground, 1),
    dark: ifDefinedThenElse(listInactiveSelectionBackground, listInactiveSelectionBackground, '#37373D'),
    light: ifDefinedThenElse(listInactiveSelectionBackground, listInactiveSelectionBackground, '#E4E6F1'),
    hcDark: PANEL_BORDER,
    hcLight: PANEL_BORDER
}, localize('interactive.inactiveCodeBorder', 'The border color for the current interactive code cell when the editor does not have focus.'));
Registry.as(ConfigurationExtensions.Configuration).registerConfiguration({
    id: 'interactiveWindow',
    order: 100,
    type: 'object',
    'properties': {
        [ReplEditorSettings.interactiveWindowAlwaysScrollOnNewCell]: {
            type: 'boolean',
            default: true,
            markdownDescription: localize('interactiveWindow.alwaysScrollOnNewCell', "Automatically scroll the interactive window to show the output of the last statement executed. If this value is false, the window will only scroll if the last cell was already the one scrolled to.")
        },
        [NotebookSetting.InteractiveWindowPromptToSave]: {
            type: 'boolean',
            default: false,
            markdownDescription: localize('interactiveWindow.promptToSaveOnClose', "Prompt to save the interactive window when it is closed. Only new interactive windows will be affected by this setting change.")
        },
        [ReplEditorSettings.executeWithShiftEnter]: {
            type: 'boolean',
            default: false,
            markdownDescription: localize('interactiveWindow.executeWithShiftEnter', "Execute the Interactive Window (REPL) input box with shift+enter, so that enter can be used to create a newline."),
            tags: ['replExecute']
        },
        [ReplEditorSettings.showExecutionHint]: {
            type: 'boolean',
            default: true,
            markdownDescription: localize('interactiveWindow.showExecutionHint', "Display a hint in the Interactive Window (REPL) input box to indicate how to execute code."),
            tags: ['replExecute']
        }
    }
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW50ZXJhY3RpdmUuY29udHJpYnV0aW9uLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvaW50ZXJhY3RpdmUvYnJvd3Nlci9pbnRlcmFjdGl2ZS5jb250cmlidXRpb24udHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7QUFFaEcsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLHFDQUFxQyxDQUFDO0FBRS9ELE9BQU8sRUFBRSxVQUFVLEVBQWUsTUFBTSxzQ0FBc0MsQ0FBQztBQUMvRSxPQUFPLEVBQUUsS0FBSyxFQUFFLE1BQU0sd0NBQXdDLENBQUM7QUFDL0QsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLG9DQUFvQyxDQUFDO0FBQzdELE9BQU8sRUFBRSxPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFDeEUsT0FBTyxFQUFFLG1CQUFtQixFQUFFLE1BQU0sb0NBQW9DLENBQUM7QUFDekUsT0FBTyxFQUFFLEdBQUcsRUFBaUIsTUFBTSxnQ0FBZ0MsQ0FBQztBQUNwRSxPQUFPLEVBQUUsZ0JBQWdCLEVBQUUsTUFBTSx3REFBd0QsQ0FBQztBQUMxRixPQUFPLEVBQUUsYUFBYSxFQUFFLE1BQU0saURBQWlELENBQUM7QUFDaEYsT0FBTyxFQUFFLHFCQUFxQixFQUFFLE1BQU0sc0RBQXNELENBQUM7QUFFN0YsT0FBTyxFQUFFLGFBQWEsRUFBRSxNQUFNLDZDQUE2QyxDQUFDO0FBQzVFLE9BQU8sRUFBNkIsaUJBQWlCLEVBQUUsTUFBTSx1REFBdUQsQ0FBQztBQUNySCxPQUFPLEVBQUUsY0FBYyxFQUFFLE1BQU0seURBQXlELENBQUM7QUFDekYsT0FBTyxFQUFFLE9BQU8sSUFBSSxjQUFjLEVBQUUsTUFBTSx1REFBdUQsQ0FBQztBQUNsRyxPQUFPLEVBQUUsUUFBUSxFQUFFLFNBQVMsRUFB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