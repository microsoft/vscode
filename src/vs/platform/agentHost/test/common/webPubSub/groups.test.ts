/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { GroupNameError, MAX_GROUP_NAME_BYTES, parseGroupName } from '../../../common/webPubSub/groups.js';

suite('WebPubSub - parseGroupName', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('parses a per-client broadcast lane', () => {
		const parsed = parseGroupName('user.u1.env.e1.client.c1.broadcast');
		assert.deepStrictEqual(parsed, { scope: 'client', lane: 'broadcast', uid: 'u1', eid: 'e1', cid: 'c1' });
	});

	test('parses per-client to-host and to-client lanes', () => {
		assert.strictEqual(parseGroupName('user.u1.env.e1.client.c1.to-host').lane, 'to-host');
		assert.strictEqual(parseGroupName('user.u1.env.e1.client.c1.to-client').lane, 'to-client');
	});

	test('parses per-environment lanes', () => {
		for (const lane of ['root', 'events', 'lifecycle', 'control', 'ingest-ack'] as const) {
			const parsed = parseGroupName(`user.u1.env.e1.${lane}`);
			assert.deepStrictEqual(parsed, { scope: 'env', lane, uid: 'u1', eid: 'e1' });
		}
	});

	test('enforces expected uid/eid/cid when provided', () => {
		assert.throws(() => parseGroupName('user.u1.env.e1.events', { expected: { uid: 'u2' } }), GroupNameError);
		assert.throws(() => parseGroupName('user.u1.env.e1.events', { expected: { eid: 'e2' } }), GroupNameError);
		assert.throws(() => parseGroupName('user.u1.env.e1.client.c1.broadcast', { expected: { cid: 'c2' } }), GroupNameError);
		assert.strictEqual(parseGroupName('user.u1.env.e1.events', { expected: { uid: 'u1', eid: 'e1' } }).scope, 'env');
	});

	test('rejects an empty name', () => {
		assert.throws(() => parseGroupName(''), GroupNameError);
	});

	test('rejects names with too few segments', () => {
		assert.throws(() => parseGroupName('user.u1.env.e1'), GroupNameError);
	});

	test('rejects a wrong leading segment', () => {
		assert.throws(() => parseGroupName('usr.u1.env.e1.events'), /expected first segment/);
	});

	test('rejects a wrong env segment', () => {
		assert.throws(() => parseGroupName('user.u1.envx.e1.events'), /third segment/);
	});

	test('rejects empty uid/eid/cid segments', () => {
		assert.throws(() => parseGroupName('user..env.e1.events'), /uid segment is empty/);
		assert.throws(() => parseGroupName('user.u1.env..events'), /eid segment is empty/);
		assert.throws(() => parseGroupName('user.u1.env.e1.client..broadcast'), /cid segment is empty/);
	});

	test('rejects identifier characters outside the portable opaque-id grammar', () => {
		assert.throws(() => parseGroupName('user.user@github.env.e1.events'), /opaque-id grammar/);
		assert.throws(() => parseGroupName('user.u1.env.e/1.events'), /opaque-id grammar/);
		assert.throws(() => parseGroupName('user.u1.env.e1.client.c:1.broadcast'), /opaque-id grammar/);
	});

	test('rejects unknown env lanes and multi-segment env lanes', () => {
		assert.throws(() => parseGroupName('user.u1.env.e1.bogus'), /unknown env lane/);
		assert.throws(() => parseGroupName('user.u1.env.e1.events.extra'), /single segment/);
	});

	test('rejects unknown client directions and trailing segments', () => {
		assert.throws(() => parseGroupName('user.u1.env.e1.client.c1.sideways'), /unknown client direction/);
		assert.throws(() => parseGroupName('user.u1.env.e1.client.c1.broadcast.extra'), /trailing segments/);
		assert.throws(() => parseGroupName('user.u1.env.e1.client.c1'), /client lane truncated/);
	});

	test('rejects names exceeding the byte cap', () => {
		const huge = `user.u1.env.${'e'.repeat(MAX_GROUP_NAME_BYTES)}.events`;
		assert.throws(() => parseGroupName(huge), /exceeds/);
	});
});
