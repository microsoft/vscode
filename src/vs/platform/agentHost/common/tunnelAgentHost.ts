/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../base/common/event.js';
import { createDecorator } from '../../instantiation/common/instantiation.js';

export const ITunnelAgentHostService = createDecorator<ITunnelAgentHostService>('tunnelAgentHostService');

/**
 * IPC channel name for the shared-process tunnel service.
 */
export const TUNNEL_AGENT_HOST_CHANNEL = 'tunnelAgentHost';

/** Configuration key for the list of manually configured tunnel names. */
export const TunnelAgentHostsSettingId = 'chat.remoteAgentTunnels';

/** Minimum protocol version required for agent host connections. */
export const TUNNEL_MIN_PROTOCOL_VERSION = 5;

/** Well-known port for the agent host on tunnel machines. */
export const TUNNEL_AGENT_HOST_PORT = 31546;

/** Label used to identify VS Code server launcher tunnels. */
export const TUNNEL_LAUNCHER_LABEL = 'vscode-server-launcher';

/** Address prefix for tunnel-backed connections (e.g. `tunnel:myTunnelId`). */
export const TUNNEL_ADDRESS_PREFIX = 'tunnel:';

/** Path of the protocol-v6 registry-based endpoint-selection WebSocket route on the forwarded agent-host tunnel port. */
export const TUNNEL_GATEWAY_SELECT_PATH = '/agent-host/select';

/**
 * Tunnel launcher protocol version (see `PROTOCOL_VERSION` in the CLI's
 * `cli/src/constants.rs`) starting from which the forwarded agent-host port
 * also serves {@link TUNNEL_GATEWAY_SELECT_PATH}. Tunnels below this
 * version only support the legacy direct-reuse root route.
 */
export const TUNNEL_GATEWAY_MIN_PROTOCOL_VERSION = 6;

/** Prefix for protocol version tags. */
export const PROTOCOL_VERSION_TAG_PREFIX = 'protocolv';

/**
 * Parse tunnel tags to extract display name and protocol version.
 * Follows the convention from the vscode-remote-tunnels SDK: the
 * first label that is not `vscode-server-launcher`, does not start
 * with `_`, and is not a `protocolvN` tag is the display name.
 */
export class TunnelTags {
	public readonly protocolVersion: number = 2;
	public readonly name: string | undefined;

	constructor(readonly value: readonly string[] | undefined) {
		if (value) {
			let protocolVersion: number | undefined;
			let name: string | undefined;
			for (const tag of value) {
				if (tag.startsWith(PROTOCOL_VERSION_TAG_PREFIX)) {
					const parsed = Number(tag.slice(PROTOCOL_VERSION_TAG_PREFIX.length));
					if (!isNaN(parsed)) {
						protocolVersion = parsed;
					}
				} else if (!tag.startsWith('_') && tag !== TUNNEL_LAUNCHER_LABEL && !name) {
					name = tag;
				}
			}
			if (protocolVersion !== undefined) {
				this.protocolVersion = protocolVersion;
			}
			if (name !== undefined) {
				this.name = name;
			}
		}
	}
}

/** A recently used tunnel cached in storage. */
export interface ICachedTunnel {
	readonly tunnelId: string;
	readonly clusterId: string;
	readonly name: string;
	readonly authProvider?: 'github' | 'microsoft';
}

/** Information about a discovered dev tunnel with an agent host. */
export interface ITunnelInfo {
	/** The tunnel's unique identifier. */
	readonly tunnelId: string;
	/** The cluster region where the tunnel is hosted. */
	readonly clusterId: string;
	/** Display name derived from tunnel tags or tunnel name. */
	readonly name: string;
	/** All tags/labels on the tunnel. */
	readonly tags: readonly string[];
	/** Parsed protocol version from tags. */
	readonly protocolVersion: number;
	/** Number of hosts currently accepting connections (0 = offline). */
	readonly hostConnectionCount: number;
}

/** How startup auto-connect should establish a tunnel connection. */
export type TunnelAutoConnectMode = 'background' | 'prompt';

/** Kind of process that owns a gateway-reported endpoint. Mirrors `AgentHostServerType` in the CLI's agent-host registry (`cli/src/tunnels/agent_host_registry.rs`). */
export type TunnelGatewayServerType = 'editor' | 'standalone';

/** How a selected endpoint's lifetime relates to this connection. Mirrors `GatewayLifecycle` in the CLI gateway (`cli/src/tunnels/agent_host.rs`). */
export type TunnelGatewayLifecycle = 'external' | 'managed';

/**
 * One live registry endpoint as reported by the tunnel gateway's inventory
 * message. Deliberately never includes a connection token: the gateway
 * injects the target's own token itself once a selection completes, and it
 * is never exposed to the renderer.
 */
export interface ITunnelGatewayEndpoint {
	readonly type: TunnelGatewayServerType;
	readonly pid: number;
	readonly instanceId: string;
	readonly quality?: string;
	readonly tunnelName?: string;
	readonly endpointKind: 'tcp' | 'socket';
	readonly endpointLabel: string;
}

/**
 * One-time inventory message sent by the tunnel gateway immediately after
 * the protocol-v6 selection WebSocket route ({@link TUNNEL_GATEWAY_SELECT_PATH}) upgrades.
 */
export interface ITunnelGatewayInventory {
	readonly userDataPath: string;
	readonly endpoints: readonly ITunnelGatewayEndpoint[];
	/** Set when the tunnel is bound to one specific agent host instance: the inventory lists only that endpoint and no dedicated host can be spawned. */
	readonly delegatedInstanceId?: string;
}

/**
 * The client's one-time selection message, matching `GatewaySelectionRequest`
 * on the CLI side (`cli/src/tunnels/agent_host.rs`) exactly: either an
 * existing live endpoint's `instanceId`, or a request to spawn a new
 * dedicated standalone instance.
 */
export type ITunnelGatewaySelection =
	| { readonly instanceId: string }
	| { readonly newDedicated: true };

/** Metadata about the endpoint the gateway selected, mirrored into {@link ITunnelConnectResult}. */
export interface ITunnelGatewaySelectedInfo {
	/**
	 * `'unknown'` only ever appears for a protocol-v5 tunnel's legacy
	 * {@link ITunnelAgentHostMainService.connect}, which has no gateway
	 * inventory to draw a real answer from.
	 */
	readonly serverType: TunnelGatewayServerType | 'unknown';
	readonly instanceId: string;
	readonly role: 'primary';
	readonly lifecycle: TunnelGatewayLifecycle;
}

/**
 * A protocol-v6 gateway selection session prepared by
 * {@link ITunnelAgentHostMainService.prepareSelection}. The pending gateway
 * WebSocket and relay client are held server-side, keyed by
 * {@link selectionId}, until {@link ITunnelAgentHostMainService.completeSelection}
 * or {@link ITunnelAgentHostMainService.cancelSelection} is called.
 */
export interface ITunnelGatewaySelectionSession {
	readonly selectionId: string;
	readonly inventory: ITunnelGatewayInventory;
}

/**
 * Thrown by {@link parseTunnelGatewayInventory} and
 * {@link parseTunnelGatewaySelectionResponse} when a gateway wire message
 * does not have the expected structure, so callers can log a clear
 * "malformed gateway message" error rather than a generic parse failure.
 */
export class TunnelGatewayProtocolError extends Error { }

function isPlainObject(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseTunnelGatewayEndpoint(value: unknown, index: number): ITunnelGatewayEndpoint {
	if (!isPlainObject(value)) {
		throw new TunnelGatewayProtocolError(`Gateway inventory endpoint at index ${index} is not an object`);
	}
	const { type, pid, instanceId, quality, tunnelName, endpointKind, endpointLabel } = value;
	if (type !== 'editor' && type !== 'standalone') {
		throw new TunnelGatewayProtocolError(`Gateway inventory endpoint at index ${index} has an invalid "type"`);
	}
	if (typeof pid !== 'number') {
		throw new TunnelGatewayProtocolError(`Gateway inventory endpoint at index ${index} has an invalid "pid"`);
	}
	if (typeof instanceId !== 'string' || !instanceId) {
		throw new TunnelGatewayProtocolError(`Gateway inventory endpoint at index ${index} has an invalid "instanceId"`);
	}
	if (quality !== undefined && typeof quality !== 'string') {
		throw new TunnelGatewayProtocolError(`Gateway inventory endpoint at index ${index} has an invalid "quality"`);
	}
	if (tunnelName !== undefined && typeof tunnelName !== 'string') {
		throw new TunnelGatewayProtocolError(`Gateway inventory endpoint at index ${index} has an invalid "tunnelName"`);
	}
	if (endpointKind !== 'tcp' && endpointKind !== 'socket') {
		throw new TunnelGatewayProtocolError(`Gateway inventory endpoint at index ${index} has an invalid "endpointKind"`);
	}
	if (typeof endpointLabel !== 'string' || !endpointLabel) {
		throw new TunnelGatewayProtocolError(`Gateway inventory endpoint at index ${index} has an invalid "endpointLabel"`);
	}
	return { type, pid, instanceId, quality, tunnelName, endpointKind, endpointLabel };
}

/**
 * Parse and structurally validate a gateway inventory message. Throws
 * {@link TunnelGatewayProtocolError} (or a JSON `SyntaxError`) rather than
 * returning a partially-valid inventory, so callers never silently proceed
 * with a corrupt endpoint list.
 */
export function parseTunnelGatewayInventory(json: string): ITunnelGatewayInventory {
	const parsed: unknown = JSON.parse(json);
	if (!isPlainObject(parsed)) {
		throw new TunnelGatewayProtocolError('Gateway inventory message is not an object');
	}
	const { userDataPath, endpoints, delegatedInstanceId } = parsed;
	if (typeof userDataPath !== 'string' || !userDataPath) {
		throw new TunnelGatewayProtocolError('Gateway inventory message has an invalid "userDataPath"');
	}
	if (!Array.isArray(endpoints)) {
		throw new TunnelGatewayProtocolError('Gateway inventory message has an invalid "endpoints"');
	}
	if (delegatedInstanceId !== undefined && (typeof delegatedInstanceId !== 'string' || !delegatedInstanceId)) {
		throw new TunnelGatewayProtocolError('Gateway inventory message has an invalid "delegatedInstanceId"');
	}
	const parsedEndpoints = endpoints.map((e, i) => parseTunnelGatewayEndpoint(e, i));
	if (delegatedInstanceId === undefined) {
		return { userDataPath, endpoints: parsedEndpoints };
	}
	return { userDataPath, endpoints: parsedEndpoints, delegatedInstanceId };
}

/**
 * Parse and validate the gateway's one-time selection acknowledgement,
 * matching `GatewaySelectionResponse` on the CLI side exactly.
 */
export function parseTunnelGatewaySelectionResponse(json: string): { ok: true; selected: ITunnelGatewaySelectedInfo } | { ok: false; error: string } {
	const parsed: unknown = JSON.parse(json);
	if (!isPlainObject(parsed) || typeof parsed.ok !== 'boolean') {
		throw new TunnelGatewayProtocolError('Gateway selection acknowledgement is not a valid response');
	}
	if (!parsed.ok) {
		const error = typeof parsed.error === 'string' ? parsed.error : 'Gateway selection failed';
		return { ok: false, error };
	}
	const selected = parsed.selected;
	if (!isPlainObject(selected)
		|| (selected.type !== 'editor' && selected.type !== 'standalone')
		|| typeof selected.instanceId !== 'string' || !selected.instanceId
		|| selected.role !== 'primary'
		|| (selected.lifecycle !== 'external' && selected.lifecycle !== 'managed')
	) {
		throw new TunnelGatewayProtocolError('Gateway selection acknowledgement has an invalid "selected" payload');
	}
	return {
		ok: true,
		selected: {
			serverType: selected.type,
			instanceId: selected.instanceId,
			role: 'primary',
			lifecycle: selected.lifecycle,
		},
	};
}

/**
 * `Error.name` carried by the failure {@link ITunnelAgentHostMainService.completeSelection}
 * throws when the gateway itself answered `{"ok":false}` — i.e. the tunnel
 * relay is up and reachable, and only the endpoint we picked turned out to
 * be gone (its registry entry vanished, or its socket/port could not be
 * dialed). Callers must distinguish this from a transport failure: a
 * transport failure means the tunnel is down and the same destination
 * should simply be retried, whereas a rejection means retrying the same
 * endpoint can never succeed and a different one has to be selected.
 *
 * Modelled as a name rather than an `Error` subclass because this crosses
 * the shared-process IPC boundary, which preserves `name`/`message`/`stack`
 * but not the prototype chain.
 */
export const TUNNEL_GATEWAY_SELECTION_REJECTED_ERROR_NAME = 'TunnelGatewaySelectionRejectedError';

/** Creates the error described by {@link TUNNEL_GATEWAY_SELECTION_REJECTED_ERROR_NAME}. */
export function createTunnelGatewaySelectionRejectedError(message: string): Error {
	const error = new Error(message);
	error.name = TUNNEL_GATEWAY_SELECTION_REJECTED_ERROR_NAME;
	return error;
}

/** Whether `error` is a gateway rejection, including one received over IPC. See {@link TUNNEL_GATEWAY_SELECTION_REJECTED_ERROR_NAME}. */
export function isTunnelGatewaySelectionRejectedError(error: unknown): boolean {
	return error instanceof Error && error.name === TUNNEL_GATEWAY_SELECTION_REJECTED_ERROR_NAME;
}

/**
 * Serializable result from a successful tunnel connect operation.
 * Returned over IPC from the shared process.
 */
export interface ITunnelConnectResult {
	/** Unique identifier for this connection's relay channel. */
	readonly connectionId: string;
	/** Display-friendly address (e.g. "tunnel:myTunnel"). */
	readonly address: string;
	/** Display name for the tunnel. */
	readonly name: string;
	/** Connection token derived from the tunnel ID. */
	readonly connectionToken: string;
	/**
	 * Metadata about the agent host endpoint that was actually selected.
	 * Protocol-v5 tunnels have no selection gateway, so legacy
	 * {@link ITunnelAgentHostMainService.connect} reports `serverType:
	 * 'unknown'` and `lifecycle: 'external'`, since that route always
	 * reuses a single deterministic target without a picker.
	 */
	readonly selected: ITunnelGatewaySelectedInfo;
}

/**
 * A message relayed from a remote agent host through the tunnel.
 * The shared process acts as a WebSocket proxy, forwarding JSON
 * messages bidirectionally between the tunnel and the renderer via IPC.
 */
export interface ITunnelRelayMessage {
	readonly connectionId: string;
	readonly data: string;
}

/**
 * Main-process (shared process) service that manages dev tunnel
 * connections. The renderer calls this over IPC and handles registration
 * with {@link IRemoteAgentHostService} locally.
 */
export const ITunnelAgentHostMainService = createDecorator<ITunnelAgentHostMainService>('tunnelAgentHostMainService');

export interface ITunnelAgentHostMainService {
	readonly _serviceBrand: undefined;

	/** Fires when a message is received from a remote agent host via the tunnel relay. */
	readonly onDidRelayMessage: Event<ITunnelRelayMessage>;

	/** Fires when a relay connection to a remote agent host closes. */
	readonly onDidRelayClose: Event<string /* connectionId */>;

	/**
	 * List dev tunnels associated with the user's account that have
	 * the `vscode-server-launcher` label and a protocol version tag
	 * of at least {@link TUNNEL_MIN_PROTOCOL_VERSION}.
	 *
	 * @param token The user's access token (GitHub or Microsoft).
	 * @param authProvider The auth provider that issued the token.
	 * @param additionalTunnelNames Optional tunnel names to look up
	 *   in addition to the account-wide enumeration.
	 */
	listTunnels(token: string, authProvider: 'github' | 'microsoft', additionalTunnelNames?: string[]): Promise<ITunnelInfo[]>;

	/** Delete a dev tunnel and close any associated relay connections. */
	deleteTunnel(token: string, authProvider: 'github' | 'microsoft', tunnelId: string, clusterId: string): Promise<void>;

	/**
	 * Connect to a tunnel's agent host via the dev tunnels relay and
	 * begin relaying WebSocket messages through IPC.
	 *
	 * @param token The user's access token (GitHub or Microsoft).
	 * @param authProvider The auth provider that issued the token.
	 * @param tunnelId The tunnel ID to connect to.
	 * @param clusterId The cluster region of the tunnel.
	 */
	connect(token: string, authProvider: 'github' | 'microsoft', tunnelId: string, clusterId: string): Promise<ITunnelConnectResult>;

	/**
	 * Prepare a protocol-v6 registry-based endpoint selection: connects the
	 * dev tunnel relay and opens the gateway's selection WebSocket route
	 * ({@link TUNNEL_GATEWAY_SELECT_PATH}), returning its one-time inventory
	 * of live agent host endpoints. The gateway WebSocket and relay client
	 * are held pending (keyed by the returned `selectionId`) until
	 * {@link completeSelection} or {@link cancelSelection} is called.
	 *
	 * Returns `undefined` when the tunnel's advertised protocol version is
	 * below {@link TUNNEL_GATEWAY_MIN_PROTOCOL_VERSION}: callers must fall
	 * back to the legacy {@link connect} in that case, which preserves the
	 * v5 direct-reuse behavior with no picker.
	 *
	 * @param token The user's access token (GitHub or Microsoft).
	 * @param authProvider The auth provider that issued the token.
	 * @param tunnelId The tunnel ID to connect to.
	 * @param clusterId The cluster region of the tunnel.
	 */
	prepareSelection(token: string, authProvider: 'github' | 'microsoft', tunnelId: string, clusterId: string): Promise<ITunnelGatewaySelectionSession | undefined>;

	/**
	 * Complete a selection previously started with {@link prepareSelection}:
	 * sends the selection message over the pending gateway WebSocket, awaits
	 * its ready acknowledgement, and registers the resulting relay
	 * connection the same way {@link connect} does.
	 *
	 * Rejects with an error named {@link TUNNEL_GATEWAY_SELECTION_REJECTED_ERROR_NAME}
	 * when the gateway answered but refused the selection, and with any
	 * other error when the tunnel transport itself failed. Either way the
	 * pending session is consumed and disposed, so retrying requires a fresh
	 * {@link prepareSelection}.
	 */
	completeSelection(selectionId: string, selection: ITunnelGatewaySelection): Promise<ITunnelConnectResult>;

	/**
	 * Cancel and dispose a pending selection without completing it (e.g.
	 * the user dismissed the picker). Safe to call even if `selectionId` is
	 * unknown or was already completed/cancelled.
	 */
	cancelSelection(selectionId: string): Promise<void>;

	/**
	 * Send a message to a remote agent host through the tunnel relay.
	 */
	relaySend(connectionId: string, message: string): Promise<void>;

	/**
	 * Disconnect a tunnel relay connection.
	 */
	disconnect(connectionId: string): Promise<void>;
}

/**
 * Renderer-side service that manages dev tunnel agent host connections.
 * Uses the shared-process {@link ITunnelAgentHostMainService} for
 * actual tunnel SDK operations and registers connections with
 * {@link IRemoteAgentHostService}.
 */
export interface ITunnelAgentHostService {
	readonly _serviceBrand: undefined;

	/** Fires when the set of available tunnels changes. */
	readonly onDidChangeTunnels: Event<void>;

	/**
	 * Enumerate available dev tunnels with agent host support.
	 * When {@link options.silent} is `true`, uses cached tokens without
	 * prompting the user. Returns an empty array if no cached token.
	 */
	listTunnels(options?: { silent?: boolean }): Promise<ITunnelInfo[]>;

	/**
	 * Determine whether startup auto-connect can run silently or must first ask
	 * the user to choose an agent-host location.
	 */
	getAutoConnectMode(tunnel: ITunnelInfo): TunnelAutoConnectMode;

	/**
	 * Connect to a tunnel's agent host and register the connection
	 * with {@link IRemoteAgentHostService}.
	 *
	 * @param tunnel The tunnel to connect to.
	 * @param authProvider Optional auth provider to use. If omitted, uses cached/last known.
	 * @param options.userInitiated Whether this connection was explicitly
	 * requested by the user (default `true`). When `false` (background/auto
	 * connect), a protocol-v6 gateway selection must never prompt. Background
	 * connections may prompt only when {@link getAutoConnectMode} returns
	 * `'prompt'`; otherwise they reuse the saved preference silently.
	 */
	connect(tunnel: ITunnelInfo, authProvider?: 'github' | 'microsoft', options?: { readonly userInitiated?: boolean }): Promise<void>;

	/** Whether {@link deleteTunnel} is supported by this implementation. */
	readonly canDeleteTunnels: boolean;

	/** Delete a dev tunnel and remove it from the local tunnel cache. */
	deleteTunnel(tunnel: ITunnelInfo): Promise<void>;

	/**
	 * Disconnect from a tunnel agent host.
	 */
	disconnect(address: string): Promise<void>;

	/** Get the list of recently used (cached) tunnels. */
	getCachedTunnels(): ICachedTunnel[];

	/** Cache a tunnel as recently used. */
	cacheTunnel(tunnel: ITunnelInfo, authProvider?: 'github' | 'microsoft'): void;

	/** Remove a tunnel from the cache. */
	removeCachedTunnel(tunnelId: string): void;

	/** Whether startup/background auto-connect should skip this tunnel because the user disconnected it. */
	isAutoConnectSuppressed(tunnelId: string): boolean;

	/** Remember that the user explicitly disconnected this tunnel, so startup/background auto-connect skips it. */
	suppressAutoConnect(tunnelId: string): void;

	/** Clear a previous user-disconnect marker after the user explicitly reconnects this tunnel. */
	clearAutoConnectSuppression(tunnelId: string): void;

	/**
	 * Determine which auth provider has an existing cached session.
	 * When {@link silent} is true, does not prompt the user.
	 * Returns `undefined` if no cached session is available.
	 */
	getAuthProvider(options?: { silent?: boolean }): Promise<'github' | 'microsoft' | undefined>;
}

// ---- Tunnel hosting (exposing the local agent host to remote clients) --------

/** IPC channel name for the tunnel host service. */
export const TUNNEL_HOST_CHANNEL = 'tunnelHost';

/** Output channel ID for the tunnel host logs. */
export const TUNNEL_HOST_LOG_ID = 'tunnelHostService';

/** Information about an actively hosted tunnel. */
export interface ITunnelHostInfo {
	readonly tunnelName: string;
	/** Stable dev tunnel identity, which can be absent when an older CLI reports the hosted tunnel. */
	readonly tunnelId?: string;
	/** Set when remote session access is being provided by full Remote Tunnel Access rather than a dedicated agent host tunnel. */
	readonly viaRemoteTunnelAccess?: boolean;
}

/** Whether a discovered tunnel is the hosted tunnel, preferring its stable identity over its display name. */
export function isTunnelHosted(sharingInfo: ITunnelHostInfo | undefined, tunnel: Pick<ITunnelInfo, 'tunnelId' | 'name'>): boolean {
	if (!sharingInfo) {
		return false;
	}
	return sharingInfo.tunnelId !== undefined
		? sharingInfo.tunnelId === tunnel.tunnelId
		: sharingInfo.tunnelName === tunnel.name;
}

/** Status of the tunnel host. */
export type TunnelHostStatus =
	| { readonly active: false }
	| { readonly active: true; readonly info: ITunnelHostInfo };

/**
 * Shared-process service that hosts a dev tunnel using the code CLI.
 */
export const ITunnelAgentHostHostingService = createDecorator<ITunnelAgentHostHostingService>('tunnelAgentHostHostingService');

export interface ITunnelAgentHostHostingService {
	readonly _serviceBrand: undefined;

	/** Fires when the hosting status changes. */
	readonly onDidChangeStatus: Event<TunnelHostStatus>;

	/**
	 * Start hosting a dev tunnel that exposes the local agent host.
	 *
	 * @param token The user's access token.
	 * @param authProvider The auth provider that issued the token.
	 */
	startHosting(token: string, authProvider: 'github' | 'microsoft'): Promise<ITunnelHostInfo>;

	/** Stop hosting and clean up the tunnel. */
	stopHosting(): Promise<void>;

	/** Get the current hosting status. */
	getStatus(): Promise<TunnelHostStatus>;
}
