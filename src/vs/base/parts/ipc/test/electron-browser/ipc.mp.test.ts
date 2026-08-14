/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { mainWindow } from '../../../../browser/window.js';
import { Client as MessagePortClient } from '../../browser/ipc.mp.js';
import { acquirePort, MessagePortAcquisitionError } from '../../electron-browser/ipc.mp.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../test/common/utils.js';

suite('IPC, MessagePorts', () => {

	test('message port close event', async () => {
		const { port1, port2 } = new MessageChannel();

		const client1 = new MessagePortClient(port1, 'client1');
		const client2 = new MessagePortClient(port2, 'client2');

		// This test ensures that Electron's API for the close event
		// does not break because we rely on it to dispose client
		// connections from the server.
		//
		// This event is not provided by browser MessagePort API though.
		const whenClosed = new Promise<boolean>(resolve => port1.addEventListener('close', () => resolve(true)));

		client2.dispose();

		assert.ok(await whenClosed);

		client1.dispose();
	});

	test('message port acquisition reports structured errors', async () => {
		async function acquireError(nonce: string, fatal: boolean): Promise<{ message: string; fatal: boolean }> {
			const result = acquirePort(undefined, 'test:messagePortError', nonce, () => { });
			mainWindow.postMessage(null, '*');
			mainWindow.postMessage(42, '*');
			mainWindow.postMessage({ nonce, error: `failure-${fatal}`, fatal }, '*');
			try {
				await result;
				throw new Error('Expected acquirePort to reject.');
			} catch (error) {
				assert.ok(error instanceof MessagePortAcquisitionError);
				return { message: error.message, fatal: error.fatal };
			}
		}

		assert.deepStrictEqual({
			nonFatal: await acquireError('non-fatal', false),
			fatal: await acquireError('fatal', true),
		}, {
			nonFatal: { message: 'failure-false', fatal: false },
			fatal: { message: 'failure-true', fatal: true },
		});
	});

	ensureNoDisposablesAreLeakedInTestSuite();
});
