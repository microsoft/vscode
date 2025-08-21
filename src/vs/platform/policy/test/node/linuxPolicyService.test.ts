/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { URI } from '../../../../../base/common/uri.js';
import { VSBuffer } from '../../../../../base/common/buffer.js';
import { FileService } from '../../../../files/common/fileService.js';
import { IFileService } from '../../../../files/common/files.js';
import { InMemoryFileSystemProvider } from '../../../../files/common/inMemoryFilesystemProvider.js';
import { NullLogService } from '../../../../log/common/log.js';
import { LinuxPolicyService } from '../../node/linuxPolicyService.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { runWithFakedTimers } from '../../../../../base/test/common/timeTravelScheduler.js';

suite('LinuxPolicyService', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	let testObject: LinuxPolicyService;
	let fileService: IFileService;
	const logService = new NullLogService();

	const systemPolicyFile = URI.file('/etc/vscode/policies.json').with({ scheme: 'vscode-tests' });
	const userPolicyFile = URI.file('/home/user/.config/vscode/policies.json').with({ scheme: 'vscode-tests' });

	setup(async () => {
		fileService = disposables.add(new FileService(logService));
		const diskFileSystemProvider = disposables.add(new InMemoryFileSystemProvider());
		disposables.add(fileService.registerProvider(systemPolicyFile.scheme, diskFileSystemProvider));

		testObject = disposables.add(new LinuxPolicyService(fileService, logService, '/home/user/.config', 'vscode'));
	});

	test('should initialize with no policies when files do not exist', async () => {
		await testObject.updatePolicyDefinitions({
			'test.policy': { type: 'string' }
		});

		assert.strictEqual(testObject.getPolicyValue('test.policy'), undefined);
	});

	test('should read system-wide policies', async () => {
		await fileService.writeFile(systemPolicyFile, VSBuffer.fromString(JSON.stringify({
			'test.policy': 'system-value'
		})));

		await testObject.updatePolicyDefinitions({
			'test.policy': { type: 'string' }
		});

		await runWithFakedTimers({ useFakeTimers: true }, async () => {
			await new Promise(resolve => setTimeout(resolve, 600)); // Wait for throttled delayer
		});

		assert.strictEqual(testObject.getPolicyValue('test.policy'), 'system-value');
	});

	test('should read user-specific policies', async () => {
		await fileService.writeFile(userPolicyFile, VSBuffer.fromString(JSON.stringify({
			'test.policy': 'user-value'
		})));

		await testObject.updatePolicyDefinitions({
			'test.policy': { type: 'string' }
		});

		await runWithFakedTimers({ useFakeTimers: true }, async () => {
			await new Promise(resolve => setTimeout(resolve, 600)); // Wait for throttled delayer
		});

		assert.strictEqual(testObject.getPolicyValue('test.policy'), 'user-value');
	});

	test('should prioritize user policies over system policies', async () => {
		await fileService.writeFile(systemPolicyFile, VSBuffer.fromString(JSON.stringify({
			'test.policy': 'system-value'
		})));

		await fileService.writeFile(userPolicyFile, VSBuffer.fromString(JSON.stringify({
			'test.policy': 'user-value'
		})));

		await testObject.updatePolicyDefinitions({
			'test.policy': { type: 'string' }
		});

		await runWithFakedTimers({ useFakeTimers: true }, async () => {
			await new Promise(resolve => setTimeout(resolve, 600)); // Wait for throttled delayer
		});

		assert.strictEqual(testObject.getPolicyValue('test.policy'), 'user-value');
	});

	test('should merge policies from both files', async () => {
		await fileService.writeFile(systemPolicyFile, VSBuffer.fromString(JSON.stringify({
			'system.policy': 'system-value',
			'shared.policy': 'system-shared-value'
		})));

		await fileService.writeFile(userPolicyFile, VSBuffer.fromString(JSON.stringify({
			'user.policy': 'user-value',
			'shared.policy': 'user-shared-value'
		})));

		await testObject.updatePolicyDefinitions({
			'system.policy': { type: 'string' },
			'user.policy': { type: 'string' },
			'shared.policy': { type: 'string' }
		});

		await runWithFakedTimers({ useFakeTimers: true }, async () => {
			await new Promise(resolve => setTimeout(resolve, 600)); // Wait for throttled delayer
		});

		assert.strictEqual(testObject.getPolicyValue('system.policy'), 'system-value');
		assert.strictEqual(testObject.getPolicyValue('user.policy'), 'user-value');
		assert.strictEqual(testObject.getPolicyValue('shared.policy'), 'user-shared-value'); // User takes precedence
	});

	test('should ignore unknown policies', async () => {
		await fileService.writeFile(systemPolicyFile, VSBuffer.fromString(JSON.stringify({
			'known.policy': 'known-value',
			'unknown.policy': 'unknown-value'
		})));

		await testObject.updatePolicyDefinitions({
			'known.policy': { type: 'string' }
		});

		await runWithFakedTimers({ useFakeTimers: true }, async () => {
			await new Promise(resolve => setTimeout(resolve, 600)); // Wait for throttled delayer
		});

		assert.strictEqual(testObject.getPolicyValue('known.policy'), 'known-value');
		assert.strictEqual(testObject.getPolicyValue('unknown.policy'), undefined);
	});

	test('should handle invalid JSON gracefully', async () => {
		await fileService.writeFile(systemPolicyFile, VSBuffer.fromString('invalid json'));

		await testObject.updatePolicyDefinitions({
			'test.policy': { type: 'string' }
		});

		await runWithFakedTimers({ useFakeTimers: true }, async () => {
			await new Promise(resolve => setTimeout(resolve, 600)); // Wait for throttled delayer
		});

		assert.strictEqual(testObject.getPolicyValue('test.policy'), undefined);
	});

	test('should handle non-object JSON gracefully', async () => {
		await fileService.writeFile(systemPolicyFile, VSBuffer.fromString('"not an object"'));

		await testObject.updatePolicyDefinitions({
			'test.policy': { type: 'string' }
		});

		await runWithFakedTimers({ useFakeTimers: true }, async () => {
			await new Promise(resolve => setTimeout(resolve, 600)); // Wait for throttled delayer
		});

		assert.strictEqual(testObject.getPolicyValue('test.policy'), undefined);
	});

	test('should fire change events when policies are updated', async () => {
		await testObject.updatePolicyDefinitions({
			'test.policy': { type: 'string' }
		});

		let changeEventFired = false;
		let changedPolicies: string[] = [];

		testObject.onDidChange(policies => {
			changeEventFired = true;
			changedPolicies = policies;
		});

		await fileService.writeFile(systemPolicyFile, VSBuffer.fromString(JSON.stringify({
			'test.policy': 'new-value'
		})));

		await runWithFakedTimers({ useFakeTimers: true }, async () => {
			await new Promise(resolve => setTimeout(resolve, 600)); // Wait for throttled delayer
		});

		assert.strictEqual(changeEventFired, true);
		assert.deepStrictEqual(changedPolicies, ['test.policy']);
	});
});