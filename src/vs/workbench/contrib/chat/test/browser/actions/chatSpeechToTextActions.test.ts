/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { getDictationShortcutOperation } from '../../../browser/actions/chatSpeechToTextActions.js';
import { ChatSpeechToTextState } from '../../../browser/speechToText/chatSpeechToTextService.js';

suite('Chat Speech to Text Actions', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('resolves the dictation toggle operation', () => {
		assert.deepStrictEqual([
			getDictationShortcutOperation(false, ChatSpeechToTextState.Idle, false),
			getDictationShortcutOperation(true, ChatSpeechToTextState.Recording, false),
			getDictationShortcutOperation(true, ChatSpeechToTextState.Recording, true),
			getDictationShortcutOperation(false, ChatSpeechToTextState.Transcribing, false),
		], [
			'start',
			'stop',
			'cancel',
			undefined,
		]);
	});
});
