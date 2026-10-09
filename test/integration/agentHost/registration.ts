/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

const electron: typeof import('electron') = require('electron');
const fs: typeof import('node:fs') = require('node:fs');
const path: typeof import('node:path') = require('node:path');
const urls: typeof import('node:url') = require('node:url');
const assert: typeof import('node:assert/strict') = require('node:assert/strict');

interface IRegistration {
	total: number;
	suites: { title: string; tests: number }[];
}

const output = process.env.AGENT_HOST_REGISTRATION_OUTPUT;
assert.ok(output, 'Registration probe requires an owned output file');
assert.ok(__dirname.endsWith(path.join('test', 'unit', 'electron')), 'Registration probe must use the standard Electron app directory');
const rootUrl = urls.pathToFileURL(path.resolve(__dirname, '../../..') + path.sep).href;

electron.ipcMain.on('start', event => {
	void event.sender.executeJavaScript(`({
		total: mocha.suite.total(),
		suites: mocha.suite.suites.map(suite => ({ title: suite.title, tests: suite.total() }))
	})`).then((registration: IRegistration) => {
		fs.writeFileSync(output, JSON.stringify(registration));
		console.log(JSON.stringify({ gate: 'registered-entrypoint', registration }));
	}, error => {
		console.error(JSON.stringify({ gate: 'registered-entrypoint', result: 'failed', error: String(error) }));
	});
});
electron.app.on('browser-window-created', (_event, window) => {
	window.webContents.session.webRequest.onErrorOccurred(details => {
		if (details.url.startsWith(rootUrl)) {
			console.error(JSON.stringify({ gate: 'renderer-module-load', url: details.url, error: details.error }));
		}
	});
});

require('./index.js');
