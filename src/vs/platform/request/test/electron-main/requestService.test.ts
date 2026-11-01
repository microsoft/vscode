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
	let captured: { path: string | undefined; method: string | undefined; body: string; authorization: string | undefined; cookie: string | undefined; headers: http.IncomingHttpHeaders }[];

	setup(async () => {
		const http = await import('http');
		servers = [];
		captured = [];
		const listen = async () => {
			const server = http.createServer((req, res) => {
				const chunks: Buffer[] = [];
				req.on('data', chunk => chunks.push(chunk));
				req.on('end', () => {
					captured.push({ path: req.url, method: req.method, body: Buffer.concat(chunks).toString(), authorization: req.headers.authorization, cookie: req.headers.cookie, headers: req.headers });
					const chain = /^\/chain\/(?<remaining>\d+)$/.exec(req.url ?? '');
					if (chain) {
						const remaining = Number(chain.groups?.remaining);
						if (remaining > 0) {
							res.writeHead(302, { location: `/chain/${remaining - 1}` });
						}
						res.end('ok');
						return;
					}
					let location: string;
					let statusCode = 302;
					switch (req.url) {
						case '/same':
							location = '/final';
							break;
						case '/post/301':
						case '/post/302':
						case '/post/303':
						case '/post/307':
						case '/post/308':
							location = '/final';
							statusCode = Number(req.url.slice('/post/'.length));
							break;
						case '/double-slash':
							location = `${origin}//bucket/asset%2Fsegment?sig=a%2Fb&empty=`;
							break;
						case '/cross':
							location = `${otherOrigin}/final`;
							break;
						case '/url-basic':
							if (!req.headers.authorization) {
								res.writeHead(401, { 'WWW-Authenticate': 'Basic realm="redirect-fixture"' });
								res.end();
								return;
							}
							location = `${otherOrigin}/final`;
							break;
						case '/host-cross':
							location = `${otherOrigin.replace('127.0.0.1', 'localhost')}/final`;
							break;
						case '/out-and-back':
							location = `${otherOrigin}/back`;
							break;
						case '/host-out-and-back':
							location = `${otherOrigin.replace('127.0.0.1', 'localhost')}/back`;
							break;
						case '/back':
							location = `${origin}/final`;
							break;
						case '/cross-loop':
							location = `${otherOrigin}/loop`;
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
					res.writeHead(statusCode, { location });
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

	function requestWithRedirectModes(path: string, options: Partial<IRequestOptions> = {}, cancelOnRedirect = false): Promise<{ statusCode: number; body: string; redirectModes: string[] }> {
		return ipcRenderer.invoke('vscode:test-platform-request', {
			url: `${origin}${path}`,
			headers,
			callSite: 'requestService.test.electronRedirects',
			...options
		}, cancelOnRedirect);
	}

	async function request(path: string, options: Partial<IRequestOptions> = {}, cancelOnRedirect = false): Promise<{ statusCode: number; body: string }> {
		const { statusCode, body } = await requestWithRedirectModes(path, options, cancelOnRedirect);
		return { statusCode, body };
	}

	for (const { path, expected } of [
		{ path: '/same', expected: [credentials, credentials] },
		{ path: '/cross', expected: [credentials, noCredentials] },
		{ path: '/host-cross', expected: [credentials, noCredentials] },
		{ path: '/out-and-back', expected: [credentials, noCredentials, noCredentials] },
		{ path: '/host-out-and-back', expected: [credentials, noCredentials, noCredentials] }
	]) {
		test(`handles ${path} with the real net.request transport`, async () => {
			const response = await requestWithRedirectModes(path);
			assert.deepStrictEqual({
				response,
				credentials: captured.map(({ authorization, cookie }) => ({ authorization, cookie }))
			}, {
				response: { statusCode: 200, body: 'ok', redirectModes: expected.map(() => 'manual') },
				credentials: expected
			});
		});
	}

	for (const { name, credentialHeaders, expected } of [
		{ name: 'credential-free requests', credentialHeaders: {}, expected: noCredentials },
		{ name: 'Authorization and Cookie', credentialHeaders: headers, expected: credentials },
		{ name: 'mixed-case Authorization', credentialHeaders: { aUtHoRiZaTiOn: headers.Authorization }, expected: { authorization: headers.Authorization, cookie: undefined } },
		{ name: 'mixed-case Cookie', credentialHeaders: { cOoKiE: headers.Cookie }, expected: { authorization: undefined, cookie: headers.Cookie } }
	]) {
		const credentialBearing = Object.keys(credentialHeaders).length > 0;
		for (const redirects of [5, 20]) {
			test(`follows ${redirects} redirects for ${name} by default`, async () => {
				const response = await requestWithRedirectModes(`/chain/${redirects}`, { headers: credentialHeaders });
				assert.deepStrictEqual({
					response,
					requests: captured.length,
					credentials: captured.map(({ authorization, cookie }) => ({ authorization, cookie }))
				}, {
					response: { statusCode: 200, body: 'ok', redirectModes: Array(credentialBearing ? redirects + 1 : 1).fill(credentialBearing ? 'manual' : 'follow') },
					requests: redirects + 1,
					credentials: Array(redirects + 1).fill(expected)
				});
			});
		}
	}

	for (const followRedirects of [0, 1, 3, 20]) {
		for (const credentialBearing of [false, true]) {
			test(`honors an explicit redirect limit of ${followRedirects} ${credentialBearing ? 'with' : 'without'} credentials`, async () => {
				const response = await requestWithRedirectModes('/loop', { followRedirects, headers: credentialBearing ? headers : {} });
				assert.deepStrictEqual({ response, requests: captured.length }, {
					response: { statusCode: 302, body: '', redirectModes: Array(followRedirects + 1).fill('manual') },
					requests: followRedirects + 1
				});
			});
		}
	}

	test('stops credential-free automatic requests at Chromium\'s twenty-redirect limit', async () => {
		await assert.rejects(request('/loop', { headers: {} }), /ERR_TOO_MANY_REDIRECTS/);
		assert.strictEqual(captured.length, 21);
	});

	test('keeps the manual twenty-redirect budget after stripping credentials', async () => {
		const response = await requestWithRedirectModes('/cross-loop', { headers: { aUtHoRiZaTiOn: headers.Authorization, cOoKiE: headers.Cookie } });
		assert.deepStrictEqual({
			response,
			credentials: captured.map(({ authorization, cookie }) => ({ authorization, cookie }))
		}, {
			response: { statusCode: 302, body: '', redirectModes: Array(21).fill('manual') },
			credentials: [credentials, ...Array(20).fill(noCredentials)]
		});
	});

	for (const { name, options } of [
		{ name: 'username and password', options: { user: 'user', password: 'password' } },
		{ name: 'empty password', options: { user: 'user', password: '' } },
		{ name: 'password only', options: { password: 'password' } }
	]) {
		test(`uses manual redirects for explicit basic credentials with ${name}`, async () => {
			const response = await requestWithRedirectModes('/cross', { ...options, headers: {} });
			assert.deepStrictEqual(response, { statusCode: 200, body: 'ok', redirectModes: ['manual', 'manual'] });
		});
	}

	test('uses manual redirects for URL credentials accepted by Electron', async () => {
		const url = new URL(`${origin}/url-basic`);
		url.username = 'fixture-user';
		url.password = 'fixture-password';
		const response = await requestWithRedirectModes('/url-basic', { url: url.toString(), headers: {} });
		assert.deepStrictEqual({
			response,
			authorization: captured.map(request => request.authorization)
		}, {
			response: { statusCode: 200, body: 'ok', redirectModes: ['manual', 'manual'] },
			authorization: [undefined, `Basic ${Buffer.from('fixture-user:fixture-password').toString('base64')}`, undefined]
		});
	});

	for (const credentialBearing of [false, true]) {
		test(`preserves double-slash redirect paths and signed queries ${credentialBearing ? 'with' : 'without'} credentials`, async () => {
			const response = await requestWithRedirectModes('/double-slash', { headers: credentialBearing ? headers : {} });
			assert.deepStrictEqual({ response, paths: captured.map(request => request.path) }, {
				response: { statusCode: 200, body: 'ok', redirectModes: credentialBearing ? ['manual', 'manual'] : ['follow'] },
				paths: ['/double-slash', '//bucket/asset%2Fsegment?sig=a%2Fb&empty=']
			});
		});
	}

	for (const statusCode of [301, 302, 303, 307, 308]) {
		for (const mode of ['automatic', 'credential-bearing', 'explicit']) {
			test(`preserves Chromium method, body and header handling for ${statusCode} in ${mode} mode`, async () => {
				const requestHeaders = Object.freeze({
					'cOnTeNt-TyPe': 'application/octet-stream',
					'CoNtEnT-eNcOdInG': 'gzip',
					'cOnTeNt-LaNgUaGe': 'en',
					'CoNtEnT-LoCaTiOn': '/body',
					oRiGiN: origin,
					'X-Other': 'keep',
					...(mode === 'credential-bearing' ? headers : {})
				});
				const normalizedHeaders = Object.fromEntries(Object.entries(requestHeaders).map(([name, value]) => [name.toLowerCase(), value]));
				const changesMethod = statusCode < 307;
				const response = await requestWithRedirectModes(`/post/${statusCode}`, { type: 'POST', data: 'request body', headers: requestHeaders, followRedirects: mode === 'explicit' ? 3 : undefined });
				assert.deepStrictEqual({
					response,
					requests: captured.map(({ method, body, headers }) => ({
						method,
						body,
						headers: Object.fromEntries(Object.entries(headers).filter(([name]) => Object.hasOwn(normalizedHeaders, name)))
					}))
				}, {
					response: { statusCode: 200, body: 'ok', redirectModes: mode === 'automatic' ? ['follow'] : ['manual', 'manual'] },
					requests: [
						{ method: 'POST', body: 'request body', headers: normalizedHeaders },
						{ method: changesMethod ? 'GET' : 'POST', body: changesMethod ? '' : 'request body', headers: changesMethod ? { 'x-other': 'keep', ...(mode === 'credential-bearing' ? credentials : {}) } : normalizedHeaders }
					]
				});
			});
		}
	}

	for (const options of [{}, { headers: {} }, { headers: {}, followRedirects: 3 }]) {
		test(`cancels while following a redirect ${JSON.stringify(options)}`, async () => {
			await assert.rejects(request('/cancel', options, true), /Canceled/);
		});
	}

	ensureNoDisposablesAreLeakedInTestSuite();
});
