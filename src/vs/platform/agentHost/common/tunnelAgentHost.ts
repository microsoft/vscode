/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../base/common/event.js';
import { createDecorator } from '../../instantiation/common/instantiation.js';
import type { IAgentHostSocketInfo } from './agentService.js';

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
	 * Connect to a tunnel's agent host and register the connection
	 * with {@link IRemoteAgentHostService}.
	 *
	 * @param tunnel The tunnel to connect to.
	 * @param authProvider Optional auth provider to use. If omitted, uses cached/last known.
	 */
	connect(tunnel: ITunnelInfo, authProvider?: 'github' | 'microsoft'): Promise<void>;

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
	readonly tunnelId: string;
	readonly clusterId: string;
	readonly domain: string;
}

/** Status of the tunnel host. */
export type TunnelHostStatus =
	| { readonly active: false }
	| { readonly active: true; readonly info: ITunnelHostInfo };

/**
 * Shared-process service that hosts a dev tunnel using `TunnelRelayTunnelHost`
 * and pipes incoming connections to the local agent host.
 */
export const ITunnelAgentHostHostingService = createDecorator<ITunnelAgentHostHostingService>('tunnelAgentHostHostingService');

export interface ITunnelAgentHostHostingService {
	readonly _serviceBrand: undefined;

	/** Fires when the hosting status changes. */
	readonly onDidChangeStatus: Event<TunnelHostStatus>;

	/**
	 * Start hosting a dev tunnel that forwards connections to the local
	 * agent host. Creates a tunnel with the appropriate labels and port
	 * configuration, then connects a `TunnelRelayTunnelHost`.
	 *
	 * @param token The user's access token.
	 * @param authProvider The auth provider that issued the token.
	 * @param socketInfo Socket path for the local agent host.
	 */
	startHosting(token: string, authProvider: 'github' | 'microsoft', socketInfo: IAgentHostSocketInfo): Promise<ITunnelHostInfo>;

	/** Stop hosting and clean up the tunnel. */
	stopHosting(): Promise<void>;

	/** Get the current hosting status. */
	getStatus(): Promise<TunnelHostStatus>;
}
