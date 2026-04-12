/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { Event } from '../../../../base/common/event.js';
import { URI } from '../../../../base/common/uri.js';
import { DefaultConfiguration, PolicyConfiguration } from '../../common/configurations.js';
import { FileService } from '../../../files/common/fileService.js';
import { InMemoryFileSystemProvider } from '../../../files/common/inMemoryFilesystemProvider.js';
import { NullLogService } from '../../../log/common/log.js';
import { Extensions } from '../../common/configurationRegistry.js';
import { Registry } from '../../../registry/common/platform.js';
import { VSBuffer } from '../../../../base/common/buffer.js';
import { deepClone } from '../../../../base/common/objects.js';
import { FilePolicyService } from '../../../policy/common/filePolicyService.js';
import { runWithFakedTimers } from '../../../../base/test/common/timeTravelScheduler.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { PolicyCategory } from '../../../../base/common/policy.js';
suite('PolicyConfiguration', () => {
    const disposables = ensureNoDisposablesAreLeakedInTestSuite();
    let testObject;
    let fileService;
    let policyService;
    const policyFile = URI.file('policyFile').with({ scheme: 'vscode-tests' });
    const policyConfigurationNode = {
        'id': 'policyConfiguration',
        'order': 1,
        'title': 'a',
        'type': 'object',
        'properties': {
            'policy.settingA': {
                'type': 'string',
                'default': 'defaultValueA',
                policy: {
                    name: 'PolicySettingA',
                    category: PolicyCategory.Extensions,
                    minimumVersion: '1.0.0',
                    localization: { description: { key: '', value: '' }, }
                }
            },
            'policy.settingB': {
                'type': 'string',
                'default': 'defaultValueB',
                policy: {
                    name: 'PolicySettingB',
                    category: PolicyCategory.Extensions,
                    minimumVersion: '1.0.0',
                    localization: { description: { key: '', value: '' }, }
                }
            },
            'policy.objectSetting': {
                'type': 'object',
                'default': {},
                policy: {
                    name: 'PolicyObjectSetting',
                    category: PolicyCategory.Extensions,
                    minimumVersion: '1.0.0',
                    localization: { description: { key: '', value: '' }, }
                }
            },
            'policy.arraySetting': {
                'type': 'object',
                'default': [],
                policy: {
                    name: 'PolicyArraySetting',
                    category: PolicyCategory.Extensions,
                    minimumVersion: '1.0.0',
                    localization: { description: { key: '', value: '' }, }
                }
            },
            'policy.booleanSetting': {
                'type': 'boolean',
                'default': true,
                policy: {
                    name: 'PolicyBooleanSetting',
                    category: PolicyCategory.Extensions,
                    minimumVersion: '1.0.0',
                    localization: { description: { key: '', value: '' }, }
                }
            },
            'policy.internalSetting': {
                'type': 'string',
                'default': 'defaultInternalValue',
                included: false,
                policy: {
                    name: 'PolicyInternalSetting',
                    category: PolicyCategory.Extensions,
                    minimumVersion: '1.0.0',
                    localization: { description: { key: '', value: '' }, }
                }
            },
            'nonPolicy.setting': {
                'type': 'boolean',
                'default': true
            }
        }
    };
    suiteSetup(() => Registry.as(Extensions.Configuration).registerConfiguration(policyConfigurationNode));
    suiteTeardown(() => Registry.as(Extensions.Configuration).deregisterConfigurations([policyConfigurationNode]));
    setup(async () => {
        const defaultConfiguration = disposables.add(new DefaultConfiguration(new NullLogService()));
        await defaultConfiguration.initialize();
        fileService = disposables.add(new FileService(new NullLogService()));
        const diskFileSystemProvider = disposables.add(new InMemoryFileSystemProvider());
        disposables.add(fileService.registerProvider(policyFile.scheme, diskFileSystemProvider));
        policyService = disposables.add(new FilePolicyService(policyFile, fileService, new NullLogService()));
        testObject = disposables.add(new PolicyConfiguration(defaultConfiguration, policyService, new NullLogService()));
    });
    test('initialize: with policies', async () => {
        await fileService.writeFile(policyFile, VSBuffer.fromString(JSON.stringify({ 'PolicySettingA': 'policyValueA' })));
        await testObject.initialize();
        const acutal = testObject.configurationModel;
        assert.strictEqual(acutal.getValue('policy.settingA'), 'policyValueA');
        assert.strictEqual(acutal.getValue('policy.settingB'), undefined);
        assert.strictEqual(acutal.getValue('nonPolicy.setting'), undefined);
        assert.deepStrictEqual(acutal.keys, ['policy.settingA']);
        assert.deepStrictEqual(acutal.overrides, []);
    });
    test('initialize: no policies', async () => {
        await testObject.initialize();
        const acutal = testObject.configurationModel;
        assert.deepStrictEqual(acutal.keys, []);
        assert.deepStrictEqual(acutal.overrides, []);
        assert.strictEqual(acutal.getValue('policy.settingA'), undefined);
        assert.strictEqual(acutal.getValue('policy.settingB'), undefined);
        assert.strictEqual(acutal.getValue('nonPolicy.setting'), undefined);
    });
    test('initialize: with policies but not registered', async () => {
        await fileService.writeFile(policyFile, VSBuffer.fromString(JSON.stringify({ 'PolicySettingA': 'policyValueA', 'PolicySettingB': 'policyValueB', 'PolicySettingC': 'policyValueC' })));
        await testObject.initialize();
        const acutal = testObject.configurationModel;
        assert.strictEqual(acutal.getValue('policy.settingA'), 'policyValueA');
        assert.strictEqual(acutal.getValue('policy.settingB'), 'policyValueB');
        assert.strictEqual(acutal.getValue('nonPolicy.setting'), undefined);
        assert.deepStrictEqual(acutal.keys, ['policy.settingA', 'policy.settingB']);
        assert.deepStrictEqual(acutal.overrides, []);
    });
    test('initialize: with object type policy', async () => {
        const expected = {
            'microsoft': true,
            'github': 'stable',
            'other': 1,
            'complex': {
                'key': 'value'
            },
            'array': [1, 2, 3]
        };
        await fileService.writeFile(policyFile, VSBuffer.fromString(JSON.stringify({ 'PolicyObjectSetting': JSON.stringify(expected) })));
        await testObject.initialize();
        const acutal = testObject.configurationModel;
        assert.deepStrictEqual(acutal.getValue('policy.objectSetting'), expected);
    });
    test('initialize: with array type policy', async () => {
        await fileService.writeFile(policyFile, VSBuffer.fromString(JSON.stringify({ 'PolicyArraySetting': JSON.stringify([1]) })));
        await testObject.initialize();
        const acutal = testObject.configurationModel;
        assert.deepStrictEqual(acutal.getValue('policy.arraySetting'), [1]);
    });
    test('initialize: with boolean type policy as false', async () => {
        await fileService.writeFile(policyFile, VSBuffer.fromString(JSON.stringify({ 'PolicyBooleanSetting': false })));
        await testObject.initialize();
        const acutal = testObject.configurationModel;
        assert.deepStrictEqual(acutal.getValue('policy.booleanSetting'), false);
    });
    test('initialize: with boolean type policy as true', async () => {
        await fileService.writeFile(policyFile, VSBuffer.fromString(JSON.stringify({ 'PolicyBooleanSetting': true })));
        await testObject.initialize();
        const acutal = testObject.configurationModel;
        assert.deepStrictEqual(acutal.getValue('policy.booleanSetting'), true);
    });
    test('initialize: with object type policy ignores policy if value is not valid', async () => {
        await fileService.writeFile(policyFile, VSBuffer.fromString(JSON.stringify({ 'PolicyObjectSetting': '{"a": "b", "hello": }' })));
        await testObject.initialize();
        const acutal = testObject.configurationModel;
        assert.deepStrictEqual(acutal.getValue('policy.objectSetting'), undefined);
    });
    test('initialize: with object type policy ignores policy if there are duplicate keys', async () => {
        await fileService.writeFile(policyFile, VSBuffer.fromString(JSON.stringify({ 'PolicyObjectSetting': '{"microsoft": true, "microsoft": false }' })));
        await testObject.initialize();
        const acutal = testObject.configurationModel;
        assert.deepStrictEqual(acutal.getValue('policy.objectSetting'), undefined);
    });
    test('change: when policy is added', async () => {
        await fileService.writeFile(policyFile, VSBuffer.fromString(JSON.stringify({ 'PolicySettingA': 'policyValueA' })));
        await testObject.initialize();
        await runWithFakedTimers({ useFakeTimers: true }, async () => {
            const promise = Event.toPromise(testObject.onDidChangeConfiguration);
            await fileService.writeFile(policyFile, VSBuffer.fromString(JSON.stringify({ 'PolicySettingA': 'policyValueA', 'PolicySettingB': 'policyValueB', 'PolicySettingC': 'policyValueC' })));
            await promise;
        });
        const acutal = testObject.configurationModel;
        assert.strictEqual(acutal.getValue('policy.settingA'), 'policyValueA');
        assert.strictEqual(acutal.getValue('policy.settingB'), 'policyValueB');
        assert.strictEqual(acutal.getValue('nonPolicy.setting'), undefined);
        assert.deepStrictEqual(acutal.keys, ['policy.settingA', 'policy.settingB']);
        assert.deepStrictEqual(acutal.overrides, []);
    });
    test('change: when policy is updated', async () => {
        await fileService.writeFile(policyFile, VSBuffer.fromString(JSON.stringify({ 'PolicySettingA': 'policyValueA' })));
        await testObject.initialize();
        await runWithFakedTimers({ useFakeTimers: true }, async () => {
            const promise = Event.toPromise(testObject.onDidChangeConfiguration);
            await fileService.writeFile(policyFile, VSBuffer.fromString(JSON.stringify({ 'PolicySettingA': 'policyValueAChanged' })));
            await promise;
        });
        const acutal = testObject.configurationModel;
        assert.strictEqual(acutal.getValue('policy.settingA'), 'policyValueAChanged');
        assert.strictEqual(acutal.getValue('policy.settingB'), undefined);
        assert.strictEqual(acutal.getValue('nonPolicy.setting'), undefined);
        assert.deepStrictEqual(acutal.keys, ['policy.settingA']);
        assert.deepStrictEqual(acutal.overrides, []);
    });
    test('change: when policy is removed', async () => {
        await fileService.writeFile(policyFile, VSBuffer.fromString(JSON.stringify({ 'PolicySettingA': 'policyValueA' })));
        await testObject.initialize();
        await runWithFakedTimers({ useFakeTimers: true }, async () => {
            const promise = Event.toPromise(testObject.onDidChangeConfiguration);
            await fileService.writeFile(policyFile, VSBuffer.fromString(JSON.stringify({})));
            await promise;
        });
        const acutal = testObject.configurationModel;
        assert.strictEqual(acutal.getValue('policy.settingA'), undefined);
        assert.strictEqual(acutal.getValue('policy.settingB'), undefined);
        assert.strictEqual(acutal.getValue('nonPolicy.setting'), undefined);
        assert.deepStrictEqual(acutal.keys, []);
        assert.deepStrictEqual(acutal.overrides, []);
    });
    test('change: when policy setting is registered', async () => {
        await fileService.writeFile(policyFile, VSBuffer.fromString(JSON.stringify({ 'PolicySettingC': 'policyValueC' })));
        await testObject.initialize();
        const promise = Event.toPromise(testObject.onDidChangeConfiguration);
        policyConfigurationNode.properties['policy.settingC'] = {
            'type': 'string',
            'default': 'defaultValueC',
            policy: {
                name: 'PolicySettingC',
                category: PolicyCategory.Extensions,
                minimumVersion: '1.0.0',
                localization: { description: { key: '', value: '' }, },
            }
        };
        Registry.as(Extensions.Configuration).registerConfiguration(deepClone(policyConfigurationNode));
        await promise;
        const acutal = testObject.configurationModel;
        assert.strictEqual(acutal.getValue('policy.settingC'), 'policyValueC');
        assert.strictEqual(acutal.getValue('policy.settingA'), undefined);
        assert.strictEqual(acutal.getValue('policy.settingB'), undefined);
        assert.strictEqual(acutal.getValue('nonPolicy.setting'), undefined);
        assert.deepStrictEqual(acutal.keys, ['policy.settingC']);
        assert.deepStrictEqual(acutal.overrides, []);
    });
    test('change: when policy setting is deregistered', async () => {
        await fileService.writeFile(policyFile, VSBuffer.fromString(JSON.stringify({ 'PolicySettingA': 'policyValueA' })));
        await testObject.initialize();
        const promise = Event.toPromise(testObject.onDidChangeConfiguration);
        Registry.as(Extensions.Configuration).deregisterConfigurations([policyConfigurationNode]);
        await promise;
        const acutal = testObject.configurationModel;
        assert.strictEqual(acutal.getValue('policy.settingA'), undefined);
        assert.strictEqual(acutal.getValue('policy.settingB'), undefined);
        assert.strictEqual(acutal.getValue('nonPolicy.setting'), undefined);
        assert.deepStrictEqual(acutal.keys, []);
        assert.deepStrictEqual(acutal.overrides, []);
    });
    test('initialize: with internal policies', async () => {
        await fileService.writeFile(policyFile, VSBuffer.fromString(JSON.stringify({ 'PolicyInternalSetting': 'internalValue' })));
        await testObject.initialize();
        const acutal = testObject.configurationModel;
        assert.strictEqual(acutal.getValue('policy.settingA'), undefined);
        assert.strictEqual(acutal.getValue('policy.settingB'), undefined);
        assert.strictEqual(acutal.getValue('policy.internalSetting'), 'internalValue');
        assert.strictEqual(acutal.getValue('nonPolicy.setting'), undefined);
        assert.deepStrictEqual(acutal.keys, ['policy.internalSetting']);
        assert.deepStrictEqual(acutal.overrides, []);
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicG9saWN5Q29uZmlndXJhdGlvbi50ZXN0LmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvcGxhdGZvcm0vY29uZmlndXJhdGlvbi90ZXN0L2NvbW1vbi9wb2xpY3lDb25maWd1cmF0aW9uLnRlc3QudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxNQUFNLE1BQU0sUUFBUSxDQUFDO0FBQzVCLE9BQU8sRUFBRSxLQUFLLEVBQUUsTUFBTSxrQ0FBa0MsQ0FBQztBQUN6RCxPQUFPLEVBQUUsR0FBRyxFQUFFLE1BQU0sZ0NBQWdDLENBQUM7QUFDckQsT0FBTyxFQUFFLG9CQUFvQixFQUFFLG1CQUFtQixFQUFFLE1BQU0sZ0NBQWdDLENBQUM7QUFFM0YsT0FBTyxFQUFFLFdBQVcsRUFBRSxNQUFNLHNDQUFzQyxDQUFDO0FBQ25FLE9BQU8sRUFBRSwwQkFBMEIsRUFBRSxNQUFNLHFEQUFxRCxDQUFDO0FBQ2pHLE9BQU8sRUFBRSxjQUFjLEVBQUUsTUFBTSw0QkFBNEIsQ0FBQztBQUM1RCxPQUFPLEVBQUUsVUFBVSxFQUE4QyxNQUFNLHVDQUF1QyxDQUFDO0FBQy9HLE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUNoRSxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sbUNBQW1DLENBQUM7QUFDN0QsT0FBTyxFQUFFLFNBQVMsRUFBRSxNQUFNLG9DQUFvQyxDQUFDO0FBRS9ELE9BQU8sRUFBRSxpQkFBaUIsRUFBRSxNQUFNLDZDQUE2QyxDQUFDO0FBQ2hGLE9BQU8sRUFBRSxrQkFBa0IsRUFBRSxNQUFNLHFEQUFxRCxDQUFDO0FBQ3pGLE9BQU8sRUFBRSx1Q0FBdUMsRUFBRSxNQUFNLHVDQUF1QyxDQUFDO0FBQ2hHLE9BQU8sRUFBRSxjQUFjLEVBQUUsTUFBTSxtQ0FBbUMsQ0FBQztBQUVuRSxLQUFLLENBQUMscUJBQXFC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