/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { describe, expect, test } from 'vitest';
import { ConfigKey } from '../../../../platform/configuration/common/configurationService';
import { resolveSummarizeThresholdTokens } from '../agentIntent';

describe('resolveSummarizeThresholdTokens', () => {
	const settingId = ConfigKey.Advanced.SummarizeAgentConversationHistoryThreshold.id;
	const maxTokens = 200_000;

	test('undefined / non-positive values mean "use full window"', () => {
		expect(resolveSummarizeThresholdTokens(undefined, maxTokens, settingId)).toBe(undefined);
		expect(resolveSummarizeThresholdTokens(0, maxTokens, settingId)).toBe(undefined);
		expect(resolveSummarizeThresholdTokens(-1, maxTokens, settingId)).toBe(undefined);
	});

	test('ratio values (0 < value <= 1) resolve against the effective window', () => {
		expect(resolveSummarizeThresholdTokens(0.8, maxTokens, settingId)).toBe(160_000);
		expect(resolveSummarizeThresholdTokens(0.5, maxTokens, settingId)).toBe(100_000);
		// value === 1 is a valid ratio (the whole window), not an absolute count.
		expect(resolveSummarizeThresholdTokens(1, maxTokens, settingId)).toBe(maxTokens);
		// Always at least 1 token so the budget never collapses to 0.
		expect(resolveSummarizeThresholdTokens(0.000001, 100, settingId)).toBe(1);
	});

	test('absolute token counts (value >= 100) are passed through unchanged', () => {
		expect(resolveSummarizeThresholdTokens(60_000, maxTokens, settingId)).toBe(60_000);
		expect(resolveSummarizeThresholdTokens(100, maxTokens, settingId)).toBe(100);
	});

	test('ambiguous values in (1, 100) are rejected', () => {
		expect(() => resolveSummarizeThresholdTokens(80, maxTokens, settingId)).toThrow(/too low/);
		expect(() => resolveSummarizeThresholdTokens(99, maxTokens, settingId)).toThrow(/too low/);
	});
});
