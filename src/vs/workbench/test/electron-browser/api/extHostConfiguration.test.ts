/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as assert from 'assert';
import URI from 'vs/base/common/uri';
import { ExtHostWorkspace } from 'vs/workbench/api/node/extHostWorkspace';
import { ExtHostConfiguration } from 'vs/workbench/api/node/extHostConfiguration';
import { MainThreadConfigurationShape, IConfigurationInitData } from 'vs/workbench/api/node/extHost.protocol';
import { TPromise } from 'vs/base/common/winjs.base';
import { ConfigurationModel } from 'vs/platform/configuration/common/configurationModels';
import { TestRPCProtocol } from './testRPCProtocol';
import { mock } from 'vs/workbench/test/electron-browser/api/mock';
import { IWorkspaceFolder, WorkspaceFolder } from 'vs/platform/workspace/common/workspace';
import { ConfigurationTarget } from 'vs/platform/configuration/common/configuration';
import { NullLogService } from 'vs/platform/log/common/log';

suite('ExtHostConfiguration', function () {

	class RecordingShape extends mock<MainThreadConfigurationShape>() {
		lastArgs: [ConfigurationTarget, string, any];
		$updateConfigurationOption(target: ConfigurationTarget, key: string, value: any): TPromise<void> {
			this.lastArgs = [target, key, value];
			return TPromise.as(void 0);
		}
	}

	function createExtHostConfiguration(contents: any = Object.create(null), shape?: MainThreadConfigurationShape) {
		if (!shape) {
			shape = new class extends mock<MainThreadConfigurationShape>() { };
		}
		return new ExtHostConfiguration(shape, new ExtHostWorkspace(new TestRPCProtocol(), null, new NullLogService()), createConfigurationData(contents));
	}

	function createConfigurationData(contents: any): IConfigurationInitData {
		return {
			defaults: new ConfigurationModel(contents),
			user: new ConfigurationModel(contents),
			workspace: new ConfigurationModel(),
			folders: Object.create(null),
			configurationScopes: {}
		};
	}

	test('getConfiguration fails regression test 1.7.1 -> 1.8 #15552', function () {
		const extHostConfig = createExtHostConfiguration({
			'search': {
				'exclude': {
					'**/node_modules': true
				}
			}
		});

		assert.equal(extHostConfig.getConfiguration('search.exclude')['**/node_modules'], true);
		assert.equal(extHostConfig.getConfiguration('search.exclude').get('**/node_modules'), true);
		assert.equal(extHostConfig.getConfiguration('search').get('exclude')['**/node_modules'], true);

		assert.equal(extHostConfig.getConfiguration('search.exclude').has('**/node_modules'), true);
		assert.equal(extHostConfig.getConfiguration('search').has('exclude.**/node_modules'), true);
	});

	test('has/get', function () {

		const all = createExtHostConfiguration({
			'farboo': {
				'config0': true,
				'nested': {
					'config1': 42,
					'config2': 'Das Pferd frisst kein Reis.'
				},
				'config4': ''
			}
		});

		const config = all.getConfiguration('farboo');

		assert.ok(config.has('config0'));
		assert.equal(config.get('config0'), true);
		assert.equal(config.get('config4'), '');
		assert.equal(config['config0'], true);
		assert.equal(config['config4'], '');

		assert.ok(config.has('nested.config1'));
		assert.equal(config.get('nested.config1'), 42);
		assert.ok(config.has('nested.config2'));
		assert.equal(config.get('nested.config2'), 'Das Pferd frisst kein Reis.');

		assert.ok(config.has('nested'));
		assert.deepEqual(config.get('nested'), { config1: 42, config2: 'Das Pferd frisst kein Reis.' });
	});

	test('can modify the returned configuration', function () {

		const all = createExtHostConfiguration({
			'farboo': {
				'config0': true,
				'nested': {
					'config1': 42,
					'config2': 'Das Pferd frisst kein Reis.'
				},
				'config4': ''
			}
		});

		let testObject = all.getConfiguration();
		let actual = testObject.get('farboo');
		actual['farboo1'] = 'newValue';
		assert.equal('newValue', actual['farboo1']);

		testObject = all.getConfiguration();
		testObject['farboo']['farboo1'] = 'newValue';
		assert.equal('newValue', testObject['farboo']['farboo1']);

		testObject = all.getConfiguration();
		testObject['farboo']['farboo1'] = 'newValue';
		assert.equal('newValue', testObject.get('farboo')['farboo1']);

		testObject = all.getConfiguration();
		actual = testObject.inspect('farboo');
		actual['value'] = 'effectiveValue';
		assert.equal('effectiveValue', actual['value']);

		testObject = all.getConfiguration();
		actual = testObject.get('farboo');
		assert.equal(undefined, actual['farboo1']);

		testObject = all.getConfiguration();
		testObject['farboo']['farboo1'] = 'newValue';
		testObject = all.getConfiguration();
		assert.equal(undefined, testObject['farboo']['farboo1']);
	});

	test('inspect in no workspace context', function () {
		const testObject = new ExtHostConfiguration(
			new class extends mock<MainThreadConfigurationShape>() { },
			new ExtHostWorkspace(new TestRPCProtocol(), null, new NullLogService()),
			{
				defaults: new ConfigurationModel({
					'editor': {
						'wordWrap': 'off'
					}
				}, ['editor.wordWrap']),
				user: new ConfigurationModel({
					'editor': {
						'wordWrap': 'on'
					}
				}, ['editor.wordWrap']),
				workspace: new ConfigurationModel({}, []),
				folders: Object.create(null),
				configurationScopes: {}
			}
		);

		let actual = testObject.getConfiguration().inspect('editor.wordWrap');
		assert.equal(actual.defaultValue, 'off');
		assert.equal(actual.globalValue, 'on');
		assert.equal(actual.workspaceValue, undefined);
		assert.equal(actual.workspaceFolderValue, undefined);

		actual = testObject.getConfiguration('editor').inspect('wordWrap');
		assert.equal(actual.defaultValue, 'off');
		assert.equal(actual.globalValue, 'on');
		assert.equal(actual.workspaceValue, undefined);
		assert.equal(actual.workspaceFolderValue, undefined);
	});

	test('inspect in single root context', function () {
		const workspaceUri = URI.file('foo');
		const folders = Object.create(null);
		const workspace = new ConfigurationModel({
			'editor': {
				'wordWrap': 'bounded'
			}
		}, ['editor.wordWrap']);
		folders[workspaceUri.toString()] = workspace;
		const testObject = new ExtHostConfiguration(
			new class extends mock<MainThreadConfigurationShape>() { },
			new ExtHostWorkspace(new TestRPCProtocol(), {
				'id': 'foo',
				'folders': [aWorkspaceFolder(URI.file('foo'), 0)],
				'name': 'foo'
			}, new NullLogService()),
			{
				defaults: new ConfigurationModel({
					'editor': {
						'wordWrap': 'off'
					}
				}, ['editor.wordWrap']),
				user: new ConfigurationModel({
					'editor': {
						'wordWrap': 'on'
					}
				}, ['editor.wordWrap']),
				workspace,
				folders,
				configurationScopes: {}
			}
		);

		let actual1 = testObject.getConfiguration().inspect('editor.wordWrap');
		assert.equal(actual1.defaultValue, 'off');
		assert.equal(actual1.globalValue, 'on');
		assert.equal(actual1.workspaceValue, 'bounded');
		assert.equal(actual1.workspaceFolderValue, undefined);

		actual1 = testObject.getConfiguration('editor').inspect('wordWrap');
		assert.equal(actual1.defaultValue, 'off');
		assert.equal(actual1.globalValue, 'on');
		assert.equal(actual1.workspaceValue, 'bounded');
		assert.equal(actual1.workspaceFolderValue, undefined);

		let actual2 = testObject.getConfiguration(null, workspaceUri).inspect('editor.wordWrap');
		assert.equal(actual2.defaultValue, 'off');
		assert.equal(actual2.globalValue, 'on');
		assert.equal(actual2.workspaceValue, 'bounded');
		assert.equal(actual2.workspaceFolderValue, 'bounded');

		actual2 = testObject.getConfiguration('editor', workspaceUri).inspect('wordWrap');
		assert.equal(actual2.defaultValue, 'off');
		assert.equal(actual2.globalValue, 'on');
		assert.equal(actual2.workspaceValue, 'bounded');
		assert.equal(actual2.workspaceFolderValue, 'bounded');
	});

	test('inspect in multi root context', function () {
		const workspace = new ConfigurationModel({
			'editor': {
				'wordWrap': 'bounded'
			}
		}, ['editor.wordWrap']);

		const firstRoot = URI.file('foo1');
		const secondRoot = URI.file('foo2');
		const thirdRoot = URI.file('foo3');
		const folders = Object.create(null);
		folders[firstRoot.toString()] = new ConfigurationModel({
			'editor': {
				'wordWrap': 'off',
				'lineNumbers': 'relative'
			}
		}, ['editor.wordWrap']);
		folders[secondRoot.toString()] = new ConfigurationModel({
			'editor': {
				'wordWrap': 'on'
			}
		}, ['editor.wordWrap']);
		folders[thirdRoot.toString()] = new ConfigurationModel({}, []);

		const testObject = new ExtHostConfiguration(
			new class extends mock<MainThreadConfigurationShape>() { },
			new ExtHostWorkspace(new TestRPCProtocol(), {
				'id': 'foo',
				'folders': [aWorkspaceFolder(firstRoot, 0), aWorkspaceFolder(secondRoot, 1)],
				'name': 'foo'
			}, new NullLogService()),
			{
				defaults: new ConfigurationModel({
					'editor': {
						'wordWrap': 'off',
						'lineNumbers': 'on'
					}
				}, ['editor.wordWrap']),
				user: new ConfigurationModel({
					'editor': {
						'wordWrap': 'on'
					}
				}, ['editor.wordWrap']),
				workspace,
				folders,
				configurationScopes: {}
			}
		);

		let actual1 = testObject.getConfiguration().inspect('editor.wordWrap');
		assert.equal(actual1.defaultValue, 'off');
		assert.equal(actual1.globalValue, 'on');
		assert.equal(actual1.workspaceValue, 'bounded');
		assert.equal(actual1.workspaceFolderValue, undefined);

		actual1 = testObject.getConfiguration('editor').inspect('wordWrap');
		assert.equal(actual1.defaultValue, 'off');
		assert.equal(actual1.globalValue, 'on');
		assert.equal(actual1.workspaceValue, 'bounded');
		assert.equal(actual1.workspaceFolderValue, undefined);

		actual1 = testObject.getConfiguration('editor').inspect('lineNumbers');
		assert.equal(actual1.defaultValue, 'on');
		assert.equal(actual1.globalValue, undefined);
		assert.equal(actual1.workspaceValue, undefined);
		assert.equal(actual1.workspaceFolderValue, undefined);

		let actual2 = testObject.getConfiguration(null, firstRoot).inspect('editor.wordWrap');
		assert.equal(actual2.defaultValue, 'off');
		assert.equal(actual2.globalValue, 'on');
		assert.equal(actual2.workspaceValue, 'bounded');
		assert.equal(actual2.workspaceFolderValue, 'off');

		actual2 = testObject.getConfiguration('editor', firstRoot).inspect('wordWrap');
		assert.equal(actual2.defaultValue, 'off');
		assert.equal(actual2.globalValue, 'on');
		assert.equal(actual2.workspaceValue, 'bounded');
		assert.equal(actual2.workspaceFolderValue, 'off');

		actual2 = testObject.getConfiguration('editor', firstRoot).inspect('lineNumbers');
		assert.equal(actual2.defaultValue, 'on');
		assert.equal(actual2.globalValue, undefined);
		assert.equal(actual2.workspaceValue, undefined);
		assert.equal(actual2.workspaceFolderValue, 'relative');

		actual2 = testObject.getConfiguration(null, secondRoot).inspect('editor.wordWrap');
		assert.equal(actual2.defaultValue, 'off');
		assert.equal(actual2.globalValue, 'on');
		assert.equal(actual2.workspaceValue, 'bounded');
		assert.equal(actual2.workspaceFolderValue, 'on');

		actual2 = testObject.getConfiguration('editor', secondRoot).inspect('wordWrap');
		assert.equal(actual2.defaultValue, 'off');
		assert.equal(actual2.globalValue, 'on');
		assert.equal(actual2.workspaceValue, 'bounded');
		assert.equal(actual2.workspaceFolderValue, 'on');

		actual2 = testObject.getConfiguration(null, thirdRoot).inspect('editor.wordWrap');
		assert.equal(actual2.defaultValue, 'off');
		assert.equal(actual2.globalValue, 'on');
		assert.equal(actual2.workspaceValue, 'bounded');
		assert.ok(Object.keys(actual2).indexOf('workspaceFolderValue') !== -1);
		assert.equal(actual2.workspaceFolderValue, undefined);

		actual2 = testObject.getConfiguration('editor', thirdRoot).inspect('wordWrap');
		assert.equal(actual2.defaultValue, 'off');
		assert.equal(actual2.globalValue, 'on');
		assert.equal(actual2.workspaceValue, 'bounded');
		assert.ok(Object.keys(actual2).indexOf('workspaceFolderValue') !== -1);
		assert.equal(actual2.workspaceFolderValue, undefined);
	});

	test('getConfiguration vs get', function () {

		const all = createExtHostConfiguration({
			'farboo': {
				'config0': true,
				'config4': 38
			}
		});

		let config = all.getConfiguration('farboo.config0');
		assert.equal(config.get(''), undefined);
		assert.equal(config.has(''), false);

		config = all.getConfiguration('farboo');
		assert.equal(config.get('config0'), true);
		assert.equal(config.has('config0'), true);
	});

	test('getConfiguration vs get', function () {

		const all = createExtHostConfiguration({
			'farboo': {
				'config0': true,
				'config4': 38
			}
		});

		let config = all.getConfiguration('farboo.config0');
		assert.equal(config.get(''), undefined);
		assert.equal(config.has(''), false);

		config = all.getConfiguration('farboo');
		assert.equal(config.get('config0'), true);
		assert.equal(config.has('config0'), true);
	});

	test('name vs property', function () {
		const all = createExtHostConfiguration({
			'farboo': {
				'get': 'get-prop'
			}
		});
		const config = all.getConfiguration('farboo');

		assert.ok(config.has('get'));
		assert.equal(config.get('get'), 'get-prop');
		assert.deepEqual(config['get'], config.get);
		assert.throws(() => config['get'] = <any>'get-prop');
	});

	test('update: no target passes null', function () {
		const shape = new RecordingShape();
		const allConfig = createExtHostConfiguration({
			'foo': {
				'bar': 1,
				'far': 1
			}
		}, shape);

		let config = allConfig.getConfiguration('foo');
		config.update('bar', 42);

		assert.equal(shape.lastArgs[0], null);
	});

	test('update/section to key', function () {

		const shape = new RecordingShape();
		const allConfig = createExtHostConfiguration({
			'foo': {
				'bar': 1,
				'far': 1
			}
		}, shape);

		let config = allConfig.getConfiguration('foo');
		config.update('bar', 42, true);

		assert.equal(shape.lastArgs[0], ConfigurationTarget.USER);
		assert.equal(shape.lastArgs[1], 'foo.bar');
		assert.equal(shape.lastArgs[2], 42);

		config = allConfig.getConfiguration('');
		config.update('bar', 42, true);
		assert.equal(shape.lastArgs[1], 'bar');

		config.update('foo.bar', 42, true);
		assert.equal(shape.lastArgs[1], 'foo.bar');
	});

	test('update, what is #15834', function () {
		const shape = new RecordingShape();
		const allConfig = createExtHostConfiguration({
			'editor': {
				'formatOnSave': true
			}
		}, shape);

		allConfig.getConfiguration('editor').update('formatOnSave', { extensions: ['ts'] });
		assert.equal(shape.lastArgs[1], 'editor.formatOnSave');
		assert.deepEqual(shape.lastArgs[2], { extensions: ['ts'] });
	});

	test('update/error-state not OK', function () {

		const shape = new class extends mock<MainThreadConfigurationShape>() {
			$updateConfigurationOption(target: ConfigurationTarget, key: string, value: any): TPromise<any> {
				return TPromise.wrapError(new Error('Unknown Key')); // something !== OK
			}
		};

		return createExtHostConfiguration({}, shape)
			.getConfiguration('')
			.update('', true, false)
			.then(() => assert.ok(false), err => { /* expecting rejection */ });
	});

	test('configuration change event', (done) => {

		const workspaceFolder = aWorkspaceFolder(URI.file('folder1'), 0);
		const testObject = new ExtHostConfiguration(
			new class extends mock<MainThreadConfigurationShape>() { },
			new ExtHostWorkspace(new TestRPCProtocol(), {
				'id': 'foo',
				'folders': [workspaceFolder],
				'name': 'foo'
			}, new NullLogService()),
			createConfigurationData({
				'farboo': {
					'config': false,
					'updatedconfig': false
				}
			})
		);

		const newConfigData = createConfigurationData({
			'farboo': {
				'config': false,
				'updatedconfig': true,
				'newConfig': true,
			}
		});
		const changedConfigurationByResource = Object.create({});
		changedConfigurationByResource[workspaceFolder.uri.toString()] = new ConfigurationModel({
			'farboo': {
				'newConfig': true,
			}
		}, ['farboo.newConfig']);
		const configEventData = {
			changedConfiguration: new ConfigurationModel({
				'farboo': {
					'updatedConfig': true,
				}
			}, ['farboo.updatedConfig']),
			changedConfigurationByResource
		};
		testObject.onDidChangeConfiguration(e => {

			assert.deepEqual(testObject.getConfiguration().get('farboo'), {
				'config': false,
				'updatedconfig': true,
				'newConfig': true,
			});

			assert.ok(e.affectsConfiguration('farboo'));
			assert.ok(e.affectsConfiguration('farboo', workspaceFolder.uri));
			assert.ok(e.affectsConfiguration('farboo', URI.file('any')));

			assert.ok(e.affectsConfiguration('farboo.updatedConfig'));
			assert.ok(e.affectsConfiguration('farboo.updatedConfig', workspaceFolder.uri));
			assert.ok(e.affectsConfiguration('farboo.updatedConfig', URI.file('any')));

			assert.ok(e.affectsConfiguration('farboo.newConfig'));
			assert.ok(e.affectsConfiguration('farboo.newConfig', workspaceFolder.uri));
			assert.ok(!e.affectsConfiguration('farboo.newConfig', URI.file('any')));

			assert.ok(!e.affectsConfiguration('farboo.config'));
			assert.ok(!e.affectsConfiguration('farboo.config', workspaceFolder.uri));
			assert.ok(!e.affectsConfiguration('farboo.config', URI.file('any')));
			done();
		});

		testObject.$acceptConfigurationChanged(newConfigData, configEventData);
	});

	function aWorkspaceFolder(uri: URI, index: number, name: string = ''): IWorkspaceFolder {
		return new WorkspaceFolder({ uri, name, index });
	}
});
