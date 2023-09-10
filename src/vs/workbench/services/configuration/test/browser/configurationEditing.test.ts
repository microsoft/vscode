/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as sinon from 'sinon';
import * as assert from 'assert';
import * as json from 'vs/base/common/json';
import { Event } from 'vs/base/common/event';
import { Registry } from 'vs/platform/registry/common/platform';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { TestEnvironmentService, TestTextFileService, workbenchInstantiationService } from 'vs/workbench/test/browser/workbenchTestServices';
import * as uuid from 'vs/base/common/uuid';
import { IConfigurationRegistry, Extensions as ConfigurationExtensions } from 'vs/platform/configuration/common/configurationRegistry';
import { WorkspaceService } from 'vs/workbench/services/configuration/browser/configurationService';
import { ConfigurationEditing, ConfigurationEditingErrorCode, EditableConfigurationTarget } from 'vs/workbench/services/configuration/common/configurationEditing';
import { WORKSPACE_STANDALONE_CONFIGURATIONS, FOLDER_SETTINGS_PATH, USER_STANDALONE_CONFIGURATIONS, IConfigurationCache } from 'vs/workbench/services/configuration/common/configuration';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { TestInstantiationService } from 'vs/platform/instantiation/test/common/instantiationServiceMock';
import { ITextFileService } from 'vs/workbench/services/textfile/common/textfiles';
import { ITextModelService } from 'vs/editor/common/services/resolverService';
import { TextModelResolverService } from 'vs/workbench/services/textmodelResolver/common/textModelResolverService';
import { INotificationService } from 'vs/platform/notification/common/notification';
import { ICommandService } from 'vs/platform/commands/common/commands';
import { CommandService } from 'vs/workbench/services/commands/common/commandService';
import { URI } from 'vs/base/common/uri';
import { IRemoteAgentService } from 'vs/workbench/services/remote/common/remoteAgentService';
import { FileService } from 'vs/platform/files/common/fileService';
import { NullLogService } from 'vs/platform/log/common/log';
import { Schemas } from 'vs/base/common/network';
import { IFileService } from 'vs/platform/files/common/files';
import { KeybindingsEditingService, IKeybindingEditingService } from 'vs/workbench/services/keybinding/common/keybindingEditing';
import { FileUserDataProvider } from 'vs/platform/userData/common/fileUserDataProvider';
import { UriIdentityService } from 'vs/platform/uriIdentity/common/uriIdentityService';
import { DisposableStore, toDisposable } from 'vs/base/common/lifecycle';
import { InMemoryFileSystemProvider } from 'vs/platform/files/common/inMemoryFilesystemProvider';
import { joinPath } from 'vs/base/common/resources';
import { VSBuffer } from 'vs/base/common/buffer';
import { RemoteAgentService } from 'vs/workbench/services/remote/browser/remoteAgentService';
import { getSingleFolderWorkspaceIdentifier } from 'vs/workbench/services/workspaces/browser/workspaces';
import { IUserDataProfilesService, UserDataProfilesService } from 'vs/platform/userDataProfile/common/userDataProfile';
import { hash } from 'vs/base/common/hash';
import { FilePolicyService } from 'vs/platform/policy/common/filePolicyService';
import { runWithFakedTimers } from 'vs/base/test/common/timeTravelScheduler';
import { UserDataProfileService } from 'vs/workbench/services/userDataProfile/common/userDataProfileService';
import { IUserDataProfileService } from 'vs/workbench/services/userDataProfile/common/userDataProfile';
import { IBrowserWorkbenchEnvironmentService } from 'vs/workbench/services/environment/browser/environmentService';

const ROOT = URI.file('tests').with({ scheme: 'vscode-tests' });

class ConfigurationCache implements IConfigurationCache {
	needsCaching(resource: URI): boolean { return false; }
	async read(): Promise<string> { return ''; }
	async write(): Promise<void> { }
	async remove(): Promise<void> { }
}

suite('ConfigurationEditing', () => {

	let instantiationService: TestInstantiationService;
	let userDataProfileService: IUserDataProfileService;
	let environmentService: IBrowserWorkbenchEnvironmentService;
	let fileService: IFileService;
	let workspaceService: WorkspaceService;
	let testObject: ConfigurationEditing;

	const disposables = new DisposableStore();

	suiteSetup(() => {
		const configurationRegistry = Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration);
		configurationRegistry.registerConfiguration({
			'id': '_test',
			'type': 'object',
			'properties': {
				'configurationEditing.service.testSetting': {
					'type': 'string',
					'default': 'isSet'
				},
				'configurationEditing.service.testSettingTwo': {
					'type': 'string',
					'default': 'isSet'
				},
				'configurationEditing.service.testSettingThree': {
					'type': 'string',
					'default': 'isSet'
				},
				'configurationEditing.service.policySetting': {
					'type': 'string',
					'default': 'isSet',
					policy: {
						name: 'configurationEditing.service.policySetting',
						minimumVersion: '1.0.0',
					}
				}
			}
		});
	});

	setup(async () => {
		disposables.add(toDisposable(() => sinon.restore()));
		const logService = new NullLogService();
		fileService = disposables.add(new FileService(logService));
		const fileSystemProvider = disposables.add(new InMemoryFileSystemProvider());
		disposables.add(fileService.registerProvider(ROOT.scheme, fileSystemProvider));

		const workspaceFolder = joinPath(ROOT, uuid.generateUuid());
		await fileService.createFolder(workspaceFolder);

		instantiationService = <TestInstantiationService>workbenchInstantiationService(undefined, disposables);
		environmentService = TestEnvironmentService;
		environmentService.policyFile = joinPath(workspaceFolder, 'policies.json');
		instantiationService.stub(IEnvironmentService, environmentService);
		const uriIdentityService = new UriIdentityService(fileService);
		const userDataProfilesService = instantiationService.stub(IUserDataProfilesService, new UserDataProfilesService(environmentService, fileService, uriIdentityService, logService));
		userDataProfileService = new UserDataProfileService(userDataProfilesService.defaultProfile, userDataProfilesService);
		const remoteAgentService = disposables.add(instantiationService.createInstance(RemoteAgentService));
		disposables.add(fileService.registerProvider(Schemas.vscodeUserData, disposables.add(new FileUserDataProvider(ROOT.scheme, fileSystemProvider, Schemas.vscodeUserData, logService))));
		instantiationService.stub(IFileService, fileService);
		instantiationService.stub(IRemoteAgentService, remoteAgentService);
		workspaceService = disposables.add(new WorkspaceService({ configurationCache: new ConfigurationCache() }, environmentService, userDataProfileService, userDataProfilesService, fileService, remoteAgentService, uriIdentityService, new NullLogService(), new FilePolicyService(environmentService.policyFile, fileService, logService)));
		await workspaceService.initialize({
			id: hash(workspaceFolder.toString()).toString(16),
			uri: workspaceFolder
		});
		instantiationService.stub(IWorkspaceContextService, workspaceService);

		await workspaceService.initialize(getSingleFolderWorkspaceIdentifier(workspaceFolder));
		instantiationService.stub(IConfigurationService, workspaceService);
		instantiationService.stub(IKeybindingEditingService, disposables.add(instantiationService.createInstance(KeybindingsEditingService)));
		instantiationService.stub(ITextFileService, disposables.add(instantiationService.createInstance(TestTextFileService)));
		instantiationService.stub(ITextModelService, <ITextModelService>disposables.add(instantiationService.createInstance(TextModelResolverService)));
		instantiationService.stub(ICommandService, CommandService);
		testObject = instantiationService.createInstance(ConfigurationEditing, null);
	});

	teardown(() => disposables.clear());

	test('errors cases - invalid key', async () => {
		try {
			await testObject.writeConfiguration(EditableConfigurationTarget.WORKSPACE, { key: 'unknown.key', value: 'value' }, { donotNotifyError: true });
		} catch (error) {
			assert.strictEqual(error.code, ConfigurationEditingErrorCode.ERROR_UNKNOWN_KEY);
			return;
		}
		assert.fail('Should fail with ERROR_UNKNOWN_KEY');
	});

	test('errors cases - no workspace', async () => {
		await workspaceService.initialize({ id: uuid.generateUuid() });
		try {
			await testObject.writeConfiguration(EditableConfigurationTarget.WORKSPACE, { key: 'configurationEditing.service.testSetting', value: 'value' }, { donotNotifyError: true });
		} catch (error) {
			assert.strictEqual(error.code, ConfigurationEditingErrorCode.ERROR_NO_WORKSPACE_OPENED);
			return;
		}
		assert.fail('Should fail with ERROR_NO_WORKSPACE_OPENED');
	});

	test('errors cases - invalid configuration', async () => {
		await fileService.writeFile(userDataProfileService.currentProfile.settingsResource, VSBuffer.fromString(',,,,,,,,,,,,,,'));
		try {
			await testObject.writeConfiguration(EditableConfigurationTarget.USER_LOCAL, { key: 'configurationEditing.service.testSetting', value: 'value' }, { donotNotifyError: true });
		} catch (error) {
			assert.strictEqual(error.code, ConfigurationEditingErrorCode.ERROR_INVALID_CONFIGURATION);
			return;
		}
		assert.fail('Should fail with ERROR_INVALID_CONFIGURATION');
	});

	test('errors cases - invalid global tasks configuration', async () => {
		const resource = joinPath(environmentService.userRoamingDataHome, USER_STANDALONE_CONFIGURATIONS['tasks']);
		await fileService.writeFile(resource, VSBuffer.fromString(',,,,,,,,,,,,,,'));
		try {
			await testObject.writeConfiguration(EditableConfigurationTarget.USER_LOCAL, { key: 'tasks.configurationEditing.service.testSetting', value: 'value' }, { donotNotifyError: true });
		} catch (error) {
			assert.strictEqual(error.code, ConfigurationEditingErrorCode.ERROR_INVALID_CONFIGURATION);
			return;
		}
		assert.fail('Should fail with ERROR_INVALID_CONFIGURATION');
	});

	test('errors cases - dirty', async () => {
		instantiationService.stub(ITextFileService, 'isDirty', true);
		try {
			await testObject.writeConfiguration(EditableConfigurationTarget.USER_LOCAL, { key: 'configurationEditing.service.testSetting', value: 'value' }, { donotNotifyError: true });
		} catch (error) {
			assert.strictEqual(error.code, ConfigurationEditingErrorCode.ERROR_CONFIGURATION_FILE_DIRTY);
			return;
		}
		assert.fail('Should fail with ERROR_CONFIGURATION_FILE_DIRTY error.');
	});

	test('do not notify error', async () => {
		instantiationService.stub(ITextFileService, 'isDirty', true);
		const target = sinon.stub();
		instantiationService.stub(INotificationService, <INotificationService>{ prompt: target, _serviceBrand: undefined, doNotDisturbMode: false, onDidAddNotification: undefined!, onDidRemoveNotification: undefined!, onDidChangeDoNotDisturbMode: undefined!, notify: null!, error: null!, info: null!, warn: null!, status: null! });
		try {
			await testObject.writeConfiguration(EditableConfigurationTarget.USER_LOCAL, { key: 'configurationEditing.service.testSetting', value: 'value' }, { donotNotifyError: true });
		} catch (error) {
			assert.strictEqual(false, target.calledOnce);
			assert.strictEqual(error.code, ConfigurationEditingErrorCode.ERROR_CONFIGURATION_FILE_DIRTY);
			return;
		}
		assert.fail('Should fail with ERROR_CONFIGURATION_FILE_DIRTY error.');
	});

	test('errors cases - ERROR_POLICY_CONFIGURATION', async () => {
		await runWithFakedTimers({ useFakeTimers: true }, async () => {
			const promise = Event.toPromise(instantiationService.get(IConfigurationService).onDidChangeConfiguration);
			await fileService.writeFile(environmentService.policyFile!, VSBuffer.fromString('{ "configurationEditing.service.policySetting": "policyValue" }'));
			await promise;
		});
		try {
			await testObject.writeConfiguration(EditableConfigurationTarget.USER_LOCAL, { key: 'configurationEditing.service.policySetting', value: 'value' }, { donotNotifyError: true });
		} catch (error) {
			assert.strictEqual(error.code, ConfigurationEditingErrorCode.ERROR_POLICY_CONFIGURATION);
			return;
		}
		assert.fail('Should fail with ERROR_POLICY_CONFIGURATION');
	});

	test('write policy setting - when not set', async () => {
		await testObject.writeConfiguration(EditableConfigurationTarget.USER_LOCAL, { key: 'configurationEditing.service.policySetting', value: 'value' }, { donotNotifyError: true });
		const contents = await fileService.readFile(userDataProfileService.currentProfile.settingsResource);
		const parsed = json.parse(contents.value.toString());
		assert.strictEqual(parsed['configurationEditing.service.policySetting'], 'value');
	});

	test('write one setting - empty file', async () => {
		await testObject.writeConfiguration(EditableConfigurationTarget.USER_LOCAL, { key: 'configurationEditing.service.testSetting', value: 'value' });
		const contents = await fileService.readFile(userDataProfileService.currentProfile.settingsResource);
		const parsed = json.parse(contents.value.toString());
		assert.strictEqual(parsed['configurationEditing.service.testSetting'], 'value');
	});

	test('write one setting - existing file', async () => {
		await fileService.writeFile(userDataProfileService.currentProfile.settingsResource, VSBuffer.fromString('{ "my.super.setting": "my.super.value" }'));
		await testObject.writeConfiguration(EditableConfigurationTarget.USER_LOCAL, { key: 'configurationEditing.service.testSetting', value: 'value' });

		const contents = await fileService.readFile(userDataProfileService.currentProfile.settingsResource);
		const parsed = json.parse(contents.value.toString());
		assert.strictEqual(parsed['configurationEditing.service.testSetting'], 'value');
		assert.strictEqual(parsed['my.super.setting'], 'my.super.value');
	});

	test('remove an existing setting - existing file', async () => {
		await fileService.writeFile(userDataProfileService.currentProfile.settingsResource, VSBuffer.fromString('{ "my.super.setting": "my.super.value", "configurationEditing.service.testSetting": "value" }'));
		await testObject.writeConfiguration(EditableConfigurationTarget.USER_LOCAL, { key: 'configurationEditing.service.testSetting', value: undefined });

		const contents = await fileService.readFile(userDataProfileService.currentProfile.settingsResource);
		const parsed = json.parse(contents.value.toString());
		assert.deepStrictEqual(Object.keys(parsed), ['my.super.setting']);
		assert.strictEqual(parsed['my.super.setting'], 'my.super.value');
	});

	test('remove non existing setting - existing file', async () => {
		await fileService.writeFile(userDataProfileService.currentProfile.settingsResource, VSBuffer.fromString('{ "my.super.setting": "my.super.value" }'));
		await testObject.writeConfiguration(EditableConfigurationTarget.USER_LOCAL, { key: 'configurationEditing.service.testSetting', value: undefined });

		const contents = await fileService.readFile(userDataProfileService.currentProfile.settingsResource);
		const parsed = json.parse(contents.value.toString());
		assert.deepStrictEqual(Object.keys(parsed), ['my.super.setting']);
		assert.strictEqual(parsed['my.super.setting'], 'my.super.value');
	});

	test('write overridable settings to user settings', async () => {
		const key = '[language]';
		const value = { 'configurationEditing.service.testSetting': 'overridden value' };
		await testObject.writeConfiguration(EditableConfigurationTarget.USER_LOCAL, { key, value });

		const contents = await fileService.readFile(userDataProfileService.currentProfile.settingsResource);
		const parsed = json.parse(contents.value.toString());
		assert.deepStrictEqual(parsed[key], value);
	});

	test('write overridable settings to workspace settings', async () => {
		const key = '[language]';
		const value = { 'configurationEditing.service.testSetting': 'overridden value' };
		await testObject.writeConfiguration(EditableConfigurationTarget.WORKSPACE, { key, value });

		const contents = await fileService.readFile(joinPath(workspaceService.getWorkspace().folders[0].uri, FOLDER_SETTINGS_PATH));
		const parsed = json.parse(contents.value.toString());
		assert.deepStrictEqual(parsed[key], value);
	});

	test('write overridable settings to workspace folder settings', async () => {
		const key = '[language]';
		const value = { 'configurationEditing.service.testSetting': 'overridden value' };
		const folderSettingsFile = joinPath(workspaceService.getWorkspace().folders[0].uri, FOLDER_SETTINGS_PATH);
		await testObject.writeConfiguration(EditableConfigurationTarget.WORKSPACE_FOLDER, { key, value }, { scopes: { resource: folderSettingsFile } });

		const contents = await fileService.readFile(folderSettingsFile);
		const parsed = json.parse(contents.value.toString());
		assert.deepStrictEqual(parsed[key], value);
	});

	test('write workspace standalone setting - empty file', async () => {
		const target = joinPath(workspaceService.getWorkspace().folders[0].uri, WORKSPACE_STANDALONE_CONFIGURATIONS['tasks']);
		await testObject.writeConfiguration(EditableConfigurationTarget.WORKSPACE, { key: 'tasks.service.testSetting', value: 'value' });

		const contents = await fileService.readFile(target);
		const parsed = json.parse(contents.value.toString());
		assert.strictEqual(parsed['service.testSetting'], 'value');
	});

	test('write user standalone setting - empty file', async () => {
		const target = joinPath(environmentService.userRoamingDataHome, USER_STANDALONE_CONFIGURATIONS['tasks']);
		await testObject.writeConfiguration(EditableConfigurationTarget.USER_LOCAL, { key: 'tasks.service.testSetting', value: 'value' });

		const contents = await fileService.readFile(target);
		const parsed = json.parse(contents.value.toString());
		assert.strictEqual(parsed['service.testSetting'], 'value');
	});

	test('write workspace standalone setting - existing file', async () => {
		const target = joinPath(workspaceService.getWorkspace().folders[0].uri, WORKSPACE_STANDALONE_CONFIGURATIONS['tasks']);
		await fileService.writeFile(target, VSBuffer.fromString('{ "my.super.setting": "my.super.value" }'));

		await testObject.writeConfiguration(EditableConfigurationTarget.WORKSPACE, { key: 'tasks.service.testSetting', value: 'value' });

		const contents = await fileService.readFile(target);
		const parsed = json.parse(contents.value.toString());
		assert.strictEqual(parsed['service.testSetting'], 'value');
		assert.strictEqual(parsed['my.super.setting'], 'my.super.value');
	});

	test('write user standalone setting - existing file', async () => {
		const target = joinPath(environmentService.userRoamingDataHome, USER_STANDALONE_CONFIGURATIONS['tasks']);
		await fileService.writeFile(target, VSBuffer.fromString('{ "my.super.setting": "my.super.value" }'));

		await testObject.writeConfiguration(EditableConfigurationTarget.USER_LOCAL, { key: 'tasks.service.testSetting', value: 'value' });

		const contents = await fileService.readFile(target);
		const parsed = json.parse(contents.value.toString());
		assert.strictEqual(parsed['service.testSetting'], 'value');
		assert.strictEqual(parsed['my.super.setting'], 'my.super.value');
	});

	test('write workspace standalone setting - empty file - full JSON', async () => {
		await testObject.writeConfiguration(EditableConfigurationTarget.WORKSPACE, { key: 'tasks', value: { 'version': '1.0.0', tasks: [{ 'taskName': 'myTask' }] } });

		const target = joinPath(workspaceService.getWorkspace().folders[0].uri, WORKSPACE_STANDALONE_CONFIGURATIONS['tasks']);
		const contents = await fileService.readFile(target);
		const parsed = json.parse(contents.value.toString());
		assert.strictEqual(parsed['version'], '1.0.0');
		assert.strictEqual(parsed['tasks'][0]['taskName'], 'myTask');
	});

	test('write user standalone setting - empty file - full JSON', async () => {
		await testObject.writeConfiguration(EditableConfigurationTarget.USER_LOCAL, { key: 'tasks', value: { 'version': '1.0.0', tasks: [{ 'taskName': 'myTask' }] } });

		const target = joinPath(environmentService.userRoamingDataHome, USER_STANDALONE_CONFIGURATIONS['tasks']);
		const contents = await fileService.readFile(target);
		const parsed = json.parse(contents.value.toString());
		assert.strictEqual(parsed['version'], '1.0.0');
		assert.strictEqual(parsed['tasks'][0]['taskName'], 'myTask');
	});

	test('write workspace standalone setting - existing file - full JSON', async () => {
		const target = joinPath(workspaceService.getWorkspace().folders[0].uri, WORKSPACE_STANDALONE_CONFIGURATIONS['tasks']);
		await fileService.writeFile(target, VSBuffer.fromString('{ "my.super.setting": "my.super.value" }'));

		await testObject.writeConfiguration(EditableConfigurationTarget.WORKSPACE, { key: 'tasks', value: { 'version': '1.0.0', tasks: [{ 'taskName': 'myTask' }] } });

		const contents = await fileService.readFile(target);
		const parsed = json.parse(contents.value.toString());
		assert.strictEqual(parsed['version'], '1.0.0');
		assert.strictEqual(parsed['tasks'][0]['taskName'], 'myTask');
	});

	test('write user standalone setting - existing file - full JSON', async () => {
		const target = joinPath(environmentService.userRoamingDataHome, USER_STANDALONE_CONFIGURATIONS['tasks']);
		await fileService.writeFile(target, VSBuffer.fromString('{ "my.super.setting": "my.super.value" }'));

		await testObject.writeConfiguration(EditableConfigurationTarget.USER_LOCAL, { key: 'tasks', value: { 'version': '1.0.0', tasks: [{ 'taskName': 'myTask' }] } });

		const contents = await fileService.readFile(target);
		const parsed = json.parse(contents.value.toString());
		assert.strictEqual(parsed['version'], '1.0.0');
		assert.strictEqual(parsed['tasks'][0]['taskName'], 'myTask');
	});

	test('write workspace standalone setting - existing file with JSON errors - full JSON', async () => {
		const target = joinPath(workspaceService.getWorkspace().folders[0].uri, WORKSPACE_STANDALONE_CONFIGURATIONS['tasks']);
		await fileService.writeFile(target, VSBuffer.fromString('{ "my.super.setting": ')); // invalid JSON

		await testObject.writeConfiguration(EditableConfigurationTarget.WORKSPACE, { key: 'tasks', value: { 'version': '1.0.0', tasks: [{ 'taskName': 'myTask' }] } });

		const contents = await fileService.readFile(target);
		const parsed = json.parse(contents.value.toString());
		assert.strictEqual(parsed['version'], '1.0.0');
		assert.strictEqual(parsed['tasks'][0]['taskName'], 'myTask');
	});

	test('write user standalone setting - existing file with JSON errors - full JSON', async () => {
		const target = joinPath(environmentService.userRoamingDataHome, USER_STANDALONE_CONFIGURATIONS['tasks']);
		await fileService.writeFile(target, VSBuffer.fromString('{ "my.super.setting": ')); // invalid JSON

		await testObject.writeConfiguration(EditableConfigurationTarget.USER_LOCAL, { key: 'tasks', value: { 'version': '1.0.0', tasks: [{ 'taskName': 'myTask' }] } });

		const contents = await fileService.readFile(target);
		const parsed = json.parse(contents.value.toString());
		assert.strictEqual(parsed['version'], '1.0.0');
		assert.strictEqual(parsed['tasks'][0]['taskName'], 'myTask');
	});

	test('write workspace standalone setting should replace complete file', async () => {
		const target = joinPath(workspaceService.getWorkspace().folders[0].uri, WORKSPACE_STANDALONE_CONFIGURATIONS['tasks']);
		await fileService.writeFile(target, VSBuffer.fromString(`{
			"version": "1.0.0",
			"tasks": [
				{
					"taskName": "myTask1"
				},
				{
					"taskName": "myTask2"
				}
			]
		}`));

		await testObject.writeConfiguration(EditableConfigurationTarget.WORKSPACE, { key: 'tasks', value: { 'version': '1.0.0', tasks: [{ 'taskName': 'myTask1' }] } });

		const actual = await fileService.readFile(target);
		const expected = JSON.stringify({ 'version': '1.0.0', tasks: [{ 'taskName': 'myTask1' }] }, null, '\t');
		assert.strictEqual(actual.value.toString(), expected);
	});

	test('write user standalone setting should replace complete file', async () => {
		const target = joinPath(environmentService.userRoamingDataHome, USER_STANDALONE_CONFIGURATIONS['tasks']);
		await fileService.writeFile(target, VSBuffer.fromString(`{
			"version": "1.0.0",
			"tasks": [
				{
					"taskName": "myTask1"
				},
				{
					"taskName": "myTask2"
				}
			]
		}`));

		await testObject.writeConfiguration(EditableConfigurationTarget.USER_LOCAL, { key: 'tasks', value: { 'version': '1.0.0', tasks: [{ 'taskName': 'myTask1' }] } });

		const actual = await fileService.readFile(target);
		const expected = JSON.stringify({ 'version': '1.0.0', tasks: [{ 'taskName': 'myTask1' }] }, null, '\t');
		assert.strictEqual(actual.value.toString(), expected);
	});
});
