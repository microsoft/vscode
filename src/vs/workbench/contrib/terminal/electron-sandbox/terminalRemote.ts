/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from 'vs/nls';
import { Registry } from 'vs/platform/registry/common/platform';
import { Extensions as ActionExtensions, IWorkbenchActionRegistry } from 'vs/workbench/common/actions';
import { SyncActionDescriptor } from 'vs/platform/actions/common/actions';
import { TERMINAL_ACTION_CATEGORY, TerminalCommandId } from 'vs/workbench/contrib/terminal/common/terminal';
import { Action } from 'vs/base/common/actions';
import { ITerminalGroupService, ITerminalService } from 'vs/workbench/contrib/terminal/browser/terminal';
import { INativeEnvironmentService } from 'vs/platform/environment/common/environment';
import { IRemoteAuthorityResolverService } from 'vs/platform/remote/common/remoteAuthorityResolver';
import { URI } from 'vs/base/common/uri';
import { IHistoryService } from 'vs/workbench/services/history/common/history';
import { Schemas } from 'vs/base/common/network';

export function registerRemoteContributions() {
	const actionRegistry = Registry.as<IWorkbenchActionRegistry>(ActionExtensions.WorkbenchActions);
	actionRegistry.registerWorkbenchAction(SyncActionDescriptor.from(CreateNewLocalTerminalAction), 'Terminal: Create New Integrated Terminal (Local)', TERMINAL_ACTION_CATEGORY);
}

export class CreateNewLocalTerminalAction extends Action {
	static readonly ID = TerminalCommandId.NewLocal;
	static readonly LABEL = nls.localize('workbench.action.terminal.newLocal', "Create New Integrated Terminal (Local)");

	constructor(
		id: string, label: string,
		@ITerminalService private readonly _terminalService: ITerminalService,
		@ITerminalGroupService private readonly _terminalGroupService: ITerminalGroupService,
		@INativeEnvironmentService private readonly _nativeEnvironmentService: INativeEnvironmentService,
		@IRemoteAuthorityResolverService private readonly _remoteAuthorityResolverService: IRemoteAuthorityResolverService,
		@IHistoryService private readonly _historyService: IHistoryService
	) {
		super(id, label);
	}

	override async run(): Promise<any> {
		let cwd: URI | undefined;
		try {
			const activeWorkspaceRootUri = this._historyService.getLastActiveWorkspaceRoot(Schemas.vscodeRemote);
			if (activeWorkspaceRootUri) {
				const canonicalUri = await this._remoteAuthorityResolverService.getCanonicalURI(activeWorkspaceRootUri);
				if (canonicalUri.scheme === Schemas.file) {
					cwd = canonicalUri;
				}
			}
		} catch { }
		if (!cwd) {
			cwd = this._nativeEnvironmentService.userHome;
		}
		const instance = await this._terminalService.createTerminal({ cwd });
		if (!instance) {
			return Promise.resolve(undefined);
		}

		this._terminalService.setActiveInstance(instance);
		return this._terminalGroupService.showPanel(true);
	}
}
