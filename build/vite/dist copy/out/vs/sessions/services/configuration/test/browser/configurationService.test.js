/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { URI } from '../../../../../base/common/uri.js';
import { Registry } from '../../../../../platform/registry/common/platform.js';
import { Extensions as ConfigurationExtensions } from '../../../../../platform/configuration/common/configurationRegistry.js';
import { FileService } from '../../../../../platform/files/common/fileService.js';
import { NullLogService } from '../../../../../platform/log/common/log.js';
import { NullPolicyService } from '../../../../../platform/policy/common/policy.js';
import { VSBuffer } from '../../../../../base/common/buffer.js';
import { UriIdentityService } from '../../../../../platform/uriIdentity/common/uriIdentityService.js';
import { InMemoryFileSystemProvider } from '../../../../../platform/files/common/inMemoryFilesystemProvider.js';
import { joinPath } from '../../../../../base/common/resources.js';
import { Schemas } from '../../../../../base/common/network.js';
import { UserDataProfilesService } from '../../../../../platform/userDataProfile/common/userDataProfile.js';
import { UserDataProfileService } from '../../../../../workbench/services/userDataProfile/common/userDataProfileService.js';
import { FileUserDataProvider } from '../../../../../platform/userData/common/fileUserDataProvider.js';
import { TestEnvironmentService } from '../../../../../workbench/test/browser/workbenchTestServices.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { runWithFakedTimers } from '../../../../../base/test/common/timeTravelScheduler.js';
import { ConfigurationService } from '../../browser/configurationService.js';
import { SessionsWorkspaceContextService } from '../../../workspace/browser/workspaceContextService.js';
import { getWorkspaceIdentifier } from '../../../../../workbench/services/workspaces/browser/workspaces.js';
import { Event } from '../../../../../base/common/event.js';
const ROOT = URI.file('tests').with({ scheme: 'vscode-tests' });
suite('Sessions ConfigurationService', () => {
    let testObject;
    let workspaceService;
    let fileService;
    let userDataProfileService;
    const configurationRegistry = Registry.as(ConfigurationExtensions.Configuration);
    const disposables = ensureNoDisposablesAreLeakedInTestSuite();
    suiteSetup(() => {
        configurationRegistry.registerConfiguration({
            'id': '_test_sessions',
            'type': 'object',
            'properties': {
                'sessionsConfigurationService.testSetting': {
                    'type': 'string',
                    'default': 'defaultValue',
                    scope: 5 /* ConfigurationScope.RESOURCE */
                },
                'sessionsConfigurationService.machineSetting': {
                    'type': 'string',
                    'default': 'defaultValue',
                    scope: 2 /* ConfigurationScope.MACHINE */
                },
                'sessionsConfigurationService.applicationSetting': {
                    'type': 'string',
                    'default': 'defaultValue',
                    scope: 1 /* ConfigurationScope.APPLICATION */
                },
            }
        });
    });
    setup(async () => {
        const logService = new NullLogService();
        fileService = disposables.add(new FileService(logService));
        const fileSystemProvider = disposables.add(new InMemoryFileSystemProvider());
        disposables.add(fileService.registerProvider(ROOT.scheme, fileSystemProvider));
        const environmentService = TestEnvironmentService;
        const uriIdentityService = disposables.add(new UriIdentityService(fileService));
        const userDataProfilesService = disposables.add(new UserDataProfilesService(environmentService, fileService, uriIdentityService, logService));
        disposables.add(fileService.registerProvider(Schemas.vscodeUserData, disposables.add(new FileUserDataProvider(ROOT.scheme, fileSystemProvider, Schemas.vscodeUserData, userDataProfilesService, uriIdentityService, logService))));
        userDataProfileService = disposables.add(new UserDataProfileService(userDataProfilesService.defaultProfile));
        const configResource = joinPath(ROOT, 'agent-sessions.code-workspace');
        await fileService.writeFile(configResource, VSBuffer.fromString(JSON.stringify({ folders: [] })));
        workspaceService = disposables.add(new SessionsWorkspaceContextService(getWorkspaceIdentifier(configResource), uriIdentityService));
        testObject = disposables.add(new ConfigurationService(userDataProfileService, workspaceService, uriIdentityService, fileService, new NullPolicyService(), logService));
        await testObject.initialize();
    });
    // #region Reading
    test('defaults', () => {
        assert.strictEqual(testObject.getValue('sessionsConfigurationService.testSetting'), 'defaultValue');
        assert.strictEqual(testObject.getValue('sessionsConfigurationService.machineSetting'), 'defaultValue');
        assert.strictEqual(testObject.getValue('sessionsConfigurationService.applicationSetting'), 'defaultValue');
    });
    test('user settings override defaults', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
        await fileService.writeFile(userDataProfileService.currentProfile.settingsResource, VSBuffer.fromString('{ "sessionsConfigurationService.testSetting": "userValue" }'));
        await testObject.reloadConfiguration();
        assert.strictEqual(testObject.getValue('sessionsConfigurationService.testSetting'), 'userValue');
    }));
    test('workspace folder settings override user settings', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
        const folder = joinPath(ROOT, 'myFolder');
        await fileService.createFolder(folder);
        await fileService.writeFile(userDataProfileService.currentProfile.settingsResource, VSBuffer.fromString('{ "sessionsConfigurationService.testSetting": "userValue" }'));
        await testObject.reloadConfiguration();
        await fileService.writeFile(joinPath(folder, '.vscode', 'settings.json'), VSBuffer.fromString('{ "sessionsConfigurationService.testSetting": "folderValue" }'));
        await workspaceService.addFolders([{ uri: folder }]);
        assert.strictEqual(testObject.getValue('sessionsConfigurationService.testSetting', { resource: folder }), 'folderValue');
    }));
    test('folder settings are read when folders are added', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
        const folder = joinPath(ROOT, 'addedFolder');
        await fileService.createFolder(folder);
        await fileService.writeFile(joinPath(folder, '.vscode', 'settings.json'), VSBuffer.fromString('{ "sessionsConfigurationService.testSetting": "folderValue" }'));
        await workspaceService.addFolders([{ uri: folder }]);
        assert.strictEqual(testObject.getValue('sessionsConfigurationService.testSetting', { resource: folder }), 'folderValue');
    }));
    test('folder settings are removed when folders are removed', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
        const folder = joinPath(ROOT, 'removedFolder');
        await fileService.createFolder(folder);
        await fileService.writeFile(joinPath(folder, '.vscode', 'settings.json'), VSBuffer.fromString('{ "sessionsConfigurationService.testSetting": "folderValue" }'));
        await workspaceService.addFolders([{ uri: folder }]);
        assert.strictEqual(testObject.getValue('sessionsConfigurationService.testSetting', { resource: folder }), 'folderValue');
        await workspaceService.removeFolders([folder]);
        assert.strictEqual(testObject.getValue('sessionsConfigurationService.testSetting', { resource: folder }), 'defaultValue');
    }));
    test('configuration change event is fired when folders with settings are removed', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
        const folder = joinPath(ROOT, 'removedFolder2');
        await fileService.createFolder(folder);
        await fileService.writeFile(joinPath(folder, '.vscode', 'settings.json'), VSBuffer.fromString('{ "sessionsConfigurationService.testSetting": "folderValue" }'));
        await workspaceService.addFolders([{ uri: folder }]);
        assert.strictEqual(testObject.getValue('sessionsConfigurationService.testSetting', { resource: folder }), 'folderValue');
        const promise = Event.toPromise(testObject.onDidChangeConfiguration);
        await workspaceService.removeFolders([folder]);
        const event = await promise;
        assert.ok(event.affectsConfiguration('sessionsConfigurationService.testSetting'));
        assert.strictEqual(testObject.getValue('sessionsConfigurationService.testSetting', { resource: folder }), 'defaultValue');
    }));
    test('configuration change event is fired on user settings change', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
        const promise = Event.toPromise(testObject.onDidChangeConfiguration);
        await fileService.writeFile(userDataProfileService.currentProfile.settingsResource, VSBuffer.fromString('{ "sessionsConfigurationService.testSetting": "userValue" }'));
        await testObject.reloadConfiguration();
        const event = await promise;
        assert.ok(event.affectsConfiguration('sessionsConfigurationService.testSetting'));
    }));
    test('inspect returns correct values per layer', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
        const folder = joinPath(ROOT, 'inspectFolder');
        await fileService.createFolder(folder);
        await fileService.writeFile(userDataProfileService.currentProfile.settingsResource, VSBuffer.fromString('{ "sessionsConfigurationService.testSetting": "userValue" }'));
        await testObject.reloadConfiguration();
        await fileService.writeFile(joinPath(folder, '.vscode', 'settings.json'), VSBuffer.fromString('{ "sessionsConfigurationService.testSetting": "folderValue" }'));
        await workspaceService.addFolders([{ uri: folder }]);
        const inspection = testObject.inspect('sessionsConfigurationService.testSetting', { resource: folder });
        assert.strictEqual(inspection.defaultValue, 'defaultValue');
        assert.strictEqual(inspection.userValue, 'userValue');
        assert.strictEqual(inspection.workspaceFolderValue, 'folderValue');
    }));
    test('application settings are not read from workspace folder', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
        const folder = joinPath(ROOT, 'appFolder');
        await fileService.createFolder(folder);
        await fileService.writeFile(joinPath(folder, '.vscode', 'settings.json'), VSBuffer.fromString('{ "sessionsConfigurationService.applicationSetting": "folderValue" }'));
        await workspaceService.addFolders([{ uri: folder }]);
        assert.strictEqual(testObject.getValue('sessionsConfigurationService.applicationSetting', { resource: folder }), 'defaultValue');
    }));
    test('machine settings are not read from workspace folder', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
        const folder = joinPath(ROOT, 'machineFolder');
        await fileService.createFolder(folder);
        await fileService.writeFile(joinPath(folder, '.vscode', 'settings.json'), VSBuffer.fromString('{ "sessionsConfigurationService.machineSetting": "folderValue" }'));
        await workspaceService.addFolders([{ uri: folder }]);
        assert.strictEqual(testObject.getValue('sessionsConfigurationService.machineSetting', { resource: folder }), 'defaultValue');
    }));
    test('folder settings change fires configuration change event', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
        const folder = joinPath(ROOT, 'changeFolder');
        await fileService.createFolder(folder);
        await fileService.writeFile(joinPath(folder, '.vscode', 'settings.json'), VSBuffer.fromString('{ "sessionsConfigurationService.testSetting": "initialValue" }'));
        await workspaceService.addFolders([{ uri: folder }]);
        assert.strictEqual(testObject.getValue('sessionsConfigurationService.testSetting', { resource: folder }), 'initialValue');
        const promise = Event.toPromise(testObject.onDidChangeConfiguration);
        await fileService.writeFile(joinPath(folder, '.vscode', 'settings.json'), VSBuffer.fromString('{ "sessionsConfigurationService.testSetting": "updatedValue" }'));
        const event = await promise;
        assert.ok(event.affectsConfiguration('sessionsConfigurationService.testSetting'));
        assert.strictEqual(testObject.getValue('sessionsConfigurationService.testSetting', { resource: folder }), 'updatedValue');
    }));
    // #endregion
    // #region Writing
    test('updateValue writes to user settings', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
        await testObject.updateValue('sessionsConfigurationService.testSetting', 'writtenValue');
        assert.strictEqual(testObject.getValue('sessionsConfigurationService.testSetting'), 'writtenValue');
    }));
    test('updateValue persists to settings file', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
        await testObject.updateValue('sessionsConfigurationService.testSetting', 'persistedValue');
        const content = (await fileService.readFile(userDataProfileService.currentProfile.settingsResource)).value.toString();
        assert.ok(content.includes('"sessionsConfigurationService.testSetting"'));
        assert.ok(content.includes('persistedValue'));
    }));
    test('updateValue fires change event', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
        const promise = Event.toPromise(testObject.onDidChangeConfiguration);
        await testObject.updateValue('sessionsConfigurationService.testSetting', 'eventValue');
        const event = await promise;
        assert.ok(event.affectsConfiguration('sessionsConfigurationService.testSetting'));
    }));
    test('updateValue removes setting when value equals default', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
        await testObject.updateValue('sessionsConfigurationService.testSetting', 'nonDefault');
        assert.strictEqual(testObject.getValue('sessionsConfigurationService.testSetting'), 'nonDefault');
        await testObject.updateValue('sessionsConfigurationService.testSetting', 'defaultValue');
        const content = (await fileService.readFile(userDataProfileService.currentProfile.settingsResource)).value.toString();
        assert.ok(!content.includes('sessionsConfigurationService.testSetting'));
    }));
    test('updateValue can update multiple settings', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
        await testObject.updateValue('sessionsConfigurationService.testSetting', 'value1');
        await testObject.updateValue('sessionsConfigurationService.machineSetting', 'value2');
        assert.strictEqual(testObject.getValue('sessionsConfigurationService.testSetting'), 'value1');
        assert.strictEqual(testObject.getValue('sessionsConfigurationService.machineSetting'), 'value2');
    }));
    test('updateValue with language override', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
        await testObject.updateValue('sessionsConfigurationService.testSetting', 'langValue', { overrideIdentifier: 'jsonc' });
        assert.strictEqual(testObject.getValue('sessionsConfigurationService.testSetting', { overrideIdentifier: 'jsonc' }), 'langValue');
        assert.strictEqual(testObject.getValue('sessionsConfigurationService.testSetting'), 'defaultValue');
    }));
    test('updateValue is reflected in inspect', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
        await testObject.updateValue('sessionsConfigurationService.testSetting', 'inspectedValue');
        const inspection = testObject.inspect('sessionsConfigurationService.testSetting');
        assert.strictEqual(inspection.defaultValue, 'defaultValue');
        assert.strictEqual(inspection.userValue, 'inspectedValue');
    }));
    // #endregion
    // #region Workspace Folder - Read and Write
    test('read setting from workspace folder', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
        const folder = joinPath(ROOT, 'readFolder');
        await fileService.createFolder(folder);
        await fileService.writeFile(joinPath(folder, '.vscode', 'settings.json'), VSBuffer.fromString('{ "sessionsConfigurationService.testSetting": "folderValue" }'));
        await workspaceService.addFolders([{ uri: folder }]);
        assert.strictEqual(testObject.getValue('sessionsConfigurationService.testSetting', { resource: folder }), 'folderValue');
        assert.strictEqual(testObject.getValue('sessionsConfigurationService.testSetting'), 'defaultValue');
    }));
    test('write setting to workspace folder', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
        const folder = joinPath(ROOT, 'writeFolder');
        await fileService.createFolder(folder);
        await workspaceService.addFolders([{ uri: folder }]);
        await testObject.updateValue('sessionsConfigurationService.testSetting', 'writtenFolderValue', { resource: folder }, 6 /* ConfigurationTarget.WORKSPACE_FOLDER */);
        assert.strictEqual(testObject.getValue('sessionsConfigurationService.testSetting', { resource: folder }), 'writtenFolderValue');
    }));
    test('write setting to workspace folder persists to folder settings file', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
        const folder = joinPath(ROOT, 'persistFolder');
        await fileService.createFolder(folder);
        await workspaceService.addFolders([{ uri: folder }]);
        await testObject.updateValue('sessionsConfigurationService.testSetting', 'persistedFolderValue', { resource: folder }, 6 /* ConfigurationTarget.WORKSPACE_FOLDER */);
        const content = (await fileService.readFile(joinPath(folder, '.vscode', 'settings.json'))).value.toString();
        assert.ok(content.includes('"sessionsConfigurationService.testSetting"'));
        assert.ok(content.includes('persistedFolderValue'));
    }));
    test('write setting to workspace folder does not affect user settings', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
        const folder = joinPath(ROOT, 'isolateFolder');
        await fileService.createFolder(folder);
        await workspaceService.addFolders([{ uri: folder }]);
        await testObject.updateValue('sessionsConfigurationService.testSetting', 'folderOnly', { resource: folder }, 6 /* ConfigurationTarget.WORKSPACE_FOLDER */);
        assert.strictEqual(testObject.getValue('sessionsConfigurationService.testSetting', { resource: folder }), 'folderOnly');
        assert.strictEqual(testObject.getValue('sessionsConfigurationService.testSetting'), 'defaultValue');
    }));
    test('workspace folder setting overrides user setting for resource', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
        const folder = joinPath(ROOT, 'overrideFolder');
        await fileService.createFolder(folder);
        await workspaceService.addFolders([{ uri: folder }]);
        await testObject.updateValue('sessionsConfigurationService.testSetting', 'userValue');
        await testObject.updateValue('sessionsConfigurationService.testSetting', 'folderValue', { resource: folder }, 6 /* ConfigurationTarget.WORKSPACE_FOLDER */);
        assert.strictEqual(testObject.getValue('sessionsConfigurationService.testSetting', { resource: folder }), 'folderValue');
        assert.strictEqual(testObject.getValue('sessionsConfigurationService.testSetting'), 'userValue');
    }));
    test('inspect shows workspace folder value after write', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
        const folder = joinPath(ROOT, 'inspectWriteFolder');
        await fileService.createFolder(folder);
        await workspaceService.addFolders([{ uri: folder }]);
        await testObject.updateValue('sessionsConfigurationService.testSetting', 'userVal');
        await testObject.updateValue('sessionsConfigurationService.testSetting', 'folderVal', { resource: folder }, 6 /* ConfigurationTarget.WORKSPACE_FOLDER */);
        const inspection = testObject.inspect('sessionsConfigurationService.testSetting', { resource: folder });
        assert.strictEqual(inspection.defaultValue, 'defaultValue');
        assert.strictEqual(inspection.userValue, 'userVal');
        assert.strictEqual(inspection.workspaceFolderValue, 'folderVal');
    }));
    test('removing folder clears its written settings', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
        const folder = joinPath(ROOT, 'clearFolder');
        await fileService.createFolder(folder);
        await workspaceService.addFolders([{ uri: folder }]);
        await testObject.updateValue('sessionsConfigurationService.testSetting', 'folderValue', { resource: folder }, 6 /* ConfigurationTarget.WORKSPACE_FOLDER */);
        assert.strictEqual(testObject.getValue('sessionsConfigurationService.testSetting', { resource: folder }), 'folderValue');
        await workspaceService.removeFolders([folder]);
        assert.strictEqual(testObject.getValue('sessionsConfigurationService.testSetting', { resource: folder }), 'defaultValue');
    }));
    // #endregion
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY29uZmlndXJhdGlvblNlcnZpY2UudGVzdC5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3Nlc3Npb25zL3NlcnZpY2VzL2NvbmZpZ3VyYXRpb24vdGVzdC9icm93c2VyL2NvbmZpZ3VyYXRpb25TZXJ2aWNlLnRlc3QudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxNQUFNLE1BQU0sUUFBUSxDQUFDO0FBQzVCLE9BQU8sRUFBRSxHQUFHLEVBQUUsTUFBTSxtQ0FBbUMsQ0FBQztBQUN4RCxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0scURBQXFELENBQUM7QUFDL0UsT0FBTyxFQUEwQixVQUFVLElBQUksdUJBQXVCLEVBQXNCLE1BQU0sdUVBQXVFLENBQUM7QUFFMUssT0FBTyxFQUFFLFdBQVcsRUFBRSxNQUFNLHFEQUFxRCxDQUFDO0FBQ2xGLE9BQU8sRUFBRSxjQUFjLEVBQUUsTUFBTSwyQ0FBMkMsQ0FBQztBQUMzRSxPQUFPLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSxpREFBaUQsQ0FBQztBQUNwRixPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFDaEUsT0FBTyxFQUFFLGtCQUFrQixFQUFFLE1BQU0sa0VBQWtFLENBQUM7QUFDdEcsT0FBTyxFQUFFLDBCQUEwQixFQUFFLE1BQU0sb0VBQW9FLENBQUM7QUFDaEgsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLHlDQUF5QyxDQUFDO0FBQ25FLE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSx1Q0FBdUMsQ0FBQztBQUNoRSxPQUFPLEVBQUUsdUJBQXVCLEVBQUUsTUFBTSxtRUFBbUUsQ0FBQztBQUM1RyxPQUFPLEVBQUUsc0JBQXNCLEVBQUUsTUFBTSxvRkFBb0YsQ0FBQztBQUM1SCxPQUFPLEVBQUUsb0JBQW9CLEVBQUUsTUFBTSxpRUFBaUUsQ0FBQztBQUN2RyxP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