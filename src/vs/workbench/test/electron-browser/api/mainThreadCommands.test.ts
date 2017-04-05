/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as assert from 'assert';
import { MainThreadCommands } from 'vs/workbench/api/node/mainThreadCommands';
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
});