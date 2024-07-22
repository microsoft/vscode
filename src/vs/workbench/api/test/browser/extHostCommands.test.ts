/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ExtHostCommands } from 'vs/workbench/api/common/extHostCommands';
import { MainThreadCommandsShape } from 'vs/workbench/api/common/extHost.protocol';
import { CommandsRegistry } from 'vs/platform/commands/common/commands';
import { SingleProxyRPCProtocol } from 'vs/workbench/api/test/common/testRPCProtocol';
import { mock } from 'vs/base/test/common/mock';
import { NullLogService } from 'vs/platform/log/common/log';
import { IExtHostTelemetry } from 'vs/workbench/api/common/extHostTelemetry';
import { ensureNoDisposablesAreLeakedInTestSuite } from 'vs/base/test/common/utils';

suite('ExtHostCommands', function () {
	ensureNoDisposablesAreLeakedInTestSuite();

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
			new NullLogService(),
			new class extends mock<IExtHostTelemetry>() {
				override onExtensionError(): boolean {
					return true;
				}
			}
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
			new NullLogService(),
			new class extends mock<IExtHostTelemetry>() {
				override onExtensionError(): boolean {
					return true;
				}
			}
		);
		const reg = commands.registerCommand(true, 'foo', (): any => { });
		reg.dispose();
		reg.dispose();
		reg.dispose();
		assert.strictEqual(unregisterCounter, 1);
	});

	test('execute with retry', async function () {

		let count = 0;

		const shape = new class extends mock<MainThreadCommandsShape>() {
			override $registerCommand(id: string): void {
				//
			}
			override async $executeCommand<T>(id: string, args: any[], retry: boolean): Promise<T | undefined> {
				count++;
				assert.strictEqual(retry, count === 1);
				if (count === 1) {
					assert.strictEqual(retry, true);
					throw new Error('$executeCommand:retry');
				} else {
					assert.strictEqual(retry, false);
					return <any>17;
				}
			}
		};

		const commands = new ExtHostCommands(
			SingleProxyRPCProtocol(shape),
			new NullLogService(),
			new class extends mock<IExtHostTelemetry>() {
				override onExtensionError(): boolean {
					return true;
				}
			}
		);

		const result: number = await commands.executeCommand('fooo', [this, true]);
		assert.strictEqual(result, 17);
		assert.strictEqual(count, 2);
	});

	test('onCommand:abc activates extensions when executed from command palette, but not when executed programmatically with vscode.commands.executeCommand #150293', async function () {

		const activationEvents: string[] = [];

		const shape = new class extends mock<MainThreadCommandsShape>() {
			override $registerCommand(id: string): void {
				//
			}
			override $fireCommandActivationEvent(id: string): void {
				activationEvents.push(id);
			}
		};
		const commands = new ExtHostCommands(
			SingleProxyRPCProtocol(shape),
			new NullLogService(),
			new class extends mock<IExtHostTelemetry>() {
				override onExtensionError(): boolean {
					return true;
				}
			}
		);

		commands.registerCommand(true, 'extCmd', (args: any): any => args);

		const result: unknown = await commands.executeCommand('extCmd', this);
		assert.strictEqual(result, this);
		assert.deepStrictEqual(activationEvents, ['extCmd']);
	});
});
