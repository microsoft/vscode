/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Test TerminalInitialHintContribution

import { strictEqual } from 'assert';
import { importAMDNodeModule } from 'vs/amdX';
import { CancellationToken } from 'vs/base/common/cancellation';
import { ensureNoDisposablesAreLeakedInTestSuite } from 'vs/base/test/common/utils';
import { IEditorOptions } from 'vs/editor/common/config/editorOptions';
import { ISelection } from 'vs/editor/common/core/selection';
import { ITextModel } from 'vs/editor/common/model';
import { TestConfigurationService } from 'vs/platform/configuration/test/common/testConfigurationService';
import { IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { ExtensionIdentifier } from 'vs/platform/extensions/common/extensions';
import { TestInstantiationService } from 'vs/platform/instantiation/test/common/instantiationServiceMock';
import { MockContextKeyService } from 'vs/platform/keybinding/test/common/mockKeybindingService';
import { TerminalCapability } from 'vs/platform/terminal/common/capabilities/capabilities';
import { TerminalCapabilityStore } from 'vs/platform/terminal/common/capabilities/terminalCapabilityStore';
import { IInlineChatService, IInlineChatSession, IInlineChatSessionProvider } from 'vs/workbench/contrib/inlineChat/common/inlineChat';
import { InlineChatServiceImpl } from 'vs/workbench/contrib/inlineChat/common/inlineChatServiceImpl';
import { ITerminalInstance, ITerminalService } from 'vs/workbench/contrib/terminal/browser/terminal';
import { TerminalInitialHintContribution } from 'vs/workbench/contrib/terminalContrib/chat/browser/terminal.initialHint.contribution';
import { XtermTerminal } from 'vs/workbench/contrib/terminal/browser/xterm/xtermTerminal';
import { ITerminalConfiguration } from 'vs/workbench/contrib/terminal/common/terminal';
import { workbenchInstantiationService } from 'vs/workbench/test/browser/workbenchTestServices';

class TestInlineChatService extends InlineChatServiceImpl {
	private _providers: IInlineChatSessionProvider[] = [];
	constructor(contextKeyService: IContextKeyService, providers: IInlineChatSessionProvider[]) {
		super(contextKeyService);
		this._providers = providers;
	}
	override getAllProvider(): IInlineChatSessionProvider[] {
		return this._providers;
	}
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

suite('Workbench - TerminalInitialHint', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	let instantiationService: TestInstantiationService;
	let capabilities: TerminalCapabilityStore;
	let xterm: XtermTerminal;
	let terminalInitialHintContribution: TerminalInitialHintContribution;
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
		inlineChatService = instantiationService.stub(IInlineChatService, new TestInlineChatService(new MockContextKeyService(), []));
		terminalService = instantiationService.stub(ITerminalService, new TestTerminalService([createInstance()]));

		xterm = store.add(instantiationService.createInstance(XtermTerminal, XTermBaseCtor, 80, 30, { getBackgroundColor: () => undefined }, capabilityStore, '', true));
		terminalInitialHintContribution = store.add(new TerminalInitialHintContribution(createInstance(), undefined, undefined, inlineChatService, instantiationService, terminalService));
	});
	test('TerminalInitialHint should not show decoration when no provider is registered', () => {
		terminalInitialHintContribution.xtermOpen(xterm);
		strictEqual(terminalInitialHintContribution.decoration, undefined);
	});
	test('TerminalInitialHint should not show decoration when provider is registered but no terminal has been created', () => {
		terminalInitialHintContribution.xtermOpen(xterm);
		store.add(inlineChatService.addProvider({
			extensionId: new ExtensionIdentifier('test'),
			label: 'blahblah',
			prepareInlineChatSession(model: ITextModel, range: ISelection, token: CancellationToken): Promise<IInlineChatSession> {
				throw new Error('Method not implemented.');
			},
			provideResponse() {
				throw new Error('Method not implemented.');
			}
		}));
		strictEqual(terminalInitialHintContribution.decoration, undefined);
	});
});
