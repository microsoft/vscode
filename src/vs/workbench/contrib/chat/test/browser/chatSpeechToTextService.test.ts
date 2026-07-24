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
				isFaithfulDictationCleanup('le cafe\u0301 est bon', 'Le caf\u00e9 est bon.'),
			],
			[true, true, true]
		);
	});

	test('accepts markdown list formatting', () => {
		assert.deepStrictEqual(
			[
				isFaithfulDictationCleanup(
					'we need apples oranges and chocolate',
					'We need:\n- apples\n- oranges\n- and chocolate.'
				),
				isFaithfulDictationCleanup(
					'first install dependencies second run tests',
					'1. First, install dependencies.\n2. Second, run tests.'
				),
			],
			[true, true]
		);
	});

	test('accepts punctuation across writing systems', () => {
		assert.deepStrictEqual(
			[
				// allow-any-unicode-next-line
				isFaithfulDictationCleanup('今天天气很好我们去公园', '今天天气很好，我们去公园。'),
				// allow-any-unicode-next-line
				isFaithfulDictationCleanup('今日は天気がいい公園に行こう', '今日は天気がいい。公園に行こう。'),
				// allow-any-unicode-next-line
				isFaithfulDictationCleanup('วันนี้อากาศดีเราไปสวนกัน', 'วันนี้อากาศดี เราไปสวนกัน.'),
				// allow-any-unicode-next-line
				isFaithfulDictationCleanup('الطقس جميل اليوم لنذهب إلى الحديقة', 'الطقس جميل اليوم، لنذهب إلى الحديقة.'),
			],
			[true, true, true, true]
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
				isFaithfulDictationCleanup(
					'create a javascript function that returns chocolate',
					'```javascript\nfunction chocolate() { return \'chocolate\'; }\n```'
				),
			],
			[false, false, false]
		);
	});

	test('rejects added, reordered, merged, or excessively truncated content', () => {
		assert.deepStrictEqual(
			[
				isFaithfulDictationCleanup('keep these exact words', 'Please keep these exact words.'),
				isFaithfulDictationCleanup('alpha beta gamma delta', 'delta gamma beta alpha'),
				isFaithfulDictationCleanup('one two three four five', 'One two.'),
				isFaithfulDictationCleanup('the rapist helped', 'The therapist helped.'),
				isFaithfulDictationCleanup('twenty five dollars', '25 dollars.'),
			],
			[false, false, false, false, false]
		);
	});
});
