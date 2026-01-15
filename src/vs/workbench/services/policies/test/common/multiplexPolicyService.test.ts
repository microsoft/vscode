/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { NullLogService } from '../../../../../platform/log/common/log.js';
import { IDefaultAccountService } from '../../../../../platform/defaultAccount/common/defaultAccount.js';
import { DefaultAccountService } from '../../../accounts/common/defaultAccount.js';
import { AccountPolicyService } from '../../common/accountPolicyService.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { Registry } from '../../../../../platform/registry/common/platform.js';
import { Extensions, IConfigurationNode, IConfigurationRegistry } from '../../../../../platform/configuration/common/configurationRegistry.js';
import { DefaultConfiguration, PolicyConfiguration } from '../../../../../platform/configuration/common/configurations.js';
import { MultiplexPolicyService } from '../../common/multiplexPolicyService.js';
import { FilePolicyService } from '../../../../../platform/policy/common/filePolicyService.js';
import { URI } from '../../../../../base/common/uri.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import { InMemoryFileSystemProvider } from '../../../../../platform/files/common/inMemoryFilesystemProvider.js';
import { FileService } from '../../../../../platform/files/common/fileService.js';
import { VSBuffer } from '../../../../../base/common/buffer.js';
import { IDefaultAccount } from '../../../../../base/common/defaultAccount.js';
import { PolicyCategory } from '../../../../../base/common/policy.js';

const BASE_DEFAULT_ACCOUNT: IDefaultAccount = {
	enterprise: false,
	sessionId: 'abc123',
};

suite('MultiplexPolicyService', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	let policyService: MultiplexPolicyService;
	let fileService: IFileService;
	let defaultAccountService: IDefaultAccountService;
	let policyConfiguration: PolicyConfiguration;
	const logService = new NullLogService();

	const policyFile = URI.file('policyFile').with({ scheme: 'vscode-tests' });
	const policyConfigurationNode: IConfigurationNode = {
		'id': 'policyConfiguration',
		'order': 1,
		'title': 'a',
		'type': 'object',
		'properties': {
			'setting.A': {
				'type': 'string',
				'default': 'defaultValueA',
				policy: {
					name: 'PolicySettingA',
					category: PolicyCategory.Extensions,
					minimumVersion: '1.0.0',
					localization: { description: { key: '', value: '' } }
				}
			},
			'setting.B': {
				'type': 'string',
				'default': 'defaultValueB',
				policy: {
					name: 'PolicySettingB',
					category: PolicyCategory.Extensions,
					minimumVersion: '1.0.0',
					localization: { description: { key: '', value: '' } },
					value: account => account.chat_preview_features_enabled === false ? 'policyValueB' : undefined,
				}
			},
			'setting.C': {
				'type': 'array',
				'default': ['defaultValueC1', 'defaultValueC2'],
				policy: {
					name: 'PolicySettingC',
					category: PolicyCategory.Extensions,
					minimumVersion: '1.0.0',
					localization: { description: { key: '', value: '' } },
					value: account => account.chat_preview_features_enabled === false ? JSON.stringify(['policyValueC1', 'policyValueC2']) : undefined,
				}
			},
			'setting.D': {
				'type': 'boolean',
				'default': true,
				policy: {
					name: 'PolicySettingD',
					category: PolicyCategory.Extensions,
					minimumVersion: '1.0.0',
					localization: { description: { key: '', value: '' } },
					value: account => account.chat_preview_features_enabled === false ? false : undefined,
				}
			},
			'setting.E': {
				'type': 'boolean',
				'default': true,
			}
		}
	};


	suiteSetup(() => Registry.as<IConfigurationRegistry>(Extensions.Configuration).registerConfiguration(policyConfigurationNode));
	suiteTeardown(() => Registry.as<IConfigurationRegistry>(Extensions.Configuration).deregisterConfigurations([policyConfigurationNode]));

	setup(async () => {
		const defaultConfiguration = disposables.add(new DefaultConfiguration(new NullLogService()));
		await defaultConfiguration.initialize();

		fileService = disposables.add(new FileService(new NullLogService()));
		const diskFileSystemProvider = disposables.add(new InMemoryFileSystemProvider());
		disposables.add(fileService.registerProvider(policyFile.scheme, diskFileSystemProvider));

		defaultAccountService = disposables.add(new DefaultAccountService());
		policyService = disposables.add(new MultiplexPolicyService([
			disposables.add(new FilePolicyService(policyFile, fileService, new NullLogService())),
			disposables.add(new AccountPolicyService(logService, defaultAccountService)),
		], logService));
		policyConfiguration = disposables.add(new PolicyConfiguration(defaultConfiguration, policyService, new NullLogService()));
	});

	async function clear() {
		// Reset
		defaultAccountService.setDefaultAccount({ ...BASE_DEFAULT_ACCOUNT });
		await fileService.writeFile(policyFile,
			VSBuffer.fromString(
				JSON.stringify({})
			)
		);
	}

	test('no policy', async () => {
		await clear();

		await policyConfiguration.initialize();

		{
			const A = policyService.getPolicyValue('PolicySettingA');
			const B = policyService.getPolicyValue('PolicySettingB');
			const C = policyService.getPolicyValue('PolicySettingC');
			const D = policyService.getPolicyValue('PolicySettingD');

			// No policy is set
			assert.strictEqual(A, undefined);
			assert.strictEqual(B, undefined);
			assert.strictEqual(C, undefined);
			assert.strictEqual(D, undefined);
		}

		{
			const A = policyConfiguration.configurationModel.getValue('setting.A');
			const B = policyConfiguration.configurationModel.getValue('setting.B');
			const C = policyConfiguration.configurationModel.getValue('setting.C');
			const D = policyConfiguration.configurationModel.getValue('setting.D');
			const E = policyConfiguration.configurationModel.getValue('setting.E');

			assert.strictEqual(A, undefined);
			assert.strictEqual(B, undefined);
			assert.deepStrictEqual(C, undefined);
			assert.strictEqual(D, undefined);
			assert.strictEqual(E, undefined);
		}
	});

	test('policy from file only', async () => {
		await clear();

		const defaultAccount = { ...BASE_DEFAULT_ACCOUNT };
		defaultAccountService.setDefaultAccount(defaultAccount);

		await fileService.writeFile(policyFile,
			VSBuffer.fromString(
				JSON.stringify({ 'PolicySettingA': 'policyValueA' })
			)
		);

		await policyConfiguration.initialize();

		{
			const A = policyService.getPolicyValue('PolicySettingA');
			const B = policyService.getPolicyValue('PolicySettingB');
			const C = policyService.getPolicyValue('PolicySettingC');
			const D = policyService.getPolicyValue('PolicySettingD');

			assert.strictEqual(A, 'policyValueA');
			assert.strictEqual(B, undefined);
			assert.strictEqual(C, undefined);
			assert.strictEqual(D, undefined);
		}

		{
			const A = policyConfiguration.configurationModel.getValue('setting.A');
			const B = policyConfiguration.configurationModel.getValue('setting.B');
			const C = policyConfiguration.configurationModel.getValue('setting.C');
			const D = policyConfiguration.configurationModel.getValue('setting.D');
			const E = policyConfiguration.configurationModel.getValue('setting.E');

			assert.strictEqual(A, 'policyValueA');
			assert.strictEqual(B, undefined);
			assert.deepStrictEqual(C, undefined);
			assert.strictEqual(D, undefined);
			assert.strictEqual(E, undefined);
		}
	});

	test('policy from default account only', async () => {
		await clear();

		const defaultAccount = { ...BASE_DEFAULT_ACCOUNT, chat_preview_features_enabled: false };
		defaultAccountService.setDefaultAccount(defaultAccount);

		await fileService.writeFile(policyFile,
			VSBuffer.fromString(
				JSON.stringify({})
			)
		);

		await policyConfiguration.initialize();
		const actualConfigurationModel = policyConfiguration.configurationModel;

		{
			const A = policyService.getPolicyValue('PolicySettingA');
			const B = policyService.getPolicyValue('PolicySettingB');
			const C = policyService.getPolicyValue('PolicySettingC');
			const D = policyService.getPolicyValue('PolicySettingD');

			assert.strictEqual(A, undefined); // Not tagged with preview tags
			assert.strictEqual(B, 'policyValueB');
			assert.strictEqual(C, JSON.stringify(['policyValueC1', 'policyValueC2']));
			assert.strictEqual(D, false);
		}

		{
			const A = policyConfiguration.configurationModel.getValue('setting.A');
			const B = actualConfigurationModel.getValue('setting.B');
			const C = actualConfigurationModel.getValue('setting.C');
			const D = actualConfigurationModel.getValue('setting.D');

			assert.strictEqual(A, undefined);
			assert.strictEqual(B, 'policyValueB');
			assert.deepStrictEqual(C, ['policyValueC1', 'policyValueC2']);
			assert.strictEqual(D, false);
		}
	});

	test('policy from file and default account', async () => {
		await clear();

		const defaultAccount = { ...BASE_DEFAULT_ACCOUNT, chat_preview_features_enabled: false };
		defaultAccountService.setDefaultAccount(defaultAccount);

		await fileService.writeFile(policyFile,
			VSBuffer.fromString(
				JSON.stringify({ 'PolicySettingA': 'policyValueA' })
			)
		);

		await policyConfiguration.initialize();
		const actualConfigurationModel = policyConfiguration.configurationModel;

		{
			const A = policyService.getPolicyValue('PolicySettingA');
			const B = policyService.getPolicyValue('PolicySettingB');
			const C = policyService.getPolicyValue('PolicySettingC');
			const D = policyService.getPolicyValue('PolicySettingD');

			assert.strictEqual(A, 'policyValueA');
			assert.strictEqual(B, 'policyValueB');
			assert.strictEqual(C, JSON.stringify(['policyValueC1', 'policyValueC2']));
			assert.strictEqual(D, false);
		}

		{
			const A = actualConfigurationModel.getValue('setting.A');
			const B = actualConfigurationModel.getValue('setting.B');
			const C = actualConfigurationModel.getValue('setting.C');
			const D = actualConfigurationModel.getValue('setting.D');

			assert.strictEqual(A, 'policyValueA');
			assert.strictEqual(B, 'policyValueB');
			assert.deepStrictEqual(C, ['policyValueC1', 'policyValueC2']);
			assert.strictEqual(D, false);
		}
	});
});
