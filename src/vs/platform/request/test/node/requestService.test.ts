/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { NullLogService } from '../../../log/common/log.js';
import { IRawRequestFunction, lookupKerberosAuthorization, nodeRequest } from '../../node/requestService.js';
import { isWindows } from '../../../../base/common/platform.js';
import { CancellationToken, CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { CancellationError } from '../../../../base/common/errors.js';
import { IHeaders } from '../../../../base/parts/request/common/request.js';

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

	// Redirect handling for a mock request that returns a 3xx with a `location`, then a 200.
	const redirectingRawRequest = (capturedHeaders: (IHeaders | undefined)[], location: string): IRawRequestFunction => {
		return ((opts: any, callback: (res: any) => void) => {
			capturedHeaders.push(opts.headers);
			// Choose the response by how many requests have been made so far (via the shared
			// `capturedHeaders` array) rather than a closure-local counter: the redirect follow
			// re-invokes `getRawRequest` and builds a fresh closure per hop, so a local counter
			// would reset and redirect forever.
			const res = capturedHeaders.length === 1
				? { statusCode: 302, headers: { location }, on: () => { }, pipe: () => ({ on: () => { } }) }
				: { statusCode: 200, headers: {}, on: () => { }, pipe: () => ({ on: () => { } }) };
			const mockReq: any = {
				on: () => { },
				end: () => { setTimeout(() => callback(res), 0); },
				abort: () => { },
				setTimeout: () => { }
			};
			return mockReq;
		}) as unknown as IRawRequestFunction;
	};

	test('strips the Authorization header when following a cross-origin redirect', async () => {
		const capturedHeaders: (IHeaders | undefined)[] = [];
		await nodeRequest({
			url: 'https://market.example.com/api/asset',
			type: 'GET',
			headers: { Authorization: 'Bearer secret-token', 'Proxy-Authorization': 'proxy-secret', 'X-Other': 'keep' },
			getRawRequest: () => redirectingRawRequest(capturedHeaders, 'https://cdn.other.example/asset.vsix'),
			callSite: 'requestService.test.redirectCrossOrigin'
		}, CancellationToken.None);

		assert.strictEqual(capturedHeaders.length, 2, 'Expected an initial request and one redirect');
		assert.strictEqual(capturedHeaders[0]?.['Authorization'], 'Bearer secret-token', 'Initial request should carry Authorization');
		assert.strictEqual(capturedHeaders[1]?.['Authorization'], undefined, 'Cross-origin redirect must not forward Authorization');
		assert.strictEqual(capturedHeaders[1]?.['Proxy-Authorization'], 'proxy-secret', 'Proxy-Authorization is bound to the proxy, not the origin, and is preserved');
		assert.strictEqual(capturedHeaders[1]?.['X-Other'], 'keep', 'Non-credential headers are preserved across the redirect');
	});

	test('preserves the Authorization header across a same-origin (relative) redirect', async () => {
		const capturedHeaders: (IHeaders | undefined)[] = [];
		await nodeRequest({
			url: 'https://market.example.com/api/asset',
			type: 'GET',
			headers: { Authorization: 'Bearer secret-token' },
			// Relative location resolves against the current URL → same origin → header kept.
			getRawRequest: () => redirectingRawRequest(capturedHeaders, '/api/asset/v2'),
			callSite: 'requestService.test.redirectSameOrigin'
		}, CancellationToken.None);

		assert.strictEqual(capturedHeaders.length, 2, 'Expected an initial request and one redirect');
		assert.strictEqual(capturedHeaders[1]?.['Authorization'], 'Bearer secret-token', 'Same-origin redirect keeps the Authorization header');
	});
});
