/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ipcRenderer } from '../../../../base/parts/sandbox/electron-browser/globals.js';
import { URI, UriComponents } from '../../../../base/common/uri.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { registerAction2 } from '../../../../platform/actions/common/actions.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../../workbench/common/contributions.js';
import { ISessionsManagementService } from '../../../services/sessions/common/sessionsManagement.js';
import { ISessionsProvidersService } from '../../../services/sessions/browser/sessionsProvidersService.js';
import { IViewsService } from '../../../../workbench/services/views/common/viewsService.js';
import { ILifecycleService, LifecyclePhase } from '../../../../workbench/services/lifecycle/common/lifecycle.js';
import { NewChatViewPane, SessionsViewId } from '../browser/newChatViewPane.js';
import { DebugAgentHostInDevToolsAction } from '../../../../workbench/contrib/chat/electron-browser/actions/debugAgentHostAction.js';
import { CollectAgentHostDebugLogsAction } from '../../agentHost/electron-browser/collectDebugLogsAction.js';

registerAction2(DebugAgentHostInDevToolsAction);
registerAction2(CollectAgentHostDebugLogsAction);

class SelectAgentsFolderContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'sessions.selectAgentsFolder';

	constructor(
		@ISessionsManagementService private readonly sessionsManagementService: ISessionsManagementService,
		@ISessionsProvidersService private readonly sessionsProvidersService: ISessionsProvidersService,
		@IViewsService private readonly viewsService: IViewsService,
		@ILifecycleService private readonly lifecycleService: ILifecycleService,
	) {
		super();
		ipcRenderer.on('vscode:selectAgentsFolder', (_: unknown, ...args: unknown[]) => {
			const folderUri = URI.revive(args[0] as UriComponents);
			this.selectFolder(folderUri);
		});
	}

	private async selectFolder(folderUri: URI): Promise<void> {
		this.sessionsManagementService.openNewSessionView();

		if (this.tryResolveAndSelect(folderUri)) {
			return;
		}

		// Provider not registered yet — wait for it, but give up at Eventually phase
		const disposable = this.sessionsProvidersService.onDidChangeProviders(() => {
			if (this.tryResolveAndSelect(folderUri)) {
				disposable.dispose();
			}
		});
		this.lifecycleService.when(LifecyclePhase.Eventually).then(() => disposable.dispose());
	}

	private tryResolveAndSelect(folderUri: URI): boolean {
		for (const provider of this.sessionsProvidersService.getProviders()) {
			const workspace = provider.resolveWorkspace(folderUri);
			if (workspace) {
				this.viewsService.openView<NewChatViewPane>(SessionsViewId).then(view => {
					view?.selectWorkspace({ providerId: provider.id, workspace });
				});
				return true;
			}
		}
		return false;
	}
}

registerWorkbenchContribution2(SelectAgentsFolderContribution.ID, SelectAgentsFolderContribution, WorkbenchPhase.BlockStartup);
