/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import type * as vscode from 'vscode';
import { Emitter } from '../../../../base/common/event.js';
import { mock } from '../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { IShellLaunchConfigDto } from '../../../../platform/terminal/common/terminal.js';
import { MainContext, MainThreadTerminalServiceShape } from '../../common/extHost.protocol.js';
import { ArgumentProcessor, ExtHostCommands } from '../../common/extHostCommands.js';
import { WorkerExtHostTerminalService } from '../../common/extHostTerminalService.js';
import { TerminalExitReason } from '../../common/extHostTypes.js';
import { IExtHostInitDataService } from '../../common/extHostInitDataService.js';
import { TestRPCProtocol } from './testRPCProtocol.js';

suite('ExtHostTerminalService', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('$acceptTerminalClosed cancels in-flight link providers and clears the link cache', async () => {
		const rpcProtocol = new TestRPCProtocol();
		rpcProtocol.set(MainContext.MainThreadTerminalService, new class extends mock<MainThreadTerminalServiceShape>() {
			override async $registerProcessSupport(): Promise<void> { }
			override async $sendProcessExit(): Promise<void> { }
			override $startLinkProvider(): void { }
			override $stopLinkProvider(): void { }
		});

		const commands = new class extends mock<ExtHostCommands>() {
			override registerArgumentProcessor(_processor: ArgumentProcessor): void { }
		};
		const initData = new class extends mock<IExtHostInitDataService>() {
			override readonly remote = { authority: 'test+remote', isRemote: true, connectionData: null };
		};

		const service = store.add(new WorkerExtHostTerminalService(commands, rpcProtocol, initData));

		const terminalId = 42;
		service.$acceptTerminalOpened(terminalId, undefined, 'test', {} as IShellLaunchConfigDto);
		// $acceptTerminalClosed splices the terminal out of `_terminals` but doesn't dispose it,
		// so register it with the test store to keep the leak detector quiet.
		const terminal = service.getTerminalById(terminalId)!;
		store.add(terminal);

		// Link provider that only resolves when the cancellation token fires, so we can observe
		// cancellation as the externally-visible effect of $acceptTerminalClosed.
		let providerTokenCancelled = false;
		let handledAfterClose = false;
		const provider: vscode.TerminalLinkProvider = {
			provideTerminalLinks(_ctx, token) {
				return new Promise(resolve => {
					store.add(token.onCancellationRequested(() => {
						providerTokenCancelled = true;
						resolve([{ startIndex: 0, length: 5, tooltip: 'x' }]);
					}));
				});
			},
			handleTerminalLink() {
				handledAfterClose = true;
			}
		};
		store.add(service.registerLinkProvider(provider));

		const inFlight = service.$provideLinks(terminalId, 'hello');
		await service.$acceptTerminalClosed(terminalId, undefined, TerminalExitReason.Unknown);
		const firstLinks = await inFlight;

		// Any cached links that might have been written before close should have been cleared, so
		// $activateLink for a closed terminal is a no-op.
		service.$activateLink(terminalId, 0);

		// A subsequent $provideLinks for the same id sees a clean slate (terminal is gone -> []).
		const linksAfterClose = await service.$provideLinks(terminalId, 'hello');

		assert.deepStrictEqual(
			{ providerTokenCancelled, firstLinks, linksAfterClose, handledAfterClose },
			{ providerTokenCancelled: true, firstLinks: [], linksAfterClose: [], handledAfterClose: false }
		);
	});

	test('extension terminal processes are released when terminals close', async () => {
		const rpcProtocol = new TestRPCProtocol();
		let processExitCalls = 0;
		rpcProtocol.set(MainContext.MainThreadTerminalService, new class extends mock<MainThreadTerminalServiceShape>() {
			override async $registerProcessSupport(): Promise<void> { }
			override async $sendProcessExit(): Promise<void> { processExitCalls++; }
			override async $sendProcessReady(): Promise<void> { }
		});

		const commands = new class extends mock<ExtHostCommands>() {
			override registerArgumentProcessor(_processor: ArgumentProcessor): void { }
		};
		const initData = new class extends mock<IExtHostInitDataService>() {
			override readonly remote = { authority: 'test+remote', isRemote: true, connectionData: null };
		};
		const service = store.add(new WorkerExtHostTerminalService(commands, rpcProtocol, initData));

		const terminalId = 42;
		service.$acceptTerminalOpened(terminalId, undefined, 'test', {} as IShellLaunchConfigDto);
		const terminal = service.getTerminalById(terminalId)!;
		store.add(terminal);

		const writeEmitter = store.add(new Emitter<string>());
		const closeEmitter = store.add(new Emitter<number | void>());
		const inputs: string[] = [];
		let closeOnOpen = false;
		const pty: vscode.Pseudoterminal = {
			onDidWrite: writeEmitter.event,
			onDidClose: closeEmitter.event,
			open(): void { if (closeOnOpen) { closeEmitter.fire(); } },
			close(): void { },
			handleInput(data: string): void { inputs.push(data); }
		};
		service.attachPtyToTerminal(terminalId, pty);
		await service.$startExtensionTerminal(terminalId, undefined);
		await rpcProtocol.sync();

		service.$acceptProcessInput(terminalId, 'before');
		await service.$acceptTerminalClosed(terminalId, undefined, TerminalExitReason.Unknown);
		service.$acceptProcessInput(terminalId, 'after');
		closeEmitter.fire();
		await rpcProtocol.sync();

		assert.deepStrictEqual(inputs, ['before']);
		assert.strictEqual(processExitCalls, 0);

		const synchronousTerminalId = 43;
		service.$acceptTerminalOpened(synchronousTerminalId, undefined, 'test', {} as IShellLaunchConfigDto);
		store.add(service.getTerminalById(synchronousTerminalId)!);
		closeOnOpen = true;
		service.attachPtyToTerminal(synchronousTerminalId, pty);
		await service.$startExtensionTerminal(synchronousTerminalId, undefined);
		await rpcProtocol.sync();

		assert.strictEqual(closeEmitter.hasListeners(), false);
		assert.strictEqual(processExitCalls, 1);
	});
});
