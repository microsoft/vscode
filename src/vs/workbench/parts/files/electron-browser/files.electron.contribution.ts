/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import nls = require('vs/nls');
import {Registry} from 'vs/platform/platform';
import {IAction} from 'vs/base/common/actions';
import {Scope, IActionBarRegistry, Extensions as ActionBarExtensions, ActionBarContributor} from 'vs/workbench/browser/actionBarRegistry';
import {IWorkbenchActionRegistry, Extensions as ActionExtensions} from 'vs/workbench/common/actionRegistry';
import {SyncActionDescriptor} from 'vs/platform/actions/common/actions';
import env = require('vs/base/common/platform');
import {ITextFileService, asFileResource} from 'vs/workbench/parts/files/common/files';
import {IWorkbenchContributionsRegistry, Extensions as WorkbenchExtensions} from 'vs/workbench/common/contributions';
import {GlobalNewUntitledFileAction, SaveFileAsAction} from 'vs/workbench/parts/files/browser/fileActions';
import {FileTracker} from 'vs/workbench/parts/files/electron-browser/electronFileTracker';
import {TextFileService} from 'vs/workbench/parts/files/electron-browser/textFileServices';
import {OpenFolderAction, OPEN_FOLDER_ID, OPEN_FOLDER_LABEL, OpenFileAction, OPEN_FILE_ID, OPEN_FILE_LABEL, OpenFileFolderAction, OPEN_FILE_FOLDER_ID, OPEN_FILE_FOLDER_LABEL, ShowOpenedFileInNewWindow, GlobalRevealInOSAction, GlobalCopyPathAction, CopyPathAction, RevealInOSAction} from 'vs/workbench/parts/files/electron-browser/electronFileActions';
import {IInstantiationService} from 'vs/platform/instantiation/common/instantiation';
import {registerSingleton} from 'vs/platform/instantiation/common/extensions';
import {KeyMod, KeyCode} from 'vs/base/common/keyCodes';

class FileViewerActionContributor extends ActionBarContributor {

	constructor( @IInstantiationService private instantiationService: IInstantiationService) {
		super();
	}

	public hasSecondaryActions(context: any): boolean {
		let element = context.element;

		// Contribute only on Files (File Explorer and Open Files Viewer)
		return !!asFileResource(element) || (element && element.getResource());
	}

	public getSecondaryActions(context: any): IAction[] {
		let actions: IAction[] = [];

		if (this.hasSecondaryActions(context)) {
			const fileResource = asFileResource(context.element);
			let resource = fileResource ? fileResource.resource : context.element.getResource();

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

let workbenchActionsRegistry = <IWorkbenchActionRegistry>Registry.as(ActionExtensions.WorkbenchActions);
workbenchActionsRegistry.registerWorkbenchAction(new SyncActionDescriptor(SaveFileAsAction, SaveFileAsAction.ID, SaveFileAsAction.LABEL, { primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KEY_S }), 'Files: Save As...', category);
workbenchActionsRegistry.registerWorkbenchAction(new SyncActionDescriptor(GlobalNewUntitledFileAction, GlobalNewUntitledFileAction.ID, GlobalNewUntitledFileAction.LABEL, { primary: KeyMod.CtrlCmd | KeyCode.KEY_N }), 'Files: New Untitled File', category);

workbenchActionsRegistry.registerWorkbenchAction(new SyncActionDescriptor(GlobalCopyPathAction, GlobalCopyPathAction.ID, GlobalCopyPathAction.LABEL, { primary: KeyMod.chord(KeyMod.CtrlCmd | KeyCode.KEY_K, KeyCode.KEY_P) }), 'Files: Copy Path of Active File', category);
workbenchActionsRegistry.registerWorkbenchAction(new SyncActionDescriptor(GlobalRevealInOSAction, GlobalRevealInOSAction.ID, GlobalRevealInOSAction.LABEL, { primary: KeyMod.chord(KeyMod.CtrlCmd | KeyCode.KEY_K, KeyCode.KEY_R) }), 'Files: Reveal Active File', category);
workbenchActionsRegistry.registerWorkbenchAction(new SyncActionDescriptor(ShowOpenedFileInNewWindow, ShowOpenedFileInNewWindow.ID, ShowOpenedFileInNewWindow.LABEL, { primary: KeyMod.chord(KeyMod.CtrlCmd | KeyCode.KEY_K, KeyCode.KEY_O) }), 'Files: Open Active File in New Window', category);

if (env.isMacintosh) {
	workbenchActionsRegistry.registerWorkbenchAction(new SyncActionDescriptor(OpenFileFolderAction, OPEN_FILE_FOLDER_ID, OPEN_FILE_FOLDER_LABEL, { primary: KeyMod.CtrlCmd | KeyCode.KEY_O }), 'Files: Open...', category);
} else {
	workbenchActionsRegistry.registerWorkbenchAction(new SyncActionDescriptor(OpenFileAction, OPEN_FILE_ID, OPEN_FILE_LABEL, { primary: KeyMod.CtrlCmd | KeyCode.KEY_O }), 'Files: Open File...', category);
	workbenchActionsRegistry.registerWorkbenchAction(new SyncActionDescriptor(OpenFolderAction, OPEN_FOLDER_ID, OPEN_FOLDER_LABEL), 'Files: Open Folder...', category);
}

// Contribute to File Viewers
let actionsRegistry = <IActionBarRegistry>Registry.as(ActionBarExtensions.Actionbar);
actionsRegistry.registerActionBarContributor(Scope.VIEWER, FileViewerActionContributor);

// Register File Workbench Extension
(<IWorkbenchContributionsRegistry>Registry.as(WorkbenchExtensions.Workbench)).registerWorkbenchContribution(
	FileTracker
);

// Register Service
registerSingleton(ITextFileService, TextFileService);