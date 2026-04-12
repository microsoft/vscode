/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import * as sinon from 'sinon';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { NullLogService } from '../../../log/common/log.js';
import { BaseSecretStorageService } from '../../common/secrets.js';
import { InMemoryStorageService } from '../../../storage/common/storage.js';
class TestEncryptionService {
    constructor() {
        this.encryptedPrefix = 'encrypted+'; // prefix to simulate encryption
    }
    setUsePlainTextEncryption() {
        return Promise.resolve();
    }
    getKeyStorageProvider() {
        return Promise.resolve("basic_text" /* KnownStorageProvider.basicText */);
    }
    encrypt(value) {
        return Promise.resolve(this.encryptedPrefix + value);
    }
    decrypt(value) {
        return Promise.resolve(value.substring(this.encryptedPrefix.length));
    }
    isEncryptionAvailable() {
        return Promise.resolve(true);
    }
}
class TestNoEncryptionService {
    setUsePlainTextEncryption() {
        throw new Error('Method not implemented.');
    }
    getKeyStorageProvider() {
        throw new Error('Method not implemented.');
    }
    encrypt(value) {
        throw new Error('Method not implemented.');
    }
    decrypt(value) {
        throw new Error('Method not implemented.');
    }
    isEncryptionAvailable() {
        return Promise.resolve(false);
    }
}
suite('secrets', () => {
    const store = ensureNoDisposablesAreLeakedInTestSuite();
    suite('BaseSecretStorageService useInMemoryStorage=true', () => {
        let service;
        let spyEncryptionService;
        let sandbox;
        setup(() => {
            sandbox = sinon.createSandbox();
            spyEncryptionService = sandbox.spy(new TestEncryptionService());
            service = store.add(new BaseSecretStorageService(true, store.add(new InMemoryStorageService()), spyEncryptionService, store.add(new NullLogService())));
        });
        teardown(() => {
            sandbox.restore();
        });
        test('type', async () => {
            assert.strictEqual(service.type, 'unknown');
            // trigger lazy initialization
            await service.set('my-secret', 'my-secret-value');
            assert.strictEqual(service.type, 'in-memory');
        });
        test('set and get', async () => {
            const key = 'my-secret';
            const value = 'my-secret-value';
            await service.set(key, value);
            const result = await service.get(key);
            assert.strictEqual(result, value);
            // Additionally ensure the encryptionservice was not used
            assert.strictEqual(spyEncryptionService.encrypt.callCount, 0);
            assert.strictEqual(spyEncryptionService.decrypt.callCount, 0);
        });
        test('delete', async () => {
            const key = 'my-secret';
            const value = 'my-secret-value';
            await service.set(key, value);
            await service.delete(key);
            const result = await service.get(key);
            assert.strictEqual(result, undefined);
        });
        test('onDidChangeSecret', async () => {
            const key = 'my-secret';
            const value = 'my-secret-value';
            let eventFired = false;
            store.add(service.onDidChangeSecret((changedKey) => {
                assert.strictEqual(changedKey, key);
                eventFired = true;
            }));
            await service.set(key, value);
            assert.strictEqual(eventFired, true);
        });
    });
    suite('BaseSecretStorageService useInMemoryStorage=false', () => {
        let service;
        let spyEncryptionService;
        let sandbox;
        setup(() => {
            sandbox = sinon.createSandbox();
            spyEncryptionService = sandbox.spy(new TestEncryptionService());
            service = store.add(new BaseSecretStorageService(false, store.add(new InMemoryStorageService()), spyEncryptionService, store.add(new NullLogService())));
        });
        teardown(() => {
            sandbox.restore();
        });
        test('type', async () => {
            assert.strictEqual(service.type, 'unknown');
            // trigger lazy initialization
            await service.set('my-secret', 'my-secret-value');
            assert.strictEqual(service.type, 'persisted');
        });
        test('set and get', async () => {
            const key = 'my-secret';
            const value = 'my-secret-value';
            await service.set(key, value);
            const result = await service.get(key);
            assert.strictEqual(result, value);
            // Additionally ensure the encryptionservice was not used
            assert.strictEqual(spyEncryptionService.encrypt.callCount, 1);
            assert.strictEqual(spyEncryptionService.decrypt.callCount, 1);
        });
        test('delete', async () => {
            const key = 'my-secret';
            const value = 'my-secret-value';
            await service.set(key, value);
            await service.delete(key);
            const result = await service.get(key);
            assert.strictEqual(result, undefined);
        });
        test('onDidChangeSecret', async () => {
            const key = 'my-secret';
            const value = 'my-secret-value';
            let eventFired = false;
            store.add(service.onDidChangeSecret((changedKey) => {
                assert.strictEqual(changedKey, key);
                eventFired = true;
            }));
            await service.set(key, value);
            assert.strictEqual(eventFired, true);
        });
    });
    suite('BaseSecretStorageService useInMemoryStorage=false, encryption not available', () => {
        let service;
        let spyNoEncryptionService;
        let sandbox;
        setup(() => {
            sandbox = sinon.createSandbox();
            spyNoEncryptionService = sandbox.spy(new TestNoEncryptionService());
            service = store.add(new BaseSecretStorageService(false, store.add(new InMemoryStorageService()), spyNoEncryptionService, store.add(new NullLogService())));
        });
        teardown(() => {
            sandbox.restore();
        });
        test('type', async () => {
            assert.strictEqual(service.type, 'unknown');
            // trigger lazy initialization
            await service.set('my-secret', 'my-secret-value');
            assert.strictEqual(service.type, 'in-memory');
        });
        test('set and get', async () => {
            const key = 'my-secret';
            const value = 'my-secret-value';
            await service.set(key, value);
            const result = await service.get(key);
            assert.strictEqual(result, value);
            // Additionally ensure the encryptionservice was not used
            assert.strictEqual(spyNoEncryptionService.encrypt.callCount, 0);
            assert.strictEqual(spyNoEncryptionService.decrypt.callCount, 0);
        });
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2VjcmV0cy50ZXN0LmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvcGxhdGZvcm0vc2VjcmV0cy90ZXN0L2NvbW1vbi9zZWNyZXRzLnRlc3QudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxNQUFNLE1BQU0sUUFBUSxDQUFDO0FBQzVCLE9BQU8sS0FBSyxLQUFLLE1BQU0sT0FBTyxDQUFDO0FBQy9CLE9BQU8sRUFBRSx1Q0FBdUMsRUFBRSxNQUFNLHVDQUF1QyxDQUFDO0FBRWhHLE9BQU8sRUFBRSxjQUFjLEVBQUUsTUFBTSw0QkFBNEIsQ0FBQztBQUM1RCxPQUFPLEVBQUUsd0JBQXdCLEVBQUUsTUFBTSx5QkFBeUIsQ0FBQztBQUNuRSxPQUFPLEVBQUUsc0JBQXNCLEVBQUUsTUFBTSxvQ0FBb0MsQ0FBQztBQUU1RSxNQUFNLHFCQUFxQjtJQUEzQjtRQUVTLG9CQUFlLEdBQUcsWUFBWSxDQUFDLENBQUMsZ0NBQWdDO0lBZ0J6RSxDQUFDO0lBZkEseUJBQXlCO1FBQ3hCLE9BQU8sT0FBTyxDQUFDLE9BQU8sRUFBRSxDQUFDO0lBQzFCLENBQUM7SUFDRCxxQkFBcUI7UUFDcEIsT0FBTyxPQUFPLENBQUMsT0FBTyxtREFBZ0MsQ0FBQztJQUN4RCxDQUFDO0lBQ0QsT0FBTyxDQUFDLEtBQWE7UUFDcEIsT0FBTyxPQUFPLENBQUMsT0FBTyxDQUFDLElBQUksQ0FBQyxlQUFlLEdBQUcsS0FBSyxDQUFDLENBQUM7SUFDdEQsQ0FBQztJQUNELE9BQU8sQ0FBQyxLQUFhO1FBQ3BCLE9BQU8sT0FBTyxDQUFDLE9BQU8sQ0FBQyxLQUFLLENBQUMsU0FBUyxDQUFDLElBQUksQ0FBQyxlQUFlLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQztJQUN0RSxDQUFDO0lBQ0QscUJBQXFCO1FBQ3BCLE9BQU8sT0FBTyxDQUFDLE9BQU8sQ0FBQyxJQUFJLENB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