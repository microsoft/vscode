/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IDisposable } from '../../../base/common/lifecycle.js';
import { IObservable } from '../../../base/common/observable.js';
import { URI } from '../../../base/common/uri.js';
import { createDecorator } from '../../instantiation/common/instantiation.js';
import { ResourceRequestParams } from './state/protocol/commands.js';

/** Configuration key for persisted per-host filesystem grants. */
export const AgentHostLocalFilePermissionsSettingId = 'chat.agentHost.localFilePermissions';

/** Persisted access mode for a granted URI. */
export const enum AgentHostAccessMode {
	Read = 'r',
	ReadWrite = 'rw',
}

/**
 * Persisted shape of {@link AgentHostLocalFilePermissionsSettingId}:
 * `{ [normalizedAddress]: { [uriString]: 'r' | 'rw' } }`.
 */
export type AgentHostPermissionsSetting = Record<string, Record<string, AgentHostAccessMode>>;

/**
 * Capability a request needs from the user. The protocol-level `read` and
 * `write` flags are split into one or two of these requests.
 */
export const enum AgentHostPermissionMode {
	Read = 'read',
	Write = 'write',
}

/** A single pending permission request awaiting user input. */
export interface IPendingResourceRequest {
	readonly id: string;
	readonly address: string;
	readonly uri: URI;
	readonly mode: AgentHostPermissionMode;
	/** Approve and remember the grant in user settings. */
	allowAlways(): void;
	/**
	 * Approve the request and remember it in memory for the lifetime of the
	 * connection (cleared on connection close or window reload).
	 */
	allow(): void;
	/** Reject this request. */
	deny(): void;
}

export const IAgentHostPermissionService = createDecorator<IAgentHostPermissionService>('agentHostPermissionService');

export interface IAgentHostPermissionService {
	readonly _serviceBrand: undefined;

	/**
	 * Returns whether {@link uri} is already granted for {@link mode} on
	 * {@link address}, considering implicit read grants, in-memory session
	 * grants, and persisted permissions. The URI is canonicalized through
	 * the file service (realpath) before comparison so symlinks and `..`
	 * traversal cannot bypass a grant.
	 */
	check(address: string, uri: URI, mode: AgentHostPermissionMode): Promise<boolean>;

	/**
	 * Handle an inbound `resourceRequest` from a host. Resolves once access
	 * is granted (immediately, if {@link check} already covers the request);
	 * rejects if the user denies or the connection closes.
	 */
	request(address: string, params: ResourceRequestParams): Promise<void>;

	/** Per-address observable of pending requests for UI surfaces. */
	pendingFor(address: string): IObservable<readonly IPendingResourceRequest[]>;

	/**
	 * Observable of all pending requests across every address. Useful for
	 * surfaces that aren't scoped to a single session/connection.
	 */
	readonly allPending: IObservable<readonly IPendingResourceRequest[]>;

	/**
	 * Find a pending request by id, across all addresses. Returns
	 * `undefined` once the request has been resolved or rejected.
	 */
	findPending(id: string): IPendingResourceRequest | undefined;

	/**
	 * Register an implicit read grant for {@link uri} (and descendants) on
	 * {@link address}. Used by call sites that are about to send a URI to a
	 * host and therefore expect that host to read it back. The returned
	 * disposable revokes the grant.
	 */
	grantImplicitRead(address: string, uri: URI): IDisposable;

	/**
	 * Notify that the connection at {@link address} has closed. Drops all
	 * implicit grants and rejects any outstanding pending requests.
	 */
	connectionClosed(address: string): void;
}
