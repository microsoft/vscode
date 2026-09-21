/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { ActionType } from '../../common/state/sessionActions.js';
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
		const turns = [
			{ channel: 'ahp-chat://session/parent', turnId: 'parent-turn-1' },
			{ channel: 'ahp-chat://session/child', turnId: 'child-turn' },
			{ channel: 'ahp-chat://session/parent', turnId: 'parent-turn-2' },
		] as const;
		const serialize = (completionOrder: readonly (typeof turns)[number][], canonicalize: boolean): string => {
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
			for (const turn of completionOrder) {
				recorder.record('s2c', {
					method: 'action',
					params: {
						channel: turn.channel,
						action: {
							type: ActionType.ChatTurnComplete,
							turnId: turn.turnId,
						},
					},
				});
			}
			return recorder.serialize(canonicalize ? {
				orderIndependentActionTypes: [ActionType.ChatTurnComplete],
			} : undefined);
		};

		const recordedOrder = [turns[0], turns[1], turns[2]];
		const crossChannelReorder = [turns[1], turns[0], turns[2]];
		const sameChannelReorder = [turns[2], turns[1], turns[0]];
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
