/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import type { BrowserWindow, BrowserWindowConstructorOptions, WebContents } from 'electron';
import sinon from 'sinon';
import { isMacintosh } from '../../../../base/common/platform.js';
import { upcastPartial } from '../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { TestConfigurationService } from '../../../configuration/test/common/testConfigurationService.js';
import { IEnvironmentMainService } from '../../../environment/electron-main/environmentMainService.js';
import { NullLogService } from '../../../log/common/log.js';
import { InMemoryTestStateMainService } from '../../../test/electron-main/workbenchTestServices.js';
import { DEFAULT_CUSTOM_TITLEBAR_HEIGHT, getMacOSWindowControlsPosition } from '../../../window/common/window.js';
import { release } from 'os';
import { URI } from '../../../../base/common/uri.js';
import { NativeParsedArgs } from '../../../environment/common/argv.js';
import { FocusMode } from '../../../native/common/native.js';
import { IWindowState, WindowMode } from '../../../window/electron-main/window.js';
import { BaseWindow } from '../../electron-main/windowImpl.js';
import { isHiddenWindowMode } from '../../electron-main/windows.js';

class TestWindow extends BaseWindow {
	readonly id = 1;

	override setWin(win: BrowserWindow, options?: BrowserWindowConstructorOptions): void {
		super.setWin(win, options);
	}

	override applyState(state: IWindowState, hasMultipleDisplays?: boolean): void {
		super.applyState(state, hasMultipleDisplays);
	}

	matches(_webContents: WebContents): boolean {
		return false;
	}
}

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
		const nativeWindow = upcastPartial<BrowserWindow>({
			on,
			removeListener,
			setSheetOffset: sinon.stub(),
			isMinimized: () => false,
			maximize,
			show,
			focus,
			webContents: upcastPartial<WebContents>({ focus: focusWebContents }),
		});
		window.setWin(nativeWindow);
		return { window, maximize, show, focus, focusWebContents };
	}

	for (const hidden of [false, true]) {
		test(`applyState ${hidden ? 'neither maximizes nor shows' : 'maximizes and shows'} a maximized window (hidden: ${hidden})`, () => {
			const { window, maximize, show } = createWindow(hidden);
			window.applyState({ mode: WindowMode.Maximized }, false);

			assert.deepStrictEqual([maximize.callCount, show.callCount], hidden ? [0, 0] : [1, 1]);
		});

		test(`focus ${hidden ? 'is ignored' : 'focuses the window'} (hidden: ${hidden})`, () => {
			const { window, focus, focusWebContents } = createWindow(hidden);
			window.focus({ mode: FocusMode.Transfer });

			assert.deepStrictEqual([focus.callCount, focusWebContents.callCount], hidden ? [0, 0] : [1, 1]);
		});
	}

	test('applyState neither maximizes, enters fullscreen nor shows a fullscreen window when hidden', () => {
		const { window, maximize, show } = createWindow(true);
		const setFullScreen = sinon.stub(window as unknown as { setFullScreen(fullscreen: boolean, fromRestore: boolean): void }, 'setFullScreen');
		window.applyState({ mode: WindowMode.Fullscreen }, false);

		assert.deepStrictEqual([maximize.callCount, setFullScreen.callCount, show.callCount], [0, 0, 0]);
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
