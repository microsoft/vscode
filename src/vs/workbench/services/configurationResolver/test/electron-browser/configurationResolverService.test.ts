/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { URI as uri } from 'vs/base/common/uri';
import * as platform from 'vs/base/common/platform';
import { IConfigurationService, getConfigurationValue, IConfigurationOverrides } from 'vs/platform/configuration/common/configuration';
import { ICommandService } from 'vs/platform/commands/common/commands';
import { IConfigurationResolverService } from 'vs/workbench/services/configurationResolver/common/configurationResolver';
import { ConfigurationResolverService } from 'vs/workbench/services/configurationResolver/electron-browser/configurationResolverService';
import { IWorkspaceFolder } from 'vs/platform/workspace/common/workspace';
import { TestEnvironmentService, TestEditorService, TestContextService } from 'vs/workbench/test/workbenchTestServices';
import { TestConfigurationService } from 'vs/platform/configuration/test/common/testConfigurationService';
import { Disposable } from 'vs/base/common/lifecycle';

suite('Configuration Resolver Service', () => {
	let configurationResolverService: IConfigurationResolverService;
	let envVariables: { [key: string]: string } = { key1: 'Value for key1', key2: 'Value for key2' };
	let mockCommandService: MockCommandService;
	let editorService: TestEditorService;
	let workspace: IWorkspaceFolder;

	setup(() => {
		mockCommandService = new MockCommandService();
		editorService = new TestEditorService();
		workspace = {
			uri: uri.parse('file:///VSCode/workspaceLocation'),
			name: 'hey',
			index: 0,
			toResource: () => null
		};
		configurationResolverService = new ConfigurationResolverService(envVariables, editorService, TestEnvironmentService, new TestConfigurationService(), mockCommandService, new TestContextService());
	});

	teardown(() => {
		configurationResolverService = null;
	});

	test('substitute one', () => {
		if (platform.isWindows) {
			assert.strictEqual(configurationResolverService.resolve(workspace, 'abc ${workspaceFolder} xyz'), 'abc \\VSCode\\workspaceLocation xyz');
		} else {
			assert.strictEqual(configurationResolverService.resolve(workspace, 'abc ${workspaceFolder} xyz'), 'abc /VSCode/workspaceLocation xyz');
		}
	});

	test('workspace root folder name', () => {
		assert.strictEqual(configurationResolverService.resolve(workspace, 'abc ${workspaceRootFolderName} xyz'), 'abc workspaceLocation xyz');
	});

	// TODO@isidor mock the editor service properly
	// test('current selected line number', () => {
	// 	assert.strictEqual(configurationResolverService.resolve(workspace, 'abc ${lineNumber} xyz'), `abc ${editorService.mockLineNumber} xyz`);
	// });

	// test('current selected text', () => {
	// 	assert.strictEqual(configurationResolverService.resolve(workspace, 'abc ${selectedText} xyz'), `abc ${editorService.mockSelectedText} xyz`);
	// });

	test('substitute many', () => {
		if (platform.isWindows) {
			assert.strictEqual(configurationResolverService.resolve(workspace, '${workspaceFolder} - ${workspaceFolder}'), '\\VSCode\\workspaceLocation - \\VSCode\\workspaceLocation');
		} else {
			assert.strictEqual(configurationResolverService.resolve(workspace, '${workspaceFolder} - ${workspaceFolder}'), '/VSCode/workspaceLocation - /VSCode/workspaceLocation');
		}
	});

	test('substitute one env variable', () => {
		if (platform.isWindows) {
			assert.strictEqual(configurationResolverService.resolve(workspace, 'abc ${workspaceFolder} ${env:key1} xyz'), 'abc \\VSCode\\workspaceLocation Value for key1 xyz');
		} else {
			assert.strictEqual(configurationResolverService.resolve(workspace, 'abc ${workspaceFolder} ${env:key1} xyz'), 'abc /VSCode/workspaceLocation Value for key1 xyz');
		}
	});

	test('substitute many env variable', () => {
		if (platform.isWindows) {
			assert.strictEqual(configurationResolverService.resolve(workspace, '${workspaceFolder} - ${workspaceFolder} ${env:key1} - ${env:key2}'), '\\VSCode\\workspaceLocation - \\VSCode\\workspaceLocation Value for key1 - Value for key2');
		} else {
			assert.strictEqual(configurationResolverService.resolve(workspace, '${workspaceFolder} - ${workspaceFolder} ${env:key1} - ${env:key2}'), '/VSCode/workspaceLocation - /VSCode/workspaceLocation Value for key1 - Value for key2');
		}
	});

	// test('substitute keys and values in object', () => {
	// 	const myObject = {
	// 		'${workspaceRootFolderName}': '${lineNumber}',
	// 		'hey ${env:key1} ': '${workspaceRootFolderName}'
	// 	};
	// 	assert.deepEqual(configurationResolverService.resolve(workspace, myObject), {
	// 		'workspaceLocation': `${editorService.mockLineNumber}`,
	// 		'hey Value for key1 ': 'workspaceLocation'
	// 	});
	// });


	test('substitute one env variable using platform case sensitivity', () => {
		if (platform.isWindows) {
			assert.strictEqual(configurationResolverService.resolve(workspace, '${env:key1} - ${env:Key1}'), 'Value for key1 - Value for key1');
		} else {
			assert.strictEqual(configurationResolverService.resolve(workspace, '${env:key1} - ${env:Key1}'), 'Value for key1 - ');
		}
	});

	test('substitute one configuration variable', () => {
		let configurationService: IConfigurationService;
		configurationService = new MockConfigurationService({
			editor: {
				fontFamily: 'foo'
			},
			terminal: {
				integrated: {
					fontFamily: 'bar'
				}
			}
		});

		let service = new ConfigurationResolverService(envVariables, new TestEditorService(), TestEnvironmentService, configurationService, mockCommandService, new TestContextService());
		assert.strictEqual(service.resolve(workspace, 'abc ${config:editor.fontFamily} xyz'), 'abc foo xyz');
	});

	test('substitute many configuration variables', () => {
		let configurationService: IConfigurationService;
		configurationService = new MockConfigurationService({
			editor: {
				fontFamily: 'foo'
			},
			terminal: {
				integrated: {
					fontFamily: 'bar'
				}
			}
		});

		let service = new ConfigurationResolverService(envVariables, new TestEditorService(), TestEnvironmentService, configurationService, mockCommandService, new TestContextService());
		assert.strictEqual(service.resolve(workspace, 'abc ${config:editor.fontFamily} ${config:terminal.integrated.fontFamily} xyz'), 'abc foo bar xyz');
	});

	test('substitute one env variable and a configuration variable', () => {
		let configurationService: IConfigurationService;
		configurationService = new MockConfigurationService({
			editor: {
				fontFamily: 'foo'
			},
			terminal: {
				integrated: {
					fontFamily: 'bar'
				}
			}
		});

		let service = new ConfigurationResolverService(envVariables, new TestEditorService(), TestEnvironmentService, configurationService, mockCommandService, new TestContextService());
		if (platform.isWindows) {
			assert.strictEqual(service.resolve(workspace, 'abc ${config:editor.fontFamily} ${workspaceFolder} ${env:key1} xyz'), 'abc foo \\VSCode\\workspaceLocation Value for key1 xyz');
		} else {
			assert.strictEqual(service.resolve(workspace, 'abc ${config:editor.fontFamily} ${workspaceFolder} ${env:key1} xyz'), 'abc foo /VSCode/workspaceLocation Value for key1 xyz');
		}
	});

	test('substitute many env variable and a configuration variable', () => {
		let configurationService: IConfigurationService;
		configurationService = new MockConfigurationService({
			editor: {
				fontFamily: 'foo'
			},
			terminal: {
				integrated: {
					fontFamily: 'bar'
				}
			}
		});

		let service = new ConfigurationResolverService(envVariables, new TestEditorService(), TestEnvironmentService, configurationService, mockCommandService, new TestContextService());
		if (platform.isWindows) {
			assert.strictEqual(service.resolve(workspace, '${config:editor.fontFamily} ${config:terminal.integrated.fontFamily} ${workspaceFolder} - ${workspaceFolder} ${env:key1} - ${env:key2}'), 'foo bar \\VSCode\\workspaceLocation - \\VSCode\\workspaceLocation Value for key1 - Value for key2');
		} else {
			assert.strictEqual(service.resolve(workspace, '${config:editor.fontFamily} ${config:terminal.integrated.fontFamily} ${workspaceFolder} - ${workspaceFolder} ${env:key1} - ${env:key2}'), 'foo bar /VSCode/workspaceLocation - /VSCode/workspaceLocation Value for key1 - Value for key2');
		}
	});

	test('mixed types of configuration variables', () => {
		let configurationService: IConfigurationService;
		configurationService = new MockConfigurationService({
			editor: {
				fontFamily: 'foo',
				lineNumbers: 123,
				insertSpaces: false
			},
			terminal: {
				integrated: {
					fontFamily: 'bar'
				}
			},
			json: {
				schemas: [
					{
						fileMatch: [
							'/myfile',
							'/myOtherfile'
						],
						url: 'schemaURL'
					}
				]
			}
		});

		let service = new ConfigurationResolverService(envVariables, new TestEditorService(), TestEnvironmentService, configurationService, mockCommandService, new TestContextService());
		assert.strictEqual(service.resolve(workspace, 'abc ${config:editor.fontFamily} ${config:editor.lineNumbers} ${config:editor.insertSpaces} xyz'), 'abc foo 123 false xyz');
	});

	test('uses original variable as fallback', () => {
		let configurationService: IConfigurationService;
		configurationService = new MockConfigurationService({
			editor: {}
		});

		let service = new ConfigurationResolverService(envVariables, new TestEditorService(), TestEnvironmentService, configurationService, mockCommandService, new TestContextService());
		assert.strictEqual(service.resolve(workspace, 'abc ${unknownVariable} xyz'), 'abc ${unknownVariable} xyz');
		assert.strictEqual(service.resolve(workspace, 'abc ${env:unknownVariable} xyz'), 'abc  xyz');
	});

	test('configuration variables with invalid accessor', () => {
		let configurationService: IConfigurationService;
		configurationService = new MockConfigurationService({
			editor: {
				fontFamily: 'foo'
			}
		});

		let service = new ConfigurationResolverService(envVariables, new TestEditorService(), TestEnvironmentService, configurationService, mockCommandService, new TestContextService());

		assert.throws(() => service.resolve(workspace, 'abc ${env} xyz'));
		assert.throws(() => service.resolve(workspace, 'abc ${env:} xyz'));
		assert.throws(() => service.resolve(workspace, 'abc ${config} xyz'));
		assert.throws(() => service.resolve(workspace, 'abc ${config:} xyz'));
		assert.throws(() => service.resolve(workspace, 'abc ${config:editor} xyz'));
		assert.throws(() => service.resolve(workspace, 'abc ${config:editor..fontFamily} xyz'));
		assert.throws(() => service.resolve(workspace, 'abc ${config:editor.none.none2} xyz'));
	});

	test('a single command variable', () => {

		const configuration = {
			'name': 'Attach to Process',
			'type': 'node',
			'request': 'attach',
			'processId': '${command:command1}',
			'port': 5858,
			'sourceMaps': false,
			'outDir': null
		};

		return configurationResolverService.resolveWithCommands(undefined, configuration).then(result => {

			assert.deepEqual(result, {
				'name': 'Attach to Process',
				'type': 'node',
				'request': 'attach',
				'processId': 'command1-result',
				'port': 5858,
				'sourceMaps': false,
				'outDir': null
			});

			assert.equal(1, mockCommandService.callCount);
		});
	});

	test('an old style command variable', () => {
		const configuration = {
			'name': 'Attach to Process',
			'type': 'node',
			'request': 'attach',
			'processId': '${command:commandVariable1}',
			'port': 5858,
			'sourceMaps': false,
			'outDir': null
		};
		const commandVariables = Object.create(null);
		commandVariables['commandVariable1'] = 'command1';

		return configurationResolverService.resolveWithCommands(undefined, configuration, commandVariables).then(result => {

			assert.deepEqual(result, {
				'name': 'Attach to Process',
				'type': 'node',
				'request': 'attach',
				'processId': 'command1-result',
				'port': 5858,
				'sourceMaps': false,
				'outDir': null
			});

			assert.equal(1, mockCommandService.callCount);
		});
	});

	test('multiple new and old-style command variables', () => {

		const configuration = {
			'name': 'Attach to Process',
			'type': 'node',
			'request': 'attach',
			'processId': '${command:commandVariable1}',
			'pid': '${command:command2}',
			'sourceMaps': false,
			'outDir': 'src/${command:command2}',
			'env': {
				'processId': '__${command:command2}__',
			}
		};
		const commandVariables = Object.create(null);
		commandVariables['commandVariable1'] = 'command1';

		return configurationResolverService.resolveWithCommands(undefined, configuration, commandVariables).then(result => {

			assert.deepEqual(result, {
				'name': 'Attach to Process',
				'type': 'node',
				'request': 'attach',
				'processId': 'command1-result',
				'pid': 'command2-result',
				'sourceMaps': false,
				'outDir': 'src/command2-result',
				'env': {
					'processId': '__command2-result__',
				}
			});

			assert.equal(2, mockCommandService.callCount);
		});
	});

	test('a command variable that relies on resolved env vars', () => {

		const configuration = {
			'name': 'Attach to Process',
			'type': 'node',
			'request': 'attach',
			'processId': '${command:commandVariable1}',
			'value': '${env:key1}'
		};
		const commandVariables = Object.create(null);
		commandVariables['commandVariable1'] = 'command1';

		return configurationResolverService.resolveWithCommands(undefined, configuration, commandVariables).then(result => {

			assert.deepEqual(result, {
				'name': 'Attach to Process',
				'type': 'node',
				'request': 'attach',
				'processId': 'Value for key1',
				'value': 'Value for key1'
			});

			assert.equal(1, mockCommandService.callCount);
		});
	});
});


class MockConfigurationService implements IConfigurationService {
	public _serviceBrand: any;
	public serviceId = IConfigurationService;
	public constructor(private configuration: any = {}) { }
	public inspect<T>(key: string, overrides?: IConfigurationOverrides): any { return { value: getConfigurationValue<T>(this.getValue(), key), default: getConfigurationValue<T>(this.getValue(), key), user: getConfigurationValue<T>(this.getValue(), key), workspaceFolder: void 0, folder: void 0 }; }
	public keys() { return { default: [], user: [], workspace: [], workspaceFolder: [] }; }
	public getValue(): any;
	public getValue(value: string): any;
	public getValue(value?: any): any {
		if (!value) {
			return this.configuration;
		}
		const valuePath = (<string>value).split('.');
		let object = this.configuration;
		while (valuePath.length && object) {
			object = object[valuePath.shift()];
		}

		return object;
	}
	public updateValue(): Promise<void> { return null; }
	public getConfigurationData(): any { return null; }
	public onDidChangeConfiguration() { return { dispose() { } }; }
	public reloadConfiguration() { return null; }
}

class MockCommandService implements ICommandService {

	public _serviceBrand: any;
	public callCount = 0;

	onWillExecuteCommand = () => Disposable.None;
	public executeCommand(commandId: string, ...args: any[]): Promise<any> {
		this.callCount++;

		let result = `${commandId}-result`;
		if (args.length >= 1) {
			if (args[0] && args[0].value) {
				result = args[0].value;
			}
		}

		return Promise.resolve(result);
	}
}
