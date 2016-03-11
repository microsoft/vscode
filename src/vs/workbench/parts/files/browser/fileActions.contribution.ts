/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import nls = require('vs/nls');
import {Registry} from 'vs/platform/platform';
import {Action, IAction} from 'vs/base/common/actions';
import {ActionItem, BaseActionItem, Separator} from 'vs/base/browser/ui/actionbar/actionbar';
import {Scope, IActionBarRegistry, Extensions as ActionBarExtensions, ActionBarContributor} from 'vs/workbench/browser/actionBarRegistry';
import {IEditorInputActionContext, IEditorInputAction, EditorInputActionContributor} from 'vs/workbench/browser/parts/editor/baseEditor';
import {AddToWorkingFiles, FocusWorkingFiles, FocusFilesExplorer, OpenPreviousWorkingFile, OpenNextWorkingFile, CloseAllFilesAction, CloseFileAction, CloseOtherFilesAction, GlobalCompareResourcesAction, GlobalNewFolderAction, RevertFileAction, SaveFilesAction, SaveAllAction, SaveFileAction, keybindingForAction, MoveFileToTrashAction, TriggerRenameFileAction, PasteFileAction, CopyFileAction, SelectResourceForCompareAction, CompareResourcesAction, NewFolderAction, NewFileAction, OpenToSideAction} from 'vs/workbench/parts/files/browser/fileActions';
import {RevertLocalChangesAction, AcceptLocalChangesAction, ConflictResolutionDiffEditorInput} from 'vs/workbench/parts/files/browser/saveErrorHandler';
import {SyncActionDescriptor} from 'vs/platform/actions/common/actions';
import {IWorkbenchActionRegistry, Extensions as ActionExtensions} from 'vs/workbench/common/actionRegistry';
import {IInstantiationService} from 'vs/platform/instantiation/common/instantiation';
import {IWorkspaceContextService} from 'vs/platform/workspace/common/workspace';
import {IKeybindingService} from 'vs/platform/keybinding/common/keybindingService';
import {FileStat} from 'vs/workbench/parts/files/common/explorerViewModel';
import {KeyMod, KeyCode} from 'vs/base/common/keyCodes';

class FilesViewerActionContributor extends ActionBarContributor {

	constructor(
		@IInstantiationService private instantiationService: IInstantiationService,
		@IWorkspaceContextService private contextService: IWorkspaceContextService,
		@IKeybindingService private keybindingService: IKeybindingService
	) {
		super();
	}

	public hasSecondaryActions(context: any): boolean {
		let element = context.element;

		// Contribute only on Stat Objects (File Explorer)
		return element instanceof FileStat;
	}

	public getSecondaryActions(context: any): IAction[] {
		let stat = (<FileStat>context.element);
		let tree = context.viewer;
		let actions: IAction[] = [];
		let separateOpen = false;

		// Open side by side
		if (!stat.isDirectory) {
			actions.push(this.instantiationService.createInstance(OpenToSideAction, tree, stat.resource, false));
			separateOpen = true;
		}

		if (separateOpen) {
			actions.push(new Separator(null, 50));
		}

		// Directory Actions
		if (stat.isDirectory) {

			// New File
			actions.push(this.instantiationService.createInstance(NewFileAction, tree, <FileStat>stat));

			// New Folder
			actions.push(this.instantiationService.createInstance(NewFolderAction, tree, <FileStat>stat));

			actions.push(new Separator(null, 50));
		}

		// Compare Files (of same extension)
		else if (!stat.isDirectory) {

			// Run Compare
			let runCompareAction = this.instantiationService.createInstance(CompareResourcesAction, stat.resource, tree);
			if (runCompareAction._isEnabled()) {
				actions.push(runCompareAction);
			}

			// Select for Compare
			actions.push(this.instantiationService.createInstance(SelectResourceForCompareAction, stat.resource, tree));

			actions.push(new Separator(null, 100));
		}

		let workspace = this.contextService.getWorkspace();
		let isRoot = workspace && stat.resource.toString() === workspace.resource.toString();

		// Copy File/Folder
		if (!isRoot) {
			actions.push(this.instantiationService.createInstance(CopyFileAction, tree, <FileStat>stat));
		}

		// Paste File/Folder
		if (stat.isDirectory) {
			actions.push(this.instantiationService.createInstance(PasteFileAction, tree, <FileStat>stat));
		}

		// Rename File/Folder
		if (!isRoot) {
			actions.push(new Separator(null, 150));
			actions.push(this.instantiationService.createInstance(TriggerRenameFileAction, tree, <FileStat>stat));
		}

		// Delete File/Folder
		if (!isRoot) {
			actions.push(this.instantiationService.createInstance(MoveFileToTrashAction, tree, <FileStat>stat));
		}

		// Set Order
		let curOrder = 10;
		for (let i = 0; i < actions.length; i++) {
			let action = <any>actions[i];
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
			let keybinding = keybindingForAction(action.id);
			if (keybinding) {
				return new ActionItem(context, action, { label: true, keybinding: this.keybindingService.getLabelFor(keybinding) });
			}
		}

		return null;
	}
}

class ConflictResolutionActionContributor extends EditorInputActionContributor {

	constructor( @IInstantiationService private instantiationService: IInstantiationService) {
		super();
	}

	public hasActionsForEditorInput(context: IEditorInputActionContext): boolean {
		return (context.input instanceof ConflictResolutionDiffEditorInput);
	}

	public getActionsForEditorInput(context: IEditorInputActionContext): IEditorInputAction[] {
		return [
			this.instantiationService.createInstance(AcceptLocalChangesAction),
			this.instantiationService.createInstance(RevertLocalChangesAction)
		];
	}
}

// Contribute to Viewers that show Files
let actionBarRegistry = <IActionBarRegistry>Registry.as(ActionBarExtensions.Actionbar);
actionBarRegistry.registerActionBarContributor(Scope.VIEWER, FilesViewerActionContributor);

// Contribute to Conflict Editor Inputs
actionBarRegistry.registerActionBarContributor(Scope.EDITOR, ConflictResolutionActionContributor);

// Contribute Global Actions
const category = nls.localize('filesCategory', "Files");

let registry = <IWorkbenchActionRegistry>Registry.as(ActionExtensions.WorkbenchActions);
registry.registerWorkbenchAction(new SyncActionDescriptor(SaveFileAction, SaveFileAction.ID, SaveFileAction.LABEL, { primary: KeyMod.CtrlCmd | KeyCode.KEY_S }), category);
registry.registerWorkbenchAction(new SyncActionDescriptor(SaveAllAction, SaveAllAction.ID, SaveAllAction.LABEL), category);
registry.registerWorkbenchAction(new SyncActionDescriptor(SaveFilesAction, SaveFilesAction.ID, null /* only for programmatic trigger */));
registry.registerWorkbenchAction(new SyncActionDescriptor(RevertFileAction, RevertFileAction.ID, RevertFileAction.LABEL), category);
registry.registerWorkbenchAction(new SyncActionDescriptor(GlobalNewFolderAction, GlobalNewFolderAction.ID, GlobalNewFolderAction.LABEL), category);
registry.registerWorkbenchAction(new SyncActionDescriptor(GlobalCompareResourcesAction, GlobalCompareResourcesAction.ID, GlobalCompareResourcesAction.LABEL), category);
registry.registerWorkbenchAction(new SyncActionDescriptor(CloseFileAction, CloseFileAction.ID, CloseFileAction.LABEL, { primary: KeyMod.chord(KeyMod.CtrlCmd | KeyCode.KEY_K, KeyCode.KEY_W) }), category);
registry.registerWorkbenchAction(new SyncActionDescriptor(CloseOtherFilesAction, CloseOtherFilesAction.ID, CloseOtherFilesAction.LABEL, { primary: KeyMod.chord(KeyMod.CtrlCmd | KeyCode.KEY_K, KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KEY_W) }), category);
registry.registerWorkbenchAction(new SyncActionDescriptor(CloseAllFilesAction, CloseAllFilesAction.ID, CloseAllFilesAction.LABEL, { primary: KeyMod.chord(KeyMod.CtrlCmd | KeyCode.KEY_K, KeyMod.CtrlCmd | KeyCode.KEY_W) }), category);
registry.registerWorkbenchAction(new SyncActionDescriptor(OpenNextWorkingFile, OpenNextWorkingFile.ID, OpenNextWorkingFile.LABEL, { primary: KeyMod.chord(KeyMod.CtrlCmd | KeyCode.KEY_K, KeyCode.DownArrow) }), category);
registry.registerWorkbenchAction(new SyncActionDescriptor(OpenPreviousWorkingFile, OpenPreviousWorkingFile.ID, OpenPreviousWorkingFile.LABEL, { primary: KeyMod.chord(KeyMod.CtrlCmd | KeyCode.KEY_K, KeyCode.UpArrow) }), category);
registry.registerWorkbenchAction(new SyncActionDescriptor(AddToWorkingFiles, AddToWorkingFiles.ID, AddToWorkingFiles.LABEL, { primary: KeyMod.chord(KeyMod.CtrlCmd | KeyCode.KEY_K, KeyCode.Enter) }), category);
registry.registerWorkbenchAction(new SyncActionDescriptor(FocusWorkingFiles, FocusWorkingFiles.ID, FocusWorkingFiles.LABEL, { primary: KeyMod.chord(KeyMod.CtrlCmd | KeyCode.KEY_K, KeyCode.KEY_E) }), category);
registry.registerWorkbenchAction(new SyncActionDescriptor(FocusFilesExplorer, FocusFilesExplorer.ID, FocusFilesExplorer.LABEL), category);