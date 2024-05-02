/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Test terminalChatHintContribution


import { ok } from 'assert';
import { importAMDNodeModule } from 'vs/amdX';
import { ensureNoDisposablesAreLeakedInTestSuite } from 'vs/base/test/common/utils';
import { IEditorOptions } from 'vs/editor/common/config/editorOptions';
import { TestConfigurationService } from 'vs/platform/configuration/test/common/testConfigurationService';
import { TestInstantiationService } from 'vs/platform/instantiation/test/common/instantiationServiceMock';
import { TerminalCapability } from 'vs/platform/terminal/common/capabilities/capabilities';
import { TerminalCapabilityStore } from 'vs/platform/terminal/common/capabilities/terminalCapabilityStore';
import { IInlineChatService, IInlineChatSessionProvider } from 'vs/workbench/contrib/inlineChat/common/inlineChat';
import { ITerminalInstance, ITerminalService } from 'vs/workbench/contrib/terminal/browser/terminal';
import { TerminalChatHintContribution } from 'vs/workbench/contrib/terminal/browser/terminal.chatHint.contribution';
import { XtermTerminal } from 'vs/workbench/contrib/terminal/browser/xterm/xtermTerminal';
import { ITerminalConfiguration } from 'vs/workbench/contrib/terminal/common/terminal';
import { workbenchInstantiationService } from 'vs/workbench/test/browser/workbenchTestServices';

class TestInlineChatService implements Pick<IInlineChatService, 'getAllProvider' | 'onDidChangeProviders'> {
	providers: IInlineChatSessionProvider[];
	constructor(providers: IInlineChatSessionProvider[]) {
		this.providers = providers;
	}
	getAllProvider(): Iterable<IInlineChatSessionProvider> {
		return this.providers;
	}
	onDidChangeProviders = () => ({ dispose() { } });
}

class TestTerminalService implements Pick<ITerminalService, 'onDidChangeInstances' | 'instances'> {
	constructor(private _instances: Pick<ITerminalInstance, 'capabilities'>[]) { }
	get instances() { return this._instances as ITerminalInstance[]; }
	onDidChangeInstances = () => ({ dispose() { } });
}

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

suite('Workbench - TerminalChatHint', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	let instantiationService: TestInstantiationService;
	let capabilities: TerminalCapabilityStore;
	let xterm: XtermTerminal;
	let terminalChatHintContribution: TerminalChatHintContribution;
	let terminalService: ITerminalService;
	let inlineChatService: IInlineChatService;
	let configurationService: TestConfigurationService;

	function createInstance(): Pick<ITerminalInstance, 'capabilities'> {
		capabilities.add(TerminalCapability.CommandDetection, null!);
		return {
			capabilities
		};
	}

	setup(async () => {
		configurationService = new TestConfigurationService({
			editor: {
				fastScrollSensitivity: 2,
				mouseWheelScrollSensitivity: 1
			} as Partial<IEditorOptions>,
			files: {},
			terminal: {
				integrated: defaultTerminalConfig
			}
		});

		instantiationService = workbenchInstantiationService({
			configurationService: () => configurationService
		}, store);
		capabilities = store.add(new TerminalCapabilityStore());
		const XTermBaseCtor = (await importAMDNodeModule<typeof import('@xterm/xterm')>('@xterm/xterm', 'lib/xterm.js')).Terminal;

		const capabilityStore = store.add(new TerminalCapabilityStore());
		inlineChatService = instantiationService.stub(IInlineChatService, new TestInlineChatService([]));
		terminalService = instantiationService.stub(ITerminalService, new TestTerminalService([createInstance()]));

		xterm = store.add(instantiationService.createInstance(XtermTerminal, XTermBaseCtor, 80, 30, { getBackgroundColor: () => undefined }, capabilityStore, '', true));
		terminalChatHintContribution = store.add(new TerminalChatHintContribution(createInstance(), undefined, undefined, inlineChatService, instantiationService, terminalService));
	});
	test('TerminalChatHint should not show decoration when no provider is registered', () => {
		terminalChatHintContribution.xtermOpen(xterm);
		ok(terminalChatHintContribution.chatHint === undefined);
	});
});
