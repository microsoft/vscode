/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import http from 'http';
import type { AddressInfo } from 'net';
import { suite, test } from 'node:test';
import { fetchUrl } from '../fetch.ts';

async function withServer<T>(handler: http.RequestListener, callback: (url: string) => Promise<T>): Promise<T> {
	const server = http.createServer(handler);
	await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
	try {
		return await callback(`http://127.0.0.1:${(server.address() as AddressInfo).port}/file`);
	} finally {
		server.closeAllConnections();
		await new Promise(resolve => server.close(resolve));
	}
}

suite('fetchUrl', () => {

	test('aborts a download whose body stops arriving and keeps one that arrives slowly', { timeout: 30_000 }, async () => {
		const stalled = await withServer((_request, response) => {
			response.writeHead(200);
			response.write('partial');
		}, async url => {
			const start = Date.now();
			const message = await fetchUrl(url, { idleTimeout: 300 }, 0).then(() => 'resolved', (error: Error) => error.message);
			return { message, abortedBeforeTheWholeDownloadTimeout: Date.now() - start < 10_000 };
		});

		const slow = await withServer((_request, response) => {
			response.writeHead(200);
			let chunks = 0;
			const interval = setInterval(() => {
				response.write(`${chunks}`);
				if (++chunks === 15) {
					clearInterval(interval);
					response.end();
				}
			}, 100);
		}, async url => (await fetchUrl(url, { idleTimeout: 1000 }, 0)).contents?.toString());

		assert.deepStrictEqual({ stalled, slow }, {
			stalled: { message: 'No data received for 300 ms', abortedBeforeTheWholeDownloadTimeout: true },
			slow: '01234567891011121314',
		});
	});
});
