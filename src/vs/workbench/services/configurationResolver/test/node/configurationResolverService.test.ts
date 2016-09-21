/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert = require('assert');
import uri from 'vs/base/common/uri';
import platform = require('vs/base/common/platform');
import {IConfigurationService, getConfigurationValue} from 'vs/platform/configuration/common/configuration';
import {IConfigurationResolverService} from 'vs/workbench/services/configurationResolver/common/configurationResolver';
import {ConfigurationResolverService} from 'vs/workbench/services/configurationResolver/node/configurationResolverService';
import {TestEnvironmentService, TestConfigurationService, TestEditorService} from 'vs/test/utils/servicesTestUtils';
import {TPromise} from 'vs/base/common/winjs.base';

suite('Configuration Resolver Service', () => {
	let configurationResolverService: IConfigurationResolverService;
	let envVariables: { [key: string]: string } = { key1: 'Value for Key1', key2: 'Value for Key2' };

	setup(() => {
		configurationResolverService = new ConfigurationResolverService(uri.parse('file:///VSCode/workspaceLocation'), envVariables, new TestEditorService(), TestEnvironmentService, new TestConfigurationService());
	});

	teardown(() => {
		configurationResolverService = null;
	});


	test('substitute one', () => {
		if (platform.isWindows) {
			assert.strictEqual(configurationResolverService.resolve('abc ${workspaceRoot} xyz'), 'abc \\VSCode\\workspaceLocation xyz');
		} else {
			assert.strictEqual(configurationResolverService.resolve('abc ${workspaceRoot} xyz'), 'abc /VSCode/workspaceLocation xyz');
		}
	});

	test('substitute many', () => {
		if (platform.isWindows) {
			assert.strictEqual(configurationResolverService.resolve('${workspaceRoot} - ${workspaceRoot}'), '\\VSCode\\workspaceLocation - \\VSCode\\workspaceLocation');
		} else {
			assert.strictEqual(configurationResolverService.resolve('${workspaceRoot} - ${workspaceRoot}'), '/VSCode/workspaceLocation - /VSCode/workspaceLocation');
		}
	});

	test('substitute one env variable', () => {
		if (platform.isWindows) {
			assert.strictEqual(configurationResolverService.resolve('abc ${workspaceRoot} ${env.key1} xyz'), 'abc \\VSCode\\workspaceLocation Value for Key1 xyz');
		} else {
			assert.strictEqual(configurationResolverService.resolve('abc ${workspaceRoot} ${env.key1} xyz'), 'abc /VSCode/workspaceLocation Value for Key1 xyz');
		}
	});

	test('substitute many env variable', () => {
		if (platform.isWindows) {
			assert.strictEqual(configurationResolverService.resolve('${workspaceRoot} - ${workspaceRoot} ${env.key1} - ${env.key2}'), '\\VSCode\\workspaceLocation - \\VSCode\\workspaceLocation Value for Key1 - Value for Key2');
		} else {
			assert.strictEqual(configurationResolverService.resolve('${workspaceRoot} - ${workspaceRoot} ${env.key1} - ${env.key2}'), '/VSCode/workspaceLocation - /VSCode/workspaceLocation Value for Key1 - Value for Key2');
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

		let service = new ConfigurationResolverService(uri.parse('file:///VSCode/workspaceLocation'), envVariables, new TestEditorService(), TestEnvironmentService, configurationService);
		assert.strictEqual(service.resolve('abc ${config.editor.fontFamily} xyz'), 'abc foo xyz');
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

		let service = new ConfigurationResolverService(uri.parse('file:///VSCode/workspaceLocation'), envVariables, new TestEditorService(), TestEnvironmentService, configurationService);
		assert.strictEqual(service.resolve('abc ${config.editor.fontFamily} ${config.terminal.integrated.fontFamily} xyz'), 'abc foo bar xyz');
	});

	test('substitute nested configuration variables', () => {
		let configurationService: IConfigurationService;
		configurationService = new MockConfigurationService({
			editor: {
				fontFamily: 'foo ${workspaceRoot} ${config.terminal.integrated.fontFamily}'
			},
			terminal: {
				integrated: {
					fontFamily: 'bar'
				}
			}
		});

		let service = new ConfigurationResolverService(uri.parse('file:///VSCode/workspaceLocation'), envVariables, new TestEditorService(), TestEnvironmentService, configurationService);
		if (platform.isWindows) {
			assert.strictEqual(service.resolve('abc ${config.editor.fontFamily} ${config.terminal.integrated.fontFamily} xyz'), 'abc foo \\VSCode\\workspaceLocation bar bar xyz');
		} else {
			assert.strictEqual(service.resolve('abc ${config.editor.fontFamily} ${config.terminal.integrated.fontFamily} xyz'), 'abc foo /VSCode/workspaceLocation bar bar xyz');
		}
	});

	test('substitute accidental self referenced configuration variables', () => {
		let configurationService: IConfigurationService;
		configurationService = new MockConfigurationService({
			editor: {
				fontFamily: 'foo ${workspaceRoot} ${config.terminal.integrated.fontFamily} ${config.editor.fontFamily}'
			},
			terminal: {
				integrated: {
					fontFamily: 'bar'
				}
			}
		});

		let service = new ConfigurationResolverService(uri.parse('file:///VSCode/workspaceLocation'), envVariables, new TestEditorService(), TestEnvironmentService, configurationService);
		if (platform.isWindows) {
			assert.strictEqual(service.resolve('abc ${config.editor.fontFamily} ${config.terminal.integrated.fontFamily} xyz'), 'abc foo \\VSCode\\workspaceLocation bar  bar xyz');
		} else {
			assert.strictEqual(service.resolve('abc ${config.editor.fontFamily} ${config.terminal.integrated.fontFamily} xyz'), 'abc foo /VSCode/workspaceLocation bar  bar xyz');
		}
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

		let service = new ConfigurationResolverService(uri.parse('file:///VSCode/workspaceLocation'), envVariables, new TestEditorService(), TestEnvironmentService, configurationService);
		if (platform.isWindows) {
			assert.strictEqual(service.resolve('abc ${config.editor.fontFamily} ${workspaceRoot} ${env.key1} xyz'), 'abc foo \\VSCode\\workspaceLocation Value for Key1 xyz');
		} else {
			assert.strictEqual(service.resolve('abc ${config.editor.fontFamily} ${workspaceRoot} ${env.key1} xyz'), 'abc foo /VSCode/workspaceLocation Value for Key1 xyz');
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

		let service = new ConfigurationResolverService(uri.parse('file:///VSCode/workspaceLocation'), envVariables, new TestEditorService(), TestEnvironmentService, configurationService);
		if (platform.isWindows) {
			assert.strictEqual(service.resolve('${config.editor.fontFamily} ${config.terminal.integrated.fontFamily} ${workspaceRoot} - ${workspaceRoot} ${env.key1} - ${env.key2}'), 'foo bar \\VSCode\\workspaceLocation - \\VSCode\\workspaceLocation Value for Key1 - Value for Key2');
		} else {
			assert.strictEqual(service.resolve('${config.editor.fontFamily} ${config.terminal.integrated.fontFamily} ${workspaceRoot} - ${workspaceRoot} ${env.key1} - ${env.key2}'), 'foo bar /VSCode/workspaceLocation - /VSCode/workspaceLocation Value for Key1 - Value for Key2');
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
							'{{/myfile}}',
							'{{/myOtherfile}}'
						],
						url: '{{schemaURL}}'
					}
				]
			}
		});

		let service = new ConfigurationResolverService(uri.parse('file:///VSCode/workspaceLocation'), envVariables, new TestEditorService(), TestEnvironmentService, configurationService);
		assert.strictEqual(service.resolve('abc ${config.editor.fontFamily} ${config.editor.lineNumbers} ${config.editor.insertSpaces} ${config.json.schemas[0].fileMatch[1]} xyz'), 'abc foo 123 false {{/myOtherfile}} xyz');
	});
});


class MockConfigurationService implements IConfigurationService {
	public _serviceBrand: any;
	public serviceId = IConfigurationService;
	public constructor(private configuration: any = {}) { }
	public reloadConfiguration<T>(section?: string): TPromise<T> { return TPromise.as(this.getConfiguration()); }
	public lookup(key: string) { return { value: getConfigurationValue(this.getConfiguration(), key), default: getConfigurationValue(this.getConfiguration(), key), user: getConfigurationValue(this.getConfiguration(), key) }; }
	public getConfiguration(): any { return this.configuration; }
	public onDidUpdateConfiguration() { return { dispose() { } }; }
}