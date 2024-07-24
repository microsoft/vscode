/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// eslint-disable-next-line local/code-import-patterns
import * as http from 'http';
// eslint-disable-next-line local/code-import-patterns
import { AddressInfo } from 'net';
import assert from 'assert';
import { CancellationToken, CancellationTokenSource } from 'vs/base/common/cancellation';
import { ensureNoDisposablesAreLeakedInTestSuite } from 'vs/base/test/common/utils';
import { request } from 'vs/base/parts/request/browser/request';
import { streamToBuffer } from 'vs/base/common/buffer';


suite('Request', () => {

	let port: number;
	let server: http.Server;

	setup(async () => {
		port = await new Promise<number>((resolvePort, rejectPort) => {
			server = http.createServer((req, res) => {
				if (req.url === '/noreply') {
					return; // never respond
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
			server.close(err => err ? reject(err) : resolve());
		});
	});

	test('GET', async () => {
		const context = await request({
			url: `http://127.0.0.1:${port}`,
			headers: {
				'echo-header': 'echo-value'
			}
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
		try {
			await request({
				type: 'GET',
				url: `http://127.0.0.1:${port}/noreply`,
				timeout: 123,
			}, CancellationToken.None);
			assert.fail('Should fail with timeout');
		} catch (err) {
			assert.strictEqual(err.message, 'Fetch timeout: 123ms');
		}
	});

	test('cancel', async () => {
		try {
			const source = new CancellationTokenSource();
			const res = request({
				type: 'GET',
				url: `http://127.0.0.1:${port}/noreply`,
			}, source.token);
			await new Promise(resolve => setTimeout(resolve, 100));
			source.cancel();
			await res;
			assert.fail('Should fail with cancellation');
		} catch (err) {
			assert.strictEqual(err.message, 'Canceled');
		}
	});

	ensureNoDisposablesAreLeakedInTestSuite();
});
