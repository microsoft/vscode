/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as nls from '../../../../nls.js';
import { EditorResourceAccessor, SideBySideEditor } from '../../../common/editor.js';
import { SideBySideEditorInput } from '../../../common/editor/sideBySideEditorInput.js';
import { isWorkspaceToOpen } from '../../../../platform/window/common/window.js';
import { IHostService } from '../../../services/host/browser/host.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IWorkspaceContextService, UNTITLED_WORKSPACE_NAME } from '../../../../platform/workspace/common/workspace.js';
import { ExplorerFocusCondition, TextFileContentProvider, VIEWLET_ID, ExplorerCompressedFocusContext, ExplorerCompressedFirstFocusContext, ExplorerCompressedLastFocusContext, FilesExplorerFocusCondition, ExplorerFolderContext, VIEW_ID } from '../common/files.js';
import { IClipboardService } from '../../../../platform/clipboard/common/clipboardService.js';
import { toErrorMessage } from '../../../../base/common/errorMessage.js';
import { CommandsRegistry, ICommandService } from '../../../../platform/commands/common/commands.js';
import { IContextKeyService, ContextKeyExpr } from '../../../../platform/contextkey/common/contextkey.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { KeybindingsRegistry } from '../../../../platform/keybinding/common/keybindingsRegistry.js';
import { KeyChord } from '../../../../base/common/keyCodes.js';
import { isWeb, isWindows } from '../../../../base/common/platform.js';
import { ITextModelService } from '../../../../editor/common/services/resolverService.js';
import { getResourceForCommand, getMultiSelectedResources, getOpenEditorsViewMultiSelection, IExplorerService } from './files.js';
import { IWorkspaceEditingService } from '../../../services/workspaces/common/workspaceEditing.js';
import { resolveCommandsContext } from '../../../browser/parts/editor/editorCommandsContext.js';
import { Schemas } from '../../../../base/common/network.js';
import { INotificationService, Severity } from '../../../../platform/notification/common/notification.js';
import { EditorContextKeys } from '../../../../editor/common/editorContextKeys.js';
import { IEditorService, SIDE_GROUP } from '../../../services/editor/common/editorService.js';
import { IEditorGroupsService } from '../../../services/editor/common/editorGroupsService.js';
import { ILabelService } from '../../../../platform/label/common/label.js';
import { basename, joinPath, isEqual } from '../../../../base/common/resources.js';
import { dispose } from '../../../../base/common/lifecycle.js';
import { IEnvironmentService } from '../../../../platform/environment/common/environment.js';
import { ICodeEditorService } from '../../../../editor/browser/services/codeEditorService.js';
import { EmbeddedCodeEditorWidget } from '../../../../editor/browser/widget/codeEditor/embeddedCodeEditorWidget.js';
import { ITextFileService } from '../../../services/textfile/common/textfiles.js';
import { IUriIdentityService } from '../../../../platform/uriIdentity/common/uriIdentity.js';
import { isCancellationError } from '../../../../base/common/errors.js';
import { toAction } from '../../../../base/common/actions.js';
import { EditorOpenSource, EditorResolution } from '../../../../platform/editor/common/editor.js';
import { hash } from '../../../../base/common/hash.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IPaneCompositePartService } from '../../../services/panecomposite/browser/panecomposite.js';
import { IViewsService } from '../../../services/views/common/viewsService.js';
import { OPEN_TO_SIDE_COMMAND_ID, COMPARE_WITH_SAVED_COMMAND_ID, SELECT_FOR_COMPARE_COMMAND_ID, ResourceSelectedForCompareContext, COMPARE_SELECTED_COMMAND_ID, COMPARE_RESOURCE_COMMAND_ID, COPY_PATH_COMMAND_ID, COPY_RELATIVE_PATH_COMMAND_ID, REVEAL_IN_EXPLORER_COMMAND_ID, OPEN_WITH_EXPLORER_COMMAND_ID, SAVE_FILE_COMMAND_ID, SAVE_FILE_WITHOUT_FORMATTING_COMMAND_ID, SAVE_FILE_AS_COMMAND_ID, SAVE_ALL_COMMAND_ID, SAVE_ALL_IN_GROUP_COMMAND_ID, SAVE_FILES_COMMAND_ID, REVERT_FILE_COMMAND_ID, REMOVE_ROOT_FOLDER_COMMAND_ID, PREVIOUS_COMPRESSED_FOLDER, NEXT_COMPRESSED_FOLDER, FIRST_COMPRESSED_FOLDER, LAST_COMPRESSED_FOLDER, NEW_UNTITLED_FILE_COMMAND_ID, NEW_UNTITLED_FILE_LABEL, NEW_FILE_COMMAND_ID } from './fileConstants.js';
import { IFileDialogService } from '../../../../platform/dialogs/common/dialogs.js';
import { RemoveRootFolderAction } from '../../../browser/actions/workspaceActions.js';
import { OpenEditorsView } from './views/openEditorsView.js';
import { IListService } from '../../../../platform/list/browser/listService.js';
export const openWindowCommand = (accessor, toOpen, options) => {
    if (Array.isArray(toOpen)) {
        const hostService = accessor.get(IHostService);
        const environmentService = accessor.get(IEnvironmentService);
        // rewrite untitled: workspace URIs to the absolute path on disk
        toOpen = toOpen.map(openable => {
            if (isWorkspaceToOpen(openable) && openable.workspaceUri.scheme === Schemas.untitled) {
                return {
                    workspaceUri: joinPath(environmentService.untitledWorkspacesHome, openable.workspaceUri.path, UNTITLED_WORKSPACE_NAME)
                };
            }
            return openable;
        });
        hostService.openWindow(toOpen, options);
    }
};
export const newWindowCommand = (accessor, options) => {
    const hostService = accessor.get(IHostService);
    hostService.openWindow(options);
};
// Command registration
KeybindingsRegistry.registerCommandAndKeybindingRule({
    weight: 200 /* KeybindingWeight.WorkbenchContrib */,
    when: ExplorerFocusCondition,
    primary: 2048 /* KeyMod.CtrlCmd */ | 3 /* KeyCode.Enter */,
    mac: {
        primary: 256 /* KeyMod.WinCtrl */ | 3 /* KeyCode.Enter */
    },
    id: OPEN_TO_SIDE_COMMAND_ID, handler: async (accessor, resource) => {
        const editorService = accessor.get(IEditorService);
        const fileService = accessor.get(IFileService);
        const explorerService = accessor.get(IExplorerService);
        const resources = getMultiSelectedResources(resource, accessor.get(IListService), editorService, accessor.get(IEditorGroupsService), explorerService);
        // Set side input
        if (resources.length) {
            const untitledResources = resources.filter(resource => resource.scheme === Schemas.untitled);
            const fileResources = resources.filter(resource => resource.scheme !== Schemas.untitled);
            const items = await Promise.all(fileResources.map(async (resource) => {
                const item = explorerService.findClosest(resource);
                if (item) {
                    // Explorer already resolved the item, no need to go to the file service #109780
                    return item;
                }
                return await fileService.stat(resource);
            }));
            const files = items.filter(i => !i.isDirectory);
            const editors = files.map(f => ({
                resource: f.resource,
                options: { pinned: true }
            })).concat(...untitledResources.map(untitledResource => ({ resource: untitledResource, options: { pinned: true } })));
            await editorService.openEditors(editors, SIDE_GROUP);
        }
    }
});
KeybindingsRegistry.registerCommandAndKeybindingRule({
    weight: 200 /* KeybindingWeight.WorkbenchContrib */ + 10,
    when: ContextKeyExpr.and(FilesExplorerFocusCondition, ExplorerFolderContext.toNegated()),
    primary: 3 /* KeyCode.Enter */,
    mac: {
        primary: 2048 /* KeyMod.CtrlCmd */ | 18 /* KeyCode.DownArrow */
    },
    id: 'explorer.openAndPassFocus', handler: async (accessor, _resource) => {
        const editorService = accessor.get(IEditorService);
        const explorerService = accessor.get(IExplorerService);
        const resources = explorerService.getContext(true);
        if (resources.length) {
            await editorService.openEditors(resources.map(r => ({ resource: r.resource, options: { preserveFocus: false, pinned: true } })));
        }
    }
});
const COMPARE_WITH_SAVED_SCHEMA = 'showModifications';
let providerDisposables = [];
KeybindingsRegistry.registerCommandAndKeybindingRule({
    id: COMPARE_WITH_SAVED_COMMAND_ID,
    when: undefined,
    weight: 200 /* KeybindingWeight.WorkbenchContrib */,
    primary: KeyChord(2048 /* KeyMod.CtrlCmd */ | 41 /* KeyCode.KeyK */, 34 /* KeyCode.KeyD */),
    handler: async (accessor, resource) => {
        const instantiationService = accessor.get(IInstantiationService);
        const textModelService = accessor.get(ITextModelService);
        const editorService = accessor.get(IEditorService);
        const fileService = accessor.get(IFileService);
        const listService = accessor.get(IListService);
        // Register provider at first as needed
        let registerEditorListener = false;
        if (providerDisposables.length === 0) {
            registerEditorListener = true;
            const provider = instantiationService.createInstance(TextFileContentProvider);
            providerDisposables.push(provider);
            providerDisposables.push(textModelService.registerTextModelContentProvider(COMPARE_WITH_SAVED_SCHEMA, provider));
        }
        // Open editor (only resources that can be handled by file service are supported)
        const uri = getResourceForCommand(resource, editorService, listService);
        if (uri && fileService.hasProvider(uri)) {
            const name = basename(uri);
            const editorLabel = nls.localize('modifiedLabel', "{0} (in file) ↔ {1}", name, name);
            try {
                await TextFileContentProvider.open(uri, COMPARE_WITH_SAVED_SCHEMA, editorLabel, editorService, { pinned: true });
                // Dispose once no more diff editor is opened with the scheme
                if (registerEditorListener) {
                    providerDisposables.push(editorService.onDidVisibleEditorsChange(() => {
                        if (!editorService.editors.some(editor => !!EditorResourceAccessor.getCanonicalUri(editor, { supportSideBySide: SideBySideEditor.SECONDARY, filterByScheme: COMPARE_WITH_SAVED_SCHEMA }))) {
                            providerDisposables = dispose(providerDisposables);
                        }
                    }));
                }
            }
            catch {
                providerDisposables = dispose(providerDisposables);
            }
        }
    }
});
let globalResourceToCompare;
let resourceSelectedForCompareContext;
CommandsRegistry.registerCommand({
    id: SELECT_FOR_COMPARE_COMMAND_ID,
    handler: (accessor, resource) => {
        globalResourceToCompare = getResourceForCommand(resource, accessor.get(IEditorService), accessor.get(IListService));
        if (!resourceSelectedForCompareContext) {
            resourceSelectedForCompareContext = ResourceSelectedForCompareContext.bindTo(accessor.get(IContextKeyService));
        }
        resourceSelectedForCompareContext.set(true);
    }
});
CommandsRegistry.registerCommand({
    id: COMPARE_SELECTED_COMMAND_ID,
    handler: async (accessor, resource) => {
        const editorService = accessor.get(IEditorService);
        const resources = getMultiSelectedResources(resource, accessor.get(IListService), editorService, accessor.get(IEditorGroupsService), accessor.get(IExplorerService));
        if (resources.length === 2) {
            return editorService.openEditor({
                original: { resource: resources[0] },
                modified: { resource: resources[1] },
                options: { pinned: true }
            });
        }
        return true;
    }
});
CommandsRegistry.registerCommand({
    id: COMPARE_RESOURCE_COMMAND_ID,
    handler: (accessor, resource) => {
        const editorService = accessor.get(IEditorService);
        const rightResource = getResourceForCommand(resource, editorService, accessor.get(IListService));
        if (globalResourceToCompare && rightResource) {
            editorService.openEditor({
                original: { resource: globalResourceToCompare },
                modified: { resource: rightResource },
                options: { pinned: true }
            });
        }
    }
});
async function resourcesToClipboard(resources, relative, clipboardService, labelService, configurationService) {
    if (resources.length) {
        const lineDelimiter = isWindows ? '\r\n' : '\n';
        let separator = undefined;
        const copyRelativeOrFullPathSeparatorSection = relative ? 'explorer.copyRelativePathSeparator' : 'explorer.copyPathSeparator';
        const copyRelativeOrFullPathSeparator = configurationService.getValue(copyRelativeOrFullPathSeparatorSection);
        if (copyRelativeOrFullPathSeparator === '/' || copyRelativeOrFullPathSeparator === '\\') {
            separator = copyRelativeOrFullPathSeparator;
        }
        const text = resources.map(resource => labelService.getUriLabel(resource, { relative, noPrefix: true, separator })).join(lineDelimiter);
        await clipboardService.writeText(text);
    }
}
const copyPathCommandHandler = async (accessor, resource) => {
    const resources = getMultiSelectedResources(resource, accessor.get(IListService), accessor.get(IEditorService), accessor.get(IEditorGroupsService), accessor.get(IExplorerService));
    await resourcesToClipboard(resources, false, accessor.get(IClipboardService), accessor.get(ILabelService), accessor.get(IConfigurationService));
};
KeybindingsRegistry.registerCommandAndKeybindingRule({
    weight: 200 /* KeybindingWeight.WorkbenchContrib */,
    when: EditorContextKeys.focus.toNegated(),
    primary: 2048 /* KeyMod.CtrlCmd */ | 512 /* KeyMod.Alt */ | 33 /* KeyCode.KeyC */,
    win: {
        primary: 1024 /* KeyMod.Shift */ | 512 /* KeyMod.Alt */ | 33 /* KeyCode.KeyC */
    },
    id: COPY_PATH_COMMAND_ID,
    handler: copyPathCommandHandler
});
KeybindingsRegistry.registerCommandAndKeybindingRule({
    weight: 200 /* KeybindingWeight.WorkbenchContrib */,
    when: EditorContextKeys.focus,
    primary: KeyChord(2048 /* KeyMod.CtrlCmd */ | 41 /* KeyCode.KeyK */, 2048 /* KeyMod.CtrlCmd */ | 512 /* KeyMod.Alt */ | 33 /* KeyCode.KeyC */),
    win: {
        primary: 1024 /* KeyMod.Shift */ | 512 /* KeyMod.Alt */ | 33 /* KeyCode.KeyC */
    },
    id: COPY_PATH_COMMAND_ID,
    handler: copyPathCommandHandler
});
const copyRelativePathCommandHandler = async (accessor, resource) => {
    const resources = getMultiSelectedResources(resource, accessor.get(IListService), accessor.get(IEditorService), accessor.get(IEditorGroupsService), accessor.get(IExplorerService));
    await resourcesToClipboard(resources, true, accessor.get(IClipboardService), accessor.get(ILabelService), accessor.get(IConfigurationService));
};
KeybindingsRegistry.registerCommandAndKeybindingRule({
    weight: 200 /* KeybindingWeight.WorkbenchContrib */,
    when: EditorContextKeys.focus.toNegated(),
    primary: 2048 /* KeyMod.CtrlCmd */ | 1024 /* KeyMod.Shift */ | 512 /* KeyMod.Alt */ | 33 /* KeyCode.KeyC */,
    win: {
        primary: KeyChord(2048 /* KeyMod.CtrlCmd */ | 41 /* KeyCode.KeyK */, 2048 /* KeyMod.CtrlCmd */ | 1024 /* KeyMod.Shift */ | 33 /* KeyCode.KeyC */)
    },
    id: COPY_RELATIVE_PATH_COMMAND_ID,
    handler: copyRelativePathCommandHandler
});
KeybindingsRegistry.registerCommandAndKeybindingRule({
    weight: 200 /* KeybindingWeight.WorkbenchContrib */,
    when: EditorContextKeys.focus,
    primary: KeyChord(2048 /* KeyMod.CtrlCmd */ | 41 /* KeyCode.KeyK */, 2048 /* KeyMod.CtrlCmd */ | 1024 /* KeyMod.Shift */ | 512 /* KeyMod.Alt */ | 33 /* KeyCode.KeyC */),
    win: {
        primary: KeyChord(2048 /* KeyMod.CtrlCmd */ | 41 /* KeyCode.KeyK */, 2048 /* KeyMod.CtrlCmd */ | 1024 /* KeyMod.Shift */ | 33 /* KeyCode.KeyC */)
    },
    id: COPY_RELATIVE_PATH_COMMAND_ID,
    handler: copyRelativePathCommandHandler
});
KeybindingsRegistry.registerCommandAndKeybindingRule({
    weight: 200 /* KeybindingWeight.WorkbenchContrib */,
    when: undefined,
    primary: KeyChord(2048 /* KeyMod.CtrlCmd */ | 41 /* KeyCode.KeyK */, 46 /* KeyCode.KeyP */),
    id: 'workbench.action.files.copyPathOfActiveFile',
    handler: async (accessor) => {
        const editorService = accessor.get(IEditorService);
        const activeInput = editorService.activeEditor;
        const resource = EditorResourceAccessor.getOriginalUri(activeInput, { supportSideBySide: SideBySideEditor.PRIMARY });
        const resources = resource ? [resource] : [];
        await resourcesToClipboard(resources, false, accessor.get(IClipboardService), accessor.get(ILabelService), accessor.get(IConfigurationService));
    }
});
CommandsRegistry.registerCommand({
    id: REVEAL_IN_EXPLORER_COMMAND_ID,
    handler: async (accessor, resource) => {
        const viewService = accessor.get(IViewsService);
        const contextService = accessor.get(IWorkspaceContextService);
        const explorerService = accessor.get(IExplorerService);
        const editorService = accessor.get(IEditorService);
        const listService = accessor.get(IListService);
        const uri = getResourceForCommand(resource, editorService, listService);
        if (uri && contextService.isInsideWorkspace(uri)) {
            const explorerView = await viewService.openView(VIEW_ID, false);
            if (explorerView) {
                const oldAutoReveal = explorerView.autoReveal;
                // Disable autoreveal before revealing the explorer to prevent a race betwene auto reveal + selection
                // Fixes #197268
                explorerView.autoReveal = false;
                explorerView.setExpanded(true);
                await explorerService.select(uri, 'force');
                explorerView.focus();
                explorerView.autoReveal = oldAutoReveal;
            }
        }
        else {
            // Do not reveal the open editors view if it's hidden explicitly
            // See https://github.com/microsoft/vscode/issues/227378
            const openEditorsView = viewService.getViewWithId(OpenEditorsView.ID);
            if (openEditorsView) {
                openEditorsView.setExpanded(true);
                openEditorsView.focus();
            }
        }
    }
});
CommandsRegistry.registerCommand({
    id: OPEN_WITH_EXPLORER_COMMAND_ID,
    handler: async (accessor, resource) => {
        const editorService = accessor.get(IEditorService);
        const listService = accessor.get(IListService);
        const uri = getResourceForCommand(resource, editorService, listService);
        if (uri) {
            return editorService.openEditor({ resource: uri, options: { override: EditorResolution.PICK, source: EditorOpenSource.USER } });
        }
        return undefined;
    }
});
// Save / Save As / Save All / Revert
async function saveSelectedEditors(accessor, options) {
    const editorGroupService = accessor.get(IEditorGroupsService);
    const codeEditorService = accessor.get(ICodeEditorService);
    const textFileService = accessor.get(ITextFileService);
    // Retrieve selected or active editor
    let editors = getOpenEditorsViewMultiSelection(accessor);
    if (!editors) {
        const activeGroup = editorGroupService.activeGroup;
        if (activeGroup.activeEditor) {
            editors = [];
            // Special treatment for side by side editors: if the active editor
            // has 2 sides, we consider both, to support saving both sides.
            // We only allow this when saving, not for "Save As" and not if any
            // editor is untitled which would bring up a "Save As" dialog too.
            // In addition, we require the secondary side to be modified to not
            // trigger a touch operation unexpectedly.
            //
            // See also https://github.com/microsoft/vscode/issues/4180
            // See also https://github.com/microsoft/vscode/issues/106330
            // See also https://github.com/microsoft/vscode/issues/190210
            if (activeGroup.activeEditor instanceof SideBySideEditorInput &&
                !options?.saveAs && !(activeGroup.activeEditor.primary.hasCapability(4 /* EditorInputCapabilities.Untitled */) || activeGroup.activeEditor.secondary.hasCapability(4 /* EditorInputCapabilities.Untitled */)) &&
                activeGroup.activeEditor.secondary.isModified()) {
                editors.push({ groupId: activeGroup.id, editor: activeGroup.activeEditor.primary });
                editors.push({ groupId: activeGroup.id, editor: activeGroup.activeEditor.secondary });
            }
            else {
                editors.push({ groupId: activeGroup.id, editor: activeGroup.activeEditor });
            }
        }
    }
    if (!editors || editors.length === 0) {
        return; // nothing to save
    }
    // Save editors
    await doSaveEditors(accessor, editors, options);
    // Special treatment for embedded editors: if we detect that focus is
    // inside an embedded code editor, we save that model as well if we
    // find it in our text file models. Currently, only textual editors
    // support embedded editors.
    const focusedCodeEditor = codeEditorService.getFocusedCodeEditor();
    if (focusedCodeEditor instanceof EmbeddedCodeEditorWidget && !focusedCodeEditor.isSimpleWidget) {
        const resource = focusedCodeEditor.getModel()?.uri;
        // Check that the resource of the model was not saved already
        if (resource && !editors.some(({ editor }) => isEqual(EditorResourceAccessor.getCanonicalUri(editor, { supportSideBySide: SideBySideEditor.PRIMARY }), resource))) {
            const model = textFileService.files.get(resource);
            if (!model?.isReadonly()) {
                await textFileService.save(resource, options);
            }
        }
    }
}
function saveDirtyEditorsOfGroups(accessor, groups, options) {
    const dirtyEditors = [];
    for (const group of groups) {
        for (const editor of group.getEditors(0 /* EditorsOrder.MOST_RECENTLY_ACTIVE */)) {
            if (editor.isDirty()) {
                dirtyEditors.push({ groupId: group.id, editor });
            }
        }
    }
    return doSaveEditors(accessor, dirtyEditors, options);
}
async function doSaveEditors(accessor, editors, options) {
    const editorService = accessor.get(IEditorService);
    const notificationService = accessor.get(INotificationService);
    const instantiationService = accessor.get(IInstantiationService);
    try {
        await editorService.save(editors, options);
    }
    catch (error) {
        if (!isCancellationError(error)) {
            const actions = [toAction({ id: 'workbench.action.files.saveEditors', label: nls.localize('retry', "Retry"), run: () => instantiationService.invokeFunction(accessor => doSaveEditors(accessor, editors, options)) })];
            const editorsToRevert = editors.filter(({ editor }) => !editor.hasCapability(4 /* EditorInputCapabilities.Untitled */) /* all except untitled to prevent unexpected data-loss */);
            if (editorsToRevert.length > 0) {
                actions.push(toAction({ id: 'workbench.action.files.revertEditors', label: editorsToRevert.length > 1 ? nls.localize('revertAll', "Revert All") : nls.localize('revert', "Revert"), run: () => editorService.revert(editorsToRevert) }));
            }
            notificationService.notify({
                id: editors.map(({ editor }) => hash(editor.resource?.toString())).join(), // ensure unique notification ID per set of editor
                severity: Severity.Error,
                message: nls.localize({ key: 'genericSaveError', comment: ['{0} is the resource that failed to save and {1} the error message'] }, "Failed to save '{0}': {1}", editors.map(({ editor }) => editor.getName()).join(', '), toErrorMessage(error, false)),
                actions: { primary: actions }
            });
        }
    }
}
KeybindingsRegistry.registerCommandAndKeybindingRule({
    when: undefined,
    weight: 200 /* KeybindingWeight.WorkbenchContrib */,
    primary: 2048 /* KeyMod.CtrlCmd */ | 49 /* KeyCode.KeyS */,
    id: SAVE_FILE_COMMAND_ID,
    handler: accessor => {
        return saveSelectedEditors(accessor, { reason: 1 /* SaveReason.EXPLICIT */, force: true /* force save even when non-dirty */ });
    }
});
KeybindingsRegistry.registerCommandAndKeybindingRule({
    when: undefined,
    weight: 200 /* KeybindingWeight.WorkbenchContrib */,
    primary: KeyChord(2048 /* KeyMod.CtrlCmd */ | 41 /* KeyCode.KeyK */, 49 /* KeyCode.KeyS */),
    win: { primary: KeyChord(2048 /* KeyMod.CtrlCmd */ | 41 /* KeyCode.KeyK */, 2048 /* KeyMod.CtrlCmd */ | 1024 /* KeyMod.Shift */ | 49 /* KeyCode.KeyS */) },
    id: SAVE_FILE_WITHOUT_FORMATTING_COMMAND_ID,
    handler: accessor => {
        return saveSelectedEditors(accessor, { reason: 1 /* SaveReason.EXPLICIT */, force: true /* force save even when non-dirty */, skipSaveParticipants: true });
    }
});
KeybindingsRegistry.registerCommandAndKeybindingRule({
    id: SAVE_FILE_AS_COMMAND_ID,
    weight: 200 /* KeybindingWeight.WorkbenchContrib */,
    when: undefined,
    primary: 2048 /* KeyMod.CtrlCmd */ | 1024 /* KeyMod.Shift */ | 49 /* KeyCode.KeyS */,
    handler: accessor => {
        return saveSelectedEditors(accessor, { reason: 1 /* SaveReason.EXPLICIT */, saveAs: true });
    }
});
KeybindingsRegistry.registerCommandAndKeybindingRule({
    when: undefined,
    weight: 200 /* KeybindingWeight.WorkbenchContrib */,
    primary: undefined,
    mac: { primary: 2048 /* KeyMod.CtrlCmd */ | 512 /* KeyMod.Alt */ | 49 /* KeyCode.KeyS */ },
    win: { primary: KeyChord(2048 /* KeyMod.CtrlCmd */ | 41 /* KeyCode.KeyK */, 49 /* KeyCode.KeyS */) },
    id: SAVE_ALL_COMMAND_ID,
    handler: accessor => {
        return saveDirtyEditorsOfGroups(accessor, accessor.get(IEditorGroupsService).getGroups(1 /* GroupsOrder.MOST_RECENTLY_ACTIVE */), { reason: 1 /* SaveReason.EXPLICIT */ });
    }
});
CommandsRegistry.registerCommand({
    id: SAVE_ALL_IN_GROUP_COMMAND_ID,
    handler: (accessor, _, editorContext) => {
        const editorGroupsService = accessor.get(IEditorGroupsService);
        const resolvedContext = resolveCommandsContext([editorContext], accessor.get(IEditorService), editorGroupsService, accessor.get(IListService));
        let groups = undefined;
        if (!resolvedContext.groupedEditors.length) {
            groups = editorGroupsService.getGroups(1 /* GroupsOrder.MOST_RECENTLY_ACTIVE */);
        }
        else {
            groups = resolvedContext.groupedEditors.map(({ group }) => group);
        }
        return saveDirtyEditorsOfGroups(accessor, groups, { reason: 1 /* SaveReason.EXPLICIT */ });
    }
});
CommandsRegistry.registerCommand({
    id: SAVE_FILES_COMMAND_ID,
    handler: async (accessor) => {
        const editorService = accessor.get(IEditorService);
        const res = await editorService.saveAll({ includeUntitled: false, reason: 1 /* SaveReason.EXPLICIT */ });
        return res.success;
    }
});
CommandsRegistry.registerCommand({
    id: REVERT_FILE_COMMAND_ID,
    handler: async (accessor) => {
        const editorGroupService = accessor.get(IEditorGroupsService);
        const editorService = accessor.get(IEditorService);
        // Retrieve selected or active editor
        let editors = getOpenEditorsViewMultiSelection(accessor);
        if (!editors) {
            const activeGroup = editorGroupService.activeGroup;
            if (activeGroup.activeEditor) {
                editors = [{ groupId: activeGroup.id, editor: activeGroup.activeEditor }];
            }
        }
        if (!editors || editors.length === 0) {
            return; // nothing to revert
        }
        try {
            await editorService.revert(editors.filter(({ editor }) => !editor.hasCapability(4 /* EditorInputCapabilities.Untitled */) /* all except untitled */), { force: true });
        }
        catch (error) {
            const notificationService = accessor.get(INotificationService);
            notificationService.error(nls.localize('genericRevertError', "Failed to revert '{0}': {1}", editors.map(({ editor }) => editor.getName()).join(', '), toErrorMessage(error, false)));
        }
    }
});
CommandsRegistry.registerCommand({
    id: REMOVE_ROOT_FOLDER_COMMAND_ID,
    handler: (accessor, resource) => {
        const contextService = accessor.get(IWorkspaceContextService);
        const uriIdentityService = accessor.get(IUriIdentityService);
        const workspace = contextService.getWorkspace();
        const resources = getMultiSelectedResources(resource, accessor.get(IListService), accessor.get(IEditorService), accessor.get(IEditorGroupsService), accessor.get(IExplorerService)).filter(resource => workspace.folders.some(folder => uriIdentityService.extUri.isEqual(folder.uri, resource)) // Need to verify resources are workspaces since multi selection can trigger this command on some non workspace resources
        );
        if (resources.length === 0) {
            const commandService = accessor.get(ICommandService);
            // Show a picker for the user to choose which folder to remove
            return commandService.executeCommand(RemoveRootFolderAction.ID);
        }
        const workspaceEditingService = accessor.get(IWorkspaceEditingService);
        return workspaceEditingService.removeFolders(resources);
    }
});
// Compressed item navigation
KeybindingsRegistry.registerCommandAndKeybindingRule({
    weight: 200 /* KeybindingWeight.WorkbenchContrib */ + 10,
    when: ContextKeyExpr.and(FilesExplorerFocusCondition, ExplorerCompressedFocusContext, ExplorerCompressedFirstFocusContext.negate()),
    primary: 15 /* KeyCode.LeftArrow */,
    id: PREVIOUS_COMPRESSED_FOLDER,
    handler: accessor => {
        const paneCompositeService = accessor.get(IPaneCompositePartService);
        const viewlet = paneCompositeService.getActivePaneComposite(0 /* ViewContainerLocation.Sidebar */);
        if (viewlet?.getId() !== VIEWLET_ID) {
            return;
        }
        const explorer = viewlet.getViewPaneContainer();
        const view = explorer.getExplorerView();
        view.previousCompressedStat();
    }
});
KeybindingsRegistry.registerCommandAndKeybindingRule({
    weight: 200 /* KeybindingWeight.WorkbenchContrib */ + 10,
    when: ContextKeyExpr.and(FilesExplorerFocusCondition, ExplorerCompressedFocusContext, ExplorerCompressedLastFocusContext.negate()),
    primary: 17 /* KeyCode.RightArrow */,
    id: NEXT_COMPRESSED_FOLDER,
    handler: accessor => {
        const paneCompositeService = accessor.get(IPaneCompositePartService);
        const viewlet = paneCompositeService.getActivePaneComposite(0 /* ViewContainerLocation.Sidebar */);
        if (viewlet?.getId() !== VIEWLET_ID) {
            return;
        }
        const explorer = viewlet.getViewPaneContainer();
        const view = explorer.getExplorerView();
        view.nextCompressedStat();
    }
});
KeybindingsRegistry.registerCommandAndKeybindingRule({
    weight: 200 /* KeybindingWeight.WorkbenchContrib */ + 10,
    when: ContextKeyExpr.and(FilesExplorerFocusCondition, ExplorerCompressedFocusContext, ExplorerCompressedFirstFocusContext.negate()),
    primary: 14 /* KeyCode.Home */,
    id: FIRST_COMPRESSED_FOLDER,
    handler: accessor => {
        const paneCompositeService = accessor.get(IPaneCompositePartService);
        const viewlet = paneCompositeService.getActivePaneComposite(0 /* ViewContainerLocation.Sidebar */);
        if (viewlet?.getId() !== VIEWLET_ID) {
            return;
        }
        const explorer = viewlet.getViewPaneContainer();
        const view = explorer.getExplorerView();
        view.firstCompressedStat();
    }
});
KeybindingsRegistry.registerCommandAndKeybindingRule({
    weight: 200 /* KeybindingWeight.WorkbenchContrib */ + 10,
    when: ContextKeyExpr.and(FilesExplorerFocusCondition, ExplorerCompressedFocusContext, ExplorerCompressedLastFocusContext.negate()),
    primary: 13 /* KeyCode.End */,
    id: LAST_COMPRESSED_FOLDER,
    handler: accessor => {
        const paneCompositeService = accessor.get(IPaneCompositePartService);
        const viewlet = paneCompositeService.getActivePaneComposite(0 /* ViewContainerLocation.Sidebar */);
        if (viewlet?.getId() !== VIEWLET_ID) {
            return;
        }
        const explorer = viewlet.getViewPaneContainer();
        const view = explorer.getExplorerView();
        view.lastCompressedStat();
    }
});
KeybindingsRegistry.registerCommandAndKeybindingRule({
    weight: 200 /* KeybindingWeight.WorkbenchContrib */,
    when: null,
    primary: isWeb ? (isWindows ? KeyChord(2048 /* KeyMod.CtrlCmd */ | 41 /* KeyCode.KeyK */, 44 /* KeyCode.KeyN */) : 2048 /* KeyMod.CtrlCmd */ | 512 /* KeyMod.Alt */ | 44 /* KeyCode.KeyN */) : 2048 /* KeyMod.CtrlCmd */ | 44 /* KeyCode.KeyN */,
    secondary: isWeb ? [2048 /* KeyMod.CtrlCmd */ | 44 /* KeyCode.KeyN */] : undefined,
    id: NEW_UNTITLED_FILE_COMMAND_ID,
    metadata: {
        description: NEW_UNTITLED_FILE_LABEL,
        args: [
            {
                isOptional: true,
                name: 'New Untitled Text File arguments',
                description: 'The editor view type or language ID if known',
                schema: {
                    'type': 'object',
                    'properties': {
                        'viewType': {
                            'type': 'string'
                        },
                        'languageId': {
                            'type': 'string'
                        }
                    }
                }
            }
        ]
    },
    handler: async (accessor, args) => {
        const editorService = accessor.get(IEditorService);
        await editorService.openEditor({
            resource: undefined,
            options: {
                override: args?.viewType,
                pinned: true
            },
            languageId: args?.languageId,
        });
    }
});
CommandsRegistry.registerCommand({
    id: NEW_FILE_COMMAND_ID,
    handler: async (accessor, args) => {
        const editorService = accessor.get(IEditorService);
        const dialogService = accessor.get(IFileDialogService);
        const fileService = accessor.get(IFileService);
        const createFileLocalized = nls.localize('newFileCommand.saveLabel', "Create File");
        const defaultFileUri = joinPath(await dialogService.defaultFilePath(), args?.fileName ?? 'Untitled.txt');
        const saveUri = await dialogService.showSaveDialog({ saveLabel: createFileLocalized, title: createFileLocalized, defaultUri: defaultFileUri });
        if (!saveUri) {
            return;
        }
        await fileService.createFile(saveUri, undefined, { overwrite: true });
        await editorService.openEditor({
            resource: saveUri,
            options: {
                override: args?.viewType,
                pinned: true
            },
            languageId: args?.languageId,
        });
    }
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZmlsZUNvbW1hbmRzLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvZmlsZXMvYnJvd3Nlci9maWxlQ29tbWFuZHMudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxLQUFLLEdBQUcsTUFBTSxvQkFBb0IsQ0FBQztBQUUxQyxPQUFPLEVBQUUsc0JBQXNCLEVBQTBCLGdCQUFnQixFQUF3RSxNQUFNLDJCQUEyQixDQUFDO0FBQ25MLE9BQU8sRUFBRSxxQkFBcUIsRUFBRSxNQUFNLGlEQUFpRCxDQUFDO0FBQ3hGLE9BQU8sRUFBdUMsaUJBQWlCLEVBQTJCLE1BQU0sOENBQThDLENBQUM7QUFDL0ksT0FBTyxFQUFFLFlBQVksRUFBRSxNQUFNLHdDQUF3QyxDQUFDO0FBQ3RFLE9BQU8sRUFBb0IscUJBQXFCLEVBQUUsTUFBTSw0REFBNEQsQ0FBQztBQUNySCxPQUFPLEVBQUUsd0JBQXdCLEVBQUUsdUJBQXVCLEVBQUUsTUFBTSxvREFBb0QsQ0FBQztBQUN2SCxPQUFPLEVBQUUsc0JBQXNCLEVBQUUsdUJBQXVCLEVBQUUsVUFBVSxFQUFFLDhCQUE4QixFQUFFLG1DQUFtQyxFQUFFLGtDQUFrQyxFQUFFLDJCQUEyQixFQUFFLHFCQUFxQixFQUFFLE9BQU8sRUFBRSxNQUFNLG9CQUFvQixDQUFDO0FBRXZRLE9BQU8sRUFBRSxpQkFBaUIsRUFBRSxNQUFNLDJEQUEyRCxDQUFDO0FBQzlGLE9BQU8sRUFBRSxjQUFjLEVBQUUsTUFBTSx5Q0FBeUMsQ0FBQztBQUN6RSxPQUFPLEVBQUUsZ0JBQWdCLEVBQW1CLGVBQWUsRUFBRSxNQUFNLGtEQUFrRCxDQUFDO0FBQ3RILE9BQU8sRUFBZSxrQkFBa0IsRUFBRSxjQUFjLEVBQUUsTUFBTSxzREFBc0QsQ0FBQztBQUN2SCxPQUFPLEVBQUUsWUFBWSxFQUFFLE1BQU0sNENB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