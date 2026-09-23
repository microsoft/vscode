/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { isNative } from '../../../../../base/common/platform.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { Extensions as ConfigurationExtensions, IConfigurationRegistry } from '../../../../../platform/configuration/common/configurationRegistry.js';
import { Registry } from '../../../../../platform/registry/common/platform.js';
import { ConfigurationMigration, Extensions as WorkbenchConfigurationExtensions, IConfigurationMigrationRegistry } from '../../../../common/configuration.js';
import { LayoutSettings } from '../../../../services/layout/browser/layoutService.js';
import '../../../../browser/workbench.contribution.js';

suite('FrostedGlassConfiguration', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	const properties = Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration).getConfigurationProperties();
	const migrations = Registry.as<IConfigurationMigrationRegistry & { readonly migrations: readonly ConfigurationMigration[] }>(WorkbenchConfigurationExtensions.ConfigurationMigration).migrations;
	for (const { oldKey, newKey, values, configuredValue } of [
		{ oldKey: 'workbench.experimental.modernUIFrostedGlass', newKey: LayoutSettings.MODERN_UI_FROSTED_GLASS, values: [false, true], configuredValue: false },
		{ oldKey: 'workbench.experimental.modernUIFrostedGlassOpacity', newKey: LayoutSettings.MODERN_UI_FROSTED_GLASS_OPACITY, values: [50, 75.5, 100], configuredValue: 75 },
	]) {
		const migration = migrations.find(migration => migration.key === oldKey);

		test(`only registers ${oldKey} migration where ${newKey} is available`, () => {
			assert.deepStrictEqual({
				settingRegistered: !!properties[newKey],
				migrationRegistered: !!migration,
			}, {
				settingRegistered: isNative,
				migrationRegistered: isNative,
			});
		});

		for (const value of values) {
			(isNative ? test : test.skip)(`migrates ${oldKey} with value ${value}`, async () => {
				assert.deepStrictEqual({
					includeApplication: migration?.includeApplication,
					result: await migration?.migrateFn(value, () => undefined),
				}, {
					includeApplication: true,
					result: [
						[oldKey, { value: undefined }],
						[newKey, { value }],
					],
				});
			});
		}

		(isNative ? test : test.skip)(`preserves explicitly configured ${newKey} during migration`, async () => {
			assert.deepStrictEqual(await migration?.migrateFn(values[values.length - 1], () => configuredValue), [
				[oldKey, { value: undefined }],
			]);
		});

		(isNative ? test : test.skip)(`does not create ${newKey} when the old setting is absent`, async () => {
			assert.deepStrictEqual(await migration?.migrateFn(undefined, () => undefined), []);
		});
	}
});
