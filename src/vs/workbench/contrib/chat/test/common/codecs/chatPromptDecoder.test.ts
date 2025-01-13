/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { VSBuffer } from '../../../../../../base/common/buffer.js';
import { Range } from '../../../../../../editor/common/core/range.js';
import { newWriteableStream } from '../../../../../../base/common/stream.js';
import { TestDecoder } from '../../../../../../editor/test/common/utils/testDecoder.js';
import { FileReference } from '../../../common/codecs/chatPromptCodec/tokens/fileReference.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { ChatPromptDecoder, TChatPromptToken } from '../../../common/codecs/chatPromptCodec/chatPromptDecoder.js';

/**
 * A reusable test utility that asserts that a `ChatPromptDecoder` instance
 * correctly decodes `inputData` into a stream of `TChatPromptToken` tokens.
 *
 * ## Examples
 *
 * ```typescript
 * // create a new test utility instance
 * const test = testDisposables.add(new TestChatPromptDecoder());
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
export class TestChatPromptDecoder extends TestDecoder<TChatPromptToken, ChatPromptDecoder> {
	constructor(
	) {
		const stream = newWriteableStream<VSBuffer>(null);
		const decoder = new ChatPromptDecoder(stream);

		super(stream, decoder);
	}
}

suite('ChatPromptDecoder', () => {
	const testDisposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('produces expected tokens', async () => {
		const test = testDisposables.add(
			new TestChatPromptDecoder(),
		);

		await test.run(
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
		);
	});
});
