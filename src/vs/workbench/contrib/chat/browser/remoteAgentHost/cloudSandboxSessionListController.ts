/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { Emitter } from '../../../../../base/common/event.js';
import { Disposable, DisposableStore, MutableDisposable } from '../../../../../base/common/lifecycle.js';
import { autorun, IObservable, observableValue } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { AgentSession, IAgentConnection, IAgentSessionMetadata } from '../../../../../platform/agentHost/common/agentService.js';
import { agentHostAuthority, fromAgentHostUri } from '../../../../../platform/agentHost/common/agentHostUri.js';
import { remoteAgentHostSessionTypeId } from '../../../../../platform/agentHost/common/agentHostSessionType.js';
import { CLOUD_SANDBOX_AGENT_PROVIDER, CLOUD_SANDBOX_SESSION_SCHEME } from '../../../../../platform/agentHost/common/cloudSandboxAgentHost.js';
import { RemoteAgentHostConnectionStatus } from '../../../../../platform/agentHost/common/remoteAgentHostService.js';
import { INotification } from '../../../../../platform/agentHost/common/state/sessionActions.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
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
	private _connection: IAgentConnection | undefined;

	constructor(
		address: string,
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
		this._register(this._controller.onDidChangeChatSessionItems(delta => {
			this._onDidChangeChatSessionItems.fire({ ...delta, addedOrUpdated: delta.addedOrUpdated?.map(item => this._listItem(item)) });
		}));
		this._register(autorun(reader => {
			if (!this._authenticationPending.read(reader)) {
				void this.refresh(CancellationToken.None);
			}
		}));
	}

	get items(): readonly IChatSessionItem[] {
		return this._controller.items.map(item => this._listItem(item));
	}

	get terminalCommandPrefix(): string | undefined {
		return this._connection?.initializeResult.get()?.terminalCommandPrefix;
	}

	getSessionModifiedTime(rawId: string): number | undefined {
		const entry = this._sessionListStore.getSessions(CLOUD_SANDBOX_AGENT_PROVIDER).find(entry => entry.rawId === rawId);
		return entry ? Date.parse(entry.summary.modifiedAt) : undefined;
	}

	seedSessions(sessions: readonly IAgentSessionMetadata[]): void {
		if (!this._connection) {
			this._sessionListStore.seedSessions(sessions);
		}
	}

	setConnection(connection: IAgentConnection): void {
		if (this._connection === connection && RemoteAgentHostConnectionStatus.isConnected(this.connectionStatus.get())) {
			return;
		}
		const wasConnected = !!this._connection;
		this._connection = connection;
		const store = new DisposableStore();
		this._connectionStore.value = store;
		store.add(connection.onDidNotification(notification => this._notifications.fire(notification)));
		if (!wasConnected) {
			this._onDidChangeChatSessionItems.fire({ addedOrUpdated: this.items });
		}
		void this.refresh(CancellationToken.None);
	}

	setConnectionStatus(status: RemoteAgentHostConnectionStatus): void {
		this.connectionStatus.set(status, undefined);
		if (this._connection && (RemoteAgentHostConnectionStatus.isDisconnected(status) || RemoteAgentHostConnectionStatus.isIncompatible(status))) {
			this._connection = undefined;
			this._connectionStore.clear();
			this._onDidChangeChatSessionItems.fire({ addedOrUpdated: this.items });
		}
	}

	resolveWorkingDirectory(resource: URI): URI | undefined {
		const entry = this._sessionListStore.getSessions(CLOUD_SANDBOX_AGENT_PROVIDER).find(entry => entry.rawId === AgentSession.id(resource));
		const directory = entry?.summary.workingDirectories?.[0];
		return directory && this._connection
			? this._connection.resourceUris.fromAgentHost(fromAgentHostUri(URI.parse(directory)))
			: undefined;
	}

	async refresh(token: CancellationToken): Promise<void> {
		if (this._connection && !this._authenticationPending.get() && !token.isCancellationRequested) {
			this._sessionListStore.resetCache();
			await this._sessionListStore.refresh(token);
		}
	}

	private _listItem(item: IChatSessionItem): IChatSessionItem {
		return {
			...item,
			iconPath: Codicon.cloud,
			...(!this._connection || item.isRead === undefined ? { archived: undefined, isRead: undefined } : {}),
		};
	}

	private _requireConnection(): IAgentConnection {
		if (!this._connection) {
			throw new Error('The cloud sandbox is not connected.');
		}
		return this._connection;
	}
}
