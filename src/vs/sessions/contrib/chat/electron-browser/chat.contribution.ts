/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ipcRenderer } from '../../../../base/parts/sandbox/electron-browser/globals.js';
import { URI, UriComponents } from '../../../../base/common/uri.js';
import { Disposable, DisposableStore, MutableDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { CancellationToken, CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { raceCancellation, Sequencer } from '../../../../base/common/async.js';
import { isCancellationError } from '../../../../base/common/errors.js';
import { isEqual } from '../../../../base/common/resources.js';
import { localize } from '../../../../nls.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { IAgentHostByokLmHandler } from '../../../../platform/agentHost/common/agentHostByokLm.js';
import { IAgentHostConnectionsService } from '../../../../platform/agentHost/common/agentHostConnectionsService.js';
import { toRemoteAgentHostSessionType } from '../../../../platform/agentHost/common/agentHostSessionType.js';
import { buildExternalOpenSessionLinkUri, parseOpenSessionLinkChatId, parseOpenSessionLinkConnectionAuthority, parseOpenSessionLinkTurnId, parseOpenSessionLinkUri } from '../../../../platform/agentHost/common/openSessionLink.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { AgentHostByokLmHandler } from '../../../../workbench/contrib/chat/browser/agentSessions/agentHost/agentHostByokLmHandler.js';
import { Extensions as WorkbenchExtensions, IWorkbenchContribution, IWorkbenchContributionsRegistry, registerWorkbenchContribution2, WorkbenchPhase } from '../../../../workbench/common/contributions.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { ISessionsManagementService } from '../../../../workbench/contrib/sessions/common/sessionsManagement.js';
import { ISessionsService } from '../../../../workbench/contrib/sessions/browser/sessionsService.js';
import { IFocusedSessionHostService } from '../../../../workbench/services/sessions/browser/sessionHost.js';
import { ISessionsProvidersService } from '../../../../workbench/contrib/sessions/browser/sessionsProvidersService.js';
import { ILifecycleService, LifecyclePhase } from '../../../../workbench/services/lifecycle/common/lifecycle.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { INotificationService } from '../../../../platform/notification/common/notification.js';
import { IProductService } from '../../../../platform/product/common/productService.js';
import { INativeHostService } from '../../../../platform/native/common/native.js';
import { ISessionsSetUpService } from '../../../browser/sessionsSetUpService.js';
import { ISessionsPartService } from '../../../../workbench/services/sessions/browser/sessionsPartService.js';
import { SessionsCopilotConfigSlashSubmitHandlerContribution } from '../browser/copilotConfigSlashSubmitHandler.js';
import { AgentsWindowOpenSource, IAgentsWindowDraft, isAgentsWindowDraft, isAgentsWindowOpenSource } from '../../../../platform/window/common/window.js';
import { IStorageService } from '../../../../platform/storage/common/storage.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { isAgentHostProvider } from '../../../../workbench/contrib/sessions/common/agentHostSessionsProvider.js';
import { AgentsWindowUsage } from '../../../../workbench/contrib/chat/common/agentsWindowUsage.js';
import { ISessionsWindowOpenContext, ISessionsWindowOpenViewState, SessionsWindowOpenTelemetry, SessionsWindowSessionStartTelemetry } from '../../sessions/browser/sessionsWindowOpenTelemetry.js';
import { getNonArchivedSessionListCount } from '../../../../workbench/contrib/sessions/common/sessionsTelemetry.js';
import { INewSessionComposerService, NewSessionWorkspacePreselectionSource } from '../../../../workbench/contrib/sessions/browser/newSessionComposerService.js';
import { getAgentsWindowWorkspaceArgumentKind, getAgentsWindowWorkspaceArgumentRemoteKind, resolveAgentsWindowFolderIntent } from '../browser/agentsWindowOpenIntent.js';
import { findSessionForOpenSessionLink } from '../browser/openSessionLinkOpener.contribution.js';
import { getChatWindowLinkSource, IChatWindowLinkSource, openLinkedChatInChatWindow, resolveLinkedChat } from '../browser/chatLinkRouting.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { AgentsWindowWorkspaceHandoff } from '../browser/agentsWindowWorkspaceHandoff.js';
import { SessionsWorkspaceSelectionTelemetry } from '../../sessions/browser/sessionsWorkspaceSelectionTelemetry.js';
import { AgentsWindowInvitationOnboarding } from '../../onboardingTours/browser/agentsWindowInvitationOnboarding.js';
import { isAgentsWindowInvitationSource } from '../../../../workbench/contrib/chat/common/agentsWindowInvitation.js';
import { IChatService } from '../../../../workbench/contrib/chat/common/chatService/chatService.js';
import { isAgentHostTarget, isLocalAgentHostTarget } from '../../../../workbench/contrib/chat/common/chatSessionsService.js';
import { getChatSessionType } from '../../../../workbench/contrib/chat/common/model/chatUri.js';
import '../../../../workbench/contrib/chat/browser/aiCustomization/copilotCanvases.contribution.js';
import './chatBackgroundTool.contribution.js';
import { ScreenshotWindowToolContribution } from '../browser/screenshotWindowTool.js';
import { ISession, isSessionCreated } from '../../../../workbench/services/sessions/common/session.js';
import { IRemoteWorkspaceHandoffService, RemoteAgentHostHandoffResult } from '../../../common/remoteWorkspaceHandoff.js';
import { IChatWindowService } from '../../../../workbench/contrib/chatWindow/browser/chatWindow.js';
import { getRemoteName } from '../../../../platform/remote/common/remoteHosts.js';

/** Revokes editor request ownership when the next request is submitted here. */
export class AgentsWindowRequestActivity extends Disposable implements IWorkbenchContribution {
	static readonly ID = 'sessions.agentHostRequestActivity';

	constructor(
		@IChatService chatService: IChatService,
		@INativeHostService nativeHostService: INativeHostService,
		@ILifecycleService lifecycleService: ILifecycleService,
		@ILogService logService: ILogService,
	) {
		super();
		const updates = new Sequencer();
		let pending = Promise.resolve();
		this._register(chatService.onDidAcceptRequest(event => {
			if (isAgentHostTarget(getChatSessionType(event.chatSessionResource))) {
				pending = updates.queue(() => nativeHostService.updateAgentHostEditorState({
					kind: 'request', resource: event.chatSessionResource.toJSON(), isNewSession: event.isNewSession,
				}));
				void pending.catch(error => logService.error('[AgentsWindowRequestActivity] Failed to update request origin', error));
			}
		}));
		this._register(lifecycleService.onWillShutdown(event => event.join(pending, {
			id: AgentsWindowRequestActivity.ID,
			label: localize('savingAgentsWindowRequestActivity', "Saving Agent Host request activity"),
		})));
	}
}

export class SelectAgentsFolderContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'sessions.selectAgentsFolder';
	private readonly _windowOpenTelemetry = this._register(new MutableDisposable<SessionsWindowOpenTelemetry>());
	private readonly _workspaceSelectionTelemetry = this._register(new MutableDisposable<SessionsWorkspaceSelectionTelemetry>());
	private readonly _openIntent = this._register(new MutableDisposable());
	private readonly _workspaceHandoff: AgentsWindowWorkspaceHandoff;
	private readonly _invitationOnboarding: AgentsWindowInvitationOnboarding;
	private _didHandleInitialWindowOpen = false;

	constructor(
		@ISessionsManagementService private readonly sessionsManagementService: ISessionsManagementService,
		@ISessionsService private readonly sessionsService: ISessionsService,
		@IFocusedSessionHostService private readonly _focusedSessionHostService: IFocusedSessionHostService,
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
		@IRemoteWorkspaceHandoffService private readonly remoteWorkspaceHandoffService: IRemoteWorkspaceHandoffService,
		@IChatWindowService private readonly chatWindowService: IChatWindowService,
	) {
		super();
		// Session providers register in contributions instantiated after restore.
		this._workspaceHandoff = this._register(instantiationService.createInstance(AgentsWindowWorkspaceHandoff, Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench).whenRestored));
		this._invitationOnboarding = this._register(instantiationService.createInstance(AgentsWindowInvitationOnboarding));
		const handleSelectAgentsFolder = (_: unknown, ...args: unknown[]) => {
			this._workspaceHandoff.cancel();
			const cancellation = new CancellationTokenSource();
			this._openIntent.value = toDisposable(() => cancellation.dispose(true));
			const workspaceUri = args[0] ? URI.revive(args[0] as UriComponents) : undefined;
			const showNewSession = args[1] === 'new';
			const sessionResource = args[1] && !showNewSession ? URI.revive(args[1] as UriComponents) : undefined;
			const source = isAgentsWindowOpenSource(args[2]) ? args[2] : AgentsWindowOpenSource.Unknown;
			const onboardingSessionResource = isAgentsWindowInvitationSource(source) && args[5] ? URI.revive(args[5] as UriComponents) : undefined;
			const workspaceArgumentIsDefault = args[3] === true;
			const revealRemoteAuthority = sessionResource && typeof args[6] === 'string' ? args[6] : undefined;
			const draftPayload = showNewSession || source === AgentsWindowOpenSource.Link ? args[4] : undefined;
			if (draftPayload !== undefined && !isAgentsWindowDraft(draftPayload)) {
				this.logService.error('[AgentsHandoff] Invalid draft payload');
				this.notificationService.warn(localize('agentsHandoff.invalidDraft', "The draft could not be copied. Your prompt and attachments are still in the editor."));
				return;
			}
			const draft = draftPayload;
			const noWorkspace = source === AgentsWindowOpenSource.Link && draft !== undefined && workspaceUri === undefined;
			this.logService.info(`[AgentsHandoff] IPC received: folderUri=${workspaceUri?.toString() ?? '(none)'} sessionResource=${sessionResource?.toString() ?? '(none)'}`);
			const telemetry = this._startWindowOpenTelemetry(source, {
				workspaceArgumentKind: getAgentsWindowWorkspaceArgumentKind(workspaceUri),
				workspaceArgumentRemoteKind: getAgentsWindowWorkspaceArgumentRemoteKind(workspaceUri),
				hasSessionArgument: sessionResource !== undefined,
				workspaceArgumentIsDefault,
			});

			const handoff = () => this._handleOpenIntentAndCaptureInitialState(workspaceUri, sessionResource, workspaceArgumentIsDefault, cancellation.token, telemetry, draft, noWorkspace, showNewSession, revealRemoteAuthority);
			const opening = onboardingSessionResource && (!sessionResource || isEqual(onboardingSessionResource, sessionResource))
				? this._invitationOnboarding.runWithHandoff(handoff, async () => {
					const available = await this.waitForSessionAvailable(onboardingSessionResource, cancellation.token);
					return available ? this.getSessionForResource(onboardingSessionResource) : undefined;
				}, cancellation.token, sessionResource !== undefined)
				: handoff();
			opening.catch(err => this.logService.error('[AgentsHandoff] handleOpenIntent failed', err));
		};
		ipcRenderer.on('vscode:selectAgentsFolder', handleSelectAgentsFolder);
		this._register({ dispose: () => ipcRenderer.removeListener('vscode:selectAgentsFolder', handleSelectAgentsFolder) });
	}

	private _startWindowOpenTelemetry(source: AgentsWindowOpenSource, context: ISessionsWindowOpenContext): SessionsWindowOpenTelemetry | undefined {
		if (this._didHandleInitialWindowOpen) {
			return;
		}
		this._didHandleInitialWindowOpen = true;
		const hasPreviouslyStartedSession = new AgentsWindowUsage(this.storageService).createdSessionCount !== 0;
		new SessionsWindowSessionStartTelemetry(source, hasPreviouslyStartedSession, this.telemetryService);
		if (hasPreviouslyStartedSession) {
			return;
		}

		this._windowOpenTelemetry.value = new SessionsWindowOpenTelemetry(
			source,
			context,
			() => this.sessionsSetUpService.initialSignInDialogShown,
			() => this._getWindowOpenViewState(),
			() => getNonArchivedSessionListCount(this.sessionsManagementService.getSessions()),
			this.telemetryService,
			this.lifecycleService,
			this.storageService,
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

	private async _handleOpenIntentAndCaptureInitialState(workspaceUri: URI | undefined, sessionResource: URI | undefined, isDefault: boolean, token: CancellationToken, telemetry: SessionsWindowOpenTelemetry | undefined, draft?: IAgentsWindowDraft, noWorkspace = false, showNewSession = false, revealRemoteAuthority?: string): Promise<void> {
		try {
			await this.handleOpenIntent(workspaceUri, sessionResource, isDefault, token, telemetry, draft, noWorkspace, showNewSession, revealRemoteAuthority);
		} catch (error) {
			telemetry?.recordWorkspaceHandoffState('error');
			throw error;
		} finally {
			await this._captureInitialWindowViewState(telemetry);
		}
	}

	private _getWindowOpenViewState(): ISessionsWindowOpenViewState {
		const activeSession = this._focusedSessionHostService.focusedHost.get().session.get();
		const isNewSessionView = !activeSession || !isSessionCreated(activeSession);
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

	private async handleOpenIntent(workspaceUri: URI | undefined, sessionResource: URI | undefined, isDefault: boolean, token: CancellationToken, telemetry: SessionsWindowOpenTelemetry | undefined, draft?: IAgentsWindowDraft, noWorkspace = false, showNewSession = false, revealRemoteAuthority?: string): Promise<void> {
		const resolved = resolveAgentsWindowFolderIntent(workspaceUri, this.configurationService);
		// Opening an existing session establishes its own workspace context, so
		// the folder selection is only needed for the folder-only handoff (no
		// session to restore), or for a remote window's session this window can't open.
		if (sessionResource) {
			// A remote editor window names the sessions of its own agent host, on its remote machine, like local ones.
			const remoteAuthority = revealRemoteAuthority && isLocalAgentHostTarget(sessionResource.scheme) ? revealRemoteAuthority : undefined;
			const result = await this.openExistingSession(sessionResource, token, remoteAuthority);
			if (result !== 'unsupported' || token.isCancellationRequested || (!resolved.folderUri && !resolved.remote?.folder)) {
				return;
			}
			this.logService.info('[AgentsHandoff] remote session unsupported; falling back to its window\'s folder');
		}
		const folderUri = resolved.folderUri ?? (draft ? workspaceUri : undefined);
		if (showNewSession && !folderUri && !draft && !resolved.remote) {
			await raceCancellation(this.lifecycleService.when(LifecyclePhase.Restored), token);
			if (!token.isCancellationRequested) {
				this.newSessionComposerService.notifyUserNavigation();
				await this.sessionsService.openNewSession({ cancelRestore: true }, token);
			}
			return;
		}
		if (folderUri || draft || resolved.remote) {
			if (showNewSession) {
				this.newSessionComposerService.notifyUserNavigation();
			}
			await this._workspaceHandoff.selectWorkspace({
				folderUri, ...(resolved.remote ? { remote: resolved.remote } : {}), preferDevContainer: resolved.preferDevContainer, isDefault, draft, noWorkspace, revealNewSession: showNewSession,
			}, state => telemetry?.recordWorkspaceHandoffState(state));
		}
	}

	/** Returns `'unsupported'` when this window can't open the session of a remote window, whose folder it can open instead. */
	private async openExistingSession(sessionResource: URI, token: CancellationToken, remoteAuthority?: string): Promise<'unsupported' | undefined> {
		this.logService.info(`[AgentsHandoff] openExistingSession: target=${sessionResource.toString()}`);

		const backendSession = parseOpenSessionLinkUri(sessionResource);
		// The chat window that has focus as the link arrives is the one it was activated in, such as from its canvas:
		// read it before waiting, as focus can move meanwhile. No chat window has focus while another app has it.
		const linkSource = backendSession && getChatWindowLinkSource(this.chatWindowService.activeWindow, this.configurationService);

		// Wait until initial restore has started so opening the target can cancel it,
		// without delaying the handoff until the intentionally deferred Eventually phase.
		await raceCancellation(this.lifecycleService.when(LifecyclePhase.Restored), token);
		if (token.isCancellationRequested) {
			return undefined;
		}
		this.logService.info('[AgentsHandoff] reached LifecyclePhase.Restored');

		if (backendSession) {
			await this.sessionsPartService.getProgressIndicator().showWhile(this.resolveAndOpenSessionLink(sessionResource, backendSession, token, linkSource));
			return undefined;
		}

		if (remoteAuthority) {
			const opening = this.resolveAndOpenRemoteSession(sessionResource, remoteAuthority, token);
			await this.sessionsPartService.getProgressIndicator().showWhile(opening);
			return opening;
		}

		// Fast path — already on the target session.
		const current = this._focusedSessionHostService.focusedHost.get().session.get();
		if (current && current.resource.toString() === sessionResource.toString()) {
			this.logService.info('[AgentsHandoff] already on target session');
			return undefined;
		}

		// Show the sessions part's progress bar while we wait for the session to
		// appear in the providers and open it, so the window doesn't just sit on
		// its restored state until the target session pops in.
		await this.sessionsPartService.getProgressIndicator().showWhile(this.resolveAndOpenSession(sessionResource, token));
		return undefined;
	}

	private async resolveAndOpenSessionLink(sessionLink: URI, backendSession: URI, token: CancellationToken, linkSource: IChatWindowLinkSource | undefined): Promise<void> {
		const authority = parseOpenSessionLinkConnectionAuthority(sessionLink);
		const session = await this.waitForSessionLinkAvailable(backendSession, token, undefined, authority);
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
				authority,
			);
			this.notificationService.error(localize('agentsHandoff.sessionNotFound', "The linked session could not be found: {0}", externalLink));
			return;
		}

		const provider = this.sessionsProvidersService.getProvider(session.providerId, session.sessionId);
		if (provider && isAgentHostProvider(provider) && provider.connect && !this.agentHostConnectionsService.resolveSessionResource(session.resource)) {
			try {
				await provider.connect();
			} catch (error) {
				// Still reveal the seeded session so its connection recovery UI can surface the failure.
				this.logService.warn('[AgentsHandoff] linked session provider failed to connect on demand', error);
			}
		}

		const chatResource = await resolveLinkedChat(this.agentHostConnectionsService, session, parseOpenSessionLinkChatId(sessionLink));
		if (token.isCancellationRequested) {
			return;
		}
		this.logService.info(`[AgentsHandoff] linked session available; opening ${chatResource.toString()}`);
		if (linkSource && await openLinkedChatInChatWindow(this.chatWindowService, linkSource, session, chatResource, false)) {
			return;
		}
		if (token.isCancellationRequested) {
			return;
		}
		await this.sessionsService.openChat(session, chatResource, { source: 'link' });
	}

	private waitForSessionLinkAvailable(backendSession: URI, token: CancellationToken, timeoutMs = 15_000, connectionAuthority?: string): Promise<ReturnType<typeof findSessionForOpenSessionLink>> {
		if (token.isCancellationRequested) {
			return Promise.resolve(undefined);
		}
		const findSession = () => findSessionForOpenSessionLink(backendSession, this.sessionsManagementService, this.agentHostConnectionsService, connectionAuthority);
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

		// `openChat` cancels any in-flight restore before activating the
		// target, so a single call wins the race — no retry/verify needed.
		const session = this.getSessionForResource(sessionResource);
		if (!session) {
			this.logService.warn('[AgentsHandoff] target session disappeared before opening; aborting');
			return;
		}
		await this.sessionsService.openChat(session, sessionResource, { source: 'chat' });
	}

	/**
	 * Opens a session of a remote editor window. That window reaches the agent host on its remote machine as its own
	 * agent host, while this window connects to the same host as a remote agent host, which names its sessions differently.
	 * Returns `'unsupported'` when this window does not share that agent host.
	 */
	private async resolveAndOpenRemoteSession(editorSessionResource: URI, remoteAuthority: string, token: CancellationToken): Promise<'unsupported' | undefined> {
		// Unsupported remotes fall back to their source folder without a notification.
		const remoteName = getRemoteName(remoteAuthority);
		if (remoteName !== 'tunnel' && remoteName !== 'ssh-remote' && remoteName !== 'wsl') {
			this.logService.info(`[AgentsHandoff] sessions of ${remoteName} windows are not shared with this window`);
			return 'unsupported';
		}
		let host: RemoteAgentHostHandoffResult;
		try {
			host = await this.remoteWorkspaceHandoffService.resolveHost(remoteAuthority, token);
		} catch (error) {
			if (isCancellationError(error)) {
				return undefined;
			}
			throw error;
		}
		if (host.unavailableReason !== undefined) {
			this.notificationService.warn(localize('agentsHandoff.remoteSessionUnavailable', "The session of your remote window could not be opened in the Agents Window. {0}", host.unavailableReason));
			return undefined;
		}
		const sessionType = toRemoteAgentHostSessionType(editorSessionResource.scheme, host.connectionAuthority);
		// The handoff reports failures of the connection it starts.
		if (!sessionType || !await raceCancellation(host.connected, token, false)) {
			return undefined;
		}
		if (!host.sharesEditorWindowAgentHost()) {
			this.notificationService.warn(localize('agentsHandoff.remoteSessionOtherHost', "The session of your remote window can't be opened in the Agents Window, because the Agents Window is connected to a different agent host on the remote machine than your remote window."));
			return 'unsupported';
		}
		const sessionResource = editorSessionResource.with({ scheme: sessionType });
		this.logService.info(`[AgentsHandoff] remote session: target=${sessionResource.toString()}`);
		if (isEqual(this._focusedSessionHostService.focusedHost.get().chatResource.get(), sessionResource)) {
			return undefined;
		}
		const found = await this.waitForSessionAvailable(sessionResource, token);
		if (token.isCancellationRequested) {
			return undefined;
		}
		const session = found ? this.getSessionForResource(sessionResource) : undefined;
		if (!session) {
			this.logService.warn('[AgentsHandoff] remote session never appeared in its host\'s provider; aborting');
			this.notificationService.warn(localize('agentsHandoff.remoteSessionNotFound', "The session of your remote window could not be found on the remote agent host."));
			return undefined;
		}
		await this.sessionsService.openChat(session, sessionResource, { source: 'chat' });
		return undefined;
	}

	private getSessionForResource(chatResource: URI): ISession | undefined {
		return this.sessionsManagementService.getSessionForChatResource(chatResource)?.session
			?? this.sessionsManagementService.getSession(chatResource);
	}

	private async waitForSessionAvailable(sessionResource: URI, token: CancellationToken, timeoutMs = 15_000): Promise<boolean> {
		if (token.isCancellationRequested) {
			return false;
		}
		if (this.getSessionForResource(sessionResource)) {
			return true;
		}

		// wait for session to become available
		return new Promise<boolean>(resolve => {
			const store = new DisposableStore();
			const done = (result: boolean) => {
				store.dispose();
				resolve(result);
			};
			const timer = setTimeout(() => done(!!this.getSessionForResource(sessionResource)), timeoutMs);
			store.add({ dispose: () => clearTimeout(timer) });
			store.add(this.sessionsManagementService.onDidChangeSessions(() => {
				if (this.getSessionForResource(sessionResource)) {
					done(true);
				}
			}));
			store.add(token.onCancellationRequested(() => done(false)));
		});
	}

}

registerWorkbenchContribution2(SelectAgentsFolderContribution.ID, SelectAgentsFolderContribution, WorkbenchPhase.BlockStartup);
registerWorkbenchContribution2(AgentsWindowRequestActivity.ID, AgentsWindowRequestActivity, WorkbenchPhase.BlockStartup);
registerWorkbenchContribution2(SessionsCopilotConfigSlashSubmitHandlerContribution.ID, SessionsCopilotConfigSlashSubmitHandlerContribution, WorkbenchPhase.AfterRestored);
// Desktop only: in browsers, capturing the window asks the user to pick a screen.
registerWorkbenchContribution2(ScreenshotWindowToolContribution.ID, ScreenshotWindowToolContribution, WorkbenchPhase.Eventually);

// Renderer-side BYOK language-model handler that backs the node agent host's
// OpenAI proxy, mirroring the registration in the workbench's
// `contrib/chat/electron-browser/chat.contribution`. The Agents app runs a full
// extension host whose LM API holds the user's BYOK models, so registering the
// handler here lets the Agents window serve BYOK too — necessary when it is the
// only window connected to the node host. Lazily instantiated when the node host
// resolves it via `AgentHostClientByokLmChannel`.
registerSingleton(IAgentHostByokLmHandler, AgentHostByokLmHandler, InstantiationType.Delayed);
