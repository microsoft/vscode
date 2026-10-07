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
import { CloudSandboxModelCatalogService, ICloudSandboxModelCatalogService } from './cloudSandboxModels.js';
import { CloudSandboxTelemetryService, ICloudSandboxTelemetryService } from './cloudSandboxTelemetry.js';
import { EditorCloudSandboxContribution } from './editorCloudSandboxContribution.js';
import { RemoteAgentHostContribution } from './remoteAgentHostChatContribution.js';
import './missionControlEnvironmentActions.js';
import { IMissionControlEnvironmentService } from '../../../../../platform/agentHost/common/missionControlEnvironment.js';
import { MissionControlEnvironmentService } from './missionControlEnvironmentService.js';
import { IRemoteAgentHostConnectionCustomizationService, RemoteAgentHostConnectionCustomizationService } from './remoteAgentHostConnectionCustomization.js';

const missionControlEnabled = 'chat.agentHost.experimentalMissionControl.enabled';

export class MissionControlContribution extends Disposable {
	static readonly ID = 'workbench.contrib.missionControl';
	private _configured = false;
	private _generation = 0;
	private _accountId: string | undefined;
	private _accountSessionIds = new Set<string>();
	private readonly _updates = new Throttler();
	private readonly _update = this._register(new RunOnceScheduler(() => {
		void this._updates.queue(() => this._configure()).catch(error => this._logService.error('Mission Control configuration failed', error));
	}, 0));

	constructor(
		@IAgentHostService private readonly _agentHost: IAgentHostService,
		@IConfigurationService private readonly _configuration: IConfigurationService,
		@IAuthenticationService private readonly _authentication: IAuthenticationService,
		@IChatEntitlementService private readonly _entitlement: IChatEntitlementService,
		@IWorkspaceContextService private readonly _workspace: IWorkspaceContextService,
		@IProductService private readonly _product: IProductService,
		@ILogService private readonly _logService: ILogService,
	) {
		super();
		this._register(this._updates);
		if (!this._agentHost.configureMissionControl) {
			return;
		}
		this._register(this._configuration.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration(missionControlEnabled)) {
				this._withdraw();
				this._update.schedule();
			}
		}));
		this._register(this._workspace.onDidChangeWorkspaceFolders(() => {
			this._generation++;
			this._update.schedule();
		}));
		this._register(this._authentication.onDidChangeSessions(e => {
			const providerId = this._product.defaultChatAgent?.provider?.default?.id ?? 'github';
			if (e.providerId !== providerId) {
				return;
			}
			const removed = e.event.removed?.filter(session => session.account.id === this._accountId) ?? [];
			for (const session of removed) {
				this._accountSessionIds.delete(session.id);
			}
			for (const session of e.event.added ?? []) {
				if (session.account.id === this._accountId && this._getScopes().every(scope => session.scopes.includes(scope))) {
					this._accountSessionIds.add(session.id);
				}
			}
			if (removed.length && !this._accountSessionIds.size) {
				this._withdraw();
			} else {
				this._generation++;
			}
			this._update.schedule();
		}));
		this._register(this._entitlement.onDidChangeSentiment(() => {
			if (this._entitlement.sentiment.hidden) {
				this._withdraw();
			}
			this._update.schedule();
		}));
		this._register(this._agentHost.onAgentHostStart(() => {
			this._generation++;
			this._configured = false;
			this._update.schedule();
		}));
		this._update.schedule();
	}

	private _withdraw(): void {
		this._generation++;
		this._configured = false;
		this._accountSessionIds.clear();
		if (this._accountId !== undefined) {
			void this._agentHost.configureMissionControl?.(undefined, this._accountId).catch(error => this._logService.error('Mission Control withdrawal failed', error));
		}
	}

	private _getScopes(): readonly string[] {
		return this._product.defaultChatAgent?.providerScopes?.[0] ?? ['read:user', 'user:email', 'repo', 'workflow'];
	}

	private async _configure(): Promise<void> {
		const generation = this._generation;
		if (!this._configuration.getValue<boolean>(missionControlEnabled) || this._entitlement.sentiment.hidden) {
			if (this._configured) {
				this._withdraw();
			}
			return;
		}
		const roots = this._workspace.getWorkspace().folders.filter(folder => folder.uri.scheme === Schemas.file).map(folder => folder.uri.fsPath);
		const providerId = this._product.defaultChatAgent?.provider?.default?.id ?? 'github';
		const scopes = this._getScopes();
		const sessions = await this._authentication.getSessions(providerId, [...scopes], undefined, true);
		if (generation !== this._generation || this._store.isDisposed) {
			return;
		}
		if (new Set(sessions.map(session => session.account.id)).size !== 1) {
			if (this._configured) {
				this._withdraw();
			}
			throw new Error('Mission Control requires exactly one local GitHub account with Copilot scopes');
		}
		this._agentHost.startAgentHost();
		if (generation !== this._generation) {
			return;
		}
		this._accountId = sessions[0].account.id;
		this._accountSessionIds = new Set(sessions.map(session => session.id));
		this._configured = true;
		await this._agentHost.configureMissionControl?.({
			baseUrl: 'https://api.github.com',
			accountId: sessions[0].account.id,
			credential: sessions[0].accessToken,
			roots,
			live: true,
		});
	}
}

registerSingleton(ICloudSandboxTelemetryService, CloudSandboxTelemetryService, InstantiationType.Delayed);
registerSingleton(ICloudSandboxApiService, CloudSandboxApiService, InstantiationType.Delayed);
registerSingleton(ICloudSandboxModelCatalogService, CloudSandboxModelCatalogService, InstantiationType.Delayed);
registerSingleton(ICloudSandboxAgentHostService, CloudSandboxAgentHostService, InstantiationType.Delayed);
registerSingleton(IMissionControlEnvironmentService, MissionControlEnvironmentService, InstantiationType.Delayed);
registerSingleton(IRemoteAgentHostConnectionCustomizationService, RemoteAgentHostConnectionCustomizationService, InstantiationType.Delayed);

registerWorkbenchContribution2(RemoteAgentHostContribution.ID, RemoteAgentHostContribution, WorkbenchPhase.AfterRestored);
registerWorkbenchContribution2(EditorCloudSandboxContribution.ID, EditorCloudSandboxContribution, WorkbenchPhase.AfterRestored);
registerWorkbenchContribution2(MissionControlContribution.ID, MissionControlContribution, WorkbenchPhase.AfterRestored);

Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration).registerConfiguration({
	properties: {
		[missionControlEnabled]: {
			type: 'boolean',
			description: localize('missionControlEnabled', "Register the native Agent Host as a discoverable Mission Control environment so other clients can connect through Azure Web PubSub. Local VS Code continues using local IPC. Remote clients receive trusted-owner access including sessions, tools, and workspace resources. Native session actions are mirrored to Mission Control for catalog/history storage; conversation content is not end-to-end encrypted."),
			default: false,
			scope: ConfigurationScope.APPLICATION,
			restricted: true,
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
			description: localize('chat.agentHost.cloudSandbox.enabled', "Use GitHub Cloud for new Cloud sessions in the Agents Window instead of Copilot coding agent on GitHub Actions. Also enables discovering and opening GitHub Cloud sessions."),
			default: false,
			scope: ConfigurationScope.APPLICATION,
			tags: ['experimental', 'advanced'],
			experiment: { mode: 'auto' },
		},
	},
});
