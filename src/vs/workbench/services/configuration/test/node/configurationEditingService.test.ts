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
import { ParsedArgs } from 'vs/platform/environment/common/environment';
import { parseArgs } from 'vs/platform/environment/node/argv';
import { WorkspaceContextService, IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { EnvironmentService } from 'vs/platform/environment/node/environmentService';
import extfs = require('vs/base/node/extfs');
import { workbenchInstantiationService, TestTextFileService } from 'vs/workbench/test/workbenchTestServices';
import uuid = require('vs/base/common/uuid');
import { IConfigurationRegistry, Extensions as ConfigurationExtensions } from 'vs/platform/configuration/common/configurationRegistry';
import { WorkspaceConfigurationService } from 'vs/workbench/services/configuration/node/configurationService';
import URI from 'vs/base/common/uri';
import { FileService } from 'vs/workbench/services/files/node/fileService';
import { ConfigurationEditingService } from 'vs/workbench/services/configuration/node/configurationEditingService';
import { ConfigurationTarget, IConfigurationEditingError, ConfigurationEditingErrorCode } from 'vs/workbench/services/configuration/common/configurationEditing';
import { IFileService } from 'vs/platform/files/common/files';
import { IWorkbenchEditorService } from 'vs/workbench/services/editor/common/editorService';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { WORKSPACE_STANDALONE_CONFIGURATIONS } from 'vs/workbench/services/configuration/common/configuration';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IUntitledEditorService } from 'vs/workbench/services/untitled/common/untitledEditorService';
import { ILifecycleService } from 'vs/platform/lifecycle/common/lifecycle';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { IMessageService } from 'vs/platform/message/common/message';
import { IBackupFileService } from 'vs/workbench/services/backup/common/backup';
import { IWindowsService } from 'vs/platform/windows/common/windows';
import { IEditorGroupService } from 'vs/workbench/services/group/common/groupService';

class SettingsTestEnvironmentService extends EnvironmentService {

	constructor(args: ParsedArgs, _execPath: string, private customAppSettingsHome) {
		super(args, _execPath);
	}

	get appSettingsPath(): string { return this.customAppSettingsHome; }
}

class TestDirtyTextFileService extends TestTextFileService {

	constructor(
		private dirty: boolean,
		@ILifecycleService lifecycleService: ILifecycleService,
		@IWorkspaceContextService contextService: IWorkspaceContextService,
		@IConfigurationService configurationService: IConfigurationService,
		@ITelemetryService telemetryService: ITelemetryService,
		@IWorkbenchEditorService editorService: IWorkbenchEditorService,
		@IFileService fileService: IFileService,
		@IUntitledEditorService untitledEditorService: IUntitledEditorService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IMessageService messageService: IMessageService,
		@IBackupFileService backupFileService: IBackupFileService,
		@IWindowsService windowsService: IWindowsService,
		@IEditorGroupService editorGroupService: IEditorGroupService
	) {
		super(lifecycleService, contextService, configurationService, telemetryService, editorService, fileService, untitledEditorService, instantiationService, messageService, backupFileService, windowsService, editorGroupService);
	}

	public isDirty(resource?: URI): boolean {
		return this.dirty;
	}
}

suite('WorkspaceConfigurationEditingService - Node', () => {

	function createWorkspace(callback: (workspaceDir: string, globalSettingsFile: string, cleanUp: (done: () => void, error?: Error) => void, error: Error) => void): void {
		const id = uuid.generateUuid();
		const parentDir = path.join(os.tmpdir(), 'vsctests', id);
		const workspaceDir = path.join(parentDir, 'workspaceconfig', id);
		const workspaceSettingsDir = path.join(workspaceDir, '.vscode');
		const globalSettingsFile = path.join(workspaceDir, 'config.json');

		extfs.mkdirp(workspaceSettingsDir, 493, (error) => {
			callback(workspaceDir, globalSettingsFile, (done, error) => {
				extfs.del(parentDir, os.tmpdir(), () => { }, () => {
					if (error) {
						assert.fail(error);
					}

					done();
				});
			}, error);
		});
	}

	function createServices(workspaceDir: string, globalSettingsFile: string, dirty?: boolean, noWorkspace?: boolean): TPromise<{ configurationService: WorkspaceConfigurationService, configurationEditingService: ConfigurationEditingService }> {
		const workspaceContextService = new WorkspaceContextService(noWorkspace ? null : { resource: URI.file(workspaceDir) });
		const environmentService = new SettingsTestEnvironmentService(parseArgs(process.argv), process.execPath, globalSettingsFile);
		const fileService = new FileService(noWorkspace ? null : workspaceDir, { disableWatcher: true });
		const configurationService = new WorkspaceConfigurationService(workspaceContextService, environmentService);
		const textFileService = workbenchInstantiationService().createInstance(TestDirtyTextFileService, dirty);

		return configurationService.initialize().then(() => {
			return {
				configurationEditingService: new ConfigurationEditingService(configurationService, workspaceContextService, environmentService, fileService, null, textFileService),
				configurationService
			};
		});
	}

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

	test('errors cases - invalid key', (done: () => void) => {
		createWorkspace((workspaceDir, globalSettingsFile, cleanUp, error) => {
			if (error) {
				return cleanUp(done, error);
			}

			createServices(workspaceDir, globalSettingsFile, false, true /* no workspace */).done(services => {
				return services.configurationEditingService.writeConfiguration(ConfigurationTarget.WORKSPACE, { key: 'unknown.key', value: 'value' }).then(res => {
				}, (error: IConfigurationEditingError) => {
					assert.equal(error.code, ConfigurationEditingErrorCode.ERROR_UNKNOWN_KEY);
					services.configurationService.dispose();
					cleanUp(done);
				});
			}, error => cleanUp(done, error));
		});
	});

	test('errors cases - invalid target', (done: () => void) => {
		createWorkspace((workspaceDir, globalSettingsFile, cleanUp, error) => {
			if (error) {
				return cleanUp(done, error);
			}

			createServices(workspaceDir, globalSettingsFile).done(services => {
				return services.configurationEditingService.writeConfiguration(ConfigurationTarget.USER, { key: 'tasks.something', value: 'value' }).then(res => {
				}, (error: IConfigurationEditingError) => {
					assert.equal(error.code, ConfigurationEditingErrorCode.ERROR_INVALID_TARGET);
					services.configurationService.dispose();
					cleanUp(done);
				});
			}, error => cleanUp(done, error));
		});
	});

	test('errors cases - no workspace', (done: () => void) => {
		createWorkspace((workspaceDir, globalSettingsFile, cleanUp, error) => {
			if (error) {
				return cleanUp(done, error);
			}

			createServices(workspaceDir, globalSettingsFile, false, true /* no workspace */).done(services => {
				return services.configurationEditingService.writeConfiguration(ConfigurationTarget.WORKSPACE, { key: 'configurationEditing.service.testSetting', value: 'value' }).then(res => {
				}, (error: IConfigurationEditingError) => {
					assert.equal(error.code, ConfigurationEditingErrorCode.ERROR_NO_WORKSPACE_OPENED);
					services.configurationService.dispose();
					cleanUp(done);
				});
			}, error => cleanUp(done, error));
		});
	});

	test('errors cases - invalid configuration', (done: () => void) => {
		createWorkspace((workspaceDir, globalSettingsFile, cleanUp, error) => {
			if (error) {
				return cleanUp(done, error);
			}

			createServices(workspaceDir, globalSettingsFile).done(services => {
				fs.writeFileSync(globalSettingsFile, ',,,,,,,,,,,,,,');

				return services.configurationEditingService.writeConfiguration(ConfigurationTarget.USER, { key: 'configurationEditing.service.testSetting', value: 'value' }).then(res => {
				}, (error: IConfigurationEditingError) => {
					assert.equal(error.code, ConfigurationEditingErrorCode.ERROR_INVALID_CONFIGURATION);
					services.configurationService.dispose();
					cleanUp(done);
				});
			}, error => cleanUp(done, error));
		});
	});

	test('errors cases - dirty', (done: () => void) => {
		createWorkspace((workspaceDir, globalSettingsFile, cleanUp, error) => {
			if (error) {
				return cleanUp(done, error);
			}

			createServices(workspaceDir, globalSettingsFile, true).done(services => {
				return services.configurationEditingService.writeConfiguration(ConfigurationTarget.USER, { key: 'configurationEditing.service.testSetting', value: 'value' }).then(res => {
				}, (error: IConfigurationEditingError) => {
					assert.equal(error.code, ConfigurationEditingErrorCode.ERROR_CONFIGURATION_FILE_DIRTY);
					services.configurationService.dispose();
					cleanUp(done);
				});
			}, error => cleanUp(done, error));
		});
	});

	test('write one setting - empty file', (done: () => void) => {
		createWorkspace((workspaceDir, globalSettingsFile, cleanUp, error) => {
			if (error) {
				return cleanUp(done, error);
			}

			createServices(workspaceDir, globalSettingsFile).done(services => {
				return services.configurationEditingService.writeConfiguration(ConfigurationTarget.USER, { key: 'configurationEditing.service.testSetting', value: 'value' }).then(res => {
					const contents = fs.readFileSync(globalSettingsFile).toString('utf8');
					const parsed = json.parse(contents);
					assert.equal(parsed['configurationEditing.service.testSetting'], 'value');
					assert.equal(services.configurationService.lookup('configurationEditing.service.testSetting').value, 'value');

					services.configurationService.dispose();
					cleanUp(done);
				});
			}, error => cleanUp(done, error));
		});
	});

	test('write one setting - existing file', (done: () => void) => {
		createWorkspace((workspaceDir, globalSettingsFile, cleanUp, error) => {
			if (error) {
				return cleanUp(done, error);
			}

			createServices(workspaceDir, globalSettingsFile).done(services => {
				fs.writeFileSync(globalSettingsFile, '{ "my.super.setting": "my.super.value" }');

				return services.configurationEditingService.writeConfiguration(ConfigurationTarget.USER, { key: 'configurationEditing.service.testSetting', value: 'value' }).then(res => {
					const contents = fs.readFileSync(globalSettingsFile).toString('utf8');
					const parsed = json.parse(contents);
					assert.equal(parsed['configurationEditing.service.testSetting'], 'value');
					assert.equal(parsed['my.super.setting'], 'my.super.value');

					assert.equal(services.configurationService.lookup('configurationEditing.service.testSetting').value, 'value');
					assert.equal(services.configurationService.lookup('my.super.setting').value, 'my.super.value');

					services.configurationService.dispose();
					cleanUp(done);
				});
			}, error => cleanUp(done, error));
		});
	});

	test('write workspace standalone setting - empty file', (done: () => void) => {
		createWorkspace((workspaceDir, globalSettingsFile, cleanUp, error) => {
			if (error) {
				return cleanUp(done, error);
			}

			createServices(workspaceDir, globalSettingsFile).done(services => {
				return services.configurationEditingService.writeConfiguration(ConfigurationTarget.WORKSPACE, { key: 'tasks.service.testSetting', value: 'value' }).then(res => {
					const target = path.join(workspaceDir, WORKSPACE_STANDALONE_CONFIGURATIONS['tasks']);
					const contents = fs.readFileSync(target).toString('utf8');
					const parsed = json.parse(contents);
					assert.equal(parsed['service.testSetting'], 'value');
					assert.equal(services.configurationService.lookup('tasks.service.testSetting').value, 'value');

					services.configurationService.dispose();
					cleanUp(done);
				});
			}, error => cleanUp(done, error));
		});
	});

	test('write workspace standalone setting - existing file', (done: () => void) => {
		createWorkspace((workspaceDir, globalSettingsFile, cleanUp, error) => {
			if (error) {
				return cleanUp(done, error);
			}

			createServices(workspaceDir, globalSettingsFile).done(services => {
				const target = path.join(workspaceDir, WORKSPACE_STANDALONE_CONFIGURATIONS['launch']);

				fs.writeFileSync(target, '{ "my.super.setting": "my.super.value" }');

				return services.configurationEditingService.writeConfiguration(ConfigurationTarget.WORKSPACE, { key: 'launch.service.testSetting', value: 'value' }).then(res => {
					const contents = fs.readFileSync(target).toString('utf8');
					const parsed = json.parse(contents);
					assert.equal(parsed['service.testSetting'], 'value');
					assert.equal(parsed['my.super.setting'], 'my.super.value');

					assert.equal(services.configurationService.lookup('launch.service.testSetting').value, 'value');
					assert.equal(services.configurationService.lookup('launch.my.super.setting').value, 'my.super.value');

					services.configurationService.dispose();
					cleanUp(done);
				});
			}, error => cleanUp(done, error));
		});
	});

	test('write workspace standalone setting - empty file - full JSON', (done: () => void) => {
		createWorkspace((workspaceDir, globalSettingsFile, cleanUp, error) => {
			if (error) {
				return cleanUp(done, error);
			}

			createServices(workspaceDir, globalSettingsFile).done(services => {
				return services.configurationEditingService.writeConfiguration(ConfigurationTarget.WORKSPACE, { key: 'tasks', value: { 'version': '1.0.0', tasks: [{ 'taskName': 'myTask' }] } }).then(res => {
					const target = path.join(workspaceDir, WORKSPACE_STANDALONE_CONFIGURATIONS['tasks']);
					const contents = fs.readFileSync(target).toString('utf8');
					const parsed = json.parse(contents);

					assert.equal(parsed['version'], '1.0.0');
					assert.equal(parsed['tasks'][0]['taskName'], 'myTask');

					services.configurationService.dispose();
					cleanUp(done);
				});
			}, error => cleanUp(done, error));
		});
	});

	test('write workspace standalone setting - existing file - full JSON', (done: () => void) => {
		createWorkspace((workspaceDir, globalSettingsFile, cleanUp, error) => {
			if (error) {
				return cleanUp(done, error);
			}

			createServices(workspaceDir, globalSettingsFile).done(services => {
				const target = path.join(workspaceDir, WORKSPACE_STANDALONE_CONFIGURATIONS['launch']);

				fs.writeFileSync(target, '{ "my.super.setting": "my.super.value" }');

				return services.configurationEditingService.writeConfiguration(ConfigurationTarget.WORKSPACE, { key: 'tasks', value: { 'version': '1.0.0', tasks: [{ 'taskName': 'myTask' }] } }).then(res => {
					const target = path.join(workspaceDir, WORKSPACE_STANDALONE_CONFIGURATIONS['tasks']);
					const contents = fs.readFileSync(target).toString('utf8');
					const parsed = json.parse(contents);

					assert.equal(parsed['version'], '1.0.0');
					assert.equal(parsed['tasks'][0]['taskName'], 'myTask');

					services.configurationService.dispose();
					cleanUp(done);
				});
			}, error => cleanUp(done, error));
		});
	});

	test('write workspace standalone setting - existing file with JSON errors - full JSON', (done: () => void) => {
		createWorkspace((workspaceDir, globalSettingsFile, cleanUp, error) => {
			if (error) {
				return cleanUp(done, error);
			}

			createServices(workspaceDir, globalSettingsFile).done(services => {
				const target = path.join(workspaceDir, WORKSPACE_STANDALONE_CONFIGURATIONS['launch']);

				fs.writeFileSync(target, '{ "my.super.setting": '); // invalid JSON

				return services.configurationEditingService.writeConfiguration(ConfigurationTarget.WORKSPACE, { key: 'tasks', value: { 'version': '1.0.0', tasks: [{ 'taskName': 'myTask' }] } }).then(res => {
					const target = path.join(workspaceDir, WORKSPACE_STANDALONE_CONFIGURATIONS['tasks']);
					const contents = fs.readFileSync(target).toString('utf8');
					const parsed = json.parse(contents);

					assert.equal(parsed['version'], '1.0.0');
					assert.equal(parsed['tasks'][0]['taskName'], 'myTask');

					services.configurationService.dispose();
					cleanUp(done);
				});
			}, error => cleanUp(done, error));
		});
	});
});