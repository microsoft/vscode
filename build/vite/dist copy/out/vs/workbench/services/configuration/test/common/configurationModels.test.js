/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { Registry } from '../../../../../platform/registry/common/platform.js';
import { StandaloneConfigurationModelParser, Configuration } from '../../common/configurationModels.js';
import { ConfigurationModelParser, ConfigurationModel } from '../../../../../platform/configuration/common/configurationModels.js';
import { Extensions as ConfigurationExtensions } from '../../../../../platform/configuration/common/configurationRegistry.js';
import { ResourceMap } from '../../../../../base/common/map.js';
import { WorkspaceFolder } from '../../../../../platform/workspace/common/workspace.js';
import { URI } from '../../../../../base/common/uri.js';
import { Workspace } from '../../../../../platform/workspace/test/common/testWorkspace.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { NullLogService } from '../../../../../platform/log/common/log.js';
suite('FolderSettingsModelParser', () => {
    ensureNoDisposablesAreLeakedInTestSuite();
    suiteSetup(() => {
        const configurationRegistry = Registry.as(ConfigurationExtensions.Configuration);
        configurationRegistry.registerConfiguration({
            'id': 'FolderSettingsModelParser_1',
            'type': 'object',
            'properties': {
                'FolderSettingsModelParser.window': {
                    'type': 'string',
                    'default': 'isSet'
                },
                'FolderSettingsModelParser.resource': {
                    'type': 'string',
                    'default': 'isSet',
                    scope: 5 /* ConfigurationScope.RESOURCE */,
                },
                'FolderSettingsModelParser.resourceLanguage': {
                    'type': 'string',
                    'default': 'isSet',
                    scope: 6 /* ConfigurationScope.LANGUAGE_OVERRIDABLE */,
                },
                'FolderSettingsModelParser.application': {
                    'type': 'string',
                    'default': 'isSet',
                    scope: 1 /* ConfigurationScope.APPLICATION */
                },
                'FolderSettingsModelParser.machine': {
                    'type': 'string',
                    'default': 'isSet',
                    scope: 2 /* ConfigurationScope.MACHINE */
                }
            }
        });
    });
    test('parse all folder settings', () => {
        const testObject = new ConfigurationModelParser('settings', new NullLogService());
        testObject.parse(JSON.stringify({ 'FolderSettingsModelParser.window': 'window', 'FolderSettingsModelParser.resource': 'resource', 'FolderSettingsModelParser.application': 'application', 'FolderSettingsModelParser.machine': 'executable' }), { scopes: [5 /* ConfigurationScope.RESOURCE */, 4 /* ConfigurationScope.WINDOW */] });
        const expected = Object.create(null);
        expected['FolderSettingsModelParser'] = Object.create(null);
        expected['FolderSettingsModelParser']['window'] = 'window';
        expected['FolderSettingsModelParser']['resource'] = 'resource';
        assert.deepStrictEqual(testObject.configurationModel.contents, expected);
    });
    test('parse resource folder settings', () => {
        const testObject = new ConfigurationModelParser('settings', new NullLogService());
        testObject.parse(JSON.stringify({ 'FolderSettingsModelParser.window': 'window', 'FolderSettingsModelParser.resource': 'resource', 'FolderSettingsModelParser.application': 'application', 'FolderSettingsModelParser.machine': 'executable' }), { scopes: [5 /* ConfigurationScope.RESOURCE */] });
        const expected = Object.create(null);
        expected['FolderSettingsModelParser'] = Object.create(null);
        expected['FolderSettingsModelParser']['resource'] = 'resource';
        assert.deepStrictEqual(testObject.configurationModel.contents, expected);
    });
    test('parse resource and resource language settings', () => {
        const testObject = new ConfigurationModelParser('settings', new NullLogService());
        testObject.parse(JSON.stringify({ '[json]': { 'FolderSettingsModelParser.window': 'window', 'FolderSettingsModelParser.resource': 'resource', 'FolderSettingsModelParser.resourceLanguage': 'resourceLanguage', 'FolderSettingsModelParser.application': 'application', 'FolderSettingsModelParser.machine': 'executable' } }), { scopes: [5 /* ConfigurationScope.RESOURCE */, 6 /* ConfigurationScope.LANGUAGE_OVERRIDABLE */] });
        const expected = Object.create(null);
        expected['FolderSettingsModelParser'] = Object.create(null);
        expected['FolderSettingsModelParser']['resource'] = 'resource';
        expected['FolderSettingsModelParser']['resourceLanguage'] = 'resourceLanguage';
        assert.deepStrictEqual(testObject.configurationModel.overrides, [{ 'contents': expected, 'identifiers': ['json'], 'keys': ['FolderSettingsModelParser.resource', 'FolderSettingsModelParser.resourceLanguage'] }]);
    });
    test('reparse folder settings excludes application and machine setting', () => {
        const parseOptions = { scopes: [5 /* ConfigurationScope.RESOURCE */, 4 /* ConfigurationScope.WINDOW */] };
        const testObject = new ConfigurationModelParser('settings', new NullLogService());
        testObject.parse(JSON.stringify({ 'FolderSettingsModelParser.resource': 'resource', 'FolderSettingsModelParser.anotherApplicationSetting': 'executable' }), parseOptions);
        let expected = Object.create(null);
        expected['FolderSettingsModelParser'] = Object.create(null);
        expected['FolderSettingsModelParser']['resource'] = 'resource';
        expected['FolderSettingsModelParser']['anotherApplicationSetting'] = 'executable';
        assert.deepStrictEqual(testObject.configurationModel.contents, expected);
        const configurationRegistry = Registry.as(ConfigurationExtensions.Configuration);
        configurationRegistry.registerConfiguration({
            'id': 'FolderSettingsModelParser_2',
            'type': 'object',
            'properties': {
                'FolderSettingsModelParser.anotherApplicationSetting': {
                    'type': 'string',
                    'default': 'isSet',
                    scope: 1 /* ConfigurationScope.APPLICATION */
                },
                'FolderSettingsModelParser.anotherMachineSetting': {
                    'type': 'string',
                    'default': 'isSet',
                    scope: 2 /* ConfigurationScope.MACHINE */
                }
            }
        });
        testObject.reparse(parseOptions);
        expected = Object.create(null);
        expected['FolderSettingsModelParser'] = Object.create(null);
        expected['FolderSettingsModelParser']['resource'] = 'resource';
        assert.deepStrictEqual(testObject.configurationModel.contents, expected);
    });
});
suite('StandaloneConfigurationModelParser', () => {
    ensureNoDisposablesAreLeakedInTestSuite();
    test('parse tasks stand alone configuration model', () => {
        const testObject = new StandaloneConfigurationModelParser('tasks', 'tasks', new NullLogService());
        testObject.parse(JSON.stringify({ 'version': '1.1.1', 'tasks': [] }));
        const expected = Object.create(null);
        expected['tasks'] = Object.create(null);
        expected['tasks']['version'] = '1.1.1';
        expected['tasks']['tasks'] = [];
        assert.deepStrictEqual(testObject.configurationModel.contents, expected);
    });
});
suite('Workspace Configuration', () => {
    ensureNoDisposablesAreLeakedInTestSuite();
    const defaultConfigurationModel = toConfigurationModel({
        'editor.lineNumbers': 'on',
        'editor.fontSize': 12,
        'window.zoomLevel': 1,
        '[markdown]': {
            'editor.wordWrap': 'off'
        },
        'window.title': 'custom',
        'workbench.enableTabs': false,
        'editor.insertSpaces': true
    });
    test('Test compare same configurations', () => {
        const workspace = new Workspace('a', [new WorkspaceFolder({ index: 0, name: 'a', uri: URI.file('folder1') }), new WorkspaceFolder({ index: 1, name: 'b', uri: URI.file('folder2') }), new WorkspaceFolder({ index: 2, name: 'c', uri: URI.file('folder3') })]);
        const configuration1 = new Configuration(ConfigurationModel.createEmptyModel(new NullLogService()), ConfigurationModel.createEmptyModel(new NullLogService()), ConfigurationModel.createEmptyModel(new NullLogService()), ConfigurationModel.createEmptyModel(new NullLogService()), ConfigurationModel.createEmptyModel(new NullLogService()), ConfigurationModel.createEmptyModel(new NullLogService()), new ResourceMap(), ConfigurationModel.createEmptyModel(new NullLogService()), new ResourceMap(), workspace, new NullLogService());
        configuration1.updateDefaultConfiguration(defaultConfigurationModel);
        configuration1.updateLocalUserConfiguration(toConfigurationModel({ 'window.title': 'native', '[typescript]': { 'editor.insertSpaces': false } }));
        configuration1.updateWorkspaceConfiguration(toConfigurationModel({ 'editor.lineNumbers': 'on' }));
        configuration1.updateFolderConfiguration(URI.file('folder1'), toConfigurationModel({ 'editor.fontSize': 14 }));
        configuration1.updateFolderConfiguration(URI.file('folder2'), toConfigurationModel({ 'editor.wordWrap': 'on' }));
        const configuration2 = new Configuration(ConfigurationModel.createEmptyModel(new NullLogService()), ConfigurationModel.createEmptyModel(new NullLogService()), ConfigurationModel.createEmptyModel(new NullLogService()), ConfigurationModel.createEmptyModel(new NullLogService()), ConfigurationModel.createEmptyModel(new NullLogService()), ConfigurationModel.createEmptyModel(new NullLogService()), new ResourceMap(), ConfigurationModel.createEmptyModel(new NullLogService()), new ResourceMap(), workspace, new NullLogService());
        configuration2.updateDefaultConfiguration(defaultConfigurationModel);
        configuration2.updateLocalUserConfiguration(toConfigurationModel({ 'window.title': 'native', '[typescript]': { 'editor.insertSpaces': false } }));
        configuration2.updateWorkspaceConfiguration(toConfigurationModel({ 'editor.lineNumbers': 'on' }));
        configuration2.updateFolderConfiguration(URI.file('folder1'), toConfigurationModel({ 'editor.fontSize': 14 }));
        configuration2.updateFolderConfiguration(URI.file('folder2'), toConfigurationModel({ 'editor.wordWrap': 'on' }));
        const actual = configuration2.compare(configuration1);
        assert.deepStrictEqual(actual, { keys: [], overrides: [] });
    });
    test('Test compare different configurations', () => {
        const workspace = new Workspace('a', [new WorkspaceFolder({ index: 0, name: 'a', uri: URI.file('folder1') }), new WorkspaceFolder({ index: 1, name: 'b', uri: URI.file('folder2') }), new WorkspaceFolder({ index: 2, name: 'c', uri: URI.file('folder3') })]);
        const configuration1 = new Configuration(ConfigurationModel.createEmptyModel(new NullLogService()), ConfigurationModel.createEmptyModel(new NullLogService()), ConfigurationModel.createEmptyModel(new NullLogService()), ConfigurationModel.createEmptyModel(new NullLogService()), ConfigurationModel.createEmptyModel(new NullLogService()), ConfigurationModel.createEmptyModel(new NullLogService()), new ResourceMap(), ConfigurationModel.createEmptyModel(new NullLogService()), new ResourceMap(), workspace, new NullLogService());
        configuration1.updateDefaultConfiguration(defaultConfigurationModel);
        configuration1.updateLocalUserConfiguration(toConfigurationModel({ 'window.title': 'native', '[typescript]': { 'editor.insertSpaces': false } }));
        configuration1.updateWorkspaceConfiguration(toConfigurationModel({ 'editor.lineNumbers': 'on' }));
        configuration1.updateFolderConfiguration(URI.file('folder1'), toConfigurationModel({ 'editor.fontSize': 14 }));
        configuration1.updateFolderConfiguration(URI.file('folder2'), toConfigurationModel({ 'editor.wordWrap': 'on' }));
        const configuration2 = new Configuration(ConfigurationModel.createEmptyModel(new NullLogService()), ConfigurationModel.createEmptyModel(new NullLogService()), ConfigurationModel.createEmptyModel(new NullLogService()), ConfigurationModel.createEmptyModel(new NullLogService()), ConfigurationModel.createEmptyModel(new NullLogService()), ConfigurationModel.createEmptyModel(new NullLogService()), new ResourceMap(), ConfigurationModel.createEmptyModel(new NullLogService()), new ResourceMap(), workspace, new NullLogService());
        configuration2.updateDefaultConfiguration(defaultConfigurationModel);
        configuration2.updateLocalUserConfiguration(toConfigurationModel({ 'workbench.enableTabs': true, '[typescript]': { 'editor.insertSpaces': true } }));
        configuration2.updateWorkspaceConfiguration(toConfigurationModel({ 'editor.fontSize': 11 }));
        configuration2.updateFolderConfiguration(URI.file('folder1'), toConfigurationModel({ 'editor.insertSpaces': true }));
        configuration2.updateFolderConfiguration(URI.file('folder2'), toConfigurationModel({
            '[markdown]': {
                'editor.wordWrap': 'on',
                'editor.lineNumbers': 'relative'
            },
        }));
        const actual = configuration2.compare(configuration1);
        assert.deepStrictEqual(actual, { keys: ['editor.wordWrap', 'editor.fontSize', '[markdown]', 'window.title', 'workbench.enableTabs', '[typescript]'], overrides: [['markdown', ['editor.lineNumbers', 'editor.wordWrap']], ['typescript', ['editor.insertSpaces']]] });
    });
});
function toConfigurationModel(obj) {
    const parser = new ConfigurationModelParser('test', new NullLogService());
    parser.parse(JSON.stringify(obj));
    return parser.configurationModel;
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY29uZmlndXJhdGlvbk1vZGVscy50ZXN0LmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL3NlcnZpY2VzL2NvbmZpZ3VyYXRpb24vdGVzdC9jb21tb24vY29uZmlndXJhdGlvbk1vZGVscy50ZXN0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBQ2hHLE9BQU8sTUFBTSxNQUFNLFFBQVEsQ0FBQztBQUM1QixPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0scURBQXFELENBQUM7QUFDL0UsT0FBTyxFQUFFLGtDQUFrQyxFQUFFLGFBQWEsRUFBRSxNQUFNLHFDQUFxQyxDQUFDO0FBQ3hHLE9BQU8sRUFBRSx3QkFBd0IsRUFBRSxrQkFBa0IsRUFBNkIsTUFBTSxxRUFBcUUsQ0FBQztBQUM5SixPQUFPLEVBQTBCLFVBQVUsSUFBSSx1QkFBdUIsRUFBc0IsTUFBTSx1RUFBdUUsQ0FBQztBQUMxSyxPQUFPLEVBQUUsV0FBVyxFQUFFLE1BQU0sbUNBQW1DLENBQUM7QUFDaEUsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLHVEQUF1RCxDQUFDO0FBQ3hGLE9BQU8sRUFBRSxHQUFHLEVBQUUsTUFBTSxtQ0FBbUMsQ0FBQztBQUN4RCxPQUFPLEVBQUUsU0FBUyxFQUFFLE1BQU0sZ0VBQWdFLENBQUM7QUFDM0YsT0FBTyxFQUFFLHVDQUF1QyxFQUFFLE1BQU0sMENBQTBDLENBQUM7QUFDbkcsT0FBTyxFQUFFLGNBQWMsRUFBRSxNQUFNLDJDQUEyQyxDQUFDO0FBRTNFLEtBQUssQ0FBQywyQkFBMkIsRUFBRSxHQUFHLEVBQUU7SUFFdkMsdUNBQXVDLEVBQUUsQ0FBQztJQUUxQyxVQUFVLENBQUMsR0FBRyxFQUFFO1FBQ2YsTUFBTSxxQkFBcUIsR0FBRyxRQUFRLENBQUMsRUFBRSxDQUF5Qix1QkFBdUIsQ0FBQyxhQUFhLENBQUMsQ0FBQztRQUN6RyxxQkFBcUIsQ0FBQyxxQkFBcUIsQ0FBQztZQUMzQyxJQUFJLEVBQUUsNkJBQTZCO1lBQ25DLE1BQU0sRUFBRSxRQUFRO1lBQ2hCLFlBQVksRUFBRTtnQkFDYixrQ0FBa0MsRUFBRTtvQkFDbkMsTUFBTSxFQUFFLFFBQVE7b0JBQ2hCLFNBQVMsRUFBRSxPQUFPO2lCQUNsQjtnQkFDRCxvQ0FBb0MsRUFBRTtvQkFDckMsTUFBTSxFQUFFLFFBQVE7b0JBQ2hCLFNBQVMsRUFBRSxPQUFPO29CQUNsQixLQUFLLHFDQUE2QjtpQkFDbEM7Z0JBQ0QsNENBQTRDLEVBQUU7b0JBQzdDLE1BQU0sRUFBRSxRQUFRO29CQUNoQixTQUFTLEVBQUUsT0FBTztvQkFDbEIsS0FBSyxpREFBeUM7aUJBQzlDO2dCQUNELHVDQUF1QyxFQUFFO29CQUN4QyxNQUFNLEVBQUUsUUFBUTtvQkFDaEIsU0FBUyxFQUFFLE9BQU87b0JBQ2xCLEtBQUssd0NBQWdDO2lCQUNyQztnQkFDRCxtQ0FBbUMsRUFBRTtvQkFDcEMsTUFBTSxFQUFFLFFBQVE7b0JBQ2hCLFNBQVMsRUFBRSxPQUFPO29CQUNsQixLQUFLLG9DQUE0QjtpQkFDakM7YUFDRDtTQUNELENBQUMsQ0FBQztJQUNKLENBQUMsQ0FBQyxDQUFDO0lBRUgsSUFBSSxDQUFDLDJCQUEyQixFQUFFLEdBQUcsRUFBRTtRQUN0QyxNQUFNLFVBQVUsR0FBRyxJQUFJLHdCQUF3QixDQUFDLFVBQVUsRUFBRSxJQUFJLGNBQWMsRUFBRSxDQUFDLENBQUM7UUFFbEYsVUFBVSxDQUFDLEtBQUssQ0FBQyxJQUFJLENBQUMsU0FBUyxDQUFDLEVBQUUsa0NBQWtDLEVBQUUsUUFBUSxFQUFFLG9DQUFvQyxFQUFFLFVBQVUsRUFBRSx1Q0FBdUMsRUFBRSxhQUFhLEVBQUUsbUNBQW1DLEVBQUUsWUFBWSxFQUFFLENBQUMsRUFBRSxFQUFFLE1BQU0sRUFBRSx3RUFBd0QsRUFBRSxDQUFDLENBQUM7UUFFdFQsTUFBTSxRQUFRLEdBQUcsTUFBTSxDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMsQ0FBQztRQUNyQyxRQUFRLENBQUMsMkJBQTJCLENBQUMsR0FBRyxNQUFNLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxDQUFDO1FBQzVELFFBQVEsQ0FBQywyQkFBMkIsQ0FBQyxDQUFDLFFBQVEsQ0FBQyxHQUFHLFFBQVEsQ0FBQztRQUMzRCxRQUFRLENBQUMsMkJBQTJCLENBQUMsQ0FBQyxVQUFVLENBQUMsR0FBRyxVQUFVLENBQUM7UUFDL0QsTUFBTSxDQUFDLGVBQWUsQ0FBQyxVQUFVLENBQUMsa0JBQWtCLENBQUMsUUFBUSxFQUFFLFFBQVEsQ0FBQyxDQUFDO0lBQzFFLENBQUMsQ0FBQyxDQUFDO0lBRUgsSUFBSSxDQUFDLGdDQUFnQyxFQUFFLEdBQUcsRUFBRTtRQUMzQyxNQUFNLFVBQVUsR0FBRyxJQUFJLHdCQUF3QixDQUFDLFVBQVUsRUFBRSxJQUFJLGNBQWMsRUFBRSxDQUFDLENBQUM7UUFFbEYsVUFBVSxDQUFDLEtBQUssQ0FBQyxJQUFJLENBQUMsU0FBUyxDQUFDLEVBQUUsa0NBQWtDLEVBQUUsUUFBUSxFQUFFLG9DQUFvQyxFQUFFLFVBQVUsRUFBRSx1Q0FBdUMsRUFBRSxhQUFhLEVBQUUsbUNBQW1DLEVBQUUsWUFBWSxFQUFFLENBQUMsRUFBRSxFQUFFLE1BQU0sRUFBRSxxQ0FBNkIsRUFBRSxDQUFDLENBQUM7UUFFM1IsTUFBTSxRQUFRLEdBQUcsTUFBTSxDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMsQ0FBQztRQUNyQyxRQUFRLENBQUMsMkJBQTJCLENBQUMsR0FBRyxNQUFNLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxDQUFDO1FBQzVELFFBQVEsQ0FBQywyQkFBMkIsQ0FBQyxDQUFDLFVBQVUsQ0FBQyxHQUFHLFVBQVUsQ0FBQztRQUMvRCxNQUFNLENBQUMsZUFBZSxDQUFDLFVBQVUsQ0FBQyxrQkFBa0IsQ0FBQyxRQUFRLEVBQUUsUUFBUSxDQUFDLENBQUM7SUFDMUUsQ0FBQyxDQUFDLENBQUM7SUFFSCxJQUFJLENBQUMsK0NBQStDLEVBQUUsR0FBRyxFQUFFO1FBQzFELE1BQU0sVUFBVSxHQUFHLElBQUksd0JBQXdCLENBQUMsVUFBVSxFQUFFLElBQUksY0FBYyxFQUFFLENBQUMsQ0FBQztRQUVsRixVQUFVLENBQUMsS0FBSyxDQUFDLElBQUksQ0FBQyxTQUFTLENBQUMsRUFBRSxRQUFRLEVBQUUsRUFBRSxrQ0FBa0MsRUFBRSxRQUFRLEVBQUUsb0NBQW9DLEVBQUUsVUFBVSxFQUFFLDRDQUE0QyxFQUFFLGtCQUFrQixFQUFFLHVDQUF1QyxFQUFFLGFBQWEsRUFBRSxtQ0FBbUMsRUFBRSxZQUFZLEVBQUUsRUFBRSxDQUFDLEVBQUUsRUFBRSxNQUFNLEVBQUUsc0ZBQXNFLEVBQUUsQ0FBQyxDQUFDO1FBRXBaLE1BQU0sUUFBUSxHQUFHLE1BQU0sQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDLENBQUM7UUFDckMsUUFBUSxDQUFDLDJCQUEyQixDQUFDLEdBQUcsTUFBTSxDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMsQ0FBQztRQUM1RCxRQUFRLENBQUMsMkJBQTJCLENBQUMsQ0FBQyxVQUFVLENBQUMsR0FBRyxVQUFVLENBQUM7UUFDL0QsUUFBUSxDQUFDLDJCQUEyQixDQUFDLENBQUMsa0JBQWtCLENBQUMsR0FBRyxrQkFBa0IsQ0FBQztRQUMvRSxNQUFNLENBQUMsZUFBZSxDQUFDLFVBQVUsQ0FBQyxrQkFBa0IsQ0FBQyxTQUFTLEVBQUUsQ0FBQyxFQUFFLFVBQVUsRUFBRSxRQUFRLEVBQUUsYUFBYSxFQUFFLENBQUMsTUFBTSxDQUFDLEVBQUUsTUFBTSxFQUFFLENBQUMsb0NBQW9DLEVBQUUsNENBQTRDLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQztJQUNwTixDQUFDLENBQUMsQ0FBQztJQUVILElBQUksQ0FBQyxrRUFBa0UsRUFBRSxHQUFHLEVBQUU7UUFDN0UsTUFBTSxZQUFZLEdBQThCLEVBQUUsTUFBTSxFQUFFLHdFQUF3RCxFQUFFLENBQUM7UUFDckgsTUFBTSxVQUFVLEdBQUcsSUFBSSx3QkFBd0IsQ0FBQyxVQUFVLEVBQUUsSUFBSSxjQUFjLEVBQUUsQ0FBQyxDQUFDO1FBRWxGLFVBQVUsQ0FBQyxLQUFLLENBQUMsSUFBSSxDQUFDLFNBQVMsQ0FBQyxFQUFFLG9DQUFvQyxFQUFFLFVBQVUsRUFBRSxxREFBcUQsRUFBRSxZQUFZLEVBQUUsQ0FBQyxFQUFFLFlBQVksQ0FBQyxDQUFDO1FBRTFLLElBQUksUUFBUSxHQUFHLE1BQU0sQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDLENBQUM7UUFDbkMsUUFBUSxDQUFDLDJCQUEyQixDQUFDLEdBQUcsTUFBTSxDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMsQ0FBQztRQUM1RCxRQUFRLENBQUMsMkJBQTJCLENBQUMsQ0FBQyxVQUFVLENBQUMsR0FBRyxVQUFVLENBQUM7UUFDL0QsUUFBUSxDQUFDLDJCQUEyQixDQUFDLENBQUMsMkJBQTJCLENBQUMsR0FBRyxZQUFZLENBQUM7UUFDbEYsTUFBTSxDQUFDLGVBQWUsQ0FBQyxVQUFVLENBQUMsa0JBQWtCLENBQUMsUUFBUSxFQUFFLFFBQVEsQ0FBQyxDQUFDO1FBRXpFLE1BQU0scUJBQXFCLEdBQUcsUUFBUSxDQUFDLEVBQUUsQ0FBeUIsdUJBQXVCLENBQUMsYUFBYSxDQUFDLENBQUM7UUFDekcscUJBQXFCLENBQUMscUJBQXFCLENBQUM7WUFDM0MsSUFBSSxFQUFFLDZCQUE2QjtZQUNuQyxNQUFNLEVBQUUsUUFBUTtZQUNoQixZQUFZLEVBQUU7Z0JBQ2IscURBQXFELEVBQUU7b0JBQ3RELE1BQU0sRUFBRSxRQUFRO29CQUNoQixTQUFTLEVBQUUsT0FBTztvQkFDbEIsS0FBSyx3Q0FBZ0M7aUJBQ3JDO2dCQUNELGlEQUFpRCxFQUFFO29CQUNsRCxNQUFNLEVBQUUsUUFBUTtvQkFDaEIsU0FBUyxFQUFFLE9BQU87b0JBQ2xCLEtBQUssb0NBQTRCO2lCQUNqQzthQUNEO1NBQ0QsQ0FBQyxDQUFDO1FBRUgsVUFBVSxDQUFDLE9BQU8sQ0FBQyxZQUFZLENBQUMsQ0FBQztRQUVqQyxRQUFRLEdBQUcsTUFBTSxDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMsQ0FBQztRQUMvQixRQUFRLENBQUMsMkJBQTJCLENBQUMsR0FBRyxNQUFNLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxDQUFDO1FBQzVELFFBQVEsQ0FBQywyQkFBMkIsQ0FBQyxDQUFDLFVBQVUsQ0FBQyxHQUFHLFVBQVUsQ0FBQztRQUMvRCxNQUFNLENBQUMsZUFBZSxDQUFDLFVBQVUsQ0FBQyxrQkFBa0IsQ0FBQyxRQUFRLEVBQUUsUUFBUSxDQUFDLENBQUM7SUFDMUUsQ0FBQyxDQUFDLENBQUM7QUFFSixDQUFDLENBQUMsQ0FBQztBQUVILEtBQUssQ0FBQyxvQ0FBb0MsRUFBRSxHQUFHLEVBQUU7SUFFaEQsdUNBQXVDLEVBQUUsQ0FBQztJQUUxQyxJQUFJLENBQUMsNkNBQTZDLEVBQUUsR0FBRyxFQUFFO1FBQ3hELE1BQU0sVUFBVSxHQUFHLElBQUksa0NBQWtDLENBQUMsT0FBTyxFQUFFLE9BQU8sRUFBRSxJQUFJLGNBQWMsRUFBRSxDQUFDLENBQUM7UUFFbEcsVUFBVSxDQUFDLEtBQUssQ0FBQyxJQUFJLENBQUMsU0FBUyxDQUFDLEVBQUUsU0FBUyxFQUFFLE9BQU8sRUFBRSxPQUFPLEVBQUUsRUFBRSxFQUFFLENBQUMsQ0FBQyxDQUFDO1FBRXRFLE1BQU0sUUFBUSxHQUFHLE1BQU0sQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDLENBQUM7UUFDckMsUUFBUSxDQUFDLE9BQU8sQ0FBQyxHQUFHLE1BQU0sQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDLENBQUM7UUFDeEMsUUFBUSxDQUFDLE9BQU8sQ0FBQyxDQUFDLFNBQVMsQ0FBQyxHQUFHLE9BQU8sQ0FBQztRQUN2QyxRQUFRLENBQUMsT0FBTyxDQUFDLENBQUMsT0FBTyxDQUFDLEdBQUcsRUFBRSxDQUFDO1FBQ2hDLE1BQU0sQ0FBQyxlQUFlLENBQUMsVUFBVSxDQUFDLGtCQUFrQixDQUFDLFFBQVEsRUFBRSxRQUFRLENBQUMsQ0FBQztJQUMxRSxDQUFDLENBQUMsQ0FBQztBQUVKLENBQUMsQ0FBQyxDQUFDO0FBRUgsS0FBSyxDQUFDLHlCQUF5QixFQUFFLEdBQUcsRUFBRTtJQUVyQyx1Q0FBdUMsRUFBRSxDQUFDO0lBRTFDLE1BQU0seUJBQXlCLEdBQUcsb0JBQW9CLENBQUM7UUFDdEQsb0JBQW9CLEVBQUUsSUFBSTtRQUMxQixpQkFBaUIsRUFBRSxFQUFFO1FBQ3JCLGtCQUFrQixFQUFFLENBQUM7UUFDckIsWUFBWSxFQUFFO1lBQ2IsaUJBQWlCLEVBQUUsS0FBSztTQUN4QjtRQUNELGNBQWMsRUFBRSxRQUFRO1FBQ3hCLHNCQUFzQixFQUFFLEtBQUs7UUFDN0IscUJBQXFCLEVBQUUsSUFBSTtLQUMzQixDQUFDLENBQUM7SUFFSCxJQUFJLENBQUMsa0NBQWtDLEVBQUUsR0FBRyxFQUFFO1FBQzdDLE1BQU0sU0FBUyxHQUFHLElBQUksU0FBUyxDQUFDLEdBQUcsRUFBRSxDQUFDLElBQUksZUFBZSxDQUFDLEVBQUUsS0FBSyxFQUFFLENBQUMsRUFBRSxJQUFJLEVBQUUsR0FBRyxFQUFFLEdBQUcsRUFBRSxHQUFHLENBQUMsSUFBSSxDQUFDLFNBQVMsQ0FBQyxFQUFFLENBQUMsRUFBRSxJQUFJLGVBQWUsQ0FBQyxFQUFFLEtBQUssRUFBRSxDQUFDLEVBQUUsSUFBSSxFQUFFLEdBQUcsRUFBRSxHQUFHLEVBQUUsR0FBRyxDQUFDLElBQUksQ0FBQyxTQUFTLENBQUMsRUFBRSxDQUFDLEVBQUUsSUFBSSxlQUFlLENBQUMsRUFBRSxLQUFLLEVBQUUsQ0FBQyxFQUFFLElBQUksRUFBRSxHQUFHLEVBQUUsR0FBRyxFQUFFLEdBQUcsQ0FBQyxJQUFJLENBQUMsU0FBUyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUMvUCxNQUFNLGNBQWMsR0FBRyxJQUFJLGFBQWEsQ0FBQyxrQkFBa0IsQ0FBQyxnQkFBZ0IsQ0FBQyxJQUFJLGNBQWMsRUFBRSxDQUFDLEVBQUUsa0JBQWtCLENBQUMsZ0JBQWdCLENBQUMsSUFBSSxjQUFjLEVBQUUsQ0FBQyxFQUFFLGtCQUFrQixDQUFDLGdCQUFnQixDQUFDLElBQUksY0FBYyxFQUFFLENBQUMsRUFBRSxrQkFBa0IsQ0FBQyxnQkFBZ0IsQ0FBQyxJQUFJLGNBQWMsRUFBRSxDQUFDLEVBQUUsa0JBQWtCLENBQUMsZ0JBQWdCLENBQUMsSUFBSSxjQUFjLEVBQUUsQ0FBQyxFQUFFLGtCQUFrQixDQUFDLGdCQUFnQixDQUFDLElBQUksY0FBYyxFQUFFLENBQUMsRUFBRSxJQUFJLFdBQVcsRUFBc0IsRUFBRSxrQkFBa0IsQ0FBQyxnQkFBZ0IsQ0FBQyxJQUFJLGNBQWMsRUFBRSxDQUFDLEVBQUUsSUFBSSxXQUFXLEVBQXNCLEVBQUUsU0FBUyxFQUFFLElBQUksY0FBYyxFQUFFLENBQUMsQ0FBQztRQUNyakIsY0FBYyxDQUFDLDBCQUEwQixDQUFDLHlCQUF5QixDQUFDLENBQUM7UUFDckUsY0FBYyxDQUFDLDRCQUE0QixDQUFDLG9CQUFvQixDQUFDLEVBQUUsY0FBYyxFQUFFLFFBQVEsRUFBRSxjQUFjLEVBQUUsRUFBRSxxQkFBcUIsRUFBRSxLQUFLLEVBQUUsRUFBRSxDQUFDLENBQUMsQ0FBQztRQUNsSixjQUFjLENBQUMsNEJBQTRCLENBQUMsb0JBQW9CLENBQUMsRUFBRSxvQkFBb0IsRUFBRSxJQUFJLEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFDbEcsY0FBYyxDQUFDLHlCQUF5QixDQUFDLEdBQUcsQ0FBQyxJQUFJLENBQUMsU0FBUyxDQUFDLEVBQUUsb0JBQW9CLENBQUMsRUFBRSxpQkFBaUIsRUFBRSxFQUFFLEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFDL0csY0FBYyxDQUFDLHlCQUF5QixDQUFDLEdBQUcsQ0FBQyxJQUFJLENBQUMsU0FBUyxDQUFDLEVBQUUsb0JBQW9CLENBQUMsRUFBRSxpQkFBaUIsRUFBRSxJQUFJLEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFFakgsTUFBTSxjQUFjLEdBQUcsSUFBSSxhQUFhLENBQUMsa0JBQWtCLENBQUMsZ0JBQWdCLENBQUMsSUFBSSxjQUFjLEVBQUUsQ0FBQyxFQUFFLGtCQUFrQixDQUFDLGdCQUFnQixDQUFDLElBQUksY0FBYyxFQUFFLENBQUMsRUFBRSxrQkFBa0IsQ0FBQyxnQkFBZ0IsQ0FBQyxJQUFJLGNBQWMsRUFBRSxDQUFDLEVBQUUsa0JBQWtCLENBQUMsZ0JBQWdCLENBQUMsSUFBSSxjQUFjLEVBQUUsQ0FBQyxFQUFFLGtCQUFrQixDQUFDLGdCQUFnQixDQUFDLElBQUksY0FBYyxFQUFFLENBQUMsRUFBRSxrQkFBa0IsQ0FBQyxnQkFBZ0IsQ0FBQyxJQUFJLGNBQWMsRUFBRSxDQUFDLEVBQUUsSUFBSSxXQUFXLEVBQXNCLEVBQUUsa0JBQWtCLENBQUMsZ0JBQWdCLENBQUMsSUFBSSxjQUFjLEVBQUUsQ0FBQyxFQUFFLElBQUksV0FBVyxFQUFzQixFQUFFLFNBQVMsRUFBRSxJQUFJLGNBQWMsRUFBRSxDQUFDLENBQUM7UUFDcmpCLGNBQWMsQ0FBQywwQkFBMEIsQ0FBQyx5QkFBeUIsQ0FBQyxDQUFDO1FBQ3JFLGNBQWMsQ0FBQyw0QkFBNEIsQ0FBQyxvQkFBb0IsQ0FBQyxFQUFFLGNBQWMsRUFBRSxRQUFRLEVBQUUsY0FBYyxFQUFFLEVBQUUscUJBQXFCLEVBQUUsS0FBSyxFQUFFLEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFDbEosY0FBYyxDQUFDLDRCQUE0QixDQUFDLG9CQUFvQixDQUFDLEVBQUUsb0JBQW9CLEVBQUUsSUFBSSxFQUFFLENBQUMsQ0FBQyxDQUFDO1FBQ2xHLGNBQWMsQ0FBQyx5QkFBeUIsQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLFNBQVMsQ0FBQyxFQUFFLG9CQUFvQixDQUFDLEVBQUUsaUJBQWlCLEVBQUUsRUFBRSxFQUFFLENBQUMsQ0FBQyxDQUFDO1FBQy9HLGNBQWMsQ0FBQyx5QkFBeUIsQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLFNBQVMsQ0FBQyxFQUFFLG9CQUFvQixDQUFDLEVBQUUsaUJBQWlCLEVBQUUsSUFBSSxFQUFFLENBQUMsQ0FBQyxDQUFDO1FBRWpILE1BQU0sTUFBTSxHQUFHLGNBQWMsQ0FBQyxPQUFPLENBQUMsY0FBYyxDQUFDLENBQUM7UUFFdEQsTUFBTSxDQUFDLGVBQWUsQ0FBQyxNQUFNLEVBQUUsRUFBRSxJQUFJLEVBQUUsRUFBRSxFQUFFLFNBQVMsRUFBRSxFQUFFLEVBQUUsQ0FBQyxDQUFDO0lBQzdELENBQUMsQ0FBQyxDQUFDO0lBRUgsSUFBSSxDQUFDLHVDQUF1QyxFQUFFLEdBQUcsRUFBRTtRQUNsRCxNQUFNLFNBQVMsR0FBRyxJQUFJLFNBQVMsQ0FBQyxHQUFHLEVBQUUsQ0FBQyxJQUFJLGVBQWUsQ0FBQyxFQUFFLEtBQUssRUFBRSxDQUFDLEVBQUUsSUFBSSxFQUFFLEdBQUcsRUFBRSxHQUFHLEVBQUUsR0FBRyxDQUFDLElBQUksQ0FBQyxTQUFTLENBQUMsRUFBRSxDQUFDLEVBQUUsSUFBSSxlQUFlLENBQUMsRUFBRSxLQUFLLEVBQUUsQ0FBQyxFQUFFLElBQUksRUFBRSxHQUFHLEVBQUUsR0FBRyxFQUFFLEdBQUcsQ0FBQyxJQUFJLENBQUMsU0FBUyxDQUFDLEVBQUUsQ0FBQyxFQUFFLElBQUksZUFBZSxDQUFDLEVBQUUsS0FBSyxFQUFFLENBQUMsRUFBRSxJQUFJLEVBQUUsR0FBRyxFQUFFLEdBQUcsRUFBRSxHQUFHLENBQUMsSUFBSSxDQUFDLFNBQVMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFDL1AsTUFBTSxjQUFjLEdBQUcsSUFBSSxhQUFhLENBQUMsa0JBQWtCLENBQUMsZ0JBQWdCLENBQUMsSUFBSSxjQUFjLEVBQUUsQ0FBQyxFQUFFLGtCQUFrQixDQUFDLGdCQUFnQixDQUFDLElBQUksY0FBYyxFQUFFLENBQUMsRUFBRSxrQkFBa0IsQ0FBQyxnQkFBZ0IsQ0FBQyxJQUFJLGNBQWMsRUFBRSxDQUFDLEVBQUUsa0JBQWtCLENBQUMsZ0JBQWdCLENBQUMsSUFBSSxjQUFjLEVBQUUsQ0FBQyxFQUFFLGtCQUFrQixDQUFDLGdCQUFnQixDQUFDLElBQUksY0FBYyxFQUFFLENBQUMsRUFBRSxrQkFBa0IsQ0FBQyxnQkFBZ0IsQ0FBQyxJQUFJLGNBQWMsRUFBRSxDQUFDLEVBQUUsSUFBSSxXQUFXLEVBQXNCLEVBQUUsa0JBQWtCLENBQUMsZ0JBQWdCLENBQUMsSUFBSSxjQUFjLEVBQUUsQ0FBQyxFQUFFLElBQUksV0FBVyxFQUFzQixFQUFFLFNBQVMsRUFBRSxJQUFJLGNBQWMsRUFBRSxDQUFDLENBQUM7UUFDcmpCLGNBQWMsQ0FBQywwQkFBMEIsQ0FBQyx5QkFBeUIsQ0FBQyxDQUFDO1FBQ3JFLGNBQWMsQ0FBQyw0QkFBNEIsQ0FBQyxvQkFBb0IsQ0FBQyxFQUFFLGNBQWMsRUFBRSxRQUFRLEVBQUUsY0FBYyxFQUFFLEVBQUUscUJBQXFCLEVBQUUsS0FBSyxFQUFFLEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFDbEosY0FBYyxDQUFDLDRCQUE0QixDQUFDLG9CQUFvQixDQUFDLEVBQUUsb0JBQW9CLEVBQUUsSUFBSSxFQUFFLENBQUMsQ0FBQyxDQUFDO1FBQ2xHLGNBQWMsQ0FBQyx5QkFBeUIsQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLFNBQVMsQ0FBQyxFQUFFLG9CQUFvQixDQUFDLEVBQUUsaUJBQWlCLEVBQUUsRUFBRSxFQUFFLENBQUMsQ0FBQyxDQUFDO1FBQy9HLGNBQWMsQ0FBQyx5QkFBeUIsQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLFNBQVMsQ0FBQyxFQUFFLG9CQUFvQixDQUFDLEVBQUUsaUJBQWlCLEVBQUUsSUFBSSxFQUFFLENBQUMsQ0FBQyxDQUFDO1FBRWpILE1BQU0sY0FBYyxHQUFHLElBQUksYUFBYSxDQUFDLGtCQUFrQixDQUFDLGdCQUFnQixDQUFDLElBQUksY0FBYyxFQUFFLENBQUMsRUFBRSxrQkFBa0IsQ0FBQyxnQkFBZ0IsQ0FBQyxJQUFJLGNBQWMsRUFBRSxDQUFDLEVBQUUsa0JBQWtCLENBQUMsZ0JBQWdCLENBQUMsSUFBSSxjQUFjLEVBQUUsQ0FBQyxFQUFFLGtCQUFrQixDQUFDLGdCQUFnQixDQUFDLElBQUksY0FBYyxFQUFFLENBQUMsRUFBRSxrQkFBa0IsQ0FBQyxnQkFBZ0IsQ0FBQyxJQUFJLGNBQWMsRUFBRSxDQUFDLEVBQUUsa0JBQWtCLENBQUMsZ0JBQWdCLENBQUMsSUFBSSxjQUFjLEVBQUUsQ0FBQyxFQUFFLElBQUksV0FBVyxFQUFzQixFQUFFLGtCQUFrQixDQUFDLGdCQUFnQixDQUFDLElBQUksY0FBYyxFQUFFLENBQUMsRUFBRSxJQUFJLFdBQVcsRUFBc0IsRUFBRSxTQUFTLEVBQUUsSUFBSSxjQUFjLEVBQUUsQ0FBQyxDQUFDO1FBQ3JqQixjQUFjLENBQUMsMEJBQTBCLENBQUMseUJBQXlCLENBQUMsQ0FBQztRQUNyRSxjQUFjLENBQUMsNEJBQTRCLENBQUMsb0JBQW9CLENBQUMsRUFBRSxzQkFBc0IsRUFBRSxJQUFJLEVBQUUsY0FBYyxFQUFFLEVBQUUscUJBQXFCLEVBQUUsSUFBSSxFQUFFLEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFDckosY0FBYyxDQUFDLDRCQUE0QixDQUFDLG9CQUFvQixDQUFDLEVBQUUsaUJBQWlCLEVBQUUsRUFBRSxFQUFFLENBQUMsQ0FBQyxDQUFDO1FBQzdGLGNBQWMsQ0FBQyx5QkFBeUIsQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLFNBQVMsQ0FBQyxFQUFFLG9CQUFvQixDQUFDLEVBQUUscUJBQXFCLEVBQUUsSUFBSSxFQUFFLENBQUMsQ0FBQyxDQUFDO1FBQ3JILGNBQWMsQ0FBQyx5QkFBeUIsQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLFNBQVMsQ0FBQyxFQUFFLG9CQUFvQixDQUFDO1lBQ2xGLFlBQVksRUFBRTtnQkFDYixpQkFBaUIsRUFBRSxJQUFJO2dCQUN2QixvQkFBb0IsRUFBRSxVQUFVO2FBQ2hDO1NBQ0QsQ0FBQyxDQUFDLENBQUM7UUFFSixNQUFNLE1BQU0sR0FBRyxjQUFjLENBQUMsT0FBTyxDQUFDLGNBQWMsQ0FBQyxDQUFDO1FBRXRELE1BQU0sQ0FBQyxlQUFlLENBQUMsTUFBTSxFQUFFLEVBQUUsSUFBSSxFQUFFLENBQUMsaUJBQWlCLEVBQUUsaUJBQWlCLEVBQUUsWUFBWSxFQUFFLGNBQWMsRUFBRSxzQkFBc0IsRUFBRSxjQUFjLENBQUMsRUFBRSxTQUFTLEVBQUUsQ0FBQyxDQUFDLFVBQVUsRUFBRSxDQUFDLG9CQUFvQixFQUFFLGlCQUFpQixDQUFDLENBQUMsRUFBRSxDQUFDLFlBQVksRUFBRSxDQUFDLHFCQUFxQixDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQztJQUN2USxDQUFDLENBQUMsQ0FBQztBQUdKLENBQUMsQ0FBQyxDQUFDO0FBRUgsU0FBUyxvQkFBb0IsQ0FBQyxHQUE0QjtJQUN6RCxNQUFNLE1BQU0sR0FBRyxJQUFJLHdCQUF3QixDQUFDLE1BQU0sRUFBRSxJQUFJLGNBQWMsRUFBRSxDQUFDLENBQUM7SUFDMUUsTUFBTSxDQUFDLEtBQUssQ0FBQyxJQUFJLENBQUMsU0FBUyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUM7SUFDbEMsT0FBTyxNQUFNLENBQUMsa0JBQWtCLENBQUM7QUFDbEMsQ0FBQyJ9