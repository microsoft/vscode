/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// @ts-check
(function () {
	'use strict';

	const { ipcRenderer, webFrame, contextBridge, webUtils } = require('electron');

	const globals = {

		ipcRenderer: {

			send(channel, ...args) {
				ipcRenderer.send(channel, ...args);
			},

			invoke(channel, ...args) {
				return ipcRenderer.invoke(channel, ...args);
			},

			on(channel, listener) {
				ipcRenderer.on(channel, listener);

				return this;
			},

			once(channel, listener) {
				ipcRenderer.once(channel, listener);

				return this;
			},

			removeListener(channel, listener) {
				ipcRenderer.removeListener(channel, listener);

				return this;
			}
		},

		webFrame: {

			setZoomLevel(level) {
				if (typeof level === 'number') {
					webFrame.setZoomLevel(level);
				}
			}
		},

		webUtils: {

			getPathForFile(file) {
				return webUtils.getPathForFile(file);
			}
		},

		process: {
			get platform() { return process.platform; },
			get arch() { return process.arch; },
			get env() { return { ...process.env }; },
			get versions() { return process.versions; },
			get type() { return 'renderer'; },
			get execPath() { return process.execPath; },

			cwd() {
				return process.env['VSCODE_CWD'] || process.execPath.substr(0, process.execPath.lastIndexOf(process.platform === 'win32' ? '\\' : '/'));
			},

			getProcessMemoryInfo() {
				return process.getProcessMemoryInfo();
			},

			on(type, callback) {
				// @ts-ignore
				process.on(type, callback);
			}
		},
	};

	if (process.contextIsolated) {
		try {
			contextBridge.exposeInMainWorld('vscode', globals);
		} catch (error) {
			console.error(error);
		}
	} else {
		// @ts-ignore
		window.vscode = globals;
	}
}());
