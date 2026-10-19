/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Event } from '../../../../base/common/event.js';
import { hasKey } from '../../../../base/common/types.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { AgentHostChannelScheduler } from '../../common/agentHostChannelDelivery.js';
import { AgentHostTcpBudget, AgentHostTcpConnection, agentHostTcpReceiveLimits } from '../../common/agentHostTcpConnection.js';
import { isJsonRpcNotification, type JsonRpcNotification } from '../../common/state/sessionProtocol.js';
import { parseProtocolMessage, type IProtocolTransport } from '../../common/state/sessionTransport.js';

suite('AgentHostTcpConnection', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	for (const isHost of [false, true]) {
		test(`retains 1100 one-byte writes before the ${isHost ? 'host' : 'client'} starts reading`, async () => {
			const channel = 'ahp-tcp:/small';
			const sent: Parameters<IProtocolTransport['send']>[0][] = [];
			const failures: Error[] = [];
			const transport: IProtocolTransport = {
				onMessage: Event.None, onClose: Event.None, dispose() { },
				send: message => { sent.push(message); },
			};
			const scheduler = store.add(new AgentHostChannelScheduler(transport, error => failures.push(error)));
			const stream = store.add(new AgentHostTcpConnection(channel, {
				clientReceive: agentHostTcpReceiveLimits, hostReceive: agentHostTcpReceiveLimits,
			}, isHost, transport, scheduler, error => failures.push(error), new AgentHostTcpBudget()));
			const receive = (message: JsonRpcNotification) => {
				const parsed = parseProtocolMessage(JSON.stringify(message));
				assert.ok(isJsonRpcNotification(parsed));
				assert.strictEqual(scheduler.acceptMessage(parsed), true);
			};
			if (!isHost) {
				receive({ jsonrpc: '2.0', method: 'channel/snapshot', params: { channel, snapshot: { resource: channel, state: {}, fromSeq: 0 } } });
				await stream.ready;
			}
			for (let i = 0; i < 1100; i++) {
				receive({ jsonrpc: '2.0', method: 'tcp/data', params: { channel, data: 'YQ==' } });
			}
			assert.deepStrictEqual(failures, []);
			for (let i = 0; i < 1100; i++) {
				assert.strictEqual((await stream.read())?.toString(), 'a');
			}
			receive({ jsonrpc: '2.0', method: 'tcp/eof', params: { channel } });
			assert.strictEqual(await stream.read(), undefined);
			stream.flushCredit();
			assert.deepStrictEqual(sent.map(message => hasKey(message, { method: true }) ? message.method : undefined), ['channel/credit']);
		});
	}
});
