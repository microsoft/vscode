/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { strictEqual } from 'assert';
import { timeout } from 'vs/base/common/async';
import { isWindows } from 'vs/base/common/platform';
import { equalsIgnoreCase } from 'vs/base/common/strings';
import { ICodeEditorService } from 'vs/editor/browser/services/codeEditorService';
import { IEditorOptions } from 'vs/editor/common/config/editorOptions';
import { ILanguageFeaturesService } from 'vs/editor/common/services/languageFeatures';
import { LanguageFeaturesService } from 'vs/editor/common/services/languageFeaturesService';
import { TestCodeEditorService } from 'vs/editor/test/browser/editorTestServices';
import { IAccessibilityService } from 'vs/platform/accessibility/common/accessibility';
import { TestAccessibilityService } from 'vs/platform/accessibility/test/common/testAccessibilityService';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { TestConfigurationService } from 'vs/platform/configuration/test/common/testConfigurationService';
import { ContextKeyService } from 'vs/platform/contextkey/browser/contextKeyService';
import { IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { ContextMenuService } from 'vs/platform/contextview/browser/contextMenuService';
import { IContextMenuService } from 'vs/platform/contextview/browser/contextView';
import { TestInstantiationService } from 'vs/platform/instantiation/test/common/instantiationServiceMock';
import { MockContextKeyService } from 'vs/platform/keybinding/test/common/mockKeybindingService';
import { ILogService, NullLogService } from 'vs/platform/log/common/log';
import { IStorageService } from 'vs/platform/storage/common/storage';
import { TerminalCapability } from 'vs/platform/terminal/common/capabilities/capabilities';
import { TerminalCapabilityStore } from 'vs/platform/terminal/common/capabilities/terminalCapabilityStore';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { TestThemeService } from 'vs/platform/theme/test/common/testThemeService';
import { IViewDescriptorService } from 'vs/workbench/common/views';
import { TestViewDescriptorService } from 'vs/workbench/contrib/comments/test/browser/commentsView.test';
import { TerminalConfigHelper } from 'vs/workbench/contrib/terminal/browser/terminalConfigHelper';
import { XtermTerminal } from 'vs/workbench/contrib/terminal/browser/xterm/xtermTerminal';
import { ITerminalConfiguration } from 'vs/workbench/contrib/terminal/common/terminal';
import { BufferContentTracker } from 'vs/workbench/contrib/terminalContrib/accessibility/browser/terminalAccessibleBuffer';
import { ILifecycleService } from 'vs/workbench/services/lifecycle/common/lifecycle';
import { TestLifecycleService } from 'vs/workbench/test/browser/workbenchTestServices';
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
	unicodeVersion: '6'
};

suite('Accessible buffer', () => {
	let instantiationService: TestInstantiationService;
	let configurationService: TestConfigurationService;
	let themeService: TestThemeService;
	let viewDescriptorService: TestViewDescriptorService;
	let xterm: XtermTerminal;
	let capabilities: TerminalCapabilityStore;
	let configHelper: TerminalConfigHelper;
	let bufferTracker: BufferContentTracker;

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
		instantiationService.stub(IAccessibilityService, new TestAccessibilityService());
		instantiationService.stub(IContextKeyService, new ContextKeyService(configurationService));
		instantiationService.stub(ILanguageFeaturesService, new LanguageFeaturesService());
		instantiationService.stub(IViewDescriptorService, viewDescriptorService);
		instantiationService.stub(IContextMenuService, instantiationService.createInstance(ContextMenuService));
		instantiationService.stub(ILifecycleService, new TestLifecycleService());
		instantiationService.stub(ICodeEditorService, new TestCodeEditorService(themeService));
		configHelper = instantiationService.createInstance(TerminalConfigHelper);
		capabilities = new TerminalCapabilityStore();
		if (!isWindows) {
			capabilities.add(TerminalCapability.NaiveCwdDetection, null!);
		}
		xterm = instantiationService.createInstance(XtermTerminal, Terminal, configHelper, 80, 30, { getBackgroundColor: () => undefined }, capabilities, new MockContextKeyService().createKey('', true)!, true);
		const container = document.createElement('div');
		xterm.raw.open(container);
		configurationService = new TestConfigurationService({ terminal: { integrated: { tabs: { separator: ' - ', title: '${cwd}', description: '${cwd}' } } } });
		configHelper = new TerminalConfigHelper(configurationService, null!, null!, null!, null!);
		bufferTracker = instantiationService.createInstance(BufferContentTracker, xterm);

	});
	test('should clear cached lines', async () => {
		strictEqual(bufferTracker.lines.length, 0);
		await writeP(xterm.raw, 'abcd');
		xterm.raw.clear();
		await bufferTracker.update();
		strictEqual(bufferTracker.lines.length, 0);
	});
	test('should render lines in the viewport', async () => {
		strictEqual(bufferTracker.lines.length, 0);
		await writeP(xterm.raw, 'abcd');
		await bufferTracker.update();
		equalsIgnoreCase(xterm.raw.buffer.active.getLine(0)?.translateToString() ?? '', 'abcd');
		strictEqual(bufferTracker.lines.length, 1);
	});
});
async function writeP(terminal: Terminal, data: string): Promise<void> {
	return new Promise<void>((resolve, reject) => {
		const failTimeout = timeout(2000);
		failTimeout.then(() => reject('Writing to xterm is taking longer than 2 seconds'));
		terminal.write(data, () => {
			failTimeout.cancel();
			resolve();
		});
	});
}
