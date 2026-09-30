/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as sinon from 'sinon';
import { DeferredPromise, raceCancellationError } from '../../../../base/common/async.js';
import { bufferToStream, newWriteableBufferStream, VSBuffer } from '../../../../base/common/buffer.js';
import { CancellationToken, CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { isCancellationError } from '../../../../base/common/errors.js';
import { IChannel } from '../../../../base/parts/ipc/common/ipc.js';
import { IRequestContext, IRequestOptions } from '../../../../base/parts/request/common/request.js';
import { mock } from '../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { runWithFakedTimers } from '../../../../base/test/common/virtualScheduling/index.js';
import { NullLogService } from '../../../log/common/log.js';
import product from '../../../product/common/product.js';
import { IProductService } from '../../../product/common/productService.js';
import { IRequestService } from '../../../request/common/request.js';
import { CopilotConnectorsRequestChannel, CopilotConnectorsRequestChannelClient } from '../../common/copilotConnectorsIpc.js';
import { CopilotConnectorsRequestService } from '../../common/copilotConnectorsRequestService.js';

suite('CopilotConnectorsRequestService', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	teardown(() => sinon.restore());

	function createFixture(
		context: IRequestContext = { res: { statusCode: 200, headers: {} }, stream: bufferToStream(VSBuffer.fromString('{"plugins":[]}')) },
		endpoint = 'https://api.github.test/copilot-connectors/api/v1/',
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
		const productService = new class extends mock<IProductService>() {
			override readonly defaultChatAgent = { ...product.defaultChatAgent, mcpConnectorsUrl: endpoint };
		}();
		const channel = new CopilotConnectorsRequestChannel(() => {
			created = true;
			return new CopilotConnectorsRequestService(requestService, productService, new NullLogService());
		});
		const client = new CopilotConnectorsRequestChannelClient(new class extends mock<IChannel>() {
			override async call<T>(command: string, args?: unknown, token?: CancellationToken): Promise<T> {
				const result = await channel.call(undefined, command, JSON.parse(JSON.stringify(args)), token);
				return (result === undefined ? undefined : JSON.parse(JSON.stringify(result))) as T;
			}
		}());
		return { client, channel, requests, requestTokens, isCreated: () => created };
	}

	test('keeps native transport lazy and sends a bounded, non-redirecting catalog request over IPC', async () => {
		const fixture = createFixture();
		assert.strictEqual(fixture.isCreated(), false);
		const result = await fixture.client.request({ type: 'query' }, 'test-token', CancellationToken.None);

		assert.deepStrictEqual({ result, requests: fixture.requests, created: fixture.isCreated() }, {
			result: { plugins: [] },
			requests: [{
				url: 'https://api.github.test/copilot-connectors/api/v1/plugins',
				type: 'GET',
				headers: { Accept: 'application/json', Authorization: 'Bearer test-token' },
				data: undefined,
				timeout: 30_000,
				followRedirects: 0,
				disableCache: true,
				callSite: 'copilotConnectors.query',
			}],
			created: true,
		});
	});

	test('constructs connect and disconnect paths and payloads in the native service', async () => {
		const fixture = createFixture({ res: { statusCode: 204, headers: {} }, stream: bufferToStream(VSBuffer.alloc(0)) });
		await fixture.client.request({ type: 'connect', name: 'test/name #1' }, 'test-token', CancellationToken.None);
		await fixture.client.request({ type: 'disconnect', name: 'test/name #1' }, 'test-token', CancellationToken.None);

		assert.deepStrictEqual(fixture.requests.map(({ url, type, data, callSite }) => ({ url, type, data, callSite })), [
			{
				url: 'https://api.github.test/copilot-connectors/api/v1/connectors/managed/test%2Fname%20%231/connection',
				type: 'PUT', data: '{"client_source":"VS_CODE"}', callSite: 'copilotConnectors.connect',
			},
			{
				url: 'https://api.github.test/copilot-connectors/api/v1/connectors/managed/test%2Fname%20%231/connection',
				type: 'DELETE', data: undefined, callSite: 'copilotConnectors.disconnect',
			},
		]);
	});

	test('does not accept caller-provided endpoints or request bodies', async () => {
		const fixture = createFixture();
		await fixture.channel.call(undefined, 'request', [{ type: 'query', url: 'https://untrusted.test', data: 'untrusted' }, 'test-token']);
		assert.deepStrictEqual(fixture.requests.map(({ url, data }) => ({ url, data })), [{
			url: 'https://api.github.test/copilot-connectors/api/v1/plugins',
			data: undefined,
		}]);
	});

	test('rejects unsupported IPC commands and operations before creating the native service', () => {
		const fixture = createFixture();
		assert.throws(() => fixture.channel.call(undefined, 'other', [{ type: 'query' }, 'test-token']), /Invalid Copilot connectors request/);
		for (const request of [{ type: 'other' }, { type: 'connect' }, { type: 'disconnect', name: '' }, { type: 'connect', name: '..' }, { type: 'connect', name: '.' }]) {
			assert.throws(() => fixture.channel.call(undefined, 'request', [request, 'test-token']), /Invalid Copilot connectors request/);
		}
		assert.strictEqual(fixture.isCreated(), false);
	});

	test('rejects invalid product endpoints without sending credentials', async () => {
		for (const endpoint of ['http://api.github.test', 'not a URL', 'https://user@api.github.test', 'https://api.github.test?path=other', 'https://api.github.test#other']) {
			const fixture = createFixture(undefined, endpoint);
			await assert.rejects(fixture.client.request({ type: 'query' }, 'test-token', CancellationToken.None), /not available in this product/);
			assert.deepStrictEqual(fixture.requests, []);
		}
	});

	for (const statusCode of [302, 401, 403, 500]) {
		test(`preserves HTTP ${statusCode} rather than reporting a network failure`, async () => {
			const stream = bufferToStream(VSBuffer.fromString('{"message":"error"}'));
			const destroy = sinon.spy(stream, 'destroy');
			const fixture = createFixture({ res: { statusCode, headers: {} }, stream });
			await assert.rejects(fixture.client.request({ type: 'query' }, 'test-token', CancellationToken.None), new RegExp(`HTTP ${statusCode}`));
			assert.ok(destroy.called);
		});
	}

	test('reports an actual transport error separately', async () => {
		const fixture = createFixture(undefined, undefined, async () => { throw new Error('Network unavailable'); });
		await assert.rejects(fixture.client.request({ type: 'query' }, 'test-token', CancellationToken.None), /could not be reached/);
	});

	test('rejects malformed JSON and destroys the response stream', async () => {
		const stream = bufferToStream(VSBuffer.fromString('{invalid'));
		const destroy = sinon.spy(stream, 'destroy');
		const fixture = createFixture({ res: { statusCode: 200, headers: {} }, stream });
		await assert.rejects(fixture.client.request({ type: 'query' }, 'test-token', CancellationToken.None), /invalid response/);
		assert.ok(destroy.called);
	});

	test('enforces the five MiB response bound before returning a payload over IPC', async () => {
		const stream = bufferToStream(VSBuffer.alloc(5 * 1024 * 1024 + 1));
		const destroy = sinon.spy(stream, 'destroy');
		const fixture = createFixture({ res: { statusCode: 200, headers: {} }, stream });
		await assert.rejects(fixture.client.request({ type: 'query' }, 'test-token', CancellationToken.None), /response is too large/);
		assert.ok(destroy.called);
	});

	test('accepts a response exactly at the five MiB limit', async () => {
		const stream = bufferToStream(VSBuffer.fromString(' '.repeat(5 * 1024 * 1024 - 2) + '[]'));
		const fixture = createFixture({ res: { statusCode: 200, headers: {} }, stream });
		assert.deepStrictEqual(await fixture.client.request({ type: 'query' }, 'test-token', CancellationToken.None), []);
	});

	test('forwards cancellation across IPC to the native HTTP request', async () => {
		const started = new DeferredPromise<void>();
		const pending = new DeferredPromise<IRequestContext>();
		const cancellation = store.add(new CancellationTokenSource());
		const fixture = createFixture(undefined, undefined, token => {
			started.complete();
			return raceCancellationError(pending.p, token);
		});
		const result = fixture.client.request({ type: 'query' }, 'test-token', cancellation.token);
		await started.p;
		cancellation.cancel();
		await assert.rejects(result, isCancellationError);
		assert.ok(fixture.requestTokens[0].isCancellationRequested);
	});

	test('does not issue an HTTP request when already cancelled', async () => {
		const fixture = createFixture();
		await assert.rejects(fixture.client.request({ type: 'query' }, 'test-token', CancellationToken.Cancelled), isCancellationError);
		assert.deepStrictEqual(fixture.requests, []);
	});

	test('cancels and destroys a pending native response body', async () => {
		const stream = newWriteableBufferStream();
		const destroy = sinon.spy(stream, 'destroy');
		const cancellation = store.add(new CancellationTokenSource());
		const fixture = createFixture({ res: { statusCode: 200, headers: {} }, stream });
		const result = fixture.client.request({ type: 'query' }, 'test-token', cancellation.token);
		cancellation.cancel();
		await assert.rejects(result, isCancellationError);
		assert.ok(destroy.called);
	});

	test('times out stalled response bodies after thirty seconds', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const stream = newWriteableBufferStream();
		const destroy = sinon.spy(stream, 'destroy');
		const fixture = createFixture({ res: { statusCode: 200, headers: {} }, stream });
		const start = Date.now();
		await assert.rejects(fixture.client.request({ type: 'query' }, 'test-token', CancellationToken.None), /request timed out/);
		assert.deepStrictEqual({ duration: Date.now() - start, destroyed: destroy.called }, { duration: 30_000, destroyed: true });
	}));
});
