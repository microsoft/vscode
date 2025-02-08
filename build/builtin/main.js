/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2025 EthicalCoder. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
// @ts-check

const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const url = require('url');
const path = require('path');

let window = null;

ipcMain.handle('pickdir', async () => {
	const result = await dialog.showOpenDialog(window, {
		title: 'Choose Folder',
		properties: ['openDirectory']
	});

	if (result.canceled || result.filePaths.length < 1) {
		return undefined;
	}

	return result.filePaths[0];
});

app.once('ready', () => {
	window = new BrowserWindow({
		width: 800,
		height: 600,
		webPreferences: {
			nodeIntegration: true,
			contextIsolation: false,
			enableWebSQL: false
		}
	});
	window.setMenuBarVisibility(false);
	window.loadURL(url.format({ pathname: path.join(__dirname, 'index.html'), protocol: 'file:', slashes: true }));
	// window.webContents.openDevTools();
	window.once('closed', () => window = null);
});

app.on('window-all-closed', () => app.quit());
