/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { Event } from '../../../../base/common/event.js';
import { IChannel } from '../../../../base/parts/ipc/common/ipc.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { TelemetryAppenderChannel, TelemetryAppenderClient } from '../../common/telemetryIpc.js';

suite('Telemetry IPC', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('propagates metered connection state', async () => {
		const connectionStates: boolean[] = [];
		const serverChannel = new TelemetryAppenderChannel([], isMetered => connectionStates.push(isMetered));
		const clientChannel = new class implements IChannel {
			call<T>(command: string, arg?: unknown, _cancellationToken?: CancellationToken): Promise<T> {
				return serverChannel.call(undefined, command, arg);
			}

			listen<T>(): Event<T> {
				return Event.None;
			}
		};
		const client = new TelemetryAppenderClient(clientChannel);

		await client.setIsConnectionMetered(true);

		assert.deepStrictEqual(connectionStates, [true]);
	});
});
