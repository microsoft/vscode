/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ipcRenderer } from '../../../../base/parts/sandbox/electron-browser/globals.js';
import { URI, UriComponents } from '../../../../base/common/uri.js';
import { Disposable, DisposableStore } from '../../../../base/common/lifecycle.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../../workbench/common/contributions.js';
import { ISessionsManagementService } from '../../../services/sessions/common/sessionsManagement.js';
import { ISessionsViewService } from '../../../services/sessions/browser/sessionsViewService.js';
import { ILifecycleService, LifecyclePhase } from '../../../../workbench/services/lifecycle/common/lifecycle.js';
import { ILogService } from '../../../../platform/log/common/log.js';

class OpenAgentsSessionContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'sessions.openAgentsSession';

	constructor(
		@ISessionsManagementService private readonly sessionsManagementService: ISessionsManagementService,
		@ISessionsViewService private readonly sessionsViewService: ISessionsViewService,
		@ILifecycleService private readonly lifecycleService: ILifecycleService,
		@ILogService private readonly logService: ILogService,
	) {
		super();
		// Handoff from the main vscode window: open the given session (which
		// carries its own workspace) once the agents window is ready.
		const handleOpenAgentsSession = (_: unknown, ...args: unknown[]) => {
			const sessionResource = args[0] ? URI.revive(args[0] as UriComponents) : undefined;
			this.logService.info(`[AgentsHandoff] IPC received: sessionResource=${sessionResource?.toString() ?? '(none)'}`);
			if (!sessionResource) {
				return;
			}
			this.openExistingSession(sessionResource)
				.catch(err => this.logService.error('[AgentsHandoff] openExistingSession failed', err));
		};
		ipcRenderer.on('vscode:openAgentsSession', handleOpenAgentsSession);
		this._register({ dispose: () => ipcRenderer.removeListener('vscode:openAgentsSession', handleOpenAgentsSession) });
	}

	private async openExistingSession(sessionResource: URI): Promise<void> {
		this.logService.info(`[AgentsHandoff] openExistingSession: target=${sessionResource.toString()}`);

		// Wait for the workbench to be ready so the session list / providers
		// have populated. Otherwise openSession can't find the session.
		await this.lifecycleService.when(LifecyclePhase.Eventually);
		this.logService.info('[AgentsHandoff] reached LifecyclePhase.Eventually');

		// Fast path — already on the target session.
		const current = this.sessionsManagementService.activeSession.get();
		if (current && current.resource.toString() === sessionResource.toString()) {
			this.logService.info('[AgentsHandoff] already on target session');
			return;
		}

		// The Copilot Chat Sessions Provider lists sessions asynchronously
		// via an RPC; the target session may not yet be in the providers'
		// `getSessions()` map. Poll until it shows up.
		const found = await this.waitForSessionAvailable(sessionResource);
		if (!found) {
			this.logService.warn(`[AgentsHandoff] target session never appeared in providers; aborting`);
			return;
		}
		this.logService.info('[AgentsHandoff] target session available; opening');

		// `openSession` cancels any in-flight restore before activating the
		// target, so a single call wins the race — no retry/verify needed.
		await this.sessionsViewService.openSession(sessionResource);
	}

	private async waitForSessionAvailable(sessionResource: URI, timeoutMs = 15_000): Promise<boolean> {
		if (this.sessionsManagementService.getSession(sessionResource)) {
			return true;
		}

		// wait for session to become available
		return new Promise<boolean>(resolve => {
			const store = new DisposableStore();
			const done = (result: boolean) => {
				store.dispose();
				resolve(result);
			};
			const timer = setTimeout(() => done(!!this.sessionsManagementService.getSession(sessionResource)), timeoutMs);
			store.add({ dispose: () => clearTimeout(timer) });
			store.add(this.sessionsManagementService.onDidChangeSessions(() => {
				if (this.sessionsManagementService.getSession(sessionResource)) {
					done(true);
				}
			}));
		});
	}
}

registerWorkbenchContribution2(OpenAgentsSessionContribution.ID, OpenAgentsSessionContribution, WorkbenchPhase.BlockStartup);
