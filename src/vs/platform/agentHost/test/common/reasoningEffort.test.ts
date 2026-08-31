/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { getReasoningEffortDescription, getReasoningEffortLabel, reasoningEffortLevels, resolveDefaultReasoningEffort } from '../../common/reasoningEffort.js';

suite('reasoningEffort', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	// A newly-introduced tier that nobody adds a string for would otherwise reach
	// the picker as a raw, unlocalized value with no description.
	test('every level has a localized label and description', () => {
		assert.deepStrictEqual(
			reasoningEffortLevels.map(level => [level, getReasoningEffortLabel(level), getReasoningEffortDescription(level)]),
			[
				['none', 'None', 'No reasoning applied'],
				['minimal', 'Minimal', 'Minimal reasoning for fastest responses'],
				['low', 'Low', 'Faster responses with less reasoning'],
				['medium', 'Medium', 'Balanced reasoning and speed'],
				['high', 'High', 'Greater reasoning depth but slower'],
				['xhigh', 'Extra High', 'Highest reasoning depth but slowest'],
				['max', 'Max', 'Absolute maximum capability with no constraints'],
				['ultra', 'Ultra', 'Maximum reasoning with automatic task delegation'],
			],
		);
	});

	test('resolves a default so the picker never renders an undefined selection', () => {
		assert.deepStrictEqual([
			resolveDefaultReasoningEffort(['low', 'medium', 'high'], 'high', 'gpt-5'),
			resolveDefaultReasoningEffort(['low', 'medium', 'high'], undefined, 'gpt-5'),
			resolveDefaultReasoningEffort(['low', 'medium', 'high'], 'nonsense', 'gpt-5'),
			resolveDefaultReasoningEffort(['low', 'medium', 'high'], undefined, 'claude-opus-5'),
			resolveDefaultReasoningEffort(['minimal', 'max'], undefined, 'gpt-5'),
			resolveDefaultReasoningEffort([], undefined, 'gpt-5'),
			resolveDefaultReasoningEffort(undefined, undefined, 'gpt-5'),
		], [
			'high',
			'medium',
			'medium',
			'high',
			'minimal',
			undefined,
			undefined,
		]);
	});
});
