/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from '../../../../../../base/common/path.js';
import { URI } from '../../../../../../base/common/uri.js';
import { ActionType, type ChatErrorAction, type ChatToolCallReadyAction } from '../../../../common/state/sessionActions.js';
import { ChatSourceKind, CompletionItemKind, type CompletionsResult, type ListSessionsResult, type SubscribeResult } from '../../../../common/state/protocol/commands.js';
import {
	buildChatUri,
	buildDefaultChatUri,
	ChatOriginKind,
	isAhpChatChannel,
	MessageAttachmentKind,
	MessageKind,
	parseRequiredSessionUriFromChatUri,
	ResponsePartKind,
	ROOT_STATE_URI,
	SessionStatus,
	ToolCallConfirmationReason,
	type ChatState,
	type MessageAttachment,
	type RootState,
	type SessionState,
} from '../../../../common/state/sessionState.js';
import { createRealSession } from '../harness/agentHostE2ETestHarness.js';
import { getActionEnvelope, isActionNotification } from '../../serverIntegrationTestHelpers.js';
import { hostOnlyTest, type IAgentHostE2ETestContext } from './e2eTestContext.js';

export function defineMultiChatTests(context: IAgentHostE2ETestContext): void {
	const { config, createdSessions, tempDirs, shellToolReplayEnabled } = context;

	async function createSession(prefix: string): Promise<{ sessionUri: string; defaultChatUri: string; workspace: string }> {
		const workspace = mkdtempSync(join(tmpdir(), `ahp-multichat-${prefix}-`));
		tempDirs.push(workspace);
		const sessionUri = await createRealSession(
			context.client,
			config,
			`${prefix}-${config.provider}`,
			createdSessions,
			URI.file(workspace),
		);
		return { sessionUri, defaultChatUri: buildDefaultChatUri(sessionUri), workspace };
	}

	async function createPeer(sessionUri: string, id: string, source?: { chat: string; turnId: string; kind: ChatSourceKind }): Promise<string> {
		const chat = buildChatUri(sessionUri, id);
		await context.client.call('createChat', {
			channel: sessionUri,
			chat,
			...(source ? { source } : {}),
		}, 30_000);
		return chat;
	}

	async function sessionState(sessionUri: string): Promise<SessionState> {
		const result = await context.client.call<SubscribeResult>('subscribe', { channel: sessionUri });
		return result.snapshot!.state as SessionState;
	}

	async function chatState(chatUri: string): Promise<ChatState> {
		const result = await context.client.call<SubscribeResult>('subscribe', { channel: chatUri });
		return result.snapshot!.state as ChatState;
	}

	async function rename(channel: string, title: string, clientSeq = 1): Promise<void> {
		context.client.clearReceived();
		context.client.dispatch({
			channel,
			clientSeq,
			action: { type: ActionType.SessionTitleChanged, title },
		});
		if (isAhpChatChannel(channel)) {
			const session = parseRequiredSessionUriFromChatUri(channel);
			await context.client.waitForNotification(n => {
				if (!isActionNotification(n, 'session/chatUpdated') || getActionEnvelope(n).channel !== session) {
					return false;
				}
				const action = getActionEnvelope(n).action as { chat: string; changes: { title?: string } };
				return action.chat === channel && action.changes.title === title;
			});
		} else {
			await context.client.waitForNotification(n =>
				isActionNotification(n, 'session/titleChanged')
				&& getActionEnvelope(n).channel === channel,
			);
		}
	}

	function providerTest(title: string, run: Mocha.AsyncFunc, enabled = config.supportsMultipleChats): void {
		(enabled ? test : test.skip)(title, function () {
			this.timeout(180_000);
			return run.call(this);
		});
	}

	interface IObservedModelMessage {
		readonly role: string;
		readonly content: string;
	}

	function observedModelMessages(body: string): readonly IObservedModelMessage[] {
		const request: unknown = JSON.parse(body);
		if (!isRecord(request) || !Array.isArray(request.messages)) {
			return [];
		}
		return request.messages.flatMap(message => {
			if (!isRecord(message) || typeof message.role !== 'string') {
				return [];
			}
			return [{ role: message.role, content: modelContentText(message.content) }];
		});
	}

	function modelContentText(value: unknown): string {
		if (typeof value === 'string') {
			return value;
		}
		if (Array.isArray(value)) {
			return value.map(modelContentText).join('');
		}
		if (isRecord(value)) {
			if (typeof value.text === 'string') {
				return value.text;
			}
			return modelContentText(value.content);
		}
		return '';
	}

	function isRecord(value: unknown): value is Record<string, unknown> {
		return typeof value === 'object' && value !== null;
	}

	function forkProviderTest(title: string, run: Mocha.AsyncFunc): void {
		(config.supportsChatForkE2E ? test : test.skip)(title, function () {
			this.timeout(180_000);
			return run.call(this);
		});
	}

	async function driveTurn(
		chatUri: string,
		turnId: string,
		text: string,
		clientSeq: number,
		attachments?: readonly MessageAttachment[],
	): Promise<string> {
		context.client.clearReceived();
		context.client.dispatch({
			channel: chatUri,
			clientSeq,
			action: {
				type: ActionType.ChatTurnStarted,
				turnId,
				startedAt: '2025-01-01T00:00:00.000Z',
				message: { text, origin: { kind: MessageKind.User }, ...(attachments ? { attachments: [...attachments] } : {}) },
			},
		});
		const seen = new Set<object>();
		let nextClientSeq = clientSeq + 1;
		while (true) {
			const notification = await context.client.waitForNotification(n => {
				if (seen.has(n as object)
					|| (!isActionNotification(n, 'chat/toolCallReady')
						&& !isActionNotification(n, 'chat/turnComplete')
						&& !isActionNotification(n, 'chat/error'))
				) {
					return false;
				}
				return getActionEnvelope(n).channel === chatUri;
			}, 90_000);
			seen.add(notification as object);
			if (isActionNotification(notification, 'chat/error')) {
				const action = getActionEnvelope(notification).action as ChatErrorAction;
				throw new Error(`Peer chat error during ${turnId}: ${JSON.stringify(action.error)}`);
			}
			if (isActionNotification(notification, 'chat/turnComplete')) {
				break;
			}
			const action = getActionEnvelope(notification).action as ChatToolCallReadyAction;
			if (!action.confirmed) {
				context.client.dispatch({
					channel: chatUri,
					clientSeq: nextClientSeq++,
					action: {
						type: ActionType.ChatToolCallConfirmed,
						turnId,
						toolCallId: action.toolCallId,
						approved: true,
						confirmed: ToolCallConfirmationReason.UserAction,
					},
				});
			}
		}

		const markdownPartIds = new Set<string>();
		const pieces: string[] = [];
		for (const notification of context.client.receivedNotifications(n =>
			(isActionNotification(n, 'chat/responsePart') || isActionNotification(n, 'chat/delta'))
			&& getActionEnvelope(n).channel === chatUri
		)) {
			const action = getActionEnvelope(notification).action;
			if (action.type === ActionType.ChatResponsePart && action.part.kind === ResponsePartKind.Markdown) {
				markdownPartIds.add(action.part.id);
				pieces.push(action.part.content);
			} else if (action.type === ActionType.ChatDelta && markdownPartIds.has(action.partId)) {
				pieces.push(action.content);
			}
		}
		return pieces.join('');
	}

	hostOnlyTest(context, 'agent advertises its multiple chat capability', async function () {
		await createSession('capability');
		const root = await context.client.call<SubscribeResult>('subscribe', { channel: ROOT_STATE_URI });
		const agent = (root.snapshot!.state as RootState).agents.find(agent => agent.provider === config.provider);

		assert.deepStrictEqual({
			multipleChats: !!agent?.capabilities?.multipleChats,
			fork: agent?.capabilities?.multipleChats?.fork ?? false,
			sideChat: agent?.capabilities?.multipleChats?.sideChat ?? false,
		}, {
			multipleChats: config.supportsMultipleChats,
			fork: config.supportsChatFork,
			sideChat: config.supportsSideChats ?? false,
		});
	});

	hostOnlyTest(context, 'provider without multiple chat capability rejects peer creation', async function () {
		const { sessionUri } = await createSession('unsupported');

		await assert.rejects(
			() => createPeer(sessionUri, 'unsupported-peer'),
			/does not support multiple chats/i,
		);
	}, !config.supportsMultipleChats);

	hostOnlyTest(context, 'creating a peer chat adds it to the session catalog', async function () {
		const { sessionUri } = await createSession('catalog-add');
		const peer = await createPeer(sessionUri, 'peer');

		assert.ok((await sessionState(sessionUri)).chats.some(chat => chat.resource === peer));
	}, config.supportsMultipleChats);

	hostOnlyTest(context, 'peer chat subscription starts empty and idle', async function () {
		const { sessionUri } = await createSession('empty-peer');
		const peer = await createPeer(sessionUri, 'peer');

		const state = await chatState(peer);

		assert.deepStrictEqual({ turns: state.turns, activeTurn: state.activeTurn, status: state.status }, {
			turns: [],
			activeTurn: undefined,
			status: SessionStatus.Idle,
		});
	}, config.supportsMultipleChats);

	hostOnlyTest(context, 'creating the same peer chat twice is idempotent', async function () {
		const { sessionUri } = await createSession('idempotent');
		const peer = await createPeer(sessionUri, 'peer');

		await createPeer(sessionUri, 'peer');

		assert.strictEqual((await sessionState(sessionUri)).chats.filter(chat => chat.resource === peer).length, 1);
	}, config.supportsMultipleChats);

	hostOnlyTest(context, 'creating two peer chats preserves both catalog entries', async function () {
		const { sessionUri } = await createSession('two-peers');
		const first = await createPeer(sessionUri, 'first');
		const second = await createPeer(sessionUri, 'second');

		const peers = (await sessionState(sessionUri)).chats.map(chat => chat.resource);

		assert.ok(peers.includes(first) && peers.includes(second));
	}, config.supportsMultipleChats);

	hostOnlyTest(context, 'disposing a peer chat removes its catalog entry', async function () {
		const { sessionUri } = await createSession('dispose');
		const peer = await createPeer(sessionUri, 'peer');

		await context.client.call('disposeChat', { channel: peer }, 30_000);

		assert.strictEqual((await sessionState(sessionUri)).chats.some(chat => chat.resource === peer), false);
	}, config.supportsMultipleChats);

	hostOnlyTest(context, 'disposing one peer chat preserves its sibling', async function () {
		const { sessionUri } = await createSession('dispose-one');
		const first = await createPeer(sessionUri, 'first');
		const second = await createPeer(sessionUri, 'second');

		await context.client.call('disposeChat', { channel: first }, 30_000);

		const peers = (await sessionState(sessionUri)).chats.map(chat => chat.resource);
		assert.ok(!peers.includes(first) && peers.includes(second));
	}, config.supportsMultipleChats);

	hostOnlyTest(context, 'recreating a disposed peer chat starts empty', async function () {
		const { sessionUri } = await createSession('recreate');
		const peer = await createPeer(sessionUri, 'peer');
		await context.client.call('disposeChat', { channel: peer }, 30_000);

		await createPeer(sessionUri, 'peer');

		assert.deepStrictEqual((await chatState(peer)).turns, []);
	}, config.supportsMultipleChats);

	hostOnlyTest(context, 'renaming a peer chat updates its catalog title', async function () {
		const { sessionUri } = await createSession('rename-peer');
		const peer = await createPeer(sessionUri, 'peer');

		await rename(peer, 'Peer Title');

		assert.strictEqual((await sessionState(sessionUri)).chats.find(chat => chat.resource === peer)?.title, 'Peer Title');
	}, config.supportsMultipleChats);

	hostOnlyTest(context, 'renaming a peer chat leaves the session title unchanged', async function () {
		const { sessionUri } = await createSession('rename-isolated');
		await rename(sessionUri, 'Session Title');
		const peer = await createPeer(sessionUri, 'peer');

		await rename(peer, 'Peer Title', 2);

		assert.strictEqual((await sessionState(sessionUri)).title, 'Session Title');
	}, config.supportsMultipleChats);

	hostOnlyTest(context, 'peer chat survives unsubscribe and resubscribe', async function () {
		const { sessionUri } = await createSession('resubscribe');
		const peer = await createPeer(sessionUri, 'peer');
		await context.client.call<SubscribeResult>('subscribe', { channel: peer });

		context.client.notify('unsubscribe', { channel: peer });

		assert.strictEqual((await chatState(peer)).resource, peer);
	}, config.supportsMultipleChats);

	hostOnlyTest(context, 'peer creation does not leak a provider backing as a top-level session', async function () {
		const { sessionUri } = await createSession('session-list');
		const before = await context.client.call<ListSessionsResult>('listSessions', { channel: ROOT_STATE_URI });

		await createPeer(sessionUri, 'peer');

		const after = await context.client.call<ListSessionsResult>('listSessions', { channel: ROOT_STATE_URI });
		const beforeResources = new Set(before.items.map(item => item.resource));
		const unexpected = after.items
			.map(item => item.resource)
			.filter(resource => !beforeResources.has(resource) && resource !== sessionUri);

		assert.deepStrictEqual(unexpected, []);
	}, config.supportsMultipleChats);

	hostOnlyTest(context, 'peer file completion uses the parent workspace', async function () {
		const { sessionUri, workspace } = await createSession('completion');
		writeFileSync(join(workspace, 'peer-target.txt'), 'target');
		const peer = await createPeer(sessionUri, 'peer');

		const completions = await context.client.call<CompletionsResult>('completions', {
			channel: peer,
			kind: CompletionItemKind.UserMessage,
			text: '@peer-t',
			offset: '@peer-t'.length,
		});

		assert.deepStrictEqual(completions.items.map(item => item.insertText), ['@peer-target.txt']);
	}, config.supportsMultipleChats);

	hostOnlyTest(context, 'first peer chat snapshots the session title onto the default chat', async function () {
		const { sessionUri, defaultChatUri } = await createSession('default-title');
		await rename(sessionUri, 'Original Session');

		await createPeer(sessionUri, 'peer');

		assert.strictEqual((await sessionState(sessionUri)).chats.find(chat => chat.resource === defaultChatUri)?.title, 'Original Session');
	}, config.supportsMultipleChats);

	hostOnlyTest(context, 'session rename after peer creation preserves the default chat title', async function () {
		const { sessionUri, defaultChatUri } = await createSession('independent-title');
		await rename(sessionUri, 'Original Session');
		await createPeer(sessionUri, 'peer');

		await rename(sessionUri, 'Renamed Session', 2);

		assert.strictEqual((await sessionState(sessionUri)).chats.find(chat => chat.resource === defaultChatUri)?.title, 'Original Session');
	}, config.supportsMultipleChats);

	hostOnlyTest(context, 'forking an unknown turn creates a fresh empty peer chat', async function () {
		const { sessionUri, defaultChatUri } = await createSession('unknown-fork');

		const peer = await createPeer(sessionUri, 'fork', { kind: ChatSourceKind.Fork, chat: defaultChatUri, turnId: 'missing-turn' });

		assert.deepStrictEqual((await chatState(peer)).turns, []);
	}, config.supportsMultipleChats);

	providerTest('peer chat completes a simple turn', async function () {
		const { sessionUri } = await createSession('peer-turn');
		const peer = await createPeer(sessionUri, 'peer');
		await context.client.call<SubscribeResult>('subscribe', { channel: peer });

		const response = await driveTurn(peer, 'peer-turn', 'Reply exactly "PEER_OK".', 1);

		assert.match(response, /PEER_OK/);
	});

	providerTest('peer chat retains context across consecutive turns', async function () {
		const { sessionUri } = await createSession('peer-context');
		const peer = await createPeer(sessionUri, 'peer');
		await context.client.call<SubscribeResult>('subscribe', { channel: peer });

		const firstResponse = await driveTurn(peer, 'peer-context-1', 'Remember the code word PEAR. Reply exactly "ready".', 1);
		const response = await driveTurn(peer, 'peer-context-2', 'What code word did I ask you to remember? Reply with only the code word.', 2);
		const messages = observedModelMessages(context.observedModelRequestBodies.at(-1) ?? '');
		const priorAssistantResponse = firstResponse.trim();

		assert.deepStrictEqual({
			priorAssistantResponseIsNonEmpty: priorAssistantResponse.length > 0,
			responseHasCodeWord: /PEAR/i.test(response),
			requestHasPriorUserMessage: messages.some(message => message.role === 'user' && message.content.includes('Remember the code word PEAR')),
			requestHasPriorAssistantMessage: messages.some(message => message.role === 'assistant' && message.content.includes(priorAssistantResponse)),
		}, {
			priorAssistantResponseIsNonEmpty: true,
			responseHasCodeWord: true,
			requestHasPriorUserMessage: true,
			requestHasPriorAssistantMessage: true,
		});
	});

	forkProviderTest('forked peer chat inherits source history through the provider', async function () {
		const { sessionUri, defaultChatUri } = await createSession('fork-history');
		const sourceResponse = await driveTurn(defaultChatUri, 'fork-source', 'Remember the code word FORKCODE. Reply exactly "ready".', 1);

		const peer = await createPeer(sessionUri, 'fork', { kind: ChatSourceKind.Fork, chat: defaultChatUri, turnId: 'fork-source' });
		await context.client.call<SubscribeResult>('subscribe', { channel: peer });
		const response = await driveTurn(peer, 'fork-turn', 'What code word did I ask you to remember? Reply with only the code word.', 2);
		const messages = observedModelMessages(context.observedModelRequestBodies.at(-1) ?? '');
		const priorAssistantResponse = sourceResponse.trim();

		assert.deepStrictEqual({
			seededMessages: (await chatState(peer)).turns.map(turn => turn.message.text),
			priorAssistantResponseIsNonEmpty: priorAssistantResponse.length > 0,
			responseHasCodeWord: /FORKCODE/i.test(response),
			requestHasPriorUserMessage: messages.some(message => message.role === 'user' && message.content.includes('Remember the code word FORKCODE')),
			requestHasPriorAssistantMessage: messages.some(message => message.role === 'assistant' && message.content.includes(priorAssistantResponse)),
		}, {
			seededMessages: [
				'Remember the code word FORKCODE. Reply exactly "ready".',
				'What code word did I ask you to remember? Reply with only the code word.',
			],
			priorAssistantResponseIsNonEmpty: true,
			responseHasCodeWord: true,
			requestHasPriorUserMessage: true,
			requestHasPriorAssistantMessage: true,
		});
	});

	providerTest('disposing a peer after a completed turn removes it from the catalog', async function () {
		const { sessionUri } = await createSession('dispose-after-turn');
		const peer = await createPeer(sessionUri, 'peer');
		await context.client.call<SubscribeResult>('subscribe', { channel: peer });
		await driveTurn(peer, 'peer-turn', 'Reply exactly "DONE".', 1);

		await context.client.call('disposeChat', { channel: peer }, 30_000);

		assert.strictEqual((await sessionState(sessionUri)).chats.some(chat => chat.resource === peer), false);
	});

	hostOnlyTest(context, 'peer rename command updates the peer title and records a local turn', async function () {
		const { sessionUri } = await createSession('local-rename');
		const peer = await createPeer(sessionUri, 'peer');
		await context.client.call<SubscribeResult>('subscribe', { channel: peer });

		await driveTurn(peer, 'peer-rename', '/rename Renamed Peer', 1);

		const state = await chatState(peer);
		assert.deepStrictEqual({
			title: state.title,
			messages: state.turns.map(turn => turn.message.text),
		}, {
			title: 'Renamed Peer',
			messages: ['/rename Renamed Peer'],
		});
	}, config.supportsMultipleChats);

	hostOnlyTest(context, 'empty peer rename command leaves the peer title unchanged', async function () {
		const { sessionUri } = await createSession('local-empty-rename');
		const peer = await createPeer(sessionUri, 'peer');
		await rename(peer, 'Original Peer');
		await context.client.call<SubscribeResult>('subscribe', { channel: peer });

		await driveTurn(peer, 'peer-empty-rename', '/rename', 2);

		assert.strictEqual((await chatState(peer)).title, 'Original Peer');
	}, config.supportsMultipleChats);

	hostOnlyTest(context, 'failing peer bang command records a failed terminal tool call', async function () {
		const { sessionUri } = await createSession('local-bang-failure');
		const peer = await createPeer(sessionUri, 'peer');
		await context.client.call<SubscribeResult>('subscribe', { channel: peer });

		await driveTurn(peer, 'peer-bang-failure', '!node -e "process.exit(7)"', 1);

		const toolCalls = (await chatState(peer)).turns.flatMap(turn => turn.responseParts)
			.filter(part => part.kind === ResponsePartKind.ToolCall)
			.map(part => part.toolCall);
		assert.ok(toolCalls.some(toolCall => toolCall.status === 'completed' && !toolCall.success));
	}, config.supportsMultipleChats);

	providerTest('peer chat reads a file from the parent workspace', async function () {
		const { sessionUri, workspace } = await createSession('read-file');
		const file = join(workspace, 'peer-note.txt');
		writeFileSync(file, 'PEER_FILE_VALUE');
		const peer = await createPeer(sessionUri, 'peer');
		await context.client.call<SubscribeResult>('subscribe', { channel: peer });

		const response = await driveTurn(peer, 'peer-read', `Read the file at ${file} and reply with its exact contents only.`, 1);

		assert.match(response, /PEER_FILE_VALUE/);
	});

	providerTest('peer chat reads a file from a nested directory', async function () {
		const { sessionUri, workspace } = await createSession('read-nested-file');
		mkdirSync(join(workspace, 'nested'));
		const file = join(workspace, 'nested', 'peer.txt');
		writeFileSync(file, 'PEER_NESTED_READ');
		const peer = await createPeer(sessionUri, 'peer');
		await context.client.call<SubscribeResult>('subscribe', { channel: peer });

		const response = await driveTurn(peer, 'peer-read-nested', `Read the file at ${file} and reply with its exact contents only.`, 1);

		assert.match(response, /PEER_NESTED_READ/);
	});

	providerTest('peer chat creates a file in the parent workspace', async function () {
		const { sessionUri, workspace } = await createSession('create-file');
		const file = join(workspace, 'peer-created.txt');
		const peer = await createPeer(sessionUri, 'peer');
		await context.client.call<SubscribeResult>('subscribe', { channel: peer });

		await driveTurn(peer, 'peer-create', `Create the file at ${file} containing exactly PEER_CREATED.`, 1);

		assert.strictEqual(readFileSync(file, 'utf8'), 'PEER_CREATED');
	});

	// Copilot's fixture uses a POSIX shell for this mutation.
	providerTest('peer chat edits an existing workspace file', async function () {
		const { sessionUri, workspace } = await createSession('edit-file');
		const file = join(workspace, 'peer-edit.txt');
		writeFileSync(file, 'BEFORE_PEER');
		const peer = await createPeer(sessionUri, 'peer');
		await context.client.call<SubscribeResult>('subscribe', { channel: peer });

		await driveTurn(peer, 'peer-edit', `Replace the complete contents of ${file} with AFTER_PEER.`, 1);

		assert.strictEqual(readFileSync(file, 'utf8').trim(), 'AFTER_PEER');
	}, config.supportsMultipleChats && (config.provider !== 'copilotcli' || shellToolReplayEnabled));

	// Copilot's fixture uses a POSIX shell for this mutation.
	providerTest('peer chat creates a file in a nested directory', async function () {
		const { sessionUri, workspace } = await createSession('nested-create');
		const file = join(workspace, 'peer-output', 'report.txt');
		const peer = await createPeer(sessionUri, 'peer');
		await context.client.call<SubscribeResult>('subscribe', { channel: peer });

		await driveTurn(peer, 'peer-nested-create', `Create the file at ${file} containing exactly PEER_NESTED.`, 1);

		assert.strictEqual(readFileSync(file, 'utf8'), 'PEER_NESTED');
	}, config.supportsMultipleChats && (config.provider !== 'copilotcli' || shellToolReplayEnabled));

	providerTest('peer chat handles a missing workspace file without an error', async function () {
		const { sessionUri, workspace } = await createSession('missing-file');
		const file = join(workspace, 'peer-missing.txt');
		const peer = await createPeer(sessionUri, 'peer');
		await context.client.call<SubscribeResult>('subscribe', { channel: peer });

		const response = await driveTurn(peer, 'peer-missing', `Try to read ${file}. If it does not exist, reply exactly "missing".`, 1);

		assert.match(response, /missing/i);
	});

	providerTest('peer chat reads a filename containing spaces', async function () {
		const { sessionUri, workspace } = await createSession('spaces');
		const file = join(workspace, 'peer file.txt');
		writeFileSync(file, 'PEER_SPACED');
		const peer = await createPeer(sessionUri, 'peer');
		await context.client.call<SubscribeResult>('subscribe', { channel: peer });

		const response = await driveTurn(peer, 'peer-spaces', `Read the file at ${file} and reply with its exact contents only.`, 1);

		assert.match(response, /PEER_SPACED/);
	});

	providerTest('two peer chats write distinct workspace files', async function () {
		const { sessionUri, workspace } = await createSession('two-writers');
		const firstFile = join(workspace, 'first-peer.txt');
		const secondFile = join(workspace, 'second-peer.txt');
		const first = await createPeer(sessionUri, 'first');
		const second = await createPeer(sessionUri, 'second');
		await context.client.call<SubscribeResult>('subscribe', { channel: first });
		await context.client.call<SubscribeResult>('subscribe', { channel: second });

		await driveTurn(first, 'first-write', `Create the file at ${firstFile} containing exactly FIRST_PEER.`, 1);
		await driveTurn(second, 'second-write', `Create the file at ${secondFile} containing exactly SECOND_PEER.`, 10);

		assert.deepStrictEqual({
			first: readFileSync(firstFile, 'utf8'),
			second: readFileSync(secondFile, 'utf8'),
		}, {
			first: 'FIRST_PEER',
			second: 'SECOND_PEER',
		});
	});

	// Claude's shared SDK process loses its `host` MCP server after the preceding peer-lifecycle sequence.
	providerTest('fresh peer chat does not inherit default chat context', async function () {
		const { sessionUri, defaultChatUri } = await createSession('fresh-context');
		await driveTurn(defaultChatUri, 'default-secret', 'Remember the code word DEFAULTSECRET. Reply exactly "ready".', 1);
		const peer = await createPeer(sessionUri, 'peer');
		await context.client.call<SubscribeResult>('subscribe', { channel: peer });

		await driveTurn(peer, 'peer-fresh-context', 'Reply exactly "fresh".', 10);
		const messages = observedModelMessages(context.observedModelRequestBodies.at(-1) ?? '');

		assert.strictEqual(messages.some(message => message.content.includes('DEFAULTSECRET')), false);
	}, config.supportsMultipleChats && config.provider !== 'claude');

	providerTest('side chat receives bounded source context without copied history', async function () {
		const { sessionUri, defaultChatUri } = await createSession('side-context');
		await driveTurn(defaultChatUri, 'turn-source', 'Remember the exact token SIDECHAT42 for a later question. Reply with exactly "ready".', 1);

		const sideChatUri = await createPeer(sessionUri, 'side', {
			kind: ChatSourceKind.SideChat,
			chat: defaultChatUri,
			turnId: 'turn-source',
		});
		await context.client.call<SubscribeResult>('subscribe', { channel: sideChatUri });

		const response = await driveTurn(sideChatUri, 'turn-side', 'What exact token did I ask you to remember? Reply with only the token.', 2);
		const [sourceState, sideState, session] = await Promise.all([
			chatState(defaultChatUri),
			chatState(sideChatUri),
			sessionState(sessionUri),
		]);

		assert.deepStrictEqual({
			responseIncludesCode: /SIDECHAT42/i.test(response),
			sourceTurnCount: sourceState.turns.length,
			sideTurnCount: sideState.turns.length,
			origin: session.chats.find(chat => chat.resource === sideChatUri)?.origin,
			firstMessage: sideState.turns[0]?.message.text,
			firstAttachments: sideState.turns[0]?.message.attachments ?? [],
		}, {
			responseIncludesCode: true,
			sourceTurnCount: 1,
			sideTurnCount: 1,
			origin: { kind: ChatOriginKind.SideChat, chat: defaultChatUri, turnId: 'turn-source' },
			firstMessage: 'What exact token did I ask you to remember? Reply with only the token.',
			firstAttachments: [],
		});
	}, config.supportsMultipleChats && !!config.supportsSideChats);

	providerTest('two peer chats keep independent provider contexts', async function () {
		const { sessionUri } = await createSession('two-contexts');
		const first = await createPeer(sessionUri, 'first');
		const second = await createPeer(sessionUri, 'second');
		await context.client.call<SubscribeResult>('subscribe', { channel: first });
		await context.client.call<SubscribeResult>('subscribe', { channel: second });
		await driveTurn(first, 'first-context', 'Remember the code word ALPHA_PEER. Reply exactly "ready".', 1);
		await driveTurn(second, 'second-context', 'Remember the code word BETA_PEER. Reply exactly "ready".', 10);

		await driveTurn(first, 'first-followup', 'Reply exactly "first".', 20);
		const firstMessages = observedModelMessages(context.observedModelRequestBodies.at(-1) ?? '');
		await driveTurn(second, 'second-followup', 'Reply exactly "second".', 30);
		const secondMessages = observedModelMessages(context.observedModelRequestBodies.at(-1) ?? '');

		assert.deepStrictEqual({
			firstHasAlpha: firstMessages.some(message => message.content.includes('ALPHA_PEER')),
			firstHasBeta: firstMessages.some(message => message.content.includes('BETA_PEER')),
			secondHasBeta: secondMessages.some(message => message.content.includes('BETA_PEER')),
			secondHasAlpha: secondMessages.some(message => message.content.includes('ALPHA_PEER')),
		}, {
			firstHasAlpha: true,
			firstHasBeta: false,
			secondHasBeta: true,
			secondHasAlpha: false,
		});
	});

	providerTest('peer provider context survives unsubscribe and resubscribe', async function () {
		const { sessionUri } = await createSession('resume-context');
		const peer = await createPeer(sessionUri, 'peer');
		await context.client.call<SubscribeResult>('subscribe', { channel: peer });
		await driveTurn(peer, 'peer-resume-1', 'Remember the code word RESUME_PEER. Reply exactly "ready".', 1);
		context.client.notify('unsubscribe', { channel: peer });
		await context.client.call<SubscribeResult>('subscribe', { channel: peer });

		await driveTurn(peer, 'peer-resume-2', 'Reply exactly "resumed".', 10);
		const messages = observedModelMessages(context.observedModelRequestBodies.at(-1) ?? '');

		assert.ok(messages.some(message => message.content.includes('RESUME_PEER')));
	});

	providerTest('recreated peer chat starts with fresh provider context', async function () {
		const { sessionUri } = await createSession('reset-context');
		const peer = await createPeer(sessionUri, 'peer');
		await context.client.call<SubscribeResult>('subscribe', { channel: peer });
		await driveTurn(peer, 'peer-old-context', 'Remember the code word OLD_PEER. Reply exactly "ready".', 1);
		await context.client.call('disposeChat', { channel: peer }, 30_000);
		await createPeer(sessionUri, 'peer');
		await context.client.call<SubscribeResult>('subscribe', { channel: peer });

		await driveTurn(peer, 'peer-new-context', 'Reply exactly "new".', 10);
		const messages = observedModelMessages(context.observedModelRequestBodies.at(-1) ?? '');

		assert.strictEqual(messages.some(message => message.content.includes('OLD_PEER')), false);
	});

	forkProviderTest('unknown-turn fork does not inherit source provider context', async function () {
		const { sessionUri, defaultChatUri } = await createSession('unknown-fork-context');
		await driveTurn(defaultChatUri, 'source-secret', 'Remember the code word SOURCE_SECRET. Reply exactly "ready".', 1);
		const peer = await createPeer(sessionUri, 'fork', { kind: ChatSourceKind.Fork, chat: defaultChatUri, turnId: 'missing-turn' });
		await context.client.call<SubscribeResult>('subscribe', { channel: peer });

		await driveTurn(peer, 'fresh-fork-turn', 'Reply exactly "fresh".', 10);
		const messages = observedModelMessages(context.observedModelRequestBodies.at(-1) ?? '');

		assert.strictEqual(messages.some(message => message.content.includes('SOURCE_SECRET')), false);
	});

	providerTest('peer simple attachment reaches the provider request', async function () {
		const { sessionUri } = await createSession('simple-attachment');
		const peer = await createPeer(sessionUri, 'peer');
		await context.client.call<SubscribeResult>('subscribe', { channel: peer });
		const attachments: MessageAttachment[] = [{
			type: MessageAttachmentKind.Simple,
			label: 'peer-note.txt',
			displayKind: 'document',
			modelRepresentation: 'PEER_SIMPLE_ATTACHMENT',
		}];

		await driveTurn(peer, 'peer-simple-attachment', 'Reply exactly "attachment".', 1, attachments);

		assert.ok((context.observedModelRequestBodies.at(-1) ?? '').includes('PEER_SIMPLE_ATTACHMENT'));
	});

	providerTest('peer simple attachment without a model representation is omitted from the provider request', async function () {
		const { sessionUri } = await createSession('simple-attachment-omitted');
		const peer = await createPeer(sessionUri, 'peer');
		await context.client.call<SubscribeResult>('subscribe', { channel: peer });
		const attachments: MessageAttachment[] = [{
			type: MessageAttachmentKind.Simple,
			label: 'PEER_OMITTED_ATTACHMENT',
		}];

		await driveTurn(peer, 'peer-simple-attachment-omitted', 'Reply exactly "attachment".', 1, attachments);

		assert.strictEqual((context.observedModelRequestBodies.at(-1) ?? '').includes('PEER_OMITTED_ATTACHMENT'), false);
	});

	providerTest('peer multiple simple attachments reach the provider request', async function () {
		const { sessionUri } = await createSession('multiple-attachments');
		const peer = await createPeer(sessionUri, 'peer');
		await context.client.call<SubscribeResult>('subscribe', { channel: peer });
		const attachments: MessageAttachment[] = [
			{
				type: MessageAttachmentKind.Simple,
				label: 'first',
				modelRepresentation: 'PEER_FIRST_ATTACHMENT',
			},
			{
				type: MessageAttachmentKind.Simple,
				label: 'second',
				modelRepresentation: 'PEER_SECOND_ATTACHMENT',
			},
		];

		await driveTurn(peer, 'peer-multiple-attachments', 'Reply exactly "attachments".', 1, attachments);

		const request = context.observedModelRequestBodies.at(-1) ?? '';
		assert.ok(request.includes('PEER_FIRST_ATTACHMENT') && request.includes('PEER_SECOND_ATTACHMENT'));
	});

	providerTest('peer resource attachment reaches the provider request', async function () {
		const { sessionUri, workspace } = await createSession('resource-attachment');
		const file = join(workspace, 'peer-resource.txt');
		writeFileSync(file, 'PEER_RESOURCE_ATTACHMENT');
		const peer = await createPeer(sessionUri, 'peer');
		await context.client.call<SubscribeResult>('subscribe', { channel: peer });
		const attachments: MessageAttachment[] = [{
			type: MessageAttachmentKind.Resource,
			uri: URI.file(file).toString(),
			label: 'peer-resource.txt',
			displayKind: 'document',
		}];

		await driveTurn(peer, 'peer-resource-attachment', 'Reply exactly "attachment".', 1, attachments);

		assert.ok((context.observedModelRequestBodies.at(-1) ?? '').includes('peer-resource.txt'));
	});

	providerTest('peer resource selection attachment includes its line reference', async function () {
		const { sessionUri, workspace } = await createSession('resource-selection');
		const file = join(workspace, 'peer-selection.txt');
		writeFileSync(file, 'first\nsecond\nthird');
		const peer = await createPeer(sessionUri, 'peer');
		await context.client.call<SubscribeResult>('subscribe', { channel: peer });
		const attachments: MessageAttachment[] = [{
			type: MessageAttachmentKind.Resource,
			uri: URI.file(file).toString(),
			label: 'peer-selection.txt',
			displayKind: 'selection',
			selection: {
				range: {
					start: { line: 1, character: 0 },
					end: { line: 1, character: 6 },
				},
			},
		}];

		await driveTurn(peer, 'peer-resource-selection', 'Reply exactly "selection".', 1, attachments);

		const request = context.observedModelRequestBodies.at(-1) ?? '';
		assert.ok(request.includes('peer-selection.txt') && (request.includes('peer-selection.txt:2') || request.includes('(line 2)')));
	});
}
