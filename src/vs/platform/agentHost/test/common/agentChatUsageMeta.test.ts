/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { compactContextAttribution, readChatUsage, withChatUsage } from '../../common/meta/agentUsageMeta.js';

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

	test('compacts context attribution to the rows clients render', () => {
		const attribution = {
			totalTokens: 1_000,
			modelId: 'claude-opus-4.8',
			categories: { systemPrompt: 100, messages: 400, freeSpace: 99_000 },
			entries: [
				{ kind: 'system', id: 'system:prompt', label: 'System prompt', tokens: 100, attributes: { source: 'builtin' } },
				{ kind: 'system', id: 'system:tools', label: 'Tool definitions', tokens: 300 },
				{ kind: 'toolDefinition', id: 'toolDefinition:bash', label: 'bash', tokens: 200, parentId: 'system:tools', attributes: { evictable: 'false' } },
				{ kind: 'toolDefinition', id: 'toolDefinition:view', label: 'view', tokens: 100, parentId: 'system:tools' },
				{ kind: 'plugin', id: 'plugin:acme', label: 'acme', tokens: 50 },
				{ kind: 'skill', id: 'skill:tmux', label: 'skill: tmux', tokens: 50, parentId: 'plugin:acme' },
				{ kind: 'tool', id: 'tool:bash', label: 'bash', tokens: 70, attributes: { messageCount: '3' } },
				{ kind: 'tool', id: 'tool:view', label: 'view', tokens: 30 },
				{ kind: 'tool', id: 'tool:malformed', label: 'malformed', tokens: '30' },
			],
			compactions: { count: 2, history: [{ tokensBefore: 90_000 }] },
		};
		assert.deepStrictEqual([
			compactContextAttribution(attribution),
			compactContextAttribution({ totalTokens: 10 }),
		], [
			{
				totalTokens: 1_000,
				entries: [
					{ kind: 'system', id: 'system:prompt', label: 'System prompt', tokens: 100 },
					{ kind: 'toolDefinition', id: 'toolDefinition', label: 'toolDefinition', tokens: 300 },
					{ kind: 'plugin', id: 'plugin', label: 'plugin', tokens: 50 },
					{ kind: 'skill', id: 'skill', label: 'skill', tokens: 50 },
					{ kind: 'tool', id: 'tool', label: 'tool', tokens: 100 },
				],
				compactions: { count: 2 },
			},
			undefined,
		]);
	});
});
