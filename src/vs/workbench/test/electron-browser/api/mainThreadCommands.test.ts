/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as assert from 'assert';
import { MainThreadCommands } from 'vs/workbench/api/electron-browser/mainThreadCommands';
import { CommandsRegistry } from 'vs/platform/commands/common/commands';
import { OneGetThreadService } from './testThreadService';

suite('MainThreadCommands', function () {

	test('dispose on unregister', function () {

		const commands = new MainThreadCommands(OneGetThreadService(null), undefined);
		assert.equal(CommandsRegistry.getCommand('foo'), undefined);

		// register
		commands.$registerCommand('foo');
		assert.ok(CommandsRegistry.getCommand('foo'));

		// unregister
		commands.$unregisterCommand('foo');
		assert.equal(CommandsRegistry.getCommand('foo'), undefined);
	});

	test('unregister all on dispose', function () {

		const commands = new MainThreadCommands(OneGetThreadService(null), undefined);
		assert.equal(CommandsRegistry.getCommand('foo'), undefined);

		commands.$registerCommand('foo');
		commands.$registerCommand('bar');

		assert.ok(CommandsRegistry.getCommand('foo'));
		assert.ok(CommandsRegistry.getCommand('bar'));

		commands.dispose();

		assert.equal(CommandsRegistry.getCommand('foo'), undefined);
		assert.equal(CommandsRegistry.getCommand('bar'), undefined);
	});
});
