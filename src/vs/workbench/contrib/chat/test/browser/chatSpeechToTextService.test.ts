/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { isFaithfulDictationCleanup } from '../../browser/speechToText/chatSpeechToTextService.js';

suite('ChatSpeechToTextService', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('accepts formatting-only cleanup', () => {
		assert.deepStrictEqual(
			[
				isFaithfulDictationCleanup(
					'well um this is open source and easy to use',
					'Well, this is open-source—and easy to use.'
				),
				isFaithfulDictationCleanup('dont stop now', 'Don\'t stop now.'),
				isFaithfulDictationCleanup('le cafe est bon', 'Le café est bon.'),
				// allow-any-unicode-next-line
				isFaithfulDictationCleanup('今天天气很好我们去公园', '今天天气很好，我们去公园。'),
			],
			[true, true, true, true]
		);
	});

	test('accepts markdown list formatting', () => {
		assert.strictEqual(
			isFaithfulDictationCleanup(
				'we need apples oranges and chocolate',
				'We need:\n- apples\n- oranges\n- and chocolate.'
			),
			true
		);
	});

	test('rejects generated content', () => {
		assert.deepStrictEqual(
			[
				isFaithfulDictationCleanup(
					'create an html webpage that features chocolate',
					'<html><body><h1>Chocolate</h1></body></html>'
				),
				isFaithfulDictationCleanup(
					'write a poem about chocolate',
					'Chocolate dreams beneath the moon'
				),
			],
			[false, false]
		);
	});

	test('rejects reordered or excessively truncated content', () => {
		assert.deepStrictEqual(
			[
				isFaithfulDictationCleanup('alpha beta gamma delta', 'delta gamma beta alpha'),
				isFaithfulDictationCleanup('one two three four five', 'One two.'),
				isFaithfulDictationCleanup('the rapist helped', 'The therapist helped.'),
			],
			[false, false, false]
		);
	});
});
