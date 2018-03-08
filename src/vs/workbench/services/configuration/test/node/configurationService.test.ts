/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as assert from 'assert';
import * as sinon from 'sinon';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import URI from 'vs/base/common/uri';
import { TPromise } from 'vs/base/common/winjs.base';
import { Registry } from 'vs/platform/registry/common/platform';
import { ParsedArgs, IEnvironmentService } from 'vs/platform/environment/common/environment';
import { EnvironmentService } from 'vs/platform/environment/node/environmentService';
import { parseArgs } from 'vs/platform/environment/node/argv';
import pfs = require('vs/base/node/pfs');
import uuid = require('vs/base/common/uuid');
import { IConfigurationRegistry, Extensions as ConfigurationExtensions, ConfigurationScope } from 'vs/platform/configuration/common/configurationRegistry';
import { WorkspaceService } from 'vs/workbench/services/configuration/node/configurationService';
import { ConfigurationEditingErrorCode } from 'vs/workbench/services/configuration/node/configurationEditingService';
import { FileChangeType, FileChangesEvent, IFileService } from 'vs/platform/files/common/files';
import { IWorkspaceContextService, WorkbenchState, IWorkspaceFoldersChangeEvent } from 'vs/platform/workspace/common/workspace';
import { ConfigurationTarget, IConfigurationService, IConfigurationChangeEvent } from 'vs/platform/configuration/common/configuration';
import { workbenchInstantiationService, TestTextResourceConfigurationService, TestTextFileService, TestLifecycleService, TestEnvironmentService } from 'vs/workbench/test/workbenchTestServices';
import { FileService } from 'vs/workbench/services/files/node/fileService';
import { TestInstantiationService } from 'vs/platform/instantiation/test/common/instantiationServiceMock';
import { ITextFileService } from 'vs/workbench/services/textfile/common/textfiles';
import { ITextModelService } from 'vs/editor/common/services/resolverService';
import { TextModelResolverService } from 'vs/workbench/services/textmodelResolver/common/textModelResolverService';
import { IJSONEditingService } from 'vs/workbench/services/configuration/common/jsonEditing';
import { JSONEditingService } from 'vs/workbench/services/configuration/node/jsonEditingService';
import { IWorkspaceConfigurationService } from 'vs/workbench/services/configuration/common/configuration';
import { IWindowConfiguration } from 'vs/platform/windows/common/windows';
import { mkdirp } from 'vs/base/node/pfs';

class SettingsTestEnvironmentService extends EnvironmentService {

	constructor(args: ParsedArgs, _execPath: string, private customAppSettingsHome) {
		super(args, _execPath);
	}

	get appSettingsPath(): string { return this.customAppSettingsHome; }
}

function setUpFolderWorkspace(folderName: string): TPromise<{ parentDir: string, folderDir: string }> {
	const id = uuid.generateUuid();
	const parentDir = path.join(os.tmpdir(), 'vsctests', id);
	return setUpFolder(folderName, parentDir).then(folderDir => ({ parentDir, folderDir }));
}

function setUpFolder(folderName: string, parentDir: string): TPromise<string> {
	const folderDir = path.join(parentDir, folderName);
	const workspaceSettingsDir = path.join(folderDir, '.vscode');
	return mkdirp(workspaceSettingsDir, 493).then(() => folderDir);
}

function setUpWorkspace(folders: string[]): TPromise<{ parentDir: string, configPath: string }> {

	const id = uuid.generateUuid();
	const parentDir = path.join(os.tmpdir(), 'vsctests', id);

	return mkdirp(parentDir, 493)
		.then(() => {
			const configPath = path.join(parentDir, 'vsctests.code-workspace');
			const workspace = { folders: folders.map(path => ({ path })) };
			fs.writeFileSync(configPath, JSON.stringify(workspace, null, '\t'));

			return TPromise.join(folders.map(folder => setUpFolder(folder, parentDir)))
				.then(() => ({ parentDir, configPath }));
		});

}


suite('WorkspaceContextService - Folder', () => {

	let workspaceName = `testWorkspace${uuid.generateUuid()}`, parentResource: string, workspaceResource: string, workspaceContextService: IWorkspaceContextService;

	setup(() => {
		return setUpFolderWorkspace(workspaceName)
			.then(({ parentDir, folderDir }) => {
				parentResource = parentDir;
				workspaceResource = folderDir;
				const globalSettingsFile = path.join(parentDir, 'settings.json');
				const environmentService = new SettingsTestEnvironmentService(parseArgs(process.argv), process.execPath, globalSettingsFile);
				workspaceContextService = new WorkspaceService(environmentService);
				return (<WorkspaceService>workspaceContextService).initialize(folderDir);
			});
	});

	teardown(() => {
		if (workspaceContextService) {
			(<WorkspaceService>workspaceContextService).dispose();
		}
		if (parentResource) {
			return pfs.del(parentResource, os.tmpdir());
		}
		return void 0;
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

suite('WorkspaceContextService - Workspace', () => {

	let parentResource: string, testObject: WorkspaceService;

	setup(() => {
		return setUpWorkspace(['a', 'b'])
			.then(({ parentDir, configPath }) => {

				parentResource = parentDir;

				const environmentService = new SettingsTestEnvironmentService(parseArgs(process.argv), process.execPath, path.join(parentDir, 'settings.json'));
				const workspaceService = new WorkspaceService(environmentService);

				const instantiationService = <TestInstantiationService>workbenchInstantiationService();
				instantiationService.stub(IWorkspaceContextService, workspaceService);
				instantiationService.stub(IConfigurationService, workspaceService);
				instantiationService.stub(IEnvironmentService, environmentService);

				return workspaceService.initialize({ id: configPath, configPath }).then(() => {

					instantiationService.stub(IFileService, new FileService(<IWorkspaceContextService>workspaceService, TestEnvironmentService, new TestTextResourceConfigurationService(), workspaceService, new TestLifecycleService(), { disableWatcher: true }));
					instantiationService.stub(ITextFileService, instantiationService.createInstance(TestTextFileService));
					instantiationService.stub(ITextModelService, <ITextModelService>instantiationService.createInstance(TextModelResolverService));
					workspaceService.setInstantiationService(instantiationService);

					testObject = workspaceService;
				});
			});
	});

	teardown(() => {
		if (testObject) {
			(<WorkspaceService>testObject).dispose();
		}
		if (parentResource) {
			return pfs.del(parentResource, os.tmpdir());
		}
		return void 0;
	});

	test('workspace folders', () => {
		const actual = testObject.getWorkspace().folders;

		assert.equal(actual.length, 2);
		assert.equal(path.basename(actual[0].uri.fsPath), 'a');
		assert.equal(path.basename(actual[1].uri.fsPath), 'b');
	});

	test('add folders', () => {
		const workspaceDir = path.dirname(testObject.getWorkspace().folders[0].uri.fsPath);
		return testObject.addFolders([{ uri: URI.file(path.join(workspaceDir, 'd')) }, { uri: URI.file(path.join(workspaceDir, 'c')) }])
			.then(() => {
				const actual = testObject.getWorkspace().folders;

				assert.equal(actual.length, 4);
				assert.equal(path.basename(actual[0].uri.fsPath), 'a');
				assert.equal(path.basename(actual[1].uri.fsPath), 'b');
				assert.equal(path.basename(actual[2].uri.fsPath), 'd');
				assert.equal(path.basename(actual[3].uri.fsPath), 'c');
			});
	});

	test('add folders (at specific index)', function () {
		// seems to be slow
		this.timeout(10000);

		const workspaceDir = path.dirname(testObject.getWorkspace().folders[0].uri.fsPath);
		return testObject.addFolders([{ uri: URI.file(path.join(workspaceDir, 'd')) }, { uri: URI.file(path.join(workspaceDir, 'c')) }], 0)
			.then(() => {
				const actual = testObject.getWorkspace().folders;

				assert.equal(actual.length, 4);
				assert.equal(path.basename(actual[0].uri.fsPath), 'd');
				assert.equal(path.basename(actual[1].uri.fsPath), 'c');
				assert.equal(path.basename(actual[2].uri.fsPath), 'a');
				assert.equal(path.basename(actual[3].uri.fsPath), 'b');
			});
	});

	test('add folders (at specific wrong index)', function () {
		// seems to be slow
		this.timeout(10000);

		const workspaceDir = path.dirname(testObject.getWorkspace().folders[0].uri.fsPath);
		return testObject.addFolders([{ uri: URI.file(path.join(workspaceDir, 'd')) }, { uri: URI.file(path.join(workspaceDir, 'c')) }], 10)
			.then(() => {
				const actual = testObject.getWorkspace().folders;

				assert.equal(actual.length, 4);
				assert.equal(path.basename(actual[0].uri.fsPath), 'a');
				assert.equal(path.basename(actual[1].uri.fsPath), 'b');
				assert.equal(path.basename(actual[2].uri.fsPath), 'd');
				assert.equal(path.basename(actual[3].uri.fsPath), 'c');
			});
	});

	test('add folders (with name)', () => {
		const workspaceDir = path.dirname(testObject.getWorkspace().folders[0].uri.fsPath);
		return testObject.addFolders([{ uri: URI.file(path.join(workspaceDir, 'd')), name: 'DDD' }, { uri: URI.file(path.join(workspaceDir, 'c')), name: 'CCC' }])
			.then(() => {
				const actual = testObject.getWorkspace().folders;

				assert.equal(actual.length, 4);
				assert.equal(path.basename(actual[0].uri.fsPath), 'a');
				assert.equal(path.basename(actual[1].uri.fsPath), 'b');
				assert.equal(path.basename(actual[2].uri.fsPath), 'd');
				assert.equal(path.basename(actual[3].uri.fsPath), 'c');
				assert.equal(actual[2].name, 'DDD');
				assert.equal(actual[3].name, 'CCC');
			});
	});

	test('add folders triggers change event', () => {
		const target = sinon.spy();
		testObject.onDidChangeWorkspaceFolders(target);
		const workspaceDir = path.dirname(testObject.getWorkspace().folders[0].uri.fsPath);
		const addedFolders = [{ uri: URI.file(path.join(workspaceDir, 'd')) }, { uri: URI.file(path.join(workspaceDir, 'c')) }];
		return testObject.addFolders(addedFolders)
			.then(() => {
				assert.ok(target.calledOnce);
				const actual = <IWorkspaceFoldersChangeEvent>target.args[0][0];
				assert.deepEqual(actual.added.map(r => r.uri.toString()), addedFolders.map(a => a.uri.toString()));
				assert.deepEqual(actual.removed, []);
				assert.deepEqual(actual.changed, []);
			});
	});

	test('remove folders', () => {
		return testObject.removeFolders([testObject.getWorkspace().folders[0].uri])
			.then(() => {
				const actual = testObject.getWorkspace().folders;
				assert.equal(actual.length, 1);
				assert.equal(path.basename(actual[0].uri.fsPath), 'b');
			});
	});

	test('remove folders triggers change event', () => {
		const target = sinon.spy();
		testObject.onDidChangeWorkspaceFolders(target);
		const removedFolder = testObject.getWorkspace().folders[0];
		return testObject.removeFolders([removedFolder.uri])
			.then(() => {
				assert.ok(target.calledOnce);
				const actual = <IWorkspaceFoldersChangeEvent>target.args[0][0];
				assert.deepEqual(actual.added, []);
				assert.deepEqual(actual.removed.map(r => r.uri.toString()), [removedFolder.uri.toString()]);
				assert.deepEqual(actual.changed.map(c => c.uri.toString()), [testObject.getWorkspace().folders[0].uri.toString()]);
			});
	});

	test('remove folders and add them back by writing into the file', done => {
		const folders = testObject.getWorkspace().folders;
		testObject.removeFolders([folders[0].uri])
			.then(() => {
				testObject.onDidChangeWorkspaceFolders(actual => {
					assert.deepEqual(actual.added.map(r => r.uri.toString()), [folders[0].uri.toString()]);
					done();
				});
				const workspace = { folders: [{ path: folders[0].uri.fsPath }, { path: folders[1].uri.fsPath }] };
				fs.writeFileSync(testObject.getWorkspace().configuration.fsPath, JSON.stringify(workspace, null, '\t'));
			}, done);
	});

	test('update folders (remove last and add to end)', () => {
		const target = sinon.spy();
		testObject.onDidChangeWorkspaceFolders(target);
		const workspaceDir = path.dirname(testObject.getWorkspace().folders[0].uri.fsPath);
		const addedFolders = [{ uri: URI.file(path.join(workspaceDir, 'd')) }, { uri: URI.file(path.join(workspaceDir, 'c')) }];
		const removedFolders = [testObject.getWorkspace().folders[1]].map(f => f.uri);
		return testObject.updateFolders(addedFolders, removedFolders)
			.then(() => {
				assert.ok(target.calledOnce);
				const actual = <IWorkspaceFoldersChangeEvent>target.args[0][0];
				assert.deepEqual(actual.added.map(r => r.uri.toString()), addedFolders.map(a => a.uri.toString()));
				assert.deepEqual(actual.removed.map(r => r.uri.toString()), removedFolders.map(a => a.toString()));
				assert.deepEqual(actual.changed, []);
			});
	});

	test('update folders (rename first via add and remove)', () => {
		const target = sinon.spy();
		testObject.onDidChangeWorkspaceFolders(target);
		const workspaceDir = path.dirname(testObject.getWorkspace().folders[0].uri.fsPath);
		const addedFolders = [{ uri: URI.file(path.join(workspaceDir, 'a')), name: 'The Folder' }];
		const removedFolders = [testObject.getWorkspace().folders[0]].map(f => f.uri);
		return testObject.updateFolders(addedFolders, removedFolders, 0)
			.then(() => {
				assert.ok(target.calledOnce);
				const actual = <IWorkspaceFoldersChangeEvent>target.args[0][0];
				assert.deepEqual(actual.added, []);
				assert.deepEqual(actual.removed, []);
				assert.deepEqual(actual.changed.map(r => r.uri.toString()), removedFolders.map(a => a.toString()));
			});
	});

	test('update folders (remove first and add to end)', () => {
		const target = sinon.spy();
		testObject.onDidChangeWorkspaceFolders(target);
		const workspaceDir = path.dirname(testObject.getWorkspace().folders[0].uri.fsPath);
		const addedFolders = [{ uri: URI.file(path.join(workspaceDir, 'd')) }, { uri: URI.file(path.join(workspaceDir, 'c')) }];
		const removedFolders = [testObject.getWorkspace().folders[0]].map(f => f.uri);
		const changedFolders = [testObject.getWorkspace().folders[1]].map(f => f.uri);
		return testObject.updateFolders(addedFolders, removedFolders)
			.then(() => {
				assert.ok(target.calledOnce);
				const actual = <IWorkspaceFoldersChangeEvent>target.args[0][0];
				assert.deepEqual(actual.added.map(r => r.uri.toString()), addedFolders.map(a => a.uri.toString()));
				assert.deepEqual(actual.removed.map(r => r.uri.toString()), removedFolders.map(a => a.toString()));
				assert.deepEqual(actual.changed.map(r => r.uri.toString()), changedFolders.map(a => a.toString()));
			});
	});

	test('reorder folders trigger change event', () => {
		const target = sinon.spy();
		testObject.onDidChangeWorkspaceFolders(target);
		const workspace = { folders: [{ path: testObject.getWorkspace().folders[1].uri.fsPath }, { path: testObject.getWorkspace().folders[0].uri.fsPath }] };
		fs.writeFileSync(testObject.getWorkspace().configuration.fsPath, JSON.stringify(workspace, null, '\t'));
		return testObject.reloadConfiguration()
			.then(() => {
				assert.ok(target.calledOnce);
				const actual = <IWorkspaceFoldersChangeEvent>target.args[0][0];
				assert.deepEqual(actual.added, []);
				assert.deepEqual(actual.removed, []);
				assert.deepEqual(actual.changed.map(c => c.uri.toString()), testObject.getWorkspace().folders.map(f => f.uri.toString()).reverse());
			});
	});

	test('rename folders trigger change event', () => {
		const target = sinon.spy();
		testObject.onDidChangeWorkspaceFolders(target);
		const workspace = { folders: [{ path: testObject.getWorkspace().folders[0].uri.fsPath, name: '1' }, { path: testObject.getWorkspace().folders[1].uri.fsPath }] };
		fs.writeFileSync(testObject.getWorkspace().configuration.fsPath, JSON.stringify(workspace, null, '\t'));
		return testObject.reloadConfiguration()
			.then(() => {
				assert.ok(target.calledOnce);
				const actual = <IWorkspaceFoldersChangeEvent>target.args[0][0];
				assert.deepEqual(actual.added, []);
				assert.deepEqual(actual.removed, []);
				assert.deepEqual(actual.changed.map(c => c.uri.toString()), [testObject.getWorkspace().folders[0].uri.toString()]);
			});
	});

});

suite('WorkspaceService - Initialization', () => {

	let parentResource: string, workspaceConfigPath: string, testObject: WorkspaceService, globalSettingsFile: string;
	const configurationRegistry = <IConfigurationRegistry>Registry.as(ConfigurationExtensions.Configuration);

	suiteSetup(() => {
		configurationRegistry.registerConfiguration({
			'id': '_test',
			'type': 'object',
			'properties': {
				'initialization.testSetting1': {
					'type': 'string',
					'default': 'isSet',
					scope: ConfigurationScope.RESOURCE
				},
				'initialization.testSetting2': {
					'type': 'string',
					'default': 'isSet',
					scope: ConfigurationScope.RESOURCE
				}
			}
		});
	});

	setup(() => {
		return setUpWorkspace(['1', '2'])
			.then(({ parentDir, configPath }) => {

				parentResource = parentDir;
				workspaceConfigPath = configPath;
				globalSettingsFile = path.join(parentDir, 'settings.json');

				const instantiationService = <TestInstantiationService>workbenchInstantiationService();
				const environmentService = new SettingsTestEnvironmentService(parseArgs(process.argv), process.execPath, globalSettingsFile);
				const workspaceService = new WorkspaceService(environmentService);
				instantiationService.stub(IWorkspaceContextService, workspaceService);
				instantiationService.stub(IConfigurationService, workspaceService);
				instantiationService.stub(IEnvironmentService, environmentService);

				return workspaceService.initialize(<IWindowConfiguration>{}).then(() => {
					instantiationService.stub(IFileService, new FileService(<IWorkspaceContextService>workspaceService, TestEnvironmentService, new TestTextResourceConfigurationService(), workspaceService, new TestLifecycleService(), { disableWatcher: true }));
					instantiationService.stub(ITextFileService, instantiationService.createInstance(TestTextFileService));
					instantiationService.stub(ITextModelService, <ITextModelService>instantiationService.createInstance(TextModelResolverService));
					workspaceService.setInstantiationService(instantiationService);
					testObject = workspaceService;
				});
			});
	});

	teardown(() => {
		if (testObject) {
			(<WorkspaceService>testObject).dispose();
		}
		if (parentResource) {
			return pfs.del(parentResource, os.tmpdir());
		}
		return void 0;
	});

	test('initialize a folder workspace from an empty workspace with no configuration changes', () => {

		fs.writeFileSync(globalSettingsFile, '{ "initialization.testSetting1": "userValue" }');

		return testObject.reloadConfiguration()
			.then(() => {
				const target = sinon.spy();
				testObject.onDidChangeWorkbenchState(target);
				testObject.onDidChangeWorkspaceName(target);
				testObject.onDidChangeWorkspaceFolders(target);
				testObject.onDidChangeConfiguration(target);

				return testObject.initialize(path.join(parentResource, '1'))
					.then(() => {
						assert.equal(testObject.getValue('initialization.testSetting1'), 'userValue');
						assert.equal(target.callCount, 3);
						assert.deepEqual(target.args[0], [WorkbenchState.FOLDER]);
						assert.deepEqual(target.args[1], [undefined]);
						assert.deepEqual((<IWorkspaceFoldersChangeEvent>target.args[2][0]).added.map(folder => folder.uri.fsPath), [URI.file(path.join(parentResource, '1')).fsPath]);
						assert.deepEqual((<IWorkspaceFoldersChangeEvent>target.args[2][0]).removed, []);
						assert.deepEqual((<IWorkspaceFoldersChangeEvent>target.args[2][0]).changed, []);
					});

			});

	});

	test('initialize a folder workspace from an empty workspace with configuration changes', () => {

		fs.writeFileSync(globalSettingsFile, '{ "initialization.testSetting1": "userValue" }');

		return testObject.reloadConfiguration()
			.then(() => {
				const target = sinon.spy();
				testObject.onDidChangeWorkbenchState(target);
				testObject.onDidChangeWorkspaceName(target);
				testObject.onDidChangeWorkspaceFolders(target);
				testObject.onDidChangeConfiguration(target);

				fs.writeFileSync(path.join(parentResource, '1', '.vscode', 'settings.json'), '{ "initialization.testSetting1": "workspaceValue" }');

				return testObject.initialize(path.join(parentResource, '1'))
					.then(() => {
						assert.equal(testObject.getValue('initialization.testSetting1'), 'workspaceValue');
						assert.equal(target.callCount, 4);
						assert.deepEqual((<IConfigurationChangeEvent>target.args[0][0]).affectedKeys, ['initialization.testSetting1']);
						assert.deepEqual(target.args[1], [WorkbenchState.FOLDER]);
						assert.deepEqual(target.args[2], [undefined]);
						assert.deepEqual((<IWorkspaceFoldersChangeEvent>target.args[3][0]).added.map(folder => folder.uri.fsPath), [URI.file(path.join(parentResource, '1')).fsPath]);
						assert.deepEqual((<IWorkspaceFoldersChangeEvent>target.args[3][0]).removed, []);
						assert.deepEqual((<IWorkspaceFoldersChangeEvent>target.args[3][0]).changed, []);
					});

			});

	});

	test('initialize a multi root workspace from an empty workspace with no configuration changes', () => {

		fs.writeFileSync(globalSettingsFile, '{ "initialization.testSetting1": "userValue" }');

		return testObject.reloadConfiguration()
			.then(() => {
				const target = sinon.spy();
				testObject.onDidChangeWorkbenchState(target);
				testObject.onDidChangeWorkspaceName(target);
				testObject.onDidChangeWorkspaceFolders(target);
				testObject.onDidChangeConfiguration(target);

				return testObject.initialize({ id: workspaceConfigPath, configPath: workspaceConfigPath })
					.then(() => {
						assert.equal(target.callCount, 3);
						assert.deepEqual(target.args[0], [WorkbenchState.WORKSPACE]);
						assert.deepEqual(target.args[1], [undefined]);
						assert.deepEqual((<IWorkspaceFoldersChangeEvent>target.args[2][0]).added.map(folder => folder.uri.fsPath), [URI.file(path.join(parentResource, '1')).fsPath, URI.file(path.join(parentResource, '2')).fsPath]);
						assert.deepEqual((<IWorkspaceFoldersChangeEvent>target.args[2][0]).removed, []);
						assert.deepEqual((<IWorkspaceFoldersChangeEvent>target.args[2][0]).changed, []);
					});

			});

	});

	test('initialize a multi root workspace from an empty workspace with configuration changes', () => {

		fs.writeFileSync(globalSettingsFile, '{ "initialization.testSetting1": "userValue" }');

		return testObject.reloadConfiguration()
			.then(() => {
				const target = sinon.spy();
				testObject.onDidChangeWorkbenchState(target);
				testObject.onDidChangeWorkspaceName(target);
				testObject.onDidChangeWorkspaceFolders(target);
				testObject.onDidChangeConfiguration(target);

				fs.writeFileSync(path.join(parentResource, '1', '.vscode', 'settings.json'), '{ "initialization.testSetting1": "workspaceValue1" }');
				fs.writeFileSync(path.join(parentResource, '2', '.vscode', 'settings.json'), '{ "initialization.testSetting2": "workspaceValue2" }');

				return testObject.initialize({ id: workspaceConfigPath, configPath: workspaceConfigPath })
					.then(() => {
						assert.equal(target.callCount, 4);
						assert.deepEqual((<IConfigurationChangeEvent>target.args[0][0]).affectedKeys, ['initialization.testSetting1', 'initialization.testSetting2']);
						assert.deepEqual(target.args[1], [WorkbenchState.WORKSPACE]);
						assert.deepEqual(target.args[2], [undefined]);
						assert.deepEqual((<IWorkspaceFoldersChangeEvent>target.args[3][0]).added.map(folder => folder.uri.fsPath), [URI.file(path.join(parentResource, '1')).fsPath, URI.file(path.join(parentResource, '2')).fsPath]);
						assert.deepEqual((<IWorkspaceFoldersChangeEvent>target.args[3][0]).removed, []);
						assert.deepEqual((<IWorkspaceFoldersChangeEvent>target.args[3][0]).changed, []);
					});

			});

	});

	test('initialize a folder workspace from a folder workspace with no configuration changes', () => {

		return testObject.initialize(path.join(parentResource, '1'))
			.then(() => {
				fs.writeFileSync(globalSettingsFile, '{ "initialization.testSetting1": "userValue" }');

				return testObject.reloadConfiguration()
					.then(() => {
						const target = sinon.spy();
						testObject.onDidChangeWorkbenchState(target);
						testObject.onDidChangeWorkspaceName(target);
						testObject.onDidChangeWorkspaceFolders(target);
						testObject.onDidChangeConfiguration(target);

						return testObject.initialize(path.join(parentResource, '2'))
							.then(() => {
								assert.equal(testObject.getValue('initialization.testSetting1'), 'userValue');
								assert.equal(target.callCount, 1);
								assert.deepEqual((<IWorkspaceFoldersChangeEvent>target.args[0][0]).added.map(folder => folder.uri.fsPath), [URI.file(path.join(parentResource, '2')).fsPath]);
								assert.deepEqual((<IWorkspaceFoldersChangeEvent>target.args[0][0]).removed.map(folder => folder.uri.fsPath), [URI.file(path.join(parentResource, '1')).fsPath]);
								assert.deepEqual((<IWorkspaceFoldersChangeEvent>target.args[0][0]).changed, []);
							});

					});
			});

	});

	test('initialize a folder workspace from a folder workspace with configuration changes', () => {

		return testObject.initialize(path.join(parentResource, '1'))
			.then(() => {

				const target = sinon.spy();
				testObject.onDidChangeWorkbenchState(target);
				testObject.onDidChangeWorkspaceName(target);
				testObject.onDidChangeWorkspaceFolders(target);
				testObject.onDidChangeConfiguration(target);

				fs.writeFileSync(path.join(parentResource, '2', '.vscode', 'settings.json'), '{ "initialization.testSetting1": "workspaceValue2" }');
				return testObject.initialize(path.join(parentResource, '2'))
					.then(() => {
						assert.equal(testObject.getValue('initialization.testSetting1'), 'workspaceValue2');
						assert.equal(target.callCount, 2);
						assert.deepEqual((<IConfigurationChangeEvent>target.args[0][0]).affectedKeys, ['initialization.testSetting1']);
						assert.deepEqual((<IWorkspaceFoldersChangeEvent>target.args[1][0]).added.map(folder => folder.uri.fsPath), [URI.file(path.join(parentResource, '2')).fsPath]);
						assert.deepEqual((<IWorkspaceFoldersChangeEvent>target.args[1][0]).removed.map(folder => folder.uri.fsPath), [URI.file(path.join(parentResource, '1')).fsPath]);
						assert.deepEqual((<IWorkspaceFoldersChangeEvent>target.args[1][0]).changed, []);
					});
			});

	});

	test('initialize a multi folder workspace from a folder workspacce triggers change events in the right order', () => {
		const folderDir = path.join(parentResource, '1');
		return testObject.initialize(folderDir)
			.then(() => {

				const target = sinon.spy();

				testObject.onDidChangeWorkbenchState(target);
				testObject.onDidChangeWorkspaceName(target);
				testObject.onDidChangeWorkspaceFolders(target);
				testObject.onDidChangeConfiguration(target);

				fs.writeFileSync(path.join(parentResource, '1', '.vscode', 'settings.json'), '{ "initialization.testSetting1": "workspaceValue2" }');
				return testObject.initialize({ id: workspaceConfigPath, configPath: workspaceConfigPath })
					.then(() => {
						assert.equal(target.callCount, 4);
						assert.deepEqual((<IConfigurationChangeEvent>target.args[0][0]).affectedKeys, ['initialization.testSetting1']);
						assert.deepEqual(target.args[1], [WorkbenchState.WORKSPACE]);
						assert.deepEqual(target.args[2], [undefined]);
						assert.deepEqual((<IWorkspaceFoldersChangeEvent>target.args[3][0]).added.map(folder => folder.uri.fsPath), [URI.file(path.join(parentResource, '2')).fsPath]);
						assert.deepEqual((<IWorkspaceFoldersChangeEvent>target.args[3][0]).removed, []);
						assert.deepEqual((<IWorkspaceFoldersChangeEvent>target.args[3][0]).changed, []);
					});
			});
	});

});

suite('WorkspaceConfigurationService - Folder', () => {

	let workspaceName = `testWorkspace${uuid.generateUuid()}`, parentResource: string, workspaceDir: string, testObject: IWorkspaceConfigurationService, globalSettingsFile: string;
	const configurationRegistry = <IConfigurationRegistry>Registry.as(ConfigurationExtensions.Configuration);

	suiteSetup(() => {
		configurationRegistry.registerConfiguration({
			'id': '_test',
			'type': 'object',
			'properties': {
				'configurationService.folder.testSetting': {
					'type': 'string',
					'default': 'isSet',
					scope: ConfigurationScope.RESOURCE
				},
				'configurationService.folder.executableSetting': {
					'type': 'string',
					'default': 'isSet',
					isExecutable: true
				}
			}
		});
	});

	setup(() => {
		return setUpFolderWorkspace(workspaceName)
			.then(({ parentDir, folderDir }) => {

				parentResource = parentDir;
				workspaceDir = folderDir;
				globalSettingsFile = path.join(parentDir, 'settings.json');

				const instantiationService = <TestInstantiationService>workbenchInstantiationService();
				const environmentService = new SettingsTestEnvironmentService(parseArgs(process.argv), process.execPath, globalSettingsFile);
				const workspaceService = new WorkspaceService(environmentService);
				instantiationService.stub(IWorkspaceContextService, workspaceService);
				instantiationService.stub(IConfigurationService, workspaceService);
				instantiationService.stub(IEnvironmentService, environmentService);

				return workspaceService.initialize(folderDir).then(() => {
					instantiationService.stub(IFileService, new FileService(<IWorkspaceContextService>workspaceService, TestEnvironmentService, new TestTextResourceConfigurationService(), workspaceService, new TestLifecycleService(), { disableWatcher: true }));
					instantiationService.stub(ITextFileService, instantiationService.createInstance(TestTextFileService));
					instantiationService.stub(ITextModelService, <ITextModelService>instantiationService.createInstance(TextModelResolverService));
					workspaceService.setInstantiationService(instantiationService);
					testObject = workspaceService;
				});
			});
	});

	teardown(() => {
		if (testObject) {
			(<WorkspaceService>testObject).dispose();
		}
		if (parentResource) {
			return pfs.del(parentResource, os.tmpdir());
		}
		return void 0;
	});

	test('defaults', () => {
		assert.deepEqual(testObject.getValue('configurationService'), { 'folder': { 'testSetting': 'isSet', 'executableSetting': 'isSet' } });
	});

	test('globals override defaults', () => {
		fs.writeFileSync(globalSettingsFile, '{ "configurationService.folder.testSetting": "userValue" }');
		return testObject.reloadConfiguration()
			.then(() => assert.equal(testObject.getValue('configurationService.folder.testSetting'), 'userValue'));
	});

	test('globals', () => {
		fs.writeFileSync(globalSettingsFile, '{ "testworkbench.editor.tabs": true }');
		return testObject.reloadConfiguration()
			.then(() => assert.equal(testObject.getValue('testworkbench.editor.tabs'), true));
	});

	test('workspace settings', () => {
		fs.writeFileSync(path.join(workspaceDir, '.vscode', 'settings.json'), '{ "testworkbench.editor.icons": true }');
		return testObject.reloadConfiguration()
			.then(() => assert.equal(testObject.getValue('testworkbench.editor.icons'), true));
	});

	test('workspace settings override user settings', () => {
		fs.writeFileSync(globalSettingsFile, '{ "configurationService.folder.testSetting": "userValue" }');
		fs.writeFileSync(path.join(workspaceDir, '.vscode', 'settings.json'), '{ "configurationService.folder.testSetting": "workspaceValue" }');
		return testObject.reloadConfiguration()
			.then(() => assert.equal(testObject.getValue('configurationService.folder.testSetting'), 'workspaceValue'));
	});

	test('workspace settings override user settings after defaults are registered ', () => {
		fs.writeFileSync(globalSettingsFile, '{ "configurationService.folder.newSetting": "userValue" }');
		fs.writeFileSync(path.join(workspaceDir, '.vscode', 'settings.json'), '{ "configurationService.folder.newSetting": "workspaceValue" }');
		return testObject.reloadConfiguration()
			.then(() => {

				configurationRegistry.registerConfiguration({
					'id': '_test',
					'type': 'object',
					'properties': {
						'configurationService.folder.newSetting': {
							'type': 'string',
							'default': 'isSet'
						}
					}
				});

				assert.equal(testObject.getValue('configurationService.folder.newSetting'), 'workspaceValue');
			});
	});

	test('executable settings are not read from workspace', () => {
		fs.writeFileSync(globalSettingsFile, '{ "configurationService.folder.executableSetting": "userValue" }');
		fs.writeFileSync(path.join(workspaceDir, '.vscode', 'settings.json'), '{ "configurationService.folder.executableSetting": "workspaceValue" }');
		return testObject.reloadConfiguration()
			.then(() => assert.equal(testObject.getValue('configurationService.folder.executableSetting'), 'userValue'));
	});

	test('get unsupported workspace settings', () => {
		fs.writeFileSync(path.join(workspaceDir, '.vscode', 'settings.json'), '{ "configurationService.folder.executableSetting": "workspaceValue" }');
		return testObject.reloadConfiguration()
			.then(() => assert.deepEqual(testObject.getUnsupportedWorkspaceKeys(), ['configurationService.folder.executableSetting']));
	});

	test('get unsupported workspace settings after defaults are registered', () => {
		fs.writeFileSync(path.join(workspaceDir, '.vscode', 'settings.json'), '{ "configurationService.folder.anotherExecutableSetting": "workspaceValue" }');
		return testObject.reloadConfiguration()
			.then(() => {
				configurationRegistry.registerConfiguration({
					'id': '_test',
					'type': 'object',
					'properties': {
						'configurationService.folder.anotherExecutableSetting': {
							'type': 'string',
							'default': 'isSet',
							isExecutable: true
						}
					}
				});
				assert.deepEqual(testObject.getUnsupportedWorkspaceKeys(), ['configurationService.folder.anotherExecutableSetting']);
			});
	});

	test('workspace change triggers event', () => {
		const settingsFile = path.join(workspaceDir, '.vscode', 'settings.json');
		fs.writeFileSync(settingsFile, '{ "configurationService.folder.testSetting": "workspaceValue" }');
		const event = new FileChangesEvent([{ resource: URI.file(settingsFile), type: FileChangeType.ADDED }]);
		const target = sinon.spy();
		testObject.onDidChangeConfiguration(target);
		return (<WorkspaceService>testObject).handleWorkspaceFileEvents(event)
			.then(() => {
				assert.equal(testObject.getValue('configurationService.folder.testSetting'), 'workspaceValue');
				assert.ok(target.called);
			});
	});

	test('reload configuration emits events after global configuraiton changes', () => {
		fs.writeFileSync(globalSettingsFile, '{ "testworkbench.editor.tabs": true }');
		const target = sinon.spy();
		testObject.onDidChangeConfiguration(target);
		return testObject.reloadConfiguration().then(() => assert.ok(target.called));
	});

	test('reload configuration emits events after workspace configuraiton changes', () => {
		fs.writeFileSync(path.join(workspaceDir, '.vscode', 'settings.json'), '{ "configurationService.folder.testSetting": "workspaceValue" }');
		const target = sinon.spy();
		testObject.onDidChangeConfiguration(target);
		return testObject.reloadConfiguration().then(() => assert.ok(target.called));
	});

	test('reload configuration should not emit event if no changes', () => {
		fs.writeFileSync(globalSettingsFile, '{ "testworkbench.editor.tabs": true }');
		fs.writeFileSync(path.join(workspaceDir, '.vscode', 'settings.json'), '{ "configurationService.folder.testSetting": "workspaceValue" }');
		return testObject.reloadConfiguration()
			.then(() => {
				const target = sinon.spy();
				testObject.onDidChangeConfiguration(() => { target(); });
				return testObject.reloadConfiguration()
					.then(() => assert.ok(!target.called));
			});
	});

	test('inspect', () => {
		let actual = testObject.inspect('something.missing');
		assert.equal(actual.default, void 0);
		assert.equal(actual.user, void 0);
		assert.equal(actual.workspace, void 0);
		assert.equal(actual.workspaceFolder, void 0);
		assert.equal(actual.value, void 0);

		actual = testObject.inspect('configurationService.folder.testSetting');
		assert.equal(actual.default, 'isSet');
		assert.equal(actual.user, void 0);
		assert.equal(actual.workspace, void 0);
		assert.equal(actual.workspaceFolder, void 0);
		assert.equal(actual.value, 'isSet');

		fs.writeFileSync(globalSettingsFile, '{ "configurationService.folder.testSetting": "userValue" }');
		return testObject.reloadConfiguration()
			.then(() => {
				actual = testObject.inspect('configurationService.folder.testSetting');
				assert.equal(actual.default, 'isSet');
				assert.equal(actual.user, 'userValue');
				assert.equal(actual.workspace, void 0);
				assert.equal(actual.workspaceFolder, void 0);
				assert.equal(actual.value, 'userValue');

				fs.writeFileSync(path.join(workspaceDir, '.vscode', 'settings.json'), '{ "configurationService.folder.testSetting": "workspaceValue" }');

				return testObject.reloadConfiguration()
					.then(() => {
						actual = testObject.inspect('configurationService.folder.testSetting');
						assert.equal(actual.default, 'isSet');
						assert.equal(actual.user, 'userValue');
						assert.equal(actual.workspace, 'workspaceValue');
						assert.equal(actual.workspaceFolder, void 0);
						assert.equal(actual.value, 'workspaceValue');
					});
			});
	});

	test('keys', () => {
		let actual = testObject.keys();
		assert.ok(actual.default.indexOf('configurationService.folder.testSetting') !== -1);
		assert.deepEqual(actual.user, []);
		assert.deepEqual(actual.workspace, []);
		assert.deepEqual(actual.workspaceFolder, []);

		fs.writeFileSync(globalSettingsFile, '{ "configurationService.folder.testSetting": "userValue" }');
		return testObject.reloadConfiguration()
			.then(() => {
				actual = testObject.keys();
				assert.ok(actual.default.indexOf('configurationService.folder.testSetting') !== -1);
				assert.deepEqual(actual.user, ['configurationService.folder.testSetting']);
				assert.deepEqual(actual.workspace, []);
				assert.deepEqual(actual.workspaceFolder, []);

				fs.writeFileSync(path.join(workspaceDir, '.vscode', 'settings.json'), '{ "configurationService.folder.testSetting": "workspaceValue" }');

				return testObject.reloadConfiguration()
					.then(() => {
						actual = testObject.keys();
						assert.ok(actual.default.indexOf('configurationService.folder.testSetting') !== -1);
						assert.deepEqual(actual.user, ['configurationService.folder.testSetting']);
						assert.deepEqual(actual.workspace, ['configurationService.folder.testSetting']);
						assert.deepEqual(actual.workspaceFolder, []);
					});
			});
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

suite('WorkspaceConfigurationService - Multiroot', () => {

	let parentResource: string, workspaceContextService: IWorkspaceContextService, environmentService: IEnvironmentService, jsonEditingServce: IJSONEditingService, testObject: IWorkspaceConfigurationService;
	const configurationRegistry = <IConfigurationRegistry>Registry.as(ConfigurationExtensions.Configuration);

	suiteSetup(() => {
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
				},
				'configurationService.workspace.testExecutableSetting': {
					'type': 'string',
					'default': 'isSet',
					isExecutable: true
				},
				'configurationService.workspace.testExecutableResourceSetting': {
					'type': 'string',
					'default': 'isSet',
					isExecutable: true,
					scope: ConfigurationScope.RESOURCE
				}
			}
		});
	});

	setup(() => {
		return setUpWorkspace(['1', '2'])
			.then(({ parentDir, configPath }) => {

				parentResource = parentDir;

				environmentService = new SettingsTestEnvironmentService(parseArgs(process.argv), process.execPath, path.join(parentDir, 'settings.json'));
				const workspaceService = new WorkspaceService(environmentService);

				const instantiationService = <TestInstantiationService>workbenchInstantiationService();
				instantiationService.stub(IWorkspaceContextService, workspaceService);
				instantiationService.stub(IConfigurationService, workspaceService);
				instantiationService.stub(IEnvironmentService, environmentService);

				return workspaceService.initialize({ id: configPath, configPath }).then(() => {

					instantiationService.stub(IFileService, new FileService(<IWorkspaceContextService>workspaceService, TestEnvironmentService, new TestTextResourceConfigurationService(), workspaceService, new TestLifecycleService(), { disableWatcher: true }));
					instantiationService.stub(ITextFileService, instantiationService.createInstance(TestTextFileService));
					instantiationService.stub(ITextModelService, <ITextModelService>instantiationService.createInstance(TextModelResolverService));
					workspaceService.setInstantiationService(instantiationService);

					workspaceContextService = workspaceService;
					jsonEditingServce = instantiationService.createInstance(JSONEditingService);
					testObject = workspaceService;
				});
			});
	});

	teardown(() => {
		if (testObject) {
			(<WorkspaceService>testObject).dispose();
		}
		if (parentResource) {
			return pfs.del(parentResource, os.tmpdir());
		}
		return void 0;
	});

	test('executable settings are not read from workspace', () => {
		fs.writeFileSync(environmentService.appSettingsPath, '{ "configurationService.workspace.testExecutableSetting": "userValue" }');
		return jsonEditingServce.write(workspaceContextService.getWorkspace().configuration, { key: 'settings', value: { 'configurationService.workspace.testExecutableSetting': 'workspaceValue' } }, true)
			.then(() => testObject.reloadConfiguration())
			.then(() => assert.equal(testObject.getValue('configurationService.workspace.testExecutableSetting'), 'userValue'));
	});

	test('executable settings are not read from workspace folder', () => {
		fs.writeFileSync(environmentService.appSettingsPath, '{ "configurationService.workspace.testExecutableResourceSetting": "userValue" }');
		fs.writeFileSync(workspaceContextService.getWorkspace().folders[0].toResource('.vscode/settings.json').fsPath, '{ "configurationService.workspace.testExecutableResourceSetting": "workspaceFolderValue" }');
		return testObject.reloadConfiguration()
			.then(() => assert.equal(testObject.getValue('configurationService.workspace.testExecutableResourceSetting', { resource: workspaceContextService.getWorkspace().folders[0].uri }), 'userValue'));
	});

	test('get unsupported workspace settings', () => {
		fs.writeFileSync(workspaceContextService.getWorkspace().folders[0].toResource('.vscode/settings.json').fsPath, '{ "configurationService.workspace.testExecutableResourceSetting": "workspaceFolderValue" }');
		return jsonEditingServce.write(workspaceContextService.getWorkspace().configuration, { key: 'settings', value: { 'configurationService.workspace.testExecutableSetting': 'workspaceValue' } }, true)
			.then(() => testObject.reloadConfiguration())
			.then(() => assert.deepEqual(testObject.getUnsupportedWorkspaceKeys(), ['configurationService.workspace.testExecutableSetting', 'configurationService.workspace.testExecutableResourceSetting']));
	});

	test('workspace settings override user settings after defaults are registered ', () => {
		fs.writeFileSync(environmentService.appSettingsPath, '{ "configurationService.workspace.newSetting": "userValue" }');
		return jsonEditingServce.write(workspaceContextService.getWorkspace().configuration, { key: 'settings', value: { 'configurationService.workspace.newSetting': 'workspaceValue' } }, true)
			.then(() => testObject.reloadConfiguration())
			.then(() => {
				configurationRegistry.registerConfiguration({
					'id': '_test',
					'type': 'object',
					'properties': {
						'configurationService.workspace.newSetting': {
							'type': 'string',
							'default': 'isSet'
						}
					}
				});
				assert.equal(testObject.getValue('configurationService.workspace.newSetting'), 'workspaceValue');
			});
	});

	test('executable settings are not read from workspace folder after defaults are registered', () => {
		fs.writeFileSync(environmentService.appSettingsPath, '{ "configurationService.workspace.testNewExecutableResourceSetting": "userValue" }');
		fs.writeFileSync(workspaceContextService.getWorkspace().folders[0].toResource('.vscode/settings.json').fsPath, '{ "configurationService.workspace.testNewExecutableResourceSetting": "workspaceFolderValue" }');
		return testObject.reloadConfiguration()
			.then(() => {
				configurationRegistry.registerConfiguration({
					'id': '_test',
					'type': 'object',
					'properties': {
						'configurationService.workspace.testNewExecutableResourceSetting': {
							'type': 'string',
							'default': 'isSet',
							isExecutable: true,
							scope: ConfigurationScope.RESOURCE
						}
					}
				});
				assert.equal(testObject.getValue('configurationService.workspace.testNewExecutableResourceSetting', { resource: workspaceContextService.getWorkspace().folders[0].uri }), 'userValue');
			});
	});

	test('get unsupported workspace settings after defaults are registered', () => {
		fs.writeFileSync(workspaceContextService.getWorkspace().folders[0].toResource('.vscode/settings.json').fsPath, '{ "configurationService.workspace.testNewExecutableResourceSetting2": "workspaceFolderValue" }');
		return jsonEditingServce.write(workspaceContextService.getWorkspace().configuration, { key: 'settings', value: { 'configurationService.workspace.testExecutableSetting': 'workspaceValue' } }, true)
			.then(() => testObject.reloadConfiguration())
			.then(() => {
				configurationRegistry.registerConfiguration({
					'id': '_test',
					'type': 'object',
					'properties': {
						'configurationService.workspace.testNewExecutableResourceSetting2': {
							'type': 'string',
							'default': 'isSet',
							isExecutable: true,
							scope: ConfigurationScope.RESOURCE
						}
					}
				});
				assert.deepEqual(testObject.getUnsupportedWorkspaceKeys(), ['configurationService.workspace.testExecutableSetting', 'configurationService.workspace.testNewExecutableResourceSetting2']);
			});
	});

	test('resource setting in folder is read after it is registered later', () => {
		fs.writeFileSync(workspaceContextService.getWorkspace().folders[0].toResource('.vscode/settings.json').fsPath, '{ "configurationService.workspace.testNewResourceSetting2": "workspaceFolderValue" }');
		return jsonEditingServce.write(workspaceContextService.getWorkspace().configuration, { key: 'settings', value: { 'configurationService.workspace.testNewResourceSetting2': 'workspaceValue' } }, true)
			.then(() => testObject.reloadConfiguration())
			.then(() => {
				configurationRegistry.registerConfiguration({
					'id': '_test',
					'type': 'object',
					'properties': {
						'configurationService.workspace.testNewResourceSetting2': {
							'type': 'string',
							'default': 'isSet',
							scope: ConfigurationScope.RESOURCE
						}
					}
				});
				assert.equal(testObject.getValue('configurationService.workspace.testNewResourceSetting2', { resource: workspaceContextService.getWorkspace().folders[0].uri }), 'workspaceFolderValue');
			});
	});

	test('inspect', () => {
		let actual = testObject.inspect('something.missing');
		assert.equal(actual.default, void 0);
		assert.equal(actual.user, void 0);
		assert.equal(actual.workspace, void 0);
		assert.equal(actual.workspaceFolder, void 0);
		assert.equal(actual.value, void 0);

		actual = testObject.inspect('configurationService.workspace.testResourceSetting');
		assert.equal(actual.default, 'isSet');
		assert.equal(actual.user, void 0);
		assert.equal(actual.workspace, void 0);
		assert.equal(actual.workspaceFolder, void 0);
		assert.equal(actual.value, 'isSet');

		fs.writeFileSync(environmentService.appSettingsPath, '{ "configurationService.workspace.testResourceSetting": "userValue" }');
		return testObject.reloadConfiguration()
			.then(() => {
				actual = testObject.inspect('configurationService.workspace.testResourceSetting');
				assert.equal(actual.default, 'isSet');
				assert.equal(actual.user, 'userValue');
				assert.equal(actual.workspace, void 0);
				assert.equal(actual.workspaceFolder, void 0);
				assert.equal(actual.value, 'userValue');

				return jsonEditingServce.write(workspaceContextService.getWorkspace().configuration, { key: 'settings', value: { 'configurationService.workspace.testResourceSetting': 'workspaceValue' } }, true)
					.then(() => testObject.reloadConfiguration())
					.then(() => {
						actual = testObject.inspect('configurationService.workspace.testResourceSetting');
						assert.equal(actual.default, 'isSet');
						assert.equal(actual.user, 'userValue');
						assert.equal(actual.workspace, 'workspaceValue');
						assert.equal(actual.workspaceFolder, void 0);
						assert.equal(actual.value, 'workspaceValue');

						fs.writeFileSync(workspaceContextService.getWorkspace().folders[0].toResource('.vscode/settings.json').fsPath, '{ "configurationService.workspace.testResourceSetting": "workspaceFolderValue" }');

						return testObject.reloadConfiguration()
							.then(() => {
								actual = testObject.inspect('configurationService.workspace.testResourceSetting', { resource: workspaceContextService.getWorkspace().folders[0].uri });
								assert.equal(actual.default, 'isSet');
								assert.equal(actual.user, 'userValue');
								assert.equal(actual.workspace, 'workspaceValue');
								assert.equal(actual.workspaceFolder, 'workspaceFolderValue');
								assert.equal(actual.value, 'workspaceFolderValue');
							});
					});
			});
	});

	test('get launch configuration', () => {
		const expectedLaunchConfiguration = {
			'version': '0.1.0',
			'configurations': [
				{
					'type': 'node',
					'request': 'launch',
					'name': 'Gulp Build',
					'program': '${workspaceFolder}/node_modules/gulp/bin/gulp.js',
					'stopOnEntry': true,
					'args': [
						'watch-extension:json-client'
					],
					'cwd': '${workspaceFolder}'
				}
			]
		};
		return jsonEditingServce.write(workspaceContextService.getWorkspace().configuration, { key: 'launch', value: expectedLaunchConfiguration }, true)
			.then(() => testObject.reloadConfiguration())
			.then(() => {
				const actual = testObject.getValue('launch');
				assert.deepEqual(actual, expectedLaunchConfiguration);
			});
	});

	test('inspect launch configuration', () => {
		const expectedLaunchConfiguration = {
			'version': '0.1.0',
			'configurations': [
				{
					'type': 'node',
					'request': 'launch',
					'name': 'Gulp Build',
					'program': '${workspaceFolder}/node_modules/gulp/bin/gulp.js',
					'stopOnEntry': true,
					'args': [
						'watch-extension:json-client'
					],
					'cwd': '${workspaceFolder}'
				}
			]
		};
		return jsonEditingServce.write(workspaceContextService.getWorkspace().configuration, { key: 'launch', value: expectedLaunchConfiguration }, true)
			.then(() => testObject.reloadConfiguration())
			.then(() => {
				const actual = testObject.inspect('launch').workspace;
				assert.deepEqual(actual, expectedLaunchConfiguration);
			});
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
		const workspace = workspaceContextService.getWorkspace();
		return testObject.updateValue('configurationService.workspace.testResourceSetting', 'workspaceFolderValue', { resource: workspace.folders[0].uri }, ConfigurationTarget.WORKSPACE_FOLDER)
			.then(() => assert.equal(testObject.getValue('configurationService.workspace.testResourceSetting', { resource: workspace.folders[0].uri }), 'workspaceFolderValue'));
	});

	test('update workspace folder configuration should trigger change event before promise is resolve', () => {
		const workspace = workspaceContextService.getWorkspace();
		const target = sinon.spy();
		testObject.onDidChangeConfiguration(target);
		return testObject.updateValue('configurationService.workspace.testResourceSetting', 'workspaceFolderValue', { resource: workspace.folders[0].uri }, ConfigurationTarget.WORKSPACE_FOLDER)
			.then(() => assert.ok(target.called));
	});

	test('update tasks configuration in a folder', () => {
		const workspace = workspaceContextService.getWorkspace();
		return testObject.updateValue('tasks', { 'version': '1.0.0', tasks: [{ 'taskName': 'myTask' }] }, { resource: workspace.folders[0].uri }, ConfigurationTarget.WORKSPACE_FOLDER)
			.then(() => assert.deepEqual(testObject.getValue('tasks', { resource: workspace.folders[0].uri }), { 'version': '1.0.0', tasks: [{ 'taskName': 'myTask' }] }));
	});

	test('update tasks configuration in a workspace is not supported', () => {
		const workspace = workspaceContextService.getWorkspace();
		return testObject.updateValue('tasks', { 'version': '1.0.0', tasks: [{ 'taskName': 'myTask' }] }, { resource: workspace.folders[0].uri }, ConfigurationTarget.WORKSPACE, true)
			.then(() => assert.fail('Should not be supported'), (e) => assert.equal(e.code, ConfigurationEditingErrorCode.ERROR_INVALID_WORKSPACE_TARGET));
	});

	test('update launch configuration in a workspace', () => {
		const workspace = workspaceContextService.getWorkspace();
		return testObject.updateValue('launch', { 'version': '1.0.0', configurations: [{ 'name': 'myLaunch' }] }, { resource: workspace.folders[0].uri }, ConfigurationTarget.WORKSPACE, true)
			.then(() => assert.deepEqual(testObject.getValue('launch'), { 'version': '1.0.0', configurations: [{ 'name': 'myLaunch' }] }));
	});

	test('task configurations are not read from workspace', () => {
		return jsonEditingServce.write(workspaceContextService.getWorkspace().configuration, { key: 'tasks', value: { 'version': '1.0' } }, true)
			.then(() => testObject.reloadConfiguration())
			.then(() => {
				const actual = testObject.inspect('tasks.version');
				assert.equal(actual.workspace, void 0);
			});
	});
});
