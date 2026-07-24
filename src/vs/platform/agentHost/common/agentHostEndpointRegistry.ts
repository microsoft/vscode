/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { vEnum, vLiteral, vNumber, vObj, vOptionalProp, vString, vUnion } from '../../../base/common/validation.js';

/**
 * Schema version for the shared local agent-host endpoint registry at
 * `<userDataPath>/agent-host/local-endpoint/metadata.json`. This schema is
 * shared with the Rust CLI (`cli/src/tunnels/agent_host_metadata.rs`); field
 * renames or removals MUST be coordinated across both languages.
 *
 * Version 1 was the editor-only, socket-path-only schema
 * (`ILocalAgentHostEndpointMetadata` in `node/localAgentHostMetadata.ts`).
 * Version 2 generalizes the registry to hold both editor (socket/pipe) and
 * standalone CLI (TCP) endpoints in the same file so every locally running
 * agent host is discoverable from one place.
 */
export const AGENT_HOST_ENDPOINT_REGISTRY_SCHEMA_VERSION = 2;

/**
 * Kind of process that owns an agent host endpoint. Controls
 * ownership/default-selection policy on the client; it is not by itself a
 * measure of trust or of registry identity (see {@link IAgentHostEndpointIdentity}).
 */
export type AgentHostServerType = 'editor' | 'standalone';

/**
 * How to physically connect to an endpoint. Editor endpoints are always a
 * Unix domain socket or Windows named pipe; the standalone Rust CLI
 * currently only ever publishes a TCP endpoint.
 */
export type AgentHostEndpointAddress =
	| { readonly type: 'socket'; readonly path: string }
	| { readonly type: 'tcp'; readonly host: string; readonly port: number };

/**
 * One entry of the shared local agent-host endpoint registry. The registry
 * file itself is a JSON array of these entries
 * (`AgentHostEndpointMetadata[]`).
 */
export interface IAgentHostEndpointMetadata {
	readonly schemaVersion: typeof AGENT_HOST_ENDPOINT_REGISTRY_SCHEMA_VERSION;
	readonly type: AgentHostServerType;
	readonly pid: number;
	readonly instanceId: string;
	readonly protocolVersion: string;
	readonly connectionToken: string;
	readonly endpoint: AgentHostEndpointAddress;
	readonly quality?: string;
	readonly tunnelName?: string;
}

/**
 * The subset of {@link IAgentHostEndpointMetadata} that identifies a unique
 * registry entry/owner: `(type, pid, instanceId)`. `instanceId` makes
 * identity safe across PID reuse and rapid process replacement; `pid` alone
 * is not a safe key because operating systems recycle PIDs.
 */
export interface IAgentHostEndpointIdentity {
	readonly type: AgentHostServerType;
	readonly pid: number;
	readonly instanceId: string;
}

const endpointAddressValidator = vUnion(
	vObj({ type: vLiteral('socket'), path: vString() }),
	vObj({ type: vLiteral('tcp'), host: vString(), port: vNumber() }),
);

const entryValidator = vObj({
	schemaVersion: vNumber(),
	type: vEnum('editor', 'standalone'),
	pid: vNumber(),
	instanceId: vString(),
	protocolVersion: vString(),
	connectionToken: vString(),
	endpoint: endpointAddressValidator,
	quality: vOptionalProp(vString()),
	tunnelName: vOptionalProp(vString()),
});

/**
 * Structurally validates one raw registry entry and returns it typed, or
 * `undefined` if it is malformed or its `schemaVersion` is not the one this
 * build understands. Every field is treated as untrusted input.
 */
export function parseAgentHostEndpointMetadataEntry(raw: unknown): IAgentHostEndpointMetadata | undefined {
	const { content, error } = entryValidator.validate(raw);
	if (error) {
		return undefined;
	}
	if (content.schemaVersion !== AGENT_HOST_ENDPOINT_REGISTRY_SCHEMA_VERSION) {
		// Unsupported (older/newer) schema version: ignore rather than reject
		// the whole registry, so a foreign writer's entry cannot hide every
		// other live writer's endpoint.
		return undefined;
	}
	if (!Number.isSafeInteger(content.pid) || content.pid <= 0) {
		return undefined;
	}
	if (content.endpoint.type === 'tcp' && (!Number.isSafeInteger(content.endpoint.port) || content.endpoint.port <= 0 || content.endpoint.port > 65535)) {
		return undefined;
	}

	return {
		schemaVersion: AGENT_HOST_ENDPOINT_REGISTRY_SCHEMA_VERSION,
		type: content.type,
		pid: content.pid,
		instanceId: content.instanceId,
		protocolVersion: content.protocolVersion,
		connectionToken: content.connectionToken,
		endpoint: content.endpoint,
		quality: content.quality,
		tunnelName: content.tunnelName,
	};
}

/**
 * Parses the raw contents of the registry file (expected to be
 * `AgentHostEndpointMetadata[]`). Every entry is validated independently:
 * malformed entries and entries with an unsupported `schemaVersion` are
 * dropped rather than failing the entire read. A non-array top-level value
 * yields an empty registry.
 */
export function parseAgentHostEndpointRegistry(raw: unknown): IAgentHostEndpointMetadata[] {
	if (!Array.isArray(raw)) {
		return [];
	}
	const entries: IAgentHostEndpointMetadata[] = [];
	for (const item of raw) {
		const entry = parseAgentHostEndpointMetadataEntry(item);
		if (entry) {
			entries.push(entry);
		}
	}
	return entries;
}

/** Stable string key for `(type, pid, instanceId)`, suitable for use as a Map key. */
export function getAgentHostEndpointIdentityKey(identity: IAgentHostEndpointIdentity): string {
	return `${identity.type}:${identity.pid}:${identity.instanceId}`;
}

export function isSameAgentHostEndpointIdentity(a: IAgentHostEndpointIdentity, b: IAgentHostEndpointIdentity): boolean {
	return a.type === b.type && a.pid === b.pid && a.instanceId === b.instanceId;
}

/**
 * Deduplicates entries by `(type, pid, instanceId)`. If a duplicate identity
 * appears more than once (for example a crashed writer left a stale copy
 * before another writer's cleanup ran), the entry encountered later in
 * `entries` wins, since it is presumed to be the most recently written copy.
 */
export function dedupeAgentHostEndpointMetadata(entries: readonly IAgentHostEndpointMetadata[]): IAgentHostEndpointMetadata[] {
	const byIdentity = new Map<string, IAgentHostEndpointMetadata>();
	for (const entry of entries) {
		byIdentity.set(getAgentHostEndpointIdentityKey(entry), entry);
	}
	return [...byIdentity.values()];
}

/**
 * Returns `entries` with any existing entry sharing `metadata`'s identity
 * replaced by `metadata`. Used by a writer to upsert its own registry entry
 * without disturbing other writers' entries.
 */
export function upsertAgentHostEndpointMetadata(entries: readonly IAgentHostEndpointMetadata[], metadata: IAgentHostEndpointMetadata): IAgentHostEndpointMetadata[] {
	const remaining = entries.filter(entry => !isSameAgentHostEndpointIdentity(entry, metadata));
	remaining.push(metadata);
	return remaining;
}

/**
 * Returns `entries` with the exact-identity-matching entry removed, if any.
 * Used on shutdown so a writer only ever removes its own entry, never a
 * newer process's entry that happens to share its PID.
 */
export function removeAgentHostEndpointMetadata(entries: readonly IAgentHostEndpointMetadata[], owner: IAgentHostEndpointIdentity): IAgentHostEndpointMetadata[] {
	return entries.filter(entry => !isSameAgentHostEndpointIdentity(entry, owner));
}
