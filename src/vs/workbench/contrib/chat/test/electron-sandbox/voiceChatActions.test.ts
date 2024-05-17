/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from 'vs/base/test/common/utils';
import { parseNextChatResponseChunk } from 'vs/workbench/contrib/chat/electron-sandbox/actions/voiceChatActions';

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

	ensureNoDisposablesAreLeakedInTestSuite();
});
