/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as sinon from 'sinon';
import * as assert from 'assert';
import * as os from 'os';
import * as path from 'vs/base/common/path';
import * as fs from 'fs';
import * as json from 'vs/base/common/json';
import { Registry } from 'vs/platform/registry/common/platform';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { parseArgs } from 'vs/platform/environment/node/argv';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { TestTextFileService, workbenchInstantiationService } from 'vs/workbench/test/workbenchTestServices';
import * as uuid from 'vs/base/common/uuid';
import { IConfigurationRegistry, Extensions as ConfigurationExtensions } from 'vs/platform/configuration/common/configurationRegistry';
import { WorkspaceService } from 'vs/workbench/services/configuration/browser/configurationService';
import { ConfigurationEditingService, ConfigurationEditingError, ConfigurationEditingErrorCode, EditableConfigurationTarget } from 'vs/workbench/services/configuration/common/configurationEditingService';
import { WORKSPACE_STANDALONE_CONFIGURATIONS } from 'vs/workbench/services/configuration/common/configuration';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { TestInstantiationService } from 'vs/platform/instantiation/test/common/instantiationServiceMock';
import { ITextFileService } from 'vs/workbench/services/textfile/common/textfiles';
import { ITextModelService } from 'vs/editor/common/services/resolverService';
import { TextModelResolverService } from 'vs/workbench/services/textmodelResolver/common/textModelResolverService';
import { mkdirp, rimraf, RimRafMode } from 'vs/base/node/pfs';
import { INotificationService } from 'vs/platform/notification/common/notification';
import { ICommandService } from 'vs/platform/commands/common/commands';
import { CommandService } from 'vs/workbench/services/commands/common/commandService';
import { URI } from 'vs/base/common/uri';
import { createHash } from 'crypto';
import { RemoteAgentService } from 'vs/workbench/services/remote/electron-browser/remoteAgentServiceImpl';
import { IRemoteAgentService } from 'vs/workbench/services/remote/common/remoteAgentService';
import { FileService } from 'vs/platform/files/common/fileService';
import { NullLogService } from 'vs/platform/log/common/log';
import { Schemas } from 'vs/base/common/network';
import { DiskFileSystemProvider } from 'vs/platform/files/node/diskFileSystemProvider';
import { IFileService } from 'vs/platform/files/common/files';
import { ConfigurationCache } from 'vs/workbench/services/configuration/node/configurationCache';
import { KeybindingsEditingService, IKeybindingEditingService } from 'vs/workbench/services/keybinding/common/keybindingEditing';
import { WorkbenchEnvironmentService } from 'vs/workbench/services/environment/node/environmentService';
import { IWindowConfiguration } from 'vs/platform/windows/common/windows';
import { FileUserDataProvider } from 'vs/workbench/services/userData/common/fileUserDataProvider';

class TestEnvironmentService extends WorkbenchEnvironmentService {

	constructor(private _appSettingsHome: URI) {
		super(parseArgs(process.argv) as IWindowConfiguration, process.execPath);
	}

	get appSettingsHome() { return this._appSettingsHome; }

}

suite('ConfigurationEditingService', () => {

	let instantiationService: TestInstantiationService;
	let testObject: ConfigurationEditingService;
	let parentDir: string;
	let workspaceDir: string;
	let globalSettingsFile: string;
	let workspaceSettingsDir;

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
				}
			}
		});
	});

	setup(() => {
		return setUpWorkspace()
			.then(() => setUpServices());
	});

	async function setUpWorkspace(): Promise<void> {
		const id = uuid.generateUuid();
		parentDir = path.join(os.tmpdir(), 'vsctests', id);
		workspaceDir = path.join(parentDir, 'workspaceconfig', id);
		globalSettingsFile = path.join(workspaceDir, 'settings.json');
		workspaceSettingsDir = path.join(workspaceDir, '.vscode');

		return await mkdirp(workspaceSettingsDir, 493);
	}

	function setUpServices(noWorkspace: boolean = false): Promise<void> {
		// Clear services if they are already created
		clearServices();

		instantiationService = <TestInstantiationService>workbenchInstantiationService();
		const environmentService = new TestEnvironmentService(URI.file(workspaceDir));
		instantiationService.stub(IEnvironmentService, environmentService);
		const remoteAgentService = instantiationService.createInstance(RemoteAgentService, {});
		const fileService = new FileService(new NullLogService());
		const diskFileSystemProvider = new DiskFileSystemProvider(new NullLogService());
		fileService.registerProvider(Schemas.file, diskFileSystemProvider);
		fileService.registerProvider(Schemas.userData, new FileUserDataProvider(environmentService.appSettingsHome, environmentService.backupHome, diskFileSystemProvider, environmentService));
		instantiationService.stub(IFileService, fileService);
		instantiationService.stub(IRemoteAgentService, remoteAgentService);
		const workspaceService = new WorkspaceService({ configurationCache: new ConfigurationCache(environmentService) }, environmentService, fileService, remoteAgentService);
		instantiationService.stub(IWorkspaceContextService, workspaceService);
		return workspaceService.initialize(noWorkspace ? { id: '' } : { folder: URI.file(workspaceDir), id: createHash('md5').update(URI.file(workspaceDir).toString()).digest('hex') }).then(() => {
			instantiationService.stub(IConfigurationService, workspaceService);
			instantiationService.stub(IKeybindingEditingService, instantiationService.createInstance(KeybindingsEditingService));
			instantiationService.stub(ITextFileService, instantiationService.createInstance(TestTextFileService));
			instantiationService.stub(ITextModelService, <ITextModelService>instantiationService.createInstance(TextModelResolverService));
			instantiationService.stub(ICommandService, CommandService);
			testObject = instantiationService.createInstance(ConfigurationEditingService);
		});
	}

	teardown(() => {
		clearServices();
		if (workspaceDir) {
			return rimraf(workspaceDir, RimRafMode.MOVE);
		}
		return undefined;
	});

	function clearServices(): void {
		if (instantiationService) {
			const configuraitonService = <WorkspaceService>instantiationService.get(IConfigurationService);
			if (configuraitonService) {
				configuraitonService.dispose();
			}
			instantiationService = null!;
		}
	}

	test('errors cases - invalid key', () => {
		return testObject.writeConfiguration(EditableConfigurationTarget.WORKSPACE, { key: 'unknown.key', value: 'value' })
			.then(() => assert.fail('Should fail with ERROR_UNKNOWN_KEY'),
				(error: ConfigurationEditingError) => assert.equal(error.code, ConfigurationEditingErrorCode.ERROR_UNKNOWN_KEY));
	});

	test('errors cases - invalid target', () => {
		return testObject.writeConfiguration(EditableConfigurationTarget.USER_LOCAL, { key: 'tasks.something', value: 'value' })
			.then(() => assert.fail('Should fail with ERROR_INVALID_TARGET'),
				(error: ConfigurationEditingError) => assert.equal(error.code, ConfigurationEditingErrorCode.ERROR_INVALID_USER_TARGET));
	});

	test('errors cases - no workspace', () => {
		return setUpServices(true)
			.then(() => testObject.writeConfiguration(EditableConfigurationTarget.WORKSPACE, { key: 'configurationEditing.service.testSetting', value: 'value' }))
			.then(() => assert.fail('Should fail with ERROR_NO_WORKSPACE_OPENED'),
				(error: ConfigurationEditingError) => assert.equal(error.code, ConfigurationEditingErrorCode.ERROR_NO_WORKSPACE_OPENED));
	});

	test('errors cases - invalid configuration', () => {
		fs.writeFileSync(globalSettingsFile, ',,,,,,,,,,,,,,');
		return testObject.writeConfiguration(EditableConfigurationTarget.USER_LOCAL, { key: 'configurationEditing.service.testSetting', value: 'value' })
			.then(() => assert.fail('Should fail with ERROR_INVALID_CONFIGURATION'),
				(error: ConfigurationEditingError) => assert.equal(error.code, ConfigurationEditingErrorCode.ERROR_INVALID_CONFIGURATION));
	});

	test('errors cases - dirty', () => {
		instantiationService.stub(ITextFileService, 'isDirty', true);
		return testObject.writeConfiguration(EditableConfigurationTarget.USER_LOCAL, { key: 'configurationEditing.service.testSetting', value: 'value' })
			.then(() => assert.fail('Should fail with ERROR_CONFIGURATION_FILE_DIRTY error.'),
				(error: ConfigurationEditingError) => assert.equal(error.code, ConfigurationEditingErrorCode.ERROR_CONFIGURATION_FILE_DIRTY));
	});

	test('dirty error is not thrown if not asked to save', () => {
		instantiationService.stub(ITextFileService, 'isDirty', true);
		return testObject.writeConfiguration(EditableConfigurationTarget.USER_LOCAL, { key: 'configurationEditing.service.testSetting', value: 'value' }, { donotSave: true })
			.then(() => null, error => assert.fail('Should not fail.'));
	});

	test('do not notify error', () => {
		instantiationService.stub(ITextFileService, 'isDirty', true);
		const target = sinon.stub();
		instantiationService.stub(INotificationService, <INotificationService>{ prompt: target, _serviceBrand: null!, notify: null!, error: null!, info: null!, warn: null!, status: null! });
		return testObject.writeConfiguration(EditableConfigurationTarget.USER_LOCAL, { key: 'configurationEditing.service.testSetting', value: 'value' }, { donotNotifyError: true })
			.then(() => assert.fail('Should fail with ERROR_CONFIGURATION_FILE_DIRTY error.'),
				(error: ConfigurationEditingError) => {
					assert.equal(false, target.calledOnce);
					assert.equal(error.code, ConfigurationEditingErrorCode.ERROR_CONFIGURATION_FILE_DIRTY);
				});
	});

	test('write one setting - empty file', () => {
		return testObject.writeConfiguration(EditableConfigurationTarget.USER_LOCAL, { key: 'configurationEditing.service.testSetting', value: 'value' })
			.then(() => {
				const contents = fs.readFileSync(globalSettingsFile).toString('utf8');
				const parsed = json.parse(contents);
				assert.equal(parsed['configurationEditing.service.testSetting'], 'value');
			});
	});

	test('write one setting - existing file', () => {
		fs.writeFileSync(globalSettingsFile, '{ "my.super.setting": "my.super.value" }');
		return testObject.writeConfiguration(EditableConfigurationTarget.USER_LOCAL, { key: 'configurationEditing.service.testSetting', value: 'value' })
			.then(() => {
				const contents = fs.readFileSync(globalSettingsFile).toString('utf8');
				const parsed = json.parse(contents);
				assert.equal(parsed['configurationEditing.service.testSetting'], 'value');
				assert.equal(parsed['my.super.setting'], 'my.super.value');
			});
	});

	test('remove an existing setting - existing file', () => {
		fs.writeFileSync(globalSettingsFile, '{ "my.super.setting": "my.super.value", "configurationEditing.service.testSetting": "value" }');
		return testObject.writeConfiguration(EditableConfigurationTarget.USER_LOCAL, { key: 'configurationEditing.service.testSetting', value: undefined })
			.then(() => {
				const contents = fs.readFileSync(globalSettingsFile).toString('utf8');
				const parsed = json.parse(contents);
				assert.deepEqual(Object.keys(parsed), ['my.super.setting']);
				assert.equal(parsed['my.super.setting'], 'my.super.value');
			});
	});

	test('remove non existing setting - existing file', () => {
		fs.writeFileSync(globalSettingsFile, '{ "my.super.setting": "my.super.value" }');
		return testObject.writeConfiguration(EditableConfigurationTarget.USER_LOCAL, { key: 'configurationEditing.service.testSetting', value: undefined })
			.then(() => {
				const contents = fs.readFileSync(globalSettingsFile).toString('utf8');
				const parsed = json.parse(contents);
				assert.deepEqual(Object.keys(parsed), ['my.super.setting']);
				assert.equal(parsed['my.super.setting'], 'my.super.value');
			});
	});

	test('write workspace standalone setting - empty file', () => {
		return testObject.writeConfiguration(EditableConfigurationTarget.WORKSPACE, { key: 'tasks.service.testSetting', value: 'value' })
			.then(() => {
				const target = path.join(workspaceDir, WORKSPACE_STANDALONE_CONFIGURATIONS['tasks']);
				const contents = fs.readFileSync(target).toString('utf8');
				const parsed = json.parse(contents);
				assert.equal(parsed['service.testSetting'], 'value');
			});
	});

	test('write workspace standalone setting - existing file', () => {
		const target = path.join(workspaceDir, WORKSPACE_STANDALONE_CONFIGURATIONS['launch']);
		fs.writeFileSync(target, '{ "my.super.setting": "my.super.value" }');
		return testObject.writeConfiguration(EditableConfigurationTarget.WORKSPACE, { key: 'launch.service.testSetting', value: 'value' })
			.then(() => {
				const contents = fs.readFileSync(target).toString('utf8');
				const parsed = json.parse(contents);
				assert.equal(parsed['service.testSetting'], 'value');
				assert.equal(parsed['my.super.setting'], 'my.super.value');
			});
	});

	test('write workspace standalone setting - empty file - full JSON', () => {
		return testObject.writeConfiguration(EditableConfigurationTarget.WORKSPACE, { key: 'tasks', value: { 'version': '1.0.0', tasks: [{ 'taskName': 'myTask' }] } })
			.then(() => {
				const target = path.join(workspaceDir, WORKSPACE_STANDALONE_CONFIGURATIONS['tasks']);
				const contents = fs.readFileSync(target).toString('utf8');
				const parsed = json.parse(contents);

				assert.equal(parsed['version'], '1.0.0');
				assert.equal(parsed['tasks'][0]['taskName'], 'myTask');
			});
	});

	test('write workspace standalone setting - existing file - full JSON', () => {
		const target = path.join(workspaceDir, WORKSPACE_STANDALONE_CONFIGURATIONS['tasks']);
		fs.writeFileSync(target, '{ "my.super.setting": "my.super.value" }');
		return testObject.writeConfiguration(EditableConfigurationTarget.WORKSPACE, { key: 'tasks', value: { 'version': '1.0.0', tasks: [{ 'taskName': 'myTask' }] } })
			.then(() => {
				const contents = fs.readFileSync(target).toString('utf8');
				const parsed = json.parse(contents);

				assert.equal(parsed['version'], '1.0.0');
				assert.equal(parsed['tasks'][0]['taskName'], 'myTask');
			});
	});

	test('write workspace standalone setting - existing file with JSON errors - full JSON', () => {
		const target = path.join(workspaceDir, WORKSPACE_STANDALONE_CONFIGURATIONS['tasks']);
		fs.writeFileSync(target, '{ "my.super.setting": '); // invalid JSON
		return testObject.writeConfiguration(EditableConfigurationTarget.WORKSPACE, { key: 'tasks', value: { 'version': '1.0.0', tasks: [{ 'taskName': 'myTask' }] } })
			.then(() => {
				const contents = fs.readFileSync(target).toString('utf8');
				const parsed = json.parse(contents);

				assert.equal(parsed['version'], '1.0.0');
				assert.equal(parsed['tasks'][0]['taskName'], 'myTask');
			});
	});

	test('write workspace standalone setting should replace complete file', () => {
		const target = path.join(workspaceDir, WORKSPACE_STANDALONE_CONFIGURATIONS['tasks']);
		fs.writeFileSync(target, `{
			"version": "1.0.0",
			"tasks": [
				{
					"taskName": "myTask1"
				},
				{
					"taskName": "myTask2"
				}
			]
		}`);
		return testObject.writeConfiguration(EditableConfigurationTarget.WORKSPACE, { key: 'tasks', value: { 'version': '1.0.0', tasks: [{ 'taskName': 'myTask1' }] } })
			.then(() => {
				const actual = fs.readFileSync(target).toString('utf8');
				const expected = JSON.stringify({ 'version': '1.0.0', tasks: [{ 'taskName': 'myTask1' }] }, null, '\t');
				assert.equal(actual, expected);
			});
	});
});
