/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../../base/common/uri.js';
import { combinedDisposable, DisposableMap } from '../../../../base/common/lifecycle.js';
import { basename, isEqual } from '../../../../base/common/resources.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { IAgentHostCustomizationService, AbstractAgentHostCustomizationService, type IAgentHostCustomizationTarget } from '../../../../workbench/contrib/chat/browser/agentSessions/agentHost/agentHostCustomizationService.js';
import { IAgentHostSessionsProvider, isAgentHostProvider } from '../../../common/agentHostSessionsProvider.js';
import { ISessionsProvidersService } from '../../sessions/browser/sessionsProvidersService.js';
import { ISessionsManagementService } from '../../sessions/common/sessionsManagement.js';
import { ISessionsService } from '../../sessions/browser/sessionsService.js';
import { ISessionsProvider } from '../../sessions/common/sessionsProvider.js';
import { AgentCustomization, CustomizationType } from '../../../../platform/agentHost/common/state/sessionState.js';
import { ISession } from '../../sessions/common/session.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IStorageService } from '../../../../platform/storage/common/storage.js';

export class AgentHostCustomizationService extends AbstractAgentHostCustomizationService {
	private readonly _providerListeners = this._register(new DisposableMap<ISessionsProvider>());

	constructor(
		@ISessionsManagementService private readonly _sessionsManagementService: ISessionsManagementService,
		@ISessionsService private readonly _sessionsService: ISessionsService,
		@ISessionsProvidersService private readonly _sessionsProvidersService: ISessionsProvidersService,
		@IInstantiationService instantiationService: IInstantiationService,
		@ILogService logService: ILogService,
		@IStorageService storageService: IStorageService,
	) {
		super(instantiationService, logService, storageService);
		this._register(this._sessionsManagementService.onDidChangeSessions(e => {
			for (const session of e.removed) {
				this._clearMcpServerTracking(session.resource);
				this._disposeMcpDiagnostics(session.resource);
			}
			this._fireCustomAgentsChanged();
			this._fireCustomizationsChanged();
		}));
	}

	private _getSession(sessionResource: URI): ISession | undefined {
		const activeSession = this._sessionsService.activeSession.get();
		if (activeSession && isEqual(activeSession.resource, sessionResource)) {
			return activeSession;
		}
		return this._sessionsManagementService.getSession(sessionResource);
	}

	private _getAHSProvider(session: ISession): IAgentHostSessionsProvider | undefined {
		const provider = this._sessionsProvidersService.getProvider(session.providerId);
		if (provider && isAgentHostProvider(provider)) {
			this._ensureProviderListener(provider);
			return provider;
		}
		return undefined;
	}

	protected _resolveTarget(sessionResource: URI): IAgentHostCustomizationTarget | undefined {
		const session = this._getSession(sessionResource);
		if (!session) {
			return undefined;
		}
		const provider = this._getAHSProvider(session);
		if (!provider) {
			return undefined;
		}
		const servers = provider.getMcpServers(session.sessionId);
		return {
			customizations: provider.getCustomizations(session.sessionId),
			workingDirectory: provider.getWorkingDirectory(session.sessionId),
			rootConfig: provider.getRootConfig(),
			authenticate: request => provider.authenticate(request),
			setCustomizationEnabled: (rawId, enabled) => {
				servers.find(server => this._serverIdMatchesRawId(server.id, rawId))?.setEnabled(enabled);
			},
			startMcpServer: rawId => {
				return servers.find(server => this._serverIdMatchesRawId(server.id, rawId))?.start() ?? Promise.resolve();
			},
			stopMcpServer: rawId => {
				return servers.find(server => this._serverIdMatchesRawId(server.id, rawId))?.stop() ?? Promise.resolve();
			},
			setRootConfigValue: (property, value) => {
				void provider.setRootConfigValue(property, value);
			},
		};
	}

	override getCustomAgents(sessionResource: URI): readonly AgentCustomization[] {
		const session = this._getSession(sessionResource);
		if (session) {
			const provider = this._getAHSProvider(session);
			if (provider) {
				const agents = provider.getCustomAgents(session.sessionId);
				const activeMode = session.mode.get()?.id;
				return agents.length === 0 && activeMode ? [this._agentFromMode(activeMode)] : agents;
			}
		}
		return [];
	}

	private _ensureProviderListener(provider: IAgentHostSessionsProvider): void {
		if (this._providerListeners.has(provider)) {
			return;
		}

		// Keep both subscriptions alive under one map key so replacing the provider entry disposes both together.
		this._providerListeners.set(provider, combinedDisposable(
			provider.onDidChangeCustomAgents(() => {
				this._fireCustomAgentsChanged();
			}),
			provider.onDidChangeCustomizations(() => {
				this._fireCustomizationsChanged();
			})
		));
	}

	private _serverIdMatchesRawId(serverId: string, rawId: string): boolean {
		const separator = serverId.indexOf('/');
		return serverId === rawId || (separator >= 0 && serverId.slice(separator + 1) === rawId);
	}

	private _agentFromMode(uri: string): AgentCustomization {
		return {
			id: uri,
			uri,
			name: agentNameFromUri(uri),
			type: CustomizationType.Agent,
		};
	}
}

function agentNameFromUri(uri: string): string {
	try {
		let name = basename(URI.parse(uri));
		for (const suffix of ['.agent.md', '.md']) {
			if (name.endsWith(suffix)) {
				name = name.substring(0, name.length - suffix.length);
				break;
			}
		}
		return name || uri;
	} catch {
		return uri;
	}
}

registerSingleton(IAgentHostCustomizationService, AgentHostCustomizationService, InstantiationType.Delayed);
