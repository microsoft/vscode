/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { DisposableStore } from 'vs/base/common/lifecycle';
import { mock, mockObject } from 'vs/base/test/common/mock';
import { ensureNoDisposablesAreLeakedInTestSuite } from 'vs/base/test/common/utils';
import { IExtensionHostDebugService } from 'vs/platform/debug/common/extensionHostDebug';
import { IDialogService } from 'vs/platform/dialogs/common/dialogs';
import { INotificationService } from 'vs/platform/notification/common/notification';
import { IOpenerService } from 'vs/platform/opener/common/opener';
import { RawDebugSession } from 'vs/workbench/contrib/debug/browser/rawDebugSession';
import { IDebugger } from 'vs/workbench/contrib/debug/common/debug';
import { MockDebugAdapter } from 'vs/workbench/contrib/debug/test/common/mockDebug';

suite('RawDebugSession', () => {
	let disposables: DisposableStore;
	setup(() => {
		disposables = new DisposableStore();
	});

	teardown(() => {
		disposables.dispose();
	});

	ensureNoDisposablesAreLeakedInTestSuite();

	function createTestObjects() {
		const debugAdapter = new MockDebugAdapter();
		const dbgr = mockObject<IDebugger>()({
			type: 'mock-debug'
		});

		const session = new RawDebugSession(
			debugAdapter,
			dbgr as any as IDebugger,
			'sessionId',
			'name',
			new (mock<IExtensionHostDebugService>()),
			new (mock<IOpenerService>()),
			new (mock<INotificationService>()),
			new (mock<IDialogService>()));
		disposables.add(session);
		disposables.add(debugAdapter);

		return { debugAdapter, dbgr };
	}

	test('handles startDebugging request success', async () => {
		const { debugAdapter, dbgr } = createTestObjects();
		dbgr.startDebugging.returns(Promise.resolve(true));

		debugAdapter.sendRequestBody('startDebugging', {
			request: 'launch',
			configuration: {
				type: 'some-other-type'
			}
		} as DebugProtocol.StartDebuggingRequestArguments);
		const response = await debugAdapter.waitForResponseFromClient('startDebugging');
		assert.strictEqual(response.command, 'startDebugging');
		assert.strictEqual(response.success, true);
	});

	test('handles startDebugging request failure', async () => {
		const { debugAdapter, dbgr } = createTestObjects();
		dbgr.startDebugging.returns(Promise.resolve(false));

		debugAdapter.sendRequestBody('startDebugging', {
			request: 'launch',
			configuration: {
				type: 'some-other-type'
			}
		} as DebugProtocol.StartDebuggingRequestArguments);
		const response = await debugAdapter.waitForResponseFromClient('startDebugging');
		assert.strictEqual(response.command, 'startDebugging');
		assert.strictEqual(response.success, false);
	});
});
