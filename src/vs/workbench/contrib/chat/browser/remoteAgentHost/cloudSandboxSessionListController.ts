/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { Emitter } from '../../../../../base/common/event.js';
import { Disposable, DisposableStore, MutableDisposable } from '../../../../../base/common/lifecycle.js';
import { ResourceSet } from '../../../../../base/common/map.js';
import { Schemas } from '../../../../../base/common/network.js';
import { autorun, derived, IObservable, observableSignalFromEvent, observableValue, transaction } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { AgentSession, IAgentConnection, IAgentSessionMetadata } from '../../../../../platform/agentHost/common/agentService.js';
import { agentHostAuthority, fromAgentHostUri } from '../../../../../platform/agentHost/common/agentHostUri.js';
import { remoteAgentHostSessionTypeId } from '../../../../../platform/agentHost/common/agentHostSessionType.js';
import { CLOUD_SANDBOX_AGENT_PROVIDER, CLOUD_SANDBOX_SESSION_SCHEME } from '../../../../../platform/agentHost/common/cloudSandboxAgentHost.js';
import { RemoteAgentHostConnectionStatus } from '../../../../../platform/agentHost/common/remoteAgentHostService.js';
import { INotification } from '../../../../../platform/agentHost/common/state/sessionActions.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { getGitHubRepositoryFromRemoteUrl } from '../../../git/common/utils.js';
import { IChatSessionItem, IChatSessionItemController, IChatSessionItemsDelta } from '../../common/chatSessionsService.js';
import { AgentHostSessionListController } from '../agentSessions/agentHost/agentHostSessionListController.js';
import { AgentHostSessionListStore } from '../agentSessions/agentHost/agentHostSessionListStore.js';
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

	constructor(
		address: string,
		workspaceRepositories: IObservable<ReadonlySet<string> | undefined>,
		@IInstantiationService instantiationService: IInstantiationService,
		@IRemoteAgentHostAuthenticationService authenticationService: IRemoteAgentHostAuthenticationService,
	) {
		super();
		const authority = agentHostAuthority(address);
		this._authenticationPending = this._register(authenticationService.acquire(address)).object;
		this.sessionType = remoteAgentHostSessionTypeId(authority, CLOUD_SANDBOX_AGENT_PROVIDER);
		this._sessionListStore = this._register(instantiationService.createInstance(AgentHostSessionListStore, {
			onDidNotification: this._notifications.event,
			listSessions: () => this._requireConnection().listSessions(),
			disposeSession: session => this._requireConnection().disposeSession(session),
			dispatch: (channel, action) => this._requireConnection().dispatch(channel, action),
		}, {
			filterToWorkspace: false,
			sessionSchemeAlias: { ui: CLOUD_SANDBOX_AGENT_PROVIDER, backend: CLOUD_SANDBOX_SESSION_SCHEME },
		}));
		this._controller = this._register(instantiationService.createInstance(AgentHostSessionListController,
			this.sessionType, CLOUD_SANDBOX_AGENT_PROVIDER, this._sessionListStore,
			'', authority));
		const sessionsChanged = observableSignalFromEvent(this, this._controller.onDidChangeChatSessionItems);
		this._items = derived(this, reader => {
			sessionsChanged.read(reader);
			const repositories = workspaceRepositories.read(reader);
			const discoveredRepositories = this._discoveredRepositories.read(reader);
			const connected = !!this._connection.read(reader);
			const visibleSessions = repositories && new Set(this._sessionListStore.getSessions(CLOUD_SANDBOX_AGENT_PROVIDER).filter(entry => {
				const projectUri = entry.summary.project?.uri;
				const project = projectUri ? getGitHubRepositoryFromRemoteUrl(projectUri) : undefined;
				const repository = project
					? `${project.owner}/${project.repo}`.toLowerCase()
					: !projectUri || fromAgentHostUri(URI.parse(projectUri)).scheme === Schemas.file
						? discoveredRepositories.get(entry.rawId)?.repository
						: undefined;
				return repository !== undefined && repositories.has(repository);
			}).map(entry => entry.rawId));
			return this._controller.items
				.filter(item => !visibleSessions || visibleSessions.has(AgentSession.id(item.resource)))
				.map(item => this._listItem(item, connected));
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
		const entry = this._sessionListStore.getSessions(CLOUD_SANDBOX_AGENT_PROVIDER).find(entry => entry.rawId === rawId);
		return entry ? Date.parse(entry.summary.modifiedAt) : undefined;
	}

	seedSessions(sessions: readonly IAgentSessionMetadata[]): void {
		transaction(tx => {
			const repositories = new Map(this._discoveredRepositories.get());
			for (const session of sessions) {
				const rawId = AgentSession.id(session.session);
				const project = session.project ? getGitHubRepositoryFromRemoteUrl(session.project.uri.toString()) : undefined;
				if (session.modifiedTime >= (repositories.get(rawId)?.modifiedTime ?? 0)) {
					repositories.set(rawId, { repository: project ? `${project.owner}/${project.repo}`.toLowerCase() : undefined, modifiedTime: session.modifiedTime });
				}
			}
			// Host filesystem paths cannot replace discovery's repository identity for workspace matching.
			this._discoveredRepositories.set(repositories, tx);
			if (!this._connection.get()) {
				this._sessionListStore.seedSessions(sessions);
			}
		});
	}

	setConnection(connection: IAgentConnection): void {
		if (this._connection.get() === connection && RemoteAgentHostConnectionStatus.isConnected(this.connectionStatus.get())) {
			return;
		}
		const store = new DisposableStore();
		this._connectionStore.value = store;
		store.add(connection.onDidNotification(notification => this._notifications.fire(notification)));
		this._connection.set(connection, undefined);
		void this.refresh(CancellationToken.None);
	}

	setConnectionStatus(status: RemoteAgentHostConnectionStatus): void {
		this.connectionStatus.set(status, undefined);
		if (this._connection.get() && (RemoteAgentHostConnectionStatus.isDisconnected(status) || RemoteAgentHostConnectionStatus.isIncompatible(status))) {
			this._connectionStore.clear();
			this._connection.set(undefined, undefined);
		}
	}

	resolveWorkingDirectory(resource: URI): URI | undefined {
		const entry = this._sessionListStore.getSessions(CLOUD_SANDBOX_AGENT_PROVIDER).find(entry => entry.rawId === AgentSession.id(resource));
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

	private _listItem(item: IChatSessionItem, connected: boolean): IChatSessionItem {
		return {
			...item,
			iconPath: Codicon.cloud,
			...(!connected || item.isRead === undefined ? { archived: undefined, isRead: undefined } : {}),
		};
	}

	private _requireConnection(): IAgentConnection {
		const connection = this._connection.get();
		if (!connection) {
			throw new Error('The cloud sandbox is not connected.');
		}
		return connection;
	}
}
