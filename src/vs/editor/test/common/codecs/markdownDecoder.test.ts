/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { TestDecoder } from '../utils/testDecoder.js';
import { Range } from '../../../common/core/range.js';
import { VSBuffer } from '../../../../base/common/buffer.js';
import { newWriteableStream } from '../../../../base/common/stream.js';
import { Tab } from '../../../common/codecs/simpleCodec/tokens/tab.js';
import { Word } from '../../../common/codecs/simpleCodec/tokens/word.js';
import { Space } from '../../../common/codecs/simpleCodec/tokens/space.js';
import { NewLine } from '../../../common/codecs/linesCodec/tokens/newLine.js';
import { VerticalTab } from '../../../common/codecs/simpleCodec/tokens/verticalTab.js';
import { MarkdownLink } from '../../../common/codecs/markdownCodec/tokens/markdownLink.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { MarkdownDecoder, TMarkdownToken } from '../../../common/codecs/markdownCodec/markdownDecoder.js';

// TODO: @legomushroom
// /**
//  * A reusable test utility that asserts that a `TestMarkdownDecoder` instance
//  * correctly decodes `inputData` into a stream of `TMarkdownToken` tokens.
//  *
//  * ## Examples
//  *
//  * ```typescript
//  * // create a new test utility instance
//  * const test = testDisposables.add(new TestMarkdownDecoder());
//  *
//  * // run the test
//  * await test.run(
//  *   ' hello world\n',
//  *   [
//  *     new Space(new Range(1, 1, 1, 2)),
//  *     new Word(new Range(1, 2, 1, 7), 'hello'),
//  *     new Space(new Range(1, 7, 1, 8)),
//  *     new Word(new Range(1, 8, 1, 13), 'world'),
//  *     new NewLine(new Range(1, 13, 1, 14)),
//  *   ],
//  * );
//  */
export class TestMarkdownDecoder extends TestDecoder<TMarkdownToken, MarkdownDecoder> {
	constructor() {
		const stream = newWriteableStream<VSBuffer>(null);

		super(stream, new MarkdownDecoder(stream));
	}
}

/**
 * TODO: @legomushroom - add more unit tests:
 *  - tests for the broken link cases
 *  - tests with exotic/unexpected characters inside caption and reference components
 *  - tests with prompt tokens inside of them
 */

suite('MarkdownDecoder', () => {
	const testDisposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('produces expected tokens', async () => {
		const test = testDisposables.add(
			new TestMarkdownDecoder(),
		);

		await test.run(
			' hello world\nhow are\t you [caption text](./some/file/path/refer🎨nce.md)?\v\n\n[(example)](another/path/with[-and-]-chars/folder)\t \n\t[#file:something.txt](/absolute/path/to/something.txt)',
			[
				// first line
				new Space(new Range(1, 1, 1, 2)),
				new Word(new Range(1, 2, 1, 7), 'hello'),
				new Space(new Range(1, 7, 1, 8)),
				new Word(new Range(1, 8, 1, 13), 'world'),
				new NewLine(new Range(1, 13, 1, 14)),
				// second line
				new Word(new Range(2, 1, 2, 4), 'how'),
				new Space(new Range(2, 4, 2, 5)),
				new Word(new Range(2, 5, 2, 8), 'are'),
				new Tab(new Range(2, 8, 2, 9)),
				new Space(new Range(2, 9, 2, 10)),
				new Word(new Range(2, 10, 2, 13), 'you'),
				new Space(new Range(2, 13, 2, 14)),
				new MarkdownLink(2, 14, '[caption text]', '(./some/file/path/refer🎨nce.md)'), // TODO: @legomushroom - doublecheck that the token does not intersect with the next one
				new Word(new Range(2, 60, 2, 61), '?'),
				new VerticalTab(new Range(2, 61, 2, 62)),
				new NewLine(new Range(2, 62, 2, 63)),
				// third line
				new NewLine(new Range(3, 1, 3, 2)),
				// fourth line
				new MarkdownLink(4, 1, '[(example)]', '(another/path/with[-and-]-chars/folder)'),
				new Tab(new Range(4, 51, 4, 52)),
				new Space(new Range(4, 52, 4, 53)),
				new NewLine(new Range(4, 53, 4, 54)),
				// fifth line
				new Tab(new Range(5, 1, 5, 2)),
				new MarkdownLink(5, 2, '[#file:something.txt]', '(/absolute/path/to/something.txt)'),
				// // // fourth line
				// // new Space(new Range(4, 1, 4, 2)),
				// // new Space(new Range(4, 2, 4, 3)),
				// // new Space(new Range(4, 3, 4, 4)),
				// // new Word(new Range(4, 4, 4, 10), '(test)'),
				// // new Space(new Range(4, 10, 4, 11)),
				// // new Space(new Range(4, 11, 4, 12)),
				// // new Word(new Range(4, 12, 4, 25), '[!@#$%^&*_+=]'),
				// // new FormFeed(new Range(4, 25, 4, 26)),
				// // new Space(new Range(4, 26, 4, 27)),
				// // new Space(new Range(4, 27, 4, 28)),
				// // new NewLine(new Range(4, 28, 4, 29)),
				// // // fifth line
				// // new Tab(new Range(5, 1, 5, 2)),
				// // new Tab(new Range(5, 2, 5, 3)),
				// // new Word(new Range(5, 3, 5, 6), '🤗❤'),
				// // new Space(new Range(5, 6, 5, 7)),
				// // new Tab(new Range(5, 7, 5, 8)),
				// // new NewLine(new Range(5, 8, 5, 9)),
				// // // sixth line
				// // new Space(new Range(6, 1, 6, 2)),
				// // new Word(new Range(6, 2, 6, 5), 'hey'),
				// // new VerticalTab(new Range(6, 5, 6, 6)),
				// // new Word(new Range(6, 6, 6, 11), 'there'),
				// // new CarriageReturn(new Range(6, 11, 6, 12)),
				// // new NewLine(new Range(6, 12, 6, 13)),
				// // // seventh line
				// // new CarriageReturn(new Range(7, 1, 7, 2)),
				// // new NewLine(new Range(7, 2, 7, 3)),
			],
		);
	});
});
