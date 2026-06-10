/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { VSBuffer } from '../../../../base/common/buffer.js';
import { COPILOT_MANAGED_SETTINGS_AUTO_APPROVE_POLICY } from '../../../../base/common/copilotPolicy.js';
import { URI } from '../../../../base/common/uri.js';
import { FileService } from '../../../files/common/fileService.js';
import { IFileService } from '../../../files/common/files.js';
import { InMemoryFileSystemProvider } from '../../../files/common/inMemoryFilesystemProvider.js';
import { NullLogService } from '../../../log/common/log.js';
import { ManagedSettingsFilePolicyService } from '../../common/managedSettingsFilePolicyService.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';

suite('ManagedSettingsFilePolicyService', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	let fileService: IFileService;
	let service: ManagedSettingsFilePolicyService;
	const policyFile = URI.file('managedSettings').with({ scheme: 'vscode-tests' });

	setup(() => {
		fileService = disposables.add(new FileService(new NullLogService()));
		const provider = disposables.add(new InMemoryFileSystemProvider());
		disposables.add(fileService.registerProvider(policyFile.scheme, provider));
		service = disposables.add(new ManagedSettingsFilePolicyService(policyFile, fileService, new NullLogService()));
	});

	async function writeFile(content: Record<string, unknown>): Promise<void> {
		await fileService.writeFile(policyFile, VSBuffer.fromString(JSON.stringify(content)));
	}

	test('transforms permissions.disableBypassPermissionsMode to ChatToolsAutoApprove=false', async () => {
		await writeFile({
			permissions: {
				disableBypassPermissionsMode: 'disable'
			}
		});

		await service.updatePolicyDefinitions({
			[COPILOT_MANAGED_SETTINGS_AUTO_APPROVE_POLICY]: { type: 'string' }
		});

		assert.strictEqual(
			service.getPolicyValue(COPILOT_MANAGED_SETTINGS_AUTO_APPROVE_POLICY),
			false
		);
	});

	test('returns undefined for unset keys', async () => {
		await writeFile({});

		await service.updatePolicyDefinitions({
			[COPILOT_MANAGED_SETTINGS_AUTO_APPROVE_POLICY]: { type: 'string' }
		});

		assert.strictEqual(
			service.getPolicyValue(COPILOT_MANAGED_SETTINGS_AUTO_APPROVE_POLICY),
			undefined
		);
	});

	test('ignores unknown top-level keys for forward compatibility', async () => {
		await writeFile({
			permissions: {
				disableBypassPermissionsMode: 'disable'
			},
			futureSection: {
				futureKey: 'futureValue'
			}
		});

		await service.updatePolicyDefinitions({
			[COPILOT_MANAGED_SETTINGS_AUTO_APPROVE_POLICY]: { type: 'string' }
		});

		assert.strictEqual(
			service.getPolicyValue(COPILOT_MANAGED_SETTINGS_AUTO_APPROVE_POLICY),
			false
		);
	});

	test('gracefully handles missing file', async () => {
		await service.updatePolicyDefinitions({
			[COPILOT_MANAGED_SETTINGS_AUTO_APPROVE_POLICY]: { type: 'string' }
		});

		assert.strictEqual(
			service.getPolicyValue(COPILOT_MANAGED_SETTINGS_AUTO_APPROVE_POLICY),
			undefined
		);
	});

	test('gracefully handles invalid JSON', async () => {
		await fileService.writeFile(policyFile, VSBuffer.fromString('not json'));

		await service.updatePolicyDefinitions({
			[COPILOT_MANAGED_SETTINGS_AUTO_APPROVE_POLICY]: { type: 'string' }
		});

		assert.strictEqual(
			service.getPolicyValue(COPILOT_MANAGED_SETTINGS_AUTO_APPROVE_POLICY),
			undefined
		);
	});

	test('gracefully handles non-object top-level', async () => {
		await fileService.writeFile(policyFile, VSBuffer.fromString('"just a string"'));

		await service.updatePolicyDefinitions({
			[COPILOT_MANAGED_SETTINGS_AUTO_APPROVE_POLICY]: { type: 'string' }
		});

		assert.strictEqual(
			service.getPolicyValue(COPILOT_MANAGED_SETTINGS_AUTO_APPROVE_POLICY),
			undefined
		);
	});

	test('does not emit policy for non-disable values', async () => {
		await writeFile({
			permissions: {
				disableBypassPermissionsMode: 'enable'
			}
		});

		await service.updatePolicyDefinitions({
			[COPILOT_MANAGED_SETTINGS_AUTO_APPROVE_POLICY]: { type: 'string' }
		});

		assert.strictEqual(
			service.getPolicyValue(COPILOT_MANAGED_SETTINGS_AUTO_APPROVE_POLICY),
			undefined
		);
	});
});
