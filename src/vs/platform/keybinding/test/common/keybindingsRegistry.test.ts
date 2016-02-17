/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as assert from 'assert';
import {KeybindingsRegistry} from 'vs/platform/keybinding/common/keybindingsRegistry';

suite('Keybinding Registry', () => {

	test('command with description', function() {

		KeybindingsRegistry.registerCommandDesc({
			id: 'test',
			context: undefined,
			primary: undefined,
			weight: 0,
			handler: function(accessor, args) {
				assert.ok(typeof args === 'string');
			}
		});

		KeybindingsRegistry.registerCommandDesc({
			id: 'test2',
			description: 'test',
			context: undefined,
			primary: undefined,
			weight: 0,
			handler: function(accessor, args) {
				assert.ok(typeof args === 'string');
			}
		});

		KeybindingsRegistry.registerCommandDesc({
			id: 'test3',
			context: undefined,
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

		KeybindingsRegistry.getCommands()['test'].apply(undefined, [undefined, 'string']);
		KeybindingsRegistry.getCommands()['test2'].apply(undefined, [undefined, 'string']);
		assert.throws(() => KeybindingsRegistry.getCommands()['test3'].apply(undefined, [undefined, 'string']));
		assert.equal(KeybindingsRegistry.getCommands()['test3'].apply(undefined, [undefined, 1]), true);

	});
});
