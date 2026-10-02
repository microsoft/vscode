/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { app, BrowserWindow, ipcMain, Menu, net, protocol } from 'electron';
import { fileURLToPath } from 'url';
import { registerContextMenuListener } from '../../../electron-main/contextmenu.js';
import { CONTEXT_MENU_CHANNEL } from '../../../common/contextmenu.js';

// The ordinary unit-test renderer disables context isolation. Run this regression
// in a separate Electron app with the real product preload and IPC endpoints.
protocol.registerSchemesAsPrivileged([{ scheme: 'vscode-menu-test', privileges: { standard: true, secure: true, supportFetchAPI: true } }]);

const waitFor = async (predicate: () => boolean | Promise<boolean>) => {
	for (let attempt = 0; attempt < 200; attempt++) {
		if (await predicate()) {
			return;
		}
		await new Promise(resolve => setTimeout(resolve, 10));
	}
	throw new Error('Native menu lifecycle timed out');
};

async function run(): Promise<void> {
	const scenario = process.argv.find(arg => arg.startsWith('--scenario='))?.slice('--scenario='.length) ?? 'dismiss';
	const selected = scenario === 'select' || scenario === 'submenu';
	const iterations = scenario === 'repeat' ? 5 : 1;
	await app.whenReady();
	ipcMain.handle('vscode:test-menu-configuration', () => ({ userEnv: {}, zoomLevel: 0 }));
	ipcMain.handle('vscode:fetchShellEnv', () => ({}));
	protocol.handle('vscode-menu-test', request => {
		const url = new URL(request.url);
		if (url.pathname === '/index.html') {
			return new Response('<!DOCTYPE html><title>Native context menu test</title>');
		}
		return net.fetch(`file://${url.pathname}`);
	});

	let replyChannel = '';
	ipcMain.on(CONTEXT_MENU_CHANNEL, (_event, _id, _items, channel: string) => { replyChannel = channel; });
	registerContextMenuListener();
	let activeMenu: Menu | undefined;
	const originalPopup = Menu.prototype.popup;
	// Observe the native Menu instance without replacing its behavior. Closing it
	// uses Electron's real closePopup API and therefore the real close callback.
	Menu.prototype.popup = function (options) {
		activeMenu = this;
		return originalPopup.call(this, options);
	};
	const window = new BrowserWindow({
		show: true,
		webPreferences: {
			contextIsolation: true,
			sandbox: true,
			preload: fileURLToPath(new URL('../../../../sandbox/electron-browser/preload.js', import.meta.url)),
			additionalArguments: ['--vscode-window-config=vscode:test-menu-configuration']
		}
	});
	try {
		await window.loadURL('vscode-menu-test://vscode-app/index.html');
		const rendererModule = new URL('../../../electron-browser/contextmenu.js', import.meta.url);
		const rendererUrl = `vscode-menu-test://vscode-app${rendererModule.pathname}`;
		await window.webContents.executeJavaScript('globalThis.menuResult = { actions: [], hidden: 0 };');
		for (let iteration = 0; iteration < iterations; iteration++) {
			activeMenu = undefined;
			replyChannel = '';
			await window.webContents.executeJavaScript(`(async () => {
				const { popup } = await import(${JSON.stringify(rendererUrl)});
				popup([
					{ label: 'Action', click: event => { globalThis.menuResult.actions.push(['action', event.ctrlKey]); } },
					{ label: 'Submenu', submenu: [{ label: 'Nested action', click: event => { globalThis.menuResult.actions.push(['nested', event.ctrlKey]); } }] }
				], { x: 20, y: 20 }, () => { globalThis.menuResult.hidden++; });
			})()`);
			await waitFor(() => !!activeMenu && !!replyChannel);
			const menu = activeMenu!;
			if (selected) {
				const item = scenario === 'submenu' ? menu.items[1].submenu!.items[0] : menu.items[0];
				item.click({ ctrlKey: true }, window, window.webContents);
			}
			menu.closePopup(window);
			await waitFor(() => window.webContents.executeJavaScript(`globalThis.menuResult.hidden === ${iteration + 1}`));
			await window.webContents.executeJavaScript(`globalThis.menuBarrier = new Promise(resolve => vscode.ipcRenderer.once('vscode:test-menu-barrier', () => resolve())); undefined;`);
			window.webContents.send(replyChannel, 0, {});
			window.webContents.send('vscode:test-menu-barrier');
			const result = await window.webContents.executeJavaScript('globalThis.menuBarrier.then(() => globalThis.menuResult)');
			assert.deepStrictEqual(result, { actions: selected ? [[scenario === 'submenu' ? 'nested' : 'action', true]] : [], hidden: iteration + 1 });
		}
		console.log(`Native menu lifecycle passed: ${scenario}`);
	} finally {
		activeMenu = undefined;
		Menu.prototype.popup = originalPopup;
		window.destroy();
	}
}

run().then(() => app.exit(0), error => {
	console.error(error);
	app.exit(1);
});
