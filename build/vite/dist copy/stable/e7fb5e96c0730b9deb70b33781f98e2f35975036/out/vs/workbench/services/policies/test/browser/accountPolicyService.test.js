/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { Event } from '../../../../../base/common/event.js';
import { PolicyCategory } from '../../../../../base/common/policy.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { Extensions } from '../../../../../platform/configuration/common/configurationRegistry.js';
import { DefaultConfiguration, PolicyConfiguration } from '../../../../../platform/configuration/common/configurations.js';
import { NullLogService } from '../../../../../platform/log/common/log.js';
import { Registry } from '../../../../../platform/registry/common/platform.js';
import { TestProductService } from '../../../../test/common/workbenchTestServices.js';
import { DefaultAccountService } from '../../../accounts/browser/defaultAccount.js';
import { AccountPolicyService } from '../../common/accountPolicyService.js';
const BASE_DEFAULT_ACCOUNT = {
    authenticationProvider: {
        id: 'github',
        name: 'GitHub',
        enterprise: false,
    },
    accountName: 'testuser',
    sessionId: 'abc123',
    enterprise: false,
};
class DefaultAccountProvider {
    constructor(defaultAccount, policyData = {}) {
        this.defaultAccount = defaultAccount;
        this.policyData = policyData;
        this.onDidChangeDefaultAccount = Event.None;
        this.onDidChangePolicyData = Event.None;
        this.copilotTokenInfo = null;
        this.onDidChangeCopilotTokenInfo = Event.None;
    }
    getDefaultAccountAuthenticationProvider() {
        return this.defaultAccount.authenticationProvider;
    }
    async refresh() {
        return this.defaultAccount;
    }
    async signIn() {
        return null;
    }
    async signOut() { }
}
suite('AccountPolicyService', () => {
    const disposables = ensureNoDisposablesAreLeakedInTestSuite();
    let policyService;
    let defaultAccountService;
    let policyConfiguration;
    const logService = new NullLogService();
    const policyConfigurationNode = {
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
                    value: policyData => policyData.chat_preview_features_enabled === false ? 'policyValueB' : undefined,
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
                    value: policyData => policyData.chat_preview_features_enabled === false ? JSON.stringify(['policyValueC1', 'policyValueC2']) : undefined,
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
                    value: policyData => policyData.chat_preview_features_enabled === false ? false : undefined,
                }
            },
            'setting.E': {
                'type': 'boolean',
                'default': true,
            }
        }
    };
    suiteSetup(() => Registry.as(Extensions.Configuration).registerConfiguration(policyConfigurationNode));
    suiteTeardown(() => Registry.as(Extensions.Configuration).deregisterConfigurations([policyConfigurationNode]));
    setup(async () => {
        const defaultConfiguration = disposables.add(new DefaultConfiguration(new NullLogService()));
        await defaultConfiguration.initialize();
        defaultAccountService = disposables.add(new DefaultAccountService(TestProductService));
        policyService = disposables.add(new AccountPolicyService(logService, defaultAccountService));
        policyConfiguration = disposables.add(new PolicyConfiguration(defaultConfiguration, policyService, new NullLogService()));
    });
    async function assertDefaultBehavior(policyData) {
        defaultAccountService.setDefaultAccountProvider(new DefaultAccountProvider(BASE_DEFAULT_ACCOUNT, policyData));
        await defaultAccountService.refresh();
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
        await assertDefaultBehavior(undefined);
    });
    test('should initialize with default account and preview features enabled', async () => {
        await assertDefaultBehavior({ chat_preview_features_enabled: true });
    });
    test('should initialize with default account and preview features disabled', async () => {
        const policyData = { chat_preview_features_enabled: false };
        defaultAccountService.setDefaultAccountProvider(new DefaultAccountProvider(BASE_DEFAULT_ACCOUNT, policyData));
        await defaultAccountService.refresh();
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
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYWNjb3VudFBvbGljeVNlcnZpY2UudGVzdC5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9zZXJ2aWNlcy9wb2xpY2llcy90ZXN0L2Jyb3dzZXIvYWNjb3VudFBvbGljeVNlcnZpY2UudGVzdC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRyxPQUFPLE1BQU0sTUFBTSxRQUFRLENBQUM7QUFFNUIsT0FBTyxFQUFFLEtBQUssRUFBRSxNQUFNLHFDQUFxQyxDQUFDO0FBQzVELE9BQU8sRUFBRSxjQUFjLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUN0RSxPQUFPLEVBQUUsdUNBQXVDLEVBQUUsTUFBTSwwQ0FBMEMsQ0FBQztBQUNuRyxPQUFPLEVBQUUsVUFBVSxFQUE4QyxNQUFNLHVFQUF1RSxDQUFDO0FBQy9JLE9BQU8sRUFBRSxvQkFBb0IsRUFBRSxtQkFBbUIsRUFBRSxNQUFNLGdFQUFnRSxDQUFDO0FBRTNILE9BQU8sRUFBRSxjQUFjLEVBQUUsTUFBTSwyQ0FBMkMsQ0FBQztBQUMzRSxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0scURBQXFELENBQUM7QUFDL0UsT0FBTyxFQUFFLGtCQUFrQixFQUFFLE1BQU0sa0RBQWtELENBQUM7QUFDdEYsT0FBTyxFQUFFLHFCQUFxQixFQUFFLE1BQU0sNkNBQTZDLENBQUM7QUFDcEYsT0FBTyxFQUFFLG9CQUFvQixFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFFNUUsTUFBTSxvQkFBb0IsR0FBb0I7SUFDN0Msc0JBQXNCLEVBQUU7UUFDdkIsRUFBRSxFQUFFLFFBQVE7UUFDWixJQUFJLEVBQUUsUUFBUTtRQUNkLFVBQVUsRUFBRSxLQUFLO0tBQ2pCO0lBQ0QsV0FBVyxFQUFFLFVBQVU7SUFDdkIsU0FBUyxFQUFFLFFBQVE7SUFDbkIsVUFBVSxFQUFFLEtBQUs7Q0FDakIsQ0FBQztBQUVG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