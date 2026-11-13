/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { getSizeRegistry, registerSize, size, sizeForAllThemes, sizeValueToCss, asCssVariableName, asCssVariable, panelsCornerRadius, toolsPanelCornerRadius, primarySideBarCornerRadius, activityBarCornerRadius } from '../../common/sizeRegistry.js';
import { TestColorTheme } from './testThemeService.js';
import { toDisposable } from '../../../../base/common/lifecycle.js';
import { ColorScheme } from '../../common/theme.js';
// Import baseSizes to ensure base size tokens are registered
import { bodyFontSize, bodyFontSizeSmall, codiconFontSize, cornerRadiusMedium, cornerRadiusSmall, cornerRadiusLarge, strokeThickness } from '../../common/sizes/baseSizes.js';

suite('Size Registry', () => {

	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('resolves primitive, role and component sizes in specificity order', () => {
		const registry = getSizeRegistry();
		const theme = new TestColorTheme();
		const tokens = [cornerRadiusLarge, panelsCornerRadius, toolsPanelCornerRadius, primarySideBarCornerRadius, activityBarCornerRadius];
		const resolve = (customizations: Record<string, number>) => tokens.map(id => registry.resolveSize(id, theme, customizations)?.value);
		assert.deepStrictEqual({
			defaults: resolve({}),
			panels: resolve({ 'panels.cornerRadius': 6 }),
			component: resolve({ 'panels.cornerRadius': 4, 'primarySideBar.cornerRadius': 2 }),
			rail: resolve({ 'primarySideBar.cornerRadius': 2, 'activityBar.cornerRadius': 0 }),
			primitiveOverrideIgnored: resolve({ 'cornerRadius.large': 0 }),
			removedDefaultIgnored: resolve({ 'default.cornerRadius': 0 }),
		}, {
			defaults: [8, 8, 8, 8, 8],
			panels: [8, 6, 6, 6, 6],
			component: [8, 4, 4, 2, 2],
			rail: [8, 8, 8, 2, 0],
			primitiveOverrideIgnored: [8, 8, 8, 8, 8],
			removedDefaultIgnored: [8, 8, 8, 8, 8],
		});
	});

	test('references retain per-theme primitive defaults', () => {
		const base = registerSize('test.schemeSize', { light: size(3), dark: size(4), hcDark: size(5), hcLight: size(6) }, 'Test');
		store.add(toDisposable(() => getSizeRegistry().deregisterSize(base)));
		const alias = registerSize('test.schemeAlias', base, 'Test');
		store.add(toDisposable(() => getSizeRegistry().deregisterSize(alias)));
		assert.deepStrictEqual([ColorScheme.LIGHT, ColorScheme.DARK, ColorScheme.HIGH_CONTRAST_DARK, ColorScheme.HIGH_CONTRAST_LIGHT]
			.map(type => getSizeRegistry().resolveDefaultSize(alias, new TestColorTheme({}, type))?.value), [3, 4, 5, 6]);
	});

	test('detects circular references rather than recursing indefinitely', () => {
		const id = registerSize('test.cycle', 'test.cycle', 'Test');
		store.add(toDisposable(() => getSizeRegistry().deregisterSize(id)));
		assert.throws(() => getSizeRegistry().resolveDefaultSize(id, new TestColorTheme()), /Circular size token reference/);
	});

	test('exposes only bounded semantic tokens in the customization schema', () => {
		const schema = getSizeRegistry().getSizeCustomizationSchema();
		const properties = schema.properties!;
		assert.deepStrictEqual({
			additionalProperties: schema.additionalProperties,
			names: Object.keys(properties).sort(),
			panel: {
				type: properties[toolsPanelCornerRadius].type,
				minimum: properties[toolsPanelCornerRadius].minimum,
				maximum: properties[toolsPanelCornerRadius].maximum,
			},
			primitive: properties[cornerRadiusLarge],
		}, {
			additionalProperties: false,
			names: [
				'activityBar.cornerRadius',
				'agentsWindow.chatPanels.cornerRadius',
				'agentsWindow.editorArea.cornerRadius',
				'agentsWindow.panels.cornerRadius',
				'agentsWindow.panels.spacing',
				'agentsWindow.secondarySideBar.cornerRadius',
				'agentsWindow.toolsPanel.cornerRadius',
				'editorArea.cornerRadius',
				'panels.cornerRadius',
				'panels.spacing',
				'primarySideBar.cornerRadius',
				'secondarySideBar.cornerRadius',
				'toolsPanel.cornerRadius',
			],
			panel: { type: 'integer', minimum: 0, maximum: 8 },
			primitive: undefined,
		});
	});

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
