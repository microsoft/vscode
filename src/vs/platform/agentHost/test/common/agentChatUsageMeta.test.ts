/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { readChatUsage, withChatUsage } from '../../common/meta/agentUsageMeta.js';

suite('Agent chat usage metadata', () => {
	ensureNoDisposablesAreLeakedInTestSuite();
	const chat = 'ahp-chat:/opaque-owner/Main';
	const peer = 'ahp-chat:/opaque-owner/Peer';

	test('round trips aggregate billing while preserving unrelated session metadata and peer entries', () => {
		const peerUsage = { totalNanoAiu: 250_000_000, aiCreditsStatus: 'complete', future: 'preserved' };
		const original = { _meta: { unrelated: { enabled: false }, 'vscode.chatUsage': { [peer]: peerUsage } } };
		const usage = { totalNanoAiu: 600_000_000, aiCreditsStatus: 'partial' as const };
		const updated = { _meta: withChatUsage(original, chat, usage) };
		assert.deepStrictEqual(readChatUsage(JSON.parse(JSON.stringify(updated)), chat), usage);
		assert.deepStrictEqual(updated._meta, {
			unrelated: { enabled: false },
			'vscode.chatUsage': { [peer]: peerUsage, [chat]: usage },
		});
		assert.deepStrictEqual(original, { _meta: { unrelated: { enabled: false }, 'vscode.chatUsage': { [peer]: peerUsage } } });
		assert.strictEqual(readChatUsage(updated, chat.toLowerCase()), undefined);
		assert.strictEqual(readChatUsage(updated, 'opaque-owner'), undefined);
	});

	test('preserves explicit zero and validates optional completeness', () => {
		assert.deepStrictEqual([
			readChatUsage({ _meta: { 'vscode.chatUsage': { [chat]: { totalNanoAiu: 0, aiCreditsStatus: 'complete' } } } }, chat),
			readChatUsage({ _meta: { 'vscode.chatUsage': { [chat]: { totalNanoAiu: 0, aiCreditsStatus: 'unavailable' } } } }, chat),
			readChatUsage({ _meta: { 'vscode.chatUsage': { [chat]: { totalNanoAiu: 600_000_000, aiCreditsStatus: 'invalid' } } } }, chat),
		], [
			{ totalNanoAiu: 0, aiCreditsStatus: 'complete' },
			{ totalNanoAiu: 0, aiCreditsStatus: 'unavailable' },
			{ totalNanoAiu: 600_000_000 },
		]);
	});

	test('missing or malformed aggregates never become free complete billing', () => {
		assert.strictEqual(readChatUsage(undefined, chat), undefined);
		for (const value of [undefined, null, [], {}, { totalNanoAiu: '600' }, { totalNanoAiu: -1 }, { totalNanoAiu: NaN }, { totalNanoAiu: Infinity }, { aiCreditsStatus: 'complete' }]) {
			assert.strictEqual(readChatUsage({ _meta: { 'vscode.chatUsage': { [chat]: value } } }, chat), undefined);
		}
		for (const value of [undefined, null, [], { totalNanoAiu: 600_000_000, aiCreditsStatus: 'complete' }]) {
			assert.strictEqual(readChatUsage({ _meta: { 'vscode.chatUsage': value } }, chat), undefined);
		}
	});

	test('removes only the addressed chat and drops the empty namespace', () => {
		const original = { _meta: { unrelated: true, 'vscode.chatUsage': { [chat]: { totalNanoAiu: 600_000_000 }, [peer]: { totalNanoAiu: 250_000_000 } } } };
		const updated = { _meta: withChatUsage(original, chat, undefined) };
		assert.deepStrictEqual(updated._meta, { unrelated: true, 'vscode.chatUsage': { [peer]: { totalNanoAiu: 250_000_000 } } });
		assert.deepStrictEqual(withChatUsage(updated, peer, undefined), { unrelated: true });
	});
});
