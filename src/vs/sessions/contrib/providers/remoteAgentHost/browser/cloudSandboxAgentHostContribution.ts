/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { raceCancellationError } from '../../../../../base/common/async.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { CancellationError } from '../../../../../base/common/errors.js';
import { DisposableStore, IDisposable, MutableDisposable } from '../../../../../base/common/lifecycle.js';
import { Schemas } from '../../../../../base/common/network.js';
import { isWeb } from '../../../../../base/common/platform.js';
import { equalsIgnoreCase } from '../../../../../base/common/strings.js';
import { URI } from '../../../../../base/common/uri.js';
import { localize } from '../../../../../nls.js';
import { AgentSession } from '../../../../../platform/agentHost/common/agent.js';
import { ChangesetKind } from '../../../../../platform/agentHost/common/changesetUri.js';
import { CLOUD_SANDBOX_AGENT_PROVIDER, CLOUD_SANDBOX_SESSION_SCHEME, CloudSandboxAuthenticationRequiredError, cloudSandboxAddress, ICloudSandboxAgentHostService, ICloudSandboxApiService, ICloudSandboxCreatedSession, ICloudSandboxCreateSessionRequest } from '../../../../../platform/agentHost/common/cloudSandboxAgentHost.js';
import { readCloudSandboxProjects } from '../../../../../platform/agentHost/common/meta/cloudSandboxProjectMeta.js';
import { IRemoteAgentHostService } from '../../../../../platform/agentHost/common/remoteAgentHostService.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { INotificationService } from '../../../../../platform/notification/common/notification.js';
import { IProgress } from '../../../../../platform/progress/common/progress.js';
import { IStorageService } from '../../../../../platform/storage/common/storage.js';
import { IWorkspaceTrustManagementService } from '../../../../../platform/workspace/common/workspaceTrust.js';
import { IChatSessionsService } from '../../../../../workbench/contrib/chat/common/chatSessionsService.js';
import { CloudSandboxSessionContribution, discoveredSessionProject, ICloudSandboxSessionEnvironment } from '../../../../../workbench/contrib/chat/browser/remoteAgentHost/cloudSandboxSessionContribution.js';
import { IRemoteAgentHostConnectionCustomizationService } from '../../../../../workbench/contrib/chat/browser/remoteAgentHost/remoteAgentHostConnectionCustomization.js';
import { IChatEntitlementService } from '../../../../../workbench/services/chat/common/chatEntitlementService.js';
import { IHostService } from '../../../../../workbench/services/host/browser/host.js';
import { getGitHubRepositoryFromRemoteUrl } from '../../../../../workbench/contrib/git/common/utils.js';
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
		@IRemoteAgentHostService private readonly _remoteService: IRemoteAgentHostService,
		@IRemoteAgentHostConnectionCustomizationService private readonly _sandboxConnectionCustomizations: IRemoteAgentHostConnectionCustomizationService,
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
		@IWorkspaceTrustManagementService workspaceTrustManagementService: IWorkspaceTrustManagementService,
	) {
		super(cloudSandboxService, apiService, _remoteService, _sandboxConnectionCustomizations, configurationService, instantiationService, chatSessionsService, logService, chatEntitlementService, hostService, storageService, workspaceTrustManagementService);
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
				ownsSession: rawId => this._ownsSandboxSession(cloudSandboxAddress(env.environmentId), rawId),
				deleteSessions: sessionIds => this._deleteSandboxSession(cloudSandboxAddress(env.environmentId), sessionIds, rawId => provider.removeDeletedSession(rawId)),
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
		store.add(watchForIncompatibleNotifications(provider, this._instantiationService, this._notificationService));
		return provider;
	}

	protected _instantiateProvider(config: IRemoteAgentHostSessionsProviderConfig): CloudSandboxSessionsProvider {
		return this._instantiationService.createInstance(CloudSandboxSessionsProvider, config);
	}

	async provisionSession(request: ICloudSandboxCreateSessionRequest, token: CancellationToken, progress?: IProgress<string>): Promise<ICloudSandboxProvisionedSession> {
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
		progress?.report(localize('sandbox.provisioningContainer', "Setting up cloud container"));
		const created = await this._apiService.createSession(request, token);
		const name = request.repoNwo ?? created.taskId;
		const address = cloudSandboxAddress(created.environmentId);
		if (!this._isEnabled() || token.isCancellationRequested || enabledToken.isCancellationRequested) {
			throw new CancellationError();
		}
		this._provisioning.add(address);
		let seededProvider: CloudSandboxSessionsProvider | undefined;
		let connectionAttempt: Promise<string> | undefined;
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
			progress?.report(localize('sandbox.connectingContainer', "Connecting to cloud container"));
			connectionAttempt = this.connect({ environmentId: created.environmentId, sessionId: created.sessionId, name, connectionSource: 'created' });
			await raceCancellationError(connectionAttempt, token);
			if (token.isCancellationRequested || !this._isEnabled() || this._providerInstances.get(address) !== provider) {
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
			const releaseProvisioning = () => { this._provisioning.delete(address); };
			if (connectionAttempt) {
				// A canceled caller must not let discovery tear down a connection that is still waking.
				void connectionAttempt.then(releaseProvisioning, releaseProvisioning);
			} else {
				releaseProvisioning();
			}
		}
	}

	/** Observe repository setup until the caller finishes dispatching the first turn. */
	trackSessionCreationProgress(environmentId: string, repoNwo: string, progress: IProgress<string>): IDisposable {
		const store = new DisposableStore();
		const connection = this._remoteService.getConnection(cloudSandboxAddress(environmentId));
		if (!connection) {
			return store;
		}
		let cloningProjectId: string | undefined;
		const update = () => {
			const state = connection.rootState.value;
			if (!state || state instanceof Error) {
				return;
			}
			const projects = readCloudSandboxProjects(state)?.filter(project => {
				const remote = project.remoteUrl && getGitHubRepositoryFromRemoteUrl(project.remoteUrl, ['github.com']);
				return remote && equalsIgnoreCase(`${remote.owner}/${remote.repo}`, repoNwo);
			});
			const project = projects?.find(project => project.status === 'ready') ?? projects?.find(project => project.status === 'cloning') ?? projects?.[0];
			if (project?.status === 'cloning') {
				cloningProjectId = project.id;
				progress.report(project.progress === undefined
					? localize('sandbox.cloningRepository', "Cloning repository")
					: localize('sandbox.cloningRepositoryProgress', "Cloning repository ({0}%)", Math.round(project.progress)));
			} else if (project?.status === 'ready') {
				progress.report(localize('sandbox.startingAgent', "Starting Copilot agent"));
				store.dispose();
			} else if (project?.status === 'failed' && project.id === cloningProjectId) {
				progress.report(localize('sandbox.cloningFailed', "Repository cloning failed"));
				store.dispose();
			}
		};
		store.add(connection.rootState.onDidChange(update));
		update();
		return store;
	}
}
