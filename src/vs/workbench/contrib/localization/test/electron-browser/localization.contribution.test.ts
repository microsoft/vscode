/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { upcastPartial } from '../../../../../base/test/common/mock.js';
import { IExtensionManagementService, ILocalExtension } from '../../../../../platform/extensionManagement/common/extensionManagement.js';
import { isLanguagePackInstalled } from '../../electron-browser/localization.contribution.js';

suite('Native localization contribution', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('uses exact English shortcut and scans inventory for regional and other locales', async () => {
		let scans = 0;
		const installedExtensions = [upcastPartial<ILocalExtension>({ manifest: { name: 'french', publisher: 'fixture', version: '1.0.0', engines: { vscode: '*' }, contributes: { localizations: [{ languageId: 'FR', translations: [] }] } } })];
		const extensionManagementService = upcastPartial<IExtensionManagementService>({
			getInstalled: async () => { scans++; return installedExtensions; },
		});

		const results: { locale: string; installed: boolean; scans: number }[] = [];
		for (const locale of ['en', 'en-US', 'fr-CA', 'de-DE']) {
			results.push({ locale, installed: await isLanguagePackInstalled(locale, extensionManagementService), scans });
		}

		assert.deepStrictEqual(results, [
			{ locale: 'en', installed: true, scans: 0 },
			{ locale: 'en-US', installed: false, scans: 1 },
			{ locale: 'fr-CA', installed: true, scans: 2 },
			{ locale: 'de-DE', installed: false, scans: 3 },
		]);
	});
});
