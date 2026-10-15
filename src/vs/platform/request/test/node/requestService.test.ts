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

	// Redirect handling for a mock request that returns a 3xx with a `location`, then a 200. Each
	// hop records the request headers AND the resolved target (protocol/host/port/path) derived
	// from the options the request stack computed, so tests can assert the follow-up request used
	// the URL resolved against the current URL — not the raw `location` header.
	interface ICapturedRedirectRequest {
		headers: IHeaders | undefined;
		protocol: string | undefined;
		hostname: string | undefined;
		port: number | undefined;
		path: string | undefined;
	}
	const redirectingRawRequest = (captured: ICapturedRedirectRequest[], location: string): IRawRequestFunction => {
		return ((opts: any, callback: (res: any) => void) => {
			captured.push({ headers: opts.headers, protocol: opts.protocol, hostname: opts.hostname, port: opts.port, path: opts.path });
			// Choose the response by how many requests have been made so far (via the shared
			// `captured` array) rather than a closure-local counter: the redirect follow re-invokes
			// `getRawRequest` and builds a fresh closure per hop, so a local counter would reset and
			// redirect forever.
			const res = captured.length === 1
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

	test('strips origin credential headers when following a cross-origin redirect', async () => {
		const captured: ICapturedRedirectRequest[] = [];
		await nodeRequest({
			url: 'https://market.example.com/api/asset',
			type: 'GET',
			headers: { Authorization: 'auth-value-1', Cookie: 'sid=abc', 'Proxy-Authorization': 'proxy-value', 'X-Other': 'keep' },
			getRawRequest: () => redirectingRawRequest(captured, 'https://cdn.other.example/asset.vsix'),
			callSite: 'requestService.test.redirectCrossOrigin'
		}, CancellationToken.None);

		assert.strictEqual(captured.length, 2, 'Expected an initial request and one redirect');
		assert.strictEqual(captured[0]?.headers?.['Authorization'], 'auth-value-1', 'Initial request should carry Authorization');
		assert.strictEqual(captured[1]?.protocol, 'https:', 'Redirect must be followed to the resolved target');
		assert.strictEqual(captured[1]?.hostname, 'cdn.other.example', 'Redirect must go to the resolved cross-origin host, not the original host');
		assert.strictEqual(captured[1]?.headers?.['Authorization'], undefined, 'Cross-origin redirect must not forward Authorization');
		assert.strictEqual(captured[1]?.headers?.['Cookie'], undefined, 'Cross-origin redirect must not forward Cookie');
		assert.strictEqual(captured[1]?.headers?.['Proxy-Authorization'], 'proxy-value', 'Proxy-Authorization is bound to the proxy, not the origin, and is preserved');
		assert.strictEqual(captured[1]?.headers?.['X-Other'], 'keep', 'Non-credential headers are preserved across the redirect');
	});

	test('preserves origin credential headers across a same-origin (relative) redirect', async () => {
		const captured: ICapturedRedirectRequest[] = [];
		await nodeRequest({
			url: 'https://market.example.com/api/asset',
			type: 'GET',
			headers: { Authorization: 'auth-value-1', Cookie: 'sid=abc' },
			// Relative location resolves against the current URL → same origin → headers kept. The
			// follow-up must request the RESOLVED absolute URL (host + resolved path), not the raw
			// relative `location` (which the request stack could not fetch on its own).
			getRawRequest: () => redirectingRawRequest(captured, '/api/asset/v2'),
			callSite: 'requestService.test.redirectSameOrigin'
		}, CancellationToken.None);

		assert.strictEqual(captured.length, 2, 'Expected an initial request and one redirect');
		assert.strictEqual(captured[1]?.hostname, 'market.example.com', 'Relative redirect resolves against the current origin');
		assert.strictEqual(captured[1]?.path, '/api/asset/v2', 'Relative redirect resolves the path against the current URL');
		assert.strictEqual(captured[1]?.headers?.['Authorization'], 'auth-value-1', 'Same-origin redirect keeps the Authorization header');
		assert.strictEqual(captured[1]?.headers?.['Cookie'], 'sid=abc', 'Same-origin redirect keeps the Cookie header');
	});

	test('strips origin credentials when a protocol-relative redirect changes origin', async () => {
		const captured: ICapturedRedirectRequest[] = [];
		await nodeRequest({
			// A protocol-relative `//host` location must resolve using the current scheme AND be
			// recognized as cross-origin; a naive raw-header follow would mis-handle host/scheme.
			url: 'https://market.example.com/api/asset',
			type: 'GET',
			headers: { Authorization: 'auth-value-1' },
			getRawRequest: () => redirectingRawRequest(captured, '//cdn.other.example/asset.vsix'),
			callSite: 'requestService.test.redirectProtocolRelative'
		}, CancellationToken.None);

		assert.strictEqual(captured.length, 2, 'Expected an initial request and one redirect');
		assert.strictEqual(captured[1]?.protocol, 'https:', 'Protocol-relative redirect adopts the current scheme');
		assert.strictEqual(captured[1]?.hostname, 'cdn.other.example', 'Protocol-relative redirect resolves to the new host');
		assert.strictEqual(captured[1]?.headers?.['Authorization'], undefined, 'Protocol-relative cross-origin redirect must not forward Authorization');
	});

	test('does not follow a redirect to a non-HTTP(S) scheme', async () => {
		const captured: ICapturedRedirectRequest[] = [];
		const context = await nodeRequest({
			url: 'https://market.example.com/api/asset',
			type: 'GET',
			headers: { Authorization: 'auth-value-1' },
			// A `Location` on a foreign scheme must never be fetched by the HTTP stack; the 3xx is
			// surfaced as the final response instead.
			getRawRequest: () => redirectingRawRequest(captured, 'file:///etc/passwd'),
			callSite: 'requestService.test.redirectNonHttp'
		}, CancellationToken.None);

		assert.strictEqual(captured.length, 1, 'A non-HTTP(S) redirect target must not be followed');
		assert.strictEqual(context.res.statusCode, 302, 'The 3xx response is surfaced as the final response');
	});
});
