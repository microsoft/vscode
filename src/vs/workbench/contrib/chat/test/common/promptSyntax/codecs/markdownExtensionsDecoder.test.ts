/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { assert } from '../../../../../../../base/common/assert.js';
import { VSBuffer } from '../../../../../../../base/common/buffer.js';
import { randomInt } from '../../../../../../../base/common/numbers.js';
import { Range } from '../../../../../../../editor/common/core/range.js';
import { Text } from '../../../../../../../editor/common/codecs/baseToken.js';
import { newWriteableStream } from '../../../../../../../base/common/stream.js';
import { randomBoolean } from '../../../../../../../base/test/common/testUtils.js';
import { TestDecoder } from '../../../../../../../editor/test/common/utils/testDecoder.js';
import { Word } from '../../../../../../../editor/common/codecs/simpleCodec/tokens/word.js';
import { TChatPromptToken } from '../../../../common/promptSyntax/codecs/chatPromptDecoder.js';
import { NewLine } from '../../../../../../../editor/common/codecs/linesCodec/tokens/newLine.js';
import { TestSimpleDecoder } from '../../../../../../../editor/test/common/codecs/simpleDecoder.test.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../../base/test/common/utils.js';
import { CarriageReturn } from '../../../../../../../editor/common/codecs/linesCodec/tokens/carriageReturn.js';
import { Colon, Dash, Space, Tab, VerticalTab } from '../../../../../../../editor/common/codecs/simpleCodec/tokens/index.js';
import { FrontMatterHeader } from '../../../../../../../editor/common/codecs/markdownExtensionsCodec/tokens/frontMatterHeader.js';
import { MarkdownExtensionsDecoder } from '../../../../../../../editor/common/codecs/markdownExtensionsCodec/markdownExtensionsDecoder.js';
import { FrontMatterMarker, TMarkerToken } from '../../../../../../../editor/common/codecs/markdownExtensionsCodec/tokens/frontMatterMarker.js';

/**
 * Type for supported end-of-line tokens.
 */
type TEndOfLine = '\n' | '\r\n';

/**
 * End-of-line utility class for convenience.
 */
class TestEndOfLine extends Text<NewLine | CarriageReturn> {
	/**
	 * Create a new instance with provided end-of line type and
	 * a starting position.
	 */
	public static create(
		type: TEndOfLine,
		lineNumber: number,
		startColumn: number,
	): TestEndOfLine {
		// sanity checks
		assert(
			lineNumber >= 1,
			`Line number must be greater than or equal to 1, got '${lineNumber}'.`,
		);
		assert(
			startColumn >= 1,
			`Start column must be greater than or equal to 1, got '${startColumn}'.`,
		);

		const tokens = [];

		if (type === '\r\n') {
			tokens.push(new CarriageReturn(
				new Range(
					lineNumber,
					startColumn,
					lineNumber,
					startColumn + 1,
				),
			));

			startColumn += 1;
		}

		tokens.push(new NewLine(
			new Range(
				lineNumber,
				startColumn,
				lineNumber,
				startColumn + 1,
			),
		));

		return TestEndOfLine.fromTokens(tokens);
	}
}

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

/**
 * Front Matter marker utility class for testing purposes.
 */
class TestFrontMatterMarker extends FrontMatterMarker {
	/**
	 * Create a new instance with provided dashes count,
	 * line number, and an end-of-line type.
	 */
	public static create(
		dashCount: number,
		lineNumber: number,
		endOfLine: TEndOfLine,
	): TestFrontMatterMarker {
		const tokens: TMarkerToken[] = [];

		let columnNumber = 1;
		while (columnNumber <= dashCount) {
			tokens.push(new Dash(
				new Range(
					lineNumber,
					columnNumber,
					lineNumber,
					columnNumber + 1,
				),
			));

			columnNumber++;
		}

		const endOfLineTokens = TestEndOfLine.create(
			endOfLine,
			lineNumber,
			columnNumber,
		);
		tokens.push(...endOfLineTokens.tokens);

		return TestFrontMatterMarker.fromTokens(tokens);
	}
}

suite('MarkdownExtensionsDecoder', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	/**
	 * Create a Front Matter header start/end marker with a random length.
	 */
	const randomMarker = (
		maxDashCount: number = 10,
		minDashCount: number = 1,
	): string => {
		const dashCount = randomInt(maxDashCount, minDashCount);

		return new Array(dashCount).fill('-').join('');
	};

	suite('• Front Matter header', () => {
		suite('• successful cases', () => {
			test('• produces expected tokens', async () => {
				const test = disposables.add(
					new TestMarkdownExtensionsDecoder(),
				);

				// both line endings should result in the same result
				const newLine = (randomBoolean())
					? '\n'
					: '\r\n';

				const markerLength = randomInt(10, 3);

				const promptContents = [
					new Array(markerLength).fill('-').join(''),
					'variables: ',
					'  - name: value\v',
					new Array(markerLength).fill('-').join(''),
					'some text',
				];

				const startMarker = TestFrontMatterMarker.create(markerLength, 1, newLine);
				const endMarker = TestFrontMatterMarker.create(markerLength, 4, newLine);

				await test.run(
					promptContents.join(newLine),
					[
						// header
						new FrontMatterHeader(
							new Range(1, 1, 4, 1 + markerLength + newLine.length),
							startMarker,
							Text.fromTokens([
								new Word(new Range(2, 1, 2, 1 + 9), 'variables'),
								new Colon(new Range(2, 10, 2, 11)),
								new Space(new Range(2, 11, 2, 12)),
								...TestEndOfLine.create(newLine, 2, 12).tokens,
								new Space(new Range(3, 1, 3, 2)),
								new Space(new Range(3, 2, 3, 3)),
								new Dash(new Range(3, 3, 3, 4)),
								new Space(new Range(3, 4, 3, 5)),
								new Word(new Range(3, 5, 3, 5 + 4), 'name'),
								new Colon(new Range(3, 9, 3, 10)),
								new Space(new Range(3, 10, 3, 11)),
								new Word(new Range(3, 11, 3, 11 + 5), 'value'),
								new VerticalTab(new Range(3, 16, 3, 17)),
								...TestEndOfLine.create(newLine, 3, 17).tokens,
							]),
							endMarker,
						),
						// content after the header
						new Word(new Range(5, 1, 5, 1 + 4), 'some'),
						new Space(new Range(5, 5, 5, 6)),
						new Word(new Range(5, 6, 5, 6 + 4), 'text'),
					],
				);
			});

			test('• can contain dashes in the header contents', async () => {
				const test = disposables.add(
					new TestMarkdownExtensionsDecoder(),
				);

				// both line endings should result in the same result
				const newLine = (randomBoolean())
					? '\n'
					: '\r\n';

				const markerLength = randomInt(10, 4);

				// number of dashes inside the header contents it should not matter how many
				// dashes are there, but the count should not be equal to `markerLength`
				const dashesLength = (randomBoolean())
					? randomInt(markerLength - 1, 1)
					: randomInt(2 * markerLength, markerLength + 1);

				const promptContents = [
					// start marker
					new Array(markerLength).fill('-').join(''),
					// contents
					'variables: ',
					new Array(dashesLength).fill('-').join(''), // dashes inside the contents
					'  - name: value\t',
					// end marker
					new Array(markerLength).fill('-').join(''),
					'some text',
				];

				const startMarker = TestFrontMatterMarker.create(markerLength, 1, newLine);
				const endMarker = TestFrontMatterMarker.create(markerLength, 4, newLine);

				await test.run(
					promptContents.join(newLine),
					[
						// header
						new FrontMatterHeader(
							new Range(1, 1, 5, 1 + markerLength + newLine.length),
							startMarker,
							Text.fromTokens([
								new Word(new Range(2, 1, 2, 1 + 9), 'variables'),
								new Colon(new Range(2, 10, 2, 11)),
								new Space(new Range(2, 11, 2, 12)),
								...TestEndOfLine.create(newLine, 2, 12).tokens,
								// dashes inside the header
								...TestFrontMatterMarker.create(dashesLength, 3, newLine).dashTokens,
								...TestEndOfLine.create(newLine, 3, dashesLength + 1).tokens,
								// -
								new Space(new Range(4, 1, 4, 2)),
								new Space(new Range(4, 2, 4, 3)),
								new Dash(new Range(4, 3, 4, 4)),
								new Space(new Range(4, 4, 4, 5)),
								new Word(new Range(4, 5, 4, 5 + 4), 'name'),
								new Colon(new Range(4, 9, 4, 10)),
								new Space(new Range(4, 10, 4, 11)),
								new Word(new Range(4, 11, 4, 11 + 5), 'value'),
								new Tab(new Range(4, 16, 4, 17)),
								...TestEndOfLine.create(newLine, 4, 17).tokens,
							]),
							endMarker,
						),
						// content after the header
						new Word(new Range(6, 1, 6, 1 + 4), 'some'),
						new Space(new Range(6, 5, 6, 6)),
						new Word(new Range(6, 6, 6, 6 + 4), 'text'),
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

			test('• fails if header markers do not match (end marker is longer)', async () => {
				const test = disposables.add(
					new TestMarkdownExtensionsDecoder(),
				);

				const simpleDecoder = disposables.add(
					new TestSimpleDecoder(),
				);

				const marker = randomMarker(5);

				const promptContents = [
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

				const stringContents = promptContents.join(newLine);

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
});
