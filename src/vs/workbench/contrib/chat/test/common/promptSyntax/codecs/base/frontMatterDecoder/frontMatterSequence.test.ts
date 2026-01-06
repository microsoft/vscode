/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Range } from '../../../../../../../../../editor/common/core/range.js';
import { FrontMatterValueToken } from '../../../../../../common/promptSyntax/codecs/base/frontMatterCodec/tokens/index.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../../../../base/test/common/utils.js';
import { Space, Tab, VerticalTab, Word } from '../../../../../../common/promptSyntax/codecs/base/simpleCodec/tokens/tokens.js';
import { FrontMatterSequence } from '../../../../../../common/promptSyntax/codecs/base/frontMatterCodec/tokens/frontMatterSequence.js';

suite('FrontMatterSequence', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('extends \'FrontMatterValueToken\'', () => {
		const sequence = new FrontMatterSequence([
			new Word(
				new Range(1, 1, 1, 5),
				'test',
			),
		]);

		assert(
			sequence instanceof FrontMatterValueToken,
			'Must extend FrontMatterValueToken class.',
		);
	});

	suite('trimEnd()', () => {
		test('trims space tokens at the end of the sequence', () => {
			const sequence = new FrontMatterSequence([
				new Word(new Range(4, 18, 4, 18 + 10), 'some-value'),
				new Space(new Range(4, 28, 4, 29)),
				new Space(new Range(4, 29, 4, 30)),
				new VerticalTab(new Range(4, 30, 4, 31)),
				new Tab(new Range(4, 31, 4, 32)),
				new Space(new Range(4, 32, 4, 33)),
			]);

			const trimmed = sequence.trimEnd();
			assert.deepStrictEqual(
				trimmed,
				[
					new Space(new Range(4, 28, 4, 29)),
					new Space(new Range(4, 29, 4, 30)),
					new VerticalTab(new Range(4, 30, 4, 31)),
					new Tab(new Range(4, 31, 4, 32)),
					new Space(new Range(4, 32, 4, 33)),
				],
				'Must return correct trimmed list of spacing tokens.',
			);

			assert(
				sequence.range.equalsRange(
					new Range(4, 18, 4, 28),
				),
				'Must correctly update token range.',
			);
		});

		test('remains functional if only spacing tokens were present', () => {
			const sequence = new FrontMatterSequence([
				new Space(new Range(4, 28, 4, 29)),
				new Space(new Range(4, 29, 4, 30)),
				new VerticalTab(new Range(4, 30, 4, 31)),
				new Tab(new Range(4, 31, 4, 32)),
				new Space(new Range(4, 32, 4, 33)),
			]);

			const trimmed = sequence.trimEnd();
			assert.deepStrictEqual(
				trimmed,
				[
					new Space(new Range(4, 28, 4, 29)),
					new Space(new Range(4, 29, 4, 30)),
					new VerticalTab(new Range(4, 30, 4, 31)),
					new Tab(new Range(4, 31, 4, 32)),
					new Space(new Range(4, 32, 4, 33)),
				],
				'Must return correct trimmed list of spacing tokens.',
			);

			assert(
				sequence.range.equalsRange(
					new Range(4, 28, 4, 28),
				),
				'Must correctly update token range.',
			);

			assert.deepStrictEqual(
				sequence.children,
				[
					new Word(new Range(4, 28, 4, 28), ''),
				],
				'Must contain a single empty token.',
			);
		});
	});

	test('throws if no tokens provided', () => {
		assert.throws(() => {
			new FrontMatterSequence([]);
		});
	});
});
