/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { VSBuffer } from '../../../../../../../base/common/buffer.js';
import { Range } from '../../../../../../../editor/common/core/range.js';
import { newWriteableStream } from '../../../../../../../base/common/stream.js';
import { TestDecoder } from '../../../../../../../editor/test/common/utils/testDecoder.js';
import { FileReference } from '../../../../common/promptSyntax/codecs/tokens/fileReference.js';
import { NewLine } from '../../../../../../../editor/common/codecs/linesCodec/tokens/newLine.js';
import { PromptAtMention } from '../../../../common/promptSyntax/codecs/tokens/promptAtMention.js';
import { PromptSlashCommand } from '../../../../common/promptSyntax/codecs/tokens/promptSlashCommand.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../../base/test/common/utils.js';
import { MarkdownLink } from '../../../../../../../editor/common/codecs/markdownCodec/tokens/markdownLink.js';
import { PromptTemplateVariable } from '../../../../common/promptSyntax/codecs/tokens/promptTemplateVariable.js';
import { ChatPromptDecoder, TChatPromptToken } from '../../../../common/promptSyntax/codecs/chatPromptDecoder.js';
import { PromptVariable, PromptVariableWithData } from '../../../../common/promptSyntax/codecs/tokens/promptVariable.js';
import { At, Dash, ExclamationMark, FormFeed, Hash, Space, Tab, VerticalTab, Word } from '../../../../../../../editor/common/codecs/simpleCodec/tokens/index.js';

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
			'\f',
			'## Heading Title',
			' \t#file:a/b/c/filename2.md\t🖖\t#file:other-file.md',
			' [#file:reference.md](./reference.md)some text #file:/some/file/with/absolute/path.md',
			'text /run text #file: another @github text #selection even more text',
			'\t\v#my-name:metadata:1:20 \t\t/command\t\v${inputs:id}\t',
		];

		await test.run(
			contents,
			[
				// first line
				new NewLine(new Range(1, 1, 1, 2)),
				// second line
				new Word(new Range(2, 1, 2, 6), 'haalo'),
				new ExclamationMark(new Range(2, 6, 2, 7)),
				new Space(new Range(2, 7, 2, 8)),
				new PromptAtMention(
					new Range(2, 8, 2, 18),
					'workspace',
				),
				new NewLine(new Range(2, 18, 2, 19)),
				// third line
				new Space(new Range(3, 1, 3, 2)),
				new Word(new Range(3, 2, 3, 9), 'message'),
				new Space(new Range(3, 9, 3, 10)),
				new Word(new Range(3, 10, 3, 12), '👾'),
				new Space(new Range(3, 12, 3, 13)),
				new Word(new Range(3, 13, 3, 20), 'message'),
				new Space(new Range(3, 20, 3, 21)),
				new FileReference(
					new Range(3, 21, 3, 21 + 24),
					'./path/to/file1.md',
				),
				new NewLine(new Range(3, 45, 3, 46)),
				// fourth line
				new FormFeed(new Range(4, 1, 4, 2)),
				new NewLine(new Range(4, 2, 4, 3)),
				// fifth line
				new Hash(new Range(5, 1, 5, 2)),
				new Hash(new Range(5, 2, 5, 3)),
				new Space(new Range(5, 3, 5, 4)),
				new Word(new Range(5, 4, 5, 11), 'Heading'),
				new Space(new Range(5, 11, 5, 12)),
				new Word(new Range(5, 12, 5, 17), 'Title'),
				new NewLine(new Range(5, 17, 5, 18)),
				// sixth line
				new Space(new Range(6, 1, 6, 2)),
				new Tab(new Range(6, 2, 6, 3)),
				new FileReference(
					new Range(6, 3, 6, 3 + 24),
					'a/b/c/filename2.md',
				),
				new Tab(new Range(6, 27, 6, 28)),
				new Word(new Range(6, 28, 6, 30), '🖖'),
				new Tab(new Range(6, 30, 6, 31)),
				new FileReference(
					new Range(6, 31, 6, 31 + 19),
					'other-file.md',
				),
				new NewLine(new Range(6, 50, 6, 51)),
				// seventh line
				new Space(new Range(7, 1, 7, 2)),
				new MarkdownLink(
					7,
					2,
					'[#file:reference.md]',
					'(./reference.md)',
				),
				new Word(new Range(7, 38, 7, 38 + 4), 'some'),
				new Space(new Range(7, 42, 7, 43)),
				new Word(new Range(7, 43, 7, 43 + 4), 'text'),
				new Space(new Range(7, 47, 7, 48)),
				new FileReference(
					new Range(7, 48, 7, 48 + 38),
					'/some/file/with/absolute/path.md',
				),
				new NewLine(new Range(7, 86, 7, 87)),
				// eighth line
				new Word(new Range(8, 1, 8, 5), 'text'),
				new Space(new Range(8, 5, 8, 6)),
				new PromptSlashCommand(
					new Range(8, 6, 8, 6 + 4),
					'run',
				),
				new Space(new Range(8, 10, 8, 11)),
				new Word(new Range(8, 11, 8, 11 + 4), 'text'),
				new Space(new Range(8, 15, 8, 16)),
				new FileReference(
					new Range(8, 16, 8, 16 + 6),
					'',
				),
				new Space(new Range(8, 22, 8, 23)),
				new Word(new Range(8, 23, 8, 23 + 7), 'another'),
				new Space(new Range(8, 30, 8, 31)),
				new PromptAtMention(
					new Range(8, 31, 8, 32 + 6),
					'github',
				),
				new Space(new Range(8, 38, 8, 39)),
				new Word(new Range(8, 39, 8, 39 + 4), 'text'),
				new Space(new Range(8, 43, 8, 44)),
				new PromptVariable(
					new Range(8, 44, 8, 44 + 10),
					'selection',
				),
				new Space(new Range(8, 54, 8, 55)),
				new Word(new Range(8, 55, 8, 55 + 4), 'even'),
				new Space(new Range(8, 59, 8, 60)),
				new Word(new Range(8, 60, 8, 60 + 4), 'more'),
				new Space(new Range(8, 64, 8, 65)),
				new Word(new Range(8, 65, 8, 65 + 4), 'text'),
				new NewLine(new Range(8, 69, 8, 70)),
				// ninth line
				new Tab(new Range(9, 1, 9, 2)),
				new VerticalTab(new Range(9, 2, 9, 3)),
				new PromptVariableWithData(
					new Range(9, 3, 9, 3 + 22),
					'my-name',
					'metadata:1:20',
				),
				new Space(new Range(9, 25, 9, 26)),
				new Tab(new Range(9, 26, 9, 27)),
				new Tab(new Range(9, 27, 9, 28)),
				new PromptSlashCommand(
					new Range(9, 28, 9, 28 + 8),
					'command',
				),
				new Tab(new Range(9, 36, 9, 37)),
				new VerticalTab(new Range(9, 37, 9, 38)),
				new PromptTemplateVariable(
					new Range(9, 38, 9, 38 + 12),
					'inputs:id',
				),
				new Tab(new Range(9, 50, 9, 51)),
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
					// first line
					new NewLine(new Range(1, 1, 1, 2)),
					// second line
					new Tab(new Range(2, 1, 2, 2)),
					new VerticalTab(new Range(2, 2, 2, 3)),
					new PromptVariable(
						new Range(2, 3, 2, 3 + 9),
						'variable',
					),
					new At(new Range(2, 12, 2, 13)),
					new NewLine(new Range(2, 13, 2, 14)),
					// third line
					new Space(new Range(3, 1, 3, 2)),
					new PromptVariable(
						new Range(3, 2, 3, 2 + 10),
						'selection',
					),
					new PromptVariable(
						new Range(3, 12, 3, 12 + 14),
						'your-variable',
					),
					new NewLine(new Range(3, 26, 3, 27)),
					// forth line
					new Word(new Range(4, 1, 4, 5), 'some'),
					new Dash(new Range(4, 5, 4, 6)),
					new Word(new Range(4, 6, 4, 6 + 4), 'text'),
					new Space(new Range(4, 10, 4, 11)),
					new PromptVariableWithData(
						new Range(4, 11, 4, 11 + 10),
						'var',
						'12-67',
					),
					new Hash(new Range(4, 21, 4, 22)),
					new Space(new Range(4, 22, 4, 23)),
					new Word(new Range(4, 23, 4, 23 + 4), 'some'),
					new Space(new Range(4, 27, 4, 28)),
					new Word(new Range(4, 28, 4, 28 + 4), 'text'),
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
				'/their#command is  a pun',
				'and the /none@cmd was made by a nun',
			];

			await test.run(
				contents,
				[
					// first line
					new Word(new Range(1, 1, 1, 3), 'my'),
					new Space(new Range(1, 3, 1, 4)),
					new Word(new Range(1, 4, 1, 11), 'command'),
					new Space(new Range(1, 11, 1, 12)),
					new Word(new Range(1, 12, 1, 12 + 2), 'is'),
					new Space(new Range(1, 14, 1, 15)),
					new Tab(new Range(1, 15, 1, 16)),
					new PromptSlashCommand(
						new Range(1, 16, 1, 16 + 4),
						'run',
					),
					new NewLine(new Range(1, 20, 1, 21)),
					// second line
					new Word(new Range(2, 1, 2, 5), 'your'),
					new Space(new Range(2, 5, 2, 6)),
					new PromptSlashCommand(
						new Range(2, 6, 2, 6 + 8),
						'command',
					),
					new VerticalTab(new Range(2, 14, 2, 15)),
					new Space(new Range(2, 15, 2, 16)),
					new Word(new Range(2, 16, 2, 16 + 2), 'is'),
					new Space(new Range(2, 18, 2, 19)),
					new Word(new Range(2, 19, 2, 19 + 4), 'done'),
					new NewLine(new Range(2, 23, 2, 24)),
					// third line
					new PromptSlashCommand(
						new Range(3, 1, 3, 1 + 6),
						'their',
					),
					new PromptVariable(
						new Range(3, 7, 3, 7 + 8),
						'command',
					),
					new Space(new Range(3, 15, 3, 16)),
					new Word(new Range(3, 16, 3, 16 + 2), 'is'),
					new Space(new Range(3, 18, 3, 19)),
					new Space(new Range(3, 19, 3, 20)),
					new Word(new Range(3, 20, 3, 20 + 1), 'a'),
					new Space(new Range(3, 21, 3, 22)),
					new Word(new Range(3, 22, 3, 22 + 3), 'pun'),
					new NewLine(new Range(3, 25, 3, 26)),
					// forth line
					new Word(new Range(4, 1, 4, 4), 'and'),
					new Space(new Range(4, 4, 4, 5)),
					new Word(new Range(4, 5, 4, 5 + 3), 'the'),
					new Space(new Range(4, 8, 4, 9)),
					new PromptSlashCommand(
						new Range(4, 9, 4, 9 + 5),
						'none',
					),
					new PromptAtMention(
						new Range(4, 14, 4, 14 + 4),
						'cmd',
					),
					new Space(new Range(4, 18, 4, 19)),
					new Word(new Range(4, 19, 4, 19 + 3), 'was'),
					new Space(new Range(4, 22, 4, 23)),
					new Word(new Range(4, 23, 4, 23 + 4), 'made'),
					new Space(new Range(4, 27, 4, 28)),
					new Word(new Range(4, 28, 4, 28 + 2), 'by'),
					new Space(new Range(4, 30, 4, 31)),
					new Word(new Range(4, 31, 4, 31 + 1), 'a'),
					new Space(new Range(4, 32, 4, 33)),
					new Word(new Range(4, 33, 4, 33 + 3), 'nun'),
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
				'and the ${none:var} is made for fun',
			];

			await test.run(
				contents,
				[
					// first line
					new Word(new Range(1, 1, 1, 3), 'my'),
					new Space(new Range(1, 3, 1, 4)),
					new Word(new Range(1, 4, 1, 11), 'command'),
					new Space(new Range(1, 11, 1, 12)),
					new Word(new Range(1, 12, 1, 12 + 2), 'is'),
					new Space(new Range(1, 14, 1, 15)),
					new Tab(new Range(1, 15, 1, 16)),
					new PromptTemplateVariable(
						new Range(1, 16, 1, 16 + 6),
						'run',
					),
					new NewLine(new Range(1, 22, 1, 23)),
					// second line
					new Word(new Range(2, 1, 2, 5), 'your'),
					new Space(new Range(2, 5, 2, 6)),
					new PromptTemplateVariable(
						new Range(2, 6, 2, 6 + 11),
						'variable',
					),
					new VerticalTab(new Range(2, 17, 2, 18)),
					new Space(new Range(2, 18, 2, 19)),
					new Word(new Range(2, 19, 2, 19 + 2), 'is'),
					new Space(new Range(2, 21, 2, 22)),
					new Word(new Range(2, 22, 2, 22 + 4), 'done'),
					new NewLine(new Range(2, 26, 2, 27)),
					// third line
					new PromptTemplateVariable(
						new Range(3, 1, 3, 1 + 17),
						'their:variable',
					),
					new Space(new Range(3, 18, 3, 19)),
					new Word(new Range(3, 19, 3, 19 + 2), 'is'),
					new Space(new Range(3, 21, 3, 22)),
					new Word(new Range(3, 22, 3, 22 + 1), 'a'),
					new Space(new Range(3, 23, 3, 24)),
					new Word(new Range(3, 24, 3, 24 + 3), 'pun'),
					new NewLine(new Range(3, 27, 3, 28)),
					// forth line
					new Word(new Range(4, 1, 4, 4), 'and'),
					new Space(new Range(4, 4, 4, 5)),
					new Word(new Range(4, 5, 4, 5 + 3), 'the'),
					new Space(new Range(4, 8, 4, 9)),
					new PromptTemplateVariable(
						new Range(4, 9, 4, 9 + 11),
						'none:var',
					),
					new Space(new Range(4, 20, 4, 21)),
					new Word(new Range(4, 21, 4, 21 + 2), 'is'),
					new Space(new Range(4, 23, 4, 24)),
					new Word(new Range(4, 24, 4, 24 + 4), 'made'),
					new Space(new Range(4, 28, 4, 29)),
					new Word(new Range(4, 29, 4, 29 + 3), 'for'),
					new Space(new Range(4, 32, 4, 33)),
					new Word(new Range(4, 33, 4, 33 + 3), 'fun'),
				],
			);
		});
	});
});
