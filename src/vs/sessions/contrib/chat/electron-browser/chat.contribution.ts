/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ipcRenderer } from '../../../../base/parts/sandbox/electron-browser/globals.js';
import { URI, UriComponents } from '../../../../base/common/uri.js';
import { Disposable, DisposableStore } from '../../../../base/common/lifecycle.js';
import { autorun } from '../../../../base/common/observable.js';
import { timeout } from '../../../../base/common/async.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../../workbench/common/contributions.js';
import { ISessionsManagementService } from '../../../services/sessions/common/sessionsManagement.js';
import { ISessionsViewService } from '../../../services/sessions/browser/sessionsViewService.js';
import { ISessionsProvidersService } from '../../../services/sessions/browser/sessionsProvidersService.js';
import { IViewsService } from '../../../../workbench/services/views/common/viewsService.js';
import { ILifecycleService, LifecyclePhase } from '../../../../workbench/services/lifecycle/common/lifecycle.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { SessionsView, SessionsViewId as SessionsListViewId } from '../../sessions/browser/views/sessionsView.js';
import { ISessionsSetUpService } from '../../../browser/sessionsSetUpService.js';
import { ISessionsPartService } from '../../../services/sessions/browser/sessionsPartService.js';
import { SessionStatus } from '../../../services/sessions/common/session.js';
import { writeStoredSessionTypePref } from '../browser/sessionTypePicker.js';
import { IStorageService } from '../../../../platform/storage/common/storage.js';

class SelectAgentsFolderContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'sessions.selectAgentsFolder';

	constructor(
		@ISessionsManagementService private readonly sessionsManagementService: ISessionsManagementService,
		@ISessionsViewService private readonly sessionsViewService: ISessionsViewService,
		@ISessionsProvidersService private readonly sessionsProvidersService: ISessionsProvidersService,
		@IViewsService private readonly viewsService: IViewsService,
		@ILifecycleService private readonly lifecycleService: ILifecycleService,
		@ISessionsSetUpService private readonly sessionsSetUpService: ISessionsSetUpService,
		@ILogService private readonly logService: ILogService,
		@ISessionsPartService private readonly sessionsPartService: ISessionsPartService,
		@IStorageService private readonly storageService: IStorageService,
	) {
		super();
		const handleSelectAgentsFolder = (_: unknown, ...args: unknown[]) => {
			const folderUri = args[0] ? URI.revive(args[0] as UriComponents) : undefined;
			const initialQuery = typeof args[1] === 'string' ? args[1] : undefined;
			const sessionResource = args[2] ? URI.revive(args[2] as UriComponents) : undefined;
			const rawPref = args[3] && typeof args[3] === 'object' ? args[3] as Record<string, unknown> : undefined;
			const preferredSessionType = rawPref && typeof rawPref.sessionTypeId === 'string'
				? { sessionTypeId: rawPref.sessionTypeId, providerId: typeof rawPref.providerId === 'string' ? rawPref.providerId : undefined }
				: undefined;
			this.logService.info(`[AgentsHandoff] IPC received: folderUri=${folderUri?.toString() ?? '(none)'} initialQuery=${initialQuery ? 'yes' : 'no'} sessionResource=${sessionResource?.toString() ?? '(none)'} preferredSessionType=${preferredSessionType?.sessionTypeId ?? '(none)'}`);

			// Pre-seed the session-type picker before any UI consults it.
			// The picker re-reads from storage on its own onDidChangeValue
			// listener once the active session is cleared.
			if (preferredSessionType) {
				writeStoredSessionTypePref(this.storageService, preferredSessionType);
			}

			// Empty / new-session handoff: a folderUri may still come along (we
			// always pass the source workspace's folder) but as long as no real
			// session or initial query is being restored, our seed wins.
			const preferredOnly = !!preferredSessionType && !sessionResource && !initialQuery;

			this.handleOpenIntent(folderUri, initialQuery, sessionResource)
				.catch(err => this.logService.error('[AgentsHandoff] handleOpenIntent failed', err));

			if (preferredOnly) {
				// Wait for the workbench's own restoreVisibleSessions to
				// finish (which would otherwise overwrite our pick by
				// reactivating a prior session), then drop the active session
				// so the session-type picker re-reads the freshly stored
				// preference from storage.
				this.lifecycleService.when(LifecyclePhase.Eventually)
					.then(() => this.sessionsViewService.unsetNewSession())
					.catch(err => this.logService.error('[AgentsHandoff] preferred-only unsetNewSession failed', err));
			}
		};
		ipcRenderer.on('vscode:selectAgentsFolder', handleSelectAgentsFolder);
		this._register({ dispose: () => ipcRenderer.removeListener('vscode:selectAgentsFolder', handleSelectAgentsFolder) });
	}

	private async handleOpenIntent(folderUri: URI | undefined, initialQuery: string | undefined, sessionResource: URI | undefined): Promise<void> {
		if (folderUri) {
			await this.selectFolder(folderUri);
		}
		if (sessionResource) {
			await this.openExistingSession(sessionResource);
			return;
		}
		if (initialQuery) {
			await this.submitInitialQuery(initialQuery);
		}
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

		// Retry on cancellation / not-found — the agents window may still be
		// resolving its own restore, which can cancel our token. `openSession`
		// also returns without throwing when its load is cancelled mid-flight,
		// so verify the active session matches the target afterwards and
		// retry if it doesn't.
		const targetKey = sessionResource.toString();
		for (let attempt = 0; attempt < 6; attempt++) {
			try {
				await this.sessionsViewService.openSession(sessionResource);
				const active = this.sessionsManagementService.activeSession.get();
				if (active && active.resource.toString() === targetKey) {
					this.logService.info('[AgentsHandoff] openSession succeeded');
					return;
				}
				this.logService.warn(`[AgentsHandoff] openSession attempt ${attempt} resolved but active session is ${active?.resource.toString() ?? '(none)'}; retrying`);
			} catch (err) {
				const message = err instanceof Error ? err.message : String(err);
				this.logService.warn(`[AgentsHandoff] openSession attempt ${attempt} failed: ${message}`);
				const retryable = /canceled/i.test(message) || /not found/i.test(message);
				if (!retryable) {
					return;
				}
			}
			if (attempt < 5) {
				await timeout(500 + attempt * 500);
			}
		}
		this.logService.warn('[AgentsHandoff] gave up after retries');
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

	private async submitInitialQuery(query: string): Promise<void> {
		// Wait for the workbench to be fully past Restored. The chat view
		// container, copilot CLI agent, and provider registrations are all
		// async; submitting too early leads to `_sendFirstChat` failing with
		// "Failed to open chat widget" because the regular ChatView isn't
		// resolvable yet.
		await this.lifecycleService.when(LifecyclePhase.Eventually);

		const activeSession = this.sessionsManagementService.activeSession.get();
		const view = this.sessionsPartService.getSessionView(activeSession?.sessionId);
		if (!view) {
			return;
		}

		// Prefill immediately so the user can see the staged prompt and click
		// send themselves if our auto-submit doesn't fire (e.g. on a slow
		// machine where startup races overrun our wait window).
		view.prefillInput(query);

		// The Agents window's startup churns the active session several times.
		// Wait for it to stop changing before submitting; a fresh untitled CLI
		// session needs to settle before _sendFirstChat can open its chat view.
		const stableSession = await this.waitForStableActiveSession();
		if (!stableSession) {
			return;
		}

		// Even after the session settles, the chat view registry needs a beat
		// to finish wiring up the regular ChatView pane (it's gated by a
		// `when` clause that flips on submit). Give it a generous breather.
		await timeout(3000);

		const settledView = this.sessionsPartService.getSessionView(this.sessionsManagementService.activeSession.get()?.sessionId);
		settledView?.sendQuery(query);
	}

	private waitForStableActiveSession(timeoutMs = 20_000, stableMs = 2_500): Promise<boolean> {
		return new Promise<boolean>(resolve => {
			const start = Date.now();
			let lastSeenId: string | undefined = this.sessionsManagementService.activeSession.get()?.sessionId;
			let lastChange = Date.now();
			let settled = false;

			const store = new DisposableStore();
			store.add(autorun(reader => {
				const id = this.sessionsManagementService.activeSession.read(reader)?.sessionId;
				if (id !== lastSeenId) {
					lastSeenId = id;
					lastChange = Date.now();
				}
			}));

			const tick = async () => {
				while (!settled) {
					const now = Date.now();
					const current = this.sessionsManagementService.activeSession.get();
					if (current && now - lastChange >= stableMs) {
						settled = true;
						store.dispose();
						resolve(true);
						return;
					}
					if (now - start >= timeoutMs) {
						settled = true;
						store.dispose();
						resolve(!!current);
						return;
					}
					await timeout(200);
				}
			};
			tick();
		});
	}

	private async selectFolder(folderUri: URI): Promise<void> {
		// Wait for the welcome/setup flow to complete before selecting the folder
		await this.sessionsSetUpService.whenWelcomeDone();

		this.sessionsViewService.openNewSession();

		// Tell the sessions list this folder is the open-window source folder
		// so it ranks the matching folder section first. Get the view if it
		// already exists — do not open it just for this side-effect.
		const sessionsView = this.viewsService.getViewWithId<SessionsView>(SessionsListViewId);
		sessionsView?.sessionsControl?.setOpenWindowSourceFolder(folderUri);

		if (this.tryResolveAndSelect(folderUri)) {
			return;
		}

		// Provider not registered yet — wait for it. Block the caller so any
		// follow-up step (e.g. opening an existing session in this folder)
		// doesn't race the provider becoming available.
		await new Promise<void>(resolve => {
			const store = new DisposableStore();
			const done = () => { store.dispose(); resolve(); };
			store.add(this.sessionsProvidersService.onDidChangeProviders(() => {
				if (this.tryResolveAndSelect(folderUri)) {
					done();
				}
			}));
			this.lifecycleService.when(LifecyclePhase.Eventually).then(done);
		});
	}

	private tryResolveAndSelect(folderUri: URI): boolean {
		const resolved = this.sessionsManagementService.resolveWorkspace(folderUri);
		if (!resolved) {
			return false;
		}
		const activeSession = this.sessionsManagementService.activeSession.get();
		if (activeSession === undefined || activeSession.status.get() === SessionStatus.Untitled) {
			this.sessionsPartService.getSessionView(activeSession?.sessionId)?.selectWorkspace(folderUri, resolved.providerId);
		}
		return true;
	}
}

registerWorkbenchContribution2(SelectAgentsFolderContribution.ID, SelectAgentsFolderContribution, WorkbenchPhase.BlockStartup);
