/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { bufferToStream, VSBuffer } from '../../../../base/common/buffer.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { IChannel } from '../../../../base/parts/ipc/common/ipc.js';
import { IRequestContext, IRequestOptions } from '../../../../base/parts/request/common/request.js';
import { mock } from '../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { NullLogService } from '../../../log/common/log.js';
import { IRequestService } from '../../../request/common/request.js';
import { AgentFinderRequestChannel, AgentFinderRequestChannelClient } from '../../common/agentFinderRequestIpc.js';
import { AgentFinderRequestService } from '../../common/agentFinderRequestService.js';

suite('AgentFinderRequestService', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	function createFixture(
		context: IRequestContext = { res: { statusCode: 200, headers: {} }, stream: bufferToStream(VSBuffer.fromString('{"id":"feed_test"}')) },
		request?: (token: CancellationToken) => Promise<IRequestContext>,
	) {
		const requests: IRequestOptions[] = [];
		const requestTokens: CancellationToken[] = [];
		let created = false;
		const requestService = new class extends mock<IRequestService>() {
			override async request(options: IRequestOptions, token: CancellationToken): Promise<IRequestContext> {
				requests.push(options);
				requestTokens.push(token);
				return request ? request(token) : context;
			}
		}();
		const channel = new AgentFinderRequestChannel(() => {
			created = true;
			return new AgentFinderRequestService(requestService, new NullLogService());
		});
		const client = new AgentFinderRequestChannelClient(new class extends mock<IChannel>() {
			override async call<T>(command: string, args?: unknown, token?: CancellationToken): Promise<T> {
				const result = await channel.call(undefined, command, JSON.parse(JSON.stringify(args)), token);
				return JSON.parse(JSON.stringify(result)) as T;
			}
		}());
		return { client, channel, requests, requestTokens, isCreated: () => created };
	}

	test('keeps native transport lazy and sends a bounded fixed-endpoint request over IPC', async () => {
		const fixture = createFixture();
		assert.strictEqual(fixture.isCreated(), false);
		const result = await fixture.client.request('feed_test', 'test-token', CancellationToken.None);

		assert.deepStrictEqual({ result, requests: fixture.requests, created: fixture.isCreated() }, {
			result: { kind: 'response', statusCode: 200, body: '{"id":"feed_test"}' },
			requests: [{
				url: 'https://agentfinder.github.com/internal/v1/feeds/feed_test',
				type: 'GET',
				headers: { Accept: 'application/json', Authorization: ['Bearer', 'test-token'].join(' ') },
				disableCache: true,
				timeout: 30_000,
				followRedirects: 0,
				callSite: 'agentFinder.savedResourceFeed',
			}],
			created: true,
		});
	});

	test('encodes feed IDs and preserves HTTP status for the renderer', async () => {
		const fixture = createFixture({ res: { statusCode: 401, headers: {} }, stream: bufferToStream(VSBuffer.fromString('Unauthorized')) });
		const result = await fixture.client.request('feed/name #1', 'test-token', CancellationToken.None);

		assert.deepStrictEqual({
			result,
			url: fixture.requests[0].url,
		}, {
			result: { kind: 'response', statusCode: 401, body: 'Unauthorized' },
			url: 'https://agentfinder.github.com/internal/v1/feeds/feed%2Fname%20%231',
		});
	});

	test('rejects unsupported IPC calls before creating the native service', () => {
		const fixture = createFixture();
		for (const [command, args] of [
			['other', ['feed_test', 'test-token']],
			['request', ['', 'test-token']],
			['request', ['feed_test', '']],
			['request', [' '.repeat(4097), 'test-token']],
		] as const) {
			assert.throws(() => fixture.channel.call(undefined, command, args), /Invalid Agent Finder request/);
		}
		assert.strictEqual(fixture.isCreated(), false);
	});

	test('returns bounded transport failures without exposing request errors', async () => {
		const transport = createFixture(undefined, async () => { throw new Error('private network details'); });
		const oversized = createFixture({
			res: { statusCode: 200, headers: {} },
			stream: bufferToStream(VSBuffer.fromString('x'.repeat(5 * 1024 * 1024 + 1))),
		});

		assert.deepStrictEqual({
			transport: await transport.client.request('feed_test', 'test-token', CancellationToken.None),
			oversized: await oversized.client.request('feed_test', 'test-token', CancellationToken.None),
		}, {
			transport: { kind: 'error', error: 'transport' },
			oversized: { kind: 'error', error: 'responseTooLarge' },
		});
	});
});
