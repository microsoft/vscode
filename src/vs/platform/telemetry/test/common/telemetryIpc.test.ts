/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { IChannel } from '../../../../base/parts/ipc/common/ipc.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { ITelemetryLog, TelemetryAppenderChannel, TelemetryAppenderClient } from '../../common/telemetryIpc.js';

suite('TelemetryAppenderChannel', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('forwards metered state separately from telemetry events', async () => {
		const events: ITelemetryLog[] = [];
		const states: boolean[] = [];
		const channel = new TelemetryAppenderChannel([{
			log: (eventName, data) => events.push({ eventName, data }),
			flush: async () => { },
		}], isMetered => states.push(isMetered));
		const clientChannel: IChannel = {
			call: (command, arg) => channel.call(undefined, command, arg),
			listen: event => channel.listen(undefined, event),
		};
		const client = new TelemetryAppenderClient(clientChannel);

		await client.setIsConnectionMetered(true);
		await client.log('testEvent', { value: 1 });
		await client.setIsConnectionMetered(false);

		assert.deepStrictEqual({ events, states }, {
			events: [{ eventName: 'testEvent', data: { value: 1 } }],
			states: [true, false],
		});
	});

	test('rejects malformed messages and unknown commands', async () => {
		const channel = new TelemetryAppenderChannel([], () => assert.fail('Invalid state must not be forwarded'));

		await assert.rejects(channel.call(undefined, 'setIsConnectionMetered', 'true'), /Invalid metered connection argument/);
		await assert.rejects(channel.call(undefined, 'log', null), /Invalid telemetry log argument/);
		await assert.rejects(channel.call(undefined, 'log', { eventName: 42 }), /Invalid telemetry log argument/);
		await assert.rejects(channel.call(undefined, 'unknown', undefined), /Unknown telemetry appender command/);
	});

	test('rejects state updates when the channel has no state handler', async () => {
		const channel = new TelemetryAppenderChannel([]);
		await assert.rejects(channel.call(undefined, 'setIsConnectionMetered', true), /Metered connection updates are not supported/);
	});
});
