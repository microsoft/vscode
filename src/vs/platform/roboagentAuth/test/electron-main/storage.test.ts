/*---------------------------------------------------------------------------------------------
 *  Copyright (c) RoboAgent. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { AuthStorageService, IStoredSessionData } from '../../electron-main/storage.js';
import { InMemoryFileSystemProvider } from '../../../files/common/inMemoryFilesystemProvider.js';
import { FileService } from '../../../files/common/fileService.js';
import { NullLogService } from '../../../log/common/log.js';
import { KnownStorageProvider, IEncryptionMainService } from '../../../encryption/common/encryptionService.js';
import { Schemas } from '../../../../base/common/network.js';
import { URI } from '../../../../base/common/uri.js';

class MockEncryptionService implements IEncryptionMainService {
	_serviceBrand: undefined;
	async encrypt(value: string): Promise<string> { return `encrypted_${value}`; }
	async decrypt(value: string): Promise<string> { return value.replace(/^encrypted_/, ''); }
	async isEncryptionAvailable(): Promise<boolean> { return true; }
	async getKeyStorageProvider(): Promise<KnownStorageProvider> { return KnownStorageProvider.basicText; }
	async setUsePlainTextEncryption(): Promise<void> { }
}

suite('RoboAgent Auth Storage', () => {
	let storageService: AuthStorageService;
	let fileService: FileService;
	let userDataPath: string;

	setup(() => {
		const logService = new NullLogService();
		fileService = new FileService(logService);
		const provider = new InMemoryFileSystemProvider();
		fileService.registerProvider(Schemas.file, provider);
		
		userDataPath = 'c:/mock_user_data';
		storageService = new AuthStorageService(userDataPath, fileService, new MockEncryptionService(), logService);
	});

	test('load returns undefined when no file exists', async () => {
		const data = await storageService.load();
		assert.strictEqual(data, undefined);
	});

	test('save and load round-trips correctly', async () => {
		const dataToSave: IStoredSessionData = {
			refreshToken: 'refresh-token-123',
			userId: 'user-id-456',
			email: 'test@example.com',
			displayName: 'Test User'
		};

		await storageService.save(dataToSave);
		const loadedData = await storageService.load();

		assert.deepStrictEqual(loadedData, dataToSave);
	});

	test('clear removes the file', async () => {
		const dataToSave: IStoredSessionData = { refreshToken: '123' };
		await storageService.save(dataToSave);
		
		const existsAfterSave = await fileService.exists(URI.file(`${userDataPath}/roboagent-auth.json`));
		assert.strictEqual(existsAfterSave, true);

		await storageService.clear();

		const existsAfterClear = await fileService.exists(URI.file(`${userDataPath}/roboagent-auth.json`));
		assert.strictEqual(existsAfterClear, false);
	});
});
