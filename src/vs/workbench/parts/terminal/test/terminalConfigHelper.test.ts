/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as assert from 'assert';
import {Builder} from 'vs/base/browser/builder';
import {IConfigurationService} from 'vs/platform/configuration/common/configuration';
import {Platform} from 'vs/base/common/platform';
import {TPromise} from 'vs/base/common/winjs.base';
import {TerminalConfigHelper} from 'vs/workbench/parts/terminal/electron-browser/terminalConfigHelper';


class MockConfigurationService implements IConfigurationService {
	public _serviceBrand: any;
	public constructor(private configuration: any = {}) {}
	public loadConfiguration<T>(section?: string): TPromise<T> { return TPromise.as(this.getConfiguration()); }
	public getConfiguration(): any { return this.configuration; }
	public hasWorkspaceConfiguration(): boolean { return false; }
	public onDidUpdateConfiguration() { return { dispose() { } }; }
	public setUserConfiguration(key: any, value: any): Thenable<void> { return TPromise.as(null); }
}

suite('Workbench - TerminalConfigHelper', () => {
	let fixture: Builder;

	setup(() => {
		fixture = new Builder(document.body, false);
	});

	test('TerminalConfigHelper - getFont', function () {
		let configurationService: IConfigurationService;
		let configHelper: TerminalConfigHelper;

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
		configHelper = new TerminalConfigHelper(Platform.Linux, configurationService, fixture);
		assert.equal(configHelper.getFont().fontFamily, 'bar', 'terminal.integrated.fontFamily should be selected over editor.fontFamily');

		configurationService = new MockConfigurationService({
			editor: {
				fontFamily: 'foo'
			},
			terminal: {
				integrated: {
					fontFamily: 0
				}
			}
		});
		configHelper = new TerminalConfigHelper(Platform.Linux, configurationService, fixture);
		assert.equal(configHelper.getFont().fontFamily, 'foo', 'editor.fontFamily should be the fallback when terminal.integrated.fontFamily not set');

		configurationService = new MockConfigurationService({
			editor: {
				fontFamily: 'foo',
				fontSize: 1
			},
			terminal: {
				integrated: {
					fontFamily: 'bar',
					fontSize: 2
				}
			}
		});
		configHelper = new TerminalConfigHelper(Platform.Linux, configurationService, fixture);
		assert.equal(configHelper.getFont().fontSize, '2px', 'terminal.integrated.fontSize should be selected over editor.fontSize');

		configurationService = new MockConfigurationService({
			editor: {
				fontFamily: 'foo',
				fontSize: 1
			},
			terminal: {
				integrated: {
					fontFamily: 0,
					fontSize: 0
				}
			}
		});
		configHelper = new TerminalConfigHelper(Platform.Linux, configurationService, fixture);
		assert.equal(configHelper.getFont().fontSize, '1px', 'editor.fontSize should be the fallback when terminal.integrated.fontSize not set');

		configurationService = new MockConfigurationService({
			editor: {
				fontFamily: 'foo',
				lineHeight: 1
			},
			terminal: {
				integrated: {
					fontFamily: 0,
					lineHeight: 2
				}
			}
		});
		configHelper = new TerminalConfigHelper(Platform.Linux, configurationService, fixture);
		assert.equal(configHelper.getFont().lineHeight, '2px', 'terminal.integrated.lineHeight should be selected over editor.lineHeight');

		configurationService = new MockConfigurationService({
			editor: {
				fontFamily: 'foo',
				lineHeight: 1
			},
			terminal: {
				integrated: {
					fontFamily: 0,
					lineHeight: 0
				}
			}
		});
		configHelper = new TerminalConfigHelper(Platform.Linux, configurationService, fixture);
		assert.equal(configHelper.getFont().lineHeight, 'normal', 'editor.lineHeight should be "normal" when terminal.integrated.lineHeight not set');
	});

	test('TerminalConfigHelper - getShell', function () {
		let configurationService: IConfigurationService;
		let configHelper: TerminalConfigHelper;

		configurationService = new MockConfigurationService({
			terminal: {
				integrated: {
					shell: {
						linux: 'foo'
					},
					shellArgs: {
						linux: []
					}
				}
			}
		});
		configHelper = new TerminalConfigHelper(Platform.Linux, configurationService, fixture);
		assert.equal(configHelper.getShell().executable, 'foo', 'terminal.integrated.shell.linux should be selected on Linux');

		configurationService = new MockConfigurationService({
			terminal: {
				integrated: {
					shell: {
						osx: 'foo'
					},
					shellArgs: {
						osx: []
					}
				}
			}
		});
		configHelper = new TerminalConfigHelper(Platform.Mac, configurationService, fixture);
		assert.equal(configHelper.getShell().executable, 'foo', 'terminal.integrated.shell.osx should be selected on OS X');

		configurationService = new MockConfigurationService({
			terminal: {
				integrated: {
					shell: {
						windows: 'foo'
					}
				}
			}
		});
		configHelper = new TerminalConfigHelper(Platform.Windows, configurationService, fixture);
		assert.equal(configHelper.getShell().executable, 'foo', 'terminal.integrated.shell.windows should be selected on Windows');
	});

	test('TerminalConfigHelper - getTheme', function () {
		let configurationService: IConfigurationService = new MockConfigurationService();
		let configHelper: TerminalConfigHelper;

		configHelper = new TerminalConfigHelper(Platform.Linux, configurationService, fixture);
		assert.deepEqual(configHelper.getTheme('hc-black'), [
			'#000000',
			'#cd0000',
			'#00cd00',
			'#cdcd00',
			'#0000ee',
			'#cd00cd',
			'#00cdcd',
			'#e5e5e5',
			'#7f7f7f',
			'#ff0000',
			'#00ff00',
			'#ffff00',
			'#5c5cff',
			'#ff00ff',
			'#00ffff',
			'#ffffff'
		], 'The high contrast terminal theme should be selected when the hc-black theme is active');

		configHelper = new TerminalConfigHelper(Platform.Linux, configurationService, fixture);
		assert.deepEqual(configHelper.getTheme('vs'), [
			'#000000',
			'#cd3131',
			'#008000',
			'#949800',
			'#0451a5',
			'#bc05bc',
			'#0598bc',
			'#555555',
			'#666666',
			'#cd3131',
			'#00aa00',
			'#b5ba00',
			'#0451a5',
			'#bc05bc',
			'#0598bc',
			'#a5a5a5'
		], 'The light terminal theme should be selected when a vs theme is active');

		configHelper = new TerminalConfigHelper(Platform.Linux, configurationService, fixture);
		assert.deepEqual(configHelper.getTheme('vs-dark'), [
			'#000000',
			'#cd3131',
			'#09885a',
			'#e5e510',
			'#2472c8',
			'#bc3fbc',
			'#11a8cd',
			'#e5e5e5',
			'#666666',
			'#f14c4c',
			'#17a773',
			'#f5f543',
			'#3b8eea',
			'#d670d6',
			'#29b8db',
			'#e5e5e5'
		], 'The dark terminal theme should be selected when a vs-dark theme is active');
	});
});