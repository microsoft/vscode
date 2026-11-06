/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { vEnum, vLiteral, vNumber, vObj, vOptionalProp, vString, vUnion } from '../../../base/common/validation.js';

/**
 * Schema version for the shared local agent-host endpoint registry under
 * `<userDataPath>/agent-host/local-endpoint/`. Each running agent host owns
 * one immutable entry file at `entries/<sha256hex>.json`; readers additionally
 * merge any legacy `metadata.json` array left by older builds (read-only). This
 * schema is shared with the Rust CLI
 * (`cli/src/tunnels/agent_host_registry.rs`); field renames or removals MUST be
 * coordinated across both languages.
 *
 * Version 1 was the editor-only, socket-path-only schema
 * (`ILocalAgentHostEndpointMetadata` in `node/localAgentHostMetadata.ts`).
 * Version 2 generalizes the registry to hold both editor (socket/pipe) and
 * standalone CLI (TCP) endpoints so every locally running agent host is
 * discoverable from one place. Changing the on-disk container (one file per
 * instance vs. the historical single shared array) did not change this
 * serialized entry shape or `AGENT_HOST_ENDPOINT_REGISTRY_SCHEMA_VERSION`.
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
 * One entry of the shared local agent-host endpoint registry. Each live
 * agent host serializes exactly one of these as its own
 * `entries/<sha256hex>.json` file; a legacy `metadata.json` (and the
 * `code agent endpoints` SSH inventory) instead carries a JSON array of them.
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
 * Parses an array-shaped registry payload (`AgentHostEndpointMetadata[]`) —
 * a legacy `metadata.json` file or the `code agent endpoints` SSH inventory.
 * Every entry is validated independently: malformed entries and entries with
 * an unsupported `schemaVersion` are dropped rather than failing the entire
 * read. A non-array top-level value yields an empty registry.
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

/**
 * Canonical UTF-8 input hashed to derive an identity's `<sha256hex>.json` entry
 * file name. The `\0` separators are unambiguous (no field contains NUL) and the
 * encoding is shared byte-for-byte with the Rust CLI; it MUST NOT change without
 * a coordinated update on both sides.
 */
export function getAgentHostEndpointIdentityHashInput(identity: IAgentHostEndpointIdentity): string {
	return `${identity.type}\0${identity.pid}\0${identity.instanceId}`;
}

export function isSameAgentHostEndpointIdentity(a: IAgentHostEndpointIdentity, b: IAgentHostEndpointIdentity): boolean {
	return a.type === b.type && a.pid === b.pid && a.instanceId === b.instanceId;
}

/**
 * Deduplicates entries by `(type, pid, instanceId)`. If a duplicate identity
 * appears more than once (for example a legacy `metadata.json` entry and a
 * newer per-instance entry file both describe the same owner), the entry
 * encountered later in `entries` wins, since it is presumed to be the most
 * recently written copy.
 */
export function dedupeAgentHostEndpointMetadata(entries: readonly IAgentHostEndpointMetadata[]): IAgentHostEndpointMetadata[] {
	const byIdentity = new Map<string, IAgentHostEndpointMetadata>();
	for (const entry of entries) {
		byIdentity.set(getAgentHostEndpointIdentityKey(entry), entry);
	}
	return [...byIdentity.values()];
}
