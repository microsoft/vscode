/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { AgentSession, type IAgentChatContext } from '../../../common/agentService.js';
import { CodexAgent } from '../../../node/codex/codexAgent.js';

interface ICodexConversationResolverHarness {
	readonly id: 'codex';
	readonly _sessionIdByChatUri: Map<string, string>;
	readonly _sessions: Map<string, { readonly sessionUri: URI }>;
}

function resolveConversationSession(harness: ICodexConversationResolverHarness, address: URI, context?: URI | IAgentChatContext): URI | undefined {
	const resolver = (CodexAgent.prototype as unknown as {
		_resolveConversationSession(this: ICodexConversationResolverHarness, address: URI, context?: URI | IAgentChatContext): URI | undefined;
	})._resolveConversationSession;
	return resolver.call(harness, address, context);
}

suite('CodexAgent', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('prefers transient host context over conversation URI shape', () => {
		const session = AgentSession.uri('codex', 'session-1');
		const harness: ICodexConversationResolverHarness = {
			id: 'codex',
			_sessionIdByChatUri: new Map(),
			_sessions: new Map(),
		};

		const result = resolveConversationSession(harness, URI.parse('untitled:conversation'), {
			session,
			resource: URI.parse('untitled:conversation'),
		});

		assert.strictEqual(result?.toString(), session.toString());
	});

	test('resolves a bound conversation URI from the recorded session binding', () => {
		const session = AgentSession.uri('codex', 'session-2');
		const chat = URI.parse('untitled:bound');
		const harness: ICodexConversationResolverHarness = {
			id: 'codex',
			_sessionIdByChatUri: new Map([[chat.toString(), 'session-2']]),
			_sessions: new Map([['session-2', { sessionUri: session }]]),
		};

		const result = resolveConversationSession(harness, chat);

		assert.strictEqual(result?.toString(), session.toString());
	});

	test('accepts a direct codex session URI for legacy callers', () => {
		const session = AgentSession.uri('codex', 'session-3');
		const harness: ICodexConversationResolverHarness = {
			id: 'codex',
			_sessionIdByChatUri: new Map(),
			_sessions: new Map(),
		};

		const result = resolveConversationSession(harness, session);

		assert.strictEqual(result?.toString(), session.toString());
	});

	test('does not infer a foreign URI as codex conversation membership', () => {
		const harness: ICodexConversationResolverHarness = {
			id: 'codex',
			_sessionIdByChatUri: new Map(),
			_sessions: new Map(),
		};

		const result = resolveConversationSession(harness, URI.parse('untitled:unknown'));

		assert.strictEqual(result, undefined);
	});
});
