/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { URI } from '../../../../base/common/uri.js';
import { joinPath } from '../../../../base/common/resources.js';
import { VSBuffer } from '../../../../base/common/buffer.js';
import { FileService } from '../../../files/common/fileService.js';
import { InMemoryFileSystemProvider } from '../../../files/common/inMemoryFilesystemProvider.js';
import { NullLogService } from '../../../log/common/log.js';
import { FilePolicyService } from '../../common/filePolicyService.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';

suite('Linux Policy Support', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('FilePolicyService should handle Linux policy file path', async () => {
		// Simulate Linux policy file path
		const userHome = URI.file('/home/user');
		const dataFolderName = 'vscode-data';
		const policyFile = joinPath(userHome, dataFolderName, 'policy.json');

		// Setup file service
		const fileService = new FileService(new NullLogService());
		const provider = new InMemoryFileSystemProvider();
		disposables.add(fileService.registerProvider('file', provider));

		// Create policy file content
		const policyContent = JSON.stringify({
			'TestPolicy': 'test-value',
			'AnotherPolicy': 42
		});

		// Write policy file
		await fileService.writeFile(policyFile, VSBuffer.fromString(policyContent));

		// Create FilePolicyService
		const policyService = disposables.add(new FilePolicyService(policyFile, fileService, new NullLogService()));

		// Update policy definitions
		await policyService.updatePolicyDefinitions({
			'TestPolicy': { type: 'string' },
			'AnotherPolicy': { type: 'number' }
		});

		// Verify policies are loaded
		assert.strictEqual(policyService.getPolicyValue('TestPolicy'), 'test-value');
		assert.strictEqual(policyService.getPolicyValue('AnotherPolicy'), 42);
	});

	test('FilePolicyService should handle non-existent policy file gracefully', async () => {
		// Simulate Linux policy file path that doesn't exist
		const userHome = URI.file('/home/user');
		const dataFolderName = 'vscode-data';
		const policyFile = joinPath(userHome, dataFolderName, 'policy.json');

		// Setup file service
		const fileService = new FileService(new NullLogService());
		const provider = new InMemoryFileSystemProvider();
		disposables.add(fileService.registerProvider('file', provider));

		// Create FilePolicyService (without creating the file)
		const policyService = disposables.add(new FilePolicyService(policyFile, fileService, new NullLogService()));

		// Update policy definitions
		await policyService.updatePolicyDefinitions({
			'TestPolicy': { type: 'string' }
		});

		// Verify no policies are loaded (file doesn't exist)
		assert.strictEqual(policyService.getPolicyValue('TestPolicy'), undefined);
	});

	test('Policy file path construction should match expected Linux pattern', () => {
		const userHome = URI.file('/home/user');
		const dataFolderName = 'vscode-data';
		const policyFile = joinPath(userHome, dataFolderName, 'policy.json');

		// Verify the constructed path matches the expected Linux pattern
		assert.strictEqual(policyFile.path, '/home/user/vscode-data/policy.json');
		assert.strictEqual(policyFile.scheme, 'file');
	});
});