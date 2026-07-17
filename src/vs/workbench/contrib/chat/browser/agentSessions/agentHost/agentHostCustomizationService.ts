/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../../../../base/common/uri.js';
import { Emitter, Event } from '../../../../../../base/common/event.js';
import { Disposable, DisposableResourceMap, IDisposable } from '../../../../../../base/common/lifecycle.js';
import { NKeyMap } from '../../../../../../base/common/map.js';
import { IReader } from '../../../../../../base/common/observable.js';
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
import { IStorageService } from '../../../../../../platform/storage/common/storage.js';
import { ContributionEnablementState, EnablementModel, isContributionEnabled } from '../../../common/enablement.js';
import { IChatService } from '../../../common/chatService/chatService.js';
import { isUntitledChatSession } from '../../../common/model/chatUri.js';
import { IAgentHostUntitledProvisionalSessionService } from './agentHostUntitledProvisionalSessionService.js';
import { IAgentHostMcpServer } from '../../../../../../sessions/common/agentHostSessionsProvider.js';
import { resolveMcpServerAuthentication, agentHostMcpServerId } from './agentHostAuth.js';

const MCP_SERVER_ENABLEMENT_STORAGE_KEY = 'chat.agentHost.mcpServerEnablement';

interface IMcpServerTrackingEntry {
	readonly rawId: string;
	readonly serverName: string;
	readonly durableState: ContributionEnablementState;
}

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
	 * caller, lifecycle actions, and the
	 * {@link IAgentHostMcpServer.logOutputChannelId} of the host backing the
	 * session. Returns an empty array for sessions not
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

	/** Reads the durable profile/workspace policy shared by matching servers on the same agent host. */
	getMcpServerEnablement(sessionResource: URI, serverName: string, reader?: IReader): ContributionEnablementState;

	/** Persists a durable policy that will apply before the session's next turn. */
	setMcpServerEnablement(sessionResource: URI, serverName: string, state: ContributionEnablementState): void;

	/** Applies durable MCP preferences that changed since this session's previous turn. */
	prepareMcpServersForTurn(sessionResource: URI): void;
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
	getMcpServerEnablement(_sessionResource: URI, _serverName: string, _reader?: IReader): ContributionEnablementState {
		return ContributionEnablementState.EnabledProfile;
	}
	setMcpServerEnablement(_sessionResource: URI, _serverName: string, _state: ContributionEnablementState): void {
		// no-op
	}
	prepareMcpServersForTurn(_sessionResource: URI): void {
		// no-op
	}
}

export interface IAgentHostCustomizationTarget {
	readonly customizations: readonly Customization[];
	readonly workingDirectory?: string;
	readonly logOutputChannelId?: string;
	readonly rootConfig?: RootConfigState;
	authenticate(request: { resource: string; scopes?: readonly string[]; token: string }): Promise<unknown>;
	setCustomizationEnabled(rawId: string, enabled: boolean): void;
	startMcpServer(rawId: string): Promise<void>;
	stopMcpServer(rawId: string): Promise<void>;
	setRootConfigValue(property: string, value: unknown): void;
}

export abstract class AbstractAgentHostCustomizationService extends Disposable implements IAgentHostCustomizationService {
	declare readonly _serviceBrand: undefined;

	private readonly _onDidChangeCustomAgents = this._register(new Emitter<void>());
	private readonly _onDidChangeCustomizations = this._register(new Emitter<void>());
	readonly onDidChangeCustomAgents: Event<void> = this._onDidChangeCustomAgents.event;
	readonly onDidChangeCustomizations: Event<void> = this._onDidChangeCustomizations.event;

	private readonly _mcpEnablementModel: EnablementModel;
	private readonly _mcpServerTracking = new NKeyMap<IMcpServerTrackingEntry, [string, string]>();

	protected constructor(
		protected readonly _instantiationService: IInstantiationService,
		protected readonly _logService: ILogService,
		storageService: IStorageService,
	) {
		super();
		this._mcpEnablementModel = this._register(new EnablementModel(MCP_SERVER_ENABLEMENT_STORAGE_KEY, storageService));
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
		const servers = this._flattenMcpServers(target.customizations);
		return servers.map((c): IAgentHostMcpServer => ({
			id: this._scopedMcpServerId(sessionResource, c.id),
			name: c.name,
			enabled: c.enabled,
			status: c.state.kind,
			state: c.state,
			logOutputChannelId: target.logOutputChannelId,
			setEnabled: (enabled: boolean) => target.setCustomizationEnabled(c.id, enabled),
			start: () => target.startMcpServer(c.id),
			stop: () => target.stopMcpServer(c.id),
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
		try {
			return await this._instantiationService.invokeFunction(resolveMcpServerAuthentication, server.state.resource, {
				allowInteraction: true,
				logPrefix: '[AgentHost]',
				mcpServerId: scopedServerId,
				mcpServerName: server.name,
				mcpServerUrl: server.state.resource.resource,
				scopes: server.state.requiredScopes ?? [],
				agentHost: { scheme: sessionResource.scheme, authority: sessionResource.authority },
				authenticate: request => target.authenticate(request),
			});
		} catch (err) {
			this._logService.error(`[AgentHost] Failed to authenticate MCP server '${server.name}'`, err);
			return false;
		}
	}

	getMcpServerEnablement(sessionResource: URI, serverName: string, reader?: IReader): ContributionEnablementState {
		return this._mcpEnablementModel.readEnabledWithWorkspaceKey(
			this._mcpServerProfileEnablementKey(sessionResource, serverName),
			this._mcpServerWorkspaceEnablementKey(sessionResource, serverName),
			reader,
		);
	}

	setMcpServerEnablement(sessionResource: URI, serverName: string, state: ContributionEnablementState): void {
		this._mcpEnablementModel.setEnabledWithWorkspaceKey(
			this._mcpServerProfileEnablementKey(sessionResource, serverName),
			this._mcpServerWorkspaceEnablementKey(sessionResource, serverName),
			state,
		);
	}

	prepareMcpServersForTurn(sessionResource: URI): void {
		const trackingResource = this._mcpTrackingResource(sessionResource);
		const target = this._resolveTarget(trackingResource);
		if (!target) {
			return;
		}
		this._reconcileMcpServerTracking(trackingResource, this._flattenMcpServers(target.customizations), target);
	}

	/** Drops all durable-enablement tracking for a session that is no longer known. */
	protected _clearMcpServerTracking(sessionResource: URI): void {
		this._mcpServerTracking.deleteAll(this._mcpTrackingResource(sessionResource).toString());
	}

	private _reconcileMcpServerTracking(sessionResource: URI, servers: readonly McpServerCustomization[], target: IAgentHostCustomizationTarget): void {
		const sessionKey = sessionResource.toString();
		const currentRawIds = new Set(servers.map(server => server.id));
		for (const entry of this._mcpServerTracking.getAll(sessionKey)) {
			if (!currentRawIds.has(entry.rawId)) {
				this._mcpServerTracking.delete(sessionKey, entry.rawId);
			}
		}

		for (const server of servers) {
			const durableState = this.getMcpServerEnablement(sessionResource, server.name);
			const previous = this._mcpServerTracking.get(sessionKey, server.id);
			if (previous?.serverName === server.name && previous.durableState === durableState) {
				continue;
			}
			this._mcpServerTracking.set({ rawId: server.id, serverName: server.name, durableState }, sessionKey, server.id);
			if (previous || durableState !== ContributionEnablementState.EnabledProfile) {
				target.setCustomizationEnabled(server.id, isContributionEnabled(durableState));
			}
		}
	}

	private _mcpServerProfileEnablementKey(sessionResource: URI, serverName: string): string {
		return JSON.stringify([sessionResource.scheme, serverName]);
	}

	private _mcpServerWorkspaceEnablementKey(sessionResource: URI, serverName: string): string | undefined {
		const workingDirectory = this.getWorkingDirectory(sessionResource);
		return workingDirectory ? JSON.stringify([sessionResource.scheme, workingDirectory, serverName]) : undefined;
	}

	private _mcpTrackingResource(sessionResource: URI): URI {
		return sessionResource.fragment ? sessionResource.with({ fragment: null }) : sessionResource;
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

	private readonly _sessionStateSubscriptions = this._register(new DisposableResourceMap<IDisposable & { readonly connection: IAgentConnection; readonly backendSession: URI; readonly sub: IAgentSubscription<SessionState> }>());

	constructor(
		@IAgentHostConnectionsService private readonly _connectionsService: IAgentHostConnectionsService,
		@IAgentHostUntitledProvisionalSessionService private readonly _provisionalSessionService: IAgentHostUntitledProvisionalSessionService,
		@IInstantiationService instantiationService: IInstantiationService,
		@ILogService logService: ILogService,
		@IChatService private readonly _chatService: IChatService,
		@IStorageService storageService: IStorageService,
	) {
		super(instantiationService, logService, storageService);

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
			const existing = this._sessionStateSubscriptions.get(sessionResource);
			const currentBackend = this._provisionalSessionService.get(sessionResource);
			if (existing && existing.backendSession.toString() !== currentBackend?.toString()) {
				this._clearMcpServerTracking(sessionResource);
			}
			this._sessionStateSubscriptions.deleteAndDispose(sessionResource);
			this._fireCustomizationsChanged();
			this._fireCustomAgentsChanged();
		}));
		this._register(this._chatService.onDidDisposeSession(e => {
			for (const sessionResource of e.sessionResources) {
				this._sessionStateSubscriptions.deleteAndDispose(sessionResource);
				this._clearMcpServerTracking(sessionResource);
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
			startMcpServer: rawId => {
				target.connection.dispatch(channel, {
					type: ActionType.SessionMcpServerStartRequested,
					id: rawId,
				});
				return Promise.resolve();
			},
			stopMcpServer: rawId => {
				target.connection.dispatch(channel, {
					type: ActionType.SessionMcpServerStopRequested,
					id: rawId,
				});
				return Promise.resolve();
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
		const existing = this._sessionStateSubscriptions.get(sessionResource);
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
		this._sessionStateSubscriptions.set(sessionResource, entry);
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
