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
import { IBackgroundShowOptions, IWindowState, WindowMode } from '../../../window/electron-main/window.js';
import { release } from 'os';
import { BaseWindow } from '../../electron-main/windowImpl.js';

class TestWindow extends BaseWindow {
	readonly id = 1;

	onDidRequestFullScreen: ((fullscreen: boolean) => void) | undefined;

	override setWin(win: BrowserWindow, options?: BrowserWindowConstructorOptions): void {
		super.setWin(win, options);
	}

	override applyState(state: IWindowState, hasMultipleDisplays?: boolean, showInBackground?: IBackgroundShowOptions, minimized?: boolean): void {
		super.applyState(state, hasMultipleDisplays, showInBackground, minimized);
	}

	protected override setFullScreen(fullscreen: boolean): void {
		this.onDidRequestFullScreen?.(fullscreen);
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

suite('BaseWindow - restoring a window state', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	/**
	 * Applies the state to a window that was created hidden and returns the calls to
	 * the native window before and once the window gets focus for the first time.
	 */
	function restore(mode: WindowMode, options: { readonly inBackground?: boolean; readonly minimized?: boolean }): { beforeFocus: string[]; onFocus: string[] } {
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
			blur: () => calls.push('blur'),
			maximize: () => calls.push('maximize'),
			minimize: () => calls.push('minimize'),
		}));
		window.onDidRequestFullScreen = fullscreen => calls.push(`setFullScreen(${fullscreen})`);

		window.applyState({ mode }, false, options.inBackground ? { hideApplication: false } : undefined, options.minimized);
		const beforeFocus = calls.splice(0);
		for (const [event, listener] of on.args) {
			if (event === 'focus') {
				listener();
			}
		}

		return { beforeFocus, onFocus: calls };
	}

	test('shows windows without taking focus, and maximizes or enters full screen in the background once focused', () => {
		assert.deepStrictEqual({
			foregroundMaximized: restore(WindowMode.Maximized, {}),
			foregroundMinimized: restore(WindowMode.Normal, { minimized: true }),
			background: restore(WindowMode.Normal, { inBackground: true }),
			backgroundMaximized: restore(WindowMode.Maximized, { inBackground: true }),
			backgroundFullScreen: restore(WindowMode.Fullscreen, { inBackground: true }),
			backgroundMinimized: restore(WindowMode.Normal, { inBackground: true, minimized: true }),
		}, isMacintosh ? {
			foregroundMaximized: { beforeFocus: ['maximize', 'show'], onFocus: [] },
			foregroundMinimized: { beforeFocus: ['showInactive', 'minimize'], onFocus: [] },
			background: { beforeFocus: ['showInactive', 'blur'], onFocus: [] },
			backgroundMaximized: { beforeFocus: ['maximize', 'showInactive', 'blur'], onFocus: [] }, // maximizing a hidden window does not activate it on macOS
			backgroundFullScreen: { beforeFocus: ['maximize', 'showInactive', 'blur'], onFocus: ['setFullScreen(true)'] },
			backgroundMinimized: { beforeFocus: ['showInactive', 'blur', 'minimize'], onFocus: [] },
		} : {
			foregroundMaximized: { beforeFocus: ['maximize', 'show'], onFocus: [] },
			foregroundMinimized: { beforeFocus: ['showInactive', 'minimize'], onFocus: [] },
			background: { beforeFocus: ['showInactive'], onFocus: [] },
			backgroundMaximized: { beforeFocus: ['showInactive'], onFocus: ['maximize'] },
			backgroundFullScreen: { beforeFocus: ['showInactive'], onFocus: ['maximize', 'setFullScreen(true)'] },
			backgroundMinimized: { beforeFocus: ['showInactive', 'minimize'], onFocus: [] },
		});
	});
});
