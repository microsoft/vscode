/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../../../base/test/common/utils.js';
import { getImageGenerationFieldCellGlyph, getImageGenerationFieldCellTone, ImageGenerationField, imageGenerationFieldGlyphs, imageGenerationFieldMessage, imageGenerationFieldTones } from '../../../../../browser/widget/chatContentParts/toolInvocationParts/chatImageGenerationField.js';

suite('ImageGenerationField', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	function render(seed: string, columns: number, rows: number, timeMs: number, still = false): ImageGenerationField {
		const field = new ImageGenerationField(seed);
		field.resize(columns, rows);
		field.update(timeMs, still);
		return field;
	}

	test('a still frame shows swells of denser glyphs over binary digits, fading out unevenly toward the edges', () => {
		assert.strictEqual(render('image-generation', 24, 16, 123456, true).toString(), [
			'  0100111001            ',
			' 000010·:···010111      ',
			'01001:****+==+=·0101000 ',
			'01:=*##+=::·00010110010 ',
			'00*###+:··000101001000  ',
			'0·###+:··1001:=+=:·0000 ',
			'10·+:···001·+####*=·1100',
			'0000010101·=######+:·001',
			'1010100000·+######*=·10 ',
			'01110···0·:+######*+:100',
			'10·:====::=+#######*=101',
			'0:+*++++++++*#######+00 ',
			'1·=++===+:::+:+=*****=0 ',
			'1100··0·111001···:1:··0 ',
			'000010101   0 101 00001 ',
			' 0000 1            0 0  ',
		].join('\n'));
	});

	test('the field fills a rectangle whose corners stay empty and whose edges fade gradually', () => {
		const field = render('image-generation', 33, 33, 5000);
		const strength = (column: number, row: number) => {
			const cell = field.cells[row * field.columns + column];
			return cell ? imageGenerationFieldTones[getImageGenerationFieldCellTone(cell)].strength : 0;
		};
		const ring = (inset: number) => {
			let total = 0;
			let count = 0;
			for (let index = inset; index < 33 - inset; index++) {
				total += strength(index, inset) + strength(index, 32 - inset) + strength(inset, index) + strength(32 - inset, index);
				count += 4;
			}
			return total / count;
		};
		const rings = [0, 1, 2, 3, 4, 5, 6].map(ring);
		const fadeBand = rings.slice(0, 5);
		assert.deepStrictEqual({
			emptyCorners: [[0, 0], [32, 0], [0, 32], [32, 32]].every(([column, row]) => strength(column, row) === 0),
			filledCenter: strength(16, 16) > 0,
			fadesIn: fadeBand.every((value, index) => index === 0 || value > fadeBand[index - 1]) && rings[0] < rings[6] / 2,
		}, { emptyCorners: true, filledCenter: true, fadesIn: true });
	});

	test('frames are deterministic per seed and time, animate over time, and decode to known glyphs and tones', () => {
		const frame = render('image-generation', 36, 12, 5000);
		assert.deepStrictEqual({
			repeatable: render('image-generation', 36, 12, 5000).toString() === frame.toString(),
			seeded: render('another-image', 36, 12, 5000).toString() !== frame.toString(),
			animated: render('image-generation', 36, 12, 5500).toString() !== frame.toString(),
			stillIgnoresTime: render('image-generation', 36, 12, 1000, true).toString() === render('image-generation', 36, 12, 9000, true).toString(),
			decodes: [...frame.cells].every(cell => cell === 0 || (getImageGenerationFieldCellGlyph(cell) < imageGenerationFieldGlyphs.length && getImageGenerationFieldCellTone(cell) >= 0 && getImageGenerationFieldCellTone(cell) < imageGenerationFieldTones.length)),
		}, { repeatable: true, seeded: true, animated: true, stillIgnoresTime: true, decodes: true });
	});

	test('read as 8-bit ASCII, every row of digits spells the message, and no letters are drawn', () => {
		const bits = [...imageGenerationFieldMessage].map(character => character.charCodeAt(0).toString(2).padStart(8, '0')).join('');
		const spellsMessage = (line: string) => Array.from({ length: bits.length }, (_, offset) => offset)
			.some(offset => [...line].every((character, index) => (character !== '0' && character !== '1') || character === bits[(offset + index) % bits.length]));
		const lines = render('image-generation', 42, 23, 0, true).toString().split('\n');
		assert.deepStrictEqual({
			spellsMessage: lines.every(spellsMessage),
			rejectsOtherBits: spellsMessage('111111'),
			drawsLetters: /[A-Z_!]/.test(lines.join('')),
		}, { spellsMessage: true, rejectsOtherBits: false, drawsLetters: false });
	});
});
