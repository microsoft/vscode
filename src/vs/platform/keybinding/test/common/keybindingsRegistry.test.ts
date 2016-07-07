/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as assert from 'assert';
import {KeybindingsRegistry} from 'vs/platform/keybinding/common/keybindingsRegistry';
import {CommandsRegistry} from 'vs/platform/commands/common/commands';

suite('Keybinding Registry', () => {

	test('command with description', function() {

		KeybindingsRegistry.registerCommandDesc({
			id: 'test',
			when: undefined,
			primary: undefined,
			weight: 0,
			handler: function(accessor, args) {
				assert.ok(typeof args === 'string');
			}
		});

		KeybindingsRegistry.registerCommandDesc({
			id: 'test2',
			when: undefined,
			primary: undefined,
			weight: 0,
			handler: function(accessor, args) {
				assert.ok(typeof args === 'string');
			}
		});

		KeybindingsRegistry.registerCommandDesc({
			id: 'test3',
			when: undefined,
			primary: undefined,
			weight: 0,
			description: {
				description: 'a command',
				args: [{ name: 'value', constraint: Number }]
			},
			handler: function(accessor, args) {
				return true;
			}
		});

		CommandsRegistry.getCommands()['test'].handler.apply(undefined, [undefined, 'string']);
		CommandsRegistry.getCommands()['test2'].handler.apply(undefined, [undefined, 'string']);
		assert.throws(() => CommandsRegistry.getCommands()['test3'].handler.apply(undefined, [undefined, 'string']));
		assert.equal(CommandsRegistry.getCommands()['test3'].handler.apply(undefined, [undefined, 1]), true);

	});
});
