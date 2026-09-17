/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Ported from github-ui `https://github.com/github/github-ui/blob/main/packages/ahp-relay/webpubsub/framing.ts` (Microsoft, MIT).
//
// Web PubSub `sendToGroup` framing — outbound envelope builder + inbound parser.
//
// The layer above {@link chunk}: every outbound payload is wrapped in one or
// more {@link ChunkEnvelope}s, each carried by a Web PubSub `sendToGroup`
// command. The inbound path is the mirror image. This module is pure JSON ↔
// JSON; it owns no WebSocket and speaks no handshake.

import { type ChunkEnvelope, type ChunkOptions, Reassembler, chunk } from './chunking.js';
import { parseGroupName, type ParseGroupNameOptions, type ParsedGroup } from './groups.js';

/**
 * The Web PubSub subprotocol used by every consumer of this transport. All
 * framing is text-frame JSON.
 */
export const RELIABLE_JSON_SUBPROTOCOL = 'json.reliable.webpubsub.azure.v1';

/**
 * Web PubSub `sendToGroup` command on the outbound wire. `ackId` is a monotonic
 * per-publisher counter scoped to the connection.
 */
export interface SendToGroupCommand {
	readonly type: 'sendToGroup';
	readonly group: string;
	readonly ackId: number;
	readonly dataType: 'json';
	readonly noEcho: true;
	readonly data: ChunkEnvelope;
}

/**
 * Web PubSub group-message envelope on the inbound wire. The `from: 'group'`
 * discriminant distinguishes group-fanout messages from service-level events.
 */
export interface GroupMessage {
	readonly type: 'message';
	readonly from: 'group';
	readonly group: string;
	readonly dataType: 'json';
	readonly data: ChunkEnvelope;
	readonly fromUserId?: string;
	readonly sequenceId?: number;
}

/** Options accepted by {@link buildPublish}. */
export interface BuildPublishOptions {
	/** Target group name (must be a valid {@link parseGroupName} input). */
	readonly group: string;

	/** Source of monotonic `ackId` values for the publishing connection. */
	readonly nextAckId: () => number;

	/** Inner application payload. */
	readonly payload: unknown;

	/** Forwarded to {@link chunk}. */
	readonly chunkOptions?: ChunkOptions;
}

/**
 * Build the list of {@link SendToGroupCommand}s to publish for a single
 * application payload. An oversized payload chunks into multiple envelopes,
 * each carried by its own frame with its own `ackId`.
 */
export function buildPublish(options: BuildPublishOptions): SendToGroupCommand[] {
	const envelopes = chunk(options.payload, options.chunkOptions);
	return envelopes.map(
		envelope => ({
			type: 'sendToGroup',
			group: options.group,
			ackId: options.nextAckId(),
			dataType: 'json',
			noEcho: true,
			data: envelope,
		} satisfies SendToGroupCommand),
	);
}

/**
 * Result of {@link parseInbound}.
 *
 * - `kind: 'payload'` — a complete inner application payload is ready.
 * - `kind: 'pending'` — a chunk segment was accepted; reassembly continues.
 * - `kind: 'ignored'` — the frame was not a group-fanout message.
 */
export type InboundResult =
	| { readonly kind: 'payload'; readonly group: ParsedGroup; readonly payload: unknown }
	| { readonly kind: 'pending'; readonly group: ParsedGroup }
	| { readonly kind: 'ignored' };

/**
 * Error thrown by {@link parseInbound} when a frame is definitely a
 * group-fanout message but the receive envelope itself is malformed.
 */
export class FramingError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'FramingError';
	}
}

/** Options accepted by {@link parseInbound}. */
export interface ParseInboundOptions {
	/** Reassembler instance for this subscriber connection. */
	readonly reassembler: Reassembler;

	/** Forwarded to {@link parseGroupName}. */
	readonly groupValidation?: ParseGroupNameOptions;
}

function isObject(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null;
}

/**
 * Decode one inbound Web PubSub frame (already JSON-parsed) into a structured
 * {@link InboundResult}. Non group-fanout frames are `kind: 'ignored'`;
 * malformed group-fanout frames raise a {@link FramingError}.
 */
export function parseInbound(frame: unknown, options: ParseInboundOptions): InboundResult {
	if (!isObject(frame)) {
		return { kind: 'ignored' };
	}
	if (frame['type'] !== 'message' || frame['from'] !== 'group') {
		return { kind: 'ignored' };
	}
	if (frame['dataType'] !== 'json') {
		throw new FramingError(`group-fanout frame has unsupported dataType '${String(frame['dataType'])}'`);
	}
	if (typeof frame['group'] !== 'string') {
		throw new FramingError(`group-fanout frame is missing a string 'group' field`);
	}
	if (!isObject(frame['data'])) {
		throw new FramingError(`group-fanout frame is missing a 'data' ChunkEnvelope`);
	}

	const group = parseGroupName(frame['group'], options.groupValidation);
	const envelope = frame['data'] as ChunkEnvelope;
	const payload = options.reassembler.ingest(envelope);
	if (payload === null) {
		return { kind: 'pending', group };
	}
	return { kind: 'payload', group, payload };
}
