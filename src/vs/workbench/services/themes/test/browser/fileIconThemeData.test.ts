/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ILanguageService } from '../../../../../editor/common/languages/language.js';
import { IExtensionResourceLoaderService } from '../../../../../platform/extensionResourceLoader/common/extensionResourceLoader.js';
import { mock } from '../../../../test/common/workbenchTestServices.js';
import { FileIconThemeData, FileIconThemeLoader } from '../../browser/fileIconThemeData.js';

suite('FileIconThemeData', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	async function loadTheme(usesCurrentColor?: boolean): Promise<string | undefined> {
		const themeDocument = JSON.stringify({
			iconDefinitions: {
				_test: { iconPath: './test.svg' }
			},
			fileExtensions: {
				test: '_test'
			},
			...(usesCurrentColor ? { usesCurrentColor: true } : {}),
			showLanguageModeIcons: false
		});
		const resourceLoaderService = new class extends mock<IExtensionResourceLoaderService>() {
			override async readExtensionResource(): Promise<string> {
				return themeDocument;
			}
		};
		const languageService = new class extends mock<ILanguageService>() { };
		const themeData = FileIconThemeData.createUnloadedTheme('test');
		themeData.location = URI.file('/themes/test/icon-theme.json');

		return new FileIconThemeLoader(resourceLoaderService, languageService).load(themeData);
	}

	test('renders image icons with current color when enabled', async () => {
		const content = await loadTheme(true);

		assert.deepStrictEqual([
			content?.includes('background-color: currentColor'),
			content?.includes('mask: url(') && content.includes('no-repeat left center'),
			content?.includes('mask-size: 16px'),
			content?.includes('-webkit-mask: url(') && content.includes('no-repeat left center'),
			content?.includes('-webkit-mask-size: 16px'),
			content?.includes('background-image: none')
		], [true, true, true, true, true, true]);
	});

	test('renders image icons as background images by default', async () => {
		const content = await loadTheme();

		assert.deepStrictEqual([
			content?.includes('background-image: url('),
			content?.includes('background-color: currentColor'),
			content?.includes('mask: url(')
		], [true, false, false]);
	});
});
