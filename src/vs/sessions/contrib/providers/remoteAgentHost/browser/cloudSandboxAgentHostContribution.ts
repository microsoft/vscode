/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { DisposableStore, MutableDisposable } from '../../../../../base/common/lifecycle.js';
import { Schemas } from '../../../../../base/common/network.js';
import { isWeb } from '../../../../../base/common/platform.js';
import { isEqual } from '../../../../../base/common/resources.js';
import { URI } from '../../../../../base/common/uri.js';
import { localize } from '../../../../../nls.js';
import { AgentSession } from '../../../../../platform/agentHost/common/agent.js';
import { IAgentHostService } from '../../../../../platform/agentHost/common/agentService.js';
import { ChangesetKind } from '../../../../../platform/agentHost/common/changesetUri.js';
import { CLOUD_SANDBOX_AGENT_PROVIDER, CLOUD_SANDBOX_SESSION_SCHEME, cloudSandboxAddress, ICloudSandboxAgentHostService, ICloudSandboxApiService, ICloudSandboxCreatedSession, ICloudSandboxCreateSessionRequest } from '../../../../../platform/agentHost/common/cloudSandboxAgentHost.js';
import { IRemoteAgentHostService } from '../../../../../platform/agentHost/common/remoteAgentHostService.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { IProgress } from '../../../../../platform/progress/common/progress.js';
import { IStorageService } from '../../../../../platform/storage/common/storage.js';
import { IWorkspaceTrustManagementService } from '../../../../../platform/workspace/common/workspaceTrust.js';
import { IChatSessionsService } from '../../../../../workbench/contrib/chat/common/chatSessionsService.js';
import { CloudSandboxSessionContribution, ICloudSandboxSessionEnvironment } from '../../../../../workbench/contrib/chat/browser/remoteAgentHost/cloudSandboxSessionContribution.js';
import { IRemoteAgentHostConnectionCustomizationService } from '../../../../../workbench/contrib/chat/browser/remoteAgentHost/remoteAgentHostConnectionCustomization.js';
import { IChatEntitlementService } from '../../../../../workbench/services/chat/common/chatEntitlementService.js';
import { IHostService } from '../../../../../workbench/services/host/browser/host.js';
import { IAgentHostConnectionLabels, IAgentHostGroup } from '../../../../common/agentHostSessionsProvider.js';
import { IAgentHostFilterService } from '../../../../services/agentHostFilter/common/agentHostFilter.js';
import { ISessionsProvidersService } from '../../../../services/sessions/browser/sessionsProvidersService.js';
import { ISession } from '../../../../services/sessions/common/session.js';
import { CloudSandboxSessionsProvider } from './cloudSandboxSessionsProvider.js';
import { IRemoteAgentHostSessionsProviderConfig } from './remoteAgentHostSessionsProvider.js';

export const CLOUD_SANDBOX_CREATION_PROVIDER_ID = 'cloud-sandbox-creation';

const CLOUD_SANDBOX_HOST_GROUP: IAgentHostGroup = {
	id: 'githubsandbox',
	label: localize('githubSandbox.hostGroup', "GitHub Sandboxes"),
	order: 1,
	connectable: false,
	sessionCreationProviderId: isWeb ? CLOUD_SANDBOX_CREATION_PROVIDER_ID : undefined,
};

const CLOUD_SANDBOX_CONNECTION_LABELS: IAgentHostConnectionLabels = {
	unavailableTitle: localize('cloudSandbox.offlineTitle', "Environment Offline"),
	unavailable: localize('cloudSandbox.offline', "Environment offline."),
	connectingTitle: localize('cloudSandbox.connectingTitle', "Connecting to the Environment"),
	connecting: localize('cloudSandbox.connecting', "Connecting..."),
	reconnecting: localize('cloudSandbox.reconnecting', "Reconnecting..."),
	reconnectingIn: seconds => localize('cloudSandbox.reconnectingIn', "Reconnecting in {0}s", seconds),
	incompatibleTitle: localize('cloudSandbox.incompatibleTitle', "Cannot Connect to the Environment"),
	incompatible: localize('cloudSandbox.incompatible', "This environment is incompatible with this version of Visual Studio Code."),
};

export interface ICloudSandboxProvisionedSession extends ICloudSandboxCreatedSession {
	readonly provider: CloudSandboxSessionsProvider;
	readonly session: ISession;
}

export class CloudSandboxAgentHostContribution extends CloudSandboxSessionContribution<CloudSandboxSessionsProvider> {
	static readonly ID = 'workbench.contrib.cloudSandboxAgentHost';

	protected override get supportsBackgroundConnection(): boolean { return true; }

	private readonly _hostGroupRegistration = this._register(new MutableDisposable());

	constructor(
		@ICloudSandboxAgentHostService cloudSandboxService: ICloudSandboxAgentHostService,
		@ICloudSandboxApiService apiService: ICloudSandboxApiService,
		@IRemoteAgentHostService private readonly _remoteService: IRemoteAgentHostService,
		@IRemoteAgentHostConnectionCustomizationService private readonly _sandboxConnectionCustomizations: IRemoteAgentHostConnectionCustomizationService,
		@ISessionsProvidersService private readonly _sessionsProvidersService: ISessionsProvidersService,
		@IAgentHostFilterService private readonly _agentHostFilterService: IAgentHostFilterService,
		@IConfigurationService configurationService: IConfigurationService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IChatSessionsService chatSessionsService: IChatSessionsService,
		@ILogService logService: ILogService,
		@IChatEntitlementService chatEntitlementService: IChatEntitlementService,
		@IHostService hostService: IHostService,
		@IStorageService storageService: IStorageService,
		@IWorkspaceTrustManagementService workspaceTrustManagementService: IWorkspaceTrustManagementService,
		@IAgentHostService localAgentHostService: IAgentHostService,
	) {
		super(cloudSandboxService, apiService, _remoteService, _sandboxConnectionCustomizations, configurationService, instantiationService, chatSessionsService, logService, chatEntitlementService, hostService, storageService, workspaceTrustManagementService, localAgentHostService);
		this._updateRegistration();
		this._register(this._agentHostFilterService.registerDiscoveryHandler(() => this._discoverAndSeed()));
		this._register(this._agentHostFilterService.onDidChange(() => {
			if (this._agentHostFilterService.selectedHostId === CLOUD_SANDBOX_HOST_GROUP.id) {
				void this._refreshIfStale();
			}
		}));
	}

	async prepareSession(environmentId: string, repoNwo: string, token: CancellationToken): Promise<void> {
		const address = cloudSandboxAddress(environmentId);
		const connection = this._remoteService.getConnection(address);
		if (!connection) {
			throw new Error(localize('sandbox.connectionUnavailable', "The cloud sandbox connection is no longer available."));
		}
		const store = new DisposableStore();
		try {
			const prepare = this._sandboxConnectionCustomizations.get(address)?.createSessionPreparation?.(connection, store);
			if (!prepare) {
				throw new Error(localize('sandbox.preparationUnavailable', "Cloud sandbox repository preparation is not registered."));
			}
			await prepare(URI.from({ scheme: Schemas.https, authority: 'github.com', path: `/${repoNwo}` }), token);
		} finally {
			store.dispose();
		}
	}

	protected override _updateRegistration(): void {
		if (!this._isEnabled()) {
			this._hostGroupRegistration.clear();
		} else {
			if (!this._hostGroupRegistration.value) {
				this._hostGroupRegistration.value = this._agentHostFilterService.registerHostGroup(CLOUD_SANDBOX_HOST_GROUP);
			}
			void this._discoverAndSeed();
		}
	}

	protected override _ensureProvider(env: ICloudSandboxSessionEnvironment): void {
		super._ensureProvider(env);
		if (env.sessionId && env.taskId) {
			const rawId = env.sessionId;
			const address = cloudSandboxAddress(env.environmentId);
			this._providerInstances.get(address)?.setTaskRenameHandler(rawId, title => this._renameSandboxSession(address, rawId, title));
			this._providerInstances.get(address)?.setTaskArchiveHandler(rawId, archived => this._setSandboxSessionArchived(address, rawId, archived));
		}
	}

	protected override _createProvider(env: ICloudSandboxSessionEnvironment, store: DisposableStore): CloudSandboxSessionsProvider {
		const provider = store.add(this._instantiateProvider({
			address: cloudSandboxAddress(env.environmentId),
			name: env.name,
			connectOnDemand: async () => { await this.connect({ environmentId: env.environmentId, sessionId: env.sessionId, name: env.name }); },
			disconnectOnDemand: () => this._disconnectEnvironment(cloudSandboxAddress(env.environmentId)),
			deleteSessionsOnDemand: {
				ownsSession: session => isEqual(session, AgentSession.uri(CLOUD_SANDBOX_SESSION_SCHEME, AgentSession.id(session))) && this._ownsSandboxSession(cloudSandboxAddress(env.environmentId), AgentSession.id(session)),
				deleteSessions: sessions => this._deleteSandboxSession(cloudSandboxAddress(env.environmentId), sessions.map(session => AgentSession.id(session)), rawId => provider.removeDeletedSession(rawId)),
			},
			sessionSchemeAlias: { ui: CLOUD_SANDBOX_AGENT_PROVIDER, backend: CLOUD_SANDBOX_SESSION_SCHEME },
			defaultChangesetKind: ChangesetKind.Session,
			omitHostFromWorkspaceLabel: true,
			workspaceTypeIcon: Codicon.package,
			readOnlyWhenDisconnected: true,
			connectionLabels: CLOUD_SANDBOX_CONNECTION_LABELS,
			hostGroup: CLOUD_SANDBOX_HOST_GROUP,
		}));
		store.add(this._sessionsProvidersService.registerProvider(provider));
		return provider;
	}

	protected _instantiateProvider(config: IRemoteAgentHostSessionsProviderConfig): CloudSandboxSessionsProvider {
		return this._instantiationService.createInstance(CloudSandboxSessionsProvider, config);
	}

	async provisionSession(request: ICloudSandboxCreateSessionRequest, token: CancellationToken, progress?: IProgress<string>): Promise<ICloudSandboxProvisionedSession> {
		const { provider, ...created } = await this._provisionSandbox(request, token, progress);
		const session = provider.getCachedSession(created.sessionId);
		if (!session) {
			throw new Error(`Provisioned sandbox session ${created.sessionId} did not surface on its provider`);
		}
		return { ...created, provider, session };
	}
}
