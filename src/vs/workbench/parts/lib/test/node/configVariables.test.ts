/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as assert from 'assert';
import URI from 'vs/base/common/uri';
import * as Platform from 'vs/base/common/platform';
import {ConfigVariables} from 'vs/workbench/parts/lib/node/configVariables';
import {IConfigurationService, getConfigurationValue} from 'vs/platform/configuration/common/configuration';
import {TestEnvironmentService} from 'vs/test/utils/servicesTestUtils';
import {TPromise} from 'vs/base/common/winjs.base';

suite('ConfigVariables tests', () => {
	test('ConfigVariables: substitute one', () => {
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

		let systemVariables: ConfigVariables = new ConfigVariables(configurationService, null, null, TestEnvironmentService, URI.parse('file:///VSCode/workspaceLocation'));
		assert.strictEqual(systemVariables.resolve('abc ${config.editor.fontFamily} xyz'), 'abc foo xyz');
	});

	test('ConfigVariables: substitute many', () => {
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

		let systemVariables: ConfigVariables = new ConfigVariables(configurationService, null, null, TestEnvironmentService, URI.parse('file:///VSCode/workspaceLocation'));
		assert.strictEqual(systemVariables.resolve('abc ${config.editor.fontFamily} ${config.terminal.integrated.fontFamily} xyz'), 'abc foo bar xyz');
	});
	test('SystemVariables: substitute one env variable', () => {
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

		let envVariables: { [key: string]: string } = { key1: 'Value for Key1', key2: 'Value for Key2' };
		let systemVariables: ConfigVariables = new ConfigVariables(configurationService, null, null, TestEnvironmentService, URI.parse('file:///VSCode/workspaceLocation'), envVariables);
		if (Platform.isWindows) {
			assert.strictEqual(systemVariables.resolve('abc ${config.editor.fontFamily} ${workspaceRoot} ${env.key1} xyz'), 'abc foo \\VSCode\\workspaceLocation Value for Key1 xyz');
		} else {
			assert.strictEqual(systemVariables.resolve('abc ${config.editor.fontFamily} ${workspaceRoot} ${env.key1} xyz'), 'abc foo /VSCode/workspaceLocation Value for Key1 xyz');
		}
	});

	test('SystemVariables: substitute many env variable', () => {
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

		let envVariables: { [key: string]: string } = { key1: 'Value for Key1', key2: 'Value for Key2' };
		let systemVariables: ConfigVariables = new ConfigVariables(configurationService, null, null, TestEnvironmentService, URI.parse('file:///VSCode/workspaceLocation'), envVariables);
		if (Platform.isWindows) {
			assert.strictEqual(systemVariables.resolve('${config.editor.fontFamily} ${config.terminal.integrated.fontFamily} ${workspaceRoot} - ${workspaceRoot} ${env.key1} - ${env.key2}'), 'foo bar \\VSCode\\workspaceLocation - \\VSCode\\workspaceLocation Value for Key1 - Value for Key2');
		} else {
			assert.strictEqual(systemVariables.resolve('${config.editor.fontFamily} ${config.terminal.integrated.fontFamily} ${workspaceRoot} - ${workspaceRoot} ${env.key1} - ${env.key2}'), 'foo bar /VSCode/workspaceLocation - /VSCode/workspaceLocation Value for Key1 - Value for Key2');
		}
	});

	test('ConfigVariables: mixed types', () => {
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

		let systemVariables: ConfigVariables = new ConfigVariables(configurationService, null, null, TestEnvironmentService, URI.parse('file:///VSCode/workspaceLocation'));
		assert.strictEqual(systemVariables.resolve('abc ${config.editor.fontFamily} ${config.editor.lineNumbers} ${config.editor.insertSpaces} ${config.json.schemas[0].fileMatch[1]} xyz'), 'abc foo 123 false {{/myOtherfile}} xyz');
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