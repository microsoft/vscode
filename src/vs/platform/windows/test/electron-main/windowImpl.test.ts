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
import { DEFAULT_CUSTOM_TITLEBAR_HEIGHT } from '../../../window/common/window.js';
import { BaseWindow } from '../../electron-main/windowImpl.js';

class TestWindow extends BaseWindow {
	readonly id = 1;

	override setWin(win: BrowserWindow, options?: BrowserWindowConstructorOptions): void {
		super.setWin(win, options);
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
		const on = sinon.stub();
		const removeListener = sinon.stub();
		const nativeWindow = upcastPartial<BrowserWindow>({
			on,
			removeListener,
			setSheetOffset: sinon.stub(),
			setWindowButtonPosition: sinon.stub(),
			setTitleBarOverlay,
		});
		return { window, nativeWindow, configurationService, setTitleBarOverlay };
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
});
