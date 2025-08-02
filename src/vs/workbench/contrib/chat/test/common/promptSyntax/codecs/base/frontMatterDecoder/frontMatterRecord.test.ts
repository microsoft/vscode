/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Range } from '../../../../../../../../../editor/common/core/range.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../../../../base/test/common/utils.js';
import { FrontMatterSequence } from '../../../../../../common/promptSyntax/codecs/base/frontMatterCodec/tokens/frontMatterSequence.js';
import { Colon, LeftBracket, Quote, RightBracket, Space, Tab, VerticalTab, Word } from '../../../../../../common/promptSyntax/codecs/base/simpleCodec/tokens/tokens.js';
import { FrontMatterArray, FrontMatterBoolean, FrontMatterRecord, FrontMatterRecordDelimiter, FrontMatterRecordName, FrontMatterString } from '../../../../../../common/promptSyntax/codecs/base/frontMatterCodec/tokens/index.js';

suite('FrontMatterBoolean', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	suite('trimValueEnd()', () => {
		test('trims space tokens at the end of record\'s value', () => {
			const recordName = new FrontMatterRecordName([
				new Word(
					new Range(4, 10, 4, 10 + 3),
					'key',
				),
			]);

			const recordDelimiter = new FrontMatterRecordDelimiter([
				new Colon(new Range(4, 14, 4, 15)),
				new VerticalTab(new Range(4, 15, 4, 16)),
			]);

			const recordValue = new FrontMatterSequence([
				new Word(new Range(4, 18, 4, 18 + 10), 'some-value'),
				new VerticalTab(new Range(4, 28, 4, 29)),
				new Tab(new Range(4, 29, 4, 30)),
				new Space(new Range(4, 30, 4, 31)),
				new Tab(new Range(4, 31, 4, 32)),
			]);

			const record = new FrontMatterRecord([
				recordName, recordDelimiter, recordValue,
			]);

			const trimmed = record.trimValueEnd();
			assert.deepStrictEqual(
				trimmed,
				[
					new VerticalTab(new Range(4, 28, 4, 29)),
					new Tab(new Range(4, 29, 4, 30)),
					new Space(new Range(4, 30, 4, 31)),
					new Tab(new Range(4, 31, 4, 32)),
				],
				'Must return correct trimmed list of spacing tokens.',
			);

			assert(
				record.range.equalsRange(
					new Range(4, 10, 4, 28),
				),
				'Must correctly update token range.',
			);
		});

		suite('does not trim non-sequence value tokens', () => {
			test('boolean', () => {
				const recordName = new FrontMatterRecordName([
					new Word(
						new Range(4, 10, 4, 10 + 3),
						'yke',
					),
				]);

				const recordDelimiter = new FrontMatterRecordDelimiter([
					new Colon(new Range(4, 14, 4, 15)),
					new VerticalTab(new Range(4, 15, 4, 16)),
				]);

				const recordValue = new FrontMatterBoolean(
					new Word(new Range(4, 18, 4, 18 + 4), 'true'),
				);

				const record = new FrontMatterRecord([
					recordName, recordDelimiter, recordValue,
				]);

				const trimmed = record.trimValueEnd();
				assert.deepStrictEqual(
					trimmed,
					[],
					'Must return empty list of trimmed spacing tokens.',
				);

				assert(
					record.range.equalsRange(
						new Range(4, 10, 4, 22),
					),
					'Must not update token range.',
				);
			});

			test('quoted string', () => {
				const recordName = new FrontMatterRecordName([
					new Word(
						new Range(4, 10, 4, 10 + 3),
						'eyk',
					),
				]);

				const recordDelimiter = new FrontMatterRecordDelimiter([
					new Colon(new Range(4, 14, 4, 15)),
					new VerticalTab(new Range(4, 15, 4, 16)),
				]);

				const recordValue = new FrontMatterString([
					new Quote(new Range(4, 18, 4, 19)),
					new Word(new Range(4, 19, 4, 19 + 10), 'some text'),
					new Quote(new Range(4, 29, 4, 30)),
				]);

				const record = new FrontMatterRecord([
					recordName, recordDelimiter, recordValue,
				]);

				const trimmed = record.trimValueEnd();
				assert.deepStrictEqual(
					trimmed,
					[],
					'Must return empty list of trimmed spacing tokens.',
				);

				assert(
					record.range.equalsRange(
						new Range(4, 10, 4, 30),
					),
					'Must not update token range.',
				);
			});

			test('array', () => {
				const recordName = new FrontMatterRecordName([
					new Word(
						new Range(4, 10, 4, 10 + 3),
						'yek',
					),
				]);

				const recordDelimiter = new FrontMatterRecordDelimiter([
					new Colon(new Range(4, 14, 4, 15)),
					new VerticalTab(new Range(4, 15, 4, 16)),
				]);

				const recordValue = new FrontMatterArray([
					new LeftBracket(new Range(4, 18, 4, 19)),
					new FrontMatterString([
						new Quote(new Range(4, 18, 4, 19)),
						new Word(new Range(4, 19, 4, 19 + 10), 'some text'),
						new Quote(new Range(4, 29, 4, 30)),
					]),
					new FrontMatterBoolean(
						new Word(new Range(4, 34, 4, 34 + 4), 'true'),
					),
					new RightBracket(new Range(4, 38, 4, 39)),
				]);

				const record = new FrontMatterRecord([
					recordName, recordDelimiter, recordValue,
				]);

				const trimmed = record.trimValueEnd();
				assert.deepStrictEqual(
					trimmed,
					[],
					'Must return empty list of trimmed spacing tokens.',
				);

				assert(
					record.range.equalsRange(
						new Range(4, 10, 4, 39),
					),
					'Must not update token range.',
				);
			});
		});
	});
});
