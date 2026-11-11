/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { URI } from '../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { AgentSession } from '../../common/agent.js';
import { getAgentHostChatId } from '../../common/agentHostChatIdentity.js';
import { newAgentHostChatUri, newAgentHostSessionUri } from '../../common/agentHostSessionIdentity.js';
import { AgentHostChatUrisCapabilityMetaKey, AgentHostSessionUrisCapabilityMetaKey, supportsAgentHostSessionUris } from '../../common/meta/agentHostSessionUrisMeta.js';
import { buildChatUri, buildDefaultChatUri, getSessionChatResource } from '../../common/state/sessionState.js';
import type { InitializeResult } from '../../common/state/sessionProtocol.js';

suite('Agent Host session identity', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	for (const provider of ['copilotcli', 'codex', 'claude']) {
		test(`creation negotiation preserves ${provider} legacy hosts without requiring extensions on standard hosts`, () => {
			const hosts: InitializeResult[] = [
				{ protocolVersion: '0.9.0', serverSeq: 0, _meta: { 'vscode.agentHost': true } },
				{ protocolVersion: '0.9.0', serverSeq: 0, _meta: { 'vscode.agentHost': true, [AgentHostSessionUrisCapabilityMetaKey]: 'true' } },
				{ protocolVersion: '0.9.0', serverSeq: 0, _meta: { [AgentHostSessionUrisCapabilityMetaKey]: true } },
				{ protocolVersion: '0.9.0', serverSeq: 0 },
			].map(host => ({ ...host, snapshots: [] }));
			assert.deepStrictEqual(hosts.map(host => ({
				supports: supportsAgentHostSessionUris(host),
				session: newAgentHostSessionUri(provider, 'fresh', host).toString(),
			})), [
				{ supports: false, session: `${provider}:/fresh` },
				{ supports: false, session: `${provider}:/fresh` },
				{ supports: true, session: 'ahp-session:/fresh' },
				{ supports: false, session: 'ahp-session:/fresh' },
			]);
		});
	}

	test('historical hostBuild identifies native hosts without comparing product versions', () => {
		const host = { protocolVersion: '0.9.0', serverSeq: 0, snapshots: [] };
		assert.deepStrictEqual([
			newAgentHostSessionUri('claude', 'new', host, { agents: [], _meta: { hostBuild: { version: 'any-version' } } }).scheme,
			newAgentHostSessionUri('claude', 'new', host, { agents: [], _meta: { hostBuild: { version: 9 } } }).scheme,
			newAgentHostSessionUri('claude', 'new', { ...host, _meta: { 'vscode.getAgentHostSessionStateFile.chat': true } }).scheme,
		], ['claude', 'ahp-session', 'ahp-session']);
	});

	test('standard session URIs never imply a provider and native chats retain their full owning resource', () => {
		const legacy = URI.parse('codex:/old');
		const standard = URI.parse('ahp-session:/fresh');
		assert.deepStrictEqual({
			providers: [AgentSession.provider(legacy), AgentSession.provider(standard)],
			chats: [legacy, standard].map(session => [
				getAgentHostChatId(buildDefaultChatUri(session)),
				getAgentHostChatId(buildChatUri(session, 'peer')),
			]),
			distinct: buildDefaultChatUri(legacy) !== buildDefaultChatUri(standard),
		}, {
			providers: ['codex', undefined],
			// The default-shaped URI has no short id: the recorded default is addressed by an empty fragment.
			chats: [[buildDefaultChatUri(legacy), 'peer'], [buildDefaultChatUri(standard), 'peer']],
			distinct: true,
		});
	});

	test('opaque advertised default and peer chat resources survive frontend fragment adaptation', () => {
		const state = { defaultChat: 'conversation://tenant/default?revision=3', chats: [{ resource: 'conversation://tenant/peer?revision=4' }] };
		const fragment = getAgentHostChatId(state.chats[0].resource);
		assert.deepStrictEqual([
			getSessionChatResource(state, 'default', state.defaultChat),
			getSessionChatResource(state, fragment, state.defaultChat),
		], [state.defaultChat, state.chats[0].resource]);
	});

	test('indexes chat resources once per immutable catalog', () => {
		let reads = 0;
		const chats = Array.from({ length: 173 }, (_, index) => {
			const resource = buildChatUri('copilot:/session', `peer-${index}`);
			return { get resource() { reads++; return resource; } };
		});
		const state = { chats };
		const resources = chats.map((_chat, index) => getSessionChatResource(state, `peer-${index}`, undefined));
		const indexedReads = reads;
		const replacement = { chats: [...chats, { resource: 'conversation:/new-peer' }] };
		const added = getSessionChatResource(replacement, 'conversation:/new-peer', undefined);
		assert.deepStrictEqual({ indexedReads, first: resources[0], last: resources[172], added }, {
			indexedReads: chats.length,
			first: buildChatUri('copilot:/session', 'peer-0'),
			last: buildChatUri('copilot:/session', 'peer-172'),
			added: 'conversation:/new-peer',
		});
	});

	test('prefers exact resources over colliding short ids and preserves the first match', () => {
		const shortId = 'peer';
		const first = buildChatUri('copilot:/first', shortId);
		const second = buildChatUri('copilot:/second', shortId);
		const state = { chats: [{ resource: first }, { resource: second }, { resource: shortId }] };
		assert.deepStrictEqual([
			getSessionChatResource(state, shortId, undefined),
			getSessionChatResource({ chats: state.chats.slice(0, 2) }, shortId, undefined),
			getSessionChatResource(state, 'default', 'conversation:/default'),
			getSessionChatResource(state, 'missing', undefined),
		], [shortId, first, 'conversation:/default', undefined]);
	});

	test('client chat ids never collide for client-chosen opaque and shaped chat URIs', () => {
		const session = 'ahp-session:/s';
		const uuid = '0b0f3c0e-45a5-4ac8-9a53-9d8a6a3b7f11';
		const chats = [`ahp-chat:/${uuid}`, 'ahp-chat:/default', 'ahp-chat:/x/y', 'ahp-chat:/c?one', 'ahp-chat:/c?two', buildDefaultChatUri(session), buildChatUri(session, 'peer')];
		const ids = chats.map(chat => getAgentHostChatId(chat));
		assert.deepStrictEqual({
			ids,
			unique: new Set(ids).size === ids.length,
			neverDefaultId: ids.filter(id => id === 'default'),
			roundTrip: chats.map(chat => getSessionChatResource({ chats: chats.map(resource => ({ resource })) }, getAgentHostChatId(chat), buildDefaultChatUri(session))),
		}, {
			ids: [uuid, 'ahp-chat:/default', 'ahp-chat:/x/y', 'ahp-chat:/c?one', 'ahp-chat:/c?two', buildDefaultChatUri(session), 'peer'],
			unique: true,
			neverDefaultId: [],
			roundTrip: chats,
		});
	});

	test('new chats are opaque only for an opaque default on a host that can honor it', () => {
		const opaqueDefault = 'ahp-chat:/0b0f3c0e-45a5-4ac8-9a53-9d8a6a3b7f11';
		const shapedDefault = buildDefaultChatUri('ahp-session:/s');
		const base = { protocolVersion: '0.9.0', serverSeq: 0, snapshots: [] };
		const flagged: InitializeResult = { ...base, _meta: { 'vscode.agentHost': true, [AgentHostChatUrisCapabilityMetaKey]: true } };
		const oldNative: InitializeResult = { ...base, _meta: { 'vscode.agentHost': true } };
		const standard: InitializeResult = base;
		const kinds = (default_: string, host: InitializeResult | undefined) => newAgentHostChatUri('ahp-session:/s', default_, host).startsWith('ahp-chat:/') && !newAgentHostChatUri('ahp-session:/s', default_, host).startsWith('ahp-chat://') ? 'opaque' : 'shaped';
		assert.deepStrictEqual({
			flagged: kinds(opaqueDefault, flagged),
			oldNative: kinds(opaqueDefault, oldNative),
			standard: kinds(opaqueDefault, standard),
			noInitialize: kinds(opaqueDefault, undefined),
			shapedDefault: kinds(shapedDefault, flagged),
		}, { flagged: 'opaque', oldNative: 'shaped', standard: 'opaque', noInitialize: 'shaped', shapedDefault: 'shaped' });
	});
});
