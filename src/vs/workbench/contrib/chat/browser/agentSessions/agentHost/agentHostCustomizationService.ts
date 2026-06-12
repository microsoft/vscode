/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../../../../base/common/uri.js';
import { Emitter, Event } from '../../../../../../base/common/event.js';
import { Disposable, DisposableMap, IDisposable } from '../../../../../../base/common/lifecycle.js';
import { AgentSession, IAgentHostService } from '../../../../../../platform/agentHost/common/agentService.js';
import { getEffectiveAgents } from '../../../../../../platform/agentHost/common/customAgents.js';
import { type IAgentSubscription } from '../../../../../../platform/agentHost/common/state/agentSubscription.js';
import { ActionType } from '../../../../../../platform/agentHost/common/state/protocol/actions.js';
import { CustomizationType, McpServerCustomization, type Customization, type SessionState } from '../../../../../../platform/agentHost/common/state/protocol/state.js';
import { AgentCustomization, StateComponents } from '../../../../../../platform/agentHost/common/state/sessionState.js';
import { InstantiationType, registerSingleton } from '../../../../../../platform/instantiation/common/extensions.js';
import { createDecorator } from '../../../../../../platform/instantiation/common/instantiation.js';
import { IChatService } from '../../../common/chatService/chatService.js';
import { isUntitledChatSession } from '../../../common/model/chatUri.js';
import { IAgentHostUntitledProvisionalSessionService } from './agentHostUntitledProvisionalSessionService.js';
import { IAgentHostMcpServer } from '../../../../../../sessions/common/agentHostSessionsProvider.js';

const AGENT_HOST_SESSION_SCHEME_PREFIX = 'agent-host-';

export const IAgentHostCustomizationService = createDecorator<IAgentHostCustomizationService>('agentHostCustomizationService');

export interface IAgentHostCustomizationService {
	readonly _serviceBrand: undefined;
	readonly onDidChangeCustomAgents: Event<void>;
	readonly onDidChangeCustomizations: Event<void>;

	getCustomAgents(sessionResource: URI): readonly AgentCustomization[];

	getCustomizations(sessionResource: URI): readonly Customization[];

	getWorkingDirectory(sessionResource: URI): string | undefined;

	/**
	 * Returns the MCP servers exposed by an agent-host session. Each entry
	 * carries the current status and a {@link IAgentHostMcpServer.setEnabled}
	 * method that dispatches the protocol-level toggle on behalf of the
	 * caller. Returns an empty array for sessions not backed by an agent
	 * host, or that don't expose any MCP servers.
	 */
	getMcpServers(sessionResource: URI): readonly IAgentHostMcpServer[];
}

export class NullAgentHostCustomizationService implements IAgentHostCustomizationService {
	declare readonly _serviceBrand: undefined;
	readonly onDidChangeCustomAgents = Event.None;
	readonly onDidChangeCustomizations = Event.None;
	getCustomAgents(_sessionResource: URI): readonly AgentCustomization[] {
		return [];
	}
	getCustomizations(_sessionResource: URI): readonly Customization[] {
		return [];
	}
	getWorkingDirectory(sessionResource: URI): string | undefined {
		return undefined;
	}
	getMcpServers(_sessionResource: URI): readonly IAgentHostMcpServer[] {
		return [];
	}
}

class WorkbenchAgentHostCustomizationService extends Disposable implements IAgentHostCustomizationService {
	declare readonly _serviceBrand: undefined;

	private readonly _onDidChangeCustomAgents = this._register(new Emitter<void>());
	private readonly _onDidChangeCustomizations = this._register(new Emitter<void>());
	readonly onDidChangeCustomAgents: Event<void> = this._onDidChangeCustomAgents.event;
	readonly onDidChangeCustomizations: Event<void> = this._onDidChangeCustomizations.event;
	private readonly _sessionStateSubscriptions = this._register(new DisposableMap<string, IDisposable & { readonly backendSession: URI; readonly sub: IAgentSubscription<SessionState> }>());

	constructor(
		@IAgentHostService private readonly _agentHostService: IAgentHostService,
		@IAgentHostUntitledProvisionalSessionService private readonly _provisionalSessionService: IAgentHostUntitledProvisionalSessionService,
		@IChatService chatService: IChatService,
	) {
		super();

		this._register(this._agentHostService.onDidAction(envelope => {
			switch (envelope.action.type) {
				case ActionType.SessionCustomizationsChanged:
				case ActionType.SessionCustomizationUpdated:
					this._fireCustomizationsChanged();
					this._fireCustomAgentsChanged();
					break;
				case ActionType.SessionAgentChanged:
					this._fireCustomAgentsChanged();
					break;
			}
		}));
		this._register(this._provisionalSessionService.onDidChange(sessionResource => {
			this._sessionStateSubscriptions.deleteAndDispose(sessionResource.toString());
			this._fireCustomizationsChanged();
			this._fireCustomAgentsChanged();
		}));
		this._register(chatService.onDidDisposeSession(e => {
			for (const sessionResource of e.sessionResources) {
				this._sessionStateSubscriptions.deleteAndDispose(sessionResource.toString());
			}
			this._fireCustomizationsChanged();
			this._fireCustomAgentsChanged();
		}));
	}

	getCustomAgents(sessionResource: URI): readonly AgentCustomization[] {
		const sessionState = this._readSessionState(sessionResource);
		const agents = getEffectiveAgents(sessionState?.customizations);
		if (agents.length > 0) {
			return agents;
		}

		return [];
	}

	getCustomizations(sessionResource: URI): readonly Customization[] {
		const sessionState = this._readSessionState(sessionResource);
		return sessionState?.customizations ?? [];
	}

	getWorkingDirectory(sessionResource: URI): string | undefined {
		const sessionState = this._readSessionState(sessionResource);
		return sessionState?.summary.workingDirectory;
	}

	getMcpServers(sessionResource: URI): readonly IAgentHostMcpServer[] {
		const backendSession = this._resolveBackendSession(sessionResource);
		if (!backendSession) {
			return [];
		}
		const customizations = this._readSessionState(sessionResource)?.customizations ?? [];
		const channel = backendSession.toString();
		return customizations
			.filter((c): c is McpServerCustomization => c.type === CustomizationType.McpServer)
			.map((c): IAgentHostMcpServer => ({
				id: c.id,
				name: c.name,
				enabled: c.enabled,
				status: c.state.kind,
				setEnabled: (enabled: boolean) => {
					this._agentHostService.dispatch(channel, {
						type: ActionType.SessionCustomizationToggled,
						id: c.id,
						enabled,
					});
				},
			}));
	}

	private _readSessionState(sessionResource: URI): SessionState | undefined {
		const backendSession = this._resolveBackendSession(sessionResource);
		const value = backendSession ? this._ensureSessionStateSubscription(sessionResource, backendSession)?.sub.value : undefined;
		return value && !(value instanceof Error) ? value : undefined;
	}

	private _ensureSessionStateSubscription(sessionResource: URI, backendSession: URI): (IDisposable & { readonly backendSession: URI; readonly sub: IAgentSubscription<SessionState> }) | undefined {
		const key = sessionResource.toString();
		const existing = this._sessionStateSubscriptions.get(key);
		if (existing?.backendSession.toString() === backendSession.toString()) {
			return existing;
		}

		const ref = this._agentHostService.getSubscription(StateComponents.Session, backendSession, 'AgentHostCustomizationService');
		const sub = ref.object;
		const listener = sub.onDidChange(() => {
			this._fireCustomizationsChanged();
			this._fireCustomAgentsChanged();
		});
		const entry = {
			backendSession,
			sub,
			dispose: () => {
				listener.dispose();
				ref.dispose();
			},
		};
		this._sessionStateSubscriptions.set(key, entry);
		return entry;
	}

	private _fireCustomAgentsChanged(): void {
		this._onDidChangeCustomAgents.fire();
	}

	private _fireCustomizationsChanged(): void {
		this._onDidChangeCustomizations.fire();
	}

	private _resolveBackendSession(sessionResource: URI): URI | undefined {
		const provisionalSession = this._provisionalSessionService.get(sessionResource);
		if (provisionalSession) {
			return provisionalSession;
		}

		if (isUntitledChatSession(sessionResource)) {
			return undefined;
		}

		if (!sessionResource.scheme.startsWith(AGENT_HOST_SESSION_SCHEME_PREFIX)) {
			return undefined;
		}

		const provider = sessionResource.scheme.substring(AGENT_HOST_SESSION_SCHEME_PREFIX.length);
		return provider ? AgentSession.uri(provider, sessionResource.path.substring(1)) : undefined;
	}
}

registerSingleton(IAgentHostCustomizationService, WorkbenchAgentHostCustomizationService, InstantiationType.Delayed);
