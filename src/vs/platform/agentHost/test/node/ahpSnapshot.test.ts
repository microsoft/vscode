/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { ActionType } from '../../common/state/sessionActions.js';
import { ResponsePartKind } from '../../common/state/sessionState.js';
import { AhpSnapshotRecorder } from './e2e/harness/ahpSnapshot.js';

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
});
