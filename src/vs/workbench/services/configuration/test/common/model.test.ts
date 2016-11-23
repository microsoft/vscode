/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import assert = require('assert');
import model = require('vs/workbench/services/configuration/common/model');

suite('ConfigurationService - Model', () => {

	test('simple merge', () => {
		let base = { 'a': 1, 'b': 2 };
		model.merge(base, { 'a': 3, 'c': 4 }, true);
		assert.deepEqual(base, { 'a': 3, 'b': 2, 'c': 4 });
		base = { 'a': 1, 'b': 2 };
		model.merge(base, { 'a': 3, 'c': 4 }, false);
		assert.deepEqual(base, { 'a': 1, 'b': 2, 'c': 4 });
	});

	test('Recursive merge', () => {
		const base = { 'a': { 'b': 1 } };
		model.merge(base, { 'a': { 'b': 2 } }, true);
		assert.deepEqual(base, { 'a': { 'b': 2 } });
	});

	test('Test consolidate (settings and tasks)', () => {
		const settingsConfig: model.IConfigFile = {
			contents: {
				awesome: true
			}
		};

		const tasksConfig: model.IConfigFile = {
			contents: {
				awesome: false
			}
		};

		const expected = {
			awesome: true,
			tasks: {
				awesome: false
			}
		};

		assert.deepEqual(model.consolidate({ '.vscode/settings.json': settingsConfig, '.vscode/tasks.json': tasksConfig }).contents, expected);
		assert.deepEqual(model.consolidate({ '.vscode/tasks.json': tasksConfig, '.vscode/settings.json': settingsConfig }).contents, expected);
	});

	test('Test consolidate (settings and launch)', () => {
		const settingsConfig: model.IConfigFile = {
			contents: {
				awesome: true
			}
		};

		const launchConfig: model.IConfigFile = {
			contents: {
				awesome: false
			}
		};

		const expected = {
			awesome: true,
			launch: {
				awesome: false
			}
		};

		assert.deepEqual(model.consolidate({ '.vscode/settings.json': settingsConfig, '.vscode/launch.json': launchConfig }).contents, expected);
		assert.deepEqual(model.consolidate({ '.vscode/launch.json': launchConfig, '.vscode/settings.json': settingsConfig }).contents, expected);
	});

	test('Test consolidate (settings and launch and tasks) - launch/tasks wins over settings file', () => {
		const settingsConfig: model.IConfigFile = {
			contents: {
				awesome: true,
				launch: {
					launchConfig: 'defined',
					otherLaunchConfig: 'alsoDefined'
				},
				tasks: {
					taskConfig: 'defined',
					otherTaskConfig: 'alsoDefined'
				}
			}
		};

		const tasksConfig: model.IConfigFile = {
			contents: {
				taskConfig: 'overwritten',
			}
		};

		const launchConfig: model.IConfigFile = {
			contents: {
				launchConfig: 'overwritten',
			}
		};

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

		assert.deepEqual(model.consolidate({ '.vscode/settings.json': settingsConfig, '.vscode/launch.json': launchConfig, '.vscode/tasks.json': tasksConfig }).contents, expected);
		assert.deepEqual(model.consolidate({ '.vscode/launch.json': launchConfig, '.vscode/tasks.json': tasksConfig, '.vscode/settings.json': settingsConfig }).contents, expected);
		assert.deepEqual(model.consolidate({ '.vscode/tasks.json': tasksConfig, '.vscode/launch.json': launchConfig, '.vscode/settings.json': settingsConfig }).contents, expected);
	});
});