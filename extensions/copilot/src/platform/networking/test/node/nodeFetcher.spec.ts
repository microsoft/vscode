/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { once } from 'events';
import * as http from 'http';
import * as https from 'https';
import { Duplex } from 'stream';
import { afterEach, beforeEach, suite, test, vi } from 'vitest';
import { NullEnvService } from '../../../env/common/nullEnvService';
import { NodeFetcher } from '../../node/nodeFetcher';

vi.mock('http', async importOriginal => {
	const original = await importOriginal<typeof http>();
	return { ...original, request: vi.fn(original.request) };
});
vi.mock('https', async importOriginal => {
	const original = await importOriginal<typeof https>();
	return { ...original, request: vi.fn(original.request) };
});

class TestSocket extends Duplex {
	setTimeout(_timeout: number): this {
		return this;
	}

	override _read(): void { }

	override _write(_chunk: Buffer, _encoding: BufferEncoding, callback: (error?: Error | null) => void): void {
		callback();
	}
}

suite.each([
	{ protocol: 'http', module: http },
	{ protocol: 'https', module: https },
])('NodeFetcher cancellation ($protocol)', ({ protocol, module }) => {
	let socket: TestSocket;
	let request: http.ClientRequest;
	let controller: AbortController;
	let fetcher: NodeFetcher;

	beforeEach(async () => {
		socket = new TestSocket();
		controller = new AbortController();
		fetcher = new NodeFetcher(NullEnvService.Instance);
		const { request: originalRequest } = await vi.importActual<typeof http>(protocol);
		vi.mocked(module.request).mockImplementation((url, options, callback) => {
			request = originalRequest(url, { ...options, createConnection: () => socket }, callback);
			return request;
		});
	});

	afterEach(() => {
		request?.destroy();
		socket.destroy();
		vi.resetAllMocks();
	});

	test('aborting before response headers rejects and destroys the request and socket', async () => {
		const pending = fetcher.fetch(`${protocol}://example.test`, { callSite: 'test', signal: controller.signal });
		const rejected = assert.rejects(pending, { name: 'AbortError', fetcherId: NodeFetcher.ID });
		await once(request, 'finish');
		const closed = new Promise<void>(resolve => socket.once('close', resolve));

		controller.abort();

		await rejected;
		await closed;
		assert.deepStrictEqual({ request: request.destroyed, socket: socket.destroyed }, { request: true, socket: true });
	});

	test('an already-aborted signal rejects without waiting for response headers', async () => {
		controller.abort();

		await assert.rejects(
			fetcher.fetch(`${protocol}://example.test`, { callSite: 'test', signal: controller.signal }),
			{ name: 'AbortError', fetcherId: NodeFetcher.ID },
		);
		assert.strictEqual(request.destroyed, true);
	});

	test('aborting after response headers still rejects body reads and destroys the socket', async () => {
		const pending = fetcher.fetch(`${protocol}://example.test`, { callSite: 'test', signal: controller.signal });
		await once(request, 'finish');
		socket.push('HTTP/1.1 200 OK\r\nContent-Length: 10\r\n\r\n');
		const response = await pending;
		const rejected = assert.rejects(response.text(), { name: 'AbortError' });
		const closed = new Promise<void>(resolve => socket.once('close', resolve));

		controller.abort();

		await rejected;
		await closed;
		assert.deepStrictEqual({ request: request.destroyed, socket: socket.destroyed }, { request: true, socket: true });
	});

	test('a response completes normally when the signal is not aborted', async () => {
		const pending = fetcher.fetch(`${protocol}://example.test`, { callSite: 'test', signal: controller.signal });
		await once(request, 'finish');
		socket.push('HTTP/1.1 200 OK\r\nContent-Length: 2\r\n\r\nOK');
		const response = await pending;

		assert.deepStrictEqual({ status: response.status, text: await response.text() }, { status: 200, text: 'OK' });
	});
});
