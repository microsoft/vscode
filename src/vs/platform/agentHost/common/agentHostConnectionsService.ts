/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../base/common/event.js';
import type { URI } from '../../../base/common/uri.js';
import { createDecorator } from '../../instantiation/common/instantiation.js';
import type { IAgentConnection } from './agentService.js';

/**
 * Chat-session resource scheme prefix for the window's ambient/local agent
 * host: `agent-host-<provider>`.
 *
 * Remote agent host session schemes (`remote-<authority>-<provider>`) are
 * handled by `agentHostSessionType.ts` (`isRemoteAgentHostSessionType` and
 * friends), which also owns the authority disambiguation.
 */
export const LOCAL_AGENT_HOST_SCHEME_PREFIX = 'agent-host-';

/**
 * Reserved connection authority for the window's ambient/primary agent host.
 *
 * NOTE: "ambient" is not the same as "local". In a local window the ambient
 * host is the in-process utility agent host; in a window attached to a remote
 * authority the ambient host is itself remote (the `EditorRemoteAgentHostServiceClient`).
 * The `'local'` string is reserved/canonical for this ambient connection — it
 * is already used as the agent-host URI authority for in-window resources
 * (see `toAgentHostUri` in `agentHostUri.ts`).
 */
export const AMBIENT_AGENT_HOST_AUTHORITY = 'local';

/**
 * A descriptor for a single agent-host connection exposed by
 * {@link IAgentHostConnectionsService}. Covers both the window's ambient host
 * and every connected remote host with one uniform shape.
 */
export interface IAgentHostConnectionInfo {
	/**
	 * Sanitized connection authority. The ambient host uses
	 * {@link AMBIENT_AGENT_HOST_AUTHORITY}; remotes use the authority derived
	 * from their address via `agentHostAuthority`.
	 */
	readonly authority: string;
	/** Raw remote address. `undefined` for the ambient host. */
	readonly address: string | undefined;
	/** Human-readable label for the connection. */
	readonly name: string;
	/**
	 * `true` for the window's ambient/primary host. Remember this host may
	 * itself be remote in a remote window — see {@link AMBIENT_AGENT_HOST_AUTHORITY}.
	 */
	readonly isAmbient: boolean;
	/** The live connection, or `undefined` when not currently connected. */
	readonly connection: IAgentConnection | undefined;
}

/**
 * The result of resolving a chat-session resource to its backing agent host:
 * the owning {@link IAgentConnection} and the canonical backend agent-session
 * URI (`<provider>:/<rawId>`) used for protocol operations on that connection.
 */
export interface IAgentHostSessionResolution {
	readonly connection: IAgentConnection;
	readonly backendSession: URI;
}

export const IAgentHostConnectionsService = createDecorator<IAgentHostConnectionsService>('agentHostConnectionsService');

/**
 * A thin, read-only facade over the window's ambient agent host
 * (`IAgentHostService`) and the registry of remote agent hosts
 * (`IRemoteAgentHostService`), so consumers can enumerate and resolve
 * {@link IAgentConnection}s without branching on local-vs-remote or
 * fanning out over "1 ambient + N remote" themselves.
 *
 * This service deliberately does NOT expose lifecycle/management operations:
 * ambient-process concerns (restart, inspect, auth-pending) stay on
 * `IAgentHostService`, and remote-registry mutations (add/remove/reconnect/
 * upgrade) stay on `IRemoteAgentHostService`. This facade only answers
 * "which connections exist?" and "give me the connection for X".
 */
export interface IAgentHostConnectionsService {
	readonly _serviceBrand: undefined;

	/** Fires when the set of connections changes (ambient lifecycle or remotes added/removed). */
	readonly onDidChangeConnections: Event<void>;

	/**
	 * All known connections as `[ambient, ...remotes]`. The ambient entry is
	 * always present with a live `connection`; only remote entries may have
	 * `connection: undefined` (e.g. while connecting/disconnected). Remote
	 * entries reflect the current `IRemoteAgentHostService` registry.
	 */
	readonly connections: readonly IAgentHostConnectionInfo[];

	/** The window's ambient/primary connection (local, or the window-remote bridge). */
	readonly ambientConnection: IAgentConnection;

	/**
	 * Resolves a live connection by sanitized authority, including
	 * {@link AMBIENT_AGENT_HOST_AUTHORITY} for the ambient host. Returns
	 * `undefined` when no connected host matches.
	 */
	getConnectionByAuthority(authority: string): IAgentConnection | undefined;

	/**
	 * Resolves a live remote connection by raw address. The ambient host has no
	 * address and is never returned here — use {@link ambientConnection} or
	 * {@link getConnectionByAuthority} with {@link AMBIENT_AGENT_HOST_AUTHORITY}.
	 */
	getConnectionByAddress(address: string): IAgentConnection | undefined;

	/**
	 * Resolves an agent-host chat-session resource to its owning connection and
	 * backend session URI. Handles both local schemes
	 * (`agent-host-<provider>`) — backed by the ambient connection — and remote
	 * schemes (`remote-<authority>-<provider>`) — resolved against the live
	 * remote registry. Returns `undefined` when the resource is not an
	 * agent-host session, or when the matching remote host is not connected.
	 *
	 * NOTE: provisional/untitled sessions are a workbench concern and are NOT
	 * handled here — callers that support them should resolve those first.
	 */
	resolveSessionResource(sessionResource: URI): IAgentHostSessionResolution | undefined;
}
