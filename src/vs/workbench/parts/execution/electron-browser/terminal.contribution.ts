/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import nls = require('vs/nls');
import { TPromise } from 'vs/base/common/winjs.base';
import { Registry } from 'vs/platform/platform';
import baseplatform = require('vs/base/common/platform');
import { IAction, Action } from 'vs/base/common/actions';
import { IWorkbenchActionRegistry, Extensions as ActionExtensions } from 'vs/workbench/common/actionRegistry';
import paths = require('vs/base/common/paths');
import { Scope, IActionBarRegistry, Extensions as ActionBarExtensions, ActionBarContributor } from 'vs/workbench/browser/actionBarRegistry';
import uri from 'vs/base/common/uri';
import { asFileResource } from 'vs/workbench/parts/files/common/files';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { ITerminalService } from 'vs/workbench/parts/execution/common/execution';
import { SyncActionDescriptor } from 'vs/platform/actions/common/actions';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IWorkbenchEditorService } from 'vs/workbench/services/editor/common/editorService';
import { toResource } from 'vs/workbench/common/editor';
import { KeyMod, KeyCode } from 'vs/base/common/keyCodes';
import { Extensions, IConfigurationRegistry } from 'vs/platform/configuration/common/configurationRegistry';
import { KEYBINDING_CONTEXT_TERMINAL_NOT_FOCUSED } from 'vs/workbench/parts/terminal/common/terminal';
import { DEFAULT_TERMINAL_WINDOWS, DEFAULT_TERMINAL_LINUX_READY, DEFAULT_TERMINAL_OSX } from 'vs/workbench/parts/execution/electron-browser/terminal';

DEFAULT_TERMINAL_LINUX_READY.then(defaultTerminalLinux => {
	let configurationRegistry = <IConfigurationRegistry>Registry.as(Extensions.Configuration);
	configurationRegistry.registerConfiguration({
		'id': 'externalTerminal',
		'order': 100,
		'title': nls.localize('terminalConfigurationTitle', "External Terminal"),
		'type': 'object',
		'properties': {
			'terminal.external.windowsExec': {
				'type': 'string',
				'description': nls.localize('terminal.external.windowsExec', "Customizes which terminal to run on Windows."),
				'default': DEFAULT_TERMINAL_WINDOWS,
				'isExecutable': true
			},
			'terminal.external.osxExec': {
				'type': 'string',
				'description': nls.localize('terminal.external.osxExec', "Customizes which terminal application to run on OS X."),
				'default': DEFAULT_TERMINAL_OSX,
				'isExecutable': true
			},
			'terminal.external.linuxExec': {
				'type': 'string',
				'description': nls.localize('terminal.external.linuxExec', "Customizes which terminal to run on Linux."),
				'default': defaultTerminalLinux,
				'isExecutable': true
			}
		}
	});
});

export class OpenConsoleAction extends Action {

	public static ID = 'workbench.action.terminal.openNativeConsole';
	public static Label = baseplatform.isWindows ? nls.localize('globalConsoleActionWin', "Open New Command Prompt") :
		nls.localize('globalConsoleActionMacLinux', "Open New Terminal");
	public static ScopedLabel = baseplatform.isWindows ? nls.localize('scopedConsoleActionWin', "Open in Command Prompt") :
		nls.localize('scopedConsoleActionMacLinux', "Open in Terminal");

	private resource: uri;

	constructor(
		id: string,
		label: string,
		@ITerminalService private terminalService: ITerminalService,
		@IWorkbenchEditorService private editorService: IWorkbenchEditorService,
		@IWorkspaceContextService private contextService: IWorkspaceContextService
	) {
		super(id, label);

		this.order = 49; // Allow other actions to position before or after
	}

	public setResource(resource: uri): void {
		this.resource = resource;
		this.enabled = !paths.isUNC(this.resource.fsPath);
	}

	public run(event?: any): TPromise<any> {
		let pathToOpen: string;

		// Try workspace path first
		let workspace = this.contextService.getWorkspace();
		pathToOpen = this.resource ? this.resource.fsPath : (workspace && workspace.resource.fsPath);

		// Otherwise check if we have an active file open
		if (!pathToOpen) {
			const file = toResource(this.editorService.getActiveEditorInput(), { supportSideBySide: true, filter: 'file' });
			if (file) {
				pathToOpen = paths.dirname(file.fsPath); // take parent folder of file
			}
		}

		this.terminalService.openTerminal(pathToOpen);

		return TPromise.as(null);
	}
}

class FileViewerActionContributor extends ActionBarContributor {

	constructor( @IInstantiationService private instantiationService: IInstantiationService) {
		super();
	}

	public hasSecondaryActions(context: any): boolean {
		const element = context.element;
		return !!asFileResource(element) || (element && element.getResource && element.getResource());
	}

	public getSecondaryActions(context: any): IAction[] {
		let fileResource = asFileResource(context.element);
		let resource = fileResource ? fileResource.resource : context.element.getResource();
		// If there is no file resource, it is an open editor and not a directory.
		if (!fileResource || !fileResource.isDirectory) {
			resource = uri.file(paths.dirname(resource.fsPath));
		}

		let action = this.instantiationService.createInstance(OpenConsoleAction, OpenConsoleAction.ID, OpenConsoleAction.ScopedLabel);
		action.setResource(resource);

		return [action];
	}
}

const actionBarRegistry = <IActionBarRegistry>Registry.as(ActionBarExtensions.Actionbar);
actionBarRegistry.registerActionBarContributor(Scope.VIEWER, FileViewerActionContributor);

// Register Global Action to Open Console
(<IWorkbenchActionRegistry>Registry.as(ActionExtensions.WorkbenchActions)).registerWorkbenchAction(
	new SyncActionDescriptor(
		OpenConsoleAction,
		OpenConsoleAction.ID,
		OpenConsoleAction.Label,
		{ primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KEY_C },
		KEYBINDING_CONTEXT_TERMINAL_NOT_FOCUSED
	),
	'Open New Command Prompt'
);
