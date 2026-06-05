/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { VSBuffer } from '../../../base/common/buffer.js';
import { IDisposable } from '../../../base/common/lifecycle.js';
import { IObservable } from '../../../base/common/observable.js';
import { URI } from '../../../base/common/uri.js';
import { createDecorator } from '../../instantiation/common/instantiation.js';
import {
	DirectoryEntry,
	ResourceCopyParams, ResourceDeleteParams, ResourceMkdirParams, ResourceMoveParams,
	ResourceRequestParams, ResourceResolveParams, ResourceResolveResult, ResourceWriteParams,
} from './state/protocol/commands.js';

/**
 * Stable sentinel address used for the in-process local agent host. Keyed
 * persisted grants in user settings live under this name so that "Always
 * allow" survives window reloads.
 */
export const LOCAL_AGENT_HOST_ADDRESS = 'local';

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

/**
 * Thrown by gated FS operations on {@link IAgentHostResourceService} when
 * the calling address lacks the required permission. Carries the
 * {@link ResourceRequestParams} that, if approved, would unlock the
 * operation, so wire adapters can echo it back to the agent host inside a
 * `PermissionDenied` frame and let the host run the standard
 * `resourceRequest` → retry loop.
 */
export class AgentHostResourcePermissionError extends Error {
	constructor(public readonly request: ResourceRequestParams | undefined) {
		super(request
			? `Access to ${request.uri} is not granted.`
			: 'Access to the requested resource is not granted.');
		this.name = 'AgentHostResourcePermissionError';
	}
}

export interface IResourceReadResult {
	readonly bytes: VSBuffer;
}

export interface IResourceListResult {
	readonly entries: readonly DirectoryEntry[];
}

export const IAgentHostResourceService = createDecorator<IAgentHostResourceService>('agentHostResourceService');

/**
 * Single owner of agent-host-facing filesystem operations and the
 * permission policy that gates them. Combines what were previously two
 * services (`IAgentHostPermissionService` + `IAgentHostVirtualResourceProvider`)
 * into one consistent interface used by both the in-process local channel
 * and the remote protocol client.
 *
 * Each FS method is gated by a permission check keyed on `address`: a
 * normalized network host for remote agent hosts, or
 * {@link LOCAL_AGENT_HOST_ADDRESS} for the local utility-process host.
 * Denied operations throw {@link AgentHostResourcePermissionError} carrying
 * the {@link ResourceRequestParams} that, if granted, would unlock the
 * operation.
 *
 * Read operations transparently fall back to virtual content (untitled
 * documents, notebook cells, ...) when the local file service cannot
 * resolve the URI.
 */
export interface IAgentHostResourceService {
	readonly _serviceBrand: undefined;

	// ---- Gated filesystem operations ---------------------------------------

	list(address: string, uri: URI): Promise<IResourceListResult>;
	read(address: string, uri: URI): Promise<IResourceReadResult>;
	write(address: string, params: ResourceWriteParams): Promise<void>;
	del(address: string, params: ResourceDeleteParams): Promise<void>;
	move(address: string, params: ResourceMoveParams): Promise<void>;
	copy(address: string, params: ResourceCopyParams): Promise<void>;
	resolve(address: string, params: ResourceResolveParams): Promise<ResourceResolveResult>;
	mkdir(address: string, params: ResourceMkdirParams): Promise<void>;

	// ---- Permission requests / observables (UI) ----------------------------

	/**
	 * Returns whether {@link uri} is already granted for {@link mode} on
	 * {@link address}. Useful as a pre-check before sending data to a host
	 * that will read it back. The same gating runs implicitly inside every
	 * FS method on this service.
	 */
	check(address: string, uri: URI, mode: AgentHostPermissionMode): Promise<boolean>;

	/**
	 * Handle an inbound `resourceRequest` from a host. Resolves once access
	 * is granted (immediately, if already covered); rejects with a
	 * `CancellationError` if the user denies or the connection closes.
	 */
	request(address: string, params: ResourceRequestParams): Promise<void>;

	/** Per-address observable of pending requests for UI surfaces. */
	pendingFor(address: string): IObservable<readonly IPendingResourceRequest[]>;

	/** Observable of all pending requests across every address. */
	readonly allPending: IObservable<readonly IPendingResourceRequest[]>;

	/**
	 * Find a pending request by id, across all addresses. Returns
	 * `undefined` once the request has been resolved or rejected.
	 */
	findPending(id: string): IPendingResourceRequest | undefined;

	// ---- Implicit grants and lifecycle -------------------------------------

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
