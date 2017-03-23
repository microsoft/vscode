/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as assert from 'assert';
import { ExtHostCommands } from 'vs/workbench/api/node/extHostCommands';
import { MainThreadCommandsShape } from 'vs/workbench/api/node/extHost.protocol';
import { TPromise } from 'vs/base/common/winjs.base';
import { CommandsRegistry } from 'vs/platform/commands/common/commands';
import { OneGetThreadService } from './testThreadService';

suite('ExtHostCommands', function () {

	test('dispose calls unregister', function () {

		let lastUnregister: string;

		const shape = new class extends MainThreadCommandsShape {
			$registerCommand(id: string): TPromise<any> {
				return undefined;
			}
			$unregisterCommand(id: string): TPromise<any> {
				lastUnregister = id;
				return undefined;
			}
		};

		const commands = new ExtHostCommands(OneGetThreadService(shape), undefined);
		commands.registerCommand('foo', () => { }).dispose();
		assert.equal(lastUnregister, 'foo');
		assert.equal(CommandsRegistry.getCommand('foo'), undefined);

	});

	test('dispose bubbles only once', function () {

		let unregisterCounter = 0;

		const shape = new class extends MainThreadCommandsShape {
			$registerCommand(id: string): TPromise<any> {
				return undefined;
			}
			$unregisterCommand(id: string): TPromise<any> {
				unregisterCounter += 1;
				return undefined;
			}
		};

		const commands = new ExtHostCommands(OneGetThreadService(shape), undefined);
		const reg = commands.registerCommand('foo', () => { });
		reg.dispose();
		reg.dispose();
		reg.dispose();
		assert.equal(unregisterCounter, 1);
	});
});
