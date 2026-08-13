/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { AgentSession, CODEX_AGENT_PROVIDER_ID, type AgentProvider, type IAgentChatContext } from '../../../common/agent.js';
import { buildDefaultChatUri } from '../../../common/state/sessionState.js';
import { CodexAgent } from '../../../node/codex/codexAgent.js';

/**
 * Exactly the state `_resolveConversationSession` reads: the provider id it
 * mints canonical session URIs with, and the chat→runtime bindings it recorded.
 * Notably NOT the session map — resolution answers with the canonical URI of
 * the bound runtime id rather than echoing whatever URI an entry happens to
 * carry, so a stale or mis-stamped entry cannot redirect a chat.
 */
interface ICodexConversationResolverHarness {
	readonly id: AgentProvider;
	readonly _sessionIdByChatUri: Map<string, string>;
}

function resolveConversationSession(harness: ICodexConversationResolverHarness, address: URI, context?: URI | IAgentChatContext): URI | undefined {
	const resolver = (CodexAgent.prototype as unknown as {
		_resolveConversationSession(this: ICodexConversationResolverHarness, address: URI, context?: URI | IAgentChatContext): URI | undefined;
	})._resolveConversationSession;
	return resolver.call(harness, address, context);
}

function emptyHarness(): ICodexConversationResolverHarness {
	return { id: CODEX_AGENT_PROVIDER_ID, _sessionIdByChatUri: new Map() };
}

suite('CodexAgent', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('prefers transient host context over conversation URI shape', () => {
		const session = AgentSession.uri('codex', 'session-1');

		const result = resolveConversationSession(emptyHarness(), URI.parse('untitled:conversation'), {
			resource: URI.parse('untitled:conversation'),
			configurationResource: session,
		});

		assert.strictEqual(result?.toString(), session.toString());
	});

	test('resolves a bound conversation URI from the recorded session binding', () => {
		const session = AgentSession.uri('codex', 'session-2');
		const chat = URI.parse('untitled:bound');
		const harness: ICodexConversationResolverHarness = {
			id: CODEX_AGENT_PROVIDER_ID,
			_sessionIdByChatUri: new Map([[chat.toString(), 'session-2']]),
		};

		const result = resolveConversationSession(harness, chat);

		assert.strictEqual(result?.toString(), session.toString());
	});

	test('resolution has exactly two sources: a recorded binding or host context', () => {
		const session = AgentSession.uri('codex', 'session-3');
		const defaultChat = URI.parse(buildDefaultChatUri(session));

		assert.deepStrictEqual({
			// The legacy "a codex session URI addresses its own chat" adapter is
			// gone: an unbound session URI is not self-resolving any more.
			unboundSessionUri: resolveConversationSession(emptyHarness(), session)?.toString(),
			// Nor is a chat URI recognized by shape — an unbound default chat
			// only resolves once the host supplies its owning session.
			unboundDefaultChat: resolveConversationSession(emptyHarness(), defaultChat)?.toString(),
			withHostContext: resolveConversationSession(emptyHarness(), defaultChat, { configurationResource: session, resource: defaultChat })?.toString(),
			foreignUri: resolveConversationSession(emptyHarness(), URI.parse('untitled:unknown'))?.toString(),
		}, {
			unboundSessionUri: undefined,
			unboundDefaultChat: undefined,
			withHostContext: session.toString(),
			foreignUri: undefined,
		});
	});
});
