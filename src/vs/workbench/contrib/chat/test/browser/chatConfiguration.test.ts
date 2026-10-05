/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ConfigurationScope, Extensions as ConfigurationExtensions, IConfigurationRegistry } from '../../../../../platform/configuration/common/configurationRegistry.js';
import { Registry } from '../../../../../platform/registry/common/platform.js';
import { ConfigurationMigration, Extensions as WorkbenchConfigurationExtensions, IConfigurationMigrationRegistry } from '../../../../common/configuration.js';
import { ChatConfiguration } from '../../common/constants.js';
import { CustomizationMarketplaceConfiguration } from '../../../../../platform/customizationMarketplace/common/customizationMarketplaceSources.js';
import { IConfigurationService, IConfigurationValue } from '../../../../../platform/configuration/common/configuration.js';
import { chatProgressConfigurationProperties } from '../../browser/chatProgressConfiguration.js';
import { customizationMarketplaceConfigurationProperties, isCustomizationMarketplaceValueFromDefault } from '../../browser/aiCustomization/customizationMarketplaceConfiguration.js';
import '../../browser/agentSessionsConfiguration.js';

const configurationProperties = Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration).getConfigurationProperties();
const registeredAgentSessionsSettings = [
	ChatConfiguration.UnifiedWorkspacePicker,
	ChatConfiguration.AutoMarkAsDoneMergedSessionsAfterDays,
	ChatConfiguration.AutoDeleteMarkedAsDoneMergedSessionsAfterDays,
].map(key => configurationProperties[key] !== undefined);
const unifiedWorkspacePickerSetting = configurationProperties[ChatConfiguration.UnifiedWorkspacePicker];
const migrations = Registry.as<IConfigurationMigrationRegistry & { readonly migrations: readonly ConfigurationMigration[] }>(WorkbenchConfigurationExtensions.ConfigurationMigration).migrations;
const legacyAutoArchiveMigration = migrations.find(migration => migration.key === 'chat.agentSessions.autoArchiveMergedSessionsAfterDays');
const legacyAutoDeleteArchivedMigration = migrations.find(migration => migration.key === 'chat.agentSessions.autoDeleteArchivedMergedSessionsAfterDays');
const legacyProgressAnimationMigration = migrations.find(migration => migration.key === ChatConfiguration.PersistentProgress);
const legacyProgressVerbosityMigration = migrations.find(migration => migration.key === ChatConfiguration.PersistentProgressVerbosity);
const persistentProgressSetting = chatProgressConfigurationProperties[ChatConfiguration.PersistentProgress];

suite('Chat configuration', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('registers Agents Window settings in the shared workbench contribution', () => {
		assert.deepStrictEqual(registeredAgentSessionsSettings, [true, true, true]);
	});

	test('enables the unified workspace picker by default while allowing experiment overrides', () => {
		assert.deepStrictEqual({
			type: unifiedWorkspacePickerSetting.type,
			default: unifiedWorkspacePickerSetting.default,
			scope: unifiedWorkspacePickerSetting.scope,
			experiment: unifiedWorkspacePickerSetting.experiment,
		}, {
			type: 'boolean',
			default: true,
			scope: ConfigurationScope.APPLICATION,
			experiment: { mode: 'auto' },
		});
	});

	test('Marketplace visibility is experiment-controlled and default-off while the GitHub Feed is default-on', () => {
		assert.deepStrictEqual({
			marketplace: customizationMarketplaceConfigurationProperties[CustomizationMarketplaceConfiguration.MarketplaceEnabled],
			publicFeed: customizationMarketplaceConfigurationProperties[CustomizationMarketplaceConfiguration.AgentFinderPublicFeedEnabled].default,
		}, {
			marketplace: {
				type: 'boolean',
				tags: ['experimental'],
				description: 'Shows Discover instead of Overview when a customization marketplace source is enabled. When disabled, marketplace discovery remains in the existing customization management pages.',
				default: false,
				experiment: { mode: 'auto' },
			},
			publicFeed: true,
		});
	});

	test('Marketplace experiment eligibility excludes every explicit configuration layer', () => {
		const isDefault = (inspection: IConfigurationValue<boolean>) =>
			isCustomizationMarketplaceValueFromDefault({
				inspect: <T>() => inspection as unknown as IConfigurationValue<Readonly<T>>,
			} as unknown as IConfigurationService);
		assert.deepStrictEqual([
			isDefault({ defaultValue: false, value: false }),
			...[
				'applicationValue',
				'userValue',
				'userLocalValue',
				'userRemoteValue',
				'workspaceValue',
				'workspaceFolderValue',
				'memoryValue',
				'policyValue',
			].map(layer => isDefault({ defaultValue: false, value: true, [layer]: true })),
		], [
			true,
			false,
			false,
			false,
			false,
			false,
			false,
			false,
			false,
		]);
	});

	test('defaults persistent progress to Draw regardless of product quality while allowing experiment overrides', () => {
		assert.deepStrictEqual({
			type: persistentProgressSetting.type,
			default: persistentProgressSetting.default,
			tags: persistentProgressSetting.tags,
			experiment: persistentProgressSetting.experiment,
		}, {
			type: 'string',
			default: 'draw',
			tags: ['experimental'],
			experiment: { mode: 'auto' },
		});
	});

	test('defines persistent progress animations and a separate verbosity setting', () => {
		const setting = chatProgressConfigurationProperties[ChatConfiguration.PersistentProgress];
		assert.deepStrictEqual({
			settings: Object.keys(chatProgressConfigurationProperties),
			type: setting.type,
			default: setting.default,
			values: setting.enum,
			labels: setting.enumItemLabels,
			descriptions: setting.enumDescriptions.length,
		}, {
			settings: ['chat.experimental.persistentProgress', 'chat.experimental.persistentProgressVerbosity'],
			type: 'string',
			default: 'draw',
			values: ['off', 'draw', 'drawMonochrome', 'drawMonochromeNoIcon'],
			labels: ['Off', 'Draw', 'Draw (Monochrome)', 'Draw (Monochrome, No Icon)'],
			descriptions: 4,
		});
	});

	test('migrates removed progress animations to Draw', async () => {
		assert.deepStrictEqual(await Promise.all(
			['weave', 'orbit', 'accordion', 'dial', 'ribbon'].map(value => legacyProgressAnimationMigration?.migrateFn(value, () => undefined)),
		), Array.from({ length: 5 }, () => ({ value: 'draw' })));
	});

	test('preserves current progress styles and absent settings during migration', async () => {
		assert.deepStrictEqual(await Promise.all(
			['off', 'draw', 'drawMonochrome', 'drawMonochromeNoIcon', undefined, 'unsupported'].map(value => legacyProgressAnimationMigration?.migrateFn(value, () => undefined)),
		), [[], [], [], [], [], []]);
	});

	test('defaults persistent progress verbosity to Compact tool previews', () => {
		const setting = chatProgressConfigurationProperties[ChatConfiguration.PersistentProgressVerbosity];
		assert.deepStrictEqual({
			type: setting.type,
			default: setting.default,
			values: setting.enum,
			labels: setting.enumItemLabels,
			descriptions: setting.enumDescriptions.length,
			tags: setting.tags,
		}, {
			type: 'string',
			default: 'compact',
			values: ['verbose', 'compact'],
			labels: ['Verbose', 'Compact'],
			descriptions: 2,
			tags: ['experimental'],
		});
	});

	test('migrates stored notVerbose progress verbosity to compact', async () => {
		assert.deepStrictEqual(await legacyProgressVerbosityMigration?.migrateFn('notVerbose', () => undefined), { value: 'compact' });
	});

	test('does not migrate explicit progress verbosity or absent settings', async () => {
		assert.deepStrictEqual(await Promise.all(
			['verbose', 'compact', undefined, 'unsupported'].map(value => legacyProgressVerbosityMigration?.migrateFn(value, () => undefined)),
		), [[], [], [], []]);
	});

	test('migrates the auto archive setting to auto mark as done', async () => {
		assert.deepStrictEqual({
			includeApplication: legacyAutoArchiveMigration?.includeApplication,
			result: await legacyAutoArchiveMigration?.migrateFn(15, () => undefined),
		}, {
			includeApplication: true,
			result: [
				['chat.agentSessions.autoArchiveMergedSessionsAfterDays', { value: undefined }],
				[ChatConfiguration.AutoMarkAsDoneMergedSessionsAfterDays, { value: 15 }],
			],
		});
	});

	test('does not overwrite the auto mark as done setting during migration', async () => {
		assert.deepStrictEqual(await legacyAutoArchiveMigration?.migrateFn(15, () => 30), [
			['chat.agentSessions.autoArchiveMergedSessionsAfterDays', { value: undefined }],
		]);
	});

	test('migrates the auto delete archived setting to auto delete marked as done', async () => {
		assert.deepStrictEqual({
			includeApplication: legacyAutoDeleteArchivedMigration?.includeApplication,
			result: await legacyAutoDeleteArchivedMigration?.migrateFn(15, () => undefined),
		}, {
			includeApplication: true,
			result: [
				['chat.agentSessions.autoDeleteArchivedMergedSessionsAfterDays', { value: undefined }],
				[ChatConfiguration.AutoDeleteMarkedAsDoneMergedSessionsAfterDays, { value: 15 }],
			],
		});
	});

	test('does not overwrite the auto delete marked as done setting during migration', async () => {
		assert.deepStrictEqual(await legacyAutoDeleteArchivedMigration?.migrateFn(15, () => 30), [
			['chat.agentSessions.autoDeleteArchivedMergedSessionsAfterDays', { value: undefined }],
		]);
	});
});
