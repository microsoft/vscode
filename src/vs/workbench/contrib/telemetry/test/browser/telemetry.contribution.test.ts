/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ResourceMap } from '../../../../../base/common/map.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { Configuration, ConfigurationModelParser } from '../../../../../platform/configuration/common/configurationModels.js';
import { NullLogService } from '../../../../../platform/log/common/log.js';
import { ITelemetryData, ITelemetryService } from '../../../../../platform/telemetry/common/telemetry.js';
import { IUserDataProfilesService } from '../../../../../platform/userDataProfile/common/userDataProfile.js';
import { Workspace } from '../../../../../platform/workspace/common/workspace.js';
import { LayoutSettings } from '../../../../services/layout/browser/layoutService.js';
import { ConfigurationTelemetryContribution } from '../../browser/telemetry.contribution.js';

suite('ConfigurationTelemetryContribution', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	type TestSettings = Record<string, boolean | number | string>;

	function reportSettings(settings: { application?: TestSettings; user?: TestSettings; workspace?: TestSettings } = {}) {
		const logService = new NullLogService();
		const workspace = new Workspace('telemetry-test', [], false, null, () => false);
		const createModel = (values: TestSettings = {}) => {
			const parser = new ConfigurationModelParser('telemetry-test', logService);
			parser.parseRaw(values);
			return parser.configurationModel;
		};
		const model = new Configuration(
			createModel({
				[LayoutSettings.MODERN_UI_FROSTED_GLASS]: true,
				[LayoutSettings.MODERN_UI_FROSTED_GLASS_OPACITY]: 80,
			}),
			createModel(),
			createModel(settings.application),
			createModel(settings.user),
			createModel(),
			createModel(settings.workspace),
			new ResourceMap(),
			createModel(),
			new ResourceMap(),
			logService,
		);
		const configuration = new class extends mock<IConfigurationService>() {
			override keys() {
				return model.keys(workspace);
			}
			override inspect<T>(key: string) {
				return model.inspect<T>(key, {}, workspace);
			}
			override getConfigurationData() {
				return model.toData();
			}
		}();
		const events: { name: string; data: ITelemetryData | undefined }[] = [];
		const telemetry = new class extends mock<ITelemetryService>() {
			override publicLog2(name: string, data?: ITelemetryData): void {
				events.push({ name, data });
			}
		}();
		const profiles = new class extends mock<IUserDataProfilesService>() { }();
		store.add(new ConfigurationTelemetryContribution(configuration, profiles, telemetry));
		return events;
	}

	for (const { scope, source } of [
		{ scope: 'user', source: 'USER_LOCAL' },
		{ scope: 'application', source: 'APPLICATION' },
	] as const) {
		for (const { enabled, opacity } of [
			{ enabled: false, opacity: 50 },
			{ enabled: true, opacity: 75.5 },
			{ enabled: true, opacity: 92 },
			{ enabled: true, opacity: 100 },
		]) {
			test(`reports explicit ${scope} glass ${enabled} and opacity ${opacity} using configuration telemetry`, () => {
				assert.deepStrictEqual(reportSettings({
					[scope]: {
						[LayoutSettings.MODERN_UI_FROSTED_GLASS]: enabled,
						[LayoutSettings.MODERN_UI_FROSTED_GLASS_OPACITY]: opacity,
						'editor.fontSize': 14,
					},
				}), [
					{ name: 'workbench.modernUIFrostedGlass', data: { settingValue: String(enabled), source } },
					{ name: 'workbench.modernUIFrostedGlassOpacity', data: { settingValue: String(opacity), source } },
				]);
			});
		}

		test(`does not include arbitrary text from invalid ${scope} glass settings`, () => {
			assert.deepStrictEqual(reportSettings({
				[scope]: {
					[LayoutSettings.MODERN_UI_FROSTED_GLASS]: 'arbitrary user text',
					[LayoutSettings.MODERN_UI_FROSTED_GLASS_OPACITY]: 'arbitrary user text',
				},
			}), [
				{ name: 'workbench.modernUIFrostedGlass', data: { settingValue: undefined, source } },
				{ name: 'workbench.modernUIFrostedGlassOpacity', data: { settingValue: undefined, source } },
			]);
		});
	}

	test('does not report default settings as explicit choices', () => {
		assert.deepStrictEqual(reportSettings(), []);
	});

	test('reports explicit values from each configuration scope rather than the merged value', () => {
		assert.deepStrictEqual(reportSettings({
			application: { [LayoutSettings.MODERN_UI_FROSTED_GLASS_OPACITY]: 50 },
			user: { [LayoutSettings.MODERN_UI_FROSTED_GLASS_OPACITY]: 75 },
			workspace: { [LayoutSettings.MODERN_UI_FROSTED_GLASS_OPACITY]: 100 },
		}), [
			{ name: 'workbench.modernUIFrostedGlassOpacity', data: { settingValue: '50', source: 'APPLICATION' } },
			{ name: 'workbench.modernUIFrostedGlassOpacity', data: { settingValue: '75', source: 'USER_LOCAL' } },
			{ name: 'workbench.modernUIFrostedGlassOpacity', data: { settingValue: '100', source: 'WORKSPACE' } },
		]);
	});
});
