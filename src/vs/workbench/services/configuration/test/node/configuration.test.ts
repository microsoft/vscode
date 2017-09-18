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
import { ParsedArgs } from 'vs/platform/environment/common/environment';
import { EnvironmentService } from 'vs/platform/environment/node/environmentService';
import { parseArgs } from 'vs/platform/environment/node/argv';
import extfs = require('vs/base/node/extfs');
import uuid = require('vs/base/common/uuid');
import { IConfigurationRegistry, Extensions as ConfigurationExtensions } from 'vs/platform/configuration/common/configurationRegistry';
import { WorkspaceServiceImpl, WorkspaceService } from 'vs/workbench/services/configuration/node/configuration';
import { FileChangeType, FileChangesEvent } from 'vs/platform/files/common/files';
import { IWorkspaceContextService, WorkbenchState } from 'vs/platform/workspace/common/workspace';

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

function setUpFolder(folderName: string): TPromise<{ parentDir: string, workspaceDir: string, workspaceService: WorkspaceServiceImpl }> {
	const id = uuid.generateUuid();
	const parentDir = path.join(os.tmpdir(), 'vsctests', id);
	const workspaceDir = path.join(parentDir, folderName);
	const workspaceSettingsDir = path.join(workspaceDir, '.vscode');
	const globalSettingsFile = path.join(workspaceDir, 'config.json');

	return new TPromise((c, e) => {
		extfs.mkdirp(workspaceSettingsDir, 493, (error) => {
			if (error) {
				e(error);
				return null;
			}
			const environmentService = new SettingsTestEnvironmentService(parseArgs(process.argv), process.execPath, globalSettingsFile);
			const workspaceService = new WorkspaceServiceImpl(environmentService, null);
			workspaceService.initialize(workspaceDir).then(() => c({ parentDir, workspaceDir, workspaceService }));
		});
	});
}

function createService(workspaceDir: string, globalSettingsFile: string): TPromise<WorkspaceServiceImpl> {
	const environmentService = new SettingsTestEnvironmentService(parseArgs(process.argv), process.execPath, globalSettingsFile);
	const service = new WorkspaceServiceImpl(environmentService, null);

	return service.initialize(workspaceDir).then(() => service);
}

suite('WorkspaceContextService - Folder', () => {

	let workspaceName = `testWorkspace${uuid.generateUuid()}`, parentResource: string, workspaceResource: string, workspaceContextService: IWorkspaceContextService;

	setup(() => {
		return setUpFolder(workspaceName)
			.then(({ parentDir, workspaceDir, workspaceService }) => {
				parentResource = parentDir;
				workspaceResource = workspaceDir;
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
		assert.equal(actual.folders[0].uri.fsPath, workspaceResource);
		assert.equal(actual.folders[0].name, workspaceName);
		assert.equal(actual.folders[0].index, 0);
		assert.equal(actual.folders[0].raw.path, workspaceResource);
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

suite('WorkspaceConfigurationService - Node', () => {

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
					service.onDidUpdateConfiguration(event => {
						const config = service.getConfiguration<{ testworkbench: { editor: { tabs: boolean } } }>();
						assert.equal(config.testworkbench.editor.tabs, false);

						service.dispose();

						cleanUp(done);
					});

					fs.writeFileSync(globalSettingsFile, '{ "testworkbench.editor.tabs": false }');

					// this has to trigger the event since the config changes
					service.reloadConfiguration().done();
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

		createWorkspace((workspaceDir, globalSettingsFile, cleanUp) => {
			return createService(workspaceDir, globalSettingsFile).then(service => {
				fs.writeFileSync(globalSettingsFile, '{ "workspace.service.testSetting": "isChanged" }');

				service.reloadConfiguration().then(() => {
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

				service.reloadConfiguration().then(() => {
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
				service.onDidUpdateConfiguration(event => {
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
				service.onDidUpdateConfiguration(event => target());

				fs.writeFileSync(settingsFile, '{ "testworkbench.editor.icons": false }');

				service.reloadConfiguration().done(() => {
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

				service.reloadConfiguration().done(() => {
					const target = sinon.stub();
					service.onDidUpdateConfiguration(event => target());

					service.reloadConfiguration().done(() => {
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
				service.onDidUpdateConfiguration(event => target());
				service.reloadConfiguration().done(() => {
					assert.ok(!target.called);
					service.dispose();
					cleanUp(done);
				});
			});
		});
	});


	test('lookup', (done: () => void) => {
		const configurationRegistry = <IConfigurationRegistry>Registry.as(ConfigurationExtensions.Configuration);
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
				let res = service.lookup('something.missing');
				assert.ok(!res.default);
				assert.ok(!res.user);
				assert.ok(!res.workspace);
				assert.ok(!res.value);

				res = service.lookup('workspaceLookup.service.testSetting');
				assert.equal(res.default, 'isSet');
				assert.equal(res.value, 'isSet');
				assert.ok(!res.user);
				assert.ok(!res.workspace);

				fs.writeFileSync(globalSettingsFile, '{ "workspaceLookup.service.testSetting": true }');

				return service.reloadConfiguration().then(() => {
					res = service.lookup('workspaceLookup.service.testSetting');
					assert.equal(res.default, 'isSet');
					assert.equal(res.user, true);
					assert.equal(res.value, true);
					assert.ok(!res.workspace);

					const settingsFile = path.join(workspaceDir, '.vscode', 'settings.json');
					fs.writeFileSync(settingsFile, '{ "workspaceLookup.service.testSetting": 55 }');

					return service.reloadConfiguration().then(() => {
						res = service.lookup('workspaceLookup.service.testSetting');
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
		const configurationRegistry = <IConfigurationRegistry>Registry.as(ConfigurationExtensions.Configuration);
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

				return service.reloadConfiguration().then(() => {
					keys = service.keys();

					assert.ok(contains(keys.default, 'workspaceLookup.service.testSetting'));
					assert.ok(contains(keys.user, 'workspaceLookup.service.testSetting'));
					assert.ok(!contains(keys.workspace, 'workspaceLookup.service.testSetting'));

					const settingsFile = path.join(workspaceDir, '.vscode', 'settings.json');
					fs.writeFileSync(settingsFile, '{ "workspaceLookup.service.testSetting": 55 }');

					return service.reloadConfiguration().then(() => {
						keys = service.keys();

						assert.ok(contains(keys.default, 'workspaceLookup.service.testSetting'));
						assert.ok(contains(keys.user, 'workspaceLookup.service.testSetting'));
						assert.ok(contains(keys.workspace, 'workspaceLookup.service.testSetting'));

						const settingsFile = path.join(workspaceDir, '.vscode', 'tasks.json');
						fs.writeFileSync(settingsFile, '{ "workspaceLookup.service.taskTestSetting": 55 }');

						return service.reloadConfiguration().then(() => {
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
		const configurationRegistry = <IConfigurationRegistry>Registry.as(ConfigurationExtensions.Configuration);
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
				let values = service.values();
				let value = values['workspaceLookup.service.testSetting'];

				assert.ok(value);
				assert.equal(value.default, 'isSet');

				fs.writeFileSync(globalSettingsFile, '{ "workspaceLookup.service.testSetting": true }');

				return service.reloadConfiguration().then(() => {
					values = service.values();
					value = values['workspaceLookup.service.testSetting'];

					assert.ok(value);
					assert.equal(value.user, true);

					const settingsFile = path.join(workspaceDir, '.vscode', 'settings.json');
					fs.writeFileSync(settingsFile, '{ "workspaceLookup.service.testSetting": 55 }');

					return service.reloadConfiguration().then(() => {
						values = service.values();
						value = values['workspaceLookup.service.testSetting'];

						assert.ok(value);
						assert.equal(value.user, true);
						assert.equal(value.workspace, 55);

						done();
					});
				});
			});
		});
	});
});