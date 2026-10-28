/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Color } from '../../../../../base/common/color.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { InMemoryStorageService, StorageScope } from '../../../../../platform/storage/common/storage.js';
import { editorBackground, foreground, inputBackground, inputForeground } from '../../../../../platform/theme/common/colorRegistry.js';
import { ColorThemeData } from '../../common/colorThemeData.js';

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
