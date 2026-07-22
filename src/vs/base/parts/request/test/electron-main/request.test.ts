/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type * as http from 'http';
import { AddressInfo } from 'net';
import assert from 'assert';
import { CancellationToken, CancellationTokenSource } from '../../../../common/cancellation.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../test/common/utils.js';
import { request } from '../../common/requestImpl.js';
import { streamToBuffer } from '../../../../common/buffer.js';
import { runWithFakedTimers } from '../../../../test/common/timeTravelScheduler.js';


suite('Request', () => {

	let port: number;
	let server: http.Server;
	let redirectTargetHits: number;

	setup(async () => {
		redirectTargetHits = 0;
		const http = await import('http');
		port = await new Promise<number>((resolvePort, rejectPort) => {
			server = http.createServer((req, res) => {
				if (req.url === '/noreply') {
					return; // never respond
				}
				if (req.url === '/redirect') {
					// 307 preserves the method and body on the follow-up request (unlike 301/302/303).
					res.statusCode = 307;
					res.setHeader('location', '/redirect-target');
					res.end();
					return;
				}
				if (req.url === '/redirect-target') {
					redirectTargetHits++;
				}
				res.setHeader('Content-Type', 'application/json');
				if (req.headers['echo-header']) {
					res.setHeader('echo-header', req.headers['echo-header']);
				}
				const data: Buffer[] = [];
				req.on('data', chunk => data.push(chunk));
				req.on('end', () => {
					res.end(JSON.stringify({
						method: req.method,
						url: req.url,
						data: Buffer.concat(data).toString()
					}));
				});
			}).listen(0, '127.0.0.1', () => {
				const address = server.address();
				resolvePort((address as AddressInfo).port);
			}).on('error', err => {
				rejectPort(err);
			});
		});
	});

	teardown(async () => {
		await new Promise<void>((resolve, reject) => {
			server.closeAllConnections();
			server.close(err => err ? reject(err) : resolve());
		});
	});

	test('GET', async () => {
		const context = await request({
			url: `http://127.0.0.1:${port}`,
			headers: {
				'echo-header': 'echo-value'
			},
			callSite: 'request.test.GET'
		}, CancellationToken.None);
		assert.strictEqual(context.res.statusCode, 200);
		assert.strictEqual(context.res.headers['content-type'], 'application/json');
		assert.strictEqual(context.res.headers['echo-header'], 'echo-value');
		const buffer = await streamToBuffer(context.stream);
		const body = JSON.parse(buffer.toString());
		assert.strictEqual(body.method, 'GET');
		assert.strictEqual(body.url, '/');
	});

	test('POST', async () => {
		const context = await request({
			type: 'POST',
			url: `http://127.0.0.1:${port}/postpath`,
			data: 'Some data',
			callSite: 'request.test.POST'
		}, CancellationToken.None);
		assert.strictEqual(context.res.statusCode, 200);
		assert.strictEqual(context.res.headers['content-type'], 'application/json');
		const buffer = await streamToBuffer(context.stream);
		const body = JSON.parse(buffer.toString());
		assert.strictEqual(body.method, 'POST');
		assert.strictEqual(body.url, '/postpath');
		assert.strictEqual(body.data, 'Some data');
	});

	test('timeout', async () => {
		return runWithFakedTimers({}, async () => {
			try {
				await request({
					type: 'GET',
					url: `http://127.0.0.1:${port}/noreply`,
					timeout: 123,
					callSite: 'request.test.timeout'
				}, CancellationToken.None);
				assert.fail('Should fail with timeout');
			} catch (err) {
				assert.strictEqual(err.message, 'Fetch timeout: 123ms');
			}
		});
	});

	test('cancel', async () => {
		return runWithFakedTimers({}, async () => {
			try {
				const source = new CancellationTokenSource();
				const res = request({
					type: 'GET',
					url: `http://127.0.0.1:${port}/noreply`,
					callSite: 'request.test.cancel'
				}, source.token);
				await new Promise(resolve => setTimeout(resolve, 100));
				source.cancel();
				await res;
				assert.fail('Should fail with cancellation');
			} catch (err) {
				assert.strictEqual(err.message, 'Canceled');
			}
		});
	});

	test('follows a 307 redirect by default, replaying the POST body to the target', async () => {
		const context = await request({
			type: 'POST',
			url: `http://127.0.0.1:${port}/redirect`,
			data: 'post-payload',
			callSite: 'request.test.redirect.follow'
		}, CancellationToken.None);
		assert.strictEqual(context.res.statusCode, 200);
		const body = JSON.parse((await streamToBuffer(context.stream)).toString());
		assert.deepStrictEqual(
			{ hits: redirectTargetHits, method: body.method, url: body.url, data: body.data },
			{ hits: 1, method: 'POST', url: '/redirect-target', data: 'post-payload' }
		);
	});

	test('does not follow redirects when followRedirects is 0 (no body replay)', async () => {
		const context = await request({
			type: 'POST',
			url: `http://127.0.0.1:${port}/redirect`,
			data: 'post-payload',
			followRedirects: 0,
			callSite: 'request.test.redirect.manual'
		}, CancellationToken.None);
		assert.deepStrictEqual(
			{ hits: redirectTargetHits, followed: context.res.statusCode === 200 },
			{ hits: 0, followed: false }
		);
	});

	ensureNoDisposablesAreLeakedInTestSuite();
});
