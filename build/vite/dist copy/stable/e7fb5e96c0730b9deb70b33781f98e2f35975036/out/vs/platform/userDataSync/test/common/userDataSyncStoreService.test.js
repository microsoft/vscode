/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { timeout } from '../../../../base/common/async.js';
import { newWriteableBufferStream } from '../../../../base/common/buffer.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { Event } from '../../../../base/common/event.js';
import { isWeb } from '../../../../base/common/platform.js';
import { runWithFakedTimers } from '../../../../base/test/common/timeTravelScheduler.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { NullLogService } from '../../../log/common/log.js';
import { IProductService } from '../../../product/common/productService.js';
import { IUserDataSyncStoreService, UserDataSyncStoreError } from '../../common/userDataSync.js';
import { RequestsSession, UserDataSyncStoreService } from '../../common/userDataSyncStoreService.js';
import { UserDataSyncClient, UserDataSyncTestServer } from './userDataSyncClient.js';
suite('UserDataSyncStoreService', () => {
    const disposableStore = ensureNoDisposablesAreLeakedInTestSuite();
    test('test read manifest for the first time', async () => {
        // Setup the client
        const target = new UserDataSyncTestServer();
        const client = disposableStore.add(new UserDataSyncClient(target));
        await client.setUp();
        const testObject = client.instantiationService.get(IUserDataSyncStoreService);
        const productService = client.instantiationService.get(IProductService);
        await testObject.manifest(null);
        assert.strictEqual(target.requestsWithAllHeaders.length, 1);
        assert.strictEqual(target.requestsWithAllHeaders[0].headers['X-Client-Name'], `${productService.applicationName}${isWeb ? '-web' : ''}`);
        assert.strictEqual(target.requestsWithAllHeaders[0].headers['X-Client-Version'], productService.version);
        assert.notStrictEqual(target.requestsWithAllHeaders[0].headers['X-Machine-Session-Id'], undefined);
        assert.strictEqual(target.requestsWithAllHeaders[0].headers['X-User-Session-Id'], undefined);
    });
    test('test read manifest for the second time when session is not yet created', async () => {
        // Setup the client
        const target = new UserDataSyncTestServer();
        const client = disposableStore.add(new UserDataSyncClient(target));
        await client.setUp();
        const testObject = client.instantiationService.get(IUserDataSyncStoreService);
        await testObject.manifest(null);
        const machineSessionId = target.requestsWithAllHeaders[0].headers['X-Machine-Session-Id'];
        target.reset();
        await testObject.manifest(null);
        assert.strictEqual(target.requestsWithAllHeaders.length, 1);
        assert.strictEqual(target.requestsWithAllHeaders[0].headers['X-Machine-Session-Id'], machineSessionId);
        assert.strictEqual(target.requestsWithAllHeaders[0].headers['X-User-Session-Id'], undefined);
    });
    test('test session id header is not set in the first manifest request after session is created', async () => {
        // Setup the client
        const target = new UserDataSyncTestServer();
        const client = disposableStore.add(new UserDataSyncClient(target));
        await client.setUp();
        const testObject = client.instantiationService.get(IUserDataSyncStoreService);
        await testObject.manifest(null);
        const machineSessionId = target.requestsWithAllHeaders[0].headers['X-Machine-Session-Id'];
        await testObject.writeResource("settings" /* SyncResource.Settings */, 'some content', null);
        target.reset();
        await testObject.manifest(null);
        assert.strictEqual(target.requestsWithAllHeaders.length, 1);
        assert.strictEqual(target.requestsWithAllHeaders[0].headers['X-Machine-Session-Id'], machineSessionId);
        assert.strictEqual(target.requestsWithAllHeaders[0].headers['X-User-Session-Id'], undefined);
    });
    test('test session id header is set from the second manifest request after session is created', async () => {
        // Setup the client
        const target = new UserDataSyncTestServer();
        const client = disposableStore.add(new UserDataSyncClient(target));
        await client.setUp();
        const testObject = client.instantiationService.get(IUserDataSyncStoreService);
        await testObject.manifest(null);
        const machineSessionId = target.requestsWithAllHeaders[0].headers['X-Machine-Session-Id'];
        await testObject.writeResource("settings" /* SyncResource.Settings */, 'some content', null);
        await testObject.manifest(null);
        target.reset();
        await testObject.manifest(null);
        assert.strictEqual(target.requestsWithAllHeaders.length, 1);
        assert.strictEqual(target.requestsWithAllHeaders[0].headers['X-Machine-Session-Id'], machineSessionId);
        assert.notStrictEqual(target.requestsWithAllHeaders[0].headers['X-User-Session-Id'], undefined);
    });
    test('test headers are send for write request', async () => {
        // Setup the client
        const target = new UserDataSyncTestServer();
        const client = disposableStore.add(new UserDataSyncClient(target));
        await client.setUp();
        const testObject = client.instantiationService.get(IUserDataSyncStoreService);
        await testObject.manifest(null);
        const machineSessionId = target.requestsWithAllHeaders[0].headers['X-Machine-Session-Id'];
        await testObject.writeResource("settings" /* SyncResource.Settings */, 'some content', null);
        await testObject.manifest(null);
        await testObject.manifest(null);
        target.reset();
        await testObject.writeResource("settings" /* SyncResource.Settings */, 'some content', null);
        assert.strictEqual(target.requestsWithAllHeaders.length, 1);
        assert.strictEqual(target.requestsWithAllHeaders[0].headers['X-Machine-Session-Id'], machineSessionId);
        assert.notStrictEqual(target.requestsWithAllHeaders[0].headers['X-User-Session-Id'], undefined);
    });
    test('test headers are send for read request', async () => {
        // Setup the client
        const target = new UserDataSyncTestServer();
        const client = disposableStore.add(new UserDataSyncClient(target));
        await client.setUp();
        const testObject = client.instantiationService.get(IUserDataSyncStoreService);
        await testObject.manifest(null);
        const machineSessionId = target.requestsWithAllHeaders[0].headers['X-Machine-Session-Id'];
        await testObject.writeResource("settings" /* SyncResource.Settings */, 'some content', null);
        await testObject.manifest(null);
        await testObject.manifest(null);
        target.reset();
        await testObject.readResource("settings" /* SyncResource.Settings */, null);
        assert.strictEqual(target.requestsWithAllHeaders.length, 1);
        assert.strictEqual(target.requestsWithAllHeaders[0].headers['X-Machine-Session-Id'], machineSessionId);
        assert.notStrictEqual(target.requestsWithAllHeaders[0].headers['X-User-Session-Id'], undefined);
    });
    test('test headers are reset after session is cleared ', async () => {
        // Setup the client
        const target = new UserDataSyncTestServer();
        const client = disposableStore.add(new UserDataSyncClient(target));
        await client.setUp();
        const testObject = client.instantiationService.get(IUserDataSyncStoreService);
        await testObject.manifest(null);
        const machineSessionId = target.requestsWithAllHeaders[0].headers['X-Machine-Session-Id'];
        await testObject.writeResource("settings" /* SyncResource.Settings */, 'some content', null);
        await testObject.manifest(null);
        await testObject.manifest(null);
        await testObject.clear();
        target.reset();
        await testObject.manifest(null);
        assert.strictEqual(target.requestsWithAllHeaders.length, 1);
        assert.notStrictEqual(target.requestsWithAllHeaders[0].headers['X-Machine-Session-Id'], undefined);
        assert.notStrictEqual(target.requestsWithAllHeaders[0].headers['X-Machine-Session-Id'], machineSessionId);
        assert.strictEqual(target.requestsWithAllHeaders[0].headers['X-User-Session-Id'], undefined);
    });
    test('test old headers are sent after session is changed on server ', async () => {
        // Setup the client
        const target = new UserDataSyncTestServer();
        const client = disposableStore.add(new UserDataSyncClient(target));
        await client.setUp();
        const testObject = client.instantiationService.get(IUserDataSyncStoreService);
        await testObject.manifest(null);
        await testObject.writeResource("settings" /* SyncResource.Settings */, 'some content', null);
        await testObject.manifest(null);
        target.reset();
        await testObject.manifest(null);
        const machineSessionId = target.requestsWithAllHeaders[0].headers['X-Machine-Session-Id'];
        const userSessionId = target.requestsWithAllHeaders[0].headers['X-User-Session-Id'];
        await target.clear();
        // client 2
        const client2 = disposableStore.add(new UserDataSyncClient(target));
        await client2.setUp();
        const testObject2 = client2.instantiationService.get(IUserDataSyncStoreService);
        await testObject2.writeResource("settings" /* SyncResource.Settings */, 'some content', null);
        target.reset();
        await testObject.manifest(null);
        assert.strictEqual(target.requestsWithAllHeaders.length, 1);
        assert.notStrictEqual(target.requestsWithAllHeaders[0].headers['X-Machine-Session-Id'], undefined);
        assert.strictEqual(target.requestsWithAllHeaders[0].headers['X-Machine-Session-Id'], machineSessionId);
        assert.notStrictEqual(target.requestsWithAllHeaders[0].headers['X-User-Session-Id'], undefined);
        assert.strictEqual(target.requestsWithAllHeaders[0].headers['X-User-Session-Id'], userSessionId);
    });
    test('test old headers are reset from second request after session is changed on server ', async () => {
        // Setup the client
        const target = new UserDataSyncTestServer();
        const client = disposableStore.add(new UserDataSyncClient(target));
        await client.setUp();
        const testObject = client.instantiationService.get(IUserDataSyncStoreService);
        await testObject.manifest(null);
        await testObject.writeResource("settings" /* SyncResource.Settings */, 'some content', null);
        await testObject.manifest(null);
        target.reset();
        await testObject.manifest(null);
        const machineSessionId = target.requestsWithAllHeaders[0].headers['X-Machine-Session-Id'];
        const userSessionId = target.requestsWithAllHeaders[0].headers['X-User-Session-Id'];
        await target.clear();
        // client 2
        const client2 = disposableStore.add(new UserDataSyncClient(target));
        await client2.setUp();
        const testObject2 = client2.instantiationService.get(IUserDataSyncStoreService);
        await testObject2.writeResource("settings" /* SyncResource.Settings */, 'some content', null);
        await testObject.manifest(null);
        target.reset();
        await testObject.manifest(null);
        assert.strictEqual(target.requestsWithAllHeaders.length, 1);
        assert.notStrictEqual(target.requestsWithAllHeaders[0].headers['X-Machine-Session-Id'], undefined);
        assert.notStrictEqual(target.requestsWithAllHeaders[0].headers['X-Machine-Session-Id'], machineSessionId);
        assert.notStrictEqual(target.requestsWithAllHeaders[0].headers['X-User-Session-Id'], undefined);
        assert.notStrictEqual(target.requestsWithAllHeaders[0].headers['X-User-Session-Id'], userSessionId);
    });
    test('test old headers are sent after session is cleared from another server ', async () => {
        // Setup the client
        const target = new UserDataSyncTestServer();
        const client = disposableStore.add(new UserDataSyncClient(target));
        await client.setUp();
        const testObject = client.instantiationService.get(IUserDataSyncStoreService);
        await testObject.manifest(null);
        await testObject.writeResource("settings" /* SyncResource.Settings */, 'some content', null);
        await testObject.manifest(null);
        target.reset();
        await testObject.manifest(null);
        const machineSessionId = target.requestsWithAllHeaders[0].headers['X-Machine-Session-Id'];
        const userSessionId = target.requestsWithAllHeaders[0].headers['X-User-Session-Id'];
        // client 2
        const client2 = disposableStore.add(new UserDataSyncClient(target));
        await client2.setUp();
        const testObject2 = client2.instantiationService.get(IUserDataSyncStoreService);
        await testObject2.clear();
        target.reset();
        await testObject.manifest(null);
        assert.strictEqual(target.requestsWithAllHeaders.length, 1);
        assert.notStrictEqual(target.requestsWithAllHeaders[0].headers['X-Machine-Session-Id'], undefined);
        assert.strictEqual(target.requestsWithAllHeaders[0].headers['X-Machine-Session-Id'], machineSessionId);
        assert.notStrictEqual(target.requestsWithAllHeaders[0].headers['X-User-Session-Id'], undefined);
        assert.strictEqual(target.requestsWithAllHeaders[0].headers['X-User-Session-Id'], userSessionId);
    });
    test('test headers are reset after session is cleared from another server ', async () => {
        // Setup the client
        const target = new UserDataSyncTestServer();
        const client = disposableStore.add(new UserDataSyncClient(target));
        await client.setUp();
        const testObject = client.instantiationService.get(IUserDataSyncStoreService);
        await testObject.manifest(null);
        await testObject.writeResource("settings" /* SyncResource.Settings */, 'some content', null);
        await testObject.manifest(null);
        target.reset();
        await testObject.manifest(null);
        const machineSessionId = target.requestsWithAllHeaders[0].headers['X-Machine-Session-Id'];
        // client 2
        const client2 = disposableStore.add(new UserDataSyncClient(target));
        await client2.setUp();
        const testObject2 = client2.instantiationService.get(IUserDataSyncStoreService);
        await testObject2.clear();
        await testObject.manifest(null);
        target.reset();
        await testObject.manifest(null);
        assert.strictEqual(target.requestsWithAllHeaders.length, 1);
        assert.notStrictEqual(target.requestsWithAllHeaders[0].headers['X-Machine-Session-Id'], undefined);
        assert.notStrictEqual(target.requestsWithAllHeaders[0].headers['X-Machine-Session-Id'], machineSessionId);
        assert.strictEqual(target.requestsWithAllHeaders[0].headers['X-User-Session-Id'], undefined);
    });
    test('test headers are reset after session is cleared from another server - started syncing again', async () => {
        // Setup the client
        const target = new UserDataSyncTestServer();
        const client = disposableStore.add(new UserDataSyncClient(target));
        await client.setUp();
        const testObject = client.instantiationService.get(IUserDataSyncStoreService);
        await testObject.manifest(null);
        await testObject.writeResource("settings" /* SyncResource.Settings */, 'some content', null);
        await testObject.manifest(null);
        target.reset();
        await testObject.manifest(null);
        const machineSessionId = target.requestsWithAllHeaders[0].headers['X-Machine-Session-Id'];
        const userSessionId = target.requestsWithAllHeaders[0].headers['X-User-Session-Id'];
        // client 2
        const client2 = disposableStore.add(new UserDataSyncClient(target));
        await client2.setUp();
        const testObject2 = client2.instantiationService.get(IUserDataSyncStoreService);
        await testObject2.clear();
        await testObject.manifest(null);
        await testObject.writeResource("settings" /* SyncResource.Settings */, 'some content', null);
        await testObject.manifest(null);
        target.reset();
        await testObject.manifest(null);
        assert.strictEqual(target.requestsWithAllHeaders.length, 1);
        assert.notStrictEqual(target.requestsWithAllHeaders[0].headers['X-Machine-Session-Id'], undefined);
        assert.notStrictEqual(target.requestsWithAllHeaders[0].headers['X-Machine-Session-Id'], machineSessionId);
        assert.notStrictEqual(target.requestsWithAllHeaders[0].headers['X-User-Session-Id'], userSessionId);
        assert.notStrictEqual(target.requestsWithAllHeaders[0].headers['X-User-Session-Id'], undefined);
    });
    test('test rate limit on server with retry after', async () => {
        const target = new UserDataSyncTestServer(1, 1);
        const client = disposableStore.add(new UserDataSyncClient(target));
        await client.setUp();
        const testObject = client.instantiationService.get(IUserDataSyncStoreService);
        await testObject.manifest(null);
        const promise = Event.toPromise(testObject.onDidChangeDonotMakeRequestsUntil);
        try {
            await testObject.manifest(null);
            assert.fail('should fail');
        }
        catch (e) {
            assert.ok(e instanceof UserDataSyncStoreError);
            assert.deepStrictEqual(e.code, "TooManyRequestsAndRetryAfter" /* UserDataSyncErrorCode.TooManyRequestsAndRetryAfter */);
            await promise;
            assert.ok(!!testObject.donotMakeRequestsUntil);
        }
    });
    test('test donotMakeRequestsUntil is reset after retry time is finished', async () => {
        return runWithFakedTimers({ useFakeTimers: true }, async () => {
            const client = disposableStore.add(new UserDataSyncClient(new UserDataSyncTestServer(1, 0.25)));
            await client.setUp();
            const testObject = client.instantiationService.get(IUserDataSyncStoreService);
            await testObject.manifest(null);
            try {
                await testObject.manifest(null);
                assert.fail('should fail');
            }
            catch (e) { }
            const promise = Event.toPromise(testObject.onDidChangeDonotMakeRequestsUntil);
            await timeout(300);
            await promise;
            assert.ok(!testObject.donotMakeRequestsUntil);
        });
    });
    test('test donotMakeRequestsUntil is retrieved', async () => {
        const client = disposableStore.add(new UserDataSyncClient(new UserDataSyncTestServer(1, 1)));
        await client.setUp();
        const testObject = client.instantiationService.get(IUserDataSyncStoreService);
        await testObject.manifest(null);
        try {
            await testObject.manifest(null);
        }
        catch (e) { }
        const target = disposableStore.add(client.instantiationService.createInstance(UserDataSyncStoreService));
        assert.strictEqual(target.donotMakeRequestsUntil?.getTime(), testObject.donotMakeRequestsUntil?.getTime());
    });
    test('test donotMakeRequestsUntil is checked and reset after retreived', async () => {
        return runWithFakedTimers({ useFakeTimers: true }, async () => {
            const client = disposableStore.add(new UserDataSyncClient(new UserDataSyncTestServer(1, 0.25)));
            await client.setUp();
            const testObject = client.instantiationService.get(IUserDataSyncStoreService);
            await testObject.manifest(null);
            try {
                await testObject.manifest(null);
                assert.fail('should fail');
            }
            catch (e) { }
            await timeout(300);
            const target = disposableStore.add(client.instantiationService.createInstance(UserDataSyncStoreService));
            assert.ok(!target.donotMakeRequestsUntil);
        });
    });
    test('test read resource request handles 304', async () => {
        // Setup the client
        const target = new UserDataSyncTestServer();
        const client = disposableStore.add(new UserDataSyncClient(target));
        await client.setUp();
        await client.sync();
        const testObject = client.instantiationService.get(IUserDataSyncStoreService);
        const expected = await testObject.readResource("settings" /* SyncResource.Settings */, null);
        const actual = await testObject.readResource("settings" /* SyncResource.Settings */, expected);
        assert.strictEqual(actual, expected);
    });
});
suite('UserDataSyncRequestsSession', () => {
    const requestService = {
        _serviceBrand: undefined,
        onDidCompleteRequest: Event.None,
        async request() { return { res: { headers: {} }, stream: newWriteableBufferStream() }; },
        async resolveProxy() { return undefined; },
        async lookupAuthorization() { return undefined; },
        async lookupKerberosAuthorization() { return undefined; },
        async loadCertificates() { return []; }
    };
    ensureNoDisposablesAreLeakedInTestSuite();
    test('too many requests are thrown when limit exceeded', async () => {
        const testObject = new RequestsSession(1, 500, requestService, new NullLogService());
        await testObject.request('url', { callSite: 'test' }, CancellationToken.None);
        try {
            await testObject.request('url', { callSite: 'test' }, CancellationToken.None);
        }
        catch (error) {
            assert.ok(error instanceof UserDataSyncStoreError);
            assert.strictEqual(error.code, "LocalTooManyRequests" /* UserDataSyncErrorCode.LocalTooManyRequests */);
            return;
        }
        assert.fail('Should fail with limit exceeded');
    });
    test('requests are handled after session is expired', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
        const testObject = new RequestsSession(1, 100, requestService, new NullLogService());
        await testObject.request('url', { callSite: 'test' }, CancellationToken.None);
        await timeout(125);
        await testObject.request('url', { callSite: 'test' }, CancellationToken.None);
    }));
    test('too many requests are thrown after session is expired', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
        const testObject = new RequestsSession(1, 100, requestService, new NullLogService());
        await testObject.request('url', { callSite: 'test' }, CancellationToken.None);
        await timeout(125);
        await testObject.request('url', { callSite: 'test' }, CancellationToken.None);
        try {
            await testObject.request('url', { callSite: 'test' }, CancellationToken.None);
        }
        catch (error) {
            assert.ok(error instanceof UserDataSyncStoreError);
            assert.strictEqual(error.code, "LocalTooManyRequests" /* UserDataSyncErrorCode.LocalTooManyRequests */);
            return;
        }
        assert.fail('Should fail with limit exceeded');
    }));
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidXNlckRhdGFTeW5jU3RvcmVTZXJ2aWNlLnRlc3QuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy9wbGF0Zm9ybS91c2VyRGF0YVN5bmMvdGVzdC9jb21tb24vdXNlckRhdGFTeW5jU3RvcmVTZXJ2aWNlLnRlc3QudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxNQUFNLE1BQU0sUUFBUSxDQUFDO0FBQzVCLE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSxrQ0FBa0MsQ0FBQztBQUMzRCxPQUFPLEVBQUUsd0JBQXdCLEVBQUUsTUFBTSxtQ0FBbUMsQ0FBQztBQUM3RSxPQUFPLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSx5Q0FBeUMsQ0FBQztBQUM1RSxPQUFPLEVBQUUsS0FBSyxFQUFFLE1BQU0sa0NBQWtDLENBQUM7QUFDekQsT0FBTyxFQUFFLEtBQUssRUFBRSxNQUFNLHFDQUFxQyxDQUFDO0FBQzVELE9BQU8sRUFBRSxrQkFBa0IsRUFBRSxNQUFNLHFEQUFxRCxDQUFDO0FBQ3pGLE9BQU8sRUFBRSx1Q0FBdUMsRUFBRSxNQUFNLHVDQUF1QyxDQUFDO0FBQ2hHLE9BQU8sRUFBRSxjQUFjLEVBQUUsTUFBTSw0QkFBNEIsQ0FBQztBQUM1RCxPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0sMkNBQTJDLENBQUM7QUFFNUUsT0FBTyxFQUFFLHlCQUF5QixFQUF1QyxzQkFBc0IsRUFBRSxNQUFNLDhCQUE4QixDQUFDO0FBQ3RJLE9BQU8sRUFBRSxlQUFlLEVBQUUsd0JBQXdCLEVBQUUsTUFBTSwwQ0FBMEMsQ0FBQztBQUNyRyxPQUFPLEVBQUUsa0JBQWtCLEVBQUUsc0JBQXNCLEVBQUUsTUFBTSx5QkFBeUIsQ0FBQztBQUVyRixLQUFLLENBQUMsMEJBQTBCLEVBQUUsR0FBRyxFQUFFO0lBRXRDLE1BQU0sZUFBZSxHQUFHLHVDQUF1QyxFQUFFLENB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