/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise } from '../../../../../base/common/async.js';
import { Emitter } from '../../../../../base/common/event.js';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { AgentSession, CODEX_AGENT_PROVIDER_ID, type AgentProvider, type IAgentChatContext, type IAgentDiscoveredChat } from '../../../common/agent.js';
import { buildDefaultChatUri, parseRequiredSessionUriFromChatUri } from '../../../common/state/sessionState.js';
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

	test('cold native discovery waits for the SDK and emits through one deterministic path', async () => {
		const sdkReady = new DeferredPromise<string>();
		const onDidDiscoverChats = new Emitter<readonly IAgentDiscoveredChat[]>();
		const discoveredChats: number[] = [];
		const listener = onDidDiscoverChats.event(chats => discoveredChats.push(chats.length));
		const startDiscovery = (CodexAgent.prototype as unknown as {
			_startCodexChatDiscovery(this: {
				_codexChatDiscovery: Promise<void> | undefined;
				_resolveSdkRoot(): Promise<string>;
				_emitCodexChats(): Promise<boolean>;
				_logService: { warn(message: string): void };
			}): Promise<void>;
		})._startCodexChatDiscovery;
		const harness = {
			_logService: { warn: () => { } },
			_codexChatDiscovery: undefined as Promise<void> | undefined,
			_resolveSdkRoot: () => sdkReady.p,
			_emitCodexChats: async () => {
				onDidDiscoverChats.fire([{
					chat: URI.parse('agenthost-chat://codex/session/default'),
					startTime: 1,
					modifiedTime: 1,
					external: true,
				}]);
				return true;
			},
		};

		const discovery = startDiscovery.call(harness);
		assert.deepStrictEqual(discoveredChats, []);

		sdkReady.complete('/sdk-root');
		await discovery;

		assert.deepStrictEqual(discoveredChats, [1]);
		listener.dispose();
		onDidDiscoverChats.dispose();
	});

	test('listChatsToMigrate returns only known Codex chats without provenance', async () => {
		const knownInternal = AgentSession.uri('codex', 'known-internal');
		const knownExternal = AgentSession.uri('codex', 'known-external');
		const unknownExternal = AgentSession.uri('codex', 'unknown-external');
		const chats = [
			{ chat: URI.parse(buildDefaultChatUri(knownInternal)), startTime: 1, modifiedTime: 2 },
			{ chat: URI.parse(buildDefaultChatUri(knownExternal)), startTime: 3, modifiedTime: 4 },
			{ chat: URI.parse(buildDefaultChatUri(unknownExternal)), startTime: 5, modifiedTime: 6 },
		];
		const listChatsToMigrate = (CodexAgent.prototype as unknown as {
			listChatsToMigrate(this: {
				_isSdkResolvableWithoutDownload(): Promise<boolean>;
				_listCodexChats(): Promise<typeof chats>;
				_isKnownCodexChat(chat: (typeof chats)[number]): Promise<boolean>;
			}): Promise<typeof chats>;
		}).listChatsToMigrate;

		const result = await listChatsToMigrate.call({
			_isSdkResolvableWithoutDownload: async () => true,
			_listCodexChats: async () => chats,
			_isKnownCodexChat: async chat => {
				const id = AgentSession.id(URI.parse(parseRequiredSessionUriFromChatUri(chat.chat)));
				return id !== 'unknown-external';
			},
		});

		assert.deepStrictEqual(result, chats.slice(0, 2));
	});

	test('native discovery emits only unknown Codex chats as external', async () => {
		const knownInternal = AgentSession.uri('codex', 'known-internal');
		const knownExternal = AgentSession.uri('codex', 'known-external');
		const unknownExternal = AgentSession.uri('codex', 'unknown-external');
		const chats = [
			{ chat: URI.parse(buildDefaultChatUri(knownInternal)), startTime: 1, modifiedTime: 2 },
			{ chat: URI.parse(buildDefaultChatUri(knownExternal)), startTime: 3, modifiedTime: 4 },
			{ chat: URI.parse(buildDefaultChatUri(unknownExternal)), startTime: 5, modifiedTime: 6 },
		];
		const emitted: unknown[] = [];
		const emitCodexChats = (CodexAgent.prototype as unknown as {
			_emitCodexChats(this: {
				_listCodexChats(): Promise<typeof chats>;
				_isKnownCodexChat(chat: (typeof chats)[number]): Promise<boolean>;
				_onDidDiscoverChats: { fire(chats: readonly unknown[]): void };
				_logService: { warn(message: string): void };
			}): Promise<void>;
		})._emitCodexChats;

		await emitCodexChats.call({
			_listCodexChats: async () => chats,
			_isKnownCodexChat: async chat => {
				const id = AgentSession.id(URI.parse(parseRequiredSessionUriFromChatUri(chat.chat)));
				return id !== 'unknown-external';
			},
			_onDidDiscoverChats: { fire: chats => emitted.push(...chats) },
			_logService: { warn: () => { } },
		});

		assert.deepStrictEqual(emitted, [{ ...chats[2], external: true }]);
	});
});
