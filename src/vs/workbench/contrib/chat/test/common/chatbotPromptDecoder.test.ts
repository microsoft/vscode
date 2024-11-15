/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { TestDecoder } from './utils/testDecoder.js';
import { VSBuffer } from '../../../../../base/common/buffer.js';
import { Range } from '../../../../../editor/common/core/range.js';
import { newWriteableStream } from '../../../../../base/common/stream.js';
import { LinesDecoder } from '../../../../common/codecs/linesCodec/linesDecoder.js';
import { SimpleDecoder } from '../../../../common/codecs/simpleCodec/simpleDecoder.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { FileReference } from '../../../../common/codecs/chatbotPromptCodec/tokens/fileReference.js';
import { ChatbotPromptDecoder, TChatbotPromptToken } from '../../../../common/codecs/chatbotPromptCodec/chatbotPromptDecoder.js';

/**
 * A reusable test utility that asserts that a `ChatbotPromptDecoder` isntance
 * correctly decodes `inputData` into a stream of `TChatbotPromptToken` tokens.
 *
 * ## Examples
 *
 * ```typescript
 * // create a new test utility instance
 * const test = testDisposables.add(
 * new TestChatbotPromptDecoder(
 *   ' hello world\n',
 * 	 [
 * 	   new Space(new Range(1, 1, 1, 2)),
 * 	   new Word(new Range(1, 2, 1, 7), 'hello'),
 * 	   new Space(new Range(1, 7, 1, 8)),
 * 	   new Word(new Range(1, 8, 1, 13), 'world'),
 * 	   new NewLine(new Range(1, 13, 1, 14)),
 *   ]),
 * );
 *
 * // run the test
 * await test.run();
 */
export class TestChatbotPromptDecoder extends TestDecoder<TChatbotPromptToken, ChatbotPromptDecoder> {
	constructor(
		inputData: string,
		expectedTokens: readonly TChatbotPromptToken[],
	) {
		const stream = newWriteableStream<VSBuffer>(null);
		const decoder = new ChatbotPromptDecoder(
			new SimpleDecoder(
				new LinesDecoder(stream),
			),
		);

		super(
			decoder,
			() => {
				stream.write(VSBuffer.fromString(inputData));
				stream.end();
			},
			expectedTokens,
		);
	}
}

suite('ChatbotPromptDecoder', () => {
	const testDisposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('produces expected tokens', async () => {
		const test = testDisposables.add(
			new TestChatbotPromptDecoder(
				'\nhaalo!\n message 👾 message #file:./path/to/file1.md \n\n \t#file:a/b/c/filename2.md\t🖖\t#file:other-file.md\nsome text #file:/some/file/with/absolute/path.md\t',
				[
					new FileReference(
						new Range(3, 21, 3, 21 + 24),
						'./path/to/file1.md',
					),
					new FileReference(
						new Range(5, 3, 5, 3 + 24),
						'a/b/c/filename2.md',
					),
					new FileReference(
						new Range(5, 31, 5, 31 + 19),
						'other-file.md',
					),
					new FileReference(
						new Range(6, 11, 6, 11 + 38),
						'/some/file/with/absolute/path.md',
					),
				],
			),
		);

		await test.run();
	});
});
