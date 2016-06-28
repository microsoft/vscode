/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as assert from 'assert';
import URI from 'vs/base/common/uri';
import * as Platform from 'vs/base/common/platform';
import { ConfigVariables } from 'vs/workbench/parts/lib/node/configVariables';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
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

		let systemVariables: ConfigVariables = new ConfigVariables(configurationService, null, null, URI.parse('file:///VSCode/workspaceLocation'));
		assert.strictEqual(systemVariables.resolve('abc ${settings.editor.fontFamily} xyz'), 'abc foo xyz');
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

		let systemVariables: ConfigVariables = new ConfigVariables(configurationService, null, null, URI.parse('file:///VSCode/workspaceLocation'));
		assert.strictEqual(systemVariables.resolve('abc ${settings.editor.fontFamily} ${settings.terminal.integrated.fontFamily} xyz'), 'abc foo bar xyz');
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
		let systemVariables: ConfigVariables = new ConfigVariables(configurationService, null, null, URI.parse('file:///VSCode/workspaceLocation'), envVariables);
		if (Platform.isWindows) {
			assert.strictEqual(systemVariables.resolve('abc ${settings.editor.fontFamily} ${workspaceRoot} ${env.key1} xyz'), 'abc foo \\VSCode\\workspaceLocation Value for Key1 xyz');
		} else {
			assert.strictEqual(systemVariables.resolve('abc ${settings.editor.fontFamily} ${workspaceRoot} ${env.key1} xyz'), 'abc foo /VSCode/workspaceLocation Value for Key1 xyz');
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
		let systemVariables: ConfigVariables = new ConfigVariables(configurationService, null, null, URI.parse('file:///VSCode/workspaceLocation'), envVariables);
		if (Platform.isWindows) {
			assert.strictEqual(systemVariables.resolve('${settings.editor.fontFamily} ${settings.terminal.integrated.fontFamily} ${workspaceRoot} - ${workspaceRoot} ${env.key1} - ${env.key2}'), 'foo bar \\VSCode\\workspaceLocation - \\VSCode\\workspaceLocation Value for Key1 - Value for Key2');
		} else {
			assert.strictEqual(systemVariables.resolve('${settings.editor.fontFamily} ${settings.terminal.integrated.fontFamily} ${workspaceRoot} - ${workspaceRoot} ${env.key1} - ${env.key2}'), 'foo bar /VSCode/workspaceLocation - /VSCode/workspaceLocation Value for Key1 - Value for Key2');
		}
	});
});

class MockConfigurationService implements IConfigurationService {
	public serviceId = IConfigurationService;
	public constructor(private configuration: any = {}) { }
	public loadConfiguration<T>(section?: string): TPromise<T> { return TPromise.as(this.getConfiguration()); }
	public getConfiguration(): any { return this.configuration; }
	public hasWorkspaceConfiguration(): boolean { return false; }
	public onDidUpdateConfiguration() { return { dispose() { } }; }
	public setUserConfiguration(key: any, value: any): Thenable<void> { return TPromise.as(null); }
}