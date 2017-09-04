/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import nls = require('vs/nls');
import { Registry } from 'vs/platform/registry/common/platform';
import { Action, IAction } from 'vs/base/common/actions';
import { isMacintosh } from 'vs/base/common/platform';
import { ActionItem, BaseActionItem, Separator } from 'vs/base/browser/ui/actionbar/actionbar';
import { Scope, IActionBarRegistry, Extensions as ActionBarExtensions, ActionBarContributor } from 'vs/workbench/browser/actions';
import { GlobalNewUntitledFileAction, SaveFileAsAction, OpenFileAction, ShowOpenedFileInNewWindow, CopyPathAction, GlobalCopyPathAction, RevealInOSAction, GlobalRevealInOSAction, pasteIntoFocusedFilesExplorerViewItem, FocusOpenEditorsView, FocusFilesExplorer, GlobalCompareResourcesAction, GlobalNewFileAction, GlobalNewFolderAction, RevertFileAction, SaveFilesAction, SaveAllAction, SaveFileAction, MoveFileToTrashAction, TriggerRenameFileAction, PasteFileAction, CopyFileAction, SelectResourceForCompareAction, CompareResourcesAction, NewFolderAction, NewFileAction, OpenToSideAction, ShowActiveFileInExplorer, CollapseExplorerView, RefreshExplorerView, CompareWithSavedAction } from 'vs/workbench/parts/files/browser/fileActions';
import { revertLocalChangesCommand, acceptLocalChangesCommand, CONFLICT_RESOLUTION_CONTEXT } from 'vs/workbench/parts/files/browser/saveErrorHandler';
import { SyncActionDescriptor, MenuId, MenuRegistry } from 'vs/platform/actions/common/actions';
import { IWorkbenchActionRegistry, Extensions as ActionExtensions } from 'vs/workbench/common/actionRegistry';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { FileStat, Model } from 'vs/workbench/parts/files/common/explorerModel';
import { KeyMod, KeyChord, KeyCode } from 'vs/base/common/keyCodes';
import { OpenFolderAction, OpenFileFolderAction, AddRootFolderAction, RemoveRootFolderAction } from 'vs/workbench/browser/actions/workspaceActions';
import { copyFocusedFilesExplorerViewItem, revealInOSFocusedFilesExplorerItem, openFocusedExplorerItemSideBySideCommand, copyPathOfFocusedExplorerItem, copyPathCommand, revealInExplorerCommand, revealInOSCommand, openFolderPickerCommand, openWindowCommand, openFileInNewWindowCommand, deleteFocusedFilesExplorerViewItemCommand, moveFocusedFilesExplorerViewItemToTrashCommand, renameFocusedFilesExplorerViewItemCommand } from 'vs/workbench/parts/files/browser/fileCommands';
import { CommandsRegistry, ICommandHandler } from 'vs/platform/commands/common/commands';
import { ContextKeyExpr } from 'vs/platform/contextkey/common/contextkey';
import { KeybindingsRegistry } from 'vs/platform/keybinding/common/keybindingsRegistry';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { explorerItemToFileResource, ExplorerFocusCondition, FilesExplorerFocusCondition } from 'vs/workbench/parts/files/common/files';

class FilesViewerActionContributor extends ActionBarContributor {

	constructor(
		@IInstantiationService private instantiationService: IInstantiationService,
		@IWorkspaceContextService private contextService: IWorkspaceContextService,
		@IKeybindingService private keybindingService: IKeybindingService,
		@IEnvironmentService private environmentService: IEnvironmentService
	) {
		super();
	}

	public hasSecondaryActions(context: any): boolean {
		const element = context.element;

		// Contribute only on Stat Objects (File Explorer)
		return element instanceof FileStat || element instanceof Model;
	}

	public getSecondaryActions(context: any): IAction[] {
		const stat = (<FileStat | Model>context.element);
		const tree = context.viewer;
		const actions: IAction[] = [];
		let separateOpen = false;
		if (stat instanceof Model) {
			return [this.instantiationService.createInstance(AddRootFolderAction, AddRootFolderAction.ID, AddRootFolderAction.LABEL)];
		}

		// Open side by side
		if (!stat.isDirectory) {
			actions.push(this.instantiationService.createInstance(OpenToSideAction, tree, stat.resource, false));
			separateOpen = true;
		}

		if (separateOpen) {
			actions.push(new Separator(null, 50));
		}

		// Directory Actions
		if (stat.isDirectory && stat.exists) {

			// New File
			actions.push(this.instantiationService.createInstance(NewFileAction, tree, <FileStat>stat));

			// New Folder
			actions.push(this.instantiationService.createInstance(NewFolderAction, tree, <FileStat>stat));

			actions.push(new Separator(null, 50));
		}

		// Compare Files (of same extension)
		else if (!stat.isDirectory) {

			// Run Compare
			const runCompareAction = this.instantiationService.createInstance(CompareResourcesAction, stat.resource, tree);
			if (runCompareAction._isEnabled()) {
				actions.push(runCompareAction);
			}

			// Select for Compare
			actions.push(this.instantiationService.createInstance(SelectResourceForCompareAction, stat.resource, tree));

			actions.push(new Separator(null, 100));
		}

		if (stat.isRoot && this.environmentService.appQuality !== 'stable') {
			let action: Action = this.instantiationService.createInstance(AddRootFolderAction, AddRootFolderAction.ID, AddRootFolderAction.LABEL);
			action.order = 52;
			actions.push(action);
			if (this.contextService.getWorkspace().roots.length > 1) {
				action = this.instantiationService.createInstance(RemoveRootFolderAction, stat.resource, RemoveRootFolderAction.ID, RemoveRootFolderAction.LABEL);
				action.order = 53;
				actions.push(action);
			}
			actions.push(new Separator(null, 54));
		}

		// Copy File/Folder
		if (!stat.isRoot) {
			actions.push(this.instantiationService.createInstance(CopyFileAction, tree, <FileStat>stat));
		}

		// Paste File/Folder
		if (stat.isDirectory) {
			actions.push(this.instantiationService.createInstance(PasteFileAction, tree, <FileStat>stat));
		}

		// Rename File/Folder
		if (!stat.isRoot) {
			actions.push(new Separator(null, 150));
			actions.push(this.instantiationService.createInstance(TriggerRenameFileAction, tree, <FileStat>stat));
			// Delete File/Folder
			actions.push(this.instantiationService.createInstance(MoveFileToTrashAction, tree, <FileStat>stat));
		}

		// Set Order
		let curOrder = 10;
		for (let i = 0; i < actions.length; i++) {
			const action = <any>actions[i];
			if (!action.order) {
				curOrder += 10;
				action.order = curOrder;
			} else {
				curOrder = action.order;
			}
		}

		return actions;
	}

	public getActionItem(context: any, action: Action): BaseActionItem {
		if (context && context.element instanceof FileStat) {

			// Any other item with keybinding
			const keybinding = this.keybindingService.lookupKeybinding(action.id);
			if (keybinding) {
				return new ActionItem(context, action, { label: true, keybinding: keybinding.getLabel() });
			}
		}

		return null;
	}
}

class ExplorerViewersActionContributor extends ActionBarContributor {

	constructor( @IInstantiationService private instantiationService: IInstantiationService) {
		super();
	}

	public hasSecondaryActions(context: any): boolean {
		const element = context.element;

		// Contribute only on Files (File Explorer and Open Files Viewer)
		return !!explorerItemToFileResource(element);
	}

	public getSecondaryActions(context: any): IAction[] {
		const actions: IAction[] = [];

		if (this.hasSecondaryActions(context)) {
			const fileResource = explorerItemToFileResource(context.element);
			const resource = fileResource.resource;

			// Reveal file in OS native explorer
			actions.push(this.instantiationService.createInstance(RevealInOSAction, resource));

			// Copy Path
			actions.push(this.instantiationService.createInstance(CopyPathAction, resource));
		}

		return actions;
	}
}

// Contribute to Viewers that show Files
const actionBarRegistry = Registry.as<IActionBarRegistry>(ActionBarExtensions.Actionbar);
actionBarRegistry.registerActionBarContributor(Scope.VIEWER, FilesViewerActionContributor);
actionBarRegistry.registerActionBarContributor(Scope.VIEWER, ExplorerViewersActionContributor);

// Contribute Global Actions
const category = nls.localize('filesCategory', "Files");

const registry = Registry.as<IWorkbenchActionRegistry>(ActionExtensions.WorkbenchActions);
registry.registerWorkbenchAction(new SyncActionDescriptor(GlobalCopyPathAction, GlobalCopyPathAction.ID, GlobalCopyPathAction.LABEL, { primary: KeyChord(KeyMod.CtrlCmd | KeyCode.KEY_K, KeyCode.KEY_P) }), 'Files: Copy Path of Active File', category);
registry.registerWorkbenchAction(new SyncActionDescriptor(SaveFileAction, SaveFileAction.ID, SaveFileAction.LABEL, { primary: KeyMod.CtrlCmd | KeyCode.KEY_S }), 'Files: Save', category);
registry.registerWorkbenchAction(new SyncActionDescriptor(SaveAllAction, SaveAllAction.ID, SaveAllAction.LABEL, { primary: void 0, mac: { primary: KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.KEY_S }, win: { primary: KeyChord(KeyMod.CtrlCmd | KeyCode.KEY_K, KeyCode.KEY_S) } }), 'Files: Save All', category);
registry.registerWorkbenchAction(new SyncActionDescriptor(SaveFilesAction, SaveFilesAction.ID, null /* only for programmatic trigger */), null);
registry.registerWorkbenchAction(new SyncActionDescriptor(RevertFileAction, RevertFileAction.ID, RevertFileAction.LABEL), 'Files: Revert File', category);
registry.registerWorkbenchAction(new SyncActionDescriptor(GlobalNewFileAction, GlobalNewFileAction.ID, GlobalNewFileAction.LABEL), 'Files: New File', category);
registry.registerWorkbenchAction(new SyncActionDescriptor(GlobalNewFolderAction, GlobalNewFolderAction.ID, GlobalNewFolderAction.LABEL), 'Files: New Folder', category);
registry.registerWorkbenchAction(new SyncActionDescriptor(GlobalCompareResourcesAction, GlobalCompareResourcesAction.ID, GlobalCompareResourcesAction.LABEL), 'Files: Compare Active File With...', category);
registry.registerWorkbenchAction(new SyncActionDescriptor(FocusOpenEditorsView, FocusOpenEditorsView.ID, FocusOpenEditorsView.LABEL, { primary: KeyChord(KeyMod.CtrlCmd | KeyCode.KEY_K, KeyCode.KEY_E) }), 'Files: Focus on Open Editors View', category);
registry.registerWorkbenchAction(new SyncActionDescriptor(FocusFilesExplorer, FocusFilesExplorer.ID, FocusFilesExplorer.LABEL), 'Files: Focus on Files Explorer', category);
registry.registerWorkbenchAction(new SyncActionDescriptor(ShowActiveFileInExplorer, ShowActiveFileInExplorer.ID, ShowActiveFileInExplorer.LABEL), 'Files: Reveal Active File in Side Bar', category);
registry.registerWorkbenchAction(new SyncActionDescriptor(CollapseExplorerView, CollapseExplorerView.ID, CollapseExplorerView.LABEL), 'Files: Collapse Folders in Explorer', category);
registry.registerWorkbenchAction(new SyncActionDescriptor(RefreshExplorerView, RefreshExplorerView.ID, RefreshExplorerView.LABEL), 'Files: Refresh Explorer', category);
registry.registerWorkbenchAction(new SyncActionDescriptor(SaveFileAsAction, SaveFileAsAction.ID, SaveFileAsAction.LABEL, { primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KEY_S }), 'Files: Save As...', category);
registry.registerWorkbenchAction(new SyncActionDescriptor(GlobalNewUntitledFileAction, GlobalNewUntitledFileAction.ID, GlobalNewUntitledFileAction.LABEL, { primary: KeyMod.CtrlCmd | KeyCode.KEY_N }), 'Files: New Untitled File', category);
registry.registerWorkbenchAction(new SyncActionDescriptor(GlobalRevealInOSAction, GlobalRevealInOSAction.ID, GlobalRevealInOSAction.LABEL, { primary: KeyChord(KeyMod.CtrlCmd | KeyCode.KEY_K, KeyCode.KEY_R) }), 'Files: Reveal Active File', category);
registry.registerWorkbenchAction(new SyncActionDescriptor(ShowOpenedFileInNewWindow, ShowOpenedFileInNewWindow.ID, ShowOpenedFileInNewWindow.LABEL, { primary: KeyChord(KeyMod.CtrlCmd | KeyCode.KEY_K, KeyCode.KEY_O) }), 'Files: Open Active File in New Window', category);
registry.registerWorkbenchAction(new SyncActionDescriptor(CompareWithSavedAction, CompareWithSavedAction.ID, CompareWithSavedAction.LABEL, { primary: KeyChord(KeyMod.CtrlCmd | KeyCode.KEY_K, KeyCode.KEY_D) }), 'Files: Compare Active File with Saved', category);

if (isMacintosh) {
	registry.registerWorkbenchAction(new SyncActionDescriptor(OpenFileFolderAction, OpenFileFolderAction.ID, OpenFileFolderAction.LABEL, { primary: KeyMod.CtrlCmd | KeyCode.KEY_O }), 'Files: Open...', category);
} else {
	registry.registerWorkbenchAction(new SyncActionDescriptor(OpenFileAction, OpenFileAction.ID, OpenFileAction.LABEL, { primary: KeyMod.CtrlCmd | KeyCode.KEY_O }), 'Files: Open File...', category);
	registry.registerWorkbenchAction(new SyncActionDescriptor(OpenFolderAction, OpenFolderAction.ID, OpenFolderAction.LABEL, { primary: KeyChord(KeyMod.CtrlCmd | KeyCode.KEY_K, KeyMod.CtrlCmd | KeyCode.KEY_O) }), 'Files: Open Folder...', category);
}

// Commands
CommandsRegistry.registerCommand('_files.pickFolderAndOpen', openFolderPickerCommand);
CommandsRegistry.registerCommand('_files.windowOpen', openWindowCommand);
CommandsRegistry.registerCommand('workbench.action.files.openFileInNewWindow', openFileInNewWindowCommand);

const explorerCommandsWeightBonus = 10; // give our commands a little bit more weight over other default list/tree commands

KeybindingsRegistry.registerCommandAndKeybindingRule({
	id: 'explorer.openToSide',
	weight: KeybindingsRegistry.WEIGHT.workbenchContrib(explorerCommandsWeightBonus),
	when: ExplorerFocusCondition,
	primary: KeyMod.CtrlCmd | KeyCode.Enter,
	mac: {
		primary: KeyMod.WinCtrl | KeyCode.Enter
	},
	handler: openFocusedExplorerItemSideBySideCommand
});

KeybindingsRegistry.registerCommandAndKeybindingRule({
	id: 'renameFile',
	weight: KeybindingsRegistry.WEIGHT.workbenchContrib(explorerCommandsWeightBonus),
	when: FilesExplorerFocusCondition,
	primary: KeyCode.F2,
	mac: {
		primary: KeyCode.Enter
	},
	handler: renameFocusedFilesExplorerViewItemCommand
});

KeybindingsRegistry.registerCommandAndKeybindingRule({
	id: 'moveFileToTrash',
	weight: KeybindingsRegistry.WEIGHT.workbenchContrib(explorerCommandsWeightBonus),
	when: FilesExplorerFocusCondition,
	primary: KeyCode.Delete,
	mac: {
		primary: KeyMod.CtrlCmd | KeyCode.Backspace
	},
	handler: moveFocusedFilesExplorerViewItemToTrashCommand
});

KeybindingsRegistry.registerCommandAndKeybindingRule({
	id: 'deleteFile',
	weight: KeybindingsRegistry.WEIGHT.workbenchContrib(explorerCommandsWeightBonus),
	when: FilesExplorerFocusCondition,
	primary: KeyMod.Shift | KeyCode.Delete,
	mac: {
		primary: KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.Backspace
	},
	handler: deleteFocusedFilesExplorerViewItemCommand
});

KeybindingsRegistry.registerCommandAndKeybindingRule({
	id: 'filesExplorer.copy',
	weight: KeybindingsRegistry.WEIGHT.workbenchContrib(explorerCommandsWeightBonus),
	when: FilesExplorerFocusCondition,
	primary: KeyMod.CtrlCmd | KeyCode.KEY_C,
	handler: copyFocusedFilesExplorerViewItem
});

KeybindingsRegistry.registerCommandAndKeybindingRule({
	id: 'filesExplorer.paste',
	weight: KeybindingsRegistry.WEIGHT.workbenchContrib(explorerCommandsWeightBonus),
	when: FilesExplorerFocusCondition,
	primary: KeyMod.CtrlCmd | KeyCode.KEY_V,
	handler: pasteIntoFocusedFilesExplorerViewItem
});

KeybindingsRegistry.registerCommandAndKeybindingRule({
	id: 'copyFilePath',
	weight: KeybindingsRegistry.WEIGHT.workbenchContrib(explorerCommandsWeightBonus),
	when: ExplorerFocusCondition,
	primary: KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.KEY_C,
	win: {
		primary: KeyMod.Shift | KeyMod.Alt | KeyCode.KEY_C
	},
	handler: copyPathOfFocusedExplorerItem
});

KeybindingsRegistry.registerCommandAndKeybindingRule({
	id: 'revealFileInOS',
	weight: KeybindingsRegistry.WEIGHT.workbenchContrib(explorerCommandsWeightBonus),
	when: ExplorerFocusCondition,
	primary: KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.KEY_R,
	win: {
		primary: KeyMod.Shift | KeyMod.Alt | KeyCode.KEY_R
	},
	handler: revealInOSFocusedFilesExplorerItem
});

// Editor Title Context Menu
appendEditorTitleContextMenuItem('_workbench.action.files.revealInOS', RevealInOSAction.LABEL, revealInOSCommand);
appendEditorTitleContextMenuItem('_workbench.action.files.copyPath', CopyPathAction.LABEL, copyPathCommand);
appendEditorTitleContextMenuItem('_workbench.action.files.revealInExplorer', nls.localize('revealInSideBar', "Reveal in Side Bar"), revealInExplorerCommand);

function appendEditorTitleContextMenuItem(id: string, title: string, command: ICommandHandler): void {

	// Command
	CommandsRegistry.registerCommand(id, command);

	// Menu
	MenuRegistry.appendMenuItem(MenuId.EditorTitleContext, {
		command: { id, title },
		when: ContextKeyExpr.equals('resourceScheme', 'file'),
		group: '2_files'
	});
}

// Editor Title Menu for Conflict Resolution
appendSaveConflictEditorTitleAction('workbench.files.action.acceptLocalChanges', nls.localize('acceptLocalChanges', "Use your changes and overwrite disk contents"), 'save-conflict-action-accept-changes', -10, acceptLocalChangesCommand);
appendSaveConflictEditorTitleAction('workbench.files.action.revertLocalChanges', nls.localize('revertLocalChanges', "Discard your changes and revert to content on disk"), 'save-conflict-action-revert-changes', -9, revertLocalChangesCommand);

function appendSaveConflictEditorTitleAction(id: string, title: string, iconClass: string, order: number, command: ICommandHandler): void {

	// Command
	CommandsRegistry.registerCommand(id, command);

	// Action
	MenuRegistry.appendMenuItem(MenuId.EditorTitle, {
		command: { id, title, iconClass },
		when: ContextKeyExpr.equals(CONFLICT_RESOLUTION_CONTEXT, true),
		group: 'navigation',
		order
	});
}