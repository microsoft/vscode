/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { strictEqual } from 'assert';
import { Menu, BrowserWindow } from 'electron';
import { isMacintosh } from '../../../../base/common/platform.js';
import { Menubar } from '../../electron-main/menubar.js';
import { NullLogService } from '../../../log/common/log.js';
import product from '../../../product/common/product.js';
import { IProductService } from '../../../product/common/productService.js';
import { Event } from '../../../../base/common/event.js';
import { IWindowsMainService } from '../../../windows/electron-main/windows.js';
import { IUpdateService, StateType } from '../../../update/common/update.js';
import { IConfigurationService } from '../../../configuration/common/configuration.js';
import { IEnvironmentMainService } from '../../../environment/electron-main/environmentMainService.js';
import { ITelemetryService } from '../../../telemetry/common/telemetry.js';
import { IWorkspacesHistoryMainService } from '../../../workspaces/electron-main/workspacesHistoryMainService.js';
import { IStateService } from '../../../state/node/state.js';
import { ILifecycleMainService, LifecycleMainPhase } from '../../../lifecycle/electron-main/lifecycleMainService.js';
import { INativeHostMainService } from '../../../native/electron-main/nativeHostMainService.js';
import { IAuxiliaryWindowsMainService } from '../../../auxiliaryWindow/electron-main/auxiliaryWindows.js';

if (isMacintosh) {
suite('Menubar (macOS)', function () {

	test('Quit menu has Command+Q accelerator when no windows are open', function () {

		// Stubs
		const updateService: IUpdateService = {
			_serviceBrand: undefined,
			onStateChange: Event.None,
			state: { type: StateType.Idle } as any,
			isLatestVersion: async () => true,
			checkForUpdates: async () => undefined,
			downloadUpdate: async () => undefined,
			applyUpdate: async () => undefined,
			quitAndInstall: async () => undefined,
			setUpdateFeedUrl: () => undefined,
			getUpdateType: () => undefined
		} as any;

		const configurationService: IConfigurationService = {
			_serviceBrand: undefined,
			onDidChangeConfiguration: Event.None,
			getValue: () => undefined,
			updateValue: async () => undefined,
			reloadConfiguration: async () => undefined,
			inspect: () => undefined as any
		} as any;

		const windowsMainService: IWindowsMainService = {
			_serviceBrand: undefined,
			onDidOpenWindow: Event.None,
			onDidChangeWindowsCount: Event.None,
			getWindowCount: () => 0,
			getLastActiveWindow: () => undefined,
			getWindowById: () => undefined as any,
			getFocusedWindow: () => undefined as any,
			open: async () => [],
			openEmptyWindow: async () => undefined,
			focusLastActive: () => undefined,
			sendToFocused: () => undefined,
			ready: async () => undefined,
			openAdditionalWindow: async () => undefined,
			onDidTriggerSystemContextMenu: Event.None
		} as any;

		const environmentMainService: IEnvironmentMainService = {
			_serviceBrand: undefined,
			args: {} as any,
			isBuilt: true
		} as any;

		const telemetryService: ITelemetryService = {
			_serviceBrand: undefined,
			publicLog2: () => undefined
		} as any;

		const workspacesHistoryMainService: IWorkspacesHistoryMainService = {
			_serviceBrand: undefined,
			clearRecentlyOpened: async () => undefined,
			removeRecentlyOpened: async () => undefined
		} as any;

		const stateService: IStateService = {
			_serviceBrand: undefined,
			getItem: () => undefined,
			setItem: () => undefined,
			setItems: () => undefined,
			removeItem: () => undefined,
			close: async () => undefined
		};

		const lifecycleMainService: ILifecycleMainService = {
			_serviceBrand: undefined,
			onBeforeShutdown: Event.None,
			onWillShutdown: Event.None,
			onWillLoadWindow: Event.None,
			onBeforeCloseWindow: Event.None,
			wasRestarted: false,
			quitRequested: false,
			phase: LifecycleMainPhase.Ready,
			registerWindow: () => undefined,
			registerAuxWindow: () => undefined,
			reload: async () => undefined,
			unload: async () => false,
			relaunch: async () => undefined,
			setRelaunchHandler: () => undefined,
			quit: async () => false,
			kill: async () => undefined,
			when: async () => undefined
		};

		const nativeHostMainService: INativeHostMainService = {
			_serviceBrand: undefined,
			showMessageBox: async () => ({ response: 0, checkboxChecked: false } as any)
		} as any;

		const productService: IProductService = { _serviceBrand: undefined, ...product };

		const auxiliaryWindowsMainService: IAuxiliaryWindowsMainService = {
			_serviceBrand: undefined,
			getWindows: () => [],
			getWindowByWebContents: () => undefined as any,
			onDidTriggerSystemContextMenu: Event.None,
			onDidChangeAlwaysOnTop: Event.None,
			onDidMaximizeWindow: Event.None,
			onDidUnmaximizeWindow: Event.None,
			onDidChangeFullScreen: Event.None
		} as any;

		// Ensure no focused BrowserWindow to simulate no window case
		try { BrowserWindow.getFocusedWindow()?.blur(); } catch { /* noop */ }

		// Instantiate Menubar (constructor installs menu)
		new Menubar(
			updateService,
			configurationService,
			windowsMainService,
			environmentMainService,
			telemetryService,
			workspacesHistoryMainService,
			stateService,
			lifecycleMainService,
			new NullLogService(),
			nativeHostMainService,
			productService,
			auxiliaryWindowsMainService
		);

		const appMenu = Menu.getApplicationMenu();
		strictEqual(!!appMenu, true);

		// The first item is the macOS application menu
		const macAppMenu = appMenu!.items[0];
		let hasCmdQ = false;
		for (const item of macAppMenu.submenu!.items) {
			if (item.accelerator === 'Command+Q') {
				hasCmdQ = true;
				break;
			}
		}

		strictEqual(hasCmdQ, true);
	});
});
}


