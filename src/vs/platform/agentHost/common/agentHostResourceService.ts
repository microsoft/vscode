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

/** Trusted identity used only by the in-process local agent host. */
export const LOCAL_AGENT_HOST_RESOURCE_IDENTITY: unique symbol = Symbol('localAgentHostResourceIdentity');

/** Authorization identity for an agent host requesting client-side resources. */
export type AgentHostResourceIdentity = string | typeof LOCAL_AGENT_HOST_RESOURCE_IDENTITY;

/** Configuration key for persisted per-host filesystem grants. */
export const AgentHostLocalFilePermissionsSettingId = 'chat.agentHost.localFilePermissions';

/** Persisted access mode for a granted URI. */
export const enum AgentHostAccessMode {
	Read = 'r',
	ReadWrite = 'rw',
}

/**
 * Persisted shape of {@link AgentHostLocalFilePermissionsSettingId}:
 * `{ [normalizedAddress]: { [canonicalUriString]: 'r' | 'rw' | { mode, lexicalUri } } }`.
 */
export type AgentHostPermissionGrant = AgentHostAccessMode | {
	readonly mode: AgentHostAccessMode;
	readonly lexicalUri: string;
};

export type AgentHostPermissionsSetting = Record<string, Record<string, AgentHostPermissionGrant>>;

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
 * Each FS method is gated by a permission check keyed on
 * {@link AgentHostResourceIdentity}: a normalized network host for remote
 * agent hosts, or {@link LOCAL_AGENT_HOST_RESOURCE_IDENTITY} for the local
 * utility-process host.
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

	list(identity: AgentHostResourceIdentity, uri: URI): Promise<IResourceListResult>;
	read(identity: AgentHostResourceIdentity, uri: URI): Promise<IResourceReadResult>;
	write(identity: AgentHostResourceIdentity, params: ResourceWriteParams): Promise<void>;
	del(identity: AgentHostResourceIdentity, params: ResourceDeleteParams): Promise<void>;
	move(identity: AgentHostResourceIdentity, params: ResourceMoveParams): Promise<void>;
	copy(identity: AgentHostResourceIdentity, params: ResourceCopyParams): Promise<void>;
	resolve(identity: AgentHostResourceIdentity, params: ResourceResolveParams): Promise<ResourceResolveResult>;
	mkdir(identity: AgentHostResourceIdentity, params: ResourceMkdirParams): Promise<void>;

	// ---- Permission requests / observables (UI) ----------------------------

	/**
	 * Returns whether {@link uri} is already granted for {@link mode} on the
	 * given identity.
	 */
	check(identity: AgentHostResourceIdentity, uri: URI, mode: AgentHostPermissionMode): Promise<boolean>;

	/**
	 * Handle an inbound `resourceRequest` from a host. Resolves once access
	 * is granted (immediately, if already covered); rejects with a
	 * `CancellationError` if the user denies or the connection closes.
	 */
	request(identity: AgentHostResourceIdentity, params: ResourceRequestParams): Promise<void>;

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
	 * Register an implicit read grant for {@link uri} (and descendants) on the
	 * given identity.
	 */
	grantImplicitRead(identity: AgentHostResourceIdentity, uri: URI): IDisposable;

	/** Drops grants and pending requests owned by a closed connection. */
	connectionClosed(identity: AgentHostResourceIdentity): void;
}
