/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise } from '../../../../base/common/async.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { ActionType } from '../../common/state/sessionActions.js';
import type { AhpNotification } from '../../common/state/sessionProtocol.js';
import { ResponsePartKind } from '../../common/state/sessionState.js';
import { AhpSnapshotRecorder, waitForChatUnreadAfterTurn, waitForFinalServerMessage } from './e2e/harness/ahpSnapshot.js';

suite('AhpSnapshotRecorder', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('omits tool success by provider name before snapshot normalization', () => {
		const recorder = new AhpSnapshotRecorder();
		recorder.record('s2c', {
			method: 'action',
			params: {
				channel: 'ahp-chat://session/chat',
				action: {
					type: ActionType.ChatToolCallStart,
					turnId: 'turn-1',
					toolCallId: 'tool-1',
					toolName: 'bash',
					displayName: 'Run command',
				},
			},
		});

		recorder.record('s2c', {
			method: 'action',
			params: {
				channel: 'ahp-chat://session/chat',
				action: {
					type: ActionType.ChatToolCallComplete,
					turnId: 'turn-1',
					toolCallId: 'tool-1',
					result: { success: false },
				},
			},
		});

		const snapshot = recorder.serialize({
			profile: 'behavior',
			omitToolCallSuccessForToolNames: ['bash'],
		});

		assert.deepStrictEqual({
			normalizedToolName: snapshot.includes('toolName: ${shell}'),
			includesSuccess: snapshot.includes('success:'),
		}, {
			normalizedToolName: true,
			includesSuccess: false,
		});
	});

	test('waits for an unread action on the completed chat after the turn outcome', async () => {
		const unread = new DeferredPromise<AhpNotification>();
		const chat = 'ahp-chat://session/chat';
		const matching: boolean[] = [];
		const client = {
			waitForNotification: (predicate: (notification: AhpNotification) => boolean) => {
				for (const [channel, serverSeq, isRead] of [
					[chat, 9, false],
					['ahp-chat://session/other', 11, false],
					[chat, 12, true],
					[chat, 13, false],
				] as const) {
					matching.push(predicate({
						jsonrpc: '2.0',
						method: 'action',
						params: { channel, serverSeq, origin: undefined, action: { type: ActionType.ChatIsReadChanged, isRead } },
					}));
				}
				return unread.p;
			},
		};
		let complete = false;
		const wait = waitForChatUnreadAfterTurn(client, chat, 10).then(() => { complete = true; });
		const completeBeforeUnread = complete;
		unread.complete({ jsonrpc: '2.0', method: 'action', params: { channel: chat, serverSeq: 13, origin: undefined, action: { type: ActionType.ChatIsReadChanged, isRead: false } } });
		await wait;

		assert.deepStrictEqual({ matching, completeBeforeUnread, complete }, {
			matching: [false, false, false, true],
			completeBeforeUnread: false,
			complete: true,
		});
	});

	test('canonicalizes opted-in server action interleaving across channels', () => {
		const parent = { channel: 'ahp-chat://session/parent', turnId: 'parent-turn' } as const;
		const child = { channel: 'ahp-chat://session/child', turnId: 'child-turn' } as const;
		const turns = [parent, child];
		type ScheduledAction = { readonly turn: (typeof turns)[number]; readonly type: 'response' | 'complete' };
		const serialize = (schedule: readonly ScheduledAction[], canonicalize: boolean): string => {
			const recorder = new AhpSnapshotRecorder();
			for (const turn of turns) {
				recorder.record('s2c', {
					method: 'action',
					params: {
						channel: turn.channel,
						action: {
							type: ActionType.ChatTurnStarted,
							turnId: turn.turnId,
							message: { text: turn.turnId, origin: { kind: 'user' } },
						},
					},
				});
			}
			for (const scheduled of schedule) {
				recorder.record('s2c', {
					method: 'action',
					params: {
						channel: scheduled.turn.channel,
						action: scheduled.type === 'response' ? {
							type: ActionType.ChatResponsePart,
							turnId: scheduled.turn.turnId,
							part: {
								id: `${scheduled.turn.turnId}-response`,
								kind: ResponsePartKind.Markdown,
								content: scheduled.turn.turnId,
							},
						} : {
							type: ActionType.ChatTurnComplete,
							turnId: scheduled.turn.turnId,
						},
					},
				});
			}
			return recorder.serialize(canonicalize ? {
				orderIndependentActionTypes: [ActionType.ChatTurnComplete],
			} : undefined);
		};

		const recordedOrder: ScheduledAction[] = [
			{ turn: child, type: 'response' },
			{ turn: child, type: 'complete' },
			{ turn: parent, type: 'response' },
			{ turn: parent, type: 'complete' },
		];
		const crossChannelReorder: ScheduledAction[] = [
			{ turn: parent, type: 'response' },
			{ turn: parent, type: 'complete' },
			{ turn: child, type: 'response' },
			{ turn: child, type: 'complete' },
		];
		const sameChannelReorder: ScheduledAction[] = [
			{ turn: child, type: 'complete' },
			{ turn: child, type: 'response' },
			{ turn: parent, type: 'response' },
			{ turn: parent, type: 'complete' },
		];
		assert.deepStrictEqual({
			exactCrossChannelOrderMatches: serialize(recordedOrder, false) === serialize(crossChannelReorder, false),
			canonicalCrossChannelOrderMatches: serialize(recordedOrder, true) === serialize(crossChannelReorder, true),
			canonicalPerChannelOrderMatches: serialize(recordedOrder, true) === serialize(sameChannelReorder, true),
		}, {
			exactCrossChannelOrderMatches: false,
			canonicalCrossChannelOrderMatches: true,
			canonicalPerChannelOrderMatches: false,
		});
	});

	test('a snapshot ending in read state waits for its turn completion and subsequent unread state', async () => {
		const chat = 'ahp-chat://session/chat';
		const turnId = 'completed-turn';
		const notifications: AhpNotification[] = [
			{ jsonrpc: '2.0', method: 'action', params: { channel: chat, serverSeq: 9, origin: undefined, action: { type: ActionType.ChatIsReadChanged, isRead: false } } },
			{ jsonrpc: '2.0', method: 'action', params: { channel: chat, serverSeq: 10, origin: undefined, action: { type: ActionType.ChatTurnComplete, turnId: 'previous-turn', duration: 0 } } },
			{ jsonrpc: '2.0', method: 'action', params: { channel: chat, serverSeq: 11, origin: undefined, action: { type: ActionType.ChatIsReadChanged, isRead: true } } },
			{ jsonrpc: '2.0', method: 'action', params: { channel: chat, serverSeq: 12, origin: undefined, action: { type: ActionType.ChatTurnComplete, turnId, duration: 0 } } },
			{ jsonrpc: '2.0', method: 'action', params: { channel: chat, serverSeq: 13, origin: undefined, action: { type: ActionType.ChatIsReadChanged, isRead: true } } },
			{ jsonrpc: '2.0', method: 'action', params: { channel: chat, serverSeq: 14, origin: undefined, action: { type: ActionType.ChatIsReadChanged, isRead: false } } },
		];
		const matched: number[] = [];
		const client = {
			waitForNotification: async (predicate: (notification: AhpNotification) => boolean) => {
				const notification = notifications.find(predicate);
				assert.ok(notification);
				if (notification.method === 'action') {
					matched.push(notification.params.serverSeq);
				}
				return notification;
			},
			takeReplayError: () => undefined,
		};

		await waitForFinalServerMessage(client, [
			{ channel: '${chat_0}', action: { type: ActionType.ChatTurnComplete, turnId: '${turn_0}' } },
			{ channel: '${chat_0}', action: { type: ActionType.ChatIsReadChanged } },
		], new Set(), new Map([['${chat_0}', chat], ['${turn_0}', turnId]]));

		assert.deepStrictEqual(matched, [12, 14]);
	});
});
