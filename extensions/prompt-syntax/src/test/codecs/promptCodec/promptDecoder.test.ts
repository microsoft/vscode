/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { TestDecoder } from '../testUtils/testDecoder';
import { FileReference } from '../../../codecs/promptCodec/tokens';
import { MarkdownLink } from '../../../codecs/markdownCodec/tokens';
import { PromptDecoder, TPromptToken } from '../../../codecs/promptCodec/promptDecoder';
import { Range, VSBuffer, newWriteableStream } from '../../../utils/vscode';

/**
 * A reusable test utility that asserts that a `PromptDecoder` instance
 * correctly decodes `inputData` into a stream of `TPromptToken` tokens.
 *
 * ## Examples
 *
 * ```typescript
 * // create a new test utility instance
 * const test = testDisposables.add(new TestPromptDecoder());
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
export class TestPromptDecoder extends TestDecoder<TPromptToken, PromptDecoder> {
	constructor(
	) {
		const stream = newWriteableStream<VSBuffer>(null);
		const decoder = new PromptDecoder(stream);

		super(stream, decoder);
	}
}

suite('PromptDecoder', () => {
	test('• produces expected tokens', async () => {
		const test = new TestPromptDecoder();

		const contents = [
			'',
			'haalo!',
			' message 👾 message #file:./path/to/file1.md',
			'',
			'## Heading Title',
			' \t#file:a/b/c/filename2.md\t🖖\t#file:other-file.md',
			' [#file:reference.md](./reference.md)some text #file:/some/file/with/absolute/path.md',
			'text text #file: another text',
		];

		await test.run(
			contents,
			[
				new FileReference(
					new Range(3, 21, 3, 21 + 24),
					'./path/to/file1.md',
				),
				new FileReference(
					new Range(6, 3, 6, 3 + 24),
					'a/b/c/filename2.md',
				),
				new FileReference(
					new Range(6, 31, 6, 31 + 19),
					'other-file.md',
				),
				new MarkdownLink(
					7,
					2,
					'[#file:reference.md]',
					'(./reference.md)',
				),
				new FileReference(
					new Range(7, 48, 7, 48 + 38),
					'/some/file/with/absolute/path.md',
				),
				new FileReference(
					new Range(8, 11, 8, 11 + 6),
					'',
				),
			],
		);
	});
});
