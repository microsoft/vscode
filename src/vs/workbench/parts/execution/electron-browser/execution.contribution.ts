/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as nls from 'vs/nls';
import * as env from 'vs/base/common/platform';
import { TPromise } from 'vs/base/common/winjs.base';
import { Registry } from 'vs/platform/registry/common/platform';
import { IAction, Action } from 'vs/base/common/actions';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { IWorkbenchActionRegistry, Extensions as ActionExtensions } from 'vs/workbench/common/actionRegistry';
import paths = require('vs/base/common/paths');
import { Scope, IActionBarRegistry, Extensions as ActionBarExtensions, ActionBarContributor } from 'vs/workbench/browser/actions';
import uri from 'vs/base/common/uri';
import { explorerItemToFileResource } from 'vs/workbench/parts/files/common/files';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { ITerminalService } from 'vs/workbench/parts/execution/common/execution';
import { SyncActionDescriptor } from 'vs/platform/actions/common/actions';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IWorkbenchEditorService } from 'vs/workbench/services/editor/common/editorService';
import { toResource } from 'vs/workbench/common/editor';
import { KeyMod, KeyCode } from 'vs/base/common/keyCodes';
import { Extensions, IConfigurationRegistry } from 'vs/platform/configuration/common/configurationRegistry';
import { ITerminalService as IIntegratedTerminalService, KEYBINDING_CONTEXT_TERMINAL_NOT_FOCUSED } from 'vs/workbench/parts/terminal/common/terminal';
import { DEFAULT_TERMINAL_WINDOWS, DEFAULT_TERMINAL_LINUX_READY, DEFAULT_TERMINAL_OSX, ITerminalConfiguration } from 'vs/workbench/parts/execution/electron-browser/terminal';
import { WinTerminalService, MacTerminalService, LinuxTerminalService } from 'vs/workbench/parts/execution/electron-browser/terminalService';
import { IHistoryService } from 'vs/workbench/services/history/common/history';

if (env.isWindows) {
	registerSingleton(ITerminalService, WinTerminalService);
} else if (env.isMacintosh) {
	registerSingleton(ITerminalService, MacTerminalService);
} else if (env.isLinux) {
	registerSingleton(ITerminalService, LinuxTerminalService);
}

DEFAULT_TERMINAL_LINUX_READY.then(defaultTerminalLinux => {
	let configurationRegistry = <IConfigurationRegistry>Registry.as(Extensions.Configuration);
	configurationRegistry.registerConfiguration({
		'id': 'externalTerminal',
		'order': 100,
		'title': nls.localize('terminalConfigurationTitle', "External Terminal"),
		'type': 'object',
		'properties': {
			'terminal.explorerKind': {
				'type': 'string',
				'enum': [
					'integrated',
					'external'
				],
				'description': nls.localize('explorer.openInTerminalKind', "Customizes what kind of terminal to launch."),
				'default': 'integrated',
				'isExecutable': false
			},
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


export abstract class AbstractOpenInTerminalAction extends Action {
	private resource: uri;

	constructor(
		id: string,
		label: string,
		@IWorkbenchEditorService protected editorService: IWorkbenchEditorService,
		@IWorkspaceContextService protected contextService: IWorkspaceContextService,
		@IHistoryService protected historyService: IHistoryService
	) {
		super(id, label);

		this.order = 49; // Allow other actions to position before or after
	}

	public setResource(resource: uri): void {
		this.resource = resource;
		this.enabled = !paths.isUNC(this.resource.fsPath);
	}

	public getPathToOpen(): string {
		let pathToOpen: string;

		// Try workspace path first
		const root = this.historyService.getLastActiveWorkspaceRoot();
		pathToOpen = this.resource ? this.resource.fsPath : (root && root.fsPath);

		// Otherwise check if we have an active file open
		if (!pathToOpen) {
			const file = toResource(this.editorService.getActiveEditorInput(), { supportSideBySide: true, filter: 'file' });
			if (file) {
				pathToOpen = paths.dirname(file.fsPath); // take parent folder of file
			}
		}

		return pathToOpen;
	}
}

export class OpenConsoleAction extends AbstractOpenInTerminalAction {

	public static ID = 'workbench.action.terminal.openNativeConsole';
	public static Label = env.isWindows ? nls.localize('globalConsoleActionWin', "Open New Command Prompt") :
		nls.localize('globalConsoleActionMacLinux', "Open New Terminal");
	public static ScopedLabel = env.isWindows ? nls.localize('scopedConsoleActionWin', "Open in Command Prompt") :
		nls.localize('scopedConsoleActionMacLinux', "Open in Terminal");

	constructor(
		id: string,
		label: string,
		@ITerminalService private terminalService: ITerminalService,
		@IWorkbenchEditorService editorService: IWorkbenchEditorService,
		@IWorkspaceContextService contextService: IWorkspaceContextService,
		@IHistoryService historyService: IHistoryService
	) {
		super(id, label, editorService, contextService, historyService);
	}

	public run(event?: any): TPromise<any> {
		let pathToOpen = this.getPathToOpen();
		this.terminalService.openTerminal(pathToOpen);

		return TPromise.as(null);
	}
}

export class OpenIntegratedTerminalAction extends AbstractOpenInTerminalAction {

	public static ID = 'workbench.action.terminal.openFolderInIntegratedTerminal';
	public static Label = nls.localize('openFolderInIntegratedTerminal', "Open in Terminal");

	constructor(
		id: string,
		label: string,
		@IIntegratedTerminalService private integratedTerminalService: IIntegratedTerminalService,
		@IWorkbenchEditorService editorService: IWorkbenchEditorService,
		@IWorkspaceContextService contextService: IWorkspaceContextService,
		@IHistoryService historyService: IHistoryService
	) {
		super(id, label, editorService, contextService, historyService);
	}

	public run(event?: any): TPromise<any> {
		let pathToOpen = this.getPathToOpen();

		var instance = this.integratedTerminalService.createInstance({ cwd: pathToOpen }, true);
		if (instance) {
			this.integratedTerminalService.setActiveInstance(instance);
			this.integratedTerminalService.showPanel(true);
		}
		return TPromise.as(null);
	}
}

export class ExplorerViewerActionContributor extends ActionBarContributor {

	constructor(
		@IInstantiationService private instantiationService: IInstantiationService,
		@IConfigurationService private configurationService: IConfigurationService
	) {
		super();
	}

	public hasSecondaryActions(context: any): boolean {
		return !!explorerItemToFileResource(context.element);
	}

	public getSecondaryActions(context: any): IAction[] {
		let fileResource = explorerItemToFileResource(context.element);
		let resource = fileResource.resource;

		// We want the parent unless this resource is a directory
		if (!fileResource.isDirectory) {
			resource = uri.file(paths.dirname(resource.fsPath));
		}

		const configuration = this.configurationService.getConfiguration<ITerminalConfiguration>();
		const explorerKind = configuration.terminal.explorerKind;

		if (explorerKind === 'integrated') {
			let action = this.instantiationService.createInstance(OpenIntegratedTerminalAction, OpenIntegratedTerminalAction.ID, OpenIntegratedTerminalAction.Label);
			action.setResource(resource);

			return [action];
		} else {
			let action = this.instantiationService.createInstance(OpenConsoleAction, OpenConsoleAction.ID, OpenConsoleAction.ScopedLabel);
			action.setResource(resource);

			return [action];
		}
	}
}

const actionBarRegistry = Registry.as<IActionBarRegistry>(ActionBarExtensions.Actionbar);
actionBarRegistry.registerActionBarContributor(Scope.VIEWER, ExplorerViewerActionContributor);

// Register Global Action to Open Console
Registry.as<IWorkbenchActionRegistry>(ActionExtensions.WorkbenchActions).registerWorkbenchAction(
	new SyncActionDescriptor(
		OpenConsoleAction,
		OpenConsoleAction.ID,
		OpenConsoleAction.Label,
		{ primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KEY_C },
		KEYBINDING_CONTEXT_TERMINAL_NOT_FOCUSED
	),
	env.isWindows ? 'Open New Command Prompt' : 'Open New Terminal'
);
