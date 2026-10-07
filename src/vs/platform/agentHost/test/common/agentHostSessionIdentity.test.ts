/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { URI } from '../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { AgentSession } from '../../common/agent.js';
import { getAgentHostChatId } from '../../common/agentHostChatIdentity.js';
import { newAgentHostSessionUri } from '../../common/agentHostSessionIdentity.js';
import { AgentHostSessionUrisCapabilityMetaKey, supportsAgentHostSessionUris } from '../../common/meta/agentHostSessionUrisMeta.js';
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
		}, { providers: ['codex', undefined], chats: [['default', 'peer'], ['default', 'peer']], distinct: true });
	});

	test('opaque advertised default and peer chat resources survive frontend fragment adaptation', () => {
		const state = { defaultChat: 'conversation://tenant/default?revision=3', chats: [{ resource: 'conversation://tenant/peer?revision=4' }] };
		const fragment = getAgentHostChatId(state.chats[0].resource);
		assert.deepStrictEqual([
			getSessionChatResource(state, 'default'),
			getSessionChatResource(state, fragment),
		], [state.defaultChat, state.chats[0].resource]);
	});
});
