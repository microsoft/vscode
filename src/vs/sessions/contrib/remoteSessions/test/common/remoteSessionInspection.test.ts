/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { buildDefaultChatUri, ChatState, createChatState, createErrorResponsePart, MessageKind, ResponsePartKind, SessionStatus, ToolCallStatus, Turn, TurnState } from '../../../../../platform/agentHost/common/state/sessionState.js';
import { maxRemoteSessionResponseLength, parseGetRemoteSessionOptions, remoteSessionSnapshot } from '../../common/remoteSessionInspection.js';

suite('RemoteSessionInspection', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	function chat(overrides: Partial<ChatState> = {}): ChatState {
		return {
			...createChatState({
				resource: buildDefaultChatUri('copilotcli:/test'),
				title: 'Check repository',
				status: SessionStatus.Idle,
				modifiedAt: '2026-01-01T00:00:00.000Z',
			}),
			...overrides,
		};
	}

	function turn(overrides: Partial<Turn> = {}): Turn {
		return {
			id: 'turn-1',
			startedAt: '2026-01-01T00:00:00.000Z',
			message: { text: 'Private task text', origin: { kind: MessageKind.User } },
			responseParts: [{ kind: ResponsePartKind.Markdown, id: 'answer', content: 'Repository exists.' }],
			usage: undefined,
			state: TurnState.Complete,
			...overrides,
		};
	}

	test('accepts only a non-empty session reference', () => {
		assert.deepStrictEqual(parseGetRemoteSessionOptions({ session: ' remote-host-copilotcli:/test#peer ' }), {
			session: 'remote-host-copilotcli:/test#peer',
		});
		for (const input of [undefined, null, [], {}, { session: '' }, { session: '  ' }, { session: 1 }, { session: 'ref', detail: 'full' }]) {
			assert.throws(() => parseGetRemoteSessionOptions(input));
		}
	});

	test('returns the latest response without prompts, reasoning or tool contents', () => {
		const state = chat({
			turns: [turn({ id: 'old' }), turn({
				responseParts: [
					{ kind: ResponsePartKind.Markdown, id: 'a', content: 'Repository ' },
					{ kind: ResponsePartKind.Reasoning, id: 'reasoning', content: 'Private reasoning' },
					{ kind: ResponsePartKind.ToolCall, toolCall: { toolCallId: 'tool-1', toolName: 'private_tool', displayName: 'Private tool', status: ToolCallStatus.Streaming } },
					{ kind: ResponsePartKind.Markdown, id: 'b', content: 'exists.' },
				],
			})],
		});
		assert.deepStrictEqual(remoteSessionSnapshot(state), {
			status: 'completed',
			title: 'Check repository',
			queuedMessages: 0,
			hasSteeringMessage: false,
			latestTurn: { id: 'turn-1', status: 'completed', response: 'Repository exists.', error: null, truncated: false },
		});
	});

	test('a running turn never reuses a previous completed answer', () => {
		const state = chat({
			status: SessionStatus.InProgress,
			turns: [turn()],
			activeTurn: {
				id: 'turn-2', startedAt: '2026-01-01T00:01:00.000Z',
				message: { text: 'Follow-up', origin: { kind: MessageKind.Agent } },
				responseParts: [], usage: undefined,
			},
		});
		assert.deepStrictEqual(remoteSessionSnapshot(state).latestTurn, {
			id: 'turn-2', status: 'running', response: '', error: null, truncated: false,
		});
	});

	test('distinguishes idle, queued, working, needs-input, completed, cancelled and failed states', () => {
		const activeTurn = { ...turn(), startedAt: '2026-01-01T00:00:00.000Z' };
		const pending = { id: 'pending', message: { text: 'Next', origin: { kind: MessageKind.User } } };
		assert.deepStrictEqual([
			chat(),
			chat({ queuedMessages: [pending] }),
			chat({ steeringMessage: pending }),
			chat({ activeTurn, status: SessionStatus.InProgress | SessionStatus.IsRead }),
			chat({ activeTurn, status: SessionStatus.InputNeeded | SessionStatus.IsRead | SessionStatus.IsArchived }),
			chat({ turns: [turn()], status: SessionStatus.Idle | SessionStatus.IsArchived }),
			chat({ turns: [turn({ state: TurnState.Cancelled })] }),
			chat({ turns: [turn({ state: TurnState.Error })] }),
			chat({ status: SessionStatus.Error }),
			chat({ turns: [turn({ state: TurnState.Error })], activeTurn, status: SessionStatus.InProgress }),
		].map(state => remoteSessionSnapshot(state).status), [
			'idle', 'queued', 'queued', 'running', 'needsInput', 'completed', 'cancelled', 'failed', 'failed', 'running',
		]);
	});

	test('reports queue metadata separately from the latest completed turn', () => {
		const pending = { id: 'pending', message: { text: 'Next', origin: { kind: MessageKind.User } } };
		const snapshot = remoteSessionSnapshot(chat({ queuedMessages: [pending, { ...pending, id: 'other' }], steeringMessage: pending, turns: [turn()] }));
		assert.deepStrictEqual({
			status: snapshot.status, queuedMessages: snapshot.queuedMessages,
			hasSteeringMessage: snapshot.hasSteeringMessage, latestTurnStatus: snapshot.latestTurn?.status,
		}, { status: 'queued', queuedMessages: 2, hasSteeringMessage: true, latestTurnStatus: 'completed' });
	});

	test('returns turn errors without presenting a failed task as completed', () => {
		const snapshot = remoteSessionSnapshot(chat({
			turns: [turn({
				state: TurnState.Error,
				responseParts: [createErrorResponsePart({ errorType: 'testFailure', message: 'Authentication required' }, true)],
			})]
		}));
		assert.deepStrictEqual(snapshot.latestTurn, {
			id: 'turn-1', status: 'failed', response: '',
			error: { type: 'testFailure', message: 'Authentication required', resumable: true },
			truncated: false,
		});
	});

	test('bounds response and error text and reports exact truncation thresholds', () => {
		const lengths = [maxRemoteSessionResponseLength - 1, maxRemoteSessionResponseLength, maxRemoteSessionResponseLength + 1];
		const snapshots = lengths.map(length => remoteSessionSnapshot(chat({
			turns: [turn({
				state: TurnState.Error,
				responseParts: [
					{ kind: ResponsePartKind.Markdown, id: 'a', content: 'a'.repeat(length) },
					createErrorResponsePart({ errorType: 'testFailure', message: 'e'.repeat(length) }),
				],
			})],
		})).latestTurn);
		assert.deepStrictEqual(snapshots.map(snapshot => ({
			responseLength: snapshot?.response.length, errorLength: snapshot?.error?.message.length, truncated: snapshot?.truncated,
		})), lengths.map(length => ({
			responseLength: Math.min(length, maxRemoteSessionResponseLength),
			errorLength: Math.min(length, maxRemoteSessionResponseLength),
			truncated: length > maxRemoteSessionResponseLength,
		})));
	});
});
