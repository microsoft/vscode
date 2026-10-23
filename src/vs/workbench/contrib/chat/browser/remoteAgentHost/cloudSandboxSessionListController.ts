/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Sequencer } from '../../../../../base/common/async.js';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { toErrorMessage } from '../../../../../base/common/errorMessage.js';
import { Emitter } from '../../../../../base/common/event.js';
import { CancellationError, isCancellationError } from '../../../../../base/common/errors.js';
import { Disposable, DisposableStore, MutableDisposable } from '../../../../../base/common/lifecycle.js';
import { ResourceSet } from '../../../../../base/common/map.js';
import { Schemas } from '../../../../../base/common/network.js';
import { autorun, derived, IObservable, observableSignalFromEvent, observableValue, transaction } from '../../../../../base/common/observable.js';
import { getComparisonKey, isEqual } from '../../../../../base/common/resources.js';
import { URI } from '../../../../../base/common/uri.js';
import { localize } from '../../../../../nls.js';
import { AgentSession, IAgentConnection, IAgentSessionMetadata } from '../../../../../platform/agentHost/common/agentService.js';
import { agentHostAuthority, fromAgentHostUri } from '../../../../../platform/agentHost/common/agentHostUri.js';
import { remoteAgentHostSessionTypeId } from '../../../../../platform/agentHost/common/agentHostSessionType.js';
import { CLOUD_SANDBOX_AGENT_PROVIDER, CLOUD_SANDBOX_SESSION_SCHEME, isCloudSandboxPlaceholderTitle } from '../../../../../platform/agentHost/common/cloudSandboxAgentHost.js';
import { RemoteAgentHostConnectionStatus } from '../../../../../platform/agentHost/common/remoteAgentHostService.js';
import { INotification } from '../../../../../platform/agentHost/common/state/sessionActions.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { INotificationService } from '../../../../../platform/notification/common/notification.js';
import { getGitHubRepositoryFromRemoteUrl } from '../../../git/common/utils.js';
import { IChatSessionItem, IChatSessionItemController, IChatSessionItemsDelta } from '../../common/chatSessionsService.js';
import { getAgentHostSessionResource } from '../../common/constants.js';
import { AgentHostSessionListController } from '../agentSessions/agentHost/agentHostSessionListController.js';
import { AgentHostSessionListStore } from '../agentSessions/agentHost/agentHostSessionListStore.js';
import { RequestedWorkingDirectory } from '../agentSessions/agentHost/agentHostSessionWorkingDirectoryResolver.js';
import { ICloudSandboxSessionList } from './cloudSandboxSessionContribution.js';
import { IRemoteAgentHostAuthenticationService } from './remoteAgentHostAuthentication.js';

export class CloudSandboxSessionListController extends Disposable implements ICloudSandboxSessionList, IChatSessionItemController {
	readonly sessionType: string;
	readonly connectionStatus = observableValue<RemoteAgentHostConnectionStatus>(this, RemoteAgentHostConnectionStatus.disconnected);
	private readonly _onDidChangeChatSessionItems = this._register(new Emitter<IChatSessionItemsDelta>());
	readonly onDidChangeChatSessionItems = this._onDidChangeChatSessionItems.event;

	private readonly _notifications = this._register(new Emitter<INotification>());
	private readonly _connectionStore = this._register(new MutableDisposable<DisposableStore>());
	private readonly _sessionListStore: AgentHostSessionListStore;
	private readonly _controller: AgentHostSessionListController;
	private readonly _authenticationPending: IObservable<boolean>;
	private readonly _connection = observableValue<IAgentConnection | undefined>(this, undefined);
	private readonly _discoveredRepositories = observableValue<ReadonlyMap<string, { readonly repository: string | undefined; readonly modifiedTime: number }>>(this, new Map());
	private readonly _items: IObservable<readonly IChatSessionItem[]>;
	private readonly _archivedStates = observableValue<ReadonlyMap<string, boolean>>(this, new Map());
	private readonly _archiveSequencer = new Sequencer();
	/** Repository requested for sessions this window provisioned, keyed by raw session id. */
	private readonly _provisionalRepositories = new Map<string, string | undefined>();
	/** Configuration chosen on the draft of a session this window provisioned, keyed by raw session id. */
	private readonly _provisionalSessionConfigs = new Map<string, Record<string, unknown>>();

	constructor(
		address: string,
		workspaceRepositories: IObservable<ReadonlySet<string> | undefined>,
		ownsSession: (rawId: string) => boolean,
		private readonly _deleteSession: (rawId: string, token: CancellationToken) => Promise<boolean>,
		private readonly _archiveSession: (rawId: string, archived: boolean, token: CancellationToken) => Promise<boolean>,
		@IInstantiationService instantiationService: IInstantiationService,
		@IRemoteAgentHostAuthenticationService authenticationService: IRemoteAgentHostAuthenticationService,
		@INotificationService private readonly _notificationService: INotificationService,
	) {
		super();
		const authority = agentHostAuthority(address);
		this._authenticationPending = this._register(authenticationService.acquire(address)).object;
		this.sessionType = remoteAgentHostSessionTypeId(authority, CLOUD_SANDBOX_AGENT_PROVIDER);
		this._sessionListStore = this._register(instantiationService.createInstance(AgentHostSessionListStore, {
			onDidNotification: this._notifications.event,
			listSessions: async () => (await this._requireConnection().listSessions()).map(session => this._withListedTitle(session)),
			disposeChat: chat => this._requireConnection().disposeChat(chat),
			disposeSession: session => this._requireConnection().disposeSession(session),
			dispatch: (channel, action) => this._requireConnection().dispatch(channel, action),
		}, {
			filterToWorkspace: false,
			connectionAuthority: authority,
			sessionSchemeAlias: { ui: CLOUD_SANDBOX_AGENT_PROVIDER, backend: CLOUD_SANDBOX_SESSION_SCHEME },
			retainSession: session => isEqual(session, AgentSession.uri(CLOUD_SANDBOX_SESSION_SCHEME, AgentSession.id(session))) && ownsSession(AgentSession.id(session)),
		}));
		this._controller = this._register(instantiationService.createInstance(AgentHostSessionListController,
			this.sessionType, CLOUD_SANDBOX_AGENT_PROVIDER, this._sessionListStore,
			'', authority, true));
		const sessionsChanged = observableSignalFromEvent(this, this._controller.onDidChangeChatSessionItems);
		this._items = derived(this, reader => {
			sessionsChanged.read(reader);
			const repositories = workspaceRepositories.read(reader);
			const discoveredRepositories = this._discoveredRepositories.read(reader);
			const connected = !!this._connection.read(reader);
			const archivedStates = this._archivedStates.read(reader);
			const visibleSessions = repositories && new ResourceSet(this._sessionListStore.getSessions(CLOUD_SANDBOX_AGENT_PROVIDER).filter(entry => {
				const projectUri = entry.summary.project?.uri;
				const project = projectUri ? getGitHubRepositoryFromRemoteUrl(projectUri) : undefined;
				const repository = project
					? `${project.owner}/${project.repo}`.toLowerCase()
					: !projectUri || fromAgentHostUri(URI.parse(projectUri)).scheme === Schemas.file
						? discoveredRepositories.get(getComparisonKey(URI.parse(entry.summary.resource)))?.repository
						: undefined;
				return repository !== undefined && repositories.has(repository);
			}).map(entry => this._sessionListStore.getSessionResource(URI.parse(entry.summary.resource))));
			return this._controller.items
				.filter(item => !visibleSessions || visibleSessions.has(item.resource))
				.map(item => this._listItem(item, connected, archivedStates));
		});
		let previousResources = new ResourceSet();
		this._register(autorun(reader => {
			const items = this._items.read(reader);
			const resources = new ResourceSet(items.map(item => item.resource));
			const removed = [...previousResources].filter(resource => !resources.has(resource));
			previousResources = resources;
			if (items.length || removed.length) {
				this._onDidChangeChatSessionItems.fire({
					...(items.length ? { addedOrUpdated: items } : {}),
					...(removed.length ? { removed } : {}),
				});
			}
		}));
		this._register(autorun(reader => {
			if (!this._authenticationPending.read(reader)) {
				void this.refresh(CancellationToken.None);
			}
		}));
	}

	get items(): readonly IChatSessionItem[] {
		return this._items.get();
	}

	get terminalCommandPrefix(): string | undefined {
		return this._connection.get()?.initializeResult.get()?.terminalCommandPrefix;
	}

	getSessionModifiedTime(rawId: string): number | undefined {
		const entry = this._sessionListStore.getSession(CLOUD_SANDBOX_AGENT_PROVIDER, AgentSession.uri(CLOUD_SANDBOX_SESSION_SCHEME, rawId));
		return entry ? Date.parse(entry.summary.modifiedAt) : undefined;
	}

	seedSessions(sessions: readonly IAgentSessionMetadata[]): void {
		transaction(tx => {
			const repositories = new Map(this._discoveredRepositories.get());
			for (const session of sessions) {
				const key = getComparisonKey(session.session);
				const project = session.project ? getGitHubRepositoryFromRemoteUrl(session.project.uri.toString()) : undefined;
				if (session.modifiedTime >= (repositories.get(key)?.modifiedTime ?? 0)) {
					repositories.set(key, { repository: project ? `${project.owner}/${project.repo}`.toLowerCase() : undefined, modifiedTime: session.modifiedTime });
				}
			}
			// Host filesystem paths cannot replace discovery's repository identity for workspace matching.
			this._discoveredRepositories.set(repositories, tx);
			this._sessionListStore.seedSessions(sessions);
		});
	}

	seedProvisionalSession(metadata: IAgentSessionMetadata): void {
		const rawId = AgentSession.id(metadata.session);
		const project = metadata.project ? getGitHubRepositoryFromRemoteUrl(metadata.project.uri.toString(), ['github.com']) : undefined;
		this._provisionalRepositories.set(rawId, project ? `${project.owner}/${project.repo}` : undefined);
		this._sessionListStore.addPendingNewSession(CLOUD_SANDBOX_AGENT_PROVIDER, URI.from({ scheme: this.sessionType, path: `/${rawId}` }));
		this.seedSessions([metadata]);
		this._sessionListStore.seedSessions([metadata]);
	}

	publishWithheldSession(rawId: string): void {
		// The editor lists provisioned sessions immediately; only forget the creation intent.
		this._provisionalRepositories.delete(rawId);
		this._provisionalSessionConfigs.delete(rawId);
	}

	/** Record the draft's configuration for a session seeded by {@link seedProvisionalSession}. */
	setProvisionalSessionConfig(rawId: string, config: Record<string, unknown>): void {
		if (Object.keys(config).length > 0) {
			this._provisionalSessionConfigs.set(rawId, config);
		}
	}

	getProvisionalSessionConfig(resource: URI): Record<string, unknown> | undefined {
		return this.isNewSession(resource) ? this._provisionalSessionConfigs.get(AgentSession.id(resource)) : undefined;
	}

	isNewSession(resource: URI): boolean {
		return this._controller.isNewSession(resource);
	}

	notifySessionMaterialized(resource: URI): void {
		const rawId = AgentSession.id(resource);
		this._provisionalRepositories.delete(rawId);
		this._provisionalSessionConfigs.delete(rawId);
		this._controller.notifySessionMaterialized(resource);
	}

	setConnection(connection: IAgentConnection): void {
		if (this._connection.get() === connection && RemoteAgentHostConnectionStatus.isConnected(this.connectionStatus.get())) {
			return;
		}
		const store = new DisposableStore();
		this._connectionStore.value = store;
		store.add(connection.onDidNotification(notification => this._notifications.fire(this._withListedNotificationTitle(notification))));
		this._connection.set(connection, undefined);
		void this.refresh(CancellationToken.None);
	}

	private _listedTitle(session: URI | string): string | undefined {
		return this._sessionListStore.getSession(CLOUD_SANDBOX_AGENT_PROVIDER, typeof session === 'string' ? URI.parse(session) : session)?.summary.title;
	}

	/** A placeholder title keeps the label the list already shows. */
	private _withListedTitle(session: IAgentSessionMetadata): IAgentSessionMetadata {
		if (!isCloudSandboxPlaceholderTitle(session.summary, session.session) && !session.chats?.some(chat => isCloudSandboxPlaceholderTitle(chat.summary, session.session))) {
			return session;
		}
		return {
			...session,
			summary: isCloudSandboxPlaceholderTitle(session.summary, session.session) ? this._listedTitle(session.session) : session.summary,
			chats: session.chats?.map(chat => isCloudSandboxPlaceholderTitle(chat.summary, session.session) ? { ...chat, summary: undefined } : chat),
		};
	}

	private _withListedNotificationTitle(notification: INotification): INotification {
		if (notification.type === 'root/sessionAdded') {
			const session = notification.summary.resource;
			if (!isCloudSandboxPlaceholderTitle(notification.summary.title, session) && !notification.summary.chats?.some(chat => isCloudSandboxPlaceholderTitle(chat.title, session))) {
				return notification;
			}
			return {
				...notification,
				summary: {
					...notification.summary,
					title: isCloudSandboxPlaceholderTitle(notification.summary.title, session) ? this._listedTitle(session) ?? notification.summary.title : notification.summary.title,
					chats: notification.summary.chats?.map(chat => isCloudSandboxPlaceholderTitle(chat.title, session) ? { ...chat, title: '' } : chat),
				},
			};
		}
		if (notification.type === 'root/sessionSummaryChanged') {
			const { title, chats, ...rest } = notification.changes;
			if (!isCloudSandboxPlaceholderTitle(title, notification.session) && !chats?.some(chat => isCloudSandboxPlaceholderTitle(chat.title, notification.session))) {
				return notification;
			}
			return {
				...notification,
				changes: {
					...rest,
					...(title !== undefined && !isCloudSandboxPlaceholderTitle(title, notification.session) ? { title } : {}),
					...(chats ? { chats: chats.map(chat => isCloudSandboxPlaceholderTitle(chat.title, notification.session) ? { ...chat, title: '' } : chat) } : {}),
				},
			};
		}
		return notification;
	}

	setConnectionStatus(status: RemoteAgentHostConnectionStatus): void {
		this.connectionStatus.set(status, undefined);
		if (this._connection.get() && (RemoteAgentHostConnectionStatus.isDisconnected(status) || RemoteAgentHostConnectionStatus.isIncompatible(status))) {
			this._connectionStore.clear();
			this._connection.set(undefined, undefined);
		}
	}

	resolveWorkingDirectory(resource: URI): RequestedWorkingDirectory {
		const rawId = AgentSession.id(resource);
		if (this.isNewSession(resource) && this._provisionalRepositories.has(rawId)) {
			// Session preparation clones the requested repository and yields its host directory.
			// A workspaceless sandbox explicitly leaves the choice to the host so a local
			// workspace folder is never substituted.
			const repoNwo = this._provisionalRepositories.get(rawId);
			return repoNwo ? URI.from({ scheme: Schemas.https, authority: 'github.com', path: `/${repoNwo}` }) : null;
		}
		const entries = this._sessionListStore.getSessions(CLOUD_SANDBOX_AGENT_PROVIDER);
		const findEntry = (parent: URI) => entries.find(entry => isEqual(this._sessionListStore.getSessionResource(URI.parse(entry.summary.resource)), parent));
		const entry = findEntry(resource.with({ fragment: '' })) ?? findEntry(getAgentHostSessionResource(resource));
		const directory = entry?.summary.workingDirectories?.[0];
		const connection = this._connection.get();
		return directory && connection
			? connection.resourceUris.fromAgentHost(fromAgentHostUri(URI.parse(directory)))
			: undefined;
	}

	async refresh(token: CancellationToken): Promise<void> {
		if (this._connection.get() && !this._authenticationPending.get() && !token.isCancellationRequested) {
			this._sessionListStore.resetCache();
			await this._sessionListStore.refresh(token);
		}
	}

	async deleteChatSessionItem(resource: URI, token: CancellationToken): Promise<void> {
		if (resource.scheme !== this.sessionType) {
			throw new Error(localize('cloudSandbox.deleteInvalidSession', "The session does not belong to this sandbox."));
		}
		if (!this._isInventoryResource(resource) || !await this._deleteSession(AgentSession.id(resource), token)) {
			await this._controller.deleteChatSessionItem(resource, token);
		}
	}

	removeDeletedSession(rawId: string): void {
		this._sessionListStore.removeSession(CLOUD_SANDBOX_AGENT_PROVIDER, AgentSession.uri(CLOUD_SANDBOX_SESSION_SCHEME, rawId));
	}

	setSessionArchived(rawId: string, archived: boolean): void {
		if (this._archivedStates.get().get(rawId) === archived) {
			return;
		}
		const states = new Map(this._archivedStates.get());
		states.set(rawId, archived);
		this._archivedStates.set(states, undefined);
	}

	setChatSessionItemArchived(resource: URI, archived: boolean): void {
		void this._archiveSequencer.queue(async () => {
			if (this._store.isDisposed) {
				throw new CancellationError();
			}
			if (resource.scheme !== this.sessionType || resource.fragment) {
				throw new Error(localize('cloudSandbox.archiveInvalidSession', "The session does not belong to this sandbox."));
			}
			const rawId = AgentSession.id(resource);
			if (this._isInventoryResource(resource) && await this._archiveSession(rawId, archived, CancellationToken.None)) {
				if (this._store.isDisposed) {
					throw new CancellationError();
				}
				this.setSessionArchived(rawId, archived);
			} else {
				this._requireConnection();
				this._controller.setChatSessionItemArchived(resource, archived);
			}
		}).catch(error => {
			if (!isCancellationError(error)) {
				this._notificationService.error(localize('cloudSandbox.archiveFailed', "Unable to change the sandbox session's archive state: {0}", toErrorMessage(error)));
			}
		});
	}

	private _listItem(item: IChatSessionItem, connected: boolean, archivedStates: ReadonlyMap<string, boolean>): IChatSessionItem {
		return {
			...item,
			iconPath: Codicon.cloud,
			...(!connected || item.isRead === undefined ? { archived: undefined, isRead: undefined } : {}),
			...(this._isInventoryResource(item.resource) && archivedStates.has(AgentSession.id(item.resource)) ? { archived: archivedStates.get(AgentSession.id(item.resource)) } : {}),
		};
	}

	private _isInventoryResource(resource: URI): boolean {
		return isEqual(resource, URI.from({ scheme: this.sessionType, path: resource.path }));
	}

	private _requireConnection(): IAgentConnection {
		const connection = this._connection.get();
		if (!connection) {
			throw new Error('The cloud sandbox is not connected.');
		}
		return connection;
	}
}
