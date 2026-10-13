/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { autorun } from '../../../../../base/common/observable.js';
import { ResourceMap } from '../../../../../base/common/map.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ConfigurationTarget } from '../../../../../platform/configuration/common/configuration.js';
import { Configuration, ConfigurationModel } from '../../../../../platform/configuration/common/configurationModels.js';
import { ConfigurationScope, Extensions, IConfigurationRegistry } from '../../../../../platform/configuration/common/configurationRegistry.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { observableConfigValue } from '../../../../../platform/observable/common/platformObservableUtils.js';
import { NullLogService } from '../../../../../platform/log/common/log.js';
import { Registry } from '../../../../../platform/registry/common/platform.js';
import { SESSIONS_SIDEBAR_SEPARATE_NAVIGATION_SETTING } from '../../../../common/sessionConfig.js';
import { getCustomizationsPresentation } from '../../browser/views/sessionsView.js';
import { sessionsConfiguration } from '../../browser/sessions.contribution.js';

suite('Sessions sidebar separate navigation', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('registers a user setting backed by the existing experiment', () => {
		const registry = Registry.as<IConfigurationRegistry>(Extensions.Configuration);
		const alreadyRegistered = registry.getConfigurations().includes(sessionsConfiguration);
		if (!alreadyRegistered) {
			registry.registerConfiguration(sessionsConfiguration);
		}
		try {
			const property = registry.getConfigurationProperties()[SESSIONS_SIDEBAR_SEPARATE_NAVIGATION_SETTING];
			assert.deepStrictEqual({
				type: property.type,
				default: property.default,
				scope: property.scope,
				experiment: property.experiment,
				included: property.included,
			}, {
				type: 'boolean',
				default: false,
				scope: ConfigurationScope.WINDOW,
				experiment: { mode: 'auto', name: 'sessions.list.rearrage' },
				included: undefined,
			});
		} finally {
			if (!alreadyRegistered) {
				registry.deregisterConfigurations([sessionsConfiguration]);
			}
		}
	});

	test('explicit user values override experiment defaults and resetting restores the default', () => {
		const logService = new NullLogService();
		const emptyModel = () => ConfigurationModel.createEmptyModel(logService);
		const defaults = emptyModel();
		defaults.setValue(SESSIONS_SIDEBAR_SEPARATE_NAVIGATION_SETTING, true);
		const user = emptyModel();
		user.setValue(SESSIONS_SIDEBAR_SEPARATE_NAVIGATION_SETTING, false);
		const configuration = new Configuration(
			defaults, emptyModel(), emptyModel(), user, emptyModel(), emptyModel(),
			new ResourceMap(), emptyModel(), new ResourceMap(), logService,
		);
		const userDisabled = configuration.getValue(SESSIONS_SIDEBAR_SEPARATE_NAVIGATION_SETTING, {}, undefined);

		const updatedDefaults = emptyModel();
		updatedDefaults.setValue(SESSIONS_SIDEBAR_SEPARATE_NAVIGATION_SETTING, false);
		configuration.compareAndUpdateDefaultConfiguration(updatedDefaults);
		const updatedUser = emptyModel();
		updatedUser.setValue(SESSIONS_SIDEBAR_SEPARATE_NAVIGATION_SETTING, true);
		configuration.compareAndUpdateLocalUserConfiguration(updatedUser);
		const userEnabled = configuration.getValue(SESSIONS_SIDEBAR_SEPARATE_NAVIGATION_SETTING, {}, undefined);
		configuration.compareAndUpdateLocalUserConfiguration(emptyModel());

		assert.deepStrictEqual({
			userDisabled,
			userEnabled,
			reset: configuration.getValue(SESSIONS_SIDEBAR_SEPARATE_NAVIGATION_SETTING, {}, undefined),
		}, {
			userDisabled: false,
			userEnabled: true,
			reset: false,
		});
	});

	test('updates the navigation presentation when the setting changes', async () => {
		const configurationService = new TestConfigurationService();
		disposables.add(configurationService.onDidChangeConfigurationEmitter);
		const separateNavigation = observableConfigValue(SESSIONS_SIDEBAR_SEPARATE_NAVIGATION_SETTING, false, configurationService);
		const presentations: string[] = [];
		disposables.add(autorun(reader => {
			presentations.push(getCustomizationsPresentation(false, true, false, separateNavigation.read(reader)));
		}));

		for (const value of [true, false]) {
			await configurationService.setUserConfiguration(SESSIONS_SIDEBAR_SEPARATE_NAVIGATION_SETTING, value);
			configurationService.onDidChangeConfigurationEmitter.fire({
				source: ConfigurationTarget.USER,
				affectedKeys: new Set([SESSIONS_SIDEBAR_SEPARATE_NAVIGATION_SETTING]),
				change: { keys: [SESSIONS_SIDEBAR_SEPARATE_NAVIGATION_SETTING], overrides: [] },
				affectsConfiguration: key => key === SESSIONS_SIDEBAR_SEPARATE_NAVIGATION_SETTING,
			});
		}

		assert.deepStrictEqual(presentations, ['control', 'treatment', 'control']);
	});
});
