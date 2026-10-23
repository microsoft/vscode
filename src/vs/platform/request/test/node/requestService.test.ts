/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import type * as http from 'http';
import { streamToBuffer } from '../../../../base/common/buffer.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { NullLogService } from '../../../log/common/log.js';
import { IRawRequestFunction, lookupKerberosAuthorization, NodeRequestOptions, nodeRequest } from '../../node/requestService.js';
import { isWindows } from '../../../../base/common/platform.js';
import { CancellationToken, CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { CancellationError } from '../../../../base/common/errors.js';

suite('Request Service', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	// Kerberos module fails to load on local macOS and Linux CI.
	(isWindows ? test : test.skip)('Kerberos lookup', async () => {
		try {
			const logService = store.add(new NullLogService());
			const response = await lookupKerberosAuthorization('http://localhost:9999', undefined, logService, 'requestService.test.ts');
			assert.ok(response);
		} catch (err) {
			assert.ok(
				err?.message?.includes('No authority could be contacted for authentication')
				|| err?.message?.includes('No Kerberos credentials available')
				|| err?.message?.includes('No credentials are available in the security package')
				|| err?.message?.includes('no credential for')
				, `Unexpected error: ${err}`);
		}
	});

	test('Request cancellation during retry backoff', async () => {
		const cts = store.add(new CancellationTokenSource());
		let attemptCount = 0;
		const mockRawRequest = (_opts: any, _callback: Function) => {
			attemptCount++;
			const mockReq: unknown = {
				on: (event: string, handler: Function) => {
					if (event === 'error') {
						const err = new Error('Connection refused') as NodeJS.ErrnoException;
						err.code = 'ECONNREFUSED';
						// Fail the first attempt with a transient error, then cancel while the
						// retry backoff is pending so cancellation is observed during the backoff.
						setTimeout(() => {
							handler(err);
							cts.cancel();
						}, 0);
					}
				},
				end: () => { },
				abort: () => { },
				setTimeout: () => { }
			};
			return mockReq;
		};

		try {
			await nodeRequest({
				url: 'http://example.com',
				type: 'GET',
				getRawRequest: () => mockRawRequest as IRawRequestFunction,
				callSite: 'requestService.test.cancellation'
			}, cts.token);
			assert.fail('Request should have been cancelled');
		} catch (err) {
			assert.ok(err instanceof CancellationError, 'Error should be a CancellationError');
		}

		assert.strictEqual(attemptCount, 1, 'Request should be cancelled during backoff without further retries');
	});

	test('should retry GET requests on transient errors', async () => {
		let attemptCount = 0;
		const mockRawRequest = (_opts: any, callback: Function) => {
			attemptCount++;
			const currentAttempt = attemptCount;
			const mockReq: any = {
				on: (event: string, handler: Function) => {
					if (event === 'error' && currentAttempt < 3) {
						const err = new Error('Connection refused') as NodeJS.ErrnoException;
						err.code = 'ECONNREFUSED';
						setTimeout(() => handler(err), 0);
					}
				},
				end: () => {
					if (currentAttempt >= 3) {
						// Succeed on third attempt by calling the response callback
						setTimeout(() => callback({ statusCode: 200, headers: {}, on: () => { }, pipe: () => ({ on: () => { } }) }), 0);
					}
				},
				abort: () => { },
				setTimeout: () => { }
			};
			return mockReq;
		};

		try {
			await nodeRequest({
				url: 'http://example.com',
				type: 'GET',
				getRawRequest: () => mockRawRequest as IRawRequestFunction,
				callSite: 'requestService.test.retryGET'
			}, CancellationToken.None);
		} catch (err) {
			// Expected to eventually succeed or fail after retries
		}

		assert.ok(attemptCount > 1, 'GET request should have been retried');
	});

	test('should NOT retry POST requests', async () => {
		let attemptCount = 0;
		const mockRawRequest = () => {
			attemptCount++;
			const mockReq: any = {
				on: (event: string, handler: Function) => {
					if (event === 'error') {
						const err = new Error('Connection refused') as NodeJS.ErrnoException;
						err.code = 'ECONNREFUSED';
						setTimeout(() => handler(err), 0);
					}
				},
				end: () => { },
				abort: () => { },
				setTimeout: () => { }
			};
			return mockReq;
		};

		try {
			await nodeRequest({
				url: 'http://example.com',
				type: 'POST',
				getRawRequest: () => mockRawRequest,
				callSite: 'requestService.test.noRetryPOST'
			}, CancellationToken.None);
			assert.fail('Should have thrown an error');
		} catch (err) {
			assert.ok(err instanceof Error);
		}

		assert.strictEqual(attemptCount, 1, 'POST request should not have been retried');
	});

	test('should retry HEAD requests on transient errors', async () => {
		let attemptCount = 0;
		const mockRawRequest = (_opts: any, callback: Function) => {
			attemptCount++;
			const currentAttempt = attemptCount;
			const mockReq: any = {
				on: (event: string, handler: Function) => {
					if (event === 'error' && currentAttempt < 3) {
						const err = new Error('Host unreachable') as NodeJS.ErrnoException;
						err.code = 'EHOSTUNREACH';
						setTimeout(() => handler(err), 0);
					}
				},
				end: () => {
					if (currentAttempt >= 3) {
						setTimeout(() => callback({ statusCode: 200, headers: {}, on: () => { }, pipe: () => ({ on: () => { } }) }), 0);
					}
				},
				abort: () => { },
				setTimeout: () => { }
			};
			return mockReq;
		};

		try {
			await nodeRequest({
				url: 'http://example.com',
				type: 'HEAD',
				getRawRequest: () => mockRawRequest as IRawRequestFunction,
				callSite: 'requestService.test.retryHEAD'
			}, CancellationToken.None);
		} catch (err) {
			// Expected to eventually succeed or fail after retries
		}

		assert.ok(attemptCount > 1, 'HEAD request should have been retried');
	});

	test('should retry OPTIONS requests on transient errors', async () => {
		let attemptCount = 0;
		const mockRawRequest = (_opts: any, callback: Function) => {
			attemptCount++;
			const currentAttempt = attemptCount;
			const mockReq: any = {
				on: (event: string, handler: Function) => {
					if (event === 'error' && currentAttempt < 3) {
						const err = new Error('Network unreachable') as NodeJS.ErrnoException;
						err.code = 'ENETUNREACH';
						setTimeout(() => handler(err), 0);
					}
				},
				end: () => {
					if (currentAttempt >= 3) {
						setTimeout(() => callback({ statusCode: 200, headers: {}, on: () => { }, pipe: () => ({ on: () => { } }) }), 0);
					}
				},
				abort: () => { },
				setTimeout: () => { }
			};
			return mockReq;
		};

		try {
			await nodeRequest({
				url: 'http://example.com',
				type: 'OPTIONS',
				getRawRequest: () => mockRawRequest as IRawRequestFunction,
				callSite: 'requestService.test.retryOPTIONS'
			}, CancellationToken.None);
		} catch (err) {
			// Expected to eventually succeed or fail after retries
		}

		assert.ok(attemptCount > 1, 'OPTIONS request should have been retried');
	});

	test('should NOT retry DELETE requests', async () => {
		let attemptCount = 0;
		const mockRawRequest = () => {
			attemptCount++;
			const mockReq: any = {
				on: (event: string, handler: Function) => {
					if (event === 'error') {
						const err = new Error('Connection refused') as NodeJS.ErrnoException;
						err.code = 'ECONNREFUSED';
						setTimeout(() => handler(err), 0);
					}
				},
				end: () => { },
				abort: () => { },
				setTimeout: () => { }
			};
			return mockReq;
		};

		try {
			await nodeRequest({
				url: 'http://example.com',
				type: 'DELETE',
				getRawRequest: () => mockRawRequest,
				callSite: 'requestService.test.noRetryDELETE'
			}, CancellationToken.None);
			assert.fail('Should have thrown an error');
		} catch (err) {
			assert.ok(err instanceof Error);
		}

		assert.strictEqual(attemptCount, 1, 'DELETE request should not have been retried');
	});

	test('should NOT retry PUT requests', async () => {
		let attemptCount = 0;
		const mockRawRequest = () => {
			attemptCount++;
			const mockReq: any = {
				on: (event: string, handler: Function) => {
					if (event === 'error') {
						const err = new Error('Connection refused') as NodeJS.ErrnoException;
						err.code = 'ECONNREFUSED';
						setTimeout(() => handler(err), 0);
					}
				},
				end: () => { },
				abort: () => { },
				setTimeout: () => { }
			};
			return mockReq;
		};

		try {
			await nodeRequest({
				url: 'http://example.com',
				type: 'PUT',
				getRawRequest: () => mockRawRequest,
				callSite: 'requestService.test.noRetryPUT'
			}, CancellationToken.None);
			assert.fail('Should have thrown an error');
		} catch (err) {
			assert.ok(err instanceof Error);
		}

		assert.strictEqual(attemptCount, 1, 'PUT request should not have been retried');
	});

	test('should NOT retry PATCH requests', async () => {
		let attemptCount = 0;
		const mockRawRequest = () => {
			attemptCount++;
			const mockReq: any = {
				on: (event: string, handler: Function) => {
					if (event === 'error') {
						const err = new Error('Connection refused') as NodeJS.ErrnoException;
						err.code = 'ECONNREFUSED';
						setTimeout(() => handler(err), 0);
					}
				},
				end: () => { },
				abort: () => { },
				setTimeout: () => { }
			};
			return mockReq;
		};

		try {
			await nodeRequest({
				url: 'http://example.com',
				type: 'PATCH',
				getRawRequest: () => mockRawRequest,
				callSite: 'requestService.test.noRetryPATCH'
			}, CancellationToken.None);
			assert.fail('Should have thrown an error');
		} catch (err) {
			assert.ok(err instanceof Error);
		}

		assert.strictEqual(attemptCount, 1, 'PATCH request should not have been retried');
	});

	suite('redirects', () => {
		const headers = Object.freeze({
			Authorization: 'Bearer token',
			aUtHoRiZaTiOn: 'Basic other-token',
			cOoKiE: 'session=secret',
			CoOkIe2: 'session=other-secret',
			'Proxy-Authorization': 'Basic proxy-token',
			'X-Other': 'keep'
		});
		const strippedHeaders = { 'Proxy-Authorization': 'Basic proxy-token', 'X-Other': 'keep' };

		async function requestRedirects(locations: readonly string[], options: Partial<NodeRequestOptions> = {}) {
			const http = await import('http');
			const captured: http.RequestOptions[] = [];
			const received: http.IncomingHttpHeaders[] = [];
			const server = http.createServer((req, res) => {
				const location = locations[received.length];
				received.push(req.headers);
				if (location) {
					res.writeHead(302, { location });
				}
				res.end();
			});
			await new Promise<void>((resolve, reject) => server.once('error', reject).listen(0, '127.0.0.1', resolve));
			const address = server.address();
			assert.ok(address && typeof address !== 'string');
			const rawRequest: IRawRequestFunction = (opts, callback) => {
				captured.push(opts);
				// Keep the logical destination for assertions, but send every hop to the test server.
				return http.request({ ...opts, protocol: 'http:', hostname: '127.0.0.1', port: address.port }, callback);
			};
			try {
				const context = await nodeRequest({
					url: 'https://market.example/api/asset',
					headers,
					user: 'user',
					password: 'password',
					getRawRequest: () => rawRequest,
					callSite: 'requestService.test.redirects',
					...options
				}, CancellationToken.None);
				await streamToBuffer(context.stream);
				return { captured, received, context };
			} finally {
				server.closeAllConnections();
				await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
			}
		}

		for (const { name, from, location, target, crossOrigin } of [
			{ name: 'host change', from: 'https://market.example/api/asset', location: 'https://cdn.example/asset', target: 'https://cdn.example:443/asset', crossOrigin: true },
			{ name: 'scheme change', from: 'http://market.example/api/asset', location: 'https://market.example/asset', target: 'https://market.example:443/asset', crossOrigin: true },
			{ name: 'scheme downgrade', from: 'https://market.example/api/asset', location: 'http://market.example/asset', target: 'http://market.example:80/asset', crossOrigin: true },
			{ name: 'port change', from: 'https://market.example/api/asset', location: 'https://market.example:8443/asset', target: 'https://market.example:8443/asset', crossOrigin: true },
			{ name: 'protocol-relative host change', from: 'https://market.example/api/asset', location: '//cdn.example/asset', target: 'https://cdn.example:443/asset', crossOrigin: true },
			{ name: 'root-relative path', from: 'https://market.example/api/asset', location: '/asset', target: 'https://market.example:443/asset', crossOrigin: false },
			{ name: 'relative path', from: 'https://market.example/api/asset', location: '../asset?version=2', target: 'https://market.example:443/asset?version=2', crossOrigin: false },
			{ name: 'protocol-relative same origin', from: 'https://market.example/api/asset', location: '//market.example/asset', target: 'https://market.example:443/asset', crossOrigin: false },
			{ name: 'explicit HTTPS default port and host case', from: 'https://market.example/api/asset', location: 'https://MARKET.example:443/asset', target: 'https://market.example:443/asset', crossOrigin: false },
			{ name: 'implicit HTTPS default port', from: 'https://market.example:443/api/asset', location: 'https://market.example/asset', target: 'https://market.example:443/asset', crossOrigin: false },
			{ name: 'explicit HTTP default port', from: 'http://market.example/api/asset', location: 'http://market.example:80/asset', target: 'http://market.example:80/asset', crossOrigin: false }
		]) {
			test(name, async () => {
				const { captured } = await requestRedirects([location], { url: from });
				assert.deepStrictEqual({
					credentials: captured.map(request => ({ headers: request.headers, auth: request.auth })),
					target: captured.slice(1).map(request => `${request.protocol}//${request.hostname}:${request.port}${request.path}`)
				}, {
					credentials: [
						{ headers, auth: 'user:password' },
						{ headers: crossOrigin ? strippedHeaders : headers, auth: crossOrigin ? undefined : 'user:password' }
					],
					target: [target]
				});
			});
		}

		test('does not restore credentials when a redirect returns to the original origin', async () => {
			const { captured } = await requestRedirects(['https://cdn.example/asset', 'https://market.example/asset', '/final']);
			assert.deepStrictEqual(captured.map(request => ({ headers: request.headers, auth: request.auth })), [
				{ headers, auth: 'user:password' },
				{ headers: strippedHeaders, auth: undefined },
				{ headers: strippedHeaders, auth: undefined },
				{ headers: strippedHeaders, auth: undefined }
			]);
		});

		for (const location of ['/asset', 'https://cdn.example/asset']) {
			test(`handles explicit basic credentials for ${location}`, async () => {
				const basic = `Basic ${Buffer.from('user:password').toString('base64')}`;
				const { received } = await requestRedirects([location], { headers: undefined });
				assert.deepStrictEqual(received.map(request => request.authorization), [basic, location === '/asset' ? basic : undefined]);
			});
		}

		for (const location of ['file:///private/asset', 'data:text/plain,asset', 'ftp://market.example/asset', 'http://[invalid']) {
			test(`does not follow ${location}`, async () => {
				const { captured, context } = await requestRedirects([location]);
				assert.deepStrictEqual({ requests: captured.length, statusCode: context.res.statusCode }, { requests: 1, statusCode: 302 });
			});
		}

		for (const followRedirects of [undefined, 0, 1, 3]) {
			test(`respects a redirect limit of ${followRedirects ?? 'default'}`, async () => {
				const { captured, context } = await requestRedirects(['/1', '/2', '/3', '/4'], { followRedirects });
				assert.deepStrictEqual({ requests: captured.length, statusCode: context.res.statusCode }, { requests: (followRedirects ?? 3) + 1, statusCode: 302 });
			});
		}

		test('cancels while following a redirect', async () => {
			const http = await import('http');
			const source = store.add(new CancellationTokenSource());
			const requested: string[] = [];
			const server = http.createServer((req, res) => {
				requested.push(req.url!);
				if (req.url === '/pending') {
					source.cancel();
				} else {
					res.writeHead(302, { location: '/pending' });
					res.end();
				}
			});
			await new Promise<void>((resolve, reject) => server.once('error', reject).listen(0, '127.0.0.1', resolve));
			const address = server.address();
			assert.ok(address && typeof address !== 'string');
			try {
				await assert.rejects(nodeRequest({
					url: `http://127.0.0.1:${address.port}/start`,
					callSite: 'requestService.test.cancelRedirect'
				}, source.token), CancellationError);
				assert.deepStrictEqual(requested, ['/start', '/pending']);
			} finally {
				server.closeAllConnections();
				await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
			}
		});
	});
});
