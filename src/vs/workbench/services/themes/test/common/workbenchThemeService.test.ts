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
import { ColorScheme } from '../../../../../platform/theme/common/theme.js';
import { Event } from '../../../../../base/common/event.js';
import { ConfigurationTarget, IConfigurationOverrides, IConfigurationValue } from '../../../../../platform/configuration/common/configuration.js';
import { InMemoryStorageService, IS_NEW_KEY, StorageScope, StorageTarget } from '../../../../../platform/storage/common/storage.js';
import { ColorThemeData } from '../../common/colorThemeData.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';

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

	suite('migrateColorThemeDefaults', () => {

		const disposables = new DisposableStore();

		teardown(() => disposables.clear());

		/**
		 * Creates a migration context that mirrors the services used by
		 * WorkbenchThemeService.migrateColorThemeDefaults, with mocks
		 * tracking all updateValue calls for assertions.
		 */
		function createMigrationContext(options: {
			isNewProfile?: boolean;
			alreadyMigrated?: boolean;
			dark?: boolean;
			highContrast?: boolean;
			existingUserConfig?: Record<string, unknown>;
			storedThemeSettingsId?: string;
		}) {
			const storageService = disposables.add(new InMemoryStorageService());

			if (options.isNewProfile) {
				storageService.store(IS_NEW_KEY, true, StorageScope.PROFILE, StorageTarget.MACHINE);
			}
			if (options.alreadyMigrated) {
				storageService.store('workbench.colorThemeDefaultMigrated', true, StorageScope.PROFILE, StorageTarget.USER);
			}
			if (options.storedThemeSettingsId) {
				// Minimal stored theme data that ColorThemeData.fromStorageData will parse
				storageService.store(ColorThemeData.STORAGE_KEY, JSON.stringify({
					id: `vs-dark test-theme`,
					settingsId: options.storedThemeSettingsId,
					themeTokenColors: [],
				}), StorageScope.PROFILE, StorageTarget.USER);
			}

			const userConfig = options.existingUserConfig ?? {};
			const configService = new TestConfigurationService(userConfig);
			const updates: { key: string; value: unknown; target: ConfigurationTarget }[] = [];
			configService.updateValue = (key: string, value: unknown, target?: ConfigurationTarget) => {
				updates.push({ key, value, target: target ?? ConfigurationTarget.USER });
				return Promise.resolve();
			};

			// When the user has no explicit config value for a key, inspect should return
			// userValue=undefined (not the value itself) to match production behavior.
			const originalInspect = configService.inspect.bind(configService);
			configService.inspect = <T>(key: string, overrides?: IConfigurationOverrides): IConfigurationValue<T> => {
				if (Object.prototype.hasOwnProperty.call(userConfig, key)) {
					return originalInspect(key, overrides);
				}
				return {
					value: undefined as T,
					defaultValue: undefined,
					userValue: undefined,
					userLocalValue: undefined,
					userRemoteValue: undefined,
					workspaceValue: undefined,
					workspaceFolderValue: undefined,
				};
			};

			const hostColorService: IHostColorSchemeService = {
				_serviceBrand: undefined,
				dark: options.dark ?? false,
				highContrast: options.highContrast ?? false,
				onDidChangeColorScheme: Event.None,
			};

			const userDataInitializationService = {
				whenInitializationFinished: () => Promise.resolve(),
			};

			return { storageService, configService, hostColorService, userDataInitializationService, updates };
		}

		/**
		 * Runs the migration logic extracted from WorkbenchThemeService.migrateColorThemeDefaults.
		 */
		async function runMigration(ctx: ReturnType<typeof createMigrationContext>): Promise<void> {
			const { storageService, configService, hostColorService, userDataInitializationService } = ctx;
			const THEME_MIGRATION_KEY = 'workbench.colorThemeDefaultMigrated';

			if (storageService.isNew(StorageScope.PROFILE)
				|| storageService.getBoolean(THEME_MIGRATION_KEY, StorageScope.PROFILE)) {
				return;
			}

			await userDataInitializationService.whenInitializationFinished();

			const colorThemeInspection = configService.inspect<string>(ThemeSettings.COLOR_THEME);
			if (!colorThemeInspection.userValue && !colorThemeInspection.userLocalValue && !colorThemeInspection.userRemoteValue && !colorThemeInspection.workspaceValue && !colorThemeInspection.workspaceFolderValue) {
				const storedTheme = ColorThemeData.fromStorageData(storageService);
				if (storedTheme) {
					const previousId = migrateThemeSettingsId(storedTheme.settingsId);
					if (previousId !== ThemeSettingDefaults.COLOR_THEME_DARK && previousId !== ThemeSettingDefaults.COLOR_THEME_LIGHT) {
						await configService.updateValue(ThemeSettings.COLOR_THEME, previousId, ConfigurationTarget.USER);
					}
				} else {
					if (!hostColorService.highContrast) {
						const prefersDark = hostColorService.dark;
						const oldDefault = prefersDark ? ThemeSettingDefaults.COLOR_THEME_DARK_OLD : ThemeSettingDefaults.COLOR_THEME_LIGHT_OLD;
						await configService.updateValue(ThemeSettings.COLOR_THEME, oldDefault, ConfigurationTarget.USER);
					}
				}
			}

			const detectInspection = configService.inspect<boolean>(ThemeSettings.DETECT_COLOR_SCHEME);
			if (detectInspection.value === true) {
				const preferredSettings = [
					{ key: ThemeSettings.PREFERRED_DARK_THEME, oldDefault: ThemeSettingDefaults.COLOR_THEME_DARK_OLD },
					{ key: ThemeSettings.PREFERRED_LIGHT_THEME, oldDefault: ThemeSettingDefaults.COLOR_THEME_LIGHT_OLD },
				];
				for (const { key, oldDefault } of preferredSettings) {
					const inspection = configService.inspect<string>(key);
					if (!inspection.userValue && !inspection.userLocalValue && !inspection.userRemoteValue && !inspection.workspaceValue && !inspection.workspaceFolderValue) {
						await configService.updateValue(key, oldDefault, ConfigurationTarget.USER);
					}
				}
			}

			storageService.store(THEME_MIGRATION_KEY, true, StorageScope.PROFILE, StorageTarget.USER);
		}

		test('existing dark user with no explicit theme and no stored data pins Dark Modern', async () => {
			const ctx = createMigrationContext({ dark: true });
			await runMigration(ctx);

			assert.deepStrictEqual(ctx.updates, [
				{ key: ThemeSettings.COLOR_THEME, value: ThemeSettingDefaults.COLOR_THEME_DARK_OLD, target: ConfigurationTarget.USER },
			]);
		});

		test('existing light user with no explicit theme and no stored data pins Light Modern', async () => {
			const ctx = createMigrationContext({ dark: false });
			await runMigration(ctx);

			assert.deepStrictEqual(ctx.updates, [
				{ key: ThemeSettings.COLOR_THEME, value: ThemeSettingDefaults.COLOR_THEME_LIGHT_OLD, target: ConfigurationTarget.USER },
			]);
		});

		test('existing user with stored Dark Modern theme pins Dark Modern', async () => {
			const ctx = createMigrationContext({ storedThemeSettingsId: 'Dark Modern' });
			await runMigration(ctx);

			assert.deepStrictEqual(ctx.updates, [
				{ key: ThemeSettings.COLOR_THEME, value: 'Dark Modern', target: ConfigurationTarget.USER },
			]);
		});

		test('existing user with stored theme matching new default does not pin', async () => {
			const ctx = createMigrationContext({ storedThemeSettingsId: ThemeSettingDefaults.COLOR_THEME_DARK });
			await runMigration(ctx);

			assert.deepStrictEqual(ctx.updates, []);
		});

		test('existing user with stored Default Dark Modern theme migrates and pins Dark Modern', async () => {
			const ctx = createMigrationContext({ storedThemeSettingsId: 'Default Dark Modern' });
			await runMigration(ctx);

			assert.deepStrictEqual(ctx.updates, [
				{ key: ThemeSettings.COLOR_THEME, value: 'Dark Modern', target: ConfigurationTarget.USER },
			]);
		});

		test('existing user with explicit theme setting does not pin', async () => {
			const ctx = createMigrationContext({
				existingUserConfig: { [ThemeSettings.COLOR_THEME]: 'Monokai' },
			});
			await runMigration(ctx);

			assert.deepStrictEqual(ctx.updates, []);
		});

		test('high contrast user does not get non-HC theme pinned', async () => {
			const ctx = createMigrationContext({ highContrast: true, dark: true });
			await runMigration(ctx);

			assert.deepStrictEqual(ctx.updates, []);
		});

		test('new profile does not run migration', async () => {
			const ctx = createMigrationContext({ isNewProfile: true });
			await runMigration(ctx);

			assert.deepStrictEqual(ctx.updates, []);
		});

		test('already migrated does not run again', async () => {
			const ctx = createMigrationContext({ alreadyMigrated: true });
			await runMigration(ctx);

			assert.deepStrictEqual(ctx.updates, []);
		});

		test('auto-detect enabled pins preferred dark and light themes', async () => {
			const ctx = createMigrationContext({
				dark: true,
				existingUserConfig: { [ThemeSettings.DETECT_COLOR_SCHEME]: true },
			});
			await runMigration(ctx);

			assert.deepStrictEqual(ctx.updates, [
				{ key: ThemeSettings.COLOR_THEME, value: ThemeSettingDefaults.COLOR_THEME_DARK_OLD, target: ConfigurationTarget.USER },
				{ key: ThemeSettings.PREFERRED_DARK_THEME, value: ThemeSettingDefaults.COLOR_THEME_DARK_OLD, target: ConfigurationTarget.USER },
				{ key: ThemeSettings.PREFERRED_LIGHT_THEME, value: ThemeSettingDefaults.COLOR_THEME_LIGHT_OLD, target: ConfigurationTarget.USER },
			]);
		});

		test('migration flag is stored only after all updates succeed', async () => {
			const ctx = createMigrationContext({ dark: true });
			const THEME_MIGRATION_KEY = 'workbench.colorThemeDefaultMigrated';

			// Before migration, flag is not set
			assert.strictEqual(ctx.storageService.getBoolean(THEME_MIGRATION_KEY, StorageScope.PROFILE), undefined);

			await runMigration(ctx);

			// After migration, flag is set
			assert.strictEqual(ctx.storageService.getBoolean(THEME_MIGRATION_KEY, StorageScope.PROFILE), true);
		});
	});
});
