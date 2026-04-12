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
import { TerminalCapabilityStore } from '../../../../../../platform/terminal/common/capabilities/terminalCapabilityStore.js';
import { ITerminalLogService } from '../../../../../../platform/terminal/common/terminal.js';
import { IThemeService } from '../../../../../../platform/theme/common/themeService.js';
import { TestThemeService } from '../../../../../../platform/theme/test/common/testThemeService.js';
import { writeP } from '../../../../terminal/browser/terminalTestHelpers.js';
import { XtermTerminal } from '../../../../terminal/browser/xterm/xtermTerminal.js';
import { BufferContentTracker } from '../../browser/bufferContentTracker.js';
import { ILifecycleService } from '../../../../../services/lifecycle/common/lifecycle.js';
import { TestLayoutService, TestLifecycleService } from '../../../../../test/browser/workbenchTestServices.js';
import { TestLoggerService } from '../../../../../test/common/workbenchTestServices.js';
import { IAccessibilitySignalService } from '../../../../../../platform/accessibilitySignal/browser/accessibilitySignalService.js';
import { ITerminalConfigurationService } from '../../../../terminal/browser/terminal.js';
import { TerminalConfigurationService } from '../../../../terminal/browser/terminalConfigurationService.js';
const defaultTerminalConfig = {
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
    let instantiationService;
    let configurationService;
    let themeService;
    let xterm;
    let capabilities;
    let bufferTracker;
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
            isSoundEnabled(signal) { return false; },
        });
        instantiationService.stub(ILayoutService, new TestLayoutService());
        capabilities = store.add(new TerminalCapabilityStore());
        if (!isWindows) {
            capabilities.add(1 /* TerminalCapability.NaiveCwdDetection */, null);
        }
        const TerminalCtor = (await importAMDNodeModule('@xterm/xterm', 'lib/xterm.js')).Terminal;
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
async function writeAndAssertBufferState(data, rows, terminal, bufferTracker) {
    const content = `${data}\r\n`.repeat(rows).trimEnd();
    await writeP(terminal, content);
    bufferTracker.update();
    assert.strictEqual(bufferTracker.lines.length, rows);
    assert.deepStrictEqual(bufferTracker.lines, content.split('\r\n'));
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYnVmZmVyQ29udGVudFRyYWNrZXIudGVzdC5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL3Rlcm1pbmFsQ29udHJpYi9hY2Nlc3NpYmlsaXR5L3Rlc3QvYnJvd3Nlci9idWZmZXJDb250ZW50VHJhY2tlci50ZXN0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sTUFBTSxNQUFNLFFBQVEsQ0FBQztBQUM1QixPQUFPLEVBQUUsbUJBQW1CLEVBQUUsTUFBTSwyQkFBMkIsQ0FBQztBQUNoRSxPQUFPLEVBQUUsU0FBUyxFQUFFLE1BQU0sMkNBQTJDLENBQUM7QUFDdEUsT0FBTyxFQUFFLHVDQUF1QyxFQUFFLE1BQU0sNkNBQTZDLENBQUM7QUFDdEcsT0FBTyxFQUFFLHFCQUFxQixFQUFFLE1BQU0sa0VBQWtFLENBQUM7QUFDekcsT0FBTyxFQUFFLHdCQUF3QixFQUFFLE1BQU0sa0ZBQWtGLENBQUM7QUFDNUgsT0FBTyxFQUFFLGtCQUFrQixFQUFFLE1BQU0sNERBQTRELENBQUM7QUFDaEcsT0FBTyxFQUFFLGtCQUFrQixFQUFFLE1BQU0sc0VBQXNFLENBQUM7QUFDMUcsT0FBTyxFQUFFLG1CQUFtQixFQUFFLE1BQU0sK0RBQStELENBQUM7QUFDcEcsT0FBTyxFQUFFLHdCQUF3QixFQUFFLE1BQU0sa0ZBQWtGLENBQUM7QUFDNUgsT0FBTyxFQUFFLHFCQUFxQixFQUFFLE1BQU0sNEVBQTRFLENBQUM7QUFDbkgsT0FBTyxFQUFFLGNBQWMsRUFBRSxNQUFNLDREQUE0RCxDQUFDO0FBQzVGLE9BQU8sRUFBRSxjQUFjLEVBQUUsY0FBYyxFQUFFLE1BQU0sOENBQThDLENBQUM7QUFFOUYsT0FBTyxFQUFFLHVCQUF1QixFQUFFLE1BQU0sb0ZBQW9GLENBQUM7QUFDN0gsT0FBTyxFQUFFLG1CQUFtQixFQUFFLE1B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