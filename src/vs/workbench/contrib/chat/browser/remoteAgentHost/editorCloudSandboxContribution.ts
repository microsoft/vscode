/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { Event } from '../../../../../base/common/event.js';
import { Disposable, DisposableStore, MutableDisposable } from '../../../../../base/common/lifecycle.js';
import { localize } from '../../../../../nls.js';
import { IAgentHostConnectionsService } from '../../../../../platform/agentHost/common/agentHostConnectionsService.js';
import { agentHostAuthority } from '../../../../../platform/agentHost/common/agentHostUri.js';
import { ChangesetKind } from '../../../../../platform/agentHost/common/changesetUri.js';
import { CLOUD_SANDBOX_AGENT_PROVIDER, CLOUD_SANDBOX_SESSION_SCHEME, cloudSandboxAddress, ICloudSandboxAgentHostService, ICloudSandboxApiService } from '../../../../../platform/agentHost/common/cloudSandboxAgentHost.js';
import { IRemoteAgentHostService } from '../../../../../platform/agentHost/common/remoteAgentHostService.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { IStorageService } from '../../../../../platform/storage/common/storage.js';
import { IWorkbenchContribution } from '../../../../common/contributions.js';
import { IChatEntitlementService } from '../../../../services/chat/common/chatEntitlementService.js';
import { IWorkbenchEnvironmentService } from '../../../../services/environment/common/environmentService.js';
import { IHostService } from '../../../../services/host/browser/host.js';
import { ChatContextKeys } from '../../common/actions/chatContextKeys.js';
import { IChatSessionItemController, IChatSessionsService, SessionType } from '../../common/chatSessionsService.js';
import { IAgentHostSessionWorkingDirectoryResolver } from '../agentSessions/agentHost/agentHostSessionWorkingDirectoryResolver.js';
import { CloudSandboxSessionContribution, ICloudSandboxSessionEnvironment } from './cloudSandboxSessionContribution.js';
import { CloudSandboxSessionListController } from './cloudSandboxSessionListController.js';
import { IRemoteAgentHostConnectionCustomizationService } from './remoteAgentHostConnectionCustomization.js';

const DISCOVERY_SESSION_TYPE = 'cloud-sandbox';

export class EditorCloudSandboxSessionContribution extends CloudSandboxSessionContribution<CloudSandboxSessionListController> implements IChatSessionItemController {
	readonly items = [];
	readonly onDidChangeChatSessionItems = Event.None;

	private readonly _discoveryRegistration = this._register(new MutableDisposable<DisposableStore>());

	constructor(
		@ICloudSandboxAgentHostService cloudSandboxService: ICloudSandboxAgentHostService,
		@ICloudSandboxApiService apiService: ICloudSandboxApiService,
		@IRemoteAgentHostService remoteAgentHostService: IRemoteAgentHostService,
		@IRemoteAgentHostConnectionCustomizationService connectionCustomizations: IRemoteAgentHostConnectionCustomizationService,
		@IConfigurationService configurationService: IConfigurationService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IChatSessionsService private readonly _editorChatSessionsService: IChatSessionsService,
		@ILogService logService: ILogService,
		@IChatEntitlementService chatEntitlementService: IChatEntitlementService,
		@IAgentHostConnectionsService private readonly _connectionsService: IAgentHostConnectionsService,
		@IAgentHostSessionWorkingDirectoryResolver private readonly _workingDirectoryResolver: IAgentHostSessionWorkingDirectoryResolver,
		@IHostService hostService: IHostService,
		@IStorageService storageService: IStorageService,
	) {
		super(cloudSandboxService, apiService, remoteAgentHostService, connectionCustomizations, configurationService, instantiationService, _editorChatSessionsService, logService, chatEntitlementService, hostService, storageService);
		this._updateRegistration();
	}

	protected override _updateRegistration(): void {
		if (!this._isEnabled()) {
			this._discoveryRegistration.clear();
		} else if (!this._discoveryRegistration.value) {
			const store = new DisposableStore();
			this._discoveryRegistration.value = store;
			store.add(this._editorChatSessionsService.registerChatSessionContribution({
				type: DISCOVERY_SESSION_TYPE,
				name: localize('cloudSandbox.discoveryName', "GitHub Sandboxes"),
				displayName: localize('cloudSandbox.discoveryName', "GitHub Sandboxes"),
				description: localize('cloudSandbox.discoveryDescription', "Existing cloud sandbox sessions."),
				sessionListGroup: SessionType.CopilotCloud,
				when: ChatContextKeys.enabled.key,
				canDelegate: false,
				requiresCopilotSignIn: true,
				supportsDelegation: false,
			}));
			// Keep refresh available before discovery has found the first environment.
			store.add(this._editorChatSessionsService.registerChatSessionItemController(DISCOVERY_SESSION_TYPE, this));
		} else {
			void this._discoverAndSeed();
		}
	}

	protected override _createProvider(env: ICloudSandboxSessionEnvironment, store: DisposableStore): CloudSandboxSessionListController {
		const address = cloudSandboxAddress(env.environmentId);
		const provider = store.add(this._instantiationService.createInstance(CloudSandboxSessionListController, address));
		store.add(this._connectionsService.registerSessionResolutionPolicy(agentHostAuthority(address), {
			sessionSchemeAlias: { ui: CLOUD_SANDBOX_AGENT_PROVIDER, backend: CLOUD_SANDBOX_SESSION_SCHEME },
			defaultChangesetKind: ChangesetKind.Session,
		}));
		store.add(this._workingDirectoryResolver.registerResolver(provider.sessionType, resource => provider.resolveWorkingDirectory(resource), () => false));
		store.add(this._editorChatSessionsService.registerChatSessionContribution({
			type: provider.sessionType,
			name: localize('cloudSandbox.sessionName', "GitHub Sandbox"),
			displayName: localize('cloudSandbox.sessionName', "GitHub Sandbox"),
			description: env.name,
			sessionListGroup: SessionType.CopilotCloud,
			when: ChatContextKeys.enabled.key,
			icon: '$(cloud)',
			canDelegate: false,
			requiresCopilotSignIn: true,
			supportsDelegation: false,
			requiresCustomModels: true,
			supportsAutoModel: true,
			agentHostProviderId: CLOUD_SANDBOX_AGENT_PROVIDER,
			capabilities: {
				supportsCheckpoints: true,
				supportsPromptAttachments: true,
				supportsImageAttachments: true,
				get terminalCommandPrefix() { return provider.terminalCommandPrefix; },
			},
		}));
		store.add(this._editorChatSessionsService.registerChatSessionItemController(provider.sessionType, provider));
		return provider;
	}

	async refresh(token: CancellationToken): Promise<void> {
		if (!token.isCancellationRequested) {
			await this._discoverAndSeed();
		}
	}
}

export class EditorCloudSandboxContribution extends Disposable implements IWorkbenchContribution {
	static readonly ID = 'workbench.contrib.editorCloudSandbox';

	constructor(
		@IWorkbenchEnvironmentService environmentService: IWorkbenchEnvironmentService,
		@IInstantiationService instantiationService: IInstantiationService,
	) {
		super();
		if (!environmentService.isSessionsWindow) {
			this._register(instantiationService.createInstance(EditorCloudSandboxSessionContribution));
		}
	}
}
