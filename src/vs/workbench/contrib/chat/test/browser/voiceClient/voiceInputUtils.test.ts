/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { combineVoiceInput } from '../../../browser/voiceClient/voiceInputUtils.js';

suite('combineVoiceInput', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('keeps typed input and appends the transcript', () => {
		assert.deepStrictEqual(
			[
				combineVoiceInput('', 'hello world'),
				combineVoiceInput('please', 'run the tests'),
				combineVoiceInput('please ', 'run the tests'),
				combineVoiceInput('please\n', 'run the tests'),
				combineVoiceInput('draft', ''),
			],
			[
				'hello world',
				'please run the tests',
				'please run the tests',
				'please\nrun the tests',
				'draft',
			]
		);
	});
});
