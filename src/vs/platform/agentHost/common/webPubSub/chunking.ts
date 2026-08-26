/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Ported from github-ui `https://github.com/github/github-ui/blob/main/packages/ahp-relay/webpubsub/chunking.ts` (Microsoft, MIT).
//
// Chunking codec for the Web PubSub transport (`ChunkEnvelope`). Azure Web
// PubSub rejects any WebSocket frame larger than 1 MB, and the reliable
// subprotocol has no service-side chunking primitive. `ChunkEnvelope` is the
// sole chunking layer on this transport — every publish is wrapped in one (the
// unchunked `kind: "message"` shape is the happy case for small payloads).

import { VSBuffer, decodeBase64, encodeBase64 } from '../../../../base/common/buffer.js';
import { generateUuid } from '../../../../base/common/uuid.js';

/**
 * `ChunkEnvelope` wire shape (snake_case field names per spec).
 *
 * `data` for the `"message"` variant is the complete inner application payload.
 * `bytes` for the `"chunk"` variant is a base64-encoded byte slice (RFC 4648
 * standard, with padding) of the serialised inner payload.
 */
export type ChunkEnvelope =
	| { readonly kind: 'message'; readonly data: unknown }
	| {
		readonly kind: 'chunk';
		readonly group_id: string;
		readonly seq: number;
		readonly total: number;
		readonly bytes: string;
	};

/** Default per-segment ceiling (serialised `ChunkEnvelope` bytes). */
export const DEFAULT_MAX_CHUNK_BYTES = 900 * 1024;

/** Default reassembly timeout in milliseconds. */
export const DEFAULT_REASSEMBLY_TIMEOUT_MS = 30_000;

/** Recommended per-buffer ceiling (decoded payload bytes). */
export const DEFAULT_MAX_REASSEMBLY_BYTES = 32 * 1024 * 1024;

/** Recommended aggregate ceiling across all incomplete reassembly groups. */
export const DEFAULT_MAX_REASSEMBLY_TOTAL_BYTES = 64 * 1024 * 1024;

/** Recommended cap on the number of concurrent in-flight reassembly groups. */
export const DEFAULT_MAX_CONCURRENT_GROUPS = 64;

/** Defensive cap on the `total` field of an individual chunked group. */
export const DEFAULT_MAX_SEGMENTS_PER_GROUP = 4096;

/**
 * Error thrown by {@link Reassembler} on a contract violation and by
 * {@link chunk} on caller-side failures.
 */
export class ChunkingError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'ChunkingError';
	}
}

/** Options accepted by {@link chunk}. */
export interface ChunkOptions {
	/** Per-segment ceiling in serialised-bytes. Defaults to {@link DEFAULT_MAX_CHUNK_BYTES}. */
	readonly maxChunkBytes?: number;

	/** UUID factory invoked once per chunked publish to mint a `group_id`. */
	readonly newGroupId?: () => string;
}

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder('utf-8', { fatal: true });

/** Strict canonical base64 (RFC 4648 standard alphabet, with padding, no whitespace). */
const CANONICAL_BASE64 = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;

/** Encode a byte slice as a base64 string (RFC 4648 standard, with padding). */
function bytesToBase64(bytes: Uint8Array): string {
	return encodeBase64(VSBuffer.wrap(bytes), true /* padded */, false /* urlSafe */);
}

/** Inverse of {@link bytesToBase64}. */
function base64ToBytes(b64: string): Uint8Array {
	return decodeBase64(b64).buffer;
}

/**
 * Split an application payload into one or more {@link ChunkEnvelope}s.
 *
 * If the serialised single-frame envelope fits inside the ceiling, returns a
 * one-element array containing the `kind: "message"` envelope. Otherwise mints
 * a `group_id` and returns `total = ceil(len(B) / R)` `kind: "chunk"`
 * envelopes. The raw-byte budget is derived from the actual group id and the
 * widest permitted sequence fields so every serialized envelope fits.
 */
export function chunk(payload: unknown, options: ChunkOptions = {}): ChunkEnvelope[] {
	const maxChunkBytes = options.maxChunkBytes ?? DEFAULT_MAX_CHUNK_BYTES;
	if (maxChunkBytes <= 0 || !Number.isFinite(maxChunkBytes)) {
		throw new ChunkingError(`maxChunkBytes must be a positive finite number, got ${maxChunkBytes}`);
	}

	let payloadSerialised: string | undefined;
	try {
		payloadSerialised = JSON.stringify(payload);
	} catch (cause) {
		throw new ChunkingError(`payload is not JSON-serialisable: ${(cause as Error).message}`);
	}
	if (payloadSerialised === undefined) {
		throw new ChunkingError('payload is not JSON-serialisable');
	}
	const rawBytes = textEncoder.encode(payloadSerialised);
	if (rawBytes.byteLength > DEFAULT_MAX_REASSEMBLY_BYTES) {
		throw new ChunkingError(
			`serialized payload is ${rawBytes.byteLength} bytes, exceeds ${DEFAULT_MAX_REASSEMBLY_BYTES}-byte ceiling`,
		);
	}

	const singleSerialised = JSON.stringify({ kind: 'message', data: payload });
	if (textEncoder.encode(singleSerialised).byteLength <= maxChunkBytes) {
		return [{ kind: 'message', data: payload }];
	}

	const newGroupId = options.newGroupId ?? generateUuid;
	const groupId = newGroupId();
	if (typeof groupId !== 'string' || groupId.length === 0) {
		throw new ChunkingError('newGroupId() must return a non-empty string');
	}

	const emptyEnvelope: ChunkEnvelope = {
		kind: 'chunk',
		group_id: groupId,
		seq: DEFAULT_MAX_SEGMENTS_PER_GROUP - 1,
		total: DEFAULT_MAX_SEGMENTS_PER_GROUP,
		bytes: '',
	};
	const overhead = textEncoder.encode(JSON.stringify(emptyEnvelope)).byteLength;
	const encodedBudget = Math.floor((maxChunkBytes - overhead) / 4) * 4;
	if (encodedBudget < 4) {
		throw new ChunkingError(
			`maxChunkBytes (${maxChunkBytes}) leaves no complete base64 quantum after ${overhead} bytes of envelope overhead`,
		);
	}
	const rawBudget = (encodedBudget / 4) * 3;
	const total = Math.ceil(rawBytes.byteLength / rawBudget);
	if (total > DEFAULT_MAX_SEGMENTS_PER_GROUP) {
		throw new ChunkingError(`payload requires ${total} chunks, exceeds ${DEFAULT_MAX_SEGMENTS_PER_GROUP}-chunk ceiling`);
	}

	const out: ChunkEnvelope[] = new Array<ChunkEnvelope>(total);
	for (let i = 0; i < total; i++) {
		const start = i * rawBudget;
		const end = Math.min(start + rawBudget, rawBytes.byteLength);
		const slice = rawBytes.subarray(start, end);
		out[i] = {
			kind: 'chunk',
			group_id: groupId,
			seq: i,
			total,
			bytes: bytesToBase64(slice),
		};
	}
	return out;
}

/** Options accepted by {@link Reassembler}. */
export interface ReassemblerOptions {
	/** Drop partial buffers older than this many milliseconds. */
	readonly timeoutMs?: number;

	/** Maximum total decoded bytes a single in-flight group may accumulate. */
	readonly maxBufferBytes?: number;

	/** Maximum decoded bytes retained across every in-flight group. */
	readonly maxTotalBufferBytes?: number;

	/** Maximum number of concurrent in-flight groups. */
	readonly maxConcurrentGroups?: number;

	/** Maximum `total` value the reassembler will accept on any chunked envelope. */
	readonly maxSegmentsPerGroup?: number;

	/** Clock source. Defaults to {@link Date.now}. */
	readonly now?: () => number;
}

interface ReassemblyBuffer {
	total: number;
	received: number;
	segments: Map<number, Uint8Array>;
	accumulatedBytes: number;
	startedAt: number;
}

/**
 * Stateful reassembler. One instance per Web PubSub subscriber connection.
 *
 * On `kind: "message"` {@link Reassembler.ingest} returns the inner payload
 * immediately. On `kind: "chunk"` it returns `null` while waiting for sibling
 * segments and the reassembled inner payload once the final segment arrives.
 * All contract violations throw {@link ChunkingError}.
 */
export class Reassembler {
	private readonly buffers = new Map<string, ReassemblyBuffer>();
	private readonly timeoutMs: number;
	private readonly maxBufferBytes: number;
	private readonly maxTotalBufferBytes: number;
	private readonly maxConcurrentGroups: number;
	private readonly maxSegmentsPerGroup: number;
	private readonly now: () => number;
	private accumulatedBytes = 0;

	constructor(options: ReassemblerOptions = {}) {
		this.timeoutMs = options.timeoutMs ?? DEFAULT_REASSEMBLY_TIMEOUT_MS;
		this.maxBufferBytes = options.maxBufferBytes ?? DEFAULT_MAX_REASSEMBLY_BYTES;
		this.maxTotalBufferBytes = options.maxTotalBufferBytes ?? DEFAULT_MAX_REASSEMBLY_TOTAL_BYTES;
		this.maxConcurrentGroups = options.maxConcurrentGroups ?? DEFAULT_MAX_CONCURRENT_GROUPS;
		this.maxSegmentsPerGroup = options.maxSegmentsPerGroup ?? DEFAULT_MAX_SEGMENTS_PER_GROUP;
		this.now = options.now ?? Date.now;
	}

	/**
	 * Process one inbound envelope. Returns the inner payload when reassembly
	 * completes (or immediately, for a `kind: "message"` envelope), `null` while
	 * waiting for sibling chunks.
	 */
	ingest(envelope: ChunkEnvelope): unknown {
		if (envelope === null || typeof envelope !== 'object') {
			throw new ChunkingError(`ChunkEnvelope must be an object, got ${typeof envelope}`);
		}
		if (envelope.kind === 'message') {
			if (envelope.data === undefined) {
				throw new ChunkingError(`ChunkEnvelope kind:'message' is missing the required 'data' field`);
			}
			return envelope.data;
		}

		if (envelope.kind !== 'chunk') {
			throw new ChunkingError(`unknown ChunkEnvelope kind: ${String((envelope as { kind: unknown }).kind)}`);
		}

		const { group_id: groupId, seq, total, bytes } = envelope;

		if (!Number.isInteger(total) || total < 1) {
			throw new ChunkingError(`total must be a positive integer, got ${total}`);
		}
		if (total > this.maxSegmentsPerGroup) {
			throw new ChunkingError(`total ${total} exceeds maxSegmentsPerGroup ${this.maxSegmentsPerGroup}`);
		}
		if (typeof groupId !== 'string' || groupId.length === 0) {
			throw new ChunkingError('group_id must be a non-empty string');
		}
		if (typeof bytes !== 'string') {
			throw new ChunkingError('bytes must be a base64 string');
		}

		let buffer = this.buffers.get(groupId);
		if (buffer === undefined) {
			if (this.buffers.size >= this.maxConcurrentGroups) {
				throw new ChunkingError(
					`refusing new group_id '${groupId}': ${this.buffers.size} concurrent groups already in flight`,
				);
			}
			buffer = {
				total,
				received: 0,
				segments: new Map<number, Uint8Array>(),
				accumulatedBytes: 0,
				startedAt: this.now(),
			};
			this.buffers.set(groupId, buffer);
		} else if (buffer.total !== total) {
			this.dropBuffer(groupId);
			throw new ChunkingError(`total mismatch for group_id '${groupId}': existing ${buffer.total}, incoming ${total}`);
		}

		if (!Number.isInteger(seq) || seq < 0 || seq >= total) {
			this.dropBuffer(groupId);
			throw new ChunkingError(`seq ${seq} out of range [0, ${total})`);
		}

		if (buffer.segments.has(seq)) {
			this.dropBuffer(groupId);
			throw new ChunkingError(`duplicate seq ${seq} for group_id '${groupId}'`);
		}

		if (!CANONICAL_BASE64.test(bytes)) {
			this.dropBuffer(groupId);
			throw new ChunkingError(`base64 segment for group_id '${groupId}' is not canonical`);
		}

		let decoded: Uint8Array;
		try {
			decoded = base64ToBytes(bytes);
		} catch (cause) {
			this.dropBuffer(groupId);
			throw new ChunkingError(`base64 decode failed for group_id '${groupId}': ${(cause as Error).message}`);
		}

		if (buffer.accumulatedBytes + decoded.byteLength > this.maxBufferBytes) {
			this.dropBuffer(groupId);
			throw new ChunkingError(`group_id '${groupId}' exceeded ${this.maxBufferBytes}-byte reassembly ceiling`);
		}
		if (this.accumulatedBytes + decoded.byteLength > this.maxTotalBufferBytes) {
			this.dropBuffer(groupId);
			throw new ChunkingError(`aggregate reassembly bytes would exceed ${this.maxTotalBufferBytes}-byte ceiling`);
		}

		buffer.segments.set(seq, decoded);
		buffer.received += 1;
		buffer.accumulatedBytes += decoded.byteLength;
		this.accumulatedBytes += decoded.byteLength;

		if (buffer.received < buffer.total) {
			return null;
		}

		const totalBytes = buffer.accumulatedBytes;
		const merged = new Uint8Array(totalBytes);
		let offset = 0;
		for (let i = 0; i < buffer.total; i++) {
			const slice = buffer.segments.get(i);
			if (slice === undefined) {
				this.dropBuffer(groupId);
				throw new ChunkingError(`internal: segment ${i} missing despite received==total`);
			}
			merged.set(slice, offset);
			offset += slice.byteLength;
		}
		this.dropBuffer(groupId);

		let text: string;
		try {
			text = textDecoder.decode(merged);
		} catch (cause) {
			throw new ChunkingError(
				`reassembled payload for group_id '${groupId}' is not valid UTF-8: ${(cause as Error).message}`,
			);
		}
		try {
			return JSON.parse(text) as unknown;
		} catch (cause) {
			throw new ChunkingError(
				`reassembled payload for group_id '${groupId}' is not valid JSON: ${(cause as Error).message}`,
			);
		}
	}

	/** Drop any buffer older than the configured timeout, returning dropped `group_id`s. */
	sweepExpired(): string[] {
		const dropped: string[] = [];
		const cutoff = this.now() - this.timeoutMs;
		for (const [groupId, buffer] of this.buffers) {
			if (buffer.startedAt <= cutoff) {
				this.dropBuffer(groupId);
				dropped.push(groupId);
			}
		}
		return dropped;
	}

	/** Number of in-flight reassembly buffers. Exposed for diagnostics + tests. */
	get inFlightGroupCount(): number {
		return this.buffers.size;
	}

	/** Decoded bytes currently retained across all incomplete groups. */
	get inFlightBytes(): number {
		return this.accumulatedBytes;
	}

	private dropBuffer(groupId: string): void {
		const buffer = this.buffers.get(groupId);
		if (buffer === undefined) {
			return;
		}
		this.accumulatedBytes -= buffer.accumulatedBytes;
		this.buffers.delete(groupId);
	}
}
