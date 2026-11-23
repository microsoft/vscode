/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { toDisposable } from '../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { Extensions, IConfigurationNode, IConfigurationRegistry } from '../../../configuration/common/configurationRegistry.js';
import { Registry } from '../../../registry/common/platform.js';
import { logExperimentTrigger, logSettingExperimentTrigger } from '../../common/experimentTrigger.js';
import { TestExperimentTriggerTelemetryService } from './experimentTriggerTestUtils.js';

suite('ExperimentTrigger', () => {

	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('logs each treatment once per telemetry service', () => {
		const window = new TestExperimentTriggerTelemetryService();
		const otherWindow = new TestExperimentTriggerTelemetryService();

		logExperimentTrigger(window, 'first');
		logExperimentTrigger(window, 'second');
		logExperimentTrigger(window, 'first');
		logExperimentTrigger(otherWindow, 'first');

		assert.deepStrictEqual({ window: window.triggers, otherWindow: otherWindow.triggers }, {
			window: ['first', 'second'],
			otherWindow: ['first'],
		});
	});

	test('names setting triggers after the treatment that assigns the setting', () => {
		const configurationRegistry = Registry.as<IConfigurationRegistry>(Extensions.Configuration);
		const configuration: IConfigurationNode = {
			id: 'experimentTriggerTest',
			properties: {
				'experimentTriggerTest.default': { type: 'boolean', default: false, experiment: { mode: 'auto' } },
				'experimentTriggerTest.named': { type: 'boolean', default: false, experiment: { mode: 'auto', name: 'customTreatment' } },
			},
		};
		configurationRegistry.registerConfiguration(configuration);
		store.add(toDisposable(() => configurationRegistry.deregisterConfigurations([configuration])));
		const telemetryService = new TestExperimentTriggerTelemetryService();

		logSettingExperimentTrigger(telemetryService, 'experimentTriggerTest.default');
		logSettingExperimentTrigger(telemetryService, 'experimentTriggerTest.named');
		logSettingExperimentTrigger(telemetryService, 'experimentTriggerTest.unregistered');

		assert.deepStrictEqual(telemetryService.triggers, [
			'config.experimentTriggerTest.default',
			'customTreatment',
			'config.experimentTriggerTest.unregistered',
		]);
	});
});
