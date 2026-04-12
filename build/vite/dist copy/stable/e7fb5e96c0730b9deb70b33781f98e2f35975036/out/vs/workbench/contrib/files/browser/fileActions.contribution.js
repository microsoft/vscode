/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as nls from '../../../../nls.js';
import { ToggleAutoSaveAction, FocusFilesExplorer, GlobalCompareResourcesAction, ShowActiveFileInExplorer, CompareWithClipboardAction, NEW_FILE_COMMAND_ID, NEW_FILE_LABEL, NEW_FOLDER_COMMAND_ID, NEW_FOLDER_LABEL, TRIGGER_RENAME_LABEL, MOVE_FILE_TO_TRASH_LABEL, COPY_FILE_LABEL, PASTE_FILE_LABEL, FileCopiedContext, renameHandler, moveFileToTrashHandler, copyFileHandler, pasteFileHandler, deleteFileHandler, cutFileHandler, DOWNLOAD_COMMAND_ID, openFilePreserveFocusHandler, DOWNLOAD_LABEL, OpenActiveFileInEmptyWorkspace, UPLOAD_COMMAND_ID, UPLOAD_LABEL, CompareNewUntitledTextFilesAction, SetActiveEditorReadonlyInSession, SetActiveEditorWriteableInSession, ToggleActiveEditorReadonlyInSession, ResetActiveEditorReadonlyInSession } from './fileActions.js';
import { revertLocalChangesCommand, acceptLocalChangesCommand, CONFLICT_RESOLUTION_CONTEXT } from './editors/textFileSaveErrorHandler.js';
import { MenuId, MenuRegistry, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { openWindowCommand, newWindowCommand } from './fileCommands.js';
import { COPY_PATH_COMMAND_ID, REVEAL_IN_EXPLORER_COMMAND_ID, OPEN_TO_SIDE_COMMAND_ID, REVERT_FILE_COMMAND_ID, SAVE_FILE_COMMAND_ID, SAVE_FILE_LABEL, SAVE_FILE_AS_COMMAND_ID, SAVE_FILE_AS_LABEL, SAVE_ALL_IN_GROUP_COMMAND_ID, OpenEditorsGroupContext, COMPARE_WITH_SAVED_COMMAND_ID, COMPARE_RESOURCE_COMMAND_ID, SELECT_FOR_COMPARE_COMMAND_ID, ResourceSelectedForCompareContext, OpenEditorsDirtyEditorContext, COMPARE_SELECTED_COMMAND_ID, REMOVE_ROOT_FOLDER_COMMAND_ID, REMOVE_ROOT_FOLDER_LABEL, SAVE_FILES_COMMAND_ID, COPY_RELATIVE_PATH_COMMAND_ID, SAVE_FILE_WITHOUT_FORMATTING_COMMAND_ID, SAVE_FILE_WITHOUT_FORMATTING_LABEL, OpenEditorsReadonlyEditorContext, OPEN_WITH_EXPLORER_COMMAND_ID, NEW_UNTITLED_FILE_COMMAND_ID, NEW_UNTITLED_FILE_LABEL, SAVE_ALL_COMMAND_ID, OpenEditorsSelectedFileOrUntitledContext } from './fileConstants.js';
import { CommandsRegistry } from '../../../../platform/commands/common/commands.js';
import { ContextKeyExpr } from '../../../../platform/contextkey/common/contextkey.js';
import { KeybindingsRegistry } from '../../../../platform/keybinding/common/keybindingsRegistry.js';
import { FilesExplorerFocusCondition, ExplorerRootContext, ExplorerFolderContext, ExplorerResourceWritableContext, ExplorerResourceCut, ExplorerResourceMoveableToTrash, ExplorerResourceAvailableEditorIdsContext, FoldersViewVisibleContext } from '../common/files.js';
import { ADD_ROOT_FOLDER_COMMAND_ID, ADD_ROOT_FOLDER_LABEL } from '../../../browser/actions/workspaceCommands.js';
import { CLOSE_SAVED_EDITORS_COMMAND_ID, CLOSE_EDITORS_IN_GROUP_COMMAND_ID, CLOSE_EDITOR_COMMAND_ID, CLOSE_OTHER_EDITORS_IN_GROUP_COMMAND_ID, REOPEN_WITH_COMMAND_ID } from '../../../browser/parts/editor/editorCommands.js';
import { AutoSaveAfterShortDelayContext } from '../../../services/filesConfiguration/common/filesConfigurationService.js';
import { WorkbenchListDoubleSelection } from '../../../../platform/list/browser/listService.js';
import { Schemas } from '../../../../base/common/network.js';
import { DirtyWorkingCopiesContext, EnterMultiRootWorkspaceSupportContext, HasWebFileSystemAccess, WorkbenchStateContext, WorkspaceFolderCountContext, SidebarFocusContext, ActiveEditorCanRevertContext, ActiveEditorContext, ResourceContextKey, ActiveEditorAvailableEditorIdsContext, MultipleEditorsSelectedInGroupContext, TwoEditorsSelectedInGroupContext, SelectedEditorsInGroupFileOrUntitledResourceContextKey } from '../../../common/contextkeys.js';
import { IsWebContext } from '../../../../platform/contextkey/common/contextkeys.js';
import { IExplorerService } from './files.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { Categories } from '../../../../platform/action/common/actionCommonCategories.js';
// Contribute Global Actions
registerAction2(GlobalCompareResourcesAction);
registerAction2(FocusFilesExplorer);
registerAction2(ShowActiveFileInExplorer);
registerAction2(CompareWithClipboardAction);
registerAction2(CompareNewUntitledTextFilesAction);
registerAction2(ToggleAutoSaveAction);
registerAction2(OpenActiveFileInEmptyWorkspace);
registerAction2(SetActiveEditorReadonlyInSession);
registerAction2(SetActiveEditorWriteableInSession);
registerAction2(ToggleActiveEditorReadonlyInSession);
registerAction2(ResetActiveEditorReadonlyInSession);
// Commands
CommandsRegistry.registerCommand('_files.windowOpen', openWindowCommand);
CommandsRegistry.registerCommand('_files.newWindow', newWindowCommand);
const explorerCommandsWeightBonus = 10; // give our commands a little bit more weight over other default list/tree commands
const RENAME_ID = 'renameFile';
KeybindingsRegistry.registerCommandAndKeybindingRule({
    id: RENAME_ID,
    weight: 200 /* KeybindingWeight.WorkbenchContrib */ + explorerCommandsWeightBonus,
    when: ContextKeyExpr.and(FilesExplorerFocusCondition, ExplorerRootContext.toNegated(), ExplorerResourceWritableContext),
    primary: 60 /* KeyCode.F2 */,
    mac: {
        primary: 3 /* KeyCode.Enter */
    },
    handler: renameHandler
});
const MOVE_FILE_TO_TRASH_ID = 'moveFileToTrash';
KeybindingsRegistry.registerCommandAndKeybindingRule({
    id: MOVE_FILE_TO_TRASH_ID,
    weight: 200 /* KeybindingWeight.WorkbenchContrib */ + explorerCommandsWeightBonus,
    when: ContextKeyExpr.and(FilesExplorerFocusCondition, ExplorerResourceMoveableToTrash),
    primary: 20 /* KeyCode.Delete */,
    mac: {
        primary: 2048 /* KeyMod.CtrlCmd */ | 1 /* KeyCode.Backspace */,
        secondary: [20 /* KeyCode.Delete */]
    },
    handler: moveFileToTrashHandler
});
const DELETE_FILE_ID = 'deleteFile';
KeybindingsRegistry.registerCommandAndKeybindingRule({
    id: DELETE_FILE_ID,
    weight: 200 /* KeybindingWeight.WorkbenchContrib */ + explorerCommandsWeightBonus,
    when: FilesExplorerFocusCondition,
    primary: 1024 /* KeyMod.Shift */ | 20 /* KeyCode.Delete */,
    mac: {
        primary: 2048 /* KeyMod.CtrlCmd */ | 512 /* KeyMod.Alt */ | 1 /* KeyCode.Backspace */
    },
    handler: deleteFileHandler
});
KeybindingsRegistry.registerCommandAndKeybindingRule({
    id: DELETE_FILE_ID,
    weight: 200 /* KeybindingWeight.WorkbenchContrib */ + explorerCommandsWeightBonus,
    when: ContextKeyExpr.and(FilesExplorerFocusCondition, ExplorerResourceMoveableToTrash.toNegated()),
    primary: 20 /* KeyCode.Delete */,
    mac: {
        primary: 2048 /* KeyMod.CtrlCmd */ | 1 /* KeyCode.Backspace */
    },
    handler: deleteFileHandler
});
const CUT_FILE_ID = 'filesExplorer.cut';
KeybindingsRegistry.registerCommandAndKeybindingRule({
    id: CUT_FILE_ID,
    weight: 200 /* KeybindingWeight.WorkbenchContrib */ + explorerCommandsWeightBonus,
    when: ContextKeyExpr.and(FilesExplorerFocusCondition, ExplorerRootContext.toNegated(), ExplorerResourceWritableContext),
    primary: 2048 /* KeyMod.CtrlCmd */ | 54 /* KeyCode.KeyX */,
    handler: cutFileHandler,
});
const COPY_FILE_ID = 'filesExplorer.copy';
KeybindingsRegistry.registerCommandAndKeybindingRule({
    id: COPY_FILE_ID,
    weight: 200 /* KeybindingWeight.WorkbenchContrib */ + explorerCommandsWeightBonus,
    when: ContextKeyExpr.and(FilesExplorerFocusCondition, ExplorerRootContext.toNegated()),
    primary: 2048 /* KeyMod.CtrlCmd */ | 33 /* KeyCode.KeyC */,
    handler: copyFileHandler,
});
const PASTE_FILE_ID = 'filesExplorer.paste';
CommandsRegistry.registerCommand(PASTE_FILE_ID, pasteFileHandler);
KeybindingsRegistry.registerKeybindingRule({
    id: `^${PASTE_FILE_ID}`, // the `^` enables pasting files into the explorer by preventing default bubble up
    weight: 200 /* KeybindingWeight.WorkbenchContrib */ + explorerCommandsWeightBonus,
    when: ContextKeyExpr.and(FilesExplorerFocusCondition, ExplorerResourceWritableContext),
    primary: 2048 /* KeyMod.CtrlCmd */ | 52 /* KeyCode.KeyV */,
});
KeybindingsRegistry.registerCommandAndKeybindingRule({
    id: 'filesExplorer.cancelCut',
    weight: 200 /* KeybindingWeight.WorkbenchContrib */ + explorerCommandsWeightBonus,
    when: ContextKeyExpr.and(FilesExplorerFocusCondition, ExplorerResourceCut),
    primary: 9 /* KeyCode.Escape */,
    handler: async (accessor) => {
        const explorerService = accessor.get(IExplorerService);
        await explorerService.setToCopy([], true);
    }
});
KeybindingsRegistry.registerCommandAndKeybindingRule({
    id: 'filesExplorer.openFilePreserveFocus',
    weight: 200 /* KeybindingWeight.WorkbenchContrib */ + explorerCommandsWeightBonus,
    when: ContextKeyExpr.and(FilesExplorerFocusCondition, ExplorerFolderContext.toNegated()),
    primary: 10 /* KeyCode.Space */,
    handler: openFilePreserveFocusHandler
});
const copyPathCommand = {
    id: COPY_PATH_COMMAND_ID,
    title: nls.localize('copyPath', "Copy Path")
};
const copyRelativePathCommand = {
    id: COPY_RELATIVE_PATH_COMMAND_ID,
    title: nls.localize('copyRelativePath', "Copy Relative Path")
};
export const revealInSideBarCommand = {
    id: REVEAL_IN_EXPLORER_COMMAND_ID,
    title: nls.localize('revealInSideBar', "Reveal in Explorer View")
};
// Editor Title Context Menu
appendEditorTitleContextMenuItem(COPY_PATH_COMMAND_ID, copyPathCommand.title, ResourceContextKey.IsFileSystemResource, '1_cutcopypaste', true);
appendEditorTitleContextMenuItem(COPY_RELATIVE_PATH_COMMAND_ID, copyRelativePathCommand.title, ResourceContextKey.IsFileSystemResource, '1_cutcopypaste', true);
appendEditorTitleContextMenuItem(revealInSideBarCommand.id, revealInSideBarCommand.title, ResourceContextKey.IsFileSystemResource, '2_files', false, 1);
export function appendEditorTitleContextMenuItem(id, title, when, group, supportsMultiSelect, order) {
    const precondition = supportsMultiSelect !== true ? MultipleEditorsSelectedInGroupContext.negate() : undefined;
    // Menu
    MenuRegistry.appendMenuItem(MenuId.EditorTitleContext, {
        command: { id, title, precondition },
        when,
        group,
        order,
    });
}
// Editor Title Menu for Conflict Resolution
appendSaveConflictEditorTitleAction('workbench.files.action.acceptLocalChanges', nls.localize('acceptLocalChanges', "Use your changes and overwrite file contents"), Codicon.check, -10, acceptLocalChangesCommand);
appendSaveConflictEditorTitleAction('workbench.files.action.revertLocalChanges', nls.localize('revertLocalChanges', "Discard your changes and revert to file contents"), Codicon.discard, -9, revertLocalChangesCommand);
function appendSaveConflictEditorTitleAction(id, title, icon, order, command) {
    // Command
    CommandsRegistry.registerCommand(id, command);
    // Action
    MenuRegistry.appendMenuItem(MenuId.EditorTitle, {
        command: { id, title, icon },
        when: ContextKeyExpr.equals(CONFLICT_RESOLUTION_CONTEXT, true),
        group: 'navigation',
        order
    });
}
// Menu registration - command palette
export function appendToCommandPalette({ id, title, category, metadata }, when) {
    MenuRegistry.appendMenuItem(MenuId.CommandPalette, {
        command: {
            id,
            title,
            category,
            metadata
        },
        when
    });
}
appendToCommandPalette({
    id: COPY_PATH_COMMAND_ID,
    title: nls.localize2('copyPathOfActive', "Copy Path of Active File"),
    category: Categories.File
});
appendToCommandPalette({
    id: COPY_RELATIVE_PATH_COMMAND_ID,
    title: nls.localize2('copyRelativePathOfActive', "Copy Relative Path of Active File"),
    category: Categories.File
});
appendToCommandPalette({
    id: SAVE_FILE_COMMAND_ID,
    title: SAVE_FILE_LABEL,
    category: Categories.File
});
appendToCommandPalette({
    id: SAVE_FILE_WITHOUT_FORMATTING_COMMAND_ID,
    title: SAVE_FILE_WITHOUT_FORMATTING_LABEL,
    category: Categories.File
});
appendToCommandPalette({
    id: SAVE_ALL_IN_GROUP_COMMAND_ID,
    title: nls.localize2('saveAllInGroup', "Save All in Group"),
    category: Categories.File
});
appendToCommandPalette({
    id: SAVE_FILES_COMMAND_ID,
    title: nls.localize2('saveFiles', "Save All Files"),
    category: Categories.File
});
appendToCommandPalette({
    id: REVERT_FILE_COMMAND_ID,
    title: nls.localize2('revert', "Revert File"),
    category: Categories.File
});
appendToCommandPalette({
    id: COMPARE_WITH_SAVED_COMMAND_ID,
    title: nls.localize2('compareActiveWithSaved', "Compare Active File with Saved"),
    category: Categories.File,
    metadata: {
        description: nls.localize2('compareActiveWithSavedMeta', "Opens a new diff editor to compare the active file with the version on disk.")
    }
});
appendToCommandPalette({
    id: SAVE_FILE_AS_COMMAND_ID,
    title: SAVE_FILE_AS_LABEL,
    category: Categories.File
});
appendToCommandPalette({
    id: NEW_FILE_COMMAND_ID,
    title: NEW_FILE_LABEL,
    category: Categories.File
}, WorkspaceFolderCountContext.notEqualsTo('0'));
appendToCommandPalette({
    id: NEW_FOLDER_COMMAND_ID,
    title: NEW_FOLDER_LABEL,
    category: Categories.File,
    metadata: { description: nls.localize2('newFolderDescription', "Create a new folder or directory") }
}, WorkspaceFolderCountContext.notEqualsTo('0'));
appendToCommandPalette({
    id: NEW_UNTITLED_FILE_COMMAND_ID,
    title: NEW_UNTITLED_FILE_LABEL,
    category: Categories.File
});
// Menu registration - open editors
const isFileOrUntitledResourceContextKey = ContextKeyExpr.or(ResourceContextKey.IsFileSystemResource, ResourceContextKey.Scheme.isEqualTo(Schemas.untitled));
const openToSideCommand = {
    id: OPEN_TO_SIDE_COMMAND_ID,
    title: nls.localize('openToSide', "Open to the Side")
};
MenuRegistry.appendMenuItem(MenuId.OpenEditorsContext, {
    group: 'navigation',
    order: 10,
    command: openToSideCommand,
    when: isFileOrUntitledResourceContextKey
});
MenuRegistry.appendMenuItem(MenuId.OpenEditorsContext, {
    group: '1_open',
    order: 10,
    command: {
        id: REOPEN_WITH_COMMAND_ID,
        title: nls.localize('reopenWith', "Reopen Editor With...")
    },
    when: ContextKeyExpr.and(
    // Editors with Available Choices to Open With
    ActiveEditorAvailableEditorIdsContext, 
    // Not: editor groups
    OpenEditorsGroupContext.toNegated())
});
MenuRegistry.appendMenuItem(MenuId.OpenEditorsContext, {
    group: '1_cutcopypaste',
    order: 10,
    command: copyPathCommand,
    when: ResourceContextKey.IsFileSystemResource
});
MenuRegistry.appendMenuItem(MenuId.OpenEditorsContext, {
    group: '1_cutcopypaste',
    order: 20,
    command: copyRelativePathCommand,
    when: ResourceContextKey.IsFileSystemResource
});
MenuRegistry.appendMenuItem(MenuId.OpenEditorsContext, {
    group: '2_save',
    order: 10,
    command: {
        id: SAVE_FILE_COMMAND_ID,
        title: SAVE_FILE_LABEL,
        precondition: OpenEditorsDirtyEditorContext
    },
    when: ContextKeyExpr.or(
    // Untitled Editors
    ResourceContextKey.Scheme.isEqualTo(Schemas.untitled), 
    // Or:
    ContextKeyExpr.and(
    // Not: editor groups
    OpenEditorsGroupContext.toNegated(), 
    // Not: readonly editors
    OpenEditorsReadonlyEditorContext.toNegated(), 
    // Not: auto save after short delay
    AutoSaveAfterShortDelayContext.toNegated()))
});
MenuRegistry.appendMenuItem(MenuId.OpenEditorsContext, {
    group: '2_save',
    order: 20,
    command: {
        id: REVERT_FILE_COMMAND_ID,
        title: nls.localize('revert', "Revert File"),
        precondition: OpenEditorsDirtyEditorContext
    },
    when: ContextKeyExpr.and(
    // Not: editor groups
    OpenEditorsGroupContext.toNegated(), 
    // Not: readonly editors
    OpenEditorsReadonlyEditorContext.toNegated(), 
    // Not: untitled editors (revert closes them)
    ResourceContextKey.Scheme.notEqualsTo(Schemas.untitled), 
    // Not: auto save after short delay
    AutoSaveAfterShortDelayContext.toNegated())
});
MenuRegistry.appendMenuItem(MenuId.OpenEditorsContext, {
    group: '2_save',
    order: 30,
    command: {
        id: SAVE_ALL_IN_GROUP_COMMAND_ID,
        title: nls.localize('saveAll', "Save All"),
        precondition: DirtyWorkingCopiesContext
    },
    // Editor Group
    when: OpenEditorsGroupContext
});
MenuRegistry.appendMenuItem(MenuId.OpenEditorsContext, {
    group: '3_compare',
    order: 10,
    command: {
        id: COMPARE_WITH_SAVED_COMMAND_ID,
        title: nls.localize('compareWithSaved', "Compare with Saved"),
        precondition: OpenEditorsDirtyEditorContext
    },
    when: ContextKeyExpr.and(ResourceContextKey.IsFileSystemResource, AutoSaveAfterShortDelayContext.toNegated(), WorkbenchListDoubleSelection.toNegated())
});
const compareResourceCommand = {
    id: COMPARE_RESOURCE_COMMAND_ID,
    title: nls.localize('compareWithSelected', "Compare with Selected")
};
MenuRegistry.appendMenuItem(MenuId.OpenEditorsContext, {
    group: '3_compare',
    order: 20,
    command: compareResourceCommand,
    when: ContextKeyExpr.and(ResourceContextKey.HasResource, ResourceSelectedForCompareContext, isFileOrUntitledResourceContextKey, WorkbenchListDoubleSelection.toNegated())
});
const selectForCompareCommand = {
    id: SELECT_FOR_COMPARE_COMMAND_ID,
    title: nls.localize('compareSource', "Select for Compare")
};
MenuRegistry.appendMenuItem(MenuId.OpenEditorsContext, {
    group: '3_compare',
    order: 30,
    command: selectForCompareCommand,
    when: ContextKeyExpr.and(ResourceContextKey.HasResource, isFileOrUntitledResourceContextKey, WorkbenchListDoubleSelection.toNegated())
});
const compareSelectedCommand = {
    id: COMPARE_SELECTED_COMMAND_ID,
    title: nls.localize('compareSelected', "Compare Selected")
};
MenuRegistry.appendMenuItem(MenuId.OpenEditorsContext, {
    group: '3_compare',
    order: 30,
    command: compareSelectedCommand,
    when: ContextKeyExpr.and(ResourceContextKey.HasResource, WorkbenchListDoubleSelection, OpenEditorsSelectedFileOrUntitledContext)
});
MenuRegistry.appendMenuItem(MenuId.EditorTitleContext, {
    group: '1_compare',
    order: 30,
    command: compareSelectedCommand,
    when: ContextKeyExpr.and(ResourceContextKey.HasResource, TwoEditorsSelectedInGroupContext, SelectedEditorsInGroupFileOrUntitledResourceContextKey)
});
MenuRegistry.appendMenuItem(MenuId.OpenEditorsContext, {
    group: '4_close',
    order: 10,
    command: {
        id: CLOSE_EDITOR_COMMAND_ID,
        title: nls.localize('close', "Close")
    },
    when: OpenEditorsGroupContext.toNegated()
});
MenuRegistry.appendMenuItem(MenuId.OpenEditorsContext, {
    group: '4_close',
    order: 20,
    command: {
        id: CLOSE_OTHER_EDITORS_IN_GROUP_COMMAND_ID,
        title: nls.localize('closeOthers', "Close Others")
    },
    when: OpenEditorsGroupContext.toNegated()
});
MenuRegistry.appendMenuItem(MenuId.OpenEditorsContext, {
    group: '4_close',
    order: 30,
    command: {
        id: CLOSE_SAVED_EDITORS_COMMAND_ID,
        title: nls.localize('closeSaved', "Close Saved")
    }
});
MenuRegistry.appendMenuItem(MenuId.OpenEditorsContext, {
    group: '4_close',
    order: 40,
    command: {
        id: CLOSE_EDITORS_IN_GROUP_COMMAND_ID,
        title: nls.localize('closeAll', "Close All")
    }
});
// Menu registration - explorer
MenuRegistry.appendMenuItem(MenuId.ExplorerContext, {
    group: 'navigation',
    order: 4,
    command: {
        id: NEW_FILE_COMMAND_ID,
        title: NEW_FILE_LABEL,
        precondition: ExplorerResourceWritableContext
    },
    when: ExplorerFolderContext
});
MenuRegistry.appendMenuItem(MenuId.ExplorerContext, {
    group: 'navigation',
    order: 6,
    command: {
        id: NEW_FOLDER_COMMAND_ID,
        title: NEW_FOLDER_LABEL,
        precondition: ExplorerResourceWritableContext
    },
    when: ExplorerFolderContext
});
MenuRegistry.appendMenuItem(MenuId.ExplorerContext, {
    group: 'navigation',
    order: 10,
    command: openToSideCommand,
    when: ContextKeyExpr.and(ExplorerFolderContext.toNegated(), ResourceContextKey.HasResource)
});
MenuRegistry.appendMenuItem(MenuId.ExplorerContext, {
    group: 'navigation',
    order: 20,
    command: {
        id: OPEN_WITH_EXPLORER_COMMAND_ID,
        title: nls.localize('explorerOpenWith', "Open With..."),
    },
    when: ContextKeyExpr.and(ExplorerFolderContext.toNegated(), ExplorerResourceAvailableEditorIdsContext),
});
MenuRegistry.appendMenuItem(MenuId.ExplorerContext, {
    group: '3_compare',
    order: 20,
    command: compareResourceCommand,
    when: ContextKeyExpr.and(ExplorerFolderContext.toNegated(), ResourceContextKey.HasResource, ResourceSelectedForCompareContext, WorkbenchListDoubleSelection.toNegated())
});
MenuRegistry.appendMenuItem(MenuId.ExplorerContext, {
    group: '3_compare',
    order: 30,
    command: selectForCompareCommand,
    when: ContextKeyExpr.and(ExplorerFolderContext.toNegated(), ResourceContextKey.HasResource, WorkbenchListDoubleSelection.toNegated())
});
MenuRegistry.appendMenuItem(MenuId.ExplorerContext, {
    group: '3_compare',
    order: 30,
    command: compareSelectedCommand,
    when: ContextKeyExpr.and(ExplorerFolderContext.toNegated(), ResourceContextKey.HasResource, WorkbenchListDoubleSelection)
});
MenuRegistry.appendMenuItem(MenuId.ExplorerContext, {
    group: '5_cutcopypaste',
    order: 8,
    command: {
        id: CUT_FILE_ID,
        title: nls.localize('cut', "Cut"),
    },
    when: ContextKeyExpr.and(ExplorerRootContext.toNegated(), ExplorerResourceWritableContext)
});
MenuRegistry.appendMenuItem(MenuId.ExplorerContext, {
    group: '5_cutcopypaste',
    order: 10,
    command: {
        id: COPY_FILE_ID,
        title: COPY_FILE_LABEL,
    },
    when: ExplorerRootContext.toNegated()
});
MenuRegistry.appendMenuItem(MenuId.ExplorerContext, {
    group: '5_cutcopypaste',
    order: 20,
    command: {
        id: PASTE_FILE_ID,
        title: PASTE_FILE_LABEL,
        precondition: ContextKeyExpr.and(ExplorerResourceWritableContext, FileCopiedContext)
    },
    when: ExplorerFolderContext
});
MenuRegistry.appendMenuItem(MenuId.ExplorerContext, ({
    group: '5b_importexport',
    order: 10,
    command: {
        id: DOWNLOAD_COMMAND_ID,
        title: DOWNLOAD_LABEL
    },
    when: ContextKeyExpr.or(
    // native: for any remote resource
    ContextKeyExpr.and(IsWebContext.toNegated(), ResourceContextKey.Scheme.notEqualsTo(Schemas.file)), 
    // web: for any files
    ContextKeyExpr.and(IsWebContext, ExplorerFolderContext.toNegated(), ExplorerRootContext.toNegated()), 
    // web: for any folders if file system API support is provided
    ContextKeyExpr.and(IsWebContext, HasWebFileSystemAccess))
}));
MenuRegistry.appendMenuItem(MenuId.ExplorerContext, ({
    group: '5b_importexport',
    order: 20,
    command: {
        id: UPLOAD_COMMAND_ID,
        title: UPLOAD_LABEL,
    },
    when: ContextKeyExpr.and(
    // only in web
    IsWebContext, 
    // only on folders
    ExplorerFolderContext, 
    // only on writable folders
    ExplorerResourceWritableContext)
}));
MenuRegistry.appendMenuItem(MenuId.ExplorerContext, {
    group: '6_copypath',
    order: 10,
    command: copyPathCommand,
    when: ResourceContextKey.IsFileSystemResource
});
MenuRegistry.appendMenuItem(MenuId.ExplorerContext, {
    group: '6_copypath',
    order: 20,
    command: copyRelativePathCommand,
    when: ResourceContextKey.IsFileSystemResource
});
MenuRegistry.appendMenuItem(MenuId.ExplorerContext, {
    group: '2_workspace',
    order: 10,
    command: {
        id: ADD_ROOT_FOLDER_COMMAND_ID,
        title: ADD_ROOT_FOLDER_LABEL,
    },
    when: ContextKeyExpr.and(ExplorerRootContext, ContextKeyExpr.or(EnterMultiRootWorkspaceSupportContext, WorkbenchStateContext.isEqualTo('workspace')))
});
MenuRegistry.appendMenuItem(MenuId.ExplorerContext, {
    group: '2_workspace',
    order: 30,
    command: {
        id: REMOVE_ROOT_FOLDER_COMMAND_ID,
        title: REMOVE_ROOT_FOLDER_LABEL,
    },
    when: ContextKeyExpr.and(ExplorerRootContext, ExplorerFolderContext, ContextKeyExpr.and(WorkspaceFolderCountContext.notEqualsTo('0'), ContextKeyExpr.or(EnterMultiRootWorkspaceSupportContext, WorkbenchStateContext.isEqualTo('workspace'))))
});
MenuRegistry.appendMenuItem(MenuId.ExplorerContext, {
    group: '7_modification',
    order: 10,
    command: {
        id: RENAME_ID,
        title: TRIGGER_RENAME_LABEL,
        precondition: ExplorerResourceWritableContext,
    },
    when: ExplorerRootContext.toNegated()
});
MenuRegistry.appendMenuItem(MenuId.ExplorerContext, {
    group: '7_modification',
    order: 20,
    command: {
        id: MOVE_FILE_TO_TRASH_ID,
        title: MOVE_FILE_TO_TRASH_LABEL
    },
    alt: {
        id: DELETE_FILE_ID,
        title: nls.localize('deleteFile', "Delete Permanently")
    },
    when: ContextKeyExpr.and(ExplorerRootContext.toNegated(), ExplorerResourceMoveableToTrash)
});
MenuRegistry.appendMenuItem(MenuId.ExplorerContext, {
    group: '7_modification',
    order: 20,
    command: {
        id: DELETE_FILE_ID,
        title: nls.localize('deleteFile', "Delete Permanently")
    },
    when: ContextKeyExpr.and(ExplorerRootContext.toNegated(), ExplorerResourceMoveableToTrash.toNegated())
});
// Empty Editor Group / Editor Tabs Container Context Menu
for (const menuId of [MenuId.EmptyEditorGroupContext, MenuId.EditorTabsBarContext]) {
    MenuRegistry.appendMenuItem(menuId, { command: { id: NEW_UNTITLED_FILE_COMMAND_ID, title: nls.localize('newFile', "New Text File") }, group: '1_file', order: 10 });
    MenuRegistry.appendMenuItem(menuId, { command: { id: 'workbench.action.quickOpen', title: nls.localize('openFile', "Open File...") }, group: '1_file', order: 20 });
}
// File menu
MenuRegistry.appendMenuItem(MenuId.MenubarFileMenu, {
    group: '1_new',
    command: {
        id: NEW_UNTITLED_FILE_COMMAND_ID,
        title: nls.localize({ key: 'miNewFile', comment: ['&& denotes a mnemonic'] }, "&&New Text File")
    },
    order: 1
});
MenuRegistry.appendMenuItem(MenuId.MenubarFileMenu, {
    group: '4_save',
    command: {
        id: SAVE_FILE_COMMAND_ID,
        title: nls.localize({ key: 'miSave', comment: ['&& denotes a mnemonic'] }, "&&Save"),
        precondition: ContextKeyExpr.or(ActiveEditorContext, ContextKeyExpr.and(FoldersViewVisibleContext, SidebarFocusContext))
    },
    order: 1
});
MenuRegistry.appendMenuItem(MenuId.MenubarFileMenu, {
    group: '4_save',
    command: {
        id: SAVE_FILE_AS_COMMAND_ID,
        title: nls.localize({ key: 'miSaveAs', comment: ['&& denotes a mnemonic'] }, "Save &&As..."),
        precondition: ContextKeyExpr.or(ActiveEditorContext, ContextKeyExpr.and(FoldersViewVisibleContext, SidebarFocusContext))
    },
    order: 2
});
MenuRegistry.appendMenuItem(MenuId.MenubarFileMenu, {
    group: '4_save',
    command: {
        id: SAVE_ALL_COMMAND_ID,
        title: nls.localize({ key: 'miSaveAll', comment: ['&& denotes a mnemonic'] }, "Save A&&ll"),
        precondition: DirtyWorkingCopiesContext
    },
    order: 3
});
MenuRegistry.appendMenuItem(MenuId.MenubarFileMenu, {
    group: '5_autosave',
    command: {
        id: ToggleAutoSaveAction.ID,
        title: nls.localize({ key: 'miAutoSave', comment: ['&& denotes a mnemonic'] }, "A&&uto Save"),
        toggled: ContextKeyExpr.notEquals('config.files.autoSave', 'off')
    },
    order: 1
});
MenuRegistry.appendMenuItem(MenuId.MenubarFileMenu, {
    group: '6_close',
    command: {
        id: REVERT_FILE_COMMAND_ID,
        title: nls.localize({ key: 'miRevert', comment: ['&& denotes a mnemonic'] }, "Re&&vert File"),
        precondition: ContextKeyExpr.or(
        // Active editor can revert
        ContextKeyExpr.and(ActiveEditorCanRevertContext), 
        // Explorer focused but not on untitled
        ContextKeyExpr.and(ResourceContextKey.Scheme.notEqualsTo(Schemas.untitled), FoldersViewVisibleContext, SidebarFocusContext)),
    },
    order: 1
});
MenuRegistry.appendMenuItem(MenuId.MenubarFileMenu, {
    group: '6_close',
    command: {
        id: CLOSE_EDITOR_COMMAND_ID,
        title: nls.localize({ key: 'miCloseEditor', comment: ['&& denotes a mnemonic'] }, "&&Close Editor"),
        precondition: ContextKeyExpr.or(ActiveEditorContext, ContextKeyExpr.and(FoldersViewVisibleContext, SidebarFocusContext))
    },
    order: 2
});
// Go to menu
MenuRegistry.appendMenuItem(MenuId.MenubarGoMenu, {
    group: '3_global_nav',
    command: {
        id: 'workbench.action.quickOpen',
        title: nls.localize({ key: 'miGotoFile', comment: ['&& denotes a mnemonic'] }, "Go to &&File...")
    },
    order: 1
});
// Chat used attachment anchor context menu
MenuRegistry.appendMenuItem(MenuId.ChatAttachmentsContext, {
    group: 'navigation',
    order: 10,
    command: openToSideCommand,
    when: ContextKeyExpr.and(ResourceContextKey.IsFileSystemResource, ExplorerFolderContext.toNegated())
});
MenuRegistry.appendMenuItem(MenuId.ChatAttachmentsContext, {
    group: 'navigation',
    order: 20,
    command: revealInSideBarCommand,
    when: ResourceContextKey.IsFileSystemResource
});
MenuRegistry.appendMenuItem(MenuId.ChatAttachmentsContext, {
    group: '1_cutcopypaste',
    order: 10,
    command: copyPathCommand,
    when: ResourceContextKey.IsFileSystemResource
});
MenuRegistry.appendMenuItem(MenuId.ChatAttachmentsContext, {
    group: '1_cutcopypaste',
    order: 20,
    command: copyRelativePathCommand,
    when: ResourceContextKey.IsFileSystemResource
});
// Chat resource anchor attachments/anchors context menu
for (const menuId of [MenuId.ChatInlineResourceAnchorContext, MenuId.ChatInputResourceAttachmentContext]) {
    MenuRegistry.appendMenuItem(menuId, {
        group: 'navigation',
        order: 10,
        command: openToSideCommand,
        when: ContextKeyExpr.and(ResourceContextKey.HasResource, ExplorerFolderContext.toNegated())
    });
    MenuRegistry.appendMenuItem(menuId, {
        group: 'navigation',
        order: 20,
        command: revealInSideBarCommand,
        when: ResourceContextKey.IsFileSystemResource
    });
    MenuRegistry.appendMenuItem(menuId, {
        group: '1_cutcopypaste',
        order: 10,
        command: copyPathCommand,
        when: ResourceContextKey.IsFileSystemResource
    });
    MenuRegistry.appendMenuItem(menuId, {
        group: '1_cutcopypaste',
        order: 20,
        command: copyRelativePathCommand,
        when: ResourceContextKey.IsFileSystemResource
    });
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZmlsZUFjdGlvbnMuY29udHJpYnV0aW9uLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvZmlsZXMvYnJvd3Nlci9maWxlQWN0aW9ucy5jb250cmlidXRpb24udHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxLQUFLLEdBQUcsTUFBTSxvQkFBb0IsQ0FBQztBQUMxQyxPQUFPLEVBQUUsb0JBQW9CLEVBQUUsa0JBQWtCLEVBQUUsNEJBQTRCLEVBQUUsd0JBQXdCLEVBQUUsMEJBQTBCLEVBQUUsbUJBQW1CLEVBQUUsY0FBYyxFQUFFLHFCQUFxQixFQUFFLGdCQUFnQixFQUFFLG9CQUFvQixFQUFFLHdCQUF3QixFQUFFLGVBQWUsRUFBRSxnQkFBZ0IsRUFBRSxpQkFBaUIsRUFBRSxhQUFhLEVBQUUsc0JBQXNCLEVBQUUsZUFBZSxFQUFFLGdCQUFnQixFQUFFLGlCQUFpQixFQUFFLGNBQWMsRUFBRSxtQkFBbUIsRUFBRSw0QkFBNEIsRUFBRSxjQUFjLEVBQUUsOEJBQThCLEVBQUUsaUJBQWlCLEVBQUUsWUFBWSxFQUFFLGlDQUFpQyxFQUFFLGdDQUFnQyxFQUFFLGlDQUFpQyxFQUFFLG1DQUFtQyxFQUFFLGtDQUFrQyxFQUFFLE1BQU0sa0JBQWtCLENBQUM7QUFDdHZCLE9BQU8sRUFBRSx5QkFBeUIsRUFBRSx5QkFBeUIsRUFBRSwyQkFBMkIsRUFBRSxNQUFNLHVDQUF1QyxDQUFDO0FBQzFJLE9BQU8sRUFBRSxNQUFNLEVBQUUsWUFBWSxFQUFFLGVBQWUsRUFBRSxNQUFNLGdEQUFnRCxDQUFDO0FBR3ZHLE9BQU8sRUFBRSxpQkFBaUIsRUFBRSxnQkFBZ0IsRUFBRSxNQUFNLG1CQUFtQixDQUFDO0FBQ3hFLE9BQU8sRUFBRSxvQkFBb0IsRUFBRSw2QkFBNkIsRUFBRSx1QkFBdUIsRUFBRSxzQkFBc0IsRUFBRSxvQkFBb0IsRUFBRSxlQUFlLEVBQUUsdUJBQXVCLEVBQUUsa0JBQWtCLEVBQUUsNEJBQTRCLEVBQUUsdUJBQXVCLEVBQUUsNkJBQTZCLEVBQUUsMkJBQTJCLEVBQUUsNkJBQTZCLEVBQUUsaUNBQWlDLEVBQUUsNkJBQTZCLEVBQUUsMkJBQTJCLEVBQUUsNkJBQTZCLEVBQUUsd0JBQXdCLEVBQUUscUJBQXFCLEVBQUUsNkJBQTZCLEVBQUUsdUNBQXVDLEVBQUUsa0NBQWtDLEVBQUUsZ0NBQWdDLEVBQUUsNkJBQTZCLEVBQUUsNEJBQTRCLEVBQUUsdUJBQXVCLEVBQUUsbUJBQW1CLEVBQUUsd0NBQXdDLEVBQUUsTUFBTSxvQkFBb0IsQ0FBQztBQUNsMEIsT0FBTyxFQUFFLGdCQUFnQixFQUFtQixNQUFNLGtEQUFrRCxDQUFDO0FBQ3JHLE9BQU8sRUFBRSxjQUFjLEVBQXdCLE1BQU0sc0RBQXNELENBQUM7QUFDNUcsT0FBTyxFQUFFLG1CQUFtQixFQUFvQixNQUFNLCtEQUErRCxDQUFDO0FBQ3RILE9BQU8sRUFBRSwyQkFBMkIsRUFBRSxtQkFBbUIsRUFBRSxxQkFBcUIsRUFBRSwrQkFBK0IsRUFBRSxtQkFBbUIsRUFBRSwrQkFBK0IsRUFBRSx5Q0FBeUMsRUFBRSx5QkFBeUIsRUFBRSxNQUFNLG9CQUFvQixDQUFDO0FBQzFRLE9BQU8sRUFBRSwwQkFBMEIsRUFBRSxxQkFBcUIsRUFBRSxNQUFNLCtDQUErQyxDQUFDO0FBQ2xILE9BQU8sRUFBRSw4QkFBOEIsRUFBRSxpQ0FBaUMsRUFBRSx1QkFBdUIsRUFBRSx1Q0FBdUMsRUFBRSxzQkFBc0IsRUFBRSxNQUFNLGlEQUFpRCxDQUFDO0FBQzlOLE9BQU8sRUFBRSw4QkFBOEIsRUFBRSxNQUFNLDBFQUEwRSxDQUFDO0FBQzFILE9BQU8sRUFBRSw0QkFBNEIsRUFBRSxNQUFNLGtEQUFrRCxDQUFDO0FBQ2hHLE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSxvQ0FBb0MsQ0FBQztBQUM3RCxPQUFPLEVBQUUseUJBQXlCLEVBQUUscUNBQXFDLEVBQUUsc0JBQXNCLEVBQUUscUJBQXFCLEVBQUUsMkJBQTJCLEVBQUUsbUJBQW1CLEVBQUUsNEJBQTRCLEVBQUUsbUJBQW1CLEVBQUUsa0JBQWtCLEVBQUUscUNBQXFDLEVBQUUscUNBQXFDLEVBQUUsZ0NBQWdDLEVBQUUsc0RBQXNELEVBQUUsTUFBTSxnQ0FBZ0MsQ0FBQztBQUNsYyxPQUFPLEVBQUUsWUFBWSxFQUFFLE1BQU0sdURBQXVELENBQUM7QUFHckYsT0FBTyxFQUFFLGdCQUFnQixFQUFFLE1BQU0sWUFBWSxDQUFDO0FBQzlDLE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSxxQ0FBcUMsQ0FBQztBQUM5RCxPQUFPLEVBQUUsVUFBVSxFQUFFLE1BQU0sOERBQThELENBQUM7QUFFMUYsNEJBQTRCO0FBRTVCLGVBQWUsQ0FBQyw0QkFBNEIsQ0FBQyxDQUFDO0FBQzlDLGVBQWUsQ0FBQyxrQkFBa0IsQ0FBQyxDQUFDO0FBQ3BDLGVBQWUsQ0FBQyx3QkFBd0IsQ0FBQyxDQUFDO0FBQzFDLGVBQWUsQ0FBQywwQkFBMEIsQ0FBQyxDQUFDO0FBQzVDLGVBQWUsQ0FBQyxpQ0FBaUMsQ0FBQyxDQUFDO0FBQ25ELGVBQWUsQ0FBQyxvQkFBb0IsQ0FBQyxDQUFDO0FBQ3RDLGVBQWUsQ0FBQyw4QkFBOEIsQ0FBQyxDQUFDO0FBQ2hELGVBQWUsQ0FBQyxnQ0FBZ0MsQ0FBQyxDQUFDO0FBQ2xELGVBQWUsQ0FBQyxpQ0FBaUMsQ0FBQyxDQUFDO0FBQ25ELGVBQWUsQ0FBQyxtQ0FBbUMsQ0FBQyxDQUFDO0FBQ3JELGVBQWUsQ0FBQyxrQ0FBa0MsQ0FBQyxDQUFDO0FBRXBELFdBQVc7QUFDWCxnQkFBZ0IsQ0FBQyxlQUFlLENBQUMsbUJBQW1CLEVBQUUsaUJBQWlCLENBQUMsQ0FBQztBQUN6RSxnQkFBZ0IsQ0FBQyxlQUFlLENBQUMsa0JBQWtCLEVBQUUsZ0JBQWdCLENBQUMsQ0FBQztBQUV2RSxNQUFNLDJCQUEyQixHQUFHLEVBQUUsQ0FBQyxDQUFDLG1GQUFtRjtBQUUzSCxNQUFNLFNBQVMsR0FBRyxZQUFZLENBQUM7QUFDL0IsbUJBQW1CLENBQUMsZ0NBQWdDLENBQUM7SUFDcEQsRUFBRSxFQUFFLFNBQVM7SUFDYixNQUFNLEVBQUUsOENBQW9DLDJCQUEyQjtJQUN2RSxJQUFJLEVBQUUsY0FBYyxDQUFDLEdBQUcsQ0FBQywyQkFBMkIsRUFBRSxtQkFBbUIsQ0FBQyxTQUFTLEVBQUUsRUFBRSwrQkFBK0IsQ0FBQztJQUN2SCxPQUFPLHFCQUFZO0lBQ25CLEdBQUcsRUFBRTtRQUNKLE9BQU8sdUJBQWU7S0FDdEI7SUFDRCxPQUFPLEVBQUUsYUFBYTtDQUN0QixDQUFDLENBQUM7QUFFSCxNQUFNLHFCQUFxQixHQUFHLGlCQUFpQixDQUFDO0FBQ2hELG1CQUFtQixDQUFDLGdDQUFnQyxDQUFDO0lBQ3BELEVBQUUsRUFBRSxxQkFBcUI7SUFDekIsTUFBTSxFQUFFLDhDQUFvQywyQkFBMkI7SUFDdkUsSUFBSSxFQUFFLGNBQWMsQ0FBQyxHQUFHLENBQUMsMkJBQTJCLEVBQUUsK0JBQStCLENBQUM7SUFDdEYsT0FBTyx5QkFBZ0I7SUFDdkIsR0FBRyxFQUFFO1FBQ0osT0FBTyxFQUFFLHFEQUFrQztRQUMzQyxTQUFTLEVBQUUseUJBQWdCO0tBQzNCO0lBQ0QsT0FBTyxFQUFFLHNCQUFzQjtDQUMvQixDQUFDLENBQUM7QUFFSCxNQUFNLGNBQWMsR0FBRyxZQUFZLENBQUM7QUFDcEMsbUJBQW1CLENBQUMsZ0NBQWdDLENBQUM7SUFDcEQsRUFBRSxFQUFFLGNBQWM7SUFDbEIsTUFBTSxFQUFFLDhDQUFvQywyQkFBMkI7SUFDdkUsSUFBSSxFQUFFLDJCQUEyQjtJQUNqQyxPQUFPLEVBQUUsaURBQTZCO0lBQ3RDLEdBQUcsRUFBRTtRQUNKLE9BQU8sRUFBRSxnREFBMkIsNEJBQW9CO0tBQ3hEO0lBQ0QsT0FBTyxFQUFFLGlCQUFpQjtDQUMxQixDQUFDLENBQUM7QUFFSCxtQkFBbUIsQ0FBQyxnQ0FBZ0MsQ0FBQztJQUNwRCxFQUFFLEVBQUUsY0FBYztJQUNsQixNQUFNLEVBQUUsOENBQW9DLDJCQUEyQjtJQUN2RSxJQUFJLEVBQUUsY0FBYyxDQUFDLEdBQUcsQ0FBQywyQkFBMkIsRUFBRSwrQkFBK0IsQ0FBQyxTQUFTLEVBQUUsQ0FBQztJQUNsRyxPQUFPLHlCQUFnQjtJQUN2QixHQUFHLEVBQUU7UUFDSixPQUFPLEVBQUUscURBQWtDO0tBQzNDO0lBQ0QsT0FBTyxFQUFFLGlCQUFpQjtDQUMxQixDQUFDLENBQUM7QUFFSCxNQUFNLFdBQVcsR0FBRyxtQkFBbUIsQ0FBQztBQUN4QyxtQkFBbUIsQ0FBQyxnQ0FBZ0MsQ0FBQztJQUNwRCxFQUFFLEVBQUUsV0FBVztJQUNmLE1BQU0sRUFBRSw4Q0FBb0MsMkJBQTJCO0lBQ3ZFLElBQUksRUFBRSxjQUFjLENBQUMsR0FBRyxDQUFDLDJCQUEyQixFQUFFLG1CQUFtQixDQUFDLFNBQVMsRUFBRSxFQUFFLCtCQUErQixDQUFDO0lBQ3ZILE9BQU8sRUFBRSxpREFBNkI7SUFDdEMsT0FBTyxFQUFFLGNBQWM7Q0FDdkIsQ0FBQyxDQUFDO0FBRUgsTUFBTSxZQUFZLEdBQUcsb0JBQW9CLENBQUM7QUFDMUMsbUJBQW1CLENBQUMsZ0NBQWdDLENBQUM7SUFDcEQsRUFBRSxFQUFFLFlBQVk7SUFDaEIsTUFBTSxFQUFFLDhDQUFvQywyQkFBMkI7SUFDdkUsSUFBSSxFQUFFLGNBQWMsQ0FBQyxHQUFHLENBQUMsMkJBQTJCLEVBQUUsbUJBQW1CLENBQUMsU0FBUyxFQUFFLENBQUM7SUFDdEYsT0FBTyxFQUFFLGlEQUE2QjtJQUN0QyxPQUFPLEVBQUUsZUFBZTtDQUN4QixDQUFDLENBQUM7QUFFSCxNQUFNLGFBQWEsR0FBRyxxQkFBcUIsQ0FBQztBQUU1QyxnQkFBZ0IsQ0FBQyxlQUFlLENBQUMsYUFBYSxFQUFFLGdCQUFnQixDQUFDLENBQUM7QUFFbEUsbUJBQW1CLENBQUMsc0JBQXNCLENBQUM7SUFDMUMsRUFBRSxFQUFFLElBQUksYUFBYSxFQUFFLEVBQUUsa0ZBQWtGO0lBQzNHLE1BQU0sRUFBRSw4Q0FBb0MsMkJBQTJCO0lBQ3ZFLElBQUksRUFBRSxjQUFjLENBQUMsR0FBRyxDQUFDLDJCQUEyQixFQUFFLCtCQUErQixDQUFDO0lBQ3RGLE9BQU8sRUFBRSxpREFBNkI7Q0FDdEMsQ0FBQyxDQUFDO0FBRUgsbUJBQW1CLENBQUMsZ0NBQWdDLENBQUM7SUFDcEQsRUFBRSxFQUFFLHlCQUF5QjtJQUM3QixNQUFNLEVBQUUsOENBQW9DLDJCQUEyQjtJQUN2RSxJQUFJLEVBQUUsY0FBYyxDQUFDLEdBQUcsQ0FBQywyQkFBMkIsRUFBRSxtQkFBbUIsQ0FBQztJQUMxRSxPQUFPLHdCQUFnQjtJQUN2QixPQUFPLEVBQUUsS0FBSyxFQUFFLFFBQTBCLEVBQUUsRUFBRTtRQUM3QyxNQUFNLGVBQWUsR0FBRyxRQUFRLENBQUMsR0FBRyxDQUFDLGdCQUFnQixDQUFDLENBQUM7UUFDdkQsTUFBTSxlQUFlLENBQUMsU0FBUyxDQUFDLEVBQUUsRUFBRSxJQUFJLENBQUMsQ0FBQztJQUMzQyxDQUFDO0NBQ0QsQ0FBQyxDQUFDO0FBRUgsbUJBQW1CLENBQUMsZ0NBQWdDLENBQUM7SUFDcEQsRUFBRSxFQUFFLHFDQUFxQztJQUN6QyxNQUFNLEVBQUUsOENBQW9DLDJCQUEyQjtJQUN2RSxJQUFJLEVBQUUsY0FBYyxDQUFDLEdBQUcsQ0FBQywyQkFBMkIsRUFBRSxxQkFBcUIsQ0FBQyxTQUFTLEVBQUUsQ0FBQztJQUN4RixPQUFPLHdCQUFlO0lBQ3RCLE9BQU8sRUFBRSw0QkFBNEI7Q0FDckMsQ0FBQyxDQUFDO0FBRUgsTUFBTSxlQUFlLEdBQUc7SUFDdkIsRUFBRSxFQUFFLG9CQUFvQjtJQUN4QixLQUFLLEVBQUUsR0FBRyxDQUFDLFFBQVEsQ0FBQyxVQUFVLEVBQUUsV0FBVyxDQUFDO0NBQzVDLENBQUM7QUFFRixNQUFNLHVCQUF1QixHQUFHO0lBQy9CLEVBQUUsRUFBRSw2QkFBNkI7SUFDakMsS0FBSyxFQUFFLEdBQUcsQ0FBQyxRQUFRLENBQUMsa0JBQWtCLEVBQUUsb0JBQW9CLENBQUM7Q0FDN0QsQ0FBQztBQUVGLE1BQU0sQ0FBQyxNQUFNLHNCQUFzQixHQUFHO0lBQ3JDLEVBQUUsRUFBRSw2QkFBNkI7SUFDakMsS0FBSyxFQUFFLEdBQUcsQ0FBQyxRQUFRLENBQUMsaUJBQWlCLEVBQUUseUJBQXlCLENBQUM7Q0FDakUsQ0FBQztBQUVGLDRCQUE0QjtBQUM1QixnQ0FBZ0MsQ0FBQyxvQkFBb0IsRUFBRSxlQUFlLENBQUMsS0FBSyxFQUFFLGtCQUFrQixDQUFDLG9CQUFvQixFQUFFLGdCQUFnQixFQUFFLElBQUksQ0FBQyxDQUFDO0FBQy9JLGdDQUFnQyxDQUFDLDZCQUE2QixFQUFFLHVCQUF1QixDQUFDLEtBQUssRUFBRSxrQkFBa0IsQ0FBQyxvQkFBb0IsRUFBRSxnQkFBZ0IsRUFBRSxJQUFJLENBQUMsQ0FBQztBQUNoSyxnQ0FBZ0MsQ0FBQyxzQkFBc0IsQ0FBQyxFQUFFLEVBQUUsc0JBQXNCLENBQUMsS0FBSyxFQUFFLGtCQUFrQixDQUFDLG9CQUFvQixFQUFFLFNBQVMsRUFBRSxLQUFLLEVBQUUsQ0FBQyxDQUFDLENBQUM7QUFFeEosTUFBTSxVQUFVLGdDQUFnQyxDQUFDLEVBQVUsRUFBRSxLQUFhLEVBQUUsSUFBc0MsRUFBRSxLQUFhLEVBQUUsbUJBQTRCLEVBQUUsS0FBYztJQUM5SyxNQUFNLFlBQVksR0FBRyxtQkFBbUIsS0FBSyxJQUFJLENBQUMsQ0FBQyxDQUFDLHFDQUFxQyxDQUFDLE1BQU0sRUFBRSxDQUFDLENBQUMsQ0FBQyxTQUFTLENBQUM7SUFFL0csT0FBTztJQUNQLFlBQVksQ0FBQyxjQUFjLENBQUMsTUFBTSxDQUFDLGtCQUFrQixFQUFFO1FBQ3RELE9BQU8sRUFBRSxFQUFFLEVBQUUsRUFBRSxLQUFLLEVBQUUsWUFBWSxFQUFFO1FBQ3BDLElBQUk7UUFDSixLQUFLO1FBQ0wsS0FBSztLQUNMLENBQUMsQ0FBQztBQUNKLENBQUM7QUFFRCw0Q0FBNEM7QUFDNUMsbUNBQW1DLENBQUMsMkNBQTJDLEVBQUUsR0FBRyxDQUFDLFFBQVEsQ0FBQyxvQkFBb0IsRUFBRSw4Q0FBOEMsQ0FBQyxFQUFFLE9BQU8sQ0FBQyxLQUFLLEVBQUUsQ0FBQyxFQUFFLEVBQUUseUJBQXlCLENBQUMsQ0FBQztBQUNwTixtQ0FBbUMsQ0FBQywyQ0FBMkMsRUFBRSxHQUFHLENBQUMsUUFBUSxDQUFDLG9CQUFvQixFQUFFLGtEQUFrRCxDQUFDLEVBQUUsT0FBTyxDQUFDLE9BQU8sRUFBRSxDQUFDLENBQUMsRUFBRSx5QkFBeUIsQ0FBQyxDQUFDO0FBRXpOLFNBQVMsbUNBQW1DLENBQUMsRUFBVSxFQUFFLEtBQWEsRUFBRSxJQUFlLEVBQUUsS0FBYSxFQUFFLE9BQXdCO0lBRS9ILFVBQVU7SUFDVixnQkFBZ0IsQ0FBQyxlQUFlLENBQUMsRUFBRSxFQUFFLE9BQU8sQ0FBQyxDQUFDO0lBRTlDLFNBQVM7SUFDVCxZQUFZLENBQUMsY0FBYyxDQUFDLE1BQU0sQ0FBQyxXQUFXLEVBQUU7UUFDL0MsT0FBTyxFQUFFLEVBQUUsRUFBRSxFQUFFLEtBQUssRUFBRSxJQUFJLEVBQUU7UUFDNUIsSUFBSSxFQUFFLGNBQWMsQ0FBQyxNQUFNLENBQUMsMkJBQTJCLEVBQUUsSUFBSSxDQUFDO1FBQzlELEtBQUssRUFBRSxZQUFZO1FBQ25CLEtBQUs7S0FDTCxDQUFDLENBQUM7QUFDSixDQUFDO0FBRUQsc0NBQXNDO0FBRXRDLE1BQU0sVUFBVSxzQkFBc0IsQ0FBQyxFQUFFLEVBQUUsRUFBRSxLQUFLLEVBQUUsUUFBUSxFQUFFLFFBQVEsRUFBa0IsRUFBRSxJQUEyQjtJQUNwSCxZQUFZLENBQUMsY0FBYyxDQUFDLE1BQU0sQ0FBQyxjQUFjLEVBQUU7UUFDbEQsT0FBTyxFQUFFO1lBQ1IsRUFBRTtZQUNGLEtBQUs7WUFDTCxRQUFRO1lBQ1IsUUFBUTtTQUNSO1FBQ0QsSUFBSTtLQUNKLENBQUMsQ0FBQztBQUNKLENBQUM7QUFFRCxzQkFBc0IsQ0FBQztJQUN0QixFQUFFLEVBQUUsb0JBQW9CO0lBQ3hCLEtBQUssRUFBRSxHQUFHLENBQUMsU0FBUyxDQUFDLGtCQUFrQixFQUFFLDBCQUEwQixDQUFDO0lBQ3BFLFFBQVEsRUFBRSxVQUFVLENBQUMsSUFBSTtDQUN6QixDQUFDLENBQUM7QUFDSCxzQkFBc0IsQ0FBQztJQUN0QixFQUFFLEVBQUUsNkJBQTZCO0lBQ2pDLEtBQUssRUFBRSxHQUFHLENBQUMsU0FBUyxDQUFDLDBCQUEwQixFQUFFLG1DQUFtQyxDQUFDO0lBQ3JGLFFBQVEsRUFBRSxVQUFVLENBQUMsSUFBSTtDQUN6QixDQUFDLENBQUM7QUFFSCxzQkFBc0IsQ0FBQztJQUN0QixFQUFFLEVBQUUsb0JBQW9CO0lBQ3hCLEtBQUssRUFBRSxlQUFlO0lBQ3RCLFFBQVEsRUFBRSxVQUFVLENBQUMsSUFBSTtDQUN6QixDQUFDLENBQUM7QUFFSCxzQkFBc0IsQ0FBQztJQUN0QixFQUFFLEVBQUUsdUNBQXVDO0lBQzNDLEtBQUssRUFBRSxrQ0FBa0M7SUFDekMsUUFBUSxFQUFFLFVBQVUsQ0FBQyxJQUFJO0NBQ3pCLENBQUMsQ0FBQztBQUVILHNCQUFzQixDQUFDO0lBQ3RCLEVBQUUsRUFBRSw0QkFBNEI7SUFDaEMsS0FBSyxFQUFFLEdBQUcsQ0FBQyxTQUFTLENBQUMsZ0JBQWdCLEVBQUUsbUJBQW1CLENBQUM7SUFDM0QsUUFBUSxFQUFFLFVBQVUsQ0FBQyxJQUFJO0NBQ3pCLENBQUMsQ0FBQztBQUVILHNCQUFzQixDQUFDO0lBQ3RCLEVBQUUsRUFBRSxxQkFBcUI7SUFDekIsS0FBSyxFQUFFLEdBQUcsQ0FBQyxTQUFTLENBQUMsV0FBVyxFQUFFLGdCQUFnQixDQUFDO0lBQ25ELFFBQVEsRUFBRSxVQUFVLENBQUMsSUFBSTtDQUN6QixDQUFDLENBQUM7QUFFSCxzQkFBc0IsQ0FBQztJQUN0QixFQUFFLEVBQUUsc0JBQXNCO0lBQzFCLEtBQUssRUFBRSxHQUFHLENBQUMsU0FBUyxDQUFDLFFBQVEsRUFBRSxhQUFhLENBQUM7SUFDN0MsUUFBUSxFQUFFLFVBQVUsQ0FBQyxJQUFJO0NBQ3pCLENBQUMsQ0FBQztBQUVILHNCQUFzQixDQUFDO0lBQ3RCLEVBQUUsRUFBRSw2QkFBNkI7SUFDakMsS0FBSyxFQUFFLEdBQUcsQ0FBQyxTQUFTLENBQUMsd0JBQXdCLEVBQUUsZ0NBQWdDLENBQUM7SUFDaEYsUUFBUSxFQUFFLFVBQVUsQ0FBQyxJQUFJO0lBQ3pCLFFBQVEsRUFBRTtRQUNULFdBQVcsRUFBRSxHQUFHLENBQUMsU0FBUyxDQUFDLDRCQUE0QixFQUFFLDhFQUE4RSxDQUFDO0tBQ3hJO0NBQ0QsQ0FBQyxDQUFDO0FBRUgsc0JBQXNCLENBQUM7SUFDdEIsRUFBRSxFQUFFLHVCQUF1QjtJQUMzQixLQUFLLEVBQUUsa0JBQWtCO0lBQ3pCLFFBQVEsRUFBRSxVQUFVLENBQUMsSUFBSTtDQUN6QixDQUFDLENBQUM7QUFFSCxzQkFBc0IsQ0FBQztJQUN0QixFQUFFLEVBQUUsbUJBQW1CO0lBQ3ZCLEtBQUssRUFBRSxjQUFjO0lBQ3JCLFFBQVEsRUFBRSxVQUFVLENBQUMsSUFBSTtDQUN6QixFQUFFLDJCQUEyQixDQUFDLFdBQVcsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDO0FBRWpELHNCQUFzQixDQUFDO0lBQ3RCLEVBQUUsRUFBRSxxQkFBcUI7SUFDekIsS0FBSyxFQUFFLGdCQUFnQjtJQUN2QixRQUFRLEVBQUUsVUFBVSxDQUFDLElBQUk7SUFDekIsUUFBUSxFQUFFLEVBQUUsV0FBVyxFQUFFLEdBQUcsQ0FBQyxTQUFTLENBQUMsc0JBQXNCLEVBQUUsa0NBQWtDLENBQUMsRUFBRTtDQUNwRyxFQUFFLDJCQUEyQixDQUFDLFdBQVcsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDO0FBRWpELHNCQUFzQixDQUFDO0lBQ3RCLEVBQUUsRUFBRSw0QkFBNEI7SUFDaEMsS0FBSyxFQUFFLHVCQUF1QjtJQUM5QixRQUFRLEVBQUUsVUFBVSxDQUFDLElBQUk7Q0FDekIsQ0FBQyxDQUFDO0FBRUgsbUNBQW1DO0FBRW5DLE1BQU0sa0NBQWtDLEdBQUcsY0FBYyxDQUFDLEVBQUUsQ0FBQyxrQkFBa0IsQ0FBQyxvQkFBb0IsRUFBRSxrQkFBa0IsQ0FBQyxNQUFNLENBQUMsU0FBUyxDQUFDLE9BQU8sQ0FBQyxRQUFRLENBQUMsQ0FBQyxDQUFDO0FBRTdKLE1BQU0saUJBQWlCLEdBQUc7SUFDekIsRUFBRSxFQUFFLHVCQUF1QjtJQUMzQixLQUFLLEVBQUUsR0FBRyxDQUFDLFFBQVEsQ0FBQyxZQUFZLEVBQUUsa0JBQWtCLENBQUM7Q0FDckQsQ0FBQztBQUNGLFlBQVksQ0FBQyxjQUFjLENBQUMsTUFBTSxDQUFDLGtCQUFrQixFQUFFO0lBQ3RELEtBQUssRUFBRSxZQUFZO0lBQ25CLEtBQUssRUFBRSxFQUFFO0lBQ1QsT0FBTyxFQUFFLGlCQUFpQjtJQUMxQixJQUFJLEVBQUUsa0NBQWtDO0NBQ3hDLENBQUMsQ0FBQztBQUVILFlBQVksQ0FBQyxjQUFjLENBQUMsTUFBTSxDQUFDLGtCQUFrQixFQUFFO0lBQ3RELEtBQUssRUFBRSxRQUFRO0lBQ2YsS0FBSyxFQUFFLEVBQUU7SUFDVCxPQUFPLEVBQUU7UUFDUixFQUFFLEVBQUUsc0JBQXNCO1FBQzFCLEtBQUssRUFBRSxHQUFHLENBQUMsUUFBUSxDQUFDLFlBQVksRUFBRSx1QkFBdUIsQ0FBQztLQUMxRDtJQUNELElBQUksRUFBRSxjQUFjLENBQUMsR0FBRztJQUN2Qiw4Q0FBOEM7SUFDOUMscUNBQXFDO0lBQ3JDLHFCQUFxQjtJQUNyQix1QkFBdUIsQ0FBQyxTQUFTLEVBQUUsQ0FDbkM7Q0FDRCxDQUFDLENBQUM7QUFFSCxZQUFZLENBQUMsY0FBYyxDQUFDLE1BQU0sQ0FBQyxrQkFBa0IsRUFBRTtJQUN0RCxLQUFLLEVBQUUsZ0JBQWdCO0lBQ3ZCLEtBQUssRUFBRSxFQUFFO0lBQ1QsT0FBTyxFQUFFLGVBQWU7SUFDeEIsSUFBSSxFQUFFLGtCQUFrQixDQUFDLG9CQUFvQjtDQUM3QyxDQUFDLENBQUM7QUFFSCxZQUFZLENBQUMsY0FBYyxDQUFDLE1BQU0sQ0FBQyxrQkFBa0IsRUFBRTtJQUN0RCxLQUFLLEVBQUUsZ0JBQWdCO0lBQ3ZCLEtBQUssRUFBRSxFQUFFO0lBQ1QsT0FBTyxFQUFFLHVCQUF1QjtJQUNoQyxJQUFJLEVBQUUsa0JBQWtCLENBQUMsb0JBQW9CO0NBQzdDLENBQUMsQ0FBQztBQUVILFlBQVksQ0FBQyxjQUFjLENBQUMsTUFBTSxDQUFDLGtCQUFrQixFQUFFO0lBQ3RELEtBQUssRUFBRSxRQUFRO0lBQ2YsS0FBSyxFQUFFLEVBQUU7SUFDVCxPQUFPLEVBQUU7UUFDUixFQUFFLEVBQUUsb0JBQW9CO1FBQ3hCLEtBQUssRUFBRSxlQUFlO1FBQ3RCLFlBQVksRUFBRSw2QkFBNkI7S0FDM0M7SUFDRCxJQUFJLEVBQUUsY0FBYyxDQUFDLEVBQUU7SUFDdEIsbUJBQW1CO0lBQ25CLGtCQUFrQixDQUFDLE1BQU0sQ0FBQyxTQUFTLENBQUMsT0FBTyxDQUFDLFFBQVEsQ0FBQztJQUNyRCxNQUFNO0lBQ04sY0FBYyxDQUFDLEdBQUc7SUFDakIscUJBQXFCO0lBQ3JCLHVCQUF1QixDQUFDLFNBQVMsRUFBRTtJQUNuQyx3QkFBd0I7SUFDeEIsZ0NBQWdDLENBQUMsU0FBUyxFQUFFO0lBQzVDLG1DQUFtQztJQUNuQyw4QkFBOEIsQ0FBQyxTQUFTLEVBQUUsQ0FDMUMsQ0FDRDtDQUNELENBQUMsQ0FBQztBQUVILFlBQVksQ0FBQyxjQUFjLENBQUMsTUFBTSxDQUFDLGtCQUFrQixFQUFFO0lBQ3RELEtBQUssRUFBRSxRQUFRO0lBQ2YsS0FBSyxFQUFFLEVBQUU7SUFDVCxPQUFPLEVBQUU7UUFDUixFQUFFLEVBQUUsc0JBQXNCO1FBQzFCLEtBQUssRUFBRSxHQUFHLENBQUMsUUFBUSxDQUFDLFFBQVEsRUFBRSxhQUFhLENBQUM7UUFDNUMsWUFBWSxFQUFFLDZCQUE2QjtLQUMzQztJQUNELElBQUksRUFBRSxjQUFjLENBQUMsR0FBRztJQUN2QixxQkFBcUI7SUFDckIsdUJBQXVCLENBQUMsU0FBUyxFQUFFO0lBQ25DLHdCQUF3QjtJQUN4QixnQ0FBZ0MsQ0FBQyxTQUFTLEVBQUU7SUFDNUMsNkNBQTZDO0lBQzdDLGtCQUFrQixDQUFDLE1BQU0sQ0FBQyxXQUFXLENBQUMsT0FBTyxDQUFDLFFBQVEsQ0FBQztJQUN2RCxtQ0FBbUM7SUFDbkMsOEJBQThCLENBQUMsU0FBUyxFQUFFLENBQzFDO0NBQ0QsQ0FBQyxDQUFDO0FBRUgsWUFBWSxDQUFDLGNBQWMsQ0FBQyxNQUFNLENBQUMsa0JBQWtCLEVBQUU7SUFDdEQsS0FBSyxFQUFFLFFBQVE7SUFDZixLQUFLLEVBQUUsRUFBRTtJQUNULE9BQU8sRUFBRTtRQUNSLEVBQUUsRUFBRSw0QkFBNEI7UUFDaEMsS0FBSyxFQUFFLEdBQUcsQ0FBQyxRQUFRLENBQUMsU0FBUyxFQUFFLFVBQVUsQ0FBQztRQUMxQyxZQUFZLEVBQUUseUJBQXlCO0tBQ3ZDO0lBQ0QsZUFBZTtJQUNmLElBQUksRUFBRSx1QkFBdUI7Q0FDN0IsQ0FBQyxDQUFDO0FBRUgsWUFBWSxDQUFDLGNBQWMsQ0FBQyxNQUFNLENBQUMsa0JBQWtCLEVBQUU7SUFDdEQsS0FBSyxFQUFFLFdBQVc7SUFDbEIsS0FBSyxFQUFFLEVBQUU7SUFDVCxPQUFPLEVBQUU7UUFDUixFQUFFLEVBQUUsNkJBQTZCO1FBQ2pDLEtBQUssRUFBRSxHQUFHLENBQUMsUUFBUSxDQUFDLGtCQUFrQixFQUFFLG9CQUFvQixDQUFDO1FBQzdELFlBQVksRUFBRSw2QkFBNkI7S0FDM0M7SUFDRCxJQUFJLEVBQUUsY0FBYyxDQUFDLEdBQUcsQ0FBQyxrQkFBa0IsQ0FBQyxvQkFBb0IsRUFBRSw4QkFBOEIsQ0FBQyxTQUFTLEVBQUUsRUFBRSw0QkFBNEIsQ0FBQyxTQUFTLEVBQUUsQ0FBQztDQUN2SixDQUFDLENBQUM7QUFFSCxNQUFNLHNCQUFzQixHQUFHO0lBQzlCLEVBQUUsRUFBRSwyQkFBMkI7SUFDL0IsS0FBSyxFQUFFLEdBQUcsQ0FBQyxRQUFRLENBQUMscUJBQXFCLEVBQUUsdUJBQXVCLENBQUM7Q0FDbkUsQ0FBQztBQUNGLFlBQVksQ0FBQyxjQUFjLENBQUMsTUFBTSxDQUFDLGtCQUFrQixFQUFFO0lBQ3RELEtBQUssRUFBRSxXQUFXO0lBQ2xCLEtBQUssRUFBRSxFQUFFO0lBQ1QsT0FBTyxFQUFFLHNCQUFzQjtJQUMvQixJQUFJLEVBQUUsY0FBYyxDQUFDLEdBQUcsQ0FBQyxrQkFBa0IsQ0FBQyxXQUFXLEVBQUUsaUNBQWlDLEVBQUUsa0NBQWtDLEVBQUUsNEJBQTRCLENBQUMsU0FBUyxFQUFFLENBQUM7Q0FDekssQ0FBQyxDQUFDO0FBRUgsTUFBTSx1QkFBdUIsR0FBRztJQUMvQixFQUFFLEVBQUUsNkJBQTZCO0lBQ2pDLEtBQUssRUFBRSxHQUFHLENBQUMsUUFBUSxDQUFDLGVBQWUsRUFBRSxvQkFBb0IsQ0FBQztDQUMxRCxDQUFDO0FBQ0YsWUFBWSxDQUFDLGNBQWMsQ0FBQyxNQUFNLENBQUMsa0JBQWtCLEVBQUU7SUFDdEQsS0FBSyxFQUFFLFdBQVc7SUFDbEIsS0FBSyxFQUFFLEVBQUU7SUFDVCxPQUFPLEVBQUUsdUJBQXVCO0lBQ2hDLElBQUksRUFBRSxjQUFjLENBQUMsR0FBRyxDQUFDLGtCQUFrQixDQUFDLFdBQVcsRUFBRSxrQ0FBa0MsRUFBRSw0QkFBNEIsQ0FBQyxTQUFTLEVBQUUsQ0FBQztDQUN0SSxDQUFDLENBQUM7QUFFSCxNQUFNLHNCQUFzQixHQUFHO0lBQzlCLEVBQUUsRUFBRSwyQkFBMkI7SUFDL0IsS0FBSyxFQUFFLEdBQUcsQ0FBQyxRQUFRLENBQUMsaUJBQWlCLEVBQUUsa0JBQWtCLENBQUM7Q0FDMUQsQ0FBQztBQUNGLFlBQVksQ0FBQyxjQUFjLENBQUMsTUFBTSxDQUFDLGtCQUFrQixFQUFFO0lBQ3RELEtBQUssRUFBRSxXQUFXO0lBQ2xCLEtBQUssRUFBRSxFQUFFO0lBQ1QsT0FBTyxFQUFFLHNCQUFzQjtJQUMvQixJQUFJLEVBQUUsY0FBYyxDQUFDLEdBQUcsQ0FBQyxrQkFBa0IsQ0FBQyxXQUFXLEVBQUUsNEJBQTRCLEVBQUUsd0NBQXdDLENBQUM7Q0FDaEksQ0FBQyxDQUFDO0FBRUgsWUFBWSxDQUFDLGNBQWMsQ0FBQyxNQUFNLENBQUMsa0JBQWtCLEVBQUU7SUFDdEQsS0FBSyxFQUFFLFdBQVc7SUFDbEIsS0FBSyxFQUFFLEVBQUU7SUFDVCxPQUFPLEVBQUUsc0JBQXNCO0lBQy9CLElBQUksRUFBRSxjQUFjLENBQUMsR0FBRyxDQUFDLGtCQUFrQixDQUFDLFdBQVcsRUFBRSxnQ0FBZ0MsRUFBRSxzREFBc0QsQ0FBQztDQUNsSixDQUFDLENBQUM7QUFFSCxZQUFZLENBQUMsY0FBYyxDQUFDLE1BQU0sQ0FBQyxrQkFBa0IsRUFBRTtJQUN0RCxLQUFLLEVBQUUsU0FBUztJQUNoQixLQUFLLEVBQUUsRUFBRTtJQUNULE9BQU8sRUFBRTtRQUNSLEVBQUUsRUFBRSx1QkFBdUI7UUFDM0IsS0FBSyxFQUFFLEdBQUcsQ0FBQyxRQUFRLENBQUMsT0FBTyxFQUFFLE9BQU8sQ0FBQztLQUNyQztJQUNELElBQUksRUFBRSx1QkFBdUIsQ0FBQyxTQUFTLEVBQUU7Q0FDekMsQ0FBQyxDQUFDO0FBRUgsWUFBWSxDQUFDLGNBQWMsQ0FBQyxNQUFNLENBQUMsa0JBQWtCLEVBQUU7SUFDdEQsS0FBSyxFQUFFLFNBQVM7SUFDaEIsS0FBSyxFQUFFLEVBQUU7SUFDVCxPQUFPLEVBQUU7UUFDUixFQUFFLEVBQUUsdUNBQXVDO1FBQzNDLEtBQUssRUFBRSxHQUFHLENBQUMsUUFBUSxDQUFDLGFBQWEsRUFBRSxjQUFjLENBQUM7S0FDbEQ7SUFDRCxJQUFJLEVBQUUsdUJBQXVCLENBQUMsU0FBUyxFQUFFO0NBQ3pDLENBQUMsQ0FBQztBQUVILFlBQVksQ0FBQyxjQUFjLENBQUMsTUFBTSxDQUFDLGtCQUFrQixFQUFFO0lBQ3RELEtBQUssRUFBRSxTQUFTO0lBQ2hCLEtBQUssRUFBRSxFQUFFO0lBQ1QsT0FBTyxFQUFFO1FBQ1IsRUFBRSxFQUFFLDhCQUE4QjtRQUNsQyxLQUFLLEVBQUUsR0FBRyxDQUFDLFFBQVEsQ0FBQyxZQUFZLEVBQUUsYUFBYSxDQUFDO0tBQ2hEO0NBQ0QsQ0FBQyxDQUFDO0FBRUgsWUFBWSxDQUFDLGNBQWMsQ0FBQyxNQUFNLENBQUMsa0JBQWtCLEVBQUU7SUFDdEQsS0FBSyxFQUFFLFNBQVM7SUFDaEIsS0FBSyxFQUFFLEVBQUU7SUFDVCxPQUFPLEVBQUU7UUFDUixFQUFFLEVBQUUsaUNBQWlDO1FBQ3JDLEtBQUssRUFBRSxHQUFHLENBQUMsUUFBUSxDQUFDLFVBQVUsRUFBRSxXQUFXLENBQUM7S0FDNUM7Q0FDRCxDQUFDLENBQUM7QUFFSCwrQkFBK0I7QUFFL0IsWUFBWSxDQUFDLGNBQWMsQ0FBQyxNQUFNLENBQUMsZUFBZSxFQUFFO0lBQ25ELEtBQUssRUFBRSxZQUFZO0lBQ25CLEtBQUssRUFBRSxDQUFDO0lBQ1IsT0FBTyxFQUFFO1FBQ1IsRUFBRSxFQUFFLG1CQUFtQjtRQUN2QixLQUFLLEVBQUUsY0FBYztRQUNyQixZQUFZLEVBQUUsK0JBQStCO0tBQzdDO0lBQ0QsSUFBSSxFQUFFLHFCQUFxQjtDQUMzQixDQUFDLENBQUM7QUFFSCxZQUFZLENBQUMsY0FBYyxDQUFDLE1BQU0sQ0FBQyxlQUFlLEVBQUU7SUFDbkQsS0FBSyxFQUFFLFlBQVk7SUFDbkIsS0FBSyxFQUFFLENBQUM7SUFDUixPQUFPLEVBQUU7UUFDUixFQUFFLEVBQUUscUJBQXFCO1FBQ3pCLEtBQUssRUFBRSxnQkFBZ0I7UUFDdkIsWUFBWSxFQUFFLCtCQUErQjtLQUM3QztJQUNELElBQUksRUFBRSxxQkFBcUI7Q0FDM0IsQ0FBQyxDQUFDO0FBRUgsWUFBWSxDQUFDLGNBQWMsQ0FBQyxNQUFNLENBQUMsZUFBZSxFQUFFO0lBQ25ELEtBQUssRUFBRSxZQUFZO0lBQ25CLEtBQUssRUFBRSxFQUFFO0lBQ1QsT0FBTyxFQUFFLGlCQUFpQjtJQUMxQixJQUFJLEVBQUUsY0FBYyxDQUFDLEdBQUcsQ0FBQyxxQkFBcUIsQ0FBQyxTQUFTLEVBQUUsRUFBRSxrQkFBa0IsQ0FBQyxXQUFXLENBQUM7Q0FDM0YsQ0FBQyxDQUFDO0FBRUgsWUFBWSxDQUFDLGNBQWMsQ0FBQyxNQUFNLENBQUMsZUFBZSxFQUFFO0lBQ25ELEtBQUssRUFBRSxZQUFZO0lBQ25CLEtBQUssRUFBRSxFQUFFO0lBQ1QsT0FBTyxFQUFFO1FBQ1IsRUFBRSxFQUFFLDZCQUE2QjtRQUNqQyxLQUFLLEVBQUUsR0FBRyxDQUFDLFFBQVEsQ0FBQyxrQkFBa0IsRUFBRSxjQUFjLENBQUM7S0FDdkQ7SUFDRCxJQUFJLEVBQUUsY0FBYyxDQUFDLEdBQUcsQ0FBQyxxQkFBcUIsQ0FBQyxTQUFTLEVBQUUsRUFBRSx5Q0FBeUMsQ0FBQztDQUN0RyxDQUFDLENBQUM7QUFFSCxZQUFZLENBQUMsY0FBYyxDQUFDLE1BQU0sQ0FBQyxlQUFlLEVBQUU7SUFDbkQsS0FBSyxFQUFFLFdBQVc7SUFDbEIsS0FBSyxFQUFFLEVBQUU7SUFDVCxPQUFPLEVBQUUsc0JBQXNCO0lBQy9CLElBQUksRUFBRSxjQUFjLENBQUMsR0FBRyxDQUFDLHFCQUFxQixDQUFDLFNBQVMsRUFBRSxFQUFFLGtCQUFrQixDQUFDLFdBQVcsRUFBRSxpQ0FBaUMsRUFBRSw0QkFBNEIsQ0FBQyxTQUFTLEVBQUUsQ0FBQztDQUN4SyxDQUFDLENBQUM7QUFFSCxZQUFZLENBQUMsY0FBYyxDQUFDLE1BQU0sQ0FBQyxlQUFlLEVBQUU7SUFDbkQsS0FBSyxFQUFFLFdBQVc7SUFDbEIsS0FBSyxFQUFFLEVBQUU7SUFDVCxPQUFPLEVBQUUsdUJBQXVCO0lBQ2hDLElBQUksRUFBRSxjQUFjLENBQUMsR0FBRyxDQUFDLHFCQUFxQixDQUFDLFNBQVMsRUFBRSxFQUFFLGtCQUFrQixDQUFDLFdBQVcsRUFBRSw0QkFBNEIsQ0FBQyxTQUFTLEVBQUUsQ0FBQztDQUNySSxDQUFDLENBQUM7QUFFSCxZQUFZLENBQUMsY0FBYyxDQUFDLE1BQU0sQ0FBQyxlQUFlLEVBQUU7SUFDbkQsS0FBSyxFQUFFLFdBQVc7SUFDbEIsS0FBSyxFQUFFLEVBQUU7SUFDVCxPQUFPLEVBQUUsc0JBQXNCO0lBQy9CLElBQUksRUFBRSxjQUFjLENBQUMsR0FBRyxDQUFDLHFCQUFxQixDQUFDLFNBQVMsRUFBRSxFQUFFLGtCQUFrQixDQUFDLFdBQVcsRUFBRSw0QkFBNEIsQ0FBQztDQUN6SCxDQUFDLENBQUM7QUFFSCxZQUFZLENBQUMsY0FBYyxDQUFDLE1BQU0sQ0FBQyxlQUFlLEVBQUU7SUFDbkQsS0FBSyxFQUFFLGdCQUFnQjtJQUN2QixLQUFLLEVBQUUsQ0FBQztJQUNSLE9BQU8sRUFBRTtRQUNSLEVBQUUsRUFBRSxXQUFXO1FBQ2YsS0FBSyxFQUFFLEdBQUcsQ0FBQyxRQUFRLENBQUMsS0FBSyxFQUFFLEtBQUssQ0FBQztLQUNqQztJQUNELElBQUksRUFBRSxjQUFjLENBQUMsR0FBRyxDQUFDLG1CQUFtQixDQUFDLFNBQVMsRUFBRSxFQUFFLCtCQUErQixDQUFDO0NBQzFGLENBQUMsQ0FBQztBQUVILFlBQVksQ0FBQyxjQUFjLENBQUMsTUFBTSxDQUFDLGVBQWUsRUFBRTtJQUNuRCxLQUFLLEVBQUUsZ0JBQWdCO0lBQ3ZCLEtBQUssRUFBRSxFQUFFO0lBQ1QsT0FBTyxFQUFFO1FBQ1IsRUFBRSxFQUFFLFlBQVk7UUFDaEIsS0FBSyxFQUFFLGVBQWU7S0FDdEI7SUFDRCxJQUFJLEVBQUUsbUJBQW1CLENBQUMsU0FBUyxFQUFFO0NBQ3JDLENBQUMsQ0FBQztBQUVILFlBQVksQ0FBQyxjQUFjLENBQUMsTUFBTSxDQUFDLGVBQWUsRUFBRTtJQUNuRCxLQUFLLEVBQUUsZ0JBQWdCO0lBQ3ZCLEtBQUssRUFBRSxFQUFFO0lBQ1QsT0FBTyxFQUFFO1FBQ1IsRUFBRSxFQUFFLGFBQWE7UUFDakIsS0FBSyxFQUFFLGdCQUFnQjtRQUN2QixZQUFZLEVBQUUsY0FBYyxDQUFDLEdBQUcsQ0FBQywrQkFBK0IsRUFBRSxpQkFBaUIsQ0FBQztLQUNwRjtJQUNELElBQUksRUFBRSxxQkFBcUI7Q0FDM0IsQ0FBQyxDQUFDO0FBRUgsWUFBWSxDQUFDLGNBQWMsQ0FBQyxNQUFNLENBQUMsZUFBZSxFQUFFLENBQUM7SUFDcEQsS0FBSyxFQUFFLGlCQUFpQjtJQUN4QixLQUFLLEVBQUUsRUFBRTtJQUNULE9BQU8sRUFBRTtRQUNSLEVBQUUsRUFBRSxtQkFBbUI7UUFDdkIsS0FBSyxFQUFFLGNBQWM7S0FDckI7SUFDRCxJQUFJLEVBQUUsY0FBYyxDQUFDLEVBQUU7SUFDdEIsa0NBQWtDO0lBQ2xDLGNBQWMsQ0FBQyxHQUFHLENBQUMsWUFBWSxDQUFDLFNBQVMsRUFBRSxFQUFFLGtCQUFrQixDQUFDLE1BQU0sQ0FBQyxXQUFXLENBQUMsT0FBTyxDQUFDLElBQUksQ0FBQyxDQUFDO0lBQ2pHLHFCQUFxQjtJQUNyQixjQUFjLENBQUMsR0FBRyxDQUFDLFlBQVksRUFBRSxxQkFBcUIsQ0FBQyxTQUFTLEVBQUUsRUFBRSxtQkFBbUIsQ0FBQyxTQUFTLEVBQUUsQ0FBQztJQUNwRyw4REFBOEQ7SUFDOUQsY0FBYyxDQUFDLEdBQUcsQ0FBQyxZQUFZLEVBQUUsc0JBQXNCLENBQUMsQ0FDeEQ7Q0FDRCxDQUFDLENBQUMsQ0FBQztBQUVKLFlBQVksQ0FBQyxjQUFjLENBQUMsTUFBTSxDQUFDLGVBQWUsRUFBRSxDQUFDO0lBQ3BELEtBQUssRUFBRSxpQkFBaUI7SUFDeEIsS0FBSyxFQUFFLEVBQUU7SUFDVCxPQUFPLEVBQUU7UUFDUixFQUFFLEVBQUUsaUJBQWlCO1FBQ3JCLEtBQUssRUFBRSxZQUFZO0tBQ25CO0lBQ0QsSUFBSSxFQUFFLGNBQWMsQ0FBQyxHQUFHO0lBQ3ZCLGNBQWM7SUFDZCxZQUFZO0lBQ1osa0JBQWtCO0lBQ2xCLHFCQUFxQjtJQUNyQiwyQkFBMkI7SUFDM0IsK0JBQStCLENBQy9CO0NBQ0QsQ0FBQyxDQUFDLENBQUM7QUFFSixZQUFZLENBQUMsY0FBYyxDQUFDLE1BQU0sQ0FBQyxlQUFlLEVBQUU7SUFDbkQsS0FBSyxFQUFFLFlBQVk7SUFDbkIsS0FBSyxFQUFFLEVBQUU7SUFDVCxPQUFPLEVBQUUsZUFBZTtJQUN4QixJQUFJLEVBQUUsa0JBQWtCLENBQUMsb0JBQW9CO0NBQzdDLENBQUMsQ0FBQztBQUVILFlBQVksQ0FBQyxjQUFjLENBQUMsTUFBTSxDQUFDLGVBQWUsRUFBRTtJQUNuRCxLQUFLLEVBQUUsWUFBWTtJQUNuQixLQUFLLEVBQUUsRUFBRTtJQUNULE9BQU8sRUFBRSx1QkFBdUI7SUFDaEMsSUFBSSxFQUFFLGtCQUFrQixDQUFDLG9CQUFvQjtDQUM3QyxDQUFDLENBQUM7QUFFSCxZQUFZLENBQUMsY0FBYyxDQUFDLE1BQU0sQ0FBQyxlQUFlLEVBQUU7SUFDbkQsS0FBSyxFQUFFLGFBQWE7SUFDcEIsS0FBSyxFQUFFLEVBQUU7SUFDVCxPQUFPLEVBQUU7UUFDUixFQUFFLEVBQUUsMEJBQTBCO1FBQzlCLEtBQUssRUFBRSxxQkFBcUI7S0FDNUI7SUFDRCxJQUFJLEVBQUUsY0FBYyxDQUFDLEdBQUcsQ0FBQyxtQkFBbUIsRUFBRSxjQUFjLENBQUMsRUFBRSxDQUFDLHFDQUFxQyxFQUFFLHFCQUFxQixDQUFDLFNBQVMsQ0FBQyxXQUFXLENBQUMsQ0FBQyxDQUFDO0NBQ3JKLENBQUMsQ0FBQztBQUVILFlBQVksQ0FBQyxjQUFjLENBQUMsTUFBTSxDQUFDLGVBQWUsRUFBRTtJQUNuRCxLQUFLLEVBQUUsYUFBYTtJQUNwQixLQUFLLEVBQUUsRUFBRTtJQUNULE9BQU8sRUFBRTtRQUNSLEVBQUUsRUFBRSw2QkFBNkI7UUFDakMsS0FBSyxFQUFFLHdCQUF3QjtLQUMvQjtJQUNELElBQUksRUFBRSxjQUFjLENBQUMsR0FBRyxDQUFDLG1CQUFtQixFQUFFLHFCQUFxQixFQUFFLGNBQWMsQ0FBQyxHQUFHLENBQUMsMkJBQTJCLENBQUMsV0FBVyxDQUFDLEdBQUcsQ0FBQyxFQUFFLGNBQWMsQ0FBQyxFQUFFLENBQUMscUNBQXFDLEVBQUUscUJBQXFCLENBQUMsU0FBUyxDQUFDLFdBQVcsQ0FBQyxDQUFDLENBQUMsQ0FBQztDQUM5TyxDQUFDLENBQUM7QUFFSCxZQUFZLENBQUMsY0FBYyxDQUFDLE1BQU0sQ0FBQyxlQUFlLEVBQUU7SUFDbkQsS0FBSyxFQUFFLGdCQUFnQjtJQUN2QixLQUFLLEVBQUUsRUFBRTtJQUNULE9BQU8sRUFBRTtRQUNSLEVBQUUsRUFBRSxTQUFTO1FBQ2IsS0FBSyxFQUFFLG9CQUFvQjtRQUMzQixZQUFZLEVBQUUsK0JBQStCO0tBQzdDO0lBQ0QsSUFBSSxFQUFFLG1CQUFtQixDQUFDLFNBQVMsRUFBRTtDQUNyQyxDQUFDLENBQUM7QUFFSCxZQUFZLENBQUMsY0FBYyxDQUFDLE1BQU0sQ0FBQyxlQUFlLEVBQUU7SUFDbkQsS0FBSyxFQUFFLGdCQUFnQjtJQUN2QixLQUFLLEVBQUUsRUFBRTtJQUNULE9BQU8sRUFBRTtRQUNSLEVBQUUsRUFBRSxxQkFBcUI7UUFDekIsS0FBSyxFQUFFLHdCQUF3QjtLQUMvQjtJQUNELEdBQUcsRUFBRTtRQUNKLEVBQUUsRUFBRSxjQUFjO1FBQ2xCLEtBQUssRUFBRSxHQUFHLENBQUMsUUFBUSxDQUFDLFlBQVksRUFBRSxvQkFBb0IsQ0FBQztLQUN2RDtJQUNELElBQUksRUFBRSxjQUFjLENBQUMsR0FBRyxDQUFDLG1CQUFtQixDQUFDLFNBQVMsRUFBRSxFQUFFLCtCQUErQixDQUFDO0NBQzFGLENBQUMsQ0FBQztBQUVILFlBQVksQ0FBQyxjQUFjLENBQUMsTUFBTSxDQUFDLGVBQWUsRUFBRTtJQUNuRCxLQUFLLEVBQUUsZ0JBQWdCO0lBQ3ZCLEtBQUssRUFBRSxFQUFFO0lBQ1QsT0FBTyxFQUFFO1FBQ1IsRUFBRSxFQUFFLGNBQWM7UUFDbEIsS0FBSyxFQUFFLEdBQUcsQ0FBQyxRQUFRLENBQUMsWUFBWSxFQUFFLG9CQUFvQixDQUFDO0tBQ3ZEO0lBQ0QsSUFBSSxFQUFFLGNBQWMsQ0FBQyxHQUFHLENBQUMsbUJBQW1CLENBQUMsU0FBUyxFQUFFLEVBQUUsK0JBQStCLENBQUMsU0FBUyxFQUFFLENBQUM7Q0FDdEcsQ0FBQyxDQUFDO0FBRUgsMERBQTBEO0FBQzFELEtBQUssTUFBTSxNQUFNLElBQUksQ0FBQyxNQUFNLENBQUMsdUJBQXVCLEVBQUUsTUFBTSxDQUFDLG9CQUFvQixDQUFDLEVBQUUsQ0FBQztJQUNwRixZQUFZLENBQUMsY0FBYyxDQUFDLE1BQU0sRUFBRSxFQUFFLE9BQU8sRUFBRSxFQUFFLEVBQUUsRUFBRSw0QkFBNEIsRUFBRSxLQUFLLEVBQUUsR0FBRyxDQUFDLFFBQVEsQ0FBQyxTQUFTLEVBQUUsZUFBZSxDQUFDLEVBQUUsRUFBRSxLQUFLLEVBQUUsUUFBUSxFQUFFLEtBQUssRUFBRSxFQUFFLEVBQUUsQ0FBQyxDQUFDO0lBQ3BLLFlBQVksQ0FBQyxjQUFjLENBQUMsTUFBTSxFQUFFLEVBQUUsT0FBTyxFQUFFLEVBQUUsRUFBRSxFQUFFLDRCQUE0QixFQUFFLEtBQUssRUFBRSxHQUFHLENBQUMsUUFBUSxDQUFDLFVBQVUsRUFBRSxjQUFjLENBQUMsRUFBRSxFQUFFLEtBQUssRUFBRSxRQUFRLEVBQUUsS0FBSyxFQUFFLEVBQUUsRUFBRSxDQUFDLENBQUM7QUFDckssQ0FBQztBQUVELFlBQVk7QUFFWixZQUFZLENBQUMsY0FBYyxDQUFDLE1BQU0sQ0FBQyxlQUFlLEVBQUU7SUFDbkQsS0FBSyxFQUFFLE9BQU87SUFDZCxPQUFPLEVBQUU7UUFDUixFQUFFLEVBQUUsNEJBQTRCO1FBQ2hDLEtBQUssRUFBRSxHQUFHLENBQUMsUUFBUSxDQUFDLEVBQUUsR0FBRyxFQUFFLFdBQVcsRUFBRSxPQUFPLEVBQUUsQ0FBQyx1QkFBdUIsQ0FBQyxFQUFFLEVBQUUsaUJBQWlCLENBQUM7S0FDaEc7SUFDRCxLQUFLLEVBQUUsQ0FBQztDQUNSLENBQUMsQ0FBQztBQUVILFlBQVksQ0FBQyxjQUFjLENBQUMsTUFBTSxDQUFDLGVBQWUsRUFBRTtJQUNuRCxLQUFLLEVBQUUsUUFBUTtJQUNmLE9BQU8sRUFBRTtRQUNSLEVBQUUsRUFBRSxvQkFBb0I7UUFDeEIsS0FBSyxFQUFFLEdBQUcsQ0FBQyxRQUFRLENBQUMsRUFBRSxHQUFHLEVBQUUsUUFBUSxFQUFFLE9BQU8sRUFBRSxDQUFDLHVCQUF1QixDQUFDLEVBQUUsRUFBRSxRQUFRLENBQUM7UUFDcEYsWUFBWSxFQUFFLGNBQWMsQ0FBQyxFQUFFLENBQUMsbUJBQW1CLEVBQUUsY0FBYyxDQUFDLEdBQUcsQ0FBQyx5QkFBeUIsRUFBRSxtQkFBbUIsQ0FBQyxDQUFDO0tBQ3hIO0lBQ0QsS0FBSyxFQUFFLENBQUM7Q0FDUixDQUFDLENBQUM7QUFFSCxZQUFZLENBQUMsY0FBYyxDQUFDLE1BQU0sQ0FBQyxlQUFlLEVBQUU7SUFDbkQsS0FBSyxFQUFFLFFBQVE7SUFDZixPQUFPLEVBQUU7UUFDUixFQUFFLEVBQUUsdUJBQXVCO1FBQzNCLEtBQUssRUFBRSxHQUFHLENBQUMsUUFBUSxDQUFDLEVBQUUsR0FBRyxFQUFFLFVBQVUsRUFBRSxPQUFPLEVBQUUsQ0FBQyx1QkFBdUIsQ0FBQyxFQUFFLEVBQUUsY0FBYyxDQUFDO1FBQzVGLFlBQVksRUFBRSxjQUFjLENBQUMsRUFBRSxDQUFDLG1CQUFtQixFQUFFLGNBQWMsQ0FBQyxHQUFHLENBQUMseUJBQXlCLEVBQUUsbUJBQW1CLENBQUMsQ0FBQztLQUN4SDtJQUNELEtBQUssRUFBRSxDQUFDO0NBQ1IsQ0FBQyxDQUFDO0FBRUgsWUFBWSxDQUFDLGNBQWMsQ0FBQyxNQUFNLENBQUMsZUFBZSxFQUFFO0lBQ25ELEtBQUssRUFBRSxRQUFRO0lBQ2YsT0FBTyxFQUFFO1FBQ1IsRUFBRSxFQUFFLG1CQUFtQjtRQUN2QixLQUFLLEVBQUUsR0FBRyxDQUFDLFFBQVEsQ0FBQyxFQUFFLEdBQUcsRUFBRSxXQUFXLEVBQUUsT0FBTyxFQUFFLENBQUMsdUJBQXVCLENBQUMsRUFBRSxFQUFFLFlBQVksQ0FBQztRQUMzRixZQUFZLEVBQUUseUJBQXlCO0tBQ3ZDO0lBQ0QsS0FBSyxFQUFFLENBQUM7Q0FDUixDQUFDLENBQUM7QUFFSCxZQUFZLENBQUMsY0FBYyxDQUFDLE1BQU0sQ0FBQyxlQUFlLEVBQUU7SUFDbkQsS0FBSyxFQUFFLFlBQVk7SUFDbkIsT0FBTyxFQUFFO1FBQ1IsRUFBRSxFQUFFLG9CQUFvQixDQUFDLEVBQUU7UUFDM0IsS0FBSyxFQUFFLEdBQUcsQ0FBQyxRQUFRLENBQUMsRUFBRSxHQUFHLEVBQUUsWUFBWSxFQUFFLE9BQU8sRUFBRSxDQUFDLHVCQUF1QixDQUFDLEVBQUUsRUFBRSxhQUFhLENBQUM7UUFDN0YsT0FBTyxFQUFFLGNBQWMsQ0FBQyxTQUFTLENBQUMsdUJBQXVCLEVBQUUsS0FBSyxDQUFDO0tBQ2pFO0lBQ0QsS0FBSyxFQUFFLENBQUM7Q0FDUixDQUFDLENBQUM7QUFFSCxZQUFZLENBQUMsY0FBYyxDQUFDLE1BQU0sQ0FBQyxlQUFlLEVBQUU7SUFDbkQsS0FBSyxFQUFFLFNBQVM7SUFDaEIsT0FBTyxFQUFFO1FBQ1IsRUFBRSxFQUFFLHNCQUFzQjtRQUMxQixLQUFLLEVBQUUsR0FBRyxDQUFDLFFBQVEsQ0FBQyxFQUFFLEdBQUcsRUFBRSxVQUFVLEVBQUUsT0FBTyxFQUFFLENBQUMsdUJBQXVCLENBQUMsRUFBRSxFQUFFLGVBQWUsQ0FBQztRQUM3RixZQUFZLEVBQUUsY0FBYyxDQUFDLEVBQUU7UUFDOUIsMkJBQTJCO1FBQzNCLGNBQWMsQ0FBQyxHQUFHLENBQUMsNEJBQTRCLENBQUM7UUFDaEQsdUNBQXVDO1FBQ3ZDLGNBQWMsQ0FBQyxHQUFHLENBQUMsa0JBQWtCLENBQUMsTUFBTSxDQUFDLFdBQVcsQ0FBQyxPQUFPLENBQUMsUUFBUSxDQUFDLEVBQUUseUJBQXlCLEVBQUUsbUJBQW1CLENBQUMsQ0FDM0g7S0FDRDtJQUNELEtBQUssRUFBRSxDQUFDO0NBQ1IsQ0FBQyxDQUFDO0FBRUgsWUFBWSxDQUFDLGNBQWMsQ0FBQyxNQUFNLENBQUMsZUFBZSxFQUFFO0lBQ25ELEtBQUssRUFBRSxTQUFTO0lBQ2hCLE9BQU8sRUFBRTtRQUNSLEVBQUUsRUFBRSx1QkFBdUI7UUFDM0IsS0FBSyxFQUFFLEdBQUcsQ0FBQyxRQUFRLENBQUMsRUFBRSxHQUFHLEVBQUUsZUFBZSxFQUFFLE9BQU8sRUFBRSxDQUFDLHVCQUF1QixDQUFDLEVBQUUsRUFBRSxnQkFBZ0IsQ0FBQztRQUNuRyxZQUFZLEVBQUUsY0FBYyxDQUFDLEVBQUUsQ0FBQyxtQkFBbUIsRUFBRSxjQUFjLENBQUMsR0FBRyxDQUFDLHlCQUF5QixFQUFFLG1CQUFtQixDQUFDLENBQUM7S0FDeEg7SUFDRCxLQUFLLEVBQUUsQ0FBQztDQUNSLENBQUMsQ0FBQztBQUVILGFBQWE7QUFFYixZQUFZLENBQUMsY0FBYyxDQUFDLE1BQU0sQ0FBQyxhQUFhLEVBQUU7SUFDakQsS0FBSyxFQUFFLGNBQWM7SUFDckIsT0FBTyxFQUFFO1FBQ1IsRUFBRSxFQUFFLDRCQUE0QjtRQUNoQyxLQUFLLEVBQUUsR0FBRyxDQUFDLFFBQVEsQ0FBQyxFQUFFLEdBQUcsRUFBRSxZQUFZLEVBQUUsT0FBTyxFQUFFLENBQUMsdUJBQXVCLENBQUMsRUFBRSxFQUFFLGlCQUFpQixDQUFDO0tBQ2pHO0lBQ0QsS0FBSyxFQUFFLENBQUM7Q0FDUixDQUFDLENBQUM7QUFHSCwyQ0FBMkM7QUFFM0MsWUFBWSxDQUFDLGNBQWMsQ0FBQyxNQUFNLENBQUMsc0JBQXNCLEVBQUU7SUFDMUQsS0FBSyxFQUFFLFlBQVk7SUFDbkIsS0FBSyxFQUFFLEVBQUU7SUFDVCxPQUFPLEVBQUUsaUJBQWlCO0lBQzFCLElBQUksRUFBRSxjQUFjLENBQUMsR0FBRyxDQUFDLGtCQUFrQixDQUFDLG9CQUFvQixFQUFFLHFCQUFxQixDQUFDLFNBQVMsRUFBRSxDQUFDO0NBQ3BHLENBQUMsQ0FBQztBQUVILFlBQVksQ0FBQyxjQUFjLENBQUMsTUFBTSxDQUFDLHNCQUFzQixFQUFFO0lBQzFELEtBQUssRUFBRSxZQUFZO0lBQ25CLEtBQUssRUFBRSxFQUFFO0lBQ1QsT0FBTyxFQUFFLHNCQUFzQjtJQUMvQixJQUFJLEVBQUUsa0JBQWtCLENBQUMsb0JBQW9CO0NBQzdDLENBQUMsQ0FBQztBQUVILFlBQVksQ0FBQyxjQUFjLENBQUMsTUFBTSxDQUFDLHNCQUFzQixFQUFFO0lBQzFELEtBQUssRUFBRSxnQkFBZ0I7SUFDdkIsS0FBSyxFQUFFLEVBQUU7SUFDVCxPQUFPLEVBQUUsZUFBZTtJQUN4QixJQUFJLEVBQUUsa0JBQWtCLENBQUMsb0JBQW9CO0NBQzdDLENBQUMsQ0FBQztBQUVILFlBQVksQ0FBQyxjQUFjLENBQUMsTUFBTSxDQUFDLHNCQUFzQixFQUFFO0lBQzFELEtBQUssRUFBRSxnQkFBZ0I7SUFDdkIsS0FBSyxFQUFFLEVBQUU7SUFDVCxPQUFPLEVBQUUsdUJBQXVCO0lBQ2hDLElBQUksRUFBRSxrQkFBa0IsQ0FBQyxvQkFBb0I7Q0FDN0MsQ0FBQyxDQUFDO0FBRUgsd0RBQXdEO0FBRXhELEtBQUssTUFBTSxNQUFNLElBQUksQ0FBQyxNQUFNLENBQUMsK0JBQStCLEVBQUUsTUFBTSxDQUFDLGtDQUFrQyxDQUFDLEVBQUUsQ0FBQztJQUMxRyxZQUFZLENBQUMsY0FBYyxDQUFDLE1BQU0sRUFBRTtRQUNuQyxLQUFLLEVBQUUsWUFBWTtRQUNuQixLQUFLLEVBQUUsRUFBRTtRQUNULE9BQU8sRUFBRSxpQkFBaUI7UUFDMUIsSUFBSSxFQUFFLGNBQWMsQ0FBQyxHQUFHLENBQUMsa0JBQWtCLENBQUMsV0FBVyxFQUFFLHFCQUFxQixDQUFDLFNBQVMsRUFBRSxDQUFDO0tBQzNGLENBQUMsQ0FBQztJQUVILFlBQVksQ0FBQyxjQUFjLENBQUMsTUFBTSxFQUFFO1FBQ25DLEtBQUssRUFBRSxZQUFZO1FBQ25CLEtBQUssRUFBRSxFQUFFO1FBQ1QsT0FBTyxFQUFFLHNCQUFzQjtRQUMvQixJQUFJLEVBQUUsa0JBQWtCLENBQUMsb0JBQW9CO0tBQzdDLENBQUMsQ0FBQztJQUVILFlBQVksQ0FBQyxjQUFjLENBQUMsTUFBTSxFQUFFO1FBQ25DLEtBQUssRUFBRSxnQkFBZ0I7UUFDdkIsS0FBSyxFQUFFLEVBQUU7UUFDVCxPQUFPLEVBQUUsZUFBZTtRQUN4QixJQUFJLEVBQUUsa0JBQWtCLENBQUMsb0JBQW9CO0tBQzdDLENBQUMsQ0FBQztJQUVILFlBQVksQ0FBQyxjQUFjLENBQUMsTUFBTSxFQUFFO1FBQ25DLEtBQUssRUFBRSxnQkFBZ0I7UUFDdkIsS0FBSyxFQUFFLEVBQUU7UUFDVCxPQUFPLEVBQUUsdUJBQXVCO1FBQ2hDLElBQUksRUFBRSxrQkFBa0IsQ0FBQyxvQkFBb0I7S0FDN0MsQ0FBQyxDQUFDO0FBQ0osQ0FBQyJ9