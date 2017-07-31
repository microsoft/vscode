/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as sinon from 'sinon';
import assert = require('assert');
import os = require('os');
import path = require('path');
import fs = require('fs');
import * as json from 'vs/base/common/json';
import URI from 'vs/base/common/uri';
import { TPromise } from 'vs/base/common/winjs.base';
import { Registry } from 'vs/platform/registry/common/platform';
import { ParsedArgs, IEnvironmentService } from 'vs/platform/environment/common/environment';
import { parseArgs } from 'vs/platform/environment/node/argv';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { EnvironmentService } from 'vs/platform/environment/node/environmentService';
import extfs = require('vs/base/node/extfs');
import { TestTextFileService, TestEditorGroupService, TestLifecycleService, TestBackupFileService } from 'vs/workbench/test/workbenchTestServices';
import uuid = require('vs/base/common/uuid');
import { IConfigurationRegistry, Extensions as ConfigurationExtensions } from 'vs/platform/configuration/common/configurationRegistry';
import { WorkspaceService, EmptyWorkspaceServiceImpl, WorkspaceServiceImpl } from 'vs/workbench/services/configuration/node/configuration';
import { FileService } from 'vs/workbench/services/files/node/fileService';
import { ConfigurationEditingService } from 'vs/workbench/services/configuration/node/configurationEditingService';
import { ConfigurationTarget, ConfigurationEditingError, ConfigurationEditingErrorCode } from 'vs/workbench/services/configuration/common/configurationEditing';
import { IFileService } from 'vs/platform/files/common/files';
import { WORKSPACE_STANDALONE_CONFIGURATIONS } from 'vs/workbench/services/configuration/common/configuration';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IUntitledEditorService, UntitledEditorService } from 'vs/workbench/services/untitled/common/untitledEditorService';
import { ILifecycleService } from 'vs/platform/lifecycle/common/lifecycle';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { NullTelemetryService } from 'vs/platform/telemetry/common/telemetryUtils';
import { IBackupFileService } from 'vs/workbench/services/backup/common/backup';
import { IEditorGroupService } from 'vs/workbench/services/group/common/groupService';
import { TestInstantiationService } from 'vs/platform/instantiation/test/common/instantiationServiceMock';
import { ITextFileService } from 'vs/workbench/services/textfile/common/textfiles';
import { ITextModelService } from 'vs/editor/common/services/resolverService';
import { TextModelResolverService } from 'vs/workbench/services/textmodelResolver/common/textModelResolverService';
import { IModeService } from 'vs/editor/common/services/modeService';
import { ModeServiceImpl } from 'vs/editor/common/services/modeServiceImpl';
import { IModelService } from 'vs/editor/common/services/modelService';
import { ModelServiceImpl } from 'vs/editor/common/services/modelServiceImpl';
import { IChoiceService, IMessageService } from 'vs/platform/message/common/message';
import { TestConfigurationService } from 'vs/platform/configuration/test/common/testConfigurationService';
import { IWorkspacesService } from 'vs/platform/workspaces/common/workspaces';

class SettingsTestEnvironmentService extends EnvironmentService {

	constructor(args: ParsedArgs, _execPath: string, private customAppSettingsHome) {
		super(args, _execPath);
	}

	get appSettingsPath(): string { return this.customAppSettingsHome; }
}

suite('ConfigurationEditingService', () => {

	let instantiationService: TestInstantiationService;
	let testObject: ConfigurationEditingService;
	let parentDir;
	let workspaceDir;
	let globalSettingsFile;
	let workspaceSettingsDir;
	let choiceService;

	suiteSetup(() => {
		const configurationRegistry = <IConfigurationRegistry>Registry.as(ConfigurationExtensions.Configuration);
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

	function setUpWorkspace(): TPromise<void> {
		return new TPromise<void>((c, e) => {
			const id = uuid.generateUuid();
			parentDir = path.join(os.tmpdir(), 'vsctests', id);
			workspaceDir = path.join(parentDir, 'workspaceconfig', id);
			globalSettingsFile = path.join(workspaceDir, 'config.json');
			workspaceSettingsDir = path.join(workspaceDir, '.vscode');
			extfs.mkdirp(workspaceSettingsDir, 493, (error) => {
				if (error) {
					e(error);
				} else {
					c(null);
				}
			});
		});
	}

	function setUpServices(noWorkspace: boolean = false): TPromise<void> {
		// Clear services if they are already created
		clearServices();

		instantiationService = new TestInstantiationService();
		const environmentService = new SettingsTestEnvironmentService(parseArgs(process.argv), process.execPath, globalSettingsFile);
		instantiationService.stub(IEnvironmentService, environmentService);
		const workspacesService = instantiationService.stub(IWorkspacesService, {});
		const workspaceService = noWorkspace ? new EmptyWorkspaceServiceImpl(environmentService) : new WorkspaceServiceImpl(null, URI.file(workspaceDir), environmentService, workspacesService);
		instantiationService.stub(IWorkspaceContextService, workspaceService);
		instantiationService.stub(IConfigurationService, workspaceService);
		instantiationService.stub(ILifecycleService, new TestLifecycleService());
		instantiationService.stub(IEditorGroupService, new TestEditorGroupService());
		instantiationService.stub(ITelemetryService, NullTelemetryService);
		instantiationService.stub(IModeService, ModeServiceImpl);
		instantiationService.stub(IModelService, instantiationService.createInstance(ModelServiceImpl));
		instantiationService.stub(IFileService, new FileService(workspaceService, new TestConfigurationService(), { disableWatcher: true }));
		instantiationService.stub(IUntitledEditorService, instantiationService.createInstance(UntitledEditorService));
		instantiationService.stub(ITextFileService, instantiationService.createInstance(TestTextFileService));
		instantiationService.stub(ITextModelService, <ITextModelService>instantiationService.createInstance(TextModelResolverService));
		instantiationService.stub(IBackupFileService, new TestBackupFileService());
		choiceService = instantiationService.stub(IChoiceService, {
			choose: (severity, message, options, cancelId): TPromise<number> => {
				return TPromise.as(cancelId);
			}
		});
		instantiationService.stub(IMessageService, {
			show: (severity, message, options, cancelId): void => { }
		});

		testObject = instantiationService.createInstance(ConfigurationEditingService);
		return workspaceService.initialize();
	}

	teardown(() => {
		clearServices();
		return clearWorkspace();
	});

	function clearServices(): void {
		if (instantiationService) {
			const configuraitonService = <WorkspaceService>instantiationService.get(IConfigurationService);
			if (configuraitonService) {
				configuraitonService.dispose();
			}
			instantiationService = null;
		}
	}

	function clearWorkspace(): TPromise<void> {
		return new TPromise<void>((c, e) => {
			if (parentDir) {
				extfs.del(parentDir, os.tmpdir(), () => c(null), () => c(null));
			} else {
				c(null);
			}
		}).then(() => parentDir = null);
	}

	test('errors cases - invalid key', () => {
		return testObject.writeConfiguration(ConfigurationTarget.WORKSPACE, { key: 'unknown.key', value: 'value' })
			.then(() => assert.fail('Should fail with ERROR_UNKNOWN_KEY'),
			(error: ConfigurationEditingError) => assert.equal(error.code, ConfigurationEditingErrorCode.ERROR_UNKNOWN_KEY));
	});

	test('errors cases - invalid target', () => {
		return testObject.writeConfiguration(ConfigurationTarget.USER, { key: 'tasks.something', value: 'value' })
			.then(() => assert.fail('Should fail with ERROR_INVALID_TARGET'),
			(error: ConfigurationEditingError) => assert.equal(error.code, ConfigurationEditingErrorCode.ERROR_INVALID_USER_TARGET));
	});

	test('errors cases - no workspace', () => {
		return setUpServices(true)
			.then(() => testObject.writeConfiguration(ConfigurationTarget.WORKSPACE, { key: 'configurationEditing.service.testSetting', value: 'value' }))
			.then(() => assert.fail('Should fail with ERROR_NO_WORKSPACE_OPENED'),
			(error: ConfigurationEditingError) => assert.equal(error.code, ConfigurationEditingErrorCode.ERROR_NO_WORKSPACE_OPENED));
	});

	test('errors cases - invalid configuration', () => {
		fs.writeFileSync(globalSettingsFile, ',,,,,,,,,,,,,,');
		return testObject.writeConfiguration(ConfigurationTarget.USER, { key: 'configurationEditing.service.testSetting', value: 'value' })
			.then(() => assert.fail('Should fail with ERROR_INVALID_CONFIGURATION'),
			(error: ConfigurationEditingError) => assert.equal(error.code, ConfigurationEditingErrorCode.ERROR_INVALID_CONFIGURATION));
	});

	test('errors cases - dirty', () => {
		instantiationService.stub(ITextFileService, 'isDirty', true);
		return testObject.writeConfiguration(ConfigurationTarget.USER, { key: 'configurationEditing.service.testSetting', value: 'value' })
			.then(() => assert.fail('Should fail with ERROR_CONFIGURATION_FILE_DIRTY error.'),
			(error: ConfigurationEditingError) => assert.equal(error.code, ConfigurationEditingErrorCode.ERROR_CONFIGURATION_FILE_DIRTY));
	});

	test('dirty error is not thrown if not asked to save', () => {
		instantiationService.stub(ITextFileService, 'isDirty', true);
		return testObject.writeConfiguration(ConfigurationTarget.USER, { key: 'configurationEditing.service.testSetting', value: 'value' }, { donotSave: true })
			.then(() => null, error => assert.fail('Should not fail.'));
	});

	test('do not notify error', () => {
		instantiationService.stub(ITextFileService, 'isDirty', true);
		const target = sinon.stub();
		instantiationService.stubPromise(IChoiceService, 'choose', target);
		return testObject.writeConfiguration(ConfigurationTarget.USER, { key: 'configurationEditing.service.testSetting', value: 'value' }, { donotNotifyError: true })
			.then(() => assert.fail('Should fail with ERROR_CONFIGURATION_FILE_DIRTY error.'),
			(error: ConfigurationEditingError) => {
				assert.equal(false, target.calledOnce);
				assert.equal(error.code, ConfigurationEditingErrorCode.ERROR_CONFIGURATION_FILE_DIRTY);
			});
	});

	test('write one setting - empty file', () => {
		return testObject.writeConfiguration(ConfigurationTarget.USER, { key: 'configurationEditing.service.testSetting', value: 'value' })
			.then(() => {
				const contents = fs.readFileSync(globalSettingsFile).toString('utf8');
				const parsed = json.parse(contents);
				assert.equal(parsed['configurationEditing.service.testSetting'], 'value');
				assert.equal(instantiationService.get(IConfigurationService).lookup('configurationEditing.service.testSetting').value, 'value');
			});
	});

	test('write one setting - existing file', () => {
		fs.writeFileSync(globalSettingsFile, '{ "my.super.setting": "my.super.value" }');
		return testObject.writeConfiguration(ConfigurationTarget.USER, { key: 'configurationEditing.service.testSetting', value: 'value' })
			.then(() => {
				const contents = fs.readFileSync(globalSettingsFile).toString('utf8');
				const parsed = json.parse(contents);
				assert.equal(parsed['configurationEditing.service.testSetting'], 'value');
				assert.equal(parsed['my.super.setting'], 'my.super.value');

				const configurationService = instantiationService.get(IConfigurationService);
				assert.equal(configurationService.lookup('configurationEditing.service.testSetting').value, 'value');
				assert.equal(configurationService.lookup('my.super.setting').value, 'my.super.value');
			});
	});

	test('write workspace standalone setting - empty file', () => {
		return testObject.writeConfiguration(ConfigurationTarget.WORKSPACE, { key: 'tasks.service.testSetting', value: 'value' })
			.then(() => {
				const target = path.join(workspaceDir, WORKSPACE_STANDALONE_CONFIGURATIONS['tasks']);
				const contents = fs.readFileSync(target).toString('utf8');
				const parsed = json.parse(contents);
				assert.equal(parsed['service.testSetting'], 'value');
				const configurationService = instantiationService.get(IConfigurationService);
				assert.equal(configurationService.lookup('tasks.service.testSetting').value, 'value');
			});
	});

	test('write workspace standalone setting - existing file', () => {
		const target = path.join(workspaceDir, WORKSPACE_STANDALONE_CONFIGURATIONS['launch']);
		fs.writeFileSync(target, '{ "my.super.setting": "my.super.value" }');
		return testObject.writeConfiguration(ConfigurationTarget.WORKSPACE, { key: 'launch.service.testSetting', value: 'value' })
			.then(() => {
				const contents = fs.readFileSync(target).toString('utf8');
				const parsed = json.parse(contents);
				assert.equal(parsed['service.testSetting'], 'value');
				assert.equal(parsed['my.super.setting'], 'my.super.value');

				const configurationService = instantiationService.get(IConfigurationService);
				assert.equal(configurationService.lookup('launch.service.testSetting').value, 'value');
				assert.equal(configurationService.lookup('launch.my.super.setting').value, 'my.super.value');
			});
	});

	test('write workspace standalone setting - empty file - full JSON', () => {
		return testObject.writeConfiguration(ConfigurationTarget.WORKSPACE, { key: 'tasks', value: { 'version': '1.0.0', tasks: [{ 'taskName': 'myTask' }] } })
			.then(() => {
				const target = path.join(workspaceDir, WORKSPACE_STANDALONE_CONFIGURATIONS['tasks']);
				const contents = fs.readFileSync(target).toString('utf8');
				const parsed = json.parse(contents);

				assert.equal(parsed['version'], '1.0.0');
				assert.equal(parsed['tasks'][0]['taskName'], 'myTask');
			});
	});

	test('write workspace standalone setting - existing file - full JSON', () => {
		const target = path.join(workspaceDir, WORKSPACE_STANDALONE_CONFIGURATIONS['launch']);
		fs.writeFileSync(target, '{ "my.super.setting": "my.super.value" }');
		return testObject.writeConfiguration(ConfigurationTarget.WORKSPACE, { key: 'tasks', value: { 'version': '1.0.0', tasks: [{ 'taskName': 'myTask' }] } })
			.then(() => {
				const target = path.join(workspaceDir, WORKSPACE_STANDALONE_CONFIGURATIONS['tasks']);
				const contents = fs.readFileSync(target).toString('utf8');
				const parsed = json.parse(contents);

				assert.equal(parsed['version'], '1.0.0');
				assert.equal(parsed['tasks'][0]['taskName'], 'myTask');
			});
	});

	test('write workspace standalone setting - existing file with JSON errors - full JSON', () => {
		const target = path.join(workspaceDir, WORKSPACE_STANDALONE_CONFIGURATIONS['launch']);
		fs.writeFileSync(target, '{ "my.super.setting": '); // invalid JSON
		return testObject.writeConfiguration(ConfigurationTarget.WORKSPACE, { key: 'tasks', value: { 'version': '1.0.0', tasks: [{ 'taskName': 'myTask' }] } })
			.then(() => {
				const target = path.join(workspaceDir, WORKSPACE_STANDALONE_CONFIGURATIONS['tasks']);
				const contents = fs.readFileSync(target).toString('utf8');
				const parsed = json.parse(contents);

				assert.equal(parsed['version'], '1.0.0');
				assert.equal(parsed['tasks'][0]['taskName'], 'myTask');
			});
	});
});
