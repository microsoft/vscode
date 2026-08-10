/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import type * as wsTypes from 'ws';
import { Event } from '../../../../base/common/event.js';
import { toDisposable } from '../../../../base/common/lifecycle.js';
import { connectionTokenQueryName } from '../../../../base/common/network.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { NullLogService } from '../../../log/common/log.js';
import { WebSocketProtocolServer } from '../../node/webSocketTransport.js';

suite('WebSocketProtocolServer', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('validates the decoded connection token', async () => {
		const validatedTokens: unknown[] = [];
		const server = store.add(await WebSocketProtocolServer.create({
			port: 0,
			connectionTokenValidate: token => {
				validatedTokens.push(token);
				return token === 'valid token';
			},
		}, new NullLogService()));
		await server.whenListening;

		const transport = Event.toPromise(server.onConnection);
		const socket = await connect(`ws://127.0.0.1:${server.boundPort}/?${connectionTokenQueryName}=valid+token`);
		store.add(toDisposable(() => socket.close()));
		store.add(await transport);

		assert.deepStrictEqual(validatedTokens, ['valid token']);
	});
});

async function connect(url: string): Promise<wsTypes.WebSocket> {
	const { WebSocket } = await import('ws');
	return new Promise((resolve, reject) => {
		const socket = new WebSocket(url);
		socket.once('open', () => resolve(socket));
		socket.once('error', reject);
	});
}
