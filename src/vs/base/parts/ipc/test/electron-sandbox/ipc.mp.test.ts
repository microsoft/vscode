/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Client as MessagePortClient } from 'vs/base/parts/ipc/browser/ipc.mp';
import { ensureNoDisposablesAreLeakedInTestSuite } from 'vs/base/test/common/utils';

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

	ensureNoDisposablesAreLeakedInTestSuite();
});
