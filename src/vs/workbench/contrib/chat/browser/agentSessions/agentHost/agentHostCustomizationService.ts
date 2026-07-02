/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../../../../base/common/uri.js';
import { Emitter, Event } from '../../../../../../base/common/event.js';
import { Disposable, DisposableMap, IDisposable } from '../../../../../../base/common/lifecycle.js';
import { AgentHostMcpServers, AgentHostMcpServersConfigKey } from '../../../../../../platform/agentHost/common/agentHostSchema.js';
import { AgentSession, IAgentConnection } from '../../../../../../platform/agentHost/common/agentService.js';
import { isRemoteAgentHostSessionType, remoteAgentHostSessionTypeId } from '../../../../../../platform/agentHost/common/agentHostSessionType.js';
import { AGENT_HOST_LOG_OUTPUT_CHANNEL_ID, remoteAgentHostLogOutputChannelId } from '../../../../../../platform/agentHost/common/remoteAgentHostService.js';
import { IAgentHostConnectionsService, IAgentHostSessionResolution, LOCAL_AGENT_HOST_SCHEME_PREFIX } from '../../../../../../platform/agentHost/common/agentHostConnectionsService.js';
import { getEffectiveAgents } from '../../../../../../platform/agentHost/common/customAgents.js';
import { type IAgentSubscription } from '../../../../../../platform/agentHost/common/state/agentSubscription.js';
import { ActionType } from '../../../../../../platform/agentHost/common/state/protocol/actions.js';
import { CustomizationType, McpServerCustomization, McpServerStatus, type Customization, type RootConfigState, type SessionState } from '../../../../../../platform/agentHost/common/state/protocol/state.js';
import { AgentCustomization, ROOT_STATE_URI, StateComponents } from '../../../../../../platform/agentHost/common/state/sessionState.js';
import { InstantiationType, registerSingleton } from '../../../../../../platform/instantiation/common/extensions.js';
import { createDecorator, IInstantiationService } from '../../../../../../platform/instantiation/common/instantiation.js';
import { IMcpServerConfiguration } from '../../../../../../platform/mcp/common/mcpPlatformTypes.js';
import { ILogService } from '../../../../../../platform/log/common/log.js';
import { IChatService } from '../../../common/chatService/chatService.js';
import { isUntitledChatSession } from '../../../common/model/chatUri.js';
import { IAgentHostUntitledProvisionalSessionService } from './agentHostUntitledProvisionalSessionService.js';
import { IAgentHostMcpServer } from '../../../../../../sessions/common/agentHostSessionsProvider.js';
import { resolveMcpServerAuthentication, agentHostMcpServerId } from './agentHostAuth.js';

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
	 * carries the current status, a {@link IAgentHostMcpServer.setEnabled}
	 * method that dispatches the protocol-level toggle on behalf of the
	 * caller, and the {@link IAgentHostMcpServer.logOutputChannelId} of the
	 * host backing the session. Returns an empty array for sessions not
	 * backed by an agent host, or that don't expose any MCP servers.
	 */
	getMcpServers(sessionResource: URI): readonly IAgentHostMcpServer[];

	/**
	 * Adds (or replaces) an agent-host-level MCP server in the root config of
	 * the agent host backing `sessionResource`. The write is routed to the
	 * correct connection (local or remote) for that session. No-op for
	 * sessions not backed by an agent host.
	 */
	addMcpServer(sessionResource: URI, name: string, config: IMcpServerConfiguration): void;

	/**
	 * Runs interactive authentication for an auth-required MCP server in an
	 * agent-host session. Returns false when the session/server cannot be
	 * resolved or authentication did not complete.
	 */
	authenticateMcpServer(sessionResource: URI, serverId: string): Promise<boolean>;
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
	addMcpServer(_sessionResource: URI, _name: string, _config: IMcpServerConfiguration): void {
		// no-op
	}
	authenticateMcpServer(_sessionResource: URI, _serverId: string): Promise<boolean> {
		return Promise.resolve(false);
	}
}

export interface IAgentHostCustomizationTarget {
	readonly customizations: readonly Customization[];
	readonly workingDirectory?: string;
	readonly logOutputChannelId?: string;
	readonly rootConfig?: RootConfigState;
	authenticate(request: { resource: string; scopes?: readonly string[]; token: string }): Promise<unknown>;
	setCustomizationEnabled(rawId: string, enabled: boolean): void;
	setRootConfigValue(property: string, value: unknown): void;
}

export abstract class AbstractAgentHostCustomizationService extends Disposable implements IAgentHostCustomizationService {
	declare readonly _serviceBrand: undefined;

	private readonly _onDidChangeCustomAgents = this._register(new Emitter<void>());
	private readonly _onDidChangeCustomizations = this._register(new Emitter<void>());
	readonly onDidChangeCustomAgents: Event<void> = this._onDidChangeCustomAgents.event;
	readonly onDidChangeCustomizations: Event<void> = this._onDidChangeCustomizations.event;

	protected constructor(
		protected readonly _instantiationService: IInstantiationService,
		protected readonly _logService: ILogService,
	) {
		super();
	}

	protected abstract _resolveTarget(sessionResource: URI): IAgentHostCustomizationTarget | undefined;

	getCustomAgents(sessionResource: URI): readonly AgentCustomization[] {
		return getEffectiveAgents(this._resolveTarget(sessionResource)?.customizations);
	}

	getCustomizations(sessionResource: URI): readonly Customization[] {
		return this._resolveTarget(sessionResource)?.customizations ?? [];
	}

	getWorkingDirectory(sessionResource: URI): string | undefined {
		return this._resolveTarget(sessionResource)?.workingDirectory;
	}

	getMcpServers(sessionResource: URI): readonly IAgentHostMcpServer[] {
		const target = this._resolveTarget(sessionResource);
		if (!target) {
			return [];
		}
		return this._flattenMcpServers(target.customizations)
			.map((c): IAgentHostMcpServer => ({
				id: this._scopedMcpServerId(sessionResource, c.id),
				name: c.name,
				enabled: c.enabled,
				status: c.state.kind,
				state: c.state,
				logOutputChannelId: target.logOutputChannelId,
				setEnabled: (enabled: boolean) => target.setCustomizationEnabled(c.id, enabled),
			}));
	}

	addMcpServer(sessionResource: URI, name: string, config: IMcpServerConfiguration): void {
		const target = this._resolveTarget(sessionResource);
		const existingServers = target?.rootConfig?.values?.[AgentHostMcpServersConfigKey];
		if (!target || !target.rootConfig) {
			return;
		}
		const servers: AgentHostMcpServers = existingServers && typeof existingServers === 'object' && !Array.isArray(existingServers)
			? existingServers as AgentHostMcpServers
			: {};
		target.setRootConfigValue(AgentHostMcpServersConfigKey, {
			...servers,
			[name]: config,
		});
	}

	async authenticateMcpServer(sessionResource: URI, serverId: string): Promise<boolean> {
		const target = this._resolveTarget(sessionResource);
		if (!target) {
			return false;
		}
		const server = this._findMcpServer(target.customizations, serverId);
		if (!server || server.state.kind !== McpServerStatus.AuthRequired) {
			return false;
		}
		const scopedServerId = agentHostMcpServerId(sessionResource.authority, server.name, server.state.resource.resource);
		const resource = {
			...server.state.resource,
			scopes_supported: server.state.requiredScopes ?? server.state.resource.scopes_supported,
		};
		try {
			return await this._instantiationService.invokeFunction(resolveMcpServerAuthentication, resource, {
				allowInteraction: true,
				logPrefix: '[AgentHost]',
				mcpServerId: scopedServerId,
				mcpServerName: server.name,
				mcpServerUrl: server.state.resource.resource,
				agentHost: { scheme: sessionResource.scheme, authority: sessionResource.authority },
				authenticate: request => target.authenticate(request),
			});
		} catch (err) {
			this._logService.error(`[AgentHost] Failed to authenticate MCP server '${server.name}'`, err);
			return false;
		}
	}

	protected _fireCustomAgentsChanged(): void {
		this._onDidChangeCustomAgents.fire();
	}

	protected _fireCustomizationsChanged(): void {
		this._onDidChangeCustomizations.fire();
	}

	private _flattenMcpServers(customizations: readonly Customization[]): McpServerCustomization[] {
		return customizations.flatMap(c => c.type === CustomizationType.McpServer
			? [c]
			: c.children?.filter(c => c.type === CustomizationType.McpServer) ?? []);
	}

	private _findMcpServer(customizations: readonly Customization[], serverId: string): McpServerCustomization | undefined {
		for (const server of this._flattenMcpServers(customizations)) {
			if (server.id === serverId || this._isScopedMcpServerIdForRawId(serverId, server.id)) {
				return server;
			}
		}
		return undefined;
	}

	protected _scopedMcpServerId(sessionResource: URI, rawId: string): string {
		return `${sessionResource.authority}/${rawId}`;
	}

	private _isScopedMcpServerIdForRawId(serverId: string, rawId: string): boolean {
		const separator = serverId.indexOf('/');
		return separator >= 0 && serverId.slice(separator + 1) === rawId;
	}
}

class WorkbenchAgentHostCustomizationService extends AbstractAgentHostCustomizationService {

	private readonly _sessionStateSubscriptions = this._register(new DisposableMap<string, IDisposable & { readonly connection: IAgentConnection; readonly backendSession: URI; readonly sub: IAgentSubscription<SessionState> }>());

	constructor(
		@IAgentHostConnectionsService private readonly _connectionsService: IAgentHostConnectionsService,
		@IAgentHostUntitledProvisionalSessionService private readonly _provisionalSessionService: IAgentHostUntitledProvisionalSessionService,
		@IInstantiationService instantiationService: IInstantiationService,
		@ILogService logService: ILogService,
		@IChatService chatService: IChatService,
	) {
		super(instantiationService, logService);

		this._register(this._connectionsService.ambientConnection.onDidAction(envelope => {
			switch (envelope.action.type) {
				case ActionType.SessionCustomizationsChanged:
				case ActionType.SessionCustomizationUpdated:
				case ActionType.SessionMcpServerStateChanged:
					this._fireCustomizationsChanged();
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

	protected override _resolveTarget(sessionResource: URI): IAgentHostCustomizationTarget | undefined {
		const target = this._resolveSessionTarget(sessionResource);
		if (!target) {
			return undefined;
		}
		const sessionState = this._readSessionState(sessionResource);
		const rootState = target.connection.rootState.value;
		const channel = target.backendSession.toString();
		return {
			customizations: sessionState?.customizations ?? [],
			workingDirectory: sessionState?.workingDirectory,
			logOutputChannelId: this._resolveLogOutputChannelId(sessionResource, target.backendSession),
			rootConfig: rootState && !(rootState instanceof Error) ? rootState.config : undefined,
			authenticate: request => target.connection.authenticate(request),
			setCustomizationEnabled: (rawId, enabled) => {
				target.connection.dispatch(channel, {
					type: ActionType.SessionCustomizationToggled,
					id: rawId,
					enabled,
				});
			},
			setRootConfigValue: (property, value) => {
				target.connection.dispatch(ROOT_STATE_URI, {
					type: ActionType.RootConfigChanged,
					config: { [property]: value },
				});
			}
		};
	}

	private _resolveLogOutputChannelId(sessionResource: URI, backendSession: URI): string | undefined {
		if (sessionResource.scheme.startsWith(LOCAL_AGENT_HOST_SCHEME_PREFIX)) {
			return AGENT_HOST_LOG_OUTPUT_CHANNEL_ID;
		}

		if (isRemoteAgentHostSessionType(sessionResource.scheme)) {
			const backendProvider = AgentSession.provider(backendSession);
			// The facade descriptor already exposes the sanitized authority, so
			// we match the session scheme against `remote-<authority>-<provider>`.
			const info = backendProvider
				? this._connectionsService.connections.find(c => !c.isAmbient && c.address !== undefined && sessionResource.scheme === remoteAgentHostSessionTypeId(c.authority, backendProvider))
				: undefined;
			return info?.address ? remoteAgentHostLogOutputChannelId(info.address) : undefined;
		}

		return undefined;
	}

	private _readSessionState(sessionResource: URI): SessionState | undefined {
		const target = this._resolveSessionTarget(sessionResource);
		const value = target ? this._ensureSessionStateSubscription(sessionResource, target)?.sub.value : undefined;
		return value && !(value instanceof Error) ? value : undefined;
	}

	private _ensureSessionStateSubscription(sessionResource: URI, target: IAgentHostSessionResolution): (IDisposable & { readonly connection: IAgentConnection; readonly backendSession: URI; readonly sub: IAgentSubscription<SessionState> }) | undefined {
		const key = sessionResource.toString();
		const existing = this._sessionStateSubscriptions.get(key);
		if (existing?.backendSession.toString() === target.backendSession.toString() && existing.connection === target.connection) {
			return existing;
		}

		const ref = target.connection.getSubscription(StateComponents.Session, target.backendSession, 'AgentHostCustomizationService');
		const sub = ref.object;
		const listener = sub.onDidChange(() => {
			this._fireCustomizationsChanged();
			this._fireCustomAgentsChanged();
		});
		const entry = {
			connection: target.connection,
			backendSession: target.backendSession,
			sub,
			dispose: () => {
				listener.dispose();
				ref.dispose();
			},
		};
		this._sessionStateSubscriptions.set(key, entry);
		return entry;
	}

	/**
	 * Resolves a chat session resource to the backend agent-session URI plus
	 * the {@link IAgentConnection} (local or remote) that owns it. Returns
	 * `undefined` for sessions not backed by an agent host.
	 */
	private _resolveSessionTarget(sessionResource: URI): IAgentHostSessionResolution | undefined {
		const provisionalSession = this._provisionalSessionService.get(sessionResource);
		if (provisionalSession) {
			// Provisional (untitled) sessions are always backed by the ambient host.
			return { connection: this._connectionsService.ambientConnection, backendSession: provisionalSession };
		}

		if (isUntitledChatSession(sessionResource)) {
			return undefined;
		}

		return this._connectionsService.resolveSessionResource(sessionResource);
	}
}

registerSingleton(IAgentHostCustomizationService, WorkbenchAgentHostCustomizationService, InstantiationType.Delayed);
