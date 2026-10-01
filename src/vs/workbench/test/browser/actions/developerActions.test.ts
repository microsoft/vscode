/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { $ } from '../../../../base/browser/dom.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { CommandsRegistry } from '../../../../platform/commands/common/commands.js';
import { ConfigurationTarget, IConfigurationChangeEvent } from '../../../../platform/configuration/common/configuration.js';
import { Extensions as ConfigurationExtensions, IConfigurationRegistry } from '../../../../platform/configuration/common/configurationRegistry.js';
import { TestConfigurationService } from '../../../../platform/configuration/test/common/testConfigurationService.js';
import { ILayoutService } from '../../../../platform/layout/browser/layoutService.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { ScreencastModeContribution } from '../../../browser/actions/developerActions.js';
import { TestLayoutService, workbenchInstantiationService } from '../workbenchTestServices.js';

const screencastModeEnabledSetting = 'workbench.screencastMode.enabled';

class UpdatingTestConfigurationService extends TestConfigurationService {

	readonly updates: { key: string; value: unknown; target: ConfigurationTarget | undefined }[] = [];

	override async updateValue(key: string, value: unknown, target?: ConfigurationTarget): Promise<void> {
		this.updates.push({ key, value, target });
		await this.setUserConfiguration(key, value);
	}
}

suite('Screencast Mode', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('registers enabled setting', () => {
		const setting = Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration).getConfigurationProperties()[screencastModeEnabledSetting];

		assert.deepStrictEqual({
			type: setting?.type,
			default: setting?.default
		}, {
			type: 'boolean',
			default: false
		});
	});

	test('configuration value controls screencast mode', async () => {
		const configurationService = new TestConfigurationService({
			[screencastModeEnabledSetting]: true,
			'screencastMode.verticalOffset': 20,
			'screencastMode.fontSize': 56,
			'screencastMode.keyboardOverlayTimeout': 800,
			'screencastMode.mouseIndicatorColor': '#FF0000',
			'screencastMode.mouseIndicatorSize': 20
		});
		const layoutService = new TestLayoutService();
		const container = layoutService.activeContainer = $('.screencast-mode-test');
		const instantiationService = workbenchInstantiationService({ configurationService: () => configurationService }, disposables);
		instantiationService.stub(ILayoutService, layoutService);
		disposables.add(instantiationService.createInstance(ScreencastModeContribution));

		const markerCounts = [getMarkerCounts(container)];
		await setScreencastModeEnabled(configurationService, false);
		markerCounts.push(getMarkerCounts(container));
		await setScreencastModeEnabled(configurationService, true);
		markerCounts.push(getMarkerCounts(container));

		assert.deepStrictEqual(markerCounts, [
			{ mouse: 1, keyboard: 1 },
			{ mouse: 0, keyboard: 0 },
			{ mouse: 1, keyboard: 1 }
		]);
	});

	test('toggle command updates the setting', async () => {
		const configurationService = new UpdatingTestConfigurationService();
		const instantiationService = workbenchInstantiationService({ configurationService: () => configurationService }, disposables);
		const command = CommandsRegistry.getCommand('workbench.action.toggleScreencastMode');
		assert.ok(command);

		await instantiationService.invokeFunction(accessor => command.handler(accessor));
		await instantiationService.invokeFunction(accessor => command.handler(accessor));

		assert.deepStrictEqual(configurationService.updates, [
			{ key: screencastModeEnabledSetting, value: true, target: undefined },
			{ key: screencastModeEnabledSetting, value: false, target: undefined }
		]);
	});
});

function getMarkerCounts(container: HTMLElement): { mouse: number; keyboard: number } {
	return {
		mouse: container.querySelectorAll('.screencast-mouse').length,
		keyboard: container.querySelectorAll('.screencast-keyboard').length
	};
}

async function setScreencastModeEnabled(configurationService: TestConfigurationService, enabled: boolean): Promise<void> {
	await configurationService.setUserConfiguration(screencastModeEnabledSetting, enabled);
	const event: IConfigurationChangeEvent = {
		source: ConfigurationTarget.USER,
		affectedKeys: new Set([screencastModeEnabledSetting]),
		change: { keys: [screencastModeEnabledSetting], overrides: [] },
		affectsConfiguration: key => key === screencastModeEnabledSetting
	};
	configurationService.onDidChangeConfigurationEmitter.fire(event);
}
