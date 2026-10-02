/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../../nls.js';
import { RunOnceScheduler, Throttler } from '../../../../../base/common/async.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { Schemas } from '../../../../../base/common/network.js';
import { IAgentHostService } from '../../../../../platform/agentHost/common/agentService.js';
import { CloudSandboxEnabledSettingId, ICloudSandboxAgentHostService, ICloudSandboxApiService } from '../../../../../platform/agentHost/common/cloudSandboxAgentHost.js';
import { RemoteAgentHostsEnabledSettingId } from '../../../../../platform/agentHost/common/remoteAgentHostService.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { ConfigurationScope, Extensions as ConfigurationExtensions, IConfigurationRegistry } from '../../../../../platform/configuration/common/configurationRegistry.js';
import { IEnvironmentService } from '../../../../../platform/environment/common/environment.js';
import { InstantiationType, registerSingleton } from '../../../../../platform/instantiation/common/extensions.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { IProductService } from '../../../../../platform/product/common/productService.js';
import { Registry } from '../../../../../platform/registry/common/platform.js';
import { IWorkspaceContextService } from '../../../../../platform/workspace/common/workspace.js';
import { registerWorkbenchContribution2, WorkbenchPhase } from '../../../../common/contributions.js';
import { IAuthenticationService } from '../../../../services/authentication/common/authentication.js';
import { IChatEntitlementService } from '../../../../services/chat/common/chatEntitlementService.js';
import { CloudSandboxAgentHostService } from './cloudSandboxAgentHostService.js';
import { CloudSandboxApiService } from './cloudSandboxApiService.js';
import { CloudSandboxTelemetryService, ICloudSandboxTelemetryService } from './cloudSandboxTelemetry.js';
import { EditorCloudSandboxContribution } from './editorCloudSandboxContribution.js';
import { RemoteAgentHostContribution } from './remoteAgentHostChatContribution.js';
import './missionControlEnvironmentActions.js';
import { IRemoteAgentHostConnectionCustomizationService, RemoteAgentHostConnectionCustomizationService } from './remoteAgentHostConnectionCustomization.js';

const experimentalMissionControlEndpoint = 'chat.agentHost.experimentalMissionControlFakeEndpoint';
const experimentalMissionControlEnabled = 'chat.agentHost.experimentalMissionControl.enabled';
const experimentalMissionControlLiveEndpoint = 'chat.agentHost.experimentalMissionControl.endpoint';
const experimentalMissionControlRequireBinding = 'chat.agentHost.experimentalMissionControl.requireConnectionBinding';

class ExperimentalMissionControlContribution extends Disposable {
	static readonly ID = 'workbench.contrib.experimentalMissionControl';
	private _configured = false;
	private readonly _updates = new Throttler();
	private readonly _update = this._register(new RunOnceScheduler(() => {
		void this._updates.queue(() => this._configure()).catch(error => this._logService.error('Experimental Mission Control configuration failed', error));
	}, 0));

	constructor(
		@IAgentHostService private readonly _agentHost: IAgentHostService,
		@IConfigurationService private readonly _configuration: IConfigurationService,
		@IAuthenticationService private readonly _authentication: IAuthenticationService,
		@IChatEntitlementService private readonly _entitlement: IChatEntitlementService,
		@IWorkspaceContextService private readonly _workspace: IWorkspaceContextService,
		@IProductService private readonly _product: IProductService,
		@IEnvironmentService private readonly _environment: IEnvironmentService,
		@ILogService private readonly _logService: ILogService,
	) {
		super();
		this._register(this._updates);
		if (this._environment.isBuilt || !this._agentHost.configureExperimentalMissionControl) {
			return;
		}
		this._register(this._configuration.onDidChangeConfiguration(e => {
			if ([experimentalMissionControlEndpoint, experimentalMissionControlEnabled, experimentalMissionControlLiveEndpoint, experimentalMissionControlRequireBinding].some(setting => e.affectsConfiguration(setting))) {
				this._update.schedule();
			}
		}));
		this._register(this._workspace.onDidChangeWorkspaceFolders(() => this._update.schedule()));
		this._register(this._authentication.onDidChangeSessions(() => this._update.schedule()));
		this._register(this._entitlement.onDidChangeSentiment(() => this._update.schedule()));
		this._register(this._agentHost.onAgentHostStart(() => this._update.schedule()));
		this._update.schedule();
	}

	private async _configure(): Promise<void> {
		const live = this._configuration.getValue<boolean>(experimentalMissionControlEnabled);
		const endpoint = this._configuration.getValue<string>(live ? experimentalMissionControlLiveEndpoint : experimentalMissionControlEndpoint);
		if (live && this._configuration.getValue<string>(experimentalMissionControlEndpoint)) {
			throw new Error('Disable the fake endpoint before enabling live Mission Control');
		}
		if (!endpoint || this._entitlement.sentiment.hidden) {
			if (this._configured) {
				await this._agentHost.configureExperimentalMissionControl?.(undefined);
				this._configured = false;
			}
			return;
		}
		const roots = this._workspace.getWorkspace().folders.filter(folder => folder.uri.scheme === Schemas.file).map(folder => folder.uri.fsPath);
		if (!roots.length && !live) {
			if (this._configured) {
				await this._agentHost.configureExperimentalMissionControl?.(undefined);
				this._configured = false;
			}
			throw new Error('Experimental Mission Control requires an open local workspace');
		}
		const providerId = this._product.defaultChatAgent?.provider?.default?.id ?? 'github';
		const scopes = this._product.defaultChatAgent?.providerScopes?.[0] ?? ['read:user', 'user:email', 'repo', 'workflow'];
		const sessions = await this._authentication.getSessions(providerId, [...scopes], undefined, true);
		if (sessions.length !== 1) {
			if (this._configured) {
				await this._agentHost.configureExperimentalMissionControl?.(undefined);
				this._configured = false;
			}
			throw new Error('Experimental Mission Control requires exactly one local GitHub account with Copilot scopes');
		}
		this._agentHost.startAgentHost();
		await this._agentHost.configureExperimentalMissionControl?.({
			baseUrl: endpoint,
			accountId: sessions[0].account.id,
			credential: sessions[0].accessToken,
			roots,
			live,
			requireConnectionBinding: this._configuration.getValue<boolean>(experimentalMissionControlRequireBinding),
		});
		this._configured = true;
	}
}

registerSingleton(ICloudSandboxTelemetryService, CloudSandboxTelemetryService, InstantiationType.Delayed);
registerSingleton(ICloudSandboxApiService, CloudSandboxApiService, InstantiationType.Delayed);
registerSingleton(ICloudSandboxAgentHostService, CloudSandboxAgentHostService, InstantiationType.Delayed);
registerSingleton(IRemoteAgentHostConnectionCustomizationService, RemoteAgentHostConnectionCustomizationService, InstantiationType.Delayed);

registerWorkbenchContribution2(RemoteAgentHostContribution.ID, RemoteAgentHostContribution, WorkbenchPhase.AfterRestored);
registerWorkbenchContribution2(EditorCloudSandboxContribution.ID, EditorCloudSandboxContribution, WorkbenchPhase.AfterRestored);
registerWorkbenchContribution2(ExperimentalMissionControlContribution.ID, ExperimentalMissionControlContribution, WorkbenchPhase.AfterRestored);

Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration).registerConfiguration({
	properties: {
		[experimentalMissionControlEnabled]: {
			type: 'boolean',
			description: localize('experimentalMissionControlEnabled', "Development only: register the native Agent Host as a discoverable Mission Control environment so other clients can connect through Azure Web PubSub. Local VS Code continues using local IPC. Remote clients receive trusted-owner access including sessions, tools, and workspace resources. Native session actions are mirrored to Mission Control for catalog/history storage; conversation content is not end-to-end encrypted. Not enabled in built products."),
			default: false,
			scope: ConfigurationScope.APPLICATION,
			restricted: true,
			tags: ['experimental', 'advanced'],
		},
		[experimentalMissionControlLiveEndpoint]: {
			type: 'string',
			description: localize('experimentalMissionControlEndpoint', "HTTPS Mission Control API origin for the development experiment. The local GitHub credential is sent to this origin; only configure an endpoint you trust."),
			default: 'https://api.github.com',
			scope: ConfigurationScope.APPLICATION,
			restricted: true,
			tags: ['experimental', 'advanced'],
		},
		[experimentalMissionControlRequireBinding]: {
			type: 'boolean',
			description: localize('experimentalMissionControlRequireBinding', "Require remote relay clients to bind sealed authentication tokens to the current handshake challenge. Leave disabled only for the development experiment with clients using Mission Control's pre-sealed tokens; supplied bindings are always verified."),
			default: false,
			scope: ConfigurationScope.APPLICATION,
			restricted: true,
			tags: ['experimental', 'advanced'],
		},
		[experimentalMissionControlEndpoint]: {
			type: 'string',
			description: localize('chat.agentHost.experimentalMissionControlFakeEndpoint', "Development only: register this VS Code Agent Host with a local fake Mission Control and Web PubSub server. Enter its loopback HTTP URL; an empty value disables the prototype. Never use real endpoints."),
			default: '',
			scope: ConfigurationScope.APPLICATION,
			tags: ['experimental', 'advanced'],
		},
		[RemoteAgentHostsEnabledSettingId]: {
			type: 'boolean',
			description: localize('chat.remoteAgentHosts.enabled', "Enable connecting to remote agent hosts."),
			default: true,
			scope: ConfigurationScope.APPLICATION,
			restricted: true,
			tags: ['experimental', 'advanced'],
		},
		[CloudSandboxEnabledSettingId]: {
			type: 'boolean',
			description: localize('chat.agentHost.cloudSandbox.enabled', "Enable discovering and opening Copilot cloud sandbox sessions in the Editor Window and Agents Window over a live Agent Host Protocol relay. Also adds a Sandbox option when starting a cloud session in the Agents Window."),
			default: false,
			scope: ConfigurationScope.APPLICATION,
			tags: ['experimental', 'advanced'],
			experiment: { mode: 'auto' },
		},
	},
});
