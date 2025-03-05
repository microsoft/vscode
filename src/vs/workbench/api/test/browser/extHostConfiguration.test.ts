/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { URI, UriComponents } from '../../../../base/common/uri.js';
import { ExtHostWorkspace } from '../../common/extHostWorkspace.js';
import { ConfigurationInspect, ExtHostConfigProvider } from '../../common/extHostConfiguration.js';
import { MainThreadConfigurationShape, IConfigurationInitData } from '../../common/extHost.protocol.js';
import { ConfigurationModel, ConfigurationModelParser } from '../../../../platform/configuration/common/configurationModels.js';
import { TestRPCProtocol } from '../common/testRPCProtocol.js';
import { mock } from '../../../../base/test/common/mock.js';
import { IWorkspaceFolder, WorkspaceFolder } from '../../../../platform/workspace/common/workspace.js';
import { ConfigurationTarget, IConfigurationModel, IConfigurationChange } from '../../../../platform/configuration/common/configuration.js';
import { NullLogService } from '../../../../platform/log/common/log.js';
import { IExtHostInitDataService } from '../../common/extHostInitDataService.js';
import { IExtHostFileSystemInfo } from '../../common/extHostFileSystemInfo.js';
import { FileSystemProviderCapabilities } from '../../../../platform/files/common/files.js';
import { isLinux } from '../../../../base/common/platform.js';
import { IURITransformerService } from '../../common/extHostUriTransformerService.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';

suite('ExtHostConfiguration', function () {

	class RecordingShape extends mock<MainThreadConfigurationShape>() {
		lastArgs!: [ConfigurationTarget, string, any];
		override $updateConfigurationOption(target: ConfigurationTarget, key: string, value: any): Promise<void> {
			this.lastArgs = [target, key, value];
			return Promise.resolve(undefined);
		}
	}

	function createExtHostWorkspace(): ExtHostWorkspace {
		return new ExtHostWorkspace(new TestRPCProtocol(), new class extends mock<IExtHostInitDataService>() { }, new class extends mock<IExtHostFileSystemInfo>() { override getCapabilities() { return isLinux ? FileSystemProviderCapabilities.PathCaseSensitive : undefined; } }, new NullLogService(), new class extends mock<IURITransformerService>() { });
	}

	function createExtHostConfiguration(contents: any = Object.create(null), shape?: MainThreadConfigurationShape) {
		if (!shape) {
			shape = new class extends mock<MainThreadConfigurationShape>() { };
		}
		return new ExtHostConfigProvider(shape, createExtHostWorkspace(), createConfigurationData(contents), new NullLogService());
	}

	function createConfigurationData(contents: any): IConfigurationInitData {
		return {
			defaults: new ConfigurationModel(contents, [], [], undefined, new NullLogService()),
			policy: ConfigurationModel.createEmptyModel(new NullLogService()),
			application: ConfigurationModel.createEmptyModel(new NullLogService()),
			userLocal: new ConfigurationModel(contents, [], [], undefined, new NullLogService()),
			userRemote: ConfigurationModel.createEmptyModel(new NullLogService()),
			workspace: ConfigurationModel.createEmptyModel(new NullLogService()),
			folders: [],
			configurationScopes: []
		};
	}

	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('getConfiguration fails regression test 1.7.1 -> 1.8 #15552', function () {
		const extHostConfig = createExtHostConfiguration({
			'search': {
				'exclude': {
					'**/node_modules': true
				}
			}
		});

		assert.strictEqual(extHostConfig.getConfiguration('search.exclude')['**/node_modules'], true);
		assert.strictEqual(extHostConfig.getConfiguration('search.exclude').get('**/node_modules'), true);
		assert.strictEqual(extHostConfig.getConfiguration('search').get<any>('exclude')['**/node_modules'], true);

		assert.strictEqual(extHostConfig.getConfiguration('search.exclude').has('**/node_modules'), true);
		assert.strictEqual(extHostConfig.getConfiguration('search').has('exclude.**/node_modules'), true);
	});

	test('has/get', () => {

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
		assert.strictEqual(config.get('config0'), true);
		assert.strictEqual(config.get('config4'), '');
		assert.strictEqual(config['config0'], true);
		assert.strictEqual(config['config4'], '');

		assert.ok(config.has('nested.config1'));
		assert.strictEqual(config.get('nested.config1'), 42);
		assert.ok(config.has('nested.config2'));
		assert.strictEqual(config.get('nested.config2'), 'Das Pferd frisst kein Reis.');

		assert.ok(config.has('nested'));
		assert.deepStrictEqual(config.get('nested'), { config1: 42, config2: 'Das Pferd frisst kein Reis.' });
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
			},
			'workbench': {
				'colorCustomizations': {
					'statusBar.foreground': 'somevalue'
				}
			}
		});

		let testObject = all.getConfiguration();
		let actual = testObject.get<any>('farboo')!;
		actual['nested']['config1'] = 41;
		assert.strictEqual(41, actual['nested']['config1']);
		actual['farboo1'] = 'newValue';
		assert.strictEqual('newValue', actual['farboo1']);

		testObject = all.getConfiguration();
		actual = testObject.get('farboo')!;
		assert.strictEqual(actual['nested']['config1'], 42);
		assert.strictEqual(actual['farboo1'], undefined);

		testObject = all.getConfiguration();
		actual = testObject.get('farboo')!;
		assert.strictEqual(actual['config0'], true);
		actual['config0'] = false;
		assert.strictEqual(actual['config0'], false);

		testObject = all.getConfiguration();
		actual = testObject.get('farboo')!;
		assert.strictEqual(actual['config0'], true);

		testObject = all.getConfiguration();
		actual = testObject.inspect('farboo')!;
		actual['value'] = 'effectiveValue';
		assert.strictEqual('effectiveValue', actual['value']);

		testObject = all.getConfiguration('workbench');
		actual = testObject.get('colorCustomizations')!;
		actual['statusBar.foreground'] = undefined;
		assert.strictEqual(actual['statusBar.foreground'], undefined);
		testObject = all.getConfiguration('workbench');
		actual = testObject.get('colorCustomizations')!;
		assert.strictEqual(actual['statusBar.foreground'], 'somevalue');
	});

	test('Stringify returned configuration', function () {

		const all = createExtHostConfiguration({
			'farboo': {
				'config0': true,
				'nested': {
					'config1': 42,
					'config2': 'Das Pferd frisst kein Reis.'
				},
				'config4': ''
			},
			'workbench': {
				'colorCustomizations': {
					'statusBar.foreground': 'somevalue'
				},
				'emptyobjectkey': {
				}
			}
		});

		const testObject = all.getConfiguration();
		let actual: any = testObject.get('farboo');
		assert.deepStrictEqual(JSON.stringify({
			'config0': true,
			'nested': {
				'config1': 42,
				'config2': 'Das Pferd frisst kein Reis.'
			},
			'config4': ''
		}), JSON.stringify(actual));

		assert.deepStrictEqual(undefined, JSON.stringify(testObject.get('unknownkey')));

		actual = testObject.get('farboo')!;
		actual['config0'] = false;
		assert.deepStrictEqual(JSON.stringify({
			'config0': false,
			'nested': {
				'config1': 42,
				'config2': 'Das Pferd frisst kein Reis.'
			},
			'config4': ''
		}), JSON.stringify(actual));

		actual = testObject.get<any>('workbench')!['colorCustomizations']!;
		actual['statusBar.background'] = 'anothervalue';
		assert.deepStrictEqual(JSON.stringify({
			'statusBar.foreground': 'somevalue',
			'statusBar.background': 'anothervalue'
		}), JSON.stringify(actual));

		actual = testObject.get('workbench');
		actual['unknownkey'] = 'somevalue';
		assert.deepStrictEqual(JSON.stringify({
			'colorCustomizations': {
				'statusBar.foreground': 'somevalue'
			},
			'emptyobjectkey': {},
			'unknownkey': 'somevalue'
		}), JSON.stringify(actual));

		actual = all.getConfiguration('workbench').get('emptyobjectkey');
		actual = {
			...(actual || {}),
			'statusBar.background': `#0ff`,
			'statusBar.foreground': `#ff0`,
		};
		assert.deepStrictEqual(JSON.stringify({
			'statusBar.background': `#0ff`,
			'statusBar.foreground': `#ff0`,
		}), JSON.stringify(actual));

		actual = all.getConfiguration('workbench').get('unknownkey');
		actual = {
			...(actual || {}),
			'statusBar.background': `#0ff`,
			'statusBar.foreground': `#ff0`,
		};
		assert.deepStrictEqual(JSON.stringify({
			'statusBar.background': `#0ff`,
			'statusBar.foreground': `#ff0`,
		}), JSON.stringify(actual));
	});

	test('cannot modify returned configuration', function () {

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

		const testObject: any = all.getConfiguration();

		try {
			testObject['get'] = null;
			assert.fail('This should be readonly');
		} catch (e) {
		}

		try {
			testObject['farboo']['config0'] = false;
			assert.fail('This should be readonly');
		} catch (e) {
		}

		try {
			testObject['farboo']['farboo1'] = 'hello';
			assert.fail('This should be readonly');
		} catch (e) {
		}
	});

	test('inspect in no workspace context', function () {
		const testObject = new ExtHostConfigProvider(
			new class extends mock<MainThreadConfigurationShape>() { },
			createExtHostWorkspace(),
			{
				defaults: new ConfigurationModel({
					'editor': {
						'wordWrap': 'off',
						'lineNumbers': 'on',
						'fontSize': '12px'
					}
				}, ['editor.wordWrap'], [], undefined, new NullLogService()),
				policy: ConfigurationModel.createEmptyModel(new NullLogService()),
				application: ConfigurationModel.createEmptyModel(new NullLogService()),
				userLocal: new ConfigurationModel({
					'editor': {
						'wordWrap': 'on',
						'lineNumbers': 'off'
					}
				}, ['editor.wordWrap', 'editor.lineNumbers'], [], undefined, new NullLogService()),
				userRemote: new ConfigurationModel({
					'editor': {
						'lineNumbers': 'relative'
					}
				}, ['editor.lineNumbers'], [], {
					'editor': {
						'lineNumbers': 'relative',
						'fontSize': '14px'
					}
				}, new NullLogService()),
				workspace: new ConfigurationModel({}, [], [], undefined, new NullLogService()),
				folders: [],
				configurationScopes: []
			},
			new NullLogService()
		);

		let actual: ConfigurationInspect<string> = testObject.getConfiguration().inspect('editor.wordWrap')!;
		assert.strictEqual(actual.defaultValue, 'off');
		assert.strictEqual(actual.globalLocalValue, 'on');
		assert.strictEqual(actual.globalRemoteValue, undefined);
		assert.strictEqual(actual.globalValue, 'on');
		assert.strictEqual(actual.workspaceValue, undefined);
		assert.strictEqual(actual.workspaceFolderValue, undefined);

		actual = testObject.getConfiguration('editor').inspect('wordWrap')!;
		assert.strictEqual(actual.defaultValue, 'off');
		assert.strictEqual(actual.globalLocalValue, 'on');
		assert.strictEqual(actual.globalRemoteValue, undefined);
		assert.strictEqual(actual.globalValue, 'on');
		assert.strictEqual(actual.workspaceValue, undefined);
		assert.strictEqual(actual.workspaceFolderValue, undefined);

		actual = testObject.getConfiguration('editor').inspect('lineNumbers')!;
		assert.strictEqual(actual.defaultValue, 'on');
		assert.strictEqual(actual.globalLocalValue, 'off');
		assert.strictEqual(actual.globalRemoteValue, 'relative');
		assert.strictEqual(actual.globalValue, 'relative');
		assert.strictEqual(actual.workspaceValue, undefined);
		assert.strictEqual(actual.workspaceFolderValue, undefined);

		assert.strictEqual(testObject.getConfiguration('editor').get('fontSize'), '12px');

		actual = testObject.getConfiguration('editor').inspect('fontSize')!;
		assert.strictEqual(actual.defaultValue, '12px');
		assert.strictEqual(actual.globalLocalValue, undefined);
		assert.strictEqual(actual.globalRemoteValue, '14px');
		assert.strictEqual(actual.globalValue, undefined);
		assert.strictEqual(actual.workspaceValue, undefined);
		assert.strictEqual(actual.workspaceFolderValue, undefined);
	});

	test('inspect in single root context', function () {
		const workspaceUri = URI.file('foo');
		const folders: [UriComponents, IConfigurationModel][] = [];
		const workspace = new ConfigurationModel({
			'editor': {
				'wordWrap': 'bounded'
			}
		}, ['editor.wordWrap'], [], undefined, new NullLogService());
		folders.push([workspaceUri, workspace]);
		const extHostWorkspace = createExtHostWorkspace();
		extHostWorkspace.$initializeWorkspace({
			'id': 'foo',
			'folders': [aWorkspaceFolder(URI.file('foo'), 0)],
			'name': 'foo'
		}, true);
		const testObject = new ExtHostConfigProvider(
			new class extends mock<MainThreadConfigurationShape>() { },
			extHostWorkspace,
			{
				defaults: new ConfigurationModel({
					'editor': {
						'wordWrap': 'off'
					}
				}, ['editor.wordWrap'], [], undefined, new NullLogService()),
				policy: ConfigurationModel.createEmptyModel(new NullLogService()),
				application: ConfigurationModel.createEmptyModel(new NullLogService()),
				userLocal: new ConfigurationModel({
					'editor': {
						'wordWrap': 'on'
					}
				}, ['editor.wordWrap'], [], undefined, new NullLogService()),
				userRemote: ConfigurationModel.createEmptyModel(new NullLogService()),
				workspace,
				folders,
				configurationScopes: []
			},
			new NullLogService()
		);

		let actual1: ConfigurationInspect<string> = testObject.getConfiguration().inspect('editor.wordWrap')!;
		assert.strictEqual(actual1.defaultValue, 'off');
		assert.strictEqual(actual1.globalLocalValue, 'on');
		assert.strictEqual(actual1.globalRemoteValue, undefined);
		assert.strictEqual(actual1.globalValue, 'on');
		assert.strictEqual(actual1.workspaceValue, 'bounded');
		assert.strictEqual(actual1.workspaceFolderValue, undefined);

		actual1 = testObject.getConfiguration('editor').inspect('wordWrap')!;
		assert.strictEqual(actual1.defaultValue, 'off');
		assert.strictEqual(actual1.globalLocalValue, 'on');
		assert.strictEqual(actual1.globalRemoteValue, undefined);
		assert.strictEqual(actual1.globalValue, 'on');
		assert.strictEqual(actual1.workspaceValue, 'bounded');
		assert.strictEqual(actual1.workspaceFolderValue, undefined);

		let actual2: ConfigurationInspect<string> = testObject.getConfiguration(undefined, workspaceUri).inspect('editor.wordWrap')!;
		assert.strictEqual(actual2.defaultValue, 'off');
		assert.strictEqual(actual2.globalLocalValue, 'on');
		assert.strictEqual(actual2.globalRemoteValue, undefined);
		assert.strictEqual(actual2.globalValue, 'on');
		assert.strictEqual(actual2.workspaceValue, 'bounded');
		assert.strictEqual(actual2.workspaceFolderValue, 'bounded');

		actual2 = testObject.getConfiguration('editor', workspaceUri).inspect('wordWrap')!;
		assert.strictEqual(actual2.defaultValue, 'off');
		assert.strictEqual(actual2.globalLocalValue, 'on');
		assert.strictEqual(actual2.globalRemoteValue, undefined);
		assert.strictEqual(actual2.globalValue, 'on');
		assert.strictEqual(actual2.workspaceValue, 'bounded');
		assert.strictEqual(actual2.workspaceFolderValue, 'bounded');
	});

	test('inspect in multi root context', function () {
		const workspace = new ConfigurationModel({
			'editor': {
				'wordWrap': 'bounded'
			}
		}, ['editor.wordWrap'], [], undefined, new NullLogService());

		const firstRoot = URI.file('foo1');
		const secondRoot = URI.file('foo2');
		const thirdRoot = URI.file('foo3');
		const folders: [UriComponents, IConfigurationModel][] = [];
		folders.push([firstRoot, new ConfigurationModel({
			'editor': {
				'wordWrap': 'off',
				'lineNumbers': 'relative'
			}
		}, ['editor.wordWrap'], [], undefined, new NullLogService())]);
		folders.push([secondRoot, new ConfigurationModel({
			'editor': {
				'wordWrap': 'on'
			}
		}, ['editor.wordWrap'], [], undefined, new NullLogService())]);
		folders.push([thirdRoot, new ConfigurationModel({}, [], [], undefined, new NullLogService())]);

		const extHostWorkspace = createExtHostWorkspace();
		extHostWorkspace.$initializeWorkspace({
			'id': 'foo',
			'folders': [aWorkspaceFolder(firstRoot, 0), aWorkspaceFolder(secondRoot, 1)],
			'name': 'foo'
		}, true);
		const testObject = new ExtHostConfigProvider(
			new class extends mock<MainThreadConfigurationShape>() { },
			extHostWorkspace,
			{
				defaults: new ConfigurationModel({
					'editor': {
						'wordWrap': 'off',
						'lineNumbers': 'on'
					}
				}, ['editor.wordWrap'], [], undefined, new NullLogService()),
				policy: ConfigurationModel.createEmptyModel(new NullLogService()),
				application: ConfigurationModel.createEmptyModel(new NullLogService()),
				userLocal: new ConfigurationModel({
					'editor': {
						'wordWrap': 'on'
					}
				}, ['editor.wordWrap'], [], undefined, new NullLogService()),
				userRemote: ConfigurationModel.createEmptyModel(new NullLogService()),
				workspace,
				folders,
				configurationScopes: []
			},
			new NullLogService()
		);

		let actual1: ConfigurationInspect<string> = testObject.getConfiguration().inspect('editor.wordWrap')!;
		assert.strictEqual(actual1.defaultValue, 'off');
		assert.strictEqual(actual1.globalValue, 'on');
		assert.strictEqual(actual1.globalLocalValue, 'on');
		assert.strictEqual(actual1.globalRemoteValue, undefined);
		assert.strictEqual(actual1.workspaceValue, 'bounded');
		assert.strictEqual(actual1.workspaceFolderValue, undefined);

		actual1 = testObject.getConfiguration('editor').inspect('wordWrap')!;
		assert.strictEqual(actual1.defaultValue, 'off');
		assert.strictEqual(actual1.globalValue, 'on');
		assert.strictEqual(actual1.globalLocalValue, 'on');
		assert.strictEqual(actual1.globalRemoteValue, undefined);
		assert.strictEqual(actual1.workspaceValue, 'bounded');
		assert.strictEqual(actual1.workspaceFolderValue, undefined);

		actual1 = testObject.getConfiguration('editor').inspect('lineNumbers')!;
		assert.strictEqual(actual1.defaultValue, 'on');
		assert.strictEqual(actual1.globalValue, undefined);
		assert.strictEqual(actual1.globalLocalValue, undefined);
		assert.strictEqual(actual1.globalRemoteValue, undefined);
		assert.strictEqual(actual1.workspaceValue, undefined);
		assert.strictEqual(actual1.workspaceFolderValue, undefined);

		let actual2: ConfigurationInspect<string> = testObject.getConfiguration(undefined, firstRoot).inspect('editor.wordWrap')!;
		assert.strictEqual(actual2.defaultValue, 'off');
		assert.strictEqual(actual2.globalValue, 'on');
		assert.strictEqual(actual2.globalLocalValue, 'on');
		assert.strictEqual(actual2.globalRemoteValue, undefined);
		assert.strictEqual(actual2.workspaceValue, 'bounded');
		assert.strictEqual(actual2.workspaceFolderValue, 'off');

		actual2 = testObject.getConfiguration('editor', firstRoot).inspect('wordWrap')!;
		assert.strictEqual(actual2.defaultValue, 'off');
		assert.strictEqual(actual2.globalValue, 'on');
		assert.strictEqual(actual2.globalLocalValue, 'on');
		assert.strictEqual(actual2.globalRemoteValue, undefined);
		assert.strictEqual(actual2.workspaceValue, 'bounded');
		assert.strictEqual(actual2.workspaceFolderValue, 'off');

		actual2 = testObject.getConfiguration('editor', firstRoot).inspect('lineNumbers')!;
		assert.strictEqual(actual2.defaultValue, 'on');
		assert.strictEqual(actual2.globalValue, undefined);
		assert.strictEqual(actual2.globalLocalValue, undefined);
		assert.strictEqual(actual2.globalRemoteValue, undefined);
		assert.strictEqual(actual2.workspaceValue, undefined);
		assert.strictEqual(actual2.workspaceFolderValue, 'relative');

		actual2 = testObject.getConfiguration(undefined, secondRoot).inspect('editor.wordWrap')!;
		assert.strictEqual(actual2.defaultValue, 'off');
		assert.strictEqual(actual2.globalValue, 'on');
		assert.strictEqual(actual2.globalLocalValue, 'on');
		assert.strictEqual(actual2.globalRemoteValue, undefined);
		assert.strictEqual(actual2.workspaceValue, 'bounded');
		assert.strictEqual(actual2.workspaceFolderValue, 'on');

		actual2 = testObject.getConfiguration('editor', secondRoot).inspect('wordWrap')!;
		assert.strictEqual(actual2.defaultValue, 'off');
		assert.strictEqual(actual2.globalValue, 'on');
		assert.strictEqual(actual2.globalLocalValue, 'on');
		assert.strictEqual(actual2.globalRemoteValue, undefined);
		assert.strictEqual(actual2.workspaceValue, 'bounded');
		assert.strictEqual(actual2.workspaceFolderValue, 'on');

		actual2 = testObject.getConfiguration(undefined, thirdRoot).inspect('editor.wordWrap')!;
		assert.strictEqual(actual2.defaultValue, 'off');
		assert.strictEqual(actual2.globalValue, 'on');
		assert.strictEqual(actual2.globalLocalValue, 'on');
		assert.strictEqual(actual2.globalRemoteValue, undefined);
		assert.strictEqual(actual2.workspaceValue, 'bounded');
		assert.ok(Object.keys(actual2).indexOf('workspaceFolderValue') !== -1);
		assert.strictEqual(actual2.workspaceFolderValue, undefined);

		actual2 = testObject.getConfiguration('editor', thirdRoot).inspect('wordWrap')!;
		assert.strictEqual(actual2.defaultValue, 'off');
		assert.strictEqual(actual2.globalValue, 'on');
		assert.strictEqual(actual2.globalLocalValue, 'on');
		assert.strictEqual(actual2.globalRemoteValue, undefined);
		assert.strictEqual(actual2.workspaceValue, 'bounded');
		assert.ok(Object.keys(actual2).indexOf('workspaceFolderValue') !== -1);
		assert.strictEqual(actual2.workspaceFolderValue, undefined);
	});

	test('inspect with language overrides', function () {
		const firstRoot = URI.file('foo1');
		const secondRoot = URI.file('foo2');
		const folders: [UriComponents, IConfigurationModel][] = [];
		folders.push([firstRoot, toConfigurationModel({
			'editor.wordWrap': 'bounded',
			'[typescript]': {
				'editor.wordWrap': 'unbounded',
			}
		})]);
		folders.push([secondRoot, toConfigurationModel({})]);

		const extHostWorkspace = createExtHostWorkspace();
		extHostWorkspace.$initializeWorkspace({
			'id': 'foo',
			'folders': [aWorkspaceFolder(firstRoot, 0), aWorkspaceFolder(secondRoot, 1)],
			'name': 'foo'
		}, true);
		const testObject = new ExtHostConfigProvider(
			new class extends mock<MainThreadConfigurationShape>() { },
			extHostWorkspace,
			{
				defaults: toConfigurationModel({
					'editor.wordWrap': 'off',
					'[markdown]': {
						'editor.wordWrap': 'bounded',
					}
				}),
				policy: ConfigurationModel.createEmptyModel(new NullLogService()),
				application: ConfigurationModel.createEmptyModel(new NullLogService()),
				userLocal: toConfigurationModel({
					'editor.wordWrap': 'bounded',
					'[typescript]': {
						'editor.lineNumbers': 'off',
					}
				}),
				userRemote: ConfigurationModel.createEmptyModel(new NullLogService()),
				workspace: toConfigurationModel({
					'[typescript]': {
						'editor.wordWrap': 'unbounded',
						'editor.lineNumbers': 'off',
					}
				}),
				folders,
				configurationScopes: []
			},
			new NullLogService()
		);

		let actual: ConfigurationInspect<string> = testObject.getConfiguration(undefined, { uri: firstRoot, languageId: 'typescript' }).inspect('editor.wordWrap')!;
		assert.strictEqual(actual.defaultValue, 'off');
		assert.strictEqual(actual.globalValue, 'bounded');
		assert.strictEqual(actual.globalLocalValue, 'bounded');
		assert.strictEqual(actual.globalRemoteValue, undefined);
		assert.strictEqual(actual.workspaceValue, undefined);
		assert.strictEqual(actual.workspaceFolderValue, 'bounded');
		assert.strictEqual(actual.defaultLanguageValue, undefined);
		assert.strictEqual(actual.globalLanguageValue, undefined);
		assert.strictEqual(actual.workspaceLanguageValue, 'unbounded');
		assert.strictEqual(actual.workspaceFolderLanguageValue, 'unbounded');
		assert.deepStrictEqual(actual.languageIds, ['markdown', 'typescript']);

		actual = testObject.getConfiguration(undefined, { uri: secondRoot, languageId: 'typescript' }).inspect('editor.wordWrap')!;
		assert.strictEqual(actual.defaultValue, 'off');
		assert.strictEqual(actual.globalValue, 'bounded');
		assert.strictEqual(actual.globalLocalValue, 'bounded');
		assert.strictEqual(actual.globalRemoteValue, undefined);
		assert.strictEqual(actual.workspaceValue, undefined);
		assert.strictEqual(actual.workspaceFolderValue, undefined);
		assert.strictEqual(actual.defaultLanguageValue, undefined);
		assert.strictEqual(actual.globalLanguageValue, undefined);
		assert.strictEqual(actual.workspaceLanguageValue, 'unbounded');
		assert.strictEqual(actual.workspaceFolderLanguageValue, undefined);
		assert.deepStrictEqual(actual.languageIds, ['markdown', 'typescript']);
	});

	test('application is not set in inspect', () => {

		const testObject = new ExtHostConfigProvider(
			new class extends mock<MainThreadConfigurationShape>() { },
			createExtHostWorkspace(),
			{
				defaults: new ConfigurationModel({
					'editor': {
						'wordWrap': 'off',
						'lineNumbers': 'on',
						'fontSize': '12px'
					}
				}, ['editor.wordWrap'], [], undefined, new NullLogService()),
				policy: ConfigurationModel.createEmptyModel(new NullLogService()),
				application: new ConfigurationModel({
					'editor': {
						'wordWrap': 'on'
					}
				}, ['editor.wordWrap'], [], undefined, new NullLogService()),
				userLocal: new ConfigurationModel({
					'editor': {
						'wordWrap': 'auto',
						'lineNumbers': 'off'
					}
				}, ['editor.wordWrap'], [], undefined, new NullLogService()),
				userRemote: ConfigurationModel.createEmptyModel(new NullLogService()),
				workspace: new ConfigurationModel({}, [], [], undefined, new NullLogService()),
				folders: [],
				configurationScopes: []
			},
			new NullLogService()
		);

		let actual: ConfigurationInspect<string> = testObject.getConfiguration().inspect('editor.wordWrap')!;
		assert.strictEqual(actual.defaultValue, 'off');
		assert.strictEqual(actual.globalValue, 'auto');
		assert.strictEqual(actual.globalLocalValue, 'auto');
		assert.strictEqual(actual.globalRemoteValue, undefined);
		assert.strictEqual(actual.workspaceValue, undefined);
		assert.strictEqual(actual.workspaceFolderValue, undefined);
		assert.strictEqual(testObject.getConfiguration().get('editor.wordWrap'), 'auto');

		actual = testObject.getConfiguration().inspect('editor.lineNumbers')!;
		assert.strictEqual(actual.defaultValue, 'on');
		assert.strictEqual(actual.globalValue, 'off');
		assert.strictEqual(actual.globalLocalValue, 'off');
		assert.strictEqual(actual.globalRemoteValue, undefined);
		assert.strictEqual(actual.workspaceValue, undefined);
		assert.strictEqual(actual.workspaceFolderValue, undefined);
		assert.strictEqual(testObject.getConfiguration().get('editor.lineNumbers'), 'off');

		actual = testObject.getConfiguration().inspect('editor.fontSize')!;
		assert.strictEqual(actual.defaultValue, '12px');
		assert.strictEqual(actual.globalLocalValue, undefined);
		assert.strictEqual(actual.globalRemoteValue, undefined);
		assert.strictEqual(actual.globalValue, undefined);
		assert.strictEqual(actual.workspaceValue, undefined);
		assert.strictEqual(actual.workspaceFolderValue, undefined);
		assert.strictEqual(testObject.getConfiguration().get('editor.fontSize'), '12px');
	});

	test('getConfiguration vs get', function () {

		const all = createExtHostConfiguration({
			'farboo': {
				'config0': true,
				'config4': 38
			}
		});

		let config = all.getConfiguration('farboo.config0');
		assert.strictEqual(config.get(''), undefined);
		assert.strictEqual(config.has(''), false);

		config = all.getConfiguration('farboo');
		assert.strictEqual(config.get('config0'), true);
		assert.strictEqual(config.has('config0'), true);
	});

	test('name vs property', function () {
		const all = createExtHostConfiguration({
			'farboo': {
				'get': 'get-prop'
			}
		});
		const config = all.getConfiguration('farboo');

		assert.ok(config.has('get'));
		assert.strictEqual(config.get('get'), 'get-prop');
		assert.deepStrictEqual(config['get'], config.get);
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

		const config = allConfig.getConfiguration('foo');
		config.update('bar', 42);

		assert.strictEqual(shape.lastArgs[0], null);
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

		assert.strictEqual(shape.lastArgs[0], ConfigurationTarget.USER);
		assert.strictEqual(shape.lastArgs[1], 'foo.bar');
		assert.strictEqual(shape.lastArgs[2], 42);

		config = allConfig.getConfiguration('');
		config.update('bar', 42, true);
		assert.strictEqual(shape.lastArgs[1], 'bar');

		config.update('foo.bar', 42, true);
		assert.strictEqual(shape.lastArgs[1], 'foo.bar');
	});

	test('update, what is #15834', function () {
		const shape = new RecordingShape();
		const allConfig = createExtHostConfiguration({
			'editor': {
				'formatOnSave': true
			}
		}, shape);

		allConfig.getConfiguration('editor').update('formatOnSave', { extensions: ['ts'] });
		assert.strictEqual(shape.lastArgs[1], 'editor.formatOnSave');
		assert.deepStrictEqual(shape.lastArgs[2], { extensions: ['ts'] });
	});

	test('update/error-state not OK', function () {

		const shape = new class extends mock<MainThreadConfigurationShape>() {
			override $updateConfigurationOption(target: ConfigurationTarget, key: string, value: any): Promise<any> {
				return Promise.reject(new Error('Unknown Key')); // something !== OK
			}
		};

		return createExtHostConfiguration({}, shape)
			.getConfiguration('')
			.update('', true, false)
			.then(() => assert.ok(false), err => { /* expecting rejection */ });
	});

	test('configuration change event', (done) => {

		const workspaceFolder = aWorkspaceFolder(URI.file('folder1'), 0);
		const extHostWorkspace = createExtHostWorkspace();
		extHostWorkspace.$initializeWorkspace({
			'id': 'foo',
			'folders': [workspaceFolder],
			'name': 'foo'
		}, true);
		const testObject = new ExtHostConfigProvider(
			new class extends mock<MainThreadConfigurationShape>() { },
			extHostWorkspace,
			createConfigurationData({
				'farboo': {
					'config': false,
					'updatedConfig': false
				}
			}),
			new NullLogService()
		);

		const newConfigData = createConfigurationData({
			'farboo': {
				'config': false,
				'updatedConfig': true,
				'newConfig': true,
			}
		});
		const configEventData: IConfigurationChange = { keys: ['farboo.updatedConfig', 'farboo.newConfig'], overrides: [] };
		store.add(testObject.onDidChangeConfiguration(e => {

			assert.deepStrictEqual(testObject.getConfiguration().get('farboo'), {
				'config': false,
				'updatedConfig': true,
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
			assert.ok(e.affectsConfiguration('farboo.newConfig', URI.file('any')));

			assert.ok(!e.affectsConfiguration('farboo.config'));
			assert.ok(!e.affectsConfiguration('farboo.config', workspaceFolder.uri));
			assert.ok(!e.affectsConfiguration('farboo.config', URI.file('any')));
			done();
		}));

		testObject.$acceptConfigurationChanged(newConfigData, configEventData);
	});

	test('get return instance of array value', function () {
		const testObject = createExtHostConfiguration({ 'far': { 'boo': [] } });

		const value: string[] = testObject.getConfiguration().get('far.boo', []);
		value.push('a');

		const actual = testObject.getConfiguration().get('far.boo', []);
		assert.deepStrictEqual(actual, []);
	});

	function aWorkspaceFolder(uri: URI, index: number, name: string = ''): IWorkspaceFolder {
		return new WorkspaceFolder({ uri, name, index });
	}

	function toConfigurationModel(obj: any): ConfigurationModel {
		const parser = new ConfigurationModelParser('test', new NullLogService());
		parser.parse(JSON.stringify(obj));
		return parser.configurationModel;
	}

});
