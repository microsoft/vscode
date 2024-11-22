/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { TestDecoder } from '../utils/testDecoder.js';
import { Range } from '../../../common/core/range.js';
import { VSBuffer } from '../../../../base/common/buffer.js';
import { newWriteableStream } from '../../../../base/common/stream.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { FileReference } from '../../../common/codecs/chatbotPromptCodec/tokens/fileReference.js';
import { ChatbotPromptCodec } from '../../../common/codecs/chatbotPromptCodec/chatbotPromptCodec.js';
import { ChatbotPromptDecoder, TChatbotPromptToken } from '../../../common/codecs/chatbotPromptCodec/chatbotPromptDecoder.js';

/**
 * A reusable test utility that asserts that a `ChatbotPromptDecoder` instance
 * correctly decodes `inputData` into a stream of `TChatbotPromptToken` tokens.
 *
 * ## Examples
 *
 * ```typescript
 * // create a new test utility instance
 * const test = testDisposables.add(new TestChatbotPromptCodec());
 *
 * // run the test
 * await test.run(
 *   ' hello #file:./some-file.md world\n',
 *   [
 *     new FileReference(
 *       new Range(1, 8, 1, 28),
 *       './some-file.md',
 *     ),
 *   ]
 * );
 */
export class TestChatbotPromptCodec extends TestDecoder<TChatbotPromptToken, ChatbotPromptDecoder> {
	constructor() {
		const stream = newWriteableStream<VSBuffer>(null);
		const codec = new ChatbotPromptCodec();
		const decoder = codec.decode(stream);

		super(stream, decoder);

		this._register(codec);
	}
}

suite('ChatbotPromptCodec', () => {
	const testDisposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('produces expected tokens', async () => {
		const test = testDisposables.add(new TestChatbotPromptCodec());

		await test.run(
			'#file:/etc/hosts some text\t\n  for #file:./README.md\t testing\n ✔ purposes\n#file:LICENSE.md ✌ \t#file:.gitignore\n\n\n\t   #file:/Users/legomushroom/repos/vscode   ',
			[
				new FileReference(
					new Range(1, 1, 1, 1 + 16),
					'/etc/hosts',
				),
				new FileReference(
					new Range(2, 7, 2, 7 + 17),
					'./README.md',
				),
				new FileReference(
					new Range(4, 1, 4, 1 + 16),
					'LICENSE.md',
				),
				new FileReference(
					new Range(4, 21, 4, 21 + 16),
					'.gitignore',
				),
				new FileReference(
					new Range(7, 5, 7, 5 + 38),
					'/Users/legomushroom/repos/vscode',
				),
			],
		);
	});
});
