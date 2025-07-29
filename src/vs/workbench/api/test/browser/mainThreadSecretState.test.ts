/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { MainThreadSecretState } from '../../browser/mainThreadSecretState.js';
import { mock } from '../../../../base/test/common/mock.js';
import { IExtHostContext } from '../../../services/extensions/common/extHostCustomers.js';
import { ISecretStorageService } from '../../../../platform/secrets/common/secrets.js';
import { ILogService, NullLogService } from '../../../../platform/log/common/log.js';
import { IBrowserWorkbenchEnvironmentService } from '../../../services/environment/browser/environmentService.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';

suite('MainThreadSecretState', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('doGetKeys should handle non-JSON keys gracefully', async () => {
		// Mock secret storage service that returns mixed JSON and non-JSON keys
		const mockSecretStorageService = new class extends mock<ISecretStorageService>() {
			keys(): Promise<string[]> {
				return Promise.resolve([
					'{"extensionId": "test.extension", "key": "validKey1"}',
					'{"extensionId": "test.extension", "key": "validKey2"}',
					'mcpEncryptionKey', // This is a plain string key that should be ignored
					'{"extensionId": "other.extension", "key": "otherKey"}',
					'anotherPlainStringKey' // Another plain string key that should be ignored
				]);
			}
		};

		const mockExtHostContext = new class extends mock<IExtHostContext>() {
			getProxy() {
				return {
					$onDidChangePassword: () => { }
				};
			}
		};

		const mockEnvironmentService = new class extends mock<IBrowserWorkbenchEnvironmentService>() { };

		const mainThreadSecretState = store.add(new MainThreadSecretState(
			mockExtHostContext,
			mockSecretStorageService,
			new NullLogService(),
			mockEnvironmentService
		));

		// This should not throw an error, even with non-JSON keys present
		const keys = await mainThreadSecretState.$getKeys('test.extension');

		// Should return only the keys that belong to 'test.extension'
		assert.deepStrictEqual(keys, ['validKey1', 'validKey2']);
	});

	test('doGetKeys should handle empty results gracefully', async () => {
		const mockSecretStorageService = new class extends mock<ISecretStorageService>() {
			keys(): Promise<string[]> {
				return Promise.resolve([
					'mcpEncryptionKey',
					'anotherPlainStringKey'
				]);
			}
		};

		const mockExtHostContext = new class extends mock<IExtHostContext>() {
			getProxy() {
				return {
					$onDidChangePassword: () => { }
				};
			}
		};

		const mockEnvironmentService = new class extends mock<IBrowserWorkbenchEnvironmentService>() { };

		const mainThreadSecretState = store.add(new MainThreadSecretState(
			mockExtHostContext,
			mockSecretStorageService,
			new NullLogService(),
			mockEnvironmentService
		));

		// Should return empty array when no keys match the extension
		const keys = await mainThreadSecretState.$getKeys('test.extension');
		assert.deepStrictEqual(keys, []);
	});
});