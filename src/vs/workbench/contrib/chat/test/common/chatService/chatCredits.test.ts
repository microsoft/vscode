/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { safeIntl } from '../../../../../../base/common/date.js';
import { language } from '../../../../../../base/common/platform.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { formatCopilotCredits, formatCopilotCreditsLabel } from '../../../common/chatService/chatService.js';

suite('Chat credit formatting', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	const formatter = safeIntl.NumberFormat(language, { maximumFractionDigits: 1 }).value;

	test('groups credit amounts using the display language', () => {
		const credits = [1000, 12268, 12268.4, 1234567.8];
		assert.deepStrictEqual(credits.map(formatCopilotCredits), credits.map(value => formatter.format(value)));
	});

	test('preserves rounding to one decimal place without trailing zeroes', () => {
		const credits = [0, -0, -0.04, 0.04, 0.06, 0.96, 1, 1.04, 1.06, 2.55, 999.96];
		const rounded = [0, 0, 0, 0, 0.1, 1, 1, 1, 1.1, 2.5, 1000];
		assert.deepStrictEqual(credits.map(formatCopilotCredits), rounded.map(value => formatter.format(value)));
	});

	test('pluralizes labels using the rounded credit amount', () => {
		assert.deepStrictEqual(
			[0, 0.9, 0.96, 1, 1.04, 1.06, 12268.4].map(formatCopilotCreditsLabel),
			[
				`${formatter.format(0)} credits`,
				`${formatter.format(0.9)} credits`,
				`${formatter.format(1)} credit`,
				`${formatter.format(1)} credit`,
				`${formatter.format(1)} credit`,
				`${formatter.format(1.1)} credits`,
				`${formatter.format(12268.4)} credits`,
			],
		);
	});
});
