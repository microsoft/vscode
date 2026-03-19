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
import { IConfigurationOverrides, IConfigurationValue } from '../../../../../platform/configuration/common/configuration.js';

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

		/**
		 * Creates a config service that separates the resolved value from the user value,
		 * matching production behaviour where getValue() returns the schema default
		 * while inspect().userValue is undefined when no explicit user value is set.
		 */
		function createConfigServiceWithDefaults(
			userConfig: Record<string, unknown>,
			defaults: Record<string, unknown>
		): TestConfigurationService {
			const configService = new TestConfigurationService(userConfig);
			const originalInspect = configService.inspect.bind(configService);
			configService.inspect = <T>(key: string, overrides?: IConfigurationOverrides): IConfigurationValue<T> => {
				if (Object.prototype.hasOwnProperty.call(userConfig, key)) {
					return originalInspect(key, overrides);
				}
				// No explicit user value: return the default as the resolved value
				const defaultVal = defaults[key] as T;
				return {
					value: defaultVal,
					defaultValue: defaultVal,
					userValue: undefined,
					userLocalValue: undefined,
				};
			};
			const originalGetValue = configService.getValue.bind(configService);
			configService.getValue = <T>(arg1?: string | IConfigurationOverrides, arg2?: IConfigurationOverrides): T => {
				const result = originalGetValue(arg1, arg2);
				if (result === undefined && typeof arg1 === 'string' && Object.prototype.hasOwnProperty.call(defaults, arg1)) {
					return defaults[arg1] as T;
				}
				return result as T;
			};
			return configService;
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

		test('new user with no explicit setting and schema default false still gets auto-detect', () => {
			// Simulates production: getValue() returns false (schema default) but userValue is undefined
			const configService = createConfigServiceWithDefaults({}, { 'window.autoDetectColorScheme': false });
			const hostColor = createHostColorSchemeService(false);
			const config = new ThemeConfiguration(configService, hostColor, true);

			assert.deepStrictEqual(config.getPreferredColorScheme(), ColorScheme.LIGHT);
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

		test('high contrast OS takes priority over auto-detect for new user', () => {
			const configService = new TestConfigurationService({ 'window.autoDetectHighContrast': true });
			const hostColor = createHostColorSchemeService(true, true);
			const config = new ThemeConfiguration(configService, hostColor, true);

			assert.deepStrictEqual(config.getPreferredColorScheme(), ColorScheme.HIGH_CONTRAST_DARK);
			assert.deepStrictEqual(config.isDetectingColorScheme(), true);
		});

		test('high contrast light OS takes priority over auto-detect for new user', () => {
			const configService = new TestConfigurationService({ 'window.autoDetectHighContrast': true });
			const hostColor = createHostColorSchemeService(false, true);
			const config = new ThemeConfiguration(configService, hostColor, true);

			assert.deepStrictEqual(config.getPreferredColorScheme(), ColorScheme.HIGH_CONTRAST_LIGHT);
			assert.deepStrictEqual(config.isDetectingColorScheme(), true);
		});
	});
});
