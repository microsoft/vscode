/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { describe, expect, test, vi } from 'vitest';
import { openAIContextManagementCompactionType } from '../../../../platform/networking/common/openai';
import { IBuildPromptContext, IToolCallRound } from '../../../prompt/common/intents';
import { IBackgroundResponsesApiCompactionResult } from '../../../prompts/node/agent/backgroundSummarizer';
import { AgentIntentInvocation } from '../agentIntent';

describe('AgentIntentInvocation background Responses API compaction boundary', () => {
	const compaction = {
		type: openAIContextManagementCompactionType,
		id: 'cmp-1',
		encrypted_content: 'encrypted-compaction',
	} as const;

	function round(id: string): IToolCallRound {
		return { id, response: '', toolCalls: [], toolInputRetry: 0 };
	}

	function apply(includedRoundIds: string[], historyRounds: IToolCallRound[], currentRounds: IToolCallRound[]) {
		const invalidateRouterCache = vi.fn();
		const method = (AgentIntentInvocation.prototype as unknown as {
			_applyResponsesApiCompactionToRounds: (this: unknown, result: IBackgroundResponsesApiCompactionResult, promptContext: IBuildPromptContext) => boolean;
		})._applyResponsesApiCompactionToRounds;
		const result = method.call({ automodeService: { invalidateRouterCache }, request: {} }, {
			kind: 'responsesApiCompaction',
			compaction,
			includedRoundIds,
		}, {
			history: [{ rounds: historyRounds }],
			toolCallRounds: currentRounds,
		} as unknown as IBuildPromptContext);
		return { result, invalidateRouterCache };
	}

	function sendRequestTelemetry() {
		const events: { eventName: string; properties: Record<string, string | undefined>; measurements: Record<string, number> }[] = [];
		const method = (AgentIntentInvocation.prototype as unknown as {
			_sendResponsesApiCompactionRequestTelemetry: (
				this: unknown,
				promptContext: IBuildPromptContext,
				options: { contextLengthBefore: number; contextRatio: number; tokenBudget: number; promptTokenLength: number; toolTokenCount: number }
			) => void;
		})._sendResponsesApiCompactionRequestTelemetry;
		method.call({
			telemetryService: {
				sendMSFTTelemetryEvent: (eventName: string, properties: Record<string, string | undefined>, measurements: Record<string, number>) => {
					events.push({ eventName, properties, measurements });
				},
			},
			endpoint: { model: 'gpt-5.4' },
		}, {
			conversation: {
				sessionId: 'conversation-1',
				getLatestTurn: () => ({ id: 'turn-1' }),
			},
		} as unknown as IBuildPromptContext, {
			contextLengthBefore: 900,
			contextRatio: 0.9,
			tokenBudget: 1000,
			promptTokenLength: 800,
			toolTokenCount: 100,
		});
		return events;
	}

	test('places a completed compaction on the first round after its request snapshot', () => {
		const snapshotted = round('snapshot');
		const firstFollowing = round('following');
		const laterFollowing = round('later');

		const { result, invalidateRouterCache } = apply(['snapshot'], [snapshotted], [firstFollowing, laterFollowing]);

		expect(result).toBe(true);
		expect(snapshotted.compaction).toBeUndefined();
		expect(firstFollowing.compaction).toEqual(compaction);
		expect(laterFollowing.compaction).toBeUndefined();
		expect(invalidateRouterCache).toHaveBeenCalledOnce();
	});

	test('keeps a completed compaction pending until a post-snapshot round exists', () => {
		const snapshotted = round('snapshot');

		const { result, invalidateRouterCache } = apply(['snapshot'], [snapshotted], []);

		expect(result).toBe(false);
		expect(snapshotted.compaction).toBeUndefined();
		expect(invalidateRouterCache).not.toHaveBeenCalled();
	});

	test('emits request telemetry only for actual compaction trigger requests', () => {
		const events = sendRequestTelemetry();

		expect(events).toHaveLength(1);
		expect(events[0]).toEqual({
			eventName: 'responsesApiCompactionRequest',
			properties: {
				conversationId: 'conversation-1',
				chatRequestId: 'turn-1',
				model: 'gpt-5.4',
			},
			measurements: {
				triggerRequested: 1,
				contextLengthBefore: 900,
				contextRatio: 0.9,
				tokenBudget: 1000,
				promptTokenLength: 800,
				toolTokenCount: 100,
			},
		});
	});
});
