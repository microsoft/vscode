/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { VSBuffer } from '../../../../../../../base/common/buffer.js';
import { Range } from '../../../../../../../editor/common/core/range.js';
import { newWriteableStream } from '../../../../../../../base/common/stream.js';
import { TestDecoder } from '../../../../../../../editor/test/common/utils/testDecoder.js';
import { ChatPromptCodec } from '../../../../common/promptSyntax/codecs/chatPromptCodec.js';
import { FileReference } from '../../../../common/promptSyntax/codecs/tokens/fileReference.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../../base/test/common/utils.js';
import { ChatPromptDecoder, TChatPromptToken } from '../../../../common/promptSyntax/codecs/chatPromptDecoder.js';

/**
 * A reusable test utility that asserts that a `ChatPromptDecoder` instance
 * correctly decodes `inputData` into a stream of `TChatPromptToken` tokens.
 *
 * ## Examples
 *
 * ```typescript
 * // create a new test utility instance
 * const test = testDisposables.add(new TestChatPromptCodec());
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
export class TestChatPromptCodec extends TestDecoder<TChatPromptToken, ChatPromptDecoder> {
	constructor() {
		const stream = newWriteableStream<VSBuffer>(null);
		const decoder = ChatPromptCodec.decode(stream);

		super(stream, decoder);
	}
}

suite('ChatPromptCodec', () => {
	const testDisposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('produces expected tokens', async () => {
		const test = testDisposables.add(new TestChatPromptCodec());

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
