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
import { asFileResource } from 'vs/workbench/parts/files/common/files';
import { copyPathCommand, GlobalCopyPathAction, CopyPathAction } from 'vs/workbench/parts/files/electron-browser/electronFileActions';
import { RevealInOSAction } from 'vs/workbench/parts/files/browser/fileActions';
import { revealInOSCommand, openFolderPickerCommand, openWindowCommand, openFileInNewWindowCommand, revealInExplorerCommand } from 'vs/workbench/parts/files/browser/fileCommands';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { KeyMod, KeyChord, KeyCode } from 'vs/base/common/keyCodes';
import { CommandsRegistry, ICommandHandler } from 'vs/platform/commands/common/commands';
import { ContextKeyExpr } from 'vs/platform/contextkey/common/contextkey';

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
workbenchActionsRegistry.registerWorkbenchAction(new SyncActionDescriptor(GlobalCopyPathAction, GlobalCopyPathAction.ID, GlobalCopyPathAction.LABEL, { primary: KeyChord(KeyMod.CtrlCmd | KeyCode.KEY_K, KeyCode.KEY_P) }), 'Files: Copy Path of Active File', category);

// Contribute to File Viewers
const actionsRegistry = Registry.as<IActionBarRegistry>(ActionBarExtensions.Actionbar);
actionsRegistry.registerActionBarContributor(Scope.VIEWER, FileViewerActionContributor);

// Commands
CommandsRegistry.registerCommand('_files.openFolderPicker', openFolderPickerCommand);
CommandsRegistry.registerCommand('_files.windowOpen', openWindowCommand);
CommandsRegistry.registerCommand('workbench.action.files.openFileInNewWindow', openFileInNewWindowCommand);

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