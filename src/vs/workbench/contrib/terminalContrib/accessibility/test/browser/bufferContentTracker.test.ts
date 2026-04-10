/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { importAMDNodeModule } from '../../../../../../amdX.js';
import { isWindows } from '../../../../../../base/common/platform.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IContextKeyService } from '../../../../../../platform/contextkey/common/contextkey.js';
import { ContextMenuService } from '../../../../../../platform/contextview/browser/contextMenuService.js';
import { IContextMenuService } from '../../../../../../platform/contextview/browser/contextView.js';
import { TestInstantiationService } from '../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { MockContextKeyService } from '../../../../../../platform/keybinding/test/common/mockKeybindingService.js';
import { ILayoutService } from '../../../../../../platform/layout/browser/layoutService.js';
import { ILoggerService, NullLogService } from '../../../../../../platform/log/common/log.js';
import { TerminalCapability } from '../../../../../../platform/terminal/common/capabilities/capabilities.js';
import { TerminalCapabilityStore } from '../../../../../../platform/terminal/common/capabilities/terminalCapabilityStore.js';
import { ITerminalLogService } from '../../../../../../platform/terminal/common/terminal.js';
import { IThemeService } from '../../../../../../platform/theme/common/themeService.js';
import { TestThemeService } from '../../../../../../platform/theme/test/common/testThemeService.js';
import { writeP } from '../../../../terminal/browser/terminalTestHelpers.js';
import { XtermTerminal } from '../../../../terminal/browser/xterm/xtermTerminal.js';
import { ITerminalConfiguration } from '../../../../terminal/common/terminal.js';
import { BufferContentTracker } from '../../browser/bufferContentTracker.js';
import { ILifecycleService } from '../../../../../services/lifecycle/common/lifecycle.js';
import { TestLayoutService, TestLifecycleService } from '../../../../../test/browser/workbenchTestServices.js';
import { TestLoggerService } from '../../../../../test/common/workbenchTestServices.js';
import type { Terminal } from '@xterm/xterm';
import { IAccessibilitySignalService } from '../../../../../../platform/accessibilitySignal/browser/accessibilitySignalService.js';
import { ITerminalConfigurationService } from '../../../../terminal/browser/terminal.js';
import { TerminalConfigurationService } from '../../../../terminal/browser/terminalConfigurationService.js';

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

suite('Buffer Content Tracker', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	let instantiationService: TestInstantiationService;
	let configurationService: TestConfigurationService;
	let themeService: TestThemeService;
	let xterm: XtermTerminal;
	let capabilities: TerminalCapabilityStore;
	let bufferTracker: BufferContentTracker;
	const prompt = 'vscode-git:(prompt/more-tests)';
	const promptPlusData = 'vscode-git:(prompt/more-tests) ' + 'some data';

	setup(async () => {
		configurationService = new TestConfigurationService({ terminal: { integrated: defaultTerminalConfig } });
		instantiationService = store.add(new TestInstantiationService());
		themeService = new TestThemeService();
		instantiationService.stub(IConfigurationService, configurationService);
		instantiationService.stub(ITerminalConfigurationService, store.add(instantiationService.createInstance(TerminalConfigurationService)));
		instantiationService.stub(IThemeService, themeService);
		instantiationService.stub(ITerminalLogService, new NullLogService());
		instantiationService.stub(ILoggerService, store.add(new TestLoggerService()));
		instantiationService.stub(IContextMenuService, store.add(instantiationService.createInstance(ContextMenuService)));
		instantiationService.stub(ILifecycleService, store.add(new TestLifecycleService()));
		instantiationService.stub(IContextKeyService, store.add(new MockContextKeyService()));
		// eslint-disable-next-line local/code-no-any-casts
		instantiationService.stub(IAccessibilitySignalService, {
			playSignal: async () => { },
			isSoundEnabled(signal: unknown) { return false; },
		} as any);

		instantiationService.stub(ILayoutService, new TestLayoutService());
		capabilities = store.add(new TerminalCapabilityStore());
		if (!isWindows) {
			capabilities.add(TerminalCapability.NaiveCwdDetection, null!);
		}
		const TerminalCtor = (await importAMDNodeModule<typeof import('@xterm/xterm')>('@xterm/xterm', 'lib/xterm.js')).Terminal;
		xterm = store.add(instantiationService.createInstance(XtermTerminal, undefined, TerminalCtor, {
			cols: 80,
			rows: 30,
			xtermColorProvider: { getBackgroundColor: () => undefined },
			capabilities,
			disableShellIntegrationReporting: true
		}, undefined));
		const container = document.createElement('div');
		xterm.raw.open(container);
		configurationService = new TestConfigurationService({ terminal: { integrated: { tabs: { separator: ' - ', title: '${cwd}', description: '${cwd}' } } } });
		bufferTracker = store.add(instantiationService.createInstance(BufferContentTracker, xterm));
	});

	test('should not clear the prompt line', async () => {
		assert.strictEqual(bufferTracker.lines.length, 0);
		await writeP(xterm.raw, prompt);
		xterm.clearBuffer();
		bufferTracker.update();
		assert.deepStrictEqual(bufferTracker.lines, [prompt]);
	});
	test('repeated updates should not change the content', async () => {
		assert.strictEqual(bufferTracker.lines.length, 0);
		await writeP(xterm.raw, prompt);
		bufferTracker.update();
		assert.deepStrictEqual(bufferTracker.lines, [prompt]);
		bufferTracker.update();
		assert.deepStrictEqual(bufferTracker.lines, [prompt]);
		bufferTracker.update();
		assert.deepStrictEqual(bufferTracker.lines, [prompt]);
	});
	test('should add lines in the viewport and scrollback', async () => {
		await writeAndAssertBufferState(promptPlusData, 38, xterm.raw, bufferTracker);
	});
	test('should add lines in the viewport and full scrollback', async () => {
		await writeAndAssertBufferState(promptPlusData, 1030, xterm.raw, bufferTracker);
	});
	test('should refresh viewport', async () => {
		await writeAndAssertBufferState(promptPlusData, 6, xterm.raw, bufferTracker);
		await writeP(xterm.raw, '\x1b[3Ainserteddata');
		bufferTracker.update();
		assert.deepStrictEqual(bufferTracker.lines, [promptPlusData, promptPlusData, `${promptPlusData}inserteddata`, promptPlusData, promptPlusData, promptPlusData]);
	});
	test('should refresh viewport with full scrollback', async () => {
		const content = `${prompt}\r\n`.repeat(1030).trimEnd();
		await writeP(xterm.raw, content);
		bufferTracker.update();
		await writeP(xterm.raw, '\x1b[4Ainsertion');
		bufferTracker.update();
		const expected = content.split('\r\n');
		expected[1025] = `${prompt}insertion`;
		assert.deepStrictEqual(bufferTracker.lines[1025], `${prompt}insertion`);
	});
	test('should cap the size of the cached lines, removing old lines in favor of new lines', async () => {
		const content = `${prompt}\r\n`.repeat(1036).trimEnd();
		await writeP(xterm.raw, content);
		bufferTracker.update();
		const expected = content.split('\r\n');
		// delete the 6 lines that should be trimmed
		for (let i = 0; i < 6; i++) {
			expected.pop();
		}
		// insert a new character
		await writeP(xterm.raw, '\x1b[2Ainsertion');
		bufferTracker.update();
		expected[1027] = `${prompt}insertion`;
		assert.strictEqual(bufferTracker.lines.length, expected.length);
		assert.deepStrictEqual(bufferTracker.lines, expected);
	});
});

async function writeAndAssertBufferState(data: string, rows: number, terminal: Terminal, bufferTracker: BufferContentTracker): Promise<void> {
	const content = `${data}\r\n`.repeat(rows).trimEnd();
	await writeP(terminal, content);
	bufferTracker.update();
	assert.strictEqual(bufferTracker.lines.length, rows);
	assert.deepStrictEqual(bufferTracker.lines, content.split('\r\n'));
}
