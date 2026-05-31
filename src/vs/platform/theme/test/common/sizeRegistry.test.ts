/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { getSizeRegistry, registerSize, size, sizeForAllThemes, sizeValueToCss, asCssVariableName, asCssVariable } from '../../common/sizeRegistry.js';
// Import baseSizes to ensure base size tokens are registered
import { bodyFontSize, bodyFontSizeSmall, codiconFontSize, cornerRadiusMedium, cornerRadiusSmall, cornerRadiusLarge, strokeThickness } from '../../common/sizes/baseSizes.js';

suite('Size Registry', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('registerSize should register a size token', () => {
		const id = registerSize('test.size', { dark: size(10, 'px'), light: size(10, 'px'), hcDark: size(10, 'px'), hcLight: size(10, 'px') }, 'Test size');
		assert.strictEqual(id, 'test.size');

		const sizes = getSizeRegistry().getSizes();
		const testSize = sizes.find(s => s.id === 'test.size');
		assert.ok(testSize);
		assert.strictEqual(testSize.description, 'Test size');

		getSizeRegistry().deregisterSize('test.size');
	});

	test('sizeValueToCss should convert size value to CSS string', () => {
		assert.strictEqual(sizeValueToCss(size(10, 'px')), '10px');
		assert.strictEqual(sizeValueToCss(size(1.5, 'rem')), '1.5rem');
		assert.strictEqual(sizeValueToCss(size(100, '%')), '100%');
		assert.strictEqual(sizeValueToCss(size(1.2, 'em')), '1.2em');
	});

	test('asCssVariableName should convert identifier to CSS variable name', () => {
		assert.strictEqual(asCssVariableName('fontSize'), '--vscode-fontSize');
		assert.strictEqual(asCssVariableName('corner.radius'), '--vscode-corner-radius');
		assert.strictEqual(asCssVariableName('font.size.large'), '--vscode-font-size-large');
	});

	test('asCssVariable should create CSS variable reference', () => {
		assert.strictEqual(asCssVariable('fontSize'), 'var(--vscode-fontSize)');
		assert.strictEqual(asCssVariable('cornerRadius'), 'var(--vscode-cornerRadius)');
	});

	test('deregisterSize should remove a size token', () => {
		registerSize('test.remove', { dark: size(5, 'px'), light: size(5, 'px'), hcDark: size(5, 'px'), hcLight: size(5, 'px') }, 'Test remove');

		let sizes = getSizeRegistry().getSizes();
		assert.ok(sizes.find(s => s.id === 'test.remove'));

		getSizeRegistry().deregisterSize('test.remove');

		sizes = getSizeRegistry().getSizes();
		assert.ok(!sizes.find(s => s.id === 'test.remove'));
	});

	test('size tokens should be available', () => {
		const sizes = getSizeRegistry().getSizes();

		// Check that base sizes are registered
		assert.ok(sizes.find(s => s.id === bodyFontSize), 'bodyFontSize should be registered');
		assert.ok(sizes.find(s => s.id === bodyFontSizeSmall), 'bodyFontSizeSmall should be registered');
		assert.ok(sizes.find(s => s.id === codiconFontSize), 'codiconFontSize should be registered');
		assert.ok(sizes.find(s => s.id === cornerRadiusMedium), 'cornerRadius.medium should be registered');
		assert.ok(sizes.find(s => s.id === cornerRadiusSmall), 'cornerRadius.small should be registered');
		assert.ok(sizes.find(s => s.id === cornerRadiusLarge), 'cornerRadius.large should be registered');
		assert.ok(sizes.find(s => s.id === strokeThickness), 'strokeThickness should be registered');
	});

	test('sizeForAllThemes should create same value for all themes', () => {
		const sizeDefaults = sizeForAllThemes(10, 'px');
		assert.deepStrictEqual(sizeDefaults.light, { value: 10, unit: 'px' });
		assert.deepStrictEqual(sizeDefaults.dark, { value: 10, unit: 'px' });
		assert.deepStrictEqual(sizeDefaults.hcDark, { value: 10, unit: 'px' });
		assert.deepStrictEqual(sizeDefaults.hcLight, { value: 10, unit: 'px' });
	});

	test('registerSize should work with sizeForAllThemes', () => {
		const id = registerSize('test.allThemes', sizeForAllThemes(5, 'rem'), 'Test all themes');
		assert.strictEqual(id, 'test.allThemes');

		const sizes = getSizeRegistry().getSizes();
		const testSize = sizes.find(s => s.id === 'test.allThemes');
		assert.ok(testSize);

		getSizeRegistry().deregisterSize('test.allThemes');
	});
});
