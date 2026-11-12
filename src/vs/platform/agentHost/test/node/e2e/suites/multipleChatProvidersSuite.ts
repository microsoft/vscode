/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { tmpdir } from 'os';
import { join } from '../../../../../../base/common/path.js';
import { URI } from '../../../../../../base/common/uri.js';
import { GITHUB_COPILOT_PROTECTED_RESOURCE } from '../../../../common/agent.js';
import { ChatProvidersConfigKey } from '../../../../common/agentHostChatProviders.js';
import { ActionType, type StateAction } from '../../../../common/state/sessionActions.js';
import { ChatSourceKind, type InitializeResult, type ListSessionsResult, type SubscribeResult } from '../../../../common/state/protocol/commands.js';
import { PROTOCOL_VERSION } from '../../../../common/state/protocol/version/registry.js';
import { MessageKind, ROOT_STATE_URI, type ChatState, type RootState, type SessionState } from '../../../../common/state/sessionState.js';
import { JsonRpcErrorCodes, ProtocolError } from '../../../../common/state/sessionProtocol.js';
import { newTestChatUri } from '../../hostDefaultChats.js';
import { defaultChatChannel, getActionEnvelope, isActionNotification, type TestProtocolClient } from '../../serverIntegrationTestHelpers.js';
import { createRealSession, resolveGitHubToken } from '../harness/agentHostE2ETestHarness.js';
import { createTestDirectory, ownCodexProtectedDirectories } from '../harness/testDirectories.js';
import { conformanceTest, type IAgentHostE2ETestContext } from './e2eTestContext.js';

const SECOND_AGENT = 'copilotcli';

/**
 * Chats of one session backed by different agents (`multipleChatProviders`).
 *
 * The advertisement and the rejections that need no second agent are
 * conformance scenarios against the reference host. Scenarios that run a turn in
 * chats of two agents are parity scenarios of the Claude and Codex runs, which
 * register the Copilot agent next to their own; they need no mock agent. They run
 * for Claude only: a capture holds one wire dialect and Codex speaks Responses
 * while the Copilot agent speaks Anthropic (see KNOWN_ISSUES.md). The Copilot run
 * registers one agent only, so it has nothing to mix.
 */
export function defineMultipleChatProvidersTests(context: IAgentHostE2ETestContext): void {
	const { config, createdSessions, tempDirs } = context;
	let nextClientSeq = 30_000;

	function workspace(prefix: string): URI {
		const directory = createTestDirectory(join(tmpdir(), `ahp-chat-providers-${prefix}-`));
		tempDirs.push(directory);
		ownCodexProtectedDirectories(directory, config.provider, context.isLinux);
		return URI.file(directory);
	}

	async function dispatchAndWait(channel: string, action: StateAction): Promise<void> {
		const clientSeq = nextClientSeq++;
		context.client.dispatch({ channel, clientSeq, action });
		await context.client.waitForNotification(n =>
			isActionNotification(n, action.type)
			&& getActionEnvelope(n).channel === channel
			&& getActionEnvelope(n).origin?.clientSeq === clientSeq,
			30_000,
		);
	}

	async function setGate(enabled: boolean): Promise<void> {
		const root = await context.client.call<SubscribeResult>('subscribe', { channel: ROOT_STATE_URI });
		if ((root.snapshot!.state as RootState).config?.values?.[ChatProvidersConfigKey.Enabled] === enabled) {
			return;
		}
		await dispatchAndWait(ROOT_STATE_URI, { type: ActionType.RootConfigChanged, config: { [ChatProvidersConfigKey.Enabled]: enabled } });
	}

	/** Runs `run` with the gate on; the shared host is left with it off again. */
	async function withGate(run: () => Promise<void>): Promise<void> {
		await setGate(true);
		try {
			await run();
		} finally {
			await setGate(false);
		}
	}

	async function initializeResult(clientId: string): Promise<InitializeResult> {
		const client = await context.connectClient();
		try {
			return await client.call<InitializeResult>('initialize', { channel: ROOT_STATE_URI, protocolVersions: [PROTOCOL_VERSION], clientId });
		} finally {
			client.close();
		}
	}

	async function createSession(prefix: string): Promise<string> {
		return createRealSession(context.client, config, `${prefix}-${config.provider}`, createdSessions, workspace(prefix));
	}

	async function sessionState(sessionUri: string): Promise<SessionState> {
		const result = await context.client.call<SubscribeResult>('subscribe', { channel: sessionUri });
		return result.snapshot!.state as SessionState;
	}

	async function chatState(chatUri: string): Promise<ChatState> {
		const result = await context.client.call<SubscribeResult>('subscribe', { channel: chatUri });
		return result.snapshot!.state as ChatState;
	}

	async function createChat(sessionUri: string, extra: Record<string, unknown>): Promise<string> {
		const chat = newTestChatUri();
		await context.client.call('createChat', { channel: sessionUri, chat, ...extra }, 30_000);
		return chat;
	}

	async function rejection(run: () => Promise<unknown>): Promise<{ readonly code: number | undefined; readonly message: string }> {
		try {
			await run();
		} catch (error) {
			return { code: error instanceof ProtocolError ? error.code : undefined, message: error instanceof Error ? error.message : String(error) };
		}
		return { code: undefined, message: 'accepted' };
	}

	/** Runs one turn to completion in `chatUri` and returns its markdown response. */
	async function runTurn(chatUri: string, turnId: string, text: string): Promise<string> {
		await chatState(chatUri);
		context.client.clearReceived();
		context.client.dispatch({
			channel: chatUri,
			clientSeq: nextClientSeq++,
			action: { type: ActionType.ChatTurnStarted, turnId, startedAt: new Date().toISOString(), message: { text, origin: { kind: MessageKind.User } } },
		});
		const done = await context.client.waitForNotification(n =>
			(isActionNotification(n, 'chat/turnComplete') || isActionNotification(n, 'chat/error'))
			&& getActionEnvelope(n).channel === chatUri
			&& (getActionEnvelope(n).action as { turnId: string }).turnId === turnId,
			90_000,
		);
		assert.ok(isActionNotification(done, 'chat/turnComplete'), `turn ${turnId} failed: ${JSON.stringify(getActionEnvelope(done).action)}`);
		const state = await chatState(chatUri);
		const turn = state.turns.find(candidate => candidate.id === turnId);
		return JSON.stringify(turn?.responseParts ?? []);
	}

	function parityTest(title: string, run: Mocha.AsyncFunc): void {
		// A fixture has one wire dialect: only Claude shares the Copilot agent's Anthropic dialect.
		if (context.tier !== 'parity' || config.provider !== 'claude') {
			return;
		}
		test(title, function () {
			this.timeout(240_000);
			return run.call(this);
		});
	}

	conformanceTest(context, 'initialize advertises multipleChatProviders only behind the setting', async function () {
		await createSession('providers-advertise');
		const off = await initializeResult('chat-providers-off');
		await setGate(true);
		let on: InitializeResult;
		try {
			on = await initializeResult('chat-providers-on');
		} finally {
			await setGate(false);
		}
		assert.deepStrictEqual({
			version: PROTOCOL_VERSION,
			off: Object.hasOwn(off, 'multipleChatProviders'),
			on: on.multipleChatProviders,
		}, { version: '1.1.0', off: false, on: {} });
	});

	conformanceTest(context, 'createChat rejects a provider while the setting is off', async function () {
		const sessionUri = await createSession('providers-off');
		const result = await rejection(() => createChat(sessionUri, { provider: SECOND_AGENT }));
		const state = await sessionState(sessionUri);
		assert.deepStrictEqual({ code: result.code, chats: state.chats.length }, { code: JsonRpcErrorCodes.InvalidParams, chats: 1 });
	});

	conformanceTest(context, 'createChat rejects an unknown provider', async function () {
		const sessionUri = await createSession('providers-unknown');
		await withGate(async () => {
			const result = await rejection(() => createChat(sessionUri, { provider: 'no-such-agent' }));
			assert.deepStrictEqual({ code: result.code, message: result.message }, { code: JsonRpcErrorCodes.InvalidParams, message: 'Agent no-such-agent is unknown or disabled.' });
		});
	});

	conformanceTest(context, 'createChat with the session\'s own provider has no chat config schema of its own', async function () {
		const sessionUri = await createSession('providers-same');
		await withGate(async () => {
			const chat = await createChat(sessionUri, { provider: config.provider });
			const state = await chatState(chat);
			// Only a chat on another agent than its session's carries a schema of its own.
			assert.strictEqual(Object.hasOwn(state.config ?? {}, 'schema'), false);
		});
	});

	parityTest('chats of one session run turns in their own agent', async function () {
		const sessionUri = await createSession('providers-turns');
		await withGate(async () => {
			const defaultChat = defaultChatChannel(sessionUri);
			const peer = await createChat(sessionUri, { provider: SECOND_AGENT });

			const session = await sessionState(sessionUri);
			const summary = session.chats.find(chat => chat.resource === peer);
			const peerState = await chatState(peer);
			const defaultState = await chatState(defaultChat);
			assert.deepStrictEqual({
				summaryProvider: summary?.provider,
				peerProvider: peerState.provider,
				peerHasSchema: Object.hasOwn(peerState.config ?? {}, 'schema'),
				defaultProvider: defaultState.provider ?? config.provider,
				defaultHasSchema: Object.hasOwn(defaultState.config ?? {}, 'schema'),
			}, {
				summaryProvider: SECOND_AGENT,
				peerProvider: SECOND_AGENT,
				peerHasSchema: true,
				defaultProvider: config.provider,
				defaultHasSchema: false,
			});

			const defaultReply = await runTurn(defaultChat, 'turn-default', 'Reply exactly "alpha".');
			const defaultBodies = context.observedModelRequestBodies.length;
			const peerReply = await runTurn(peer, 'turn-peer', 'Reply exactly "beta".');
			const bodies = context.observedModelRequestBodies;
			assert.ok(defaultReply.includes('alpha'), defaultReply);
			assert.ok(peerReply.includes('beta'), peerReply);
			// Each agent talks to the model in its own wire format.
			const shape = (body: string) => Object.keys(JSON.parse(body) as object).sort().join(',');
			const defaultShapes = new Set(bodies.slice(0, defaultBodies).map(shape));
			const peerShapes = new Set(bodies.slice(defaultBodies).map(shape));
			assert.ok([...peerShapes].some(candidate => !defaultShapes.has(candidate)), `peer chat requests look like the default chat's: ${[...peerShapes]}`);
		});
	});

	parityTest('a fork stays on its source chat\'s agent and rejects another provider', async function () {
		const sessionUri = await createSession('providers-fork');
		await withGate(async () => {
			const peer = await createChat(sessionUri, { provider: SECOND_AGENT });
			await runTurn(peer, 'turn-source', 'Reply exactly "gamma".');

			const source = { kind: ChatSourceKind.Fork, chat: peer, turnId: 'turn-source' };
			const mismatch = await rejection(() => createChat(sessionUri, { source, provider: config.provider }));
			const fork = await createChat(sessionUri, { source });
			const session = await sessionState(sessionUri);
			const forkState = await chatState(fork);
			assert.deepStrictEqual({
				mismatch: mismatch.code,
				summaryProvider: session.chats.find(chat => chat.resource === fork)?.provider,
				forkProvider: forkState.provider,
			}, { mismatch: JsonRpcErrorCodes.InvalidParams, summaryProvider: SECOND_AGENT, forkProvider: SECOND_AGENT });
		});
	});

	parityTest('chats keep their own agent across a host restart', async function () {
		const sessionUri = await createSession('providers-restart');
		const workingDirectory = workspace('providers-restart-client');
		await setGate(true);
		const defaultChat = defaultChatChannel(sessionUri);
		const peer = await createChat(sessionUri, { provider: SECOND_AGENT });
		await runTurn(defaultChat, 'turn-default', 'Reply exactly "alpha".');
		await runTurn(peer, 'turn-peer', 'Reply exactly "beta".');

		await context.restartServer();
		const client: TestProtocolClient = context.client;
		client.setWorkingDirectory(workingDirectory.fsPath);
		await client.call('initialize', { channel: ROOT_STATE_URI, protocolVersions: [PROTOCOL_VERSION], clientId: `providers-restart-${config.provider}` }, 30_000);
		await client.call('authenticate', {
			channel: ROOT_STATE_URI,
			resource: GITHUB_COPILOT_PROTECTED_RESOURCE.resource,
			token: config.githubToken ?? resolveGitHubToken(),
		}, 30_000);
		await setGate(true);

		// Listed before any chat is hydrated.
		const listed = await client.call<ListSessionsResult>('listSessions', {});
		const entry = listed.items.find(item => item.resource === sessionUri);
		const session = await sessionState(sessionUri);
		assert.deepStrictEqual({
			listed: entry?.chats?.map(chat => chat.provider ?? config.provider).sort(),
			state: session.chats.map(chat => chat.provider ?? config.provider).sort(),
		}, {
			listed: [config.provider, SECOND_AGENT].sort(),
			state: [config.provider, SECOND_AGENT].sort(),
		});

		const defaultReply = await runTurn(defaultChat, 'turn-default-2', 'Reply exactly "delta".');
		const peerReply = await runTurn(peer, 'turn-peer-2', 'Reply exactly "epsilon".');
		assert.ok(defaultReply.includes('delta') && peerReply.includes('epsilon'), `${defaultReply} ${peerReply}`);
		await setGate(false);
	});
}
