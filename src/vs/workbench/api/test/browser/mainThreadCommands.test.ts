/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { VSBuffer } from '../../../../base/common/buffer.js';
import { Emitter } from '../../../../base/common/event.js';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { URI } from '../../../../base/common/uri.js';
import { MainThreadCommands } from '../../browser/mainThreadCommands.js';
import { CommandsRegistry, ICommandService } from '../../../../platform/commands/common/commands.js';
import { NullLogService } from '../../../../platform/log/common/log.js';
import { SingleProxyRPCProtocol } from '../common/testRPCProtocol.js';
import { IExtensionService } from '../../../services/extensions/common/extensions.js';
import { IExtHostContext } from '../../../services/extensions/common/extHostCustomers.js';
import { RPCProtocol } from '../../../services/extensions/common/rpcProtocol.js';
import { mock, upcastPartial } from '../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { createChatInputToolbarContext } from '../../../contrib/chat/browser/actions/chatExecuteActions.js';
import { isChatViewTitleActionContext } from '../../../contrib/chat/common/actions/chatActions.js';
import { createCircularChatWidget } from '../../../contrib/chat/test/browser/widget/mockChatWidget.js';
import { ExtHostContext, MainContext, MainThreadChatAgentsShape2 } from '../../common/extHost.protocol.js';
import { ExtHostChatAgents2 } from '../../common/extHostChatAgents2.js';
import { ExtHostCommands } from '../../common/extHostCommands.js';
import { ExtHostRpcService } from '../../common/extHostRpcService.js';
import { IExtHostTelemetry } from '../../common/extHostTelemetry.js';

suite('MainThreadCommands', function () {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('dispose on unregister', function () {

		const commands = new MainThreadCommands(SingleProxyRPCProtocol(null), undefined!, new class extends mock<IExtensionService>() { });
		assert.strictEqual(CommandsRegistry.getCommand('foo'), undefined);

		// register
		commands.$registerCommand('foo');
		assert.ok(CommandsRegistry.getCommand('foo'));

		// unregister
		commands.$unregisterCommand('foo');
		assert.strictEqual(CommandsRegistry.getCommand('foo'), undefined);

		commands.dispose();

	});

	test('unregister all on dispose', function () {

		const commands = new MainThreadCommands(SingleProxyRPCProtocol(null), undefined!, new class extends mock<IExtensionService>() { });
		assert.strictEqual(CommandsRegistry.getCommand('foo'), undefined);

		commands.$registerCommand('foo');
		commands.$registerCommand('bar');

		assert.ok(CommandsRegistry.getCommand('foo'));
		assert.ok(CommandsRegistry.getCommand('bar'));

		commands.dispose();

		assert.strictEqual(CommandsRegistry.getCommand('foo'), undefined);
		assert.strictEqual(CommandsRegistry.getCommand('bar'), undefined);
	});

	test('activate and throw when needed', async function () {

		const activations: string[] = [];
		const runs: string[] = [];

		const commands = new MainThreadCommands(
			SingleProxyRPCProtocol(null),
			new class extends mock<ICommandService>() {
				override executeCommand<T>(id: string): Promise<T | undefined> {
					runs.push(id);
					return Promise.resolve(undefined);
				}
			},
			new class extends mock<IExtensionService>() {
				override activateByEvent(id: string) {
					activations.push(id);
					return Promise.resolve();
				}
			}
		);

		// case 1: arguments and retry
		try {
			activations.length = 0;
			await commands.$executeCommand('bazz', [1, 2, { n: 3 }], true);
			assert.ok(false);
		} catch (e) {
			assert.deepStrictEqual(activations, ['onCommand:bazz']);
			assert.strictEqual((<Error>e).message, '$executeCommand:retry');
		}

		// case 2: no arguments and retry
		runs.length = 0;
		await commands.$executeCommand('bazz', [], true);
		assert.deepStrictEqual(runs, ['bazz']);

		// case 3: arguments and no retry
		runs.length = 0;
		await commands.$executeCommand('bazz', [1, 2, true], false);
		assert.deepStrictEqual(runs, ['bazz']);

		commands.dispose();
	});

	test('runs extension commands from chat input toolbars', async function () {
		const store = new DisposableStore();
		try {
			const toMainThread = store.add(new Emitter<VSBuffer>());
			const toExtHost = store.add(new Emitter<VSBuffer>());
			const mainThreadRpc = store.add(new RPCProtocol({ onMessage: toMainThread.event, send: message => queueMicrotask(() => toExtHost.fire(message)) }));
			const extHostRpc = store.add(new RPCProtocol({ onMessage: toExtHost.event, send: message => queueMicrotask(() => toMainThread.fire(message)) }));

			const extHostCommands = new ExtHostCommands(new ExtHostRpcService(extHostRpc), new NullLogService(), new class extends mock<IExtHostTelemetry>() { });
			const crossedRpc: unknown[] = [];
			extHostCommands.registerArgumentProcessor({ processArgument: arg => { crossedRpc.push(arg); return arg; } });
			// Registers the production argument processor for chat view contexts.
			store.add(new ExtHostChatAgents2(SingleProxyRPCProtocol(new class extends mock<MainThreadChatAgentsShape2>() { }), new NullLogService(), extHostCommands, undefined!, undefined!, undefined!, undefined!, undefined!, undefined!));
			extHostRpc.set(ExtHostContext.ExtHostCommands, extHostCommands);
			const received: unknown[][] = [];
			// `registerCommand` takes a generic callback, which requires an `any` return type here.
			store.add(extHostCommands.registerCommand(false, 'demo.analyze', (...args: unknown[]): any => { received.push(args); }));

			const commands = store.add(new MainThreadCommands(upcastPartial<IExtHostContext>({ getProxy: identifier => mainThreadRpc.getProxy(identifier) }), undefined!, new class extends mock<IExtensionService>() { }));
			mainThreadRpc.set(MainContext.MainThreadCommands, commands);
			commands.$registerCommand('demo.analyze');

			const sessionResource = URI.parse('vscode-chat-session://local/session');
			const inputUri = URI.parse('vscode-chat-input:input-1');
			const handler = CommandsRegistry.getCommand('demo.analyze')!.handler;
			await handler(undefined!, createChatInputToolbarContext(createCircularChatWidget(inputUri, sessionResource)));
			await handler(undefined!, createChatInputToolbarContext(createCircularChatWidget(inputUri, undefined)));

			assert.deepStrictEqual({
				crossedRpc: crossedRpc.map(arg => isChatViewTitleActionContext(arg) ? { sessionResource: arg.sessionResource.toString(), inputUri: arg.inputUri?.toString() } : arg),
				received,
			}, {
				crossedRpc: [{ sessionResource: sessionResource.toString(), inputUri: inputUri.toString() }, null],
				received: [[null], [null]],
			});
		} finally {
			store.dispose();
		}
	});
});
