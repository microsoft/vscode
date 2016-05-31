/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as assert from 'assert';
import Event from 'vs/base/common/event';
import {IConfigurationService} from 'vs/platform/configuration/common/configuration';
import {IThemeData} from 'vs/workbench/services/themes/common/themeService';
import {IThemeService} from 'vs/workbench/services/themes/common/themeService';
import {Platform} from 'vs/base/common/platform';
import {ServiceIdentifier} from 'vs/platform/instantiation/common/instantiation';
import {TPromise} from 'vs/base/common/winjs.base';
import {TerminalConfigHelper} from 'vs/workbench/parts/terminal/electron-browser/terminalConfigHelper';


class MockConfigurationService implements IConfigurationService {
	public serviceId = IConfigurationService;
	public constructor(private configuration: any = {}) {}
	public loadConfiguration<T>(section?: string): TPromise<T> { return TPromise.as(this.getConfiguration()); }
	public getConfiguration(): any { return this.configuration; }
	public hasWorkspaceConfiguration(): boolean { return false; }
	public onDidUpdateConfiguration() { return { dispose() { } }; }
	public setUserConfiguration(key: any, value: any): Thenable<void> { return TPromise.as(null); }
}

class MockThemeService implements IThemeService {
	public constructor(private activeTheme: string = undefined) {}
	public serviceId: ServiceIdentifier<any>;
	public setTheme(themeId: string, broadcastToAllWindows: boolean): TPromise<boolean> { return null; }
	public getTheme(): string { return this.activeTheme; }
	public getThemes(): TPromise<IThemeData[]> { return null; }
	public onDidThemeChange: Event<string>;
}

suite('Workbench - TerminalConfigHelper', () => {
	test('TerminalConfigHelper - getFontFamily', function () {
		let themeService: IThemeService = new MockThemeService();
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
		configHelper = new TerminalConfigHelper(Platform.Linux, configurationService, themeService);
		assert.equal(configHelper.getFontFamily(), 'bar', 'terminal.integrated.fontFamily should be selected over editor.fontFamily');

		configurationService = new MockConfigurationService({
			editor: {
				fontFamily: 'foo'
			},
			terminal: {
				integrated: {
					fontFamily: undefined
				}
			}
		});
		configHelper = new TerminalConfigHelper(Platform.Linux, configurationService, themeService);
		assert.equal(configHelper.getFontFamily(), 'foo', 'editor.fontFamily should be the fallback when terminal.integrated.fontFamily not set');
	});

	test('TerminalConfigHelper - getShell', function () {
		let themeService: IThemeService = new MockThemeService();
		let configurationService: IConfigurationService;
		let configHelper: TerminalConfigHelper;

		configurationService = new MockConfigurationService({
			terminal: {
				integrated: {
					shell: {
						linux: 'foo'
					}
				}
			}
		});
		configHelper = new TerminalConfigHelper(Platform.Linux, configurationService, themeService);
		assert.equal(configHelper.getShell(), 'foo', 'terminal.integrated.shell.linux should be selected on Linux');

		configurationService = new MockConfigurationService({
			terminal: {
				integrated: {
					shell: {
						osx: 'foo'
					}
				}
			}
		});
		configHelper = new TerminalConfigHelper(Platform.Mac, configurationService, themeService);
		assert.equal(configHelper.getShell(), 'foo', 'terminal.integrated.shell.osx should be selected on OS X');

		configurationService = new MockConfigurationService({
			terminal: {
				integrated: {
					shell: {
						windows: 'foo'
					}
				}
			}
		});
		configHelper = new TerminalConfigHelper(Platform.Windows, configurationService, themeService);
		assert.equal(configHelper.getShell(), 'foo', 'terminal.integrated.shell.windows should be selected on Windows');
	});

	test('TerminalConfigHelper - getTheme', function () {
		let configurationService: IConfigurationService = new MockConfigurationService();
		let themeService: IThemeService;
		let configHelper: TerminalConfigHelper;

		themeService = new MockThemeService('hc-black foo');
		configHelper = new TerminalConfigHelper(Platform.Linux, configurationService, themeService);
		assert.deepEqual(configHelper.getTheme(), [
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

		themeService = new MockThemeService('vs foo');
		configHelper = new TerminalConfigHelper(Platform.Linux, configurationService, themeService);
		assert.deepEqual(configHelper.getTheme(), [
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

		themeService = new MockThemeService('vs-dark foo');
		configHelper = new TerminalConfigHelper(Platform.Linux, configurationService, themeService);
		assert.deepEqual(configHelper.getTheme(), [
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