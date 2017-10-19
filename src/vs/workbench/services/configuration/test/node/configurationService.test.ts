/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import assert = require('assert');
import os = require('os');
import path = require('path');
import fs = require('fs');
import * as sinon from 'sinon';
import URI from 'vs/base/common/uri';
import { TPromise } from 'vs/base/common/winjs.base';
import { Registry } from 'vs/platform/registry/common/platform';
import { ParsedArgs, IEnvironmentService } from 'vs/platform/environment/common/environment';
import { EnvironmentService } from 'vs/platform/environment/node/environmentService';
import { parseArgs } from 'vs/platform/environment/node/argv';
import extfs = require('vs/base/node/extfs');
import uuid = require('vs/base/common/uuid');
import { IConfigurationRegistry, Extensions as ConfigurationExtensions, ConfigurationScope } from 'vs/platform/configuration/common/configurationRegistry';
import { WorkspaceService } from 'vs/workbench/services/configuration/node/configurationService';
import { FileChangeType, FileChangesEvent, IFileService } from 'vs/platform/files/common/files';
import { IWorkspaceContextService, WorkbenchState, IWorkspace } from 'vs/platform/workspace/common/workspace';
import { ConfigurationTarget, IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { workbenchInstantiationService, TestTextResourceConfigurationService, TestTextFileService } from 'vs/workbench/test/workbenchTestServices';
import { FileService } from 'vs/workbench/services/files/node/fileService';
import { TestInstantiationService } from 'vs/platform/instantiation/test/common/instantiationServiceMock';
import { ITextFileService } from 'vs/workbench/services/textfile/common/textfiles';
import { ITextModelService } from 'vs/editor/common/services/resolverService';
import { TextModelResolverService } from 'vs/workbench/services/textmodelResolver/common/textModelResolverService';

class SettingsTestEnvironmentService extends EnvironmentService {

	constructor(args: ParsedArgs, _execPath: string, private customAppSettingsHome) {
		super(args, _execPath);
	}

	get appSettingsPath(): string { return this.customAppSettingsHome; }
}

function createWorkspace(callback: (workspaceDir: string, globalSettingsFile: string, cleanUp: (callback: () => void) => void) => void): void {
	const id = uuid.generateUuid();
	const parentDir = path.join(os.tmpdir(), 'vsctests', id);
	const workspaceDir = path.join(parentDir, 'workspaceconfig', id);
	const workspaceSettingsDir = path.join(workspaceDir, '.vscode');
	const globalSettingsFile = path.join(workspaceDir, 'config.json');

	extfs.mkdirp(workspaceSettingsDir, 493, (error) => {
		callback(workspaceDir, globalSettingsFile, (callback) => extfs.del(parentDir, os.tmpdir(), () => { }, callback));
	});
}

function setUpFolderWorkspace(folderName: string): TPromise<{ parentDir: string, folderDir: string, workspaceService: WorkspaceService, environmentService: IEnvironmentService }> {
	const id = uuid.generateUuid();
	const parentDir = path.join(os.tmpdir(), 'vsctests', id);
	const globalSettingsFile = path.join(parentDir, 'settings.json');

	return setUpFolder(folderName, parentDir)
		.then(folderDir => {
			const environmentService = new SettingsTestEnvironmentService(parseArgs(process.argv), process.execPath, globalSettingsFile);
			const workspaceService = new WorkspaceService(environmentService, null);
			return workspaceService.initialize(folderDir).then(() => ({ parentDir, folderDir, workspaceService, environmentService }));
		});
}

function setUpFolder(folderName: string, parentDir: string): TPromise<string> {
	const folderDir = path.join(parentDir, folderName);
	const workspaceSettingsDir = path.join(folderDir, '.vscode');
	return new TPromise((c, e) => {
		extfs.mkdirp(workspaceSettingsDir, 493, (error) => {
			if (error) {
				e(error);
				return null;
			}
			c(folderDir);
		});
	});
}

function setUpWorkspace(folders: string[]): TPromise<{ parentDir: string, workspaceService: WorkspaceService, environmentService: IEnvironmentService }> {

	const id = uuid.generateUuid();
	const parentDir = path.join(os.tmpdir(), 'vsctests', id);
	const globalSettingsFile = path.join(parentDir, 'settings.json');

	return createDir(parentDir)
		.then(() => {
			const configPath = path.join(parentDir, 'vsctests.code-workspace');
			const workspace = { folders: folders.map(path => ({ path })) };
			fs.writeFileSync(configPath, JSON.stringify(workspace, null, '\t'));

			return TPromise.join(folders.map(folder => setUpFolder(folder, parentDir)))
				.then(() => {
					const environmentService = new SettingsTestEnvironmentService(parseArgs(process.argv), process.execPath, globalSettingsFile);
					const workspaceService = new WorkspaceService(environmentService, null);
					return workspaceService.initialize({ id, configPath }).then(() => ({ parentDir, workspaceService, environmentService }));
				});
		});
}

function createDir(dir: string): TPromise<void> {
	return new TPromise((c, e) => {
		extfs.mkdirp(dir, 493, (error) => {
			if (error) {
				e(error);
				return null;
			}
			c(null);
		});
	});
}

function createService(workspaceDir: string, globalSettingsFile: string): TPromise<WorkspaceService> {
	const environmentService = new SettingsTestEnvironmentService(parseArgs(process.argv), process.execPath, globalSettingsFile);
	const service = new WorkspaceService(environmentService, null);

	return service.initialize(workspaceDir).then(() => service);
}

suite('WorkspaceContextService - Folder', () => {

	let workspaceName = `testWorkspace${uuid.generateUuid()}`, parentResource: string, workspaceResource: string, workspaceContextService: IWorkspaceContextService;

	setup(() => {
		return setUpFolderWorkspace(workspaceName)
			.then(({ parentDir, folderDir, workspaceService }) => {
				parentResource = parentDir;
				workspaceResource = folderDir;
				workspaceContextService = workspaceService;
			});
	});

	teardown(done => {
		if (workspaceContextService) {
			(<WorkspaceService>workspaceContextService).dispose();
		}
		if (parentResource) {
			extfs.del(parentResource, os.tmpdir(), () => { }, done);
		}
	});

	test('getWorkspace()', () => {
		const actual = workspaceContextService.getWorkspace();

		assert.equal(actual.folders.length, 1);
		assert.equal(actual.folders[0].uri.fsPath, URI.file(workspaceResource).fsPath);
		assert.equal(actual.folders[0].name, workspaceName);
		assert.equal(actual.folders[0].index, 0);
		assert.ok(!actual.configuration);
	});

	test('getWorkbenchState()', () => {
		const actual = workspaceContextService.getWorkbenchState();

		assert.equal(actual, WorkbenchState.FOLDER);
	});

	test('getWorkspaceFolder()', () => {
		const actual = workspaceContextService.getWorkspaceFolder(URI.file(path.join(workspaceResource, 'a')));

		assert.equal(actual, workspaceContextService.getWorkspace().folders[0]);
	});

	test('isCurrentWorkspace() => true', () => {
		assert.ok(workspaceContextService.isCurrentWorkspace(workspaceResource));
	});

	test('isCurrentWorkspace() => false', () => {
		assert.ok(!workspaceContextService.isCurrentWorkspace(workspaceResource + 'abc'));
	});
});

suite('WorkspaceContextService - Folder', () => {
});

suite('WorkspaceConfigurationService', () => {

	test('defaults', (done: () => void) => {
		interface ITestSetting {
			workspace: {
				service: {
					testSetting: string;
				}
			};
		}

		const configurationRegistry = <IConfigurationRegistry>Registry.as(ConfigurationExtensions.Configuration);
		configurationRegistry.registerConfiguration({
			'id': '_test_workspace',
			'type': 'object',
			'properties': {
				'workspace.service.testSetting': {
					'type': 'string',
					'default': 'isSet'
				}
			}
		});

		configurationRegistry.registerConfiguration({
			'id': '_test',
			'type': 'object',
			'properties': {
				'workspaceLookup.service.testSetting': {
					'type': 'string',
					'default': 'isSet'
				}
			}
		});

		createWorkspace((workspaceDir, globalSettingsFile, cleanUp) => {
			return createService(workspaceDir, globalSettingsFile).then(service => {
				const config = service.getConfiguration<ITestSetting>();
				assert.equal(config.workspace.service.testSetting, 'isSet');

				service.dispose();

				cleanUp(done);
			});
		});
	});

	test('globals', (done: () => void) => {
		createWorkspace((workspaceDir, globalSettingsFile, cleanUp) => {
			return createService(workspaceDir, globalSettingsFile).then(service => {
				fs.writeFileSync(globalSettingsFile, '{ "testworkbench.editor.tabs": true }');

				service.reloadConfiguration().then(() => {
					const config = service.getConfiguration<{ testworkbench: { editor: { tabs: boolean } } }>();
					assert.equal(config.testworkbench.editor.tabs, true);

					service.dispose();

					cleanUp(done);
				});
			});
		});
	});

	test('reload configuration emits events', (done: () => void) => {
		createWorkspace((workspaceDir, globalSettingsFile, cleanUp) => {
			return createService(workspaceDir, globalSettingsFile).then(service => {
				fs.writeFileSync(globalSettingsFile, '{ "testworkbench.editor.tabs": true }');

				return service.initialize(workspaceDir).then(() => {
					service.onDidChangeConfiguration(event => {
						const config = service.getConfiguration<{ testworkbench: { editor: { tabs: boolean } } }>();
						assert.equal(config.testworkbench.editor.tabs, false);

						service.dispose();

						cleanUp(done);
					});

					fs.writeFileSync(globalSettingsFile, '{ "testworkbench.editor.tabs": false }');

					// this has to trigger the event since the config changes
					service.reloadUserConfiguration().done();
				});

			});
		});
	});

	test('globals override defaults', (done: () => void) => {
		interface ITestSetting {
			workspace: {
				service: {
					testSetting: string;
				}
			};
		}

		createWorkspace((workspaceDir, globalSettingsFile, cleanUp) => {
			return createService(workspaceDir, globalSettingsFile).then(service => {
				fs.writeFileSync(globalSettingsFile, '{ "workspace.service.testSetting": "isChanged" }');

				service.reloadUserConfiguration().then(() => {
					const config = service.getConfiguration<ITestSetting>();
					assert.equal(config.workspace.service.testSetting, 'isChanged');

					service.dispose();

					cleanUp(done);
				});
			});
		});
	});

	test('workspace settings', (done: () => void) => {
		createWorkspace((workspaceDir, globalSettingsFile, cleanUp) => {
			return createService(workspaceDir, globalSettingsFile).then(service => {
				fs.writeFileSync(path.join(workspaceDir, '.vscode', 'settings.json'), '{ "testworkbench.editor.icons": true }');

				service.reloadWorkspaceConfiguration().then(() => {
					const config = service.getConfiguration<{ testworkbench: { editor: { icons: boolean } } }>();
					assert.equal(config.testworkbench.editor.icons, true);

					service.dispose();

					cleanUp(done);
				});
			});
		});
	});

	test('workspace settings override user settings', (done: () => void) => {
		createWorkspace((workspaceDir, globalSettingsFile, cleanUp) => {
			return createService(workspaceDir, globalSettingsFile).then(service => {
				fs.writeFileSync(globalSettingsFile, '{ "testworkbench.editor.icons": false, "testworkbench.other.setting": true }');
				fs.writeFileSync(path.join(workspaceDir, '.vscode', 'settings.json'), '{ "testworkbench.editor.icons": true }');

				service.reloadConfiguration().then(() => {
					const config = service.getConfiguration<{ testworkbench: { editor: { icons: boolean }, other: { setting: string } } }>();
					assert.equal(config.testworkbench.editor.icons, true);
					assert.equal(config.testworkbench.other.setting, true);

					service.dispose();

					cleanUp(done);
				});
			});
		});
	});

	test('workspace change triggers event', (done: () => void) => {
		createWorkspace((workspaceDir, globalSettingsFile, cleanUp) => {
			return createService(workspaceDir, globalSettingsFile).then(service => {
				service.onDidChangeConfiguration(event => {
					const config = service.getConfiguration<{ testworkbench: { editor: { icons: boolean } } }>();
					assert.equal(config.testworkbench.editor.icons, true);
					assert.equal(service.getConfiguration<any>().testworkbench.editor.icons, true);

					service.dispose();

					cleanUp(done);
				});

				const settingsFile = path.join(workspaceDir, '.vscode', 'settings.json');
				fs.writeFileSync(settingsFile, '{ "testworkbench.editor.icons": true }');

				const event = new FileChangesEvent([{ resource: URI.file(settingsFile), type: FileChangeType.ADDED }]);
				service.handleWorkspaceFileEvents(event);
			});
		});
	});

	test('workspace reload should triggers event if content changed', (done: () => void) => {
		createWorkspace((workspaceDir, globalSettingsFile, cleanUp) => {
			return createService(workspaceDir, globalSettingsFile).then(service => {
				const settingsFile = path.join(workspaceDir, '.vscode', 'settings.json');
				fs.writeFileSync(settingsFile, '{ "testworkbench.editor.icons": true }');

				const target = sinon.stub();
				service.onDidChangeConfiguration(event => target());

				fs.writeFileSync(settingsFile, '{ "testworkbench.editor.icons": false }');

				service.reloadWorkspaceConfiguration().done(() => {
					assert.ok(target.calledOnce);
					service.dispose();

					cleanUp(done);
				});
			});
		});
	});

	test('workspace reload should not trigger event if nothing changed', (done: () => void) => {
		createWorkspace((workspaceDir, globalSettingsFile, cleanUp) => {
			return createService(workspaceDir, globalSettingsFile).then(service => {
				const settingsFile = path.join(workspaceDir, '.vscode', 'settings.json');
				fs.writeFileSync(settingsFile, '{ "testworkbench.editor.icons": true }');

				service.reloadWorkspaceConfiguration().done(() => {
					const target = sinon.stub();
					service.onDidChangeConfiguration(event => target());

					service.reloadWorkspaceConfiguration().done(() => {
						assert.ok(!target.called);
						service.dispose();

						cleanUp(done);
					});
				});
			});
		});
	});

	test('workspace reload should not trigger event if there is no model', (done: () => void) => {
		createWorkspace((workspaceDir, globalSettingsFile, cleanUp) => {
			return createService(workspaceDir, globalSettingsFile).then(service => {
				const target = sinon.stub();
				service.onDidChangeConfiguration(event => target());
				service.reloadUserConfiguration().done(() => {
					assert.ok(!target.called);
					service.dispose();
					cleanUp(done);
				});
			});
		});
	});


	test('lookup', (done: () => void) => {
		createWorkspace((workspaceDir, globalSettingsFile, cleanUp) => {
			return createService(workspaceDir, globalSettingsFile).then(service => {
				let res = service.inspect('something.missing');
				assert.ok(!res.default);
				assert.ok(!res.user);
				assert.ok(!res.workspace);
				assert.ok(!res.value);

				res = service.inspect('workspaceLookup.service.testSetting');
				assert.equal(res.default, 'isSet');
				assert.equal(res.value, 'isSet');
				assert.ok(!res.user);
				assert.ok(!res.workspace);

				fs.writeFileSync(globalSettingsFile, '{ "workspaceLookup.service.testSetting": true }');

				return service.reloadUserConfiguration().then(() => {
					res = service.inspect('workspaceLookup.service.testSetting');
					assert.equal(res.default, 'isSet');
					assert.equal(res.user, true);
					assert.equal(res.value, true);
					assert.ok(!res.workspace);

					const settingsFile = path.join(workspaceDir, '.vscode', 'settings.json');
					fs.writeFileSync(settingsFile, '{ "workspaceLookup.service.testSetting": 55 }');

					return service.reloadWorkspaceConfiguration().then(() => {
						res = service.inspect('workspaceLookup.service.testSetting');
						assert.equal(res.default, 'isSet');
						assert.equal(res.user, true);
						assert.equal(res.workspace, 55);
						assert.equal(res.value, 55);

						service.dispose();

						cleanUp(done);
					});

				});

			});
		});
	});

	test('keys', (done: () => void) => {

		function contains(array: string[], key: string): boolean {
			return array.indexOf(key) >= 0;
		}

		createWorkspace((workspaceDir, globalSettingsFile, cleanUp) => {
			return createService(workspaceDir, globalSettingsFile).then(service => {
				let keys = service.keys();

				assert.ok(!contains(keys.default, 'something.missing'));
				assert.ok(!contains(keys.user, 'something.missing'));
				assert.ok(!contains(keys.workspace, 'something.missing'));

				assert.ok(contains(keys.default, 'workspaceLookup.service.testSetting'));
				assert.ok(!contains(keys.user, 'workspaceLookup.service.testSetting'));
				assert.ok(!contains(keys.workspace, 'workspaceLookup.service.testSetting'));

				fs.writeFileSync(globalSettingsFile, '{ "workspaceLookup.service.testSetting": true }');

				return service.reloadUserConfiguration().then(() => {
					keys = service.keys();

					assert.ok(contains(keys.default, 'workspaceLookup.service.testSetting'));
					assert.ok(contains(keys.user, 'workspaceLookup.service.testSetting'));
					assert.ok(!contains(keys.workspace, 'workspaceLookup.service.testSetting'));

					const settingsFile = path.join(workspaceDir, '.vscode', 'settings.json');
					fs.writeFileSync(settingsFile, '{ "workspaceLookup.service.testSetting": 55 }');

					return service.reloadWorkspaceConfiguration().then(() => {
						keys = service.keys();

						assert.ok(contains(keys.default, 'workspaceLookup.service.testSetting'));
						assert.ok(contains(keys.user, 'workspaceLookup.service.testSetting'));
						assert.ok(contains(keys.workspace, 'workspaceLookup.service.testSetting'));

						const settingsFile = path.join(workspaceDir, '.vscode', 'tasks.json');
						fs.writeFileSync(settingsFile, '{ "workspaceLookup.service.taskTestSetting": 55 }');

						return service.reloadWorkspaceConfiguration().then(() => {
							keys = service.keys();

							assert.ok(!contains(keys.default, 'tasks.workspaceLookup.service.taskTestSetting'));
							assert.ok(!contains(keys.user, 'tasks.workspaceLookup.service.taskTestSetting'));
							assert.ok(contains(keys.workspace, 'tasks.workspaceLookup.service.taskTestSetting'));

							service.dispose();

							cleanUp(done);
						});
					});
				});
			});
		});
	});

	test('values', (done: () => void) => {
		createWorkspace((workspaceDir, globalSettingsFile, cleanUp) => {
			return createService(workspaceDir, globalSettingsFile).then(service => {
				let values = service.inspect('workspaceLookup.service.testSetting');
				let value = values.value;

				assert.ok(value);
				assert.equal(values.default, 'isSet');

				fs.writeFileSync(globalSettingsFile, '{ "workspaceLookup.service.testSetting": true }');

				return service.reloadUserConfiguration().then(() => {
					values = service.inspect('workspaceLookup.service.testSetting');
					value = values.value;

					assert.ok(value);
					assert.equal(values.user, true);

					const settingsFile = path.join(workspaceDir, '.vscode', 'settings.json');
					fs.writeFileSync(settingsFile, '{ "workspaceLookup.service.testSetting": 55 }');

					return service.reloadWorkspaceConfiguration().then(() => {
						values = service.inspect('workspaceLookup.service.testSetting');
						value = values.value;

						assert.ok(value);
						assert.equal(values.user, true);
						assert.equal(values.workspace, 55);

						done();
					});
				});
			});
		});
	});
});

suite('WorkspaceConfigurationService - Update', () => {

	let workspaceName = `testWorkspace${uuid.generateUuid()}`, parentResource: string, testObject: IConfigurationService;

	suiteSetup(() => {
		const configurationRegistry = <IConfigurationRegistry>Registry.as(ConfigurationExtensions.Configuration);
		configurationRegistry.registerConfiguration({
			'id': '_test',
			'type': 'object',
			'properties': {
				'configurationService.folder.testSetting': {
					'type': 'string',
					'default': 'isSet'
				},
			}
		});
	});

	setup(() => {
		return setUpFolderWorkspace(workspaceName)
			.then(({ parentDir, folderDir, workspaceService, environmentService }) => {

				parentResource = parentDir;
				testObject = workspaceService;
				folderDir = folderDir;

				const instantiationService = <TestInstantiationService>workbenchInstantiationService();
				instantiationService.stub(IWorkspaceContextService, workspaceService);
				instantiationService.stub(IConfigurationService, workspaceService);
				instantiationService.stub(IEnvironmentService, environmentService);
				instantiationService.stub(IFileService, new FileService(workspaceService, new TestTextResourceConfigurationService(), workspaceService, { disableWatcher: true }));
				instantiationService.stub(ITextFileService, instantiationService.createInstance(TestTextFileService));
				instantiationService.stub(ITextModelService, <ITextModelService>instantiationService.createInstance(TextModelResolverService));
				workspaceService.setInstantiationService(instantiationService);
			});
	});

	teardown(done => {
		if (testObject) {
			(<WorkspaceService>testObject).dispose();
		}
		if (parentResource) {
			extfs.del(parentResource, os.tmpdir(), () => { }, done);
		}
	});

	test('update user configuration', () => {
		return testObject.updateValue('configurationService.folder.testSetting', 'value', ConfigurationTarget.USER)
			.then(() => assert.equal(testObject.getValue('configurationService.folder.testSetting'), 'value'));
	});

	test('update workspace configuration', () => {
		return testObject.updateValue('tasks.service.testSetting', 'value', ConfigurationTarget.WORKSPACE)
			.then(() => assert.equal(testObject.getValue('tasks.service.testSetting'), 'value'));
	});

	test('update tasks configuration', () => {
		return testObject.updateValue('tasks', { 'version': '1.0.0', tasks: [{ 'taskName': 'myTask' }] }, ConfigurationTarget.WORKSPACE)
			.then(() => assert.deepEqual(testObject.getValue('tasks'), { 'version': '1.0.0', tasks: [{ 'taskName': 'myTask' }] }));
	});

	test('update user configuration should trigger change event before promise is resolve', () => {
		const target = sinon.spy();
		testObject.onDidChangeConfiguration(target);
		return testObject.updateValue('configurationService.folder.testSetting', 'value', ConfigurationTarget.USER)
			.then(() => assert.ok(target.called));
	});

	test('update workspace configuration should trigger change event before promise is resolve', () => {
		const target = sinon.spy();
		testObject.onDidChangeConfiguration(target);
		return testObject.updateValue('configurationService.folder.testSetting', 'value', ConfigurationTarget.WORKSPACE)
			.then(() => assert.ok(target.called));
	});

	test('update task configuration should trigger change event before promise is resolve', () => {
		const target = sinon.spy();
		testObject.onDidChangeConfiguration(target);
		return testObject.updateValue('tasks', { 'version': '1.0.0', tasks: [{ 'taskName': 'myTask' }] }, ConfigurationTarget.WORKSPACE)
			.then(() => assert.ok(target.called));
	});

});

suite('WorkspaceConfigurationService - Update (Multiroot)', () => {

	let parentResource: string, workspace: IWorkspace, testObject: IConfigurationService;

	suiteSetup(() => {
		const configurationRegistry = <IConfigurationRegistry>Registry.as(ConfigurationExtensions.Configuration);
		configurationRegistry.registerConfiguration({
			'id': '_test',
			'type': 'object',
			'properties': {
				'configurationService.workspace.testSetting': {
					'type': 'string',
					'default': 'isSet'
				},
				'configurationService.workspace.testResourceSetting': {
					'type': 'string',
					'default': 'isSet',
					scope: ConfigurationScope.RESOURCE
				}
			}
		});
	});

	setup(() => {
		return setUpWorkspace(['1', '2'])
			.then(({ parentDir, workspaceService, environmentService }) => {

				parentResource = parentDir;
				testObject = workspaceService;
				workspace = workspaceService.getWorkspace();;

				const instantiationService = <TestInstantiationService>workbenchInstantiationService();
				instantiationService.stub(IWorkspaceContextService, workspaceService);
				instantiationService.stub(IConfigurationService, workspaceService);
				instantiationService.stub(IEnvironmentService, environmentService);
				instantiationService.stub(IFileService, new FileService(workspaceService, new TestTextResourceConfigurationService(), workspaceService, { disableWatcher: true }));
				instantiationService.stub(ITextFileService, instantiationService.createInstance(TestTextFileService));
				instantiationService.stub(ITextModelService, <ITextModelService>instantiationService.createInstance(TextModelResolverService));
				workspaceService.setInstantiationService(instantiationService);
			});
	});

	teardown(done => {
		if (testObject) {
			(<WorkspaceService>testObject).dispose();
		}
		if (parentResource) {
			extfs.del(parentResource, os.tmpdir(), () => { }, done);
		}
	});

	test('update user configuration', () => {
		return testObject.updateValue('configurationService.workspace.testSetting', 'userValue', ConfigurationTarget.USER)
			.then(() => assert.equal(testObject.getValue('configurationService.workspace.testSetting'), 'userValue'));
	});

	test('update user configuration should trigger change event before promise is resolve', () => {
		const target = sinon.spy();
		testObject.onDidChangeConfiguration(target);
		return testObject.updateValue('configurationService.workspace.testSetting', 'userValue', ConfigurationTarget.USER)
			.then(() => assert.ok(target.called));
	});

	test('update workspace configuration', () => {
		return testObject.updateValue('configurationService.workspace.testSetting', 'workspaceValue', ConfigurationTarget.WORKSPACE)
			.then(() => assert.equal(testObject.getValue('configurationService.workspace.testSetting'), 'workspaceValue'));
	});

	test('update workspace configuration should trigger change event before promise is resolve', () => {
		const target = sinon.spy();
		testObject.onDidChangeConfiguration(target);
		return testObject.updateValue('configurationService.workspace.testSetting', 'workspaceValue', ConfigurationTarget.WORKSPACE)
			.then(() => assert.ok(target.called));
	});

	test('update workspace folder configuration', () => {
		return testObject.updateValue('configurationService.workspace.testResourceSetting', 'workspaceFolderValue', { resource: workspace.folders[0].uri }, ConfigurationTarget.WORKSPACE_FOLDER)
			.then(() => assert.equal(testObject.getValue('configurationService.workspace.testResourceSetting', { resource: workspace.folders[0].uri }), 'workspaceFolderValue'));
	});

	test('update workspace folder configuration should trigger change event before promise is resolve', () => {
		const target = sinon.spy();
		testObject.onDidChangeConfiguration(target);
		return testObject.updateValue('configurationService.workspace.testResourceSetting', 'workspaceFolderValue', { resource: workspace.folders[0].uri }, ConfigurationTarget.WORKSPACE_FOLDER)
			.then(() => assert.ok(target.called));
	});

	test('update tasks configuration', () => {
		return testObject.updateValue('tasks', { 'version': '1.0.0', tasks: [{ 'taskName': 'myTask' }] }, { resource: workspace.folders[0].uri }, ConfigurationTarget.WORKSPACE_FOLDER)
			.then(() => assert.deepEqual(testObject.getValue('tasks', { resource: workspace.folders[0].uri }), { 'version': '1.0.0', tasks: [{ 'taskName': 'myTask' }] }));
	});
});
