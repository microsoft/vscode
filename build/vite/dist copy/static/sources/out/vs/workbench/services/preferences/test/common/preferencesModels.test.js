/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { toDisposable } from '../../../../../base/common/lifecycle.js';
import { DefaultSettings } from '../../common/preferencesModels.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { Extensions } from '../../../../../platform/configuration/common/configurationRegistry.js';
import { Registry } from '../../../../../platform/registry/common/platform.js';
suite('DefaultSettings', () => {
    const disposables = ensureNoDisposablesAreLeakedInTestSuite();
    let configurationRegistry;
    let configurationService;
    setup(() => {
        configurationRegistry = Registry.as(Extensions.Configuration);
        configurationService = new TestConfigurationService();
    });
    test('groups settings by title when they share the same extension id', () => {
        const extensionId = 'test.extension';
        const config1 = {
            id: 'config1',
            title: 'Group 1',
            type: 'object',
            properties: {
                'test.setting1': {
                    type: 'string',
                    default: 'value1',
                    description: 'Setting 1'
                }
            },
            extensionInfo: { id: extensionId }
        };
        const config2 = {
            id: 'config2',
            title: 'Group 2',
            type: 'object',
            properties: {
                'test.setting2': {
                    type: 'string',
                    default: 'value2',
                    description: 'Setting 2'
                }
            },
            extensionInfo: { id: extensionId }
        };
        configurationRegistry.registerConfiguration(config1);
        configurationRegistry.registerConfiguration(config2);
        disposables.add(toDisposable(() => configurationRegistry.deregisterConfigurations([config1, config2])));
        const defaultSettings = disposables.add(new DefaultSettings([], 2 /* ConfigurationTarget.USER */, configurationService));
        const groups = defaultSettings.getRegisteredGroups();
        const extensionGroups = groups.filter(g => g.extensionInfo?.id === extensionId);
        assert.strictEqual(extensionGroups.length, 2, 'Should have 2 groups');
        assert.strictEqual(extensionGroups[0].title, 'Group 1');
        assert.strictEqual(extensionGroups[1].title, 'Group 2');
        assert.strictEqual(extensionGroups[0].sections[0].settings.length, 1);
        assert.strictEqual(extensionGroups[0].sections[0].settings[0].key, 'test.setting1');
        assert.strictEqual(extensionGroups[1].sections[0].settings.length, 1);
        assert.strictEqual(extensionGroups[1].sections[0].settings[0].key, 'test.setting2');
    });
    test('groups settings by id when they share the same extension id and have no title', () => {
        const extensionId = 'test.extension';
        const config1 = {
            id: 'group1',
            type: 'object',
            properties: {
                'test.setting1': {
                    type: 'string',
                    default: 'value1',
                    description: 'Setting 1'
                }
            },
            extensionInfo: { id: extensionId }
        };
        const config2 = {
            id: 'group1',
            type: 'object',
            properties: {
                'test.setting2': {
                    type: 'string',
                    default: 'value2',
                    description: 'Setting 2'
                }
            },
            extensionInfo: { id: extensionId }
        };
        configurationRegistry.registerConfiguration(config1);
        configurationRegistry.registerConfiguration(config2);
        disposables.add(toDisposable(() => configurationRegistry.deregisterConfigurations([config1, config2])));
        const defaultSettings = disposables.add(new DefaultSettings([], 2 /* ConfigurationTarget.USER */, configurationService));
        const groups = defaultSettings.getRegisteredGroups();
        const extensionGroups = groups.filter(g => g.extensionInfo?.id === extensionId);
        assert.strictEqual(extensionGroups.length, 1, 'Should have 1 group');
        assert.strictEqual(extensionGroups[0].id, 'group1');
        assert.strictEqual(extensionGroups[0].sections[0].settings.length, 2);
    });
    test('separates groups with same id but different titles', () => {
        const extensionId = 'test.extension';
        const config1 = {
            id: 'group1',
            title: 'Title 1',
            type: 'object',
            properties: {
                'test.setting1': {
                    type: 'string',
                    default: 'value1',
                    description: 'Setting 1'
                }
            },
            extensionInfo: { id: extensionId }
        };
        const config2 = {
            id: 'group1',
            title: 'Title 2',
            type: 'object',
            properties: {
                'test.setting2': {
                    type: 'string',
                    default: 'value2',
                    description: 'Setting 2'
                }
            },
            extensionInfo: { id: extensionId }
        };
        configurationRegistry.registerConfiguration(config1);
        configurationRegistry.registerConfiguration(config2);
        disposables.add(toDisposable(() => configurationRegistry.deregisterConfigurations([config1, config2])));
        const defaultSettings = disposables.add(new DefaultSettings([], 2 /* ConfigurationTarget.USER */, configurationService));
        const groups = defaultSettings.getRegisteredGroups();
        const extensionGroups = groups.filter(g => g.extensionInfo?.id === extensionId);
        assert.strictEqual(extensionGroups.length, 2, 'Should have 2 groups');
        assert.strictEqual(extensionGroups[0].title, 'Title 1');
        assert.strictEqual(extensionGroups[1].title, 'Title 2');
    });
    test('merges untitled group into titled group if id matches', () => {
        const extensionId = 'test.extension';
        const config1 = {
            id: 'group1',
            type: 'object',
            properties: {
                'test.setting1': {
                    type: 'string',
                    default: 'value1',
                    description: 'Setting 1'
                }
            },
            extensionInfo: { id: extensionId }
        };
        const config2 = {
            id: 'group1',
            title: 'Title 1',
            type: 'object',
            properties: {
                'test.setting2': {
                    type: 'string',
                    default: 'value2',
                    description: 'Setting 2'
                }
            },
            extensionInfo: { id: extensionId }
        };
        configurationRegistry.registerConfiguration(config1);
        configurationRegistry.registerConfiguration(config2);
        disposables.add(toDisposable(() => configurationRegistry.deregisterConfigurations([config1, config2])));
        const defaultSettings = disposables.add(new DefaultSettings([], 2 /* ConfigurationTarget.USER */, configurationService));
        const groups = defaultSettings.getRegisteredGroups();
        const extensionGroups = groups.filter(g => g.extensionInfo?.id === extensionId);
        assert.strictEqual(extensionGroups.length, 1, 'Should have 1 group');
        assert.strictEqual(extensionGroups[0].title, 'Title 1');
        assert.strictEqual(extensionGroups[0].sections[0].settings.length, 2);
    });
    test('separates groups with same id and title but different extension ids', () => {
        const extensionId1 = 'test.extension1';
        const extensionId2 = 'test.extension2';
        const config1 = {
            id: 'group1',
            title: 'Title 1',
            type: 'object',
            properties: {
                'test.setting1': {
                    type: 'string',
                    default: 'value1',
                    description: 'Setting 1'
                }
            },
            extensionInfo: { id: extensionId1 }
        };
        const config2 = {
            id: 'group1',
            title: 'Title 1',
            type: 'object',
            properties: {
                'test.setting2': {
                    type: 'string',
                    default: 'value2',
                    description: 'Setting 2'
                }
            },
            extensionInfo: { id: extensionId2 }
        };
        configurationRegistry.registerConfiguration(config1);
        configurationRegistry.registerConfiguration(config2);
        disposables.add(toDisposable(() => configurationRegistry.deregisterConfigurations([config1, config2])));
        const defaultSettings = disposables.add(new DefaultSettings([], 2 /* ConfigurationTarget.USER */, configurationService));
        const groups = defaultSettings.getRegisteredGroups();
        const group1 = groups.find(g => g.extensionInfo?.id === extensionId1);
        const group2 = groups.find(g => g.extensionInfo?.id === extensionId2);
        assert.ok(group1);
        assert.ok(group2);
        assert.notStrictEqual(group1, group2);
        assert.strictEqual(group1.title, 'Title 1');
        assert.strictEqual(group2.title, 'Title 1');
    });
    test('separates groups with same id (no title) but different extension ids', () => {
        const extensionId1 = 'test.extension1';
        const extensionId2 = 'test.extension2';
        const config1 = {
            id: 'group1',
            type: 'object',
            properties: {
                'test.setting1': {
                    type: 'string',
                    default: 'value1',
                    description: 'Setting 1'
                }
            },
            extensionInfo: { id: extensionId1 }
        };
        const config2 = {
            id: 'group1',
            type: 'object',
            properties: {
                'test.setting2': {
                    type: 'string',
                    default: 'value2',
                    description: 'Setting 2'
                }
            },
            extensionInfo: { id: extensionId2 }
        };
        configurationRegistry.registerConfiguration(config1);
        configurationRegistry.registerConfiguration(config2);
        disposables.add(toDisposable(() => configurationRegistry.deregisterConfigurations([config1, config2])));
        const defaultSettings = disposables.add(new DefaultSettings([], 2 /* ConfigurationTarget.USER */, configurationService));
        const groups = defaultSettings.getRegisteredGroups();
        const group1 = groups.find(g => g.extensionInfo?.id === extensionId1);
        const group2 = groups.find(g => g.extensionInfo?.id === extensionId2);
        assert.ok(group1);
        assert.ok(group2);
        assert.notStrictEqual(group1, group2);
    });
    test('groups settings correctly when extension id is same as group id', () => {
        const extensionId = 'test.extension';
        const config1 = {
            id: extensionId,
            title: 'Group 1',
            type: 'object',
            properties: {
                'test.setting1': {
                    type: 'string',
                    default: 'value1',
                    description: 'Setting 1'
                }
            },
            extensionInfo: { id: extensionId }
        };
        const config2 = {
            id: extensionId,
            title: 'Group 2',
            type: 'object',
            properties: {
                'test.setting2': {
                    type: 'string',
                    default: 'value2',
                    description: 'Setting 2'
                }
            },
            extensionInfo: { id: extensionId }
        };
        configurationRegistry.registerConfiguration(config1);
        configurationRegistry.registerConfiguration(config2);
        disposables.add(toDisposable(() => configurationRegistry.deregisterConfigurations([config1, config2])));
        const defaultSettings = disposables.add(new DefaultSettings([], 2 /* ConfigurationTarget.USER */, configurationService));
        const groups = defaultSettings.getRegisteredGroups();
        const extensionGroups = groups.filter(g => g.extensionInfo?.id === extensionId);
        assert.strictEqual(extensionGroups.length, 2, 'Should have 2 groups');
        assert.strictEqual(extensionGroups[0].title, 'Group 1');
        assert.strictEqual(extensionGroups[1].title, 'Group 2');
    });
    test('sorts groups by order', () => {
        const extensionId = 'test.extension';
        const config1 = {
            id: 'group1',
            title: 'Group 1',
            order: 2,
            type: 'object',
            properties: {
                'test.setting1': {
                    type: 'string',
                    default: 'value1',
                    description: 'Setting 1'
                }
            },
            extensionInfo: { id: extensionId }
        };
        const config2 = {
            id: 'group2',
            title: 'Group 2',
            order: 1,
            type: 'object',
            properties: {
                'test.setting2': {
                    type: 'string',
                    default: 'value2',
                    description: 'Setting 2'
                }
            },
            extensionInfo: { id: extensionId }
        };
        configurationRegistry.registerConfiguration(config1);
        configurationRegistry.registerConfiguration(config2);
        disposables.add(toDisposable(() => configurationRegistry.deregisterConfigurations([config1, config2])));
        const defaultSettings = disposables.add(new DefaultSettings([], 2 /* ConfigurationTarget.USER */, configurationService));
        const groups = defaultSettings.getRegisteredGroups();
        const extensionGroups = groups.filter(g => g.extensionInfo?.id === extensionId);
        assert.strictEqual(extensionGroups.length, 2);
        assert.strictEqual(extensionGroups[0].title, 'Group 2');
        assert.strictEqual(extensionGroups[1].title, 'Group 1');
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicHJlZmVyZW5jZXNNb2RlbHMudGVzdC5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9zZXJ2aWNlcy9wcmVmZXJlbmNlcy90ZXN0L2NvbW1vbi9wcmVmZXJlbmNlc01vZGVscy50ZXN0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sTUFBTSxNQUFNLFFBQVEsQ0FBQztBQUM1QixPQUFPLEVBQUUsdUNBQXVDLEVBQUUsTUFBTSwwQ0FBMEMsQ0FBQztBQUNuRyxPQUFPLEVBQUUsWUFBWSxFQUFFLE1BQU0seUNBQXlDLENBQUM7QUFDdkUsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLG1DQUFtQyxDQUFDO0FBQ3BFLE9BQU8sRUFBRSx3QkFBd0IsRUFBRSxNQUFNLCtFQUErRSxDQUFDO0FBQ3pILE9BQU8sRUFBRSxVQUFVLEVBQThDLE1BQU0sdUVBQXVFLENBQUM7QUFDL0ksT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLHFEQUFxRCxDQUFDO0FBRy9FLEtBQUssQ0FBQyxpQkFBaUIsRUFBRSxHQUFHLEVBQUU7SUFDN0IsTUFBTSxXQUFXLEdBQUcsdUNBQXVDLEVBQUUsQ0FBQztJQUM5RCxJQUFJLHFCQUE2QyxDQUFDO0lBQ2xELElBQUksb0JBQThDLENBQUM7SUFFbkQsS0FBSyxDQUFDLEdBQUcsRUFBRTtRQUNWLHFCQUFxQixHQUFHLFFBQVEsQ0FBQyxFQUFFLENBQXlCLFVBQVUsQ0FBQyxhQUFhLENBQUMsQ0FBQztRQUN0RixvQkFBb0IsR0FBRyxJQUFJLHdCQUF3QixFQUFFLENBQUM7SUFDdkQsQ0FBQyxDQUFDLENBQUM7SUFFSCxJQUFJLENBQUMsZ0VBQWdFLEVBQUUsR0FBRyxFQUFFO1FBQzNFLE1BQU0sV0FBVyxHQUFHLGdCQUFnQixDQUFDO1FBQ3JDLE1BQU0sT0FBTyxHQUF1QjtZQUNuQyxFQUFFLEVBQUUs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