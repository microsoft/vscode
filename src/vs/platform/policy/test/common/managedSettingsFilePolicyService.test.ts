/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { VSBuffer } from '../../../../base/common/buffer.js';
import { URI } from '../../../../base/common/uri.js';
import { FileService } from '../../../files/common/fileService.js';
import { IFileService } from '../../../files/common/files.js';
import { InMemoryFileSystemProvider } from '../../../files/common/inMemoryFilesystemProvider.js';
import { NullLogService } from '../../../log/common/log.js';
import { ManagedSettingsFilePolicyService } from '../../common/managedSettingsFilePolicyService.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { PolicyDefinition } from '../../common/policy.js';
import { IStringDictionary } from '../../../../base/common/collections.js';

suite('ManagedSettingsFilePolicyService', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	let fileService: IFileService;
	let service: ManagedSettingsFilePolicyService;
	const policyFile = URI.file('managedSettings').with({ scheme: 'vscode-tests' });

	const policyDefs: IStringDictionary<PolicyDefinition> = {
		ChatToolsAutoApprove: {
			type: 'boolean',
			managedSettingsValue: (data) => data.permissions?.disableBypassPermissionsMode === 'disable' ? false : undefined,
		}
	};

	setup(() => {
		fileService = disposables.add(new FileService(new NullLogService()));
		const provider = disposables.add(new InMemoryFileSystemProvider());
		disposables.add(fileService.registerProvider(policyFile.scheme, provider));
		service = disposables.add(new ManagedSettingsFilePolicyService(policyFile, fileService, new NullLogService()));
	});

	async function writeFile(content: Record<string, unknown>): Promise<void> {
		await fileService.writeFile(policyFile, VSBuffer.fromString(JSON.stringify(content)));
	}

	test('evaluates managedSettingsValue callback to produce policy value', async () => {
		await writeFile({ permissions: { disableBypassPermissionsMode: 'disable' } });
		await service.updatePolicyDefinitions(policyDefs);
		assert.strictEqual(service.getPolicyValue('ChatToolsAutoApprove'), false);
	});

	test('returns undefined when managed settings key is absent', async () => {
		await writeFile({});
		await service.updatePolicyDefinitions(policyDefs);
		assert.strictEqual(service.getPolicyValue('ChatToolsAutoApprove'), undefined);
	});

	test('ignores unknown top-level keys for forward compatibility', async () => {
		await writeFile({ permissions: { disableBypassPermissionsMode: 'disable' }, futureSection: { futureKey: 'v' } });
		await service.updatePolicyDefinitions(policyDefs);
		assert.strictEqual(service.getPolicyValue('ChatToolsAutoApprove'), false);
	});

	test('gracefully handles missing file', async () => {
		await service.updatePolicyDefinitions(policyDefs);
		assert.strictEqual(service.getPolicyValue('ChatToolsAutoApprove'), undefined);
	});

	test('gracefully handles invalid JSON', async () => {
		await fileService.writeFile(policyFile, VSBuffer.fromString('not json'));
		await service.updatePolicyDefinitions(policyDefs);
		assert.strictEqual(service.getPolicyValue('ChatToolsAutoApprove'), undefined);
	});

	test('gracefully handles non-object top-level', async () => {
		await fileService.writeFile(policyFile, VSBuffer.fromString('"just a string"'));
		await service.updatePolicyDefinitions(policyDefs);
		assert.strictEqual(service.getPolicyValue('ChatToolsAutoApprove'), undefined);
	});

	test('callback returning undefined does not emit policy', async () => {
		await writeFile({ permissions: { disableBypassPermissionsMode: 'enable' } });
		await service.updatePolicyDefinitions(policyDefs);
		assert.strictEqual(service.getPolicyValue('ChatToolsAutoApprove'), undefined);
	});

	test('skips policies without managedSettingsValue callback', async () => {
		await writeFile({ permissions: { disableBypassPermissionsMode: 'disable' } });
		await service.updatePolicyDefinitions({ SomeOtherPolicy: { type: 'string' } });
		assert.strictEqual(service.getPolicyValue('SomeOtherPolicy'), undefined);
	});
});
