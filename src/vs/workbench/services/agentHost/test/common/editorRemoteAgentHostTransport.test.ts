/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Emitter } from '../../../../../base/common/event.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { AgentHostClientConnectionKind, AgentHostTransportKind } from '../../../../../platform/agentHost/common/agentHostTelemetry.js';
import { ActionType, type ActionEnvelope, type StateAction } from '../../../../../platform/agentHost/common/state/protocol/actions.js';
import { MessageKind, SessionLifecycle, SessionStatus, TerminalClaimKind, type ChatSummary, type SessionSummary, type Snapshot } from '../../../../../platform/agentHost/common/state/protocol/state.js';
import { isJsonRpcNotification, ReconnectResultType, type AhpRequest, type AhpServerNotification, type AhpSuccessResponse, type ProtocolMessage } from '../../../../../platform/agentHost/common/state/sessionProtocol.js';
import { SESSION_META_FOLDER_PICKER_KEY } from '../../../../../platform/agentHost/common/state/sessionState.js';
import { IClientTransport } from '../../../../../platform/agentHost/common/state/sessionTransport.js';
import { EditorRemoteAgentHostTransport } from '../../common/editorRemoteAgentHostTransport.js';

const authority = 'wsl+ubuntu';
const remoteDirectory = 'vscode-remote://wsl%2Bubuntu/home/user/project?key%3Dvalue#folder';
const fileDirectory = 'file:///home/user/project?key%3Dvalue#folder';
const remoteReplacement = 'vscode-remote://wsl%2Bubuntu/home/user/replacement?key%3Dvalue#folder';
const fileReplacement = 'file:///home/user/replacement?key%3Dvalue#folder';
const otherRemoteDirectory = 'vscode-remote://ssh-remote%2Bother/home/user/project';
const session = 'ahp-session:/session';
const chat = 'ahp-chat:/chat';
const timestamp = '2026-08-28T00:00:00.000Z';
const opaqueText = `Keep ${remoteDirectory} and ${fileDirectory} verbatim`;

class TestClientTransport extends Disposable implements IClientTransport {
	readonly clientConnectionKind = AgentHostClientConnectionKind.WSL;
	readonly transportKind = AgentHostTransportKind.MessagePort;
	readonly messages: ProtocolMessage[] = [];
	readonly messageEmitter = this._register(new Emitter<ProtocolMessage>());
	readonly closeEmitter = this._register(new Emitter<void>());
	readonly onMessage = this.messageEmitter.event;
	readonly onClose = this.closeEmitter.event;
	connected = false;
	disposed = false;

	async connect(): Promise<void> {
		this.connected = true;
	}

	send(message: ProtocolMessage): void {
		this.messages.push(message);
	}

	override dispose(): void {
		this.disposed = true;
		super.dispose();
	}
}

function folderPickerMeta(primary: string) {
	return {
		[SESSION_META_FOLDER_PICKER_KEY]: { hidden: true, primary },
		opaque: { workingDirectories: [fileDirectory, remoteDirectory], text: opaqueText },
	};
}

function chatSummary(workingDirectories: string[]): ChatSummary {
	return { resource: chat, title: opaqueText, status: SessionStatus.Idle, modifiedAt: timestamp, workingDirectories };
}

function sessionSummary(workingDirectories: string[]): SessionSummary {
	return {
		resource: session, provider: 'copilot', title: opaqueText, status: SessionStatus.Idle,
		createdAt: timestamp, modifiedAt: timestamp, workingDirectories,
		_meta: folderPickerMeta(workingDirectories[0]),
	};
}

function snapshots(workingDirectories: string[]): Snapshot[] {
	return [
		{
			resource: session, fromSeq: 10,
			state: {
				provider: 'copilot', title: opaqueText, status: SessionStatus.Idle,
				lifecycle: SessionLifecycle.Ready, activeClients: [], workingDirectories,
				chats: [chatSummary(workingDirectories)],
				config: { schema: { type: 'object', properties: {} }, values: { workingDirectory: fileDirectory, text: opaqueText } },
				_meta: folderPickerMeta(workingDirectories[0]),
			},
		},
		{
			resource: chat, fromSeq: 11,
			state: {
				...chatSummary(workingDirectories), turns: [],
				draft: { text: opaqueText, origin: { kind: MessageKind.User } },
			},
		},
	];
}

function directoryActions(directory: string, replacement: string): StateAction[] {
	return [
		{ type: ActionType.SessionWorkingDirectorySet, directory },
		{ type: ActionType.SessionWorkingDirectoryRemoved, directory },
		{ type: ActionType.SessionWorkingDirectoryReplaced, directory, replacement },
		{ type: ActionType.ChatWorkingDirectorySet, directory },
		{ type: ActionType.ChatWorkingDirectoryRemoved, directory },
		{ type: ActionType.SessionChatAdded, summary: chatSummary([directory]) },
		{ type: ActionType.SessionChatUpdated, chat, changes: { workingDirectories: [directory], title: opaqueText } },
		{ type: ActionType.SessionMetaChanged, _meta: folderPickerMeta(directory) },
		{ type: ActionType.SessionTitleChanged, title: opaqueText },
	];
}

function envelope(action: StateAction, index: number): ActionEnvelope {
	return {
		channel: action.type.startsWith('chat/') ? chat : session,
		action, serverSeq: index + 1, origin: { clientId: 'client', clientSeq: index + 1 },
	};
}

suite('EditorRemoteAgentHostTransport', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function createTransport(remoteAuthority = authority) {
		const underlying = store.add(new TestClientTransport());
		const transport = store.add(new EditorRemoteAgentHostTransport(underlying, remoteAuthority));
		const received: ProtocolMessage[] = [];
		store.add(transport.onMessage(message => received.push(message)));
		return { underlying, transport, received };
	}

	test('round-trips directory actions when the remote authority contains uppercase characters', () => {
		const { underlying, transport, received } = createTransport('wsl+Ubuntu');
		underlying.messageEmitter.fire({
			jsonrpc: '2.0', method: 'action',
			params: envelope({ type: ActionType.SessionWorkingDirectorySet, directory: fileDirectory }, 0),
		});
		const notification = received[0];
		assert.ok(isJsonRpcNotification(notification) && notification.method === 'action');
		transport.send({
			jsonrpc: '2.0', method: 'dispatchAction',
			params: { channel: session, clientSeq: 1, action: notification.params.action },
		});

		assert.deepStrictEqual(underlying.messages, [{
			jsonrpc: '2.0', method: 'dispatchAction',
			params: { channel: session, clientSeq: 1, action: { type: ActionType.SessionWorkingDirectorySet, directory: fileDirectory } },
		}]);
	});

	test('maps a correlated response once for all listeners', () => {
		const { underlying, transport, received } = createTransport();
		const secondReceived: ProtocolMessage[] = [];
		store.add(transport.onMessage(message => secondReceived.push(message)));
		transport.send({ jsonrpc: '2.0', id: 1, method: 'subscribe', params: { channel: session } });
		underlying.messageEmitter.fire({ jsonrpc: '2.0', id: 1, result: { snapshot: snapshots([fileDirectory])[0] } });

		const expected = [{ jsonrpc: '2.0', id: 1, result: { snapshot: snapshots([remoteDirectory])[0] } }];
		assert.deepStrictEqual({ received, secondReceived }, { received: expected, secondReceived: expected });
	});

	test('maps createSession roots and folder picker metadata without mutating the request', () => {
		const { underlying, transport } = createTransport();
		const request: AhpRequest<'createSession'> = {
			jsonrpc: '2.0', id: 1, method: 'createSession',
			params: {
				channel: session, provider: 'copilot',
				workingDirectories: [remoteDirectory, 'vscode-remote://wsl%2Bubuntu/home/user/second', otherRemoteDirectory, 'file:///local'],
				config: { workingDirectory: remoteDirectory, text: opaqueText },
				_meta: folderPickerMeta(remoteDirectory),
			},
		};
		const original = structuredClone(request);

		transport.send(request);

		assert.deepStrictEqual({ sent: underlying.messages, original: request }, {
			sent: [{
				...original,
				params: {
					...original.params,
					workingDirectories: [fileDirectory, 'file:///home/user/second', otherRemoteDirectory, 'file:///local'],
					_meta: folderPickerMeta(fileDirectory),
				},
			}],
			original,
		});
	});

	test('maps configuration request directories but preserves opaque configuration and query text', () => {
		const { underlying, transport } = createTransport();
		const requests: AhpRequest<'resolveSessionConfig' | 'sessionConfigCompletions'>[] = [
			{
				jsonrpc: '2.0', id: 1, method: 'resolveSessionConfig',
				params: { channel: 'ahp-root://', workingDirectory: remoteDirectory, config: { workingDirectory: remoteDirectory } },
			},
			{
				jsonrpc: '2.0', id: 2, method: 'sessionConfigCompletions',
				params: { channel: 'ahp-root://', workingDirectory: remoteDirectory, property: 'branch', query: opaqueText, config: { text: opaqueText } },
			},
		];
		const original = structuredClone(requests);

		requests.forEach(request => transport.send(request));

		assert.deepStrictEqual({ sent: underlying.messages, original: requests }, {
			sent: original.map(request => ({ ...request, params: { ...request.params, workingDirectory: fileDirectory } })),
			original,
		});
	});

	test('maps createChat roots and createTerminal cwd while preserving initial messages', () => {
		const { underlying, transport } = createTransport();
		const createChat: AhpRequest<'createChat'> = {
			jsonrpc: '2.0', id: 1, method: 'createChat',
			params: {
				channel: session, chat, workingDirectories: [remoteDirectory],
				initialMessage: { text: opaqueText, origin: { kind: MessageKind.User } },
			},
		};
		const createTerminal: AhpRequest<'createTerminal'> = {
			jsonrpc: '2.0', id: 2, method: 'createTerminal',
			params: { channel: 'ahp-terminal:/terminal', cwd: remoteDirectory, claim: { kind: TerminalClaimKind.Client, clientId: 'client' } },
		};
		const original = structuredClone([createChat, createTerminal]);

		transport.send(createChat);
		transport.send(createTerminal);

		assert.deepStrictEqual({ sent: underlying.messages, original: [createChat, createTerminal] }, {
			sent: [
				{ ...createChat, params: { ...createChat.params, workingDirectories: [fileDirectory] } },
				{ ...createTerminal, params: { ...createTerminal.params, cwd: fileDirectory } },
			],
			original,
		});
	});

	test('preserves omitted directories, other authorities, and existing file URIs', () => {
		const { underlying, transport } = createTransport();
		const requests: AhpRequest[] = [
			{ jsonrpc: '2.0', id: 1, method: 'createSession', params: { channel: session } },
			{ jsonrpc: '2.0', id: 2, method: 'createChat', params: { channel: session, chat, workingDirectories: [] } },
			{ jsonrpc: '2.0', id: 3, method: 'resolveSessionConfig', params: { channel: 'ahp-root://' } },
			{ jsonrpc: '2.0', id: 4, method: 'sessionConfigCompletions', params: { channel: 'ahp-root://', property: 'branch' } },
			{ jsonrpc: '2.0', id: 5, method: 'createTerminal', params: { channel: 'ahp-terminal:/terminal', claim: { kind: TerminalClaimKind.Client, clientId: 'client' } } },
			{ jsonrpc: '2.0', id: 6, method: 'resolveSessionConfig', params: { channel: 'ahp-root://', workingDirectory: otherRemoteDirectory } },
			{ jsonrpc: '2.0', id: 7, method: 'sessionConfigCompletions', params: { channel: 'ahp-root://', property: 'branch', workingDirectory: fileDirectory } },
		];
		const original = structuredClone(requests);

		requests.forEach(request => transport.send(request));

		assert.deepStrictEqual({ sent: underlying.messages, original: requests }, { sent: original, original });
	});

	test('maps dispatched session and chat directory actions without changing their envelopes', () => {
		const { underlying, transport } = createTransport();
		const notifications = (directory: string, replacement: string): ProtocolMessage[] => directoryActions(directory, replacement).map((action, index) => ({
			jsonrpc: '2.0', method: 'dispatchAction',
			params: { channel: envelope(action, index).channel, clientSeq: index + 1, action },
		}));
		const input = notifications(remoteDirectory, remoteReplacement);
		const original = structuredClone(input);

		input.forEach(message => transport.send(message));

		assert.deepStrictEqual({ sent: underlying.messages, original: input }, { sent: notifications(fileDirectory, fileReplacement), original });
	});

	test('maps live session and chat directory actions without mutating host messages', () => {
		const { underlying, received } = createTransport();
		const notifications = (directory: string, replacement: string): AhpServerNotification<'action'>[] => directoryActions(directory, replacement).map((action, index) => ({
			jsonrpc: '2.0', method: 'action', params: envelope(action, index),
		}));
		const input = notifications(fileDirectory, fileReplacement);
		const original = structuredClone(input);

		input.forEach(message => underlying.messageEmitter.fire(message));

		assert.deepStrictEqual({ received, original: input }, { received: notifications(remoteDirectory, remoteReplacement), original });
	});

	test('maps subscribe snapshots for sessions and chats and preserves stateless subscriptions', () => {
		const { underlying, transport, received } = createTransport();
		const hostSnapshots = snapshots([fileDirectory, otherRemoteDirectory]);
		const responses: AhpSuccessResponse<'subscribe'>[] = hostSnapshots.map((snapshot, index) => ({
			jsonrpc: '2.0', id: index + 1, result: { snapshot },
		}));
		responses.push({ jsonrpc: '2.0', id: 3, result: {} });
		const original = structuredClone(responses);

		for (const response of responses) {
			transport.send({ jsonrpc: '2.0', id: response.id, method: 'subscribe', params: { channel: response.result.snapshot?.resource ?? 'ahp-otlp:/logs' } });
			underlying.messageEmitter.fire(response);
		}

		assert.deepStrictEqual({ received, original: responses }, {
			received: [
				...snapshots([remoteDirectory, otherRemoteDirectory]).map((snapshot, index) => ({ jsonrpc: '2.0', id: index + 1, result: { snapshot } })),
				{ jsonrpc: '2.0', id: 3, result: {} },
			],
			original,
		});
	});

	test('correlates out-of-order initialize and reconnect snapshot responses by request id', () => {
		const { underlying, transport, received } = createTransport();
		transport.send({
			jsonrpc: '2.0', id: 1, method: 'initialize',
			params: { channel: 'ahp-root://', clientId: 'client', protocolVersions: ['0.7.0'], initialSubscriptions: [session, chat] },
		});
		transport.send({
			jsonrpc: '2.0', id: 2, method: 'reconnect',
			params: { channel: 'ahp-root://', clientId: 'client', lastSeenServerSeq: 0, subscriptions: [session, chat] },
		});
		const responses: AhpSuccessResponse<'initialize' | 'reconnect'>[] = [
			{ jsonrpc: '2.0', id: 2, result: { type: ReconnectResultType.Snapshot, snapshots: snapshots([fileDirectory]) } },
			{ jsonrpc: '2.0', id: 1, result: { protocolVersion: '0.7.0', serverSeq: 11, snapshots: snapshots([fileDirectory]) } },
		];
		const original = structuredClone(responses);

		responses.forEach(response => underlying.messageEmitter.fire(response));

		assert.deepStrictEqual({ received, original: responses }, {
			received: [
				{ jsonrpc: '2.0', id: 2, result: { type: ReconnectResultType.Snapshot, snapshots: snapshots([remoteDirectory]) } },
				{ jsonrpc: '2.0', id: 1, result: { protocolVersion: '0.7.0', serverSeq: 11, snapshots: snapshots([remoteDirectory]) } },
			],
			original,
		});
	});

	test('maps reconnect replay actions and preserves sequence, origin, and missing channels', () => {
		const { underlying, transport, received } = createTransport();
		transport.send({
			jsonrpc: '2.0', id: 1, method: 'reconnect',
			params: { channel: 'ahp-root://', clientId: 'client', lastSeenServerSeq: 0, subscriptions: [session, chat] },
		});
		const response: AhpSuccessResponse<'reconnect'> = {
			jsonrpc: '2.0', id: 1,
			result: { type: ReconnectResultType.Replay, actions: directoryActions(fileDirectory, fileReplacement).map(envelope), missing: ['ahp-session:/missing'] },
		};
		const original = structuredClone(response);

		underlying.messageEmitter.fire(response);

		assert.deepStrictEqual({ received, original: response }, {
			received: [{
				...original,
				result: { ...original.result, actions: directoryActions(remoteDirectory, remoteReplacement).map(envelope) },
			}],
			original,
		});
	});

	test('maps root session notifications and listSessions summaries including folder picker metadata', () => {
		const { underlying, transport, received } = createTransport();
		const messages = (directory: string): ProtocolMessage[] => [
			{ jsonrpc: '2.0', method: 'root/sessionAdded', params: { channel: 'ahp-root://', summary: sessionSummary([directory]) } },
			{
				jsonrpc: '2.0', method: 'root/sessionSummaryChanged',
				params: { channel: 'ahp-root://', session, changes: { workingDirectories: [directory], _meta: folderPickerMeta(directory), title: opaqueText } },
			},
			{ jsonrpc: '2.0', id: 1, result: { items: [sessionSummary([directory])], nextCursor: fileDirectory } },
		];
		const input = messages(fileDirectory);
		const original = structuredClone(input);
		transport.send({ jsonrpc: '2.0', id: 1, method: 'listSessions', params: { channel: 'ahp-root://' } });

		input.forEach(message => underlying.messageEmitter.fire(message));

		assert.deepStrictEqual({ received, original: input }, { received: messages(remoteDirectory), original });
	});

	test('passes through error and unknown responses and consumes response correlation once', () => {
		const { underlying, transport, received } = createTransport();
		transport.send({ jsonrpc: '2.0', id: 1, method: 'subscribe', params: { channel: session } });
		const error: ProtocolMessage = { jsonrpc: '2.0', id: 1, error: { code: -32001, message: opaqueText } };
		const afterError: AhpSuccessResponse<'subscribe'> = { jsonrpc: '2.0', id: 1, result: { snapshot: snapshots([fileDirectory])[0] } };
		const unknown: AhpSuccessResponse<'subscribe'> = { ...afterError, id: 999 };
		transport.send({ jsonrpc: '2.0', id: 2, method: 'subscribe', params: { channel: session } });
		const response: AhpSuccessResponse<'subscribe'> = { ...afterError, id: 2 };

		[error, afterError, unknown, response, response].forEach(message => underlying.messageEmitter.fire(message));

		assert.deepStrictEqual(received, [
			error, afterError, unknown,
			{ ...response, result: { snapshot: snapshots([remoteDirectory])[0] } },
			response,
		]);
	});

	test('delegates connection lifecycle and clears pending requests on close', async () => {
		const { underlying, transport, received } = createTransport();
		let closeCount = 0;
		store.add(transport.onClose(() => closeCount++));
		await transport.connect();
		transport.send({ jsonrpc: '2.0', id: 1, method: 'subscribe', params: { channel: session } });
		underlying.closeEmitter.fire();
		const response: AhpSuccessResponse<'subscribe'> = { jsonrpc: '2.0', id: 1, result: { snapshot: snapshots([fileDirectory])[0] } };
		underlying.messageEmitter.fire(response);
		transport.dispose();

		assert.deepStrictEqual({
			connected: underlying.connected, disposed: underlying.disposed, closeCount, received,
			clientConnectionKind: transport.clientConnectionKind, transportKind: transport.transportKind,
		}, {
			connected: true, disposed: true, closeCount: 1, received: [response],
			clientConnectionKind: AgentHostClientConnectionKind.WSL, transportKind: AgentHostTransportKind.MessagePort,
		});
	});
});
