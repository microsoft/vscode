/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { VSBuffer, encodeBase64 } from '../../../../../base/common/buffer.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { Reassembler } from '../../../common/webPubSub/chunking.js';
import { FramingError, RELIABLE_JSON_SUBPROTOCOL, buildPublish, parseInbound } from '../../../common/webPubSub/framing.js';

/** Standard base64 (padded) of an ASCII string — equivalent to `btoa(s)` for ASCII input. */
function b64(s: string): string {
	return encodeBase64(VSBuffer.fromString(s), true /* padded */, false /* urlSafe */);
}

const GROUP = 'user.u1.env.e1.client.c1.to-client';

suite('WebPubSub - framing', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('exposes the reliable JSON subprotocol constant', () => {
		assert.strictEqual(RELIABLE_JSON_SUBPROTOCOL, 'json.reliable.webpubsub.azure.v1');
	});

	test('builds a single sendToGroup command for a small payload', () => {
		let ack = 0;
		const commands = buildPublish({ group: GROUP, nextAckId: () => ++ack, payload: { hi: true } });
		assert.deepStrictEqual(commands.map(command => JSON.parse(command.serialized)), [{
			type: 'sendToGroup',
			group: GROUP,
			ackId: 1,
			dataType: 'json',
			noEcho: true,
			data: { kind: 'message', data: { hi: true } },
		}]);
	});

	test('builds one command per chunk with monotonic ackIds', () => {
		let ack = 0;
		const commands = buildPublish({
			group: GROUP,
			nextAckId: () => ++ack,
			payload: { blob: 'z'.repeat(5000) },
			chunkOptions: { maxChunkBytes: 1024, newGroupId: () => 'g1' },
		});
		assert.ok(commands.length > 1);
		assert.deepStrictEqual(commands.map(c => c.ackId), commands.map((_, i) => i + 1));
	});

	test('sends the checked serialization without evaluating the payload again', () => {
		const keys: string[] = [];
		const commands = buildPublish({
			group: GROUP,
			nextAckId: () => 1,
			payload: {
				toJSON: (key: string) => {
					keys.push(key);
					return keys.length === 1 ? 'small' : 'L'.repeat(4096);
				},
			},
			chunkOptions: { maxChunkBytes: 1024 },
		});
		const frame = JSON.parse(commands[0].serialized);
		const result = parseInbound(
			{ type: 'message', from: 'group', group: GROUP, dataType: 'json', data: frame.data },
			{ reassembler: new Reassembler() },
		);
		assert.deepStrictEqual({ keys, commands, result }, {
			keys: ['data'],
			commands: [{
				ackId: 1,
				serialized: JSON.stringify({
					type: 'sendToGroup', group: GROUP, ackId: 1, dataType: 'json', noEcho: true,
					data: { kind: 'message', data: 'small' },
				}),
			}],
			result: {
				kind: 'payload',
				group: { scope: 'client', lane: 'to-client', uid: 'u1', eid: 'e1', cid: 'c1' },
				payload: 'small',
			},
		});
	});

	test('preserves raw JSON numbers without parsing and serializing them again', function () {
		const json: typeof JSON & { rawJSON?: (text: string) => unknown } = JSON;
		if (typeof json.rawJSON !== 'function') {
			this.skip();
		}
		const actual = [];
		const expected = [];
		for (const number of ['1e20', '1e400', '12345678901234567890']) {
			const envelope = `{"kind":"message","data":${number}}`;
			const commands = buildPublish({
				group: GROUP,
				nextAckId: () => 1,
				payload: json.rawJSON(number),
				chunkOptions: { maxChunkBytes: new TextEncoder().encode(envelope).byteLength },
			});
			actual.push(commands);
			expected.push([{
				ackId: 1,
				serialized: `{"type":"sendToGroup","group":"${GROUP}","ackId":1,"dataType":"json","noEcho":true,"data":${envelope}}`,
			}]);
		}
		assert.deepStrictEqual(actual, expected);
	});

	test('parses an inbound group payload frame', () => {
		const reassembler = new Reassembler();
		const result = parseInbound(
			{ type: 'message', from: 'group', group: GROUP, dataType: 'json', data: { kind: 'message', data: { ok: 1 } } },
			{ reassembler },
		);
		assert.deepStrictEqual(result, {
			kind: 'payload',
			group: { scope: 'client', lane: 'to-client', uid: 'u1', eid: 'e1', cid: 'c1' },
			payload: { ok: 1 },
		});
	});

	test('reports pending while chunks are still arriving', () => {
		const reassembler = new Reassembler();
		const first = parseInbound(
			{
				type: 'message',
				from: 'group',
				group: GROUP,
				dataType: 'json',
				data: { kind: 'chunk', group_id: 'g1', seq: 0, total: 2, bytes: b64('aa') },
			},
			{ reassembler },
		);
		assert.strictEqual(first.kind, 'pending');
	});

	test('ignores non group-fanout frames', () => {
		const reassembler = new Reassembler();
		assert.strictEqual(parseInbound({ type: 'ack', ackId: 1 }, { reassembler }).kind, 'ignored');
		assert.strictEqual(parseInbound(null, { reassembler }).kind, 'ignored');
		assert.strictEqual(parseInbound({ type: 'message', from: 'server' }, { reassembler }).kind, 'ignored');
	});

	test('throws FramingError on malformed group-fanout frames', () => {
		const reassembler = new Reassembler();
		assert.throws(
			() => parseInbound({ type: 'message', from: 'group', dataType: 'json', data: { kind: 'message', data: 1 } }, { reassembler }),
			FramingError,
		);
		assert.throws(
			() => parseInbound({ type: 'message', from: 'group', group: GROUP, dataType: 'xml', data: {} }, { reassembler }),
			FramingError,
		);
		assert.throws(
			() => parseInbound({ type: 'message', from: 'group', group: GROUP, dataType: 'json' }, { reassembler }),
			FramingError,
		);
	});
});
