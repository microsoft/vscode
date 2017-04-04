/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

const { app, BrowserWindow, ipcMain } = require('electron');
const { tmpdir } = require('os');
const { join } = require('path');

const optimist = require('optimist')
	.describe('grep', 'only run tests matching <pattern>').string('grep').alias('grep', 'g').string('g')
	.describe('run', 'only run tests from <file>').string('run')
	.describe('runGrep', 'only run tests matching <file_pattern>').boolean('runGrep')
	.describe('build', 'run with build output (out-build)').boolean('build')
	.describe('coverage', 'generate coverage report').boolean('coverage')
	.describe('debug', 'open dev tools, keep window open, reuse app data').string('debug');

const argv = optimist.argv;

if (!argv.debug) {
	app.setPath('userData', join(tmpdir(), `vscode-tests-${Date.now()}`));
}

app.on('ready', () => {

	const win = new BrowserWindow({
		height: 600,
		width: 800,
		show: false,
		webPreferences: {
			backgroundThrottling: false,
			webSecurity: false
		}
	});

	win.webContents.on('did-finish-load', () => {
		if (argv.debug) {
			win.show();
			win.webContents.openDevTools('right');
		}
		win.webContents.send('run', argv);
	});

	win.loadURL(`file://${__dirname}/renderer.html`);


	const _failures = [];
	ipcMain.on('fail', (e, test) => {
		_failures.push(test);
		process.stdout.write('X');
	});
	ipcMain.on('pass', () => {
		process.stdout.write('.');
	});

	ipcMain.on('done', () => {

		console.log(`\nDone with ${_failures.length} failures.\n`);

		for (const fail of _failures) {
			console.error(fail.title);
			console.error(fail.stack);
			console.error('\n');
		}

		if (!argv.debug) {
			app.exit(_failures.length > 0 ? 1 : 0);
		}
	});
});
