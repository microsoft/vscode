/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { ExtHostCommands } from 'vs/workbench/api/common/extHostCommands';
import { MainThreadCommandsShape } from 'vs/workbench/api/common/extHost.protocol';
import { CommandsRegistry } from 'vs/platform/commands/common/commands';
import { SingleProxyRPCProtocol } from 'vs/workbench/api/test/common/testRPCProtocol';
import { mock } from 'vs/base/test/common/mock';
import { NullLogService } from 'vs/platform/log/common/log';

suite('ExtHostCommands', function () {

	test('dispose calls unregister', function () {

		let lastUnregister: string;

		const shape = new class extends mock<MainThreadCommandsShape>() {
			override $registerCommand(id: string): void {
				//
			}
			override $unregisterCommand(id: string): void {
				lastUnregister = id;
			}
		};

		const commands = new ExtHostCommands(
			SingleProxyRPCProtocol(shape),
			new NullLogService()
		);
		commands.registerCommand(true, 'foo', (): any => { }).dispose();
		assert.strictEqual(lastUnregister!, 'foo');
		assert.strictEqual(CommandsRegistry.getCommand('foo'), undefined);

	});

	test('dispose bubbles only once', function () {

		let unregisterCounter = 0;

		const shape = new class extends mock<MainThreadCommandsShape>() {
			override $registerCommand(id: string): void {
				//
			}
			override $unregisterCommand(id: string): void {
				unregisterCounter += 1;
			}
		};

		const commands = new ExtHostCommands(
			SingleProxyRPCProtocol(shape),
			new NullLogService()
		);
		const reg = commands.registerCommand(true, 'foo', (): any => { });
		reg.dispose();
		reg.dispose();
		reg.dispose();
		assert.strictEqual(unregisterCounter, 1);
	});

	test('execute triggers activate', async function () {

		let count = 0;

		const shape = new class extends mock<MainThreadCommandsShape>() {
			override $registerCommand(id: string): void {
				//
			}

			override async $activateByCommandEvent(id: string): Promise<void> {
				count += 1;
			}

			override async $executeCommand<T>(id: string, args: any[]): Promise<T | undefined> {
				return undefined;
			}
		};

		const commands = new ExtHostCommands(
			SingleProxyRPCProtocol(shape),
			new NullLogService()
		);

		await commands.executeCommand('fooo', [this, true]);
		assert.strictEqual(count, 1);
	});
});
