/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Color, HSVA } from '../../../../../base/common/color.js';
import { ColorPickerModel } from '../../browser/colorPickerModel.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';

suite('ColorPickerModel', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('guessColorPresentation exact match', () => {
		const color = new Color(new HSVA(0, 0, 0, 1));
		const presentations = [
			{ label: 'rgb(0, 0, 0)' },
			{ label: '#000000' },
			{ label: 'hsl(0, 0%, 0%)' }
		];
		const model = new ColorPickerModel(color, presentations, 0);

		model.guessColorPresentation(color, '#000000');
		assert.strictEqual(model.presentation.label, '#000000');

		model.dispose();
	});

	test('guessColorPresentation prefix match', () => {
		const color = new Color(new HSVA(0, 0, 0, 1));
		const presentations = [
			{ label: 'rgb(0, 0, 0)' },
			{ label: '#000000' },
			{ label: 'hsl(0, 0%, 0%)' }
		];
		const model = new ColorPickerModel(color, presentations, 0);

		// Test prefix match for 'hsl(...)' where the full string doesn't match perfectly, but prefix 'hsl' does
		model.guessColorPresentation(color, 'hsl(0, 100%, 50%)');
		assert.strictEqual(model.presentation.label, 'hsl(0, 0%, 0%)');

		model.dispose();
	});

	test('guessColorPresentation no match defaults to current presentation', () => {
		const color = new Color(new HSVA(0, 0, 0, 1));
		const presentations = [
			{ label: 'rgb(0, 0, 0)' },
			{ label: '#000000' },
			{ label: 'hsl(0, 0%, 0%)' }
		];
		const model = new ColorPickerModel(color, presentations, 0);

		// No exact or prefix match
		model.guessColorPresentation(color, 'unknown(0, 0, 0)');
		assert.strictEqual(model.presentation.label, 'rgb(0, 0, 0)');

		model.dispose();
	});
});
