/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../../base/common/uri.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable, DisposableMap } from '../../../../base/common/lifecycle.js';
import { basename } from '../../../../base/common/resources.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { IAgentHostCustomAgentsService } from '../../../../workbench/contrib/chat/browser/agentSessions/agentHost/agentHostCustomAgentsService.js';
import { IAgentHostSessionsProvider, isAgentHostProvider } from '../../../common/agentHostSessionsProvider.js';
import { ISessionsProvidersService } from '../../sessions/browser/sessionsProvidersService.js';
import { ISessionsManagementService } from '../../sessions/common/sessionsManagement.js';
import { ISessionsProvider } from '../../sessions/common/sessionsProvider.js';
import { AgentCustomization, CustomizationType } from '../../../../platform/agentHost/common/state/sessionState.js';

export class AgentHostCustomAgentsService extends Disposable implements IAgentHostCustomAgentsService {
	declare readonly _serviceBrand: undefined;
	private readonly _onDidChangeCustomAgents = this._register(new Emitter<void>());
	readonly onDidChangeCustomAgents: Event<void> = this._onDidChangeCustomAgents.event;
	private readonly _providerListeners = this._register(new DisposableMap<ISessionsProvider>());

	constructor(
		@ISessionsManagementService private readonly _sessionsManagementService: ISessionsManagementService,
		@ISessionsProvidersService private readonly _sessionsProvidersService: ISessionsProvidersService,
	) {
		super();
		this._register(this._sessionsManagementService.onDidChangeSessions(() => {
			this._onDidChangeCustomAgents.fire();
		}));
	}

	getCustomAgents(sessionResource: URI): readonly AgentCustomization[] {
		const session = this._sessionsManagementService.activeSession.get();
		if (!session || session.resource.toString() !== sessionResource.toString()) {
			return [];
		}

		const provider = this._sessionsProvidersService.getProvider(session.providerId);
		if (provider && isAgentHostProvider(provider)) {
			this._ensureProviderListener(provider);
			const agents = provider.getCustomAgents(session.sessionId);
			const activeMode = session.mode.get()?.id;
			const result = agents.length === 0 && activeMode ? [this._agentFromMode(activeMode)] : agents;
			return result;
		}

		return [];
	}

	private _ensureProviderListener(provider: IAgentHostSessionsProvider): void {
		if (this._providerListeners.has(provider)) {
			return;
		}

		this._providerListeners.set(provider, provider.onDidChangeCustomAgents(() => {
			this._onDidChangeCustomAgents.fire();
		}));
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

registerSingleton(IAgentHostCustomAgentsService, AgentHostCustomAgentsService, InstantiationType.Delayed);
