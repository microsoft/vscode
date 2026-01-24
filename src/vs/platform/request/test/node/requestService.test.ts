/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { NullLogService } from '../../../log/common/log.js';
import { lookupKerberosAuthorization, nodeRequest } from '../../node/requestService.js';
import { isWindows } from '../../../../base/common/platform.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import type * as http from 'http';


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

	suite('Retry Logic', () => {
		test('should retry GET requests on transient errors', async () => {
			let attemptCount = 0;
			const mockRawRequest = () => {
				attemptCount++;
				const mockReq: any = {
					on: (event: string, handler: Function) => {
						if (event === 'error' && attemptCount < 3) {
							setTimeout(() => handler(new Error('ECONNRESET')), 0);
						}
					},
					end: () => { },
					abort: () => { },
					setTimeout: () => { }
				};
				if (attemptCount >= 3) {
					// Succeed on third attempt
					setTimeout(() => mockReq.on('response', () => { }), 0);
				}
				return mockReq;
			};

			try {
				await nodeRequest({
					url: 'http://example.com',
					type: 'GET',
					getRawRequest: mockRawRequest as any
				}, CancellationToken.None);
			} catch (err) {
				// Expected to eventually succeed or fail after retries
			}

			assert.ok(attemptCount > 1, 'GET request should have been retried');
		});

		test('should NOT retry POST requests by default on transient errors', async () => {
			let attemptCount = 0;
			const mockRawRequest = () => {
				attemptCount++;
				const mockReq: any = {
					on: (event: string, handler: Function) => {
						if (event === 'error') {
							setTimeout(() => handler(new Error('ECONNRESET')), 0);
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
					getRawRequest: mockRawRequest as any
				}, CancellationToken.None);
				assert.fail('Should have thrown an error');
			} catch (err) {
				assert.ok(err instanceof Error);
			}

			assert.strictEqual(attemptCount, 1, 'POST request should not have been retried');
		});

		test('should retry POST requests when retryNonIdempotent is true', async () => {
			let attemptCount = 0;
			const mockRawRequest = () => {
				attemptCount++;
				const mockReq: any = {
					on: (event: string, handler: Function) => {
						if (event === 'error' && attemptCount < 3) {
							setTimeout(() => handler(new Error('ECONNRESET')), 0);
						}
					},
					end: () => { },
					abort: () => { },
					setTimeout: () => { }
				};
				if (attemptCount >= 3) {
					setTimeout(() => mockReq.on('response', () => { }), 0);
				}
				return mockReq;
			};

			try {
				await nodeRequest({
					url: 'http://example.com',
					type: 'POST',
					retryNonIdempotent: true,
					getRawRequest: mockRawRequest as any
				}, CancellationToken.None);
			} catch (err) {
				// Expected to eventually succeed or fail after retries
			}

			assert.ok(attemptCount > 1, 'POST request with retryNonIdempotent should have been retried');
		});

		test('should retry HEAD requests on transient errors', async () => {
			let attemptCount = 0;
			const mockRawRequest = () => {
				attemptCount++;
				const mockReq: any = {
					on: (event: string, handler: Function) => {
						if (event === 'error' && attemptCount < 3) {
							setTimeout(() => handler(new Error('ETIMEDOUT')), 0);
						}
					},
					end: () => { },
					abort: () => { },
					setTimeout: () => { }
				};
				if (attemptCount >= 3) {
					setTimeout(() => mockReq.on('response', () => { }), 0);
				}
				return mockReq;
			};

			try {
				await nodeRequest({
					url: 'http://example.com',
					type: 'HEAD',
					getRawRequest: mockRawRequest as any
				}, CancellationToken.None);
			} catch (err) {
				// Expected to eventually succeed or fail after retries
			}

			assert.ok(attemptCount > 1, 'HEAD request should have been retried');
		});

		test('should retry OPTIONS requests on transient errors', async () => {
			let attemptCount = 0;
			const mockRawRequest = () => {
				attemptCount++;
				const mockReq: any = {
					on: (event: string, handler: Function) => {
						if (event === 'error' && attemptCount < 3) {
							setTimeout(() => handler(new Error('ENETUNREACH')), 0);
						}
					},
					end: () => { },
					abort: () => { },
					setTimeout: () => { }
				};
				if (attemptCount >= 3) {
					setTimeout(() => mockReq.on('response', () => { }), 0);
				}
				return mockReq;
			};

			try {
				await nodeRequest({
					url: 'http://example.com',
					type: 'OPTIONS',
					getRawRequest: mockRawRequest as any
				}, CancellationToken.None);
			} catch (err) {
				// Expected to eventually succeed or fail after retries
			}

			assert.ok(attemptCount > 1, 'OPTIONS request should have been retried');
		});

		test('should NOT retry DELETE requests by default', async () => {
			let attemptCount = 0;
			const mockRawRequest = () => {
				attemptCount++;
				const mockReq: any = {
					on: (event: string, handler: Function) => {
						if (event === 'error') {
							setTimeout(() => handler(new Error('ECONNRESET')), 0);
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
					getRawRequest: mockRawRequest as any
				}, CancellationToken.None);
				assert.fail('Should have thrown an error');
			} catch (err) {
				assert.ok(err instanceof Error);
			}

			assert.strictEqual(attemptCount, 1, 'DELETE request should not have been retried');
		});

		test('should NOT retry PUT requests by default', async () => {
			let attemptCount = 0;
			const mockRawRequest = () => {
				attemptCount++;
				const mockReq: any = {
					on: (event: string, handler: Function) => {
						if (event === 'error') {
							setTimeout(() => handler(new Error('ECONNRESET')), 0);
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
					getRawRequest: mockRawRequest as any
				}, CancellationToken.None);
				assert.fail('Should have thrown an error');
			} catch (err) {
				assert.ok(err instanceof Error);
			}

			assert.strictEqual(attemptCount, 1, 'PUT request should not have been retried');
		});

		test('should NOT retry PATCH requests by default', async () => {
			let attemptCount = 0;
			const mockRawRequest = () => {
				attemptCount++;
				const mockReq: any = {
					on: (event: string, handler: Function) => {
						if (event === 'error') {
							setTimeout(() => handler(new Error('ECONNRESET')), 0);
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
					getRawRequest: mockRawRequest as any
				}, CancellationToken.None);
				assert.fail('Should have thrown an error');
			} catch (err) {
				assert.ok(err instanceof Error);
			}

			assert.strictEqual(attemptCount, 1, 'PATCH request should not have been retried');
		});
	});
});
