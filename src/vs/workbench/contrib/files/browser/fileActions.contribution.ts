/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from 'vs/nls';
import { ToggleAutoSaveAction, FocusFilesExplorer, GlobalCompareResourcesAction, ShowActiveFileInExplorer, CompareWithClipboardAction, NEW_FILE_COMMAND_ID, NEW_FILE_LABEL, NEW_FOLDER_COMMAND_ID, NEW_FOLDER_LABEL, TRIGGER_RENAME_LABEL, MOVE_FILE_TO_TRASH_LABEL, COPY_FILE_LABEL, PASTE_FILE_LABEL, FileCopiedContext, renameHandler, moveFileToTrashHandler, copyFileHandler, pasteFileHandler, deleteFileHandler, cutFileHandler, DOWNLOAD_COMMAND_ID, openFilePreserveFocusHandler, DOWNLOAD_LABEL, OpenActiveFileInEmptyWorkspace, UPLOAD_COMMAND_ID, UPLOAD_LABEL, CompareNewUntitledTextFilesAction, SetActiveEditorReadonlyInSession, SetActiveEditorWriteableInSession, ToggleActiveEditorReadonlyInSession, ResetActiveEditorReadonlyInSession } from 'vs/workbench/contrib/files/browser/fileActions';
import { revertLocalChangesCommand, acceptLocalChangesCommand, CONFLICT_RESOLUTION_CONTEXT } from 'vs/workbench/contrib/files/browser/editors/textFileSaveErrorHandler';
import { MenuId, MenuRegistry, registerAction2 } from 'vs/platform/actions/common/actions';
import { ICommandAction } from 'vs/platform/action/common/action';
import { KeyMod, KeyCode } from 'vs/base/common/keyCodes';
import { openWindowCommand, newWindowCommand } from 'vs/workbench/contrib/files/browser/fileCommands';
import { COPY_PATH_COMMAND_ID, REVEAL_IN_EXPLORER_COMMAND_ID, OPEN_TO_SIDE_COMMAND_ID, REVERT_FILE_COMMAND_ID, SAVE_FILE_COMMAND_ID, SAVE_FILE_LABEL, SAVE_FILE_AS_COMMAND_ID, SAVE_FILE_AS_LABEL, SAVE_ALL_IN_GROUP_COMMAND_ID, OpenEditorsGroupContext, COMPARE_WITH_SAVED_COMMAND_ID, COMPARE_RESOURCE_COMMAND_ID, SELECT_FOR_COMPARE_COMMAND_ID, ResourceSelectedForCompareContext, OpenEditorsDirtyEditorContext, COMPARE_SELECTED_COMMAND_ID, REMOVE_ROOT_FOLDER_COMMAND_ID, REMOVE_ROOT_FOLDER_LABEL, SAVE_FILES_COMMAND_ID, COPY_RELATIVE_PATH_COMMAND_ID, SAVE_FILE_WITHOUT_FORMATTING_COMMAND_ID, SAVE_FILE_WITHOUT_FORMATTING_LABEL, OpenEditorsReadonlyEditorContext, OPEN_WITH_EXPLORER_COMMAND_ID, NEW_UNTITLED_FILE_COMMAND_ID, NEW_UNTITLED_FILE_LABEL, SAVE_ALL_COMMAND_ID, OpenEditorsSelectedFileOrUntitledContext } from 'vs/workbench/contrib/files/browser/fileConstants';
import { CommandsRegistry, ICommandHandler } from 'vs/platform/commands/common/commands';
import { ContextKeyExpr, ContextKeyExpression } from 'vs/platform/contextkey/common/contextkey';
import { KeybindingsRegistry, KeybindingWeight } from 'vs/platform/keybinding/common/keybindingsRegistry';
import { FilesExplorerFocusCondition, ExplorerRootContext, ExplorerFolderContext, ExplorerResourceNotReadonlyContext, ExplorerResourceCut, ExplorerResourceMoveableToTrash, ExplorerResourceAvailableEditorIdsContext, FoldersViewVisibleContext } from 'vs/workbench/contrib/files/common/files';
import { ADD_ROOT_FOLDER_COMMAND_ID, ADD_ROOT_FOLDER_LABEL } from 'vs/workbench/browser/actions/workspaceCommands';
import { CLOSE_SAVED_EDITORS_COMMAND_ID, CLOSE_EDITORS_IN_GROUP_COMMAND_ID, CLOSE_EDITOR_COMMAND_ID, CLOSE_OTHER_EDITORS_IN_GROUP_COMMAND_ID, REOPEN_WITH_COMMAND_ID } from 'vs/workbench/browser/parts/editor/editorCommands';
import { AutoSaveAfterShortDelayContext } from 'vs/workbench/services/filesConfiguration/common/filesConfigurationService';
import { WorkbenchListDoubleSelection } from 'vs/platform/list/browser/listService';
import { Schemas } from 'vs/base/common/network';
import { DirtyWorkingCopiesContext, EnterMultiRootWorkspaceSupportContext, HasWebFileSystemAccess, WorkbenchStateContext, WorkspaceFolderCountContext, SidebarFocusContext, ActiveEditorCanRevertContext, ActiveEditorContext, ResourceContextKey, ActiveEditorAvailableEditorIdsContext, MultipleEditorsSelectedInGroupContext, TwoEditorsSelectedInGroupContext, SelectedEditorsInGroupFileOrUntitledResourceContextKey } from 'vs/workbench/common/contextkeys';
import { IsWebContext } from 'vs/platform/contextkey/common/contextkeys';
import { ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { ThemeIcon } from 'vs/base/common/themables';
import { IExplorerService } from 'vs/workbench/contrib/files/browser/files';
import { Codicon } from 'vs/base/common/codicons';
import { Categories } from 'vs/platform/action/common/actionCommonCategories';

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
	weight: KeybindingWeight.WorkbenchContrib + explorerCommandsWeightBonus,
	when: ContextKeyExpr.and(FilesExplorerFocusCondition, ExplorerRootContext.toNegated(), ExplorerResourceNotReadonlyContext),
	primary: KeyCode.F2,
	mac: {
		primary: KeyCode.Enter
	},
	handler: renameHandler
});

const MOVE_FILE_TO_TRASH_ID = 'moveFileToTrash';
KeybindingsRegistry.registerCommandAndKeybindingRule({
	id: MOVE_FILE_TO_TRASH_ID,
	weight: KeybindingWeight.WorkbenchContrib + explorerCommandsWeightBonus,
	when: ContextKeyExpr.and(FilesExplorerFocusCondition, ExplorerResourceNotReadonlyContext, ExplorerResourceMoveableToTrash),
	primary: KeyCode.Delete,
	mac: {
		primary: KeyMod.CtrlCmd | KeyCode.Backspace,
		secondary: [KeyCode.Delete]
	},
	handler: moveFileToTrashHandler
});

const DELETE_FILE_ID = 'deleteFile';
KeybindingsRegistry.registerCommandAndKeybindingRule({
	id: DELETE_FILE_ID,
	weight: KeybindingWeight.WorkbenchContrib + explorerCommandsWeightBonus,
	when: ContextKeyExpr.and(FilesExplorerFocusCondition, ExplorerResourceNotReadonlyContext),
	primary: KeyMod.Shift | KeyCode.Delete,
	mac: {
		primary: KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.Backspace
	},
	handler: deleteFileHandler
});

KeybindingsRegistry.registerCommandAndKeybindingRule({
	id: DELETE_FILE_ID,
	weight: KeybindingWeight.WorkbenchContrib + explorerCommandsWeightBonus,
	when: ContextKeyExpr.and(FilesExplorerFocusCondition, ExplorerResourceNotReadonlyContext, ExplorerResourceMoveableToTrash.toNegated()),
	primary: KeyCode.Delete,
	mac: {
		primary: KeyMod.CtrlCmd | KeyCode.Backspace
	},
	handler: deleteFileHandler
});

const CUT_FILE_ID = 'filesExplorer.cut';
KeybindingsRegistry.registerCommandAndKeybindingRule({
	id: CUT_FILE_ID,
	weight: KeybindingWeight.WorkbenchContrib + explorerCommandsWeightBonus,
	when: ContextKeyExpr.and(FilesExplorerFocusCondition, ExplorerRootContext.toNegated(), ExplorerResourceNotReadonlyContext),
	primary: KeyMod.CtrlCmd | KeyCode.KeyX,
	handler: cutFileHandler,
});

const COPY_FILE_ID = 'filesExplorer.copy';
KeybindingsRegistry.registerCommandAndKeybindingRule({
	id: COPY_FILE_ID,
	weight: KeybindingWeight.WorkbenchContrib + explorerCommandsWeightBonus,
	when: ContextKeyExpr.and(FilesExplorerFocusCondition, ExplorerRootContext.toNegated()),
	primary: KeyMod.CtrlCmd | KeyCode.KeyC,
	handler: copyFileHandler,
});

const PASTE_FILE_ID = 'filesExplorer.paste';

CommandsRegistry.registerCommand(PASTE_FILE_ID, pasteFileHandler);

KeybindingsRegistry.registerKeybindingRule({
	id: `^${PASTE_FILE_ID}`, // the `^` enables pasting files into the explorer by preventing default bubble up
	weight: KeybindingWeight.WorkbenchContrib + explorerCommandsWeightBonus,
	when: ContextKeyExpr.and(FilesExplorerFocusCondition, ExplorerResourceNotReadonlyContext),
	primary: KeyMod.CtrlCmd | KeyCode.KeyV,
});

KeybindingsRegistry.registerCommandAndKeybindingRule({
	id: 'filesExplorer.cancelCut',
	weight: KeybindingWeight.WorkbenchContrib + explorerCommandsWeightBonus,
	when: ContextKeyExpr.and(FilesExplorerFocusCondition, ExplorerResourceCut),
	primary: KeyCode.Escape,
	handler: async (accessor: ServicesAccessor) => {
		const explorerService = accessor.get(IExplorerService);
		await explorerService.setToCopy([], true);
	}
});

KeybindingsRegistry.registerCommandAndKeybindingRule({
	id: 'filesExplorer.openFilePreserveFocus',
	weight: KeybindingWeight.WorkbenchContrib + explorerCommandsWeightBonus,
	when: ContextKeyExpr.and(FilesExplorerFocusCondition, ExplorerFolderContext.toNegated()),
	primary: KeyCode.Space,
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

// Editor Title Context Menu
appendEditorTitleContextMenuItem(COPY_PATH_COMMAND_ID, copyPathCommand.title, ResourceContextKey.IsFileSystemResource, '1_cutcopypaste', true);
appendEditorTitleContextMenuItem(COPY_RELATIVE_PATH_COMMAND_ID, copyRelativePathCommand.title, ResourceContextKey.IsFileSystemResource, '1_cutcopypaste', true);
appendEditorTitleContextMenuItem(REVEAL_IN_EXPLORER_COMMAND_ID, nls.localize('revealInSideBar', "Reveal in Explorer View"), ResourceContextKey.IsFileSystemResource, '2_files', false, 1);

export function appendEditorTitleContextMenuItem(id: string, title: string, when: ContextKeyExpression | undefined, group: string, supportsMultiSelect: boolean, order?: number): void {
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

function appendSaveConflictEditorTitleAction(id: string, title: string, icon: ThemeIcon, order: number, command: ICommandHandler): void {

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

export function appendToCommandPalette({ id, title, category, metadata }: ICommandAction, when?: ContextKeyExpression): void {
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
	when: ActiveEditorAvailableEditorIdsContext
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
			AutoSaveAfterShortDelayContext.toNegated()
		)
	)
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
		AutoSaveAfterShortDelayContext.toNegated()
	)
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
		precondition: ExplorerResourceNotReadonlyContext
	},
	when: ExplorerFolderContext
});

MenuRegistry.appendMenuItem(MenuId.ExplorerContext, {
	group: 'navigation',
	order: 6,
	command: {
		id: NEW_FOLDER_COMMAND_ID,
		title: NEW_FOLDER_LABEL,
		precondition: ExplorerResourceNotReadonlyContext
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
		title: nls.localize('cut', "Cut")
	},
	when: ContextKeyExpr.and(ExplorerRootContext.toNegated(), ExplorerResourceNotReadonlyContext)
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
		precondition: ContextKeyExpr.and(ExplorerResourceNotReadonlyContext, FileCopiedContext)
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
		ContextKeyExpr.and(IsWebContext, HasWebFileSystemAccess)
	)
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
		// only on editable folders
		ExplorerResourceNotReadonlyContext
	)
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
		title: ADD_ROOT_FOLDER_LABEL
	},
	when: ContextKeyExpr.and(ExplorerRootContext, ContextKeyExpr.or(EnterMultiRootWorkspaceSupportContext, WorkbenchStateContext.isEqualTo('workspace')))
});

MenuRegistry.appendMenuItem(MenuId.ExplorerContext, {
	group: '2_workspace',
	order: 30,
	command: {
		id: REMOVE_ROOT_FOLDER_COMMAND_ID,
		title: REMOVE_ROOT_FOLDER_LABEL
	},
	when: ContextKeyExpr.and(ExplorerRootContext, ExplorerFolderContext, ContextKeyExpr.and(WorkspaceFolderCountContext.notEqualsTo('0'), ContextKeyExpr.or(EnterMultiRootWorkspaceSupportContext, WorkbenchStateContext.isEqualTo('workspace'))))
});

MenuRegistry.appendMenuItem(MenuId.ExplorerContext, {
	group: '7_modification',
	order: 10,
	command: {
		id: RENAME_ID,
		title: TRIGGER_RENAME_LABEL,
		precondition: ExplorerResourceNotReadonlyContext
	},
	when: ExplorerRootContext.toNegated()
});

MenuRegistry.appendMenuItem(MenuId.ExplorerContext, {
	group: '7_modification',
	order: 20,
	command: {
		id: MOVE_FILE_TO_TRASH_ID,
		title: MOVE_FILE_TO_TRASH_LABEL,
		precondition: ExplorerResourceNotReadonlyContext
	},
	alt: {
		id: DELETE_FILE_ID,
		title: nls.localize('deleteFile', "Delete Permanently"),
		precondition: ExplorerResourceNotReadonlyContext
	},
	when: ContextKeyExpr.and(ExplorerRootContext.toNegated(), ExplorerResourceMoveableToTrash)
});

MenuRegistry.appendMenuItem(MenuId.ExplorerContext, {
	group: '7_modification',
	order: 20,
	command: {
		id: DELETE_FILE_ID,
		title: nls.localize('deleteFile', "Delete Permanently"),
		precondition: ExplorerResourceNotReadonlyContext
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
			ContextKeyExpr.and(ResourceContextKey.Scheme.notEqualsTo(Schemas.untitled), FoldersViewVisibleContext, SidebarFocusContext)
		),
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
