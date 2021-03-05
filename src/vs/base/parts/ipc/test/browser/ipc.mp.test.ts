/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { Event } from 'vs/base/common/event';
import { CancellationToken } from 'vs/base/common/cancellation';
import { Client as MessagePortClient } from 'vs/base/parts/ipc/browser/ipc.mp';

suite('IPC, MessagePorts', () => {

	test('message passing', async () => {
		const { port1, port2 } = new MessageChannel();

		const client1 = new MessagePortClient(port1, 'client1');
		const client2 = new MessagePortClient(port2, 'client2');

		client1.registerChannel('client1', {
			call(_: unknown, command: string, arg: any, cancellationToken: CancellationToken): Promise<any> {
				switch (command) {
					case 'testMethodClient1': return Promise.resolve('success1');
					default: return Promise.reject(new Error('not implemented'));
				}
			},

			listen(_: unknown, event: string, arg?: any): Event<any> {
				switch (event) {
					default: throw new Error('not implemented');
				}
			}
		});

		client2.registerChannel('client2', {
			call(_: unknown, command: string, arg: any, cancellationToken: CancellationToken): Promise<any> {
				switch (command) {
					case 'testMethodClient2': return Promise.resolve('success2');
					default: return Promise.reject(new Error('not implemented'));
				}
			},

			listen(_: unknown, event: string, arg?: any): Event<any> {
				switch (event) {
					default: throw new Error('not implemented');
				}
			}
		});

		const channelClient1 = client2.getChannel('client1');
		assert.strictEqual(await channelClient1.call('testMethodClient1'), 'success1');

		const channelClient2 = client1.getChannel('client2');
		assert.strictEqual(await channelClient2.call('testMethodClient2'), 'success2');

		client1.dispose();
		client2.dispose();
	});
});
