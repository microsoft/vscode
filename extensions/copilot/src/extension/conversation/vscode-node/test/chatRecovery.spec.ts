/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { expect, suite, test } from 'vitest';
import { arePromptsSimilar } from '../chatRecovery';

suite('Chat recovery', () => {
	test('compares normalized prompts', () => {
		expect(arePromptsSimilar(' Fix  the\nerror ', 'fix the error')).toBe(true);
		expect(arePromptsSimilar('Fix the parser error', 'Explain the parser architecture')).toBe(false);
	});

	test('does not treat empty attachment-only prompts as repeats', () => {
		expect(arePromptsSimilar('', '')).toBe(false);
		expect(arePromptsSimilar('  \n', 'Fix the error')).toBe(false);
	});
});
