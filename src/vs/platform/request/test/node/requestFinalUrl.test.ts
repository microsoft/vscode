/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import type { RequestListener, Server } from 'http';
import { streamToBuffer } from '../../../../base/common/buffer.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { nodeRequest } from '../../node/requestService.js';

suite('Request Service response URL', () => {
	ensureNoDisposablesAreLeakedInTestSuite();
	let servers: Server[];

	setup(() => servers = []);
	teardown(async () => {
		await Promise.all(servers.map(server => new Promise<void>((resolve, reject) => {
			server.closeAllConnections();
			server.close(error => error ? reject(error) : resolve());
		})));
	});

	async function listen(handler: RequestListener): Promise<string> {
		const { createServer } = await import('http');
		const server = createServer(handler);
		servers.push(server);
		await new Promise<void>((resolve, reject) => server.once('error', reject).listen(0, '127.0.0.1', resolve));
		const address = server.address();
		assert.ok(address && typeof address !== 'string');
		return `http://127.0.0.1:${address.port}`;
	}

	test('confirms that the response request retained its explicit authorization header', async () => {
		let received: string | undefined;
		const origin = await listen((request, response) => {
			received = request.headers.authorization;
			response.writeHead(401);
			response.end();
		});
		const result = await nodeRequest({ url: `${origin}/asset`, headers: { Authorization: 'Bearer test-token' }, callSite: 'requestFinalUrl.test' }, CancellationToken.None);
		await streamToBuffer(result.stream);
		assert.deepStrictEqual({ authorization: received, retained: result.requestHasAuthorization }, { authorization: 'Bearer test-token', retained: true });
	});

	test('records a cross-origin redirect destination rather than its entry URL', async () => {
		const finalOrigin = await listen((_request, response) => {
			response.writeHead(401);
			response.end('unauthorized');
		});
		const entryOrigin = await listen((_request, response) => {
			response.writeHead(302, { Location: `${finalOrigin}/asset` });
			response.end();
		});
		const result = await nodeRequest({ url: `${entryOrigin}/entry`, callSite: 'requestFinalUrl.test' }, CancellationToken.None);
		const body = (await streamToBuffer(result.stream)).toString();
		assert.deepStrictEqual({ url: result.url, status: result.res.statusCode, body }, {
			url: `${finalOrigin}/asset`, status: 401, body: 'unauthorized',
		});
	});
});
