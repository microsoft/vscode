/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

const electron: typeof import('electron') = require('electron');
const fs: typeof import('node:fs') = require('node:fs');
const path: typeof import('node:path') = require('node:path');
const urls: typeof import('node:url') = require('node:url');
const assert: typeof import('node:assert/strict') = require('node:assert/strict');

const output = process.env.AGENT_HOST_OSS_REGISTRATION_OUTPUT;
assert.ok(output, 'Supply the owned registration output path');
assert.ok(__dirname.endsWith(path.join('test', 'unit', 'electron')), 'Use the standard Electron bootstrap directory');
const rootUrl = urls.pathToFileURL(path.resolve(__dirname, '../../..') + path.sep).href;

electron.ipcMain.on('start', event => {
	void event.sender.executeJavaScript(`({
		total: mocha.suite.total(),
		suites: mocha.suite.suites.map(suite => ({ title: suite.title, tests: suite.total() }))
	})`).then(registration => {
		fs.writeFileSync(output, JSON.stringify(registration));
		console.log(JSON.stringify({ gate: 'actual-registration', registration }));
	}, error => {
		console.error(JSON.stringify({ gate: 'actual-registration', result: 'failed', error: String(error) }));
	});
});
electron.app.on('browser-window-created', (_event, window) => {
	window.webContents.session.webRequest.onErrorOccurred(details => {
		if (details.url.startsWith(rootUrl)) {
			console.error(JSON.stringify({ gate: 'module-load', url: details.url, error: details.error }));
		}
	});
});
require('./index.js');
