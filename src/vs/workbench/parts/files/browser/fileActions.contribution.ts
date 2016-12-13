/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import nls = require('vs/nls');
import { Registry } from 'vs/platform/platform';
import { Action, IAction } from 'vs/base/common/actions';
import { ActionItem, BaseActionItem, Separator } from 'vs/base/browser/ui/actionbar/actionbar';
import { Scope, IActionBarRegistry, Extensions as ActionBarExtensions, ActionBarContributor } from 'vs/workbench/browser/actionBarRegistry';
import { IEditorInputActionContext, IEditorInputAction, EditorInputActionContributor } from 'vs/workbench/browser/parts/editor/baseEditor';
import { FocusOpenEditorsView, FocusFilesExplorer, GlobalCompareResourcesAction, GlobalNewFileAction, GlobalNewFolderAction, RevertFileAction, SaveFilesAction, SaveAllAction, SaveFileAction, keybindingForAction, MoveFileToTrashAction, TriggerRenameFileAction, PasteFileAction, CopyFileAction, SelectResourceForCompareAction, CompareResourcesAction, NewFolderAction, NewFileAction, OpenToSideAction, ShowActiveFileInExplorer, CollapseExplorerView, RefreshExplorerView } from 'vs/workbench/parts/files/browser/fileActions';
import { RevertLocalChangesAction, AcceptLocalChangesAction, ConflictResolutionDiffEditorInput } from 'vs/workbench/parts/files/browser/saveErrorHandler';
import { SyncActionDescriptor } from 'vs/platform/actions/common/actions';
import { IWorkbenchActionRegistry, Extensions as ActionExtensions } from 'vs/workbench/common/actionRegistry';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { FileStat } from 'vs/workbench/parts/files/common/explorerViewModel';
import { KeyMod, KeyChord, KeyCode } from 'vs/base/common/keyCodes';

class FilesViewerActionContributor extends ActionBarContributor {

	constructor(
		@IInstantiationService private instantiationService: IInstantiationService,
		@IWorkspaceContextService private contextService: IWorkspaceContextService,
		@IKeybindingService private keybindingService: IKeybindingService
	) {
		super();
	}

	public hasSecondaryActions(context: any): boolean {
		const element = context.element;

		// Contribute only on Stat Objects (File Explorer)
		return element instanceof FileStat;
	}

	public getSecondaryActions(context: any): IAction[] {
		const stat = (<FileStat>context.element);
		const tree = context.viewer;
		const actions: IAction[] = [];
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
			const runCompareAction = this.instantiationService.createInstance(CompareResourcesAction, stat.resource, tree);
			if (runCompareAction._isEnabled()) {
				actions.push(runCompareAction);
			}

			// Select for Compare
			actions.push(this.instantiationService.createInstance(SelectResourceForCompareAction, stat.resource, tree));

			actions.push(new Separator(null, 100));
		}

		const workspace = this.contextService.getWorkspace();
		const isRoot = workspace && stat.resource.toString() === workspace.resource.toString();

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
			const keybinding = keybindingForAction(action.id, this.keybindingService);
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
const actionBarRegistry = Registry.as<IActionBarRegistry>(ActionBarExtensions.Actionbar);
actionBarRegistry.registerActionBarContributor(Scope.VIEWER, FilesViewerActionContributor);

// Contribute to Conflict Editor Inputs
actionBarRegistry.registerActionBarContributor(Scope.EDITOR, ConflictResolutionActionContributor);

// Contribute Global Actions
const category = nls.localize('filesCategory', "Files");

const registry = Registry.as<IWorkbenchActionRegistry>(ActionExtensions.WorkbenchActions);
registry.registerWorkbenchAction(new SyncActionDescriptor(SaveFileAction, SaveFileAction.ID, SaveFileAction.LABEL, { primary: KeyMod.CtrlCmd | KeyCode.KEY_S }), 'Files: Save', category);
registry.registerWorkbenchAction(new SyncActionDescriptor(SaveAllAction, SaveAllAction.ID, SaveAllAction.LABEL, { primary: KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.KEY_S, win: { primary: KeyChord(KeyMod.CtrlCmd | KeyCode.KEY_K, KeyCode.KEY_S) } }), 'Files: Save All', category);
registry.registerWorkbenchAction(new SyncActionDescriptor(SaveFilesAction, SaveFilesAction.ID, null /* only for programmatic trigger */), null);
registry.registerWorkbenchAction(new SyncActionDescriptor(RevertFileAction, RevertFileAction.ID, RevertFileAction.LABEL), 'Files: Revert File', category);
registry.registerWorkbenchAction(new SyncActionDescriptor(GlobalNewFileAction, GlobalNewFileAction.ID, GlobalNewFileAction.LABEL), 'Files: New File', category);
registry.registerWorkbenchAction(new SyncActionDescriptor(GlobalNewFolderAction, GlobalNewFolderAction.ID, GlobalNewFolderAction.LABEL), 'Files: New Folder', category);
registry.registerWorkbenchAction(new SyncActionDescriptor(GlobalCompareResourcesAction, GlobalCompareResourcesAction.ID, GlobalCompareResourcesAction.LABEL), 'Files: Compare Active File With...', category);
registry.registerWorkbenchAction(new SyncActionDescriptor(FocusOpenEditorsView, FocusOpenEditorsView.ID, FocusOpenEditorsView.LABEL, { primary: KeyChord(KeyMod.CtrlCmd | KeyCode.KEY_K, KeyCode.KEY_E) }), 'Files: Focus on Open Editors View', category);
registry.registerWorkbenchAction(new SyncActionDescriptor(FocusFilesExplorer, FocusFilesExplorer.ID, FocusFilesExplorer.LABEL), 'Files: Focus on Files Explorer', category);
registry.registerWorkbenchAction(new SyncActionDescriptor(ShowActiveFileInExplorer, ShowActiveFileInExplorer.ID, ShowActiveFileInExplorer.LABEL), 'Files: Show Active File in Explorer', category);
registry.registerWorkbenchAction(new SyncActionDescriptor(CollapseExplorerView, CollapseExplorerView.ID, CollapseExplorerView.LABEL), 'Files: Collapse Folders in Explorer', category);
registry.registerWorkbenchAction(new SyncActionDescriptor(RefreshExplorerView, RefreshExplorerView.ID, RefreshExplorerView.LABEL), 'Files: Refresh Explorer', category);