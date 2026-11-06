/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { VSBuffer, encodeBase64 } from '../../../../../base/common/buffer.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { type ChunkEnvelope, ChunkingError, Reassembler, chunk } from '../../../common/webPubSub/chunking.js';

/** Standard base64 (padded) of an ASCII string — equivalent to `btoa(s)` for ASCII input. */
function b64(s: string): string {
	return encodeBase64(VSBuffer.fromString(s), true /* padded */, false /* urlSafe */);
}

function reassembleAll(envelopes: ChunkEnvelope[], r = new Reassembler()): unknown {
	let result: unknown = null;
	for (const env of envelopes) {
		result = r.ingest(env);
	}
	return result;
}

suite('WebPubSub - chunk', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('wraps a small payload in a single message envelope', () => {
		const envelopes = chunk({ hello: 'world' });
		assert.deepStrictEqual(envelopes, [{ kind: 'message', data: { hello: 'world' } }]);
	});

	test('splits an oversized payload into multiple chunk envelopes', () => {
		const big = { blob: 'x'.repeat(5000) };
		const envelopes = chunk(big, { maxChunkBytes: 1024, newGroupId: () => 'g1' });
		assert.ok(envelopes.length > 1);
		assert.ok(envelopes.every(e => e.kind === 'chunk'));
		const total = envelopes.length;
		envelopes.forEach((e, i) => {
			assert.deepStrictEqual(
				{ kind: e.kind, group_id: (e as Extract<ChunkEnvelope, { kind: 'chunk' }>).group_id, seq: (e as Extract<ChunkEnvelope, { kind: 'chunk' }>).seq, total: (e as Extract<ChunkEnvelope, { kind: 'chunk' }>).total },
				{ kind: 'chunk', group_id: 'g1', seq: i, total },
			);
		});
	});

	test('matches the pinned 200-byte portable split vector', () => {
		const payload = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.repeat(7);
		const groupId = '00000000-0000-4000-8000-000000000000';
		assert.deepStrictEqual(chunk(payload, { maxChunkBytes: 200, newGroupId: () => groupId }), [
			{
				kind: 'chunk',
				group_id: groupId,
				seq: 0,
				total: 3,
				bytes: 'IkFCQ0RFRkdISUpLTE1OT1BRUlNUVVZXWFlaQUJDREVGR0hJSktMTU5PUFFSU1RVVldYWVpBQkNERUZHSElKS0xNTk9QUVJT',
			},
			{
				kind: 'chunk',
				group_id: groupId,
				seq: 1,
				total: 3,
				bytes: 'VFVWV1hZWkFCQ0RFRkdISUpLTE1OT1BRUlNUVVZXWFlaQUJDREVGR0hJSktMTU5PUFFSU1RVVldYWVpBQkNERUZHSElKS0xN',
			},
			{
				kind: 'chunk',
				group_id: groupId,
				seq: 2,
				total: 3,
				bytes: 'Tk9QUVJTVFVWV1hZWkFCQ0RFRkdISUpLTE1OT1BRUlNUVVZXWFlaIg==',
			},
		]);
	});

	test('round-trips a chunked payload through the reassembler', () => {
		const original = { items: Array.from({ length: 200 }, (_, i) => ({ i, v: `value-${i}` })) };
		const envelopes = chunk(original, { maxChunkBytes: 1024, newGroupId: () => 'g1' });
		assert.deepStrictEqual(reassembleAll(envelopes), original);
	});

	test('rejects a non-positive ceiling', () => {
		assert.throws(() => chunk({ a: 1 }, { maxChunkBytes: 0 }), ChunkingError);
	});

	test('rejects serialized logical payloads above 32 MiB before emitting chunks', () => {
		assert.throws(() => chunk('x'.repeat(32 * 1024 * 1024 + 1), { newGroupId: () => 'g1' }), /exceeds 33554432-byte ceiling/);
	});
});

suite('WebPubSub - Reassembler', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('returns message-envelope data immediately', () => {
		const r = new Reassembler();
		assert.deepStrictEqual(r.ingest({ kind: 'message', data: { a: 1 } }), { a: 1 });
	});

	test('returns null until the final chunk arrives', () => {
		const envelopes = chunk({ blob: 'y'.repeat(4000) }, { maxChunkBytes: 1024, newGroupId: () => 'g1' });
		const r = new Reassembler();
		for (let i = 0; i < envelopes.length - 1; i++) {
			assert.strictEqual(r.ingest(envelopes[i]!), null);
		}
		assert.deepStrictEqual(r.ingest(envelopes.at(-1)!), { blob: 'y'.repeat(4000) });
		assert.strictEqual(r.inFlightGroupCount, 0);
	});

	test('throws on a total mismatch within a group', () => {
		const r = new Reassembler();
		r.ingest({ kind: 'chunk', group_id: 'g1', seq: 0, total: 2, bytes: b64('aa') });
		assert.throws(() => r.ingest({ kind: 'chunk', group_id: 'g1', seq: 1, total: 3, bytes: b64('bb') }), /total mismatch/);
	});

	test('throws on a duplicate seq', () => {
		const r = new Reassembler();
		r.ingest({ kind: 'chunk', group_id: 'g1', seq: 0, total: 2, bytes: b64('aa') });
		assert.throws(() => r.ingest({ kind: 'chunk', group_id: 'g1', seq: 0, total: 2, bytes: b64('aa') }), /duplicate seq/);
	});

	test('throws on an out-of-range seq', () => {
		const r = new Reassembler();
		assert.throws(() => r.ingest({ kind: 'chunk', group_id: 'g1', seq: 5, total: 2, bytes: b64('aa') }), /out of range/);
	});

	test('throws on non-canonical base64', () => {
		const r = new Reassembler();
		assert.throws(() => r.ingest({ kind: 'chunk', group_id: 'g1', seq: 0, total: 1, bytes: 'not base64!!' }), /not canonical/);
	});

	test('throws when total exceeds the segment cap', () => {
		const r = new Reassembler({ maxSegmentsPerGroup: 2 });
		assert.throws(() => r.ingest({ kind: 'chunk', group_id: 'g1', seq: 0, total: 3, bytes: b64('aa') }), /exceeds maxSegmentsPerGroup/);
	});

	test('sweeps expired partial buffers', () => {
		let clock = 0;
		const r = new Reassembler({ timeoutMs: 100, now: () => clock });
		r.ingest({ kind: 'chunk', group_id: 'g1', seq: 0, total: 2, bytes: b64('aa') });
		assert.strictEqual(r.inFlightGroupCount, 1);
		clock = 200;
		assert.deepStrictEqual(r.sweepExpired(), ['g1']);
		assert.strictEqual(r.inFlightGroupCount, 0);
		assert.strictEqual(r.inFlightBytes, 0);
	});

	test('enforces the aggregate retained-byte ceiling and releases the rejected group', () => {
		const r = new Reassembler({ maxBufferBytes: 10, maxTotalBufferBytes: 3 });
		assert.strictEqual(r.ingest({ kind: 'chunk', group_id: 'g1', seq: 0, total: 2, bytes: b64('aa') }), null);
		assert.throws(() => r.ingest({ kind: 'chunk', group_id: 'g2', seq: 0, total: 2, bytes: b64('bb') }), /aggregate reassembly bytes/);
		assert.strictEqual(r.inFlightGroupCount, 1);
		assert.strictEqual(r.inFlightBytes, 2);
	});
});
