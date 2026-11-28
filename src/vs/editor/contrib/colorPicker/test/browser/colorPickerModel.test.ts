/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Color } from '../../../../../base/common/color.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IColorPresentation } from '../../../../common/languages.js';
import { ColorPickerModel, getColorNotation } from '../../browser/colorPickerModel.js';

suite('ColorPickerModel', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	suite('getColorNotation', () => {
		test('identifies hex colors', () => {
			assert.strictEqual(getColorNotation('#f00'), 'hex');
			assert.strictEqual(getColorNotation('#ff0000'), 'hex');
			assert.strictEqual(getColorNotation('#f008'), 'hex');
			assert.strictEqual(getColorNotation('#ff000088'), 'hex');
			assert.strictEqual(getColorNotation('  #fff  '), 'hex');
			assert.strictEqual(getColorNotation("'#f00'"), 'hex');
		});

		test('identifies rgb and rgba colors', () => {
			assert.strictEqual(getColorNotation('rgb(255, 0, 0)'), 'rgb');
			assert.strictEqual(getColorNotation('rgba(255, 0, 0, 1)'), 'rgb');
			assert.strictEqual(getColorNotation('rgba(255, 0, 0, 0.5)'), 'rgb');
			assert.strictEqual(getColorNotation('rgb'), 'rgb');
			assert.strictEqual(getColorNotation('rgba'), 'rgb');
		});

		test('identifies hsl and hsla colors', () => {
			assert.strictEqual(getColorNotation('hsl(0, 100%, 50%)'), 'hsl');
			assert.strictEqual(getColorNotation('hsla(0, 100%, 50%, 1)'), 'hsl');
			assert.strictEqual(getColorNotation('hsla(0, 100%, 50%, 0.5)'), 'hsl');
			assert.strictEqual(getColorNotation('hsl'), 'hsl');
			assert.strictEqual(getColorNotation('hsla'), 'hsl');
		});

		test('identifies modern CSS color functions', () => {
			assert.strictEqual(getColorNotation('hwb(0, 0%, 0%)'), 'hwb');
			assert.strictEqual(getColorNotation('lab(50% 40 59.5)'), 'lab');
			assert.strictEqual(getColorNotation('lch(50% 70 59.5)'), 'lch');
			assert.strictEqual(getColorNotation('oklab(0.5 0.1 0.1)'), 'oklab');
			assert.strictEqual(getColorNotation('oklch(0.5 0.1 0.1)'), 'oklch');
			assert.strictEqual(getColorNotation('color(display-p3 1 0 0)'), 'color');
		});

		test('returns undefined for named colors or unrecognized strings', () => {
			assert.strictEqual(getColorNotation('white'), undefined);
			assert.strictEqual(getColorNotation('rebeccapurple'), undefined);
			assert.strictEqual(getColorNotation('red'), undefined);
			assert.strictEqual(getColorNotation(''), undefined);
		});
	});

	suite('guessColorPresentation', () => {
		const opaquePresentations: IColorPresentation[] = [
			{ label: 'rgb(255, 0, 0)' },
			{ label: 'hsl(0, 100%, 50%)' },
			{ label: '#ff0000' }
		];

		const transparentPresentations: IColorPresentation[] = [
			{ label: 'rgba(255, 0, 0, 0.533)' },
			{ label: 'hsla(0, 100%, 50%, 0.53)' },
			{ label: '#ff000088' }
		];

		test('keeps hex for short hex #f00 (#350524)', () => {
			const model = disposables.add(new ColorPickerModel(Color.red, opaquePresentations, 0));
			model.guessColorPresentation(Color.red, '#f00');
			assert.strictEqual(model.presentation.label, '#ff0000');
		});

		test('keeps hex for 4-digit hex #f008 (#350524)', () => {
			const model = disposables.add(new ColorPickerModel(Color.red, transparentPresentations, 0));
			model.guessColorPresentation(Color.red, '#f008');
			assert.strictEqual(model.presentation.label, '#ff000088');
		});

		test('keeps hsl for opaque hsla(0, 100%, 50%, 1) (#350524)', () => {
			const model = disposables.add(new ColorPickerModel(Color.red, opaquePresentations, 0));
			model.guessColorPresentation(Color.red, 'hsla(0, 100%, 50%, 1)');
			assert.strictEqual(model.presentation.label, 'hsl(0, 100%, 50%)');
		});

		test('keeps rgb for opaque rgba(255, 0, 0, 1) (#350524)', () => {
			const model = disposables.add(new ColorPickerModel(Color.red, opaquePresentations, 1));
			model.guessColorPresentation(Color.red, 'rgba(255, 0, 0, 1)');
			assert.strictEqual(model.presentation.label, 'rgb(255, 0, 0)');
		});

		test('keeps hex for full hex #ff0000', () => {
			const model = disposables.add(new ColorPickerModel(Color.red, opaquePresentations, 0));
			model.guessColorPresentation(Color.red, '#ff0000');
			assert.strictEqual(model.presentation.label, '#ff0000');
		});

		test('keeps hsl for hsl(0, 100%, 50%)', () => {
			const model = disposables.add(new ColorPickerModel(Color.red, opaquePresentations, 0));
			model.guessColorPresentation(Color.red, 'hsl(0, 100%, 50%)');
			assert.strictEqual(model.presentation.label, 'hsl(0, 100%, 50%)');
		});

		test('handles quoted strings from TypeScript/JavaScript files', () => {
			const model = disposables.add(new ColorPickerModel(Color.red, opaquePresentations, 0));
			model.guessColorPresentation(Color.red, "'#f00'");
			assert.strictEqual(model.presentation.label, '#ff0000');
		});

		test('falls back to initial presentation for named colors', () => {
			const model = disposables.add(new ColorPickerModel(Color.red, opaquePresentations, 0));
			model.guessColorPresentation(Color.red, 'white');
			assert.strictEqual(model.presentation.label, 'rgb(255, 0, 0)');
		});
	});
});
