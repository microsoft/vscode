/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { hasKey } from '../../../../../base/common/types.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { readAgentMessageDelegationMeta } from '../../../../../platform/agentHost/common/meta/agentMessageDelegationMeta.js';
import { parseRemoteSessionOrigin, readRemoteSessionDepth, readRemoteSessionOrigin, supportsRemoteSessions, toRemoteSessionMessageMetadata, withRemoteSessionOrigin, withRemoteSessionsCapability } from '../../../../../platform/agentHost/common/meta/agentRemoteSessionMeta.js';
import { parseChatUri, readSessionSpawnDepth, withSessionSpawnDepth } from '../../../../../platform/agentHost/common/state/sessionState.js';

suite('Remote session origin metadata', () => {
	ensureNoDisposablesAreLeakedInTestSuite();
	const origin = { session: 'remote-source-copilot:/same-id', chat: 'remote-source-copilot:/same-id#original-chat', depth: 1 };

	test('round-trips the original host and exact chat without changing unrelated metadata', () => {
		const existing = { unrelated: { enabled: true } };
		const metadata = withRemoteSessionOrigin(existing, origin);
		const restored: { _meta: Record<string, unknown> } = JSON.parse(JSON.stringify({ _meta: metadata }));
		assert.deepStrictEqual({
			existing,
			unrelated: metadata.unrelated,
			origin: readRemoteSessionOrigin(restored),
		}, { existing: { unrelated: { enabled: true } }, unrelated: { enabled: true }, origin });
	});

	test('supports workspace-less ambient origins', () => {
		const ambient = { session: 'agent-host-copilot:/quick-chat', chat: 'agent-host-copilot:/quick-chat', depth: 2 };
		assert.deepStrictEqual(readRemoteSessionOrigin({ _meta: withRemoteSessionOrigin(undefined, ambient) }), ambient);
	});

	test('requires an explicit host capability rather than inferring support from resources', () => {
		assert.deepStrictEqual([
			supportsRemoteSessions(undefined),
			supportsRemoteSessions({ _meta: { 'vscode.remoteSessions': 'true' } }),
			supportsRemoteSessions({ _meta: withRemoteSessionsCapability(undefined) }),
		], [false, false, true]);
	});

	test('validates persisted origins and reports corruption', () => {
		assert.deepStrictEqual(parseRemoteSessionOrigin(JSON.stringify(origin)), origin);
		assert.throws(() => parseRemoteSessionOrigin('{bad json'));
		assert.throws(() => parseRemoteSessionOrigin(JSON.stringify({ ...origin, depth: '1' })), /Invalid persisted/);
	});

	test('native and remote creation chains share a cumulative spawn depth', () => {
		const nativeParent = { _meta: withSessionSpawnDepth(undefined, 1) };
		const remoteChild = { _meta: withRemoteSessionOrigin(undefined, { ...origin, depth: readRemoteSessionDepth(nativeParent) + 1 }) };
		const nativeChild = { _meta: withSessionSpawnDepth(remoteChild._meta, readSessionSpawnDepth(remoteChild._meta) + 1) };
		const nextRemoteChild = { _meta: withRemoteSessionOrigin(undefined, { ...origin, depth: readRemoteSessionDepth(nativeChild) + 1 }) };
		assert.deepStrictEqual({
			depths: [nativeParent, remoteChild, nativeChild, nextRemoteChild].map(readRemoteSessionDepth),
			nativeRemoteDepth: readSessionSpawnDepth(remoteChild._meta),
			nativeNextRemoteDepth: readSessionSpawnDepth(nextRemoteChild._meta),
		}, { depths: [1, 2, 3, 4], nativeRemoteDepth: 2, nativeNextRemoteDepth: 4 });
	});

	test('depth cannot be reset by stale remote origin or native metadata', () => {
		const remote = withRemoteSessionOrigin(undefined, { ...origin, depth: 3 });
		const staleNative = withSessionSpawnDepth(remote, 1);
		const staleRemote = withRemoteSessionOrigin(withSessionSpawnDepth(undefined, 3), { ...origin, depth: 1 });
		assert.deepStrictEqual([
			readRemoteSessionDepth(undefined),
			readRemoteSessionDepth({ _meta: staleNative }),
			readRemoteSessionDepth({ _meta: staleRemote }),
			readSessionSpawnDepth(staleRemote),
		], [0, 3, 3, 3]);
	});

	test('request metadata preserves host-qualified default, peer and subagent source chats', () => {
		const chats = ['', 'original-chat', 'subagent/call-1'];
		const results = chats.map(chatId => {
			const metadata = toRemoteSessionMessageMetadata({
				session: origin.session, chat: `${origin.session}${chatId ? `#${chatId}` : ''}`,
			}, 'source-turn');
			const delegation = readAgentMessageDelegationMeta({ _meta: metadata });
			assert.ok(delegation && hasKey(delegation, { sourceSession: true }) && delegation.sourceChat);
			return { session: delegation.sourceSession, chat: parseChatUri(delegation.sourceChat), turnId: delegation.sourceTurnId };
		});
		assert.deepStrictEqual(results, chats.map(chatId => ({
			session: origin.session, chat: { session: origin.session, chatId: chatId || 'default' }, turnId: 'source-turn',
		})));
	});

	test('rejects malformed metadata, unqualified identities and mismatched chats', () => {
		const invalid = [
			undefined, null, [], '',
			{ ...origin, depth: -1 },
			{ ...origin, depth: 1.5 },
			{ ...origin, depth: Number.POSITIVE_INFINITY },
			{ ...origin, depth: '1' },
			{ ...origin, session: 'copilot:/same-id', chat: 'copilot:/same-id#original-chat' },
			{ ...origin, session: 'agent-host-:/same-id', chat: 'agent-host-:/same-id' },
			{ ...origin, session: 'agent-host-copilot:same-id', chat: 'agent-host-copilot:same-id' },
			{ ...origin, session: `${origin.session}#peer` },
			{ ...origin, chat: 'remote-other-copilot:/same-id#original-chat' },
			{ ...origin, chat: 'remote-source-copilot:/wrong-id#original-chat' },
			{ ...origin, chat: 'remote-source-copilot:/same-id?chat=original-chat' },
			{ ...origin, session: 'not a uri' },
			{ ...origin, chat: undefined },
		];
		assert.deepStrictEqual(invalid.map(value => readRemoteSessionOrigin({ _meta: { 'vscode.remoteSession.origin': value } })), invalid.map(() => undefined));
	});
});
