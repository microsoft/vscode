/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import nls = require('vs/nls');
import { Registry } from 'vs/platform/registry/common/platform';
import { GlobalNewUntitledFileAction, ShowOpenedFileInNewWindow, CopyPathAction, FocusOpenEditorsView, FocusFilesExplorer, GlobalCompareResourcesAction, SaveAllAction, ShowActiveFileInExplorer, CollapseExplorerView, RefreshExplorerView, CompareWithClipboardAction, NEW_FILE_COMMAND_ID, NEW_FILE_LABEL, NEW_FOLDER_COMMAND_ID, NEW_FOLDER_LABEL, TRIGGER_RENAME_LABEL, MOVE_FILE_TO_TRASH_LABEL, COPY_FILE_LABEL, PASTE_FILE_LABEL, FileCopiedContext, renameHandler, moveFileToTrashHandler, copyFileHandler, pasteFileHandler, deleteFileHandler } from 'vs/workbench/parts/files/electron-browser/fileActions';
import { revertLocalChangesCommand, acceptLocalChangesCommand, CONFLICT_RESOLUTION_CONTEXT } from 'vs/workbench/parts/files/electron-browser/saveErrorHandler';
import { SyncActionDescriptor, MenuId, MenuRegistry } from 'vs/platform/actions/common/actions';
import { IWorkbenchActionRegistry, Extensions as ActionExtensions } from 'vs/workbench/common/actions';
import { KeyMod, KeyChord, KeyCode } from 'vs/base/common/keyCodes';
import { openWindowCommand, REVEAL_IN_OS_COMMAND_ID, COPY_PATH_COMMAND_ID, REVEAL_IN_EXPLORER_COMMAND_ID, OPEN_TO_SIDE_COMMAND_ID, REVERT_FILE_COMMAND_ID, SAVE_FILE_COMMAND_ID, SAVE_FILE_LABEL, SAVE_FILE_AS_COMMAND_ID, SAVE_FILE_AS_LABEL, SAVE_ALL_IN_GROUP_COMMAND_ID, OpenEditorsGroupContext, COMPARE_WITH_SAVED_COMMAND_ID, COMPARE_RESOURCE_COMMAND_ID, SELECT_FOR_COMPARE_COMMAND_ID, ResourceSelectedForCompareContext, REVEAL_IN_OS_LABEL, DirtyEditorContext, COMPARE_SELECTED_COMMAND_ID, REMOVE_ROOT_FOLDER_COMMAND_ID, REMOVE_ROOT_FOLDER_LABEL, SAVE_FILES_COMMAND_ID } from 'vs/workbench/parts/files/electron-browser/fileCommands';
import { CommandsRegistry, ICommandHandler } from 'vs/platform/commands/common/commands';
import { ContextKeyExpr } from 'vs/platform/contextkey/common/contextkey';
import { KeybindingsRegistry } from 'vs/platform/keybinding/common/keybindingsRegistry';
import { isWindows, isMacintosh } from 'vs/base/common/platform';
import { FilesExplorerFocusCondition, ExplorerRootContext, ExplorerFolderContext } from 'vs/workbench/parts/files/common/files';
import { ADD_ROOT_FOLDER_COMMAND_ID, ADD_ROOT_FOLDER_LABEL } from 'vs/workbench/browser/actions/workspaceCommands';
import { CLOSE_SAVED_EDITORS_COMMAND_ID, CLOSE_EDITORS_IN_GROUP_COMMAND_ID, CLOSE_EDITOR_COMMAND_ID, CLOSE_OTHER_EDITORS_IN_GROUP_COMMAND_ID } from 'vs/workbench/browser/parts/editor/editorCommands';
import { OPEN_FOLDER_SETTINGS_COMMAND, OPEN_FOLDER_SETTINGS_LABEL } from 'vs/workbench/parts/preferences/browser/preferencesActions';
import { AutoSaveContext } from 'vs/workbench/services/textfile/common/textfiles';
import { ResourceContextKey } from 'vs/workbench/common/resources';
import { WorkbenchListDoubleSelection } from 'vs/platform/list/browser/listService';
import URI from 'vs/base/common/uri';
import { Schemas } from 'vs/base/common/network';

// Contribute Global Actions
const category = nls.localize('filesCategory', "File");

const registry = Registry.as<IWorkbenchActionRegistry>(ActionExtensions.WorkbenchActions);
registry.registerWorkbenchAction(new SyncActionDescriptor(SaveAllAction, SaveAllAction.ID, SaveAllAction.LABEL, { primary: void 0, mac: { primary: KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.KEY_S }, win: { primary: KeyChord(KeyMod.CtrlCmd | KeyCode.KEY_K, KeyCode.KEY_S) } }), 'File: Save All', category);
registry.registerWorkbenchAction(new SyncActionDescriptor(GlobalCompareResourcesAction, GlobalCompareResourcesAction.ID, GlobalCompareResourcesAction.LABEL), 'File: Compare Active File With...', category);
registry.registerWorkbenchAction(new SyncActionDescriptor(FocusOpenEditorsView, FocusOpenEditorsView.ID, FocusOpenEditorsView.LABEL, { primary: KeyChord(KeyMod.CtrlCmd | KeyCode.KEY_K, KeyCode.KEY_E) }), 'File: Focus on Open Editors View', category);
registry.registerWorkbenchAction(new SyncActionDescriptor(FocusFilesExplorer, FocusFilesExplorer.ID, FocusFilesExplorer.LABEL), 'File: Focus on Files Explorer', category);
registry.registerWorkbenchAction(new SyncActionDescriptor(ShowActiveFileInExplorer, ShowActiveFileInExplorer.ID, ShowActiveFileInExplorer.LABEL), 'File: Reveal Active File in Side Bar', category);
registry.registerWorkbenchAction(new SyncActionDescriptor(CollapseExplorerView, CollapseExplorerView.ID, CollapseExplorerView.LABEL), 'File: Collapse Folders in Explorer', category);
registry.registerWorkbenchAction(new SyncActionDescriptor(RefreshExplorerView, RefreshExplorerView.ID, RefreshExplorerView.LABEL), 'File: Refresh Explorer', category);
registry.registerWorkbenchAction(new SyncActionDescriptor(GlobalNewUntitledFileAction, GlobalNewUntitledFileAction.ID, GlobalNewUntitledFileAction.LABEL, { primary: KeyMod.CtrlCmd | KeyCode.KEY_N }), 'File: New Untitled File', category);
registry.registerWorkbenchAction(new SyncActionDescriptor(ShowOpenedFileInNewWindow, ShowOpenedFileInNewWindow.ID, ShowOpenedFileInNewWindow.LABEL, { primary: KeyChord(KeyMod.CtrlCmd | KeyCode.KEY_K, KeyCode.KEY_O) }), 'File: Open Active File in New Window', category);
registry.registerWorkbenchAction(new SyncActionDescriptor(CompareWithClipboardAction, CompareWithClipboardAction.ID, CompareWithClipboardAction.LABEL, { primary: KeyChord(KeyMod.CtrlCmd | KeyCode.KEY_K, KeyCode.KEY_C) }), 'File: Compare Active File with Clipboard', category);

// Commands
CommandsRegistry.registerCommand('_files.windowOpen', openWindowCommand);

const explorerCommandsWeightBonus = 10; // give our commands a little bit more weight over other default list/tree commands

const RENAME_ID = 'renameFile';
KeybindingsRegistry.registerCommandAndKeybindingRule({
	id: RENAME_ID,
	weight: KeybindingsRegistry.WEIGHT.workbenchContrib(explorerCommandsWeightBonus),
	when: ContextKeyExpr.and(FilesExplorerFocusCondition, ExplorerRootContext.toNegated()),
	primary: KeyCode.F2,
	mac: {
		primary: KeyCode.Enter
	},
	handler: renameHandler
});

const MOVE_FILE_TO_TRASH_ID = 'moveFileToTrash';
KeybindingsRegistry.registerCommandAndKeybindingRule({
	id: MOVE_FILE_TO_TRASH_ID,
	weight: KeybindingsRegistry.WEIGHT.workbenchContrib(explorerCommandsWeightBonus),
	when: ContextKeyExpr.and(FilesExplorerFocusCondition, ExplorerRootContext.toNegated()),
	primary: KeyCode.Delete,
	mac: {
		primary: KeyMod.CtrlCmd | KeyCode.Backspace
	},
	handler: moveFileToTrashHandler
});

const DELETE_FILE_ID = 'deleteFile';
KeybindingsRegistry.registerCommandAndKeybindingRule({
	id: DELETE_FILE_ID,
	weight: KeybindingsRegistry.WEIGHT.workbenchContrib(explorerCommandsWeightBonus),
	when: ContextKeyExpr.and(FilesExplorerFocusCondition, ExplorerRootContext.toNegated()),
	primary: KeyMod.Shift | KeyCode.Delete,
	mac: {
		primary: KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.Backspace
	},
	handler: deleteFileHandler
});

const COPY_FILE_ID = 'filesExplorer.copy';
KeybindingsRegistry.registerCommandAndKeybindingRule({
	id: COPY_FILE_ID,
	weight: KeybindingsRegistry.WEIGHT.workbenchContrib(explorerCommandsWeightBonus),
	when: ContextKeyExpr.and(FilesExplorerFocusCondition, ExplorerRootContext.toNegated()),
	primary: KeyMod.CtrlCmd | KeyCode.KEY_C,
	handler: copyFileHandler,
});

const PASTE_FILE_ID = 'filesExplorer.paste';

KeybindingsRegistry.registerCommandAndKeybindingRule({
	id: PASTE_FILE_ID,
	weight: KeybindingsRegistry.WEIGHT.workbenchContrib(explorerCommandsWeightBonus),
	when: ContextKeyExpr.and(FilesExplorerFocusCondition),
	primary: KeyMod.CtrlCmd | KeyCode.KEY_V,
	handler: pasteFileHandler
});

// Editor Title Context Menu
appendEditorTitleContextMenuItem(REVEAL_IN_OS_COMMAND_ID, REVEAL_IN_OS_LABEL, ResourceContextKey.Scheme.isEqualTo(Schemas.file));
appendEditorTitleContextMenuItem(COPY_PATH_COMMAND_ID, CopyPathAction.LABEL, ResourceContextKey.IsFile);
appendEditorTitleContextMenuItem(REVEAL_IN_EXPLORER_COMMAND_ID, nls.localize('revealInSideBar', "Reveal in Side Bar"), ResourceContextKey.IsFile);

function appendEditorTitleContextMenuItem(id: string, title: string, when: ContextKeyExpr): void {

	// Menu
	MenuRegistry.appendMenuItem(MenuId.EditorTitleContext, {
		command: { id, title },
		when,
		group: '2_files'
	});
}

// Editor Title Menu for Conflict Resolution
appendSaveConflictEditorTitleAction('workbench.files.action.acceptLocalChanges', nls.localize('acceptLocalChanges', "Use your changes and overwrite disk contents"), {
	light: URI.parse(require.toUrl(`vs/workbench/parts/files/electron-browser/media/check.svg`)).fsPath,
	dark: URI.parse(require.toUrl(`vs/workbench/parts/files/electron-browser/media/check-inverse.svg`)).fsPath
}, -10, acceptLocalChangesCommand);
appendSaveConflictEditorTitleAction('workbench.files.action.revertLocalChanges', nls.localize('revertLocalChanges', "Discard your changes and revert to content on disk"), {
	light: URI.parse(require.toUrl(`vs/workbench/parts/files/electron-browser/media/undo.svg`)).fsPath,
	dark: URI.parse(require.toUrl(`vs/workbench/parts/files/electron-browser/media/undo-inverse.svg`)).fsPath
}, -9, revertLocalChangesCommand);

function appendSaveConflictEditorTitleAction(id: string, title: string, iconPath: { dark: string; light?: string; }, order: number, command: ICommandHandler): void {

	// Command
	CommandsRegistry.registerCommand(id, command);

	// Action
	MenuRegistry.appendMenuItem(MenuId.EditorTitle, {
		command: { id, title, iconPath },
		when: ContextKeyExpr.equals(CONFLICT_RESOLUTION_CONTEXT, true),
		group: 'navigation',
		order
	});
}

// Menu registration - command palette

function appendToCommandPalette(id: string, title: string, category: string): void {
	MenuRegistry.appendMenuItem(MenuId.CommandPalette, {
		command: {
			id,
			title,
			category
		}
	});
}
appendToCommandPalette(COPY_PATH_COMMAND_ID, nls.localize('copyPathOfActive', "Copy Path of Active File"), category);
appendToCommandPalette(SAVE_FILE_COMMAND_ID, SAVE_FILE_LABEL, category);
appendToCommandPalette(SAVE_ALL_IN_GROUP_COMMAND_ID, nls.localize('saveAllInGroup', "Save All in Group"), category);
appendToCommandPalette(SAVE_FILES_COMMAND_ID, nls.localize('saveFiles', "Save All Files"), category);
appendToCommandPalette(REVERT_FILE_COMMAND_ID, nls.localize('revert', "Revert File"), category);
appendToCommandPalette(COMPARE_WITH_SAVED_COMMAND_ID, nls.localize('compareActiveWithSaved', "Compare Active File with Saved"), category);
appendToCommandPalette(REVEAL_IN_OS_COMMAND_ID, REVEAL_IN_OS_LABEL, category);
appendToCommandPalette(SAVE_FILE_AS_COMMAND_ID, SAVE_FILE_AS_LABEL, category);
appendToCommandPalette(CLOSE_EDITOR_COMMAND_ID, nls.localize('closeEditor', "Close Editor"), nls.localize('view', "View"));
appendToCommandPalette(NEW_FILE_COMMAND_ID, NEW_FILE_LABEL, category);
appendToCommandPalette(NEW_FOLDER_COMMAND_ID, NEW_FOLDER_LABEL, category);



// Menu registration - open editors

const openToSideCommand = {
	id: OPEN_TO_SIDE_COMMAND_ID,
	title: nls.localize('openToSide', "Open to the Side")
};
MenuRegistry.appendMenuItem(MenuId.OpenEditorsContext, {
	group: 'navigation',
	order: 10,
	command: openToSideCommand,
	when: ResourceContextKey.HasResource && ResourceContextKey.IsFile
});

const revealInOsCommand = {
	id: REVEAL_IN_OS_COMMAND_ID,
	title: isWindows ? nls.localize('revealInWindows', "Reveal in Explorer") : isMacintosh ? nls.localize('revealInMac', "Reveal in Finder") : nls.localize('openContainer', "Open Containing Folder")
};
MenuRegistry.appendMenuItem(MenuId.OpenEditorsContext, {
	group: 'navigation',
	order: 20,
	command: revealInOsCommand,
	when: ResourceContextKey.Scheme.isEqualTo(Schemas.file)
});

const copyPathCommand = {
	id: COPY_PATH_COMMAND_ID,
	title: nls.localize('copyPath', "Copy Path")
};
MenuRegistry.appendMenuItem(MenuId.OpenEditorsContext, {
	group: 'navigation',
	order: 40,
	command: copyPathCommand,
	when: ResourceContextKey.IsFile
});

MenuRegistry.appendMenuItem(MenuId.OpenEditorsContext, {
	group: '2_save',
	order: 10,
	command: {
		id: SAVE_FILE_COMMAND_ID,
		title: SAVE_FILE_LABEL,
		precondition: DirtyEditorContext
	},
	when: ContextKeyExpr.and(ResourceContextKey.IsFile, AutoSaveContext.notEqualsTo('afterDelay') && AutoSaveContext.notEqualsTo(''))
});

MenuRegistry.appendMenuItem(MenuId.OpenEditorsContext, {
	group: '2_save',
	order: 20,
	command: {
		id: REVERT_FILE_COMMAND_ID,
		title: nls.localize('revert', "Revert File"),
		precondition: DirtyEditorContext
	},
	when: ContextKeyExpr.and(ResourceContextKey.IsFile, AutoSaveContext.notEqualsTo('afterDelay') && AutoSaveContext.notEqualsTo(''))
});

MenuRegistry.appendMenuItem(MenuId.OpenEditorsContext, {
	group: '2_save',
	command: {
		id: SAVE_FILE_AS_COMMAND_ID,
		title: SAVE_FILE_AS_LABEL
	},
	when: ResourceContextKey.Scheme.isEqualTo(Schemas.untitled)
});

MenuRegistry.appendMenuItem(MenuId.OpenEditorsContext, {
	group: '2_save',
	command: {
		id: SAVE_ALL_IN_GROUP_COMMAND_ID,
		title: nls.localize('saveAll', "Save All")
	},
	when: ContextKeyExpr.and(OpenEditorsGroupContext, AutoSaveContext.notEqualsTo('afterDelay') && AutoSaveContext.notEqualsTo(''))
});

MenuRegistry.appendMenuItem(MenuId.OpenEditorsContext, {
	group: '3_compare',
	order: 10,
	command: {
		id: COMPARE_WITH_SAVED_COMMAND_ID,
		title: nls.localize('compareWithSaved', "Compare with Saved"),
		precondition: DirtyEditorContext
	},
	when: ContextKeyExpr.and(ResourceContextKey.IsFile, AutoSaveContext.notEqualsTo('afterDelay') && AutoSaveContext.notEqualsTo(''), WorkbenchListDoubleSelection.toNegated())
});

const compareResourceCommand = {
	id: COMPARE_RESOURCE_COMMAND_ID,
	title: nls.localize('compareWithSelected', "Compare with Selected")
};
MenuRegistry.appendMenuItem(MenuId.OpenEditorsContext, {
	group: '3_compare',
	order: 20,
	command: compareResourceCommand,
	when: ContextKeyExpr.and(ResourceContextKey.HasResource, ResourceSelectedForCompareContext, WorkbenchListDoubleSelection.toNegated())
});

const selectForCompareCommand = {
	id: SELECT_FOR_COMPARE_COMMAND_ID,
	title: nls.localize('compareSource', "Select for Compare")
};
MenuRegistry.appendMenuItem(MenuId.OpenEditorsContext, {
	group: '3_compare',
	order: 30,
	command: selectForCompareCommand,
	when: ContextKeyExpr.and(ResourceContextKey.HasResource, WorkbenchListDoubleSelection.toNegated())
});

const compareSelectedCommand = {
	id: COMPARE_SELECTED_COMMAND_ID,
	title: nls.localize('compareSelected', "Compare Selected")
};
MenuRegistry.appendMenuItem(MenuId.OpenEditorsContext, {
	group: '3_compare',
	order: 30,
	command: compareSelectedCommand,
	when: ContextKeyExpr.and(ResourceContextKey.HasResource, WorkbenchListDoubleSelection)
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
		title: NEW_FILE_LABEL
	},
	when: ExplorerFolderContext
});

MenuRegistry.appendMenuItem(MenuId.ExplorerContext, {
	group: 'navigation',
	order: 6,
	command: {
		id: NEW_FOLDER_COMMAND_ID,
		title: NEW_FOLDER_LABEL
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
	command: revealInOsCommand,
	when: ResourceContextKey.Scheme.isEqualTo(Schemas.file)
});

MenuRegistry.appendMenuItem(MenuId.ExplorerContext, {
	group: '3_compare',
	order: 20,
	command: compareResourceCommand,
	when: ContextKeyExpr.and(ExplorerFolderContext.toNegated(), ResourceContextKey.IsFile, ResourceSelectedForCompareContext, WorkbenchListDoubleSelection.toNegated())
});

MenuRegistry.appendMenuItem(MenuId.ExplorerContext, {
	group: '3_compare',
	order: 30,
	command: selectForCompareCommand,
	when: ContextKeyExpr.and(ExplorerFolderContext.toNegated(), ResourceContextKey.IsFile, WorkbenchListDoubleSelection.toNegated())
});

MenuRegistry.appendMenuItem(MenuId.ExplorerContext, {
	group: '3_compare',
	order: 30,
	command: compareSelectedCommand,
	when: ContextKeyExpr.and(ExplorerFolderContext.toNegated(), ResourceContextKey.IsFile, WorkbenchListDoubleSelection)
});

MenuRegistry.appendMenuItem(MenuId.ExplorerContext, {
	group: '5_cutcopypaste',
	order: 10,
	command: {
		id: COPY_FILE_ID,
		title: COPY_FILE_LABEL
	},
	when: ExplorerRootContext.toNegated()
});

MenuRegistry.appendMenuItem(MenuId.ExplorerContext, {
	group: '5_cutcopypaste',
	order: 20,
	command: {
		id: PASTE_FILE_ID,
		title: PASTE_FILE_LABEL,
		precondition: FileCopiedContext
	},
	when: ExplorerFolderContext
});

MenuRegistry.appendMenuItem(MenuId.ExplorerContext, {
	group: '5_cutcopypaste',
	order: 30,
	command: copyPathCommand,
	when: ResourceContextKey.IsFile
});

MenuRegistry.appendMenuItem(MenuId.ExplorerContext, {
	group: '2_workspace',
	order: 10,
	command: {
		id: ADD_ROOT_FOLDER_COMMAND_ID,
		title: ADD_ROOT_FOLDER_LABEL
	},
	when: ExplorerRootContext
});

MenuRegistry.appendMenuItem(MenuId.ExplorerContext, {
	group: '2_workspace',
	order: 20,
	command: {
		id: OPEN_FOLDER_SETTINGS_COMMAND,
		title: OPEN_FOLDER_SETTINGS_LABEL
	},
	when: ContextKeyExpr.and(ExplorerRootContext, ExplorerFolderContext)
});

MenuRegistry.appendMenuItem(MenuId.ExplorerContext, {
	group: '2_workspace',
	order: 30,
	command: {
		id: REMOVE_ROOT_FOLDER_COMMAND_ID,
		title: REMOVE_ROOT_FOLDER_LABEL
	},
	when: ContextKeyExpr.and(ExplorerRootContext, ExplorerFolderContext)
});

MenuRegistry.appendMenuItem(MenuId.ExplorerContext, {
	group: '7_modification',
	order: 10,
	command: {
		id: RENAME_ID,
		title: TRIGGER_RENAME_LABEL
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
	when: ExplorerRootContext.toNegated()
});
