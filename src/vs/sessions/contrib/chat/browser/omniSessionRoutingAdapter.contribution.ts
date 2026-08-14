/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../base/common/cancellation.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { getErrorMessage, isCancellationError } from '../../../../base/common/errors.js';
import { Emitter } from '../../../../base/common/event.js';
import { IMarkdownString } from '../../../../base/common/htmlContent.js';
import { Disposable, DisposableStore, IDisposable, MutableDisposable } from '../../../../base/common/lifecycle.js';
import { autorun } from '../../../../base/common/observable.js';
import { URI } from '../../../../base/common/uri.js';
import { localize } from '../../../../nls.js';
import { RemoteAgentHostConnectionStatus, RemoteAgentHostsEnabledSettingId } from '../../../../platform/agentHost/common/remoteAgentHostService.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IFileDialogService } from '../../../../platform/dialogs/common/dialogs.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { INotificationService } from '../../../../platform/notification/common/notification.js';
import { IUriIdentityService } from '../../../../platform/uriIdentity/common/uriIdentity.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../../workbench/common/contributions.js';
import { IChatSendRequestOptions } from '../../../../workbench/contrib/chat/common/chatService/chatService.js';
import { IChatSessionHistoryItem, IChatSessionsService } from '../../../../workbench/contrib/chat/common/chatSessionsService.js';
import { IChatSessionRoutingDispatchResult, IChatSessionRoutingNewSessionTarget, IChatSessionRoutingProvider, IChatSessionRoutingProviderService, IChatSessionRoutingWorkspace, IChatSessionRoutingWorkspaceCatalog, IRoutableSession, ROUTER_FIELD_CLIP_LENGTH } from '../../../../workbench/contrib/chat/common/sessionRouter.js';
import { isAgentHostProvider } from '../../../common/agentHostSessionsProvider.js';
import { ISessionsProvidersService } from '../../../services/sessions/browser/sessionsProvidersService.js';
import { ISessionsRecentWorkspacesService } from '../../../services/sessions/browser/sessionsRecentWorkspacesService.js';
import { ISessionsService } from '../../../services/sessions/browser/sessionsService.js';
import { ChatInteractivity, IChat, ISession, ISessionWorkspace, ISessionWorkspaceBrowseAction, SESSION_WORKSPACE_GROUP_LOCAL, SessionStatus } from '../../../services/sessions/common/session.js';
import { ICreateNewSessionOptions, ISendRequestOptions, ISessionsManagementService, WorkspaceNotTrustedError } from '../../../services/sessions/common/sessionsManagement.js';
import { SessionWorkspaceFallback } from './sessionWorkspaceFallback.js';
import { buildSessionWorkspacePickerCatalog } from './sessionWorkspacePickerModel.js';

interface ISessionRoutingTarget {
	readonly session: ISession;
	readonly chat: IChat;
}

export class OmniSessionRoutingAdapter extends Disposable implements IChatSessionRoutingProvider {

	private readonly sessions = new Map<string, ISession>();
	private readonly sessionResourceAliases = new Map<string, URI>();
	private readonly _onDidChangeSessions = this._register(new Emitter<void>());
	readonly onDidChangeSessions = this._onDidChangeSessions.event;
	private readonly _onDidChangeNewSessionWorkspaceCatalog = this._register(new Emitter<void>());
	readonly onDidChangeNewSessionWorkspaceCatalog = this._onDidChangeNewSessionWorkspaceCatalog.event;
	private readonly sessionWorkspaceFallback: SessionWorkspaceFallback;
	private readonly localBrowseAction: ISessionWorkspaceBrowseAction = {
		label: localize('omniSessionRouting.selectLocalWorkspace', "Select..."),
		group: SESSION_WORKSPACE_GROUP_LOCAL,
		icon: Codicon.folderOpened,
		providerId: '',
		run: async () => undefined,
	};

	constructor(
		private readonly sessionsManagementService: ISessionsManagementService,
		private readonly sessionsService: ISessionsService,
		private readonly chatSessionsService: IChatSessionsService,
		private readonly sessionsProvidersService: ISessionsProvidersService,
		private readonly recentWorkspacesService: ISessionsRecentWorkspacesService,
		private readonly configurationService: IConfigurationService,
		private readonly fileDialogService: IFileDialogService,
		fileService: IFileService,
		uriIdentityService: IUriIdentityService,
		private readonly logService: ILogService,
		private readonly notificationService: INotificationService,
	) {
		super();
		this.sessionWorkspaceFallback = this._register(new SessionWorkspaceFallback({
			canUseProvider: () => true,
			isProviderUnavailable: providerId => this._isProviderUnavailable(providerId),
			resolveWorkspace: (folderUri, preferredProviderId) => this._resolveWorkspace(folderUri, preferredProviderId),
		}, this.sessionsProvidersService, fileService, uriIdentityService));
		this._register(this.sessionWorkspaceFallback.onDidChange(() => this._onDidChangeNewSessionWorkspaceCatalog.fire()));
		this._refreshSessions();
		this._register(this.sessionsManagementService.onDidChangeSessions(() => {
			this._refreshSessions();
			this._onDidChangeSessions.fire();
		}));
		this._register(this.sessionsManagementService.onDidReplaceSession(({ from, to }) => {
			this.sessionResourceAliases.set(from.resource.toString(), to.resource);
			this.sessionResourceAliases.set(from.mainChat.get().resource.toString(), to.mainChat.get().resource);
			this._refreshSessions();
			this._onDidChangeSessions.fire();
		}));
		this._register(this.sessionsManagementService.onDidChangeSessionTypes(() => {
			this._refreshSessions();
			this._onDidChangeSessions.fire();
			this._onDidChangeNewSessionWorkspaceCatalog.fire();
		}));
		this._register(this.sessionsProvidersService.onDidChangeProviders(() => {
			this.sessionWorkspaceFallback.refreshProviders();
			this._onDidChangeNewSessionWorkspaceCatalog.fire();
		}));
		this._register(this.recentWorkspacesService.onDidChangeRecentWorkspaces(() => this._onDidChangeNewSessionWorkspaceCatalog.fire()));
		this._register(this.configurationService.onDidChangeConfiguration(event => {
			if (event.affectsConfiguration(RemoteAgentHostsEnabledSettingId)) {
				this._onDidChangeNewSessionWorkspaceCatalog.fire();
			}
		}));
	}

	getCandidateSessions(token: CancellationToken): readonly IRoutableSession[] {
		if (token.isCancellationRequested) {
			return [];
		}
		this._refreshSessions();
		return [...this.sessions.values()].map(session => this._toCandidate(session));
	}

	async getSessionSnapshot(resource: URI, token: CancellationToken): Promise<IRoutableSession | undefined> {
		if (token.isCancellationRequested) {
			return undefined;
		}
		const target = this._resolveTarget(this._resolveSessionResourceAlias(resource).toString());
		if (!target) {
			return undefined;
		}

		const candidate = this._toCandidate(target.session);
		try {
			const history = await this.chatSessionsService.getChatSessionHistory(target.chat.resource, token);
			return token.isCancellationRequested ? undefined : this._withHistory(candidate, history);
		} catch (error) {
			if (!isCancellationError(error) && !token.isCancellationRequested) {
				this.logService.trace('[omniSessionRouting] Failed to read session response preview', error);
			}
			return token.isCancellationRequested ? undefined : candidate;
		}
	}

	watchSession(resource: URI, listener: () => void): IDisposable {
		const store = new DisposableStore();
		const observableWatcher = store.add(new MutableDisposable<IDisposable>());
		let watchedSession: ISession | undefined;
		let watchedChat: IChat | undefined;
		const bind = () => {
			const target = this._resolveTarget(this._resolveSessionResourceAlias(resource).toString());
			if (target?.session === watchedSession && target?.chat === watchedChat) {
				return;
			}
			watchedSession = target?.session;
			watchedChat = target?.chat;
			const session = target?.session;
			observableWatcher.value = session ? autorun(reader => {
				session.title.read(reader);
				session.status.read(reader);
				session.updatedAt.read(reader);
				session.lastTurnEnd.read(reader);
				listener();
			}) : undefined;
		};
		store.add(this.onDidChangeSessions(bind));
		bind();
		return store;
	}

	async getNewSessionWorkspaceCatalog(): Promise<IChatSessionRoutingWorkspaceCatalog> {
		const providers = this.sessionsProvidersService.getProviders();
		const catalog = buildSessionWorkspacePickerCatalog({
			providers,
			recentWorkspaces: this.recentWorkspacesService.getRecentWorkspaces(),
			ownRecentWorkspaces: this.recentWorkspacesService.getRecentWorkspaces(false),
			localBrowseAction: providers.some(provider => provider.supportsLocalWorkspaces) ? this.localBrowseAction : undefined,
			remoteAgentHostsEnabled: this.configurationService.getValue<boolean>(RemoteAgentHostsEnabledSettingId),
			isProviderUnavailable: providerId => this._isProviderUnavailable(providerId),
		});
		const defaultWorkspace = catalog.defaultWorkspace ?? await this.sessionWorkspaceFallback.findWorkspace();
		return {
			groups: catalog.tabs.map(tab => ({
				id: tab.id,
				label: tab.label,
				tooltip: tab.tooltip,
				icon: tab.icon,
			})),
			workspaces: catalog.workspaces.map(recent => this._toRoutingWorkspace(recent.workspace, recent.providerId)),
			browseActions: catalog.browseActions.map(action => ({
				id: this._getBrowseActionId(action),
				providerId: action.providerId || undefined,
				group: action.group,
				label: localize('omniSessionRouting.selectWorkspace', "Select..."),
				description: action.description,
				icon: action.icon,
				disabled: !!action.providerId && this._isProviderUnavailable(action.providerId),
			})),
			defaultWorkspace: defaultWorkspace
				? this._toRoutingWorkspace(defaultWorkspace.workspace, defaultWorkspace.providerId)
				: undefined,
		};
	}

	selectNewSessionWorkspace(workspace: IChatSessionRoutingWorkspace): void {
		const provider = this.sessionsProvidersService.getProvider(workspace.providerId);
		if (!provider?.resolveWorkspace(workspace.uri)) {
			throw new Error(localize('omniSessionRouting.workspaceProviderUnavailable', "The selected workspace provider is no longer available."));
		}
		this.recentWorkspacesService.addRecentWorkspace(workspace.uri, workspace.providerId, true);
	}

	async browseNewSessionWorkspace(actionId: string, token: CancellationToken): Promise<IChatSessionRoutingWorkspace | undefined> {
		if (token.isCancellationRequested) {
			return undefined;
		}
		try {
			if (actionId === 'local') {
				return await this._browseForLocalWorkspace(token);
			}
			const action = this._findBrowseAction(actionId);
			if (!action) {
				throw new Error(localize('omniSessionRouting.workspaceBrowseUnavailable', "The selected workspace browser is no longer available."));
			}
			const workspace = await action.run();
			if (!workspace || token.isCancellationRequested) {
				return undefined;
			}
			const folderUri = workspace.folders[0]?.root;
			const provider = this.sessionsProvidersService.getProvider(action.providerId);
			if (!folderUri || !provider?.resolveWorkspace(folderUri)) {
				throw new Error(localize('omniSessionRouting.workspaceProviderUnavailable', "The selected workspace provider is no longer available."));
			}
			return this._toRoutingWorkspace(workspace, action.providerId);
		} catch (error) {
			if (!isCancellationError(error) && !token.isCancellationRequested) {
				this.logService.error('[omniSessionRouting] Failed to browse for a workspace', error);
				this.notificationService.error(localize('omniSessionRouting.workspaceBrowseFailed', "Unable to select a workspace."));
			}
			return undefined;
		}
	}

	resolveSessionResource(sessionId: string): URI | undefined {
		return this._resolveTarget(sessionId)?.chat.resource;
	}

	async dispatchToSession(sessionId: string, message: string, options: IChatSendRequestOptions, token: CancellationToken): Promise<IChatSessionRoutingDispatchResult> {
		if (token.isCancellationRequested) {
			return this._cancelled();
		}
		const target = this._resolveTarget(sessionId);
		if (!target) {
			return {
				status: 'rejected',
				reasonCode: 'providerRemoved',
				reason: localize('omniSessionRouting.sessionUnavailable', "The selected session is no longer available."),
			};
		}
		const unsupported = this._getUnsupportedOptions(options);
		if (unsupported) {
			return unsupported;
		}

		try {
			const activityBaseline = target.session.lastTurnEnd.get()?.getTime() ?? target.session.updatedAt.get().getTime();
			await this.sessionsManagementService.sendRequest(target.session, target.chat, {
				query: message,
				attachedContext: options.attachedContext?.length ? [...options.attachedContext] : undefined,
				background: true,
			});
			return { status: 'sent', resource: target.chat.resource, activityBaseline };
		} catch (error) {
			return this._toRejectedResult(error, target.chat.resource);
		}
	}

	async dispatchToNewSession(target: IChatSessionRoutingNewSessionTarget, message: string, options: IChatSendRequestOptions, token: CancellationToken): Promise<IChatSessionRoutingDispatchResult> {
		if (token.isCancellationRequested) {
			return this._cancelled();
		}
		const unsupported = this._getUnsupportedOptions(options);
		if (unsupported) {
			return unsupported;
		}

		const sendOptions: ISendRequestOptions = {
			query: message,
			attachedContext: options.attachedContext?.length ? [...options.attachedContext] : undefined,
			background: true,
		};
		if (target.providerId) {
			const provider = this.sessionsProvidersService.getProvider(target.providerId);
			const canCreate = target.folder ? !!provider?.resolveWorkspace(target.folder) : !!provider?.supportsQuickChats;
			if (!canCreate) {
				return {
					status: 'rejected',
					reasonCode: 'providerRemoved',
					reason: localize('omniSessionRouting.workspaceProviderUnavailable', "The selected workspace provider is no longer available."),
				};
			}
		}
		const createOptions = this._toCreateOptions(options, target.providerId);
		try {
			const session = target.folder
				? await this.sessionsManagementService.createAndSendNewChatRequest(target.folder, sendOptions, createOptions, token)
				: await this.sessionsManagementService.createAndSendQuickChatRequest(sendOptions, createOptions, token);
			if (!session) {
				return {
					status: 'rejected',
					reasonCode: 'providerRemoved',
					reason: localize('omniSessionRouting.sessionNotCreated', "The Sessions provider could not create the new session."),
				};
			}
			return { status: 'sent', resource: session.mainChat.get().resource, activityBaseline: session.createdAt.getTime() };
		} catch (error) {
			return this._toRejectedResult(error);
		}
	}

	revealSession(resource: URI): Promise<void> {
		const resolved = this._resolveSessionResourceAlias(resource);
		return this.sessionsService.openSession(this._resolveTarget(resolved.toString())?.session.resource ?? resolved);
	}

	private _resolveSessionResourceAlias(resource: URI): URI {
		let resolved = resource;
		const visited = new Set<string>();
		while (!visited.has(resolved.toString())) {
			visited.add(resolved.toString());
			const replacement = this.sessionResourceAliases.get(resolved.toString());
			if (!replacement) {
				break;
			}
			resolved = replacement;
		}
		return resolved;
	}

	private _refreshSessions(): void {
		this.sessions.clear();
		for (const session of this.sessionsManagementService.getSessions()) {
			if (this._getRoutableChat(session)) {
				this.sessions.set(session.sessionId, session);
			}
		}
	}

	private _toRoutingWorkspace(workspace: ISessionWorkspace, providerId: string): IChatSessionRoutingWorkspace {
		const folderUri = workspace.folders[0]?.root ?? workspace.uri;
		return {
			uri: folderUri,
			providerId,
			group: workspace.group,
			label: workspace.label,
			description: workspace.description,
			icon: workspace.icon,
			disabled: this._isProviderUnavailable(providerId),
		};
	}

	private _resolveWorkspace(folderUri: URI, preferredProviderId?: string): { readonly providerId: string; readonly workspace: ISessionWorkspace } | undefined {
		if (preferredProviderId) {
			const provider = this.sessionsProvidersService.getProvider(preferredProviderId);
			const workspace = provider?.resolveWorkspace(folderUri);
			if (workspace) {
				return { providerId: preferredProviderId, workspace };
			}
		}
		for (const provider of this.sessionsProvidersService.getProviders()) {
			const workspace = provider.resolveWorkspace(folderUri);
			if (workspace) {
				return { providerId: provider.id, workspace };
			}
		}
		return undefined;
	}

	private _getBrowseActionId(action: ISessionWorkspaceBrowseAction): string {
		if (action === this.localBrowseAction) {
			return 'local';
		}
		const provider = this.sessionsProvidersService.getProvider(action.providerId);
		const index = provider?.browseActions.indexOf(action) ?? -1;
		return `provider:${encodeURIComponent(action.providerId)}:${index}`;
	}

	private _findBrowseAction(actionId: string): ISessionWorkspaceBrowseAction | undefined {
		for (const provider of this.sessionsProvidersService.getProviders()) {
			for (let index = 0; index < provider.browseActions.length; index++) {
				const action = provider.browseActions[index];
				if (actionId === `provider:${encodeURIComponent(provider.id)}:${index}`) {
					return action;
				}
			}
		}
		return undefined;
	}

	private async _browseForLocalWorkspace(token: CancellationToken): Promise<IChatSessionRoutingWorkspace | undefined> {
		const providers = this.sessionsProvidersService.getProviders().filter(provider => provider.supportsLocalWorkspaces);
		if (!providers.length) {
			throw new Error(localize('omniSessionRouting.localWorkspaceProviderUnavailable', "No local workspace provider is available."));
		}
		const selected = await this.fileDialogService.showOpenDialog({
			canSelectFolders: true,
			canSelectFiles: false,
			canSelectMany: false,
		});
		if (!selected?.length || token.isCancellationRequested) {
			return undefined;
		}
		for (const provider of providers) {
			const workspace = provider.resolveWorkspace(selected[0]);
			if (workspace) {
				return this._toRoutingWorkspace(workspace, provider.id);
			}
		}
		throw new Error(localize('omniSessionRouting.localWorkspaceUnsupported', "No Sessions provider can use the selected folder."));
	}

	private _isProviderUnavailable(providerId: string): boolean {
		const provider = this.sessionsProvidersService.getProvider(providerId);
		if (!provider || !isAgentHostProvider(provider) || !provider.connectionStatus) {
			return false;
		}
		const status = provider.connectionStatus.get();
		return RemoteAgentHostConnectionStatus.isIncompatible(status)
			|| (!RemoteAgentHostConnectionStatus.isConnected(status) && !provider.canConnectOnDemand);
	}

	private _resolveTarget(sessionId: string): ISessionRoutingTarget | undefined {
		this._refreshSessions();
		const session = this.sessions.get(sessionId) ?? this._findSessionByResource(sessionId);
		if (!session) {
			return undefined;
		}
		const chat = this._findChatByResource(session, sessionId) ?? this._getRoutableChat(session);
		return chat ? { session, chat } : undefined;
	}

	private _findSessionByResource(value: string): ISession | undefined {
		let resource: URI;
		try {
			resource = URI.parse(value);
		} catch {
			return undefined;
		}
		const session = this.sessionsManagementService.getSession(resource)
			?? this.sessionsManagementService.getSessionForChatResource(resource)?.session;
		return session && this.sessions.has(session.sessionId) ? session : undefined;
	}

	private _findChatByResource(session: ISession, value: string): IChat | undefined {
		return session.chats.get().find(chat => chat.resource.toString() === value && this._isRoutableChat(chat));
	}

	private _getRoutableChat(session: ISession): IChat | undefined {
		if (session.status.get() === SessionStatus.Untitled
			|| session.isArchived.get()
			|| session.isAutomation?.get()) {
			return undefined;
		}
		const mainChat = session.mainChat.get();
		if (this._isRoutableChat(mainChat)) {
			return mainChat;
		}
		return [...session.chats.get()]
			.filter(chat => this._isRoutableChat(chat))
			.sort((a, b) => b.updatedAt.get().getTime() - a.updatedAt.get().getTime())[0];
	}

	private _isRoutableChat(chat: IChat): boolean {
		return chat.status.get() !== SessionStatus.Untitled
			&& !chat.isArchived.get()
			&& chat.interactivity.get() === ChatInteractivity.Full;
	}

	private _toCandidate(session: ISession): IRoutableSession {
		const workspace = session.workspace.get();
		const folder = workspace?.folders[0];
		const gitHubInfo = folder?.gitRepository?.gitHubInfo.get();
		return {
			sessionId: session.sessionId,
			resource: session.resource,
			label: session.title.get(),
			repo: gitHubInfo ? `${gitHubInfo.owner}/${gitHubInfo.repo}` : undefined,
			cwd: folder?.workingDirectory.path,
			status: this._statusToString(session.status.get()),
			lastActivity: session.lastTurnEnd.get()?.getTime() ?? session.updatedAt.get().getTime(),
			description: this._markdownToText(session.description.get()),
		};
	}

	private _withHistory(candidate: IRoutableSession, history: readonly IChatSessionHistoryItem[]): IRoutableSession {
		let lastResponse: string | undefined;
		for (const item of history) {
			if (item.type !== 'response') {
				continue;
			}
			for (let index = item.parts.length - 1; index >= 0; index--) {
				const part = item.parts[index];
				if (part.kind === 'markdownContent' && part.content.value.trim()) {
					lastResponse = part.content.value.trim().slice(0, ROUTER_FIELD_CLIP_LENGTH * 2);
					break;
				}
			}
		}
		return lastResponse ? { ...candidate, lastResponse } : candidate;
	}

	private _statusToString(status: SessionStatus): string {
		switch (status) {
			case SessionStatus.InProgress: return 'working';
			case SessionStatus.NeedsInput: return 'needsInput';
			case SessionStatus.Completed: return 'idle';
			case SessionStatus.Error: return 'failed';
			case SessionStatus.Untitled: return 'draft';
		}
	}

	private _markdownToText(value: IMarkdownString | undefined): string | undefined {
		const text = value?.value.trim();
		return text || undefined;
	}

	private _getUnsupportedOptions(options: IChatSendRequestOptions): IChatSessionRoutingDispatchResult | undefined {
		// The chat widget snapshots every default-enabled tool as `true`. Sessions
		// providers own that default tool set, so only an actual disabled-tool
		// override is unsupported and must be rejected rather than dropped.
		if (options.userSelectedTools && Object.values(options.userSelectedTools.get()).some(enabled => !enabled)) {
			return this._unsupported(localize('omniSessionRouting.toolsUnsupported', "The selected tool configuration cannot be sent through Sessions."));
		}
		if (options.resolvedVariables?.length) {
			return this._unsupported(localize('omniSessionRouting.variablesUnsupported', "Resolved request variables cannot be sent through Sessions."));
		}
		if (options.agentHostSessionConfig && Object.keys(options.agentHostSessionConfig).length) {
			return this._unsupported(localize('omniSessionRouting.sessionConfigurationUnsupported', "The selected Agent Host session configuration cannot be sent through Sessions."));
		}
		return undefined;
	}

	private _toCreateOptions(options: IChatSendRequestOptions, providerId?: string): ICreateNewSessionOptions | undefined {
		const modeId = options.modeInfo?.modeInstructions?.uri?.toString()
			?? options.modeInfo?.modeInstructions?.name
			?? options.modeInfo?.kind;
		const createOptions: ICreateNewSessionOptions = {
			providerId,
			modelId: options.userSelectedModelId,
			modeId,
			permissionLevel: options.modeInfo?.permissionLevel,
		};
		return createOptions.providerId || createOptions.modelId || createOptions.modeId || createOptions.permissionLevel ? createOptions : undefined;
	}

	private _unsupported(reason: string): IChatSessionRoutingDispatchResult {
		return { status: 'rejected', reasonCode: 'unsupportedOptions', reason };
	}

	private _cancelled(resource?: URI): IChatSessionRoutingDispatchResult {
		return {
			status: 'rejected',
			resource,
			reasonCode: 'cancelled',
			reason: localize('omniSessionRouting.cancelled', "The request was cancelled."),
		};
	}

	private _toRejectedResult(error: unknown, resource?: URI): IChatSessionRoutingDispatchResult {
		if (isCancellationError(error)) {
			return this._cancelled(resource);
		}
		if (error instanceof WorkspaceNotTrustedError) {
			return {
				status: 'rejected',
				resource,
				reasonCode: 'workspaceNotTrusted',
				reason: localize('omniSessionRouting.workspaceNotTrusted', "The selected workspace or folder is not trusted."),
			};
		}
		return { status: 'rejected', resource, reason: getErrorMessage(error) };
	}
}

class OmniSessionRoutingContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.omniSessionRouting';

	constructor(
		@IChatSessionRoutingProviderService routingProviderService: IChatSessionRoutingProviderService,
		@ISessionsManagementService sessionsManagementService: ISessionsManagementService,
		@ISessionsService sessionsService: ISessionsService,
		@IChatSessionsService chatSessionsService: IChatSessionsService,
		@ISessionsProvidersService sessionsProvidersService: ISessionsProvidersService,
		@ISessionsRecentWorkspacesService recentWorkspacesService: ISessionsRecentWorkspacesService,
		@IConfigurationService configurationService: IConfigurationService,
		@IFileDialogService fileDialogService: IFileDialogService,
		@IFileService fileService: IFileService,
		@IUriIdentityService uriIdentityService: IUriIdentityService,
		@ILogService logService: ILogService,
		@INotificationService notificationService: INotificationService,
	) {
		super();
		const adapter = this._register(new OmniSessionRoutingAdapter(
			sessionsManagementService,
			sessionsService,
			chatSessionsService,
			sessionsProvidersService,
			recentWorkspacesService,
			configurationService,
			fileDialogService,
			fileService,
			uriIdentityService,
			logService,
			notificationService,
		));
		this._register(routingProviderService.registerProvider(adapter));
	}
}

registerWorkbenchContribution2(OmniSessionRoutingContribution.ID, OmniSessionRoutingContribution, WorkbenchPhase.BlockRestore);
