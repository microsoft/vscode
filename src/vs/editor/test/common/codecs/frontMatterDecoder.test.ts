/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Range } from '../../../common/core/range.js';
import { TestDecoder } from '../utils/testDecoder.js';
import { VSBuffer } from '../../../../base/common/buffer.js';
import { newWriteableStream } from '../../../../base/common/stream.js';
import { NewLine } from '../../../common/codecs/linesCodec/tokens/newLine.js';
import { DoubleQuote } from '../../../common/codecs/simpleCodec/tokens/doubleQuote.js';
import { type TSimpleDecoderToken } from '../../../common/codecs/simpleCodec/simpleDecoder.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { LeftBracket, RightBracket } from '../../../common/codecs/simpleCodec/tokens/brackets.js';
import { FrontMatterDecoder } from '../../../common/codecs/frontMatterCodec/frontMatterDecoder.js';
import { ExclamationMark, Quote, Tab, Word, Space, Colon } from '../../../common/codecs/simpleCodec/tokens/index.js';
import { FrontMatterBoolean, FrontMatterString, FrontMatterArray, FrontMatterRecord, FrontMatterRecordDelimiter, FrontMatterRecordName } from '../../../common/codecs/frontMatterCodec/tokens/index.js';

/**
 * Front Matter decoder for testing purposes.
 */
export class TestFrontMatterDecoder extends TestDecoder<TSimpleDecoderToken, FrontMatterDecoder> {
	constructor() {
		const stream = newWriteableStream<VSBuffer>(null);
		const decoder = new FrontMatterDecoder(stream);

		super(stream, decoder);
	}
}

suite('FrontMatterDecoder', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('• produces expected tokens', async () => {
		const test = disposables.add(
			new TestFrontMatterDecoder(),
		);

		await test.run(
			[
				'just: "write some yaml "',
				'write-some :\t[ \' just\t \',  "yaml!", true, , ,]',
				'anotherField \t\t\t  :  FALSE ',
			],
			[
				// first record
				new FrontMatterRecord([
					new FrontMatterRecordName([
						new Word(new Range(1, 1, 1, 1 + 4), 'just'),
					]),
					new FrontMatterRecordDelimiter([
						new Colon(new Range(1, 5, 1, 6)),
						new Space(new Range(1, 6, 1, 7)),
					]),
					new FrontMatterString([
						new DoubleQuote(new Range(1, 7, 1, 8)),
						new Word(new Range(1, 8, 1, 8 + 5), 'write'),
						new Space(new Range(1, 13, 1, 14)),
						new Word(new Range(1, 14, 1, 14 + 4), 'some'),
						new Space(new Range(1, 18, 1, 19)),
						new Word(new Range(1, 19, 1, 19 + 4), 'yaml'),
						new Space(new Range(1, 23, 1, 24)),
						new DoubleQuote(new Range(1, 24, 1, 25)),
					]),
				]),
				new NewLine(new Range(1, 25, 1, 26)),
				// second record
				new FrontMatterRecord([
					new FrontMatterRecordName([
						new Word(new Range(2, 1, 2, 1 + 10), 'write-some'),
					]),
					new FrontMatterRecordDelimiter([
						new Colon(new Range(2, 12, 2, 13)),
						new Tab(new Range(2, 13, 2, 14)),
					]),
					new FrontMatterArray([
						new LeftBracket(new Range(2, 14, 2, 15)),
						new FrontMatterString([
							new Quote(new Range(2, 16, 2, 17)),
							new Space(new Range(2, 17, 2, 18)),
							new Word(new Range(2, 18, 2, 18 + 4), 'just'),
							new Tab(new Range(2, 22, 2, 23)),
							new Space(new Range(2, 23, 2, 24)),
							new Quote(new Range(2, 24, 2, 25)),
						]),
						new FrontMatterString([
							new DoubleQuote(new Range(2, 28, 2, 29)),
							new Word(new Range(2, 29, 2, 29 + 4), 'yaml'),
							new ExclamationMark(new Range(2, 33, 2, 34)),
							new DoubleQuote(new Range(2, 34, 2, 35)),
						]),
						new FrontMatterBoolean(
							new Range(2, 37, 2, 37 + 4),
							true,
						),
						new RightBracket(new Range(2, 46, 2, 47)),
					]),
				]),
				new NewLine(new Range(2, 47, 2, 48)),
				// third record
				new FrontMatterRecord([
					new FrontMatterRecordName([
						new Word(new Range(3, 1, 3, 1 + 12), 'anotherField'),
					]),
					new FrontMatterRecordDelimiter([
						new Colon(new Range(3, 19, 3, 20)),
						new Space(new Range(3, 20, 3, 21)),
					]),
					new FrontMatterBoolean(
						new Range(3, 22, 3, 22 + 5),
						false,
					),
				]),
				new Space(new Range(3, 27, 3, 28)),
			]);
	});
});
