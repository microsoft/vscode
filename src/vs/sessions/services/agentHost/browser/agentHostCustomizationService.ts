/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../../base/common/uri.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { combinedDisposable, Disposable, DisposableMap } from '../../../../base/common/lifecycle.js';
import { basename } from '../../../../base/common/resources.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { IAgentHostCustomizationService } from '../../../../workbench/contrib/chat/browser/agentSessions/agentHost/agentHostCustomizationService.js';
import { IAgentHostSessionsProvider, isAgentHostProvider } from '../../../common/agentHostSessionsProvider.js';
import { ISessionsProvidersService } from '../../sessions/browser/sessionsProvidersService.js';
import { ISessionsManagementService } from '../../sessions/common/sessionsManagement.js';
import { ISessionsProvider } from '../../sessions/common/sessionsProvider.js';
import { AgentCustomization, Customization, CustomizationType } from '../../../../platform/agentHost/common/state/sessionState.js';
import { ISession } from '../../sessions/common/session.js';

export class AgentHostCustomizationService extends Disposable implements IAgentHostCustomizationService {
	declare readonly _serviceBrand: undefined;
	private readonly _onDidChangeCustomAgents = this._register(new Emitter<void>());
	readonly onDidChangeCustomAgents: Event<void> = this._onDidChangeCustomAgents.event;
	private readonly _onDidChangeCustomizations = this._register(new Emitter<void>());
	readonly onDidChangeCustomizations: Event<void> = this._onDidChangeCustomizations.event;
	private readonly _providerListeners = this._register(new DisposableMap<ISessionsProvider>());

	constructor(
		@ISessionsManagementService private readonly _sessionsManagementService: ISessionsManagementService,
		@ISessionsProvidersService private readonly _sessionsProvidersService: ISessionsProvidersService,
	) {
		super();
		this._register(this._sessionsManagementService.onDidChangeSessions(() => {
			this._onDidChangeCustomAgents.fire();
			this._onDidChangeCustomizations.fire();
		}));
	}

	private _getSession(sessionResource: URI): ISession | undefined {
		const activeSession = this._sessionsManagementService.activeSession.get();
		if (activeSession && activeSession.resource.toString() === sessionResource.toString()) {
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

	getCustomAgents(sessionResource: URI): readonly AgentCustomization[] {
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

	getCustomizations(sessionResource: URI): readonly Customization[] {
		const session = this._getSession(sessionResource);
		if (session) {
			const provider = this._getAHSProvider(session);
			if (provider) {
				return provider.getCustomizations(session.sessionId);
			}
		}
		return [];
	}

	getWorkingDirectory(sessionResource: URI): string | undefined {
		const session = this._getSession(sessionResource);
		if (session) {
			const provider = this._getAHSProvider(session);
			if (provider) {
				return provider.getWorkingDirectory(session.sessionId);
			}
		}
		return undefined;
	}


	private _ensureProviderListener(provider: IAgentHostSessionsProvider): void {
		if (this._providerListeners.has(provider)) {
			return;
		}

		// Keep both subscriptions alive under one map key so replacing the provider entry disposes both together.
		this._providerListeners.set(provider, combinedDisposable(
			provider.onDidChangeCustomAgents(() => {
				this._onDidChangeCustomAgents.fire();
			}),
			provider.onDidChangeCustomizations(() => {
				this._onDidChangeCustomizations.fire();
			})
		));
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
