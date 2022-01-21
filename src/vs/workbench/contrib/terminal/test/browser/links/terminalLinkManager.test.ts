/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { strictEqual, deepStrictEqual } from 'assert';
import { equals } from 'vs/base/common/arrays';
import { IEditorOptions } from 'vs/editor/common/config/editorOptions';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { TestConfigurationService } from 'vs/platform/configuration/test/common/testConfigurationService';
import { TestInstantiationService } from 'vs/platform/instantiation/test/common/instantiationServiceMock';
import { ILogService, NullLogService } from 'vs/platform/log/common/log';
import { IStorageService } from 'vs/platform/storage/common/storage';
import { TerminalLocation } from 'vs/platform/terminal/common/terminal';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { TestThemeService } from 'vs/platform/theme/test/common/testThemeService';
import { IViewDescriptorService } from 'vs/workbench/common/views';
import { IDetectedLinks, TerminalLinkManager } from 'vs/workbench/contrib/terminal/browser/links/terminalLinkManager';
import { TerminalConfigHelper } from 'vs/workbench/contrib/terminal/browser/terminalConfigHelper';
import { XtermTerminal } from 'vs/workbench/contrib/terminal/browser/xterm/xtermTerminal';
import { ITerminalCapabilityStore } from 'vs/workbench/contrib/terminal/common/capabilities/capabilities';
import { ITerminalConfigHelper, ITerminalConfiguration, ITerminalProcessManager } from 'vs/workbench/contrib/terminal/common/terminal';
import { TestViewDescriptorService } from 'vs/workbench/contrib/terminal/test/browser/xterm/xtermTerminal.test';
import { TestStorageService } from 'vs/workbench/test/common/workbenchTestServices';
import { Terminal } from 'xterm';

const defaultTerminalConfig: Partial<ITerminalConfiguration> = {
	fontFamily: 'monospace',
	fontWeight: 'normal',
	fontWeightBold: 'normal',
	gpuAcceleration: 'off',
	scrollback: 1000,
	fastScrollSensitivity: 2,
	mouseWheelScrollSensitivity: 1,
	unicodeVersion: '11'
};

suite('TerminalLinkManager', () => {
	let instantiationService: TestInstantiationService;
	let configurationService: TestConfigurationService;
	let themeService: TestThemeService;
	let viewDescriptorService: TestViewDescriptorService;
	let xterm: XtermTerminal;
	let configHelper: ITerminalConfigHelper;
	let linkManager: TerminalLinkManager;

	setup(() => {
		configurationService = new TestConfigurationService({
			editor: {
				fastScrollSensitivity: 2,
				mouseWheelScrollSensitivity: 1
			} as Partial<IEditorOptions>,
			terminal: {
				integrated: defaultTerminalConfig
			}
		});
		themeService = new TestThemeService();
		viewDescriptorService = new TestViewDescriptorService();

		instantiationService = new TestInstantiationService();
		instantiationService.stub(IConfigurationService, configurationService);
		instantiationService.stub(ILogService, new NullLogService());
		instantiationService.stub(IStorageService, new TestStorageService());
		instantiationService.stub(IThemeService, themeService);
		instantiationService.stub(IViewDescriptorService, viewDescriptorService);

		configHelper = instantiationService.createInstance(TerminalConfigHelper);
		xterm = instantiationService.createInstance(XtermTerminal, Terminal, configHelper, 80, 30, TerminalLocation.Panel);
		linkManager = instantiationService.createInstance(TerminalLinkManager, xterm, upcastPartial<ITerminalProcessManager>({}), upcastPartial<ITerminalCapabilityStore>({}));
	});


	suite.only('getLinks and open recent link', async () => {
		test('should return no links', async () => {
			xterm.raw.write('');
			const links = await linkManager.getLinks();
			equals(links.webLinks, []);
			equals(links.wordLinks, []);
			equals(links.fileLinks, []);
			const webLink = await linkManager.openRecentLink('web');
			strictEqual(webLink, undefined);
			const fileLink = await linkManager.openRecentLink('file');
			strictEqual(fileLink, undefined);
		});
		test('should return word links in order', async () => {
			xterm.raw.writeln('1_我是学生.txt');
			xterm.raw.writeln('2_我是学生.txt');
			const link1 = {
				range: {
					start: { x: 1, y: 1 }, end: { x: 14, y: 1 }
				},
				text: '1_我是学生.txt',
				activate: () => Promise.resolve('')
			};
			const link2 = {
				range: {
					start: { x: 1, y: 1 }, end: { x: 14, y: 1 }
				},
				text: '2_我是学生.txt',
				activate: () => Promise.resolve('')
			};
			const links = await linkManager.getLinks();
			deepStrictEqual(links, { webLinks: [], wordLinks: [link2, link1], fileLinks: [] });
			const webLink = await linkManager.openRecentLink('web');
			strictEqual(webLink, undefined);
			const fileLink = await linkManager.openRecentLink('file');
			strictEqual(fileLink, undefined);
		});
		test('should return web links in order', async () => {
			const link1 = {
				range: { start: { x: 5, y: 1 }, end: { x: 40, y: 1 } },
				text: 'https://foo.bar/[this is foo site 1]',
				activate: () => Promise.resolve('')
			};
			const link2 = {
				range: { start: { x: 5, y: 2 }, end: { x: 40, y: 2 } },
				text: 'https://foo.bar/[this is foo site 2]',
				activate: () => Promise.resolve('')
			};
			const links = await linkManager.getLinks();
			deepStrictEqual(links, { webLinks: [link2, link1], wordLinks: [], fileLinks: [] });
			const webLink = await linkManager.openRecentLink('web');
			strictEqual(webLink, link2);
			const fileLink = await linkManager.openRecentLink('file');
			strictEqual(fileLink, undefined);
		});
		test('should return file links in order', async () => {
			const link1 = {
				range: { start: { x: 1, y: 1 }, end: { x: 32, y: 1 } },
				text: 'file:///C:/users/test/file_1.txt',
				activate: () => Promise.resolve('')
			};
			const link2 = {
				range: { start: { x: 1, y: 2 }, end: { x: 32, y: 2 } },
				text: 'file:///C:/users/test/file_2.txt',
				activate: () => Promise.resolve('')
			};
			const links = await linkManager.getLinks();
			deepStrictEqual(links, { webLinks: [], wordLinks: [], fileLinks: [link2, link1] });
			const webLink = await linkManager.openRecentLink('web');
			strictEqual(webLink, undefined);
			const fileLink = await linkManager.openRecentLink('file');
			strictEqual(fileLink, link2);
		});
	});
});
function upcastPartial<T>(v: Partial<T>): T {
	return v as T;
}
