/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { WebglAddon } from '@xterm/addon-webgl';
import type { IEvent, Terminal } from '@xterm/xterm';
import { deepStrictEqual, strictEqual } from 'assert';
import { importAMDNodeModule } from '../../../../../../amdX.js';
import { Color, RGBA } from '../../../../../../base/common/color.js';
import { Emitter } from '../../../../../../base/common/event.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { IEditorOptions } from '../../../../../../editor/common/config/editorOptions.js';
import { TestConfigurationService } from '../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { TestInstantiationService } from '../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { TerminalCapabilityStore } from '../../../../../../platform/terminal/common/capabilities/terminalCapabilityStore.js';
import { IThemeService } from '../../../../../../platform/theme/common/themeService.js';
import { TestColorTheme, TestThemeService } from '../../../../../../platform/theme/test/common/testThemeService.js';
import { PANEL_BACKGROUND, SIDE_BAR_BACKGROUND } from '../../../../../common/theme.js';
import { IViewDescriptor, IViewDescriptorService, ViewContainerLocation } from '../../../../../common/views.js';
import { XtermTerminal } from '../../../browser/xterm/xtermTerminal.js';
import { ITerminalConfiguration, TERMINAL_VIEW_ID } from '../../../common/terminal.js';
import { registerColors, TERMINAL_BACKGROUND_COLOR, TERMINAL_CURSOR_BACKGROUND_COLOR, TERMINAL_CURSOR_FOREGROUND_COLOR, TERMINAL_FOREGROUND_COLOR, TERMINAL_INACTIVE_SELECTION_BACKGROUND_COLOR, TERMINAL_SELECTION_BACKGROUND_COLOR, TERMINAL_SELECTION_FOREGROUND_COLOR } from '../../../common/terminalColorRegistry.js';
import { workbenchInstantiationService } from '../../../../../test/browser/workbenchTestServices.js';
import { IXtermAddonNameToCtor, XtermAddonImporter } from '../../../browser/xterm/xtermAddonImporter.js';

registerColors();

class TestWebglAddon implements WebglAddon {
	static shouldThrow = false;
	static isEnabled = false;
	readonly onChangeTextureAtlas = new Emitter().event as IEvent<HTMLCanvasElement>;
	readonly onAddTextureAtlasCanvas = new Emitter().event as IEvent<HTMLCanvasElement>;
	readonly onRemoveTextureAtlasCanvas = new Emitter().event as IEvent<HTMLCanvasElement, void>;
	readonly onContextLoss = new Emitter().event as IEvent<void>;
	constructor(preserveDrawingBuffer?: boolean) {
	}
	activate() {
		TestWebglAddon.isEnabled = !TestWebglAddon.shouldThrow;
		if (TestWebglAddon.shouldThrow) {
			throw new Error('Test webgl set to throw');
		}
	}
	dispose() {
		TestWebglAddon.isEnabled = false;
	}
	clearTextureAtlas() { }
}

class TestXtermAddonImporter extends XtermAddonImporter {
	override async importAddon<T extends keyof IXtermAddonNameToCtor>(name: T): Promise<IXtermAddonNameToCtor[T]> {
		if (name === 'webgl') {
			return TestWebglAddon as unknown as IXtermAddonNameToCtor[T];
		}
		return super.importAddon(name);
	}
}

export class TestViewDescriptorService implements Partial<IViewDescriptorService> {
	private _location = ViewContainerLocation.Panel;
	private _onDidChangeLocation = new Emitter<{ views: IViewDescriptor[]; from: ViewContainerLocation; to: ViewContainerLocation }>();
	onDidChangeLocation = this._onDidChangeLocation.event;
	getViewLocationById(id: string) {
		return this._location;
	}
	moveTerminalToLocation(to: ViewContainerLocation) {
		const oldLocation = this._location;
		this._location = to;
		this._onDidChangeLocation.fire({
			views: [
				{ id: TERMINAL_VIEW_ID } as unknown as IViewDescriptor
			],
			from: oldLocation,
			to
		});
	}
}

const defaultTerminalConfig: Partial<ITerminalConfiguration> = {
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

	let instantiationService: TestInstantiationService;
	let configurationService: TestConfigurationService;
	let themeService: TestThemeService;
	let xterm: XtermTerminal;
	let XTermBaseCtor: typeof Terminal;

	function write(data: string): Promise<void> {
		return new Promise<void>((resolve) => {
			xterm.write(data, resolve);
		});
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
		themeService = instantiationService.get(IThemeService) as TestThemeService;

		XTermBaseCtor = (await importAMDNodeModule<typeof import('@xterm/xterm')>('@xterm/xterm', 'lib/xterm.js')).Terminal;

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
			const startMarker = xterm.raw.registerMarker(0)!;
			await write('line 2\r\nline 3\r\nline 4\r\nline 5');

			const result = xterm.getContentsAsText(startMarker);
			strictEqual(result.startsWith('line 2\nline 3\nline 4\nline 5'), true, 'Should start with line 2 and include empty lines');
		});

		test('should return contents from start to end marker', async () => {
			await write('line 1\r\n');
			const startMarker = xterm.raw.registerMarker(0)!;
			await write('line 2\r\nline 3\r\n');
			const endMarker = xterm.raw.registerMarker(0)!;
			await write('line 4\r\nline 5');

			const result = xterm.getContentsAsText(startMarker, endMarker);
			strictEqual(result, 'line 2\nline 3\nline 4');
		});

		test('should return single line when start and end markers are the same', async () => {
			await write('line 1\r\nline 2\r\n');
			const marker = xterm.raw.registerMarker(0)!;
			await write('line 3\r\nline 4\r\nline 5');

			const result = xterm.getContentsAsText(marker, marker);
			strictEqual(result, 'line 3');
		});

		test('should return empty string when start marker is beyond end marker', async () => {
			await write('line 1\r\n');
			const endMarker = xterm.raw.registerMarker(0)!;
			await write('line 2\r\nline 3\r\n');
			const startMarker = xterm.raw.registerMarker(0)!;
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
			const disposedMarker = xterm.raw.registerMarker(0)!;
			await write('line 2\r\nline 3\r\nline 4\r\nline 5');

			disposedMarker.dispose();

			try {
				xterm.getContentsAsText(disposedMarker);
				throw new Error('Expected error was not thrown');
			} catch (error: any) {
				strictEqual(error.message, 'Cannot get contents of a disposed startMarker');
			}
		});

		test('should throw error when endMarker is disposed (line === -1)', async () => {
			await write('line 1\r\n');
			const startMarker = xterm.raw.registerMarker(0)!;
			await write('line 2\r\n');
			const disposedEndMarker = xterm.raw.registerMarker(0)!;
			await write('line 3\r\nline 4\r\nline 5');

			disposedEndMarker.dispose();

			try {
				xterm.getContentsAsText(startMarker, disposedEndMarker);
				throw new Error('Expected error was not thrown');
			} catch (error: any) {
				strictEqual(error.message, 'Cannot get contents of a disposed endMarker');
			}
		});

		test('should handle markers at buffer boundaries', async () => {
			const startMarker = xterm.raw.registerMarker(0)!;
			await write('line 1\r\nline 2\r\nline 3\r\nline 4\r\n');
			const endMarker = xterm.raw.registerMarker(0)!;
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
