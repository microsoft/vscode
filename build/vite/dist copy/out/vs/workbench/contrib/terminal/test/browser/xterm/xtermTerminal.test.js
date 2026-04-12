/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { deepStrictEqual, strictEqual } from 'assert';
import { importAMDNodeModule } from '../../../../../../amdX.js';
import { Color, RGBA } from '../../../../../../base/common/color.js';
import { Emitter } from '../../../../../../base/common/event.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { TestConfigurationService } from '../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { TerminalCapabilityStore } from '../../../../../../platform/terminal/common/capabilities/terminalCapabilityStore.js';
import { IThemeService } from '../../../../../../platform/theme/common/themeService.js';
import { TestColorTheme } from '../../../../../../platform/theme/test/common/testThemeService.js';
import { PANEL_BACKGROUND, SIDE_BAR_BACKGROUND } from '../../../../../common/theme.js';
import { XtermTerminal } from '../../../browser/xterm/xtermTerminal.js';
import { TERMINAL_VIEW_ID } from '../../../common/terminal.js';
import { registerColors, TERMINAL_BACKGROUND_COLOR, TERMINAL_CURSOR_BACKGROUND_COLOR, TERMINAL_CURSOR_FOREGROUND_COLOR, TERMINAL_FOREGROUND_COLOR, TERMINAL_INACTIVE_SELECTION_BACKGROUND_COLOR, TERMINAL_SELECTION_BACKGROUND_COLOR, TERMINAL_SELECTION_FOREGROUND_COLOR } from '../../../common/terminalColorRegistry.js';
import { workbenchInstantiationService } from '../../../../../test/browser/workbenchTestServices.js';
import { TestWebglAddon, TestXtermAddonImporter } from './xtermTestUtils.js';
registerColors();
export class TestViewDescriptorService {
    constructor() {
        this._location = 1 /* ViewContainerLocation.Panel */;
        this._onDidChangeLocation = new Emitter();
        this.onDidChangeLocation = this._onDidChangeLocation.event;
    }
    getViewLocationById(id) {
        return this._location;
    }
    moveTerminalToLocation(to) {
        const oldLocation = this._location;
        this._location = to;
        this._onDidChangeLocation.fire({
            views: [
                { id: TERMINAL_VIEW_ID }
            ],
            from: oldLocation,
            to
        });
    }
}
const defaultTerminalConfig = {
    fontFamily: 'monospace',
    fontWeight: 'normal',
    fontWeightBold: 'normal',
    gpuAcceleration: 'off',
    scrollback: 10,
    fastScrollSensitivity: 2,
    mouseWheelScrollSensitivity: 1,
    unicodeVersion: '6'
};
suite('XtermTerminal', () => {
    const store = ensureNoDisposablesAreLeakedInTestSuite();
    let instantiationService;
    let configurationService;
    let themeService;
    let xterm;
    let XTermBaseCtor;
    function write(data) {
        return new Promise((resolve) => {
            xterm.write(data, resolve);
        });
    }
    setup(async () => {
        configurationService = new TestConfigurationService({
            editor: {
                fastScrollSensitivity: 2,
                mouseWheelScrollSensitivity: 1
            },
            files: {},
            terminal: {
                integrated: defaultTerminalConfig
            }
        });
        instantiationService = workbenchInstantiationService({
            configurationService: () => configurationService
        }, store);
        themeService = instantiationService.get(IThemeService);
        XTermBaseCtor = (await importAMDNodeModule('@xterm/xterm', 'lib/xterm.js')).Terminal;
        const capabilityStore = store.add(new TerminalCapabilityStore());
        xterm = store.add(instantiationService.createInstance(XtermTerminal, undefined, XTermBaseCtor, {
            cols: 80,
            rows: 30,
            xtermColorProvider: { getBackgroundColor: () => undefined },
            capabilities: capabilityStore,
            disableShellIntegrationReporting: true,
            xtermAddonImporter: new TestXtermAddonImporter(),
        }, undefined));
        TestWebglAddon.shouldThrow = false;
        TestWebglAddon.isEnabled = false;
    });
    test('should use fallback dimensions of 80x30', () => {
        strictEqual(xterm.raw.cols, 80);
        strictEqual(xterm.raw.rows, 30);
    });
    suite('getContentsAsText', () => {
        test('should return all buffer contents when no markers provided', async () => {
            await write('line 1\r\nline 2\r\nline 3\r\nline 4\r\nline 5');
            const result = xterm.getContentsAsText();
            strictEqual(result.startsWith('line 1\nline 2\nline 3\nline 4\nline 5'), true, 'Should include the content plus empty lines up to buffer length');
            const lines = result.split('\n');
            strictEqual(lines.length, xterm.raw.buffer.active.length, 'Should end with empty lines (total buffer size is 30 rows)');
        });
        test('should return contents from start marker to end', async () => {
            await write('line 1\r\n');
            const startMarker = xterm.raw.registerMarker(0);
            await write('line 2\r\nline 3\r\nline 4\r\nline 5');
            const result = xterm.getContentsAsText(startMarker);
            strictEqual(result.startsWith('line 2\nline 3\nline 4\nline 5'), true, 'Should start with line 2 and include empty lines');
        });
        test('should return contents from start to end marker', async () => {
            await write('line 1\r\n');
            const startMarker = xterm.raw.registerMarker(0);
            await write('line 2\r\nline 3\r\n');
            const endMarker = xterm.raw.registerMarker(0);
            await write('line 4\r\nline 5');
            const result = xterm.getContentsAsText(startMarker, endMarker);
            strictEqual(result, 'line 2\nline 3\nline 4');
        });
        test('should return single line when start and end markers are the same', async () => {
            await write('line 1\r\nline 2\r\n');
            const marker = xterm.raw.registerMarker(0);
            await write('line 3\r\nline 4\r\nline 5');
            const result = xterm.getContentsAsText(marker, marker);
            strictEqual(result, 'line 3');
        });
        test('should return empty string when start marker is beyond end marker', async () => {
            await write('line 1\r\n');
            const endMarker = xterm.raw.registerMarker(0);
            await write('line 2\r\nline 3\r\n');
            const startMarker = xterm.raw.registerMarker(0);
            await write('line 4\r\nline 5');
            const result = xterm.getContentsAsText(startMarker, endMarker);
            strictEqual(result, '');
        });
        test('should handle empty buffer', async () => {
            const result = xterm.getContentsAsText();
            const lines = result.split('\n');
            strictEqual(lines.length, xterm.raw.buffer.active.length, 'Empty terminal should have empty lines equal to buffer length');
            strictEqual(lines.every(line => line === ''), true, 'All lines should be empty');
        });
        test('should handle mixed content with spaces and special characters', async () => {
            await write('hello world\r\n  indented line\r\nline with $pecial chars!@#\r\n\r\nempty line above');
            const result = xterm.getContentsAsText();
            strictEqual(result.startsWith('hello world\n  indented line\nline with $pecial chars!@#\n\nempty line above'), true, 'Should handle spaces and special characters correctly');
        });
        test('should throw error when startMarker is disposed (line === -1)', async () => {
            await write('line 1\r\n');
            const disposedMarker = xterm.raw.registerMarker(0);
            await write('line 2\r\nline 3\r\nline 4\r\nline 5');
            disposedMarker.dispose();
            try {
                xterm.getContentsAsText(disposedMarker);
                throw new Error('Expected error was not thrown');
            }
            catch (error) {
                strictEqual(error.message, 'Cannot get contents of a disposed startMarker');
            }
        });
        test('should throw error when endMarker is disposed (line === -1)', async () => {
            await write('line 1\r\n');
            const startMarker = xterm.raw.registerMarker(0);
            await write('line 2\r\n');
            const disposedEndMarker = xterm.raw.registerMarker(0);
            await write('line 3\r\nline 4\r\nline 5');
            disposedEndMarker.dispose();
            try {
                xterm.getContentsAsText(startMarker, disposedEndMarker);
                throw new Error('Expected error was not thrown');
            }
            catch (error) {
                strictEqual(error.message, 'Cannot get contents of a disposed endMarker');
            }
        });
        test('should handle markers at buffer boundaries', async () => {
            const startMarker = xterm.raw.registerMarker(0);
            await write('line 1\r\nline 2\r\nline 3\r\nline 4\r\n');
            const endMarker = xterm.raw.registerMarker(0);
            await write('line 5');
            const result = xterm.getContentsAsText(startMarker, endMarker);
            strictEqual(result, 'line 1\nline 2\nline 3\nline 4\nline 5', 'Should handle markers at buffer boundaries correctly');
        });
        test('should handle terminal escape sequences properly', async () => {
            await write('\x1b[31mred text\x1b[0m\r\n\x1b[32mgreen text\x1b[0m');
            const result = xterm.getContentsAsText();
            strictEqual(result.startsWith('red text\ngreen text'), true, 'ANSI escape sequences should be filtered out, but there will be trailing empty lines');
        });
    });
    suite('getBufferReverseIterator', () => {
        test('should get text properly within scrollback limit', async () => {
            const text = 'line 1\r\nline 2\r\nline 3\r\nline 4\r\nline 5';
            await write(text);
            const result = [...xterm.getBufferReverseIterator()].reverse().join('\r\n');
            strictEqual(text, result, 'Should equal original text');
        });
        test('should get text properly when exceed scrollback limit', async () => {
            // max buffer lines(40) = rows(30) + scrollback(10)
            const text = 'line 1\r\nline 2\r\nline 3\r\nline 4\r\nline 5\r\n'.repeat(8).trim();
            await write(text);
            await write('\r\nline more');
            const result = [...xterm.getBufferReverseIterator()].reverse().join('\r\n');
            const expect = text.slice(8) + '\r\nline more';
            strictEqual(expect, result, 'Should equal original text without line 1');
        });
    });
    suite('theme', () => {
        test('should apply correct background color based on getBackgroundColor', () => {
            themeService.setTheme(new TestColorTheme({
                [PANEL_BACKGROUND]: '#ff0000',
                [SIDE_BAR_BACKGROUND]: '#00ff00'
            }));
            xterm = store.add(instantiationService.createInstance(XtermTerminal, undefined, XTermBaseCtor, {
                cols: 80,
                rows: 30,
                xtermAddonImporter: new TestXtermAddonImporter(),
                xtermColorProvider: { getBackgroundColor: () => new Color(new RGBA(255, 0, 0)) },
                capabilities: store.add(new TerminalCapabilityStore()),
                disableShellIntegrationReporting: true,
            }, undefined));
            strictEqual(xterm.raw.options.theme?.background, '#ff0000');
        });
        test('should react to and apply theme changes', () => {
            themeService.setTheme(new TestColorTheme({
                [TERMINAL_BACKGROUND_COLOR]: '#000100',
                [TERMINAL_FOREGROUND_COLOR]: '#000200',
                [TERMINAL_CURSOR_FOREGROUND_COLOR]: '#000300',
                [TERMINAL_CURSOR_BACKGROUND_COLOR]: '#000400',
                [TERMINAL_SELECTION_BACKGROUND_COLOR]: '#000500',
                [TERMINAL_INACTIVE_SELECTION_BACKGROUND_COLOR]: '#000600',
                [TERMINAL_SELECTION_FOREGROUND_COLOR]: undefined,
                'terminal.ansiBlack': '#010000',
                'terminal.ansiRed': '#020000',
                'terminal.ansiGreen': '#030000',
                'terminal.ansiYellow': '#040000',
                'terminal.ansiBlue': '#050000',
                'terminal.ansiMagenta': '#060000',
                'terminal.ansiCyan': '#070000',
                'terminal.ansiWhite': '#080000',
                'terminal.ansiBrightBlack': '#090000',
                'terminal.ansiBrightRed': '#100000',
                'terminal.ansiBrightGreen': '#110000',
                'terminal.ansiBrightYellow': '#120000',
                'terminal.ansiBrightBlue': '#130000',
                'terminal.ansiBrightMagenta': '#140000',
                'terminal.ansiBrightCyan': '#150000',
                'terminal.ansiBrightWhite': '#160000',
            }));
            xterm = store.add(instantiationService.createInstance(XtermTerminal, undefined, XTermBaseCtor, {
                cols: 80,
                rows: 30,
                xtermAddonImporter: new TestXtermAddonImporter(),
                xtermColorProvider: { getBackgroundColor: () => undefined },
                capabilities: store.add(new TerminalCapabilityStore()),
                disableShellIntegrationReporting: true
            }, undefined));
            deepStrictEqual(xterm.raw.options.theme, {
                background: undefined,
                foreground: '#000200',
                cursor: '#000300',
                cursorAccent: '#000400',
                selectionBackground: '#000500',
                selectionInactiveBackground: '#000600',
                selectionForeground: undefined,
                overviewRulerBorder: undefined,
                scrollbarSliderActiveBackground: undefined,
                scrollbarSliderBackground: undefined,
                scrollbarSliderHoverBackground: undefined,
                black: '#010000',
                green: '#030000',
                red: '#020000',
                yellow: '#040000',
                blue: '#050000',
                magenta: '#060000',
                cyan: '#070000',
                white: '#080000',
                brightBlack: '#090000',
                brightRed: '#100000',
                brightGreen: '#110000',
                brightYellow: '#120000',
                brightBlue: '#130000',
                brightMagenta: '#140000',
                brightCyan: '#150000',
                brightWhite: '#160000',
            });
            themeService.setTheme(new TestColorTheme({
                [TERMINAL_BACKGROUND_COLOR]: '#00010f',
                [TERMINAL_FOREGROUND_COLOR]: '#00020f',
                [TERMINAL_CURSOR_FOREGROUND_COLOR]: '#00030f',
                [TERMINAL_CURSOR_BACKGROUND_COLOR]: '#00040f',
                [TERMINAL_SELECTION_BACKGROUND_COLOR]: '#00050f',
                [TERMINAL_INACTIVE_SELECTION_BACKGROUND_COLOR]: '#00060f',
                [TERMINAL_SELECTION_FOREGROUND_COLOR]: '#00070f',
                'terminal.ansiBlack': '#01000f',
                'terminal.ansiRed': '#02000f',
                'terminal.ansiGreen': '#03000f',
                'terminal.ansiYellow': '#04000f',
                'terminal.ansiBlue': '#05000f',
                'terminal.ansiMagenta': '#06000f',
                'terminal.ansiCyan': '#07000f',
                'terminal.ansiWhite': '#08000f',
                'terminal.ansiBrightBlack': '#09000f',
                'terminal.ansiBrightRed': '#10000f',
                'terminal.ansiBrightGreen': '#11000f',
                'terminal.ansiBrightYellow': '#12000f',
                'terminal.ansiBrightBlue': '#13000f',
                'terminal.ansiBrightMagenta': '#14000f',
                'terminal.ansiBrightCyan': '#15000f',
                'terminal.ansiBrightWhite': '#16000f',
            }));
            deepStrictEqual(xterm.raw.options.theme, {
                background: undefined,
                foreground: '#00020f',
                cursor: '#00030f',
                cursorAccent: '#00040f',
                selectionBackground: '#00050f',
                selectionInactiveBackground: '#00060f',
                selectionForeground: '#00070f',
                overviewRulerBorder: undefined,
                scrollbarSliderActiveBackground: undefined,
                scrollbarSliderBackground: undefined,
                scrollbarSliderHoverBackground: undefined,
                black: '#01000f',
                green: '#03000f',
                red: '#02000f',
                yellow: '#04000f',
                blue: '#05000f',
                magenta: '#06000f',
                cyan: '#07000f',
                white: '#08000f',
                brightBlack: '#09000f',
                brightRed: '#10000f',
                brightGreen: '#11000f',
                brightYellow: '#12000f',
                brightBlue: '#13000f',
                brightMagenta: '#14000f',
                brightCyan: '#15000f',
                brightWhite: '#16000f',
            });
        });
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoieHRlcm1UZXJtaW5hbC50ZXN0LmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvdGVybWluYWwvdGVzdC9icm93c2VyL3h0ZXJtL3h0ZXJtVGVybWluYWwudGVzdC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUdoRyxPQUFPLEVBQUUsZUFBZSxFQUFFLFdBQVcsRUFBRSxNQUFNLFFBQVEsQ0FBQztBQUN0RCxPQUFPLEVBQUUsbUJBQW1CLEVBQUUsTUFBTSwyQkFBMkIsQ0FBQztBQUNoRSxPQUFPLEVBQUUsS0FBSyxFQUFFLElBQUksRUFBRSxNQUFNLHdDQUF3QyxDQUFDO0FBQ3JFLE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSx3Q0FBd0MsQ0FBQztBQUNqRSxPQUFPLEVBQUUsdUNBQXVDLEVBQUUsTUFBTSw2Q0FBNkMsQ0FBQztBQUV0RyxPQUFPLEVBQUUsd0JBQXdCLEVBQUUsTUFBTSxrRkFBa0YsQ0FBQztBQUU1SCxPQUFPLEVBQUUsdUJBQXVCLEVBQUUsTUFBTSxvRkFBb0YsQ0FBQztBQUM3SCxPQUFPLEVBQUUsYUFBYSxFQUFFLE1BQU0seURBQXlELENBQUM7QUFDeEYsT0FBTyxFQUFFLGNBQWMsRUFBb0IsTUFBTSxrRUFBa0UsQ0FBQztBQUNwSCxPQUFPLEVBQUUsZ0JBQWdCLEVBQUUsbUJBQW1CLEVBQUUsTUFBTSxnQ0FBZ0MsQ0FBQztBQUV2RixPQUFPLEVBQUUsYUFBYSxFQUFFLE1BQU0seUNBQXlDLENBQUM7QUFDeEUsT0FBTyxFQUEwQixnQkFBZ0IsRUFBRSxNQUFNLDZCQUE2QixDQUFDO0FBQ3ZGLE9BQU8sRUFBRSxjQUFjLEVBQUUseUJBQXlCLEVBQUUsZ0NBQWdDLEVBQUUsZ0NBQWdDLEVBQUUseUJBQXlCLEVBQUUsNENBQTRDLEVBQUUsbUNBQW1DLEVBQUUsbUNBQW1DLEVBQUUsTUFBTSwwQ0FB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