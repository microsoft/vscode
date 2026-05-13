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
import { SessionsView, SessionsViewId as SessionsListViewId } from '../../sessions/browser/views/sessionsView.js';
import { DebugAgentHostInDevToolsAction } from '../../../../workbench/contrib/chat/electron-browser/actions/debugAgentHostAction.js';
import { ExportAgentHostDebugLogsAction } from '../../agentHost/electron-browser/exportDebugLogsAction.js';
import { ISessionsSetUpService } from '../../../browser/sessionsSetUpService.js';

registerAction2(DebugAgentHostInDevToolsAction);
registerAction2(ExportAgentHostDebugLogsAction);

class SelectAgentsFolderContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'sessions.selectAgentsFolder';

	constructor(
		@ISessionsManagementService private readonly sessionsManagementService: ISessionsManagementService,
		@ISessionsProvidersService private readonly sessionsProvidersService: ISessionsProvidersService,
		@IViewsService private readonly viewsService: IViewsService,
		@ILifecycleService private readonly lifecycleService: ILifecycleService,
		@ISessionsSetUpService private readonly sessionsSetUpService: ISessionsSetUpService,
	) {
		super();
		ipcRenderer.on('vscode:selectAgentsFolder', (_: unknown, ...args: unknown[]) => {
			const folderUri = URI.revive(args[0] as UriComponents);
			this.selectFolder(folderUri);
		});
	}

	private async selectFolder(folderUri: URI): Promise<void> {
		// Wait for the welcome/setup flow to complete before selecting the folder
		await this.sessionsSetUpService.whenWelcomeDone();

		this.sessionsManagementService.openNewSessionView();

		// Tell the sessions list this folder is the open-window source folder
		// so it ranks the matching folder section first. Get the view if it
		// already exists — do not open it just for this side-effect.
		const sessionsView = this.viewsService.getViewWithId<SessionsView>(SessionsListViewId);
		sessionsView?.sessionsControl?.setOpenWindowSourceFolder(folderUri);

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
