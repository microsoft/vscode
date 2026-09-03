/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../base/common/event.js';
import { IDisposable } from '../../../base/common/lifecycle.js';
import type { IObservable } from '../../../base/common/observable.js';
import { connectionTokenQueryName } from '../../../base/common/network.js';
import { createDecorator } from '../../instantiation/common/instantiation.js';
import { ConfigurationTarget, type IConfigurationService } from '../../configuration/common/configuration.js';
import { StorageScope, StorageTarget, type IStorageService } from '../../storage/common/storage.js';
import type { IAgentConnection } from './agentService.js';
import type { UnsupportedProtocolVersionErrorData } from './state/protocol/errors.js';
import { AHP_UNSUPPORTED_PROTOCOL_VERSION, ProtocolError } from './state/sessionProtocol.js';
import { AgentHostTransportFailureReason } from './state/sessionTransport.js';
import { readUnsupportedProtocolVersionErrorMeta, type IVscodeUpgradeResult } from './state/protocolUpgrade.js';
import { TUNNEL_ADDRESS_PREFIX } from './tunnelAgentHost.js';
import { DEFAULT_RECONNECT_POLICY, type IRemoteAgentHostReconnectPolicy } from './reconnectPolicy.js';
import { normalizeRemoteAgentHostAddress } from './agentHostUri.js';
import type { SSHAgentHostLifecycle } from './sshRemoteAgentHost.js';
import type { AgentHostServerType } from './agentHostEndpointRegistry.js';

/**
 * Connection status for a remote agent host.
 *
 * Discriminated by `kind`. The `incompatible` variant carries the rejection
 * message returned by the host (typically when its protocol version is not
 * compatible with anything the client offered) so the UI can surface it.
 */
export type RemoteAgentHostConnectionStatus =
	| { readonly kind: 'connected' }
	| { readonly kind: 'connecting' }
	/**
	 * The transport dropped and the protocol client is re-establishing it itself,
	 * preserving session state. Distinct from `connecting` (initial dial) and
	 * `disconnected` (no connection, nothing in flight).
	 */
	| {
		readonly kind: 'reconnecting';
		/** When the next automatic attempt fires, if one is scheduled. Absent while an attempt is in flight. */
		readonly nextAttemptAt?: number;
	}
	| { readonly kind: 'disconnected'; readonly reason: AgentHostTransportFailureReason }
	| {
		readonly kind: 'incompatible';
		/** Human-readable reason from the host (or a synthesised one when the host did not send one). */
		readonly message: string;
		/** Protocol versions the client offered. */
		readonly supportedByClient: readonly string[];
		/** Protocol versions the server reported it can speak, if available. */
		readonly offeredByServer?: readonly string[];
		/**
		 * JSON-RPC method the server has advertised via `_meta` that the
		 * client may invoke to ask the hosting CLI to upgrade the server.
		 * Set only when the server was spawned by a VS Code CLI willing
		 * to receive upgrade signals.
		 */
		readonly vscodeUpgradeMethod?: string;
	};

export namespace RemoteAgentHostConnectionStatus {
	/** Singleton "connected" status. */
	export const connected: RemoteAgentHostConnectionStatus = Object.freeze({ kind: 'connected' });
	/** Singleton "connecting" status. */
	export const connecting: RemoteAgentHostConnectionStatus = Object.freeze({ kind: 'connecting' });
	/** Singleton "reconnecting" status. */
	export const reconnecting: RemoteAgentHostConnectionStatus = Object.freeze({ kind: 'reconnecting' });
	/** Build a reconnecting status carrying its backoff deadline. */
	export function reconnectingUntil(nextAttemptAt: number | undefined): RemoteAgentHostConnectionStatus {
		return nextAttemptAt === undefined
			? reconnecting
			: Object.freeze({ kind: 'reconnecting', nextAttemptAt });
	}
	/** Singleton "disconnected" status. */
	export const disconnected: RemoteAgentHostConnectionStatus = Object.freeze({ kind: 'disconnected', reason: AgentHostTransportFailureReason.Unknown });
	/** Build a disconnected status with a machine-readable reason. */
	export function disconnectedBecause(reason: AgentHostTransportFailureReason): RemoteAgentHostConnectionStatus {
		return reason === AgentHostTransportFailureReason.Unknown
			? disconnected
			: Object.freeze({ kind: 'disconnected', reason });
	}
	/** Build an "incompatible" status from a host-supplied message and the versions involved. */
	export function incompatible(message: string, supportedByClient: readonly string[], offeredByServer?: readonly string[], vscodeUpgradeMethod?: string): RemoteAgentHostConnectionStatus {
		return Object.freeze({ kind: 'incompatible', message, supportedByClient, offeredByServer, vscodeUpgradeMethod });
	}
	/** Whether the connection is fully established and ready for traffic. */
	export function isConnected(status: RemoteAgentHostConnectionStatus | undefined): boolean {
		return status?.kind === 'connected';
	}
	/** Whether the connection is mid-handshake. */
	export function isConnecting(status: RemoteAgentHostConnectionStatus | undefined): boolean {
		return status?.kind === 'connecting';
	}
	/** Whether the protocol client is restoring a dropped transport. */
	export function isReconnecting(status: RemoteAgentHostConnectionStatus | undefined): boolean {
		return status?.kind === 'reconnecting';
	}
	/** Whether the connection is in the plain disconnected state. */
	export function isDisconnected(status: RemoteAgentHostConnectionStatus | undefined): boolean {
		return status?.kind === 'disconnected';
	}
	/** Whether the connection rejected our protocol version. */
	export function isIncompatible(status: RemoteAgentHostConnectionStatus | undefined): status is RemoteAgentHostConnectionStatus & { kind: 'incompatible' } {
		return status?.kind === 'incompatible';
	}
	/** Whether the connection is anything except `connected`. */
	export function isUnavailable(status: RemoteAgentHostConnectionStatus | undefined): boolean {
		return status?.kind !== 'connected';
	}
	/**
	 * If `err` is a protocol-version mismatch reported by an agent host
	 * during the `initialize` handshake, returns an `incompatible` status
	 * carrying the host's message. Returns `undefined` otherwise so callers
	 * can fall back to their existing failure handling.
	 */
	export function fromConnectError(err: unknown, supportedByClient: readonly string[]): RemoteAgentHostConnectionStatus | undefined {
		if (err instanceof ProtocolError && err.code === AHP_UNSUPPORTED_PROTOCOL_VERSION) {
			const data = err.data as Partial<UnsupportedProtocolVersionErrorData> | undefined;
			const offeredByServer = Array.isArray(data?.supportedVersions) ? data.supportedVersions : undefined;
			const vscodeUpgradeMethod = readUnsupportedProtocolVersionErrorMeta(err.data)?.vscodeUpgradeMethod;
			return incompatible(err.message, supportedByClient, offeredByServer, vscodeUpgradeMethod);
		}
		return undefined;
	}
}

/** Configuration key for the list of WebSocket remote agent host addresses. */
export const RemoteAgentHostsSettingId = 'chat.remoteAgentHosts';

/** Configuration key to enable remote agent host connections. */
export const RemoteAgentHostsEnabledSettingId = 'chat.remoteAgentHostsEnabled';

/** Configuration key that controls whether online dev tunnels, configured SSH remote agent hosts, and WSL remote agent hosts are auto-connected at startup. */
export const RemoteAgentHostAutoConnectSettingId = 'chat.remoteAgentHostsAutoConnect';

export const enum RemoteAgentHostEntryType {
	WebSocket = 'websocket',
	SSH = 'ssh',
	WSL = 'wsl',
	Tunnel = 'tunnel',
	CloudSandbox = 'cloudSandbox',
	DevContainer = 'devContainer',
}

export interface IRemoteAgentHostWebSocketConnection {
	readonly type: RemoteAgentHostEntryType.WebSocket;
	readonly address: string;
}

export interface IRemoteAgentHostSSHConnection {
	readonly type: RemoteAgentHostEntryType.SSH;
	/**
	 * The WebSocket address used by the agent host protocol client to
	 * communicate with the remote agent host process. This is typically a
	 * forwarded local port (e.g. `localhost:4321`) established by the SSH
	 * tunnel — it is NOT the SSH hostname itself.
	 */
	readonly address: string;
	/**
	 * SSH config host alias (e.g. `myserver`). When set, the SSH tunnel is
	 * automatically re-established on startup using the user's SSH config.
	 * This takes precedence over {@link hostName} when constructing the
	 * VS Code Remote SSH authority.
	 */
	readonly sshConfigHost?: string;
	/**
	 * The actual SSH hostname or IP address of the remote machine
	 * (e.g. `myserver.example.com`). This is the host that the SSH
	 * client connects to, and is used to construct the VS Code Remote
	 * SSH authority when {@link sshConfigHost} is not available.
	 */
	readonly hostName: string;
	/** SSH username for the remote machine. */
	readonly user?: string;
	/** SSH port on the remote machine (default 22). */
	readonly port?: number;
	/** Server type selected for the most recent SSH connection. */
	readonly serverType?: AgentHostServerType;
	/** Registry instance id selected for the most recent SSH connection. */
	readonly instanceId?: string;
	/** Whether the most recently selected SSH connection was primary. */
	readonly primary?: boolean;
	/** Ownership of the remote agent host selected for the most recent SSH connection. */
	readonly lifecycle?: SSHAgentHostLifecycle;
}

export interface IRemoteAgentHostTunnelConnection {
	readonly type: RemoteAgentHostEntryType.Tunnel;
	/** Dev tunnel ID. */
	readonly tunnelId: string;
	/** Dev tunnel cluster region. */
	readonly clusterId: string;
	/**
	 * User-defined display name for this tunnel (derived from tunnel tags).
	 * Used as the tunnel name in the VS Code Remote Tunnels authority
	 * (e.g. `tunnel+<label>`). Falls back to {@link tunnelId} if not set.
	 */
	readonly label?: string;
	/** Auth provider used to connect to this tunnel. */
	readonly authProvider?: 'github' | 'microsoft';
}

export interface IRemoteAgentHostWSLConnection {
	readonly type: RemoteAgentHostEntryType.WSL;
	/** Display address: `wsl:<distro>`. */
	readonly address: string;
	/** WSL distro name (e.g. `Ubuntu-22.04`). */
	readonly distro: string;
}

/**
 * A connection to a Copilot cloud "sandbox" environment (agent integration slug
 * `copilot-developer-cli`), reached over a Mission Control-brokered Azure Web
 * PubSub relay. Not persisted to settings — the connection is established
 * on demand with freshly-minted, short-lived credentials.
 */
export interface IRemoteAgentHostCloudSandboxConnection {
	readonly type: RemoteAgentHostEntryType.CloudSandbox;
	/** Synthesized display address: `cloudsandbox:<environmentId>`. */
	readonly address: string;
	/** Stable Mission Control environment identifier (`env_<uuid>`). */
	readonly environmentId: string;
	/** The cloud session/task id this connection is for, when known. */
	readonly sessionId?: string;
}

/**
 * A runtime-only connection to an agent host running inside a Dev Container.
 * The Dev Container integration stages its transport for its connection factory.
 */
export interface IRemoteAgentHostDevContainerConnection {
	readonly type: RemoteAgentHostEntryType.DevContainer;
	/** Stable address for the container connection. */
	readonly address: string;
	/** Local source folder containing the Dev Container configuration. */
	readonly hostPath: string;
}

export type RemoteAgentHostConnection = IRemoteAgentHostWebSocketConnection | IRemoteAgentHostSSHConnection | IRemoteAgentHostWSLConnection | IRemoteAgentHostTunnelConnection | IRemoteAgentHostCloudSandboxConnection | IRemoteAgentHostDevContainerConnection;

/** A configured remote agent host entry. WebSocket entries are persisted in {@link RemoteAgentHostsSettingId}; SSH entries are persisted in storage. */
export interface IRemoteAgentHostEntry {
	readonly name: string;
	readonly connectionToken?: string;
	readonly connection: RemoteAgentHostConnection;
}

/**
 * Connection states surfaced by a protocol client while the service owns it.
 * Mirrors the browser client's states without making this common API depend on
 * a browser implementation.
 */
export type RemoteAgentHostProtocolClientState = 'connecting' | 'incompatible' | 'connected' | 'reconnecting' | 'closed';

/**
 * The service-owned protocol-client surface needed to establish and manage a
 * remote connection. Browser implementations provide this with
 * `AgentHostProtocolClient`.
 */
export interface IRemoteAgentHostProtocolClient extends IAgentConnection, IDisposable {
	readonly defaultDirectory: string | undefined;
	/** Deadline for the next scheduled reconnect attempt, if one is pending. */
	readonly nextReconnectAt: number | undefined;
	readonly onDidClose: Event<AgentHostTransportFailureReason | undefined>;
	readonly onDidChangeConnectionState: Event<RemoteAgentHostProtocolClientState>;
	/**
	 * Fires whenever the pending reconnect schedule changes — a backoff being
	 * armed, or cleared by an immediate retry. Separate from
	 * {@link onDidChangeConnectionState} because the client state is still
	 * `reconnecting` throughout, and consumers of that event do real work on
	 * each transition that must not be repeated per backoff round.
	 */
	readonly onDidScheduleReconnect: Event<void>;
	connect(): Promise<void>;
	reconnectNow(): boolean;
	notifyTransportClosed(): void;
	triggerVscodeUpgrade(method: string): Promise<IVscodeUpgradeResult>;
}

/** Options describing why a connection is being built. */
export interface IRemoteAgentHostConnectOptions {
	/**
	 * Whether an explicit user action triggered this attempt. Background attempts
	 * must never open prompts, pickers or modals.
	 */
	readonly userInitiated: boolean;
}

/** A built, not-yet-handshaken connection and its owned resources. */
export interface IRemoteAgentHostCreatedConnection {
	/** The client the service will handshake and own. */
	readonly connection: IRemoteAgentHostProtocolClient;
	/**
	 * Teardown for resources the factory established alongside the client
	 * (e.g. a shared-process relay channel). Disposed with the connection entry.
	 */
	readonly transportDisposable?: IDisposable;
	/**
	 * Whether a redial transfers transport teardown ownership to the new connection.
	 * Defaults to `false`.
	 */
	readonly reconnectTransfersTransportOwnership?: boolean;
}

/** Builds agent host connections of one {@link RemoteAgentHostEntryType}. */
export interface IRemoteAgentHostConnectionFactory {
	/** The entry type this factory builds. */
	readonly kind: RemoteAgentHostEntryType;
	/** Entries owned by this factory. */
	readonly entries: IObservable<readonly IRemoteAgentHostEntry[]>;
	/**
	 * Build a client bound to a transport for `entry`.
	 *
	 * Must NOT perform the protocol handshake — the service calls `connect()`
	 * itself so handshake outcome classification lives in exactly one place.
	 */
	createConnection(entry: IRemoteAgentHostEntry, options: IRemoteAgentHostConnectOptions): Promise<IRemoteAgentHostCreatedConnection>;
}

/** Raw shape of persisted remote agent host entries. */
export interface IRawRemoteAgentHostEntry {
	readonly address: string;
	readonly name: string;
	readonly connectionToken?: string;
	readonly sshConfigHost?: string;
	readonly sshHostName?: string;
	readonly sshUser?: string;
	readonly sshPort?: number;
	readonly sshServerType?: AgentHostServerType;
	readonly sshInstanceId?: string;
	readonly sshPrimary?: boolean;
	readonly sshLifecycle?: SSHAgentHostLifecycle;
}

/** Storage key for SSH remote agent host entries. */
export const SSH_REMOTE_AGENT_HOSTS_STORAGE_KEY = 'remoteAgentHost.sshConnections';

/** Tests whether a value has the persisted remote agent host entry shape. */
export function isRawRemoteAgentHostEntry(value: unknown): value is IRawRemoteAgentHostEntry {
	if (typeof value !== 'object' || value === null) {
		return false;
	}

	const candidate = value as Partial<Record<keyof IRawRemoteAgentHostEntry, unknown>>;
	return typeof candidate.address === 'string'
		&& typeof candidate.name === 'string'
		&& (candidate.connectionToken === undefined || typeof candidate.connectionToken === 'string')
		&& (candidate.sshConfigHost === undefined || typeof candidate.sshConfigHost === 'string')
		&& (candidate.sshHostName === undefined || typeof candidate.sshHostName === 'string')
		&& (candidate.sshUser === undefined || typeof candidate.sshUser === 'string')
		&& (candidate.sshPort === undefined || typeof candidate.sshPort === 'number')
		&& (candidate.sshServerType === undefined || candidate.sshServerType === 'editor' || candidate.sshServerType === 'standalone')
		&& (candidate.sshInstanceId === undefined || typeof candidate.sshInstanceId === 'string')
		&& (candidate.sshPrimary === undefined || typeof candidate.sshPrimary === 'boolean')
		&& (candidate.sshLifecycle === undefined || candidate.sshLifecycle === 'managed' || candidate.sshLifecycle === 'external');
}

/** Tests whether a persisted entry uses the legacy SSH-in-settings shape. */
export function isLegacySshRawEntry(entry: IRawRemoteAgentHostEntry): boolean {
	return entry.sshConfigHost !== undefined
		|| entry.sshHostName !== undefined
		|| entry.sshUser !== undefined
		|| entry.sshPort !== undefined;
}

/** Where durable copies of a remote agent host entry live. */
export type RemoteAgentHostEntryStore = 'settings' | 'storage' | 'runtime';

/**
 * Static, per-connection-type description of how an entry is addressed,
 * persisted and connected. Collects the behavioural differences between
 * transports into one table so the service does not branch on
 * {@link RemoteAgentHostEntryType} in a dozen places.
 */
interface IRemoteAgentHostEntryTypeConfigBase<TConnection extends RemoteAgentHostConnection> {
	readonly type: TConnection['type'];
	/**
	 * Whether this entry-driven kind is dialed during reconciliation from the factory's entries.
	 * On-demand kinds set this to `false`, but an explicit {@link IRemoteAgentHostService.reconnect} still dials their staged entries.
	 */
	readonly dialedFromEntries: boolean;
	/**
	 * Whether background dialing is controlled by {@link RemoteAgentHostAutoConnectSettingId}.
	 * Defaults to `false`.
	 */
	readonly autoConnectGated?: boolean;
	/** Whether the address is subject to `normalizeRemoteAgentHostAddress`. */
	readonly normalizedAddress: boolean;
	/** Policy for restoring a dropped transport. */
	readonly reconnect: IRemoteAgentHostReconnectPolicy;
	/** Stable identity for the entry. */
	address(connection: TConnection): string;
}

/**
 * An entry type with a durable home. Narrowing a config on
 * `store !== 'runtime'` guarantees both converters are present.
 */
export interface IPersistedEntryTypeConfig<TConnection extends RemoteAgentHostConnection = RemoteAgentHostConnection> extends IRemoteAgentHostEntryTypeConfigBase<TConnection> {
	readonly store: 'settings' | 'storage';
	/** Serialize for persistence. */
	toRaw(entry: IRemoteAgentHostEntry, connection: TConnection): IRawRemoteAgentHostEntry;
	/** Rehydrate from persisted form. */
	fromRaw(raw: IRawRemoteAgentHostEntry): IRemoteAgentHostEntry;
}

/** An entry type that lives only for the lifetime of its connection and is never written to disk. */
interface IRuntimeEntryTypeConfig<TConnection extends RemoteAgentHostConnection = RemoteAgentHostConnection> extends IRemoteAgentHostEntryTypeConfigBase<TConnection> {
	readonly store: 'runtime';
	readonly toRaw?: never;
	readonly fromRaw?: never;
}

export type IRemoteAgentHostEntryTypeConfig<TConnection extends RemoteAgentHostConnection = RemoteAgentHostConnection> =
	IPersistedEntryTypeConfig<TConnection> | IRuntimeEntryTypeConfig<TConnection>;

export const WEBSOCKET_ENTRY_TYPE_CONFIG: IPersistedEntryTypeConfig<IRemoteAgentHostWebSocketConnection> = {
	type: RemoteAgentHostEntryType.WebSocket,
	store: 'settings',
	dialedFromEntries: true,
	autoConnectGated: false,
	normalizedAddress: true,
	reconnect: DEFAULT_RECONNECT_POLICY,
	address: connection => connection.address,
	toRaw: (entry, connection) => ({
		address: connection.address, name: entry.name, connectionToken: entry.connectionToken,
	}),
	fromRaw: raw => ({ name: raw.name, connectionToken: raw.connectionToken, connection: { type: RemoteAgentHostEntryType.WebSocket, address: raw.address } }),
};

export const SSH_ENTRY_TYPE_CONFIG: IPersistedEntryTypeConfig<IRemoteAgentHostSSHConnection> = {
	type: RemoteAgentHostEntryType.SSH,
	store: 'storage',
	dialedFromEntries: true,
	autoConnectGated: true,
	normalizedAddress: true,
	reconnect: DEFAULT_RECONNECT_POLICY,
	address: connection => connection.address,
	toRaw: (entry, connection) => ({
		address: connection.address, name: entry.name, connectionToken: entry.connectionToken,
		sshConfigHost: connection.sshConfigHost, sshHostName: connection.hostName, sshUser: connection.user, sshPort: connection.port,
		sshServerType: connection.serverType, sshInstanceId: connection.instanceId, sshPrimary: connection.primary, sshLifecycle: connection.lifecycle,
	}),
	fromRaw: raw => ({
		name: raw.name, connectionToken: raw.connectionToken,
		connection: {
			type: RemoteAgentHostEntryType.SSH,
			address: raw.address,
			sshConfigHost: raw.sshConfigHost,
			hostName: raw.sshHostName ?? raw.address,
			user: raw.sshUser,
			port: raw.sshPort,
			...(raw.sshServerType ? { serverType: raw.sshServerType } : undefined),
			...(raw.sshInstanceId ? { instanceId: raw.sshInstanceId } : undefined),
			...(raw.sshPrimary !== undefined ? { primary: raw.sshPrimary } : undefined),
			...(raw.sshLifecycle ? { lifecycle: raw.sshLifecycle } : undefined),
		},
	}),
};

/** The resolved configuration target and raw remote agent host entries at that target. */
export interface IRemoteAgentHostSettings {
	readonly target: ConfigurationTarget;
	readonly entries: readonly IRawRemoteAgentHostEntry[];
}

function entryAddressKey(entry: IRemoteAgentHostEntry): string {
	const config = getEntryTypeConfig(entry.connection.type);
	const address = config.address(entry.connection);
	return config.normalizedAddress ? normalizeRemoteAgentHostAddress(address) : address;
}

/** Replaces the entry sharing an address, or appends it. */
export function upsertRemoteAgentHostEntry(entries: readonly IRemoteAgentHostEntry[], entry: IRemoteAgentHostEntry): IRemoteAgentHostEntry[] {
	const address = entryAddressKey(entry);
	const existingIndex = entries.findIndex(candidate => entryAddressKey(candidate) === address);
	return existingIndex === -1
		? [...entries, entry]
		: entries.map((candidate, index) => index === existingIndex ? entry : candidate);
}

/**
 * Serializes the entries belonging to one kind, skipping the rest. Written as a
 * loop rather than `filter().map()` because a `filter` predicate does not narrow
 * the {@link RemoteAgentHostConnection} union for the following `toRaw` call.
 */
export function toRawEntriesOfKind(entries: readonly IRemoteAgentHostEntry[], config: IPersistedEntryTypeConfig): IRawRemoteAgentHostEntry[] {
	const raw: IRawRemoteAgentHostEntry[] = [];
	for (const entry of entries) {
		if (entry.connection.type === config.type) {
			raw.push(config.toRaw(entry, entry.connection));
		}
	}
	return raw;
}

/** Reads raw remote agent host settings from the configuration target that owns them. */
export function readRemoteAgentHostSettings(configurationService: IConfigurationService): IRemoteAgentHostSettings {
	const inspected = configurationService.inspect<IRawRemoteAgentHostEntry[]>(RemoteAgentHostsSettingId);
	const target = inspected.userLocalValue !== undefined
		? ConfigurationTarget.USER_LOCAL
		: inspected.userRemoteValue !== undefined
			? ConfigurationTarget.USER_REMOTE
			: ConfigurationTarget.USER;
	return {
		target,
		entries: target === ConfigurationTarget.USER_LOCAL
			? inspected.userLocalValue ?? []
			: target === ConfigurationTarget.USER_REMOTE
				? inspected.userRemoteValue ?? []
				: inspected.userValue ?? [],
	};
}

/** Reads WebSocket entries from the effective configuration or its owning target. */
export function readWebSocketRemoteAgentHostEntries(configurationService: IConfigurationService, targetOnly = false): IRemoteAgentHostEntry[] {
	const entries = targetOnly
		? readRemoteAgentHostSettings(configurationService).entries
		: configurationService.getValue<IRawRemoteAgentHostEntry[]>(RemoteAgentHostsSettingId) ?? [];
	return entries
		.filter(isRawRemoteAgentHostEntry)
		.filter(entry => !isLegacySshRawEntry(entry))
		.map(entry => WEBSOCKET_ENTRY_TYPE_CONFIG.fromRaw(entry));
}

async function storeWebSocketRemoteAgentHostEntries(configurationService: IConfigurationService, entries: readonly IRemoteAgentHostEntry[]): Promise<void> {
	const settings = readRemoteAgentHostSettings(configurationService);
	const preservedEntries = settings.entries.filter(entry => !isRawRemoteAgentHostEntry(entry) || isLegacySshRawEntry(entry));
	const rawEntries = [
		...preservedEntries,
		...toRawEntriesOfKind(entries, WEBSOCKET_ENTRY_TYPE_CONFIG),
	];
	if (JSON.stringify(settings.entries) !== JSON.stringify(rawEntries)) {
		await configurationService.updateValue(RemoteAgentHostsSettingId, rawEntries, settings.target);
	}
}

/** Adds or replaces a WebSocket entry in its configuration store. */
export async function addWebSocketRemoteAgentHostEntry(configurationService: IConfigurationService, entry: IRemoteAgentHostEntry): Promise<void> {
	if (entry.connection.type !== RemoteAgentHostEntryType.WebSocket) {
		throw new Error(`Expected a WebSocket remote agent host entry, got ${entry.connection.type}.`);
	}
	const normalizedEntry: IRemoteAgentHostEntry = {
		...entry,
		connection: { ...entry.connection, address: normalizeRemoteAgentHostAddress(entry.connection.address) },
	};
	await storeWebSocketRemoteAgentHostEntries(configurationService, upsertRemoteAgentHostEntry(readWebSocketRemoteAgentHostEntries(configurationService, true), normalizedEntry));
}

/** Removes a WebSocket entry from its configuration store. */
export async function removeWebSocketRemoteAgentHostEntry(configurationService: IConfigurationService, address: string): Promise<void> {
	const normalizedAddress = normalizeRemoteAgentHostAddress(address);
	await storeWebSocketRemoteAgentHostEntries(
		configurationService,
		readWebSocketRemoteAgentHostEntries(configurationService, true).filter(entry => entryAddressKey(entry) !== normalizedAddress),
	);
}

/** Reads SSH entries from their application storage store. */
export function readSSHRemoteAgentHostEntries(storageService: IStorageService): IRemoteAgentHostEntry[] {
	const raw = storageService.get(SSH_REMOTE_AGENT_HOSTS_STORAGE_KEY, StorageScope.APPLICATION);
	if (!raw) {
		return [];
	}
	try {
		const parsed: unknown = JSON.parse(raw);
		return Array.isArray(parsed)
			? parsed.filter(isRawRemoteAgentHostEntry).filter(isLegacySshRawEntry).map(entry => SSH_ENTRY_TYPE_CONFIG.fromRaw(entry))
			: [];
	} catch {
		return [];
	}
}

/** Replaces the SSH entries in their application storage store. */
export function storeSSHRemoteAgentHostEntries(storageService: IStorageService, entries: readonly IRemoteAgentHostEntry[]): void {
	const rawEntries = toRawEntriesOfKind(entries, SSH_ENTRY_TYPE_CONFIG);
	const raw = JSON.stringify(rawEntries);
	const stored = storageService.get(SSH_REMOTE_AGENT_HOSTS_STORAGE_KEY, StorageScope.APPLICATION);
	if (stored === raw) {
		return;
	}
	if (rawEntries.length === 0) {
		if (stored !== undefined) {
			storageService.remove(SSH_REMOTE_AGENT_HOSTS_STORAGE_KEY, StorageScope.APPLICATION);
		}
		return;
	}
	storageService.store(SSH_REMOTE_AGENT_HOSTS_STORAGE_KEY, raw, StorageScope.APPLICATION, StorageTarget.USER);
}

/** Adds or replaces an SSH entry in its application storage store. */
export function addSSHRemoteAgentHostEntry(storageService: IStorageService, entry: IRemoteAgentHostEntry): void {
	if (entry.connection.type !== RemoteAgentHostEntryType.SSH) {
		throw new Error(`Expected an SSH remote agent host entry, got ${entry.connection.type}.`);
	}
	storeSSHRemoteAgentHostEntries(storageService, upsertRemoteAgentHostEntry(readSSHRemoteAgentHostEntries(storageService), entry));
}

/** Removes an SSH entry from its application storage store. */
export function removeSSHRemoteAgentHostEntry(storageService: IStorageService, address: string): void {
	const normalizedAddress = normalizeRemoteAgentHostAddress(address);
	storeSSHRemoteAgentHostEntries(
		storageService,
		readSSHRemoteAgentHostEntries(storageService).filter(entry => entryAddressKey(entry) !== normalizedAddress),
	);
}

function runtimeEntryTypeConfig<TConnection extends RemoteAgentHostConnection>(type: TConnection['type'], normalizedAddress: boolean, address: (connection: TConnection) => string, reconnect: IRemoteAgentHostReconnectPolicy = DEFAULT_RECONNECT_POLICY): IRuntimeEntryTypeConfig<TConnection> {
	return { type, store: 'runtime', dialedFromEntries: false, normalizedAddress, reconnect, address };
}

const WSL_ENTRY_TYPE_CONFIG: IRemoteAgentHostEntryTypeConfig<IRemoteAgentHostWSLConnection> = {
	...runtimeEntryTypeConfig<IRemoteAgentHostWSLConnection>(RemoteAgentHostEntryType.WSL, true, connection => connection.address),
	dialedFromEntries: true,
	autoConnectGated: true,
};
const TUNNEL_ENTRY_TYPE_CONFIG: IRemoteAgentHostEntryTypeConfig<IRemoteAgentHostTunnelConnection> = {
	...runtimeEntryTypeConfig<IRemoteAgentHostTunnelConnection>(RemoteAgentHostEntryType.Tunnel, false, connection => `${TUNNEL_ADDRESS_PREFIX}${connection.tunnelId}`),
	dialedFromEntries: true,
	autoConnectGated: true,
};
const CLOUD_SANDBOX_ENTRY_TYPE_CONFIG = runtimeEntryTypeConfig<IRemoteAgentHostCloudSandboxConnection>(RemoteAgentHostEntryType.CloudSandbox, true, connection => connection.address);
// Relay failures are cheap, but a cold container can make `devcontainer up` rebuild Docker for minutes; retry slower and favor explicit recovery.
const DEV_CONTAINER_RECONNECT_POLICY: IRemoteAgentHostReconnectPolicy = {
	autoRestore: true,
	initialDelayMs: 2000,
	maxDelayMs: 60_000,
	maxAttempts: 3,
};
const DEV_CONTAINER_ENTRY_TYPE_CONFIG = runtimeEntryTypeConfig<IRemoteAgentHostDevContainerConnection>(RemoteAgentHostEntryType.DevContainer, true, connection => connection.address, DEV_CONTAINER_RECONNECT_POLICY);

const ENTRY_TYPE_CONFIGS: { readonly [K in RemoteAgentHostEntryType]: IRemoteAgentHostEntryTypeConfig<Extract<RemoteAgentHostConnection, { type: K }>> } = {
	[RemoteAgentHostEntryType.WebSocket]: WEBSOCKET_ENTRY_TYPE_CONFIG,
	[RemoteAgentHostEntryType.SSH]: SSH_ENTRY_TYPE_CONFIG,
	[RemoteAgentHostEntryType.WSL]: WSL_ENTRY_TYPE_CONFIG,
	[RemoteAgentHostEntryType.Tunnel]: TUNNEL_ENTRY_TYPE_CONFIG,
	[RemoteAgentHostEntryType.CloudSandbox]: CLOUD_SANDBOX_ENTRY_TYPE_CONFIG,
	[RemoteAgentHostEntryType.DevContainer]: DEV_CONTAINER_ENTRY_TYPE_CONFIG,
};

/** Gets the static persistence and connection policy for an entry type. */
export function getEntryTypeConfig(type: RemoteAgentHostEntryType): IRemoteAgentHostEntryTypeConfig {
	return ENTRY_TYPE_CONFIGS[type] as IRemoteAgentHostEntryTypeConfig;
}

export function getEntryAddress(entry: IRemoteAgentHostEntry): string {
	return getEntryTypeConfig(entry.connection.type).address(entry.connection);
}

export function remoteAgentHostLogOutputChannelId(address: string): string {
	return `agentHost.otlp.${address}`;
}

/**
 * Output channel id for the local agent host process logger (forwarded
 * from the utility process via `RemoteLoggerChannelClient`). Matches the
 * logger id registered in `agentHostMain.ts`.
 */
export const AGENT_HOST_LOG_OUTPUT_CHANNEL_ID = 'agenthost';

export const enum RemoteAgentHostInputValidationError {
	Empty = 'empty',
	Invalid = 'invalid',
}

export interface IParsedRemoteAgentHostInput {
	readonly address: string;
	readonly connectionToken?: string;
	readonly suggestedName: string;
}

export type RemoteAgentHostInputParseResult =
	| { readonly parsed: IParsedRemoteAgentHostInput; readonly error?: undefined }
	| { readonly parsed?: undefined; readonly error: RemoteAgentHostInputValidationError };

export const IRemoteAgentHostService = createDecorator<IRemoteAgentHostService>('remoteAgentHostService');

/**
 * Owns factory-built remote agent host connections, including handshake, status,
 * retry, and disposal. Each connection is identified by address and exposed as an {@link IAgentConnection}.
 */
export interface IRemoteAgentHostService {
	readonly _serviceBrand: undefined;

	/** Fires when a remote connection is established or lost. */
	readonly onDidChangeConnections: Event<void>;

	/**
	 * Known remote addresses with metadata. This is a status catalog, not a
	 * liveness list: an entry is retained after a failed dial so its
	 * {@link IRemoteAgentHostConnectionInfo.status} — and its disconnect reason —
	 * stay observable. Callers asking "is this host usable?" must test `status`
	 * (see `RemoteAgentHostConnectionStatus.isConnected`) rather than presence.
	 */
	readonly connections: readonly IRemoteAgentHostConnectionInfo[];

	/** All remote agent host entries exposed by registered factories, regardless of connection status. */
	readonly configuredEntries: readonly IRemoteAgentHostEntry[];

	/** Registers a factory for one connection kind. Throws if that kind already has one. */
	registerConnectionFactory(factory: IRemoteAgentHostConnectionFactory): IDisposable;

	/**
	 * Get a per-connection {@link IAgentConnection} for subscribing to
	 * state, dispatching actions, creating sessions, etc.
	 *
	 * Returns `undefined` if no active connection exists for the address.
	 */
	getConnection(address: string): IAgentConnection | undefined;

	/**
	 * Get a per-connection {@link IAgentConnection} by its sanitized
	 * connection authority (as produced by `agentHostAuthority`), rather than
	 * its raw address. Useful for callers that only have the authority
	 * component of a remote session URI scheme (`remote-<authority>-<provider>`).
	 *
	 * Returns `undefined` if no active connection matches the authority.
	 */
	getConnectionByAuthority(authority: string): IAgentConnection | undefined;

	/** Waits for a configured remote host to establish a connection. */
	waitForConnection(address: string): Promise<IRemoteAgentHostConnectionInfo>;

	/**
	 * Disconnects an active remote host connection by address.
	 */
	removeRemoteAgentHost(address: string): Promise<void>;

	/**
	 * Forcefully reconnect to a configured remote host.
	 * Tears down any existing connection and starts a fresh connect attempt
	 * with reset backoff.
	 */
	reconnect(address: string, userInitiated?: boolean): void;
	/**
	 * Skips a pending reconnect backoff for this address and retries at once.
	 * Prefers the protocol client's in-place retry, which preserves session
	 * state, and falls back to a fresh dial when there is no client to accelerate.
	 */
	reconnectNow(address: string): void;

	/**
	 * Force the protocol client at `address` (if any) to treat its
	 * transport as closed. Used by services that learn about a
	 * connection loss out-of-band — e.g. the SSH service receiving an
	 * `onDidCloseConnection` IPC event from the shared process — to
	 * make sure the renderer-side client doesn't sit in `Connected`
	 * waiting on its watchdog. The watchdog is a `setTimeout` and
	 * Chromium aggressively throttles those in backgrounded windows,
	 * so we can't rely on it as the sole death-detection path.
	 *
	 * No-op if no active entry exists for the address, or if the
	 * existing client has already transitioned out of `Connected`.
	 */
	notifyConnectionClosed(address: string): void;

	/**
	 * Look up the {@link IRemoteAgentHostEntry} for a given address.
	 * Entries are supplied by registered connection factories.
	 */
	getEntryByAddress(address: string): IRemoteAgentHostEntry | undefined;

	/**
	 * Ask the remote agent host to upgrade itself via its hosting CLI.
	 *
	 * Sends the host-advertised JSON-RPC method (typically
	 * `_vscodeUpgrade`) on the existing transport — even when the handshake
	 * has not completed (e.g. the host was just rejected for protocol
	 * incompatibility). The hosting CLI receives the signal, checks for a
	 * newer build, and kills+respawns the server on success. The caller
	 * SHOULD then reconnect to re-attempt the handshake.
	 *
	 * Resolves with the host's status payload describing what happened
	 * (whether an upgrade was needed, whether it was started); rejects on
	 * transport failure, timeout, or a JSON-RPC error response.
	 */
	triggerServerUpgrade(address: string, method: string): Promise<IVscodeUpgradeResult>;
}

/** Metadata about a single remote connection. */
export interface IRemoteAgentHostConnectionInfo {
	readonly address: string;
	readonly name: string;
	/** Identifier of the backing protocol client, when one exists. */
	readonly clientId?: string;
	readonly defaultDirectory?: string;
	readonly status: RemoteAgentHostConnectionStatus;
}

export class NullRemoteAgentHostService implements IRemoteAgentHostService {
	declare readonly _serviceBrand: undefined;
	readonly onDidChangeConnections = Event.None;
	readonly connections: readonly IRemoteAgentHostConnectionInfo[] = [];
	readonly configuredEntries: readonly IRemoteAgentHostEntry[] = [];
	registerConnectionFactory(): IDisposable {
		throw new Error('Remote agent host connections are not supported in this environment.');
	}
	getConnection(): IAgentConnection | undefined { return undefined; }
	getConnectionByAuthority(): IAgentConnection | undefined { return undefined; }
	async waitForConnection(): Promise<IRemoteAgentHostConnectionInfo> {
		throw new Error('Remote agent host connections are not supported in this environment.');
	}
	async removeRemoteAgentHost(_address: string): Promise<void> { }
	reconnect(_address: string, _userInitiated?: boolean): void { }
	reconnectNow(_address: string): void { }
	notifyConnectionClosed(_address: string): void { }
	getEntryByAddress(): IRemoteAgentHostEntry | undefined { return undefined; }
	async triggerServerUpgrade(): Promise<IVscodeUpgradeResult> {
		throw new Error('Remote agent host connections are not supported in this environment.');
	}
}

export function parseRemoteAgentHostInput(input: string): RemoteAgentHostInputParseResult {
	const trimmedInput = input.trim();
	if (!trimmedInput) {
		return { error: RemoteAgentHostInputValidationError.Empty };
	}

	const candidate = extractRemoteAgentHostCandidate(trimmedInput);
	if (!candidate) {
		return { error: RemoteAgentHostInputValidationError.Invalid };
	}

	const hasExplicitScheme = /^[a-zA-Z][a-zA-Z\d+.-]*:\/\//.test(candidate);
	try {
		const url = new URL(hasExplicitScheme ? candidate : `ws://${candidate}`);
		const normalizedProtocol = normalizeRemoteAgentHostProtocol(url.protocol);
		if (!normalizedProtocol || !url.host) {
			return { error: RemoteAgentHostInputValidationError.Invalid };
		}

		const connectionToken = url.searchParams.get(connectionTokenQueryName) ?? undefined;
		url.searchParams.delete(connectionTokenQueryName);

		// Only preserve wss: in the address - the transport defaults to ws:
		const address = formatRemoteAgentHostAddress(url, normalizedProtocol === 'wss:' ? normalizedProtocol : undefined);
		if (!address) {
			return { error: RemoteAgentHostInputValidationError.Invalid };
		}

		return {
			parsed: {
				address,
				connectionToken,
				suggestedName: url.host,
			},
		};
	} catch {
		return { error: RemoteAgentHostInputValidationError.Invalid };
	}
}

function extractRemoteAgentHostCandidate(input: string): string | undefined {
	const urlMatch = input.match(/(?<url>(?:https?|wss?):\/\/\S+)/i);
	const candidate = urlMatch?.groups?.url ?? input;
	const trimmedCandidate = candidate.trim().replace(/[),.;\]]+$/, '');
	return trimmedCandidate || undefined;
}

function normalizeRemoteAgentHostProtocol(protocol: string): 'ws:' | 'wss:' | undefined {
	switch (protocol.toLowerCase()) {
		case 'ws:':
		case 'http:':
			return 'ws:';
		case 'wss:':
		case 'https:':
			return 'wss:';
		default:
			return undefined;
	}
}

function formatRemoteAgentHostAddress(url: URL, protocol: 'ws:' | 'wss:' | undefined): string | undefined {
	if (!url.host) {
		return undefined;
	}

	const path = url.pathname !== '/' ? url.pathname : '';
	const query = url.search;
	const base = protocol ? `${protocol}//${url.host}` : url.host;
	return `${base}${path}${query}`;
}

/**
 * Parses an entry persisted before each store became type-specific, when a
 * single flat shape held both WebSocket and SSH entries and the variant had
 * to be inferred from which `ssh*` fields were present. Used only by the
 * migration path.
 */
export function parseLegacyRawEntry(raw: IRawRemoteAgentHostEntry): IRemoteAgentHostEntry {
	if (raw.sshConfigHost !== undefined || raw.sshHostName !== undefined || raw.sshUser !== undefined || raw.sshPort !== undefined) {
		return SSH_ENTRY_TYPE_CONFIG.fromRaw(raw);
	}
	return WEBSOCKET_ENTRY_TYPE_CONFIG.fromRaw(raw);
}
