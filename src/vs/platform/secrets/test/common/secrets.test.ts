/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as sinon from 'sinon';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { IEncryptionService, KnownStorageProvider } from '../../../encryption/common/encryptionService.js';
import { NullLogService } from '../../../log/common/log.js';
import { BaseSecretStorageService, CROSS_APP_SHARED_SECRET_KEYS } from '../../common/secrets.js';
import { InMemoryStorageService } from '../../../storage/common/storage.js';

class TestEncryptionService implements IEncryptionService {
	_serviceBrand: undefined;
	private encryptedPrefix = 'encrypted+'; // prefix to simulate encryption
	setUsePlainTextEncryption(): Promise<void> {
		return Promise.resolve();
	}
	getKeyStorageProvider(): Promise<KnownStorageProvider> {
		return Promise.resolve(KnownStorageProvider.basicText);
	}
	encrypt(value: string): Promise<string> {
		return Promise.resolve(this.encryptedPrefix + value);
	}
	decrypt(value: string): Promise<string> {
		return Promise.resolve(value.substring(this.encryptedPrefix.length));
	}
	isEncryptionAvailable(): Promise<boolean> {
		return Promise.resolve(true);
	}
}

class TestNoEncryptionService implements IEncryptionService {
	_serviceBrand: undefined;
	setUsePlainTextEncryption(): Promise<void> {
		throw new Error('Method not implemented.');
	}
	getKeyStorageProvider(): Promise<KnownStorageProvider> {
		throw new Error('Method not implemented.');
	}
	encrypt(value: string): Promise<string> {
		throw new Error('Method not implemented.');
	}
	decrypt(value: string): Promise<string> {
		throw new Error('Method not implemented.');
	}
	isEncryptionAvailable(): Promise<boolean> {
		return Promise.resolve(false);
	}
}

suite('secrets', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	suite('BaseSecretStorageService useInMemoryStorage=true', () => {
		let service: BaseSecretStorageService;
		let spyEncryptionService: sinon.SinonSpiedInstance<TestEncryptionService>;
		let sandbox: sinon.SinonSandbox;

		setup(() => {
			sandbox = sinon.createSandbox();
			spyEncryptionService = sandbox.spy(new TestEncryptionService());
			service = store.add(new BaseSecretStorageService(
				true,
				store.add(new InMemoryStorageService()),
				spyEncryptionService,
				store.add(new NullLogService())
			));
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
		let service: BaseSecretStorageService;
		let spyEncryptionService: sinon.SinonSpiedInstance<TestEncryptionService>;
		let sandbox: sinon.SinonSandbox;

		setup(() => {
			sandbox = sinon.createSandbox();
			spyEncryptionService = sandbox.spy(new TestEncryptionService());
			service = store.add(new BaseSecretStorageService(
				false,
				store.add(new InMemoryStorageService()),
				spyEncryptionService,
				store.add(new NullLogService()))
			);
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
		let service: BaseSecretStorageService;
		let spyNoEncryptionService: sinon.SinonSpiedInstance<TestEncryptionService>;
		let sandbox: sinon.SinonSandbox;

		setup(() => {
			sandbox = sinon.createSandbox();
			spyNoEncryptionService = sandbox.spy(new TestNoEncryptionService());
			service = store.add(new BaseSecretStorageService(
				false,
				store.add(new InMemoryStorageService()),
				spyNoEncryptionService,
				store.add(new NullLogService()))
			);
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

	suite('BaseSecretStorageService cross-app shared secrets', () => {

		class TestSharedSecretStorageService extends BaseSecretStorageService {
			protected override useSharedStorage(key: string): boolean {
				return CROSS_APP_SHARED_SECRET_KEYS.includes(key);
			}
		}

		let service: BaseSecretStorageService;
		let storageService: InMemoryStorageService;
		let sandbox: sinon.SinonSandbox;

		setup(() => {
			sandbox = sinon.createSandbox();
			storageService = store.add(new InMemoryStorageService());
			service = store.add(new TestSharedSecretStorageService(
				false,
				storageService,
				sandbox.spy(new TestEncryptionService()),
				store.add(new NullLogService()))
			);
		});

		teardown(() => {
			sandbox.restore();
		});

		test('shared keys are stored and read from APPLICATION_SHARED', async () => {
			const sharedKey = CROSS_APP_SHARED_SECRET_KEYS[0];
			const value = 'shared-secret-value';
			await service.set(sharedKey, value);
			const result = await service.get(sharedKey);
			assert.strictEqual(result, value);

			// Non-shared key should still work via APPLICATION scope
			const regularKey = 'regular-secret';
			await service.set(regularKey, 'regular-value');
			assert.strictEqual(await service.get(regularKey), 'regular-value');
		});

		test('onDidChangeSecret fires for APPLICATION_SHARED changes', async () => {
			const sharedKey = CROSS_APP_SHARED_SECRET_KEYS[0];
			let eventFired = false;
			store.add(service.onDidChangeSecret(changedKey => {
				assert.strictEqual(changedKey, sharedKey);
				eventFired = true;
			}));
			await service.set(sharedKey, 'value');
			assert.strictEqual(eventFired, true);
		});

		test('deleting a shared key removes it', async () => {
			const sharedKey = CROSS_APP_SHARED_SECRET_KEYS[0];
			await service.set(sharedKey, 'value');
			assert.strictEqual(await service.get(sharedKey), 'value');
			await service.delete(sharedKey);
			assert.strictEqual(await service.get(sharedKey), undefined);
		});
	});
});
