/*---------------------------------------------------------------------------------------------
 *  Copyright (c) RoboAgent. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { NullLogService } from '../../../log/common/log.js';
import { IProductService } from '../../../product/common/productService.js';
import { IFileService } from '../../../files/common/files.js';
import { IEncryptionMainService, KnownStorageProvider } from '../../../encryption/common/encryptionService.js';
import { IEnvironmentMainService } from '../../../environment/electron-main/environmentMainService.js';
import { IURLService } from '../../../url/common/url.js';
import { INativeHostMainService } from '../../../native/electron-main/nativeHostMainService.js';
import { RoboAgentAuthMainService } from '../../electron-main/roboagentAuthMainService.js';
import { IDisposable } from '../../../../base/common/lifecycle.js';

suite('RoboAgent Auth Main Service', () => {
	let authService: RoboAgentAuthMainService;

	setup(() => {
		const logService = new NullLogService();
		const productService = { supabaseAnonKey: 'test-key', urlProtocol: 'roboagent' } as unknown as IProductService;
		
		const fileService = {
			exists: async () => false,
			readFile: async () => { throw new Error('Not implemented'); },
			writeFile: async () => { },
			del: async () => { }
		} as unknown as IFileService;

		const encryptionService = {
			encrypt: async (v: string) => v,
			decrypt: async (v: string) => v,
			isEncryptionAvailable: async () => true,
			getKeyStorageProvider: async () => KnownStorageProvider.basicText,
			setUsePlainTextEncryption: async () => { }
		} as unknown as IEncryptionMainService;

		const environmentService = {
			userDataPath: 'c:/mock_user_data'
		} as unknown as IEnvironmentMainService;

		const urlService = {
			registerHandler: () => ({ dispose: () => {} } as IDisposable)
		} as unknown as IURLService;

		const nativeHostService = {
			openExternal: async () => true
		} as unknown as INativeHostMainService;

		authService = new RoboAgentAuthMainService(
			logService,
			productService,
			fileService,
			encryptionService,
			environmentService,
			urlService,
			nativeHostService
		);
	});

	teardown(() => {
		authService.dispose();
	});

	test('getSession initially returns not signed in', async () => {
		const session = await authService.getSession();
		assert.strictEqual(session.isSignedIn, false);
	});

	// The flow test involving HTTP intercepts is complex and better suited to integration tests
	// For unit test level, we rely on the sub-component tests (pkce, storage)
});
