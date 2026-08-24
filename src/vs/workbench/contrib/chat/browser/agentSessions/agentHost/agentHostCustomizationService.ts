/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../../../../base/common/uri.js';
import { Emitter, Event } from '../../../../../../base/common/event.js';
import { StringSHA1 } from '../../../../../../base/common/hash.js';
import { Disposable, DisposableResourceMap, IDisposable, toDisposable } from '../../../../../../base/common/lifecycle.js';
import { ResourceSet } from '../../../../../../base/common/map.js';
import { AgentHostMcpServers, AgentHostMcpServersConfigKey } from '../../../../../../platform/agentHost/common/agentHostSchema.js';
import { IAgentConnection } from '../../../../../../platform/agentHost/common/agentService.js';
import { IAgentHostConnectionsService, IAgentHostSessionResolution } from '../../../../../../platform/agentHost/common/agentHostConnectionsService.js';
import { getEffectiveAgents } from '../../../../../../platform/agentHost/common/customAgents.js';
import { getCustomizationDisabledReason, isCustomizationEnabled, withCustomizationEnablement } from '../../../../../../platform/agentHost/common/customizationEnablement.js';
import { type IAgentSubscription } from '../../../../../../platform/agentHost/common/state/agentSubscription.js';
import { ActionType } from '../../../../../../platform/agentHost/common/state/protocol/actions.js';
import { CustomizationEnablementKind, CustomizationType, McpServerCustomization, McpServerStatus, type Customization, type CustomizationEnablement, type McpServerState, type PluginCustomization, type RootConfigState, type SessionState } from '../../../../../../platform/agentHost/common/state/protocol/state.js';
import { AgentCustomization, ROOT_STATE_URI, StateComponents, readSessionFolderPickerDecision, type ISessionFolderPickerDecision } from '../../../../../../platform/agentHost/common/state/sessionState.js';
import { InstantiationType, registerSingleton } from '../../../../../../platform/instantiation/common/extensions.js';
import { createDecorator, IInstantiationService } from '../../../../../../platform/instantiation/common/instantiation.js';
import { IMcpServerConfiguration } from '../../../../../../platform/mcp/common/mcpPlatformTypes.js';
import { ILogger, ILoggerService, ILogService } from '../../../../../../platform/log/common/log.js';
import { localize } from '../../../../../../nls.js';
import { IChatService } from '../../../common/chatService/chatService.js';
import { isUntitledChatSession } from '../../../common/model/chatUri.js';
import { IAgentHostUntitledProvisionalSessionService } from './agentHostUntitledProvisionalSessionService.js';
import { IAgentHostActiveClientService } from './agentHostActiveClientService.js';
import { IAgentHostMcpServer } from '../../../../../../sessions/common/agentHostSessionsProvider.js';
import { resolveMcpServerAuthentication, agentHostMcpServerId } from './agentHostAuth.js';
import { IOutputService } from '../../../../../services/output/common/output.js';

export const IAgentHostCustomizationService = createDecorator<IAgentHostCustomizationService>('agentHostCustomizationService');

export interface IAgentHostCustomizationService {
	readonly _serviceBrand: undefined;
	readonly onDidChangeCustomAgents: Event<void>;
	readonly onDidChangeCustomizations: Event<void>;

	getCustomAgents(sessionResource: URI): readonly AgentCustomization[];

	getCustomizations(sessionResource: URI): readonly Customization[];

	/**
	 * The harness-owned decision about the multi-root Folder picker for a
	 * session (or `undefined` when the provider expressed no opinion). Read from
	 * the session's `_meta`; changes are reported via
	 * {@link onDidChangeCustomizations}.
	 */
	getFolderPickerDecision(sessionResource: URI): ISessionFolderPickerDecision | undefined;

	getWorkingDirectory(sessionResource: URI): string | undefined;

	/**
	 * The full ordered set of working-directory roots for a session (index 0 =
	 * primary).
	 * Returns an empty array for sessions with no working directory.
	 */
	getWorkingDirectories(sessionResource: URI): readonly string[];

	/**
	 * Returns the MCP servers exposed by an agent-host session. Each entry
	 * carries the current status, a {@link IAgentHostMcpServer.setEnabled}
	 * method that dispatches the protocol-level toggle on behalf of the
	 * caller, and lifecycle actions. Per-server diagnostics are revealed via
	 * {@link showMcpServerLog}. Returns an empty array for sessions not
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

	/** Changes one scope while preserving all other explicit decisions. */
	setCustomizationEnablement(sessionResource: URI, customizationId: string, currentEnablement: readonly CustomizationEnablement[] | undefined, kind: CustomizationEnablementKind, enabled: boolean): void;

	/**
	 * Reveals the per-server MCP diagnostics Output channel for the server
	 * `serverId` in the agent-host session `sessionResource`, making its hidden
	 * logger visible first. The channel is an internal detail of this service --
	 * callers identify the server the same way they do for
	 * {@link authenticateMcpServer}. No-op when the session/server cannot be
	 * resolved.
	 */
	showMcpServerLog(sessionResource: URI, serverId: string, beforeShow?: () => Promise<void>): Promise<void>;
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
	getFolderPickerDecision(_sessionResource: URI): ISessionFolderPickerDecision | undefined {
		return undefined;
	}
	getWorkingDirectory(sessionResource: URI): string | undefined {
		return undefined;
	}
	getWorkingDirectories(_sessionResource: URI): readonly string[] {
		return [];
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
	setCustomizationEnablement(_sessionResource: URI, _customizationId: string, _currentEnablement: readonly CustomizationEnablement[] | undefined, _kind: CustomizationEnablementKind, _enabled: boolean): void {
		// no-op
	}
	async showMcpServerLog(_sessionResource: URI, _serverId: string, beforeShow?: () => Promise<void>): Promise<void> {
		await beforeShow?.();
	}
}

export interface IAgentHostCustomizationTarget {
	readonly customizations: readonly Customization[];
	readonly folderPickerDecision?: ISessionFolderPickerDecision;
	readonly workingDirectory?: string;
	readonly workingDirectories?: readonly string[];
	readonly rootConfig?: RootConfigState;
	isBundledMcpServer(pluginUri: string, serverName: string): boolean;
	authenticate(request: { resource: string; scopes?: readonly string[]; token: string }): Promise<unknown>;
	setCustomizationEnablement(rawId: string, enablement: readonly CustomizationEnablement[]): void;
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

	private readonly _mcpLogRegistry: AgentHostMcpServerLogRegistry;
	/**
	 * Sessions whose MCP diagnostics we mirror into per-server Output channels.
	 * A session is tracked once the user reveals a server's output; from then
	 * on every state change is recorded via {@link onDidChangeCustomizations},
	 * so subsequent failures and recoveries land in the channel history.
	 */
	private readonly _mcpDiagnosticSessions = new ResourceSet();

	protected constructor(
		protected readonly _instantiationService: IInstantiationService,
		protected readonly _logService: ILogService,
	) {
		super();
		this._mcpLogRegistry = this._register(this._instantiationService.createInstance(AgentHostMcpServerLogRegistry));
		this._register(this.onDidChangeCustomizations(() => this._recordMcpDiagnostics()));
	}

	protected abstract _resolveTarget(sessionResource: URI): IAgentHostCustomizationTarget | undefined;

	getCustomAgents(sessionResource: URI): readonly AgentCustomization[] {
		return getEffectiveAgents(this._resolveTarget(sessionResource)?.customizations);
	}

	getCustomizations(sessionResource: URI): readonly Customization[] {
		return this._resolveTarget(sessionResource)?.customizations ?? [];
	}

	getFolderPickerDecision(sessionResource: URI): ISessionFolderPickerDecision | undefined {
		return this._resolveTarget(sessionResource)?.folderPickerDecision;
	}

	getWorkingDirectory(sessionResource: URI): string | undefined {
		return this._resolveTarget(sessionResource)?.workingDirectory;
	}

	getWorkingDirectories(sessionResource: URI): readonly string[] {
		return this._resolveTarget(sessionResource)?.workingDirectories ?? [];
	}

	getMcpServers(sessionResource: URI): readonly IAgentHostMcpServer[] {
		const target = this._resolveTarget(sessionResource);
		if (!target) {
			return [];
		}
		return getPresentableMcpServerCustomizations(target.customizations)
			.map(({ server, plugin }): IAgentHostMcpServer => ({
				id: this._scopedMcpServerId(sessionResource, server.id),
				name: server.name,
				enabled: isCustomizationEnabled(server) && (!plugin || isCustomizationEnabled(plugin)),
				enablement: server.enablement,
				isPluginProvided: plugin !== undefined,
				isClientBundled: plugin !== undefined && target.isBundledMcpServer(plugin.uri, server.name),
				owningPluginClientId: plugin?.clientId,
				disabledReason: getCustomizationDisabledReason(server, plugin),
				status: server.state.kind,
				state: server.state,
				logOutputChannelId: channelIdForMcpServer(sessionResource.toString(), server.id),
				setEnabled: (enabled: boolean) => target.setCustomizationEnablement(server.id, withCustomizationEnablement(server.enablement, CustomizationEnablementKind.Session, { kind: CustomizationEnablementKind.Session, enabled })),
				start: () => target.startMcpServer(server.id),
				stop: () => target.stopMcpServer(server.id),
			}));
	}

	showMcpServerLog(sessionResource: URI, serverId: string, beforeShow?: () => Promise<void>): Promise<void> {
		const target = this._resolveTarget(sessionResource);
		if (!target) {
			return Promise.resolve();
		}
		const entry = flattenMcpServerCustomizations(target.customizations).find(({ server }) => this._scopedMcpServerId(sessionResource, server.id) === serverId);
		if (!entry) {
			return Promise.resolve();
		}
		const { server, plugin } = entry;
		// Ensure the session is tracked and its channels exist, then reveal.
		this._trackMcpDiagnostics(sessionResource, target);
		const channelId = this._mcpLogRegistry.record({ sessionResource, rawId: server.id, name: server.name, enabled: isCustomizationEnabled(server) && (!plugin || isCustomizationEnabled(plugin)), state: server.state });
		return this._mcpLogRegistry.show(channelId, beforeShow);
	}

	/**
	 * Registers `sessionResource` for MCP diagnostics mirroring and records the
	 * currently-observed state of each of its servers. Idempotent: registering
	 * an already-tracked session simply re-records (dedup'd by state signature).
	 */
	private _trackMcpDiagnostics(sessionResource: URI, target: IAgentHostCustomizationTarget): void {
		this._mcpDiagnosticSessions.add(sessionResource);
		for (const { server, plugin } of flattenMcpServerCustomizations(target.customizations)) {
			this._mcpLogRegistry.record({ sessionResource, rawId: server.id, name: server.name, enabled: isCustomizationEnabled(server) && (!plugin || isCustomizationEnabled(plugin)), state: server.state });
		}
	}

	/** Re-records every tracked session's MCP server states (on any customizations change). */
	private _recordMcpDiagnostics(): void {
		for (const sessionResource of this._mcpDiagnosticSessions) {
			const target = this._resolveTarget(sessionResource);
			if (!target) {
				continue;
			}
			for (const { server, plugin } of flattenMcpServerCustomizations(target.customizations)) {
				this._mcpLogRegistry.record({ sessionResource, rawId: server.id, name: server.name, enabled: isCustomizationEnabled(server) && (!plugin || isCustomizationEnabled(plugin)), state: server.state });
			}
		}
	}

	/** Stops mirroring and disposes all MCP diagnostics channels for a session that is going away. */
	protected _disposeMcpDiagnostics(sessionResource: URI): void {
		this._mcpDiagnosticSessions.delete(sessionResource);
		this._mcpLogRegistry.disposeForSession(sessionResource);
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
				oauthClient: server.state.oauthClient,
				scopes: server.state.requiredScopes ?? [],
				agentHost: { scheme: sessionResource.scheme, authority: sessionResource.authority },
				authenticate: request => target.authenticate(request),
			});
		} catch (err) {
			this._logService.error(`[AgentHost] Failed to authenticate MCP server '${server.name}'`, err);
			return false;
		}
	}

	setCustomizationEnablement(sessionResource: URI, customizationId: string, currentEnablement: readonly CustomizationEnablement[] | undefined, kind: CustomizationEnablementKind, enabled: boolean): void {
		const target = this._resolveTarget(sessionResource);
		if (!target) {
			this._logService.warn(`[AgentHostCustomizationService] Cannot change enablement for '${customizationId}' because its session is unavailable.`);
			return;
		}
		const customization = this._findCustomization(target.customizations, customizationId);
		if (!customization) {
			this._logService.warn(`[AgentHostCustomizationService] Cannot change enablement for unavailable customization '${customizationId}'.`);
			return;
		}
		const entry = kind === CustomizationEnablementKind.Workspace
			? this._workspaceEnablementEntry(target, enabled)
			: { kind, enabled };
		if (!entry) {
			this._logService.warn(`[AgentHostCustomizationService] Cannot set workspace enablement for '${customizationId}' without a working directory.`);
			return;
		}
		target.setCustomizationEnablement(customization.id, withCustomizationEnablement(currentEnablement, kind, entry));
	}

	private _workspaceEnablementEntry(target: IAgentHostCustomizationTarget, enabled: boolean): CustomizationEnablement | undefined {
		const workingDirectory = target.workingDirectories?.[0] ?? target.workingDirectory;
		return workingDirectory ? { kind: CustomizationEnablementKind.Workspace, uri: workingDirectory, enabled } : undefined;
	}

	protected _fireCustomAgentsChanged(): void {
		this._onDidChangeCustomAgents.fire();
	}

	protected _fireCustomizationsChanged(): void {
		this._onDidChangeCustomizations.fire();
	}

	private _findMcpServer(customizations: readonly Customization[], serverId: string): McpServerCustomization | undefined {
		for (const { server } of flattenMcpServerCustomizations(customizations)) {
			if (server.id === serverId || this._isScopedMcpServerIdForRawId(serverId, server.id)) {
				return server;
			}
		}
		return undefined;
	}

	private _findCustomization(customizations: readonly Customization[], customizationId: string): { readonly id: string } | undefined {
		for (const customization of customizations) {
			if (customization.id === customizationId || this._isScopedMcpServerIdForRawId(customizationId, customization.id)) {
				return customization;
			}
			const child = (customization.type !== CustomizationType.McpServer ? customization.children : undefined)?.find(child => child.id === customizationId || this._isScopedMcpServerIdForRawId(customizationId, child.id));
			if (child) {
				return child;
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

/** One MCP server customization, with the position it was published at. */
export interface IMcpServerCustomizationEntry {
	readonly server: McpServerCustomization;
	/**
	 * The plugin that declares this server. Absent both for a server published at the top level
	 * and for one declared by a {@link CustomizationType.Directory} container, so it says nothing
	 * about where in the tree the server sits -- use {@link isTopLevel} for that.
	 */
	readonly plugin?: PluginCustomization;
	/** Whether the agent host published this server as a customization of the session itself. */
	readonly isTopLevel: boolean;
}

/** Every MCP server customization in a session, including duplicates of the same server. */
export function flattenMcpServerCustomizations(customizations: readonly Customization[]): readonly IMcpServerCustomizationEntry[] {
	return customizations.flatMap((customization): IMcpServerCustomizationEntry[] => customization.type === CustomizationType.McpServer
		? [{ server: customization, isTopLevel: true }]
		: customization.children?.filter(child => child.type === CustomizationType.McpServer).map(server => ({
			server,
			plugin: customization.type === CustomizationType.Plugin ? customization : undefined,
			isTopLevel: false,
		})) ?? []);
}

/**
 * The MCP servers to *show* for a session: one entry per server.
 *
 * A session can carry two customizations for one server: the declaration, published as a child of
 * whatever declared it, and a top-level entry the agent host mints for a server the SDK reports
 * before that child resolves by name. A child is dropped when a top-level customization already
 * speaks for its name, because the top-level copy is the one the host keeps live and resolves for
 * lifecycle and enablement.
 *
 * Tree position is the signal, not the shape of the minted id and not the absence of an owning
 * plugin -- a directory-declared child has none either. Only presentation dedupes; lookups
 * elsewhere walk every customization, so an id from either copy still resolves. Servers of the
 * same name from different containers are left alone, because they are different servers.
 */
export function getPresentableMcpServerCustomizations(customizations: readonly Customization[]): readonly IMcpServerCustomizationEntry[] {
	const entries = flattenMcpServerCustomizations(customizations);
	const topLevelNames = new Set<string>();
	for (const entry of entries) {
		if (entry.isTopLevel) {
			topLevelNames.add(entry.server.name);
		}
	}
	if (topLevelNames.size === 0) {
		return entries;
	}
	return entries.filter(entry => entry.isTopLevel || !topLevelNames.has(entry.server.name));
}

class WorkbenchAgentHostCustomizationService extends AbstractAgentHostCustomizationService {

	private readonly _sessionStateSubscriptions = this._register(new DisposableResourceMap<IDisposable & { readonly connection: IAgentConnection; readonly backendSession: URI; readonly sub: IAgentSubscription<SessionState> }>());

	constructor(
		@IAgentHostConnectionsService private readonly _connectionsService: IAgentHostConnectionsService,
		@IAgentHostUntitledProvisionalSessionService private readonly _provisionalSessionService: IAgentHostUntitledProvisionalSessionService,
		@IInstantiationService instantiationService: IInstantiationService,
		@ILogService logService: ILogService,
		@IChatService private readonly _chatService: IChatService,
		@IAgentHostActiveClientService private readonly _activeClientService: IAgentHostActiveClientService,
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
			const existing = this._sessionStateSubscriptions.get(sessionResource);
			const currentBackend = this._provisionalSessionService.get(sessionResource);
			if (existing && existing.backendSession.toString() !== currentBackend?.toString()) {
				this._disposeMcpDiagnostics(sessionResource);
			}
			this._sessionStateSubscriptions.deleteAndDispose(sessionResource);
			this._fireCustomizationsChanged();
			this._fireCustomAgentsChanged();
		}));
		this._register(this._chatService.onDidDisposeSession(e => {
			for (const sessionResource of e.sessionResources) {
				this._sessionStateSubscriptions.deleteAndDispose(sessionResource);
				this._disposeMcpDiagnostics(sessionResource);
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
			folderPickerDecision: readSessionFolderPickerDecision(sessionState?._meta),
			workingDirectory: sessionState?.workingDirectories?.[0],
			workingDirectories: sessionState?.workingDirectories,
			rootConfig: rootState && !(rootState instanceof Error) ? rootState.config : undefined,
			isBundledMcpServer: (pluginUri, serverName) => this._activeClientService.isBundledMcpServer(pluginUri, serverName),
			authenticate: request => target.connection.authenticate(request),
			setCustomizationEnablement: (rawId, enablement) => {
				target.connection.dispatch(channel, {
					type: ActionType.SessionCustomizationToggled,
					id: rawId,
					enablement: [...enablement],
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

/**
 * Owns one hidden Output channel per (agent-host session, MCP server) pair.
 * {@link record} appends a line whenever a server's observable state changes
 * (its lifecycle kind, error, or enablement) so opening the channel shows the
 * server's history including any failure detail. {@link show} reveals the
 * (otherwise hidden) channel, and {@link disposeForSession} tears down every
 * channel belonging to a session that is going away.
 */
class AgentHostMcpServerLogRegistry extends Disposable {

	private readonly _entries = new Map<string, { readonly logger: ILogger; readonly dispose: () => void; lastSignature: string | undefined }>();
	/** Channel ids grouped by owning session key, so a session teardown can dispose them all. */
	private readonly _bySession = new Map<string, Set<string>>();

	constructor(
		@ILoggerService private readonly _loggerService: ILoggerService,
		@IOutputService private readonly _outputService: IOutputService,
	) {
		super();
		this._register(toDisposable(() => {
			for (const key of [...this._bySession.keys()]) {
				this._disposeSessionKey(key);
			}
		}));
	}

	/**
	 * Ensures a hidden diagnostics channel exists for the MCP server identified
	 * by `(sessionResource, rawId)` and records a line whenever its state
	 * changes (including the first observed state). Returns the stable channel
	 * id for the service to reveal via {@link show} -- the id is internal.
	 */
	record(server: { readonly sessionResource: URI; readonly rawId: string; readonly name: string; readonly enabled: boolean; readonly state: McpServerState }): string {
		const sessionKey = server.sessionResource.toString();
		const channelId = channelIdForMcpServer(sessionKey, server.rawId);
		let entry = this._entries.get(channelId);
		if (!entry) {
			const logger = this._loggerService.createLogger(channelId, {
				hidden: true,
				name: localize('agentHost.mcpServer.outputChannel', "MCP: {0}", server.name),
			});
			// Mirror the workbench MCP server pattern: a logger disposed but not
			// deregistered is reused as a no-op instance, so deregister on dispose.
			const dispose = () => {
				logger.dispose();
				this._loggerService.deregisterLogger(channelId);
			};
			entry = { logger, dispose, lastSignature: undefined };
			this._entries.set(channelId, entry);
			let group = this._bySession.get(sessionKey);
			if (!group) {
				group = new Set();
				this._bySession.set(sessionKey, group);
			}
			group.add(channelId);
		}

		const { signature, message, isError } = describeMcpServerState(server.name, server.enabled, server.state);
		if (entry.lastSignature !== signature) {
			entry.lastSignature = signature;
			if (isError) {
				entry.logger.error(message);
			} else {
				entry.logger.info(message);
			}
		}
		return channelId;
	}

	/** Reveals the diagnostics channel `channelId`, making its hidden logger visible. */
	async show(channelId: string, beforeShow?: () => Promise<void>): Promise<void> {
		if (!this._entries.has(channelId)) {
			return;
		}
		this._loggerService.setVisibility(channelId, true);
		await beforeShow?.();
		await this._outputService.showChannel(channelId);
	}

	/** Disposes every channel/logger owned by `sessionResource` (session teardown). */
	disposeForSession(sessionResource: URI): void {
		this._disposeSessionKey(sessionResource.toString());
	}

	private _disposeSessionKey(sessionKey: string): void {
		const group = this._bySession.get(sessionKey);
		if (!group) {
			return;
		}
		this._bySession.delete(sessionKey);
		for (const channelId of group) {
			this._entries.get(channelId)?.dispose();
			this._entries.delete(channelId);
		}
	}
}

/**
 * Stable, injective, filesystem-safe Output/logger id for the MCP server
 * `rawId` in the session keyed by `sessionKey`. The composite key is SHA1-hashed
 * to hex: hex characters are never touched by the logger service's own reserved-
 * character stripping (so distinct servers can't collapse onto one channel), and
 * hashing keeps the id bounded regardless of how long the session URI or raw id
 * is.
 */
function channelIdForMcpServer(sessionKey: string, rawId: string): string {
	const sha = new StringSHA1();
	sha.update(sessionKey);
	sha.update('\0');
	sha.update(rawId);
	return `agentHostMcpServer.${sha.digest()}`;
}

/**
 * Renders an MCP server's current state into a diagnostics log line, a change
 * signature (used to suppress duplicate records), and whether it is an error.
 */
function describeMcpServerState(name: string, enabled: boolean, state: McpServerState): { signature: string; message: string; isError: boolean } {
	if (!enabled) {
		return { signature: 'disabled', message: localize('agentHost.mcpServer.disabled', "Server '{0}' is disabled", name), isError: false };
	}
	switch (state.kind) {
		case McpServerStatus.Ready:
			return { signature: 'ready', message: localize('agentHost.mcpServer.ready', "Server '{0}' is running", name), isError: false };
		case McpServerStatus.Starting:
			return { signature: 'starting', message: localize('agentHost.mcpServer.starting', "Server '{0}' is starting", name), isError: false };
		case McpServerStatus.AuthRequired:
			return { signature: `authRequired:${state.resource.resource}`, message: localize('agentHost.mcpServer.authRequired', "Server '{0}' requires authentication ({1})", name, state.resource.resource), isError: false };
		case McpServerStatus.Error:
			return { signature: `error:${state.error.errorType}:${state.error.message}`, message: localize('agentHost.mcpServer.error', "Server '{0}' failed: {1}", name, state.error.message), isError: true };
		case McpServerStatus.Stopped:
		default:
			return { signature: 'stopped', message: localize('agentHost.mcpServer.stopped', "Server '{0}' is stopped", name), isError: false };
	}
}
