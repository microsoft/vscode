/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { VSBuffer } from '../../../../base/common/buffer.js';
import { Event } from '../../../../base/common/event.js';
import { runWithFakedTimers } from '../../../../base/test/common/timeTravelScheduler.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { IConfigurationService } from '../../../configuration/common/configuration.js';
import { Extensions } from '../../../configuration/common/configurationRegistry.js';
import { IFileService } from '../../../files/common/files.js';
import { Registry } from '../../../registry/common/platform.js';
import { IUserDataProfilesService } from '../../../userDataProfile/common/userDataProfile.js';
import { parseSettingsSyncContent } from '../../common/settingsSync.js';
import { IUserDataSyncStoreService, UserDataSyncError } from '../../common/userDataSync.js';
import { UserDataSyncClient, UserDataSyncTestServer } from './userDataSyncClient.js';
suite('SettingsSync - Auto', () => {
    const server = new UserDataSyncTestServer();
    let client;
    let testObject;
    teardown(async () => {
        await client.instantiationService.get(IUserDataSyncStoreService).clear();
    });
    const disposableStore = ensureNoDisposablesAreLeakedInTestSuite();
    setup(async () => {
        Registry.as(Extensions.Configuration).registerConfiguration({
            'id': 'settingsSync',
            'type': 'object',
            'properties': {
                'settingsSync.machine': {
                    'type': 'string',
                    'scope': 2 /* ConfigurationScope.MACHINE */
                },
                'settingsSync.machineOverridable': {
                    'type': 'string',
                    'scope': 7 /* ConfigurationScope.MACHINE_OVERRIDABLE */
                }
            }
        });
        client = disposableStore.add(new UserDataSyncClient(server));
        await client.setUp(true);
        testObject = client.getSynchronizer("settings" /* SyncResource.Settings */);
    });
    test('when settings file does not exist', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
        const fileService = client.instantiationService.get(IFileService);
        const settingResource = client.instantiationService.get(IUserDataProfilesService).defaultProfile.settingsResource;
        assert.deepStrictEqual(await testObject.getLastSyncUserData(), null);
        let manifest = await client.getLatestRef("settings" /* SyncResource.Settings */);
        server.reset();
        await testObject.sync(manifest);
        assert.deepStrictEqual(server.requests, []);
        assert.ok(!await fileService.exists(settingResource));
        const lastSyncUserData = await testObject.getLastSyncUserData();
        const remoteUserData = await testObject.getRemoteUserData(null);
        assert.deepStrictEqual(lastSyncUserData.ref, remoteUserData.ref);
        assert.deepStrictEqual(lastSyncUserData.syncData, remoteUserData.syncData);
        assert.strictEqual(lastSyncUserData.syncData, null);
        manifest = await client.getLatestRef("settings" /* SyncResource.Settings */);
        server.reset();
        await testObject.sync(manifest);
        assert.deepStrictEqual(server.requests, []);
        manifest = await client.getLatestRef("settings" /* SyncResource.Settings */);
        server.reset();
        await testObject.sync(manifest);
        assert.deepStrictEqual(server.requests, []);
    }));
    test('when settings file is empty and remote has no changes', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
        const fileService = client.instantiationService.get(IFileService);
        const settingsResource = client.instantiationService.get(IUserDataProfilesService).defaultProfile.settingsResource;
        await fileService.writeFile(settingsResource, VSBuffer.fromString(''));
        await testObject.sync(await client.getLatestRef("settings" /* SyncResource.Settings */));
        const lastSyncUserData = await testObject.getLastSyncUserData();
        const remoteUserData = await testObject.getRemoteUserData(null);
        assert.strictEqual(parseSettingsSyncContent(lastSyncUserData.syncData.content)?.settings, '{}');
        assert.strictEqual(parseSettingsSyncContent(remoteUserData.syncData.content)?.settings, '{}');
        assert.strictEqual((await fileService.readFile(settingsResource)).value.toString(), '');
    }));
    test('when settings file is empty and remote has changes', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
        const client2 = disposableStore.add(new UserDataSyncClient(server));
        await client2.setUp(true);
        const content = `{
	// Always
	"files.autoSave": "afterDelay",
	"files.simpleDialog.enable": true,

	// Workbench
	"workbench.colorTheme": "GitHub Sharp",
	"workbench.tree.indent": 20,
	"workbench.colorCustomizations": {
		"editorLineNumber.activeForeground": "#ff0000",
		"[GitHub Sharp]": {
			"statusBarItem.remoteBackground": "#24292E",
			"editorPane.background": "#f3f1f11a"
		}
	},

	"gitBranch.base": "remote-repo/master",

	// Experimental
	"workbench.view.experimental.allowMovingToNewContainer": true,
}`;
        await client2.instantiationService.get(IFileService).writeFile(client2.instantiationService.get(IUserDataProfilesService).defaultProfile.settingsResource, VSBuffer.fromString(content));
        await client2.sync();
        const fileService = client.instantiationService.get(IFileService);
        const settingsResource = client.instantiationService.get(IUserDataProfilesService).defaultProfile.settingsResource;
        await fileService.writeFile(settingsResource, VSBuffer.fromString(''));
        await testObject.sync(await client.getLatestRef("settings" /* SyncResource.Settings */));
        const lastSyncUserData = await testObject.getLastSyncUserData();
        const remoteUserData = await testObject.getRemoteUserData(null);
        assert.strictEqual(parseSettingsSyncContent(lastSyncUserData.syncData.content)?.settings, content);
        assert.strictEqual(parseSettingsSyncContent(remoteUserData.syncData.content)?.settings, content);
        assert.strictEqual((await fileService.readFile(settingsResource)).value.toString(), content);
    }));
    test('when settings file is created after first sync', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
        const fileService = client.instantiationService.get(IFileService);
        const settingsResource = client.instantiationService.get(IUserDataProfilesService).defaultProfile.settingsResource;
        await testObject.sync(await client.getLatestRef("settings" /* SyncResource.Settings */));
        await fileService.createFile(settingsResource, VSBuffer.fromString('{}'));
        let lastSyncUserData = await testObject.getLastSyncUserData();
        const manifest = await client.getLatestRef("settings" /* SyncResource.Settings */);
        server.reset();
        await testObject.sync(manifest);
        assert.deepStrictEqual(server.requests, [
            { type: 'POST', url: `${server.url}/v1/resource/${testObject.resource}`, headers: { 'If-Match': lastSyncUserData?.ref } },
        ]);
        lastSyncUserData = await testObject.getLastSyncUserData();
        const remoteUserData = await testObject.getRemoteUserData(null);
        assert.deepStrictEqual(lastSyncUserData.ref, remoteUserData.ref);
        assert.deepStrictEqual(lastSyncUserData.syncData, remoteUserData.syncData);
        assert.strictEqual(parseSettingsSyncContent(lastSyncUserData.syncData.content)?.settings, '{}');
    }));
    test('sync for first time to the server', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
        const expected = `{
	// Always
	"files.autoSave": "afterDelay",
	"files.simpleDialog.enable": true,

	// Workbench
	"workbench.colorTheme": "GitHub Sharp",
	"workbench.tree.indent": 20,
	"workbench.colorCustomizations": {
		"editorLineNumber.activeForeground": "#ff0000",
		"[GitHub Sharp]": {
			"statusBarItem.remoteBackground": "#24292E",
			"editorPane.background": "#f3f1f11a"
		}
	},

	"gitBranch.base": "remote-repo/master",

	// Experimental
	"workbench.view.experimental.allowMovingToNewContainer": true,
}`;
        await updateSettings(expected, client);
        await testObject.sync(await client.getLatestRef("settings" /* SyncResource.Settings */));
        const { content } = await client.read(testObject.resource);
        assert.ok(content !== null);
        const actual = parseSettings(content);
        assert.deepStrictEqual(actual, expected);
    }));
    test('do not sync machine settings', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
        const settingsContent = `{
	// Always
	"files.autoSave": "afterDelay",
	"files.simpleDialog.enable": true,

	// Workbench
	"workbench.colorTheme": "GitHub Sharp",

	// Machine
	"settingsSync.machine": "someValue",
	"settingsSync.machineOverridable": "someValue"
}`;
        await updateSettings(settingsContent, client);
        await testObject.sync(await client.getLatestRef("settings" /* SyncResource.Settings */));
        const { content } = await client.read(testObject.resource);
        assert.ok(content !== null);
        const actual = parseSettings(content);
        assert.deepStrictEqual(actual, `{
	// Always
	"files.autoSave": "afterDelay",
	"files.simpleDialog.enable": true,

	// Workbench
	"workbench.colorTheme": "GitHub Sharp"
}`);
    }));
    test('do not sync machine settings when spread across file', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
        const settingsContent = `{
	// Always
	"files.autoSave": "afterDelay",
	"settingsSync.machine": "someValue",
	"files.simpleDialog.enable": true,

	// Workbench
	"workbench.colorTheme": "GitHub Sharp",

	// Machine
	"settingsSync.machineOverridable": "someValue"
}`;
        await updateSettings(settingsContent, client);
        await testObject.sync(await client.getLatestRef("settings" /* SyncResource.Settings */));
        const { content } = await client.read(testObject.resource);
        assert.ok(content !== null);
        const actual = parseSettings(content);
        assert.deepStrictEqual(actual, `{
	// Always
	"files.autoSave": "afterDelay",
	"files.simpleDialog.enable": true,

	// Workbench
	"workbench.colorTheme": "GitHub Sharp"
}`);
    }));
    test('do not sync machine settings when spread across file - 2', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
        const settingsContent = `{
	// Always
	"files.autoSave": "afterDelay",
	"settingsSync.machine": "someValue",

	// Workbench
	"workbench.colorTheme": "GitHub Sharp",

	// Machine
	"settingsSync.machineOverridable": "someValue",
	"files.simpleDialog.enable": true,
}`;
        await updateSettings(settingsContent, client);
        await testObject.sync(await client.getLatestRef("settings" /* SyncResource.Settings */));
        const { content } = await client.read(testObject.resource);
        assert.ok(content !== null);
        const actual = parseSettings(content);
        assert.deepStrictEqual(actual, `{
	// Always
	"files.autoSave": "afterDelay",

	// Workbench
	"workbench.colorTheme": "GitHub Sharp",
	"files.simpleDialog.enable": true,
}`);
    }));
    test('sync when all settings are machine settings', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
        const settingsContent = `{
	// Machine
	"settingsSync.machine": "someValue",
	"settingsSync.machineOverridable": "someValue"
}`;
        await updateSettings(settingsContent, client);
        await testObject.sync(await client.getLatestRef("settings" /* SyncResource.Settings */));
        const { content } = await client.read(testObject.resource);
        assert.ok(content !== null);
        const actual = parseSettings(content);
        assert.deepStrictEqual(actual, `{
}`);
    }));
    test('sync when all settings are machine settings with trailing comma', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
        const settingsContent = `{
	// Machine
	"settingsSync.machine": "someValue",
	"settingsSync.machineOverridable": "someValue",
}`;
        await updateSettings(settingsContent, client);
        await testObject.sync(await client.getLatestRef("settings" /* SyncResource.Settings */));
        const { content } = await client.read(testObject.resource);
        assert.ok(content !== null);
        const actual = parseSettings(content);
        assert.deepStrictEqual(actual, `{
	,
}`);
    }));
    test('local change event is triggered when settings are changed', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
        const content = `{
	"files.autoSave": "afterDelay",
	"files.simpleDialog.enable": true,
}`;
        await updateSettings(content, client);
        await testObject.sync(await client.getLatestRef("settings" /* SyncResource.Settings */));
        const promise = Event.toPromise(testObject.onDidChangeLocal);
        await updateSettings(`{
	"files.autoSave": "off",
	"files.simpleDialog.enable": true,
}`, client);
        await promise;
    }));
    test('do not sync ignored settings', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
        const settingsContent = `{
	// Always
	"files.autoSave": "afterDelay",
	"files.simpleDialog.enable": true,

	// Editor
	"editor.fontFamily": "Fira Code",

	// Terminal
	"terminal.integrated.shell.osx": "some path",

	// Workbench
	"workbench.colorTheme": "GitHub Sharp",

	// Ignored
	"settingsSync.ignoredSettings": [
		"editor.fontFamily",
		"terminal.integrated.shell.osx"
	]
}`;
        await updateSettings(settingsContent, client);
        await testObject.sync(await client.getLatestRef("settings" /* SyncResource.Settings */));
        const { content } = await client.read(testObject.resource);
        assert.ok(content !== null);
        const actual = parseSettings(content);
        assert.deepStrictEqual(actual, `{
	// Always
	"files.autoSave": "afterDelay",
	"files.simpleDialog.enable": true,

	// Workbench
	"workbench.colorTheme": "GitHub Sharp",

	// Ignored
	"settingsSync.ignoredSettings": [
		"editor.fontFamily",
		"terminal.integrated.shell.osx"
	]
}`);
    }));
    test('do not sync ignored and machine settings', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
        const settingsContent = `{
	// Always
	"files.autoSave": "afterDelay",
	"files.simpleDialog.enable": true,

	// Editor
	"editor.fontFamily": "Fira Code",

	// Terminal
	"terminal.integrated.shell.osx": "some path",

	// Workbench
	"workbench.colorTheme": "GitHub Sharp",

	// Ignored
	"settingsSync.ignoredSettings": [
		"editor.fontFamily",
		"terminal.integrated.shell.osx"
	],

	// Machine
	"settingsSync.machine": "someValue",
}`;
        await updateSettings(settingsContent, client);
        await testObject.sync(await client.getLatestRef("settings" /* SyncResource.Settings */));
        const { content } = await client.read(testObject.resource);
        assert.ok(content !== null);
        const actual = parseSettings(content);
        assert.deepStrictEqual(actual, `{
	// Always
	"files.autoSave": "afterDelay",
	"files.simpleDialog.enable": true,

	// Workbench
	"workbench.colorTheme": "GitHub Sharp",

	// Ignored
	"settingsSync.ignoredSettings": [
		"editor.fontFamily",
		"terminal.integrated.shell.osx"
	],
}`);
    }));
    test('sync throws invalid content error', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
        const expected = `{
	// Always
	"files.autoSave": "afterDelay",
	"files.simpleDialog.enable": true,

	// Workbench
	"workbench.colorTheme": "GitHub Sharp",
	"workbench.tree.indent": 20,
	"workbench.colorCustomizations": {
		"editorLineNumber.activeForeground": "#ff0000",
		"[GitHub Sharp]": {
			"statusBarItem.remoteBackground": "#24292E",
			"editorPane.background": "#f3f1f11a"
		}
	}

	"gitBranch.base": "remote-repo/master",

	// Experimental
	"workbench.view.experimental.allowMovingToNewContainer": true,
}`;
        await updateSettings(expected, client);
        try {
            await testObject.sync(await client.getLatestRef("settings" /* SyncResource.Settings */));
            assert.fail('should fail with invalid content error');
        }
        catch (e) {
            assert.ok(e instanceof UserDataSyncError);
            assert.deepStrictEqual(e.code, "LocalInvalidContent" /* UserDataSyncErrorCode.LocalInvalidContent */);
        }
    }));
    test('sync throws invalid content error - content is an array', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
        await updateSettings('[]', client);
        try {
            await testObject.sync(await client.getLatestRef("settings" /* SyncResource.Settings */));
            assert.fail('should fail with invalid content error');
        }
        catch (e) {
            assert.ok(e instanceof UserDataSyncError);
            assert.deepStrictEqual(e.code, "LocalInvalidContent" /* UserDataSyncErrorCode.LocalInvalidContent */);
        }
    }));
    test('sync when there are conflicts', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
        const client2 = disposableStore.add(new UserDataSyncClient(server));
        await client2.setUp(true);
        await updateSettings(JSON.stringify({
            'a': 1,
            'b': 2,
            'settingsSync.ignoredSettings': ['a']
        }), client2);
        await client2.sync();
        await updateSettings(JSON.stringify({
            'a': 2,
            'b': 1,
            'settingsSync.ignoredSettings': ['a']
        }), client);
        await testObject.sync(await client.getLatestRef("settings" /* SyncResource.Settings */));
        assert.strictEqual(testObject.status, "hasConflicts" /* SyncStatus.HasConflicts */);
        assert.strictEqual(testObject.conflicts.conflicts[0].localResource.toString(), testObject.localResource.toString());
        const fileService = client.instantiationService.get(IFileService);
        const mergeContent = (await fileService.readFile(testObject.conflicts.conflicts[0].previewResource)).value.toString();
        assert.strictEqual(mergeContent, '');
    }));
    test('sync profile settings', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
        const client2 = disposableStore.add(new UserDataSyncClient(server));
        await client2.setUp(true);
        const profile = await client2.instantiationService.get(IUserDataProfilesService).createNamedProfile('profile1');
        await updateSettings(JSON.stringify({
            'a': 1,
            'b': 2,
        }), client2, profile);
        await client2.sync();
        await client.sync();
        assert.strictEqual(testObject.status, "idle" /* SyncStatus.Idle */);
        const syncedProfile = client.instantiationService.get(IUserDataProfilesService).profiles.find(p => p.id === profile.id);
        const content = (await client.instantiationService.get(IFileService).readFile(syncedProfile.settingsResource)).value.toString();
        assert.deepStrictEqual(JSON.parse(content), {
            'a': 1,
            'b': 2,
        });
    }));
});
suite('SettingsSync - Manual', () => {
    const server = new UserDataSyncTestServer();
    let client;
    let testObject;
    teardown(async () => {
        await client.instantiationService.get(IUserDataSyncStoreService).clear();
    });
    const disposableStore = ensureNoDisposablesAreLeakedInTestSuite();
    setup(async () => {
        client = disposableStore.add(new UserDataSyncClient(server));
        await client.setUp(true);
        testObject = client.getSynchronizer("settings" /* SyncResource.Settings */);
    });
    test('do not sync ignored settings', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
        const settingsContent = `{
	// Always
	"files.autoSave": "afterDelay",
	"files.simpleDialog.enable": true,

	// Editor
	"editor.fontFamily": "Fira Code",

	// Terminal
	"terminal.integrated.shell.osx": "some path",

	// Workbench
	"workbench.colorTheme": "GitHub Sharp",

	// Ignored
	"settingsSync.ignoredSettings": [
		"editor.fontFamily",
		"terminal.integrated.shell.osx"
	]
}`;
        await updateSettings(settingsContent, client);
        let preview = await testObject.sync(await client.getLatestRef("settings" /* SyncResource.Settings */), true);
        assert.strictEqual(testObject.status, "syncing" /* SyncStatus.Syncing */);
        preview = await testObject.accept(preview.resourcePreviews[0].previewResource);
        preview = await testObject.apply(false);
        const { content } = await client.read(testObject.resource);
        assert.ok(content !== null);
        const actual = parseSettings(content);
        assert.deepStrictEqual(actual, `{
	// Always
	"files.autoSave": "afterDelay",
	"files.simpleDialog.enable": true,

	// Workbench
	"workbench.colorTheme": "GitHub Sharp",

	// Ignored
	"settingsSync.ignoredSettings": [
		"editor.fontFamily",
		"terminal.integrated.shell.osx"
	]
}`);
    }));
});
function parseSettings(content) {
    const syncData = JSON.parse(content);
    const settingsSyncContent = JSON.parse(syncData.content);
    return settingsSyncContent.settings;
}
async function updateSettings(content, client, profile) {
    await client.instantiationService.get(IFileService).writeFile((profile ?? client.instantiationService.get(IUserDataProfilesService).defaultProfile).settingsResource, VSBuffer.fromString(content));
    await client.instantiationService.get(IConfigurationService).reloadConfiguration();
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2V0dGluZ3NTeW5jLnRlc3QuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy9wbGF0Zm9ybS91c2VyRGF0YVN5bmMvdGVzdC9jb21tb24vc2V0dGluZ3NTeW5jLnRlc3QudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxNQUFNLE1BQU0sUUFBUSxDQUFDO0FBQzVCLE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSxtQ0FBbUMsQ0FBQztBQUM3RCxPQUFPLEVBQUUsS0FBSyxFQUFFLE1BQU0sa0NBQWtDLENBQUM7QUFDekQsT0FBTyxFQUFFLGtCQUFrQixFQUFFLE1BQU0scURBQXFELENBQUM7QUFDekYsT0FBTyxFQUFFLHVDQUF1QyxFQUFFLE1BQU0sdUNBQXVDLENBQUM7QUFDaEcsT0FBTyxFQUFFLHFCQUFxQixFQUFFLE1BQU0sZ0RBQWdELENBQUM7QUFDdkYsT0FBTyxFQUFzQixVQUFVLEVBQTBCLE1BQU0sd0RBQXdELENBQUM7QUFDaEksT0FBTyxFQUFFLFlBQVksRUFBRSxNQUFNLGdDQUFnQyxDQUFDO0FBQzlELE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUNoRSxPQUFPLEVBQW9CLHdCQUF3QixFQUFFLE1BQU0sb0RBQW9ELENBQUM7QUFDaEgsT0FBTyxFQUF3Qix3QkFBd0IsRUFBd0IsTUFBTSw4QkFBOEIsQ0FBQztBQUNwSCxPQUFPLEVBQWEseUJBQXlCLEVBQTRCLGlCQUFpQixFQUF5QixNQUFNLDhCQUE4QixDQUFDO0FBQ3hKLE9BQU8sRUFBRSxrQkFBa0IsRUFBRSxzQkFBc0IsRUFBRSxNQUFNLHlCQUF5QixDQUFDO0FBRXJGLEtBQUssQ0FBQyxxQkFBcUIsRUFBRSxHQUFHLEVBQUU7SUFFakMsTUFBTSxNQUFNLEdBQUcsSUFBSSxzQkFBc0IsRUFBRSxDQUFDO0lBQzVDLElBQUksTUFBMEIsQ0FB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