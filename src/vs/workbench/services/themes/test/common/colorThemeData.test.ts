/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Color } from '../../../../../base/common/color.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IExtensionResourceLoaderService } from '../../../../../platform/extensionResourceLoader/common/extensionResourceLoader.js';
import { InMemoryStorageService, StorageScope } from '../../../../../platform/storage/common/storage.js';
import { editorBackground, foreground, getColorRegistry, inputBackground, inputForeground } from '../../../../../platform/theme/common/colorRegistry.js';
import { ColorScheme } from '../../../../../platform/theme/common/theme.js';
import { ColorThemeData } from '../../common/colorThemeData.js';

suite('ColorThemeData - loading', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('includes the theme location when plist settings are not an array', async () => {
		const theme = ColorThemeData.createUnloadedTheme('vs-dark');
		theme.location = URI.file('/themes/invalid.tmTheme');
		const resourceLoaderService = new class extends mock<IExtensionResourceLoaderService>() {
			override async readExtensionResource(): Promise<string> {
				return '<plist><dict><key>settings</key><string>invalid</string></dict></plist>';
			}
		};

		let message: string | undefined;
		try {
			await theme.ensureLoaded(resourceLoaderService);
		} catch (error) {
			assert.ok(error instanceof Error);
			message = error.message;
		}
		assert.strictEqual(message, `Problem parsing tmTheme file: ${theme.location.toString()}. 'settings' is not array.`);
	});
});

suite('ColorThemeData - semantic foundations', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	const aliases = {
		foreground: 'color.text',
		strongForeground: 'color.text.strong',
		disabledForeground: 'color.text.disabled',
		errorForeground: 'color.text.error',
		'icon.foreground': 'color.icon',
		focusBorder: 'color.border.focus',
		contrastBorder: 'color.border.contrast',
		'textLink.foreground': 'color.text.link',
		'textLink.activeForeground': 'color.text.link',
		'editor.background': 'color.background.canvas',
		'editorWidget.background': 'color.background.raised',
		'editorError.foreground': 'color.icon.error',
		'editorWarning.foreground': 'color.icon.warning',
		'editorInfo.foreground': 'color.icon.info',
		'input.background': 'color.background.editable',
		'dropdown.background': 'color.background.editable',
		'button.background': 'color.background.accent',
		'button.foreground': 'color.text.onAccent',
		'inputValidation.errorBackground': 'color.background.error',
		'inputValidation.warningBackground': 'color.background.warning',
		'inputValidation.infoBackground': 'color.background.info',
	};

	test('component defaults alias intended usage without renaming the public color IDs', () => {
		const colors = new Map(getColorRegistry().getColors().map(color => [color.id, color]));
		assert.deepStrictEqual(Object.fromEntries(Object.keys(aliases).map(id => [id, colors.get(id)?.defaults])), aliases);
	});

	test('aliases resolve the same values as their foundations in all four theme types', () => {
		const types = [ColorScheme.LIGHT, ColorScheme.DARK, ColorScheme.HIGH_CONTRAST_LIGHT, ColorScheme.HIGH_CONTRAST_DARK];
		assert.deepStrictEqual(types.map(type => {
			const theme = ColorThemeData.createUnloadedThemeForThemeType(type);
			return Object.entries(aliases).filter(([alias, role]) => !Color.equals(theme.getColor(alias) ?? null, theme.getColor(role) ?? null));
		}), [[], [], [], []]);
	});

	test('foundation customizations flow to default aliases while explicit legacy overrides win', () => {
		const theme = ColorThemeData.createUnloadedTheme('vs-dark', { 'button.background': '#123456' });
		theme.setCustomColors({ 'color.text': '#234567', 'color.background.accent': '#345678', 'color.background.editable': '#456789' });
		assert.deepStrictEqual({
			text: theme.getColor('foreground')?.toString(),
			inputText: theme.getColor('input.foreground')?.toString(),
			accent: theme.getColor('color.background.accent')?.toString(),
			button: theme.getColor('button.background')?.toString(),
			buttonHover: theme.getColor('button.hoverBackground')?.toString(),
			input: theme.getColor('input.background')?.toString(),
			dropdown: theme.getColor('dropdown.background')?.toString(),
			explicitButton: theme.defines('button.background'),
			explicitInput: theme.defines('input.background'),
		}, {
			text: '#234567',
			inputText: '#234567',
			accent: '#345678',
			button: '#123456',
			buttonHover: Color.fromHex('#123456').lighten(0.2).toString(),
			input: '#456789',
			dropdown: '#456789',
			explicitButton: true,
			explicitInput: false,
		});
	});

	test('legacy foreground and contrast customizations still drive derived colors', () => {
		const theme = ColorThemeData.createUnloadedTheme('hc-black');
		theme.setCustomColors({ foreground: '#123456', contrastBorder: '#234567', focusBorder: '#345678', 'color.border.contrast': '#456789' });
		assert.deepStrictEqual({
			description: theme.getColor('descriptionForeground')?.toString(),
			focus: theme.getColor('list.focusOutline')?.toString(),
			error: theme.getColor('inputValidation.errorBorder')?.toString(),
			warning: theme.getColor('inputValidation.warningBorder')?.toString(),
			info: theme.getColor('inputValidation.infoBorder')?.toString(),
			foundationContrast: theme.getColor('color.border.contrast')?.toString(),
		}, {
			description: Color.fromHex('#123456').transparent(0.7).toString(),
			focus: '#345678',
			error: '#234567',
			warning: '#234567',
			info: '#234567',
			foundationContrast: '#456789',
		});
	});
});

suite('ColorThemeData - transient colors', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('updates programmatic colors, derived defaults and token caches', () => {
		const theme = ColorThemeData.createUnloadedTheme('vs-dark', { [foreground]: '#eeeeee', [editorBackground]: '#202020' });
		const beforeTokens = theme.tokenColors;
		theme.setTransientColors({ [foreground]: Color.fromHex('#ddccbb'), [editorBackground]: Color.fromHex('#28221e') });
		assert.deepStrictEqual({
			foreground: theme.getColor(foreground, false)?.toString(),
			derived: theme.getColor(inputForeground)?.toString(),
			defines: theme.defines(foreground),
			tokenBackground: theme.tokenColors[0].settings.background,
			tokensInvalidated: theme.tokenColors !== beforeTokens,
		}, {
			foreground: '#ddccbb',
			derived: '#ddccbb',
			defines: true,
			tokenBackground: '#28221E',
			tokensInvalidated: true,
		});
	});

	test('clearing runtime colors restores theme and user-customized colors', () => {
		const theme = ColorThemeData.createUnloadedTheme('vs-dark', { [editorBackground]: '#202020' });
		theme.setCustomColors({ [inputBackground]: '#123456' });
		theme.setTransientColors({ [inputBackground]: Color.fromHex('#654321'), [editorBackground]: Color.fromHex('#28221e') });
		theme.setTransientColors(undefined);
		assert.deepStrictEqual({
			editor: theme.getColor(editorBackground)?.toString(),
			input: theme.getColor(inputBackground)?.toString(),
			customization: theme.getColorCustomization(inputBackground)?.toString(),
		}, { editor: '#202020', input: '#123456', customization: '#123456' });
	});

	test('exposes untinted startup colors without changing the active theme', () => {
		const theme = ColorThemeData.createUnloadedTheme('vs-dark', { [editorBackground]: '#202020' });
		theme.setCustomColors({ [inputBackground]: '#123456' });
		theme.setTransientColors({ [inputBackground]: Color.fromHex('#654321'), [editorBackground]: Color.fromHex('#28221e') });
		const baseTheme = theme.getBaseTheme();
		assert.deepStrictEqual({
			active: theme.getColor(editorBackground)?.toString(),
			base: baseTheme.getColor(editorBackground)?.toString(),
			baseCustomization: baseTheme.getColor(inputBackground)?.toString(),
			activeTokenBackground: theme.tokenColors[0].settings.background,
			baseTokenBackground: baseTheme.tokenColors[0].settings.background,
		}, {
			active: '#28221e',
			base: '#202020',
			baseCustomization: '#123456',
			activeTokenBackground: '#28221E',
			baseTokenBackground: '#202020',
		});
	});

	test('does not persist generated colors or affect another theme instance', () => {
		const storageService = disposables.add(new InMemoryStorageService());
		const theme = ColorThemeData.createUnloadedTheme('vs-dark', { [editorBackground]: '#202020' });
		theme.toStorage(storageService);
		const originalStorage = storageService.get(ColorThemeData.STORAGE_KEY, StorageScope.PROFILE);
		const otherWindowTheme = ColorThemeData.fromStorageData(storageService)!;
		theme.setTransientColors({ [editorBackground]: Color.fromHex('#28221e') });
		theme.toStorage(storageService);
		const restored = ColorThemeData.fromStorageData(storageService)!;
		assert.deepStrictEqual({
			active: theme.getColor(editorBackground)?.toString(),
			otherWindow: otherWindowTheme.getColor(editorBackground)?.toString(),
			restored: restored.getColor(editorBackground)?.toString(),
			unchangedStorage: storageService.get(ColorThemeData.STORAGE_KEY, StorageScope.PROFILE) === originalStorage,
		}, { active: '#28221e', otherWindow: '#202020', restored: '#202020', unchangedStorage: true });
	});
});
