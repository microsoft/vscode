/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { timeout } from '../../../../common/async.js';
import { CancellationTokenSource } from '../../../../common/cancellation.js';
import { Event } from '../../../../common/event.js';
import { ChannelClient } from '../../common/ipc.js';
import { Server } from '../../node/ipc.cp.js';
import { TestChannel, TestService } from './testService.js';

async function runDeferredCancellationTest(): Promise<void> {
	const unhandledRejections: unknown[] = [];
	process.on('unhandledRejection', reason => unhandledRejections.push(reason));

	const client = new ChannelClient({ onMessage: Event.None, send: () => { } });
	const cancellationTokenSource = new CancellationTokenSource();
	const result = client.getChannel('test').call('call', undefined, cancellationTokenSource.token);
	cancellationTokenSource.cancel();
	await result.catch(() => { });

	const listener = client.getChannel('test').listen('event')(() => { });
	listener.dispose();
	await timeout(0);

	process.exit(unhandledRejections.length);
}

if (process.env['VSCODE_IPC_TEST_DEFERRED_CANCELLATION']) {
	runDeferredCancellationTest().catch(() => process.exit(1));
} else {
	const server = new Server('test');
	const service = new TestService();
	server.registerChannel('test', new TestChannel(service));
}
