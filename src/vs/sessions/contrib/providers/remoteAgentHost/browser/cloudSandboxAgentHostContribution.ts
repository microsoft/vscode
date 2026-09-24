/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { CancellationError } from '../../../../../base/common/errors.js';
import { DisposableStore, MutableDisposable } from '../../../../../base/common/lifecycle.js';
import { isWeb } from '../../../../../base/common/platform.js';
import { localize } from '../../../../../nls.js';
import { AgentSession } from '../../../../../platform/agentHost/common/agent.js';
import { ChangesetKind } from '../../../../../platform/agentHost/common/changesetUri.js';
import { CLOUD_SANDBOX_AGENT_PROVIDER, CLOUD_SANDBOX_SESSION_SCHEME, CloudSandboxAuthenticationRequiredError, cloudSandboxAddress, ICloudSandboxAgentHostService, ICloudSandboxApiService, ICloudSandboxCreatedSession, ICloudSandboxCreateSessionRequest } from '../../../../../platform/agentHost/common/cloudSandboxAgentHost.js';
import { IRemoteAgentHostService } from '../../../../../platform/agentHost/common/remoteAgentHostService.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { INotificationService } from '../../../../../platform/notification/common/notification.js';
import { IStorageService } from '../../../../../platform/storage/common/storage.js';
import { IChatSessionsService } from '../../../../../workbench/contrib/chat/common/chatSessionsService.js';
import { CloudSandboxSessionContribution, discoveredSessionProject, ICloudSandboxSessionEnvironment } from '../../../../../workbench/contrib/chat/browser/remoteAgentHost/cloudSandboxSessionContribution.js';
import { IRemoteAgentHostConnectionCustomizationService } from '../../../../../workbench/contrib/chat/browser/remoteAgentHost/remoteAgentHostConnectionCustomization.js';
import { IChatEntitlementService } from '../../../../../workbench/services/chat/common/chatEntitlementService.js';
import { IHostService } from '../../../../../workbench/services/host/browser/host.js';
import { IAgentHostConnectionLabels, IAgentHostGroup } from '../../../../common/agentHostSessionsProvider.js';
import { IAgentHostFilterService } from '../../../../services/agentHostFilter/common/agentHostFilter.js';
import { ISessionsProvidersService } from '../../../../services/sessions/browser/sessionsProvidersService.js';
import { ISession } from '../../../../services/sessions/common/session.js';
import { CloudSandboxSessionsProvider } from './cloudSandboxSessionsProvider.js';
import { IRemoteAgentHostSessionsProviderConfig } from './remoteAgentHostSessionsProvider.js';
import { watchForIncompatibleNotifications } from './remoteHostOptions.js';

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

	private readonly _hostGroupRegistration = this._register(new MutableDisposable());

	constructor(
		@ICloudSandboxAgentHostService cloudSandboxService: ICloudSandboxAgentHostService,
		@ICloudSandboxApiService apiService: ICloudSandboxApiService,
		@IRemoteAgentHostService remoteAgentHostService: IRemoteAgentHostService,
		@IRemoteAgentHostConnectionCustomizationService connectionCustomizations: IRemoteAgentHostConnectionCustomizationService,
		@ISessionsProvidersService private readonly _sessionsProvidersService: ISessionsProvidersService,
		@IAgentHostFilterService private readonly _agentHostFilterService: IAgentHostFilterService,
		@IConfigurationService configurationService: IConfigurationService,
		@IInstantiationService instantiationService: IInstantiationService,
		@INotificationService private readonly _notificationService: INotificationService,
		@IChatSessionsService chatSessionsService: IChatSessionsService,
		@ILogService logService: ILogService,
		@IChatEntitlementService chatEntitlementService: IChatEntitlementService,
		@IHostService hostService: IHostService,
		@IStorageService storageService: IStorageService,
	) {
		super(cloudSandboxService, apiService, remoteAgentHostService, connectionCustomizations, configurationService, instantiationService, chatSessionsService, logService, chatEntitlementService, hostService, storageService);
		this._updateRegistration();
		this._register(this._agentHostFilterService.registerDiscoveryHandler(() => this._discoverAndSeed()));
		this._register(this._agentHostFilterService.onDidChange(() => {
			if (this._agentHostFilterService.selectedHostId === CLOUD_SANDBOX_HOST_GROUP.id) {
				void this._refreshIfStale();
			}
		}));
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

	protected override _createProvider(env: ICloudSandboxSessionEnvironment, store: DisposableStore): CloudSandboxSessionsProvider {
		const provider = store.add(this._instantiateProvider({
			address: cloudSandboxAddress(env.environmentId),
			name: env.name,
			connectOnDemand: async () => { await this.connect({ environmentId: env.environmentId, sessionId: env.sessionId, name: env.name }); },
			sessionSchemeAlias: { ui: CLOUD_SANDBOX_AGENT_PROVIDER, backend: CLOUD_SANDBOX_SESSION_SCHEME },
			defaultChangesetKind: ChangesetKind.Session,
			omitHostFromWorkspaceLabel: true,
			workspaceTypeIcon: Codicon.package,
			readOnlyWhenDisconnected: true,
			connectionLabels: CLOUD_SANDBOX_CONNECTION_LABELS,
			hostGroup: CLOUD_SANDBOX_HOST_GROUP,
		}));
		store.add(this._sessionsProvidersService.registerProvider(provider));
		store.add(watchForIncompatibleNotifications(provider, this._instantiationService, this._notificationService));
		return provider;
	}

	protected _instantiateProvider(config: IRemoteAgentHostSessionsProviderConfig): CloudSandboxSessionsProvider {
		return this._instantiationService.createInstance(CloudSandboxSessionsProvider, config);
	}

	async provisionSession(request: ICloudSandboxCreateSessionRequest, token: CancellationToken): Promise<ICloudSandboxProvisionedSession> {
		if (!this._isEnabled()) {
			throw new Error('Copilot cloud sandbox connections are not enabled.');
		}
		const accountKey = await this._apiService.getAccountKey();
		if (!this._isEnabled() || token.isCancellationRequested) {
			throw new CancellationError();
		}
		if (!accountKey) {
			throw new CloudSandboxAuthenticationRequiredError();
		}
		this._restoreAccount(accountKey);
		const enabledToken = this._enabledCts.token;
		const created = await this._apiService.createSession(request, token);
		const name = request.repoNwo ?? created.taskId;
		const address = cloudSandboxAddress(created.environmentId);
		if (!this._isEnabled() || token.isCancellationRequested || enabledToken.isCancellationRequested) {
			throw new CancellationError();
		}
		this._provisioning.add(address);
		let seededProvider: CloudSandboxSessionsProvider | undefined;
		try {
			const now = Date.now();
			this._ensureProvider({ ...created, name, repoName: request.repoNwo, updatedAt: new Date(now).toISOString() });
			const provider = this._providerInstances.get(address);
			if (!provider) {
				throw new Error(`No sessions provider was registered for sandbox environment ${created.environmentId}`);
			}
			const project = discoveredSessionProject(request.repoNwo);
			provider.seedProvisionalSession({
				session: AgentSession.uri(CLOUD_SANDBOX_AGENT_PROVIDER, created.sessionId),
				startTime: now,
				modifiedTime: now,
				summary: name,
				...(project ? { project } : {}),
			});
			seededProvider = provider;
			this._persistInventory();
			await this.connect({ environmentId: created.environmentId, sessionId: created.sessionId, name });
			if (!this._isEnabled() || this._providerInstances.get(address) !== provider) {
				throw new CancellationError();
			}
			const session = provider.getCachedSession(created.sessionId);
			if (!session) {
				throw new Error(`Provisioned sandbox session ${created.sessionId} did not surface on its provider`);
			}
			return { ...created, provider, session };
		} catch (error) {
			// The remote task exists even if connecting or publishing it failed.
			if (seededProvider && this._providerInstances.get(address) === seededProvider) {
				seededProvider.publishWithheldSession(created.sessionId);
			}
			throw error;
		} finally {
			this._provisioning.delete(address);
		}
	}
}
