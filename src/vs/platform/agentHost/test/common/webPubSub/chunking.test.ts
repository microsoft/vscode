/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { VSBuffer, encodeBase64 } from '../../../../../base/common/buffer.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { type ChunkEnvelope, ChunkingError, DEFAULT_MAX_REASSEMBLY_BYTES, Reassembler, chunk } from '../../../common/webPubSub/chunking.js';

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

const encoder = new TextEncoder();

/** UTF-8 bytes of `value` in its JSON wire form. */
function wireBytes(value: unknown): number {
	return encoder.encode(JSON.stringify(value)).byteLength;
}

/** Reassembles envelopes after carrying each one through its JSON wire form. */
function reassembleFromWire(envelopes: ChunkEnvelope[]): unknown {
	return reassembleAll(envelopes.map(envelope => JSON.parse(JSON.stringify(envelope))));
}

/** A string of repeated `unit`, padded with ASCII so its `kind: 'message'` envelope is exactly `envelopeBytes`. */
function payloadWithEnvelopeBytes(unit: string, envelopeBytes: number): string {
	const emptyEnvelopeBytes = wireBytes({ kind: 'message', data: '' });
	const unitBytes = wireBytes(unit) - wireBytes('');
	const count = Math.floor((envelopeBytes - emptyEnvelopeBytes) / unitBytes);
	return unit.repeat(count) + 'x'.repeat(envelopeBytes - emptyEnvelopeBytes - count * unitBytes);
}

suite('WebPubSub - chunk', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('wraps a small payload in a single message envelope', () => {
		const envelopes = chunk({ hello: 'world' });
		assert.deepStrictEqual(envelopes, [{ kind: 'message', data: { hello: 'world' } }]);
	});

	test('decides single-frame fit from UTF-8 envelope bytes at the ceiling', () => {
		const maxChunkBytes = 256;
		// ASCII, 2/3/4-byte UTF-8 (a surrogate pair), JSON escapes, unescaped U+2028 and a lone surrogate.
		const units = ['x', '\u00e9', '\u20ac', '\ud83d\ude00', '"', '\\', '\n', '\u0000', '\u2028', '\ud800'];
		const actual = [];
		const expected = [];
		for (const unit of units) {
			for (const delta of [-1, 0, 1]) {
				const payload = payloadWithEnvelopeBytes(unit, maxChunkBytes + delta);
				const envelopes = chunk(payload, { maxChunkBytes, newGroupId: () => 'g1' });
				actual.push({
					unit,
					envelopeBytes: wireBytes({ kind: 'message', data: payload }),
					kinds: envelopes.map(envelope => envelope.kind),
					framesFit: envelopes.every(envelope => wireBytes(envelope) <= maxChunkBytes),
					roundTrip: reassembleFromWire(envelopes),
				});
				expected.push({
					unit,
					envelopeBytes: maxChunkBytes + delta,
					kinds: delta <= 0 ? ['message'] : ['chunk', 'chunk'],
					framesFit: true,
					roundTrip: payload,
				});
			}
		}
		assert.deepStrictEqual(actual, expected);
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

	test('matches a pinned Unicode and escape-heavy split vector', () => {
		// 12 raw bytes per segment: seq 3 ends with the first UTF-8 byte of U+1F600 and seq 4 carries the rest.
		const payload = { jsonrpc: '2.0', id: 7, result: { text: '\u00e9\u20ac\ud83d\ude00"\\\n\t\u0000\u2028\ud800 end' } };
		const envelopes = chunk(payload, { maxChunkBytes: 83, newGroupId: () => 'g1' });
		assert.deepStrictEqual({ envelopes, roundTrip: reassembleFromWire(envelopes) }, {
			envelopes: [
				{ kind: 'chunk', group_id: 'g1', seq: 0, total: 7, bytes: 'eyJqc29ucnBjIjoi' },
				{ kind: 'chunk', group_id: 'g1', seq: 1, total: 7, bytes: 'Mi4wIiwiaWQiOjcs' },
				{ kind: 'chunk', group_id: 'g1', seq: 2, total: 7, bytes: 'InJlc3VsdCI6eyJ0' },
				{ kind: 'chunk', group_id: 'g1', seq: 3, total: 7, bytes: 'ZXh0Ijoiw6nigqzw' },
				{ kind: 'chunk', group_id: 'g1', seq: 4, total: 7, bytes: 'n5iAXCJcXFxuXHRc' },
				{ kind: 'chunk', group_id: 'g1', seq: 5, total: 7, bytes: 'dTAwMDDigKhcdWQ4' },
				{ kind: 'chunk', group_id: 'g1', seq: 6, total: 7, bytes: 'MDAgZW5kIn19' },
			],
			roundTrip: payload,
		});
	});

	test('round-trips a chunked payload through the reassembler', () => {
		const original = { items: Array.from({ length: 200 }, (_, i) => ({ i, v: `value-${i}` })) };
		const envelopes = chunk(original, { maxChunkBytes: 1024, newGroupId: () => 'g1' });
		assert.deepStrictEqual(reassembleAll(envelopes), original);
	});

	test('serializes the payload once for single-frame and chunked output', () => {
		const toJSONKeys: string[] = [];
		const payload = (blob: string) => ({
			toJSON: (key: string) => {
				toJSONKeys.push(key);
				return { blob };
			},
		});
		chunk(payload('small'));
		chunk(payload('x'.repeat(5000)), { maxChunkBytes: 1024, newGroupId: () => 'g1' });
		assert.deepStrictEqual(toJSONKeys, ['', '']);
	});

	test('rejects a non-positive ceiling', () => {
		assert.throws(() => chunk({ a: 1 }, { maxChunkBytes: 0 }), ChunkingError);
	});

	test('rejects serialized logical payloads above 32 MiB before emitting chunks', () => {
		assert.throws(() => chunk('x'.repeat(32 * 1024 * 1024 + 1), { newGroupId: () => 'g1' }), /exceeds 33554432-byte ceiling/);
	});

	test('accepts exactly 32 MiB of serialized UTF-8 and rejects one byte more', () => {
		// Two-byte characters keep the code-unit count far below the byte ceiling. The frame ceiling
		// keeps the maximal payload in one frame, so the test avoids base64-encoding 32 MiB.
		const maxChunkBytes = 2 * DEFAULT_MAX_REASSEMBLY_BYTES;
		const atCeiling = '\u00e9'.repeat(DEFAULT_MAX_REASSEMBLY_BYTES / 2 - 1);
		const accepted = chunk(atCeiling, { maxChunkBytes });
		assert.deepStrictEqual(accepted.map(envelope => envelope.kind === 'message' && envelope.data === atCeiling), [true]);
		assert.throws(() => chunk(atCeiling + 'x', { maxChunkBytes }), /serialized payload is 33554433 bytes, exceeds 33554432-byte ceiling/);
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
