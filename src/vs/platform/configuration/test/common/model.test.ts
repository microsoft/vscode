/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import assert = require('assert');
import model = require('vs/platform/configuration/common/model');

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
		let base = { 'a': { 'b': 1 } };
		model.merge(base, { 'a': { 'b': 2 } }, true);
		assert.deepEqual(base, { 'a': { 'b': 2 } });
	});

	test('Test consolidate (settings)', () => {

		let config1: model.IConfigFile = {
			contents: {
				awesome: true
			}
		};
		let config2: model.IConfigFile = {
			contents: {
				awesome: false
			}
		};
		let expected = {
			awesome: false
		};

		assert.deepEqual(model.consolidate({ '.vscode/team.settings.json': config1, '.vscode/settings.json': config2 }).contents, expected);
		assert.deepEqual(model.consolidate({ 'settings.json': config2, 'team.settings.json': config1 }).contents, {});
		assert.deepEqual(model.consolidate({ '.vscode/team.settings.json': config1, '.vscode/settings.json': config2, '.vscode/team2.settings.json': config1 }).contents, expected);

	});

	test('Test consolidate (settings and tasks)', () => {

		let config1: model.IConfigFile = {
			contents: {
				awesome: true
			}
		};

		let config2: model.IConfigFile = {
			contents: {
				awesome: false
			}
		};
		let expected = {
			awesome: true,
			tasks: {
				awesome: false
			}
		};

		assert.deepEqual(model.consolidate({ '.vscode/settings.json': config1, '.vscode/tasks.json': config2 }).contents, expected);
	});
});
