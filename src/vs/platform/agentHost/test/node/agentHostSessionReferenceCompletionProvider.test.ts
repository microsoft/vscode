/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { AgentSession, type IAgentSessionMetadata } from '../../common/agentService.js';
import { readSessionReferenceAttachmentMeta } from '../../common/meta/agentSessionReferenceMeta.js';
import { CompletionItemKind, type CompletionsParams } from '../../common/state/protocol/commands.js';
import { MessageAttachmentKind } from '../../common/state/protocol/state.js';
import { AgentHostSessionReferenceCompletionProvider } from '../../node/agentHostSessionReferenceCompletionProvider.js';

suite('AgentHostSessionReferenceCompletionProvider', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	const PROVIDER = 'copilotcli';

	function session(id: string, summary: string, modifiedTime: number): IAgentSessionMetadata {
		return { session: AgentSession.uri(PROVIDER, id), startTime: 0, modifiedTime, summary };
	}

	function params(text: string, channelId = 'current'): CompletionsParams {
		return { kind: CompletionItemKind.UserMessage, channel: AgentSession.uri(PROVIDER, channelId).toString(), text, offset: text.length };
	}

	function create(sessions: readonly IAgentSessionMetadata[]): AgentHostSessionReferenceCompletionProvider {
		return new AgentHostSessionReferenceCompletionProvider(PROVIDER, async () => sessions);
	}

	test('lists other sessions newest-first, excluding the current one', async () => {
		const provider = create([
			session('a', 'Session A', 20),
			session('current', 'Current', 99),
			session('b', 'Session B', 30),
		]);
		const items = await provider.provideCompletionItems(params('#session:'), CancellationToken.None);
		assert.deepStrictEqual(items.map(i => i.insertText), ['#session:Session B ', '#session:Session A ']);
		const first = items[0].attachment;
		assert.strictEqual(first.type, MessageAttachmentKind.Simple);
		assert.strictEqual(first.displayKind, 'sessionReference');
		assert.deepStrictEqual(readSessionReferenceAttachmentMeta(first._meta), {
			sessionResource: AgentSession.uri(PROVIDER, 'b').toString(),
			sessionID: 'b',
		});
	});

	test('does not fire until the token targets sessions', async () => {
		const provider = create([session('a', 'Session A', 20)]);
		assert.deepStrictEqual(await provider.provideCompletionItems(params('#fi'), CancellationToken.None), []);
		assert.deepStrictEqual(await provider.provideCompletionItems(params('#'), CancellationToken.None), []);
	});

	test('fires for any non-empty prefix of the session token', async () => {
		const provider = create([session('a', 'Session A', 20)]);
		const forS = await provider.provideCompletionItems(params('#s'), CancellationToken.None);
		const forSession = await provider.provideCompletionItems(params('#session'), CancellationToken.None);
		assert.strictEqual(forS.length, 1);
		assert.strictEqual(forSession.length, 1);
	});

	test('does not fire for tokens that merely start with "session"', async () => {
		const provider = create([session('a', 'Session A', 20)]);
		for (const token of ['#sessions', '#sessionManager', '#session.ts']) {
			assert.deepStrictEqual(await provider.provideCompletionItems(params(token), CancellationToken.None), [], token);
		}
		// The completed `#session:` form still fires.
		assert.strictEqual((await provider.provideCompletionItems(params('#session:'), CancellationToken.None)).length, 1);
	});

	test('ignores sessions from a different provider', async () => {
		const provider = create([session('a', 'Session A', 20)]);
		const p: CompletionsParams = { kind: CompletionItemKind.UserMessage, channel: AgentSession.uri('claude', 'x').toString(), text: '#session:', offset: 9 };
		assert.deepStrictEqual(await provider.provideCompletionItems(p, CancellationToken.None), []);
	});

	test('falls back to a placeholder title for an untitled session', async () => {
		const provider = create([session('a', '   ', 20)]);
		const items = await provider.provideCompletionItems(params('#session:'), CancellationToken.None);
		assert.strictEqual(items[0].insertText, '#session:Untitled session ');
	});

	suite('listSessions caching', () => {
		test('reuses one fetch across a burst of keystrokes within the TTL', async () => {
			let calls = 0;
			const provider = new AgentHostSessionReferenceCompletionProvider(PROVIDER, async () => { calls++; return [session('a', 'A', 1)]; }, () => 0);
			await provider.provideCompletionItems(params('#s'), CancellationToken.None);
			await provider.provideCompletionItems(params('#se'), CancellationToken.None);
			await provider.provideCompletionItems(params('#session'), CancellationToken.None);
			assert.strictEqual(calls, 1);
		});

		test('re-fetches once the TTL has elapsed', async () => {
			let calls = 0;
			let now = 0;
			const provider = new AgentHostSessionReferenceCompletionProvider(PROVIDER, async () => { calls++; return [session('a', 'A', 1)]; }, () => now);
			await provider.provideCompletionItems(params('#s'), CancellationToken.None);
			now = 3000;
			await provider.provideCompletionItems(params('#s'), CancellationToken.None);
			assert.strictEqual(calls, 2);
		});

		test('does not cache a rejected fetch', async () => {
			let calls = 0;
			const provider = new AgentHostSessionReferenceCompletionProvider(PROVIDER, async () => { calls++; throw new Error('boom'); }, () => 0);
			await assert.rejects(provider.provideCompletionItems(params('#s'), CancellationToken.None));
			await assert.rejects(provider.provideCompletionItems(params('#s'), CancellationToken.None));
			assert.strictEqual(calls, 2);
		});
	});
});
