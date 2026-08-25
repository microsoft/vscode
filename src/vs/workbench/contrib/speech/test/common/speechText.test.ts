/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { punctuateLines, splitForSynthesis, stripEmoji } from '../../common/speechText.js';

suite('stripEmoji', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('removes emoji and the space they leave behind', () => {
		assert.deepStrictEqual({
			trailing: stripEmoji('Done. ✅'),
			leading: stripEmoji('✅ Done.'),
			inline: stripEmoji('Build 🚀 finished'),
			beforePunctuation: stripEmoji('All good 🎉.'),
			several: stripEmoji('Shipped 🎉🚀✨ today'),
			onlyEmoji: stripEmoji('✅'),
			empty: stripEmoji('')
		}, {
			trailing: 'Done.',
			leading: 'Done.',
			inline: 'Build finished',
			beforePunctuation: 'All good.',
			several: 'Shipped today',
			onlyEmoji: '',
			empty: ''
		});
	});

	test('removes emoji made of several code points', () => {
		assert.deepStrictEqual({
			zwjSequence: stripEmoji('Ask 👨‍💻 the team'),
			skinTone: stripEmoji('Nice 👍🏽 work'),
			flag: stripEmoji('Ships to 🇺🇸 only'),
			keycap: stripEmoji('Step 1️⃣ first'),
			// The variation selector is optional in the Unicode keycap grammar.
			keycapWithoutVariationSelector: stripEmoji('Step 1\u20E3 first'),
			variationSelector: stripEmoji('Warning ⚠️ ahead')
		}, {
			zwjSequence: 'Ask the team',
			skinTone: 'Nice work',
			flag: 'Ships to only',
			keycap: 'Step first',
			keycapWithoutVariationSelector: 'Step first',
			variationSelector: 'Warning ahead'
		});
	});

	test('keeps characters that must still be spoken', () => {
		// `\p{Emoji}` would also match these, which is why it is not used.
		assert.deepStrictEqual({
			digits: stripEmoji('Fixed 3 of 10 tests'),
			hash: stripEmoji('See issue #123'),
			asterisk: stripEmoji('Use * as a wildcard'),
			currency: stripEmoji('Costs $5 or £4'),
			math: stripEmoji('a ± b ≤ c'),
			accented: stripEmoji('Café résumé'),
			cjk: stripEmoji('日本語のテキスト')
		}, {
			digits: 'Fixed 3 of 10 tests',
			hash: 'See issue #123',
			asterisk: 'Use * as a wildcard',
			currency: 'Costs $5 or £4',
			math: 'a ± b ≤ c',
			accented: 'Café résumé',
			cjk: '日本語のテキスト'
		});
	});

	test('keeps textual symbols that are read as part of the sentence', () => {
		// These are `Extended_Pictographic` but belong to the text, unless they
		// explicitly ask for emoji presentation.
		assert.deepStrictEqual({
			copyright: stripEmoji('© 2024 Microsoft'),
			registered: stripEmoji('Word® processor'),
			trademark: stripEmoji('VS Code™ ships'),
			doubleExclamation: stripEmoji('Careful ‼ here'),
			withEmojiPresentation: stripEmoji('Shipped ©️ today')
		}, {
			copyright: '© 2024 Microsoft',
			registered: 'Word® processor',
			trademark: 'VS Code™ ships',
			doubleExclamation: 'Careful ‼ here',
			withEmojiPresentation: 'Shipped today'
		});
	});

	test('keeps the line structure of a response', () => {
		assert.strictEqual(
			stripEmoji('Done. ✅\nThis round\'s outcome.\n\nAll accurate. 🎉'),
			'Done.\nThis round\'s outcome.\n\nAll accurate.'
		);
	});
});

suite('punctuateLines', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('ends every line with punctuation so the reader pauses between them', () => {
		assert.deepStrictEqual({
			// A heading only ends in a line break, which is not a pause.
			headingAndItems: punctuateLines('This round\'s outcome\nPDF-verified 5 claims\n\nall accurate.'),
			alreadyPunctuated: punctuateLines('Is it done?\nyes!\nmaybe...'),
			trailingSpaces: punctuateLines('A heading   \nsome text'),
			blankLinesKept: punctuateLines('one\n\ntwo'),
			empty: punctuateLines('')
		}, {
			headingAndItems: 'This round\'s outcome.\nPDF-verified 5 claims.\n\nall accurate.',
			alreadyPunctuated: 'Is it done?\nyes!\nmaybe...',
			trailingSpaces: 'A heading.\nsome text.',
			blankLinesKept: 'one.\n\ntwo.',
			empty: ''
		});
	});
});

suite('splitForSynthesis', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('splits long text on sentence boundaries and keeps pieces within the limit', () => {
		const sentences = 'First sentence here. Second sentence here. Third sentence here.';
		const longWordy = `${'word '.repeat(40)}end.`;

		const pieces = splitForSynthesis(sentences, 30, 30);
		const wordPieces = splitForSynthesis(longWordy, 30, 30);

		assert.deepStrictEqual({
			shortIsUntouched: splitForSynthesis('Hello there.', 30, 30),
			empty: splitForSynthesis('   ', 30, 30),
			sentencePieces: pieces,
			everyPieceWithinLimit: [...pieces, ...wordPieces].every(piece => piece.length <= 30),
			noTextLost: wordPieces.join(' ') === longWordy.trim()
		}, {
			shortIsUntouched: ['Hello there.'],
			empty: [],
			sentencePieces: ['First sentence here.', 'Second sentence here.', 'Third sentence here.'],
			everyPieceWithinLimit: true,
			noTextLost: true
		});
	});

	test('keeps the first piece short so speech starts quickly', () => {
		const text = 'Short one. This is a considerably longer sentence that would otherwise be merged with the first one.';

		const pieces = splitForSynthesis(text, 200, 20);

		assert.deepStrictEqual({
			firstIsShort: pieces[0],
			laterPiecesMayBeLonger: pieces.length === 2 && pieces[1].length > 20,
			noTextLost: pieces.join(' ') === text
		}, {
			firstIsShort: 'Short one.',
			laterPiecesMayBeLonger: true,
			noTextLost: true
		});
	});

	test('splits a single word that is longer than the limit', () => {
		// A URL or a file path has no boundary to split on, and leaving it whole
		// would let the model silently truncate everything past its token limit.
		const url = `https://example.com/${'a'.repeat(80)}`;

		const alone = splitForSynthesis('x'.repeat(100), 30, 30);
		const inSentence = splitForSynthesis(`See ${url} now.`, 30, 30);

		assert.deepStrictEqual({
			longWordIsSplit: alone,
			everyPieceWithinLimit: [...alone, ...inSentence].every(piece => piece.length <= 30),
			noTextLost: inSentence.join('').replace(/\s/g, '') === `See ${url} now.`.replace(/\s/g, '')
		}, {
			longWordIsSplit: ['x'.repeat(30), 'x'.repeat(30), 'x'.repeat(30), 'x'.repeat(10)],
			everyPieceWithinLimit: true,
			noTextLost: true
		});
	});
});
