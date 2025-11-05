/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { strictEqual } from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { PosixShellType, WindowsShellType, GeneralShellType } from '../../../../../../platform/terminal/common/terminal.js';
import { isInlineCompletionSupported, SuggestAddon } from '../../browser/terminalSuggestAddon.js';
import { Emitter } from '../../../../../../base/common/event.js';
import type { Terminal as RawXtermTerminal } from '@xterm/xterm';
import { TestInstantiationService } from '../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ITerminalCompletionService } from '../../browser/terminalCompletionService.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IExtensionService } from '../../../../../services/extensions/common/extensions.js';
import { ITerminalConfigurationService } from '../../../../terminal/browser/terminal.js';
import { TerminalCapabilityStore } from '../../../../../../platform/terminal/common/capabilities/terminalCapabilityStore.js';
import { ITerminalLogService } from '../../../../../../platform/terminal/common/terminal.js';

suite('Terminal Suggest Addon - Inline Completion, Shell Type Support', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('should return true for supported shell types', () => {
		strictEqual(isInlineCompletionSupported(PosixShellType.Bash), true);
		strictEqual(isInlineCompletionSupported(PosixShellType.Zsh), true);
		strictEqual(isInlineCompletionSupported(PosixShellType.Fish), true);
		strictEqual(isInlineCompletionSupported(GeneralShellType.PowerShell), true);
		strictEqual(isInlineCompletionSupported(WindowsShellType.GitBash), true);
	});

	test('should return false for unsupported shell types', () => {
		strictEqual(isInlineCompletionSupported(GeneralShellType.NuShell), false);
		strictEqual(isInlineCompletionSupported(GeneralShellType.Julia), false);
		strictEqual(isInlineCompletionSupported(GeneralShellType.Node), false);
		strictEqual(isInlineCompletionSupported(GeneralShellType.Python), false);
		strictEqual(isInlineCompletionSupported(PosixShellType.Sh), false);
		strictEqual(isInlineCompletionSupported(PosixShellType.Csh), false);
		strictEqual(isInlineCompletionSupported(PosixShellType.Ksh), false);
		strictEqual(isInlineCompletionSupported(WindowsShellType.CommandPrompt), false);
		strictEqual(isInlineCompletionSupported(WindowsShellType.Wsl), false);
		strictEqual(isInlineCompletionSupported(GeneralShellType.Python), false);
		strictEqual(isInlineCompletionSupported(undefined), false);
	});
});

suite('Terminal Suggest Addon - Event Handling', () => {
	let instantiationService: TestInstantiationService;
	let configurationService: TestConfigurationService;

	setup(() => {
		instantiationService = new TestInstantiationService();
		configurationService = new TestConfigurationService();
		instantiationService.stub(IConfigurationService, configurationService);
		instantiationService.stub(ITerminalCompletionService, {
			providers: [][Symbol.iterator]()
		} as ITerminalCompletionService);
		instantiationService.stub(IExtensionService, {
			activateByEvent: () => Promise.resolve()
		} as unknown as IExtensionService);
		instantiationService.stub(ITerminalConfigurationService, {} as ITerminalConfigurationService);
		instantiationService.stub(ITerminalLogService, {
			trace: () => { }
		} as unknown as ITerminalLogService);
	});

	ensureNoDisposablesAreLeakedInTestSuite();

	test('should register onResize handler and hide widget on resize', () => {
		const onKeyEmitter = new Emitter<{ key: string }>();
		const onScrollEmitter = new Emitter<number>();
		const onResizeEmitter = new Emitter<{ cols: number; rows: number }>();

		let hideSuggestWidgetCalled = false;

		const mockTerminal = {
			onKey: onKeyEmitter.event,
			onScroll: onScrollEmitter.event,
			onResize: onResizeEmitter.event,
		} as unknown as RawXtermTerminal;

		const capabilities = new TerminalCapabilityStore();
		const addon = instantiationService.createInstance(
			SuggestAddon,
			'test-session',
			PosixShellType.Bash,
			capabilities,
			{
				set: () => { },
				reset: () => { },
				get: () => false
			} as any
		);

		// Override hideSuggestWidget to track if it's called
		const originalHide = addon.hideSuggestWidget.bind(addon);
		addon.hideSuggestWidget = (cancelAnyRequests: boolean) => {
			hideSuggestWidgetCalled = true;
			originalHide(cancelAnyRequests);
		};

		addon.activate(mockTerminal);

		// Trigger resize event
		onResizeEmitter.fire({ cols: 100, rows: 30 });

		strictEqual(hideSuggestWidgetCalled, true, 'hideSuggestWidget should be called when terminal is resized');

		addon.dispose();
		onKeyEmitter.dispose();
		onScrollEmitter.dispose();
		onResizeEmitter.dispose();
	});
});
