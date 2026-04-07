/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

//@ts-check

const electron = require('electron');
const child_process = require('child_process');
const path = require('path');

const app = electron.app;

/**
 * @type {Electron.BrowserWindow | null}
 * The main window of the Electron application.
 */
let mainWindow = null;

function createWindow() {
	const { width, height } = electron.screen.getPrimaryDisplay().workAreaSize;
	mainWindow = new electron.BrowserWindow({
		width: width * 0.75,
		height: height,
		webPreferences: {
			nodeIntegration: true,
			contextIsolation: false
		}
	});
	mainWindow.loadURL(`file://${__dirname}/simulationWorkbench.html`);
	mainWindow.on('closed', function () {
		mainWindow = null;
	});
}

app.on('ready', () => {
	if (process.argv.includes('--help')) {
		console.log(`Options:
  --run-dir=DIRNAME  Provide the run output directory name, e.g., 'out-20231201-151346'.
  --grep=STRING      Pre-populates simulation workbench 'grep' input box.`);
		app.quit();
	}
	registerListeners();
	createWindow();
});

app.on('window-all-closed', function () {
	if (process.platform !== 'darwin') {
		app.quit();
	}
});

app.on('activate', function () {
	if (mainWindow === null) {
		createWindow();
	}
});

// change to configure logging, e.g., to `console.debug`
const log = {
	debug: (..._args) => { }
};

function registerListeners() {

	/** @type {Map<string, child_process.ChildProcess>} */
	const spawnedProcesses = new Map();

	/**
	 * Spawns a new child process and sets up listeners for its stdout, stderr, and exit events.
	 *
	 * @param {Object} event - The event object from the Electron IPC.
	 * @param {Object} options - The options for the child process.
	 * @param {string} options.id - The unique identifier for the child process created by the renderer process.
	 * @param {Array<string>} options.processArgs - The arguments to pass to the child process.
	 */
	function spawnProcess(event, { id, processArgs }) {

		log.debug(`main process: spawn-process (id: ${id}, processArgs: ${JSON.stringify(processArgs)})`);

		const child = child_process.spawn(
			'node',
			[path.join(__dirname, '../../dist', 'simulationMain.js'), ...processArgs],
			{ stdio: 'pipe' }
		);
		if (child.pid) {
			child.stdout.setEncoding('utf8');
			child.stdout.on('data', (data) => {
				log.debug(`main process: stdout: ${data.toString()}`);
				event.sender.send('stdout-data', { id, data });
			});
			child.stderr.setEncoding('utf8');
			child.stderr.on('data', (data) => {
				log.debug(`main process: stderr: ${data.toString()}`);
				event.sender.send('stderr-data', { id, data });
			});
			child.on('exit', (code) => {
				log.debug('main process: ' + JSON.stringify(code, null, '\t'));
				spawnedProcesses.delete(id);
				event.sender.send('process-exit', { id, code });
			});
			spawnedProcesses.set(id, child);
		}
	}

	electron.ipcMain.on('spawn-process', spawnProcess);

	electron.ipcMain.on('kill-process', (_event, { id }) => {
		spawnedProcesses.get(id)?.kill('SIGTERM');
		spawnedProcesses.delete(id);
	});

	electron.ipcMain.on('open-link', (_event, url) => {
		electron.shell.openExternal(url);
	});

	electron.ipcMain.handle('processArgv', () => {
		return process.argv;
	});
}
