/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { mock } from '../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { MainContext, MainThreadTerminalServiceShape } from '../../common/extHost.protocol.js';
import { ArgumentProcessor, ExtHostCommands } from '../../common/extHostCommands.js';
import { WorkerExtHostTerminalService } from '../../common/extHostTerminalService.js';
import { TerminalExitReason } from '../../common/extHostTypes.js';
import { IExtHostInitDataService } from '../../common/extHostInitDataService.js';
import { TestRPCProtocol } from './testRPCProtocol.js';

suite('ExtHostTerminalService', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('$acceptTerminalClosed releases link cache and cancellation source', async () => {
		const rpcProtocol = new TestRPCProtocol();
		rpcProtocol.set(MainContext.MainThreadTerminalService, new class extends mock<MainThreadTerminalServiceShape>() {
			override async $registerProcessSupport(): Promise<void> { }
			override async $sendProcessExit(): Promise<void> { }
		});

		const commands = new class extends mock<ExtHostCommands>() {
			override registerArgumentProcessor(_processor: ArgumentProcessor): void { }
		};
		const initData = new class extends mock<IExtHostInitDataService>() {
			override readonly remote = { authority: 'test+remote', isRemote: true, connectionData: null };
		};

		const service = store.add(new WorkerExtHostTerminalService(commands, rpcProtocol, initData));

		// Directly seed the per-terminal state that $provideLinks would populate, so the test
		// focuses on the cleanup behaviour of $acceptTerminalClosed without standing up a real
		// terminal and link provider.
		const internals = service as unknown as {
			_terminalLinkCache: Map<number, Map<number, unknown>>;
			_terminalLinkCancellationSource: Map<number, CancellationTokenSource>;
		};

		const terminalId = 42;
		const cts = new CancellationTokenSource();
		internals._terminalLinkCache.set(terminalId, new Map([[1, {}]]));
		internals._terminalLinkCancellationSource.set(terminalId, cts);

		assert.strictEqual(cts.token.isCancellationRequested, false);

		await service.$acceptTerminalClosed(terminalId, undefined, TerminalExitReason.Unknown);

		assert.strictEqual(internals._terminalLinkCache.has(terminalId), false, 'link cache entry should be removed');
		assert.strictEqual(internals._terminalLinkCancellationSource.has(terminalId), false, 'cancellation source entry should be removed');
		assert.strictEqual(cts.token.isCancellationRequested, true, 'cancellation source should be cancelled');
	});
});
