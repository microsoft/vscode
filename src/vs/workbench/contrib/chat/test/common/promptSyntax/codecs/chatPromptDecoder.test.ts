/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { VSBuffer } from '../../../../../../../base/common/buffer.js';
import { Range } from '../../../../../../../editor/common/core/range.js';
import { newWriteableStream } from '../../../../../../../base/common/stream.js';
import { TestDecoder } from '../../../../../../../editor/test/common/utils/testDecoder.js';
import { FileReference } from '../../../../common/promptSyntax/codecs/tokens/fileReference.js';
import { PromptAtMention } from '../../../../common/promptSyntax/codecs/tokens/promptAtMention.js';
import { PromptSlashCommand } from '../../../../common/promptSyntax/codecs/tokens/promptSlashCommand.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../../base/test/common/utils.js';
import { MarkdownLink } from '../../../../../../../editor/common/codecs/markdownCodec/tokens/markdownLink.js';
import { ChatPromptDecoder, TChatPromptToken } from '../../../../common/promptSyntax/codecs/chatPromptDecoder.js';
import { PromptVariable, PromptVariableWithData } from '../../../../common/promptSyntax/codecs/tokens/promptVariable.js';
import { PromptTemplateVariable } from '../../../../common/promptSyntax/codecs/tokens/promptTemplateVariable.js';

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

	test('• produces expected tokens', async () => {
		const test = testDisposables.add(
			new TestChatPromptDecoder(),
		);

		const contents = [
			'',
			'haalo! @workspace',
			' message 👾 message #file:./path/to/file1.md',
			'',
			'## Heading Title',
			' \t#file:a/b/c/filename2.md\t🖖\t#file:other-file.md',
			' [#file:reference.md](./reference.md)some text #file:/some/file/with/absolute/path.md',
			'text /run text #file: another @github text #selection even more text',
			'\t\v#my-name:metadata:1:20 \t\t/command\t\v${inputs:id}\t',
		];

		await test.run(
			contents,
			[
				new PromptAtMention(
					new Range(2, 8, 2, 18),
					'workspace',
				),
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
				new PromptSlashCommand(
					new Range(8, 6, 8, 6 + 4),
					'run',
				),
				new FileReference(
					new Range(8, 16, 8, 16 + 6),
					'',
				),
				new PromptAtMention(
					new Range(8, 31, 8, 32 + 6),
					'github',
				),
				new PromptVariable(
					new Range(8, 44, 8, 44 + 10),
					'selection',
				),
				new PromptVariableWithData(
					new Range(9, 3, 9, 3 + 22),
					'my-name',
					'metadata:1:20',
				),
				new PromptSlashCommand(
					new Range(9, 28, 9, 28 + 8),
					'command',
				),
				new PromptTemplateVariable(
					new Range(9, 38, 9, 38 + 12),
					'inputs:id',
				),
			],
		);
	});

	suite('• variables', () => {
		test('• produces expected tokens', async () => {
			const test = testDisposables.add(
				new TestChatPromptDecoder(),
			);

			const contents = [
				'',
				'\t\v#variable@',
				' #selection#your-variable',
				'some-text #var:12-67# some text',
			];

			await test.run(
				contents,
				[
					new PromptVariable(
						new Range(2, 3, 2, 3 + 9),
						'variable',
					),
					new PromptVariable(
						new Range(3, 2, 3, 2 + 10),
						'selection',
					),
					new PromptVariable(
						new Range(3, 12, 3, 12 + 14),
						'your-variable',
					),
					new PromptVariableWithData(
						new Range(4, 11, 4, 11 + 10),
						'var',
						'12-67',
					),
				],
			);
		});
	});

	suite('• commands', () => {
		test('• produces expected tokens', async () => {
			const test = testDisposables.add(
				new TestChatPromptDecoder(),
			);

			const contents = [
				'my command is \t/run',
				'your /command\v is done',
				'/their#command is a pun',
				'and the /none@cmd was made by a nun',
			];

			await test.run(
				contents,
				[
					// first line
					new PromptSlashCommand(
						new Range(1, 16, 1, 16 + 4),
						'run',
					),
					// second line
					new PromptSlashCommand(
						new Range(2, 6, 2, 6 + 8),
						'command',
					),
					// third line
					new PromptSlashCommand(
						new Range(3, 1, 3, 1 + 6),
						'their',
					),
					new PromptVariable(
						new Range(3, 7, 3, 7 + 8),
						'command',
					),
					// forth line
					new PromptSlashCommand(
						new Range(4, 9, 4, 9 + 5),
						'none',
					),
					new PromptAtMention(
						new Range(4, 14, 4, 14 + 4),
						'cmd',
					),
				],
			);
		});
	});

	suite('• template variables', () => {
		test('• produces expected tokens', async () => {
			const test = testDisposables.add(
				new TestChatPromptDecoder(),
			);

			const contents = [
				'my command is \t${run}',
				'your ${variable}\v is done',
				'${their:variable} is a pun',
				'and the ${none:var} is made by a nun',
			];

			await test.run(
				contents,
				[
					// first line
					new PromptTemplateVariable(
						new Range(1, 16, 1, 16 + 6),
						'run',
					),
					// second line
					new PromptTemplateVariable(
						new Range(2, 6, 2, 6 + 11),
						'variable',
					),
					// third line
					new PromptTemplateVariable(
						new Range(3, 1, 3, 1 + 17),
						'their:variable',
					),
					// forth line
					new PromptTemplateVariable(
						new Range(4, 9, 4, 9 + 11),
						'none:var',
					),
				],
			);
		});
	});
});
