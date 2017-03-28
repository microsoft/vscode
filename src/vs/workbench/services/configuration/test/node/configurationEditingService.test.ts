/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import assert = require('assert');
import os = require('os');
import path = require('path');
import fs = require('fs');
import * as json from 'vs/base/common/json';
import { TPromise } from 'vs/base/common/winjs.base';
import { Registry } from 'vs/platform/platform';
import { ParsedArgs, IEnvironmentService } from 'vs/platform/environment/common/environment';
import { parseArgs } from 'vs/platform/environment/node/argv';
import { WorkspaceContextService, IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { EnvironmentService } from 'vs/platform/environment/node/environmentService';
import extfs = require('vs/base/node/extfs');
import { TestTextFileService, TestEditorGroupService, TestLifecycleService, TestBackupFileService } from 'vs/workbench/test/workbenchTestServices';
import uuid = require('vs/base/common/uuid');
import { IConfigurationRegistry, Extensions as ConfigurationExtensions } from 'vs/platform/configuration/common/configurationRegistry';
import { WorkspaceConfigurationService } from 'vs/workbench/services/configuration/node/configurationService';
import URI from 'vs/base/common/uri';
import { FileService } from 'vs/workbench/services/files/node/fileService';
import { ConfigurationEditingService } from 'vs/workbench/services/configuration/node/configurationEditingService';
import { ConfigurationTarget, IConfigurationEditingError, ConfigurationEditingErrorCode } from 'vs/workbench/services/configuration/common/configurationEditing';
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
import { ITextModelResolverService } from 'vs/editor/common/services/resolverService';
import { TextModelResolverService } from 'vs/workbench/services/textmodelResolver/common/textModelResolverService';
import { IModeService } from 'vs/editor/common/services/modeService';
import { ModeServiceImpl } from 'vs/editor/common/services/modeServiceImpl';
import { IModelService } from 'vs/editor/common/services/modelService';
import { ModelServiceImpl } from 'vs/editor/common/services/modelServiceImpl';


class SettingsTestEnvironmentService extends EnvironmentService {

	constructor(args: ParsedArgs, _execPath: string, private customAppSettingsHome) {
		super(args, _execPath);
	}

	get appSettingsPath(): string { return this.customAppSettingsHome; }
}

suite('ConfigurationEditingService', () => {

	let instantiationService;
	let testObject: ConfigurationEditingService;
	let parentDir;
	let workspaceDir;
	let globalSettingsFile;
	let workspaceSettingsDir;

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
		instantiationService.stub(IEnvironmentService, new SettingsTestEnvironmentService(parseArgs(process.argv), process.execPath, globalSettingsFile));
		instantiationService.stub(IWorkspaceContextService, new WorkspaceContextService(noWorkspace ? null : { resource: URI.file(workspaceDir) }));
		const configurationService = instantiationService.createInstance(WorkspaceConfigurationService);
		instantiationService.stub(IConfigurationService, configurationService);
		instantiationService.stub(ILifecycleService, new TestLifecycleService());
		instantiationService.stub(IEditorGroupService, new TestEditorGroupService());
		instantiationService.stub(ITelemetryService, NullTelemetryService);
		instantiationService.stub(IModeService, ModeServiceImpl);
		instantiationService.stub(IModelService, instantiationService.createInstance(ModelServiceImpl));
		instantiationService.stub(IFileService, new FileService(workspaceDir, { disableWatcher: true }));
		instantiationService.stub(IUntitledEditorService, instantiationService.createInstance(UntitledEditorService));

		instantiationService.stub(ITextFileService, instantiationService.createInstance(TestTextFileService));
		instantiationService.stub(ITextModelResolverService, <ITextModelResolverService>instantiationService.createInstance(TextModelResolverService));
		instantiationService.stub(IBackupFileService, new TestBackupFileService());

		testObject = instantiationService.createInstance(ConfigurationEditingService);
		return configurationService.initialize();
	}

	teardown(() => {
		clearServices();
		return clearWorkspace();
	});

	function clearServices(): void {
		if (instantiationService) {
			const configuraitonService = <WorkspaceConfigurationService>instantiationService.get(IConfigurationService);
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
			(error: IConfigurationEditingError) => assert.equal(error.code, ConfigurationEditingErrorCode.ERROR_UNKNOWN_KEY));
	});

	test('errors cases - invalid target', () => {
		return testObject.writeConfiguration(ConfigurationTarget.USER, { key: 'tasks.something', value: 'value' })
			.then(() => assert.fail('Should fail with ERROR_INVALID_TARGET'),
			(error: IConfigurationEditingError) => assert.equal(error.code, ConfigurationEditingErrorCode.ERROR_INVALID_TARGET));
	});

	test('errors cases - no workspace', () => {
		return setUpServices(true)
			.then(() => testObject.writeConfiguration(ConfigurationTarget.WORKSPACE, { key: 'configurationEditing.service.testSetting', value: 'value' }))
			.then(() => assert.fail('Should fail with ERROR_NO_WORKSPACE_OPENED'),
			(error: IConfigurationEditingError) => assert.equal(error.code, ConfigurationEditingErrorCode.ERROR_NO_WORKSPACE_OPENED));
	});

	test('errors cases - invalid configuration', () => {
		fs.writeFileSync(globalSettingsFile, ',,,,,,,,,,,,,,');
		return testObject.writeConfiguration(ConfigurationTarget.USER, { key: 'configurationEditing.service.testSetting', value: 'value' })
			.then(() => assert.fail('Should fail with ERROR_INVALID_CONFIGURATION'),
			(error: IConfigurationEditingError) => assert.equal(error.code, ConfigurationEditingErrorCode.ERROR_INVALID_CONFIGURATION));
	});

	test('errors cases - dirty', () => {
		instantiationService.stub(ITextFileService, 'isDirty', true);
		return testObject.writeConfiguration(ConfigurationTarget.USER, { key: 'configurationEditing.service.testSetting', value: 'value' })
			.then(() => assert.fail('Should fail with ERROR_CONFIGURATION_FILE_DIRTY error.'),
			(error: IConfigurationEditingError) => assert.equal(error.code, ConfigurationEditingErrorCode.ERROR_CONFIGURATION_FILE_DIRTY));
	});

	test('write one setting - empty file', () => {
		return testObject.writeConfiguration(ConfigurationTarget.USER, { key: 'configurationEditing.service.testSetting', value: 'value' })
			.then(() => instantiationService.get(IConfigurationService).reloadConfiguration())
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
			.then(() => instantiationService.get(IConfigurationService).reloadConfiguration())
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
			.then(() => instantiationService.get(IConfigurationService).reloadConfiguration())
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
			.then(() => instantiationService.get(IConfigurationService).reloadConfiguration())
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
			.then(() => instantiationService.get(IConfigurationService).reloadConfiguration())
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