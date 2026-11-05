/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { migrateThemeSettingsId, ThemeSettingDefaults, ThemeSettings } from '../../common/workbenchThemeService.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ThemeConfiguration } from '../../common/themeConfiguration.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IHostColorSchemeService } from '../../common/hostColorSchemeService.js';
import { Event } from '../../../../../base/common/event.js';

class TestHostColorSchemeService implements IHostColorSchemeService {
	declare readonly _serviceBrand: undefined;
	readonly onDidChangeColorScheme = Event.None;
	dark = false;
	highContrast = false;
}

suite('WorkbenchThemeService', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	suite('migrateThemeSettingsId', () => {

		test('migrates Default-prefixed theme IDs', () => {
			assert.deepStrictEqual(
				['Default Dark Modern', 'Default Light Modern', 'Default Dark+', 'Default Light+'].map(migrateThemeSettingsId),
				['Dark Modern', 'Light Modern', 'Dark+', 'Light+']
			);
		});

		test('migrates Experimental theme IDs to VS Code themes', () => {
			assert.deepStrictEqual(
				['Experimental Dark', 'Experimental Light', 'VS Code Dark', 'VS Code Light'].map(migrateThemeSettingsId),
				[ThemeSettingDefaults.COLOR_THEME_DARK, ThemeSettingDefaults.COLOR_THEME_LIGHT, ThemeSettingDefaults.COLOR_THEME_DARK, ThemeSettingDefaults.COLOR_THEME_LIGHT]
			);
		});

		test('returns unknown IDs unchanged', () => {
			assert.deepStrictEqual(
				['Dark Modern', 'Dark 2026', 'Some Custom Theme', ''].map(migrateThemeSettingsId),
				['Dark Modern', 'Dark 2026', 'Some Custom Theme', '']
			);
		});
	});

	test('restores only for preferred color scheme changes', async () => {
		const configurationService = new TestConfigurationService({
			[ThemeSettings.DETECT_COLOR_SCHEME]: false,
			[ThemeSettings.DETECT_HC]: true,
		});
		const hostColorSchemeService = new TestHostColorSchemeService();
		const themeConfiguration = new ThemeConfiguration(configurationService, hostColorSchemeService);

		const results: boolean[] = [];
		hostColorSchemeService.dark = true;
		results.push(themeConfiguration.isPreferredColorSchemeChange({ dark: false, highContrast: false }));
		hostColorSchemeService.highContrast = true;
		results.push(themeConfiguration.isPreferredColorSchemeChange({ dark: true, highContrast: false }));
		hostColorSchemeService.dark = false;
		results.push(themeConfiguration.isPreferredColorSchemeChange({ dark: true, highContrast: true }));
		hostColorSchemeService.highContrast = false;
		results.push(themeConfiguration.isPreferredColorSchemeChange({ dark: false, highContrast: true }));

		await configurationService.setUserConfiguration(ThemeSettings.DETECT_COLOR_SCHEME, true);
		hostColorSchemeService.dark = true;
		results.push(themeConfiguration.isPreferredColorSchemeChange({ dark: false, highContrast: false }));

		assert.deepStrictEqual(results, [false, true, true, true, true]);
	});
});
