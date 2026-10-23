/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ipcRenderer } from 'electron';
import type * as http from 'http';
import { IRequestOptions } from '../../../../base/parts/request/common/request.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';

suite('Request Service - Electron redirects', () => {
	const headers = { Authorization: 'Bearer token', Cookie: 'session=secret' };
	const credentials = { authorization: headers.Authorization, cookie: headers.Cookie };
	const noCredentials = { authorization: undefined, cookie: undefined };
	let servers: http.Server[];
	let origin: string;
	let otherOrigin: string;
	let captured: { path: string | undefined; method: string | undefined; body: string; authorization: string | undefined; cookie: string | undefined }[];

	setup(async () => {
		const http = await import('http');
		servers = [];
		captured = [];
		const listen = async () => {
			const server = http.createServer((req, res) => {
				const chunks: Buffer[] = [];
				req.on('data', chunk => chunks.push(chunk));
				req.on('end', () => {
					captured.push({ path: req.url, method: req.method, body: Buffer.concat(chunks).toString(), authorization: req.headers.authorization, cookie: req.headers.cookie });
					let location: string;
					switch (req.url) {
						case '/same':
						case '/post':
							location = '/final';
							break;
						case '/cross':
							location = `${otherOrigin}/final`;
							break;
						case '/out-and-back':
							location = `${otherOrigin}/back`;
							break;
						case '/back':
							location = `${origin}/final`;
							break;
						case '/loop':
							location = '/loop';
							break;
						case '/cancel':
							location = '/pending';
							break;
						case '/pending':
							return;
						default:
							res.end('ok');
							return;
					}
					res.writeHead(req.url === '/post' ? 303 : 302, { location });
					res.end();
				});
			});
			servers.push(server);
			await new Promise<void>((resolve, reject) => server.once('error', reject).listen(0, '127.0.0.1', resolve));
			const address = server.address();
			assert.ok(address && typeof address !== 'string');
			return `http://127.0.0.1:${address.port}`;
		};
		origin = await listen();
		otherOrigin = await listen();
	});

	teardown(async () => {
		await Promise.all(servers.map(server => new Promise<void>((resolve, reject) => {
			server.closeAllConnections();
			server.close(error => error ? reject(error) : resolve());
		})));
	});

	function request(path: string, options: Partial<IRequestOptions> = {}, cancelOnRedirect = false): Promise<{ statusCode: number; body: string }> {
		return ipcRenderer.invoke('vscode:test-platform-request', {
			url: `${origin}${path}`,
			headers,
			callSite: 'requestService.test.electronRedirects',
			...options
		}, cancelOnRedirect);
	}

	for (const { path, expected } of [
		{ path: '/same', expected: [credentials, credentials] },
		{ path: '/cross', expected: [credentials, noCredentials] },
		{ path: '/out-and-back', expected: [credentials, noCredentials, noCredentials] }
	]) {
		test(`handles ${path} with the real net.request transport`, async () => {
			const response = await request(path);
			assert.deepStrictEqual({
				response,
				credentials: captured.map(({ authorization, cookie }) => ({ authorization, cookie }))
			}, {
				response: { statusCode: 200, body: 'ok' },
				credentials: expected
			});
		});
	}

	for (const followRedirects of [undefined, 0, 1, 3]) {
		test(`honors a redirect limit of ${followRedirects ?? 'default'}`, async () => {
			const response = await request('/loop', { followRedirects });
			assert.deepStrictEqual({ response, requests: captured.length }, {
				response: { statusCode: 302, body: '' },
				requests: (followRedirects ?? 3) + 1
			});
		});
	}

	test('preserves Chromium method changes without resending the request body', async () => {
		const response = await request('/post', { type: 'POST', data: 'request body' });
		assert.deepStrictEqual({ response, requests: captured.map(({ method, body }) => ({ method, body })) }, {
			response: { statusCode: 200, body: 'ok' },
			requests: [{ method: 'POST', body: 'request body' }, { method: 'GET', body: '' }]
		});
	});

	test('cancels while following a redirect', async () => {
		await assert.rejects(request('/cancel', {}, true), /Canceled/);
	});

	ensureNoDisposablesAreLeakedInTestSuite();
});
