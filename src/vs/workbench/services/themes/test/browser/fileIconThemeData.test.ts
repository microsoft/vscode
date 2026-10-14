/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ILanguageService } from '../../../../../editor/common/languages/language.js';
import { IExtensionResourceLoaderService } from '../../../../../platform/extensionResourceLoader/common/extensionResourceLoader.js';
import { InMemoryStorageService, StorageScope } from '../../../../../platform/storage/common/storage.js';
import { mock } from '../../../../test/common/workbenchTestServices.js';
import { FileIconThemeData, FileIconThemeLoader } from '../../browser/fileIconThemeData.js';

suite('FileIconThemeData', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

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

		assert.deepStrictEqual({
			backgroundColor: content?.includes('background-color: currentColor'),
			mask: content?.includes('mask: url('),
			maskPlacement: content?.includes('no-repeat var(--file-icon-mask-position, left center)'),
			maskSize: content?.includes('mask-size: var(--file-icon-mask-size, 16px)'),
			webkitMask: content?.includes('-webkit-mask: url('),
			webkitMaskSize: content?.includes('-webkit-mask-size: var(--file-icon-mask-size, 16px)'),
			noBackgroundImage: content?.includes('background-image: none')
		}, {
			backgroundColor: true,
			mask: true,
			maskPlacement: true,
			maskSize: true,
			webkitMask: true,
			webkitMaskSize: true,
			noBackgroundImage: true
		});
	});

	test('renders image icons as background images by default', async () => {
		const content = await loadTheme();

		assert.deepStrictEqual({
			backgroundImage: content?.includes('background-image: url('),
			backgroundColor: content?.includes('background-color: currentColor'),
			mask: content?.includes('mask: url(')
		}, {
			backgroundImage: true,
			backgroundColor: false,
			mask: false
		});
	});

	test('invalidates persisted web theme data from a different product commit', () => {
		const storageService = disposables.add(new InMemoryStorageService());
		const themeData = FileIconThemeData.createUnloadedTheme('test');

		themeData.toStorage(storageService, 'commit-a');
		const storedData = JSON.parse(storageService.get(FileIconThemeData.STORAGE_KEY, StorageScope.PROFILE)!);
		const sameCommit = FileIconThemeData.fromStorageData(storageService, 'commit-a');
		const differentCommit = FileIconThemeData.fromStorageData(storageService, 'commit-b');
		const desktop = FileIconThemeData.fromStorageData(storageService);

		themeData.toStorage(storageService);
		const legacyWebData = FileIconThemeData.fromStorageData(storageService, 'commit-a');

		assert.deepStrictEqual({
			storedProductCommit: storedData.productCommit,
			sameCommit: sameCommit?.id,
			differentCommit: differentCommit?.id,
			desktop: desktop?.id,
			legacyWebData: legacyWebData?.id
		}, {
			storedProductCommit: 'commit-a',
			sameCommit: 'test',
			differentCommit: undefined,
			desktop: 'test',
			legacyWebData: undefined
		});
	});
});
