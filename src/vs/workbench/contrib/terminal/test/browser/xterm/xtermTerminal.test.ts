/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { WebglAddon } from '@xterm/addon-webgl';
import type { IEvent, Terminal } from '@xterm/xterm';
import { deepStrictEqual, strictEqual } from 'assert';
import { importAMDNodeModule } from 'vs/amdX';
import { isSafari } from 'vs/base/browser/browser';
import { Color, RGBA } from 'vs/base/common/color';
import { Emitter } from 'vs/base/common/event';
import { ensureNoDisposablesAreLeakedInTestSuite } from 'vs/base/test/common/utils';
import { IEditorOptions } from 'vs/editor/common/config/editorOptions';
import { TestConfigurationService } from 'vs/platform/configuration/test/common/testConfigurationService';
import { TestInstantiationService } from 'vs/platform/instantiation/test/common/instantiationServiceMock';
import { TerminalCapabilityStore } from 'vs/platform/terminal/common/capabilities/terminalCapabilityStore';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { TestColorTheme, TestThemeService } from 'vs/platform/theme/test/common/testThemeService';
import { PANEL_BACKGROUND, SIDE_BAR_BACKGROUND } from 'vs/workbench/common/theme';
import { IViewDescriptor, IViewDescriptorService, ViewContainerLocation } from 'vs/workbench/common/views';
import { XtermTerminal } from 'vs/workbench/contrib/terminal/browser/xterm/xtermTerminal';
import { ITerminalConfiguration, TERMINAL_VIEW_ID } from 'vs/workbench/contrib/terminal/common/terminal';
import { registerColors, TERMINAL_BACKGROUND_COLOR, TERMINAL_CURSOR_BACKGROUND_COLOR, TERMINAL_CURSOR_FOREGROUND_COLOR, TERMINAL_FOREGROUND_COLOR, TERMINAL_INACTIVE_SELECTION_BACKGROUND_COLOR, TERMINAL_SELECTION_BACKGROUND_COLOR, TERMINAL_SELECTION_FOREGROUND_COLOR } from 'vs/workbench/contrib/terminal/common/terminalColorRegistry';
import { workbenchInstantiationService } from 'vs/workbench/test/browser/workbenchTestServices';

registerColors();

class TestWebglAddon implements WebglAddon {
	static shouldThrow = false;
	static isEnabled = false;
	readonly onChangeTextureAtlas = new Emitter().event as IEvent<HTMLCanvasElement>;
	readonly onAddTextureAtlasCanvas = new Emitter().event as IEvent<HTMLCanvasElement>;
	readonly onRemoveTextureAtlasCanvas = new Emitter().event as IEvent<HTMLCanvasElement, void>;
	readonly onContextLoss = new Emitter().event as IEvent<void>;
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

class TestXtermTerminal extends XtermTerminal {
	webglAddonPromise: Promise<typeof WebglAddon> = Promise.resolve(TestWebglAddon);
	// Force synchronous to avoid async when activating the addon
	protected override _getWebglAddonConstructor() {
		return this.webglAddonPromise;
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
				{ id: TERMINAL_VIEW_ID } as any
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
	scrollback: 1000,
	fastScrollSensitivity: 2,
	mouseWheelScrollSensitivity: 1,
	unicodeVersion: '6'
};

suite('XtermTerminal', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	let instantiationService: TestInstantiationService;
	let configurationService: TestConfigurationService;
	let themeService: TestThemeService;
	let xterm: TestXtermTerminal;
	let XTermBaseCtor: typeof Terminal;

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
		xterm = store.add(instantiationService.createInstance(TestXtermTerminal, XTermBaseCtor, 80, 30, { getBackgroundColor: () => undefined }, capabilityStore, '', true));

		TestWebglAddon.shouldThrow = false;
		TestWebglAddon.isEnabled = false;
	});

	test('should use fallback dimensions of 80x30', () => {
		strictEqual(xterm.raw.cols, 80);
		strictEqual(xterm.raw.rows, 30);
	});

	suite('theme', () => {
		test('should apply correct background color based on getBackgroundColor', () => {
			themeService.setTheme(new TestColorTheme({
				[PANEL_BACKGROUND]: '#ff0000',
				[SIDE_BAR_BACKGROUND]: '#00ff00'
			}));
			xterm = store.add(instantiationService.createInstance(XtermTerminal, XTermBaseCtor, 80, 30, { getBackgroundColor: () => new Color(new RGBA(255, 0, 0)) }, store.add(new TerminalCapabilityStore()), '', true));
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
			xterm = store.add(instantiationService.createInstance(XtermTerminal, XTermBaseCtor, 80, 30, { getBackgroundColor: () => undefined }, store.add(new TerminalCapabilityStore()), '', true));
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

	suite('renderers', () => {
		// This is skipped until the webgl renderer bug is fixed in Chromium
		// https://bugs.chromium.org/p/chromium/issues/detail?id=1476475
		test.skip('should re-evaluate gpu acceleration auto when the setting is changed', async () => {
			// Check initial state
			strictEqual(TestWebglAddon.isEnabled, false);

			// Open xterm as otherwise the webgl addon won't activate
			const container = document.createElement('div');
			xterm.attachToElement(container);

			// Auto should activate the webgl addon
			await configurationService.setUserConfiguration('terminal', { integrated: { ...defaultTerminalConfig, gpuAcceleration: 'auto' } });
			configurationService.onDidChangeConfigurationEmitter.fire({ affectsConfiguration: () => true } as any);
			await xterm.webglAddonPromise; // await addon activate
			if (isSafari) {
				strictEqual(TestWebglAddon.isEnabled, false, 'The webgl renderer is always disabled on Safari');
			} else {
				strictEqual(TestWebglAddon.isEnabled, true);
			}

			// Turn off to reset state
			await configurationService.setUserConfiguration('terminal', { integrated: { ...defaultTerminalConfig, gpuAcceleration: 'off' } });
			configurationService.onDidChangeConfigurationEmitter.fire({ affectsConfiguration: () => true } as any);
			await xterm.webglAddonPromise; // await addon activate
			strictEqual(TestWebglAddon.isEnabled, false);

			// Set to auto again but throw when activating the webgl addon
			TestWebglAddon.shouldThrow = true;
			await configurationService.setUserConfiguration('terminal', { integrated: { ...defaultTerminalConfig, gpuAcceleration: 'auto' } });
			configurationService.onDidChangeConfigurationEmitter.fire({ affectsConfiguration: () => true } as any);
			await xterm.webglAddonPromise; // await addon activate
			strictEqual(TestWebglAddon.isEnabled, false);
		});
	});
});
