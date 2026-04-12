/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { VSBuffer } from '../../../../base/common/buffer.js';
import { Event } from '../../../../base/common/event.js';
import { Schemas } from '../../../../base/common/network.js';
import { URI } from '../../../../base/common/uri.js';
import { runWithFakedTimers } from '../../../../base/test/common/timeTravelScheduler.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { isConfigured } from '../../common/configuration.js';
import { Extensions as ConfigurationExtensions } from '../../common/configurationRegistry.js';
import { ConfigurationService } from '../../common/configurationService.js';
import { FileService } from '../../../files/common/fileService.js';
import { InMemoryFileSystemProvider } from '../../../files/common/inMemoryFilesystemProvider.js';
import { NullLogService } from '../../../log/common/log.js';
import { FilePolicyService } from '../../../policy/common/filePolicyService.js';
import { NullPolicyService } from '../../../policy/common/policy.js';
import { Registry } from '../../../registry/common/platform.js';
import { PolicyCategory } from '../../../../base/common/policy.js';
suite('ConfigurationService.test.ts', () => {
    const disposables = ensureNoDisposablesAreLeakedInTestSuite();
    let fileService;
    let settingsResource;
    setup(async () => {
        fileService = disposables.add(new FileService(new NullLogService()));
        const diskFileSystemProvider = disposables.add(new InMemoryFileSystemProvider());
        disposables.add(fileService.registerProvider(Schemas.file, diskFileSystemProvider));
        settingsResource = URI.file('settings.json');
    });
    test('simple', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
        await fileService.writeFile(settingsResource, VSBuffer.fromString('{ "foo": "bar" }'));
        const testObject = disposables.add(new ConfigurationService(settingsResource, fileService, new NullPolicyService(), new NullLogService()));
        await testObject.initialize();
        const config = testObject.getValue();
        assert.ok(config);
        assert.strictEqual(config.foo, 'bar');
    }));
    test('config gets flattened', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
        await fileService.writeFile(settingsResource, VSBuffer.fromString('{ "testworkbench.editor.tabs": true }'));
        const testObject = disposables.add(new ConfigurationService(settingsResource, fileService, new NullPolicyService(), new NullLogService()));
        await testObject.initialize();
        const config = testObject.getValue();
        assert.ok(config);
        assert.ok(config.testworkbench);
        assert.ok(config.testworkbench.editor);
        assert.strictEqual(config.testworkbench.editor.tabs, true);
    }));
    test('error case does not explode', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
        await fileService.writeFile(settingsResource, VSBuffer.fromString(',,,,'));
        const testObject = disposables.add(new ConfigurationService(settingsResource, fileService, new NullPolicyService(), new NullLogService()));
        await testObject.initialize();
        const config = testObject.getValue();
        assert.ok(config);
    }));
    test('missing file does not explode', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
        const testObject = disposables.add(new ConfigurationService(URI.file('__testFile'), fileService, new NullPolicyService(), new NullLogService()));
        await testObject.initialize();
        const config = testObject.getValue();
        assert.ok(config);
    }));
    test('trigger configuration change event when file does not exist', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
        const testObject = disposables.add(new ConfigurationService(settingsResource, fileService, new NullPolicyService(), new NullLogService()));
        await testObject.initialize();
        return new Promise((c, e) => {
            disposables.add(Event.filter(testObject.onDidChangeConfiguration, e => e.source === 2 /* ConfigurationTarget.USER */)(() => {
                assert.strictEqual(testObject.getValue('foo'), 'bar');
                c();
            }));
            fileService.writeFile(settingsResource, VSBuffer.fromString('{ "foo": "bar" }')).catch(e);
        });
    }));
    test('trigger configuration change event when file exists', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
        const testObject = disposables.add(new ConfigurationService(settingsResource, fileService, new NullPolicyService(), new NullLogService()));
        await fileService.writeFile(settingsResource, VSBuffer.fromString('{ "foo": "bar" }'));
        await testObject.initialize();
        return new Promise((c) => {
            disposables.add(Event.filter(testObject.onDidChangeConfiguration, e => e.source === 2 /* ConfigurationTarget.USER */)(async (e) => {
                assert.strictEqual(testObject.getValue('foo'), 'barz');
                c();
            }));
            fileService.writeFile(settingsResource, VSBuffer.fromString('{ "foo": "barz" }'));
        });
    }));
    test('reloadConfiguration', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
        await fileService.writeFile(settingsResource, VSBuffer.fromString('{ "foo": "bar" }'));
        const testObject = disposables.add(new ConfigurationService(settingsResource, fileService, new NullPolicyService(), new NullLogService()));
        await testObject.initialize();
        let config = testObject.getValue();
        assert.ok(config);
        assert.strictEqual(config.foo, 'bar');
        await fileService.writeFile(settingsResource, VSBuffer.fromString('{ "foo": "changed" }'));
        // force a reload to get latest
        await testObject.reloadConfiguration();
        config = testObject.getValue();
        assert.ok(config);
        assert.strictEqual(config.foo, 'changed');
    }));
    test('model defaults', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
        const configurationRegistry = Registry.as(ConfigurationExtensions.Configuration);
        configurationRegistry.registerConfiguration({
            'id': '_test',
            'type': 'object',
            'properties': {
                'configuration.service.testSetting': {
                    'type': 'string',
                    'default': 'isSet'
                }
            }
        });
        let testObject = disposables.add(new ConfigurationService(URI.file('__testFile'), fileService, new NullPolicyService(), new NullLogService()));
        await testObject.initialize();
        let setting = testObject.getValue();
        assert.ok(setting);
        assert.strictEqual(setting.configuration.service.testSetting, 'isSet');
        await fileService.writeFile(settingsResource, VSBuffer.fromString('{ "testworkbench.editor.tabs": true }'));
        testObject = disposables.add(new ConfigurationService(settingsResource, fileService, new NullPolicyService(), new NullLogService()));
        await testObject.initialize();
        setting = testObject.getValue();
        assert.ok(setting);
        assert.strictEqual(setting.configuration.service.testSetting, 'isSet');
        await fileService.writeFile(settingsResource, VSBuffer.fromString('{ "configuration.service.testSetting": "isChanged" }'));
        await testObject.reloadConfiguration();
        setting = testObject.getValue();
        assert.ok(setting);
        assert.strictEqual(setting.configuration.service.testSetting, 'isChanged');
    }));
    test('lookup', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
        const configurationRegistry = Registry.as(ConfigurationExtensions.Configuration);
        configurationRegistry.registerConfiguration({
            'id': '_test',
            'type': 'object',
            'properties': {
                'lookup.service.testSetting': {
                    'type': 'string',
                    'default': 'isSet'
                }
            }
        });
        const testObject = disposables.add(new ConfigurationService(settingsResource, fileService, new NullPolicyService(), new NullLogService()));
        await testObject.initialize();
        let res = testObject.inspect('something.missing');
        assert.strictEqual(res.value, undefined);
        assert.strictEqual(res.defaultValue, undefined);
        assert.strictEqual(res.userValue, undefined);
        assert.strictEqual(isConfigured(res), false);
        res = testObject.inspect('lookup.service.testSetting');
        assert.strictEqual(res.defaultValue, 'isSet');
        assert.strictEqual(res.value, 'isSet');
        assert.strictEqual(res.userValue, undefined);
        assert.strictEqual(isConfigured(res), false);
        await fileService.writeFile(settingsResource, VSBuffer.fromString('{ "lookup.service.testSetting": "bar" }'));
        await testObject.reloadConfiguration();
        res = testObject.inspect('lookup.service.testSetting');
        assert.strictEqual(res.defaultValue, 'isSet');
        assert.strictEqual(res.userValue, 'bar');
        assert.strictEqual(res.value, 'bar');
        assert.strictEqual(isConfigured(res), true);
    }));
    test('lookup with null', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
        const configurationRegistry = Registry.as(ConfigurationExtensions.Configuration);
        configurationRegistry.registerConfiguration({
            'id': '_testNull',
            'type': 'object',
            'properties': {
                'lookup.service.testNullSetting': {
                    'type': 'null',
                }
            }
        });
        const testObject = disposables.add(new ConfigurationService(settingsResource, fileService, new NullPolicyService(), new NullLogService()));
        await testObject.initialize();
        let res = testObject.inspect('lookup.service.testNullSetting');
        assert.strictEqual(res.defaultValue, null);
        assert.strictEqual(res.value, null);
        assert.strictEqual(res.userValue, undefined);
        await fileService.writeFile(settingsResource, VSBuffer.fromString('{ "lookup.service.testNullSetting": null }'));
        await testObject.reloadConfiguration();
        res = testObject.inspect('lookup.service.testNullSetting');
        assert.strictEqual(res.defaultValue, null);
        assert.strictEqual(res.value, null);
        assert.strictEqual(res.userValue, null);
    }));
    test('update configuration', async () => {
        const configurationRegistry = Registry.as(ConfigurationExtensions.Configuration);
        configurationRegistry.registerConfiguration({
            'id': '_test',
            'type': 'object',
            'properties': {
                'configurationService.testSetting': {
                    'type': 'string',
                    'default': 'isSet'
                }
            }
        });
        const testObject = disposables.add(new ConfigurationService(settingsResource, fileService, new NullPolicyService(), new NullLogService()));
        await testObject.initialize();
        await testObject.updateValue('configurationService.testSetting', 'value');
        assert.strictEqual(testObject.getValue('configurationService.testSetting'), 'value');
    });
    test('update configuration when exist', async () => {
        const configurationRegistry = Registry.as(ConfigurationExtensions.Configuration);
        configurationRegistry.registerConfiguration({
            'id': '_test',
            'type': 'object',
            'properties': {
                'configurationService.testSetting': {
                    'type': 'string',
                    'default': 'isSet'
                }
            }
        });
        const testObject = disposables.add(new ConfigurationService(settingsResource, fileService, new NullPolicyService(), new NullLogService()));
        await testObject.initialize();
        await testObject.updateValue('configurationService.testSetting', 'value');
        await testObject.updateValue('configurationService.testSetting', 'updatedValue');
        assert.strictEqual(testObject.getValue('configurationService.testSetting'), 'updatedValue');
    });
    test('update configuration to default value should remove', async () => {
        const configurationRegistry = Registry.as(ConfigurationExtensions.Configuration);
        configurationRegistry.registerConfiguration({
            'id': '_test',
            'type': 'object',
            'properties': {
                'configurationService.testSetting': {
                    'type': 'string',
                    'default': 'isSet'
                }
            }
        });
        const testObject = disposables.add(new ConfigurationService(settingsResource, fileService, new NullPolicyService(), new NullLogService()));
        await testObject.initialize();
        await testObject.updateValue('configurationService.testSetting', 'value');
        await testObject.updateValue('configurationService.testSetting', 'isSet');
        const inspect = testObject.inspect('configurationService.testSetting');
        assert.strictEqual(inspect.userValue, undefined);
    });
    test('update configuration should remove when undefined is passed', async () => {
        const configurationRegistry = Registry.as(ConfigurationExtensions.Configuration);
        configurationRegistry.registerConfiguration({
            'id': '_test',
            'type': 'object',
            'properties': {
                'configurationService.testSetting': {
                    'type': 'string',
                    'default': 'isSet'
                }
            }
        });
        const testObject = disposables.add(new ConfigurationService(settingsResource, fileService, new NullPolicyService(), new NullLogService()));
        await testObject.initialize();
        await testObject.updateValue('configurationService.testSetting', 'value');
        await testObject.updateValue('configurationService.testSetting', undefined);
        const inspect = testObject.inspect('configurationService.testSetting');
        assert.strictEqual(inspect.userValue, undefined);
    });
    test('update unknown configuration', async () => {
        const testObject = disposables.add(new ConfigurationService(settingsResource, fileService, new NullPolicyService(), new NullLogService()));
        await testObject.initialize();
        await testObject.updateValue('configurationService.unknownSetting', 'value');
        assert.strictEqual(testObject.getValue('configurationService.unknownSetting'), 'value');
    });
    test('update configuration in non user target throws error', async () => {
        const configurationRegistry = Registry.as(ConfigurationExtensions.Configuration);
        configurationRegistry.registerConfiguration({
            'id': '_test',
            'type': 'object',
            'properties': {
                'configurationService.testSetting': {
                    'type': 'string',
                    'default': 'isSet'
                }
            }
        });
        const testObject = disposables.add(new ConfigurationService(settingsResource, fileService, new NullPolicyService(), new NullLogService()));
        await testObject.initialize();
        try {
            await testObject.updateValue('configurationService.testSetting', 'value', 5 /* ConfigurationTarget.WORKSPACE */);
            assert.fail('Should fail with error');
        }
        catch (e) {
            // succeess
        }
    });
    test('update configuration throws error for policy setting', async () => {
        const configurationRegistry = Registry.as(ConfigurationExtensions.Configuration);
        configurationRegistry.registerConfiguration({
            'id': '_test',
            'type': 'object',
            'properties': {
                'configurationService.policySetting': {
                    'type': 'string',
                    'default': 'isSet',
                    policy: {
                        name: 'configurationService.policySetting',
                        category: PolicyCategory.Extensions,
                        minimumVersion: '1.0.0',
                        localization: { description: { key: '', value: '' }, }
                    }
                }
            }
        });
        const logService = new NullLogService();
        const policyFile = URI.file('policies.json');
        await fileService.writeFile(policyFile, VSBuffer.fromString('{ "configurationService.policySetting": "policyValue" }'));
        const policyService = disposables.add(new FilePolicyService(policyFile, fileService, logService));
        const testObject = disposables.add(new ConfigurationService(settingsResource, fileService, policyService, logService));
        await testObject.initialize();
        try {
            await testObject.updateValue('configurationService.policySetting', 'value');
            assert.fail('Should throw error');
        }
        catch (error) {
            // succeess
        }
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY29uZmlndXJhdGlvblNlcnZpY2UudGVzdC5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vdGVzdC9jb21tb24vY29uZmlndXJhdGlvblNlcnZpY2UudGVzdC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRyxPQUFPLE1BQU0sTUFBTSxRQUFRLENBQUM7QUFDNUIsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLG1DQUFtQyxDQUFDO0FBQzdELE9BQU8sRUFBRSxLQUFLLEVBQUUsTUFBTSxrQ0FBa0MsQ0FBQztBQUN6RCxPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0sb0NBQW9DLENBQUM7QUFDN0QsT0FBTyxFQUFFLEdBQUcsRUFBRSxNQUFNLGdDQUFnQyxDQUFDO0FBQ3JELE9BQU8sRUFBRSxrQkFBa0IsRUFBRSxNQUFNLHFEQUFxRCxDQUFDO0FBQ3pGLE9BQU8sRUFBRSx1Q0FBdUMsRUFBRSxNQUFNLHVDQUF1QyxDQUFDO0FBQ2hHLE9BQU8sRUFBdUIsWUFBWSxFQUFFLE1BQU0sK0JBQStCLENBQUM7QUFDbEYsT0FBTyxFQUFFLFVBQVUsSUFBSSx1QkFBdUIsRUFBMEIsTUFBTSx1Q0FBdUMsQ0FBQztBQUN0SCxPQUFPLEVBQUUsb0JBQW9CLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUU1RSxPQUFPLEVBQUUsV0FBVyxFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFDbkUsT0FBTyxFQUFFLDBCQUEwQixFQUFFLE1BQU0scURBQXFELENBQUM7QUFDakcsT0FBTyxFQUFFLGNBQWMsRUFBRSxNQUFNLDRCQUE0QixDQUFDO0FBQzVELE9BQU8sRUFBRSxpQkFBaUIsRUFBRSxNQUFNLDZDQUE2QyxDQUFDO0FBQ2hGLE9BQU8sRUFBRSxpQkFBaUIsRUFBRSxNQUFNLGtDQUFrQyxDQUFDO0FBQ3JFLE9BQU8sRUFBRSxR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