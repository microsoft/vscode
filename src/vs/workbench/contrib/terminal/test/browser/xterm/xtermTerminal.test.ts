/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Terminal } from 'xterm';
import { XtermTerminal } from 'vs/workbench/contrib/terminal/browser/xterm/xtermTerminal';
import { TerminalConfigHelper } from 'vs/workbench/contrib/terminal/browser/terminalConfigHelper';
import { TestInstantiationService } from 'vs/platform/instantiation/test/common/instantiationServiceMock';
import { ITerminalConfigHelper, ITerminalConfiguration } from 'vs/workbench/contrib/terminal/common/terminal';
import { strictEqual } from 'assert';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { TestConfigurationService } from 'vs/platform/configuration/test/common/testConfigurationService';
import { TestThemeService } from 'vs/platform/theme/test/common/testThemeService';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { IViewDescriptor, IViewDescriptorService, ViewContainerLocation } from 'vs/workbench/common/views';
import { IEditorOptions } from 'vs/editor/common/config/editorOptions';
import { Emitter } from 'vs/base/common/event';

// async function writeP(terminal: XtermTerminal, data: string): Promise<void> {
// 	return new Promise<void>(r => terminal.raw.write(data, r));
// }

class TestViewDescriptorService implements Partial<IViewDescriptorService> {
	onDidChangeLocation = new Emitter<{ views: IViewDescriptor[], from: ViewContainerLocation, to: ViewContainerLocation }>().event;
	getViewLocationById(id: string): ViewContainerLocation | null {
		return ViewContainerLocation.Panel;
	}
}

suite.only('LineDataEventAddon', () => {
	let instantiationService: TestInstantiationService;
	let configurationService: TestConfigurationService;

	let xterm: XtermTerminal;
	let configHelper: ITerminalConfigHelper;

	setup(() => {
		configurationService = new TestConfigurationService({
			editor: {
				fastScrollSensitivity: 2,
				mouseWheelScrollSensitivity: 1
			} as Partial<IEditorOptions>,
			terminal: {
				integrated: {
					fontFamily: 'monospace',
					fontWeight: 'normal',
					fontWeightBold: 'normal',
					scrollback: 1000
				} as Partial<ITerminalConfiguration>
			}
		});

		instantiationService = new TestInstantiationService();
		instantiationService.stub(IConfigurationService, configurationService);
		instantiationService.stub(IThemeService, new TestThemeService());
		instantiationService.stub(IViewDescriptorService, new TestViewDescriptorService());

		configHelper = instantiationService.createInstance(TerminalConfigHelper);
	});

	test('should use fallback dimensions of 80x30', () => {
		xterm = instantiationService.createInstance(XtermTerminal, Terminal, configHelper);
		strictEqual(xterm.raw.getOption('cols'), 80);
		strictEqual(xterm.raw.getOption('rows'), 30);
	});
});
