/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import type { BrowserWindow, BrowserWindowConstructorOptions, WebContents } from 'electron';
import sinon from 'sinon';
import { isMacintosh, isWindows } from '../../../../base/common/platform.js';
import { upcastPartial } from '../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { IConfigurationService } from '../../../configuration/common/configuration.js';
import { TestConfigurationService } from '../../../configuration/test/common/testConfigurationService.js';
import { IEnvironmentMainService } from '../../../environment/electron-main/environmentMainService.js';
import { TestInstantiationService } from '../../../instantiation/test/common/instantiationServiceMock.js';
import { NullLogService } from '../../../log/common/log.js';
import { IProductService } from '../../../product/common/productService.js';
import { InMemoryTestStateMainService } from '../../../test/electron-main/workbenchTestServices.js';
import { IThemeMainService } from '../../../theme/electron-main/themeMainService.js';
import { DEFAULT_CUSTOM_TITLEBAR_HEIGHT, getMacOSWindowControlsPosition } from '../../../window/common/window.js';
import { IWindowState, WindowMode } from '../../../window/electron-main/window.js';
import { URI } from '../../../../base/common/uri.js';
import { NativeParsedArgs } from '../../../environment/common/argv.js';
import { FocusMode } from '../../../native/common/native.js';
import { release } from 'os';
import { BaseWindow } from '../../electron-main/windowImpl.js';
import { defaultBrowserWindowOptions, getAuxiliaryWindowRestoreMode, getClaimedAuxiliaryWindowMode, isBackgroundThrottlingAllowed, isHiddenWindowMode } from '../../electron-main/windows.js';

const displayBounds = { x: 0, y: 0, width: 1440, height: 900 };
const workArea = { x: 0, y: 25, width: 1440, height: 875 };

class TestWindow extends BaseWindow {
	readonly id = 1;

	override setWin(win: BrowserWindow, options?: BrowserWindowConstructorOptions): void {
		super.setWin(win, options);
	}

	override applyState(state: IWindowState, hasMultipleDisplays?: boolean, minimized?: boolean): void {
		super.applyState(state, hasMultipleDisplays, minimized);
	}

	protected override getDisplayArea(mode: WindowMode.Maximized | WindowMode.Fullscreen) {
		return mode === WindowMode.Fullscreen ? displayBounds : workArea;
	}

	matches(_webContents: WebContents): boolean {
		return false;
	}
}

suite('Window options - always on top', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function createOptions(alwaysOnTop: boolean | undefined, override?: boolean) {
		const configurationService = new TestConfigurationService({ window: { titleBarStyle: 'native' } });
		store.add(configurationService.onDidChangeConfigurationEmitter);
		const instantiationService = store.add(new TestInstantiationService());
		instantiationService.stub(IConfigurationService, configurationService);
		instantiationService.stub(IEnvironmentMainService, { appRoot: '', isBuilt: false, args: { _: [] } });
		instantiationService.stub(IProductService, { nameLong: 'Test' });
		instantiationService.stub(IThemeMainService, { getBackgroundColor: () => '#000000' });

		return instantiationService.invokeFunction(defaultBrowserWindowOptions, { alwaysOnTop }, { alwaysOnTop: override });
	}

	test('restores saved always-on-top state while older state defaults to off', () => {
		assert.deepStrictEqual([true, false, undefined].map(value => !!createOptions(value).alwaysOnTop), [true, false, false]);
	});

	test('explicit window options take precedence over restored state', () => {
		assert.deepStrictEqual([
			!!createOptions(false, true).alwaysOnTop,
			!!createOptions(true, false).alwaysOnTop
		], [true, false]);
	});
});

suite('BaseWindow - window controls overlay', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	teardown(() => sinon.restore());

	function createWindow() {
		const configurationService = new TestConfigurationService({ window: { titleBarStyle: 'custom' } });
		store.add(configurationService.onDidChangeConfigurationEmitter);
		const window = store.add(new TestWindow(
			configurationService,
			new InMemoryTestStateMainService(),
			upcastPartial<IEnvironmentMainService>({ args: { _: [] } }),
			store.add(new NullLogService())
		));
		const setTitleBarOverlay = sinon.stub();
		const setWindowButtonPosition = sinon.stub();
		const on = sinon.stub();
		const removeListener = sinon.stub();
		const nativeWindow = upcastPartial<BrowserWindow>({
			on,
			removeListener,
			setSheetOffset: sinon.stub(),
			setWindowButtonPosition,
			setTitleBarOverlay,
		});
		return { window, nativeWindow, configurationService, setTitleBarOverlay, setWindowButtonPosition };
	}

	const windowsWithoutOverlay: { name: string; options?: BrowserWindowConstructorOptions }[] = [
		{ name: 'unknown constructor options' },
		{ name: 'native titlebar', options: {} },
		{ name: 'frameless', options: { frame: false } },
		{ name: 'explicitly disabled overlay', options: { titleBarStyle: 'hidden', titleBarOverlay: false } },
	];

	for (const { name, options } of windowsWithoutOverlay) {
		test(`does not initialize controls for ${name}`, () => {
			const { window, nativeWindow } = createWindow();
			const updateWindowControls = sinon.spy(window, 'updateWindowControls');
			window.setWin(nativeWindow, options);

			assert.deepStrictEqual(updateWindowControls.args, []);
		});
	}

	for (const titleBarOverlay of [true, { height: 29 }]) {
		test(`initializes controls for ${typeof titleBarOverlay} overlay options`, () => {
			const { window, nativeWindow } = createWindow();
			const updateWindowControls = sinon.spy(window, 'updateWindowControls');
			window.setWin(nativeWindow, { titleBarStyle: 'hidden', titleBarOverlay });

			assert.deepStrictEqual(updateWindowControls.args, [[{ height: DEFAULT_CUSTOM_TITLEBAR_HEIGHT }]]);
		});
	}

	for (const enabled of [false, true]) {
		(isMacintosh ? test.skip : test)(`preserves the creation-time overlay capability (${enabled}) after settings change`, async () => {
			const { window, nativeWindow, configurationService, setTitleBarOverlay } = createWindow();
			window.setWin(nativeWindow, { titleBarStyle: 'hidden', titleBarOverlay: enabled });
			setTitleBarOverlay.resetHistory();

			await configurationService.setUserConfiguration('window', { titleBarStyle: 'custom', controlsStyle: enabled ? 'custom' : 'native' });
			window.updateWindowControls({ height: 40, backgroundColor: '#ffffff', foregroundColor: '#000000' });

			assert.deepStrictEqual(setTitleBarOverlay.args, enabled ? [[{ color: '#ffffff', symbolColor: '#000000', height: 39 }]] : []);
		});
	}

	(isMacintosh ? test : test.skip)('honors a fixed horizontal inset when the title-bar height changes', () => {
		const { window, nativeWindow, setWindowButtonPosition } = createWindow();
		window.setWin(nativeWindow, { titleBarStyle: 'hidden' });
		setWindowButtonPosition.resetHistory();
		const horizontalInset = getMacOSWindowControlsPosition(DEFAULT_CUSTOM_TITLEBAR_HEIGHT, release())!.x;

		for (const height of [35, 44, 35]) {
			window.updateWindowControls({ height, horizontalInset });
		}

		assert.deepStrictEqual(setWindowButtonPosition.args, [35, 44, 35].map(height => [{
			x: horizontalInset,
			y: getMacOSWindowControlsPosition(height, release())!.y,
		}]));
	});
});

suite('BaseWindow - restoring a window state', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function restore(mode: WindowMode, minimized = false): string[] {
		const configurationService = new TestConfigurationService({ window: { titleBarStyle: 'custom' } });
		store.add(configurationService.onDidChangeConfigurationEmitter);
		const window = store.add(new TestWindow(
			configurationService,
			new InMemoryTestStateMainService(),
			upcastPartial<IEnvironmentMainService>({ args: { _: [] } }),
			store.add(new NullLogService())
		));

		const calls: string[] = [];
		const on = sinon.stub();
		const removeListener = sinon.stub();
		const setSheetOffset = sinon.stub();
		window.setWin(upcastPartial<BrowserWindow>({
			on,
			removeListener,
			setSheetOffset,
			isVisible: () => false,
			show: () => calls.push('show'),
			showInactive: () => calls.push('showInactive'),
			maximize: () => calls.push('maximize'),
			minimize: () => calls.push('minimize'),
		}));

		window.applyState({ mode }, false, minimized);

		return calls;
	}

	test('restores minimized windows without taking focus', () => {
		assert.deepStrictEqual({
			maximized: restore(WindowMode.Maximized),
			minimized: restore(WindowMode.Normal, true),
			maximizedMinimized: restore(WindowMode.Maximized, true),
		}, {
			maximized: ['maximize', 'show'],
			minimized: ['showInactive', 'minimize'],
			maximizedMinimized: ['maximize', 'showInactive', 'minimize'],
		});
	});
});

suite('BaseWindow - hidden window mode', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	teardown(() => sinon.restore());

	function environment(args: Partial<NativeParsedArgs>, extensionTests: boolean): IEnvironmentMainService {
		return upcastPartial<IEnvironmentMainService>({
			args: { _: [], ...args },
			extensionTestsLocationURI: extensionTests ? URI.file('/tests') : undefined
		});
	}

	test('isHiddenWindowMode requires --hidden-window together with --extensionTestsPath', () => {
		assert.deepStrictEqual([
			isHiddenWindowMode(environment({}, false)),
			isHiddenWindowMode(environment({}, true)),
			isHiddenWindowMode(environment({ 'hidden-window': true }, false)),
			isHiddenWindowMode(environment({ 'hidden-window': true }, true)),
		], [false, false, false, true]);
	});

	function createWindow(hidden: boolean) {
		const configurationService = new TestConfigurationService();
		store.add(configurationService.onDidChangeConfigurationEmitter);
		const window = store.add(new TestWindow(
			configurationService,
			new InMemoryTestStateMainService(),
			environment({ 'hidden-window': hidden }, true),
			store.add(new NullLogService())
		));
		const on = sinon.stub();
		const removeListener = sinon.stub();
		const maximize = sinon.stub();
		const show = sinon.stub();
		const focus = sinon.stub();
		const focusWebContents = sinon.stub();
		const setBounds = sinon.stub();
		const nativeWindow = upcastPartial<BrowserWindow>({
			on,
			removeListener,
			setSheetOffset: sinon.stub(),
			isMinimized: () => false,
			maximize,
			show,
			focus,
			setBounds,
			webContents: upcastPartial<WebContents>({ focus: focusWebContents }),
		});
		window.setWin(nativeWindow);
		return { window, maximize, show, focus, focusWebContents, setBounds };
	}

	for (const hidden of [false, true]) {
		test(`applyState ${hidden ? 'sizes to the work area without maximizing or showing' : 'maximizes and shows'} a maximized window (hidden: ${hidden})`, () => {
			const { window, maximize, show, setBounds } = createWindow(hidden);
			window.applyState({ mode: WindowMode.Maximized }, false);

			assert.deepStrictEqual([maximize.callCount, show.callCount, setBounds.args], hidden ? [0, 0, [[workArea]]] : [1, 1, []]);
		});

		test(`focus ${hidden ? 'is ignored' : 'focuses the window'} (hidden: ${hidden})`, () => {
			const { window, focus, focusWebContents } = createWindow(hidden);
			window.focus({ mode: FocusMode.Transfer });

			assert.deepStrictEqual([focus.callCount, focusWebContents.callCount], hidden ? [0, 0] : [1, 1]);
		});
	}

	test('applyState sizes a hidden fullscreen window to the display without maximizing, entering fullscreen or showing', () => {
		const { window, maximize, show, setBounds } = createWindow(true);
		const setFullScreen = sinon.stub(window as unknown as { setFullScreen(fullscreen: boolean, fromRestore: boolean): void }, 'setFullScreen');
		window.applyState({ mode: WindowMode.Fullscreen }, false);

		assert.deepStrictEqual([maximize.callCount, setFullScreen.callCount, show.callCount, setBounds.args], [0, 0, 0, [[displayBounds]]]);
	});

	test('background throttling cannot be re-enabled at runtime when hidden', () => {
		assert.deepStrictEqual([
			isBackgroundThrottlingAllowed(environment({}, true), true),
			isBackgroundThrottlingAllowed(environment({}, true), false),
			isBackgroundThrottlingAllowed(environment({ 'hidden-window': true }, true), true),
			isBackgroundThrottlingAllowed(environment({ 'hidden-window': true }, true), false),
		], [true, false, false, false]);
	});

	test('auxiliary windows restore the requested mode, not the visibility', () => {
		assert.deepStrictEqual(
			[undefined, WindowMode.Normal, WindowMode.Maximized, WindowMode.Fullscreen].map(getAuxiliaryWindowRestoreMode),
			[WindowMode.Normal, WindowMode.Normal, WindowMode.Maximized, WindowMode.Maximized]
		);
	});

	test('a claimed auxiliary window uses the requested mode, not the visibility', () => {
		assert.deepStrictEqual([
			getClaimedAuxiliaryWindowMode(WindowMode.Normal, { show: false }),
			getClaimedAuxiliaryWindowMode(WindowMode.Maximized, { show: false }),
			getClaimedAuxiliaryWindowMode(undefined, { show: false }),
			getClaimedAuxiliaryWindowMode(undefined, {}),
		], [WindowMode.Normal, WindowMode.Maximized, WindowMode.Maximized, WindowMode.Normal]);
	});

	test('a normal hidden auxiliary window keeps its bounds and is neither maximized nor shown', () => {
		const { window, maximize, show } = createWindow(true);
		const setBounds = sinon.stub();
		Object.assign(window.win!, { setBounds });
		const bounds = { x: 10, y: 20, width: 800, height: 600 };
		window.applyState({ ...bounds, mode: getAuxiliaryWindowRestoreMode(WindowMode.Normal) }, true);

		assert.deepStrictEqual([setBounds.args, maximize.callCount, show.callCount], [isMacintosh || isWindows ? [[bounds]] : [], 0, 0]);
	});

	for (const hidden of [false, true]) {
		test(`toggleFullScreen ${hidden ? 'does not change' : 'changes'} fullscreen (hidden: ${hidden})`, () => {
			const { window } = createWindow(hidden);
			const setFullScreen = sinon.stub(window as unknown as { setFullScreen(fullscreen: boolean, fromRestore: boolean): void }, 'setFullScreen');
			sinon.stub(window, 'isFullScreen').get(() => false);
			window.toggleFullScreen();

			assert.deepStrictEqual(setFullScreen.args, hidden ? [] : [[true, false]]);
		});
	}

	for (const [mode, name] of [[FocusMode.Notify, 'Notify'], [FocusMode.Force, 'Force']] as const) {
		test(`focus with mode ${name} touches neither window nor application when hidden`, () => {
			const { window, show, focus } = createWindow(true);
			const notifyFocus = sinon.spy(window as unknown as { showNotifyFocus(): void }, 'showNotifyFocus');
			window.focus({ mode });

			assert.deepStrictEqual([notifyFocus.callCount, show.callCount, focus.callCount], [0, 0, 0]);
		});
	}
});
