/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as assert from 'assert';
import { WorkspaceConfigModel, ScopedConfigModel, WorkspaceSettingsConfigModel } from 'vs/workbench/services/configuration/common/configurationModels';

suite('ConfigurationService - Model', () => {

	test('Test consolidate (settings and tasks)', () => {
		const settingsConfig = new WorkspaceSettingsConfigModel(JSON.stringify({
			awesome: true
		}));

		const tasksConfig = new ScopedConfigModel(JSON.stringify({
			awesome: false
		}), '', 'tasks');

		const expected = {
			awesome: true,
			tasks: {
				awesome: false
			}
		};

		assert.deepEqual(new WorkspaceConfigModel(settingsConfig, [tasksConfig]).contents, expected);
	});

	test('Test consolidate (settings and launch)', () => {
		const settingsConfig = new WorkspaceSettingsConfigModel(JSON.stringify({
			awesome: true
		}));

		const launchConfig = new ScopedConfigModel(JSON.stringify({
			awesome: false
		}), '', 'launch');

		const expected = {
			awesome: true,
			launch: {
				awesome: false
			}
		};

		assert.deepEqual(new WorkspaceConfigModel(settingsConfig, [launchConfig]).contents, expected);
	});

	test('Test consolidate (settings and launch and tasks) - launch/tasks wins over settings file', () => {
		const settingsConfig = new WorkspaceSettingsConfigModel(JSON.stringify({
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

		const tasksConfig = new ScopedConfigModel(JSON.stringify({
			taskConfig: 'overwritten',
		}), '', 'tasks');

		const launchConfig = new ScopedConfigModel(JSON.stringify({
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

		assert.deepEqual(new WorkspaceConfigModel(settingsConfig, [launchConfig, tasksConfig]).contents, expected);
		assert.deepEqual(new WorkspaceConfigModel(settingsConfig, [tasksConfig, launchConfig]).contents, expected);
	});
});