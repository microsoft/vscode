/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import nls = require('vs/nls');
import { Registry } from 'vs/platform/platform';
import { IAction } from 'vs/base/common/actions';
import { Scope, IActionBarRegistry, Extensions as ActionBarExtensions, ActionBarContributor } from 'vs/workbench/browser/actionBarRegistry';
import { IWorkbenchActionRegistry, Extensions as ActionExtensions } from 'vs/workbench/common/actionRegistry';
import { SyncActionDescriptor, MenuId, MenuRegistry } from 'vs/platform/actions/common/actions';
import env = require('vs/base/common/platform');
import { asFileResource } from 'vs/workbench/parts/files/common/files';
import { IWorkbenchContributionsRegistry, Extensions as WorkbenchExtensions } from 'vs/workbench/common/contributions';
import { GlobalNewUntitledFileAction, SaveFileAsAction, revealInExplorerCommand } from 'vs/workbench/parts/files/browser/fileActions';
import { DirtyFilesTracker } from 'vs/workbench/parts/files/electron-browser/dirtyFilesTracker';
import { copyPathCommand, revealInOSCommand, openFolderPickerCommand, openWindowCommand, openFileInNewWindowCommand, OpenFileAction, ShowOpenedFileInNewWindow, GlobalRevealInOSAction, GlobalCopyPathAction, CopyPathAction, RevealInOSAction } from 'vs/workbench/parts/files/electron-browser/electronFileActions';
import { OpenFolderAction, OpenFileFolderAction } from 'vs/workbench/browser/actions/fileActions';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { KeyMod, KeyChord, KeyCode } from 'vs/base/common/keyCodes';
import { CommandsRegistry, ICommandHandler } from 'vs/platform/commands/common/commands';
import { ContextKeyExpr } from 'vs/platform/contextkey/common/contextkey';
import { isWindows } from 'vs/base/common/platform';

class FileViewerActionContributor extends ActionBarContributor {

	constructor( @IInstantiationService private instantiationService: IInstantiationService) {
		super();
	}

	public hasSecondaryActions(context: any): boolean {
		const element = context.element;

		// Contribute only on Files (File Explorer and Open Files Viewer)
		return !!asFileResource(element) || (element && element.getResource && element.getResource());
	}

	public getSecondaryActions(context: any): IAction[] {
		const actions: IAction[] = [];

		if (this.hasSecondaryActions(context)) {
			const fileResource = asFileResource(context.element);
			const resource = fileResource ? fileResource.resource : context.element.getResource();

			// Reveal file in OS native explorer
			actions.push(this.instantiationService.createInstance(RevealInOSAction, resource));

			// Copy Path
			actions.push(this.instantiationService.createInstance(CopyPathAction, resource));
		}

		return actions;
	}
}

// Contribute Actions
const category = nls.localize('filesCategory', "Files");

const workbenchActionsRegistry = Registry.as<IWorkbenchActionRegistry>(ActionExtensions.WorkbenchActions);
workbenchActionsRegistry.registerWorkbenchAction(new SyncActionDescriptor(SaveFileAsAction, SaveFileAsAction.ID, SaveFileAsAction.LABEL, { primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KEY_S }), 'Files: Save As...', category);
workbenchActionsRegistry.registerWorkbenchAction(new SyncActionDescriptor(GlobalNewUntitledFileAction, GlobalNewUntitledFileAction.ID, GlobalNewUntitledFileAction.LABEL, { primary: KeyMod.CtrlCmd | KeyCode.KEY_N }), 'Files: New Untitled File', category);

workbenchActionsRegistry.registerWorkbenchAction(new SyncActionDescriptor(GlobalCopyPathAction, GlobalCopyPathAction.ID, GlobalCopyPathAction.LABEL, { primary: KeyChord(KeyMod.CtrlCmd | KeyCode.KEY_K, KeyCode.KEY_P) }), 'Files: Copy Path of Active File', category);
workbenchActionsRegistry.registerWorkbenchAction(new SyncActionDescriptor(GlobalRevealInOSAction, GlobalRevealInOSAction.ID, GlobalRevealInOSAction.LABEL, { primary: KeyChord(KeyMod.CtrlCmd | KeyCode.KEY_K, KeyCode.KEY_R) }), 'Files: Reveal Active File', category);
workbenchActionsRegistry.registerWorkbenchAction(new SyncActionDescriptor(ShowOpenedFileInNewWindow, ShowOpenedFileInNewWindow.ID, ShowOpenedFileInNewWindow.LABEL, { primary: KeyChord(KeyMod.CtrlCmd | KeyCode.KEY_K, KeyCode.KEY_O) }), 'Files: Open Active File in New Window', category);

if (env.isMacintosh) {
	workbenchActionsRegistry.registerWorkbenchAction(new SyncActionDescriptor(OpenFileFolderAction, OpenFileFolderAction.ID, OpenFileFolderAction.LABEL, { primary: KeyMod.CtrlCmd | KeyCode.KEY_O }), 'Files: Open...', category);
} else {
	workbenchActionsRegistry.registerWorkbenchAction(new SyncActionDescriptor(OpenFileAction, OpenFileAction.ID, OpenFileAction.LABEL, { primary: KeyMod.CtrlCmd | KeyCode.KEY_O }), 'Files: Open File...', category);
	workbenchActionsRegistry.registerWorkbenchAction(new SyncActionDescriptor(OpenFolderAction, OpenFolderAction.ID, OpenFolderAction.LABEL, { primary: KeyChord(KeyMod.CtrlCmd | KeyCode.KEY_K, KeyMod.CtrlCmd | KeyCode.KEY_O) }), 'Files: Open Folder...', category);
}

// Contribute to File Viewers
const actionsRegistry = Registry.as<IActionBarRegistry>(ActionBarExtensions.Actionbar);
actionsRegistry.registerActionBarContributor(Scope.VIEWER, FileViewerActionContributor);

// Register Dirty Files Tracker
Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench).registerWorkbenchContribution(
	DirtyFilesTracker
);

// Commands
CommandsRegistry.registerCommand('_files.openFolderPicker', openFolderPickerCommand);
CommandsRegistry.registerCommand('_files.windowOpen', openWindowCommand);
CommandsRegistry.registerCommand('workbench.action.files.openFileInNewWindow', openFileInNewWindowCommand);

// Editor Title Context Menu
appendEditorTitleContextMenuItem('_workbench.action.files.revealInOS', RevealInOSAction.LABEL, revealInOSCommand);
appendEditorTitleContextMenuItem('_workbench.action.files.copyPath', CopyPathAction.LABEL, copyPathCommand);
appendEditorTitleContextMenuItem('_workbench.action.files.revealInExplorer', isWindows ? nls.localize('showInSideBar', "Show in Side Bar") : nls.localize('showInExplorer', "Show in Explorer"), revealInExplorerCommand);

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