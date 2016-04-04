/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import nls = require('vs/nls');
import {TPromise} from 'vs/base/common/winjs.base';
import {Registry} from 'vs/platform/platform';
import baseplatform = require('vs/base/common/platform');
import {IAction, Action} from 'vs/base/common/actions';
import {IWorkbenchActionRegistry, Extensions as ActionExtensions} from 'vs/workbench/common/actionRegistry';
import paths = require('vs/base/common/paths');
import {Scope, IActionBarRegistry, Extensions as ActionBarExtensions, ActionBarContributor} from 'vs/workbench/browser/actionBarRegistry';
import uri from 'vs/base/common/uri';
import {asFileResource} from 'vs/workbench/parts/files/common/files';
import {IWorkspaceContextService} from 'vs/workbench/services/workspace/common/contextService';
import {ITerminalService} from 'vs/workbench/parts/execution/common/execution';
import {SyncActionDescriptor} from 'vs/platform/actions/common/actions';
import {IInstantiationService} from 'vs/platform/instantiation/common/instantiation';
import {KeyMod, KeyCode} from 'vs/base/common/keyCodes';

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
		let workspace = this.contextService.getWorkspace();
		let path = this.resource ? this.resource.fsPath : (workspace && workspace.resource.fsPath);

		if (!path) {
			return TPromise.as(null);
		}

		this.terminalService.openTerminal(path);
		return TPromise.as(null);
	}
}

class FileViewerActionContributor extends ActionBarContributor {

	constructor( @IInstantiationService private instantiationService: IInstantiationService) {
		super();
	}

	public hasSecondaryActions(context: any): boolean {
		return !!asFileResource(context.element);
	}

	public getSecondaryActions(context: any): IAction[] {
		let fileResource = asFileResource(context.element);
		let resource = fileResource.resource;
		if (!fileResource.isDirectory) {
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
		{ primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KEY_C }
	)
);