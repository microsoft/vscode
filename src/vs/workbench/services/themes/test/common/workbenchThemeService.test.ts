/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { migrateThemeSettingsId } from '../../common/workbenchThemeService.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ThemeConfiguration } from '../../common/themeConfiguration.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IHostColorSchemeService } from '../../common/hostColorSchemeService.js';
import { ColorScheme } from '../../../../../platform/theme/common/theme.js';
import { Event } from '../../../../../base/common/event.js';

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
				['Experimental Dark', 'Experimental Light'].map(migrateThemeSettingsId),
				['VS Code Dark', 'VS Code Light']
			);
		});

		test('returns unknown IDs unchanged', () => {
			assert.deepStrictEqual(
				['Dark Modern', 'VS Code Dark', 'Some Custom Theme', ''].map(migrateThemeSettingsId),
				['Dark Modern', 'VS Code Dark', 'Some Custom Theme', '']
			);
		});
	});

	suite('ThemeConfiguration', () => {

		function createHostColorSchemeService(dark: boolean, highContrast: boolean = false): IHostColorSchemeService {
			return {
				_serviceBrand: undefined,
				dark,
				highContrast,
				onDidChangeColorScheme: Event.None,
			};
		}

		test('new user with no explicit setting gets auto-detect on light OS', () => {
			const configService = new TestConfigurationService();
			const hostColor = createHostColorSchemeService(false);
			const config = new ThemeConfiguration(configService, hostColor, true);

			assert.deepStrictEqual(config.getPreferredColorScheme(), ColorScheme.LIGHT);
			assert.deepStrictEqual(config.isDetectingColorScheme(), true);
		});

		test('new user with no explicit setting gets auto-detect on dark OS', () => {
			const configService = new TestConfigurationService();
			const hostColor = createHostColorSchemeService(true);
			const config = new ThemeConfiguration(configService, hostColor, true);

			assert.deepStrictEqual(config.getPreferredColorScheme(), ColorScheme.DARK);
			assert.deepStrictEqual(config.isDetectingColorScheme(), true);
		});

		test('new user with explicit false does not get auto-detect', () => {
			const configService = new TestConfigurationService({ 'window.autoDetectColorScheme': false });
			const hostColor = createHostColorSchemeService(false);
			const config = new ThemeConfiguration(configService, hostColor, true);

			assert.deepStrictEqual(config.getPreferredColorScheme(), undefined);
			assert.deepStrictEqual(config.isDetectingColorScheme(), false);
		});

		test('existing user without explicit setting does not get auto-detect', () => {
			const configService = new TestConfigurationService();
			const hostColor = createHostColorSchemeService(false);
			const config = new ThemeConfiguration(configService, hostColor, false);

			assert.deepStrictEqual(config.getPreferredColorScheme(), undefined);
			assert.deepStrictEqual(config.isDetectingColorScheme(), false);
		});

		test('existing user with explicit true gets auto-detect', () => {
			const configService = new TestConfigurationService({ 'window.autoDetectColorScheme': true });
			const hostColor = createHostColorSchemeService(false);
			const config = new ThemeConfiguration(configService, hostColor, false);

			assert.deepStrictEqual(config.getPreferredColorScheme(), ColorScheme.LIGHT);
			assert.deepStrictEqual(config.isDetectingColorScheme(), true);
		});
	});
});
