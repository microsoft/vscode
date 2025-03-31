/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { VSBuffer } from '../../../../../../../base/common/buffer.js';
import { randomInt } from '../../../../../../../base/common/numbers.js';
import { Range } from '../../../../../../../editor/common/core/range.js';
import { newWriteableStream } from '../../../../../../../base/common/stream.js';
import { randomBoolean } from '../../../../../../../base/test/common/testUtils.js';
import { TestDecoder } from '../../../../../../../editor/test/common/utils/testDecoder.js';
import { Word } from '../../../../../../../editor/common/codecs/simpleCodec/tokens/word.js';
import { Space } from '../../../../../../../editor/common/codecs/simpleCodec/tokens/index.js';
import { TChatPromptToken } from '../../../../common/promptSyntax/codecs/chatPromptDecoder.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../../base/test/common/utils.js';
import { TestSimpleDecoder } from '../../../../../../../editor/test/common/codecs/simpleDecoder.test.js';
import { MarkdownExtensionsDecoder } from '../../../../../../../editor/common/codecs/markdownExtensionsCodec/markdownExtensionsDecoder.js';
import { FrontMatterHeaderToken } from '../../../../../../../editor/common/codecs/markdownExtensionsCodec/tokens/frontMatterHeaderToken.js';

/**
 * Test decoder for the `MarkdownExtensionsDecoder` class.
 */
export class TestMarkdownExtensionsDecoder extends TestDecoder<TChatPromptToken, MarkdownExtensionsDecoder> {
	constructor(
	) {
		const stream = newWriteableStream<VSBuffer>(null);
		const decoder = new MarkdownExtensionsDecoder(stream);

		super(stream, decoder);
	}
}

suite('MarkdownExtensionsDecoder', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	/**
	 * Create a Front Matter header start/end marker with a random length.
	 */
	const randomMarker = (max: number = 10): string => {
		const dashCount = randomInt(max, 1);

		return new Array(dashCount).fill('-').join('');
	};

	suite('• Front Matter header', () => {
		suite('• successful cases', () => {
			test('• produces expected tokens', async () => {
				const test = disposables.add(
					new TestMarkdownExtensionsDecoder(),
				);

				const marker = randomMarker();

				const promptContents = [
					marker,
					'variables:',
					'  - name: value',
					marker,
					'some text',
				];

				// both line ending should result in the same result
				const newLine = (randomBoolean())
					? '\n'
					: '\r\n';

				await test.run(
					promptContents.join(newLine),
					[
						// header
						new FrontMatterHeaderToken(
							new Range(1, 1, 4, 1 + marker.length + newLine.length),
							`${marker}${newLine}`,
							`variables:${newLine}  - name: value${newLine}`,
							`${marker}${newLine}`,
						),
						// content after the header
						new Word(new Range(5, 1, 5, 1 + 4), 'some'),
						new Space(new Range(5, 5, 5, 6)),
						new Word(new Range(5, 6, 5, 6 + 4), 'text'),
					],
				);
			});
		});

		suite('• failure cases', () => {
			test('• fails if header starts not on the first line', async () => {
				const test = disposables.add(
					new TestMarkdownExtensionsDecoder(),
				);

				const simpleDecoder = disposables.add(
					new TestSimpleDecoder(),
				);

				const marker = randomMarker(5);

				// prompt contents
				const contents = [
					'',
					marker,
					'variables:',
					'  - name: value',
					marker,
					'some text',
				];

				// both line ending should result in the same result
				const newLine = (randomBoolean())
					? '\n'
					: '\r\n';

				const stringContents = contents.join(newLine);

				// send the same contents to the simple decoder
				simpleDecoder.sendData(stringContents);

				// in the failure case we expect tokens to be re-emitted, therefore
				// the list of tokens produced must be equal to the one of SimpleDecoder
				await test.run(
					stringContents,
					(await simpleDecoder.receiveTokens()),
				);
			});

			test('• fails if header markers do not match (start marker is longer)', async () => {
				const test = disposables.add(
					new TestMarkdownExtensionsDecoder(),
				);

				const simpleDecoder = disposables.add(
					new TestSimpleDecoder(),
				);

				const marker = randomMarker(5);

				// prompt contents
				const contents = [
					`${marker}${marker}`,
					'variables:',
					'  - name: value',
					marker,
					'some text',
				];

				// both line ending should result in the same result
				const newLine = (randomBoolean())
					? '\n'
					: '\r\n';

				const stringContents = contents.join(newLine);

				// send the same contents to the simple decoder
				simpleDecoder.sendData(stringContents);

				// in the failure case we expect tokens to be re-emitted, therefore
				// the list of tokens produced must be equal to the one of SimpleDecoder
				await test.run(
					stringContents,
					(await simpleDecoder.receiveTokens()),
				);
			});
		});

		test('• fails if header markers do not match (end marker is longer)', async () => {
			const test = disposables.add(
				new TestMarkdownExtensionsDecoder(),
			);

			const simpleDecoder = disposables.add(
				new TestSimpleDecoder(),
			);

			const marker = randomMarker(5);

			// prompt contents
			const contents = [
				marker,
				'variables:',
				'  - name: value',
				`${marker}${marker}`,
				'some text',
			];

			// both line ending should result in the same result
			const newLine = (randomBoolean())
				? '\n'
				: '\r\n';

			const stringContents = contents.join(newLine);

			// send the same contents to the simple decoder
			simpleDecoder.sendData(stringContents);

			// in the failure case we expect tokens to be re-emitted, therefore
			// the list of tokens produced must be equal to the one of SimpleDecoder
			await test.run(
				stringContents,
				(await simpleDecoder.receiveTokens()),
			);
		});
	});
});
