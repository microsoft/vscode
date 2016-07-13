/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as assert from 'assert';
import {CommandsRegistry} from 'vs/platform/commands/common/commands';


suite('Command Tests', function () {

	test('register command - no handler', function () {
		assert.throws(() => CommandsRegistry.registerCommand('foo', null));
	});

	// test('register command - dupe', function () {
	// 	CommandsRegistry.registerCommand('foo', () => { });
	// 	assert.throws(() => CommandsRegistry.registerCommand('foo', () => { }));
	// });

	test('command with description', function() {

		CommandsRegistry.registerCommand('test', function (accessor, args) {
			assert.ok(typeof args === 'string');
		});

		CommandsRegistry.registerCommand('test2', function (accessor, args) {
			assert.ok(typeof args === 'string');
		});

		CommandsRegistry.registerCommand('test3', {
			handler: function (accessor, args) {
				return true;
			},
			description: {
				description: 'a command',
				args: [{ name: 'value', constraint: Number }]
			}
		});

		CommandsRegistry.getCommands()['test'].handler.apply(undefined, [undefined, 'string']);
		CommandsRegistry.getCommands()['test2'].handler.apply(undefined, [undefined, 'string']);
		assert.throws(() => CommandsRegistry.getCommands()['test3'].handler.apply(undefined, [undefined, 'string']));
		assert.equal(CommandsRegistry.getCommands()['test3'].handler.apply(undefined, [undefined, 1]), true);

	});
});
