/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { NullLogService } from '../../../log/common/log.js';
import { lookupKerberosAuthorization, nodeRequest } from '../../node/requestService.js';
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
        }
        catch (err) {
            assert.ok(err?.message?.includes('No authority could be contacted for authentication')
                || err?.message?.includes('No Kerberos credentials available')
                || err?.message?.includes('No credentials are available in the security package')
                || err?.message?.includes('no credential for'), `Unexpected error: ${err}`);
        }
    });
    test('Request cancellation during retry backoff', async () => {
        const cts = store.add(new CancellationTokenSource());
        const startTime = Date.now();
        setTimeout(() => cts.cancel(), 50);
        try {
            await nodeRequest({ url: 'http://localhost:9999/nonexistent', callSite: 'requestService.test.cancellation' }, cts.token);
            assert.fail('Request should have been cancelled');
        }
        catch (err) {
            const elapsed = Date.now() - startTime;
            assert.ok(err instanceof CancellationError, 'Error should be CancellationError');
            assert.ok(elapsed < 200, `Request should be cancelled quickly, but took ${elapsed}ms`);
        }
    });
    test('should retry GET requests on transient errors', async () => {
        let attemptCount = 0;
        const mockRawRequest = (_opts, callback) => {
            attemptCount++;
            const currentAttempt = attemptCount;
            const mockReq = {
                on: (event, handler) => {
                    if (event === 'error' && currentAttempt < 3) {
                        const err = new Error('Connection refused');
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
                getRawRequest: () => mockRawRequest,
                callSite: 'requestService.test.retryGET'
            }, CancellationToken.None);
        }
        catch (err) {
            // Expected to eventually succeed or fail after retries
        }
        assert.ok(attemptCount > 1, 'GET request should have been retried');
    });
    test('should NOT retry POST requests', async () => {
        let attemptCount = 0;
        const mockRawRequest = () => {
            attemptCount++;
            const mockReq = {
                on: (event, handler) => {
                    if (event === 'error') {
                        const err = new Error('Connection refused');
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
        }
        catch (err) {
            assert.ok(err instanceof Error);
        }
        assert.strictEqual(attemptCount, 1, 'POST request should not have been retried');
    });
    test('should retry HEAD requests on transient errors', async () => {
        let attemptCount = 0;
        const mockRawRequest = (_opts, callback) => {
            attemptCount++;
            const currentAttempt = attemptCount;
            const mockReq = {
                on: (event, handler) => {
                    if (event === 'error' && currentAttempt < 3) {
                        const err = new Error('Host unreachable');
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
                getRawRequest: () => mockRawRequest,
                callSite: 'requestService.test.retryHEAD'
            }, CancellationToken.None);
        }
        catch (err) {
            // Expected to eventually succeed or fail after retries
        }
        assert.ok(attemptCount > 1, 'HEAD request should have been retried');
    });
    test('should retry OPTIONS requests on transient errors', async () => {
        let attemptCount = 0;
        const mockRawRequest = (_opts, callback) => {
            attemptCount++;
            const currentAttempt = attemptCount;
            const mockReq = {
                on: (event, handler) => {
                    if (event === 'error' && currentAttempt < 3) {
                        const err = new Error('Network unreachable');
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
                getRawRequest: () => mockRawRequest,
                callSite: 'requestService.test.retryOPTIONS'
            }, CancellationToken.None);
        }
        catch (err) {
            // Expected to eventually succeed or fail after retries
        }
        assert.ok(attemptCount > 1, 'OPTIONS request should have been retried');
    });
    test('should NOT retry DELETE requests', async () => {
        let attemptCount = 0;
        const mockRawRequest = () => {
            attemptCount++;
            const mockReq = {
                on: (event, handler) => {
                    if (event === 'error') {
                        const err = new Error('Connection refused');
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
        }
        catch (err) {
            assert.ok(err instanceof Error);
        }
        assert.strictEqual(attemptCount, 1, 'DELETE request should not have been retried');
    });
    test('should NOT retry PUT requests', async () => {
        let attemptCount = 0;
        const mockRawRequest = () => {
            attemptCount++;
            const mockReq = {
                on: (event, handler) => {
                    if (event === 'error') {
                        const err = new Error('Connection refused');
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
        }
        catch (err) {
            assert.ok(err instanceof Error);
        }
        assert.strictEqual(attemptCount, 1, 'PUT request should not have been retried');
    });
    test('should NOT retry PATCH requests', async () => {
        let attemptCount = 0;
        const mockRawRequest = () => {
            attemptCount++;
            const mockReq = {
                on: (event, handler) => {
                    if (event === 'error') {
                        const err = new Error('Connection refused');
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
        }
        catch (err) {
            assert.ok(err instanceof Error);
        }
        assert.strictEqual(attemptCount, 1, 'PATCH request should not have been retried');
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicmVxdWVzdFNlcnZpY2UudGVzdC5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3BsYXRmb3JtL3JlcXVlc3QvdGVzdC9ub2RlL3JlcXVlc3RTZXJ2aWNlLnRlc3QudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxNQUFNLE1BQU0sUUFBUSxDQUFDO0FBQzVCLE9BQU8sRUFBRSx1Q0FBdUMsRUFBRSxNQUFNLHVDQUF1QyxDQUFDO0FBQ2hHLE9BQU8sRUFBRSxjQUFjLEVBQUUsTUFBTSw0QkFBNEIsQ0FBQztBQUM1RCxPQUFPLEVBQXVCLDJCQUEyQixFQUFFLFdBQVcsRUFBRSxNQUFNLDhCQUE4QixDQUFDO0FBQzdHLE9BQU8sRUFBRSxTQUFTLEVBQUUsTUFBTSxxQ0FBcUMsQ0FBQztBQUNoRSxPQUFPLEVBQUUsaUJBQWlCLEVBQUUsdUJBQXVCLEVBQUUsTUFBTSx5Q0FBeUMsQ0FBQztBQUNyRyxPQUFPLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSxtQ0FBbUMsQ0FBQztBQUV0RSxLQUFLLENBQUMsaUJBQWlCLEVBQUUsR0FBRyxFQUFFO0lBQzdCLE1BQU0sS0FBSyxHQUFHLHVDQUF1QyxFQUFFLENBQUM7SUFFeEQsNkRBQTZEO0lBQzdELENBQUMsU0FBUyxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsQ0FBQyxpQkFBaUIsRUFBRSxLQUFLLElBQUksRUFBRTtRQUM1RCxJQUFJLENBQUM7WUFDSixNQUFNLFVBQVUsR0FBRyxLQUFLLENBQUMsR0FBRyxDQUFDLElBQUksY0FBYyxFQUFFLENBQUMsQ0FBQztZQUNuRCxNQUFNLFFBQVEsR0FBRyxNQUFNLDJCQUEyQixDQUFDLHVCQUF1QixFQUFFLFNBQVMsRUFBRSxVQUFVLEVBQUUsd0JBQXdCLENBQUMsQ0FBQztZQUM3SCxNQUFNLENBQUMs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