/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ipcRenderer } from '../../../../base/parts/sandbox/electron-browser/globals.js';
import { URI, UriComponents } from '../../../../base/common/uri.js';
import { Disposable, DisposableStore, MutableDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { CancellationToken, CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { raceCancellation } from '../../../../base/common/async.js';
import { localize } from '../../../../nls.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { IAgentHostByokLmHandler } from '../../../../platform/agentHost/common/agentHostByokLm.js';
import { IAgentHostConnectionsService } from '../../../../platform/agentHost/common/agentHostConnectionsService.js';
import { buildExternalOpenSessionLinkUri, parseOpenSessionLinkChatId, parseOpenSessionLinkTurnId, parseOpenSessionLinkUri } from '../../../../platform/agentHost/common/openSessionLink.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { AgentHostByokLmHandler } from '../../../../workbench/contrib/chat/browser/agentSessions/agentHost/agentHostByokLmHandler.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../../workbench/common/contributions.js';
import { ISessionsManagementService } from '../../../services/sessions/common/sessionsManagement.js';
import { ISessionsService } from '../../../services/sessions/browser/sessionsService.js';
import { ISessionsProvidersService } from '../../../services/sessions/browser/sessionsProvidersService.js';
import { ILifecycleService, LifecyclePhase } from '../../../../workbench/services/lifecycle/common/lifecycle.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { INotificationService } from '../../../../platform/notification/common/notification.js';
import { IProductService } from '../../../../platform/product/common/productService.js';
import { ISessionsSetUpService } from '../../../browser/sessionsSetUpService.js';
import { ISessionsPartService } from '../../../services/sessions/browser/sessionsPartService.js';
import { SessionsCopilotConfigSlashSubmitHandlerContribution } from '../browser/copilotConfigSlashSubmitHandler.js';
import { AgentsWindowOpenSource, isAgentsWindowOpenSource } from '../../../../platform/window/common/window.js';
import { IStorageService, StorageScope } from '../../../../platform/storage/common/storage.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { isAgentHostProvider } from '../../../common/agentHostSessionsProvider.js';
import { TOTAL_SESSIONS_KEY } from '../../sessions/browser/sessionsLifecycleTracker.js';
import { ISessionsWindowOpenContext, ISessionsWindowOpenViewState, SessionsWindowOpenTelemetry, SessionsWindowSessionStartTelemetry } from '../../sessions/browser/sessionsWindowOpenTelemetry.js';
import { INewSessionComposerService, NewSessionWorkspacePreselectionSource } from '../browser/newSessionComposerService.js';
import { getAgentsWindowWorkspaceArgumentKind, resolveAgentsWindowFolderIntent } from '../browser/agentsWindowOpenIntent.js';
import { findSessionForOpenSessionLink } from '../browser/openSessionLinkOpener.contribution.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { AgentsWindowWorkspaceHandoff } from '../browser/agentsWindowWorkspaceHandoff.js';
import { SessionsWorkspaceSelectionTelemetry } from '../../sessions/browser/sessionsWorkspaceSelectionTelemetry.js';

export class SelectAgentsFolderContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'sessions.selectAgentsFolder';
	private readonly _windowOpenTelemetry = this._register(new MutableDisposable<SessionsWindowOpenTelemetry>());
	private readonly _workspaceSelectionTelemetry = this._register(new MutableDisposable<SessionsWorkspaceSelectionTelemetry>());
	private readonly _openIntent = this._register(new MutableDisposable());
	private readonly _workspaceHandoff: AgentsWindowWorkspaceHandoff;
	private _didHandleInitialWindowOpen = false;

	constructor(
		@ISessionsManagementService private readonly sessionsManagementService: ISessionsManagementService,
		@ISessionsService private readonly sessionsService: ISessionsService,
		@ISessionsProvidersService private readonly sessionsProvidersService: ISessionsProvidersService,
		@ILifecycleService private readonly lifecycleService: ILifecycleService,
		@ISessionsSetUpService private readonly sessionsSetUpService: ISessionsSetUpService,
		@ILogService private readonly logService: ILogService,
		@ISessionsPartService private readonly sessionsPartService: ISessionsPartService,
		@IStorageService private readonly storageService: IStorageService,
		@ITelemetryService private readonly telemetryService: ITelemetryService,
		@INewSessionComposerService private readonly newSessionComposerService: INewSessionComposerService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IAgentHostConnectionsService private readonly agentHostConnectionsService: IAgentHostConnectionsService,
		@INotificationService private readonly notificationService: INotificationService,
		@IProductService private readonly productService: IProductService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
	) {
		super();
		this._workspaceHandoff = this._register(instantiationService.createInstance(AgentsWindowWorkspaceHandoff));
		const handleSelectAgentsFolder = (_: unknown, ...args: unknown[]) => {
			this._workspaceHandoff.cancel();
			const cancellation = new CancellationTokenSource();
			this._openIntent.value = toDisposable(() => cancellation.dispose(true));
			const workspaceUri = args[0] ? URI.revive(args[0] as UriComponents) : undefined;
			const { folderUri, preferDevContainer } = resolveAgentsWindowFolderIntent(workspaceUri, this.configurationService);
			const sessionResource = args[1] ? URI.revive(args[1] as UriComponents) : undefined;
			const source = isAgentsWindowOpenSource(args[2]) ? args[2] : AgentsWindowOpenSource.Unknown;
			const workspaceArgumentIsDefault = args[3] === true;
			this.logService.info(`[AgentsHandoff] IPC received: folderUri=${folderUri?.toString() ?? '(none)'} sessionResource=${sessionResource?.toString() ?? '(none)'}`);
			const telemetry = this._startWindowOpenTelemetry(source, {
				workspaceArgumentKind: getAgentsWindowWorkspaceArgumentKind(workspaceUri),
				hasSessionArgument: sessionResource !== undefined,
				workspaceArgumentIsDefault,
			});

			this._handleOpenIntentAndCaptureInitialState(folderUri, sessionResource, preferDevContainer, workspaceArgumentIsDefault, cancellation.token, telemetry)
				.catch(err => this.logService.error('[AgentsHandoff] handleOpenIntent failed', err));
		};
		ipcRenderer.on('vscode:selectAgentsFolder', handleSelectAgentsFolder);
		this._register({ dispose: () => ipcRenderer.removeListener('vscode:selectAgentsFolder', handleSelectAgentsFolder) });
	}

	private _startWindowOpenTelemetry(source: AgentsWindowOpenSource, context: ISessionsWindowOpenContext): SessionsWindowOpenTelemetry | undefined {
		if (this._didHandleInitialWindowOpen) {
			return;
		}
		this._didHandleInitialWindowOpen = true;
		const hasPreviouslyStartedSession = this.storageService.getNumber(TOTAL_SESSIONS_KEY, StorageScope.APPLICATION, 0) !== 0;
		new SessionsWindowSessionStartTelemetry(source, hasPreviouslyStartedSession, this.telemetryService);
		if (hasPreviouslyStartedSession) {
			return;
		}

		this._windowOpenTelemetry.value = new SessionsWindowOpenTelemetry(
			source,
			context,
			() => this.sessionsSetUpService.initialSignInDialogShown,
			() => this._getWindowOpenViewState(),
			this.telemetryService,
			this.lifecycleService,
		);
		if (!context.hasSessionArgument) {
			this._workspaceSelectionTelemetry.value = this.instantiationService.createInstance(SessionsWorkspaceSelectionTelemetry, source, context);
		}
		return this._windowOpenTelemetry.value;
	}

	private async _captureInitialWindowViewState(telemetry: SessionsWindowOpenTelemetry | undefined): Promise<void> {
		await this.lifecycleService.when(LifecyclePhase.Eventually);
		telemetry?.captureInitialViewState();
	}

	private async _handleOpenIntentAndCaptureInitialState(folderUri: URI | undefined, sessionResource: URI | undefined, preferDevContainer: boolean, isDefault: boolean, token: CancellationToken, telemetry: SessionsWindowOpenTelemetry | undefined): Promise<void> {
		try {
			await this.handleOpenIntent(folderUri, sessionResource, preferDevContainer, isDefault, token, telemetry);
		} catch (error) {
			telemetry?.recordWorkspaceHandoffState('error');
			throw error;
		} finally {
			await this._captureInitialWindowViewState(telemetry);
		}
	}

	private _getWindowOpenViewState(): ISessionsWindowOpenViewState {
		const activeSession = this.sessionsService.activeSession.get();
		const isNewSessionView = !activeSession || !activeSession.isCreated.get();
		if (!isNewSessionView) {
			return {
				workspacePreselected: undefined,
				workspacePreselectionSource: undefined,
				viewKind: 'createdSession',
			};
		}
		const composer = this.newSessionComposerService.activeComposer.get();
		const composerSource = composer?.workspacePreselectionSource;
		const workspacePreselected = activeSession?.workspace.get() !== undefined
			|| (composerSource !== undefined && composerSource !== NewSessionWorkspacePreselectionSource.None);
		return {
			workspacePreselected,
			workspacePreselectionSource: composerSource
				?? (workspacePreselected ? NewSessionWorkspacePreselectionSource.Unknown : NewSessionWorkspacePreselectionSource.None),
			viewKind: composer ? 'newSession' : 'noComposer',
			workspaceSelection: composer?.workspaceSelection,
		};
	}

	private async handleOpenIntent(folderUri: URI | undefined, sessionResource: URI | undefined, preferDevContainer: boolean, isDefault: boolean, token: CancellationToken, telemetry: SessionsWindowOpenTelemetry | undefined): Promise<void> {
		// Opening an existing session establishes its own workspace context, so
		// the folder selection is only needed for the folder-only handoff (no
		// session to restore).
		if (sessionResource) {
			await this.openExistingSession(sessionResource, token);
			return;
		}
		if (folderUri) {
			await this._workspaceHandoff.selectWorkspace({ folderUri, preferDevContainer, isDefault }, state => telemetry?.recordWorkspaceHandoffState(state));
		}
	}

	private async openExistingSession(sessionResource: URI, token: CancellationToken): Promise<void> {
		this.logService.info(`[AgentsHandoff] openExistingSession: target=${sessionResource.toString()}`);

		// Wait until initial restore has started so opening the target can cancel it,
		// without delaying the handoff until the intentionally deferred Eventually phase.
		await raceCancellation(this.lifecycleService.when(LifecyclePhase.Restored), token);
		if (token.isCancellationRequested) {
			return;
		}
		this.logService.info('[AgentsHandoff] reached LifecyclePhase.Restored');

		const backendSession = parseOpenSessionLinkUri(sessionResource);
		if (backendSession) {
			await this.sessionsPartService.getProgressIndicator().showWhile(this.resolveAndOpenSessionLink(sessionResource, backendSession, token));
			return;
		}

		// Fast path — already on the target session.
		const current = this.sessionsService.activeSession.get();
		if (current && current.resource.toString() === sessionResource.toString()) {
			this.logService.info('[AgentsHandoff] already on target session');
			return;
		}

		// Show the sessions part's progress bar while we wait for the session to
		// appear in the providers and open it, so the window doesn't just sit on
		// its restored state until the target session pops in.
		await this.sessionsPartService.getProgressIndicator().showWhile(this.resolveAndOpenSession(sessionResource, token));
	}

	private async resolveAndOpenSessionLink(sessionLink: URI, backendSession: URI, token: CancellationToken): Promise<void> {
		const session = await this.waitForSessionLinkAvailable(backendSession, token);
		if (token.isCancellationRequested) {
			return;
		}
		if (!session) {
			this.logService.warn('[AgentsHandoff] linked session never appeared in providers; aborting');
			const externalLink = buildExternalOpenSessionLinkUri(
				this.productService.urlProtocol,
				backendSession,
				parseOpenSessionLinkChatId(sessionLink),
				parseOpenSessionLinkTurnId(sessionLink),
			);
			this.notificationService.error(localize('agentsHandoff.sessionNotFound', "The linked session could not be found: {0}", externalLink));
			return;
		}

		const provider = this.sessionsProvidersService.getProvider(session.providerId);
		if (provider && isAgentHostProvider(provider) && provider.connect && !this.agentHostConnectionsService.resolveSessionResource(session.resource)) {
			try {
				await provider.connect();
			} catch (error) {
				// Still reveal the seeded session so its connection recovery UI can surface the failure.
				this.logService.warn('[AgentsHandoff] linked session provider failed to connect on demand', error);
			}
		}

		const chatId = parseOpenSessionLinkChatId(sessionLink);
		const chatResource = chatId ? session.resource.with({ fragment: chatId }) : session.mainChat.get().resource;
		if (token.isCancellationRequested) {
			return;
		}
		this.logService.info(`[AgentsHandoff] linked session available; opening ${chatResource.toString()}`);
		await this.sessionsService.openChat(session, chatResource, { source: 'link' });
	}

	private waitForSessionLinkAvailable(backendSession: URI, token: CancellationToken, timeoutMs = 15_000): Promise<ReturnType<typeof findSessionForOpenSessionLink>> {
		if (token.isCancellationRequested) {
			return Promise.resolve(undefined);
		}
		const findSession = () => findSessionForOpenSessionLink(backendSession, this.sessionsManagementService, this.agentHostConnectionsService);
		const existing = findSession();
		if (existing) {
			return Promise.resolve(existing);
		}

		return new Promise(resolve => {
			const store = new DisposableStore();
			const done = (session: ReturnType<typeof findSession>) => {
				store.dispose();
				resolve(session);
			};
			const tryFind = () => {
				const session = findSession();
				if (session) {
					done(session);
				}
			};
			const timer = setTimeout(() => done(findSession()), timeoutMs);
			store.add({ dispose: () => clearTimeout(timer) });
			store.add(this.sessionsManagementService.onDidChangeSessions(tryFind));
			store.add(this.agentHostConnectionsService.onDidChangeSessionResolution(tryFind));
			store.add(token.onCancellationRequested(() => done(undefined)));
			tryFind();
		});
	}

	private async resolveAndOpenSession(sessionResource: URI, token: CancellationToken): Promise<void> {
		// The Copilot Chat Sessions Provider lists sessions asynchronously
		// via an RPC; the target session may not yet be in the providers'
		// `getSessions()` map. Poll until it shows up.
		const found = await this.waitForSessionAvailable(sessionResource, token);
		if (token.isCancellationRequested) {
			return;
		}
		if (!found) {
			this.logService.warn(`[AgentsHandoff] target session never appeared in providers; aborting`);
			return;
		}
		this.logService.info('[AgentsHandoff] target session available; opening');

		// `openSession` cancels any in-flight restore before activating the
		// target, so a single call wins the race — no retry/verify needed.
		await this.sessionsService.openSession(sessionResource, { source: 'chat' });
	}

	private async waitForSessionAvailable(sessionResource: URI, token: CancellationToken, timeoutMs = 15_000): Promise<boolean> {
		if (token.isCancellationRequested) {
			return false;
		}
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
			store.add(token.onCancellationRequested(() => done(false)));
		});
	}

}

registerWorkbenchContribution2(SelectAgentsFolderContribution.ID, SelectAgentsFolderContribution, WorkbenchPhase.BlockStartup);
registerWorkbenchContribution2(SessionsCopilotConfigSlashSubmitHandlerContribution.ID, SessionsCopilotConfigSlashSubmitHandlerContribution, WorkbenchPhase.AfterRestored);

// Renderer-side BYOK language-model handler that backs the node agent host's
// OpenAI proxy, mirroring the registration in the workbench's
// `contrib/chat/electron-browser/chat.contribution`. The Agents app runs a full
// extension host whose LM API holds the user's BYOK models, so registering the
// handler here lets the Agents window serve BYOK too — necessary when it is the
// only window connected to the node host. Lazily instantiated when the node host
// resolves it via `AgentHostClientByokLmChannel`.
registerSingleton(IAgentHostByokLmHandler, AgentHostByokLmHandler, InstantiationType.Delayed);
