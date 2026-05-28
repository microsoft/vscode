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
import type { SessionState } from '../../../../../../platform/agentHost/common/state/protocol/state.js';
import { AgentCustomization, StateComponents } from '../../../../../../platform/agentHost/common/state/sessionState.js';
import { InstantiationType, registerSingleton } from '../../../../../../platform/instantiation/common/extensions.js';
import { createDecorator } from '../../../../../../platform/instantiation/common/instantiation.js';
import { IChatService } from '../../../common/chatService/chatService.js';
import { isUntitledChatSession } from '../../../common/model/chatUri.js';
import { IAgentHostUntitledProvisionalSessionService } from './agentHostUntitledProvisionalSessionService.js';

const AGENT_HOST_SESSION_SCHEME_PREFIX = 'agent-host-';

export const IAgentHostCustomAgentsService = createDecorator<IAgentHostCustomAgentsService>('agentHostCustomAgentsService');

export interface IAgentHostCustomAgentsService {
	readonly _serviceBrand: undefined;
	readonly onDidChangeCustomAgents: Event<void>;

	getCustomAgents(sessionResource: URI): readonly AgentCustomization[];
}

export class NullAgentHostCustomAgentsService implements IAgentHostCustomAgentsService {
	declare readonly _serviceBrand: undefined;
	readonly onDidChangeCustomAgents = Event.None;
	getCustomAgents(_sessionResource: URI): readonly AgentCustomization[] {
		return [];
	}
}

class WorkbenchAgentHostCustomAgentsService extends Disposable implements IAgentHostCustomAgentsService {
	declare readonly _serviceBrand: undefined;

	private readonly _onDidChangeCustomAgents = this._register(new Emitter<void>());
	readonly onDidChangeCustomAgents: Event<void> = this._onDidChangeCustomAgents.event;
	private readonly _sessionStateSubscriptions = this._register(new DisposableMap<string, IDisposable & { readonly backendSession: URI; readonly sub: IAgentSubscription<SessionState> }>());

	constructor(
		@IAgentHostService private readonly _agentHostService: IAgentHostService,
		@IAgentHostUntitledProvisionalSessionService private readonly _provisionalSessionService: IAgentHostUntitledProvisionalSessionService,
		@IChatService chatService: IChatService,
	) {
		super();

		this._register(this._agentHostService.onDidAction(envelope => {
			if (envelope.action.type === ActionType.SessionCustomizationsChanged
				|| envelope.action.type === ActionType.SessionCustomizationUpdated
				|| envelope.action.type === ActionType.SessionAgentChanged) {
				this._onDidChangeCustomAgents.fire();
			}
		}));
		this._register(this._provisionalSessionService.onDidChange(sessionResource => {
			this._sessionStateSubscriptions.deleteAndDispose(sessionResource.toString());
			this._onDidChangeCustomAgents.fire();
		}));
		this._register(chatService.onDidDisposeSession(e => {
			for (const sessionResource of e.sessionResources) {
				this._sessionStateSubscriptions.deleteAndDispose(sessionResource.toString());
			}
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

		const ref = this._agentHostService.getSubscription(StateComponents.Session, backendSession);
		const sub = ref.object;
		const listener = sub.onDidChange(() => {
			this._onDidChangeCustomAgents.fire();
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

registerSingleton(IAgentHostCustomAgentsService, WorkbenchAgentHostCustomAgentsService, InstantiationType.Delayed);
