/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { VSBuffer } from '../../../../../../../base/common/buffer.js';
import { Range } from '../../../../../../../editor/common/core/range.js';
import { newWriteableStream } from '../../../../../../../base/common/stream.js';
import { TestDecoder } from '../../../../../../../editor/test/common/utils/testDecoder.js';
import { ChatPromptCodec } from '../../../../common/promptSyntax/codecs/chatPromptCodec.js';
import { NewLine } from '../../../../../../../editor/common/codecs/linesCodec/tokens/newLine.js';
import { Space, Tab, Word } from '../../../../../../../editor/common/codecs/simpleCodec/tokens/index.js';
import { PromptVariableWithData } from '../../../../common/promptSyntax/codecs/tokens/promptVariable.js';
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
 *     new PromptVariableWithData(
 *       new Range(1, 8, 1, 28),
 *       'file',
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

	test('• produces expected tokens', async () => {
		const test = testDisposables.add(new TestChatPromptCodec());

		await test.run(
			'#file:/etc/hosts some text\t\n  for #file:./README.md\t testing\n ✔ purposes\n#file:LICENSE.md ✌ \t#file:.gitignore\n\n\n\t   #file:/Users/legomushroom/repos/vscode   \n\nsomething #file:\tsomewhere\n',
			[
				// reference
				new PromptVariableWithData(
					new Range(1, 1, 1, 1 + 16),
					'file',
					'/etc/hosts',
				),
				new Space(new Range(1, 17, 1, 17 + 1)),
				new Word(new Range(1, 18, 1, 18 + 4), 'some'),
				new Space(new Range(1, 22, 1, 22 + 1)),
				new Word(new Range(1, 23, 1, 23 + 4), 'text'),
				new Tab(new Range(1, 27, 1, 27 + 1)),
				new NewLine(new Range(1, 28, 1, 28 + 1)),
				new Space(new Range(2, 1, 2, 1 + 1)),
				new Space(new Range(2, 2, 2, 2 + 1)),
				new Word(new Range(2, 3, 2, 3 + 3), 'for'),
				new Space(new Range(2, 6, 2, 6 + 1)),
				// reference
				new PromptVariableWithData(
					new Range(2, 7, 2, 7 + 17),
					'file',
					'./README.md',
				),
				new Tab(new Range(2, 24, 2, 24 + 1)),
				new Space(new Range(2, 25, 2, 25 + 1)),
				new Word(new Range(2, 26, 2, 26 + 7), 'testing'),
				new NewLine(new Range(2, 33, 2, 33 + 1)),
				new Space(new Range(3, 1, 3, 1 + 1)),
				new Word(new Range(3, 2, 3, 2 + 1), '✔'),
				new Space(new Range(3, 3, 3, 3 + 1)),
				new Word(new Range(3, 4, 3, 4 + 8), 'purposes'),
				new NewLine(new Range(3, 12, 3, 12 + 1)),
				// reference
				new PromptVariableWithData(
					new Range(4, 1, 4, 1 + 16),
					'file',
					'LICENSE.md',
				),
				new Space(new Range(4, 17, 4, 17 + 1)),
				new Word(new Range(4, 18, 4, 18 + 1), '✌'),
				new Space(new Range(4, 19, 4, 19 + 1)),
				new Tab(new Range(4, 20, 4, 20 + 1)),
				// reference
				new PromptVariableWithData(
					new Range(4, 21, 4, 21 + 16),
					'file',
					'.gitignore',
				),
				new NewLine(new Range(4, 37, 4, 37 + 1)),
				new NewLine(new Range(5, 1, 5, 1 + 1)),
				new NewLine(new Range(6, 1, 6, 1 + 1)),
				new Tab(new Range(7, 1, 7, 1 + 1)),
				new Space(new Range(7, 2, 7, 2 + 1)),
				new Space(new Range(7, 3, 7, 3 + 1)),
				new Space(new Range(7, 4, 7, 4 + 1)),
				// reference
				new PromptVariableWithData(
					new Range(7, 5, 7, 5 + 38),
					'file',
					'/Users/legomushroom/repos/vscode',
				),
				new Space(new Range(7, 43, 7, 43 + 1)),
				new Space(new Range(7, 44, 7, 44 + 1)),
				new Space(new Range(7, 45, 7, 45 + 1)),
				new NewLine(new Range(7, 46, 7, 46 + 1)),
				new NewLine(new Range(8, 1, 8, 1 + 1)),
				new Word(new Range(9, 1, 9, 1 + 9), 'something'),
				new Space(new Range(9, 10, 9, 10 + 1)),
				// reference
				new PromptVariableWithData(
					new Range(9, 11, 9, 11 + 6),
					'file',
					'',
				),
				new Tab(new Range(9, 17, 9, 17 + 1)),
				new Word(new Range(9, 18, 9, 18 + 9), 'somewhere'),
				new NewLine(new Range(9, 27, 9, 27 + 1)),
			],
		);
	});
});
