/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { SpeechToTextStatus } from '../../../../speech/common/speechService.js';
import { applyDictationInputState, parseNextChatResponseChunk } from '../../../electron-browser/actions/voiceChatActions.js';

suite('VoiceChatActions', function () {

	function assertChunk(text: string, expected: string | undefined, offset: number): { chunk: string | undefined; offset: number } {
		const res = parseNextChatResponseChunk(text, offset);
		assert.strictEqual(res.chunk, expected);

		return res;
	}

	test('parseNextChatResponseChunk', function () {

		// Simple, no offset
		assertChunk('Hello World', undefined, 0);
		assertChunk('Hello World.', undefined, 0);
		assertChunk('Hello World. ', 'Hello World.', 0);
		assertChunk('Hello World? ', 'Hello World?', 0);
		assertChunk('Hello World! ', 'Hello World!', 0);
		assertChunk('Hello World: ', 'Hello World:', 0);

		// Ensure chunks are parsed from the end, no offset
		assertChunk('Hello World. How is your day? And more...', 'Hello World. How is your day?', 0);

		// Ensure chunks are parsed from the end, with offset
		let offset = assertChunk('Hello World. How is your ', 'Hello World.', 0).offset;
		offset = assertChunk('Hello World. How is your day? And more...', 'How is your day?', offset).offset;
		offset = assertChunk('Hello World. How is your day? And more to come! ', 'And more to come!', offset).offset;
		assertChunk('Hello World. How is your day? And more to come! ', undefined, offset);

		// Sparted by newlines
		offset = assertChunk('Hello World.\nHow is your', 'Hello World.', 0).offset;
		assertChunk('Hello World.\nHow is your day?\n', 'How is your day?', offset);
	});

	test(`${applyDictationInputState.name} avoids stale preview duplication after user edit`, function () {
		let state = {
			committedInput: 'hello',
			previewInput: 'hello'
		};

		state = applyDictationInputState(state, state.previewInput, 'world', SpeechToTextStatus.Recognizing);
		assert.deepStrictEqual(state, {
			committedInput: 'hello',
			previewInput: 'hello world'
		});

		const nextState = applyDictationInputState(state, state.previewInput, 'planet', SpeechToTextStatus.Recognized);
		assert.deepStrictEqual(nextState, {
			committedInput: 'hello planet',
			previewInput: 'hello planet'
		});
	});

	test(`${applyDictationInputState.name} replaces recognizing preview instead of accumulating`, function () {
		let state = {
			committedInput: 'base',
			previewInput: 'base'
		};

		state = applyDictationInputState(state, state.previewInput, 'one', SpeechToTextStatus.Recognizing);
		assert.deepStrictEqual(state, {
			committedInput: 'base',
			previewInput: 'base one'
		});

		state = applyDictationInputState(state, state.previewInput, 'two', SpeechToTextStatus.Recognizing);
		assert.deepStrictEqual(state, {
			committedInput: 'base',
			previewInput: 'base two'
		});
	});

	ensureNoDisposablesAreLeakedInTestSuite();
});
