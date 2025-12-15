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
import { IDefaultAccount } from '../../../../../base/common/defaultAccount.js';
import { PolicyCategory } from '../../../../../base/common/policy.js';

const BASE_DEFAULT_ACCOUNT: IDefaultAccount = {
	enterprise: false,
	sessionId: 'abc123',
};

suite('AccountPolicyService', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	let policyService: AccountPolicyService;
	let defaultAccountService: IDefaultAccountService;
	let policyConfiguration: PolicyConfiguration;
	const logService = new NullLogService();

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

		defaultAccountService = disposables.add(new DefaultAccountService());
		policyService = disposables.add(new AccountPolicyService(logService, defaultAccountService));
		policyConfiguration = disposables.add(new PolicyConfiguration(defaultConfiguration, policyService, new NullLogService()));

	});

	async function assertDefaultBehavior(defaultAccount: IDefaultAccount) {
		defaultAccountService.setDefaultAccount(defaultAccount);

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
			const B = policyConfiguration.configurationModel.getValue('setting.B');
			const C = policyConfiguration.configurationModel.getValue('setting.C');
			const D = policyConfiguration.configurationModel.getValue('setting.D');

			assert.strictEqual(B, undefined);
			assert.deepStrictEqual(C, undefined);
			assert.strictEqual(D, undefined);
		}
	}


	test('should initialize with default account', async () => {
		const defaultAccount = { ...BASE_DEFAULT_ACCOUNT };
		await assertDefaultBehavior(defaultAccount);
	});

	test('should initialize with default account and preview features enabled', async () => {
		const defaultAccount = { ...BASE_DEFAULT_ACCOUNT, chat_preview_features_enabled: true };
		await assertDefaultBehavior(defaultAccount);
	});

	test('should initialize with default account and preview features disabled', async () => {
		const defaultAccount = { ...BASE_DEFAULT_ACCOUNT, chat_preview_features_enabled: false };
		defaultAccountService.setDefaultAccount(defaultAccount);

		await policyConfiguration.initialize();
		const actualConfigurationModel = policyConfiguration.configurationModel;

		{
			const A = policyService.getPolicyValue('PolicySettingA');
			const B = policyService.getPolicyValue('PolicySettingB');
			const C = policyService.getPolicyValue('PolicySettingC');
			const D = policyService.getPolicyValue('PolicySettingD');

			assert.strictEqual(A, undefined); // Not tagged with chat preview tags
			assert.strictEqual(B, 'policyValueB');
			assert.strictEqual(C, JSON.stringify(['policyValueC1', 'policyValueC2']));
			assert.strictEqual(D, false);
		}

		{
			const B = actualConfigurationModel.getValue('setting.B');
			const C = actualConfigurationModel.getValue('setting.C');
			const D = actualConfigurationModel.getValue('setting.D');

			assert.strictEqual(B, 'policyValueB');
			assert.deepStrictEqual(C, ['policyValueC1', 'policyValueC2']);
			assert.strictEqual(D, false);
		}
	});

	test('should provide metadata for account policies', async () => {
		const defaultAccount = { ...BASE_DEFAULT_ACCOUNT, chat_preview_features_enabled: false };
		defaultAccountService.setDefaultAccount(defaultAccount);

		await policyConfiguration.initialize();

		{
			const metadataB = policyService.getPolicyMetadata('PolicySettingB');
			const metadataC = policyService.getPolicyMetadata('PolicySettingC');
			const metadataD = policyService.getPolicyMetadata('PolicySettingD');

			assert.ok(metadataB, 'Metadata should exist for PolicySettingB');
			assert.strictEqual(metadataB.source, 'account');
			assert.strictEqual(metadataB.accountSessionId, 'abc123');

			assert.ok(metadataC, 'Metadata should exist for PolicySettingC');
			assert.strictEqual(metadataC.source, 'account');
			assert.strictEqual(metadataC.accountSessionId, 'abc123');

			assert.ok(metadataD, 'Metadata should exist for PolicySettingD');
			assert.strictEqual(metadataD.source, 'account');
			assert.strictEqual(metadataD.accountSessionId, 'abc123');
		}

		{
			// Metadata should not exist for non-active policies
			const metadataA = policyService.getPolicyMetadata('PolicySettingA');
			assert.strictEqual(metadataA, undefined);
		}
	});

	test('should update metadata when account changes', async () => {
		const defaultAccount1 = { ...BASE_DEFAULT_ACCOUNT, sessionId: 'session1', chat_preview_features_enabled: false };
		defaultAccountService.setDefaultAccount(defaultAccount1);

		await policyConfiguration.initialize();

		const metadataB1 = policyService.getPolicyMetadata('PolicySettingB');
		assert.ok(metadataB1);
		assert.strictEqual(metadataB1.accountSessionId, 'session1');

		// Change account
		const defaultAccount2 = { ...BASE_DEFAULT_ACCOUNT, sessionId: 'session2', chat_preview_features_enabled: false };
		defaultAccountService.setDefaultAccount(defaultAccount2);

		// Wait for policy update
		await new Promise(resolve => setTimeout(resolve, 100));

		const metadataB2 = policyService.getPolicyMetadata('PolicySettingB');
		assert.ok(metadataB2);
		assert.strictEqual(metadataB2.accountSessionId, 'session2');
	});
});
