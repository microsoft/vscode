/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as assert from 'assert';
import { CommandsRegistry } from 'vs/platform/commands/common/commands';
import { RawContextKey } from 'vs/platform/contextkey/common/contextkey';

suite('Command Tests', function () {

	test('register command - no handler', function () {
		assert.throws(() => CommandsRegistry.registerCommand('foo', null));
	});

	test('register/dispose', function () {
		const command = function () { };
		const reg = CommandsRegistry.registerCommand('foo', command);
		assert.ok(CommandsRegistry.getCommand('foo').handler === command);
		reg.dispose();
		assert.ok(CommandsRegistry.getCommand('foo') === undefined);
	});

	test('register/register/dispose', function () {
		const command1 = function () { };
		const command2 = function () { };

		// dispose overriding command
		let reg1 = CommandsRegistry.registerCommand('foo', command1);
		assert.ok(CommandsRegistry.getCommand('foo').handler === command1);

		let reg2 = CommandsRegistry.registerCommand('foo', command2);
		assert.ok(CommandsRegistry.getCommand('foo').handler === command2);
		reg2.dispose();

		assert.ok(CommandsRegistry.getCommand('foo').handler === command1);
		reg1.dispose();
		assert.ok(CommandsRegistry.getCommand('foo') === void 0);

		// dispose override command first
		reg1 = CommandsRegistry.registerCommand('foo', command1);
		reg2 = CommandsRegistry.registerCommand('foo', command2);
		assert.ok(CommandsRegistry.getCommand('foo').handler === command2);

		reg1.dispose();
		assert.ok(CommandsRegistry.getCommand('foo').handler === command2);

		reg2.dispose();
		assert.ok(CommandsRegistry.getCommand('foo') === void 0);
	});

	test('command with description', function () {

		CommandsRegistry.registerCommand('test', function (accessor, args) {
			assert.ok(typeof args === 'string');
		});

		CommandsRegistry.registerCommand('test2', function (accessor, args) {
			assert.ok(typeof args === 'string');
		});

		CommandsRegistry.registerCommand({
			id: 'test3',
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

	test('CommandsRegistry with precondition', function () {
		let r1 = CommandsRegistry.registerCommand('foo', () => { });

		const precondition = new RawContextKey<boolean>('ddd', false);
		let r2 = CommandsRegistry.registerCommand({
			id: 'bar',
			handler: () => { },
			precondition
		});

		assert.ok(CommandsRegistry.getCommand('bar').precondition === precondition);
		assert.equal(CommandsRegistry.getCommand('foo').precondition, undefined);

		r1.dispose();
		r2.dispose();
	});
});
