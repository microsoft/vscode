/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Ported from github-ui `https://github.com/github/github-ui/blob/main/packages/ahp-relay/webpubsub/groups.ts` (Microsoft, MIT).
//
// Group-name validator/parser for the Web PubSub transport. Validates and
// classifies inbound Web PubSub group names against the portable group-name
// wire grammar. The lane names a client needs are received from Mission
// Control's connect response; this module validates inbound names.
//
// Grammar:
//
//   group-name           = "user." <uid> "." "env." <eid> "." lane
//   per-client-lane      = "client." <cid> "." direction
//   direction            = "broadcast" | "to-host" | "to-client"
//   per-environment-lane = "root" | "events" | "lifecycle" | "control" | "ingest-ack"
//
// Identifier segments are opaque and restricted to ASCII letters, digits,
// underscores, and hyphens. The total group name must fit in
// {@link MAX_GROUP_NAME_BYTES} UTF-8 bytes.

/** Maximum length of a group name in UTF-8 bytes (operational-safety ceiling). */
export const MAX_GROUP_NAME_BYTES = 256;

/** Per-environment lane suffixes — the complete lane catalogue for env lanes. */
export type EnvLane = 'root' | 'events' | 'lifecycle' | 'control' | 'ingest-ack';

/** Per-client lane discriminator. */
export type ClientLaneKind = 'broadcast' | 'to-host' | 'to-client';

/** Structured result of {@link parseGroupName} for a per-client lane. */
export type ParsedClientLane = {
	readonly scope: 'client';
	readonly lane: ClientLaneKind;
	readonly cid: string;
};

/** Structured result of {@link parseGroupName} for a per-environment lane. */
export type ParsedEnvLane = {
	readonly scope: 'env';
	readonly lane: EnvLane;
};

/** Parsed group name. Always carries `uid` and `eid`; `lane` discriminates scope. */
export type ParsedGroup = (ParsedClientLane | ParsedEnvLane) & {
	readonly uid: string;
	readonly eid: string;
};

/**
 * Error thrown by {@link parseGroupName} when a name violates the grammar's
 * validation rules or the {@link MAX_GROUP_NAME_BYTES} ceiling.
 */
export class GroupNameError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'GroupNameError';
	}
}

/** Options accepted by {@link parseGroupName}. */
export interface ParseGroupNameOptions {
	/**
	 * If set, the parser rejects any group name whose `<uid>`, `<eid>`, or
	 * per-client `<cid>` segment does not match. Omit a field to skip that check.
	 */
	readonly expected?: { readonly uid?: string; readonly eid?: string; readonly cid?: string };
}

const encoder = new TextEncoder();
const OPAQUE_ID = /^[A-Za-z0-9_-]+$/;

function validateOpaqueId(name: 'uid' | 'eid' | 'cid', value: string): void {
	if (value.length === 0) {
		throw new GroupNameError(`${name} segment is empty`);
	}
	if (!OPAQUE_ID.test(value)) {
		throw new GroupNameError(`${name} segment contains characters outside the opaque-id grammar`);
	}
}

/**
 * Parse a group name into its structured components, throwing a
 * {@link GroupNameError} on any rule violation.
 */
export function parseGroupName(name: string, options: ParseGroupNameOptions = {}): ParsedGroup {
	const byteLength = encoder.encode(name).byteLength;
	if (byteLength > MAX_GROUP_NAME_BYTES) {
		throw new GroupNameError(`group name is ${byteLength} bytes, exceeds ${MAX_GROUP_NAME_BYTES}-byte cap`);
	}
	if (byteLength === 0) {
		throw new GroupNameError('group name is empty');
	}

	const segments = name.split('.');
	if (segments.length < 5) {
		throw new GroupNameError(`expected at least 5 segments, got ${segments.length}: ${name}`);
	}

	if (segments[0] !== 'user') {
		throw new GroupNameError(`expected first segment 'user', got '${segments[0]}'`);
	}
	const uid = segments[1] ?? '';
	validateOpaqueId('uid', uid);
	if (options.expected?.uid !== undefined && uid !== options.expected.uid) {
		throw new GroupNameError(`uid '${uid}' does not match expected '${options.expected.uid}'`);
	}

	if (segments[2] !== 'env') {
		throw new GroupNameError(`expected third segment 'env', got '${segments[2]}'`);
	}
	const eid = segments[3] ?? '';
	validateOpaqueId('eid', eid);
	if (options.expected?.eid !== undefined && eid !== options.expected.eid) {
		throw new GroupNameError(`eid '${eid}' does not match expected '${options.expected.eid}'`);
	}

	const lane = segments.slice(4);

	if (lane[0] === 'client') {
		if (lane.length < 3) {
			throw new GroupNameError(`client lane truncated: ${name}`);
		}
		const cid = lane[1] ?? '';
		validateOpaqueId('cid', cid);
		if (options.expected?.cid !== undefined && cid !== options.expected.cid) {
			throw new GroupNameError(`cid '${cid}' does not match expected '${options.expected.cid}'`);
		}
		const direction = lane[2];
		if (direction === 'broadcast' || direction === 'to-host' || direction === 'to-client') {
			if (lane.length !== 3) {
				throw new GroupNameError(`unexpected trailing segments after '${direction}': ${lane.slice(3).join('.')}`);
			}
			return { scope: 'client', lane: direction, uid, eid, cid };
		}
		throw new GroupNameError(`unknown client direction '${direction}'`);
	}

	if (lane.length !== 1) {
		throw new GroupNameError(`env lane must be a single segment, got ${lane.length}: ${lane.join('.')}`);
	}
	const envLane = lane[0];
	if (
		envLane !== 'root' &&
		envLane !== 'events' &&
		envLane !== 'lifecycle' &&
		envLane !== 'control' &&
		envLane !== 'ingest-ack'
	) {
		throw new GroupNameError(`unknown env lane '${envLane}'`);
	}
	return { scope: 'env', lane: envLane, uid, eid };
}
