/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as assert from 'assert';
import { FolderConfigurationModel, ScopedConfigurationModel, FolderSettingsModel } from 'vs/workbench/services/configuration/common/configurationModels';
import { ConfigurationScope } from 'vs/platform/configuration/common/configurationRegistry';

suite('ConfigurationService - Model', () => {

	test('Test scoped configs are undefined', () => {
		const settingsConfig = new FolderSettingsModel(JSON.stringify({
			awesome: true
		}));

		const testObject = new FolderConfigurationModel(settingsConfig, [], ConfigurationScope.WINDOW);

		assert.equal(testObject.getContentsFor('task'), undefined);
	});

	test('Test consolidate (settings and tasks)', () => {
		const settingsConfig = new FolderSettingsModel(JSON.stringify({
			awesome: true
		}));

		const tasksConfig = new ScopedConfigurationModel(JSON.stringify({
			awesome: false
		}), '', 'tasks');

		const expected = {
			awesome: true,
			tasks: {
				awesome: false
			}
		};

		assert.deepEqual(new FolderConfigurationModel(settingsConfig, [tasksConfig], ConfigurationScope.WINDOW).contents, expected);
	});

	test('Test consolidate (settings and launch)', () => {
		const settingsConfig = new FolderSettingsModel(JSON.stringify({
			awesome: true
		}));

		const launchConfig = new ScopedConfigurationModel(JSON.stringify({
			awesome: false
		}), '', 'launch');

		const expected = {
			awesome: true,
			launch: {
				awesome: false
			}
		};

		assert.deepEqual(new FolderConfigurationModel(settingsConfig, [launchConfig], ConfigurationScope.WINDOW).contents, expected);
	});

	test('Test consolidate (settings and launch and tasks) - launch/tasks wins over settings file', () => {
		const settingsConfig = new FolderSettingsModel(JSON.stringify({
			awesome: true,
			launch: {
				launchConfig: 'defined',
				otherLaunchConfig: 'alsoDefined'
			},
			tasks: {
				taskConfig: 'defined',
				otherTaskConfig: 'alsoDefined'
			}
		}));

		const tasksConfig = new ScopedConfigurationModel(JSON.stringify({
			taskConfig: 'overwritten',
		}), '', 'tasks');

		const launchConfig = new ScopedConfigurationModel(JSON.stringify({
			launchConfig: 'overwritten',
		}), '', 'launch');

		const expected = {
			awesome: true,
			launch: {
				launchConfig: 'overwritten',
				otherLaunchConfig: 'alsoDefined'
			},
			tasks: {
				taskConfig: 'overwritten',
				otherTaskConfig: 'alsoDefined'
			}
		};

		assert.deepEqual(new FolderConfigurationModel(settingsConfig, [launchConfig, tasksConfig], ConfigurationScope.WINDOW).contents, expected);
		assert.deepEqual(new FolderConfigurationModel(settingsConfig, [tasksConfig, launchConfig], ConfigurationScope.WINDOW).contents, expected);
	});
});