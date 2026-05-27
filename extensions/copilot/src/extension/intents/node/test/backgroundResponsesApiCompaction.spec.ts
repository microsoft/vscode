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
});
