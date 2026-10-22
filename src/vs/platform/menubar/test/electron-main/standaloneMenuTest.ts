/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { app, Menu, type BrowserWindow, type KeyboardEvent, type MenuItem, type WebContents } from 'electron';
import { Emitter, Event } from '../../../../base/common/event.js';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { isMacintosh } from '../../../../base/common/platform.js';
import { URI } from '../../../../base/common/uri.js';
import { upcastPartial } from '../../../../base/test/common/mock.js';
import { IAuxiliaryWindow } from '../../../auxiliaryWindow/electron-main/auxiliaryWindow.js';
import { IAuxiliaryWindowsMainService } from '../../../auxiliaryWindow/electron-main/auxiliaryWindows.js';
import { IConfigurationService } from '../../../configuration/common/configuration.js';
import { TestConfigurationService } from '../../../configuration/test/common/testConfigurationService.js';
import { IEnvironmentMainService } from '../../../environment/electron-main/environmentMainService.js';
import { _util } from '../../../instantiation/common/instantiation.js';
import { TestInstantiationService } from '../../../instantiation/test/common/instantiationServiceMock.js';
import { ILifecycleMainService, ShutdownEvent, ShutdownReason } from '../../../lifecycle/electron-main/lifecycleMainService.js';
import { ILogService, NullLogService } from '../../../log/common/log.js';
import { INativeHostMainService } from '../../../native/electron-main/nativeHostMainService.js';
import { IProductService } from '../../../product/common/productService.js';
import { IStateService } from '../../../state/node/state.js';
import { ITelemetryService } from '../../../telemetry/common/telemetry.js';
import { NullTelemetryService } from '../../../telemetry/common/telemetryUtils.js';
import { IUpdateService, StateType } from '../../../update/common/update.js';
import { ICodeWindow } from '../../../window/electron-main/window.js';
import { IWindowsMainService } from '../../../windows/electron-main/windows.js';
import { IMenubarData } from '../../common/menubar.js';
import { Menubar } from '../../electron-main/menubar.js';

export interface IStandaloneMenuTestResult {
	ordinaryBefore: number;
	ordinaryAfter: number;
	stale: { renderer: number; picker: number; recent: number; newWindow: number; handledKeybinding: boolean };
	nativeActions: string[];
	nativeRoles: string[];
	nativeAccelerators: boolean[];
	workbenchItems: string[];
	rebuildOnAuxiliaryFocus: boolean;
}

/** Runs against real Electron menus in the isolated unit-test main process. */
export function testStandaloneWindowMenu(): IStandaloneMenuTestResult {
	/* eslint-disable local/code-no-bracket-notation-for-identifiers -- Exercise real native menu construction and dispatch without exposing test-only production APIs. */
	const store = new DisposableStore();
	const previousMenu = Menu.getApplicationMenu();
	const previousDockMenu = isMacintosh ? app.dock?.getMenu() : undefined;
	const shutdown = store.add(new Emitter<ShutdownEvent>());
	try {
		const instantiation = store.add(new TestInstantiationService());
		for (const dependency of _util.getServiceDependencies(Menubar as typeof Menubar & _util.DI_TARGET_OBJ)) {
			instantiation.stub(dependency.id, {});
		}
		const configuration = new TestConfigurationService({
			'window.titleBarStyle': 'native',
			'window.nativeTabs': true,
		});
		store.add(configuration.onDidChangeConfigurationEmitter);
		instantiation.stub(IConfigurationService, configuration);
		instantiation.stub(ILogService, store.add(new NullLogService()));
		instantiation.stub(IEnvironmentMainService, { args: { _: [] }, isBuilt: true });
		instantiation.stub(ITelemetryService, NullTelemetryService);
		instantiation.stub(IUpdateService, { state: { type: StateType.Uninitialized }, onStateChange: Event.None });
		instantiation.stub(ILifecycleMainService, { onWillShutdown: shutdown.event });
		instantiation.stub(IProductService, { nameShort: 'Native menu test', nameLong: 'Native menu test' });
		const data: IMenubarData = {
			menus: {
				File: {
					items: [
						{ id: 'workbench.action.files.newUntitledFile', label: 'New Text File' },
						{ id: 'workbench.action.files.openFolder', label: 'Open Folder' },
						{ id: 'openRecentFile', label: 'Recent File', uri: URI.file('/test/file') },
						{ id: 'workbench.action.closeWindow', label: 'Close Window' },
					]
				},
				Edit: { items: [{ id: 'undo', label: 'Undo' }] },
				View: { items: [{ id: 'workbench.action.splitEditorRight', label: 'Split Right' }] },
			},
			keybindings: {
				'workbench.action.files.newUntitledFile': { label: 'CmdOrCtrl+N', userSettingsLabel: 'cmd+n', isNative: true },
				'workbench.action.closeActiveEditor': { label: 'CmdOrCtrl+W', userSettingsLabel: 'cmd+w', isNative: true },
			},
		};
		instantiation.stub(IStateService, { getItem: () => data, setItem: () => { } });
		const focus = store.add(new Emitter<number>());
		let renderer = 0;
		let picker = 0;
		let recent = 0;
		let newWindow = 0;
		instantiation.stub(INativeHostMainService, {
			onDidFocusMainOrAuxiliaryWindow: focus.event,
			onDidBlurMainOrAuxiliaryWindow: Event.None,
			pickFolderAndOpen: async () => { picker++; },
		});
		const source = upcastPartial<ICodeWindow>({
			id: 5,
			isReady: true,
			win: upcastPartial<BrowserWindow>({ id: 5, isMinimized: () => true }),
			sendWhenReady: () => { renderer++; },
		});
		instantiation.stub(IWindowsMainService, {
			getWindowCount: () => 1,
			getWindowById: () => source,
			getLastActiveWindow: () => source,
			onDidChangeWindowsCount: Event.None,
			openEmptyWindow: async () => { newWindow++; return []; },
			open: async () => { recent++; return [source]; },
		});
		let isolated = false;
		const nativeActions: string[] = [];
		const nativeWindow = upcastPartial<BrowserWindow>({
			isDestroyed: () => false,
			close: () => { nativeActions.push('close'); },
			webContents: upcastPartial<WebContents>({
				undo: () => { nativeActions.push('undo'); },
				redo: () => { nativeActions.push('redo'); },
				cut: () => { nativeActions.push('cut'); },
				copy: () => { nativeActions.push('copy'); },
				paste: () => { nativeActions.push('paste'); },
				selectAll: () => { nativeActions.push('selectAll'); },
			}),
		});
		const auxiliary = upcastPartial<IAuxiliaryWindow>({ parentId: 5, win: nativeWindow, get disableWorkbenchMenu() { return isolated; } });
		instantiation.stub(IAuxiliaryWindowsMainService, {
			getFocusedWindow: () => auxiliary,
			getWindowByWebContents: () => auxiliary,
			getWindows: () => [],
		});
		const menubar = store.add(instantiation.createInstance(Menubar));
		menubar['onDidChangeWindowFocus']();
		menubar['menuUpdater'].cancel();
		menubar['install']();
		const fileItems = Menu.getApplicationMenu()!.items.find(item => item.label === 'File')!.submenu!.items;
		const newText = fileItems.find(item => item.label === 'New Text File')!;
		const folder = fileItems.find(item => item.label === 'Open Folder')!;
		const recentFile = fileItems.find(item => item.label === 'Recent File')!;
		const split = menubar['createMenuItem']('Split Right', 'workbench.action.splitEditorRight', true);
		const event = upcastPartial<KeyboardEvent>({ triggeredByAccelerator: true });
		const click = (item: MenuItem) => item.click(item, undefined, event);
		click(newText);
		const ordinaryBefore = renderer;
		renderer = 0;

		isolated = true;
		focus.fire(15);
		const rebuildOnAuxiliaryFocus = menubar['menuUpdater'].isScheduled();
		menubar['menuUpdater'].cancel();
		// Old menu objects can still dispatch before the asynchronously scheduled replacement.
		for (const item of [newText, folder, recentFile, split]) {
			click(item);
		}
		const handledKeybinding = menubar['runActionInRenderer']({ type: 'keybinding', userSettingsLabel: 'cmd+n' });
		const stale = { renderer, picker, recent, newWindow, handledKeybinding };
		for (const commandId of ['undo', 'redo', 'editor.action.clipboardCutAction', 'editor.action.clipboardCopyAction', 'editor.action.clipboardPasteAction', 'editor.action.selectAll', 'workbench.action.closeActiveEditor', 'workbench.action.closeWindow']) {
			menubar['runActionInRenderer']({ type: 'commandId', commandId });
		}
		menubar['install']();
		const menu = Menu.getApplicationMenu()!;
		const nativeItems = isMacintosh ? menu.items
			.filter(item => item.label === 'File' || item.label === 'Edit')
			.flatMap(item => item.submenu!.items.filter(item => item.type !== 'separator' && item.enabled)) : [];
		const nativeRoles = nativeItems.map(item => item.role!);
		const nativeAccelerators = nativeItems.map(item => item.registerAccelerator);
		const workbenchItems = menu.items.flatMap(item => item.submenu?.items ?? []).filter(item => ['New Text File', 'Open Folder', 'Recent File'].includes(item.label)).map(item => item.label);

		isolated = false;
		focus.fire(15);
		menubar['menuUpdater'].cancel();
		menubar['install']();
		click(newText);
		const ordinaryAfter = renderer;
		return { ordinaryBefore, ordinaryAfter, stale, nativeActions, nativeRoles, nativeAccelerators, workbenchItems, rebuildOnAuxiliaryFocus };
	} finally {
		shutdown.fire({ reason: ShutdownReason.QUIT, join: () => { } });
		store.dispose();
		Menu.setApplicationMenu(previousMenu);
		if (isMacintosh) {
			app.dock?.setMenu(previousDockMenu ?? new Menu());
		}
	}
}
