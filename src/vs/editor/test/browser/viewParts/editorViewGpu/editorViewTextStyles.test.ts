/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { applyTextStyleRuns } from '../../../../browser/viewParts/editorViewGpu/editorViewTextStyles.js';
import type { TokenInput } from '../../../../browser/viewParts/editorViewGpu/editorViewTypes.js';

suite('applyTextStyleRuns', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	const token = (startColumn: number, endColumn: number, foreground: number, extra: Partial<TokenInput> = {}): TokenInput => ({ startColumn, endColumn, foreground, ...extra });
	const compact = (tokens: TokenInput[]) => tokens.map(t => [t.startColumn, t.endColumn, t.foreground.toString(16), t.bold ? 'b' : '', t.italic ? 'i' : ''].join(' '));

	test('splits tokens at run edges and patches only covered pieces', () => {
		const tokens = [token(0, 4, 0x111111ff), token(4, 10, 0x222222ff, { bold: true })];
		assert.deepStrictEqual(compact(applyTextStyleRuns(tokens, [
			{ start: 2, end: 6, style: { foreground: 0xffd700ff } },
			{ start: 8, end: 9, style: { italic: true } },
		])), [
			'0 2 111111ff  ',
			'2 4 ffd700ff  ',
			'4 6 ffd700ff b ',
			'6 8 222222ff b ',
			'8 9 222222ff b i',
			'9 10 222222ff b ',
		]);
	});

	test('opacity multiplies the alpha of the resulting foreground', () => {
		const tokens = [token(0, 3, 0x102030ff), token(3, 6, 0x405060ff)];
		assert.deepStrictEqual(compact(applyTextStyleRuns(tokens, [
			{ start: 0, end: 3, style: { opacity: 0.5 } },
			{ start: 3, end: 6, style: { foreground: 0xffffff80, opacity: 0.5 } },
		])), [
			'0 3 10203080  ',
			'3 6 ffffff40  ',
		]);
	});

	test('runs outside the tokens and empty runs change nothing', () => {
		const tokens = [token(0, 5, 0x111111ff)];
		assert.deepStrictEqual(compact(applyTextStyleRuns(tokens, [])), ['0 5 111111ff  ']);
		assert.deepStrictEqual(compact(applyTextStyleRuns(tokens, [{ start: 7, end: 9, style: { bold: true } }])), ['0 5 111111ff  ']);
	});

	test('recolored pieces keep the token\'s own color as their base foreground', () => {
		const tokens = [token(0, 6, 0x111111ff)];
		const inline = applyTextStyleRuns(tokens, [
			{ start: 0, end: 2, style: { foreground: 0xffd700ff } },
			{ start: 4, end: 6, style: { bold: true } },
		]);
		const selected = applyTextStyleRuns(inline, [{ start: 1, end: 5, style: { foreground: 0xffffffff } }]);
		assert.deepStrictEqual(selected.map(t => [t.startColumn, t.endColumn, t.foreground.toString(16), t.baseForeground?.toString(16)]), [
			[0, 1, 'ffd700ff', '111111ff'],
			[1, 2, 'ffffffff', '111111ff'],
			[2, 4, 'ffffffff', '111111ff'],
			[4, 5, 'ffffffff', '111111ff'],
			[5, 6, '111111ff', undefined],
		]);
	});
});
