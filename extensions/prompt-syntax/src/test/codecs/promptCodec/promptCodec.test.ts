/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { TestDecoder } from '../testUtils/testDecoder';
import { FileReference } from '../../../codecs/promptCodec/tokens';
import { PromptCodec } from '../../../codecs/promptCodec/promptCodec';
import { newWriteableStream, Range, VSBuffer } from '../../../utils/vscode';
import { PromptDecoder, TPromptToken } from '../../../codecs/promptCodec/promptDecoder';

/**
 * TODO: @legomushroom - list
 *  - move in `prompt content providers`
 *  - move in `prompt parsers`
 *  - move in `prompt file reference`
 *  - create extension API
 *  - consume extension API
 *  - remove the old code in core
 */

/**
 * A reusable test utility that asserts that a `PromptDecoder` instance
 * correctly decodes `inputData` into a stream of `TPromptToken` tokens.
 *
 * ## Examples
 *
 * ```typescript
 * // create a new test utility instance
 * const test = new TestPromptCodec();
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
export class TestPromptCodec extends TestDecoder<TPromptToken, PromptDecoder> {
	constructor() {
		const stream = newWriteableStream<VSBuffer>(null);
		const decoder = PromptCodec.decode(stream);

		super(stream, decoder);
	}
}

suite('PromptCodec', () => {
	test('• produces expected tokens', async () => {
		const test = new TestPromptCodec();

		await test.run(
			'#file:/etc/hosts some text\t\n  for #file:./README.md\t testing\n ✔ purposes\n#file:LICENSE.md ✌ \t#file:.gitignore\n\n\n\t   #file:/Users/legomushroom/repos/vscode   \n\nsomething #file:\tsomewhere\n',
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
				new FileReference(
					new Range(9, 11, 9, 11 + 6),
					'',
				),
			],
		);
	});
});
