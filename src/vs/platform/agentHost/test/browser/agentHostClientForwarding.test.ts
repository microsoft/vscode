/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { VSBuffer } from '../../../../base/common/buffer.js';
import { Emitter } from '../../../../base/common/event.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { AgentHostClientForwarding } from '../../browser/agentHostClientForwarding.js';
import type { IAgentHostClientForwardingMainService } from '../../common/agentHostClientForwardingMainService.js';

suite('AgentHostClientForwarding', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('turning forwarding off closes open agent connections and then forwards only the identity', async () => {
		const onDidChangeForwardCredentials = store.add(new Emitter<void>());
		const calls: string[] = [];
		const service: IAgentHostClientForwardingMainService = {
			_serviceBrand: undefined,
			onDidReceiveData: store.add(new Emitter<readonly [string, VSBuffer]>()).event,
			onDidClose: store.add(new Emitter<string>()).event,
			describe: async () => ({ sshAgent: true, gpgAgent: false, keyboxd: false }),
			open: async (_id, socket) => {
				calls.push(`open ${socket}`);
			},
			write: async () => { },
			close: async () => {
				calls.push('close');
			},
			gitCredential: async () => 'password=secret\n',
			gpgKeys: async () => ({ ownertrust: 'dHJ1c3Q=' }),
			gitConfig: async full => ({ user: { name: full ? 'With configuration' : 'Identity only' } }),
		};
		let forward = true;
		const forwarding = store.add(new AgentHostClientForwarding(service, { forwardCredentials: () => forward, onDidChangeForwardCredentials: onDidChangeForwardCredentials.event }));
		const connection = await forwarding.open('ssh-agent');
		let closed = false;
		// Like the protocol client, which disposes a connection its agent closed.
		store.add(connection.onDidClose(() => {
			closed = true;
			connection.dispose();
		}));

		forward = false;
		onDidChangeForwardCredentials.fire();
		assert.deepStrictEqual({
			closed,
			calls,
			describe: await forwarding.describe(),
			open: await forwarding.open('ssh-agent').then(() => 'opened', error => error.message),
			gitCredential: await forwarding.gitCredential('get', 'host=example.com\n'),
			gpgKeys: await forwarding.gpgKeys(),
			gitConfig: await forwarding.gitConfig(),
		}, {
			closed: true,
			calls: ['open ssh-agent', 'close'],
			describe: { gitConfig: false, gitCredentials: false, sshAgent: false, gpgAgent: false, keyboxd: false },
			open: 'This client does not forward its agents',
			gitCredential: '',
			gpgKeys: {},
			gitConfig: { user: { name: 'Identity only' } },
		});
	});
});
